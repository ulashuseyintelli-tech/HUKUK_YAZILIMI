import { Injectable, Logger, BadRequestException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientPayoutDto } from './dto/create-client-payout.dto';

const ZERO = new Prisma.Decimal(0);

export interface CreatePayoutResult {
  created: boolean;
  payoutId: string;
  idempotentReplay?: boolean;
}

/**
 * TM3 M3 — Müvekkile Ödeme (ClientPayout).
 *
 * CLIENT_PAYABLE (proceeds) borcunun fiili kapatılması. `ClientPayout` LEDGER DEĞİLDİR —
 * proceeds settlement kaydıdır. D1: payout `ClientPayout` + ekstre `CLIENT_PAYOUT_SENT` (debit);
 * `BalanceLedger`'a YAZILMAZ (BalanceLedgerType.PAYOUT YOK).
 *
 * Outstanding (per caseClientId, scoped tenant+case+caseClientId+currency):
 *   Σ POSTED CollectionDispositionLine.CLIENT_PAYABLE (underlying Collection CONFIRMED)
 *   − Σ RECORDED ClientPayout
 *
 * Güvenlik: caseClientId tenant+case+role (ALACAKLI/ORTAK_ALACAKLI) doğrulanır; idempotencyKey
 * tenant-scoped @@unique; concurrency advisory-lock (pg_advisory_xact_lock, scope=tenant+case+
 * caseClientId+currency) → eşzamanlı over-payout engellenir (outstanding lock altında re-hesaplanır).
 */
@Injectable()
export class ClientPayoutService {
  private readonly logger = new Logger(ClientPayoutService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Çağrıldığı yerler:
   *  - ClientPayoutController.create() → POST /client-payouts
   */
  async create(tenantId: string, dto: CreateClientPayoutDto, actor?: { userId?: string }): Promise<CreatePayoutResult> {
    const userId = actor?.userId;
    if (!userId) throw new BadRequestException('actor (req.user.id) yok — payout kaydedilemez');
    if (!dto?.idempotencyKey) throw new BadRequestException('idempotencyKey zorunlu');
    let amount: Prisma.Decimal;
    try {
      amount = new Prisma.Decimal(dto.amount as Prisma.Decimal.Value);
    } catch {
      throw new BadRequestException('geçersiz tutar');
    }
    if (amount.lte(0)) throw new BadRequestException('tutar pozitif olmalı');
    const currency = dto.currency || 'TRY';

    // caseClientId doğrulama (M2 deseni): tenant+case+role. clientId ile authz YOK.
    const cc = await this.prisma.caseClient.findFirst({
      where: { id: dto.caseClientId, caseId: dto.caseId, role: { in: ['ALACAKLI', 'ORTAK_ALACAKLI'] }, client: { tenantId } },
      select: { id: true },
    });
    if (!cc) {
      throw new BadRequestException('caseClientId geçersiz/yabancı veya uygun rolde değil (ALACAKLI/ORTAK_ALACAKLI)');
    }

    // Idempotent replay (lock öncesi hızlı yol): aynı (tenant, idempotencyKey) varsa same-result.
    const existing = await this.prisma.clientPayout.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
      select: { id: true },
    });
    if (existing) return { created: false, payoutId: existing.id, idempotentReplay: true };

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Concurrency guard: advisory xact lock (scope tenant+case+caseClientId+currency) → aynı
        // alacaklı için eşzamanlı payout'lar SERIALIZE olur; outstanding lock altında tekrar hesaplanır.
        const lockKey = `payout:${tenantId}:${dto.caseId}:${dto.caseClientId}:${currency}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        // Idempotent re-check (lock altında, race)
        const dup = await tx.clientPayout.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
          select: { id: true },
        });
        if (dup) return { created: false, payoutId: dup.id, idempotentReplay: true };

        const outstanding = await this.computeOutstanding(tx, tenantId, dto.caseId, dto.caseClientId, currency);
        if (amount.gt(outstanding)) {
          throw new BadRequestException(`payout (${amount.toString()}) outstanding'i (${outstanding.toString()}) aşamaz`);
        }

        const payout = await tx.clientPayout.create({
          data: {
            tenantId,
            caseId: dto.caseId,
            caseClientId: dto.caseClientId,
            amount,
            currency,
            status: 'RECORDED',
            idempotencyKey: dto.idempotencyKey,
            paidById: userId,
            note: dto.note ?? null,
          },
          select: { id: true },
        });
        this.logger.log(`ClientPayout RECORDED: ${payout.id} (caseClient=${dto.caseClientId}, amount=${amount.toString()})`);
        return { created: true, payoutId: payout.id };
      });
    } catch (e: unknown) {
      // idempotencyKey race → unique violation → idempotent replay
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        const row = await this.prisma.clientPayout.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
          select: { id: true },
        });
        if (row) return { created: false, payoutId: row.id, idempotentReplay: true };
      }
      throw e;
    }
  }

  /**
   * Outstanding payable (per caseClientId): Σ POSTED CLIENT_PAYABLE (underlying Collection CONFIRMED)
   * − Σ RECORDED ClientPayout. Scope tenant+case+caseClientId+currency. HELD/fee/firm/offset/other DAHİL DEĞİL.
   */
  private async computeOutstanding(
    tx: Prisma.TransactionClient,
    tenantId: string,
    caseId: string,
    caseClientId: string,
    currency: string,
  ): Promise<Prisma.Decimal> {
    const payableLines = await tx.collectionDispositionLine.findMany({
      where: {
        type: 'CLIENT_PAYABLE',
        caseClientId,
        disposition: { tenantId, caseId, currency, status: 'POSTED' },
      },
      select: { amount: true, disposition: { select: { collectionId: true } } },
    });

    // underlying Collection CONFIRMED filtresi (posting sonrası iptal edilen tahsilatın payable'ı sayılmaz)
    const collectionIds = [...new Set(payableLines.map((l) => l.disposition.collectionId))];
    let confirmed = new Set<string>();
    if (collectionIds.length > 0) {
      const rows = await tx.collection.findMany({
        where: { id: { in: collectionIds }, tenantId, caseId, status: 'CONFIRMED' },
        select: { id: true },
      });
      confirmed = new Set(rows.map((r) => r.id));
    }
    let payable = ZERO;
    for (const l of payableLines) {
      if (confirmed.has(l.disposition.collectionId)) payable = payable.plus(l.amount);
    }

    const paidAgg = await tx.clientPayout.aggregate({
      _sum: { amount: true },
      where: { tenantId, caseId, caseClientId, currency, status: 'RECORDED' },
    });
    const paid = paidAgg._sum.amount ?? ZERO;

    return payable.minus(paid);
  }
}

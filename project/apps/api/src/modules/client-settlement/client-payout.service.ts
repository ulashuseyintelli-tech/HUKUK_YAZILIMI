import { Injectable, Logger, BadRequestException, ConflictException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { CreateClientPayoutDto } from './dto/create-client-payout.dto';
import { ClientSettlementReadService } from './client-settlement-read.service';

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

  constructor(
    private readonly prisma: PrismaService,
    private readonly readService: ClientSettlementReadService,
  ) {}

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

    // caseClientId doğrulama (ortak read-service): tenant+case+role. clientId ile authz YOK.
    await this.readService.assertEligibleCaseClient(tenantId, dto.caseId, dto.caseClientId);

    // Idempotent replay (lock öncesi hızlı yol): aynı (tenant, idempotencyKey).
    // AYNI payload → replay; FARKLI payload → ConflictException (sessiz eski-payout dönme YOK).
    const existing = await this.prisma.clientPayout.findUnique({
      where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
      select: { id: true, caseId: true, caseClientId: true, amount: true, currency: true },
    });
    if (existing) return this.replayOrConflict(existing, dto, amount, currency);

    try {
      return await this.prisma.$transaction(async (tx) => {
        // Concurrency guard: advisory xact lock (scope tenant+case+caseClientId+currency) → aynı
        // alacaklı için eşzamanlı payout'lar SERIALIZE olur; outstanding lock altında tekrar hesaplanır.
        const lockKey = `payout:${tenantId}:${dto.caseId}:${dto.caseClientId}:${currency}`;
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${lockKey}))`;

        // Idempotent re-check (lock altında, race) — payload-conflict guard ile.
        const dup = await tx.clientPayout.findUnique({
          where: { tenantId_idempotencyKey: { tenantId, idempotencyKey: dto.idempotencyKey } },
          select: { id: true, caseId: true, caseClientId: true, amount: true, currency: true },
        });
        if (dup) return this.replayOrConflict(dup, dto, amount, currency);

        const outstanding = await this.readService.computeOutstanding(tx, tenantId, dto.caseId, dto.caseClientId, currency);
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
          select: { id: true, caseId: true, caseClientId: true, amount: true, currency: true },
        });
        if (row) return this.replayOrConflict(row, dto, amount, currency);
      }
      throw e;
    }
  }

  /**
   * Aynı (tenant, idempotencyKey): payload (caseId/caseClientId/amount/currency) eşleşiyorsa
   * idempotent replay (existing payout); FARKLIYSA ConflictException — sessiz eski-payout dönme YOK
   * (finansal güvenlik: çağıran 500 ödediğini sanıp 300'lük eski kaydı almasın).
   */
  private replayOrConflict(
    existing: { id: string; caseId: string; caseClientId: string; amount: Prisma.Decimal; currency: string },
    dto: CreateClientPayoutDto,
    amount: Prisma.Decimal,
    currency: string,
  ): CreatePayoutResult {
    const same =
      existing.caseId === dto.caseId &&
      existing.caseClientId === dto.caseClientId &&
      existing.currency === currency &&
      existing.amount.equals(amount);
    if (!same) {
      throw new ConflictException({
        code: 'IDEMPOTENCY_KEY_CONFLICT',
        message: 'Aynı idempotencyKey farklı payload ile kullanıldı (amount/caseId/caseClientId/currency)',
      });
    }
    return { created: false, payoutId: existing.id, idempotentReplay: true };
  }

}

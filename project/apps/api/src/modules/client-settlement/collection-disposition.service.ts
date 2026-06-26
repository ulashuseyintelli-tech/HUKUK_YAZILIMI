import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';

export interface CreateDraftResult {
  created: boolean;
  dispositionId?: string;
  skipped?: string;
}

/**
 * TM3 M1 — Müvekkil Settlement Bridge (Claude domaini).
 *
 * Borçlu tahsilatı (Collection / CODEX) ile müvekkil dağıtımı arasındaki köprünün
 * TÜKETİCİ tarafı: PAYMENT_RECEIVED outbox event'inden HELD_PENDING_DISTRIBUTION
 * disposition TASLAĞI üretir. OTOMATİK DAĞITIM YOK (müvekkile pay/ücret kararı M2, kullanıcı onayı).
 *
 * Sınır (boundary §1-11):
 *  - Collection canonical DB'den okunur (payload'a güvenilmez); tenantId Collection'dan türetilir.
 *  - clientId YOK → caseClientId (tek alacaklı) veya CASE_CREDITOR_CLUSTER (çoklu).
 *  - Legal allocation YENİDEN HESAPLANMAZ (LedgerAllocation = CODEX legal SoT).
 *  - ClientStatement/BalanceLedger/payout YAZILMAZ (M2/M3).
 *  - Idempotent: collectionId @unique; unique-race güvenli skip.
 */
@Injectable()
export class CollectionDispositionService {
  private readonly logger = new Logger(CollectionDispositionService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Çağrıldığı yerler:
   *  - PaymentReceivedRegistrar → ActionHandlerService 'EVENT_PUBLISHED:PAYMENT_RECEIVED' handler
   */
  async createDraftFromPaymentReceived(
    payload: Record<string, any>,
    caseId: string,
  ): Promise<CreateDraftResult> {
    const collectionId: string | undefined = payload?.collectionId;
    if (!collectionId) {
      // payload kontratı bozuksa controlled failure (dead-letter reason); sessiz yutma yok.
      throw new Error('PAYMENT_RECEIVED payload.collectionId yok — disposition üretilemez');
    }

    // Idempotency (önce kontrol): aynı collection için ikinci draft YOK.
    const existing = await this.prisma.collectionDisposition.findUnique({
      where: { collectionId },
      select: { id: true },
    });
    if (existing) {
      return { created: false, dispositionId: existing.id, skipped: 'already-exists' };
    }

    // Collection CANONICAL DB'den (payload'a güvenme); tenantId buradan (tenant-safe).
    const collection = await this.prisma.collection.findUnique({
      where: { id: collectionId },
      select: { id: true, tenantId: true, caseId: true, amount: true, currency: true, status: true },
    });
    if (!collection) {
      throw new Error(`Collection bulunamadı: ${collectionId}`);
    }
    // case mismatch guard (event aggregateId ile collection.caseId aynı olmalı)
    if (collection.caseId !== caseId) {
      throw new Error(
        `Case mismatch: event caseId=${caseId} != collection.caseId=${collection.caseId}`,
      );
    }
    // status guard: yalnız CONFIRMED'de draft (PENDING/CANCELLED/REFUNDED → aktif draft yok)
    if (collection.status !== 'CONFIRMED') {
      return { created: false, skipped: `collection-status-${collection.status}` };
    }

    // Eligible alacaklı: yalnız ALACAKLI / ORTAK_ALACAKLI rolleri.
    const creditors = await this.prisma.caseClient.findMany({
      where: { caseId: collection.caseId, role: { in: ['ALACAKLI', 'ORTAK_ALACAKLI'] } },
      select: { id: true },
    });
    if (creditors.length === 0) {
      // Sıfır eligible → SESSİZCE cluster YARATMA; controlled failure (dead-letter reason).
      throw new Error(
        `Eligible alacaklı (CaseClient) yok caseId=${collection.caseId} — disposition açılmadı (controlled)`,
      );
    }

    const beneficiaryScope =
      creditors.length === 1 ? 'SINGLE_CASE_CLIENT' : 'CASE_CREDITOR_CLUSTER';
    const caseClientId = creditors.length === 1 ? creditors[0].id : null;

    try {
      const disposition = await this.prisma.collectionDisposition.create({
        data: {
          tenantId: collection.tenantId,
          caseId: collection.caseId,
          collectionId: collection.id,
          beneficiaryScope: beneficiaryScope as Prisma.CollectionDispositionCreateInput['beneficiaryScope'],
          caseClientId,
          status: 'HELD_PENDING_DISTRIBUTION',
          totalAmount: collection.amount, // Decimal(15,2) → Decimal(15,2), dönüşüm yok
          currency: collection.currency,
          // Default tek satır: tamamı dağıtım bekliyor (otomatik müvekkil/ofis ayrımı YOK)
          lines: {
            create: [
              {
                type: 'HELD_PENDING_DISTRIBUTION',
                amount: collection.amount,
              },
            ],
          },
        },
        select: { id: true },
      });
      this.logger.log(
        `CollectionDisposition draft: ${disposition.id} (collection=${collection.id}, scope=${beneficiaryScope})`,
      );
      return { created: true, dispositionId: disposition.id };
    } catch (e: unknown) {
      // Race: aynı anda iki event → unique violation → güvenli skip (idempotent).
      if (e instanceof Prisma.PrismaClientKnownRequestError && e.code === 'P2002') {
        return { created: false, skipped: 'unique-race' };
      }
      throw e;
    }
  }
}

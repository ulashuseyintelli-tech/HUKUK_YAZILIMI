import { Injectable, Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import type { ActionHandlerContext } from '../icrabot/v28-engine/action-handler.service';

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
    context?: ActionHandlerContext,
  ): Promise<CreateDraftResult> {
    // Boundary invariant: tenantId outbox satırından (IcrabotOutboxAction.tenantId) thread edilir.
    const tenantId = context?.tenantId;
    if (!tenantId) {
      throw new Error('outbox context.tenantId yok — tenant doğrulanmadan disposition üretilmez');
    }
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

    // Collection CANONICAL DB'den + TENANT/CASE SCOPED (boundary invariant): outbox satırının
    // tenantId'si + event caseId ile sınırlı okunur. Cross-tenant VEYA case mismatch → null → draft yok.
    const collection = await this.prisma.collection.findFirst({
      where: { id: collectionId, caseId, tenantId },
      select: { id: true, tenantId: true, caseId: true, amount: true, currency: true, status: true },
    });
    if (!collection) {
      // not-found / cross-tenant / case mismatch — hepsi controlled failure (dead-letter görünürlüğü).
      throw new Error(
        `Collection scope dışı: collectionId=${collectionId} tenant=${tenantId} case=${caseId} (yok veya tenant/case mismatch)`,
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
          tenantId, // outbox context tenantId (scoped read ile == collection.tenantId garanti)
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

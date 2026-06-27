import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../prisma/prisma.service';
import type { ActionHandlerContext } from '../icrabot/v28-engine/action-handler.service';

/**
 * M1R reversal sonucu. `outcome` davranış matrisini birebir yansıtır; handler bu nesneyi
 * döndürür → ActionHandlerService dispatch'i markDone (success:true) yapar ve sonucu
 * timeline/factstore feedback'ine yazar. (Başarı = THROW etmemek; bu dönüş değeri
 * outbox success/fail'ı belirlemez, yalnız feedback/audit izidir.)
 */
export type ReverseOutcome =
  | 'reversed'
  | 'skip-no-disposition'
  | 'skip-already-reversed'
  | 'skip-already-cancelled'
  | 'posted-manual-reversal-required'
  | 'skip-missing-collection-id'
  | 'skip-unsupported-status';

export interface ReverseResult {
  outcome: ReverseOutcome;
  dispositionId?: string;
  previousStatus?: string;
  /** POSTED senaryosu: finansal reversal M1R kapsamı DIŞI → manuel işlem sinyali. */
  manualReversalRequired?: boolean;
  /** FU1: POSTED marker ZATEN konmuştu (ikinci PAYMENT_REVERSED) → idempotent, overwrite YOK. */
  alreadyMarked?: boolean;
  /** Reversal'ı tetikleyen outbox action id (provenance). FU1'den itibaren POSTED'de kalıcı kolona da yazılır. */
  reversalSourceEventId?: string;
}

/**
 * TM3 M1R — PAYMENT_REVERSED Disposition Handler (Claude domaini).
 *
 * Köprünün TERS yönlü (reversal) tüketici tarafı: CODEX `CollectionService.cancel()` bir
 * PAYMENT_REVERSED outbox event'i ürettiğinde (TM3-S2), bu servis ilgili CollectionDisposition'ı
 * GÜVENLİ şekilde kapatır / no-op consume eder. Amaç: `EVENT_PUBLISHED:PAYMENT_REVERSED` action'ı
 * "no-handler" yoluna düşüp sonsuz retry-poison üretmesin (handler yoksa dispatch erken success:false
 * döner ve action attemptCount artmadan pending kalır → processPendingActions tekrar tekrar seçer).
 *
 * KİLİTLİ KARAR (Ulaş, 2026-06-27): POSTED disposition KÖR ŞEKİLDE `REVERSED` YAPILMAZ ve status
 * DEĞİŞMEZ (POSTED kalır). POSTED, M2'nin proceeds satırlarını (ve ClientStatement okumasını) ürettiği
 * anlamına gelebilir; yalnız status değiştirmek finansal hakikati düzeltmez (ekstre hâlâ satırı gösterir).
 * Bu yüzden POSTED → handled consume + "manual-reversal-required" sinyali; finansal reversal YOK.
 * FU1 (2026-06-27): bu sinyal artık KALICI kolona persist edilir (manualReversalRequiredAt/Reason/
 * SourceActionId) → operasyonel görünürlük (takip kaçağı önlenir); idempotent (bir kez işaretlenir).
 *
 * Sınır (boundary §1-12 + M1R/FU1 contract):
 *  - ClientStatement / BalanceLedger / payout / legal allocation (TBK100) tarafına DOKUNMAZ.
 *  - CollectionService.create/cancel davranışını DEĞİŞTİRMEZ; PAYMENT_RECEIVED payload kontratını bozmaz.
 *  - clientId VARSAYMAZ; CASE_CREDITOR_CLUSTER kuralına dokunmaz.
 *  - tenantId zorunlu (outbox satırından); collectionId @unique ile disposition bulunur; tenant/case
 *    uyuşmazlığı fail-closed (mutasyon YOK, görünür hata → dead-letter).
 *  - HELD_PENDING_DISTRIBUTION → yalnız `status = REVERSED` (DRAFT/HELD = kanonik enum). POSTED →
 *    status KORUNUR, yalnız FU1 marker alanları yazılır (additive migration: FU1).
 */
@Injectable()
export class CollectionReversalService {
  private readonly logger = new Logger(CollectionReversalService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Çağrıldığı yerler:
   *  - PaymentReversedRegistrar → ActionHandlerService 'EVENT_PUBLISHED:PAYMENT_REVERSED' handler
   */
  async reverseFromPaymentReversed(
    payload: Record<string, any>,
    caseId: string,
    context?: ActionHandlerContext,
  ): Promise<ReverseResult> {
    // Boundary invariant: tenantId outbox satırından (IcrabotOutboxAction.tenantId) thread edilir.
    // Infra invariant (outbox.tenantId NOT NULL) → pratikte hiç tetiklenmez; tip daraltması + fail-closed.
    const tenantId = context?.tenantId;
    if (!tenantId) {
      throw new Error('outbox context.tenantId yok — tenant doğrulanmadan reversal işlenmez');
    }

    const collectionId: string | undefined = payload?.collectionId;
    if (!collectionId) {
      // Malformed reversal payload: hiçbir disposition'a map EDİLEMEZ → poison ÜRETME.
      // handled no-op (success) + structured warn (sessiz yutma DEĞİL — görünür kalır).
      this.logger.warn(
        `PAYMENT_REVERSED payload.collectionId yok (tenant=${tenantId}, case=${caseId}, ` +
          `srcEvent=${context?.actionId}) — handled no-op (reverse edilecek hedef yok)`,
      );
      return { outcome: 'skip-missing-collection-id' };
    }

    // collectionId @unique → tek disposition. Tenant/case doğrulaması KODDA yapılır:
    // null ise "henüz draft yok" (benign) ile "cross-tenant" (anomali) ayrımı için unscoped okunur,
    // sonra tenant/case kodda karşılaştırılır.
    const disp = await this.prisma.collectionDisposition.findUnique({
      where: { collectionId },
      // FU1: manualReversalRequiredAt POSTED idempotency kontrolü için seçilir (zaten işaretliyse overwrite YOK).
      select: { id: true, tenantId: true, caseId: true, status: true, manualReversalRequiredAt: true },
    });

    if (!disp) {
      // PAYMENT_RECEIVED hiç draft AÇMAMIŞ olabilir (collection CONFIRMED değildi / 0 alacaklı /
      // event henüz işlenmedi). Reverse edilecek bir şey yok → idempotent handled skip.
      return { outcome: 'skip-no-disposition' };
    }

    // Cross-tenant / wrong-case integrity guard (fail-closed): disposition BU collection için VAR ama
    // başka tenant/case'e ait → gerçek bir tutarsızlık. Mutasyon YOK; görünür hata (dead-letter).
    // (Sonsuz poison DEĞİL: handler var → throw markFailed → 8 denemede dead-letter.)
    if (disp.tenantId !== tenantId) {
      throw new Error(
        `Disposition tenant mismatch (fail-closed): collection=${collectionId} ` +
          `disp.tenant=${disp.tenantId} event.tenant=${tenantId}`,
      );
    }
    if (disp.caseId !== caseId) {
      throw new Error(
        `Disposition case mismatch (fail-closed): collection=${collectionId} ` +
          `disp.case=${disp.caseId} event.case=${caseId}`,
      );
    }

    switch (disp.status) {
      // Kanonik enum'da ayrı 'DRAFT'/'HELD' YOK; aktif taslak durumu = HELD_PENDING_DISTRIBUTION.
      case 'HELD_PENDING_DISTRIBUTION': {
        // Aktif taslak → güvenli REVERSED. Finansal taraf YOK (M2 henüz çalışmamış: proceeds satırı,
        // ClientStatementLine, BalanceLedger, payout YAZILMAMIŞ). Yalnız status set edilir (migration YOK).
        await this.prisma.collectionDisposition.update({
          where: { id: disp.id },
          data: { status: 'REVERSED' },
        });
        this.logger.log(
          `CollectionDisposition REVERSED: ${disp.id} (collection=${collectionId}, ` +
            `from=${disp.status}, srcEvent=${context?.actionId})`,
        );
        return {
          outcome: 'reversed',
          dispositionId: disp.id,
          previousStatus: disp.status,
          reversalSourceEventId: context?.actionId,
        };
      }

      case 'REVERSED':
        // İdempotent: aynı reversal iki kez gelse de tekrar yazma yok.
        return { outcome: 'skip-already-reversed', dispositionId: disp.id, previousStatus: disp.status };

      case 'CANCELLED':
        // Zaten kapalı (M2 öncesi iptal) → idempotent handled skip.
        return { outcome: 'skip-already-cancelled', dispositionId: disp.id, previousStatus: disp.status };

      case 'POSTED': {
        // KİLİTLİ: POSTED kör REVERSED YAPILMAZ ve status DEĞİŞMEZ (POSTED kalır). M2
        // ClientStatementLine üretmiş olabilir; status değiştirmek finansal hakikati düzeltmez.
        // M1R/FU1 finansal reversal (ClientStatement/BalanceLedger/payout) YAZMAZ. FU1: manuel
        // reversal sinyali artık KALICI kolona persist edilir (operasyonel görünürlük — takip kaçağı önlenir).
        if (disp.manualReversalRequiredAt) {
          // İdempotent: marker ZATEN konmuş (ör. ikinci PAYMENT_REVERSED). Overwrite YOK — ilk
          // tetikleyen kayıt (zaman/sebep/sourceActionId) korunur.
          this.logger.warn(
            `MANUAL_REVERSAL_REQUIRED (zaten işaretli): POSTED disposition ${disp.id} ` +
              `(collection=${collectionId}, srcEvent=${context?.actionId}) — idempotent no-op, marker korundu.`,
          );
          return {
            outcome: 'posted-manual-reversal-required',
            dispositionId: disp.id,
            previousStatus: disp.status,
            manualReversalRequired: true,
            alreadyMarked: true,
          };
        }

        const reason =
          'PAYMENT_REVERSED POSTED disposition\'a geldi — finansal reversal (ClientStatement/' +
          'BalanceLedger/payout) manuel gerekir; M1R/FU1 otomatik yazmaz, status POSTED kalır.';
        // status ALANI data'da YOK → POSTED korunur; yalnız marker alanları set edilir.
        await this.prisma.collectionDisposition.update({
          where: { id: disp.id },
          data: {
            manualReversalRequiredAt: new Date(),
            manualReversalReason: reason,
            manualReversalSourceActionId: context?.actionId ?? null,
          },
        });
        this.logger.warn(
          `MANUAL_REVERSAL_REQUIRED: POSTED disposition ${disp.id} (collection=${collectionId}, ` +
            `srcEvent=${context?.actionId}) — PAYMENT_REVERSED consume edildi; status POSTED korundu, ` +
            `kalıcı marker yazıldı. Finansal reversal manuel.`,
        );
        return {
          outcome: 'posted-manual-reversal-required',
          dispositionId: disp.id,
          previousStatus: disp.status,
          manualReversalRequired: true,
          reversalSourceEventId: context?.actionId,
        };
      }

      default:
        // Bilinmeyen/gelecekte eklenmiş status → mutasyon YOK; handled skip + warn (poison YOK).
        this.logger.warn(
          `PAYMENT_REVERSED: desteklenmeyen disposition status=${disp.status} (id=${disp.id}, ` +
            `collection=${collectionId}) — handled no-op`,
        );
        return { outcome: 'skip-unsupported-status', dispositionId: disp.id, previousStatus: disp.status };
    }
  }
}

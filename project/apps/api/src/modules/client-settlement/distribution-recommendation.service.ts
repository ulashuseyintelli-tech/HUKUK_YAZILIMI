import { Injectable, Logger, NotFoundException, BadRequestException } from '@nestjs/common';
import { Prisma, FeeAgreementType, FeeAgreementBase } from '@prisma/client';
import { PrismaService } from '../../prisma/prisma.service';
import { ClientOffsetService } from './client-offset.service';
import { CaseFeeAgreementService } from './case-fee-agreement.service';
import {
  GenerateDistributionRecommendationDto,
  DistributionRecommendation,
  SuggestedDistributionLine,
  ExpenseCandidate,
} from './dto/distribution-recommendation.dto';

const EXPENSE_DISABLED_WARNING =
  'Masraf onay alanı henüz yok; otomatik masraf önerisi devre dışı (FAZ-1b). Adaylar yalnızca bilgi amaçlı listelenir.';
const CLUSTER_WARNING =
  'Çoklu-alacaklı (CASE_CREDITOR_CLUSTER) dağıtım önerisi FAZ-1a kapsamı dışı; satırları manuel girin.';
const ZERO_RESIDUAL_WARNING = 'Müvekkile kalan ₺0 (ücret brüt tahsilata eşit).';

/**
 * S8-B FAZ-2 — CaseFeeAgreement recommendation entegrasyonu (default-OFF; flag OFF'ta davranış değişmez).
 *
 * FLAG POLİTİKASI:
 *  - Local/dev: FEE_AGREEMENT_RECOMMENDATION_ENABLED=true serbestçe set edilebilir (agreement'ı
 *    aktif test etmek için gerekli — kod/CI kısıtlaması YOK, bu bir dev-convenience switch'i).
 *  - Production: flag ON AYRI owner/ops kararıdır (rollout-gate). Bu servis production'ı algılayıp
 *    kendiliğinden kısıtlamaz — production'da açık tutulmama sorumluluğu deploy/ops disiplinindedir,
 *    kod-seviyesinde enforce EDİLMEZ.
 *  - Rollout gözlemi: yalnız flag OFF iken, ACTIVE bir agreement legacy(0)'dan farklı ücret önerirse
 *    resolveFeeAttribution tek satır WARN loglar ("flag açılsaydı ne olurdu"). flag ON iken agreement
 *    zaten normal şekilde uygulandığından ayrıca loglanmaz (gürültü değil, yalnız gerçek sinyal).
 */
function isFeeAgreementRecommendationEnabled(): boolean {
  return process.env.FEE_AGREEMENT_RECOMMENDATION_ENABLED?.toLowerCase() === 'true';
}

/**
 * S8-B FAZ-1a — Dağıtım Önerisi Üreteci (advisory-only).
 *
 * HELD_PENDING_DISTRIBUTION disposition'ın brüt tutarını LOCKED sıraya göre öneri satırlarına böler:
 *   Brüt → Avukatlık Ücreti (CONTRACTUAL_FEE_WITHHELD, manuel) → [Onaylı Masraf = FAZ-1b, DEVRE DIŞI]
 *   → Müvekkile kalan (CLIENT_PAYABLE residual).
 *
 * SINIRLAR (FAZ-1a):
 *  - recommend-ONLY: DB yazımı YOK · P4 YOK · finansal etki YOK · post YOK · şema YOK.
 *  - Σ(suggestedLines) == gross (BE Prisma.Decimal; mevcut resolveLines invariantını sağlar).
 *  - faithful decimal (float YOK); FE HESAPLAMAZ — yalnız bu string'leri pre-fill eder.
 *  - expense auto-apply DEVRE DIŞI (approval alanı yok); masraf adayları YALNIZ bilgi.
 *  - Üretilen satırlar mevcut recommend()→approve()→post() lifecycle'ına beslenir (otorite orada).
 */
@Injectable()
export class DistributionRecommendationService {
  private readonly logger = new Logger(DistributionRecommendationService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly offset: ClientOffsetService,
    private readonly feeAgreements: CaseFeeAgreementService,
  ) {}

  /**
   * /// <remarks>
   * /// Çağrıldığı yerler:
   * ///  - DispositionController.distributionRecommendation() → POST /collection-dispositions/:id/distribution-recommendation
   * /// </remarks>
   */
  async generate(
    tenantId: string,
    dispositionId: string,
    dto: GenerateDistributionRecommendationDto,
    actor: { userId: string },
  ): Promise<DistributionRecommendation> {
    const disp = await this.prisma.collectionDisposition.findFirst({
      where: { id: dispositionId, tenantId },
      select: {
        id: true,
        status: true,
        currency: true,
        totalAmount: true,
        beneficiaryScope: true,
        caseClientId: true,
        caseId: true,
      },
    });
    if (!disp) throw new NotFoundException('Dağıtım kaydı bulunamadı');
    if (disp.status !== 'HELD_PENDING_DISTRIBUTION') {
      throw new BadRequestException(
        `Öneri yalnız HELD_PENDING_DISTRIBUTION için üretilir (durum: ${disp.status})`,
      );
    }

    const gross = new Prisma.Decimal(disp.totalAmount);
    const warnings: string[] = [];

    // Çoklu-alacaklı (CLUSTER) FAZ-1a kapsamı dışı → öneri üretme; manuel dağıtım gerekir.
    if (disp.beneficiaryScope !== 'SINGLE_CASE_CLIENT') {
      warnings.push(CLUSTER_WARNING);
      return this.build(disp, gross, [], warnings, []);
    }

    // 1) Avukatlık ücreti: manuel (override, her zaman kazanır) veya FAZ-2 CaseFeeAgreement-türevi (flag-gated).
    const feeResult = await this.resolveFeeAttribution(dto, gross, tenantId, disp.caseClientId);
    const fee = feeResult.fee;

    // 2) Satırlar: ücret (varsa) + residual CLIENT_PAYABLE (varsa).
    const suggestedLines: SuggestedDistributionLine[] = [];
    if (fee.gt(0)) {
      suggestedLines.push({
        type: 'CONTRACTUAL_FEE_WITHHELD',
        amount: fee.toString(),
        caseClientId: null, // büro geliri; client-attributed DEĞİL (Q3 LOCKED)
        origin: feeResult.origin,
        editable: true,
        note: feeResult.origin === 'FEE_MANUAL' ? dto?.attorneyFee?.note : undefined,
        feeAgreementId: feeResult.feeAgreementId,
      });
    }
    const residual = gross.minus(fee);
    if (residual.gt(0)) {
      suggestedLines.push({
        type: 'CLIENT_PAYABLE',
        amount: residual.toString(),
        caseClientId: disp.caseClientId, // SINGLE → disposition'ın alacaklısı
        origin: 'CLIENT_PAYABLE_RESIDUAL',
        editable: true,
      });
    } else {
      warnings.push(ZERO_RESIDUAL_WARNING);
    }

    // 3) Masraf adayları — YALNIZ BİLGİ (auto-apply devre dışı). Canonical unpaid reuse.
    const candidates = await this.expenseCandidates(tenantId, disp, actor.userId);
    if (candidates.length > 0) warnings.push(EXPENSE_DISABLED_WARNING);

    return this.build(disp, gross, suggestedLines, warnings, candidates);
  }

  /** Manuel ücreti doğrula: faithful decimal-STRING · mode=AMOUNT · ≤2dp (Decimal 15,2) · 0 <= fee <= gross (clamp YOK → BadRequest). */
  private resolveFee(dto: GenerateDistributionRecommendationDto, gross: Prisma.Decimal): Prisma.Decimal {
    if (!dto?.attorneyFee) return new Prisma.Decimal(0);
    if (dto.attorneyFee.mode !== 'AMOUNT') {
      throw new BadRequestException('FAZ-1a yalnız mode=AMOUNT destekler (oran modeli FAZ-2)');
    }
    // Faithful decimal: tutar STRING olmalı — ham JSON number/float kabul edilmez (interface DTO ValidationPipe'ta
    // enforce edilmediğinden ham caller number gönderebilir; float imprecision'ı boundary'de keseriz).
    const rawAmount: unknown = dto.attorneyFee.amount;
    if (typeof rawAmount !== 'string') {
      throw new BadRequestException('Ücret tutarı faithful decimal-string olmalı (number kabul edilmez)');
    }
    let fee: Prisma.Decimal;
    try {
      fee = new Prisma.Decimal(rawAmount);
    } catch {
      throw new BadRequestException('Geçersiz ücret tutarı');
    }
    if (!fee.isFinite()) throw new BadRequestException('Geçersiz ücret tutarı');
    if (fee.lt(0)) throw new BadRequestException('Ücret negatif olamaz');
    // ≤2 ondalık: Decimal(15,2) kolonuyla uyum → öneri her zaman faithful persist edilebilir (post sum-recheck kırılmaz).
    if (fee.decimalPlaces() > 2) {
      throw new BadRequestException('Ücret en fazla 2 ondalık basamak olabilir (Decimal 15,2)');
    }
    if (fee.gt(gross)) throw new BadRequestException('Ücret brüt tahsilatı aşamaz');
    return fee;
  }

  /**
   * FAZ-2 — manuel/agreement ücret çözümü (flag FEE_AGREEMENT_RECOMMENDATION_ENABLED, default OFF).
   * Manuel override HER ZAMAN kazanır (agreement'a hiç bakılmaz — mevcut davranış değişmez). Manuel
   * yoksa + SINGLE_CASE_CLIENT (çağıran garanti eder) + ACTIVE + GROSS-only agreement varsa: flagOn →
   * agreement-türevi fee kullanılır (feeAgreementId provenance); flagOff → mevcut (0) davranış korunur,
   * yalnız dual-eval log (rollout gözlemi — legacy'den farklıysa).
   */
  private async resolveFeeAttribution(
    dto: GenerateDistributionRecommendationDto,
    gross: Prisma.Decimal,
    tenantId: string,
    caseClientId: string | null,
  ): Promise<{ fee: Prisma.Decimal; origin: 'FEE_MANUAL' | 'FEE_AGREEMENT'; feeAgreementId?: string }> {
    if (dto?.attorneyFee) {
      return { fee: this.resolveFee(dto, gross), origin: 'FEE_MANUAL' };
    }
    const legacyFee = new Prisma.Decimal(0);
    if (!caseClientId) return { fee: legacyFee, origin: 'FEE_MANUAL' };

    const agreement = await this.feeAgreements.getActiveForCaseClient(tenantId, caseClientId);
    // v1 GROSS-only: NET_OF_EXPENSE (FAZ-1b sonrası) burada asla oluşmamalı (service-write-time reddedilir);
    // defense-in-depth — yine de rastlarsak agreement'ı uygulamadan legacy'ye düş (davranış bozulmaz).
    if (!agreement || agreement.feeBase !== FeeAgreementBase.GROSS) {
      return { fee: legacyFee, origin: 'FEE_MANUAL' };
    }

    const candidateFee =
      agreement.feeType === FeeAgreementType.FLAT_AMOUNT
        ? new Prisma.Decimal(agreement.flatAmount ?? 0)
        : gross
            .mul(agreement.percentageBps ?? 0)
            .div(10000)
            .toDecimalPlaces(2, Prisma.Decimal.ROUND_HALF_UP);

    if (!isFeeAgreementRecommendationEnabled()) {
      // Rollout gözlemi: yalnız flag OFF iken logla — flag ON'da agreement zaten normal uygulanıyor,
      // "farklı" değil; her recommend() çağrısında WARN basmak gereksiz gürültü olurdu.
      if (!candidateFee.equals(legacyFee)) {
        this.logger.warn(
          `[fee-agreement-recommendation] caseClientId=${caseClientId} agreement=${agreement.id} ` +
            `legacyFee=${legacyFee.toString()} agreementFee=${candidateFee.toString()} (flag OFF — gözlem, uygulanmadı)`,
        );
      }
      return { fee: legacyFee, origin: 'FEE_MANUAL' };
    }

    // Clamp YOK: manuel fee ile simetrik davranış (mevcut validation hatası korunur).
    if (candidateFee.gt(gross)) {
      throw new BadRequestException('Ücret brüt tahsilatı aşamaz');
    }
    return { fee: candidateFee, origin: 'FEE_AGREEMENT', feeAgreementId: agreement.id };
  }

  /** Aynı-dosya unpaid masraf adayları (canonical computeExpenseRequestUnpaid reuse via getEligibility). */
  private async expenseCandidates(
    tenantId: string,
    disp: { caseClientId: string | null; caseId: string; currency: string },
    actorUserId: string,
  ): Promise<ExpenseCandidate[]> {
    if (!disp.caseClientId) return [];
    // Tenant-scoped (defense-in-depth): caseClient transitively tenant-safe (disp tenant-filtreli) ama açık scope ekliyoruz.
    const caseClient = await this.prisma.caseClient.findFirst({
      where: { id: disp.caseClientId, client: { tenantId } },
      select: { client: { select: { id: true } } },
    });
    const clientId = caseClient?.client?.id;
    if (!clientId) return [];

    // Canonical reuse: getEligibility.eligibleExpenseRequests (computeExpenseRequestUnpaid). Same-case filter.
    const eligibility = await this.offset.getEligibility(tenantId, actorUserId, clientId, disp.currency);
    return eligibility.eligibleExpenseRequests
      .filter((e) => e.expenseCaseId === disp.caseId)
      .map((e) => ({
        expenseRequestId: e.expenseRequestId,
        caseId: e.expenseCaseId,
        status: e.requestStatus,
        remaining: e.unpaidAmount,
        applied: false as const,
        note: 'Bilgi amaçlı — onay alanı yok, otomatik uygulanmadı (FAZ-1b).',
      }));
  }

  private build(
    disp: { id: string; currency: string; beneficiaryScope: string },
    gross: Prisma.Decimal,
    suggestedLines: SuggestedDistributionLine[],
    warnings: string[],
    candidates: ExpenseCandidate[],
  ): DistributionRecommendation {
    const sum = suggestedLines.reduce(
      (acc, l) => acc.plus(new Prisma.Decimal(l.amount)),
      new Prisma.Decimal(0),
    );
    return {
      dispositionId: disp.id,
      status: 'HELD_PENDING_DISTRIBUTION',
      currency: disp.currency,
      gross: gross.toString(),
      beneficiaryScope: disp.beneficiaryScope,
      recommendOnly: true,
      financialEffect: false,
      suggestedLines,
      sumCheck: { sum: sum.toString(), equalsGross: sum.equals(gross) },
      expenseModule: {
        autoApplyEnabled: false,
        disabledReason: 'EXPENSE_APPROVAL_FIELD_MISSING',
        candidates,
      },
      warnings,
    };
  }
}

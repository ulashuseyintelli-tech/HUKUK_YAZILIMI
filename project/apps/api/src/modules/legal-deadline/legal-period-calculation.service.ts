import { BadRequestException, Injectable, Logger } from "@nestjs/common";
import { NextActionType, ProceedingType } from "@prisma/client";
import { LegalDeadlineService } from "./legal-deadline.service";
import { ProceedingClassificationService } from "./proceeding-classification.service";
import { resolveLegalPeriodRule } from "./legal-period-rule-matrix";

/**
 * MPB-028(a) PR-3C — Canonical Proceeding-Type and Legal-Period Rule Matrix.
 *
 * Bu servis:
 * - LegalDeadlineService (legalServiceDate hesabı) ve ProceedingClassificationService
 *   (kanonik takip-türü) sonuçlarını `legal-period-rule-matrix`'teki tek merkezli kurala
 *   bağlar; hiçbir sabit +7/+10/+15/+30 sayısı bu dosyada YAZILMAZ.
 * - Tamamen read-only'dir; hiçbir LegalDeadlineSnapshot satırı YAZMAZ, hiçbir consumer/
 *   workflow/scheduler/UI'ı tetiklemez veya bunlardan çağrılmaz (owner Decision — bu PR'da
 *   Representative Local Evidence üretimi kapsam dışıdır; LegalDeadlineSnapshot'a eklenen
 *   resolvedProceedingType/objectionDays/vb. alanlar bu PR'da HENÜZ doldurulmaz, gelecekteki
 *   bir evidence-activation turu içindir — PR-2→PR-3A ayrımıyla aynı ilke).
 * - `LegalDeadlineService`'in mevcut metotlarını (calculateDeadline/
 *   resolveLegalServiceDateForTebligat) DEĞİŞTİRMEZ, yalnız `resolveLegalServiceDateForTebligat`'ı
 *   ÇAĞIRIR.
 * - Kural bulunamazsa (PLEDGE/MORTGAGE/bağımsız EVICTION/PUBLIC_RECEIVABLE, veya
 *   sınıflandırma hiç yapılmamışsa) UNRESOLVED (null) döner — tahmin ETMEZ.
 */

export interface ComputeCanonicalLegalPeriodInput {
  tenantId: string;
  tebligatId: string;
  caseId: string;
  /**
   * Yalnız JUDGMENT_ENFORCEMENT.SPECIFIC_PERFORMANCE rejiminde gereklidir (kanonik tabloda
   * sabit süre YOK — mahkeme/icra müdürünce belirlenir). Diğer tüm rejimlerde YOK SAYILIR.
   */
  callerSuppliedPerformanceDays?: number;
}

export type CanonicalLegalPeriodResult =
  | { status: "UNRESOLVED"; reason: "PROCEEDING_TYPE_UNRESOLVED" | "LEGAL_PERIOD_RULE_UNRESOLVED" | "LEGAL_SERVICE_DATE_UNRESOLVED" }
  | {
      status: "RESOLVED";
      proceedingType: ProceedingType;
      subTypeCode: string | null;
      legalServiceDate: Date;
      periodStartDate: Date;
      objectionDays: number | null;
      paymentDays: number | null;
      vacateDays: number | null;
      performanceDays: number | null;
      complaintDays: number | null;
      nextActionWaitingDays: number;
      nextActionEligibleDate: Date;
      nextActionType: NextActionType;
    };

const MAX_CALLER_SUPPLIED_PERFORMANCE_DAYS = 365;

@Injectable()
export class LegalPeriodCalculationService {
  private readonly logger = new Logger(LegalPeriodCalculationService.name);

  constructor(
    private legalDeadlineService: LegalDeadlineService,
    private proceedingClassificationService: ProceedingClassificationService,
  ) {}

  async computeCanonicalLegalPeriod(
    input: ComputeCanonicalLegalPeriodInput,
  ): Promise<CanonicalLegalPeriodResult> {
    const classification = await this.proceedingClassificationService.resolveProceedingClassification(
      input.tenantId,
      input.caseId,
    );
    if (!classification) {
      return { status: "UNRESOLVED", reason: "PROCEEDING_TYPE_UNRESOLVED" };
    }

    const rule = resolveLegalPeriodRule(classification.proceedingType, classification.subTypeCode);
    if (!rule) {
      return { status: "UNRESOLVED", reason: "LEGAL_PERIOD_RULE_UNRESOLVED" };
    }

    const legalServiceResult = await this.legalDeadlineService.resolveLegalServiceDateForTebligat(
      input.tenantId,
      input.tebligatId,
    );
    if (!legalServiceResult) {
      return { status: "UNRESOLVED", reason: "LEGAL_SERVICE_DATE_UNRESOLVED" };
    }

    const performanceDays = rule.requiresCallerSuppliedPerformanceDays
      ? this.assertValidCallerSuppliedPerformanceDays(input.callerSuppliedPerformanceDays)
      : rule.performanceDays;

    const periodStartDate = addDays(legalServiceResult.legalServiceDate, 1);
    const nextActionWaitingDays = maxOf(
      rule.objectionDays,
      rule.paymentDays,
      rule.vacateDays,
      performanceDays,
      rule.complaintDays,
    );
    const nextActionEligibleDate = addDays(periodStartDate, nextActionWaitingDays - 1);

    this.logger.log(
      `Canonical legal period hesaplandı: case=${input.caseId}, proceedingType=${classification.proceedingType}, ` +
        `subType=${classification.subTypeCode ?? "N/A"}, nextActionWaitingDays=${nextActionWaitingDays}`,
    );

    return {
      status: "RESOLVED",
      proceedingType: classification.proceedingType,
      subTypeCode: classification.subTypeCode,
      legalServiceDate: legalServiceResult.legalServiceDate,
      periodStartDate,
      objectionDays: rule.objectionDays,
      paymentDays: rule.paymentDays,
      vacateDays: rule.vacateDays,
      performanceDays,
      complaintDays: rule.complaintDays,
      nextActionWaitingDays,
      nextActionEligibleDate,
      nextActionType: rule.nextActionType,
    };
  }

  /**
   * PR-2'nin objectionPeriodDays deseniyle aynı ilke: SPECIFIC_PERFORMANCE süresi kanonik
   * tabloda sabit değildir, çağıran tarafından sağlanmalıdır. Eksik/sıfır/negatif/
   * tam-sayı-olmayan/aşırı büyük girdi fail-closed reddedilir — hiçbir varsayılan üretilmez.
   */
  private assertValidCallerSuppliedPerformanceDays(value: number | undefined): number {
    if (typeof value !== "number" || !Number.isInteger(value) || value <= 0) {
      throw new BadRequestException(
        "JUDGMENT_ENFORCEMENT.SPECIFIC_PERFORMANCE için performanceDays pozitif bir tam sayı olarak sağlanmalıdır (kanonik tabloda sabit süre yoktur)",
      );
    }
    if (value > MAX_CALLER_SUPPLIED_PERFORMANCE_DAYS) {
      throw new BadRequestException(
        `performanceDays makul üst sınırı (${MAX_CALLER_SUPPLIED_PERFORMANCE_DAYS} gün) aşıyor`,
      );
    }
    return value;
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function maxOf(...values: Array<number | null>): number {
  const present = values.filter((v): v is number => v !== null);
  if (present.length === 0) {
    throw new BadRequestException(
      "Kanonik kuralda hiçbir süre alanı (objectionDays/paymentDays/vacateDays/performanceDays/complaintDays) tanımlı değil",
    );
  }
  return Math.max(...present);
}

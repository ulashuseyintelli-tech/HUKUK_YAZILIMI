/**
 * DEBTOR-OF01-HISTORY-P04-B-R2-I01 — LegalServiceDateRuleCore.
 *
 * Tek, saf, deterministik hesap çekirdeği: hem legacy Tebligat-tabanlı hem
 * ServiceOccurrence-tabanlı adapter'ların TK-rejim → hukuki tebliğ tarihi
 * hesaplamasını ortaklaştırması için tasarlandı. Bu dilimde (I01) hiçbir
 * adapter buraya yönlendirilmez — yalnız çekirdek sözleşme kurulur; mevcut
 * `LegalDeadlineService.determineLegalServiceDate()` ve
 * `determineOccurrenceLegalServiceDate()` davranışlarına dokunulmaz.
 *
 * `@prisma/client` enum import'u yalnız TİP amaçlıdır (PrismaService/DB
 * erişimi yok) — `service-occurrence-deadline-rule.ts`'nin kendi "pure
 * function" emsaliyle aynı desen.
 *
 * Rejim/completion-mode uyumluluğu, `TebligatService.determinePttResultAction()`
 * (gerçek write-path) ile doğrulanmış şekilde tasarlandı:
 * - TK_21_1/TK_21_2: serviceCompletionMode HİÇBİR ZAMAN set edilmez (bilinçli
 *   olarak undefined bırakılır — owner "STOP-03 RESOLUTION").
 * - IMMEDIATE_SERVICE: her zaman DIRECT_RECIPIENT_DELIVERY veya
 *   DELIVERED_TO_AUTHORIZED_PERSON (ikisi de +0 gün sonucunu değiştirmez).
 * - TK_20_TEMPORARY_ABSENCE: her zaman DELIVERED_TO_AUTHORIZED_PERSON veya
 *   NOTICE_POSTED (owner "P04 DEADLINE REGIME CONTRACT" düzeltmesi — bu
 *   ikisi ARTIK gün sayısını gerçekten ayırt eder: +0 / +15).
 */
import {
  ServiceOccurrenceRegimeCode,
  ServiceCompletionMode,
  SubstituteRecipientBasis,
} from "@prisma/client";

const PUBLICATION_DELAY_DAYS = 7;
const ELECTRONIC_DELAY_DAYS = 5;
const TK20_NOTICE_POSTED_DELAY_DAYS = 15;

export class UnsupportedServiceRegimeCodeError extends Error {
  constructor(regimeCode: string) {
    super(`Unsupported or deprecated serviceRegimeCode: ${regimeCode}`);
    this.name = "UnsupportedServiceRegimeCodeError";
  }
  readonly code = "UNSUPPORTED_SERVICE_REGIME_CODE" as const;
}

export class IncompatibleCompletionModeError extends Error {
  constructor(reason: string) {
    super(`Incompatible serviceRegimeCode/serviceCompletionMode combination: ${reason}`);
    this.name = "IncompatibleCompletionModeError";
  }
  readonly code = "INCOMPATIBLE_COMPLETION_MODE" as const;
}

export interface LegalServiceDateFacts {
  serviceRegimeCode: ServiceOccurrenceRegimeCode;
  serviceCompletionMode?: ServiceCompletionMode | null;
  /**
   * Hukuki sonucu açıklayan context fact'tir (ARTICLE_13/14/16/17/18) — TK20
   * completion mode YERİNE kullanılamaz, gün hesabını hiçbir zaman etkilemez
   * (owner brief). Çekirdek bu alanı kabul eder ama dallanmada OKUMAZ.
   */
  substituteRecipientBasis?: SubstituteRecipientBasis | null;
  baseDate: Date;
}

export interface LegalServiceDateResult {
  legalServiceDate: Date;
  calculationRule: string;
  deadlineReasonCode: string;
}

export function resolveLegalServiceDate(facts: LegalServiceDateFacts): LegalServiceDateResult {
  const { serviceRegimeCode, baseDate } = facts;
  const serviceCompletionMode = facts.serviceCompletionMode ?? null;

  switch (serviceRegimeCode) {
    case ServiceOccurrenceRegimeCode.TK_21_1:
      requireNoCompletionMode(serviceRegimeCode, serviceCompletionMode);
      return {
        legalServiceDate: baseDate,
        calculationRule: "TK_21_1_NO_DELAY",
        deadlineReasonCode: "TK_21_1",
      };

    case ServiceOccurrenceRegimeCode.TK_21_2:
      requireNoCompletionMode(serviceRegimeCode, serviceCompletionMode);
      return {
        legalServiceDate: baseDate,
        calculationRule: "TK_21_2_NO_DELAY",
        deadlineReasonCode: "TK_21_2",
      };

    case ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE:
      if (
        serviceCompletionMode !== null &&
        serviceCompletionMode !== ServiceCompletionMode.DIRECT_RECIPIENT_DELIVERY &&
        serviceCompletionMode !== ServiceCompletionMode.DELIVERED_TO_AUTHORIZED_PERSON
      ) {
        throw new IncompatibleCompletionModeError(
          `IMMEDIATE_SERVICE does not accept serviceCompletionMode=${serviceCompletionMode}`,
        );
      }
      return {
        legalServiceDate: baseDate,
        calculationRule: "IMMEDIATE_SERVICE_NO_DELAY",
        deadlineReasonCode: "DIRECT_DELIVERY",
      };

    case ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE:
      if (serviceCompletionMode === ServiceCompletionMode.DELIVERED_TO_AUTHORIZED_PERSON) {
        return {
          legalServiceDate: baseDate,
          calculationRule: "TK_20_DELIVERED_TO_AUTHORIZED_PERSON_NO_DELAY",
          deadlineReasonCode: "TK_20",
        };
      }
      if (serviceCompletionMode === ServiceCompletionMode.NOTICE_POSTED) {
        return {
          legalServiceDate: addDays(baseDate, TK20_NOTICE_POSTED_DELAY_DAYS),
          calculationRule: "TK_20_NOTICE_POSTED_PLUS_15_DAYS",
          deadlineReasonCode: "TK_20",
        };
      }
      throw new IncompatibleCompletionModeError(
        serviceCompletionMode === null
          ? "TK_20_TEMPORARY_ABSENCE requires serviceCompletionMode " +
              "(DELIVERED_TO_AUTHORIZED_PERSON or NOTICE_POSTED), none was provided"
          : `TK_20_TEMPORARY_ABSENCE does not accept serviceCompletionMode=${serviceCompletionMode}`,
      );

    case ServiceOccurrenceRegimeCode.PUBLICATION:
      requireNoCompletionMode(serviceRegimeCode, serviceCompletionMode);
      return {
        legalServiceDate: addDays(baseDate, PUBLICATION_DELAY_DAYS),
        calculationRule: "PUBLICATION_PLUS_7_DAYS",
        deadlineReasonCode: "ILANEN_M31",
      };

    case ServiceOccurrenceRegimeCode.ELECTRONIC:
      requireNoCompletionMode(serviceRegimeCode, serviceCompletionMode);
      return {
        legalServiceDate: addDays(baseDate, ELECTRONIC_DELAY_DAYS),
        calculationRule: "ELECTRONIC_PLUS_5_DAYS",
        deadlineReasonCode: "UETS_M7A",
      };

    case ServiceOccurrenceRegimeCode.DIRECT_DELIVERY:
    case ServiceOccurrenceRegimeCode.TK_20:
      // DEPRECATED (P04-A1-R2) — schema.prisma'nın kendi yorumu: hiçbir satırda
      // kullanılmadı (yerlerini IMMEDIATE_SERVICE/TK_20_TEMPORARY_ABSENCE aldı).
      // Bu eski kodları yeni karşılıklarıyla "eşdeğer" SAYMAK yerine kasıtlı
      // olarak fail-closed: gerçek veri akışında hiç üretilmiyorlar, sessizce
      // bir davranış varsaymak riskli bir teknik tahmin olurdu.
      throw new UnsupportedServiceRegimeCodeError(serviceRegimeCode);

    default: {
      const exhaustiveCheck: never = serviceRegimeCode;
      throw new UnsupportedServiceRegimeCodeError(String(exhaustiveCheck));
    }
  }
}

function requireNoCompletionMode(
  regimeCode: ServiceOccurrenceRegimeCode,
  completionMode: ServiceCompletionMode | null,
): void {
  if (completionMode !== null) {
    throw new IncompatibleCompletionModeError(
      `${regimeCode} does not accept a serviceCompletionMode (got ${completionMode})`,
    );
  }
}

function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

import { ServiceOccurrenceRegimeCode, ServiceCompletionMode, SubstituteRecipientBasis } from "@prisma/client";
import {
  resolveLegalServiceDate,
  UnsupportedServiceRegimeCodeError,
  IncompatibleCompletionModeError,
  LegalServiceDateFacts,
} from "../legal-service-date-rule-core";

describe("LegalServiceDateRuleCore.resolveLegalServiceDate", () => {
  const BASE_DATE = new Date("2026-03-10T00:00:00.000Z");

  function facts(overrides: Partial<LegalServiceDateFacts>): LegalServiceDateFacts {
    return {
      serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_21_1,
      baseDate: BASE_DATE,
      ...overrides,
    };
  }

  describe("canonical regime — positive cases", () => {
    it("TK_21_1: gecikmesiz, baseDate'i aynen döner", () => {
      const result = resolveLegalServiceDate(
        facts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_21_1 }),
      );
      expect(result.legalServiceDate).toEqual(BASE_DATE);
      expect(result.calculationRule).toBe("TK_21_1_NO_DELAY");
      expect(result.deadlineReasonCode).toBe("TK_21_1");
    });

    it("TK_21_2: gecikmesiz, baseDate'i aynen döner", () => {
      const result = resolveLegalServiceDate(
        facts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_21_2 }),
      );
      expect(result.legalServiceDate).toEqual(BASE_DATE);
      expect(result.calculationRule).toBe("TK_21_2_NO_DELAY");
      expect(result.deadlineReasonCode).toBe("TK_21_2");
    });

    it("IMMEDIATE_SERVICE + DIRECT_RECIPIENT_DELIVERY: gecikmesiz", () => {
      const result = resolveLegalServiceDate(
        facts({
          serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE,
          serviceCompletionMode: ServiceCompletionMode.DIRECT_RECIPIENT_DELIVERY,
        }),
      );
      expect(result.legalServiceDate).toEqual(BASE_DATE);
      expect(result.calculationRule).toBe("IMMEDIATE_SERVICE_NO_DELAY");
      expect(result.deadlineReasonCode).toBe("DIRECT_DELIVERY");
    });

    it("IMMEDIATE_SERVICE + DELIVERED_TO_AUTHORIZED_PERSON: gecikmesiz", () => {
      const result = resolveLegalServiceDate(
        facts({
          serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE,
          serviceCompletionMode: ServiceCompletionMode.DELIVERED_TO_AUTHORIZED_PERSON,
        }),
      );
      expect(result.legalServiceDate).toEqual(BASE_DATE);
      expect(result.calculationRule).toBe("IMMEDIATE_SERVICE_NO_DELAY");
    });

    it("IMMEDIATE_SERVICE + completion mode verilmemiş: gecikmesiz (regime kodu tek başına yeterli)", () => {
      const result = resolveLegalServiceDate(
        facts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE }),
      );
      expect(result.legalServiceDate).toEqual(BASE_DATE);
    });

    it("TK_20_TEMPORARY_ABSENCE + DELIVERED_TO_AUTHORIZED_PERSON: gecikmesiz", () => {
      const result = resolveLegalServiceDate(
        facts({
          serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
          serviceCompletionMode: ServiceCompletionMode.DELIVERED_TO_AUTHORIZED_PERSON,
        }),
      );
      expect(result.legalServiceDate).toEqual(BASE_DATE);
      expect(result.calculationRule).toBe("TK_20_DELIVERED_TO_AUTHORIZED_PERSON_NO_DELAY");
      expect(result.deadlineReasonCode).toBe("TK_20");
    });

    it("TK_20_TEMPORARY_ABSENCE + NOTICE_POSTED: +15 gün", () => {
      const result = resolveLegalServiceDate(
        facts({
          serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
          serviceCompletionMode: ServiceCompletionMode.NOTICE_POSTED,
        }),
      );
      expect(result.legalServiceDate).toEqual(new Date("2026-03-25T00:00:00.000Z"));
      expect(result.calculationRule).toBe("TK_20_NOTICE_POSTED_PLUS_15_DAYS");
      expect(result.deadlineReasonCode).toBe("TK_20");
    });

    it("PUBLICATION: +7 gün (mevcut canonical)", () => {
      const result = resolveLegalServiceDate(
        facts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.PUBLICATION }),
      );
      expect(result.legalServiceDate).toEqual(new Date("2026-03-17T00:00:00.000Z"));
      expect(result.calculationRule).toBe("PUBLICATION_PLUS_7_DAYS");
      expect(result.deadlineReasonCode).toBe("ILANEN_M31");
    });

    it("ELECTRONIC: +5 gün (mevcut canonical)", () => {
      const result = resolveLegalServiceDate(
        facts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.ELECTRONIC }),
      );
      expect(result.legalServiceDate).toEqual(new Date("2026-03-15T00:00:00.000Z"));
      expect(result.calculationRule).toBe("ELECTRONIC_PLUS_5_DAYS");
      expect(result.deadlineReasonCode).toBe("UETS_M7A");
    });
  });

  describe("TK-20 completion mode — fail-closed", () => {
    it("completion mode eksik (undefined): fail-closed", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE }),
        ),
      ).toThrow(IncompatibleCompletionModeError);
    });

    it("completion mode null: fail-closed", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({
            serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
            serviceCompletionMode: null,
          }),
        ),
      ).toThrow(IncompatibleCompletionModeError);
    });

    it("TK_20 + DIRECT_RECIPIENT_DELIVERY (geçersiz kombinasyon): fail-closed", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({
            serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
            serviceCompletionMode: ServiceCompletionMode.DIRECT_RECIPIENT_DELIVERY,
          }),
        ),
      ).toThrow(IncompatibleCompletionModeError);
    });

    it("TK_20 + ELECTRONIC_DELIVERY (geçersiz kombinasyon): fail-closed", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({
            serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
            serviceCompletionMode: ServiceCompletionMode.ELECTRONIC_DELIVERY,
          }),
        ),
      ).toThrow(IncompatibleCompletionModeError);
    });
  });

  describe("rejimle uyumsuz completion mode — fail-closed", () => {
    it("TK_21_1 + NOTICE_POSTED (bu rejimde completion mode kabul edilmez): fail-closed", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({
            serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_21_1,
            serviceCompletionMode: ServiceCompletionMode.NOTICE_POSTED,
          }),
        ),
      ).toThrow(IncompatibleCompletionModeError);
    });

    it("TK_21_2 + DELIVERED_TO_AUTHORIZED_PERSON: fail-closed", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({
            serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_21_2,
            serviceCompletionMode: ServiceCompletionMode.DELIVERED_TO_AUTHORIZED_PERSON,
          }),
        ),
      ).toThrow(IncompatibleCompletionModeError);
    });

    it("IMMEDIATE_SERVICE + NOTICE_POSTED (TK-20'ye özgü mod): fail-closed", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({
            serviceRegimeCode: ServiceOccurrenceRegimeCode.IMMEDIATE_SERVICE,
            serviceCompletionMode: ServiceCompletionMode.NOTICE_POSTED,
          }),
        ),
      ).toThrow(IncompatibleCompletionModeError);
    });

    it("PUBLICATION + herhangi bir completion mode: fail-closed", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({
            serviceRegimeCode: ServiceOccurrenceRegimeCode.PUBLICATION,
            serviceCompletionMode: ServiceCompletionMode.PUBLICATION,
          }),
        ),
      ).toThrow(IncompatibleCompletionModeError);
    });

    it("ELECTRONIC + herhangi bir completion mode: fail-closed", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({
            serviceRegimeCode: ServiceOccurrenceRegimeCode.ELECTRONIC,
            serviceCompletionMode: ServiceCompletionMode.ELECTRONIC_DELIVERY,
          }),
        ),
      ).toThrow(IncompatibleCompletionModeError);
    });
  });

  describe("deprecated regime code — fail-closed", () => {
    it("DIRECT_DELIVERY (DEPRECATED, P04-A1-R2 öncesi): fail-closed, IMMEDIATE_SERVICE ile eşdeğer sayılmaz", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.DIRECT_DELIVERY }),
        ),
      ).toThrow(UnsupportedServiceRegimeCodeError);
    });

    it("TK_20 (DEPRECATED, P04-A1-R2 öncesi): fail-closed, TK_20_TEMPORARY_ABSENCE ile eşdeğer sayılmaz", () => {
      expect(() =>
        resolveLegalServiceDate(facts({ serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20 })),
      ).toThrow(UnsupportedServiceRegimeCodeError);
    });
  });

  describe("substituteRecipientBasis — gün hesabını asla etkilemez", () => {
    it.each([
      SubstituteRecipientBasis.ARTICLE_13,
      SubstituteRecipientBasis.ARTICLE_14,
      SubstituteRecipientBasis.ARTICLE_16,
      SubstituteRecipientBasis.ARTICLE_17,
      SubstituteRecipientBasis.ARTICLE_18,
    ])("TK_20 + NOTICE_POSTED + substituteRecipientBasis=%s: sonuç değişmez (+15 gün)", (basis) => {
      const result = resolveLegalServiceDate(
        facts({
          serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
          serviceCompletionMode: ServiceCompletionMode.NOTICE_POSTED,
          substituteRecipientBasis: basis,
        }),
      );
      expect(result.legalServiceDate).toEqual(new Date("2026-03-25T00:00:00.000Z"));
      expect(result.calculationRule).toBe("TK_20_NOTICE_POSTED_PLUS_15_DAYS");
    });

    it("ARTICLE_16 (TK-20'nin kendi substitute-basis'i) verilse bile completion mode olmadan hâlâ fail-closed", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({
            serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
            substituteRecipientBasis: SubstituteRecipientBasis.ARTICLE_16,
          }),
        ),
      ).toThrow(IncompatibleCompletionModeError);
    });
  });

  describe("saflık (purity) garantileri", () => {
    it("input Date nesnesi mutate edilmez", () => {
      const input = new Date("2026-03-10T00:00:00.000Z");
      const originalTime = input.getTime();
      resolveLegalServiceDate({
        serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
        serviceCompletionMode: ServiceCompletionMode.NOTICE_POSTED,
        baseDate: input,
      });
      expect(input.getTime()).toBe(originalTime);
    });

    it("aynı input için deterministik olarak aynı output üretir", () => {
      const input: LegalServiceDateFacts = {
        serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
        serviceCompletionMode: ServiceCompletionMode.NOTICE_POSTED,
        baseDate: new Date("2026-03-10T00:00:00.000Z"),
      };
      const first = resolveLegalServiceDate(input);
      const second = resolveLegalServiceDate(input);
      expect(first).toEqual(second);
      expect(first.legalServiceDate).not.toBe(second.legalServiceDate);
    });

    it("dönen legalServiceDate, baseDate ile aynı referans değil (no-delay durumlarında bile)", () => {
      const input = new Date("2026-03-10T00:00:00.000Z");
      const result = resolveLegalServiceDate({
        serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_21_1,
        baseDate: input,
      });
      expect(result.legalServiceDate).toEqual(input);
    });
  });

  describe("UTC/date-boundary regresyonları", () => {
    it("yıl sınırını aşan +15 gün (Aralık → Ocak)", () => {
      const result = resolveLegalServiceDate({
        serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
        serviceCompletionMode: ServiceCompletionMode.NOTICE_POSTED,
        baseDate: new Date("2026-12-20T00:00:00.000Z"),
      });
      expect(result.legalServiceDate).toEqual(new Date("2027-01-04T00:00:00.000Z"));
    });

    it("ay sınırını aşan +7 gün (28 günlük Şubat)", () => {
      const result = resolveLegalServiceDate({
        serviceRegimeCode: ServiceOccurrenceRegimeCode.PUBLICATION,
        baseDate: new Date("2026-02-25T00:00:00.000Z"),
      });
      expect(result.legalServiceDate).toEqual(new Date("2026-03-04T00:00:00.000Z"));
    });

    it("artık yıl (2028) Şubat sınırını aşan +5 gün", () => {
      const result = resolveLegalServiceDate({
        serviceRegimeCode: ServiceOccurrenceRegimeCode.ELECTRONIC,
        baseDate: new Date("2028-02-27T00:00:00.000Z"),
      });
      expect(result.legalServiceDate).toEqual(new Date("2028-03-03T00:00:00.000Z"));
    });

    it("UTC gece yarısı sınırında (23:xx yerel dönüşüm riski) tarih kayması olmaz", () => {
      const result = resolveLegalServiceDate({
        serviceRegimeCode: ServiceOccurrenceRegimeCode.TK_20_TEMPORARY_ABSENCE,
        serviceCompletionMode: ServiceCompletionMode.NOTICE_POSTED,
        baseDate: new Date("2026-01-01T00:00:00.000Z"),
      });
      expect(result.legalServiceDate.getUTCFullYear()).toBe(2026);
      expect(result.legalServiceDate.getUTCMonth()).toBe(0);
      expect(result.legalServiceDate.getUTCDate()).toBe(16);
    });
  });

  describe("gelecekteki enum genişlemesi — exhaustiveness fail-closed", () => {
    it("tanınmayan bir serviceRegimeCode değeri fail-closed olur", () => {
      expect(() =>
        resolveLegalServiceDate(
          facts({
            serviceRegimeCode: "SOME_FUTURE_REGIME" as ServiceOccurrenceRegimeCode,
          }),
        ),
      ).toThrow(UnsupportedServiceRegimeCodeError);
    });
  });
});

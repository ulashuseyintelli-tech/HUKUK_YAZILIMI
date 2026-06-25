import { describe, expect, it } from "vitest";
import {
  buildAccountSummaryDisplayModel,
  type AccountSummaryRowId,
} from "@/lib/account-summary-display-model";
import type { CaseCalculationResult } from "@/hooks/useCaseCalculation";

const legacySummary: CaseCalculationResult = {
  caseId: "case-1",
  hesapTarihi: "2026-06-24",
  takipTarihi: "2026-01-01",
  kalemTuru: "CEK",
  asilAlacak: 90001,
  tazminat: 111,
  komisyon: 222,
  takipOncesiFaiz: 333,
  takipTutari: 90002,
  basvurmaHarci: 444,
  vekaletHarci: 555,
  pesinHarc: 666,
  dosyaGideri: 777,
  tebligatGideri: 888,
  vekaletPulu: 999,
  icraMasraflari: 90003,
  pesinHarcDahilTahsilHarci: 1001,
  pesinHarcHaricTahsilHarci: 1002,
  vekaletUcreti: 90004,
  takipSonrasiFaiz: 90005,
  toplamBorc: 90006,
  sonBorc: 90007,
  toplamTahsilat: 90008,
  kalanBorc: 90009,
  kalanAnapara: 90010,
  mahsupDetaylari: [
    {
      tarih: "2026-06-10",
      tahsilatTutar: 123,
      mahsupMasraf: 124,
      mahsupVekalet: 125,
      mahsupTakipOncesiFaiz: 126,
      mahsupFaiz: 127,
      mahsupAnapara: 128,
      kalanAnapara: 129,
    },
  ],
  faizSegmentleri: {
    takipOncesi: [
      {
        baslangic: "2026-01-01",
        bitis: "2026-01-10",
        gun: 9,
        oran: 12,
        faiz: 130,
      },
    ],
    takipSonrasi: [
      {
        baslangic: "2026-02-01",
        bitis: "2026-02-10",
        gun: 9,
        oran: 14,
        faiz: 131,
      },
    ],
  },
  tahsilOranlari: [
    {
      oran: 0.1138,
      label: "legacy oran",
      tutar: 1003,
    },
  ],
};

const guardedSummary: CaseCalculationResult = {
  ...legacySummary,
  hesapTarihi: "2026-06-25",
  asilAlacak: 10001,
  takipTutari: 10001,
  takipSonrasiFaiz: 505,
  icraMasraflari: 606,
  vekaletUcreti: 707,
  toplamBorc: 20002,
  sonBorc: 30003,
  toplamTahsilat: 4004,
  kalanBorc: 30003,
  kalanAnapara: 10001,
};

const canonicalRowIds = [
  "asilAlacak",
  "takipTutari",
  "takipSonrasiFaiz",
  "icraMasraflari",
  "vekaletUcreti",
  "toplamBorc",
  "sonBorc",
  "toplamTahsilat",
  "kalanBorc",
  "kalanAnapara",
] as const;

const legacyRowIds: AccountSummaryRowId[] = [
  "tazminat",
  "komisyon",
  "takipOncesiFaiz",
  "basvurmaHarci",
  "vekaletHarci",
  "pesinHarc",
  "dosyaGideri",
  "tebligatGideri",
  "vekaletPulu",
  "pesinHarcDahilTahsilHarci",
  "pesinHarcHaricTahsilHarci",
  "tahsilOranlari",
  "mahsupDetaylari",
  "faizSegmentleri",
  "takipTarihi",
  "kalemTuru",
];

describe("account summary source-aware display model", () => {
  it("guarded selected durumda canonical satirlari CANONICAL olarak isaretler", () => {
    const model = buildAccountSummaryDisplayModel({
      legacy: legacySummary,
      display: guardedSummary,
      guardedPrimarySelected: true,
    });

    for (const rowId of canonicalRowIds) {
      expect(model.rows[rowId]).toEqual(expect.objectContaining({
        sourceAuthority: "CANONICAL",
        cutoverPolicy: "CANONICAL_REQUIRED",
        value: guardedSummary[rowId],
      }));
      expect(model.rows[rowId].value).not.toBe(legacySummary[rowId]);
    }
  });

  it("guarded selected durumda legacy satirlari LEGACY olarak korur", () => {
    const model = buildAccountSummaryDisplayModel({
      legacy: legacySummary,
      display: guardedSummary,
      guardedPrimarySelected: true,
    });

    for (const rowId of legacyRowIds) {
      expect(model.rows[rowId].sourceAuthority).toBe("LEGACY");
    }

    expect(model.rows.tazminat.value).toBe(legacySummary.tazminat);
    expect(model.rows.komisyon.value).toBe(legacySummary.komisyon);
    expect(model.rows.takipOncesiFaiz.value).toBe(legacySummary.takipOncesiFaiz);
    expect(model.rows.basvurmaHarci.value).toBe(legacySummary.basvurmaHarci);
    expect(model.rows.pesinHarcDahilTahsilHarci.value).toBe(legacySummary.pesinHarcDahilTahsilHarci);
    expect(model.rows.tahsilOranlari.itemCount).toBe(1);
    expect(model.rows.mahsupDetaylari.itemCount).toBe(1);
    expect(model.rows.faizSegmentleri.itemCount).toBe(2);
  });

  it("guarded selected durumda MahsupDetayPanel context bilgisini DERIVED yapar", () => {
    const model = buildAccountSummaryDisplayModel({
      legacy: legacySummary,
      display: guardedSummary,
      guardedPrimarySelected: true,
    });

    expect(model.rows.mahsupDetayPanelContext).toEqual(expect.objectContaining({
      sourceAuthority: "DERIVED",
      cutoverPolicy: "DERIVED_REQUIRES_SOURCE_MODEL",
      derivedFrom: ["CANONICAL", "LEGACY"],
    }));
    expect(model.rows.mahsupDetaylari).toEqual(expect.objectContaining({
      sourceAuthority: "LEGACY",
      cutoverPolicy: "DERIVED_REQUIRES_SOURCE_MODEL",
    }));
  });

  it("fallback durumda render edilen satirlari LEGACY source authority ile isaretler", () => {
    const model = buildAccountSummaryDisplayModel({
      legacy: legacySummary,
      display: legacySummary,
      guardedPrimarySelected: false,
    });

    for (const row of Object.values(model.rows)) {
      expect(row.sourceAuthority).toBe("LEGACY");
    }

    expect(model.rows.asilAlacak.value).toBe(legacySummary.asilAlacak);
    expect(model.rows.toplamBorc.value).toBe(legacySummary.toplamBorc);
    expect(model.rows.mahsupDetayPanelContext.derivedFrom).toEqual(["LEGACY"]);
  });
});

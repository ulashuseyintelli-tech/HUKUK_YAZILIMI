import { describe, expect, it } from "vitest";
import {
  buildAccountSummaryDisplayModel,
  buildAccountSummarySourcePlacementPlan,
  evaluateAccountSummarySourceAuthorityPolicy,
  type AccountSummaryDisplayModel,
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
describe("account summary source authority policy", () => {
  function guardedModel() {
    return buildAccountSummaryDisplayModel({
      legacy: legacySummary,
      display: guardedSummary,
      guardedPrimarySelected: true,
    });
  }

  function blockerRowIds(model: AccountSummaryDisplayModel) {
    return evaluateAccountSummarySourceAuthorityPolicy(model).blockers.map((blocker) => blocker.rowId);
  }

  it("current guarded selected mixed authority model controlled cutover icin ready degildir", () => {
    const model = guardedModel();
    const result = evaluateAccountSummarySourceAuthorityPolicy(model);

    expect(result.readyForControlledCutover).toBe(false);
    expect(result.blockers.length).toBeGreaterThan(0);
    expect(blockerRowIds(model)).toEqual(expect.arrayContaining([
      "tazminat",
      "komisyon",
      "takipOncesiFaiz",
      "basvurmaHarci",
      "pesinHarcDahilTahsilHarci",
      "mahsupDetaylari",
      "mahsupDetayPanelContext",
    ]));
  });

  it("canonical-required guarded rows CANONICAL ise blocker uretmez", () => {
    const result = evaluateAccountSummarySourceAuthorityPolicy(guardedModel());
    const blockerIds = result.blockers.map((blocker) => blocker.rowId);

    for (const rowId of canonicalRowIds) {
      expect(blockerIds).not.toContain(rowId);
    }
  });

  it.each(["LEGACY", "DERIVED", "UNKNOWN"] as const)(
    "canonical-required row %s olursa blocker uretir",
    (sourceAuthority) => {
      const model = guardedModel();
      model.rows.asilAlacak = {
        ...model.rows.asilAlacak,
        sourceAuthority,
      };

      const result = evaluateAccountSummarySourceAuthorityPolicy(model);

      expect(result.readyForControlledCutover).toBe(false);
      expect(result.blockers).toEqual(expect.arrayContaining([
        expect.objectContaining({
          rowId: "asilAlacak",
          sourceAuthority,
          policy: "CANONICAL_REQUIRED",
          reason: expect.stringContaining("Canonical-required row"),
        }),
      ]));
    },
  );

  it("fallback legacy display safe davranistir ama controlled cutover candidate degildir", () => {
    const model = buildAccountSummaryDisplayModel({
      legacy: legacySummary,
      display: legacySummary,
      guardedPrimarySelected: false,
    });
    const result = evaluateAccountSummarySourceAuthorityPolicy(model);

    expect(result.readyForControlledCutover).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rowId: "displaySurface",
        sourceAuthority: "LEGACY",
        policy: "CONTROLLED_CUTOVER_CANDIDATE_REQUIRED",
      }),
    ]));
  });

  it("DERIVED MahsupDetayPanel context controlled cutover icin blocker kalir", () => {
    const result = evaluateAccountSummarySourceAuthorityPolicy(guardedModel());

    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({
        rowId: "mahsupDetayPanelContext",
        sourceAuthority: "DERIVED",
        policy: "DERIVED_REQUIRES_SOURCE_MODEL",
        reason: expect.stringContaining("Derived or mixed row"),
      }),
    ]));
  });

  it("synthetic all-canonical row set controlled cutover policy gateinden gecebilir", () => {
    const model = guardedModel();
    const allCanonicalModel: AccountSummaryDisplayModel = {
      ...model,
      rows: Object.fromEntries(
        Object.entries(model.rows).map(([rowId, row]) => [
          rowId,
          {
            ...row,
            sourceAuthority: "CANONICAL",
            cutoverPolicy: "CANONICAL_REQUIRED",
          },
        ]),
      ) as AccountSummaryDisplayModel["rows"],
    };

    const result = evaluateAccountSummarySourceAuthorityPolicy(allCanonicalModel);

    expect(result.readyForControlledCutover).toBe(true);
    expect(result.blockers).toEqual([]);
  });
});
describe("account summary source placement policy", () => {
  function guardedModel() {
    return buildAccountSummaryDisplayModel({
      legacy: legacySummary,
      display: guardedSummary,
      guardedPrimarySelected: true,
    });
  }

  function placementFor(rowId: AccountSummaryRowId, model = guardedModel()) {
    const plan = buildAccountSummarySourcePlacementPlan(model);
    const placement = plan.placements.find((item) => item.rowId === rowId);
    expect(placement).toBeDefined();
    return placement!;
  }

  it("current guarded selected model icin row-by-row placement plan uretir", () => {
    const model = guardedModel();
    const plan = buildAccountSummarySourcePlacementPlan(model);

    expect(plan.guardedPrimarySelected).toBe(true);
    expect(plan.placements).toHaveLength(Object.keys(model.rows).length);
    expect(plan.placements[0]).toEqual(expect.objectContaining({
      rowId: expect.any(String),
      sourceAuthority: expect.any(String),
      cutoverPolicy: expect.any(String),
      placement: expect.any(String),
      reason: expect.any(String),
    }));
  });

  it("current primary canonical rows PRIMARY_CANONICAL_ELIGIBLE olarak siniflanir", () => {
    const plan = buildAccountSummarySourcePlacementPlan(guardedModel());

    expect(plan.summary.primaryCanonicalEligibleRowIds).toEqual([...canonicalRowIds]);
    for (const rowId of canonicalRowIds) {
      expect(placementFor(rowId)).toEqual(expect.objectContaining({
        rowId,
        sourceAuthority: "CANONICAL",
        cutoverPolicy: "CANONICAL_REQUIRED",
        placement: "PRIMARY_CANONICAL_ELIGIBLE",
      }));
    }
  });

  it("tazminat komisyon ve takipOncesiFaiz backend contract gerektirir", () => {
    for (const rowId of ["tazminat", "komisyon", "takipOncesiFaiz"] as const) {
      expect(placementFor(rowId)).toEqual(expect.objectContaining({
        rowId,
        sourceAuthority: "LEGACY",
        placement: "BACKEND_CONTRACT_REQUIRED",
      }));
    }
  });

  it("fee cost ve harc detay rows DIAGNOSTIC_LEGACY_ALLOWED olarak siniflanir", () => {
    const rowIds: AccountSummaryRowId[] = [
      "basvurmaHarci",
      "vekaletHarci",
      "pesinHarc",
      "dosyaGideri",
      "tebligatGideri",
      "vekaletPulu",
    ];

    for (const rowId of rowIds) {
      expect(placementFor(rowId)).toEqual(expect.objectContaining({
        rowId,
        sourceAuthority: "LEGACY",
        placement: "DIAGNOSTIC_LEGACY_ALLOWED",
      }));
    }
  });

  it("collection fee harc alternative projection rows DIAGNOSTIC_LEGACY_ALLOWED olarak siniflanir", () => {
    for (const rowId of ["pesinHarcDahilTahsilHarci", "pesinHarcHaricTahsilHarci"] as const) {
      expect(placementFor(rowId)).toEqual(expect.objectContaining({
        rowId,
        sourceAuthority: "LEGACY",
        placement: "DIAGNOSTIC_LEGACY_ALLOWED",
      }));
    }
  });

  it("legacy explanatory rows DIAGNOSTIC_LEGACY_ALLOWED olarak siniflanir", () => {
    for (const rowId of ["tahsilOranlari", "faizSegmentleri", "takipTarihi", "kalemTuru"] as const) {
      expect(placementFor(rowId)).toEqual(expect.objectContaining({
        rowId,
        sourceAuthority: "LEGACY",
        placement: "DIAGNOSTIC_LEGACY_ALLOWED",
      }));
    }
  });

  it("mahsupDetaylari source LEGACY kaldigi surece DIAGNOSTIC_LEGACY_ALLOWED olur", () => {
    expect(placementFor("mahsupDetaylari")).toEqual(expect.objectContaining({
      rowId: "mahsupDetaylari",
      sourceAuthority: "LEGACY",
      placement: "DIAGNOSTIC_LEGACY_ALLOWED",
    }));
    expect(placementFor("mahsupDetaylari").placement).not.toBe("DIAGNOSTIC_DERIVED_ALLOWED");
  });

  it("hesapTarihi DIAGNOSTIC_DERIVED_ALLOWED olarak siniflanir", () => {
    expect(placementFor("hesapTarihi")).toEqual(expect.objectContaining({
      rowId: "hesapTarihi",
      sourceAuthority: "DERIVED",
      placement: "DIAGNOSTIC_DERIVED_ALLOWED",
    }));
  });

  it("mahsupDetayPanelContext BLOCKED_MIXED_AUTHORITY olarak siniflanir", () => {
    const plan = buildAccountSummarySourcePlacementPlan(guardedModel());

    expect(placementFor("mahsupDetayPanelContext")).toEqual(expect.objectContaining({
      rowId: "mahsupDetayPanelContext",
      sourceAuthority: "DERIVED",
      placement: "BLOCKED_MIXED_AUTHORITY",
    }));
    expect(plan.summary.blockedRowIds).toContain("mahsupDetayPanelContext");
  });

  it("UNKNOWN source authority BLOCKED_UNKNOWN_SOURCE olarak siniflanir", () => {
    const model = guardedModel();
    model.rows.asilAlacak = {
      ...model.rows.asilAlacak,
      sourceAuthority: "UNKNOWN",
    };

    const plan = buildAccountSummarySourcePlacementPlan(model);

    expect(placementFor("asilAlacak", model)).toEqual(expect.objectContaining({
      rowId: "asilAlacak",
      sourceAuthority: "UNKNOWN",
      placement: "BLOCKED_UNKNOWN_SOURCE",
    }));
    expect(plan.summary.blockedRowIds).toContain("asilAlacak");
  });

  it("canonical source tek basina primary placement icin yeterli degildir", () => {
    const model = guardedModel();
    model.rows.tazminat = {
      ...model.rows.tazminat,
      sourceAuthority: "CANONICAL",
    };

    const placement = placementFor("tazminat", model);

    expect(placement.sourceAuthority).toBe("CANONICAL");
    expect(placement.placement).toBe("BACKEND_CONTRACT_REQUIRED");
    expect(placement.placement).not.toBe("PRIMARY_CANONICAL_ELIGIBLE");
  });

  it("fallback legacy state controlled primary cutover readiness ile karistirilmaz", () => {
    const model = buildAccountSummaryDisplayModel({
      legacy: legacySummary,
      display: legacySummary,
      guardedPrimarySelected: false,
    });
    const plan = buildAccountSummarySourcePlacementPlan(model);
    const result = evaluateAccountSummarySourceAuthorityPolicy(model);

    expect(plan.summary.primaryCanonicalEligibleRowIds).not.toContain("asilAlacak");
    expect(plan.summary.blockedRowIds).toEqual(expect.arrayContaining(["asilAlacak"]));
    expect(result.readyForControlledCutover).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowId: "displaySurface" }),
    ]));
  });

  it("TM11 evaluator readiness semantics degismeden conservative kalir", () => {
    const result = evaluateAccountSummarySourceAuthorityPolicy(guardedModel());

    expect(result.readyForControlledCutover).toBe(false);
    expect(result.blockers).toEqual(expect.arrayContaining([
      expect.objectContaining({ rowId: "tazminat" }),
      expect.objectContaining({ rowId: "mahsupDetayPanelContext" }),
    ]));
  });
});

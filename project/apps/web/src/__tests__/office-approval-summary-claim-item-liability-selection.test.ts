import { describe, it, expect } from "vitest";
import { getApprovalSummary } from "@/components/office-approval/summary/registry";
import { LIABILITY_SELECTION_UNSUPPORTED_REASON } from "@/components/office-approval/summary/claim-item-liability-selection.projector";
import { UNSAFE_SUMMARY_REASON } from "@/components/office-approval/summary/types";
import { actionLabel } from "@/components/office-approval/labels";

// Sentetik değerler; gerçek dosya / kişi bilgisi YOK.
const CAPPED_INTENT = {
  version: "CLAIM_ITEM_LIABILITY_SELECTION_V1",
  operation: "LIABILITY_SELECTION",
  caseId: "case-s1",
  appliedVia: "SINGLE",
  bulkOperationId: null,
  reason: "Borçlu sorumluluğu seçimi yüksek etkili kalem değişikliğidir; iki kişi onayı gerekir.",
  selections: [
    {
      claimItemId: "item-s1",
      mode: "CAPPED",
      limitScope: "ITEM_AMOUNT",
      basis: "LAWYER_ASSESSMENT",
      basisNote: "Sentetik açıklama",
      basisDocumentId: null,
      parties: [{ caseDebtorId: "cd-s1", shareWeight: null, limitAmount: "400.00", unlimited: false, sortOrder: 0 }],
      stateDigest: "sha256:x",
      display: {
        kalem: "Sentetik asıl alacak",
        tur: "TUTARLA_SINIRLI",
        taraflar: ["Sentetik Borçlu: tavan 400.00 (yalnız bu kalemin tutarı)"],
        dayanak: "LAWYER_ASSESSMENT",
      },
    },
  ],
};

const fieldsOf = (intent: unknown) => {
  const result = getApprovalSummary("CLAIM_ITEM_HIGH_IMPACT_CHANGE", intent);
  return { result, map: Object.fromEntries(result.fields.map((field) => [field.label, field])) };
};

describe("Onay Kutusu — borçlu sorumluluğu seçimi özeti (U-1 / U-4)", () => {
  it("tutarla sınırlı tek kalem: Türkçe tür, borçlu + tavan, kapsam, dayanak, açıklama; ham kod yok", () => {
    const { result, map } = fieldsOf(CAPPED_INTENT);
    expect(result.kind).toBe("summary");
    expect(map["Uygulama"].value).toBe("Tek kalem");
    expect(map["Kalem"].value).toBe("Sentetik asıl alacak");
    expect(map["Sorumluluk türü"].value).toBe("Tutarla sınırlı");
    // Kayıttaki satır Türkçe biçimle (yalnız tutar biçimi değişir); gerekçe başlıkta olduğu için özette tekrar edilmez.
    expect(map["Borçlular / pay / tavan"].value).toBe("Sentetik Borçlu: tavan 400,00 (yalnız bu kalemin tutarı)");
    expect(map["Gerekçe"]).toBeUndefined();
    expect(map["Tavan kapsamı"].value).toMatch(/Yalnız bu kalemin kayıtlı tutarı/);
    expect(map["Dayanak"].value).toBe("Avukat değerlendirmesi");
    expect(map["Açıklama"].value).toBe("Sentetik açıklama");
    expect(map["Dayanak belgesi"]).toBeUndefined();
    const text = JSON.stringify(result.fields);
    for (const code of ["CAPPED", "TUTARLA_SINIRLI", "LAWYER_ASSESSMENT", "ITEM_AMOUNT", "item-s1", "cd-s1"]) {
      expect(text).not.toContain(code);
    }
    expect(result.impactNotes).toEqual([
      "Onaylanınca seçim kaleme yazılır; önceki tahsilat ve mahsup kayıtları değiştirilmez.",
      "Borçlunun sorumluluğunu aşan ödeme başka borçluya aktarılmaz; borçlu adına fazla ödeme olarak izlenir.",
    ]);
    expect(actionLabel("CLAIM_ITEM_HIGH_IMPACT_CHANGE", CAPPED_INTENT)).toBe("Borçlu sorumluluğu seçimi");
  });

  it("toplu paylı + müteselsil: kalem başına önekli alanlar; belge bağlıysa yalnız 'Belge bağlı' (kimlik yok)", () => {
    const bulk = {
      ...CAPPED_INTENT,
      appliedVia: "BULK",
      selections: [
        {
          ...CAPPED_INTENT.selections[0],
          claimItemId: "item-a",
          mode: "PROPORTIONAL",
          limitScope: null,
          basis: "CONTRACT",
          basisNote: null,
          basisDocumentId: "doc-secret-1",
          parties: [
            { caseDebtorId: "cd-a", shareWeight: 1, limitAmount: null, unlimited: false, sortOrder: 0 },
            { caseDebtorId: "cd-b", shareWeight: 1, limitAmount: null, unlimited: false, sortOrder: 1 },
          ],
          display: { kalem: "Kalem A", tur: "PAYLI", taraflar: ["Borçlu A: pay ağırlığı 1 / 2", "Borçlu B: pay ağırlığı 1 / 2"], dayanak: "CONTRACT" },
        },
        {
          ...CAPPED_INTENT.selections[0],
          claimItemId: "item-b",
          mode: "JOINT_AND_SEVERAL",
          limitScope: null,
          basis: "COURT_JUDGMENT",
          basisNote: null,
          parties: [{ caseDebtorId: "cd-a", shareWeight: null, limitAmount: null, unlimited: false, sortOrder: 0 }],
          display: { kalem: "Kalem B", tur: "MUTESELSIL", taraflar: ["Borçlu A"], dayanak: "COURT_JUDGMENT" },
        },
      ],
    };
    const { result, map } = fieldsOf(bulk);
    expect(result.kind).toBe("summary");
    expect(map["Uygulama"].value).toBe("Toplu (2 kalem)");
    expect(map["1. kalem · Sorumluluk türü"].value).toBe("Paylı");
    expect(map["1. kalem · Borçlular / pay / tavan"].value).toBe("Borçlu A: pay ağırlığı 1 / 2; Borçlu B: pay ağırlığı 1 / 2");
    expect(map["1. kalem · Dayanak"].value).toBe("Sözleşme");
    expect(map["1. kalem · Dayanak belgesi"].value).toBe("Belge bağlı");
    expect(map["1. kalem · Tavan kapsamı"]).toBeUndefined();
    expect(map["2. kalem · Sorumluluk türü"].value).toBe("Müteselsil");
    expect(map["2. kalem · Dayanak"].value).toBe("İlam / mahkeme kararı");
    expect(JSON.stringify(result.fields)).not.toContain("doc-secret-1");
  });

  it("kayıtlı özet (display) yoksa ad UYDURULMAZ: eksiklik uyarı tonuyla, pay / tavan yalnız yapısal veriden", () => {
    const { display: _omit, ...withoutDisplay } = CAPPED_INTENT.selections[0];
    const { result, map } = fieldsOf({ ...CAPPED_INTENT, selections: [withoutDisplay] });
    expect(result.kind).toBe("summary");
    expect(map["Kalem"]).toEqual({ label: "Kalem", value: "Kalem adı kayıtta yok", tone: "warning" });
    expect(map["Borçlular / pay / tavan"]).toEqual({
      label: "Borçlular / pay / tavan",
      value: "1. borçlu (adı kayıtta yok): tavan 400,00",
      tone: "warning",
    });
  });

  it("tanınmayan tür / dayanak / kapsam ve eksik zorunlu açıklama açıkça işaretlenir", () => {
    const odd = {
      ...CAPPED_INTENT,
      selections: [{ ...CAPPED_INTENT.selections[0], mode: "FUTURE_MODE", basis: "OTHER", basisNote: "", limitScope: "SOMETHING" }],
    };
    const { map } = fieldsOf(odd);
    expect(map["Sorumluluk türü"]).toMatchObject({ value: "Tanımsız tür", tone: "warning" });
    expect(map["Tavan kapsamı"]).toMatchObject({ value: "Tanımsız kapsam", tone: "warning" });
    expect(map["Dayanak"].value).toBe("Diğer");
    expect(map["Açıklama"]).toMatchObject({ value: "Açıklama kayıtta yok", tone: "warning" });
  });

  it("belirlenmedi seçimi: borçlu seçilmez", () => {
    const undetermined = {
      ...CAPPED_INTENT,
      selections: [
        { ...CAPPED_INTENT.selections[0], mode: "UNDETERMINED", limitScope: null, basis: null, basisNote: null, parties: [], display: { kalem: "K", tur: "BELIRLENMEDI", taraflar: [], dayanak: null } },
      ],
    };
    const { result, map } = fieldsOf(undetermined);
    expect(map["Sorumluluk türü"].value).toBe("Belirlenmedi");
    expect(map["Borçlular"].value).toBe("Borçlu seçilmez");
    expect(map["Dayanak"]).toBeUndefined();
    expect(result.impactNotes).toEqual(["Onaylanınca seçim kaleme yazılır; önceki tahsilat ve mahsup kayıtları değiştirilmez."]);
  });

  it("eski / tanınmayan sürüm ve bozuk seçim → özet yok, açık gerekçe (uydurma yok)", () => {
    for (const intent of [
      { ...CAPPED_INTENT, version: "CLAIM_ITEM_LIABILITY_SELECTION_V0" },
      { ...CAPPED_INTENT, selections: [] },
      { ...CAPPED_INTENT, selections: [{ mode: "CAPPED" }] },
    ]) {
      const result = getApprovalSummary("CLAIM_ITEM_HIGH_IMPACT_CHANGE", intent);
      expect(result).toEqual({ kind: "unsafe", fields: [], reason: LIABILITY_SELECTION_UNSUPPORTED_REASON });
    }
  });

  it("aynı eylem kodunun diğer işlemleri (alan yaması) bugünkü güvenli geri dönüşte kalır", () => {
    const patch = { version: "OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1", operation: "UPDATE", caseId: "c", proposedPatch: { amount: "1" } };
    expect(getApprovalSummary("CLAIM_ITEM_HIGH_IMPACT_CHANGE", patch)).toEqual({ kind: "unsafe", fields: [], reason: UNSAFE_SUMMARY_REASON });
    expect(getApprovalSummary("CLAIM_ITEM_HIGH_IMPACT_CHANGE", null)).toEqual({ kind: "unsafe", fields: [], reason: UNSAFE_SUMMARY_REASON });
    expect(actionLabel("CLAIM_ITEM_HIGH_IMPACT_CHANGE", patch)).toBe("Alacak kalemi — yüksek etkili değişiklik");
  });
});

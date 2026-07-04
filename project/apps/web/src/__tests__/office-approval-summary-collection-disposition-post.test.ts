import { describe, it, expect } from "vitest";
import { projectCollectionDispositionPost } from "@/components/office-approval/summary/collection-disposition-post.projector";

const FULL_PAYLOAD = {
  version: "S9H_COLLECTION_DISPOSITION_POST_INTENT_V1",
  policyVersion: "S9H-1",
  actionCode: "COLLECTION_DISPOSITION_POST",
  targetType: "COLLECTION_DISPOSITION",
  targetRef: "disp-1",
  tenantId: "t1",
  caseId: "case-1",
  collectionId: "col-1",
  dispositionId: "disp-1",
  totalAmount: "125000.00",
  currency: "TRY",
  lines: [
    { id: "l1", type: "CLIENT_PAYABLE", amount: "100000.00", caseClientId: "cc-1", note: null },
    { id: "l2", type: "CONTRACTUAL_FEE_WITHHELD", amount: "25000.00", caseClientId: null, note: null },
  ],
  risk: {
    decision: "REQUIRE_APPROVAL",
    priorityRank: 1,
    reasons: [{ code: "HIGH_VALUE_TRANSACTION", severity: "WARNING", publicMessage: "Yüksek tutarlı işlem." }],
  },
  visibility: {
    version: "S9H_FINANCE_APPROVAL_DETAIL_MASKING_V1",
    summaryContainsRawSavedIntent: false,
    detailRequiresServerSideMasking: true,
    levels: ["FULL", "SUMMARY", "MASKED", "HIDDEN"],
    sensitiveFields: [],
  },
};

const MASKED_PAYLOAD = {
  version: FULL_PAYLOAD.version,
  policyVersion: FULL_PAYLOAD.policyVersion,
  actionCode: FULL_PAYLOAD.actionCode,
  targetType: FULL_PAYLOAD.targetType,
  targetRef: FULL_PAYLOAD.targetRef,
  totalAmount: FULL_PAYLOAD.totalAmount,
  currency: FULL_PAYLOAD.currency,
  lineCount: 2,
  risk: FULL_PAYLOAD.risk,
  visibility: FULL_PAYLOAD.visibility,
};

describe("projectCollectionDispositionPost", () => {
  it("geçerli tam payload -> summary; dosya/tahsilat/tutar/kalemler/risk alanları doğru", () => {
    const result = projectCollectionDispositionPost(FULL_PAYLOAD, {});
    expect(result.kind).toBe("summary");
    const labels = result.fields.map((f) => f.label);
    expect(labels).toContain("Dosya");
    expect(labels).toContain("Tahsilat");
    expect(labels).toContain("Toplam Tutar");
    expect(labels).toContain("Kalem Sayısı");
    expect(labels).toContain("Müvekkile Ödenecek"); // line-type label
    expect(labels).toContain("Kesilen Akdi Ücret");
    expect(labels).toContain("Risk");
    expect(labels).toContain("Gerekçe");

    const totalField = result.fields.find((f) => f.label === "Toplam Tutar");
    expect(totalField?.value).toContain("125.000,00");
    expect(totalField?.value).toContain("TRY");

    const clientPayableField = result.fields.find((f) => f.label === "Müvekkile Ödenecek");
    expect(clientPayableField?.value).toContain("100.000,00");
    expect(clientPayableField?.value).toContain("cc-1");
  });

  it("FALLBACK: ctx.financeVisibility YOKSA payload şekline (lines yok+lineCount var) bakılır -> gizli", () => {
    const result = projectCollectionDispositionPost(MASKED_PAYLOAD, {});
    expect(result.kind).toBe("summary");
    const labels = result.fields.map((f) => f.label);
    expect(labels).not.toContain("Dosya"); // caseId MASKED modda yok
    expect(labels).not.toContain("Tahsilat"); // collectionId MASKED modda yok
    expect(labels).not.toContain("Müvekkile Ödenecek"); // satır dökümü yok
    expect(labels).toContain("Toplam Tutar");
    expect(labels).toContain("Risk");

    const countField = result.fields.find((f) => f.label === "Kalem Sayısı");
    expect(countField?.value).toBe("2 (detay gizli)");
  });

  it("BİRİNCİL SİNYAL: FULL-şekilli payload (lines dolu) ama ctx.financeVisibility.level='MASKED' ise -> satır detayı YİNE gizlenir (şekil değil, sinyal karar verir)", () => {
    const result = projectCollectionDispositionPost(FULL_PAYLOAD, {
      financeVisibility: { applied: true, level: "MASKED", contractVersion: "v1", maskedFields: [] },
    });
    expect(result.kind).toBe("summary");
    const labels = result.fields.map((f) => f.label);
    expect(labels).not.toContain("Müvekkile Ödenecek");
    expect(labels).not.toContain("Kesilen Akdi Ücret");
    const countField = result.fields.find((f) => f.label === "Kalem Sayısı");
    expect(countField?.value).toBe("2 (detay gizli)");
  });

  it("BİRİNCİL SİNYAL: MASKED-şekilli payload (yalnız lineCount) ama ctx.financeVisibility.level='CONTROLLED_FULL' ise -> 'detay gizli' etiketi KULLANILMAZ (best-effort düz sayı)", () => {
    const result = projectCollectionDispositionPost(MASKED_PAYLOAD, {
      financeVisibility: { applied: true, level: "CONTROLLED_FULL", contractVersion: "v1", maskedFields: [] },
    });
    const countField = result.fields.find((f) => f.label === "Kalem Sayısı");
    expect(countField?.value).toBe("2");
    expect(countField?.value).not.toContain("gizli");
  });

  it("BİRİNCİL SİNYAL: level='LEGACY_FULL' -> tam satır detayı gösterilir (MASKED değil)", () => {
    const result = projectCollectionDispositionPost(FULL_PAYLOAD, {
      financeVisibility: { applied: false, level: "LEGACY_FULL", contractVersion: null, maskedFields: [] },
    });
    const labels = result.fields.map((f) => f.label);
    expect(labels).toContain("Müvekkile Ödenecek");
  });

  it("bozuk payload (totalAmount number) -> unsafe", () => {
    const result = projectCollectionDispositionPost({ ...FULL_PAYLOAD, totalAmount: 125000 }, {});
    expect(result.kind).toBe("unsafe");
    expect(result.reason).toMatch(/güvenli özet üretilemiyor/);
    expect(result.fields).toEqual([]);
  });

  it("lines dizi değilse ve lineCount de yoksa -> kalem sayısı alanı eklenmez ama summary kalır", () => {
    const { lines, ...withoutLines } = FULL_PAYLOAD;
    const result = projectCollectionDispositionPost(withoutLines, {});
    expect(result.kind).toBe("summary");
    expect(result.fields.some((f) => f.label === "Kalem Sayısı")).toBe(false);
  });

  it("null/array/primitive payload -> unsafe (crash yok)", () => {
    expect(projectCollectionDispositionPost(null, {}).kind).toBe("unsafe");
    expect(projectCollectionDispositionPost([1, 2, 3], {}).kind).toBe("unsafe");
    expect(projectCollectionDispositionPost("string", {}).kind).toBe("unsafe");
    expect(projectCollectionDispositionPost(undefined, {}).kind).toBe("unsafe");
  });

  it("risk eksikse -> yalnız risk/gerekçe alanları atlanır, diğer alanlar kalır", () => {
    const { risk, ...withoutRisk } = FULL_PAYLOAD;
    const result = projectCollectionDispositionPost(withoutRisk, {});
    expect(result.kind).toBe("summary");
    expect(result.fields.some((f) => f.label === "Risk")).toBe(false);
    expect(result.fields.some((f) => f.label === "Toplam Tutar")).toBe(true);
  });
});

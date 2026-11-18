// Onay Kutusu — alacak kalemi alan değişikliği (UPDATE) okunur özeti. Sentetik değerler; gerçek dosya / kişi bilgisi YOK.
import { describe, it, expect } from "vitest";
import { getApprovalSummary } from "@/components/office-approval/summary/registry";
import {
  CLAIM_ITEM_UPDATE_UNSUPPORTED_REASON,
  projectClaimItemUpdate,
} from "@/components/office-approval/summary/claim-item-update.projector";

const SNAPSHOT = {
  itemType: "YARGILAMA_GIDERI",
  description: "Sentetik yargılama gideri",
  interestAccrualStatus: "UNKNOWN",
  interestStartDate: "2025-05-27T00:00:00.000Z",
  interestStartDateProvenance: null,
  interestTypeCode: "LEGAL_3095",
  interestType: "YASAL",
  interestRate: null,
  noInterestReason: null,
  noInterestConfirmedById: null,
  dueDate: null,
  sortOrder: 0,
};

const intent = (proposedPatch: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  version: "OWN29D_CLAIM_ITEM_HIGH_IMPACT_V1",
  operation: "UPDATE",
  caseId: "case-s1",
  claimItemId: "item-s1",
  proposedPatch,
  currentSnapshot: SNAPSHOT,
  currentSnapshotHash: "h",
  reason: "r",
  ...extra,
});

const values = (result: ReturnType<typeof projectClaimItemUpdate>) => Object.fromEntries(result.fields.map((f) => [f.label, f.value]));

describe("kalem alanı değişikliği özeti", () => {
  it("faiz işler + kesinleşme: yalnız değişen alanlar; sunucunun aynen yazdığı faiz türü listelenmez", () => {
    const result = projectClaimItemUpdate(
      intent({
        interestAccrualStatus: "ACCRUES",
        interestStartDate: "2026-04-08",
        interestStartDateProvenance: "JUDGMENT_FINALIZATION_DATE",
        interestTypeCode: "LEGAL_3095",
        interestType: "YASAL",
        interestRate: null,
        noInterestReason: null,
        noInterestConfirmedById: null,
      }),
      {},
    );
    expect(result.kind).toBe("summary");
    expect(values(result)).toEqual({
      Kalem: "Yargılama Gideri — Sentetik yargılama gideri",
      "Faiz durumu": "Belirlenmedi → Faiz işler",
      "Faiz başlangıcı": "27.05.2025 → 08.04.2026",
      "Faiz başlangıcının dayanağı": "Boş → Kesinleşme tarihi",
    });
    expect(result.impactNotes).toEqual(["Onaylanınca yalnız listelenen alanlar kaleme yazılır; tutar ve kalem türü değişmez."]);
  });

  it("faiz işlemez: gerekçe, boşalan başlangıç ve teyit eden 'Talep eden' (kimlik yazılmaz)", () => {
    const result = projectClaimItemUpdate(
      intent({
        interestAccrualStatus: "NO_INTEREST",
        noInterestReason: "Sentetik gerekçe",
        interestStartDate: null,
        interestEndDate: null,
        interestStartDateProvenance: null,
        interestTypeCode: null,
        interestType: null,
        interestRate: null,
        noInterestConfirmedById: "user-xyz",
      }, {
        currentSnapshot: {
          ...SNAPSHOT,
          interestEndDate: "2025-06-27T00:00:00.000Z",
          interestStartDateProvenance: "JUDGMENT_FINALIZATION_DATE",
          dueDate: "2025-05-26T00:00:00.000Z",
        },
      }),
      {},
    );
    const v = values(result);
    expect(v["Faiz durumu"]).toBe("Belirlenmedi → Faiz işlemez");
    expect(v["Faiz işlememe gerekçesi"]).toBe("Boş → Sentetik gerekçe");
    expect(v["Faiz başlangıcı"]).toBe("27.05.2025 → Boş");
    expect(v["Faiz bitişi"]).toBe("27.06.2025 → Boş");
    expect(v["Faiz başlangıcının dayanağı"]).toBe("Kesinleşme tarihi → Boş");
    expect(v).not.toHaveProperty("Vade tarihi");
    expect(v["Faizsizliği teyit eden"]).toBe("Boş → Talep eden");
    expect(JSON.stringify(result)).not.toContain("user-xyz");
  });

  it("açıklaması boş kalemde ad tür etiketinden gelir; kod yazılmaz", () => {
    const result = projectClaimItemUpdate(
      intent({ interestAccrualStatus: "ACCRUES", interestStartDateProvenance: "JUDGMENT_DATE" }, { currentSnapshot: { ...SNAPSHOT, itemType: "PRINCIPAL", description: null } }),
      {},
    );
    expect(values(result).Kalem).toBe("Asıl Alacak");
  });

  it("değişen alan yoksa uyarı tonuyla yazılır", () => {
    const result = projectClaimItemUpdate(intent({ interestTypeCode: "LEGAL_3095" }), {});
    expect(result.kind).toBe("summary");
    expect(result.fields.find((f) => f.label === "Değişiklik")).toEqual({ label: "Değişiklik", value: "Kayıtlı değere göre değişen alan yok", tone: "warning" });
  });

  it("tanınmayan alan (tutar), tanınmayan değer, bozuk tarih, eksik görüntü ya da başka sürüm → özet yok", () => {
    const unsupported = { kind: "unsafe", fields: [], reason: CLAIM_ITEM_UPDATE_UNSUPPORTED_REASON };
    expect(projectClaimItemUpdate(intent({ amount: "5" }), {})).toEqual(unsupported);
    expect(projectClaimItemUpdate(intent({ interestAccrualStatus: "MAYBE" }), {})).toEqual(unsupported);
    expect(projectClaimItemUpdate(intent({ interestStartDateProvenance: "SOMETHING" }), {})).toEqual(unsupported);
    expect(projectClaimItemUpdate(intent({ interestStartDate: "08/04/2026" }), {})).toEqual(unsupported);
    expect(projectClaimItemUpdate(intent({ interestTypeCode: "NOPE" }), {})).toEqual(unsupported);
    expect(projectClaimItemUpdate(intent({ interestAccrualStatus: "ACCRUES" }, { currentSnapshot: null }), {})).toEqual(unsupported);
    expect(projectClaimItemUpdate(intent({ interestAccrualStatus: "ACCRUES" }, { version: "X" }), {})).toEqual(unsupported);
  });

  it("kayıt defteri: UPDATE bu özete, sorumluluk seçimi kendi özetine gider", () => {
    const update = getApprovalSummary("CLAIM_ITEM_HIGH_IMPACT_CHANGE", intent({ interestAccrualStatus: "ACCRUES", interestStartDateProvenance: "JUDGMENT_DATE" }));
    expect(update.kind).toBe("summary");
    expect(update.fields.some((f) => f.label === "Faiz durumu")).toBe(true);
  });
});

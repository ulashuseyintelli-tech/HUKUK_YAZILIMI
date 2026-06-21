/**
 * G2-wire — buildSyncDueDto SAF helper: DB Due'sundan ClaimItem köprüsü DueDto'su (FATURA belge/KDV dahil).
 * DB YOK (unit). Tüm örnekler SENTETİK. Kanıt zinciri: FATURA Due → DueDto → buildClaimItemData → ClaimItem alanları.
 */
import { ClaimItemType, DocumentSourceType } from "@prisma/client";
import { buildSyncDueDto, DueForClaimItemSync } from "../case.service";
import { buildClaimItemData } from "../due-to-claim-item.mapper";

describe("buildSyncDueDto — FATURA G2-wire (belge/KDV alanları DueDto'ya taşınır)", () => {
  const faturaDue: DueForClaimItemSync = {
    id: "due-1",
    type: "PRINCIPAL",
    amount: 1200,
    dueDate: "2026-01-01",
    sourceDocumentNo: "F-2026-1",
    sourceDocumentType: DocumentSourceType.FATURA,
    hasKdv: true,
    kdvRate: 20,
    kdvAmount: 200,
  };

  it("5 FATURA alanı DueDto'ya geçer", () => {
    const dto = buildSyncDueDto(faturaDue);
    expect(dto.sourceDocumentNo).toBe("F-2026-1");
    expect(dto.sourceDocumentType).toBe(DocumentSourceType.FATURA);
    expect(dto.hasKdv).toBe(true);
    expect(dto.kdvRate).toBe(20);
    expect(dto.kdvAmount).toBe(200);
  });

  it("uçtan uca: buildSyncDueDto → buildClaimItemData → ClaimItem.referenceNo/sourceDocumentType/metadata.kdv", () => {
    const ci = buildClaimItemData("t", "c", buildSyncDueDto(faturaDue), ClaimItemType.PRINCIPAL);
    expect(ci.referenceNo).toBe("F-2026-1");
    expect(ci.sourceDocumentType).toBe(DocumentSourceType.FATURA);
    expect(ci.amount).toBe(1200); // PRINCIPAL = KDV-dahil genel toplam (O-2=A)
    expect((ci.metadata as any).kdv).toEqual({ hasKdv: true, kdvRate: 20, kdvAmount: 200 });
  });

  it("belgesiz/KDV-siz Due → FATURA alanları undefined; ClaimItem set edilmez (regresyon)", () => {
    const dto = buildSyncDueDto({ id: "d", type: "PRINCIPAL", amount: 1000, dueDate: "2026-01-01" });
    expect(dto.sourceDocumentNo).toBeUndefined();
    expect(dto.sourceDocumentType).toBeUndefined();
    expect(dto.hasKdv).toBeUndefined();
    const ci = buildClaimItemData("t", "c", dto, ClaimItemType.PRINCIPAL);
    expect(ci.referenceNo).toBeUndefined();
    expect(ci.metadata).toBeUndefined();
  });

  it("faiz korunur + kdvRate Decimal/string normalize (number)", () => {
    const dto = buildSyncDueDto({ id: "d", type: "INTEREST", amount: 50, dueDate: "2026-01-01", interestAmount: 5, kdvRate: "18" as unknown });
    expect(dto.interestAmount).toBe(5);
    expect(dto.kdvRate).toBe(18);
  });
});

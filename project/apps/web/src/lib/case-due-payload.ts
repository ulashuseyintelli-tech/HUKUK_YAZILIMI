export interface CreateCaseDueInput {
  type: string;
  description?: string;
  amount?: string | number;
  dueDate: string;
  interestType?: string;
  interestRate?: number;
  interestAmount?: number;
  interestStartDate?: string;
  interestEndDate?: string;
  // FATURA (G2b): belge/KDV metadata → backend DueDto (G2a) → kanonik ClaimItem.referenceNo/sourceDocumentType/metadata.kdv
  sourceDocumentNo?: string;
  sourceDocumentType?: string;
  hasKdv?: boolean;
  kdvRate?: number;
  kdvAmount?: number;
}

export interface CreateCaseDuePayload {
  type: string;
  description?: string;
  amount: number;
  dueDate: string;
  interestType?: string;
  interestRate?: number;
  interestAmount?: number;
  interestStartDate?: string;
  interestEndDate?: string;
  sourceDocumentNo?: string;
  sourceDocumentType?: string;
  hasKdv?: boolean;
  kdvRate?: number;
  kdvAmount?: number;
}

export function buildCreateCaseDuesPayload(dues: CreateCaseDueInput[]): CreateCaseDuePayload[] {
  return dues
    .filter((due) => due.amount && Number.parseFloat(String(due.amount)) > 0)
    .map((due) => ({
      type: due.type,
      description: due.description || undefined,
      amount: Number.parseFloat(String(due.amount)),
      dueDate: due.dueDate,
      interestType: due.interestType,
      interestRate: due.interestRate,
      interestAmount: due.interestAmount,
      interestStartDate: due.interestStartDate,
      interestEndDate: due.interestEndDate,
      // FATURA (G2b): belge/KDV alanlarını payload'a taşı (yoksa undefined)
      sourceDocumentNo: due.sourceDocumentNo,
      sourceDocumentType: due.sourceDocumentType,
      hasKdv: due.hasKdv,
      kdvRate: due.kdvRate,
      kdvAmount: due.kdvAmount,
    }));
}

/** G2b — OCR debtInfo (FATURA) için Due'ya gidecek belge/KDV alanları (SAF). */
export interface FaturaDueFields {
  sourceDocumentNo?: string;
  sourceDocumentType?: string;
  hasKdv?: boolean;
  kdvRate?: number;
  kdvAmount?: number;
}

/**
 * G2b (scan-only fatura) — OCR tek-belge tarama sonucundan (debtInfo + documentType) Due'nun belge/KDV
 * alanlarını çıkarır. YALNIZ documentType==="FATURA" iken doldurur (aksi → {}). amount=KDV-dahil genel
 * toplam zaten debtInfo.amount'ta (G1 prompt). PRINCIPAL üzerinde gömülü bilgi (O-1=A); ayrı TAX_KDV YOK.
 */
export function faturaDueFieldsFromDebtInfo(
  debtInfo: { documentNo?: string; kdvRate?: number; kdvAmount?: number },
  documentType?: string,
): FaturaDueFields {
  if (documentType !== "FATURA") return {};
  return {
    sourceDocumentNo: debtInfo.documentNo || undefined,
    sourceDocumentType: "FATURA",
    hasKdv: debtInfo.kdvRate != null,
    kdvRate: debtInfo.kdvRate,
    kdvAmount: debtInfo.kdvAmount,
  };
}

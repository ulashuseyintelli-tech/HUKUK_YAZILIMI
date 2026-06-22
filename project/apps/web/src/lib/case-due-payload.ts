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
  // PR-2c-2: belge-özel alanlar → backend DueDto (PR-2c-1) → ClaimItem.referenceNo/issueDate/metadata.ilam|kira
  issueDate?: string;
  ilamMahkeme?: string;
  ilamEsasNo?: string;
  ilamKararNo?: string;
  kiraDonemBaslangic?: string;
  kiraDonemBitis?: string;
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
  // PR-2c-2: belge-özel alanlar (passthrough)
  issueDate?: string;
  ilamMahkeme?: string;
  ilamEsasNo?: string;
  ilamKararNo?: string;
  kiraDonemBaslangic?: string;
  kiraDonemBitis?: string;
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
      // PR-2c-2: belge-özel alanlar (İLAM/KİRA/issueDate) → payload (yoksa undefined)
      issueDate: due.issueDate,
      ilamMahkeme: due.ilamMahkeme,
      ilamEsasNo: due.ilamEsasNo,
      ilamKararNo: due.ilamKararNo,
      kiraDonemBaslangic: due.kiraDonemBaslangic,
      kiraDonemBitis: due.kiraDonemBitis,
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

/**
 * PR-2c-2 — manuel sihirbaz kalemi (AlacakKalemi) için Due'ya gidecek belge-özel alanlar (SAF, test edilebilir).
 * Backend PR-2c-1 kontratı: sourceDocumentNo/issueDate → ClaimItem.referenceNo/issueDate;
 * ilam* → metadata.ilam + referenceNo (esas/karar birleşik); kira* → metadata.kira.
 * davaTarihi KAPSAM DIŞI (faiz semantiği; PR-2c-2'de UI'a sokulmaz). CEK/SENET/diğer → {} (instruments track / dokunulmaz).
 */
export interface ClaimDocumentFields {
  sourceDocumentNo?: string;
  sourceDocumentType?: string;
  issueDate?: string;
  ilamMahkeme?: string;
  ilamEsasNo?: string;
  ilamKararNo?: string;
  kiraDonemBaslangic?: string;
  kiraDonemBitis?: string;
}

export function buildClaimDocumentFields(item: {
  kalemTuru?: string;
  faturaBilgileri?: { faturaNo?: string; faturaTarihi?: string };
  ilamBilgileri?: { mahkemeAdi?: string; esasNo?: string; kararNo?: string; ilamTarihi?: string };
  kiraBilgileri?: { donemBaslangic?: string; donemBitis?: string };
}): ClaimDocumentFields {
  switch (item?.kalemTuru) {
    case "FATURA": {
      const f = item.faturaBilgileri;
      const out: ClaimDocumentFields = { sourceDocumentType: "FATURA" };
      if (f?.faturaNo) out.sourceDocumentNo = f.faturaNo;
      if (f?.faturaTarihi) out.issueDate = f.faturaTarihi;
      return out;
    }
    case "ILAM": {
      const i = item.ilamBilgileri;
      const out: ClaimDocumentFields = { sourceDocumentType: "ILAM" };
      if (i?.mahkemeAdi) out.ilamMahkeme = i.mahkemeAdi;
      if (i?.esasNo) out.ilamEsasNo = i.esasNo;
      if (i?.kararNo) out.ilamKararNo = i.kararNo;
      if (i?.ilamTarihi) out.issueDate = i.ilamTarihi;
      return out;
    }
    case "KIRA": {
      const k = item.kiraBilgileri;
      const out: ClaimDocumentFields = { sourceDocumentType: "KIRA" };
      if (k?.donemBaslangic) out.kiraDonemBaslangic = k.donemBaslangic;
      if (k?.donemBitis) out.kiraDonemBitis = k.donemBitis;
      return out;
    }
    default:
      return {};
  }
}

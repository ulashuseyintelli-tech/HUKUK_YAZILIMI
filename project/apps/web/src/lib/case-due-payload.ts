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

/**
 * PR-i1 (İLAM çoklu-kalem cila — genel fer'i/masraf foundation) — sihirbaz kalem tipini (kalemTuru)
 * doğru DueType'a eşler; standalone girilen fer'i/masraf kalemi motorda yanlışlıkla PRINCIPAL'a
 * DÜŞMESİN. Backend DUE_TO_CLAIM_ITEM köprüsü bu DueType'ları kanonik ClaimItemType'a çevirir
 * (EXPENSE→EXPENSE · VEKALET_UCRETI→ATTORNEY_FEE · INTEREST→INTEREST · CEZAI_SART→CONTRACTUAL_PENALTY
 * · HARC→FEE · OTHER→OTHER).
 *
 * NOT — PR-i1 BUGÜN NO-OP: fer'i kalemTuru'lar henüz ana dropdown'da YOK (PR-i2 açacak); bugün
 * "Ana Alacak" dalına yalnız ana-dropdown değerleri ulaşır → hepsi PRINCIPAL döner = davranış AYNEN.
 * Bilinmeyen/boş kalemTuru → PRINCIPAL (güvenli varsayılan).
 */
export type ClaimDueType =
  | 'PRINCIPAL' | 'INTEREST' | 'EXPENSE' | 'VEKALET_UCRETI' | 'HARC' | 'TAZMINAT'
  | 'CEZAI_SART' | 'NAFAKA' | 'KIRA' | 'AIDAT' | 'KOMISYON' | 'PRIM' | 'OTHER';

const CLAIM_KALEM_DUE_TYPE: Record<string, ClaimDueType> = {
  // Genel fer'i/masraf (prefixsiz jenerik; PR-i2 dropdown'u bunları açacak)
  MASRAF: 'EXPENSE',
  YARGILAMA_GIDERI: 'EXPENSE',
  VEKALET_UCRETI: 'VEKALET_UCRETI',
  ISLEMIS_FAIZ: 'INTEREST',
  CEZAI_SART: 'CEZAI_SART', // M2: backend → CONTRACTUAL_PENALTY (TAZMINAT/PENALTY DEĞİL)
  HARC: 'HARC',
  DIGER_FERI: 'OTHER',
  // Mevcut nested ILAM_* yan-alacak kalemTuru'ları (gerçek; güvenlik için de eşlenir)
  ILAM_YARGILAMA_GIDERI: 'EXPENSE',
  ILAM_VEKALET_UCRETI: 'VEKALET_UCRETI',
  ILAM_ISLEMIS_FAIZ: 'INTEREST',
};

export function mapClaimKalemTuruToDueType(kalemTuru?: string): ClaimDueType {
  if (!kalemTuru) return 'PRINCIPAL';
  return CLAIM_KALEM_DUE_TYPE[kalemTuru] ?? 'PRINCIPAL';
}

/**
 * PR-i2 (genel fer'i/masraf) — standalone/fer'i kalem için Due.interestType uygunlaştırma.
 * İşlemiş faiz (DueType INTEREST) kalemin KENDİSİ faizdir → ayrı faiz tipi YOK (undefined).
 * Geçersiz "YOK" (config faizTuru) payload'a SIZMASIN → undefined.
 * Diğer durumda MEVCUT davranış korunur: geçerli tip ya da varsayılan 'YASAL'
 * (PRINCIPAL akışı DEĞİŞMEZ; hiçbir ana kalemTuru faizTuru='YOK' değil).
 */
export type DueInterestType = 'YASAL' | 'TICARI' | 'AVANS' | 'TEMERRUT';

export function resolveDueInterestType(dueType: ClaimDueType, takipOncesiFaiz?: string): DueInterestType | undefined {
  if (dueType === 'INTEREST') return undefined;
  if (takipOncesiFaiz === 'YOK') return undefined;
  // takipOncesiFaiz mevcut sistemde config.faizTuru'dan gelir (örn. TICARI_DEGISEN/AKDI de olabilir);
  // eski davranış `item:any` üzerinden bu değeri aynen geçiriyordu → cast ile birebir korunur.
  return (takipOncesiFaiz || 'YASAL') as DueInterestType;
}

/**
 * PR-i3 (nested emekli) — eski draft/item'lardaki nested `ilamYanAlacaklar[]`'ı AYRI standalone
 * fer'i kalemlere düzleştirir (göç; veri kaybı YOK). Her raw → parent (ilamYanAlacaklar TEMİZLENİR
 * → buildDuesFromClaimItem'daki defansif nested dal fire ETMEZ, çift-sayım yok) + her yan-alacak için
 * ayrı fer'i raw (yan.tur → genel fer'i kalemTuru; bilinmeyen → DIGER_FERI). SAF + idempotent
 * (nested yoksa parent passthrough). Üretilen fer'i kalemler buildDues'da ESKİ nested expansion ile
 * birebir aynı Due'yu verir (mapClaimKalemTuruToDueType + resolveDueInterestType).
 */
const NESTED_YAN_TO_KALEM_TURU: Record<string, string> = {
  ILAM_YARGILAMA_GIDERI: 'YARGILAMA_GIDERI',
  ILAM_VEKALET_UCRETI: 'VEKALET_UCRETI',
  ILAM_ISLEMIS_FAIZ: 'ISLEMIS_FAIZ',
};

export function flattenNestedYanAlacaklarRaws(raws: any[]): any[] {
  const out: any[] = [];
  for (const raw of raws ?? []) {
    const yanlar = Array.isArray(raw?.ilamYanAlacaklar) ? raw.ilamYanAlacaklar : [];
    out.push({ ...raw, ilamYanAlacaklar: [] });
    for (const yan of yanlar) {
      const tutar = Number(yan?.tutar);
      if (!(tutar > 0)) continue;
      out.push({
        kalemTuru: NESTED_YAN_TO_KALEM_TURU[yan.tur] ?? 'DIGER_FERI',
        bakiyeTutar: tutar,
        toplamTutar: tutar,
        currency: raw?.currency || 'TRY',
        vadeTarihi: raw?.vadeTarihi || '',
        aciklama: yan?.aciklama || '',
      });
    }
  }
  return out;
}

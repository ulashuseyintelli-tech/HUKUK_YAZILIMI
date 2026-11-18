// Alacak kalemi alanlarının Türkçe görüntü etiketleri (tek kaynak). Yalnız GÖSTERİM: kayıtlı değer ve sunucu kuralları değişmez.
// Kodlar API şemasıyla aynıdır (ClaimItemType, InterestAccrualStatus, InterestStartDateProvenance).

export type AttorneyFeeBasis = "JUDGMENT_AWARDED" | "ENFORCEMENT_TARIFF";

/** Vekâlet ücreti kaynağı metni — YALNIZ kayıtlı alandan; açıklama metnine bakılmaz. */
export const ATTORNEY_FEE_BASIS_LABELS: Record<AttorneyFeeBasis | "UNKNOWN", string> = {
  JUDGMENT_AWARDED: "İlam vekâlet ücreti",
  ENFORCEMENT_TARIFF: "Takip vekâlet ücreti",
  UNKNOWN: "Türü belirtilmemiş",
};

export function attorneyFeeBasisLabel(basis: AttorneyFeeBasis | null | undefined): string {
  return basis ? ATTORNEY_FEE_BASIS_LABELS[basis] : ATTORNEY_FEE_BASIS_LABELS.UNKNOWN;
}

/** Kalem türü (ClaimItemType) → Türkçe ad. */
export const CLAIM_ITEM_TYPE_LABELS: Record<string, string> = {
  PRINCIPAL: "Asıl Alacak",
  INTEREST: "Faiz",
  PRE_INTEREST: "Takip Öncesi Faiz",
  POST_INTEREST: "Takip Sonrası Faiz",
  EXPENSE: "Masraf",
  FEE: "Harç",
  ATTORNEY_FEE: "Vekalet Ücreti",
  PENALTY: "Tazminat",
  CHECK_PENALTY: "Çek Tazminatı",
  CONTRACTUAL_PENALTY: "Cezai Şart",
  TAX_KDV: "KDV",
  TAX_BSMV: "BSMV",
  TAX_KKDF: "KKDF",
  OTHER: "Diğer",
  YARGILAMA_GIDERI: "Yargılama Gideri",
};

/**
 * Kayıtlı kalem adı ham tür kodu ise (ör. açıklaması boş kalemde "PRINCIPAL") Türkçe ada çevirir; değilse metni AYNEN döner.
 * Kayıtlı veri değiştirilmez; eşleme okuma anındadır (geçmiş talepler dahil).
 */
export function humanizeClaimItemName(value: string): string {
  const trimmed = value.trim();
  return Object.prototype.hasOwnProperty.call(CLAIM_ITEM_TYPE_LABELS, trimmed) ? CLAIM_ITEM_TYPE_LABELS[trimmed] : value;
}

export type InterestAccrualStatusCode = "UNKNOWN" | "ACCRUES" | "NO_INTEREST";

/** Faiz durumu (InterestAccrualStatus). "Belirlenmedi" ile "işlemez" hukuken farklıdır; birbirine çevrilmez. */
export const INTEREST_ACCRUAL_STATUS_LABELS: Record<InterestAccrualStatusCode, string> = {
  UNKNOWN: "Belirlenmedi",
  ACCRUES: "Faiz işler",
  NO_INTEREST: "Faiz işlemez",
};

export type InterestStartDateProvenanceCode =
  | "DOCUMENT_DUE_DATE"
  | "CONTRACTUAL_DUE_DATE"
  | "DEFAULT_NOTICE_DATE"
  | "JUDGMENT_DATE"
  | "JUDGMENT_FINALIZATION_DATE"
  | "ENFORCEMENT_PROCEEDING_DATE"
  | "MANUAL_LAWYER_CONFIRMED";

/** Faiz başlangıcının dayanağı (InterestStartDateProvenance); seçim sırası bu dizidir. */
export const INTEREST_START_PROVENANCE_OPTIONS: { code: InterestStartDateProvenanceCode; label: string }[] = [
  { code: "DOCUMENT_DUE_DATE", label: "Belgedeki vade tarihi" },
  { code: "CONTRACTUAL_DUE_DATE", label: "Sözleşmedeki vade tarihi" },
  { code: "DEFAULT_NOTICE_DATE", label: "Temerrüt ihtarı tarihi" },
  { code: "JUDGMENT_DATE", label: "Karar (hüküm) tarihi" },
  { code: "JUDGMENT_FINALIZATION_DATE", label: "Kesinleşme tarihi" },
  { code: "ENFORCEMENT_PROCEEDING_DATE", label: "Takip tarihi (dosyadan alınır)" },
  { code: "MANUAL_LAWYER_CONFIRMED", label: "Avukat teyidi (belgede yazmıyor)" },
];

export const INTEREST_START_PROVENANCE_LABELS: Record<string, string> = Object.fromEntries(
  INTEREST_START_PROVENANCE_OPTIONS.map((option) => [option.code, option.label]),
);

/** Sunucu kuralı (interest-accrual-policy): bu dayanakta başlangıç tarihi dosyanın takip tarihinden mekanik çözülür. */
export const PROVENANCE_WITHOUT_START_DATE: InterestStartDateProvenanceCode = "ENFORCEMENT_PROCEEDING_DATE";

// ── Borçlu sorumluluğu seçimi (kodlar API `claim-liability.domain` ile aynı) ──────────────────────────────────────────
// Yeni dosya formundaki açılış seçimi bu sabitleri kullanır. Dosya sayfasındaki seçim çekmecesi aynı içerikte kendi
// kopyasını taşır (`ClaimLiabilitySelectionDrawer`); iki liste birlikte güncellenmelidir.

/** Sorumluluk seçiminin dayanağı. `noteRequired`: açıklama zorunlu (sunucu kuralı). */
export const CLAIM_LIABILITY_BASIS_OPTIONS: Array<{ value: string; label: string; noteRequired?: boolean }> = [
  { value: "COURT_JUDGMENT", label: "İlam / mahkeme kararı" },
  { value: "CONTRACT", label: "Sözleşme" },
  { value: "STATUTE", label: "Kanun hükmü" },
  { value: "NEGOTIABLE_INSTRUMENT", label: "Kambiyo senedi" },
  { value: "LAWYER_ASSESSMENT", label: "Avukat değerlendirmesi", noteRequired: true },
  { value: "OTHER", label: "Diğer", noteRequired: true },
];

export const CLAIM_LIABILITY_BASIS_LABELS: Record<string, string> = Object.fromEntries(
  CLAIM_LIABILITY_BASIS_OPTIONS.map((option) => [option.value, option.label]),
);

/** Açılış önizlemesinde ve formunda sorumluluk türü adları. "Paylı sorumluluk" terimi kullanılır. */
export const OPENING_LIABILITY_KIND_LABELS: Record<string, string> = {
  BELIRLENMEDI: "Belirlenmedi",
  SECIMDE_YOK: "Seçimde yok",
  MUTESELSIL: "Müteselsil",
  PAYLI: "Paylı sorumluluk",
  TUTARLA_SINIRLI: "Tutarla sınırlı",
};

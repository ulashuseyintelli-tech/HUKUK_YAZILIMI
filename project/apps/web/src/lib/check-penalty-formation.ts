/**
 * K3-L Faz 2b — dosya açılışında çek tazminatı K3 onay talebi için SAF yardımcılar (sihirbaz).
 *
 * - Tazminat tutarı SUNUCUDA hesaplanır (POST /claim-items/cek-formation/preview); istemci "tutar × %10" hesabı yapmaz.
 * - Talep yalnız kullanıcının AÇIK seçimiyle istenir; kesin kalem yalnız ikinci avukat onayıyla oluşur.
 * - İç onay, mahkemeye / UYAP'a dosyalama DEĞİLDİR.
 */
export const CHECK_PENALTY_DRAFT_NOTICE = "Taslak — onay bekliyor, gönderime hazır değil";

export interface CheckPenaltyPreviewDebtor {
  debtorId: string;
  role?: string | null;
  avalForDebtorId?: string | null;
}

export interface CekFormationPreviewRequest {
  instruments: Array<{ amount: number; currency: string; isBounced?: boolean; bounceDate?: string }>;
  debtors: Array<{ tempId: string; role: string; avalForTempId?: string; pursued?: boolean }>;
}

export interface CekFormationPreviewResult {
  taslak: true;
  uyari: string;
  durum: "HESAPLANDI" | "VERI_EKSIK";
  kod: string | null;
  aciklama: string;
  tazminat: {
    tutar: number;
    paraBirimi: string;
    basisPoints: number;
    sorumluTempIds: string[];
    bedelSorumluTempIds: string[];
  } | null;
  previewHash: string;
  girdiOzeti: { cekSayisi: number; karsiliksizCekSayisi: number; takipEdilenBorcluSayisi: number };
}

interface CekKalemRaw {
  kalemTuru?: string;
  bakiyeTutar?: number | string;
  currency?: string;
  cekBilgileri?: { karsiliksiz?: boolean; karsiliksizTarihi?: string } | null;
  cekTazminatOnizleme?: { previewHash?: string; durum?: string } | null;
}

/** Sihirbaz borçlularından önizleme borçluları (kimlik = Debtor.id → açılıştaki sunucu hesabıyla aynı girdi). */
export function toPreviewDebtors(caseDebtors: readonly CheckPenaltyPreviewDebtor[]): CekFormationPreviewRequest["debtors"] {
  return caseDebtors
    .filter((cd) => !!cd.debtorId)
    .map((cd) => ({
      tempId: cd.debtorId,
      role: String(cd.role || "ASIL_BORCLU"),
      ...(cd.avalForDebtorId ? { avalForTempId: cd.avalForDebtorId } : {}),
    }));
}

/** Tek bir çek kaleminden önizleme isteği. */
export function buildCekPreviewRequest(
  kalem: CekKalemRaw,
  caseDebtors: readonly CheckPenaltyPreviewDebtor[],
): CekFormationPreviewRequest {
  const karsiliksiz = kalem.cekBilgileri?.karsiliksiz === true;
  const tarih = kalem.cekBilgileri?.karsiliksizTarihi || "";
  return {
    instruments: [
      {
        amount: Number(kalem.bakiyeTutar) || 0,
        currency: String(kalem.currency || "TRY"),
        ...(karsiliksiz ? { isBounced: true } : {}),
        ...(karsiliksiz && tarih ? { bounceDate: tarih } : {}),
      },
    ],
    debtors: toPreviewDebtors(caseDebtors),
  };
}

/** Dosyada karşılıksız işaretli (tarihli) çek kalemi var mı — K3 seçeneği yalnız o zaman sunulur. */
export function hasBouncedCheckItem(raws: readonly CekKalemRaw[]): boolean {
  return raws.some((r) => r?.kalemTuru === "CEK" && r.cekBilgileri?.karsiliksiz === true && !!r.cekBilgileri?.karsiliksizTarihi);
}

export const CHECK_PENALTY_FORMATION_UNAVAILABLE_NOTICE =
  "Bu ortamda çek kaydı dosya açılışında oluşturulmuyor (manuel kambiyo kaydı kapalı); çek tazminatı onay talebi " +
  "burada açılamaz. Hesap özetindeki çek tazminatı yalnız taslak bilgidir, dosyaya kalem olarak eklenmez.";

export const CHECK_PENALTY_FORMATION_INCOMPLETE_NOTICE =
  "Karşılıksız çek kalemi çek kaydı olarak oluşturulamıyor (seri no, keşide tarihi gibi çek bilgileri eksik); çek " +
  "tazminatı onay talebi açılamaz. Hesap özetindeki çek tazminatı yalnız taslak bilgidir.";

/** Açılışta çek kaydı olarak gidecek evrak (OCR ya da manuel) — önizleme için gereken alanlar. */
export interface CaseOpenInstrumentLike {
  type?: string;
  amount?: number | string;
  currency?: string;
  isBounced?: boolean;
  bounceDate?: string;
}

/**
 * Lehine aval hedefi YALNIZ rol AVAL iken, kendisi değilken ve hedef aynı istekte varken korunur. Listeden çıkarılan
 * borçluyu gösteren bayat seçim gönderilmez (gönderilseydi dosya açılışı AVAL_BENEFICIARY_NOT_IN_CASE ile reddedilirdi).
 */
export function sanitizeAvalTargets<T extends { debtorId: string; role?: string | null; avalForDebtorId?: string | null }>(
  caseDebtors: readonly T[],
): T[] {
  const ids = new Set(caseDebtors.map((cd) => cd.debtorId));
  return caseDebtors.map((cd) => {
    if (cd.avalForDebtorId === undefined || cd.avalForDebtorId === null) return cd;
    const target = String(cd.avalForDebtorId).trim();
    const keep = !!target && String(cd.role ?? "").toUpperCase() === "AVAL" && target !== cd.debtorId && ids.has(target);
    if (keep) return cd;
    const { avalForDebtorId: _dropped, ...rest } = cd;
    return rest as T;
  });
}

/**
 * Açılışta oluşacak TÜM çek kayıtları + gönderilecek borçlular → TEK, birleşik önizleme isteği. Sunucu dosya açılışında
 * aynı girdiyle (kalıcı kayıtlardan) hash üretir; talep yalnız bu gösterilen önizlemenin hash'iyle açılır (K6). Çek yoksa null.
 */
export function buildCaseOpenCekPreviewRequest(
  instruments: readonly CaseOpenInstrumentLike[],
  caseDebtors: readonly CheckPenaltyPreviewDebtor[],
): CekFormationPreviewRequest | null {
  const cheques = instruments.filter((i) => String(i?.type ?? "").toUpperCase() === "CEK");
  if (cheques.length === 0) return null;
  return {
    instruments: cheques.map((i) => ({
      amount: Number(i.amount) || 0,
      currency: String(i.currency || "TRY"),
      ...(i.isBounced === true && i.bounceDate ? { isBounced: true, bounceDate: i.bounceDate } : {}),
    })),
    debtors: toPreviewDebtors(caseDebtors),
  };
}

/** Önizleme girdisinin kararlı anahtarı (gösterilen önizlemenin gönderim anındaki girdiyle aynı olduğunu doğrulamak için). */
export function previewRequestKey(request: CekFormationPreviewRequest | null): string | null {
  return request ? JSON.stringify(request) : null;
}

/**
 * K3 onay talebi dosya açılışında YALNIZ karşılıksız (tarihli) bir çek KAYDI oluşacaksa açılabilir: sunucu talebi o kaydın
 * değişmez sürümüne bağlar. Manuel kambiyo kaydı kapalıyken ya da çek bilgileri eksikken kayıt oluşmaz → seçenek SUNULMAZ.
 */
export function isCheckPenaltyFormationAvailable(input: { instrumentsToCreate: readonly CaseOpenInstrumentLike[] }): boolean {
  return input.instrumentsToCreate.some(
    (i) => String(i?.type ?? "").toUpperCase() === "CEK" && i.isBounced === true && !!i.bounceDate,
  );
}

/** Kullanıcıya GÖSTERİLEN birleşik önizleme (girdisinin anahtarıyla). */
export interface ShownCekFormationPreview {
  requestKey: string;
  durum: string;
  previewHash: string;
}

/**
 * createCase gövdesindeki `checkPenaltyFormation` alanı. Alan YALNIZ şu durumda gönderilir: kullanıcı açıkça seçti, seçtiği
 * anda gösterilen birleşik önizleme HESAPLANDI ve bu önizlemenin girdisi gönderim anındaki çek/borçlu girdisiyle AYNI.
 * Aksi hâlde (bayat / hesaplanamamış önizleme) talep gönderilmez; sunucu da hash'siz talebi açmaz (PREVIEW_REQUIRED).
 */
export function buildCheckPenaltyFormationPayload(input: {
  requested: boolean;
  idempotencyKey: string;
  caseDebtors: readonly CheckPenaltyPreviewDebtor[];
  shownPreview: ShownCekFormationPreview | null;
  currentRequestKey: string | null;
}): { requested: true; idempotencyKey: string; pursuedDebtorIds: string[]; previewHash: string } | undefined {
  if (!input.requested || !input.idempotencyKey) return undefined;
  const shown = input.shownPreview;
  if (!shown || !input.currentRequestKey || shown.requestKey !== input.currentRequestKey) return undefined;
  if (shown.durum !== "HESAPLANDI" || !shown.previewHash) return undefined;
  return {
    requested: true,
    idempotencyKey: input.idempotencyKey,
    pursuedDebtorIds: [...new Set(input.caseDebtors.map((cd) => cd.debtorId).filter(Boolean))],
    previewHash: shown.previewHash,
  };
}

export const CHECK_PENALTY_FORMATION_NOT_SENT_NOTICE =
  "Çek tazminatı onay talebi GÖNDERİLMEDİ: gösterilen taslak önizleme gönderim anındaki çek/borçlu bilgisiyle uyuşmuyor " +
  "ya da hesaplanamadı. Dosya oluşturuldu; tazminat kalemi eklenmedi.";

/** Sunucunun anahtar biçimi: harf/rakamla başlar, [A-Za-z0-9._:-], 8–80 karakter. Taslakta saklanır (kararlı). */
export function newCheckPenaltyFormationKey(): string {
  const random =
    typeof crypto !== "undefined" && typeof crypto.randomUUID === "function"
      ? crypto.randomUUID()
      : `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
  return `cpf-${random}`;
}

export interface CheckPenaltyFormationOutcome {
  requested: true;
  taslak: true;
  uyari: string;
  skippedReason?: string;
  message?: string;
  results: Array<{ instrumentId: string; status: "REQUESTED" | "REPLAYED" | "REJECTED" | "SKIPPED"; errorCode?: string; message?: string }>;
}

/** Dosya açılış yanıtındaki K3 sonucunun kullanıcıya gösterilecek özeti (yoksa null). */
export function describeCheckPenaltyFormationOutcome(outcome: CheckPenaltyFormationOutcome | null | undefined): string | null {
  if (!outcome?.requested) return null;
  if (outcome.skippedReason) {
    const reason = String(outcome.message || outcome.skippedReason).trim().replace(/[.\s]+$/, "");
    return `Çek tazminatı onay talebi AÇILMADI: ${reason}. Dosya oluşturuldu; tazminat kalemi eklenmedi.`;
  }
  const opened = outcome.results.filter((r) => r.status === "REQUESTED" || r.status === "REPLAYED").length;
  const failed = outcome.results.filter((r) => r.status === "REJECTED" || r.status === "SKIPPED");
  const parts: string[] = [];
  if (opened > 0) {
    parts.push(`Çek tazminatı için ${opened} onay talebi açıldı (${CHECK_PENALTY_DRAFT_NOTICE}). Kalem, ikinci avukat onayından sonra oluşur.`);
  }
  if (failed.length > 0) {
    const reasons = failed.map((r) => String(r.message || r.errorCode || r.status).trim().replace(/[.\s]+$/, ""));
    parts.push(`Açılamayan talep: ${reasons.join("; ")}.`);
  }
  return parts.length > 0 ? parts.join(" ") : null;
}

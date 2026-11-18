// DOSYA AÇILIŞINDA KALEM BEYANLARI — yeni dosya formunun saf yardımcıları (owner talimatı 2026-11-18).
//
// Kapsam: kalem bazında AÇIKÇA girilen vekâlet ücreti kaynağı, ilam bilgisi (fer'i kalemler + kesinleşme tarihi),
// "faiz işler" beyanı (başlangıç + dayanak) ve borçlu sorumluluğu seçimi.
//
// İlkeler (sunucuyla aynı; ayrıntı api `case/opening-claim-requests.ts`):
//  - Ön seçili değer YOKTUR. Yazılım ilamdan, borçlu rolünden ya da borçlu sayısından sonuç çıkarmaz; girilmeyen bilgi
//    gönderilmez ve "belirlenmedi" kalır.
//  - Vekâlet ücreti kaynağı ve ilam bilgisi açılışta kaleme yazılır. "Faiz işler" beyanı ve sorumluluk seçimi kaleme
//    YAZILMAZ; dosya oluşturulduktan sonra ikinci kişinin onayına gider ve onaylanana kadar hesaba girmez.
//  - İstemci pay / tavan HESAPLAMAZ ve doğrulama kuralı tanımlamaz: önizleme ve girdi hataları sunucudan gelir.
//  - Alan anlamları sonradan düzenlemeyle aynıdır (etiketler `claim-item-labels.ts`; kodlar API şemasıyla aynı).

import type { AttorneyFeeBasis, InterestStartDateProvenanceCode } from "@/components/claim-item/claim-item-labels";
import { ATTORNEY_FEE_BASIS_LABELS, OPENING_LIABILITY_KIND_LABELS, PROVENANCE_WITHOUT_START_DATE } from "@/components/claim-item/claim-item-labels";

export type OpeningLiabilityMode = "JOINT_AND_SEVERAL" | "PROPORTIONAL" | "CAPPED";

export interface OpeningPartyForm {
  selected: boolean;
  percent: string;
  limit: string;
  unlimited: boolean;
}

export interface OpeningLiabilityForm {
  /** Boş = seçim yok ("belirlenmedi"; kalem seçimsiz açılır). */
  mode: "" | OpeningLiabilityMode;
  shareKind: "" | "EQUAL" | "PERCENT";
  /** Anahtar: kişi kimliği (Debtor.id). */
  parties: Record<string, OpeningPartyForm>;
  basis: string;
  basisNote: string;
}

/** Bir kalemin açılış beyanı (form durumu; taslakta saklanır). */
export interface OpeningClaimDeclaration {
  /** Yalnız vekâlet ücreti kaleminde anlamlı; boş = bilinmiyor (gönderilmez). */
  vekaletUcretiKaynagi: "" | AttorneyFeeBasis;
  /** Kalem ilamdan doğuyor mu (fer'i kalemlerde ilam bilgisi girişini açar). */
  ilamKaynakli: boolean;
  faizIsler: boolean;
  faizBaslangic: string;
  faizDayanak: "" | InterestStartDateProvenanceCode;
  sorumluluk: OpeningLiabilityForm;
}

export const emptyOpeningParty = (selected = false): OpeningPartyForm => ({ selected, percent: "", limit: "", unlimited: false });

export function emptyOpeningClaimDeclaration(): OpeningClaimDeclaration {
  return {
    vekaletUcretiKaynagi: "",
    ilamKaynakli: false,
    faizIsler: false,
    faizBaslangic: "",
    faizDayanak: "",
    sorumluluk: { mode: "", shareKind: "", parties: {}, basis: "", basisNote: "" },
  };
}

const text = (value: unknown): string => (typeof value === "string" ? value : "");

/** Taslaktan / eski kalemden gelen değeri güvenli biçime getirir (eksik alan = girilmemiş; varsayılan değer ÜRETMEZ). */
export function normalizeOpeningClaimDeclaration(value: unknown): OpeningClaimDeclaration {
  const empty = emptyOpeningClaimDeclaration();
  if (!value || typeof value !== "object") return empty;
  const raw = value as Record<string, unknown>;
  const liability = (raw.sorumluluk && typeof raw.sorumluluk === "object" ? raw.sorumluluk : {}) as Record<string, unknown>;
  const parties: Record<string, OpeningPartyForm> = {};
  if (liability.parties && typeof liability.parties === "object") {
    for (const [debtorId, party] of Object.entries(liability.parties as Record<string, unknown>)) {
      const p = (party && typeof party === "object" ? party : {}) as Record<string, unknown>;
      parties[debtorId] = { selected: p.selected === true, percent: text(p.percent), limit: text(p.limit), unlimited: p.unlimited === true };
    }
  }
  const mode = text(liability.mode);
  const shareKind = text(liability.shareKind);
  const basis = text(raw.vekaletUcretiKaynagi);
  return {
    vekaletUcretiKaynagi: basis === "JUDGMENT_AWARDED" || basis === "ENFORCEMENT_TARIFF" ? basis : "",
    ilamKaynakli: raw.ilamKaynakli === true,
    faizIsler: raw.faizIsler === true,
    faizBaslangic: text(raw.faizBaslangic),
    faizDayanak: text(raw.faizDayanak) as OpeningClaimDeclaration["faizDayanak"],
    sorumluluk: {
      mode: mode === "JOINT_AND_SEVERAL" || mode === "PROPORTIONAL" || mode === "CAPPED" ? mode : "",
      shareKind: shareKind === "EQUAL" || shareKind === "PERCENT" ? shareKind : "",
      parties,
      basis: text(liability.basis),
      basisNote: text(liability.basisNote),
    },
  };
}

// ── Kalem türü kümeleri ─────────────────────────────────────────────────────────────────────────────────────────────

/** Vekâlet ücreti kaynağı yalnız bu kalem türlerinde sorulur (sunucu kuralı: yalnız ATTORNEY_FEE kalemi). */
const ATTORNEY_FEE_KINDS = new Set(["VEKALET_UCRETI", "ILAM_VEKALET_UCRETI"]);
/** İlam asıl alacağı dışında, ilamdan doğabileceği için ilam bilgisi girilebilen fer'i kalem türleri. */
const ILAM_SOURCED_ANCILLARY_KINDS = new Set(["VEKALET_UCRETI", "YARGILAMA_GIDERI", "ISLEMIS_FAIZ", "MASRAF", "HARC", "CEZAI_SART", "DIGER_FERI"]);
/** Faiz girişi olmayan kalem türü (işlemiş faiz kaleminin kendisi). */
const NO_INTEREST_INPUT_KINDS = new Set(["ISLEMIS_FAIZ", "ILAM_ISLEMIS_FAIZ"]);

export const isAttorneyFeeKind = (kalemTuru: unknown): boolean => typeof kalemTuru === "string" && ATTORNEY_FEE_KINDS.has(kalemTuru);
export const canMarkIlamSourced = (kalemTuru: unknown): boolean => typeof kalemTuru === "string" && ILAM_SOURCED_ANCILLARY_KINDS.has(kalemTuru);
export const hasInterestInput = (kalemTuru: unknown): boolean => typeof kalemTuru === "string" && !NO_INTEREST_INPUT_KINDS.has(kalemTuru);

// ── Kalem → Due alanları ────────────────────────────────────────────────────────────────────────────────────────────

export interface OpeningPartyPayload {
  debtorId: string;
  shareWeight?: number;
  sharePercent?: string;
  limitAmount?: string;
  unlimited?: boolean;
}

export interface OpeningLiabilitySelectionDraft {
  mode: OpeningLiabilityMode;
  parties: OpeningPartyPayload[];
  basis?: string;
  basisNote?: string;
}

export interface OpeningInterestAccrualDraft {
  interestStartDate?: string;
  interestStartDateProvenance: string;
}

/** Due satırına eklenen GEÇİCİ açılış verisi: sunucuya bu biçimde gitmez; `buildOpeningClaimRequests` sıra numarasına bağlar. */
export interface OpeningDueDeclaration {
  interestAccrual?: OpeningInterestAccrualDraft;
  liabilitySelection?: OpeningLiabilitySelectionDraft;
}

export interface OpeningDueFields {
  attorneyFeeBasis?: AttorneyFeeBasis;
  sourceDocumentType?: string;
  ilamMahkeme?: string;
  ilamEsasNo?: string;
  ilamKararNo?: string;
  issueDate?: string;
  ilamKesinlesmeTarihi?: string;
  opening?: OpeningDueDeclaration;
  /**
   * "Faiz işler" beyanı varsa kaleme açılışta faiz başlangıç / bitiş tarihi YAZILMAZ: beyan edilen başlangıç onaya gider;
   * onay beklenirken başka bir tarih hesaba girmesin (sunucu da reddeder).
   */
  omitInterestDates: boolean;
}

const decimalText = (value: string): string => value.trim().replace(",", ".");

/**
 * Kalemin açılış beyanından Due'ya eklenecek alanları kurar (SAF). Yalnız kullanıcının girdiği bilgi çıkar:
 * boş alan gönderilmez; kalem türüne uymayan beyan (ör. masraf kaleminde vekâlet ücreti kaynağı) yok sayılır.
 *
 * `debtorIds`: dosyanın o anki borçluları. Dosyadan çıkarılmış borçluya ait seçim satırı gönderilmez.
 * `interestIsNone`: kalemde "faiz yok" seçili mi (faizsiz kalemde "faiz işler" beyanı gönderilmez).
 */
export function buildOpeningDueFields(
  item: { kalemTuru?: unknown; acilisBeyani?: unknown; ilamBilgileri?: { mahkemeAdi?: string; esasNo?: string; kararNo?: string; ilamTarihi?: string; kesinlesmeTarihi?: string } | null },
  context: { debtorIds: readonly string[]; interestIsNone: boolean },
): OpeningDueFields {
  const declaration = normalizeOpeningClaimDeclaration(item?.acilisBeyani);
  const out: OpeningDueFields = { omitInterestDates: false };

  if (isAttorneyFeeKind(item?.kalemTuru) && declaration.vekaletUcretiKaynagi) out.attorneyFeeBasis = declaration.vekaletUcretiKaynagi;

  const ilam = item?.ilamBilgileri;
  if (item?.kalemTuru === "ILAM") {
    // İlam asıl alacağının öteki alanlarını mevcut köprü taşır; burada yalnız kesinleşme tarihi eklenir.
    if (ilam?.kesinlesmeTarihi) out.ilamKesinlesmeTarihi = ilam.kesinlesmeTarihi;
  } else if (canMarkIlamSourced(item?.kalemTuru) && declaration.ilamKaynakli) {
    out.sourceDocumentType = "ILAM";
    if (ilam?.mahkemeAdi) out.ilamMahkeme = ilam.mahkemeAdi;
    if (ilam?.esasNo) out.ilamEsasNo = ilam.esasNo;
    if (ilam?.kararNo) out.ilamKararNo = ilam.kararNo;
    if (ilam?.ilamTarihi) out.issueDate = ilam.ilamTarihi;
    if (ilam?.kesinlesmeTarihi) out.ilamKesinlesmeTarihi = ilam.kesinlesmeTarihi;
  }

  const opening: OpeningDueDeclaration = {};
  if (declaration.faizIsler && hasInterestInput(item?.kalemTuru) && !context.interestIsNone) {
    opening.interestAccrual = {
      interestStartDateProvenance: declaration.faizDayanak,
      // "Takip tarihi" dayanağında tarih dosyadan mekanik çözülür; ayrı tarih gönderilmez.
      ...(declaration.faizDayanak !== PROVENANCE_WITHOUT_START_DATE && declaration.faizBaslangic ? { interestStartDate: declaration.faizBaslangic } : {}),
    };
    out.omitInterestDates = true;
  }

  const liability = declaration.sorumluluk;
  if (liability.mode) {
    const mode = liability.mode;
    const parties: OpeningPartyPayload[] = context.debtorIds
      .filter((debtorId) => liability.parties[debtorId]?.selected)
      .map((debtorId) => {
        const form = liability.parties[debtorId];
        if (mode === "PROPORTIONAL") {
          if (liability.shareKind === "EQUAL") return { debtorId, shareWeight: 1 };
          if (liability.shareKind === "PERCENT" && form.percent.trim()) return { debtorId, sharePercent: decimalText(form.percent) };
          return { debtorId };
        }
        if (mode === "CAPPED") {
          if (form.unlimited) return { debtorId, unlimited: true };
          return form.limit.trim() ? { debtorId, limitAmount: decimalText(form.limit) } : { debtorId };
        }
        return { debtorId };
      });
    opening.liabilitySelection = {
      mode,
      parties,
      ...(liability.basis ? { basis: liability.basis } : {}),
      ...(liability.basisNote.trim() ? { basisNote: liability.basisNote.trim() } : {}),
    };
  }
  if (opening.interestAccrual || opening.liabilitySelection) out.opening = opening;
  return out;
}

/** Kalem listesi satırında gösterilen kısa beyan özeti (yalnız girilmiş bilgi; onaya gidecek olan açıkça belirtilir). */
export function summarizeOpeningDeclaration(item: { kalemTuru?: unknown; acilisBeyani?: unknown; takipOncesiFaiz?: unknown } | null | undefined): string[] {
  if (!item?.acilisBeyani) return [];
  const declaration = normalizeOpeningClaimDeclaration(item.acilisBeyani);
  const chips: string[] = [];
  if (isAttorneyFeeKind(item.kalemTuru) && declaration.vekaletUcretiKaynagi) chips.push(ATTORNEY_FEE_BASIS_LABELS[declaration.vekaletUcretiKaynagi]);
  if (canMarkIlamSourced(item.kalemTuru) && declaration.ilamKaynakli) chips.push("İlamdan doğuyor");
  if (declaration.faizIsler && hasInterestInput(item.kalemTuru) && item.takipOncesiFaiz !== "YOK") chips.push("Faiz işler: onaya gidecek");
  if (declaration.sorumluluk.mode) {
    const kind = declaration.sorumluluk.mode === "JOINT_AND_SEVERAL" ? "MUTESELSIL" : declaration.sorumluluk.mode === "PROPORTIONAL" ? "PAYLI" : "TUTARLA_SINIRLI";
    chips.push(`${OPENING_LIABILITY_KIND_LABELS[kind]}: onaya gidecek`);
  }
  return chips;
}

/**
 * Kalem listesi satırının beyan rozetleri. Evrak kaydına yönlenen kalemde (çek / senet) açılış beyanı GÖNDERİLMEZ;
 * önceki türde girilmiş beyan "onaya gidecek" diye gösterilmez, yerine gönderilmeyeceği söylenir.
 */
export const OPENING_DECLARATION_NOT_SENT_LABEL = "Açılış beyanı gönderilmez (evrak kaydı)";
export function listedItemOpeningChips(
  item: Parameters<typeof summarizeOpeningDeclaration>[0],
  declarationsUnavailable: boolean,
): { labels: string[]; notSent: boolean } {
  const labels = summarizeOpeningDeclaration(item);
  if (!declarationsUnavailable) return { labels, notSent: false };
  return { labels: [], notSent: labels.length > 0 };
}

// ── Due listesi → açılış isteği ─────────────────────────────────────────────────────────────────────────────────────

export interface OpeningClaimDeclarationsPayload {
  interestAccruals?: Array<{ dueIndex: number } & OpeningInterestAccrualDraft>;
  liabilitySelections?: Array<{ dueIndex: number } & OpeningLiabilitySelectionDraft>;
}

/**
 * Due listesindeki geçici açılış verisini sunucu biçimine çevirir: kalemler, GÖNDERİLEN `dues[]` içindeki sıra
 * numarasıyla gösterilir. Süzgeç `buildCreateCaseDuesPayload` ile AYNIDIR (tutarı sıfır / boş satır gönderilmez);
 * ikisi birlikte değişmelidir. Beyan yoksa `null`.
 */
export function buildOpeningClaimRequests(
  dues: ReadonlyArray<{ amount?: string | number; opening?: OpeningDueDeclaration }>,
): OpeningClaimDeclarationsPayload | null {
  const interestAccruals: NonNullable<OpeningClaimDeclarationsPayload["interestAccruals"]> = [];
  const liabilitySelections: NonNullable<OpeningClaimDeclarationsPayload["liabilitySelections"]> = [];
  dues
    .filter((due) => due.amount && Number.parseFloat(String(due.amount)) > 0)
    .forEach((due, dueIndex) => {
      if (due.opening?.interestAccrual) interestAccruals.push({ dueIndex, ...due.opening.interestAccrual });
      if (due.opening?.liabilitySelection) liabilitySelections.push({ dueIndex, ...due.opening.liabilitySelection });
    });
  if (interestAccruals.length === 0 && liabilitySelections.length === 0) return null;
  return {
    ...(interestAccruals.length > 0 ? { interestAccruals } : {}),
    ...(liabilitySelections.length > 0 ? { liabilitySelections } : {}),
  };
}

// ── Sunucu yanıtları ────────────────────────────────────────────────────────────────────────────────────────────────

export interface OpeningClaimPreviewErrorDTO {
  kod: string;
  alan: "FAIZ" | "SORUMLULUK" | "GENEL";
  dueIndex: number | null;
  debtorId: string | null;
  mesaj: string;
}

export interface OpeningClaimPreviewDTO {
  paraBirimi: string;
  kalemler: Array<{
    dueIndex: number;
    kalemTuru: string | null;
    aciklama: string | null;
    tutar: number;
    vekaletUcretiKaynagi: string | null;
    faiz: {
      acilisDurumu: "UNKNOWN" | "NO_INTEREST";
      /** Kalem asıl alacak sınıfında mı (sunucu sınıflar). Asıl alacakta faiz hesabı faiz durumu alanına bağlı değildir. */
      anaparaKalemi?: boolean;
      onayBekleyecekBeyan: { durum: "ACCRUES"; faizTuruKodu: string | null; baslangic: string | null; dayanak: string } | null;
    };
    sorumluluk: {
      acilisTuru: "BELIRLENMEDI";
      onayBekleyecekSecim: {
        tur: "BELIRLENMEDI" | "KAYITTAN_KISITLI" | "MUTESELSIL" | "PAYLI" | "TUTARLA_SINIRLI";
        dayanak: string | null;
        tavanKapsami: "ITEM_AMOUNT" | null;
        borclular: Array<{ debtorId: string; pay: number | null; payAgirligi: number | null; tavan: number | null; sinirsiz: boolean; sorumlulukSiniri: number | null }>;
      } | null;
    };
  }>;
  kalemTutarlariToplami: number;
  borcluDagilimi: Array<{
    debtorId: string;
    kalemler: Array<{ dueIndex: number; durum: "BELIRLENMEDI" | "SECIMDE_YOK" | "MUTESELSIL" | "PAYLI" | "TUTARLA_SINIRLI"; sorumlulukSiniri: number | null }>;
    belirlenmeyenKalemSayisi: number;
    sorumlulukUstSiniri: number | null;
  }>;
  onayaGidecekFaizBeyaniSayisi: number;
  onayaGidecekSorumlulukSecimiSayisi: number;
  hatalar: OpeningClaimPreviewErrorDTO[];
  uygulanabilir: boolean;
  onizlemeOzeti: string;
  secimYazmaAcik: boolean;
  aciklamalar: { onay: string; kullaniciTercihi: string; toplam: string; tavanKapsami: string; onaySirasi: string };
}

export interface OpeningClaimRequestsOutcomeDTO {
  requested: true;
  previewHash: string;
  faizBeyanlari: Array<{ dueIndex: number; claimItemId: string | null; status: "REQUESTED" | "REJECTED" | "SKIPPED"; approvalRequestId?: string; errorCode?: string; message?: string }>;
  sorumlulukSecimi: { status: "REQUESTED" | "REJECTED" | "SKIPPED"; kalemSayisi: number; approvalRequestId?: string; errorCode?: string; message?: string } | null;
  tamami: boolean;
  onaySirasiNotu: string | null;
  aciklama: string;
}

/**
 * Dosya oluşturulduktan sonra açılış beyanlarının sonucunu kullanıcıya okunur metinle söyler; beyan yoksa `null`.
 * Onay talepleri dosyayla AYNI işlemde açılır: talep açılamazsa dosya da oluşmaz ve hata `formatOpeningClaimCreateError`
 * ile gösterilir. Aşağıdaki "açılmadı" dalı yalnız eski sürüm sunucu yanıtı içindir (sessiz geçilmez).
 */
export function describeOpeningClaimRequestsOutcome(outcome: OpeningClaimRequestsOutcomeDTO | null | undefined): string | null {
  if (!outcome || outcome.requested !== true) return null;
  const lines: string[] = [];
  const requestedInterest = outcome.faizBeyanlari.filter((row) => row.status === "REQUESTED").length;
  const failedInterest = outcome.faizBeyanlari.filter((row) => row.status !== "REQUESTED");
  if (requestedInterest > 0) lines.push(`${requestedInterest} kalem için "faiz işler" beyanı onaya gönderildi.`);
  if (outcome.sorumlulukSecimi?.status === "REQUESTED") {
    lines.push(`${outcome.sorumlulukSecimi.kalemSayisi} kalem için borçlu sorumluluğu seçimi onaya gönderildi.`);
  }
  if (lines.length > 0) lines.push("Bu bilgiler ikinci kişi onaylayana kadar kaleme yazılmaz ve hesaplara yansımaz.");
  if (outcome.onaySirasiNotu) lines.push(outcome.onaySirasiNotu);
  const failures: string[] = [];
  for (const row of failedInterest) failures.push(`${row.dueIndex + 1}. kalemin faiz beyanı: ${row.message || row.errorCode || "talep açılmadı"}`);
  if (outcome.sorumlulukSecimi && outcome.sorumlulukSecimi.status !== "REQUESTED") {
    failures.push(`Borçlu sorumluluğu seçimi: ${outcome.sorumlulukSecimi.message || outcome.sorumlulukSecimi.errorCode || "talep açılmadı"}`);
  }
  if (failures.length > 0) {
    lines.push("Dosya oluşturuldu, ancak şu beyanlar için onay talebi AÇILMADI:");
    lines.push(...failures.map((failure) => `• ${failure}`));
    lines.push('Kalemler "belirlenmedi" olarak açıldı. Aynı beyanı dosyanın Alacak Kalemleri bölümünden yeniden gönderebilirsiniz.');
  }
  return lines.length > 0 ? lines.join("\n") : null;
}

/**
 * POST /cases açılış beyanı reddi (dosya HİÇ oluşmaz) → okunur Türkçe mesaj; tanınmayan hata → null. Sunucunun kararlı
 * koduna bağlıdır. Taslak silinmez; kullanıcı düzeltip yeniden gönderir.
 */
export function formatOpeningClaimCreateError(error: unknown): string | null {
  const body = (error as { body?: Record<string, unknown> } | null)?.body;
  if (!body || typeof body !== "object") return null;
  switch (body.code) {
    case "OPENING_CLAIM_PREVIEW_STALE":
      return "Takip oluşturulmadı: açılış önizlemesinden sonra kalemler, borçlular ya da beyanlar değişmiş. Önizleme yenilendi; kontrol edip yeniden gönderin.";
    case "CLAIM_LIABILITY_SELECTION_DISABLED":
      return "Takip oluşturulmadı: borçlu sorumluluğu seçimi bu ortamda kapalı. Seçimi kaldırıp yeniden gönderin; seçim dosya açıldıktan sonra da yapılabilir.";
    case "OPENING_CLAIM_REQUESTS_UNAVAILABLE":
      return "Takip oluşturulmadı: açılış beyanları bu ortamda işlenemiyor. Beyanları kaldırıp yeniden gönderin.";
    case "OPENING_CLAIM_REQUESTS_NOT_OPENED": {
      // Onay talepleri dosyayla AYNI işlemde açılır: talep açılamadıysa dosya, kalemler ve öteki talepler de oluşmadı.
      const dueIndex = typeof body.dueIndex === "number" ? `${body.dueIndex + 1}. kalem: ` : "";
      const reason =
        body.reasonCode === "CASE_FINANCE_PERMISSION_REQUIRED"
          ? "bu dosyada mali düzenleme yetkiniz yok (dosya yetkileri ofis yönetimince verilir)"
          : typeof body.message === "string" && body.message
            ? body.message.replace(/^Açılış beyanları için onay talebi açılamadı; dosya oluşturulmadı\.\s*/, "").replace(/\.$/, "")
            : "onay talebi açılamadı";
      return `Takip oluşturulmadı: açılış beyanları onaya gönderilemedi — ${dueIndex}${reason}. Hiçbir kayıt oluşmadı ve girdiğiniz bilgiler silinmedi. Beyanları kaldırıp dosyayı açabilir ya da engel giderildikten sonra yeniden gönderebilirsiniz.`;
    }
    case "OPENING_CLAIM_REQUESTS_INVALID": {
      const errors = (Array.isArray(body.errors) ? body.errors : []).filter(
        (entry): entry is OpeningClaimPreviewErrorDTO => !!entry && typeof entry === "object" && typeof (entry as { mesaj?: unknown }).mesaj === "string",
      );
      const detail = errors
        .slice(0, 5)
        .map((entry) => `${entry.dueIndex === null ? "" : `${entry.dueIndex + 1}. kalem: `}${entry.mesaj}`)
        .join("; ");
      return `Takip oluşturulmadı: açılış beyanları geçersiz${detail ? ` — ${detail}` : ""}. Girdiğiniz bilgiler silinmedi.`;
    }
    default:
      return null;
  }
}

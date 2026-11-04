/**
 * O-5 (owner 05.11.2026, C politikası) — pasif personelin yönetici gözden geçirmesiyle yeniden etkinleştirilmesi.
 *
 * Sunucu sözleşmesi (apps/api staff.service.ts):
 *  - POST /staff aynı TCKN / e-postayla PASİF karta denk gelirse HİÇBİR YAZIM YAPMAZ ve
 *    409 { code: 'STAFF_REACTIVATION_REVIEW', message, staff } döner. `staff` kartın MEVCUT izinlerini ve
 *    etkisini taşır (bağlı giriş hesabının durumu, dosya ataması ve dosya sorumluluğu sayısı).
 *  - POST /staff/:id/reactivate (F01) bütün izin kümesini açık gövdeden alır; giriş hesabını, rolünü ve
 *    büro geneli izinleri DEĞİŞTİRMEZ; yanıt bağlı hesabın GERÇEK durumunu döner.
 * Bu modül yalnız okur / metin üretir; ağ çağrısı yapmaz.
 */

export const STAFF_REACTIVATION_FIELDS = [
  'staffType',
  'canCreateCase',
  'canEditCase',
  'canGenerateDocuments',
  'canApproveDocuments',
  'canSeeFinance',
  'canApproveFinance',
  'canPrepareCollectionDisposition',
  'canSendNotifications',
  'isDefaultForNewCases',
] as const;

export interface StaffReactivationValues {
  staffType: string;
  canCreateCase: boolean;
  canEditCase: boolean;
  canGenerateDocuments: boolean;
  canApproveDocuments: boolean;
  canSeeFinance: boolean;
  canApproveFinance: boolean;
  canPrepareCollectionDisposition: boolean;
  canSendNotifications: boolean;
  isDefaultForNewCases: boolean;
}

export interface StaffLinkedAccount {
  exists: boolean;
  isActive: boolean;
}

export interface StaffReactivationReview {
  staffId: string;
  name: string;
  values: StaffReactivationValues;
  linkedAccount: StaffLinkedAccount;
  caseAssignmentCount: number;
  responsibleCaseCount: number;
}

const BOOLEAN_FIELDS = STAFF_REACTIVATION_FIELDS.filter((k) => k !== 'staffType') as Array<
  Exclude<(typeof STAFF_REACTIVATION_FIELDS)[number], 'staffType'>
>;

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const isCount = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;

/** İnceleme gövdesi değilse ya da şekli eksikse null (eksik bilgiyle izin ekranı açılmaz). */
export function readStaffReactivationReview(body: unknown): StaffReactivationReview | null {
  const b = asRecord(body);
  if (!b || b.code !== 'STAFF_REACTIVATION_REVIEW') return null;
  const s = asRecord(b.staff);
  if (!s || typeof s.id !== 'string' || s.id === '' || typeof s.staffType !== 'string') return null;
  if (BOOLEAN_FIELDS.some((k) => typeof s[k] !== 'boolean')) return null;
  const acc = asRecord(s.linkedAccount);
  if (!acc || typeof acc.exists !== 'boolean' || typeof acc.isActive !== 'boolean') return null;
  if (!isCount(s.caseAssignmentCount) || !isCount(s.responsibleCaseCount)) return null;
  const values = { staffType: s.staffType } as StaffReactivationValues;
  for (const k of BOOLEAN_FIELDS) values[k] = s[k] as boolean;
  const name = [s.firstName, s.lastName].filter((x) => typeof x === 'string' && x.trim() !== '').join(' ').trim();
  return {
    staffId: s.id,
    name: name || 'Pasif personel',
    values,
    linkedAccount: { exists: acc.exists, isActive: acc.isActive },
    caseAssignmentCount: s.caseAssignmentCount,
    responsibleCaseCount: s.responsibleCaseCount,
  };
}

/** Gönderilecek gövde: bütün alanlar AÇIKÇA (sunucu eksik alanı 400 ile reddeder). */
export function buildStaffReactivationPayload(values: StaffReactivationValues): StaffReactivationValues {
  const out = { staffType: values.staffType } as StaffReactivationValues;
  for (const k of BOOLEAN_FIELDS) out[k] = values[k] === true;
  return out;
}

export const STAFF_REACTIVATION_REVIEW_FALLBACK =
  'Bu TCKN veya e-postayla pasif bir personel kaydı var; inceleme bilgisi okunamadı. Hiçbir değişiklik yapılmadı.';

/** Onay ÖNCESİ: bağlı hesap hakkında gerçek durum; giriş erişimi açılacağı izlenimi verilmez. */
export function linkedAccountNotice(acc: StaffLinkedAccount): string {
  if (!acc.exists) return 'Bu kartın bağlı giriş hesabı yok. Yeniden etkinleştirme giriş hesabı açmaz.';
  if (!acc.isActive) {
    return 'Bağlı giriş hesabı KAPALI. Yeniden etkinleştirme giriş hesabını, rolünü ve büro geneli izinleri değiştirmez; personel giriş yapamaz.';
  }
  return 'Bağlı giriş hesabı açık. Yeniden etkinleştirme giriş hesabını, rolünü ve büro geneli izinleri değiştirmez.';
}

/** Onay öncesi etki: pasifleştirmede silinmeyen dosya atamaları ve sorumluluklar yeniden etkili olur. */
export function caseImpactNotice(review: Pick<StaffReactivationReview, 'caseAssignmentCount' | 'responsibleCaseCount'>): string[] {
  const out: string[] = [];
  out.push(
    review.caseAssignmentCount > 0
      ? `Kartın ${review.caseAssignmentCount} dosya ataması var; yeniden etkinleştirilirse bu atamalar yeniden etkili olur.`
      : 'Kartın dosya ataması yok.',
  );
  if (review.responsibleCaseCount > 0) {
    out.push(`Personel ${review.responsibleCaseCount} dosyada dosya sorumlusu olarak kayıtlı; bu kayıtlar da yeniden etkili olur.`);
  }
  return out;
}

export const AUTO_ASSIGN_EXPLANATION =
  'İşaretli kalırsa personel bundan sonra açılan her yeni takibe otomatik atanır; bu, giriş hesabı kapalı olsa bile işler.';

/** Başarı: yanıttaki GERÇEK hesap durumuyla; okunamazsa hesap hakkında iddia kurulmaz. */
export function reactivationResultMessage(body: unknown): string {
  const acc = asRecord(asRecord(body)?.linkedAccount);
  const head = 'Personel yeniden etkinleştirildi.';
  if (!acc || typeof acc.exists !== 'boolean' || typeof acc.isActive !== 'boolean') {
    return `${head} Bağlı giriş hesabının durumu okunamadı; bu işlem giriş hesabını değiştirmez.`;
  }
  if (!acc.exists) return `${head} Bağlı giriş hesabı yok; giriş erişimi açılmadı.`;
  if (!acc.isActive) return `${head} Bağlı giriş hesabı kapalı kaldı; giriş erişimi açılmadı.`;
  return `${head} Bağlı giriş hesabı zaten açıktı; bu işlem değiştirmedi.`;
}

/** Hata: sunucu kodları; hiçbir dalda otomatik yeniden deneme yok. */
export function classifyStaffReactivationFailure(error: unknown): string {
  const e = asRecord(error);
  const body = asRecord(e?.body);
  const code = typeof body?.code === 'string' ? body.code : undefined;
  const message = typeof body?.message === 'string' ? body.message : undefined;
  const status = typeof e?.status === 'number' ? e.status : undefined;
  if (code === 'STAFF_REACTIVATION_CONFLICT') {
    return 'Personel kaydı bu arada değişti ya da başka bir istekle etkinleştirildi; yeniden etkinleştirme uygulanmadı. Listeyi yenileyip kaydı yeniden açın.';
  }
  if (code === 'STAFF_ALREADY_ACTIVE') return 'Personel zaten etkin; yeniden etkinleştirme yapılmadı.';
  if (code === 'DUPLICATE_IDENTITY') {
    return message ?? 'Bu TCKN veya e-posta ile kayıtlı başka bir etkin personel var; yeniden etkinleştirme yapılmadı.';
  }
  if (status === 403) return 'Bu işlem için büro yönetim yetkisi gerekir. Hiçbir değişiklik yapılmadı.';
  if (status === 404) return 'Personel kaydı bulunamadı. Hiçbir değişiklik yapılmadı.';
  return 'Yeniden etkinleştirmenin sonucu doğrulanamadı. Tekrar denemeden önce personel listesini yenileyip kartın durumunu kontrol edin.';
}

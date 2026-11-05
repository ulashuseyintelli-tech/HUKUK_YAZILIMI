/**
 * O-5b (owner 05.11.2026, A politikası) — yeniden etkinleştirilmiş personelin KAPALI giriş hesabını yönetici gözden
 * geçirmesiyle açma.
 *
 * Sunucu sözleşmesi (apps/api staff.service.ts):
 *  - GET /staff/:id/account-reopen-review (F01 + güncel ADMIN) → { data: inceleme }: rol, hesap durumu, iki F02 anahtarındaki
 *    GLOBAL bitmemiş ALLOW kayıtları (ileri tarihliler dahil), bilgi olarak DENY anahtarları ve içerik parmak izi.
 *  - POST /staff/:id/account-reopen { reviewFingerprint, keepGrantIds } → TEK transaction: hesap açılır, tokenVersion artar
 *    (eski oturumlar kapanır), açık parola sıfırlama bağlantıları iptal edilir, işaretlenmeyen ALLOW kayıtları sona erer,
 *    denetim yazılır. Rol, parola, DENY ve F02 dışı izinler DEĞİŞMEZ. İnceleme bu arada değiştiyse 409 (yazım yok).
 * Bu modül yalnız okur / metin üretir; ağ çağrısı yapmaz.
 */

export type StaffAccountReopenBlockReason =
  | 'STAFF_INACTIVE'
  | 'NO_LINKED_ACCOUNT'
  | 'ACCOUNT_ALREADY_ACTIVE'
  | 'ACCOUNT_PENDING_INVITE';

export interface StaffAccountReopenGrant {
  id: string;
  permissionKey: string;
  validFrom: string;
  validUntil: string | null;
  startsInFuture: boolean;
}

export interface StaffAccountReopenReview {
  staffId: string;
  reopenable: boolean;
  reason: StaffAccountReopenBlockReason | null;
  account: { role: string; isActive: boolean; hasPassword: boolean } | null;
  allowGrants: StaffAccountReopenGrant[];
  denyKeys: string[];
  reviewFingerprint: string | null;
}

export interface StaffAccountReopenPayload {
  reviewFingerprint: string;
  keepGrantIds: string[];
}

const REASONS: StaffAccountReopenBlockReason[] = ['STAFF_INACTIVE', 'NO_LINKED_ACCOUNT', 'ACCOUNT_ALREADY_ACTIVE', 'ACCOUNT_PENDING_INVITE'];
const FINGERPRINT_RE = /^[a-f0-9]{64}$/;

const asRecord = (v: unknown): Record<string, unknown> | null =>
  v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : null;
const isStr = (v: unknown): v is string => typeof v === 'string' && v !== '';

/** `api.get` yanıtı ({ data: { data } }) ya da çıplak gövde; şekil eksikse null (eksik bilgiyle onay ekranı açılmaz). */
export function readStaffAccountReopenReview(input: unknown): StaffAccountReopenReview | null {
  const outer = asRecord(input);
  const candidate = asRecord(asRecord(outer?.data)?.data) ?? asRecord(outer?.data) ?? outer;
  const b = candidate;
  if (!b || !isStr(b.staffId) || typeof b.reopenable !== 'boolean') return null;
  const reason = b.reason === null ? null : REASONS.includes(b.reason as StaffAccountReopenBlockReason) ? (b.reason as StaffAccountReopenBlockReason) : undefined;
  if (reason === undefined) return null;
  const acc = b.account === null ? null : asRecord(b.account);
  if (b.account !== null && (!acc || typeof acc.role !== 'string' || typeof acc.isActive !== 'boolean' || typeof acc.hasPassword !== 'boolean')) return null;
  if (!Array.isArray(b.allowGrants) || !Array.isArray(b.denyKeys) || b.denyKeys.some((k) => typeof k !== 'string')) return null;
  const allowGrants: StaffAccountReopenGrant[] = [];
  for (const raw of b.allowGrants) {
    const g = asRecord(raw);
    if (!g || !isStr(g.id) || !isStr(g.permissionKey) || !isStr(g.validFrom) || !(g.validUntil === null || isStr(g.validUntil)) || typeof g.startsInFuture !== 'boolean') return null;
    allowGrants.push({ id: g.id, permissionKey: g.permissionKey, validFrom: g.validFrom, validUntil: g.validUntil as string | null, startsInFuture: g.startsInFuture });
  }
  const fp = b.reviewFingerprint;
  if (b.reopenable) {
    // Açılabilir inceleme TAM olmalı: parmak izi, hesap ve "neden yok".
    if (typeof fp !== 'string' || !FINGERPRINT_RE.test(fp) || !acc || reason !== null) return null;
  } else if (fp !== null || reason === null) {
    return null;
  }
  return {
    staffId: b.staffId,
    reopenable: b.reopenable,
    reason,
    account: acc ? { role: acc.role as string, isActive: acc.isActive as boolean, hasPassword: acc.hasPassword as boolean } : null,
    allowGrants,
    denyKeys: b.denyKeys as string[],
    reviewFingerprint: (fp as string | null) ?? null,
  };
}

/** Gönderilecek gövde: yalnız incelemede listelenen kimlikler korunabilir (tekrarsız); boş liste = hiçbiri korunmaz. */
export function buildStaffAccountReopenPayload(review: StaffAccountReopenReview, keep: Iterable<string>): StaffAccountReopenPayload {
  if (!review.reopenable || !review.reviewFingerprint) throw new Error('Açılamayan inceleme için hesap açma gövdesi kurulmaz');
  const listed = new Set(review.allowGrants.map((g) => g.id));
  const keepGrantIds = [...new Set(keep)].filter((id) => listed.has(id));
  return { reviewFingerprint: review.reviewFingerprint, keepGrantIds };
}

const KEY_LABEL: Record<string, string> = {
  'office.tasks.view_all': 'Görevler — büro geneli görünüm',
  'office.expenses.view_all': 'Masraflar — büro geneli görünüm',
};
export const grantLabel = (key: string): string => KEY_LABEL[key] ?? key;

const ROLE_LABEL: Record<string, string> = { ADMIN: 'Yönetici (ADMIN)', USER: 'Kullanıcı (USER)', VIEWER: 'Görüntüleyici (VIEWER)' };
export const roleLabel = (role: string): string => ROLE_LABEL[role] ?? role;

export function blockedReasonMessage(reason: StaffAccountReopenBlockReason | null): string {
  switch (reason) {
    case 'STAFF_INACTIVE':
      return 'Personel kartı pasif; giriş hesabı açılmaz. Önce kartı izinleri gözden geçirerek yeniden etkinleştirin.';
    case 'NO_LINKED_ACCOUNT':
      return 'Bu kartın bağlı giriş hesabı yok; açılacak hesap bulunmuyor.';
    case 'ACCOUNT_ALREADY_ACTIVE':
      return 'Bağlı giriş hesabı zaten açık; bu işlem bir şey değiştirmez.';
    case 'ACCOUNT_PENDING_INVITE':
      return 'Bağlı hesap daveti henüz kabul etmemiş (parolası yok); hesap açma değil davet yolu kullanılır.';
    default:
      return 'Giriş hesabı şu an açılamaz.';
  }
}

/** Onay ÖNCESİ açıklama: gerçekte olacak olan her şey; parola ya da rol değişikliği izlenimi verilmez. */
export function reopenConsequences(review: StaffAccountReopenReview): string[] {
  const out = [
    'Giriş hesabı açılır; personel mevcut parolasıyla giriş yapabilir. Parola değiştirilmez.',
    'Pasifleştirmeden önce açılmış bütün oturumlar geçersiz olur; personel yeniden giriş yapmalıdır.',
    'Açık parola sıfırlama bağlantıları iptal edilir.',
    `Rol değişmez: ${roleLabel(review.account?.role ?? '')}.`,
    review.allowGrants.length > 0
      ? 'İşaretlemediğiniz büro geneli görünüm izinleri sona erer; yalnız işaretlediğiniz izinler korunur.'
      : 'Sona erecek büro geneli görünüm izni yok.',
  ];
  if (review.denyKeys.length > 0) {
    out.push(`Açık ret (DENY) kayıtları değişmez: ${review.denyKeys.map(grantLabel).join(', ')}.`);
  }
  return out;
}

/** Başarı: yanıttaki GERÇEK sonuçla; okunamazsa hesap hakkında iddia kurulmaz. */
export function accountReopenResultMessage(input: unknown): string {
  const outer = asRecord(input);
  const d = asRecord(asRecord(outer?.data)?.data) ?? asRecord(outer?.data) ?? outer;
  const acc = asRecord(d?.account);
  const kept = d?.keptGrantCount;
  const expired = d?.expiredGrantCount;
  if (!acc || acc.isActive !== true || typeof kept !== 'number' || typeof expired !== 'number' || d?.sessionsInvalidated !== true) {
    return 'İstek tamamlandı ama sonuç okunamadı. Tekrar denemeden önce personel kartını yenileyip giriş hesabının durumunu kontrol edin.';
  }
  return `Giriş hesabı açıldı. Eski oturumlar geçersiz; personel yeniden giriş yapmalı. ${kept} büro geneli izin korundu, ${expired} izin sona erdi. Rol ve parola değişmedi.`;
}

/** Hata: sunucu kodları; hiçbir dalda otomatik yeniden deneme yok. `refresh` = inceleme yeniden okunmalı. */
export function classifyStaffAccountReopenFailure(error: unknown): { message: string; refresh: boolean } {
  const e = asRecord(error);
  const body = asRecord(e?.body);
  const code = typeof body?.code === 'string' ? body.code : undefined;
  const status = typeof e?.status === 'number' ? e.status : undefined;
  if (code === 'STAFF_ACCOUNT_REVIEW_STALE' || code === 'STAFF_ACCOUNT_REOPEN_CONFLICT' || code === 'STAFF_ACCOUNT_REOPEN_UNKNOWN_GRANT') {
    return { message: 'Hesap ya da büro geneli izinler siz incelerken değişti; hiçbir şey yazılmadı. İncelemeyi yenileyip yeniden karar verin.', refresh: true };
  }
  if (code === 'STAFF_ACCOUNT_REOPEN_NOT_APPLICABLE') {
    const reason = REASONS.includes(body?.reason as StaffAccountReopenBlockReason) ? (body?.reason as StaffAccountReopenBlockReason) : null;
    return { message: `${blockedReasonMessage(reason)} Hiçbir şey yazılmadı.`, refresh: true };
  }
  if (code === 'STAFF_ACCOUNT_REOPEN_ADMIN_REQUIRED' || status === 403) {
    return { message: 'Bu işlem için güncel ADMIN yetkisi gerekir. Hiçbir değişiklik yapılmadı.', refresh: false };
  }
  if (status === 404) return { message: 'Personel kaydı bulunamadı. Hiçbir değişiklik yapılmadı.', refresh: false };
  return {
    message: 'Hesap açmanın sonucu doğrulanamadı. Tekrar denemeden önce personel kartını yenileyip giriş hesabının durumunu kontrol edin.',
    refresh: false,
  };
}

export const formatGrantDate = (iso: string | null): string => {
  if (!iso) return '';
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' });
};

/**
 * Client Audit — sanitized field-level diff (C0-a)
 *
 * KVKK guardrail (boundary §C0 acceptance #3): TCKN/VKN/adres/telefon/e-posta gibi
 * kişisel veriler audit log JSON'una HAM (full raw) yazılmaz. Full oldValues/newValues
 * object dump YOK. Yalnız değişen alanların field-level SANITIZED diff'i tutulur:
 *  - yapısal PII (tckn/vkn/identityNo/phone/email/mersis/sicil) → mask util (son haneler)
 *  - serbest-metin PII (ad/soyad/unvan/adres/not) → digest(sha256 ilk 16) + uzunluk (raw yok)
 *  - PII olmayan operasyonel alanlar (type/yetki flag'leri/isActive/bölge/tebrik) → düz değer
 *
 * Çağrıldığı yerler:
 *  - ClientService.create()  → CLIENT_CREATE / CLIENT_REACTIVATE audit snapshot
 *  - ClientService.update()  → CLIENT_UPDATE field + contact diff
 *  - ClientService.remove()  → CLIENT_DELETE old snapshot (sanitized)
 */
import { createHash } from 'crypto';

/** Serbest-metin PII için geri-döndürülemez özet (ham değer ASLA loglanmaz). */
function digest(value: unknown): { digest: string; length: number } | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  return { digest: `sha256:${createHash('sha256').update(s).digest('hex').slice(0, 16)}`, length: s.length };
}

function maskTail(value: unknown, visible = 4): string | null {
  if (value === null || value === undefined || value === '') return null;
  const s = String(value);
  if (s.length <= visible) return '****';
  return `****${s.slice(-visible)}`;
}

function maskEmailLocal(value: unknown): string | null {
  if (!value) return null;
  const s = String(value);
  const at = s.indexOf('@');
  if (at <= 1) return `****${s.slice(at)}`;
  return `${s.slice(0, 1)}***${s.slice(at)}`;
}

/** PII olmayan (operasyonel) alanlar — düz değer audit'e yazılabilir. */
const PLAIN_FIELDS = new Set([
  'type', 'canCollect', 'canWaive', 'canSettle', 'canRelease', 'isActive',
  'isForeigner', 'nationality', 'companyType', 'taxOffice', 'region', 'city', 'district',
  'greetingChannel', 'sendBirthdayGreeting', 'sendAnniversaryGreeting', 'sendHolidayGreeting',
]);
/** Yapısal PII — mask (son haneler). */
const MASK_TAIL_FIELDS = new Set(['tckn', 'vkn', 'identityNo', 'phone', 'mersisNo', 'ticaretSicilNo']);
/** Serbest-metin PII — digest + uzunluk. */
const DIGEST_FIELDS = new Set(['displayName', 'name', 'firstName', 'lastName', 'companyName', 'address', 'notes']);

/** Tek alanın sanitized gösterimi (loglanabilir; ham PII içermez). */
function sanitizeValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (PLAIN_FIELDS.has(field)) return value;
  if (field === 'email') return maskEmailLocal(value);
  if (MASK_TAIL_FIELDS.has(field)) return maskTail(value, field === 'phone' ? 2 : 4);
  if (DIGEST_FIELDS.has(field)) return digest(value);
  // bilinmeyen alan → temkinli digest (asla ham)
  return digest(value);
}

const TRACKED_FIELDS = [
  'type', 'displayName', 'firstName', 'lastName', 'tckn', 'companyName', 'vkn', 'identityNo',
  'taxOffice', 'email', 'phone', 'address', 'city', 'district', 'region',
  'isForeigner', 'nationality', 'companyType', 'mersisNo', 'ticaretSicilNo',
  'canCollect', 'canWaive', 'canSettle', 'canRelease', 'isActive', 'notes',
  'greetingChannel', 'sendBirthdayGreeting', 'sendAnniversaryGreeting', 'sendHolidayGreeting',
];

export interface FieldDiffEntry {
  field: string;
  changed: boolean;
  old: unknown;
  new: unknown;
}

/** İki client satırı arasında DEĞİŞEN alanların sanitized diff'i (create'te old=null geçilebilir). */
export function buildClientFieldDiff(
  oldRow: Record<string, any> | null,
  newRow: Record<string, any>,
): FieldDiffEntry[] {
  const diff: FieldDiffEntry[] = [];
  for (const field of TRACKED_FIELDS) {
    const oldVal = oldRow ? oldRow[field] : undefined;
    const newVal = newRow[field];
    const oldNorm = oldVal === undefined ? null : oldVal;
    const newNorm = newVal === undefined ? null : newVal;
    if (oldRow && String(oldNorm) === String(newNorm)) continue; // değişmeyen alanı atla
    if (!oldRow && (newNorm === null || newNorm === '')) continue; // create'te boş alanı atla
    diff.push({
      field,
      changed: true,
      old: oldRow ? sanitizeValue(field, oldNorm) : null,
      new: sanitizeValue(field, newNorm),
    });
  }
  return diff;
}

interface ContactRow { type: string; value: string; isPrimary?: boolean }

export interface ContactsDiff {
  changed: boolean;
  phones: { oldCount: number; newCount: number; oldMasked: string[]; newMasked: string[] };
  emails: { oldCount: number; newCount: number; oldMasked: string[]; newMasked: string[] };
}

/**
 * Contact (telefon/e-posta) diff — boundary acceptance #2.
 * update() deleteMany+createMany ile contact'ları komple değiştirebilir; bu değişim
 * audit'te GÖRÜNMELİ ama ham telefon/e-posta YAZILMAMALI (masked).
 */
export function buildContactsDiff(
  oldContacts: ContactRow[] | undefined,
  newPhones: Array<{ value: string }> | undefined,
  newEmails: Array<{ value: string }> | undefined,
): ContactsDiff {
  const old = oldContacts ?? [];
  const oldPhones = old.filter((c) => c.type !== 'EMAIL').map((c) => c.value);
  const oldEmails = old.filter((c) => c.type === 'EMAIL').map((c) => c.value);
  const newP = (newPhones ?? []).map((p) => p.value).filter(Boolean);
  const newE = (newEmails ?? []).map((e) => e.value).filter(Boolean);

  const sameSet = (a: string[], b: string[]) =>
    a.length === b.length && [...a].sort().join('|') === [...b].sort().join('|');
  const phonesChanged = !sameSet(oldPhones, newP);
  const emailsChanged = !sameSet(oldEmails, newE);

  return {
    changed: phonesChanged || emailsChanged,
    phones: {
      oldCount: oldPhones.length, newCount: newP.length,
      oldMasked: oldPhones.map((v) => maskTail(v, 2) ?? '****'),
      newMasked: newP.map((v) => maskTail(v, 2) ?? '****'),
    },
    emails: {
      oldCount: oldEmails.length, newCount: newE.length,
      oldMasked: oldEmails.map((v) => maskEmailLocal(v) ?? '****'),
      newMasked: newE.map((v) => maskEmailLocal(v) ?? '****'),
    },
  };
}

/** remove() için minimal sanitized eski-kayıt özeti (ham PII yok). */
export function buildClientRemoveSnapshot(oldRow: Record<string, any>): Record<string, unknown> {
  return {
    type: oldRow.type ?? null,
    displayNameDigest: digest(oldRow.displayName ?? oldRow.name),
    identityMasked: maskTail(oldRow.tckn ?? oldRow.vkn ?? oldRow.identityNo, 4),
    wasActive: oldRow.isActive ?? null,
  };
}

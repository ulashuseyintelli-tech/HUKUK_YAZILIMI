/**
 * Debtor Audit — sanitized field-level diff (Task D1A)
 *
 * client-audit.util.ts (ClientService) ile AYNI FELSEFE, Debtor'a domain-local implementasyon
 * (cross-module coupling yerine — Debtor'ın alan kümesi Client'tan yeterince farklı: type-bazlı
 * gerçek-kişi/tüzel-kişi/kamu-kurumu/tereke alanları + risk/istihbarat alanları).
 *
 * KVKK guardrail: TCKN/VKN/ad-soyad/adres/telefon/e-posta gibi kişisel veriler audit log JSON'una
 * HAM yazılmaz. Yalnız değişen alanların field-level SANITIZED diff'i tutulur:
 *  - yapısal PII (tckn/vkn/detsisNo/identityNo/phone/mersisNo/tradeRegisterNo) → mask (son haneler)
 *  - serbest-metin PII (ad/soyad/unvan/adres/not) → digest(sha256 ilk 16) + uzunluk (ham yok)
 *  - PII olmayan operasyonel alanlar (type/riskLevel/addressIntakeMode) → düz değer
 *
 * Çağrıldığı yerler:
 *  - DebtorService.create()  → DEBTOR_CREATE audit field diff
 *  - DebtorService.update()  → DEBTOR_UPDATE audit field diff
 *  - DebtorService.delete()  → DEBTOR_DELETE eski-kayıt sanitized snapshot
 */
import { createHash } from 'crypto';

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
  'type', 'gender', 'institutionType', 'riskLevel', 'addressIntakeMode',
]);
/** Yapısal PII — mask (son haneler). */
const MASK_TAIL_FIELDS = new Set([
  'tckn', 'vkn', 'detsisNo', 'identityNo', 'deceasedTckn', 'phone', 'mersisNo', 'tradeRegisterNo',
]);
/** Serbest-metin PII — digest + uzunluk. */
const DIGEST_FIELDS = new Set([
  'name', 'firstName', 'lastName', 'companyName', 'institutionName', 'deceasedName',
  'fatherName', 'motherName', 'birthPlace', 'authorizedPerson', 'parentInstitution',
  'notes', 'riskNotes', 'kepAddress',
]);

function sanitizeValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (PLAIN_FIELDS.has(field)) return value;
  if (field === 'email') return maskEmailLocal(value);
  if (MASK_TAIL_FIELDS.has(field)) return maskTail(value, field === 'phone' ? 2 : 4);
  if (DIGEST_FIELDS.has(field)) return digest(value);
  // bilinmeyen alan → temkinli digest (asla ham)
  return digest(value);
}

/** İzlenen alanlar — Debtor şemasının TÜM tip-bazlı (gerçek/tüzel/kamu/tereke) alan kümesi. */
export const DEBTOR_TRACKED_FIELDS = [
  'type', 'firstName', 'lastName', 'tckn', 'gender', 'fatherName', 'motherName', 'birthPlace',
  'companyName', 'vkn', 'taxOffice', 'mersisNo', 'tradeRegisterNo',
  'institutionName', 'detsisNo', 'institutionType', 'parentInstitution', 'authorizedPerson',
  'deceasedName', 'deceasedTckn',
  'email', 'phone', 'kepAddress',
  'riskLevel', 'riskNotes', 'notes',
  'addressIntakeMode',
];

export interface DebtorFieldDiffEntry {
  field: string;
  changed: boolean;
  old: unknown;
  new: unknown;
}

/** İki debtor satırı arasında DEĞİŞEN alanların sanitized diff'i (create'te old=null geçilebilir). */
export function buildDebtorFieldDiff(
  oldRow: Record<string, any> | null,
  newRow: Record<string, any>,
  fields: readonly string[] = DEBTOR_TRACKED_FIELDS,
): DebtorFieldDiffEntry[] {
  const diff: DebtorFieldDiffEntry[] = [];
  for (const field of fields) {
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

/** delete() için minimal sanitized eski-kayıt özeti (ham PII yok). */
export function buildDebtorRemoveSnapshot(oldRow: Record<string, any>): Record<string, unknown> {
  return {
    type: oldRow.type ?? null,
    nameDigest: digest(oldRow.name),
    identityMasked: maskTail(
      oldRow.tckn ?? oldRow.vkn ?? oldRow.detsisNo ?? oldRow.deceasedTckn ?? oldRow.identityNo,
      4,
    ),
  };
}

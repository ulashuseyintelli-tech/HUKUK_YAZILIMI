/**
 * CaseDebtor Audit — sanitized field-level diff (DBND-D2)
 *
 * debtor-audit.util.ts (DebtorService) ile AYNI FELSEFE, CaseDebtor'a domain-local
 * implementasyon (alan kümesi tamamen farklı — role/liabilityAmount gibi hukuki/finansal
 * sınıflandırma alanları, Debtor'ın kişisel-veri alanlarından ayrı).
 *
 * role/liabilityAmount/liabilityType/notificationMode PII DEĞİL (hukuki sorumluluk
 * sınıflandırması + tutar + operasyonel tercih) → düz değer audit'e yazılır (auditörün
 * eski/yeni değeri GÖRMESİ gerekiyor, hash işe yaramaz). debtorLawyerName/caseNote/
 * ilanenJustification serbest-metin (karşı taraf vekili adı, dosya notu vb. içerebilir)
 * → digest (ham yok).
 *
 * Çağrıldığı yerler:
 *  - CaseDebtorService.updateCaseDebtor() → CASE_DEBTOR_UPDATE audit field diff
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

/** PII olmayan (hukuki/finansal/operasyonel sınıflandırma) alanlar — düz değer audit'e yazılabilir. */
const PLAIN_FIELDS = new Set([
  'role', 'liabilityAmount', 'liabilityType', 'notificationMode', 'prepareNotification',
  'selectedAddressId', 'debtorLawyerId',
]);
/** Yapısal kimlik-benzeri — mask (son haneler). */
const MASK_TAIL_FIELDS = new Set(['debtorLawyerBarNo']);
/** Serbest-metin (karşı taraf vekili adı, gerekçe, dosya notu) — digest + uzunluk. */
const DIGEST_FIELDS = new Set(['debtorLawyerName', 'ilanenJustification', 'caseNote']);

function sanitizeValue(field: string, value: unknown): unknown {
  if (value === null || value === undefined) return null;
  if (PLAIN_FIELDS.has(field)) return value;
  if (MASK_TAIL_FIELDS.has(field)) return maskTail(value);
  if (DIGEST_FIELDS.has(field)) return digest(value);
  return digest(value); // bilinmeyen alan → temkinli digest (asla ham)
}

/** İzlenen alanlar — UpdateCaseDebtorDto'nun tamamı (hukuki/finansal + operasyonel + serbest-metin). */
export const CASE_DEBTOR_TRACKED_FIELDS = [
  'role', 'liabilityAmount', 'liabilityType', 'notificationMode', 'selectedAddressId',
  'prepareNotification', 'ilanenJustification', 'debtorLawyerId', 'debtorLawyerName',
  'debtorLawyerBarNo', 'caseNote',
];

export interface CaseDebtorFieldDiffEntry {
  field: string;
  changed: boolean;
  old: unknown;
  new: unknown;
}

/** İki caseDebtor satırı arasında DEĞİŞEN alanların sanitized diff'i (değişmeyen alan atlanır). */
export function buildCaseDebtorFieldDiff(
  oldRow: Record<string, any>,
  newRow: Record<string, any>,
  fields: readonly string[] = CASE_DEBTOR_TRACKED_FIELDS,
): CaseDebtorFieldDiffEntry[] {
  const diff: CaseDebtorFieldDiffEntry[] = [];
  for (const field of fields) {
    const oldVal = oldRow[field];
    const newVal = newRow[field];
    const oldNorm = oldVal === undefined ? null : oldVal;
    const newNorm = newVal === undefined ? null : newVal;
    if (String(oldNorm) === String(newNorm)) continue;
    diff.push({
      field,
      changed: true,
      old: sanitizeValue(field, oldNorm),
      new: sanitizeValue(field, newNorm),
    });
  }
  return diff;
}

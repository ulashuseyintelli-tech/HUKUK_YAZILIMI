/**
 * C3-B07 — HUKUKİ AUDIT TEKLEŞTİRME SÖZLEŞMESİ (uniform contract, teknik blok).
 *
 * Reconstruction R01 bulgusu: audit in-tx + maskeli fakat coverage FRAGMENTED ve uniform
 * contract NOT SELECTED idi. Bu dosya sözleşmeyi SEÇER ve sabitler:
 *
 * 1. KANONİK KATALOG: C3 (B01-B06) hukuki kontrollerinin ürettiği her audit action
 *    burada kayıtlıdır. Katalog dışı CLIENT_* hukuki action'ı drift-guard testi düşürür
 *    (client-audit-uniformity-b07.spec.ts) — yeni action eklemek katalog kaydı ister.
 * 2. KANAL KURALI: mutasyon audit'leri AYNI transaction'da (logInTransaction) yazılır;
 *    salt-değerlendirme/erişim/deny audit'leri doğrudan (log) yazılır.
 * 3. PII KURALI (md.12/3 — acceptance "ham PII sızmıyor"): metadata ham kimlik numarası
 *    (TCKN/VKN), belge/serbest içerik veya şifresiz özel-nitelik verisi TAŞIMAZ; alan
 *    ADLARI ve reason-code'lar serbesttir. K8.4 gereği legal-hold GEREKÇELERİ audit'te
 *    taşınır (ratifiye istisna — gerekçe metni kimlik numarası içermemelidir).
 *
 * XL-2 KISITI: `AuditActor` (client.service) ve `client-audit.util` export'ları
 * DARALTILMAZ — bu sözleşme onların ÜZERİNE eklenir, yerine geçmez.
 */

export type ClientLegalAuditChannel = 'IN_TX' | 'DIRECT';

export interface ClientLegalAuditActionSpec {
  action: string;
  entityType: string;
  channel: ClientLegalAuditChannel;
  /** Deny kaydı ise metadata.reasonCode ZORUNLUDUR. */
  denyRecord?: boolean;
  /** Kaynağı olan blok (izlenebilirlik). */
  block: 'B01' | 'B02' | 'B03' | 'B04' | 'B05' | 'B06';
}

/** C3 hukuki kontrol audit katalogu — KAPALI liste (drift-guard testi zorlar). */
export const CLIENT_LEGAL_AUDIT_ACTIONS: readonly ClientLegalAuditActionSpec[] = [
  // B01 — §13/5 açık rıza
  { action: 'CLIENT_CONSENT_GRANT', entityType: 'CLIENT', channel: 'IN_TX', block: 'B01' },
  { action: 'CLIENT_CONSENT_REVOKE', entityType: 'CLIENT', channel: 'IN_TX', block: 'B01' },
  // B02 — §13/6 aydınlatma + DSAR
  { action: 'CLIENT_DISCLOSURE_TEXT_CREATE', entityType: 'CLIENT_DISCLOSURE_TEXT', channel: 'IN_TX', block: 'B02' },
  { action: 'CLIENT_DISCLOSURE_DELIVERY_RECORD', entityType: 'CLIENT', channel: 'IN_TX', block: 'B02' },
  { action: 'CLIENT_DSAR_RECEIVED', entityType: 'CLIENT_DSAR', channel: 'IN_TX', block: 'B02' },
  { action: 'CLIENT_DSAR_REVIEW_START', entityType: 'CLIENT_DSAR', channel: 'IN_TX', block: 'B02' },
  { action: 'CLIENT_DSAR_ASSIGN', entityType: 'CLIENT_DSAR', channel: 'IN_TX', block: 'B02' },
  { action: 'CLIENT_DSAR_RESPOND', entityType: 'CLIENT_DSAR', channel: 'IN_TX', block: 'B02' },
  // B03 — §13/8 legal hold + silme kapısı
  { action: 'CLIENT_LEGAL_HOLD_PLACE', entityType: 'CLIENT_LEGAL_HOLD', channel: 'IN_TX', block: 'B03' },
  { action: 'CLIENT_LEGAL_HOLD_RELEASE_REQUEST', entityType: 'CLIENT_LEGAL_HOLD', channel: 'IN_TX', block: 'B03' },
  { action: 'CLIENT_LEGAL_HOLD_RELEASE_APPROVE', entityType: 'CLIENT_LEGAL_HOLD', channel: 'IN_TX', block: 'B03' },
  { action: 'CLIENT_DELETION_GATE_EVALUATED', entityType: 'CLIENT', channel: 'DIRECT', block: 'B03' },
  // B04 — §13/7 özel nitelikli veri
  { action: 'CLIENT_SPECIAL_DATA_CREATE', entityType: 'CLIENT_SPECIAL_DATA', channel: 'IN_TX', block: 'B04' },
  { action: 'CLIENT_SPECIAL_DATA_ACCESS', entityType: 'CLIENT_SPECIAL_DATA', channel: 'DIRECT', block: 'B04' },
  // B05 — §13/9 efektif capability
  { action: 'CLIENT_EFFECTIVE_CAPABILITY_DENIED', entityType: 'CLIENT', channel: 'DIRECT', denyRecord: true, block: 'B05' },
  // B06 — §13/10 UYAP aktarım
  { action: 'CLIENT_UYAP_TRANSFER_DENIED', entityType: 'CLIENT', channel: 'DIRECT', denyRecord: true, block: 'B06' },
] as const;

export function resolveClientLegalAuditAction(action: string): ClientLegalAuditActionSpec | undefined {
  return CLIENT_LEGAL_AUDIT_ACTIONS.find((s) => s.action === action);
}

/** Metadata'da yasak anahtarlar: ham kimlik/içerik taşıyıcıları. */
export const CLIENT_LEGAL_AUDIT_FORBIDDEN_METADATA_KEYS = [
  'content',
  'contentEncrypted',
  'plaintext',
  'tckn',
  'vkn',
  'identityNo',
] as const;

export interface ClientLegalAuditMetadataVerdict {
  safe: boolean;
  violations: string[];
}

/**
 * PII güvenlik doğrulayıcısı (test + runtime kullanılabilir, saf):
 * - yasak anahtar adı (derinlemesine) → ihlal
 * - 10/11 haneli bitişik rakam dizisi (VKN/TCKN deseni) → ihlal
 * - deny kaydında reasonCode eksikliği → ihlal
 */
export function validateClientLegalAuditMetadata(
  action: string,
  metadata: unknown,
): ClientLegalAuditMetadataVerdict {
  const violations: string[] = [];
  const spec = resolveClientLegalAuditAction(action);
  const walk = (obj: unknown, path: string): void => {
    if (obj === null || obj === undefined) return;
    if (typeof obj === 'string') {
      if (/\d{10,11}/.test(obj)) violations.push(`RAW_IDENTITY_PATTERN at ${path}`);
      return;
    }
    if (typeof obj !== 'object') return;
    for (const [k, v] of Object.entries(obj as Record<string, unknown>)) {
      if ((CLIENT_LEGAL_AUDIT_FORBIDDEN_METADATA_KEYS as readonly string[]).includes(k)) {
        violations.push(`FORBIDDEN_KEY ${k} at ${path}`);
        continue;
      }
      walk(v, `${path}.${k}`);
    }
  };
  walk(metadata, 'metadata');
  if (spec?.denyRecord) {
    const rc = (metadata as any)?.reasonCode;
    if (typeof rc !== 'string' || rc.length === 0) violations.push('DENY_WITHOUT_REASON_CODE');
  }
  return { safe: violations.length === 0, violations };
}

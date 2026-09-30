import { defaultPermissionsFingerprint } from '../lawyer/lawyer-default-permissions-fingerprint';

/**
 * K3 kararı (owner GO 2026-09-30, seçenek A) — dosya açılışında avukat atamasına, OFİS YÖNETİMİNCE AÇIKÇA belirlenmiş
 * `Lawyer.defaultPermissions` değerlerinin ANLIK KOPYASI yazılır.
 *
 * Yetkilendirme dayanağı (kaynağı belirsiz varsayılan dayanak SAYILMAZ):
 *  - `Lawyer.defaultPermissions`'ı yazan iki yol vardır. OLUŞTURMA (`LawyerService.create`) yetki kapısından geçmez ve
 *    denetim yazmaz; web oluşturma formu değerleri rütbeye göre SİSTEM olarak önceden doldurur → dayanak DEĞİLDİR.
 *  - GÜNCELLEME (`LawyerService.update`) alanı yalnız ADMIN veya aynı tenant'ta aktif, bağlı PARTNER'a açar (transaction
 *    içinde güncel satırdan yeniden doğrulanır) ve değer gerçekten değişince AYNI transaction'da `LAWYER_PRIVILEGE_CHANGED`
 *    denetimini (`changedFields` ∋ `defaultPermissions`) yazar.
 *  - Kaydın VARLIĞI yetmez (owner GO 2026-09-30, kanıt bağı): yönetim kaydı yazılan değerin parmak izini taşır
 *    (`defaultPermissionsFingerprint`) ve yalnız AYNI tenant + AYNI avukat için EN SON yönetim kaydının izi GÜNCEL
 *    değerle eşleşirse varsayılan uygulanır. Eski bir yönetim işlemi, sonradan başka yoldan (denetimsiz yazma, veri
 *    düzeltmesi, geri yükleme) yazılmış değere yetki KAZANDIRMAZ; ilgisiz alan kaydı (`changedFields` ∌
 *    `defaultPermissions`) dayanak değildir. İz taşımayan eski kayıt doğrulanamaz → UYGULANMAZ; yönetimin değeri mevcut
 *    yetkili yoldan yeniden kaydetmesi gerekir. Kayıt yoksa (ör. yalnız oluşturmada doldurulmuş) da UYGULANMAZ.
 *  - Oluşturma yeni kimlik üretir (`id` gövdeden yazılamaz, fiziksel silme yok) → başka kaydın kanıtını devralamaz.
 *    Mükerrer kaydın yeniden etkinleştirilmesi değeri DEĞİŞTİRMEZ (onaylayıcı yetkisi ister); yönetimin son kararı geçerli
 *    kalır.
 *
 * Kopya kuralları: yalnız bilinen izin anahtarları ve yalnız boolean değerler; açık `false` KORUNUR; eksik anahtar izin
 * VERMEZ (sunucu kapısı `=== true` arar); geçerli anahtar yoksa hiç yetki yazılmaz ("tümü açık" varsayımı YOK).
 */

/** Dosya avukat yetki anahtarları (CaseLawyer.casePermissions şeması; Prisma şema yorumu ile aynı küme) */
export const CASE_LAWYER_PERMISSION_KEYS = Object.freeze([
  'canEditCase',
  'canGenerateDocs',
  'canSyncUYAP',
  'canViewFinance',
  'canEditFinance',
  'canChangeStatus',
  'canEditParties',
] as const);

export type CaseLawyerPermissionKey = (typeof CASE_LAWYER_PERMISSION_KEYS)[number];
export type CaseLawyerPermissionSnapshot = Partial<Record<CaseLawyerPermissionKey, boolean>>;

/** Varsayılan yetki kaynağının yönetimce yazıldığını gösteren denetim eylemi (LawyerService.update, B11) */
export const MANAGEMENT_DEFAULT_PERMISSIONS_AUDIT_ACTION = 'LAWYER_PRIVILEGE_CHANGED';
/** Dosya açılışında atanan avukatlara uygulanan / uygulanmayan varsayılan yetkilerin denetim kaydı */
export const CASE_OPEN_LAWYER_PERMISSIONS_AUDIT_ACTION = 'CASE_OPEN_LAWYER_DEFAULT_PERMISSIONS';

export type DefaultPermissionOutcome =
  | { readonly outcome: 'APPLIED'; readonly permissions: CaseLawyerPermissionSnapshot; readonly basisAuditLogId: string }
  | {
      readonly outcome: 'NOT_APPLIED';
      readonly reason:
        | 'LAWYER_NOT_IN_TENANT'
        | 'LAWYER_INACTIVE'
        | 'NO_DEFAULTS'
        | 'SOURCE_NOT_MANAGEMENT_VERIFIED'
        | 'SOURCE_VALUE_MISMATCH';
    };

/**
 * Varsayılan yetkinin anlık kopyası; bilinen boolean anahtar yoksa null.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - decideCaseOpenDefaultPermissions()
 * /// </remarks>
 */
export function snapshotLawyerDefaultPermissions(defaults: unknown): CaseLawyerPermissionSnapshot | null {
  if (!defaults || typeof defaults !== 'object' || Array.isArray(defaults)) return null;
  const record = defaults as Record<string, unknown>;
  const snapshot: CaseLawyerPermissionSnapshot = {};
  for (const key of CASE_LAWYER_PERMISSION_KEYS) {
    if (Object.prototype.hasOwnProperty.call(record, key) && typeof record[key] === 'boolean') {
      snapshot[key] = record[key] as boolean;
    }
  }
  return Object.keys(snapshot).length > 0 ? snapshot : null;
}

/**
 * Dosya açılışında bir avukat ataması için karar (saf).
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.applyManagementDefaultPermissionsInTx() → POST /cases (tx içinde)
 * /// </remarks>
 */
export function decideCaseOpenDefaultPermissions(input: {
  readonly lawyer: { readonly isActive: boolean; readonly defaultPermissions: unknown } | null;
  /**
   * Aynı tenant + aynı avukat için EN SON yönetim kaydı (LAWYER_PRIVILEGE_CHANGED, changedFields ∋ defaultPermissions)
   * ve metadata'sındaki parmak izi (eski kayıtta yok → null); kayıt yoksa null
   */
  readonly managementBasis: { readonly auditLogId: string; readonly fingerprint: string | null } | null;
}): DefaultPermissionOutcome {
  if (!input.lawyer) return { outcome: 'NOT_APPLIED', reason: 'LAWYER_NOT_IN_TENANT' };
  if (!input.lawyer.isActive) return { outcome: 'NOT_APPLIED', reason: 'LAWYER_INACTIVE' };
  const permissions = snapshotLawyerDefaultPermissions(input.lawyer.defaultPermissions);
  if (!permissions) return { outcome: 'NOT_APPLIED', reason: 'NO_DEFAULTS' };
  if (!input.managementBasis) return { outcome: 'NOT_APPLIED', reason: 'SOURCE_NOT_MANAGEMENT_VERIFIED' };
  // Kanıt bağı: yönetimin EN SON yazdığı değer ≠ güncel değer (ya da iz yok) → başka yoldan yazılmış/doğrulanamaz
  if (input.managementBasis.fingerprint !== defaultPermissionsFingerprint(input.lawyer.defaultPermissions)) {
    return { outcome: 'NOT_APPLIED', reason: 'SOURCE_VALUE_MISMATCH' };
  }
  return { outcome: 'APPLIED', permissions, basisAuditLogId: input.managementBasis.auditLogId };
}

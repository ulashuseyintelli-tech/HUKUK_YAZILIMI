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
 *  - Oluşturmadan sonra tek yazıcı güncelleme yolu olduğundan, böyle bir denetim kaydının VARLIĞI mevcut değerin
 *    yönetimce yazıldığını gösterir. Kayıt yoksa (ör. yalnız oluşturmada doldurulmuş, B11 öncesi denetimsiz değişiklik)
 *    varsayılan UYGULANMAZ.
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
      readonly reason: 'LAWYER_NOT_IN_TENANT' | 'LAWYER_INACTIVE' | 'NO_DEFAULTS' | 'SOURCE_NOT_MANAGEMENT_VERIFIED';
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
  /** Yönetim güncellemesinin denetim kaydı (LAWYER_PRIVILEGE_CHANGED, changedFields ∋ defaultPermissions); yoksa null */
  readonly managementBasisAuditLogId: string | null;
}): DefaultPermissionOutcome {
  if (!input.lawyer) return { outcome: 'NOT_APPLIED', reason: 'LAWYER_NOT_IN_TENANT' };
  if (!input.lawyer.isActive) return { outcome: 'NOT_APPLIED', reason: 'LAWYER_INACTIVE' };
  const permissions = snapshotLawyerDefaultPermissions(input.lawyer.defaultPermissions);
  if (!permissions) return { outcome: 'NOT_APPLIED', reason: 'NO_DEFAULTS' };
  if (!input.managementBasisAuditLogId) return { outcome: 'NOT_APPLIED', reason: 'SOURCE_NOT_MANAGEMENT_VERIFIED' };
  return { outcome: 'APPLIED', permissions, basisAuditLogId: input.managementBasisAuditLogId };
}

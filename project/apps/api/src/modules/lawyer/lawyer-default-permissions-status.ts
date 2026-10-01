import type { Prisma } from '@prisma/client';
import {
  MANAGEMENT_DEFAULT_PERMISSIONS_AUDIT_ACTION,
  decideCaseOpenDefaultPermissions,
  snapshotLawyerDefaultPermissions,
  type CaseLawyerPermissionSnapshot,
} from '../case/case-lawyer-default-permissions';

/**
 * K3-L KP-9 (owner kararı 2026-10-01) — avukatın varsayılan dosya yetkisinin DURUMU (salt okuma).
 *
 * Dosya açılışı varsayılanı yalnız yönetimin en son kaydının izi güncel değerle eşleşirse uygular (K3 kararı A). Yönetim
 * bugüne kadar hangi avukatın varsayılanının uygulanmadığını GÖREMİYORDU: okuma yanıtı `defaultPermissions`'ı taşımıyor,
 * avukat formu kayıtlı değer yerine sabit bir yedeği gösteriyordu. Bu dosya durumu görünür kılar; karar VERMEZ:
 *  - Karar, dosya açılışının kullandığı AYNI saf fonksiyondur (`decideCaseOpenDefaultPermissions`) ve dayanak AYNI
 *    sorguyla okunur (`loadDefaultPermissionManagementBasis`) → gösterilen durum ile açılışta olacak şey ayrışamaz.
 *  - Yazma, denetim kaydı, onay aksiyonu ve yeni yetki YOKTUR. "Bu değerleri onayla" aksiyonu uygulanmadı (kendi kaydını
 *    onaylama kuralı owner kararı bekliyor).
 *  - Kayıtlı değer yalnız bilinen izin anahtarları ve boolean değerlerle döner (sınıflandırma matrisi satır 89: bilinmeyen
 *    iç anahtar fail-closed). Yönetim kaydını YAZAN kişi dönmez (personel referansı ayrı sınıftır); yalnız zamanı döner.
 */

export interface DefaultPermissionManagementBasis {
  readonly auditLogId: string;
  /** Yönetim kaydındaki parmak izi; iz taşımayan eski kayıtta null */
  readonly fingerprint: string | null;
  readonly recordedAt: Date | null;
}

type AuditLogReader = Pick<Prisma.TransactionClient, 'auditLog'>;

/**
 * Avukat başına EN SON yönetim kaydı (`LAWYER_PRIVILEGE_CHANGED`, `changedFields` ∋ `defaultPermissions`). Daha eski
 * kayıt, sonradan yazılmış değeri onaylamaz; ilgisiz alan kaydı dayanak değildir.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - CaseService.applyManagementDefaultPermissionsInTx() → POST /cases (tx içinde)
 * ///  - LawyerService.getDefaultPermissionsStatus() → GET /lawyers/default-permissions/status
 * /// </remarks>
 */
export async function loadDefaultPermissionManagementBasis(
  db: AuditLogReader,
  tenantId: string,
  lawyerIds: readonly string[],
): Promise<Map<string, DefaultPermissionManagementBasis>> {
  const basisByLawyer = new Map<string, DefaultPermissionManagementBasis>();
  if (lawyerIds.length === 0) return basisByLawyer;
  const rows = await db.auditLog.findMany({
    where: {
      tenantId,
      action: MANAGEMENT_DEFAULT_PERMISSIONS_AUDIT_ACTION,
      entityType: 'LAWYER',
      entityId: { in: [...lawyerIds] },
      metadata: { path: ['changedFields'], array_contains: ['defaultPermissions'] },
    },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
    select: { id: true, entityId: true, metadata: true, createdAt: true },
  });
  for (const row of rows) {
    if (!row.entityId || basisByLawyer.has(row.entityId)) continue;
    const fingerprint = (row.metadata as { defaultPermissionsFingerprint?: unknown } | null)?.defaultPermissionsFingerprint;
    basisByLawyer.set(row.entityId, {
      auditLogId: row.id,
      fingerprint: typeof fingerprint === 'string' ? fingerprint : null,
      recordedAt: row.createdAt instanceof Date ? row.createdAt : null,
    });
  }
  return basisByLawyer;
}

export type LawyerDefaultPermissionsNotAppliedReason =
  | 'LAWYER_INACTIVE'
  | 'NO_DEFAULTS'
  | 'SOURCE_NOT_MANAGEMENT_VERIFIED'
  | 'SOURCE_VALUE_MISMATCH';

export interface LawyerDefaultPermissionsStatus {
  readonly lawyerId: string;
  /** Bugün bu avukatla dosya açılırsa varsayılan dosyaya kopyalanır mı (açılış kararının kendisi) */
  readonly appliesAtCaseOpen: boolean;
  readonly reason: LawyerDefaultPermissionsNotAppliedReason | null;
  /** Kayıtlı değer: yalnız bilinen anahtarlar + boolean; yoksa null */
  readonly storedPermissions: CaseLawyerPermissionSnapshot | null;
  /** En son yönetim kaydının zamanı (izi güncel değerle eşleşsin eşleşmesin); kayıt yoksa null */
  readonly managementRecordedAt: string | null;
}

/**
 * Tek avukatın durumu (saf). Sonuç, aynı girdiyle `decideCaseOpenDefaultPermissions`'ın vereceği karardır.
 *
 * /// <remarks>
 * /// Çağrıldığı yerler:
 * ///  - LawyerService.getDefaultPermissionsStatus()
 * /// </remarks>
 */
export function describeLawyerDefaultPermissionsStatus(
  lawyer: { readonly id: string; readonly isActive: boolean; readonly defaultPermissions: unknown },
  basis: DefaultPermissionManagementBasis | null,
): LawyerDefaultPermissionsStatus {
  const decision = decideCaseOpenDefaultPermissions({
    lawyer: { isActive: lawyer.isActive, defaultPermissions: lawyer.defaultPermissions },
    managementBasis: basis ? { auditLogId: basis.auditLogId, fingerprint: basis.fingerprint } : null,
  });
  return {
    lawyerId: lawyer.id,
    appliesAtCaseOpen: decision.outcome === 'APPLIED',
    // LAWYER_NOT_IN_TENANT bu yolda oluşmaz (avukat tenant süzgeciyle okunur); oluşursa neden aynen taşınır
    reason: decision.outcome === 'APPLIED' ? null : (decision.reason as LawyerDefaultPermissionsNotAppliedReason),
    storedPermissions: snapshotLawyerDefaultPermissions(lawyer.defaultPermissions),
    managementRecordedAt: basis?.recordedAt ? basis.recordedAt.toISOString() : null,
  };
}

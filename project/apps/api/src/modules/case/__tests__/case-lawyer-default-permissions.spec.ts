import {
  decideCaseOpenDefaultPermissions,
  snapshotLawyerDefaultPermissions,
} from '../case-lawyer-default-permissions';
import { defaultPermissionsFingerprint } from '../../lawyer/lawyer-default-permissions-fingerprint';

/**
 * K3-A — açılışta yönetim varsayılan yetkisinin anlık kopyası (saf karar). Uçtan uca kanıt:
 * case-open-default-permissions.http.db-gated.integration.spec.ts.
 */
describe('K3-A snapshotLawyerDefaultPermissions', () => {
  it('yalnız bilinen anahtarlar ve boolean değerler kopyalanır; açık false KORUNUR', () => {
    expect(
      snapshotLawyerDefaultPermissions({ canEditFinance: false, canViewFinance: true, canSyncUYAP: 'true', unknown: true }),
    ).toEqual({ canEditFinance: false, canViewFinance: true });
  });

  it.each([null, undefined, 'x', 1, [], {}, { unknown: true }, { canEditFinance: 'yes' }])(
    'geçerli varsayılan yoksa (%p) null → yetki yazılmaz ("tümü açık" varsayımı YOK)',
    (value) => {
      expect(snapshotLawyerDefaultPermissions(value)).toBeNull();
    },
  );

  it('prototip anahtarı kopyalanmaz', () => {
    const polluted = JSON.parse('{"__proto__": {"canEditFinance": true}, "canViewFinance": true}');
    expect(snapshotLawyerDefaultPermissions(polluted)).toEqual({ canViewFinance: true });
  });
});

describe('K3-A decideCaseOpenDefaultPermissions', () => {
  const lawyer = { isActive: true, defaultPermissions: { canEditFinance: true } };
  const matching = { auditLogId: 'audit-1', fingerprint: defaultPermissionsFingerprint({ canEditFinance: true }) };

  it('en son yönetim kaydının izi güncel değerle eşleşir + aktif avukat → APPLIED (dayanak kaydıyla)', () => {
    expect(decideCaseOpenDefaultPermissions({ lawyer, managementBasis: matching })).toEqual({
      outcome: 'APPLIED',
      permissions: { canEditFinance: true },
      basisAuditLogId: 'audit-1',
    });
  });

  it('dayanak yoksa (yalnız oluşturmada doldurulmuş / ilgisiz alan kaydı) → SOURCE_NOT_MANAGEMENT_VERIFIED', () => {
    expect(decideCaseOpenDefaultPermissions({ lawyer, managementBasis: null })).toEqual({
      outcome: 'NOT_APPLIED',
      reason: 'SOURCE_NOT_MANAGEMENT_VERIFIED',
    });
  });

  it('kanıt bağı: yönetimin yazdığı değer ≠ güncel değer (sonradan başka yoldan yazılmış) → SOURCE_VALUE_MISMATCH', () => {
    const managedFalse = { auditLogId: 'audit-1', fingerprint: defaultPermissionsFingerprint({ canEditFinance: false }) };
    expect(decideCaseOpenDefaultPermissions({ lawyer, managementBasis: managedFalse })).toEqual({
      outcome: 'NOT_APPLIED',
      reason: 'SOURCE_VALUE_MISMATCH',
    });
  });

  it('iz taşımayan eski yönetim kaydı doğrulanamaz → SOURCE_VALUE_MISMATCH (yetki kapalı)', () => {
    expect(decideCaseOpenDefaultPermissions({ lawyer, managementBasis: { auditLogId: 'legacy', fingerprint: null } })).toMatchObject({
      outcome: 'NOT_APPLIED',
      reason: 'SOURCE_VALUE_MISMATCH',
    });
  });

  it('parmak izi anahtar sırasından bağımsız; değer farkını ayırır', () => {
    expect(defaultPermissionsFingerprint({ canEditFinance: true, canViewFinance: false })).toBe(
      defaultPermissionsFingerprint({ canViewFinance: false, canEditFinance: true }),
    );
    expect(defaultPermissionsFingerprint({ canEditFinance: true })).not.toBe(
      defaultPermissionsFingerprint({ canEditFinance: true, canViewFinance: true }),
    );
  });

  it('büroda olmayan / pasif / varsayılansız avukat → uygulanmaz', () => {
    expect(decideCaseOpenDefaultPermissions({ lawyer: null, managementBasis: matching })).toMatchObject({
      reason: 'LAWYER_NOT_IN_TENANT',
    });
    expect(
      decideCaseOpenDefaultPermissions({ lawyer: { ...lawyer, isActive: false }, managementBasis: matching }),
    ).toMatchObject({ reason: 'LAWYER_INACTIVE' });
    expect(
      decideCaseOpenDefaultPermissions({ lawyer: { isActive: true, defaultPermissions: null }, managementBasis: matching }),
    ).toMatchObject({ reason: 'NO_DEFAULTS' });
  });
});

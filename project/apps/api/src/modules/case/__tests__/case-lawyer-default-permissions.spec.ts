import {
  decideCaseOpenDefaultPermissions,
  snapshotLawyerDefaultPermissions,
} from '../case-lawyer-default-permissions';

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

  it('yönetim denetim dayanağı + aktif avukat + varsayılan → APPLIED (dayanak kaydıyla)', () => {
    expect(decideCaseOpenDefaultPermissions({ lawyer, managementBasisAuditLogId: 'audit-1' })).toEqual({
      outcome: 'APPLIED',
      permissions: { canEditFinance: true },
      basisAuditLogId: 'audit-1',
    });
  });

  it('dayanak yoksa (yalnız oluşturmada doldurulmuş / denetimsiz) → SOURCE_NOT_MANAGEMENT_VERIFIED', () => {
    expect(decideCaseOpenDefaultPermissions({ lawyer, managementBasisAuditLogId: null })).toEqual({
      outcome: 'NOT_APPLIED',
      reason: 'SOURCE_NOT_MANAGEMENT_VERIFIED',
    });
  });

  it('büroda olmayan / pasif / varsayılansız avukat → uygulanmaz', () => {
    expect(decideCaseOpenDefaultPermissions({ lawyer: null, managementBasisAuditLogId: 'a' })).toMatchObject({
      reason: 'LAWYER_NOT_IN_TENANT',
    });
    expect(
      decideCaseOpenDefaultPermissions({ lawyer: { ...lawyer, isActive: false }, managementBasisAuditLogId: 'a' }),
    ).toMatchObject({ reason: 'LAWYER_INACTIVE' });
    expect(
      decideCaseOpenDefaultPermissions({ lawyer: { isActive: true, defaultPermissions: null }, managementBasisAuditLogId: 'a' }),
    ).toMatchObject({ reason: 'NO_DEFAULTS' });
  });
});

import { RequestMethod } from '@nestjs/common';
import { GUARDS_METADATA, METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import {
  CASE_LAWYER_PERMISSION_KEYS,
  MANAGEMENT_DEFAULT_PERMISSIONS_AUDIT_ACTION,
  decideCaseOpenDefaultPermissions,
} from '../../case/case-lawyer-default-permissions';
import { OfficeF01AuthorizationGuard } from '../../office-approval/office-f01-authorization.guard';
import { LawyerController } from '../lawyer.controller';
import { defaultPermissionsFingerprint } from '../lawyer-default-permissions-fingerprint';
import {
  describeLawyerDefaultPermissionsStatus,
  loadDefaultPermissionManagementBasis,
  type DefaultPermissionManagementBasis,
} from '../lawyer-default-permissions-status';
import { LawyerService } from '../lawyer.service';

/**
 * K3-L KP-9 (owner kararı 2026-10-01) — kanıtsız varsayılan yetkinin DURUMU açıkça gösterilir (salt okuma).
 *
 * Ölçülen: durum, dosya açılışının vereceği kararın KENDİSİDİR (aynı saf fonksiyon + aynı dayanak sorgusu); yazma,
 * denetim kaydı ve onay aksiyonu yoktur; kayıtlı değer yalnız bilinen izin anahtarları + boolean ile döner; yönetim
 * kaydını yazan kişi dönmez.
 */
const GRANT = { canEditCase: true, canViewFinance: true, canEditFinance: true };
const RECORDED_AT = new Date('2026-09-30T09:15:00.000Z');
const basisFor = (value: unknown, over: Partial<DefaultPermissionManagementBasis> = {}): DefaultPermissionManagementBasis => ({
  auditLogId: 'audit-1',
  fingerprint: defaultPermissionsFingerprint(value),
  recordedAt: RECORDED_AT,
  ...over,
});
const lawyer = (over: Partial<{ id: string; isActive: boolean; defaultPermissions: unknown }> = {}) => ({
  id: 'L1',
  isActive: true,
  defaultPermissions: GRANT as unknown,
  ...over,
});

describe('KP-9 describeLawyerDefaultPermissionsStatus', () => {
  it('UYGULANIYOR: en son yönetim kaydının izi güncel değerle eşleşir', () => {
    expect(describeLawyerDefaultPermissionsStatus(lawyer(), basisFor(GRANT))).toEqual({
      lawyerId: 'L1',
      appliesAtCaseOpen: true,
      reason: null,
      storedPermissions: GRANT,
      managementRecordedAt: '2026-09-30T09:15:00.000Z',
    });
  });

  it('YÖNETİM KAYDI YOK (yalnız oluşturmada doldurulmuş): uygulanmaz; kayıtlı değer yine görünür', () => {
    expect(describeLawyerDefaultPermissionsStatus(lawyer(), null)).toEqual({
      lawyerId: 'L1',
      appliesAtCaseOpen: false,
      reason: 'SOURCE_NOT_MANAGEMENT_VERIFIED',
      storedPermissions: GRANT,
      managementRecordedAt: null,
    });
  });

  it('DEĞER YÖNETİM KAYDINDAN FARKLI: uygulanmaz; kaydın zamanı görünür (eşleşmese de)', () => {
    const drifted = { ...GRANT, canChangeStatus: true };
    expect(describeLawyerDefaultPermissionsStatus(lawyer({ defaultPermissions: drifted }), basisFor(GRANT))).toMatchObject({
      appliesAtCaseOpen: false,
      reason: 'SOURCE_VALUE_MISMATCH',
      storedPermissions: drifted,
      managementRecordedAt: '2026-09-30T09:15:00.000Z',
    });
  });

  it('İZ TAŞIMAYAN eski yönetim kaydı doğrulanamaz → uygulanmaz', () => {
    expect(describeLawyerDefaultPermissionsStatus(lawyer(), basisFor(GRANT, { fingerprint: null }))).toMatchObject({
      appliesAtCaseOpen: false,
      reason: 'SOURCE_VALUE_MISMATCH',
    });
  });

  it.each([
    ['null', null],
    ['boş nesne', {}],
    ['yalnız bilinmeyen anahtar', { canSeeFinance: true }],
    ['dizi', [true]],
  ])('KAYITLI VARSAYILAN YOK (%s): uygulanmaz, kayıtlı değer null', (_label, value) => {
    expect(describeLawyerDefaultPermissionsStatus(lawyer({ defaultPermissions: value }), basisFor(value))).toMatchObject({
      appliesAtCaseOpen: false,
      reason: 'NO_DEFAULTS',
      storedPermissions: null,
    });
  });

  it('PASİF avukat: yönetimce kaydedilmiş olsa da uygulanmaz', () => {
    expect(describeLawyerDefaultPermissionsStatus(lawyer({ isActive: false }), basisFor(GRANT))).toMatchObject({
      appliesAtCaseOpen: false,
      reason: 'LAWYER_INACTIVE',
      storedPermissions: GRANT,
    });
  });

  it('kayıtlı değer: yalnız bilinen anahtar + boolean; açık false korunur; bilinmeyen anahtar ve boolean olmayan değer dönmez', () => {
    const stored = { canEditCase: true, canEditFinance: false, canSyncUYAP: 'evet', canSeeEverything: true };
    const status = describeLawyerDefaultPermissionsStatus(lawyer({ defaultPermissions: stored }), null);
    expect(status.storedPermissions).toEqual({ canEditCase: true, canEditFinance: false });
    expect(Object.keys(status.storedPermissions ?? {}).every((key) => (CASE_LAWYER_PERMISSION_KEYS as readonly string[]).includes(key))).toBe(true);
  });

  it('yanıt yönetim kaydını yazan kişiyi ve denetim kaydı kimliğini TAŞIMAZ', () => {
    const status = describeLawyerDefaultPermissionsStatus(lawyer(), basisFor(GRANT));
    expect(Object.keys(status).sort()).toEqual(['appliesAtCaseOpen', 'lawyerId', 'managementRecordedAt', 'reason', 'storedPermissions']);
  });

  it('PARİTE: her girdi bileşiminde durum = dosya açılışı kararı (aynı saf fonksiyon)', () => {
    const values: unknown[] = [null, {}, GRANT, { canEditFinance: false }, { bilinmeyen: true }];
    const bases = (value: unknown): (DefaultPermissionManagementBasis | null)[] => [
      null,
      basisFor(value),
      basisFor(GRANT),
      basisFor(value, { fingerprint: null }),
    ];
    let checked = 0;
    for (const isActive of [true, false]) {
      for (const value of values) {
        for (const basis of bases(value)) {
          const decision = decideCaseOpenDefaultPermissions({
            lawyer: { isActive, defaultPermissions: value },
            managementBasis: basis ? { auditLogId: basis.auditLogId, fingerprint: basis.fingerprint } : null,
          });
          const status = describeLawyerDefaultPermissionsStatus(lawyer({ isActive, defaultPermissions: value }), basis);
          expect({ applies: status.appliesAtCaseOpen, reason: status.reason }).toEqual({
            applies: decision.outcome === 'APPLIED',
            reason: decision.outcome === 'APPLIED' ? null : decision.reason,
          });
          checked += 1;
        }
      }
    }
    expect(checked).toBe(40); // bakıldığının kanıtı: 2 × 5 × 4
  });
});

describe('KP-9 loadDefaultPermissionManagementBasis', () => {
  const row = (over: Record<string, unknown>) => ({
    id: 'a1',
    entityId: 'L1',
    metadata: { changedFields: ['defaultPermissions'], defaultPermissionsFingerprint: 'sha256:aa' },
    createdAt: RECORDED_AT,
    ...over,
  });

  it('avukat yoksa sorgu YAPILMAZ', async () => {
    const db = { auditLog: { findMany: jest.fn() } };
    expect((await loadDefaultPermissionManagementBasis(db as never, 't1', [])).size).toBe(0);
    expect(db.auditLog.findMany).not.toHaveBeenCalled();
  });

  it('sorgu: aynı tenant + yönetim eylemi + avukat kümesi + `defaultPermissions` alanı; en yeni önce', async () => {
    const db = { auditLog: { findMany: jest.fn().mockResolvedValue([]) } };
    await loadDefaultPermissionManagementBasis(db as never, 't1', ['L1', 'L2']);
    expect(db.auditLog.findMany).toHaveBeenCalledTimes(1);
    expect(db.auditLog.findMany.mock.calls[0][0]).toEqual({
      where: {
        tenantId: 't1',
        action: MANAGEMENT_DEFAULT_PERMISSIONS_AUDIT_ACTION,
        entityType: 'LAWYER',
        entityId: { in: ['L1', 'L2'] },
        metadata: { path: ['changedFields'], array_contains: ['defaultPermissions'] },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      select: { id: true, entityId: true, metadata: true, createdAt: true },
    });
  });

  it('avukat başına YALNIZ en son kayıt; iz metin değilse null; entityId yoksa atlanır', async () => {
    const db = {
      auditLog: {
        findMany: jest.fn().mockResolvedValue([
          row({ id: 'newest', metadata: { changedFields: ['defaultPermissions'], defaultPermissionsFingerprint: 'sha256:new' } }),
          row({ id: 'older', metadata: { changedFields: ['defaultPermissions'], defaultPermissionsFingerprint: 'sha256:old' } }),
          row({ id: 'legacy', entityId: 'L2', metadata: { changedFields: ['defaultPermissions'] } }),
          row({ id: 'orphan', entityId: null }),
        ]),
      },
    };
    const basis = await loadDefaultPermissionManagementBasis(db as never, 't1', ['L1', 'L2']);
    expect([...basis.entries()]).toEqual([
      ['L1', { auditLogId: 'newest', fingerprint: 'sha256:new', recordedAt: RECORDED_AT }],
      ['L2', { auditLogId: 'legacy', fingerprint: null, recordedAt: RECORDED_AT }],
    ]);
  });
});

describe('KP-9 LawyerService.getDefaultPermissionsStatus', () => {
  const build = (lawyers: unknown[], auditRows: unknown[]) => {
    const prisma: any = {
      lawyer: { findMany: jest.fn().mockResolvedValue(lawyers), update: jest.fn(), create: jest.fn() },
      auditLog: { findMany: jest.fn().mockResolvedValue(auditRows), create: jest.fn() },
      $transaction: jest.fn(),
    };
    const audit: any = { log: jest.fn(), logInTransaction: jest.fn() };
    return { svc: new LawyerService(prisma, audit, {} as never), prisma, audit };
  };

  it('yalnız kendi tenant\'ının avukatları; durum avukat başına; HİÇBİR yazma ve denetim kaydı yok', async () => {
    const { svc, prisma, audit } = build(
      [
        { id: 'L1', isActive: true, defaultPermissions: GRANT },
        { id: 'L2', isActive: true, defaultPermissions: GRANT },
        { id: 'L3', isActive: true, defaultPermissions: null },
      ],
      [
        {
          id: 'a1',
          entityId: 'L1',
          metadata: { changedFields: ['defaultPermissions'], defaultPermissionsFingerprint: defaultPermissionsFingerprint(GRANT) },
          createdAt: RECORDED_AT,
        },
      ],
    );

    const result = await svc.getDefaultPermissionsStatus('t1');

    expect(prisma.lawyer.findMany.mock.calls[0][0]).toMatchObject({
      where: { tenantId: 't1' },
      select: { id: true, isActive: true, defaultPermissions: true },
    });
    expect(prisma.auditLog.findMany.mock.calls[0][0].where).toMatchObject({ tenantId: 't1', entityId: { in: ['L1', 'L2', 'L3'] } });
    expect(result.map((r) => [r.lawyerId, r.appliesAtCaseOpen, r.reason])).toEqual([
      ['L1', true, null],
      ['L2', false, 'SOURCE_NOT_MANAGEMENT_VERIFIED'],
      ['L3', false, 'NO_DEFAULTS'],
    ]);
    expect(prisma.lawyer.update).not.toHaveBeenCalled();
    expect(prisma.lawyer.create).not.toHaveBeenCalled();
    expect(prisma.auditLog.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(audit.log).not.toHaveBeenCalled();
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });
});

describe('KP-9 rota: GET /lawyers/default-permissions/status', () => {
  const handler = LawyerController.prototype.getDefaultPermissionsStatus;

  it('GET + statik yol + F01 yetki kapısı', () => {
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.GET);
    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('default-permissions/status');
    expect((Reflect.getMetadata(GUARDS_METADATA, handler) ?? []).includes(OfficeF01AuthorizationGuard)).toBe(true);
  });

  it('statik yol `:id` rotasından ÖNCE tanımlı (rota sırası)', () => {
    const names = Object.getOwnPropertyNames(LawyerController.prototype);
    expect(names.indexOf('getDefaultPermissionsStatus')).toBeGreaterThan(-1);
    expect(names.indexOf('getDefaultPermissionsStatus')).toBeLessThan(names.indexOf('findOne'));
  });
});

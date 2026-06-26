/**
 * C0 bypass — portal.service.ts client.update audit testleri.
 *
 * Forensic (TM3 C0-a/C0-b): createPortalUser/disablePortalUser, ClientService DIŞINDA
 * prisma.client.update ile Client kaydını değiştiriyordu (hasPortalAccess/portalUserId) ve
 * AUDIT YOKtu (C0-a yalnız ClientService.create/update/remove'u kapsıyordu).
 *
 * Bu testler doğrular:
 *  - 3 path da (reactivate / new-create / disable) AuditLog yazar
 *  - audit mutation ile AYNI $transaction (tx) üzerinden çağrılır (atomik)
 *  - action / entityType / entityId / tenantId doğru
 *  - actor YALNIZ auth context'ten (req.user.sub); actor yoksa userId undefined (body/payload türetme YOK)
 *  - ham e-posta / şifre / PII audit payload'una SIZMAZ (KVKK) — diff yalnız operasyonel bayraklar
 *  - audit yazımı THROW ederse service reject eder (audit fail = transaction rollback, C0-a deseni)
 */
import { PortalService } from '../portal.service';

const RAW_EMAIL = 'muvekkil.portal@example.com';
const RAW_PASSWORD = 'CokGizliSifre!9988';

function build(over: any = {}) {
  const currentClient = over.beforeClient ?? { id: 'c1', hasPortalAccess: false, portalUserId: null };
  const tx = {
    client: {
      // Gerçek Prisma update TÜM satırı döndürür → mock da before ile birleştirir (sadık diff).
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...currentClient }),
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ ...currentClient, ...a.data, id: a.where.id })),
    },
    clientPortalUser: {
      update: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: a.where.id, ...a.data })),
      create: jest.fn().mockImplementation((a: any) => Promise.resolve({ id: 'NEWPU', ...a.data })),
      updateMany: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', tenantId: 't1', ...currentClient }) },
    clientPortalUser: {
      findFirst: jest.fn().mockResolvedValue(null),
      findUnique: jest.fn().mockResolvedValue(null),
      ...over.clientPortalUser,
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  if (over.client) Object.assign(prisma.client, over.client);
  const audit: any = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
  if (over.audit) Object.assign(audit, over.audit);
  const svc = new PortalService(prisma as any, {} as any, audit as any);
  return { svc, prisma, tx, audit };
}

const auditInput = (audit: any) => audit.logInTransaction.mock.calls[0][1];
const auditTxArg = (audit: any) => audit.logInTransaction.mock.calls[0][0];
const auditJson = (audit: any) => JSON.stringify(audit.logInTransaction.mock.calls[0][1]);

describe('C0 bypass — createPortalUser audit', () => {
  it('yeni create → CLIENT_PORTAL_ACCESS_ENABLE audit; actor=auth; AYNI tx', async () => {
    const { svc, tx, audit } = build();
    await svc.createPortalUser('c1', RAW_EMAIL, RAW_PASSWORD, 't1', { userId: 'u-admin' });

    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    expect(auditTxArg(audit)).toBe(tx); // mutation ile atomik aynı transaction
    const input = auditInput(audit);
    expect(input.action).toBe('CLIENT_PORTAL_ACCESS_ENABLE');
    expect(input.entityType).toBe('CLIENT');
    expect(input.entityId).toBe('c1');
    expect(input.tenantId).toBe('t1');
    expect(input.userId).toBe('u-admin');
    expect(input.metadata.portalAction).toBe('CREATE');
    const hpa = input.metadata.fieldDiff.find((e: any) => e.field === 'hasPortalAccess');
    expect(hpa.new).toBe(true);
  });

  it('reactivate → CLIENT_PORTAL_ACCESS_ENABLE audit; portalAction=REACTIVATE; portalUserId mevcut id', async () => {
    const { svc, audit } = build({
      clientPortalUser: { findUnique: jest.fn().mockResolvedValue({ id: 'PU1', isActive: false, email: 'old@x.com' }) },
    });
    await svc.createPortalUser('c1', RAW_EMAIL, RAW_PASSWORD, 't1', { userId: 'u-admin' });

    const input = auditInput(audit);
    expect(input.action).toBe('CLIENT_PORTAL_ACCESS_ENABLE');
    expect(input.metadata.portalAction).toBe('REACTIVATE');
    expect(input.metadata.portalUserId).toBe('PU1');
    expect(input.userId).toBe('u-admin');
  });

  it('actor YALNIZ auth context — actor verilmezse userId undefined (clientId/email türetilmez)', async () => {
    const { svc, audit } = build();
    await svc.createPortalUser('c1', RAW_EMAIL, RAW_PASSWORD, 't1'); // actor YOK
    const input = auditInput(audit);
    expect(input.userId).toBeUndefined();
    expect(input.userId).not.toBe('c1');
    expect(auditJson(audit)).not.toContain(RAW_EMAIL);
  });

  it('audit payload ham e-posta/şifre İÇERMEZ; diff yalnız operasyonel portal bayrakları (KVKK)', async () => {
    const { svc, audit } = build();
    await svc.createPortalUser('c1', RAW_EMAIL, RAW_PASSWORD, 't1', { userId: 'u-admin' });

    const json = auditJson(audit);
    expect(json).not.toContain(RAW_EMAIL);
    expect(json).not.toContain(RAW_PASSWORD);
    const fields = auditInput(audit).metadata.fieldDiff.map((e: any) => e.field);
    expect(fields.length).toBeGreaterThan(0);
    expect(fields.every((f: string) => f === 'hasPortalAccess' || f === 'portalUserId')).toBe(true);
  });

  it('audit THROW → createPortalUser reject (audit fail = rollback)', async () => {
    const { svc } = build({
      audit: { logInTransaction: jest.fn().mockRejectedValue(new Error('audit down')) },
    });
    await expect(
      svc.createPortalUser('c1', RAW_EMAIL, RAW_PASSWORD, 't1', { userId: 'u-admin' }),
    ).rejects.toThrow('audit down');
  });
});

describe('C0 bypass — disablePortalUser audit', () => {
  function buildDisabled(over: any = {}) {
    return build({
      beforeClient: { id: 'c1', hasPortalAccess: true, portalUserId: 'PU1' },
      ...over,
    });
  }

  it('disable → CLIENT_PORTAL_ACCESS_DISABLE audit; hasPortalAccess true→false; portal user pasif; AYNI tx', async () => {
    const { svc, tx, audit } = buildDisabled();
    await svc.disablePortalUser('c1', 't1', { userId: 'u-admin' });

    expect(auditTxArg(audit)).toBe(tx);
    const input = auditInput(audit);
    expect(input.action).toBe('CLIENT_PORTAL_ACCESS_DISABLE');
    expect(input.entityType).toBe('CLIENT');
    expect(input.entityId).toBe('c1');
    expect(input.userId).toBe('u-admin');
    expect(input.metadata.portalAction).toBe('DISABLE');
    const hpa = input.metadata.fieldDiff.find((e: any) => e.field === 'hasPortalAccess');
    expect(hpa.old).toBe(true);
    expect(hpa.new).toBe(false);
    // portal kullanıcıları da pasifleniyor (aynı tx)
    expect(tx.clientPortalUser.updateMany).toHaveBeenCalledWith({ where: { clientId: 'c1' }, data: { isActive: false } });
  });

  it('audit THROW → disablePortalUser reject (audit fail = rollback)', async () => {
    const { svc } = buildDisabled({
      audit: { logInTransaction: jest.fn().mockRejectedValue(new Error('audit down')) },
    });
    await expect(svc.disablePortalUser('c1', 't1', { userId: 'u-admin' })).rejects.toThrow('audit down');
  });
});

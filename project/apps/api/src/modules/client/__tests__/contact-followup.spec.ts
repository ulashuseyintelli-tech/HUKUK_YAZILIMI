/**
 * PR-1: Operasyonel iletişim eksiği görevi (contact follow-up) testleri.
 * Vekalet tarama/manuel kayıt sonrası telefon/e-posta eksikse → OPERATIONAL_COMPLETENESS
 * görevi (dedupe ile tek aktif), tamamlanınca COMPLETED, WAIVED'da üretilmez.
 */

import {
  ClientService,
  computeMissingContactFields,
  contactTaskDedupeKey,
  CONTACT_TASK_DEDUPE_PREFIX,
} from '../client.service';

describe('computeMissingContactFields', () => {
  it('ikisi de yoksa → [phone, email]', () => {
    expect(computeMissingContactFields({ phone: null, email: null })).toEqual(['phone', 'email']);
  });
  it('telefon var e-posta yok → [email]', () => {
    expect(computeMissingContactFields({ phone: '05321234567', email: null })).toEqual(['email']);
  });
  it('e-posta var telefon yok → [phone]', () => {
    expect(computeMissingContactFields({ phone: '', email: 'a@b.com' })).toEqual(['phone']);
  });
  it('ikisi de varsa → []', () => {
    expect(computeMissingContactFields({ phone: '05321234567', email: 'a@b.com' })).toEqual([]);
  });
  it('sadece boşluk → eksik sayılır', () => {
    expect(computeMissingContactFields({ phone: '   ', email: '  ' })).toEqual(['phone', 'email']);
  });
});

describe('contactTaskDedupeKey', () => {
  it('müvekkil bazlı tek anahtar', () => {
    expect(contactTaskDedupeKey('c1')).toBe('OPCOMP:CONTACT:c1');
    expect(contactTaskDedupeKey('c1').startsWith(CONTACT_TASK_DEDUPE_PREFIX)).toBe(true);
  });
});

describe('ClientService.syncContactFollowUpTask', () => {
  const buildPrisma = (existingTask: any = null) =>
    ({
      task: {
        findUnique: jest.fn().mockResolvedValue(existingTask),
        create: jest.fn().mockResolvedValue({ id: 'new' }),
        update: jest.fn().mockResolvedValue({}),
      },
      client: { update: jest.fn().mockResolvedValue({}) },
    }) as any;

  const sync = (prisma: any, client: any) =>
    (new ClientService(prisma, { logInTransaction: jest.fn() } as any, {} as any) as any).syncContactFollowUpTask('t1', client);

  it('eksik var + görev yok → OPERATIONAL_COMPLETENESS görevi oluşturur + client ACTIVE', async () => {
    const prisma = buildPrisma(null);
    await sync(prisma, { id: 'c1', phone: null, email: null, contactFollowUpStatus: null });

    expect(prisma.task.findUnique).toHaveBeenCalledWith({ where: { dedupeKey: 'OPCOMP:CONTACT:c1' } });
    expect(prisma.task.create).toHaveBeenCalledTimes(1);
    const data = prisma.task.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe('t1');
    expect(data.clientId).toBe('c1');
    expect(data.taskCategory).toBe('OPERATIONAL_COMPLETENESS');
    expect(data.dedupeKey).toBe('OPCOMP:CONTACT:c1');
    expect(data.missingFields).toEqual(['phone', 'email']);
    expect(data.status).toBe('PENDING');
    expect(data.escalationLevel).toBe('STAFF');
    expect(data.nextFollowUpAt).toBeInstanceOf(Date);
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { contactFollowUpStatus: 'ACTIVE' },
    });
  });

  it('WAIVED + açık görev → görevi iptal eder, yeni üretmez', async () => {
    const prisma = buildPrisma({ id: 'tk', status: 'PENDING' });
    await sync(prisma, { id: 'c1', phone: null, email: null, contactFollowUpStatus: 'WAIVED' });

    expect(prisma.task.update).toHaveBeenCalledWith({ where: { id: 'tk' }, data: { status: 'CANCELLED' } });
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('WAIVED + görev yok → hiçbir şey yapmaz', async () => {
    const prisma = buildPrisma(null);
    await sync(prisma, { id: 'c1', phone: null, email: null, contactFollowUpStatus: 'WAIVED' });
    expect(prisma.task.create).not.toHaveBeenCalled();
    expect(prisma.task.update).not.toHaveBeenCalled();
  });

  it('eksik yok + açık görev → COMPLETED + client COMPLETED', async () => {
    const prisma = buildPrisma({ id: 'tk', status: 'PENDING' });
    await sync(prisma, { id: 'c1', phone: '05321234567', email: 'a@b.com', contactFollowUpStatus: 'ACTIVE' });

    expect(prisma.task.update).toHaveBeenCalledWith({
      where: { id: 'tk' },
      // PR-PERF-1: sistem kapanışı AUTO_SYSTEM + completedByUserId null damgalanır.
      data: { status: 'COMPLETED', completedAt: expect.any(Date), resolutionType: 'AUTO_SYSTEM', completedByUserId: null },
    });
    expect(prisma.client.update).toHaveBeenCalledWith({
      where: { id: 'c1' },
      data: { contactFollowUpStatus: 'COMPLETED' },
    });
  });

  it('eksik var + açık PENDING görev → eksik listesi güncellenir, yeniden-açma YOK', async () => {
    const prisma = buildPrisma({ id: 'tk', status: 'PENDING' });
    await sync(prisma, { id: 'c1', phone: '05321234567', email: null, contactFollowUpStatus: 'ACTIVE' });

    expect(prisma.task.create).not.toHaveBeenCalled();
    const upd = prisma.task.update.mock.calls[0][0];
    expect(upd.where).toEqual({ id: 'tk' });
    expect(upd.data.missingFields).toEqual(['email']);
    expect(upd.data.status).toBeUndefined(); // re-arm yok
    expect(prisma.client.update).not.toHaveBeenCalled(); // zaten ACTIVE
  });

  it('eksik var + kapalı (COMPLETED) görev → yeniden açar (PENDING + STAFF re-arm)', async () => {
    const prisma = buildPrisma({ id: 'tk', status: 'COMPLETED' });
    await sync(prisma, { id: 'c1', phone: null, email: null, contactFollowUpStatus: 'ACTIVE' });

    const upd = prisma.task.update.mock.calls[0][0];
    expect(upd.data.status).toBe('PENDING');
    expect(upd.data.escalationLevel).toBe('STAFF');
    expect(upd.data.completedAt).toBeNull();
    // PR-PERF-1: yeniden açılışta eski kapanış izi de temizlenir.
    expect(upd.data.completedByUserId).toBeNull();
    expect(upd.data.resolutionType).toBeNull();
  });
});

describe('ClientService.backfillContactFollowUp', () => {
  // OWN-13 I02-R3: `actor` artık ZORUNLU + elevated (D06). officeApproval.isApproverEligible
  // mock'u `true` döner ki bu SAYAÇ testi gate'e takılmadan orijinal amacını (sayım mantığı)
  // doğrulayabilsin. Gate'in KENDİSİ (VIEWER/USER/non-eligible-ADMIN reddi) ayrı testlerde.
  const buildElevatedActor = () => ({ userId: 'u1', tenantId: 't1', role: 'USER' });

  it.each([
    ['VIEWER', false],
    ['USER', false],
    ['ADMIN', false], // non-eligible ADMIN: D06 — rol tek başına yetmez
  ] as const)('%s (elevatedAuthority=%s ile) reddedilir: hiçbir okuma yapılmaz', async (role, eligible) => {
    const prisma = { client: { findMany: jest.fn() } } as any;
    const audit = { logInTransaction: jest.fn(), log: jest.fn() };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(eligible) };
    const svc = new ClientService(prisma, audit as any, officeApproval as any);

    await expect(
      svc.backfillContactFollowUp('t1', { userId: 'u1', tenantId: 't1', role }),
    ).rejects.toBeTruthy();
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });

  it('yalnız null+eksik üretir; WAIVED/ACTIVE/COMPLETED dokunmaz; tam atlanır; sayaçlar doğru', async () => {
    const clients = [
      { id: 'c1', phone: null, email: null, contactFollowUpStatus: null }, // null+eksik → üret
      { id: 'c2', phone: null, email: null, contactFollowUpStatus: 'WAIVED' }, // skippedWaived
      { id: 'c3', phone: null, email: null, contactFollowUpStatus: 'ACTIVE' }, // alreadyActive
      { id: 'c4', phone: null, email: null, contactFollowUpStatus: 'COMPLETED' }, // dokunma
      { id: 'c5', phone: '05321234567', email: 'a@b.com', contactFollowUpStatus: null }, // tam → atla
    ];
    const prisma = { client: { findMany: jest.fn().mockResolvedValue(clients) } } as any;
    const audit = { logInTransaction: jest.fn(), log: jest.fn().mockResolvedValue(undefined) };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
    const svc = new ClientService(prisma, audit as any, officeApproval as any);
    const syncSpy = jest.spyOn(svc as any, 'syncContactFollowUpTaskSafe').mockResolvedValue(true);

    const res = await svc.backfillContactFollowUp('t1', buildElevatedActor());

    expect(res).toEqual({ scanned: 5, createdOrUpdated: 1, skippedWaived: 1, alreadyActive: 1, failed: 0 });
    expect(syncSpy).toHaveBeenCalledTimes(1);
    expect(syncSpy).toHaveBeenCalledWith('t1', expect.objectContaining({ id: 'c1', contactFollowUpStatus: null }));
    // D08: yalnız GERÇEKTEN başarılı satır audit üretir.
    expect(audit.log).toHaveBeenCalledTimes(1);
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ action: 'CLIENT_CONTACT_FOLLOWUP_BACKFILL', entityId: 'c1', tenantId: 't1' }),
    );
  });

  it('D08 PII yasağı: audit metadata yalnız alan ADI taşır, gerçek telefon DEĞERİ asla yazılmaz', async () => {
    const REAL_PHONE = '05559998877';
    const clients = [{ id: 'c1', phone: REAL_PHONE, email: null, contactFollowUpStatus: null }];
    const prisma = { client: { findMany: jest.fn().mockResolvedValue(clients) } } as any;
    const audit = { logInTransaction: jest.fn(), log: jest.fn().mockResolvedValue(undefined) };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
    const svc = new ClientService(prisma, audit as any, officeApproval as any);
    jest.spyOn(svc as any, 'syncContactFollowUpTaskSafe').mockResolvedValue(true);

    await svc.backfillContactFollowUp('t1', buildElevatedActor());

    const call = audit.log.mock.calls[0][0];
    expect(call.metadata).toEqual({ missingFields: ['email'] });
    expect(JSON.stringify(call)).not.toContain(REAL_PHONE);
  });

  it('sync başarısız olursa (D07/D08): failed sayılır, createdOrUpdated artmaz, audit üretilmez', async () => {
    const clients = [{ id: 'c1', phone: null, email: null, contactFollowUpStatus: null }];
    const prisma = { client: { findMany: jest.fn().mockResolvedValue(clients) } } as any;
    const audit = { logInTransaction: jest.fn(), log: jest.fn().mockResolvedValue(undefined) };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
    const svc = new ClientService(prisma, audit as any, officeApproval as any);
    jest.spyOn(svc as any, 'syncContactFollowUpTaskSafe').mockResolvedValue(false);

    const res = await svc.backfillContactFollowUp('t1', buildElevatedActor());

    expect(res).toEqual({ scanned: 1, createdOrUpdated: 0, skippedWaived: 0, alreadyActive: 0, failed: 1 });
    expect(audit.log).not.toHaveBeenCalled();
  });
});

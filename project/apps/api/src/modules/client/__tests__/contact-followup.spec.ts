// Existing action/lifecycle/response unit fixture explicitly has object access.
// The real intersection and transaction checks are exercised without this mock in client-object-scope-1b.http.db-gated.integration.spec.ts.
jest.mock('../client-object-scope', () => ({
  ...jest.requireActual('../client-object-scope'),
  assertClientObjectScope: jest.fn(async () => undefined),
  clientObjectScope: jest.fn(async () => ({})),
  isClientObjectInScope: jest.fn(async () => true),
}));
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
import { Logger } from '@nestjs/common';

describe('KI-168 ClientService safe logging', () => {
  afterEach(() => jest.restoreAllMocks());

  it('retains best-effort false without logging contact data, display name or raw exception', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const audit = { log: jest.fn(), logInTransaction: jest.fn() };
    const svc = new ClientService({} as any, audit as any, {} as any);
    const raw = 'Private Person private@example.test 05559998877 PRIVATE-PROVIDER-ERROR';
    jest.spyOn(svc as any, 'syncContactFollowUpTask').mockRejectedValueOnce(new Error(raw));
    await expect((svc as any).syncContactFollowUpTaskSafe('tenant-id', { id: 'client-id', phone: '05559998877', email: 'private@example.test' })).resolves.toBe(false);
    expect(log).toHaveBeenCalledWith('CONTACT_FOLLOWUP_SYNC_FAILED tenantId=tenant-id clientId=client-id');
    for (const forbidden of ['Private Person', 'private@example.test', '05559998877', 'PRIVATE-PROVIDER-ERROR']) expect(JSON.stringify(log.mock.calls)).not.toContain(forbidden);
    expect(audit.log).not.toHaveBeenCalled(); expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('retains successful follow-up without an error log', async () => {
    const log = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const svc = new ClientService({} as any, {} as any, {} as any);
    jest.spyOn(svc as any, 'syncContactFollowUpTask').mockResolvedValueOnce(undefined);
    await expect((svc as any).syncContactFollowUpTaskSafe('tenant-id', { id: 'client-id' })).resolves.toBe(true);
    expect(log).not.toHaveBeenCalled();
  });

  it('logs only the list count and tenant identifier, returning the original rows unchanged', async () => {
    const log = jest.spyOn(Logger.prototype, 'debug').mockImplementation(() => undefined);
    const rows = [{ id: 'client-id', displayName: 'Private Person', email: 'private@example.test', phone: '05559998877' }];
    const svc = new ClientService({ client: { findMany: jest.fn().mockResolvedValue(rows) } } as any, {} as any, {} as any);
    await expect(svc.findAll('tenant-id')).resolves.toBe(rows);
    expect(log).toHaveBeenCalledWith('CLIENT_LIST count=1 tenantId=tenant-id');
    expect(JSON.stringify(log.mock.calls)).not.toContain('Private Person');
    expect(JSON.stringify(log.mock.calls)).not.toContain('private@example.test');
    expect(JSON.stringify(log.mock.calls)).not.toContain('05559998877');
  });
});

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
      // F03-A2: yeniden doğuşta görev güncellemesi + geçmiş satırları tek (toplu) işlemde yazılır.
      taskHistoryEvent: { createMany: jest.fn().mockResolvedValue({ count: 0 }) },
      $transaction: jest.fn(async (operations: unknown[]) => Promise.all(operations)),
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
      data: { contactFollowUpStatus: 'ACTIVE', version: { increment: 1 } },
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
      data: { contactFollowUpStatus: 'COMPLETED', version: { increment: 1 } },
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

  // ── F03-A2 (OFP-03a): yeniden doğuş görev geçmişine yazılır; yeniden açma davranışı değişmez ────────────────
  it.each(['COMPLETED', 'CANCELLED'])('F03-A2: kapalı (%s) görevin yeniden doğuşu aynı işlemde geçmişe yazılır (sistem üreticisi, önceki atıf saklı)', async (closed) => {
    const completedAt = new Date('2026-11-20T08:30:00.000Z');
    const prisma = buildPrisma({
      id: 'tk', tenantId: 't1', status: closed, priority: 'MEDIUM', assigneeId: null, dueDate: null, caseId: null,
      completedAt, completedByUserId: 'u-closer', resolutionType: 'MANUAL',
    });
    await sync(prisma, { id: 'c1', phone: null, email: null, contactFollowUpStatus: 'ACTIVE' });

    // güncelleme ve geçmiş TEK işlemde: iki işlem birlikte verilir
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction.mock.calls[0][0]).toHaveLength(2);
    expect(prisma.task.update).toHaveBeenCalledTimes(1);
    expect(prisma.task.update.mock.calls[0][0].data).toMatchObject({ status: 'PENDING', completedAt: null, completedByUserId: null, resolutionType: null, escalationLevel: 'STAFF' });

    const rows = prisma.taskHistoryEvent.createMany.mock.calls[0][0].data;
    expect(rows.map((r: any) => r.eventType)).toEqual(['REOPENED', 'DUE_DATE_CHANGED']);
    expect(new Set(rows.map((r: any) => r.correlationId)).size).toBe(1);
    for (const r of rows) {
      expect(r).toMatchObject({ tenantId: 't1', taskId: 'tk', actorType: 'SYSTEM', actorUserId: null, actorRole: null, authoritySource: 'SYSTEM_PRODUCER' });
      expect(r.details).toMatchObject({ producer: 'CLIENT_CONTACT_FOLLOWUP' });
    }
    expect(rows[0]).toMatchObject({ fromValue: closed, toValue: 'PENDING' });
    expect(rows[0].details).toMatchObject({ previousCompletedAt: completedAt.toISOString(), previousCompletedByUserId: 'u-closer', previousResolutionType: 'MANUAL' });
  });

  it('F03-A2: açık görevde eksik listesi güncellemesi geçmiş satırı ÜRETMEZ ve işlem açmaz (yeniden doğuş değil)', async () => {
    const prisma = buildPrisma({ id: 'tk', tenantId: 't1', status: 'PENDING' });
    await sync(prisma, { id: 'c1', phone: '05321234567', email: null, contactFollowUpStatus: 'ACTIVE' });
    expect(prisma.task.update).toHaveBeenCalledTimes(1);
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(prisma.taskHistoryEvent.createMany).not.toHaveBeenCalled();
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

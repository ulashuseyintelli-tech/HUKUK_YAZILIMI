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
    (new ClientService(prisma) as any).syncContactFollowUpTask('t1', client);

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
      data: { status: 'COMPLETED', completedAt: expect.any(Date) },
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
  });
});

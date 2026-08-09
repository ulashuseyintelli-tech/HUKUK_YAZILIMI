/**
 * C1-B05-A G4 — GERÇEK PostgreSQL advisory-lock concurrency kanıtı.
 * TEST_DATABASE_URL yoksa suite ATLANIR (describeDb); canlı hukuk_db'de ASLA koşmaz.
 * İki eşzamanlı claim → tam 1 ACQUIRED; reclaim yalnız FAILED→PENDING; yeni satır açılmaz.
 */
import { PrismaClient } from '@prisma/client';
import { describeDb } from '../../../../test/describe-db';
import { ClientNotificationService } from '../client-notification.service';

describeDb('C1-B05-A G4 advisory-lock concurrency (gerçek PostgreSQL)', () => {
  const prisma = new PrismaClient();
  // claim/reclaim YALNIZ prisma kullanır; officeService gerekmez.
  const svc = new ClientNotificationService(prisma as any, {} as any);
  const tenantId = 'g4-conc-' + Math.random().toString(36).slice(2, 10);
  let clientId = '';
  const dedupeKey = 'EXPENSE_REQUEST:ExpenseRequest:g4-conc:1';
  const dto = () => ({ clientId, type: 'MASRAF_ISTEK', subject: 'S', body: 'B', dedupeKey }) as any;

  beforeAll(async () => {
    await prisma.tenant.create({ data: { id: tenantId, name: 'G4 Conc', slug: tenantId } });
    const client = await prisma.client.create({ data: { tenantId, displayName: 'G4 Client', type: 'INDIVIDUAL' } });
    clientId = client.id;
  });
  afterAll(async () => {
    await prisma.clientNotification.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.client.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.delete({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });
  beforeEach(async () => {
    await prisma.clientNotification.deleteMany({ where: { tenantId } });
  });

  it('iki concurrent claim → tam 1 ACQUIRED, 1 EXISTING_PENDING; TEK satır', async () => {
    const [a, b] = await Promise.all([
      svc.claimNotificationSlot(tenantId, 'u', dto()),
      svc.claimNotificationSlot(tenantId, 'u', dto()),
    ]);
    expect([a.kind, b.kind].sort()).toEqual(['ACQUIRED', 'EXISTING_PENDING']);
    expect(await prisma.clientNotification.count({ where: { tenantId, dedupeKey } })).toBe(1);
  });

  it('mevcut PENDING → EXISTING_PENDING; SENT → EXISTING_SENT (yeni satır yok)', async () => {
    const first = await svc.claimNotificationSlot(tenantId, 'u', dto());
    expect(first.kind).toBe('ACQUIRED');
    expect((await svc.claimNotificationSlot(tenantId, 'u', dto())).kind).toBe('EXISTING_PENDING');
    await prisma.clientNotification.update({ where: { id: (first as any).notificationId }, data: { status: 'SENT' } });
    expect((await svc.claimNotificationSlot(tenantId, 'u', dto())).kind).toBe('EXISTING_SENT');
    expect(await prisma.clientNotification.count({ where: { tenantId, dedupeKey } })).toBe(1);
  });

  it('reclaim: FAILED→PENDING atomik RECLAIMED (aynı satır); PENDING/NO_RECORD → reject', async () => {
    expect((await svc.reclaimFailedNotificationSlot(tenantId, 'u', dto())).kind).toBe('NO_RECORD');
    const created = await prisma.clientNotification.create({
      data: { tenantId, clientId, channel: 'EMAIL', type: 'MASRAF_ISTEK', body: 'x', status: 'FAILED', sentById: 'u', dedupeKey },
    });
    const r1 = await svc.reclaimFailedNotificationSlot(tenantId, 'u', dto());
    expect(r1.kind).toBe('RECLAIMED');
    expect((r1 as any).notificationId).toBe(created.id);
    expect((await prisma.clientNotification.findUnique({ where: { id: created.id }, select: { status: true } }))?.status).toBe('PENDING');
    expect((await svc.reclaimFailedNotificationSlot(tenantId, 'u', dto())).kind).toBe('EXISTING_PENDING');
    expect(await prisma.clientNotification.count({ where: { tenantId, dedupeKey } })).toBe(1);
  });

  it('iki concurrent reclaim (FAILED üzerinde) → tam 1 RECLAIMED gönderebilir', async () => {
    await prisma.clientNotification.create({
      data: { tenantId, clientId, channel: 'EMAIL', type: 'MASRAF_ISTEK', body: 'x', status: 'FAILED', sentById: 'u', dedupeKey },
    });
    const [a, b] = await Promise.all([
      svc.reclaimFailedNotificationSlot(tenantId, 'u', dto()),
      svc.reclaimFailedNotificationSlot(tenantId, 'u', dto()),
    ]);
    const reclaimed = [a.kind, b.kind].filter((k) => k === 'RECLAIMED');
    expect(reclaimed).toHaveLength(1); // yalnız biri gönderebilir; diğeri EXISTING_PENDING
    expect(await prisma.clientNotification.count({ where: { tenantId, dedupeKey } })).toBe(1);
  });
});

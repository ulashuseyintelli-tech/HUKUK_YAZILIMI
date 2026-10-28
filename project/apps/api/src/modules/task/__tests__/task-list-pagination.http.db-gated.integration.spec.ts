/**
 * F01-A (OFP-01) — GET /tasks sayfalama, sunucu toplamları ve süzgeçler: gerçek HTTP + tek kullanımlık PostgreSQL.
 *
 * Doğrular:
 * (1) limit=10 ile bütün sayfaların birleşimi tenant'ın TÜM görevleri; tekil; meta.total ile eşit; her sayfa aynı
 *     summary'yi taşır ve summary DB sayımıyla eşittir (ilk 20 dışındaki görevler toplamı etkiler).
 * (2) Parametresiz çağrı (varsayılan 20) yalnız ilk sayfayı verir ama meta.total tamamını söyler.
 * (3) assigneeId süzgeci yalnız o kişinin görevlerini ve aynı kapsamdaki summary'yi döner; yabancı tenant'ın aynı
 *     assigneeId'li kaydı görünmez; pasif kullanıcıya geçmişte atanmış görevler süzgeçle bulunur.
 * (4) status + taskCategory süzgeci data/total'ı daraltır, summary'yi DEĞİŞTİRMEZ; iptal görevler listelenebilir.
 * (5) Geçersiz / bilinmeyen parametre 400; üst sınır (100) kabul.
 * (6) Yabancı tenant aktörü yalnız kendi görevlerini ve kendi sayaçlarını görür.
 * (7) Aynı sorgu iki kez aynı sırayı verir (deterministik sıralama; eşit öncelik/tarih çokça var).
 *
 * Desen: group-task-tenant-boundary spec (TestIdentityGuard; token değil controller→tenant→servis→DB sınırı).
 * İstekler sıralıdır (eşzamanlı supertest + dinlemeyen sunucu Linux'ta ECONNRESET verir).
 */

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { TaskController } from '../task.controller';
import { TaskService } from '../task.service';

const databaseUrl = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !databaseUrl) throw new Error('Task list pagination requires TEST_DATABASE_URL in CI.');
const describeDb = databaseUrl ? describe : describe.skip;

class TestIdentityGuard implements CanActivate {
  constructor(private readonly db: PrismaClient) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest();
    const user = await this.db.user.findFirst({ where: { id: String(req.headers['x-test-user-id']), isActive: true } });
    if (!user) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

const STATUSES = ['PENDING', 'IN_PROGRESS', 'COMPLETED', 'CANCELLED'] as const;
const PRIORITIES = ['MEDIUM', 'HIGH', 'MEDIUM'] as const;
const TASK_COUNT_A = 27; // > 20 (varsayılan sayfa) ve > 2 × 10 (limit=10 ile 3 sayfa)

type Row = { id: string; status: string; taskCategory: string; assignee?: { id: string } | null };
type Meta = {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
  summary: { pending: number; inProgress: number; operationalOpen: number };
};

describeDb('GET /tasks — F01-A sayfalama, sunucu toplamları, süzgeçler (gerçek HTTP + tek kullanımlık PostgreSQL)', () => {
  jest.setTimeout(60_000);
  const suffix = randomUUID().slice(0, 8);
  const tenantA = 'test-tasklist-a-' + suffix;
  const tenantB = 'test-tasklist-b-' + suffix;
  const tenants = [tenantA, tenantB];
  let db: PrismaClient;
  let app: INestApplication;
  let userA1: string, userA2: string, userA3: string, userB: string, caseA: string;

  const http = (url: string, actor?: string) =>
    request(app.getHttpServer()).get(url).set('x-test-user-id', actor ?? userA1);

  const ids = (rows: Row[]) => rows.map((r) => r.id);

  /** Servisin kapsam tanımıyla aynı sayım: tenant + (caseId null ∨ case.tenantId) (+ assigneeId). */
  const dbSummary = async (tenantId: string, assigneeId?: string) => {
    const scope = { tenantId, OR: [{ caseId: null }, { case: { tenantId } }], ...(assigneeId ? { assigneeId } : {}) };
    return {
      pending: await db.task.count({ where: { ...scope, status: 'PENDING' } }),
      inProgress: await db.task.count({ where: { ...scope, status: 'IN_PROGRESS' } }),
      operationalOpen: await db.task.count({
        where: { ...scope, taskCategory: 'OPERATIONAL_COMPLETENESS', status: { in: ['PENDING', 'IN_PROGRESS'] } },
      }),
    };
  };

  beforeAll(async () => {
    db = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
    await db.$connect();
    const module = await Test.createTestingModule({
      controllers: [TaskController],
      providers: [TaskService, { provide: PrismaService, useValue: db }],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(new TestIdentityGuard(db))
      .compile();
    app = module.createNestApplication();
    // main.ts ile aynı global pipe: whitelist + forbidNonWhitelisted + transform (DTO sözleşmesi bununla ölçülür).
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();

    await db.tenant.createMany({ data: tenants.map((id) => ({ id, name: id, slug: id })) });
    userA1 = (
      await db.user.create({
        data: { tenantId: tenantA, email: suffix + '-a1@example.test', name: 'A1', surname: 'Test', role: 'USER' },
      })
    ).id;
    userA2 = (
      await db.user.create({
        data: { tenantId: tenantA, email: suffix + '-a2@example.test', name: 'A2', surname: 'Test', role: 'USER' },
      })
    ).id;
    // Pasif kullanıcı: geçmişte atanmış görevleri listede/süzgeçte görünür kalmalı (J1 yalnız YENİ atamayı reddeder).
    userA3 = (
      await db.user.create({
        data: {
          tenantId: tenantA,
          email: suffix + '-a3@example.test',
          name: 'A3',
          surname: 'Pasif',
          role: 'USER',
          isActive: false,
        },
      })
    ).id;
    userB = (
      await db.user.create({
        data: { tenantId: tenantB, email: suffix + '-b@example.test', name: 'B', surname: 'Test', role: 'USER' },
      })
    ).id;
    caseA = (await db.case.create({ data: { tenantId: tenantA, fileNumber: 'A-' + suffix, type: 'GENERAL_EXECUTION' } })).id;

    const assignees = [userA1, userA2, null, userA3, userA1];
    const sameDue = new Date('2026-11-15T00:00:00.000Z');
    await db.task.createMany({
      data: Array.from({ length: TASK_COUNT_A }, (_, i) => ({
        tenantId: tenantA,
        title: 'A görev ' + i,
        status: STATUSES[i % 4],
        priority: PRIORITIES[i % 3],
        taskCategory: i % 3 === 0 ? 'OPERATIONAL_COMPLETENESS' : 'LEGAL_WORKFLOW',
        assigneeId: assignees[i % 5],
        dueDate: i % 2 === 0 ? null : sameDue, // çok sayıda eşit öncelik + eşit/boş tarih → sıralama bağı
        caseId: i === 5 ? caseA : null,
        createdById: userA1,
      })),
    });
    await db.task.createMany({
      data: [
        { tenantId: tenantB, title: 'B görev 0', status: 'PENDING', assigneeId: userB, createdById: userB },
        // Anomali: yabancı tenant kaydında A1'in kimliği (yazma kapısı bunu engeller; süzgeç yine de sızdırmamalı).
        {
          tenantId: tenantB,
          title: 'B görev 1',
          status: 'PENDING',
          taskCategory: 'OPERATIONAL_COMPLETENESS',
          assigneeId: userA1,
          createdById: userB,
        },
        { tenantId: tenantB, title: 'B görev 2', status: 'IN_PROGRESS', createdById: userB },
      ],
    });
  });

  afterAll(async () => {
    if (db) {
      await db.task.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.case.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.user.deleteMany({ where: { tenantId: { in: tenants } } });
      await db.tenant.deleteMany({ where: { id: { in: tenants } } });
    }
    await app?.close();
    await db?.$disconnect();
  });

  it("(1) limit=10: sayfaların birleşimi tenant'ın tüm görevleri, tekil, meta.total ile eşit; summary DB ile eşit", async () => {
    const expectedIds = ids(await db.task.findMany({ where: { tenantId: tenantA }, select: { id: true } }));
    const expectedSummary = await dbSummary(tenantA);
    expect(expectedIds).toHaveLength(TASK_COUNT_A);

    const first = await http('/tasks?limit=10&page=1').expect(200);
    const meta: Meta = first.body.meta;
    expect(meta).toMatchObject({ total: TASK_COUNT_A, page: 1, limit: 10, totalPages: 3 });
    expect(meta.summary).toEqual(expectedSummary);
    expect(first.body.data).toHaveLength(10);

    const collected: string[] = ids(first.body.data);
    for (let page = 2; page <= meta.totalPages; page += 1) {
      const res = await http('/tasks?limit=10&page=' + page).expect(200);
      expect(res.body.meta.summary).toEqual(expectedSummary); // her sayfa aynı sunucu toplamını taşır
      expect(res.body.meta.total).toBe(TASK_COUNT_A);
      collected.push(...ids(res.body.data));
    }
    expect(new Set(collected).size).toBe(collected.length); // tekil
    expect(new Set(collected)).toEqual(new Set(expectedIds)); // tam

    const beyond = await http('/tasks?limit=10&page=4').expect(200);
    expect(beyond.body.data).toEqual([]);
    expect(beyond.body.meta.total).toBe(TASK_COUNT_A);
  });

  it('(2) parametresiz çağrı: varsayılan 20 kayıt; meta.total ve summary ilk 20 dışını da sayar', async () => {
    const res = await http('/tasks').expect(200);
    expect(res.body.data).toHaveLength(20);
    expect(res.body.meta).toMatchObject({ total: TASK_COUNT_A, page: 1, limit: 20, totalPages: 2 });
    expect(res.body.meta.summary).toEqual(await dbSummary(tenantA));
    const pendingInPage = (res.body.data as Row[]).filter((r) => r.status === 'PENDING').length;
    expect(res.body.meta.summary.pending).toBeGreaterThanOrEqual(pendingInPage);
  });

  it("(3) assigneeId süzgeci: yalnız o kişi; summary aynı kapsam; yabancı tenant'ın aynı assigneeId'li kaydı yok", async () => {
    const expected = await db.task.findMany({ where: { tenantId: tenantA, assigneeId: userA1 }, select: { id: true } });
    const res = await http('/tasks?assigneeId=' + userA1 + '&limit=100').expect(200);
    const rows: Row[] = res.body.data;
    expect(rows.length).toBe(expected.length);
    expect(rows.every((r) => r.assignee?.id === userA1)).toBe(true);
    expect(new Set(ids(rows))).toEqual(new Set(ids(expected)));
    expect(res.body.meta.total).toBe(expected.length);
    expect(res.body.meta.summary).toEqual(await dbSummary(tenantA, userA1));
    const foreign = await db.task.findFirst({ where: { tenantId: tenantB, assigneeId: userA1 }, select: { id: true } });
    expect(foreign).not.toBeNull();
    expect(ids(rows)).not.toContain(foreign!.id);

    // Pasif kullanıcıya geçmişte atanmış görevler süzgeçle hâlâ bulunur (liste bütünlüğü).
    const passive = await http('/tasks?assigneeId=' + userA3 + '&limit=100').expect(200);
    expect(passive.body.data.length).toBe(await db.task.count({ where: { tenantId: tenantA, assigneeId: userA3 } }));
    expect(passive.body.data.length).toBeGreaterThan(0);
  });

  it("(4) status + taskCategory süzgeci data/total'ı daraltır, summary'yi değiştirmez; iptal görevler listelenir", async () => {
    const whole = await http('/tasks?limit=100').expect(200);
    const res = await http('/tasks?status=PENDING&taskCategory=OPERATIONAL_COMPLETENESS&limit=100').expect(200);
    const rows: Row[] = res.body.data;
    const expected = await db.task.count({
      where: { tenantId: tenantA, status: 'PENDING', taskCategory: 'OPERATIONAL_COMPLETENESS' },
    });
    expect(expected).toBeGreaterThan(0);
    expect(rows).toHaveLength(expected);
    expect(rows.every((r) => r.status === 'PENDING' && r.taskCategory === 'OPERATIONAL_COMPLETENESS')).toBe(true);
    expect(res.body.meta.total).toBe(expected);
    expect(res.body.meta.summary).toEqual(whole.body.meta.summary);

    const cancelled = await http('/tasks?status=CANCELLED&limit=100').expect(200);
    expect(cancelled.body.data.length).toBe(await db.task.count({ where: { tenantId: tenantA, status: 'CANCELLED' } }));
    expect(cancelled.body.data.length).toBeGreaterThan(0); // iptal görevler listeden kaybolmaz
  });

  it.each([
    'status=REVIEW', // API'nin desteklemediği durum (ekran bunu artık sunmaz)
    'status=',
    'limit=0',
    'limit=101',
    'limit=abc',
    'page=0',
    'page=abc',
    'taskCategory=OTHER',
    'foo=bar', // bilinmeyen parametre (forbidNonWhitelisted)
  ])('(5) geçersiz sorgu %s → 400 (veri sızmaz)', async (query) => {
    const res = await http('/tasks?' + query).expect(400);
    expect(res.body.data).toBeUndefined();
  });

  it('(5b) üst sınır limit=100 kabul edilir ve tamamı tek sayfada gelir', async () => {
    const res = await http('/tasks?limit=100').expect(200);
    expect(res.body.data).toHaveLength(TASK_COUNT_A);
    expect(res.body.meta).toMatchObject({ limit: 100, totalPages: 1 });
  });

  it('(6) yabancı tenant aktörü yalnız kendi görevlerini ve kendi sayaçlarını görür', async () => {
    const res = await http('/tasks?limit=100', userB).expect(200);
    const rows: Row[] = res.body.data;
    expect(rows).toHaveLength(3);
    expect(res.body.meta.total).toBe(3);
    expect(res.body.meta.summary).toEqual(await dbSummary(tenantB));
    const aIds = new Set(ids(await db.task.findMany({ where: { tenantId: tenantA }, select: { id: true } })));
    expect(ids(rows).some((id) => aIds.has(id))).toBe(false);
  });

  it('(7) aynı sorgu iki kez aynı sırayı verir (id ile kesinleştirilmiş sıralama)', async () => {
    const a = await http('/tasks?limit=100').expect(200);
    const b = await http('/tasks?limit=100').expect(200);
    expect(ids(a.body.data)).toEqual(ids(b.body.data));
  });
});

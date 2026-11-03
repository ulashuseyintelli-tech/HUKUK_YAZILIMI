// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: expense-stage-independent-actions.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { LawyerRank, PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AutomationModule } from '../../automation/automation.module';
import { CaseModule } from '../../case/case.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { StageTriggerModule } from '../../stage-trigger/stage-trigger.module';
import { SYSTEM_EXPENSE_REQUESTER } from '../expense-request.service';

/**
 * O-7 — Masraf DAĞITIM kararı (POST /expense-requests/:id/{approve,reject}): öz-onay, onaycı yeterliliği ve eşzamanlılık.
 * GERÇEK HTTP + disposable PostgreSQL; yarışlar GERÇEK ayrı transaction'larla (sahte değil).
 *
 * Kurallar (mevcut, yeni rol / yetki modeli YOK):
 *  - karar veren = genel onaycı (aktif + aynı tenant + bağlı avukat + PARTNER ya da canApproveOfficeActions; personel asla);
 *  - talep eden ≠ karar veren, KİŞİ düzeyinde (aynı kişinin iki hesabı da reddedilir; OD-11 B);
 *  - sunucunun ürettiği (`createdById = 'system'`) talepte kişi düzeyi karşılaştırma yok, yeterlilik şart (owner D1-A);
 *  - iptal edilmiş talebe karar yok; yalnız PENDING_APPROVAL'dan karar; aynı kararın tekrarı yazmaz, ters karar reddedilir;
 *  - ret gerekçesi zorunlu; koşullu güncelleme + denetim atomik; yarışı kaybeden ikinci denetim / yazım üretmez.
 *
 * Bu test düzeltmesiz kodla düşer: öz-onay ve yetkisiz aktör 201 alır, yarışlarda iki denetim satırı oluşur.
 * Sentetik TCKN'ler gerçek kişi değildir (f02a-self-approval-identity-two-accounts emsali); test hesapları işlevsel
 * sınamadır, bağımsız gerçek kişi kanıtı DEĞİLDİR.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('EXPENSE-DISTRIBUTION-DECISION DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

/** Sentetik, geçerli sağlama haneli TCKN'ler (gerçek kişi değil). P1 = aynı kişinin iki hesabı. */
const TCKN_P1 = '10000000146';
const TCKN_P2 = '20000000046';
const TCKN_P3 = '30000000014';

/** JwtStrategy → validateUser sözleşmesi: req.user DB'den okunan tam User satırı; pasif kullanıcı reddedilir. */
class DbUserIdentityGuard implements CanActivate {
  constructor(private readonly db: () => PrismaClient) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest();
    const user = await this.db().user.findUnique({
      where: { id: String(req.headers['x-test-user-id']) },
      include: { tenant: true },
    });
    if (!user || !user.isActive) throw new UnauthorizedException();
    req.user = user;
    return true;
  }
}

describeWithDisposableDb('O-7 masraf dağıtım kararı — öz-onay, yeterlilik, yarış (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(300_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let tenantId: string;
  let clientId: string;
  let caseId: string;
  const suffix = randomUUID().slice(0, 8);
  const ids: Record<string, string> = {};

  const account = async (
    key: string,
    role: 'ADMIN' | 'USER' | 'VIEWER',
    card?: { lawyer: { rank: LawyerRank; tckn?: string; delegate?: boolean } } | { staff: true },
  ) => {
    const user = await prisma.user.create({
      data: { tenantId, email: `o7-${key.toLowerCase()}-${suffix}@example.test`, name: key, surname: 'O7', role },
    });
    if (card && 'lawyer' in card) {
      await prisma.lawyer.create({
        data: {
          tenantId, userId: user.id, name: key, surname: 'O7', lawyerRank: card.lawyer.rank,
          tckn: card.lawyer.tckn ?? null, canApproveOfficeActions: card.lawyer.delegate === true,
        },
      });
    }
    if (card && 'staff' in card) {
      await prisma.staffMember.create({ data: { tenantId, userId: user.id, firstName: key, lastName: 'O7', staffType: 'MUHASEBE' } });
    }
    ids[key] = user.id;
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule, AutomationModule, StageTriggerModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    // Uygulama kendi portunda dinler (supertest sunucuyu sahiplenmez): eşzamanlı istek testlerinde Linux ECONNRESET önlemi.
    await app.listen(0, '127.0.0.1');
    for (const job of app.get(SchedulerRegistry, { strict: false }).getCronJobs().values()) job.stop();

    tenantId = `test-ci-o7-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI O7', slug: tenantId } });
    await account('ADMIN', 'ADMIN'); // kartsız ADMIN — dosyayı açar; onaycı DEĞİL
    await account('TALEP', 'USER', { lawyer: { rank: 'PARTNER', tckn: TCKN_P1 } }); // talep eden ortak (kişi P1)
    await account('TALEP_IKINCI', 'USER', { lawyer: { rank: 'PARTNER', tckn: TCKN_P1 } }); // AYNI kişinin ikinci hesabı
    await account('ORTAK_A', 'USER', { lawyer: { rank: 'PARTNER', tckn: TCKN_P2 } });
    await account('ORTAK_B', 'USER', { lawyer: { rank: 'PARTNER', tckn: TCKN_P3 } });
    await account('DELEGE', 'USER', { lawyer: { rank: 'LAWYER', delegate: true } });
    await account('AVUKAT', 'USER', { lawyer: { rank: 'LAWYER' } });
    await account('YONETICI', 'USER', { lawyer: { rank: 'MANAGER' } });
    await account('PERSONEL', 'USER', { staff: true });
    await account('IZLEYICI', 'VIEWER');
    clientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'O7 müvekkil', displayName: 'O7 müvekkil' } })).id;
    const res = await postAs(ids.ADMIN, '/cases', {
      fileNumber: `CI-O7-${suffix}`,
      type: 'GENERAL_EXECUTION',
      interestType: 'YASAL',
      startDate: '2026-02-01',
      currency: 'TRY',
      creditors: [{ id: clientId, type: 'COMPANY', name: 'O7 müvekkil' }],
      dues: [{ type: 'PRINCIPAL', description: 'Asıl alacak', amount: 100_000, dueDate: '2026-01-15' }],
    });
    expect(res.status).toBe(201);
    caseId = res.body.id as string;
  });

  afterAll(async () => {
    await app?.close();
    await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
    await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    await prisma.$disconnect();
  });

  const http = () => request(app.getHttpServer());
  function postAs(userId: string, path: string, body?: object) {
    const req = http().post(path).set('x-test-user-id', userId);
    return body === undefined ? req : req.send(body);
  }
  const approve = (as: string, id: string) => postAs(ids[as], `/expense-requests/${id}/approve`, {});
  /** `note: null` → gövdede gerekçe alanı YOK (varsayılan parametre `undefined`'da devreye girdiği için ayrı işaret). */
  const reject = (as: string, id: string, note: string | null = 'O7 gerekçe') =>
    postAs(ids[as], `/expense-requests/${id}/reject`, note === null ? {} : { note });

  /** Kontrollü masraf talebi (kurulum: doğrudan veritabanı). Varsayılan talep eden: TALEP (kişi P1). */
  const makeRow = async (data: Record<string, unknown> = {}) =>
    (
      await prisma.expenseRequest.create({
        data: { tenantId, caseId, clientId, createdById: ids.TALEP, totalAmount: 500, currency: 'TRY', stageCode: 'RE_NOTIFICATION', gateType: 'NON_BLOCKING', ...data } as never,
      })
    ).id;

  const snapshot = async (id: string) => {
    const row = await prisma.expenseRequest.findUniqueOrThrow({ where: { id }, include: { auditLogs: { orderBy: { createdAt: 'asc' } } } });
    return {
      status: row.status,
      approval: row.expenseApprovalStatus,
      approvedById: row.approvedById,
      approvedAt: row.approvedAt?.toISOString() ?? null,
      decisions: row.auditLogs.filter((log) => log.action.startsWith('APPROVAL_')).map((log) => ({ action: log.action, userId: log.userId })),
    };
  };
  const pending = { approval: 'PENDING_APPROVAL', approvedById: null, approvedAt: null, decisions: [] };

  describe('öz-onay (kişi düzeyi)', () => {
    it('talep eden kendi talebini onaylayamaz ve reddedemez (400 SELF_APPROVAL_FORBIDDEN); yazım yok', async () => {
      const id = await makeRow();
      for (const res of [await approve('TALEP', id), await reject('TALEP', id)]) {
        expect({ status: res.status, code: res.body?.code }).toEqual({ status: 400, code: 'SELF_APPROVAL_FORBIDDEN' });
      }
      expect(await snapshot(id)).toMatchObject(pending);
    });

    it('aynı kişinin İKİNCİ hesabı (aynı karttaki TCKN) da karar veremez; yazım yok', async () => {
      const id = await makeRow();
      for (const res of [await approve('TALEP_IKINCI', id), await reject('TALEP_IKINCI', id)]) {
        expect({ status: res.status, code: res.body?.code }).toEqual({ status: 400, code: 'SELF_APPROVAL_FORBIDDEN' });
      }
      expect(await snapshot(id)).toMatchObject(pending);
    });

    it('ELLE oluşturulan talep istisnaya giremez: HTTP ile açılan talebin talep edeni oturum sahibidir ve kendi kararı reddedilir', async () => {
      const created = await postAs(ids.TALEP, '/expense-requests', {
        caseId, clientId, items: [{ type: 'BASVURMA_HARCI', description: 'O7 elle talep', amount: 120 }],
      });
      expect(created.status).toBe(201);
      const row = await prisma.expenseRequest.findUniqueOrThrow({ where: { id: created.body.id } });
      expect(row.createdById).toBe(ids.TALEP);
      expect(row.createdById).not.toBe(SYSTEM_EXPENSE_REQUESTER);
      const res = await approve('TALEP', row.id);
      expect({ status: res.status, code: res.body?.code }).toEqual({ status: 400, code: 'SELF_APPROVAL_FORBIDDEN' });
      expect(await snapshot(row.id)).toMatchObject(pending);
    });
  });

  describe('onaycı yeterliliği', () => {
    it.each(['ADMIN', 'AVUKAT', 'YONETICI', 'PERSONEL'])('yetkisiz aktör %s onaylayamaz ve reddedemez (403 EXPENSE_APPROVER_NOT_ELIGIBLE); yazım yok', async (as) => {
      const id = await makeRow();
      for (const res of [await approve(as, id), await reject(as, id)]) {
        expect({ status: res.status, code: res.body?.code }).toEqual({ status: 403, code: 'EXPENSE_APPROVER_NOT_ELIGIBLE' });
      }
      expect(await snapshot(id)).toMatchObject(pending);
    });

    it('VIEWER yazamaz (403 VIEWER_WRITE_DENIED); yazım yok', async () => {
      const id = await makeRow();
      for (const res of [await approve('IZLEYICI', id), await reject('IZLEYICI', id)]) {
        expect({ status: res.status, code: res.body?.code }).toEqual({ status: 403, code: 'VIEWER_WRITE_DENIED' });
      }
      expect(await snapshot(id)).toMatchObject(pending);
    });

    it('yetkili PARTNER onaylar; delege avukat reddeder; tek denetim satırı, karar veren kaydedilir', async () => {
      const a = await makeRow();
      const r = await makeRow();
      expect((await approve('ORTAK_A', a)).status).toBe(201);
      expect((await reject('DELEGE', r, 'Belge eksik')).status).toBe(201);
      expect(await snapshot(a)).toMatchObject({ approval: 'APPROVED', approvedById: ids.ORTAK_A, decisions: [{ action: 'APPROVAL_GRANTED', userId: ids.ORTAK_A }] });
      expect(await snapshot(r)).toMatchObject({ approval: 'REJECTED', approvedById: ids.DELEGE, decisions: [{ action: 'APPROVAL_REJECTED', userId: ids.DELEGE }] });
      const log = await prisma.expenseAuditLog.findFirstOrThrow({ where: { expenseRequestId: r, action: 'APPROVAL_REJECTED' } });
      expect(log.details).toMatchObject({ scope: 'DISTRIBUTION', note: 'Belge eksik' });
    });
  });

  describe('sunucunun ürettiği (system) talep — owner D1-A', () => {
    it('yetkili onaycı karar verebilir (kişi karşılaştırması yok); yetkisiz aktör yine 403', async () => {
      const id = await makeRow({ createdById: SYSTEM_EXPENSE_REQUESTER });
      const denied = await approve('ADMIN', id);
      expect({ status: denied.status, code: denied.body?.code }).toEqual({ status: 403, code: 'EXPENSE_APPROVER_NOT_ELIGIBLE' });
      expect(await snapshot(id)).toMatchObject(pending);
      expect((await approve('TALEP', id)).status).toBe(201);
      expect(await snapshot(id)).toMatchObject({ approval: 'APPROVED', approvedById: ids.TALEP, decisions: [{ action: 'APPROVAL_GRANTED', userId: ids.TALEP }] });
    });
  });

  describe('durum kuralları', () => {
    it('iptal edilmiş talebe karar verilemez (400); yazım yok', async () => {
      const id = await makeRow({ status: 'CANCELLED' });
      for (const res of [await approve('ORTAK_A', id), await reject('ORTAK_A', id)]) {
        expect(res.status).toBe(400);
        expect(String(res.body?.message)).toContain('İptal edilmiş masraf talebi');
      }
      expect(await snapshot(id)).toMatchObject({ status: 'CANCELLED', ...pending });
    });

    it('ret gerekçesi zorunlu (eksik / boşluk → 400); istemcinin eski `reason` alanı kabul edilmez; yazım yok', async () => {
      const id = await makeRow();
      expect((await reject('ORTAK_A', id, null)).status).toBe(400);
      expect((await reject('ORTAK_A', id, '   ')).status).toBe(400);
      expect((await postAs(ids.ORTAK_A, `/expense-requests/${id}/reject`, { reason: 'eski alan' })).status).toBe(400);
      expect(await snapshot(id)).toMatchObject(pending);
    });

    it('aynı kararın tekrarı yeni yazım üretmez; ters karar reddedilir; tekrar istekte aktör kontrolleri ATLANMAZ', async () => {
      const id = await makeRow();
      expect((await approve('ORTAK_A', id)).status).toBe(201);
      const after = await snapshot(id);
      expect((await approve('ORTAK_A', id)).status).toBe(201); // aynı karar: yazım yok
      expect((await approve('ORTAK_B', id)).status).toBe(201); // başka yetkili, aynı karar: yazım yok
      expect(await snapshot(id)).toEqual(after);
      const reverse = await reject('ORTAK_B', id);
      expect({ status: reverse.status, message: String(reverse.body?.message) }).toMatchObject({ status: 400, message: expect.stringContaining('Yalnız PENDING_APPROVAL') });
      const self = await approve('TALEP', id);
      expect({ status: self.status, code: self.body?.code }).toEqual({ status: 400, code: 'SELF_APPROVAL_FORBIDDEN' });
      const ineligible = await approve('PERSONEL', id);
      expect({ status: ineligible.status, code: ineligible.body?.code }).toEqual({ status: 403, code: 'EXPENSE_APPROVER_NOT_ELIGIBLE' });
      expect(await snapshot(id)).toEqual(after);
    });
  });

  describe('eşzamanlılık — GERÇEK ayrı transaction\'lar', () => {
    /**
     * Engel: test kendi transaction'ında satırı FOR UPDATE ile tutar; iki HTTP isteği bu sırada başlar ve İKİSİ de veritabanında
     * kilit bekler (pg_stat_activity ile ölçülür → çakışma gerçek). Engel kalkınca kilidi önce alan kazanır.
     */
    const raceWith = async (id: string, first: () => request.Test, second: () => request.Test) => {
      let release!: () => void;
      const released = new Promise<void>((r) => { release = r; });
      let locked!: () => void;
      const lockedNow = new Promise<void>((r) => { locked = r; });
      const holder = prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "ExpenseRequest" WHERE "id" = ${id} FOR UPDATE`;
        locked();
        await released;
      }, { timeout: 60_000, maxWait: 10_000 });
      await lockedNow;
      const pa = first().then((res) => res);
      const pb = second().then((res) => res);
      let waiting = 0;
      const deadline = Date.now() + 15_000;
      while (Date.now() < deadline) {
        const rows = await prisma.$queryRaw<Array<{ n: number }>>`
          SELECT count(*)::int AS n FROM pg_stat_activity
          WHERE datname = current_database() AND wait_event_type = 'Lock' AND query ILIKE '%"ExpenseRequest"%'`;
        waiting = rows[0]?.n ?? 0;
        if (waiting >= 2) break;
        await new Promise((r) => setTimeout(r, 50));
      }
      release();
      await holder;
      const [ra, rb] = await Promise.all([pa, pb]);
      return { waiting, ra, rb };
    };

    it('çift onay: iki yetkili aynı anda onaylar → tek APPROVED, TEK denetim satırı; kaybeden yazım üretmez', async () => {
      const id = await makeRow();
      const { waiting, ra, rb } = await raceWith(id, () => approve('ORTAK_A', id), () => approve('ORTAK_B', id));
      expect(waiting).toBeGreaterThanOrEqual(2);
      expect([ra.status, rb.status]).toEqual([201, 201]);
      const snap = await snapshot(id);
      expect(snap.approval).toBe('APPROVED');
      expect(snap.decisions).toHaveLength(1);
      expect(snap.decisions[0].action).toBe('APPROVAL_GRANTED');
      expect([ids.ORTAK_A, ids.ORTAK_B]).toContain(snap.approvedById);
      expect(snap.decisions[0].userId).toBe(snap.approvedById);
    });

    it('onay–ret yarışı: tek son durum, kaybeden 400, TEK denetim satırı kazananın kararıyla', async () => {
      const id = await makeRow();
      const { waiting, ra, rb } = await raceWith(id, () => approve('ORTAK_A', id), () => reject('ORTAK_B', id));
      expect(waiting).toBeGreaterThanOrEqual(2);
      expect([ra.status, rb.status].sort()).toEqual([201, 400]);
      const snap = await snapshot(id);
      expect(snap.decisions).toHaveLength(1);
      const winner = ra.status === 201 ? { approval: 'APPROVED', by: ids.ORTAK_A, action: 'APPROVAL_GRANTED' } : { approval: 'REJECTED', by: ids.ORTAK_B, action: 'APPROVAL_REJECTED' };
      expect(snap).toMatchObject({ approval: winner.approval, approvedById: winner.by, decisions: [{ action: winner.action, userId: winner.by }] });
      const loser = ra.status === 201 ? rb : ra;
      expect(String(loser.body?.message)).toContain('Yalnız PENDING_APPROVAL');
    });
  });

  describe('atomiklik', () => {
    it('denetim yazımı başarısız olursa karar GERİ ALINIR (güncelleme aynı transaction içinde yapılmıştı)', async () => {
      const id = await makeRow();
      const service = app.get(PrismaService);
      const original = service.$transaction.bind(service) as (...args: unknown[]) => Promise<unknown>;
      let seenInsideTx: string | null = null;
      const spy = jest.spyOn(service, '$transaction').mockImplementation(((fn: unknown, opts?: unknown) => {
        if (typeof fn !== 'function') return original(fn, opts);
        return original(async (tx: Record<string, unknown>) => {
          const wrapped = new Proxy(tx, {
            get(target, prop) {
              // Yöntemler ASIL işlem istemcisine bağlanır ($queryRaw vb. `this` ister); yalnız denetim yazımı değiştirilir.
              const value = Reflect.get(target, prop, target);
              if (prop !== 'expenseAuditLog') return typeof value === 'function' ? value.bind(target) : value;
              const real = value as { create: (args: { data: { action: string } }) => Promise<unknown> };
              return {
                ...real,
                create: async (args: { data: { action: string } }) => {
                  if (!String(args?.data?.action).startsWith('APPROVAL_')) return real.create(args);
                  const inside = await (target.expenseRequest as { findUniqueOrThrow: (a: unknown) => Promise<{ expenseApprovalStatus: string }> }).findUniqueOrThrow({ where: { id } });
                  seenInsideTx = inside.expenseApprovalStatus;
                  throw new Error('O-7 benzetim: denetim yazımı başarısız');
                },
              };
            },
          });
          return (fn as (t: unknown) => Promise<unknown>)(wrapped);
        }, opts);
      }) as never);
      try {
        const res = await approve('ORTAK_A', id);
        expect(res.status).toBe(500);
      } finally {
        spy.mockRestore();
      }
      expect(seenInsideTx).toBe('APPROVED'); // güncelleme transaction içinde gerçekten yapıldı …
      expect(await snapshot(id)).toMatchObject(pending); // … ve geri alındı: durum, karar veren, denetim değişmedi
      expect((await approve('ORTAK_A', id)).status).toBe(201); // sonraki temiz istek normal çalışır
    });
  });
});

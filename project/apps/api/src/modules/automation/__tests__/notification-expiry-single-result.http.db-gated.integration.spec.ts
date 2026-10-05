// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-due-currency.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { BadRequestException, CanActivate, ExecutionContext, INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { SchedulerRegistry } from '@nestjs/schedule';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseModule } from '../../case/case.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { ExpenseRequestService } from '../../expense-request/expense-request.service';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { AutomationModule } from '../automation.module';
import { claimNotificationEvent, eventIdempotencyKey } from '../event-consumption';
import { WorkflowEngine } from '../workflow-engine.service';

/**
 * Otomasyon — süresi dolan tebligat OLAYI (büro, olay, eylem) başına TEK sonuç. GERÇEK HTTP + disposable PostgreSQL.
 *
 * Ölçülen kusur (main fdc1f23ba): süresi dolmuş aynı ödeme emri tebligatı, dosya her işlendiğinde `NOTIFICATION_EXPIRED` kuralını
 * yeniden tetikliyordu (kural aşamaya da tebligatın tüketilip tüketilmediğine de bakmıyordu). İki işlemede: 2 karar kaydı, 2 aşama
 * değişikliği kaydı, 2 × yeniden tebligat masraf talebi (aşama masraf seti istek anahtarı GÖNDERMİYORDU), otomatik işlem sayacı 2.
 * POST /automation/cases/:id/process, 5 dakikalık döngü ve saatlik tebligat denetimi aynı yolu kullanır.
 *
 * Owner kararı 11 (2026-10-05): aynı büro + aynı tebligat olayı + aynı kural / eylem → TEK sonuç; tebligatı toptan "tüketildi"
 * yapmak YASAK (aynı tebligatın başka kural / eylemleri engellenmez); eşzamanlılıkta ve süreç yeniden başlatmada doğrulanır;
 * işaret ↔ yan etki yarım kalma boşluğu kapanır; migration YOK (işaret NotificationQueue.metadata.automationConsumed.<EYLEM>).
 *
 * KAPSAM DIŞI: tarihsel EXPIRED durumlu tebligatlar işlenmez (yalnız DELIVERED + süresi dolmuş olaylar); otomasyonun diğer kuralları
 * (REQUEST_ENFORCEMENT, BANK_INQUIRY ...) bu testin konusu değildir — yalnız bu olayın onları engellemediği / onlardan etkilenmediği ölçülür.
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('AUTOMATION-EVENT-CONSUMPTION DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

const ACTION = 'NOTIFICATION_EXPIRED';
const PRODUCTION_VALIDATION_OPTIONS = { whitelist: true, forbidNonWhitelisted: true, transform: true } as const;

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

/** Sınırlı bekleyen bariyer: N çağrı gelene kadar (en çok timeoutMs) bekletir; kaç çağrının geldiği ölçülür (boş kanıt olmasın). */
function makeBarrier(expected: number, timeoutMs = 8_000) {
  let arrived = 0;
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const timer = setTimeout(release, timeoutMs);
  return {
    arrive: async () => {
      arrived += 1;
      if (arrived >= expected) release();
      await gate;
    },
    arrivals: () => arrived,
    dispose: () => clearTimeout(timer),
  };
}

type Running = { app: INestApplication; engine: WorkflowEngine; expense: ExpenseRequestService };

describeWithDisposableDb('Otomasyon tebligat süresi doldu — (büro, olay, eylem) başına tek sonuç (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(300_000);

  let prisma: PrismaClient;
  let first: Running;
  let second: Running; // "süreç yeniden başlatma / ikinci süreç" benzetimi: aynı veritabanına bağlı ikinci uygulama
  let tenantId: string;
  let otherTenantId: string;
  let adminId: string;
  let otherAdminId: string;
  let clientId: string;
  const suffix = randomUUID().slice(0, 8);
  const apps: INestApplication[] = [];

  const startApp = async (): Promise<Running> => {
    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule, AutomationModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    const app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    // Uygulama kendi portunda dinler (supertest sunucuyu sahiplenmez): eşzamanlı istek testlerinde Linux ECONNRESET önlemi.
    await app.listen(0, '127.0.0.1');
    // Zamanlanmış görevler testin dışında kalır: işleme YALNIZ bu testin HTTP çağrılarıyla olur.
    for (const job of app.get(SchedulerRegistry, { strict: false }).getCronJobs().values()) job.stop();
    apps.push(app);
    return { app, engine: app.get(WorkflowEngine), expense: app.get(ExpenseRequestService, { strict: false }) };
  };

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    first = await startApp();
    second = await startApp();

    tenantId = `test-ci-nes-${suffix}`;
    otherTenantId = `test-ci-nes-b-${suffix}`;
    await prisma.tenant.create({ data: { id: tenantId, name: 'CI NES', slug: tenantId } });
    await prisma.tenant.create({ data: { id: otherTenantId, name: 'CI NES B', slug: otherTenantId } });
    adminId = (await prisma.user.create({ data: { tenantId, email: `admin-${suffix}@example.test`, name: 'admin', surname: 'NES', role: 'ADMIN' } })).id;
    otherAdminId = (await prisma.user.create({ data: { tenantId: otherTenantId, email: `admin-b-${suffix}@example.test`, name: 'adminb', surname: 'NES', role: 'ADMIN' } })).id;
    clientId = (await prisma.client.create({ data: { tenantId, type: 'COMPANY', companyName: 'NES müvekkil', displayName: 'NES müvekkil' } })).id;
  });

  afterAll(async () => {
    for (const app of apps) await app.close();
    for (const id of [tenantId, otherTenantId]) {
      await prisma.auditLog.deleteMany({ where: { tenantId: id } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id } }).catch(() => undefined);
    }
    await prisma.$disconnect();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const processVia = (running: Running, userId: string, caseId: string) =>
    request(running.app.getHttpServer()).post(`/automation/cases/${caseId}/process`).set('x-test-user-id', userId).send();

  const openCase = async (label: string): Promise<string> => {
    const res = await request(first.app.getHttpServer())
      .post('/cases')
      .set('x-test-user-id', adminId)
      .send({
        fileNumber: `CI-NES-${label}-${suffix}`,
        type: 'GENERAL_EXECUTION',
        interestType: 'YASAL',
        startDate: '2026-02-01',
        currency: 'TRY',
        creditors: [{ id: clientId, type: 'COMPANY', name: 'NES müvekkil' }],
        dues: [{ type: 'PRINCIPAL', description: 'Asıl alacak', amount: 100_000, dueDate: '2026-01-15' }],
      });
    expect({ label, status: res.status }).toEqual({ label, status: 201 });
    const caseId = res.body.id as string;
    // Otomatik mod açık, ödeme emri tebliği sonrası bekleme aşaması; ilk karar günlüğü / aşama kayıtları bu noktadan sonra sayılır.
    await prisma.case.update({ where: { id: caseId }, data: { isAutoMode: true, workflowStage: 'WAITING_RESPONSE' } });
    return caseId;
  };

  const seedEvent = async (caseId: string, data: Record<string, unknown> = {}): Promise<string> => {
    const past = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
    return (
      await prisma.notificationQueue.create({
        data: {
          tenantId,
          caseId,
          type: 'PAYMENT_ORDER',
          channel: 'E_TEBLIGAT',
          recipient: `borclu-${randomUUID().slice(0, 6)}@example.test`,
          status: 'DELIVERED',
          deliveredAt: past,
          expiresAt: past,
          ...data,
        } as never,
      })
    ).id;
  };

  /** Bir olayın bu eylem için yazdığı TÜM yan etkiler (dosya başına). */
  const effects = async (caseId: string) => {
    const sets = await prisma.expenseRequest.findMany({ where: { caseId, stageCode: 'RE_NOTIFICATION' } });
    const row = await prisma.case.findUniqueOrThrow({ where: { id: caseId } });
    return {
      decisions: await prisma.decisionLog.count({ where: { caseId, decision: ACTION } }),
      lifecycles: await prisma.caseLifecycle.count({ where: { caseId, stage: 'ENFORCEMENT', action: 'Aşama değişikliği: ENFORCEMENT' } }),
      sets: sets.length,
      setTotal: sets.reduce((sum, s) => sum + Number(s.totalAmount), 0),
      counter: row.autoActionsCount,
      stage: row.workflowStage,
    };
  };

  const marker = async (notificationId: string) => {
    const row = await prisma.notificationQueue.findUniqueOrThrow({ where: { id: notificationId } });
    const consumed = (row.metadata as { automationConsumed?: Record<string, string> } | null)?.automationConsumed ?? {};
    return Object.keys(consumed).sort();
  };

  describe('tek olay: ikinci işleme yeni yan etki YAZMAZ', () => {
    it('aynı süreçte art arda iki işleme: 1 karar + 1 aşama kaydı + 1 masraf seti + sayaç 1; işaret tebligatta', async () => {
      const caseId = await openCase('ardarda');
      const eventId = await seedEvent(caseId);

      expect((await processVia(first, adminId, caseId)).status).toBe(201);
      const afterFirst = await effects(caseId);
      expect(afterFirst).toMatchObject({ decisions: 1, lifecycles: 1, sets: 1, counter: 1, stage: 'ENFORCEMENT' });
      expect(afterFirst.setTotal).toBe(252);
      expect(await marker(eventId)).toEqual([ACTION]);

      expect((await processVia(first, adminId, caseId)).status).toBe(201);
      expect((await processVia(first, adminId, caseId)).status).toBe(201);
      expect(await effects(caseId)).toEqual(afterFirst);
    });

    it('süreç yeniden başlatma (ikinci uygulama örneği, aynı veritabanı): yeni yan etki yok', async () => {
      const caseId = await openCase('yeniden-baslat');
      const eventId = await seedEvent(caseId);
      await processVia(first, adminId, caseId);
      const before = await effects(caseId);
      expect(before).toMatchObject({ decisions: 1, lifecycles: 1, sets: 1, counter: 1 });

      await processVia(second, adminId, caseId);
      await second.engine.processCase(caseId, tenantId); // 5 dk döngüsünün kullandığı yol (HTTP dışı)
      expect(await effects(caseId)).toEqual(before);
      expect(await marker(eventId)).toEqual([ACTION]);
    });

    it('iki AYRI olay (iki tebligat): her biri bir kez işlenir — işleme başına bir olay; sonra yeni yan etki yok', async () => {
      const caseId = await openCase('iki-olay');
      const a = await seedEvent(caseId, { expiresAt: new Date(Date.now() - 4 * 24 * 60 * 60 * 1000) });
      const b = await seedEvent(caseId);

      await processVia(first, adminId, caseId);
      expect(await marker(a)).toEqual([ACTION]); // en eski olay önce
      expect(await marker(b)).toEqual([]);
      await processVia(first, adminId, caseId);
      expect(await marker(b)).toEqual([ACTION]);
      const afterBoth = await effects(caseId);
      expect(afterBoth).toMatchObject({ decisions: 2, lifecycles: 2, sets: 2, counter: 2 });
      expect(afterBoth.setTotal).toBe(504);

      await processVia(first, adminId, caseId);
      await processVia(second, adminId, caseId);
      expect(await effects(caseId)).toEqual(afterBoth);
    });

    it('süresi dolmamış / EXPIRED (tarihsel) / PAYMENT_ORDER olmayan tebligat işlenmez; işaret yazılmaz', async () => {
      const caseId = await openCase('kapsam');
      const future = await seedEvent(caseId, { expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000) });
      const historic = await seedEvent(caseId, { status: 'EXPIRED' });
      const reminder = await seedEvent(caseId, { type: 'REMINDER' });
      await processVia(first, adminId, caseId);
      expect(await effects(caseId)).toMatchObject({ decisions: 0, lifecycles: 0, sets: 0, counter: 0, stage: 'WAITING_RESPONSE' });
      for (const id of [future, historic, reminder]) expect(await marker(id)).toEqual([]);
    });
  });

  describe('eşzamanlılık: aynı olay aynı anda işlenirse tek sonuç', () => {
    it('aynı süreçte 3 eşzamanlı çağrı (bariyer: üçü de sahiplenmeden önce buluşur): 1 karar + 1 aşama + 1 set + sayaç 1', async () => {
      const caseId = await openCase('es-zamanli-3');
      const eventId = await seedEvent(caseId);
      const barrier = makeBarrier(3);
      const original = (first.engine as any).ensureEventExpenseSet.bind(first.engine);
      jest.spyOn(first.engine as any, 'ensureEventExpenseSet').mockImplementation(async (...args: unknown[]) => {
        const result = await original(...args);
        await barrier.arrive(); // masraf seti yazıldı, olay HENÜZ sahiplenilmedi: üç çağrı yarışa birlikte girer
        return result;
      });
      try {
        const results = await Promise.all([processVia(first, adminId, caseId), processVia(first, adminId, caseId), processVia(first, adminId, caseId)]);
        expect(results.map((r) => r.status)).toEqual([201, 201, 201]);
        expect(barrier.arrivals()).toBe(3); // 0 / 1 = yarış HİÇ oluşmadı (boş kanıt)
      } finally {
        barrier.dispose();
      }
      expect(await effects(caseId)).toMatchObject({ decisions: 1, lifecycles: 1, sets: 1, counter: 1, stage: 'ENFORCEMENT' });
      expect(await marker(eventId)).toEqual([ACTION]);
    });

    it('iki AYRI süreç aynı olayda yarışır (bariyer): 1 karar + 1 aşama + 1 set + sayaç 1', async () => {
      const caseId = await openCase('es-zamanli-iki-surec');
      const eventId = await seedEvent(caseId);
      const barrier = makeBarrier(2);
      for (const running of [first, second]) {
        const original = (running.engine as any).ensureEventExpenseSet.bind(running.engine);
        jest.spyOn(running.engine as any, 'ensureEventExpenseSet').mockImplementation(async (...args: unknown[]) => {
          const result = await original(...args);
          await barrier.arrive();
          return result;
        });
      }
      try {
        const results = await Promise.all([processVia(first, adminId, caseId), processVia(second, adminId, caseId)]);
        expect(results.map((r) => r.status)).toEqual([201, 201]);
        expect(barrier.arrivals()).toBe(2);
      } finally {
        barrier.dispose();
      }
      expect(await effects(caseId)).toMatchObject({ decisions: 1, lifecycles: 1, sets: 1, counter: 1 });
      expect(await marker(eventId)).toEqual([ACTION]);
    });

    it('sahiplenme birim ölçümü: iki eşzamanlı sahiplenmeden YALNIZ biri kazanır; aynı eylem tekrar false; başka eylem / büro / dosya ayrı', async () => {
      const caseId = await openCase('sahiplen');
      const otherCaseId = await openCase('sahiplen-diger');
      const eventId = await seedEvent(caseId);
      const claim = (params: { tenant?: string; caseId?: string; action?: string }) =>
        prisma.$transaction((tx) =>
          claimNotificationEvent(tx, { tenantId: params.tenant ?? tenantId, caseId: params.caseId ?? caseId, notificationId: eventId, action: params.action ?? ACTION }),
        );

      expect(await claim({ tenant: otherTenantId })).toBe(false); // başka büro
      expect(await claim({ caseId: otherCaseId })).toBe(false); // başka dosya
      expect(await marker(eventId)).toEqual([]); // reddedilen sahiplenme iz bırakmaz

      const raced = await Promise.all([claim({}), claim({})]);
      expect(raced.filter(Boolean)).toHaveLength(1);
      expect(await claim({})).toBe(false); // aynı eylem tekrar
      expect(await claim({ action: 'BASKA_EYLEM' })).toBe(true); // tebligatı toptan "tüketildi" yapmak YASAK
      expect(await marker(eventId)).toEqual([ACTION, 'BASKA_EYLEM'].sort());
    });
  });

  describe('yarım kalma: işaret ↔ yan etki boşluğu kapalı', () => {
    it('yan etki transaction içinde patlarsa İŞARET geri alınır (karar / aşama / sayaç yazılmaz); yeniden denemede olay işlenir, masraf seti TEK kalır', async () => {
      const caseId = await openCase('tx-hata');
      const eventId = await seedEvent(caseId);
      jest.spyOn(first.engine as any, 'applyStageChangeInTx').mockRejectedValueOnce(new Error('enjekte edilen hata'));

      await processVia(first, adminId, caseId); // processCase hatayı yutar (günlüğe yazar)
      const afterFailure = await effects(caseId);
      expect(afterFailure).toMatchObject({ decisions: 0, lifecycles: 0, counter: 0, stage: 'WAITING_RESPONSE' });
      expect(afterFailure.sets).toBe(1); // masraf seti işaretten ÖNCE, anahtarlı yazıldı
      expect(await marker(eventId)).toEqual([]);

      await processVia(second, adminId, caseId); // "süreç yeniden başladı": olay hâlâ işlenmemiş
      expect(await effects(caseId)).toMatchObject({ decisions: 1, lifecycles: 1, sets: 1, counter: 1, stage: 'ENFORCEMENT' });
      expect(await marker(eventId)).toEqual([ACTION]);
    });

    it('masraf seti geçici hatayla yazılamazsa olay SAHİPLENİLMEZ (para yan etkisi sessizce kaybolmaz); sonraki işlemede yazılır', async () => {
      const caseId = await openCase('set-gecici-hata');
      const eventId = await seedEvent(caseId);
      jest.spyOn(first.expense, 'createStageExpenseSet').mockRejectedValueOnce(new Error('geçici altyapı hatası'));

      await processVia(first, adminId, caseId);
      expect(await effects(caseId)).toMatchObject({ decisions: 0, lifecycles: 0, sets: 0, counter: 0, stage: 'WAITING_RESPONSE' });
      expect(await marker(eventId)).toEqual([]);

      await processVia(first, adminId, caseId);
      expect(await effects(caseId)).toMatchObject({ decisions: 1, lifecycles: 1, sets: 1, counter: 1, stage: 'ENFORCEMENT' });
    });

    it('masraf seti KESİN reddedilirse (iş kuralı) eski davranış sürer: aşama değişir, olay tüketilir, set yazılmaz', async () => {
      const caseId = await openCase('set-kesin-ret');
      const eventId = await seedEvent(caseId);
      jest.spyOn(first.expense, 'createStageExpenseSet').mockRejectedValueOnce(new BadRequestException('kesin ret'));

      await processVia(first, adminId, caseId);
      expect(await effects(caseId)).toMatchObject({ decisions: 1, lifecycles: 1, sets: 0, counter: 1, stage: 'ENFORCEMENT' });
      expect(await marker(eventId)).toEqual([ACTION]);
    });

    it('masraf seti anahtarı olaya bağlıdır: aynı olay + eylem için sabit, farklı olay için farklı', async () => {
      const caseId = await openCase('anahtar');
      const eventId = await seedEvent(caseId);
      await processVia(first, adminId, caseId);
      const set = await prisma.expenseRequest.findFirstOrThrow({ where: { caseId, stageCode: 'RE_NOTIFICATION' } });
      expect(set.idempotencyKey).toBe(eventIdempotencyKey(ACTION, eventId));
      expect(eventIdempotencyKey(ACTION, 'a')).not.toBe(eventIdempotencyKey(ACTION, 'b'));
    });
  });

  describe('büro sınırı ve diğer eylemler', () => {
    it('başka büronun kullanıcısı bu dosyayı işleyemez: dosya yok sayılır (yan etki yok, işaret yok)', async () => {
      const caseId = await openCase('buro');
      const eventId = await seedEvent(caseId);
      await processVia(first, otherAdminId, caseId);
      expect(await effects(caseId)).toMatchObject({ decisions: 0, lifecycles: 0, sets: 0, counter: 0, stage: 'WAITING_RESPONSE' });
      expect(await marker(eventId)).toEqual([]);
    });

    it('aynı turda başka kurallar (REQUEST_ENFORCEMENT) çalışsa da olay işaretini onlar tüketmez; işaret yalnız kendi eylem anahtarını taşır', async () => {
      const caseId = await openCase('ayni-tur');
      const eventId = await seedEvent(caseId);
      // REQUEST_ENFORCEMENT koşulu: WAITING_RESPONSE + son işlemden ≥ 10 gün + itiraz / ödeme yok
      await prisma.caseLifecycle.updateMany({ where: { caseId }, data: { createdAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000) } });
      await processVia(first, adminId, caseId);
      await processVia(first, adminId, caseId);
      expect(await marker(eventId)).toEqual([ACTION]);
      expect(await prisma.decisionLog.count({ where: { caseId, decision: ACTION } })).toBe(1);
    });
  });
});

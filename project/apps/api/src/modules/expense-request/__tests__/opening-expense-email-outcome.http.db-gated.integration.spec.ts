// CaseModule grafiği `pdf-poppler`'ı yükler; paket Linux'ta yükleme anında process.exit(1) verir
// (CI emsali: case-create-due-currency.http.db-gated.integration.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { CanActivate, ExecutionContext, INestApplication, Logger, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Test } from '@nestjs/testing';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import * as net from 'node:net';
import * as request from 'supertest';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { StorageModule } from '../../../common/storage/storage.module';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { CaseModule } from '../../case/case.module';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { MessageTemplateService } from '../../message-template/message-template.service';
import { MetricsRegistryModule } from '../../metrics-registry/metrics-registry.module';
import { OPENING_EXPENSE_EMAIL_WAIT_MS } from '../opening-expense-email-outcome';

/**
 * Açılış masraf talebi — istenen masraf e-postası GÖNDERİLEMEDİĞİNDE sonuç. GERÇEK HTTP + disposable PostgreSQL + süreç
 * içi sahte SMTP alıcısı (yalnız 127.0.0.1; ileti hiçbir yere iletilmez).
 *
 * Ölçülen kusur (main 6681b1d5, gerçek tarayıcı): "Oluştur ve Masraf Maili Gönder" ile açılan TL dosyada e-posta
 * gönderilemediğinde talep PENDING kalıyor, `POST /cases` yanıtı e-posta sonucunu taşımıyor (gönderim yanıttan sonra
 * arka planda), dosya sayfası gönderilmiş taleple aynı görünüyor ve sunucu günlüğü "Masraf talebi maili gönderildi"
 * yazıyordu.
 *
 * Kural (owner kararı 2026-10-01): sonuç kullanıcıya gösterilir — açılış yanıtında (deneme en çok 10 sn beklenir), dosya
 * sayfasının okuduğu durum ucunda ve görev olarak; günlük sonuca göre yazılır. Başarılı gönderimde yanıt, kayıtlar ve
 * günlük DEĞİŞMEZ. E-postanın gönderilme kuralları (owner sözleşmesi W4: tam bir varsayılan hesap + IBAN yoksa müvekkile
 * e-posta çıkmaz) DEĞİŞMEZ.
 *
 * KAPSAM DIŞI: gönderilememiş e-postanın yeniden gönderimi; dövizli dosya davranışı (ayrı test:
 * opening-expense-fx-basis.http.db-gated.integration.spec.ts).
 */
const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('OPENING-EXPENSE-EMAIL-OUTCOME DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

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

interface SinkMessage {
  to: string[];
  subject: string | null;
}

/**
 * Süreç içi sahte SMTP alıcısı. `accept`: iletiyi kabul eder (alıcı adresinde "reddet" geçiyorsa RCPT'de 550 döner).
 * `silent`: bağlantıyı kabul eder, hiç yanıt vermez (karşılama satırı yok).
 */
function startSmtpServer(mode: 'accept' | 'silent') {
  const messages: SinkMessage[] = [];
  const sockets = new Set<net.Socket>();
  const server = net.createServer((socket) => {
    sockets.add(socket);
    socket.on('close', () => sockets.delete(socket));
    socket.on('error', () => undefined);
    if (mode === 'silent') return;
    socket.setEncoding('utf8');
    let buffer = '';
    let inData = false;
    let authStep = 0;
    let rcpt: string[] = [];
    const send = (line: string) => socket.write(`${line}\r\n`);
    send('220 test-sink ESMTP');
    socket.on('data', (chunk: string) => {
      buffer += chunk;
      for (;;) {
        if (inData) {
          const end = buffer.indexOf('\r\n.\r\n');
          if (end < 0) return;
          const raw = buffer.slice(0, end);
          buffer = buffer.slice(end + 5);
          inData = false;
          const subject = raw.replace(/\r\n[ \t]+/g, ' ').match(/^Subject:\s*(.*)$/im);
          messages.push({ to: rcpt, subject: subject ? subject[1].trim() : null });
          rcpt = [];
          send('250 2.0.0 accepted');
          continue;
        }
        const eol = buffer.indexOf('\r\n');
        if (eol < 0) return;
        const line = buffer.slice(0, eol);
        buffer = buffer.slice(eol + 2);
        const upper = line.toUpperCase();
        if (authStep === 1) {
          authStep = 2;
          send('334 UGFzc3dvcmQ6');
        } else if (authStep === 2) {
          authStep = 0;
          send('235 2.7.0 ok');
        } else if (upper.startsWith('EHLO')) {
          socket.write('250-test-sink\r\n250-AUTH PLAIN LOGIN\r\n250 8BITMIME\r\n');
        } else if (upper.startsWith('AUTH PLAIN')) {
          send('235 2.7.0 ok');
        } else if (upper.startsWith('AUTH LOGIN')) {
          authStep = 1;
          send('334 VXNlcm5hbWU6');
        } else if (upper.startsWith('MAIL FROM:')) {
          send('250 2.1.0 ok');
        } else if (upper.startsWith('RCPT TO:')) {
          const address = line.slice(8).trim();
          if (/reddet/i.test(address)) {
            send('550 5.1.1 recipient rejected (test)');
          } else {
            rcpt.push(address);
            send('250 2.1.5 ok');
          }
        } else if (upper === 'DATA') {
          inData = true;
          send('354 go ahead');
        } else if (upper === 'QUIT') {
          send('221 2.0.0 bye');
          socket.end();
        } else {
          send('250 2.0.0 ok');
        }
      }
    });
  });
  return {
    messages,
    listen: () => new Promise<number>((resolve) => server.listen(0, '127.0.0.1', () => resolve((server.address() as net.AddressInfo).port))),
    dropConnections: () => sockets.forEach((socket) => socket.destroy()),
    close: () =>
      new Promise<void>((resolve) => {
        sockets.forEach((socket) => socket.destroy());
        server.close(() => resolve());
      }),
  };
}

/** Dinleyen olmayan yerel port (bağlantı reddedilir). */
async function closedPort(): Promise<number> {
  const probe = net.createServer();
  const port = await new Promise<number>((resolve) => probe.listen(0, '127.0.0.1', () => resolve((probe.address() as net.AddressInfo).port)));
  await new Promise<void>((resolve) => probe.close(() => resolve()));
  return port;
}

const ACCOUNT = { bankName: 'Test Bankası', accountName: 'Test Hukuk Bürosu', iban: 'TR000000000000000000000001' };
const NOT_RESENT = 'Bu e-posta kendiliğinden yeniden gönderilmez.';
const OPENING_TOTAL = 1431.1;

type SmtpMode = 'sink' | 'none' | 'closed' | 'silent';

interface OfficeSetup {
  /** Büronun banka hesapları (varsayılan işaretiyle). */
  accounts: Array<{ isDefault: boolean; iban?: string }>;
  smtp: SmtpMode;
  templates: boolean;
  /** Müvekkil e-postası (null = adres yok). */
  clientEmail: string | null;
}

const READY: OfficeSetup = { accounts: [{ isDefault: true }], smtp: 'sink', templates: true, clientEmail: 'muvekkil@olcum.example.test' };

describeWithDisposableDb('Açılış masraf talebi — masraf e-postası gönderilemediğinde sonuç (HTTP + disposable PostgreSQL)', () => {
  jest.setTimeout(240_000);

  let prisma: PrismaClient;
  let app: INestApplication;
  let templates: MessageTemplateService;
  let logSpy: jest.SpyInstance;
  let warnSpy: jest.SpyInstance;
  const sink = startSmtpServer('accept');
  const silent = startSmtpServer('silent');
  let sinkPort: number;
  let silentPort: number;
  let unreachablePort: number;
  const suffix = randomUUID().slice(0, 8);
  const tenantIds: string[] = [];
  /** Ortamdaki banka değişkenleri varsayılan hesap kapısını devre dışı bırakır; test süresince kaldırılır. */
  const BANK_ENV = ['BANK_IBAN', 'BANK_ACCOUNT_HOLDER', 'BANK_NAME', 'BANK_BRANCH'] as const;
  const savedBankEnv: Record<string, string | undefined> = {};

  beforeAll(async () => {
    for (const key of BANK_ENV) {
      savedBankEnv[key] = process.env[key];
      delete process.env[key];
    }
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
    await prisma.$connect();
    [sinkPort, silentPort, unreachablePort] = await Promise.all([sink.listen(), silent.listen(), closedPort()]);

    const identity = new DbUserIdentityGuard(() => prisma);
    const moduleRef = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true, ignoreEnvFile: true }), StorageModule, ErrorLogModule, MetricsRegistryModule, CaseModule],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue(identity)
      // Masraf talebi denetleyicisi passport korumasını doğrudan kullanır (AuthGuard('jwt') aynı sınıfı döndürür)
      .overrideGuard(AuthGuard('jwt'))
      .useValue(identity)
      .compile();
    app = moduleRef.createNestApplication();
    app.useGlobalPipes(new ValidationPipe(PRODUCTION_VALIDATION_OPTIONS));
    await app.init();
    templates = app.get(MessageTemplateService, { strict: false });
    // Günlük satırları gözlenir (çıktı değişmez): Nest örnek günlükçüleri bu yöntemlere düşer
    logSpy = jest.spyOn(Logger.prototype, 'log');
    warnSpy = jest.spyOn(Logger.prototype, 'warn');
  });

  afterAll(async () => {
    logSpy?.mockRestore();
    warnSpy?.mockRestore();
    await app?.close();
    for (const tenantId of tenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId } }).catch(() => undefined);
      await prisma.tenant.deleteMany({ where: { id: tenantId } }).catch(() => undefined);
    }
    await prisma.$disconnect();
    await Promise.all([sink.close(), silent.close()]);
    for (const key of BANK_ENV) {
      if (savedBankEnv[key] !== undefined) process.env[key] = savedBankEnv[key];
    }
  });

  const smtpPortOf = (mode: SmtpMode) => (mode === 'sink' ? sinkPort : mode === 'silent' ? silentPort : unreachablePort);

  /** Her senaryo AYRI büro: banka hesabı, SMTP ve şablon ayarı büro düzeyindedir. */
  const setupOffice = async (label: string, setup: OfficeSetup) => {
    const tenantId = `test-ci-oeml-${label}-${suffix}`;
    tenantIds.push(tenantId);
    await prisma.tenant.create({ data: { id: tenantId, name: `CI OEML ${label}`, slug: tenantId } });
    const admin = await prisma.user.create({
      data: { tenantId, email: `admin-${label}-${suffix}@example.test`, name: 'admin', surname: 'OEML', role: 'ADMIN' },
    });
    await prisma.office.create({
      data: {
        tenantId,
        name: 'Test Hukuk Bürosu',
        ...(setup.smtp === 'none'
          ? {}
          : { smtpHost: '127.0.0.1', smtpPort: smtpPortOf(setup.smtp), smtpUser: 'gonderen@buro.example.test', smtpPass: 'x', smtpFromEmail: 'buro@buro.example.test' }),
        bankAccounts: { create: setup.accounts.map((account) => ({ ...ACCOUNT, ...(account.iban !== undefined ? { iban: account.iban } : {}), isDefault: account.isDefault })) },
      },
    });
    if (setup.templates) await templates.seedDefaultTemplates(tenantId);
    const client = await prisma.client.create({
      data: { tenantId, type: 'COMPANY', companyName: 'OEML müvekkil', displayName: 'OEML müvekkil', ...(setup.clientEmail ? { email: setup.clientEmail } : {}) },
    });
    return { tenantId, adminId: admin.id, clientId: client.id, label };
  };
  type Office = Awaited<ReturnType<typeof setupOffice>>;

  const http = () => request(app.getHttpServer());

  const openCase = async (office: Office, body: Record<string, unknown> = {}) => {
    const fileNumber = `CI-OEML-${office.label}-${suffix}-${randomUUID().slice(0, 4)}`;
    const startedAt = Date.now();
    const res = await http()
      .post('/cases')
      .set('x-test-user-id', office.adminId)
      .send({
        fileNumber,
        type: 'GENERAL_EXECUTION',
        interestType: 'YASAL',
        startDate: '2026-02-01',
        currency: 'TRY',
        creditors: [{ id: office.clientId, type: 'COMPANY', name: 'OEML müvekkil' }],
        dues: [{ type: 'PRINCIPAL', description: 'Asıl alacak', amount: 10_000, dueDate: '2026-01-15' }],
        ...body,
      });
    expect(res.status).toBe(201);
    return { opened: res.body as Record<string, any>, fileNumber, elapsedMs: Date.now() - startedAt };
  };

  const openingStatus = async (office: Office, caseId: string) => {
    const res = await http().get(`/expense-requests/case/${caseId}/opening-status`).set('x-test-user-id', office.adminId);
    expect(res.status).toBe(200);
    return res.body as Record<string, any>;
  };

  /** Dosyanın masraf e-postası izi: talep, denetim kayıtları, müvekkil bildirimi, görevler, muhasebe günlüğü. */
  const footprint = async (office: Office, caseId: string) => {
    const requests = await prisma.expenseRequest.findMany({
      where: { tenantId: office.tenantId, caseId },
      include: { auditLogs: { orderBy: { createdAt: 'asc' } }, requestItems: true },
      orderBy: { createdAt: 'asc' },
    });
    const notifications = await prisma.clientNotification.findMany({
      where: { tenantId: office.tenantId, caseId, type: 'MASRAF_ISTEK' },
      select: { status: true, errorMessage: true },
    });
    const tasks = await prisma.task.findMany({
      where: { tenantId: office.tenantId, caseId },
      orderBy: { createdAt: 'asc' },
      select: { title: true, description: true, status: true, priority: true, dedupeKey: true, createdById: true },
    });
    const journalEntries = await prisma.accountingJournalEntry.count({ where: { tenantId: office.tenantId, caseId, sourceType: 'EXPENSE_REQUEST' } });
    return {
      requests: requests.map((row) => ({
        id: row.id,
        stageCode: row.stageCode,
        status: String(row.status),
        gateType: String(row.gateType),
        totalAmount: Number(row.totalAmount),
        itemCount: row.requestItems.length,
        sentAt: row.sentAt,
        sentVia: row.sentVia,
        audit: row.auditLogs.map((log) => ({ action: log.action, details: log.details as Record<string, unknown> | null })),
      })),
      notifications,
      tasks,
      journalEntries,
    };
  };

  /** Arka plan işi için sınırlı bekleme: koşul sağlanınca döner (en çok ~12 sn). */
  const waitFor = async <T>(read: () => Promise<T>, done: (value: T) => boolean): Promise<T> => {
    let value = await read();
    for (let attempt = 0; attempt < 60 && !done(value); attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 200));
      value = await read();
    }
    return value;
  };

  /** Dosya açılışındaki masraf akışının bu dosyaya ait günlük satırları (başka bileşenlerin satırları dışarıda). */
  const OPENING_FLOW_LINE = /^(Otomatik açılış masraf|Otomatik masraf seti|Masraf talebi maili|Masraf maili|Masraf e-postası sonucu)/;
  const logLines = (spy: jest.SpyInstance, fileNumber: string) =>
    spy.mock.calls.map(([message]) => String(message)).filter((message) => OPENING_FLOW_LINE.test(message) && message.includes(fileNumber));

  describe('KONTROL — her şey hazır: e-posta gönderilir; yanıt, kayıtlar ve günlük bugünkü gibidir', () => {
    let office: Office;
    let run: Awaited<ReturnType<typeof openCase>>;
    let state: Awaited<ReturnType<typeof footprint>>;

    beforeAll(async () => {
      office = await setupOffice('kontrol', READY);
      run = await openCase(office, { sendExpenseEmail: true });
      state = await footprint(office, run.opened.id);
    });

    it('YANIT: e-posta gönderildiği için sonuç alanı YOKTUR', () => {
      expect(run.opened.openingExpenseRequest).toBeUndefined();
    });

    it('YAZMA: yanıt döndüğünde talep SENT, müvekkil bildirimi SENT, "Masraf Takibi" görevi yazılmış; başarısızlık görevi yok', () => {
      expect(state.journalEntries).toBe(1);
      expect(state.requests).toHaveLength(1);
      expect(state.requests[0]).toMatchObject({ stageCode: 'OPENING', status: 'SENT', gateType: 'BLOCKING', totalAmount: OPENING_TOTAL, itemCount: 6, sentVia: 'EMAIL' });
      expect(state.requests[0].sentAt).toBeInstanceOf(Date);
      expect(state.requests[0].audit.map((log) => log.action)).toEqual(['CREATED', 'EMAIL_SENT']);
      expect(state.notifications).toEqual([{ status: 'SENT', errorMessage: null }]);
      expect(state.tasks.map((task) => task.title)).toEqual([`Masraf Takibi - ${run.fileNumber}`]);
      expect(state.tasks[0].description).toContain('1.431,10 TL masraf talebi müvekkile gönderildi. Ödeme takibi yapılmalı.');
      expect(state.tasks[0].dedupeKey).toBeNull();
    });

    it('TAŞIMA: e-posta sahte alıcıya ulaştı', () => {
      expect(sink.messages.filter((message) => message.subject === `${run.fileNumber} - Masraf Talebi`)).toEqual([
        { to: ['<muvekkil@olcum.example.test>'], subject: `${run.fileNumber} - Masraf Talebi` },
      ]);
    });

    it('GÜNLÜK: bugünkü iki satır aynen; "gönderilemedi" satırı yok', () => {
      expect(logLines(logSpy, run.fileNumber)).toEqual([`Otomatik açılış masrafları oluşturuldu: ${run.fileNumber}`, `Masraf talebi maili gönderildi: ${run.fileNumber}`]);
      expect(logLines(warnSpy, run.fileNumber)).toEqual([]);
    });

    it('DURUM UCU: e-posta alanı yoktur (dosya sayfasında uyarı çizilmez)', async () => {
      expect(await openingStatus(office, run.opened.id)).toEqual({
        caseId: run.opened.id,
        clientAssigned: true,
        openingRequestExists: true,
        activeExpenseRequestCount: 1,
        automaticCalculation: { calculable: true },
      });
    });
  });

  describe.each([
    {
      label: 'hesap-yok',
      title: 'büroda banka hesabı yok',
      setup: { ...READY, accounts: [] },
      reasonCode: 'PAYMENT_ACCOUNT_MISSING',
      message: 'Büroda varsayılan banka hesabı tanımlı değil',
      requiredInfo: ['Büro Ayarları → Banka Hesapları: tek bir varsayılan hesap'],
      audit: { via: 'dispatcher', outcome: 'default-account-missing' },
      notifications: [],
      taskTitle: 'Masraf e-postası gönderilemedi',
    },
    {
      label: 'varsayilan-degil',
      title: 'hesap var, "varsayılan" işaretli değil',
      setup: { ...READY, accounts: [{ isDefault: false }] },
      reasonCode: 'PAYMENT_ACCOUNT_MISSING',
      message: 'Büroda varsayılan banka hesabı tanımlı değil',
      requiredInfo: ['Büro Ayarları → Banka Hesapları: tek bir varsayılan hesap'],
      audit: { via: 'dispatcher', outcome: 'default-account-missing' },
      notifications: [],
      taskTitle: 'Masraf e-postası gönderilemedi',
    },
    {
      label: 'iki-varsayilan',
      title: 'iki varsayılan hesap',
      setup: { ...READY, accounts: [{ isDefault: true }, { isDefault: true }] },
      reasonCode: 'PAYMENT_ACCOUNT_AMBIGUOUS',
      message: 'Büroda birden fazla varsayılan banka hesabı var',
      requiredInfo: ['Büro Ayarları → Banka Hesapları: tek bir varsayılan hesap'],
      audit: { via: 'dispatcher', outcome: 'default-account-ambiguous' },
      notifications: [],
      taskTitle: 'Masraf e-postası gönderilemedi',
    },
    {
      label: 'iban-bos',
      title: 'varsayılan hesapta IBAN boş',
      setup: { ...READY, accounts: [{ isDefault: true, iban: '' }] },
      reasonCode: 'PAYMENT_IBAN_MISSING',
      message: 'Varsayılan banka hesabında IBAN yok',
      requiredInfo: ['Varsayılan banka hesabının IBAN bilgisi'],
      audit: { via: 'dispatcher', outcome: 'iban-missing-fail-closed' },
      notifications: [],
      taskTitle: 'Masraf e-postası gönderilemedi',
    },
    {
      label: 'eposta-yok',
      title: 'müvekkilde e-posta adresi yok',
      setup: { ...READY, clientEmail: null },
      reasonCode: 'RECIPIENT_MISSING',
      message: 'Müvekkilin e-posta adresi kayıtlı değil',
      requiredInfo: ['Müvekkilin e-posta adresi'],
      audit: { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'RECIPIENT_MISSING' },
      notifications: [{ status: 'FAILED', errorMessage: 'recipient-missing' }],
      taskTitle: 'Masraf e-postası gönderilemedi',
    },
    {
      label: 'smtp-yok',
      title: 'büro SMTP ayarı yapılmamış',
      setup: { ...READY, smtp: 'none' as SmtpMode },
      reasonCode: 'SMTP_NOT_CONFIGURED',
      message: 'Büronun e-posta gönderim (SMTP) ayarları yapılmamış',
      requiredInfo: ['Büro Ayarları → SMTP ayarları'],
      audit: { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'SMTP_NOT_CONFIGURED' },
      notifications: [{ status: 'FAILED', errorMessage: 'smtp-not-configured' }],
      taskTitle: 'Masraf e-postası gönderilemedi',
    },
    {
      label: 'sablon-yok',
      title: 'EXPENSE_REQUEST şablonu yok',
      setup: { ...READY, templates: false },
      reasonCode: 'TEMPLATE_MISSING',
      message: 'Masraf talebi e-posta şablonu tanımlı değil',
      requiredInfo: ['Masraf talebi e-posta şablonu (EXPENSE_REQUEST)'],
      audit: { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'TEMPLATE_MISSING' },
      notifications: [],
      taskTitle: 'Masraf e-postası gönderilemedi',
    },
    {
      label: 'smtp-ret',
      title: 'SMTP sunucusu alıcıyı kalıcı olarak reddetti (550)',
      setup: { ...READY, clientEmail: 'muvekkil.reddet@olcum.example.test' },
      reasonCode: 'DELIVERY_REJECTED',
      message: 'E-posta sunucusu iletiyi reddetti',
      requiredInfo: ['Müvekkilin e-posta adresinin ve büro SMTP ayarlarının doğruluğu'],
      audit: { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'DELIVERY_REJECTED' },
      notifications: [{ status: 'FAILED', errorMessage: expect.stringContaining('550') }],
      taskTitle: 'Masraf e-postası gönderilemedi',
    },
    {
      label: 'smtp-kapali',
      title: 'SMTP sunucusuna bağlanılamadı (sonuç belirsiz)',
      setup: { ...READY, smtp: 'closed' as SmtpMode },
      reasonCode: 'DELIVERY_UNCERTAIN',
      message: 'E-posta sunucusundan yanıt alınamadı; masraf e-postasının gönderildiği doğrulanamadı',
      requiredInfo: ['Büro SMTP ayarlarının ve e-posta sunucusuna erişimin doğruluğu'],
      audit: { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'DELIVERY_UNCERTAIN' },
      notifications: [{ status: 'PENDING', errorMessage: null }],
      taskTitle: 'Masraf e-postası doğrulanamadı',
    },
  ])('$title', ({ label, setup, reasonCode, message, requiredInfo, audit, notifications, taskTitle }) => {
    let office: Office;
    let run: Awaited<ReturnType<typeof openCase>>;
    let state: Awaited<ReturnType<typeof footprint>>;
    let sinkCountBefore: number;

    beforeAll(async () => {
      office = await setupOffice(label, setup as OfficeSetup);
      sinkCountBefore = sink.messages.filter((item) => item.to.join().includes('olcum.example.test')).length;
      run = await openCase(office, { sendExpenseEmail: true });
      state = await footprint(office, run.opened.id);
    });

    it('YANIT: dosya açılır; e-postanın gönderilemediği, nedeni ve gereken bilgi yanıtta bildirilir', () => {
      expect(run.opened.openingExpenseRequest).toEqual({
        status: 'EMAIL_NOT_SENT',
        reasonCode,
        message: expect.stringContaining(message),
        requiredInfo,
        expenseEmailRequested: true,
        expenseEmailSent: false,
      });
      expect(run.opened.openingExpenseRequest.message).toContain(NOT_RESENT);
      // Ham sağlayıcı yanıtı / adres kullanıcı metnine sızmaz
      expect(run.opened.openingExpenseRequest.message).not.toMatch(/550|5\.1\.1|olcum\.example\.test/);
    });

    it('YAZMA: talep bugünkü gibi oluşur ve PENDING kalır; e-posta gönderilmiş sayılmaz', () => {
      expect(state.journalEntries).toBe(1);
      expect(state.requests).toHaveLength(1);
      expect(state.requests[0]).toMatchObject({ stageCode: 'OPENING', status: 'PENDING', gateType: 'BLOCKING', totalAmount: OPENING_TOTAL, itemCount: 6, sentAt: null, sentVia: null });
      expect(state.requests[0].audit).toEqual([
        { action: 'CREATED', details: { itemCount: 6, stageCode: 'OPENING', totalAmount: OPENING_TOTAL } },
        { action: 'EMAIL_FAILED', details: audit },
      ]);
      expect(state.notifications).toEqual(notifications);
      expect(sink.messages.filter((item) => item.to.join().includes('olcum.example.test')).length).toBe(sinkCountBefore);
    });

    it('GÖREV: talep başına tek takip görevi — neden ve gereken bilgiyle; "müvekkile gönderildi" görevi yok', () => {
      expect(state.tasks).toEqual([
        {
          title: `${taskTitle} - ${run.fileNumber}`,
          description: expect.stringContaining(message),
          status: 'PENDING',
          priority: 'MEDIUM',
          dedupeKey: `EXPENSE_EMAIL_NOT_SENT:${state.requests[0].id}`,
          createdById: null,
        },
      ]);
      expect(state.tasks[0].description).toContain('1.431,10 TL tutarındaki açılış masraf talebi için müvekkile masraf e-postası istenmişti.');
      expect(state.tasks[0].description).toContain(`Gereken bilgi: ${requiredInfo.join('; ')}`);
      expect(state.tasks[0].description).not.toMatch(/550|5\.1\.1/);
    });

    it('GÜNLÜK: "gönderildi" YAZILMAZ; nedenli "GÖNDERİLEMEDİ" satırı yazılır', () => {
      expect(logLines(logSpy, run.fileNumber)).toEqual([`Otomatik açılış masrafları oluşturuldu: ${run.fileNumber}`]);
      expect(logLines(warnSpy, run.fileNumber)).toEqual([`Masraf talebi maili GÖNDERİLEMEDİ: ${run.fileNumber} (neden: ${reasonCode})`]);
    });

    it('DURUM UCU: dosya sayfası aynı nedeni kalıcı olarak okur; yanıtın diğer alanları değişmez', async () => {
      const status = await openingStatus(office, run.opened.id);

      expect(status).toEqual({
        caseId: run.opened.id,
        clientAssigned: true,
        openingRequestExists: true,
        activeExpenseRequestCount: 1,
        automaticCalculation: { calculable: true },
        openingRequestEmail: {
          status: 'NOT_SENT',
          reasonCode,
          message: run.opened.openingExpenseRequest.message,
          requiredInfo,
          attemptedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T/),
        },
      });
    });
  });

  describe('"Sadece Oluştur" (e-posta istenmedi): akış bugünkü gibi arka planda; hiçbir e-posta sonucu üretilmez', () => {
    it.each([
      ['e-posta gönderilebilecek büro', READY],
      ['banka hesabı olmayan büro', { ...READY, accounts: [] }],
    ])('%s', async (title, setup) => {
      const office = await setupOffice(`sadece-${title.startsWith('banka') ? 'hesapsiz' : 'hazir'}`, setup);
      const run = await openCase(office);

      expect(run.opened.openingExpenseRequest).toBeUndefined();
      const state = await waitFor(
        () => footprint(office, run.opened.id),
        (value) => value.requests.length > 0 && value.journalEntries > 0,
      );
      expect(state.requests).toHaveLength(1);
      expect(state.requests[0]).toMatchObject({ status: 'PENDING', sentAt: null, totalAmount: OPENING_TOTAL });
      expect(state.requests[0].audit.map((log) => log.action)).toEqual(['CREATED']);
      expect(state.notifications).toEqual([]);
      expect(state.tasks).toEqual([]);
      expect(logLines(logSpy, run.fileNumber)).toEqual([`Otomatik açılış masrafları oluşturuldu: ${run.fileNumber}`]);
      expect(logLines(warnSpy, run.fileNumber)).toEqual([]);
      expect('openingRequestEmail' in (await openingStatus(office, run.opened.id))).toBe(false);
    });
  });

  describe('SMTP sunucusu yanıt vermiyor: yanıt en çok 10 sn bekler, sonuç sonradan görünür', () => {
    let office: Office;
    let run: Awaited<ReturnType<typeof openCase>>;

    beforeAll(async () => {
      office = await setupOffice('sessiz', { ...READY, smtp: 'silent' });
      run = await openCase(office, { sendExpenseEmail: true });
    });

    it('YANIT: bekleme süresi dolunca dosya açılır ve sonucun henüz belli olmadığı bildirilir', async () => {
      expect(run.elapsedMs).toBeGreaterThanOrEqual(OPENING_EXPENSE_EMAIL_WAIT_MS - 250);
      expect(run.elapsedMs).toBeLessThan(OPENING_EXPENSE_EMAIL_WAIT_MS + 8_000);
      expect(run.opened.openingExpenseRequest).toEqual({
        status: 'EMAIL_RESULT_PENDING',
        reasonCode: 'RESULT_PENDING',
        message: expect.stringContaining('Masraf e-postasının sonucu henüz belli değil'),
        requiredInfo: [],
        expenseEmailRequested: true,
        expenseEmailSent: false,
      });

      // O anda: talep oluşmuş, deneme sürüyor — ne gönderildi ne başarısız kaydı var; görev ve dosya sayfası uyarısı yok
      const state = await footprint(office, run.opened.id);
      expect(state.requests[0]).toMatchObject({ status: 'PENDING', sentAt: null });
      expect(state.requests[0].audit.map((log) => log.action)).toEqual(['CREATED']);
      expect(state.tasks).toEqual([]);
      expect('openingRequestEmail' in (await openingStatus(office, run.opened.id))).toBe(false);
    });

    it('SONRA: deneme sonuçlanınca (bağlantı koptu) neden dosya sayfası durumunda ve görevde görünür', async () => {
      silent.dropConnections();

      const state = await waitFor(
        () => footprint(office, run.opened.id),
        (value) => value.requests[0]?.audit.some((log) => log.action === 'EMAIL_FAILED') && value.tasks.length > 0,
      );
      expect(state.requests[0]).toMatchObject({ status: 'PENDING', sentAt: null });
      expect(state.requests[0].audit[1]).toEqual({ action: 'EMAIL_FAILED', details: { via: 'dispatcher', outcome: 'delivery-not-confirmed', reason: 'DELIVERY_UNCERTAIN' } });
      expect(state.tasks.map((task) => task.title)).toEqual([`Masraf e-postası doğrulanamadı - ${run.fileNumber}`]);
      expect((await openingStatus(office, run.opened.id)).openingRequestEmail).toMatchObject({ status: 'NOT_SENT', reasonCode: 'DELIVERY_UNCERTAIN' });
      expect(logLines(warnSpy, run.fileNumber)).toEqual([`Masraf talebi maili GÖNDERİLEMEDİ: ${run.fileNumber} (neden: DELIVERY_UNCERTAIN)`]);
    });
  });

  describe('sınırlar', () => {
    it('başka büronun kullanıcısı dosyanın e-posta durumunu okuyamaz', async () => {
      const office = await setupOffice('sinir-a', { ...READY, accounts: [] });
      const other = await setupOffice('sinir-b', READY);
      const run = await openCase(office, { sendExpenseEmail: true });

      const res = await http().get(`/expense-requests/case/${run.opened.id}/opening-status`).set('x-test-user-id', other.adminId);

      expect(res.status).toBe(404);
      expect(JSON.stringify(res.body)).not.toContain('openingRequestEmail');
    });

    it('müvekkilsiz dosya: e-posta istense de açılış talebi ve e-posta sonucu üretilmez (mevcut davranış)', async () => {
      const office = await setupOffice('muvekkilsiz', { ...READY, accounts: [] });
      const run = await openCase(office, { sendExpenseEmail: true, creditors: [] });

      expect(run.opened.openingExpenseRequest).toBeUndefined();
      expect(await footprint(office, run.opened.id)).toEqual({ requests: [], notifications: [], tasks: [], journalEntries: 0 });
    });

    it('dövizli dosya: #2876 davranışı aynen — talep oluşmaz, "oluşturulmadı" sonucu döner, e-posta görevi yazılmaz', async () => {
      const office = await setupOffice('doviz', { ...READY, accounts: [] });
      const run = await openCase(office, { sendExpenseEmail: true, currency: 'USD', subCategory: 'DOVIZ' });

      expect(run.opened.openingExpenseRequest).toMatchObject({
        status: 'NOT_CREATED',
        reasonCode: 'OPENING_EXPENSE_FX_BASIS_POLICY_MISSING',
        expenseEmailRequested: true,
        expenseEmailSent: false,
      });
      expect(await footprint(office, run.opened.id)).toEqual({ requests: [], notifications: [], tasks: [], journalEntries: 0 });
    });
  });
});

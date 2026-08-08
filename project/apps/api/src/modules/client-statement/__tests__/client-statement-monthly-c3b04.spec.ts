import { ConflictException } from '@nestjs/common';
import { ClientStatementLineType, ClientStatementStatus } from '@prisma/client';
import { SCHEDULER_TIMEZONE } from '../../../common/scheduler-timezone';
import {
  CLIENT_STATEMENT_MONTHLY_CRON,
  buildMonthlyStatementDedupeKey,
  buildMonthlyStatementLockKey,
  resolvePreviousMonthPeriod,
} from '../client-statement-monthly-period';
import { buildClientStatementRender } from '../client-statement-render.mapper';
import { ClientStatementPdfService } from '../client-statement-pdf.service';
import {
  ClientStatementMonthlyDeliveryService,
  type MonthlyDeliveryRunResult,
} from '../client-statement-monthly-delivery.service';
import { CLIENT_STATEMENT_RENDER_FORBIDDEN_FIELDS } from '../client-statement-render.contract';
import type { ClientStatementDeliveryMessage } from '../client-statement-delivery.contract';

/**
 * CAD C3-B04 — AYLIK ÜRETİM VE TESLİM.
 *
 * Bu suite GERÇEK gönderim yapmaz: taşıma portu test double'dır, SMTP/provider
 * hiçbir noktada çağrılmaz. Zaman daima dışarıdan verilir (deterministik).
 */

const TENANT = 'tenant-c3b04';
const CLIENT = 'client-c3b04';

function makeDecimal(value: string) {
  return { toString: () => value };
}

function makeStatement(overrides: Partial<any> = {}) {
  return {
    id: 'stmt-1',
    tenantId: TENANT,
    clientId: CLIENT,
    caseId: null,
    currency: 'TRY',
    status: ClientStatementStatus.ACTIVE,
    periodStart: new Date('2026-01-31T21:00:00.000Z'),
    periodEnd: new Date('2026-02-28T20:59:59.999Z'),
    openingBalance: makeDecimal('100.00'),
    closingBalance: makeDecimal('250.00'),
    lines: [
      {
        id: 'line-1',
        statementId: 'stmt-1',
        caseId: 'case-1',
        caseClientId: 'cc-1',
        refId: 'ref-1',
        refType: 'CollectionDisposition',
        lineDate: new Date('2026-02-10T09:00:00.000Z'),
        lineType: ClientStatementLineType.CASE_COLLECTION_PAYABLE,
        debit: makeDecimal('0.00'),
        credit: makeDecimal('150.00'),
        runningBalance: makeDecimal('250.00'),
        note: null,
      },
    ],
    ...overrides,
  };
}

interface Harness {
  service: ClientStatementMonthlyDeliveryService;
  prisma: any;
  tx: any;
  statements: any;
  office: any;
  scheduler: { addCronJob: jest.Mock };
  port: { send: jest.Mock };
}

function makeHarness(options: { withPort?: boolean; clients?: any[] } = {}): Harness {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    clientStatement: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const prisma: any = {
    client: {
      findMany: jest.fn().mockResolvedValue(
        options.clients ?? [
          {
            id: CLIENT,
            tenantId: TENANT,
            displayName: 'Deneme Müvekkil',
            name: null,
            firstName: null,
            lastName: null,
            email: null,
            contacts: [{ type: 'EMAIL', value: 'Muvekkil@Ornek.com', isPrimary: true }],
          },
        ],
      ),
    },
    clientNotification: { findFirst: jest.fn().mockResolvedValue(null) },
    caseClient: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const statements: any = {
    createClientLevel: jest.fn().mockResolvedValue({ id: 'stmt-1' }),
    findOne: jest.fn().mockResolvedValue(makeStatement()),
  };
  const office: any = { getOrCreate: jest.fn().mockResolvedValue({ name: 'Deneme Hukuk Bürosu' }) };
  const port = { send: jest.fn().mockResolvedValue({ success: true, messageId: 'msg-1' }) };
  const scheduler = { addCronJob: jest.fn() };

  const service = new ClientStatementMonthlyDeliveryService(
    prisma,
    statements,
    new ClientStatementPdfService(),
    office,
    scheduler as any,
    options.withPort ? (port as any) : undefined,
  );

  return { service, prisma, tx, statements, office, scheduler, port };
}

describe('CAD C3-B04 — aylık ekstre dönemi (Türkiye saat dilimi)', () => {
  it('[B04-1] koşu anındaki TR ayının BİR ÖNCEKİ ayını dönem olarak çözer', () => {
    // 1 Mart 2026 00:30 TR (= 2026-02-28T21:30Z) → dönem Şubat 2026
    const period = resolvePreviousMonthPeriod(new Date('2026-02-28T21:30:00.000Z'));

    expect(period.periodKey).toBe('2026-02');
    // 1 Şubat 00:00 TR = 31 Ocak 21:00 UTC
    expect(period.periodStart.toISOString()).toBe('2026-01-31T21:00:00.000Z');
    // 28 Şubat 23:59:59.999 TR = 28 Şubat 20:59:59.999 UTC
    expect(period.periodEnd.toISOString()).toBe('2026-02-28T20:59:59.999Z');
  });

  it('[B04-2] Ocak koşusunda dönem bir ÖNCEKİ YILIN Aralık ayıdır', () => {
    const period = resolvePreviousMonthPeriod(new Date('2026-01-05T10:00:00.000Z'));

    expect(period.periodKey).toBe('2025-12');
    expect(period.periodStart.toISOString()).toBe('2025-11-30T21:00:00.000Z');
    expect(period.periodEnd.toISOString()).toBe('2025-12-31T20:59:59.999Z');
  });

  it('[B04-3] artık yıl ve 31 günlük ay sınırları doğru hesaplanır', () => {
    expect(resolvePreviousMonthPeriod(new Date('2024-03-15T12:00:00.000Z')).periodEnd.toISOString()).toBe(
      '2024-02-29T20:59:59.999Z',
    );
    expect(resolvePreviousMonthPeriod(new Date('2026-02-15T12:00:00.000Z')).periodEnd.toISOString()).toBe(
      '2026-01-31T20:59:59.999Z',
    );
  });

  it('[B04-4] koşu takvimi kanonik scheduler timezone ile bağlanır (host TZ değil)', () => {
    expect(SCHEDULER_TIMEZONE).toBe('Europe/Istanbul');
    expect(CLIENT_STATEMENT_MONTHLY_CRON).toBe('0 3 1 * *');
  });

  it('[B04-5] kilit ve teslim anahtarları tenant + müvekkil + dönem kapsamındadır', () => {
    expect(buildMonthlyStatementLockKey(TENANT, CLIENT, '2026-02')).toBe(
      `client-statement-monthly:${TENANT}:${CLIENT}:2026-02`,
    );
    // Dispatcher sözleşmesiyle aynı biçim → mevcut idempotency kaydına karşı sorgulanabilir.
    expect(buildMonthlyStatementDedupeKey('stmt-1', '2026-02')).toBe(
      'STATEMENT_MONTHLY:ClientStatement:stmt-1:2026-02',
    );
  });
});

describe('CAD C3-B04 — varsayılan KAPALI', () => {
  const previous = process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
  afterEach(() => {
    if (previous === undefined) delete process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
    else process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = previous;
  });

  it('[B04-6] bayrak yokken koşu TEK sorgu bile çalıştırmaz ve hiçbir ekstre üretmez', async () => {
    delete process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
    const h = makeHarness({ withPort: true });

    const result = await h.service.runMonthlyDelivery(new Date('2026-03-01T00:30:00.000Z'));

    expect(result.enabled).toBe(false);
    expect(result.periodKey).toBeNull();
    expect(h.prisma.client.findMany).not.toHaveBeenCalled();
    expect(h.statements.createClientLevel).not.toHaveBeenCalled();
    expect(h.port.send).not.toHaveBeenCalled();
  });

  it('[B04-7a] bayrak yokken CRON KAYDI DA yapılmaz — kanonik cron envanteri değişmez', () => {
    delete process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
    const h = makeHarness();

    h.service.onModuleInit();

    expect(h.scheduler.addCronJob).not.toHaveBeenCalled();
  });

  it('[B04-7b] bayrak açıkken cron kaydı Türkiye saatiyle ayın ilk günü 03:00 olarak kurulur', () => {
    process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = 'true';
    const h = makeHarness();

    h.service.onModuleInit();

    expect(h.scheduler.addCronJob).toHaveBeenCalledTimes(1);
    const [name, job] = h.scheduler.addCronJob.mock.calls[0];
    expect(name).toBe('client-statement-monthly-delivery');
    expect(String(job.cronTime.source)).toBe(CLIENT_STATEMENT_MONTHLY_CRON);
    expect(String(job.cronTime.timeZone)).toBe(SCHEDULER_TIMEZONE);
    job.stop();
  });

  it('[B04-7] bayrak "true" DIŞINDA bir değerle de kapalıdır (fail-closed)', async () => {
    process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = '1';
    const h = makeHarness();

    expect(h.service.isEnabled()).toBe(false);
    expect((await h.service.runMonthlyDelivery(new Date('2026-03-01T00:30:00.000Z'))).enabled).toBe(false);
  });
});

describe('CAD C3-B04 — üretim ve teslim akışı', () => {
  const previous = process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
  beforeEach(() => {
    process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = 'true';
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
    else process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = previous;
  });

  const NOW = new Date('2026-03-01T00:30:00.000Z'); // 1 Mart 03:30 TR

  it('[B04-8] aynı dönemde ACTIVE ekstre varsa YENİDEN ÜRETİLMEZ (duplicate üretim engeli)', async () => {
    const h = makeHarness();
    h.tx.clientStatement.findFirst.mockResolvedValue({ id: 'stmt-existing' });
    h.statements.findOne.mockResolvedValue(makeStatement({ id: 'stmt-existing' }));

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(h.statements.createClientLevel).not.toHaveBeenCalled();
    expect(result.reused).toBe(1);
    expect(result.generated).toBe(0);
    // Ön kontrol advisory lock altında yapılır → eşzamanlı koşular serileşir.
    expect(h.tx.$executeRaw).toHaveBeenCalled();
  });

  it('[B04-9] ACTIVE kontrolü tenant + müvekkil + dönem + client-level kapsamına bağlıdır', async () => {
    const h = makeHarness();
    await h.service.runMonthlyDelivery(NOW);

    const where = h.tx.clientStatement.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT);
    expect(where.clientId).toBe(CLIENT);
    expect(where.caseId).toBeNull();
    expect(where.status).toBe(ClientStatementStatus.ACTIVE);
    expect(where.periodStart.toISOString()).toBe('2026-01-31T21:00:00.000Z');
    expect(where.periodEnd.toISOString()).toBe('2026-02-28T20:59:59.999Z');
  });

  it('[B04-10] yarışta gelen Conflict hata değil, duplicate üretimin ENGELLENDİĞİ sonucudur', async () => {
    const h = makeHarness();
    h.statements.createClientLevel.mockRejectedValue(new ConflictException('aktif ekstre zaten var'));

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.targets[0].outcome).toBe('SKIPPED_DUPLICATE_RUN');
    expect(result.failed).toBe(0);
    expect(result.skipped).toBe(1);
  });

  it('[B04-11] e-postası çözülemeyen müvekkil için ekstre üretilmez ve teslim denenmez', async () => {
    const h = makeHarness({
      withPort: true,
      clients: [
        {
          id: CLIENT,
          tenantId: TENANT,
          displayName: 'E-postasız Müvekkil',
          name: null,
          firstName: null,
          lastName: null,
          email: null,
          contacts: [{ type: 'PHONE', value: '5550000000', isPrimary: true }],
        },
      ],
    });

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.targets[0].outcome).toBe('SKIPPED_NO_RECIPIENT');
    expect(h.statements.createClientLevel).not.toHaveBeenCalled();
    expect(h.port.send).not.toHaveBeenCalled();
  });

  it('[B04-12] hareketsiz dönemde mail GÖNDERİLMEZ', async () => {
    const h = makeHarness({ withPort: true });
    h.statements.findOne.mockResolvedValue(makeStatement({ lines: [] }));

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.targets[0].outcome).toBe('SKIPPED_EMPTY_PERIOD');
    expect(h.port.send).not.toHaveBeenCalled();
  });

  it('[B04-13] aynı dönem için SENT kaydı varsa ikinci kez gönderilmez (duplicate gönderim engeli)', async () => {
    const h = makeHarness({ withPort: true });
    h.prisma.clientNotification.findFirst.mockResolvedValue({ id: 'notif-1' });

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.targets[0].outcome).toBe('SKIPPED_ALREADY_DELIVERED');
    expect(h.port.send).not.toHaveBeenCalled();
    const where = h.prisma.clientNotification.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe(TENANT);
    expect(where.dedupeKey).toBe('STATEMENT_MONTHLY:ClientStatement:stmt-1:2026-02');
    expect(where.status).toBe('SENT');
  });

  it('[B04-14] taşıma portu bağlı DEĞİLSE koşu PLAN_ONLY olur — PDF üretilmez, mail kurulmaz', async () => {
    const h = makeHarness(); // port yok

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.deliveryMode).toBe('PLAN_ONLY');
    expect(result.targets[0].outcome).toBe('PLANNED');
    expect(result.delivered).toBe(0);
    expect(h.office.getOrCreate).not.toHaveBeenCalled();
  });

  it('[B04-15] port bağlıysa müvekkil başına TEK mail ve TEK PDF eki üretilir', async () => {
    const h = makeHarness({ withPort: true });

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.targets[0].outcome).toBe('DELIVERED');
    expect(result.delivered).toBe(1);
    expect(h.port.send).toHaveBeenCalledTimes(1);

    const message: ClientStatementDeliveryMessage = h.port.send.mock.calls[0][0];
    expect(message.to).toBe('muvekkil@ornek.com'); // normalize edilmiş alıcı
    expect(message.attachments).toHaveLength(1);
    expect(message.attachments[0].contentType).toBe('application/pdf');
    expect(message.attachments[0].content.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(message.attachments[0].filename).toMatch(/^ekstre-genel-\d{8}-\d{8}\.pdf$/);
  });

  it('[B04-16] teslim mesajında iç ID sızmaz (POL-4)', async () => {
    const h = makeHarness({ withPort: true });
    await h.service.runMonthlyDelivery(NOW);

    const message: ClientStatementDeliveryMessage = h.port.send.mock.calls[0][0];
    const serialized = `${message.subject}\n${message.text}\n${message.html}\n${message.attachments[0].filename}`;

    for (const forbidden of ['stmt-1', 'case-1', 'cc-1', 'ref-1', TENANT, CLIENT]) {
      expect(serialized).not.toContain(forbidden);
    }
    for (const field of CLIENT_STATEMENT_RENDER_FORBIDDEN_FIELDS) {
      expect(serialized).not.toContain(`"${field}"`);
    }
  });

  it('[B04-17] port başarısız dönerse koşu çökmez, hedef FAILED olarak raporlanır', async () => {
    const h = makeHarness({ withPort: true });
    h.port.send.mockResolvedValue({ success: false, errorCode: 'SMTP_REFUSED' });

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.targets[0].outcome).toBe('FAILED');
    expect(result.targets[0].reason).toBe('SMTP_REFUSED');
    expect(result.failed).toBe(1);
  });

  it('[B04-18] kalıcı teslim defteri bu blokta KURULMADI — sonuç bunu örtmez', async () => {
    const h = makeHarness({ withPort: true });
    const result: MonthlyDeliveryRunResult = await h.service.runMonthlyDelivery(NOW);

    expect(result.persistentDeliveryLedger).toBe(false);
  });
});

describe('CAD C3-B04 — kayıt → render eşlemesi', () => {
  it('[B04-19] eşleme iç ID taşımaz ve bilgi satırını işaretler', () => {
    const statement = makeStatement({
      lines: [
        {
          id: 'line-2',
          statementId: 'stmt-1',
          caseId: 'case-1',
          caseClientId: 'cc-1',
          refId: 'ref-1',
          refType: 'X',
          lineDate: new Date('2026-02-11T09:00:00.000Z'),
          lineType: ClientStatementLineType.CASE_COLLECTION_PAYABLE,
          debit: makeDecimal('0.00'),
          credit: makeDecimal('0.00'),
          runningBalance: makeDecimal('250.00'),
          note: 'bilgi',
        },
      ],
    });

    const render = buildClientStatementRender({
      statement: statement as any,
      officeName: 'Deneme Hukuk Bürosu',
      clientName: 'Deneme Müvekkil',
      fileReferences: new Map(),
    });

    expect(render.scope).toBe('CLIENT_LEVEL');
    expect(render.lines[0].isInformational).toBe(true);
    expect(render.lines[0].fileReference).toBeNull();
    const serialized = JSON.stringify(render);
    for (const forbidden of ['stmt-1', 'case-1', 'cc-1', 'ref-1', 'line-2']) {
      expect(serialized).not.toContain(forbidden);
    }
  });
});

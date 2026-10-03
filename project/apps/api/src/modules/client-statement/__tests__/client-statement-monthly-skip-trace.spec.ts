import { BadRequestException } from '@nestjs/common';
import { CLIENT_STATEMENT_UNSUPPORTED_CURRENCY_CODE } from '../client-statement-currency-guard';
import {
  MONTHLY_STATEMENT_SKIP_TRACE_PREFIX,
  buildMonthlyStatementSkipDedupeKey,
  buildMonthlyStatementSkipTask,
} from '../client-statement-monthly-skip-trace';
import { ClientStatementMonthlyDeliveryService } from '../client-statement-monthly-delivery.service';

/**
 * ATLANAN AYLIK EKSTRE — KALICI İZ (owner kararı 2026-10-03, "7 — B").
 *
 * E1 (#2893) ekstreye girecek kaynakta TL dışı / belirsiz para birimi varsa aylık koşuda ekstreyi üretmez. Bu atlama yalnız koşu
 * sonucunda kalıyordu. Karar: mevcut kalıcı görev mekanizması (`Task.dedupeKey` UNIQUE; yeni tablo / migration YOK) ile müvekkil +
 * dönem + neden başına TEK kalıcı iz; yeniden koşu mükerrer iz / başarı / gönderim üretmez; atlama "gönderildi" sayılmaz.
 * Gerçek HTTP + disposable DB kabulü client-statement-currency.http.db-gated.integration.spec.ts içindedir.
 */
const TENANT = 'tenant-1';
const CLIENT = 'client-1';
const PERIOD = '2026-02';

describe('buildMonthlyStatementSkipDedupeKey / buildMonthlyStatementSkipTask (saf)', () => {
  it('izin kimliği büro + müvekkil + dönem + neden başına AYRI ve kararlıdır', () => {
    const base = buildMonthlyStatementSkipDedupeKey(TENANT, CLIENT, PERIOD, 'NON_TRY_SOURCE');
    expect(base).toBe(`${MONTHLY_STATEMENT_SKIP_TRACE_PREFIX}:tenant-1:client-1:2026-02:NON_TRY_SOURCE`);
    expect(buildMonthlyStatementSkipDedupeKey(TENANT, CLIENT, PERIOD, 'NON_TRY_SOURCE')).toBe(base);
    for (const other of [
      buildMonthlyStatementSkipDedupeKey('tenant-2', CLIENT, PERIOD, 'NON_TRY_SOURCE'),
      buildMonthlyStatementSkipDedupeKey(TENANT, 'client-2', PERIOD, 'NON_TRY_SOURCE'),
      buildMonthlyStatementSkipDedupeKey(TENANT, CLIENT, '2026-03', 'NON_TRY_SOURCE'),
      buildMonthlyStatementSkipDedupeKey(TENANT, CLIENT, PERIOD, 'CURRENCY_UNDETERMINED'),
    ]) {
      expect(other).not.toBe(base);
    }
  });

  it('görev içeriği: müvekkil + dönem + neden + kaynak; PENDING / sistem kaynaklı; "üretilmedi ve gönderilmedi" açık', () => {
    const task = buildMonthlyStatementSkipTask({
      tenantId: TENANT,
      clientId: CLIENT,
      clientName: 'Deneme Müvekkil',
      periodKey: PERIOD,
      reasonCode: 'NON_TRY_SOURCE',
      currencies: ['USD'],
      sources: ['ClientPayout', 'CollectionDisposition'],
    });
    expect(task).toMatchObject({
      tenantId: TENANT,
      clientId: CLIENT,
      status: 'PENDING',
      priority: 'MEDIUM',
      createdById: null,
      dedupeKey: buildMonthlyStatementSkipDedupeKey(TENANT, CLIENT, PERIOD, 'NON_TRY_SOURCE'),
    });
    expect(task.title).toBe('Aylık ekstre üretilemedi: Deneme Müvekkil (2026-02)');
    expect(task.description).toContain('Müvekkil: Deneme Müvekkil');
    expect(task.description).toContain('Dönem: 2026-02');
    expect(task.description).toContain('TL dışı para biriminde kayıt var (USD)');
    expect(task.description).toContain('müvekkile ödeme, tahsilat dağıtımı');
    expect(task.description).toContain('ÜRETİLMEDİ ve GÖNDERİLMEDİ; gönderilmiş sayılmaz');
    expect(task.description).toContain('yeniden koşu bu görevi tekrarlamaz');
  });

  it('belirsiz para birimi nedeni ayrı yazılır; görev tutar ya da kayıt kimliği taşımaz', () => {
    const task = buildMonthlyStatementSkipTask({
      tenantId: TENANT,
      clientId: CLIENT,
      clientName: 'Deneme Müvekkil',
      periodKey: PERIOD,
      reasonCode: 'CURRENCY_UNDETERMINED',
      currencies: [],
      sources: ['BalanceLedger'],
    });
    expect(task.description).toContain('para birimi belirlenemeyen kayıt var');
    expect(task.description).toContain('masraf/avans defteri');
    expect(task.description.replace(PERIOD, '')).not.toMatch(/\d/); // dönem dışında hiçbir rakam yok (tutar / kayıt kimliği yazılmaz)
  });
});

/** E1 reddi (HTTP 400 gövdesiyle birebir). */
const currencyRejection = (reasonCode = 'NON_TRY_SOURCE') =>
  new BadRequestException({
    code: CLIENT_STATEMENT_UNSUPPORTED_CURRENCY_CODE,
    reasonCode,
    message: 'Ekstre oluşturulamadı: TL dışı para biriminde kayıt var (USD).',
    currencies: reasonCode === 'NON_TRY_SOURCE' ? ['USD'] : [],
    sources: ['ClientPayout'],
  });

function makeClient(over: Record<string, unknown> = {}) {
  return {
    id: CLIENT,
    tenantId: TENANT,
    displayName: 'Deneme Müvekkil',
    name: null,
    firstName: null,
    lastName: null,
    email: null,
    contacts: [{ type: 'EMAIL', value: 'muvekkil@ornek.com', isPrimary: true }],
    ...over,
  };
}

function harness(opts: { clients?: any[]; withPortAndLedger?: boolean; taskCreate?: jest.Mock } = {}) {
  const keys = new Set<string>();
  const taskCreate =
    opts.taskCreate ??
    jest.fn(async ({ data }: any) => {
      if (keys.has(data.dedupeKey)) throw Object.assign(new Error('Unique constraint failed'), { code: 'P2002' });
      keys.add(data.dedupeKey);
      return { id: `task-${keys.size}` };
    });
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    clientStatement: { findFirst: jest.fn().mockResolvedValue(null) },
  };
  const prisma: any = {
    client: { findMany: jest.fn().mockResolvedValue(opts.clients ?? [makeClient()]) },
    clientNotification: { findFirst: jest.fn().mockResolvedValue(null) },
    task: { create: taskCreate },
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const statements: any = {
    createClientLevel: jest.fn().mockRejectedValue(currencyRejection()),
    findOne: jest.fn(),
  };
  const port = { send: jest.fn().mockResolvedValue({ success: true, messageId: 'm-1' }) };
  const ledger = { claim: jest.fn(), markSent: jest.fn(), markFailed: jest.fn() };
  const errorReporter: any = { report: jest.fn().mockResolvedValue(undefined) };
  const service = new ClientStatementMonthlyDeliveryService(
    prisma,
    statements,
    {} as any,
    { getOfficeIdentity: jest.fn().mockResolvedValue({ name: 'Büro' }) } as any,
    undefined,
    opts.withPortAndLedger ? (port as any) : undefined,
    opts.withPortAndLedger ? (ledger as any) : undefined,
    errorReporter,
  );
  return { service, prisma, statements, port, ledger, errorReporter, taskCreate, keys };
}

describe('ClientStatementMonthlyDeliveryService — atlanan ekstrenin kalıcı izi', () => {
  const NOW = new Date('2026-03-01T00:30:00.000Z'); // 1 Mart 03:30 TR → dönem 2026-02
  let previous: string | undefined;
  beforeEach(() => {
    previous = process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
    process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = 'true';
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
    else process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = previous;
  });

  it('atlama: müvekkil + dönem + neden başına TEK kalıcı görev yazılır; sonuç CREATED; başarı / gönderim sayılmaz', async () => {
    const h = harness();

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(h.taskCreate).toHaveBeenCalledTimes(1);
    const data = h.taskCreate.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: TENANT,
      clientId: CLIENT,
      status: 'PENDING',
      createdById: null,
      dedupeKey: `${MONTHLY_STATEMENT_SKIP_TRACE_PREFIX}:${TENANT}:${CLIENT}:2026-02:NON_TRY_SOURCE`,
    });
    expect(result.targets[0]).toMatchObject({
      outcome: 'SKIPPED_UNSUPPORTED_CURRENCY',
      statementSource: 'NONE',
      reason: 'NON_TRY_SOURCE',
      skipTrace: 'CREATED',
    });
    expect(result).toMatchObject({ generated: 0, reused: 0, delivered: 0, planned: 0, failed: 0, skipped: 1 });
  });

  it('YENİDEN KOŞU: ikinci koşu aynı dönem için mükerrer iz yazmaz (ALREADY_RECORDED); başarı / gönderim yine yok', async () => {
    const h = harness();

    const first = await h.service.runMonthlyDelivery(NOW);
    const second = await h.service.runMonthlyDelivery(NOW);

    expect(first.targets[0].skipTrace).toBe('CREATED');
    expect(second.targets[0].skipTrace).toBe('ALREADY_RECORDED');
    expect(h.keys.size).toBe(1); // tek kalıcı kayıt
    expect(h.taskCreate).toHaveBeenCalledTimes(2); // ikinci yazım DB tekilliğine takıldı (P2002)
    expect(second).toMatchObject({ generated: 0, delivered: 0, planned: 0, failed: 0, skipped: 1 });
    expect(h.errorReporter.report).not.toHaveBeenCalled(); // mükerrer iz hata değildir
  });

  it('EŞZAMANLI koşular: ikisi birlikte atlasa da tek kalıcı iz kalır', async () => {
    const h = harness();

    const [a, b] = await Promise.all([h.service.runMonthlyDelivery(NOW), h.service.runMonthlyDelivery(NOW)]);

    expect(h.keys.size).toBe(1);
    const traces = [a.targets[0].skipTrace, b.targets[0].skipTrace].sort();
    expect(traces).toEqual(['ALREADY_RECORDED', 'CREATED']);
  });

  it('neden değişirse (TL dışı → belirsiz) AYRI iz; aynı neden aynı dönemde tek', async () => {
    const h = harness();
    await h.service.runMonthlyDelivery(NOW);
    h.statements.createClientLevel.mockRejectedValue(currencyRejection('CURRENCY_UNDETERMINED'));

    const second = await h.service.runMonthlyDelivery(NOW);

    expect(second.targets[0]).toMatchObject({ reason: 'CURRENCY_UNDETERMINED', skipTrace: 'CREATED' });
    expect([...h.keys].sort()).toEqual([
      `${MONTHLY_STATEMENT_SKIP_TRACE_PREFIX}:${TENANT}:${CLIENT}:2026-02:CURRENCY_UNDETERMINED`,
      `${MONTHLY_STATEMENT_SKIP_TRACE_PREFIX}:${TENANT}:${CLIENT}:2026-02:NON_TRY_SOURCE`,
    ]);
  });

  it('farklı dönem ve farklı müvekkil için ayrı iz', async () => {
    const h = harness({ clients: [makeClient(), makeClient({ id: 'client-2', displayName: 'İkinci Müvekkil' })] });

    await h.service.runMonthlyDelivery(NOW);
    await h.service.runMonthlyDelivery(new Date('2026-04-01T00:30:00.000Z')); // dönem 2026-03

    expect(h.keys.size).toBe(4);
  });

  it('teslim portu + kalıcı defter bağlıyken atlama: defter rezervasyonu, PDF, e-posta YOK ("gönderildi" sayılmaz)', async () => {
    const h = harness({ withPortAndLedger: true });

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.targets[0].outcome).toBe('SKIPPED_UNSUPPORTED_CURRENCY');
    expect(h.ledger.claim).not.toHaveBeenCalled();
    expect(h.ledger.markSent).not.toHaveBeenCalled();
    expect(h.ledger.markFailed).not.toHaveBeenCalled();
    expect(h.port.send).not.toHaveBeenCalled();
    expect(h.statements.findOne).not.toHaveBeenCalled();
    expect(result.delivered).toBe(0);
  });

  it('iz yazımı BAŞARISIZ olursa gizlenmez: WRITE_FAILED + cron arıza raporu; atlama yine "başarısız" / "gönderildi" değil', async () => {
    const h = harness({ taskCreate: jest.fn().mockRejectedValue(new Error('bağlantı koptu')) });

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.targets[0]).toMatchObject({ outcome: 'SKIPPED_UNSUPPORTED_CURRENCY', skipTrace: 'WRITE_FAILED' });
    expect(result).toMatchObject({ delivered: 0, failed: 0, skipped: 1 });
    expect(h.errorReporter.report).toHaveBeenCalledTimes(1);
    expect(h.errorReporter.report.mock.calls[0][0].metadata).toMatchObject({
      reasonCode: 'STATEMENT_SKIP_TRACE_WRITE_FAILED',
      outcome: 'FAILED_TERMINAL',
    });
    expect(h.errorReporter.report.mock.calls[0][0].tenantId).toBe(TENANT);
  });

  it('para birimi dışındaki başka atlamalar iz YAZMAZ (kapsam yalnız E1 atlaması)', async () => {
    const noRecipient = harness({ clients: [makeClient({ contacts: [], email: null })] });
    const r1 = await noRecipient.service.runMonthlyDelivery(NOW);
    expect(r1.targets[0].outcome).toBe('SKIPPED_NO_RECIPIENT');
    expect(noRecipient.taskCreate).not.toHaveBeenCalled();

    const emptyPeriod = harness();
    emptyPeriod.statements.createClientLevel.mockResolvedValue({ id: 'stmt-1' });
    emptyPeriod.statements.findOne.mockResolvedValue({ id: 'stmt-1', lines: [], status: 'ACTIVE' });
    const r2 = await emptyPeriod.service.runMonthlyDelivery(NOW);
    expect(r2.targets[0].outcome).toBe('SKIPPED_EMPTY_PERIOD');
    expect(emptyPeriod.taskCreate).not.toHaveBeenCalled();
  });

  it('ekstre üretimindeki başka hata hâlâ FAILED ve iz YAZMAZ', async () => {
    const h = harness();
    h.statements.createClientLevel.mockRejectedValue(new BadRequestException({ code: 'BAŞKA_BİR_HATA', message: 'x' }));

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.targets[0].outcome).toBe('FAILED');
    expect(h.taskCreate).not.toHaveBeenCalled();
  });

  it('bayrak kapalıyken hiçbir sorgu / iz yok', async () => {
    delete process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
    const h = harness();

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.enabled).toBe(false);
    expect(h.prisma.client.findMany).not.toHaveBeenCalled();
    expect(h.taskCreate).not.toHaveBeenCalled();
  });
});

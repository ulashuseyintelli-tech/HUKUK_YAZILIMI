import { ClientStatementLineType, ClientStatementStatus } from '@prisma/client';
import {
  CLIENT_STATEMENT_DELIVERY_LOCK_TIMEOUT_MINUTES,
  CLIENT_STATEMENT_DELIVERY_MAX_ATTEMPTS,
  CLIENT_STATEMENT_DELIVERY_RETRY_MINUTES,
  computeNextRetryAt,
  decideDeliveryClaim,
  isTerminalAttempt,
  truncateLedgerError,
  type ClientStatementDeliveryLedgerRecord,
} from '../client-statement-delivery-ledger.contract';
import { ClientStatementPdfService } from '../client-statement-pdf.service';
import { ClientStatementMonthlyDeliveryService } from '../client-statement-monthly-delivery.service';

/**
 * CAD C3-B05 — KALICI OUTBOX / RETRY / IDEMPOTENCY / AUDIT.
 *
 * Bu suite GERÇEK gönderim yapmaz (taşıma portu ve teslim defteri test double).
 * Zaman daima dışarıdan verilir.
 */

const TENANT = 'tenant-c3b05';
const CLIENT = 'client-c3b05';
const NOW = new Date('2026-03-01T00:30:00.000Z');
const DEDUPE = 'STATEMENT_MONTHLY:ClientStatement:stmt-1:2026-02';

function ledgerRecord(overrides: Partial<ClientStatementDeliveryLedgerRecord> = {}): ClientStatementDeliveryLedgerRecord {
  return {
    dedupeKey: DEDUPE,
    status: 'PENDING',
    attempts: 1,
    reservedAt: null,
    nextRetryAt: null,
    sentAt: null,
    lastError: null,
    ...overrides,
  };
}

function makeDecimal(value: string) {
  return { toString: () => value };
}

function makeStatement() {
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
  };
}

function makeHarness(options: { withLedger?: boolean; claimResult?: ClientStatementDeliveryLedgerRecord | null } = {}) {
  const tx = {
    $executeRaw: jest.fn().mockResolvedValue(1),
    clientStatement: { findFirst: jest.fn().mockResolvedValue({ id: 'stmt-1' }) },
  };
  const prisma: any = {
    client: {
      findMany: jest.fn().mockResolvedValue([
        {
          id: CLIENT,
          tenantId: TENANT,
          displayName: 'Deneme Müvekkil',
          name: null,
          firstName: null,
          lastName: null,
          email: null,
          contacts: [{ type: 'EMAIL', value: 'muvekkil@ornek.com', isPrimary: true }],
        },
      ]),
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
  const ledger = {
    claim: jest.fn().mockResolvedValue(
      options.claimResult === undefined ? ledgerRecord() : options.claimResult,
    ),
    markSent: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
  const reporter = { report: jest.fn().mockResolvedValue(undefined) };

  const service = new ClientStatementMonthlyDeliveryService(
    prisma,
    statements,
    new ClientStatementPdfService(),
    office,
    { addCronJob: jest.fn() } as any,
    port as any,
    options.withLedger ? (ledger as any) : undefined,
    reporter as any,
  );

  return { service, prisma, statements, office, port, ledger, reporter };
}

describe('CAD C3-B05 — teslim defteri karar çekirdeği (saf)', () => {
  it('[B05-1] kayıt yoksa yeni rezervasyon alınır', () => {
    expect(decideDeliveryClaim(null, NOW)).toEqual({ action: 'CLAIM', kind: 'NEW' });
  });

  it('[B05-2] SENT kayıt ASLA yeniden gönderilmez', () => {
    const decision = decideDeliveryClaim(ledgerRecord({ status: 'SENT', sentAt: NOW }), NOW);
    expect(decision).toEqual({ action: 'SKIP', reason: 'already-sent' });
  });

  it('[B05-3] deneme sınırına ulaşan kayıt yeniden denenmez', () => {
    const decision = decideDeliveryClaim(
      ledgerRecord({ status: 'FAILED', attempts: CLIENT_STATEMENT_DELIVERY_MAX_ATTEMPTS }),
      NOW,
    );
    expect(decision).toEqual({ action: 'SKIP', reason: 'max-attempts' });
  });

  it('[B05-4] taze PENDING rezervasyon başka koşu tarafından devralınmaz', () => {
    const fresh = new Date(NOW.getTime() - 60 * 1000);
    expect(decideDeliveryClaim(ledgerRecord({ reservedAt: fresh }), NOW)).toEqual({
      action: 'SKIP',
      reason: 'fresh-pending',
    });
  });

  it('[B05-5] asılı kalan PENDING rezervasyon kilit süresi dolunca devralınır', () => {
    const stale = new Date(NOW.getTime() - (CLIENT_STATEMENT_DELIVERY_LOCK_TIMEOUT_MINUTES + 1) * 60 * 1000);
    expect(decideDeliveryClaim(ledgerRecord({ reservedAt: stale }), NOW)).toEqual({
      action: 'CLAIM',
      kind: 'TAKEOVER_STALE_PENDING',
    });
  });

  it('[B05-6] FAILED kayıt yalnız retry zamanı geldiğinde yeniden denenir', () => {
    const notDue = ledgerRecord({ status: 'FAILED', nextRetryAt: new Date(NOW.getTime() + 60 * 1000) });
    expect(decideDeliveryClaim(notDue, NOW)).toEqual({ action: 'SKIP', reason: 'retry-not-due' });

    const due = ledgerRecord({ status: 'FAILED', nextRetryAt: new Date(NOW.getTime() - 60 * 1000) });
    expect(decideDeliveryClaim(due, NOW)).toEqual({ action: 'CLAIM', kind: 'RETRY_FAILED' });
  });

  it('[B05-7] retry gecikmesi ve terminal sınır emsalle aynıdır (POA teslim deseni)', () => {
    expect(CLIENT_STATEMENT_DELIVERY_MAX_ATTEMPTS).toBe(3);
    expect(CLIENT_STATEMENT_DELIVERY_RETRY_MINUTES).toBe(60);

    expect(isTerminalAttempt(2)).toBe(false);
    expect(isTerminalAttempt(3)).toBe(true);
    expect(computeNextRetryAt(3, NOW)).toBeNull();
    expect(computeNextRetryAt(1, NOW)?.toISOString()).toBe(
      new Date(NOW.getTime() + CLIENT_STATEMENT_DELIVERY_RETRY_MINUTES * 60 * 1000).toISOString(),
    );
  });

  it('[B05-8] defter hata metni sınırlıdır ve boş bırakılmaz', () => {
    expect(truncateLedgerError(null)).toBe('Bilinmeyen hata');
    expect(truncateLedgerError('x'.repeat(900))).toHaveLength(500);
  });
});

describe('CAD C3-B05 — koşunun kalıcı deftere bağlanması', () => {
  const previous = process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
  beforeEach(() => {
    process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = 'true';
  });
  afterEach(() => {
    if (previous === undefined) delete process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
    else process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = previous;
  });

  it('[B05-9] defter bağlıyken koşu bunu dürüstçe raporlar', async () => {
    const h = makeHarness({ withLedger: true });
    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.persistentDeliveryLedger).toBe(true);
    expect(result.targets[0].outcome).toBe('DELIVERED');
  });

  it('[B05-10] defter bağlı DEĞİLKEN kalıcılık iddia edilmez', async () => {
    const h = makeHarness();
    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.persistentDeliveryLedger).toBe(false);
  });

  it('[B05-11] rezervasyonu kaybeden koşu GÖNDERMEZ (çift gönderim yapısal olarak engellenir)', async () => {
    const h = makeHarness({ withLedger: true, claimResult: null });
    const result = await h.service.runMonthlyDelivery(NOW);

    expect(h.ledger.claim).toHaveBeenCalledTimes(1);
    expect(h.port.send).not.toHaveBeenCalled();
    expect(result.targets[0].outcome).toBe('SKIPPED_LEDGER_CLAIM_LOST');
    expect(result.delivered).toBe(0);
  });

  it('[B05-12] rezervasyon gönderim ÖNCESİ alınır ve tenant + dönem + alıcı kapsamını taşır', async () => {
    const h = makeHarness({ withLedger: true });
    await h.service.runMonthlyDelivery(NOW);

    const claim = h.ledger.claim.mock.calls[0][0];
    expect(claim.tenantId).toBe(TENANT);
    expect(claim.clientId).toBe(CLIENT);
    expect(claim.statementId).toBe('stmt-1');
    expect(claim.dedupeKey).toBe(DEDUPE);
    expect(claim.periodKey).toBe('2026-02');
    expect(claim.recipientEmail).toBe('muvekkil@ornek.com');
    expect(h.ledger.claim.mock.invocationCallOrder[0]).toBeLessThan(h.port.send.mock.invocationCallOrder[0]);
  });

  it('[B05-13] defter bağlıyken idempotency otoritesi defterdir — bildirim tablosu sorgulanmaz', async () => {
    const h = makeHarness({ withLedger: true });
    await h.service.runMonthlyDelivery(NOW);

    expect(h.prisma.clientNotification.findFirst).not.toHaveBeenCalled();
  });

  it('[B05-14] başarılı gönderim kalıcı olarak SENT damgalanır', async () => {
    const h = makeHarness({ withLedger: true });
    await h.service.runMonthlyDelivery(NOW);

    expect(h.ledger.markSent).toHaveBeenCalledWith(DEDUPE, NOW);
    expect(h.ledger.markFailed).not.toHaveBeenCalled();
  });

  it('[B05-15] mail gittikten sonra damga yazılamazsa sonuç FAILED yapılmaz ama sessiz kalmaz', async () => {
    const h = makeHarness({ withLedger: true });
    h.ledger.markSent.mockRejectedValue(new Error('ledger down'));

    const result = await h.service.runMonthlyDelivery(NOW);

    // Retry ikinci bir mail göndermesin diye sonuç DELIVERED kalır...
    expect(result.targets[0].outcome).toBe('DELIVERED');
    expect(h.ledger.markFailed).not.toHaveBeenCalled();
    // ...ama olay operatöre görünür kılınır.
    expect(h.reporter.report).toHaveBeenCalledTimes(1);
    expect(h.reporter.report.mock.calls[0][0].metadata.reasonCode).toBe('STATEMENT_DELIVERY_SENT_MARK_FAILED');
  });

  it('[B05-16] başarısız gönderim kalıcı olarak damgalanır (sessiz kayıp yok)', async () => {
    const h = makeHarness({ withLedger: true });
    h.port.send.mockResolvedValue({ success: false, errorCode: 'SMTP_REFUSED' });

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.targets[0].outcome).toBe('FAILED');
    expect(h.ledger.markFailed).toHaveBeenCalledTimes(1);
    const [dedupeKey, attempts, error] = h.ledger.markFailed.mock.calls[0];
    expect(dedupeKey).toBe(DEDUPE);
    expect(attempts).toBe(1);
    expect(error).toBe('SMTP_REFUSED');
  });

  it('[B05-17] deneme sınırına ulaşan başarısızlık operatöre GÖRÜNÜR olur', async () => {
    const h = makeHarness({
      withLedger: true,
      claimResult: ledgerRecord({ attempts: CLIENT_STATEMENT_DELIVERY_MAX_ATTEMPTS }),
    });
    h.port.send.mockResolvedValue({ success: false, errorCode: 'SMTP_REFUSED' });

    await h.service.runMonthlyDelivery(NOW);

    expect(h.reporter.report).toHaveBeenCalledTimes(1);
    const payload = h.reporter.report.mock.calls[0][0];
    expect(payload.source).toBe('CRON');
    expect(payload.operation).toBe('client-statement.monthlyDelivery');
    expect(payload.tenantId).toBe(TENANT);
    expect(payload.metadata.reasonCode).toBe('STATEMENT_DELIVERY_TERMINAL_FAILURE');
    expect(payload.metadata.dedupeKey).toBe(DEDUPE);
  });

  it('[B05-18] terminal OLMAYAN başarısızlık arıza raporu üretmez (gürültü yok, kayıp da yok)', async () => {
    const h = makeHarness({ withLedger: true, claimResult: ledgerRecord({ attempts: 1 }) });
    h.port.send.mockResolvedValue({ success: false, errorCode: 'SMTP_TIMEOUT' });

    await h.service.runMonthlyDelivery(NOW);

    expect(h.reporter.report).not.toHaveBeenCalled();
    expect(h.ledger.markFailed).toHaveBeenCalledTimes(1);
  });

  it('[B05-19] defter yazımı çökerse koşu çökmez ve diğer müvekkiller işlenmeye devam eder', async () => {
    const h = makeHarness({ withLedger: true });
    h.port.send.mockResolvedValue({ success: false, errorCode: 'SMTP_REFUSED' });
    h.ledger.markFailed.mockRejectedValue(new Error('ledger down'));

    const result = await h.service.runMonthlyDelivery(NOW);

    expect(result.failed).toBe(1);
    expect(result.targets).toHaveLength(1);
  });
});

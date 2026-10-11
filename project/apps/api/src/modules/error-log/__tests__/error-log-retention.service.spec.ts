import { Logger } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ErrorLogRetentionService } from '../retention/error-log-retention.service';

// İlgili tüm env anahtarları — her testte temiz başlanır, sonunda geri yüklenir.
const ENV_KEYS = [
  'ERROR_LOG_RETENTION_ENABLED',
  'ERROR_LOG_RETENTION_RESOLVED_DAYS',
  'ERROR_LOG_RETENTION_FRONTEND_DAYS',
  'ERROR_LOG_RETENTION_API_INTERNAL_DAYS',
  'ERROR_LOG_RETENTION_UNRESOLVED_DAYS',
  'ERROR_LOG_RETENTION_BATCH_SIZE',
];

function makePrismaMock() {
  return {
    errorLog: {
      findMany: jest.fn().mockResolvedValue([]),
      deleteMany: jest.fn(({ where }: any) => Promise.resolve({ count: where.id.in.length })),
    },
  };
}

// where → kullanılan cutoff Date (OR[0].<field>.lt).
function cutoffOf(where: any): Date {
  const first = where.OR[0];
  const field = first.lastSeenAt ? 'lastSeenAt' : 'resolvedAt';
  return first[field].lt;
}
function daysAgo(d: Date): number {
  return (Date.now() - d.getTime()) / 86_400_000;
}

describe('ErrorLogRetentionService (PR-6)', () => {
  const original: Record<string, string | undefined> = {};

  beforeAll(() => {
    for (const k of ENV_KEYS) original[k] = process.env[k];
  });
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
  });
  afterAll(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  it('disabled (env yok) → prisma\'ya HİÇ dokunulmaz, no-op', async () => {
    const prisma = makePrismaMock();
    const svc = new ErrorLogRetentionService(prisma as any, { report: jest.fn().mockResolvedValue(undefined) } as any);
    const res = await svc.runRetentionCleanup();
    expect(res).toEqual({ enabled: false, deleted: 0, byCategory: {} });
    expect(prisma.errorLog.findMany).not.toHaveBeenCalled();
    expect(prisma.errorLog.deleteMany).not.toHaveBeenCalled();
  });

  it('enabled → 4 kategori KARŞILIKLI DIŞLAYAN where ile çağrılır', async () => {
    process.env.ERROR_LOG_RETENTION_ENABLED = 'true';
    const prisma = makePrismaMock();
    const svc = new ErrorLogRetentionService(prisma as any, { report: jest.fn().mockResolvedValue(undefined) } as any);
    await svc.runRetentionCleanup();

    expect(prisma.errorLog.findMany).toHaveBeenCalledTimes(4);
    const [unres, feND, apiIntl, fallback] = prisma.errorLog.findMany.mock.calls.map((c: any[]) => c[0].where);

    // 1) unresolved → isResolved:false, KAYNAK FİLTRESİ YOK
    expect(unres.isResolved).toBe(false);
    expect('source' in unres).toBe(false);

    // 2) resolved FRONTEND
    expect(feND.isResolved).toBe(true);
    expect(feND.source).toBe('FRONTEND');

    // 3) resolved API/UYAP/CRON
    expect(apiIntl.isResolved).toBe(true);
    expect(apiIntl.source).toEqual({ in: ['API', 'UYAP', 'CRON'] });

    // 4) resolved fallback (diğer kaynaklar)
    expect(fallback.isResolved).toBe(true);
    expect(fallback.source).toEqual({ notIn: ['FRONTEND', 'API', 'UYAP', 'CRON'] });
  });

  it('K1+K4: unresolved YALNIZ UNRESOLVED_DAYS ile + floor 7 (env=1 → cutoff ~7g, kaynaktan bağımsız)', async () => {
    process.env.ERROR_LOG_RETENTION_ENABLED = 'true';
    process.env.ERROR_LOG_RETENTION_UNRESOLVED_DAYS = '1';
    process.env.ERROR_LOG_RETENTION_FRONTEND_DAYS = '1'; // kısa frontend süresi unresolved'a SIZMAMALI
    const prisma = makePrismaMock();
    const svc = new ErrorLogRetentionService(prisma as any, { report: jest.fn().mockResolvedValue(undefined) } as any);
    await svc.runRetentionCleanup();

    const unresWhere = prisma.errorLog.findMany.mock.calls[0][0].where;
    // unresolved'da kaynak filtresi yok → frontend 1-gün buraya uygulanamaz
    expect('source' in unresWhere).toBe(false);
    // cutoff ~7 gün önce (1 değil) → floor uygulandı, unresolved erken silinmez
    expect(Math.abs(daysAgo(cutoffOf(unresWhere)) - 7)).toBeLessThan(1);
  });

  it('K1: resolved frontend FRONTEND_DAYS · api/internal API_INTERNAL_DAYS · fallback RESOLVED_DAYS', async () => {
    process.env.ERROR_LOG_RETENTION_ENABLED = 'true';
    process.env.ERROR_LOG_RETENTION_FRONTEND_DAYS = '5';
    process.env.ERROR_LOG_RETENTION_API_INTERNAL_DAYS = '20';
    process.env.ERROR_LOG_RETENTION_RESOLVED_DAYS = '10';
    const prisma = makePrismaMock();
    const svc = new ErrorLogRetentionService(prisma as any, { report: jest.fn().mockResolvedValue(undefined) } as any);
    await svc.runRetentionCleanup();

    const [, feND, apiIntl, fallback] = prisma.errorLog.findMany.mock.calls.map((c: any[]) => c[0].where);
    expect(Math.abs(daysAgo(cutoffOf(feND)) - 5)).toBeLessThan(1);
    expect(Math.abs(daysAgo(cutoffOf(apiIntl)) - 20)).toBeLessThan(1);
    expect(Math.abs(daysAgo(cutoffOf(fallback)) - 10)).toBeLessThan(1);
  });

  it('K2: resolved → resolvedAt; yoksa createdAt fallback OR koşulu var', async () => {
    process.env.ERROR_LOG_RETENTION_ENABLED = 'true';
    const prisma = makePrismaMock();
    const svc = new ErrorLogRetentionService(prisma as any, { report: jest.fn().mockResolvedValue(undefined) } as any);
    await svc.runRetentionCleanup();

    const feND = prisma.errorLog.findMany.mock.calls[1][0].where;
    expect(feND.OR[0]).toHaveProperty('resolvedAt.lt');
    expect(feND.OR[1].resolvedAt).toBeNull();
    expect(feND.OR[1]).toHaveProperty('createdAt.lt');

    // unresolved → lastSeenAt; yoksa createdAt
    const unres = prisma.errorLog.findMany.mock.calls[0][0].where;
    expect(unres.OR[0]).toHaveProperty('lastSeenAt.lt');
    expect(unres.OR[1].lastSeenAt).toBeNull();
    expect(unres.OR[1]).toHaveProperty('createdAt.lt');
  });

  it('aktif/yeni kayıt silinmez: cutoff geçmişte ve karşılaştırma strict "lt"', async () => {
    process.env.ERROR_LOG_RETENTION_ENABLED = 'true';
    const prisma = makePrismaMock();
    const svc = new ErrorLogRetentionService(prisma as any, { report: jest.fn().mockResolvedValue(undefined) } as any);
    await svc.runRetentionCleanup();

    const unres = prisma.errorLog.findMany.mock.calls[0][0].where;
    const cutoff = cutoffOf(unres);
    expect(cutoff.getTime()).toBeLessThan(Date.now()); // cutoff geçmişte
    expect(daysAgo(cutoff)).toBeGreaterThan(1); // unresolved en az 7g geride → yeni kayıt güvende
  });

  it('batch size uygulanır: take=batchSize + id-in deleteMany + sınırlı loop', async () => {
    process.env.ERROR_LOG_RETENTION_ENABLED = 'true';
    process.env.ERROR_LOG_RETENTION_BATCH_SIZE = '2';
    const prisma = makePrismaMock();
    // unresolved: ilk batch dolu (2) → 2. çağrı boş → durur; sonraki kategoriler boş
    prisma.errorLog.findMany
      .mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }])
      .mockResolvedValue([]);
    const svc = new ErrorLogRetentionService(prisma as any, { report: jest.fn().mockResolvedValue(undefined) } as any);
    const res = await svc.runRetentionCleanup();

    expect(prisma.errorLog.findMany.mock.calls[0][0].take).toBe(2);
    expect(prisma.errorLog.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a', 'b'] } } });
    expect(res.deleted).toBe(2);
    expect(res.byCategory.unresolved).toBe(2);
  });

  it('exception YUTULUR: findMany patlasa da reject etmez, app düşmez', async () => {
    process.env.ERROR_LOG_RETENTION_ENABLED = 'true';
    const prisma = makePrismaMock();
    prisma.errorLog.findMany.mockRejectedValue(new Error('db kaboom'));
    const svc = new ErrorLogRetentionService(prisma as any, { report: jest.fn().mockResolvedValue(undefined) } as any);
    await expect(svc.runRetentionCleanup()).resolves.toMatchObject({ enabled: true });
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// KR-20: saklama süresi temizliği BAŞARISIZ olduğunda sunucu günlüğü
// ─────────────────────────────────────────────────────────────────────────────────────────────

/** Sentetik gizli değerler: bağlantı adresi (kullanıcı + parola), işaret ve sahte günlük satırı (satır sonu). */
const GIZLI_BAGLANTI = 'postgresql://kr20_kullanici:Kr20-Parola-4b7d@kr20-db-sunucu:6543/kr20_veritabani?sslmode=require';
const GIZLI_ISARET = 'Bearer KR20-GIZLI-ISARET-51ce0a9f';
const SAHTE_SATIR = '\n[Nest] 4242  - ERROR [Sahte] kr20-sahte-gunluk-satiri';
const GIZLI_METIN = `Can't reach database server at ${GIZLI_BAGLANTI} ${GIZLI_ISARET}${SAHTE_SATIR}`;
const GIZLI_KALIP = /kr20_kullanici|Kr20-Parola|kr20-db-sunucu|:6543|kr20_veritabani|postgresql:|KR20-GIZLI-ISARET|Bearer|kr20-sahte-gunluk-satiri|Sahte|Can't reach|sslmode/;

const prismaKnown = (code: string) =>
  new Prisma.PrismaClientKnownRequestError(GIZLI_METIN, { code, clientVersion: 'test', meta: { target: GIZLI_BAGLANTI } });
const plainErrorWithEverything = () => {
  const e: any = new Error(GIZLI_METIN);
  e.cause = new Error(GIZLI_METIN);
  e.name = `AdHata ${GIZLI_ISARET}`;
  e.code = `P1001${SAHTE_SATIR}`;
  e.meta = { url: GIZLI_BAGLANTI };
  e.stack = `Error: ${GIZLI_METIN}\n    at sil (${GIZLI_BAGLANTI})`;
  return e;
};

/** [ad, fırlatılan değer, günlüğe yazılması beklenen TAM satır] */
const RETENTION_FAILURES: Array<[string, () => unknown, string]> = [
  ['Prisma bilinen istek hatası, listedeki kod (P1001)', () => prismaKnown('P1001'), 'error-log retention cleanup failed (kind=PrismaClientKnownRequestError code=P1001)'],
  ['Prisma bilinen istek hatası, SERBEST METİN kod (gizli değer + satır sonu)', () => prismaKnown(`P1001 ${GIZLI_ISARET}${SAHTE_SATIR}`), 'error-log retention cleanup failed (kind=PrismaClientKnownRequestError code=unknown)'],
  ['Prisma başlatma hatası, kodsuz', () => new Prisma.PrismaClientInitializationError(GIZLI_METIN, 'test'), 'error-log retention cleanup failed (kind=PrismaClientInitializationError code=unknown)'],
  ['Prisma bilinmeyen istek hatası', () => new Prisma.PrismaClientUnknownRequestError(GIZLI_METIN, { clientVersion: 'test' }), 'error-log retention cleanup failed (kind=PrismaClientUnknownRequestError)'],
  ['düz Error: gizli message + stack + cause + meta, serbest metin name ve code', plainErrorWithEverything, 'error-log retention cleanup failed (kind=Error)'],
  ['Prisma sınıfı OLMAYAN nesne: name / code / message gizli değer taşır', () => ({ name: 'PrismaClientKnownRequestError', code: 'P1001', message: GIZLI_METIN }), 'error-log retention cleanup failed (kind=unknown)'],
  ['fırlatılan düz metin (gizli değer)', () => GIZLI_METIN, 'error-log retention cleanup failed (kind=unknown)'],
];

describe('ErrorLogRetentionService — başarısızlık günlüğü (KR-20): ham hata nesnesi / ileti / yığın günlüğe gitmez', () => {
  const original: Record<string, string | undefined> = {};
  beforeAll(() => {
    for (const k of ENV_KEYS) original[k] = process.env[k];
  });
  beforeEach(() => {
    for (const k of ENV_KEYS) delete process.env[k];
    process.env.ERROR_LOG_RETENTION_ENABLED = 'true';
  });
  afterAll(() => {
    for (const k of ENV_KEYS) {
      if (original[k] === undefined) delete process.env[k];
      else process.env[k] = original[k];
    }
  });

  const failingService = (thrown: unknown) => {
    const prisma = makePrismaMock();
    prisma.errorLog.findMany.mockRejectedValue(thrown);
    const report = jest.fn().mockResolvedValue(undefined);
    return { svc: new ErrorLogRetentionService(prisma as any, { report } as any), prisma, report };
  };

  it.each(RETENTION_FAILURES)('günlük ÇAĞRISI — %s → tek argüman, sabit satır', async (_ad, make, expected) => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const { svc } = failingService(make());
      await expect(svc.runRetentionCleanup()).resolves.toMatchObject({ enabled: true, deleted: 0 });
      expect(error).toHaveBeenCalledTimes(1);
      // TEK argüman: ikinci argüman (ham hata nesnesi / yığın) YOK
      expect(error.mock.calls[0]).toEqual([expected]);
      expect(JSON.stringify(error.mock.calls)).not.toMatch(GIZLI_KALIP);
    } finally {
      error.mockRestore();
    }
  });

  it.each(RETENTION_FAILURES)('GERÇEK günlükçü ÇIKTISI — %s → çıktıda sabit satır var, gizli değer / ek satır yok', async (_ad, make, expected) => {
    const chunks: string[] = [];
    const capture = (chunk: unknown) => { chunks.push(typeof chunk === 'string' ? chunk : Buffer.from(chunk as Uint8Array).toString('utf8')); return true; };
    const stderr = jest.spyOn(process.stderr, 'write').mockImplementation(capture as any);
    const stdout = jest.spyOn(process.stdout, 'write').mockImplementation(capture as any);
    let output = '';
    try {
      const { svc } = failingService(make());
      await expect(svc.runRetentionCleanup()).resolves.toMatchObject({ enabled: true });
    } finally {
      stderr.mockRestore();
      stdout.mockRestore();
      output = chunks.join('');
    }
    // pozitif kanıt: yakalama GERÇEKTEN çalıştı — sabit satır çıktıda
    expect(output).toContain(expected);
    expect(output).not.toMatch(GIZLI_KALIP);
    // günlükçü başarısızlık için TEK satır üretti (ham nesne / ileti için ikinci satır yok); başlangıç bilgi satırı sayılmaz
    const lines = output.split('\n').filter((line) => line.trim().length > 0 && !line.includes('Hata logu retention temizliği başladı.'));
    expect(lines).toHaveLength(1);
  });

  it('hata sonrası akış DEĞİŞMEDİ: ilk kategori silinir, ikincide hata → kalan kategoriler ÇALIŞMAZ, tekrar yok, kısmi sayı döner, bildirim BİR kez (aynı hata nesnesiyle)', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      // parti boyutu 1: ilk kategori iki okumayla (1 satır + boş) biter; üçüncü okuma İKİNCİ kategorinin ilk okumasıdır
      process.env.ERROR_LOG_RETENTION_BATCH_SIZE = '1';
      const thrown = prismaKnown('P2024');
      const prisma = makePrismaMock();
      prisma.errorLog.findMany
        .mockResolvedValueOnce([{ id: 'a' }]) // 1. kategori, 1. tur
        .mockResolvedValueOnce([]) // 1. kategori biter
        .mockRejectedValueOnce(thrown); // 2. kategoride hata
      const report = jest.fn().mockResolvedValue(undefined);
      const svc = new ErrorLogRetentionService(prisma as any, { report } as any);
      const res = await svc.runRetentionCleanup();
      expect(res).toEqual({ enabled: true, deleted: 1, byCategory: { unresolved: 1, resolvedFrontend: 0, resolvedApiInternal: 0, resolvedFallback: 0 } });
      // hatadan sonra ek okuma / silme / yeniden deneme YOK: üçüncü ve dördüncü kategori HİÇ çalışmaz
      expect(prisma.errorLog.findMany).toHaveBeenCalledTimes(3);
      expect(prisma.errorLog.findMany.mock.calls[2][0].where.source).toBe('FRONTEND');
      expect(prisma.errorLog.deleteMany).toHaveBeenCalledTimes(1);
      expect(prisma.errorLog.deleteMany).toHaveBeenCalledWith({ where: { id: { in: ['a'] } } });
      // zamanlanmış iş bildirimi yolu DEĞİŞMEDİ: bir kez, aynı hata nesnesiyle
      expect(report).toHaveBeenCalledTimes(1);
      expect(report.mock.calls[0][0]).toMatchObject({ source: 'CRON', operation: 'errorLogRetention.handleCron' });
      expect(report.mock.calls[0][0].error).toBe(thrown);
      expect(error.mock.calls).toEqual([['error-log retention cleanup failed (kind=PrismaClientKnownRequestError code=P2024)']]);
    } finally {
      error.mockRestore();
    }
  });

  it('başarı davranışı DEĞİŞMEDİ: hata satırı ve bildirim yok; kapalıyken de yok', async () => {
    const error = jest.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const prisma = makePrismaMock();
      prisma.errorLog.findMany.mockResolvedValueOnce([{ id: 'a' }, { id: 'b' }]).mockResolvedValue([]);
      const report = jest.fn().mockResolvedValue(undefined);
      const res = await new ErrorLogRetentionService(prisma as any, { report } as any).runRetentionCleanup();
      expect(res).toMatchObject({ enabled: true, deleted: 2 });
      expect(prisma.errorLog.deleteMany).toHaveBeenCalledTimes(1);
      expect(error).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();

      delete process.env.ERROR_LOG_RETENTION_ENABLED;
      const off = makePrismaMock();
      const offRes = await new ErrorLogRetentionService(off as any, { report } as any).runRetentionCleanup();
      expect(offRes).toEqual({ enabled: false, deleted: 0, byCategory: {} });
      expect(off.errorLog.findMany).not.toHaveBeenCalled();
      expect(error).not.toHaveBeenCalled();
      expect(report).not.toHaveBeenCalled();
    } finally {
      error.mockRestore();
    }
  });
});

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
    const svc = new ErrorLogRetentionService(prisma as any);
    const res = await svc.runRetentionCleanup();
    expect(res).toEqual({ enabled: false, deleted: 0, byCategory: {} });
    expect(prisma.errorLog.findMany).not.toHaveBeenCalled();
    expect(prisma.errorLog.deleteMany).not.toHaveBeenCalled();
  });

  it('enabled → 4 kategori KARŞILIKLI DIŞLAYAN where ile çağrılır', async () => {
    process.env.ERROR_LOG_RETENTION_ENABLED = 'true';
    const prisma = makePrismaMock();
    const svc = new ErrorLogRetentionService(prisma as any);
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
    const svc = new ErrorLogRetentionService(prisma as any);
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
    const svc = new ErrorLogRetentionService(prisma as any);
    await svc.runRetentionCleanup();

    const [, feND, apiIntl, fallback] = prisma.errorLog.findMany.mock.calls.map((c: any[]) => c[0].where);
    expect(Math.abs(daysAgo(cutoffOf(feND)) - 5)).toBeLessThan(1);
    expect(Math.abs(daysAgo(cutoffOf(apiIntl)) - 20)).toBeLessThan(1);
    expect(Math.abs(daysAgo(cutoffOf(fallback)) - 10)).toBeLessThan(1);
  });

  it('K2: resolved → resolvedAt; yoksa createdAt fallback OR koşulu var', async () => {
    process.env.ERROR_LOG_RETENTION_ENABLED = 'true';
    const prisma = makePrismaMock();
    const svc = new ErrorLogRetentionService(prisma as any);
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
    const svc = new ErrorLogRetentionService(prisma as any);
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
    const svc = new ErrorLogRetentionService(prisma as any);
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
    const svc = new ErrorLogRetentionService(prisma as any);
    await expect(svc.runRetentionCleanup()).resolves.toMatchObject({ enabled: true });
  });
});

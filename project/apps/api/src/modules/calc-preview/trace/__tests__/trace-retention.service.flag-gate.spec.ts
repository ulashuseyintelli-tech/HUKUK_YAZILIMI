/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F06-DORMANT-ASYNC-SUBTREE-DISPOSITION-R01.
 *
 * CALC-PREVIEW-TRACE-RETENTION disposition: ACTIVATE_FLAG_GATED (bkz.
 * `common/dormant-subtree-registry.ts`). `TraceRetentionService` daha önce
 * `calc-preview.module.ts` providers listesinde HİÇ yoktu — DI hiç instantiate
 * etmiyordu, yapıcıdaki `startCleanupTimer()` hiç çağrılmıyordu. Artık DI'a
 * bağlıdır (bkz. `calc-preview.module.ts`); gerçek periyodik çalışma
 * TRACE_RETENTION_ENABLED (varsayılan kapalı) ile gate'lidir.
 *
 * NOT (kapsam dışı bulgu, burada DÜZELTİLMEDİ): `runCleanup()`/`cleanupTenant()`
 * süresi geçen trace'leri yalnız SAYAR, `storage`'dan gerçekten SİLMEZ (kod
 * içi yorum: "would need storage.delete method"). Bu, servisin KENDİ mevcut
 * implementasyonundaki önceden var olan bir eksikliktir — yeni bir iş yeteneği
 * icat etmek bu task'ın kapsamı DIŞINDADIR (section 18); testler bu gerçek
 * davranışı OLDUĞU GİBİ doğrular, "silme çalışıyor" iddia ETMEZ.
 */
import { TraceRetentionService } from '../trace-retention.service';
import { TraceStorageService } from '../trace-storage.service';
import { TraceBundle } from '../trace.types';

function makeTrace(overrides: Partial<TraceBundle['meta']> & { severity?: string } = {}): TraceBundle {
  const { severity, ...metaOverrides } = overrides;
  return {
    meta: {
      tenantId: 'tenant-1',
      startedAt: new Date().toISOString(),
      ...metaOverrides,
    },
    ...(severity ? { shadowCompare: { severity } } : {}),
  } as unknown as TraceBundle;
}

describe('W3-F06 — TraceRetentionService flag-gate (ACTIVATE_FLAG_GATED)', () => {
  const ORIGINAL_FLAG = process.env.TRACE_RETENTION_ENABLED;
  let setIntervalSpy: jest.SpyInstance;

  beforeEach(() => {
    setIntervalSpy = jest.spyOn(global, 'setInterval');
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
    if (ORIGINAL_FLAG === undefined) delete process.env.TRACE_RETENTION_ENABLED;
    else process.env.TRACE_RETENTION_ENABLED = ORIGINAL_FLAG;
  });

  it('[A] flag eksik (varsayılan): constructor cleanup timer BAŞLATMAZ (mevcut/önceki davranış korunur)', () => {
    delete process.env.TRACE_RETENTION_ENABLED;
    const mockStorage = { query: jest.fn().mockReturnValue([]) } as unknown as TraceStorageService;
    const svc = new TraceRetentionService(mockStorage);
    expect(setIntervalSpy).not.toHaveBeenCalled();
    svc.onModuleDestroy(); // guvenli: hic timer yokken de temiz calismali
  });

  it('[B] flag="false": constructor cleanup timer BAŞLATMAZ', () => {
    process.env.TRACE_RETENTION_ENABLED = 'false';
    const mockStorage = { query: jest.fn().mockReturnValue([]) } as unknown as TraceStorageService;
    new TraceRetentionService(mockStorage);
    expect(setIntervalSpy).not.toHaveBeenCalled();
  });

  it('[C] flag="true": constructor cleanup timer BAŞLATIR (bilinçli olarak açılabilir)', () => {
    process.env.TRACE_RETENTION_ENABLED = 'true';
    const mockStorage = { query: jest.fn().mockReturnValue([]) } as unknown as TraceStorageService;
    const svc = new TraceRetentionService(mockStorage);
    expect(setIntervalSpy).toHaveBeenCalledTimes(1);
    svc.onModuleDestroy(); // acilan timer'i temizle (jest process leak onlemi)
  });

  it('[D] runCleanup(): süresi geçen trace SAYILIR ama storage.query dışında hiçbir storage metodu ÇAĞRILMAZ (silme YOK — mevcut stub davranışı)', async () => {
    delete process.env.TRACE_RETENTION_ENABLED;
    const veryOld = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString(); // 60 gun once
    const mockStorage = {
      query: jest.fn().mockReturnValue([makeTrace({ startedAt: veryOld, severity: 'NOISE' })]),
    } as unknown as TraceStorageService;
    const svc = new TraceRetentionService(mockStorage);

    const result = await svc.runCleanup();

    expect(result.deleted).toBe(1);
    expect(result.exported).toBe(0);
    // storage nesnesinde query DISINDA hicbir metod cagrilmadi (cunku yok) —
    // mock yalniz `query` tasidigi icin baska bir cagri denemesi zaten
    // TypeError firlatirdi; bu test bunun sessizce basarili tamamlandigini kanitlar.
    expect(mockStorage.query).toHaveBeenCalled();
  });

  it('[E] runCleanup(): CRITICAL severity suresi gecince export kuyruguna eklenir (mevcut sozlesme, degistirilmedi)', async () => {
    delete process.env.TRACE_RETENTION_ENABLED;
    const veryOld = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();
    const mockStorage = {
      query: jest.fn().mockReturnValue([makeTrace({ startedAt: veryOld, severity: 'CRITICAL' })]),
    } as unknown as TraceStorageService;
    const svc = new TraceRetentionService(mockStorage);

    const result = await svc.runCleanup();

    expect(result.exported).toBe(1);
    expect(svc.getExportQueue()).toHaveLength(1);
  });

  it('[F] onModuleDestroy(): flag=true iken acilan timer temiz kapanir (ikinci cagri guvenli)', () => {
    process.env.TRACE_RETENTION_ENABLED = 'true';
    const mockStorage = { query: jest.fn().mockReturnValue([]) } as unknown as TraceStorageService;
    const svc = new TraceRetentionService(mockStorage);
    svc.onModuleDestroy();
    expect(() => svc.onModuleDestroy()).not.toThrow();
  });
});

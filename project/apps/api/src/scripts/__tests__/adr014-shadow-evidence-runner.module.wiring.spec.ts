/**
 * ADR-014 shadow evidence runner kökünün DI grafiği gerçekten kurulabiliyor mu?
 *
 * Bu spec olmadan runner kökü (#1159, 2026-07-17) sessizce çürüdü: sonradan eklenen global
 * sağlayıcı bağımlılıkları yalnız AppModule'de kayıtlıydı ve runner hiç bağlam kuramadı.
 * Sağlayıcı override'ı YOK — gerçek modül grafiği derlenir. Ayrıca DI düzeldikten sonra ortaya
 * çıkan ikinci halka (kaçışsız `repeatable read` options'ı → bağlantı FATAL) kilitlenir.
 */

// CaseModule -> case.controller -> ocr.service `pdf-poppler`'ı yükleme anında require eder;
// paket Linux'ta process.exit(1) verir. Hoisted mock gerçek modülün require edilmesini engeller
// (CI kanıtlı emsal: collection/__tests__/receipt-public-entrypoints-authorization.contract.spec.ts).
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { Test, TestingModule } from '@nestjs/testing';
import { ConfigModule } from '@nestjs/config';
import { Adr014ShadowEvidenceRunnerModule } from '../adr014-shadow-evidence-runner.module';
import { buildReadOnlyDatabaseUrl } from '../adr014-local-shadow-evidence-runner';
import { BalanceDisplayShadowDiffService } from '../../modules/balance-display-shadow-diff/balance-display-shadow-diff.service';
import { BalanceDisplayShadowDiffModule } from '../../modules/balance-display-shadow-diff/balance-display-shadow-diff.module';
import { StorageModule } from '../../common/storage/storage.module';
import { ErrorLogModule } from '../../modules/error-log/error-log.module';
import { MetricsRegistryModule } from '../../modules/metrics-registry/metrics-registry.module';
import { PrismaService } from '../../prisma/prisma.service';

describe('ADR-014 shadow evidence runner kökü — DI bağlantısı', () => {
  let moduleRef: TestingModule | undefined;

  afterEach(async () => {
    await moduleRef?.close();
    moduleRef = undefined;
  });

  it("gerçek modül grafiği derlenir; runner'ın kullandığı servisler çözülür", async () => {
    moduleRef = await Test.createTestingModule({
      imports: [Adr014ShadowEvidenceRunnerModule],
    }).compile();

    expect(moduleRef.get(BalanceDisplayShadowDiffService)).toBeInstanceOf(BalanceDisplayShadowDiffService);
    expect(moduleRef.get(PrismaService, { strict: false })).toBeInstanceOf(PrismaService);
  });

  it("AppModule'deki dört global kaydı taşır; ScheduleModule taşımaz (runner cron başlatmaz)", async () => {
    const imports: unknown[] = Reflect.getMetadata('imports', Adr014ShadowEvidenceRunnerModule) ?? [];
    // ConfigModule.forRoot() Promise<DynamicModule> döndürür; Nest de import'u böyle çözer.
    const resolved = await Promise.all(imports.map((x) => Promise.resolve(x)));
    const moduleOf = (x: unknown) =>
      x && typeof x === 'object' && 'module' in (x as object) ? (x as { module: unknown }).module : x;
    const roots = resolved.map(moduleOf);

    expect(roots).toContain(ConfigModule);
    expect(roots).toContain(StorageModule);
    expect(roots).toContain(ErrorLogModule);
    expect(roots).toContain(MetricsRegistryModule);
    expect(roots).toContain(BalanceDisplayShadowDiffModule);
    expect(roots.map((m) => (m as { name?: string })?.name)).not.toContain('ScheduleModule');
  });

  it('read-only options: `repeatable read` boşluğu kaçışlı; mevcut options korunur', () => {
    // Kaçışsız boşlukta Postgres `repeatable` görür ve bağlantıyı FATAL ile reddeder
    // (izole gate DB'de ölçüldü). Değer URL'den geri okunarak sınanır.
    const withExisting = new URL(buildReadOnlyDatabaseUrl('postgresql://u@127.0.0.1:5432/x_gate_test?options=-c%20search_path%3Dpublic'));
    expect(withExisting.searchParams.get('options')).toBe(
      '-c search_path=public -c default_transaction_read_only=on -c default_transaction_isolation=repeatable\\ read',
    );
    const bare = new URL(buildReadOnlyDatabaseUrl('postgresql://u@127.0.0.1:5432/x_gate_test'));
    expect(bare.searchParams.get('options')).toContain('default_transaction_isolation=repeatable\\ read');
  });
});

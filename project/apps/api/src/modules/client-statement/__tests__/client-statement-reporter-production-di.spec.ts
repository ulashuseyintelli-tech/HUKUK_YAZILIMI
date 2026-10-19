import 'reflect-metadata';
import * as path from 'node:path';
import * as ts from 'typescript';
import { Module } from '@nestjs/common';
import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../prisma/prisma.service';
import { ErrorLogModule } from '../../error-log/error-log.module';
import { ErrorLogService } from '../../error-log/error-log.service';
import { IntegrationErrorReporter } from '../../error-log/integration-error-reporter';
import type { ClientStatementMonthlyDeliveryService } from '../client-statement-monthly-delivery.service';

/**
 * K18 / DV-209: Jest'in isolatedModules donusumu uretim DI metadatasinin kaniti degildir.
 * Hedefi gercek uretim typechecker'i ile bellekte emit et; bu JS'i gercek Nest'e ver.
 * Is servisleri inerttir; gercek reporter/ErrorLogService yalniz bellek sink'ine yazar.
 * AppModule/init/cron, DB baglantisi ve provider cagrisi yoktur.
 */
function loadProductionService() {
  const api = path.resolve(__dirname, '../../../..');
  const configPath = path.join(api, 'tsconfig.prod.json');
  const config = ts.readConfigFile(configPath, ts.sys.readFile);
  if (config.error) throw new Error(ts.flattenDiagnosticMessageText(config.error.messageText, '\n'));
  const parsed = ts.parseJsonConfigFileContent(config.config, ts.sys, api);
  expect(parsed.errors).toHaveLength(0);
  expect(parsed.options.emitDecoratorMetadata).toBe(true);
  expect(parsed.options.experimentalDecorators).toBe(true);
  expect(parsed.options.isolatedModules).not.toBe(true);
  const filename = path.resolve(__dirname, '../client-statement-monthly-delivery.service.ts');
  const program = ts.createProgram(parsed.fileNames, { ...parsed.options, incremental: false });
  const source = program.getSourceFile(filename)!;
  expect(source).toBeDefined();
  const diagnostics = [...program.getSyntacticDiagnostics(source), ...program.getSemanticDiagnostics(source)];
  expect(diagnostics.map(item => ts.flattenDiagnosticMessageText(item.messageText, '\n'))).toEqual([]);
  let javascript = '';
  const result = program.emit(source, (name, contents) => {
    if (name.endsWith('.js')) javascript = contents;
  });
  expect(result.emitSkipped).toBe(false);
  expect(result.diagnostics).toHaveLength(0);
  expect(javascript).not.toBe('');
  const compiled = { exports: {} as typeof import('../client-statement-monthly-delivery.service') };
  // Only the trusted production output is evaluated. Dependencies use Jest's real
  // module graph so Nest class tokens have exactly one identity; no imports are mocked.
  const load = new Function('require', 'module', 'exports', javascript);
  load((name: string) => require(name.startsWith('.') ? path.resolve(path.dirname(filename), name) : name), compiled, compiled.exports);
  return compiled.exports;
}

describe('K18 — uretim metadata ve gercek Nest reporter DI', () => {
  let production: ReturnType<typeof loadProductionService>;
  let tokens: any[];
  let ledgerToken: string;
  const modules: TestingModule[] = [];
  const upsert = jest.fn().mockResolvedValue({ id: 'k18-in-memory-error' });
  const markFailed = jest.fn().mockResolvedValue(undefined);
  const prisma = Object.freeze({ errorLog: Object.freeze({ upsert }) });

  beforeAll(() => {
    production = loadProductionService();
    tokens = Reflect.getMetadata('design:paramtypes', production.ClientStatementMonthlyDeliveryService);
    ledgerToken = Reflect.getMetadata('self:paramtypes', production.ClientStatementMonthlyDeliveryService)
      .find((item: any) => item.index === 6).param;
  }, 30_000);

  beforeEach(() => jest.clearAllMocks());
  afterEach(async () => {
    for (const module of modules.splice(0)) await module.close();
  });

  async function build(withReporter = true, omitRequired = false) {
    const required = tokens.slice(0, 4).map(token => ({ provide: token, useValue: Object.freeze({}) }));
    @Module({
      providers: [
        ...(omitRequired ? required.filter(item => item.provide !== tokens[1]) : required),
        { provide: ledgerToken, useValue: { markFailed } },
        production.ClientStatementMonthlyDeliveryService,
      ],
      exports: [production.ClientStatementMonthlyDeliveryService],
    })
    class ProbeModule {}
    const module = await Test.createTestingModule({ imports: [...(withReporter ? [ErrorLogModule] : []), ProbeModule] })
      .overrideProvider(PrismaService).useValue(prisma).compile();
    modules.push(module);
    return module;
  }

  async function fail(service: ClientStatementMonthlyDeliveryService, attempts: number) {
    await (service as any).recordDeliveryFailure(
      'tenant-k18', 'dedupe-k18', { attempts }, 'isolated delivery failure', new Date('2026-10-18T00:00:00Z'),
    );
    await new Promise<void>(resolve => setImmediate(resolve));
  }

  it('uretim metadata reporter sinif tokenini korur; Function olmaz', () => {
    expect(tokens).toHaveLength(8);
    expect(tokens[7]).toBe(IntegrationErrorReporter);
    expect(tokens[7]).not.toBe(Function);
    expect(Reflect.getMetadata('optional:paramtypes', production.ClientStatementMonthlyDeliveryService)).toContain(7);
  });

  it('gercek global ErrorLogModule reporterini hedefe enjekte eder', async () => {
    const module = await build();
    const reporter = module.get(IntegrationErrorReporter);
    expect(reporter).toBeInstanceOf(IntegrationErrorReporter);
    expect(module.get(ErrorLogService)).toBeInstanceOf(ErrorLogService);
    expect((module.get(production.ClientStatementMonthlyDeliveryService) as any).errorReporter).toBe(reporter);
  });

  it('terminal hata deftere ve gercek reporter uzerinden merkezi bellek kaydina ulasir', async () => {
    const module = await build();
    await fail(module.get(production.ClientStatementMonthlyDeliveryService), 3);
    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(markFailed).toHaveBeenCalledWith('dedupe-k18', 3, 'isolated delivery failure', expect.any(Date));
    expect(upsert).toHaveBeenCalledTimes(1);
    expect(upsert.mock.calls[0][0].create).toMatchObject({
      tenantId: 'tenant-k18', source: 'CRON', endpoint: production.CLIENT_STATEMENT_MONTHLY_JOB_ID,
      metadata: { outcome: 'FAILED_TERMINAL', reasonCode: 'STATEMENT_DELIVERY_TERMINAL_FAILURE' },
    });
  });

  it('terminal olmayan hata deftere islenir; merkezi terminal raporu uretmez', async () => {
    const module = await build();
    await fail(module.get(production.ClientStatementMonthlyDeliveryService), 1);
    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('reporter olmayan modullerde mevcut opsiyonel bagimlilik davranisini korur', async () => {
    const module = await build(false);
    const service = module.get(production.ClientStatementMonthlyDeliveryService);
    expect((service as any).errorReporter).toBeUndefined();
    await fail(service, 3);
    expect(markFailed).toHaveBeenCalledTimes(1);
    expect(upsert).not.toHaveBeenCalled();
  });

  it('zorunlu is servisi eksikse gercek Nest cozumlemesi reddeder', async () => {
    await expect(build(true, true)).rejects.toThrow(/ClientStatementService/);
  });
});

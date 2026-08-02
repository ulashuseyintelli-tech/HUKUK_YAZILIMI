/**
 * RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F06-DORMANT-ASYNC-SUBTREE-DISPOSITION-R01.
 *
 * CALC-PREVIEW-CHAOS disposition: KEEP_DORMANT_CONFIG_GATED (bkz.
 * `common/dormant-subtree-registry.ts`). Bu dosya, ChaosModule'un default/off
 * durumunda GERÇEKTEN sıfır saldırı yüzeyi (controllers=[]/providers=[]/exports=[])
 * ürettiğini kanıtlar — daha önce bu modül için hiç test yoktu.
 *
 * `IS_PRODUCTION`/`CHAOS_ENABLED` sabitleri modül YÜKLENME anında `process.env`'den
 * hesaplandığı için (parametrik değil), her senaryo `jest.resetModules()` +
 * `process.env` set + fresh `require()` ile izole edilir.
 */

const MODULE_PATH = '../chaos.module';

function freshChaosModule(env: { NODE_ENV?: string; ENABLE_CHAOS_ENDPOINTS?: string }) {
  jest.resetModules();
  const prevNodeEnv = process.env.NODE_ENV;
  const prevChaosFlag = process.env.ENABLE_CHAOS_ENDPOINTS;
  if (env.NODE_ENV === undefined) delete process.env.NODE_ENV;
  else process.env.NODE_ENV = env.NODE_ENV;
  if (env.ENABLE_CHAOS_ENDPOINTS === undefined) delete process.env.ENABLE_CHAOS_ENDPOINTS;
  else process.env.ENABLE_CHAOS_ENDPOINTS = env.ENABLE_CHAOS_ENDPOINTS;

  let ChaosModule: typeof import('../chaos.module').ChaosModule;
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    ChaosModule = require(MODULE_PATH).ChaosModule;
  } finally {
    if (prevNodeEnv === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = prevNodeEnv;
    if (prevChaosFlag === undefined) delete process.env.ENABLE_CHAOS_ENDPOINTS;
    else process.env.ENABLE_CHAOS_ENDPOINTS = prevChaosFlag;
  }
  return ChaosModule;
}

describe('W3-F06 — CALC-PREVIEW-CHAOS off-state kanıtı (KEEP_DORMANT_CONFIG_GATED)', () => {
  afterEach(() => {
    jest.resetModules();
  });

  it('[A] NODE_ENV=production: ENABLE_CHAOS_ENDPOINTS=true olsa DAHİ sıfır saldırı yüzeyi', () => {
    const ChaosModule = freshChaosModule({ NODE_ENV: 'production', ENABLE_CHAOS_ENDPOINTS: 'true' });
    const dyn = ChaosModule.forRoot();
    expect(dyn.controllers).toEqual([]);
    expect(dyn.providers).toEqual([]);
    expect(dyn.exports).toEqual([]);
  });

  it('[B] non-production + ENABLE_CHAOS_ENDPOINTS eksik: default OFF, sıfır saldırı yüzeyi', () => {
    const ChaosModule = freshChaosModule({ NODE_ENV: 'test' });
    const dyn = ChaosModule.forRoot();
    expect(dyn.controllers).toEqual([]);
    expect(dyn.providers).toEqual([]);
    expect(dyn.exports).toEqual([]);
  });

  it('[C] non-production + ENABLE_CHAOS_ENDPOINTS=false: sıfır saldırı yüzeyi', () => {
    const ChaosModule = freshChaosModule({ NODE_ENV: 'test', ENABLE_CHAOS_ENDPOINTS: 'false' });
    const dyn = ChaosModule.forRoot();
    expect(dyn.controllers).toEqual([]);
    expect(dyn.providers).toEqual([]);
    expect(dyn.exports).toEqual([]);
  });

  it('[D] non-production + ENABLE_CHAOS_ENDPOINTS=true: mekanizma bilinçli olarak açılabilir (tasarım gereği)', () => {
    const ChaosModule = freshChaosModule({ NODE_ENV: 'test', ENABLE_CHAOS_ENDPOINTS: 'true' });
    const dyn = ChaosModule.forRoot();
    expect(dyn.controllers?.length).toBeGreaterThan(0);
    expect(dyn.providers?.length).toBeGreaterThan(0);
  });

  it('[E] forTesting(): ortamdan bağımsız her zaman full modül döner (mevcut sözleşme korunur)', () => {
    const ChaosModule = freshChaosModule({ NODE_ENV: 'production' });
    const dyn = ChaosModule.forTesting();
    expect(dyn.controllers?.length).toBeGreaterThan(0);
    expect(dyn.providers?.length).toBeGreaterThan(0);
  });

  it('[F] app.module.ts ChaosModule.forRoot()/.forTesting() İÇİN import EDİLMEZ (W3-F06: hâlâ unbound)', () => {
    const { readFileSync } = require('fs');
    const { join } = require('path');
    const appModuleSrc: string = readFileSync(
      join(__dirname, '..', '..', '..', '..', 'app.module.ts'),
      'utf8',
    );
    expect(/ChaosModule\.(forRoot|forTesting)\s*\(/.test(appModuleSrc)).toBe(false);
    expect(/^\s*import[^\n]*ChaosModule/m.test(appModuleSrc)).toBe(false);
  });
});

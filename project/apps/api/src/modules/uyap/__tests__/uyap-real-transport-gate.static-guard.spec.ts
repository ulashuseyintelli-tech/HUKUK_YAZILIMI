/**
 * UYAP GERÇEK TAŞIMA KAPISI — STATİK KORUMA KİLİDİ (owner kararı 10, 2026-10-05).
 *
 * Koşul: "Gerçek taşımanın politika ve vekalet kontrolleri tamamlanmadan etkinleştirilememesi." Bu test o koşulu KAYNAK düzeyinde
 * korur: UYAP modülüne gerçek bir ağ / taşıma ilkeli kapısız bağlanırsa, taşıma açma anahtarı eklenirse, uykudaki resmî gönderim
 * hattı üretime bağlanırsa ya da bugünkü sahte taşımanın doğruluk işareti düşerse CI kırmızıya döner.
 *
 * ## BU TEST NE DEĞİLDİR (sınır — okumadan geçme)
 * Bu bir STATİK (kaynak tarayan) testtir. **Runtime yetki açığını KAPATMAZ.** Bugün AÇIK olan ürün işi (bu testin kapsamı DIŞINDA):
 *  - `submitDocument` / `submitCriminalComplaint` / `submitCivilLawsuit` ve `POST /uyap/xml/submit/:caseId` politika motorunu
 *    (CasePolicyEngine) ÇAĞIRMIYOR; yalnız `assertUyapLegalAuthority` (dosya sahipliği + vekalet) çalışıyor.
 *  - `validateCasePoaForUyap` müvekkil ya da avukat BOŞKEN `isValid: true` döner (vekalet denetimi hiç çalışmaz).
 *  - `UyapController` yalnız `JwtAuthGuard` taşır; `CpeRequiredGuard` bağlı değil (`@CpeRequired` yalnız işarettir).
 *  - Vekalet politikası ve gerçek gönderim uygulaması bu işin DIŞINDADIR (owner kararı 10).
 * Bu testin yakaladığı tek şey: gerçek taşımanın bu açıklar kapanmadan KAPISIZ bağlanması.
 *
 * ## Bugünkü sahte taşımanın sınırı (kayıt)
 * REAL-TRANSPORT = 0. UYAP modülünde ağ çağrısı yoktur (13 `[STUB]` yöntemi: sendPaymentOrder, pushHacizRequest, submitDocument,
 * submitCriminalComplaint, submitCivilLawsuit, checkTebligatStatus, verifyUserEsignature, fetchCaseFromUyap, queryCaseStatus,
 * queryDebtorAssets, checkMtsStatus, checkConnection, queryRelatedLawsuitStatus; "TODO: Gerçek UYAP SOAP çağrısı" yorumları).
 * Beş gönderim yöntemi başarıda `STUB_TRANSPORT_TRUTH` taşır: simulated=true, dispatched=false, providerAccepted=false,
 * legalEffectConfirmed=false; yerel `UyapRequestLog` yazılır; `evkNo` doldurulmaz (`stubReference`). Resmî DTD hattı
 * (`official/official-dormant-dispatch.ts`) UYKUDADIR: `UYAP_DORMANT_DISPATCH_ENABLED = false` (env ile açılamaz), provider kaydı
 * YOKTUR, üretim kodu çağırmaz. Gerçek taşımayı açan ayar ya da kod yolu YOKTUR: açmak yeni kod + yeni owner kararı ister
 * (cutover HARD HOLD).
 */
import * as fs from 'fs';
import * as path from 'path';

const API_ROOT = path.resolve(__dirname, '../../../..');
const SRC = path.join(API_ROOT, 'src');
const UYAP_DIR = path.join(SRC, 'modules/uyap');
const UYAP_SERVICE = path.join(UYAP_DIR, 'uyap.service.ts');
const UYAP_MODULE = path.join(UYAP_DIR, 'uyap.module.ts');
const UYAP_CONTROLLER = path.join(UYAP_DIR, 'uyap.controller.ts');

const rel = (p: string) => path.relative(API_ROOT, p).replace(/\\/g, '/');
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1');
const walk = (dir: string, acc: string[] = []): string[] => {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === 'node_modules' || e.name === '__tests__') continue;
      walk(p, acc);
    } else if (e.name.endsWith('.ts') && !e.name.includes('.spec.')) acc.push(p);
  }
  return acc;
};
const code = (p: string) => stripComments(fs.readFileSync(p, 'utf8'));

/** UYAP modülünün ÜRETİM kaynakları (test dosyaları hariç). */
const UYAP_FILES = walk(UYAP_DIR);
/** Tüm üretim kaynakları (uyap dışından UYAP taşıma kodunun ithal edilip edilmediğini görmek için). */
const PRODUCTION_FILES = walk(SRC);

/** Gerçek ağ / taşıma ilkelleri (UYAP modülünde bulunmamalı). */
const TRANSPORT_PRIMITIVES: ReadonlyArray<readonly [string, RegExp]> = [
  ['fetch(', /\bfetch\s*\(/],
  ['fetchWithTimeout (paylaşılan ağ yardımcısı)', /fetch-with-timeout\.util|fetchWithTimeout/],
  ['axios', /\baxios\b|@nestjs\/axios|\bHttpService\b|\bHttpModule\b/],
  ['node-fetch / undici', /node-fetch|\bundici\b/],
  ['http / https istemcisi', /from ['"](?:node:)?https?['"]|require\(['"](?:node:)?https?['"]\)|\bhttps?\.request\s*\(/],
  ['SOAP istemcisi', /from ['"]soap['"]|require\(['"]soap['"]\)|\bcreateClientAsync\s*\(|\bsoap\.createClient/i],
  ['soket / TLS', /\bnet\.(?:connect|createConnection)\s*\(|\btls\.connect\s*\(|\bdgram\b/],
  ['WebSocket', /\bnew\s+WebSocket\s*\(|from ['"]ws['"]/],
  ['tarayıcı otomasyonu / alt süreç', /puppeteer|playwright|selenium|child_process/],
];
const primitivesIn = (source: string): string[] => TRANSPORT_PRIMITIVES.filter(([, re]) => re.test(source)).map(([name]) => name);

/** Gerçek taşımayı açan anahtar adı kalıbı (env / sabit / bayrak). UYAP modülünde bulunmamalı. */
const TRANSPORT_SWITCH_NAME = /UYAP_(?:REAL|LIVE|TRANSPORT|DISPATCH_ENABLED|SEND_ENABLED|PRODUCTION)|REAL_?TRANSPORT_?ENABLED|LIVE_?SEND|ENABLE_?REAL_?UYAP/i;

/** Sınıf gövdesindeki yöntemleri (2 boşluk girintili bildirim satırından bir sonrakine kadar) böler. */
const splitMethods = (source: string): Map<string, string> => {
  const lines = source.split(/\r?\n/);
  const starts: Array<{ name: string; line: number }> = [];
  lines.forEach((line, index) => {
    const m = /^ {2}(?:private |public |protected )?(?:async )?([A-Za-z0-9_]+)\s*\(/.exec(line);
    if (m && !['constructor', 'if', 'for', 'while', 'switch', 'catch', 'return'].includes(m[1])) starts.push({ name: m[1], line: index });
  });
  const out = new Map<string, string>();
  starts.forEach((start, i) => {
    const end = i + 1 < starts.length ? starts[i + 1].line : lines.length;
    out.set(start.name, lines.slice(start.line, end).join('\n'));
  });
  return out;
};

/**
 * KURAL (gerçek taşıma kapısı): taşıma ilkeli içeren bir yöntem, AYNI yöntemde politika motoru kararını VE dosya sahipliği / vekalet
 * yetkisini çağırmalı; ikisi de taşımadan ÖNCE (ilk `logRequest` ya da ilkelden önce) görünmeli. İhlal listesini döndürür.
 */
export function transportGateViolations(methods: Map<string, string>): string[] {
  const violations: string[] = [];
  for (const [name, body] of methods) {
    const stripped = stripComments(body);
    const found = primitivesIn(stripped);
    if (found.length === 0) continue;
    const firstPrimitive = Math.min(...TRANSPORT_PRIMITIVES.filter(([, re]) => re.test(stripped)).map(([, re]) => stripped.search(re)));
    const policy = stripped.search(/\bcanPerformAction\s*\(/);
    const authority = stripped.search(/\bassertUyapLegalAuthority\s*\(|\btriggerHacizAuthorization\b[\s\S]{0,40}assertAuthorized\s*\(/);
    if (policy < 0 || policy > firstPrimitive) violations.push(`${name}: politika motoru kararı taşımadan ÖNCE yok (${found.join(', ')})`);
    if (authority < 0 || authority > firstPrimitive) violations.push(`${name}: dosya sahipliği / vekalet yetkisi taşımadan ÖNCE yok (${found.join(', ')})`);
  }
  return violations;
}

const SUBMIT_METHODS = ['sendPaymentOrder', 'pushHacizRequest', 'submitDocument', 'submitCriminalComplaint', 'submitCivilLawsuit'] as const;

describe('TG-00 — kural kör değil: sentetik pozitifler (kapıyı gerçekten ayırt eder)', () => {
  const synth = (body: string) => new Map([['sendX', `  async sendX() {\n${body}\n  }`]]);

  it('kapısız taşıma ilkeli İHLAL; yalnız vekalet / yalnız politika İHLAL; ikisi de önce gelirse temiz', () => {
    expect(transportGateViolations(synth('    await fetch(url);'))).toHaveLength(2);
    expect(transportGateViolations(synth('    await this.assertUyapLegalAuthority({});\n    await fetch(url);'))).toHaveLength(1);
    expect(transportGateViolations(synth('    await this.cpe.canPerformAction(t, c, a);\n    await fetch(url);'))).toHaveLength(1);
    expect(transportGateViolations(synth('    await this.assertUyapLegalAuthority({});\n    await this.cpe.canPerformAction(t, c, a);\n    await fetch(url);'))).toEqual([]);
    // kapı taşımadan SONRA ise sayılmaz
    expect(transportGateViolations(synth('    await fetch(url);\n    await this.assertUyapLegalAuthority({});\n    await this.cpe.canPerformAction(t, c, a);'))).toHaveLength(2);
  });

  it('her ilkel türü yakalanır (kapısız eklenirse ihlal)', () => {
    const samples = [
      'await fetch(u)', "import x from 'axios'", "const f = fetchWithTimeout(u)", "import * as https from 'https'", "import soap from 'soap'",
      'net.connect(1)', 'new WebSocket(u)', "require('child_process')", "import puppeteer from 'puppeteer'", "import { HttpService } from '@nestjs/axios'",
    ];
    for (const sample of samples) expect({ sample, ihlal: transportGateViolations(synth(`    ${sample};`)).length > 0 }).toEqual({ sample, ihlal: true });
  });

  it('taşıma anahtarı adı kalıbı gerçek anahtar adlarını yakalar, mevcut meşru bayrakları yakalamaz', () => {
    for (const bad of ['UYAP_REAL_TRANSPORT_ENABLED', 'UYAP_LIVE_SEND', 'UYAP_TRANSPORT_MODE', 'UYAP_DISPATCH_ENABLED', 'UYAP_SEND_ENABLED', 'ENABLE_REAL_UYAP']) {
      expect({ bad, yakalandi: TRANSPORT_SWITCH_NAME.test(bad) }).toEqual({ bad, yakalandi: true });
    }
    for (const ok of ['UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_ENABLED', 'UYAP_M01_LEGAL_BASIS_CONSUMER_ENABLED', 'UYAP_AVAILABLE']) {
      expect({ ok, yakalandi: TRANSPORT_SWITCH_NAME.test(ok) }).toEqual({ ok, yakalandi: false });
    }
  });
});

describe('TG-01 — envanter: beş gönderim yöntemi sahte taşımadır ve doğruluk işaretini taşır', () => {
  const service = code(UYAP_SERVICE);
  const raw = fs.readFileSync(UYAP_SERVICE, 'utf8');
  const methods = splitMethods(raw);

  it('envanter boş değil: yöntemler ve beş gönderim yöntemi bulundu (0 = kör)', () => {
    expect(methods.size).toBeGreaterThanOrEqual(20);
    for (const name of SUBMIT_METHODS) expect({ name, bulundu: methods.has(name) }).toEqual({ name, bulundu: true });
  });

  it.each(SUBMIT_METHODS)('%s: "[STUB]" günlüğü + STUB_TRANSPORT_TRUTH işareti var; gerçek ağ ilkeli yok', (name) => {
    const body = methods.get(name) as string;
    expect(body).toContain('[STUB]');
    expect(body).toContain('...STUB_TRANSPORT_TRUTH');
    expect(primitivesIn(stripComments(body))).toEqual([]);
  });

  it('STUB_TRANSPORT_TRUTH: simulated=true, dispatched=false, providerAccepted=false, legalEffectConfirmed=false', () => {
    const m = /const STUB_TRANSPORT_TRUTH = \{([\s\S]*?)\} as const;/.exec(service);
    expect(m).not.toBeNull();
    const body = (m as RegExpExecArray)[1].replace(/\s+/g, ' ');
    expect(body).toContain('simulated: true');
    expect(body).toContain('dispatched: false');
    expect(body).toContain('providerAccepted: false');
    expect(body).toContain('legalEffectConfirmed: false');
  });

  it('sahte taşıma resmî uyum / provider kabulü iddia etmez: "evkNo" gönderim yanıtlarında doldurulmaz', () => {
    for (const name of SUBMIT_METHODS) {
      const body = stripComments(methods.get(name) as string);
      expect({ name, evkNoDolduruluyor: /\bevkNo\s*:\s*(?!null|undefined)/.test(body) }).toEqual({ name, evkNoDolduruluyor: false });
    }
  });
});

describe('TG-02 — UYAP modülünde gerçek ağ / taşıma ilkeli YOK; kapısız eklenirse kırılır', () => {
  it('incelenen üretim dosyası sayısı > 0 (0 = kör) ve hiçbirinde taşıma ilkeli yok', () => {
    expect(UYAP_FILES.length).toBeGreaterThan(20);
    const offenders = UYAP_FILES.filter((f) => primitivesIn(code(f)).length > 0).map((f) => `${rel(f)}: ${primitivesIn(code(f)).join(', ')}`);
    expect(offenders).toEqual([]);
  });

  it('kapı kuralı UYAP servisinde ve denetleyicisinde ihlalsiz (şu an taşıma yöntemi 0)', () => {
    expect(transportGateViolations(splitMethods(fs.readFileSync(UYAP_SERVICE, 'utf8')))).toEqual([]);
    expect(transportGateViolations(splitMethods(fs.readFileSync(UYAP_CONTROLLER, 'utf8')))).toEqual([]);
  });
});

describe('TG-03 — gerçek taşımayı açan anahtar / uykudaki hat üretime bağlanmaz', () => {
  it('UYAP üretim kaynaklarında taşıma açma anahtarı adı yok', () => {
    const offenders = UYAP_FILES.filter((f) => TRANSPORT_SWITCH_NAME.test(fs.readFileSync(f, 'utf8'))).map(rel);
    expect(offenders).toEqual([]);
  });

  it('UYAP_DORMANT_DISPATCH_ENABLED sabit false (env / argümanla açılamaz)', () => {
    const dormant = code(path.join(UYAP_DIR, 'official/official-dormant-dispatch.ts'));
    expect(dormant).toMatch(/export const UYAP_DORMANT_DISPATCH_ENABLED = false as const;/);
    expect(dormant).not.toMatch(/process\.env/);
  });

  it('uykudaki gönderim hattını üretim kodu ÇAĞIRMAZ / ithal etmez; UyapModule provider olarak kaydetmez', () => {
    const importers = PRODUCTION_FILES.filter(
      (f) => !f.endsWith('official-dormant-dispatch.ts') && /official-dormant-dispatch|prepareUyapDormantDispatch/.test(code(f)),
    ).map(rel);
    expect(importers).toEqual([]);
    expect(code(UYAP_MODULE)).not.toMatch(/Dormant|official-dormant-dispatch/);
  });
});

describe('TG-04 — bugün var olan korumalar KORUNUR (ratchet: kaldırılırsa kırılır)', () => {
  const raw = fs.readFileSync(UYAP_SERVICE, 'utf8');
  const methods = splitMethods(raw);
  const stripped = (name: string) => stripComments(methods.get(name) as string);
  const index = (body: string, pattern: RegExp) => body.search(pattern);

  it.each(['submitDocument', 'submitCriminalComplaint', 'submitCivilLawsuit', 'pushHacizRequest'])(
    '%s: dosya sahipliği + vekalet yetkisi (assertUyapLegalAuthority) ilk logRequest\'ten ÖNCE çalışır',
    (name) => {
      const body = stripped(name);
      const authority = index(body, /this\.assertUyapLegalAuthority\s*\(/);
      const log = index(body, /this\.logRequest\s*\(/);
      expect(authority).toBeGreaterThanOrEqual(0);
      expect(log).toBeGreaterThan(authority);
    },
  );

  it('pushHacizRequest: aktör-özel yetki zinciri + politika motoru, logRequest\'ten ÖNCE; sendPaymentOrder: politika motoru fail-closed', () => {
    const haciz = stripped('pushHacizRequest');
    expect(index(haciz, /triggerHacizAuthorization\.assertAuthorized\s*\(/)).toBeGreaterThanOrEqual(0);
    expect(index(haciz, /canPerformAction\s*\(/)).toBeGreaterThanOrEqual(0);
    expect(index(haciz, /canPerformAction\s*\(/)).toBeLessThan(index(haciz, /this\.logRequest\s*\(/));

    const payment = stripped('sendPaymentOrder');
    expect(index(payment, /canPerformAction\s*\(/)).toBeGreaterThanOrEqual(0);
    expect(index(payment, /canPerformAction\s*\(/)).toBeLessThan(index(payment, /this\.logRequest\s*\(/));
    expect(payment).toContain("code: 'CPE_CHECK_FAILED'"); // motor yoksa / hata verirse engellenir (fail-closed)
    expect(payment).toContain("code: 'CPE_GATE_BLOCKED'");
  });

  it('retry yolu kapalı: UYAP yeniden deneme ucu servisi çağırmadan 503 verir', () => {
    const controller = code(UYAP_CONTROLLER);
    expect(controller).toMatch(/async retryFailed\(\)[\s\S]{0,400}ServiceUnavailableException\(RETRY_CONTAINMENT_ERROR\)/);
  });
});

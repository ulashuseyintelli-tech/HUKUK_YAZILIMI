import { existsSync, readFileSync, readdirSync, statSync } from 'fs';
import { join, relative, sep } from 'path';
import {
  classifyOfficeWorkPoolMutationError,
  isRetryableOfficeWorkPoolMutationError,
  OfficeWorkPoolActorRequiredError,
  OfficeWorkPoolOfficeMissingError,
  OFFICE_WORK_POOL_KINDS,
  OFFICE_WORK_POOL_LEGACY_COLUMN,
  OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS,
  OFFICE_WORK_POOL_NEVER_RETRIED_CODES,
} from '../office-work-pool.mutation-contract';

/**
 * OFFICE-WR01-B02 AŞAMA 4 — YAPISAL KİLİTLER (§11.5.7 madde 5, handoff §4 ve §9).
 *
 * Bu suite DAVRANIŞ değil YAPI kanıtlar. Gerekçesi tektir: `LOCK INVARIANT` yalnız bugünkü
 * kodun doğru olmasıyla değil, YARIN eklenecek bir yazıcının kırılmasıyla korunur. Bir
 * concurrency testi yeni bir writer'ın eklendiğini FARK EDEMEZ; kaynak taraması eder.
 *
 * NE KANITLANMAZ (dürüstlük sınırı): kilit davranışının kendisi burada kanıtlanmaz —
 * o `office-work-pool-dual-write.db-gated.integration.spec.ts` içindeki T1-T6 matrisidir ve
 * GERÇEK PostgreSQL ister. Mock'lu bir test lock garantisinin kanıtı SAYILAMAZ (§11.5.6).
 */

const API_SRC = join(__dirname, '../../../..');

/** Repo-göreli, ayırıcıdan bağımsız yol (allowlist'ler exact eşleşme ile çalışır). */
function toKey(absolutePath: string): string {
  return relative(API_SRC, absolutePath).split(sep).join('/');
}

function listTypeScriptFiles(dir: string, acc: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      listTypeScriptFiles(full, acc);
      continue;
    }
    if (entry.endsWith('.ts')) acc.push(full);
  }
  return acc;
}

const ALL_TS_FILES = listTypeScriptFiles(API_SRC);

/**
 * Yorumları söker. ZORUNLUDUR: bu dosyaların JSDoc'ları yasağın KENDİSİNİ tarif eder
 * ("`new Date()` yasaktır", "`clock_timestamp()` kilit sonrası") — ham metin üzerinde arama
 * yapan bir guard, doğru yazılmış bir açıklamayı ihlal sanardı. String/template literalleri
 * korunur ki SQL gövdeleri (`FOR UPDATE`, `clock_timestamp()`) sayımda kalsın.
 */
export function stripTsComments(source: string): string {
  let out = '';
  let i = 0;
  while (i < source.length) {
    const two = source.slice(i, i + 2);
    if (two === '//') {
      const end = source.indexOf('\n', i);
      i = end === -1 ? source.length : end;
      continue;
    }
    if (two === '/*') {
      const end = source.indexOf('*/', i + 2);
      i = end === -1 ? source.length : end + 2;
      continue;
    }
    const ch = source[i];
    if (ch === '"' || ch === "'" || ch === '`') {
      out += ch;
      i += 1;
      while (i < source.length) {
        if (source[i] === '\\') {
          out += source.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += source[i];
        if (source[i] === ch) {
          i += 1;
          break;
        }
        i += 1;
      }
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

const MUTATION_SERVICE_KEY = 'modules/office/work-pool/office-work-pool.mutation.service.ts';
const MUTATION_SERVICE_SOURCE = stripTsComments(
  readFileSync(join(API_SRC, MUTATION_SERVICE_KEY), 'utf8'),
);
const OFFICE_SERVICE_KEY = 'modules/office/office.service.ts';
const OFFICE_SERVICE_SOURCE = stripTsComments(
  readFileSync(join(API_SRC, OFFICE_SERVICE_KEY), 'utf8'),
);

/**
 * Membership yazma çağrısı kalıpları. Prisma model erişimi + ham SQL birlikte taranır: yalnız
 * ORM'e bakmak `$executeRaw` ile açılan bir arka kapıyı görmezdi.
 */
const MEMBERSHIP_WRITE_PATTERNS: readonly RegExp[] = [
  /officeWorkPoolMembership\s*\.\s*(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/,
  /INSERT\s+INTO\s+"OfficeWorkPoolMembership"/i,
  /UPDATE\s+"OfficeWorkPoolMembership"/i,
  /DELETE\s+FROM\s+"OfficeWorkPoolMembership"/i,
];

const EPOCH_WRITE_PATTERNS: readonly RegExp[] = [
  /officeWorkPoolEpoch\s*\.\s*(create|createMany|update|updateMany|delete|deleteMany|upsert)\s*\(/,
  /INSERT\s+INTO\s+"OfficeWorkPoolEpoch"/i,
  /UPDATE\s+"OfficeWorkPoolEpoch"/i,
  /DELETE\s+FROM\s+"OfficeWorkPoolEpoch"/i,
];

/**
 * TEK runtime membership writer'ı (§11.5.7 madde 1-2).
 * Bu liste BÜYÜYEMEZ: yeni bir yazıcı, kendi kilidini alsa bile, `effectiveAt` üretimi ve
 * "değişmeyene dokunma" kuralını yeniden kurgulamak zorunda kalır ve iki tanım zamanla ayrışır.
 */
const RUNTIME_MEMBERSHIP_WRITER_ALLOWLIST: readonly string[] = [MUTATION_SERVICE_KEY];

/**
 * Runtime anchor (epoch) yazıcıları. `getOrCreate` Office yaratımıyla ATOMİK anchor yazar
 * (§6.7 madde 1); primitive yalnız catch-up'ın `PROVISION_MISSING` yolunda yazar (§5.2).
 */
const RUNTIME_EPOCH_WRITER_ALLOWLIST: readonly string[] = [
  MUTATION_SERVICE_KEY,
  OFFICE_SERVICE_KEY,
];

/**
 * Runtime SAYILMAYAN dosyalar — her biri EXACT yol olarak listelenir, geniş glob KULLANILMAZ
 * (`__tests__` gibi bir kalıp, ileride oraya konacak bir üretim yardımcı dosyasını da
 * sessizce muaf tutardı).
 */
const NON_RUNTIME_ALLOWLIST: readonly string[] = [
  // AŞAMA 1-2 migration doğrulaması: izole şemada migration SQL'ini yeniden uygular.
  'modules/office/__tests__/office-work-pool-effective-dating-migration.db-gated.integration.spec.ts',
  // AŞAMA 3 parite harness'i: yalnız kendi fixture'ını yazar/siler.
  'modules/office/work-pool/__tests__/office-work-pool-parity.db-gated.integration.spec.ts',
  // AŞAMA 4 T1-T6 / A1-A5 matrisi: fixture kurulumu ve doğrudan-yazma NEGATİF kontrolleri.
  'modules/office/work-pool/__tests__/office-work-pool-dual-write.db-gated.integration.spec.ts',
  // Bu guard'ın kendisi: kalıp literalleri kaynakta geçtiği için kendini eşler.
  'modules/office/work-pool/__tests__/office-work-pool-writer.static-guard.spec.ts',
];

function filesMatching(patterns: readonly RegExp[]): string[] {
  const hits: string[] = [];
  for (const file of ALL_TS_FILES) {
    const source = stripTsComments(readFileSync(file, 'utf8'));
    if (patterns.some((pattern) => pattern.test(source))) hits.push(toKey(file));
  }
  return hits.sort();
}

describe('OFFICE-WR01-B02 A4 — tek writer ve yapisal kilitler', () => {
  it('(1) primitive DISINDA runtime membership writer YOKTUR', () => {
    const writers = filesMatching(MEMBERSHIP_WRITE_PATTERNS);
    // Allowlist'lerin kendisi de doğrulanır: ölü bir muafiyet sessizce birikemez.
    for (const allowed of [...RUNTIME_MEMBERSHIP_WRITER_ALLOWLIST, ...NON_RUNTIME_ALLOWLIST]) {
      expect(ALL_TS_FILES.map(toKey)).toContain(allowed);
    }
    const unexpected = writers.filter(
      (key) =>
        !RUNTIME_MEMBERSHIP_WRITER_ALLOWLIST.includes(key) && !NON_RUNTIME_ALLOWLIST.includes(key),
    );
    expect(unexpected).toEqual([]);
    expect(writers).toContain(MUTATION_SERVICE_KEY);
  });

  it('(2) runtime anchor writer YALNIZ getOrCreate ve primitive', () => {
    const writers = filesMatching(EPOCH_WRITE_PATTERNS);
    const unexpected = writers.filter(
      (key) => !RUNTIME_EPOCH_WRITER_ALLOWLIST.includes(key) && !NON_RUNTIME_ALLOWLIST.includes(key),
    );
    expect(unexpected).toEqual([]);
    expect(writers).toEqual(expect.arrayContaining([...RUNTIME_EPOCH_WRITER_ALLOWLIST]));
  });

  it('(3) mutation zaman yuzeyinde now() / CURRENT_TIMESTAMP / new Date() YOKTUR', () => {
    // Yasak YALNIZ mutation'ın TARİHSEL ZAMAN ÜRETİM yüzeyini kapsar; repository geneline
    // genişletilmez (handoff §9 son cümle).
    expect(/\bnow\s*\(\s*\)/i.test(MUTATION_SERVICE_SOURCE)).toBe(false);
    expect(/CURRENT_TIMESTAMP/i.test(MUTATION_SERVICE_SOURCE)).toBe(false);
    expect(/new\s+Date\s*\(/.test(MUTATION_SERVICE_SOURCE)).toBe(false);
  });

  it('(4) effectiveAt TEK KEZ uretilir; satir basina saat cagrisi YOKTUR', () => {
    const clockCalls = MUTATION_SERVICE_SOURCE.match(/clock_timestamp\s*\(\s*\)/g) ?? [];
    expect(clockCalls).toHaveLength(1);
    // Tek çağrı `readEffectiveAt` içindedir ve dönüşü tüm yazmalara BİR değişkenden dağıtılır.
    expect(MUTATION_SERVICE_SOURCE).toMatch(
      /private async readEffectiveAt[\s\S]*?clock_timestamp\s*\(\s*\)/,
    );
  });

  it('(5) Office kilidi transactionin ILK DB ifadesidir ve clock_timestamp ondan SONRA gelir', () => {
    const lockIndex = MUTATION_SERVICE_SOURCE.indexOf('FOR UPDATE');
    const clockIndex = MUTATION_SERVICE_SOURCE.indexOf('clock_timestamp');
    expect(lockIndex).toBeGreaterThan(-1);
    expect(clockIndex).toBeGreaterThan(lockIndex);
    // Kilit ifadesi `runAttempt`'in gövdesinde, herhangi bir başka `tx.` çağrısından ÖNCEDİR.
    const body = MUTATION_SERVICE_SOURCE.slice(MUTATION_SERVICE_SOURCE.indexOf('runAttempt('));
    const firstTxCall = body.search(/tx\s*\.\s*[A-Za-z$]/);
    const firstLock = body.indexOf('FOR UPDATE');
    expect(firstTxCall).toBeGreaterThan(-1);
    expect(body.slice(firstTxCall, firstLock)).toContain('$queryRaw');
  });

  it('(6) retry bounded; sonsuz dongu ve recursive yeniden deneme YOKTUR', () => {
    expect(OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS).toBe(3);
    expect(/while\s*\(\s*true\s*\)/.test(MUTATION_SERVICE_SOURCE)).toBe(false);
    expect(MUTATION_SERVICE_SOURCE).toContain('attempt <= OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS');
    // `applyTargetState` kendini ÇAĞIRMAZ (recursive retry yasağı).
    const selfCalls =
      MUTATION_SERVICE_SOURCE.match(/this\s*\.\s*applyTargetState\s*\(/g) ?? [];
    expect(selfCalls).toHaveLength(0);
  });

  it('(7) mutation transactioninda public resolver SERVICE cagrilmaz', () => {
    expect(MUTATION_SERVICE_SOURCE).not.toContain('OfficeWorkPoolResolverService');
    expect(MUTATION_SERVICE_SOURCE).not.toContain('office-work-pool-resolver.service');
    // Karar yine de AŞAMA 3'ün SAF evaluator'ından gelir; ikinci predikat icat edilmez.
    expect(MUTATION_SERVICE_SOURCE).toContain('evaluateOfficeLawyerPool');
    expect(MUTATION_SERVICE_SOURCE).toContain('isOfficeWorkPoolMembershipActiveAt');
  });

  it('(8) admin GET hala legacy duz dizileri okur (read-path DEGISMEDI)', () => {
    const getter = OFFICE_SERVICE_SOURCE.slice(
      OFFICE_SERVICE_SOURCE.indexOf('async getEscalationSettings'),
      OFFICE_SERVICE_SOURCE.indexOf('async updateEscalationSettings'),
    );
    expect(getter).toContain('office.escalationManagerLawyerIds');
    expect(getter).toContain('office.escalationFounderLawyerIds');
    expect(getter).toContain('office.opStaffTypes');
    expect(getter).not.toContain('WorkPool');
    expect(getter).not.toContain('resolve');
  });

  it('(9) alti tuketicinin HICBIRI resolveri cagirmaz — CONSUMER WIRING 0/6', () => {
    // AŞAMA 3'ün kaydettiği ALTI okuma yüzeyi — exact yollar (§2.3 envanteri).
    const consumers = [
      'modules/escalation/operational-escalation.service.ts',
      'modules/escalation/case-task-escalation.service.ts',
      'modules/automation/poa-expiry-delivery.service.ts',
      'modules/client-notification/client-notification.service.ts',
      'modules/office/office.service.ts',
      'scripts/g6-backfill-dry-run.ts',
    ];
    const allKeys = ALL_TS_FILES.map(toKey);
    for (const key of consumers) {
      // Yol yanlışsa test SESSİZCE geçmez: dosyanın varlığı ayrıca doğrulanır.
      expect(allKeys).toContain(key);
      const source = readFileSync(join(API_SRC, key), 'utf8');
      expect(source).not.toContain('OfficeWorkPoolResolverService');
      expect(source).not.toContain('office-work-pool-resolver.service');
    }
  });

  it('(10) sozlesme kilitleri: havuz listesi ve legacy projeksiyon eksiksiz', () => {
    expect([...OFFICE_WORK_POOL_KINDS].sort()).toEqual([
      'ESCALATION_FOUNDER',
      'ESCALATION_MANAGER',
      'OP_STAFF_TYPE',
    ]);
    expect(Object.keys(OFFICE_WORK_POOL_LEGACY_COLUMN).sort()).toEqual([...OFFICE_WORK_POOL_KINDS].sort());
  });

  it('(12) C13-R01: provisioning TENANT_PROVISIONED, catch-up LEGACY_CUTOVER_IMPORT', () => {
    // Dilim sınırları TANIM adlarıdır: `assertLegacyPassthroughIsPoolFree` CAĞRISI
    // `applyTargetState` içinde daha ÖNCE geçtiği için sınır olarak kullanılamaz (negatif
    // uzunlukta boş dilim üretir ve guard sessizce vacuous olurdu).
    const provisioningStart = MUTATION_SERVICE_SOURCE.indexOf(
      'async materializeProvisioningSnapshot(',
    );
    const provisioningEnd = MUTATION_SERVICE_SOURCE.indexOf(
      'private assertLegacyPassthroughIsPoolFree(',
    );
    expect(provisioningStart).toBeGreaterThan(-1);
    expect(provisioningEnd).toBeGreaterThan(provisioningStart);
    const provisioning = MUTATION_SERVICE_SOURCE.slice(provisioningStart, provisioningEnd);
    expect(provisioning).toContain("provenance: 'TENANT_PROVISIONED'");
    expect(provisioning).not.toContain("provenance: 'LEGACY_CUTOVER_IMPORT'");

    // Catch-up yolu provenance'i CAGIRANDAN alir ve arac onu LEGACY_CUTOVER_IMPORT olarak
    // gecirir — orada gercekten duz diziden ithal vardir. Iki yolun AYRI degeri tasidigi
    // kaynak duzeyinde de kilitlenir (davranis kaniti A2/A4 db-gated testlerindedir).
    const catchUp = stripTsComments(
      readFileSync(join(API_SRC, 'scripts/office-work-pool-anchor-catchup.ts'), 'utf8'),
    );
    expect(catchUp).toContain("membershipProvenance: 'LEGACY_CUTOVER_IMPORT'");
    expect(catchUp).not.toContain("membershipProvenance: 'TENANT_PROVISIONED'");
  });

  it('(13) C13-R01: belirsiz commit dogrulamasi CIFT yuzeydir ve yalniz INDETERMINATE tetikler', () => {
    // Basari kosulu IKI yuzeyin de esitligidir; tek yuzey yeterli SAYILAMAZ.
    expect(MUTATION_SERVICE_SOURCE).toContain('membershipMatchesTarget && legacyMatchesTarget');
    expect(MUTATION_SERVICE_SOURCE).toContain("verification = 'BOTH_SURFACES_MATCH'");
    expect(MUTATION_SERVICE_SOURCE).toContain("verification = 'MISMATCH_REAPPLIED'");

    // Dogrulama YALNIZ belirsiz-commit sinifindan sonra acilir; kesin rollback (SERIALIZATION)
    // icin acilmaz — normal fark hesabi zaten taze okur.
    expect(MUTATION_SERVICE_SOURCE).toContain("verifyBeforeApply = errorClass === 'INDETERMINATE'");
  });

  it('(11) hata siniflandirmasi: yalniz gercek concurrency/belirsizlik retrylenir', () => {
    expect(classifyOfficeWorkPoolMutationError({ code: 'P2034' })).toBe('SERIALIZATION');
    expect(classifyOfficeWorkPoolMutationError({ code: '40001' })).toBe('SERIALIZATION');
    expect(classifyOfficeWorkPoolMutationError({ code: '40P01' })).toBe('SERIALIZATION');
    expect(classifyOfficeWorkPoolMutationError({ code: 'P2028' })).toBe('INDETERMINATE');
    expect(classifyOfficeWorkPoolMutationError({ code: '08006' })).toBe('INDETERMINATE');

    // CHECK / FK / unique / domain / bilinmeyen → ASLA retry.
    for (const code of OFFICE_WORK_POOL_NEVER_RETRIED_CODES) {
      expect(classifyOfficeWorkPoolMutationError({ code })).toBe('FATAL');
      expect(isRetryableOfficeWorkPoolMutationError({ code })).toBe(false);
    }
    expect(classifyOfficeWorkPoolMutationError(new OfficeWorkPoolOfficeMissingError('t'))).toBe(
      'FATAL',
    );
    expect(
      classifyOfficeWorkPoolMutationError(new OfficeWorkPoolActorRequiredError('OP_STAFF_TYPE')),
    ).toBe('FATAL');
    expect(classifyOfficeWorkPoolMutationError(new Error('bilinmeyen'))).toBe('FATAL');
    expect(classifyOfficeWorkPoolMutationError(undefined)).toBe('FATAL');

    // 55P03 BİLEREK allowlist DIŞINDADIR: düz bekleyen FOR UPDATE bu kodu üretemez (§11.5.4).
    expect(classifyOfficeWorkPoolMutationError({ code: '55P03' })).toBe('FATAL');
  });

  it('(14) C14-R1A: catch-up production yuzeyi DERLENMIS Node yoludur, dinamik indirme YOKTUR', () => {
    const API_ROOT = join(API_SRC, '..');
    const PACKAGE_JSON_RAW = readFileSync(join(API_ROOT, 'package.json'), 'utf8');
    const pkg = JSON.parse(PACKAGE_JSON_RAW) as { scripts: Record<string, string> };
    const nestCli = JSON.parse(readFileSync(join(API_ROOT, 'nest-cli.json'), 'utf8')) as {
      entryFile: string;
    };
    const SCRIPT_NAME = 'owp:anchor-catchup';
    // Kaynagin monorepo koku (`project/`) gorelisi — nest'in dist yerlesimi bu koku korur.
    const CATCH_UP_ENTRY = 'apps/api/src/scripts/office-work-pool-anchor-catchup';

    // (a) Script TAM BIR KEZ tanimlidir. Sayim HAM METIN uzerinde yapilir: JSON.parse
    //     tekrarlanan anahtari sessizce teke indirir ve ikinci bir tanim gorunmez kalirdi.
    const declarations = PACKAGE_JSON_RAW.match(new RegExp(`"${SCRIPT_NAME}"\\s*:`, 'g')) ?? [];
    expect(declarations).toHaveLength(1);

    // (b) Beklenen komut ICAT EDILMEZ; build yerlesiminden TURETILIR. Cikarim, canli
    //     runtime'in fiilen kullandigi `start` script'i ile nest-cli `entryFile`ini
    //     birbirine baglar: yerlesim degisirse ikisi BIRLIKTE degismek zorundadir.
    const startPath = pkg.scripts.start.replace(/^node\s+/, '');
    const entrySuffix = `${nestCli.entryFile}.js`;
    expect(startPath.endsWith(entrySuffix)).toBe(true);
    const distPrefix = startPath.slice(0, startPath.length - entrySuffix.length);
    expect(distPrefix).toBe('dist/');
    const expectedCommand = `node ${distPrefix}${CATCH_UP_ENTRY}.js`;
    expect(pkg.scripts[SCRIPT_NAME]).toBe(expectedCommand);

    // (c) Kaynak yolu gercekten vardir — turetim bir yazim hatasi uzerine kurulamaz.
    expect(existsSync(join(API_SRC, 'scripts/office-work-pool-anchor-catchup.ts'))).toBe(true);

    // (d) Dinamik yurutucu / uzak paket indirme izi YOKTUR.
    for (const forbidden of ['npx', 'tsx', 'ts-node', '--yes']) {
      expect(pkg.scripts[SCRIPT_NAME]).not.toContain(forbidden);
    }

    // (e) ALIAS REGRESYONU: baska HICBIR script catch-up'i farkli bir yoldan calistiramaz.
    //     Bir gun `owp:anchor-catchup:dev` diye tsx'li bir kardes eklenirse burada duser.
    const aliases = Object.entries(pkg.scripts).filter(([, value]) =>
      value.includes('office-work-pool-anchor-catchup'),
    );
    expect(aliases.map(([name]) => name)).toEqual([SCRIPT_NAME]);
    for (const [, value] of aliases) expect(value).toBe(expectedCommand);

    // (f) DERLENMIS HEDEF: `nest build` kosulmus bir agacta dosya GERCEKTEN vardir.
    //     DURUSTLUK SINIRI — CI'nin `Test Suite` job'i build KOSMAZ, bu yuzden kontrol
    //     dist yoksa uygulanamaz. Vacuous gecmeyi onlemek icin kosul `dist`in VARLIGIDIR:
    //     dist varsa hedef ZORUNLUDUR. Build sonrasi varligin kendisi ayrica C14-R1A'nin
    //     D1-D4 gercek-process kanitlariyla olculmustur.
    const distRoot = join(API_ROOT, 'dist');
    if (existsSync(distRoot)) {
      expect(existsSync(join(API_ROOT, `${distPrefix}${CATCH_UP_ENTRY}.js`))).toBe(true);
    }

    // (g) Kaynakta entry guard KORUNUR: dosya import edildiginde main CALISMAZ.
    const catchUpSource = stripTsComments(
      readFileSync(join(API_SRC, 'scripts/office-work-pool-anchor-catchup.ts'), 'utf8'),
    );
    expect(catchUpSource).toContain('require.main === module');

    // (h) FAIL-CLOSED sozlesmesi KORUNUR: `--apply` tek basina yazmaz.
    expect(catchUpSource).toContain("argv.includes('--apply')");
    expect(catchUpSource).toContain("argv.includes('--drained-confirmed')");
    expect(catchUpSource).toMatch(/if\s*\(\s*apply\s*&&\s*!\s*drainedConfirmed\s*\)/);
    expect(catchUpSource).toContain('DRAIN_NOT_CONFIRMED');
    expect(catchUpSource).toMatch(/DRAIN_NOT_CONFIRMED[\s\S]*?process\.exit\(2\)/);
  });
});

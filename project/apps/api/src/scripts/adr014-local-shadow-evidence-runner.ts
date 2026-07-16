/**
 * ADR-014 / CCB-001 / CAN-CUT-02 — LOCAL BASELINE + SHADOW EVIDENCE RUNNER (SALT-OKUMA).
 * Tasarım: onaylanmış "ADR-014 LOCAL BASELINE + SHADOW EVIDENCE RUNNER — GO-ANALYZE".
 * Kanonik yetki: docs/design/adr-014-cutover-authorization-policy.md §10 (LOCAL owner/office evidence).
 * Sözleşme: docs/design/adr-014-zero-cent-discrepancy-monitoring-contract.md (ADR014-PE-01).
 *
 * NE YAPAR: owner tarafından seçilen GERÇEK yerel case kümesi üzerinde, DB-motoru seviyesinde
 * salt-okunur bir bağlantıyla, mevcut `BalanceDisplayShadowDiffService.compare()` boru hattını
 * (legacy `getCalculationSummary` ↔ canonical `computeCaseBalance→display`) case başına çalıştırır;
 * parity (0-cent), latency, error/timeout ve blocker kanıtını KİMLİKSİZ (opak Case Id) + sayısal
 * olarak yerel diske yazar.
 *
 * NE YAPMAZ (owner GO-COMPLETE, kesin sınır): finansal hesap/allocation/TBK100/interest-engine/
 * fee/journal/ledger/projection DEĞİŞTİRMEZ; karşılaştırmayı YENİDEN YAZMAZ (REC-AUTH-000: ikinci
 * otorite yok); feature flag AÇMAZ; consumer switch YAPMAZ; runtime cutover / PR-11 BAŞLATMAZ;
 * cloud/staging/harici transfer YAPMAZ. Onay/apply/write/execute/commit anlamına gelen HİÇBİR yazma
 * bayrağı yoktur ve tasarım gereği eklenmeyecektir. DB'ye YALNIZ SELECT atar; mutation İÇERMEZ
 * (statik guard: __tests__/adr014-local-shadow-evidence-runner.static-purity.spec.ts).
 *
 * SALT-OKUMA GARANTİSİ (owner decision 4 — REPEATABLE READ / READ ONLY):
 *  1) Bağlantı, `DATABASE_URL`'e `-c default_transaction_read_only=on -c default_transaction_isolation=
 *     repeatable read` options'ı eklenerek kurulur → Postgres motoru her non-temp write'ı REDDEDER.
 *  2) Bootstrap sonrası aktif transaction'ın read-only + repeatable-read olduğu `SELECT current_setting`
 *     ile DOĞRULANIR; değilse runner HİÇBİR compare() çalıştırmadan ABORT eder (fail-closed).
 *  3) `compare()` zaten `mode: SHADOW_ONLY` / `primaryDisplayUnchanged: true` (yalnız read metotları).
 *  4) Kaynak statik guard ile mutation-yolu içermediği kilitlenir.
 *
 * Kullanım (project/apps/api altından):
 *   ADR014_CANONICAL_SHA=$(git rev-parse HEAD) \
 *   npx tsx src/scripts/adr014-local-shadow-evidence-runner.ts \
 *     --input evidence/adr014/input/representative-cases.json [--out <dir>] [--timeout-ms 30000]
 *
 * Bu PR'ın merge'i, çalıştırma yetkisi VERMEZ ve PR-11'i AÇMAZ; gerçek koşum owner-local'dir ve
 * çıktısı ASLA commit edilmez (evidence dizini .gitignore ile korunur).
 *
 * Çağrıldığı yerler: ELLE çalıştırılan operasyonel script (CI/otomatik deploy DEĞİL).
 */

import { NestFactory } from '@nestjs/core';
import * as fs from 'fs';
import * as path from 'path';
import { BalanceDisplayShadowDiffModule } from '../modules/balance-display-shadow-diff/balance-display-shadow-diff.module';
import { BalanceDisplayShadowDiffService } from '../modules/balance-display-shadow-diff/balance-display-shadow-diff.service';
import type {
  BalanceDisplayShadowDiffReport,
  ShadowAmountDiff,
  ShadowBucketDiff,
  ShadowFinancialDiffCode,
} from '../modules/balance-display-shadow-diff/balance-display-shadow-diff.types';
import { SHADOW_FINANCIAL_DIFF_FIELDS } from '../modules/balance-display-shadow-diff/balance-display-shadow-diff.types';
import { PrismaService } from '../prisma/prisma.service';
import { computeReportManifest } from './enforcement-action-report-hash';
import * as core from './adr014-shadow-evidence.core';

const POLICY_REFERENCE = 'adr-014-cutover-authorization-policy.md §10';
const CONTRACT_REFERENCE = 'adr-014-zero-cent-discrepancy-monitoring-contract.md (ADR014-PE-01)';
const DEFAULT_INPUT = path.join('evidence', 'adr014', 'input', 'representative-cases.json');
const OUTPUT_FILES = ['manifest.json', 'summary.json', 'detail.json', 'correlation.map.json'];

// ---------------------------------------------------------------------------
// CLI
// ---------------------------------------------------------------------------

interface Args {
  input: string;
  out?: string;
  timeoutMs: number;
}

function parseArgs(argv: string[]): Args {
  const val = (flag: string): string | undefined => {
    const i = argv.indexOf(flag);
    return i >= 0 ? argv[i + 1] : undefined;
  };
  const timeoutRaw = val('--timeout-ms');
  const timeoutMs = timeoutRaw ? Number(timeoutRaw) : 30000;
  return {
    input: val('--input') ?? DEFAULT_INPUT,
    out: val('--out'),
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000,
  };
}

// ---------------------------------------------------------------------------
// Read-only bağlantı kurulumu ve doğrulaması
// ---------------------------------------------------------------------------

const READ_ONLY_OPTIONS = '-c default_transaction_read_only=on -c default_transaction_isolation=repeatable read';

/** `DATABASE_URL`'e read-only + repeatable-read session options'ı ekler. Credential'a dokunmaz. */
export function buildReadOnlyDatabaseUrl(raw: string): string {
  const url = new URL(raw);
  const existing = url.searchParams.get('options');
  url.searchParams.set('options', existing ? `${existing} ${READ_ONLY_OPTIONS}` : READ_ONLY_OPTIONS);
  return url.toString();
}

/** Credential İÇERMEYEN DB kimliği — banner ve manifest bu tek ayrıştırıcıyı kullanır. */
export function parseDatabaseIdentity(databaseUrl: string | undefined, nodeEnv: string | undefined): core.DatabaseIdentity {
  const environment = nodeEnv ?? '(tanımsız)';
  const fallback: core.DatabaseIdentity = {
    host: '(tanımsız)',
    port: '(tanımsız)',
    databaseName: '(tanımsız)',
    environment,
    readOnlyMode: true,
    isolationLevel: 'repeatable read',
  };
  if (!databaseUrl) return fallback;
  try {
    const parsed = new URL(databaseUrl);
    return {
      host: parsed.hostname || '(tanımsız)',
      port: parsed.port || '5432',
      databaseName: parsed.pathname.replace(/^\//, '') || '(tanımsız)',
      environment,
      readOnlyMode: true,
      isolationLevel: 'repeatable read',
    };
  } catch {
    return { ...fallback, host: '(ayrıştırılamadı)', port: '(ayrıştırılamadı)', databaseName: '(ayrıştırılamadı)' };
  }
}

/**
 * Aktif bağlantının GERÇEKTEN read-only + repeatable-read olduğunu DB'ye sorarak doğrular.
 * `$queryRaw` (SELECT) kullanılır — mutation değildir. Doğrulanamazsa fail-closed (throw).
 */
async function verifyReadOnly(prisma: PrismaService): Promise<void> {
  const rows = await prisma.$queryRaw<Array<{ read_only: string; isolation: string }>>`
    SELECT current_setting('transaction_read_only') AS read_only,
           current_setting('default_transaction_isolation') AS isolation
  `;
  const row = rows[0];
  if (!row || row.read_only !== 'on') {
    throw new Error(
      `SALT-OKUMA DOĞRULANAMADI: transaction_read_only='${row?.read_only ?? '(yok)'}' (beklenen 'on'). ` +
        `Runner fail-closed olarak durdu; hiçbir case çalıştırılmadı.`,
    );
  }
  if (row.isolation !== 'repeatable read') {
    throw new Error(
      `İZOLASYON DOĞRULANAMADI: default_transaction_isolation='${row.isolation}' (beklenen 'repeatable read'). ` +
        `Runner fail-closed olarak durdu.`,
    );
  }
}

// ---------------------------------------------------------------------------
// Girdi manifesti (owner-provided GERÇEK case seti — runner ÜRETMEZ)
// ---------------------------------------------------------------------------

interface InputCase {
  tenantId: string;
  caseId: string;
  asOfDate?: string;
  scenarioClass?: string;
  currencyGroup?: string;
  caseSizeBucket?: string;
}

interface InputManifest {
  datasetVersion?: string;
  asOfDefault?: string;
  cases: InputCase[];
}

function readInputManifest(inputPath: string): InputManifest | null {
  if (!fs.existsSync(inputPath)) return null;
  const parsed = JSON.parse(fs.readFileSync(inputPath, 'utf8')) as InputManifest;
  if (!parsed || !Array.isArray(parsed.cases)) {
    throw new Error(`Girdi manifesti geçersiz: '${inputPath}' içinde 'cases' dizisi yok.`);
  }
  return parsed;
}

// ---------------------------------------------------------------------------
// compare() alan çıkarımı
// ---------------------------------------------------------------------------

function toFieldDiffInput(d: ShadowAmountDiff, bucket?: string): core.FieldDiffInput {
  const field = SHADOW_FINANCIAL_DIFF_FIELDS[d.code as ShadowFinancialDiffCode] ?? d.code;
  return {
    code: d.code,
    field,
    bucket,
    legacyAmount: d.legacyAmount,
    canonicalAmount: d.canonicalAmount,
    delta: d.delta,
    status: d.status,
  };
}

function determineOutcome(report: BalanceDisplayShadowDiffReport): core.RunOutcome {
  const legacy = report.sources.legacyCalculationSummary.available;
  const canonical = report.sources.canonicalBalanceDisplay.available;
  if (!legacy && !canonical) return 'BOTH_UNAVAILABLE';
  if (!legacy) return 'LEGACY_UNAVAILABLE';
  if (!canonical) return 'CANONICAL_UNAVAILABLE';
  return 'SUCCESS';
}

/** compare()'i timeout ile sarar; başarı/timeout/hata döndürür. Mutation İÇERMEZ. */
async function runCompareWithTimeout(
  fn: () => Promise<BalanceDisplayShadowDiffReport>,
  timeoutMs: number,
): Promise<{ ok: true; report: BalanceDisplayShadowDiffReport } | { ok: false; reason: 'TIMEOUT' | 'ERROR'; message: string }> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error('__ADR014_TIMEOUT__')), timeoutMs);
    });
    const report = await Promise.race([fn(), timeout]);
    return { ok: true, report };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { ok: false, reason: message === '__ADR014_TIMEOUT__' ? 'TIMEOUT' : 'ERROR', message };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

function elapsedMs(startNs: bigint): number {
  return Number((process.hrtime.bigint() - startNs) / 1_000_000n);
}

// ---------------------------------------------------------------------------
// main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const runStartedAt = new Date().toISOString();

  const rawUrl = process.env.DATABASE_URL;
  const databaseIdentity = parseDatabaseIdentity(rawUrl, process.env.NODE_ENV);

  console.log('=== ADR-014 LOCAL SHADOW EVIDENCE RUNNER — SALT-OKUMA (SHADOW_ONLY) ===');
  console.log(`Hedef DB   : ${databaseIdentity.host}:${databaseIdentity.port}/${databaseIdentity.databaseName}`);
  console.log(`Ortam      : ${databaseIdentity.environment}`);
  console.log('Mod        : READ ONLY + REPEATABLE READ (motor seviyesi), yalnız SELECT');
  console.log('Yetki      : PR-11 NOT AUTHORIZED · Runtime cutover NOT AUTHORIZED · consumer switch YOK · flag DEĞİŞMEZ');
  console.log(`Girdi      : ${args.input}\n`);

  if (!rawUrl) {
    console.error('DATABASE_URL tanımsız. Runner çalıştırılamaz (yerel DB gerekli).');
    process.exitCode = 1;
    return;
  }

  const inputManifest = readInputManifest(args.input);
  if (!inputManifest) {
    console.log(`Girdi manifesti bulunamadı: '${args.input}'.`);
    console.log('Owner tarafından seçilmiş GERÇEK yerel case seti gerekli — runner veri ÜRETMEZ.');
    console.log('Örnek şema için runbook: docs/runbooks/adr014-local-shadow-evidence-runner.md');
    return; // fabrikasyon yok, temiz çıkış
  }
  if (inputManifest.cases.length === 0) {
    console.log('Girdi manifesti boş (0 case). Çalıştırılacak temsili case yok.');
    return;
  }

  // Read-only bağlantıyı bootstrap ÖNCESİ kur — PrismaService env'den okur.
  process.env.DATABASE_URL = buildReadOnlyDatabaseUrl(rawUrl);

  const app = await NestFactory.createApplicationContext(BalanceDisplayShadowDiffModule, {
    logger: ['error', 'warn'],
  });

  try {
    const prisma = app.get(PrismaService, { strict: false });
    await verifyReadOnly(prisma);
    console.log('Read-only doğrulandı (transaction_read_only=on, isolation=repeatable read).\n');

    const shadow = app.get(BalanceDisplayShadowDiffService);
    const asOfDefault = inputManifest.asOfDefault ?? runStartedAt.slice(0, 10);

    const inputs: core.CaseShadowInput[] = [];
    const evidences: core.CaseEvidence[] = [];
    let engineSourceVersion = '(unavailable)';

    for (let i = 0; i < inputManifest.cases.length; i += 1) {
      const c = inputManifest.cases[i];
      const asOfDate = c.asOfDate ?? asOfDefault;
      const generatedAt = new Date().toISOString();
      const opaqueId = core.buildOpaqueId(i);

      const startNs = process.hrtime.bigint();
      const result = await runCompareWithTimeout(
        () => shadow.compare(c.tenantId, c.caseId, asOfDate, generatedAt),
        args.timeoutMs,
      );
      const orchestrationDurationMs = elapsedMs(startNs);

      let input: core.CaseShadowInput;
      if (result.ok) {
        const report = result.report;
        if (report.sourceVersion && report.sourceVersion !== 'balance-display:unavailable') {
          engineSourceVersion = report.sourceVersion;
        }
        input = {
          tenantId: c.tenantId,
          caseId: c.caseId,
          asOfDate,
          scenarioClass: c.scenarioClass ?? 'UNLABELED',
          currencyGroup: c.currencyGroup ?? 'UNLABELED',
          caseSizeBucket: c.caseSizeBucket ?? 'UNLABELED',
          outcome: determineOutcome(report),
          legacyAvailable: report.sources.legacyCalculationSummary.available,
          canonicalAvailable: report.sources.canonicalBalanceDisplay.available,
          currency: report.currency,
          totalsDiffs: report.totals.diffs.map((d) => toFieldDiffInput(d)),
          bucketDiffs: report.bucketDiffs.map((d: ShadowBucketDiff) => toFieldDiffInput(d, d.bucket)),
          readinessBlockers: report.cutoverReadiness.blockers,
          comparabilityBlockerCodes: report.comparability.blockers.map((b) => b.code),
          diagnosticsCodes: report.diagnostics.map((x) => x.code),
          safeForPrimaryDisplay: report.cutoverReadiness.safeForPrimaryDisplay,
          orchestrationDurationMs,
        };
      } else {
        input = {
          tenantId: c.tenantId,
          caseId: c.caseId,
          asOfDate,
          scenarioClass: c.scenarioClass ?? 'UNLABELED',
          currencyGroup: c.currencyGroup ?? 'UNLABELED',
          caseSizeBucket: c.caseSizeBucket ?? 'UNLABELED',
          outcome: result.reason,
          legacyAvailable: false,
          canonicalAvailable: false,
          currency: null,
          totalsDiffs: [],
          bucketDiffs: [],
          readinessBlockers: [`RUNNER_${result.reason}`],
          comparabilityBlockerCodes: [],
          diagnosticsCodes: [],
          safeForPrimaryDisplay: false,
          orchestrationDurationMs,
        };
      }

      inputs.push(input);
      evidences.push(core.buildCaseEvidence(input, opaqueId));
      console.log(
        `  ${opaqueId}  ${input.outcome.padEnd(20)} verdict=${evidences[i].caseVerdict.padEnd(11)} ${orchestrationDurationMs}ms`,
      );
    }

    const runEndedAt = new Date().toISOString();
    const tenantCount = new Set(inputs.map((x) => x.tenantId)).size;
    const aggregate = core.aggregateEvidence(evidences);

    const meta: core.EvidenceRunMeta = {
      runnerVersion: core.RUNNER_VERSION,
      canonicalSha: process.env.ADR014_CANONICAL_SHA ?? '(unset — ADR014_CANONICAL_SHA ayarlayın)',
      policyReference: POLICY_REFERENCE,
      contractReference: CONTRACT_REFERENCE,
      engineSourceVersion,
      datasetVersion: inputManifest.datasetVersion ?? '(unlabeled)',
      database: databaseIdentity,
      readOnlyVerified: true,
      runStartedAt,
      runEndedAt,
    };

    const manifest = core.buildManifest(meta, evidences, tenantCount);
    const summary = core.buildSummary(meta, aggregate);
    const detail = core.buildDetail(evidences);
    const correlation = core.buildCorrelationMap(
      inputs,
      evidences.map((e) => e.opaqueId),
    );

    const outDir = args.out ?? path.join('evidence', 'adr014', `run-${runStartedAt.replace(/[:.]/g, '-')}`);
    fs.mkdirSync(outDir, { recursive: true });
    fs.writeFileSync(path.join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf8');
    fs.writeFileSync(path.join(outDir, 'summary.json'), JSON.stringify(summary, null, 2), 'utf8');
    fs.writeFileSync(path.join(outDir, 'detail.json'), JSON.stringify(detail, null, 2), 'utf8');
    fs.writeFileSync(path.join(outDir, 'correlation.map.json'), JSON.stringify(correlation, null, 2), 'utf8');

    // Manifest hash'i, 4 dosya YAZILDIKTAN SONRA hesaplanır — kendi dosyasını hash'lemez.
    const sha = computeReportManifest(outDir, OUTPUT_FILES);
    fs.writeFileSync(path.join(outDir, 'manifest.sha256'), sha, 'utf8');

    console.log('\n=== ÖZET ===');
    console.log(`Toplam case          : ${aggregate.totalCases}`);
    console.log(`Tenant               : ${tenantCount}`);
    console.log(`0-cent temiz         : ${aggregate.zeroCent.cleanCases}`);
    console.log(`Finansal discrepancy : ${aggregate.zeroCent.discrepancyCases}`);
    console.log(`Fail-closed          : ${aggregate.zeroCent.failClosedCases}`);
    console.log(`Genel 0-cent temiz   : ${aggregate.zeroCent.overallClean ? 'EVET' : 'HAYIR'}`);
    const lat = aggregate.latencyMs.orchestration;
    console.log(`Latency (SUCCESS)    : p50=${lat.p50Ms ?? '—'}ms p95=${lat.p95Ms ?? '—'}ms p99=${lat.p99Ms ?? '—'}ms (n=${lat.count})`);
    console.log(`\nKanıt yazıldı: ${outDir}/ (${OUTPUT_FILES.join(' + ')} + manifest.sha256)`);
    console.log('NOT: Bu SALT-OKUMA bir shadow kanıt koşumudur; hiçbir satır oluşturulmadı/değiştirilmedi.');
    console.log('Kanıt YEREL kalır (evidence/ .gitignore) · PR-11 NOT AUTHORIZED · runtime cutover NOT AUTHORIZED.');
  } finally {
    await app.close();
  }
}

if (require.main === module) {
  main().catch((e) => {
    console.error('ADR-014 shadow evidence runner HATA:', e);
    process.exit(1);
  });
}

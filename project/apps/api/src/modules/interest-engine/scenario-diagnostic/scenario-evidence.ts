/**
 * ADR-014 Wave 0.3 — Scenario Evidence Model (SAF katman).
 *
 * Acceptance Criteria (adr-014-wave0-acceptance-criteria.md) hizası:
 * - §8 Evidence Classification: buradaki sınıflar §8'de ZATEN tanımlı beş
 *   sınıfın birebir kod yansımasıdır — YENİ evidence sınıfı/enum'u ÜRETİLMEZ.
 * - §12 ScenarioAssertion Boundary: bu katman HESAPLAMAZ — yalnız
 *   "actual runtime observation vs expected evidence" karşılaştırır.
 *   Fallback formül, hukuki anlam taşıyan tolerans, tahsis/TBK100/fee/
 *   tarife/reversal semantiği YOKTUR ve EKLENEMEZ.
 * - §14 Journal/snapshot notu: PR-8a official snapshot TAKLIT ETMEZ;
 *   display'deki read-only readiness/snapshotAvailable sinyalini gozlemler.
 *
 * SAFLIK KURALI (statik guard ile korunur —
 * __tests__/scenario-diagnostic.static.spec.ts):
 * - Prisma importu YOK, Nest importu YOK, ortam değişkeni erişimi YOK.
 * - Motor/tahsis/materializer importu YOK — karşılaştırıcı hesaplayamaz.
 * - Yalnız W0.1 contract'ı ve display tiplerinden `import type`.
 *
 * Çağrıldığı yerler:
 * - Test-support: scenario-diagnostic-runner.ts (bu dizin) → spec dosyaları
 * - Runtime çağıranı YOK — bilinçli (production wiring yasak, §16).
 */
import type { ScenarioExpected, ScenarioId } from '../scenario-support/scenario-definition';
import type {
  CaseBalanceDisplay,
  BalanceDisplayDiagnosticCode,
} from '../orchestration/case-balance-display';

/**
 * §8'in beş evidence sınıfı — birebir; genişletme governance amendment'tır.
 */
export type ScenarioEvidenceClassification =
  | 'Test Fixture'
  | 'Deterministic Setup'
  | 'Diagnostic Output'
  | 'Expected Evidence'
  | 'Actual Runtime Observation';

/** Diagnostic koşum modu — dual mode'un iki kanadı (frozen owner kararı d). */
export type ScenarioDiagnosticMode = 'ORGANIC_READINESS' | 'SYNTHETIC_SCENARIO';

/** Tek bir beklenen-vs-gözlenen uyuşmazlığı; değerler string'e indirgenmiş RAPOR halidir. */
export interface ScenarioEvidenceMismatch {
  field: string;
  expected: string;
  actual: string;
}

/**
 * Expected-vs-actual karşılaştırma sonucu. `match` yalnız KARŞILAŞTIRILAN
 * alanlar üzerinden anlamlıdır.
 */
export interface ScenarioEvidenceComparison {
  match: boolean;
  mismatches: ScenarioEvidenceMismatch[];
  /** Serbest-metin durum notları (örn. SNAPSHOT_PATH_NOT_EXERCISED). */
  notes: string[];
}

/**
 * Bir diagnostic koşumunun evidence kaydı. Organik modda `expected` ve
 * `comparison` YOKTUR (organik koşum gözlemdir, beklenti sözleşmesi taşımaz);
 * synthetic modda her ikisi de zorunludur.
 */
export interface ScenarioEvidenceRecord {
  scenarioId: ScenarioId;
  mode: ScenarioDiagnosticMode;
  classifications: ScenarioEvidenceClassification[];
  /** Gözlenen üretim yüzeyi — `toCaseBalanceDisplay` çıktısı (özet alanlar). */
  observedAuthority: CaseBalanceDisplay['authority'];
  observedStatus: CaseBalanceDisplay['status'];
  observedBlockerCodes: BalanceDisplayDiagnosticCode[];
  observedSnapshotStatus: CaseBalanceDisplay['readiness']['status'];
  observedSnapshotAvailable: CaseBalanceDisplay['snapshotAvailable'];
  observedPrimaryDisplayEligible: CaseBalanceDisplay['readiness']['primaryDisplayEligible'];
  observedReadinessBlockerCodes: CaseBalanceDisplay['readiness']['blockers'][number]['code'][];
  observedTraceAuthority: CaseBalanceDisplay['trace']['authority'];
  observedTracePersisted: CaseBalanceDisplay['trace']['persisted'];
  observedAllocationTraceCount: number;
  observedNonOfficialSnapshotKind: CaseBalanceDisplay['nonOfficialSnapshot']['kind'];
  observedNonOfficialSnapshotOfficial: CaseBalanceDisplay['nonOfficialSnapshot']['official'];
  observedNonOfficialSnapshotPersisted: CaseBalanceDisplay['nonOfficialSnapshot']['persisted'];
  observedNonOfficialSnapshotAuthority: CaseBalanceDisplay['nonOfficialSnapshot']['authority'];
  observedSnapshotBlockerCodes: CaseBalanceDisplay['nonOfficialSnapshot']['blockerCodes'];
  /** TWO_TENANT_ISOLATION kurulumunda secondary tenant case'i goremedi mi. */
  observedTenantIsolation?: boolean;
  expected?: ScenarioExpected;
  comparison?: ScenarioEvidenceComparison;
}

/**
 * IEEE-754 temsil gürültüsü eşiği (yarım kuruş altı). Hukuki anlam TAŞIMAZ:
 * display katmanı zaten kuruşa yuvarlar (`round2`); bu eşik yalnız float
 * karşılaştırmasının teknik kararlılığı içindir (§12 tolerans yasağının
 * istisnası değil, kapsamı dışıdır).
 */
const FLOAT_NOISE_EPSILON = 0.005;

const numbersEffectivelyEqual = (a: number, b: number): boolean =>
  Math.abs(a - b) < FLOAT_NOISE_EPSILON;

/** Actual display'den severity=BLOCKER kodlarının sıralı-tekil seti. */
export function extractBlockerCodes(display: CaseBalanceDisplay): BalanceDisplayDiagnosticCode[] {
  const codes = display.diagnostics
    .filter((d) => d.severity === 'BLOCKER')
    .map((d) => d.code);
  return [...new Set(codes)].sort();
}

/**
 * Expected-vs-actual karşılaştırıcı (§12: HESAPLAMAZ).
 *
 * Karşılaştırılanlar:
 * - authority (birebir eşitlik)
 * - blockerCodes (set eşitliği; actual = severity BLOCKER diagnostic kodları)
 * - perCurrencyStatus (expected'ta verilen her currency için OK/SKIPPED)
 * - totals (YALNIZ expected.totals'ta verilen alanlar; null==null dahil birebir,
 *   sayılar float-gürültü eşiğiyle)
 * - snapshotStatus (PR-8a read-only readiness sinyali; official snapshot DEGIL)
 */
export function compareScenarioEvidence(
  expected: ScenarioExpected,
  actual: CaseBalanceDisplay,
): ScenarioEvidenceComparison {
  const mismatches: ScenarioEvidenceMismatch[] = [];
  const notes: string[] = [];

  if (actual.authority !== expected.authority) {
    mismatches.push({
      field: 'authority',
      expected: expected.authority,
      actual: actual.authority,
    });
  }

  const actualBlockers = extractBlockerCodes(actual);
  const expectedBlockers = [...new Set(expected.blockerCodes)].sort();
  if (JSON.stringify(actualBlockers) !== JSON.stringify(expectedBlockers)) {
    mismatches.push({
      field: 'blockerCodes',
      expected: expectedBlockers.join(',') || '(yok)',
      actual: actualBlockers.join(',') || '(yok)',
    });
  }

  for (const [currency, expectedStatus] of Object.entries(expected.perCurrencyStatus)) {
    const row = actual.currencies.find((c) => c.currency === currency);
    const actualStatus = row ? (row.skipped ? 'SKIPPED' : 'OK') : 'MISSING';
    if (actualStatus !== expectedStatus) {
      mismatches.push({
        field: `perCurrencyStatus.${currency}`,
        expected: expectedStatus,
        actual: actualStatus,
      });
    }
  }

  if (expected.totals) {
    for (const [key, expectedValue] of Object.entries(expected.totals)) {
      const actualValue = actual.totals[key as keyof typeof actual.totals];
      const bothNull = expectedValue == null && actualValue == null;
      const bothNumbers = typeof expectedValue === 'number' && typeof actualValue === 'number';
      const equal = bothNull || (bothNumbers && numbersEffectivelyEqual(expectedValue, actualValue));
      if (!equal) {
        mismatches.push({
          field: `totals.${key}`,
          expected: String(expectedValue),
          actual: String(actualValue),
        });
      }
    }
  }

  if (expected.snapshotStatus !== undefined) {
    if (actual.readiness.status !== expected.snapshotStatus) {
      mismatches.push({
        field: 'snapshotStatus',
        expected: expected.snapshotStatus,
        actual: actual.readiness.status,
      });
    }
  }

  return { match: mismatches.length === 0, mismatches, notes };
}

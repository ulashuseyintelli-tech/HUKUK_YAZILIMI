/**
 * ADR-014 Wave 0.1 — Saf Scenario Contract (ScenarioDefinition).
 *
 * Amaç: Golden fixture testleri (in-memory) ile DB-gated readiness doğrulaması
 * (W0.2 materializer + W0.3 diagnostic synthetic mode) için TEK ortak senaryo
 * tanımı. Owner arbitration (2026-07-10, bağlayıcı):
 *
 *   Scenario Definition → Materializer → DB
 *   ASLA Materializer → Scenario değil — materializer bu contract'ı TÜKETİR,
 *   sahiplenmez. Bu dosya domain owner'dır.
 *
 * SAFLIK KURALI (bağlayıcı, statik guard ile korunur —
 * __tests__/scenario-support.static.spec.ts):
 * - Prisma importu YOK, Nest importu YOK, DB erişimi YOK, ortam değişkeni erişimi YOK.
 * - Yalnız interest-engine domain/display tiplerinden `import type`.
 * - Registry / platform / executable-plugin sistemi BİLİNÇLİ olarak yok
 *   (owner kararı: "ADR-014 bir Scenario Platform istemiyor" — düz typed
 *   liste yeter; registry ancak ikinci bounded context gelince).
 *
 * Çağrıldığı yerler:
 * - Test-support: scenario-builder.ts (bu dizin) → spec dosyaları
 * - Runtime çağıranı YOK — bilinçli (production wiring yasak, W0.1 kapsamı)
 * - Gelecek tüketiciler (ayrı PR'lar): W0.2 materializer, W0.3 diagnostic
 *   synthetic mode, Wave 1-2 senaryo testleri
 */
import type { ClaimBucket, Payment } from '../types/domain.types';
import type { CalculationOptions } from '../types/calculation.types';
import type { Currency } from '../types/common.types';
import type {
  BalanceDisplayAuthority,
  BalanceDisplayDiagnosticCode,
  BalanceDisplayTotals,
} from '../orchestration/case-balance-display';

/** Stabil senaryo kimliği — unit ve DB-gated koşumlar AYNI id ile karşılaştırılır (evidence model, W0.3). */
export type ScenarioId = string;

/** Bir para biriminin beklenen sonucu: canonical sonuç üretildi mi, yoksa fail-closed skip mi. */
export type ScenarioPerCurrencyStatus = 'OK' | 'SKIPPED';

/**
 * Snapshot katmanı (ADR-014 PR-8) beklentisi.
 * NOT: Snapshot katmanı henüz main'de değil (Wave 2 / PR-8b'de gelecek);
 * bu yüzden tip yerel literal union olarak tanımlı ve alan opsiyonel.
 * PR-8b main'e indiğinde canonical tiple hizalanması beklenir
 * (değerler o katmanın SAFE/UNSAFE/BLOCKED/DIAGNOSTIC_ONLY sözleşmesiyle birebir).
 */
export type ScenarioSnapshotExpectation = 'SAFE' | 'UNSAFE' | 'BLOCKED' | 'DIAGNOSTIC_ONLY';

/** W0.2 materializer'ın tenant kurulum niyeti — declarative; Prisma şekli DEĞİL. */
export type ScenarioTenantSetup = 'SINGLE' | 'TWO_TENANT_ISOLATION';

/** Saf domain girdisi — engine.computeBalance'ın beslendiği kavramlarla sınırlı. */
export interface ScenarioDomainInput {
  claimBuckets: ClaimBucket[];
  payments: Payment[];
  /** ISO YYYY-MM-DD */
  asOfDate: string;
  /** ISO YYYY-MM-DD — PR-5 (takip tarihi öncesi/sonrası faiz) senaryoları için. */
  enforcementDate?: string;
  options?: Partial<CalculationOptions>;
}

/** Beklenen sonuç sözleşmesi — W0.3 evidence model'in expected-vs-actual karşılaştırma tarafı. */
export interface ScenarioExpected {
  perCurrencyStatus: Record<string, ScenarioPerCurrencyStatus>;
  blockerCodes: BalanceDisplayDiagnosticCode[];
  authority: BalanceDisplayAuthority;
  snapshotStatus?: ScenarioSnapshotExpectation;
  totals?: Partial<BalanceDisplayTotals>;
}

/**
 * Persistence NİYETİ — yalnız declarative. W0.2 materializer bunu okuyup DB
 * satırlarını kendisi kurar; bu contract Prisma/persistence detayı TAŞIMAZ
 * (owner kararı: "W0.2'nin detaylarını W0.1 içine çekme").
 */
export interface ScenarioPersistenceIntent {
  tenantSetup: ScenarioTenantSetup;
  currency: Currency;
}

/**
 * Tek kanonik senaryo tanımı. Wave 1-2 risk senaryoları (reversal net-zero,
 * NO_BUCKETS, FX-missing, TBK100 sırası, partial-payment interest-base, ...)
 * bu tipin DÜZ TYPED LİSTELERİ olarak ifade edilir — registry değil.
 */
export interface ScenarioDefinition {
  id: ScenarioId;
  /** İnsan-okur kısa başlık (opsiyonel). */
  title?: string;
  domainInput: ScenarioDomainInput;
  expected: ScenarioExpected;
  persistenceIntent: ScenarioPersistenceIntent;
}

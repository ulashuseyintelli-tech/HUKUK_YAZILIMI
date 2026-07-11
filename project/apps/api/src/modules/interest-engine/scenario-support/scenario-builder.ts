/**
 * ADR-014 Wave 0.1 — Minimal shared domain builder.
 *
 * `makeBalance`, orchestration/__tests__/case-balance-display.spec.ts içindeki
 * TEK main-mevcut kopyadan TAŞINDI — gövde birebir, davranış aynıdır
 * (W0.1 owner kararı: yalnız main'de var olan tek makeBalance adoption;
 * branch-only spec porting YOK, 15-dosyalık geniş helper konsolidasyonu YOK).
 *
 * scenarioClaimBucket / scenarioPayment / defineScenario: ScenarioDefinition
 * contract'ını kuran YENİ, saf yardımcılar — Wave 1-2 senaryoları ve W0.2/W0.3
 * bunları tüketecek.
 *
 * SAFLIK KURALI (bağlayıcı, statik guard ile korunur):
 * Prisma/Nest/DB/ortam-değişkeni erişimi yok; yalnız `import type`.
 *
 * Çağrıldığı yerler:
 * - orchestration/__tests__/case-balance-display.spec.ts → makeBalance
 * - Runtime çağıranı YOK — bilinçli (production wiring yasak)
 */
import type { CaseBalanceResult } from '../orchestration/case-balance.service';
import type { ClaimBucket, Payment } from '../types/domain.types';
import type { ScenarioDefinition } from './scenario-definition';
import { buildCaseBalanceFeeProjection } from '../orchestration/case-balance-fee-projection';

/**
 * Boş/temel CaseBalanceResult iskeleti (test fixture).
 * Gövde, case-balance-display.spec.ts'teki orijinal makeBalance ile BİREBİR aynıdır.
 */
export function makeBalance(overrides: Partial<CaseBalanceResult> = {}): CaseBalanceResult {
  return {
    asOfDate: '2026-06-23',
    source: 'COLLECTION',
    currencyResults: [],
    projections: { costs: {}, ancillaries: {} },
    feeProjection: buildCaseBalanceFeeProjection({ sourceItems: [], currencyResults: [] }),
    diagnostics: { fatal: [], assembler: [], payments: [], currency: [], perCurrency: [] },
    overpayments: { held: [], blocked: [] },
    ...overrides,
  } as unknown as CaseBalanceResult;
}

/** Varsayılanları makul tek-TRY yasal-faiz kalemi olan saf ClaimBucket fixture'ı. */
export function scenarioClaimBucket(overrides: Partial<ClaimBucket> = {}): ClaimBucket {
  return {
    id: 'claim-1',
    amount: 1000,
    currency: 'TRY',
    startDate: '2026-01-01',
    interestType: 'LEGAL_3095',
    dayCountBasis: 365,
    ...overrides,
  } as ClaimBucket;
}

/** Saf Payment fixture'ı. */
export function scenarioPayment(overrides: Partial<Payment> = {}): Payment {
  return {
    id: 'payment-1',
    date: '2026-02-01',
    amount: 100,
    currency: 'TRY',
    ...overrides,
  } as Payment;
}

/**
 * Tip-çıkarımı/okunabilirlik için kimlik fonksiyonu — senaryolar düz typed
 * liste olarak yazılır (registry bilinçli olarak YOK, owner kararı).
 */
export function defineScenario(definition: ScenarioDefinition): ScenarioDefinition {
  return definition;
}

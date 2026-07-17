/**
 * DBP-P2-BP-01 (LRV-03B, owner OPTION A, 2026-07-17) — All-passive case automation stop.
 *
 * KANONİK İŞ KURALI: Bir dosyada CaseDebtor kaydı VARSA ve TÜMÜ PASSIVE ise, case-seviyesi
 * otomasyon fail-closed durur (kontrollü no-op): hiçbir rule değerlendirilmez, stage değişmez,
 * EnforcementAction yazılmaz, side-effect üretilmez. En az bir ACTIVE varsa devam eder. Hiç
 * CaseDebtor yoksa (debtorless) AS-IS devam eder ("tüm borçlular pasif" ≠ "borçlu ilişkisi yok").
 *
 * Guard `WorkflowEngine.processCase` içindedir; hem 5-dk cron (`processPendingCases`) hem manuel
 * endpoint (`processCaseManually`) aynı merkezi yolu kullandığı için ikisi de aynı sonucu alır.
 * Bu davranış YENİ hukuki istisna (estate/tereke) üretmez, yalnız mevcut lifecycle verisini okur.
 */

import { CaseDebtorLifecycleStatus } from '@prisma/client';
import { WorkflowEngine } from '../workflow-engine.service';

type Lifecycle = CaseDebtorLifecycleStatus;
const ACTIVE: Lifecycle = CaseDebtorLifecycleStatus.ACTIVE;
const PASSIVE: Lifecycle = CaseDebtorLifecycleStatus.PASSIVE;

function buildEngine() {
  const ruleEngine = {
    evaluateRules: jest.fn().mockResolvedValue([]),
    evaluateKambiyoRules: jest.fn().mockResolvedValue([]),
    evaluateRentalRules: jest.fn().mockResolvedValue([]),
    checkNotificationExpiry: jest.fn().mockResolvedValue(null),
  };
  const prisma: any = {
    case: { findFirst: jest.fn(), update: jest.fn().mockResolvedValue({}) },
    decisionLog: { create: jest.fn().mockResolvedValue({}) },
    $transaction: jest.fn().mockResolvedValue(undefined),
    enforcementAction: { findFirst: jest.fn(), create: jest.fn() },
  };
  const svc = new WorkflowEngine(prisma, ruleEngine as any, {} as any);
  return { svc, prisma, ruleEngine };
}

/**
 * processCase, `prisma.case.findFirst`'i İKİ kez çağırır:
 *   1) buildContext(): debtors[].debtor.assets + collections + lifecycleEvents + enforcementActions
 *   2) caseData: formType + debtors[].lifecycleStatus (+ isAutoMode)
 * Her ikisini de `mockResolvedValueOnce` ile sırayla besleriz.
 */
function primeCase(
  prisma: any,
  opts: { isAutoMode?: boolean; lifecycles: Lifecycle[] },
) {
  const { isAutoMode = true, lifecycles } = opts;
  const buildContextRow = {
    id: 'case1',
    tenantId: 'tenant1',
    workflowStage: 'PAYMENT_ORDER',
    principalAmount: 1000,
    collections: [],
    debtors: lifecycles.map((ls) => ({ lifecycleStatus: ls, debtor: { assets: [] } })),
    lifecycleEvents: [],
    enforcementActions: [],
  };
  const caseDataRow = {
    id: 'case1',
    tenantId: 'tenant1',
    isAutoMode,
    formType: null,
    debtors: lifecycles.map((ls) => ({ lifecycleStatus: ls })),
  };
  prisma.case.findFirst
    .mockResolvedValueOnce(buildContextRow)
    .mockResolvedValueOnce(caseDataRow);
}

function expectNoSideEffects(prisma: any, ruleEngine: any) {
  expect(ruleEngine.evaluateRules).not.toHaveBeenCalled();
  expect(ruleEngine.evaluateKambiyoRules).not.toHaveBeenCalled();
  expect(ruleEngine.evaluateRentalRules).not.toHaveBeenCalled();
  expect(ruleEngine.checkNotificationExpiry).not.toHaveBeenCalled();
  expect(prisma.decisionLog.create).not.toHaveBeenCalled();
  expect(prisma.case.update).not.toHaveBeenCalled();
  expect(prisma.$transaction).not.toHaveBeenCalled(); // createEnforcementAction $transaction kullanır
  expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
}

describe('DBP-P2-BP-01 — all-passive case automation stop', () => {
  it('1) TÜM CaseDebtor PASSIVE → kontrollü no-op (hiçbir rule/stage/enforcement/side-effect yok)', async () => {
    const { svc, prisma, ruleEngine } = buildEngine();
    primeCase(prisma, { lifecycles: [PASSIVE, PASSIVE] });

    await expect(svc.processCase('case1', 'tenant1')).resolves.toBeUndefined();

    expectNoSideEffects(prisma, ruleEngine);
  });

  it('1b) tek CaseDebtor ve PASSIVE → kontrollü no-op', async () => {
    const { svc, prisma, ruleEngine } = buildEngine();
    primeCase(prisma, { lifecycles: [PASSIVE] });

    await svc.processCase('case1', 'tenant1');

    expectNoSideEffects(prisma, ruleEngine);
  });

  it('2) en az bir ACTIVE + en az bir PASSIVE → otomasyon DEVAM eder (rule değerlendirilir)', async () => {
    const { svc, prisma, ruleEngine } = buildEngine();
    primeCase(prisma, { lifecycles: [ACTIVE, PASSIVE] });

    await svc.processCase('case1', 'tenant1');

    expect(ruleEngine.evaluateRules).toHaveBeenCalledTimes(1);
    expect(ruleEngine.checkNotificationExpiry).toHaveBeenCalledTimes(1);
  });

  it('3) TÜM CaseDebtor ACTIVE → otomasyon DEVAM eder', async () => {
    const { svc, prisma, ruleEngine } = buildEngine();
    primeCase(prisma, { lifecycles: [ACTIVE, ACTIVE] });

    await svc.processCase('case1', 'tenant1');

    expect(ruleEngine.evaluateRules).toHaveBeenCalledTimes(1);
  });

  it('4) CaseDebtor sayısı 0 (debtorless) → AS-IS / otomasyon DEVAM eder (all-passive DEĞİL)', async () => {
    const { svc, prisma, ruleEngine } = buildEngine();
    primeCase(prisma, { lifecycles: [] });

    await svc.processCase('case1', 'tenant1');

    expect(ruleEngine.evaluateRules).toHaveBeenCalledTimes(1);
  });

  it('5) isAutoMode=false + tüm borçlular PASSIVE → mevcut erken çıkış korunur (rule değerlendirilmez, all-passive guard\'ına gelinmez)', async () => {
    const { svc, prisma, ruleEngine } = buildEngine();
    primeCase(prisma, { isAutoMode: false, lifecycles: [PASSIVE, PASSIVE] });

    await svc.processCase('case1', 'tenant1');

    expectNoSideEffects(prisma, ruleEngine);
  });

  it('6) cross-tenant / bulunmayan case (buildContext NotFoundException) → istisna dışarı sızmaz, rule değerlendirilmez (mevcut try/catch)', async () => {
    const { svc, prisma, ruleEngine } = buildEngine();
    prisma.case.findFirst.mockResolvedValue(null); // buildContext ilk sorguda null → NotFoundException

    await expect(svc.processCase('case1', 'other-tenant')).resolves.toBeUndefined();

    expect(ruleEngine.evaluateRules).not.toHaveBeenCalled();
  });

  it('kanonik davranış sınırı: all-passive guard yalnızca lifecycleStatus okur; Case.isAutoMode / lifecycle / status DEĞİŞTİRİLMEZ (case.update çağrılmaz)', async () => {
    const { svc, prisma } = buildEngine();
    primeCase(prisma, { lifecycles: [PASSIVE, PASSIVE] });

    await svc.processCase('case1', 'tenant1');

    // no-op: hiçbir mutation (update/create/transaction) yok — sadece read
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cron/manual parity: guard merkezi processCase içindedir — her iki tüketici (cron + manuel) aynı çağrıyı yapar, aynı no-op sonucu alır', async () => {
    // processPendingCases (cron) ve processCaseManually ikisi de workflowEngine.processCase(caseId, tenantId)
    // çağırır; guard bu ortak metotta olduğundan iki yol da aynı davranışı miras alır. Burada ortak
    // metodun kendisini iki farklı çağrıyla (aynı all-passive girdi) çalıştırıp determinizmi doğruluyoruz.
    const first = buildEngine();
    primeCase(first.prisma, { lifecycles: [PASSIVE] });
    await first.svc.processCase('case1', 'tenant1');
    expectNoSideEffects(first.prisma, first.ruleEngine);

    const second = buildEngine();
    primeCase(second.prisma, { lifecycles: [PASSIVE, PASSIVE, PASSIVE] });
    await second.svc.processCase('case1', 'tenant1');
    expectNoSideEffects(second.prisma, second.ruleEngine);
  });
});

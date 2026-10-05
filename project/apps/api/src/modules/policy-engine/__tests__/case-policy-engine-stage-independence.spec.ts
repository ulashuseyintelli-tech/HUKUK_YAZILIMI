import { CasePolicyEngine } from '../case-policy-engine.service';
import { StateMachineService } from '../state-machine';
import { GateCheckerService } from '../gate-checker';
import { ActionCode } from '../types/action-code.enum';
import { ACTION_MATRIX, isStageIndependent } from '../types/action-matrix.interface';
import { DecisionCode } from '../types/policy-decision.interface';

/**
 * AŞAMADAN BAĞIMSIZ EYLEM KİLİDİ (owner kararı 8, 2026-10-05).
 *
 * Karar: masraf kesinleştirme / onaylama / reddetme / ödeme kaydı dosya aşamasından bağımsızdır; kapalı / arşiv reddi, büro
 * sınırı, aktör yetkisi, talebin kendi durum geçişleri ve denetim kaydı korunur. "Karar motorunu bütünüyle kaldırma veya 48
 * eylemi topluca açma. Diğer eylemlerin aşama sözlüğünü bu yamaya katma."
 *
 * Bu test GERÇEK CasePolicyEngine + GERÇEK StateMachineService + GERÇEK GateCheckerService ile koşar (yalnız veri erişimi sahte).
 * Beklenen sonuç matrisi (48 eylem × veritabanının taşıdığı 13 aşama) DOĞRUDAN yazılıdır — durum makinesinden türetilmez:
 * bir eylem daha açılırsa (ya da bu eylem kapanırsa) test düşer. Matris, düzeltme öncesi main'de ölçülen davranıştır
 * (ASAMA-SOZLUGU-EVIDENCE-20261002): 45 eylem hiçbir aşamada izinli değil; UYAP_SEND / REQUEST_EXPENSE / APPROVE_EXPENSE yalnız INITIAL.
 *
 * KAPSAM SINIRI: bu test karar motorunu kilitler. Masraf UÇLARININ uçtan uca davranışı (HTTP + veritabanı) için bkz.
 * expense-request/__tests__/expense-stage-independent-actions.http.db-gated.integration.spec.ts.
 */

const DB_STAGES = [
  'INITIAL', 'PAYMENT_ORDER', 'WAITING_RESPONSE', 'OBJECTION', 'ENFORCEMENT', 'SEIZURE', 'SALE_REQUEST',
  'AUCTION', 'COLLECTION', 'PARTIAL_PAYMENT', 'FULL_PAYMENT', 'CLOSED', 'SUSPENDED',
] as const;

/** Düzeltme sonrası beklenen: eylem → izinli aşamalar (listede olmayan eylem hiçbir aşamada izinli DEĞİLDİR). */
const EXPECTED_ALLOWED_STAGES: Partial<Record<ActionCode, readonly string[]>> = {
  [ActionCode.APPROVE_EXPENSE]: DB_STAGES, // owner kararı 8: tek değişen eylem
  [ActionCode.UYAP_SEND]: ['INITIAL'],
  [ActionCode.REQUEST_EXPENSE]: ['INITIAL'],
};

type Fixture = { engine: CasePolicyEngine; decisionLog: jest.Mock; setStage: (stage: string) => void };

function buildEngine(options: { facts?: Record<string, unknown>; gatesBlocked?: boolean } = {}): Fixture {
  let stage = 'INITIAL';
  const caseRow = () => ({ id: 'case-1', caseStatus: 'DERDEST', workflowStage: stage, type: 'GENERAL_EXECUTION', subType: null, updatedAt: new Date('2026-10-05T10:00:00Z') });
  const prisma: any = {
    case: {
      findFirst: jest.fn(async ({ where }: any) => (where.tenantId === 'tenant-a' ? { id: where.id } : null)),
      findUnique: jest.fn(async () => caseRow()),
    },
  };
  const facts = new Map<string, unknown>(Object.entries(options.facts ?? {}));
  const factStore: any = { getFacts: jest.fn(async () => facts) };
  const registry: any = { computeAll: jest.fn(async (_c: string, _x: unknown, base: Map<string, unknown>) => base) };
  const decisionLog = jest.fn(async () => 'decision-1');
  const decisionLogger: any = { log: decisionLog };
  const stateMachine = new StateMachineService(prisma);
  const realGates = new GateCheckerService();
  // Aşama matrisinde yalnız durum makinesinin etkisi ölçülür: kapılar ayrı testte GERÇEK olarak koşar.
  const gateChecker: any = options.gatesBlocked === false ? { checkGates: async () => ({ blocked: false, reason: 'OK', factsUsed: [] }) } : realGates;
  const engine = new CasePolicyEngine(prisma, factStore, registry, decisionLogger, {} as any, stateMachine, gateChecker, {} as any);
  return { engine, decisionLog, setStage: (s) => { stage = s; } };
}

describe('Aşamadan bağımsız eylem — karar motoru kilidi (gerçek motor + gerçek durum makinesi)', () => {
  it('matriste aşamadan bağımsız işaretli TEK eylem APPROVE_EXPENSE', () => {
    const flagged = ACTION_MATRIX.filter((entry) => entry.stageIndependent === true).map((entry) => entry.actionCode);
    expect(flagged).toEqual([ActionCode.APPROVE_EXPENSE]);
    expect(isStageIndependent(ActionCode.APPROVE_EXPENSE)).toBe(true);
    // Masraf ödeme kaydı eylemleri (karar maddesi bekliyor) ve borçlu tahsilatı AÇILMADI
    expect(isStageIndependent(ActionCode.RECORD_COLLECTION)).toBe(false);
    expect(isStageIndependent(ActionCode.RECORD_EXPENSE_PAYMENT)).toBe(false);
  });

  it('48 eylem × 13 aşama: izinli küme TAM olarak beklenen (yalnız APPROVE_EXPENSE değişti)', async () => {
    const { engine, setStage } = buildEngine({ gatesBlocked: false });
    const actions = Object.values(ActionCode);
    expect(actions.length).toBe(48); // yeni eylem eklenirse bu kilit bilinçli güncellenmeli
    let inspected = 0;
    const actual: Record<string, string[]> = {};
    for (const action of actions) {
      for (const stage of DB_STAGES) {
        setStage(stage);
        const decision = await engine.canPerformAction('tenant-a', 'case-1', action, undefined);
        inspected += 1;
        if (decision.allowed) (actual[action] = actual[action] || []).push(stage);
      }
    }
    expect(inspected).toBe(48 * 13); // 0 = kör
    const expected: Record<string, string[]> = {};
    for (const [action, stages] of Object.entries(EXPECTED_ALLOWED_STAGES)) expected[action] = [...(stages as readonly string[])];
    expect(actual).toEqual(expected);
  });

  it('APPROVE_EXPENSE aşamada reddedilmez; karar günlüğüne "aşamadan bağımsız" notuyla izinli kayıt yazılır', async () => {
    const { engine, decisionLog, setStage } = buildEngine({ gatesBlocked: false });
    setStage('SEIZURE');
    const decision = await engine.canPerformAction('tenant-a', 'case-1', ActionCode.APPROVE_EXPENSE, { expenseId: 'exp-1' });
    expect(decision.allowed).toBe(true);
    expect(decision.code).toBe(DecisionCode.OK);
    expect(decision.reason).toMatch(/aşamadan bağımsız/i);
    expect(decision.decisionId).toBe('decision-1');
    // Denetim kaydı: aşama anlık görüntüsüyle birlikte yazıldı
    expect(decisionLog).toHaveBeenCalledTimes(1);
    const args = decisionLog.mock.calls[0] as unknown[];
    expect(args[1]).toBe(ActionCode.APPROVE_EXPENSE);
    expect((args[5] as { currentState: string }).currentState).toBe('SEIZURE');
    expect((args[3] as { allowed: boolean }).allowed).toBe(true);
  });

  it('APPROVE_EXPENSE INITIAL davranışı DEĞİŞMEDİ (durum makinesi izin verir; gerekçe "OK")', async () => {
    const { engine, setStage } = buildEngine({ gatesBlocked: false });
    setStage('INITIAL');
    const decision = await engine.canPerformAction('tenant-a', 'case-1', ActionCode.APPROVE_EXPENSE, { expenseId: 'exp-1' });
    expect(decision).toMatchObject({ allowed: true, code: DecisionCode.OK, reason: 'OK' });
  });

  describe('korunan kurallar (aşamadan bağımsız eylemde de GERÇEK kapılar çalışır)', () => {
    it('kapalı dosya (caseStatus) her aşamada reddedilir: GATE_BLOCKED / CASE_CLOSED; ret günlüğe yazılır', async () => {
      const { engine, decisionLog, setStage } = buildEngine({ facts: { 'case.is_closed': true } });
      let inspected = 0;
      for (const stage of DB_STAGES) {
        setStage(stage);
        const decision = await engine.canPerformAction('tenant-a', 'case-1', ActionCode.APPROVE_EXPENSE, { expenseId: 'exp-1' });
        inspected += 1;
        expect(decision).toMatchObject({ allowed: false, code: DecisionCode.GATE_BLOCKED });
        expect(decision.blockedBy?.gateCode).toBe('CASE_CLOSED');
      }
      expect(inspected).toBe(13);
      expect(decisionLog).toHaveBeenCalledTimes(13);
      expect(decisionLog.mock.calls.every((call) => (call[3] as { allowed: boolean }).allowed === false)).toBe(true);
    });

    it('arşivdeki dosya her aşamada reddedilir: GATE_BLOCKED / CASE_ARCHIVED', async () => {
      const { engine, setStage } = buildEngine({ facts: { 'case.is_archived': true } });
      for (const stage of DB_STAGES) {
        setStage(stage);
        const decision = await engine.canPerformAction('tenant-a', 'case-1', ActionCode.APPROVE_EXPENSE, { expenseId: 'exp-1' });
        expect(decision).toMatchObject({ allowed: false, code: DecisionCode.GATE_BLOCKED });
        expect(decision.blockedBy?.gateCode).toBe('CASE_ARCHIVED');
      }
    });

    it('büro sınırı: başka büronun dosyası karar motoruna HİÇ girmez (404), karar günlüğü yazılmaz', async () => {
      const { engine, decisionLog, setStage } = buildEngine({ gatesBlocked: false });
      setStage('SEIZURE');
      await expect(engine.canPerformAction('tenant-b', 'case-1', ActionCode.APPROVE_EXPENSE, { expenseId: 'exp-1' })).rejects.toThrow(/Dosya bulunamadi/);
      await expect(engine.canPerformAction('', 'case-1', ActionCode.APPROVE_EXPENSE, undefined)).rejects.toThrow(/cpe_tenant_required/);
      expect(decisionLog).not.toHaveBeenCalled();
    });
  });

  describe('diğer eylemlerin aşama sözlüğü DEĞİŞMEDİ (aşamadan bağımsızlık başka eyleme sızarsa test düşer)', () => {
    it.each([
      ActionCode.RECORD_COLLECTION,
      ActionCode.RECORD_EXPENSE_PAYMENT,
      ActionCode.REQUEST_EXPENSE,
      ActionCode.TRIGGER_HACIZ,
      ActionCode.REQUEST_SALE,
      ActionCode.CLOSE_CASE,
      ActionCode.UYAP_QUERY,
    ])('%s hâlâ AŞAMA denetimine tabi (SEIZURE: Geçersiz aşama)', async (action) => {
      const { engine, setStage } = buildEngine({ gatesBlocked: false });
      setStage('SEIZURE');
      const decision = await engine.canPerformAction('tenant-a', 'case-1', action, undefined);
      expect(decision).toMatchObject({ allowed: false, code: DecisionCode.INVALID_TRANSITION });
      expect(decision.reason).toBe('Geçersiz aşama: SEIZURE');
    });
  });
});

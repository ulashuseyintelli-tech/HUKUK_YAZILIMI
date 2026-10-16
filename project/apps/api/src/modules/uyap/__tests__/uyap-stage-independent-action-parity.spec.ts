import { CasePolicyEngine } from '../../policy-engine/case-policy-engine.service';
import { StateMachineService } from '../../policy-engine/state-machine';
import { COMPILED_STATE_FLOWS } from '../../policy-engine/state-machine/compiled/state-flows.compiled';
import { GateCheckerService } from '../../policy-engine/gate-checker';
import { getGatesForAction } from '../../policy-engine/gate-checker/compiled/gates.compiled';
import { ActionCode, ACTION_RISK_LEVELS, RiskLevel } from '../../policy-engine/types/action-code.enum';
import { getActionMatrixEntry, isStageIndependent } from '../../policy-engine/types/action-matrix.interface';
import { DecisionCode } from '../../policy-engine/types/policy-decision.interface';
import { HARDWARE_ACTIONS } from '../../policy-engine/effective-permission-mapping';
import { OFFICE_WORK_ACTION_CATEGORY } from '../../office-approval/office-work-routing-taxonomy';

/**
 * EŞİTLİK KİLİDİ — güvenlik paketi 01 P1 (owner Ek 90 / Ek 91).
 *
 * Karar: "Yeni UYAP eylem kodları YALNIZ aşama bağımlılığını ayırsın; mevcut diğer politika kapıları korunsun."
 * Bu test, UYAP_DOCUMENT_SUBMIT ve UYAP_LAWSUIT_FILE'ın UYAP_SEND ile AYNI kapı kümesini, riskini, fail modunu ve donanım sınıfını
 * taşıdığını; TEK farkın durum makinesinin aşama reddi olduğunu ve yeni kodların aşama geçişi ÜRETMEDİĞİNİ kilitler.
 * Kapı karşılaştırması statik (derlenmiş kapı listesi) + GERÇEK motor (gerçek kapı denetleyicisi + gerçek durum makinesi; veri
 * erişimi / olgu deposu / karar günlüğü sahte) ile iki kez yapılır.
 */

const NEW_CODES = [ActionCode.UYAP_DOCUMENT_SUBMIT, ActionCode.UYAP_LAWSUIT_FILE] as const;

/** UYAP_SEND'in bugünkü HARD kapıları (owner'ın "korunacak kapılar" listesi; plan EK-1 §P1 tablosu). */
const UYAP_SEND_HARD_GATES = [
  'CASE_CLOSED',
  'CASE_ARCHIVED',
  'EXPENSE_BLOCKING',
  'UYAP_DISABLED',
  'UYAP_TEMPORARILY_UNAVAILABLE_SEND',
  'UYAP_SEND_PRECONDITIONS_UNPROVEN',
  'POWER_OF_ATTORNEY_MISSING',
  // P5 (owner Ek 94, karar a2): vekalete EK dosya ataması kapısı — bilinçli güncelleme (7 → 8).
  'ACTING_LAWYER_NOT_ASSIGNED_TO_CASE',
];

const DB_STAGES = [
  'INITIAL', 'PAYMENT_ORDER', 'WAITING_RESPONSE', 'OBJECTION', 'ENFORCEMENT', 'SEIZURE', 'SALE_REQUEST',
  'AUCTION', 'COLLECTION', 'PARTIAL_PAYMENT', 'FULL_PAYMENT', 'CLOSED', 'SUSPENDED',
] as const;

/** Bütün önkoşulları POZİTİF kanıtlanmış olgu kümesi (vekaletli avukat aktör + açık dosya + masraf yok + UYAP açık). */
const READY_FACTS: Record<string, unknown> = {
  'case.is_closed': false,
  'case.is_archived': false,
  'case.allow_uyap_actions': true,
  'case.has_unpaid_blocking_expense': false,
  'system.uyap_available': true,
  'system.uyap_availability_explicit': true,
  'actor.is_canonical_lawyer': true,
  'actor.has_matching_power_of_attorney': true,
  'poa.is_effective_at_evaluation_time': true,
  'poa.covers_requested_operation': true,
  'authority.is_unambiguous': true,
  'actor.is_assigned_to_case': true, // P5 (owner Ek 94): vekalete EK olarak dosya ataması
};

function buildEngine(facts: Record<string, unknown>) {
  let stage = 'INITIAL';
  const prisma: any = {
    case: {
      findFirst: jest.fn(async ({ where }: any) => (where.tenantId === 'tenant-a' ? { id: where.id } : null)),
      findUnique: jest.fn(async () => ({
        id: 'case-1',
        caseStatus: 'DERDEST',
        isArchived: false,
        workflowStage: stage,
        type: 'GENERAL_EXECUTION',
        subType: null,
        updatedAt: new Date('2026-10-16T10:00:00Z'),
      })),
    },
  };
  const factMap = new Map<string, unknown>(Object.entries(facts));
  const factStore: any = { getFacts: jest.fn(async () => factMap) };
  const registry: any = { computeAll: jest.fn(async (_c: string, _x: unknown, base: Map<string, unknown>) => base) };
  const decisionLog = jest.fn(async () => 'decision-1');
  const engine = new CasePolicyEngine(
    prisma, factStore, registry, { log: decisionLog } as any, {} as any, new StateMachineService(prisma), new GateCheckerService(), {} as any,
  );
  return { engine, decisionLog, setStage: (s: string) => { stage = s; } };
}

const decide = async (facts: Record<string, unknown>, stage: string, action: ActionCode) => {
  const { engine, setStage } = buildEngine(facts);
  setStage(stage);
  const d = await engine.canPerformAction('tenant-a', 'case-1', action, { tenantId: 'tenant-a', authenticatedUserId: 'u-1', evaluatedAt: new Date() });
  return { allowed: d.allowed, decision: d.code, gate: d.blockedBy?.gateCode ?? null };
};

describe('P1 eşitlik kilidi — yeni UYAP kodları = UYAP_SEND kapı kümesi; TEK fark aşama reddi', () => {
  describe('statik: derlenmiş kapılar ve eylem matrisi', () => {
    it('UYAP_SEND HARD kapı kümesi beklenen 8 kapıdır (0 = kör; kapı eksilirse / eklenirse bilinçli güncellenir)', () => {
      const hard = getGatesForAction(ActionCode.UYAP_SEND).filter((g) => g.severity === 'HARD').map((g) => g.gateCode);
      expect(hard).toEqual(UYAP_SEND_HARD_GATES);
    });

    it.each(NEW_CODES)('%s: kapı listesi (kod + önem + öncelik + gerekçe) UYAP_SEND ile BİREBİR aynı', (code) => {
      const shape = (action: ActionCode) =>
        getGatesForAction(action).map((g) => ({ gateCode: g.gateCode, severity: g.severity, priority: g.priority, reason: g.reason }));
      expect(shape(code).length).toBeGreaterThanOrEqual(UYAP_SEND_HARD_GATES.length);
      expect(shape(code)).toEqual(shape(ActionCode.UYAP_SEND));
    });

    it.each(NEW_CODES)('%s: matris girdisi UYAP_SEND ile aynı; TEK fark `stageIndependent: true`', (code) => {
      const strip = (e: any) => {
        const { actionCode: _a, notes: _n, stageIndependent: _s, ...rest } = e;
        return rest;
      };
      const send = getActionMatrixEntry(ActionCode.UYAP_SEND);
      const entry = getActionMatrixEntry(code);
      expect(send).toBeDefined();
      expect(entry).toBeDefined();
      expect(strip(entry)).toEqual(strip(send));
      expect(entry?.stageIndependent).toBe(true);
      expect(isStageIndependent(code)).toBe(true);
      expect(isStageIndependent(ActionCode.UYAP_SEND)).toBe(false);
      expect(entry).toMatchObject({ riskLevel: RiskLevel.HIGH, failMode: 'CLOSED', resolverFailureMode: 'FAIL_CLOSED' });
    });

    it.each(NEW_CODES)('%s: risk HIGH, donanım sınıfı (HARDWARE_ACTIONS), iş sınıfı JUDICIAL — UYAP_SEND ile aynı', (code) => {
      expect(ACTION_RISK_LEVELS[code]).toBe(ACTION_RISK_LEVELS[ActionCode.UYAP_SEND]);
      expect(HARDWARE_ACTIONS.has(code)).toBe(HARDWARE_ACTIONS.has(ActionCode.UYAP_SEND));
      expect(HARDWARE_ACTIONS.has(code)).toBe(true);
      expect(OFFICE_WORK_ACTION_CATEGORY[code]).toBe('JUDICIAL');
    });

    it('yeni kodlar aşama geçişi ÜRETMEZ: hiçbir durum akışında geçiş / izinli eylem olarak tanımlı değil', () => {
      let inspectedFlows = 0;
      for (const flow of COMPILED_STATE_FLOWS.values()) {
        inspectedFlows += 1;
        for (const transitions of flow.transitions.values()) for (const code of NEW_CODES) expect(transitions.has(code)).toBe(false);
        for (const stage of flow.stages.values()) for (const code of NEW_CODES) expect(stage.allowedActions.includes(code)).toBe(false);
      }
      expect(inspectedFlows).toBeGreaterThan(0); // 0 = kör
    });
  });

  describe('gerçek motor: aynı olgu → aynı karar (kapılar), aşamada yalnız UYAP_SEND reddedilir', () => {
    it('INITIAL + hazır olgular: üç eylem de izinli', async () => {
      for (const action of [ActionCode.UYAP_SEND, ...NEW_CODES]) {
        expect({ action, ...(await decide(READY_FACTS, 'INITIAL', action)) }).toEqual({ action, allowed: true, decision: DecisionCode.OK, gate: null });
      }
    });

    it('13 veritabanı aşamasının her birinde: yeni kodlar izinli; UYAP_SEND yalnız INITIAL (aşama kısıtı KORUNDU) — tek fark bu', async () => {
      let inspected = 0;
      for (const stage of DB_STAGES) {
        const send = await decide(READY_FACTS, stage, ActionCode.UYAP_SEND);
        expect({ stage, ...send }).toEqual(
          stage === 'INITIAL'
            ? { stage, allowed: true, decision: DecisionCode.OK, gate: null }
            : { stage, allowed: false, decision: DecisionCode.INVALID_TRANSITION, gate: null },
        );
        for (const action of NEW_CODES) {
          expect({ stage, action, ...(await decide(READY_FACTS, stage, action)) }).toEqual({ stage, action, allowed: true, decision: DecisionCode.OK, gate: null });
          inspected += 1;
        }
      }
      expect(inspected).toBe(DB_STAGES.length * NEW_CODES.length);
    });

    // Her olumsuz olgu TEK başına: UYAP_SEND hangi kapıyla reddediliyorsa yeni kodlar da AYNI kapıyla (INITIAL ve SEIZURE'da) reddedilir.
    const NEGATIVE: Array<[string, Record<string, unknown>]> = [
      ['dosya kapalı', { 'case.is_closed': true }],
      ['dosya arşivde', { 'case.is_archived': true }],
      ['ödenmemiş engelleyici masraf', { 'case.has_unpaid_blocking_expense': true }],
      ['dosyada UYAP kapalı', { 'case.allow_uyap_actions': false }],
      ['UYAP geçici arıza', { 'system.uyap_available': false }],
      ['UYAP sinyali yapılandırılmamış', { 'system.uyap_availability_explicit': false }],
      ['masraf olgusu yok (kanıtlanamadı)', { 'case.has_unpaid_blocking_expense': undefined }],
      ['aktör avukat değil (personel)', { 'actor.is_canonical_lawyer': false }],
      ['aktöre eşleşen vekalet yok', { 'actor.has_matching_power_of_attorney': false }],
      ['vekalet yürürlükte değil', { 'poa.is_effective_at_evaluation_time': false }],
      ['vekalet kapsamı yetmez', { 'poa.covers_requested_operation': false }],
      ['yetki belirsiz', { 'authority.is_unambiguous': false }],
      ['vekalet olgusu hiç yok', { 'actor.is_canonical_lawyer': undefined }],
      // P5 (owner Ek 94): vekalet geçerli ama aktör dosyaya atanmamış / avukatsız dosya / olgu hiç yok.
      ['aktör dosyaya atanmamış', { 'actor.is_assigned_to_case': false }],
      ['atama olgusu hiç yok', { 'actor.is_assigned_to_case': undefined }],
    ];

    it.each(NEGATIVE)('%s → üç eylem de GATE_BLOCKED ve kapı kodu AYNI (INITIAL + SEIZURE)', async (_label, patch) => {
      const facts = { ...READY_FACTS, ...patch };
      for (const k of Object.keys(patch)) if (patch[k] === undefined) delete facts[k];
      const send = await decide(facts, 'INITIAL', ActionCode.UYAP_SEND);
      expect(send.allowed).toBe(false);
      expect(send.decision).toBe(DecisionCode.GATE_BLOCKED);
      expect(send.gate).not.toBeNull();
      for (const stage of ['INITIAL', 'SEIZURE']) {
        for (const action of NEW_CODES) {
          expect({ stage, action, ...(await decide(facts, stage, action)) }).toEqual({ stage, action, allowed: false, decision: DecisionCode.GATE_BLOCKED, gate: send.gate });
        }
      }
    });
  });
});

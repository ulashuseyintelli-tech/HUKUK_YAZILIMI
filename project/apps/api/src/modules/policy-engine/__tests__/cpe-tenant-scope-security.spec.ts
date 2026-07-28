/** @jest-environment node */
/**
 * DEBTOR-CPE-TENANT-HARDENING-P1-I01 — CasePolicyEngine tenant sinir testleri.
 *
 * Bulgu: DEBTOR-IDOR-02. Onceden `CasePolicyEngine`'in uc public entrypoint'i
 * (`canPerformAction`, `getNextActions`, `onActionExecuted`) yalnizca `caseId`
 * aliyordu; tenant dogrulamasi cagirana birakilmisti. Servisi DI ile dogrudan
 * cagiran uretim yollari (guard, uyap, automation, stage-trigger, address-discovery)
 * bu dogrulamayi yapmak zorunda DEGILDI — dogrulanmamis bir `caseId` ile baska
 * tenant'in fact'leri okunabiliyor, state'i degistirilebiliyor, karar/execution
 * kaydi yazilabiliyordu.
 *
 * Bu testler DAVRANIS dogrular, JSDoc iddiasini degil:
 *   - Sahte Prisma `where` KOSULLARINI GERCEKTEN UYGULAR. Bu sayede tenant filtresi
 *     unutulursa test yesil KALMAZ (kanit-uretici fixture).
 *   - Cross-tenant ve yok-olan case AYNI yaniti verir (varlik sizintisi yok).
 *   - Guard, cagri asagi akisa gecmeden ONCE calisir (downstream mock'lari
 *     cagrilmamis olmali).
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { CasePolicyEngine } from '../case-policy-engine.service';
import { ExecutionRecorderService } from '../decision-logger/execution-recorder.service';
import { ActionCode } from '../types/action-code.enum';
import { Scope } from '../types/scope.enum';
import type { PrismaService } from '../../../prisma/prisma.service';

// ============================================================
// Fixtures: 2 tenant, 3 case (T1'de iki, T2'de bir)
// ============================================================
const T1 = 'tenant-alpha';
const T2 = 'tenant-beta';

const CASE_ROWS = [
  { id: 'case-a1', tenantId: T1 },
  { id: 'case-a2', tenantId: T1 },
  { id: 'case-b1', tenantId: T2 },
];

/**
 * `where` kosulunu GERCEKTEN uygulayan sahte Prisma. Uretim kodu tenant filtresini
 * dusurursa bu fixture cross-tenant satiri dondurur ve testler kirmizi olur.
 */
function makePrisma() {
  const calls: Array<Record<string, unknown>> = [];
  return {
    calls,
    case: {
      findFirst: jest.fn(async (args: any) => {
        calls.push(args?.where ?? {});
        const w = args?.where ?? {};
        const row = CASE_ROWS.find(
          (r) =>
            (w.id === undefined || r.id === w.id) &&
            (w.tenantId === undefined || r.tenantId === w.tenantId),
        );
        return row ? { id: row.id } : null;
      }),
    },
  };
}

/** Downstream bagimliliklar: cagrilmis olmalari BASLI BASINA guvenlik ihlalidir. */
function makeDownstream() {
  return {
    factStore: {
      getFacts: jest.fn().mockResolvedValue({}),
      getComputedMetrics: jest.fn().mockResolvedValue({}),
      invalidateCache: jest.fn(),
    },
    computedFactRegistry: { getAll: jest.fn().mockResolvedValue({}) },
    decisionLogger: { log: jest.fn().mockResolvedValue('decision-1') },
    executionRecorder: {
      startExecution: jest.fn().mockResolvedValue({ isNew: true, record: { id: 'r1' } }),
      completeExecution: jest.fn().mockResolvedValue(undefined),
      markAsNoop: jest.fn().mockResolvedValue(undefined),
    },
    stateMachine: {
      getCurrentState: jest.fn().mockResolvedValue({ stage: 'DRAFT' }),
      getRuleVersion: jest.fn().mockReturnValue('v1'),
      applyTransition: jest.fn().mockResolvedValue({ changed: false }),
    },
    gateChecker: {
      checkGates: jest.fn().mockResolvedValue({ passed: true, warnings: [] }),
    },
    ruleEngine: { evaluate: jest.fn().mockResolvedValue([]) },
  };
}

function makeCpe() {
  const prisma = makePrisma();
  const d = makeDownstream();
  const cpe = new CasePolicyEngine(
    prisma as unknown as PrismaService,
    d.factStore as never,
    d.computedFactRegistry as never,
    d.decisionLogger as never,
    d.executionRecorder as never,
    d.stateMachine as never,
    d.gateChecker as never,
    d.ruleEngine as never,
  );
  return { cpe, prisma, d };
}

/** Downstream'e HIC dokunulmadigini dogrular (guard gercekten en basta calisti). */
function expectNoDownstreamContact(d: ReturnType<typeof makeDownstream>) {
  expect(d.factStore.getFacts).not.toHaveBeenCalled();
  expect(d.factStore.getComputedMetrics).not.toHaveBeenCalled();
  expect(d.stateMachine.getCurrentState).not.toHaveBeenCalled();
  expect(d.gateChecker.checkGates).not.toHaveBeenCalled();
  expect(d.decisionLogger.log).not.toHaveBeenCalled();
  expect(d.executionRecorder.startExecution).not.toHaveBeenCalled();
}

const RESULT_OK = { success: true } as never;

afterEach(() => jest.clearAllMocks());

// ============================================================
// canPerformAction
// ============================================================
describe('DEBTOR-IDOR-02 / canPerformAction tenant siniri', () => {
  it('SEN-01: kendi tenant case → sahiplik {id,tenantId} ile dogrulanir ve islem devam eder', async () => {
    const { cpe, prisma } = makeCpe();
    await cpe.canPerformAction(T1, 'case-a1', ActionCode.UYAP_SEND);
    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-a1', tenantId: T1 },
      select: { id: true },
    });
  });

  it('SEN-02: cross-tenant case → NotFoundException (baska tenant fact/state ERISILMEZ)', async () => {
    const { cpe, d } = makeCpe();
    await expect(cpe.canPerformAction(T1, 'case-b1', ActionCode.UYAP_SEND)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expectNoDownstreamContact(d);
  });

  it('SEN-03: var olmayan case → NotFoundException', async () => {
    const { cpe, d } = makeCpe();
    await expect(cpe.canPerformAction(T1, 'case-yok', ActionCode.UYAP_SEND)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expectNoDownstreamContact(d);
  });

  it('SEN-04: cross-tenant ve var-olmayan AYNI yaniti verir — varlik sizintisi YOK', async () => {
    const a = makeCpe();
    const b = makeCpe();
    const crossTenant = await a.cpe
      .canPerformAction(T1, 'case-b1', ActionCode.UYAP_SEND)
      .catch((e) => e);
    const missing = await b.cpe
      .canPerformAction(T1, 'case-yok', ActionCode.UYAP_SEND)
      .catch((e) => e);

    // Tip, HTTP statu ve tam response govdesi ayni olmali.
    expect(crossTenant.constructor).toBe(missing.constructor);
    expect(crossTenant.getStatus()).toBe(missing.getStatus());
    // caseId disinda hicbir ayirt edici bilgi yok; sabit govde parcasi ayni.
    expect(String(crossTenant.message).replace('case-b1', 'X')).toBe(
      String(missing.message).replace('case-yok', 'X'),
    );
  });

  it('SEN-05: bos tenantId → ForbiddenException, DB sorgusu bile yapilmaz (fail-closed)', async () => {
    const { cpe, prisma, d } = makeCpe();
    await expect(cpe.canPerformAction('', 'case-a1', ActionCode.UYAP_SEND)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expectNoDownstreamContact(d);
  });

  it('SEN-06: undefined/null tenantId → ForbiddenException (varsayilan tenant YOK)', async () => {
    const { cpe } = makeCpe();
    await expect(
      cpe.canPerformAction(undefined as never, 'case-a1', ActionCode.UYAP_SEND),
    ).rejects.toBeInstanceOf(ForbiddenException);
    await expect(
      cpe.canPerformAction(null as never, 'case-a1', ActionCode.UYAP_SEND),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('SEN-07: ActionContext tenant otoritesi DEGILDIR — context ile cross-tenant asilamaz', async () => {
    const { cpe, d } = makeCpe();
    await expect(
      cpe.canPerformAction(T1, 'case-b1', ActionCode.UYAP_SEND, {
        // Istemci kontrolunde olabilecek alanlar; hicbiri tenant kapisini acmamali.
        tenantId: T2,
        userId: 'u1',
      } as never),
    ).rejects.toBeInstanceOf(NotFoundException);
    expectNoDownstreamContact(d);
  });

  it('SEN-08: ayni tenant icindeki ikinci case de erisilebilir (guard fazla kisitlamiyor)', async () => {
    const { cpe, prisma } = makeCpe();
    await cpe.canPerformAction(T1, 'case-a2', ActionCode.UYAP_SEND);
    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-a2', tenantId: T1 },
      select: { id: true },
    });
  });
});

// ============================================================
// getNextActions
// ============================================================
describe('DEBTOR-IDOR-02 / getNextActions tenant siniri', () => {
  it('SEN-09: kendi tenant case → sahiplik dogrulanir', async () => {
    const { cpe, prisma } = makeCpe();
    await cpe.getNextActions(T1, 'case-a1');
    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case-a1', tenantId: T1 },
      select: { id: true },
    });
  });

  it('SEN-10: cross-tenant → NotFoundException, oneri uretilmez', async () => {
    const { cpe, d } = makeCpe();
    await expect(cpe.getNextActions(T1, 'case-b1')).rejects.toBeInstanceOf(NotFoundException);
    expectNoDownstreamContact(d);
  });

  it('SEN-11: bos tenantId → ForbiddenException', async () => {
    const { cpe, prisma } = makeCpe();
    await expect(cpe.getNextActions('', 'case-a1')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
  });

  it('SEN-12: scope verilmesi tenant kapisini ATLAMAZ', async () => {
    const { cpe, d } = makeCpe();
    await expect(cpe.getNextActions(T1, 'case-b1', Scope.CASE)).rejects.toBeInstanceOf(
      NotFoundException,
    );
    expectNoDownstreamContact(d);
  });
});

// ============================================================
// onActionExecuted — state mutasyonu yolu (en yuksek etki)
// ============================================================
describe('DEBTOR-IDOR-02 / onActionExecuted tenant siniri', () => {
  it('SEN-13: kendi tenant case → sahiplik dogrulanir ve execution baslar', async () => {
    const { cpe, d } = makeCpe();
    await cpe.onActionExecuted(T1, 'case-a1', ActionCode.UYAP_SEND, undefined, RESULT_OK, 'ex-1');
    expect(d.executionRecorder.startExecution).toHaveBeenCalled();
  });

  it('SEN-14: cross-tenant → NotFoundException; HICBIR state mutasyonu/kayit olusmaz', async () => {
    const { cpe, d } = makeCpe();
    await expect(
      cpe.onActionExecuted(T1, 'case-b1', ActionCode.UYAP_SEND, undefined, RESULT_OK, 'ex-2'),
    ).rejects.toBeInstanceOf(NotFoundException);
    expectNoDownstreamContact(d);
    expect(d.stateMachine.applyTransition).not.toHaveBeenCalled();
  });

  it('SEN-15: bos tenantId → ForbiddenException, execution kaydi ACILMAZ', async () => {
    const { cpe, d } = makeCpe();
    await expect(
      cpe.onActionExecuted('', 'case-a1', ActionCode.UYAP_SEND, undefined, RESULT_OK, 'ex-3'),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(d.executionRecorder.startExecution).not.toHaveBeenCalled();
  });

  it('SEN-16: dogrulanan tenantId execution kaydina TASINIR (ilk argüman)', async () => {
    const { cpe, d } = makeCpe();
    await cpe.onActionExecuted(T1, 'case-a1', ActionCode.UYAP_SEND, undefined, RESULT_OK, 'ex-4');
    expect(d.executionRecorder.startExecution).toHaveBeenCalledWith(
      T1,
      'ex-4',
      'case-a1',
      ActionCode.UYAP_SEND,
      undefined,
      'v1',
    );
  });
});

// ============================================================
// ExecutionRecorder — kalici tenant baglanmasi (§8)
// ============================================================
describe('DEBTOR-IDOR-02 / CpeExecutionRecord tenant baglanmasi', () => {
  function makeRecorder() {
    const created: Array<Record<string, unknown>> = [];
    const prisma = {
      cpeExecutionRecord: {
        findUnique: jest.fn().mockResolvedValue(null),
        create: jest.fn(async (args: any) => {
          created.push(args.data);
          return { id: 'rec-1', ...args.data };
        }),
      },
    };
    return {
      created,
      prisma,
      recorder: new ExecutionRecorderService(prisma as unknown as PrismaService),
    };
  }

  it('SEN-17: startExecution yazilan satira tenantId koyar', async () => {
    const { recorder, created } = makeRecorder();
    await recorder.startExecution(T1, 'ex-10', 'case-a1', ActionCode.UYAP_SEND);
    expect(created).toHaveLength(1);
    expect(created[0].tenantId).toBe(T1);
    expect(created[0].caseId).toBe('case-a1');
  });

  it('SEN-18: bos tenantId ile execution kaydi YAZILAMAZ (fail-closed)', async () => {
    const { recorder, prisma } = makeRecorder();
    await expect(
      recorder.startExecution('', 'ex-11', 'case-a1', ActionCode.UYAP_SEND),
    ).rejects.toThrow(/cpe_execution_tenant_required/);
    expect(prisma.cpeExecutionRecord.create).not.toHaveBeenCalled();
  });
});

// ============================================================
// Sozlesme (static) — imza gerilemesini engelle
// ============================================================
describe('DEBTOR-IDOR-02 / entrypoint sozlesmesi', () => {
  const SRC = readFileSync(join(__dirname, '..', 'case-policy-engine.service.ts'), 'utf8');

  it('SEN-19: uc public entrypoint de tenantId zorunlu ILK parametre olarak alir (optional DEGIL)', () => {
    for (const method of ['canPerformAction', 'getNextActions', 'onActionExecuted']) {
      const re = new RegExp(`async ${method}\\(\\s*\\n\\s*tenantId: string,`);
      expect(SRC).toMatch(re);
      // `tenantId?:` optional imza gerilemesi YASAK.
      expect(SRC).not.toMatch(new RegExp(`async ${method}\\(\\s*\\n\\s*tenantId\\?`));
    }
  });

  it('SEN-20: her entrypoint ilk is olarak sahiplik kapisini cagirir', () => {
    // Guard cagrisi sayisi entrypoint sayisina esit olmali (unsafe overload yok).
    const guardCalls = SRC.match(/await this\.assertCaseBelongsToTenant\(tenantId, caseId\);/g) ?? [];
    expect(guardCalls).toHaveLength(3);
    // Kapinin kendisi fail-closed: bos tenant Forbidden, bulunamayan Case NotFound.
    expect(SRC).toMatch(/throw new ForbiddenException\('cpe_tenant_required/);
    expect(SRC).toMatch(/throw new NotFoundException\(`Dosya bulunamadi/);
  });
});

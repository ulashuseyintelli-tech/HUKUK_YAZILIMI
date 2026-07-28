import { WorkflowStage } from "@prisma/client";
import { RuleContext, RuleEngine } from "../rule-engine.service";
import { WorkflowEngine } from "../workflow-engine.service";

const tenantId = "tenant-collection-consumer";
const caseId = "case-collection-consumer";

function caseRow(collections: Array<{ amount: number; status: string }>) {
  return {
    id: caseId,
    tenantId,
    workflowStage: WorkflowStage.COLLECTION,
    principalAmount: 100,
    isAutoMode: true,
    formType: null,
    collections,
    debtors: [],
    lifecycleEvents: [],
    enforcementActions: [],
  };
}

function workflowFor(row: any) {
  const prisma = {
    case: { findFirst: jest.fn().mockResolvedValue(row) },
  } as any;
  return {
    workflow: new WorkflowEngine(prisma, {} as any, {} as any),
    prisma,
  };
}

function ruleContext(
  overrides: Partial<RuleContext> = {},
): RuleContext {
  return {
    caseId,
    tenantId,
    currentStage: WorkflowStage.COLLECTION,
    daysSinceLastAction: 0,
    hasPayment: true,
    hasObjection: false,
    totalDebt: 100,
    collectedAmount: 100,
    officialLegalBalanceState: "UNAVAILABLE",
    debtorAssets: [],
    ...overrides,
  };
}

describe("RCV-COL-CONSUMER-AUTO-01 — lifecycle ve legal-balance authority ayrimi", () => {
  const rules = new RuleEngine({} as any);

  it("PENDING/CANCELLED/REFUNDED/REJECTED/REVERSED gross toplama ve payment fact'ine girmez", async () => {
    const { workflow } = workflowFor(caseRow([
      { amount: 100, status: "PENDING" },
      { amount: 100, status: "CANCELLED" },
      { amount: 100, status: "REFUNDED" },
      { amount: 100, status: "REJECTED" },
      { amount: 100, status: "REVERSED" },
    ]));

    const context = await workflow.buildContext(caseId, tenantId);

    expect(context.collectedAmount).toBe(0);
    expect(context.hasPayment).toBe(false);
    expect(context.officialLegalBalanceState).toBe("UNAVAILABLE");
    await expect(rules.evaluateRules(context)).resolves.toEqual([]);
  });

  it("mixed history icinde yalniz CONFIRMED receipt payment fact'i olur", async () => {
    const { workflow } = workflowFor(caseRow([
      { amount: 40, status: "CONFIRMED" },
      { amount: 500, status: "PENDING" },
      { amount: 500, status: "CANCELLED" },
      { amount: 500, status: "REFUNDED" },
    ]));

    const context = await workflow.buildContext(caseId, tenantId);

    expect(context.collectedAmount).toBe(40);
    expect(context.hasPayment).toBe(true);
  });

  it("valid CONFIRMED/settled-origin receipt official balance yokken FULL_PAYMENT veya PARTIAL_PAYMENT uretmez", async () => {
    const { workflow } = workflowFor(caseRow([
      { amount: 100, status: "CONFIRMED" },
    ]));
    const context = await workflow.buildContext(caseId, tenantId);

    const result = await rules.evaluateRules(context);

    expect(context.collectedAmount).toBe(100);
    expect(context.officialLegalBalanceState).toBe("UNAVAILABLE");
    expect(result).toEqual([]);
  });

  it("production processCase zinciri official balance yokken hiçbir closure/stage write'i üretmez", async () => {
    const row = caseRow([{ amount: 1_000, status: "CONFIRMED" }]);
    const prisma = {
      case: {
        findFirst: jest.fn().mockResolvedValue(row),
        update: jest.fn(),
      },
      notificationQueue: { findFirst: jest.fn().mockResolvedValue(null) },
      decisionLog: { create: jest.fn() },
      enforcementAction: { create: jest.fn() },
    } as any;
    const workflow = new WorkflowEngine(
      prisma,
      new RuleEngine(prisma),
      {} as any,
    );

    await workflow.processCase(caseId, tenantId);

    expect(prisma.case.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.case.update).not.toHaveBeenCalled();
    expect(prisma.decisionLog.create).not.toHaveBeenCalled();
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
  });

  it("gross overpayment official balance yokken dosyayi kapatmaz", async () => {
    const result = await rules.evaluateRules(ruleContext({
      collectedAmount: 10_000,
      totalDebt: 100,
      officialLegalBalanceState: "UNAVAILABLE",
    }));

    expect(result).toEqual([]);
  });

  it("official OUTSTANDING sonucu partial-payment stage'ine izin verir", async () => {
    const result = await rules.evaluateRules(ruleContext({
      collectedAmount: 150,
      totalDebt: 100,
      officialLegalBalanceState: "OUTSTANDING",
    }));

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "UPDATE_STAGE",
        nextStage: WorkflowStage.PARTIAL_PAYMENT,
      }),
    ]));
    expect(result).not.toEqual(
      expect.arrayContaining([expect.objectContaining({ action: "CLOSE_CASE" })]),
    );
  });

  it("FULL_PAYMENT/CLOSE_CASE yalniz official ZERO sonucu ile uretilir", async () => {
    const result = await rules.evaluateRules(ruleContext({
      collectedAmount: 1,
      totalDebt: 1_000_000,
      officialLegalBalanceState: "ZERO",
    }));

    expect(result).toEqual(expect.arrayContaining([
      expect.objectContaining({
        action: "CLOSE_CASE",
        nextStage: WorkflowStage.FULL_PAYMENT,
      }),
    ]));
    expect(result).not.toEqual(expect.arrayContaining([
      expect.objectContaining({ nextStage: WorkflowStage.PARTIAL_PAYMENT }),
    ]));
  });

  it("foreign tenant case composite authority sorgusunda fail-closed kalir", async () => {
    const { workflow, prisma } = workflowFor(null);

    await expect(workflow.buildContext(caseId, "foreign-tenant")).rejects.toThrow(
      "Dosya bulunamadı",
    );
    expect(prisma.case.findFirst).toHaveBeenCalledWith(expect.objectContaining({
      where: { id: caseId, tenantId: "foreign-tenant" },
    }));
  });
});

/**
 * UYAP-EXPENSE-BLOCKING-FACT-BRIDGE-I01 — `EXPENSE_BLOCKING` gate'inin canonical kaynağı.
 *
 * Owner §2.5 semantiği: yalnız açıkça `UYAP_SEND` olarak sınıflandırılmış, aynı tenant+case'e
 * bağlı, AÇIK/ödenmemiş bir gider UYAP_SEND'i bloke eder. Sıradan ödenmemiş masraf tek başına
 * blocking DEĞİLDİR. `case.expense_gate_blocked` manuel flag'i authority DEĞİLDİR.
 *
 * ZORUNLU MİMARİ SINIR (owner addendum): fact provider `ExpenseGateService` veya UYAP_SEND
 * için tekrar CPE evaluation çalıştıran hiçbir servisi çağıramaz.
 */
import * as fs from "fs";
import * as path from "path";
import {
  UyapExpenseBlockingFactProvider,
  UYAP_EXPENSE_BLOCKING_FACT_KEYS,
  UYAP_SEND_BLOCKING_ACTION_CODE,
} from "../authority/uyap-expense-blocking-fact.provider";
import { COMPILED_GATES } from "@/modules/policy-engine/gate-checker/compiled/gates.compiled";
import { FactMap } from "@/modules/policy-engine/fact-store/fact-store.types";

const TENANT = "t-1";
const OTHER_TENANT = "t-2";
const CASE = "case-1";
const NOW = new Date("2026-07-01T12:00:00.000Z");

type Block = {
  id: string;
  tenantId: string;
  caseId: string;
  blockedActionCode: string;
  reasonCode: string;
  status: string;
  createdAt: Date;
  expenseRequestId: string | null;
  expenseRequest: null | {
    id: string;
    tenantId: string;
    caseId: string;
    status: string;
    totalAmount: unknown;
    paidTotal: unknown;
  };
};

function block(over: Partial<Block> = {}): Block {
  return {
    id: "blk-1",
    tenantId: TENANT,
    caseId: CASE,
    blockedActionCode: UYAP_SEND_BLOCKING_ACTION_CODE,
    reasonCode: "PAYMENT_NOT_RECEIVED",
    status: "OPEN",
    createdAt: new Date("2026-06-01T00:00:00.000Z"),
    expenseRequestId: "exp-1",
    expenseRequest: {
      id: "exp-1",
      tenantId: TENANT,
      caseId: CASE,
      status: "SENT",
      totalAmount: 1000,
      paidTotal: 0,
    },
    ...over,
  };
}

function build(blocks: Block[] | Error) {
  const findOpenBlocksForAction = jest.fn().mockImplementation(async () => {
    if (blocks instanceof Error) throw blocks;
    return blocks;
  });
  const provider = new UyapExpenseBlockingFactProvider({ findOpenBlocksForAction } as any);
  return { provider, findOpenBlocksForAction };
}

const ctx = { tenantId: TENANT, evaluatedAt: NOW } as any;

const expenseGate = COMPILED_GATES.find((g: any) => g.gateCode === "EXPENSE_BLOCKING")!;
const gateBlocks = (facts: FactMap) => expenseGate.condition(facts, undefined as any);

describe("UyapExpenseBlockingFactProvider (I04B)", () => {
  it("canonical fact key'i üretir", () => {
    const { provider } = build([]);
    expect(provider.factKey).toBe("case.has_unpaid_blocking_expense");
  });

  describe("blocking kuralı", () => {
    it("explicit UYAP_SEND sınıflandırmalı ödenmemiş gider → BLOCK", async () => {
      const { provider } = build([block()]);
      const facts: FactMap = new Map();
      expect(await provider.compute(CASE, ctx, facts)).toBe(true);
      expect(facts.get(UYAP_EXPENSE_BLOCKING_FACT_KEYS.reason)).toBe("UNPAID_BLOCKING_EXPENSE");
    });

    it("sıradan ödenmemiş masraf (explicit sınıflandırma yok) → BLOCK YOK", async () => {
      const { provider } = build([]); // sorgu yalnız UYAP_SEND sınıflandırmasını döndürür
      const facts: FactMap = new Map();
      expect(await provider.compute(CASE, ctx, facts)).toBe(false);
      expect(facts.get(UYAP_EXPENSE_BLOCKING_FACT_KEYS.reason)).toBe(
        "NO_EXPLICIT_BLOCKING_CLASSIFICATION",
      );
    });

    it("ödenmiş blocking gider (status PAID) → BLOCK YOK", async () => {
      const { provider } = build([
        block({ expenseRequest: { ...block().expenseRequest!, status: "PAID" } }),
      ]);
      expect(await provider.compute(CASE, ctx, new Map())).toBe(false);
    });

    it("tam ödenmiş (totalAmount == paidTotal) → BLOCK YOK", async () => {
      const { provider } = build([
        block({ expenseRequest: { ...block().expenseRequest!, totalAmount: 500, paidTotal: 500 } }),
      ]);
      expect(await provider.compute(CASE, ctx, new Map())).toBe(false);
    });

    it("iptal edilmiş gider (CANCELLED) → BLOCK YOK", async () => {
      const { provider } = build([
        block({ expenseRequest: { ...block().expenseRequest!, status: "CANCELLED" } }),
      ]);
      expect(await provider.compute(CASE, ctx, new Map())).toBe(false);
    });

    it("kısmi ödeme (açık tutar > 0) → BLOCK", async () => {
      const { provider } = build([
        block({ expenseRequest: { ...block().expenseRequest!, status: "PARTIAL", totalAmount: 1000, paidTotal: 400 } }),
      ]);
      expect(await provider.compute(CASE, ctx, new Map())).toBe(true);
    });

    it("bağlı masraf talebi olmayan AÇIK sınıflandırma → BLOCK", async () => {
      const { provider } = build([block({ expenseRequestId: null, expenseRequest: null })]);
      const facts: FactMap = new Map();
      expect(await provider.compute(CASE, ctx, facts)).toBe(true);
      expect(facts.get(UYAP_EXPENSE_BLOCKING_FACT_KEYS.reason)).toBe("OPEN_BLOCKING_CLASSIFICATION");
    });

    it("birden fazla kayıttan biri bile ödenmemişse → BLOCK", async () => {
      const { provider } = build([
        block({ id: "blk-a", expenseRequest: { ...block().expenseRequest!, status: "PAID" } }),
        block({ id: "blk-b" }),
      ]);
      expect(await provider.compute(CASE, ctx, new Map())).toBe(true);
    });

    it("hepsi kapanmışsa → BLOCK YOK", async () => {
      const { provider } = build([
        block({ id: "blk-a", expenseRequest: { ...block().expenseRequest!, status: "PAID" } }),
        block({ id: "blk-b", expenseRequest: { ...block().expenseRequest!, status: "CANCELLED" } }),
      ]);
      const facts: FactMap = new Map();
      expect(await provider.compute(CASE, ctx, facts)).toBe(false);
      expect(facts.get(UYAP_EXPENSE_BLOCKING_FACT_KEYS.reason)).toBe("ALL_BLOCKING_EXPENSES_SETTLED");
    });
  });

  describe("sorgu sınırı", () => {
    it("sorgu tenant + case + explicit action code + evaluatedAt ile kısıtlanır", async () => {
      const { provider, findOpenBlocksForAction } = build([]);
      await provider.compute(CASE, ctx, new Map());
      expect(findOpenBlocksForAction).toHaveBeenCalledWith(TENANT, CASE, "UYAP_SEND", NOW);
    });

    it("RESOLVED/CANCELLED kayıtlar sorgu katmanında elenir (OPEN dışı dönmez)", async () => {
      // Servis sözleşmesi OPEN döndürür; savunmacı olarak provider da yalnız döneni değerlendirir.
      const { provider } = build([]);
      expect(await provider.compute(CASE, ctx, new Map())).toBe(false);
    });
  });

  describe("fail-closed", () => {
    it("tenant bağlamı yoksa → BLOCK (fail-closed)", async () => {
      const { provider, findOpenBlocksForAction } = build([block()]);
      const facts: FactMap = new Map();
      expect(await provider.compute(CASE, {} as any, facts)).toBe(true);
      expect(facts.get(UYAP_EXPENSE_BLOCKING_FACT_KEYS.reason)).toBe("EXPENSE_CONTEXT_INVALID");
      expect(findOpenBlocksForAction).not.toHaveBeenCalled();
    });

    it("okuma hatası → BLOCK, provider THROW ETMEZ", async () => {
      const { provider } = build(new Error("db down"));
      const facts: FactMap = new Map();
      await expect(provider.compute(CASE, ctx, facts)).resolves.toBe(true);
      expect(facts.get(UYAP_EXPENSE_BLOCKING_FACT_KEYS.reason)).toBe("EXPENSE_PROVIDER_FAILURE");
    });

    it("cross-tenant blok kaydı → BLOCK + güvenlik nedeni", async () => {
      const { provider } = build([block({ tenantId: OTHER_TENANT })]);
      const facts: FactMap = new Map();
      expect(await provider.compute(CASE, ctx, facts)).toBe(true);
      expect(facts.get(UYAP_EXPENSE_BLOCKING_FACT_KEYS.reason)).toBe(
        "EXPENSE_BLOCK_TENANT_OR_CASE_MISMATCH",
      );
    });

    it("cross-case masraf talebi → BLOCK", async () => {
      const { provider } = build([
        block({ expenseRequest: { ...block().expenseRequest!, caseId: "baska-case" } }),
      ]);
      const facts: FactMap = new Map();
      expect(await provider.compute(CASE, ctx, facts)).toBe(true);
      expect(facts.get(UYAP_EXPENSE_BLOCKING_FACT_KEYS.reason)).toBe("EXPENSE_TENANT_OR_CASE_MISMATCH");
    });

    it("belirsiz tutar (NaN) → BLOCK", async () => {
      const { provider } = build([
        block({ expenseRequest: { ...block().expenseRequest!, totalAmount: "abc", paidTotal: 0 } }),
      ]);
      const facts: FactMap = new Map();
      expect(await provider.compute(CASE, ctx, facts)).toBe(true);
      expect(facts.get(UYAP_EXPENSE_BLOCKING_FACT_KEYS.reason)).toBe("EXPENSE_AMOUNT_AMBIGUOUS");
    });
  });

  describe("legacy manuel flag artık authority değil", () => {
    it("legacy expense_gate_blocked=true + blocking kayıt yok → computed fact false", async () => {
      const { provider } = build([]);
      const facts: FactMap = new Map([["case.expense_gate_blocked", true]]);
      const computed = await provider.compute(CASE, ctx, facts);
      facts.set("case.has_unpaid_blocking_expense", computed);
      expect(computed).toBe(false);
      expect(gateBlocks(facts)).toBe(false);
    });

    it("legacy expense_gate_blocked=false + gerçek blocking kayıt → gate BLOKLAR", async () => {
      const { provider } = build([block()]);
      const facts: FactMap = new Map([["case.expense_gate_blocked", false]]);
      const computed = await provider.compute(CASE, ctx, facts);
      facts.set("case.has_unpaid_blocking_expense", computed);
      expect(computed).toBe(true);
      expect(gateBlocks(facts)).toBe(true);
    });
  });

  describe("ARCHITECTURE GUARD — dependency cycle yasağı", () => {
    const providerSrc = fs.readFileSync(
      path.join(__dirname, "..", "authority", "uyap-expense-blocking-fact.provider.ts"),
      "utf8",
    );

    it("provider CPE (CasePolicyEngine/canPerformAction) çağırmaz", () => {
      expect(providerSrc).not.toMatch(/CasePolicyEngine/);
      expect(providerSrc.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")).not.toMatch(/canPerformAction/);
    });

    it("provider ExpenseGateService'i import/inject ETMEZ", () => {
      expect(providerSrc.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "")).not.toMatch(/ExpenseGateService/);
    });

    it("provider UYAP servislerini çağırmaz (recursion yok)", () => {
      const code = providerSrc.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");
      expect(code).not.toMatch(/UyapService/);
      expect(code).not.toMatch(/UyapSendAuthorityResolverService/);
    });

    it("provider yalnız side-effect-free okuma servisini enjekte eder", () => {
      const injected = providerSrc.match(/constructor\(([^)]*)\)/s)?.[1] ?? "";
      expect(injected).toMatch(/ExpenseBlockReasonService/);
      expect(injected).not.toMatch(/Prisma|Cpe|Uyap|Gate/);
    });

    it("okuma servisi kendisi CPE çağırmaz (zincirin ikinci halkası)", () => {
      const svc = fs.readFileSync(
        path.join(__dirname, "..", "..", "expense-block-reason", "expense-block-reason.service.ts"),
        "utf8",
      );
      const code = svc.replace(/\/\/.*|\/\*[\s\S]*?\*\//g, "");
      expect(code).not.toMatch(/canPerformAction/);
      expect(code).not.toMatch(/CasePolicyEngine/);
      expect(code).not.toMatch(/ExpenseGateService/);
    });

    it("EXPENSE_BLOCKING gate'i yalnız computed fact'i okur", () => {
      expect(gateBlocks(new Map([["case.has_unpaid_blocking_expense", true]]))).toBe(true);
      expect(gateBlocks(new Map([["case.has_unpaid_blocking_expense", false]]))).toBe(false);
      // manuel flag tek başına gate'i tetiklemez
      expect(gateBlocks(new Map([["case.expense_gate_blocked", true]]))).toBe(false);
    });
  });
});

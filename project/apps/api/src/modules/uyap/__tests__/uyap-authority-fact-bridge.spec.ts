/**
 * UYAP-CPE-AUTHORITY-FACT-BRIDGE-I01 — gerçek authority zincirinin CPE fact'lerine bağlanması.
 *
 * Kilitlenen davranışlar:
 * - `case.has_power_of_attorney` artık MANUEL/PERSISTED flag DEĞİL, computed alias'tır.
 * - Legacy DB flag'i kararı DEĞİŞTİREMEZ (true iken deny, false iken allow üretebilir).
 * - `body.lawyerId` benzeri client-controlled değerler authority üretemez.
 * - Aktör/tenant eksikse, resolver hata verirse veya yetki reddedilirse → fail-closed.
 * - `POWER_OF_ATTORNEY_MISSING` gate'i granular fact konjonksiyonunu okur.
 */
import { UyapAuthorityFactProvider, UYAP_AUTHORITY_FACT_KEYS } from "../authority/uyap-authority-fact.provider";
import { COMPILED_GATES } from "@/modules/policy-engine/gate-checker/compiled/gates.compiled";
import { FactMap } from "@/modules/policy-engine/fact-store/fact-store.types";

const TENANT = "t-1";
const USER = "u-1";
const LAWYER = "law-1";
const CASE = "case-1";

function makeProvider(opts: {
  acting?: any;
  authority?: any;
  actingThrows?: boolean;
  authorityThrows?: boolean;
}) {
  const tryResolve = jest.fn().mockImplementation(async () => {
    if (opts.actingThrows) throw new Error("db down");
    return opts.acting ?? { resolved: true, actingLawyer: { lawyerId: LAWYER, userId: USER, tenantId: TENANT } };
  });
  const resolve = jest.fn().mockImplementation(async () => {
    if (opts.authorityThrows) throw new Error("db down");
    return (
      opts.authority ?? {
        allowed: true,
        tenantId: TENANT,
        userId: USER,
        actingLawyerId: LAWYER,
        caseId: CASE,
        operationType: "UYAP_SEND",
        evaluatedAt: new Date(),
        authorityEvidence: [{ poaId: "poa-1" }],
        authorityVersion: "UYAP-SEND-AUTHORITY/v1",
      }
    );
  });
  const provider = new UyapAuthorityFactProvider(
    { tryResolve } as any,
    { resolve } as any,
  );
  return { provider, tryResolve, resolve };
}

const ctx = { tenantId: TENANT, authenticatedUserId: USER } as any;

/** POWER_OF_ATTORNEY_MISSING gate'inin condition'ı (compiled gate'ten okunur). */
const poaGate = COMPILED_GATES.find((g: any) => g.gateCode === "POWER_OF_ATTORNEY_MISSING")!;
const gateBlocks = (facts: FactMap) => poaGate.condition(facts, undefined as any);

describe("UyapAuthorityFactProvider (I04)", () => {
  it("factKey legacy alias adını korur (backward compatibility)", () => {
    const { provider } = makeProvider({});
    expect(provider.factKey).toBe("case.has_power_of_attorney");
  });

  describe("pozitif", () => {
    it("geçerli authority → tüm granular fact'ler true + alias true", async () => {
      const { provider } = makeProvider({});
      const facts: FactMap = new Map();

      const alias = await provider.compute(CASE, ctx, facts);

      expect(alias).toBe(true);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorIsCanonicalLawyer)).toBe(true);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorHasMatchingPoa)).toBe(true);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.poaEffective)).toBe(true);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.poaCoversOperation)).toBe(true);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.authorityUnambiguous)).toBe(true);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.failureCode)).toBeNull();
    });

    it("acting lawyer YALNIZ authenticated user+tenant ile çözülür", async () => {
      const { provider, tryResolve, resolve } = makeProvider({});
      await provider.compute(CASE, ctx, new Map());

      expect(tryResolve).toHaveBeenCalledWith({ userId: USER, tenantId: TENANT });
      expect(resolve.mock.calls[0][0]).toMatchObject({
        tenantId: TENANT,
        authenticatedUserId: USER,
        actingLawyerId: LAWYER,
        caseId: CASE,
        operationType: "UYAP_SEND",
      });
    });
  });

  describe("fail-closed", () => {
    it("tenant/aktör bağlamı yoksa deny (resolver çağrılmaz)", async () => {
      const { provider, tryResolve } = makeProvider({});
      const facts: FactMap = new Map();

      expect(await provider.compute(CASE, {} as any, facts)).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.failureCode)).toBe("AUTHORITY_CONTEXT_INVALID");
      expect(tryResolve).not.toHaveBeenCalled();
    });

    it("acting lawyer çözülemezse deny + failure code taşınır", async () => {
      const { provider } = makeProvider({
        acting: { resolved: false, failureCode: "ACTING_LAWYER_NOT_RESOLVED" },
      });
      const facts: FactMap = new Map();

      expect(await provider.compute(CASE, ctx, facts)).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorIsCanonicalLawyer)).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.failureCode)).toBe("ACTING_LAWYER_NOT_RESOLVED");
    });

    it("tenant uyuşmazlığı deny üretir", async () => {
      const { provider } = makeProvider({
        acting: { resolved: false, failureCode: "LAWYER_TENANT_MISMATCH" },
      });
      const facts: FactMap = new Map();
      expect(await provider.compute(CASE, ctx, facts)).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.failureCode)).toBe("LAWYER_TENANT_MISMATCH");
    });

    it("POA yok → deny, ama actor doğrulanmış olarak işaretlenir", async () => {
      const { provider } = makeProvider({
        authority: { allowed: false, failureCode: "POWER_OF_ATTORNEY_MISSING" },
      });
      const facts: FactMap = new Map();

      expect(await provider.compute(CASE, ctx, facts)).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorIsCanonicalLawyer)).toBe(true);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorHasMatchingPoa)).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.failureCode)).toBe("POWER_OF_ATTORNEY_MISSING");
    });

    it("ambiguous authority deny üretir", async () => {
      const { provider } = makeProvider({
        authority: { allowed: false, failureCode: "AUTHORITY_RECORD_CONFLICT" },
      });
      const facts: FactMap = new Map();
      expect(await provider.compute(CASE, ctx, facts)).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.authorityUnambiguous)).toBe(false);
    });

    it("resolver THROW ederse provider throw ETMEZ, deny üretir (registry hatayı yutmasın)", async () => {
      const a = makeProvider({ actingThrows: true });
      const factsA: FactMap = new Map();
      await expect(a.provider.compute(CASE, ctx, factsA)).resolves.toBe(false);
      expect(factsA.get(UYAP_AUTHORITY_FACT_KEYS.failureCode)).toBe("AUTHORITY_CONTEXT_INVALID");

      const b = makeProvider({ authorityThrows: true });
      const factsB: FactMap = new Map();
      await expect(b.provider.compute(CASE, ctx, factsB)).resolves.toBe(false);
    });
  });

  describe("client-controlled input etkisiz", () => {
    it("context.actingLawyerId spoof'u server-side çözülenle uyuşmazsa deny", async () => {
      const { provider } = makeProvider({});
      const facts: FactMap = new Map();

      const result = await provider.compute(
        CASE,
        { ...ctx, actingLawyerId: "attacker-lawyer" } as any,
        facts,
      );

      expect(result).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.failureCode)).toBe("ACTING_LAWYER_NOT_RESOLVED");
    });

    it("context.userId (audit alanı) authority girdisi olarak KULLANILMAZ", async () => {
      const { provider, tryResolve } = makeProvider({});
      await provider.compute(CASE, { ...ctx, userId: "attacker-user" } as any, new Map());
      expect(tryResolve).toHaveBeenCalledWith({ userId: USER, tenantId: TENANT });
    });
  });

  describe("legacy flag artık authority değil", () => {
    it("legacy true + geçersiz authority → alias false (legacy EZİLİR)", async () => {
      const { provider } = makeProvider({
        authority: { allowed: false, failureCode: "POWER_OF_ATTORNEY_EXPIRED" },
      });
      const facts: FactMap = new Map([["case.has_power_of_attorney", true]]);

      const alias = await provider.compute(CASE, ctx, facts);
      facts.set("case.has_power_of_attorney", alias); // registry'nin yaptığı yazma

      expect(alias).toBe(false);
      expect(gateBlocks(facts)).toBe(true);
    });

    it("legacy false + geçerli authority → gate GEÇER", async () => {
      const { provider } = makeProvider({});
      const facts: FactMap = new Map([["case.has_power_of_attorney", false]]);

      const alias = await provider.compute(CASE, ctx, facts);
      facts.set("case.has_power_of_attorney", alias);

      expect(alias).toBe(true);
      expect(gateBlocks(facts)).toBe(false);
    });
  });

  describe("POWER_OF_ATTORNEY_MISSING gate koşulu", () => {
    it("granular fact'ler eksikken bloklar (fail-closed)", () => {
      expect(gateBlocks(new Map())).toBe(true);
    });

    it("yalnız legacy alias true iken bile bloklar (granular fact yok)", () => {
      expect(gateBlocks(new Map([["case.has_power_of_attorney", true]]))).toBe(true);
    });

    it("beş granular fact true iken geçirir", () => {
      const facts: FactMap = new Map([
        ["actor.is_canonical_lawyer", true],
        ["actor.has_matching_power_of_attorney", true],
        ["poa.is_effective_at_evaluation_time", true],
        ["poa.covers_requested_operation", true],
        ["authority.is_unambiguous", true],
      ]);
      expect(gateBlocks(facts)).toBe(false);
    });

    it("tek bir fact false olsa bile bloklar", () => {
      const base: Array<[string, any]> = [
        ["actor.is_canonical_lawyer", true],
        ["actor.has_matching_power_of_attorney", true],
        ["poa.is_effective_at_evaluation_time", true],
        ["poa.covers_requested_operation", true],
        ["authority.is_unambiguous", true],
      ];
      for (let i = 0; i < base.length; i++) {
        const facts: FactMap = new Map(base as any);
        facts.set(base[i][0], false);
        expect(gateBlocks(facts)).toBe(true);
      }
    });

    it("gate yalnız UYAP_SEND için tanımlıdır", () => {
      expect(poaGate.actionCodes).toContain("UYAP_SEND");
      expect(poaGate.severity).toBe("HARD");
    });
  });
});

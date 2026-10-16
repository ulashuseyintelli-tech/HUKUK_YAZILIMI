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
import {
  UyapAuthorityFactProvider,
  UYAP_AUTHORITY_FACT_KEYS,
} from "../authority/uyap-authority-fact.provider";
import { COMPILED_GATES, getGatesForAction } from "@/modules/policy-engine/gate-checker/compiled/gates.compiled";
import { ActionCode } from "@/modules/policy-engine/types/action-code.enum";
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
  /** P5 (owner Ek 94): dosya ataması sonucu (varsayılan: atanmış). */
  assigned?: boolean;
  assignedThrows?: boolean;
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
  const isAssignedToCase = jest.fn().mockImplementation(async () => {
    if (opts.assignedThrows) throw new Error("db down");
    return opts.assigned ?? true;
  });
  const provider = new UyapAuthorityFactProvider(
    { tryResolve, isAssignedToCase } as any,
    { resolve } as any,
  );
  return { provider, tryResolve, resolve, isAssignedToCase };
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
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorAssignedToCase)).toBe(true);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.failureCode)).toBeNull();
    });

    it("P5: atama denetimi YALNIZ sunucuda çözülen avukat + dosya + kiracı ile yapılır", async () => {
      const { provider, isAssignedToCase } = makeProvider({});
      await provider.compute(CASE, { ...ctx, actingLawyerId: LAWYER } as any, new Map());
      expect(isAssignedToCase).toHaveBeenCalledTimes(1);
      expect(isAssignedToCase).toHaveBeenCalledWith({ actingLawyerId: LAWYER, caseId: CASE, tenantId: TENANT });
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

  describe("P5 (owner Ek 94, karar a2): dosya ataması EK koşulu", () => {
    it("geçerli vekalet + dosyaya ATANMAMIŞ → atama olgusu false; vekalet olguları ve ret nedeni (null) vekaleti anlatır (Ek 95 K1: main ile aynı)", async () => {
      const { provider } = makeProvider({ assigned: false });
      const facts: FactMap = new Map();

      const alias = await provider.compute(CASE, ctx, facts);

      expect(alias).toBe(true); // alias = vekalet (atama ayrı olgudadır)
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorHasMatchingPoa)).toBe(true);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorAssignedToCase)).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.failureCode)).toBeNull();
    });

    it("vekalet reddedildiyse atama SORGULANMAZ ve olgu false (fail-closed; ret nedeni vekaletin)", async () => {
      const { provider, isAssignedToCase } = makeProvider({
        authority: { allowed: false, failureCode: "POWER_OF_ATTORNEY_MISSING" },
      });
      const facts: FactMap = new Map();
      await provider.compute(CASE, ctx, facts);
      expect(isAssignedToCase).not.toHaveBeenCalled();
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorAssignedToCase)).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.failureCode)).toBe("POWER_OF_ATTORNEY_MISSING");
    });

    it("avukat çözülemezse (personel / yönetici) atama olgusu false", async () => {
      const { provider, isAssignedToCase } = makeProvider({ acting: { resolved: false, failureCode: "ACTING_LAWYER_NOT_RESOLVED" } });
      const facts: FactMap = new Map();
      await provider.compute(CASE, ctx, facts);
      expect(isAssignedToCase).not.toHaveBeenCalled();
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorAssignedToCase)).toBe(false);
    });

    it("atama sorgusu THROW ederse tüm olgular false (vekalet olguları da), provider throw ETMEZ", async () => {
      const { provider } = makeProvider({ assignedThrows: true });
      const facts: FactMap = new Map();
      await expect(provider.compute(CASE, ctx, facts)).resolves.toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorAssignedToCase)).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.actorHasMatchingPoa)).toBe(false);
      expect(facts.get(UYAP_AUTHORITY_FACT_KEYS.failureCode)).toBe("AUTHORITY_CONTEXT_INVALID");
    });

    const assignmentGates = COMPILED_GATES.filter((g: any) => g.gateCode === "ACTING_LAWYER_NOT_ASSIGNED_TO_CASE");
    const gateFor = (code: ActionCode) => getGatesForAction(code).find((g) => g.gateCode === "ACTING_LAWYER_NOT_ASSIGNED_TO_CASE")!;
    const XML = { uyapSubmitChannel: "XML_SUBMIT" } as any;

    it("kapı: evrak / dava kodlarında olgu true iken geçirir; false / eksik / true olmayan değerde bloklar (pozitif ispat, bağlamdan bağımsız)", () => {
      expect(assignmentGates).toHaveLength(2);
      for (const code of [ActionCode.UYAP_DOCUMENT_SUBMIT, ActionCode.UYAP_LAWSUIT_FILE]) {
        const g = gateFor(code);
        expect(g.severity).toBe("HARD");
        for (const ctx of [undefined, {} as any, XML]) {
          expect(g.condition(new Map([["actor.is_assigned_to_case", true]]), ctx)).toBe(false);
          expect(g.condition(new Map([["actor.is_assigned_to_case", false]]), ctx)).toBe(true);
          expect(g.condition(new Map(), ctx)).toBe(true);
          expect(g.condition(new Map([["actor.is_assigned_to_case", "true" as any]]), ctx)).toBe(true);
        }
      }
    });

    it("Ek 95 K1: UYAP_SEND'de kapı YALNIZ xml/submit bağlamında (uyapSubmitChannel = XML_SUBMIT) tetiklenir; bağlamsız (hazırlık / ödeme emri) tetiklenmez", () => {
      const g = gateFor(ActionCode.UYAP_SEND);
      expect(g.severity).toBe("HARD");
      expect(g.condition(new Map([["actor.is_assigned_to_case", false]]), XML)).toBe(true);
      expect(g.condition(new Map(), XML)).toBe(true);
      expect(g.condition(new Map([["actor.is_assigned_to_case", true]]), XML)).toBe(false);
      expect(g.condition(new Map([["actor.is_assigned_to_case", false]]), undefined as any)).toBe(false);
      expect(g.condition(new Map(), {} as any)).toBe(false);
      expect(g.condition(new Map(), { uyapSubmitChannel: "OTHER" } as any)).toBe(false);
    });

    it("kapı kapsamı = POWER_OF_ATTORNEY_MISSING taşıyan HER eylem (UYAP_SEND, UYAP_DOCUMENT_SUBMIT, UYAP_LAWSUIT_FILE); başka eylem YOK", () => {
      const withPoa = Object.values(ActionCode)
        .filter((code) => getGatesForAction(code as ActionCode).some((g) => g.gateCode === "POWER_OF_ATTORNEY_MISSING"))
        .sort();
      const withAssignment = Object.values(ActionCode)
        .filter((code) => getGatesForAction(code as ActionCode).some((g) => g.gateCode === "ACTING_LAWYER_NOT_ASSIGNED_TO_CASE"))
        .sort();
      expect(withPoa.length).toBeGreaterThan(0); // 0 = kör
      expect(withAssignment).toEqual(withPoa);
      expect(withAssignment).toEqual(["UYAP_DOCUMENT_SUBMIT", "UYAP_LAWSUIT_FILE", "UYAP_SEND"]);
      // Haciz aşama matrisi / yetkisi DEĞİŞMEDİ: TRIGGER_HACIZ ne vekalet kapısını ne atama kapısını taşır.
      expect(withAssignment).not.toContain("TRIGGER_HACIZ");
    });

    it("kapı önceliği vekalet kapısından SONRA (vekalet reddi kendi koduyla görünür); iki satırın kod / önem / öncelik / gerekçesi aynı", () => {
      for (const g of assignmentGates) expect(g.priority).toBeGreaterThan(poaGate.priority);
      const shape = (g: any) => ({ gateCode: g.gateCode, severity: g.severity, priority: g.priority, reason: g.reason });
      expect(shape(assignmentGates[0])).toEqual(shape(assignmentGates[1]));
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

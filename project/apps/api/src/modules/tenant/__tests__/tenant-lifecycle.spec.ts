import {
  ACTIVE_TENANT_LIFECYCLE,
  ACTIVE_TENANT_WHERE,
  QUIESCE_TARGET_STATES,
  TENANT_LIFECYCLE_STATES,
  allowedTransitionsFrom,
  canTransitionLifecycle,
  isLifecycleTargetConsistent,
  isLoginableLifecycle,
  isQuiesceTargetState,
  isTenantLifecycleState,
  isTerminalLifecycleState,
  isTransitionalLifecycleState,
  isWorkerSelectableLifecycle,
  requiresLifecycleTarget,
} from "../tenant-lifecycle";
import type { TenantLifecycleState } from "../tenant-lifecycle";

/**
 * C15-S1-MODIFIED · PR-1 — lifecycle tip/geçiş güvenliği (SAF birim testi, DB YOK).
 *
 * Bu suite YALNIZ PR-1 kapsamını kilitler: durum kümesi, geçiş tablosu, fail-closed
 * davranış ve hedef tutarlılığı. Auth/worker/quiesce yaptırımı bu PR'da YOK — onların
 * testleri PR-2/3/4'tedir.
 */
describe("C15-S1-MODIFIED PR-1 — TenantLifecycle tip ve geçiş güvenliği", () => {
  describe("durum kümesi", () => {
    it("beş kanonik durumu tam ve sırasıyla içerir (Prisma enum ile birebir)", () => {
      expect(TENANT_LIFECYCLE_STATES).toEqual([
        "PROVISIONING",
        "ACTIVE",
        "QUIESCING",
        "SUSPENDED",
        "RETIRED",
      ]);
    });

    it("worker ve login'in kabul ettiği tek durum ACTIVE'dir", () => {
      expect(ACTIVE_TENANT_LIFECYCLE).toBe("ACTIVE");
    });

    it("quiesce hedefleri yalnız SUSPENDED ve RETIRED'dır", () => {
      expect(QUIESCE_TARGET_STATES).toEqual(["SUSPENDED", "RETIRED"]);
    });
  });

  describe("tip koruyucuları — fail-closed", () => {
    it.each(TENANT_LIFECYCLE_STATES)("%s bilinen bir durumdur", (state) => {
      expect(isTenantLifecycleState(state)).toBe(true);
    });

    it.each([
      ["küçük harf", "active"],
      ["bilinmeyen", "ARCHIVED"],
      ["boş", ""],
      ["null", null],
      ["undefined", undefined],
      ["sayı", 1],
      ["nesne", { lifecycle: "ACTIVE" }],
      ["dizi", ["ACTIVE"]],
    ])("%s girdi reddedilir", (_ad, value) => {
      expect(isTenantLifecycleState(value)).toBe(false);
    });

    it("quiesce hedefi olmayan durumlar hedef olarak reddedilir", () => {
      expect(isQuiesceTargetState("ACTIVE")).toBe(false);
      expect(isQuiesceTargetState("PROVISIONING")).toBe(false);
      expect(isQuiesceTargetState("QUIESCING")).toBe(false);
      expect(isQuiesceTargetState(null)).toBe(false);
      expect(isQuiesceTargetState("SUSPENDED")).toBe(true);
      expect(isQuiesceTargetState("RETIRED")).toBe(true);
    });
  });

  describe("geçiş tablosu", () => {
    const IZINLI: ReadonlyArray<[TenantLifecycleState, TenantLifecycleState]> = [
      ["PROVISIONING", "ACTIVE"],
      ["PROVISIONING", "QUIESCING"],
      ["ACTIVE", "QUIESCING"],
      ["QUIESCING", "SUSPENDED"],
      ["QUIESCING", "RETIRED"],
      ["QUIESCING", "ACTIVE"],
      ["SUSPENDED", "ACTIVE"],
      ["SUSPENDED", "QUIESCING"],
    ];

    it.each(IZINLI)("%s -> %s izinlidir", (from, to) => {
      expect(canTransitionLifecycle(from, to)).toBe(true);
    });

    it("izinli geçiş kümesi TAM olarak sekiz tanedir (sessiz genişleme yakalanır)", () => {
      const hepsi: Array<[TenantLifecycleState, TenantLifecycleState]> = [];
      for (const from of TENANT_LIFECYCLE_STATES) {
        for (const to of TENANT_LIFECYCLE_STATES) {
          if (canTransitionLifecycle(from, to)) hepsi.push([from, to]);
        }
      }
      expect(hepsi).toHaveLength(IZINLI.length);
      expect(new Set(hepsi.map((p) => p.join("->")))).toEqual(
        new Set(IZINLI.map((p) => p.join("->"))),
      );
    });

    it("ACTIVE'den doğrudan SUSPENDED/RETIRED'a geçilemez — quiesce zorunludur", () => {
      expect(canTransitionLifecycle("ACTIVE", "SUSPENDED")).toBe(false);
      expect(canTransitionLifecycle("ACTIVE", "RETIRED")).toBe(false);
    });

    it("PROVISIONING'den doğrudan terminal duruma geçilemez", () => {
      expect(canTransitionLifecycle("PROVISIONING", "SUSPENDED")).toBe(false);
      expect(canTransitionLifecycle("PROVISIONING", "RETIRED")).toBe(false);
    });

    it("RETIRED terminaldir — hiçbir çıkış yoktur", () => {
      expect(isTerminalLifecycleState("RETIRED")).toBe(true);
      expect(allowedTransitionsFrom("RETIRED")).toEqual([]);
      for (const to of TENANT_LIFECYCLE_STATES) {
        expect(canTransitionLifecycle("RETIRED", to)).toBe(false);
      }
    });

    it("aynı duruma geçiş İZİNLİ DEĞİLDİR (idempotency bir geçiş değildir)", () => {
      for (const state of TENANT_LIFECYCLE_STATES) {
        expect(canTransitionLifecycle(state, state)).toBe(false);
      }
    });

    it("bilinmeyen girdiyle geçiş fail-closed reddedilir", () => {
      expect(canTransitionLifecycle("ACTIVE", "ARCHIVED")).toBe(false);
      expect(canTransitionLifecycle("archived", "ACTIVE")).toBe(false);
      expect(canTransitionLifecycle(null, "ACTIVE")).toBe(false);
      expect(canTransitionLifecycle("ACTIVE", undefined)).toBe(false);
      expect(canTransitionLifecycle(undefined, undefined)).toBe(false);
    });

    it("allowedTransitionsFrom kopya döner — iç tablo mutasyona kapalıdır", () => {
      const ilk = allowedTransitionsFrom("ACTIVE");
      ilk.push("RETIRED");
      expect(allowedTransitionsFrom("ACTIVE")).toEqual(["QUIESCING"]);
    });
  });

  describe("geçiş durumu ve hedef tutarlılığı", () => {
    it("yalnız QUIESCING geçiş durumudur ve hedef ZORUNLUDUR", () => {
      for (const state of TENANT_LIFECYCLE_STATES) {
        const beklenen = state === "QUIESCING";
        expect(isTransitionalLifecycleState(state)).toBe(beklenen);
        expect(requiresLifecycleTarget(state)).toBe(beklenen);
      }
    });

    it("QUIESCING hedefsiz olamaz", () => {
      expect(isLifecycleTargetConsistent("QUIESCING", null)).toBe(false);
      expect(isLifecycleTargetConsistent("QUIESCING", undefined)).toBe(false);
      expect(isLifecycleTargetConsistent("QUIESCING", "ACTIVE")).toBe(false);
      expect(isLifecycleTargetConsistent("QUIESCING", "SUSPENDED")).toBe(true);
      expect(isLifecycleTargetConsistent("QUIESCING", "RETIRED")).toBe(true);
    });

    it("QUIESCING dışındaki durumlarda hedef NULL olmalıdır (sızmış hedef yakalanır)", () => {
      for (const state of TENANT_LIFECYCLE_STATES.filter((s) => s !== "QUIESCING")) {
        expect(isLifecycleTargetConsistent(state, null)).toBe(true);
        expect(isLifecycleTargetConsistent(state, undefined)).toBe(true);
        expect(isLifecycleTargetConsistent(state, "RETIRED")).toBe(false);
      }
    });

    it("bilinmeyen durum hedef tutarlılığında fail-closed", () => {
      expect(isLifecycleTargetConsistent("ARCHIVED", null)).toBe(false);
      expect(isLifecycleTargetConsistent(null, null)).toBe(false);
    });
  });

  describe("yüklem temeli (PR-2'de bağlanacak, burada YALNIZ tanım)", () => {
    it("yalnız ACTIVE worker tarafından seçilebilir", () => {
      for (const state of TENANT_LIFECYCLE_STATES) {
        expect(isWorkerSelectableLifecycle(state)).toBe(state === "ACTIVE");
      }
      expect(isWorkerSelectableLifecycle("active")).toBe(false);
      expect(isWorkerSelectableLifecycle(null)).toBe(false);
      expect(isWorkerSelectableLifecycle(undefined)).toBe(false);
    });

    it("yalnız ACTIVE tenant'ın principal'ları login olabilir", () => {
      for (const state of TENANT_LIFECYCLE_STATES) {
        expect(isLoginableLifecycle(state)).toBe(state === "ACTIVE");
      }
      expect(isLoginableLifecycle("")).toBe(false);
    });

    it("ACTIVE_TENANT_WHERE dondurulmuştur ve ACTIVE'i gösterir", () => {
      expect(ACTIVE_TENANT_WHERE).toEqual({ lifecycle: "ACTIVE" });
      expect(Object.isFrozen(ACTIVE_TENANT_WHERE)).toBe(true);
    });
  });
});

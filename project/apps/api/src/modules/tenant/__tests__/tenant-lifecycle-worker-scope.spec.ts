// C15-S1-MODIFIED · PR-2 — tenant-tarayan worker'ların QUERY-LEVEL lifecycle elemesi.
//
// Bu suite yalnız "dönen sonuç" ile yetinmez: her worker'ın `prisma.tenant.findMany`
// çağrısına GEÇTİĞİ ARGÜMANI doğrular (`where.lifecycle === "ACTIVE"`). Böylece
// "önce hepsini çek, sonra ikinci bir kontrolle ele" biçimindeki bir uygulama testi
// GEÇEMEZ — aradaki pencerede ACTIVE olmayan tenant seçilmiş olurdu.
//
// Filtre üç worker'ın herhangi birinden kaldırılırsa o worker'ın testi DÜŞER.
import { GreetingService } from "../../greeting/greeting.service";
import { OperationalEscalationService } from "../../escalation/operational-escalation.service";
import { CaseTaskEscalationService } from "../../escalation/case-task-escalation.service";
import { ACTIVE_TENANT_LIFECYCLE, TENANT_LIFECYCLE_STATES } from "../tenant-lifecycle";

/** Prisma çağrılarını kaydeden minimal sahte istemci. */
function makePrisma() {
  const tenantFindMany = jest.fn().mockResolvedValue([]);
  return {
    spy: tenantFindMany,
    client: {
      tenant: { findMany: tenantFindMany },
      task: { findMany: jest.fn().mockResolvedValue([]) },
      office: { update: jest.fn().mockResolvedValue({}) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any,
  };
}

const noopNotifier = {
  sendEmail: jest.fn().mockResolvedValue("SKIPPED"),
  sendSms: jest.fn().mockResolvedValue("SKIPPED"),
} as any;
const noopReporter = { report: jest.fn(), reportCronFailure: jest.fn() } as any;

/** Üç worker: adı, tick'i tetikleyen çağrı ve prisma enjeksiyonu. */
const WORKERS: ReadonlyArray<{
  ad: string;
  calistir: (prisma: any) => Promise<unknown>;
  spyOf: (h: ReturnType<typeof makePrisma>) => jest.Mock;
}> = [
  {
    ad: "greeting.service.ts (@Cron EVERY_MINUTE)",
    calistir: (p) => new GreetingService(p, { sendEmail: jest.fn(), sendSms: jest.fn() } as any, noopReporter).greetingSchedulerTick(),
    spyOf: (h) => h.spy,
  },
  {
    ad: "operational-escalation.service.ts",
    calistir: (p) => new OperationalEscalationService(p, noopNotifier, noopReporter).processEscalations(),
    spyOf: (h) => h.spy,
  },
  {
    ad: "case-task-escalation.service.ts",
    calistir: (p) => new CaseTaskEscalationService(p, noopNotifier, noopReporter).processCaseTaskEscalations(),
    spyOf: (h) => h.spy,
  },
];

afterEach(() => jest.clearAllMocks());

describe("C15-S1-MODIFIED PR-2 — worker query-level lifecycle elemesi", () => {
  it.each(WORKERS.map((w) => [w.ad, w] as const))(
    "%s → tenant.findMany ÇAĞRI ARGÜMANINDA where.lifecycle === ACTIVE",
    async (_ad, w) => {
      const h = makePrisma();
      await w.calistir(h.client);

      const spy = w.spyOf(h);
      expect(spy).toHaveBeenCalledTimes(1);

      const args = spy.mock.calls[0][0];
      // Yüklem enumeration sorgusunun KENDİSİNDE olmalı — sonradan filtreleme YETMEZ.
      expect(args).toBeDefined();
      expect(args.where).toBeDefined();
      expect(args.where.lifecycle).toBe(ACTIVE_TENANT_LIFECYCLE);
      expect(args.where.lifecycle).toBe("ACTIVE");
    },
  );

  it.each(WORKERS.map((w) => [w.ad, w] as const))(
    "%s → ACTIVE dışındaki HİÇBİR durum sorguda talep edilmez",
    async (_ad, w) => {
      const h = makePrisma();
      await w.calistir(h.client);

      const args = w.spyOf(h).mock.calls[0][0];
      const serialized = JSON.stringify(args.where);
      for (const state of TENANT_LIFECYCLE_STATES.filter((s) => s !== "ACTIVE")) {
        expect(serialized).not.toContain(state);
      }
    },
  );

  it("ÜÇ worker'ın ÜÇÜ de yüklem taşır — biri bile kaldırılırsa bu test düşer", async () => {
    const sonuclar: Array<{ ad: string; lifecycle: unknown }> = [];
    for (const w of WORKERS) {
      const h = makePrisma();
      await w.calistir(h.client);
      const args = w.spyOf(h).mock.calls[0]?.[0];
      sonuclar.push({ ad: w.ad, lifecycle: args?.where?.lifecycle });
    }
    expect(sonuclar).toHaveLength(3);
    for (const s of sonuclar) {
      expect(s.lifecycle).toBe("ACTIVE");
    }
  });

  it("NEGATİF KONTROL: yüklemsiz bir sorgu bu testlerden GEÇEMEZ", () => {
    // Filtrenin kaldırıldığı durumun taklidi: where yok.
    const yuklemsiz: any = { include: { office: true } };
    expect(() => {
      expect(yuklemsiz.where?.lifecycle).toBe("ACTIVE");
    }).toThrow();

    // "Sonradan filtreleme" de geçemez: yüklem sorguda DEĞİL, sonuçta uygulanmış olurdu.
    const sonradanFiltre: any = { include: { office: true } };
    expect(sonradanFiltre.where).toBeUndefined();
  });
});

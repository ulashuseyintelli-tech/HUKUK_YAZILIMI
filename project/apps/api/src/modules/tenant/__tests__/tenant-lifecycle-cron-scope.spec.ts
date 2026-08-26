/**
 * C15 PR-4A — cross-tenant cron taramalarının QUERY-LEVEL ACTIVE daraltması (BİRİM).
 *
 * Bu spec, PR-4A allowlist'indeki 24 call-site'ın HER BİRİ için sorgunun
 * ÇAĞRI ARGÜMANINI okur ve `ACTIVE_TENANT_WHERE` yükleminin doğru ilişki
 * yolunda bulunduğunu doğrular (PR-2 worker-scope deseni). "Önce hepsini çek
 * sonra ele" bu testlerden GEÇEMEZ: dönen listeye değil, sorguya gönderilen
 * `where` nesnesine bakılır.
 *
 * Ek sözleşmeler:
 *  - Paylaşılan metotlarda (tenantId/scope parametreli) TENANT-SCOPED dal
 *    DEĞİŞMEMİŞTİR: scoped çağrıda lifecycle yüklemi EKLENMEZ.
 *  - NEGATİF KONTROL: `calculateDailyStats` bilinçli kapsam DIŞIDIR (OD-D
 *    owner kararı bekliyor) — sorgusunda lifecycle yüklemi OLMADIĞI sabitlenir.
 *    Bu, mutasyon provasında "ilgisiz yüzeye dokunma kapıyı düşürmez"
 *    kontrolünün de çapasıdır.
 *
 * ŞERH (PR-4A kapsam beyanından): bu daraltma yalnız SEÇİM engellemesidir;
 * backfill/catch-up sağlamaz ve "drain güvenli" / "Q5 hazır" hükmü KURMAZ.
 */

import { SchedulerService } from "../../scheduler/scheduler.service";
import { AutomationService } from "../../automation/automation.service";
import { PoaExpiryDeliveryService } from "../../automation/poa-expiry-delivery.service";
import { DebtorCrossCaseNotificationService } from "../../debtor/debtor-cross-case-notification.service";
import { AddressTaskService } from "../../address-task/address-task.service";
import { AddressTaskSchedulerService } from "../../address-task/address-task-scheduler.service";
import { ClientStatementMonthlyDeliveryService } from "../../client-statement/client-statement-monthly-delivery.service";
import { RateSyncService } from "../../interest-engine/rate-sync.service";
import { ACTIVE_TENANT_WHERE } from "../tenant-lifecycle";

type Cagri = { args: unknown[] };

/** model.metod başına çağrıları yakalayan, boş sonuç dönen stub Prisma. */
function yakalayiciPrisma() {
  const kayit = new Map<string, Cagri[]>();
  const al = (anahtar: string): Cagri[] => {
    if (!kayit.has(anahtar)) kayit.set(anahtar, []);
    return kayit.get(anahtar)!;
  };
  const model = (ad: string) =>
    new Proxy(
      {},
      {
        get(_t, metod: string) {
          return async (...args: unknown[]) => {
            al(`${ad}.${metod}`).push({ args });
            if (metod === "updateMany" || metod === "count") {
              return metod === "count" ? 0 : { count: 0 };
            }
            if (metod === "groupBy") return [];
            return [];
          };
        },
      },
    );
  const prisma = new Proxy(
    { $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn(prismaIc) },
    {
      get(t, prop: string) {
        if (prop in t) return (t as Record<string, unknown>)[prop];
        return model(prop);
      },
    },
  );
  // $transaction içindeki tx de aynı yakalayıcıyı kullanır.
  const prismaIc = prisma;
  const where = (anahtar: string, indeks = 0): Record<string, unknown> => {
    const c = kayit.get(anahtar);
    if (!c || !c[indeks]) throw new Error(`çağrı yakalanmadı: ${anahtar}[${indeks}]`);
    return (c[indeks].args[0] as { where: Record<string, unknown> }).where;
  };
  const sayi = (anahtar: string): number => kayit.get(anahtar)?.length ?? 0;
  return { prisma: prisma as never, where, sayi };
}

const bos = {} as never;

describe("C15 PR-4A — cron taramaları QUERY-LEVEL ACTIVE daraltması (çağrı-argümanı)", () => {
  // ---------------------------------------------------------------- scheduler
  describe("SchedulerService (9 sorgu)", () => {
    const kur = () => {
      const y = yakalayiciPrisma();
      const svc = new SchedulerService(
        y.prisma,
        { record: () => undefined } as never,
        bos,
        bos,
        bos,
      );
      return { ...y, svc };
    };

    it("checkPaymentOrderDeadlines: case.findMany where.tenant === ACTIVE_TENANT_WHERE", async () => {
      const { svc, where } = kur();
      await svc.checkPaymentOrderDeadlines();
      expect(where("case.findMany").tenant).toBe(ACTIVE_TENANT_WHERE);
    });

    it("processNafakaPeriods: case.findMany where.tenant === ACTIVE_TENANT_WHERE", async () => {
      const { svc, where } = kur();
      await svc.processNafakaPeriods();
      expect(where("case.findMany").tenant).toBe(ACTIVE_TENANT_WHERE);
    });

    it("checkMtsReturns: case.findMany where.tenant === ACTIVE_TENANT_WHERE", async () => {
      const { svc, where } = kur();
      await svc.checkMtsReturns();
      expect(where("case.findMany").tenant).toBe(ACTIVE_TENANT_WHERE);
    });

    it("checkUpcomingTasks: task.count where.tenant === ACTIVE_TENANT_WHERE", async () => {
      const { svc, where } = kur();
      await svc.checkUpcomingTasks();
      expect(where("task.count").tenant).toBe(ACTIVE_TENANT_WHERE);
    });

    it("checkIhbarnameDeadlines: İKİ thirdParty.findMany da caseDebtor.case.tenant yolunu taşır", async () => {
      const { svc, where, sayi } = kur();
      await svc.checkIhbarnameDeadlines();
      expect(sayi("thirdParty.findMany")).toBe(2);
      for (const i of [0, 1]) {
        const w = where("thirdParty.findMany", i) as {
          caseDebtor?: { case?: { tenant?: unknown } };
        };
        expect(w.caseDebtor?.case?.tenant).toBe(ACTIVE_TENANT_WHERE);
      }
    });

    it("checkExternalCaseFollowups: externalCase.findMany caseDebtor.case.tenant yolunu taşır", async () => {
      const { svc, where } = kur();
      await svc.checkExternalCaseFollowups();
      const w = where("externalCase.findMany") as { caseDebtor?: { case?: { tenant?: unknown } } };
      expect(w.caseDebtor?.case?.tenant).toBe(ACTIVE_TENANT_WHERE);
    });

    it("checkTebligatStatus: İKİ tebligat.findMany da case.tenant yolunu taşır", async () => {
      const { svc, where, sayi } = kur();
      await svc.checkTebligatStatus();
      expect(sayi("tebligat.findMany")).toBe(2);
      for (const i of [0, 1]) {
        const w = where("tebligat.findMany", i) as { case?: { tenant?: unknown } };
        expect(w.case?.tenant).toBe(ACTIVE_TENANT_WHERE);
      }
    });

    it("NEGATİF KONTROL — calculateDailyStats kapsam DIŞI (OD-D): sorgularında lifecycle yüklemi YOK", async () => {
      const { svc, where } = kur();
      await svc.calculateDailyStats();
      const g = where("case.groupBy") as { tenant?: unknown };
      // groupBy'da where hiç yok ya da tenant içermiyor — her iki hâl de kapsam-dışılığı kanıtlar.
      expect(g?.tenant).toBeUndefined();
      const d = where("decisionLog.count") as { case?: unknown };
      expect(d.case).toBeUndefined();
    });
  });

  // --------------------------------------------------------------- automation
  describe("AutomationService (4 sorgu)", () => {
    const kur = () => {
      const y = yakalayiciPrisma();
      const svc = new AutomationService(y.prisma, bos, bos, bos, bos);
      return { ...y, svc };
    };

    it("processPendingCases: case.findMany where.tenant === ACTIVE_TENANT_WHERE", async () => {
      const { svc, where } = kur();
      await svc.processPendingCases();
      expect(where("case.findMany").tenant).toBe(ACTIVE_TENANT_WHERE);
    });

    it("updateDaysLeft: case.findMany where.tenant === ACTIVE_TENANT_WHERE", async () => {
      const { svc, where } = kur();
      await svc.updateDaysLeft();
      expect(where("case.findMany").tenant).toBe(ACTIVE_TENANT_WHERE);
    });

    it("updateExpiredPoas: clientPowerOfAttorney.updateMany where.tenant === ACTIVE_TENANT_WHERE", async () => {
      const { svc, where } = kur();
      await svc.updateExpiredPoas();
      expect(where("clientPowerOfAttorney.updateMany").tenant).toBe(ACTIVE_TENANT_WHERE);
    });

    it("updateRiskScores: case.findMany where.tenant === ACTIVE_TENANT_WHERE", async () => {
      const { svc, where } = kur();
      await svc.updateRiskScores();
      expect(where("case.findMany").tenant).toBe(ACTIVE_TENANT_WHERE);
    });
  });

  // ------------------------------------------------- debtor cross-case sweep
  describe("DebtorCrossCaseNotificationService (3 sorgu + dal koruması)", () => {
    const kur = () => {
      const y = yakalayiciPrisma();
      const svc = new DebtorCrossCaseNotificationService(y.prisma, {
        logInTransaction: async () => undefined,
      } as never);
      return { ...y, svc };
    };

    it("expireStaleNotifications(): cron dalı tenant yüklemini taşır", async () => {
      const { svc, where } = kur();
      await svc.expireStaleNotifications();
      const w = where("debtorCrossCaseNotification.updateMany");
      expect(w.tenant).toBe(ACTIVE_TENANT_WHERE);
      expect(w.tenantId).toBeUndefined();
    });

    it("expireStaleNotifications('T1'): tenant-scoped dal DEĞİŞMEDİ (lifecycle yüklemi YOK)", async () => {
      const { svc, where } = kur();
      await svc.expireStaleNotifications("T1");
      const w = where("debtorCrossCaseNotification.updateMany");
      expect(w.tenantId).toBe("T1");
      expect(w.tenant).toBeUndefined();
    });

    it("expireStaleNotificationsForInactiveRecipients(): user + dccn sorguları tenant yüklemini taşır", async () => {
      const y = yakalayiciPrisma();
      // user.findMany bir kullanıcı döndürmeli ki ikinci sorgu koşsun.
      const prisma = y.prisma as unknown as Record<string, Record<string, unknown>>;
      const asilUser = prisma.user;
      void asilUser; // proxy — override aşağıda ayrı stub ile
      const svc = new DebtorCrossCaseNotificationService(
        new Proxy(y.prisma as object, {
          get(t, prop: string) {
            if (prop === "user") {
              return {
                findMany: async (arg: { where: Record<string, unknown> }) => {
                  (y as unknown as { userWhere?: unknown }).userWhere = arg.where;
                  return [{ id: "u1" }];
                },
              };
            }
            return (t as Record<string, unknown>)[prop as string] ?? Reflect.get(t, prop);
          },
        }) as never,
        { logInTransaction: async () => undefined } as never,
      );
      await svc.expireStaleNotificationsForInactiveRecipients();
      const userWhere = (y as unknown as { userWhere: Record<string, unknown> }).userWhere;
      expect(userWhere.tenant).toBe(ACTIVE_TENANT_WHERE);
      const w = y.where("debtorCrossCaseNotification.findMany");
      expect(w.tenant).toBe(ACTIVE_TENANT_WHERE);
      expect(w.tenantId).toBeUndefined();
    });
  });

  // ------------------------------------------------------------- POA delivery
  describe("PoaExpiryDeliveryService (1 sorgu + dal koruması)", () => {
    const kur = () => {
      const y = yakalayiciPrisma();
      const svc = new PoaExpiryDeliveryService(y.prisma, bos);
      return { ...y, svc };
    };

    it("scope'suz (cron) dal: clientPowerOfAttorney.findMany where.tenant === ACTIVE_TENANT_WHERE", async () => {
      const { svc, where } = kur();
      await svc.sendExpiringPoaNotifications(new Date("2026-08-26T00:00:00Z"));
      expect(where("clientPowerOfAttorney.findMany").tenant).toBe(ACTIVE_TENANT_WHERE);
    });

    it("scope.tenantId dalı DEĞİŞMEDİ: client.tenantId yüklemi, lifecycle YOK", async () => {
      const { svc, where } = kur();
      await svc.sendExpiringPoaNotificationsForClient("T1", "C1", new Date("2026-08-26T00:00:00Z"));
      const w = where("clientPowerOfAttorney.findMany") as {
        tenant?: unknown;
        client?: { tenantId?: string };
      };
      expect(w.client?.tenantId).toBe("T1");
      expect(w.tenant).toBeUndefined();
    });
  });

  // -------------------------------------------------------------- address-task
  describe("AddressTask (4 sorgu + dal koruması)", () => {
    it("findOverdueTasks(): cron dalı tenant yüklemini taşır; ('T1') dalı DEĞİŞMEDİ", async () => {
      const y = yakalayiciPrisma();
      const svc = new AddressTaskService(y.prisma, bos, bos);
      await svc.findOverdueTasks();
      let w = y.where("addressTask.findMany", 0);
      expect(w.tenant).toBe(ACTIVE_TENANT_WHERE);
      await svc.findOverdueTasks("T1");
      w = y.where("addressTask.findMany", 1);
      expect(w.tenantId).toBe("T1");
      expect(w.tenant).toBeUndefined();
    });

    it("findTasksAtMaxAttempts(): iki dal da sözleşmeye uygun", async () => {
      const y = yakalayiciPrisma();
      const svc = new AddressTaskService(y.prisma, bos, bos);
      await svc.findTasksAtMaxAttempts();
      expect(y.where("addressTask.findMany", 0).tenant).toBe(ACTIVE_TENANT_WHERE);
      await svc.findTasksAtMaxAttempts("T1");
      const w = y.where("addressTask.findMany", 1);
      expect(w.tenantId).toBe("T1");
      expect(w.tenant).toBeUndefined();
    });

    it("checkAnnualRefreshTasks + publishOutboxEvents: her iki tarama da tenant yüklemini taşır", async () => {
      const y = yakalayiciPrisma();
      const svc = new AddressTaskSchedulerService(bos, y.prisma, bos, bos);
      await svc.checkAnnualRefreshTasks();
      expect(y.where("addressTask.findMany").tenant).toBe(ACTIVE_TENANT_WHERE);
      await svc.publishOutboxEvents();
      expect(y.where("addressOutboxEvent.findMany").tenant).toBe(ACTIVE_TENANT_WHERE);
    });
  });

  // -------------------------------------------------- client-statement (dinamik)
  describe("ClientStatementMonthlyDeliveryService (1 sorgu + dal koruması)", () => {
    const onceki = process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
    beforeAll(() => {
      process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = "true";
    });
    afterAll(() => {
      if (onceki === undefined) delete process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY;
      else process.env.CLIENT_STATEMENT_MONTHLY_DELIVERY = onceki;
    });

    const kur = () => {
      const y = yakalayiciPrisma();
      const svc = new ClientStatementMonthlyDeliveryService(y.prisma, bos, bos, bos);
      return { ...y, svc };
    };

    it("scope'suz (cron) dal: client.findMany where.tenant === ACTIVE_TENANT_WHERE", async () => {
      const { svc, where } = kur();
      await svc.runMonthlyDelivery(new Date("2026-08-26T00:00:00Z"), {});
      const w = where("client.findMany");
      expect(w.tenant).toBe(ACTIVE_TENANT_WHERE);
      expect(w.isActive).toBe(true);
    });

    it("scope.tenantId dalı DEĞİŞMEDİ", async () => {
      const { svc, where } = kur();
      await svc.runMonthlyDelivery(new Date("2026-08-26T00:00:00Z"), { tenantId: "T1" });
      const w = where("client.findMany");
      expect(w.tenantId).toBe("T1");
      expect(w.tenant).toBeUndefined();
    });
  });

  // ----------------------------------------------------------------- rate-sync
  describe("RateSyncService (2 sorgu)", () => {
    it("syncTcmbRates + syncMonthlyMevduatRates: office.findMany where.tenant === ACTIVE_TENANT_WHERE", async () => {
      const y = yakalayiciPrisma();
      const svc = new RateSyncService(y.prisma, bos, bos);
      await svc.syncTcmbRates();
      expect(y.where("office.findMany", 0).tenant).toBe(ACTIVE_TENANT_WHERE);
      await svc.syncMonthlyMevduatRates();
      expect(y.where("office.findMany", 1).tenant).toBe(ACTIVE_TENANT_WHERE);
    });
  });
});

/** @jest-environment node */
import "reflect-metadata";
import { NotFoundException, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { PolicyEngineController } from "../policy-engine.controller";
import { CasePolicyEngine } from "../case-policy-engine.service";
import { DecisionLoggerService } from "../decision-logger";
import { PrismaService } from "../../../prisma/prisma.service";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { ActionCode } from "../types/action-code.enum";

/**
 * B1 — PolicyEngineController tenant/guard hardening testleri.
 * KESİN: class-level JwtAuthGuard + controller-seviyesinde tenant-ownership kontrolü
 * (case {id,tenantId} ile bulunamazsa 404); CasePolicyEngine/DecisionLoggerService
 * imzaları DEĞİŞMEDİ. Önceden: controller tamamen guard'sızdı, herhangi bir caseId ile
 * kimliksiz istekle Case.workflowStage değiştirilebiliyordu (action-executed).
 */

// ---- Controller (mock cpe/decisionLogger/prisma) ----
const mkPrisma = (caseRow: unknown) => ({
  case: { findFirst: jest.fn().mockResolvedValue(caseRow) },
});

const mk = (caseRow: unknown = { id: "c1" }) => {
  const cpe = {
    canPerformAction: jest.fn().mockResolvedValue({ allowed: true, code: "OK" }),
    getNextActions: jest.fn().mockResolvedValue([]),
    onActionExecuted: jest.fn().mockResolvedValue({ success: true, stateVersion: 2 }),
  };
  const decisionLogger = {
    getDecisionHistory: jest.fn().mockResolvedValue([]),
    getDecision: jest.fn().mockResolvedValue(null),
  };
  const prisma = mkPrisma(caseRow);
  const controller = new PolicyEngineController(
    cpe as unknown as CasePolicyEngine,
    decisionLogger as unknown as DecisionLoggerService,
    prisma as unknown as PrismaService,
  );
  return { controller, cpe, decisionLogger, prisma };
};

afterEach(() => jest.clearAllMocks());

describe("B1 — PolicyEngineController guard metadata", () => {
  it("class-level JwtAuthGuard tüm route'ları korur (önceden HİÇ guard yoktu)", () => {
    const classGuards = Reflect.getMetadata("__guards__", PolicyEngineController) || [];
    expect(classGuards).toContain(JwtAuthGuard);
  });
});

describe("B1 — PolicyEngineController tenant-ownership (case-scoped endpoints)", () => {
  it("canPerformAction: case tenant'a ait → findFirst({id,tenantId}) ile doğrulanır, cpe çağrılır", async () => {
    const { controller, cpe, prisma } = mk({ id: "c1" });
    const res = await controller.canPerformAction("t1", "c1", { actionCode: ActionCode.UYAP_SEND } as never);
    expect((prisma as any).case.findFirst).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "t1" }, select: { id: true } });
    expect(cpe.canPerformAction).toHaveBeenCalledWith("c1", ActionCode.UYAP_SEND, undefined);
    expect(res).toEqual({ success: true, data: { allowed: true, code: "OK" } });
  });

  it("canPerformAction: cross-tenant/yok → NotFoundException, cpe ÇAĞRILMAZ", async () => {
    const { controller, cpe } = mk(null);
    await expect(controller.canPerformAction("t1", "c1", { actionCode: ActionCode.UYAP_SEND } as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(cpe.canPerformAction).not.toHaveBeenCalled();
  });

  it("getNextActions: cross-tenant/yok → NotFoundException, cpe ÇAĞRILMAZ", async () => {
    const { controller, cpe } = mk(null);
    await expect(controller.getNextActions("t1", "c1", {} as never)).rejects.toBeInstanceOf(NotFoundException);
    expect(cpe.getNextActions).not.toHaveBeenCalled();
  });

  it("getDecisionHistory: cross-tenant/yok → NotFoundException, decisionLogger ÇAĞRILMAZ", async () => {
    const { controller, decisionLogger } = mk(null);
    await expect(controller.getDecisionHistory("t1", "c1")).rejects.toBeInstanceOf(NotFoundException);
    expect(decisionLogger.getDecisionHistory).not.toHaveBeenCalled();
  });

  it("onActionExecuted (B1 asıl exploit yolu): case tenant'a ait → state mutation çağrılır", async () => {
    const { controller, cpe } = mk({ id: "c1" });
    const dto = { actionCode: ActionCode.UYAP_SEND, result: { success: true }, executionId: "exec-1" } as never;
    const res = await controller.onActionExecuted("t1", "c1", dto);
    expect(cpe.onActionExecuted).toHaveBeenCalledWith("c1", ActionCode.UYAP_SEND, undefined, { success: true }, "exec-1");
    expect(res).toEqual({ success: true, data: { success: true, stateVersion: 2 } });
  });

  it("onActionExecuted (B1 asıl exploit yolu): cross-tenant/yok → NotFoundException, state mutation ÇAĞRILMAZ", async () => {
    const { controller, cpe } = mk(null);
    const dto = { actionCode: ActionCode.UYAP_SEND, result: { success: true }, executionId: "exec-1" } as never;
    await expect(controller.onActionExecuted("t1", "c1", dto)).rejects.toBeInstanceOf(NotFoundException);
    expect(cpe.onActionExecuted).not.toHaveBeenCalled(); // KESİN: cross-tenant Case.workflowStage DEĞİŞTİRİLEMEZ
  });
});

describe("B1 — PolicyEngineController.getDecision (caseId-üzerinden tenant kontrolü)", () => {
  it("karar mevcut + case tenant'a ait → {success:true,data}", async () => {
    const { controller, decisionLogger, prisma } = mk({ id: "c1" });
    (decisionLogger.getDecision as jest.Mock).mockResolvedValueOnce({ id: "dec-1", caseId: "c1" });
    const res = await controller.getDecision("t1", "dec-1");
    expect((prisma as any).case.findFirst).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "t1" }, select: { id: true } });
    expect(res).toEqual({ success: true, data: { id: "dec-1", caseId: "c1" } });
  });

  it("karar mevcut ama case BAŞKA tenant'a ait → {success:false} (sızdırma yok; NotFoundException DEĞİL)", async () => {
    const { controller, decisionLogger } = mk(null); // case lookup null → başka tenant'a ait
    (decisionLogger.getDecision as jest.Mock).mockResolvedValueOnce({ id: "dec-1", caseId: "other-tenant-case" });
    const res = await controller.getDecision("t1", "dec-1");
    expect(res).toEqual({ success: false, error: "Decision not found" });
  });

  it("karar hiç yok → {success:false} (davranış değişmedi)", async () => {
    const { controller, prisma } = mk({ id: "c1" });
    const res = await controller.getDecision("t1", "does-not-exist");
    expect(res).toEqual({ success: false, error: "Decision not found" });
    expect((prisma as any).case.findFirst).not.toHaveBeenCalled(); // decision yoksa case lookup'a gerek yok
  });
});

// ---- HTTP binding (Nest TestingModule + supertest): guard + @CurrentUser/@Param eşlemesini KİLİTLER ----
// case-status-hardening.spec.ts'teki desenle aynı: unit testler positional çağırıyor,
// decorator sırası (tenantId↔caseId) swap olsa unit test yakalamaz — HTTP katmanı yakalar.
describe("B1 — action-executed HTTP binding (decorator/guard runtime)", () => {
  let app: INestApplication | undefined;
  const cpe = {
    canPerformAction: jest.fn(),
    getNextActions: jest.fn(),
    onActionExecuted: jest.fn().mockResolvedValue({ success: true, stateVersion: 2 }),
  };
  const decisionLogger = { getDecisionHistory: jest.fn(), getDecision: jest.fn() };
  const prisma = { case: { findFirst: jest.fn() } };

  const buildApp = async (authedUser: { id: string; tenantId: string } | null): Promise<INestApplication> => {
    const moduleRef = await Test.createTestingModule({
      controllers: [PolicyEngineController],
      providers: [
        { provide: CasePolicyEngine, useValue: cpe },
        { provide: DecisionLoggerService, useValue: decisionLogger },
        { provide: PrismaService, useValue: prisma },
      ],
    })
      .overrideGuard(JwtAuthGuard)
      .useValue({
        canActivate: (ctx: { switchToHttp: () => { getRequest: () => { user?: unknown } } }) => {
          if (!authedUser) return false; // override: unauth → 403 (gerçek passport JwtAuthGuard 401 verir); ikisi de mutation'ı ENGELLER
          ctx.switchToHttp().getRequest().user = authedUser;
          return true;
        },
      })
      .compile();
    const a = moduleRef.createNestApplication();
    await a.init();
    return a;
  };

  afterEach(async () => {
    if (app) await app.close();
    app = undefined;
    jest.clearAllMocks();
  });

  it("unauthenticated: guard state mutation'ı ENGELLER (override→403; gerçek passport→401), cpe/prisma ÇAĞRILMAZ — B1'in asıl kapattığı açık", async () => {
    app = await buildApp(null);
    await request(app.getHttpServer())
      .post("/policy-engine/cases/c1/action-executed")
      .send({ actionCode: ActionCode.UYAP_SEND, result: { success: true }, executionId: "exec-1" })
      .expect(403);
    expect(prisma.case.findFirst).not.toHaveBeenCalled();
    expect(cpe.onActionExecuted).not.toHaveBeenCalled();
  });

  it("authenticated + cross-tenant (case lookup null) → 404, state mutation ÇAĞRILMAZ", async () => {
    app = await buildApp({ id: "real-user", tenantId: "tenant-1" });
    (prisma.case.findFirst as jest.Mock).mockResolvedValueOnce(null);
    await request(app.getHttpServer())
      .post("/policy-engine/cases/c1/action-executed")
      .send({ actionCode: ActionCode.UYAP_SEND, result: { success: true }, executionId: "exec-1" })
      .expect(404);
    expect(prisma.case.findFirst).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "tenant-1" }, select: { id: true } });
    expect(cpe.onActionExecuted).not.toHaveBeenCalled();
  });

  it("authenticated + same-tenant: @CurrentUser('tenantId')→tenantId + @Param('caseId')→caseId slotları KİLİTLİ", async () => {
    app = await buildApp({ id: "real-user", tenantId: "tenant-1" });
    (prisma.case.findFirst as jest.Mock).mockResolvedValueOnce({ id: "c1" });
    const res = await request(app.getHttpServer())
      .post("/policy-engine/cases/c1/action-executed")
      .send({ actionCode: ActionCode.UYAP_SEND, result: { success: true }, executionId: "exec-1" })
      .expect(200);
    // tenantId↔caseId decorator swap olsaydı bu lookup ("c1","tenant-1") bozulurdu
    expect(prisma.case.findFirst).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "tenant-1" }, select: { id: true } });
    expect(cpe.onActionExecuted).toHaveBeenCalledWith("c1", ActionCode.UYAP_SEND, undefined, { success: true }, "exec-1");
    expect(res.body).toEqual({ success: true, data: { success: true, stateVersion: 2 } });
  });
});

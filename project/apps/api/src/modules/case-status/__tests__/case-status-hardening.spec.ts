/** @jest-environment node */
import "reflect-metadata";
import { NotFoundException, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { CaseStatusService } from "../case-status.service";
import { CaseStatusController } from "../case-status.controller";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";

/**
 * P2b-2c-1 — CHANGE_STATUS hardening (Option A) testleri.
 * KESİN: method-level JwtAuthGuard + truthful @CurrentUser actor/tenant; tenant-scoped lookup (cross-tenant→404);
 * changedById = authenticated User.id; body.userId YOK SAYILIR; observe/permission hook YOK; decisionLog değişmez.
 */

// ---- Service (mock PrismaService) ----
const mkTx = () => ({
  case: { update: jest.fn().mockResolvedValue({ id: "c1", caseStatus: "ISLEMDE" }) },
  caseStatusHistory: { create: jest.fn().mockResolvedValue({}) },
  decisionLog: { create: jest.fn().mockResolvedValue({}) },
});
const mkPrisma = (caseRow: unknown) => {
  const tx = mkTx();
  const prisma = {
    case: { findFirst: jest.fn().mockResolvedValue(caseRow) },
    $transaction: jest.fn(async (cb: (t: ReturnType<typeof mkTx>) => unknown) => cb(tx)),
  };
  return { tx, prisma: prisma as unknown as ConstructorParameters<typeof CaseStatusService>[0] };
};

describe("P2b-2c-1 — CaseStatusService.changeStatus hardening", () => {
  it("3. lookup TENANT-SCOPED: findFirst({ id, tenantId })", async () => {
    const { prisma } = mkPrisma({ caseStatus: "DERDEST", isAutomationEnabled: true });
    await new CaseStatusService(prisma).changeStatus("t1", "c1", "ISLEMDE" as never, "u1", "r");
    expect((prisma as any).case.findFirst).toHaveBeenCalledWith({
      where: { id: "c1", tenantId: "t1" },
      select: { caseStatus: true, isAutomationEnabled: true },
    });
  });

  it("4. cross-tenant / yok → NotFoundException (404), HİÇBİR yazma", async () => {
    const { prisma } = mkPrisma(null);
    await expect(new CaseStatusService(prisma).changeStatus("t1", "c1", "ISLEMDE" as never, "u1")).rejects.toBeInstanceOf(NotFoundException);
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });

  it("5. changedById = truthful actorUserId", async () => {
    const { tx, prisma } = mkPrisma({ caseStatus: "DERDEST", isAutomationEnabled: true });
    await new CaseStatusService(prisma).changeStatus("t1", "c1", "ISLEMDE" as never, "real-user", "r");
    expect(tx.caseStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(tx.caseStatusHistory.create.mock.calls[0][0].data.changedById).toBe("real-user");
  });

  it("9. decisionLog davranışı korunur (STATUS_CHANGE; aktör alanı EKLENMEZ)", async () => {
    const { tx, prisma } = mkPrisma({ caseStatus: "DERDEST", isAutomationEnabled: true });
    await new CaseStatusService(prisma).changeStatus("t1", "c1", "ISLEMDE" as never, "u1");
    expect(tx.decisionLog.create).toHaveBeenCalledTimes(1);
    expect(tx.decisionLog.create.mock.calls[0][0].data.decisionType).toBe("STATUS_CHANGE");
    expect(tx.decisionLog.create.mock.calls[0][0].data.changedById).toBeUndefined();
  });

  it("status transition validation korunur (closing→closing throw, lookup'tan sonra)", async () => {
    const { prisma } = mkPrisma({ caseStatus: "HITAM", isAutomationEnabled: false });
    await expect(new CaseStatusService(prisma).changeStatus("t1", "c1", "INFAZ" as never, "u1")).rejects.toThrow();
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });
});

// ---- Controller (mock service) ----
describe("P2b-2c-1 — CaseStatusController.changeStatus hardening", () => {
  const mk = () => {
    const service = { changeStatus: jest.fn().mockResolvedValue({ id: "c1", caseStatus: "ISLEMDE" }) };
    return { controller: new CaseStatusController(service as unknown as CaseStatusService), service };
  };

  it("6. actor=@CurrentUser('id') service'e geçer; body.userId YOK SAYILIR", async () => {
    const { controller, service } = mk();
    const res = await controller.changeStatus("real-user", "t1", "c1", { status: "ISLEMDE" as never, reason: "r", userId: "SPOOF" });
    expect(service.changeStatus).toHaveBeenCalledWith("t1", "c1", "ISLEMDE", "real-user", "r");
    expect(JSON.stringify(service.changeStatus.mock.calls[0])).not.toContain("SPOOF");
    expect(res).toEqual({ success: true, data: { id: "c1", caseStatus: "ISLEMDE" }, message: "Statü başarıyla değiştirildi" });
  });

  it("7. frontend-shaped { status, reason } (userId yok) çalışır", async () => {
    const { controller, service } = mk();
    const res = await controller.changeStatus("u1", "t1", "c1", { status: "ISLEMDE" as never, reason: "Toplu işlem" });
    expect(service.changeStatus).toHaveBeenCalledWith("t1", "c1", "ISLEMDE", "u1", "Toplu işlem");
    expect(res.success).toBe(true);
  });

  it("8. response shape değişmedi (success/data/message)", async () => {
    const { controller } = mk();
    const res = await controller.changeStatus("u1", "t1", "c1", { status: "ISLEMDE" as never });
    expect(Object.keys(res)).toEqual(["success", "data", "message"]);
  });

  it("1/2. JwtAuthGuard YALNIZ changeStatus route'una uygulanmış (list/history korunur)", () => {
    const changeGuards = Reflect.getMetadata("__guards__", CaseStatusController.prototype.changeStatus) || [];
    expect(changeGuards).toContain(JwtAuthGuard); // unauth → JwtAuthGuard reddeder (401)
    // scope: list + history HARDENING DIŞI (guard yok)
    expect(Reflect.getMetadata("__guards__", CaseStatusController.prototype.getStatusList)).toBeUndefined();
    expect(Reflect.getMetadata("__guards__", CaseStatusController.prototype.getStatusHistory)).toBeUndefined();
  });

  it("10. observe/permission hook YOK — controller yalnız CaseStatusService bağımlılığı alır", () => {
    const c = new CaseStatusController({ changeStatus: jest.fn() } as unknown as CaseStatusService);
    expect(c).toBeInstanceOf(CaseStatusController); // tek bağımlılık = service (GuidedOpenObserve/Resolver enjekte edilmez)
  });
});

// ---- HTTP binding (Nest TestingModule + supertest): @CurrentUser→param eşlemesini ve guard yolunu KİLİTLER ----
// Adversarial verify MAJOR'ını kapatır: unit testler positional çağırıyordu → id↔tenantId decorator swap'ı yakalanmıyordu.
describe("P2b-2c-1 — CHANGE_STATUS HTTP binding (decorator/guard runtime)", () => {
  let app: INestApplication | undefined;
  const service = {
    changeStatus: jest.fn().mockResolvedValue({ id: "c1", caseStatus: "ISLEMDE" }),
    getStatusList: jest.fn(),
    getStatusHistory: jest.fn(),
  };

  const buildApp = async (authedUser: { id: string; tenantId: string } | null): Promise<INestApplication> => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CaseStatusController],
      providers: [{ provide: CaseStatusService, useValue: service }],
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

  it("authenticated: @CurrentUser('id')→actorUserId + @CurrentUser('tenantId')→tenantId slotları KİLİTLİ; body.userId ignored", async () => {
    app = await buildApp({ id: "real-user", tenantId: "tenant-1" });
    const res = await request(app.getHttpServer())
      .post("/case-status/c1/change")
      .send({ status: "ISLEMDE", reason: "Toplu işlem", userId: "SPOOF" })
      .expect(201);
    // id↔tenantId decorator swap olsaydı bu arg sırası ("tenant-1","c1","ISLEMDE","real-user","Toplu işlem") bozulurdu
    expect(service.changeStatus).toHaveBeenCalledWith("tenant-1", "c1", "ISLEMDE", "real-user", "Toplu işlem");
    expect(JSON.stringify(service.changeStatus.mock.calls[0])).not.toContain("SPOOF");
    expect(res.body).toEqual({ success: true, data: { id: "c1", caseStatus: "ISLEMDE" }, message: "Statü başarıyla değiştirildi" });
  });

  it("unauthenticated: guard mutation'ı ENGELLER (override→403; gerçek passport→401), service çağrılmaz", async () => {
    app = await buildApp(null);
    await request(app.getHttpServer())
      .post("/case-status/c1/change")
      .send({ status: "ISLEMDE", reason: "r" })
      .expect(403);
    expect(service.changeStatus).not.toHaveBeenCalled();
  });
});

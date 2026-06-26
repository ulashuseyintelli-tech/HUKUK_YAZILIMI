/** @jest-environment node */
import "reflect-metadata";
import { NotFoundException, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { CaseStatusService } from "../case-status.service";
import { CaseStatusController } from "../case-status.controller";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { GuidedOpenObserveService } from "../../permission-diagnostics/guided-open-observe.service";
import { ActionCode } from "../../policy-engine/types/action-code.enum";

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
    const observe = { observe: jest.fn().mockResolvedValue(undefined) };
    const controller = new CaseStatusController(
      service as unknown as CaseStatusService,
      observe as unknown as GuidedOpenObserveService,
    );
    return { controller, service, observe };
  };

  const prevMode = process.env.GUIDED_OPEN_AUTHZ_MODE;
  afterEach(() => {
    if (prevMode === undefined) delete process.env.GUIDED_OPEN_AUTHZ_MODE;
    else process.env.GUIDED_OPEN_AUTHZ_MODE = prevMode;
    jest.clearAllMocks();
  });

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

  it("P2b-2c-2 (observe 1/2/4/5/6/7): CHANGE_STATUS observe PRE-action (actionCode/actor/tenant/caseId); body observe'a SIZMAZ", async () => {
    const { controller, service, observe } = mk();
    await controller.changeStatus("real-user", "tenant-1", "c1", { status: "ISLEMDE" as never, reason: "gizli-reason", userId: "SPOOF" });
    expect(observe.observe).toHaveBeenCalledTimes(1);
    const [input, opts] = observe.observe.mock.calls[0];
    expect(input).toEqual({ actorUserId: "real-user", tenantId: "tenant-1", caseId: "c1", actionCode: ActionCode.CHANGE_STATUS });
    expect(opts).toBeUndefined();
    const ic = JSON.stringify(input);
    expect(ic).not.toContain("SPOOF"); // body.userId observe'a geçmez
    expect(ic).not.toContain("ISLEMDE"); // status observe'a geçmez
    expect(ic).not.toContain("gizli-reason"); // reason observe'a geçmez
    expect(service.changeStatus).toHaveBeenCalledTimes(1); // mutation yine yapıldı
  });

  it("P2b-2c-2 (observe 8): observe FAILURE status mutation'ı ENGELLEMEZ (gerçek observe servisi best-effort)", async () => {
    process.env.GUIDED_OPEN_AUTHZ_MODE = "observe"; // afterEach geri yükler
    const service = { changeStatus: jest.fn().mockResolvedValue({ id: "c1", caseStatus: "ISLEMDE" }) };
    const realObserve = new GuidedOpenObserveService(
      { resolve: jest.fn().mockRejectedValue(new Error("resolver boom")) } as never,
      { log: jest.fn().mockRejectedValue(new Error("audit boom")) } as never,
    );
    const controller = new CaseStatusController(service as unknown as CaseStatusService, realObserve);
    const res = await controller.changeStatus("u1", "t1", "c1", { status: "ISLEMDE" as never, reason: "r" });
    expect(service.changeStatus).toHaveBeenCalledTimes(1); // observe hata verse de mutation engellenmedi
    expect(res.success).toBe(true);
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
  const observe = { observe: jest.fn().mockResolvedValue(undefined) };

  const buildApp = async (authedUser: { id: string; tenantId: string } | null): Promise<INestApplication> => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CaseStatusController],
      providers: [
        { provide: CaseStatusService, useValue: service },
        { provide: GuidedOpenObserveService, useValue: observe },
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

  it("authenticated: @CurrentUser('id')→actorUserId + @CurrentUser('tenantId')→tenantId slotları KİLİTLİ; body.userId ignored", async () => {
    app = await buildApp({ id: "real-user", tenantId: "tenant-1" });
    const res = await request(app.getHttpServer())
      .post("/case-status/c1/change")
      .send({ status: "ISLEMDE", reason: "Toplu işlem", userId: "SPOOF" })
      .expect(201);
    // id↔tenantId decorator swap olsaydı bu arg sırası ("tenant-1","c1","ISLEMDE","real-user","Toplu işlem") bozulurdu
    expect(service.changeStatus).toHaveBeenCalledWith("tenant-1", "c1", "ISLEMDE", "real-user", "Toplu işlem");
    expect(JSON.stringify(service.changeStatus.mock.calls[0])).not.toContain("SPOOF");
    // P2b-2c-2: observe HTTP yolunda truthful actor/tenant/caseId + CHANGE_STATUS ile çağrıldı (decorator binding kanıtı)
    expect(observe.observe).toHaveBeenCalledWith({ actorUserId: "real-user", tenantId: "tenant-1", caseId: "c1", actionCode: ActionCode.CHANGE_STATUS });
    expect(res.body).toEqual({ success: true, data: { id: "c1", caseStatus: "ISLEMDE" }, message: "Statü başarıyla değiştirildi" });
  });

  it("unauthenticated: guard mutation'ı ENGELLER (override→403; gerçek passport→401), service çağrılmaz", async () => {
    app = await buildApp(null);
    await request(app.getHttpServer())
      .post("/case-status/c1/change")
      .send({ status: "ISLEMDE", reason: "r" })
      .expect(403);
    expect(service.changeStatus).not.toHaveBeenCalled();
    expect(observe.observe).not.toHaveBeenCalled(); // guard handler'dan ÖNCE engeller → observe de çağrılmaz
  });
});

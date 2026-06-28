/** @jest-environment node */
import "reflect-metadata";
import { NotFoundException, BadRequestException, INestApplication } from "@nestjs/common";
import { Test } from "@nestjs/testing";
import * as request from "supertest";
import { CaseStatusService } from "../case-status.service";
import { CaseStatusController } from "../case-status.controller";
import { JwtAuthGuard } from "../../auth/guards/jwt-auth.guard";
import { GuidedOpenObserveService } from "../../permission-diagnostics/guided-open-observe.service";
import { GuidedEdgeGateService } from "../../permission-diagnostics/guided-edge/guided-edge-gate.service";
import { OfficeApprovalShadowService } from "../../office-approval/office-approval-shadow.service";
import { ActionCode } from "../../policy-engine/types/action-code.enum";

// P3-2C: gate mock — VARSAYILAN OFF davranışı (her zaman PROCEED → mevcut hardening testleri AYNEN geçer).
const mkGateProceed = () => ({ evaluate: jest.fn().mockResolvedValue({ kind: "PROCEED" }) });
// P4-2: shadow mock — VARSAYILAN OFF (no-op → davranış/akış değişmez; mevcut testler AYNEN geçer).
const mkShadowOff = () => ({ evaluate: jest.fn().mockResolvedValue({ flagMode: "off", evaluated: false }) });

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

  it("P3-2B-1: kapanış→kapanış artık YASAK DEĞİL (HITAM→INFAZ başarılı; transaction + history yazılır)", async () => {
    const { tx, prisma } = mkPrisma({ caseStatus: "HITAM", isAutomationEnabled: false });
    await expect(
      new CaseStatusService(prisma).changeStatus("t1", "c1", "INFAZ" as never, "u1", "yeniden sınıflandırma"),
    ).resolves.toBeDefined();
    expect((prisma as any).$transaction).toHaveBeenCalledTimes(1);
    expect(tx.caseStatusHistory.create).toHaveBeenCalledTimes(1);
    expect(tx.caseStatusHistory.create.mock.calls[0][0].data.fromStatus).toBe("HITAM");
    expect(tx.caseStatusHistory.create.mock.calls[0][0].data.toStatus).toBe("INFAZ");
  });
});

describe("P3-2B-1 — CaseStatusService canonical safety patch", () => {
  it("geçersiz statü değeri → BadRequestException (400); lookup ve transaction YOK", async () => {
    const { prisma } = mkPrisma({ caseStatus: "DERDEST", isAutomationEnabled: true });
    await expect(
      new CaseStatusService(prisma).changeStatus("t1", "c1", "NOPE" as never, "u1"),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect((prisma as any).case.findFirst).not.toHaveBeenCalled();
    expect((prisma as any).$transaction).not.toHaveBeenCalled();
  });

  it("automation: kapanış statüsüne geçiş otomasyonu KAPATIR + nextActionAt=null", async () => {
    const { tx, prisma } = mkPrisma({ caseStatus: "DERDEST", isAutomationEnabled: true });
    await new CaseStatusService(prisma).changeStatus("t1", "c1", "HITAM" as never, "u1");
    const data = tx.case.update.mock.calls[0][0].data;
    expect(data.isAutomationEnabled).toBe(false);
    expect(data.nextActionAt).toBeNull();
  });

  it("automation: aktif statüye geçiş manuel KAPALI otomasyonu AÇMAZ (manuel tercih korunur)", async () => {
    const { tx, prisma } = mkPrisma({ caseStatus: "HITAM", isAutomationEnabled: false });
    await new CaseStatusService(prisma).changeStatus("t1", "c1", "DERDEST" as never, "u1");
    expect(tx.case.update.mock.calls[0][0].data.isAutomationEnabled).toBe(false);
  });

  it("automation: aktif statüde zaten AÇIK otomasyon AÇIK kalır", async () => {
    const { tx, prisma } = mkPrisma({ caseStatus: "DERDEST", isAutomationEnabled: true });
    await new CaseStatusService(prisma).changeStatus("t1", "c1", "ISLEMDE" as never, "u1");
    expect(tx.case.update.mock.calls[0][0].data.isAutomationEnabled).toBe(true);
  });
});

// ---- Controller (mock service) ----
describe("P2b-2c-1 — CaseStatusController.changeStatus hardening", () => {
  const mk = () => {
    const service = { changeStatus: jest.fn().mockResolvedValue({ id: "c1", caseStatus: "ISLEMDE" }) };
    const observe = { observe: jest.fn().mockResolvedValue(undefined) };
    const gate = mkGateProceed();
    const shadow = mkShadowOff();
    const controller = new CaseStatusController(
      service as unknown as CaseStatusService,
      observe as unknown as GuidedOpenObserveService,
      gate as unknown as GuidedEdgeGateService,
      shadow as unknown as OfficeApprovalShadowService,
    );
    return { controller, service, observe, gate, shadow };
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
    expect((res as { success: boolean }).success).toBe(true); // P3-2C: dönüş artık union (envelope|normal); PROCEED → normal
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
    const controller = new CaseStatusController(service as unknown as CaseStatusService, realObserve, mkGateProceed() as unknown as GuidedEdgeGateService, mkShadowOff() as unknown as OfficeApprovalShadowService);
    const res = await controller.changeStatus("u1", "t1", "c1", { status: "ISLEMDE" as never, reason: "r" });
    expect(service.changeStatus).toHaveBeenCalledTimes(1); // observe hata verse de mutation engellenmedi
    expect((res as { success: boolean }).success).toBe(true); // P3-2C: union dönüş; PROCEED → normal
  });
});

// ---- P3-2C: controller↔gate entegrasyonu (gate'in İÇİ guided-edge-gate.service.spec.ts'te; burada SADECE kontrolcü davranışı) ----
describe("P3-2C — CaseStatusController ↔ guarded-edge gate entegrasyonu", () => {
  const mkG = (gate: { evaluate: jest.Mock }) => {
    const service = { changeStatus: jest.fn().mockResolvedValue({ id: "c1", caseStatus: "ISLEMDE" }) };
    const observe = { observe: jest.fn().mockResolvedValue(undefined) };
    const controller = new CaseStatusController(
      service as unknown as CaseStatusService,
      observe as unknown as GuidedOpenObserveService,
      gate as unknown as GuidedEdgeGateService,
      mkShadowOff() as unknown as OfficeApprovalShadowService,
    );
    return { controller, service, observe, gate };
  };
  afterEach(() => jest.clearAllMocks());

  it("gate PROCEED (default OFF) → service.changeStatus ÇAĞRILIR, normal {success,data,message} döner", async () => {
    const gate = { evaluate: jest.fn().mockResolvedValue({ kind: "PROCEED" }) };
    const { controller, service } = mkG(gate);
    const res = await controller.changeStatus("u1", "t1", "c1", { status: "ISLEMDE" as never, reason: "r" });
    expect(service.changeStatus).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true, data: { id: "c1", caseStatus: "ISLEMDE" }, message: "Statü başarıyla değiştirildi" });
  });

  it("gate ENVELOPE (flag açık + CONFIRM_REQUIRED) → service.changeStatus ÇAĞRILMAZ, envelope AYNEN döner (statü değişmez)", async () => {
    const envelope = {
      axis: "GUIDED_OPEN_PERMISSION",
      outcome: "CONFIRM_REQUIRED",
      actionCode: ActionCode.CHANGE_STATUS,
      target: { resourceType: "LegalCase", caseId: "c1" },
      message: "Bu statü değişikliği için onay gerekiyor.",
      confirmation: { token: "go.confirm.v1.X.Y", expiresAt: "2030-01-01T00:00:00.000Z", bindingHash: "bh" },
    };
    const gate = { evaluate: jest.fn().mockResolvedValue({ kind: "ENVELOPE", envelope }) };
    const { controller, service } = mkG(gate);
    const res = await controller.changeStatus("u1", "t1", "c1", { status: "HITAM" as never, reason: "r" });
    expect(service.changeStatus).not.toHaveBeenCalled(); // statü DEĞİŞMEDİ
    expect(res).toBe(envelope); // structured-200 envelope aynen
  });

  it("gate'e payload {status, reason} + caseId + surface + confirmationToken geçer; observe'den SONRA çağrılır", async () => {
    const gate = { evaluate: jest.fn().mockResolvedValue({ kind: "PROCEED" }) };
    const { controller, observe } = mkG(gate);
    await controller.changeStatus("real-user", "tenant-1", "c1", { status: "ISLEMDE" as never, reason: "gerekçe", confirmationToken: "tok-123" });
    expect(observe.observe).toHaveBeenCalledTimes(1);
    expect(gate.evaluate).toHaveBeenCalledTimes(1);
    const arg = gate.evaluate.mock.calls[0][0];
    expect(arg).toMatchObject({
      actorUserId: "real-user",
      tenantId: "tenant-1",
      caseId: "c1",
      actionCode: ActionCode.CHANGE_STATUS,
      surface: "POST /case-status/:caseId/change",
      payload: { status: "ISLEMDE", reason: "gerekçe" },
      confirmationToken: "tok-123",
    });
  });

  it("reason yoksa gate payload.reason=null (issue↔consume hash deterministik)", async () => {
    const gate = { evaluate: jest.fn().mockResolvedValue({ kind: "PROCEED" }) };
    const { controller } = mkG(gate);
    await controller.changeStatus("u1", "t1", "c1", { status: "ISLEMDE" as never });
    expect(gate.evaluate.mock.calls[0][0].payload).toEqual({ status: "ISLEMDE", reason: null });
  });
});

// ---- P4-2: controller↔OfficeApproval shadow (observe-only; effectiveDecision DEĞİŞMEZ) ----
describe("P4-2 — CaseStatusController ↔ OfficeApproval shadow", () => {
  const mkP4 = () => {
    const service = { changeStatus: jest.fn().mockResolvedValue({ id: "c1", caseStatus: "ISLEMDE" }) };
    const observe = { observe: jest.fn().mockResolvedValue(undefined) };
    const gate = { evaluate: jest.fn().mockResolvedValue({ kind: "PROCEED" }) };
    // shadow WOULD_REQUIRE_APPROVAL döner (en sert gölge karar) — yine de akış DEĞİŞMEMELİ
    const shadow = { evaluate: jest.fn().mockResolvedValue({ flagMode: "observe", evaluated: true, decision: "WOULD_REQUIRE_APPROVAL" }) };
    const controller = new CaseStatusController(
      service as unknown as CaseStatusService,
      observe as unknown as GuidedOpenObserveService,
      gate as unknown as GuidedEdgeGateService,
      shadow as unknown as OfficeApprovalShadowService,
    );
    return { controller, service, observe, gate, shadow };
  };
  afterEach(() => jest.clearAllMocks());

  it("shadow.evaluate çağrılır (actor/tenant/CHANGE_STATUS/LegalCase/caseId/payload); effectiveDecision DEĞİŞMEZ", async () => {
    const { controller, shadow, service } = mkP4();
    const res = await controller.changeStatus("real-user", "t1", "c1", { status: "ISLEMDE" as never, reason: "gerekçe" });
    expect(shadow.evaluate).toHaveBeenCalledTimes(1);
    expect(shadow.evaluate.mock.calls[0][0]).toMatchObject({
      actorUserId: "real-user", tenantId: "t1", actionCode: ActionCode.CHANGE_STATUS,
      targetType: "LegalCase", targetRef: "c1", payload: { status: "ISLEMDE", reason: "gerekçe" },
    });
    // KESİN: shadow WOULD_REQUIRE_APPROVAL dese de statü yine değişir, normal response döner (davranış değişmedi)
    expect(service.changeStatus).toHaveBeenCalledTimes(1);
    expect(res).toEqual({ success: true, data: { id: "c1", caseStatus: "ISLEMDE" }, message: "Statü başarıyla değiştirildi" });
  });

  it("shadow throw etse bile (best-effort) controller akışı kırılmaz — service.changeStatus yine çağrılır", async () => {
    const { controller, service } = mkP4();
    // controller shadow.evaluate'i await ediyor; servis best-effort olduğu için throw etmez, ama yine de güvence:
    expect(service.changeStatus).toHaveBeenCalledTimes(0);
    await controller.changeStatus("u1", "t1", "c1", { status: "ISLEMDE" as never });
    expect(service.changeStatus).toHaveBeenCalledTimes(1);
  });
});

// ---- P4-3: controller↔OfficeApproval ENFORCE (non-PARTNER → APPROVAL_REQUIRED; statü DEĞİŞMEZ, P3 confirm'e gidilmez) ----
describe("P4-3 — CaseStatusController ↔ OfficeApproval enforce", () => {
  const mkP43 = (shadowResult: unknown) => {
    const service = { changeStatus: jest.fn().mockResolvedValue({ id: "c1", caseStatus: "ISLEMDE" }) };
    const observe = { observe: jest.fn().mockResolvedValue(undefined) };
    const gate = { evaluate: jest.fn().mockResolvedValue({ kind: "PROCEED" }) };
    const shadow = { evaluate: jest.fn().mockResolvedValue(shadowResult) };
    const controller = new CaseStatusController(
      service as unknown as CaseStatusService,
      observe as unknown as GuidedOpenObserveService,
      gate as unknown as GuidedEdgeGateService,
      shadow as unknown as OfficeApprovalShadowService,
    );
    return { controller, service, observe, gate, shadow };
  };
  afterEach(() => jest.clearAllMocks());

  const approvalEnvelope = {
    axis: "GUIDED_OPEN_PERMISSION",
    outcome: "APPROVAL_REQUIRED",
    actionCode: ActionCode.CHANGE_STATUS,
    target: { resourceType: "LegalCase", caseId: "c1" },
    reasonCode: "NON_AUTHORITY_LAWYER",
    message: "Bu statü değişikliği için yetkili onayı gerekiyor; talep onaya gönderildi.",
    approval: { requestId: "req-9", status: "PENDING_APPROVAL" },
  };

  it("enforce + non-PARTNER (shadow envelope döner) → controller envelope AYNEN döner; changeStatus ÇAĞRILMAZ + gate'e GİDİLMEZ (statü DEĞİŞMEZ)", async () => {
    const { controller, service, gate } = mkP43({ flagMode: "enforce", evaluated: true, decision: "WOULD_REQUIRE_APPROVAL", requestId: "req-9", envelope: approvalEnvelope });
    const res = await controller.changeStatus("u1", "t1", "c1", { status: "ACIZ" as never, reason: "r" });
    expect(res).toBe(approvalEnvelope); // typed APPROVAL_REQUIRED; statü DEĞİŞMEDİ, onay talebi oluştu
    expect(service.changeStatus).not.toHaveBeenCalled(); // official mutation YOK
    expect(gate.evaluate).not.toHaveBeenCalled(); // P3 confirm'e GİDİLMEZ (shadow envelope'tan önce dönülür)
  });

  it("enforce + PARTNER (ALLOW, envelope YOK) → mevcut akış sürer: gate çağrılır + changeStatus çağrılır", async () => {
    const { controller, service, gate } = mkP43({ flagMode: "enforce", evaluated: true, decision: "ALLOW", reasonCode: "PARTNER_SELF_AUTHORITY" });
    const res = await controller.changeStatus("u1", "t1", "c1", { status: "ISLEMDE" as never });
    expect(gate.evaluate).toHaveBeenCalledTimes(1); // envelope yok → düşülür → gate (mevcut akış)
    expect(service.changeStatus).toHaveBeenCalledTimes(1); // PARTNER: mevcut CHANGE_STATUS çalışır
    expect((res as { success: boolean }).success).toBe(true);
  });

  it("off/observe (envelope YOK) → controller davranışı AYNEN (changeStatus çağrılır)", async () => {
    for (const sr of [{ flagMode: "off", evaluated: false }, { flagMode: "observe", evaluated: true, decision: "WOULD_REQUIRE_APPROVAL" }]) {
      const { controller, service } = mkP43(sr);
      await controller.changeStatus("u1", "t1", "c1", { status: "ISLEMDE" as never });
      expect(service.changeStatus).toHaveBeenCalledTimes(1);
    }
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
  const gate = { evaluate: jest.fn().mockResolvedValue({ kind: "PROCEED" }) }; // P3-2C: default OFF → PROCEED
  const shadow = { evaluate: jest.fn().mockResolvedValue({ flagMode: "off", evaluated: false }) }; // P4-2: default OFF → no-op

  const buildApp = async (authedUser: { id: string; tenantId: string } | null): Promise<INestApplication> => {
    const moduleRef = await Test.createTestingModule({
      controllers: [CaseStatusController],
      providers: [
        { provide: CaseStatusService, useValue: service },
        { provide: GuidedOpenObserveService, useValue: observe },
        { provide: GuidedEdgeGateService, useValue: gate },
        { provide: OfficeApprovalShadowService, useValue: shadow },
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

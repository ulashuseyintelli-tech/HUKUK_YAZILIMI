/**
 * Task 2 - ClientController govde dogrulamasi (GUVENLI/KADEMELI).
 * Lenient ValidationPipe MANUEL invoke edilir (global forbidNonWhitelisted:true override edilemedigi icin
 * @Body() any + manuel pipe deseni): tip/format dogrular, FAZLA alan 400 DEGIL (whitelist ile duser),
 * TCKN/VKN yalniz rakam+uzunluk (mod-10/11 checksum YOK - ayri audit task). findOne 404 (Task 1) korunur.
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ClientController } from "../client.controller";

function build() {
  const service = {
    create: jest.fn(async (_t: string, d: any) => ({ id: "c1", ...d })),
    update: jest.fn(async (_id: string, _t: string, d: any) => ({ id: "c1", ...d })),
    findOne: jest.fn(async () => ({ id: "c1" })),
  } as any;
  const intakeLinkService = {
    createForClientWorkspace: jest.fn(async () => ({ link: { id: "lnk-1" }, rawToken: "raw-token", intakeUrl: "https://form.example.com/intake/raw-token" })),
    createAndDeliverForClientWorkspace: jest.fn(async () => ({ link: { id: "lnk-deliver" }, delivery: { id: "delivery-1", status: "sent" } })),
  } as any;
  const ctrl = new ClientController(service, intakeLinkService);
  const req = { user: { id: "u1", tenantId: "t1" } } as any;
  return { ctrl, service, intakeLinkService, req };
}

describe("ClientController - Task 2 lenient validation", () => {
  it("gecerli govde -> service.create (tenant + dto + actor)", async () => {
    const { ctrl, service, req } = build();
    await ctrl.create(req, { type: "PERSON", firstName: "Ali", lastName: "Veli", tckn: "11111111111" });
    expect(service.create).toHaveBeenCalledTimes(1);
    const [tenantArg, dtoArg, actorArg] = service.create.mock.calls[0];
    expect(tenantArg).toBe("t1");
    expect(dtoArg.firstName).toBe("Ali");
    expect(actorArg).toEqual({ userId: "u1" });
  });

  it("fazla alan 400 DEGIL -> whitelist dusurur; body.userId asla gecmez", async () => {
    const { ctrl, service, req } = build();
    await ctrl.create(req, { type: "PERSON", firstName: "Ali", evilField: "x", userId: "HACKER" } as any);
    expect(service.create).toHaveBeenCalledTimes(1);
    const dtoArg = service.create.mock.calls[0][1];
    expect(dtoArg.evilField).toBeUndefined();
    expect(dtoArg.userId).toBeUndefined();
    expect(dtoArg.firstName).toBe("Ali");
  });

  it("gecersiz TCKN (kisa) -> BadRequestException; service cagrilmaz", async () => {
    const { ctrl, service, req } = build();
    await expect(ctrl.create(req, { type: "PERSON", tckn: "123" } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("gecersiz VKN (harf icerir) -> BadRequestException", async () => {
    const { ctrl, req } = build();
    await expect(ctrl.create(req, { type: "COMPANY", vkn: "12345abcde" } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("gecersiz e-posta -> BadRequestException", async () => {
    const { ctrl, req } = build();
    await expect(ctrl.create(req, { type: "PERSON", email: "not-an-email" } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("bos tckn '' -> gecer (no-tckn, ValidateIf)", async () => {
    const { ctrl, service, req } = build();
    await ctrl.create(req, { type: "PERSON", firstName: "Ali", tckn: "" } as any);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it("update: UpdateClientDto isActive kabul + fazla alan duser", async () => {
    const { ctrl, service, req } = build();
    await ctrl.update(req, "c1", { type: "PERSON", isActive: false, extra: "y" } as any);
    expect(service.update).toHaveBeenCalledTimes(1);
    const dtoArg = service.update.mock.calls[0][2];
    expect(dtoArg.isActive).toBe(false);
    expect(dtoArg.extra).toBeUndefined();
  });

  it("createIntakeLink: path client/case kullanir ve body clientId tasimaz", async () => {
    const { ctrl, intakeLinkService, req } = build();

    const res = await ctrl.createIntakeLink(req, "client-1", "case-1", { scope: ["ADDRESS"] } as any);

    expect(intakeLinkService.createForClientWorkspace).toHaveBeenCalledWith(
      "t1",
      "client-1",
      "case-1",
      "u1",
      expect.objectContaining({ scope: ["ADDRESS"] }),
    );
    expect(res).toEqual({ data: { link: { id: "lnk-1" }, rawToken: "raw-token", intakeUrl: "https://form.example.com/intake/raw-token" } });
  });

  it("createIntakeLink: body clientId gelirse reddeder", async () => {
    const { ctrl, intakeLinkService, req } = build();

    await expect(ctrl.createIntakeLink(req, "client-1", "case-1", { clientId: "evil", scope: ["ADDRESS"] } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(intakeLinkService.createForClientWorkspace).not.toHaveBeenCalled();
  });

  it("createAndDeliverIntakeLink: path client/case ve Idempotency-Key header service'e tasinir", async () => {
    const { ctrl, intakeLinkService, req } = build();

    const res = await ctrl.createAndDeliverIntakeLink(req, "client-1", "case-1", "idem-1", { scope: ["ADDRESS"] } as any);

    expect(intakeLinkService.createAndDeliverForClientWorkspace).toHaveBeenCalledWith(
      "t1",
      "client-1",
      "case-1",
      "u1",
      "idem-1",
      expect.objectContaining({ scope: ["ADDRESS"] }),
    );
    expect(res).toEqual({ data: { link: { id: "lnk-deliver" }, delivery: { id: "delivery-1", status: "sent" } } });
  });

  it("createAndDeliverIntakeLink: body clientId gelirse reddeder", async () => {
    const { ctrl, intakeLinkService, req } = build();

    await expect(
      ctrl.createAndDeliverIntakeLink(req, "client-1", "case-1", "idem-1", { clientId: "evil", scope: ["ADDRESS"] } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(intakeLinkService.createAndDeliverForClientWorkspace).not.toHaveBeenCalled();
  });

  it("findOne not-found -> NotFoundException (Task 1 korunur)", async () => {
    const { ctrl, service, req } = build();
    service.findOne.mockResolvedValueOnce(null);
    await expect(ctrl.findOne(req, "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});
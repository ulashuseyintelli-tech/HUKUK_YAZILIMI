/**
 * Task 2 — ClientController gövde doğrulaması (GÜVENLİ/KADEMELİ).
 * Lenient ValidationPipe MANUEL invoke edilir (global forbidNonWhitelisted:true override edilemediği için
 * @Body() any + manuel pipe deseni): tip/format doğrular, FAZLA alan 400 DEĞİL (whitelist ile düşer),
 * TCKN/VKN yalnız rakam+uzunluk (mod-10/11 checksum YOK — ayrı audit task). findOne 404 (Task 1) korunur.
 */
import { BadRequestException, NotFoundException } from "@nestjs/common";
import { ClientController } from "../client.controller";

function build() {
  const service = {
    create: jest.fn(async (_t: string, d: any) => ({ id: "c1", ...d })),
    update: jest.fn(async (_id: string, _t: string, d: any) => ({ id: "c1", ...d })),
    findOne: jest.fn(async () => ({ id: "c1" })),
  } as any;
  const ctrl = new ClientController(service);
  const req = { user: { id: "u1", tenantId: "t1" } } as any;
  return { ctrl, service, req };
}

describe("ClientController — Task 2 lenient validation", () => {
  it("geçerli gövde → service.create (tenant + dto + actor)", async () => {
    const { ctrl, service, req } = build();
    await ctrl.create(req, { type: "PERSON", firstName: "Ali", lastName: "Veli", tckn: "11111111111" });
    expect(service.create).toHaveBeenCalledTimes(1);
    const [tenantArg, dtoArg, actorArg] = service.create.mock.calls[0];
    expect(tenantArg).toBe("t1");
    expect(dtoArg.firstName).toBe("Ali");
    expect(actorArg).toEqual({ userId: "u1" });
  });

  it("fazla alan 400 DEĞİL → whitelist düşürür; body.userId asla geçmez", async () => {
    const { ctrl, service, req } = build();
    await ctrl.create(req, { type: "PERSON", firstName: "Ali", evilField: "x", userId: "HACKER" } as any);
    expect(service.create).toHaveBeenCalledTimes(1);
    const dtoArg = service.create.mock.calls[0][1];
    expect(dtoArg.evilField).toBeUndefined();
    expect(dtoArg.userId).toBeUndefined();
    expect(dtoArg.firstName).toBe("Ali");
  });

  it("geçersiz TCKN (kısa) → BadRequestException; service çağrılmaz", async () => {
    const { ctrl, service, req } = build();
    await expect(ctrl.create(req, { type: "PERSON", tckn: "123" } as any)).rejects.toBeInstanceOf(BadRequestException);
    expect(service.create).not.toHaveBeenCalled();
  });

  it("geçersiz VKN (harf içerir) → BadRequestException", async () => {
    const { ctrl, req } = build();
    await expect(ctrl.create(req, { type: "COMPANY", vkn: "12345abcde" } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("geçersiz e-posta → BadRequestException", async () => {
    const { ctrl, req } = build();
    await expect(ctrl.create(req, { type: "PERSON", email: "not-an-email" } as any)).rejects.toBeInstanceOf(BadRequestException);
  });

  it("boş tckn '' → geçer (no-tckn, ValidateIf)", async () => {
    const { ctrl, service, req } = build();
    await ctrl.create(req, { type: "PERSON", firstName: "Ali", tckn: "" } as any);
    expect(service.create).toHaveBeenCalledTimes(1);
  });

  it("update: UpdateClientDto isActive kabul + fazla alan düşer", async () => {
    const { ctrl, service, req } = build();
    await ctrl.update(req, "c1", { type: "PERSON", isActive: false, extra: "y" } as any);
    expect(service.update).toHaveBeenCalledTimes(1);
    const dtoArg = service.update.mock.calls[0][2];
    expect(dtoArg.isActive).toBe(false);
    expect(dtoArg.extra).toBeUndefined();
  });

  it("findOne not-found → NotFoundException (Task 1 korunur)", async () => {
    const { ctrl, service, req } = build();
    service.findOne.mockResolvedValueOnce(null);
    await expect(ctrl.findOne(req, "missing")).rejects.toBeInstanceOf(NotFoundException);
  });
});

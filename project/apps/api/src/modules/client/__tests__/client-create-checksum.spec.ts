/**
 * Task A / Faz 1 — ClientService.create() TCKN/VKN mod-10/11 checksum (DOMAIN katmanı).
 *
 * Kural domain/service katmanında (controller'da DEĞİL) → TÜM create yolları tutarlı kapsanır
 * (settings modal · cases/new · Excel import · seed · gelecekteki REST v2 / job / queue).
 * Doğrulama YALNIZ GERÇEKTEN YENİ kayıt için: dedup/reactivate (legacy, geçersiz-checksum dahil)
 * ETKİLENMEZ — eski veri kilitlenmez. update() DOKUNULMAZ (Faz 4'e ertelendi; bunu
 * client-update-duplicate-guard.spec geçersiz-checksum tckn ile update geçerek kanıtlar).
 */
import { BadRequestException } from "@nestjs/common";
import { ClientService } from "../client.service";

const buildTx = () => ({
  client: { update: jest.fn().mockResolvedValue({}), create: jest.fn().mockResolvedValue({ id: "new" }) },
  clientContact: { createMany: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
});

// existing: dedup findFirst (OR query) sonucu; null → "yeni kayıt" yolu (checksum'a gelinir).
const buildPrisma = (existing: any, tx: any) => ({
  client: {
    findFirst: jest.fn().mockImplementation(({ where }: any) =>
      where.id ? Promise.resolve({ id: where.id, isActive: true }) : Promise.resolve(existing),
    ),
    update: jest.fn().mockResolvedValue({}),
    create: jest.fn(),
  },
  task: { findUnique: jest.fn().mockResolvedValue(null), update: jest.fn(), create: jest.fn() },
  $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
});

const buildAudit = () => ({ logInTransaction: jest.fn().mockResolvedValue(undefined) });

function svcFor(existing: any) {
  const tx = buildTx();
  const prisma = buildPrisma(existing, tx) as any;
  const svc = new ClientService(prisma, buildAudit() as any);
  return { svc, tx, prisma };
}

describe("ClientService.create — TCKN/VKN checksum (Task A/Faz 1)", () => {
  it("YENİ kayıt: geçersiz-checksum TCKN (11 hane) → BadRequestException; insert YOK", async () => {
    const { svc, tx } = svcFor(null);
    await expect(
      svc.create("t1", { type: "PERSON", firstName: "A", tckn: "11111111111" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it("YENİ kayıt: geçerli-checksum TCKN → insert (tx.client.create)", async () => {
    const { svc, tx } = svcFor(null);
    await svc.create("t1", { type: "PERSON", firstName: "A", tckn: "11111111110" });
    expect(tx.client.create).toHaveBeenCalledTimes(1);
  });

  it("YENİ kayıt: geçersiz-checksum VKN (10 hane) → BadRequestException; insert YOK", async () => {
    const { svc, tx } = svcFor(null);
    await expect(
      svc.create("t1", { type: "COMPANY", companyName: "X", vkn: "3333333333" }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it("YENİ kayıt: geçerli-checksum VKN → insert", async () => {
    const { svc, tx } = svcFor(null);
    await svc.create("t1", { type: "COMPANY", companyName: "X", vkn: "1234567890" });
    expect(tx.client.create).toHaveBeenCalledTimes(1);
  });

  it("boş tckn '' → checksum atlanır (no-tckn); insert yapılır", async () => {
    const { svc, tx } = svcFor(null);
    await svc.create("t1", { type: "PERSON", firstName: "A", tckn: "" });
    expect(tx.client.create).toHaveBeenCalledTimes(1);
  });

  it("DEDUP/reactivate: legacy geçersiz-checksum TCKN eşleşmesi → REDDEDİLMEZ (eski veri kilitlenmez)", async () => {
    // Soft-deleted legacy müvekkilin tckn'i geçersiz-checksum; yeniden ekleme reactivate eder.
    // Checksum dedup'TAN SONRA olduğundan bu yola HİÇ gelinmez → BadRequest YOK.
    const { svc, tx } = svcFor({ id: "legacy1", isActive: false, displayName: "LEGACY", tckn: "11111111111" });
    const res = await svc.create("t1", { type: "PERSON", firstName: "A", tckn: "11111111111" });
    expect((res as any)._existingReturned).toBe(true);
    expect((res as any)._reactivated).toBe(true);
    expect(tx.client.create).not.toHaveBeenCalled();
  });
});

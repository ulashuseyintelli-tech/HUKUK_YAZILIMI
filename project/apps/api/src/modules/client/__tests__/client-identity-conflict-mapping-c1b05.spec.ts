/**
 * C1-B05 (FIND-C3, CLAUDE-CLIENT-C1): DB-seviyesi kimlik tekilliği ihlalinin
 * DUPLICATE_IDENTITY sözleşmesine çevrilmesi (SAF, DB-siz).
 *
 * Migration paketi (20260802190000_client_identity_active_partial_unique) aktif satırda
 * (tenantId, tckn) ve (tenantId, vkn) için partial unique index tanımlar — B04'te
 * profillenen yarış penceresini DB seviyesinde kapatır. Bu spec, index ihlalinin (Prisma
 * P2002) üç tx call-site'ında da mevcut DUPLICATE_IDENTITY ConflictException sözleşmesine
 * çevrildiğini ve P2002-dışı hataların AYNEN yayıldığını kilitler.
 * (Index'in kendisi CI'da `prisma migrate deploy` ile gerçek Postgres'e uygulanır.)
 */
import { ConflictException } from "@nestjs/common";
import { ClientService } from "../client.service";

const actor = { userId: "u1", tenantId: "t1", role: "USER" } as any;
const actorAdmin = { userId: "u1", tenantId: "t1", role: "ADMIN" } as any;

const p2002 = () => Object.assign(new Error("Unique constraint failed"), { code: "P2002" });

const build = (opts: { probeResult?: any; txError?: any } = {}) => {
  const tx = {
    client: {
      create: jest.fn().mockResolvedValue({ id: "new-1" }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue({ id: "self" }),
    },
    clientContact: {
      createMany: jest.fn().mockResolvedValue({}),
      deleteMany: jest.fn().mockResolvedValue({}),
    },
  };
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(where?.OR ? opts.probeResult ?? null : {
          id: "self", type: "PERSON", firstName: "Ali", lastName: "Veli",
          tckn: "11111111111", vkn: null, identityNo: "11111111111",
          name: "Ali Veli", displayName: "Ali Veli", isActive: true,
          contactFollowUpStatus: null, contacts: [],
        }),
      ),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => {
      if (opts.txError) throw opts.txError;
      return cb(tx);
    }),
  };
  const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
  const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
  return { svc: new ClientService(prisma, audit as any, officeApproval as any), prisma, tx };
};

describe("C1-B05 — P2002 → DUPLICATE_IDENTITY sözleşme çevirisi", () => {
  it("create ana tx: P2002 → ConflictException(code=DUPLICATE_IDENTITY)", async () => {
    const { svc } = build({ txError: p2002() });
    expect.assertions(2);
    try {
      await svc.create("t1", { type: "PERSON", firstName: "A", lastName: "B", tckn: "12345678028" }, actor);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().code).toBe("DUPLICATE_IDENTITY");
    }
  });

  it("create ana tx: P2002 DIŞI hata AYNEN yayılır (ConflictException'a çevrilmez)", async () => {
    const boom = new Error("connection reset");
    const { svc } = build({ txError: boom });
    await expect(
      svc.create("t1", { type: "PERSON", firstName: "A", lastName: "B", tckn: "12345678028" }, actor),
    ).rejects.toBe(boom);
  });

  it("reactivate tx: P2002 → DUPLICATE_IDENTITY (başka aktif satır aynı kimliği taşıyor)", async () => {
    const { svc } = build({
      probeResult: { id: "dup-1", isActive: false, displayName: "Pasif" },
      txError: p2002(),
    });
    expect.assertions(2);
    try {
      await svc.create("t1", { type: "PERSON", firstName: "A", lastName: "B", tckn: "12345678028" }, actor);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().code).toBe("DUPLICATE_IDENTITY");
    }
  });

  it("update tx: P2002 → DUPLICATE_IDENTITY (PR-U4 probe'unu geçen yarış)", async () => {
    const { svc } = build({ txError: p2002() });
    expect.assertions(2);
    try {
      await svc.update("self", "t1", { type: "PERSON", tckn: "22222222222" }, actorAdmin);
    } catch (e: any) {
      expect(e).toBeInstanceOf(ConflictException);
      expect(e.getResponse().code).toBe("DUPLICATE_IDENTITY");
    }
  });

  it("update tx: P2002 DIŞI hata AYNEN yayılır", async () => {
    const boom = new Error("timeout");
    const { svc } = build({ txError: boom });
    await expect(
      svc.update("self", "t1", { phone: "05551112233" }, actor),
    ).rejects.toBe(boom);
  });

  it("hata yolu YOKSA davranış değişmez: create yazar, update yazar (regresyon)", async () => {
    const { svc, tx } = build();
    const created: any = await svc.create(
      "t1",
      { type: "PERSON", firstName: "A", lastName: "B", tckn: "12345678028" },
      actor,
    );
    expect(tx.client.create).toHaveBeenCalledTimes(1);
    expect(created?._existingReturned).toBeUndefined();

    await svc.update("self", "t1", { phone: "05551112233" }, actor);
    expect(tx.client.updateMany).toHaveBeenCalled();
  });
});

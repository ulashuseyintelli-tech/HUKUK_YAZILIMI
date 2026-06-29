/**
 * C0-a — Client mutation audit testleri.
 * Acceptance: create/update/remove → AuditService.logInTransaction (tx içinde);
 * actor YALNIZ auth context (body.userId yok-sayılır); HAM PII (TCKN/telefon/e-posta)
 * audit payload'una düz metin GİRMEZ (masked/digest); reactivate ayrı action.
 */
import { ClientService } from "../client.service";

const RAW_TCKN = "40294995552";
const RAW_PHONE = "05559998877";
const RAW_EMAIL = "ayse.yilmaz@example.com";

function buildHarness(opts: { existing?: any; created?: any; updated?: any } = {}) {
  const tx = {
    client: {
      create: jest.fn().mockResolvedValue(opts.created ?? { id: "c1" }),
      update: jest.fn().mockResolvedValue(opts.updated ?? { id: "c1" }),
      // P0.5: update/remove artık tenant-scoped updateMany + re-fetch findFirst kullanıyor.
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findFirst: jest.fn().mockResolvedValue(opts.updated ?? { id: "c1" }),
    },
    clientContact: { createMany: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
  };
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        where.id && !where.OR ? Promise.resolve(opts.existing ?? { id: where.id, isActive: true }) : Promise.resolve(null),
      ),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  // syncContactFollowUpTaskSafe yan-etkisini sustur (tx dışı; audit testini ilgilendirmez)
  const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
  const svc = new ClientService(prisma, audit as any);
  jest.spyOn(svc as any, "syncContactFollowUpTaskSafe").mockResolvedValue(undefined);
  return { svc, prisma, tx, audit };
}

const auditInput = (audit: any) => audit.logInTransaction.mock.calls[0][1];
const auditJson = (audit: any) => JSON.stringify(audit.logInTransaction.mock.calls[0][1]);

describe("ClientService.create — audit", () => {
  it("CLIENT_CREATE yazar; actor=req.user.id; ham TCKN/telefon audit'te YOK", async () => {
    const { svc, audit } = buildHarness({
      created: { id: "c1", type: "PERSON", tckn: RAW_TCKN, displayName: "AYŞE YILMAZ", phone: RAW_PHONE, email: RAW_EMAIL, isActive: true, canCollect: true },
    });

    await svc.create("t1", { type: "PERSON", tckn: RAW_TCKN, firstName: "Ayşe", lastName: "Yılmaz", phones: [{ value: RAW_PHONE }] }, { userId: "u-real" });

    const input = auditInput(audit);
    expect(input.action).toBe("CLIENT_CREATE");
    expect(input.entityType).toBe("CLIENT");
    expect(input.userId).toBe("u-real");
    expect(input.metadata.fieldDiff).toBeDefined();
    // HAM PII negatif assertion
    const json = auditJson(audit);
    expect(json).not.toContain(RAW_TCKN);
    expect(json).not.toContain(RAW_PHONE);
    expect(json).not.toContain(RAW_EMAIL);
    // maskelenmiş iz görünür (TCKN son 4 hane)
    expect(json).toContain("****5552");
  });

  it("body/data.userId actor OLARAK kullanılmaz — yalnız geçilen actor", async () => {
    const { svc, audit } = buildHarness({ created: { id: "c1", type: "PERSON", tckn: "123" } });

    await svc.create("t1", { type: "PERSON", tckn: "123", userId: "HACKER", createdById: "HACKER" } as any, { userId: "u-real" });

    expect(auditInput(audit).userId).toBe("u-real");
    expect(auditJson(audit)).not.toContain("HACKER");
  });

  it("audit yazılamazsa mutation ROLLBACK — logInTransaction reddederse create reddeder", async () => {
    const { svc, audit } = buildHarness({ created: { id: "c1", type: "PERSON", tckn: "123" } });
    (audit.logInTransaction as jest.Mock).mockRejectedValueOnce(new Error("audit db down"));
    // logInTransaction $transaction callback'i içinde → reddi callback'i reddeder → Prisma rollback.
    await expect(
      svc.create("t1", { type: "PERSON", tckn: "123" }, { userId: "u-real" }),
    ).rejects.toThrow("audit db down");
  });
});

describe("ClientService.update — audit", () => {
  it("CLIENT_UPDATE; field + contact diff; ham telefon audit'te YOK", async () => {
    const existing = { id: "c1", type: "PERSON", tckn: "11111111111", displayName: "ESKI AD", phone: "05550000000", isActive: true, contacts: [] };
    const updated = { id: "c1", type: "PERSON", tckn: RAW_TCKN, displayName: "YENI AD", phone: RAW_PHONE, isActive: true };
    const { svc, audit } = buildHarness({ existing, updated });

    await svc.update("c1", "t1", { type: "PERSON", tckn: RAW_TCKN, firstName: "Yeni", lastName: "Ad", phones: [{ value: RAW_PHONE }] }, { userId: "u-real" });

    const input = auditInput(audit);
    expect(input.action).toBe("CLIENT_UPDATE");
    expect(input.userId).toBe("u-real");
    expect(input.metadata.contactsDiff.changed).toBe(true);
    const json = auditJson(audit);
    expect(json).not.toContain(RAW_TCKN);
    expect(json).not.toContain(RAW_PHONE);
  });
});

describe("ClientService.remove — audit", () => {
  it("CLIENT_DELETE; softDelete metadata; old snapshot delete ÖNCESİ; ham PII yok", async () => {
    const existing = { id: "c1", type: "PERSON", tckn: RAW_TCKN, displayName: "AYŞE YILMAZ", isActive: true };
    const { svc, tx, audit } = buildHarness({ existing, updated: { id: "c1", isActive: false } });

    await svc.remove("c1", "t1", { userId: "u-real" });

    expect(tx.client.updateMany).toHaveBeenCalledWith({ where: { id: "c1", tenantId: "t1" }, data: { isActive: false } });
    const input = auditInput(audit);
    expect(input.action).toBe("CLIENT_DELETE");
    expect(input.userId).toBe("u-real");
    expect(input.metadata.softDelete).toBe(true);
    expect(input.metadata.oldSnapshot).toBeDefined();
    expect(auditJson(audit)).not.toContain(RAW_TCKN);
  });
});

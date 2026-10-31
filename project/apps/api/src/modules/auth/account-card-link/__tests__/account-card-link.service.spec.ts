// F02 K-A1 B-1 (owner kararı 31.10.2026): AccountCardLinkService birim testleri (mock prisma / audit). Yan etki = updateMany + audit; e-posta yok.
import { BadRequestException, ConflictException, NotFoundException } from "@nestjs/common";
import { AccountCardLinkService, ACCOUNT_CARD_LINK_AUDIT_ACTION } from "../account-card-link.service";

const ACTOR = { id: "admin1", tenantId: "t1" };
const VALID_TCKN = "10000000146";

function make(opts?: { user?: any; lawyer?: any; staff?: any; lawyerCount?: number; staffCount?: number }) {
  const user = {
    findFirst: jest.fn(async (_args?: any): Promise<any> => (opts && "user" in opts ? opts.user : { id: "u1", isActive: true, lawyer: null, staffMember: null })),
    findMany: jest.fn(async (_args?: any): Promise<any> => [
      { id: "u1", email: "a@x.test", name: "A", surname: "B", role: "USER", passwordHash: "h" },
      { id: "u2", email: "c@x.test", name: "C", surname: "D", role: "VIEWER", passwordHash: null },
    ]),
  };
  const lawyer = {
    findFirst: jest.fn(async (_args?: any): Promise<any> => (opts && "lawyer" in opts ? opts.lawyer : { id: "L1", userId: null, tckn: VALID_TCKN })),
    updateMany: jest.fn(async (_args?: any): Promise<any> => ({ count: opts?.lawyerCount ?? 1 })),
  };
  const staffMember = {
    findFirst: jest.fn(async (_args?: any): Promise<any> => (opts && "staff" in opts ? opts.staff : { id: "S1", userId: null, tckn: "" })),
    updateMany: jest.fn(async (_args?: any): Promise<any> => ({ count: opts?.staffCount ?? 1 })),
  };
  const tx = { user, lawyer, staffMember, $queryRaw: jest.fn().mockResolvedValue([]) };
  const prisma = { user, lawyer, staffMember, $transaction: jest.fn(async (cb: any) => cb(tx)) } as any;
  const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn().mockResolvedValue(undefined) } as any;
  return { svc: new AccountCardLinkService(prisma, audit), prisma, audit, user, lawyer, staffMember, tx };
}

function noWrites(m: ReturnType<typeof make>) {
  expect(m.lawyer.updateMany).not.toHaveBeenCalled();
  expect(m.staffMember.updateMany).not.toHaveBeenCalled();
  expect(m.audit.logInTransaction).not.toHaveBeenCalled();
  expect(m.audit.log).not.toHaveBeenCalled();
}

describe("AccountCardLinkService.link (F02 K-A1 B-1)", () => {
  it("iki kart birden → 400; transaction AÇILMAZ, yazma 0", async () => {
    const m = make();
    await expect(m.svc.link(ACTOR, { userId: "u1", lawyerId: "L1", staffMemberId: "S1" })).rejects.toBeInstanceOf(BadRequestException);
    expect(m.prisma.$transaction).not.toHaveBeenCalled(); noWrites(m);
  });
  it("kart yok → 400; yazma 0", async () => {
    const m = make();
    await expect(m.svc.link(ACTOR, { userId: "u1" })).rejects.toBeInstanceOf(BadRequestException);
    expect(m.prisma.$transaction).not.toHaveBeenCalled(); noWrites(m);
  });
  it("hesap bulunamadı / kiracı dışı → 404; hesap sorgusu kiracı koşullu; yazma 0", async () => {
    const m = make({ user: null });
    await expect(m.svc.link(ACTOR, { userId: "ghost", lawyerId: "L1" })).rejects.toBeInstanceOf(NotFoundException);
    expect(m.user.findFirst.mock.calls[0][0].where).toEqual({ id: "ghost", tenantId: "t1" });
    expect(m.lawyer.findFirst).not.toHaveBeenCalled(); noWrites(m);
  });
  it("pasif hesap → 409; yazma 0", async () => {
    const m = make({ user: { id: "u1", isActive: false, lawyer: null, staffMember: null } });
    await expect(m.svc.link(ACTOR, { userId: "u1", lawyerId: "L1" })).rejects.toBeInstanceOf(ConflictException); noWrites(m);
  });
  it("hesap zaten kartlı (personel) → 409; kart sorgulanmaz", async () => {
    const m = make({ user: { id: "u1", isActive: true, lawyer: null, staffMember: { id: "S9" } } });
    await expect(m.svc.link(ACTOR, { userId: "u1", lawyerId: "L1" })).rejects.toBeInstanceOf(ConflictException);
    expect(m.lawyer.findFirst).not.toHaveBeenCalled(); noWrites(m);
  });
  it("avukat kartı bulunamadı / kiracı dışı / pasif → 404 (sorgu tenantId + isActive koşullu); yazma 0", async () => {
    const m = make({ lawyer: null });
    await expect(m.svc.link(ACTOR, { userId: "u1", lawyerId: "LX" })).rejects.toBeInstanceOf(NotFoundException);
    expect(m.lawyer.findFirst.mock.calls[0][0].where).toEqual({ id: "LX", tenantId: "t1", isActive: true }); noWrites(m);
  });
  it("kart zaten bağlı → 409; yazma 0", async () => {
    const m = make({ lawyer: { id: "L1", userId: "other", tckn: VALID_TCKN } });
    await expect(m.svc.link(ACTOR, { userId: "u1", lawyerId: "L1" })).rejects.toBeInstanceOf(ConflictException); noWrites(m);
  });
  it("yarış: updateMany count 0 → 409; audit YAZILMAZ (transaction geri alınır)", async () => {
    const m = make({ lawyerCount: 0 });
    await expect(m.svc.link(ACTOR, { userId: "u1", lawyerId: "L1" })).rejects.toBeInstanceOf(ConflictException);
    expect(m.audit.logInTransaction).not.toHaveBeenCalled();
  });
  it("başarı (avukat, geçerli TCKN): hesap satırı FOR UPDATE; updateMany WHERE userId IS NULL + tenantId; audit tx içinde kişisel verisiz; identityProofReady true", async () => {
    const m = make();
    const r = await m.svc.link(ACTOR, { userId: "u1", lawyerId: "L1" });
    expect(r).toEqual({ userId: "u1", cardType: "LAWYER", cardId: "L1", identityProofReady: true });
    expect(m.tx.$queryRaw).toHaveBeenCalledTimes(1);
    expect(m.lawyer.updateMany).toHaveBeenCalledWith({ where: { id: "L1", tenantId: "t1", userId: null }, data: { userId: "u1" } });
    expect(m.staffMember.updateMany).not.toHaveBeenCalled();
    expect(m.audit.logInTransaction).toHaveBeenCalledTimes(1);
    const [txArg, input] = m.audit.logInTransaction.mock.calls[0];
    expect(txArg).toBe(m.tx);
    expect(input).toMatchObject({ tenantId: "t1", action: ACCOUNT_CARD_LINK_AUDIT_ACTION, entityType: "USER", entityId: "u1", userId: "admin1" });
    const meta = JSON.stringify(input.metadata);
    expect(input.metadata).toEqual({ targetUserId: "u1", cardType: "LAWYER", cardId: "L1", identityProofReady: true, source: "ACCOUNT_CARD_LINK" });
    expect(meta).not.toMatch(/@|tckn|10000000146|name|surname/i);
  });
  it("başarı (personel, TCKN boş): identityProofReady false — kart bağlanır ama kimlik kanıtı E-3 ile tamamlanır", async () => {
    const m = make();
    const r = await m.svc.link(ACTOR, { userId: "u1", staffMemberId: "S1" });
    expect(r).toEqual({ userId: "u1", cardType: "STAFF", cardId: "S1", identityProofReady: false });
    expect(m.staffMember.updateMany).toHaveBeenCalledWith({ where: { id: "S1", tenantId: "t1", userId: null }, data: { userId: "u1" } });
    expect(m.lawyer.updateMany).not.toHaveBeenCalled();
  });
});

describe("AccountCardLinkService.listUnlinkedUsers", () => {
  it("aynı kiracı; aktif; lawyer ve staffMember is:null; parola hash'i dönmez; pendingInvite = hash null", async () => {
    const m = make();
    const rows = await m.svc.listUnlinkedUsers({ tenantId: "t1" });
    expect(m.user.findMany.mock.calls[0][0].where).toEqual({ tenantId: "t1", isActive: true, lawyer: { is: null }, staffMember: { is: null } });
    expect(rows).toEqual([
      { id: "u1", email: "a@x.test", name: "A", surname: "B", role: "USER", pendingInvite: false },
      { id: "u2", email: "c@x.test", name: "C", surname: "D", role: "VIEWER", pendingInvite: true },
    ]);
    expect(JSON.stringify(rows)).not.toMatch(/passwordHash/);
  });
});

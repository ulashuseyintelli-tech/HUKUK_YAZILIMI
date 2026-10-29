/**
 * Task A / Faz 1 — ClientService.create() TCKN/VKN mod-10/11 checksum (DOMAIN katmanı).
 *
 * Kural domain/service katmanında (controller'da DEĞİL) → TÜM create yolları tutarlı kapsanır
 * (settings modal · cases/new · Excel import · seed · gelecekteki REST v2 / job / queue).
 * Doğrulama YALNIZ GERÇEKTEN YENİ kayıt için: AKTİF duplicate eşleşmesi (legacy, geçersiz-checksum
 * dahil) ETKİLENMEZ — eski veri kilitlenmez.
 *
 * D-1b (owner GO 2026-09-06) — `isActive:false → true` geçişi YAZILACAK SON kimliğin geçerli olmasını ister
 * (update/lifecycle yolu; Charter §58.3, client-identity-checksum-tightening-d1b.spec.ts).
 * CL-R04 (owner 2026-10-29/30): create/dedup yolu ARTIK REAKTİVE ETMEZ — pasif mükerrer kayıt 409
 * DUPLICATE_IDENTITY_INACTIVE döner; checksum'a bu dalda HİÇ gelinmez (yazma yok). Aktif duplicate yolu
 * (mutasyon YOK; maskeli dönüş) DEĞİŞMEDİ.
 */
import { BadRequestException, ConflictException } from "@nestjs/common";
import { ClientService } from "../client.service";

const buildTx = () => ({
  client: {
    update: jest.fn().mockResolvedValue({}),
    // OWN-13 I02-R1A: reaktivasyon yazimi kosullu updateMany ile yapilir (TOCTOU koruması).
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    create: jest.fn().mockResolvedValue({ id: "new" }),
  },
  clientContact: { createMany: jest.fn().mockResolvedValue({}), deleteMany: jest.fn().mockResolvedValue({}) },
});

// existing: dedup findFirst (OR query) sonucu; null → "yeni kayıt" yolu (checksum'a gelinir).
const buildPrisma = (existing: any, tx: any) => ({
  // CL-R04: dedup dalı K16 kapsam probu yapar (user.findFirst + client.findFirst where.AND) — kapsam İÇİ varsayılır.
  user: { findFirst: jest.fn().mockResolvedValue({ id: "fixture-actor" }) },
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
  // OWN-13 I02-R1A: dedup/reactivate yolu artik LIFECYCLE yetkisine tabidir. Bu suite CHECKSUM
  // davranisini olcer, yetkiyi degil → ACIK ve yetkili approver stub'i (sahte bypass DEGIL).
  const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
  const svc = new ClientService(prisma, buildAudit() as any, officeApproval as any);
  return { svc, tx, prisma };
}

describe("ClientService.create — TCKN/VKN checksum (Task A/Faz 1)", () => {
  it("YENİ kayıt: geçersiz-checksum TCKN (11 hane) → BadRequestException; insert YOK", async () => {
    const { svc, tx } = svcFor(null);
    await expect(
      svc.create("t1", { type: "PERSON", firstName: "A", tckn: "11111111111" }, { userId: 'fixture-actor', tenantId: "t1", role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it("YENİ kayıt: geçerli-checksum TCKN → insert (tx.client.create)", async () => {
    const { svc, tx } = svcFor(null);
    await svc.create("t1", { type: "PERSON", firstName: "A", tckn: "11111111110" }, { userId: 'fixture-actor', tenantId: "t1", role: 'ADMIN' });
    expect(tx.client.create).toHaveBeenCalledTimes(1);
  });

  it("YENİ kayıt: geçersiz-checksum VKN (10 hane) → BadRequestException; insert YOK", async () => {
    const { svc, tx } = svcFor(null);
    await expect(
      svc.create("t1", { type: "COMPANY", companyName: "X", vkn: "3333333333" }, { userId: 'fixture-actor', tenantId: "t1", role: 'ADMIN' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it("YENİ kayıt: geçerli-checksum VKN → insert", async () => {
    const { svc, tx } = svcFor(null);
    await svc.create("t1", { type: "COMPANY", companyName: "X", vkn: "1234567890" }, { userId: 'fixture-actor', tenantId: "t1", role: 'ADMIN' });
    expect(tx.client.create).toHaveBeenCalledTimes(1);
  });

  it("boş tckn '' → checksum atlanır (no-tckn); insert yapılır", async () => {
    const { svc, tx } = svcFor(null);
    await svc.create("t1", { type: "PERSON", firstName: "A", tckn: "" }, { userId: 'fixture-actor', tenantId: "t1", role: 'ADMIN' });
    expect(tx.client.create).toHaveBeenCalledTimes(1);
  });

  it("DEDUP (AKTİF eşleşme): legacy geçersiz-checksum TCKN → REDDEDİLMEZ (eski veri kilitlenmez)", async () => {
    // Aktif duplicate: mutasyon YOK, mevcut kayıt döner. Checksum dedup'TAN SONRA olduğundan bu
    // yola HİÇ gelinmez → BadRequest YOK. D-1b bu dalı DEĞİŞTİRMEZ (lifecycle geçişi yok).
    const { svc, tx } = svcFor({ id: "legacy1", isActive: true, displayName: "LEGACY", tckn: "11111111111" });
    const res = await svc.create("t1", { type: "PERSON", firstName: "A", tckn: "11111111111" }, { userId: 'fixture-actor', tenantId: "t1", role: 'ADMIN' });
    expect((res as any)._existingReturned).toBe(true);
    expect((res as any)._reactivated).toBe(false);
    expect(tx.client.create).not.toHaveBeenCalled();
    expect(tx.client.updateMany).not.toHaveBeenCalled();
  });

  it("CL-R04 — DEDUP (PASİF eşleşme, legacy geçersiz-checksum): create reaktive ETMEZ → 409 DUPLICATE_IDENTITY_INACTIVE; checksum'a gelinmez, yazma YOK", async () => {
    // Soft-deleted legacy kaydın tckn'i geçersiz-checksum. Create yolu artık bu kayda dokunmaz: ne 400 (checksum) ne
    // reaktivasyon — pasif kayıt yalnız yetkili lifecycle ucundan (update) aktifleştirilir (orada D-1b uygulanır).
    const { svc, tx } = svcFor({ id: "legacy1", isActive: false, displayName: "LEGACY", tckn: "11111111111" });
    let caught: any;
    try {
      await svc.create("t1", { type: "PERSON", firstName: "A", tckn: "11111111111" }, { userId: 'fixture-actor', tenantId: "t1", role: 'ADMIN' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect(caught.getResponse().code).toBe("DUPLICATE_IDENTITY_INACTIVE");
    expect(tx.client.updateMany).not.toHaveBeenCalled();
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it("CL-R04 — DEDUP (PASİF eşleşme, GEÇERLİ checksum): yine 409 DUPLICATE_IDENTITY_INACTIVE; updateMany YOK (yetkili aktör olsa bile)", async () => {
    const { svc, tx } = svcFor({ id: "ok1", isActive: false, displayName: "OK", tckn: "10000000146" });
    let caught: any;
    try {
      await svc.create("t1", { type: "PERSON", firstName: "A", tckn: "10000000146" }, { userId: 'fixture-actor', tenantId: "t1", role: 'ADMIN' });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect(caught.getResponse().code).toBe("DUPLICATE_IDENTITY_INACTIVE");
    expect(tx.client.updateMany).not.toHaveBeenCalled();
    expect(tx.client.create).not.toHaveBeenCalled();
  });
});

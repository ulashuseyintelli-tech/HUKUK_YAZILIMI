/**
 * C1-B04 (FIND-C5, CLAUDE-CLIENT-C1): create() dedup probe'unun tckn/vkn bağımsızlığı
 * + yarış penceresi profili (SAF, DB-siz).
 *
 * Kusur (characterization ÖNCE KIRMIZI): dedup `data.tckn || data.vkn` tek değere çöküyordu.
 * Her iki kimlik alanı da doluysa yalnız tckn problanıyor, vkn HİÇ sorgulanmıyordu →
 * vkn duplicate'i sessizce yeni kayıt olarak yazılıyordu. Fix: PR-U4 update-guard deseniyle
 * simetrik — her gönderilen kimlik alanı KENDİ kolonu + identityNo (mixed-legacy kolon)
 * üzerinden BAĞIMSIZ problanır. Dedup yalnız GENİŞLER (mevcut eşleşmeler korunur).
 *
 * YARIŞ PROFİLİ (B05 design gate girdisi — burada FIX EDİLMEZ, KANITLANIR):
 * DB'de kimlik tekilliği yok (tckn/vkn yalnız non-unique index) → iki eşzamanlı create
 * aynı kimlikle probe'u aynı anda geçerse İKİSİ DE yazar. Servis katmanı bu pencereyi
 * KAPATAMAZ; kapanış B05'in DB-seviyesi tasarımına aittir.
 */
import { ClientService } from "../client.service";

describe("ClientService.create — FIND-C5 bağımsız kimlik probe (C1-B04)", () => {
  const actor = { userId: "u1", tenantId: "t1", role: "USER" } as any;

  const build = (probeResult: any | ((where: any) => any) = null) => {
    const tx = {
      client: { create: jest.fn().mockResolvedValue({ id: "new-1" }) },
      clientContact: { createMany: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      client: {
        // OR'lu çağrı = dedup probe; OR'suz çağrı = findOne (mutasyon-sonrası dönüş).
        findFirst: jest.fn().mockImplementation(({ where }: any) => {
          if (!where?.OR) return Promise.resolve({ id: "whatever" });
          return Promise.resolve(
            typeof probeResult === "function" ? probeResult(where) : probeResult,
          );
        }),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
    };
    const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
    const svc = new ClientService(prisma, audit as any, officeApproval as any);
    const probeWhere = () =>
      prisma.client.findFirst.mock.calls.find((c: any[]) => c[0]?.where?.OR)?.[0]?.where;
    return { svc, prisma, tx, probeWhere };
  };

  it("tckn VE vkn birlikte gönderildiğinde İKİSİ DE bağımsız problanır (vkn atlanamaz)", async () => {
    const { svc, probeWhere } = build(null);
    await svc.create(
      "t1",
      { type: "COMPANY", companyName: "X A.Ş.", tckn: "12345678028", vkn: "1234567890" },
      actor,
    );
    const where = probeWhere();
    expect(where).toBeDefined();
    expect(where.OR).toEqual(
      expect.arrayContaining([
        { tckn: "12345678028" },
        { identityNo: "12345678028" },
        { vkn: "1234567890" },
        { identityNo: "1234567890" },
      ]),
    );
  });

  it("yalnız vkn'nin eşleştiği duplicate YAKALANIR: yeni kayıt yazılmaz, _existingReturned döner", async () => {
    const existing = { id: "dup-1", isActive: true, displayName: "Mevcut A.Ş." };
    const { svc, tx } = build((where: any) =>
      where.OR.some((c: any) => c.vkn === "1234567890" || c.identityNo === "1234567890")
        ? existing
        : null,
    );
    const res: any = await svc.create(
      "t1",
      { type: "COMPANY", companyName: "X A.Ş.", tckn: "12345678028", vkn: "1234567890" },
      actor,
    );
    expect(res._existingReturned).toBe(true);
    expect(tx.client.create).not.toHaveBeenCalled();
  });

  it("yalnız tckn gönderildiğinde probe tckn + identityNo koşullarını taşır (vkn koşulu eklenmez)", async () => {
    const { svc, probeWhere } = build(null);
    await svc.create(
      "t1",
      { type: "PERSON", firstName: "Ali", lastName: "Veli", tckn: "12345678028" },
      actor,
    );
    const where = probeWhere();
    expect(where.OR).toEqual(
      expect.arrayContaining([{ tckn: "12345678028" }, { identityNo: "12345678028" }]),
    );
    expect(where.OR.some((c: any) => "vkn" in c)).toBe(false);
    expect(where.tenantId).toBe("t1");
  });

  it("yalnız vkn gönderildiğinde probe vkn + identityNo koşullarını taşır", async () => {
    const { svc, probeWhere } = build(null);
    await svc.create("t1", { type: "COMPANY", companyName: "X A.Ş.", vkn: "1234567890" }, actor);
    const where = probeWhere();
    expect(where.OR).toEqual(
      expect.arrayContaining([{ vkn: "1234567890" }, { identityNo: "1234567890" }]),
    );
    expect(where.OR.some((c: any) => "tckn" in c)).toBe(false);
  });

  it("kimlik alanı yoksa probe HİÇ çalışmaz (mevcut davranış korunur)", async () => {
    const { svc, prisma } = build(null);
    await svc.create("t1", { type: "PERSON", firstName: "Ali", lastName: "Veli" }, actor);
    const probeCalls = prisma.client.findFirst.mock.calls.filter((c: any[]) => c[0]?.where?.OR);
    expect(probeCalls).toHaveLength(0);
  });

  it("soft-deleted eşleşmede reactivate yolu KORUNUR (isActive:false → updateMany + _reactivated)", async () => {
    const existing = { id: "dup-2", isActive: false, displayName: "Pasif A.Ş." };
    const updateMany = jest.fn().mockResolvedValue({ count: 1 });
    const { svc, prisma } = build(existing);
    prisma.$transaction = jest
      .fn()
      .mockImplementation(async (cb: any) => cb({ client: { updateMany } }));
    const res: any = await svc.create(
      "t1",
      { type: "COMPANY", companyName: "Pasif A.Ş.", vkn: "1234567890" },
      actor,
    );
    expect(res._existingReturned).toBe(true);
    expect(res._reactivated).toBe(true);
    expect(updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: "dup-2", tenantId: "t1", isActive: false } }),
    );
  });
});

describe("ClientService.create — yarış penceresi PROFİLİ (B05 design gate kanıtı; fix DEĞİL)", () => {
  const actor = { userId: "u1", tenantId: "t1", role: "USER" } as any;

  it("iki eşzamanlı create aynı kimlikle probe'u aynı anda geçerse İKİSİ DE yazar (servis katmanı pencereyi kapatamaz)", async () => {
    // Her iki çağrı da probe anında null görür (gerçek yarışın simülasyonu):
    const tx = {
      client: { create: jest.fn().mockResolvedValue({ id: "raced" }) },
      clientContact: { createMany: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      client: {
        findFirst: jest.fn().mockImplementation(({ where }: any) =>
          Promise.resolve(where?.OR ? null : { id: "raced" }),
        ),
      },
      $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
    };
    const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined), log: jest.fn() };
    const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(true) };
    const svc = new ClientService(prisma, audit as any, officeApproval as any);

    const payload = { type: "PERSON", firstName: "A", lastName: "B", tckn: "12345678028" };
    await Promise.all([svc.create("t1", payload, actor), svc.create("t1", payload, actor)]);

    // KANIT: DB-seviyesi tekillik olmadan iki INSERT de gerçekleşir. Bu pencerenin
    // kapanışı B05'in design gate çıktısına (unique constraint/dedup migration) aittir.
    expect(tx.client.create).toHaveBeenCalledTimes(2);
  });
});

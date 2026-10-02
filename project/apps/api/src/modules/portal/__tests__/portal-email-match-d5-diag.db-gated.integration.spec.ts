/**
 * D5-DIAG-R01 — portal e-posta biçim farkı eşleşmesi (GERÇEK Postgres). GATE: describeDb → DATABASE_URL yoksa SKIP.
 *
 * Birim spec (portal-email-match-d5-diag.spec.ts) sahte depoyla mantığı kilitler; bu dosya biçim farkı sorgusunun
 * (veritabanında kırpma + yalnız ASCII küçültme) ve koşullu yazımın gerçek veritabanında fiilen çalıştığını ölçer:
 *  [1] harf/boşluk farkıyla yazılan adres → token KAYITLI hesaba yazılır, e-posta KAYITLI adrese gider
 *  [2] ortam ön koşulu: veritabanının birebir karşılaştırması harf duyarlıdır; sunucu kodlaması UTF8 (servisi çağırmaz)
 *  [3] yalnız harf farkıyla ayrışan iki aktif hesap → hiçbirine token yazılmaz; birebir yazım kendi hesabına gider;
 *      pasif hesap aday sayılmaz
 *  [4] metin olmayan e-posta alanı → eşleşme yok; dış cevap aynı
 *  [5] harf farkıyla giriş → oturum kayıtlı hesaba; metin olmayan alanla giriş → ret
 *  [6] desen karakterleri (% _ \) düz metindir; ASCII dışı benzer harf eşleşmez; kayıtlı adresteki baş/son boşluk
 *      (sekme, bölünemez boşluk dahil) eşleşmeyi engellemez
 *  [7] hesap açma çakışma kapısı aynı karşılaştırmayı kullanır: başka büronun harf/boşluk varyantı 409 alır, kayıtlı
 *      adres boşluklu olsa da; adresin çözüldüğü hesap sonradan DEĞİŞMEZ (giriş ve sıfırlama ilk hesapta kalır)
 *  [8] eşzamanlı hesap açma / yeniden açma: biçim farkıyla aynı adrese gelen isteklerden yalnız biri yazar. İstekler
 *      transaction içinde bir bariyerde toplanıp birlikte bırakılır (çakışma zamanlamaya bırakılmaz)
 */
import { describeDb } from "../../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BadRequestException, ConflictException, UnauthorizedException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { OfficeApprovalService } from "../../office-approval/office-approval.service";
import { EmailProviderService } from "../../notification/email-provider.service";
import { PortalService } from "../portal.service";

describeDb("D5-DIAG-R01 — portal e-posta biçim farkı eşleşmesi (integration)", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let portal: PortalService;
  let sendSpy: jest.SpyInstance;
  const createdTenantIds: string[] = [];
  const PASSWORD = "DogruSifre123";
  const NON_TEXT = [undefined, null, 42, [], {}];
  const DOTTED_CAPITAL_I = String.fromCharCode(0x130);
  const NBSP = String.fromCharCode(0xa0);
  // Yetki kapısı bu dosyanın konusu değildir (kendi spec'lerinde ölçülür): çakışma kapısına ulaşmak için yetkili sayılır.
  // [8]: transaction içindeki yetki adımı bariyer olarak kullanılır — bütün istekler transaction'ı açtıktan sonra birlikte bırakılır.
  let txGate: null | (() => Promise<void>) = null;
  const officeApproval = {
    isApproverEligible: async () => true,
    isApproverEligibleInTx: async () => {
      if (txGate) await txGate();
      return true;
    },
  };
  function barrier(expected: number) {
    let arrived = 0;
    let release!: () => void;
    const all = new Promise<void>((resolve) => (release = resolve));
    return async () => {
      if (++arrived >= expected) release();
      await all;
    };
  }
  const actor = { userId: "d5-diag-r01-actor" } as any;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), JwtModule.register({ secret: "d5-diag-r01-test-secret" })],
      providers: [
        PortalService,
        PrismaService,
        AuditService,
        EmailProviderService,
        ConfigService,
        { provide: OfficeApprovalService, useValue: officeApproval },
      ],
    }).compile();
    prisma = module.get<PrismaService>(PrismaService);
    portal = module.get<PortalService>(PortalService);
    sendSpy = jest
      .spyOn(module.get<EmailProviderService>(EmailProviderService), "send")
      .mockResolvedValue({ success: true, provider: "mock" } as any);
  });

  afterEach(() => sendSpy.mockClear());

  afterAll(async () => {
    for (const tid of createdTenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId: tid } });
      await prisma.clientPortalUser.deleteMany({ where: { client: { tenantId: tid } } });
      await prisma.client.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await module.close();
  });

  const uniq = () => `${Date.now()}${Math.floor(Math.random() * 1e6)}`;
  async function createClient(label: string) {
    const ts = uniq();
    const tenant = await prisma.tenant.create({
      data: { name: `D5-DIAG-R01 ${label} ${ts}`, slug: `d5-diag-r01-${label}-${ts}`.toLowerCase() },
    });
    createdTenantIds.push(tenant.id);
    const client = await prisma.client.create({ data: { tenantId: tenant.id, type: "PERSON", displayName: `${label} Müvekkil` } });
    return { tenant, client };
  }
  async function seedPortalUser(label: string, email: string, isActive = true) {
    const { client } = await createClient(label);
    return prisma.clientPortalUser.create({
      data: { clientId: client.id, email, passwordHash: await bcrypt.hash(PASSWORD, 4), isActive },
    });
  }
  const rowOf = (id: string) => prisma.clientPortalUser.findUniqueOrThrow({ where: { id } });
  const tokenOf = async (id: string) => (await rowOf(id)).resetToken;

  it("[1] harf/boşluk farkıyla yazılan adres → token kayıtlı hesaba yazılır, e-posta kayıtlı adrese gider", async () => {
    const stored = `Ali.Veli.${uniq()}@D5-Diag-R01.Test`;
    const user = await seedPortalUser("bicim", stored);
    await expect(portal.createResetToken(`  ${stored.toLowerCase()} `)).resolves.toEqual({ success: true });
    expect(await tokenOf(user.id)).toMatch(/^[0-9a-f]{64}$/);
    expect(sendSpy).toHaveBeenCalledTimes(1);
    expect(sendSpy.mock.calls[0][0].to).toBe(stored);
  });

  it("[2] ortam ön koşulu: veritabanının birebir karşılaştırması harf duyarlıdır; sunucu kodlaması UTF8 (servisi çağırmaz)", async () => {
    const [{ server_encoding }] = await prisma.$queryRaw<Array<{ server_encoding: string }>>`SHOW server_encoding`;
    expect(server_encoding).toBe("UTF8"); // biçim farkı sorgusunun kırpma kümesi parametresi için ön koşul
    const stored = `Ayse.Kaya.${uniq()}@D5-Diag-R01.Test`;
    await seedPortalUser("birebir", stored);
    expect(await prisma.clientPortalUser.findFirst({ where: { email: stored.toLowerCase(), isActive: true } })).toBeNull();
    expect((await prisma.clientPortalUser.findFirst({ where: { email: stored, isActive: true } }))?.email).toBe(stored);
  });

  it("[3] iki aktif varyant → üçüncü yazım hiçbirine gitmez; birebir yazım kendi hesabına; pasif hesap aday sayılmaz", async () => {
    const base = `cift.${uniq()}@d5-diag-r01.test`;
    const a = await seedPortalUser("cift-a", base.replace("cift", "Cift"));
    const b = await seedPortalUser("cift-b", base.replace("cift", "CIFT"));
    await expect(portal.createResetToken(base)).resolves.toEqual({ success: true });
    expect(await tokenOf(a.id)).toBeNull();
    expect(await tokenOf(b.id)).toBeNull();
    expect(sendSpy).not.toHaveBeenCalled();
    // birebir yazım önceliklidir
    await portal.createResetToken(b.email);
    expect(await tokenOf(a.id)).toBeNull();
    expect(await tokenOf(b.id)).toMatch(/^[0-9a-f]{64}$/);
    // pasif varyant aday değildir: tek aktif hesap kalınca üçüncü yazım ona çözülür
    await prisma.clientPortalUser.update({ where: { id: b.id }, data: { isActive: false, resetToken: null, resetTokenExp: null } });
    await portal.createResetToken(base);
    expect(await tokenOf(a.id)).toMatch(/^[0-9a-f]{64}$/);
    expect(await tokenOf(b.id)).toBeNull();
  });

  it("[4] metin olmayan e-posta alanı → eşleşme yok; dış cevap aynı", async () => {
    const user = await seedPortalUser("alan", `alan.${uniq()}@d5-diag-r01.test`);
    for (const bad of NON_TEXT) {
      await expect(portal.createResetToken(bad as any)).resolves.toEqual({ success: true });
    }
    expect(await tokenOf(user.id)).toBeNull();
    expect(sendSpy).not.toHaveBeenCalled();
  });

  it("[5] harf farkıyla giriş → oturum kayıtlı hesaba; metin olmayan alanla giriş → ret", async () => {
    const stored = `Giris.${uniq()}@D5-Diag-R01.Test`;
    const user = await seedPortalUser("giris", stored);
    const res: any = await portal.login(stored.toUpperCase(), PASSWORD);
    expect(typeof res.token).toBe("string");
    expect(res.user.clientId).toBe(user.clientId);
    expect((await rowOf(user.id)).loginCount).toBe(1);
    for (const bad of NON_TEXT) {
      await expect(portal.login(bad as any, PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
    }
    await expect(portal.login(stored, undefined as any)).rejects.toBeInstanceOf(UnauthorizedException);
    expect((await rowOf(user.id)).loginCount).toBe(1);
  });

  it("[6] desen karakterleri düz metindir; ASCII dışı benzer harf eşleşmez; kayıtlı adresteki baş/son boşluk engel değildir", async () => {
    const tag = uniq();
    const stored = `Alt_Cizgi.${tag}@D5-Diag-R01.Test`;
    const user = await seedPortalUser("desen", stored);
    const patterns = [
      `%${tag}@d5-diag-r01.test`,
      `alt_cizgi.${tag}@d5-diag-r01.tes_`,
      `alt%cizgi.${tag}@d5-diag-r01.test`,
      `%${tag}%`,
      `alt\\_cizgi.${tag}@d5-diag-r01.test`,
      `altXcizgi.${tag}@d5-diag-r01.test`,
    ];
    for (const typed of patterns) {
      await expect(portal.createResetToken(typed)).resolves.toEqual({ success: true });
      await expect(portal.login(typed, PASSWORD)).rejects.toBeInstanceOf(UnauthorizedException);
    }
    expect(await tokenOf(user.id)).toBeNull();
    expect(sendSpy).not.toHaveBeenCalled();
    expect((await rowOf(user.id)).loginCount).toBe(0);
    // alt çizgi dahil aynı adres, yalnız harf farkıyla → eşleşir
    await portal.createResetToken(stored.toLowerCase());
    expect(await tokenOf(user.id)).toMatch(/^[0-9a-f]{64}$/);
    expect(sendSpy.mock.calls[0][0].to).toBe(stored);

    // ters bölü ve yüzde içeren kayıtlı adres harf farkıyla eşleşir
    const odd = await seedPortalUser("ters", `Ters\\Bolu%.${tag}@D5-Diag-R01.Test`);
    await portal.createResetToken(odd.email.toLowerCase());
    expect(await tokenOf(odd.id)).toMatch(/^[0-9a-f]{64}$/);

    // ASCII dışı benzer harf FARKLI sayılır. (Yerel ayar bağımsızlığını davranışla ayırt eden [3] ve [7]'dir ve yalnız
    // Türkçe katlayan bir veritabanında; CI veritabanında bunu birim spec'teki sorgu metni çivisi korur.)
    const ascii = await seedPortalUser("ascii", `ilker.${tag}@d5-diag-r01.test`);
    await portal.createResetToken(`${DOTTED_CAPITAL_I}lker.${tag}@d5-diag-r01.test`);
    expect(await tokenOf(ascii.id)).toBeNull();
    await portal.createResetToken(`ILKER.${tag}@D5-DIAG-R01.TEST`);
    expect(await tokenOf(ascii.id)).toMatch(/^[0-9a-f]{64}$/);

    // kayıtlı adresin başında/sonunda boşluk (sekme, bölünemez boşluk) → temiz yazım yine bulur; e-posta kayıtlı adrese gider
    sendSpy.mockClear();
    const spaced = await seedPortalUser("bosluk", `\t${NBSP}Bosluk.${tag}@D5-Diag-R01.Test ${NBSP}`);
    await portal.createResetToken(`bosluk.${tag}@d5-diag-r01.test`);
    expect(await tokenOf(spaced.id)).toMatch(/^[0-9a-f]{64}$/);
    expect(sendSpy.mock.calls[0][0].to).toBe(spaced.email);
  });

  it("[7] hesap açma çakışma kapısı: başka büronun varyantı 409 alır; giriş ve sıfırlama ilk hesapta kalır", async () => {
    const tag = uniq();
    const stored = `Ilk.Hesap.${tag}@D5-Diag-R01.Test`;
    const first = await seedPortalUser("ilk", stored);
    const other = await createClient("diger");
    for (const variant of [stored.toLowerCase(), stored.toUpperCase(), ` ${stored.toLowerCase()} `, `\t${stored}${NBSP}`, stored]) {
      await expect(portal.createPortalUser(other.client.id, variant, "BaskaSifre123", other.tenant.id, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    }
    expect(await prisma.clientPortalUser.count({ where: { clientId: other.client.id } })).toBe(0);

    // kayıtlı adres boşluklu olsa da temiz / harf farklı yazım 409 alır
    const spaced = await seedPortalUser("bosluklu", ` Bosluklu.${tag}@D5-Diag-R01.Test `);
    for (const variant of [spaced.email.trim(), spaced.email.trim().toLowerCase(), spaced.email]) {
      await expect(portal.createPortalUser(other.client.id, variant, "BaskaSifre123", other.tenant.id, actor)).rejects.toBeInstanceOf(
        ConflictException,
      );
    }
    expect(await prisma.clientPortalUser.count({ where: { clientId: other.client.id } })).toBe(0);

    // adresin çözüldüğü hesap değişmedi: harf farkıyla giriş ve sıfırlama hâlâ İLK hesapta
    const res: any = await portal.login(stored.toLowerCase(), PASSWORD);
    expect(res.user.clientId).toBe(first.clientId);
    expect((await rowOf(first.id)).loginCount).toBe(1);
    await portal.createResetToken(stored.toLowerCase());
    expect(await tokenOf(first.id)).toMatch(/^[0-9a-f]{64}$/);
    expect(sendSpy.mock.calls[0][0].to).toBe(stored);

    // pasif hesaptaki adres çakışma değildir; benzer ama FARKLI adresler (desen karakteri, ASCII dışı harf) çakışma değildir
    await seedPortalUser("pasif", `Pasif.${tag}@D5-Diag-R01.Test`, false);
    await seedPortalUser("benzer", `ilkXhesap.${tag}@d5-diag-r01.test`);
    await seedPortalUser("ascii", `ilker.kapi.${tag}@d5-diag-r01.test`);
    for (const email of [
      `pasif.${tag}@d5-diag-r01.test`,
      `ilk_hesap.${tag}@d5-diag-r01.test`,
      `${DOTTED_CAPITAL_I}lker.kapi.${tag}@d5-diag-r01.test`,
    ]) {
      const fresh = await createClient("yeni");
      const created: any = await portal.createPortalUser(fresh.client.id, email, "BaskaSifre123", fresh.tenant.id, actor);
      expect(created.success).toBe(true);
      expect((await rowOf(created.portalUserId)).email).toBe(email); // adres girildiği biçimde saklanır
    }

    // metin olmayan / boş alan → 400, hesap açılmaz
    const fourth = await createClient("alan");
    for (const bad of [...NON_TEXT, "   "]) {
      await expect(portal.createPortalUser(fourth.client.id, bad as any, "BaskaSifre123", fourth.tenant.id, actor)).rejects.toBeInstanceOf(
        BadRequestException,
      );
    }
    expect(await prisma.clientPortalUser.count({ where: { clientId: fourth.client.id } })).toBe(0);
  });

  it("[8] EŞZAMANLI hesap açma: biçim farkıyla aynı adrese gelen isteklerden yalnız BİRİ hesap açar, diğerleri 409 alır", async () => {
    const tag = uniq();
    const base = `Yaris.Hesap.${tag}@D5-Diag-R01.Test`;
    const variants = [base, base.toLowerCase(), base.toUpperCase(), ` ${base} `, `\t${base.toLowerCase()}`, `${base.toUpperCase()}${NBSP}`];
    const targets: Array<Awaited<ReturnType<typeof createClient>>> = [];
    for (let i = 0; i < variants.length; i++) targets.push(await createClient(`yaris-${i}`));
    txGate = barrier(variants.length);
    const results = await Promise.allSettled(
      variants.map((email, i) => portal.createPortalUser(targets[i].client.id, email, "BaskaSifre123", targets[i].tenant.id, actor)),
    ).finally(() => (txGate = null));
    const fulfilled = results.filter((r) => r.status === "fulfilled");
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(fulfilled.length).toBe(1);
    expect(rejected.every((r) => r.reason instanceof ConflictException)).toBe(true);
    const rows = await prisma.clientPortalUser.findMany({
      where: { clientId: { in: targets.map((t) => t.client.id) } },
      select: { isActive: true },
    });
    expect(rows.filter((r) => r.isActive).length).toBe(1);
    // kazanan hesap tek aday olduğu için harf farkıyla giriş belirsiz değildir
    const login: any = await portal.login(base.toLowerCase(), "BaskaSifre123");
    expect(typeof login.token).toBe("string");
  });

  it("[8b] EŞZAMANLI yeniden açma: pasif hesabı olan iki müvekkil biçim farkıyla aynı adresle açılırsa yalnız BİRİ açılır", async () => {
    const tag = uniq();
    const base = `Yeniden.Acma.${tag}@D5-Diag-R01.Test`;
    const a = await seedPortalUser("yeniden-a", `eski.a.${tag}@d5-diag-r01.test`, false);
    const b = await seedPortalUser("yeniden-b", `eski.b.${tag}@d5-diag-r01.test`, false);
    const tenantOf = async (clientId: string) => (await prisma.client.findUniqueOrThrow({ where: { id: clientId } })).tenantId;
    const tenantA = await tenantOf(a.clientId);
    const tenantB = await tenantOf(b.clientId);
    txGate = barrier(2);
    const results = await Promise.allSettled([
      portal.createPortalUser(a.clientId, base, "BaskaSifre123", tenantA, actor),
      portal.createPortalUser(b.clientId, base.toLowerCase(), "BaskaSifre123", tenantB, actor),
    ]).finally(() => (txGate = null));
    expect(results.filter((r) => r.status === "fulfilled").length).toBe(1);
    const rejected = results.filter((r) => r.status === "rejected") as PromiseRejectedResult[];
    expect(rejected.every((r) => r.reason instanceof ConflictException)).toBe(true);
    expect((await rowOf(a.id)).isActive !== (await rowOf(b.id)).isActive).toBe(true);
  });
});

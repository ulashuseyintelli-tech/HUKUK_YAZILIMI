/**
 * D5-SEC-R01 — portal parola sıfırlama sertleştirmesi (GERÇEK Postgres). GATE: describeDb → DATABASE_URL yoksa SKIP.
 *
 * Doğrular:
 *  [1] PASİF hesap, geçerli (süresi dolmamış) sıfırlama token'ıyla parola DEĞİŞTİREMEZ; cevap geçersiz token ile AYNI 400;
 *      parola, token ve tokenVersion yazılmaz.
 *  [2] Hesap kapatılırken bekleyen sıfırlama token'ı AYNI update'te geçersizleşir (resetToken/resetTokenExp null);
 *      kapatmadan önce gönderilmiş bağlantı artık tüketilemez.
 *  [3] Kapatma ↔ sıfırlama EŞZAMANLI yarışı (gerçek eşzamanlı işlemler, çok tekrar): hangi sıra olursa olsun son durum
 *      pasif + token yok; sıfırlama başarılıysa parola yeni ve tokenVersion +2 (sıfırlama ÖNCE), başarısızsa parola eski
 *      ve tokenVersion +1 (kapatma ÖNCE). "Kapatmadan SONRA başarılı sıfırlama" hiçbir tekrarda görülmez.
 *  [4] Tek kullanım + tokenVersion güvencesi korunur (aktif hesap: +1, ikinci kullanım 400).
 *  [5] Politika dışı parola (8'den kısa) token'ı TÜKETMEZ; aynı token geçerli parolayla sonra kullanılabilir.
 */
import { describeDb } from "../../../../test/describe-db";
import { Test, TestingModule } from "@nestjs/testing";
import { JwtModule } from "@nestjs/jwt";
import { ConfigModule, ConfigService } from "@nestjs/config";
import { BadRequestException } from "@nestjs/common";
import * as bcrypt from "bcrypt";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import { OfficeApprovalService } from "../../office-approval/office-approval.service";
import { EmailProviderService } from "../../notification/email-provider.service";
import { PortalService } from "../portal.service";
import { generateRawInviteToken, hashInviteToken } from "../../auth/invite/user-invite-token.util";

const OLD_PW = "EskiSifre123";
const NEW_PW = "YeniSifre456";
const ACTOR = { userId: "d5-sec-r01-actor" };

describeDb("D5-SEC-R01 — portal sıfırlama: pasif hesap, kapatmada token iptali, kapatma↔sıfırlama yarışı (integration)", () => {
  let module: TestingModule;
  let prisma: PrismaService;
  let portal: PortalService;
  let emailProvider: EmailProviderService;
  const createdTenantIds: string[] = [];
  let tenantId: string;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      imports: [ConfigModule.forRoot({ isGlobal: true }), JwtModule.register({ secret: "d5-sec-r01-test-secret" })],
      providers: [
        PortalService,
        PrismaService,
        AuditService,
        EmailProviderService,
        ConfigService,
        // Kapatma yetkisi bu testin konusu değil (A5 testleri ayrı); yetkili aktör varsayılır.
        { provide: OfficeApprovalService, useValue: { isApproverEligible: async () => true, isApproverEligibleInTx: async () => true } },
      ],
    }).compile();
    prisma = module.get<PrismaService>(PrismaService);
    portal = module.get<PortalService>(PortalService);
    emailProvider = module.get<EmailProviderService>(EmailProviderService);
    const ts = Date.now();
    const tenant = await prisma.tenant.create({ data: { name: `D5-SEC-R01 ${ts}`, slug: `d5-sec-r01-${ts}` } });
    tenantId = tenant.id; createdTenantIds.push(tenant.id);
  });

  afterAll(async () => {
    for (const tid of createdTenantIds) {
      await prisma.auditLog.deleteMany({ where: { tenantId: tid } });
      await prisma.clientPortalUser.deleteMany({ where: { client: { tenantId: tid } } });
      await prisma.client.deleteMany({ where: { tenantId: tid } });
      await prisma.tenant.deleteMany({ where: { id: tid } });
    }
    await module.close();
  });

  /** Aktif portal kullanıcısı + DB'ye doğrudan yazılmış geçerli token (ham değer döner; e-posta yolu kullanılmaz). */
  async function activeUserWithToken(label: string) {
    const ts = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const client = await prisma.client.create({ data: { tenantId, type: "PERSON", displayName: `${label} ${ts}`, hasPortalAccess: true } });
    const raw = generateRawInviteToken();
    const pu = await prisma.clientPortalUser.create({
      data: { clientId: client.id, email: `${label.toLowerCase()}+${ts}@d5-sec-r01.test`, passwordHash: await bcrypt.hash(OLD_PW, 4), isActive: true,
        resetToken: hashInviteToken(raw), resetTokenExp: new Date(Date.now() + 3600_000) },
    });
    return { client, pu, raw };
  }
  const row = (id: string) => prisma.clientPortalUser.findUniqueOrThrow({ where: { id } });

  it("[1] pasif hesap geçerli token ile parola değiştiremez — geçersiz token ile AYNI 400; hiçbir alan yazılmaz", async () => {
    const { pu, raw } = await activeUserWithToken("Pasif");
    // Kapatma yolundan BAĞIMSIZ ölçüm: yalnız isActive=false (token olduğu gibi kalır) → reset WHERE'i isActive'i ayrıca ister.
    await prisma.clientPortalUser.update({ where: { id: pu.id }, data: { isActive: false } });
    const before = await row(pu.id);

    const errInactive = await portal.resetPassword(raw, NEW_PW).catch((e) => e);
    const errRandom = await portal.resetPassword("f".repeat(43), NEW_PW).catch((e) => e);
    expect(errInactive).toBeInstanceOf(BadRequestException);
    expect(errInactive.message).toBe(errRandom.message); // hesap durumu sızdırılmaz

    const after = await row(pu.id);
    expect(await bcrypt.compare(OLD_PW, after.passwordHash)).toBe(true);
    expect(after.tokenVersion).toBe(before.tokenVersion);
    expect(after.resetToken).toBe(before.resetToken);
  });

  it("[2] kapatma bekleyen token'ı AYNI update'te geçersizleştirir; kapatmadan önceki bağlantı tüketilemez", async () => {
    const { client, pu, raw } = await activeUserWithToken("Kapat");
    const v0 = (await row(pu.id)).tokenVersion;

    await portal.disablePortalUser(client.id, tenantId, ACTOR);
    const closed = await row(pu.id);
    expect(closed.isActive).toBe(false);
    expect(closed.resetToken).toBeNull();
    expect(closed.resetTokenExp).toBeNull();
    expect(closed.tokenVersion).toBe(v0 + 1);
    expect((await prisma.client.findUniqueOrThrow({ where: { id: client.id } })).hasPortalAccess).toBe(false);

    await expect(portal.resetPassword(raw, NEW_PW)).rejects.toBeInstanceOf(BadRequestException);
    const after = await row(pu.id);
    expect(await bcrypt.compare(OLD_PW, after.passwordHash)).toBe(true);
    expect(after.tokenVersion).toBe(v0 + 1);
  });

  it("[3] kapatma ↔ sıfırlama eşzamanlı yarışı: her sırada son durum kapalı; 'kapatmadan sonra başarılı sıfırlama' YOK", async () => {
    const ROUNDS = 25;
    const seen = { resetFirst: 0, disableFirst: 0 };
    for (let i = 0; i < ROUNDS; i++) {
      const { client, pu, raw } = await activeUserWithToken(`Yaris${i}`);
      const v0 = (await row(pu.id)).tokenVersion;
      const [r, d] = await Promise.allSettled([portal.resetPassword(raw, NEW_PW), portal.disablePortalUser(client.id, tenantId, ACTOR)]);
      expect(d.status).toBe("fulfilled"); // kapatma her durumda başarılı

      const fin = await row(pu.id);
      expect(fin.isActive).toBe(false);
      expect(fin.resetToken).toBeNull();
      expect(fin.resetTokenExp).toBeNull();
      const newPw = await bcrypt.compare(NEW_PW, fin.passwordHash);
      if (r.status === "fulfilled") {
        // sıfırlama ÖNCE işlendi: parola yeni, sürüm +1 (sıfırlama) +1 (kapatma)
        expect(newPw).toBe(true);
        expect(fin.tokenVersion).toBe(v0 + 2);
        seen.resetFirst++;
      } else {
        // kapatma ÖNCE işlendi: sıfırlama eşleşme bulamadı → aynı 400; parola eski, yalnız kapatmanın +1'i
        expect(r.reason).toBeInstanceOf(BadRequestException);
        expect(newPw).toBe(false);
        expect(await bcrypt.compare(OLD_PW, fin.passwordHash)).toBe(true);
        expect(fin.tokenVersion).toBe(v0 + 1);
        seen.disableFirst++;
      }
    }
    // Ölçülen sıralar raporlanır (iki sıranın da görülmesi garanti DEĞİL; değişmezler her turda doğrulandı).
    // eslint-disable-next-line no-console
    console.log(`[D5-SEC-R01 yarış] tur=${ROUNDS} sıfırlama-önce=${seen.resetFirst} kapatma-önce=${seen.disableFirst}`);
    expect(seen.resetFirst + seen.disableFirst).toBe(ROUNDS);
  }, 120_000);

  /** Bu veritabanında satır kilidi bekleyen oturum sayısı (yarış sırasını belirlenimci kurmak için). */
  async function lockWaiters(): Promise<number> {
    const r = await prisma.$queryRawUnsafe<Array<{ n: bigint }>>(
      "SELECT count(*)::bigint AS n FROM pg_stat_activity WHERE datname = current_database() AND wait_event_type = 'Lock'");
    return Number(r[0].n);
  }
  async function waitForLockWaiters(n: number) {
    for (let i = 0; i < 200; i++) { if ((await lockWaiters()) >= n) return; await new Promise((r) => setTimeout(r, 25)); }
    throw new Error(`kilit bekleyen oturum ${n} olmadı`);
  }

  it("[3b] BELİRLENİMCİ: sıfırlamanın UPDATE'i kapatmanın commit EDİLMEMİŞ satır kilidinin arkasında bekler → kapatma commit → sıfırlama 0 satır (400)", async () => {
    const { client, pu, raw } = await activeUserWithToken("YarisB");
    const v0 = (await row(pu.id)).tokenVersion;
    const audit = module.get<AuditService>(AuditService);
    const orig = audit.logInTransaction.bind(audit);
    let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
    // Kapatma işlemi portal satırını güncelledikten SONRA, commit'ten ÖNCE (audit adımında) bekletilir → satır kilidi tutulur.
    const spy = jest.spyOn(audit, "logInTransaction").mockImplementation(async (tx: any, input: any) => { await gate; return orig(tx, input); });
    try {
      const disableP = portal.disablePortalUser(client.id, tenantId, ACTOR);
      // kapatma satırı kilitleyene kadar bekle (audit'e ulaştı = updateMany yapıldı)
      for (let i = 0; i < 200 && spy.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
      expect(spy).toHaveBeenCalled();
      const resetP = portal.resetPassword(raw, NEW_PW).catch((e) => e);
      await waitForLockWaiters(1); // sıfırlamanın UPDATE'i kilitte bekliyor
      release();
      await disableP;
      const resetRes = await resetP;
      expect(resetRes).toBeInstanceOf(BadRequestException); // commit sonrası WHERE yeniden değerlendirildi: token yok, pasif
    } finally { spy.mockRestore(); release(); }
    const fin = await row(pu.id);
    expect(fin.isActive).toBe(false);
    expect(fin.resetToken).toBeNull();
    expect(fin.tokenVersion).toBe(v0 + 1);
    expect(await bcrypt.compare(OLD_PW, fin.passwordHash)).toBe(true);
  }, 60_000);

  it("[3c] BELİRLENİMCİ: sıfırlama kilitte ÖNCE sıraya girer, kapatma arkasında → sıfırlama geçer, kapatma sonra kapatır (son durum yine kapalı, +2)", async () => {
    const { client, pu, raw } = await activeUserWithToken("YarisC");
    const v0 = (await row(pu.id)).tokenVersion;
    let unlock!: () => void; const held = new Promise<void>((r) => { unlock = r; });
    let locked!: () => void; const lockedP = new Promise<void>((r) => { locked = r; });
    // Dış işlem satırı kilitler; önce sıfırlama, sonra kapatma aynı satırda sıraya girer; kilit bırakılınca sıra korunur.
    const holder = prisma.$transaction(async (tx) => {
      await tx.$queryRawUnsafe(`SELECT id FROM "ClientPortalUser" WHERE id = $1 FOR UPDATE`, pu.id);
      locked(); await held;
    }, { timeout: 30_000 });
    await lockedP;
    const resetP = portal.resetPassword(raw, NEW_PW).catch((e) => e);
    await waitForLockWaiters(1);
    const disableP = portal.disablePortalUser(client.id, tenantId, ACTOR);
    await waitForLockWaiters(2);
    unlock(); await holder;
    const resetRes = await resetP; await disableP;
    expect(resetRes).toEqual({ success: true });
    const fin = await row(pu.id);
    expect(fin.isActive).toBe(false);
    expect(fin.resetToken).toBeNull();
    expect(fin.tokenVersion).toBe(v0 + 2);
    expect(await bcrypt.compare(NEW_PW, fin.passwordHash)).toBe(true);
  }, 60_000);

  /** Token'sız aktif hesap (talep yolu için). */
  async function activeUserNoToken(label: string) {
    const ts = `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    const client = await prisma.client.create({ data: { tenantId, type: "PERSON", displayName: `${label} ${ts}`, hasPortalAccess: true } });
    const pu = await prisma.clientPortalUser.create({
      data: { clientId: client.id, email: `${label.toLowerCase()}+${ts}@d5-sec-r01.test`, passwordHash: await bcrypt.hash(OLD_PW, 4), isActive: true },
    });
    return { client, pu };
  }
  /** E-posta gönderimini yakalar (gerçek gönderim YOK); ham token bağlantının fragment'ından çıkarılır. */
  function captureSends() {
    const sends: string[] = [];
    const spy = jest.spyOn(emailProvider, "send").mockImplementation(async (opts: any) => {
      const m = /token=([A-Za-z0-9_-]+)/.exec(String(opts.text)); sends.push(m ? m[1] : "");
      return { success: true, provider: "mock", messageId: "D5-SPY" } as any;
    });
    return { sends, restore: () => spy.mockRestore() };
  }

  it("[6a] BELİRLENİMCİ talep↔kapatma: talep aktif hesabı OKUDUKTAN sonra kapatma commit olur → pasif hesaba token YAZILMAZ, e-posta GÖNDERİLMEZ", async () => {
    const { client, pu } = await activeUserNoToken("TalepA");
    const audit = module.get<AuditService>(AuditService);
    const orig = audit.logInTransaction.bind(audit);
    let release!: () => void; const gate = new Promise<void>((r) => { release = r; });
    const spy = jest.spyOn(audit, "logInTransaction").mockImplementation(async (tx: any, input: any) => { await gate; return orig(tx, input); });
    const cap = captureSends();
    let talepRes: any;
    try {
      const disableP = portal.disablePortalUser(client.id, tenantId, ACTOR);
      for (let i = 0; i < 200 && spy.mock.calls.length === 0; i++) await new Promise((r) => setTimeout(r, 10));
      expect(spy).toHaveBeenCalled(); // kapatma satırı güncelledi, commit ETMEDİ (kilit tutuluyor)
      const talepP = portal.createResetToken(pu.email); // okuma: son commit'li sürüm (aktif) → yazma kilitte bekler
      await waitForLockWaiters(1);
      release();
      await disableP;
      talepRes = await talepP;
    } finally { spy.mockRestore(); release(); cap.restore(); }
    // Ölçüm (iddialardan ÖNCE): e-posta gönderimi ve token geçerliliği AYRI kaydedilir.
    const pre = await row(pu.id);
    const usable = cap.sends[0] ? await portal.resetPassword(cap.sends[0], NEW_PW).then(() => true, () => false) : null;
    // eslint-disable-next-line no-console
    console.log(`[D5 talep↔kapatma 6a] e-posta=${cap.sends.length} · pasif hesapta token=${pre.resetToken !== null} · bağlantı kullanılabilir=${usable}`);
    expect(talepRes).toEqual({ success: true }); // dış cevap değişmez (enumeration-safe)
    const fin = await row(pu.id);
    expect(fin.isActive).toBe(false);
    expect(fin.resetToken).toBeNull();      // pasif hesaba token YAZILMADI
    expect(fin.resetTokenExp).toBeNull();
    expect(cap.sends.length).toBe(0);       // e-posta GÖNDERİLMEDİ
  }, 60_000);

  it("[6b] BELİRLENİMCİ talep önce sıraya girer, kapatma arkasında: token yazılır ve e-posta gider, sonra kapatma token'ı SİLER → bağlantı kullanılamaz", async () => {
    const { client, pu } = await activeUserNoToken("TalepB");
    const cap = captureSends();
    let unlock!: () => void; const held = new Promise<void>((r) => { unlock = r; });
    let locked!: () => void; const lockedP = new Promise<void>((r) => { locked = r; });
    try {
      const holder = prisma.$transaction(async (tx) => {
        await tx.$queryRawUnsafe(`SELECT id FROM "ClientPortalUser" WHERE id = $1 FOR UPDATE`, pu.id);
        locked(); await held;
      }, { timeout: 30_000 });
      await lockedP;
      const talepP = portal.createResetToken(pu.email);
      await waitForLockWaiters(1);
      const disableP = portal.disablePortalUser(client.id, tenantId, ACTOR);
      await waitForLockWaiters(2);
      unlock(); await holder;
      expect(await talepP).toEqual({ success: true });
      await disableP;
    } finally { cap.restore(); unlock(); }
    // E-posta ile token geçerliliği AYRI: e-posta gitti, token kapanışla öldü.
    expect(cap.sends.length).toBe(1);
    const fin = await row(pu.id);
    expect(fin.isActive).toBe(false);
    expect(fin.resetToken).toBeNull();
    expect(fin.resetTokenExp).toBeNull();
    await expect(portal.resetPassword(cap.sends[0], NEW_PW)).rejects.toBeInstanceOf(BadRequestException);
    expect(await bcrypt.compare(OLD_PW, (await row(pu.id)).passwordHash)).toBe(true);
  }, 60_000);

  it("[4] tek kullanım + tokenVersion güvencesi korunur (aktif hesap)", async () => {
    const { pu, raw } = await activeUserWithToken("TekKullanim");
    const v0 = (await row(pu.id)).tokenVersion;
    await expect(portal.resetPassword(raw, NEW_PW)).resolves.toEqual({ success: true });
    const r1 = await row(pu.id);
    expect(r1.tokenVersion).toBe(v0 + 1);
    expect(r1.resetToken).toBeNull();
    await expect(portal.resetPassword(raw, "UcuncuSifre789")).rejects.toBeInstanceOf(BadRequestException);
    const r2 = await row(pu.id);
    expect(r2.tokenVersion).toBe(v0 + 1);
    expect(await bcrypt.compare(NEW_PW, r2.passwordHash)).toBe(true);
  });

  it("[5] politika dışı parola token'ı TÜKETMEZ; aynı token geçerli parolayla sonra kullanılabilir", async () => {
    const { pu, raw } = await activeUserWithToken("Politika");
    const v0 = (await row(pu.id)).tokenVersion;
    await expect(portal.resetPassword(raw, "kisa7ch")).rejects.toBeInstanceOf(BadRequestException);
    const mid = await row(pu.id);
    expect(mid.resetToken).not.toBeNull();
    expect(mid.tokenVersion).toBe(v0);
    expect(await bcrypt.compare(OLD_PW, mid.passwordHash)).toBe(true);
    await expect(portal.resetPassword(raw, NEW_PW)).resolves.toEqual({ success: true });
    expect((await row(pu.id)).tokenVersion).toBe(v0 + 1);
    void emailProvider;
  });
});

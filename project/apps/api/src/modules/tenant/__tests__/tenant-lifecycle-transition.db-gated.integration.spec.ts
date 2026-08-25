/**
 * C15-S1-MODIFIED PR-3 — Transition otoritesi (GERÇEK Postgres 16).
 *
 * GATE: describeDb → DATABASE_URL yoksa SKIP.
 *
 * Bu suite'in ayırt edici kanıtları:
 *   1) DETERMİNİSTİK eşzamanlılık — baraj deseni: bir tutucu transaction advisory
 *      kilidi alır, İKİ servis çağrısı aynı anda fırlatılır ve kilitte bloklanır,
 *      baraj kalkınca kilit ikisini SERİLEŞTİRİR. Kanıt: tam biri changed=true,
 *      diğeri temiz no-op (changed=false) ve TAM 1 audit satırı.
 *      Kilit satırı kaldırılırsa (mutasyon) ikinci çağrı bayat `from` okur ve
 *      CAS hatasına düşer -> bu test DÜŞER.
 *   2) BUSY yolu — kilit 3000ms pencerede alınamazsa LifecycleTransitionBusyError;
 *      tek deneme (süre ~3s, ~6s/9s DEĞİL -> retry olmadığının ölçümü); yazım 0.
 *      Kilit satırı kaldırılırsa servis kilide hiç uğramaz ve geçiş BAŞARIR ->
 *      bu test DÜŞER (kilit-kaldırma mutasyonunun deterministik katili).
 *   3) Audit-rollback — logInTransaction fırlatırsa CAS UPDATE gerçekleşmiş olsa
 *      bile Tenant satırı DEĞİŞMEZ (transaction rollback'inin DB'de kanıtı).
 *      NOT: "CAS count != 1 -> rollback" yolunun birim kanıtı unit spec'tedir;
 *      buradaki audit-rollback testi AYNI mekanizmayı (tx içi throw -> satır
 *      değişmedi) gerçek DB'de kanıtlar.
 *
 * Kendi yarattığı tenant'ları ve audit kayıtlarını temizler; başkasına DOKUNMAZ.
 * Test fixture'ları lifecycle'ı doğrudan prisma ile kurar — governance-writer
 * kapısı __tests__ dizinini taramaz; üretim yazarı teklidir.
 */

import { describeDb } from "../../../../test/describe-db";
import { PrismaService } from "@/prisma/prisma.service";
import { AuditService } from "../../audit/audit.service";
import {
  LIFECYCLE_LOCK_TIMEOUT_MS,
  TenantLifecycleTransitionService,
} from "../tenant-lifecycle-transition.service";
import {
  LifecycleSafetyCriticalEdgeWithheldError,
  LifecycleTransitionBusyError,
} from "../tenant-lifecycle-errors";

const LOCK_KEY = (tenantId: string): string => `tenant-lifecycle|${tenantId}|transition`;

describeDb("C15-S1-MODIFIED PR-3 — transition otoritesi (integration, PG16)", () => {
  let prisma: PrismaService;
  let svc: TenantLifecycleTransitionService;
  const createdTenantIds: string[] = [];

  const yeniTenant = async (lifecycle: string, ek: string): Promise<string> => {
    const t = await prisma.tenant.create({
      data: {
        name: `C15 PR3 ${ek}`,
        slug: `c15-pr3-${ek}-${Date.now()}-${Math.floor(Math.random() * 1e6)}`,
      },
    });
    createdTenantIds.push(t.id);
    if (lifecycle !== "ACTIVE") {
      // Fixture kurulumu: teste özel durum, üretim yazarı DEĞİL.
      await prisma.$executeRawUnsafe(
        `UPDATE "Tenant" SET "lifecycle" = '${lifecycle}'::"TenantLifecycle" WHERE "id" = '${t.id}'`,
      );
    }
    return t.id;
  };

  const tenantOku = (id: string) =>
    prisma.tenant.findUniqueOrThrow({
      where: { id },
      select: {
        lifecycle: true,
        lifecycleTarget: true,
        lifecycleChangedAt: true,
        lifecycleReason: true,
        quiesceToken: true,
      },
    });

  const auditSay = (tenantId: string) =>
    prisma.auditLog.count({ where: { tenantId, reasonCode: "TENANT_LIFECYCLE_TRANSITION" } });

  /**
   * Baraj: ayrı bir interactive transaction tenant'ın advisory kilidini tutar;
   * `release()` çağrılana kadar bırakmaz. Servis çağrıları bu sırada kilitte bloklanır.
   */
  const barajKur = async (tenantId: string) => {
    let release!: () => void;
    const released = new Promise<void>((r) => (release = r));
    let acquired!: () => void;
    const acquiredP = new Promise<void>((r) => (acquired = r));
    const done = prisma.$transaction(
      async (tx) => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${LOCK_KEY(tenantId)}, 0))`;
        acquired();
        await released;
      },
      { timeout: 60_000, maxWait: 60_000 },
    );
    await acquiredP;
    return { release, done };
  };

  beforeAll(async () => {
    prisma = new PrismaService();
    await prisma.$connect();
    svc = new TenantLifecycleTransitionService(prisma, new AuditService(prisma));
  });

  afterAll(async () => {
    if (createdTenantIds.length > 0) {
      await prisma.auditLog.deleteMany({ where: { tenantId: { in: createdTenantIds } } });
      await prisma.tenant.deleteMany({ where: { id: { in: createdTenantIds } } });
    }
    await prisma.$disconnect();
  });

  // -- gerçek geçişler ------------------------------------------------------

  it("ACTIVE -> QUIESCING -> ACTIVE tam turu: kolonlar, token ve TAM 2 audit satırı", async () => {
    const id = await yeniTenant("ACTIVE", "tur");

    const r1 = await svc.transition({
      tenantId: id,
      to: "QUIESCING",
      reason: "  kapanış hazırlığı  ",
      target: "SUSPENDED",
    });
    expect(r1).toMatchObject({ changed: true, from: "ACTIVE", to: "QUIESCING" });

    const t1 = await tenantOku(id);
    expect(t1.lifecycle).toBe("QUIESCING");
    expect(t1.lifecycleTarget).toBe("SUSPENDED");
    expect(t1.lifecycleReason).toBe("kapanış hazırlığı"); // TRIM edilmiş hâli yazılır
    expect(t1.quiesceToken).toMatch(/^[0-9a-f-]{36}$/);
    expect(t1.lifecycleChangedAt).toBeInstanceOf(Date);

    const r2 = await svc.transition({ tenantId: id, to: "ACTIVE", reason: "geri açma" });
    expect(r2).toMatchObject({ changed: true, from: "QUIESCING", to: "ACTIVE" });

    const t2 = await tenantOku(id);
    expect(t2.lifecycle).toBe("ACTIVE");
    expect(t2.lifecycleTarget).toBeNull();
    expect(t2.quiesceToken).toBeNull(); // çıkışta temizlenir
    // clock_timestamp sıralı: ikinci damga birinciden SONRA.
    expect(t2.lifecycleChangedAt!.getTime()).toBeGreaterThan(t1.lifecycleChangedAt!.getTime());

    expect(await auditSay(id)).toBe(2);
    const kayitlar = await prisma.auditLog.findMany({
      where: { tenantId: id, reasonCode: "TENANT_LIFECYCLE_TRANSITION" },
      orderBy: { createdAt: "asc" },
    });
    expect(kayitlar[0]).toMatchObject({
      action: "UPDATE",
      entityType: "TENANT",
      entityId: id,
      actorType: "SYSTEM",
      description: "kapanış hazırlığı",
      userId: null, // aktör kimliği uydurulmadı
    });
    expect(kayitlar[0].oldValues).toMatchObject({ lifecycle: "ACTIVE" });
    expect(kayitlar[0].newValues).toMatchObject({ lifecycle: "QUIESCING", lifecycleTarget: "SUSPENDED" });
  }, 60_000);

  // -- same-state no-op -----------------------------------------------------

  it("same-state: changed=false; HİÇBİR kolon, timestamp veya audit değişmez", async () => {
    const id = await yeniTenant("ACTIVE", "noop");
    await svc.transition({ tenantId: id, to: "QUIESCING", reason: "önce gerçek geçiş", target: "SUSPENDED" });
    const once = await tenantOku(id);
    const auditOnce = await auditSay(id);

    const r = await svc.transition({ tenantId: id, to: "QUIESCING" }); // reason YOK — istenmez
    expect(r).toEqual({ changed: false, from: "QUIESCING", to: "QUIESCING", changedAt: null });

    const sonra = await tenantOku(id);
    expect(sonra).toEqual(once); // lifecycleChangedAt/reason/target/token dahil AYNEN
    expect(await auditSay(id)).toBe(auditOnce);
  }, 60_000);

  // -- withheld kenarlar ----------------------------------------------------

  it("üç withheld kenar her quiesceToken varyantında reddedilir; yazım 0", async () => {
    const varyantlar: Array<{ token: string | null; ad: string }> = [
      { token: null, ad: "null" },
      { token: "gecerli-gorunumlu-token", ad: "dolu" },
      { token: "", ad: "bos-string" },
    ];
    for (const { token, ad } of varyantlar) {
      // PROVISIONING -> ACTIVE
      const p = await yeniTenant("PROVISIONING", `wh-pa-${ad}`);
      await prisma.$executeRawUnsafe(
        `UPDATE "Tenant" SET "quiesceToken" = ${token === null ? "NULL" : `'${token}'`} WHERE "id" = '${p}'`,
      );
      await expect(
        svc.transition({ tenantId: p, to: "ACTIVE", reason: "readiness kanıtı yokken açılmamalı" }),
      ).rejects.toBeInstanceOf(LifecycleSafetyCriticalEdgeWithheldError);
      expect((await tenantOku(p)).lifecycle).toBe("PROVISIONING");
      expect(await auditSay(p)).toBe(0);

      // QUIESCING -> SUSPENDED ve QUIESCING -> RETIRED
      for (const to of ["SUSPENDED", "RETIRED"] as const) {
        const q = await yeniTenant("QUIESCING", `wh-${to.toLowerCase()}-${ad}`);
        await prisma.$executeRawUnsafe(
          `UPDATE "Tenant" SET "quiesceToken" = ${token === null ? "NULL" : `'${token}'`} WHERE "id" = '${q}'`,
        );
        await expect(
          svc.transition({ tenantId: q, to, reason: "drain kanıtı yokken kapanmamalı" }),
        ).rejects.toBeInstanceOf(LifecycleSafetyCriticalEdgeWithheldError);
        expect((await tenantOku(q)).lifecycle).toBe("QUIESCING");
        expect(await auditSay(q)).toBe(0);
      }
    }
  }, 120_000);

  // -- deterministik eşzamanlılık -------------------------------------------

  it("İKİ bağımsız bağlantı, baraj deseniyle eşzamanlı: TAM biri yazar, diğeri temiz no-op; TAM 1 audit", async () => {
    const id = await yeniTenant("ACTIVE", "concur");
    const digerBaglanti = new PrismaService();
    await digerBaglanti.$connect();
    try {
      const digerSvc = new TenantLifecycleTransitionService(
        digerBaglanti,
        new AuditService(digerBaglanti),
      );

      // Baraj kilidi tut -> iki çağrı da kilitte BLOKLANIR (eşzamanlılık garanti).
      const baraj = await barajKur(id);
      const pA = svc.transition({ tenantId: id, to: "QUIESCING", reason: "eşzamanlı A", target: "SUSPENDED" });
      const pB = digerSvc.transition({ tenantId: id, to: "QUIESCING", reason: "eşzamanlı B", target: "SUSPENDED" });
      // İkisinin de kilit kuyruğuna girmesi için kısa bekleme; sonra baraj kalkar.
      await new Promise((r) => setTimeout(r, 400));
      baraj.release();
      await baraj.done;

      const [rA, rB] = await Promise.all([pA, pB]);
      const degisen = [rA, rB].filter((r) => r.changed);
      const noop = [rA, rB].filter((r) => !r.changed);
      // Kilit SERİLEŞTİRDİ: ikinci çağrı TAZE durumu (QUIESCING) okudu ve temiz
      // no-op'a düştü. Kilit olmasaydı ikisi de ACTIVE okur, biri CAS hatası alırdı
      // ve bu assertion'lar düşerdi.
      expect(degisen).toHaveLength(1);
      expect(noop).toHaveLength(1);
      expect(noop[0]).toMatchObject({ from: "QUIESCING", to: "QUIESCING" });

      expect((await tenantOku(id)).lifecycle).toBe("QUIESCING");
      expect(await auditSay(id)).toBe(1); // çift yazım YOK
    } finally {
      await digerBaglanti.$disconnect();
    }
  }, 60_000);

  // -- busy / lock_timeout --------------------------------------------------

  it("kilit tutulurken çağrı ~3000ms'de LifecycleTransitionBusyError alır; TEK deneme; yazım 0", async () => {
    const id = await yeniTenant("ACTIVE", "busy");
    const baraj = await barajKur(id);
    try {
      const t0 = Date.now();
      await expect(
        svc.transition({ tenantId: id, to: "QUIESCING", reason: "busy beklenir", target: "SUSPENDED" }),
      ).rejects.toBeInstanceOf(LifecycleTransitionBusyError);
      const gecen = Date.now() - t0;
      // Tek deneme kanıtı: süre BİR lock_timeout penceresi civarında (retry olsaydı
      // ~2x/3x pencere görülürdü). Alt sınır: pencerenin %90'ı; üst sınır: 2 pencere.
      expect(gecen).toBeGreaterThanOrEqual(LIFECYCLE_LOCK_TIMEOUT_MS * 0.9);
      expect(gecen).toBeLessThan(LIFECYCLE_LOCK_TIMEOUT_MS * 2);

      expect((await tenantOku(id)).lifecycle).toBe("ACTIVE"); // yazım 0
      expect(await auditSay(id)).toBe(0);
    } finally {
      baraj.release();
      await baraj.done;
    }
  }, 60_000);

  // -- audit-rollback -------------------------------------------------------

  it("audit yazımı başarısızsa CAS UPDATE gerçekleşmiş olsa bile Tenant satırı DEĞİŞMEZ (rollback)", async () => {
    const id = await yeniTenant("ACTIVE", "auditfail");
    const patlayanAudit = {
      logInTransaction: async () => {
        throw new Error("audit yazılamadı (simülasyon)");
      },
    };
    const kirikSvc = new TenantLifecycleTransitionService(prisma, patlayanAudit as never);

    await expect(
      kirikSvc.transition({ tenantId: id, to: "QUIESCING", reason: "rollback beklenir", target: "SUSPENDED" }),
    ).rejects.toThrow("audit yazılamadı");

    const t = await tenantOku(id);
    expect(t.lifecycle).toBe("ACTIVE"); // UPDATE koşmuştu; rollback geri aldı
    expect(t.lifecycleReason).toBeNull();
    expect(t.lifecycleChangedAt).toBeNull();
    expect(t.quiesceToken).toBeNull();
    expect(await auditSay(id)).toBe(0);
  }, 60_000);

  // -- 55P03 eşlemesinin gerçekliği -----------------------------------------

  it("BusyError yalnız 55P03'ten üretilir: kilit yokken aynı çağrı sorunsuz geçer", async () => {
    const id = await yeniTenant("ACTIVE", "no-busy");
    // Baraj YOK: kilit anında alınır, timeout tetiklenmez, geçiş başarılır.
    const r = await svc.transition({ tenantId: id, to: "QUIESCING", reason: "serbest", target: "RETIRED" });
    expect(r.changed).toBe(true);
  }, 60_000);
});

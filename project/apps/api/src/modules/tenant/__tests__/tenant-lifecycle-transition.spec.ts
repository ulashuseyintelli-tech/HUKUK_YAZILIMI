/**
 * C15-S1-MODIFIED PR-3 — Transition servisi birim sözleşmesi (DB YOK).
 *
 * Mock'lar Prisma'nın interactive-transaction şeklini taklit eder. Kilit/CAS/audit
 * ROLLBACK davranışının GERÇEK kanıtı db-gated spec'tedir; burada kilitlenen şey
 * karar SIRASI ve yazım/audit ÇAĞRILARININ yapılıp yapılmadığıdır — testler mock'un
 * dönüş değerine değil, ÇAĞRI ARGÜMANLARINA bakar.
 */

import {
  LIFECYCLE_LOCK_TIMEOUT_MS,
  TenantLifecycleTransitionService,
} from "../tenant-lifecycle-transition.service";
import {
  InvalidLifecycleReasonError,
  InvalidLifecycleTargetError,
  InvalidLifecycleTransitionError,
  LifecycleConcurrentModificationError,
  LifecycleSafetyCriticalEdgeWithheldError,
  TenantNotFoundError,
} from "../tenant-lifecycle-errors";

interface TxMock {
  $executeRawUnsafe: jest.Mock;
  $executeRaw: jest.Mock;
  $queryRaw: jest.Mock;
  tenant: { findUnique: jest.Mock };
}

function kur(opts: {
  tenant?: { id: string; lifecycle: string; lifecycleTarget: string | null } | null;
  casRows?: Array<{ lifecycleChangedAt: Date }>;
}) {
  const tx: TxMock = {
    $executeRawUnsafe: jest.fn().mockResolvedValue(0),
    // advisory lock $executeRaw ile gider (fonksiyon void döner; $queryRaw void
    // kolonu deserialize edemez — db-gated suite'te ölçüldü).
    $executeRaw: jest.fn().mockResolvedValue(1),
    // $queryRaw yalnız CAS UPDATE..RETURNING için çağrılır.
    $queryRaw: jest
      .fn()
      .mockResolvedValue(opts.casRows ?? [{ lifecycleChangedAt: new Date("2026-08-25T12:00:00Z") }]),
    tenant: {
      findUnique: jest.fn().mockResolvedValue(opts.tenant === undefined ? null : opts.tenant),
    },
  };
  const prisma = {
    $transaction: jest.fn(async (fn: (t: TxMock) => Promise<unknown>) => fn(tx)),
  };
  const audit = { logInTransaction: jest.fn().mockResolvedValue(undefined) };
  const svc = new TenantLifecycleTransitionService(prisma as never, audit as never);
  return { svc, tx, prisma, audit };
}

const AKTIF = { id: "T1", lifecycle: "ACTIVE", lifecycleTarget: null };
const QUIESCING = { id: "T1", lifecycle: "QUIESCING", lifecycleTarget: "SUSPENDED" };
const PROVISIONING = { id: "T1", lifecycle: "PROVISIONING", lifecycleTarget: null };

describe("C15-S1-MODIFIED PR-3 — transition servisi birim sözleşmesi", () => {
  describe("başarılı geçiş", () => {
    it("ACTIVE -> QUIESCING: lock_timeout + kilit + taze SELECT + CAS + audit sırası", async () => {
      const { svc, tx, audit } = kur({ tenant: AKTIF });
      const r = await svc.transition({
        tenantId: "T1",
        to: "QUIESCING",
        reason: "kapanış hazırlığı",
        target: "SUSPENDED",
      });
      expect(r).toMatchObject({ changed: true, from: "ACTIVE", to: "QUIESCING" });
      expect(r.changedAt).toBeInstanceOf(Date);

      // 0) lock_timeout konfigürasyonu — tam değerle.
      expect(tx.$executeRawUnsafe).toHaveBeenCalledWith(
        `SET LOCAL lock_timeout = '${LIFECYCLE_LOCK_TIMEOUT_MS}ms'`,
      );
      // 1) kilit, SELECT'ten ÖNCE (çağrı sırası invocationCallOrder ile).
      const kilitSira = tx.$executeRaw.mock.invocationCallOrder[0];
      const selectSira = tx.tenant.findUnique.mock.invocationCallOrder[0];
      expect(kilitSira).toBeLessThan(selectSira);
      // Kilit sorgusu domain-separated anahtarı taşır.
      const kilitTemplate = tx.$executeRaw.mock.calls[0][0].join("?");
      expect(kilitTemplate).toContain("pg_advisory_xact_lock(hashtextextended(");
      expect(tx.$executeRaw.mock.calls[0][1]).toBe("tenant-lifecycle|T1|transition");
      // CAS sorgusu: WHERE id + mevcut lifecycle, clock_timestamp, RETURNING.
      const casTemplate = tx.$queryRaw.mock.calls[0][0].join("?");
      expect(casTemplate).toContain('UPDATE "Tenant"');
      expect(casTemplate).toContain("clock_timestamp()");
      expect(casTemplate).toContain('AND "lifecycle" = CAST(');
      expect(casTemplate).toContain('RETURNING "lifecycleChangedAt"');
      // CAS parametreleri: to, reason(trim), target, quiesceToken(uuid), id, from.
      const casArgs = tx.$queryRaw.mock.calls[0].slice(1);
      expect(casArgs).toContain("QUIESCING");
      expect(casArgs).toContain("kapanış hazırlığı");
      expect(casArgs).toContain("SUSPENDED");
      expect(casArgs).toContain("ACTIVE");
      // Audit AYNI tx client'ıyla ve doğru şekille çağrıldı.
      expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
      const [auditTx, auditInput] = audit.logInTransaction.mock.calls[0];
      expect(auditTx).toBe(tx);
      expect(auditInput).toMatchObject({
        tenantId: "T1",
        action: "UPDATE",
        entityType: "TENANT",
        actorType: "SYSTEM",
        reasonCode: "TENANT_LIFECYCLE_TRANSITION",
        oldValues: { lifecycle: "ACTIVE" },
        newValues: { lifecycle: "QUIESCING", lifecycleTarget: "SUSPENDED" },
        description: "kapanış hazırlığı",
      });
      // Operatör yüzeyi yokken aktör kimliği UYDURULMAZ.
      expect(auditInput.userId).toBeUndefined();
      expect(auditInput.userName).toBeUndefined();
    });

    it("QUIESCING'e girişte quiesceToken üretilir; QUIESCING -> ACTIVE çıkışta temizlenir", async () => {
      const giris = kur({ tenant: AKTIF });
      await giris.svc.transition({ tenantId: "T1", to: "QUIESCING", reason: "r", target: "RETIRED" });
      const girisArgs = giris.tx.$queryRaw.mock.calls[0].slice(1);
      expect(girisArgs.some((a: unknown) => typeof a === "string" && /^[0-9a-f-]{36}$/.test(a))).toBe(true);

      const cikis = kur({ tenant: QUIESCING });
      await cikis.svc.transition({ tenantId: "T1", to: "ACTIVE", reason: "geri açma" });
      const cikisArgs = cikis.tx.$queryRaw.mock.calls[0].slice(1);
      expect(cikisArgs.some((a: unknown) => typeof a === "string" && /^[0-9a-f-]{36}$/.test(a))).toBe(false);
      // ACTIVE hedef almaz: target NULL yazılır.
      expect(cikisArgs).toContain(null);
    });
  });

  describe("same-state NO-OP", () => {
    it("changed=false; UPDATE 0, audit 0, reason istenmez — karar kilit+SELECT SONRASI", async () => {
      const { svc, tx, audit } = kur({ tenant: AKTIF });
      const r = await svc.transition({ tenantId: "T1", to: "ACTIVE" }); // reason YOK
      expect(r).toEqual({ changed: false, from: "ACTIVE", to: "ACTIVE", changedAt: null });
      // Kilit ve taze SELECT YAPILDI (no-op kararı sonrasına ait).
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // kilit alındı
      expect(tx.$queryRaw).not.toHaveBeenCalled();     // CAS YOK
      expect(tx.tenant.findUnique).toHaveBeenCalledTimes(1);
      expect(audit.logInTransaction).not.toHaveBeenCalled();
    });

    it("no-op'ta verilen reason da yazım tetiklemez", async () => {
      const { svc, tx, audit } = kur({ tenant: QUIESCING });
      const r = await svc.transition({ tenantId: "T1", to: "QUIESCING", reason: "gereksiz" });
      expect(r.changed).toBe(false);
      expect(tx.$queryRaw).not.toHaveBeenCalled(); // CAS YOK
      expect(audit.logInTransaction).not.toHaveBeenCalled();
    });
  });

  describe("alıkonan güvenlik-kritik kenarlar — KOŞULSUZ red", () => {
    const durumlar = [
      { tenant: PROVISIONING, to: "ACTIVE" as const },
      { tenant: QUIESCING, to: "SUSPENDED" as const },
      { tenant: QUIESCING, to: "RETIRED" as const },
    ];
    it.each(durumlar)("$tenant.lifecycle -> $to ayrı tipli hatayla reddedilir; yazım 0", async ({ tenant, to }) => {
      const { svc, tx, audit } = kur({ tenant });
      const p = svc.transition({ tenantId: "T1", to, reason: "denenmemeli" });
      await expect(p).rejects.toBeInstanceOf(LifecycleSafetyCriticalEdgeWithheldError);
      // InvalidLifecycleTransitionError DEĞİL — çağıran tip ayrımı yapabilmeli.
      await expect(p).rejects.not.toBeInstanceOf(InvalidLifecycleTransitionError);
      expect(tx.$executeRaw).toHaveBeenCalledTimes(1); // kilit alındı
      expect(tx.$queryRaw).not.toHaveBeenCalled();      // CAS YOK
      expect(audit.logInTransaction).not.toHaveBeenCalled();
    });

    it("PR-1 tablosu izin verse bile PROVISIONING -> ACTIVE reddedilir (varsayım açıkça sabitlenir)", async () => {
      // Bu kenar PR-1'de İZİNLİDİR; PR-3 yine de reddeder — readiness kanıt üreticisi yok.
      const { svc } = kur({ tenant: PROVISIONING });
      await expect(
        svc.transition({ tenantId: "T1", to: "ACTIVE", reason: "readiness yokken açılmamalı" }),
      ).rejects.toBeInstanceOf(LifecycleSafetyCriticalEdgeWithheldError);
    });
  });

  describe("doğrulama redleri (yazım 0)", () => {
    it("tenant yok -> TenantNotFoundError", async () => {
      const { svc, audit } = kur({ tenant: null });
      await expect(svc.transition({ tenantId: "YOK", to: "QUIESCING", reason: "r" })).rejects.toBeInstanceOf(
        TenantNotFoundError,
      );
      expect(audit.logInTransaction).not.toHaveBeenCalled();
    });

    it("tablo dışı geçiş (ACTIVE -> SUSPENDED doğrudan) -> InvalidLifecycleTransitionError", async () => {
      const { svc } = kur({ tenant: AKTIF });
      await expect(
        svc.transition({ tenantId: "T1", to: "SUSPENDED", reason: "dogrudan olmaz" }),
      ).rejects.toBeInstanceOf(InvalidLifecycleTransitionError);
    });

    it("gerçek geçişte reason zorunlu ve doğrulanır", async () => {
      const { svc } = kur({ tenant: AKTIF });
      await expect(
        svc.transition({ tenantId: "T1", to: "QUIESCING", target: "SUSPENDED" }),
      ).rejects.toBeInstanceOf(InvalidLifecycleReasonError);
      const { svc: svc2 } = kur({ tenant: AKTIF });
      await expect(
        svc2.transition({ tenantId: "T1", to: "QUIESCING", reason: "   ", target: "SUSPENDED" }),
      ).rejects.toBeInstanceOf(InvalidLifecycleReasonError);
    });

    it("QUIESCING hedefsiz veya geçersiz hedefle reddedilir; hedef almayan durum hedefle reddedilir", async () => {
      const a = kur({ tenant: AKTIF });
      await expect(a.svc.transition({ tenantId: "T1", to: "QUIESCING", reason: "r" })).rejects.toBeInstanceOf(
        InvalidLifecycleTargetError,
      );
      const b = kur({ tenant: AKTIF });
      await expect(
        b.svc.transition({ tenantId: "T1", to: "QUIESCING", reason: "r", target: "ACTIVE" }),
      ).rejects.toBeInstanceOf(InvalidLifecycleTargetError);
      const c = kur({ tenant: QUIESCING });
      await expect(
        c.svc.transition({ tenantId: "T1", to: "ACTIVE", reason: "r", target: "SUSPENDED" }),
      ).rejects.toBeInstanceOf(InvalidLifecycleTargetError);
    });
  });

  describe("CAS başarısızlığı", () => {
    it("etkilenen satır 0 -> LifecycleConcurrentModificationError (audit ÇAĞRILMAZ)", async () => {
      const { svc, audit } = kur({ tenant: AKTIF, casRows: [] });
      await expect(
        svc.transition({ tenantId: "T1", to: "QUIESCING", reason: "r", target: "SUSPENDED" }),
      ).rejects.toBeInstanceOf(LifecycleConcurrentModificationError);
      expect(audit.logInTransaction).not.toHaveBeenCalled();
    });
  });

  describe("audit hatası yayılır (rollback'in birim yüzü)", () => {
    it("logInTransaction fırlatırsa transition da fırlatır", async () => {
      const { svc, audit } = kur({ tenant: AKTIF });
      audit.logInTransaction.mockRejectedValueOnce(new Error("audit yazılamadı"));
      await expect(
        svc.transition({ tenantId: "T1", to: "QUIESCING", reason: "r", target: "SUSPENDED" }),
      ).rejects.toThrow("audit yazılamadı");
    });
  });

  describe("retry yasağı", () => {
    it("$transaction TAM BİR kez çağrılır — busy dahil hiçbir durumda tekrar denenmez", async () => {
      const { svc, prisma } = kur({ tenant: AKTIF });
      await svc.transition({ tenantId: "T1", to: "QUIESCING", reason: "r", target: "SUSPENDED" });
      expect(prisma.$transaction).toHaveBeenCalledTimes(1);

      const hataDurumu = kur({ tenant: PROVISIONING });
      await expect(
        hataDurumu.svc.transition({ tenantId: "T1", to: "ACTIVE", reason: "r" }),
      ).rejects.toBeInstanceOf(LifecycleSafetyCriticalEdgeWithheldError);
      expect(hataDurumu.prisma.$transaction).toHaveBeenCalledTimes(1);
    });
  });
});

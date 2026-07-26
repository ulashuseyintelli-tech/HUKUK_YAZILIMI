/**
 * UYAP-ACTING-LAWYER-RESOLVER-I01 — canonical acting-lawyer çözümlemesi (MODEL B).
 *
 * Owner kararı DECISION-1 (RATIFIED): office membership, personnel status, case assignment,
 * responsible-lawyer ataması, admin/super-admin rolü, internal permission ve client-provided
 * `lawyerId` **tek başına execution authority DEĞİLDİR**. Bu suite yalnız server-side
 * `User → Lawyer` köprüsünün fail-closed davranışını kilitler.
 *
 * INV-01 client-controlled lawyerId authority değildir · INV-02 client-controlled tenantId
 * authority değildir · INV-03 authenticated user canonical active Lawyer'a server-side çözülür ·
 * INV-04 lawyer tenant'ı authenticated tenant ile aynıdır.
 */
import { ForbiddenException } from "@nestjs/common";
import { ActingLawyerResolverService } from "../acting-lawyer-resolver.service";

const USER_ID = "user-1";
const TENANT = "tenant-1";
const OTHER_TENANT = "tenant-2";
const LAWYER_ID = "lawyer-1";

function makeService(findManyImpl: jest.Mock) {
  const prisma = { lawyer: { findMany: findManyImpl } } as any;
  return new ActingLawyerResolverService(prisma);
}

describe("ActingLawyerResolverService", () => {
  describe("tryResolve — pozitif", () => {
    it("aktif, aynı tenant'taki bağlı avukatı canonical olarak çözer", async () => {
      const findMany = jest.fn().mockResolvedValue([
        { id: LAWYER_ID, tenantId: TENANT, isActive: true },
      ]);
      const service = makeService(findMany);

      const result = await service.tryResolve({ userId: USER_ID, tenantId: TENANT });

      expect(result).toEqual({
        resolved: true,
        actingLawyer: { lawyerId: LAWYER_ID, userId: USER_ID, tenantId: TENANT },
      });
    });

    it("sorguyu YALNIZ authenticated userId ile kurar ve tenant'ı kendi kolonundan doğrular", async () => {
      const findMany = jest.fn().mockResolvedValue([
        { id: LAWYER_ID, tenantId: TENANT, isActive: true },
      ]);
      const service = makeService(findMany);

      await service.tryResolve({ userId: USER_ID, tenantId: TENANT });

      const args = findMany.mock.calls[0][0];
      expect(args.where).toEqual({ userId: USER_ID });
      // tenant filtreye KONMAZ: cross-tenant bağ "bulunamadı"ya çevrilmemeli, tespit edilmeli.
      expect(args.where.tenantId).toBeUndefined();
      expect(args.select).toEqual({ id: true, tenantId: true, isActive: true });
    });
  });

  describe("tryResolve — fail-closed", () => {
    it("bağlı avukat yoksa ACTING_LAWYER_NOT_RESOLVED döner", async () => {
      const service = makeService(jest.fn().mockResolvedValue([]));

      const result = await service.tryResolve({ userId: USER_ID, tenantId: TENANT });

      expect(result).toEqual({ resolved: false, failureCode: "ACTING_LAWYER_NOT_RESOLVED" });
    });

    it("avukat pasifse (isActive=false) authority üretmez", async () => {
      const service = makeService(
        jest.fn().mockResolvedValue([{ id: LAWYER_ID, tenantId: TENANT, isActive: false }]),
      );

      const result = await service.tryResolve({ userId: USER_ID, tenantId: TENANT });

      expect(result).toEqual({ resolved: false, failureCode: "ACTING_LAWYER_NOT_RESOLVED" });
    });

    it("avukat başka tenant'a aitse LAWYER_TENANT_MISMATCH döner (sessizce yutulmaz)", async () => {
      const service = makeService(
        jest.fn().mockResolvedValue([{ id: LAWYER_ID, tenantId: OTHER_TENANT, isActive: true }]),
      );

      const result = await service.tryResolve({ userId: USER_ID, tenantId: TENANT });

      expect(result).toEqual({ resolved: false, failureCode: "LAWYER_TENANT_MISMATCH" });
    });

    it("cross-tenant durumda yabancı tenant'ın hiçbir alanı çağırana dönmez", async () => {
      const service = makeService(
        jest.fn().mockResolvedValue([{ id: LAWYER_ID, tenantId: OTHER_TENANT, isActive: true }]),
      );

      const result = await service.tryResolve({ userId: USER_ID, tenantId: TENANT });

      expect(JSON.stringify(result)).not.toContain(OTHER_TENANT);
      expect(JSON.stringify(result)).not.toContain(LAWYER_ID);
    });

    it("birden fazla kayıt (unique ihlali) ACTING_LAWYER_AMBIGUOUS üretir — sessiz seçim yok", async () => {
      const service = makeService(
        jest.fn().mockResolvedValue([
          { id: LAWYER_ID, tenantId: TENANT, isActive: true },
          { id: "lawyer-2", tenantId: TENANT, isActive: true },
        ]),
      );

      const result = await service.tryResolve({ userId: USER_ID, tenantId: TENANT });

      expect(result).toEqual({ resolved: false, failureCode: "ACTING_LAWYER_AMBIGUOUS" });
    });

    it("eksik userId/tenantId ile DB'ye hiç gitmeden fail-closed olur", async () => {
      const findMany = jest.fn();
      const service = makeService(findMany);

      await expect(service.tryResolve({ userId: "", tenantId: TENANT })).resolves.toEqual({
        resolved: false,
        failureCode: "ACTING_LAWYER_NOT_RESOLVED",
      });
      await expect(service.tryResolve({ userId: USER_ID, tenantId: "" })).resolves.toEqual({
        resolved: false,
        failureCode: "ACTING_LAWYER_NOT_RESOLVED",
      });
      expect(findMany).not.toHaveBeenCalled();
    });

    it("lawyer kaydı olmayan personel (yalnız StaffMember) authority üretemez", async () => {
      // Personel kullanıcısının Lawyer kaydı yoktur → sorgu boş döner.
      const service = makeService(jest.fn().mockResolvedValue([]));

      const result = await service.tryResolve({ userId: "staff-user", tenantId: TENANT });

      expect(result).toEqual({ resolved: false, failureCode: "ACTING_LAWYER_NOT_RESOLVED" });
    });
  });

  describe("client-controlled alan spoofing", () => {
    it("body.lawyerId benzeri ek alanlar sonucu DEĞİŞTİREMEZ (yalnız server context kullanılır)", async () => {
      const findMany = jest.fn().mockResolvedValue([
        { id: LAWYER_ID, tenantId: TENANT, isActive: true },
      ]);
      const service = makeService(findMany);

      const spoofed = {
        userId: USER_ID,
        tenantId: TENANT,
        // client'ın göndermeye çalıştığı alanlar — kontrat dışı, yok sayılmalı
        lawyerId: "attacker-lawyer",
        actingLawyerId: "attacker-lawyer",
      } as any;

      const result = await service.tryResolve(spoofed);

      expect(result).toEqual({
        resolved: true,
        actingLawyer: { lawyerId: LAWYER_ID, userId: USER_ID, tenantId: TENANT },
      });
      expect(findMany.mock.calls[0][0].where).toEqual({ userId: USER_ID });
    });

    it("body.tenantId spoofing'i cross-tenant authority üretemez", async () => {
      // Kullanıcının avukatı TENANT'ta; saldırgan OTHER_TENANT bağlamı geçirirse eşleşme reddedilir.
      const service = makeService(
        jest.fn().mockResolvedValue([{ id: LAWYER_ID, tenantId: TENANT, isActive: true }]),
      );

      const result = await service.tryResolve({ userId: USER_ID, tenantId: OTHER_TENANT });

      expect(result).toEqual({ resolved: false, failureCode: "LAWYER_TENANT_MISMATCH" });
    });
  });

  describe("resolveOrThrow", () => {
    it("çözülürse canonical acting lawyer döner", async () => {
      const service = makeService(
        jest.fn().mockResolvedValue([{ id: LAWYER_ID, tenantId: TENANT, isActive: true }]),
      );

      await expect(service.resolveOrThrow({ userId: USER_ID, tenantId: TENANT })).resolves.toEqual({
        lawyerId: LAWYER_ID,
        userId: USER_ID,
        tenantId: TENANT,
      });
    });

    it("çözülemezse ForbiddenException fırlatır ve dış mesaj generic kalır", async () => {
      const service = makeService(jest.fn().mockResolvedValue([]));

      await expect(
        service.resolveOrThrow({ userId: USER_ID, tenantId: TENANT }),
      ).rejects.toBeInstanceOf(ForbiddenException);

      try {
        await service.resolveOrThrow({ userId: USER_ID, tenantId: TENANT });
        throw new Error("beklenen exception fırlatılmadı");
      } catch (error: any) {
        const payload = error.getResponse();
        expect(payload.code).toBe("ACTING_LAWYER_NOT_RESOLVED");
        // Dış mesaj authority ilişkisi/enumeration bilgisi sızdırmaz.
        expect(payload.message).not.toContain(USER_ID);
        expect(payload.message).not.toContain(TENANT);
        expect(payload.message).not.toMatch(/lawyer|avukat kimlik/i);
      }
    });

    it("tenant uyuşmazlığında da fail-closed fırlatır", async () => {
      const service = makeService(
        jest.fn().mockResolvedValue([{ id: LAWYER_ID, tenantId: OTHER_TENANT, isActive: true }]),
      );

      try {
        await service.resolveOrThrow({ userId: USER_ID, tenantId: TENANT });
        throw new Error("beklenen exception fırlatılmadı");
      } catch (error: any) {
        expect(error).toBeInstanceOf(ForbiddenException);
        expect(error.getResponse().code).toBe("LAWYER_TENANT_MISMATCH");
      }
    });
  });
});

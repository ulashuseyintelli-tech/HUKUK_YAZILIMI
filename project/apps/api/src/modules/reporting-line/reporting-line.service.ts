import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma, ReportingLineDisposition } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

/**
 * ReportingLine Population Core + Top-Level Disposition Persistence — CAP-02
 * object-scope enablement. Manager–personel raporlama ilişkilerinin (User→User)
 * oluşturulması/bakımı/doğrulaması. Object-scope FİLTRELEME/deny AKTİVE ETMEZ.
 *
 * Current-state otoritesi = aktör başına TEK aktif ReportingLine kaydı:
 *   MANAGED     → disposition=MANAGED,   managerUserId dolu
 *   TOP_LEVEL   → disposition=TOP_LEVEL, managerUserId null (açık kök)
 *   UNCLASSIFIED→ aktif kayıt yok
 * "Explicit top-level" artık KALICI (audit-only değil); graf-konumundan TÜRETİLMEZ.
 * Invariant sınırı DB-level'dır: CHECK (disposition↔manager nullability) + partial
 * unique index (tenant+actor, validUntil IS NULL); Serializable + app-sayım ek kat.
 *
 * Kimlik: User ID tabanlı. StaffMember/Lawyer profilleri yalnız kimlik çözümü/
 * gösterim/uygunluk içindir. ClientPortalUser + sistem/insan-dışı aktörler hariç.
 * SINIR: GLOBAL PermissionGrant yazılmaz; CAP-03/04/09 yok; enforcement yok.
 */
@Injectable()
export class ReportingLineService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertAdmin(role: string | undefined): void {
    if (role !== "ADMIN") {
      throw new ForbiddenException("Bu işlem için ADMIN yetkisi gerekir");
    }
  }

  /**
   * Tarih-aralığı bütünlüğü: validUntil doluysa validFrom'dan önce olamaz.
   * DB CHECK constraint (validUntil IS NULL OR validFrom <= validUntil) NİHAİ
   * sınırdır; bu app-guard defense-in-depth + net hata + bozuk kaydı kapatırken
   * yüzeye çıkarma (sessizce daha da bozmama). Tek başına yeterli sayılmaz.
   */
  private assertValidDateRange(validFrom: Date, validUntil: Date | null): void {
    if (validUntil != null && validUntil < validFrom) {
      throw new BadRequestException(
        "Geçersiz tarih aralığı: bitiş (validUntil) başlangıçtan (validFrom) önce olamaz",
      );
    }
  }

  /**
   * Aktif, aynı-tenant User doğrular. Eksik/pasif/başka-tenant → BadRequest.
   */
  private async assertActiveTenantUser(
    tenantId: string,
    userId: string,
    label: string,
  ): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: userId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException(
        `Geçersiz ${label}: aktif ve aynı büroya ait bir kullanıcı olmalı`,
      );
    }
  }

  /**
   * Önerilen actor→manager kenarı döngü yaratır mı? manager'ın aktif amir zinciri
   * yukarı yürünür; actor'a ulaşılırsa döngü. TOP_LEVEL (managerUserId null) kaydı
   * kökü işaretler, zincir orada biter. Ziyaret-seti + derinlik sınırı ek koruma.
   */
  private async wouldCreateCycle(
    tx: Prisma.TransactionClient,
    tenantId: string,
    actorUserId: string,
    managerUserId: string,
  ): Promise<boolean> {
    let current: string | null = managerUserId;
    const visited = new Set<string>();
    let depth = 0;
    while (current && depth < 1000) {
      if (current === actorUserId) return true; // actor'a dönüş = döngü
      if (visited.has(current)) return true; // önceden var olan döngü koruması
      visited.add(current);
      const row: { managerUserId: string | null } | null =
        await tx.reportingLine.findFirst({
          where: { tenantId, actorUserId: current, validUntil: null },
          select: { managerUserId: true },
        });
      if (!row || !row.managerUserId) break; // köke/TOP_LEVEL'e ulaşıldı
      current = row.managerUserId;
      depth++;
    }
    return false;
  }

  /**
   * Aktif MANAGED disposition ata/değiştir. Tek transaction (kapat→aç) + Serializable
   * + post-write tekil-aktif sayımı; nihai sınır DB partial unique index'tir.
   * <remarks>
   * Çağrıldığı yerler:
   * - ReportingLineController.assign() -> POST /reporting-lines/assign (ADMIN)
   * </remarks>
   */
  async assignManager(
    tenantId: string,
    actingUserId: string,
    role: string,
    dto: { actorUserId: string; managerUserId: string },
  ): Promise<{ actorUserId: string; managerUserId: string; disposition: "MANAGED" }> {
    this.assertAdmin(role);
    const { actorUserId, managerUserId } = dto;

    if (actorUserId === managerUserId) {
      throw new BadRequestException(
        "Bir kullanıcı kendi amiri olamaz (self-manager yasak)",
      );
    }
    await this.assertActiveTenantUser(tenantId, actorUserId, "personel");
    await this.assertActiveTenantUser(tenantId, managerUserId, "amir");

    await this.prisma.$transaction(
      async (tx) => {
        if (await this.wouldCreateCycle(tx, tenantId, actorUserId, managerUserId)) {
          throw new BadRequestException("Bu atama hiyerarşide döngü oluşturur");
        }

        const previous = await tx.reportingLine.findFirst({
          where: { tenantId, actorUserId, validUntil: null },
          select: { managerUserId: true, disposition: true, validFrom: true },
        });

        const closeAt = new Date();
        if (previous) this.assertValidDateRange(previous.validFrom, closeAt);

        await tx.reportingLine.updateMany({
          where: { tenantId, actorUserId, validUntil: null },
          data: { validUntil: closeAt },
        });

        await tx.reportingLine.create({
          data: {
            tenantId,
            actorUserId,
            managerUserId,
            disposition: ReportingLineDisposition.MANAGED,
          },
        });

        const activeCount = await tx.reportingLine.count({
          where: { tenantId, actorUserId, validUntil: null },
        });
        if (activeCount !== 1) {
          throw new ConflictException(
            "Eşzamanlı değişiklik: tekil aktif disposition ihlali",
          );
        }

        await this.audit.logInTransaction(tx, {
          tenantId,
          action: "REPORTING_LINE_ASSIGNED",
          entityType: "REPORTING_LINE",
          entityId: actorUserId,
          userId: actingUserId,
          oldValues: previous
            ? { managerUserId: previous.managerUserId, disposition: previous.disposition }
            : {},
          newValues: { actorUserId, managerUserId, disposition: "MANAGED" },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { actorUserId, managerUserId, disposition: "MANAGED" };
  }

  /**
   * Aktörü açık TOP_LEVEL (kök) olarak işaretle: aktif disposition kapatılır ve
   * managerUserId=null olan yeni TOP_LEVEL disposition yazılır (KALICI). Tek
   * transaction + Serializable + tekil-aktif sayımı; DB CHECK manager=null'ı zorlar.
   * <remarks>
   * Çağrıldığı yerler:
   * - ReportingLineController.topLevel() -> POST /reporting-lines/top-level (ADMIN)
   * </remarks>
   */
  async markTopLevel(
    tenantId: string,
    actingUserId: string,
    role: string,
    dto: { actorUserId: string },
  ): Promise<{ actorUserId: string; disposition: "TOP_LEVEL" }> {
    this.assertAdmin(role);
    const { actorUserId } = dto;
    await this.assertActiveTenantUser(tenantId, actorUserId, "personel");

    await this.prisma.$transaction(
      async (tx) => {
        const previous = await tx.reportingLine.findFirst({
          where: { tenantId, actorUserId, validUntil: null },
          select: { managerUserId: true, disposition: true, validFrom: true },
        });

        const closeAt = new Date();
        if (previous) this.assertValidDateRange(previous.validFrom, closeAt);

        await tx.reportingLine.updateMany({
          where: { tenantId, actorUserId, validUntil: null },
          data: { validUntil: closeAt },
        });

        await tx.reportingLine.create({
          data: {
            tenantId,
            actorUserId,
            managerUserId: null,
            disposition: ReportingLineDisposition.TOP_LEVEL,
          },
        });

        const activeCount = await tx.reportingLine.count({
          where: { tenantId, actorUserId, validUntil: null },
        });
        if (activeCount !== 1) {
          throw new ConflictException(
            "Eşzamanlı değişiklik: tekil aktif disposition ihlali",
          );
        }

        await this.audit.logInTransaction(tx, {
          tenantId,
          action: "REPORTING_LINE_TOP_LEVEL",
          entityType: "REPORTING_LINE",
          entityId: actorUserId,
          userId: actingUserId,
          oldValues: previous
            ? { managerUserId: previous.managerUserId, disposition: previous.disposition }
            : {},
          newValues: { actorUserId, disposition: "TOP_LEVEL" },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { actorUserId, disposition: "TOP_LEVEL" };
  }

  /**
   * Aktif disposition'ı kapat (validUntil) → aktör UNCLASSIFIED olur. Tarihsel
   * kayıt silinmez; yerine yeni kayıt oluşturulmaz. Aktif yoksa NotFound.
   * <remarks>
   * Çağrıldığı yerler:
   * - ReportingLineController.end() -> POST /reporting-lines/end (ADMIN)
   * </remarks>
   */
  async endRelationship(
    tenantId: string,
    actingUserId: string,
    role: string,
    dto: { actorUserId: string },
  ): Promise<{ actorUserId: string; closed: number }> {
    this.assertAdmin(role);
    const { actorUserId } = dto;

    return this.prisma.$transaction(
      async (tx) => {
        const active = await tx.reportingLine.findMany({
          where: { tenantId, actorUserId, validUntil: null },
          select: { managerUserId: true, disposition: true, validFrom: true },
        });
        if (active.length === 0) {
          throw new NotFoundException("Kapatılacak aktif disposition yok");
        }

        const closeAt = new Date();
        for (const a of active) this.assertValidDateRange(a.validFrom, closeAt);

        const result = await tx.reportingLine.updateMany({
          where: { tenantId, actorUserId, validUntil: null },
          data: { validUntil: closeAt },
        });

        await this.audit.logInTransaction(tx, {
          tenantId,
          action: "REPORTING_LINE_ENDED",
          entityType: "REPORTING_LINE",
          entityId: actorUserId,
          userId: actingUserId,
          oldValues: {
            dispositions: active.map((a) => ({
              managerUserId: a.managerUserId,
              disposition: a.disposition,
            })),
          },
          newValues: { disposition: "UNCLASSIFIED" },
        });

        return { actorUserId, closed: result.count };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Aktif disposition kayıtlarını listele (tenant-scoped) — disposition dahil.
   * <remarks>
   * Çağrıldığı yerler:
   * - ReportingLineController.list() -> GET /reporting-lines (ADMIN)
   * </remarks>
   */
  async listActive(tenantId: string) {
    const rows = await this.prisma.reportingLine.findMany({
      where: { tenantId, validUntil: null },
      select: {
        id: true,
        actorUserId: true,
        managerUserId: true,
        disposition: true,
        validFrom: true,
      },
      orderBy: { validFrom: "desc" },
    });
    return { relationships: rows };
  }

  /**
   * Hiyerarşiye girebilecek uygun personel/amir Users (aktif, aynı tenant, bir
   * StaffMember/Lawyer profiline bağlı).
   * <remarks>
   * Çağrıldığı yerler:
   * - ReportingLineController.eligible() -> GET /reporting-lines/eligible (ADMIN)
   * </remarks>
   */
  async listEligible(tenantId: string) {
    const users = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { staffMember: { is: { isActive: true } } },
          { lawyer: { is: { isActive: true } } },
        ],
      },
      select: {
        id: true,
        name: true,
        email: true,
        staffMember: { select: { id: true } },
        lawyer: { select: { id: true } },
      },
      orderBy: { name: "asc" },
    });
    const eligible = users.map((u) => ({
      userId: u.id,
      name: u.name,
      email: u.email,
      profileType: u.lawyer ? "LAWYER" : u.staffMember ? "STAFF" : null,
    }));
    return { eligible };
  }

  /**
   * Salt-okunur reconciliation: disposition-tabanlı sınıflandırma + anomali sayımı.
   * Explicit top-level artık graf-konumundan TÜRETİLMEZ (kalıcı TOP_LEVEL kaydı).
   * Üretim verisini DÜZELTMEZ.
   * <remarks>
   * Çağrıldığı yerler:
   * - ReportingLineController.reconciliation() -> GET /reporting-lines/reconciliation (ADMIN)
   * </remarks>
   */
  async reconciliation(tenantId: string) {
    const [
      activeLinkedLawyers,
      activeLinkedStaff,
      activeStaffNoUser,
      activeLawyerNoUser,
      activeRows,
    ] = await Promise.all([
      this.prisma.lawyer.count({
        where: { tenantId, isActive: true, userId: { not: null } },
      }),
      this.prisma.staffMember.count({
        where: { tenantId, isActive: true, userId: { not: null } },
      }),
      this.prisma.staffMember.count({
        where: { tenantId, isActive: true, userId: null },
      }),
      this.prisma.lawyer.count({
        where: { tenantId, isActive: true, userId: null },
      }),
      this.prisma.reportingLine.findMany({
        where: { tenantId, validUntil: null },
        select: { actorUserId: true, managerUserId: true, disposition: true },
      }),
    ]);

    const personnelUsers = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        OR: [
          { staffMember: { is: { isActive: true } } },
          { lawyer: { is: { isActive: true } } },
        ],
      },
      select: {
        id: true,
        staffMember: { select: { id: true } },
        lawyer: { select: { id: true } },
      },
    });
    const ambiguousProfileUsers = personnelUsers.filter(
      (u) => u.staffMember && u.lawyer,
    ).length;

    const actorsWithActive = new Set(activeRows.map((r) => r.actorUserId));

    // Disposition-tabanlı sınıflandırma (graf-türetme YOK).
    const managedActors = activeRows.filter(
      (r) => r.disposition === ReportingLineDisposition.MANAGED,
    ).length;
    const explicitTopLevelActors = activeRows.filter(
      (r) => r.disposition === ReportingLineDisposition.TOP_LEVEL,
    ).length;
    let unclassifiedActors = 0;
    for (const u of personnelUsers) {
      if (!actorsWithActive.has(u.id)) unclassifiedActors++;
    }

    // Anomali sınıfları (DB constraint'leri normalde 0'da tutar; reconciliation izler).
    const invalidManagedWithoutManager = activeRows.filter(
      (r) => r.disposition === ReportingLineDisposition.MANAGED && r.managerUserId == null,
    ).length;
    const invalidTopLevelWithManager = activeRows.filter(
      (r) => r.disposition === ReportingLineDisposition.TOP_LEVEL && r.managerUserId != null,
    ).length;
    const selfManagerRelationships = activeRows.filter(
      (r) => r.managerUserId != null && r.actorUserId === r.managerUserId,
    ).length;

    const perActorCount = new Map<string, number>();
    for (const r of activeRows) {
      perActorCount.set(r.actorUserId, (perActorCount.get(r.actorUserId) ?? 0) + 1);
    }
    const duplicateActiveDispositions = [...perActorCount.values()].filter(
      (c) => c > 1,
    ).length;

    // Döngü: yalnız MANAGED kenarlar (managerUserId dolu).
    const managerOf = new Map<string, string>();
    for (const r of activeRows) {
      if (
        r.disposition === ReportingLineDisposition.MANAGED &&
        r.managerUserId &&
        r.actorUserId !== r.managerUserId &&
        !managerOf.has(r.actorUserId)
      ) {
        managerOf.set(r.actorUserId, r.managerUserId);
      }
    }
    const cyclicActors = new Set<string>();
    for (const start of managerOf.keys()) {
      const seen = new Set<string>();
      let cur: string | undefined = start;
      while (cur && managerOf.has(cur)) {
        if (seen.has(cur)) {
          cyclicActors.add(start);
          break;
        }
        seen.add(cur);
        cur = managerOf.get(cur);
      }
    }

    // Aktif/başka-tenant referans anomalileri.
    const referencedIds = new Set<string>();
    for (const r of activeRows) {
      referencedIds.add(r.actorUserId);
      if (r.managerUserId) referencedIds.add(r.managerUserId);
    }
    let inactiveOrCrossTenantReferences = 0;
    if (referencedIds.size > 0) {
      const validRefs = await this.prisma.user.count({
        where: { tenantId, isActive: true, id: { in: [...referencedIds] } },
      });
      inactiveOrCrossTenantReferences = referencedIds.size - validRefs;
    }

    // Gelecek enforcement için sınıflandırılamayan task-atanabilir Users:
    // aktif Task assignee'si olan ama hiç aktif disposition'ı olmayan (UNCLASSIFIED) Users.
    const assigneeUsers = await this.prisma.user.findMany({
      where: { tenantId, isActive: true, assignedTasks: { some: {} } },
      select: { id: true },
    });
    const unclassifiableTaskAssignees = assigneeUsers.filter(
      (u) => !actorsWithActive.has(u.id),
    ).length;

    // Geçersiz tarih-aralığı: validUntil dolu VE validFrom > validUntil. Prisma `where`
    // iki kolonu karşılaştıramadığından parameterized $queryRaw; diğer anomalilerden
    // (duplicate/self/disposition-mismatch/inactive/cross-tenant) BAĞIMSIZ sayılır.
    const invalidDateRangeRows = await this.prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count FROM "ReportingLine"
      WHERE "tenantId" = ${tenantId}
        AND "validUntil" IS NOT NULL
        AND "validFrom" > "validUntil"`;
    const invalidDateRangeRelationships = Number(
      invalidDateRangeRows[0]?.count ?? 0,
    );

    return {
      activeUserLinkedLawyers: activeLinkedLawyers,
      activeUserLinkedStaff: activeLinkedStaff,
      activeProfilesWithoutUserLink: activeStaffNoUser + activeLawyerNoUser,
      usersLinkedToMultipleProfileTypes: ambiguousProfileUsers,
      managedActors,
      explicitTopLevelActors,
      unclassifiedActors,
      inactiveOrCrossTenantReferences,
      duplicateActiveDispositions,
      invalidManagedWithoutManager,
      invalidTopLevelWithManager,
      selfManagerRelationships,
      invalidDateRangeRelationships,
      cycles: cyclicActors.size,
      unclassifiableTaskAssignees,
    };
  }
}

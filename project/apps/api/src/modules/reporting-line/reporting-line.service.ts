import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuditService } from "../audit/audit.service";

/**
 * ReportingLine Population Core — CAP-02 object-scope enforcement'ın gerektirdiği
 * manager–personel raporlama ilişkilerinin oluşturulması/bakımı/doğrulaması.
 *
 * SINIR: Bu birim object-scope FİLTRELEME/deny davranışı AKTİVE ETMEZ. Yalnız
 * ReportingLine (User→User) populasyonu + reconciliation + audit sağlar. Şema
 * değişmez; GLOBAL PermissionGrant yazılmaz; CAP-03/04/09 kapsamına girilmez.
 *
 * Kimlik: raporlama ilişkisi User ID tabanlıdır. StaffMember/Lawyer profilleri
 * yalnız kimlik çözümü, gösterim ve uygunluk doğrulaması içindir. User bağı
 * olmayan profil hiyerarşiye giremez; ClientPortalUser ve sistem/insan-dışı
 * aktörler hariçtir (User tablosu personel/admin hesaplarını taşır).
 *
 * "Explicit top-level": mevcut şema managerUserId'yi zorunlu tutar ve self-manager
 * bir anomalidir; bu yüzden top-level AYRI bir kalıcı bayrakla DEĞİL, aktif manager
 * kaydının yokluğuyla temsil edilir (markTopLevel aktif ilişkiyi kapatır + audit'ler).
 * Reconciliation, aktif manager'ı olmayan Users'ı graf konumundan türetir: başkalarını
 * yöneten kök = top-level; kimseyi yönetmeyen izole = disposition yok. Kalıcı, açık
 * "explicit top-level" bayrağı bir şema işareti gerektirir (bu birim dışı).
 */
@Injectable()
export class ReportingLineService {
  constructor(
    private prisma: PrismaService,
    private audit: AuditService,
  ) {}

  private assertAdmin(role: string | undefined): void {
    // Birincil kapı controller'daki AdminGuard'dır; bu servis-seviyesi kontrol
    // defense-in-depth + doğrudan-birim-testi içindir (K1-7 AdminGuard deseniyle uyumlu).
    if (role !== "ADMIN") {
      throw new ForbiddenException("Bu işlem için ADMIN yetkisi gerekir");
    }
  }

  /**
   * Aktif, aynı-tenant User doğrular. Eksik/pasif/başka-tenant → BadRequest.
   * <remarks>
   * Çağrıldığı yerler:
   * - ReportingLineService.assignManager()/markTopLevel() -> actor + manager uygunluk kapısı
   * </remarks>
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
   * Önerilen actor→manager kenarı bir döngü yaratır mı? manager'ın aktif amir
   * zinciri yukarı yürünür; actor'a ulaşılırsa döngü. Mevcut bozuk veri için
   * ziyaret-seti + derinlik sınırı ile korunur.
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
      const row: { managerUserId: string } | null =
        await tx.reportingLine.findFirst({
          where: { tenantId, actorUserId: current, validUntil: null },
          select: { managerUserId: true },
        });
      if (!row) break; // köke ulaşıldı
      current = row.managerUserId;
      depth++;
    }
    return false;
  }

  /**
   * Aktif bir manager ata veya değiştir. Tek-transaction: eski aktif ilişki
   * kapatılır (validUntil), yeni aktif ilişki açılır; audit aynı tx içinde yazılır.
   * Serializable izolasyon + post-write tekil-aktif sayımı ile eşzamanlılıkta
   * en fazla bir aktif manager garanti edilir.
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
  ): Promise<{ actorUserId: string; managerUserId: string }> {
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
          throw new BadRequestException(
            "Bu atama hiyerarşide döngü oluşturur",
          );
        }

        const previous = await tx.reportingLine.findFirst({
          where: { tenantId, actorUserId, validUntil: null },
          select: { managerUserId: true },
        });

        await tx.reportingLine.updateMany({
          where: { tenantId, actorUserId, validUntil: null },
          data: { validUntil: new Date() },
        });

        await tx.reportingLine.create({
          data: { tenantId, actorUserId, managerUserId },
        });

        const activeCount = await tx.reportingLine.count({
          where: { tenantId, actorUserId, validUntil: null },
        });
        if (activeCount !== 1) {
          throw new ConflictException(
            "Eşzamanlı değişiklik: tekil aktif amir ihlali",
          );
        }

        await this.audit.logInTransaction(tx, {
          tenantId,
          action: "REPORTING_LINE_ASSIGNED",
          entityType: "REPORTING_LINE",
          entityId: actorUserId,
          userId: actingUserId,
          oldValues: previous ? { managerUserId: previous.managerUserId } : {},
          newValues: { actorUserId, managerUserId },
        });
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );

    return { actorUserId, managerUserId };
  }

  /**
   * Aktif raporlama ilişkisini kapat (validUntil). Tarihsel kayıt silinmez.
   * Aktif ilişki yoksa NotFound.
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
          select: { managerUserId: true },
        });
        if (active.length === 0) {
          throw new NotFoundException("Kapatılacak aktif raporlama ilişkisi yok");
        }

        const result = await tx.reportingLine.updateMany({
          where: { tenantId, actorUserId, validUntil: null },
          data: { validUntil: new Date() },
        });

        await this.audit.logInTransaction(tx, {
          tenantId,
          action: "REPORTING_LINE_ENDED",
          entityType: "REPORTING_LINE",
          entityId: actorUserId,
          userId: actingUserId,
          oldValues: { managerUserIds: active.map((a) => a.managerUserId) },
          newValues: {},
        });

        return { actorUserId, closed: result.count };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Bir kullanıcıyı açıkça top-level (kök) olarak işaretle: aktif amir ilişkisi
   * kapatılır ve niyet audit'lenir. Kalıcı self-row YAZILMAZ (self-manager anomali
   * kalır). İdempotent: zaten kök ise yalnız audit yazılır.
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
  ): Promise<{ actorUserId: string; closed: number }> {
    this.assertAdmin(role);
    const { actorUserId } = dto;
    await this.assertActiveTenantUser(tenantId, actorUserId, "personel");

    return this.prisma.$transaction(
      async (tx) => {
        const active = await tx.reportingLine.findMany({
          where: { tenantId, actorUserId, validUntil: null },
          select: { managerUserId: true },
        });

        const result = await tx.reportingLine.updateMany({
          where: { tenantId, actorUserId, validUntil: null },
          data: { validUntil: new Date() },
        });

        await this.audit.logInTransaction(tx, {
          tenantId,
          action: "REPORTING_LINE_TOP_LEVEL",
          entityType: "REPORTING_LINE",
          entityId: actorUserId,
          userId: actingUserId,
          oldValues: { managerUserIds: active.map((a) => a.managerUserId) },
          newValues: { topLevel: true },
        });

        return { actorUserId, closed: result.count };
      },
      { isolationLevel: Prisma.TransactionIsolationLevel.Serializable },
    );
  }

  /**
   * Aktif raporlama ilişkilerini listele (tenant-scoped). actor===manager
   * asla döndürülmez (self-row yazılmaz); her satır PLACED sınıfıdır.
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
        validFrom: true,
      },
      orderBy: { validFrom: "desc" },
    });
    return { relationships: rows };
  }

  /**
   * Hiyerarşiye girebilecek uygun personel/amir Users'ı listele: aktif, aynı
   * tenant ve bir StaffMember veya Lawyer profiline bağlı Users.
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
   * Salt-okunur reconciliation: enforcement-hazırlığı için anomali sınıflarını
   * sayar. Hiçbir üretim verisini DÜZELTMEZ.
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
        select: { actorUserId: true, managerUserId: true },
      }),
    ]);

    // Personel Users kümesi (aktif, profilli, User-bağlı) — disposition analizi için.
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

    // Aynı anda hem aktif Staff hem aktif Lawyer profiline bağlı Users = belirsiz.
    const ambiguousProfileUsers = personnelUsers.filter(
      (u) => u.staffMember && u.lawyer,
    ).length;

    // Graf konumu: aktif kenarlardan actor/manager kümeleri.
    const actorsWithActive = new Set(activeRows.map((r) => r.actorUserId));
    const managersActive = new Set(activeRows.map((r) => r.managerUserId));

    const selfManager = activeRows.filter(
      (r) => r.actorUserId === r.managerUserId,
    ).length;

    // Aynı actor için >1 aktif kayıt = mükerrer aktif ilişki.
    const perActorCount = new Map<string, number>();
    for (const r of activeRows) {
      perActorCount.set(r.actorUserId, (perActorCount.get(r.actorUserId) ?? 0) + 1);
    }
    const duplicateActiveActors = [...perActorCount.values()].filter(
      (c) => c > 1,
    ).length;

    // Döngü tespiti: her aktif actor için zinciri yürü (aktif kenar haritası).
    const managerOf = new Map<string, string>();
    for (const r of activeRows) {
      if (r.actorUserId !== r.managerUserId && !managerOf.has(r.actorUserId)) {
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

    // disposition: personel User aktif actor mı? değilse — kök mü (başkasını yönetir)
    // yoksa izole mi (disposition yok)?
    let placed = 0;
    let topLevelRoots = 0;
    let noDisposition = 0;
    for (const u of personnelUsers) {
      if (actorsWithActive.has(u.id)) {
        placed++;
      } else if (managersActive.has(u.id)) {
        topLevelRoots++;
      } else {
        noDisposition++;
      }
    }

    // Aktif/başka-tenant referans anomalileri: kenarlarda geçen User ID'lerin
    // tenant içi aktif olup olmadığını kontrol et.
    const referencedIds = new Set<string>();
    for (const r of activeRows) {
      referencedIds.add(r.actorUserId);
      referencedIds.add(r.managerUserId);
    }
    let inactiveOrCrossTenantRefs = 0;
    if (referencedIds.size > 0) {
      const validRefs = await this.prisma.user.count({
        where: {
          tenantId,
          isActive: true,
          id: { in: [...referencedIds] },
        },
      });
      inactiveOrCrossTenantRefs = referencedIds.size - validRefs;
    }

    // Gelecek enforcement için sınıflandırılamayan task-atanabilir Users:
    // task work-queue enforcement assignee (User) eksenine göre daraltacaktır.
    // Aktif Task assignee'si olan ancak hiyerarşi disposition'ı olmayan
    // (ne placed ne kök) Users.
    const assigneeUsers = await this.prisma.user.findMany({
      where: {
        tenantId,
        isActive: true,
        assignedTasks: { some: {} },
      },
      select: { id: true },
    });
    const unclassifiableTaskAssignees = assigneeUsers.filter(
      (u) => !actorsWithActive.has(u.id) && !managersActive.has(u.id),
    ).length;

    return {
      activeUserLinkedLawyers: activeLinkedLawyers,
      activeUserLinkedStaff: activeLinkedStaff,
      activeProfilesWithoutUserLink: activeStaffNoUser + activeLawyerNoUser,
      usersLinkedToMultipleProfileTypes: ambiguousProfileUsers,
      actorsPlaced: placed,
      explicitTopLevelRoots: topLevelRoots,
      actorsWithNoDisposition: noDisposition,
      duplicateActiveRelationships: duplicateActiveActors,
      selfManagerRelationships: selfManager,
      cycles: cyclicActors.size,
      inactiveOrCrossTenantReferences: inactiveOrCrossTenantRefs,
      unclassifiableTaskAssignees,
    };
  }
}

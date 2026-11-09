import { BadRequestException, ConflictException, Injectable, NotFoundException, ForbiddenException, MethodNotAllowedException, Optional, ServiceUnavailableException } from "@nestjs/common";
import { createHash } from "node:crypto";

/**
 * `dueDate` normalizasyonu (F01 K-F7): tarih-only `YYYY-MM-DD` → UTC gece yarısı; tam ISO-8601 → aynı an (saat dilimi
 * korunur); `null` → temizle; `undefined` → dokunma. Geçersiz değer Prisma'ya ULAŞMAZ: 400 (önceden
 * `Expected ISO-8601 DateTime` ile 500 veriyordu). JS `Date` takvim dışı günü yuvarlar (`2026-02-30` → 2 Mart); tarih-only
 * için geri okuma eşitliği, tam ISO için DTO `strict` doğrulaması bunu reddeder.
 */
export function normalizeDueDate(value: string | null | undefined): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null) return null;
  const s = String(value).trim();
  const dateOnly = /^\d{4}-\d{2}-\d{2}$/.test(s);
  const d = dateOnly ? new Date(s + "T00:00:00.000Z") : new Date(s);
  if (Number.isNaN(d.getTime()) || (dateOnly && !d.toISOString().startsWith(s))) {
    throw new BadRequestException("dueDate geçersiz: ISO-8601 (YYYY-MM-DD ya da tam tarih-saat) bekleniyor");
  }
  return d;
}
import { Prisma, TaskCategory as PrismaTaskCategory, TaskStatus as PrismaTaskStatus } from "@prisma/client";
import { PrismaService } from "@/prisma/prisma.service";
import { CancelTaskDto, CreateTaskDto, ListTaskCancellationsQueryDto, TASK_LIST_DEFAULT_LIMIT, UpdateTaskDto } from "./dto/task.dto";
import { AuditService } from "@/modules/audit/audit.service";
import { WorkScopePermissionService } from "@/modules/work-scope-permission/work-scope-permission.service";
import { TASK_VIEW_ALL_KEY, isTaskViewScopeEnabled, taskViewWhereFor } from "./task-view-scope";
import { isCaseViewScopeEnabled } from "../case/case-view-scope";
import { CaseViewScopeService } from "../case/case-view-scope.service";

/** TaskController.findAll → TaskService.findAll sorgu parametreleri (ListTasksQueryDto ile uyumlu). */
export interface TaskListParams {
  status?: string;
  assigneeId?: string;
  taskCategory?: string;
  page?: number;
  limit?: number;
}

/**
 * GET /tasks `meta.summary`: ekran sayaçları için sunucu toplamları. Kapsam = tenant sınırı
 * (+ varsa `assigneeId`); `status` / `taskCategory` süzgeci bu sayılara UYGULANMAZ.
 * `operationalOpen` = OPERATIONAL_COMPLETENESS ∧ (PENDING ∨ IN_PROGRESS); iptal ve tamamlanmış
 * görev "açık iş" değildir.
 */
export interface TaskListSummary {
  pending: number;
  inProgress: number;
  operationalOpen: number;
}

type TaskStatusGroup = { status: PrismaTaskStatus; taskCategory: PrismaTaskCategory; _count: { _all: number } };
type TaskDb = PrismaService | Prisma.TransactionClient;

function summarizeTaskGroups(groups: TaskStatusGroup[]): TaskListSummary {
  const summary: TaskListSummary = { pending: 0, inProgress: 0, operationalOpen: 0 };
  for (const group of groups) {
    const n = group._count._all;
    const open = group.status === "PENDING" || group.status === "IN_PROGRESS";
    if (group.status === "PENDING") summary.pending += n;
    if (group.status === "IN_PROGRESS") summary.inProgress += n;
    if (open && group.taskCategory === "OPERATIONAL_COMPLETENESS") summary.operationalOpen += n;
  }
  return summary;
}

@Injectable()
export class TaskService {
  constructor(
    private prisma: PrismaService,
    // F02-B dilim 3: görev liste görünüm kapsamı (bayrak açıkken zorunlu; bkz. viewScopeWhere)
    @Optional() private readonly workScope?: WorkScopePermissionService,
    @Optional() private readonly audit?: AuditService,
    // F02 P3 tarama S10: gömülü dosya nesnesinin görünürlüğü (bayrak açıkken zorunlu; bkz. maskHiddenCases)
    @Optional() private readonly caseViewScope?: CaseViewScopeService,
  ) {}

  /**
   * F02 P3 tarama S10 (owner kararı 09.11.2026) — görev erişimi dosya erişimi ÜRETMEZ: yanıta gömülen dosya nesnesi yalnız dosya
   * aktöre görünürse kalır (dosya görünüm kapsamı; `OFFICE_CASE_VIEW_SCOPE_ENABLED`). Görevin kendi sütunları değişmez.
   * Bayrak kapalı ya da büro geneli dosya izni → dokunulmaz (ek sorgu yok / süzme yok). Bayrak açık + servis yok → fail-closed.
   *
   * @remarks Çağrıldığı yerler: findAll() → GET /tasks; findOneForActor() → GET /tasks/:id.
   */
  private async maskHiddenCases<T extends { caseId: string | null; case: unknown }>(tenantId: string, actorUserId: string | undefined, tasks: T[]): Promise<T[]> {
    if (!isCaseViewScopeEnabled()) return tasks;
    if (!this.caseViewScope) {
      throw new ForbiddenException({ code: "CASE_VIEW_SCOPE_UNRESOLVED", message: "Dosya görünüm kapsamı çözümlenemedi" });
    }
    const visible = await this.caseViewScope.visibleCaseIds(tenantId, actorUserId, tasks.map((task) => task.caseId));
    if (!visible) return tasks;
    return tasks.map((task) => (task.caseId && !visible.has(task.caseId) ? { ...task, case: null } : task));
  }

  /**
   * F02-B dilim 3 (owner 29–30.10.2026, G3) — liste görünüm kapsamı (data + total + meta.summary birlikte).
   * Bayrak (OFFICE_TASK_VIEW_SCOPE_ENABLED) KAPALI → null = bugünkü davranış (büro geneli).
   * AÇIK → `office.tasks.view_all` çözümü: ALLOW (DENY yoksa) → büro geneli; DENY / NONE → varsayılan kapsam
   * (atanan ∪ oluşturan ∪ dosya bağı; dosyasız yalnız atanan/oluşturan — taskViewScopeWhere). Aktör kimliği ya da
   * izin servisi yoksa FAIL-CLOSED.
   *
   * @remarks Çağrıldığı yer: findAll() → GET /tasks.
   */
  private async viewScopeWhere(tenantId: string, actorUserId?: string, db: TaskDb = this.prisma): Promise<Prisma.TaskWhereInput | null> {
    if (!isTaskViewScopeEnabled()) return null;
    if (!actorUserId || !this.workScope) {
      throw new ForbiddenException({ code: "TASK_VIEW_SCOPE_UNRESOLVED", message: "Görev görünüm kapsamı çözümlenemedi" });
    }
    const resolution = await this.workScope.resolve(db, tenantId, actorUserId, TASK_VIEW_ALL_KEY);
    return taskViewWhereFor(resolution, tenantId, actorUserId);
  }

  /** Çağıranlar: create/update; dosyasız görev ve açık null ile bağı kaldırma korunur. */
  private async assertCaseTenant(tenantId: string, caseId: string | null | undefined): Promise<void> {
    if (caseId === undefined || caseId === null) return;
    const record = await this.prisma.case.findFirst({ where: { id: caseId, tenantId }, select: { id: true } });
    if (!record) throw new BadRequestException("Geçersiz dosya: aynı ofise ait bir dosya değil.");
  }

  /**
   * <remarks>
   * Çağrıldığı yerler:
   * - TaskService.create() → POST /tasks (yeni görev; dolu assignee doğrulaması)
   * - TaskService.update() → PUT /tasks/:id (görev güncelleme; dolu assignee doğrulaması)
   * </remarks>
   * CANDIDATE-J1 (STF-PRD-BOLA-002 baseline, OFF-INV-04): bir görev yalnız aynı-tenant + aktif bir
   * kullanıcıya atanabilir. responsible-candidates.service.ts::validateResponsibleSelection'ın
   * tenant+aktiflik `findFirst` kalıbını, Task assignee'sinin hedef modeli olan `User` için izler
   * (Task.assigneeId → User; User'da `canBeResponsible` benzeri kapasite bayrağı yoktur, bu yüzden
   * yalnız tenant + isActive doğrulanır). Yalnız ileriye-dönük (write-time): mevcut kayıtlar
   * taranmaz/reddedilmez. Rol/kapasite policy'si KAPSAM DIŞI (ayrı owner kararı).
   */
  private async assertAssigneeEligible(tenantId: string, assigneeId: string): Promise<void> {
    const user = await this.prisma.user.findFirst({
      where: { id: assigneeId, tenantId, isActive: true },
      select: { id: true },
    });
    if (!user) {
      throw new BadRequestException(
        "Geçersiz atanan: aktif ve aynı ofise ait bir kullanıcı değil."
      );
    }
  }

  /**
   * Çağıran: TaskController.findAll → GET /tasks.
   *
   * F01-A (OFP-01): sunucu taraflı süzgeç + üst sınırlı sayfalama + sayaçlar. `where` iki katmanlıdır:
   *   scopeWhere = tenant sınırı (+ assigneeId)          → data, total VE summary bu kapsamdadır
   *   where      = scopeWhere + status + taskCategory    → yalnız data ve total
   * Ekran sayaçları böylece seçili sekmeden bağımsız ve ilk sayfadan değil sunucu toplamından gelir.
   * Sıralama `id` ile kesinleştirilir: aynı öncelik/tarihli görevlerde sayfa sınırı kaymaz, kayıtlar
   * sayfalar arasında tekil kalır. Tenant sınırı (caseId null ∨ case.tenantId) değişmez.
   */
  async findAll(tenantId: string, params?: TaskListParams, actorUserId?: string) {
    const { status, assigneeId, taskCategory, page = 1, limit = TASK_LIST_DEFAULT_LIMIT } = params || {};

    const scopeWhere: Prisma.TaskWhereInput = { tenantId, OR: [{ caseId: null }, { case: { tenantId } }] };
    if (assigneeId) scopeWhere.assigneeId = assigneeId;
    // F02-B dilim 3: görünüm kapsamı scopeWhere katmanına → data, total VE summary birlikte daralır.
    const viewScope = await this.viewScopeWhere(tenantId, actorUserId);
    if (viewScope) scopeWhere.AND = [viewScope];

    const where: Prisma.TaskWhereInput = { ...scopeWhere };
    if (status) where.status = status as PrismaTaskStatus;
    if (taskCategory) where.taskCategory = taskCategory as PrismaTaskCategory;

    const [tasks, total, groups] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          case: { select: { id: true, fileNumber: true } },
          // Operasyonel görevler (ör. iletişim eksiği) müvekkile bağlı, dosyaya değil →
          // görev kartında müvekkil adını gösterip "Müvekkile git" linki kurabilmek için.
          client: { select: { id: true, displayName: true, companyName: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, name: true, surname: true } },
        },
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }, { id: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
      this.prisma.task.groupBy({
        by: ["status", "taskCategory"],
        where: scopeWhere,
        _count: { _all: true },
      }),
    ]);

    return {
      data: await this.maskHiddenCases(tenantId, actorUserId, tasks),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        summary: summarizeTaskGroups(groups as TaskStatusGroup[]),
      },
    };
  }

  // Çağıranlar: TaskController.findOne; TaskService.update/delete.
  async findOne(tenantId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, tenantId, OR: [{ caseId: null }, { case: { tenantId } }] },
      include: {
        case: true,
        client: { select: { id: true, displayName: true, companyName: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, name: true, surname: true, email: true } },
        createdBy: { select: { id: true, name: true, surname: true } },
      },
    });

    if (!task) {
      throw new NotFoundException("Görev bulunamadı");
    }

    return task;
  }

  /**
   * Çağıran: TaskController.findOne → GET /tasks/:id (F02 P3 tarama S10, owner kararı 09.11.2026).
   * Tek görev okuması listeyle AYNI görünüm kapsamına bağlıdır (`OFFICE_TASK_VIEW_SCOPE_ENABLED`; kapalı → bugünkü davranış):
   * kapsam dışı görev, var olmayanla aynı 404'ü alır. Gömülü dosya nesnesi yalnız dosya aktöre görünürse döner.
   * Yazım yolları (update) iç `findOne`'ı kullanmayı sürdürür; onların yetkisi değişmez.
   */
  async findOneForActor(tenantId: string, id: string, actorUserId: string) {
    const scope = await this.viewScopeWhere(tenantId, actorUserId);
    const task = await this.prisma.task.findFirst({
      where: { id, tenantId, OR: [{ caseId: null }, { case: { tenantId } }], ...(scope ? { AND: [scope] } : {}) },
      include: {
        case: true,
        client: { select: { id: true, displayName: true, companyName: true, firstName: true, lastName: true } },
        assignee: { select: { id: true, name: true, surname: true, email: true } },
        createdBy: { select: { id: true, name: true, surname: true } },
      },
    });

    if (!task) {
      throw new NotFoundException("Görev bulunamadı");
    }

    return (await this.maskHiddenCases(tenantId, actorUserId, [task]))[0];
  }

  // Çağıran: TaskController.create → POST /tasks.
  async create(tenantId: string, userId: string, dto: CreateTaskDto) {
    if (dto.status === "CANCELLED") {
      throw new BadRequestException("İptal için mevcut görevde gerekçeli iptal işlemini kullanın.");
    }
    await this.assertCaseTenant(tenantId, dto.caseId);
    // CANDIDATE-J1: dolu assignee → aynı-tenant + aktif doğrulaması. Boş/null assignee dokunulmaz
    // (sahipsiz görev meşru; null assignee davranışı korunur).
    if (dto.assigneeId) {
      await this.assertAssigneeEligible(tenantId, dto.assigneeId);
    }

    return this.prisma.task.create({
      data: {
        tenantId,
        createdById: userId,
        ...dto,
        dueDate: normalizeDueDate(dto.dueDate),
      },
    });
  }

  /**
   * <remarks>
   * Çağrıldığı yerler:
   * - TaskController.update() → PUT /tasks/:id (görev güncelleme; manuel kapanış)
   * </remarks>
   * PR-PERF-1 kapanış atfı: status=COMPLETED → completedByUserId=userId + resolutionType=MANUAL.
   * Görev COMPLETED'dan çıkarılırsa (yeniden açılır) kapanış alanları temizlenir (yalan veri bırakmaz).
   */
  async update(tenantId: string, id: string, userId: string, dto: UpdateTaskDto) {
    const existing = await this.findOne(tenantId, id);
    if (dto.status === "CANCELLED" && existing.status !== "CANCELLED") {
      throw new BadRequestException("Durum değişikliği için gerekçeli iptal işlemini kullanın.");
    }
    await this.assertCaseTenant(tenantId, dto.caseId);

    // CANDIDATE-J1: dolu assignee güncellemesi → aynı-tenant + aktif doğrulaması. Assignee alanı
    // gönderilmeyen (veya boşaltılan) güncellemeler dokunulmaz (null assignee davranışı korunur).
    if (dto.assigneeId) {
      await this.assertAssigneeEligible(tenantId, dto.assigneeId);
    }

    const data: any = { ...dto, dueDate: normalizeDueDate(dto.dueDate) };
    // An unchanged CANCELLED field is not authority to cancel again after a concurrent reopen.
    if (dto.status === "CANCELLED") delete data.status;
    if (dto.status === "COMPLETED") {
      data.completedAt = new Date();
      data.completedByUserId = userId; // insan kapanışı → kapatanı yakala
      data.resolutionType = "MANUAL";
    } else if (dto.status !== undefined && dto.status !== "CANCELLED") {
      // COMPLETED dışı bir statüye geçiş (yeniden açma vb.) → kapanış izini temizle.
      data.completedAt = null;
      data.completedByUserId = null;
      data.resolutionType = null;
    }

    return this.prisma.task.update({
      where: { id },
      data,
    });
  }

  async delete(tenantId: string, id: string) {
    throw new MethodNotAllowedException({ code: "TASK_PHYSICAL_DELETE_DISABLED", message: "Görev fiziksel silinemez; gerekçeli iptal işlemini kullanın." });
  }

  private assertCancellationIdentity(tenantId: string, id: string, userId: string): void {
    if (![tenantId, id, userId].every(value => typeof value === "string" && value.trim().length > 0)) {
      throw new ForbiddenException("Görev aktörü ve kapsamı doğrulanamadı.");
    }
  }

  /** Used only by cancel/findCancellations; reuse the scope flag/grant contract without activating it. */
  private async cancellationContext(db: TaskDb, tenantId: string, id: string, userId: string) {
    const actor = await db.user.findFirst({ where: { id: userId, tenantId, isActive: true }, select: { id: true, role: true } });
    if (!actor) throw new ForbiddenException("Görev aktörü doğrulanamadı.");
    const scope = await this.viewScopeWhere(tenantId, userId, db);
    const task = await db.task.findFirst({
      where: { id, tenantId, OR: [{ caseId: null }, { case: { tenantId } }], ...(scope ? { AND: [scope] } : {}) },
    });
    if (!task) throw new NotFoundException("Görev bulunamadı.");
    return { actor, task };
  }

  /** TaskController.cancel -> POST /tasks/:id/cancel. Trusted Client/expense system writers remain separate. */
  async cancel(tenantId: string, id: string, userId: string, dto: CancelTaskDto) {
    this.assertCancellationIdentity(tenantId, id, userId);
    const reason = typeof dto?.reason === "string" ? dto.reason.trim() : "";
    if (!reason || reason.length > 2000 || reason.includes("\u0000")) throw new BadRequestException("İptal gerekçesi 1–2000 karakter olmalıdır.");
    if (!this.audit) throw new ServiceUnavailableException("Görev iptal denetim kaydı kullanılamıyor.");
    return this.prisma.$transaction(async tx => {
      // Lock account authority first, then the task state; concurrent cancellation sees the first commit.
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} AND "tenantId" = ${tenantId} FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "Task" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const { actor, task } = await this.cancellationContext(tx, tenantId, id, userId);
      if (actor.role === "VIEWER" || (actor.role !== "ADMIN" && task.createdById !== actor.id)) {
        throw new ForbiddenException("Görevi yalnız oluşturan yazma yetkili kullanıcı veya ADMIN iptal edebilir.");
      }
      if (task.status === "CANCELLED") throw new ConflictException({ code: "TASK_ALREADY_CANCELLED", message: "Görev zaten iptal edilmiş." });
      const event = await tx.taskCancellationEvent.create({ data: {
        tenantId, taskId: id, actorUserId: actor.id, actorRole: actor.role,
        authoritySource: actor.role === "ADMIN" ? "ADMIN" : "CREATOR",
        fromStatus: task.status, toStatus: "CANCELLED", reason,
        previousCompletedAt: task.completedAt, previousCompletedByUserId: task.completedByUserId,
        previousResolutionType: task.resolutionType,
      } });
      const updated = await tx.task.update({ where: { id }, data: {
        status: "CANCELLED", completedAt: null, completedByUserId: null, resolutionType: null,
      } });
      await this.audit!.logInTransaction(tx, {
        tenantId, userId: actor.id, action: "TASK_CANCELLED", entityType: "TASK", entityId: id,
        description: "Görev gerekçeli olarak iptal edildi.",
        oldValues: { status: task.status }, newValues: { status: "CANCELLED" },
        metadata: { cancellationId: event.id, authoritySource: event.authoritySource,
          reasonPresent: true, reasonLength: reason.length, reasonHash: createHash("sha256").update(reason).digest("hex") },
      });
      return { task: updated, cancellationId: event.id };
    });
  }

  /** TaskController.findCancellations -> GET /tasks/:id/cancellations; domain projection, no raw audit endpoint. */
  async findCancellations(tenantId: string, id: string, userId: string, query: ListTaskCancellationsQueryDto = {}) {
    this.assertCancellationIdentity(tenantId, id, userId);
    const page = query.page ?? 1, limit = query.limit ?? TASK_LIST_DEFAULT_LIMIT;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException("Geçersiz geçmiş sayfası.");
    return this.prisma.$transaction(async tx => {
      await this.cancellationContext(tx, tenantId, id, userId);
      const where = { tenantId, taskId: id };
      const [events, total] = await Promise.all([
        tx.taskCancellationEvent.findMany({ where, orderBy: [{ createdAt: "desc" }, { id: "desc" }], skip: (page - 1) * limit, take: limit,
          select: { id: true, actorUserId: true, actorRole: true, authoritySource: true, fromStatus: true, toStatus: true, reason: true, createdAt: true } }),
        tx.taskCancellationEvent.count({ where }),
      ]);
      const actors = await tx.user.findMany({ where: { tenantId, id: { in: [...new Set(events.map(event => event.actorUserId))] } }, select: { id: true, name: true, surname: true } });
      const names = new Map(actors.map(actor => [actor.id, `${actor.name ?? ""} ${actor.surname ?? ""}`.trim()]));
      return { data: events.map(event => ({ ...event, actorName: names.get(event.actorUserId) || null })), meta: { page, limit, total, totalPages: Math.ceil(total / limit) } };
    });
  }
}

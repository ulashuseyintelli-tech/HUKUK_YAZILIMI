import { BadRequestException, Injectable, NotFoundException, ForbiddenException, Optional } from "@nestjs/common";

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
import { CreateTaskDto, TASK_LIST_DEFAULT_LIMIT, UpdateTaskDto } from "./dto/task.dto";
import { WorkScopePermissionService } from "@/modules/work-scope-permission/work-scope-permission.service";
import { TASK_VIEW_ALL_KEY, isTaskViewScopeEnabled, taskViewWhereFor } from "./task-view-scope";

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
  ) {}

  /**
   * F02-B dilim 3 (owner 29–30.10.2026, G3) — liste görünüm kapsamı (data + total + meta.summary birlikte).
   * Bayrak (OFFICE_TASK_VIEW_SCOPE_ENABLED) KAPALI → null = bugünkü davranış (büro geneli).
   * AÇIK → `office.tasks.view_all` çözümü: ALLOW (DENY yoksa) → büro geneli; DENY / NONE → varsayılan kapsam
   * (atanan ∪ oluşturan ∪ dosya bağı; dosyasız yalnız atanan/oluşturan — taskViewScopeWhere). Aktör kimliği ya da
   * izin servisi yoksa FAIL-CLOSED.
   *
   * @remarks Çağrıldığı yer: findAll() → GET /tasks.
   */
  private async viewScopeWhere(tenantId: string, actorUserId?: string): Promise<Prisma.TaskWhereInput | null> {
    if (!isTaskViewScopeEnabled()) return null;
    if (!actorUserId || !this.workScope) {
      throw new ForbiddenException({ code: "TASK_VIEW_SCOPE_UNRESOLVED", message: "Görev görünüm kapsamı çözümlenemedi" });
    }
    const resolution = await this.workScope.resolve(this.prisma, tenantId, actorUserId, TASK_VIEW_ALL_KEY);
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
      data: tasks,
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

  // Çağıran: TaskController.create → POST /tasks.
  async create(tenantId: string, userId: string, dto: CreateTaskDto) {
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
    await this.findOne(tenantId, id);
    await this.assertCaseTenant(tenantId, dto.caseId);

    // CANDIDATE-J1: dolu assignee güncellemesi → aynı-tenant + aktif doğrulaması. Assignee alanı
    // gönderilmeyen (veya boşaltılan) güncellemeler dokunulmaz (null assignee davranışı korunur).
    if (dto.assigneeId) {
      await this.assertAssigneeEligible(tenantId, dto.assigneeId);
    }

    const data: any = { ...dto, dueDate: normalizeDueDate(dto.dueDate) };
    if (dto.status === "COMPLETED") {
      data.completedAt = new Date();
      data.completedByUserId = userId; // insan kapanışı → kapatanı yakala
      data.resolutionType = "MANUAL";
    } else if (dto.status !== undefined) {
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
    await this.findOne(tenantId, id);
    return this.prisma.task.delete({ where: { id } });
  }
}

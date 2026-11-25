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
import { CancelTaskDto, CreateTaskDto, ListTaskCancellationsQueryDto, ListTaskHistoryQueryDto, ReviewTaskDto, SetTaskReviewRequirementDto, TASK_LIST_DEFAULT_LIMIT, UpdateTaskDto } from "./dto/task.dto";
import {
  TASK_HISTORY_ACTOR,
  TASK_HISTORY_AUTHORITY,
  TASK_HISTORY_EVENT,
  type TaskHistoryChange,
  createdTaskHistory,
  diffTaskHistory,
  newTaskHistoryCorrelationId,
  taskHistoryUserAuthority,
  userTaskHistoryRows,
} from "./task-history";
import {
  TASK_REVIEW_AUTHORITY,
  TASK_REVIEW_DECISION,
  TASK_REVIEW_ERROR,
  TASK_REVIEW_EVENT,
  TASK_REVIEW_STATUS,
  isAwaitingReview,
  isReviewApplicable,
  reviewEventForDecision,
  reviewStatusAfterDecision,
  statusAfterReviewDecision,
} from "./task-review";
import { isSameApprovalIdentity } from "@/common/approval-identity";
import { AuditService } from "@/modules/audit/audit.service";
import { WorkScopePermissionService } from "@/modules/work-scope-permission/work-scope-permission.service";
import { TASK_VIEW_ALL_KEY, isTaskViewScopeEnabled, taskViewCaseLinkWhere, taskViewWhereFor } from "./task-view-scope";
import { isCaseViewScopeEnabled } from "../case/case-view-scope";
import { CaseViewScopeService } from "../case/case-view-scope.service";

/** TaskController.findAll → TaskService.findAll sorgu parametreleri (ListTasksQueryDto ile uyumlu). */
export interface TaskListParams {
  status?: string;
  assigneeId?: string;
  /** F03-B2: dosya süzgeci (kapsam katmanında; data + total + summary birlikte daralır). */
  caseId?: string;
  /** F03-C: kontrol süzgeci — `AWAITING` yalnız kontrolde bekleyenler; `NOT_AWAITING` kontrolde bekleyenler hariç. */
  review?: string;
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

/** GET /tasks/:id/history: iki tablodan birleştirilen pencerenin üst sınırı (`page * limit`). Ötesi 400 döner. */
export const TASK_HISTORY_MAX_WINDOW = 2000;

/** Dosya kiracıda yoksa VE aktörün dosya kapsamı dışındaysa AYNI ileti (varlık sızmaz). */
const INVALID_TASK_CASE_MESSAGE = "Geçersiz dosya: aynı ofise ait bir dosya değil.";

/** F03-C (K5-b / K8): ekran bu iletiyi aynen gösterir — neden ve O ANDAKİ çıkış yolu birlikte. */
const REVIEWERS_HINT = "(kontrol edebilenler: görevi görebilen büro yöneticileri ve görevi oluşturan)";
const NO_ELIGIBLE_REVIEWER_MESSAGE = {
  /** İşaret konurken (oluşturma / sonradan işaretleme). */
  PLAN: `Bu görevi, işi yapacak kişiden başka kontrol edebilecek kişi yok ${REVIEWERS_HINT}. Görevi başka birine atayın ya da görevi kontrol işareti olmadan kaydedin.`,
  /** İşaretli görev atanırken. */
  ASSIGN: `Bu görevi, işi yapacak kişiden başka kontrol edebilecek kişi yok ${REVIEWERS_HINT}. Görevi başka birine atayın ya da önce kontrol işaretini gerekçeyle kaldırın.`,
  /** Tamamlanırken (K8). */
  COMPLETE: `Bu görevi, işi yapan kişiden başka kontrol edebilecek kişi yok ${REVIEWERS_HINT}. Görevi görebilen bir yönetici bulunmalı ya da kontrol işareti gerekçeyle kaldırılmalıdır.`,
} as const;
type NoReviewerMoment = keyof typeof NO_ELIGIBLE_REVIEWER_MESSAGE;
const REVIEW_AWAITING_MESSAGE = "Görev kontrolde; durumu yalnız kontrol kararıyla ya da kontrol işaretinin kaldırılmasıyla değişir.";
const CLOSED_TASK_STATUSES: ReadonlySet<string> = new Set(["COMPLETED", "CANCELLED"]);
/** Kontrol izinin sıfırlanması (işaretin kaldırılması / kapalı görevin yeniden açılması). İşaretin kendisine dokunmaz. */
const CLEARED_REVIEW_TRACE = {
  reviewStatus: null,
  reviewSubmittedAt: null,
  reviewSubmittedByUserId: null,
  reviewedAt: null,
  reviewedByUserId: null,
  reviewNote: null,
} as const;

type TaskStatusGroup = { status: PrismaTaskStatus; taskCategory: PrismaTaskCategory; reviewStatus: string | null; _count: { _all: number } };
type TaskDb = PrismaService | Prisma.TransactionClient;
/** F03-C: "kontrol edebilecek kişi" sayımında görevin görünürlüğünü belirleyen alanlar (yazılacak / yazılmış değerler). */
type ReviewTaskShape = { createdById: string | null; assigneeId: string | null; caseId: string | null };

/**
 * F03-C: "kontrolde" görev sunucuda IN_PROGRESS + reviewStatus AWAITING olarak durur. Sayaçlarda AYRI sayılır: `inProgress`
 * kontrolde bekleyenleri İÇERMEZ (ekrandaki "Devam Eden" listesiyle aynı küme), `awaitingReview` onları sayar. `operationalOpen`
 * açık iş tanımıdır ve değişmez (kontrolde görev açık iştir; tamamlanmış değildir).
 */
function summarizeTaskGroups(groups: TaskStatusGroup[]): { summary: TaskListSummary; awaitingReview: number } {
  const summary: TaskListSummary = { pending: 0, inProgress: 0, operationalOpen: 0 };
  let awaitingReview = 0;
  for (const group of groups) {
    const n = group._count._all;
    const open = group.status === "PENDING" || group.status === "IN_PROGRESS";
    const awaiting = isAwaitingReview(group);
    if (group.status === "PENDING") summary.pending += n;
    if (group.status === "IN_PROGRESS" && !awaiting) summary.inProgress += n;
    if (awaiting) awaitingReview += n;
    if (open && group.taskCategory === "OPERATIONAL_COMPLETENESS") summary.operationalOpen += n;
  }
  return { summary, awaitingReview };
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
    if (!record) throw new BadRequestException(INVALID_TASK_CASE_MESSAGE);
  }

  /**
   * F03-B2 (OFP-02; owner kararı K2-a, 25.11.2026) — görev bir dosyaya BAĞLANIRKEN (oluşturma ya da dosya bağının değişmesi)
   * aktör o dosyayı görebilmelidir: dosya görünüm kapsamı (`OFFICE_CASE_VIEW_SCOPE_ENABLED`). Kapsam dışı dosya, var olmayan /
   * başka büronun dosyasıyla AYNI 400 gövdesini alır (varlık sızmaz). Bayrak kapalı ya da büro geneli dosya izni → bugünkü
   * davranış (yalnız kiracı sınırı). Bayrak açık + servis yok → fail-closed. Dosyasız görev ve bağın kaldırılması etkilenmez.
   *
   * @remarks Çağrıldığı yerler: create() → POST /tasks; update() → PUT /tasks/:id (yalnız `caseId` DEĞİŞİYORSA).
   */
  private async assertCaseBindable(tenantId: string, actorUserId: string, caseId: string | null | undefined): Promise<void> {
    if (caseId === undefined || caseId === null) return;
    await this.assertCaseTenant(tenantId, caseId);
    if (!isCaseViewScopeEnabled()) return;
    if (!this.caseViewScope) {
      throw new ForbiddenException({ code: "CASE_VIEW_SCOPE_UNRESOLVED", message: "Dosya görünüm kapsamı çözümlenemedi" });
    }
    const visible = await this.caseViewScope.visibleCaseIds(tenantId, actorUserId, [caseId]);
    if (visible && !visible.has(caseId)) throw new BadRequestException(INVALID_TASK_CASE_MESSAGE);
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
   *   scopeWhere = tenant sınırı (+ assigneeId, caseId)  → data, total VE summary bu kapsamdadır
   *   where      = scopeWhere + status + taskCategory    → yalnız data ve total
   * Ekran sayaçları böylece seçili sekmeden bağımsız ve ilk sayfadan değil sunucu toplamından gelir.
   * Sıralama `id` ile kesinleştirilir: aynı öncelik/tarihli görevlerde sayfa sınırı kaymaz, kayıtlar
   * sayfalar arasında tekil kalır. Tenant sınırı (caseId null ∨ case.tenantId) değişmez.
   */
  async findAll(tenantId: string, params?: TaskListParams, actorUserId?: string) {
    const { status, assigneeId, caseId, taskCategory, review, page = 1, limit = TASK_LIST_DEFAULT_LIMIT } = params || {};

    const scopeWhere: Prisma.TaskWhereInput = { tenantId, OR: [{ caseId: null }, { case: { tenantId } }] };
    if (assigneeId) scopeWhere.assigneeId = assigneeId;
    // F03-B2: dosya süzgeci tenant sınırıyla (case.tenantId) VE görünüm kapsamıyla kesişir; kapsam genişletmez.
    if (caseId) scopeWhere.caseId = caseId;
    // F02-B dilim 3: görünüm kapsamı scopeWhere katmanına → data, total VE summary birlikte daralır.
    const viewScope = await this.viewScopeWhere(tenantId, actorUserId);
    if (viewScope) scopeWhere.AND = [viewScope];

    const where: Prisma.TaskWhereInput = { ...scopeWhere };
    if (status) where.status = status as PrismaTaskStatus;
    if (taskCategory) where.taskCategory = taskCategory as PrismaTaskCategory;
    // F03-C: kontrol süzgeci durum süzgeciyle KESİŞİR (yalnız data ve total; sayaçlar süzgeçten bağımsız kalır).
    const awaitingWhere: Prisma.TaskWhereInput = { status: "IN_PROGRESS", reviewStatus: TASK_REVIEW_STATUS.AWAITING };
    if (review === "AWAITING") where.AND = [...((scopeWhere.AND as Prisma.TaskWhereInput[] | undefined) ?? []), awaitingWhere];
    if (review === "NOT_AWAITING") where.AND = [...((scopeWhere.AND as Prisma.TaskWhereInput[] | undefined) ?? []), { NOT: awaitingWhere }];

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
        by: ["status", "taskCategory", "reviewStatus"],
        where: scopeWhere,
        _count: { _all: true },
      }),
    ]);

    const counts = summarizeTaskGroups(groups as TaskStatusGroup[]);
    return {
      data: await this.maskHiddenCases(tenantId, actorUserId, tasks),
      meta: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit),
        summary: counts.summary,
        // F03-C: kontrolde bekleyen görev sayısı (aynı kapsam; durum / kontrol süzgecinden bağımsız).
        awaitingReview: counts.awaitingReview,
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
    // F03-B2: dosyaya bağlı görev yalnız aktörün gördüğü dosyaya açılır (kiracı sınırı + dosya görünüm kapsamı).
    await this.assertCaseBindable(tenantId, userId, dto.caseId);
    // CANDIDATE-J1: dolu assignee → aynı-tenant + aktif doğrulaması. Boş/null assignee dokunulmaz
    // (sahipsiz görev meşru; null assignee davranışı korunur).
    if (dto.assigneeId) {
      await this.assertAssigneeEligible(tenantId, dto.assigneeId);
    }
    const dueDate = normalizeDueDate(dto.dueDate);
    const audit = this.requireHistoryAudit();
    // F03-C: kontrol tamamlama anında işler; tamamlanmış olarak açılan görev kontrolü atlamış olurdu.
    if (dto.reviewRequired === true && dto.status === "COMPLETED") {
      throw new ConflictException({ code: TASK_REVIEW_ERROR.NOT_APPLICABLE, message: "Tamamlanmış olarak açılan görev kontrole tabi tutulamaz." });
    }

    // F03-A2 (OFP-03a / OFF-INV-08): görev + geçmiş satırı + denetim kaydı TEK işlemde; biri yazılamazsa hiçbiri kalmaz.
    return this.prisma.$transaction(async tx => {
      const actor = await this.historyActor(tx, tenantId, userId);
      // F03-C (K4-b, K5-b): işareti oluşturan koyar; işi yapacak kişiden başka kontrol edebilecek kişi yoksa işaret konamaz.
      if (dto.reviewRequired === true) {
        await this.assertReviewerExists(tx, tenantId, { createdById: userId, assigneeId: dto.assigneeId || null, caseId: dto.caseId || null }, dto.assigneeId || null, "PLAN");
      }
      const created = await tx.task.create({
        data: {
          tenantId,
          createdById: userId,
          ...dto,
          dueDate,
        },
      });
      const correlationId = newTaskHistoryCorrelationId();
      const change = createdTaskHistory(created);
      const changes: TaskHistoryChange[] = [change];
      if (created.reviewRequired) changes.push({ eventType: TASK_REVIEW_EVENT.REQUIREMENT_SET, fromValue: "false", toValue: "true" });
      await tx.taskHistoryEvent.createMany({
        data: userTaskHistoryRows({ tenantId, taskId: created.id, actor, authoritySource: TASK_HISTORY_AUTHORITY.CREATOR, correlationId, changes }),
      });
      await audit.logInTransaction(tx, {
        tenantId, userId: actor.id, action: "TASK_CREATED", entityType: "TASK", entityId: created.id,
        description: "Görev oluşturuldu.",
        newValues: created.reviewRequired ? { ...(change.details as Record<string, unknown>), reviewRequired: true } : (change.details as Record<string, unknown>),
        correlationId,
        metadata: { authoritySource: TASK_HISTORY_AUTHORITY.CREATOR, historyEvents: changes.map(item => item.eventType) },
      });
      return created;
    });
  }

  /** F03-A2: geçmiş + denetim kaydı domain yazımıyla AYNI işlemdedir; denetim servisi yoksa yazım hiç başlamaz (fail-closed). */
  private requireHistoryAudit(): AuditService {
    if (!this.audit) throw new ServiceUnavailableException("Görev geçmişi denetim kaydı kullanılamıyor.");
    return this.audit;
  }

  /** F03-A2: aktör aktif ve aynı büroda olmalı; rolü geçmiş satırına anlık görüntü olarak yazılır (iptal yoluyla aynı doğrulama). */
  private async historyActor(db: TaskDb, tenantId: string, userId: string) {
    const actor = await db.user.findFirst({ where: { id: userId, tenantId, isActive: true }, select: { id: true, role: true } });
    if (!actor) throw new ForbiddenException("Görev aktörü doğrulanamadı.");
    return actor;
  }

  /**
   * <remarks>
   * Çağrıldığı yerler:
   * - TaskController.update() → PUT /tasks/:id (görev güncelleme; manuel kapanış)
   * </remarks>
   * PR-PERF-1 kapanış atfı: status=COMPLETED → completedByUserId=userId + resolutionType=MANUAL.
   * Görev COMPLETED'dan çıkarılırsa (yeniden açılır) kapanış alanları temizlenir (yalan veri bırakmaz).
   *
   * F03-A1 (K-7; owner yetkisi 25.11.2026): kapanış atfı yalnız GERÇEK geçişte (COMPLETED olmayan → COMPLETED) yazılır.
   * Zaten tamamlanmış göreve aynı durumun yeniden gönderilmesi (ör. düzenleme formunun durumu aynen geri göndermesi) atfı ve
   * tamamlanma anını EZMEZ; sistem kapanışı (AUTO_SYSTEM) insan atfına dönüşmez. Geçişin gerçek olup olmadığına satır kilidi
   * altında okunan duruma göre karar verilir: eşzamanlı iki tamamlamada atfı ilk yazan alır, ikincisi ezmez.
   */
  async update(tenantId: string, id: string, userId: string, dto: UpdateTaskDto) {
    // Ön doğrulamalar kilitsiz okumayla yapılır (404, dosya ve atanan kuralları); durum geçişi kararı aşağıda kilit altındadır.
    const current = await this.findOne(tenantId, id);
    if (dto.status === "CANCELLED" && current.status !== "CANCELLED") {
      throw new BadRequestException("Durum değişikliği için gerekçeli iptal işlemini kullanın.");
    }
    // F03-B2: dosya bağı DEĞİŞİYORSA yeni dosya aktörün kapsamında olmalı. Bağ aynı kalıyorsa yalnız kiracı sınırı sınanır:
    // atanan, görmediği dosyaya bağlı görevini (ekran formu `caseId`'yi aynen geri gönderir) düzenlemeyi sürdürür.
    if (dto.caseId !== undefined && dto.caseId !== current.caseId) await this.assertCaseBindable(tenantId, userId, dto.caseId);
    else await this.assertCaseTenant(tenantId, dto.caseId);

    // CANDIDATE-J1: dolu assignee güncellemesi → aynı-tenant + aktif doğrulaması. Assignee alanı
    // gönderilmeyen (veya boşaltılan) güncellemeler dokunulmaz (null assignee davranışı korunur).
    if (dto.assigneeId) {
      await this.assertAssigneeEligible(tenantId, dto.assigneeId);
    }

    const audit = this.requireHistoryAudit();
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "Task" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      // F03-A2: kilit altında TAM satır okunur — geçmiş farkı bu "önceki" duruma göre hesaplanır.
      const existing = await tx.task.findFirst({ where: { id, tenantId } });
      if (!existing) throw new NotFoundException("Görev bulunamadı");
      // An unchanged CANCELLED field is not authority to cancel again after a concurrent reopen.
      if (dto.status === "CANCELLED" && existing.status !== "CANCELLED") {
        throw new BadRequestException("Durum değişikliği için gerekçeli iptal işlemini kullanın.");
      }
      const actor = await this.historyActor(tx, tenantId, userId);

      // F03-C: kontrolde bekleyen görevin durumu yalnız kontrol kararıyla ya da işaretin kaldırılmasıyla değişir. Durumu aynen
      // geri gönderen düzenleme (ekran formu) serbesttir.
      const awaiting = isAwaitingReview(existing);
      if (awaiting && dto.status !== undefined && dto.status !== "IN_PROGRESS") {
        throw new ConflictException({ code: TASK_REVIEW_ERROR.AWAITING, message: REVIEW_AWAITING_MESSAGE });
      }
      // F03-C (K5-b): işaretli açık görev, kontrol edebilecek kişi bırakmayan birine atanamaz. Kontrolde bekleyen görevde işi
      // yapan zaten bellidir; atama değişikliği kontrol edebilecekleri değiştirmez.
      const nextAssigneeId = dto.assigneeId !== undefined ? dto.assigneeId || null : existing.assigneeId;
      const reviewShape: ReviewTaskShape = {
        createdById: existing.createdById,
        assigneeId: nextAssigneeId,
        caseId: dto.caseId !== undefined ? dto.caseId || null : existing.caseId,
      };
      if (existing.reviewRequired && !awaiting && !CLOSED_TASK_STATUSES.has(existing.status) && nextAssigneeId && nextAssigneeId !== existing.assigneeId) {
        await this.assertReviewerExists(tx, tenantId, reviewShape, nextAssigneeId, "ASSIGN");
      }

      const data: any = { ...dto, dueDate: normalizeDueDate(dto.dueDate) };
      if (dto.status === "CANCELLED") delete data.status;
      let submittedForReview = false;
      if (dto.status === "COMPLETED") {
        if (existing.status !== "COMPLETED") {
          if (existing.reviewRequired) {
            // F03-C (K3-a, K8): "kontrol gerekli" görev tamamlanınca TAMAMLANMIŞ SAYILMAZ; kontrolde bekler (durum IN_PROGRESS
            // kalır, kapanış atfı yazılmaz). İşi yapan = tamamlayan hesap. Ondan başka kontrol edebilecek kişi yoksa tamamlama
            // reddedilir (409); görev değişmez.
            await this.assertReviewerExists(tx, tenantId, reviewShape, userId, "COMPLETE");
            submittedForReview = true;
            data.status = "IN_PROGRESS";
            data.reviewStatus = TASK_REVIEW_STATUS.AWAITING;
            data.reviewSubmittedAt = new Date();
            data.reviewSubmittedByUserId = userId;
            // Önceki karar (revizyon / ret) satırdan düşer; geçmişte kalır.
            data.reviewedAt = null;
            data.reviewedByUserId = null;
            data.reviewNote = null;
          } else {
            data.completedAt = new Date();
            data.completedByUserId = userId; // insan kapanışı → kapatanı yakala
            data.resolutionType = "MANUAL";
          }
        }
      } else if (dto.status !== undefined && dto.status !== "CANCELLED") {
        // COMPLETED dışı bir statüye geçiş (yeniden açma vb.) → kapanış izini temizle.
        data.completedAt = null;
        data.completedByUserId = null;
        data.resolutionType = null;
        // F03-C: kapalı görevin yeniden açılması kontrol izini sıfırlar; işaret kalır → yeniden tamamlama yeniden kontrole girer.
        if (CLOSED_TASK_STATUSES.has(existing.status) && existing.reviewStatus) Object.assign(data, CLEARED_REVIEW_TRACE);
      }

      const updated = await tx.task.update({
        where: { id },
        data,
      });

      // F03-A2 (OFP-03a / OFF-INV-08): yalnız DEĞİŞEN izlenen alanlar (atama, durum, öncelik, son tarih, dosya bağı, yeniden açma)
      // geçmişe yazılır; değişmeyen değer ve izlenmeyen alan (başlık, açıklama) satır üretmez. Geçmiş + denetim kaydı bu
      // işlemin parçasıdır: yazılamazsa görev değişikliği de geri alınır.
      let changes: TaskHistoryChange[] = diffTaskHistory(existing, updated);
      if (submittedForReview) {
        // Kontrole gönderme tek olaydır: "bekliyor → devam ediyor" durum satırı yerine REVIEW_SUBMITTED yazılır.
        changes = [
          ...changes.filter(change => change.eventType !== TASK_HISTORY_EVENT.STATUS_CHANGED),
          { eventType: TASK_REVIEW_EVENT.SUBMITTED, fromValue: existing.status, toValue: updated.status },
        ];
      }
      if (changes.length > 0) {
        const correlationId = newTaskHistoryCorrelationId();
        const authoritySource = taskHistoryUserAuthority(actor, existing);
        await tx.taskHistoryEvent.createMany({ data: userTaskHistoryRows({ tenantId, taskId: id, actor, authoritySource, correlationId, changes }) });
        await audit.logInTransaction(tx, {
          tenantId, userId: actor.id, action: "TASK_UPDATED", entityType: "TASK", entityId: id,
          description: "Görev güncellendi.",
          oldValues: Object.fromEntries(changes.map(change => [change.eventType, change.fromValue])),
          newValues: Object.fromEntries(changes.map(change => [change.eventType, change.toValue])),
          correlationId,
          metadata: { authoritySource, historyEvents: changes.map(change => change.eventType) },
        });
      }
      return updated;
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
        // F03-C: iptal, bekleyen kontrolü / son karar izini düşürür (iptal kaydı önceki durumu ayrıca saklar).
        ...(task.reviewStatus ? { reviewStatus: null } : {}),
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

  /**
   * F03-C (K5b-a) — kontrol edebilenler: aynı büronun aktif ADMIN'leri + görevi oluşturan (aktif, VIEWER değil). `doerUserId`
   * verilirse onunla AYNI KİŞİ olanlar (aynı hesap ya da aynı kişinin başka hesabı; `common/approval-identity`) çıkarılır.
   * Karar ucu görev görünüm kapsamına bağlıdır (review() → cancellationContext); sayım da AYNI kapsamı uygular: görevi göremeyen
   * yönetici "kontrol edebilecek kişi" SAYILMAZ (rol tek başına kapsam üretmez). Sorgular sıralıdır (işlem istemcisi eşzamanlı
   * sorgu çalıştırmaz).
   *
   * @remarks Çağrıldığı yer: assertReviewerExists() → create / update / setReviewRequirement.
   */
  private async eligibleReviewerIds(db: TaskDb, tenantId: string, shape: ReviewTaskShape, doerUserId: string | null): Promise<string[]> {
    const admins = await db.user.findMany({ where: { tenantId, isActive: true, role: "ADMIN" }, select: { id: true } });
    const candidates = new Set(admins.map(admin => admin.id));
    if (shape.createdById) {
      const creator = await db.user.findFirst({ where: { id: shape.createdById, tenantId, isActive: true, role: { not: "VIEWER" } }, select: { id: true } });
      if (creator) candidates.add(creator.id);
    }
    const eligible: string[] = [];
    for (const candidate of candidates) {
      if (doerUserId && (await isSameApprovalIdentity(db, candidate, doerUserId, tenantId))) continue;
      if (!(await this.reviewerSeesTask(db, tenantId, candidate, shape))) continue;
      eligible.push(candidate);
    }
    return eligible;
  }

  /**
   * F03-C: adayın görevi görüp göremeyeceği — liste kapsamıyla AYNI kural (`taskViewWhereFor`): bayrak kapalı → büro geneli;
   * açık → `office.tasks.view_all` ALLOW (DENY yoksa) ya da atanan ∪ oluşturan ∪ dosya bağı. Bayrak açık + izin servisi yok →
   * fail-closed. Görev henüz yazılmamış olabilir (oluşturma / atama değişikliği) → satır yerine yazılacak değerlerle sınanır.
   */
  private async reviewerSeesTask(db: TaskDb, tenantId: string, candidateId: string, shape: ReviewTaskShape): Promise<boolean> {
    if (!isTaskViewScopeEnabled()) return true;
    if (!this.workScope) {
      throw new ForbiddenException({ code: "TASK_VIEW_SCOPE_UNRESOLVED", message: "Görev görünüm kapsamı çözümlenemedi" });
    }
    if (shape.createdById === candidateId || shape.assigneeId === candidateId) return true;
    if ((await this.workScope.resolve(db, tenantId, candidateId, TASK_VIEW_ALL_KEY)) === "ALLOW") return true;
    if (!shape.caseId) return false;
    return (await db.case.count({ where: { id: shape.caseId, ...taskViewCaseLinkWhere(tenantId, candidateId) } })) > 0;
  }

  /** F03-C (K5-b / K8): işi yapandan (yapacak olandan) başka kontrol edebilecek kişi yoksa 409; ekran nedeni yazar. */
  private async assertReviewerExists(db: TaskDb, tenantId: string, shape: ReviewTaskShape, doerUserId: string | null, moment: NoReviewerMoment): Promise<void> {
    if ((await this.eligibleReviewerIds(db, tenantId, shape, doerUserId)).length === 0) {
      throw new ConflictException({ code: TASK_REVIEW_ERROR.NO_ELIGIBLE_REVIEWER, message: NO_ELIGIBLE_REVIEWER_MESSAGE[moment] });
    }
  }

  /**
   * TaskController.setReviewRequirement -> POST /tasks/:id/review-requirement (F03-C; owner kararları K4-b, K5-b, K8).
   * - Koyma: YALNIZ görevi oluşturan; kullanıcının açtığı açık görevde (sistem görevi kontrole girmez); işi yapacak kişiden başka
   *   kontrol edebilecek kişi yoksa konamaz (409).
   * - Kaldırma: görevi oluşturan ya da ADMIN; gerekçe ZORUNLU; kontrol bekleniyorsa bekleyen kontrol düşer (görev "devam ediyor"
   *   kalır). Kaldırma gerekçesiyle geçmişe yazılır.
   * Yetki: aktif büro kullanıcısı + görev görünüm kapsamı (kapsam dışı görev var olmayanla aynı 404); VIEWER yazamaz.
   */
  async setReviewRequirement(tenantId: string, id: string, userId: string, dto: SetTaskReviewRequirementDto) {
    this.assertCancellationIdentity(tenantId, id, userId);
    const required = dto?.required === true;
    const reason = typeof dto?.reason === "string" ? dto.reason.trim() : "";
    if (!required && (!reason || reason.length > 2000 || reason.includes("\u0000"))) {
      throw new BadRequestException("Kontrol işaretini kaldırma gerekçesi 1–2000 karakter olmalıdır.");
    }
    const audit = this.requireHistoryAudit();
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} AND "tenantId" = ${tenantId} FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "Task" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const { actor, task } = await this.cancellationContext(tx, tenantId, id, userId);
      const isCreator = !!task.createdById && task.createdById === actor.id;
      const mayChange = actor.role !== "VIEWER" && (isCreator || (!required && actor.role === "ADMIN"));
      if (!mayChange) {
        throw new ForbiddenException({
          code: TASK_REVIEW_ERROR.NOT_AUTHORIZED,
          message: required ? "Kontrol işaretini yalnız görevi oluşturan koyabilir." : "Kontrol işaretini yalnız görevi oluşturan ya da büro yöneticisi kaldırabilir.",
        });
      }
      if (CLOSED_TASK_STATUSES.has(task.status) || (required && !isReviewApplicable(task))) {
        throw new ConflictException({ code: TASK_REVIEW_ERROR.NOT_APPLICABLE, message: "Bu görev kontrole tabi tutulamaz (kapalı görev ya da sistem görevi)." });
      }
      // Masraf talebine bağlı görev (`ExpenseRequest.taskId`) sistem türevidir: ödeme tamamlanınca sistem kapatır (AUTO_SYSTEM).
      // Kullanıcının açtığı görev sayılmaz → kontrole girmez. Yalnız OKUMA: masraf–görev bağı ve masraf servisi değişmez.
      if (required && (await tx.expenseRequest.count({ where: { tenantId, taskId: id } })) > 0) {
        throw new ConflictException({ code: TASK_REVIEW_ERROR.NOT_APPLICABLE, message: "Masraf talebine bağlı görev kontrole tabi tutulamaz." });
      }
      if (task.reviewRequired === required) {
        throw new ConflictException({
          code: TASK_REVIEW_ERROR.NOT_APPLICABLE,
          message: required ? "Görev zaten kontrol gerekli olarak işaretli." : "Görevde kontrol işareti yok.",
        });
      }
      if (required) {
        await this.assertReviewerExists(tx, tenantId, { createdById: task.createdById, assigneeId: task.assigneeId, caseId: task.caseId }, task.assigneeId, "PLAN");
      }

      const droppedAwaitingReview = !required && isAwaitingReview(task);
      const updated = await tx.task.update({
        where: { id },
        data: required ? { reviewRequired: true } : { reviewRequired: false, ...CLEARED_REVIEW_TRACE },
      });
      const correlationId = newTaskHistoryCorrelationId();
      const authoritySource = isCreator ? TASK_HISTORY_AUTHORITY.CREATOR : TASK_HISTORY_AUTHORITY.ADMIN;
      const change: TaskHistoryChange = required
        ? { eventType: TASK_REVIEW_EVENT.REQUIREMENT_SET, fromValue: "false", toValue: "true" }
        : { eventType: TASK_REVIEW_EVENT.REQUIREMENT_REMOVED, fromValue: "true", toValue: "false", reason, details: { droppedAwaitingReview, previousReviewStatus: task.reviewStatus } };
      await tx.taskHistoryEvent.createMany({ data: userTaskHistoryRows({ tenantId, taskId: id, actor, authoritySource, correlationId, changes: [change] }) });
      await audit.logInTransaction(tx, {
        tenantId, userId: actor.id, action: required ? "TASK_REVIEW_REQUIREMENT_SET" : "TASK_REVIEW_REQUIREMENT_REMOVED", entityType: "TASK", entityId: id,
        description: required ? "Görev kontrol gerekli olarak işaretlendi." : "Görevin kontrol işareti gerekçeyle kaldırıldı.",
        oldValues: { reviewRequired: task.reviewRequired, reviewStatus: task.reviewStatus },
        newValues: { reviewRequired: updated.reviewRequired, reviewStatus: updated.reviewStatus },
        correlationId,
        // Gerekçe domain kaydındadır (TaskHistoryEvent.reason); ham denetim kaydına yazılmaz.
        metadata: {
          authoritySource, historyEvents: [change.eventType], droppedAwaitingReview,
          ...(required ? {} : { reasonPresent: true, reasonLength: reason.length, reasonHash: createHash("sha256").update(reason).digest("hex") }),
        },
      });
      return updated;
    });
  }

  /**
   * TaskController.review -> POST /tasks/:id/review (F03-C / OFP-04; owner kararları K3-a, K5b-a, K9). Bağımsız İLK kontrol:
   * nihai avukat onayı DEĞİLDİR ve ADR-009 onay motorunu kullanmaz; görevin kendi durum makinesidir.
   * - Karar verebilen: aynı büronun ADMIN'i ya da görevi oluşturan; işi yapanla AYNI KİŞİ olamaz (kişi düzeyi: aynı hesap ya da
   *   aynı kişinin başka hesabı). Atanmış olmak ya da büro kullanıcısı olmak yetki vermez.
   * - Onay → TAMAMLANDI; tamamlama atfı İŞİ YAPANA yazılır (kontrol eden `reviewedByUserId`'dedir).
   * - Revizyon → işi yapanda "devam ediyor" (atanan işi yapan değilse ve işi yapan hâlâ aktifse görev ona atanır).
   * - Ret → HAVUZA: görev "bekliyor" olur ve ATANANI KALDIRILIR (iş yapılmamış sayılır; görev başka birine atanmayı bekler).
   *   Owner kararının metni "Revizyon kişiye, ret havuza"dır; seçilmeyen seçenek "ikisi de aynı kişiye" idi. Reddedilen görev
   *   işi yapanın üstünde kalsaydı ret de "aynı kişiye" dönmüş olurdu.
   * Ret ve revizyonda gerekçe zorunludur; karar ve gerekçe görevde ve geçmişte kalır.
   */
  async review(tenantId: string, id: string, userId: string, dto: ReviewTaskDto) {
    this.assertCancellationIdentity(tenantId, id, userId);
    const decision = dto?.decision;
    if (decision !== TASK_REVIEW_DECISION.APPROVE && decision !== TASK_REVIEW_DECISION.REJECT && decision !== TASK_REVIEW_DECISION.REQUEST_REVISION) {
      throw new BadRequestException("Geçersiz kontrol kararı.");
    }
    const note = typeof dto?.note === "string" ? dto.note.trim() : "";
    if (note.length > 2000 || note.includes("\u0000")) throw new BadRequestException("Kontrol notu en çok 2000 karakter olabilir.");
    if (decision !== TASK_REVIEW_DECISION.APPROVE && !note) throw new BadRequestException("Ret ve revizyon için gerekçe zorunludur (1–2000 karakter).");
    const audit = this.requireHistoryAudit();
    return this.prisma.$transaction(async tx => {
      // Önce hesap yetkisi, sonra görev satırı kilitlenir; eşzamanlı iki karardan ikincisi ilk commit'i görür (409).
      await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId} AND "tenantId" = ${tenantId} FOR SHARE`;
      await tx.$queryRaw`SELECT "id" FROM "Task" WHERE "id" = ${id} AND "tenantId" = ${tenantId} FOR UPDATE`;
      const { actor, task } = await this.cancellationContext(tx, tenantId, id, userId);
      const isCreator = !!task.createdById && task.createdById === actor.id;
      if (actor.role === "VIEWER" || (actor.role !== "ADMIN" && !isCreator)) {
        throw new ForbiddenException({ code: TASK_REVIEW_ERROR.NOT_AUTHORIZED, message: "Kontrol kararını yalnız büro yöneticisi ya da görevi oluşturan verebilir." });
      }
      const doerUserId = task.reviewSubmittedByUserId;
      if (!isAwaitingReview(task) || !doerUserId) {
        throw new ConflictException({ code: TASK_REVIEW_ERROR.NOT_AWAITING, message: "Bu görev için bekleyen bir kontrol yok." });
      }
      if (await isSameApprovalIdentity(tx, actor.id, doerUserId, tenantId)) {
        throw new ForbiddenException({ code: TASK_REVIEW_ERROR.SAME_PERSON, message: "İşi yapan kişi kendi işini kontrol edemez (aynı kişinin başka hesabı da sayılır)." });
      }

      const now = new Date();
      const nextStatus = statusAfterReviewDecision(decision);
      const data: Prisma.TaskUncheckedUpdateInput = {
        status: nextStatus,
        reviewStatus: reviewStatusAfterDecision(decision),
        reviewedAt: now,
        reviewedByUserId: actor.id,
        reviewNote: note || null,
      };
      if (decision === TASK_REVIEW_DECISION.APPROVE) {
        data.completedAt = now;
        data.completedByUserId = doerUserId; // tamamlama atfı işi yapanındır; kontrol eden ayrı alandadır
        data.resolutionType = "MANUAL";
      }
      if (decision === TASK_REVIEW_DECISION.REQUEST_REVISION && task.assigneeId !== doerUserId) {
        const doerActive = await tx.user.findFirst({ where: { id: doerUserId, tenantId, isActive: true }, select: { id: true } });
        if (doerActive) data.assigneeId = doerUserId;
      }
      // K9 "ret havuza": reddedilen görev kimsenin üstünde kalmaz (atanan işi yapan olsun olmasın). Atama değişikliği aşağıda
      // aynı korelasyonla geçmişe yazılır.
      if (decision === TASK_REVIEW_DECISION.REJECT && task.assigneeId) data.assigneeId = null;
      const updated = await tx.task.update({ where: { id }, data });

      const correlationId = newTaskHistoryCorrelationId();
      const authoritySource = isCreator ? TASK_REVIEW_AUTHORITY.CREATOR : TASK_REVIEW_AUTHORITY.ADMIN;
      const changes: TaskHistoryChange[] = [{
        eventType: reviewEventForDecision(decision) as TaskHistoryChange["eventType"],
        fromValue: task.status,
        toValue: updated.status,
        ...(note ? { reason: note } : {}),
        details: { doerUserId, reviewSubmittedAt: task.reviewSubmittedAt ? task.reviewSubmittedAt.toISOString() : null },
      }];
      if ((task.assigneeId ?? null) !== (updated.assigneeId ?? null)) {
        changes.push({ eventType: TASK_HISTORY_EVENT.ASSIGNEE_CHANGED, fromValue: task.assigneeId ?? null, toValue: updated.assigneeId ?? null });
      }
      await tx.taskHistoryEvent.createMany({ data: userTaskHistoryRows({ tenantId, taskId: id, actor, authoritySource, correlationId, changes }) });
      await audit.logInTransaction(tx, {
        tenantId, userId: actor.id, action: "TASK_REVIEW_DECIDED", entityType: "TASK", entityId: id,
        description: "Görev kontrol kararı verildi.",
        oldValues: { status: task.status, reviewStatus: task.reviewStatus },
        newValues: { status: updated.status, reviewStatus: updated.reviewStatus },
        correlationId,
        // Not / gerekçe domain kaydındadır (Task.reviewNote + TaskHistoryEvent.reason); ham denetim kaydına yazılmaz.
        metadata: {
          decision, authoritySource, doerUserId, historyEvents: changes.map(change => change.eventType),
          notePresent: !!note, ...(note ? { noteLength: note.length, noteHash: createHash("sha256").update(note).digest("hex") } : {}),
        },
      });
      return updated;
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

  /**
   * TaskController.findHistory -> GET /tasks/:id/history (F03-A2 / OFP-03a). Genel geçmiş (`TaskHistoryEvent`) ile gerekçeli
   * iptaller (`TaskCancellationEvent`) TEK listede, yeni → eski sıralı döner. Yetki iptal geçmişiyle AYNIDIR (aktif büro kullanıcısı
   * + görev görünüm kapsamı; kapsam dışı görev var olmayanla aynı 404). Ham denetim ucu DEĞİLDİR: alan izdüşümü sabittir
   * (`details`, kiracı ve görev kimliği dönmez). Dosya bağı değişikliğinde dosya NUMARASI yalnız dosya aktöre görünüyorsa yazılır
   * (görev erişimi dosya erişimi üretmez); dosya kimliği görevin kendi sütunudur ve bugünkü görev yanıtıyla aynı kalır.
   * `meta.coverage` kapsam sınırını bildirir: eski görevde oluşturma kaydı yoktur ve sistem üreticilerinin yazımları (müvekkil
   * eksik-bilgi yeniden doğuşu dışında) bu geçmişe girmez — ekran kayıtlı olmayanı "değişmedi" gibi göstermez.
   */
  async findHistory(tenantId: string, id: string, userId: string, query: ListTaskHistoryQueryDto = {}) {
    this.assertCancellationIdentity(tenantId, id, userId);
    const page = query.page ?? 1, limit = query.limit ?? TASK_LIST_DEFAULT_LIMIT;
    if (!Number.isInteger(page) || page < 1 || !Number.isInteger(limit) || limit < 1 || limit > 100) throw new BadRequestException("Geçersiz geçmiş sayfası.");
    // İki tablo bellekte birleştirilir: her birinden en çok `page * limit` satır okunur; pencere üst sınırlıdır.
    const window = page * limit;
    if (window > TASK_HISTORY_MAX_WINDOW) throw new BadRequestException("Geçmiş sayfası sınırın ötesinde.");

    const read = await this.prisma.$transaction(async tx => {
      await this.cancellationContext(tx, tenantId, id, userId);
      const where = { tenantId, taskId: id };
      const orderBy = [{ createdAt: "desc" as const }, { id: "desc" as const }];
      // İşlem istemcisi eşzamanlı sorgu çalıştırmaz → sorgular sıralıdır.
      const history = await tx.taskHistoryEvent.findMany({ where, orderBy, take: window,
        select: { id: true, eventType: true, actorType: true, actorUserId: true, actorRole: true, authoritySource: true, fromValue: true, toValue: true, reason: true, correlationId: true, createdAt: true } });
      const cancellations = await tx.taskCancellationEvent.findMany({ where, orderBy, take: window,
        select: { id: true, actorUserId: true, actorRole: true, authoritySource: true, fromStatus: true, toStatus: true, reason: true, createdAt: true } });
      const total = (await tx.taskHistoryEvent.count({ where })) + (await tx.taskCancellationEvent.count({ where }));
      const creationRecorded = (await tx.taskHistoryEvent.count({ where: { ...where, eventType: TASK_HISTORY_EVENT.CREATED } })) > 0;

      const merged = [
        ...history.map(event => ({ ...event, kind: "HISTORY" as const, actorRole: event.actorRole as string | null })),
        ...cancellations.map(event => ({
          id: event.id, kind: "CANCELLATION" as const, eventType: "CANCELLED", actorType: TASK_HISTORY_ACTOR.USER as string,
          actorUserId: event.actorUserId as string | null, actorRole: event.actorRole as string | null, authoritySource: event.authoritySource,
          fromValue: event.fromStatus as string | null, toValue: event.toStatus as string | null, reason: event.reason as string | null,
          correlationId: null as string | null, createdAt: event.createdAt,
        })),
      ]
        .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime() || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0))
        .slice((page - 1) * limit, page * limit);

      const userIds = new Set<string>();
      const caseIds = new Set<string>();
      for (const event of merged) {
        if (event.actorUserId) userIds.add(event.actorUserId);
        for (const value of [event.fromValue, event.toValue]) {
          if (!value) continue;
          if (event.eventType === TASK_HISTORY_EVENT.ASSIGNEE_CHANGED) userIds.add(value);
          if (event.eventType === TASK_HISTORY_EVENT.CASE_LINK_CHANGED) caseIds.add(value);
        }
      }
      const users = userIds.size ? await tx.user.findMany({ where: { tenantId, id: { in: [...userIds] } }, select: { id: true, name: true, surname: true } }) : [];
      const cases = caseIds.size ? await tx.case.findMany({ where: { tenantId, id: { in: [...caseIds] } }, select: { id: true, fileNumber: true } }) : [];
      return { merged, users, cases, total, creationRecorded };
    });

    // Dosya numarası yalnız aktörün gördüğü dosya için yazılır (bayrak kapalı / büro geneli izin → null = süzme yok).
    let visibleCases: Set<string> | null = null;
    if (read.cases.length > 0 && isCaseViewScopeEnabled()) {
      if (!this.caseViewScope) {
        throw new ForbiddenException({ code: "CASE_VIEW_SCOPE_UNRESOLVED", message: "Dosya görünüm kapsamı çözümlenemedi" });
      }
      visibleCases = await this.caseViewScope.visibleCaseIds(tenantId, userId, read.cases.map(row => row.id));
    }
    const userNames = new Map(read.users.map(user => [user.id, `${user.name ?? ""} ${user.surname ?? ""}`.trim()]));
    const fileNumbers = new Map(read.cases.filter(row => !visibleCases || visibleCases.has(row.id)).map(row => [row.id, row.fileNumber]));
    const labelOf = (eventType: string, value: string | null): string | null => {
      if (!value) return null;
      if (eventType === TASK_HISTORY_EVENT.ASSIGNEE_CHANGED) return userNames.get(value) || null;
      if (eventType === TASK_HISTORY_EVENT.CASE_LINK_CHANGED) return fileNumbers.get(value) ?? null;
      return null;
    };

    return {
      data: read.merged.map(event => ({
        id: event.id, kind: event.kind, eventType: event.eventType, actorType: event.actorType,
        actorUserId: event.actorUserId, actorName: (event.actorUserId && userNames.get(event.actorUserId)) || null,
        actorRole: event.actorRole, authoritySource: event.authoritySource,
        fromValue: event.fromValue, toValue: event.toValue,
        fromLabel: labelOf(event.eventType, event.fromValue), toLabel: labelOf(event.eventType, event.toValue),
        reason: event.reason, correlationId: event.correlationId, createdAt: event.createdAt,
      })),
      meta: {
        page, limit, total: read.total, totalPages: Math.ceil(read.total / limit),
        coverage: { creationRecorded: read.creationRecorded, systemWritersRecorded: false },
      },
    };
  }
}

import { BadRequestException, Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateTaskDto, UpdateTaskDto } from "./dto/task.dto";

@Injectable()
export class TaskService {
  constructor(private prisma: PrismaService) {}

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

  async findAll(tenantId: string, params?: { status?: string; page?: number; limit?: number }) {
    const { status, page = 1, limit = 20 } = params || {};

    const where: any = { tenantId };
    if (status) where.status = status;

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        include: {
          case: { select: { id: true, fileNumber: true } },
          // Operasyonel görevler (ör. iletişim eksiği) müvekkile bağlı, dosyaya değil →
          // görev kartında müvekkil adını gösterip "Müvekkile git" linki kurabilmek için.
          client: { select: { id: true, displayName: true, companyName: true, firstName: true, lastName: true } },
          assignee: { select: { id: true, name: true, surname: true } },
        },
        orderBy: [{ priority: "desc" }, { dueDate: "asc" }],
        skip: (page - 1) * limit,
        take: limit,
      }),
      this.prisma.task.count({ where }),
    ]);

    return {
      data: tasks,
      meta: { total, page, limit, totalPages: Math.ceil(total / limit) },
    };
  }

  async findOne(tenantId: string, id: string) {
    const task = await this.prisma.task.findFirst({
      where: { id, tenantId },
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

  async create(tenantId: string, userId: string, dto: CreateTaskDto) {
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

    // CANDIDATE-J1: dolu assignee güncellemesi → aynı-tenant + aktif doğrulaması. Assignee alanı
    // gönderilmeyen (veya boşaltılan) güncellemeler dokunulmaz (null assignee davranışı korunur).
    if (dto.assigneeId) {
      await this.assertAssigneeEligible(tenantId, dto.assigneeId);
    }

    const data: any = { ...dto };
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

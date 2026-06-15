import { Injectable, NotFoundException } from "@nestjs/common";
import { PrismaService } from "@/prisma/prisma.service";
import { CreateTaskDto, UpdateTaskDto } from "./dto/task.dto";

@Injectable()
export class TaskService {
  constructor(private prisma: PrismaService) {}

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

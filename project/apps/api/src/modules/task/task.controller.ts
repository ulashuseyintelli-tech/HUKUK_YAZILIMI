import {
  Controller,
  Get,
  Post,
  Put,
  Delete,
  Body,
  Param,
  Query,
  UseGuards,
} from "@nestjs/common";
import { TaskService } from "./task.service";
import { CancelTaskDto, CreateTaskDto, ListTaskCancellationsQueryDto, ListTasksQueryDto, UpdateTaskDto } from "./dto/task.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { ViewerWriteDenyGuard } from "../auth/guards/viewer-write-deny.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("tasks")
// F02-D / J-27: VIEWER görev oluşturamaz/düzenleyemez/silemez (kapalı kural; B4/B6 yüklemi). Liste/kanban okuması değişmez.
@UseGuards(JwtAuthGuard, ViewerWriteDenyGuard)
export class TaskController {
  constructor(private taskService: TaskService) {}

  /**
   * GET /tasks — sorgu sözleşmesi `ListTasksQueryDto` (F01-A). Geçersiz `status`/`page`/`limit` ve
   * bilinmeyen parametre global ValidationPipe ile 400 döner (önceden doğrulanmıyordu). Yanıt zarfı
   * `{ data, meta }` korunur; `meta.summary` eklendi (bkz. TaskService.findAll).
   */
  @Get()
  findAll(@CurrentUser("tenantId") tenantId: string, @CurrentUser("id") userId: string, @Query() query: ListTasksQueryDto) {
    return this.taskService.findAll(tenantId, query, userId);
  }

  /** F02 P3 tarama S10: tek görev okuması listeyle aynı görev kapsamına bağlıdır; gömülü dosya yalnız dosya görünürse döner. */
  @Get(":id")
  findOne(@CurrentUser("tenantId") tenantId: string, @CurrentUser("id") userId: string, @Param("id") id: string) {
    return this.taskService.findOneForActor(tenantId, id, userId);
  }

  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: CreateTaskDto
  ) {
    return this.taskService.create(tenantId, userId, dto);
  }

  @Get(":id/cancellations")
  findCancellations(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Query() query: ListTaskCancellationsQueryDto,
  ) {
    return this.taskService.findCancellations(tenantId, id, userId, query);
  }

  @Post(":id/cancel")
  cancel(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: CancelTaskDto,
  ) {
    return this.taskService.cancel(tenantId, id, userId, dto);
  }

  @Put(":id")
  update(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Param("id") id: string,
    @Body() dto: UpdateTaskDto
  ) {
    return this.taskService.update(tenantId, id, userId, dto);
  }

  @Delete(":id")
  delete(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.taskService.delete(tenantId, id);
  }
}

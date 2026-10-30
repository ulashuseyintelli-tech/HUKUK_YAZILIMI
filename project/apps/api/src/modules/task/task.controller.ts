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
import { CreateTaskDto, ListTasksQueryDto, UpdateTaskDto } from "./dto/task.dto";
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

  @Get(":id")
  findOne(@CurrentUser("tenantId") tenantId: string, @Param("id") id: string) {
    return this.taskService.findOne(tenantId, id);
  }

  @Post()
  create(
    @CurrentUser("tenantId") tenantId: string,
    @CurrentUser("id") userId: string,
    @Body() dto: CreateTaskDto
  ) {
    return this.taskService.create(tenantId, userId, dto);
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

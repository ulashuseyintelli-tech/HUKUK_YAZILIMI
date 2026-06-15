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
import { CreateTaskDto, UpdateTaskDto } from "./dto/task.dto";
import { JwtAuthGuard } from "../auth/guards/jwt-auth.guard";
import { CurrentUser } from "../auth/decorators/current-user.decorator";

@Controller("tasks")
@UseGuards(JwtAuthGuard)
export class TaskController {
  constructor(private taskService: TaskService) {}

  @Get()
  findAll(
    @CurrentUser("tenantId") tenantId: string,
    @Query("status") status?: string,
    @Query("page") page?: string,
    @Query("limit") limit?: string
  ) {
    return this.taskService.findAll(tenantId, {
      status,
      page: page ? parseInt(page) : undefined,
      limit: limit ? parseInt(limit) : undefined,
    });
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

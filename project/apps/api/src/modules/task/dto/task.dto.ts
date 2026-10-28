import { IsString, IsOptional, IsEnum, IsDateString, IsInt, Min, Max } from "class-validator";
import { Type } from "class-transformer";

export enum TaskStatus {
  PENDING = "PENDING",
  IN_PROGRESS = "IN_PROGRESS",
  COMPLETED = "COMPLETED",
  CANCELLED = "CANCELLED",
}

export enum Priority {
  LOW = "LOW",
  MEDIUM = "MEDIUM",
  HIGH = "HIGH",
  URGENT = "URGENT",
}

/** Prisma `TaskCategory` ile birebir; yalnız liste süzgeci için (schema değişmez). */
export enum TaskCategory {
  LEGAL_WORKFLOW = "LEGAL_WORKFLOW",
  OPERATIONAL_COMPLETENESS = "OPERATIONAL_COMPLETENESS",
}

/** GET /tasks varsayılan sayfa boyu (bugünkü davranış korunur). */
export const TASK_LIST_DEFAULT_LIMIT = 20;
/** GET /tasks üst sınırı: daha büyük `limit` 400 döner; ekran birden çok sayfa çeker. */
export const TASK_LIST_MAX_LIMIT = 100;

/**
 * GET /tasks sorgu sözleşmesi (F01-A / OFP-01).
 *
 * Bütün alanlar isteğe bağlıdır. `page` ve `limit` sorgu dizesinden dize gelir; global
 * ValidationPipe(transform) + `@Type` ile sayıya çevrilir, geçersiz değer (`abc`, `0`, `101`) 400 olur.
 * Bilinmeyen parametre global `forbidNonWhitelisted` ile 400 döner.
 *
 * `assigneeId` yalnız bir SÜZGEÇTİR; OWN/TEAM yetkilendirmesi değildir (kişinin yalnız kendi
 * işini görmesi OFP-09'dur ve bu DTO'da yoktur).
 */
export class ListTasksQueryDto {
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsString()
  @IsOptional()
  assigneeId?: string;

  @IsEnum(TaskCategory)
  @IsOptional()
  taskCategory?: TaskCategory;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(TASK_LIST_MAX_LIMIT)
  @IsOptional()
  limit?: number;
}

export class CreateTaskDto {
  @IsString()
  title: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  caseId?: string;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  assigneeId?: string;
}

export class UpdateTaskDto {
  @IsString()
  @IsOptional()
  title?: string;

  @IsString()
  @IsOptional()
  description?: string;

  @IsString()
  @IsOptional()
  caseId?: string;

  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsEnum(Priority)
  @IsOptional()
  priority?: Priority;

  @IsDateString()
  @IsOptional()
  dueDate?: string;

  @IsString()
  @IsOptional()
  assigneeId?: string;
}

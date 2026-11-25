import { IsString, IsOptional, IsEnum, IsDateString, IsInt, Min, Max, IsNotEmpty, MaxLength, IsBoolean } from "class-validator";
import { Transform, Type } from "class-transformer";

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

/**
 * F03-C: GET /tasks kontrol süzgeci. "Kontrolde" ayrı bir `TaskStatus` değeri DEĞİLDİR (IN_PROGRESS + kontrol bekliyor);
 * liste onu bu süzgeçle ayırır. `status` süzgeciyle kesişir.
 */
export enum TaskReviewFilter {
  AWAITING = "AWAITING",
  NOT_AWAITING = "NOT_AWAITING",
}

/** F03-C: kontrol kararı (K9): onay → tamamlandı; revizyon → işi yapanda devam ediyor; ret → havuza (bekliyor, atanmamış). */
export enum TaskReviewDecisionValue {
  APPROVE = "APPROVE",
  REJECT = "REJECT",
  REQUEST_REVISION = "REQUEST_REVISION",
}

/** GET /tasks varsayılan sayfa boyu (bugünkü davranış korunur). */
export const TASK_LIST_DEFAULT_LIMIT = 20;
/** GET /tasks üst sınırı: daha büyük `limit` 400 döner; ekran birden çok sayfa çeker. */
export const TASK_LIST_MAX_LIMIT = 100;

/** 2b / KI-048: the user reason belongs to the domain record, never raw AuditLog. */
export class CancelTaskDto {
  @Transform(({ value }) => typeof value === "string" ? value.trim() : value)
  @IsString()
  @IsNotEmpty()
  @MaxLength(2000)
  reason: string;
}

export class ListTaskCancellationsQueryDto {
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

/** GET /tasks/:id/history sorgusu (F03-A2): iptal geçmişiyle aynı sayfalama sözleşmesi (page ≥ 1, 1 ≤ limit ≤ 100). */
export class ListTaskHistoryQueryDto extends ListTaskCancellationsQueryDto {}

/**
 * GET /tasks sorgu sözleşmesi (F01-A / OFP-01).
 *
 * Bütün alanlar isteğe bağlıdır. `page` ve `limit` sorgu dizesinden dize gelir; global
 * ValidationPipe(transform) + `@Type` ile sayıya çevrilir, geçersiz değer (`abc`, `0`, `101`) 400 olur.
 * Bilinmeyen parametre global `forbidNonWhitelisted` ile 400 döner.
 *
 * `assigneeId` yalnız bir SÜZGEÇTİR; OWN/TEAM yetkilendirmesi değildir (kişinin yalnız kendi
 * işini görmesi OFP-09'dur ve bu DTO'da yoktur).
 *
 * `caseId` (F03-B2 / OFP-02) de yalnız bir SÜZGEÇTİR: dosya sayfası o dosyanın görevlerini okur. Kapsam genişletmez;
 * görev görünüm kapsamıyla kesişir. Başka büronun ya da var olmayan dosyanın kimliği boş sonuçtur (varlık sızmaz).
 */
export class ListTasksQueryDto {
  @IsEnum(TaskStatus)
  @IsOptional()
  status?: TaskStatus;

  @IsString()
  @IsOptional()
  assigneeId?: string;

  @IsString()
  @IsOptional()
  caseId?: string;

  @IsEnum(TaskReviewFilter)
  @IsOptional()
  review?: TaskReviewFilter;

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

  /**
   * Tarih sözleşmesi (F01 K-F7, 28.10.2026): tam ISO-8601 (`2026-11-05T00:00:00.000Z`, saat dilimi korunur) VEYA
   * tarih-only `YYYY-MM-DD` (web `<input type="date">` biçimi; UTC gece yarısı olarak yorumlanır — case modülü ve
   * envanter SQL'i `AT TIME ZONE 'UTC'` ile tutarlı). `strict`: takvimde olmayan gün (`2026-02-30`) 400 döner
   * (önceden Prisma'ya ulaşıp 500 veriyordu). `null` = tarihi temizle; alan yoksa dokunulmaz.
   */
  @IsDateString({ strict: true })
  @IsOptional()
  dueDate?: string | null;

  @IsString()
  @IsOptional()
  assigneeId?: string;

  /**
   * F03-C (owner kararı K4-b): oluşturan görevi "kontrol gerekli" diye işaretler (varsayılan kapalı). İşaretli görev tamamlanınca
   * işi yapandan FARKLI bir kişi onaylamadan tamamlanmış sayılmaz. İşi yapacak kişiden başka kontrol edebilecek kişi yoksa
   * işaret konamaz (K5-b; 409). Sonradan değiştirmek için `POST /tasks/:id/review-requirement` (PUT bu alanı kabul etmez).
   */
  @IsBoolean()
  @IsOptional()
  reviewRequired?: boolean;
}

/** POST /tasks/:id/review-requirement — işareti koyma (yalnız oluşturan) ya da gerekçeyle kaldırma (oluşturan / ADMIN). */
export class SetTaskReviewRequirementDto {
  @IsBoolean()
  required: boolean;

  /** Kaldırmada ZORUNLU (1–2000 karakter); koymada yok sayılır. */
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  reason?: string;
}

/** POST /tasks/:id/review — kontrol kararı. Ret ve revizyonda gerekçe ZORUNLU; onayda isteğe bağlı not. */
export class ReviewTaskDto {
  @IsEnum(TaskReviewDecisionValue)
  decision: TaskReviewDecisionValue;

  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @IsOptional()
  @MaxLength(2000)
  note?: string;
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

  /**
   * Tarih sözleşmesi (F01 K-F7, 28.10.2026): tam ISO-8601 (`2026-11-05T00:00:00.000Z`, saat dilimi korunur) VEYA
   * tarih-only `YYYY-MM-DD` (web `<input type="date">` biçimi; UTC gece yarısı olarak yorumlanır — case modülü ve
   * envanter SQL'i `AT TIME ZONE 'UTC'` ile tutarlı). `strict`: takvimde olmayan gün (`2026-02-30`) 400 döner
   * (önceden Prisma'ya ulaşıp 500 veriyordu). `null` = tarihi temizle; alan yoksa dokunulmaz.
   */
  @IsDateString({ strict: true })
  @IsOptional()
  dueDate?: string | null;

  @IsString()
  @IsOptional()
  assigneeId?: string;
}

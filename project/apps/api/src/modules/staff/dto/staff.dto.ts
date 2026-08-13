import { Allow, IsArray, IsBoolean, IsEnum, IsInt, IsOptional, IsString } from 'class-validator';
import { StaffType } from '@prisma/client';

/**
 * OFFICE-P5-SECURITY-COMPLETION-R01 / P5-B04 (S3) — typed DTO validation.
 *
 * ÖLÇÜM: staff mutasyon gövdeleri `body: any` idi → global ValidationPipe metatype
 * `Object` gördüğü için HİÇ doğrulama/whitelist uygulamıyordu; alan filtresi yalnız
 * servis allow-map'indeydi. Bu DTO'lar allow-map'in BİREBİR alan kümesini tipler —
 * yeni alan/serbestlik EKLEMEZ (`userId` bilinçli olarak yazılabilir DEĞİLDİR; kimlik
 * köprüsü yalnız kanonik auth/invite yolundan kurulur).
 *
 * @Allow() passthrough bloğu: ölçülen tüketici (cases/new StaffDetailModal,
 * P5-B03 §5 site #8) GET /staff listesinden gelen SATIRIN TAMAMINI geri PUT eder
 * (id/tenantId/officeId/userId/createdAt/updatedAt/isActive dahil). Global pipe
 * `forbidNonWhitelisted: true` olduğundan bu anahtarlar DTO'da tanınmazsa istek 400 olur
 * ve F01-YETKİLİ akış kırılırdı (owner yasağı). Bu alanlar TANINIR ama servis
 * allow-map'inde olmayanlar persist EDİLMEZ (bugünkü davranışla birebir: sessizce yok sayılır).
 */
class StaffMutationPassthroughDto {
  @Allow() id?: unknown;
  @Allow() tenantId?: unknown;
  @Allow() officeId?: unknown;
  @Allow() userId?: unknown; // allow-map'te YOK → asla persist edilmez
  @Allow() createdAt?: unknown;
  @Allow() updatedAt?: unknown;
  @Allow() user?: unknown; // savunmacı: olası nested echo
  @Allow() caseAssignments?: unknown; // savunmacı: findOne include echo'su
}

export class CreateStaffDto extends StaffMutationPassthroughDto {
  @IsString() firstName: string;
  @IsString() lastName: string;

  @IsOptional() @IsString() tckn?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() mobilePhone?: string;
  @IsOptional() @IsString() whatsappPhone?: string;
  @IsOptional() @IsEnum(StaffType) staffType?: StaffType;

  @IsOptional() @IsBoolean() canCreateCase?: boolean;
  @IsOptional() @IsBoolean() canEditCase?: boolean;
  @IsOptional() @IsBoolean() canGenerateDocuments?: boolean;
  @IsOptional() @IsBoolean() canApproveDocuments?: boolean;
  @IsOptional() @IsBoolean() canSeeFinance?: boolean;
  @IsOptional() @IsBoolean() canApproveFinance?: boolean;
  @IsOptional() @IsBoolean() canPrepareCollectionDisposition?: boolean;
  @IsOptional() @IsBoolean() canSendNotifications?: boolean;
  @IsOptional() @IsBoolean() isDefaultForNewCases?: boolean;

  @IsOptional() @IsInt() sortOrder?: number;

  // PR-S duplicate-handling kontratı: "Ayrı kişi olarak kaydet" onayı.
  @IsOptional() @IsBoolean() forceCreate?: boolean;
}

export class UpdateStaffDto extends StaffMutationPassthroughDto {
  @IsOptional() @IsString() firstName?: string;
  @IsOptional() @IsString() lastName?: string;
  @IsOptional() @IsString() tckn?: string;
  @IsOptional() @IsString() email?: string;
  @IsOptional() @IsString() phone?: string;
  @IsOptional() @IsString() mobilePhone?: string;
  @IsOptional() @IsString() whatsappPhone?: string;
  @IsOptional() @IsEnum(StaffType) staffType?: StaffType;

  @IsOptional() @IsBoolean() canCreateCase?: boolean;
  @IsOptional() @IsBoolean() canEditCase?: boolean;
  @IsOptional() @IsBoolean() canGenerateDocuments?: boolean;
  @IsOptional() @IsBoolean() canApproveDocuments?: boolean;
  @IsOptional() @IsBoolean() canSeeFinance?: boolean;
  @IsOptional() @IsBoolean() canApproveFinance?: boolean;
  @IsOptional() @IsBoolean() canPrepareCollectionDisposition?: boolean;
  @IsOptional() @IsBoolean() canSendNotifications?: boolean;
  @IsOptional() @IsBoolean() isDefaultForNewCases?: boolean;

  @IsOptional() @IsInt() sortOrder?: number;
  @IsOptional() @IsBoolean() isActive?: boolean;

  // PR-U3 duplicate-handling kontratı: isim-benzerliği review onayı (persist edilmez).
  @IsOptional() @IsBoolean() confirmSimilarNameUpdate?: boolean;
}

export class UpdateStaffOrderDto {
  @IsArray()
  @IsString({ each: true })
  staffIds: string[];
}

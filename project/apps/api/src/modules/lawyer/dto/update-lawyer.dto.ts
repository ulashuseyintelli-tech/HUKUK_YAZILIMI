import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { Allow, IsBoolean, IsEnum, IsInt, IsOptional, IsString, ValidateIf, validate } from 'class-validator';
import { LawyerRank, LawyerRole, Prisma } from '@prisma/client';

/** PATCH keeps its existing contact/bank/delegation fields. isActive is echo-only. */
export class PatchLawyerDto {
  @IsOptional() @IsString() phone?: string | null;
  @IsOptional() @IsString() email?: string | null;
  @IsOptional() @IsString() address?: string | null;
  @IsOptional() @IsString() bankName?: string | null;
  @IsOptional() @IsString() branchName?: string | null;

  // The service owns INVALID_IBAN_UPDATE, including null/non-string/masked refusal.
  @Allow() iban?: string;

  @ValidateIf((_object, value) => value !== undefined) @IsBoolean()
  canApproveOfficeActions?: boolean;

  @ValidateIf((_object, value) => value !== undefined) @IsBoolean()
  isActive?: boolean;
}

/** PUT profile fields only; no identity, foreign-key or nested Prisma write inputs. */
export class UpdateLawyerDto extends PatchLawyerDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() name?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsString() surname?: string;
  @IsOptional() @IsString() tckn?: string | null;
  @IsOptional() @IsString() gender?: string | null;
  @IsOptional() @IsString() barNumber?: string | null;
  @IsOptional() @IsString() barCity?: string | null;
  @IsOptional() @IsString() tbbNo?: string | null;
  @IsOptional() @IsString() vergiDairesi?: string | null;
  @IsOptional() @IsString() vergiNo?: string | null;
  @IsOptional() @IsString() mobilePhone?: string | null;
  @IsOptional() @IsString() whatsappPhone?: string | null;
  @IsOptional() @IsString() fax?: string | null;
  @IsOptional() @IsString() city?: string | null;
  @IsOptional() @IsString() district?: string | null;
  @IsOptional() @IsString() title?: string | null;

  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() isInHouseCounsel?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() isEmployee?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsEnum(LawyerRole) role?: LawyerRole;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() canSign?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() canAppearInUyap?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() canBeResponsible?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() isDefaultForNewCases?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() sortOrder?: number;

  // Presence still requires the existing ADMIN/PARTNER service policy.
  @ValidateIf((_object, value) => value !== undefined) @IsEnum(LawyerRank) lawyerRank?: LawyerRank;
  @Allow() defaultPermissions?: Prisma.InputJsonValue | null;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() permissionsLocked?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() canModifyOtherPermissions?: boolean;

  // Transient name-review acknowledgement, never persisted.
  @IsOptional() @IsBoolean() confirmSimilarNameUpdate?: boolean;
}

const validationException = new ValidationPipe().createExceptionFactory();

/**
 * Callers: LawyerController.update/patch and LawyerService.update.
 * Validate an explicit DTO without class-transformer: defaultPermissions is opaque
 * JSON, so its nested keys must not be stripped or interpreted as class properties.
 */
export async function validateLawyerUpdateInput<T extends PatchLawyerDto>(
  value: unknown,
  Dto: new () => T,
): Promise<T> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(['body must be an object']);
  }
  for (const key of Object.keys(value)) {
    // Also avoid class-validator's metadata lookup accepting inherited prototype keys.
    if (Object.prototype.hasOwnProperty.call(Object.prototype, key)) {
      throw new BadRequestException([`property ${key} should not exist`]);
    }
  }
  const active = (value as PatchLawyerDto).isActive;
  if (active !== undefined && typeof active !== 'boolean') {
    throw new BadRequestException({ code: 'INVALID_PROFILE_ACTIVE_UPDATE', message: 'isActive yalnız boolean olabilir.' });
  }
  const dto = Object.assign(new Dto(), value);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length > 0) throw validationException(errors);
  return dto;
}

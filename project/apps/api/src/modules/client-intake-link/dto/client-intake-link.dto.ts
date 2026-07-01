import { ArrayNotEmpty, IsArray, IsDateString, IsEnum, IsInt, IsOptional, IsString, Min, MinLength } from 'class-validator';
import { ClientIntakeFieldCategory } from '@prisma/client';

/**
 * Müvekkil dış-form intake linki üretimi (personel/JWT).
 * Yalnız link üretir + best-effort INTAKE_LINK maili. Public submit/review/promote DEĞİL.
 */
export class CreateClientIntakeLinkDto {
  @IsString()
  @MinLength(1)
  clientId: string;

  // Hangi kategoriler isteniyor (form bunları sorar)
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ClientIntakeFieldCategory, { each: true })
  scope: ClientIntakeFieldCategory[];

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxUses?: number; // default 1
}

/**
 * Client Workspace Action Center create command body.
 * clientId/caseId path'ten gelir; body tenant veya client hedefi taşımaz.
 */
export class CreateClientWorkspaceIntakeLinkDto {
  // Hangi kategoriler isteniyor (form bunları sorar)
  @IsArray()
  @ArrayNotEmpty()
  @IsEnum(ClientIntakeFieldCategory, { each: true })
  scope: ClientIntakeFieldCategory[];

  @IsDateString()
  @IsOptional()
  expiresAt?: string;

  @IsInt()
  @Min(1)
  @IsOptional()
  maxUses?: number; // default 1
}
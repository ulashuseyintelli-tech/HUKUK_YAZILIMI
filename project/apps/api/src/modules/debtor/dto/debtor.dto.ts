import { IsString, IsOptional, IsEnum, IsObject } from "class-validator";

export enum DebtorType {
  INDIVIDUAL = "INDIVIDUAL",
  COMPANY = "COMPANY",
}

export class CreateDebtorDto {
  @IsEnum(DebtorType)
  type: DebtorType;

  @IsString()
  name: string;

  @IsString()
  @IsOptional()
  identityNo?: string;

  @IsString()
  @IsOptional()
  taxOffice?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsObject()
  @IsOptional()
  addresses?: any;

  @IsString()
  @IsOptional()
  notes?: string;
}

export class UpdateDebtorDto {
  @IsEnum(DebtorType)
  @IsOptional()
  type?: DebtorType;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  identityNo?: string;

  @IsString()
  @IsOptional()
  taxOffice?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsObject()
  @IsOptional()
  addresses?: any;

  @IsString()
  @IsOptional()
  notes?: string;
}

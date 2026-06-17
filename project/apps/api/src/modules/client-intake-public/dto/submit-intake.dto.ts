import { Type } from 'class-transformer';
import { ArrayMaxSize, ArrayNotEmpty, IsArray, IsEnum, IsOptional, IsString, MaxLength, MinLength, ValidateNested } from 'class-validator';
import { ClientIntakeFieldCategory } from '@prisma/client';

/** Tek form alanı (müvekkilin girdiği ham beyan). Kategori scope kontrolü SERVİSTE. */
export class SubmitIntakeFieldDto {
  @IsEnum(ClientIntakeFieldCategory)
  category: ClientIntakeFieldCategory;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  label?: string;

  @IsString()
  @MinLength(1)
  @MaxLength(4000) // 44-3: value ≤ 4000
  value: string;

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}

/** Public submit gövdesi. hp = honeypot (bot tuzağı; doluysa sessiz drop). */
export class SubmitIntakeDto {
  @IsArray()
  @ArrayNotEmpty()
  @ArrayMaxSize(50) // 44-3: ≤ 50 field
  @ValidateNested({ each: true })
  @Type(() => SubmitIntakeFieldDto)
  fields: SubmitIntakeFieldDto[];

  // Honeypot — gerçek müvekkil boş bırakır; bot doldurur.
  @IsString()
  @IsOptional()
  @MaxLength(200)
  hp?: string;
}

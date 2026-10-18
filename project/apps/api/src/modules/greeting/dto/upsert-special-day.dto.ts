import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, Max, Min, MinLength, ValidateIf, validate } from 'class-validator';

/** id selects an existing tenant-owned day; it is never an editable identity. */
export class UpsertSpecialDayDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() @MinLength(1) id?: string;
  @ValidateIf((object, value) => object.id === undefined || value !== undefined) @IsString() name!: string;
  @ValidateIf((object, value) => object.id === undefined || value !== undefined) @IsString() type!: string;
  @ValidateIf((object, value) => object.id === undefined || value !== undefined) @IsInt() @Min(1) @Max(12) month!: number;
  @ValidateIf((object, value) => object.id === undefined || value !== undefined) @IsInt() @Min(1) @Max(31) day!: number;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() isVariable?: boolean;
  @IsOptional() @IsInt() year?: number | null;
  @IsOptional() @IsString() greetingMessage?: string | null;
  @IsOptional() @IsString() smsMessage?: string | null;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() isActive?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() sendGreeting?: boolean;
}

/** Callers: GreetingService.upsertSpecialDay (including non-HTTP consumers). */
export async function validateSpecialDayInput(value: unknown): Promise<UpsertSpecialDayDto> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(['body must be an object']);
  }
  for (const key of Object.keys(value)) {
    if (Object.prototype.hasOwnProperty.call(Object.prototype, key)) {
      throw new BadRequestException([`property ${key} should not exist`]);
    }
  }
  const dto = Object.assign(new UpsertSpecialDayDto(), value);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) throw new ValidationPipe().createExceptionFactory()(errors);
  return dto;
}

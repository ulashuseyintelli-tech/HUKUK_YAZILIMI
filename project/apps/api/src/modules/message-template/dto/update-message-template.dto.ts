import { BadRequestException, ValidationPipe } from '@nestjs/common';
import { IsBoolean, IsInt, IsOptional, IsString, ValidateIf, validate } from 'class-validator';

export class UpdateMessageTemplateDto {
  @ValidateIf((_object, value) => value !== undefined) @IsString() name?: string;
  @IsOptional() @IsString() description?: string | null;
  @IsOptional() @IsString() subject?: string | null;
  @ValidateIf((_object, value) => value !== undefined) @IsString() body?: string;
  @ValidateIf((_object, value) => value !== undefined) @IsBoolean() isActive?: boolean;
  @ValidateIf((_object, value) => value !== undefined) @IsInt() sortOrder?: number;
}

/** Callers: MessageTemplateService.update (including non-HTTP consumers). */
export async function validateMessageTemplateUpdate(value: unknown): Promise<UpdateMessageTemplateDto> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    throw new BadRequestException(['body must be an object']);
  }
  for (const key of Object.keys(value)) {
    if (Object.prototype.hasOwnProperty.call(Object.prototype, key)) {
      throw new BadRequestException([`property ${key} should not exist`]);
    }
  }
  const dto = Object.assign(new UpdateMessageTemplateDto(), value);
  const errors = await validate(dto, { whitelist: true, forbidNonWhitelisted: true });
  if (errors.length) throw new ValidationPipe().createExceptionFactory()(errors);
  return dto;
}

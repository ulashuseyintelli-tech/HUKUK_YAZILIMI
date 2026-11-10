import { Transform, plainToInstance } from 'class-transformer';
import { IsBoolean, IsIBAN, IsNotEmpty, IsOptional, IsString, ValidateIf, validateSync } from 'class-validator';
import { BadRequestException } from '@nestjs/common';

const trim = ({ value }: { value: unknown }) => typeof value === 'string' ? value.trim() : value;
export const normalizeClientIban = (value: string) => value.replace(/\s+/g, '').toUpperCase();
const iban = ({ value }: { value: unknown }) => typeof value === 'string' ? normalizeClientIban(value) : value;

export class CreateClientBankAccountDto {
  @Transform(trim) @IsString() @IsNotEmpty() bankName!: string;
  @Transform(trim) @IsOptional() @IsString() branchName?: string | null;
  @Transform(iban) @IsString() @IsIBAN() iban!: string;
  @Transform(trim) @IsOptional() @IsString() accountHolder?: string | null;
  @ValidateIf(o => o.isPrimary !== undefined) @IsBoolean() isPrimary?: boolean;
}

export class UpdateClientBankAccountDto {
  @ValidateIf(o => o.bankName !== undefined) @Transform(trim) @IsString() @IsNotEmpty() bankName?: string;
  @Transform(trim) @IsOptional() @IsString() branchName?: string | null;
  @ValidateIf(o => o.iban !== undefined) @Transform(iban) @IsString() @IsIBAN() iban?: string;
  @Transform(trim) @IsOptional() @IsString() accountHolder?: string | null;
  @ValidateIf(o => o.isPrimary !== undefined) @IsBoolean() isPrimary?: boolean;
}

/** The service boundary also validates direct callers; no ORM-shaped payload is accepted. */
export function validateClientBankAccountInput(input: unknown, create: boolean) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    throw new BadRequestException({ code: 'CLIENT_BANK_INVALID_BODY' });
  }
  const dto = create ? plainToInstance(CreateClientBankAccountDto, input) : plainToInstance(UpdateClientBankAccountDto, input);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true, forbidUnknownValues: true });
  if (errors.length) throw new BadRequestException({ code: 'CLIENT_BANK_INVALID_BODY', fields: errors.map(e => e.property) });
  const fields = ['bankName', 'branchName', 'iban', 'accountHolder', 'isPrimary'] as const;
  return Object.fromEntries(fields.filter(key => dto[key] !== undefined).map(key => [key, dto[key]])) as Partial<CreateClientBankAccountDto>;
}

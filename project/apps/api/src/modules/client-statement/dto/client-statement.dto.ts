import { IsBoolean, IsDateString, IsOptional, IsString, MinLength } from 'class-validator';

/**
 * Müvekkil ekstresi üretimi (snapshot). Dönem zorunlu.
 * includeRequests=false → EXPENSE_REQUESTED bilgi satırları hariç tutulur.
 */
export class CreateClientStatementDto {
  @IsString()
  @MinLength(1)
  clientId: string;

  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsBoolean()
  @IsOptional()
  includeRequests?: boolean; // default true

  @IsString()
  @IsOptional()
  note?: string;
}

/** Supersede: eskisini SUPERSEDED yapıp aynı case+client için yeni statement üretir. */
export class SupersedeClientStatementDto {
  @IsDateString()
  periodStart: string;

  @IsDateString()
  periodEnd: string;

  @IsBoolean()
  @IsOptional()
  includeRequests?: boolean;

  @IsString()
  @IsOptional()
  note?: string;
}

/** Void: geçersiz işaretler (içerik değişmez, yalnız lifecycle damgası). */
export class VoidClientStatementDto {
  @IsString()
  @IsOptional()
  note?: string;
}

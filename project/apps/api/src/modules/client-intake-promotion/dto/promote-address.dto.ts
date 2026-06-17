import { IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/**
 * ADDRESS promote gövdesi (Faz 4.6b — HYBRID).
 * Müvekkilin ham adres beyanı rawAddress'te korunur; personel YAPISAL alanları burada girer.
 * Otomatik parse YOK; street/city zorunlu (DebtorAddress gereği).
 */
export class PromoteAddressDto {
  @IsString()
  @MinLength(1)
  debtorId: string;

  @IsString()
  @MinLength(1)
  @MaxLength(500)
  street: string;

  @IsString()
  @MinLength(1)
  @MaxLength(200)
  city: string;

  @IsString()
  @IsOptional()
  @MaxLength(200)
  district?: string;

  @IsString()
  @IsOptional()
  @MaxLength(20)
  postalCode?: string;

  @IsString()
  @IsOptional()
  @MaxLength(100)
  country?: string;
}

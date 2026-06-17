import { IsEnum, IsOptional, IsString, MinLength } from 'class-validator';
import { ClientIntelCategory } from '@prisma/client';

/**
 * Müvekkil istihbarat beyanı oluşturma (status=ACTIVE).
 * Yalnız YUMUŞAK istihbarat kategorileri; adres/varlık/iletişim BU MODELE girmez.
 */
export class CreateClientIntelStatementDto {
  @IsString()
  @MinLength(1)
  debtorId: string;

  @IsEnum(ClientIntelCategory)
  category: ClientIntelCategory;

  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @MinLength(1)
  value: string;

  @IsString()
  @IsOptional()
  note?: string;
}

/** retract / false-positive — yalnız opsiyonel gerekçe (içerik değişmez). */
export class TransitionClientIntelStatementDto {
  @IsString()
  @IsOptional()
  note?: string;
}

/** supersede — yeni içerik (value zorunlu; düzeltme = yeni kayıt). */
export class SupersedeClientIntelStatementDto {
  @IsString()
  @MinLength(1)
  value: string;

  @IsString()
  @IsOptional()
  label?: string;

  @IsString()
  @IsOptional()
  note?: string;
}

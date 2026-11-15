import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  Matches,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

/**
 * Seçimlik kalem bazlı borçlu sorumluluğu — istek gövdeleri.
 *
 * Biçim denetimi buradadır; alan kuralları (tür / taraf / pay / tavan tutarlılığı) saf alan modülünde
 * (`normalizeSelectionDraft`) tek yerde uygulanır ve hata kodlarıyla döner.
 */
export class ClaimLiabilityPartyDto {
  @IsString()
  @MaxLength(64)
  caseDebtorId!: string;

  /** Paylı: tam sayı ağırlık (1..1.000.000). `sharePercent` ile birlikte verilemez. */
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(1_000_000)
  shareWeight?: number;

  /** Paylı: iki ondalıklı yüzde ("60", "33.33"). Bütün taraflarda verilir; toplam tam 100,00 olmalıdır. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,3}([.,]\d{1,2})?$/)
  sharePercent?: string;

  /** Tutarla sınırlı: tavan ("8000.00"); yalnız bu kalemin kayıtlı tutarını kapsar. */
  @IsOptional()
  @IsString()
  @Matches(/^\d{1,13}(\.\d{1,2})?$/)
  limitAmount?: string;

  /** Tutarla sınırlı: tavansız borçlu. */
  @IsOptional()
  @IsBoolean()
  unlimited?: boolean;
}

export class ClaimLiabilitySelectionDto {
  @IsString()
  @MaxLength(64)
  claimItemId!: string;

  /** JOINT_AND_SEVERAL | PROPORTIONAL | CAPPED | UNDETERMINED — ön seçili değer yoktur. */
  @IsString()
  @MaxLength(32)
  mode!: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(32)
  @ValidateNested({ each: true })
  @Type(() => ClaimLiabilityPartyDto)
  parties?: ClaimLiabilityPartyDto[];

  @IsOptional()
  @IsString()
  @MaxLength(32)
  basis?: string;

  @IsOptional()
  @IsString()
  @MaxLength(2000)
  basisNote?: string;

  @IsOptional()
  @IsString()
  @MaxLength(64)
  basisDocumentId?: string;
}

export class ClaimLiabilityPreviewDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(200)
  @ValidateNested({ each: true })
  @Type(() => ClaimLiabilitySelectionDto)
  selections!: ClaimLiabilitySelectionDto[];
}

export class ClaimLiabilityRequestDto extends ClaimLiabilityPreviewDto {
  /** Önizlemenin döndürdüğü özet; arada dosya değiştiyse talep reddedilir. */
  @IsString()
  @MaxLength(128)
  onizlemeOzeti!: string;
}

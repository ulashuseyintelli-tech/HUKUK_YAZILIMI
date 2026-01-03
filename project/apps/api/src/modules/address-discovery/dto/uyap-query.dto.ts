import { IsString, IsEnum, IsOptional, IsArray, ValidateNested, IsNumber, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export enum UyapQueryType {
  NUFUS_ADRES = 'NUFUS_ADRES',     // AA - Nüfus + Aile + Adres
  SGK = 'SGK',                       // AB - SGK işyeri
  TICARET_ODASI = 'TICARET_ODASI', // AF - Ticaret Odası
  VERGI_DAIRESI = 'VERGI_DAIRESI', // AJ - Vergi Dairesi
  GSM = 'GSM',                       // AR - GSM Operatörleri
  GUMRUK = 'GUMRUK',                 // AL - Gümrük
  ORTAKLAR = 'ORTAKLAR',             // AH - Şirket ortakları
  AILE = 'AILE',                     // AN - Aile üyeleri
  ORTAK_DETAY = 'ORTAK_DETAY',       // AP - Ortak detayları
}

// UYAP sorgu kodu mapping
export const UYAP_QUERY_CODES: Record<UyapQueryType, string> = {
  [UyapQueryType.NUFUS_ADRES]: 'AA',
  [UyapQueryType.SGK]: 'AB',
  [UyapQueryType.TICARET_ODASI]: 'AF',
  [UyapQueryType.VERGI_DAIRESI]: 'AJ',
  [UyapQueryType.GSM]: 'AR',
  [UyapQueryType.GUMRUK]: 'AL',
  [UyapQueryType.ORTAKLAR]: 'AH',
  [UyapQueryType.AILE]: 'AN',
  [UyapQueryType.ORTAK_DETAY]: 'AP',
};

// Sorgu hiyerarşisi (öncelik sırası)
export const QUERY_HIERARCHY = [
  { code: 'AA', type: UyapQueryType.NUFUS_ADRES, name: 'MERNİS Adres', priority: 1, forIndividual: true, forCompany: false },
  { code: 'AB', type: UyapQueryType.SGK, name: 'SGK İşyeri', priority: 2, forIndividual: true, forCompany: true },
  { code: 'AF', type: UyapQueryType.TICARET_ODASI, name: 'Ticaret Odası', priority: 3, forIndividual: false, forCompany: true },
  { code: 'AJ', type: UyapQueryType.VERGI_DAIRESI, name: 'Vergi Dairesi', priority: 4, forIndividual: true, forCompany: true },
  { code: 'AR', type: UyapQueryType.GSM, name: 'GSM Operatörleri', priority: 5, forIndividual: true, forCompany: false },
  { code: 'AL', type: UyapQueryType.GUMRUK, name: 'Gümrük', priority: 6, forIndividual: true, forCompany: true },
  { code: 'AH', type: UyapQueryType.ORTAKLAR, name: 'Şirket Ortakları', priority: 7, forIndividual: false, forCompany: true },
  { code: 'AN', type: UyapQueryType.AILE, name: 'Aile Üyeleri', priority: 8, forIndividual: true, forCompany: false },
  { code: 'AP', type: UyapQueryType.ORTAK_DETAY, name: 'Ortak Detayları', priority: 9, forIndividual: false, forCompany: true },
];

export class CreateUyapQueryDto {
  @IsString()
  caseDebtorId: string;

  @IsEnum(UyapQueryType)
  queryType: UyapQueryType;

  @IsOptional()
  @IsString()
  notes?: string;
}

export class AddressFromQueryDto {
  @IsString()
  fullAddress: string;

  @IsOptional()
  @IsString()
  city?: string;

  @IsOptional()
  @IsString()
  district?: string;

  @IsOptional()
  @IsString()
  neighborhood?: string;

  @IsOptional()
  @IsString()
  street?: string;

  @IsOptional()
  @IsString()
  buildingNo?: string;

  @IsOptional()
  @IsString()
  apartmentNo?: string;

  @IsOptional()
  @IsString()
  postalCode?: string;

  @IsOptional()
  @IsString()
  addressType?: string; // RESIDENCE, WORK, etc.
}

export class UpdateUyapQueryResponseDto {
  @IsEnum(['COMPLETED', 'FAILED', 'NO_RESULT'])
  status: 'COMPLETED' | 'FAILED' | 'NO_RESULT';

  @IsOptional()
  response?: any; // JSON response from UYAP

  @IsOptional()
  @IsString()
  errorMessage?: string;

  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddressFromQueryDto)
  addresses?: AddressFromQueryDto[];
}

export class ProcessQueryAddressesDto {
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => AddressFromQueryDto)
  addresses: AddressFromQueryDto[];
}

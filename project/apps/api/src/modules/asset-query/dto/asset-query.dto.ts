import { IsString, IsArray, IsOptional, IsEnum, ArrayMinSize } from 'class-validator';
import { AssetQueryType, AssetQueryJobStatus, AssetQueryStatus } from '@prisma/client';

// ==================== REQUEST DTOs ====================

export class RunAssetQueriesDTO {
  @IsArray()
  @ArrayMinSize(1)
  @IsEnum(AssetQueryType, { each: true })
  types: AssetQueryType[];

  @IsOptional()
  @IsString()
  reason?: string;

  @IsOptional()
  @IsString()
  idempotencyKey?: string;
}

export class UpdateAssetQueryResultDTO {
  @IsEnum(AssetQueryStatus)
  result: AssetQueryStatus;

  @IsOptional()
  resultData?: Record<string, any>;

  @IsOptional()
  @IsString()
  errorMessage?: string;
}

// ==================== RESPONSE DTOs ====================

export interface AssetQueryDTO {
  id: string;
  queryType: AssetQueryType;
  status: AssetQueryJobStatus;
  result: AssetQueryStatus | null;
  resultData: Record<string, any> | null;
  errorMessage: string | null;
  reason: string | null;
  requestedAt: string;
  requestedBy: string;
  requestedByName: string;
  startedAt: string | null;
  completedAt: string | null;
}

export interface AssetQueryJobDTO {
  jobId: string;
  status: AssetQueryJobStatus;
  queriesCount: number;
  completedCount: number;
  queries: AssetQueryDTO[];
}

export interface AssetSummaryDTO {
  vehicle: AssetQueryStatus;
  realEstate: AssetQueryStatus;
  bank: AssetQueryStatus;
  sgkWage: AssetQueryStatus;
  lastQueryAt: string | null;
  pendingQueries: number;
}

// ==================== LABELS ====================

export const AssetQueryTypeLabels: Record<AssetQueryType, string> = {
  VEHICLE: 'Araç Sorgusu',
  REAL_ESTATE: 'Tapu Sorgusu',
  BANK: 'Banka Hesabı Sorgusu',
  SGK_WAGE: 'SGK Maaş Sorgusu',
  SGK_EMPLOYER: 'SGK İşveren Sorgusu',
  TAX: 'Vergi Dairesi Sorgusu',
  TRADE_REGISTRY: 'Ticaret Sicil Sorgusu',
  GSM: 'GSM Operatör Sorgusu',
};

export const AssetQueryJobStatusLabels: Record<AssetQueryJobStatus, string> = {
  QUEUED: 'Kuyruğa Alındı',
  PROCESSING: 'İşleniyor',
  COMPLETED: 'Tamamlandı',
  FAILED: 'Başarısız',
  CANCELLED: 'İptal Edildi',
};

export const AssetQueryStatusLabels: Record<AssetQueryStatus, string> = {
  UNKNOWN: 'Bilinmiyor',
  YES: 'Var',
  NO: 'Yok',
  PENDING: 'Sorgulanıyor',
  ERROR: 'Hata',
};

import { IsArray, IsString, IsOptional, IsBoolean, ArrayMinSize } from 'class-validator';

/**
 * Tek dosya XML export DTO
 */
export class ExportSingleCaseDto {
  @IsString()
  caseId: string;

  @IsOptional()
  @IsBoolean()
  includeDocuments?: boolean;
}

/**
 * Toplu dosya XML export DTO
 */
export class ExportBatchCasesDto {
  @IsArray()
  @ArrayMinSize(1)
  @IsString({ each: true })
  caseIds: string[];

  @IsOptional()
  @IsBoolean()
  includeDocuments?: boolean;

  @IsOptional()
  @IsString()
  batchName?: string;
}

/**
 * Belge yükleme DTO
 */
export class UploadDocumentDto {
  @IsString()
  caseId: string;

  @IsString()
  documentType: string;

  @IsOptional()
  @IsString()
  description?: string;
}

/**
 * Export sonuç response
 */
export interface ExportResultDto {
  success: boolean;
  fileName: string;
  fileSize: number;
  caseCount: number;
  xml?: string;
  downloadUrl?: string;
  errors?: string[];
  warnings?: string[];
}

/**
 * Belge doğrulama sonucu
 */
export interface DocumentValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  fileInfo: {
    originalName: string;
    size: number;
    mimeType: string;
    width?: number;
    height?: number;
    dpi?: number;
  };
}

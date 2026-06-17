import { IsString, MinLength } from 'class-validator';

/**
 * Field-level soft-intel promote gövdesi (Faz 4.7 PR-C2a).
 * Şekil PromoteSubmissionDto ile aynı (debtorId) ama isim AYRI (okunabilirlik + uç ayrımı).
 */
export class PromoteSoftDto {
  @IsString()
  @MinLength(1)
  debtorId: string;
}

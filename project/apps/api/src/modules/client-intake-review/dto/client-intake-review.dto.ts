import { ArrayNotEmpty, IsArray, IsIn, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';

/** Tek alan review kararı. */
export class ReviewFieldDto {
  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}

/** Toplu field review — YALNIZ aynı submission içindeki seçili alanlar (45-1). */
export class BulkReviewFieldsDto {
  @IsArray()
  @ArrayNotEmpty()
  @IsString({ each: true })
  fieldIds: string[];

  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}

/** reject-submission / claim için opsiyonel not. */
export class ReviewTransitionDto {
  @IsString()
  @IsOptional()
  @MaxLength(1000)
  note?: string;
}

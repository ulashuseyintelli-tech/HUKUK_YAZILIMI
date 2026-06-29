import { IsOptional, IsString } from 'class-validator';
import { Transform } from 'class-transformer';

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);

/** S8-B FAZ-0 — disposition onayı (approve): not opsiyonel. Karar P4 OfficeApprovalRequest'e işlenir. */
export class ApproveDispositionDto {
  @IsOptional()
  @Transform(trim)
  @IsString()
  note?: string;
}

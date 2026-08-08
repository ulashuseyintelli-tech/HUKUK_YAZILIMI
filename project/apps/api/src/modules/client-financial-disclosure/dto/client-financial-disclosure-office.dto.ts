import { IsNotEmpty, IsOptional, IsString } from 'class-validator';

/** Office list/preparation yüzeylerini tek bir yetkili dosyaya daraltır. */
export class ClientFinancialDisclosureOfficeQueryDto {
  @IsOptional()
  @IsString()
  @IsNotEmpty()
  caseId?: string;
}

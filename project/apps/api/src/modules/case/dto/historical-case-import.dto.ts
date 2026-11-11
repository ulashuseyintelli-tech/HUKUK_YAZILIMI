import { Type } from "class-transformer";
import { IsDefined, IsIn, IsString, Matches, ValidateNested } from "class-validator";
import {
  HISTORICAL_IMPORT_SOURCE_REF_PATTERN,
  HISTORICAL_IMPORT_SOURCE_SYSTEMS,
  type HistoricalImportSourceSystem,
} from "../historical-import/case-historical-import";
import { CreateCaseDto } from "./case.dto";

/**
 * `POST /cases/historical-import` gövdesi: kaynak sistem + kaynak dosya kimliği + mevcut dosya açılış gövdesi
 * (`CreateCaseDto`, aynı doğrulama kurallarıyla). Ayrıntı: `historical-import/case-historical-import.ts`.
 */
export class HistoricalCaseImportDto {
  @IsIn(HISTORICAL_IMPORT_SOURCE_SYSTEMS)
  sourceSystem: HistoricalImportSourceSystem;

  @IsString()
  @Matches(HISTORICAL_IMPORT_SOURCE_REF_PATTERN)
  sourceCaseRef: string;

  @IsDefined()
  @ValidateNested()
  @Type(() => CreateCaseDto)
  case: CreateCaseDto;
}

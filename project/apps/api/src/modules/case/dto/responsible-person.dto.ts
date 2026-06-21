import { IsOptional, IsString } from "class-validator";

// M2-G3a: Dosya Sorumlusu atama gövdesi. responsibleLawyerId XOR responsibleStaffId.
// exactly-one (her ikisi/hiçbiri reddi) servis katmanında; DTO yalnız alan tipini doğrular.
export class AssignResponsiblePersonDto {
  @IsOptional()
  @IsString()
  responsibleLawyerId?: string;

  @IsOptional()
  @IsString()
  responsibleStaffId?: string;
}

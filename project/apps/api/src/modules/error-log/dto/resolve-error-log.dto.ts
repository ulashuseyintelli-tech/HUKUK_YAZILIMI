import { IsString, MinLength } from "class-validator";
import { Transform } from "class-transformer";

// PR-6A: resolve açıklaması ZORUNLU + trim sonrası >= 10 karakter (frontend trim>=10 ile eşitlenir).
// Global ValidationPipe (transform:true) önce @Transform (trim) uygular, sonra @IsString/@MinLength
// doğrular → eksik/boş/whitespace-only/kısa → 400; geçerli → trimmed değer saklanır.
export class ResolveErrorLogDto {
  @Transform(({ value }) => (typeof value === "string" ? value.trim() : value))
  @IsString()
  @MinLength(10, { message: "Çözüm açıklaması en az 10 karakter olmalıdır." })
  resolution!: string;
}

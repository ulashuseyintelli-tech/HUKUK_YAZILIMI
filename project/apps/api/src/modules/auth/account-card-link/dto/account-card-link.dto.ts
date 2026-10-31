import { IsOptional, IsString } from "class-validator";

/**
 * F02 K-A1 / owner kararı 31.10.2026 (karar listesi R04 §B B-1, seçenek (b) "dar ürün ucu"): mevcut KARTSIZ hesabı mevcut kişi
 * kartına bağlama. TAM BİRİ zorunlu: lawyerId XOR staffMemberId (servis katmanı 400; yan etki yok). Kart ve hesap aynı kiracıda,
 * kart aktif ve bağsız, hesap aktif ve bağsız olmalı. Ad / soyad / rol / parola DEĞİŞMEZ; e-posta GÖNDERİLMEZ; bayrak yok.
 */
export class LinkAccountToCardDto {
  @IsString()
  userId: string;

  @IsString()
  @IsOptional()
  lawyerId?: string;

  @IsString()
  @IsOptional()
  staffMemberId?: string;
}

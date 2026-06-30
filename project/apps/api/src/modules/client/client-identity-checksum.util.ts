import { BadRequestException } from "@nestjs/common";
import { isValidTckn, isValidVkn } from "../../common/identity-validation.util";

/**
 * Task A / Faz 1 (owner-locked 2026-06-30) — TCKN/VKN mod-10/11 checksum guard, YALNIZ CREATE.
 *
 * Strateji (ulas): kademeli sıkılaştırma — canlı sistemi HİÇ kilitlemeden kaliteyi yükselt.
 *   Faz 1 (BU): YENİ kayıt (create) geçersiz checksum'ı reddeder.
 *   Faz 2/3: eski veri audit + remediation (seed + DB'deki geçersiz-checksum aktif kayıtlar).
 *   Faz 4: veri temiz → UPDATE'te de zorunlu.
 *
 * KATMAN (ulas kararı): kural domain'e ait → ClientService.create() içinde çağrılır, controller'da DEĞİL.
 *   Böylece TÜM create yolları tutarlı kapsanır (settings modal · cases/new · Excel import · seed · gelecekteki
 *   REST v2 / job / queue). update() ETKİLENMEZ. create() içinde de DEDUP/REACTIVATE'TEN SONRA çağrılır:
 *   yalnız GERÇEKTEN YENİ kayıt doğrulanır; legacy (geçersiz-checksum) müvekkilin dedup/reactivate'i KİLİTLENMEZ.
 *
 * Kapsam notları:
 * - Boş/yok kimlik SERBEST (no-tckn) — yalnız DOLU değer doğrulanır (DTO @ValidateIf ile uyumlu).
 * - Format (11/10 hane, yalnız rakam) DTO @Matches ile zaten elendi → burada yalnız matematiksel checksum.
 * - identityNo (serbest/pasaport/deprecated alan) DOĞRULANMAZ — yalnız tckn ve vkn.
 * - Yabancı (foreigner) YKN'leri TCKN algoritmasıyla zaten geçer (ayrı kural gerekmez).
 *
 * Validator tek-kaynak: common/identity-validation.util (OCR/UYAP/import ile paylaşılır — kod tekrarı yok).
 */
export function assertCreateIdentityChecksum(data: {
  tckn?: string | null;
  vkn?: string | null;
}): void {
  const tckn = (data.tckn ?? "").trim();
  if (tckn && !isValidTckn(tckn)) {
    throw new BadRequestException("Geçersiz TCKN (kimlik no doğrulaması başarısız)");
  }
  const vkn = (data.vkn ?? "").trim();
  if (vkn && !isValidVkn(vkn)) {
    throw new BadRequestException("Geçersiz VKN (vergi kimlik no doğrulaması başarısız)");
  }
}

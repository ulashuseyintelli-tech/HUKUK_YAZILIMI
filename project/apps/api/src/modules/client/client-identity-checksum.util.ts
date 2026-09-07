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
export const CLIENT_IDENTITY_CHECKSUM_INVALID = "CLIENT_IDENTITY_CHECKSUM_INVALID";

/** Kullanıcıya gösterilen metinler — DEĞİŞTİRİLMEZ (istemci bunları gösteriyor). */
const CHECKSUM_MESSAGES = {
  tckn: "Geçersiz TCKN (kimlik no doğrulaması başarısız)",
  vkn: "Geçersiz VKN (vergi kimlik no doğrulaması başarısız)",
} as const;

/**
 * Checksum reddinin TEK gövde biçimi (CLIENT-IDENTITY-REASONCODE-CONSISTENCY, owner GO 2026-09-08).
 *
 * ÖNCE: create ve değişen-değer update yolları DÜZ METİN `BadRequestException` fırlatıyordu
 * (`reasonCode` YOK, `offendingFields` YOK); yalnız reaktivasyon yapısal gövde döndürüyordu.
 * Aynı checksum reddi iki farklı sözleşmeyle çıkıyor ve istemci bunları makinece ayırt edemiyordu.
 *
 * SONRA: üç yol da AYNI gövdeyi taşır — `{ message, reasonCode, offendingFields }`.
 *   - `message`  : mevcut kullanıcı metni AYNEN korunur (geriye uyumluluk; istemci onu gösterir).
 *   - `reasonCode`: stabil `CLIENT_IDENTITY_CHECKSUM_INVALID`.
 *   - `offendingFields`: yalnız ALAN ADLARI (`tckn`/`vkn`). **Kimlik DEĞERİ taşınmaz** —
 *     yanıt, log ve audit'e kimlik numarası girmez (PII yasağı, D08 emsali).
 *
 * HTTP durumu (400), kabul/red kuralları ve boş kimlik / `identityNo` sözleşmesi DEĞİŞMEZ.
 * NestJS `HttpException`, gövdedeki `message` alanını `error.message` olarak da yansıtır;
 * bu yüzden `e.message` okuyan mevcut tüketiciler (ör. seed log'u) etkilenmez.
 */
function identityChecksumError(message: string, offendingFields: string[]): BadRequestException {
  return new BadRequestException({ message, reasonCode: CLIENT_IDENTITY_CHECKSUM_INVALID, offendingFields });
}

export function assertCreateIdentityChecksum(data: {
  tckn?: string | null;
  vkn?: string | null;
}): void {
  const offendingFields: string[] = [];
  const tckn = (data.tckn ?? "").trim();
  if (tckn && !isValidTckn(tckn)) offendingFields.push("tckn");
  const vkn = (data.vkn ?? "").trim();
  if (vkn && !isValidVkn(vkn)) offendingFields.push("vkn");
  if (offendingFields.length === 0) return;
  // Mesaj GERİYE UYUMLU: eskiden TCKN önce kontrol edilip ilk hatada fırlatılıyordu; ikisi de
  // geçersizse kullanıcı yine TCKN metnini görür. `offendingFields` ise HEPSİNİ taşır.
  throw identityChecksumError(CHECKSUM_MESSAGES[offendingFields[0] as "tckn" | "vkn"], offendingFields);
}

/**
 * D-1b (owner GO 2026-09-06) — BİLİNÇLİ DAVRANIŞ SIKILAŞTIRMASI (Faz 1 → dar Faz 4 dilimi).
 *
 * Owner kararı: mevcut gerçek kimlik verisi DEĞİŞTİRİLMEZ ve yapay değerle tamamlanmaz; yalnız
 * İLERİYE DÖNÜK iki yol sıkılaşır:
 *   (1) `update()` ile DEĞİŞTİRİLEN ve DOLU olan TCKN/VKN değeri checksum'dan geçer;
 *       değişmeyen legacy (geçersiz-checksum) değer AYNEN kalır ve isteği DÜŞÜRMEZ,
 *   (2) her `isActive:false → true` geçişinde YAZILACAK SON kimlik değerleri geçerli olmalıdır.
 *
 * Korunan sözleşmeler: boş kimlik SERBEST (no-tckn müvekkil); `identityNo` (serbest/pasaport,
 * deprecated alan) DOĞRULANMAZ; format kontrolü DTO'da kalır; audit/dedup davranışı değişmez.
 * Bu kural canlıdaki 7 pasif geçersiz-checksum kaydını DÜZELTMEZ ("düzeltildi" sayılamaz);
 * yalnız onların yetkisiz biçimde yeniden aktifleştirilmesini ve yeni geçersiz yazımı engeller.
 */
export function assertChangedIdentityChecksum(
  incoming: { tckn?: string | null; vkn?: string | null },
  existing: { tckn?: string | null; vkn?: string | null },
): void {
  const changedTckn = incoming.tckn !== undefined && (incoming.tckn ?? "") !== (existing.tckn ?? "");
  const changedVkn = incoming.vkn !== undefined && (incoming.vkn ?? "") !== (existing.vkn ?? "");
  assertCreateIdentityChecksum({
    tckn: changedTckn ? incoming.tckn : null,
    vkn: changedVkn ? incoming.vkn : null,
  });
}

/** Reaktivasyonda YAZILACAK SON kimlik (yeni değer varsa o, yoksa mevcut) doğrulanır. */
export function resolveEffectiveIdentity(
  incoming: { tckn?: string | null; vkn?: string | null },
  existing: { tckn?: string | null; vkn?: string | null },
): { tckn: string | null; vkn: string | null } {
  return {
    tckn: (incoming.tckn !== undefined ? incoming.tckn : existing.tckn) ?? null,
    vkn: (incoming.vkn !== undefined ? incoming.vkn : existing.vkn) ?? null,
  };
}

/**
 * Reaktivasyon kimlik kapısı. Geçersizse 400 + stabil `reasonCode`; alan ADLARI taşınır,
 * DEĞER taşınmaz (PII yasağı). Düzeltme yolu: yetkili kullanıcı geçerli kimliği kaynak
 * belgeye dayanarak girer, sonra kaydı aktifleştirir.
 */
export function assertReactivationIdentityChecksum(effective: { tckn: string | null; vkn: string | null }): void {
  const offendingFields: string[] = [];
  const tckn = (effective.tckn ?? "").trim();
  if (tckn && !isValidTckn(tckn)) offendingFields.push("tckn");
  const vkn = (effective.vkn ?? "").trim();
  if (vkn && !isValidVkn(vkn)) offendingFields.push("vkn");
  if (offendingFields.length > 0) {
    // Aynı gövde biçimi (tek kaynak: `identityChecksumError`); reaktivasyonun KENDİ kullanıcı
    // metni korunur — bu yol zaten stabil `reasonCode` taşıyordu ve sözleşmesi DEĞİŞMEDİ.
    throw identityChecksumError(
      "Kaydı aktifleştirmek için geçerli kimlik numarası gerekir (kimlik doğrulaması başarısız). " +
        "Önce kaynak belgeye dayanarak kimliği düzeltin.",
      offendingFields,
    );
  }
}

import { BadRequestException } from "@nestjs/common";
import type { CreateCaseDto } from "../dto/case.dto";

/**
 * Tarihsel dosya aktarımı (owner GO-COMPLETE 12.11.2026, "MEŞE pilot — ilk aktarımı engelleyen ürün davranışlarını çöz":
 * "Tarihsel dosya aktarımı, yeni takip açılışından ayrılacak. Normal yeni takip davranışı korunacak; genel otomasyonlar
 * kapatılmayacak.").
 *
 * Başka sistemde (bugün yalnız MEŞE İcraProfesörü) açılmış, geçmişi olan bir dosya, yeni takip açılışının "ilk gün"
 * otomasyonları olmadan kaydedilir. Normal `POST /cases` bu dosyadaki hiçbir şeyden etkilenmez; tarihsel yol ayrı
 * uçtadır (`POST /cases/historical-import`), varsayılan KAPALIDIR ve yalnız ADMIN kullanabilir.
 *
 * Tarihsel yolda ATLANAN yan etkiler (yeni takip açılışında bugün olduğu gibi kalır):
 *  - DEFAULT_LAWYERS: "yeni takiplerde otomatik seç" işaretli avukatların dosyaya eklenmesi; yalnız istekte açıkça
 *    eşlenen avukatlar bağlanır.
 *  - DEFAULT_STAFF: varsayılan personelin eklenmesi; `staff` verilmezse boş liste sayılır.
 *  - CLIENT_INFO_REQUEST: otomatik müvekkil bilgi talebi (dış gönderim).
 *  - OPENING_EXPENSE_REQUEST: otomatik açılış masraf talebi ve ona bağlı muhasebe günlüğü kaydı (kaynakta olmayan mali
 *    kayıt; geçmiş masraf masraf talebine dönüştürülmez).
 *
 * Tarihsel dosya otomasyon, UYAP işlemi ve müvekkile gösterim KAPALI açılır; kullanıcı dosyayı inceledikten sonra
 * mevcut `PATCH /cases/:id` ile açabilir. Kaynak sistem, kaynak dosya kimliği, aktarım zamanı ve aktaran kullanıcı
 * `Case.metadata.historicalImport` alanında ve ayrı bir denetim satırında korunur. Aynı kaynak dosyanın ikinci
 * aktarımı 409 ile reddedilir (taraf ya da dosya yazılmadan).
 */
export const CASE_HISTORICAL_IMPORT_FLAG = "CASE_HISTORICAL_IMPORT_ENABLED";

export const HISTORICAL_IMPORT_SOURCE_SYSTEMS = ["MESE"] as const;
export type HistoricalImportSourceSystem = (typeof HISTORICAL_IMPORT_SOURCE_SYSTEMS)[number];

/** Kaynak dosya kimliği: kaynak sistemdeki dosya / takip numarası (ör. MEŞE Takip No). */
export const HISTORICAL_IMPORT_SOURCE_REF_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._/-]{0,63}$/;

export const HISTORICAL_IMPORT_ALREADY_EXISTS = "HISTORICAL_IMPORT_ALREADY_EXISTS";
export const HISTORICAL_IMPORT_FIELD_FORBIDDEN = "HISTORICAL_IMPORT_FIELD_FORBIDDEN";

export const HISTORICAL_IMPORT_SKIPPED_SIDE_EFFECTS = [
  "DEFAULT_LAWYERS",
  "DEFAULT_STAFF",
  "CLIENT_INFO_REQUEST",
  "OPENING_EXPENSE_REQUEST",
] as const;

export interface HistoricalImportSource {
  sourceSystem: HistoricalImportSourceSystem;
  sourceCaseRef: string;
}

/** `Case.metadata.historicalImport` içeriği. */
export interface HistoricalImportMarker extends HistoricalImportSource {
  importedAt: string;
  importedById: string;
}

/**
 * <remarks>
 * Çağrıldığı yerler:
 * - CaseController.historicalImport() → POST /cases/historical-import (bayrak kapalıysa uç yokmuş gibi 404)
 * </remarks>
 */
export function isCaseHistoricalImportEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env[CASE_HISTORICAL_IMPORT_FLAG] === "true";
}

/**
 * Tarihsel aktarımda anlamı olmayan ve yeni mali kayıt / onay / dış gönderim doğuracak alanlar reddedilir
 * (sessizce yok sayılmaz: istemci ne istediğini açıkça görür).
 *
 * <remarks>
 * Çağrıldığı yerler:
 * - CaseService.createHistoricalImport() → POST /cases/historical-import (hiçbir okuma / yazmadan önce)
 * </remarks>
 */
export function assertHistoricalImportPayload(dto: CreateCaseDto): void {
  if (dto.sendExpenseEmail === true) {
    throw new BadRequestException({
      code: HISTORICAL_IMPORT_FIELD_FORBIDDEN,
      field: "sendExpenseEmail",
      message: "Tarihsel aktarımda masraf e-postası gönderilmez; açılış masraf talebi oluşturulmaz.",
    });
  }
  if (dto.checkPenaltyFormation?.requested) {
    throw new BadRequestException({
      code: HISTORICAL_IMPORT_FIELD_FORBIDDEN,
      field: "checkPenaltyFormation",
      message: "Tarihsel aktarımda çek tazminatı onay talebi açılmaz.",
    });
  }
}

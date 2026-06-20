import { Type } from "class-transformer";
import {
  ArrayMinSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsNumber,
  IsOptional,
  Max,
  Min,
  ValidateNested,
} from "class-validator";

/**
 * A2-min / A3 — OCR extraction feedback DTO (PII'SİZ telemetri).
 *
 * Bu sözlük BİLEREK kanonik domain InstrumentType'tan (CEK/SENET/POLICE/FATURA/DIGER) AYRIDIR:
 * analytics sınırı için sade + sabit tutulur. Frontend (PR-2) gönderirken eşler
 * (CEK→CHECK, SENET→PROMISSORY_NOTE, diğer/bilinmeyen→UNKNOWN).
 *
 * KRİTİK INVARYANT (PII YOK): bu DTO ham OCR değeri / kullanıcının final değeri / iş değeri
 * (tutar, çek no, tarih, ad-soyad, TCKN/VKN) TAŞIMAZ. Global ValidationPipe
 * (whitelist + forbidNonWhitelisted) sayesinde gövdeye böyle bir alan eklenirse istek 400 olur.
 */
export const OCR_FEEDBACK_DOCUMENT_TYPES = ["CHECK", "PROMISSORY_NOTE", "UNKNOWN"] as const;
export type OcrFeedbackDocumentType = (typeof OCR_FEEDBACK_DOCUMENT_TYPES)[number];

/** İlk kapsam: yalnız 4 düzenlenebilir instrument alanı (party/A1 alanları SONRAKİ PR). */
export const OCR_FEEDBACK_FIELDS = ["documentNo", "issueDate", "dueDate", "amount"] as const;
export type OcrFeedbackField = (typeof OCR_FEEDBACK_FIELDS)[number];

export class OcrExtractionFeedbackItemDto {
  /** Senet türü (analytics sözlüğü). */
  @IsIn(OCR_FEEDBACK_DOCUMENT_TYPES)
  instrumentType: OcrFeedbackDocumentType;

  /** Geri-bildirim verilen alan (yalnız 4 düzenlenebilir alan). */
  @IsIn(OCR_FEEDBACK_FIELDS)
  field: OcrFeedbackField;

  /** Kullanıcı bu alanı OCR-orijinaline göre DEĞİŞTİRDİ mi? (yalnız bit; değer YAZILMAZ). */
  @IsBoolean()
  edited: boolean;

  /** Instrument OCR güveni (0-100). */
  @IsNumber()
  @Min(0)
  @Max(100)
  confidence: number;

  /** Gruplama güveni (0-100; frontend 0-1'i 100 ile ölçekler). */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  groupConfidence?: number;

  /** Gruplama belirsiz/şüpheli işaretlendi mi? */
  @IsOptional()
  @IsBoolean()
  needsReview?: boolean;
}

export class OcrExtractionFeedbackDto {
  /** Belge türü (analytics sözlüğü). */
  @IsIn(OCR_FEEDBACK_DOCUMENT_TYPES)
  documentType: OcrFeedbackDocumentType;

  /** En az 1 alan-bazlı geri-bildirim kalemi (boş gövde reddedilir). */
  @IsArray()
  @ArrayMinSize(1)
  @ValidateNested({ each: true })
  @Type(() => OcrExtractionFeedbackItemDto)
  items: OcrExtractionFeedbackItemDto[];
}

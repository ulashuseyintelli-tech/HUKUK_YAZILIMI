/**
 * PR-4: OCR tarama yükleme dosya limiti — frontend TEK KAYNAK.
 * Kullanım: DocumentSourceSelector · DebtorStep · PoaScannerWizard (boyut kontrolü + gösterim).
 * Backend gate ile hizalı: apps/api ocr.controller.ts MAX_OCR_UPLOAD_BYTES (50MB).
 */
export const MAX_OCR_UPLOAD_BYTES = 50 * 1024 * 1024; // 50MB
export const MAX_OCR_UPLOAD_LABEL = "50MB";

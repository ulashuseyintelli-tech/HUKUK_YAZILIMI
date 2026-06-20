/**
 * PR-4 — OCR yükleme dosya limiti 10MB→50MB.
 * supported-formats endpoint'i MAX_OCR_UPLOAD_LABEL'i ("50MB") döndürür (tek-kaynak const).
 * 4 FileInterceptor limiti aynı MAX_OCR_UPLOAD_BYTES const'una bağlı (decorator config; e2e-dışı).
 */
import { OcrController } from '../ocr.controller';

describe('PR-4 OcrController — OCR yükleme limiti', () => {
  it('getSupportedFormats() maxFileSize "50MB" döner', () => {
    const controller = new OcrController({} as any, {} as any); // getSupportedFormats servisleri kullanmaz
    const result = controller.getSupportedFormats();
    expect(result.maxFileSize).toBe('50MB');
  });
});

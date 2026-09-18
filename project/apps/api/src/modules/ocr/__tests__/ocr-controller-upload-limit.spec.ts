/**
 * PR-4 — OCR yükleme dosya limiti 10MB→50MB.
 * supported-formats endpoint'i MAX_OCR_UPLOAD_LABEL'i ("50MB") döndürür (tek-kaynak const).
 * 4 FileInterceptor limiti aynı MAX_OCR_UPLOAD_BYTES const'una bağlı (decorator config; e2e-dışı).
 */
// pdf-poppler (npm) modul YUKLENIRKEN os.platform() darwin/win32 degilse process.exit(1)
// cagirir (node_modules/pdf-poppler/index.js). Bu spec'in import zinciri (../ocr.controller -> ocr.service)
// ocr.service'in ust-seviye require('pdf-poppler')'ini yukler; Linux CI'da bu cagri jest
// surecini oldurup manifestin TAMAMINI dusururdu.
// Bu spec PDF->goruntu donusumunu DOGRULAMAZ: tanilama kosumunda (pdf-poppler yerine sayacli
// stub) convert() cagri sayisi 0 olculdu. Stub bilincli olarak FIRLATIR — donusum ileride
// bu spec'in yoluna girerse test sessizce gecmez, duser.
// Emsal (CI'da kosan): collection/__tests__/receipt-public-entrypoints-authorization.contract.spec.ts
jest.mock('pdf-poppler', () => ({
  convert: async () => {
    throw new Error('pdf-poppler is stubbed in unit tests');
  },
}));

import { OcrController } from '../ocr.controller';

describe('PR-4 OcrController — OCR yükleme limiti', () => {
  it('getSupportedFormats() maxFileSize "50MB" döner', () => {
    const controller = new OcrController({} as any, {} as any); // getSupportedFormats servisleri kullanmaz
    const result = controller.getSupportedFormats();
    expect(result.maxFileSize).toBe('50MB');
  });
});

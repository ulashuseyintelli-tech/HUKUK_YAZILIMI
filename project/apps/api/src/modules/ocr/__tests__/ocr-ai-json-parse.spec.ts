/**
 * PR — AI JSON.parse call-site'larını fence-safe parseAiJson'a geçirme WIRING testleri.
 *
 * Kanıtlanan: gpt-4o/gpt-4 ```json markdown-fence yanıtında ham JSON.parse PATLAR → catch →
 * rule/vision fallback (AI sonucu KAYBOLUR). parseAiJson (stripJsonFence+JSON.parse) ile fence'li
 * yanıt artık parse olur, fallback'e DÜŞMEZ. Mutlu-yol (fence-siz JSON) davranışı AYNI.
 *
 * Gerçek OpenAI/extraction YOK (mock). parseAiJson fence-doğruluğu page-candidate-extractor.spec'te.
 */
import { OcrService } from '../ocr.service';

// multi-instrument-wiring.spec.ts deseni: OcrService yalnız mock ConfigService ile kurulur.
const buildSvc = () => new OcrService({ get: jest.fn(() => undefined) } as any);
const mockOpenAi = (svc: OcrService, content: string) => {
  const create = jest.fn(async () => ({ choices: [{ message: { content } }] }));
  (svc as any).openai = { chat: { completions: { create } } };
  return create;
};

describe('PR — fence-safe AI JSON parse (parseAiJson) — wiring', () => {
  it('classifyDocumentWithAI: ```json fence yanıtı → AI sonucu parse edilir, rule fallback ÇAĞRILMAZ', async () => {
    const svc = buildSvc();
    mockOpenAi(
      svc,
      '```json\n{"detectedType":"KAMBIYO","detectedSubCategory":null,"confidence":95,"suggestedFormCode":"FORM_10","matchedKeywords":["çek"],"explanation":"x"}\n```',
    );
    const fallbackSpy = jest.spyOn(svc, 'classifyDocument');
    const r = await svc.classifyDocumentWithAI('rastgele metin — kambiyo anahtar kelimesi yok');
    expect(fallbackSpy).not.toHaveBeenCalled(); // parse başarılı → fallback yok (fix öncesi: fence→throw→fallback)
    expect(r.confidence).toBe(95); // AI değeri (rule fallback üretmezdi)
    expect(r.matchedKeywords).toContain('çek');
  });

  it('classifyDocumentWithAI: fence-siz düz JSON da parse edilir (regresyon — mutlu yol değişmez)', async () => {
    const svc = buildSvc();
    mockOpenAi(svc, '{"detectedType":"ILAMSIZ","confidence":80,"matchedKeywords":[]}');
    const fallbackSpy = jest.spyOn(svc, 'classifyDocument');
    const r = await svc.classifyDocumentWithAI('düz json testi');
    expect(fallbackSpy).not.toHaveBeenCalled();
    expect(r.confidence).toBe(80);
  });

  it('scanDebtDocumentLegacy (CANLI prod yolu): fence yanıt → AI debtInfo parse edilir, rule/vision fallback ÇAĞRILMAZ', async () => {
    const svc = buildSvc();
    // metin çıkarımını stub'la (>50 char, görüntü değil) → AI yoluna ulaşsın
    jest
      .spyOn(svc as any, 'extractText')
      .mockResolvedValue({ text: 'Bu bir borç evrakı metnidir; çek borçlu tutar vade '.repeat(3), metadata: {} });
    mockOpenAi(
      svc,
      '```json\n{"documentType":"CEK","parties":[],"debtInfo":{"documentNo":"TEST123","amount":5000,"currency":"TRY"},"bankInfo":{},"suggestedCaseType":"KAMBIYO","confidence":90}\n```',
    );
    const ruleSpy = jest.spyOn(svc as any, 'parseDebtDocumentWithRules');
    const visionSpy = jest.spyOn(svc as any, 'scanDebtDocumentWithVision');
    const r: any = await (svc as any).scanDebtDocumentLegacy(Buffer.from('x'), 'application/pdf', 'x.pdf');
    expect(ruleSpy).not.toHaveBeenCalled(); // parse başarılı → rule fallback yok
    expect(visionSpy).not.toHaveBeenCalled(); // metin yolu (görüntü değil)
    expect(r.debtInfo.documentNo).toBe('TEST123'); // AI değeri
  });
});

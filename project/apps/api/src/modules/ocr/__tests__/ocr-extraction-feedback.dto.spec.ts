/**
 * A2-min / A3 — OcrExtractionFeedbackDto sert doğrulama testleri.
 *
 * main.ts ile AYNI global ValidationPipe config'i (whitelist + forbidNonWhitelisted + transform)
 * kullanılır. Kritik: gövdeye ham OCR/final değer ya da bilinmeyen bir alan eklenirse 400.
 */
import { BadRequestException, ValidationPipe } from "@nestjs/common";
import { OcrExtractionFeedbackDto } from "../dto/extraction-feedback.dto";

const pipe = new ValidationPipe({
  whitelist: true,
  forbidNonWhitelisted: true,
  transform: true,
});

const META = { type: "body", metatype: OcrExtractionFeedbackDto, data: "" } as any;

const validPayload = () => ({
  documentType: "CHECK",
  items: [
    { instrumentType: "CHECK", field: "amount", edited: true, confidence: 95, groupConfidence: 55, needsReview: true },
  ],
});

async function expectReject(payload: any) {
  await expect(pipe.transform(payload, META)).rejects.toThrow(BadRequestException);
}

describe("OcrExtractionFeedbackDto — sert doğrulama", () => {
  it("geçerli payload kabul edilir ve DTO örneğine dönüşür", async () => {
    const out = await pipe.transform(validPayload(), META);
    expect(out).toBeInstanceOf(OcrExtractionFeedbackDto);
    expect(out.items[0]).toMatchObject({ field: "amount", edited: true, confidence: 95 });
  });

  it("boş items reddedilir (400)", async () => {
    await expectReject({ documentType: "CHECK", items: [] });
  });

  it("enum dışı field reddedilir (400)", async () => {
    const p = validPayload();
    p.items[0].field = "drawerName" as any; // ilk kapsam dışı / enum dışı
    await expectReject(p);
  });

  it("confidence 100 üstü reddedilir (400)", async () => {
    const p = validPayload();
    p.items[0].confidence = 150 as any;
    await expectReject(p);
  });

  it("confidence 0 altı reddedilir (400)", async () => {
    const p = validPayload();
    p.items[0].confidence = -5 as any;
    await expectReject(p);
  });

  it("edited boolean değilse reddedilir (400)", async () => {
    const p = validPayload();
    p.items[0].edited = "yes" as any;
    await expectReject(p);
  });

  it("documentType enum dışıysa reddedilir (400)", async () => {
    const p = validPayload();
    p.documentType = "FATURA" as any; // analytics sözlüğü dışı
    await expectReject(p);
  });

  it("ÜST seviyede ham/PII alanı eklenirse reddedilir (forbidNonWhitelisted → 400)", async () => {
    const p: any = validPayload();
    p.rawText = "Gorka Kozmetik A.Ş. 5.000 TL"; // PII/iş değeri — ASLA kabul edilmemeli
    await expectReject(p);
  });

  it("ITEM içinde ham/final değer alanı eklenirse reddedilir (forbidNonWhitelisted → 400)", async () => {
    const p: any = validPayload();
    p.items[0].ocrValue = "0265897"; // ham OCR değeri — ASLA kabul edilmemeli
    await expectReject(p);
  });

  it("ITEM içinde 'value' (final değer) alanı eklenirse reddedilir (400)", async () => {
    const p: any = validPayload();
    p.items[0].value = 5000; // kullanıcı final değeri — ASLA kabul edilmemeli
    await expectReject(p);
  });

  it("zorunlu alan (confidence) eksikse reddedilir (400)", async () => {
    const p: any = validPayload();
    delete p.items[0].confidence;
    await expectReject(p);
  });
});

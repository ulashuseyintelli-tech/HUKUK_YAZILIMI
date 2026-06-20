/**
 * A2-min / A3 — OcrFeedbackService birim testleri.
 * - Geçerli payload AuditService.log'u çağırır (alan başına 1 satır).
 * - Yazılan kayıt PII İÇERMEZ (yalnız metrik; ham OCR/final değer yok).
 * - tenant/user context log'a geçer.
 */
import {
  OcrFeedbackService,
  OCR_FEEDBACK_ACTION,
  OCR_FEEDBACK_ENTITY_TYPE,
} from "../ocr-feedback.service";
import { OcrExtractionFeedbackDto } from "../dto/extraction-feedback.dto";

function makeService() {
  const log = jest.fn().mockResolvedValue(undefined);
  const audit = { log } as any;
  const service = new OcrFeedbackService(audit);
  return { service, log };
}

const actor = { tenantId: "t-1", userId: "u-1", userName: "Av. Test" };

const validDto: OcrExtractionFeedbackDto = {
  documentType: "CHECK",
  items: [
    { instrumentType: "CHECK", field: "amount", edited: true, confidence: 95, groupConfidence: 55, needsReview: true },
    { instrumentType: "CHECK", field: "issueDate", edited: false, confidence: 90 },
  ],
};

describe("OcrFeedbackService.recordExtractionFeedback", () => {
  it("alan başına bir AuditService.log çağırır ve sayıyı döner", async () => {
    const { service, log } = makeService();

    const result = await service.recordExtractionFeedback(actor, validDto);

    expect(result).toEqual({ recorded: 2 });
    expect(log).toHaveBeenCalledTimes(2);
  });

  it("tenant/user context + ayrım sabitlerini log'a geçirir", async () => {
    const { service, log } = makeService();

    await service.recordExtractionFeedback(actor, validDto);

    const first = log.mock.calls[0][0];
    expect(first.tenantId).toBe("t-1");
    expect(first.userId).toBe("u-1");
    expect(first.userName).toBe("Av. Test");
    expect(first.action).toBe(OCR_FEEDBACK_ACTION);
    expect(first.entityType).toBe(OCR_FEEDBACK_ENTITY_TYPE);
  });

  it("yalnız metrik yazar — PII / ham değer / iş değeri yazmaz", async () => {
    const { service, log } = makeService();

    await service.recordExtractionFeedback(actor, validDto);

    for (const call of log.mock.calls) {
      const input = call[0];
      // entityId ve old/newValues gerçek değer taşımaz
      expect(input.entityId).toBeUndefined();
      expect(input.oldValues).toBeUndefined();
      expect(input.newValues).toBeUndefined();

      // metadata yalnız PII'siz metrik anahtarları içerir
      const keys = Object.keys(input.metadata).sort();
      const allowed = [
        "confidence",
        "documentType",
        "edited",
        "field",
        "groupConfidence",
        "instrumentType",
        "needsReview",
      ];
      for (const k of keys) {
        expect(allowed).toContain(k);
      }
      // ham OCR / final değer anahtarları KESİNLİKLE olmamalı
      const serialized = JSON.stringify(input.metadata);
      for (const forbidden of ["ocrValue", "finalValue", "rawValue", "value", "amountValue"]) {
        expect(serialized).not.toContain(forbidden);
      }
    }
  });

  it("opsiyonel alanlar yoksa metadata'da yer almaz", async () => {
    const { service, log } = makeService();

    await service.recordExtractionFeedback(actor, validDto);

    // ikinci item groupConfidence/needsReview taşımıyor
    const second = log.mock.calls[1][0];
    expect(second.metadata.groupConfidence).toBeUndefined();
    expect(second.metadata.needsReview).toBeUndefined();
    expect(second.metadata.edited).toBe(false);
    expect(second.metadata.confidence).toBe(90);
  });
});

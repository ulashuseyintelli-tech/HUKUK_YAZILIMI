import { describe, it, expect } from 'vitest';
import {
  mapToTelemetryType,
  isFieldEdited,
  buildExtractionFeedbackPayload,
} from '../components/debtor/ocr-feedback-telemetry';
import type { Instrument, ReviewRow } from '../components/debtor/ocr-instrument';

function inst(overrides: Partial<Instrument> = {}): Instrument {
  return {
    type: 'CEK',
    currency: 'TRY',
    confidence: 95,
    ...overrides,
  };
}

describe('mapToTelemetryType', () => {
  it('CEK→CHECK, SENET→PROMISSORY_NOTE, diğerleri→UNKNOWN', () => {
    expect(mapToTelemetryType('CEK')).toBe('CHECK');
    expect(mapToTelemetryType('SENET')).toBe('PROMISSORY_NOTE');
    expect(mapToTelemetryType('POLICE')).toBe('UNKNOWN');
    expect(mapToTelemetryType('FATURA')).toBe('UNKNOWN');
    expect(mapToTelemetryType('DIGER')).toBe('UNKNOWN');
    expect(mapToTelemetryType(undefined)).toBe('UNKNOWN');
    expect(mapToTelemetryType(null)).toBe('UNKNOWN');
  });
});

describe('isFieldEdited (PII tutmaz, yalnız bool)', () => {
  it('boş+boş=false', () => {
    expect(isFieldEdited(undefined, undefined)).toBe(false);
    expect(isFieldEdited('', '')).toBe(false);
    expect(isFieldEdited(undefined, '')).toBe(false);
  });
  it('boş+dolu=true (OCR kaçırdı, kullanıcı doldurdu)', () => {
    expect(isFieldEdited(undefined, '0265897')).toBe(true);
    expect(isFieldEdited('', 5000)).toBe(true);
  });
  it('dolu+değişti=true', () => {
    expect(isFieldEdited(5000, 5500)).toBe(true);
    expect(isFieldEdited('2025-07-07', '2025-12-30')).toBe(true);
  });
  it('dolu+aynı=false (trim + numeric normalize)', () => {
    expect(isFieldEdited(5000, 5000)).toBe(false);
    expect(isFieldEdited('A ', 'A')).toBe(false);
    expect(isFieldEdited('2025-07-07', '2025-07-07')).toBe(false);
  });
});

describe('buildExtractionFeedbackPayload', () => {
  it('yalnız SEÇİLİ instrument (M1) — seçili olmayan dışlanır', () => {
    const originals = [inst({ documentNo: 'A' }), inst({ documentNo: 'B' })];
    const rows: ReviewRow[] = [
      { selected: true, instrument: inst({ documentNo: 'A' }) },
      { selected: false, instrument: inst({ documentNo: 'B' }) },
    ];
    const payload = buildExtractionFeedbackPayload('CEK', originals, rows);
    expect(payload).not.toBeNull();
    // yalnız 1 seçili × 4 alan = 4 item
    expect(payload!.items).toHaveLength(4);
    expect(payload!.items.map((i) => i.field).sort()).toEqual(['amount', 'documentNo', 'dueDate', 'issueDate']);
  });

  it('documentType maplenir; instrumentType maplenir', () => {
    const rows: ReviewRow[] = [{ selected: true, instrument: inst({ type: 'SENET' }) }];
    const payload = buildExtractionFeedbackPayload('SENET', [inst({ type: 'SENET' })], rows);
    expect(payload!.documentType).toBe('PROMISSORY_NOTE');
    expect(payload!.items.every((i) => i.instrumentType === 'PROMISSORY_NOTE')).toBe(true);
  });

  it('edited 3 kuralı doğru hesaplar (orijinal vs final, index hizalı)', () => {
    const originals = [inst({ documentNo: '0265897', amount: 5000, issueDate: '2025-07-07', dueDate: undefined })];
    const rows: ReviewRow[] = [
      { selected: true, instrument: inst({ documentNo: '0265897', amount: 5500, issueDate: '2025-07-07', dueDate: '2025-12-30' }) },
    ];
    const payload = buildExtractionFeedbackPayload('CEK', originals, rows);
    const byField = Object.fromEntries(payload!.items.map((i) => [i.field, i.edited]));
    expect(byField.documentNo).toBe(false); // aynı
    expect(byField.amount).toBe(true); // 5000→5500
    expect(byField.issueDate).toBe(false); // aynı
    expect(byField.dueDate).toBe(true); // boş→dolu
  });

  it('groupConfidence 0-1 → 0-100; needsReview geçer', () => {
    const rows: ReviewRow[] = [
      { selected: true, instrument: inst({ confidence: 90, groupConfidence: 0.55, needsReview: true }) },
    ];
    const payload = buildExtractionFeedbackPayload('CEK', [inst()], rows);
    expect(payload!.items[0].confidence).toBe(90);
    expect(payload!.items[0].groupConfidence).toBe(55);
    expect(payload!.items[0].needsReview).toBe(true);
  });

  it('seçili instrument yoksa null', () => {
    const rows: ReviewRow[] = [{ selected: false, instrument: inst() }];
    expect(buildExtractionFeedbackPayload('CEK', [inst()], rows)).toBeNull();
    expect(buildExtractionFeedbackPayload('CEK', [], [])).toBeNull();
  });

  it('PII GUARD — payload JSON içinde gerçek DEĞERLER geçmez (yalnız field adları + metrik)', () => {
    const originals = [inst({ documentNo: '0265897', amount: 5000, issueDate: '2025-07-07', dueDate: '2025-12-30' })];
    const rows: ReviewRow[] = [
      { selected: true, instrument: inst({ documentNo: '0265897', amount: 5500, issueDate: '2025-07-07', dueDate: '2025-12-30', drawerName: 'Gorka Kozmetik A.Ş.' }) },
    ];
    const json = JSON.stringify(buildExtractionFeedbackPayload('CEK', originals, rows));
    for (const value of ['0265897', '5000', '5500', '2025-07-07', '2025-12-30', 'Gorka']) {
      expect(json).not.toContain(value);
    }
    // field ADLARI geçebilir (değer değil)
    expect(json).toContain('documentNo');
    expect(json).toContain('amount');
  });
});

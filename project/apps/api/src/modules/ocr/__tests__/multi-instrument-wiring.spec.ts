/**
 * PR-2b-3 — scanDebtDocument çoklu-enstrüman WIRING testleri.
 *
 * Kanıtlanan: flag kapalı→multi çağrılmaz; flag açık+4 aday→2 instrument;
 * debtInfo=primary(ilk güvenilir); pipeline throw→legacy fallback; instruments boş→legacy fallback.
 * AI tek sayfa görür; grouping deterministik motorda. Gerçek AI/poppler YOK (mock).
 */

import { OcrService, buildDebtResultFromInstruments } from '../ocr.service';
import { pickPrimaryInstrument } from '../debt-instrument-grouping';
import { Instrument } from '../debt-instrument.types';

const buildSvc = (flag?: string) =>
  new OcrService({
    get: jest.fn((k: string) => (k === 'OCR_MULTI_INSTRUMENT' ? flag : undefined)),
  } as any);

const inst = (over: Partial<Instrument>): Instrument =>
  ({ type: 'CEK', currency: 'TRY', confidence: 0, ...over } as Instrument);

describe('PR-2b-3 pickPrimaryInstrument — ilk güvenilir', () => {
  it('İLK needsReview=false primary olur (sonra daha yüksek confidence olsa bile)', () => {
    const insts = [
      inst({ documentNo: 'A', confidence: 50, needsReview: false, sourcePages: [1] }),
      inst({ documentNo: 'B', confidence: 99, needsReview: false, sourcePages: [3] }),
    ];
    expect(pickPrimaryInstrument(insts)).toBe(insts[0]); // belge sırasında ilk güvenilir
  });

  it('hepsi needsReview → en yüksek confidence', () => {
    const insts = [
      inst({ confidence: 50, needsReview: true, sourcePages: [1] }),
      inst({ confidence: 90, needsReview: true, sourcePages: [3] }),
    ];
    expect(pickPrimaryInstrument(insts)).toBe(insts[1]);
  });

  it('hepsi needsReview + eşit confidence → en küçük sourcePages', () => {
    const insts = [
      inst({ confidence: 50, groupConfidence: 0.4, needsReview: true, sourcePages: [5] }),
      inst({ confidence: 50, groupConfidence: 0.4, needsReview: true, sourcePages: [2] }),
    ];
    expect(pickPrimaryInstrument(insts)).toBe(insts[1]); // 2 < 5
  });

  it('boş → null', () => {
    expect(pickPrimaryInstrument([])).toBeNull();
  });
});

describe('PR-2b-3 buildDebtResultFromInstruments — debtInfo=primary', () => {
  it('boş instruments → null', () => {
    expect(buildDebtResultFromInstruments([])).toBeNull();
  });

  it('debtInfo PRIMARY’den; instruments taşınır; parties; CEK→KAMBIYO', () => {
    const insts = [
      inst({ documentNo: 'A', amount: 100, dueDate: '2025-01-01', drawerName: 'Borçlu X', needsReview: false, sourcePages: [1] }),
      inst({ documentNo: 'B', amount: 200, needsReview: true, sourcePages: [3] }),
    ];
    const r = buildDebtResultFromInstruments(insts)!;
    expect(r.debtInfo.documentNo).toBe('A'); // primary = ilk güvenilir
    expect(r.debtInfo.amount).toBe(100);
    expect(r.instruments).toHaveLength(2);
    expect(r.suggestedCaseType).toBe('KAMBIYO');
    expect(r.parties.some((p) => p.name === 'Borçlu X' && p.role === 'BORCLU')).toBe(true);
  });
});

describe('PR-2b-3 scanDebtDocumentMultiInstrument — e2e (mock segment + mock AI + gerçek grouping)', () => {
  it('flag açık + 4 page candidate → 2 instrument; debtInfo primary (docNo A)', async () => {
    const svc = buildSvc('true');
    const pages = [
      { pageIndex: 1, kind: 'TEXT', text: 'FACE-A', hasText: true, needsImageExtraction: false, source: 'pdf-parse' },
      { pageIndex: 2, kind: 'TEXT', text: 'BACK', hasText: true, needsImageExtraction: false, source: 'pdf-parse' },
      { pageIndex: 3, kind: 'TEXT', text: 'FACE-B', hasText: true, needsImageExtraction: false, source: 'pdf-parse' },
      { pageIndex: 4, kind: 'TEXT', text: 'BACK2', hasText: true, needsImageExtraction: false, source: 'pdf-parse' },
    ];
    const mockSegment = async () => ({ pages, totalPages: 4, truncated: false, droppedPages: 0, needsReview: false }) as any;
    const aiInputs: any[] = [];
    const mockAi = async (input: any) => {
      aiInputs.push(input);
      if (input.text === 'FACE-A') return { documentType: 'CEK', documentNo: 'A', amount: 100, currency: 'TRY', dueDate: '2025-01-01', face: true, confidence: 90 };
      if (input.text === 'FACE-B') return { documentType: 'CEK', documentNo: 'B', amount: 200, currency: 'TRY', dueDate: '2025-02-01', face: true, confidence: 90 };
      return { back: true, endorsementMarkers: true, confidence: 50 };
    };
    const r = await (svc as any).scanDebtDocumentMultiInstrument(Buffer.from('x'), 'application/pdf', undefined, {
      segment: mockSegment,
      aiExtract: mockAi,
    });
    expect(r).not.toBeNull();
    expect(r.instruments).toHaveLength(2); // 4 sayfa → 2 fiziksel çek
    expect(r.debtInfo.documentNo).toBe('A'); // primary = ilk güvenilir instrument
    expect(r.debtInfo.amount).toBe(100);
    // KIRMIZI ÇİZGİ: her AI çağrısı TEK sayfa içeriği (sayfalar-arası taşıma yok)
    expect(aiInputs.map((i) => i.text)).toEqual(['FACE-A', 'BACK', 'FACE-B', 'BACK2']);
  });

  it('hiç instrument çıkmazsa null (caller fallback eder)', async () => {
    const svc = buildSvc('true');
    const mockSegment = async () => ({ pages: [], totalPages: 0, truncated: false, droppedPages: 0, needsReview: false }) as any;
    const r = await (svc as any).scanDebtDocumentMultiInstrument(Buffer.from('x'), 'application/pdf', undefined, {
      segment: mockSegment,
      aiExtract: async () => ({}),
    });
    expect(r).toBeNull();
  });
});

describe('PR-2b-3 scanDebtDocument — flag + fallback wiring', () => {
  it('flag KAPALI → multi pipeline ÇAĞRILMAZ, legacy çağrılır', async () => {
    const svc = buildSvc('false');
    const multiSpy = jest.spyOn(svc as any, 'scanDebtDocumentMultiInstrument');
    const legacySpy = jest
      .spyOn(svc as any, 'scanDebtDocumentLegacy')
      .mockResolvedValue({ documentType: 'DIGER' } as any);
    await svc.scanDebtDocument(Buffer.from('x'), 'application/pdf');
    expect(multiSpy).not.toHaveBeenCalled();
    expect(legacySpy).toHaveBeenCalledTimes(1);
  });

  it('flag AÇIK + multi başarılı (instruments dolu) → multi döner, legacy çağrılmaz', async () => {
    const svc = buildSvc('true');
    const multiResult = { documentType: 'CEK', instruments: [inst({})] } as any;
    jest.spyOn(svc as any, 'scanDebtDocumentMultiInstrument').mockResolvedValue(multiResult);
    const legacySpy = jest.spyOn(svc as any, 'scanDebtDocumentLegacy').mockResolvedValue({} as any);
    const r = await svc.scanDebtDocument(Buffer.from('x'), 'application/pdf');
    expect(r).toBe(multiResult);
    expect(legacySpy).not.toHaveBeenCalled();
  });

  it('flag AÇIK + multi THROW → eski akış (legacy) döner', async () => {
    const svc = buildSvc('true');
    jest.spyOn(svc as any, 'scanDebtDocumentMultiInstrument').mockRejectedValue(new Error('pipeline patladı'));
    const sentinel = { documentType: 'DIGER' } as any;
    const legacySpy = jest.spyOn(svc as any, 'scanDebtDocumentLegacy').mockResolvedValue(sentinel);
    const r = await svc.scanDebtDocument(Buffer.from('x'), 'application/pdf');
    expect(r).toBe(sentinel);
    expect(legacySpy).toHaveBeenCalledTimes(1);
  });

  it('flag AÇIK + multi BOŞ (null) → eski akış (legacy) döner', async () => {
    const svc = buildSvc('true');
    jest.spyOn(svc as any, 'scanDebtDocumentMultiInstrument').mockResolvedValue(null);
    const sentinel = { documentType: 'DIGER' } as any;
    const legacySpy = jest.spyOn(svc as any, 'scanDebtDocumentLegacy').mockResolvedValue(sentinel);
    const r = await svc.scanDebtDocument(Buffer.from('x'), 'application/pdf');
    expect(r).toBe(sentinel);
    expect(legacySpy).toHaveBeenCalledTimes(1);
  });

  it('flag AÇIK + multi boş-instruments [] → eski akış (legacy) döner', async () => {
    const svc = buildSvc('true');
    jest.spyOn(svc as any, 'scanDebtDocumentMultiInstrument').mockResolvedValue({ documentType: 'CEK', instruments: [] } as any);
    const sentinel = { documentType: 'DIGER' } as any;
    const legacySpy = jest.spyOn(svc as any, 'scanDebtDocumentLegacy').mockResolvedValue(sentinel);
    const r = await svc.scanDebtDocument(Buffer.from('x'), 'application/pdf');
    expect(r).toBe(sentinel);
    expect(legacySpy).toHaveBeenCalledTimes(1);
  });
});

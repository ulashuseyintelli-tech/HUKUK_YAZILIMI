/**
 * PR-2a-2 — Belge segmentasyonu testleri (mock; pdf-parse/poppler GERÇEK çağrı YOK).
 *
 * Hedef: "PDF → kaç sayfa, her sayfada metin mi görüntü mü, kaynağı ne?" — AI yok.
 * pageIndex 1-BASED. MAX_PAGES sessiz kırpmaz (truncated/droppedPages/needsReview döner).
 */

import {
  segmentDocumentIntoPages,
  StubPdfPageRenderer,
  PdfPageRenderer,
  DEFAULT_MAX_PAGES,
} from '../pdf-segmentation';

const buf = Buffer.from('dummy');
// Mock per-page metin çıkarıcı: verilen string dizisini per-page döndürür
const mockTexts = (texts: string[]) => async () => texts;

describe('PR-2a-2 segmentDocumentIntoPages — text PDF', () => {
  it('8 sayfalık text PDF mock → 8 Page (TEXT), pageIndex 1..8 (1-based)', async () => {
    const texts = Array.from({ length: 8 }, (_, i) => `Sayfa ${i + 1} dolu metin içeriği burada`);
    const res = await segmentDocumentIntoPages(
      { buffer: buf, mimeType: 'application/pdf' },
      { extractPdfPageTexts: mockTexts(texts) },
    );
    expect(res.pages).toHaveLength(8);
    expect(res.totalPages).toBe(8);
    expect(res.pages.map(p => p.pageIndex)).toEqual([1, 2, 3, 4, 5, 6, 7, 8]); // 1-BASED
    expect(res.pages.every(p => p.kind === 'TEXT' && p.hasText && !p.needsImageExtraction)).toBe(true);
    expect(res.pages[0].source).toBe('pdf-parse');
    expect(res.truncated).toBe(false);
  });

  it('pageIndex 1-based başlar (0 değil)', async () => {
    const res = await segmentDocumentIntoPages(
      { buffer: buf, mimeType: 'application/pdf' },
      { extractPdfPageTexts: mockTexts(['yeterince uzun metin içeriği']) },
    );
    expect(res.pages[0].pageIndex).toBe(1);
  });

  it('boş/çok-az metinli sayfa → IMAGE + needsImageExtraction', async () => {
    const res = await segmentDocumentIntoPages(
      { buffer: buf, mimeType: 'application/pdf' },
      { extractPdfPageTexts: mockTexts(['dolu metin içeriği burada', '   ', 'yine dolu metin var']) },
    );
    expect(res.pages).toHaveLength(3);
    expect(res.pages[1].kind).toBe('IMAGE');
    expect(res.pages[1].needsImageExtraction).toBe(true);
    expect(res.pages[1].hasText).toBe(false);
    expect(res.pages[0].kind).toBe('TEXT');
    expect(res.pages[2].kind).toBe('TEXT');
  });

  it('tamamen taranmış PDF (tüm sayfalar boş metin) → hepsi IMAGE', async () => {
    const res = await segmentDocumentIntoPages(
      { buffer: buf, mimeType: 'application/pdf' },
      { extractPdfPageTexts: mockTexts(['', '', '']) },
    );
    expect(res.pages.every(p => p.kind === 'IMAGE' && p.needsImageExtraction)).toBe(true);
  });

  it('boş PDF (0 sayfa) → 0 Page, totalPages 0', async () => {
    const res = await segmentDocumentIntoPages(
      { buffer: buf, mimeType: 'application/pdf' },
      { extractPdfPageTexts: mockTexts([]) },
    );
    expect(res.pages).toHaveLength(0);
    expect(res.totalPages).toBe(0);
  });
});

describe('PR-2a-2 — tek görüntü girdisi', () => {
  it('tek jpg → 1 IMAGE Page (pageIndex 1, needsImageExtraction)', async () => {
    const res = await segmentDocumentIntoPages({ buffer: buf, mimeType: 'image/jpeg', filename: 'cek.jpg' });
    expect(res.pages).toHaveLength(1);
    expect(res.pages[0]).toMatchObject({ pageIndex: 1, kind: 'IMAGE', needsImageExtraction: true, source: 'image' });
  });

  it('tek png → 1 IMAGE Page', async () => {
    const res = await segmentDocumentIntoPages({ buffer: buf, mimeType: 'image/png' });
    expect(res.pages).toHaveLength(1);
    expect(res.pages[0].kind).toBe('IMAGE');
  });

  it('uzantı ile (.tiff) görüntü tespiti', async () => {
    const res = await segmentDocumentIntoPages({ buffer: buf, mimeType: 'application/octet-stream', filename: 'tarama.tiff' });
    expect(res.pages[0].kind).toBe('IMAGE');
  });
});

describe('PR-2a-2 — MAX_PAGES cap (sessiz kırpma YOK)', () => {
  it('cap aşılınca: ilk N işlenir + truncated/droppedPages/needsReview döner', async () => {
    const texts = Array.from({ length: 60 }, (_, i) => `Sayfa ${i + 1} dolu metin içeriği`);
    const res = await segmentDocumentIntoPages(
      { buffer: buf, mimeType: 'application/pdf' },
      { extractPdfPageTexts: mockTexts(texts), maxPages: 50 },
    );
    expect(res.pages).toHaveLength(50);
    expect(res.totalPages).toBe(60); // cap'ten ÖNCEki gerçek sayı korunur
    expect(res.truncated).toBe(true);
    expect(res.droppedPages).toBe(10);
    expect(res.needsReview).toBe(true);
  });

  it('cap altında → truncated false, droppedPages 0', async () => {
    const res = await segmentDocumentIntoPages(
      { buffer: buf, mimeType: 'application/pdf' },
      { extractPdfPageTexts: mockTexts(['dolu metin içeriği burada']), maxPages: 50 },
    );
    expect(res.truncated).toBe(false);
    expect(res.droppedPages).toBe(0);
    expect(res.needsReview).toBe(false);
  });

  it('DEFAULT_MAX_PAGES tanımlı ve makul', () => {
    expect(DEFAULT_MAX_PAGES).toBeGreaterThanOrEqual(20);
  });
});

describe('PR-2a-2 — render adapter (poppler stub)', () => {
  it('stub renderer → taranmış sayfada imageRef üretilmez (needsImageExtraction kalır)', async () => {
    const res = await segmentDocumentIntoPages(
      { buffer: buf, mimeType: 'application/pdf' },
      { extractPdfPageTexts: mockTexts(['']), renderer: new StubPdfPageRenderer() },
    );
    expect(res.pages[0].kind).toBe('IMAGE');
    expect(res.pages[0].imageRef).toBeUndefined();
    expect(res.pages[0].needsImageExtraction).toBe(true);
  });

  it('gerçek renderer enjekte edilirse imageRef set edilir (adapter çalışır)', async () => {
    const fakeRenderer: PdfPageRenderer = { renderPage: async (_b, i) => `page-${i}.png` };
    const res = await segmentDocumentIntoPages(
      { buffer: buf, mimeType: 'application/pdf' },
      { extractPdfPageTexts: mockTexts(['']), renderer: fakeRenderer },
    );
    expect(res.pages[0].imageRef).toBe('page-1.png');
  });
});

describe('PR-2a-2 — diğer formatlar (kapsam dışı: tek mantıksal sayfa)', () => {
  it('docx → 1 TEXT Page, source docx', async () => {
    const res = await segmentDocumentIntoPages({ buffer: buf, mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', filename: 'belge.docx' });
    expect(res.pages).toHaveLength(1);
    expect(res.pages[0]).toMatchObject({ pageIndex: 1, kind: 'TEXT', source: 'docx' });
  });

  it('txt → 1 TEXT Page, source text', async () => {
    const res = await segmentDocumentIntoPages({ buffer: buf, mimeType: 'text/plain', filename: 'not.txt' });
    expect(res.pages[0].source).toBe('text');
  });
});

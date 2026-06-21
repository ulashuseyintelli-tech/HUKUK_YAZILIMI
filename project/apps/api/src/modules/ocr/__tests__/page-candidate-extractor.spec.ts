/**
 * PR-2b-2 — page-candidate-extractor testleri (mock AI; GERÇEK AI çağrısı YOK).
 *
 * Kırmızı çizgi testleri: AI yalnız TEK sayfa görür; gruplama/sayma yok; 1 Page → 1 PageCandidate.
 * Graceful: imageRef yok / AI throw → throw dışarı taşmaz, düşük-güven aday. pageIndex 1-based korunur.
 */

import {
  extractPageCandidate,
  extractAllPageCandidates,
  PageAiInput,
  PageAiExtractor,
  PAGE_EXTRACTION_PROMPT,
  parseAiJson,
  stripJsonFence,
} from '../page-candidate-extractor';
import { Page } from '../pdf-segmentation';

const textPage = (pageIndex: number, text: string): Page => ({
  pageIndex,
  kind: 'TEXT',
  text,
  hasText: true,
  needsImageExtraction: false,
  source: 'pdf-parse',
});
const imagePage = (pageIndex: number, imageRef?: string): Page => ({
  pageIndex,
  kind: 'IMAGE',
  hasText: false,
  needsImageExtraction: true,
  imageRef,
  source: 'image',
});

describe('PR-2b-2 extractPageCandidate — TEXT/IMAGE yolları', () => {
  it('TEXT sayfa → AI alanları PageCandidate’e map edilir, pageIndex taşınır', async () => {
    const mock: PageAiExtractor = async () => ({
      documentType: 'CEK',
      documentNo: '0265895',
      amount: 400000,
      currency: 'TRY',
      dueDate: '2025-12-01',
      face: true,
      evidenceText: 'Çek No: 0265895 Tutar: 400.000',
      confidence: 90,
    });
    const out = await extractPageCandidate(textPage(1, 'çek metni...'), { aiExtract: mock });
    expect(out).toMatchObject({
      pageIndex: 1,
      documentType: 'CEK',
      documentNo: '0265895',
      amount: 400000,
      dueDate: '2025-12-01',
      face: true,
      confidence: 90,
    });
    expect(out.evidenceText).toContain('0265895');
  });

  it('IMAGE + imageRef → Vision yolu (aiExtract kind=vision, imageRef ile çağrılır)', async () => {
    const inputs: PageAiInput[] = [];
    const mock: PageAiExtractor = async (i) => {
      inputs.push(i);
      return { documentType: 'SENET', amount: 100 };
    };
    const out = await extractPageCandidate(imagePage(2, 'page-2.png'), { aiExtract: mock });
    expect(inputs[0].kind).toBe('vision');
    expect(inputs[0].imageRef).toBe('page-2.png');
    expect(out.pageIndex).toBe(2);
    expect(out.documentType).toBe('SENET');
  });

  it('IMAGE ama imageRef YOK → AI çağrılmaz, graceful düşük-güven aday', async () => {
    let called = false;
    const mock: PageAiExtractor = async () => {
      called = true;
      return {};
    };
    const out = await extractPageCandidate(imagePage(3, undefined), { aiExtract: mock });
    expect(called).toBe(false);
    expect(out).toMatchObject({ pageIndex: 3, confidence: 0 });
  });

  it('drawerIdentityNo: RawPageFields → PageCandidate map edilir (PR-2 passthrough)', async () => {
    const mock: PageAiExtractor = async () => ({
      documentType: 'CEK',
      documentNo: '0265897',
      drawerName: 'GORKA A.Ş.',
      drawerIdentityNo: '1234567890',
      face: true,
      confidence: 90,
    });
    const out = await extractPageCandidate(textPage(1, 'çek...'), { aiExtract: mock });
    expect(out.drawerIdentityNo).toBe('1234567890');
    expect(out.drawerName).toBe('GORKA A.Ş.');
  });
});

describe('PR-2b-2 — graceful (throw dışarı taşmaz)', () => {
  it('AI throw → düşük-güven aday döner, throw atmaz', async () => {
    const mock: PageAiExtractor = async () => {
      throw new Error('OpenAI 500 / timeout');
    };
    let threw = false;
    let out: any = null;
    try {
      out = await extractPageCandidate(textPage(4, 'metin'), { aiExtract: mock });
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(out).toMatchObject({ pageIndex: 4, confidence: 0 });
  });
});

describe('PR-2b-2 — KIRMIZI ÇİZGİ: AI tek sayfa, gruplama/sayma yok', () => {
  it('AI girdisi YALNIZ o sayfanın içeriğidir (başka sayfa görünmez)', async () => {
    const inputs: PageAiInput[] = [];
    const mock: PageAiExtractor = async (i) => {
      inputs.push(i);
      return { amount: 1 };
    };
    await extractPageCandidate(textPage(1, 'SADECE-SAYFA-1-METNI'), { aiExtract: mock });
    expect(inputs).toHaveLength(1);
    expect(inputs[0].text).toBe('SADECE-SAYFA-1-METNI');
    expect(inputs[0].kind).toBe('text');
  });

  it('1 Page → 1 PageCandidate (çıktı tekil, dizi/sayım yok)', async () => {
    const mock: PageAiExtractor = async () => ({ amount: 1 });
    const out = await extractPageCandidate(textPage(1, 'x metin içeriği'), { aiExtract: mock });
    expect(Array.isArray(out)).toBe(false);
    expect(out.pageIndex).toBe(1);
  });

  it('pageIndex Page’ten gelir, AI’dan DEĞİL (AI farklı dese bile)', async () => {
    // AI çıktısında pageIndex yok zaten; map page.pageIndex kullanır
    const mock: PageAiExtractor = async () => ({ documentType: 'CEK' } as any);
    const out = await extractPageCandidate(textPage(7, 'metin içeriği burada'), { aiExtract: mock });
    expect(out.pageIndex).toBe(7); // 1-based, Page'ten
  });

  it('prompt = PAGE_EXTRACTION_PROMPT aiExtract’e iletilir', async () => {
    const inputs: PageAiInput[] = [];
    const mock: PageAiExtractor = async (i) => {
      inputs.push(i);
      return {};
    };
    await extractPageCandidate(textPage(1, 'metin içeriği'), { aiExtract: mock });
    expect(inputs[0].prompt).toBe(PAGE_EXTRACTION_PROMPT);
  });

  it('PROMPT kesin anti-grouping cümlesini içerir', () => {
    expect(PAGE_EXTRACTION_PROMPT).toContain(
      'Bu sayfanın başka bir belgenin önü/arkası olup olmadığına KARAR VERME',
    );
    expect(PAGE_EXTRACTION_PROMPT).toMatch(/KAÇ çek\/senet.*SÖYLEME/s);
  });
});

describe('PR-2b-2 — evidenceText (kısa kanıt)', () => {
  it('evidenceText taşınır ve KISALTILIR (tüm OCR değil)', async () => {
    const long = 'A'.repeat(1000);
    const mock: PageAiExtractor = async () => ({ evidenceText: long, amount: 1 });
    const out = await extractPageCandidate(textPage(1, 'metin içeriği'), { aiExtract: mock });
    expect(out.evidenceText!.length).toBeLessThanOrEqual(240);
  });
});

describe('PR-2b-2 — extractAllPageCandidates (her sayfa bağımsız)', () => {
  it('N Page → N PageCandidate; her AI girdisi TEK sayfa', async () => {
    const inputs: PageAiInput[] = [];
    const mock: PageAiExtractor = async (i) => {
      inputs.push(i);
      return { amount: 1 };
    };
    const pages = [textPage(1, 'SAYFA-1'), textPage(2, 'SAYFA-2'), textPage(3, 'SAYFA-3')];
    const out = await extractAllPageCandidates(pages, { aiExtract: mock });
    expect(out).toHaveLength(3);
    expect(out.map(c => c.pageIndex)).toEqual([1, 2, 3]);
    // her çağrı tek sayfa içeriği (sayfalar-arası taşıma yok)
    expect(inputs.map(i => i.text)).toEqual(['SAYFA-1', 'SAYFA-2', 'SAYFA-3']);
  });
});

describe('fence-fix — parseAiJson / stripJsonFence (markdown-fence robustluğu)', () => {
  it('```json ... ``` fence → soyulur + parse edilir (V2 kök neden)', () => {
    expect(parseAiJson('```json\n{ "documentType": "CEK", "amount": 1000 }\n```')).toEqual({
      documentType: 'CEK',
      amount: 1000,
    });
  });

  it('``` ... ``` (json etiketi YOK) fence → soyulur + parse edilir', () => {
    expect(parseAiJson('```\n{ "amount": 5 }\n```')).toEqual({ amount: 5 });
  });

  it('düz JSON (fence YOK) → aynen parse edilir (regresyon yok)', () => {
    expect(parseAiJson('{ "documentNo": "0265898", "amount": 2000 }')).toEqual({
      documentNo: '0265898',
      amount: 2000,
    });
  });

  it('baş/son boşluk + satırbaşı sarmalı fence → tolere edilir', () => {
    expect(parseAiJson('   \n```json {"a":1} ```  \n ')).toEqual({ a: 1 });
  });

  it('stripJsonFence: fence yoksa metni AYNEN döner', () => {
    expect(stripJsonFence('{"x":1}')).toBe('{"x":1}');
  });
});

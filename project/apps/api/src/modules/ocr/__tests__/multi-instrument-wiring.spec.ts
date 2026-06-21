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

describe('BUG buildDebtResultFromInstruments — party.type drawerName sezgisinden (şirket → COMPANY)', () => {
  it('şirket unvanı drawerName → party.type COMPANY (Gorka senaryosu)', () => {
    const insts = [
      inst({ documentNo: 'A', drawerName: 'GORKA KOZMETİK SANAYİ VE TİCARET ANONİM ŞİRKETİ', needsReview: false, sourcePages: [1] }),
    ];
    const r = buildDebtResultFromInstruments(insts)!;
    const p = r.parties.find((x) => x.name.includes('GORKA'))!;
    expect(p.type).toBe('COMPANY');
  });

  it('şahıs adı drawerName → party.type INDIVIDUAL (regresyon yok)', () => {
    const insts = [
      inst({ documentNo: 'A', drawerName: 'AHMET YILMAZ', needsReview: false, sourcePages: [1] }),
    ];
    const r = buildDebtResultFromInstruments(insts)!;
    const p = r.parties.find((x) => x.name === 'AHMET YILMAZ')!;
    expect(p.type).toBe('INDIVIDUAL');
  });

  it('debtorCandidates karışık (şirket + şahıs) → her biri kendi tipine', () => {
    const insts = [
      inst({ documentNo: 'A', debtorCandidates: ['ABC İNŞAAT LTD. ŞTİ.', 'MEHMET KAYA'], needsReview: false, sourcePages: [1] }),
    ];
    const r = buildDebtResultFromInstruments(insts)!;
    expect(r.parties.find((x) => x.name.includes('ABC'))!.type).toBe('COMPANY');
    expect(r.parties.find((x) => x.name === 'MEHMET KAYA')!.type).toBe('INDIVIDUAL');
  });
});

describe('PR-2 buildDebtResultFromInstruments — party.identityNo (drawerIdentityNo passthrough + sanitize)', () => {
  const partyOf = (insts: Instrument[], match: string) =>
    buildDebtResultFromInstruments(insts)!.parties.find((x) => x.name.includes(match))!;

  it('geçerli VKN → party.type COMPANY + identityNo dolu', () => {
    const p = partyOf([inst({ drawerName: 'GORKA A.Ş.', drawerIdentityNo: '1234567890', needsReview: false, sourcePages: [1] })], 'GORKA');
    expect(p.type).toBe('COMPANY');
    expect(p.identityNo).toBe('1234567890');
  });

  it('geçerli TCKN → INDIVIDUAL + identityNo dolu (şahıs isim)', () => {
    const p = partyOf([inst({ drawerName: 'AHMET YILMAZ', drawerIdentityNo: '10000000146', needsReview: false, sourcePages: [1] })], 'AHMET');
    expect(p.type).toBe('INDIVIDUAL');
    expect(p.identityNo).toBe('10000000146');
  });

  it('çöp/geçersiz kimlik no → identityNo DÜŞER (sanitize checksum), tip isimden', () => {
    const p = partyOf([inst({ drawerName: 'GORKA A.Ş.', drawerIdentityNo: '0000', needsReview: false, sourcePages: [1] })], 'GORKA');
    expect(p.type).toBe('COMPANY'); // unvan eki
    expect(p.identityNo).toBeUndefined(); // checksum tutmaz → yayılmaz
  });

  it('kimlik no boşluk/nokta içerir → temiz rakam yayılır (sanitize)', () => {
    const p = partyOf([inst({ drawerName: 'GORKA A.Ş.', drawerIdentityNo: '123 456 78 90', needsReview: false, sourcePages: [1] })], 'GORKA');
    expect(p.identityNo).toBe('1234567890');
  });

  it('kimlik no yok → identityNo alanı yok (PR-1 davranışı korunur)', () => {
    const p = partyOf([inst({ drawerName: 'GORKA A.Ş.', needsReview: false, sourcePages: [1] })], 'GORKA');
    expect(p.type).toBe('COMPANY');
    expect(p.identityNo).toBeUndefined();
  });

  it('debtorCandidates kimlik no TAŞIMAZ → yalnız drawer kimliği yayılır', () => {
    const r = buildDebtResultFromInstruments([
      inst({ drawerName: 'GORKA A.Ş.', drawerIdentityNo: '1234567890', debtorCandidates: ['MEHMET KAYA'], needsReview: false, sourcePages: [1] }),
    ])!;
    expect(r.parties.find((x) => x.name.includes('GORKA'))!.identityNo).toBe('1234567890');
    expect(r.parties.find((x) => x.name === 'MEHMET KAYA')!.identityNo).toBeUndefined();
  });
});

describe('G1 FATURA buildDebtResultFromInstruments — alacaklı (ALACAKLI) party + KDV', () => {
  it('creditorName + geçerli VKN → ALACAKLI party COMPANY + identityNo (+ borçlu/alıcı ayrı)', () => {
    const r = buildDebtResultFromInstruments([
      inst({ type: 'FATURA', documentNo: 'F-1', amount: 1200, creditorName: 'SATICI GIDA A.Ş.', creditorIdentityNo: '1234567890', drawerName: 'ALICI LTD. ŞTİ.', drawerIdentityNo: '1111111114', needsReview: false, sourcePages: [1] }),
    ])!;
    const alacakli = r.parties.find((p) => p.role === 'ALACAKLI')!;
    expect(alacakli.name).toBe('SATICI GIDA A.Ş.');
    expect(alacakli.type).toBe('COMPANY');
    expect(alacakli.identityNo).toBe('1234567890');
    expect(r.parties.find((p) => p.role === 'BORCLU' && p.name.includes('ALICI'))).toBeTruthy();
  });

  it('KDV oran/tutar debtInfo\'ya taşınır', () => {
    const r = buildDebtResultFromInstruments([
      inst({ type: 'FATURA', documentNo: 'F-1', amount: 1200, kdvRate: 20, kdvAmount: 200, needsReview: false, sourcePages: [1] }),
    ])!;
    expect(r.debtInfo.kdvRate).toBe(20);
    expect(r.debtInfo.kdvAmount).toBe(200);
  });

  it('kambiyo (creditorName yok) → ALACAKLI party YOK + KDV yok (regresyon yok)', () => {
    const r = buildDebtResultFromInstruments([
      inst({ type: 'CEK', documentNo: '0265897', drawerName: 'GORKA A.Ş.', drawerIdentityNo: '1234567890', needsReview: false, sourcePages: [1] }),
    ])!;
    expect(r.parties.every((p) => p.role === 'BORCLU')).toBe(true);
    expect(r.parties.some((p) => p.role === 'ALACAKLI')).toBe(false);
    expect(r.debtInfo.kdvRate).toBeUndefined();
  });

  it('çöp creditor VKN → identityNo düşer (sanitize), tip isimden', () => {
    const r = buildDebtResultFromInstruments([
      inst({ type: 'FATURA', documentNo: 'F-1', creditorName: 'SATICI A.Ş.', creditorIdentityNo: '0000', needsReview: false, sourcePages: [1] }),
    ])!;
    const a = r.parties.find((p) => p.role === 'ALACAKLI')!;
    expect(a.type).toBe('COMPANY'); // unvan eki
    expect(a.identityNo).toBeUndefined();
  });
});

describe('BUG buildDebtResultFromInstruments — taraf dedup (kimlik-bilinçli; aynı VKN/TCKN tek taraf)', () => {
  // Gorka senaryosu (canlı UI'da görüldü): aynı tüzel kişi 2 çekte farklı OCR yazımıyla okundu,
  // AYNI geçerli VKN (3961146289) taşıdı → eskiden EXACT-isim dedup'ı 2 ayrı taraf üretiyordu.
  it('(a) aynı geçerli VKN + farklı büyük/küçük drawerName → TEK COMPANY taraf (VKN dolu)', () => {
    const r = buildDebtResultFromInstruments([
      inst({ documentNo: 'A', drawerName: 'GORKA KOZMETİK SANAYİ VE TİCARET ANONİM ŞİRKETİ', drawerIdentityNo: '3961146289', needsReview: false, sourcePages: [1] }),
      inst({ documentNo: 'B', drawerName: 'Gorka Kozmetik Sanayi ve Ticaret Anonim Şirketi', drawerIdentityNo: '3961146289', needsReview: false, sourcePages: [3] }),
    ])!;
    expect(r.parties).toHaveLength(1); // İKİ değil — aynı VKN → tek tüzel kişi
    expect(r.parties[0].type).toBe('COMPANY');
    expect(r.parties[0].identityNo).toBe('3961146289');
    expect(r.parties[0].name).toBe('GORKA KOZMETİK SANAYİ VE TİCARET ANONİM ŞİRKETİ'); // ilk görülen kanonik
  });

  it('(a2) aynı geçerli VKN + KATLAMASI farklı isimler (kısaltma) → yine TEK taraf (kimlik birleştirir, isim değil)', () => {
    const r = buildDebtResultFromInstruments([
      inst({ documentNo: 'A', drawerName: 'GORKA KOZMETİK SAN. VE TİC. A.Ş.', drawerIdentityNo: '3961146289', needsReview: false, sourcePages: [1] }),
      inst({ documentNo: 'B', drawerName: 'GORKA KOZMETİK SANAYİ VE TİCARET ANONİM ŞİRKETİ', drawerIdentityNo: '3961146289', needsReview: false, sourcePages: [3] }),
    ])!;
    // İsimler katlandığında bile EŞİT DEĞİL → yalnız kimlik no birleştirebilir (identity path izole kanıt).
    expect(r.parties.filter((p) => p.identityNo === '3961146289')).toHaveLength(1);
    expect(r.parties).toHaveLength(1);
  });

  it('(b) FARKLI geçerli VKN → iki ayrı taraf (over-merge yok)', () => {
    const r = buildDebtResultFromInstruments([
      inst({ documentNo: 'A', drawerName: 'ALFA A.Ş.', drawerIdentityNo: '1234567890', needsReview: false, sourcePages: [1] }),
      inst({ documentNo: 'B', drawerName: 'BETA A.Ş.', drawerIdentityNo: '1111111114', needsReview: false, sourcePages: [3] }),
    ])!;
    expect(r.parties).toHaveLength(2);
    expect(r.parties.map((p) => p.identityNo).sort()).toEqual(['1111111114', '1234567890']);
  });

  it('(c) kimlik no YOK + AYNEN aynı isim → tek taraf (regresyon yok)', () => {
    const r = buildDebtResultFromInstruments([
      inst({ documentNo: 'A', drawerName: 'AHMET YILMAZ', needsReview: false, sourcePages: [1] }),
      inst({ documentNo: 'B', drawerName: 'AHMET YILMAZ', needsReview: false, sourcePages: [3] }),
    ])!;
    expect(r.parties.filter((p) => p.name === 'AHMET YILMAZ')).toHaveLength(1);
  });

  it('(d) kimlik no YOK + farklı isimler → iki taraf (bugünkü davranış korunur)', () => {
    const r = buildDebtResultFromInstruments([
      inst({ documentNo: 'A', drawerName: 'AHMET YILMAZ', needsReview: false, sourcePages: [1] }),
      inst({ documentNo: 'B', drawerName: 'MEHMET KAYA', needsReview: false, sourcePages: [3] }),
    ])!;
    expect(r.parties).toHaveLength(2);
  });

  it('(e) kimlik no YOK + aynı isim farklı OCR yazımı (büyük/küçük+diyakritik) → tek taraf (isim katlama)', () => {
    const r = buildDebtResultFromInstruments([
      inst({ documentNo: 'A', drawerName: 'GORKA KOZMETİK ANONİM ŞİRKETİ', needsReview: false, sourcePages: [1] }),
      inst({ documentNo: 'B', drawerName: 'Gorka Kozmetik Anonim Şirketi', needsReview: false, sourcePages: [3] }),
    ])!;
    expect(r.parties).toHaveLength(1); // katlanmış isim eşit → tek taraf (kimlik no yokken bile)
    expect(r.parties[0].type).toBe('COMPANY'); // unvan eki
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

describe('PR-1 buildPageAiExtract — fence-safe parse (response_format + parseAiJson)', () => {
  const makeSvc = (content: string) => {
    const svc = buildSvc();
    const create = jest.fn(async () => ({ choices: [{ message: { content } }] }));
    (svc as any).openai = { chat: { completions: { create } } }; // openai SET edildikten SONRA buildPageAiExtract çağrılır
    return { svc, create };
  };

  it('```json markdown-fence yanıtı parse eder (eski ham JSON.parse PATLARDI → parseAiJson)', async () => {
    const { svc } = makeSvc('```json\n{"documentType":"CEK","documentNo":"X"}\n```');
    const extract = (svc as any).buildPageAiExtract();
    const r = await extract({ kind: 'text', text: 'FACE', prompt: 'JSON döndür' });
    expect(r).toEqual({ documentType: 'CEK', documentNo: 'X' });
  });

  it('fence-siz düz JSON da parse eder (regresyon)', async () => {
    const { svc } = makeSvc('{"documentType":"SENET"}');
    const extract = (svc as any).buildPageAiExtract();
    const r = await extract({ kind: 'text', text: 'FACE', prompt: 'JSON döndür' });
    expect(r).toEqual({ documentType: 'SENET' });
  });

  it('OpenAI çağrısı response_format:{type:"json_object"} ile yapılır', async () => {
    const { svc, create } = makeSvc('{"documentType":"CEK"}');
    const extract = (svc as any).buildPageAiExtract();
    await extract({ kind: 'text', text: 'FACE', prompt: 'JSON döndür' });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ response_format: { type: 'json_object' } }));
  });
});

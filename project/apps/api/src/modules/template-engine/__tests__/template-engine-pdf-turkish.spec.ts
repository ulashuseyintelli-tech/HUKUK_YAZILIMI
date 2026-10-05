/**
 * Belge PDF'leri — Türkçe harfler (ı İ ş Ş ğ Ğ), tutarlar ve uzun belge (saf; DB / ağ yok).
 *
 * Kusur (2026-10-02 ölçümü): TemplateEngineService PDF üreticileri pdfmake'e yalnız standart `Courier` veriyordu; pdfkit'in
 * standart yazı tipi kodlayıcısı WinAnsi dışı karakteri bayta sığmayan jetonla (ı → "131") yazdığı için hex dizesi yarım
 * bayt kayıyor, o metin parçasının geri kalanı da bozuluyordu ("TAKİP TALEBİ" → "TAK  TALEB"). 500 YOK: PDF geçerli ama
 * metni yanlış. Owner kararı (2026-10-04, karar 2): mevcut gömülü Roboto; hukuki metin ve hesap DEĞİŞMEZ.
 *
 * Bu testler PDF'in İÇİNDEKİ metni okur (pdf-text-extract.ts) ve pdfmake'e VERİLEN belge tanımındaki metinle eşitler: kaynak
 * metin ↔ PDF metni boşluksuz birebir aynı olmalı. Düzeltmesiz servis koduyla bu dosyadaki üç yol testi düşer
 * (standart yazı tipi + bozuk metin); "çıkarıcı kör değil" testi eski yolu doğrudan üretip bozuk okuduğunu gösterir.
 *
 * Kapsam dışı (ölçüm kaydında): sayfa görüntüsü, sütun taşması, geometri — bunlar PDF'i resme çevirip gözle / PyMuPDF ile ölçülür.
 */
import { createHash } from 'crypto';
import { TemplateEngineService, type TemplateData } from '../template-engine.service';
import { getTemplatePdfFonts, resetTemplatePdfFontsCacheForTest, TEMPLATE_PDF_FONT } from '../template-pdf-fonts';
import { collectDefinitionText, extractPdfText, stripWhitespace } from './pdf-text-extract';

// eslint-disable-next-line @typescript-eslint/no-var-requires
const pdfmakeModule = require('pdfmake');
const PdfPrinter = pdfmakeModule.default || pdfmakeModule;

function claimItem(i: number, amount: number, description = 'Asıl Alacak') {
  return { type: 'PRINCIPAL', description, amount, currency: 'TRY', dueDate: '2026-06-01', interestType: 'YASAL' };
}

function baseData(overrides: Partial<TemplateData> = {}): TemplateData {
  const claimItems = [claimItem(0, 17000), { ...claimItem(1, 1250.5, 'Işleyen faiz ve ödeme şekli'), type: 'INTEREST' }];
  return {
    fileNumber: 'PDF-OLCUM/1',
    filingDate: '2026-10-02',
    executionOffice: { name: 'Anadolu İcra Dairesi', city: 'İstanbul' },
    creditors: [{
      type: 'COMPANY', name: 'ÖRNEK GIDA SANAYİ VE TİCARET A.Ş.', taxNo: '1234567890', taxOffice: 'Çankaya',
      address: 'Şişli Mah. Işık Sok. No:5', district: 'Şişli', city: 'İstanbul',
    }],
    lawyers: [{
      name: 'Av. Güneş Çağlayan Şimşek', barNumber: '12345', barCity: 'İstanbul', address: 'Bağdat Cad. Işıklar Apt. K:3 Kadıköy / İstanbul',
      phone: '0216 000 00 00', fax: '0216 000 00 01', bankName: 'Örnek Bankası', branchName: 'Kızıltoprak', iban: 'TR000000000000000000000000',
    }],
    debtors: [{
      type: 'INDIVIDUAL', name: 'Ömer Çınar Yağız', identityNo: '10000000146', role: 'ASIL_BORCLU',
      address: 'Gökçeler Mah. Yıldız Sok. No:7/3', district: 'Çankaya', city: 'Ankara',
    }],
    claimItems,
    totals: { principal: 17000, interest: 1250.5, fees: 0, total: 18250.5, currency: 'TRY' },
    interestInfo: { type: 'TICARI', rate: 24, description: 'Ticari faiz', variableRate: true },
    caseType: 'GENEL_ICRA',
    subCategory: 'ILAMSIZ',
    executionPath: 'HACIZ',
    ...overrides,
  } as TemplateData;
}

/** İlamlı dosya: icra emri şablonundaki `DAYANAK ILAM` bloğu dolu. */
function ilamliData(): TemplateData {
  return baseData({
    caseType: 'ILAMLI',
    subCategory: 'ILAMLI',
    courtInfo: { name: 'Bakırköy 3. Asliye Hukuk Mahkemesi', caseNumber: '2025/123', decisionNumber: '2026/45', decisionDate: '2026-03-15', summary: 'Alacağın tahsili' },
  });
}

/** Uzun belge: çok kalem, çok borçlu, uzun ad / adres ve boşluksuz uzun dizgi. */
function longData(): TemplateData {
  const n = 45;
  const claimItems = Array.from({ length: n }, (_, i) => claimItem(i, 1000 + i * 37.5, `Kalem ${i + 1} — Işık Çağlayan şirketi alacağı ve ödeme şekli`));
  const total = claimItems.reduce((s, c) => s + c.amount, 0);
  const uzunSoyad = 'ÇağlayanŞahinoğlu'.repeat(8);
  return baseData({
    claimItems,
    totals: { principal: total, interest: 0, fees: 0, total, currency: 'TRY' },
    debtors: Array.from({ length: 4 }, (_, i) => ({
      type: 'INDIVIDUAL' as const,
      name: `Borçlu ${i + 1} Işıl Öztürk ${uzunSoyad}`,
      identityNo: `1000000014${i}`,
      role: 'ASIL_BORCLU',
      address: `Gökçeler Mahallesi Yıldız Sokak Işık Apartmanı Kat:${i + 1} Daire:${i + 7} Çankaya Ankara — ${'çok uzun adres satırı '.repeat(6)}`,
      district: 'Çankaya',
      city: 'Ankara',
    })),
  });
}

function buildService(data: TemplateData, prisma: Record<string, unknown> = {}) {
  const audit: any = { logAction: jest.fn(), log: jest.fn() };
  const service = new TemplateEngineService(prisma as any, { getInterestRate: jest.fn().mockReturnValue(24) } as any, audit);
  jest.spyOn((service as any).logger, 'log').mockImplementation(() => undefined);
  jest.spyOn(service as any, 'getCaseData').mockResolvedValue(data);
  return service;
}

/** pdfmake'e VERİLEN belge tanımını yakalar (karşılaştırmanın kaynak tarafı) ve çağrıyı geçirir. */
let lastDefinition: any;
beforeEach(() => {
  lastDefinition = undefined;
  const original = PdfPrinter.prototype.createPdfKitDocument;
  jest.spyOn(PdfPrinter.prototype, 'createPdfKitDocument').mockImplementation(function (this: unknown, def: any, ...rest: any[]) {
    lastDefinition = def;
    return original.call(this, def, ...rest);
  });
});
afterEach(() => jest.restoreAllMocks());

const sourceText = (): string => stripWhitespace(collectDefinitionText(lastDefinition.content).join(''));

type PathCase = [string, (s: TemplateEngineService) => Promise<Buffer>, TemplateData, string[]];
const PATHS: PathCase[] = [
  ['POST /template-engine/takip-talebi/pdf (taslak; istemci verisi)', (s) => s.generateTakipTalebiPdf(baseData({ isDraft: true })), baseData({ isDraft: true }), ['TAKİP TALEBİ', 'gönderime hazır değil', 'Alacaklının']],
  ['GET /template-engine/case/:id/pdf?type=takip-talebi', (s) => s.generatePdfFromCase('case-1', 'takip-talebi', 't1'), baseData(), ['TAKİP TALEBİ', 'yazdığım', 'seçtiği']],
  ['GET /template-engine/case/:id/pdf?type=odeme-emri', (s) => s.generatePdfFromCase('case-1', 'odeme-emri', 't1'), baseData(), ['Çağlayan', 'Şimşek', 'Işleyen faiz ve ödeme şekli']],
  ['GET /template-engine/case/:id/pdf?type=icra-emri (ilamlı)', (s) => s.generatePdfFromCase('case-1', 'icra-emri', 't1'), ilamliData(), ['Çağlayan', 'Bakırköy 3. Asliye Hukuk Mahkemesi']],
];

describe('belge PDF — gömülü Roboto: Türkçe harfler, tutarlar, kaynak metinle birebir eşitlik', () => {
  it.each(PATHS)('%s', async (_ad, run, data, beklenenKelimeler) => {
    const service = buildService(data);

    const pdf = await run(service);
    const out = extractPdfText(pdf);

    // yazı tipi: standart (WinAnsi) yazı tipi YOK; TrueType gömülü
    expect(out.fonts.length).toBeGreaterThan(0);
    expect(out.fonts.filter((f) => f.standard)).toEqual([]);
    expect(out.fonts.map((f) => f.baseFont).join(' ')).not.toMatch(/Courier|Helvetica|Times/u);
    expect(out.fonts.map((f) => f.baseFont).join(' ')).toMatch(/Roboto/u);
    expect(out.embeddedFontFiles).toBeGreaterThan(0);
    // metin: pdfmake'e verilen belge tanımındaki metin == PDF'ten çıkarılan metin (boşluksuz, akış sırasıyla)
    expect(out.text.length).toBeGreaterThan(200);
    expect(out.text).toBe(sourceText());
    // Türkçe harfli kelimeler PDF'te okunur
    for (const k of beklenenKelimeler) expect(out.text).toContain(stripWhitespace(k));
    // tutarlar (binlik nokta / ondalık virgül / para birimi) — belgenin kendi yazımıyla
    expect(out.text).toContain('17.000,00');
    expect(out.text).toContain('1.250,50');
    expect(out.text).toContain('18.250,50');
    expect(out.text).toContain('TL');
  });

  it('POST /template-engine/cases/:id/documents/PDF (merkezi üretim): aynı Roboto PDF; üretim kaydındaki contentHash = PDF sha256 değeri', async () => {
    const artifact = { findFirst: jest.fn(async () => null), create: jest.fn(async ({ data }: any) => ({ id: 'art-1', ...data })) };
    const service = buildService(baseData(), { documentArtifact: artifact });

    const result = await service.generateDocumentFromCase('case-1', 'PDF', 'takip-talebi', 'v1', 't1', 'user-1');
    const out = extractPdfText(result.buffer);

    expect(out.fonts.filter((f) => f.standard)).toEqual([]);
    expect(out.embeddedFontFiles).toBeGreaterThan(0);
    expect(out.text).toBe(sourceText());
    for (const k of ['TAKİP TALEBİ', 'yazdığım', 'seçtiği', 'Alacaklının']) expect(out.text).toContain(stripWhitespace(k));
    for (const t of ['17.000,00', '1.250,50', '18.250,50']) expect(out.text).toContain(t);
    expect(artifact.create).toHaveBeenCalledTimes(1);
    expect(artifact.create.mock.calls[0][0].data).toMatchObject({
      format: 'PDF',
      documentType: 'TAKIP_TALEBI',
      contentHash: createHash('sha256').update(result.buffer).digest('hex'),
    });
  });

  it('PDF geçerli: sayfa sayısı okunur ve ilk satır PDF başlığı', async () => {
    const pdf = await buildService(baseData()).generatePdfFromCase('case-1', 'takip-talebi', 't1');
    expect(pdf.subarray(0, 5).toString('latin1')).toBe('%PDF-');
    expect(extractPdfText(pdf).pageCount).toBe(1);
  });
});

describe('belge PDF — uzun belge (çok sayfalı, uzun ad / adres, boşluksuz uzun dizgi)', () => {
  const uzunKalemTutarlari = (): string[] => {
    const d = longData();
    // service.formatMoney ile aynı yazım: binlik nokta + ondalık virgül
    return d.claimItems.map((c) => c.amount.toLocaleString('tr-TR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));
  };

  it.each<[string, (s: TemplateEngineService) => Promise<Buffer>]>([
    ['takip-talebi (dosya yolu)', (s) => s.generatePdfFromCase('case-1', 'takip-talebi', 't1')],
    ['takip-talebi (taslak yolu)', (s) => s.generateTakipTalebiPdf(longData())],
    ['odeme-emri (dosya yolu)', (s) => s.generatePdfFromCase('case-1', 'odeme-emri', 't1')],
    ['icra-emri (dosya yolu)', (s) => s.generatePdfFromCase('case-1', 'icra-emri', 't1')],
    ['takip-talebi (merkezi üretim: documents/PDF)', async (s) => (await s.generateDocumentFromCase('case-1', 'PDF', 'takip-talebi', 'v1', 't1', 'user-1')).buffer],
  ])('%s: birden çok sayfa; hiçbir kalem / tutar / ad düşmez, metin kaynakla birebir', async (_ad, run) => {
    const service = buildService(longData());

    const pdf = await run(service);
    const out = extractPdfText(pdf);

    expect(out.pageCount).toBeGreaterThan(1);
    expect(out.fonts.filter((f) => f.standard)).toEqual([]);
    expect(out.text).toBe(sourceText());
    for (let i = 1; i <= 45; i++) expect(out.text).toContain(`Kalem${i}—`);
    for (const t of uzunKalemTutarlari()) expect(out.text).toContain(stripWhitespace(t));
    // boşluksuz uzun dizgi parçalanır ama KAYBOLMAZ
    expect(out.text).toContain('ÇağlayanŞahinoğlu'.repeat(8));
  });
});

describe('belge PDF — hukuki metin ve hesap DEĞİŞMEZ (belge tanımındaki metin sabitleri)', () => {
  it('takip talebi: talep metni, faiz cümlesi, toplam ve takip yolu aynen', async () => {
    const service = buildService(baseData());

    await service.generatePdfFromCase('case-1', 'takip-talebi', 't1');
    const metin = collectDefinitionText(lastDefinition.content).join('\n');

    expect(metin).toContain('Yukarıda yazdığım hakkımın alınmasını talep ederim. (İİK m.8, 58)');
    expect(metin).toContain(
      '18.250,50 TL tutarındaki alacağın icra gideri, vek.ücr. ve takip tarihinden itibaren asıl alacağa işleyecek (YILLIK %24,00 (TİCARİ) değişen oranlarda) faizi ile tahsili talebidir.',
    );
    expect(metin).toContain('17.000,00 TL Asıl Alacak (01.06.2026)');
    expect(metin).toContain('1.250,50 TL Işleyen faiz ve ödeme şekli (01.06.2026)');
    expect(metin).toContain(': HACİZ');
    expect(metin).toContain('Alacaklı veya Vekilinin İmzası');
  });

  it('ödeme emri: şablon metni ve toplam aynen (yalnız yerleşim ızgaraya taşındı)', async () => {
    const service = buildService(baseData());

    await service.generatePdfFromCase('case-1', 'odeme-emri', 't1');
    const metin = collectDefinitionText(lastDefinition.content).join('\n');

    expect(metin).toContain('1. Asıl Alacak: 17.000,00 TL');
    expect(metin).toContain('18.250,50 TL');
    expect(metin).toContain('Yukarda yazili borcun ve takip giderlerinin isbu odeme emrinin tebliginden itibaren');
    expect(metin).toContain('Teblig Tarihi: ....../....../..........');
  });
});

describe('gömülü yazı tipi tanımı — fail-closed', () => {
  it('Roboto dört stil de TrueType Buffer olarak gelir; ad PDF üreticilerinin kullandığıyla aynı', () => {
    const fonts = getTemplatePdfFonts();
    const family = fonts[TEMPLATE_PDF_FONT] as Record<string, Buffer>;
    for (const stil of ['normal', 'bold', 'italics', 'bolditalics']) {
      expect(Buffer.isBuffer(family[stil])).toBe(true);
      expect(family[stil].readUInt32BE(0)).toBe(0x00010000); // TrueType sfnt
      expect(family[stil].length).toBeGreaterThan(100_000);
    }
  });

  it('gömülü yazı tipi bulunamazsa standart yazı tipine SESSİZCE düşülmez: hata fırlatılır', () => {
    resetTemplatePdfFontsCacheForTest();
    jest.isolateModules(() => {
      jest.doMock('pdfmake/build/vfs_fonts', () => ({}));
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const izole = require('../template-pdf-fonts');
      expect(() => izole.getTemplatePdfFonts()).toThrow(/Gömülü PDF yazı tipi bulunamadı: Roboto-Regular\.ttf/u);
    });
    jest.dontMock('pdfmake/build/vfs_fonts');
    resetTemplatePdfFontsCacheForTest();
  });
});

describe('çıkarıcı kör değil — eski (standart Courier) yol aynı metni BOZUK okutur', () => {
  it('Courier ile üretilen "TAKİP TALEBİ …" kaynakla eşleşmez ve standart yazı tipi olarak işaretlenir', async () => {
    const metin = 'TAKİP TALEBİ yerleşim yazdığım seçtiği Alacaklının Işık Şimşek Ğ Gökçe';
    const printer = new PdfPrinter({ Courier: { normal: 'Courier', bold: 'Courier-Bold', italics: 'Courier-Oblique', bolditalics: 'Courier-BoldOblique' } });
    const pdf = await new Promise<Buffer>((resolve, reject) => {
      const doc = printer.createPdfKitDocument({ content: [{ text: metin, font: 'Courier' }], defaultStyle: { font: 'Courier' } });
      const chunks: Buffer[] = [];
      doc.on('data', (c: Buffer) => chunks.push(c));
      doc.on('end', () => resolve(Buffer.concat(chunks)));
      doc.on('error', reject);
      doc.end();
    });

    const out = extractPdfText(pdf);

    expect(out.fonts.some((f) => f.standard)).toBe(true);
    expect(out.text).not.toBe(stripWhitespace(metin));
    for (const k of ['TAKİP', 'yerleşim', 'yazdığım', 'seçtiği', 'Alacaklının']) expect(out.text).not.toContain(k);
    // ASCII ve WinAnsi'de olan harfler (ö ü ç) etkilenmez: kusur yalnız WinAnsi dışı harflerde
    const sadeceAscii = extractPdfText(
      await new Promise<Buffer>((resolve, reject) => {
        const doc = printer.createPdfKitDocument({ content: [{ text: 'Gökçe Müşteri', font: 'Courier' }] });
        const chunks: Buffer[] = [];
        doc.on('data', (c: Buffer) => chunks.push(c));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);
        doc.end();
      }),
    );
    expect(sadeceAscii.text).toContain('Gökçe'); // ö ç WinAnsi'de: sağlam
    expect(sadeceAscii.text).not.toContain('Müşteri'); // ş WinAnsi'de değil: bozuk
  });
});

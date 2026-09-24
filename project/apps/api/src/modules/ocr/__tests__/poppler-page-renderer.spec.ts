/**
 * PR-2b-1 — PopplerPdfPageRenderer testleri.
 *
 * Asıl değer: GRACEFUL FALLBACK — render başarısızsa throw YOK, null döner; hata dışarı taşmaz.
 * Native poppler GERÇEK çağrısı YOK (mock renderImpl). Gerçek poppler = env-gated/skip.
 */

import * as fs from 'fs';
import * as path from 'path';
import {
  PopplerPdfPageRenderer,
  resolveRenderScale,
  buildPopplerConvertOpts,
  DEFAULT_RENDER_SCALE,
} from '../poppler-page-renderer';

const buf = Buffer.from('dummy-pdf');

describe('PR-2b-1 PopplerPdfPageRenderer — graceful fallback (mock)', () => {
  it('1) başarılı render → imageRef döner', async () => {
    const r = new PopplerPdfPageRenderer(async (_b, i) => `page-${i}.png`);
    await expect(r.renderPage(buf, 3)).resolves.toBe('page-3.png');
  });

  it('2) render THROW ederse → null döner (hata dışarı TAŞMAZ)', async () => {
    const r = new PopplerPdfPageRenderer(async () => {
      throw new Error('poppler binary yok (pdftoppm not found)');
    });
    // reject DEĞİL → resolve(null): graceful
    await expect(r.renderPage(buf, 1)).resolves.toBeNull();
  });

  it('3) fs/convert hatasında da null (çökme yok)', async () => {
    const r = new PopplerPdfPageRenderer(async () => {
      throw new Error('ENOENT: temp yazılamadı');
    });
    await expect(r.renderPage(buf, 2)).resolves.toBeNull();
  });

  it('4) hata renderPage çağrısının DIŞINA taşmaz (await throw atmaz)', async () => {
    const r = new PopplerPdfPageRenderer(async () => {
      throw new Error('beklenmedik');
    });
    let threw = false;
    let result: string | null = 'x';
    try {
      result = await r.renderPage(buf, 5);
    } catch {
      threw = true;
    }
    expect(threw).toBe(false);
    expect(result).toBeNull();
  });

  it('5) default constructor PdfPageRenderer arayüzünü karşılar (renderPage fonksiyon)', () => {
    const r = new PopplerPdfPageRenderer();
    expect(typeof r.renderPage).toBe('function');
  });

  it('6) pageIndex renderImpl’e aynen iletilir (1-based)', async () => {
    const seen: number[] = [];
    const r = new PopplerPdfPageRenderer(async (_b, i) => {
      seen.push(i);
      return `p${i}.png`;
    });
    await r.renderPage(buf, 1);
    await r.renderPage(buf, 7);
    expect(seen).toEqual([1, 7]);
  });
});

describe('PR-2b-1 — gerçek poppler entegrasyonu (env-gated)', () => {
  // İzin verilen, bilinçli yerel SKIP: RUN_POPPLER_INTEGRATION!=='1' iken bu test
  // ayrı raporlanır (Jest "skipped" sayacında görünür, PASS'e KARIŞMAZ). Windows/macOS'ta
  // `pdf-poppler` npm paketi KENDİ poppler ikili dosyalarını taşır (node_modules/pdf-poppler/
  // lib/{win,osx}/...) — sistem PATH'ine bağlı DEĞİLDİR; bu nedenle bu ortamlarda
  // RUN_POPPLER_INTEGRATION=1 verildiğinde render gerçekten çalışması BEKLENİR.
  // Linux'ta paket kendisi require anında process.exit(1) verir (ayrı, bilinen kalem —
  // `product-backlog.md` PDF-POPPLER ONARIMI kaydı) — bu dosya o platformda hiç yüklenmez.
  const runIntegration = process.env.RUN_POPPLER_INTEGRATION === '1';
  const fixturePath = path.join(__dirname, 'fixtures', 'minimal-single-page.pdf');

  (runIntegration ? it : it.skip)(
    'gerçek poppler ile 1-sayfalık PDF render eder (env-gated)',
    async () => {
      // Fixture: 200x200pt KARE, tek sayfa, "Hukuk Test PDF" metniyle deterministik
      // üretilmiş minimal geçerli PDF (bkz. fixtures/ dizini). Kare sayfa seçildi ki
      // beklenen PNG boyutu basit olsun: uzun-kenar ölçeklemede (pdf-poppler `scale`)
      // hem genişlik hem yükseklik TAM DEFAULT_RENDER_SCALE (2480) olmalı.
      if (!fs.existsSync(fixturePath)) {
        throw new Error(`Fixture PDF bulunamadı: ${fixturePath}`);
      }
      const pdfBuffer = fs.readFileSync(fixturePath);

      // GERÇEK poppler — mock renderImpl YOK (default constructor -> defaultPopplerRender).
      const renderer = new PopplerPdfPageRenderer();
      const imageRef = await renderer.renderPage(pdfBuffer, 1);

      if (imageRef === null) {
        // Entegrasyon AÇIKÇA istendi (RUN_POPPLER_INTEGRATION=1). Burada renderPage'in
        // kendi graceful-fallback'i (null dönüşü) KABUL EDİLEMEZ — sessiz PASS/SKIP
        // yerine açık FAIL: binary eksik/bozuksa bunu gizlemeyiz.
        throw new Error(
          'RUN_POPPLER_INTEGRATION=1 ile açıkça istenen render null döndü ' +
            '(poppler binary eksik veya bozuk olabilir) — sessiz kabul EDİLMEDİ, açık FAIL.',
        );
      }

      let pngBuffer: Buffer;
      try {
        expect(typeof imageRef).toBe('string');
        expect(fs.existsSync(imageRef)).toBe(true);

        pngBuffer = fs.readFileSync(imageRef);
        // Mock çıktısı DEĞİL, gerçek PNG imzası: gerçek poppler kabulünü kanıtlar.
        expect(pngBuffer.subarray(0, 8).toString('hex')).toBe('89504e470d0a1a0a');
        expect(pngBuffer.length).toBeGreaterThan(1000); // boş/bozuk PNG değil

        // Anlamlı görüntü özelliği: fixture'ın kare 200x200pt sayfası + DEFAULT_RENDER_SCALE
        // -> beklenen genişlik/yükseklik TAM 2480x2480 (yalnız "tanımlı" değil, fixture'dan
        // türetilmiş kesin sayısal beklenti; körlemesine snapshot DEĞİL).
        const width = pngBuffer.readUInt32BE(16);
        const height = pngBuffer.readUInt32BE(20);
        expect(width).toBe(DEFAULT_RENDER_SCALE);
        expect(height).toBe(DEFAULT_RENDER_SCALE);
      } finally {
        // Geçici kaynak temizliği: poppler'ın ürettiği çıktı dizinini sil.
        try {
          fs.rmSync(path.dirname(imageRef), { recursive: true, force: true });
        } catch {
          /* yoksay */
        }
      }
    },
  );
});

describe('DPI fix — resolveRenderScale / buildPopplerConvertOpts', () => {
  it('env yoksa/boşsa → DEFAULT_RENDER_SCALE (2480)', () => {
    expect(resolveRenderScale(undefined)).toBe(DEFAULT_RENDER_SCALE);
    expect(resolveRenderScale('')).toBe(DEFAULT_RENDER_SCALE);
    expect(DEFAULT_RENDER_SCALE).toBe(2480);
  });

  it('geçerli env → o değer', () => {
    expect(resolveRenderScale('3200')).toBe(3200);
  });

  it('geçersiz env (NaN) → default', () => {
    expect(resolveRenderScale('abc')).toBe(DEFAULT_RENDER_SCALE);
  });

  it('çok düşük env (<1024) → default (footgun guard)', () => {
    expect(resolveRenderScale('500')).toBe(DEFAULT_RENDER_SCALE);
    expect(resolveRenderScale('0')).toBe(DEFAULT_RENDER_SCALE);
  });

  it('default scale convert opts\'a gider', () => {
    const opts = buildPopplerConvertOpts('/tmp/x', 'page', 3, resolveRenderScale(undefined));
    expect(opts).toEqual({ format: 'png', out_dir: '/tmp/x', out_prefix: 'page', page: 3, scale: 2480 });
  });

  it('env scale convert opts\'a gider', () => {
    const opts = buildPopplerConvertOpts('/tmp/x', 'page', 1, resolveRenderScale('3000'));
    expect(opts.scale).toBe(3000);
    expect(opts.format).toBe('png');
    expect(opts.page).toBe(1);
  });
});

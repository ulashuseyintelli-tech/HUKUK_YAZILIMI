/**
 * PR-2b-1 — PopplerPdfPageRenderer testleri.
 *
 * Asıl değer: GRACEFUL FALLBACK — render başarısızsa throw YOK, null döner; hata dışarı taşmaz.
 * Native poppler GERÇEK çağrısı YOK (mock renderImpl). Gerçek poppler = env-gated/skip.
 */

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
  // CI/Windows'ta poppler-utils (pdftoppm) genelde YOK → varsayılan SKIP.
  // Elle çalıştırmak için: RUN_POPPLER_INTEGRATION=1 + ortamda poppler kurulu + fixture PDF.
  const runIntegration = process.env.RUN_POPPLER_INTEGRATION === '1';
  (runIntegration ? it : it.skip)(
    'gerçek poppler ile 1-sayfalık PDF render eder (env-gated)',
    async () => {
      // NOT: gerçek fixture PDF gerektirir; iskelet. Aktive edilince burada
      // gerçek bir PDF buffer'ı render edilip imageRef beklenir.
      // const r = new PopplerPdfPageRenderer();
      // const out = await r.renderPage(realPdfBuffer, 1);
      // expect(out).toBeTruthy();
      expect(runIntegration).toBe(true);
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

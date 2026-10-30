import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * F02-D-2 dilim 2 (owner "Burada başla" 30.10.2026) statik bekçi — template-engine'de VIEWER'a açık bırakılan SAF üretim POST'ları.
 *
 * Sözleşme (fail-closed; kaynak = controller + servis dosyası, DB yok, HTTP yok):
 *  1. Controller sınıf düzeyinde `JwtAuthGuard, ViewerWriteDenyGuard` taşır (VIEWER yazma reddi; kapalı kural OWN-13 §51 / AK-1a / B4-B6).
 *  2. Her `@Post` ya `@AllowViewerReadOnlyPost()` ile işaretlidir (JSON gövdesinden belge üretimi) ya da bilinen YAZMA listesindedir
 *     (`cases/:caseId/documents/:format` = belge artifact kaydı + denetim izi). Yeni, işaretsiz ve listede olmayan bir POST → KIRMIZI.
 *  3. Servis dosyasında yazma / denetim izi / dış çağrı yapan HER çağrı yeri yalnız `generateDocumentFromCase` ya da
 *     `recordDocumentArtifact` gövdesindedir → işaretli POST'ların çağırdığı servis yolları (ve aynı dosyadaki yardımcıları)
 *     yazma yapmaz. Saf bir yola yazma / denetim izi / dış çağrı eklenirse → KIRMIZI.
 *
 * HTTP davranışı (VIEWER → 403 yazma rotasında, saf POST'lar açık) `auth/guards/__tests__/f02d-j27-viewer-write-deny-consumers.http.spec.ts`
 * ile ölçülür; bu spec yalnız "saf" iddiasının kaynağa bağlı kalmasını bekler.
 */
const ctrlSrc = readFileSync(join(__dirname, '..', 'template-engine.controller.ts'), 'utf8');
const svcSrc = readFileSync(join(__dirname, '..', 'template-engine.service.ts'), 'utf8');

/** Bilinen YAZMA POST'ları (VIEWER 403 — ViewerWriteDenyGuard). */
const WRITE_POSTS = ['cases/:caseId/documents/:format'];
/** Kaynaktan doğrulanmış SAF üretim POST'ları (JSON gövdesi → belge; DB / denetim izi / dış çağrı yok). */
const READ_ONLY_POSTS = [
  'takip-talebi', 'takip-talebi/preview', 'takip-talebi/download', 'odeme-emri', 'icra-emri', 'haciz-tutanagi',
  'takip-talebi/pdf', 'takip-talebi/word', 'takip-talebi/udf', 'takip-talebi/xml',
];
/** Saf POST'ların çağırdığı servis metotları (aynı dosyada tanımlı olmalı — bekçi kör değil). */
const READ_ONLY_SERVICE_METHODS = [
  'generateTakipTalebi', 'generateOdemeEmri', 'generateIcraEmri', 'generateHacizTutanagi',
  'generateTakipTalebiPdf', 'generateTakipTalebiWord', 'generateTakipTalebiUdf', 'generateTakipTalebiXml',
];
/** Servis dosyasında yazma zinciri taşımasına İZİN VERİLEN metotlar. */
const WRITE_METHODS = new Set(['generateDocumentFromCase', 'recordDocumentArtifact']);
/**
 * Yazma / denetim izi / dış çağrı imzaları: Prisma yazma fiili (`<tanımlayıcı>.create(` …; `createHash(...).update(` gibi zincir
 * çağrıları `)` ile biter ve eşleşmez), transaction, denetim izi, dosya sistemi yazma, ağ çağrısı.
 */
const SIDE_EFFECT = /[A-Za-z0-9_\]]\.(create|createMany|update|updateMany|upsert|delete|deleteMany)\(|\$transaction\(|auditService\.|writeFile|appendFile|mkdir|fetch\(|axios\./;
const METHOD_START = /^  (?:public |private |protected )?(?:async )?([A-Za-z_][A-Za-z0-9_]*)\s*\(/;
const NOT_A_METHOD = new Set(['if', 'for', 'while', 'switch', 'return', 'catch', 'constructor']);

describe('F02-D-2 dilim 2 — template-engine VIEWER saf üretim POST bekçisi (statik)', () => {
  it('controller sınıf düzeyinde JwtAuthGuard + ViewerWriteDenyGuard taşır ve dekoratörü içe aktarır', () => {
    expect(ctrlSrc).toMatch(/@Controller\('template-engine'\)\r?\n@UseGuards\(JwtAuthGuard, ViewerWriteDenyGuard\)/);
    expect(ctrlSrc).toMatch(/import \{ AllowViewerReadOnlyPost, ViewerWriteDenyGuard \} from '\.\.\/auth\/guards\/viewer-write-deny\.guard'/);
  });

  it("her @Post ya @AllowViewerReadOnlyPost() ile işaretli ya da bilinen YAZMA listesinde (yeni işaretsiz POST → KIRMIZI)", () => {
    const lines = ctrlSrc.split(/\r?\n/);
    const posts: Array<{ path: string; marked: boolean; no: number }> = [];
    lines.forEach((line, i) => {
      const m = line.match(/^\s*@Post\('([^']*)'\)/);
      if (!m) return;
      let marked = false;
      // Geriye yürü: aynı handler'ın dekoratör / yorum satırları (ilk kod satırında dur).
      for (let j = i - 1; j >= 0 && /^\s*(@|\/\/|\/\*|\*)/.test(lines[j]); j--) {
        if (/@AllowViewerReadOnlyPost\(\)/.test(lines[j])) marked = true;
      }
      posts.push({ path: m[1], marked, no: i + 1 });
    });
    expect(posts.map((p) => p.path).sort()).toEqual([...WRITE_POSTS, ...READ_ONLY_POSTS].sort());
    expect(posts.filter((p) => p.marked).map((p) => p.path).sort()).toEqual([...READ_ONLY_POSTS].sort());
    expect(posts.filter((p) => !p.marked).map((p) => p.path)).toEqual(WRITE_POSTS);
  });

  it('servis: yazma / denetim izi / dış çağrı yerleri YALNIZ generateDocumentFromCase ve recordDocumentArtifact gövdesinde', () => {
    const lines = svcSrc.split(/\r?\n/);
    let current = '<sınıf dışı>';
    const hits: Array<{ method: string; no: number; text: string }> = [];
    lines.forEach((line, i) => {
      const m = line.match(METHOD_START);
      if (m && !NOT_A_METHOD.has(m[1])) current = m[1];
      if (SIDE_EFFECT.test(line)) hits.push({ method: current, no: i + 1, text: line.trim() });
    });
    // Kör değil: artifact kaydı (Prisma create) ve denetim izi (auditService.log) GÖRÜLMELİ.
    expect(hits.some((h) => h.method === 'recordDocumentArtifact' && /\.create\(/.test(h.text))).toBe(true);
    expect(hits.some((h) => h.method === 'recordDocumentArtifact' && /auditService\./.test(h.text))).toBe(true);
    // Saf yollarda (ve yardımcılarında) yazma YOK.
    expect(hits.filter((h) => !WRITE_METHODS.has(h.method))).toEqual([]);
  });

  it("kör değil: saf POST'ların servis metotları bu dosyada sınıf metodu olarak tanımlı", () => {
    for (const m of READ_ONLY_SERVICE_METHODS) {
      expect(svcSrc).toMatch(new RegExp(`^  (?:async )?${m}\\(`, 'm'));
    }
    expect(svcSrc).toMatch(/^  async generateDocumentFromCase\(/m);
    expect(svcSrc).toMatch(/^  private async recordDocumentArtifact\(/m);
  });
});

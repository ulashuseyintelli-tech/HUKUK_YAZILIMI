import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { IIK78_STATUTORY_INACTIVITY_DAYS } from '../iik78-inactivity';

/**
 * F03-D2 (J-25 / OFP-19b; owner kararı K6-b, 25.11.2026) — İİK-78 büro ayarı "yalnız saklama"dır; ekrandaki dosya pasiflik
 * göstergesi yasal 1 yılla hesaplanır.
 *
 * SINIR sabitlemesi: ayar alanlarını / ayar istemcisini kullanan ekran kodu yoktur (yalnız istemci tanımı). Ayar bir ekran
 * hesabına bağlanırsa test düşer — bu, yasal süreyi ayarla değiştirmek demektir ve yeni owner kararı ister.
 * stable key: lib/iik78-inactivity.ts
 */
const SRC = join(__dirname, '..', '..');
const SETTING_USE = /inactivityThresholdDays|inactivityWarningDays|getIik78Settings|updateIik78Settings/;

function productionSources(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) {
      if (name === '__tests__' || name === 'node_modules') continue;
      productionSources(full, out);
    } else if (/\.(ts|tsx)$/.test(name) && !/\.(test|spec)\.(ts|tsx)$/.test(name) && !name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}
const read = (...parts: string[]) => readFileSync(join(SRC, ...parts), 'utf8');
/** Yorumlar ayarın adını ya da gün sayısını anabilir (etiket); sınır KOD kullanımını ölçer. */
const code = (source: string): string => source.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

describe('F03-D2 — İİK-78 büro ayarı yalnız saklanır (ekran)', () => {
  it('yasal süre sabiti 365 gündür', () => {
    expect(IIK78_STATUTORY_INACTIVITY_DAYS).toBe(365);
  });

  it('ayar alanlarını ya da ayar istemcisini kullanan ekran kodu yoktur (yalnız istemci tanımı)', () => {
    const users = productionSources(SRC)
      .filter((file) => SETTING_USE.test(code(readFileSync(file, 'utf8'))))
      .map((file) => relative(SRC, file).split(sep).join('/'))
      .sort();
    expect(users).toEqual(['lib/api/office.ts']);
  });

  it('dosya sayfası ve dosya başlığı kalan günü yasal süre sabitiyle hesaplar; "büro ayarından alınabilir" vaadi kalmaz', () => {
    const page = read('app', '(dashboard)', 'cases', '[id]', 'page.tsx');
    const header = read('components', 'case-detail', 'CaseHeader.tsx');
    expect(page).toContain('const INACTIVITY_THRESHOLD_DAYS = IIK78_STATUTORY_INACTIVITY_DAYS;');
    expect(page).not.toContain('Büro ayarından alınabilir');
    expect(header).toContain('Math.max(0, IIK78_STATUTORY_INACTIVITY_DAYS - daysSince)');
    const v2 = read('app', '(dashboard)', 'cases', '[id]', 'v2', 'page.tsx');
    expect(v2).toContain('IIK78_STATUTORY_INACTIVITY_DAYS - calculateDays(');
    // elle yazılmış 365 kalmaz: süre tek adla anılır (yorumlar dışında)
    for (const source of [page, header, v2]) expect(code(source)).not.toMatch(/\b365\b/);
  });
});

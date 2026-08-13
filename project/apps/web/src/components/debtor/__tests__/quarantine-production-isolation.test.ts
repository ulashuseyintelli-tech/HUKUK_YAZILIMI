import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * WSMR-A4d — `components/debtor/__quarantine__` PRODUCTION İZOLASYONU.
 *
 * Bu dizindeki üç bileşen sabit demo/mock veri taşır (`demo`, `demoFactors`,
 * `mockPayments`). Terminal sınıfları **DEV_TEST_ONLY_FIXTURE**'dır — ama bu
 * yalnız KLASÖR ADINA dayanamaz: adı "quarantine" olan bir dizin de pekâlâ
 * import edilebilir. Bu spec izolasyonu KANITLAR ve regresyonu kilitler:
 * biri ileride bu dizinden production'a import ederse test KIRILIR.
 *
 * Ayrıca ölçülen (bu spec'in kapsayamadığı, PR'da kayıtlı): `next build`
 * çıktısında (`.next/`) üç bileşenin de export adı GEÇMİYOR — 0 bundle dosyası.
 */

const SRC = path.resolve(__dirname, '..', '..', '..');
const QUARANTINE_DIR = path.join(SRC, 'components', 'debtor', '__quarantine__');

/** Kaynak ağacındaki tüm .ts/.tsx dosyaları (karantina dizini hariç). */
function productionFiles(dir: string, out: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (e.name === 'node_modules' || e.name === '.next') continue;
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === '__quarantine__') continue; // kendisi haric
      productionFiles(p, out);
    } else if (/\.tsx?$/.test(e.name)) {
      out.push(p);
    }
  }
  return out;
}

const isTestFile = (p: string) => /__tests__|\.(test|spec)\.tsx?$/.test(p);

describe('__quarantine__ · production izolasyonu', () => {
  const files = productionFiles(SRC);
  const sources = files.map((f) => ({ file: f, text: fs.readFileSync(f, 'utf8') }));

  it('dizin gerçekten mevcut ve beklenen üç bileşeni içeriyor', () => {
    const names = fs.readdirSync(QUARANTINE_DIR).sort();
    expect(names).toEqual(['communication-log.tsx', 'debtor-risk-score.tsx', 'payment-history.tsx']);
  });

  it('HİÇBİR production dosyası __quarantine__ dizininden import ETMİYOR', () => {
    const offenders = sources
      .filter((s) => !isTestFile(s.file))
      .filter((s) => /__quarantine__/.test(s.text))
      .map((s) => path.relative(SRC, s.file));
    expect(offenders).toEqual([]);
  });

  it('export edilen bileşen adları production kaynağında GEÇMİYOR', () => {
    // Import yolu degistirilse bile (ornegin dosya tasinsa) ad bazli kacak yakalanir.
    for (const name of ['DebtorCommunicationLog', 'DebtorRiskScore', 'DebtorPaymentHistory']) {
      const offenders = sources
        .filter((s) => !isTestFile(s.file))
        .filter((s) => s.text.includes(name))
        .map((s) => path.relative(SRC, s.file));
      expect(offenders, `${name} production kaynağında bulundu`).toEqual([]);
    }
  });

  it('dynamic import / glob ile de çekilmiyor', () => {
    const dyn = sources
      .filter((s) => !isTestFile(s.file))
      .filter((s) => /import\s*\(|import\.meta\.glob|require\.context/.test(s.text))
      .filter((s) => /quarantine/i.test(s.text))
      .map((s) => path.relative(SRC, s.file));
    expect(dyn).toEqual([]);
  });

  it('debtor barrel (varsa) karantina dizinini re-export ETMİYOR', () => {
    const barrel = path.join(SRC, 'components', 'debtor', 'index.ts');
    if (!fs.existsSync(barrel)) return; // barrel yok → re-export de yok
    expect(fs.readFileSync(barrel, 'utf8')).not.toMatch(/__quarantine__/);
  });
});

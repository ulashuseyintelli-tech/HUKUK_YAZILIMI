/**
 * GH-04 negative regression guard.
 *
 * `PerfHarness`in `outputDir` varsayilani `<__dirname>/reports` — yani REPOSITORY
 * ICI bir dizin. Bir perf spec'i outputDir gecmeyi unutursa test kosmak calisma
 * agacini kirletir; m5 tam olarak bunu yapiyordu ve repo'daki tek tracked perf
 * raporunun uzerine yaziyordu.
 *
 * Bu guard, her `new PerfHarness(...)` cagrisinin explicit bir `outputDir`
 * tasidigini statik olarak dogrular. Testin kendisi hicbir sey calistirmaz;
 * yalnizca kaynak metnini okur, bu yuzden hizli ve yan etkisizdir.
 */
import * as fs from 'fs';
import * as path from 'path';

const MATRICES_DIR = path.join(__dirname, 'matrices');

function perfSpecFiles(): string[] {
  return fs
    .readdirSync(MATRICES_DIR)
    .filter((f) => f.endsWith('.perf.spec.ts'))
    .map((f) => path.join(MATRICES_DIR, f));
}

describe('GH-04 PerfHarness output isolation guard', () => {
  it('perf spec dizini bos degildir (guard sessizce gecmez)', () => {
    expect(perfSpecFiles().length).toBeGreaterThan(0);
  });

  it('her PerfHarness cagrisi explicit outputDir tasir', () => {
    const offenders: string[] = [];

    for (const file of perfSpecFiles()) {
      const source = fs.readFileSync(file, 'utf8');
      // `new PerfHarness(` ile baslayan cagrinin kapanis parantezine kadar olan
      // bolumunu al; icinde `outputDir` gecmiyorsa varsayilan repo-ici yol kullanilir.
      const calls = source.match(/new PerfHarness\([^;]*?\)/gs) ?? [];
      for (const call of calls) {
        if (!call.includes('outputDir')) {
          offenders.push(`${path.basename(file)} :: ${call.replace(/\s+/g, ' ').slice(0, 120)}`);
        }
      }
    }

    expect(offenders).toEqual([]);
  });

  it('outputDir varsayilani hala repo icini gosteriyor (guard gerekcesi gecerli)', () => {
    const harnessSource = fs.readFileSync(path.join(__dirname, 'perf-harness.ts'), 'utf8');
    // Varsayilan degisirse bu guard'in gerekcesi de degismeli; sessizce gecerli
    // kalmasin diye acikca dogrulanir.
    expect(harnessSource).toContain("path.join(__dirname, 'reports')");
  });
});

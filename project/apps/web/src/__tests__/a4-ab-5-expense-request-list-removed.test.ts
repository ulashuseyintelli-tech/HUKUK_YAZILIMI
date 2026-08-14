import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * WSMR-A4-AB-5 — `components/expense/ExpenseRequestList.tsx` KALDIRILDI.
 *
 * Owner GO — `ExpenseRequestList#fetchRequests` için önce beş-kapılı
 * erişilebilirlik kontrolü uygulandı:
 *   1. direct/named/barrel import : VAR (`components/expense/index.ts` +
 *      `cases/[id]/page.tsx:60`) — sıfır DEĞİL
 *   2. dynamic import/glob/registry/lazy : yok
 *   3. route/JSX render            : YOK — `<ExpenseRequestList` hiçbir
 *      yerde render EDİLMİYOR
 *   4. production build graph      : tree-shake edilebilir (hiç referans
 *      edilmeyen named import)
 *   5. test-dışı consumer          : yok
 *
 * Beş kapının HEPSİ sıfır DEĞİLDİ (Gate 1 teknik olarak dolu) — bu yüzden
 * CollectionPanel'deki gibi otomatik kaldırma yetkisi kendiliğinden
 * uygulanmadı; owner'a AYRICA soruldu. Bulgu: aynı import satırındaki
 * kardeş bileşen `ExpenseRequestModal` GERÇEKTEN render ediliyor
 * (`cases/[id]/page.tsx:4277`), yalnız `ExpenseRequestList` ölü/kullanılmayan
 * bir import olarak kalmıştı — component hiçbir zaman JSX'te çağrılmadı.
 *
 * Owner kararı: "Ölü import + bileşen — kaldır." → `UNSUPPORTED_SYNTHETIC_
 * UI_REMOVED`. Component + dosya + ölü import satırı (page.tsx VE barrel)
 * birlikte kaldırıldı.
 *
 * Aşağıdaki test bu kararı KİLİTLER: dosya fiziksel olarak yok, barrel
 * artık onu re-export ETMİYOR, hiçbir kaynak dosyası import/JSX yoluyla
 * referans vermiyor.
 */

const SRC_ROOT = path.resolve(__dirname, '..');
const REMOVED_FILE = path.join(SRC_ROOT, 'components', 'expense', 'ExpenseRequestList.tsx');
const BARREL_FILE = path.join(SRC_ROOT, 'components', 'expense', 'index.ts');
const THIS_FILE = path.resolve(__filename);

function listSourceFiles(dir: string): string[] {
  const out: string[] = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '.next') continue;
      out.push(...listSourceFiles(full));
    } else if (/\.(ts|tsx)$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

describe('ExpenseRequestList — kaldırıldı (ölü import), sessizce geri eklenmez', () => {
  it('dosya fiziksel olarak yok', () => {
    expect(fs.existsSync(REMOVED_FILE)).toBe(false);
  });

  it('barrel (components/expense/index.ts) artık ExpenseRequestList\'i re-export ETMİYOR', () => {
    const barrelSrc = fs.readFileSync(BARREL_FILE, 'utf8');
    expect(barrelSrc).not.toMatch(/ExpenseRequestList/);
    // Kardeş bileşenler ETKİLENMEDİ — barrel hâlâ onları export ediyor.
    expect(barrelSrc).toMatch(/ExpenseRequestModal/);
    expect(barrelSrc).toMatch(/BalanceWidget/);
  });

  it('hiçbir kaynak dosyası ExpenseRequestList\'i import/JSX YOLUYLA referans vermiyor', () => {
    const files = listSourceFiles(SRC_ROOT).filter((f) => path.resolve(f) !== THIS_FILE);
    const importPattern =
      /from\s+['"][^'"]*expense\/ExpenseRequestList['"]|import\(['"][^'"]*expense\/ExpenseRequestList['"]\)|<ExpenseRequestList[\s/>]|\{[^}]*\bExpenseRequestList\b[^}]*\}\s*from/;
    const offenders: string[] = [];
    for (const file of files) {
      const content = fs.readFileSync(file, 'utf8');
      if (importPattern.test(content)) {
        offenders.push(path.relative(SRC_ROOT, file));
      }
    }
    expect(offenders).toEqual([]);
  }, 20000);
});

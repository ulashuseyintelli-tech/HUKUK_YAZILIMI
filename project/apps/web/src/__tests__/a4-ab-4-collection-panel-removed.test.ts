import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * WSMR-A4-AB-4 — `components/collection/CollectionPanel.tsx` KALDIRILDI.
 *
 * Owner GO: bu bileşenin `loadData`'sındaki okuma hatası (`console.error` ile
 * yutuluyor, `cover`/`summary` state'i silinmiyor — stale/partial etiketi YOK)
 * production davranış patch'i olarak kapatılacaktı. Ancak inceleme SIFIR
 * referans ortaya çıkardı: hiçbir sayfa/route/barrel bu bileşeni import
 * ETMİYORDU (direkt/named/dynamic import yok), son commit 12.01.2026'dan beri
 * dokunulmamıştı ve `cases/[id]/page.tsx`'in kendi inline collections/finance
 * akışıyla (OperationDeck) fonksiyonel olarak ÇAKIŞIYORDU — muhtemelen
 * SUPERSEDE edilmiş, gerçekten ölü kod.
 *
 * Program kuralı: erişilemezlik tek başına terminal sınıf DEĞİLDİR; gerçekten
 * ürün dışıysa kod VE (varsa) barrel export birlikte kaldırılır, sessizce
 * "erişilemez" denip bırakılmaz. Owner bu kanıtla KALDIRMA yönünde karar
 * verdi (davranışsal patch DEĞİL — kimse görmeyecek koda fix boşa giderdi).
 *
 * Aşağıdaki test bu kararı KİLİTLER: dosya fiziksel olarak yok VE hiçbir
 * kaynak dosyası ona import YOLUYLA referans vermiyor — biri ileride
 * "geri eklerse" (kasıtsız/otomatik bir revert ile) bu test kırılır.
 */

const SRC_ROOT = path.resolve(__dirname, '..');
const REMOVED_FILE = path.join(SRC_ROOT, 'components', 'collection', 'CollectionPanel.tsx');
const REMOVED_DIR = path.join(SRC_ROOT, 'components', 'collection');
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

describe('CollectionPanel — kaldırıldı, sessizce geri eklenmez', () => {
  it('dosya VE dizin fiziksel olarak yok', () => {
    expect(fs.existsSync(REMOVED_FILE)).toBe(false);
    expect(fs.existsSync(REMOVED_DIR)).toBe(false);
  });

  it('hiçbir kaynak dosyası CollectionPanel\'i import/JSX YOLUYLA referans vermiyor', () => {
    // NOT: bare "CollectionPanel" kelime geçişi (ör. eski A4-AB-1 spec'inin
    // "kapsam dışı" yorumundaki isim anımı) KASITLI olarak YAKALANMAZ — yalnız
    // GERÇEK import/JSX-render referansları bu testin kapsamındadır.
    const files = listSourceFiles(SRC_ROOT).filter((f) => path.resolve(f) !== THIS_FILE);
    const importPattern = /from\s+['"][^'"]*collection\/CollectionPanel['"]|import\(['"][^'"]*collection\/CollectionPanel['"]\)|<CollectionPanel[\s/>]/;
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

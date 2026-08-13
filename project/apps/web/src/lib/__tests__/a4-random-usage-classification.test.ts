import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * WSMR-A4 — `Math.random()` KULLANIMLARININ AİLE BAZLI SINIFLANDIRMASI.
 *
 * Owner kuralı: tek bir genel test bütün adayları aklamaz. Her DAVRANIŞ AİLESİ
 * kendi gerekçesine ve kendi testine bağlanır. Aşağıdaki üç aile ayrı ayrı
 * doğrulanır; biri bozulursa yalnız o aile kırılır ve yeniden değerlendirilir.
 */

const SRC = path.resolve(__dirname, '..', '..');
const read = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8');

/* ─────────────────────────────────────────────────────────────────────────
   NOT — AİLE A (finansal idempotency anahtarlari) BU DOSYADAN CIKARILDI.
   O bulgular FALSE_POSITIVE DEGIL, **FIXED**'dir: anahtar backend dedupe
   sozlesmesine gonderildigi icin `Math.random()` fallback'i KALDIRILDI ve
   uretim fail-closed yapildi. Davranis kaniti: `idempotency-key.test.ts`
   ve `payout-insecure-entropy.spec.tsx`. Ayni bulgu iki sinifta SAYILMAZ.
   ───────────────────────────────────────────────────────────────────────── */

/* ─────────────────────────────────────────────────────────────────────────
   AİLE B — TEKNİK UI KİMLİKLERİ (taslak satır anahtarları)
   Gerekçe: React liste anahtarı / taslak satır kimliği üretir. Persistence
   veya dedupe sözleşmesine KATILMAZ, kullanıcıya gösterilmez.
   ───────────────────────────────────────────────────────────────────────── */
describe('AİLE B — teknik UI kimlikleri', () => {
  const UI_ID_GENERATORS = [
    { file: 'app/(dashboard)/cases/new/page.tsx', fn: 'genClaimDraftItemId' },
    { file: 'components/claim-item/ProfessionalClaimItemForm.tsx', fn: 'id' },
  ];

  for (const g of UI_ID_GENERATORS) {
    it(`${g.file} · uretilen deger FINANSAL/HUKUKI alana yazilmaz`, () => {
      const src = read(g.file);
      const randLines = src
        .split(/\r?\n/)
        .filter((l) => l.includes('Math.random'));
      expect(randLines.length).toBeGreaterThan(0);
      for (const line of randLines) {
        // Tutar/faiz/tarih/oran gibi domain alanlarina ATANMAZ.
        expect(line).not.toMatch(/\b(amount|tutar|faiz|interest|rate|oran|principal|anapara|bakiye|balance)\b/i);
      }
    });
  }
});

/* ─────────────────────────────────────────────────────────────────────────
   AİLE C — ROLLOUT KAPISI
   Gerekçe: yuzde bazli ozellik acilimi; is verisi URETMEZ. Session hash
   VARSA deterministiktir, yalnizca hash yoksa rastgele daginim kullanilir.
   ───────────────────────────────────────────────────────────────────────── */
describe('AİLE C — feature flag rollout kapisi', () => {
  it('session hash VARSA deterministik; rastgelelik yalniz hash YOKKEN', () => {
    const src = read('lib/config/feature-flags.ts');
    // Deterministik yol once gelir ve erken doner.
    expect(src).toMatch(/\(?hashNum\s*%\s*100\)?\s*<\s*config\.rolloutPercent/);
    const detPos = src.indexOf('hashNum % 100');
    const randPos = src.indexOf('Math.random() * 100');
    expect(detPos).toBeGreaterThan(-1);
    expect(randPos).toBeGreaterThan(detPos); // rastgelelik SONRAKI (fallback) dal
  });

  it('rollout kapisi bir IS DEGERI dondurmez (yalniz boolean)', () => {
    const src = read('lib/config/feature-flags.ts');
    const idx = src.indexOf('Math.random() * 100');
    const line = src.slice(src.lastIndexOf('\n', idx) + 1, src.indexOf('\n', idx));
    expect(line).toMatch(/return\s+Math\.random\(\) \* 100 < config\.rolloutPercent/);
  });
});

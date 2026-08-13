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
   AİLE A — IDEMPOTENCY ANAHTARI ÜRETİCİLERİ
   FALSE_POSITIVE_WITH_TESTED_RULE_REASON gerekçesi:
   crypto.randomUUID BİRİNCİL kaynaktır; Math.random yalnız secure-context
   olmayan ortamda FALLBACK'tir. Değer kullanıcıya iş verisi olarak SUNULMAZ,
   finansal/hukuki bir miktar ÜRETMEZ ve dedupe sözleşmesini BOZMAZ — anahtar
   yeniden denemede KORUNUR (aşağıda dosya bazında kanıtlanır).
   ───────────────────────────────────────────────────────────────────────── */
const IDEMPOTENCY_GENERATORS = [
  { file: 'lib/api.ts', fn: 'generateClientWorkspaceIdempotencyKey', prefix: 'cw-' },
  { file: 'components/client-accounting/OffsetDrawer.tsx', fn: 'genIdempotencyKey', prefix: 'offset-' },
  { file: 'components/client-accounting/PayoutCreateModal.tsx', fn: 'genIdempotencyKey', prefix: 'payout-' },
  { file: 'components/finance/CollectionModal.tsx', fn: 'newIdempotencyKey', prefix: 'col-' },
];

describe('AİLE A — idempotency anahtarı üreticileri', () => {
  for (const g of IDEMPOTENCY_GENERATORS) {
    it(`${g.file} · crypto.randomUUID BİRİNCİL, Math.random yalnız fallback`, () => {
      const src = read(g.file);
      const idx = src.indexOf(g.fn);
      expect(idx).toBeGreaterThan(-1);
      const body = src.slice(idx, idx + 400);
      // crypto.randomUUID once denenir ve ERKEN DONER.
      expect(body).toMatch(/crypto\s*\.\s*randomUUID/);
      expect(body).toMatch(/return\s+crypto\s*\.\s*randomUUID\(\)/);
      // Math.random YALNIZ o return'den SONRA (fallback konumunda) gecer.
      const uuidPos = body.indexOf('crypto.randomUUID()');
      const randPos = body.indexOf('Math.random');
      if (randPos > -1) expect(randPos).toBeGreaterThan(uuidPos);
    });
  }

  it('fallback deseni yeterince benzersiz (zaman damgasi + rastgele son ek)', () => {
    const make = () => `col-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const keys = new Set(Array.from({ length: 2000 }, make));
    expect(keys.size).toBe(2000); // cakisma YOK
  });
});

describe('AİLE A — dedupe sözleşmesi: anahtar yeniden denemede KORUNUR', () => {
  it('CollectionModal · retry AYNI anahtarla yapilir', () => {
    const src = read('components/finance/CollectionModal.tsx');
    // Anahtar state'te tutulur ve retry'da yeniden URETILMEZ.
    expect(src).toMatch(/const \[idempotencyKey, setIdempotencyKey\] = useState/);
    expect(src).toMatch(/stableIdempotencyKey\s*=\s*idempotencyKey\s*\|\|/);
  });

  it('PayoutCreateModal · MOUNT basina BIR KEZ (lazy initializer)', () => {
    const src = read('components/client-accounting/PayoutCreateModal.tsx');
    // `useState(genIdempotencyKey)` — FONKSIYON referansi; `useState(genIdempotencyKey())` OLSAYDI
    // her render'da yeniden uretilirdi. Setter YOK: degistirilemez.
    expect(src).toMatch(/useState<string>\(genIdempotencyKey\)/);
    expect(src).not.toMatch(/useState<string>\(genIdempotencyKey\(\)\)/);
  });

  it('OffsetDrawer · anahtar ONIZLENEN offset e kilitli', () => {
    const src = read('components/client-accounting/OffsetDrawer.tsx');
    // Key preview ile birlikte uretilir ve mutation ONU kullanir.
    expect(src).toMatch(/setPreview\(\{[^}]*key:\s*genIdempotencyKey\(\)/);
    expect(src).toMatch(/idempotencyKey:\s*preview!\.key/);
  });
});

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

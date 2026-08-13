import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * PR-2A1 — TAKIP TALEBI ONIZLEME SOZLESMESI
 * stable key: app/(dashboard)/cases/new/page.tsx#generateTakipTalebiPreview
 *
 * ── CROSS-PROGRAM CONSUMER TEST UPDATE · WSMR-A4l ──────────────────────────
 * Bu spec'in KONUSU KALDIRILDI. `generateTakipTalebiPreview`, hiçbir yerden
 * render edilmeyen `DuesStep` bileşeninin içindeydi; WSMR-A4l bu erişilemez
 * taşıyıcıyı UNSUPPORTED_SYNTHETIC_UI_REMOVED olarak kaldırdı (dört kanıt:
 * render consumer yok · dynamic import/glob yok · route erişimi yok ·
 * production bundle consumer yok).
 *
 * Spec SİLİNMEDİ. PR-2A1'in koruduğu değer — "hata hâlinde UYDURMA bir
 * 'TAKİP TALEBİ (ÖRNEK 1)' belgesi üretilip gerçek şablon çıktısıymış gibi
 * önizletilemez" — daha güçlü bir biçimde kilitleniyor: yol tümüyle yok.
 * Biri ileride bu sihirbaza uydurma bir önizleme geri getirirse test kırılır.
 *
 * A1 MUHASEBESİ: `generateTakipTalebiPreview` imzası A1'in terminal raporunda
 * FIXED olarak sayılıdır ve orada kalır. WSMR-A4 bu imzayı YENİDEN saymaz;
 * A4l yalnız erişilemez taşıyıcının kaldırılmasını üstlenir.
 * ──────────────────────────────────────────────────────────────────────────
 */

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');

/** Kod gövdesi — açıklama satırları çıkarılır ki yorumlar eşleşmeyi kandırmasın. */
const CODE = SRC.split(/\r?\n/)
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');

describe('takip talebi onizleme — kaldirma kilidi', () => {
  it('generateTakipTalebiPreview ARTIK BILDIRILMIYOR', () => {
    expect(CODE).not.toMatch(/generateTakipTalebiPreview/);
  });

  it('UYDURMA fallback belge geri GELMEDI', () => {
    expect(CODE).not.toContain('TAKİP TALEBİ (ÖRNEK 1)');
    expect(CODE).not.toContain('simplePreview');
    expect(CODE).not.toContain('setTakipTalebiContent');
  });

  it('tasiyici bilesen DuesStep de bildirilmiyor', () => {
    expect(CODE).not.toMatch(/function\s+DuesStep\s*\(/);
  });

  it('modul hala gecerli bir route sayfasi olarak default export ediyor', () => {
    expect(CODE).toMatch(/export\s+default\s+function\s+/);
  });
});

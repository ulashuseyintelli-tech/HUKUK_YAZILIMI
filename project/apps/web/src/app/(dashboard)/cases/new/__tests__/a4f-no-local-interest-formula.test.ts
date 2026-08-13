import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * WSMR-A4f/A4l — YEREL FAİZ FORMÜLÜ KALDIRMA KİLİDİ.
 *
 * A4f'de `calculateInterest` fail-closed yapılmıştı: `/rule-engine/interest`
 * hata verdiğinde faiz YEREL olarak `principal * (rate / 365 / 100) * gün`
 * formülüyle üretiliyor, sonuç ekranda gerçek hesap gibi gösteriliyor ve
 * "Kalem Olarak Ekle" ile `interestAmount` / `interestRate` alanlarına
 * yazılıyordu. Bu düz formül 3095 sayılı Kanun kapsamındaki dönemsel oran
 * değişimlerini yok sayan bir TAHMİNDİR.
 *
 * A4l'de bu fonksiyonun taşıyıcısı olan `DuesStep` bileşeni — hiçbir yerden
 * render edilmediği kanıtlandığı için — tümüyle kaldırıldı. Spec artık
 * sözleşmeyi değil, GERİ GELMEYİ kilitliyor.
 */

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');

/** Kod gövdesi — açıklama satırları çıkarılır; kaldırılan formülü ANLATAN yorum eşleşmemeli. */
const CODE = SRC.split(/\r?\n/)
  .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
  .join('\n');

describe('cases/new sihirbazi — yerel faiz hesabi yok', () => {
  it('calculateInterest ARTIK BILDIRILMIYOR', () => {
    expect(CODE).not.toMatch(/const\s+calculateInterest\s*=/);
  });

  it('gunluk faiz formulu (rate / 365 / 100) modulde YOK', () => {
    expect(CODE).not.toMatch(/\/\s*365\s*\/\s*100/);
    expect(CODE).not.toMatch(/dailyRate/);
  });

  it('faiz sonucu ureten yerel bir fallback KALMADI', () => {
    expect(CODE).not.toMatch(/setInterestResult/);
    expect(CODE).not.toMatch(/Fallback:\s*Manuel hesaplama/);
  });

  it('sabit %10 cek tazminati orani da tasiyiciyla birlikte gitti', () => {
    expect(CODE).not.toContain('Çek Tazminatı (%10)');
  });

  it('modul hala gecerli bir route sayfasi olarak default export ediyor', () => {
    expect(CODE).toMatch(/export\s+default\s+function\s+/);
  });
});

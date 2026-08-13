import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

/**
 * WSMR-A4f — FAİZ HESABI SÖZLEŞMESİ
 * stable key: app/(dashboard)/cases/new/page.tsx#calculateInterest
 *
 * Eski davranış: `/rule-engine/interest` hata verdiğinde catch bloğu faizi YEREL
 * olarak `principal * (rate / 365 / 100) * gün` formülüyle üretiyor, sonucu
 * ekranda gerçek hesap gibi gösteriyor ve "Kalem Olarak Ekle" ile
 * `interestAmount` / `interestRate` alanlarına yazıyordu. Bu düz formül 3095
 * sayılı Kanun kapsamındaki dönemsel oran değişimlerini yok sayan bir TAHMİNDİR.
 *
 * Bu spec, kardeş `takip-preview-contract.spec.ts` (PR-2A1) ile aynı biçimde
 * sözleşmeyi KAYNAK düzeyinde kilitler. Gerekçe orada açıklandığı gibidir ve
 * burada ayrıca ölçülmüştür: bu bulgunun bulunduğu `DuesStep` bileşeni kaynak
 * ağacında HİÇBİR yerden render edilmiyor (tek geçtiği yer kendi bildirimi),
 * bu yüzden davranışsal render testi kurulabilecek bir yüzey yoktur. Ölçüm
 * PR gövdesinde erişilebilirlik kanıtı olarak kayıtlıdır.
 */

const SRC = fs.readFileSync(path.resolve(__dirname, '..', 'page.tsx'), 'utf8');

/**
 * Segment KOD gövdesi olarak dönülür: açıklama satırları çıkarılır. Aksi hâlde
 * kaldırılan formülü ANLATAN yorum, formülün kendisiymiş gibi eşleşirdi.
 */
function interestSegment(): string {
  const i = SRC.indexOf('const calculateInterest = async');
  expect(i).toBeGreaterThan(-1);
  const next = SRC.indexOf('const addInterestAsDue', i);
  return SRC.slice(i, next > i ? next : i + 4000)
    .split(/\r?\n/)
    .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
    .join('\n');
}

describe('calculateInterest sozlesmesi', () => {
  it('YEREL faiz formulu KALDIRILDI', () => {
    const seg = interestSegment();
    expect(seg).not.toMatch(/\/\s*365\s*\/\s*100/);
    expect(seg).not.toContain('dailyRate');
    expect(seg).not.toContain('Fallback: Manuel hesaplama');
  });

  it('hata dalinda faiz SONUCU URETILMEZ', () => {
    const seg = interestSegment();
    const catchPart = seg.slice(seg.indexOf('} catch'));
    // Tek izinli cagri: sonucu TEMIZLEMEK (null). Deger uretilemez.
    expect(catchPart).not.toMatch(/setInterestResult\(\s*\{/);
    expect(catchPart).toContain('setInterestResult(null)');
  });

  it('hata GORUNUR ve guvenli mesajla yuzeye cikar', () => {
    const seg = interestSegment();
    expect(seg).toContain('setInterestError(');
    expect(seg).toContain('toActionErrorMessage(');
    expect(seg).not.toMatch(/console\.error\("Faiz hesaplama hatasi/);
  });

  it('malformed yanit BASARI SAYILMAZ', () => {
    const seg = interestSegment();
    expect(seg).toContain('MALFORMED_INTEREST_RESPONSE');
    // interest / days / rate ucu de sayi olarak dogrulanir.
    expect(seg).toMatch(/typeof result\.interest !== "number"/);
    expect(seg).toMatch(/typeof result\.days !== "number"/);
    expect(seg).toMatch(/typeof result\.rate !== "number"/);
  });

  it('hata bandi Hesapla dugmesinin YANINDA render ediliyor', () => {
    const band = SRC.indexOf('{interestError && (');
    const btn = SRC.indexOf('onClick={calculateInterest}');
    expect(band).toBeGreaterThan(-1);
    expect(btn).toBeGreaterThan(-1);
    expect(Math.abs(band - btn)).toBeLessThan(600); // ayni JSX bolgesi
  });

  it('yeni hesap baslarken onceki sonuc ve hata SIFIRLANIR', () => {
    const seg = interestSegment();
    const head = seg.slice(0, seg.indexOf('try {'));
    expect(head).toContain('setInterestError(null)');
    expect(head).toContain('setInterestResult(null)');
  });
});

/**
 * BUG-2b — bulk accept tüm borçluları korur (stale-closure regresyon testi).
 *
 * Eski kod handleAcceptParty'de `onDebtorsChange([...selectedDebtors, x])` kullanıyordu;
 * handleAcceptAllDebtors döngüsünde her tur AYNI (bayat) selectedDebtors closure'ını okuyup
 * yalnız SONUNCU borçluyu bırakıyordu. Functional update (prev=>[...prev,x]) → hepsi korunur.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { useState } from 'react';

// CI-flake fix (ref #462): bu testlerin asenkron beklemeleri (findBy*/waitFor) ürün
// kodundaki kısa microtask zincirini bekler (scan fetch → 2× POST → 2× onDebtorsChange
// → 2× loadDebtors GET). İş HIZLI (izolede ~335ms); darboğaz DEĞİL. Tek sorun TIMEOUT
// HEADROOM: yüklü CI runner'da (paralel vitest worker'ları + disk/CPU contention) worker
// descheduled olup @testing-library default 1000ms ceiling'i aşabiliyor → "expected '0'
// to be '2'" + waitFor timeout (gözlenen: 2026-06-25 PR #486; rerun temiz = ürün bug'ı
// DEĞİL). Fix İKİ KATMAN: (1) per-wait ASYNC_WAIT ceiling (#488); (2) it()-seviye testTimeout
// (#489-FU). #488 yalnız (1)'i yaptı ama 3 ardışık waitFor'un KÜMÜLATİF süresi vitest default
// 5000ms TEST-timeout'unu aşabiliyor (#489'da "Test timed out in 5000ms" @5006ms gözlendi) →
// per-wait ceiling TEK BAŞINA yetmez. #490 it()-seviye 20000ms ekledi AMA #491'de İKİNCİ mod görüldü:
// count=2 waitFor'un KENDİ 5000ms ceiling'i (ASYNC_WAIT) yük altında yetmedi (count '0'da kaldı; rerun
// DA kırmızı). Bu yüzden HER İKİ knob cömertçe yükseltildi: per-wait 15000ms (count=2 async zinciri için
// bol headroom) + it()-seviye 60000ms (worst-case 3×15000=45000'i kapsar). SINIRLI → test hang edemez;
// kapsam/assertion zayıflatılmadı. (İzole koşu ~300ms; bu yalnız CI paralel-yük contention payı.)
const ASYNC_WAIT = { timeout: 15000 } as const;
const TEST_TIMEOUT = 60000;

const apiGet = vi.fn();
const apiPost = vi.fn();
vi.mock('@/lib/api', () => ({
  api: { get: (...a: any[]) => apiGet(...a), post: (...a: any[]) => apiPost(...a) },
}));

import { DebtorStep } from '../components/debtor/DebtorStep';
import type { CaseDebtor } from '../types/debtor';

function Harness() {
  const [debtors, setDebtors] = useState<CaseDebtor[]>([]);
  return (
    <div>
      <div data-testid="count">{debtors.length}</div>
      <DebtorStep selectedDebtors={debtors} onDebtorsChange={setDebtors} />
    </div>
  );
}

const SCAN_RESULT = {
  documentType: 'CEK',
  confidence: 90,
  suggestedCaseType: 'KAMBIYO',
  parties: [
    { name: 'Şükrü Akdoğan', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 },
    { name: 'Mehmet Demir', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 88 },
  ],
  debtInfo: { currency: 'TRY' },
  instruments: [],
};

describe('BUG-2b DebtorStep bulk accept', () => {
  beforeEach(() => {
    apiGet.mockReset();
    apiPost.mockReset();
    apiGet.mockResolvedValue({ data: { data: [] } }); // loadDebtors → boş rehber
    let n = 0;
    apiPost.mockImplementation(() => {
      n += 1;
      return Promise.resolve({ data: { data: { id: `d${n}`, type: 'INDIVIDUAL' } } });
    });
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ data: SCAN_RESULT }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('2 borçlu parti → "Tümünü Ekle" → ikisi de listede (count=2)', async () => {
    const { container } = render(<Harness />);

    // Sihirbazı aç
    fireEvent.click(screen.getByText('Evrak Tara'));

    // Dosya seç
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'cek.pdf', { type: 'application/pdf' });
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Tara → fetch (mock) → wizardResult
    fireEvent.click(await screen.findByText('Tara', undefined, ASYNC_WAIT));

    // DETERMİNİSTİK ÖNKOŞUL (flake kök-nedeni — #486/#489/#491): "Tümünü Ekle" butonu wizardResult set
    // olunca render olur, AMA handleAcceptAllDebtors'un iterate ettiği partyRows AYRI bir
    // useEffect([wizardResult]) ile dolar (DebtorStep.tsx ~286 + 525-536). Buton görünür görünmez tıklamak →
    // partyRows henüz BOŞ → targets=[] → 0 POST → count '0'da kalır (yük altında 15s+ rağmen). Çözüm: zamanla
    // DEĞİL OLAYLA bekle — parti satırları render olana dek bekle, SONRA tıkla. Parti adı <input value>
    // olarak render olur (DebtorStep.tsx:821) → findByText değil findByDisplayValue.
    await screen.findByDisplayValue('Şükrü Akdoğan', undefined, ASYNC_WAIT);
    await screen.findByDisplayValue('Mehmet Demir', undefined, ASYNC_WAIT);

    fireEvent.click(screen.getByText('Tümünü Ekle'));

    // Önce mock milestone (2 POST gitti), SONRA UI count — ikisi de zamanla değil olay-tamamlanmasıyla.
    // KRİTİK: ikisi de korunmalı (eski stale-closure 1 bırakırdı).
    await waitFor(() => expect(apiPost).toHaveBeenCalledTimes(2), ASYNC_WAIT);
    await waitFor(() => expect(screen.getByTestId('count').textContent).toBe('2'), ASYNC_WAIT);
  }, TEST_TIMEOUT);

  it('TEK KELİME isim → "Ekle" POST ETMEZ + hata GÖRÜNÜR + listeye eklenmez', async () => {
    const single = {
      ...SCAN_RESULT,
      parties: [{ name: 'Şükrü', type: 'INDIVIDUAL', role: 'BORCLU', confidence: 90 }],
    };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ data: single }) }),
    );

    const { container } = render(<Harness />);
    fireEvent.click(screen.getByText('Evrak Tara'));
    const fileInput = container.querySelector('input[type="file"]') as HTMLInputElement;
    fireEvent.change(fileInput, {
      target: { files: [new File(['x'], 'cek.pdf', { type: 'application/pdf' })] },
    });
    fireEvent.click(await screen.findByText('Tara', undefined, ASYNC_WAIT));

    // Per-party "Ekle" (Tümünü Ekle DEĞİL — o wizard'ı kapatıp hatayı gizlerdi)
    fireEvent.click(await screen.findByText('Ekle', { exact: true }, ASYNC_WAIT));

    // Hata sonuç panelinde GÖRÜNMELİ · POST yapılmamalı · liste boş kalmalı
    expect(await screen.findByText(/ad ve soyad ayrıştırılamadı/, undefined, ASYNC_WAIT)).toBeTruthy();
    expect(apiPost).not.toHaveBeenCalled();
    expect(screen.getByTestId('count').textContent).toBe('0');
  }, TEST_TIMEOUT);
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, cleanup, within } from '@testing-library/react';
import { BulkOperationsPanel } from '../BulkOperationsPanel';
import { api } from '@/lib/api';

/**
 * Güvenlik paketi 01 P1 (owner Ek 90 / Ek 91) — toplu UYAP gönderim sonucunun DOĞRU gösterimi.
 *
 * Gerçek UYAP taşıması YOKTUR (sunucu `dispatched:false` döner). Sonuç penceresi:
 *  - başarılı yerel simülasyonu "UYAP'a gönderildi" diye GÖSTERMEZ → "Yerel simülasyon; UYAP'a iletilmedi";
 *  - 400 (politika reddi, ör. vekalet / HACIZ_TALEBI) ve 403 (salt okur) yanıtlarını BAŞARISIZ ve sunucu iletisiyle gösterir.
 */

vi.mock('@/lib/api', () => ({
  api: {
    post: vi.fn(),
    changeCaseStatus: vi.fn(),
  },
}));

const mockedPost = (api as unknown as { post: ReturnType<typeof vi.fn> }).post;

const CASES = [
  { id: 'case-1', fileNumber: '2026/1', caseStatus: 'DERDEST' },
  { id: 'case-2', fileNumber: '2026/2', caseStatus: 'DERDEST' },
  { id: 'case-3', fileNumber: '2026/3', caseStatus: 'DERDEST' },
];

async function runUyapBulk() {
  render(<BulkOperationsPanel cases={CASES} />);
  fireEvent.change(screen.getByDisplayValue('İşlem seçin'), { target: { value: 'uyap' } });
  fireEvent.click(screen.getByRole('button', { name: 'Tümünü Seç' }));
  fireEvent.click(screen.getByRole('button', { name: /3 Dosya İçin İşlemi Başlat/ }));
  await screen.findByText('İşlem Sonuçları');
}

const row = (fileNumber: string) => {
  const dialog = screen.getByText('İşlem Sonuçları').closest('div.bg-white') as HTMLElement;
  const label = within(dialog).getByText(fileNumber);
  return label.parentElement as HTMLElement;
};

describe('BulkOperationsPanel — toplu UYAP sonucu doğru gösterilir (gerçek iletim yok)', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });
  afterEach(() => cleanup());

  it('201 yerel simülasyon → "Yerel simülasyon; UYAP\'a iletilmedi"; 400 / 403 → başarısız + sunucu iletisi; "UYAP\'a gönderildi" HİÇBİR yerde yok', async () => {
    mockedPost
      .mockResolvedValueOnce({ data: { success: true, requestId: 'r1', data: { simulated: true, dispatched: false, providerAccepted: false, legalEffectConfirmed: false } } })
      .mockRejectedValueOnce(new Error('Evrak gönderimi yapılamaz: UYAP işlemi için vekaletname gerekli.'))
      .mockRejectedValueOnce(new Error('Görüntüleyici (VIEWER) rolü bu alanda yazma veya yürütme işlemi yapamaz.'));

    await runUyapBulk();

    expect(mockedPost).toHaveBeenCalledTimes(3);
    expect(mockedPost.mock.calls.every(([path]) => path === '/uyap/document/submit')).toBe(true);

    expect(within(row('2026/1')).getByText("Yerel simülasyon; UYAP'a iletilmedi")).toBeTruthy();
    expect(within(row('2026/2')).getByText('Evrak gönderimi yapılamaz: UYAP işlemi için vekaletname gerekli.')).toBeTruthy();
    expect(within(row('2026/3')).getByText('Görüntüleyici (VIEWER) rolü bu alanda yazma veya yürütme işlemi yapamaz.')).toBeTruthy();
    expect(screen.getByText('1 başarılı, 2 başarısız')).toBeTruthy();
    expect(document.body.textContent).not.toContain("UYAP'a gönderildi");
  });

  it('sunucu success:false döndürürse başarısız sayılır (iletisiyle)', async () => {
    mockedPost.mockResolvedValue({ data: { success: false, errorMessage: 'UYAP yerel simülasyon hatası' } });

    await runUyapBulk();

    expect(screen.getByText('0 başarılı, 3 başarısız')).toBeTruthy();
    expect(within(row('2026/1')).getByText('UYAP yerel simülasyon hatası')).toBeTruthy();
    expect(document.body.textContent).not.toContain("UYAP'a gönderildi");
  });
});

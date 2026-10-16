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

/**
 * DV-198/e (owner Ek 94) — toplu panel aynı kurala uyar: Haciz Talebi / Takip Talebi genel evrak
 * seçeneklerinde YOK; belirsiz yanıt başarı veya iletim SAYILMAZ.
 */
/** Ek 95 / E1: belirsiz yanıt satırı — doğrulanamadı + mükerrer riski açıkça yazılır. */
const UNVERIFIED_ROW =
  'Sunucu yanıtı doğrulanamadı; UYAP iletimi iddia edilmez. Kayıt oluşmuş olabilir: yeniden göndermek mükerrer işlem oluşturabilir — önce dosya geçmişini kontrol edin';

describe('BulkOperationsPanel — DV-198/e belge türü seçenekleri ve belirsiz yanıt', () => {
  beforeEach(() => {
    mockedPost.mockReset();
  });
  afterEach(() => cleanup());

  it('belge türü listesinde Haciz Talebi ve Takip Talebi YOK; varsayılan DILEKCE ve istek bu türü taşır', async () => {
    mockedPost.mockResolvedValue({ data: { success: true, data: { simulated: true, dispatched: false } } });
    render(<BulkOperationsPanel cases={CASES} />);
    fireEvent.change(screen.getByDisplayValue('İşlem seçin'), { target: { value: 'uyap' } });

    const select = screen.getByRole('combobox', { name: 'Belge Türü' }) as HTMLSelectElement;
    const options = Array.from(select.options).map((o) => [o.value, o.textContent]);
    expect(options).toEqual([['DILEKCE', 'Dilekçe']]);
    expect(options.flat()).not.toContain('HACIZ_TALEBI');
    expect(options.flat()).not.toContain('TAKIP_TALEBI');
    expect(select.value).toBe('DILEKCE');

    fireEvent.click(screen.getByRole('button', { name: 'Tümünü Seç' }));
    fireEvent.click(screen.getByRole('button', { name: /3 Dosya İçin İşlemi Başlat/ }));
    await screen.findByText('İşlem Sonuçları');

    expect(mockedPost.mock.calls.map(([, body]) => body.documentType)).toEqual(['DILEKCE', 'DILEKCE', 'DILEKCE']);
  });

  it('belirsiz yanıt (dispatched yok / data yok / bozuk tip) → başarısız; iletim iddiası YOK', async () => {
    mockedPost
      .mockResolvedValueOnce({ data: { success: true, data: { simulated: true } } })
      .mockResolvedValueOnce({ data: { success: true } })
      .mockResolvedValueOnce({ data: { success: true, data: { dispatched: 'true' } } });

    await runUyapBulk();

    expect(screen.getByText('0 başarılı, 3 başarısız')).toBeTruthy();
    for (const fileNumber of ['2026/1', '2026/2', '2026/3']) {
      expect(within(row(fileNumber)).getByText(UNVERIFIED_ROW)).toBeTruthy();
    }
    expect(document.body.textContent).not.toContain("UYAP'a iletildi");
    expect(document.body.textContent).not.toContain("UYAP'a gönderildi");
    // Ek 95 / E1: otomatik tekrar YOK — her dosya için tam 1 istek.
    expect(mockedPost).toHaveBeenCalledTimes(3);
    expect(mockedPost.mock.calls.map(([, body]) => body.caseId)).toEqual(['case-1', 'case-2', 'case-3']);
  });

  it('Ek 95 / E1 — belirsiz yanıt satırında mükerrer uyarısı görünür; otomatik tekrar YOK (istek sayısı = 1)', async () => {
    render(<BulkOperationsPanel cases={[CASES[0]]} />);
    mockedPost.mockResolvedValue({ data: { success: true } });
    fireEvent.change(screen.getByDisplayValue('İşlem seçin'), { target: { value: 'uyap' } });
    fireEvent.click(screen.getByRole('button', { name: 'Tümünü Seç' }));
    fireEvent.click(screen.getByRole('button', { name: /1 Dosya İçin İşlemi Başlat/ }));
    await screen.findByText('İşlem Sonuçları');
    await new Promise((r) => setTimeout(r, 50));

    const text = within(row('2026/1')).getByText(UNVERIFIED_ROW).textContent ?? '';
    expect(text).toContain('Kayıt oluşmuş olabilir');
    expect(text).toContain('mükerrer işlem oluşturabilir');
    expect(screen.getByText('0 başarılı, 1 başarısız')).toBeTruthy();
    expect(mockedPost).toHaveBeenCalledTimes(1);
  });

  it('yalnız sunucu dispatched:true beyan ederse "UYAP\'a iletildi" yazılır', async () => {
    mockedPost
      .mockResolvedValueOnce({ data: { success: true, data: { simulated: false, dispatched: true } } })
      .mockResolvedValueOnce({ data: { success: true, data: { simulated: true, dispatched: false } } })
      .mockResolvedValueOnce({ data: { success: true, data: { simulated: true, dispatched: true } } });

    await runUyapBulk();

    expect(within(row('2026/1')).getByText("UYAP'a iletildi")).toBeTruthy();
    expect(within(row('2026/2')).getByText("Yerel simülasyon; UYAP'a iletilmedi")).toBeTruthy();
    expect(within(row('2026/3')).getByText(UNVERIFIED_ROW)).toBeTruthy();
    expect(screen.getByText('2 başarılı, 1 başarısız')).toBeTruthy();
  });
});

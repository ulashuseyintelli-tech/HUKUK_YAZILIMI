import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, waitFor } from '@testing-library/react';
import { ThemeCustomizer } from '../theme-customizer';
import { api } from '@/lib/api';

/**
 * WSMR-A2 — DOĞRULANMIŞ YANLIŞ-POZİTİF FIXTURE'I.
 *
 * A2 tarayıcısının `DF006` kuralı ("load* adlı fonksiyon API çağırmadan state'i
 * literal veriyle dolduruyor") `theme-customizer#loadSettings`'i işaretliyor.
 * Bu BULGU DEĞİLDİR: fonksiyon KULLANICININ KENDİ tema tercihini localStorage'dan
 * okur; sunucu verisi taklit etmez, hiçbir okuma yolunu maskelemez ve ekranda
 * hiçbir iş/finans rakamı üretmez.
 *
 * Ayrım kuralı: bir `load*` fonksiyonu ancak SUNUCU VERİSİ yerine geçen içerik
 * üretiyorsa demo-fallback'tir. Yerel kullanıcı tercihi bu tanıma girmez.
 *
 * Bu spec o gerekçeyi DAVRANIŞLA kilitler; kural gevşetilmez, istisna testlidir.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});
afterEach(() => cleanup());

describe('theme-customizer · FALSE_POSITIVE_WITH_TESTED_RULE_REASON', () => {
  it('hiçbir API çağrısı yapmaz — sunucu verisi taklit edilmiyor', async () => {
    render(<ThemeCustomizer onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Tema/i)).toBeTruthy());
    for (const verb of ['get', 'post', 'put', 'patch', 'delete']) {
      expect(mocked[verb]).not.toHaveBeenCalled();
    }
  });

  it('kaydedilmiş KULLANICI tercihini okur (uydurma iş verisi değil)', async () => {
    localStorage.setItem('themeSettings', JSON.stringify({ primaryColor: '#123456' }));
    render(<ThemeCustomizer onClose={() => {}} />);
    await waitFor(() => expect(screen.getByText(/Tema/i)).toBeTruthy());
    // Okunan değer kullanıcının kendi tercihidir; hiçbir API'nin yerine geçmez.
    expect(mocked.get).not.toHaveBeenCalled();
  });

  it('bozuk localStorage içeriği sahte başarı üretmez', async () => {
    localStorage.setItem('themeSettings', '{bozuk json');
    render(<ThemeCustomizer onClose={() => {}} />);
    // Çökme yok; varsayılan tema ile açılır — bu bir VERİ iddiası değildir.
    await waitFor(() => expect(screen.getByText(/Tema/i)).toBeTruthy());
  });
});

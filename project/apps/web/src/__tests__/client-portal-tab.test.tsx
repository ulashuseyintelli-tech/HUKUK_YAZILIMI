import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientPortalTab } from '@/components/client/client-portal-tab';
import { api } from '@/lib/api';

vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return {
    ...actual,
    api: {
      enablePortalAccess: vi.fn(),
      disablePortalAccess: vi.fn(),
    },
  };
});

const apiMock = api as unknown as {
  enablePortalAccess: ReturnType<typeof vi.fn>;
  disablePortalAccess: ReturnType<typeof vi.fn>;
};

describe('ClientPortalTab — durum rozeti', () => {
  beforeEach(() => vi.clearAllMocks());

  it('hasPortalAccess=true → "Aktif" rozeti gösterir', () => {
    render(<ClientPortalTab clientId="c1" hasPortalAccess={true} onChanged={vi.fn()} />);
    expect(screen.getByText('Portal Erişimi: Aktif')).toBeTruthy();
    expect(screen.getByText('Bu müvekkil portala giriş yapabilir.')).toBeTruthy();
  });

  it('hasPortalAccess=false → "Pasif" rozeti gösterir', () => {
    render(<ClientPortalTab clientId="c1" hasPortalAccess={false} onChanged={vi.fn()} />);
    expect(screen.getByText('Portal Erişimi: Pasif')).toBeTruthy();
    expect(screen.getByText('Bu müvekkil için portal erişimi henüz açılmamış.')).toBeTruthy();
  });

  it('hasPortalAccess undefined → "Pasif" olarak ele alınır (güvenli varsayılan)', () => {
    render(<ClientPortalTab clientId="c1" onChanged={vi.fn()} />);
    expect(screen.getByText('Portal Erişimi: Pasif')).toBeTruthy();
  });

  it('her durumda sabit yetki politikası notu gösterilir (owner kararı: proaktif buton gizleme yok)', () => {
    render(<ClientPortalTab clientId="c1" hasPortalAccess={false} onChanged={vi.fn()} />);
    expect(
      screen.getByText('Bu işlemi yalnız PARTNER veya yetkilendirilmiş avukat yapabilir.'),
    ).toBeTruthy();
  });
});

describe('ClientPortalTab — access YOK: enable formu (A2B)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('e-posta/şifre formu ve "Portal Erişimini Aç" butonu gösterilir', () => {
    render(<ClientPortalTab clientId="c1" hasPortalAccess={false} onChanged={vi.fn()} />);
    expect(screen.getByText('E-posta')).toBeTruthy();
    expect(screen.getByText('Şifre')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Portal Erişimini Aç' })).toBeTruthy();
  });

  it('boş alanlarla submit → BE çağrılmaz, inline validasyon mesajı gösterilir', async () => {
    render(<ClientPortalTab clientId="c1" hasPortalAccess={false} onChanged={vi.fn()} />);
    fireEvent.click(screen.getByRole('button', { name: 'Portal Erişimini Aç' }));
    await waitFor(() => expect(screen.getByText('E-posta ve şifre zorunludur.')).toBeTruthy());
    expect(apiMock.enablePortalAccess).not.toHaveBeenCalled();
  });

  it('geçerli form → api.enablePortalAccess çağrılır, başarıda onChanged tetiklenir', async () => {
    apiMock.enablePortalAccess.mockResolvedValue({ data: { success: true, portalUserId: 'pu-1' } });
    const onChanged = vi.fn();
    render(<ClientPortalTab clientId="c1" hasPortalAccess={false} onChanged={onChanged} />);

    fireEvent.change(document.querySelector('input[type="email"]')!, {
      target: { value: 'muvekkil@example.com' },
    });
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'sifre123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Portal Erişimini Aç' }));

    await waitFor(() =>
      expect(apiMock.enablePortalAccess).toHaveBeenCalledWith('c1', 'muvekkil@example.com', 'sifre123'),
    );
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('unauthorized (403) → generic alert YOK, backend\'in okunabilir hata mesajı inline gösterilir', async () => {
    apiMock.enablePortalAccess.mockRejectedValue(
      new Error('Portal erişimi yönetimi için yetki yok (PARTNER veya yetkilendirilmiş avukat gerekir)'),
    );
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(<ClientPortalTab clientId="c1" hasPortalAccess={false} onChanged={vi.fn()} />);

    fireEvent.change(document.querySelector('input[type="email"]')!, { target: { value: 'x@example.com' } });
    fireEvent.change(document.querySelector('input[type="password"]')!, { target: { value: 'sifre123' } });
    fireEvent.click(screen.getByRole('button', { name: 'Portal Erişimini Aç' }));

    await waitFor(() =>
      expect(
        screen.getByText('Portal erişimi yönetimi için yetki yok (PARTNER veya yetkilendirilmiş avukat gerekir)'),
      ).toBeTruthy(),
    );
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

describe('ClientPortalTab — access VAR: portalUser bilgisi + disable (A2B)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('confirm', vi.fn(() => true));
  });
  afterEach(() => vi.unstubAllGlobals());

  const portalUser = { email: 'muvekkil@example.com', lastLoginAt: '2026-06-01T10:00:00.000Z', loginCount: 4 };

  it('portalUser whitelist bilgisi (email/son giriş/toplam giriş) gösterilir', () => {
    render(
      <ClientPortalTab clientId="c1" hasPortalAccess={true} portalUser={portalUser} onChanged={vi.fn()} />,
    );
    expect(screen.getByText('muvekkil@example.com')).toBeTruthy();
    expect(screen.getByText('4')).toBeTruthy();
  });

  it('"Portal Erişimini Kaldır" butonu gösterilir, tıklanınca onay ister', async () => {
    apiMock.disablePortalAccess.mockResolvedValue({ data: { success: true } });
    const onChanged = vi.fn();
    render(
      <ClientPortalTab clientId="c1" hasPortalAccess={true} portalUser={portalUser} onChanged={onChanged} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Portal Erişimini Kaldır' }));
    await waitFor(() => expect(apiMock.disablePortalAccess).toHaveBeenCalledWith('c1'));
    await waitFor(() => expect(onChanged).toHaveBeenCalledTimes(1));
  });

  it('unauthorized (403) disable → okunabilir hata mesajı inline gösterilir, generic alert YOK', async () => {
    apiMock.disablePortalAccess.mockRejectedValue(new Error('Yetki yok'));
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    render(
      <ClientPortalTab clientId="c1" hasPortalAccess={true} portalUser={portalUser} onChanged={vi.fn()} />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Portal Erişimini Kaldır' }));
    await waitFor(() => expect(screen.getByText('Yetki yok')).toBeTruthy());
    expect(alertSpy).not.toHaveBeenCalled();
    alertSpy.mockRestore();
  });
});

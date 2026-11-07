import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within, waitFor } from '@testing-library/react';
import ClientsSettingsPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AA (Aday 1a) — `settings/clients/page.tsx:74` DF001.
 *
 * `/clients/lifecycle-eligibility` okuma hatasında `capabilities` `undefined` kalır (kaynak
 * yorumu: "erken bildirim"; API enforcement authority olarak KALIR). Kaynak inceleme doğruladı:
 * `disabled={capabilities ? !capabilities.canCreate : false}` → `undefined` iken "Manuel Ekle"
 * butonu ve `ClientModal`'ın `mutationBlocked` alanı KİLİTLENMEZ. Owner talebi: bu "fail-open"
 * tasarımı yalnız backend'in GERÇEK reddi kullanıcıya GÖRÜNÜR kalıyorsa güvenlidir — davranışsal
 * olarak kanıtlanmalı, kaynak/yorum okumasıyla YETİNİLMEMELİ.
 *
 * Akış: okuma hatası → capabilities=undefined → buton kilitli değil → kullanıcı yeni müvekkil
 * oluşturmayı dener → backend 403 reddeder → ret kullanıcıya görünür olur mu (handleSave catch
 * → alert)?
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

let searchParams = new URLSearchParams('');
vi.mock('next/navigation', () => ({
  useSearchParams: () => searchParams,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
}));

vi.mock('@/components/client/PoaScannerWizard', () => ({ PoaScannerWizard: () => null }));
vi.mock('@/components/bulk-email-modal', () => ({ BulkEmailModal: () => null }));

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

const CLIENT = { id: 'cli-1', type: 'PERSON', name: 'Ayşe Yılmaz', firstName: 'Ayşe', lastName: 'Yılmaz' };

beforeEach(() => {
  vi.clearAllMocks();
  searchParams = new URLSearchParams('');
  mockedApi.get.mockImplementation((url: string) => {
    const u = String(url);
    // capabilities OKUMA HATASI: undefined kalır (page.tsx:74 .catch).
    if (u.includes('lifecycle-eligibility')) return Promise.reject(new Error('network down'));
    if (u.startsWith('/clients')) return Promise.resolve({ data: { data: [CLIENT] } });
    return Promise.resolve({ data: { data: [] } });
  });
});
afterEach(() => cleanup());

describe('4a existing deactivation confirmation', () => {
  function eligible() {
    mockedApi.get.mockImplementation((url: string) => Promise.resolve({ data: { data:
      url.includes('lifecycle-eligibility') ? { eligible: true } : url.startsWith('/clients') ? [CLIENT] : [] } }));
  }
  it('warns about portal closure and separate reopening before any request; cancel leaves data untouched', async () => {
    eligible(); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    try {
      render(<ClientsSettingsPage />); fireEvent.click(await screen.findByTitle('Pasifleştir'));
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('portal erişimi de kapatılır'));
      expect(confirm).toHaveBeenCalledWith(expect.stringContaining('portalı kendiliğinden açmaz'));
      expect(api.delete).not.toHaveBeenCalled(); expect(screen.getByText('Ayşe Yılmaz')).toBeInTheDocument();
    } finally { confirm.mockRestore(); }
  });
  it('keeps a rejected deactivation visible and does not turn it into success', async () => {
    eligible(); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => {});
    vi.mocked(api.delete).mockRejectedValue(new Error('Pasifleştirme reddedildi'));
    try {
      render(<ClientsSettingsPage />); fireEvent.click(await screen.findByTitle('Pasifleştir'));
      await waitFor(() => expect(alert).toHaveBeenCalledWith('Pasifleştirme reddedildi'));
      expect(api.delete).toHaveBeenCalledWith('/clients/cli-1');
      expect(screen.getByText('Ayşe Yılmaz')).toBeInTheDocument();
    } finally { confirm.mockRestore(); alert.mockRestore(); }
  });
  it('refreshes the existing list only after confirmed server success', async () => {
    eligible(); const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(api.delete).mockImplementation(async () => {
      mockedApi.get.mockResolvedValue({ data: { data: [] } }); return { data: { success: true } } as any;
    });
    try {
      render(<ClientsSettingsPage />); fireEvent.click(await screen.findByTitle('Pasifleştir'));
      await waitFor(() => expect(screen.queryByText('Ayşe Yılmaz')).not.toBeInTheDocument());
      expect(api.delete).toHaveBeenCalledTimes(1);
    } finally { confirm.mockRestore(); }
  });
});

describe('ClientsSettingsPage — capabilities okuma hatası → kilitlenmiyor → backend reddi görünür mü', () => {
  it('capabilities undefined iken "Manuel Ekle" butonu KİLİTLİ DEĞİL', async () => {
    render(<ClientsSettingsPage />);
    await screen.findByText('Ayşe Yılmaz');
    const btn = await screen.findByTestId('client-manual-create');
    expect(btn).not.toBeDisabled();
  });

  it('backend 403 REDDİ: kullanıcı yine de oluşturmayı dener, ret GÖRÜNÜR olur (alert)', async () => {
    const alertSpy = vi.spyOn(window, 'alert').mockImplementation(() => {});
    mockedApi.post.mockRejectedValue(
      Object.assign(new Error('fallback'), {
        body: { message: 'Bu işlem için yetkiniz yok' },
        status: 403,
      })
    );

    render(<ClientsSettingsPage />);
    await screen.findByText('Ayşe Yılmaz');
    fireEvent.click(await screen.findByTestId('client-manual-create'));

    const heading = await screen.findByText('Yeni Müvekkil');
    const panel = heading.closest('.max-w-2xl') as HTMLElement;
    expect(panel).toBeTruthy();

    const textboxes = within(panel).getAllByRole('textbox');
    // Sıra: Ad, Soyad, TCKN (Şahıs varsayılan tür — Cinsiyet <select> textbox DEĞİL).
    fireEvent.change(textboxes[0], { target: { value: 'Test' } });
    fireEvent.change(textboxes[1], { target: { value: 'Kullanıcı' } });
    fireEvent.change(textboxes[2], { target: { value: '12345678901' } });
    fireEvent.change(within(panel).getByPlaceholderText('05XX XXX XX XX'), {
      target: { value: '05551112233' },
    });
    fireEvent.change(within(panel).getByPlaceholderText('ornek@email.com'), {
      target: { value: 'a@b.com' },
    });

    fireEvent.click(within(panel).getByTestId('client-modal-save'));

    await vi.waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/clients', expect.anything()));
    await vi.waitFor(() => expect(alertSpy).toHaveBeenCalled(), { timeout: 5000 });
    const shown = alertSpy.mock.calls.map((c) => String(c[0])).join(' | ');
    expect(shown).toMatch(/yetkiniz yok/);
  });
});

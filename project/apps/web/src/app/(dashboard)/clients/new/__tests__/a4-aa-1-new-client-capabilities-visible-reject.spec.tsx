import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import NewClientPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4-AA (Aday 1b) — `lib/client-mutation-capabilities.ts:66` DF001.
 *
 * `useClientMutationCapabilities()` hook'u `/clients/lifecycle-eligibility` okuma hatasında
 * `capabilities`'i `undefined` bırakır (kaynak yorumu: "erken bildirim"; API enforcement
 * authority olarak KALIR). Bu, `ClientForm`'un `mutationBlocked` hesabı üzerinden "Kaydet"
 * butonunu KİLİTLEMEZ. Owner talebi: bu "fail-open" tasarımı yalnız backend'in GERÇEK reddi
 * kullanıcıya GÖRÜNÜR kalıyorsa güvenlidir — davranışsal olarak kanıtlanmalı, kaynak/yorum
 * okumasıyla YETİNİLMEMELİ.
 *
 * Akış: okuma hatası → capabilities=undefined → buton kilitli değil → kullanıcı oluşturmayı
 * dener → backend 403 reddeder → ret DOM'da görünür olur mu?
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));

const push = vi.fn();
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push }),
}));

const mockedApi = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  post: ReturnType<typeof vi.fn>;
};

beforeEach(() => {
  vi.clearAllMocks();
  // capabilities OKUMA HATASI: hook undefined döner (bkz. client-mutation-capabilities.ts:66 catch).
  mockedApi.get.mockImplementation((url: string) => {
    if (String(url).includes('lifecycle-eligibility')) {
      return Promise.reject(new Error('network down'));
    }
    return Promise.resolve({ data: { data: [] } });
  });
});
afterEach(() => cleanup());

describe('NewClientPage — capabilities okuma hatası → kilitlenmiyor → backend reddi görünür mü', () => {
  it('capabilities undefined iken "Kaydet" butonu KİLİTLİ DEĞİL', async () => {
    render(<NewClientPage />);
    const submit = await screen.findByRole('button', { name: 'Kaydet' });
    await vi.waitFor(() => expect(mockedApi.get).toHaveBeenCalled());
    expect(submit).not.toBeDisabled();
    expect(screen.queryByTestId('client-form-mutation-blocked')).toBeNull();
  });

  it('backend 403 REDDİ: kullanıcı yine de oluşturmayı dener, ret ekranda GÖRÜNÜR olur', async () => {
    mockedApi.post.mockRejectedValue(
      Object.assign(new Error('fallback'), {
        body: { message: 'Bu işlem için yetkiniz yok' },
        status: 403,
      })
    );

    render(<NewClientPage />);
    await vi.waitFor(() => expect(mockedApi.get).toHaveBeenCalled());

    fireEvent.change(screen.getByLabelText(/^Ad/), { target: { value: 'Test' } });
    fireEvent.change(screen.getByLabelText(/^Soyad/), { target: { value: 'Kullanıcı' } });
    fireEvent.change(screen.getByLabelText(/^TCKN/), { target: { value: '12345678901' } });

    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));

    await vi.waitFor(() => expect(mockedApi.post).toHaveBeenCalledWith('/clients', expect.anything()));
    expect(await screen.findByText('Bu işlem için yetkiniz yok', {}, { timeout: 5000 })).toBeTruthy();
    expect(push).not.toHaveBeenCalled();
  });
});

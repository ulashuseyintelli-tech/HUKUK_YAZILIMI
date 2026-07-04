/**
 * TM3 Faz 7 — PayoutCreateModal idempotencyKey YAŞAM DÖNGÜSÜ kanıtı.
 *
 * Doğrulanan kontrat:
 *  - Her modal AÇILIŞI (fresh mount) → YENİ key  (A !== B) → ikinci ödeme eski key'i kullanmaz.
 *  - Aynı submit/retry boyunca → AYNI key (aynı payload idempotent retry).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayoutCreateModal } from '@/components/client-accounting/PayoutCreateModal';
import { clientAccountingApi } from '@/lib/api/client-accounting';

vi.mock('@/lib/api/client-accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-accounting')>();
  return {
    ...actual,
    clientAccountingApi: { ...actual.clientAccountingApi, createPayout: vi.fn() },
  };
});

const createPayoutMock = clientAccountingApi.createPayout as unknown as ReturnType<typeof vi.fn>;

function renderModal(overrides?: { outstanding?: string; onSuccess?: () => void }) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <PayoutCreateModal
        caseId="case-1"
        caseClientId="cc-1"
        currency="TRY"
        outstanding={overrides?.outstanding ?? '1000'}
        caseLabel="2024/1"
        onClose={vi.fn()}
        onSuccess={overrides?.onSuccess ?? vi.fn()}
      />
    </QueryClientProvider>,
  );
}

function fillAndConfirm(amount: string) {
  fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: amount } });
  fireEvent.click(screen.getByRole('button', { name: /^Devam$/ }));
  fireEvent.click(screen.getByRole('button', { name: /Onayla ve Kaydet/ }));
}

describe('PayoutCreateModal idempotencyKey lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    createPayoutMock.mockResolvedValue({ created: true, payoutId: 'p1' });
  });

  it('her modal açılışında (fresh mount) YENİ idempotencyKey üretir → A !== B', async () => {
    const first = renderModal();
    fillAndConfirm('400');
    await waitFor(() => expect(createPayoutMock).toHaveBeenCalledTimes(1));
    const keyA = createPayoutMock.mock.calls[0][0].idempotencyKey as string;
    expect(keyA).toBeTruthy();
    first.unmount();

    createPayoutMock.mockClear();
    const second = renderModal();
    fillAndConfirm('400');
    await waitFor(() => expect(createPayoutMock).toHaveBeenCalledTimes(1));
    const keyB = createPayoutMock.mock.calls[0][0].idempotencyKey as string;
    expect(keyB).toBeTruthy();

    expect(keyA).not.toEqual(keyB);
    second.unmount();
  });

  it('aynı submit/retry boyunca AYNI idempotencyKey kullanılır (k1 === k2)', async () => {
    // 1. submit backend reddi (örn. transient hata) → 2. submit (retry) başarılı; key DEĞİŞMEMELİ.
    createPayoutMock.mockRejectedValueOnce(new Error('gecici hata'));
    createPayoutMock.mockResolvedValueOnce({ created: true, payoutId: 'p1' });

    renderModal({ outstanding: '2000' });
    fillAndConfirm('1500');
    await waitFor(() => expect(createPayoutMock).toHaveBeenCalledTimes(1));

    // confirm adımında kalır (hata gösterilir); tekrar dene
    fireEvent.click(screen.getByRole('button', { name: /Onayla ve Kaydet/ }));
    await waitFor(() => expect(createPayoutMock).toHaveBeenCalledTimes(2));

    const k1 = createPayoutMock.mock.calls[0][0].idempotencyKey as string;
    const k2 = createPayoutMock.mock.calls[1][0].idempotencyKey as string;
    expect(k1).toBeTruthy();
    expect(k1).toEqual(k2);
  });
});

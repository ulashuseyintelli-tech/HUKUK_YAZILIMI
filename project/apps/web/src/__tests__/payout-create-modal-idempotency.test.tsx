/**
 * PAYOUT-APPROVAL-2 PR-2b — PayoutCreateModal artık requestPayout() çağırır (Tasarım B: yalnız
 * onay talebi oluşturur, ClientPayout HENÜZ YOK). idempotencyKey YAŞAM DÖNGÜSÜ kontratı AYNI kalır:
 *  - Her modal AÇILIŞI (fresh mount) → YENİ key  (A !== B) → ikinci talep eski key'i kullanmaz.
 *  - Aynı submit/retry boyunca → AYNI key (aynı payload idempotent retry).
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PayoutCreateModal } from '@/components/client-accounting/PayoutCreateModal';
import { clientAccountingApi, type RequestPayoutResult } from '@/lib/api/client-accounting';

vi.mock('@/lib/api/client-accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-accounting')>();
  return {
    ...actual,
    clientAccountingApi: { ...actual.clientAccountingApi, requestPayout: vi.fn() },
  };
});

const requestPayoutMock = clientAccountingApi.requestPayout as unknown as ReturnType<typeof vi.fn>;

function renderModal(overrides?: { outstanding?: string; onSuccess?: (result: RequestPayoutResult) => void }) {
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
  fireEvent.click(screen.getByRole('button', { name: /Onay Talebi Oluştur/ }));
}

describe('PayoutCreateModal — request happy path (PAYOUT-APPROVAL-2 PR-2b)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestPayoutMock.mockResolvedValue({ requested: true, approvalRequestId: 'oar-1', status: 'PENDING_APPROVAL' });
  });

  it('"Onay Talebi Oluştur" tıklanınca requestPayout() doğru payload ile çağrılır, ClientPayout değil OfficeApprovalRequest sonucu döner', async () => {
    const onSuccess = vi.fn();
    renderModal({ onSuccess });
    fillAndConfirm('400');

    await waitFor(() => expect(requestPayoutMock).toHaveBeenCalledTimes(1));
    expect(requestPayoutMock).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'case-1', caseClientId: 'cc-1', amount: '400', currency: 'TRY' }),
    );
    await waitFor(() => expect(onSuccess).toHaveBeenCalledWith({ requested: true, approvalRequestId: 'oar-1', status: 'PENDING_APPROVAL' }));
  });

  it('eski "Onayla ve Kaydet" metni artık YOK — buton "Onay Talebi Oluştur" olarak yeniden adlandırıldı', () => {
    renderModal();
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '400' } });
    fireEvent.click(screen.getByRole('button', { name: /^Devam$/ }));
    expect(screen.queryByRole('button', { name: /Onayla ve Kaydet/ })).toBeNull();
    expect(screen.getByRole('button', { name: /Onay Talebi Oluştur/ })).toBeTruthy();
  });
});

describe('PayoutCreateModal idempotencyKey lifecycle', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    requestPayoutMock.mockResolvedValue({ requested: true, approvalRequestId: 'oar-1', status: 'PENDING_APPROVAL' });
  });

  it('her modal açılışında (fresh mount) YENİ idempotencyKey üretir → A !== B', async () => {
    const first = renderModal();
    fillAndConfirm('400');
    await waitFor(() => expect(requestPayoutMock).toHaveBeenCalledTimes(1));
    const keyA = requestPayoutMock.mock.calls[0][0].idempotencyKey as string;
    expect(keyA).toBeTruthy();
    first.unmount();

    requestPayoutMock.mockClear();
    const second = renderModal();
    fillAndConfirm('400');
    await waitFor(() => expect(requestPayoutMock).toHaveBeenCalledTimes(1));
    const keyB = requestPayoutMock.mock.calls[0][0].idempotencyKey as string;
    expect(keyB).toBeTruthy();

    expect(keyA).not.toEqual(keyB);
    second.unmount();
  });

  it('aynı submit/retry boyunca AYNI idempotencyKey kullanılır (k1 === k2)', async () => {
    // 1. submit backend reddi (örn. transient hata) → 2. submit (retry) başarılı; key DEĞİŞMEMELİ.
    requestPayoutMock.mockRejectedValueOnce(new Error('gecici hata'));
    requestPayoutMock.mockResolvedValueOnce({ requested: true, approvalRequestId: 'oar-1', status: 'PENDING_APPROVAL' });

    renderModal({ outstanding: '2000' });
    fillAndConfirm('1500');
    await waitFor(() => expect(requestPayoutMock).toHaveBeenCalledTimes(1));

    // confirm adımında kalır (hata gösterilir); tekrar dene
    fireEvent.click(screen.getByRole('button', { name: /Onay Talebi Oluştur/ }));
    await waitFor(() => expect(requestPayoutMock).toHaveBeenCalledTimes(2));

    const k1 = requestPayoutMock.mock.calls[0][0].idempotencyKey as string;
    const k2 = requestPayoutMock.mock.calls[1][0].idempotencyKey as string;
    expect(k1).toBeTruthy();
    expect(k1).toEqual(k2);
  });
});

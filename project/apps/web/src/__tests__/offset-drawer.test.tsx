/**
 * TM3 Faz C C-2b — OffsetDrawer + OffsetHistoryPanel davranış kanıtı.
 * Doğrulanan kontrat:
 *  - D5: canApply=false → read-only (form disabled, "Partner/Manager" notu, Uygula yok).
 *  - D3/D4: preview kartı BACKEND değerlerini render eder (FE hesaplamaz); Uygula preview'dan ÖNCE pasif.
 *  - idempotency: apply retry boyunca AYNI key (preview'a kilitli).
 *  - History: REVERSAL→"İptal edildi" badge + İptal pasif; reverse modal reason≥10.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OffsetDrawer } from '@/components/client-accounting/OffsetDrawer';
import { OffsetHistoryPanel } from '@/components/client-accounting/OffsetHistoryPanel';
import { clientOffsetApi } from '@/lib/api/client-offset';

vi.mock('@/lib/api/client-offset', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-offset')>();
  return {
    ...actual, // friendlyOffsetError gerçek kalır
    clientOffsetApi: {
      getEligibility: vi.fn(),
      preview: vi.fn(),
      create: vi.fn(),
      reverse: vi.fn(),
      list: vi.fn(),
    },
  };
});

const api = clientOffsetApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const BUCKET = { payableCaseId: 'case-P', payableCaseClientId: 'cc-A', clientId: 'cl-1', currency: 'TRY', availableOutstanding: '10000', caseNumber: '2026/1', role: 'ALACAKLI' };
const EXPENSE = { expenseCaseId: 'case-E', expenseRequestId: 'er-1', clientId: 'cl-1', currency: 'TRY', unpaidAmount: '2000', caseNumber: '2026/2', requestStatus: 'PENDING' };
const PREVIEW = { payableBefore: '10000', payableAfter: '8000', expenseBefore: '2000', expenseAfter: '0', netBefore: '8000', netAfter: '8000', maxAmount: '2000', netUnchanged: true };

function renderDrawer(eligibility: any) {
  api.getEligibility.mockResolvedValue(eligibility);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OffsetDrawer clientId="cl-1" currency="TRY" isOpen onClose={vi.fn()} />
    </QueryClientProvider>,
  );
}

describe('OffsetDrawer — D5 read-only capability', () => {
  beforeEach(() => vi.clearAllMocks());

  it('canApply=false → read-only: "Partner / Manager" notu, Uygula/Önizle YOK, select disabled', async () => {
    renderDrawer({ clientId: 'cl-1', currency: 'TRY', canApply: false, eligiblePayableBuckets: [BUCKET], eligibleExpenseRequests: [EXPENSE] });
    await waitFor(() => expect(screen.getByText(/Partner \/ Manager/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /^Önizle$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Uygula$/ })).toBeNull();
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects[0].disabled).toBe(true);
  });
});

describe('OffsetDrawer — D3/D4 preview-driven (FE hesaplamaz)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Uygula preview ÖNCESİ pasif; Önizle → backend preview kartı render → Uygula aktif', async () => {
    api.preview.mockResolvedValue(PREVIEW);
    renderDrawer({ clientId: 'cl-1', currency: 'TRY', canApply: true, eligiblePayableBuckets: [BUCKET], eligibleExpenseRequests: [EXPENSE] });
    await waitFor(() => expect(screen.getByRole('button', { name: /^Önizle$/ })).toBeTruthy());

    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: 'cc-A' } }); // payable
    fireEvent.change(selects[1], { target: { value: 'er-1' } }); // expense
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '2000' } });

    // Uygula preview'dan önce pasif
    expect((screen.getByRole('button', { name: /^Uygula$/ }) as HTMLButtonElement).disabled).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: /^Önizle$/ }));
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1));
    // Preview kartı BACKEND değerlerini gösterir (FE hesaplamaz) — netUnchanged mesajı + azami tutar
    await waitFor(() => expect(screen.getByText(/Net pozisyon değişmeyecek/)).toBeTruthy());
    expect(screen.getByText(/Mahsup Önizleme/)).toBeTruthy();
    // Uygula artık aktif
    await waitFor(() => expect((screen.getByRole('button', { name: /^Uygula$/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('preview sonrası tutar değişince Uygula tekrar pasif (re-preview zorunlu)', async () => {
    api.preview.mockResolvedValue(PREVIEW);
    renderDrawer({ clientId: 'cl-1', currency: 'TRY', canApply: true, eligiblePayableBuckets: [BUCKET], eligibleExpenseRequests: [EXPENSE] });
    await waitFor(() => screen.getByRole('button', { name: /^Önizle$/ }));
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: 'cc-A' } });
    fireEvent.change(selects[1], { target: { value: 'er-1' } });
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: /^Önizle$/ }));
    await waitFor(() => expect((screen.getByRole('button', { name: /^Uygula$/ }) as HTMLButtonElement).disabled).toBe(false));
    // tutarı değiştir → preview geçersiz → Uygula pasif
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '1500' } });
    expect((screen.getByRole('button', { name: /^Uygula$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('apply retry boyunca AYNI idempotencyKey (preview-locked)', async () => {
    api.preview.mockResolvedValue(PREVIEW);
    api.create.mockRejectedValueOnce(new Error('gecici')).mockResolvedValueOnce({ created: true, offsetId: 'off-1' });
    renderDrawer({ clientId: 'cl-1', currency: 'TRY', canApply: true, eligiblePayableBuckets: [BUCKET], eligibleExpenseRequests: [EXPENSE] });
    await waitFor(() => screen.getByRole('button', { name: /^Önizle$/ }));
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    fireEvent.change(selects[0], { target: { value: 'cc-A' } });
    fireEvent.change(selects[1], { target: { value: 'er-1' } });
    fireEvent.change(screen.getByPlaceholderText('0,00'), { target: { value: '2000' } });
    fireEvent.click(screen.getByRole('button', { name: /^Önizle$/ }));
    await waitFor(() => expect((screen.getByRole('button', { name: /^Uygula$/ }) as HTMLButtonElement).disabled).toBe(false));

    fireEvent.click(screen.getByRole('button', { name: /^Uygula$/ }));
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole('button', { name: /^Uygula$/ })); // retry (preview hâlâ geçerli)
    await waitFor(() => expect(api.create).toHaveBeenCalledTimes(2));
    const k1 = api.create.mock.calls[0][0].idempotencyKey;
    const k2 = api.create.mock.calls[1][0].idempotencyKey;
    expect(k1).toBeTruthy();
    expect(k1).toEqual(k2);
  });
});

function renderHistory(list: any[], canApply = true) {
  api.list.mockResolvedValue(list);
  api.getEligibility.mockResolvedValue({ clientId: 'cl-1', currency: 'TRY', canApply, eligiblePayableBuckets: [], eligibleExpenseRequests: [] });
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OffsetHistoryPanel clientId="cl-1" currency="TRY" cases={[{ caseId: 'case-P', caseNumber: '2026/1' }, { caseId: 'case-E', caseNumber: '2026/2' }]} />
    </QueryClientProvider>,
  );
}

const APPLY_ROW = (over: any = {}) => ({ id: 'a1', clientId: 'cl-1', currency: 'TRY', amount: '500', kind: 'APPLY', payableCaseId: 'case-P', payableCaseClientId: 'cc-A', expenseCaseId: 'case-E', expenseRequestId: 'er-1', reversesOffsetId: null, reason: null, createdAt: '2026-06-20T00:00:00.000Z', ...over });
const REVERSAL_ROW = (over: any = {}) => ({ ...APPLY_ROW(), id: 'r1', kind: 'REVERSAL', reversesOffsetId: 'a1', reason: 'düzeltme yapıldı', ...over });

describe('OffsetHistoryPanel — D6 geçmiş + reverse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reverse-edilmiş APPLY → "İptal edildi" badge + İptal butonu pasif; REVERSAL → "İptal (geri alma)"', async () => {
    renderHistory([APPLY_ROW(), REVERSAL_ROW()], true);
    await waitFor(() => expect(screen.getByText('İptal edildi')).toBeTruthy());
    expect(screen.getByText('İptal (geri alma)')).toBeTruthy();
    const btn = screen.getByRole('button', { name: /^İptal$/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true); // a1 zaten reverse edilmiş
  });

  it('reverse-edilmemiş APPLY + canApply → İptal aktif; modal reason≥10 ile reverse çağrılır', async () => {
    api.reverse.mockResolvedValue({ created: true, offsetId: 'r9', reversesOffsetId: 'a2' });
    renderHistory([APPLY_ROW({ id: 'a2' })], true);
    await waitFor(() => expect(screen.getByText('Uygulandı')).toBeTruthy());
    const btn = screen.getByRole('button', { name: /^İptal$/ }) as HTMLButtonElement;
    expect(btn.disabled).toBe(false);
    fireEvent.click(btn);
    // modal açıldı; reason<10 → submit pasif
    const submit = () => screen.getByRole('button', { name: /Mahsubu İptal Et/ }) as HTMLButtonElement;
    await waitFor(() => expect(submit()).toBeTruthy());
    fireEvent.change(screen.getByPlaceholderText('Gerekçe…'), { target: { value: 'kısa' } });
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Gerekçe…'), { target: { value: 'yeterince uzun gerekçe' } });
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await waitFor(() => expect(api.reverse).toHaveBeenCalledTimes(1));
    expect(api.reverse.mock.calls[0][0]).toBe('a2'); // offsetId
    expect(api.reverse.mock.calls[0][1].reason).toMatch(/yeterince uzun/);
  });

  it('canApply=false → İptal butonu pasif (yetkisiz)', async () => {
    renderHistory([APPLY_ROW({ id: 'a3' })], false);
    await waitFor(() => expect(screen.getByText('Uygulandı')).toBeTruthy());
    expect((screen.getByRole('button', { name: /^İptal$/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

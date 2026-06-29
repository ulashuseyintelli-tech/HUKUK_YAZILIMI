/**
 * TM3 Faz C C-2A/C-2C — OffsetDrawer davranış kanıtı (Mahsup eligibility + apply + Geçmiş/reverse).
 * Doğrulanan kontrat:
 *  - D5: canApply=false → read-only (form disabled, "Partner/Manager" notu, Uygula yok).
 *  - D3/D4: preview kartı BACKEND değerlerini render eder (FE hesaplamaz); Uygula preview'dan ÖNCE pasif.
 *  - idempotency: apply retry boyunca AYNI key (preview'a kilitli).
 *  - C-2C: Geçmiş sekmesi read-only (herkese); İptal=reverse yalnız PARTNER/MANAGER (canApply) + reason≥10 modal.
 */
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OffsetDrawer } from '@/components/client-accounting/OffsetDrawer';
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

function renderDrawer(eligibility: any, history: any[] = [], initialSelection?: any) {
  api.getEligibility.mockResolvedValue(eligibility);
  api.list.mockResolvedValue(history);
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <OffsetDrawer clientId="cl-1" currency="TRY" isOpen onClose={vi.fn()} initialSelection={initialSelection} />
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

  it('DASH-7: preview kartı HER ZAMAN görünür — seçim/önizleme yokken placeholder', async () => {
    renderDrawer({ clientId: 'cl-1', currency: 'TRY', canApply: true, eligiblePayableBuckets: [BUCKET], eligibleExpenseRequests: [EXPENSE] });
    // Önizle'ye basılmadan: kart başlığı + placeholder metni görünür (boş beyaz alan değil)
    await waitFor(() => expect(screen.getByText(/Mahsup Önizleme/)).toBeTruthy());
    expect(screen.getByText(/Bir mahsup seçildiğinde önizleme burada oluşacaktır/)).toBeTruthy();
  });

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

describe('OffsetDrawer — S8-A initialSelection ön-doldurma', () => {
  beforeEach(() => vi.clearAllMocks());

  it('initialSelection iki bacağı + tutarı seed eder; Uygula yine preview ÖNCESİ pasif (D4 korunur)', async () => {
    api.preview.mockResolvedValue(PREVIEW);
    renderDrawer(
      { clientId: 'cl-1', currency: 'TRY', canApply: true, eligiblePayableBuckets: [BUCKET], eligibleExpenseRequests: [EXPENSE] },
      [],
      { payableCaseClientId: 'cc-A', expenseRequestId: 'er-1', amount: '2000' },
    );
    await waitFor(() => expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe('cc-A'));
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects[1].value).toBe('er-1');
    expect((screen.getByPlaceholderText('0,00') as HTMLInputElement).value).toBe('2000');
    // D4: önizleme yapılmadan Uygula pasif (seed, preview gate'ini ATLAMAZ)
    expect((screen.getByRole('button', { name: /^Uygula$/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: /^Önizle$/ }));
    await waitFor(() => expect(api.preview).toHaveBeenCalledTimes(1));
    await waitFor(() => expect((screen.getByRole('button', { name: /^Uygula$/ }) as HTMLButtonElement).disabled).toBe(false));
  });

  it('uygun-olmayan payable preset seed edilmez (bayat preset sessizce düşer; tutar da seed edilmez)', async () => {
    renderDrawer(
      { clientId: 'cl-1', currency: 'TRY', canApply: true, eligiblePayableBuckets: [BUCKET], eligibleExpenseRequests: [EXPENSE] },
      [],
      { payableCaseClientId: 'cc-GHOST', expenseRequestId: 'er-1', amount: '2000' },
    );
    await waitFor(() => expect((screen.getAllByRole('combobox')[1] as HTMLSelectElement).value).toBe('er-1'));
    expect((screen.getAllByRole('combobox')[0] as HTMLSelectElement).value).toBe(''); // ghost seed edilmedi
    expect((screen.getByPlaceholderText('0,00') as HTMLInputElement).value).toBe(''); // iki bacak geçerli değil → tutar yok
  });
});

const APPLY_ROW = (over: any = {}) => ({ id: 'a1', clientId: 'cl-1', currency: 'TRY', amount: '500', kind: 'APPLY', payableCaseId: 'case-P', payableCaseClientId: 'cc-A', expenseCaseId: 'case-E', expenseRequestId: 'er-1', reversesOffsetId: null, reason: null, createdAt: '2026-06-20T00:00:00.000Z', ...over });
const REVERSAL_ROW = (over: any = {}) => ({ ...APPLY_ROW(), id: 'r1', kind: 'REVERSAL', reversesOffsetId: 'a1', reason: 'düzeltme yapıldı', ...over });

async function gotoHistory() {
  fireEvent.click(await screen.findByRole('tab', { name: /Geçmiş/ }));
}

describe('OffsetDrawer — C-2C Geçmiş + reverse', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Geçmiş: reverse-edilmiş APPLY → "İptal edildi" + İptal disabled; REVERSAL → "İptal (geri alma)"', async () => {
    renderDrawer({ clientId: 'cl-1', currency: 'TRY', canApply: true, eligiblePayableBuckets: [], eligibleExpenseRequests: [] }, [APPLY_ROW(), REVERSAL_ROW()]);
    await gotoHistory();
    await waitFor(() => expect(screen.getByText('İptal edildi')).toBeTruthy());
    expect(screen.getByText('İptal (geri alma)')).toBeTruthy();
    // a1 zaten reverse edilmiş → İptal disabled
    expect((screen.getByRole('button', { name: /^İptal$/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('canApply + reverse-edilmemiş APPLY → İptal aktif; reason≥10 modal ile reverse(offsetId, {reason}) çağrılır', async () => {
    api.reverse.mockResolvedValue({ created: true, offsetId: 'r9', reversesOffsetId: 'a2' });
    renderDrawer({ clientId: 'cl-1', currency: 'TRY', canApply: true, eligiblePayableBuckets: [], eligibleExpenseRequests: [] }, [APPLY_ROW({ id: 'a2' })]);
    await gotoHistory();
    await waitFor(() => expect(screen.getByText('Uygulandı')).toBeTruthy());
    const iptal = screen.getByRole('button', { name: /^İptal$/ }) as HTMLButtonElement;
    expect(iptal.disabled).toBe(false);
    fireEvent.click(iptal);
    const submit = () => screen.getByRole('button', { name: /Mahsubu İptal Et/ }) as HTMLButtonElement;
    await waitFor(() => expect(submit()).toBeTruthy());
    // reason<10 → submit pasif; ≥10 → aktif
    fireEvent.change(screen.getByPlaceholderText('Gerekçe…'), { target: { value: 'kısa' } });
    expect(submit().disabled).toBe(true);
    fireEvent.change(screen.getByPlaceholderText('Gerekçe…'), { target: { value: 'yeterince uzun gerekçe' } });
    expect(submit().disabled).toBe(false);
    fireEvent.click(submit());
    await waitFor(() => expect(api.reverse).toHaveBeenCalledTimes(1));
    expect(api.reverse.mock.calls[0][0]).toBe('a2');
    expect(api.reverse.mock.calls[0][1].reason).toMatch(/yeterince uzun/);
  });

  it('canApply=false → Geçmiş görünür ama İptal disabled (READ tenant-level; mutation gated)', async () => {
    renderDrawer({ clientId: 'cl-1', currency: 'TRY', canApply: false, eligiblePayableBuckets: [], eligibleExpenseRequests: [] }, [APPLY_ROW({ id: 'a3' })]);
    await gotoHistory();
    await waitFor(() => expect(screen.getByText('Uygulandı')).toBeTruthy());
    expect((screen.getByRole('button', { name: /^İptal$/ }) as HTMLButtonElement).disabled).toBe(true);
  });
});

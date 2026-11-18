import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DueModal } from '@/components/finance/DueModal';
import { api } from '@/lib/api';
import { assertCaseClaimDraftCurrencies, caseClaimCurrencyMatches } from '@/lib/case-claim-currency';

vi.mock('@/lib/api', () => ({ api: { createDue: vi.fn(), updateDue: vi.fn(), deleteDue: vi.fn() } }));
beforeEach(() => { vi.clearAllMocks(); vi.spyOn(window, 'alert').mockImplementation(() => {}); });

describe('FR7 form currency admission', () => {
  it.each(['TRY', 'USD', 'EUR', 'GBP', 'CHF'])('accepts unchanged %s', currency => {
    expect(caseClaimCurrencyMatches(currency, currency)).toBe(true);
    expect(() => assertCaseClaimDraftCurrencies(currency, [{ currency }])).not.toThrow();
  });
  it.each(['TRY', 'EUR', '', null, 'usd'])('rejects explicit %p before legacy mapping drops the value', currency => {
    const raw = { currency, bakiyeTutar: 1000 };
    expect(() => assertCaseClaimDraftCurrencies('USD', [raw])).toThrow(/aynı/);
    expect(raw.currency).toBe(currency);
    expect(raw.bakiyeTutar).toBe(1000);
  });
  it('preserves old Due-only draft inheritance without treating a synthetic TRY wrapper as source data', () => {
    expect(() => assertCaseClaimDraftCurrencies('USD', [{ currency: 'TRY', __legacyDue: { amount: '1000' } }])).not.toThrow();
    expect(() => assertCaseClaimDraftCurrencies('USD', [{ __legacyDue: { amount: '1000', currency: 'TRY' } }])).toThrow();
  });
  it('retains a legacy mismatched record and prevents API/success/close effects', async () => {
    const onSuccess = vi.fn(), onClose = vi.fn();
    render(<DueModal isOpen caseId="case-usd" defaultCurrency="USD" due={{ id: 'legacy', type: 'PRINCIPAL', amount: 2000, currency: 'TRY', dueDate: '2026-01-01' }} onSuccess={onSuccess} onClose={onClose} />);
    const currency = screen.getAllByRole('combobox').find(x => (x as HTMLSelectElement).value === 'TRY')!;
    expect(currency).toBeDisabled();
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    expect(api.updateDue).not.toHaveBeenCalled();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('çevrilmedi'));
    expect(currency).toHaveValue('TRY');
  });
  it('API refusal remains visible and retains the current client form', async () => {
    vi.mocked(api.updateDue).mockRejectedValueOnce(new Error('CASE_CLAIM_CURRENCY_MISMATCH'));
    const onSuccess = vi.fn(), onClose = vi.fn();
    render(<DueModal isOpen caseId="case-usd" defaultCurrency="USD" due={{ id: 'same', type: 'PRINCIPAL', amount: 1000, currency: 'USD', dueDate: '2026-01-01' }} onSuccess={onSuccess} onClose={onClose} />);
    // Düzenlemede yalnız değişen alan gönderilir; değişiklik yoksa istek atılmaz → önce bir alan değiştirilir.
    fireEvent.change(screen.getByPlaceholderText('Opsiyonel açıklama'), { target: { value: 'açıklama' } });
    fireEvent.click(screen.getByRole('button', { name: 'Güncelle' }));
    await waitFor(() => expect(window.alert).toHaveBeenCalledWith(expect.stringContaining('CASE_CLAIM_CURRENCY_MISMATCH')));
    expect(api.updateDue).toHaveBeenCalledOnce();
    expect(onSuccess).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});

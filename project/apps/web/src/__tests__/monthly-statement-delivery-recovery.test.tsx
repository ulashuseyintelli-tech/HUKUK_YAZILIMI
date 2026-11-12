import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MonthlyStatementDeliveryRecovery, type MonthlyDeliveryRow } from '@/components/client-accounting/MonthlyStatementDeliveryRecovery';

const mocks = vi.hoisted(() => ({ recover: vi.fn() }));
vi.mock('@/lib/api/client-statement', () => ({ clientStatementApi: { recoverMonthlyDelivery: mocks.recover } }));
const row: MonthlyDeliveryRow = { statementId: 'statement-1', periodKey: '2026-10', attempts: 1, nextRetryAt: null, state: 'RETRY_ELIGIBLE', canRecover: true };

describe('CL-R07 monthly delivery operator boundary', () => {
  beforeEach(() => { mocks.recover.mockReset(); });
  afterEach(cleanup);

  it('missing backend evidence is unknown, never an empty successful list', () => {
    render(<MonthlyStatementDeliveryRecovery onRefresh={async () => {}} />);
    expect(screen.getByRole('status').textContent).toContain('Aylık teslim durumu doğrulanamadı.');
    expect(screen.queryByText('Aylık teslim kaydı yok.')).toBeNull(); expect(screen.queryByRole('button')).toBeNull();
  });

  it('uncertain and exhausted deliveries expose their boundary without a resend button', () => {
    render(<MonthlyStatementDeliveryRecovery rows={[{ ...row, state: 'RECONCILIATION_REQUIRED', canRecover: false },
      { ...row, statementId: 'other', state: 'EXHAUSTED', canRecover: false }]} onRefresh={async () => {}} />);
    expect(document.body.contains(screen.getByText(/Sonuç belirsiz/))).toBe(true); expect(document.body.contains(screen.getByText(/Deneme sınırı doldu/))).toBe(true);
    expect(screen.queryByRole('button')).toBeNull(); expect(mocks.recover).not.toHaveBeenCalled();
  });

  it('double click cannot issue two recoveries and sends only the statement identity', async () => {
    let complete!: (value: unknown) => void;
    mocks.recover.mockImplementation(() => new Promise(resolve => { complete = resolve; }));
    const refresh = vi.fn().mockResolvedValue(undefined);
    render(<MonthlyStatementDeliveryRecovery rows={[row]} onRefresh={refresh} />);
    const button = screen.getByRole('button', { name: 'Güvenli tekrar' }); fireEvent.click(button); fireEvent.click(button);
    expect(mocks.recover).toHaveBeenCalledTimes(1); expect(mocks.recover).toHaveBeenCalledWith('statement-1');
    await act(async () => complete({ enabled: true, target: { outcome: 'DELIVERED' } }));
    expect(document.body.contains(await screen.findByText('Sağlayıcı kabulü kaydedildi.'))).toBe(true); expect(refresh).toHaveBeenCalledTimes(1);
  });

  it('reconciliation is displayed as send-free evidence repair', async () => {
    mocks.recover.mockResolvedValue({ enabled: true, target: { outcome: 'RECONCILED' } });
    render(<MonthlyStatementDeliveryRecovery rows={[{ ...row, state: 'RECONCILE_SENT' }]} onRefresh={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Kanıtı uzlaştır' }));
    expect(document.body.contains(await screen.findByText(/Gönderim kanıtı uzlaştırıldı; yeni e-posta gönderilmedi/))).toBe(true);
  });

  it('403 remains a visible denial, never success or an empty list', async () => {
    mocks.recover.mockRejectedValue({ response: { status: 403, data: { message: 'Yetki reddedildi' } } });
    render(<MonthlyStatementDeliveryRecovery rows={[row]} onRefresh={async () => {}} />);
    fireEvent.click(screen.getByRole('button', { name: 'Güvenli tekrar' }));
    await waitFor(() => expect(screen.getByRole('status').textContent).toContain('Yetki reddedildi'));
    expect(screen.queryByText('Aylık teslim kaydı yok.')).toBeNull(); expect(screen.queryByText('Sağlayıcı kabulü kaydedildi.')).toBeNull();
  });

  it('refresh failure preserves the mutation result and cannot silently send again', async () => {
    mocks.recover.mockResolvedValue({ enabled: true, target: { outcome: 'RECONCILIATION_REQUIRED' } });
    render(<MonthlyStatementDeliveryRecovery rows={[row]} onRefresh={async () => { throw new Error('refresh failure'); }} />);
    fireEvent.click(screen.getByRole('button', { name: 'Güvenli tekrar' }));
    expect(document.body.contains(await screen.findByText(/Güncel görünüm yenilenemedi; tekrar gönderim başlatmadan listeyi yenileyin/))).toBe(true);
    expect(mocks.recover).toHaveBeenCalledTimes(1);
  });
});

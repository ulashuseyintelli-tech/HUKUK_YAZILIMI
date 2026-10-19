import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CollectionHistoryReport } from '../CollectionHistoryReport';

const { get } = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock('@/lib/api', () => ({ api: { get } }));
const money = (currency: string) => new Intl.NumberFormat('tr-TR', { style: 'currency', currency }).format(100);
function data(currency: string | null = 'USD') {
  return { data: { data: {
    currency,
    summary: { totalCollected: 100, totalPending: 0, totalCancelled: 0, collectionCount: 1, averageAmount: 100 },
    byChannel: [{ channel: 'BANKA', total: 100, count: 1, percentage: 100 }],
    bySource: [{ source: 'MANUAL', total: 100, count: 1, percentage: 100 }],
    byMonth: [],
    collections: [{ id: 'synthetic', date: '2026-10-18T00:00:00Z', amount: 100, currency, channel: 'BANKA', status: 'CONFIRMED' }],
    generatedAt: '2026-10-18T00:00:00Z',
  } } };
}
function mixed() {
  return Object.assign(new Error('Farklı para birimleri toplanamaz. Rapor için para birimi seçin.'), { body: { code: 'COLLECTION_CURRENCY_REQUIRED', message: 'Farklı para birimleri toplanamaz. Rapor için para birimi seçin.', currencies: ['TRY', 'USD'] } });
}
describe('Collection history currency boundary', () => {
  beforeEach(() => { get.mockReset(); });
  afterEach(cleanup);

  it('USD summary/channel/source/average and rows use USD, with no implicit TRY', async () => {
    get.mockResolvedValue(data('USD'));
    const { container } = render(<CollectionHistoryReport />);
    await screen.findByText('Son Tahsilatlar');
    expect(screen.getAllByText(money('USD')).length).toBeGreaterThanOrEqual(3);
    expect(container.textContent).not.toContain('₺');
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('mixed response requires an explicit selection; changing currency makes one scoped request', async () => {
    get.mockRejectedValueOnce(mixed()).mockResolvedValueOnce(data('USD')).mockResolvedValueOnce(data('TRY'));
    render(<CollectionHistoryReport />);
    await screen.findByText(/Farklı para birimleri toplanamaz/);
    expect(screen.queryByText('Son Tahsilatlar')).not.toBeInTheDocument();
    expect(get).toHaveBeenCalledTimes(1);
    fireEvent.change(screen.getByLabelText('Tahsilat raporu para birimi'), { target: { value: 'USD' } });
    await screen.findByText('Son Tahsilatlar');
    expect(get.mock.calls[1][0]).toContain('currency=USD');
    fireEvent.change(screen.getByLabelText('Tahsilat raporu para birimi'), { target: { value: 'TRY' } });
    await waitFor(() => expect(get).toHaveBeenCalledTimes(3));
    await waitFor(() => expect(screen.getAllByText(money('TRY')).length).toBeGreaterThanOrEqual(3));
    expect(get.mock.calls[2][0]).toContain('currency=TRY');
  });

  it('failed currency switch removes the previous currency figures instead of showing them under the new selection', async () => {
    get.mockRejectedValueOnce(mixed()).mockResolvedValueOnce(data('TRY')).mockRejectedValueOnce(new Error('synthetic read failure'));
    render(<CollectionHistoryReport />);
    await screen.findByText(/Farklı para birimleri toplanamaz/);
    fireEvent.change(screen.getByLabelText('Tahsilat raporu para birimi'), { target: { value: 'TRY' } });
    await screen.findByText('Son Tahsilatlar');
    fireEvent.change(screen.getByLabelText('Tahsilat raporu para birimi'), { target: { value: 'USD' } });
    await screen.findByText('synthetic read failure');
    expect(screen.queryByText('Son Tahsilatlar')).not.toBeInTheDocument();
    expect(screen.queryAllByText(money('TRY'))).toHaveLength(0);
    expect(get).toHaveBeenCalledTimes(3);
  });

  it('missing currency evidence does not label unknown amounts as TRY', async () => {
    get.mockResolvedValue(data(null));
    const { container } = render(<CollectionHistoryReport />);
    await screen.findByText('Son Tahsilatlar');
    expect(container.textContent).not.toContain('₺');
    expect(screen.getAllByText('—').length).toBeGreaterThanOrEqual(3);
  });

  it('a response for another currency is rejected instead of being displayed under the requested selection', async () => {
    get.mockRejectedValueOnce(mixed()).mockResolvedValueOnce(data('TRY'));
    render(<CollectionHistoryReport />);
    await screen.findByText(/Farklı para birimleri toplanamaz/);
    fireEvent.change(screen.getByLabelText('Tahsilat raporu para birimi'), { target: { value: 'USD' } });
    await screen.findByText('Rapor para birimi seçilen para birimiyle eşleşmiyor');
    expect(screen.queryByText('Son Tahsilatlar')).not.toBeInTheDocument();
    expect(screen.queryAllByText(money('TRY'))).toHaveLength(0);
  });

  it('a late earlier response cannot replace the latest selected currency', async () => {
    let finishOld!: (value: ReturnType<typeof data>) => void;
    get.mockRejectedValueOnce(mixed()).mockImplementationOnce(() => new Promise(resolve => { finishOld = resolve; })).mockResolvedValueOnce(data('TRY'));
    const { container } = render(<CollectionHistoryReport />);
    await screen.findByText(/Farklı para birimleri toplanamaz/);
    const select = screen.getByLabelText('Tahsilat raporu para birimi');
    fireEvent.change(select, { target: { value: 'USD' } });
    // Programmatic rapid second event also exercises the stale-response guard;
    // the native selector is disabled while loading for normal user input.
    fireEvent.change(select, { target: { value: 'TRY' } });
    await screen.findByText('Son Tahsilatlar');
    await act(async () => { finishOld(data('USD')); });
    await waitFor(() => expect(screen.getAllByText(money('TRY')).length).toBeGreaterThanOrEqual(3));
    expect(container.textContent).not.toContain(money('USD'));
    expect(select).toHaveValue('TRY');
  });
});

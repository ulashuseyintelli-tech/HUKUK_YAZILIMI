/**
 * TM3 Faz B-2 — ClientLevelStatementSection (Müvekkil Genel Ekstresi) testleri.
 *
 * Kontrat: listByClient besler · "Genel Ekstre Oluştur" → createClientLevel(clientId, period) ·
 * "Yenile" → supersede(id, period) · detayda label mapping (CLIENT_PAYMENT="Masraf Tahsil Edildi",
 * müvekkile ödeme DEĞİL) + borç/alacak kolon + "Ekstre Net Bakiyesi" · conflict mesajı · empty state.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientLevelStatementSection } from '@/components/client-accounting/ClientLevelStatementSection';
import { clientStatementApi, type ClientStatement } from '@/lib/api/client-statement';

vi.mock('@/lib/api/client-statement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-statement')>();
  return {
    ...actual,
    clientStatementApi: {
      ...actual.clientStatementApi,
      listByClient: vi.fn(),
      get: vi.fn(),
      createClientLevel: vi.fn(),
      supersede: vi.fn(),
    },
  };
});

const api = clientStatementApi as unknown as {
  listByClient: ReturnType<typeof vi.fn>;
  get: ReturnType<typeof vi.fn>;
  createClientLevel: ReturnType<typeof vi.fn>;
  supersede: ReturnType<typeof vi.fn>;
};

const CASES = [{ caseId: 'caseX', caseNumber: '2026/1' }];

const STMT: ClientStatement = {
  id: 'cl-1', caseId: null, clientId: 'c1', periodStart: '2026-01-01T00:00:00.000Z', periodEnd: '2026-06-30T23:59:59.000Z',
  openingBalance: '0', closingBalance: '-9201.6', currency: 'TRY', status: 'ACTIVE', supersededById: null, note: null,
  generatedById: 'u1', createdAt: '2026-06-28T10:00:00.000Z',
};
const STMT_WITH_LINES: ClientStatement = {
  ...STMT,
  lines: [
    { id: 'l1', lineDate: '2026-03-01T00:00:00.000Z', lineType: 'EXPENSE_REQUESTED', refType: 'ExpenseRequest', refId: 'er1', caseId: 'caseX', caseClientId: null, debit: '300', credit: '0', runningBalance: '-300', note: null },
    { id: 'l2', lineDate: '2026-04-01T00:00:00.000Z', lineType: 'CLIENT_PAYMENT', refType: 'ExpensePayment', refId: 'ep1', caseId: 'caseX', caseClientId: null, debit: '0', credit: '100', runningBalance: '-200', note: null },
  ],
};

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ClientLevelStatementSection clientId="c1" currency="TRY" cases={CASES} />
    </QueryClientProvider>,
  );
}

describe('ClientLevelStatementSection (Faz B-2)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.listByClient.mockResolvedValue([]);
    api.get.mockResolvedValue(STMT_WITH_LINES);
    api.createClientLevel.mockResolvedValue(STMT);
    api.supersede.mockResolvedValue({ ...STMT, id: 'cl-2' });
  });

  it('empty state → "Henüz genel ekstre yok"', async () => {
    renderSection();
    expect(await screen.findByText(/Henüz genel ekstre yok/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Genel Ekstre Oluştur/ })).toBeInTheDocument();
  });

  it('liste + "Ekstre Net Bakiyesi" başlığı', async () => {
    api.listByClient.mockResolvedValue([STMT]);
    renderSection();
    await screen.findByText('Aktif'); // status badge
    expect(screen.getByText('Ekstre Net Bakiyesi')).toBeInTheDocument(); // tablo başlığı
    expect(screen.getByText('1 aktif')).toBeInTheDocument();
  });

  it('Genel Ekstre Oluştur → createClientLevel(clientId, {periodStart,periodEnd ISO})', async () => {
    renderSection();
    await screen.findByText(/Henüz genel ekstre yok/);
    fireEvent.click(screen.getByRole('button', { name: /Genel Ekstre Oluştur/ }));
    // modal açıldı → Oluştur (default dönem dolu)
    fireEvent.click(await screen.findByRole('button', { name: /^Oluştur$/ }));
    await waitFor(() => expect(api.createClientLevel).toHaveBeenCalledTimes(1));
    const [clientId, payload] = api.createClientLevel.mock.calls[0];
    expect(clientId).toBe('c1');
    expect(typeof payload.periodStart).toBe('string');
    expect(payload.periodStart).toMatch(/T/); // ISO
    expect(payload.periodEnd).toMatch(/T/);
  });

  it('detay: label mapping (CLIENT_PAYMENT="Masraf Tahsil Edildi", müvekkile ödeme DEĞİL) + Dosya + borç/alacak', async () => {
    api.listByClient.mockResolvedValue([STMT]);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: /Görüntüle/ }));
    expect(await screen.findByText('Müvekkilden Masraf Talep Edildi')).toBeInTheDocument(); // EXPENSE_REQUESTED
    expect(screen.getByText('Masraf Tahsil Edildi')).toBeInTheDocument(); // CLIENT_PAYMENT (≠ müvekkile ödeme)
    expect(screen.queryByText(/Müvekkile Ödeme Yapıldı/)).toBeNull(); // bu satırlarda olmamalı
    const detailTable = screen.getAllByRole('table').at(-1)!;
    expect(within(detailTable).getByText('Borç')).toBeInTheDocument();
    expect(within(detailTable).getByText('Alacak')).toBeInTheDocument();
    expect(within(detailTable).getAllByText('2026/1').length).toBeGreaterThan(0); // Dosya kolonu (caseId→caseNumber)
  });

  it('Yenile → supersede(id, payload)', async () => {
    api.listByClient.mockResolvedValue([STMT]);
    renderSection();
    fireEvent.click(await screen.findByRole('button', { name: /^Yenile$/ })); // satır "Yenile" → modal aç
    // modal açıldı: hem satır hem modal-submit "Yenile" → sonuncu (modal submit) tıkla
    await waitFor(() => expect(screen.getAllByRole('button', { name: /^Yenile$/ }).length).toBeGreaterThan(1));
    const buttons = screen.getAllByRole('button', { name: /^Yenile$/ });
    fireEvent.click(buttons[buttons.length - 1]);
    await waitFor(() => expect(api.supersede).toHaveBeenCalledTimes(1));
    expect(api.supersede.mock.calls[0][0]).toBe('cl-1');
  });

  it('conflict → "zaten aktif bir genel ekstre var" mesajı', async () => {
    api.createClientLevel.mockRejectedValue(new Error('Bu dönem için aktif genel (client-level) ekstre zaten var. Yenilemek için Supersede kullanın.'));
    renderSection();
    await screen.findByText(/Henüz genel ekstre yok/);
    fireEvent.click(screen.getByRole('button', { name: /Genel Ekstre Oluştur/ }));
    fireEvent.click(await screen.findByRole('button', { name: /^Oluştur$/ }));
    expect(await screen.findByText(/zaten aktif bir genel ekstre var/i)).toBeInTheDocument();
  });
});

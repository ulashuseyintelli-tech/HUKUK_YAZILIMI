/**
 * TM3 Faz A-MOV-FE — ClientMovementsTable (Birleşik Hareketler) testleri.
 *
 * Doğrulanan kontrat:
 *  - movements endpoint'inden beslenir; default scope=client, page=1, pageSize=25.
 *  - Kapsam filtresi → group param; Dosya filtresi → scope=case + caseId; Tarih → from/to (to gün sonu).
 *  - CASE_CONTEXT satırı "Dosya geneli (müvekkile etki yok)" — işaretsiz/nötr (müvekkile gelen para gibi DEĞİL).
 *  - empty (filtreli/filtresiz ayrı mesaj) + error + pagination state.
 *  - UI hesap yapmaz; tutar/yön backend'den.
 */
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientMovementsTable } from '@/components/client-accounting/ClientMovementsTable';
import { clientAccountingApi, type ClientMovementsResult } from '@/lib/api/client-accounting';

vi.mock('@/lib/api/client-accounting', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-accounting')>();
  return {
    ...actual,
    clientAccountingApi: { ...actual.clientAccountingApi, getMovements: vi.fn() },
  };
});

const getMovementsMock = clientAccountingApi.getMovements as unknown as ReturnType<typeof vi.fn>;

const SAMPLE: ClientMovementsResult = {
  items: [
    {
      id: 'er:1', sourceType: 'EXPENSE_REQUEST', sourceId: '1', scopeGroup: 'CLIENT_SPECIFIC',
      occurredAt: '2026-03-01T10:00:00.000Z', caseId: 'cA', caseNo: '2026/1', caseClientId: null,
      label: 'Müvekkilden masraf talep edildi', description: null, amount: '1431.1', currency: 'TRY',
      clientEffect: 'INCREASE_CLIENT_EXPENSE_DEBT', status: 'PENDING',
    },
    {
      id: 'coll:1', sourceType: 'COLLECTION', sourceId: '1', scopeGroup: 'CASE_CONTEXT',
      occurredAt: '2026-02-01T00:00:00.000Z', caseId: 'cA', caseNo: '2026/1', caseClientId: null,
      label: 'Borçlu tahsilatı (dosya geneli)', description: null, amount: '5000', currency: 'TRY',
      clientEffect: 'NO_DIRECT_CLIENT_EFFECT', status: 'CONFIRMED',
    },
  ],
  page: 1, pageSize: 25, total: 2,
};

const CASES = [{ caseId: 'cA', caseNumber: '2026/1' }];

function renderTable() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ClientMovementsTable clientId="client-1" currency="TRY" cases={CASES} />
    </QueryClientProvider>,
  );
}

describe('ClientMovementsTable (Faz A-MOV-FE)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    getMovementsMock.mockResolvedValue(SAMPLE);
  });

  it('default: scope=client, page=1, pageSize=25 (group/caseId yok) ile çağrılır', async () => {
    renderTable();
    await waitFor(() => expect(getMovementsMock).toHaveBeenCalledTimes(1));
    const [clientId, params] = getMovementsMock.mock.calls[0];
    expect(clientId).toBe('client-1');
    expect(params).toMatchObject({ scope: 'client', page: 1, pageSize: 25, currency: 'TRY' });
    expect(params.group).toBeUndefined();
    expect(params.caseId).toBeUndefined();
  });

  it('satırları + kapsam etiketlerini render eder; CASE_CONTEXT nötr "etki yok"', async () => {
    renderTable();
    expect(await screen.findByText('Müvekkilden masraf talep edildi')).toBeInTheDocument();
    // tablo içine scope'la ("Müvekkile Özgü"/"Dosya Geneli" filtre option'larında da geçer)
    const table = screen.getByRole('table');
    expect(within(table).getByText('Borçlu tahsilatı (dosya geneli)')).toBeInTheDocument();
    expect(within(table).getByText('Müvekkile Özgü')).toBeInTheDocument();
    expect(within(table).getByText('Dosya Geneli')).toBeInTheDocument();
    // CASE_CONTEXT → işaretsiz nötr etiket (müvekkile gelen para gibi gösterilmez)
    expect(within(table).getByText('Dosya geneli (müvekkile etki yok)')).toBeInTheDocument();
    expect(screen.getByText('2 hareket')).toBeInTheDocument();
  });

  it('Kapsam filtresi → group param (Müvekkile Özgü = CLIENT_SPECIFIC)', async () => {
    renderTable();
    await waitFor(() => expect(getMovementsMock).toHaveBeenCalled());
    const groupSelect = screen.getAllByRole('combobox')[0];
    fireEvent.change(groupSelect, { target: { value: 'CLIENT_SPECIFIC' } });
    await waitFor(() => {
      const last = getMovementsMock.mock.calls.at(-1)![1];
      expect(last.group).toBe('CLIENT_SPECIFIC');
    });
  });

  it('Dosya filtresi → scope=case + caseId', async () => {
    renderTable();
    await waitFor(() => expect(getMovementsMock).toHaveBeenCalled());
    const caseSelect = screen.getAllByRole('combobox')[1];
    fireEvent.change(caseSelect, { target: { value: 'cA' } });
    await waitFor(() => {
      const last = getMovementsMock.mock.calls.at(-1)![1];
      expect(last.scope).toBe('case');
      expect(last.caseId).toBe('cA');
    });
  });

  it('Tarih sınırları SİMETRİK: from=gün başı (T00:00:00.000), to=gün sonu (T23:59:59.999)', async () => {
    const { container } = renderTable();
    await waitFor(() => expect(getMovementsMock).toHaveBeenCalled());
    const dateInputs = container.querySelectorAll('input[type="date"]');
    fireEvent.change(dateInputs[0], { target: { value: '2026-02-01' } });
    fireEvent.change(dateInputs[1], { target: { value: '2026-03-01' } });
    await waitFor(() => {
      const last = getMovementsMock.mock.calls.at(-1)![1];
      expect(last.from).toBe('2026-02-01T00:00:00.000');
      expect(last.to).toBe('2026-03-01T23:59:59.999');
    });
  });

  it('empty (filtresiz) → "hareket bulunmuyor"; filtre aktifken farklı mesaj + temizle', async () => {
    getMovementsMock.mockResolvedValue({ items: [], page: 1, pageSize: 25, total: 0 });
    renderTable();
    expect(await screen.findByText('Bu müvekkil için hareket bulunmuyor.')).toBeInTheDocument();
    // filtre uygula → mesaj değişir + temizle butonu çıkar
    fireEvent.change(screen.getAllByRole('combobox')[0], { target: { value: 'CASE_CONTEXT' } });
    expect(await screen.findByText('Seçili filtrelere uyan hareket yok.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Filtreleri temizle/ })).toBeInTheDocument();
  });

  it('error state → "Hareketler yüklenemedi."', async () => {
    getMovementsMock.mockRejectedValue(new Error('boom'));
    renderTable();
    expect(await screen.findByText('Hareketler yüklenemedi.')).toBeInTheDocument();
  });

  it('pagination: total > pageSize → Sonraki page=2 ile çağırır', async () => {
    getMovementsMock.mockResolvedValue({ ...SAMPLE, total: 60 });
    renderTable();
    const next = await screen.findByRole('button', { name: /^Sonraki$/ });
    fireEvent.click(next);
    await waitFor(() => {
      const last = getMovementsMock.mock.calls.at(-1)![1];
      expect(last.page).toBe(2);
    });
  });

  it('mutation/ekstre/mahsup/export tetikleyici YOK (yalnız getMovements çağrılır)', async () => {
    renderTable();
    await waitFor(() => expect(getMovementsMock).toHaveBeenCalled());
    // create/post türevi mock'lanmadı; ek bir api çağrısı yapılmamalı
    expect(within(document.body).queryByRole('button', { name: /Ekstre|Mahsup|İndir|Export|Dışa/ })).toBeNull();
  });
});

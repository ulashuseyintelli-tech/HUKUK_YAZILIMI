/**
 * Client Intake 4.7d-1 — IntelStatementSection (READ-ONLY) render kanıtı.
 * Doğrulanan: başlık her zaman; loading / empty / error state; kategori-gruplu liste;
 * aksiyon/mutation butonu YOK (read-only); muhasebe terimi yok.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntelStatementSection } from '@/components/case/IntelStatementSection';
import { clientIntelStatementApi } from '@/lib/api/client-intel-statement';

vi.mock('@/lib/api/client-intel-statement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-intel-statement')>();
  return { ...actual, clientIntelStatementApi: { listByCase: vi.fn(), get: vi.fn() } };
});

const api = clientIntelStatementApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderSection() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntelStatementSection caseId="case-1" />
    </QueryClientProvider>,
  );
}

const ROW = (over: Record<string, unknown> = {}) => ({
  id: 'cis-1', tenantId: 't', caseId: 'case-1', debtorId: 'd1',
  category: 'INCOME_SOURCE', label: null, value: 'Borçlu müteahhit', note: null,
  source: 'CLIENT_DECLARATION', confidence: 'DECLARED', status: 'ACTIVE',
  supersededById: null, supersededAt: null, revokedAt: null, revokedById: null, lifecycleNote: null,
  createdById: 'u1', createdAt: '2026-06-20T00:00:00.000Z', updatedAt: '2026-06-20T00:00:00.000Z', ...over,
});

describe('IntelStatementSection — read-only görünürlük', () => {
  beforeEach(() => vi.clearAllMocks());

  it('başlık + açıklama her zaman görünür (muhasebe terimi içermez)', () => {
    api.listByCase.mockReturnValue(new Promise(() => {})); // pending
    renderSection();
    expect(screen.getByText('Müvekkil İstihbaratı')).toBeTruthy();
    expect(screen.getByText(/analiz formlarından onaylanıp aktarılan/)).toBeTruthy();
  });

  it('loading state — Yükleniyor', () => {
    api.listByCase.mockReturnValue(new Promise(() => {})); // hiç resolve olmaz
    renderSection();
    expect(screen.getByText('Yükleniyor…')).toBeTruthy();
  });

  it('boş liste → boş-state metni', async () => {
    api.listByCase.mockResolvedValue([]);
    renderSection();
    await waitFor(() => expect(screen.getByText(/henüz doğrulanmış müvekkil istihbaratı yok/)).toBeTruthy());
  });

  it('hata → error state (yetki/boşluk dahil graceful)', async () => {
    api.listByCase.mockRejectedValue(new Error('forbidden'));
    renderSection();
    await waitFor(() => expect(screen.getByText(/İstihbarat bilgileri yüklenemedi/)).toBeTruthy());
  });

  it('veri → kategori gruplu + value render; AKSIYON BUTONU YOK (read-only)', async () => {
    api.listByCase.mockResolvedValue([
      ROW({ id: 'a', category: 'INCOME_SOURCE', value: 'Borçlu müteahhit' }),
      ROW({ id: 'b', category: 'STRATEGY', value: 'Önce haciz stratejisi' }),
    ]);
    renderSection();
    await waitFor(() => expect(screen.getByText('Borçlu müteahhit')).toBeTruthy());
    expect(screen.getByText('Önce haciz stratejisi')).toBeTruthy();
    expect(screen.getByText('Gelir Kaynağı')).toBeTruthy();
    expect(screen.getByText('Dosya Stratejisi')).toBeTruthy();
    // READ-ONLY: hiçbir buton/aksiyon yok (promote/retract/supersede önerilmez)
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});

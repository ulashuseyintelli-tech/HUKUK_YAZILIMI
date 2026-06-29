/**
 * Client Intake 4.7d-2a — IntelStatementSection (READ-ONLY) render kanıtı.
 * Doğrulanan: başlık her zaman; loading / empty / error; ACTIVE kategori-gruplu + "Geçerli" badge;
 * inactive (RETRACTED/FALSE_POSITIVE/SUPERSEDED) "Geçmiş / Pasif Kayıtlar" alanında badge'li;
 * supersede→"Yeni kayıtla güncellendi" + lifecycleNote→"Gerekçe:"; AKSIYON/MUTATION butonu YOK.
 */
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntelStatementSection } from '@/components/case/IntelStatementSection';
import { clientIntelStatementApi } from '@/lib/api/client-intel-statement';

vi.mock('@/lib/api/client-intel-statement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-intel-statement')>();
  return { ...actual, clientIntelStatementApi: { listByCase: vi.fn(), get: vi.fn(), listByCaseAllStatuses: vi.fn() } };
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

describe('IntelStatementSection — read-only görünürlük (4.7d-2a)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('başlık + açıklama her zaman görünür (muhasebe terimi içermez)', () => {
    api.listByCaseAllStatuses.mockReturnValue(new Promise(() => {})); // pending
    renderSection();
    expect(screen.getByText('Müvekkil İstihbaratı')).toBeTruthy();
    expect(screen.getByText(/analiz formlarından onaylanıp aktarılan/)).toBeTruthy();
  });

  it('loading state — Yükleniyor', () => {
    api.listByCaseAllStatuses.mockReturnValue(new Promise(() => {}));
    renderSection();
    expect(screen.getByText('Yükleniyor…')).toBeTruthy();
  });

  it('boş liste → boş-state metni', async () => {
    api.listByCaseAllStatuses.mockResolvedValue([]);
    renderSection();
    await waitFor(() => expect(screen.getByText(/henüz doğrulanmış müvekkil istihbaratı yok/)).toBeTruthy());
  });

  it('hata → error state (yetki/boşluk dahil graceful)', async () => {
    api.listByCaseAllStatuses.mockRejectedValue(new Error('forbidden'));
    renderSection();
    await waitFor(() => expect(screen.getByText(/İstihbarat bilgileri yüklenemedi/)).toBeTruthy());
  });

  it('ACTIVE → kategori gruplu + "Geçerli" badge; AKSIYON BUTONU YOK', async () => {
    api.listByCaseAllStatuses.mockResolvedValue([
      ROW({ id: 'a', category: 'INCOME_SOURCE', value: 'Borçlu müteahhit' }),
      ROW({ id: 'b', category: 'STRATEGY', value: 'Önce haciz stratejisi' }),
    ]);
    renderSection();
    await waitFor(() => expect(screen.getByText('Borçlu müteahhit')).toBeTruthy());
    expect(screen.getByText('Önce haciz stratejisi')).toBeTruthy();
    expect(screen.getByText('Gelir Kaynağı')).toBeTruthy();
    expect(screen.getByText('Dosya Stratejisi')).toBeTruthy();
    expect(screen.getAllByText('Geçerli').length).toBe(2); // her ACTIVE satırda status badge
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('INACTIVE → Geçmiş/Pasif Kayıtlar alanında badge ile gösterilir; AKSIYON BUTONU YOK', async () => {
    api.listByCaseAllStatuses.mockResolvedValue([
      ROW({ id: 'a', status: 'ACTIVE', value: 'Aktif beyan' }),
      ROW({ id: 'r', status: 'RETRACTED', value: 'Geri alınan beyan', revokedAt: '2026-06-21T00:00:00.000Z', lifecycleNote: 'müvekkil vazgeçti' }),
      ROW({ id: 'f', status: 'FALSE_POSITIVE', value: 'Yanlış çıkan beyan', revokedAt: '2026-06-22T00:00:00.000Z' }),
      ROW({ id: 's', status: 'SUPERSEDED', value: 'Eski beyan', supersededAt: '2026-06-23T00:00:00.000Z', supersededById: 'new-1' }),
    ]);
    renderSection();
    await waitFor(() => expect(screen.getByText(/Geçmiş \/ Pasif Kayıtlar/)).toBeTruthy());
    // inactive kayıtların value'ları görünür
    expect(screen.getByText('Geri alınan beyan')).toBeTruthy();
    expect(screen.getByText('Yanlış çıkan beyan')).toBeTruthy();
    expect(screen.getByText('Eski beyan')).toBeTruthy();
    // status badge etiketleri
    expect(screen.getByText('Geri alındı')).toBeTruthy();
    expect(screen.getByText('Yanlış kayıt')).toBeTruthy();
    expect(screen.getByText('Güncellendi')).toBeTruthy();
    // lifecycleNote + supersede işareti read-only
    expect(screen.getByText(/Gerekçe: müvekkil vazgeçti/)).toBeTruthy();
    expect(screen.getByText('Yeni kayıtla güncellendi')).toBeTruthy();
    // ACTIVE hâlâ görünür
    expect(screen.getByText('Aktif beyan')).toBeTruthy();
    // READ-ONLY: mutation/aksiyon butonu yok
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('yalnız inactive (ACTIVE yok) → "Geçerli kayıt yok" + Geçmiş alanı', async () => {
    api.listByCaseAllStatuses.mockResolvedValue([
      ROW({ id: 'r', status: 'RETRACTED', value: 'Geri alınan', revokedAt: '2026-06-21T00:00:00.000Z' }),
    ]);
    renderSection();
    await waitFor(() => expect(screen.getByText(/Geçerli \(aktif\) müvekkil istihbaratı yok/)).toBeTruthy());
    expect(screen.getByText('Geri alınan')).toBeTruthy();
    expect(screen.getByText(/Geçmiş \/ Pasif Kayıtlar/)).toBeTruthy();
  });
});

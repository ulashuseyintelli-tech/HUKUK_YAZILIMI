/**
 * Client Intake 4.7d-2a — IntelStatementSection render kanıtı.
 * Doğrulanan: başlık her zaman; loading / empty / error; ACTIVE kategori-gruplu + "Geçerli" badge;
 * inactive (RETRACTED/FALSE_POSITIVE/SUPERSEDED) "Geçmiş / Pasif Kayıtlar" alanında badge'li;
 * supersede→"Yeni kayıtla güncellendi" + lifecycleNote→"Gerekçe:"; INACTIVE satırlarda aksiyon YOK.
 * CLIENT-INTEL-DEBTOR-SURFACE-BUILD: debtor-scope (listByDebtorAllStatuses) + case/debtor XOR guard.
 * CLIENT-INTEL-4.7D-2: ACTIVE satırlarda geri-çek/yanlış-pozitif/düzelt aksiyonları + create formu
 * (bkz alt describe blokları).
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { IntelStatementSection } from '@/components/case/IntelStatementSection';
import { clientIntelStatementApi } from '@/lib/api/client-intel-statement';

vi.mock('@/lib/api/client-intel-statement', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api/client-intel-statement')>();
  return {
    ...actual,
    clientIntelStatementApi: {
      listByCase: vi.fn(),
      listByDebtor: vi.fn(),
      get: vi.fn(),
      listByCaseAllStatuses: vi.fn(),
      listByDebtorAllStatuses: vi.fn(),
      create: vi.fn(),
      retract: vi.fn(),
      markFalsePositive: vi.fn(),
      supersede: vi.fn(),
    },
  };
});

const api = clientIntelStatementApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

function renderSection(
  props: { caseId?: string; debtorId?: string; createCaseId?: string; createDebtorId?: string } = { caseId: 'case-1' },
) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <IntelStatementSection {...props} />
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

  it('ACTIVE → kategori gruplu + "Geçerli" badge; her satırda 3 lifecycle aksiyonu, create butonu YOK (canCreate=false)', async () => {
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
    // her ACTIVE satırda 3 aksiyon (Geri Çek / Yanlış Pozitif / Yerine Yeni Bilgi Koy) = 2 satır × 3
    expect(screen.getAllByRole('button', { name: /Geri Çek/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Yanlış Pozitif/i })).toHaveLength(2);
    expect(screen.getAllByRole('button', { name: /Yerine Yeni Bilgi Koy/i })).toHaveLength(2);
    // case-scope YALNIZ caseId ile: create hedefi (debtorId) çözülemez → create butonu YOK
    expect(screen.queryByRole('button', { name: /Yeni İstihbarat Ekle/i })).not.toBeInTheDocument();
  });

  it('INACTIVE → Geçmiş/Pasif Kayıtlar alanında badge ile gösterilir; INACTIVE satırlarda aksiyon YOK', async () => {
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
    // yalnız TEK bir ACTIVE satır var → tam olarak 3 aksiyon butonu (inactive satırlarda YOK)
    expect(screen.getAllByRole('button')).toHaveLength(3);
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

describe('IntelStatementSection — debtor-scope (CLIENT-INTEL-DEBTOR-SURFACE-BUILD)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('debtorId verilince listByDebtorAllStatuses çağrılır, listByCaseAllStatuses ÇAĞRILMAZ', async () => {
    api.listByDebtorAllStatuses.mockResolvedValue([
      ROW({ id: 'd1', category: 'STRATEGY', value: 'Borçlu ile ilgili strateji notu' }),
    ]);
    renderSection({ debtorId: 'debtor-1' });
    await waitFor(() => expect(screen.getByText('Borçlu ile ilgili strateji notu')).toBeTruthy());
    expect(api.listByDebtorAllStatuses).toHaveBeenCalledWith('debtor-1');
    expect(api.listByCaseAllStatuses).not.toHaveBeenCalled();
  });

  it('debtor-scope boş liste → "Bu borçlu için" boş-state metni (case-scope\'tan farklı)', async () => {
    api.listByDebtorAllStatuses.mockResolvedValue([]);
    renderSection({ debtorId: 'debtor-1' });
    await waitFor(() => expect(screen.getByText(/Bu borçlu için henüz doğrulanmış müvekkil istihbaratı yok/)).toBeTruthy());
  });

  it('hem caseId hem debtorId verilirse → kullanım-hatası guard\'ı, HİÇBİR sorgu atılmaz', () => {
    renderSection({ caseId: 'case-1', debtorId: 'debtor-1' });
    expect(screen.getByText(/Kullanım hatası/)).toBeTruthy();
    expect(api.listByCaseAllStatuses).not.toHaveBeenCalled();
    expect(api.listByDebtorAllStatuses).not.toHaveBeenCalled();
  });

  it('ne caseId ne debtorId verilirse → kullanım-hatası guard\'ı, HİÇBİR sorgu atılmaz', () => {
    renderSection({});
    expect(screen.getByText(/Kullanım hatası/)).toBeTruthy();
    expect(api.listByCaseAllStatuses).not.toHaveBeenCalled();
    expect(api.listByDebtorAllStatuses).not.toHaveBeenCalled();
  });
});

describe('IntelStatementSection — lifecycle mutations (CLIENT-INTEL-4.7D-2)', () => {
  beforeEach(() => vi.clearAllMocks());

  it('Geri Çek: doğru endpoint çağrılır, başarıda liste yeniden çekilir (invalidate)', async () => {
    api.listByCaseAllStatuses.mockResolvedValue([ROW({ id: 'a', value: 'Aktif beyan' })]);
    api.retract.mockResolvedValue({ ...ROW({ id: 'a' }), status: 'RETRACTED' });
    renderSection({ caseId: 'case-1' });
    await waitFor(() => expect(screen.getByText('Aktif beyan')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Geri Çek/i }));
    fireEvent.change(screen.getByPlaceholderText('Gerekçe (opsiyonel)'), { target: { value: 'müvekkil vazgeçti' } });
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));

    await waitFor(() => expect(api.retract).toHaveBeenCalledWith('a', { note: 'müvekkil vazgeçti' }));
    // invalidateQueries → aktif sorgu yeniden çalışır (ilk render + invalidate sonrası refetch = 2)
    await waitFor(() => expect(api.listByCaseAllStatuses).toHaveBeenCalledTimes(2));
  });

  it('Yanlış Pozitif: doğru endpoint çağrılır (not olmadan)', async () => {
    api.listByCaseAllStatuses.mockResolvedValue([ROW({ id: 'a', value: 'Aktif beyan' })]);
    api.markFalsePositive.mockResolvedValue({ ...ROW({ id: 'a' }), status: 'FALSE_POSITIVE' });
    renderSection({ caseId: 'case-1' });
    await waitFor(() => expect(screen.getByText('Aktif beyan')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Yanlış Pozitif/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));

    await waitFor(() => expect(api.markFalsePositive).toHaveBeenCalledWith('a', { note: undefined }));
  });

  it('Yerine Yeni Bilgi Koy (supersede): value ile doğru endpoint çağrılır, form eski value ile prefill olur', async () => {
    api.listByCaseAllStatuses.mockResolvedValue([ROW({ id: 'a', value: 'Eski bilgi', label: 'Eski başlık' })]);
    api.supersede.mockResolvedValue({ ...ROW({ id: 'a2' }), value: 'Yeni bilgi' });
    renderSection({ caseId: 'case-1' });
    await waitFor(() => expect(screen.getByText('Eski bilgi')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Yerine Yeni Bilgi Koy/i }));
    const valueInput = screen.getByPlaceholderText('Yeni bilgi (zorunlu)') as HTMLTextAreaElement;
    expect(valueInput.value).toBe('Eski bilgi'); // prefill
    fireEvent.change(valueInput, { target: { value: 'Güncellenmiş bilgi' } });
    fireEvent.click(screen.getByRole('button', { name: 'Düzelt' }));

    await waitFor(() =>
      expect(api.supersede).toHaveBeenCalledWith('a', { value: 'Güncellenmiş bilgi', label: 'Eski başlık', note: undefined }),
    );
  });

  it('mutasyon backend hatası (403) → UI\'da mesaj olduğu gibi gösterilir', async () => {
    api.listByCaseAllStatuses.mockResolvedValue([ROW({ id: 'a', value: 'Aktif beyan' })]);
    api.retract.mockRejectedValue(new Error('İstihbarat beyanının durumunu değiştirme yetkiniz yok (PARTNER veya yetkilendirilmiş avukat gerekir)'));
    renderSection({ caseId: 'case-1' });
    await waitFor(() => expect(screen.getByText('Aktif beyan')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Geri Çek/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));

    await waitFor(() =>
      expect(screen.getByText('İstihbarat beyanının durumunu değiştirme yetkiniz yok (PARTNER veya yetkilendirilmiş avukat gerekir)')).toBeTruthy(),
    );
  });

  it('debtor-scope: Geri Çek aynı şekilde çalışır (scope-agnostik aksiyon)', async () => {
    api.listByDebtorAllStatuses.mockResolvedValue([ROW({ id: 'd1', value: 'Borçlu beyanı', debtorId: 'debtor-1' })]);
    api.retract.mockResolvedValue({ ...ROW({ id: 'd1' }), status: 'RETRACTED' });
    renderSection({ debtorId: 'debtor-1' });
    await waitFor(() => expect(screen.getByText('Borçlu beyanı')).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Geri Çek/i }));
    fireEvent.click(screen.getByRole('button', { name: 'Onayla' }));

    await waitFor(() => expect(api.retract).toHaveBeenCalledWith('d1', { note: undefined }));
    await waitFor(() => expect(api.listByDebtorAllStatuses).toHaveBeenCalledTimes(2));
  });

  it('create butonu: yalnız hem case hem debtor hedefi çözülebiliyorsa görünür', async () => {
    api.listByCaseAllStatuses.mockResolvedValue([]);
    api.listByDebtorAllStatuses.mockResolvedValue([]);

    // case-scope + createDebtorId → görünür
    const { unmount: unmount1 } = renderSection({ caseId: 'case-1', createDebtorId: 'debtor-9' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Yeni İstihbarat Ekle/i })).toBeTruthy());
    unmount1();
    vi.clearAllMocks();

    // debtor-scope + createCaseId → görünür
    const { unmount: unmount2 } = renderSection({ debtorId: 'debtor-1', createCaseId: 'case-9' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Yeni İstihbarat Ekle/i })).toBeTruthy());
    unmount2();
    vi.clearAllMocks();

    // debtor-scope YALNIZ (createCaseId yok) → görünmez
    renderSection({ debtorId: 'debtor-1' });
    await waitFor(() => expect(screen.getByText(/henüz doğrulanmış/)).toBeTruthy());
    expect(screen.queryByRole('button', { name: /Yeni İstihbarat Ekle/i })).not.toBeInTheDocument();
  });

  it('Yeni İstihbarat Ekle: doğru caseId route + debtorId body ile create çağrılır, başarıda form kapanır', async () => {
    api.listByDebtorAllStatuses.mockResolvedValue([]);
    api.create.mockResolvedValue(ROW({ id: 'new-1', category: 'STRATEGY', value: 'Yeni gözlem' }));
    renderSection({ debtorId: 'debtor-1', createCaseId: 'case-9' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Yeni İstihbarat Ekle/i })).toBeTruthy());

    fireEvent.click(screen.getByRole('button', { name: /Yeni İstihbarat Ekle/i }));
    fireEvent.change(screen.getByPlaceholderText('İstihbarat bilgisi (zorunlu)'), { target: { value: 'Yeni gözlem' } });
    fireEvent.click(screen.getByRole('button', { name: 'Ekle' }));

    await waitFor(() =>
      expect(api.create).toHaveBeenCalledWith('case-9', {
        category: 'STRATEGY',
        value: 'Yeni gözlem',
        label: undefined,
        note: undefined,
        debtorId: 'debtor-1',
      }),
    );
    // başarı sonrası form kapanır → "Yeni İstihbarat Ekle" butonu tekrar görünür (form yerine)
    await waitFor(() => expect(screen.queryByPlaceholderText('İstihbarat bilgisi (zorunlu)')).not.toBeInTheDocument());
  });

  it('Ekle butonu boş value ile disabled kalır (client-side zorunlu alan)', async () => {
    api.listByCaseAllStatuses.mockResolvedValue([]);
    renderSection({ caseId: 'case-1', createDebtorId: 'debtor-9' });
    await waitFor(() => expect(screen.getByRole('button', { name: /Yeni İstihbarat Ekle/i })).toBeTruthy());
    fireEvent.click(screen.getByRole('button', { name: /Yeni İstihbarat Ekle/i }));
    expect(screen.getByRole('button', { name: 'Ekle' })).toBeDisabled();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';

/**
 * K3-L KP-8 (owner kararı 2026-10-01) — evrak taraması kullanıcı teyidi olmadan BORÇ YARATMAZ:
 *  - tek belge taraması `dues`'a anapara yazmaz, dosya para birimini değiştirmez; kayıt karar bekler;
 *  - çoklu taramada fatura / diğer belge `instruments[]`'a girmez (sunucu evrak olarak kabul etmez), karar bekler;
 *  - karar bekleyen kayıt varken dosya açılmaz; kullanıcı kaydı inceleyip kaleme çevirir, yalnız ek belge olarak tutar
 *    ya da çıkarır; DİĞER belgede alacak türü seçilmeden kalem oluşmaz (varsayılan tür yok);
 *  - kalem yalnız formda "Kalemi Listeye Ekle" ile oluşur; fatura no / tarih / KDV bilgisi kaleme taşınır;
 *  - aynı fatura iki kez listedeyse açılış yapılmaz (ikinci anapara oluşmaz).
 * Gerçek sayfa ve gerçek alacak kalemi formu render edilir; ağ, Next yönlendirme ve borçlu adımının tarama bileşeni
 * mock'tur (tarama bileşeni yalnız geri çağrıları tetikleyen saplamadır).
 */

vi.mock('@/lib/api', () => ({
  api: {
    getLawyers: vi.fn(),
    searchDebtors: vi.fn(),
    getNextFileNumber: vi.fn(),
    createCase: vi.fn(),
    previewCekFormation: vi.fn(),
    get: vi.fn(),
    post: vi.fn(),
    put: vi.fn(),
  },
}));

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(''),
  usePathname: () => '/cases/new',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/api/interest-engine', () => ({
  interestEngineApi: {
    preview: vi.fn(async () => ({
      success: true,
      data: { estimatedInterest: 0, currentRate: 0, days: 0, interestType: 'LEGAL_3095' },
      cached: false,
    })),
  },
  InterestTypeCode: {
    LEGAL_3095: 'LEGAL_3095',
    COMMERCIAL_AVANS_3095_2_2: 'COMMERCIAL_AVANS_3095_2_2',
    COMMERCIAL_FIXED: 'COMMERCIAL_FIXED',
    CONTRACTUAL: 'CONTRACTUAL',
    MEVDUAT_TL_BANKALARCA: 'MEVDUAT_TL_BANKALARCA',
    MEVDUAT_TL_KAMU: 'MEVDUAT_TL_KAMU',
  },
  requiresFixedRate: () => false,
  formatRate: (r: number) => String(r),
}));

vi.mock('@/lib/api/fee-engine', () => ({
  feeEngineApi: {
    preview: vi.fn(async () => ({ success: false, error: { code: 'UNAVAILABLE', message: 'test' }, cached: false })),
  },
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1' }, loading: false }),
}));

const SCAN_FATURA = { amount: 11800, currency: 'TRY', documentNo: 'FTR-9', issueDate: '2026-01-05', dueDate: '2026-02-01', kdvRate: 18, kdvAmount: 1800 };
const SCAN_USD = { amount: 500, currency: 'USD', documentNo: 'INV-1', dueDate: '2026-02-01' };
const SCAN_MULTI = [
  { type: 'CEK', documentNo: 'CK-1', amount: 1000, currency: 'TRY', issueDate: '2026-01-10', confidence: 0.9 },
  { type: 'FATURA', documentNo: 'FTR-9', amount: 11800, currency: 'TRY', issueDate: '2026-01-05', dueDate: '2026-02-01', confidence: 0.9 },
  { type: 'DIGER', documentNo: 'SZ-1', amount: 500, currency: 'TRY', issueDate: '2026-01-02', confidence: 0.9 },
];

/** Borçlu adımının tarama bileşeni yerine: yalnız sihirbazın geri çağrılarını tetikler. */
vi.mock('@/components/debtor', () => ({
  DebtorStep: (props: {
    onDebtInfoDetected?: (debtInfo: unknown, documentType?: string) => void;
    onInstrumentsDetected?: (instruments: unknown[]) => void;
  }) => (
    <div data-testid="stub-debtor-step">
      <button type="button" data-testid="stub-scan-single-fatura" onClick={() => props.onDebtInfoDetected?.(SCAN_FATURA, 'FATURA')}>tek fatura</button>
      <button type="button" data-testid="stub-scan-single-usd" onClick={() => props.onDebtInfoDetected?.(SCAN_USD, 'FATURA')}>tek fatura usd</button>
      <button type="button" data-testid="stub-scan-multi" onClick={() => props.onInstrumentsDetected?.(SCAN_MULTI)}>çoklu</button>
      <button type="button" data-testid="stub-scan-multi-cek-only" onClick={() => props.onInstrumentsDetected?.(SCAN_MULTI.slice(0, 1))}>çoklu yalnız çek</button>
    </div>
  ),
}));

const mocked = api as unknown as Record<
  'getLawyers' | 'searchDebtors' | 'getNextFileNumber' | 'createCase' | 'get' | 'post',
  ReturnType<typeof vi.fn>
>;

const LOOKUPS = {
  takipTuru: [{ id: 'tt-ilamsiz', name: 'İlamsız Genel Haciz', code: 'ILAMSIZ_GENEL' }],
  asama: [{ id: 'as-1', name: 'Dosya Açıldı', code: 'DOSYA_ACILDI' }],
  risk: [],
  durumEtiketi: [],
  mahiyetTipi: [],
};

function routeApi() {
  mocked.getLawyers.mockResolvedValue([]);
  mocked.searchDebtors.mockResolvedValue([]);
  mocked.getNextFileNumber.mockResolvedValue('2026/1');
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/lookups')) return Promise.resolve({ data: { data: LOOKUPS } });
    return Promise.resolve({ data: { data: [] } });
  });
  mocked.post.mockResolvedValue({ data: {} });
}

const DRAFT_KEY = 'case_wizard_draft:t1:u1';
const FORM_7 = { formCode: 'FORM_7', subFormCode: null };
const CASE_DATA = {
  fileNumber: '2026/7',
  takipTuruId: 'tt-ilamsiz',
  startDate: '2026-09-01',
  currency: 'TRY',
  interestType: 'YASAL',
  interestTypeSelected: true,
};
const seedDraft = (state: Record<string, unknown>) =>
  window.localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ caseData: CASE_DATA, formSelection: FORM_7, hesapTarihi: '2026-09-15', ...state, tenantId: 't1', userId: 'u1', savedAt: new Date().toISOString() }),
  );
const readDraft = () => JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null');
const waitDraft = (predicate: (d: any) => boolean) =>
  vi.waitFor(() => expect(predicate(readDraft())).toBe(true), { timeout: 5000 });

const FATURA_DRAFT = {
  id: 'd-fatura',
  kind: 'FATURA',
  documentType: 'FATURA',
  status: 'PENDING',
  amount: 11800,
  currency: 'TRY',
  documentNo: 'FTR-9',
  issueDate: '2026-01-05',
  dueDate: '2026-02-01',
  kdvRate: 18,
  kdvAmount: 1800,
  origin: 'OCR_SINGLE',
};
const DIGER_DRAFT = {
  id: 'd-diger',
  kind: 'DIGER',
  documentType: 'SOZLESME',
  status: 'PENDING',
  amount: 500,
  currency: 'TRY',
  documentNo: 'SZ-1',
  dueDate: '2026-03-01',
  origin: 'OCR_MULTI',
};
const FATURA_ITEM = (id: string) => ({
  id,
  raw: {
    kalemTuru: 'FATURA',
    toplamTutar: 11800,
    bakiyeTutar: 11800,
    currency: 'TRY',
    vadeTarihi: '2026-02-01',
    takipOncesiFaiz: 'YOK',
    takipSonrasiFaiz: 'YOK',
    faizsizGerekce: 'test',
    faturaBilgileri: { faturaNo: 'FTR-9', faturaTarihi: '2026-01-05' },
  },
});

const PENDING_ERROR = /karar bekliyor\. Tarama sonucu kendiliğinden alacak kalemi oluşturmaz/;
const rows = () => screen.queryAllByTestId('wizard-ocr-claim-draft-row');

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/cases/new');
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('K3-L KP-8: tarama kendiliğinden borç yaratmaz', () => {
  it('tek belge (fatura): `dues`\'a anapara YAZILMAZ; kayıt karar bekler (tutar, no, tarih, KDV korunur)', async () => {
    routeApi();
    seedDraft({ currentStep: 4 });
    render(<NewCasePage />);

    fireEvent.click(await screen.findByTestId('stub-scan-single-fatura'));

    await waitDraft((d) => d?.ocrClaimDrafts?.length === 1);
    const draft = readDraft();
    expect(draft.ocrClaimDrafts[0]).toMatchObject({
      kind: 'FATURA',
      status: 'PENDING',
      amount: 11800,
      currency: 'TRY',
      documentNo: 'FTR-9',
      issueDate: '2026-01-05',
      dueDate: '2026-02-01',
      kdvRate: 18,
      kdvAmount: 1800,
      origin: 'OCR_SINGLE',
    });
    expect(draft.dues ?? []).toEqual([]);
    expect(draft.claimDraftItems ?? []).toEqual([]);
    expect(draft.instruments ?? []).toEqual([]);
    // Adım uyarısı: kayıt alacak kalemleri adımında karar bekliyor
    expect(await screen.findByText(/1 kayıt alacak kalemleri adımında kararınızı bekliyor/)).toBeTruthy();
  });

  it('aynı belge ikinci kez taranırsa kuyrukta TEK kayıt kalır', async () => {
    routeApi();
    seedDraft({ currentStep: 4 });
    render(<NewCasePage />);

    const scan = await screen.findByTestId('stub-scan-single-fatura');
    fireEvent.click(scan);
    await waitDraft((d) => d?.ocrClaimDrafts?.length === 1);
    fireEvent.click(scan);
    await new Promise((r) => setTimeout(r, 50));
    expect(readDraft().ocrClaimDrafts).toHaveLength(1);
  });

  it('başka para birimindeki belge dosya para birimini DEĞİŞTİRMEZ; kayıt forma yüklenemez ve nedeni yazar', async () => {
    routeApi();
    seedDraft({ currentStep: 4 });
    render(<NewCasePage />);

    fireEvent.click(await screen.findByTestId('stub-scan-single-usd'));
    await waitDraft((d) => d?.ocrClaimDrafts?.length === 1);
    expect(readDraft().caseData.currency).toBe('TRY');
    expect(readDraft().dues ?? []).toEqual([]);

    cleanup();
    seedDraft({ ...readDraft(), currentStep: 5 });
    render(<NewCasePage />);
    const row = (await screen.findAllByTestId('wizard-ocr-claim-draft-row'))[0];
    expect(within(row).getByTestId('ocr-draft-currency-conflict')).toHaveTextContent('Belgenin para birimi USD, dosya para birimi TRY');
    expect((within(row).getByTestId('ocr-draft-review') as HTMLButtonElement).disabled).toBe(true);
  });

  it('çoklu tarama: çek evrak kaydına gider; fatura ve diğer belge `instruments[]`\'a GİRMEZ, karar bekler', async () => {
    routeApi();
    seedDraft({ currentStep: 4 });
    render(<NewCasePage />);

    fireEvent.click(await screen.findByTestId('stub-scan-multi'));

    await waitDraft((d) => d?.ocrClaimDrafts?.length === 2);
    const draft = readDraft();
    expect(draft.instruments.map((i: any) => i.type)).toEqual(['CEK']);
    expect(draft.ocrClaimDrafts.map((d: any) => [d.kind, d.status, d.origin])).toEqual([
      ['FATURA', 'PENDING', 'OCR_MULTI'],
      ['DIGER', 'PENDING', 'OCR_MULTI'],
    ]);
    expect(draft.dues ?? []).toEqual([]);

    // Yeniden tarama seçimi yeniler: yalnız çek seçilirse karar bekleyen çoklu kayıtlar da kalkar
    fireEvent.click(screen.getByTestId('stub-scan-multi-cek-only'));
    await waitDraft((d) => (d?.ocrClaimDrafts ?? []).length === 0);
    expect(readDraft().instruments.map((i: any) => i.type)).toEqual(['CEK']);
  });

  it('eski taslak: `instruments` içindeki fatura / diğer belge karar bekleyen kayda çevrilir; çek yerinde kalır', async () => {
    routeApi();
    seedDraft({
      currentStep: 5,
      instruments: [
        { type: 'CEK', amount: 1000, issueDate: '2026-01-10', documentNo: 'CK-1', currency: 'TRY' },
        { type: 'FATURA', amount: 11800, issueDate: '2026-01-05', documentNo: 'FTR-9', currency: 'TRY', dueDate: '2026-02-01' },
        { type: 'DIGER', amount: 500, issueDate: '2026-01-02', documentNo: 'SZ-1', currency: 'TRY' },
      ],
    });
    render(<NewCasePage />);

    await vi.waitFor(() => expect(rows()).toHaveLength(2));
    expect(rows().map((r) => r.getAttribute('data-kind'))).toEqual(['FATURA', 'DIGER']);
    await waitDraft((d) => d?.instruments?.length === 1 && d?.ocrClaimDrafts?.length === 2);
    expect(readDraft().instruments[0].type).toBe('CEK');
    expect(screen.getAllByTestId('wizard-ocr-instrument-row')).toHaveLength(1);
  });
});

describe('K3-L KP-8: karar bekleyen kayıt varken dosya açılmaz', () => {
  it('gönderim reddedilir ve nedeni yazar; kayıt çıkarılınca bu engel kalkar', async () => {
    routeApi();
    seedDraft({ currentStep: 5, ocrClaimDrafts: [FATURA_DRAFT] });
    render(<NewCasePage />);

    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    expect(screen.getByTestId('wizard-ocr-claim-drafts')).toHaveTextContent('Karar Bekleyen Kayıtlar (1)');
    expect(rows()[0]).toHaveTextContent('Fatura FTR-9 — 11.800,00 TRY');

    fireEvent.click(screen.getByRole('button', { name: 'Takibi Oluştur' }));
    expect(await screen.findByText(PENDING_ERROR)).toBeTruthy();
    expect(mocked.createCase).not.toHaveBeenCalled();

    fireEvent.click(screen.getByTestId('ocr-draft-remove'));
    await vi.waitFor(() => expect(rows()).toHaveLength(0));
    fireEvent.click(screen.getByRole('button', { name: 'Takibi Oluştur' }));
    await vi.waitFor(() => expect(screen.queryByText(PENDING_ERROR)).toBeNull());
    await waitDraft((d) => (d?.ocrClaimDrafts ?? []).length === 0);
    // Çıkarılan kayıt borç OLUŞTURMADI
    expect(readDraft().dues ?? []).toEqual([]);
    expect(readDraft().claimDraftItems ?? []).toEqual([]);
  });

  it('DİĞER belge: alacak türü seçilmeden incelenemez (varsayılan tür yok); "yalnız ek belge" kararı borç oluşturmaz ve engeli kaldırır', async () => {
    routeApi();
    seedDraft({ currentStep: 5, ocrClaimDrafts: [DIGER_DRAFT] });
    render(<NewCasePage />);

    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    const row = rows()[0];
    expect(row).toHaveTextContent('Sözleşme SZ-1');
    const kind = within(row).getByTestId('ocr-draft-kind') as HTMLSelectElement;
    expect(kind.value).toBe('');
    expect((within(row).getByTestId('ocr-draft-review') as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(kind, { target: { value: 'ASIL_ALACAK' } });
    expect((within(row).getByTestId('ocr-draft-review') as HTMLButtonElement).disabled).toBe(false);

    fireEvent.click(within(row).getByTestId('ocr-draft-document-only'));
    await waitDraft((d) => d?.ocrClaimDrafts?.[0]?.status === 'DOCUMENT_ONLY');
    expect(rows()[0].getAttribute('data-status')).toBe('DOCUMENT_ONLY');
    expect(screen.getByTestId('ocr-draft-document-only-note')).toHaveTextContent('alacak kalemi oluşturmaz');
    expect(screen.getByTestId('wizard-ocr-claim-drafts')).toHaveTextContent('Karar Bekleyen Kayıtlar (0)');

    fireEvent.click(screen.getByRole('button', { name: 'Takibi Oluştur' }));
    await vi.waitFor(() => expect(screen.queryByText(PENDING_ERROR)).toBeNull());
    expect(readDraft().dues ?? []).toEqual([]);
    expect(readDraft().claimDraftItems ?? []).toEqual([]);

    // Karar geri alınabilir → yeniden karar bekler
    fireEvent.click(screen.getByTestId('ocr-draft-reopen'));
    await waitDraft((d) => d?.ocrClaimDrafts?.[0]?.status === 'PENDING');
  });

  it('durumu tanınmayan kayıtlı taslak karar verilmiş SAYILMAZ (bekler)', async () => {
    routeApi();
    seedDraft({ currentStep: 5, ocrClaimDrafts: [{ ...FATURA_DRAFT, status: 'APPROVED' }] });
    render(<NewCasePage />);

    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    expect(rows()[0].getAttribute('data-status')).toBe('PENDING');
    fireEvent.click(screen.getByRole('button', { name: 'Takibi Oluştur' }));
    expect(await screen.findByText(PENDING_ERROR)).toBeTruthy();
    expect(mocked.createCase).not.toHaveBeenCalled();
  });
});

describe('K3-L KP-8: kalem yalnız kullanıcı incelemesiyle oluşur', () => {
  it('fatura kaydı forma yüklenir; "Kalemi Listeye Ekle" ile kalem oluşur, kayıt kuyruktan düşer, fatura no / tarih / KDV kaleme taşınır', async () => {
    routeApi();
    seedDraft({ currentStep: 5, ocrClaimDrafts: [FATURA_DRAFT] });
    render(<NewCasePage />);

    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(screen.getByTestId('ocr-draft-review'));
    expect(await screen.findByTestId('ocr-draft-in-editor')).toBeTruthy();
    // Forma yüklemek tek başına kalem OLUŞTURMAZ; kayıt hâlâ karar bekler
    expect(readDraft().claimDraftItems ?? []).toEqual([]);
    expect(readDraft().dues ?? []).toEqual([]);

    // Form kaydı gösterir (fatura türü, tutar, fatura no)
    expect((await screen.findByDisplayValue('FTR-9')) as HTMLInputElement).toBeTruthy();

    // Formun hesabı bitince (gecikmeli) kalem eklenebilir
    await vi.waitFor(
      () => {
        fireEvent.click(screen.getByRole('button', { name: '+ Kalemi Listeye Ekle' }));
        expect(readDraft().claimDraftItems?.length).toBe(1);
      },
      { timeout: 8000, interval: 300 },
    );

    await waitDraft((d) => (d?.ocrClaimDrafts ?? []).length === 0);
    const draft = readDraft();
    expect(draft.claimDraftItems[0].raw).toMatchObject({
      kalemTuru: 'FATURA',
      bakiyeTutar: 11800,
      ocrDraftId: 'd-fatura',
      ocrBelgeTuru: 'FATURA',
      faturaBilgileri: { faturaNo: 'FTR-9', faturaTarihi: '2026-01-05' },
    });
    expect(draft.dues).toHaveLength(1);
    expect(draft.dues[0]).toMatchObject({
      type: 'PRINCIPAL',
      amount: '11800',
      dueDate: '2026-02-01',
      sourceDocumentNo: 'FTR-9',
      sourceDocumentType: 'FATURA',
      issueDate: '2026-01-05',
      hasKdv: true,
      kdvRate: 18,
      kdvAmount: 1800,
    });
    expect(rows()).toHaveLength(0);
    expect(screen.getByTestId('claim-item-ocr-source')).toHaveTextContent('Kaynak: evrak tarama (incelendi)');
  }, 20000);

  it('forma yüklenmiş kayıt çıkarılırsa form da boşalır — taramadan gelen değer onaysız kaleme dönüşmez', async () => {
    routeApi();
    seedDraft({ currentStep: 5, ocrClaimDrafts: [FATURA_DRAFT] });
    render(<NewCasePage />);

    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(screen.getByTestId('ocr-draft-review'));
    expect(await screen.findByDisplayValue('FTR-9')).toBeTruthy();

    fireEvent.click(screen.getByTestId('ocr-draft-remove'));
    await vi.waitFor(() => expect(rows()).toHaveLength(0));
    await vi.waitFor(() => expect(screen.queryByDisplayValue('FTR-9')).toBeNull());
    // Formun gecikmeli hesabı geçtikten sonra da kalem / due oluşmamış olmalı
    await new Promise((r) => setTimeout(r, 900));
    expect(readDraft().claimDraftItems ?? []).toEqual([]);
    expect(readDraft().dues ?? []).toEqual([]);
  }, 20000);
});

describe('K3-L KP-8: formda kalan tarama değeri onaysız kaleme dönüşmez', () => {
  const MULTI_FATURA = { ...FATURA_DRAFT, id: 'd-multi', origin: 'OCR_MULTI' };
  const goBackToDebtors = () => fireEvent.click(screen.getByRole('button', { name: /Geri/ }));
  const goForward = () => fireEvent.click(screen.getByRole('button', { name: /İleri/ }));

  it('yeniden taramada seçilmeyen kayıt formdaysa form boşalır; gönderim taramadan kalem ÜRETMEZ', async () => {
    routeApi();
    seedDraft({ currentStep: 5, ocrClaimDrafts: [MULTI_FATURA] });
    render(<NewCasePage />);

    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(screen.getByTestId('ocr-draft-review'));
    expect(await screen.findByDisplayValue('FTR-9')).toBeTruthy();

    // Borçlular adımına dönüp yalnız çeki seçerek yeniden tara → fatura kaydı kuyruktan düşer
    goBackToDebtors();
    fireEvent.click(await screen.findByTestId('stub-scan-multi-cek-only'));
    await waitDraft((d) => (d?.ocrClaimDrafts ?? []).length === 0 && d?.instruments?.length === 1);
    goForward();

    await screen.findByRole('button', { name: 'Takibi Oluştur' });
    expect(rows()).toHaveLength(0);
    await vi.waitFor(() => expect(screen.queryByDisplayValue('FTR-9')).toBeNull());
    // Formun gecikmeli hesabı geçtikten sonra gönder: taramadan kalan değer listeye ALINMAMALI
    await new Promise((r) => setTimeout(r, 900));
    fireEvent.click(screen.getByRole('button', { name: 'Takibi Oluştur' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(readDraft().claimDraftItems ?? []).toEqual([]);
    expect(readDraft().dues ?? []).toEqual([]);
    expect(mocked.createCase).not.toHaveBeenCalled();
  }, 20000);

  it('aynı belge yeniden taranınca formdaki kayıtla bağ korunur; "yalnız ek belge" denince form boşalır ve kalem oluşmaz', async () => {
    routeApi();
    seedDraft({ currentStep: 5, ocrClaimDrafts: [MULTI_FATURA] });
    render(<NewCasePage />);

    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(screen.getByTestId('ocr-draft-review'));
    expect(await screen.findByDisplayValue('FTR-9')).toBeTruthy();

    goBackToDebtors();
    fireEvent.click(await screen.findByTestId('stub-scan-multi'));
    // Aynı fatura yeniden seçildi: kayıt kimliğiyle korunur (yeni kimlikle değişmez); diğer belge eklenir
    await waitDraft((d) => d?.ocrClaimDrafts?.length === 2);
    expect(readDraft().ocrClaimDrafts.map((d: any) => d.kind)).toEqual(['FATURA', 'DIGER']);
    expect(readDraft().ocrClaimDrafts[0].id).toBe('d-multi');
    goForward();

    await vi.waitFor(() => expect(rows()).toHaveLength(2));
    expect(await screen.findByTestId('ocr-draft-in-editor')).toBeTruthy();
    for (const button of screen.getAllByTestId('ocr-draft-document-only')) fireEvent.click(button);
    await waitDraft((d) => d?.ocrClaimDrafts?.every((x: any) => x.status === 'DOCUMENT_ONLY'));
    await vi.waitFor(() => expect(screen.queryByDisplayValue('FTR-9')).toBeNull());

    await new Promise((r) => setTimeout(r, 900));
    fireEvent.click(screen.getByRole('button', { name: 'Takibi Oluştur' }));
    await new Promise((r) => setTimeout(r, 100));
    expect(readDraft().claimDraftItems ?? []).toEqual([]);
    expect(readDraft().dues ?? []).toEqual([]);
  }, 20000);

  it('forma yüklenmiş, listeye eklenmemiş tarama kaydı gönderimde kendiliğinden listeye ALINMAZ', async () => {
    routeApi();
    seedDraft({ currentStep: 5, ocrClaimDrafts: [FATURA_DRAFT] });
    render(<NewCasePage />);

    await vi.waitFor(() => expect(rows()).toHaveLength(1));
    fireEvent.click(screen.getByTestId('ocr-draft-review'));
    expect(await screen.findByDisplayValue('FTR-9')).toBeTruthy();
    // Formun hesabı bitsin (form kalemi sayfaya bildirir)
    await new Promise((r) => setTimeout(r, 1200));

    fireEvent.click(screen.getByRole('button', { name: 'Takibi Oluştur' }));
    await vi.waitFor(() =>
      expect(screen.queryByText(/henüz listeye eklenmedi/) ?? screen.queryByText(PENDING_ERROR)).toBeTruthy(),
    );
    expect(readDraft().claimDraftItems ?? []).toEqual([]);
    expect(readDraft().dues ?? []).toEqual([]);
    expect(mocked.createCase).not.toHaveBeenCalled();
  }, 20000);
});

describe('K3-L KP-8: aynı fatura ikinci anapara oluşturmaz', () => {
  it('aynı fatura (no + tutar + para birimi) listede iki kez varsa açılış yapılmaz', async () => {
    routeApi();
    seedDraft({ currentStep: 5, claimDraftItems: [FATURA_ITEM('a'), FATURA_ITEM('b')] });
    render(<NewCasePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Takibi Oluştur' }));
    expect(await screen.findByText(/FTR-9 numaralı fatura aynı tutar ve para birimiyle zaten kalem listesinde/)).toBeTruthy();
    expect(mocked.createCase).not.toHaveBeenCalled();
  });

  it('kalem listesinde bulunan fatura yeniden taranırsa karar bekleyen kayıt OLUŞMAZ', async () => {
    routeApi();
    seedDraft({ currentStep: 4, claimDraftItems: [FATURA_ITEM('a')] });
    render(<NewCasePage />);

    fireEvent.click(await screen.findByTestId('stub-scan-single-fatura'));
    await new Promise((r) => setTimeout(r, 100));
    expect(readDraft().ocrClaimDrafts ?? []).toEqual([]);
    expect(readDraft().claimDraftItems).toHaveLength(1);
    // Tarama, listede zaten bulunan fatura için ikinci bir anapara da YAZMAZ
    expect(readDraft().dues ?? []).toEqual([]);
  });
});

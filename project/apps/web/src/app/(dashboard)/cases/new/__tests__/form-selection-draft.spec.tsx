import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, within } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';
import { CASE_FORM_SELECTION_MISSING_MESSAGE } from '@/lib/case-wizard-form-selection';

/**
 * #2847 bulgusu — taslak takip formunu (form + alt form) saklar ve yeniden açılışta AYNEN yükler; seçimi taşımayan eski
 * taslakta form TAHMİN EDİLMEZ (önceden gönderim sessizce GENERAL_EXECUTION seçiyordu): dosya oluşturma istenmeden
 * önce kullanıcıdan seçimi tamamlaması istenir, diğer taslak verisi (adım, takip türü, dosya bilgileri) korunur.
 *
 * Gerçek sayfa bileşeni render edilir; yalnız ağ (api) ve Next yönlendirme katmanı mock'tur (a4l spec deseni).
 */

vi.mock('@/lib/api', () => ({
  api: {
    getLawyers: vi.fn(),
    searchDebtors: vi.fn(),
    getNextFileNumber: vi.fn(),
    createCase: vi.fn(),
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
  interestEngineApi: { preview: vi.fn() },
  InterestTypeCode: { LEGAL_3095: 'LEGAL_3095', COMMERCIAL_AVANS_3095_2_2: 'COMMERCIAL_AVANS_3095_2_2' },
  requiresFixedRate: () => false,
  formatRate: (r: number) => String(r),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1' }, loading: false }),
}));

const mocked = api as unknown as Record<'getLawyers' | 'searchDebtors' | 'getNextFileNumber' | 'createCase' | 'get' | 'post', ReturnType<typeof vi.fn>>;

const LOOKUPS = {
  takipTuru: [
    { id: 'tt-cek', name: 'Kambiyo - Çek', code: 'KAMBIYO_CEK' },
    { id: 'tt-ilamsiz', name: 'İlamsız Genel Haciz', code: 'ILAMSIZ_GENEL' },
  ],
  asama: [{ id: 'as-1', name: 'Dosya Açıldı', code: 'DOSYA_ACILDI' }],
  risk: [],
  durumEtiketi: [],
  mahiyetTipi: [{ id: 'mt-cek', name: 'Çek Alacağı', code: 'CEK' }],
};

function routeApi() {
  mocked.getLawyers.mockResolvedValue([]);
  mocked.searchDebtors.mockResolvedValue([]);
  mocked.getNextFileNumber.mockResolvedValue('2026/1');
  mocked.get.mockImplementation((url: string) =>
    Promise.resolve(String(url).startsWith('/lookups') ? { data: { data: LOOKUPS } } : { data: { data: [] } }),
  );
}

const DRAFT_KEY = 'case_wizard_draft:t1:u1';
// Not: dosya no yeniden yüklemede sıradaki numarayla değiştirilir (ÖNCEDEN VAR, bu kapsam dışı) → sınıflandırma ölçülür
const CLASSIFICATION = { takipTuruId: 'tt-cek', mahiyetTipiId: 'mt-cek', mahiyetKodu: 'CEK', asamaId: 'as-1' };
const CLASSIFIED_CASE_DATA = { fileNumber: '2026/77', ...CLASSIFICATION };

function seedDraft(state: Record<string, unknown>) {
  window.localStorage.setItem(
    DRAFT_KEY,
    JSON.stringify({ ...state, tenantId: 't1', userId: 'u1', savedAt: new Date().toISOString() }),
  );
}
const readDraft = () => JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null');

/** Taslak, veriler yüklendikten SONRA yeniden yazılır (kaydetme efekti) */
async function waitDraftSaved(predicate: (d: any) => boolean) {
  await vi.waitFor(() => expect(predicate(readDraft())).toBe(true), { timeout: 5000 });
}

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  routeApi();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('Taslak takip formu — kaydet / yeniden aç', () => {
  it('kayıtlı form + alt form (Kambiyo / Çek) yeniden açılışta AYNEN yüklenir; eksik seçim bandı yok; taslakta korunur', async () => {
    seedDraft({ currentStep: 1, caseData: CLASSIFIED_CASE_DATA, formSelection: { formCode: 'FORM_10', subFormCode: 'FORM_10_CEK' } });
    render(<NewCasePage />);

    await waitDraftSaved((d) => d?.formSelection?.formCode === 'FORM_10' && d?.caseData?.takipTuruId === 'tt-cek');
    expect(readDraft().formSelection).toEqual({ formCode: 'FORM_10', subFormCode: 'FORM_10_CEK' });
    expect(readDraft().currentStep).toBe(1);
    expect(screen.queryByTestId('form-selection-missing')).toBeNull();
    // Adım başlığındaki seçim etiketi alt formun başlığı
    expect(screen.getAllByText('Çek').length).toBeGreaterThan(0);
  });

  it('seçim alanı taşımayan ESKİ taslak: form TAHMİN EDİLMEZ, bant görünür; gönderim isteği GİTMEZ; diğer taslak verisi korunur', async () => {
    seedDraft({ currentStep: 5, caseData: CLASSIFIED_CASE_DATA });
    render(<NewCasePage />);

    expect((await screen.findByTestId('form-selection-missing')).textContent).toContain('Takip türü (form) seçimi bu taslakta kayıtlı değil');
    await waitDraftSaved((d) => !!d?.formSelection);
    expect(readDraft().formSelection).toEqual({ formCode: null, subFormCode: null });

    fireEvent.click(screen.getByRole('button', { name: /Takibi Oluştur/ }));
    expect((await screen.findByRole('dialog', { name: 'Takip türü seçimi' })).textContent).toContain('Kambiyo - Çek');
    expect(screen.getAllByText(CASE_FORM_SELECTION_MISSING_MESSAGE).length).toBeGreaterThan(0);
    expect(mocked.createCase).not.toHaveBeenCalled();
    expect(mocked.post).not.toHaveBeenCalledWith('/cases', expect.anything());

    // Adım, takip türü, dosya bilgileri korunur
    const draft = readDraft();
    expect(draft.currentStep).toBe(5);
    expect(draft.caseData).toMatchObject(CLASSIFICATION);
  });

  it('eksik seçim pencereden tamamlanır: YALNIZ form/alt form atanır; adım ve takip türü DEĞİŞMEZ; taslağa yazılır', async () => {
    seedDraft({ currentStep: 5, caseData: CLASSIFIED_CASE_DATA });
    render(<NewCasePage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Takip türünü seç' }));
    const dialog = await screen.findByRole('dialog', { name: 'Takip türü seçimi' });
    fireEvent.click(within(dialog).getByText('Kambiyo Senedine Dayalı Takip'));
    fireEvent.click(within(dialog).getByText('Çek'));

    await waitDraftSaved((d) => d?.formSelection?.formCode === 'FORM_10');
    expect(readDraft().formSelection).toEqual({ formCode: 'FORM_10', subFormCode: 'FORM_10_CEK' });
    expect(screen.queryByTestId('form-selection-missing')).toBeNull();
    expect(screen.queryByRole('dialog', { name: 'Takip türü seçimi' })).toBeNull();
    const draft = readDraft();
    expect(draft.currentStep).toBe(5);
    expect(draft.caseData).toMatchObject(CLASSIFICATION);
  });

  it('kayıtlı alt form katalogda yoksa ana forma DÜŞÜLMEZ → bant görünür', async () => {
    seedDraft({ currentStep: 2, caseData: CLASSIFIED_CASE_DATA, formSelection: { formCode: 'FORM_10', subFormCode: 'FORM_10_YOK' } });
    render(<NewCasePage />);
    expect(await screen.findByTestId('form-selection-missing')).toBeTruthy();
  });
});

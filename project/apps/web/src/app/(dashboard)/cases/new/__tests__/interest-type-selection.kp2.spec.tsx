import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';

/**
 * K3-L KP-2 (owner kararı 2026-10-01) — yeni dosyada dosya faiz türü kullanıcı seçmeden atanmaz:
 *  - yeni sihirbazda tür boş başlar (sessiz YASAL yok); adım 1'de seçilmeden ilerlenmez;
 *  - kullanıcı seçimi işaretli olmayan eski taslaktaki tür seçim sayılmaz, öneri olarak gösterilir;
 *  - kullanıcının seçtiği tür taslakta korunur.
 * Gerçek sayfa render edilir; yalnız ağ ve Next yönlendirme katmanı mock'tur (reopen-draft spec deseni).
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

const mocked = api as unknown as Record<'getLawyers' | 'searchDebtors' | 'getNextFileNumber' | 'get', ReturnType<typeof vi.fn>>;

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
}

const DRAFT_KEY = 'case_wizard_draft:t1:u1';
const FORM_7 = { formCode: 'FORM_7', subFormCode: null };
const seedDraft = (state: Record<string, unknown>) =>
  window.localStorage.setItem(DRAFT_KEY, JSON.stringify({ ...state, tenantId: 't1', userId: 'u1', savedAt: new Date().toISOString() }));
const readDraft = () => JSON.parse(window.localStorage.getItem(DRAFT_KEY) ?? 'null');
const waitDraft = (predicate: (d: any) => boolean) =>
  vi.waitFor(() => expect(predicate(readDraft())).toBe(true), { timeout: 5000 });

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

describe('K3-L KP-2: sihirbazda dosya faiz türü açık seçim', () => {
  it('yeni sihirbazda tür boş başlar — sessiz YASAL varsayılanı yok', async () => {
    routeApi();
    render(<NewCasePage />);

    await waitDraft((d) => !!d?.caseData);
    expect(readDraft().caseData.interestType).toBe('');
    expect(readDraft().caseData.interestTypeSelected).toBe(false);
  });

  it('adım 1: tür seçilmeden ilerlenmez; seçilince bu engel kalkar ve seçim taslağa işaretli yazılır', async () => {
    routeApi();
    seedDraft({ currentStep: 1, caseData: { fileNumber: '2026/7', takipTuruId: 'tt-ilamsiz' }, formSelection: FORM_7 });
    render(<NewCasePage />);

    const select = (await screen.findByTestId('case-interest-type')) as HTMLSelectElement;
    expect(select.value).toBe('');

    fireEvent.click(screen.getByRole('button', { name: /İleri/ }));
    expect(await screen.findByText(/Dosya faiz türü seçilmelidir/)).toBeTruthy();

    fireEvent.change(select, { target: { value: 'YASAL' } });
    await waitDraft((d) => d?.caseData?.interestType === 'YASAL' && d?.caseData?.interestTypeSelected === true);

    fireEvent.click(screen.getByRole('button', { name: /İleri/ }));
    await vi.waitFor(() => expect(screen.queryByText(/Dosya faiz türü seçilmelidir/)).toBeNull());
  });

  it('eski taslak (seçim işareti yok, YASAL): seçim sayılmaz, öneri olarak gösterilir', async () => {
    routeApi();
    seedDraft({ currentStep: 1, caseData: { fileNumber: '2026/7', takipTuruId: 'tt-ilamsiz', interestType: 'YASAL' }, formSelection: FORM_7 });
    render(<NewCasePage />);

    const select = (await screen.findByTestId('case-interest-type')) as HTMLSelectElement;
    expect(select.value).toBe('');
    expect(await screen.findByTestId('case-interest-type-suggestion')).toHaveTextContent('Yasal faiz');
    await waitDraft((d) => d?.caseData?.interestType === '' && d?.caseData?.interestTypeSuggestion === 'YASAL');
  });

  it('kullanıcının seçtiği tür (işaretli) taslaktan aynen geri gelir', async () => {
    routeApi();
    seedDraft({
      currentStep: 1,
      caseData: { fileNumber: '2026/7', takipTuruId: 'tt-ilamsiz', interestType: 'TICARI', interestTypeSelected: true },
      formSelection: FORM_7,
    });
    render(<NewCasePage />);

    const select = (await screen.findByTestId('case-interest-type')) as HTMLSelectElement;
    await vi.waitFor(() => expect(select.value).toBe('TICARI'));
    expect(screen.queryByTestId('case-interest-type-suggestion')).toBeNull();
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';

/**
 * K3-L KP-11 (owner kararı 2026-10-01) — sihirbazda hesap tarihi:
 *  - yeni hesapta varsayılan Türkiye takvimine göre bugün (takip tarihi de aynı takvimle);
 *  - taslakta saklanır, taslak yeniden açıldığında KENDİ tarihi korunur (bugüne taşınmaz) ve hesap özetinde görünür;
 *  - hesap tarihi kaydı olmayan eski (kalemli) taslakta bugün kullanılır ve kullanıcıya açıkça söylenir.
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
  vi.useRealTimers();
  window.localStorage.clear();
  window.history.replaceState(null, '', '/');
});

describe('K3-L KP-11: sihirbaz hesap tarihi', () => {
  it('yeni sihirbazda hesap ve takip tarihi Türkiye takvimine göre bugün (TSİ 02:30 anında UTC günü değil)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date('2026-09-30T23:30:00.000Z'));
    routeApi();
    render(<NewCasePage />);

    await waitDraft((d) => typeof d?.hesapTarihi === 'string');
    expect(readDraft().hesapTarihi).toBe('2026-10-01');
    expect(readDraft().caseData.startDate).toBe('2026-10-01');
  });

  it('kaydedilmiş taslağın hesap tarihi yeniden açılışta korunur (bugüne taşınmaz) ve hesap özetinde görünür', async () => {
    routeApi();
    seedDraft({ currentStep: 5, hesapTarihi: '2026-09-15', caseData: { startDate: '2026-09-01' }, formSelection: FORM_7 });
    render(<NewCasePage />);

    const input = (await screen.findByTitle('Hesap Tarihi')) as HTMLInputElement;
    expect(input.value).toBe('2026-09-15');
    await waitDraft((d) => d?.hesapTarihi === '2026-09-15');
    expect(screen.queryByTestId('wizard-hesap-tarihi-notice')).toBeNull();
  });

  it('hesap tarihi kaydı olmayan eski kalemli taslak: bugün kullanılır ve kullanıcıya açıkça söylenir', async () => {
    routeApi();
    seedDraft({
      currentStep: 5,
      caseData: { startDate: '2026-09-01' },
      dues: [{ type: 'PRINCIPAL', description: 'Asıl alacak', amount: '1000', dueDate: '2026-09-01' }],
      formSelection: FORM_7,
    });
    render(<NewCasePage />);

    expect(await screen.findByTestId('wizard-hesap-tarihi-notice')).toHaveTextContent('hesap tarihi kayıtlı değildi');
  });
});

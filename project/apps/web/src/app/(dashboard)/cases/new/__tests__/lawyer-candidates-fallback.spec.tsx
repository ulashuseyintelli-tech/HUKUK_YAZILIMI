import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';

/**
 * Yeni dosya sihirbazı — avukat listesi 403 yedeği (owner talimatı 2026-11-18).
 *
 * Yeniden üretilen sorun: USER rolündeki, yönetici / delege olmayan avukatta `GET /lawyers` 403 döner (büro yönetimi
 * kapısı); sihirbaz "Avukatlar yüklenemedi" bandını gösterir ve ekip seçim listesi boş kalır — oysa aynı kullanıcı dosya
 * açabilir. Çözüm: 403'te sihirbaz yalnız seçim alanlarını döndüren dar aday ucunu (`GET /cases/lawyer-candidates`) kullanır.
 *
 * Kanıtlanan (GERÇEK sayfa; yalnız ağ, Next yönlendirme ve borçlu adımı mock'tur):
 *  1. 403 → dar aday ucu çağrılır; "Avukatlar" yükleme hatası GÖRÜNMEZ.
 *  2. 403 dışındaki hata (sunucu hatası) yedeğe düşmez: band görünür, dar uç çağrılmaz.
 *  3. Liste okunabiliyorsa dar uç hiç çağrılmaz (yönetici davranışı değişmez).
 * Adlar SENTETİKTİR.
 */
vi.mock('@/lib/api', () => ({
  api: {
    getLawyers: vi.fn(),
    getCaseLawyerCandidates: vi.fn(),
    searchDebtors: vi.fn(),
    getNextFileNumber: vi.fn(),
    createCase: vi.fn(),
    previewCekFormation: vi.fn(),
    previewCaseOpeningClaims: vi.fn(),
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
    preview: vi.fn(async () => ({ success: true, data: { estimatedInterest: 0, currentRate: 0, days: 0, interestType: 'LEGAL_3095' }, cached: false })),
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

vi.mock('@/components/debtor', () => ({
  DebtorStep: () => <div data-testid="stub-debtor-step" />,
}));

const mocked = api as unknown as Record<
  'getLawyers' | 'getCaseLawyerCandidates' | 'searchDebtors' | 'getNextFileNumber' | 'get' | 'post',
  ReturnType<typeof vi.fn>
>;

const httpError = (status: number) => Object.assign(new Error(`HTTP ${status}`), { status, body: { message: 'sentetik' } });
const CANDIDATES = [
  { id: 'l1', name: 'Sentetik', surname: 'Ortak', title: null, lawyerRank: 'PARTNER', barNumber: '90001', barCity: 'Sentetik Baro', canSign: true, isDefaultForNewCases: true, isActive: true },
];

function routeApi() {
  mocked.searchDebtors.mockResolvedValue([]);
  mocked.getNextFileNumber.mockResolvedValue('2026/1');
  mocked.get.mockImplementation(() => Promise.resolve({ data: { data: [] } }));
  mocked.post.mockResolvedValue({ data: {} });
}

const settled = async () => {
  await vi.waitFor(() => expect(mocked.getLawyers).toHaveBeenCalled());
  // Yükleme tamamlanınca sıra numarası isteği de yapılmış olur; band (varsa) o sırada çizilir.
  await vi.waitFor(() => expect(mocked.getNextFileNumber).toHaveBeenCalled());
  await new Promise((resolve) => setTimeout(resolve, 50));
};
const failureBand = () => screen.queryAllByRole('alert').find((el) => (el.textContent ?? '').includes('yüklenemedi'));

beforeEach(() => {
  vi.clearAllMocks();
  window.localStorage.clear();
  routeApi();
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('Sihirbaz — avukat listesi 403 yedeği', () => {
  it('GET /lawyers 403 → dar aday ucu kullanılır; "Avukatlar" yükleme hatası görünmez', async () => {
    mocked.getLawyers.mockRejectedValue(httpError(403));
    mocked.getCaseLawyerCandidates.mockResolvedValue(CANDIDATES);
    render(<NewCasePage />);
    await settled();
    expect(mocked.getCaseLawyerCandidates).toHaveBeenCalledTimes(1);
    expect(failureBand()?.textContent ?? '').not.toContain('Avukatlar');
  });

  it('403 dışındaki hata yedeğe düşmez: "Avukatlar" yükleme hatası görünür, dar uç çağrılmaz', async () => {
    mocked.getLawyers.mockRejectedValue(httpError(500));
    mocked.getCaseLawyerCandidates.mockResolvedValue(CANDIDATES);
    render(<NewCasePage />);
    await settled();
    await vi.waitFor(() => expect(failureBand()?.textContent ?? '').toContain('Avukatlar'));
    expect(mocked.getCaseLawyerCandidates).not.toHaveBeenCalled();
  });

  it('403 + dar uç da okunamıyorsa hata gizlenmez: "Avukatlar" yükleme hatası görünür', async () => {
    mocked.getLawyers.mockRejectedValue(httpError(403));
    mocked.getCaseLawyerCandidates.mockRejectedValue(httpError(500));
    render(<NewCasePage />);
    await settled();
    await vi.waitFor(() => expect(failureBand()?.textContent ?? '').toContain('Avukatlar'));
  });

  it('liste okunabiliyorsa dar uç çağrılmaz (yönetici davranışı değişmez)', async () => {
    mocked.getLawyers.mockResolvedValue([{ id: 'l1', name: 'Sentetik', surname: 'Ortak' }]);
    render(<NewCasePage />);
    await settled();
    expect(mocked.getCaseLawyerCandidates).not.toHaveBeenCalled();
    expect(failureBand()?.textContent ?? '').not.toContain('Avukatlar');
  });
});

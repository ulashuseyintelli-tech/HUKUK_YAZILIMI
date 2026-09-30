import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';

/**
 * Sihirbaz taslağının yeniden açılışı (owner GO 2026-09-30): `?new=true` bir kez işlenir (F5 taslağı silmez); elle girilen
 * dosya no ezilmez; Dosya Sorumlusu taslakta saklanır ve güncel aday listesinde doğrulanır. Gerçek sayfa bileşeni render
 * edilir; yalnız ağ (api) ve Next yönlendirme katmanı mock'tur (a4l / form-selection-draft spec deseni).
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

function routeApi(candidates: unknown[]) {
  mocked.getLawyers.mockResolvedValue([]);
  mocked.searchDebtors.mockResolvedValue([]);
  mocked.getNextFileNumber.mockResolvedValue('2026/1');
  mocked.get.mockImplementation((url: string) => {
    const u = String(url);
    if (u.startsWith('/lookups')) return Promise.resolve({ data: { data: LOOKUPS } });
    if (u.startsWith('/cases/responsible-candidates')) return Promise.resolve({ data: { data: candidates } });
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

describe('?new=true — yeni başlangıç talebi bir kez işlenir', () => {
  it('menüden gelen yeni başlangıç eski taslağı temizler, parametreyi adresten kaldırır; sonraki F5 yeni taslağı SİLMEZ', async () => {
    routeApi([]);
    seedDraft({ currentStep: 3, caseData: { notes: 'ESKI TASLAK' }, formSelection: FORM_7 });
    window.history.replaceState(null, '', '/cases/new?new=true&clientId=c1');
    render(<NewCasePage />);

    await waitDraft((d) => !!d && d.caseData?.notes !== 'ESKI TASLAK');
    expect(window.location.search).toBe('?clientId=c1');
    expect(readDraft().currentStep).toBe(0);

    // Kullanıcı yeni taslağa veri girdi (kaydedilmiş hâli) → F5
    const draft = readDraft();
    seedDraft({ ...draft, currentStep: 2, caseData: { ...draft.caseData, notes: 'YENI GIRIS' }, formSelection: FORM_7 });
    cleanup();
    render(<NewCasePage />);
    await waitDraft((d) => d?.caseData?.notes === 'YENI GIRIS' && d?.currentStep === 2);
    expect(readDraft().formSelection).toEqual(FORM_7);
  });
});

describe('dosya no — elle girilen numara ezilmez', () => {
  it('elle girilmiş numara korunur (öneri 2026/1 olsa da)', async () => {
    routeApi([]);
    seedDraft({ currentStep: 1, caseData: { fileNumber: 'OZEL-77' }, autoFileNumber: '2026/5', formSelection: FORM_7 });
    render(<NewCasePage />);
    await waitDraft((d) => d?.autoFileNumber !== undefined && mocked.getNextFileNumber.mock.calls.length > 0);
    await vi.waitFor(() => expect(readDraft().caseData.fileNumber).toBe('OZEL-77'));
    expect(screen.getByDisplayValue('OZEL-77')).toBeTruthy();
  });

  it('kullanıcının değiştirmediği otomatik öneri güncel öneriyle tazelenir', async () => {
    routeApi([]);
    seedDraft({ currentStep: 1, caseData: { fileNumber: '2026/5' }, autoFileNumber: '2026/5', formSelection: FORM_7 });
    render(<NewCasePage />);
    await waitDraft((d) => d?.caseData?.fileNumber === '2026/1' && d?.autoFileNumber === '2026/1');
  });

  it('alanı taşımayan eski taslakta dolu değer korunur', async () => {
    routeApi([]);
    seedDraft({ currentStep: 1, caseData: { fileNumber: '2026/5' }, formSelection: FORM_7 });
    render(<NewCasePage />);
    await vi.waitFor(() => expect(mocked.getNextFileNumber).toHaveBeenCalled());
    await waitDraft((d) => d?.caseData?.fileNumber === '2026/5' && d?.autoFileNumber === null);
  });
});

describe('Dosya Sorumlusu — taslakta saklanır, güncel adaya göre doğrulanır', () => {
  it('güncel adaysa KORUNUR ve taslakta kalır', async () => {
    routeApi([{ type: 'LAWYER', id: 'l1', displayName: 'Av. Bir', subtitle: '' }]);
    seedDraft({ currentStep: 1, caseData: {}, responsiblePerson: { type: 'LAWYER', id: 'l1' }, formSelection: FORM_7 });
    render(<NewCasePage />);
    await vi.waitFor(() => expect(mocked.get).toHaveBeenCalledWith('/cases/responsible-candidates'));
    // Sayfa taslağı YENİDEN yazdıktan sonra (autoFileNumber alanı yalnız sayfa kaydında oluşur) seçim hâlâ taslakta
    await waitDraft((d) => 'autoFileNumber' in (d ?? {}) && d?.responsiblePerson?.id === 'l1');
    expect(screen.queryByText(/artık seçilebilir değil/)).toBeNull();
  });

  it('artık aday değilse (pasif / uygun değil) seçim DÜŞER ve kullanıcıya söylenir', async () => {
    routeApi([{ type: 'LAWYER', id: 'baska', displayName: 'Av. Başka', subtitle: '' }]);
    seedDraft({ currentStep: 1, caseData: {}, responsiblePerson: { type: 'LAWYER', id: 'l1' }, formSelection: FORM_7 });
    render(<NewCasePage />);
    expect(await screen.findByText(/artık seçilebilir değil/)).toBeTruthy();
    await waitDraft((d) => d?.responsiblePerson === null);
  });
});

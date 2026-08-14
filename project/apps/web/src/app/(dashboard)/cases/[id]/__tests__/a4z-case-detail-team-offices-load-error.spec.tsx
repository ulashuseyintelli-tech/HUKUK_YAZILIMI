import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

/**
 * WSMR-A4z — DOSYA ÇALIŞMA ALANI: EKİP/İCRA DAİRESİ MODAL OKUMA HATASI
 * "SEÇENEK YOK" İLE AYNI GÖRÜNMEZ.
 *
 * `loadTeamOptions` ve `loadExecutionOffices` catch dallarında yalnız
 * `console.error` ile hatayı yutuyordu. Boş kalan liste, ilgili modal/seçici
 * içinde "Eklenebilecek avukat/personel yok" veya "İcra dairesi yok" render'i
 * ile AYNI ekrana düşüyordu — okuma hatası gerçekten-boş ile ayırt
 * edilemiyordu.
 *
 * Kural: her ikisi de görünür hata + retry ile bildirilir. Liste HİÇ
 * yüklenemediği için "Ekle"/seçim eylemi zaten yapısal olarak fail-closed'dır
 * (tıklanacak öğe yok) — eklenen tek şey GÖRÜNÜRLÜK.
 */

vi.mock('@/lib/api', () => {
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn().mockResolvedValue([]);
      return registry[prop];
    },
  };
  return { api: new Proxy({}, handler) };
});

function applyRealContractDefaults() {
  const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
  m.getCase.mockResolvedValue(REAL_CASE);
  m.getCaseDebtors.mockResolvedValue({
    summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 },
    items: [],
  });
  m.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
  m.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  m.getActiveCaseFeeAgreement.mockResolvedValue(null);
  m.getCollectionDispositionsByCase.mockResolvedValue([]);
  m.getCaseResponsibilityAt.mockResolvedValue({
    caseId: REAL_CASE.id,
    asOf: new Date().toISOString(),
    operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' },
    legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' },
    horizon: {},
  });
  m.getCaseResponsibilityHistory.mockResolvedValue({
    caseId: REAL_CASE.id,
    from: null,
    to: null,
    events: [],
    horizon: {},
  });
}

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'case-1' }),
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/cases/case-1',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' }, loading: false }),
}));

const mocked = api as unknown as {
  getLawyers: ReturnType<typeof vi.fn>;
  getStaffMembers: ReturnType<typeof vi.fn>;
  getExecutionOffices: ReturnType<typeof vi.fn>;
};

const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  debtors: [],
  caseClients: [],
  lawyers: [],
  claimItems: [],
};

const networkError = () => Promise.reject(new Error('network down'));

beforeEach(() => {
  vi.clearAllMocks();
  applyRealContractDefaults();
});
afterEach(() => cleanup());

describe('Ekip Ekle modalı — loadTeamOptions okuma hatası', () => {
  const openTeamModal = async () => {
    const btn = await screen.findByTitle('Ekip Üyesi Ekle');
    fireEvent.click(btn);
  };

  it('AG HATASI: "Eklenebilecek avukat yok" YAZILMAZ, gorunur hata + retry cikar', async () => {
    mocked.getLawyers.mockImplementation(networkError);
    mocked.getStaffMembers.mockResolvedValue([]);
    renderPage();
    await screen.findAllByText(REAL_CASE.fileNumber);
    await openTeamModal();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /Ekip listesi yüklenemedi/.test(a.textContent || ''))).toBe(true);
    expect(screen.queryByText('Eklenebilecek avukat yok')).toBeNull();
  });

  it('GERCEKTEN bos: hata YOK, "Eklenebilecek avukat yok" DOGRU', async () => {
    mocked.getLawyers.mockResolvedValue([]);
    mocked.getStaffMembers.mockResolvedValue([]);
    renderPage();
    await screen.findAllByText(REAL_CASE.fileNumber);
    await openTeamModal();

    expect(await screen.findByText('Eklenebilecek avukat yok')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry -> SUCCESS_DATA: hata kalkar', async () => {
    let attempt = 0;
    mocked.getLawyers.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('network down')) : Promise.resolve([]);
    });
    mocked.getStaffMembers.mockResolvedValue([]);
    renderPage();
    await screen.findAllByText(REAL_CASE.fileNumber);
    await openTeamModal();

    const retryBtns = await screen.findAllByRole('button', { name: 'Tekrar dene' }, { timeout: 5000 });
    fireEvent.click(retryBtns[0]);

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull(), { timeout: 5000 });
  });
});

describe('İcra Dairesi seçici — loadExecutionOffices okuma hatası', () => {
  const openFinanceDrawer = async () => {
    const btns = await screen.findAllByRole('button', { name: /Detaylar/ });
    fireEvent.click(btns[0]);
  };
  const openOfficePicker = async () => {
    const trigger = await screen.findByText('— Seçiniz —', {}, { timeout: 5000 });
    fireEvent.click(trigger);
  };

  it('AG HATASI: "İcra dairesi yok" YAZILMAZ, gorunur hata + retry cikar', async () => {
    mocked.getExecutionOffices.mockImplementation(networkError);
    renderPage();
    await screen.findAllByText(REAL_CASE.fileNumber);
    await openFinanceDrawer();
    await openOfficePicker();

    const alerts = await screen.findAllByRole('alert', {}, { timeout: 5000 });
    expect(alerts.some((a) => /İcra daireleri yüklenemedi/.test(a.textContent || ''))).toBe(true);
    expect(screen.queryByText('İcra dairesi yok')).toBeNull();
  });

  it('GERCEKTEN bos: hata YOK, "İcra dairesi yok" DOGRU', async () => {
    mocked.getExecutionOffices.mockResolvedValue([]);
    renderPage();
    await screen.findAllByText(REAL_CASE.fileNumber);
    await openFinanceDrawer();
    await openOfficePicker();

    expect(await screen.findByText('İcra dairesi yok')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

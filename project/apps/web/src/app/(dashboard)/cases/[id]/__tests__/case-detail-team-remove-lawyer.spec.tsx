import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/**
 * Dosya ekibinden avukat çıkarma (P02 ekran eksikleri, 18.11.2026).
 *
 * Kural: mevcut sunucu ucu (DELETE /cases/:id/lawyers/:caseLawyerId) ekrana bağlanır. Hukuki sorumlu avukatta düğme YOKTUR
 * (sunucu da reddeder). Onay penceresi reddedilirse istek GİTMEZ. Başarıda dosya yeniden okunur; hata sunucu metniyle yazılır.
 * Kişi adları SENTETİK.
 */

vi.mock('@/lib/api', () => {
  const registry: Record<string, ReturnType<typeof vi.fn>> = {};
  const handler: ProxyHandler<Record<string, unknown>> = {
    get(_target, prop: string) {
      if (!(prop in registry)) registry[prop] = vi.fn().mockResolvedValue([]);
      return registry[prop];
    },
  };
  return { api: new Proxy({}, handler) };
});

vi.mock('next/navigation', () => ({
  useParams: () => ({ id: 'case-1' }),
  useSearchParams: () => new URLSearchParams(''),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
  usePathname: () => '/cases/case-1',
}));

vi.mock('next/link', () => ({
  default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a>,
}));

vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role: 'ADMIN' }, loading: false }),
}));

const lawyer = (id: string, name: string, surname: string) => ({
  id, name, surname, barNumber: 'B-1', lawyerRank: 'AUTHORIZED', isActive: true,
  phone: null, email: null, address: null, bankName: null, branchName: null, iban: null,
});

const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  debtors: [],
  caseClients: [],
  claimItems: [],
  lawyers: [
    { id: 'cl-resp', role: 'RESPONSIBLE', isResponsible: true, canSign: false, casePermissions: null, receiveNotifications: true, lawyer: lawyer('l-1', 'Sorumlu', 'Sentetik') },
    { id: 'cl-temp', role: 'ASSIGNED', isResponsible: false, canSign: false, casePermissions: { canEditFinance: true }, receiveNotifications: false, lawyer: lawyer('l-2', 'Gecici', 'Sentetik') },
  ],
};

const m = api as unknown as Record<string, ReturnType<typeof vi.fn>>;

function defaults() {
  m.getCase.mockResolvedValue(REAL_CASE);
  m.getCaseDebtors.mockResolvedValue({ summary: { total: 0, delivered: 0, pending: 0, returned: 0, danger: 0 }, items: [] });
  m.getAddressTasksForCase.mockResolvedValue({ tasks: [] });
  m.getAddressNotesForCase.mockResolvedValue({ notes: [] });
  m.getActiveCaseFeeAgreement.mockResolvedValue(null);
  m.getCollectionDispositionsByCase.mockResolvedValue([]);
  m.getCaseResponsibilityAt.mockResolvedValue({
    caseId: 'case-1', asOf: new Date().toISOString(),
    operationOwner: { type: 'NONE', id: null, confidence: 'EVENT_CONFIRMED' },
    legalResponsibleLawyer: { lawyerId: null, confidence: 'EVENT_CONFIRMED' }, horizon: {},
  });
  m.getCaseResponsibilityHistory.mockResolvedValue({ caseId: 'case-1', from: null, to: null, events: [], horizon: {} });
  m.removeCaseLawyer.mockResolvedValue({ success: true });
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

const openLawyer = async (fullName: string) => {
  await screen.findAllByText(REAL_CASE.fileNumber);
  fireEvent.click(await screen.findByText(`Av. ${fullName}`));
  await screen.findByText('Bu dosya için kaydet');
};

beforeEach(() => {
  vi.clearAllMocks();
  defaults();
});
afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe('Dosya ekibinden avukat çıkarma', () => {
  it('sorumlu olmayan avukat: onaylanınca DELETE ucu çağrılır ve dosya yeniden okunur', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderPage();
    await openLawyer('Gecici Sentetik');
    const before = m.getCase.mock.calls.length;
    fireEvent.click(screen.getByTestId('case-lawyer-remove'));
    await waitFor(() => expect(m.removeCaseLawyer).toHaveBeenCalledWith('case-1', 'cl-temp'));
    expect(confirm.mock.calls[0][0]).toContain('Av. Gecici Sentetik bu dosyanın ekibinden çıkarılacak');
    await waitFor(() => expect(m.getCase.mock.calls.length).toBeGreaterThan(before));
  });

  it('onay penceresi reddedilirse istek gitmez', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderPage();
    await openLawyer('Gecici Sentetik');
    fireEvent.click(screen.getByTestId('case-lawyer-remove'));
    expect(m.removeCaseLawyer).not.toHaveBeenCalled();
  });

  it('hukuki sorumlu avukatta düğme gösterilmez', async () => {
    renderPage();
    await openLawyer('Sorumlu Sentetik');
    expect(screen.queryByTestId('case-lawyer-remove')).toBeNull();
  });

  it('sunucu reddederse sunucu metni gösterilir; çekmece açık kalır', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    m.removeCaseLawyer.mockRejectedValue(new Error('Sentetik sunucu reddi'));
    renderPage();
    await openLawyer('Gecici Sentetik');
    fireEvent.click(screen.getByTestId('case-lawyer-remove'));
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(String(alert.mock.calls[0][0])).toContain('Dosya ekibinden çıkarma başarısız');
    expect(screen.getByText('Bu dosya için kaydet')).toBeTruthy();
  });
});

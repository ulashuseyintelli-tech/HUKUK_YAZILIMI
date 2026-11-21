import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import CaseDetailPage from '../page';
import { api } from '@/lib/api';

/**
 * F02 kabul UB-6 (21.11.2026) — dosya başlığındaki Word / PDF / XML İndir düğmeleri.
 *
 * Kusur: düğmeler `/api` öneksiz, API'de olmayan `POST {NEXT_PUBLIC_API_URL}/template-engine/cases/:id/documents/:format`
 * adresine gidiyor (web sunucusu 404 → "Doküman oluşturulamadı") ve oturum anahtarını yalnız localStorage'dan okuyordu
 * ("Beni hatırla" işaretsiz oturumda anahtar sessionStorage'dadır).
 * Kural: düğmeler API istemcisinin dosyadan takip talebi üreten yardımcılarını kullanır
 * (`GET /api/template-engine/case/:id/{pdf|word|xml}?type=takip-talebi`, oturum anahtarı istemciden); hata sunucu metniyle
 * gösterilir. Değerler sentetik.
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

const REAL_CASE = {
  id: 'case-1',
  fileNumber: '2026/1',
  debtors: [],
  caseClients: [],
  claimItems: [],
  lawyers: [],
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
  for (const fn of ['downloadPdfFromCase', 'downloadWordFromCase', 'downloadXmlFromCase']) {
    m[fn].mockResolvedValue(new Blob(['sentetik'], { type: 'application/octet-stream' }));
  }
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <CaseDetailPage />
    </QueryClientProvider>,
  );
}

let fetchSpy: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  defaults();
  fetchSpy = vi.fn(async () => new Response('<!DOCTYPE html>', { status: 404, headers: { 'content-type': 'text/html' } }));
  vi.stubGlobal('fetch', fetchSpy);
  Object.assign(window.URL, { createObjectURL: vi.fn(() => 'blob:sentetik'), revokeObjectURL: vi.fn() });
});
afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const press = async (title: string) => {
  await screen.findAllByText(REAL_CASE.fileNumber);
  fireEvent.click(screen.getByTitle(title));
};

const wrongPathCalls = () =>
  fetchSpy.mock.calls.filter(([url]) => String(url).includes('/template-engine/cases/'));

describe('UB-6 — dosya başlığı takip talebi indirme düğmeleri', () => {
  it.each([
    ['PDF İndir', 'downloadPdfFromCase'],
    ['Word İndir', 'downloadWordFromCase'],
    ['XML İndir', 'downloadXmlFromCase'],
  ])('%s → API istemcisinin %s yardımcısı (takip talebi) çağrılır; eski /template-engine/cases/ adresine istek gitmez', async (title, helper) => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    renderPage();
    await press(title);
    await waitFor(() => expect(m[helper]).toHaveBeenCalledWith('case-1', 'takip-talebi'));
    expect(wrongPathCalls()).toHaveLength(0);
    expect(alert).not.toHaveBeenCalled();
  });

  it('sunucu reddederse sunucunun metni gösterilir (genel "Doküman oluşturulamadı" değil)', async () => {
    const alert = vi.spyOn(window, 'alert').mockImplementation(() => undefined);
    m.downloadPdfFromCase.mockRejectedValue(new Error('Operasyonel çıktı için aktif borçlu bulunmuyor'));
    renderPage();
    await press('PDF İndir');
    await waitFor(() => expect(alert).toHaveBeenCalled());
    expect(String(alert.mock.calls[0][0])).toBe('Operasyonel çıktı için aktif borçlu bulunmuyor');
    expect(wrongPathCalls()).toHaveLength(0);
  });
});

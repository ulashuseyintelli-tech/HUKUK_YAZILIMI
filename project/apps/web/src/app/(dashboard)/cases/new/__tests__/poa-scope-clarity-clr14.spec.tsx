import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';
import { saveCaseWizardDraftState } from '@/lib/case-wizard-draft';

vi.mock('@/lib/api', () => ({ api: { getLawyers: vi.fn(), searchDebtors: vi.fn(), getNextFileNumber: vi.fn(), createCase: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn(async () => ({ data: [] })) } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(''), usePathname: () => '/cases/new' }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'scope-user', tenantId: 'scope-tenant', role: 'USER' }, loading: false }) }));

const scope = { tenantId: 'scope-tenant', userId: 'scope-user' };
const creditor = { id: 'scope-client', name: 'Synthetic Client', displayName: 'Synthetic Client', type: 'PERSON', isNew: false };
const lawyer = { id: 'scope-lawyer', name: 'Synthetic', surname: 'Lawyer', barNumber: 'TEST', canSign: true, isNew: false };
let result: Record<string, unknown>;
let rejected: boolean;
let fetchTrap: ReturnType<typeof vi.fn>;
let xhrTrap: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); rejected = false;
  result = { isValid: true, scopeStatus: 'NOT_EVALUATED', scopeMessage: 'İşlem/dosya kapsamı doğrulanmadı. Gönderim yetkisi ayrıca denetlenir.' };
  fetchTrap = vi.fn(() => { throw new Error('CL-R14 forbids real fetch'); }); vi.stubGlobal('fetch', fetchTrap);
  xhrTrap = vi.spyOn(XMLHttpRequest.prototype, 'open').mockImplementation(() => { throw new Error('CL-R14 forbids real XHR'); });
  vi.mocked(api.getLawyers).mockResolvedValue([lawyer] as any); vi.mocked(api.searchDebtors).mockResolvedValue([]); vi.mocked(api.getNextFileNumber).mockResolvedValue('TEST/R14');
  vi.mocked(api.get).mockImplementation(async (url: string) => {
    if (url === '/lookups') return { data: { data: { takipTuru: [], asama: [], risk: [], durumEtiketi: [], mahiyetTipi: [] } } } as any;
    return { data: { data: url === '/clients' ? [creditor] : [] } } as any;
  });
  vi.mocked(api.post).mockImplementation(async (url: string) => {
    if (url !== '/poa/check/valid-for-lawyers') throw new Error('Unexpected write '+url);
    if (rejected) throw new Error('Synthetic unavailable check');
    return { data: result } as any;
  });
});

afterEach(() => {
  cleanup(); localStorage.clear(); expect(fetchTrap).not.toHaveBeenCalled(); expect(xhrTrap).not.toHaveBeenCalled();
  expect(api.createCase).not.toHaveBeenCalled(); expect(api.put).not.toHaveBeenCalled();
  expect(vi.mocked(api.post).mock.calls.every(([url]) => url === '/poa/check/valid-for-lawyers')).toBe(true);
  vi.restoreAllMocks(); vi.unstubAllGlobals();
});

async function open(step = 3, selectedCreditors = [creditor]) {
  window.history.replaceState(null, '', '/cases/new');
  saveCaseWizardDraftState({ currentStep: step, showDocumentSelector: true, formSelection: { formCode: 'FORM_7', subFormCode: null }, creditors: selectedCreditors, lawyers: [lawyer] }, scope);
  render(<NewCasePage />);
  await waitFor(() => expect(api.post).toHaveBeenCalledWith('/poa/check/valid-for-lawyers', { clientId: creditor.id, lawyerIds: [lawyer.id] }));
}

describe('CL-R14/A — actual case wizard scope warning', () => {
  it('shows scope clarity for an unlimited or long-lived active record and keeps Continue nonblocking', async () => {
    result = { ...result, daysRemaining: 120 };
    await open();
    expect(await screen.findByText(/Etkin vekalet kaydı bulundu.*İşlem\/dosya kapsamı doğrulanmadı/)).toBeInTheDocument();
    const button = screen.getByRole('button', { name: 'Devam Et' });
    expect(button).toBeEnabled(); fireEvent.click(button);
    await waitFor(() => expect(screen.queryByText(/Etkin vekalet kaydı bulundu.*İşlem\/dosya kapsamı doğrulanmadı/)).not.toBeInTheDocument());
  });

  it('keeps near-expiry warning alongside scope clarity', async () => {
    result = { ...result, daysRemaining: 2, message: 'Vekalet 2 gün içinde sona erecek' };
    await open();
    expect(await screen.findByText(/Vekalet 2 gün içinde sona erecek.*İşlem\/dosya kapsamı doğrulanmadı/)).toBeInTheDocument();
  });

  it('keeps the missing-record result visible without claiming scope was assessed', async () => {
    result = { ...result, isValid: false, message: 'Seçili avukatlardan hiçbirine verilmiş geçerli vekalet bulunamadı' };
    await open();
    expect(await screen.findByText(/Seçili avukatlardan hiçbirine.*İşlem\/dosya kapsamı doğrulanmadı/)).toBeInTheDocument();
  });

  it('does not silently hide an unavailable check or expose the raw failure', async () => {
    rejected = true; await open();
    expect(await screen.findByText(/Vekalet kaydı kontrol edilemedi; işlem\/dosya kapsamı doğrulanmadı/)).toBeInTheDocument();
    expect(screen.queryByText('Synthetic unavailable check')).not.toBeInTheDocument();
  });

  it('uses a neutral step-two heading for an active but unassessed record', async () => {
    await open(2);
    expect(await screen.findByText(/Vekalet kaydı \/ kapsam kontrolü uyarısı/)).toBeInTheDocument();
    expect(screen.queryByText(/Bazı avukatlar için geçerli vekalet bulunamadı/)).not.toBeInTheDocument();
  });

  it('does not let the first two scope notes hide a third missing-record warning', async () => {
    const clients = [creditor, { ...creditor, id: 'scope-client-2', name: 'Second Client' }, { ...creditor, id: 'scope-client-3', name: 'Third Client' }];
    vi.mocked(api.post).mockImplementation(async (url: string, body: any) => {
      if (url !== '/poa/check/valid-for-lawyers') throw new Error('Unexpected write '+url);
      return { data: body.clientId === 'scope-client-3' ? { ...result, isValid: false, message: 'Üçüncü müvekkilin etkin vekalet kaydı bulunamadı' } : result } as any;
    });
    await open(3, clients);
    expect(await screen.findByText(/Üçüncü müvekkilin etkin vekalet kaydı bulunamadı.*İşlem\/dosya kapsamı doğrulanmadı/)).toBeInTheDocument();
    expect(screen.getByText(/Vekalet Uyarısı \(3\)/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Devam Et' })).toBeEnabled();
  });
});

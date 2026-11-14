import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import NewCasePage from '../page';
import { api } from '@/lib/api';
import { saveCaseWizardDraftState } from '@/lib/case-wizard-draft';

const fixture = vi.hoisted(() => ({ scan: {} as Record<string, unknown> }));
vi.mock('@/lib/api', () => ({ api: { getLawyers: vi.fn(), searchDebtors: vi.fn(), getNextFileNumber: vi.fn(), createCase: vi.fn(), get: vi.fn(), post: vi.fn(), put: vi.fn() } }));
vi.mock('@/lib/api/client', () => ({ apiClient: { get: vi.fn(async () => ({ data: [] })) } }));
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), replace: vi.fn() }), useSearchParams: () => new URLSearchParams(''), usePathname: () => '/cases/new' }));
vi.mock('next/link', () => ({ default: ({ children, href }: { children: React.ReactNode; href: string }) => <a href={href}>{children}</a> }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'r17-user', tenantId: 'r17-tenant', role: 'USER' }, loading: false }) }));
vi.mock('@/components/client/PoaScannerWizard', () => ({ PoaScannerWizard: ({ asButton, onScanComplete }: { asButton?: boolean; onScanComplete: (result: any) => unknown }) => <button onClick={() => void onScanComplete(fixture.scan)}>{asButton ? 'R17 step3 scan' : 'R17 other scan'}</button> }));
vi.mock('@/components/case/DocumentSourceSelector', () => ({ DocumentSourceSelector: ({ onPoaScan }: { onPoaScan: (result: any) => unknown }) => <button onClick={() => void onPoaScan(fixture.scan)}>R17 document scan</button> }));


const scope = { tenantId: 'r17-tenant', userId: 'r17-user' };
const saved = { id: 'cas-client', type: 'PERSON', firstName: 'Synthetic', lastName: 'Client', name: 'Synthetic Client', displayName: 'Synthetic Client', phone: '5551112233', version: 23 };
beforeEach(() => {
  vi.resetAllMocks(); localStorage.clear(); vi.spyOn(window, 'alert').mockImplementation(() => undefined);
  vi.mocked(api.getLawyers).mockResolvedValue([]); vi.mocked(api.searchDebtors).mockResolvedValue([]); vi.mocked(api.getNextFileNumber).mockResolvedValue('2026/CAS');
  vi.mocked(api.get).mockImplementation(async url => {
    if (url === '/clients') return { data: { data: [saved] } } as any;
    if (url === '/lookups') return { data: { data: { takipTuru: [], asama: [], risk: [], durumEtiketi: [], mahiyetTipi: [] } } } as any;
    return { data: { data: [] } } as any;
  });
});
afterEach(() => { cleanup(); localStorage.clear(); vi.restoreAllMocks(); });
async function edit() {
  window.history.replaceState(null, '', '/cases/new');
  saveCaseWizardDraftState({ currentStep: 3, showDocumentSelector: true, formSelection: { formCode: 'FORM_7', subFormCode: null }, creditors: [{ ...saved, isNew: false }] }, scope);
  render(<NewCasePage />); await waitFor(() => expect(api.get).toHaveBeenCalledWith('/clients'));
  fireEvent.click(await screen.findByTitle('Düzenle'));
  const modal = screen.getAllByText('Synthetic Client').find(e => e.tagName === 'H3')!.closest('.max-w-lg') as HTMLElement;
  fireEvent.click(within(modal).getByRole('button', { name: 'Düzenle' }));
  const input = within(modal).getAllByRole('textbox')[0]; fireEvent.change(input, { target: { value: 'Draft name' } });
  fireEvent.click(within(modal).getByRole('button', { name: 'Kaydet' }));
  await waitFor(() => expect(api.put).toHaveBeenCalledTimes(1)); return modal;
}
describe('FIND-C4 actual case-wizard ClientDetailModal', () => {
  it('carries its read revision and preserves the conflict draft without any later write', async () => {
    vi.mocked(api.put).mockRejectedValue(new Error('Concurrent edit rejected'));
    const modal = await edit(); await waitFor(() => expect(window.alert).toHaveBeenCalledWith('Concurrent edit rejected'));
    expect(api.put).toHaveBeenCalledWith('/clients/cas-client', expect.objectContaining({ expectedVersion: 23, firstName: 'Draft name' }));
    expect(within(modal).getByDisplayValue('Draft name')).toBeInTheDocument(); expect(api.post).not.toHaveBeenCalled(); expect(api.createCase).not.toHaveBeenCalled();
    expect(api.put).toHaveBeenCalledTimes(1);
  });
  it('closes only after the versioned update succeeds', async () => {
    vi.mocked(api.put).mockResolvedValue({} as any); await edit();
    await waitFor(() => expect(screen.queryByDisplayValue('Draft name')).toBeNull());
    expect(window.alert).toHaveBeenCalledWith('Müvekkil bilgileri güncellendi');
    expect(api.put).toHaveBeenCalledWith('/clients/cas-client', expect.objectContaining({ expectedVersion: 23 })); expect(api.post).not.toHaveBeenCalled();
  });
});

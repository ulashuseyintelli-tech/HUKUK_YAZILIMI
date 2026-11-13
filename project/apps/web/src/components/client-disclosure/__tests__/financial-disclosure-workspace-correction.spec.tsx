import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { DisclosureCorrectionPanel } from '../DisclosureCorrectionPanel';
import type { OfficeDisclosureActionCapabilities } from '@/lib/api/client-financial-disclosure';

const createCorrection = vi.fn(), reverse = vi.fn(), post = vi.fn();
let actor: { id: string; tenantId: string } | null = { id: 'actor-a', tenantId: 'tenant-a' };
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: actor }) }));
vi.mock('@/lib/api/client', () => ({ apiClient: { post: (...args: unknown[]) => post(...args) } }));
vi.mock('@/lib/api/client-financial-disclosure', async importOriginal => {
  const original = await importOriginal<typeof import('@/lib/api/client-financial-disclosure')>();
  return { ...original, clientFinancialDisclosureApi: { ...original.clientFinancialDisclosureApi,
    createCorrection: (...args: unknown[]) => createCorrection(...args), reverse: (...args: unknown[]) => reverse(...args) } };
});

const noActions: OfficeDisclosureActionCapabilities = { canRequestOfficeApproval: false, canCompleteOfficeApproval: false,
  canRequestContentApproval: false, canCompleteContentApproval: false, canReconcileConsumedApproval: false,
  canPublish: false, canRetryPublication: false, canReverse: false, canSupersede: false };
function setup(actions: Partial<OfficeDisclosureActionCapabilities> = { canCreateCorrection: true, canReverse: true }, successorVersionId: string | null = null) {
  const selected = vi.fn();
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const panel = (clientId = 'client-a', versionId = 'version-a') => <QueryClientProvider client={qc}>
    <DisclosureCorrectionPanel clientId={clientId} versionId={versionId} actions={{ ...noActions, ...actions }}
      successorVersionId={successorVersionId} onSelectVersion={selected} />
  </QueryClientProvider>;
  return { ...render(panel()), panel, selected, qc };
}
function fill(reason = '  Bildirim düzeltmesi  ') {
  fireEvent.change(screen.getByLabelText('Müvekkile gösterilecek gerekçe'), { target: { value: reason } });
  fireEvent.click(screen.getByRole('checkbox'));
}
beforeEach(() => {
  vi.clearAllMocks(); actor = { id: 'actor-a', tenantId: 'tenant-a' };
  createCorrection.mockResolvedValue({ disclosureId: 'root-a', disclosureVersionId: 'version-b', version: 2, status: 'DRAFT', replayed: false });
  reverse.mockResolvedValue({ disclosureVersionId: 'version-a', status: 'REVERSED', replayed: false });
});
describe('CL-Z04 correction panel', () => {
  it('does not offer write commands without the corresponding server capability or authenticated actor', () => {
    const view = setup({});
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    actor = null; view.rerender(view.panel());
    expect(screen.queryByText('Bildirim düzeltme')).not.toBeInTheDocument();
  });
  it('requires a nonblank client-facing reason and explicit confirmation', () => {
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Düzeltme hazırla' }));
    expect(screen.getByRole('button', { name: 'Düzeltme taslağını oluştur' })).toBeDisabled();
    fill('   ');
    expect(screen.getByRole('button', { name: 'Düzeltme taslağını oluştur' })).toBeDisabled();
    expect(createCorrection).not.toHaveBeenCalled();
  });
  it('creates one draft, refreshes scoped surfaces and selects it without publishing', async () => {
    const view = setup(), invalidate = vi.spyOn(view.qc, 'invalidateQueries');
    fireEvent.click(screen.getByRole('button', { name: 'Düzeltme hazırla' })); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Düzeltme taslağını oluştur' }));
    await waitFor(() => expect(view.selected).toHaveBeenCalledWith('version-b'));
    expect(createCorrection).toHaveBeenCalledExactlyOnceWith('client-a', 'version-a', 'Bildirim düzeltmesi');
    expect(reverse).not.toHaveBeenCalled();
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ['client-financial-disclosures', 'office-history', 'client-a'] });
    expect(screen.getByRole('status')).toHaveTextContent('Yeni onaylar ve yayın');
  });
  it('reverses explicitly and does not label it a money refund', async () => {
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Geri al' })); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Bildirimi geri al' }));
    expect(await screen.findByRole('status')).toHaveTextContent('para iadesi değildir');
    expect(reverse).toHaveBeenCalledExactlyOnceWith('version-a', 'Bildirim düzeltmesi');
  });
  it('does not present a rejected command or provider error detail as success', async () => {
    reverse.mockRejectedValue(new Error('PRIVATE-PROVIDER-DETAIL'));
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Geri al' })); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Bildirimi geri al' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('tamamlanamadı');
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
    expect(document.body.textContent).not.toContain('PRIVATE-PROVIDER-DETAIL');
  });
  it('rejects an unverified successful HTTP payload', async () => {
    createCorrection.mockResolvedValue(undefined);
    const view = setup(); fireEvent.click(screen.getByRole('button', { name: 'Düzeltme hazırla' })); fill();
    fireEvent.click(screen.getByRole('button', { name: 'Düzeltme taslağını oluştur' }));
    expect(await screen.findByRole('alert')).toBeInTheDocument(); expect(view.selected).not.toHaveBeenCalled();
  });
  it('disables duplicate submission while the original command is pending', async () => {
    let resolve!: (value: unknown) => void;
    createCorrection.mockImplementation(() => new Promise(r => { resolve = r; }));
    setup(); fireEvent.click(screen.getByRole('button', { name: 'Düzeltme hazırla' })); fill();
    const button = screen.getByRole('button', { name: 'Düzeltme taslağını oluştur' }); fireEvent.click(button);
    await waitFor(() => expect(button).toBeDisabled()); fireEvent.click(button);
    expect(createCorrection).toHaveBeenCalledTimes(1);
    resolve({ disclosureVersionId: 'version-b', replayed: false });
    await screen.findByRole('status');
  });
  it('does not retain the previous client reason or apply its delayed response to the next client', async () => {
    let resolve!: (value: unknown) => void;
    createCorrection.mockImplementation(() => new Promise(r => { resolve = r; }));
    const view = setup(); fireEvent.click(screen.getByRole('button', { name: 'Düzeltme hazırla' })); fill('PRIVATE-CLIENT-A');
    fireEvent.click(screen.getByRole('button', { name: 'Düzeltme taslağını oluştur' }));
    await waitFor(() => expect(createCorrection).toHaveBeenCalledTimes(1));
    view.rerender(view.panel('client-b', 'version-c'));
    expect(document.body.textContent).not.toContain('PRIVATE-CLIENT-A');
    resolve({ disclosureVersionId: 'version-b', replayed: false });
    await waitFor(() => expect(screen.getByRole('button', { name: 'Düzeltme hazırla' })).toBeEnabled());
    expect(view.selected).not.toHaveBeenCalled(); expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });
  it('opens an existing successor without creating another draft', () => {
    const view = setup({}, 'pending-version');
    fireEvent.click(screen.getByRole('button', { name: 'Düzeltme sürümünü aç' }));
    expect(view.selected).toHaveBeenCalledWith('pending-version'); expect(createCorrection).not.toHaveBeenCalled();
  });
});
describe('CL-Z04 SDK contracts', () => {
  it('sends only the reason and validates the new-version result', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api/client-financial-disclosure')>('@/lib/api/client-financial-disclosure');
    post.mockResolvedValue({ data: { disclosureId: 'root', disclosureVersionId: 'new', version: 2, status: 'DRAFT', replayed: false } });
    await expect(actual.clientFinancialDisclosureApi.createCorrection('client', 'old', 'Gerekçe')).resolves.toMatchObject({ disclosureVersionId: 'new' });
    expect(post).toHaveBeenCalledWith('/client-financial-disclosures/office/clients/client/versions/old/corrections', { correctionReason: 'Gerekçe' });
    post.mockResolvedValue({ data: { status: 'DRAFT' } });
    await expect(actual.clientFinancialDisclosureApi.createCorrection('client', 'old', 'Gerekçe')).rejects.toThrow();
  });
  it('requires the exact reversed version and strips internal response fields', async () => {
    const actual = await vi.importActual<typeof import('@/lib/api/client-financial-disclosure')>('@/lib/api/client-financial-disclosure');
    post.mockResolvedValue({ data: { disclosureVersionId: 'old', status: 'REVERSED', replayed: false, providerMessageId: 'SECRET' } });
    await expect(actual.clientFinancialDisclosureApi.reverse('old', 'Gerekçe')).resolves.toEqual({ disclosureVersionId: 'old', status: 'REVERSED', replayed: false });
    post.mockResolvedValue({ data: { disclosureVersionId: 'other', status: 'REVERSED', replayed: false } });
    await expect(actual.clientFinancialDisclosureApi.reverse('old', 'Gerekçe')).rejects.toThrow();
  });
});

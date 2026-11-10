import { act, cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ClientBankAccountsPanel } from '@/components/client/client-bank-accounts-panel';
import { clientBankAccountsApi as api } from '@/lib/api/client-bank-accounts';

vi.mock('@/lib/api/client-bank-accounts', () => ({ clientBankAccountsApi: { list: vi.fn(), create: vi.fn(), update: vi.fn() } }));
const row = { id: 'account-a', bankName: 'Bank A', branchName: 'Branch', accountHolder: 'Holder', ibanMasked: 'TR33****1326', isPrimary: false };
const result = (writable = true, items = [row]) => ({ items, capabilities: { canCreate: writable, canUpdate: writable, reasonCode: writable ? 'ALLOWED' : 'DENIED' } });
const submit = () => fireEvent.submit(screen.getByRole('button', { name: 'Banka hesabını kaydet' }).closest('form')!);
describe('H13 Client bank account panel', () => {
  beforeEach(() => { vi.resetAllMocks(); vi.mocked(api.list).mockResolvedValue(result()); vi.mocked(api.create).mockResolvedValue(row); vi.mocked(api.update).mockResolvedValue(row); });
  afterEach(cleanup);
  it('renders masked profile accounts and existing scoped write capabilities', async () => {
    render(<ClientBankAccountsPanel clientId="client-a" />);
    expect(await screen.findByText(/TR33\*\*\*\*1326/)).toBeInTheDocument();
    expect(api.list).toHaveBeenCalledWith('client-a');
    expect(screen.getByLabelText('IBAN')).toHaveValue('');
  });
  it('related read-only actor gets no add/edit control and no write', async () => {
    vi.mocked(api.list).mockResolvedValue(result(false)); render(<ClientBankAccountsPanel clientId="client-a" />);
    expect(await screen.findByText(/değiştirme yetkiniz yok/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Düzenle/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('IBAN')).not.toBeInTheDocument(); expect(api.create).not.toHaveBeenCalled();
  });
  it('creates only profile fields through the parent-specific API', async () => {
    vi.mocked(api.list).mockResolvedValue(result(true, [])); render(<ClientBankAccountsPanel clientId="client-a" />);
    await screen.findByText('Kayıtlı banka hesabı yok.');
    fireEvent.change(screen.getByLabelText('Banka adı'), { target: { value: ' New bank ' } });
    fireEvent.change(screen.getByLabelText('IBAN'), { target: { value: 'TR330006100519786457841326' } });
    submit(); await waitFor(() => expect(api.create).toHaveBeenCalledWith('client-a', { bankName: 'New bank', branchName: null, accountHolder: null, iban: 'TR330006100519786457841326', isPrimary: false }));
    await screen.findByText('Banka hesabı kaydedildi.');
    expect(screen.getByLabelText('IBAN')).toHaveValue('');
  });
  it('update sends changed fields only; masked IBAN is never a writable default', async () => {
    render(<ClientBankAccountsPanel clientId="client-a" />); fireEvent.click(await screen.findByRole('button', { name: 'Düzenle: Bank A' }));
    expect(screen.getByLabelText('IBAN')).toHaveValue('');
    fireEvent.change(screen.getByLabelText('Şube'), { target: { value: 'New branch' } });
    submit(); await waitFor(() => expect(api.update).toHaveBeenCalledWith('client-a', 'account-a', { branchName: 'New branch' }));
    expect(JSON.stringify(vi.mocked(api.update).mock.calls)).not.toContain('TR33****1326');
  });
  it('duplicate denial stays an explicit error, never success or empty-list acceptance', async () => {
    vi.mocked(api.update).mockRejectedValue(Object.assign(new Error('Bu müvekkilde aynı IBAN zaten kayıtlı.'), { status: 409 }));
    render(<ClientBankAccountsPanel clientId="client-a" />); fireEvent.click(await screen.findByRole('button', { name: 'Düzenle: Bank A' }));
    fireEvent.change(screen.getByLabelText('IBAN'), { target: { value: 'GB82WEST12345698765432' } });
    submit(); expect(await screen.findByRole('alert')).toHaveTextContent('aynı IBAN');
    expect(screen.queryByText('Banka hesabı kaydedildi.')).not.toBeInTheDocument(); expect(screen.queryByText('Kayıtlı banka hesabı yok.')).not.toBeInTheDocument();
  });
  it('lost authority during update clears stale bank data and form', async () => {
    vi.mocked(api.update).mockRejectedValue(Object.assign(new Error('Erişim reddedildi'), { status: 403 }));
    render(<ClientBankAccountsPanel clientId="client-a" />); fireEvent.click(await screen.findByRole('button', { name: 'Düzenle: Bank A' }));
    submit(); expect(await screen.findByRole('alert')).toHaveTextContent('Erişim reddedildi');
    expect(screen.queryByText(/TR33\*\*\*\*1326/)).not.toBeInTheDocument(); expect(screen.queryByLabelText('IBAN')).not.toBeInTheDocument();
  });
  it('load denial is visible and never masquerades as empty data', async () => {
    vi.mocked(api.list).mockRejectedValue(Object.assign(new Error('Müvekkil bulunamadı'), { status: 404 }));
    render(<ClientBankAccountsPanel clientId="client-a" />); expect(await screen.findByRole('alert')).toHaveTextContent('Müvekkil bulunamadı');
    expect(screen.queryByText('Kayıtlı banka hesabı yok.')).not.toBeInTheDocument();
  });
  it('Client navigation ignores old late replies and discards previous form data', async () => {
    let resolve!: (value: ReturnType<typeof result>) => void;
    vi.mocked(api.list).mockImplementationOnce(() => new Promise(r => { resolve = r; })).mockResolvedValueOnce(result(true, [{ ...row, id: 'b', bankName: 'Bank B', ibanMasked: 'GB82****5432' }]));
    const view = render(<ClientBankAccountsPanel clientId="client-a" />);
    view.rerender(<ClientBankAccountsPanel clientId="client-b" />); await screen.findByText(/GB82\*\*\*\*5432/);
    await act(async () => { resolve(result()); });
    expect(screen.queryByText(/TR33\*\*\*\*1326/)).not.toBeInTheDocument(); expect(screen.getByLabelText('Banka adı')).toHaveValue('');
  });
  it('old mutation completion cannot announce success or refresh under a new Client', async () => {
    let resolve!: (value: typeof row) => void; vi.mocked(api.update).mockImplementation(() => new Promise(r => { resolve = r; }));
    const view = render(<ClientBankAccountsPanel clientId="client-a" />); fireEvent.click(await screen.findByRole('button', { name: 'Düzenle: Bank A' }));
    submit(); await waitFor(() => expect(api.update).toHaveBeenCalledTimes(1));
    view.rerender(<ClientBankAccountsPanel clientId="client-b" />); await waitFor(() => expect(api.list).toHaveBeenCalledWith('client-b'));
    await act(async () => { resolve(row); });
    expect(screen.queryByText('Banka hesabı kaydedildi.')).not.toBeInTheDocument(); expect(api.list).toHaveBeenCalledTimes(2);
  });
});

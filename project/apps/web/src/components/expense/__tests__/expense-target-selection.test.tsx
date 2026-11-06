import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ExpenseRequestModal } from '../ExpenseRequestModal';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({ api: {
  getCostPackages: vi.fn(), getExpenseCatalog: vi.fn(), computeExpenseRequest: vi.fn(),
  createExpenseRequest: vi.fn(), createExpenseRequestFromPackage: vi.fn(), sendExpenseEmail: vi.fn(),
} }));
const candidates = [{ clientId: 'a', name: 'Alacaklı A' }, { clientId: 'b', name: 'Alacaklı B' }];
const props = { isOpen: true, onClose: vi.fn(), caseId: 'case-a', clientId: '', clientName: '', caseFileNumber: '3b', targetClients: candidates };
const setup = async () => { await screen.findByRole('combobox', { name: 'Masraf hedefi' }); fireEvent.change(screen.getAllByRole('spinbutton')[0], { target: { value: '100' } }); };
describe('3b canonical expense target selection', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(api.getCostPackages).mockResolvedValue([{ code: 'p', name: 'Paket', items: [] }] as never);
    vi.mocked(api.getExpenseCatalog).mockResolvedValue([{ code: 'TEBLIGAT_GIDERI', officeLabel: 'Tebligat', manualDescriptionRequired: true }] as never);
    vi.mocked(api.computeExpenseRequest).mockResolvedValue({ items: [{ itemCode: 'TEBLIGAT_GIDERI', label: 'Tebligat', suggestedAmount: 100, finalAmount: 100, isEditable: true }] } as never);
    vi.mocked(api.createExpenseRequest).mockResolvedValue({ id: 'expense-b' } as never);
    vi.mocked(api.createExpenseRequestFromPackage).mockResolvedValue({ id: 'expense-p' } as never);
  });
  it('multiple candidates are not silently selected; manual request carries the explicit Client.id', async () => {
    render(<ExpenseRequestModal {...props} />); await setup();
    const select = screen.getByLabelText('Masraf hedefi'); expect(select).toHaveValue('');
    const create = screen.getByRole('button', { name: 'Oluştur' }); expect(create).toBeDisabled();
    fireEvent.click(create); expect(api.createExpenseRequest).not.toHaveBeenCalled();
    fireEvent.change(select, { target: { value: 'b' } }); fireEvent.click(create);
    await waitFor(() => expect(api.createExpenseRequest).toHaveBeenCalledWith(expect.objectContaining({ caseId: 'case-a', clientId: 'b' })));
    expect(api.createExpenseRequest).toHaveBeenCalledTimes(1); expect(api.sendExpenseEmail).not.toHaveBeenCalled();
  });
  it('sole candidate may auto-select; an explicit drawer target stays explicit', async () => {
    const { rerender } = render(<ExpenseRequestModal {...props} targetClients={[candidates[0]]} />); await setup();
    expect(screen.getByLabelText('Masraf hedefi')).toHaveValue('a');
    rerender(<ExpenseRequestModal {...props} clientId="b" />);
    await waitFor(() => expect(screen.getByLabelText('Masraf hedefi')).toHaveValue('b'));
  });
  it('zero candidates or invalid explicit target cannot fall back to another client', async () => {
    const { rerender } = render(<ExpenseRequestModal {...props} targetClients={[]} />); await setup();
    expect(screen.getByRole('button', { name: 'Oluştur' })).toBeDisabled();
    rerender(<ExpenseRequestModal {...props} clientId="legacy" targetClients={[candidates[0]]} />);
    await waitFor(() => expect(screen.getByLabelText('Masraf hedefi')).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Oluştur' })).toBeDisabled(); expect(api.createExpenseRequest).not.toHaveBeenCalled();
  });
  it('case change clears the prior selection instead of reusing its target', async () => {
    const { rerender } = render(<ExpenseRequestModal {...props} />); await setup();
    fireEvent.change(screen.getByLabelText('Masraf hedefi'), { target: { value: 'b' } });
    rerender(<ExpenseRequestModal {...props} caseId="case-c" />);
    await waitFor(() => expect(screen.getByLabelText('Masraf hedefi')).toHaveValue(''));
    expect(screen.getByRole('button', { name: 'Oluştur' })).toBeDisabled();
  });
  it('package request also uses the explicit target', async () => {
    render(<ExpenseRequestModal {...props} initialPackageCode="p" />);
    await waitFor(() => expect(api.computeExpenseRequest).toHaveBeenCalled());
    fireEvent.change(screen.getByLabelText('Masraf hedefi'), { target: { value: 'b' } });
    const create = screen.getByRole('button', { name: 'Oluştur' }); await waitFor(() => expect(create).not.toBeDisabled()); fireEvent.click(create);
    await waitFor(() => expect(api.createExpenseRequestFromPackage).toHaveBeenCalledWith(expect.objectContaining({ clientId: 'b', caseId: 'case-a', sendEmail: false })));
  });
});

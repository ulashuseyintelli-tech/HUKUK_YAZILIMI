import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import EditClientPage from '../page';

const state = vi.hoisted(() => ({ id: 'client-A', get: vi.fn(), put: vi.fn(), push: vi.fn() }));
vi.mock('next/navigation', () => ({ useParams: () => ({ clientId: state.id }), useRouter: () => ({ push: state.push }) }));
vi.mock('next/link', () => ({ default: ({ children, href }: any) => <a href={href}>{children}</a> }));
vi.mock('@/lib/api', () => ({ api: { getClient: state.get, put: state.put } }));
vi.mock('@/lib/client-mutation-capabilities', () => ({ useClientMutationCapabilities: () => ({ loading: false, error: null, canUpdateStandard: true, canUpdateSensitive: true }) }));
vi.mock('@/components/client/client-form', () => ({ ClientForm: ({ initialValues, onSubmit }: any) => <div>
  <span>{initialValues.firstName}</span><button onClick={() => onSubmit(initialValues)}>Submit</button>
</div> }));
const client = (id: string, firstName: string) => ({ id, firstName, lastName: 'Test', displayName: firstName, name: firstName, type: 'PERSON', contacts: [], addresses: [], bankAccounts: [] });

describe('1b client edit object rejection and stale data', () => {
  beforeEach(() => { vi.clearAllMocks(); state.id = 'client-A'; });
  it('clears the previous Client while a new route loads and keeps a denial visible', async () => {
    state.get.mockResolvedValueOnce({ data: client('client-A', 'PreviousClient') });
    const view = render(<EditClientPage />); await screen.findByText('PreviousClient');
    let reject!: (error: unknown) => void;
    state.get.mockImplementationOnce(() => new Promise((_, no) => { reject = no; }));
    state.id = 'client-B'; view.rerender(<EditClientPage />);
    await waitFor(() => expect(screen.queryByText('PreviousClient')).not.toBeInTheDocument());
    await act(async () => reject({ status: 404, message: 'Client access rejected' }));
    expect(await screen.findByText('Client access rejected')).toBeInTheDocument();
    expect(screen.queryByText('Submit')).not.toBeInTheDocument(); expect(state.push).not.toHaveBeenCalled();
  });
  it('ignores a delayed response for the previous Client', async () => {
    let resolve!: (value: unknown) => void;
    state.get.mockImplementationOnce(() => new Promise(yes => { resolve = yes; }));
    const view = render(<EditClientPage />);
    state.get.mockResolvedValueOnce({ data: client('client-B', 'CurrentClient') });
    state.id = 'client-B'; view.rerender(<EditClientPage />); await screen.findByText('CurrentClient');
    await act(async () => resolve({ data: client('client-A', 'PreviousClient') }));
    expect(screen.queryByText('PreviousClient')).not.toBeInTheDocument(); expect(screen.getByText('CurrentClient')).toBeInTheDocument();
  });
  it.each([403, 404])('mutation %s is not success/navigation and removes the now-denied form', async status => {
    state.get.mockResolvedValue({ data: client('client-A', 'InitiallyAllowed') });
    state.put.mockRejectedValue({ status, message: 'Object scope denied' });
    render(<EditClientPage />); await screen.findByText('InitiallyAllowed'); fireEvent.click(screen.getByText('Submit'));
    expect(await screen.findByText('Object scope denied')).toBeInTheDocument();
    expect(screen.queryByText('InitiallyAllowed')).not.toBeInTheDocument(); expect(state.push).not.toHaveBeenCalled();
  });
});

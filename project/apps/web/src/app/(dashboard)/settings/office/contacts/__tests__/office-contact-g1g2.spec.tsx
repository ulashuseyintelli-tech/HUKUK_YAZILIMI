import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { api } from '@/lib/api';
import { OfficeContactPanel } from '@/components/settings/office-contact-panel';
import { StaffAccountReopenDialog } from '@/components/settings/staff-account-reopen-dialog';

vi.mock('@/lib/api', () => ({ api: { get: vi.fn(), patch: vi.fn(), post: vi.fn() } }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => ({ user: { id: 'actor' } }) }));
const mock = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const wrap = (data: unknown) => ({ data: { data } });
const fields = { address: 'adres', city: 'il', district: 'ilçe', postalCode: null, phone: 'ilk', fax: null, email: null, website: null };
const staff = [{ id: 's1', firstName: 'Birinci', lastName: 'Sentetik', phone: 'birinci', email: null, mobilePhone: null, whatsappPhone: null },
  { id: 's2', firstName: 'İkinci', lastName: 'Sentetik', phone: 'ikinci', email: null, mobilePhone: null, whatsappPhone: null }];
const capabilities = { office: true, staff: false, writeOffice: true, writeStaff: false, managePermissions: false };
const prime = (caps = capabilities) => mock.get.mockImplementation(async (url: string) => {
  if (url.endsWith('/capabilities')) return wrap(caps);
  if (url.endsWith('/office')) return wrap(fields);
  if (url.includes('/permissions/subjects')) return wrap({ items: [{ id: 's1', firstName: 'Birinci', lastName: 'Sentetik', isActive: false }], nextCursor: null });
  if (url.includes('/permissions/staff/')) return wrap({ staffId: 's1', canReceiveGrant: false, grants: [] });
  if (url.includes('/staff?')) return wrap({ items: staff, nextCursor: null });
  throw new Error('Unexpected request ' + url);
});
beforeEach(() => { for (const fn of Object.values(mock)) fn.mockReset(); });
afterEach(() => { cleanup(); vi.restoreAllMocks(); });

describe('G1/G2 bounded contact UI', () => {
  it('sends only the changed G1 contact and updates its baseline after success', async () => {
    prime(); mock.patch.mockResolvedValue(wrap({ ...fields, phone: 'yeni' })); render(<OfficeContactPanel />);
    fireEvent.change(await screen.findByLabelText('Telefon'), { target: { value: 'yeni' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await screen.findByText('İletişim bilgileri kaydedildi.');
    expect(mock.patch).toHaveBeenCalledExactlyOnceWith('/office-contact/office', { phone: 'yeni' });
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: 'ilk' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mock.patch).toHaveBeenCalledTimes(2));
    expect(mock.patch.mock.calls[1]).toEqual(['/office-contact/office', { phone: 'ilk' }]);
    expect(mock.get.mock.calls.every(([url]) => !/smtp|bank|lawyer/.test(url))).toBe(true);
  });
  it('does not request forbidden groups and does not turn denial into an empty success', async () => {
    prime({ office: false, staff: false, writeOffice: false, writeStaff: false, managePermissions: false }); render(<OfficeContactPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('işlem yetkiniz yok');
    expect(mock.get).toHaveBeenCalledTimes(1); expect(screen.queryByRole('button', { name: 'Kaydet' })).not.toBeInTheDocument();
  });
  it('403 clears contact data and offers refresh without retrying the mutation', async () => {
    prime(); mock.patch.mockRejectedValue({ status: 403 }); render(<OfficeContactPanel />);
    fireEvent.change(await screen.findByLabelText('Telefon'), { target: { value: 'yeni' } }); fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('yetkiniz yok');
    expect(screen.queryByLabelText('Telefon')).not.toBeInTheDocument(); expect(mock.patch).toHaveBeenCalledTimes(1);
    expect(screen.queryByText('İletişim bilgileri kaydedildi.')).not.toBeInTheDocument();
  });
  it('selecting another staff member clears the first member and G2 sends only a changed contact', async () => {
    prime({ office: false, staff: true, writeOffice: false, writeStaff: true, managePermissions: false });
    mock.patch.mockResolvedValue(wrap({ email: null, phone: 'ikinci-yeni', mobilePhone: null, whatsappPhone: null })); render(<OfficeContactPanel />);
    const selector = await screen.findByLabelText('İletişimi düzenlenecek personel');
    fireEvent.change(selector, { target: { value: 's1' } }); expect(screen.getByLabelText('Telefon')).toHaveValue('birinci');
    fireEvent.change(selector, { target: { value: 's2' } }); expect(screen.getByLabelText('Telefon')).toHaveValue('ikinci');
    fireEvent.change(screen.getByLabelText('Telefon'), { target: { value: 'ikinci-yeni' } }); fireEvent.click(screen.getByRole('button', { name: 'Kaydet' }));
    await waitFor(() => expect(mock.patch).toHaveBeenCalledExactlyOnceWith('/office-contact/staff/s2', { phone: 'ikinci-yeni' }));
  });
  it('F01 read-only capability exposes contacts but no new write control', async () => {
    prime({ ...capabilities, writeOffice: false }); render(<OfficeContactPanel />);
    expect(await screen.findByLabelText('Telefon')).toBeDisabled(); expect(screen.queryByRole('button', { name: 'Kaydet' })).not.toBeInTheDocument();
  });
  it('passive subject permissions remain revocable without opening the account', async () => {
    prime({ office: false, staff: false, writeOffice: false, writeStaff: false, managePermissions: true }); mock.post.mockResolvedValue(wrap({ revoked: 1 })); render(<OfficeContactPanel />);
    fireEvent.change(await screen.findByLabelText('İzin verilecek personel'), { target: { value: 's1' } });
    await screen.findByLabelText('Gerekçe'); expect(screen.getByRole('button', { name: 'Süreli izin ver' })).toBeDisabled();
    fireEvent.change(screen.getByLabelText('Gerekçe'), { target: { value: 'Sentetik geri alma' } });
    fireEvent.click(screen.getByRole('button', { name: 'İlgili izinleri geri al' }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledExactlyOnceWith('/office-contact/permissions/staff/s1/revoke', { permissionKey: 'office.contact.manage', reason: 'Sentetik geri alma' }));
    expect(mock.post.mock.calls.every(([url]) => !/reopen|reactivate/.test(url))).toBe(true);
  });
  it('network failure is visible and does not render prior contact data', async () => {
    mock.get.mockRejectedValue(new Error('synthetic network failure')); render(<OfficeContactPanel />);
    expect(await screen.findByRole('alert')).toHaveTextContent('İşlem doğrulanamadı'); expect(screen.queryByLabelText('Telefon')).not.toBeInTheDocument();
  });
  it('O-5 keeps contact write grants in a separate unchecked group and sends separate selections', async () => {
    const grants = ['office.tasks.view_all', 'office.expenses.view_all', 'office.cases.view_all'].map((permissionKey, i) => ({ id: `v${i}`, permissionKey, validFrom: '2026-01-01T00:00:00Z', validUntil: null, startsInFuture: false }));
    const review = { staffId: 's1', reopenable: true, reason: null, account: { role: 'USER', isActive: false, hasPassword: true },
      allowGrants: grants, denyKeys: [], reviewFingerprint: 'a'.repeat(64), contactAllowGrants: [{ id: 'c1', permissionKey: 'office.contact.manage', validFrom: '2026-01-01T00:00:00Z', validUntil: '2027-01-01T00:00:00Z', startsInFuture: false }], contactDenyKeys: ['staff.contact.manage'] };
    mock.get.mockResolvedValue(wrap(review)); mock.post.mockResolvedValue(wrap({ account: { isActive: true }, keptGrantCount: 1, expiredGrantCount: 2, keptContactGrantCount: 1, expiredContactGrantCount: 0, sessionsInvalidated: true }));
    render(<StaffAccountReopenDialog staffId="s1" staffName="Sentetik" onClose={vi.fn()} />);
    const contacts = await screen.findByRole('group', { name: 'Korunacak iletişim yazma izinleri (G1/G2)' });
    const views = screen.getByRole('group', { name: 'Korunacak büro geneli görünüm izinleri' });
    expect(within(views).getAllByRole('checkbox')).toHaveLength(3);
    expect(within(contacts).getByRole('checkbox')).not.toBeChecked();
    fireEvent.click(within(contacts).getByRole('checkbox')); fireEvent.click(within(views).getAllByRole('checkbox')[2]);
    fireEvent.click(screen.getByRole('button', { name: 'Giriş hesabını aç' }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledExactlyOnceWith('/staff/s1/account-reopen', { reviewFingerprint: 'a'.repeat(64), keepGrantIds: ['v2'], keepContactGrantIds: ['c1'] }));
    expect(await screen.findByRole('status')).toHaveTextContent('1 iletişim izni korundu');
  });
  it('O-5 new selection requirement is visible and refreshes without an automatic retry', async () => {
    mock.get.mockResolvedValue(wrap({ staffId: 's1', reopenable: true, reason: null, account: { role: 'USER', isActive: false, hasPassword: true }, allowGrants: [], denyKeys: [], reviewFingerprint: 'a'.repeat(64), contactAllowGrants: [], contactDenyKeys: [] }));
    mock.post.mockRejectedValue({ status: 409, body: { code: 'STAFF_CONTACT_REVIEW_REQUIRED' } });
    render(<StaffAccountReopenDialog staffId="s1" staffName="Sentetik" onClose={vi.fn()} />);
    fireEvent.click(await screen.findByRole('button', { name: 'Giriş hesabını aç' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('İncelemeyi yenileyip');
    expect(screen.getByRole('button', { name: 'İncelemeyi yenile' })).toBeInTheDocument(); expect(mock.post).toHaveBeenCalledTimes(1);
  });
});

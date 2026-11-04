import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import PermissionsPage from '../permissions/page';
import QueuePage from '../page';
import { api } from '@/lib/api';

const auth = vi.hoisted(() => ({ user: { role: 'ADMIN', id: 'admin-a', tenantId: 'tenant-a' }, loading: false }));
vi.mock('@/lib/auth-context', () => ({ useAuth: () => auth }));
vi.mock('@/lib/api', () => ({ api: {
  listIntakeReviewPermissionSubjects: vi.fn(), getIntakeReviewPermission: vi.fn(),
  grantIntakeReviewPermission: vi.fn(), revokeIntakeReviewPermission: vi.fn(), listIntakeSubmissions: vi.fn(),
} }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
const subject = { id: 'user-1', displayName: 'Sentetik Kişi', isActive: true, profileActive: true, canReceiveGrant: true };
const state = { subject, permissionKey: 'client.intake.review', scope: 'GLOBAL', effectiveEffect: 'NONE', canReview: false, revocableAllowCount: 0, scheduledAllowCount: 0 };
const mocks = vi.mocked(api);
beforeEach(() => {
  vi.resetAllMocks(); auth.user.role = 'ADMIN'; auth.user.id = 'admin-a'; auth.user.tenantId = 'tenant-a';
  mocks.listIntakeReviewPermissionSubjects.mockResolvedValue({ items: [subject], nextCursor: null });
  mocks.getIntakeReviewPermission.mockResolvedValue(state as any);
  mocks.listIntakeSubmissions.mockResolvedValue([]);
});
afterEach(cleanup);
async function selectSubject() {
  render(<PermissionsPage />); await screen.findByRole('option', { name: subject.displayName });
  fireEvent.change(screen.getByLabelText('Kişi'), { target: { value: subject.id } });
  await screen.findByRole('region', { name: 'İzin durumu' });
}

describe('Intake permission administration UI', () => {
  it('clears prior-tenant subjects/state and ignores their delayed read after the ADMIN identity changes', async () => {
    let resolveOld!: (value: any) => void;
    mocks.listIntakeReviewPermissionSubjects.mockReturnValueOnce(new Promise(resolve => { resolveOld = resolve; }));
    const view = render(<PermissionsPage />);
    await waitFor(() => expect(mocks.listIntakeReviewPermissionSubjects).toHaveBeenCalledTimes(1));
    auth.user.tenantId = 'tenant-b'; auth.user.id = 'admin-b';
    mocks.listIntakeReviewPermissionSubjects.mockResolvedValue({ items: [{ ...subject, id: 'user-b', displayName: 'Tenant B' }], nextCursor: null });
    view.rerender(<PermissionsPage />);
    await screen.findByRole('option', { name: 'Tenant B' });
    resolveOld({ items: [subject], nextCursor: null });
    await waitFor(() => expect(screen.queryByRole('option', { name: subject.displayName })).toBeNull());
    expect(screen.getByRole('option', { name: 'Tenant B' })).toBeTruthy();
  });
  it('exposes the entry point only to ADMIN and refuses direct non-ADMIN UI access without loading subjects', async () => {
    render(<QueuePage />); expect(screen.getByRole('link', { name: 'İnceleme izinleri' }).getAttribute('href')).toBe('/client-intake/permissions');
    cleanup(); auth.user.role = 'USER'; render(<QueuePage />);
    expect(screen.queryByRole('link', { name: 'İnceleme izinleri' })).toBeNull(); cleanup();
    render(<PermissionsPage />); expect(screen.getByRole('alert').textContent).toContain('yalnız ADMIN');
    expect(mocks.listIntakeReviewPermissionSubjects).not.toHaveBeenCalled();
  });

  it('sends only bounded grant fields and refreshes the effective state after the write', async () => {
    await selectSubject(); fireEvent.change(screen.getByLabelText('Gerekçe'), { target: { value: 'Dar izin' } });
    mocks.grantIntakeReviewPermission.mockResolvedValue({ id: 'grant-1' });
    mocks.getIntakeReviewPermission.mockResolvedValue({ ...state, effectiveEffect: 'ALLOW', canReview: true, revocableAllowCount: 1 } as any);
    fireEvent.click(screen.getByRole('button', { name: 'İnceleme izni ver' }));
    await waitFor(() => expect(mocks.grantIntakeReviewPermission).toHaveBeenCalledWith('user-1', { reason: 'Dar izin', validFrom: undefined, validUntil: undefined }));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(mocks.getIntakeReviewPermission).toHaveBeenCalledTimes(2);
    expect(screen.getByRole('region').textContent).toContain('Yetkili');
  });

  it('shows DENY precedence honestly and uses the separate revoke call without editing DENY', async () => {
    mocks.getIntakeReviewPermission.mockResolvedValue({ ...state, effectiveEffect: 'DENY', revocableAllowCount: 2 } as any);
    await selectSubject(); expect(screen.getByText(/DENY devam ediyor/)).toBeTruthy();
    mocks.revokeIntakeReviewPermission.mockResolvedValue({ revoked: 2 });
    mocks.getIntakeReviewPermission.mockResolvedValue({ ...state, effectiveEffect: 'DENY' } as any);
    fireEvent.click(screen.getByRole('button', { name: 'ALLOW izinlerini geri al' }));
    await waitFor(() => expect(mocks.revokeIntakeReviewPermission).toHaveBeenCalledWith('user-1', undefined));
    expect(await screen.findByRole('status')).toBeTruthy();
    expect(screen.getByRole('region').textContent).toContain('Yetkisiz');
  });

  it('keeps inactive/profile-ineligible targets revocable but disables new grants', async () => {
    mocks.getIntakeReviewPermission.mockResolvedValue({ ...state, subject: { ...subject, canReceiveGrant: false }, revocableAllowCount: 1 } as any);
    await selectSubject();
    expect((screen.getByRole('button', { name: 'İnceleme izni ver' }) as HTMLButtonElement).disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'ALLOW izinlerini geri al' }) as HTMLButtonElement).disabled).toBe(false);
  });

  it('does not announce success on a rejected write or leave the old state after a successful write with failed readback', async () => {
    await selectSubject(); mocks.grantIntakeReviewPermission.mockRejectedValueOnce(new Error('denied'));
    fireEvent.click(screen.getByRole('button', { name: 'İnceleme izni ver' })); await screen.findByRole('alert');
    expect(screen.queryByRole('status')).toBeNull();
    mocks.grantIntakeReviewPermission.mockResolvedValue({ id: 'grant' });
    mocks.getIntakeReviewPermission.mockRejectedValueOnce(new Error('readback'));
    fireEvent.click(screen.getByRole('button', { name: 'İnceleme izni ver' }));
    await screen.findByText(/İşlem kaydedildi; güncel izin durumu okunamadı/);
    expect(screen.queryByRole('region')).toBeNull(); expect(screen.queryByRole('status')).toBeNull();
  });
});

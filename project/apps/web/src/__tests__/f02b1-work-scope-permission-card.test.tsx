import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { WorkScopePermissionCard } from '@/components/settings/work-scope-permission-card';
import { api } from '@/lib/api';

/**
 * F02-B-1 (owner kararı 29–30.10.2026) — kişi kartı "Büro Geneli Görünüm İzinleri" bloğu.
 *
 * Kanıtlanan sözleşme:
 *  1. Yalnız ADMIN görür; USER için hiçbir şey render edilmez (API çağrısı yok).
 *  2. İki AYRI anahtar (görevler, masraflar); mevcut durum API'den okunur (DENY > ALLOW > varsayılan).
 *  3. Seçim → ALLOW/DENY: setWorkScopePermission(personType, personId, key, effect); varsayılan → revokeWorkScopePermission; ardından yeniden okunur.
 *  4. Hesapsız kart (linked:false) ve kaydedilmemiş form: seçimler pasif, neden gösterilir.
 *  5. Metin: izin müvekkil okuma / dosyaya bağlama yetkisi VERMEZ.
 */

let role: 'ADMIN' | 'USER' = 'ADMIN';
vi.mock('@/lib/auth-context', () => ({
  useAuth: () => ({ user: { id: 'u1', tenantId: 't1', role }, loading: false }),
}));

vi.mock('@/lib/api', () => ({
  api: { getWorkScopePermissions: vi.fn(), setWorkScopePermission: vi.fn(), revokeWorkScopePermission: vi.fn() },
}));

const mocked = api as unknown as Record<string, ReturnType<typeof vi.fn>>;
const STATE = (over: Partial<{ linked: boolean; tasks: string; expenses: string }> = {}) => ({
  personType: 'lawyer', personId: 'l1', linked: over.linked ?? true,
  permissions: [
    { key: 'office.tasks.view_all', effect: over.tasks ?? 'NONE', validUntil: null },
    { key: 'office.expenses.view_all', effect: over.expenses ?? 'ALLOW', validUntil: null },
  ],
});

describe('F02-B-1 — WorkScopePermissionCard', () => {
  beforeEach(() => {
    role = 'ADMIN';
    Object.values(mocked).forEach((m) => m.mockReset());
    mocked.getWorkScopePermissions.mockResolvedValue(STATE());
    mocked.setWorkScopePermission.mockResolvedValue({ key: 'office.tasks.view_all', effect: 'ALLOW', validUntil: null, supersededCount: 0 });
    mocked.revokeWorkScopePermission.mockResolvedValue({ key: 'office.expenses.view_all', revoked: 1 });
  });
  afterEach(() => cleanup());

  it('ADMIN: iki anahtar ayrı seçimlerle, mevcut durum API\'den; metin müvekkil yetkisi vermediğini söyler', async () => {
    render(<WorkScopePermissionCard personType="lawyer" personId="l1" formDirty={false} />);
    await waitFor(() => expect(mocked.getWorkScopePermissions).toHaveBeenCalledWith('lawyer', 'l1'));
    const tasks = (await screen.findByTestId('work-scope-select-office.tasks.view_all')) as HTMLSelectElement;
    const expenses = screen.getByTestId('work-scope-select-office.expenses.view_all') as HTMLSelectElement;
    await waitFor(() => expect(expenses.value).toBe('ALLOW'));
    expect(tasks.value).toBe('NONE');
    expect(screen.getByText(/dosyaya bağlama yetkisi/i)).toBeTruthy();
    expect(tasks.disabled).toBe(false);
  });

  it('seçim ALLOW → setWorkScopePermission doğru gövdeyle; sonra yeniden okunur', async () => {
    render(<WorkScopePermissionCard personType="staff" personId="s1" formDirty={false} />);
    const tasks = (await screen.findByTestId('work-scope-select-office.tasks.view_all')) as HTMLSelectElement;
    await waitFor(() => expect(tasks.disabled).toBe(false));
    fireEvent.change(tasks, { target: { value: 'ALLOW' } });
    await waitFor(() => expect(mocked.setWorkScopePermission).toHaveBeenCalledWith({ personType: 'staff', personId: 's1', key: 'office.tasks.view_all', effect: 'ALLOW' }));
    await waitFor(() => expect(mocked.getWorkScopePermissions).toHaveBeenCalledTimes(2));
    expect(mocked.revokeWorkScopePermission).not.toHaveBeenCalled();
  });

  it('seçim varsayılan → revokeWorkScopePermission (ALLOW ve DENY birlikte kalkar); DENY seçimi set(DENY)', async () => {
    render(<WorkScopePermissionCard personType="lawyer" personId="l1" formDirty={false} />);
    const expenses = (await screen.findByTestId('work-scope-select-office.expenses.view_all')) as HTMLSelectElement;
    await waitFor(() => expect(expenses.value).toBe('ALLOW'));
    fireEvent.change(expenses, { target: { value: 'NONE' } });
    await waitFor(() => expect(mocked.revokeWorkScopePermission).toHaveBeenCalledWith({ personType: 'lawyer', personId: 'l1', key: 'office.expenses.view_all' }));
    await waitFor(() => expect(mocked.getWorkScopePermissions).toHaveBeenCalledTimes(2));
    const tasks = screen.getByTestId('work-scope-select-office.tasks.view_all') as HTMLSelectElement;
    await waitFor(() => expect(tasks.disabled).toBe(false));
    fireEvent.change(tasks, { target: { value: 'DENY' } });
    await waitFor(() => expect(mocked.setWorkScopePermission).toHaveBeenCalledWith({ personType: 'lawyer', personId: 'l1', key: 'office.tasks.view_all', effect: 'DENY' }));
  });

  it('hesapsız kart: seçimler pasif + "önce davet" nedeni; kaydedilmemiş form: "Önce formu kaydedin"', async () => {
    mocked.getWorkScopePermissions.mockResolvedValue(STATE({ linked: false, expenses: 'NONE' }));
    render(<WorkScopePermissionCard personType="lawyer" personId="l1" formDirty={false} />);
    await waitFor(() => expect(screen.getByTestId('work-scope-disabled-reason').textContent).toMatch(/davet/));
    expect((screen.getByTestId('work-scope-select-office.tasks.view_all') as HTMLSelectElement).disabled).toBe(true);
    cleanup();
    mocked.getWorkScopePermissions.mockResolvedValue(STATE());
    render(<WorkScopePermissionCard personType="lawyer" personId="l1" formDirty={true} />);
    await waitFor(() => expect(screen.getByTestId('work-scope-disabled-reason').textContent).toMatch(/formu kaydedin/i));
    expect((screen.getByTestId('work-scope-select-office.expenses.view_all') as HTMLSelectElement).disabled).toBe(true);
    expect(mocked.setWorkScopePermission).not.toHaveBeenCalled();
  });

  it('USER: hiçbir şey render edilmez ve API çağrılmaz', async () => {
    role = 'USER';
    const { container } = render(<WorkScopePermissionCard personType="lawyer" personId="l1" formDirty={false} />);
    expect(container.querySelector('[data-testid="work-scope-permission-card"]')).toBeNull();
    expect(mocked.getWorkScopePermissions).not.toHaveBeenCalled();
  });
});

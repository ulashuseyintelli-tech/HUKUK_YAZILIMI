import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
import { ViewScopeBadge, VIEW_SCOPE_TEXT, VIEW_SCOPE_UNAVAILABLE } from '../ViewScopeBadge';
import { api } from '@/lib/api';

/**
 * F02-B görünürlük (owner ek talimatı 30.10.2026, madde 4) — kapsam rozeti sunucunun uyguladığı kapsamı AYNEN yazar;
 * yanıt yok / bozuksa kapsam UYDURMAZ. stable key: components/scope/ViewScopeBadge.tsx
 */
vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));
const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

const MODES = ['OFF', 'TENANT', 'BOUND'] as const;
const serverState = (expenses: (typeof MODES)[number], tasks: (typeof MODES)[number]) => ({
  data: {
    expenses: { flagEnabled: expenses !== 'OFF', resolution: expenses === 'TENANT' ? 'ALLOW' : 'NONE', mode: expenses },
    tasks: { flagEnabled: tasks !== 'OFF', resolution: tasks === 'TENANT' ? 'ALLOW' : 'NONE', mode: tasks },
  },
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe('ViewScopeBadge — F02-B uygulanan kapsam rozeti', () => {
  it.each(MODES)('görev alanı mode=%s → sunucu kapsamını AYNEN yazar; kaynak GET /office/view-scope', async (mode) => {
    mocked.get.mockResolvedValue(serverState('OFF', mode));
    render(<ViewScopeBadge area="tasks" />);
    const el = await screen.findByTestId('view-scope-badge');
    expect(el.getAttribute('data-scope-mode')).toBe(mode);
    expect(el.textContent).toBe(VIEW_SCOPE_TEXT.tasks[mode]);
    expect(mocked.get).toHaveBeenCalledWith('/office/view-scope');
    expect(mocked.get).toHaveBeenCalledTimes(1);
  });

  it('masraf alanı kendi metnini kullanır; görev kapsamından bağımsız (anahtarlar ayrı)', async () => {
    mocked.get.mockResolvedValue(serverState('BOUND', 'TENANT'));
    render(<ViewScopeBadge area="expenses" />);
    const el = await screen.findByTestId('view-scope-badge');
    expect(el.getAttribute('data-scope-mode')).toBe('BOUND');
    expect(el.textContent).toBe(VIEW_SCOPE_TEXT.expenses.BOUND);
  });

  it('istek hatası → "alınamadı"; kapsam UYDURULMAZ', async () => {
    mocked.get.mockRejectedValue(new Error('ağ'));
    render(<ViewScopeBadge area="tasks" />);
    const el = await screen.findByTestId('view-scope-badge');
    expect(el.textContent).toBe(VIEW_SCOPE_UNAVAILABLE);
    expect(el.getAttribute('data-scope-mode')).toBe('UNAVAILABLE');
  });

  it('biçimi bozuk yanıt → "alınamadı" (sessiz varsayılan yok)', async () => {
    mocked.get.mockResolvedValue({ data: { expenses: { mode: 'ALL' }, tasks: null } });
    render(<ViewScopeBadge area="expenses" />);
    expect((await screen.findByTestId('view-scope-badge')).textContent).toBe(VIEW_SCOPE_UNAVAILABLE);
  });

  it('yüklenirken hiçbir kapsam yazmaz (boş)', () => {
    mocked.get.mockReturnValue(new Promise(() => undefined));
    const { container } = render(<ViewScopeBadge area="tasks" />);
    expect(container.textContent).toBe('');
  });
});

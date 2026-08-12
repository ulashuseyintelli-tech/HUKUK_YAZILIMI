import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup, act } from '@testing-library/react';
import { CaseAutomationPanel } from '../CaseAutomationPanel';
import { icrabotApi } from '@/lib/api/icrabot';

/**
 * PR-2A1 — ICRABOT GOREV ONAYI DAVRANIS MATRISI
 * stable key: components/icrabot/CaseAutomationPanel.tsx#handleApproveTask
 */

vi.mock('@/lib/api/icrabot', () => ({
  icrabotApi: {
    getDigitalTwin: vi.fn(),
    getPendingTasks: vi.fn(),
    approveTask: vi.fn(),
    rejectTask: vi.fn(),
  },
}));

const mocked = icrabotApi as unknown as Record<string, ReturnType<typeof vi.fn>>;

const TWIN = { caseId: 'case-1', stage: 'TAKIP', riskLevel: 'LOW', nextActions: [] };
const TASKS = [{ id: 'task-1', recipeId: 'HACIZ_TALEBI', status: 'NEEDS_APPROVAL' }];

function primeReads(over: Record<string, unknown> = {}) {
  mocked.getDigitalTwin.mockImplementation(() => {
    const hit = over.twin ?? { data: TWIN };
    return hit instanceof Error ? Promise.reject(hit) : Promise.resolve(hit);
  });
  mocked.getPendingTasks.mockImplementation(() => {
    const hit = over.tasks ?? { data: TASKS };
    return hit instanceof Error ? Promise.reject(hit) : Promise.resolve(hit);
  });
}

async function renderPanel() {
  render(<CaseAutomationPanel caseId="case-1" />);
  await screen.findByText(/HACIZ_TALEBI/);
  const approve = screen
    .getAllByRole('button')
    .find((b) => /onayla/i.test(b.textContent ?? ''));
  if (!approve) throw new Error('onay dugmesi bulunamadi');
  return approve as HTMLButtonElement;
}

let unhandled: unknown[] = [];
const onUnhandled = (e: PromiseRejectionEvent) => {
  unhandled.push(e.reason);
  e.preventDefault();
};

beforeEach(() => {
  for (const fn of Object.values(mocked)) fn.mockReset();
  primeReads();
  unhandled = [];
  window.addEventListener('unhandledrejection', onUnhandled);
});

afterEach(async () => {
  await new Promise((r) => setTimeout(r, 0));
  const unh = unhandled;
  window.removeEventListener('unhandledrejection', onUnhandled);
  cleanup();
  vi.restoreAllMocks();
  expect(unh).toHaveLength(0);
});

describe('icrabot#handleApproveTask', () => {
  it('success → approveTask(taskId) + canonical reload', async () => {
    mocked.approveTask.mockResolvedValueOnce({ data: {} });
    const approve = await renderPanel();
    const before = mocked.getPendingTasks.mock.calls.length;
    fireEvent.click(approve);

    await waitFor(() => expect(mocked.approveTask).toHaveBeenCalledWith('task-1'));
    await waitFor(() =>
      expect(mocked.getPendingTasks.mock.calls.length).toBeGreaterThan(before),
    );
  });

  it('backend hata → GORUNUR; gorev satiri KORUNUR', async () => {
    mocked.approveTask.mockRejectedValueOnce({ body: { message: 'Onay yetkiniz yok.' } });
    const approve = await renderPanel();
    fireEvent.click(approve);

    await screen.findByText(/Onay yetkiniz yok/i);
    expect(screen.getByText(/HACIZ_TALEBI/)).toBeTruthy();
  });

  it('AYNI goreve ayni-tick cift tik → TEK mutation', async () => {
    let release!: (v: unknown) => void;
    mocked.approveTask.mockImplementation(() => new Promise((res) => { release = res; }));
    const approve = await renderPanel();

    act(() => {
      approve.click();
      approve.click();
    });
    await Promise.resolve();
    expect(mocked.approveTask).toHaveBeenCalledTimes(1);

    await act(async () => {
      release({ data: {} });
    });
  });

  it('mutation OK + reload FAIL → SUCCESS_STALE + refresh-only (mutation 0)', async () => {
    mocked.approveTask.mockResolvedValueOnce({ data: {} });
    const approve = await renderPanel();
    primeReads({ tasks: new TypeError('Failed to fetch') });
    fireEvent.click(approve);

    await screen.findByTestId('stale-notice');
    expect(mocked.approveTask).toHaveBeenCalledTimes(1);

    primeReads();
    fireEvent.click(screen.getByTestId('stale-refresh'));
    await waitFor(() => expect(screen.queryByTestId('stale-notice')).toBeNull());
    expect(mocked.approveTask).toHaveBeenCalledTimes(1);
  });

  it('kaynakta bos catch / console.error KALMADI', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const src = fs.readFileSync(path.resolve(__dirname, '..', 'CaseAutomationPanel.tsx'), 'utf8');
    const i = src.indexOf('const handleApproveTask');
    const next = src.indexOf('const handle', i + 10);
    const seg = src.slice(i, next > i ? next : i + 1800);
    expect(seg).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
    expect(seg).not.toMatch(/console\.error/);
    expect(seg).toContain('runMutation');
  });
});

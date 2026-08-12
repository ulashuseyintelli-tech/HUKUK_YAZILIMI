import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent, cleanup } from '@testing-library/react';
import { CaseHearings } from '../case-hearings';
import { CaseDeadlines } from '../case-deadlines';
import { CaseExpenses } from '../case-expenses';
import { api } from '@/lib/api';

/**
 * PR-2A1 — ÜÇ REFERANS DOSYANIN ORTAK STATE MACHINE DAVRANIŞ MATRİSİ.
 *
 * Üçü de aynı sözleşmeyi uygulamalıdır; bu spec onu dosya-bağımsız olarak sürer.
 * Mutation aracı olarak SİLME kullanılır: form doldurmadan mutation → refresh →
 * stale → retry zincirinin tamamını sürebilen tek yol odur.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn(), post: vi.fn(), put: vi.fn(), patch: vi.fn(), delete: vi.fn() },
}));

const mocked = api as unknown as {
  get: ReturnType<typeof vi.fn>;
  put: ReturnType<typeof vi.fn>;
  patch: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};

/** Sunucudan gelen tek satır — her bileşenin zorunlu alanlarını birlikte taşır. */
const ROW = {
  id: 'row-1',
  // hearings
  date: new Date('2026-09-01T00:00:00.000Z').toISOString(),
  time: '10:00',
  court: 'Test Mahkemesi',
  type: 'ilk',
  status: 'scheduled',
  // deadlines
  title: 'Test Süresi',
  dueDate: new Date('2026-09-01T00:00:00.000Z').toISOString(),
  reminderDays: 3,
  isCompleted: false,
  createdAt: new Date('2026-08-01T00:00:00.000Z').toISOString(),
  // expenses
  category: 'harç',
  description: 'Test masrafı',
  amount: 100,
  billable: true,
  billed: false,
};

const ok = (rows: unknown[] = [ROW]) => ({ data: { data: rows } });
const netFail = () => Object.assign(new TypeError('Failed to fetch'), {});

const CASES = [
  { name: 'CaseHearings', Comp: CaseHearings, marker: 'Test Mahkemesi', deleteLabel: 'Duruşmayı sil' },
  { name: 'CaseDeadlines', Comp: CaseDeadlines, marker: 'Test Süresi', deleteLabel: 'Süreyi sil' },
  { name: 'CaseExpenses', Comp: CaseExpenses, marker: 'Test masrafı', deleteLabel: 'Masrafı sil' },
] as const;

let unhandled: unknown[] = [];
const onUnhandled = (e: PromiseRejectionEvent) => {
  unhandled.push(e.reason);
  e.preventDefault();
};

beforeEach(() => {
  mocked.get.mockReset();
  mocked.put.mockReset();
  mocked.patch.mockReset();
  mocked.delete.mockReset();
  unhandled = [];
  window.addEventListener('unhandledrejection', onUnhandled);
  vi.spyOn(window, 'confirm').mockReturnValue(true);
});

afterEach(async () => {
  // Bekleyen promise kalmadigini dogrula (maskeleme YOK: waitFor suresi buyutulmez).
  await new Promise((r) => setTimeout(r, 0));
  expect(unhandled).toHaveLength(0);
  cleanup();
  window.removeEventListener('unhandledrejection', onUnhandled);
  vi.restoreAllMocks();
});

describe.each(CASES)('$name — A1 referans state machine', ({ Comp, marker, deleteLabel }) => {
  it('initial network failure → görünür error, rejected promise YOK', async () => {
    mocked.get.mockRejectedValueOnce(netFail());
    render(<Comp caseId="case-1" />);

    await waitFor(() => expect(screen.getAllByTestId('action-error').length).toBeGreaterThan(0));
    expect(screen.getAllByTestId('action-error')[0]).toHaveTextContent(/Sunucuya ulaşılamadı/);

    await new Promise((r) => setTimeout(r, 0));
    expect(unhandled).toHaveLength(0);
  });

  it('{ data: [] } → DOĞRULANMIŞ empty, hata DEĞİL', async () => {
    mocked.get.mockResolvedValueOnce(ok([]));
    render(<Comp caseId="case-1" />);

    await waitFor(() => expect(mocked.get).toHaveBeenCalled());
    await waitFor(() => expect(screen.queryByTestId('action-error')).toBeNull());
    expect(screen.queryByTestId('stale-notice')).toBeNull();
  });

  it('malformed liste yanıtı empty SAYILMAZ → görünür error', async () => {
    mocked.get.mockResolvedValueOnce({ data: { data: { not: 'an array' } } });
    render(<Comp caseId="case-1" />);

    await waitFor(() => expect(screen.getAllByTestId('action-error').length).toBeGreaterThan(0));
  });

  it('mutation failure → FAILED; mevcut liste ve satır KORUNUR', async () => {
    mocked.get.mockResolvedValue(ok());
    mocked.delete.mockRejectedValueOnce({ body: { message: 'Silme reddedildi.' } });

    render(<Comp caseId="case-1" />);
    await screen.findByText(marker);

    fireEvent.click(screen.getByRole('button', { name: deleteLabel }));

    await waitFor(() =>
      expect(screen.getAllByTestId('action-error').some((n) => /Silme reddedildi/.test(n.textContent ?? ''))).toBe(true),
    );
    // Satır DURUYOR — pessimistic silme.
    expect(screen.getByText(marker)).toBeTruthy();
    expect(screen.queryByTestId('stale-notice')).toBeNull();
  });

  it('mutation + geçerli refresh → SUCCESS (stale bandı YOK)', async () => {
    mocked.get.mockResolvedValueOnce(ok()).mockResolvedValueOnce(ok([]));
    mocked.delete.mockResolvedValueOnce({});

    render(<Comp caseId="case-1" />);
    await screen.findByText(marker);
    fireEvent.click(screen.getByRole('button', { name: deleteLabel }));

    await waitFor(() => expect(mocked.get).toHaveBeenCalledTimes(2));
    expect(screen.queryByTestId('stale-notice')).toBeNull();
  });

  it('mutation + network refresh failure → SUCCESS_STALE', async () => {
    mocked.get.mockResolvedValueOnce(ok()).mockRejectedValueOnce(netFail());
    mocked.delete.mockResolvedValueOnce({});

    render(<Comp caseId="case-1" />);
    await screen.findByText(marker);
    fireEvent.click(screen.getByRole('button', { name: deleteLabel }));

    await screen.findByTestId('stale-notice');
    expect(mocked.delete).toHaveBeenCalledTimes(1);
  });

  it('mutation + malformed refresh → SUCCESS_STALE', async () => {
    mocked.get.mockResolvedValueOnce(ok()).mockResolvedValueOnce({ data: { data: null } });
    mocked.delete.mockResolvedValueOnce({});

    render(<Comp caseId="case-1" />);
    await screen.findByText(marker);
    fireEvent.click(screen.getByRole('button', { name: deleteLabel }));

    await screen.findByTestId('stale-notice');
  });

  it('stale refresh SUCCESS → band temizlenir, mutation ÇAĞRILMAZ', async () => {
    mocked.get.mockResolvedValueOnce(ok()).mockRejectedValueOnce(netFail()).mockResolvedValueOnce(ok([]));
    mocked.delete.mockResolvedValueOnce({});

    render(<Comp caseId="case-1" />);
    await screen.findByText(marker);
    fireEvent.click(screen.getByRole('button', { name: deleteLabel }));
    await screen.findByTestId('stale-notice');

    fireEvent.click(screen.getByTestId('stale-refresh'));

    await waitFor(() => expect(screen.queryByTestId('stale-notice')).toBeNull());
    expect(mocked.delete).toHaveBeenCalledTimes(1); // mutation TEKRAR çağrılmadı
  });

  it('stale refresh FAILURE → band ve retry KORUNUR, mutation ÇAĞRILMAZ', async () => {
    mocked.get.mockResolvedValueOnce(ok()).mockRejectedValueOnce(netFail()).mockRejectedValueOnce(netFail());
    mocked.delete.mockResolvedValueOnce({});

    render(<Comp caseId="case-1" />);
    await screen.findByText(marker);
    fireEvent.click(screen.getByRole('button', { name: deleteLabel }));
    await screen.findByTestId('stale-notice');

    fireEvent.click(screen.getByTestId('stale-refresh'));

    await waitFor(() => expect(mocked.get).toHaveBeenCalledTimes(3));
    expect(screen.getByTestId('stale-notice')).toBeTruthy();
    expect(screen.getByTestId('stale-refresh')).toBeTruthy();
    expect(mocked.delete).toHaveBeenCalledTimes(1);
  });

  it('same-tick duplicate silme → TEK mutation', async () => {
    mocked.get.mockResolvedValue(ok());
    let release!: () => void;
    mocked.delete.mockImplementationOnce(
      () => new Promise<void>((res) => { release = () => res(); }),
    );

    render(<Comp caseId="case-1" />);
    await screen.findByText(marker);

    const btn = screen.getByRole('button', { name: deleteLabel });
    fireEvent.click(btn);
    fireEvent.click(btn);
    fireEvent.click(btn);

    expect(mocked.delete).toHaveBeenCalledTimes(1);
    release();
    await waitFor(() => expect(mocked.delete).toHaveBeenCalledTimes(1));
  });
});

describe('A1 referans dosyaları — kaynak seviyesinde suppression yok', () => {
  it('üç dosyada boş catch / sessiz yutma BULUNMAZ', async () => {
    const fs = await import('node:fs');
    const path = await import('node:path');
    const dir = path.resolve(__dirname, '..');
    const files = ['case-hearings.tsx', 'case-deadlines.tsx', 'case-expenses.tsx'];

    for (const f of files) {
      const src = fs.readFileSync(path.join(dir, f), 'utf8');
      // bos catch blogu
      expect(src).not.toMatch(/catch\s*\([^)]*\)\s*\{\s*\}/);
      // .catch(() => {}) suppression
      expect(src).not.toMatch(/\.catch\(\s*\(\s*[^)]*\)\s*=>\s*\{\s*\}\s*\)/);
      // demo/mock fallback
      expect(src).not.toMatch(/\/\/\s*(Demo|Mock)/i);
      // okuma yolu dizi dogrulamasi yapiyor
      expect(src).toMatch(/Array\.isArray\(rows\)/);
      // refresh cagrilari hatayi propagate ediyor
      expect(src).toMatch(/propagateError: true/);
    }
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import ErrorLogsPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4m — HATA LOGLARI: 403-DIŞI OKUMA HATASI "HENÜZ LOG YOK" DEĞİLDİR.
 *
 * `fetchData` yalnız 403 için `setForbidden(true)` yapıyordu — bu ayrım
 * DOĞRUYDU ve dokunulmadı. Diğer her hata (500, ağ kesintisi) `else` dalında
 * yalnız `console.error` ile yutuluyordu; `logs` boş kalıyor ve ekran "Henüz
 * log kaydı yok" diyordu. `stats` de ilk değerinde (0/0/0/0) kalarak sahte
 * sayılar gösterebiliyordu. Artık hata görünür ve stat kartları "—" ile
 * işaretlenir.
 */

vi.mock('@/lib/api', () => ({
  api: { getErrorLogs: vi.fn(), getErrorLogStats: vi.fn() },
}));

vi.mock('@/components/error/ErrorLogDetailDrawer', () => ({
  ErrorLogDetailDrawer: () => null,
}));

const mocked = api as unknown as {
  getErrorLogs: ReturnType<typeof vi.fn>;
  getErrorLogStats: ReturnType<typeof vi.fn>;
};

const LOGS = {
  logs: [{ id: 'l1', level: 'ERROR', source: 'API', message: 'boom', createdAt: '2026-08-01T10:00:00.000Z', isResolved: false }],
  totalPages: 1,
};
const STATS = { total: 5, errors: 2, warnings: 1, unresolved: 3 };

const forbiddenError = () => {
  const e = new Error('yasak') as Error & { status?: number };
  e.status = 403;
  return Promise.reject(e);
};
const serverError = () => {
  const e = new Error('sunucu hatası') as Error & { status?: number };
  e.status = 500;
  return Promise.reject(e);
};

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Hata Logları — 403-dışı okuma hatası', () => {
  it('500: "henüz log kaydı yok" YAZILMAZ, gorunur hata cikar', async () => {
    mocked.getErrorLogs.mockImplementation(serverError);
    mocked.getErrorLogStats.mockResolvedValue(STATS);
    render(<ErrorLogsPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Henüz log kaydı yok')).toBeNull();
  });

  it('stat kartlari sahte SIFIR GOSTERMEZ', async () => {
    mocked.getErrorLogs.mockImplementation(serverError);
    mocked.getErrorLogStats.mockResolvedValue(STATS);
    render(<ErrorLogsPage />);

    await screen.findByRole('alert');
    expect(screen.getAllByText('—').length).toBeGreaterThan(0);
    expect(screen.queryByText('0')).toBeNull();
  });

  it('403: YETKI mesaji DOGRU gosterilir (davranis DEGISMEDI)', async () => {
    mocked.getErrorLogs.mockImplementation(forbiddenError);
    mocked.getErrorLogStats.mockResolvedValue(STATS);
    render(<ErrorLogsPage />);

    expect(await screen.findByText('Bu sayfayı görüntüleme yetkiniz yok.')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry BASARILI: band kalkar, loglar gorunur', async () => {
    let attempt = 0;
    mocked.getErrorLogs.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? serverError() : Promise.resolve(LOGS);
    });
    mocked.getErrorLogStats.mockResolvedValue(STATS);
    render(<ErrorLogsPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
    expect(await screen.findAllByText('Hata')).not.toHaveLength(0);
  });

  it('GERCEKTEN bos: hata YOK, "henüz log kaydı yok" DOGRU', async () => {
    mocked.getErrorLogs.mockResolvedValue({ logs: [], totalPages: 1 });
    mocked.getErrorLogStats.mockResolvedValue({ total: 0, errors: 0, warnings: 0, unresolved: 0 });
    render(<ErrorLogsPage />);

    expect(await screen.findByText('Henüz log kaydı yok')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('basarili okuma: gercek sayilar ve loglar gorunur', async () => {
    mocked.getErrorLogs.mockResolvedValue(LOGS);
    mocked.getErrorLogStats.mockResolvedValue(STATS);
    render(<ErrorLogsPage />);

    expect(await screen.findAllByText('Hata')).not.toHaveLength(0);
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

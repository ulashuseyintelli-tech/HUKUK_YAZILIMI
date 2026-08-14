import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import AuditLogPage from '../page';
import { api } from '@/lib/api';

/**
 * WSMR-A4t — DENETİM KAYITLARI (AUDIT LOG): OKUMA HATASI "KAYIT BULUNAMADI" DEĞİLDİR.
 *
 * `loadLogs`'un catch dalı yalnız `console.error` ile hatayı yutuyordu.
 * `logs` başlangıç değeri (`[]`) olduğu için bu, doğrudan "Kayıt bulunamadı"
 * render'i ile AYNI ekrana düşüyordu.
 */

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}));

const mocked = api as unknown as { get: ReturnType<typeof vi.fn> };

// `safeActor()` yalnız `safeProjection.actor.displayName` okur (üst düzey
// `userName` alanı TİPTE var ama HİÇ render EDİLMEZ) — gerçek sözleşme
// kaynaktan (`safeActor`, page.tsx:79-81) doğrulandı.
const LOG = {
  id: 'log-1',
  action: 'CREATE',
  entityType: 'Case',
  createdAt: '2026-08-01T10:00:00.000Z',
  safeProjection: {
    action: 'CREATE',
    entityType: 'Case',
    entityId: null,
    actor: { id: 'u1', displayName: 'Ayşe Yılmaz' },
    description: null,
  },
};
const LOGS_OK = { data: { logs: [LOG], totalPages: 1 } };
const LOGS_EMPTY = { data: { logs: [], totalPages: 1 } };

const networkError = () => Promise.reject(new Error('network down'));

beforeEach(() => vi.clearAllMocks());
afterEach(() => cleanup());

describe('Audit Log — loadLogs okuma hatası', () => {
  it('AG HATASI: "Kayıt bulunamadı" YAZILMAZ, gorunur hata + retry cikar', async () => {
    mocked.get.mockImplementation(networkError);
    render(<AuditLogPage />);

    expect(await screen.findByRole('alert')).toBeTruthy();
    expect(screen.queryByText('Kayıt bulunamadı')).toBeNull();
  });

  it('GERCEKTEN bos: hata YOK, "Kayıt bulunamadı" DOGRU', async () => {
    mocked.get.mockResolvedValue(LOGS_EMPTY);
    render(<AuditLogPage />);

    expect(await screen.findByText('Kayıt bulunamadı')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('retry -> SUCCESS_DATA: gercek kayit gorunur, hata kalkar', async () => {
    let attempt = 0;
    mocked.get.mockImplementation(() => {
      attempt += 1;
      return attempt === 1 ? Promise.reject(new Error('network down')) : Promise.resolve(LOGS_OK);
    });
    render(<AuditLogPage />);

    fireEvent.click(await screen.findByRole('button', { name: 'Tekrar dene' }));

    expect(await screen.findByText('Ayşe Yılmaz')).toBeTruthy();
    await vi.waitFor(() => expect(screen.queryByRole('alert')).toBeNull());
  });

  it('basarili yukleme: gercek kayit gorunur, hata YOK', async () => {
    mocked.get.mockResolvedValue(LOGS_OK);
    render(<AuditLogPage />);

    expect(await screen.findByText('Ayşe Yılmaz')).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
  });
});

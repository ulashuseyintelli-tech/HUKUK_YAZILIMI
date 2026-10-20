import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import { ActivityFeed } from '@/components/dashboard/activity-feed';
import { api } from '@/lib/api';

vi.mock('@/lib/api', () => ({ api: { get: vi.fn() } }));

const log = {
  id: 'audit-1', action: 'UPDATE', entityType: 'CLIENT',
  createdAt: '2026-10-19T10:00:00.000Z',
  description: 'RAW_DESCRIPTION_CANARY', userName: 'RAW_ACTOR_CANARY',
  metadata: { note: 'RAW_METADATA_CANARY' },
  safeProjection: {
    description: 'Güvenli müvekkil güncellemesi',
    actor: { id: 'user-1', displayName: 'Güvenli kullanıcı' },
  },
};

beforeEach(() => { vi.mocked(api.get).mockReset(); });
afterEach(cleanup);

describe('ActivityFeed standard audit response', () => {
  it('uses safe summary and actor even when an older response contains raw fields', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { logs: [log] } });
    render(<ActivityFeed />);
    expect(await screen.findByText(log.safeProjection.description)).toBeInTheDocument();
    expect(screen.getByText(/Güvenli kullanıcı/)).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('RAW_');
    expect(api.get).toHaveBeenCalledWith('/audit/logs?limit=10');
  });

  it('renders the safe-only API contract', async () => {
    const { description, userName, metadata, ...safeOnly } = log;
    vi.mocked(api.get).mockResolvedValue({ data: { logs: [safeOnly] } });
    render(<ActivityFeed />);
    expect(await screen.findByText(log.safeProjection.description)).toBeInTheDocument();
    expect(screen.getByText(/Güvenli kullanıcı/)).toBeInTheDocument();
  });

  it('falls back to action and entity without exposing raw-only content', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { logs: [{ ...log, safeProjection: null }] } });
    render(<ActivityFeed />);
    expect(await screen.findByText('UPDATE - CLIENT')).toBeInTheDocument();
    expect(document.body.textContent).not.toContain('RAW_');
  });

  it('preserves a real empty result without inventing activity', async () => {
    vi.mocked(api.get).mockResolvedValue({ data: { logs: [] } });
    render(<ActivityFeed />);
    expect(await screen.findByText(/Henüz aktivite yok/)).toBeInTheDocument();
    expect(screen.queryByText('Güvenli müvekkil güncellemesi')).toBeNull();
  });
});

it('shows permission denied rather than empty activity on audit 403', async () => {
  vi.mocked(api.get).mockRejectedValue({ status: 403, body: { message: 'Forbidden' } });
  render(<ActivityFeed />);
  expect(await screen.findByText('Audit okuma yetkisi yok.')).toBeInTheDocument();
  expect(screen.queryByText(/Henüz aktivite yok|0 kayıt/)).toBeNull();
});

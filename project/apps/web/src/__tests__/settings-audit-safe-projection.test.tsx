import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';

vi.mock('@/lib/api', () => ({
  api: { get: vi.fn() },
}));

import { api } from '@/lib/api';
import AuditLogPage from '@/app/(dashboard)/settings/audit/page';

const safeLog = {
  id: 'audit-1',
  action: 'UPDATE',
  entityType: 'CLIENT',
  entityId: 'client-1',
  userId: 'user-1',
  userName: 'Raw Operator <script>',
  userIp: '127.0.0.1',
  description: 'raw audit description ada.lovelace@example.com',
  metadata: {
    rawNote: 'raw metadata secret must not render',
    apiKey: 'sk-live-should-not-render',
  },
  oldValues: {
    note: 'raw old note must not render',
    status: 'OPEN',
  },
  newValues: {
    note: 'raw new note must not render',
    status: 'CLOSED',
  },
  safeProjection: {
    id: 'audit-1',
    action: 'UPDATE',
    entityType: 'CLIENT',
    entityId: 'client-1',
    actor: { id: 'user-1', displayName: 'Safe Operator' },
    description: 'Müvekkil güncellendi ad****@example.com',
    metadata: {
      clientId: 'client-1',
      requestId: 'req-1',
      emailReference: 'ad****@example.com',
    },
    oldValues: {
      status: 'OPEN',
      clientId: 'client-1',
    },
    newValues: {
      status: 'CLOSED',
      clientId: 'client-1',
    },
    rawValuePresence: { metadata: true, oldValues: true, newValues: true },
    createdAt: '2026-06-30T10:00:00.000Z',
  },
  createdAt: '2026-06-30T10:00:00.000Z',
};

beforeEach(() => {
  (api.get as any).mockReset();
  (api.get as any).mockResolvedValue({
    data: { logs: [safeLog], totalPages: 1 },
  });
});

afterEach(() => vi.restoreAllMocks());

describe('Settings Audit UI safeProjection migration', () => {
  it('renders safeProjection summary and does not render raw metadata/oldValues/newValues dumps', async () => {
    render(<AuditLogPage />);

    await waitFor(() => expect(screen.getByText('Müvekkil güncellendi ad****@example.com')).toBeInTheDocument());
    expect(screen.getByText('Safe Operator')).toBeInTheDocument();
    expect(screen.queryByText('raw audit description ada.lovelace@example.com')).toBeNull();
    expect(screen.queryByText('Raw Operator <script>')).toBeNull();

    fireEvent.click(screen.getByText('Görüntüle'));

    expect(screen.getByText('Güvenli Metadata')).toBeInTheDocument();
    expect(screen.getByText('Güvenli Eski Değerler')).toBeInTheDocument();
    expect(screen.getByText('Güvenli Yeni Değerler')).toBeInTheDocument();
    expect(screen.getByText('emailReference')).toBeInTheDocument();
    expect(screen.getAllByText('ad****@example.com').length).toBeGreaterThan(0);
    expect(screen.getAllByText('client-1').length).toBeGreaterThan(0);
    expect(screen.getByText('OPEN')).toBeInTheDocument();
    expect(screen.getByText('CLOSED')).toBeInTheDocument();

    expect(screen.queryByText('raw metadata secret must not render')).toBeNull();
    expect(screen.queryByText('raw old note must not render')).toBeNull();
    expect(screen.queryByText('raw new note must not render')).toBeNull();
    expect(screen.queryByText('sk-live-should-not-render')).toBeNull();
  });

  it('does not fall back to raw JSON when safeProjection is missing', async () => {
    (api.get as any).mockResolvedValueOnce({
      data: {
        logs: [
          {
            id: 'audit-legacy',
            action: 'UPDATE',
            entityType: 'CLIENT',
            entityId: 'client-legacy',
            userName: 'Legacy Raw User',
            description: 'legacy raw description should not render',
            oldValues: { note: 'legacy raw old value should not render' },
            newValues: { note: 'legacy raw new value should not render' },
            createdAt: '2026-06-30T11:00:00.000Z',
          },
        ],
        totalPages: 1,
      },
    });

    render(<AuditLogPage />);

    await waitFor(() => expect(screen.getByText('Güncelleme - Müvekkil')).toBeInTheDocument());
    expect(screen.queryByText('legacy raw description should not render')).toBeNull();
    expect(screen.queryByText('Legacy Raw User')).toBeNull();

    fireEvent.click(screen.getByText('Görüntüle'));

    expect(screen.getAllByText('Safe audit summary unavailable').length).toBeGreaterThan(0);
    expect(screen.getByText('Safe audit summary unavailable. Ham audit JSON bu görünümde gösterilmez.')).toBeInTheDocument();
    expect(screen.queryByText('legacy raw old value should not render')).toBeNull();
    expect(screen.queryByText('legacy raw new value should not render')).toBeNull();
  });

  it('preserves audit filters while using the same /audit/logs contract', async () => {
    render(<AuditLogPage />);

    await waitFor(() => expect(api.get).toHaveBeenCalledWith('/audit/logs?page=1&limit=20'));

    fireEvent.change(screen.getByLabelText('İşlem filtresi'), { target: { value: 'UPDATE' } });

    await waitFor(() =>
      expect(api.get).toHaveBeenLastCalledWith('/audit/logs?page=1&limit=20&action=UPDATE'),
    );
  });
});

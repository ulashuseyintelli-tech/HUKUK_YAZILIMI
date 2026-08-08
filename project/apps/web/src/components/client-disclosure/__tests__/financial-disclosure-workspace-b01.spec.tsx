import { beforeEach, describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import {
  OFFICE_DISCLOSURE_STATUSES,
  type OfficeDisclosureDetail,
  type OfficeDisclosureSummary,
} from '@/lib/api/client-financial-disclosure';
import { FinancialDisclosureWorkspace } from '@/components/client-disclosure/FinancialDisclosureWorkspace';
import { getOfficeDisclosureStatusLabel } from '@/components/client-disclosure/DisclosureStatusBadge';

const list = vi.fn();
const getDetail = vi.fn();
const getHistory = vi.fn();

vi.mock('@/lib/api/client-financial-disclosure', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/lib/api/client-financial-disclosure')>();
  return {
    ...original,
    clientFinancialDisclosureApi: {
      list: (...args: unknown[]) => list(...args),
      getDetail: (...args: unknown[]) => getDetail(...args),
      getHistory: (...args: unknown[]) => getHistory(...args),
    },
  };
});

const actions = {
  canRequestOfficeApproval: false,
  canCompleteOfficeApproval: false,
  canRequestContentApproval: false,
  canCompleteContentApproval: false,
  canPublish: false,
  canRetryPublication: false,
  canReverse: false,
  canSupersede: false,
};

const current: OfficeDisclosureSummary = {
  disclosureId: 'root-secret-id',
  versionId: 'version-secret-id-v2',
  version: 2,
  status: 'PUBLISHED',
  clientName: 'Ada Müvekkil',
  officeFileNumber: 'BÜRO-2026-0042',
  currency: 'TRY',
  totalCollected: '1250.00',
  clientNetAmount: '1000.00',
  updatedAt: '2026-08-08T10:00:00.000Z',
  publishedAt: '2026-08-08T09:00:00.000Z',
  isCurrentEffective: true,
  actions,
};

const detail: OfficeDisclosureDetail = {
  ...current,
  lines: [{ type: 'CLIENT_NET', amount: '1000.00' }],
  approval: { officeRequestedAt: null, officeApprovedAt: null, contentApprovedAt: null },
  delivery: {
    state: 'PUBLISHED',
    sendRequestedAt: null,
    providerAcceptedAt: null,
    publishedAt: current.publishedAt,
  },
  supersedesVersionId: 'must-not-render-supersedes-id',
  supersededByVersionId: null,
  correctionReason: null,
  reversedAt: null,
  cancelledAt: null,
};

const previous: OfficeDisclosureSummary = {
  ...current,
  versionId: 'version-secret-id-v1',
  version: 1,
  status: 'SUPERSEDED',
  isCurrentEffective: false,
};

function renderWorkspace() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <FinancialDisclosureWorkspace clientId="client-scope" />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  list.mockReset();
  getDetail.mockReset();
  getHistory.mockReset();
  list.mockResolvedValue({ surface: 'OFFICE_LIST', items: [current] });
  getDetail.mockResolvedValue(detail);
  getHistory.mockResolvedValue({
    surface: 'OFFICE_HISTORY',
    disclosureId: current.disclosureId,
    currentEffectiveVersionId: current.versionId,
    items: [current, previous],
  });
});

describe('FinancialDisclosureWorkspace X1-B01', () => {
  it('liste, curated detay ve versiyon geçmişini gösterir; current-effective açıktır', async () => {
    renderWorkspace();

    expect(await screen.findByText('BÜRO-2026-0042')).toBeTruthy();
    expect(await screen.findByText('CLIENT_NET')).toBeTruthy();
    expect(await screen.findByText('Sürüm 1')).toBeTruthy();
    expect(screen.getAllByText('Güncel geçerli sürüm').length).toBeGreaterThan(0);
    expect(getDetail).toHaveBeenCalledWith('client-scope', current.versionId);
    expect(getHistory).toHaveBeenCalledWith('client-scope', current.disclosureId);
  });

  it('canonical 11 durumun tamamını mapler; SENT veya FAILED durumu üretmez', () => {
    expect(OFFICE_DISCLOSURE_STATUSES).toHaveLength(11);
    expect(OFFICE_DISCLOSURE_STATUSES).toContain('SEND_FAILED');
    expect(OFFICE_DISCLOSURE_STATUSES).not.toContain('SENT');
    expect(OFFICE_DISCLOSURE_STATUSES).not.toContain('FAILED');
    for (const status of OFFICE_DISCLOSURE_STATUSES) {
      expect(getOfficeDisclosureStatusLabel(status)).not.toHaveLength(0);
    }
  });

  it('iç kimlikleri ve command/provider alanlarını görünür yüzeye sızdırmaz', async () => {
    const view = renderWorkspace();
    expect(await screen.findByText('CLIENT_NET')).toBeTruthy();

    const visible = view.container.textContent ?? '';
    expect(visible).not.toContain('root-secret-id');
    expect(visible).not.toContain('version-secret-id');
    expect(visible).not.toContain('must-not-render-supersedes-id');
    expect(visible).not.toContain('caseClientId');
    expect(visible).not.toContain('collectionDispositionId');
    expect(visible).not.toContain('sourceCollectionId');
    expect(visible).not.toContain('executionFileNumber');
    expect(visible).not.toContain('providerMessageId');
    expect(visible).not.toContain('sendFailureDetail');
  });

  it('backend hatasında ham gövdeyi basmadan fail-closed mesaj gösterir', async () => {
    list.mockRejectedValue(new Error('provider raw body must stay hidden'));
    renderWorkspace();

    const alert = await screen.findByRole('alert');
    expect(alert.textContent).toContain('Finansal bildirimler yüklenemedi');
    expect(alert.textContent).not.toContain('provider raw body');
  });
});

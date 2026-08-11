import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OfficeApprovalDecisionActions } from '../OfficeApprovalDecisionActions';
import { isDomainOwnedApproval } from '../domain-owned-approval';

// PR-1.3 — Onay Kutusu, FD taleplerini GÖSTERİR fakat KARAR VERDİRMEZ.
//
// Eski davranış: generic "Onayla" FD talebini APPROVED yapıyor, domain geçişi
// atlanıyordu → bildirim kalıcı olarak kilitleniyordu.

vi.mock('@/lib/api/office-approval', () => ({
  officeApprovalApi: {
    approve: vi.fn(),
    reject: vi.fn(),
    approveWithChanges: vi.fn(),
    requestRevision: vi.fn(),
    cancel: vi.fn(),
  },
}));

const detail = (actionCode: string) =>
  ({
    id: 'req-1',
    actionCode,
    targetType: 'ClientFinancialDisclosureVersion',
    targetRef: 'ver-1',
    status: 'PENDING_APPROVAL',
    requesterUserId: 'user-req',
    approverUserId: null,
    createdAt: '2026-08-10T21:55:53.239Z',
    decidedAt: null,
    executedAt: null,
    savedIntent: {},
    payloadHash: 'h',
    replacementSavedIntent: null,
    replacementPayloadHash: null,
    decisionNote: null,
  }) as never;

describe('Onay Kutusu — domain-owned talepler', () => {
  it('FD talebinde generic karar butonları GÖSTERİLMEZ', () => {
    render(
      <OfficeApprovalDecisionActions
        detail={detail('CLIENT_FINANCIAL_DISCLOSURE_APPROVE')}
        currentUserId="approver-1"
        onDecided={() => {}}
      />,
    );

    screen.getByTestId('decision-actions-domain-owned');
    expect(screen.queryByRole('button', { name: 'Onayla' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Reddet' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Değiştirerek Onayla' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Revizyon İste' })).toBeNull();
  });

  it('FD talebinde domain ekranına yönlendirme metni gösterilir', () => {
    render(
      <OfficeApprovalDecisionActions
        detail={detail('CLIENT_FINANCIAL_DISCLOSURE_APPROVE')}
        currentUserId="approver-1"
        onDecided={() => {}}
      />,
    );
    screen.getByText('Bu karar onay kutusundan verilemez.');
    screen.getByText(/Finansal Bildirimler/);
  });

  it('yönlendirme metni ham iç kimlik SIZDIRMAZ', () => {
    const { container } = render(
      <OfficeApprovalDecisionActions
        detail={detail('CLIENT_FINANCIAL_DISCLOSURE_APPROVE')}
        currentUserId="approver-1"
        onDecided={() => {}}
      />,
    );
    const note = container.querySelector('[role="note"]')!;
    expect(note.textContent).not.toContain('ver-1');
    expect(note.textContent).not.toContain('req-1');
  });

  it('DİĞER approval türlerinde karar butonları KORUNUR (regresyon)', () => {
    render(
      <OfficeApprovalDecisionActions
        detail={detail('COLLECTION_DISPOSITION_POST')}
        currentUserId="approver-1"
        onDecided={() => {}}
      />,
    );
    screen.getByTestId('decision-actions');
    screen.getByRole('button', { name: 'Onayla' });
    screen.getByRole('button', { name: 'Reddet' });
    expect(screen.queryByTestId('decision-actions-domain-owned')).toBeNull();
  });

  it('küme predikatı backend ile aynı kodu tanır', () => {
    expect(isDomainOwnedApproval('CLIENT_FINANCIAL_DISCLOSURE_APPROVE')).toBe(true);
    expect(isDomainOwnedApproval('COLLECTION_DISPOSITION_POST')).toBe(false);
    expect(isDomainOwnedApproval('CHANGE_STATUS')).toBe(false);
    expect(isDomainOwnedApproval(null)).toBe(false);
  });
});

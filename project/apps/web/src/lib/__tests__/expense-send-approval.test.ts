import { describe, expect, it } from 'vitest';
import { interpretExpenseSendResponse } from '../expense-send-result';
import { describeOpeningExpenseOutcome } from '../opening-expense-status';
import { getApprovalSummary } from '@/components/office-approval/summary/registry';

describe('3a send approval UI contract', () => {
  it.each(['PENDING_APPROVAL', 'REJECTED', 'CANCELLED', 'EXPIRED', 'REVISION_REQUESTED'])('represents %s as approval, never sent or an uncertain transport retry', approvalStatus => {
    const result = interpretExpenseSendResponse({ success: false, approvalRequired: true, approvalRequestId: 'approval', approvalStatus, message: 'Gönderilmedi' });
    expect(result.kind).toBe('approval'); expect(result).toMatchObject({ retryable: false, approvalStatus, message: 'Gönderilmedi' });
  });
  it('does not turn an unknown HTTP success body into delivery acceptance', () => {
    expect(interpretExpenseSendResponse({ status: 201 }).kind).toBe('uncertain');
  });
  it('shows opening approval pending separately from case creation and email delivery', () => {
    const text = describeOpeningExpenseOutcome({ approvalRequired: true, approvalRequestId: 'a', approvalStatus: 'PENDING_APPROVAL', message: 'İç onay bekleniyor; e-posta gönderilmedi.' });
    expect(text).toContain('Dosya oluşturuldu'); expect(text).toContain('onay bekleniyor'); expect(text).toContain('gönderilmedi');
  });
  it('projects the masked recipient and separate send purpose without a raw intent dump', () => {
    const result = getApprovalSummary('EXPENSE_REQUEST_SEND', { version: 'EXPENSE_SEND_V1', expenseRequestId: 'expense', totalAmount: '100.00', currency: 'TRY', recipientLabel: 'mu****@example.test', itemCount: 1, contentHash: 'private-hash' });
    expect(result.kind).toBe('summary'); expect(result.fields).toContainEqual({ label: 'Alıcı', value: 'mu****@example.test' });
    expect(JSON.stringify(result)).not.toContain('private-hash'); expect(result.impactNotes?.join(' ')).toContain('dağıtım');
  });
});

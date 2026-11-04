import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { cleanup, render, screen, waitFor } from '@testing-library/react';
import DetailPage from '../[id]/page';
import { api } from '@/lib/api';
vi.mock('@/lib/api', () => ({ api: { getIntakeSubmission: vi.fn(), getCase: vi.fn(), getIntakePromotionCapability: vi.fn() } }));
vi.mock('next/link', () => ({ default: ({ href, children }: any) => <a href={href}>{children}</a> }));
const base = { id: 'sub-1', caseId: 'case-1', status: 'IN_REVIEW', fields: [{ id: 'field', category: 'ADDRESS', value: 'sentetik', reviewStatus: 'APPROVED', promotedRefId: null }] };
const mocks = vi.mocked(api);
beforeEach(() => { vi.resetAllMocks(); mocks.getIntakeSubmission.mockResolvedValue(base as any); mocks.getCase.mockResolvedValue({ fileNumber: 'TEST' } as any); mocks.getIntakePromotionCapability.mockResolvedValue({ canPromote: true }); });
afterEach(cleanup);
describe('Review detail to existing promotion screen — capability is separate from review', () => {
  it('links to the existing route only after independent server eligibility, without promoting anything', async () => {
    render(<DetailPage params={{ id: 'sub-1' }} />);
    const link = await screen.findByRole('link', { name: 'Aktarım ekranını aç' });
    expect(link.getAttribute('href')).toBe('/client-intake/sub-1/promote');
    expect(mocks.getIntakePromotionCapability).toHaveBeenCalledWith('sub-1');
  });
  it('does not infer promotion from being able to open/review the submission', async () => {
    mocks.getIntakePromotionCapability.mockResolvedValue({ canPromote: false });
    render(<DetailPage params={{ id: 'sub-1' }} />); await screen.findByText('Bilgi Formu Gönderimi');
    await waitFor(() => expect(mocks.getIntakePromotionCapability).toHaveBeenCalled());
    expect(screen.queryByRole('link', { name: 'Aktarım ekranını aç' })).toBeNull();
  });
  it.each(['ASSET', 'CONTACT', 'PENDING', 'PROMOTED', 'REJECTED_SUBMISSION'])('does not open unsupported or ineligible %s work', async kind => {
    const field = { ...base.fields[0], ...(kind === 'ASSET' || kind === 'CONTACT' ? { category: kind } : kind === 'PENDING' ? { reviewStatus: 'PENDING' } : kind === 'PROMOTED' ? { promotedRefId: 'already' } : {}) };
    mocks.getIntakeSubmission.mockResolvedValue({ ...base, status: kind === 'REJECTED_SUBMISSION' ? 'REJECTED' : 'IN_REVIEW', fields: [field] } as any);
    render(<DetailPage params={{ id: 'sub-1' }} />); await screen.findByText('Bilgi Formu Gönderimi');
    expect(screen.queryByRole('link', { name: 'Aktarım ekranını aç' })).toBeNull();
  });
  it('labels capability-read failure without claiming missing submission or granting access', async () => {
    mocks.getIntakePromotionCapability.mockRejectedValue(new Error('network'));
    render(<DetailPage params={{ id: 'sub-1' }} />);
    expect(await screen.findByText(/Aktarım yetkisi doğrulanamadı/)).toBeTruthy();
    expect(screen.queryByText('Gönderim bulunamadı.')).toBeNull();
    expect(screen.queryByRole('link', { name: 'Aktarım ekranını aç' })).toBeNull();
  });
});

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ClientIntelligenceTab } from '@/components/client/client-intelligence-tab';

vi.mock('@/components/case/IntelStatementSection', () => ({
  IntelStatementSection: ({ caseId }: { caseId: string }) => (
    <div data-testid="intel-section">caseId:{caseId}</div>
  ),
}));

const CASES = [
  { id: 'case-1', fileNumber: '2026/1', caseStatus: 'DERDEST' },
  { id: 'case-2', fileNumber: '2026/2', caseStatus: 'ISLEMDE' },
];

describe('ClientIntelligenceTab', () => {
  it('no cases empty state', () => {
    render(<ClientIntelligenceTab cases={[]} />);

    expect(screen.getByText('Bu müvekkile bağlı dosya yok.')).toBeTruthy();
    expect(screen.queryByTestId('intel-section')).toBeNull();
  });

  it('one case renders section with auto-selected case', () => {
    render(<ClientIntelligenceTab cases={[CASES[0]]} />);

    expect(screen.getByText('Dosya: 2026/1 · DERDEST')).toBeTruthy();
    expect(screen.getByTestId('intel-section').textContent).toBe('caseId:case-1');
  });

  it('multiple cases renders selector with file number and status', () => {
    render(<ClientIntelligenceTab cases={CASES} />);

    const selector = screen.getByLabelText('Dosya');
    expect(selector).toBeTruthy();
    expect(screen.getByText('2026/1 · DERDEST')).toBeTruthy();
    expect(screen.getByText('2026/2 · ISLEMDE')).toBeTruthy();
  });

  it('changing case changes rendered caseId', () => {
    render(<ClientIntelligenceTab cases={CASES} />);

    fireEvent.change(screen.getByLabelText('Dosya'), { target: { value: 'case-2' } });

    expect(screen.getByTestId('intel-section').textContent).toBe('caseId:case-2');
  });

  it('does not introduce mutation controls', () => {
    render(<ClientIntelligenceTab cases={CASES} />);

    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });
});
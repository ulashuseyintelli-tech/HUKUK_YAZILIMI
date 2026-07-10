import { render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { DueModal } from '@/components/finance/DueModal';

vi.mock('@/lib/api', () => ({
  api: {
    createDue: vi.fn(),
    updateDue: vi.fn(),
    deleteDue: vi.fn(),
  },
}));

function renderModal(due?: Record<string, unknown>) {
  render(
    <DueModal
      isOpen
      onClose={vi.fn()}
      caseId="case-1"
      due={due}
      onSuccess={vi.fn()}
    />,
  );
  return screen.getAllByRole('combobox')[0];
}

describe('VER-05 PR-1B DueModal NAFAKA boundary guard', () => {
  beforeEach(() => vi.clearAllMocks());

  it('create mode keeps NAFAKA selectable', () => {
    const typeSelect = renderModal();

    expect(within(typeSelect).getByRole('option', { name: 'Nafaka' })).toBeInTheDocument();
  });

  it('editing NAFAKA exposes only NAFAKA', () => {
    const typeSelect = renderModal({
      id: 'due-nafaka',
      type: 'NAFAKA',
      amount: 500,
      dueDate: '2026-01-01',
      currency: 'TRY',
    });

    expect(within(typeSelect).getAllByRole('option')).toHaveLength(1);
    expect(within(typeSelect).getByRole('option', { name: 'Nafaka' })).toBeInTheDocument();
  });

  it('editing non-NAFAKA does not expose NAFAKA', () => {
    const typeSelect = renderModal({
      id: 'due-principal',
      type: 'PRINCIPAL',
      amount: 1000,
      dueDate: '2026-01-01',
      currency: 'TRY',
    });

    expect(within(typeSelect).queryByRole('option', { name: 'Nafaka' })).not.toBeInTheDocument();
    expect(within(typeSelect).getByRole('option', { name: 'Ana Para (Asıl Alacak)' })).toBeInTheDocument();
  });
});

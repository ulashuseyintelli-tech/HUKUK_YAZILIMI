import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CASE_WIZARD_DRAFT_BASE_KEY,
  clearCaseWizardDraftState,
  getCaseWizardDraftStorageKey,
  loadCaseWizardDraftState,
  sanitizeCaseDebtorsForSubmit,
  saveCaseWizardDraftState,
} from '@/lib/case-wizard-draft';
import { DebtorRole, DebtorType, NotificationMode } from '@/types/debtor';

describe('case wizard draft hardening', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-06-19T09:00:00.000Z'));
  });

  it('draft key tenant/user scope içerir ve başka scope altında restore edilmez', () => {
    const tenantAUser = { tenantId: 'tenant-a', userId: 'user-1' };
    const tenantBUser = { tenantId: 'tenant-b', userId: 'user-1' };

    saveCaseWizardDraftState({ caseDebtors: [{ debtorId: 'debtor-a' }] }, tenantAUser);

    expect(localStorage.getItem(CASE_WIZARD_DRAFT_BASE_KEY)).toBeNull();
    expect(localStorage.getItem(getCaseWizardDraftStorageKey(tenantAUser)!)).toContain('debtor-a');
    expect(loadCaseWizardDraftState(tenantBUser)).toBeNull();
    expect(loadCaseWizardDraftState(tenantAUser)?.caseDebtors[0].debtorId).toBe('debtor-a');
  });

  it('clear yalnız scoped key ve legacy key temizler', () => {
    const scope = { tenantId: 'tenant-a', userId: 'user-1' };
    saveCaseWizardDraftState({ currentStep: 2 }, scope);
    localStorage.setItem(CASE_WIZARD_DRAFT_BASE_KEY, '{"legacy":true}');

    clearCaseWizardDraftState(scope);

    expect(localStorage.getItem(getCaseWizardDraftStorageKey(scope)!)).toBeNull();
    expect(localStorage.getItem(CASE_WIZARD_DRAFT_BASE_KEY)).toBeNull();
  });

  it('submit sanitize selectedAddressId debtor adreslerinden değilse düşürür', () => {
    const sanitized = sanitizeCaseDebtorsForSubmit([
      {
        debtorId: 'debtor-1',
        debtor: {
          id: 'debtor-1',
          type: DebtorType.INDIVIDUAL,
          name: 'Borçlu',
          debtorAddresses: [{ id: 'addr-owned', street: 'Sokak', city: 'Ankara', isPrimary: true }],
        },
        role: DebtorRole.ASIL_BORCLU,
        notificationMode: NotificationMode.NORMAL,
        selectedAddressId: 'addr-foreign',
        prepareNotification: true,
      },
    ]);

    expect(sanitized).toHaveLength(1);
    expect(sanitized[0].selectedAddressId).toBeUndefined();
  });
});

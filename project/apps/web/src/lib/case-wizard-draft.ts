import { CaseDebtor, Debtor } from "@/types/debtor";

export const CASE_WIZARD_DRAFT_BASE_KEY = "case_wizard_draft";

export interface CaseWizardDraftScope {
  tenantId?: string | null;
  userId?: string | null;
}

function hasDraftScope(scope: CaseWizardDraftScope): scope is { tenantId: string; userId: string } {
  return !!scope.tenantId && !!scope.userId;
}

export function getCaseWizardDraftStorageKey(scope: CaseWizardDraftScope): string | null {
  if (!hasDraftScope(scope)) return null;
  return `${CASE_WIZARD_DRAFT_BASE_KEY}:${scope.tenantId}:${scope.userId}`;
}

export function saveCaseWizardDraftState(state: any, scope: CaseWizardDraftScope) {
  if (typeof window === "undefined") return;

  const key = getCaseWizardDraftStorageKey(scope);
  if (!key || !hasDraftScope(scope)) return;

  try {
    localStorage.setItem(key, JSON.stringify({
      ...state,
      tenantId: scope.tenantId,
      userId: scope.userId,
      savedAt: new Date().toISOString(),
    }));
    localStorage.removeItem(CASE_WIZARD_DRAFT_BASE_KEY);
  } catch (e) {
    console.error("Wizard state kaydedilemedi:", e);
  }
}

export function loadCaseWizardDraftState(scope: CaseWizardDraftScope): any | null {
  if (typeof window === "undefined") return null;

  const key = getCaseWizardDraftStorageKey(scope);
  if (!key || !hasDraftScope(scope)) return null;

  try {
    const saved = localStorage.getItem(key);
    if (!saved) return null;

    const parsed = JSON.parse(saved);
    if (parsed.tenantId !== scope.tenantId || parsed.userId !== scope.userId) {
      localStorage.removeItem(key);
      return null;
    }

    const savedAt = new Date(parsed.savedAt);
    const now = new Date();
    const hoursDiff = (now.getTime() - savedAt.getTime()) / (1000 * 60 * 60);
    if (hoursDiff > 24) {
      localStorage.removeItem(key);
      return null;
    }

    return parsed;
  } catch (e) {
    console.error("Wizard state yüklenemedi:", e);
    localStorage.removeItem(key);
  }

  return null;
}

export function clearCaseWizardDraftState(scope: CaseWizardDraftScope) {
  if (typeof window === "undefined") return;

  const key = getCaseWizardDraftStorageKey(scope);
  if (key) localStorage.removeItem(key);
  localStorage.removeItem(CASE_WIZARD_DRAFT_BASE_KEY);
}

export function sanitizeCaseDebtorsForSubmit(
  caseDebtors: CaseDebtor[],
  knownDebtors?: Debtor[]
): CaseDebtor[] {
  return caseDebtors.reduce<CaseDebtor[]>((result, caseDebtor) => {
      const debtor = knownDebtors?.find((candidate) => candidate.id === caseDebtor.debtorId) || caseDebtor.debtor;
      if (knownDebtors && !debtor) return result;

      const selectedAddressId = caseDebtor.selectedAddressId;
      const hasSelectedAddress = !!selectedAddressId && !!debtor?.debtorAddresses?.some(
        (address) => address.id === selectedAddressId
      );

      result.push({
        ...caseDebtor,
        ...(debtor ? { debtor } : {}),
        selectedAddressId: hasSelectedAddress ? selectedAddressId : undefined,
      });

      return result;
    }, []);
}

/**
 * PR-EA-3A — EnforcementAction backfill sınıflandırıcısı: saf çekirdek testleri.
 */
import {
  classifyEnforcementAction,
  observeTargetDetails,
  ClassifyEnforcementActionInput,
} from "../enforcement-action-backfill-classifier";

function baseInput(overrides: Partial<ClassifyEnforcementActionInput> = {}): ClassifyEnforcementActionInput {
  return {
    caseId: "case-1",
    tenantId: null,
    caseDebtorId: null,
    parentCase: { id: "case-1", tenantId: "tenant-1" },
    caseDebtors: [],
    referencedCaseDebtor: null,
    ...overrides,
  };
}

describe("classifyEnforcementAction — tenant sınıflandırması", () => {
  it("tenantId boş, Case bulunuyor → TENANT_DETERMINISTIC", () => {
    const d = classifyEnforcementAction(baseInput()).tenant;
    expect(d.bucket).toBe("TENANT_DETERMINISTIC");
    expect(d.candidateTenantId).toBe("tenant-1");
  });

  it("tenantId dolu ve Case.tenantId ile tutarlı → ALREADY_POPULATED", () => {
    const d = classifyEnforcementAction(baseInput({ tenantId: "tenant-1" })).tenant;
    expect(d.bucket).toBe("ALREADY_POPULATED");
    expect(d.candidateTenantId).toBe("tenant-1");
  });

  it("tenantId dolu ama Case.tenantId ile uyuşmuyor (tenant mismatch) → INTEGRITY_FAILURE", () => {
    const d = classifyEnforcementAction(baseInput({ tenantId: "tenant-WRONG" })).tenant;
    expect(d.bucket).toBe("INTEGRITY_FAILURE");
    expect(d.candidateTenantId).toBeNull();
  });

  it("Case bulunamıyor (dangling caseId) → INTEGRITY_FAILURE", () => {
    const d = classifyEnforcementAction(baseInput({ parentCase: null })).tenant;
    expect(d.bucket).toBe("INTEGRITY_FAILURE");
    expect(d.candidateTenantId).toBeNull();
  });
});

describe("classifyEnforcementAction — caseDebtor sınıflandırması", () => {
  it("0 CaseDebtor → ORPHAN", () => {
    const d = classifyEnforcementAction(baseInput({ caseDebtors: [] })).caseDebtor;
    expect(d.bucket).toBe("ORPHAN");
    expect(d.candidateCaseDebtorId).toBeNull();
  });

  it("1 CaseDebtor → CASE_DEBTOR_DETERMINISTIC", () => {
    const d = classifyEnforcementAction(
      baseInput({ caseDebtors: [{ id: "cd-1", lifecycleStatus: "ACTIVE", role: "ASIL_BORCLU" }] }),
    ).caseDebtor;
    expect(d.bucket).toBe("CASE_DEBTOR_DETERMINISTIC");
    expect(d.candidateCaseDebtorId).toBe("cd-1");
  });

  it("2 CaseDebtor, tek ACTIVE → INFERABLE_SINGLE_ACTIVE", () => {
    const d = classifyEnforcementAction(
      baseInput({
        caseDebtors: [
          { id: "cd-1", lifecycleStatus: "ACTIVE", role: "ASIL_BORCLU" },
          { id: "cd-2", lifecycleStatus: "PASSIVE", role: "MUSETEREK_BORCLU" },
        ],
      }),
    ).caseDebtor;
    expect(d.bucket).toBe("INFERABLE_SINGLE_ACTIVE");
    expect(d.candidateCaseDebtorId).toBe("cd-1");
  });

  it("2 CaseDebtor, ikisi de ACTIVE ama tek ASIL_BORCLU → INFERABLE_SINGLE_PRIMARY", () => {
    const d = classifyEnforcementAction(
      baseInput({
        caseDebtors: [
          { id: "cd-1", lifecycleStatus: "ACTIVE", role: "ASIL_BORCLU" },
          { id: "cd-2", lifecycleStatus: "ACTIVE", role: "MUSETEREK_BORCLU" },
        ],
      }),
    ).caseDebtor;
    expect(d.bucket).toBe("INFERABLE_SINGLE_PRIMARY");
    expect(d.candidateCaseDebtorId).toBe("cd-1");
  });

  it("2+ makul aday (çoklu ACTIVE + çoklu ASIL_BORCLU) → AMBIGUOUS", () => {
    const d = classifyEnforcementAction(
      baseInput({
        caseDebtors: [
          { id: "cd-1", lifecycleStatus: "ACTIVE", role: "ASIL_BORCLU" },
          { id: "cd-2", lifecycleStatus: "ACTIVE", role: "ASIL_BORCLU" },
        ],
      }),
    ).caseDebtor;
    expect(d.bucket).toBe("AMBIGUOUS");
    expect(d.candidateCaseDebtorId).toBeNull();
  });

  it("dolu ve doğru (aynı Case altında) caseDebtorId → ALREADY_POPULATED", () => {
    const d = classifyEnforcementAction(
      baseInput({
        caseDebtorId: "cd-1",
        referencedCaseDebtor: { id: "cd-1", caseId: "case-1" },
      }),
    ).caseDebtor;
    expect(d.bucket).toBe("ALREADY_POPULATED");
    expect(d.candidateCaseDebtorId).toBe("cd-1");
  });

  it("dolu ama başka Case'e ait caseDebtorId (cross-case) → INTEGRITY_FAILURE", () => {
    const d = classifyEnforcementAction(
      baseInput({
        caseDebtorId: "cd-1",
        referencedCaseDebtor: { id: "cd-1", caseId: "OTHER-CASE" },
      }),
    ).caseDebtor;
    expect(d.bucket).toBe("INTEGRITY_FAILURE");
    expect(d.candidateCaseDebtorId).toBeNull();
  });

  it("dolu ama referans edilen CaseDebtor kaydı hiç bulunamıyor → INTEGRITY_FAILURE", () => {
    const d = classifyEnforcementAction(
      baseInput({ caseDebtorId: "cd-GHOST", referencedCaseDebtor: null }),
    ).caseDebtor;
    expect(d.bucket).toBe("INTEGRITY_FAILURE");
    expect(d.candidateCaseDebtorId).toBeNull();
  });
});

describe("observeTargetDetails — yalnız gözlem, sınıflandırmayı etkilemez", () => {
  it("null/undefined → NULL", () => {
    expect(observeTargetDetails(null)).toBe("NULL");
    expect(observeTargetDetails(undefined)).toBe("NULL");
  });

  it("debtorId alanı taşıyan obje → RECOGNIZED_DEBTOR_IDENTIFIER", () => {
    expect(observeTargetDetails({ debtorId: "d-1" })).toBe("RECOGNIZED_DEBTOR_IDENTIFIER");
    expect(observeTargetDetails({ caseDebtorId: "cd-1" })).toBe("RECOGNIZED_DEBTOR_IDENTIFIER");
  });

  it("tanınmayan yapı (dizi, alakasız alanlar, ilkel değer) → UNRECOGNIZED_STRUCTURE", () => {
    expect(observeTargetDetails({ bankName: "X Bank" })).toBe("UNRECOGNIZED_STRUCTURE");
    expect(observeTargetDetails([1, 2, 3])).toBe("UNRECOGNIZED_STRUCTURE");
    expect(observeTargetDetails("free text")).toBe("UNRECOGNIZED_STRUCTURE");
  });
});

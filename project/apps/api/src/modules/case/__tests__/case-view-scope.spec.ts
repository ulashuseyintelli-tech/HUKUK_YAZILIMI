import { CASE_VIEW_ALL_KEY, CASE_VIEW_SCOPE_FLAG, caseViewScopeWhere, caseViewWhereFor, isCaseViewScopeEnabled } from "../case-view-scope";
import { WORK_SCOPE_VIEW_ALL_KEYS, isWorkScopeViewAllKey } from "../../work-scope-permission/work-scope-permission.constants";
import { TASK_VIEW_SCOPE_FLAG } from "../../task/task-view-scope";
import { EXPENSE_VIEW_SCOPE_FLAG } from "../../expense-request/expense-view-scope";

/**
 * F02 P3-D1 (owner kararı 07.11.2026) — dosya görünüm kapsamı saf sözleşmesi (DB yok).
 *  1. Anahtar `office.cases.view_all` AYRI üçüncü F02 anahtarıdır (grant altyapısı tanır); bayrak görev / masraf bayraklarından ayrı.
 *  2. Bayrak yalnız 'true' (harf duyarsız) ile açılır.
 *  3. ALLOW → kapsam yok (null = büro geneli); DENY ve NONE → varsayılan kapsam (DENY ilişkileri KALDIRMAZ).
 *  4. Varsayılan kapsam: aktif Dosya Sorumlusu ∪ oluşturan ∪ CaseLawyer ∪ CaseStaff canView; her dalda aktif kart + aktif hesap
 *     + aynı büro. Rol / rütbe / ReportingLine / müvekkil yüklemde YOK.
 */
describe("F02 P3-D1 — case-view-scope (saf)", () => {
  it("anahtar ayrı üçüncü F02 anahtarı; bayrak görev ve masraf bayraklarından ayrı", () => {
    expect(CASE_VIEW_ALL_KEY).toBe("office.cases.view_all");
    expect(WORK_SCOPE_VIEW_ALL_KEYS).toEqual(["office.tasks.view_all", "office.expenses.view_all", "office.cases.view_all"]);
    expect(isWorkScopeViewAllKey(CASE_VIEW_ALL_KEY)).toBe(true);
    expect(CASE_VIEW_SCOPE_FLAG).toBe("OFFICE_CASE_VIEW_SCOPE_ENABLED");
    expect(new Set([CASE_VIEW_SCOPE_FLAG, TASK_VIEW_SCOPE_FLAG, EXPENSE_VIEW_SCOPE_FLAG]).size).toBe(3);
  });

  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["1", false],
    ["yes", false],
    ["true", true],
    ["TRUE", true],
  ])("bayrak %p → %p", (value, expected) => {
    const env: NodeJS.ProcessEnv = value === undefined ? {} : { [CASE_VIEW_SCOPE_FLAG]: value };
    expect(isCaseViewScopeEnabled(env)).toBe(expected);
  });

  it("görev / masraf bayrağı dosya kapsamını AÇMAZ", () => {
    expect(isCaseViewScopeEnabled({ [TASK_VIEW_SCOPE_FLAG]: "true", [EXPENSE_VIEW_SCOPE_FLAG]: "true" })).toBe(false);
  });

  it("ALLOW → null; DENY ve NONE → aynı varsayılan kapsam (DENY yalnız büro geneli genişlemeyi engeller)", () => {
    expect(caseViewWhereFor("ALLOW", "t1", "u1")).toBeNull();
    expect(caseViewWhereFor("DENY", "t1", "u1")).toEqual(caseViewScopeWhere("t1", "u1"));
    expect(caseViewWhereFor("NONE", "t1", "u1")).toEqual(caseViewScopeWhere("t1", "u1"));
  });

  it("varsayılan kapsam yüklemi: Dosya Sorumlusu ∪ oluşturan ∪ CaseLawyer ∪ CaseStaff canView; aktif kart + aktif hesap + aynı büro", () => {
    const account = { id: "u1", tenantId: "t1", isActive: true };
    expect(caseViewScopeWhere("t1", "u1")).toEqual({
      OR: [
        { responsibleLawyer: { tenantId: "t1", isActive: true, user: account } },
        { responsibleStaff: { tenantId: "t1", isActive: true, user: account } },
        { createdBy: account },
        { lawyers: { some: { lawyer: { tenantId: "t1", isActive: true, user: account } } } },
        { staff: { some: { canView: true, staffMember: { tenantId: "t1", isActive: true, user: account } } } },
      ],
    });
  });

  it("rol, rütbe, ReportingLine, müvekkil ve delege yüklemde YOK; kimlik id ile değil hesap ilişkisiyle eşlenir", () => {
    const text = JSON.stringify(caseViewScopeWhere("t1", "u1"));
    for (const forbidden of ["role", "lawyerRank", "reportingLine", "client", "ADMIN", "PARTNER", "MANAGER", "delegate", "createdById"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

import { TASK_VIEW_ALL_KEY, TASK_VIEW_SCOPE_FLAG, isTaskViewScopeEnabled, taskViewScopeWhere, taskViewWhereFor } from "../task-view-scope";

/**
 * F02-B dilim 3 — görev görünüm kapsamı saf sözleşmesi (DB yok).
 *  1. Bayrak yalnız 'true' (harf duyarsız) ile açılır; masraf bayrağından AYRI ad (kademeli etkinleştirme).
 *  2. ALLOW → kapsam yok (null = büro geneli); DENY ve NONE → varsayılan kapsam.
 *  3. Varsayılan kapsam: atanan ∪ oluşturan ∪ dosya bağı (CaseLawyer / CaseStaff canView) — dosyasız görev yalnız
 *     atanan/oluşturan; rol / rütbe / ReportingLine / müvekkil yüklemde YOK.
 */
describe("F02-B dilim 3 — task-view-scope (saf)", () => {
  it("anahtar F02-B-1 anahtarıyla aynı; bayrak masraf bayrağından ayrı", () => {
    expect(TASK_VIEW_ALL_KEY).toBe("office.tasks.view_all");
    expect(TASK_VIEW_SCOPE_FLAG).toBe("OFFICE_TASK_VIEW_SCOPE_ENABLED");
    expect(TASK_VIEW_SCOPE_FLAG).not.toBe("OFFICE_EXPENSE_VIEW_SCOPE_ENABLED");
  });

  it.each([
    [undefined, false],
    ["", false],
    ["false", false],
    ["1", false],
    ["true", true],
    ["TRUE", true],
  ])("bayrak %p → %p", (value, expected) => {
    const env: NodeJS.ProcessEnv = value === undefined ? {} : { [TASK_VIEW_SCOPE_FLAG]: value };
    expect(isTaskViewScopeEnabled(env)).toBe(expected);
  });

  it("ALLOW → null; DENY ve NONE → varsayılan kapsam", () => {
    expect(taskViewWhereFor("ALLOW", "t1", "u1")).toBeNull();
    expect(taskViewWhereFor("DENY", "t1", "u1")).toEqual(taskViewScopeWhere("t1", "u1"));
    expect(taskViewWhereFor("NONE", "t1", "u1")).toEqual(taskViewScopeWhere("t1", "u1"));
  });

  it("varsayılan kapsam yüklemi: atanan ∪ oluşturan ∪ dosya bağı; dosyasız yalnız atanan/oluşturan; rol/rütbe/ReportingLine/müvekkil YOK", () => {
    const where = taskViewScopeWhere("t1", "u1");
    expect(where).toEqual({
      OR: [
        { assigneeId: "u1" },
        { createdById: "u1" },
        {
          case: {
            tenantId: "t1",
            OR: [
              { lawyers: { some: { lawyer: { tenantId: "t1", isActive: true, user: { id: "u1", tenantId: "t1", isActive: true } } } } },
              { staff: { some: { canView: true, staffMember: { tenantId: "t1", isActive: true, user: { id: "u1", tenantId: "t1", isActive: true } } } } },
            ],
          },
        },
      ],
    });
    const text = JSON.stringify(where);
    for (const forbidden of ["role", "lawyerRank", "reportingLine", "client", "ADMIN", "PARTNER", "caseId"]) {
      expect(text).not.toContain(forbidden);
    }
  });
});

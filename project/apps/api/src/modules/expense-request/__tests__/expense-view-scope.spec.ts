import {
  EXPENSE_VIEW_ALL_KEY,
  EXPENSE_VIEW_SCOPE_FLAG,
  expenseViewScopeWhere,
  expenseViewWhereFor,
  isExpenseViewScopeEnabled,
} from '../expense-view-scope';

/**
 * F02-B dilim 2 — masraf görünüm kapsamı saf sözleşmesi (DB yok).
 *  1. Bayrak yalnız 'true' (büyük/küçük harf duyarsız) ile açılır; yok / başka değer → kapalı (bugünkü davranış).
 *  2. ALLOW → kapsam yok (null = büro geneli); DENY ve NONE → varsayılan kapsam (DENY baskınlığı resolve() katmanında).
 *  3. Varsayılan kapsam: oluşturan ∪ onaylayan ∪ dosya bağı (CaseLawyer / CaseStaff canView) — rol / rütbe / ReportingLine
 *     / müvekkil ilişkisi yüklemde YOK; kart ve hesap aktif ve aynı büroda.
 */
describe('F02-B dilim 2 — expense-view-scope (saf)', () => {
  it('anahtar F02-B-1 anahtarıyla aynı; bayrak adı konvansiyona uygun', () => {
    expect(EXPENSE_VIEW_ALL_KEY).toBe('office.expenses.view_all');
    expect(EXPENSE_VIEW_SCOPE_FLAG).toBe('OFFICE_EXPENSE_VIEW_SCOPE_ENABLED');
  });

  it.each([
    [undefined, false],
    ['', false],
    ['false', false],
    ['1', false],
    ['yes', false],
    ['true', true],
    ['TRUE', true],
    ['True', true],
  ])('bayrak %p → %p', (value, expected) => {
    const env: NodeJS.ProcessEnv = value === undefined ? {} : { [EXPENSE_VIEW_SCOPE_FLAG]: value };
    expect(isExpenseViewScopeEnabled(env)).toBe(expected);
  });

  it('ALLOW → null (büro geneli); DENY ve NONE → varsayılan kapsam', () => {
    expect(expenseViewWhereFor('ALLOW', 't1', 'u1')).toBeNull();
    expect(expenseViewWhereFor('DENY', 't1', 'u1')).toEqual(expenseViewScopeWhere('t1', 'u1'));
    expect(expenseViewWhereFor('NONE', 't1', 'u1')).toEqual(expenseViewScopeWhere('t1', 'u1'));
  });

  it('varsayılan kapsam yüklemi: oluşturan ∪ onaylayan ∪ dosya bağı; rol / rütbe / ReportingLine / müvekkil YOK', () => {
    const where = expenseViewScopeWhere('t1', 'u1');
    expect(where).toEqual({
      OR: [
        { createdById: 'u1' },
        { approvedById: 'u1' },
        {
          case: {
            tenantId: 't1',
            OR: [
              { lawyers: { some: { lawyer: { tenantId: 't1', isActive: true, user: { id: 'u1', tenantId: 't1', isActive: true } } } } },
              { staff: { some: { canView: true, staffMember: { tenantId: 't1', isActive: true, user: { id: 'u1', tenantId: 't1', isActive: true } } } } },
            ],
          },
        },
      ],
    });
    const text = JSON.stringify(where);
    for (const forbidden of ['role', 'lawyerRank', 'reportingLine', 'client', 'ADMIN', 'PARTNER']) {
      expect(text).not.toContain(forbidden);
    }
  });
});

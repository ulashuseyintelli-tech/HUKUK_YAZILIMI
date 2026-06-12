/**
 * CpeRequiredGuard - caseIdFromExpenseParam (P1b)
 *
 * Expense-scoped endpoint'lerde caseId, route ':id' (expense request id) üzerinden
 * TENANT-SCOPED çözülür. Cross-tenant sızıntı engellenir; expense yoksa / tenant uyuşmazsa
 * fail-closed (CPE çağrılmaz). Non-expense endpoint'lerin mevcut senkron davranışı korunur.
 */
import { ForbiddenException } from '@nestjs/common';
import { CpeRequiredGuard } from '../cpe-required.guard';
import {
  CPE_ACTION_CODE_KEY,
  CPE_SCOPE_RESOLVER_KEY,
  CPE_CASE_ID_RESOLVER_KEY,
  CPE_CASE_ID_FROM_EXPENSE_PARAM_KEY,
  defaultCaseIdResolver,
} from '../cpe-required.decorator';
import { ActionCode } from '../../types/action-code.enum';

const makeReflector = (meta: Record<string, unknown>) =>
  ({ get: jest.fn((key: string) => meta[key]) } as any);

const makeContext = (request: unknown) =>
  ({
    getHandler: () => () => undefined,
    switchToHttp: () => ({ getRequest: () => request }),
  } as any);

describe('CpeRequiredGuard - caseIdFromExpenseParam (P1b)', () => {
  let cpe: { canPerformAction: jest.Mock };
  let prisma: { expenseRequest: { findFirst: jest.Mock } };

  beforeEach(() => {
    cpe = { canPerformAction: jest.fn() };
    prisma = { expenseRequest: { findFirst: jest.fn() } };
  });

  const expenseMeta = {
    [CPE_ACTION_CODE_KEY]: ActionCode.APPROVE_EXPENSE,
    [CPE_SCOPE_RESOLVER_KEY]: undefined,
    [CPE_CASE_ID_RESOLVER_KEY]: defaultCaseIdResolver,
    [CPE_CASE_ID_FROM_EXPENSE_PARAM_KEY]: true,
  };

  it('expense :id + eşleşen tenant → caseId çözülür, CPE çağrılır, izin verilir', async () => {
    prisma.expenseRequest.findFirst.mockResolvedValue({ caseId: 'case-1' });
    cpe.canPerformAction.mockResolvedValue({ allowed: true, code: 'OK' });
    const guard = new CpeRequiredGuard(makeReflector(expenseMeta), cpe as any, prisma as any);

    const req = { params: { id: 'exp-1' }, user: { tenantId: 't1' } };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);

    // tenant-scoped lookup
    expect(prisma.expenseRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'exp-1', tenantId: 't1' },
      select: { caseId: true },
    });
    // CPE çözülen caseId + expense context ile çağrıldı
    expect(cpe.canPerformAction).toHaveBeenCalledWith(
      'case-1',
      ActionCode.APPROVE_EXPENSE,
      { expenseId: 'exp-1' },
    );
  });

  it('farklı tenant (row bulunamaz) → fail-closed 403, CPE çağrılmaz', async () => {
    prisma.expenseRequest.findFirst.mockResolvedValue(null); // başka tenant → tenant-scoped where null döner
    const guard = new CpeRequiredGuard(makeReflector(expenseMeta), cpe as any, prisma as any);

    const req = { params: { id: 'exp-1' }, user: { tenantId: 't2' } };
    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(cpe.canPerformAction).not.toHaveBeenCalled();
  });

  it('expense bulunamadı → fail-closed 403', async () => {
    prisma.expenseRequest.findFirst.mockResolvedValue(null);
    const guard = new CpeRequiredGuard(makeReflector(expenseMeta), cpe as any, prisma as any);

    const req = { params: { id: 'missing' }, user: { tenantId: 't1' } };
    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(cpe.canPerformAction).not.toHaveBeenCalled();
  });

  it('tenantId yok → fail-closed 403, lookup yapılmaz', async () => {
    const guard = new CpeRequiredGuard(makeReflector(expenseMeta), cpe as any, prisma as any);

    const req = { params: { id: 'exp-1' }, user: {} };
    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.expenseRequest.findFirst).not.toHaveBeenCalled();
    expect(cpe.canPerformAction).not.toHaveBeenCalled();
  });

  it('non-expense endpoint (flag yok) → mevcut senkron caseId davranışı korunur', async () => {
    const meta = {
      [CPE_ACTION_CODE_KEY]: ActionCode.UYAP_SEND,
      [CPE_SCOPE_RESOLVER_KEY]: undefined,
      [CPE_CASE_ID_RESOLVER_KEY]: defaultCaseIdResolver,
      [CPE_CASE_ID_FROM_EXPENSE_PARAM_KEY]: false,
    };
    cpe.canPerformAction.mockResolvedValue({ allowed: true, code: 'OK' });
    const guard = new CpeRequiredGuard(makeReflector(meta), cpe as any, prisma as any);

    const req = { params: { caseId: 'case-9' }, user: { tenantId: 't1' } };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);

    // expense lookup'a hiç gidilmez
    expect(prisma.expenseRequest.findFirst).not.toHaveBeenCalled();
    expect(cpe.canPerformAction).toHaveBeenCalledWith('case-9', ActionCode.UYAP_SEND, undefined);
  });
});

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
    // CPE çözülen caseId + expense context ile çağrıldı.
    // DEBTOR-CPE-TENANT-HARDENING-P1-I01: principal tenant ILK argüman olarak taşınır.
    // I04: context ayrıca SERVER-AUTHORITATIVE aktör bağlamı taşır (tenantId /
    // authenticatedUserId / evaluatedAt); scopeResolver çıktısı bu alanları EZEMEZ.
    expect(cpe.canPerformAction).toHaveBeenCalledWith(
      't1',
      'case-1',
      ActionCode.APPROVE_EXPENSE,
      expect.objectContaining({ expenseId: 'exp-1', tenantId: 't1' }),
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
    // I04: scopeResolver yokken bile authenticated principal'dan aktör bağlamı eklenir.
    expect(cpe.canPerformAction).toHaveBeenCalledWith(
      't1',
      'case-9',
      ActionCode.UYAP_SEND,
      expect.objectContaining({ tenantId: 't1' }),
    );
  });
});

/**
 * DEBTOR-CPE-TENANT-HARDENING-P1-I01 (DEBTOR-IDOR-02)
 *
 * `caseIdFromExpenseParam` DIŞINDAKİ (varsayılan) dalda `caseId` doğrudan istemciden
 * gelir (params/body/query). Önceden bu dalda hiçbir tenant doğrulaması yoktu; guard
 * ham caseId'yi CPE'ye geçiriyordu. Artık tenant claim'i zorunludur ve CPE'ye ilk
 * argüman olarak taşınır (case sahipliğini CPE doğrular).
 */
describe('CpeRequiredGuard - varsayılan dal tenant zorunluluğu (DEBTOR-IDOR-02)', () => {
  const nonExpenseMeta = {
    [CPE_ACTION_CODE_KEY]: ActionCode.UYAP_SEND,
    [CPE_SCOPE_RESOLVER_KEY]: undefined,
    [CPE_CASE_ID_RESOLVER_KEY]: defaultCaseIdResolver,
    [CPE_CASE_ID_FROM_EXPENSE_PARAM_KEY]: false,
  };

  it('tenant claim yok → fail-closed 403, CPE ÇAĞRILMAZ (istemci caseId geçse bile)', async () => {
    const cpe = { canPerformAction: jest.fn() };
    const prisma = { expenseRequest: { findFirst: jest.fn() } };
    const guard = new CpeRequiredGuard(makeReflector(nonExpenseMeta), cpe as any, prisma as any);

    const req = { params: { caseId: 'baska-tenant-case' }, user: {} };
    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(cpe.canPerformAction).not.toHaveBeenCalled();
  });

  it('user hiç yok → fail-closed 403, CPE ÇAĞRILMAZ', async () => {
    const cpe = { canPerformAction: jest.fn() };
    const prisma = { expenseRequest: { findFirst: jest.fn() } };
    const guard = new CpeRequiredGuard(makeReflector(nonExpenseMeta), cpe as any, prisma as any);

    const req = { params: { caseId: 'case-9' } };
    await expect(guard.canActivate(makeContext(req))).rejects.toBeInstanceOf(ForbiddenException);
    expect(cpe.canPerformAction).not.toHaveBeenCalled();
  });

  it('body içindeki tenantId AUTHORITY DEĞİL — yalnız principal claim kullanılır', async () => {
    const cpe = { canPerformAction: jest.fn().mockResolvedValue({ allowed: true, code: 'OK' }) };
    const prisma = { expenseRequest: { findFirst: jest.fn() } };
    const guard = new CpeRequiredGuard(makeReflector(nonExpenseMeta), cpe as any, prisma as any);

    const req = {
      params: { caseId: 'case-9' },
      body: { tenantId: 'saldirgan-tenant' },
      user: { tenantId: 'gercek-tenant' },
    };
    await expect(guard.canActivate(makeContext(req))).resolves.toBe(true);
    // I04: aktör bağlamı da principal'dan gelir — body.tenantId ASLA authority değildir.
    expect(cpe.canPerformAction).toHaveBeenCalledWith(
      'gercek-tenant',
      'case-9',
      ActionCode.UYAP_SEND,
      expect.objectContaining({ tenantId: 'gercek-tenant' }),
    );
  });
});

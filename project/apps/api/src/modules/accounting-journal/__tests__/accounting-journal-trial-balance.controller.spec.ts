import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AccountingJournalTrialBalanceController } from '../accounting-journal-trial-balance.controller';

function serviceMock() {
  return {
    getTrialBalance: jest.fn().mockResolvedValue({ report: 'trial-balance' }),
  } as any;
}

function classGuards(): any[] {
  return Reflect.getMetadata(GUARDS_METADATA, AccountingJournalTrialBalanceController) || [];
}

function methodGuards(): any[] {
  return Reflect.getMetadata(
    GUARDS_METADATA,
    AccountingJournalTrialBalanceController.prototype.getTrialBalance,
  ) || [];
}

describe('AccountingJournalTrialBalanceController', () => {
  it('auth tenant delegation: tenantId is taken from CurrentUser context and filters are forwarded', async () => {
    const service = serviceMock();
    const controller = new AccountingJournalTrialBalanceController(service);

    await controller.getTrialBalance('tenant-auth', {
      currency: 'TRY',
      caseId: 'case-1',
      clientId: 'client-1',
      caseClientId: 'case-client-1',
      accountCode: 'CLIENT_PAYABLE',
      sourceType: 'CLIENT_OFFSET',
      sourceAction: 'apply',
      entryType: 'CLIENT_OFFSET_APPLIED',
      postedFrom: '2026-06-01',
      postedTo: '2026-06-30T23:59:59.999Z',
    });

    expect(service.getTrialBalance).toHaveBeenCalledWith({
      tenantId: 'tenant-auth',
      currency: 'TRY',
      caseId: 'case-1',
      clientId: 'client-1',
      caseClientId: 'case-client-1',
      accountCode: 'CLIENT_PAYABLE',
      sourceType: 'CLIENT_OFFSET',
      sourceAction: 'apply',
      entryType: 'CLIENT_OFFSET_APPLIED',
      postedFrom: '2026-06-01T00:00:00.000Z',
      postedTo: '2026-06-30T23:59:59.999Z',
    });
  });


  it('accepts ExpenseRequest skeleton filters for trial balance diagnostics', async () => {
    const service = serviceMock();
    const controller = new AccountingJournalTrialBalanceController(service);

    await controller.getTrialBalance('tenant-auth', {
      sourceType: 'EXPENSE_REQUEST',
      sourceAction: 'cancel',
      entryType: 'EXPENSE_REQUEST_CANCELLED',
    });

    expect(service.getTrialBalance).toHaveBeenCalledWith({
      tenantId: 'tenant-auth',
      sourceType: 'EXPENSE_REQUEST',
      sourceAction: 'cancel',
      entryType: 'EXPENSE_REQUEST_CANCELLED',
    });
  });

  it('accepts ExpensePayment skeleton filters for trial balance diagnostics', async () => {
    const service = serviceMock();
    const controller = new AccountingJournalTrialBalanceController(service);

    await controller.getTrialBalance('tenant-auth', {
      sourceType: 'EXPENSE_PAYMENT',
      sourceAction: 'recorded',
      entryType: 'EXPENSE_PAYMENT_RECORDED',
    });

    expect(service.getTrialBalance).toHaveBeenCalledWith({
      tenantId: 'tenant-auth',
      sourceType: 'EXPENSE_PAYMENT',
      sourceAction: 'recorded',
      entryType: 'EXPENSE_PAYMENT_RECORDED',
    });
  });

  it('accepts expense application skeleton filters for trial balance diagnostics', async () => {
    const service = serviceMock();
    const controller = new AccountingJournalTrialBalanceController(service);

    await controller.getTrialBalance('tenant-auth', {
      sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION',
      sourceAction: 'reversal',
      entryType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION_REVERSED',
    });

    expect(service.getTrialBalance).toHaveBeenCalledWith({
      tenantId: 'tenant-auth',
      sourceType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION',
      sourceAction: 'reversal',
      entryType: 'COLLECTION_DISPOSITION_EXPENSE_APPLICATION_REVERSED',
    });
  });
  it('query tenant ignore: query tenantId cannot override the auth tenant', async () => {
    const service = serviceMock();
    const controller = new AccountingJournalTrialBalanceController(service);

    await controller.getTrialBalance('tenant-auth', {
      tenantId: 'tenant-query',
      currency: 'TRY',
    });

    expect(service.getTrialBalance).toHaveBeenCalledWith({
      tenantId: 'tenant-auth',
      currency: 'TRY',
    });
  });

  it('guard metadata: class uses JwtAuthGuard and endpoint uses AdminGuard', () => {
    expect(classGuards()).toContain(JwtAuthGuard);
    expect(methodGuards()).toContain(AdminGuard);
  });

  it.each([
    ['accountCode', 'NOT_AN_ACCOUNT'],
    ['sourceType', 'NOT_A_SOURCE'],
    ['entryType', 'NOT_AN_ENTRY'],
  ])('invalid enum query: %s is rejected before service delegation', async (field, value) => {
    const service = serviceMock();
    const controller = new AccountingJournalTrialBalanceController(service);

    await expect(
      controller.getTrialBalance('tenant-auth', { [field]: value }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.getTrialBalance).not.toHaveBeenCalled();
  });

  it('invalid date query: postedFrom is rejected before service delegation', async () => {
    const service = serviceMock();
    const controller = new AccountingJournalTrialBalanceController(service);

    await expect(
      controller.getTrialBalance('tenant-auth', { postedFrom: 'not-a-date' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.getTrialBalance).not.toHaveBeenCalled();
  });

  it('read-only service delegation: returns the service report without writer-side behavior', async () => {
    const service = serviceMock();
    const controller = new AccountingJournalTrialBalanceController(service);

    await expect(controller.getTrialBalance('tenant-auth', {})).resolves.toEqual({
      report: 'trial-balance',
    });
    expect(service.getTrialBalance).toHaveBeenCalledTimes(1);
    expect(service.getTrialBalance).toHaveBeenCalledWith({ tenantId: 'tenant-auth' });
  });
});

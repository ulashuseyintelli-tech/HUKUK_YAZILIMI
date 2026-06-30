import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { AdminGuard } from '../../auth/guards/admin.guard';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { AccountingJournalCutoverReadinessController } from '../accounting-journal-cutover-readiness.controller';

function serviceMock() {
  return {
    getCutoverReadiness: jest.fn().mockResolvedValue({ report: 'cutover-readiness' }),
  } as any;
}

function classGuards(): any[] {
  return Reflect.getMetadata(GUARDS_METADATA, AccountingJournalCutoverReadinessController) || [];
}

function methodGuards(): any[] {
  return Reflect.getMetadata(
    GUARDS_METADATA,
    AccountingJournalCutoverReadinessController.prototype.getCutoverReadiness,
  ) || [];
}

describe('AccountingJournalCutoverReadinessController', () => {
  it('auth tenant delegation: tenantId is taken from CurrentUser context and filters are forwarded', async () => {
    const service = serviceMock();
    const controller = new AccountingJournalCutoverReadinessController(service);

    await controller.getCutoverReadiness('tenant-auth', {
      tenantId: 'tenant-query',
      currency: 'TRY',
      caseId: 'case-1',
      postedFrom: '2026-06-01',
      postedTo: '2026-06-30T23:59:59.999Z',
    });

    expect(service.getCutoverReadiness).toHaveBeenCalledWith({
      tenantId: 'tenant-auth',
      currency: 'TRY',
      caseId: 'case-1',
      postedFrom: '2026-06-01T00:00:00.000Z',
      postedTo: '2026-06-30T23:59:59.999Z',
    });
  });

  it('guard metadata: class uses JwtAuthGuard and endpoint uses AdminGuard', () => {
    expect(classGuards()).toContain(JwtAuthGuard);
    expect(methodGuards()).toContain(AdminGuard);
  });

  it('read-only service delegation: returns the service report without primary switch behavior', async () => {
    const service = serviceMock();
    const controller = new AccountingJournalCutoverReadinessController(service);

    await expect(controller.getCutoverReadiness('tenant-auth', {})).resolves.toEqual({
      report: 'cutover-readiness',
    });
    expect(service.getCutoverReadiness).toHaveBeenCalledTimes(1);
    expect(service.getCutoverReadiness).toHaveBeenCalledWith({ tenantId: 'tenant-auth' });
  });

  it('invalid repeated query value is rejected before service delegation', async () => {
    const service = serviceMock();
    const controller = new AccountingJournalCutoverReadinessController(service);

    await expect(
      controller.getCutoverReadiness('tenant-auth', { currency: ['TRY', 'USD'] }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.getCutoverReadiness).not.toHaveBeenCalled();
  });

  it('invalid date query is rejected before service delegation', async () => {
    const service = serviceMock();
    const controller = new AccountingJournalCutoverReadinessController(service);

    await expect(
      controller.getCutoverReadiness('tenant-auth', { postedFrom: 'not-a-date' }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(service.getCutoverReadiness).not.toHaveBeenCalled();
  });
});

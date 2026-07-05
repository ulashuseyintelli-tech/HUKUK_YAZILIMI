import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import * as request from 'supertest';
import { ExpenseRequestController } from '../expense-request.controller';
import { ExpenseRequestService } from '../expense-request.service';
import { ExpenseGateService } from '../expense-gate.service';
import { ExpenseNotificationService } from '../expense-notification.service';
import { ExpenseViewService } from '../expense-view.service';
import { ExpenseCalculatorService } from '../expense-calculator.service';
import { CpeRequiredGuard } from '../../policy-engine/decorators/cpe-required.guard';
import { CasePolicyEngine } from '../../policy-engine/case-policy-engine.service';
import { ActionCode } from '../../policy-engine/types/action-code.enum';
import { PrismaService } from '../../../prisma/prisma.service';

jest.mock('@nestjs/passport', () => ({
  AuthGuard: jest.fn(() => class MockJwtAuthGuard {
    canActivate(context: any) {
      const req = context.switchToHttp().getRequest();
      req.user = {
        id: req.headers['x-user-id'] ?? 'user-1',
        tenantId: req.headers['x-tenant-id'] ?? 'tenant-1',
      };
      return true;
    }
  }),
}));

describe('ExpenseRequestController CPE runtime enforcement (MVR-006)', () => {
  let app: INestApplication;
  let service: {
    finalizeAndSend: jest.Mock;
    approveForDistribution: jest.Mock;
    rejectForDistribution: jest.Mock;
    recordPayment: jest.Mock;
  };
  let cpe: { canPerformAction: jest.Mock };
  let prisma: { expenseRequest: { findFirst: jest.Mock } };

  beforeEach(async () => {
    service = {
      finalizeAndSend: jest.fn().mockResolvedValue({ id: 'exp-1', status: 'SENT' }),
      approveForDistribution: jest.fn().mockResolvedValue({ id: 'exp-1', status: 'APPROVED' }),
      rejectForDistribution: jest.fn().mockResolvedValue({ id: 'exp-1', status: 'REJECTED' }),
      recordPayment: jest.fn().mockResolvedValue({ id: 'payment-1' }),
    };
    cpe = { canPerformAction: jest.fn().mockResolvedValue({ allowed: true, code: 'OK' }) };
    prisma = { expenseRequest: { findFirst: jest.fn().mockResolvedValue({ caseId: 'case-1' }) } };

    const moduleRef = await Test.createTestingModule({
      controllers: [ExpenseRequestController],
      providers: [
        CpeRequiredGuard,
        { provide: ExpenseRequestService, useValue: service },
        { provide: ExpenseGateService, useValue: {} },
        { provide: ExpenseNotificationService, useValue: {} },
        { provide: ExpenseViewService, useValue: {} },
        { provide: ExpenseCalculatorService, useValue: {} },
        { provide: CasePolicyEngine, useValue: cpe },
        { provide: PrismaService, useValue: prisma },
      ],
    }).compile();

    app = moduleRef.createNestApplication();
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('cross-tenant expense id -> 403 and service is not called', async () => {
    prisma.expenseRequest.findFirst.mockResolvedValueOnce(null);

    await request(app.getHttpServer())
      .post('/expense-requests/exp-cross/finalize')
      .set('x-tenant-id', 'tenant-2')
      .send({ channel: 'EMAIL' })
      .expect(403);

    expect(prisma.expenseRequest.findFirst).toHaveBeenCalledWith({
      where: { id: 'exp-cross', tenantId: 'tenant-2' },
      select: { caseId: true },
    });
    expect(cpe.canPerformAction).not.toHaveBeenCalled();
    expect(service.finalizeAndSend).not.toHaveBeenCalled();
  });

  it('CPE denied -> 403 and service is not called', async () => {
    cpe.canPerformAction.mockResolvedValueOnce({
      allowed: false,
      code: 'GATE_BLOCKED',
      reason: 'Not allowed',
      blockedBy: { gateCode: 'TEST_DENIED' },
      decisionId: 'decision-1',
      traceId: 'trace-1',
    });

    await request(app.getHttpServer())
      .post('/expense-requests/exp-1/finalize')
      .send({ channel: 'EMAIL' })
      .expect(403);

    expect(cpe.canPerformAction).toHaveBeenCalledWith(
      'case-1',
      ActionCode.APPROVE_EXPENSE,
      { expenseId: 'exp-1' },
    );
    expect(service.finalizeAndSend).not.toHaveBeenCalled();
  });

  it.each([
    ['finalize', '/expense-requests/exp-1/finalize', { channel: 'EMAIL' }, ActionCode.APPROVE_EXPENSE, 'finalizeAndSend'],
    ['approve', '/expense-requests/exp-1/approve', {}, ActionCode.APPROVE_EXPENSE, 'approveForDistribution'],
    ['reject', '/expense-requests/exp-1/reject', { note: 'no' }, ActionCode.APPROVE_EXPENSE, 'rejectForDistribution'],
    ['payment', '/expense-requests/exp-1/payment', { amount: 100, paymentDate: '2026-07-05', method: 'BANKA' }, ActionCode.RECORD_COLLECTION, 'recordPayment'],
  ] as const)('%s endpoint runs CPE before service method', async (_name, url, body, actionCode, serviceMethod) => {
    await request(app.getHttpServer())
      .post(url)
      .send(body)
      .expect(201);

    expect(cpe.canPerformAction).toHaveBeenCalledWith(
      'case-1',
      actionCode,
      { expenseId: 'exp-1' },
    );
    expect(service[serviceMethod]).toHaveBeenCalledTimes(1);
  });
});
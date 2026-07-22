import { AuditService, AuditLogInput } from '../audit.service';

describe('AuditService CAP-09A attribution field mapping', () => {
  let prisma: { auditLog: { create: jest.Mock } };
  let service: AuditService;

  const cap09aInput: AuditLogInput = {
    tenantId: 'tenant-1',
    action: 'CLIENT_UPDATE',
    entityType: 'Client',
    actorType: 'USER',
    decisionResult: 'ALLOW',
    reasonCode: 'POLICY_OK',
    correlationId: 'corr-1',
    requestId: 'req-1',
    policyRef: 'policy-1',
    policyVersion: '1.0.0',
  };

  beforeEach(() => {
    prisma = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    service = new AuditService(prisma as any);
  });

  it('log() yeni CAP-09A alanlarını Prisma data payload’una map eder', async () => {
    await service.log(cap09aInput);
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'USER',
        decisionResult: 'ALLOW',
        reasonCode: 'POLICY_OK',
        correlationId: 'corr-1',
        requestId: 'req-1',
        policyRef: 'policy-1',
        policyVersion: '1.0.0',
      }),
    });
  });

  it('log() CAP-09A alanları olmadan çağrılırsa yeni alanlar undefined map edilir (mevcut çağıranlar etkilenmez)', async () => {
    await service.log({ tenantId: 't1', action: 'A', entityType: 'E' });
    expect(prisma.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: undefined,
        decisionResult: undefined,
        reasonCode: undefined,
        correlationId: undefined,
        requestId: undefined,
        policyRef: undefined,
        policyVersion: undefined,
      }),
    });
  });

  it('logInTransaction() yeni CAP-09A alanlarını tx data payload’una map eder', async () => {
    const tx = { auditLog: { create: jest.fn().mockResolvedValue({}) } };
    await service.logInTransaction(tx as any, cap09aInput);
    expect(tx.auditLog.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        actorType: 'USER',
        decisionResult: 'ALLOW',
        reasonCode: 'POLICY_OK',
        correlationId: 'corr-1',
        requestId: 'req-1',
        policyRef: 'policy-1',
        policyVersion: '1.0.0',
      }),
    });
  });
});

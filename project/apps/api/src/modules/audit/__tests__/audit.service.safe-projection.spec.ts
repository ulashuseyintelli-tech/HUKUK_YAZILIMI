import { AuditService } from '../audit.service';

describe('AuditService safe projection reads', () => {
  const createdAt = new Date('2026-06-30T10:00:00.000Z');
  const auditLog = {
    id: 'audit-1',
    tenantId: 'tenant-1',
    action: 'CLIENT_UPDATE',
    entityType: 'Client',
    entityId: 'client-1',
    userId: 'user-1',
    userName: 'Ada Operator',
    userIp: '127.0.0.1',
    userAgent: 'jest',
    description: 'Client status changed for ada.lovelace@example.com',
    metadata: {
      clientId: 'client-1',
      requestId: 'req eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature 4111111111111111',
      emailReference: 'ada.lovelace@example.com',
      rawNote: 'raw user authored note should not be projected',
      apiKey: 'sk-live-should-not-leak',
    },
    oldValues: {
      status: 'OPEN',
      clientId: 'client-1',
      note: 'old raw note',
    },
    newValues: {
      status: 'CLOSED',
      clientId: 'client-1',
      note: 'new raw note',
    },
    createdAt,
  };

  let prisma: {
    auditLog: {
      findMany: jest.Mock;
      count: jest.Mock;
    };
  };
  let service: AuditService;

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-30T12:00:00.000Z'));
    prisma = {
      auditLog: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
    };
    service = new AuditService(prisma as any);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('getLogs returns existing raw fields plus safeProjection without changing filters or pagination', async () => {
    const startDate = new Date('2026-06-01T00:00:00.000Z');
    const endDate = new Date('2026-06-30T23:59:59.000Z');
    prisma.auditLog.findMany.mockResolvedValue([auditLog]);
    prisma.auditLog.count.mockResolvedValue(1);

    const result = await service.getLogs(
      'tenant-1',
      {
        action: 'CLIENT_UPDATE',
        entityType: 'Client',
        entityId: 'client-1',
        userId: 'user-1',
        startDate,
        endDate,
      },
      2,
      10,
    );

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        action: 'CLIENT_UPDATE',
        entityType: 'Client',
        entityId: 'client-1',
        userId: 'user-1',
        createdAt: { gte: startDate, lte: endDate },
      },
      orderBy: { createdAt: 'desc' },
      skip: 10,
      take: 10,
    });
    expect(prisma.auditLog.count).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        action: 'CLIENT_UPDATE',
        entityType: 'Client',
        entityId: 'client-1',
        userId: 'user-1',
        createdAt: { gte: startDate, lte: endDate },
      },
    });

    expect(result.total).toBe(1);
    expect(result.totalPages).toBe(1);
    expect(result.logs[0]).toMatchObject({
      id: 'audit-1',
      description: 'Client status changed for ada.lovelace@example.com',
      metadata: auditLog.metadata,
      oldValues: auditLog.oldValues,
      newValues: auditLog.newValues,
    });
    expect(result.logs[0].safeProjection).toMatchObject({
      id: 'audit-1',
      action: 'CLIENT_UPDATE',
      entityType: 'Client',
      entityId: 'client-1',
      actor: { id: 'user-1', displayName: 'Ada Operator' },
      rawValuePresence: { metadata: true, oldValues: true, newValues: true },
    });
    const safeSerialized = JSON.stringify(result.logs[0].safeProjection);
    expect(safeSerialized).toContain('ad****@example.com');
    expect(safeSerialized).toContain('[token masked]');
    expect(safeSerialized).toContain('[card masked]');
    expect(safeSerialized).not.toContain('raw user authored note should not be projected');
    expect(safeSerialized).not.toContain('sk-live-should-not-leak');
    expect(result.logs[0].safeProjection.oldValues).toEqual({
      status: 'OPEN',
      clientId: 'client-1',
    });
    expect(result.logs[0].safeProjection.newValues).toEqual({
      status: 'CLOSED',
      clientId: 'client-1',
    });
  });

  it('getEntityHistory returns raw audit rows with additive safeProjection and tenant scoped lookup', async () => {
    prisma.auditLog.findMany.mockResolvedValue([auditLog]);

    const result = await service.getEntityHistory('tenant-1', 'Client', 'client-1');

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', entityType: 'Client', entityId: 'client-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toHaveLength(1);
    expect(result[0].metadata).toEqual(auditLog.metadata);
    expect(result[0].oldValues).toEqual(auditLog.oldValues);
    expect(result[0].newValues).toEqual(auditLog.newValues);
    expect(result[0].safeProjection.metadata).toMatchObject({
      clientId: 'client-1',
      emailReference: 'ad****@example.com',
    });
  });

  it('getUserActivity returns raw audit rows with additive safeProjection and preserves date filter', async () => {
    prisma.auditLog.findMany.mockResolvedValue([auditLog]);

    const result = await service.getUserActivity('tenant-1', 'user-1', 7);

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        createdAt: { gte: new Date('2026-06-23T12:00:00.000Z') },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(result[0].description).toBe('Client status changed for ada.lovelace@example.com');
    expect(result[0].safeProjection.description).toContain('ad****@example.com');
    expect(result[0].safeProjection.description).not.toContain('ada.lovelace@example.com');
  });
});

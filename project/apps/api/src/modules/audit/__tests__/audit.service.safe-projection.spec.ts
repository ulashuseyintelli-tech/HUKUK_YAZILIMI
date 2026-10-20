import { AuditService } from '../audit.service';
import { AuditController } from '../audit.controller';

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
    caseDebtor: {
      findMany: jest.Mock;
    };
  };
  let service: AuditService;
  let controller: AuditController;
  const req = { user: { tenantId: 'tenant-1' } };

  beforeEach(() => {
    jest.useFakeTimers().setSystemTime(new Date('2026-06-30T12:00:00.000Z'));
    prisma = {
      auditLog: {
        findMany: jest.fn(),
        count: jest.fn(),
      },
      caseDebtor: {
        findMany: jest.fn(),
      },
    };
    service = new AuditService(prisma as any);
    controller = new AuditController(service);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('getLogs returns a safe allowlist without changing filters or pagination', async () => {
    const startDate = new Date('2026-06-01T00:00:00.000Z');
    const endDate = new Date('2026-06-30T23:59:59.000Z');
    prisma.auditLog.findMany.mockResolvedValue([auditLog]);
    prisma.auditLog.count.mockResolvedValue(1);

    const result = await controller.getLogs(
      req, 'CLIENT_UPDATE', 'Client', 'client-1', 'user-1',
      startDate.toISOString(), endDate.toISOString(), '2', '10',
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
      description: 'Client status changed for ad****@example.com',
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

  it('getEntityHistory returns safe audit rows and preserves tenant scoped lookup', async () => {
    prisma.auditLog.findMany.mockResolvedValue([auditLog]);

    const result = await controller.getEntityHistory(req, 'Client', 'client-1');

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: { tenantId: 'tenant-1', entityType: 'Client', entityId: 'client-1' },
      orderBy: { createdAt: 'desc' },
    });
    expect(result).toHaveLength(1);
    expect(result[0]).not.toHaveProperty('metadata');
    expect(result[0]).not.toHaveProperty('oldValues');
    expect(result[0]).not.toHaveProperty('newValues');
    expect(result[0].safeProjection.metadata).toMatchObject({
      clientId: 'client-1',
      emailReference: 'ad****@example.com',
    });
  });

  it('getUserActivity returns safe audit rows and preserves date filter', async () => {
    prisma.auditLog.findMany.mockResolvedValue([auditLog]);

    const result = await controller.getUserActivity(req, 'user-1', '7');

    expect(prisma.auditLog.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        userId: 'user-1',
        createdAt: { gte: new Date('2026-06-23T12:00:00.000Z') },
      },
      orderBy: { createdAt: 'desc' },
    });
    expect(result[0].description).toBe('Client status changed for ad****@example.com');
    expect(result[0].safeProjection.description).toContain('ad****@example.com');
    expect(result[0].safeProjection.description).not.toContain('ada.lovelace@example.com');
  });
  it('getLogs returns action-specific hacizSafeProjection without exposing raw haciz metadata labels', async () => {
    const hacizLog = {
      id: 'haciz-audit-1',
      tenantId: 'tenant-1',
      action: 'HACIZ_REQUEST_SUBMITTED',
      entityType: 'CASE',
      entityId: 'case-1',
      userId: 'user-1',
      userName: 'Av. Operator',
      userIp: '127.0.0.1',
      userAgent: 'jest',
      description: 'Haciz talebi gönderildi (BANK). Karar-anı risk: YUKSEK.',
      metadata: {
        targetType: 'BANK',
        amount: 1000,
        uyapRequestId: 'uyap-req-1',
        cpeTraceId: 'trace-1',
        overallLevel: 'YUKSEK',
        debtors: [
          { debtorId: 'debtor-1', name: 'RAW SNAPSHOT BORCLU 1', level: 'YUKSEK', reasonIds: ['INTEL_NO_ADDRESS'] },
          { debtorId: 'debtor-2', name: 'RAW SNAPSHOT BORCLU 2', level: 'ORTA', reasonIds: ['INTEL_90D_MISSING'] },
        ],
        cpeWarnings: [{ secret: 'RAW CPE WARNING' }],
      },
      oldValues: null,
      newValues: null,
      createdAt,
    };
    prisma.auditLog.findMany.mockResolvedValue([hacizLog]);
    prisma.auditLog.count.mockResolvedValue(1);
    prisma.caseDebtor.findMany.mockResolvedValue([
      { caseId: 'case-1', debtorId: 'debtor-1', debtor: { name: 'Current Domain Debtor' } },
    ]);

    const result = await controller.getLogs(
      req, 'HACIZ_REQUEST_SUBMITTED', 'CASE', 'case-1',
      undefined, undefined, undefined, '1', '20',
    );

    expect(prisma.caseDebtor.findMany).toHaveBeenCalledWith({
      where: {
        caseId: { in: ['case-1'] },
        debtorId: { in: ['debtor-1', 'debtor-2'] },
        case: { is: { tenantId: 'tenant-1' } },
        debtor: { is: { tenantId: 'tenant-1' } },
      },
      select: {
        caseId: true,
        debtorId: true,
        debtor: { select: { name: true } },
      },
    });

    const projection = result.logs[0].hacizSafeProjection;
    expect(projection).toMatchObject({
      action: 'HACIZ_REQUEST_SUBMITTED',
      targetType: { code: 'BANK', label: 'Banka' },
      overallLevel: { code: 'YUKSEK', label: 'Yüksek' },
      actor: { id: 'user-1', displayName: 'Av. Operator' },
      uyapRequestId: 'uyap-req-1',
      cpeTraceId: 'trace-1',
      cpeWarningsPresent: true,
      cpeWarningsCount: 1,
    });
    expect(projection?.debtors[0]).toMatchObject({
      debtorReference: 'debtor-1',
      displayLabel: 'Current Domain Debtor',
      level: { code: 'YUKSEK', label: 'Yüksek' },
      reasons: [{ id: 'INTEL_NO_ADDRESS', label: 'Borçlunun kayıtlı adresi yok' }],
    });
    expect(projection?.debtors[1]).toMatchObject({
      debtorReference: 'debtor-2',
      displayLabel: 'Borçlu #2',
      level: { code: 'ORTA', label: 'Orta' },
      reasons: [{ id: 'INTEL_90D_MISSING', label: 'Son 90 günde doğrulanmış saha istihbaratı yok' }],
    });

    const serializedProjection = JSON.stringify(projection);
    expect(serializedProjection).not.toContain('RAW SNAPSHOT BORCLU');
    expect(serializedProjection).not.toContain('RAW CPE WARNING');
    expect(result.logs[0]).not.toHaveProperty('metadata');
  });

  it.each(['logs', 'entity-history', 'user-activity'] as const)(
    '%s serializes only approved fields, without mutating stored rows',
    async (endpoint) => {
      const stored = {
        ...auditLog,
        userName: 'Operator 12345678901',
        description: 'Changed 12345678901 TR330006100519786457841326',
        futureSecret: 'FUTURE_FIELD_CANARY',
      };
      const original = JSON.stringify(stored);
      prisma.auditLog.findMany.mockResolvedValue([stored]);
      prisma.auditLog.count.mockResolvedValue(1);

      const result = endpoint === 'logs'
        ? (await controller.getLogs(req)).logs
        : endpoint === 'entity-history'
          ? await controller.getEntityHistory(req, 'Client', 'client-1')
          : await controller.getUserActivity(req, 'user-1');

      const serialized = JSON.stringify(result);
      const [row] = JSON.parse(serialized);
      expect(Object.keys(row).sort()).toEqual([
        'id', 'tenantId', 'action', 'entityType', 'entityId', 'userId',
        'userName', 'description', 'createdAt', 'safeProjection', 'hacizSafeProjection',
      ].sort());
      for (const secret of [
        'FUTURE_FIELD_CANARY', '12345678901', 'TR330006100519786457841326',
        'ada.lovelace@example.com', 'sk-live-should-not-leak',
        'raw user authored note should not be projected', 'old raw note', 'new raw note',
        'eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxIn0.signature',
      ]) expect(serialized).not.toContain(secret);
      expect(row.safeProjection.newValues.status).toBe('CLOSED');
      expect(row.safeProjection.rawValuePresence).toEqual({ metadata: true, oldValues: true, newValues: true });
      expect(row.userName).toBe(row.safeProjection.actor.displayName);
      expect(row.description).toBe(row.safeProjection.description);
      expect(JSON.stringify(stored)).toBe(original);
      expect(prisma.auditLog.findMany.mock.calls[0][0].where.tenantId).toBe('tenant-1');
    },
  );

  it('preserves raw internal entity history for the existing reversal domain reader', async () => {
    prisma.auditLog.findMany.mockResolvedValue([auditLog]);
    const [internal] = await service.getEntityHistory('tenant-1', 'Client', 'client-1');
    expect(internal.id).toBe(auditLog.id);
    expect(internal.metadata).toEqual(auditLog.metadata);
    expect(internal.oldValues).toEqual(auditLog.oldValues);
    expect(internal.createdAt.toISOString()).toBe(createdAt.toISOString());
    const [standard] = await controller.getEntityHistory(req, 'Client', 'client-1');
    expect(standard).not.toHaveProperty('metadata');
    expect(standard.safeProjection).toEqual(internal.safeProjection);
  });
});

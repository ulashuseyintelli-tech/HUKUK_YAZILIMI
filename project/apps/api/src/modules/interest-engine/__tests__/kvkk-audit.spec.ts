/**
 * Task 11.5-11.8: KVKK Compliance Tests
 */

import { RetentionService } from '../audit/retention.service';
import { MaskingService } from '../audit/masking.service';
import { AccessControlService, Role, ResourceType, AccessLevel } from '../audit/access-control.service';
import { AccessLogService } from '../audit/access-log.service';

describe('Task 11.5: Retention Policy', () => {
  let retentionService: RetentionService;

  beforeEach(() => {
    retentionService = new RetentionService();
  });

  it('should return ACTIVE for recent records', () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const status = retentionService.getRetentionStatus('CALCULATION_RECORD', createdAt, now);
    expect(status.status).toBe('ACTIVE');
  });

  it('should return ARCHIVED for old records', () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString();
    const status = retentionService.getRetentionStatus('CALCULATION_RECORD', createdAt, now);
    expect(status.status).toBe('ARCHIVED');
  });

  it('should return PENDING_DELETE for expired preview records', () => {
    const now = new Date();
    const createdAt = new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString();
    const status = retentionService.getRetentionStatus('PREVIEW_RECORD', createdAt, now);
    expect(status.status).toBe('PENDING_DELETE');
  });

  it('should identify records to archive', () => {
    const now = new Date();
    const records = [
      { id: 'r1', createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'r2', createdAt: new Date(now.getTime() - 100 * 24 * 60 * 60 * 1000).toISOString() },
    ];
    const toArchive = retentionService.getRecordsToArchive('CALCULATION_RECORD', records, now);
    expect(toArchive).toContain('r2');
    expect(toArchive).not.toContain('r1');
  });

  it('should identify records to delete', () => {
    const now = new Date();
    const records = [
      { id: 'r1', createdAt: new Date(now.getTime() - 10 * 24 * 60 * 60 * 1000).toISOString() },
      { id: 'r2', createdAt: new Date(now.getTime() - 40 * 24 * 60 * 60 * 1000).toISOString() },
    ];
    const toDelete = retentionService.getRecordsToDelete('PREVIEW_RECORD', records, now);
    expect(toDelete).toContain('r2');
  });
});

describe('Task 11.6: Masking Service', () => {
  let maskingService: MaskingService;

  beforeEach(() => {
    maskingService = new MaskingService();
  });

  it('should partially mask TC Kimlik', () => {
    const result = maskingService.maskTcKimlik('12345678901', 'PARTIAL');
    expect(result).toBe('123*****901');
  });

  it('should fully mask TC Kimlik', () => {
    const result = maskingService.maskTcKimlik('12345678901', 'FULL');
    expect(result).toBe('***********');
  });

  it('should not mask when level is NONE', () => {
    const result = maskingService.maskTcKimlik('12345678901', 'NONE');
    expect(result).toBe('12345678901');
  });

  it('should partially mask name', () => {
    const result = maskingService.maskName('Ahmet Yılmaz', 'PARTIAL');
    expect(result).toBe('A**** Y*****');
  });

  it('should fully mask name', () => {
    const result = maskingService.maskName('Ahmet Yılmaz', 'FULL');
    expect(result).toBe('[ISIM GIZLI]');
  });
});

describe('Task 11.7: Access Control Service', () => {
  let accessControl: AccessControlService;

  beforeEach(() => {
    accessControl = new AccessControlService();
  });

  it('should allow ADMIN full access', () => {
    const result = accessControl.checkAccess(Role.ADMIN, ResourceType.CALCULATION_RECORD, AccessLevel.ADMIN);
    expect(result.allowed).toBe(true);
  });

  it('should deny GUEST access to calculation records', () => {
    const result = accessControl.checkAccess(Role.GUEST, ResourceType.CALCULATION_RECORD, AccessLevel.READ_MASKED);
    expect(result.allowed).toBe(false);
  });

  it('should allow LAWYER to write calculation records', () => {
    const result = accessControl.checkAccess(Role.LAWYER, ResourceType.CALCULATION_RECORD, AccessLevel.WRITE);
    expect(result.allowed).toBe(true);
  });

  it('should require masking for INTERN reading records', () => {
    const result = accessControl.canRead(Role.INTERN, ResourceType.CALCULATION_RECORD);
    expect(result.allowed).toBe(true);
    expect(result.requiresMasking).toBe(true);
  });

  it('should check read access correctly', () => {
    expect(accessControl.canRead(Role.PARALEGAL, ResourceType.CALCULATION_RECORD).allowed).toBe(true);
    expect(accessControl.canRead(Role.GUEST, ResourceType.CALCULATION_RECORD).allowed).toBe(false);
  });

  it('should check write access correctly', () => {
    expect(accessControl.canWrite(Role.LAWYER, ResourceType.CALCULATION_RECORD).allowed).toBe(true);
    expect(accessControl.canWrite(Role.INTERN, ResourceType.CALCULATION_RECORD).allowed).toBe(false);
  });

  it('should check delete access correctly', () => {
    expect(accessControl.canDelete(Role.PARTNER, ResourceType.CALCULATION_RECORD).allowed).toBe(true);
    expect(accessControl.canDelete(Role.LAWYER, ResourceType.CALCULATION_RECORD).allowed).toBe(false);
  });
});

describe('Task 11.8: Access Log Service', () => {
  let accessLog: AccessLogService;

  beforeEach(() => {
    accessLog = new AccessLogService();
    accessLog.clearAll();
  });

  it('should log access attempt', async () => {
    const id = await accessLog.logAccess({
      userId: 'user-1',
      userRole: Role.LAWYER,
      tenantId: 'tenant-1',
      action: 'READ',
      resourceType: ResourceType.CALCULATION_RECORD,
      resourceId: 'record-1',
      accessLevel: AccessLevel.READ_FULL,
      allowed: true,
    });

    expect(id).toMatch(/^AL-/);
    const log = await accessLog.getLog(id);
    expect(log).toBeDefined();
    expect(log!.userId).toBe('user-1');
  });

  it('should generate checksum for integrity', async () => {
    const id = await accessLog.logAccess({
      userId: 'user-1',
      userRole: Role.LAWYER,
      tenantId: 'tenant-1',
      action: 'READ',
      resourceType: ResourceType.CALCULATION_RECORD,
      resourceId: 'record-1',
      accessLevel: AccessLevel.READ_FULL,
      allowed: true,
    });

    const log = await accessLog.getLog(id);
    expect(log!.checksum).toMatch(/^CHK-/);
  });

  it('should filter logs by userId', async () => {
    await accessLog.logAccess({
      userId: 'user-1',
      userRole: Role.LAWYER,
      tenantId: 'tenant-1',
      action: 'READ',
      resourceType: ResourceType.CALCULATION_RECORD,
      resourceId: 'record-1',
      accessLevel: AccessLevel.READ_FULL,
      allowed: true,
    });
    await accessLog.logAccess({
      userId: 'user-2',
      userRole: Role.INTERN,
      tenantId: 'tenant-1',
      action: 'READ',
      resourceType: ResourceType.CALCULATION_RECORD,
      resourceId: 'record-2',
      accessLevel: AccessLevel.READ_MASKED,
      allowed: false,
    });

    const logs = await accessLog.queryLogs({ userId: 'user-1' });
    expect(logs).toHaveLength(1);
    expect(logs[0].userId).toBe('user-1');
  });

  it('should return denied attempts', async () => {
    await accessLog.logAccess({
      userId: 'user-1',
      userRole: Role.LAWYER,
      tenantId: 'tenant-1',
      action: 'READ',
      resourceType: ResourceType.CALCULATION_RECORD,
      resourceId: 'record-1',
      accessLevel: AccessLevel.READ_FULL,
      allowed: true,
    });
    await accessLog.logAccess({
      userId: 'user-2',
      userRole: Role.GUEST,
      tenantId: 'tenant-1',
      action: 'READ',
      resourceType: ResourceType.CALCULATION_RECORD,
      resourceId: 'record-1',
      accessLevel: AccessLevel.READ_FULL,
      allowed: false,
    });

    const denied = await accessLog.getDeniedAttempts('tenant-1');
    expect(denied).toHaveLength(1);
    expect(denied[0].userRole).toBe(Role.GUEST);
  });

  it('should verify log integrity', async () => {
    const id = await accessLog.logAccess({
      userId: 'user-1',
      userRole: Role.LAWYER,
      tenantId: 'tenant-1',
      action: 'READ',
      resourceType: ResourceType.CALCULATION_RECORD,
      resourceId: 'record-1',
      accessLevel: AccessLevel.READ_FULL,
      allowed: true,
    });

    const log = await accessLog.getLog(id);
    expect(accessLog.verifyIntegrity(log!)).toBe(true);
  });

  it('should return access statistics', async () => {
    await accessLog.logAccess({
      userId: 'user-1',
      userRole: Role.LAWYER,
      tenantId: 'tenant-1',
      action: 'READ',
      resourceType: ResourceType.CALCULATION_RECORD,
      resourceId: 'record-1',
      accessLevel: AccessLevel.READ_FULL,
      allowed: true,
    });

    const stats = await accessLog.getStatistics('tenant-1');
    expect(stats.totalLogs).toBe(1);
    expect(stats.allowedCount).toBe(1);
  });
});

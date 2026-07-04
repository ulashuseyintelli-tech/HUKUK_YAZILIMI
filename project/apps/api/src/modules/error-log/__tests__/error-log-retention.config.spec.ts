import { readErrorLogRetentionConfig, UNRESOLVED_FLOOR_DAYS } from '../retention/error-log-retention.config';

describe('readErrorLogRetentionConfig (PR-6)', () => {
  it('default: enabled=false (env boş)', () => {
    const c = readErrorLogRetentionConfig({});
    expect(c.enabled).toBe(false);
  });

  it('prod default günler + batchSize (yalnız enabled set)', () => {
    const c = readErrorLogRetentionConfig({ ERROR_LOG_RETENTION_ENABLED: 'true' });
    expect(c.enabled).toBe(true);
    expect(c.resolvedDays).toBe(90);
    expect(c.frontendDays).toBe(30);
    expect(c.apiInternalDays).toBe(90);
    expect(c.unresolvedDays).toBe(180);
    expect(c.batchSize).toBe(1000);
  });

  it('env override parse edilir', () => {
    const c = readErrorLogRetentionConfig({
      ERROR_LOG_RETENTION_ENABLED: 'true',
      ERROR_LOG_RETENTION_RESOLVED_DAYS: '10',
      ERROR_LOG_RETENTION_FRONTEND_DAYS: '5',
      ERROR_LOG_RETENTION_API_INTERNAL_DAYS: '20',
      ERROR_LOG_RETENTION_UNRESOLVED_DAYS: '40',
      ERROR_LOG_RETENTION_BATCH_SIZE: '250',
    });
    expect(c.resolvedDays).toBe(10);
    expect(c.frontendDays).toBe(5);
    expect(c.apiInternalDays).toBe(20);
    expect(c.unresolvedDays).toBe(40);
    expect(c.batchSize).toBe(250);
  });

  it('invalid değerler default\'a döner (abc / -5 / 0 / ondalık)', () => {
    const c = readErrorLogRetentionConfig({
      ERROR_LOG_RETENTION_ENABLED: 'true',
      ERROR_LOG_RETENTION_RESOLVED_DAYS: 'abc',
      ERROR_LOG_RETENTION_FRONTEND_DAYS: '-5',
      ERROR_LOG_RETENTION_API_INTERNAL_DAYS: '0',
      ERROR_LOG_RETENTION_BATCH_SIZE: '1.5',
    });
    expect(c.resolvedDays).toBe(90);
    expect(c.frontendDays).toBe(30);
    expect(c.apiInternalDays).toBe(90);
    expect(c.batchSize).toBe(1000);
  });

  it('K4 unresolved floor 7: env=1 → effective 7', () => {
    const c = readErrorLogRetentionConfig({
      ERROR_LOG_RETENTION_ENABLED: 'true',
      ERROR_LOG_RETENTION_UNRESOLVED_DAYS: '1',
    });
    expect(c.unresolvedDays).toBe(UNRESOLVED_FLOOR_DAYS);
    expect(c.unresolvedDays).toBe(7);
  });

  it('K4 floor: env=3 → 7; env=180 → 180; invalid → default 180 (≥7)', () => {
    expect(readErrorLogRetentionConfig({ ERROR_LOG_RETENTION_UNRESOLVED_DAYS: '3' }).unresolvedDays).toBe(7);
    expect(readErrorLogRetentionConfig({ ERROR_LOG_RETENTION_UNRESOLVED_DAYS: '180' }).unresolvedDays).toBe(180);
    expect(readErrorLogRetentionConfig({ ERROR_LOG_RETENTION_UNRESOLVED_DAYS: 'xyz' }).unresolvedDays).toBe(180);
  });

  it('enabled parse strict: "true"/"TRUE" → true; "false"/"1"/undefined → false', () => {
    expect(readErrorLogRetentionConfig({ ERROR_LOG_RETENTION_ENABLED: 'true' }).enabled).toBe(true);
    expect(readErrorLogRetentionConfig({ ERROR_LOG_RETENTION_ENABLED: 'TRUE' }).enabled).toBe(true);
    expect(readErrorLogRetentionConfig({ ERROR_LOG_RETENTION_ENABLED: '  true  ' }).enabled).toBe(true);
    expect(readErrorLogRetentionConfig({ ERROR_LOG_RETENTION_ENABLED: 'false' }).enabled).toBe(false);
    expect(readErrorLogRetentionConfig({ ERROR_LOG_RETENTION_ENABLED: '1' }).enabled).toBe(false);
    expect(readErrorLogRetentionConfig({}).enabled).toBe(false);
  });
});

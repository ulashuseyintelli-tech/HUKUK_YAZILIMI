import * as fs from 'node:fs';
import * as path from 'node:path';
import {
  createAdr014LocalSessionDryValidationOrchestrator,
} from '../adr014-local-session-orchestrator-dry-validation';

const SOURCE = path.resolve(__dirname, '../adr014-local-session-orchestrator-dry-validation.ts');

describe('ADR014 PE-06D security and authority boundary', () => {
  it('has no runtime bootstrap, persistence, egress, production data, or financial dependency', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');
    const forbidden = [
      '@nestjs/', '@prisma/', 'node:http', 'node:https', 'node:net', 'node:tls',
      'NestFactory', 'AuditLog', 'AuditService', 'prom-client', 'axios', 'fetch(',
      'process.env', 'process.argv', 'require.main', 'function main', 'setTimeout',
      'setInterval', 'node:fs', 'node:path', 'database', 'filesystem', 'network',
      'tenantId', 'caseId', 'debtorId', 'creditorId', 'clientId', 'personId',
      'principal', 'interest', 'fee', 'amount', 'currency', 'rawError', 'stack', 'metadata',
    ];
    for (const token of forbidden) expect(source).not.toContain(token);
  });

  it('returns no projections in default-disabled mode for hostile payloads', () => {
    const result = createAdr014LocalSessionDryValidationOrchestrator().validate({
      tenantId: 'tenant-secret',
      caseId: 'case-secret',
      amount: 999,
      rawError: new Error('secret'),
    });
    expect(result).toEqual({ contractVersion: '1', status: 'DISABLED', projections: [] });
    expect(JSON.stringify(result)).not.toMatch(/tenant|case|999|secret/i);
  });

  it('fails closed instead of ignoring an unexpected business field in test-only mode', () => {
    const result = createAdr014LocalSessionDryValidationOrchestrator({ mode: 'TEST_ONLY' })
      .validate({ tenantId: 'must-not-be-accepted' });
    expect(result).toEqual({
      contractVersion: '1', status: 'BLOCKED',
      blockerCodes: ['INVALID_DRY_VALIDATION_REQUEST'], projections: [],
    });
    expect(JSON.stringify(result)).not.toContain('must-not-be-accepted');
  });

  it('does not export runtime authority or evidence acceptance vocabulary', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');
    expect(source).not.toMatch(/PR-11|CUTOVER_READY|EVIDENCE_ACCEPTED|PRODUCTION_ENABLED/);
    expect(source).toContain("'DRY_VALIDATED'");
    expect(source).toContain("'DISABLED'");
  });
});

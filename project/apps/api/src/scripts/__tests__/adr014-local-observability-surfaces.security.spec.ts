import * as fs from 'node:fs';
import * as path from 'node:path';
import { createAdr014LocalObservabilityPreparation } from '../adr014-local-observability-surfaces';

const SOURCE = path.resolve(__dirname, '../adr014-local-observability-surfaces.ts');

describe('ADR014 PE-06E security and authority boundary', () => {
  it('has no runtime bootstrap, persistence, external egress, or production telemetry dependency', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');
    const forbidden = [
      '@nestjs/', '@prisma/', 'node:fs', 'node:path', 'node:http', 'node:https', 'node:net',
      'node:tls', 'NestFactory', 'AuditLog', 'AuditService', 'prom-client', 'axios', 'fetch(',
      'process.env', 'process.argv', 'require.main', 'function main', 'setTimeout', 'setInterval',
      'console.', 'tenantId', 'caseId', 'debtorId', 'creditorId', 'clientId', 'personId',
      'principal', 'interest', 'fee', 'amount', 'currency', 'rawError', 'stack', 'metadata',
    ];
    for (const token of forbidden) expect(source).not.toContain(token);
    expect(source).toContain("import { createHash } from 'node:crypto'");
  });

  it('does not inspect or echo hostile payloads while disabled', () => {
    const hostile = Object.defineProperty({}, 'tenantId', {
      get: () => { throw new Error('secret'); },
    });
    const preparation = createAdr014LocalObservabilityPreparation();
    expect(preparation.appendAudit(hostile)).toEqual({ status: 'DISABLED' });
    expect(preparation.sealEvidence(hostile)).toEqual({ status: 'DISABLED' });
    expect(JSON.stringify(preparation.describeMonitoring())).not.toMatch(/secret|tenant/i);
  });

  it('fails closed without returning arbitrary input or business identifiers', () => {
    const result = createAdr014LocalObservabilityPreparation({ mode: 'TEST_ONLY' }).appendAudit({
      chain: [], entry: { tenantId: 'tenant-secret', amount: 999, rawError: 'secret' },
    });
    expect(result).toEqual({
      status: 'BLOCKED', blockerCode: 'INVALID_AUDIT_APPEND_REQUEST',
    });
    expect(JSON.stringify(result)).not.toMatch(/tenant-secret|999|secret/);
  });

  it('does not export evidence acceptance, cutover, or production authority vocabulary', () => {
    const source = fs.readFileSync(SOURCE, 'utf8');
    expect(source).not.toMatch(/EVIDENCE_ACCEPTED|CUTOVER_READY|PR-11|PRODUCTION_ENABLED/);
    expect(source).toContain("authority: 'NONE'");
    expect(source).toContain("official: false");
    expect(source).toContain("runtimeEmission: 'NONE'");
  });
});

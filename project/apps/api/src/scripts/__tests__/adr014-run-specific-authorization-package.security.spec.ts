import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  completeAdr014RunSpecificAuthorizationPackage,
  type Adr014RunSpecificAuthorizationPackageRequest,
} from '../adr014-run-specific-authorization-package';

const source = readFileSync(
  join(__dirname, '..', 'adr014-run-specific-authorization-package.ts'),
  'utf8',
);

describe('ADR014-REP-01A security and non-activation boundary', () => {
  it('has no runtime, persistence, network, database or process activation surface', () => {
    expect(source).not.toMatch(/@nestjs\/|@prisma\/|node:(?:fs|http|https|net|tls|dgram)/);
    expect(source).not.toMatch(/NestFactory|PrismaClient|fetch\(|axios|process\.(?:env|argv)/);
    expect(source).not.toMatch(/function\s+main|require\.main|setTimeout|setInterval/);
    expect(source).not.toMatch(/AuditLog|AuditService|prom-client/);
  });

  it('does not define business identifiers, monetary payloads or raw error fields', () => {
    expect(source).not.toMatch(/tenantId|caseId|debtorId|creditorId|clientId|personId/);
    expect(source).not.toMatch(/\bamount\b|rawError|stack|arbitraryMetadata/);
  });

  it('never converts malformed input into evidence, PR-11 readiness or cutover authority', () => {
    const result = completeAdr014RunSpecificAuthorizationPackage(
      { contractVersion: '1' } as unknown as Adr014RunSpecificAuthorizationPackageRequest,
      { currentCanonicalSha: 'b'.repeat(40) },
    );
    expect(result.status).toBe('BLOCKED');
    expect(JSON.stringify(result)).not.toContain('representativeEvidenceProduced":true');
    expect(JSON.stringify(result)).not.toContain('pr11Ready":true');
    expect(JSON.stringify(result)).not.toContain('runtimeCutoverAuthorized":true');
  });
});

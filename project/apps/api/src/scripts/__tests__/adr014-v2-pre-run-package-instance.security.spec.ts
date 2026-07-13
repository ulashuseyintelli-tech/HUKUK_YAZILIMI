import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { materializeAdr014FirstV2PreRunPackageInstance } from '../adr014-v2-pre-run-package-instance';

const source = readFileSync(
  join(__dirname, '..', 'adr014-v2-pre-run-package-instance.ts'),
  'utf8',
);

describe('ADR014-REP-01A-R2-I1 security and authority boundary', () => {
  it('has no execution, database, filesystem, network or process surface', () => {
    expect(source).not.toMatch(/@nestjs\/|@prisma\/|node:(?:fs|http|https|net|tls|dgram)/);
    expect(source).not.toMatch(/NestFactory|PrismaClient|fetch\(|axios|process\.(?:env|argv)/);
    expect(source).not.toMatch(/function\s+main|require\.main|setTimeout|setInterval/);
  });

  it('contains no raw identity, business identifier, credential or monetary payload', () => {
    expect(source).not.toMatch(/Ulaş|Telli|tenantId|caseId|debtorId|creditorId|clientId|personId/);
    expect(source).not.toMatch(/password|secret|connectionString|databaseUrl|\bamount\b/);
  });

  it('does not fabricate runtime facts or promote evidence/cutover authority', () => {
    expect(source).not.toMatch(/approvedManifest\s*:|sessionReference\s*:|actualAccessWindow\s*:/);
    expect(source).not.toMatch(/actualExecutionWindow\s*:|populationCount\s*:|requestCount\s*:/);
    const result = materializeAdr014FirstV2PreRunPackageInstance('b'.repeat(40));
    const serialized = JSON.stringify(result);
    expect(serialized).toContain('RUNTIME_BINDING_REQUIRED');
    expect(serialized).not.toContain('representativeEvidenceAccepted":true');
    expect(serialized).not.toContain('rep02Authorized":true');
    expect(serialized).not.toContain('pr11Ready":true');
    expect(serialized).not.toContain('runtimeCutoverAuthorized":true');
  });
});

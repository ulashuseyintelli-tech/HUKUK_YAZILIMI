import { readFileSync } from 'node:fs';
import { join } from 'node:path';

const API_ROOT = join(__dirname, '../../../..');
const REPO_ROOT = join(API_ROOT, '../../..');

function readApi(path: string): string {
  return readFileSync(join(API_ROOT, path), 'utf8');
}

describe('RCV-COL-IDEM-01 architecture guard', () => {
  const service = readApi('src/modules/collection/collection.service.ts');
  const semantic = readApi(
    'src/modules/collection/collection-semantic-command.ts',
  );
  const bank = readApi('src/modules/bank/bank.service.ts');
  const schema = readApi('prisma/schema.prisma');
  const migration = readApi(
    'prisma/migrations/20260731120000_rcv_col_full_semantic_command_idempotency/migration.sql',
  );

  it('all Collection create replay gates use persisted full semantic evidence', () => {
    expect(service).toContain('buildCollectionSemanticCommandEvidence({');
    expect(service.match(/assertCollectionSemanticReplay\(/g)).toHaveLength(3);
    expect(service).not.toContain('assertSameCollectionPayload');
    expect(service).not.toContain('IDEMPOTENCY_KEY_CONFLICT');

    const hashIndex = service.indexOf(
      'const semanticEvidence = buildCollectionSemanticCommandEvidence',
    );
    const preExistingIndex = service.indexOf('const preExisting =');
    const createIndex = service.indexOf(
      'const collection = await (tx as any).collection.create',
    );
    expect(hashIndex).toBeGreaterThan(0);
    expect(hashIndex).toBeLessThan(preExistingIndex);
    expect(preExistingIndex).toBeLessThan(createIndex);
  });

  it('tenant-scoped lookup and bank successful replay both traverse the semantic gate', () => {
    expect(service).toContain(
      'where: { tenantId_idempotencyKey: { tenantId, idempotencyKey } }',
    );
    expect(bank).toContain(
      'replay artık key-only/pointer-only değildir',
    );
    expect(bank).toMatch(
      /if \(transaction\.isMatched\)[\s\S]*collectionService\.create\(/,
    );
    expect(bank).not.toMatch(
      /if \(transaction\.isMatched\)[\s\S]{0,800}collectionService\.findById\(/,
    );
  });

  it('canonical helper has domain separation, Decimal money and no raw JSON.stringify hashing', () => {
    expect(semantic).toContain(
      "export const COLLECTION_COMMAND_FINGERPRINT_VERSION = 'RCV-COL-CMD/v1'",
    );
    expect(semantic).toContain("new Prisma.Decimal(value)");
    expect(semantic).toContain(".update('\\0', 'utf8')");
    expect(semantic).not.toMatch(
      /createHash\([^)]*\)[\s\S]{0,250}\.update\(JSON\.stringify/,
    );
    expect(semantic).not.toMatch(/Number\(.*amount.*\).*commandFingerprint/s);
  });

  it('schema/migration remain additive, nullable-first, no-backfill and immutable', () => {
    for (const field of [
      'commandFingerprintVersion String?',
      'commandFingerprint        String?',
      'commandCanonicalPayload   String? @db.Text',
    ]) {
      expect(schema).toContain(field);
    }
    expect(migration).toContain(
      'CONSTRAINT "ck_collection_command_evidence_complete"',
    );
    expect(migration).toContain(
      'TRIGGER "trg_collection_command_evidence_immutable"',
    );
    expect(migration).not.toMatch(
      /\bUPDATE\s+"Collection"\b|\bDELETE\b|\bTRUNCATE\b|\bDROP\s+(TABLE|COLUMN)\b/i,
    );
  });

  it('new pure and DB-gated evidence suites are both wired into required CI manifests', () => {
    const pureManifest = readFileSync(
      join(API_ROOT, 'ci-manifests/pure/claim-collection-finance.txt'),
      'utf8',
    );
    const dbManifest = readFileSync(
      join(API_ROOT, 'ci-manifests/db/domain-integration.txt'),
      'utf8',
    );
    expect(pureManifest).toContain(
      'src/modules/collection/__tests__/collection-semantic-command.spec.ts',
    );
    expect(pureManifest).toContain(
      'src/modules/collection/__tests__/collection-semantic-idempotency.static.spec.ts',
    );
    expect(dbManifest).toContain(
      'src/modules/collection/__tests__/collection-semantic-idempotency.db-gated.integration.spec.ts',
    );

    const workflow = readFileSync(
      join(REPO_ROOT, '.github/workflows/ci.yml'),
      'utf8',
    );
    expect(workflow).toContain(
      'bash apps/api/scripts/run-ci-manifest.sh pure/claim-collection-finance',
    );
    expect(workflow).toContain(
      'bash apps/api/scripts/run-ci-manifest.sh db/domain-integration',
    );
  });
});

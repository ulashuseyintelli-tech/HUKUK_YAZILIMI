import * as fs from 'node:fs';
import * as path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../../../..');
const SCHEMA = fs.readFileSync(path.join(API_ROOT, 'prisma/schema.prisma'), 'utf8');
const MIGRATION = fs.readFileSync(
  path.join(
    API_ROOT,
    'prisma/migrations/20260723100000_claim_formation_intent_snapshot_foundation/migration.sql',
  ),
  'utf8',
);

function modelBlock(name: string): string {
  const match = SCHEMA.match(new RegExp(String.raw`\nmodel ${name} \{[\s\S]*?\n\}`, 'm'));
  if (!match) throw new Error(`Missing Prisma model: ${name}`);
  return match[0];
}

function productionTypeScriptFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === '__tests__' || entry.name === 'test' || entry.name === 'node_modules') return [];
      return productionTypeScriptFiles(full);
    }
    return entry.isFile() && entry.name.endsWith('.ts') && !entry.name.endsWith('.spec.ts') ? [full] : [];
  });
}

describe('RCV-CLAIM-FORM-P02-S08-I02A persistence foundation — static contract', () => {
  it('defines the two writer-disabled persistence models with every required field group', () => {
    const intent = modelBlock('ClaimItemFormationIntent');
    const snapshot = modelBlock('ClaimFormationSnapshot');

    for (const field of [
      'id', 'tenantId', 'caseId', 'contractVersion', 'createdAt', 'expiresAt',
      'idempotencyKey', 'normalizedInputChecksum', 'normalizedInputContractVersion',
      'intentChecksum', 'checksumAlgorithm', 'canonicalSerializationVersion',
      'approvalRequestId', 'approvalReferenceVersion', 'approvalReferenceHash', 'requesterUserId',
      'correlationId', 'causationId', 'sourceIdentityVersion', 'sourceType', 'sourceId',
      'sourceSlot', 'sourceIdentityHash', 'sourceVersionId', 'sourceVersion',
      'canonicalSourceFingerprint', 'fingerprintAlgorithm', 'fingerprintVersion',
      'sourceResolutionContractVersion', 'sourceResolutionHash', 'componentCategory',
      'componentSubtypeCode', 'componentSubtypeVersion', 'componentSubtypeChecksum',
      'legalBasisCode', 'legalBasisVersion', 'legalBasisChecksum', 'legalBasisRegistryReleaseId',
      'legalBasisRegistryReleaseChecksum', 'legalBasisResolutionContractVersion',
      'legalBasisResolutionHash', 'originalAmountMinor', 'demandedAmountMinor', 'currency',
      'minorUnit', 'effectiveAt', 'liabilityContextVersion',
      'liabilityContextCanonicalPayload', 'liabilityContextHash', 'interestEligibility',
      'interestPolicyRef', 'interestPolicyVersion', 'ruleRef', 'ruleVersion',
      'evidenceRefsContractVersion', 'evidenceRefsCanonicalPayload', 'evidenceRefsHash',
      'provenanceContractVersion', 'provenanceCanonicalPayload', 'provenanceHash',
    ]) {
      expect(intent).toMatch(new RegExp(`\\n\\s+${field}\\s+`));
    }

    for (const field of [
      'id', 'tenantId', 'caseId', 'claimItemId', 'formationIntentId', 'approvalRequestId',
      'snapshotContractVersion', 'snapshotSerializationVersion', 'snapshotVersion',
      'supersedesSnapshotId', 'intentChecksum', 'approvalReferenceHash',
      'normalizedInputChecksum', 'snapshotCanonicalPayload', 'snapshotHash',
      'sourceIdentityHash', 'sourceVersionId', 'canonicalSourceFingerprint',
      'componentCategory', 'componentSubtypeCode', 'componentSubtypeVersion',
      'componentSubtypeChecksum', 'legalBasisCode', 'legalBasisVersion', 'legalBasisChecksum',
      'legalBasisRegistryReleaseId', 'legalBasisRegistryReleaseChecksum',
      'originalAmountMinor', 'demandedAmountMinor', 'currency', 'minorUnit', 'effectiveAt',
      'liabilityContextCanonicalPayload', 'interestEligibility', 'admissionResult',
      'claimItemPayloadHash', 'requesterUserId', 'approverUserId', 'approvalDecidedAt',
      'commandId', 'correlationId', 'causationId', 'formationAt', 'createdAt',
    ]) {
      expect(snapshot).toMatch(new RegExp(`\\n\\s+${field}\\s+`));
    }

    expect(intent).toMatch(/originalAmountMinor\s+BigInt/);
    expect(intent).toMatch(/demandedAmountMinor\s+BigInt/);
    expect(snapshot).toMatch(/originalAmountMinor\s+BigInt/);
    expect(snapshot).toMatch(/demandedAmountMinor\s+BigInt/);
  });

  it('uses tenant-aware parent keys and one-time intent/approval consumption', () => {
    const user = modelBlock('User');
    const claimItem = modelBlock('ClaimItem');
    const intent = modelBlock('ClaimItemFormationIntent');
    const snapshot = modelBlock('ClaimFormationSnapshot');

    expect(user).toContain('@@unique([tenantId, id])');
    expect(claimItem).toContain('@@unique([tenantId, caseId, id])');
    expect(intent).toContain('references: [tenantId, id]');
    expect(intent).toContain('ClaimItemFormationIntentRequester');
    expect(intent).toContain('@@unique([tenantId, idempotencyKey])');
    expect(intent).toContain('@@unique([tenantId, approvalRequestId])');
    expect(snapshot).toContain('references: [tenantId, caseId, id]');
    expect(snapshot).toContain('ClaimFormationSnapshotRequester');
    expect(snapshot).toContain('ClaimFormationSnapshotApprover');
    expect(snapshot).toContain('@@unique([tenantId, caseId, formationIntentId])');
    expect(snapshot).toContain('@@unique([tenantId, approvalRequestId])');
  });

  it('migration enforces exact checks, immutable records and stable source binding', () => {
    for (const required of [
      'claim_formation_intent_expiry_check',
      'claim_formation_intent_money_check',
      'claim_formation_intent_hash_check',
      'claim_formation_intent_nonblank_check',
      'claim_formation_snapshot_version_check',
      'claim_formation_snapshot_admission_check',
      'claim_formation_snapshot_hash_check',
      'validate_claim_formation_snapshot_before_insert',
      'claim_formation_source_identity_binding_conflict',
      'claim_formation_claim_item_source_binding_conflict',
      'prevent_claim_item_formation_intent_update',
      'prevent_claim_item_formation_intent_delete',
      'prevent_claim_formation_snapshot_update',
      'prevent_claim_formation_snapshot_delete',
    ]) {
      expect(MIGRATION).toContain(required);
    }

    expect(MIGRATION).toContain('pg_advisory_xact_lock');
    expect(MIGRATION).toContain('raise_immutable_error()');
    expect(MIGRATION).not.toMatch(/ALTER TABLE "OfficeApprovalRequest"/);
    expect(MIGRATION).not.toMatch(/UPDATE\s+"(?:ClaimItem|OfficeApprovalRequest)"/);
    expect(MIGRATION).not.toMatch(/DELETE\s+FROM\s+"(?:ClaimItem|OfficeApprovalRequest)"/);
  });

  it('allows only the owner-gated dormant intent adapter/finalizer and no production call-site', () => {
    const offenders = productionTypeScriptFiles(path.join(API_ROOT, 'src'))
      .filter((file) => /claimItemFormationIntent|claimFormationSnapshot/.test(fs.readFileSync(file, 'utf8')))
      .map((file) => path.relative(API_ROOT, file))
      .sort();

    expect(offenders).toEqual([
      path.normalize(
        'src/modules/claim-item/formation-finalizer/transactional-claim-item-formation-finalizer.service.ts',
      ),
      path.normalize(
        'src/modules/claim-item/formation-intent/claim-item-formation-office-approval.adapter.ts',
      ),
    ]);

    const finalizer = fs.readFileSync(path.join(API_ROOT, offenders[0]), 'utf8');
    const adapter = fs.readFileSync(path.join(API_ROOT, offenders[1]), 'utf8');
    expect(adapter).toContain('claimItemFormationIntent.create');
    expect(adapter).not.toContain('claimFormationSnapshot.create');
    expect(finalizer).toContain('claimFormationSnapshot.create');
    expect(finalizer).toContain('claimItem.create');

    const moduleSource = fs.readFileSync(
      path.join(API_ROOT, 'src/modules/claim-item/claim-item.module.ts'),
      'utf8',
    );
    const serviceSource = fs.readFileSync(
      path.join(API_ROOT, 'src/modules/claim-item/claim-item.service.ts'),
      'utf8',
    );
    expect(moduleSource).not.toContain('formation-intent');
    expect(serviceSource).not.toContain('HumanClaimItemFormationAdmissionService');
  });
});

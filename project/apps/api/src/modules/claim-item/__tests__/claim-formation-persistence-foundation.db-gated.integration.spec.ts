import { createHash, randomUUID } from 'node:crypto';
import { PrismaClient } from '@prisma/client';
import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';

const TEST_DB_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DB_URL) {
  throw new Error('RCV-CLAIM-FORM-P02-S08-I02A DB gate blocked: CI requires an approved TEST_DATABASE_URL.');
}
const describeWithDisposableDb = TEST_DB_URL ? describe : describe.skip;

type SqlValue = string | number | bigint | Date | null;
type SqlRow = Record<string, SqlValue>;

describeWithDisposableDb('RCV-CLAIM-FORM-P02-S08-I02A — disposable PostgreSQL constraints', () => {
  jest.setTimeout(60_000);

  const prisma = new PrismaClient({ datasources: { db: { url: TEST_DB_URL } } });
  let tenantA: string;
  let tenantB: string;
  let caseA: string;
  let caseB: string;
  let requesterUserA: string;
  let approverUserA: string;
  let requesterUserB: string;
  let claimItemB: string;

  const hash = (value: string) => createHash('sha256').update(value).digest('hex');

  function sqlLiteral(value: SqlValue): string {
    if (value === null) return 'NULL';
    if (value instanceof Date) return `'${value.toISOString().replace(/'/g, "''")}'`;
    if (typeof value === 'number' || typeof value === 'bigint') return String(value);
    return `'${value.replace(/'/g, "''")}'`;
  }

  function insert(table: 'ClaimItemFormationIntent' | 'ClaimFormationSnapshot', row: SqlRow) {
    const columns = Object.keys(row).map((column) => `"${column}"`).join(', ');
    const values = Object.values(row).map(sqlLiteral).join(', ');
    return prisma.$executeRawUnsafe(`INSERT INTO "${table}" (${columns}) VALUES (${values})`);
  }

  function intentRow(label: string, overrides: Partial<SqlRow> = {}): SqlRow {
    const createdAt = new Date('2026-07-23T09:00:00.000Z');
    const sourceId = `document-${label}`;
    return {
      id: `intent-${label}-${randomUUID()}`,
      tenantId: tenantA,
      caseId: caseA,
      contractVersion: 'ClaimItemFormationIntentV1',
      createdAt,
      expiresAt: new Date(createdAt.getTime() + 24 * 60 * 60 * 1000),
      idempotencyKey: `intent-idem-${label}-${randomUUID()}`,
      normalizedInputChecksum: hash(`normalized-${label}`),
      normalizedInputContractVersion: 'ClaimFormationNormalizedInputV1',
      intentChecksum: hash(`intent-${label}`),
      checksumAlgorithm: 'SHA-256',
      canonicalSerializationVersion: 'RCV-CLAIM-FORM/v1',
      approvalRequestId: `approval-${label}-${randomUUID()}`,
      approvalReferenceVersion: 'OfficeApprovalReferenceV1',
      approvalReferenceHash: hash(`approval-${label}`),
      requesterUserId: requesterUserA,
      correlationId: `correlation-${label}`,
      causationId: null,
      sourceIdentityVersion: 'ClaimSourceIdentityV1',
      sourceType: 'CASE_DOCUMENT',
      sourceId,
      sourceSlot: 'PRIMARY_EVIDENCE',
      sourceIdentityHash: hash(`CASE_DOCUMENT:${sourceId}:PRIMARY_EVIDENCE`),
      sourceVersionId: `document-version-${label}`,
      sourceVersion: '1',
      canonicalSourceFingerprint: hash(`document-bytes-${label}-v1`),
      fingerprintAlgorithm: 'SHA-256',
      fingerprintVersion: 'DocumentFingerprintV1',
      sourceResolutionContractVersion: 'DocumentSourceResolutionV1',
      sourceResolutionHash: hash(`source-resolution-${label}`),
      componentCategory: 'PRINCIPAL',
      componentSubtypeCode: 'CONTRACT_PRINCIPAL',
      componentSubtypeVersion: '1',
      componentSubtypeChecksum: hash('CONTRACT_PRINCIPAL:1'),
      legalBasisCode: 'CONTRACTUAL_RECEIVABLE',
      legalBasisVersion: '1',
      legalBasisChecksum: hash('CONTRACTUAL_RECEIVABLE:1'),
      legalBasisRegistryReleaseId: 'rcv-legal-basis-2026-07',
      legalBasisRegistryReleaseChecksum: hash('rcv-legal-basis-2026-07'),
      legalBasisResolutionContractVersion: 'LegalBasisResolutionV1',
      legalBasisResolutionHash: hash(`legal-basis-resolution-${label}`),
      originalAmountMinor: 10_000n,
      demandedAmountMinor: 8_000n,
      currency: 'TRY',
      minorUnit: 2,
      effectiveAt: new Date('2026-07-01T00:00:00.000Z'),
      liabilityContextVersion: 'LiabilityContextV1',
      liabilityContextCanonicalPayload: '{"liableDebtors":["opaque-debtor-1"]}',
      liabilityContextHash: hash('liability-context-v1'),
      interestEligibility: 'NO_INTEREST',
      interestPolicyRef: null,
      interestPolicyVersion: null,
      ruleRef: null,
      ruleVersion: null,
      evidenceRefsContractVersion: 'EvidenceRefsV1',
      evidenceRefsCanonicalPayload: '{"refs":["opaque-evidence-1"]}',
      evidenceRefsHash: hash('evidence-refs-v1'),
      provenanceContractVersion: 'ClaimProvenanceV1',
      provenanceCanonicalPayload: '{"authority":"HUMAN"}',
      provenanceHash: hash('provenance-v1'),
      ...overrides,
    };
  }

  function snapshotRow(
    label: string,
    intent: SqlRow,
    claimItemId: string,
    overrides: Partial<SqlRow> = {},
  ): SqlRow {
    return {
      id: `snapshot-${label}-${randomUUID()}`,
      tenantId: intent.tenantId,
      caseId: intent.caseId,
      claimItemId,
      formationIntentId: intent.id,
      approvalRequestId: intent.approvalRequestId,
      snapshotContractVersion: 'ClaimFormationSnapshotV1',
      snapshotSerializationVersion: 'RCV-CLAIM-SNAPSHOT/v1',
      snapshotVersion: 1,
      supersedesSnapshotId: null,
      intentChecksum: intent.intentChecksum,
      approvalReferenceHash: intent.approvalReferenceHash,
      normalizedInputChecksum: intent.normalizedInputChecksum,
      snapshotCanonicalPayload: `{"opaqueSnapshot":"${label}"}`,
      snapshotHash: hash(`snapshot-${label}`),
      sourceIdentityVersion: intent.sourceIdentityVersion,
      sourceType: intent.sourceType,
      sourceId: intent.sourceId,
      sourceSlot: intent.sourceSlot,
      sourceIdentityHash: intent.sourceIdentityHash,
      sourceVersionId: intent.sourceVersionId,
      sourceVersion: intent.sourceVersion,
      canonicalSourceFingerprint: intent.canonicalSourceFingerprint,
      fingerprintAlgorithm: intent.fingerprintAlgorithm,
      fingerprintVersion: intent.fingerprintVersion,
      sourceResolutionContractVersion: intent.sourceResolutionContractVersion,
      sourceResolutionHash: intent.sourceResolutionHash,
      componentCategory: intent.componentCategory,
      componentSubtypeCode: intent.componentSubtypeCode,
      componentSubtypeVersion: intent.componentSubtypeVersion,
      componentSubtypeChecksum: intent.componentSubtypeChecksum,
      legalBasisCode: intent.legalBasisCode,
      legalBasisVersion: intent.legalBasisVersion,
      legalBasisChecksum: intent.legalBasisChecksum,
      legalBasisRegistryReleaseId: intent.legalBasisRegistryReleaseId,
      legalBasisRegistryReleaseChecksum: intent.legalBasisRegistryReleaseChecksum,
      legalBasisResolutionContractVersion: intent.legalBasisResolutionContractVersion,
      legalBasisResolutionHash: intent.legalBasisResolutionHash,
      originalAmountMinor: intent.originalAmountMinor,
      demandedAmountMinor: intent.demandedAmountMinor,
      currency: intent.currency,
      minorUnit: intent.minorUnit,
      effectiveAt: intent.effectiveAt,
      liabilityContextVersion: intent.liabilityContextVersion,
      liabilityContextCanonicalPayload: intent.liabilityContextCanonicalPayload,
      liabilityContextHash: intent.liabilityContextHash,
      interestEligibility: intent.interestEligibility,
      interestPolicyRef: intent.interestPolicyRef,
      interestPolicyVersion: intent.interestPolicyVersion,
      ruleRef: intent.ruleRef,
      ruleVersion: intent.ruleVersion,
      evidenceRefsContractVersion: intent.evidenceRefsContractVersion,
      evidenceRefsCanonicalPayload: intent.evidenceRefsCanonicalPayload,
      evidenceRefsHash: intent.evidenceRefsHash,
      provenanceContractVersion: intent.provenanceContractVersion,
      provenanceCanonicalPayload: intent.provenanceCanonicalPayload,
      provenanceHash: intent.provenanceHash,
      admissionResult: intent.interestEligibility === 'UNRESOLVED' ? 'ALLOWED_WITH_POLICY_HOLD' : 'ALLOWED',
      claimItemPayloadHash: hash(`claim-item-payload-${label}`),
      requesterUserId: intent.requesterUserId,
      approverUserId: approverUserA,
      approvalDecidedAt: new Date('2026-07-23T10:00:00.000Z'),
      commandId: `command-${label}-${randomUUID()}`,
      correlationId: intent.correlationId,
      causationId: intent.causationId,
      formationAt: new Date('2026-07-23T10:01:00.000Z'),
      createdAt: new Date('2026-07-23T10:02:00.000Z'),
      ...overrides,
    };
  }

  async function createClaimItem(tenantId = tenantA, caseId = caseA): Promise<string> {
    return (
      await prisma.claimItem.create({
        data: {
          tenantId,
          caseId,
          itemType: 'PRINCIPAL',
          originalAmount: 100,
          demandedAmount: 80,
          amount: 80,
          currency: 'TRY',
          liableDebtorIds: [],
        },
      })
    ).id;
  }

  beforeAll(async () => {
    await prisma.$connect();
    const suffix = randomUUID().slice(0, 8);
    const ta = await prisma.tenant.create({
      data: { name: 'I02A Tenant A', slug: `i02a-a-${suffix}` },
    });
    const tb = await prisma.tenant.create({
      data: { name: 'I02A Tenant B', slug: `i02a-b-${suffix}` },
    });
    tenantA = ta.id;
    tenantB = tb.id;

    requesterUserA = (
      await prisma.user.create({
        data: {
          tenantId: tenantA,
          email: `i02a-requester-${suffix}@example.test`,
          name: 'I02A',
          surname: 'Requester',
        },
      })
    ).id;
    approverUserA = (
      await prisma.user.create({
        data: {
          tenantId: tenantA,
          email: `i02a-approver-${suffix}@example.test`,
          name: 'I02A',
          surname: 'Approver',
        },
      })
    ).id;
    requesterUserB = (
      await prisma.user.create({
        data: {
          tenantId: tenantB,
          email: `i02a-requester-b-${suffix}@example.test`,
          name: 'I02A',
          surname: 'Requester B',
        },
      })
    ).id;

    const ca = await prisma.case.create({
      data: { tenantId: tenantA, fileNumber: `I02A-A-${suffix}`, type: 'GENERAL_EXECUTION' },
    });
    const cb = await prisma.case.create({
      data: { tenantId: tenantB, fileNumber: `I02A-B-${suffix}`, type: 'GENERAL_EXECUTION' },
    });
    caseA = ca.id;
    caseB = cb.id;

    claimItemB = await createClaimItem(tenantB, caseB);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('accepts a complete intent and exact one-to-one snapshot', async () => {
    const claimItemId = await createClaimItem();
    const intent = intentRow('valid');
    await expect(insert('ClaimItemFormationIntent', intent)).resolves.toBe(1);
    await expect(insert('ClaimFormationSnapshot', snapshotRow('valid', intent, claimItemId))).resolves.toBe(1);
  });

  it('rejects cross-tenant Case bindings', async () => {
    const intent = intentRow('cross-tenant', {
      tenantId: tenantB,
      caseId: caseA,
      requesterUserId: requesterUserB,
    });
    await expect(insert('ClaimItemFormationIntent', intent)).rejects.toThrow();
  });

  it('rejects cross-tenant requester and approver bindings', async () => {
    const wrongRequester = intentRow('cross-tenant-requester', { requesterUserId: requesterUserB });
    await expect(insert('ClaimItemFormationIntent', wrongRequester)).rejects.toThrow();

    const claimItemId = await createClaimItem();
    const intent = intentRow('cross-tenant-approver');
    await insert('ClaimItemFormationIntent', intent);
    await expect(
      insert(
        'ClaimFormationSnapshot',
        snapshotRow('cross-tenant-approver', intent, claimItemId, { approverUserId: requesterUserB }),
      ),
    ).rejects.toThrow();
  });

  it('enforces tenant idempotency and approval-reference uniqueness', async () => {
    const first = intentRow('uniqueness-a');
    await insert('ClaimItemFormationIntent', first);

    const sameIdempotency = intentRow('uniqueness-b', { idempotencyKey: first.idempotencyKey });
    await expect(insert('ClaimItemFormationIntent', sameIdempotency)).rejects.toThrow();

    const sameApproval = intentRow('uniqueness-c', { approvalRequestId: first.approvalRequestId });
    await expect(insert('ClaimItemFormationIntent', sameApproval)).rejects.toThrow();
  });

  it('rejects invalid expiry, minor-unit money, hashes and blank canonical payloads', async () => {
    const badExpiry = intentRow('bad-expiry', { expiresAt: new Date('2026-07-25T09:00:00.000Z') });
    await expect(insert('ClaimItemFormationIntent', badExpiry)).rejects.toThrow();

    const badMoney = intentRow('bad-money', { demandedAmountMinor: 0n });
    await expect(insert('ClaimItemFormationIntent', badMoney)).rejects.toThrow();

    const badHash = intentRow('bad-hash', { intentChecksum: 'not-a-sha256' });
    await expect(insert('ClaimItemFormationIntent', badHash)).rejects.toThrow();

    const blankPayload = intentRow('blank-payload', { provenanceCanonicalPayload: '   ' });
    await expect(insert('ClaimItemFormationIntent', blankPayload)).rejects.toThrow();
  });

  it('rejects UPDATE and DELETE on formation intents', async () => {
    const intent = intentRow('immutable-intent');
    await insert('ClaimItemFormationIntent', intent);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "ClaimItemFormationIntent" SET "correlationId" = 'changed' WHERE "id" = '${intent.id}'`,
      ),
    ).rejects.toThrow(/immutable_violation/);
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "ClaimItemFormationIntent" WHERE "id" = '${intent.id}'`),
    ).rejects.toThrow(/immutable_violation/);
  });

  it('rejects snapshot fields that do not exactly match the consumed intent without a write', async () => {
    const claimItemId = await createClaimItem();
    const intent = intentRow('mismatch');
    await insert('ClaimItemFormationIntent', intent);
    const before = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "ClaimFormationSnapshot"',
    );
    const mismatched = snapshotRow('mismatch', intent, claimItemId, {
      legalBasisChecksum: hash('different-legal-basis'),
    });
    await expect(insert('ClaimFormationSnapshot', mismatched)).rejects.toThrow(/intent_mismatch/);
    const after = await prisma.$queryRawUnsafe<Array<{ count: bigint }>>(
      'SELECT COUNT(*)::bigint AS count FROM "ClaimFormationSnapshot"',
    );
    expect(after[0].count).toBe(before[0].count);
  });

  it('consumes each intent and approval reference only once', async () => {
    const claimItemId = await createClaimItem();
    const intent = intentRow('single-consumption');
    await insert('ClaimItemFormationIntent', intent);
    const first = snapshotRow('single-consumption-a', intent, claimItemId);
    await insert('ClaimFormationSnapshot', first);

    const duplicate = snapshotRow('single-consumption-b', intent, claimItemId, {
      snapshotVersion: 2,
      supersedesSnapshotId: first.id,
    });
    await expect(insert('ClaimFormationSnapshot', duplicate)).rejects.toThrow();
  });

  it('binds one stable source identity to exactly one ClaimItem', async () => {
    const firstClaimItemId = await createClaimItem();
    const secondClaimItemId = await createClaimItem();
    const firstIntent = intentRow('stable-source-a');
    await insert('ClaimItemFormationIntent', firstIntent);
    await insert('ClaimFormationSnapshot', snapshotRow('stable-source-a', firstIntent, firstClaimItemId));

    const secondIntent = intentRow('stable-source-b', {
      sourceIdentityVersion: firstIntent.sourceIdentityVersion,
      sourceType: firstIntent.sourceType,
      sourceId: firstIntent.sourceId,
      sourceSlot: firstIntent.sourceSlot,
      sourceIdentityHash: firstIntent.sourceIdentityHash,
    });
    await insert('ClaimItemFormationIntent', secondIntent);
    await expect(
      insert('ClaimFormationSnapshot', snapshotRow('stable-source-b', secondIntent, secondClaimItemId)),
    ).rejects.toThrow();
  });

  it('serializes concurrent stable-source binding so exactly one ClaimItem wins', async () => {
    const firstClaimItemId = await createClaimItem();
    const secondClaimItemId = await createClaimItem();
    const firstIntent = intentRow('concurrent-source-a');
    const secondIntent = intentRow('concurrent-source-b', {
      sourceIdentityVersion: firstIntent.sourceIdentityVersion,
      sourceType: firstIntent.sourceType,
      sourceId: firstIntent.sourceId,
      sourceSlot: firstIntent.sourceSlot,
      sourceIdentityHash: firstIntent.sourceIdentityHash,
    });
    await insert('ClaimItemFormationIntent', firstIntent);
    await insert('ClaimItemFormationIntent', secondIntent);

    const results = await Promise.allSettled([
      insert('ClaimFormationSnapshot', snapshotRow('concurrent-source-a', firstIntent, firstClaimItemId)),
      insert('ClaimFormationSnapshot', snapshotRow('concurrent-source-b', secondIntent, secondClaimItemId)),
    ]);

    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected')).toHaveLength(1);
    const rows = await prisma.$queryRawUnsafe<Array<{ claimItemId: string }>>(
      `SELECT "claimItemId" FROM "ClaimFormationSnapshot" WHERE "tenantId" = '${tenantA}' AND "sourceIdentityHash" = '${firstIntent.sourceIdentityHash}'`,
    );
    expect(rows).toHaveLength(1);
    expect([firstClaimItemId, secondClaimItemId]).toContain(rows[0].claimItemId);
  });

  it('prevents one ClaimItem from acquiring a second stable source identity', async () => {
    const claimItemId = await createClaimItem();
    const firstIntent = intentRow('claim-binding-a');
    await insert('ClaimItemFormationIntent', firstIntent);
    await insert('ClaimFormationSnapshot', snapshotRow('claim-binding-a', firstIntent, claimItemId));

    const secondIntent = intentRow('claim-binding-b');
    await insert('ClaimItemFormationIntent', secondIntent);
    await expect(
      insert('ClaimFormationSnapshot', snapshotRow('claim-binding-b', secondIntent, claimItemId)),
    ).rejects.toThrow();
  });

  it('permits an exact next-version supersession for the same source and ClaimItem', async () => {
    const claimItemId = await createClaimItem();
    const firstIntent = intentRow('supersession-a');
    await insert('ClaimItemFormationIntent', firstIntent);
    const first = snapshotRow('supersession-a', firstIntent, claimItemId);
    await insert('ClaimFormationSnapshot', first);

    const secondIntent = intentRow('supersession-b', {
      sourceIdentityVersion: firstIntent.sourceIdentityVersion,
      sourceType: firstIntent.sourceType,
      sourceId: firstIntent.sourceId,
      sourceSlot: firstIntent.sourceSlot,
      sourceIdentityHash: firstIntent.sourceIdentityHash,
      sourceVersionId: 'document-version-supersession-v2',
      sourceVersion: '2',
      canonicalSourceFingerprint: hash('document-bytes-supersession-v2'),
    });
    await insert('ClaimItemFormationIntent', secondIntent);
    const second = snapshotRow('supersession-b', secondIntent, claimItemId, {
      snapshotVersion: 2,
      supersedesSnapshotId: first.id,
    });
    await expect(insert('ClaimFormationSnapshot', second)).resolves.toBe(1);
  });

  it('rejects non-contiguous or cross-ClaimItem supersession', async () => {
    const firstIntent = intentRow('bad-supersession-a');
    await insert('ClaimItemFormationIntent', firstIntent);
    const first = snapshotRow('bad-supersession-a', firstIntent, claimItemB, {
      tenantId: tenantB,
      caseId: caseB,
    });
    // The intent is tenant A, therefore a cross-tenant snapshot is rejected before any supersession.
    await expect(insert('ClaimFormationSnapshot', first)).rejects.toThrow();

    const claimItemId = await createClaimItem();
    const validRootIntent = intentRow('bad-supersession-root');
    await insert('ClaimItemFormationIntent', validRootIntent);
    const validRoot = snapshotRow('bad-supersession-root', validRootIntent, claimItemId);
    await insert('ClaimFormationSnapshot', validRoot);

    const gapIntent = intentRow('bad-supersession-gap', {
      sourceIdentityVersion: validRootIntent.sourceIdentityVersion,
      sourceType: validRootIntent.sourceType,
      sourceId: validRootIntent.sourceId,
      sourceSlot: validRootIntent.sourceSlot,
      sourceIdentityHash: validRootIntent.sourceIdentityHash,
      sourceVersionId: 'document-version-gap-v3',
      sourceVersion: '3',
      canonicalSourceFingerprint: hash('document-bytes-gap-v3'),
    });
    await insert('ClaimItemFormationIntent', gapIntent);
    await expect(
      insert(
        'ClaimFormationSnapshot',
        snapshotRow('bad-supersession-gap', gapIntent, claimItemId, {
          snapshotVersion: 3,
          supersedesSnapshotId: validRoot.id,
        }),
      ),
    ).rejects.toThrow(/supersession_conflict/);
  });

  it('rejects UPDATE and DELETE on formation snapshots', async () => {
    const claimItemId = await createClaimItem();
    const intent = intentRow('immutable-snapshot');
    await insert('ClaimItemFormationIntent', intent);
    const snapshot = snapshotRow('immutable-snapshot', intent, claimItemId);
    await insert('ClaimFormationSnapshot', snapshot);
    await expect(
      prisma.$executeRawUnsafe(
        `UPDATE "ClaimFormationSnapshot" SET "commandId" = 'changed' WHERE "id" = '${snapshot.id}'`,
      ),
    ).rejects.toThrow(/immutable_violation/);
    await expect(
      prisma.$executeRawUnsafe(`DELETE FROM "ClaimFormationSnapshot" WHERE "id" = '${snapshot.id}'`),
    ).rejects.toThrow(/immutable_violation/);
  });
});

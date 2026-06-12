import { Test, TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../../../../prisma/prisma.service';
import { PrismaSnapshotRepository } from '../prisma-snapshot.repository';
import { SnapshotInput, SnapshotKind, EvidenceVerdict } from '../snapshot-repository.interface';
import { randomUUID } from 'crypto';
import { describeDb } from '../../../../../../test/describe-db';

function generateTestHash(): string {
  const chars = 'abcdef0123456789';
  let hash = '';
  for (let i = 0; i < 64; i++) {
    hash += chars[Math.floor(Math.random() * chars.length)];
  }
  return hash;
}

const createTestInput = (overrides: Partial<SnapshotInput> = {}): SnapshotInput => ({
  snapshotId: randomUUID(),
  tenantId: `tenant-${randomUUID().substring(0, 8)}`,
  incidentId: `incident-${randomUUID().substring(0, 8)}`,
  runId: randomUUID(),
  snapshotKind: 'CURRENT' as SnapshotKind,
  verdict: 'PROCEED' as EvidenceVerdict,
  driftScore: 0.05,
  calcResult: { total: 1000 },
  calcResultNorm: { total: '1000' },
  calcHash: generateTestHash(),
  isBaseline: false,
  retentionPolicy: 'STANDARD',
  ...overrides,
});

describeDb('Snapshot Idempotency Integration Tests', () => {
  let module: TestingModule;
  let repository: PrismaSnapshotRepository;
  let prisma: PrismaService;

  beforeAll(async () => {
    module = await Test.createTestingModule({
      providers: [PrismaService, PrismaSnapshotRepository],
    }).compile();
    repository = module.get<PrismaSnapshotRepository>(PrismaSnapshotRepository);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterAll(async () => {
    await module.close();
  });

  afterEach(async () => {
    await prisma.simulationSnapshot.deleteMany({
      where: { tenantId: { startsWith: 'tenant-' } },
    });
  });

  it('PK idempotency - returns existing when snapshotId exists', async () => {
    const input = createTestInput();
    const first = await repository.insert(input);
    const second = await repository.insert(input);
    expect(first.snapshotId).toBe(input.snapshotId);
    expect(second.snapshotId).toBe(input.snapshotId);
    const count = await prisma.simulationSnapshot.count({
      where: { snapshotId: input.snapshotId },
    });
    expect(count).toBe(1);
  });

  it('Content idempotency - returns existing when content matches', async () => {
    const baseInput = createTestInput();
    const firstInput = { ...baseInput, snapshotId: randomUUID() };
    const secondInput = { ...baseInput, snapshotId: randomUUID() };
    await repository.insert(firstInput);
    const second = await repository.insert(secondInput);
    expect(second.snapshotId).toBe(firstInput.snapshotId);
    const count = await prisma.simulationSnapshot.count({
      where: { tenantId: baseInput.tenantId, incidentId: baseInput.incidentId },
    });
    expect(count).toBe(1);
  });

  it('allows different hash for same tenant/incident/run', async () => {
    const baseInput = createTestInput();
    const firstInput = { ...baseInput, snapshotId: randomUUID(), calcHash: generateTestHash() };
    const secondInput = { ...baseInput, snapshotId: randomUUID(), calcHash: generateTestHash() };
    await repository.insert(firstInput);
    await repository.insert(secondInput);
    const count = await prisma.simulationSnapshot.count({
      where: { tenantId: baseInput.tenantId, incidentId: baseInput.incidentId },
    });
    expect(count).toBe(2);
  });

  it('allows same content for different tenants', async () => {
    const sharedContent = {
      incidentId: `incident-${randomUUID().substring(0, 8)}`,
      runId: randomUUID(),
      calcHash: generateTestHash(),
      calcResult: { total: 1000 },
      calcResultNorm: { total: '1000' },
    };
    const tenant1Input = createTestInput({
      ...sharedContent,
      tenantId: `tenant-${randomUUID().substring(0, 8)}`,
      snapshotId: randomUUID(),
    });
    const tenant2Input = createTestInput({
      ...sharedContent,
      tenantId: `tenant-${randomUUID().substring(0, 8)}`,
      snapshotId: randomUUID(),
    });
    const first = await repository.insert(tenant1Input);
    const second = await repository.insert(tenant2Input);
    expect(first.snapshotId).not.toBe(second.snapshotId);
  });

  it('NULL runId idempotency via COALESCE sentinel', async () => {
    const baseInput = createTestInput({ runId: undefined });
    const firstInput = { ...baseInput, snapshotId: randomUUID() };
    const secondInput = { ...baseInput, snapshotId: randomUUID() };
    const first = await repository.insert(firstInput);
    const second = await repository.insert(secondInput);
    expect(first.snapshotId).toBe(second.snapshotId);
    const count = await prisma.simulationSnapshot.count({
      where: { tenantId: baseInput.tenantId, incidentId: baseInput.incidentId, runId: null },
    });
    expect(count).toBe(1);
  });

  it('allows NULL and non-NULL runId for same content', async () => {
    const baseInput = createTestInput();
    const withRunId = { ...baseInput, snapshotId: randomUUID() };
    const withoutRunId = { ...baseInput, snapshotId: randomUUID(), runId: undefined };
    await repository.insert(withRunId);
    await repository.insert(withoutRunId);
    const count = await prisma.simulationSnapshot.count({
      where: { tenantId: baseInput.tenantId, incidentId: baseInput.incidentId },
    });
    expect(count).toBe(2);
  });

  it('concurrent inserts - single row created', async () => {
    const baseInput = createTestInput();
    const concurrentInputs = Array.from({ length: 5 }, () => ({
      ...baseInput,
      snapshotId: randomUUID(),
    }));
    const results = await Promise.all(
      concurrentInputs.map(input => repository.insert(input))
    );
    const uniqueIds = new Set(results.map(r => r.snapshotId));
    expect(uniqueIds.size).toBe(1);
    const count = await prisma.simulationSnapshot.count({
      where: { tenantId: baseInput.tenantId, incidentId: baseInput.incidentId },
    });
    expect(count).toBe(1);
  });
});

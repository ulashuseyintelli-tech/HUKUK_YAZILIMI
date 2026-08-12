import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

import { resolveTestDatabaseUrl } from '../../../../test/test-db-env';
import { ExecutionOfficeService } from '../execution-office.service';

const TEST_DATABASE_URL = resolveTestDatabaseUrl(process.env);
if (process.env.CI && !TEST_DATABASE_URL) {
  throw new Error('EXECUTION_OFFICE_SECURITY_DATABASE_REQUIRED: CI requires TEST_DATABASE_URL');
}
const describeWithDisposableDatabase = TEST_DATABASE_URL ? describe : describe.skip;

describeWithDisposableDatabase('ExecutionOffice update tenant and mass-assignment security', () => {
  jest.setTimeout(60_000);

  let prisma: PrismaClient;
  let service: ExecutionOfficeService;
  let tenantAId: string;
  let tenantBId: string;
  let officeAId: string;
  let officeBId: string;

  beforeAll(async () => {
    prisma = new PrismaClient({ datasources: { db: { url: TEST_DATABASE_URL } } });
    await prisma.$connect();
    service = new ExecutionOfficeService(prisma as never);
    const suffix = randomUUID();
    const [tenantA, tenantB] = await Promise.all([
      prisma.tenant.create({ data: { name: 'Execution Office Security A', slug: `exec-office-a-${suffix}` } }),
      prisma.tenant.create({ data: { name: 'Execution Office Security B', slug: `exec-office-b-${suffix}` } }),
    ]);
    tenantAId = tenantA.id;
    tenantBId = tenantB.id;
    const [officeA, officeB] = await Promise.all([
      prisma.executionOffice.create({
        data: { tenantId: tenantAId, name: 'Tenant A Office', city: 'Ankara', iban: 'TR-A-ORIGINAL' },
      }),
      prisma.executionOffice.create({
        data: { tenantId: tenantBId, name: 'Tenant B Office', city: 'Istanbul', iban: 'TR-B-ORIGINAL' },
      }),
    ]);
    officeAId = officeA.id;
    officeBId = officeB.id;
  });

  afterAll(async () => {
    if (prisma) {
      await prisma.tenant.deleteMany({ where: { id: { in: [tenantAId, tenantBId] } } });
      await prisma.$disconnect();
    }
  });

  it('updates an allowed same-tenant field and preserves ownership', async () => {
    await expect(service.update(tenantAId, officeAId, {
      bankName: 'Safe Bank',
      branchName: 'Central',
      iban: 'TR-A-UPDATED',
    })).resolves.toMatchObject({
      id: officeAId,
      tenantId: tenantAId,
      bankName: 'Safe Bank',
      branchName: 'Central',
      iban: 'TR-A-UPDATED',
    });
  });

  it('rejects cross-tenant and missing ids without changing either persisted row', async () => {
    const beforeA = await prisma.executionOffice.findUniqueOrThrow({ where: { id: officeAId } });
    const beforeB = await prisma.executionOffice.findUniqueOrThrow({ where: { id: officeBId } });

    await expect(service.update(tenantAId, officeBId, { name: 'Cross-tenant mutation' }))
      .rejects.toMatchObject({ status: 404 });
    await expect(service.update(tenantAId, `missing-${randomUUID()}`, { name: 'Missing mutation' }))
      .rejects.toMatchObject({ status: 404 });

    await expect(prisma.executionOffice.findUniqueOrThrow({ where: { id: officeAId } }))
      .resolves.toMatchObject({ name: beforeA.name, tenantId: beforeA.tenantId });
    await expect(prisma.executionOffice.findUniqueOrThrow({ where: { id: officeBId } }))
      .resolves.toMatchObject({ name: beforeB.name, tenantId: beforeB.tenantId });
  });

  it('excludes body ownership and system fields while applying an allowed field', async () => {
    const before = await prisma.executionOffice.findUniqueOrThrow({ where: { id: officeAId } });
    const injectedId = `injected-${randomUUID()}`;
    const result = await service.update(tenantAId, officeAId, {
      name: 'Allowlisted Name',
      id: injectedId,
      tenantId: tenantBId,
      isActive: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      cases: [{ id: 'injected-case' }],
      unknownField: 'injected',
    });

    expect(result).toMatchObject({
      id: officeAId,
      tenantId: tenantAId,
      name: 'Allowlisted Name',
      isActive: true,
      createdAt: before.createdAt,
    });
    expect(result.id).not.toBe(injectedId);
    await expect(prisma.executionOffice.findUnique({ where: { id: injectedId } })).resolves.toBeNull();
  });

  it('rejects a forbidden-only payload and leaves the record byte-for-byte unchanged', async () => {
    const before = await prisma.executionOffice.findUniqueOrThrow({ where: { id: officeAId } });
    await expect(service.update(tenantAId, officeAId, {
      id: officeBId,
      tenantId: tenantBId,
      isActive: false,
      updatedAt: new Date(0),
    })).rejects.toMatchObject({ status: 400 });
    const after = await prisma.executionOffice.findUniqueOrThrow({ where: { id: officeAId } });
    expect(after).toEqual(before);
  });
});

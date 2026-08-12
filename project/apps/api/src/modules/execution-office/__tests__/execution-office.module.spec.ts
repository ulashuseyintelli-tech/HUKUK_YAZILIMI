import { INestApplication } from '@nestjs/common';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';

import { PrismaService } from '../../../prisma/prisma.service';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { ExecutionOfficeController } from '../execution-office.controller';
import { ExecutionOfficeModule } from '../execution-office.module';
import { ExecutionOfficeService } from '../execution-office.service';

describe('ExecutionOfficeModule actual surface', () => {
  let app: INestApplication;
  let moduleRef: TestingModule;
  let service: ExecutionOfficeService;
  let closed = false;

  const executionOffice = {
    findMany: jest.fn(),
    findFirst: jest.fn(),
    findFirstOrThrow: jest.fn(),
    create: jest.fn(),
    updateMany: jest.fn(),
  };
  const prisma = {
    executionOffice,
    $transaction: jest.fn(async (callback: (tx: { executionOffice: typeof executionOffice }) => unknown) =>
      callback({ executionOffice }),
    ),
  };

  beforeAll(async () => {
    moduleRef = await Test.createTestingModule({ imports: [ExecutionOfficeModule] })
      .overrideProvider(PrismaService)
      .useValue(prisma)
      .compile();
    app = moduleRef.createNestApplication();
    app.useLogger(false);
    await app.init();
    service = moduleRef.get(ExecutionOfficeService);
  });

  afterEach(() => jest.clearAllMocks());

  afterAll(async () => {
    if (!closed && app) await app.close();
  });

  it('starts with the real module and wires its controller and exported service', () => {
    expect(moduleRef.get(ExecutionOfficeController)).toBeInstanceOf(ExecutionOfficeController);
    expect(service).toBeInstanceOf(ExecutionOfficeService);
  });

  it('keeps JwtAuthGuard on the real controller surface', () => {
    const guards = Reflect.getMetadata(GUARDS_METADATA, ExecutionOfficeController) as unknown[];
    expect(guards).toContain(JwtAuthGuard);
  });

  it('scopes list, city, and detail reads to the trusted tenant', async () => {
    executionOffice.findMany
      .mockResolvedValueOnce([{ id: 'office-a', tenantId: 'tenant-a', city: 'Ankara' }])
      .mockResolvedValueOnce([{ city: 'Ankara' }]);
    executionOffice.findFirst.mockResolvedValueOnce({ id: 'office-a', tenantId: 'tenant-a' });

    await expect(service.findAll('tenant-a', 'Ankara')).resolves.toHaveLength(1);
    expect(executionOffice.findMany).toHaveBeenNthCalledWith(1, {
      where: { tenantId: 'tenant-a', isActive: true, city: 'Ankara' },
      orderBy: [{ city: 'asc' }, { name: 'asc' }],
    });

    await expect(service.getCities('tenant-a')).resolves.toEqual(['Ankara']);
    expect(executionOffice.findMany).toHaveBeenNthCalledWith(2, {
      where: { tenantId: 'tenant-a', isActive: true },
      select: { city: true },
      distinct: ['city'],
      orderBy: { city: 'asc' },
    });

    await expect(service.findOne('tenant-a', 'office-a')).resolves.toMatchObject({ id: 'office-a' });
    expect(executionOffice.findFirst).toHaveBeenCalledWith({
      where: { id: 'office-a', tenantId: 'tenant-a' },
    });
  });

  it('injects the route tenant into create data instead of accepting a body tenant', async () => {
    executionOffice.create.mockImplementation(async ({ data }: { data: Record<string, unknown> }) => ({
      id: 'created-office',
      ...data,
    }));
    await expect(service.create('tenant-a', {
      tenantId: 'tenant-b',
      name: 'Synthetic Execution Office',
      city: 'Ankara',
    })).resolves.toMatchObject({ tenantId: 'tenant-a', name: 'Synthetic Execution Office' });
    expect(executionOffice.create).toHaveBeenCalledWith({
      data: expect.objectContaining({ tenantId: 'tenant-a', name: 'Synthetic Execution Office' }),
    });
  });

  it('atomically scopes a valid update to id + trusted tenant and returns the same-tenant row', async () => {
    executionOffice.updateMany.mockResolvedValueOnce({ count: 1 });
    executionOffice.findFirstOrThrow.mockResolvedValueOnce({
      id: 'office-a',
      tenantId: 'tenant-a',
      name: 'Updated Office',
      city: 'Ankara',
    });

    await expect(service.update('tenant-a', 'office-a', {
      name: 'Updated Office',
      city: 'Ankara',
    })).resolves.toMatchObject({ tenantId: 'tenant-a', name: 'Updated Office' });
    expect(executionOffice.updateMany).toHaveBeenCalledWith({
      where: { id: 'office-a', tenantId: 'tenant-a' },
      data: expect.objectContaining({ name: 'Updated Office', city: 'Ankara' }),
    });
    expect(executionOffice.findFirstOrThrow).toHaveBeenCalledWith({
      where: { id: 'office-a', tenantId: 'tenant-a' },
    });
  });

  it('fails closed for missing or cross-tenant ids before any response read', async () => {
    executionOffice.updateMany.mockResolvedValueOnce({ count: 0 });
    await expect(service.update('tenant-a', 'office-b', { name: 'Blocked' }))
      .rejects.toMatchObject({ status: 404 });
    expect(executionOffice.updateMany).toHaveBeenCalledWith({
      where: { id: 'office-b', tenantId: 'tenant-a' },
      data: expect.objectContaining({ name: 'Blocked' }),
    });
    expect(executionOffice.findFirstOrThrow).not.toHaveBeenCalled();
  });

  it('keeps ownership, identity, lifecycle, timestamps, and unknown fields out of Prisma data', async () => {
    executionOffice.updateMany.mockResolvedValueOnce({ count: 1 });
    executionOffice.findFirstOrThrow.mockResolvedValueOnce({
      id: 'office-a',
      tenantId: 'tenant-a',
      name: 'Allowed',
    });
    await service.update('tenant-a', 'office-a', {
      name: 'Allowed',
      id: 'office-b',
      tenantId: 'tenant-b',
      isActive: false,
      createdAt: new Date(0),
      updatedAt: new Date(0),
      cases: [],
      unknownField: 'blocked',
    });

    const data = executionOffice.updateMany.mock.calls[0][0].data;
    expect(data).toMatchObject({ name: 'Allowed' });
    expect(data).not.toHaveProperty('id');
    expect(data).not.toHaveProperty('tenantId');
    expect(data).not.toHaveProperty('isActive');
    expect(data).not.toHaveProperty('createdAt');
    expect(data).not.toHaveProperty('updatedAt');
    expect(data).not.toHaveProperty('cases');
    expect(data).not.toHaveProperty('unknownField');
  });

  it('rejects a forbidden-only payload without opening a transaction', async () => {
    await expect(service.update('tenant-a', 'office-a', {
      id: 'office-b',
      tenantId: 'tenant-b',
      isActive: false,
    })).rejects.toMatchObject({ status: 400 });
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(executionOffice.updateMany).not.toHaveBeenCalled();
  });

  it('preserves the controller to service trusted-tenant argument contract', async () => {
    const controller = moduleRef.get(ExecutionOfficeController);
    const update = jest.spyOn(service, 'update').mockResolvedValueOnce({ id: 'office-a' } as never);
    await controller.update('tenant-a', 'office-a', { name: 'Updated' });
    expect(update).toHaveBeenCalledWith('tenant-a', 'office-a', { name: 'Updated' });
  });

  it('propagates persistence failures without manufacturing a success envelope', async () => {
    executionOffice.findMany.mockRejectedValueOnce(new Error('synthetic persistence failure'));
    await expect(service.findAll('tenant-a')).rejects.toThrow('synthetic persistence failure');
  });

  it('shuts the initialized Nest application down cleanly', async () => {
    await expect(app.close()).resolves.toBeUndefined();
    closed = true;
  });
});

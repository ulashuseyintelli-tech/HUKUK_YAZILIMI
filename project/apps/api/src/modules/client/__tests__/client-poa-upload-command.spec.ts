import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClientController } from '../client.controller';
import { POA_UPLOAD_MAX_BYTES, PoaService, validatePoaUploadFile } from '../../poa/poa.service';

function buildFile(overrides: Partial<Express.Multer.File> = {}): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'vekalet.pdf',
    encoding: '7bit',
    mimetype: 'application/pdf',
    size: 1234,
    buffer: Buffer.from('poa-file'),
    stream: undefined as any,
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function buildPoaServiceHarness(opts: { poa?: any } = {}) {
  const prisma: any = {
    clientPowerOfAttorney: {
      findFirst: jest.fn().mockResolvedValue(Object.prototype.hasOwnProperty.call(opts, 'poa') ? opts.poa : { id: 'poa-1', clientId: 'client-1' }),
    },
  };
  const service = new PoaService(prisma, {} as any, {} as any);
  jest.spyOn(service, 'uploadFile').mockResolvedValue({
    success: true,
    filePath: 'C:/secret/storage/tenant-1/poa-1.pdf',
    fileSize: 1234,
    mimeType: 'application/pdf',
  } as any);
  return { service, prisma };
}

describe('validatePoaUploadFile', () => {
  it('requires a multipart file', () => {
    expect(() => validatePoaUploadFile(undefined)).toThrow(BadRequestException);
  });

  it('rejects unsupported file types', () => {
    expect(() => validatePoaUploadFile(buildFile({ mimetype: 'image/gif' }))).toThrow(BadRequestException);
  });

  it('rejects files over 10MB', () => {
    expect(() => validatePoaUploadFile(buildFile({ size: POA_UPLOAD_MAX_BYTES + 1 }))).toThrow(BadRequestException);
  });

  it('accepts the V1 POA upload allowlist', () => {
    expect(() => validatePoaUploadFile(buildFile({ mimetype: 'application/pdf' }))).not.toThrow();
    expect(() => validatePoaUploadFile(buildFile({ mimetype: 'image/jpeg' }))).not.toThrow();
    expect(() => validatePoaUploadFile(buildFile({ mimetype: 'image/png' }))).not.toThrow();
  });
});

describe('PoaService.uploadFileForClientWorkspace', () => {
  it('validates tenant/client/poa boundary and returns a safe response without raw filePath', async () => {
    const { service, prisma } = buildPoaServiceHarness();
    const file = buildFile();

    const result = await service.uploadFileForClientWorkspace('client-1', 'poa-1', file, 'tenant-1');
    const serialized = JSON.stringify(result);

    expect(prisma.clientPowerOfAttorney.findFirst).toHaveBeenCalledWith({
      where: {
        id: 'poa-1',
        clientId: 'client-1',
        client: { id: 'client-1', tenantId: 'tenant-1', isActive: true },
      },
      select: { id: true, clientId: true },
    });
    expect(service.uploadFile).toHaveBeenCalledWith('poa-1', file, 'tenant-1');
    expect(result).toEqual({
      clientId: 'client-1',
      poaId: 'poa-1',
      hasFile: true,
      fileSize: 1234,
      mimeType: 'application/pdf',
    });
    expect(serialized).not.toContain('filePath');
    expect(serialized).not.toContain('secret');
    expect(serialized).not.toContain('storage');
  });

  it('returns 404 and does not write when the POA is missing, inactive-client, or cross-tenant', async () => {
    const { service } = buildPoaServiceHarness({ poa: null });

    await expect(service.uploadFileForClientWorkspace('client-1', 'poa-foreign', buildFile(), 'tenant-1')).rejects.toBeInstanceOf(NotFoundException);
    expect(service.uploadFile).not.toHaveBeenCalled();
  });
});

describe('ClientController.uploadPoaFile', () => {
  it('wraps the safe workspace POA upload response in data', async () => {
    const poaService = {
      uploadFileForClientWorkspace: jest.fn().mockResolvedValue({
        clientId: 'client-1',
        poaId: 'poa-1',
        hasFile: true,
        fileSize: 1234,
        mimeType: 'application/pdf',
      }),
    };
    const controller = new ClientController({} as any, {} as any, poaService as any);
    const req = { user: { id: 'user-1', tenantId: 'tenant-1', role: 'USER' } } as any;
    const file = buildFile();

    const result = await controller.uploadPoaFile(req, 'client-1', 'poa-1', file);

    expect(poaService.uploadFileForClientWorkspace).toHaveBeenCalledWith('client-1', 'poa-1', file, 'tenant-1');
    expect(result).toEqual({
      data: {
        clientId: 'client-1',
        poaId: 'poa-1',
        hasFile: true,
        fileSize: 1234,
        mimeType: 'application/pdf',
      },
    });
  });

  it('rejects invalid uploads before the service writes', async () => {
    const poaService = { uploadFileForClientWorkspace: jest.fn() };
    const controller = new ClientController({} as any, {} as any, poaService as any);
    const req = { user: { id: 'user-1', tenantId: 'tenant-1', role: 'USER' } } as any;

    await expect(controller.uploadPoaFile(req, 'client-1', 'poa-1', buildFile({ mimetype: 'text/plain' }))).rejects.toBeInstanceOf(BadRequestException);
    expect(poaService.uploadFileForClientWorkspace).not.toHaveBeenCalled();
  });
});
import { ForbiddenException } from '@nestjs/common';
import { ESignService, ESignRequest } from '../esign.service';

/**
 * CLIENT-SEC-H2C-P02 — EsignLog new-write tenant population.
 *
 * Kapsam:
 * - tenant-bound create doğru tenantId yazar (authenticated context'ten, request body'den DEĞİL).
 * - tenant context yoksa write fail closed (ForbiddenException, Prisma HİÇ çağrılmaz).
 * - request body içinde tenantId benzeri bir alan olsa bile (ESignRequest tipi böyle bir alan
 *   taşımıyor) yalnız explicit parametre kullanılır — override imkanı yok.
 * - update (updateLogEntry) mevcut tenantId'yi değiştirmez.
 * - diğer e-sign akışları (mock signing sonucu) değişmedi.
 */
describe('CLIENT-SEC-H2C-P02 — EsignLog tenant write population', () => {
  const buildService = () => {
    const prisma: any = {
      esignLog: {
        create: jest.fn().mockResolvedValue({ id: 'log-1' }),
        update: jest.fn().mockResolvedValue({}),
      },
    };
    const configService: any = { get: jest.fn().mockReturnValue(undefined) };
    const service = new ESignService(configService, prisma);
    return { service, prisma };
  };

  const req = (): ESignRequest => ({
    documentId: 'case-1',
    documentName: 'takip-talebi.pdf',
    documentContent: 'YmFzZTY0',
    signerId: 'case-1',
    signerName: 'Test Signer',
    signerTcNo: '12345678901',
    signatureType: 'SIMPLE',
  });

  it('tenant-bound create: esignLog.create tenantId ile çağrılır (mock provider, sonuç başarılı)', async () => {
    const { service, prisma } = buildService();

    const result = await service.requestSignature(req(), 'tenant-A');

    expect(result.success).toBe(true);
    expect(prisma.esignLog.create).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ tenantId: 'tenant-A' }) }),
    );
  });

  it('tenant context yoksa (undefined) fail closed: ForbiddenException, Prisma HİÇ çağrılmaz', async () => {
    const { service, prisma } = buildService();

    await expect(service.requestSignature(req(), undefined as any)).rejects.toBeInstanceOf(
      ForbiddenException,
    );
    expect(prisma.esignLog.create).not.toHaveBeenCalled();
  });

  it('tenant context yoksa (boş string) fail closed', async () => {
    const { service, prisma } = buildService();

    await expect(service.requestSignature(req(), '')).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.esignLog.create).not.toHaveBeenCalled();
  });

  it('requestBulkSignature: her istek AYNI authenticated tenantId ile yazılır', async () => {
    const { service, prisma } = buildService();

    await service.requestBulkSignature([req(), req()], 'tenant-B');

    expect(prisma.esignLog.create).toHaveBeenCalledTimes(2);
    for (const call of prisma.esignLog.create.mock.calls) {
      expect(call[0].data.tenantId).toBe('tenant-B');
    }
  });

  it('updateLogEntry (sonuç güncellemesi) tenantId alanına HİÇ dokunmaz — mevcut ownership korunur', async () => {
    const { service, prisma } = buildService();

    await service.requestSignature(req(), 'tenant-A');

    expect(prisma.esignLog.update).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: 'log-1' },
        data: expect.not.objectContaining({ tenantId: expect.anything() }),
      }),
    );
  });
});

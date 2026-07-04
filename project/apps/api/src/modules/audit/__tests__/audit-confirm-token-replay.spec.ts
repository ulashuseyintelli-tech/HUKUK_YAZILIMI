// P3-1b — AuditService.hasPriorConfirmTokenConsumption (narrow replay read helper) testleri.
import { AuditService } from '../audit.service';
import { PrismaService } from '../../../prisma/prisma.service';

function makeService(findMany: jest.Mock) {
  const prisma = { auditLog: { findMany } } as unknown as PrismaService;
  return new AuditService(prisma);
}

const INPUT = { tenantId: 't1', targetRef: 'c1', nonce: 'n-abc', actionCode: 'CHANGE_STATUS' };

describe('AuditService.hasPriorConfirmTokenConsumption (P3-1b)', () => {
  it('aynı nonce + result=CONSUMED + actionCode varsa true', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { metadata: { nonce: 'n-abc', result: 'CONSUMED', actionCode: 'CHANGE_STATUS' } },
    ]);
    const svc = makeService(findMany);
    await expect(svc.hasPriorConfirmTokenConsumption(INPUT)).resolves.toBe(true);
  });

  it('yalnız indeksli kolonlarla sorgular (tenantId/action/entityType/entityId)', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const svc = makeService(findMany);
    await svc.hasPriorConfirmTokenConsumption(INPUT);
    expect(findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: {
          tenantId: 't1',
          action: 'CONFIRM_TOKEN_CONSUMED',
          entityType: 'GUIDED_OPEN_CONFIRM',
          entityId: 'c1',
        },
      }),
    );
  });

  it('eşleşen nonce yoksa false', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { metadata: { nonce: 'other', result: 'CONSUMED', actionCode: 'CHANGE_STATUS' } },
    ]);
    const svc = makeService(findMany);
    await expect(svc.hasPriorConfirmTokenConsumption(INPUT)).resolves.toBe(false);
  });

  it('nonce eşleşse de result!=CONSUMED ise false (başarısız önceki deneme replay sayılmaz)', async () => {
    const findMany = jest.fn().mockResolvedValue([
      { metadata: { nonce: 'n-abc', result: 'MISMATCH', actionCode: 'CHANGE_STATUS' } },
    ]);
    const svc = makeService(findMany);
    await expect(svc.hasPriorConfirmTokenConsumption(INPUT)).resolves.toBe(false);
  });

  it('best-effort: okuma hatası akışı bozmaz → false', async () => {
    const findMany = jest.fn().mockRejectedValue(new Error('db down'));
    const svc = makeService(findMany);
    await expect(svc.hasPriorConfirmTokenConsumption(INPUT)).resolves.toBe(false);
  });
});

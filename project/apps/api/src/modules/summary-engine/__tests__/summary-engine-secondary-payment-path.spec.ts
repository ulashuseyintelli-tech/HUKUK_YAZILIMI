import { GoneException, RequestMethod } from '@nestjs/common';
import { METHOD_METADATA, PATH_METADATA } from '@nestjs/common/constants';
import { SummaryEngineController } from '../summary-engine.controller';
import { SummaryEngineService } from '../summary-engine.service';

describe('Summary Engine secondary payment write path', () => {
  function setup() {
    const prisma = { $transaction: jest.fn() };
    const service = new SummaryEngineService(prisma as any);
    const controller = new SummaryEngineController(service);
    return { controller, prisma, service };
  }

  it('standalone recordPayment fail-closed kapanır ve transaction açmaz', async () => {
    const { prisma, service } = setup();

    await expect(service.recordPayment('tenant-1', 'case-1', 100)).rejects.toMatchObject({
      response: {
        error: 'SECONDARY_ALLOCATION_PATH_CLOSED',
        message:
          'Standalone Summary Engine payment writes are closed; use the canonical Collection endpoint.',
      },
      status: 410,
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('POST payment handler legacy çağrıya açık 410 Gone döndürür', async () => {
    const { controller, prisma } = setup();
    const handler = Object.getPrototypeOf(controller).recordPayment;

    expect(Reflect.getMetadata(PATH_METADATA, handler)).toBe('case/:caseId/payment');
    expect(Reflect.getMetadata(METHOD_METADATA, handler)).toBe(RequestMethod.POST);

    await expect(
      controller.recordPayment('tenant-1', 'case-1', { amount: 100 }),
    ).rejects.toBeInstanceOf(GoneException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

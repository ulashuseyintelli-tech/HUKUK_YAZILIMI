import { BadRequestException } from '@nestjs/common';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaimItemService } from '../claim-item.service';

function makeService(generatedItems: any[]) {
  const claimItem = {
    create: jest.fn(async ({ data }: any) => ({ id: 'claim-item-1', ...data })),
  };
  const prisma: any = {
    case: { findFirst: jest.fn().mockResolvedValue({ id: 'case-1' }) },
    claimItem,
  };
  const claimEngine = {
    generateClaimItems: jest.fn().mockReturnValue(generatedItems),
  };
  const writerRouter = {
    createSystemClaimItem: jest.fn(async ({ data }: any) => claimItem.create({ data })),
  };
  const service = new ClaimItemService(
    prisma,
    claimEngine as any,
    undefined,
    undefined,
    writerRouter as any,
  );

  return { claimItem, service, writerRouter };
}

async function expectUnsupportedComponent(promise: Promise<unknown>) {
  try {
    await promise;
    throw new Error('Expected UNSUPPORTED_COMPONENT');
  } catch (error) {
    expect(error).toBeInstanceOf(BadRequestException);
    expect((error as BadRequestException).getResponse()).toEqual({
      code: 'UNSUPPORTED_COMPONENT',
      message: 'Rule Engine component is not supported.',
    });
  }
}

describe('RCV-CLAIM-FORM-P02-S01 Rule Engine formation admission', () => {
  it('preflights the complete batch before the first writer call', async () => {
    const { claimItem, service, writerRouter } = makeService([
      { type: 'PRINCIPAL', amount: 100, required: true, label: 'Asıl alacak' },
      { type: 'EXPENSE', amount: 5, required: false, label: 'Komisyon' },
    ]);

    await expectUnsupportedComponent(
      service.generateFromRuleEngine('tenant-1', 'user-1', 'case-1', 'SUB', {}, {}),
    );

    expect(writerRouter.createSystemClaimItem).not.toHaveBeenCalled();
    expect(claimItem.create).not.toHaveBeenCalled();
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['blank', '   '],
    ['unknown', 'UNKNOWN_COMPONENT'],
  ])('fails closed for %s component with zero writes', async (_name, type) => {
    const { claimItem, service, writerRouter } = makeService([
      { type, amount: 10, required: true, label: 'Unsupported' },
    ]);

    await expectUnsupportedComponent(
      service.generateFromRuleEngine('tenant-1', 'user-1', 'case-1', 'SUB', {}, {}),
    );

    expect(writerRouter.createSystemClaimItem).not.toHaveBeenCalled();
    expect(claimItem.create).not.toHaveBeenCalled();
  });

  it('does not convert the active EXPENSE template to OTHER', async () => {
    const { claimItem, service, writerRouter } = makeService([
      { type: 'EXPENSE', amount: undefined, required: false, label: 'Komisyon' },
    ]);

    await expectUnsupportedComponent(
      service.generateFromRuleEngine('tenant-1', 'user-1', 'case-1', 'SUB', {}, {}),
    );

    expect(writerRouter.createSystemClaimItem).not.toHaveBeenCalled();
    expect(claimItem.create).not.toHaveBeenCalled();
  });

  it.each([
    ['PRINCIPAL', 'PRINCIPAL'],
    ['ACCRUED_INTEREST', 'PRE_INTEREST'],
    ['POST_INTEREST_RULE', 'POST_INTEREST'],
    ['PENALTY', 'PENALTY'],
    ['COMMISSION', 'EXPENSE'],
    ['FEE', 'FEE'],
    ['ATTORNEY_FEE', 'ATTORNEY_FEE'],
    ['OTHER', 'OTHER'],
  ])('preserves supported mapping %s -> %s', async (type, expectedItemType) => {
    const { service, writerRouter } = makeService([
      { type, amount: 10, required: true, label: type },
    ]);

    await service.generateFromRuleEngine('tenant-1', 'user-1', 'case-1', 'SUB', {}, {});

    expect(writerRouter.createSystemClaimItem).toHaveBeenCalledTimes(1);
    expect(writerRouter.createSystemClaimItem).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ itemType: expectedItemType }),
      }),
    );
  });

  it('contains no OTHER fallback and completes preflight before routed writes', () => {
    const source = readFileSync(join(__dirname, '..', 'claim-item.service.ts'), 'utf8');
    const start = source.indexOf('async generateFromRuleEngine(');
    const end = source.indexOf('async validateWithRuleEngine(', start);
    const method = source.slice(start, end);

    expect(start).toBeGreaterThanOrEqual(0);
    expect(end).toBeGreaterThan(start);
    expect(method).not.toMatch(/(?:\|\||\?\?)\s*['"]OTHER['"]/);
    expect(method).toContain("code: 'UNSUPPORTED_COMPONENT'");
    expect(method.indexOf('const preflightedItems = generatedItems.map'))
      .toBeLessThan(method.indexOf('createSystemClaimItem'));
  });
});

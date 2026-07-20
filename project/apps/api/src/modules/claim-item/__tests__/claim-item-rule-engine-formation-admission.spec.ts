import { BadRequestException } from '@nestjs/common';
import * as yaml from 'js-yaml';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaimItemService } from '../claim-item.service';

function makeService(generatedItems: any[]) {
  const auditWrite = jest.fn();
  const eventWrite = jest.fn();
  const outboxWrite = jest.fn();
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
    createSystemClaimItem: jest.fn(async ({ data }: any) => {
      const createdItem = await claimItem.create({ data });
      auditWrite();
      eventWrite();
      outboxWrite();
      return createdItem;
    }),
  };
  const service = new ClaimItemService(
    prisma,
    claimEngine as any,
    undefined,
    undefined,
    writerRouter as any,
  );

  return {
    auditWrite,
    claimItem,
    eventWrite,
    outboxWrite,
    service,
    writerRouter,
  };
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

function expectNoWrites({
  auditWrite,
  claimItem,
  eventWrite,
  outboxWrite,
  writerRouter,
}: ReturnType<typeof makeService>) {
  expect(writerRouter.createSystemClaimItem).not.toHaveBeenCalled();
  expect(claimItem.create).not.toHaveBeenCalled();
  expect(auditWrite).not.toHaveBeenCalled();
  expect(eventWrite).not.toHaveBeenCalled();
  expect(outboxWrite).not.toHaveBeenCalled();
}

describe('RCV-CLAIM-FORM-P02-S01/S02-I01 Rule Engine formation admission', () => {
  it('preflights the complete batch before the first writer call', async () => {
    const surface = makeService([
      { type: 'PRINCIPAL', amount: 100, required: true, label: 'Asıl alacak' },
      { type: 'EXPENSE', amount: 5, required: false, label: 'Komisyon' },
    ]);

    await expectUnsupportedComponent(
      surface.service.generateFromRuleEngine(
        'tenant-1',
        'user-1',
        'case-1',
        'SUB',
        {},
        {},
      ),
    );

    expectNoWrites(surface);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['empty', ''],
    ['blank', '   '],
    ['unknown', 'UNKNOWN_COMPONENT'],
  ])('fails closed for %s component with zero writes', async (_name, type) => {
    const surface = makeService([
      { type, amount: 10, required: true, label: 'Unsupported' },
    ]);

    await expectUnsupportedComponent(
      surface.service.generateFromRuleEngine(
        'tenant-1',
        'user-1',
        'case-1',
        'SUB',
        {},
        {},
      ),
    );

    expectNoWrites(surface);
  });

  it('does not convert the active EXPENSE template to OTHER', async () => {
    const surface = makeService([
      { type: 'EXPENSE', amount: undefined, required: false, label: 'Komisyon' },
    ]);

    await expectUnsupportedComponent(
      surface.service.generateFromRuleEngine(
        'tenant-1',
        'user-1',
        'case-1',
        'SUB',
        {},
        {},
      ),
    );

    expectNoWrites(surface);
  });

  it('rejects a required POST_INTEREST_RULE with zero writes', async () => {
    const surface = makeService([
      {
        type: 'POST_INTEREST_RULE',
        amount: undefined,
        required: true,
        label: 'Takip Sonrası Faiz Kuralı',
      },
    ]);

    await expectUnsupportedComponent(
      surface.service.generateFromRuleEngine(
        'tenant-1',
        'user-1',
        'case-1',
        'SUB',
        {},
        {},
      ),
    );

    expectNoWrites(surface);
  });

  it('rejects an optional POST_INTEREST_RULE with zero writes', async () => {
    const surface = makeService([
      {
        type: 'POST_INTEREST_RULE',
        amount: undefined,
        required: false,
        label: 'Takip Sonrası Faiz Kuralı',
      },
    ]);

    await expectUnsupportedComponent(
      surface.service.generateFromRuleEngine(
        'tenant-1',
        'user-1',
        'case-1',
        'SUB',
        {},
        {},
      ),
    );

    expectNoWrites(surface);
  });

  it('rejects the complete batch before writing a valid preceding component', async () => {
    const surface = makeService([
      { type: 'PRINCIPAL', amount: 100, required: true, label: 'Asıl alacak' },
      {
        type: 'POST_INTEREST_RULE',
        amount: undefined,
        required: true,
        label: 'Takip Sonrası Faiz Kuralı',
      },
    ]);

    await expectUnsupportedComponent(
      surface.service.generateFromRuleEngine(
        'tenant-1',
        'user-1',
        'case-1',
        'SUB',
        {},
        {},
      ),
    );

    expectNoWrites(surface);
  });

  it('rejects all seven active POST_INTEREST_RULE templates before writes', async () => {
    const rules = yaml.load(
      readFileSync(
        join(__dirname, '..', '..', '..', 'config', 'claim-engine-rules.yaml'),
        'utf8',
      ),
    ) as {
      claim_item_sets: {
        templates: Record<string, { items: any[] }>;
      };
    };
    const activePostInterestTemplates = Object.entries(
      rules.claim_item_sets.templates,
    )
      .map(([subCategory, template]) => ({
        items: template.items,
        postInterest: template.items.find(
          (item) => item.type === 'POST_INTEREST_RULE',
        ),
        subCategory,
      }))
      .filter(({ postInterest }) => postInterest !== undefined);

    expect(
      activePostInterestTemplates.map(({ postInterest, subCategory }) => [
        subCategory,
        postInterest.required,
      ]),
    ).toEqual([
      ['ILAMSIZ_GENEL', true],
      ['ILAMSIZ_KIRA', false],
      ['KAMBIYO_CEK', true],
      ['KAMBIYO_SENET', true],
      ['ILAMLI_GENEL', true],
      ['ILAMLI_NAFAKA', false],
      ['ILAMLI_DOVIZ', true],
    ]);

    for (const { items, subCategory } of activePostInterestTemplates) {
      const surface = makeService(items);

      await expectUnsupportedComponent(
        surface.service.generateFromRuleEngine(
          'tenant-1',
          'user-1',
          'case-1',
          subCategory,
          {},
          {},
        ),
      );

      expectNoWrites(surface);
    }
  });

  it.each([
    ['PRINCIPAL', 'PRINCIPAL'],
    ['ACCRUED_INTEREST', 'PRE_INTEREST'],
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
    expect(method).not.toMatch(
      /['"]POST_INTEREST_RULE['"]\s*:\s*['"]POST_INTEREST['"]/,
    );
    expect(method).toContain("code: 'UNSUPPORTED_COMPONENT'");
    expect(method.indexOf('const preflightedItems = generatedItems.map'))
      .toBeLessThan(method.indexOf('createSystemClaimItem'));
  });
});

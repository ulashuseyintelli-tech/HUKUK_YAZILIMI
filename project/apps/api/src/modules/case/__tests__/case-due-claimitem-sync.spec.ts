/**
 * PR-ALACAK-1 — post-create Due ↔ ClaimItem marker'lı sync testleri.
 *
 * Kapsam: createDue/updateDue/deleteDue yalnız `metadata.dueSync.sourceDueId`
 * marker'ı ile güvenli eşleşen ClaimItem'ı senkronlar; eski unmarked kayıtlar
 * için heuristic çalışmaz.
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { ClaimItemType } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { ClaimItemSourceIntegrityException } from '../../claim-item/claim-item-source-integrity.guard';
import { CaseService } from '../case.service';
import {
  DueBoundClaimItemClosedException,
  DueChangeRequiresClaimItemApprovalException,
  DueClaimItemBusyException,
  DueDeleteRequiresClaimItemCancelException,
  DueEditBlockedByPendingClaimItemApprovalException,
  DueWriteForbiddenException,
} from '../due-canonical-item-guard';
import { DueType, InterestType } from '../dto/case.dto';

const stub = {} as any;

function makeService(tx: any) {
  const prisma = {
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  } as any;
  const writerRouter = {
    createSystemClaimItem: jest.fn(async ({ data }: any, database: any) =>
      database.claimItem.create({ data })),
    updateSystemClaimItem: jest.fn(async ({ claimItemId, data }: any, database: any) =>
      database.claimItem.update({ where: { id: claimItemId }, data })),
    cancelSystemClaimItem: jest.fn(async ({ claimItemId }: any, database: any) =>
      database.claimItem.update({ where: { id: claimItemId }, data: { status: 'CANCELLED' } })),
    // Due yazım yetkisi: varsayılan olarak dosyada mali yazma yetkisi VAR; ret senaryoları bunu ezer.
    evaluateHumanCaseFinanceWrite: jest.fn(async () => ({
      allowed: true,
      permission: 'EDIT_FINANCE',
      permissionSource: 'CASE_LAWYER',
    })),
  } as any;
  return {
    service: new CaseService(
      prisma, stub, stub, stub, stub, stub, stub, stub, stub, stub, undefined, writerRouter,
    ),
    prisma,
    writerRouter,
  };
}

function makeAdmissionHarness() {
  const transaction = jest.fn(async () => {
    throw new Error('REACHED_TRANSACTION');
  });
  const caseFindFirst = jest.fn();
  const dueFindMany = jest.fn();
  const prisma = {
    $transaction: transaction,
    case: {
      findFirst: caseFindFirst,
      create: jest.fn(),
    },
    due: {
      create: jest.fn(),
      findMany: dueFindMany,
    },
  } as any;
  const auditLog = jest.fn();
  const auditLogInTransaction = jest.fn();
  const eventAppendInTransaction = jest.fn();
  const clientCreate = jest.fn();
  const lawyerCreate = jest.fn();
  const debtorCreate = jest.fn();
  const claimItemWrite = jest.fn();

  const service = new CaseService(
    prisma,
    { log: auditLog, logInTransaction: auditLogInTransaction } as any,
    stub,
    stub,
    stub,
    { appendInTransaction: eventAppendInTransaction } as any,
    stub,
    { create: clientCreate } as any,
    { create: lawyerCreate } as any,
    { create: debtorCreate } as any,
    undefined,
    { createSystemClaimItem: claimItemWrite } as any,
  );

  return {
    auditLog,
    auditLogInTransaction,
    caseFindFirst,
    claimItemWrite,
    clientCreate,
    debtorCreate,
    dueFindMany,
    eventAppendInTransaction,
    lawyerCreate,
    prisma,
    service,
    transaction,
  };
}

function admissionDue(type: DueType) {
  return {
    type,
    amount: 100,
    dueDate: '2026-07-20',
    currency: 'TRY',
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
      message: 'Due component is not supported for new ClaimItem formation.',
    });
  }
}

function expectNoFormationWrites(harness: ReturnType<typeof makeAdmissionHarness>) {
  expect(harness.transaction).not.toHaveBeenCalled();
  expect(harness.prisma.case.create).not.toHaveBeenCalled();
  expect(harness.prisma.due.create).not.toHaveBeenCalled();
  expect(harness.clientCreate).not.toHaveBeenCalled();
  expect(harness.lawyerCreate).not.toHaveBeenCalled();
  expect(harness.debtorCreate).not.toHaveBeenCalled();
  expect(harness.claimItemWrite).not.toHaveBeenCalled();
  expect(harness.auditLog).not.toHaveBeenCalled();
  expect(harness.auditLogInTransaction).not.toHaveBeenCalled();
  expect(harness.eventAppendInTransaction).not.toHaveBeenCalled();
}

function makeDue(overrides: Record<string, any> = {}) {
  const base = {
    id: 'due-1',
    caseId: 'case-1',
    type: DueType.PRINCIPAL,
    description: 'Ana alacak',
    amount: 1000,
    dueDate: new Date('2026-01-01T00:00:00.000Z'),
    currency: 'TRY',
    sortOrder: 1,
  };
  for (const [key, value] of Object.entries(overrides)) {
    if (value !== undefined) (base as any)[key] = value;
  }
  return base;
}

/** `makeDue()` ile aynı değerleri taşıyan, köprüyle oluşmuş ETKİN bağlı kanonik kalem. */
function makeClaim(overrides: Record<string, any> = {}) {
  return {
    id: 'claim-1',
    tenantId: 'tenant-1',
    caseId: 'case-1',
    status: 'ACTIVE',
    itemType: ClaimItemType.PRINCIPAL,
    amount: 1000,
    demandedAmount: 1000,
    originalAmount: 1000,
    currency: 'TRY',
    dueDate: new Date('2026-01-01T00:00:00.000Z'),
    description: 'Ana alacak',
    sortOrder: 1,
    interestType: null,
    interestTypeCode: null,
    interestRate: null,
    interestStartDate: null,
    interestEndDate: null,
    interestAccrualStatus: 'UNKNOWN',
    noInterestReason: null,
    ...overrides,
  };
}

function makeTx(overrides: Record<string, any> = {}) {
  const tx = {
    // Yetki ve satır kilidi sorguları (FOR SHARE / FOR UPDATE): birim testte satır dönmesi gerekmez.
    $queryRaw: jest.fn(async () => []),
    // Dosya kilidi (COL-LOCK-001; pg_advisory_xact_lock).
    $executeRaw: jest.fn(async () => 1),
    officeApprovalRequest: {
      findFirst: jest.fn(async () => null),
    },
    case: {
      findFirst: jest.fn(async () => ({ id: 'case-1', tenantId: 'tenant-1', currency: 'TRY' })),
    },
    due: {
      aggregate: jest.fn(async () => ({ _max: { sortOrder: 0 } })),
      create: jest.fn(async ({ data }: any) => makeDue({ ...data, id: 'due-1' })),
      findFirst: jest.fn(async () => makeDue()),
      update: jest.fn(async ({ data }: any) => makeDue({ ...data })),
      delete: jest.fn(async () => makeDue()),
    },
    claimItem: {
      create: jest.fn(async ({ data }: any) => ({ id: 'claim-1', ...data })),
      findMany: jest.fn(async () => []),
      update: jest.fn(async ({ data }: any) => ({ id: 'claim-1', ...data })),
    },
    ...overrides,
  };
  return tx;
}

describe('CaseService Due ↔ ClaimItem post-create sync (PR-ALACAK-1)', () => {
  describe('new Due formation admission', () => {
    it.each([
      ['only', [admissionDue(DueType.OTHER)]],
      ['first', [
        admissionDue(DueType.OTHER),
        admissionDue(DueType.PRINCIPAL),
        admissionDue(DueType.EXPENSE),
      ]],
      ['middle', [
        admissionDue(DueType.PRINCIPAL),
        admissionDue(DueType.OTHER),
        admissionDue(DueType.EXPENSE),
      ]],
      ['last', [
        admissionDue(DueType.PRINCIPAL),
        admissionDue(DueType.EXPENSE),
        admissionDue(DueType.OTHER),
      ]],
    ])('POST /cases rejects OTHER in %s position before all writes', async (_position, dues) => {
      const harness = makeAdmissionHarness();

      await expectUnsupportedComponent(
        harness.service.create('tenant-1', { dues } as any, 'user-1'),
      );

      expect(harness.caseFindFirst).not.toHaveBeenCalled();
      expectNoFormationWrites(harness);
    });

    it('POST /cases/:id/dues rejects OTHER before normalization and transaction', async () => {
      const harness = makeAdmissionHarness();

      await expectUnsupportedComponent(
        harness.service.createDue(
          'tenant-1',
          'case-1',
          admissionDue(DueType.OTHER) as any,
          'user-1',
        ),
      );

      expectNoFormationWrites(harness);
    });

    it('returns the same deterministic error for repeated OTHER admission attempts', async () => {
      const harness = makeAdmissionHarness();

      await expectUnsupportedComponent(
        harness.service.createDue(
          'tenant-1',
          'case-1',
          admissionDue(DueType.OTHER) as any,
          'user-1',
        ),
      );
      await expectUnsupportedComponent(
        harness.service.createDue(
          'tenant-1',
          'case-1',
          admissionDue(DueType.OTHER) as any,
          'user-1',
        ),
      );

      expectNoFormationWrites(harness);
    });

    it('keeps every existing non-OTHER admission component supported by the preflight', () => {
      const harness = makeAdmissionHarness();
      const supported = Object.values(DueType).filter((type) => type !== DueType.OTHER);

      expect(() =>
        (harness.service as any).assertDueCreationAdmission(
          supported.map((type) => admissionDue(type)),
        ),
      ).not.toThrow();
    });

    it('keeps legacy OTHER records readable', async () => {
      const harness = makeAdmissionHarness();
      harness.caseFindFirst.mockResolvedValue({ id: 'case-1', tenantId: 'tenant-1' });
      harness.dueFindMany.mockResolvedValue([
        { id: 'due-legacy', ...admissionDue(DueType.OTHER) },
      ]);

      await expect(harness.service.getCaseDues('tenant-1', 'case-1')).resolves.toEqual([
        expect.objectContaining({ id: 'due-legacy', type: DueType.OTHER }),
      ]);
      expect(harness.dueFindMany).toHaveBeenCalledTimes(1);
    });

    it('keeps both public create guards before normalization, queries, inline writers and transactions', () => {
      const source = readFileSync(join(__dirname, '..', 'case.service.ts'), 'utf8');
      const createStart = source.indexOf('  async create(');
      const createBody = source.slice(createStart, source.indexOf('  async update(', createStart));
      const createDueBody = source.slice(
        source.indexOf('  async createDue('),
        source.indexOf('  async updateDue('),
      );
      const createGuard = createBody.indexOf('this.assertDueCreationAdmission(dto.dues ?? [])');
      const createDueGuard = createDueBody.indexOf('this.assertDueCreationAdmission([data])');

      expect(createGuard).toBeGreaterThanOrEqual(0);
      expect(createGuard).toBeLessThan(createBody.indexOf('this.prisma.user.findFirst'));
      expect(createGuard).toBeLessThan(createBody.indexOf('this.resolveInlinePartiesInTx'));
      expect(createGuard).toBeLessThan(createBody.indexOf('this.prisma.$transaction'));
      expect(createDueGuard).toBeGreaterThanOrEqual(0);
      expect(createDueGuard).toBeLessThan(createDueBody.indexOf('this.normalizeDueInterestForWrite'));
      expect(createDueGuard).toBeLessThan(createDueBody.indexOf('this.prisma.$transaction'));
    });
  });

  it('createDue PRINCIPAL → markerlı ClaimItem.PRINCIPAL oluşturur', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.createDue('tenant-1', 'case-1', {
      type: DueType.PRINCIPAL,
      description: 'Ana alacak',
      amount: 1000,
      dueDate: '2026-01-01',
      currency: 'TRY',
      interestType: InterestType.YASAL,
      interestTypeCode: 'LEGAL_3095',
      interestRate: 24,
      interestStartDate: '2026-01-02',
      interestEndDate: '2026-02-02',
    }, 'requester-1');

    expect(tx.claimItem.create).toHaveBeenCalledTimes(1);
    expect(tx.claimItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        tenantId: 'tenant-1',
        caseId: 'case-1',
        itemType: ClaimItemType.PRINCIPAL,
        originalAmount: 1000,
        demandedAmount: 1000,
        amount: 1000,
        currency: 'TRY',
        interestType: InterestType.YASAL,
        interestTypeCode: 'LEGAL_3095',
        interestRate: null,
        interestStartDate: new Date('2026-01-02T00:00:00.000Z'),
        interestEndDate: new Date('2026-02-02T00:00:00.000Z'),
        metadata: {
          dueSync: {
            sourceDueId: 'due-1',
            mappedFrom: 'Due',
          },
        },
      }),
    });
  });

  it('createDue NAFAKA → ClaimItem oluşturmaz', async () => {
    const tx = makeTx({
      due: {
        aggregate: jest.fn(async () => ({ _max: { sortOrder: 0 } })),
        create: jest.fn(async ({ data }: any) => makeDue({ ...data, id: 'due-nafaka', type: DueType.NAFAKA })),
      },
    });
    const { service } = makeService(tx);

    await service.createDue('tenant-1', 'case-1', {
      type: DueType.NAFAKA,
      description: 'Nafaka taksiti',
      amount: 500,
      dueDate: '2026-01-01',
      currency: 'TRY',
    }, 'requester-1');

    expect(tx.claimItem.create).not.toHaveBeenCalled();
  });

  it('createDue YOK niyetini server actor/reason/time ile ClaimItem NO_INTEREST yapar', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await service.createDue('tenant-1', 'case-1', {
      type: DueType.PRINCIPAL,
      amount: 1000,
      dueDate: '2026-01-01',
      interestTypeCode: null,
      interestRate: null,
      interestAccrualStatus: 'NO_INTEREST',
      noInterestReason: 'sözleşmede faiz yok',
    } as any, 'requester-1');

    expect(tx.claimItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        interestType: null,
        interestTypeCode: null,
        interestRate: null,
        interestAccrualStatus: 'NO_INTEREST',
        noInterestReason: 'sözleşmede faiz yok',
        noInterestConfirmedById: 'requester-1',
        noInterestConfirmedAt: expect.any(Date),
      }),
    });
  });

  it('direct Due fixed rate eksikse hicbir write yapmadan fail-closed olur', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await expect(service.createDue('tenant-1', 'case-1', {
      type: DueType.PRINCIPAL,
      amount: 1000,
      dueDate: '2026-01-01',
      interestTypeCode: 'CONTRACTUAL',
      interestRate: null,
    } as any, 'requester-1')).rejects.toThrow(/interestRate/);

    expect(tx.due.create).not.toHaveBeenCalled();
    expect(tx.claimItem.create).not.toHaveBeenCalled();
  });

  it('direct Due NO_INTEREST authenticated actor olmadan reddedilir', async () => {
    const tx = makeTx();
    const { service } = makeService(tx);

    await expect(service.createDue('tenant-1', 'case-1', {
      type: DueType.PRINCIPAL,
      amount: 1000,
      dueDate: '2026-01-01',
      interestAccrualStatus: 'NO_INTEREST',
      noInterestReason: 'faiz yok',
    } as any, undefined as any)).rejects.toThrow(/authenticated server context/);

    expect(tx.due.create).not.toHaveBeenCalled();
  });

  it.each([
    [DueType.NAFAKA, DueType.PRINCIPAL],
    [DueType.NAFAKA, DueType.EXPENSE],
    [DueType.PRINCIPAL, DueType.NAFAKA],
    [DueType.OTHER, DueType.NAFAKA],
  ])('updateDue %s -> %s generic geçişini bütün mutationlardan önce reddeder', async (current, requested) => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue({ type: current })),
        update: jest.fn(),
      },
      claimItem: {
        findMany: jest.fn(),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await expect(
      service.updateDue('tenant-1', 'case-1', 'due-1', { type: requested }, 'requester-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(tx.due.update).not.toHaveBeenCalled();
    expect(tx.claimItem.findMany).not.toHaveBeenCalled();
    expect(tx.claimItem.update).not.toHaveBeenCalled();
  });

  it.each([
    [DueType.PRINCIPAL, DueType.OTHER],
    [DueType.EXPENSE, DueType.OTHER],
    [DueType.HARC, DueType.OTHER],
    [DueType.OTHER, DueType.PRINCIPAL],
  ])('updateDue %s -> %s OTHER admission/reclassification talebini business write oncesi reddeder', async (current, requested) => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue({ type: current })),
        update: jest.fn(),
      },
      claimItem: {
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
      },
    });
    const { service, writerRouter } = makeService(tx);

    await expectUnsupportedComponent(
      service.updateDue('tenant-1', 'case-1', 'due-1', { type: requested }, 'requester-1'),
    );

    expect(tx.due.update).not.toHaveBeenCalled();
    expect(tx.claimItem.findMany).not.toHaveBeenCalled();
    expect(tx.claimItem.create).not.toHaveBeenCalled();
    expect(tx.claimItem.update).not.toHaveBeenCalled();
    expect(writerRouter.createSystemClaimItem).not.toHaveBeenCalled();
    expect(writerRouter.updateSystemClaimItem).not.toHaveBeenCalled();
    expect(writerRouter.cancelSystemClaimItem).not.toHaveBeenCalled();
  });

  it.each([null, '', '   ', '___UNKNOWN___'])(
    'updateDue runtime invalid requested type %p talebini fail-closed reddeder',
    async (requested) => {
      const tx = makeTx({
        due: {
          findFirst: jest.fn(async () => makeDue({ type: DueType.PRINCIPAL })),
          update: jest.fn(),
        },
        claimItem: {
          findMany: jest.fn(),
          create: jest.fn(),
          update: jest.fn(),
        },
      });
      const { service, writerRouter } = makeService(tx);

      await expectUnsupportedComponent(
        service.updateDue('tenant-1', 'case-1', 'due-1', { type: requested } as any, 'requester-1'),
      );

      expect(tx.due.update).not.toHaveBeenCalled();
      expect(tx.claimItem.findMany).not.toHaveBeenCalled();
      expect(tx.claimItem.create).not.toHaveBeenCalled();
      expect(tx.claimItem.update).not.toHaveBeenCalled();
      expect(writerRouter.createSystemClaimItem).not.toHaveBeenCalled();
      expect(writerRouter.updateSystemClaimItem).not.toHaveBeenCalled();
      expect(writerRouter.cancelSystemClaimItem).not.toHaveBeenCalled();
    },
  );

  it('legacy OTHER Due kaydinda type omitted update davranisini korur', async () => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue({ type: DueType.OTHER })),
        update: jest.fn(async ({ data }: any) => {
          const persisted = { ...data };
          if (persisted.type === undefined) delete persisted.type;
          return makeDue({ type: DueType.OTHER, ...persisted });
        }),
      },
      claimItem: {
        findMany: jest.fn(async () => [makeClaim({ id: 'claim-legacy-other', itemType: ClaimItemType.OTHER })]),
        update: jest.fn(async ({ data }: any) => ({ id: 'claim-legacy-other', ...data })),
      },
    });
    const { service } = makeService(tx);

    await service.updateDue('tenant-1', 'case-1', 'due-1', {
      description: 'Legacy OTHER metadata',
    }, 'requester-1');

    expect(tx.due.update).toHaveBeenCalled();
    // Kaleme yalnız düşük etkili alan yansır; tür / tutar / vade / faiz alanları yazılmaz.
    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'claim-legacy-other' },
      data: { description: 'Legacy OTHER metadata' },
    });
  });

  it('updateDue NAFAKA -> NAFAKA same-side güncellemeye izin verir', async () => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue({ type: DueType.NAFAKA })),
        update: jest.fn(async ({ data }: any) => makeDue({ ...data, type: DueType.NAFAKA })),
      },
      claimItem: {
        findMany: jest.fn(async () => []),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await service.updateDue('tenant-1', 'case-1', 'due-1', {
      type: DueType.NAFAKA,
      amount: 750,
    }, 'requester-1');

    expect(tx.due.update).toHaveBeenCalled();
    expect(tx.claimItem.update).not.toHaveBeenCalled();
  });

  /**
   * Owner kararı 18.11.2026 (K1 / K2): Due güncellemesi bağlı kanonik kalemde yüksek etkili değişiklik gerektiriyorsa
   * hiçbir yazımdan önce reddedilir; kaleme yalnız düşük etkili alanlar (açıklama, sıra) yansır.
   */
  it.each([
    ['kalem türünü değiştiren tür', { type: DueType.EXPENSE }, ['type']],
    ['tutar', { amount: 1250 }, ['amount']],
    ['vade', { dueDate: '2026-02-01' }, ['dueDate']],
    ['faiz başlangıç / bitiş', { interestStartDate: '2026-02-02', interestEndDate: '2026-04-01' }, ['interestStartDate', 'interestEndDate']],
    [
      'faiz türü',
      { interestType: InterestType.TICARI, interestTypeCode: 'COMMERCIAL_AVANS_3095_2_2' },
      ['interestTypeCode', 'interestType'],
    ],
    ['açıklamayla birlikte tutar (kısmi yazım yok)', { description: 'Yazılmamalı', amount: 1250 }, ['amount']],
  ] as Array<[string, Record<string, unknown>, string[]]>)(
    'updateDue bağlı kalemde yüksek etkili değişiklik gerektiren isteği yazımdan önce reddeder — %s',
    async (_label, request, fields) => {
      const tx = makeTx({
        due: { findFirst: jest.fn(async () => makeDue()), update: jest.fn() },
        claimItem: { findMany: jest.fn(async () => [makeClaim()]), update: jest.fn() },
      });
      const { service, writerRouter } = makeService(tx);

      const error = await service
        .updateDue('tenant-1', 'case-1', 'due-1', request as any, 'requester-1')
        .then(() => null, (e: unknown) => e);

      expect(error).toBeInstanceOf(DueChangeRequiresClaimItemApprovalException);
      expect((error as DueChangeRequiresClaimItemApprovalException).getResponse()).toEqual(expect.objectContaining({
        code: 'DUE_CHANGE_REQUIRES_CLAIM_ITEM_APPROVAL',
        claimItemId: 'claim-1',
        fields,
      }));
      expect(tx.due.update).not.toHaveBeenCalled();
      expect(tx.claimItem.update).not.toHaveBeenCalled();
      expect(writerRouter.updateSystemClaimItem).not.toHaveBeenCalled();
      expect(writerRouter.cancelSystemClaimItem).not.toHaveBeenCalled();
    },
  );

  it('updateDue kalem türünü değiştirmeyen Due türünü (asıl alacak → kira) yalnız Due\'ya yazar', async () => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue({ type: DueType.PRINCIPAL })),
        update: jest.fn(async ({ data }: any) => makeDue({ ...data, type: DueType.KIRA })),
      },
      claimItem: { findMany: jest.fn(async () => [makeClaim()]), update: jest.fn() },
    });
    const { service, writerRouter } = makeService(tx);

    await service.updateDue('tenant-1', 'case-1', 'due-1', { type: DueType.KIRA }, 'requester-1');

    expect(tx.due.update).toHaveBeenCalled();
    expect(writerRouter.updateSystemClaimItem).not.toHaveBeenCalled();
    expect(tx.claimItem.update).not.toHaveBeenCalled();
  });

  it('updateDue markerlı ClaimItem\'a yalnız değişen düşük etkili alanları (açıklama, sıra) yansıtır', async () => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue()),
        update: jest.fn(async ({ data }: any) => makeDue({ ...data })),
      },
      claimItem: {
        findMany: jest.fn(async () => [makeClaim()]),
        update: jest.fn(async ({ data }: any) => ({ id: 'claim-1', ...data })),
      },
    });
    const { service, writerRouter } = makeService(tx);

    await service.updateDue('tenant-1', 'case-1', 'due-1', {
      // Due'daki değerleri yineleyen yüksek etkili alanlar (eski ekran yükü) değişiklik sayılmaz.
      type: DueType.PRINCIPAL,
      amount: 1000,
      dueDate: '2026-01-01',
      currency: 'TRY',
      description: 'Güncel ana alacak',
      sortOrder: 3,
    }, 'requester-1');

    expect(tx.claimItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        metadata: { path: ['dueSync', 'sourceDueId'], equals: 'due-1' },
      },
      take: 2,
    });
    expect(writerRouter.updateSystemClaimItem).toHaveBeenCalledWith(
      expect.objectContaining({
        route: 'DUE_BRIDGE',
        sourceId: 'due-1',
        claimItemId: 'claim-1',
        initiatedByUserId: 'requester-1',
        data: { description: 'Güncel ana alacak', sortOrder: 3 },
      }),
      tx,
    );
    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'claim-1' },
      data: { description: 'Güncel ana alacak', sortOrder: 3 },
    });
  });

  it('updateDue yalnız Due\'ya özgü alan değişince kaleme hiç yazmaz', async () => {
    const tx = makeTx({
      due: { findFirst: jest.fn(async () => makeDue()), update: jest.fn(async ({ data }: any) => makeDue({ ...data })) },
      claimItem: { findMany: jest.fn(async () => [makeClaim()]), update: jest.fn() },
    });
    const { service, writerRouter } = makeService(tx);

    await service.updateDue('tenant-1', 'case-1', 'due-1', { isPrimary: true, sourceDocumentNo: 'BELGE-1' }, 'requester-1');

    expect(tx.due.update).toHaveBeenCalled();
    expect(writerRouter.updateSystemClaimItem).not.toHaveBeenCalled();
    expect(tx.officeApprovalRequest.findFirst).not.toHaveBeenCalled();
  });

  it('updateDue bağlı kalemde bekleyen onay talebi varken kaleme yansıyan değişikliği yazımdan önce reddeder', async () => {
    const tx = makeTx({
      officeApprovalRequest: { findFirst: jest.fn(async () => ({ id: 'approval-1' })) },
      due: { findFirst: jest.fn(async () => makeDue()), update: jest.fn() },
      claimItem: { findMany: jest.fn(async () => [makeClaim()]), update: jest.fn() },
    });
    const { service, writerRouter } = makeService(tx);

    await expect(
      service.updateDue('tenant-1', 'case-1', 'due-1', { description: 'Talep beklerken' }, 'requester-1'),
    ).rejects.toBeInstanceOf(DueEditBlockedByPendingClaimItemApprovalException);

    expect(tx.officeApprovalRequest.findFirst).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        actionCode: 'CLAIM_ITEM_HIGH_IMPACT_CHANGE',
        targetType: 'CLAIM_ITEM',
        targetRef: 'claim-1',
        status: 'PENDING_APPROVAL',
      },
      select: { id: true },
    });
    expect(tx.due.update).not.toHaveBeenCalled();
    expect(writerRouter.updateSystemClaimItem).not.toHaveBeenCalled();
  });

  it.each([
    ['updateDue', (service: CaseService) => service.updateDue('tenant-1', 'case-1', 'due-1', { description: 'Kalem meşgulken' }, 'requester-1')],
    ['deleteDue', (service: CaseService) => service.deleteDue('tenant-1', 'case-1', 'due-1', 'requester-1')],
  ] as Array<[string, (service: CaseService) => Promise<unknown>]>)(
    '%s kalem satırı başka işlemce kilitliyken beklemez: yazımdan önce DUE_CLAIM_ITEM_BUSY',
    async (_label, run) => {
      const sqlOf = (call: unknown[]) => (call[0] as readonly string[]).join('?');
      const tx = makeTx({
        claimItem: { findMany: jest.fn(async () => [makeClaim({ status: 'CANCELLED' })]), update: jest.fn() },
      });
      tx.$queryRaw.mockImplementation(async (...call: unknown[]) => {
        if (sqlOf(call).includes('"ClaimItem"')) {
          throw Object.assign(new Error('Raw query failed'), { code: 'P2010', meta: { code: '55P03', message: 'could not obtain lock on row in relation "ClaimItem"' } });
        }
        return [];
      });
      const { service, writerRouter } = makeService(tx);

      await expect(run(service)).rejects.toBeInstanceOf(DueClaimItemBusyException);

      const rawCalls = tx.$queryRaw.mock.calls as unknown[][];
      const claimLockAt = rawCalls.findIndex((call) => sqlOf(call).includes('"ClaimItem"'));
      const dueLockAt = rawCalls.findIndex((call) => sqlOf(call).includes('FROM "Due"'));
      expect(claimLockAt).toBeGreaterThanOrEqual(0);
      expect(dueLockAt).toBeGreaterThanOrEqual(0);
      // Kalem satırı sıradan güncelleme gücünde ve BEKLEMESİZ kilitlenir (FOR UPDATE değil).
      expect(sqlOf(rawCalls[claimLockAt])).toContain('FOR NO KEY UPDATE NOWAIT');
      // Kanonik sıra: dosya kilidi (advisory) → Due satırı → kalem satırı.
      const dueLockOrder = tx.$queryRaw.mock.invocationCallOrder[dueLockAt];
      const claimLockOrder = tx.$queryRaw.mock.invocationCallOrder[claimLockAt];
      expect(sqlOf((tx.$executeRaw.mock.calls as unknown[][])[0])).toContain('pg_advisory_xact_lock(hashtextextended(');
      expect(tx.$executeRaw.mock.invocationCallOrder[0]).toBeLessThan(dueLockOrder);
      expect(dueLockOrder).toBeLessThan(claimLockOrder);
      expect(writerRouter.evaluateHumanCaseFinanceWrite.mock.invocationCallOrder[0]).toBeLessThan(tx.$executeRaw.mock.invocationCallOrder[0]);
      expect(tx.due.update).not.toHaveBeenCalled();
      expect(tx.due.delete).not.toHaveBeenCalled();
      expect(tx.claimItem.update).not.toHaveBeenCalled();
    },
  );

  it('updateDue kilit hatası olmayan sorgu hatasını yutmaz', async () => {
    const tx = makeTx({ claimItem: { findMany: jest.fn(async () => [makeClaim()]), update: jest.fn() } });
    tx.$queryRaw.mockImplementation(async (...call: unknown[]) => {
      if ((call[0] as readonly string[]).join('?').includes('"ClaimItem"')) throw new Error('connection reset');
      return [];
    });
    const { service } = makeService(tx);

    await expect(service.updateDue('tenant-1', 'case-1', 'due-1', { description: 'x' }, 'requester-1')).rejects.toThrow('connection reset');
    expect(tx.due.update).not.toHaveBeenCalled();
  });

  it.each([
    ['düşük etkili (açıklama)', { description: 'Kapalı kalem' }],
    ['yüksek etkili (tutar)', { amount: 2400 }],
    ['yüksek etkili (faiz başlangıcı)', { interestStartDate: '2024-02-01' }],
  ] as Array<[string, Record<string, unknown>]>)(
    'updateDue kapalı (iptal edilmiş) kaleme ulaşacak %s değişikliği yazımdan önce reddeder; "onaya gönder" yönlendirmesi vermez',
    async (_label, body) => {
      const tx = makeTx({
        due: { findFirst: jest.fn(async () => makeDue()), update: jest.fn() },
        claimItem: { findMany: jest.fn(async () => [makeClaim({ status: 'CANCELLED' })]), update: jest.fn() },
      });
      const { service, writerRouter } = makeService(tx);

      const error = await service.updateDue('tenant-1', 'case-1', 'due-1', body as any, 'requester-1').catch((e) => e);

      expect(error).toBeInstanceOf(DueBoundClaimItemClosedException);
      expect(error).not.toBeInstanceOf(DueChangeRequiresClaimItemApprovalException);
      expect(error.getResponse()).toMatchObject({ code: 'DUE_BOUND_CLAIM_ITEM_CLOSED', claimItemStatus: 'CANCELLED' });
      expect(tx.due.update).not.toHaveBeenCalled();
      expect(writerRouter.updateSystemClaimItem).not.toHaveBeenCalled();
    },
  );

  it('updateDue kapalı kaleme ULAŞMAYAN alanı (ana kalem işareti) yazar; kaleme dokunmaz', async () => {
    const tx = makeTx({
      due: { findFirst: jest.fn(async () => makeDue()), update: jest.fn(async () => makeDue({ isPrimary: true })) },
      claimItem: { findMany: jest.fn(async () => [makeClaim({ status: 'CANCELLED' })]), update: jest.fn() },
    });
    const { service, writerRouter } = makeService(tx);

    await service.updateDue('tenant-1', 'case-1', 'due-1', { isPrimary: true } as any, 'requester-1');

    expect(tx.due.update).toHaveBeenCalledTimes(1);
    expect(writerRouter.updateSystemClaimItem).not.toHaveBeenCalled();
  });

  it.each([
    ['createDue', (service: CaseService) => service.createDue('tenant-1', 'case-1', { type: DueType.PRINCIPAL, amount: 1000, dueDate: '2026-01-01' } as any, 'requester-1')],
    ['updateDue', (service: CaseService) => service.updateDue('tenant-1', 'case-1', 'due-1', { description: 'Yazılmamalı' }, 'requester-1')],
    ['deleteDue', (service: CaseService) => service.deleteDue('tenant-1', 'case-1', 'due-1', 'requester-1')],
  ] as Array<[string, (service: CaseService) => Promise<unknown>]>)(
    '%s dosyada mali yazma yetkisi olmayan aktörü kilit altındaki denetimde, hiçbir yazımdan önce reddeder',
    async (_label, run) => {
      const tx = makeTx({ claimItem: { create: jest.fn(), findMany: jest.fn(async () => [makeClaim({ status: 'CANCELLED' })]), update: jest.fn() } });
      const { service, writerRouter } = makeService(tx);
      writerRouter.evaluateHumanCaseFinanceWrite.mockResolvedValue({ allowed: false, reasonCode: 'OBJECT_PERMISSION_DENIED' });

      const error = await run(service).then(() => null, (e: unknown) => e);

      expect(error).toBeInstanceOf(DueWriteForbiddenException);
      expect((error as DueWriteForbiddenException).getResponse()).toEqual(expect.objectContaining({
        code: 'DUE_WRITE_FORBIDDEN',
        reasonCode: 'OBJECT_PERMISSION_DENIED',
      }));
      // Yetki, yazma transaction'ının istemcisiyle ve aktör satırları kilitlendikten SONRA değerlendirilir.
      expect(writerRouter.evaluateHumanCaseFinanceWrite).toHaveBeenCalledWith(
        { tenantId: 'tenant-1', caseId: 'case-1', actorUserId: 'requester-1' },
        tx,
      );
      expect(tx.$queryRaw.mock.invocationCallOrder[0])
        .toBeLessThan(writerRouter.evaluateHumanCaseFinanceWrite.mock.invocationCallOrder[0]);
      expect(tx.due.create).not.toHaveBeenCalled();
      expect(tx.due.update).not.toHaveBeenCalled();
      expect(tx.due.delete).not.toHaveBeenCalled();
      expect(tx.due.findFirst).not.toHaveBeenCalled();
      expect(tx.claimItem.create).not.toHaveBeenCalled();
      expect(tx.claimItem.update).not.toHaveBeenCalled();
    },
  );

  it('case-create markerıyla oluşan ClaimItemı updateDue yalnız düşük etkili alanla senkronlar', async () => {
    const tx = makeTx({
      due: {
        findFirst: jest.fn(async () => makeDue()),
        update: jest.fn(async ({ data }: any) =>
          makeDue({
            ...data,
            description: 'Açılış alacağı güncel',
          }),
        ),
      },
      claimItem: {
        findMany: jest.fn(async () => [makeClaim({ id: 'claim-opening' })]),
        update: jest.fn(async ({ data }: any) => ({ id: 'claim-opening', ...data })),
      },
    });
    const { service } = makeService(tx);
    const createTx = {
      claimItem: {
        create: jest.fn(async ({ data }: any) => ({ id: 'claim-opening', ...data })),
      },
    } as any;

    await (service as any).createClaimItemsFromDues(
      createTx, 'tenant-1', 'case-1', [makeDue()], 'requester-1',
    );
    expect(createTx.claimItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: {
          dueSync: {
            sourceDueId: 'due-1',
            mappedFrom: 'Due',
          },
        },
      }),
    });

    await service.updateDue('tenant-1', 'case-1', 'due-1', {
      description: 'Açılış alacağı güncel',
    }, 'requester-1');

    expect(tx.claimItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        metadata: { path: ['dueSync', 'sourceDueId'], equals: 'due-1' },
      },
      take: 2,
    });
    expect(tx.claimItem.update).toHaveBeenCalledWith({
      where: { id: 'claim-opening' },
      data: { description: 'Açılış alacağı güncel' },
    });
  });

  it('updateDue live marker bulunamadığında heuristic yapmadan fail-closed kalır', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => []),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await expect(service.updateDue('tenant-1', 'case-1', 'due-1', {
      amount: 1250,
      description: 'Güncel ana alacak',
      dueDate: '2026-02-01',
    }, 'requester-1')).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'DUE_BRIDGE_MARKER_MISSING',
    });

    expect(tx.claimItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        metadata: { path: ['dueSync', 'sourceDueId'], equals: 'due-1' },
      },
      take: 2,
    });
    expect(tx.claimItem.update).not.toHaveBeenCalled();
  });

  it('updateDue birden fazla live marker bulunduğunda fail-closed kalır', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => [{ id: 'claim-1' }, { id: 'claim-2' }]),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await expect(service.updateDue('tenant-1', 'case-1', 'due-1', {
      amount: 1250,
    }, 'requester-1')).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'DUE_BRIDGE_MULTIPLE_LIVE_MARKERS',
    });

    expect(tx.claimItem.update).not.toHaveBeenCalled();
  });

  /**
   * Owner kararı 18.11.2026 (K1 / K2): Due silme isteği bağlı ETKİN kalemin iptalini gerektirir → yazımdan önce ret.
   * Due yolu kalemi iptal ETMEZ; iptal kalem ucunda ve iki kişi onayıyla yapılır.
   */
  it('deleteDue etkin markerlı ClaimItem varken Due\'yu silmez ve kalemi iptal etmez (409)', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => [makeClaim()]),
        update: jest.fn(),
      },
    });
    const { service, writerRouter } = makeService(tx);

    const error = await service.deleteDue('tenant-1', 'case-1', 'due-1', 'requester-1').then(() => null, (e: unknown) => e);

    expect(error).toBeInstanceOf(DueDeleteRequiresClaimItemCancelException);
    expect((error as DueDeleteRequiresClaimItemCancelException).getResponse()).toEqual(expect.objectContaining({
      code: 'DUE_DELETE_REQUIRES_CLAIM_ITEM_CANCEL_APPROVAL',
      claimItemId: 'claim-1',
      canonicalAction: { method: 'DELETE', path: '/claim-items/claim-1' },
    }));
    expect(writerRouter.cancelSystemClaimItem).not.toHaveBeenCalled();
    expect(tx.claimItem.update).not.toHaveBeenCalled();
    expect(tx.due.delete).not.toHaveBeenCalled();
  });

  it('deleteDue kalem zaten iptal edilmişse yalnız Due\'yu siler; kaleme dokunmaz', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => [makeClaim({ status: 'CANCELLED' })]),
        update: jest.fn(),
      },
    });
    const { service, writerRouter } = makeService(tx);

    await service.deleteDue('tenant-1', 'case-1', 'due-1', 'requester-1');

    expect(tx.due.delete).toHaveBeenCalledWith({ where: { id: 'due-1' } });
    expect(writerRouter.cancelSystemClaimItem).not.toHaveBeenCalled();
    expect(tx.claimItem.update).not.toHaveBeenCalled();
  });

  it.each(['WAIVED', 'COLLECTED'])('deleteDue %s kalemde mevcut yaşam döngüsü reddini korur', async (status) => {
    const tx = makeTx({
      claimItem: { findMany: jest.fn(async () => [makeClaim({ status })]), update: jest.fn() },
    });
    const { service } = makeService(tx);

    await expect(service.deleteDue('tenant-1', 'case-1', 'due-1', 'requester-1'))
      .rejects.toMatchObject({ conflictCode: 'CLAIM_ITEM_LIFECYCLE_TRANSITION_FORBIDDEN' });
    expect(tx.due.delete).not.toHaveBeenCalled();
  });

  it('case-create markerıyla oluşan etkin ClaimItem varken deleteDue reddedilir', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => [makeClaim({ id: 'claim-opening' })]),
        update: jest.fn(async ({ data }: any) => ({ id: 'claim-opening', ...data })),
      },
    });
    const { service } = makeService(tx);
    const createTx = {
      claimItem: {
        create: jest.fn(async ({ data }: any) => ({ id: 'claim-opening', ...data })),
      },
    } as any;

    await (service as any).createClaimItemsFromDues(
      createTx, 'tenant-1', 'case-1', [makeDue()], 'requester-1',
    );
    expect(createTx.claimItem.create).toHaveBeenCalledWith({
      data: expect.objectContaining({
        metadata: {
          dueSync: {
            sourceDueId: 'due-1',
            mappedFrom: 'Due',
          },
        },
      }),
    });

    await expect(service.deleteDue('tenant-1', 'case-1', 'due-1', 'requester-1'))
      .rejects.toBeInstanceOf(DueDeleteRequiresClaimItemCancelException);

    expect(tx.claimItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        metadata: { path: ['dueSync', 'sourceDueId'], equals: 'due-1' },
      },
      take: 2,
    });
    expect(tx.claimItem.update).not.toHaveBeenCalled();
    expect(tx.due.delete).not.toHaveBeenCalled();
  });

  it('deleteDue live marker bulunamadığında Due kaydını silmeden fail-closed kalır', async () => {
    const tx = makeTx({
      claimItem: {
        findMany: jest.fn(async () => []),
        update: jest.fn(),
      },
    });
    const { service } = makeService(tx);

    await expect(
      service.deleteDue('tenant-1', 'case-1', 'due-1', 'requester-1'),
    ).rejects.toMatchObject<Partial<ClaimItemSourceIntegrityException>>({
      conflictCode: 'DUE_BRIDGE_MARKER_MISSING',
    });

    expect(tx.claimItem.findMany).toHaveBeenCalledWith({
      where: {
        tenantId: 'tenant-1',
        caseId: 'case-1',
        metadata: { path: ['dueSync', 'sourceDueId'], equals: 'due-1' },
      },
      take: 2,
    });
    expect(tx.claimItem.update).not.toHaveBeenCalled();
    expect(tx.due.delete).not.toHaveBeenCalled();
  });

  it('cross-tenant caseId ile Due/ClaimItem sync yapılamaz', async () => {
    const tx = makeTx({
      case: {
        findFirst: jest.fn(async () => null),
      },
    });
    const { service } = makeService(tx);

    await expect(
      service.createDue('tenant-other', 'case-1', {
        type: DueType.PRINCIPAL,
        description: 'Ana alacak',
        amount: 1000,
        dueDate: '2026-01-01',
      }, 'requester-1'),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.due.create).not.toHaveBeenCalled();
    expect(tx.claimItem.create).not.toHaveBeenCalled();
  });

  it('cross-tenant updateDue transition guard veya mutation yüzeyine ulaşmaz', async () => {
    const tx = makeTx({
      case: { findFirst: jest.fn(async () => null) },
      due: { findFirst: jest.fn(), update: jest.fn() },
      claimItem: { findMany: jest.fn(), update: jest.fn() },
    });
    const { service } = makeService(tx);

    await expect(
      service.updateDue(
        'tenant-other', 'case-1', 'due-1', { type: DueType.NAFAKA }, 'requester-1',
      ),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(tx.due.findFirst).not.toHaveBeenCalled();
    expect(tx.due.update).not.toHaveBeenCalled();
    expect(tx.claimItem.findMany).not.toHaveBeenCalled();
  });
});

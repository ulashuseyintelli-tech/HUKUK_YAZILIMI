import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { CaseFeeAgreementService } from '../case-fee-agreement.service';

const TENANT = 't-1';
const ACTOR = { userId: 'u-1' };

function buildApproval(eligible = true) {
  return { isApproverEligible: jest.fn().mockResolvedValue(eligible) } as any;
}

// A1A: audit mock — capability/lifecycle testleri etkilenmez, yalnız yeni audit-yazımı testleri kullanır.
function buildAudit() {
  return { log: jest.fn().mockResolvedValue(undefined), logInTransaction: jest.fn().mockResolvedValue(undefined) } as any;
}

function buildPrisma(
  over: {
    txActive?: unknown; // create: tx.findFirst (mevcut ACTIVE)
    current?: unknown; // update: tx.findFirst (hedef kayıt)
    fenceCount?: number; // update: SUPERSEDED fence count
    termCount?: number; // terminate: updateMany count
    caseClient?: unknown; // assertCaseClientInTenant
    byId?: unknown; // getById
    list?: unknown[]; // listForCaseClient
    active?: unknown; // getActiveForCaseClient
  } = {},
) {
  const tx = {
    caseFeeAgreement: {
      findFirst: jest
        .fn()
        // create akışı ilk çağrı = existingActive; update akışı ilk çağrı = current;
        // A1A: terminate akışı ilk çağrı = before-snapshot (over.current ile paylaşılır).
        .mockResolvedValueOnce(over.txActive ?? over.current ?? null),
      // A1A: terminate artık $transaction içinde tx.updateMany kullanıyor (fenceCount=update, termCount=terminate).
      updateMany: jest.fn().mockResolvedValue({ count: over.fenceCount ?? over.termCount ?? 1 }),
      create: jest.fn().mockImplementation(({ data }: any) => ({ id: 'cfa-new', ...data })),
    },
  };
  const prisma = {
    caseFeeAgreement: {
      findFirst: jest
        .fn()
        .mockResolvedValueOnce(over.byId ?? over.active ?? null),
      findMany: jest.fn().mockResolvedValue(over.list ?? []),
      updateMany: jest.fn().mockResolvedValue({ count: over.termCount ?? 1 }),
    },
    caseClient: {
      // 'caseClient' in over: explicit null (tenant-dışı senaryo) korunur; ?? null'ı
      // default {id:'cc-1'} ile yutup testi etkisiz bırakıyordu (mock kusuru).
      // A1A: caseId de eklendi (resolveCaseId audit-zenginleştirmesi için); mevcut testler bunu
      // hiç assert etmiyor, davranışları değişmez.
      findFirst: jest.fn().mockResolvedValue('caseClient' in over ? over.caseClient : { id: 'cc-1', caseId: 'case-1' }),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  return { prisma, tx };
}

const svc = (p: any, a?: any, aud?: any) => new CaseFeeAgreementService(p, a ?? buildApproval(), aud ?? buildAudit());

const FLAT = { caseClientId: 'cc-1', feeType: 'FLAT_AMOUNT', flatAmount: '2000.00' } as any;
const PCT = { caseClientId: 'cc-1', feeType: 'PERCENTAGE_OF_COLLECTION', percentageBps: 1500 } as any;

describe('CaseFeeAgreementService — create', () => {
  it('FLAT happy path → ACTIVE satır, doğru alanlar', async () => {
    const { prisma, tx } = buildPrisma();
    const r = await svc(prisma).create(TENANT, FLAT, ACTOR);
    expect(tx.caseFeeAgreement.create).toHaveBeenCalledTimes(1);
    const data = tx.caseFeeAgreement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({
      tenantId: TENANT,
      caseClientId: 'cc-1',
      feeType: 'FLAT_AMOUNT',
      feeBase: 'GROSS',
      status: 'ACTIVE',
      percentageBps: null,
      createdById: 'u-1',
    });
    expect(data.flatAmount.toString()).toBe('2000');
    expect(r.id).toBe('cfa-new');
  });

  it('PERCENTAGE happy path → percentageBps set, flatAmount null', async () => {
    const { prisma, tx } = buildPrisma();
    await svc(prisma).create(TENANT, PCT, ACTOR);
    const data = tx.caseFeeAgreement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ feeType: 'PERCENTAGE_OF_COLLECTION', percentageBps: 1500, flatAmount: null, status: 'ACTIVE' });
  });

  it('NET_OF_EXPENSE → BadRequest; transaction açılmaz', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma).create(TENANT, { ...FLAT, feeBase: 'NET_OF_EXPENSE' }, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('capability fail → Forbidden; transaction açılmaz', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma, buildApproval(false)).create(TENANT, FLAT, ACTOR)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('mevcut ACTIVE varsa → Conflict', async () => {
    const { prisma } = buildPrisma({ txActive: { id: 'cfa-old' } });
    await expect(svc(prisma).create(TENANT, FLAT, ACTOR)).rejects.toBeInstanceOf(ConflictException);
  });

  it('caseClient tenant dışı → BadRequest; transaction açılmaz', async () => {
    const { prisma } = buildPrisma({ caseClient: null });
    await expect(svc(prisma).create(TENANT, FLAT, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('FLAT flatAmount eksik → BadRequest', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma).create(TENANT, { caseClientId: 'cc-1', feeType: 'FLAT_AMOUNT' } as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('FLAT flatAmount number (string değil) → BadRequest (faithful decimal)', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma).create(TENANT, { ...FLAT, flatAmount: 2000 } as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('FLAT > 2 ondalık → BadRequest', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma).create(TENANT, { ...FLAT, flatAmount: '10.999' } as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('FLAT ≤ 0 → BadRequest', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma).create(TENANT, { ...FLAT, flatAmount: '0' } as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('FLAT + percentageBps çapraz dolu → BadRequest', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma).create(TENANT, { ...FLAT, percentageBps: 1000 } as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PERCENTAGE bps non-integer (float) → BadRequest', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma).create(TENANT, { ...PCT, percentageBps: 15.5 } as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('PERCENTAGE bps aralık dışı (0 / 10001) → BadRequest', async () => {
    const { prisma } = buildPrisma();
    await expect(svc(prisma).create(TENANT, { ...PCT, percentageBps: 0 } as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    const { prisma: p2 } = buildPrisma();
    await expect(svc(p2).create(TENANT, { ...PCT, percentageBps: 10001 } as any, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
  });

  it('A1A: audit AYNI transaction içinde actor + newValues ile yazılır (CASE_FEE_AGREEMENT_CREATE)', async () => {
    const { prisma, tx } = buildPrisma();
    const audit = buildAudit();
    await svc(prisma, undefined, audit).create(TENANT, FLAT, ACTOR);
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    const [txArg, input] = audit.logInTransaction.mock.calls[0];
    expect(txArg).toBe(tx);
    expect(input).toMatchObject({
      tenantId: TENANT,
      action: 'CASE_FEE_AGREEMENT_CREATE',
      entityType: 'CASE_FEE_AGREEMENT',
      entityId: 'cfa-new',
      userId: 'u-1',
    });
    expect(input.newValues).toMatchObject({ caseId: 'case-1', caseClientId: 'cc-1', feeType: 'FLAT_AMOUNT', status: 'ACTIVE' });
    expect(input.oldValues).toBeUndefined();
  });

  it('A1A: mevcut ACTIVE varsa (Conflict) → transaction rollback, audit YAZILMAZ', async () => {
    const { prisma } = buildPrisma({ txActive: { id: 'cfa-old' } });
    const audit = buildAudit();
    await expect(svc(prisma, undefined, audit).create(TENANT, FLAT, ACTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });
});

describe('CaseFeeAgreementService — update (versiyonlama)', () => {
  it('edit → eski SUPERSEDED + yeni ACTIVE (supersedesId, caseClientId devralınır)', async () => {
    const { prisma, tx } = buildPrisma({ current: { id: 'cfa-old', caseClientId: 'cc-9', status: 'ACTIVE' } });
    const r = await svc(prisma).update(TENANT, 'cfa-old', { feeType: 'FLAT_AMOUNT', flatAmount: '3000' } as any, ACTOR);
    // eski SUPERSEDED fence
    expect(tx.caseFeeAgreement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'SUPERSEDED' } }),
    );
    const data = tx.caseFeeAgreement.create.mock.calls[0][0].data;
    expect(data).toMatchObject({ caseClientId: 'cc-9', supersedesId: 'cfa-old', status: 'ACTIVE' });
    expect(r.id).toBe('cfa-new');
  });

  it('A1A: audit AYNI transaction içinde eski/yeni versiyon bağlamıyla yazılır (CASE_FEE_AGREEMENT_UPDATE)', async () => {
    const { prisma, tx } = buildPrisma({
      current: { id: 'cfa-old', caseClientId: 'cc-9', status: 'ACTIVE', feeType: 'FLAT_AMOUNT', flatAmount: '2000', percentageBps: null, feeBase: 'GROSS', effectiveFrom: new Date('2026-01-01'), note: 'eski not' },
    });
    const audit = buildAudit();
    await svc(prisma, undefined, audit).update(TENANT, 'cfa-old', { feeType: 'FLAT_AMOUNT', flatAmount: '3000' } as any, ACTOR);

    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    const [txArg, input] = audit.logInTransaction.mock.calls[0];
    expect(txArg).toBe(tx);
    expect(input).toMatchObject({
      tenantId: TENANT,
      action: 'CASE_FEE_AGREEMENT_UPDATE',
      entityType: 'CASE_FEE_AGREEMENT',
      entityId: 'cfa-old',
      userId: 'u-1',
    });
    expect(input.oldValues).toMatchObject({ caseId: 'case-1', status: 'ACTIVE', feeType: 'FLAT_AMOUNT', flatAmount: '2000', note: 'eski not' });
    expect(input.newValues).toMatchObject({ caseId: 'case-1', status: 'SUPERSEDED', newAgreementId: 'cfa-new' });
  });

  it('hedef ACTIVE değil → Conflict', async () => {
    const { prisma, tx } = buildPrisma({ current: { id: 'cfa-old', caseClientId: 'cc-9', status: 'SUPERSEDED' } });
    await expect(svc(prisma).update(TENANT, 'cfa-old', { feeType: 'FLAT_AMOUNT', flatAmount: '3000' } as any, ACTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(tx.caseFeeAgreement.create).not.toHaveBeenCalled();
  });

  it('A1A: hedef ACTIVE değil (Conflict) → audit YAZILMAZ', async () => {
    const { prisma } = buildPrisma({ current: { id: 'cfa-old', caseClientId: 'cc-9', status: 'SUPERSEDED' } });
    const audit = buildAudit();
    await expect(svc(prisma, undefined, audit).update(TENANT, 'cfa-old', { feeType: 'FLAT_AMOUNT', flatAmount: '3000' } as any, ACTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('kayıt yok → NotFound', async () => {
    const { prisma } = buildPrisma({ current: null });
    await expect(svc(prisma).update(TENANT, 'yok', { feeType: 'FLAT_AMOUNT', flatAmount: '3000' } as any, ACTOR)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('capability fail → Forbidden; transaction açılmaz', async () => {
    const { prisma } = buildPrisma({ current: { id: 'x', caseClientId: 'cc', status: 'ACTIVE' } });
    await expect(svc(prisma, buildApproval(false)).update(TENANT, 'x', { feeType: 'FLAT_AMOUNT', flatAmount: '3000' } as any, ACTOR)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

describe('CaseFeeAgreementService — terminate / read', () => {
  it('terminate ACTIVE → TERMINATED (updateMany count 1)', async () => {
    const { prisma, tx } = buildPrisma({ termCount: 1, byId: { id: 'x', status: 'TERMINATED' } });
    const r = await svc(prisma).terminate(TENANT, 'x', ACTOR);
    expect(tx.caseFeeAgreement.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'TERMINATED' } }),
    );
    expect(r.status).toBe('TERMINATED');
  });

  it('terminate: ACTIVE yok → Conflict', async () => {
    const { prisma } = buildPrisma({ termCount: 0 });
    await expect(svc(prisma).terminate(TENANT, 'x', ACTOR)).rejects.toBeInstanceOf(ConflictException);
  });

  it('A1A: audit AYNI transaction içinde actor + oldValues ile yazılır (CASE_FEE_AGREEMENT_TERMINATE)', async () => {
    const { prisma, tx } = buildPrisma({
      termCount: 1,
      byId: { id: 'x', status: 'TERMINATED' },
      current: { id: 'x', caseClientId: 'cc-9', status: 'ACTIVE', feeType: 'FLAT_AMOUNT', flatAmount: '2000', note: null },
    });
    const audit = buildAudit();
    await svc(prisma, undefined, audit).terminate(TENANT, 'x', ACTOR);

    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    const [txArg, input] = audit.logInTransaction.mock.calls[0];
    expect(txArg).toBe(tx);
    expect(input).toMatchObject({
      tenantId: TENANT,
      action: 'CASE_FEE_AGREEMENT_TERMINATE',
      entityType: 'CASE_FEE_AGREEMENT',
      entityId: 'x',
      userId: 'u-1',
      newValues: { caseId: 'case-1', status: 'TERMINATED' },
    });
    expect(input.oldValues).toMatchObject({ caseId: 'case-1', status: 'ACTIVE', feeType: 'FLAT_AMOUNT', flatAmount: '2000' });
  });

  it('A1A: ACTIVE yok (Conflict) → audit YAZILMAZ', async () => {
    const { prisma } = buildPrisma({ termCount: 0 });
    const audit = buildAudit();
    await expect(svc(prisma, undefined, audit).terminate(TENANT, 'x', ACTOR)).rejects.toBeInstanceOf(ConflictException);
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('getById yoksa → NotFound', async () => {
    const { prisma } = buildPrisma({ byId: null });
    await expect(svc(prisma).getById(TENANT, 'yok')).rejects.toBeInstanceOf(NotFoundException);
  });

  it('getActiveForCaseClient → tenant+caseClient+ACTIVE filtresi', async () => {
    const { prisma } = buildPrisma({ active: { id: 'a', status: 'ACTIVE' } });
    await svc(prisma).getActiveForCaseClient(TENANT, 'cc-1');
    expect(prisma.caseFeeAgreement.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { tenantId: TENANT, caseClientId: 'cc-1', status: 'ACTIVE' } }),
    );
  });
});

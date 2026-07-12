/**
 * PR-EA-4 — Guarded Write Path unit tests.
 *
 * `WorkflowEngine.createEnforcementAction()` artık:
 * - tenantId zorunlu input alanı (üst çağrı zincirinden taşınır, caseId'den yeniden tahmin edilmez)
 * - Case composite doğrulaması (id + tenantId birlikte)
 * - caseDebtorId verildiyse composite doğrulama (id + caseId, tenant transitive)
 * - tüm doğrulama + duplicate-guard + create tek `$transaction` içinde
 *
 * Otomatik caseDebtor seçimi/tahmini YOK — bu dosya bunu da doğrular.
 */

import { NotFoundException } from '@nestjs/common';
import { EnforcementStatus, EnforcementType } from '@prisma/client';
import { WorkflowEngine } from '../workflow-engine.service';

interface BuildOpts {
  caseRow?: any;
  caseDebtorRow?: any;
  openActionRow?: any;
}

function build(opts: BuildOpts = {}) {
  const { caseRow = { id: 'case1' }, caseDebtorRow, openActionRow = null } = opts;
  const prisma: any = {
    case: {
      findFirst: jest.fn().mockResolvedValue(caseRow),
    },
    caseDebtor: {
      findFirst: jest.fn().mockResolvedValue(caseDebtorRow),
    },
    enforcementAction: {
      findFirst: jest.fn().mockResolvedValue(openActionRow),
      create: jest.fn().mockResolvedValue({ id: 'EA1' }),
    },
  };
  prisma.$transaction = jest.fn((cb: any) => cb(prisma));
  const svc = new WorkflowEngine(prisma as any, {} as any, {} as any);
  return { svc, prisma };
}

describe('PR-EA-4 Guarded Write Path — tenant validation', () => {
  it('doğru tenant + doğru Case → create succeeds', async () => {
    const { svc, prisma } = build({ caseRow: { id: 'case1' } });
    await svc.createEnforcementAction({ tenantId: 'tenant1', caseId: 'case1', type: EnforcementType.BANK_INQUIRY });
    expect(prisma.case.findFirst).toHaveBeenCalledWith({
      where: { id: 'case1', tenantId: 'tenant1' },
      select: { id: true },
    });
    expect(prisma.enforcementAction.create).toHaveBeenCalledTimes(1);
  });

  it('başka tenant\'a ait Case → rejected (composite where hiç eşleşmez)', async () => {
    // findFirst({ where: { id, tenantId } }) gerçek Prisma'da cross-tenant satırla eşleşmez → null.
    const { svc, prisma } = build({ caseRow: null });
    await expect(
      svc.createEnforcementAction({ tenantId: 'tenant-wrong', caseId: 'case1', type: EnforcementType.BANK_INQUIRY }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
  });

  it('mevcut olmayan Case → rejected', async () => {
    const { svc, prisma } = build({ caseRow: null });
    await expect(
      svc.createEnforcementAction({ tenantId: 'tenant1', caseId: 'no-such-case', type: EnforcementType.BANK_INQUIRY }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
  });

  it('created row tenantId doğru şekilde populate edilir', async () => {
    const { svc, prisma } = build();
    await svc.createEnforcementAction({ tenantId: 'tenant-xyz', caseId: 'case1', type: EnforcementType.BANK_INQUIRY });
    const data = prisma.enforcementAction.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe('tenant-xyz');
  });
});

describe('PR-EA-4 Guarded Write Path — CaseDebtor validation', () => {
  it('same tenant + same CaseDebtor (aynı caseId\'ye ait) → create succeeds', async () => {
    const { svc, prisma } = build({ caseDebtorRow: { id: 'cd1' } });
    await svc.createEnforcementAction({
      tenantId: 'tenant1',
      caseId: 'case1',
      caseDebtorId: 'cd1',
      type: EnforcementType.BANK_INQUIRY,
    });
    expect(prisma.caseDebtor.findFirst).toHaveBeenCalledWith({
      where: { id: 'cd1', caseId: 'case1' },
      select: { id: true },
    });
    const data = prisma.enforcementAction.create.mock.calls[0][0].data;
    expect(data.caseDebtorId).toBe('cd1');
  });

  it('başka Case\'e ait CaseDebtor → rejected (composite where eşleşmez)', async () => {
    const { svc, prisma } = build({ caseDebtorRow: null });
    await expect(
      svc.createEnforcementAction({
        tenantId: 'tenant1',
        caseId: 'case1',
        caseDebtorId: 'cd-from-other-case',
        type: EnforcementType.BANK_INQUIRY,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
  });

  it('başka tenanta ait CaseDebtor → rejected (Case doğrulaması zaten tenantı sağlar, CaseDebtor caseId eşleşmez)', async () => {
    const { svc } = build({ caseDebtorRow: null });
    await expect(
      svc.createEnforcementAction({
        tenantId: 'tenant1',
        caseId: 'case1',
        caseDebtorId: 'cd-other-tenant',
        type: EnforcementType.BANK_INQUIRY,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('mevcut olmayan CaseDebtor → rejected', async () => {
    const { svc } = build({ caseDebtorRow: null });
    await expect(
      svc.createEnforcementAction({
        tenantId: 'tenant1',
        caseId: 'case1',
        caseDebtorId: 'no-such-debtor',
        type: EnforcementType.BANK_INQUIRY,
      }),
    ).rejects.toThrow(NotFoundException);
  });

  it('caseDebtorId omitted → null-compatible create succeeds, caseDebtor.findFirst hiç çağrılmaz', async () => {
    const { svc, prisma } = build();
    await svc.createEnforcementAction({ tenantId: 'tenant1', caseId: 'case1', type: EnforcementType.BANK_INQUIRY });
    expect(prisma.caseDebtor.findFirst).not.toHaveBeenCalled();
    const data = prisma.enforcementAction.create.mock.calls[0][0].data;
    expect(data.caseDebtorId).toBeNull();
  });

  it('otomatik caseDebtor seçimi/tahmini YOK — caseDebtorId verilmezse hiçbir zaman tahmin edilmez', async () => {
    // Case'in tek bir CaseDebtor'u olsa bile (mock'ta gösterilmiyor çünkü sorgulanmıyor bile)
    // input caseDebtorId taşımıyorsa create'e giden değer daima null'dur.
    const { svc, prisma } = build();
    await svc.createEnforcementAction({ tenantId: 'tenant1', caseId: 'case1', type: EnforcementType.SALARY_SEIZURE });
    expect(prisma.caseDebtor.findFirst).not.toHaveBeenCalled();
    expect(prisma.enforcementAction.create.mock.calls[0][0].data.caseDebtorId).toBeNull();
  });
});

describe('PR-EA-4 Guarded Write Path — duplicate guard (tenant-scoped, semantik değişmedi)', () => {
  it('farklı tenant, aynı-benzer caseId/type kombinasyonu → cross-tenant collision OLMAZ (findFirst tenantId ile filtrelenir)', async () => {
    const { svc, prisma } = build({ openActionRow: null });
    await svc.createEnforcementAction({ tenantId: 'tenant-a', caseId: 'case1', type: EnforcementType.BANK_INQUIRY });
    const where = prisma.enforcementAction.findFirst.mock.calls[0][0].where;
    expect(where.tenantId).toBe('tenant-a');
  });

  it('caseDebtor-specific davranış frozen semantiği izler: guard dosya-seviyesidir, caseDebtorId filtreye eklenmez', async () => {
    const { svc, prisma } = build({ caseDebtorRow: { id: 'cd1' }, openActionRow: null });
    await svc.createEnforcementAction({
      tenantId: 'tenant1',
      caseId: 'case1',
      caseDebtorId: 'cd1',
      type: EnforcementType.BANK_INQUIRY,
    });
    const where = prisma.enforcementAction.findFirst.mock.calls[0][0].where;
    expect(where).not.toHaveProperty('caseDebtorId');
  });

  it('cancelled/failed sonrası meşru tekrar davranışı korunur (mevcut RFA-007 testinde de kapsanır — burada tenant-scoped hali)', async () => {
    const { svc, prisma } = build({ openActionRow: null });
    await svc.createEnforcementAction({ tenantId: 'tenant1', caseId: 'case1', type: EnforcementType.BANK_INQUIRY });
    expect(prisma.enforcementAction.create).toHaveBeenCalledTimes(1);
  });
});

describe('PR-EA-4 Guarded Write Path — transaction/integrity', () => {
  it('Case validation failure → partial row oluşmaz (create çağrılmaz)', async () => {
    const { svc, prisma } = build({ caseRow: null });
    await expect(
      svc.createEnforcementAction({ tenantId: 'tenant1', caseId: 'case1', type: EnforcementType.BANK_INQUIRY }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
    expect(prisma.enforcementAction.findFirst).not.toHaveBeenCalled();
  });

  it('CaseDebtor validation failure → partial row oluşmaz (create çağrılmaz, duplicate-guarda hiç gelinmez)', async () => {
    const { svc, prisma } = build({ caseDebtorRow: null });
    await expect(
      svc.createEnforcementAction({
        tenantId: 'tenant1',
        caseId: 'case1',
        caseDebtorId: 'missing',
        type: EnforcementType.BANK_INQUIRY,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
    expect(prisma.enforcementAction.findFirst).not.toHaveBeenCalled();
  });

  it('duplicate failure (açık action var) → partial row oluşmaz', async () => {
    const { svc, prisma } = build({ openActionRow: { id: 'OPEN1', status: EnforcementStatus.PENDING } });
    await svc.createEnforcementAction({ tenantId: 'tenant1', caseId: 'case1', type: EnforcementType.BANK_INQUIRY });
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
  });

  it('created row tenant/case/caseDebtor invariant\'ını korur', async () => {
    const { svc, prisma } = build({ caseDebtorRow: { id: 'cd1' } });
    await svc.createEnforcementAction({
      tenantId: 'tenant-inv',
      caseId: 'case-inv',
      caseDebtorId: 'cd1',
      type: EnforcementType.BANK_INQUIRY,
    });
    const data = prisma.enforcementAction.create.mock.calls[0][0].data;
    expect(data.tenantId).toBe('tenant-inv');
    expect(data.caseId).toBe('case-inv');
    expect(data.caseDebtorId).toBe('cd1');
  });

  it('tüm işlemler $transaction callback\'i içinde yürütülür', async () => {
    const { svc, prisma } = build();
    await svc.createEnforcementAction({ tenantId: 'tenant1', caseId: 'case1', type: EnforcementType.BANK_INQUIRY });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });
});

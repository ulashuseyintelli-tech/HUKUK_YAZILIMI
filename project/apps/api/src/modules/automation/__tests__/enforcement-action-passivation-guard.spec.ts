/**
 * LRV-03A / DBP-P2-SEC-P03A — CaseDebtor passivation guard unit testleri.
 *
 * DBP-07 §11 "Passivation Guard Is Universal" invariant'ı: pasifleştirilmiş (PASSIVE) bir
 * CaseDebtor yeni bir enforcement action hedefi olamaz. `CaseDebtorLifecycleGuardService`
 * bu invariant'ı 15+ başka write-path'te zaten uyguluyordu; `WorkflowEngine.createEnforcementAction()`
 * tek istisnaydı (LRV-03). Bu dosya yalnız `caseDebtorId` VERİLDİĞİNDE devreye giren yeni kontrolü
 * kilitler — bugünkü tek üretici (`executeRule()`) caseDebtorId'yi hiçbir zaman vermediği için bu
 * dal bugünkü davranışı DEĞİŞTİRMEZ (bkz. "caseDebtorId omitted" testleri).
 *
 * Case-seviyesi "tüm CaseDebtor PASSIVE ise otomasyon durmalı mı" sorusu (LRV-03B) bu dosyanın
 * KAPSAMI DIŞINDADIR — ayrı bir owner-governed program (bkz. DBP-P2-SEC-P03 analiz raporu).
 */

import { BadRequestException, NotFoundException } from '@nestjs/common';
import { CaseDebtorLifecycleStatus, EnforcementType } from '@prisma/client';
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

describe('LRV-03A — CaseDebtor passivation guard', () => {
  it('caseDebtorId verilmiş + lifecycleStatus=PASSIVE → BadRequestException, satır oluşmaz', async () => {
    const { svc, prisma } = build({
      caseDebtorRow: { id: 'cd1', lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE },
    });
    await expect(
      svc.createEnforcementAction({
        tenantId: 'tenant1',
        caseId: 'case1',
        caseDebtorId: 'cd1',
        type: EnforcementType.SALARY_SEIZURE,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
    // Duplicate-guard'a (RFA-007) hiç gelinmez — lifecycle reddi daha erken durur.
    expect(prisma.enforcementAction.findFirst).not.toHaveBeenCalled();
  });

  it('caseDebtorId verilmiş + lifecycleStatus=ACTIVE → başarılı (regresyon)', async () => {
    const { svc, prisma } = build({
      caseDebtorRow: { id: 'cd1', lifecycleStatus: CaseDebtorLifecycleStatus.ACTIVE },
    });
    await svc.createEnforcementAction({
      tenantId: 'tenant1',
      caseId: 'case1',
      caseDebtorId: 'cd1',
      type: EnforcementType.SALARY_SEIZURE,
    });
    expect(prisma.enforcementAction.create).toHaveBeenCalledTimes(1);
  });

  it('caseDebtorId verilmemiş (bugünkü tek üretim yolu) → guard hiç tetiklenmez, dal ölü kod kalır', async () => {
    const { svc, prisma } = build();
    await svc.createEnforcementAction({
      tenantId: 'tenant1',
      caseId: 'case1',
      type: EnforcementType.BANK_INQUIRY,
    });
    expect(prisma.caseDebtor.findFirst).not.toHaveBeenCalled();
    expect(prisma.enforcementAction.create).toHaveBeenCalledTimes(1);
  });

  it('caseDebtorId bulunamazsa (mevcut davranış) → NotFoundException korunur, lifecycle kontrolüne hiç gelinmez', async () => {
    const { svc, prisma } = build({ caseDebtorRow: null });
    await expect(
      svc.createEnforcementAction({
        tenantId: 'tenant1',
        caseId: 'case1',
        caseDebtorId: 'no-such-debtor',
        type: EnforcementType.BANK_INQUIRY,
      }),
    ).rejects.toThrow(NotFoundException);
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
  });

  it('caseDebtor lookup artık lifecycleStatus alanını da select eder', async () => {
    const { svc, prisma } = build({
      caseDebtorRow: { id: 'cd1', lifecycleStatus: CaseDebtorLifecycleStatus.ACTIVE },
    });
    await svc.createEnforcementAction({
      tenantId: 'tenant1',
      caseId: 'case1',
      caseDebtorId: 'cd1',
      type: EnforcementType.BANK_INQUIRY,
    });
    expect(prisma.caseDebtor.findFirst).toHaveBeenCalledWith({
      where: { id: 'cd1', caseId: 'case1' },
      select: { id: true, lifecycleStatus: true },
    });
  });

  it('lifecycle reddi $transaction callback\'i içinde kalır (partial write yok)', async () => {
    const { svc, prisma } = build({
      caseDebtorRow: { id: 'cd1', lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE },
    });
    await expect(
      svc.createEnforcementAction({
        tenantId: 'tenant1',
        caseId: 'case1',
        caseDebtorId: 'cd1',
        type: EnforcementType.SALARY_SEIZURE,
      }),
    ).rejects.toThrow(BadRequestException);
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(prisma.enforcementAction.create).not.toHaveBeenCalled();
  });
});

/**
 * P1-I13 (R02-B, owner "NO-NEW-WORK-FOR-PASSIVE"): passive CaseDebtor için
 * checkIhbarnameDeadlines/checkExternalCaseFollowups yeni operasyonel iş (task) üretmez;
 * ACT-08 (isPassiveByCaseAndDebtor, throw etmeyen) guard'ı diğer kayıtların işlenmesini
 * durdurmadan sessizce atlar. Mevcut task'lara dokunmaz, batch'i abort etmez.
 */

jest.mock('@nestjs/schedule', () => ({
  Cron: () => () => undefined,
  CronExpression: {
    EVERY_DAY_AT_9AM: '0 9 * * *',
    EVERY_DAY_AT_10AM: '0 10 * * *',
    EVERY_DAY_AT_11AM: '0 11 * * *',
    EVERY_DAY_AT_MIDNIGHT: '0 0 * * *',
    EVERY_HOUR: '0 * * * *',
  },
}), { virtual: true });

import { CaseDebtorLifecycleStatus } from '@prisma/client';
import { SchedulerService } from '../scheduler.service';
import { CaseDebtorLifecycleGuardService } from '../../case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service';

describe('P1-I13 (R02-B) SchedulerService — passive CaseDebtor için yeni iş üretimi durur', () => {
  const buildCaseDebtor = (overrides: Record<string, unknown> = {}) => ({
    caseId: 'case-1',
    debtorId: 'debtor-1',
    case: { tenantId: 'tenant-1' },
    lifecycleStatus: CaseDebtorLifecycleStatus.ACTIVE,
    ...overrides,
  });

  const thirdParty = (overrides: Record<string, unknown> = {}) => ({
    name: 'Banka A.Ş.',
    caseDebtor: {
      debtorId: 'debtor-1',
      debtor: { name: 'Borçlu Adı' },
      case: { id: 'case-1', fileNumber: '2026/1', tenantId: 'tenant-1' },
    },
    ...overrides,
  });

  const externalCase = (overrides: Record<string, unknown> = {}) => ({
    externalCaseNo: 'EC-1',
    externalOffice: 'İstanbul 5. İcra',
    caseDebtor: {
      debtorId: 'debtor-1',
      case: { id: 'case-1', fileNumber: '2026/1', tenantId: 'tenant-1' },
    },
    ...overrides,
  });

  const build = (opts: { caseDebtor?: any } = {}) => {
    const caseDebtorFixture = opts.caseDebtor === undefined ? buildCaseDebtor() : opts.caseDebtor;

    const prisma: any = {
      caseDebtor: {
        findFirst: jest.fn().mockImplementation(async ({ where }: any) => {
          if (!caseDebtorFixture) return null;
          if (where.caseId && caseDebtorFixture.caseId !== where.caseId) return null;
          if (where.debtorId && caseDebtorFixture.debtorId !== where.debtorId) return null;
          if (where.case?.tenantId && caseDebtorFixture.case?.tenantId !== where.case.tenantId) return null;
          return {
            id: 'cd-1',
            caseId: caseDebtorFixture.caseId,
            debtorId: caseDebtorFixture.debtorId,
            lifecycleStatus: caseDebtorFixture.lifecycleStatus,
          };
        }),
      },
      task: {
        findFirst: jest.fn().mockResolvedValue(null),
        create: jest.fn().mockResolvedValue({}),
      },
      thirdParty: { findMany: jest.fn() },
      externalCase: { findMany: jest.fn() },
    };

    const metrics: any = { record: jest.fn() };
    const tebligatService: any = {};
    const errorReporter: any = { report: jest.fn() };
    const guard = new CaseDebtorLifecycleGuardService(prisma);

    const svc = new SchedulerService(prisma, metrics, tebligatService, errorReporter, guard);
    jest.spyOn((svc as any).logger, 'log').mockImplementation(() => undefined);
    jest.spyOn((svc as any).logger, 'warn').mockImplementation(() => undefined);
    jest.spyOn((svc as any).logger, 'error').mockImplementation(() => undefined);

    return { svc, prisma, caseDebtorFixture };
  };

  // --- createIhbarnameReminderTask (doğrudan çağrı) ---

  it('1) ACTIVE CaseDebtor için ihbarname hatırlatma task\'ı oluşturulur', async () => {
    const { svc, prisma } = build();

    await (svc as any).createIhbarnameReminderTask(thirdParty(), '89/2');

    expect(prisma.task.create).toHaveBeenCalledTimes(1);
  });

  it('2) PASSIVE CaseDebtor için ihbarname hatırlatma task\'ı oluşturulmaz; dedup kontrolüne (task.findFirst) dahi ulaşılmaz', async () => {
    const { svc, prisma } = build({ caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }) });

    await (svc as any).createIhbarnameReminderTask(thirdParty(), '89/2');

    expect(prisma.task.findFirst).not.toHaveBeenCalled();
    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('3) CaseDebtor tamamen bulunamazsa fail-closed davranır: task oluşturulmaz (ACT-08 not-found=pasif-eşdeğeri)', async () => {
    const { svc, prisma } = build({ caseDebtor: null });

    await (svc as any).createIhbarnameReminderTask(thirdParty(), '89/2');

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('4) cross-tenant CaseDebtor için task oluşturulmaz (tenant sınırı ihlal edilmez)', async () => {
    const { svc, prisma } = build({ caseDebtor: buildCaseDebtor({ case: { tenantId: 'tenant-2' } }) });

    await (svc as any).createIhbarnameReminderTask(thirdParty(), '89/2');

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('5) guard her çağrıda CANLI sorgu yapar: PASSIVE iken atlanır, REAKTIVE EDİLİNCE aynı kayıt için task oluşturulur (stale snapshot YOK)', async () => {
    const { svc, prisma, caseDebtorFixture } = build({ caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }) });

    await (svc as any).createIhbarnameReminderTask(thirdParty(), '89/2');
    expect(prisma.task.create).not.toHaveBeenCalled();

    caseDebtorFixture.lifecycleStatus = CaseDebtorLifecycleStatus.ACTIVE;

    await (svc as any).createIhbarnameReminderTask(thirdParty(), '89/2');
    expect(prisma.task.create).toHaveBeenCalledTimes(1);
  });

  it('6) ACTIVE CaseDebtor için mevcut PENDING task zaten varsa yine de yeni task oluşturulmaz (guard eklenmesi dedup\'ı bozmadı)', async () => {
    const { svc, prisma } = build();
    prisma.task.findFirst.mockResolvedValueOnce({ id: 'existing-task' });

    await (svc as any).createIhbarnameReminderTask(thirdParty(), '89/2');

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  // --- createExternalCaseFollowupTask (doğrudan çağrı) ---

  it('7) ACTIVE CaseDebtor için dış dosya takip task\'ı oluşturulur', async () => {
    const { svc, prisma } = build();

    await (svc as any).createExternalCaseFollowupTask(externalCase());

    expect(prisma.task.create).toHaveBeenCalledTimes(1);
  });

  it('8) PASSIVE CaseDebtor için dış dosya takip task\'ı oluşturulmaz', async () => {
    const { svc, prisma } = build({ caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }) });

    await (svc as any).createExternalCaseFollowupTask(externalCase());

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  it('8b) ACTIVE CaseDebtor için mevcut PENDING dış dosya takip task\'ı zaten varsa yine de yeni task oluşturulmaz (guard eklenmesi dedup\'ı bozmadı)', async () => {
    const { svc, prisma } = build();
    prisma.task.findFirst.mockResolvedValueOnce({ id: 'existing-external-task' });

    await (svc as any).createExternalCaseFollowupTask(externalCase());

    expect(prisma.task.create).not.toHaveBeenCalled();
  });

  // --- Cron giriş noktası: batch devamlılığı ---

  it('9) checkIhbarnameDeadlines(): pasif kayıt atlanırken AYNI batch\'teki aktif kayıt işlenmeye devam eder (abort yok)', async () => {
    const { svc, prisma } = build();
    const passiveTp = thirdParty({ name: 'Pasif Üçüncü Şahıs', caseDebtor: { ...thirdParty().caseDebtor, debtorId: 'debtor-passive' } });
    const activeTp = thirdParty({ name: 'Aktif Üçüncü Şahıs' });

    prisma.caseDebtor.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.debtorId === 'debtor-passive') {
        return { id: 'cd-passive', caseId: 'case-1', debtorId: 'debtor-passive', lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE };
      }
      return { id: 'cd-1', caseId: 'case-1', debtorId: 'debtor-1', lifecycleStatus: CaseDebtorLifecycleStatus.ACTIVE };
    });
    prisma.thirdParty.findMany
      .mockResolvedValueOnce([passiveTp, activeTp])
      .mockResolvedValueOnce([]);

    await svc.checkIhbarnameDeadlines();

    expect(prisma.task.create).toHaveBeenCalledTimes(1);
  });

  it('10) checkExternalCaseFollowups(): pasif kayıt atlanırken AYNI batch\'teki aktif kayıt işlenmeye devam eder (abort yok)', async () => {
    const { svc, prisma } = build();
    const passiveEc = externalCase({ externalCaseNo: 'EC-PASSIVE', caseDebtor: { ...externalCase().caseDebtor, debtorId: 'debtor-passive' } });
    const activeEc = externalCase({ externalCaseNo: 'EC-ACTIVE' });

    prisma.caseDebtor.findFirst.mockImplementation(async ({ where }: any) => {
      if (where.debtorId === 'debtor-passive') {
        return { id: 'cd-passive', caseId: 'case-1', debtorId: 'debtor-passive', lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE };
      }
      return { id: 'cd-1', caseId: 'case-1', debtorId: 'debtor-1', lifecycleStatus: CaseDebtorLifecycleStatus.ACTIVE };
    });
    prisma.externalCase.findMany.mockResolvedValueOnce([passiveEc, activeEc]);

    await svc.checkExternalCaseFollowups();

    expect(prisma.task.create).toHaveBeenCalledTimes(1);
  });

  // --- Yan etki yokluğu + idempotency + tutarlılık ---

  it('11) PASSIVE atlanması sırasında task.update/delete gibi tanımsız hiçbir delege çağrılmaz (mevcut task\'lar dokunulmadan kalır)', async () => {
    const { svc } = build({ caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }) });

    await expect((svc as any).createIhbarnameReminderTask(thirdParty(), '89/2')).resolves.toBeUndefined();
    await expect((svc as any).createExternalCaseFollowupTask(externalCase())).resolves.toBeUndefined();
  });

  it('12) aynı ACTIVE kayıt için tekrarlı (iki ayrı cron tick) çağrı idempotent kalır: task.create yalnız bir kez tetiklenir', async () => {
    const { svc, prisma } = build();
    prisma.task.findFirst
      .mockResolvedValueOnce(null) // 1. tick: henüz yok
      .mockResolvedValueOnce({ id: 'created-on-first-tick' }); // 2. tick: artık var

    await (svc as any).createIhbarnameReminderTask(thirdParty(), '89/2');
    await (svc as any).createIhbarnameReminderTask(thirdParty(), '89/2');

    expect(prisma.task.create).toHaveBeenCalledTimes(1);
  });

  it('13) doğrudan private metod çağrısı ile tam cron giriş noktası (checkIhbarnameDeadlines) PASSIVE için AYNI sonucu verir', async () => {
    const direct = build({ caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }) });
    await (direct.svc as any).createIhbarnameReminderTask(thirdParty(), '89/2');
    expect(direct.prisma.task.create).not.toHaveBeenCalled();

    const viaCron = build({ caseDebtor: buildCaseDebtor({ lifecycleStatus: CaseDebtorLifecycleStatus.PASSIVE }) });
    viaCron.prisma.thirdParty.findMany
      .mockResolvedValueOnce([thirdParty()])
      .mockResolvedValueOnce([]);

    await viaCron.svc.checkIhbarnameDeadlines();
    expect(viaCron.prisma.task.create).not.toHaveBeenCalled();
  });
});

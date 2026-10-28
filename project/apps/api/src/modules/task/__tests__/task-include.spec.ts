/**
 * PR-2: GET /tasks artık müvekkili de döndürmeli (operasyonel görevlerde "Müvekkile git"
 * linki + müvekkil adı için). Bu test include kontratını ve tenant-scope'u korur.
 *
 * F01-A (OFP-01): sunucu taraflı süzgeç + sınırlı sayfalama + `meta.summary`. Doğrular:
 * (1) assigneeId süzgeci hem listeye hem sayaç kapsamına (groupBy where) uygulanır;
 * (2) status / taskCategory süzgeci yalnız listeye uygulanır, sayaç kapsamına DEĞİL;
 * (3) sıralama `id` ile kesinleştirilir, skip/take page/limit'ten türer, varsayılan 1/20;
 * (4) summary gruplardan türer; iptal ve tamamlanmış görev operationalOpen'a girmez.
 */

import { TaskService } from '../task.service';

const buildPrisma = (groups: unknown[] = []) => ({
  task: {
    findMany: jest.fn().mockResolvedValue([]),
    count: jest.fn().mockResolvedValue(0),
    groupBy: jest.fn().mockResolvedValue(groups),
  },
});

describe('TaskService.findAll include kontratı', () => {
  it('client include + tenantId where ile sorgular', async () => {
    const prisma = buildPrisma();
    const svc = new TaskService(prisma as any);

    await svc.findAll('t1');

    expect(prisma.task.findMany).toHaveBeenCalledTimes(1);
    const arg = prisma.task.findMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe('t1'); // tenant izolasyonu
    expect(arg.include.client).toBeDefined(); // müvekkil bilgisi (görev→müvekkil bağı)
    expect(arg.include.client.select).toMatchObject({
      id: true,
      displayName: true,
      companyName: true,
    });
  });

  it('status filtresi where.status olarak geçer', async () => {
    const prisma = buildPrisma();
    const svc = new TaskService(prisma as any);

    await svc.findAll('t1', { status: 'PENDING' });

    expect(prisma.task.findMany.mock.calls[0][0].where.status).toBe('PENDING');
  });
});

describe('TaskService.findAll — F01-A süzgeç / sayfalama / sayaç kapsamı', () => {
  it('varsayılan: page 1, limit 20, sıralama id ile kesin; sayaç sorgusu tenant kapsamında', async () => {
    const prisma = buildPrisma();
    const svc = new TaskService(prisma as any);

    const result = await svc.findAll('t1');

    const list = prisma.task.findMany.mock.calls[0][0];
    expect(list.skip).toBe(0);
    expect(list.take).toBe(20);
    expect(list.orderBy).toEqual([{ priority: 'desc' }, { dueDate: 'asc' }, { id: 'asc' }]);
    expect(prisma.task.groupBy).toHaveBeenCalledTimes(1);
    const grouped = prisma.task.groupBy.mock.calls[0][0];
    expect(grouped.by).toEqual(['status', 'taskCategory']);
    expect(grouped.where.tenantId).toBe('t1');
    expect(grouped.where.OR).toEqual([{ caseId: null }, { case: { tenantId: 't1' } }]);
    expect(result.meta).toEqual({
      total: 0,
      page: 1,
      limit: 20,
      totalPages: 0,
      summary: { pending: 0, inProgress: 0, operationalOpen: 0 },
    });
  });

  it('page/limit → skip/take; totalPages toplamdan türer', async () => {
    const prisma = buildPrisma();
    prisma.task.count.mockResolvedValue(27);
    const svc = new TaskService(prisma as any);

    const result = await svc.findAll('t1', { page: 3, limit: 10 });

    const list = prisma.task.findMany.mock.calls[0][0];
    expect(list.skip).toBe(20);
    expect(list.take).toBe(10);
    expect(result.meta).toMatchObject({ total: 27, page: 3, limit: 10, totalPages: 3 });
  });

  it('assigneeId süzgeci listeye VE sayaç kapsamına uygulanır', async () => {
    const prisma = buildPrisma();
    const svc = new TaskService(prisma as any);

    await svc.findAll('t1', { assigneeId: 'u-1' });

    expect(prisma.task.findMany.mock.calls[0][0].where.assigneeId).toBe('u-1');
    expect(prisma.task.count.mock.calls[0][0].where.assigneeId).toBe('u-1');
    expect(prisma.task.groupBy.mock.calls[0][0].where.assigneeId).toBe('u-1');
  });

  it('status + taskCategory süzgeci yalnız listeye uygulanır; sayaç kapsamı değişmez', async () => {
    const prisma = buildPrisma();
    const svc = new TaskService(prisma as any);

    await svc.findAll('t1', { status: 'COMPLETED', taskCategory: 'OPERATIONAL_COMPLETENESS' });

    const list = prisma.task.findMany.mock.calls[0][0].where;
    expect(list.status).toBe('COMPLETED');
    expect(list.taskCategory).toBe('OPERATIONAL_COMPLETENESS');
    expect(prisma.task.count.mock.calls[0][0].where).toMatchObject({
      status: 'COMPLETED',
      taskCategory: 'OPERATIONAL_COMPLETENESS',
    });
    const grouped = prisma.task.groupBy.mock.calls[0][0].where;
    expect('status' in grouped).toBe(false);
    expect('taskCategory' in grouped).toBe(false);
  });

  it('summary gruplardan türer: iptal ve tamamlanmış görev operationalOpen sayılmaz', async () => {
    const prisma = buildPrisma([
      { status: 'PENDING', taskCategory: 'LEGAL_WORKFLOW', _count: { _all: 4 } },
      { status: 'PENDING', taskCategory: 'OPERATIONAL_COMPLETENESS', _count: { _all: 3 } },
      { status: 'IN_PROGRESS', taskCategory: 'OPERATIONAL_COMPLETENESS', _count: { _all: 2 } },
      { status: 'IN_PROGRESS', taskCategory: 'LEGAL_WORKFLOW', _count: { _all: 5 } },
      { status: 'COMPLETED', taskCategory: 'OPERATIONAL_COMPLETENESS', _count: { _all: 6 } },
      { status: 'CANCELLED', taskCategory: 'OPERATIONAL_COMPLETENESS', _count: { _all: 7 } },
    ]);
    const svc = new TaskService(prisma as any);

    const result = await svc.findAll('t1');

    expect(result.meta.summary).toEqual({ pending: 7, inProgress: 7, operationalOpen: 5 });
  });
});

/**
 * PR-2: GET /tasks artık müvekkili de döndürmeli (operasyonel görevlerde "Müvekkile git"
 * linki + müvekkil adı için). Bu test include kontratını ve tenant-scope'u korur.
 */

import { TaskService } from '../task.service';

describe('TaskService.findAll include kontratı', () => {
  it('client include + tenantId where ile sorgular', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = new TaskService({ task: { findMany, count } } as any);

    await svc.findAll('t1');

    expect(findMany).toHaveBeenCalledTimes(1);
    const arg = findMany.mock.calls[0][0];
    expect(arg.where.tenantId).toBe('t1'); // tenant izolasyonu
    expect(arg.include.client).toBeDefined(); // müvekkil bilgisi (görev→müvekkil bağı)
    expect(arg.include.client.select).toMatchObject({
      id: true,
      displayName: true,
      companyName: true,
    });
  });

  it('status filtresi where.status olarak geçer', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const count = jest.fn().mockResolvedValue(0);
    const svc = new TaskService({ task: { findMany, count } } as any);

    await svc.findAll('t1', { status: 'PENDING' });

    expect(findMany.mock.calls[0][0].where.status).toBe('PENDING');
  });
});

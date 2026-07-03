/**
 * CS4 — findAll() "Arşiv dahil" (includeArchived) filtresi.
 *
 * Önceki durum: checkbox uçtan uca no-op'tu — FE api.ts hiç query'e eklemiyordu, controller
 * @Query("includeArchived") almıyordu, burada isArchived hiç filtrelenmiyordu (arşivli dosyalar
 * her zaman listede kalıyordu, checkbox'un durumu ne olursa olsun).
 * Fix: includeArchived yoksa/false ise isArchived=false dosyalar hariç tutulur; true ise hepsi gösterilir.
 */
import { CaseService } from '../case.service';

function setup() {
  const stub = {} as any;
  const service = new CaseService(stub, stub, stub, stub, stub, stub, stub, stub, stub, stub);
  const findMany = jest.fn().mockResolvedValue([]);
  const count = jest.fn().mockResolvedValue(0);
  (service as any).prisma = { case: { findMany, count } };
  return { service, findMany };
}

describe('CS4 CaseService.findAll() — includeArchived', () => {
  it('includeArchived verilmezse → where.isArchived = false (arşivli dosyalar varsayılan gizli)', async () => {
    const { service, findMany } = setup();
    await service.findAll('tenant-1', {});
    expect(findMany.mock.calls[0][0].where.isArchived).toBe(false);
  });

  it('includeArchived=true → where.isArchived filtresi eklenmez (hepsi gösterilir)', async () => {
    const { service, findMany } = setup();
    await service.findAll('tenant-1', { includeArchived: true });
    expect(findMany.mock.calls[0][0].where.isArchived).toBeUndefined();
  });

  it('includeArchived=false (açıkça) → where.isArchived = false', async () => {
    const { service, findMany } = setup();
    await service.findAll('tenant-1', { includeArchived: false });
    expect(findMany.mock.calls[0][0].where.isArchived).toBe(false);
  });

  it('diğer filtrelerle birlikte (status) isArchived filtresi korunur', async () => {
    const { service, findMany } = setup();
    await service.findAll('tenant-1', { status: 'ACTIVE' });
    const where = findMany.mock.calls[0][0].where;
    expect(where.isArchived).toBe(false);
    expect(where.status).toBe('ACTIVE');
  });
});

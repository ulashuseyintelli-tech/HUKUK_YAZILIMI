/**
 * TimelineService.addEntry — aggregateVersion ataması (DB-free unit)
 *
 * Doğrular: addEntry artık versiyonu AggregateVersionAllocator'dan alır ve INSERT data'sına
 *   yazar; allocate + insert AYNI $transaction içinde atomik çalışır. tenantId bridge davranışı
 *   (explicit param / caseId'den türetme) DEĞİŞMEDEN korunur (bu PR'ın kapsamı dışı).
 *
 * Bu, "v28 addEntry aggregateVersion vermiyor → NOT NULL ihlali" gap'inin kapandığının
 * DB-free kanıtıdır. Canlı PG advisory-lock davranışı ertelendi (immutable-row integration).
 */
import { TimelineService } from '../timeline.service';

describe('TimelineService.addEntry aggregateVersion', () => {
  function makeHarness(opts?: { caseTenantId?: string; version?: bigint }) {
    const createMock = jest.fn().mockResolvedValue({ id: 'tid' });
    const fakeTx = { icrabotTimelineEntry: { create: createMock } };
    const prisma = {
      // $transaction callback'i fakeTx ile çalıştır → allocate + insert aynı tx'te.
      $transaction: jest.fn().mockImplementation((cb: any) => cb(fakeTx)),
      case: {
        findUnique: jest
          .fn()
          .mockResolvedValue(opts?.caseTenantId ? { tenantId: opts.caseTenantId } : null),
      },
    };
    const allocator = { next: jest.fn().mockResolvedValue(opts?.version ?? BigInt(1)) };
    const svc = new TimelineService(prisma as any, allocator as any);
    return { svc, prisma, allocator, createMock, fakeTx };
  }

  it("versiyonu allocator'dan alır ve INSERT data'sına yazar (tx içinde atomik)", async () => {
    const { svc, prisma, allocator, createMock, fakeTx } = makeHarness({ version: BigInt(42) });

    const id = await svc.addEntry({ caseId: 'c1', tenantId: 't1', type: 'NOTE', title: 'x' });

    expect(id).toBe('tid');
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(allocator.next).toHaveBeenCalledWith(fakeTx, 'c1'); // tx içinde, doğru caseId
    const data = createMock.mock.calls[0][0].data;
    expect(data.aggregateVersion).toBe(BigInt(42));
    expect(data.caseId).toBe('c1');
    expect(data.tenantId).toBe('t1');
    // explicit tenantId verildi → bridge lookup yapılmaz
    expect(prisma.case.findUnique).not.toHaveBeenCalled();
  });

  it('tenantId verilmezse FAIL-CLOSED: throw, yazım yok, bridge (case lookup) yok (PR2 bridge removal)', async () => {
    const { svc, prisma, createMock } = makeHarness({ caseTenantId: 't-derived' });

    await expect(
      svc.addEntry({ caseId: 'c2', type: 'NOTE', title: 'y' } as any),
    ).rejects.toThrow(/timeline_tenant_required/);

    expect(prisma.case.findUnique).not.toHaveBeenCalled(); // bridge kaldırıldı — caseId lookup yok
    expect(createMock).not.toHaveBeenCalled(); // null-tenant timeline yazımı yok
  });
});

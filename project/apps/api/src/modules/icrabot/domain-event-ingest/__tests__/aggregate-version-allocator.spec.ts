/**
 * AggregateVersionAllocator — DB-free unit
 *
 * Doğrular: (1) advisory lock SQL'i caseId parametresiyle çağrılır,
 *           (2) max+1 / ilk-event semantiği,
 *           (3) lock, max okumasından ÖNCE alınır (serileştirme garantisinin çekirdeği).
 *
 * Canlı PG advisory-lock davranışı bu seviyede koşulmaz (immutable-row integration ertelendi);
 * burada allocator'ın KONTRATI (lock→read sırası + aritmetik) izole edilir.
 */
import { AggregateVersionAllocator } from '../aggregate-version-allocator';

describe('AggregateVersionAllocator', () => {
  const makeTx = (max: bigint | null) => ({
    $executeRaw: jest.fn().mockResolvedValue(0),
    icrabotTimelineEntry: {
      aggregate: jest.fn().mockResolvedValue({ _max: { aggregateVersion: max } }),
    },
  });

  it('ilk event → 1n döner ve advisory lock caseId ile alınır', async () => {
    const tx = makeTx(null);
    const v = await new AggregateVersionAllocator().next(tx as any, 'case-1');

    expect(v).toBe(BigInt(1));
    expect(tx.$executeRaw).toHaveBeenCalledTimes(1);
    const [strings, arg] = tx.$executeRaw.mock.calls[0];
    expect(strings.join('?')).toContain('pg_advisory_xact_lock');
    expect(strings.join('?')).toContain('hashtextextended');
    expect(arg).toBe('case-1'); // caseId parametrize edilir (SQL injection değil)
  });

  it('mevcut max → max+1 döner', async () => {
    const tx = makeTx(BigInt(7));
    const v = await new AggregateVersionAllocator().next(tx as any, 'case-2');
    expect(v).toBe(BigInt(8));
  });

  it('lock, aggregate okumasından ÖNCE alınır (race-safety çekirdeği)', async () => {
    const order: string[] = [];
    const tx = {
      $executeRaw: jest.fn().mockImplementation(() => {
        order.push('lock');
        return Promise.resolve(0);
      }),
      icrabotTimelineEntry: {
        aggregate: jest.fn().mockImplementation(() => {
          order.push('aggregate');
          return Promise.resolve({ _max: { aggregateVersion: null } });
        }),
      },
    };
    await new AggregateVersionAllocator().next(tx as any, 'c');
    expect(order).toEqual(['lock', 'aggregate']);
  });
});

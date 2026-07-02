/**
 * FAZ-1b backfill APPLY — saf çekirdek testleri.
 */
import { parseArgs, partitionByActorAvailability } from '../apply-expense-approval-backfill-logic';

describe('parseArgs', () => {
  it('actor-email ve confirm doğru parse edilir', () => {
    expect(parseArgs(['--actor-email=owner@example.com', '--confirm'])).toEqual({
      actorEmail: 'owner@example.com',
      confirm: true,
    });
  });

  it('confirm verilmezse false (varsayılan dry-run)', () => {
    expect(parseArgs(['--actor-email=owner@example.com'])).toEqual({
      actorEmail: 'owner@example.com',
      confirm: false,
    });
  });

  it('actor-email verilmezse null', () => {
    expect(parseArgs(['--confirm'])).toEqual({ actorEmail: null, confirm: true });
    expect(parseArgs([])).toEqual({ actorEmail: null, confirm: false });
  });

  it('actor-email içindeki boşluklar trim edilir', () => {
    expect(parseArgs(['--actor-email= owner@example.com '])).toEqual({
      actorEmail: 'owner@example.com',
      confirm: false,
    });
  });
});

describe('partitionByActorAvailability', () => {
  const c = (id: string, tenantId: string) => ({
    id,
    tenantId,
    caseId: `case-${id}`,
    status: 'PAID',
    totalAmount: '100.00',
    paidTotal: '100.00',
    currency: 'TRY',
    createdAt: new Date('2026-01-01T00:00:00.000Z'),
  });

  it('actor haritasında olan tenant → applicable', () => {
    const candidates = [c('e1', 't1'), c('e2', 't1')];
    const actorByTenant = new Map([['t1', 'user-1']]);
    const { applicable, skipped } = partitionByActorAvailability(candidates, actorByTenant);
    expect(applicable.map((x) => x.id)).toEqual(['e1', 'e2']);
    expect(skipped).toEqual([]);
  });

  it('actor haritasında olmayan tenant → skipped, applicable etkilenmez', () => {
    const candidates = [c('e1', 't1'), c('e2', 't2')];
    const actorByTenant = new Map([['t1', 'user-1']]);
    const { applicable, skipped } = partitionByActorAvailability(candidates, actorByTenant);
    expect(applicable.map((x) => x.id)).toEqual(['e1']);
    expect(skipped.map((x) => x.id)).toEqual(['e2']);
  });

  it('boş candidate listesi → boş sonuç', () => {
    const { applicable, skipped } = partitionByActorAvailability([], new Map());
    expect(applicable).toEqual([]);
    expect(skipped).toEqual([]);
  });

  it('birden fazla tenant, bazıları actor’lı bazıları değil → doğru ayrışır', () => {
    const candidates = [c('e1', 't1'), c('e2', 't2'), c('e3', 't1'), c('e4', 't3')];
    const actorByTenant = new Map([
      ['t1', 'user-1'],
      ['t3', 'user-3'],
    ]);
    const { applicable, skipped } = partitionByActorAvailability(candidates, actorByTenant);
    expect(applicable.map((x) => x.id).sort()).toEqual(['e1', 'e3', 'e4']);
    expect(skipped.map((x) => x.id)).toEqual(['e2']);
  });
});

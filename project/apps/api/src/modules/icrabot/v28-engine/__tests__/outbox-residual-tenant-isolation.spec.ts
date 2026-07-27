/**
 * V28-TENANT-ISOLATION-SECURITY-CLOSEOUT-R01 / I03 — Outbox artik yuzeyleri.
 *
 * Kapanan bulgular:
 *   OB-A01 `GET outbox/handler-stats` TUM tenant'larin outbox sayimlarini donuyordu
 *   OB-L01 `GET outbox/locks` in-memory lock listesi `${caseId}:${key}` anahtarlari
 *          uzerinden YABANCI TENANT caseId'lerini sizdiriyordu
 *
 * @jest-environment node
 */
import { ActionHandlerService } from '../action-handler.service';
import { OutboxScope } from '../outbox-scope';

const T1: OutboxScope = { kind: 'tenant', tenantId: 't1' };
const T2: OutboxScope = { kind: 'tenant', tenantId: 't2' };
const PLATFORM: OutboxScope = { kind: 'platform' };

// ActionHandlerService ctor'u lock-cleanup icin gercek setInterval acar; emsal
// spec'lerdeki gibi fake timer kullanilir, aksi halde jest process'i kapanmaz.
beforeAll(() => jest.useFakeTimers());
afterAll(() => jest.useRealTimers());

type Row = Record<string, any>;

function matches(r: Row, where: any): boolean {
  if (!where) return true;
  return Object.entries(where).every(([k, v]) => r[k] === v);
}

function build(rows: Row[]) {
  const prisma: Row = {
    icrabotOutboxAction: {
      count: jest.fn(async ({ where }: any) => rows.filter((r) => matches(r, where)).length),
      findUnique: jest.fn(async () => null),
    },
  };
  const outbox = {
    markSent: jest.fn(),
    markDone: jest.fn(),
    markFailed: jest.fn(),
    claimForProcessing: jest.fn(async () => true),
  };
  const svc = new ActionHandlerService(
    prisma as any,
    outbox as any,
    { addEntry: jest.fn() } as any,
    { write: jest.fn() } as any,
  );
  return { svc, prisma };
}

describe('I03 — handler-stats tenant kapsami (OB-A01)', () => {
  const rows: Row[] = [
    { tenantId: 't1', actionType: 'enqueue', status: 'done' },
    { tenantId: 't1', actionType: 'enqueue', status: 'dead' },
    { tenantId: 't2', actionType: 'enqueue', status: 'done' },
    { tenantId: 't2', actionType: 'enqueue', status: 'done' },
  ];

  it('SENARYO 1: her tenant YALNIZ kendi sayimini gorur', async () => {
    const { svc } = build(rows);

    const s1 = await svc.getHandlerStats(T1);
    expect(s1.enqueue).toEqual({ total: 2, success: 1, failed: 1 });

    const s2 = await svc.getHandlerStats(T2);
    expect(s2.enqueue).toEqual({ total: 2, success: 2, failed: 0 });
  });

  it('SENARYO 2: sayim sorgusu gercek tenant predicate\'i tasir', async () => {
    const { svc, prisma } = build(rows);
    await svc.getHandlerStats(T1);

    for (const call of prisma.icrabotOutboxAction.count.mock.calls) {
      expect(call[0].where.tenantId).toBe('t1');
    }
  });

  it('SENARYO 3: platform kapsami (dahili) toplami gorur', async () => {
    const { svc } = build(rows);
    const all = await svc.getHandlerStats(PLATFORM);
    expect(all.enqueue.total).toBe(4);
  });
});

describe('I03 — lock listesi caseId sizintisi (OB-L01)', () => {
  async function openLock(svc: ActionHandlerService, caseId: string, tenantId: string) {
    // open_lock handler'i context uzerinden tenant alir
    const handler = (svc as any).handlers.get('open_lock');
    await handler({ key: 'manual_review', ttl_sec: 3600 }, caseId, {
      actionId: 'a',
      tenantId,
      actionType: 'open_lock',
    });
  }

  it('SENARYO 4: yabanci tenant lock\'lari (ve caseId\'leri) GORUNMEZ', async () => {
    const { svc } = build([]);

    await openLock(svc, 'case-t1', 't1');
    await openLock(svc, 'case-t2', 't2');

    const l1 = svc.getActiveLocks(T1);
    expect(l1.map((l) => l.key)).toEqual(['case-t1:manual_review']);
    // t2'nin caseId'si hicbir sekilde sizmaz
    expect(JSON.stringify(l1)).not.toContain('case-t2');

    const l2 = svc.getActiveLocks(T2);
    expect(l2.map((l) => l.key)).toEqual(['case-t2:manual_review']);
  });

  it('SENARYO 5: platform kapsami tum lock\'lari gorur', async () => {
    const { svc } = build([]);
    await openLock(svc, 'case-t1', 't1');
    await openLock(svc, 'case-t2', 't2');

    expect(svc.getActiveLocks(PLATFORM)).toHaveLength(2);
  });

  it('SENARYO 6: tenant\'i bilinmeyen (legacy) lock tenant kapsaminda GORUNMEZ (fail-closed)', () => {
    const { svc } = build([]);
    (svc as any).locks.set('case-x:k', { key: 'case-x:k', expiresAt: Date.now() + 60_000 });

    expect(svc.getActiveLocks(T1)).toEqual([]);
    expect(svc.getActiveLocks(PLATFORM)).toHaveLength(1);
  });

  it('SENARYO 7: open_lock tenant context olmadan FAIL-CLOSED', async () => {
    const { svc } = build([]);
    const handler = (svc as any).handlers.get('open_lock');

    await expect(handler({ key: 'k' }, 'case-1', undefined)).rejects.toThrow(
      /handler_scope_missing_tenant/,
    );
    expect(svc.getActiveLocks(PLATFORM)).toEqual([]);
  });

  it('SENARYO 8: suresi dolmus lock listelenmez', () => {
    const { svc } = build([]);
    (svc as any).locks.set('case-1:k', {
      key: 'case-1:k',
      expiresAt: Date.now() - 1,
      tenantId: 't1',
    });

    expect(svc.getActiveLocks(T1)).toEqual([]);
  });
});

import { ActionHandlerService } from '../../icrabot/v28-engine/action-handler.service';
import { DomainEventIngestService } from '../../icrabot/domain-event-ingest';
import { CollectionDispositionService } from '../../client-settlement/collection-disposition.service';
import { CollectionReversalService } from '../../client-settlement/collection-reversal.service';
import { PaymentReceivedRegistrar } from '../../client-settlement/payment-received.registrar';
import { PaymentReversedRegistrar } from '../../client-settlement/payment-reversed.registrar';
import { CollectionService } from '../collection.service';

type ActionRow = {
  id: string;
  tenantId: string;
  caseId: string;
  actionType: string;
  payload: Record<string, unknown>;
  idempotencyKey?: string;
  runId?: string;
  status: 'PENDING' | 'SENT' | 'DONE' | 'FAILED';
  attemptCount: number;
};

function buildHarness() {
  const timelineEntries: any[] = [];
  const actions = new Map<string, ActionRow>();
  const dispositions = new Map<string, any>();
  let actionSeq = 1;
  let timelineSeq = 1;
  let dispositionSeq = 1;

  const collection = {
    id: 'col1',
    tenantId: 't1',
    caseId: 'case1',
    status: 'CONFIRMED',
    amount: 1000,
    currency: 'TRY',
  };

  const prisma: any = {
    $executeRaw: jest.fn(async () => undefined),
    $transaction: jest.fn(async (fn: any) => fn(prisma)),
    icrabotTimelineEntry: {
      findFirst: jest.fn(async (args?: any) => {
        if (args?.where?.type === 'PAYMENT_RECEIVED') {
          return (
            timelineEntries.find(
              (entry) =>
                entry.tenantId === args.where.tenantId &&
                entry.caseId === args.where.caseId &&
                entry.type === 'PAYMENT_RECEIVED' &&
                entry.body?.payload?.collectionId === args.where.body?.equals,
            ) ?? null
          );
        }
        return null;
      }),
      aggregate: jest.fn(async (args?: any) => {
        const caseEntries = timelineEntries.filter((entry) => entry.caseId === args?.where?.caseId);
        const currentMax = caseEntries.reduce<bigint | null>((max, entry) => {
          const version = BigInt(entry.aggregateVersion ?? 0);
          return max === null || version > max ? version : max;
        }, null);
        return { _max: { aggregateVersion: currentMax } };
      }),
      create: jest.fn(async (args: any) => {
        const row = { id: `timeline-${timelineSeq++}`, ...args.data };
        timelineEntries.push(row);
        return row;
      }),
    },
    icrabotOutboxAction: {
      create: jest.fn(async (args: any) => {
        const row: ActionRow = {
          id: `action-${actionSeq++}`,
          status: 'PENDING',
          attemptCount: 0,
          ...args.data,
        };
        actions.set(row.id, row);
        return row;
      }),
      findUnique: jest.fn(async (args: any) => actions.get(args.where.id) ?? null),
    },
    collection: {
      findFirst: jest.fn(async (args: any) => {
        const where = args.where ?? {};
        if (where.id && where.id !== collection.id) return null;
        if (where.tenantId && where.tenantId !== collection.tenantId) return null;
        if (where.caseId && where.caseId !== collection.caseId) return null;
        return collection;
      }),
      update: jest.fn(async (args: any) => {
        Object.assign(collection, args.data);
        return { ...collection };
      }),
    },
    ledgerEntry: {
      findFirst: jest.fn(async () => null),
      create: jest.fn(),
    },
    claimItem: {
      updateMany: jest.fn(),
    },
    collectionOverpayment: {
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    caseClient: {
      findMany: jest.fn(async (args: any) => {
        if (args.where?.caseId !== collection.caseId) return [];
        return [{ id: 'case-client-1' }];
      }),
    },
    collectionDisposition: {
      findUnique: jest.fn(async (args: any) => {
        const collectionId = args.where?.collectionId;
        return collectionId ? dispositions.get(collectionId) ?? null : null;
      }),
      create: jest.fn(async (args: any) => {
        const disposition = {
          id: `disp-${dispositionSeq++}`,
          tenantId: args.data.tenantId,
          caseId: args.data.caseId,
          collectionId: args.data.collectionId,
          beneficiaryScope: args.data.beneficiaryScope,
          caseClientId: args.data.caseClientId,
          status: args.data.status,
          totalAmount: args.data.totalAmount,
          currency: args.data.currency,
          manualReversalRequiredAt: null,
          manualReversalReason: null,
          manualReversalSourceActionId: null,
        };
        dispositions.set(disposition.collectionId, disposition);
        return { id: disposition.id };
      }),
      update: jest.fn(async (args: any) => {
        const disposition = Array.from(dispositions.values()).find((row) => row.id === args.where.id);
        if (!disposition) throw new Error(`disposition not found: ${args.where.id}`);
        Object.assign(disposition, args.data);
        return disposition;
      }),
    },
    clientStatement: {
      create: jest.fn(),
      update: jest.fn(),
    },
    clientStatementLine: {
      create: jest.fn(),
      createMany: jest.fn(),
    },
    balanceLedger: {
      create: jest.fn(),
      update: jest.fn(),
    },
    clientPayout: {
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  const outbox = {
    markSent: jest.fn(async (id: string) => {
      const action = actions.get(id);
      if (action) action.status = 'SENT';
    }),
    markDone: jest.fn(async (id: string) => {
      const action = actions.get(id);
      if (action) action.status = 'DONE';
    }),
    markFailed: jest.fn(async (id: string) => {
      const action = actions.get(id);
      if (action) {
        action.status = 'FAILED';
        action.attemptCount += 1;
      }
    }),
  };
  const timeline = { addEntry: jest.fn(async () => `timeline-outcome`) };
  const factStore = { write: jest.fn(async () => undefined) };
  const actionHandler = new ActionHandlerService(prisma, outbox as any, timeline as any, factStore as any);
  const domainEvent = new DomainEventIngestService();
  const collectionService = new CollectionService(prisma, domainEvent, {} as any, undefined);

  new PaymentReceivedRegistrar(
    actionHandler,
    new CollectionDispositionService(prisma),
  ).onModuleInit();
  new PaymentReversedRegistrar(
    actionHandler,
    new CollectionReversalService(prisma),
  ).onModuleInit();

  async function publishPaymentReceived() {
    await domainEvent.appendInTransaction(prisma, {
      header: {
        eventId: 'payment-event-1',
        aggregateType: 'Case',
        aggregateId: collection.caseId,
        eventType: 'PAYMENT_RECEIVED',
        occurredAt: '2026-06-27T10:00:00.000Z',
        occurredAtConfidence: 'SYSTEM_VERIFIED',
        actor: { type: 'SYSTEM', reason: 'TEST_PAYMENT_RECEIVED' },
        tenantId: collection.tenantId,
      },
      payload: {
        tenantId: collection.tenantId,
        caseId: collection.caseId,
        collectionId: collection.id,
      },
    });
    return findAction('EVENT_PUBLISHED:PAYMENT_RECEIVED');
  }

  function findAction(actionType: string) {
    const action = Array.from(actions.values()).find((row) => row.actionType === actionType);
    if (!action) throw new Error(`action not found: ${actionType}`);
    return action;
  }

  function pendingActions() {
    return Array.from(actions.values()).filter((row) => row.status === 'PENDING');
  }

  function disposition() {
    return dispositions.get(collection.id);
  }

  function expectNoFinancialMutation() {
    expect(prisma.clientStatement.create).not.toHaveBeenCalled();
    expect(prisma.clientStatement.update).not.toHaveBeenCalled();
    expect(prisma.clientStatementLine.create).not.toHaveBeenCalled();
    expect(prisma.clientStatementLine.createMany).not.toHaveBeenCalled();
    expect(prisma.balanceLedger.create).not.toHaveBeenCalled();
    expect(prisma.balanceLedger.update).not.toHaveBeenCalled();
    expect(prisma.clientPayout.create).not.toHaveBeenCalled();
    expect(prisma.clientPayout.update).not.toHaveBeenCalled();
  }

  return {
    actionHandler,
    collection,
    collectionService,
    disposition,
    expectNoFinancialMutation,
    findAction,
    pendingActions,
    prisma,
    publishPaymentReceived,
  };
}

describe('S2 PAYMENT_REVERSED integration', () => {
  beforeAll(() => jest.useFakeTimers());
  afterAll(() => jest.useRealTimers());

  it('CONFIRMED collection -> PAYMENT_RECEIVED -> disposition opened -> cancel/PAYMENT_REVERSED -> REVERSED, action done, no pending backlog', async () => {
    const h = buildHarness();

    const receivedAction = await h.publishPaymentReceived();
    await expect(h.actionHandler.dispatch(receivedAction.id)).resolves.toMatchObject({ success: true });

    expect(h.disposition()).toMatchObject({ status: 'HELD_PENDING_DISTRIBUTION', collectionId: 'col1' });
    await h.collectionService.cancel('t1', 'col1', { cancelReason: 'iptal' } as any);

    const reversedAction = h.findAction('EVENT_PUBLISHED:PAYMENT_REVERSED');
    expect(reversedAction.payload).toMatchObject({ tenantId: 't1', caseId: 'case1', collectionId: 'col1' });
    expect(h.pendingActions()).toHaveLength(1);

    await expect(h.actionHandler.dispatch(reversedAction.id)).resolves.toMatchObject({ success: true });

    expect(h.disposition()).toMatchObject({ status: 'REVERSED', collectionId: 'col1' });
    expect(reversedAction.status).toBe('DONE');
    expect(h.pendingActions()).toHaveLength(0);
  });

  it('POSTED disposition -> PAYMENT_REVERSED keeps POSTED, writes FU1 manual marker, no financial mutation, action done', async () => {
    const h = buildHarness();

    const receivedAction = await h.publishPaymentReceived();
    await h.actionHandler.dispatch(receivedAction.id);
    Object.assign(h.disposition(), { status: 'POSTED' });

    await h.collectionService.cancel('t1', 'col1', { cancelReason: 'posted iptal' } as any);
    const reversedAction = h.findAction('EVENT_PUBLISHED:PAYMENT_REVERSED');
    await expect(h.actionHandler.dispatch(reversedAction.id)).resolves.toMatchObject({ success: true });

    expect(h.disposition().status).toBe('POSTED');
    expect(h.disposition().manualReversalRequiredAt).toBeInstanceOf(Date);
    expect(h.disposition().manualReversalReason).toEqual(expect.stringContaining('PAYMENT_REVERSED'));
    expect(h.disposition().manualReversalSourceActionId).toBe(reversedAction.id);
    expect(reversedAction.status).toBe('DONE');
    expect(h.pendingActions()).toHaveLength(0);
    h.expectNoFinancialMutation();
  });
});

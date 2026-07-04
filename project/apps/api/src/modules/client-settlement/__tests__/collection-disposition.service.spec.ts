/**
 * TM3 M1 — CollectionDispositionService testleri.
 * Acceptance: tenant context (outbox satırından) zorunlu + tenant/case SCOPED read;
 * idempotent draft; tek/çoklu alacaklı scope; status guard; zero-creditor controlled failure;
 * clientId varsayımı YOK; default HELD_PENDING_DISTRIBUTION satırı.
 */
import { Prisma } from '@prisma/client';
import { CollectionDispositionService } from '../collection-disposition.service';

const CONFIRMED = {
  id: 'col1', tenantId: 't1', caseId: 'case1', amount: '5000.00', currency: 'TRY', status: 'CONFIRMED',
};
// Outbox satır bağlamı (IcrabotOutboxAction.tenantId thread edilmiş hali)
const CTX = { actionId: 'a1', tenantId: 't1', actionType: 'EVENT_PUBLISHED:PAYMENT_RECEIVED' };

function buildPrisma(opts: {
  existing?: any;
  collection?: any;
  creditors?: any[];
  createImpl?: jest.Mock;
} = {}) {
  const col = opts.collection === undefined ? CONFIRMED : opts.collection;
  return {
    collectionDisposition: {
      findUnique: jest.fn().mockResolvedValue(opts.existing ?? null),
      create: opts.createImpl ?? jest.fn().mockResolvedValue({ id: 'disp1' }),
    },
    collection: {
      // SCOPED read: yalnız id+caseId+tenantId tam eşleşirse döner (cross-tenant/case → null).
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        if (!col) return Promise.resolve(null);
        const match = where.id === col.id && where.caseId === col.caseId && where.tenantId === col.tenantId;
        return Promise.resolve(match ? col : null);
      }),
    },
    caseClient: {
      findMany: jest.fn().mockResolvedValue(opts.creditors ?? []),
    },
  } as any;
}

const svc = (prisma: any) => new CollectionDispositionService(prisma);

describe('CollectionDispositionService.createDraftFromPaymentReceived', () => {
  it('tek alacaklı → SINGLE_CASE_CLIENT + caseClientId + default HELD satırı (amount)', async () => {
    const prisma = buildPrisma({ creditors: [{ id: 'cc1' }] });
    const res = await svc(prisma).createDraftFromPaymentReceived({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.created).toBe(true);
    const data = prisma.collectionDisposition.create.mock.calls[0][0].data;
    expect(data.beneficiaryScope).toBe('SINGLE_CASE_CLIENT');
    expect(data.caseClientId).toBe('cc1');
    expect(data.tenantId).toBe('t1'); // outbox context'ten
    expect(data.totalAmount).toBe('5000.00');
    expect(data.status).toBe('HELD_PENDING_DISTRIBUTION');
    expect(data.lines.create).toEqual([{ type: 'HELD_PENDING_DISTRIBUTION', amount: '5000.00' }]);
    expect(data.clientId).toBeUndefined(); // clientId varsayımı YOK
  });

  it('çoklu alacaklı → CASE_CREDITOR_CLUSTER + caseClientId null', async () => {
    const prisma = buildPrisma({ creditors: [{ id: 'cc1' }, { id: 'cc2' }] });
    const res = await svc(prisma).createDraftFromPaymentReceived({ collectionId: 'col1' }, 'case1', CTX);

    expect(res.created).toBe(true);
    const data = prisma.collectionDisposition.create.mock.calls[0][0].data;
    expect(data.beneficiaryScope).toBe('CASE_CREDITOR_CLUSTER');
    expect(data.caseClientId).toBeNull();
  });

  it('CROSS-TENANT: outbox context.tenantId != collection.tenantId → draft yok (gerçek tenant guard)', async () => {
    const prisma = buildPrisma({ creditors: [{ id: 'cc1' }] }); // collection.tenantId = t1
    const otherTenantCtx = { ...CTX, tenantId: 'tB' };
    await expect(
      svc(prisma).createDraftFromPaymentReceived({ collectionId: 'col1' }, 'case1', otherTenantCtx),
    ).rejects.toThrow(/scope dışı/);
    // scoped read context.tenantId ile çağrıldı
    expect(prisma.collection.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 'tB', caseId: 'case1', id: 'col1' }) }),
    );
    expect(prisma.collectionDisposition.create).not.toHaveBeenCalled();
  });

  it('context.tenantId yoksa → throw (tenant doğrulanmadan draft yok)', async () => {
    const prisma = buildPrisma({ creditors: [{ id: 'cc1' }] });
    await expect(
      svc(prisma).createDraftFromPaymentReceived({ collectionId: 'col1' }, 'case1', undefined),
    ).rejects.toThrow(/tenant doğrulanmadan/);
  });

  it('idempotent: disposition zaten varsa create YOK, skipped=already-exists', async () => {
    const prisma = buildPrisma({ existing: { id: 'disp-old' }, creditors: [{ id: 'cc1' }] });
    const res = await svc(prisma).createDraftFromPaymentReceived({ collectionId: 'col1' }, 'case1', CTX);

    expect(res).toEqual({ created: false, dispositionId: 'disp-old', skipped: 'already-exists' });
    expect(prisma.collectionDisposition.create).not.toHaveBeenCalled();
  });

  it('case mismatch → scoped read null → throw (draft yok)', async () => {
    const prisma = buildPrisma({ creditors: [{ id: 'cc1' }] });
    await expect(
      svc(prisma).createDraftFromPaymentReceived({ collectionId: 'col1' }, 'BASKA_CASE', CTX),
    ).rejects.toThrow(/scope dışı/);
    expect(prisma.collectionDisposition.create).not.toHaveBeenCalled();
  });

  it('collection CONFIRMED değil (CANCELLED) → skipped, draft yok', async () => {
    const prisma = buildPrisma({ collection: { ...CONFIRMED, status: 'CANCELLED' }, creditors: [{ id: 'cc1' }] });
    const res = await svc(prisma).createDraftFromPaymentReceived({ collectionId: 'col1' }, 'case1', CTX);

    expect(res).toEqual({ created: false, skipped: 'collection-status-CANCELLED' });
    expect(prisma.collectionDisposition.create).not.toHaveBeenCalled();
  });

  it('sıfır eligible alacaklı → controlled failure (sessizce cluster YARATMA)', async () => {
    const prisma = buildPrisma({ creditors: [] });
    await expect(
      svc(prisma).createDraftFromPaymentReceived({ collectionId: 'col1' }, 'case1', CTX),
    ).rejects.toThrow(/Eligible alacaklı.*yok/);
    expect(prisma.collectionDisposition.create).not.toHaveBeenCalled();
  });

  it('payload.collectionId yok → throw', async () => {
    const prisma = buildPrisma({ creditors: [{ id: 'cc1' }] });
    await expect(
      svc(prisma).createDraftFromPaymentReceived({}, 'case1', CTX),
    ).rejects.toThrow(/collectionId yok/);
  });

  it('unique-race (create P2002) → güvenli skip', async () => {
    const p2002 = new Prisma.PrismaClientKnownRequestError('unique', { code: 'P2002', clientVersion: '5.0.0' });
    const createImpl = jest.fn().mockRejectedValue(p2002);
    const prisma = buildPrisma({ creditors: [{ id: 'cc1' }], createImpl });
    const res = await svc(prisma).createDraftFromPaymentReceived({ collectionId: 'col1' }, 'case1', CTX);

    expect(res).toEqual({ created: false, skipped: 'unique-race' });
  });
});

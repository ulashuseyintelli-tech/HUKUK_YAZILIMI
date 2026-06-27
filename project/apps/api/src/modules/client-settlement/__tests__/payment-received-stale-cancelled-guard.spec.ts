/**
 * TM3 M1R — "stale PAYMENT_RECEIVED after cancel" guard kilidi.
 *
 * Senaryo (M1R'in eksik kalmaması için kritik): bir PAYMENT_RECEIVED action'ı pending kalmış
 * olabilir; ardından collection cancel edilip PAYMENT_REVERSED işlenir. Eğer eski PAYMENT_RECEIVED
 * SONRADAN tekrar çalışırsa, iptal edilmiş bir collection için YENİ AKTİF draft AÇMAMALIDIR.
 *
 * Bu güvence M1'de ZATEN VAR (collection-disposition.service.ts: status !== 'CONFIRMED' → skip).
 * M1R bu davranışı DEĞİŞTİRMEZ; yalnız bu testle senaryoyu açıkça KİLİTLER (regresyon koruması).
 */
import { CollectionDispositionService } from '../collection-disposition.service';

const CTX = { actionId: 'a1', tenantId: 't1', actionType: 'EVENT_PUBLISHED:PAYMENT_RECEIVED' };

function buildPrisma(collection: any) {
  return {
    collectionDisposition: {
      findUnique: jest.fn().mockResolvedValue(null),
      create: jest.fn().mockResolvedValue({ id: 'disp-should-not-happen' }),
    },
    collection: {
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        const c = collection;
        const match = where.id === c.id && where.caseId === c.caseId && where.tenantId === c.tenantId;
        return Promise.resolve(match ? c : null);
      }),
    },
    caseClient: {
      findMany: jest.fn().mockResolvedValue([{ id: 'cc1' }]),
    },
  } as any;
}

describe('M1R guard: stale PAYMENT_RECEIVED + collection CANCELLED → aktif draft YOK', () => {
  it('collection CANCELLED iken create ÇAĞRILMAZ ve skipped=collection-status-CANCELLED', async () => {
    const cancelled = { id: 'col1', tenantId: 't1', caseId: 'case1', amount: '5000.00', currency: 'TRY', status: 'CANCELLED' };
    const prisma = buildPrisma(cancelled);

    const res = await new CollectionDispositionService(prisma).createDraftFromPaymentReceived(
      { collectionId: 'col1' },
      'case1',
      CTX,
    );

    expect(res).toEqual({ created: false, skipped: 'collection-status-CANCELLED' });
    expect(prisma.collectionDisposition.create).not.toHaveBeenCalled();
  });

  it('collection REFUNDED iken de aktif draft YOK (yalnız CONFIRMED draft açar)', async () => {
    const refunded = { id: 'col1', tenantId: 't1', caseId: 'case1', amount: '5000.00', currency: 'TRY', status: 'REFUNDED' };
    const prisma = buildPrisma(refunded);

    const res = await new CollectionDispositionService(prisma).createDraftFromPaymentReceived(
      { collectionId: 'col1' },
      'case1',
      CTX,
    );

    expect(res).toEqual({ created: false, skipped: 'collection-status-REFUNDED' });
    expect(prisma.collectionDisposition.create).not.toHaveBeenCalled();
  });
});

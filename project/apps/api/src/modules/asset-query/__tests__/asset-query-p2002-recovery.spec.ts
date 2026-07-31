import { Prisma } from '@prisma/client';
import { AssetQueryService } from '../asset-query.service';

// I15 Phase B regression guard: createExternalCase (Phase A) icin bulunan gercek
// hatayla ayni sinifta bir hata sinamasi — P2002 yakalama mantiginin gercek
// Postgres meta.target sekliyle (kolon adlari dizisi) calistigini VE tabloda
// idempotencyKey DISINDA bir unique alan olsaydi bile ilgisiz P2002'nin yutulmadigini
// deterministik olarak (mock) dogrular.

function makePostgresP2002(columns: string[]) {
  return new Prisma.PrismaClientKnownRequestError('Unique constraint failed', {
    code: 'P2002',
    clientVersion: '5.22.0',
    meta: { target: columns },
  });
}

describe('I15 Phase B — AssetQueryService P2002 recovery (mocked, deterministic)', () => {
  function build(opts: { existingAfterP2002: any; createRejectsWith: unknown }) {
    const guard = { assertActiveByCaseDebtorId: jest.fn().mockResolvedValue(undefined) };
    const prisma: any = {
      caseDebtor: {
        findFirst: jest.fn().mockResolvedValue({ id: 'cd1', case: { tenantId: 't1' } }),
      },
      assetQuery: {
        findMany: jest.fn().mockResolvedValue([]), // on-kontrol: henuz yok (yaris penceresi)
        count: jest.fn().mockResolvedValue(0),
        create: jest.fn().mockRejectedValue(opts.createRejectsWith),
        findUnique: jest.fn().mockResolvedValue(opts.existingAfterP2002),
      },
    };
    return { service: new AssetQueryService(prisma, guard as any), prisma };
  }

  it('gerçek Postgres P2002 (meta.target=kolon adları dizisi) yakalanıp idempotent replay döner', async () => {
    const existingRow = { id: 'aq-existing', queryType: 'VEHICLE', tenantId: 't1', requestedAt: new Date() };
    const { service, prisma } = build({
      existingAfterP2002: existingRow,
      createRejectsWith: makePostgresP2002(['idempotencyKey']),
    });

    const result = await service.runQueries('t1', 'cd1', 'user1', {
      types: ['VEHICLE'] as any,
      idempotencyKey: 'req-1',
    });

    expect(result.queries[0].id).toBe('aq-existing');
    expect(prisma.assetQuery.findUnique).toHaveBeenCalledTimes(1);
  });

  it('P2002 sonrası findUnique de null dönerse (gerçekten çözülemeyen durum) orijinal hata fırlatılır', async () => {
    const { service } = build({
      existingAfterP2002: null,
      createRejectsWith: makePostgresP2002(['idempotencyKey']),
    });

    await expect(
      service.runQueries('t1', 'cd1', 'user1', { types: ['VEHICLE'] as any, idempotencyKey: 'req-1' }),
    ).rejects.toBeInstanceOf(Prisma.PrismaClientKnownRequestError);
  });

  it('non-P2002 hata (örn. P2003 FK ihlali) hiç yakalanmadan doğrudan fırlatılır', async () => {
    const fkError = new Prisma.PrismaClientKnownRequestError('FK violation', {
      code: 'P2003',
      clientVersion: '5.22.0',
      meta: { field_name: 'requestedBy' },
    });
    const { service, prisma } = build({ existingAfterP2002: null, createRejectsWith: fkError });

    await expect(
      service.runQueries('t1', 'cd1', 'user1', { types: ['VEHICLE'] as any, idempotencyKey: 'req-1' }),
    ).rejects.toBe(fkError);
    // P2003 icin findUnique KESINLIKLE cagrilmamali (yalniz P2002 recovery denenir):
    expect(prisma.assetQuery.findUnique).not.toHaveBeenCalled();
  });

  it('idempotencyKey verilmemişse P2002 yakalansa bile findUnique çağrılmaz (anahtar yok)', async () => {
    const genericError = new Error('unexpected');
    const { service, prisma } = build({ existingAfterP2002: null, createRejectsWith: genericError });

    await expect(
      service.runQueries('t1', 'cd1', 'user1', { types: ['VEHICLE'] as any }),
    ).rejects.toBe(genericError);
    expect(prisma.assetQuery.findUnique).not.toHaveBeenCalled();
  });
});

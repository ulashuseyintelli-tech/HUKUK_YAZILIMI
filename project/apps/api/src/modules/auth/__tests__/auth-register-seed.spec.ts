/**
 * PR-B — register() tenant-create auto-seed (MOCK, gerçek DB write YOK).
 *
 * Doğrulananlar:
 *  - register() başarıda seedLookupCatalog'u AYNI tx client'ı + yeni tenant.id ile çağırır
 *    (this.prisma DEĞİL) ve user create'ten SONRA (return öncesi).
 *  - seedLookupCatalog throw ederse register() reject olur (token üretilmez) → tx rollback semantiği.
 *
 * Gerçek Postgres ROLLBACK + "yeni tenant tam set ile doğar" kanıtı = PR-E integration (disposable DB).
 */
import { AuthService } from '../auth.service';
import { seedLookupCatalog } from '../../lookup/lookup-seed';

jest.mock('../../lookup/lookup-seed');

const mockedSeed = seedLookupCatalog as jest.MockedFunction<typeof seedLookupCatalog>;

function buildTx() {
  return {
    tenant: { create: jest.fn().mockResolvedValue({ id: 't1', name: 'Yeni Firma', slug: 'yeni-firma' }) },
    user: {
      create: jest.fn().mockResolvedValue({
        id: 'u1', tenantId: 't1', email: 'a@b.com', role: 'ADMIN', name: 'A', surname: 'B', passwordHash: 'x', isActive: true,
      }),
    },
  };
}

function buildService(tx: any) {
  const prisma: any = {
    tenant: { findUnique: jest.fn().mockResolvedValue(null) },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
    // gerçek $transaction gibi: callback'i tx ile çalıştır; callback throw ederse propagate (rollback simülasyonu)
    $transaction: jest.fn(async (cb: any) => cb(tx)),
  };
  const jwt: any = { sign: jest.fn().mockReturnValue('fake-token') };
  return new AuthService(prisma, jwt);
}

const dto: any = { firmName: 'Yeni Firma', email: 'a@b.com', password: 'secret123', name: 'A', surname: 'B' };

describe('PR-B AuthService.register tenant-create auto-seed', () => {
  beforeEach(() => jest.clearAllMocks());

  it('başarı: seedLookupCatalog tx client + tenant.id ile, user create SONRASI, 1 kez çağrılır', async () => {
    const tx = buildTx();
    mockedSeed.mockResolvedValue({ takipTuru: 11, mahiyet: 18, asama: 9, risk: 3, borcluTipi: 3, durumEtiketi: 9 });
    const svc = buildService(tx);

    const res = await svc.register(dto);

    expect(mockedSeed).toHaveBeenCalledTimes(1);
    // tx client ile (this.prisma DEĞİL) + yeni tenant.id
    expect(mockedSeed).toHaveBeenCalledWith(tx, 't1');
    // sıralama: seed, user create'ten SONRA
    expect(tx.user.create.mock.invocationCallOrder[0]).toBeLessThan(mockedSeed.mock.invocationCallOrder[0]);
    expect(res.token).toBe('fake-token');
    expect(res.tenant.id).toBe('t1');
  });

  it('rollback semantiği: seedLookupCatalog throw → register reject, token üretilmez', async () => {
    const tx = buildTx();
    mockedSeed.mockRejectedValue(new Error('seed failed'));
    const svc = buildService(tx);

    await expect(svc.register(dto)).rejects.toThrow('seed failed');
    expect(mockedSeed).toHaveBeenCalledTimes(1);
    // user create denendi ama transaction reject oldu → register dönüş üretmedi (rollback)
    expect(tx.user.create).toHaveBeenCalledTimes(1);
  });
});

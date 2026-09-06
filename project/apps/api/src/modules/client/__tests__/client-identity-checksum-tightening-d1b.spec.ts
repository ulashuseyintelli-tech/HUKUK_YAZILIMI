/**
 * D-1b (owner GO 2026-09-06) — KIMLIK CHECKSUM SIKILASTIRMASI (bilincli davranis degisikligi).
 *
 * Owner karari (a+b): canlidaki gercek kimlik verisi DEGISTIRILMEZ ve yapay degerle TAMAMLANMAZ
 * (olculen 7 pasif gecersiz-checksum kaydi "duzeltildi" SAYILMAZ); yalniz ileriye donuk iki yol
 * sikilasir:
 *   (1) `update()` ile DEGISTIRILEN ve DOLU TCKN/VKN degeri checksum'dan gecer — degismeyen
 *       legacy (gecersiz) deger isteği DUSURMEZ,
 *   (2) her `isActive:false → true` gecisinde (update ve create/dedup yollari) YAZILACAK SON
 *       kimlik gecerli olmalidir; kimlik duzeltmesi ile aktivasyon AYNI istekte gelirse SON
 *       degerler esas alinir; yazma dogrulanan duruma KOSULLU (eszamanli degisiklik dogrulamayi
 *       gecersiz kilamaz).
 *
 * Korunan sozlesmeler: bos kimlik SERBEST; `identityNo` (serbest/pasaport) DOGRULANMAZ;
 * lifecycle yetkisi (`assertCanManageLifecycle`) ve R1A reactivate kapisi DEGISMEDI.
 *
 * Kanit sinifi: saf util + servis birim testleri (Prisma mock; gercek DB DEGIL).
 */
import { BadRequestException, ConflictException } from '@nestjs/common';
import {
  assertChangedIdentityChecksum,
  assertReactivationIdentityChecksum,
  resolveEffectiveIdentity,
} from '../client-identity-checksum.util';

// Sabitler gercek validator ile DOGRULANDI (10000000146 gecerli TCKN, 4540536920 gecerli VKN,
// 12345678901 gecersiz TCKN, 1234567891 gecersiz VKN). Gercek kisi verisi DEGILDIR.
const VALID_TCKN = '10000000146';
const INVALID_TCKN = '12345678901';
const VALID_VKN = '4540536920';
const INVALID_VKN = '1234567891';

describe('D-1b — assertChangedIdentityChecksum (yalniz DEGISEN dolu deger dogrulanir)', () => {
  it('degismeyen legacy gecersiz TCKN isteği DUSURMEZ', () => {
    expect(() =>
      assertChangedIdentityChecksum({ phone: '555' } as any, { tckn: INVALID_TCKN, vkn: null }),
    ).not.toThrow();
    expect(() =>
      assertChangedIdentityChecksum({ tckn: INVALID_TCKN }, { tckn: INVALID_TCKN, vkn: null }),
    ).not.toThrow();
  });

  it('DEGISEN gecersiz TCKN 400 verir', () => {
    expect(() => assertChangedIdentityChecksum({ tckn: INVALID_TCKN }, { tckn: VALID_TCKN, vkn: null })).toThrow(
      BadRequestException,
    );
  });

  it('DEGISEN gecerli TCKN gecer', () => {
    expect(() => assertChangedIdentityChecksum({ tckn: VALID_TCKN }, { tckn: INVALID_TCKN, vkn: null })).not.toThrow();
  });

  it('kimligi BOSALTMA serbesttir (bos kimlik sozlesmesi korunur)', () => {
    expect(() => assertChangedIdentityChecksum({ tckn: '' }, { tckn: INVALID_TCKN, vkn: null })).not.toThrow();
    expect(() => assertChangedIdentityChecksum({ tckn: null }, { tckn: INVALID_TCKN, vkn: null })).not.toThrow();
  });

  it('VKN icin ayni kural gecerlidir', () => {
    expect(() => assertChangedIdentityChecksum({ vkn: INVALID_VKN }, { tckn: null, vkn: VALID_VKN })).toThrow(
      BadRequestException,
    );
    expect(() => assertChangedIdentityChecksum({ vkn: VALID_VKN }, { tckn: null, vkn: INVALID_VKN })).not.toThrow();
    expect(() => assertChangedIdentityChecksum({}, { tckn: null, vkn: INVALID_VKN })).not.toThrow();
  });

  it('identityNo (serbest/pasaport) DOGRULANMAZ', () => {
    expect(() => assertChangedIdentityChecksum({ identityNo: 'PASSPORT-XYZ' } as any, { tckn: null, vkn: null })).not.toThrow();
  });
});

describe('D-1b — resolveEffectiveIdentity / assertReactivationIdentityChecksum', () => {
  it('yeni deger verilmisse SON deger odur; verilmemisse mevcut deger', () => {
    expect(resolveEffectiveIdentity({ tckn: VALID_TCKN }, { tckn: INVALID_TCKN, vkn: null })).toEqual({
      tckn: VALID_TCKN,
      vkn: null,
    });
    expect(resolveEffectiveIdentity({}, { tckn: INVALID_TCKN, vkn: null })).toEqual({ tckn: INVALID_TCKN, vkn: null });
  });

  it('gecersiz SON kimlik 400 + stabil reasonCode + yalniz alan ADLARI', () => {
    let caught: any;
    try {
      assertReactivationIdentityChecksum({ tckn: INVALID_TCKN, vkn: null });
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect(caught.response.reasonCode).toBe('CLIENT_IDENTITY_CHECKSUM_INVALID');
    expect(caught.response.offendingFields).toEqual(['tckn']);
    expect(JSON.stringify(caught.response)).not.toContain(INVALID_TCKN); // DEGER tasinmaz
  });

  it('bos kimlikli (no-tckn) kayit reaktive EDILEBILIR', () => {
    expect(() => assertReactivationIdentityChecksum({ tckn: null, vkn: null })).not.toThrow();
  });

  it('gecerli kimlik gecer', () => {
    expect(() => assertReactivationIdentityChecksum({ tckn: VALID_TCKN, vkn: VALID_VKN })).not.toThrow();
  });
});

// ── Servis entegrasyonu (Prisma mock) ──────────────────────────────────────
import { ClientService } from '../client.service';

const TENANT = 'tenant-1';
const ID = 'client-1';
const ACTOR = { userId: 'user-1', tenantId: TENANT, role: 'ADMIN' as const };

function buildService(existing: any, opts: { updateCount?: number } = {}) {
  const tx: any = {
    client: {
      updateMany: jest.fn().mockResolvedValue({ count: opts.updateCount ?? 1 }),
      findFirst: jest.fn().mockResolvedValue({ ...existing, isActive: true }),
    },
    clientContact: { deleteMany: jest.fn(), createMany: jest.fn() },
    clientAddress: { count: jest.fn().mockResolvedValue(0), createMany: jest.fn() },
  };
  const prisma: any = {
    client: {
      // PR-U4 duplicate probe (where.id.not) BOS doner; asil okuma mevcut kaydi verir.
      findFirst: jest.fn().mockImplementation(async ({ where }: any) => (where?.id?.not ? null : existing)),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn().mockResolvedValue(existing),
    },
    clientConsent: { findFirst: jest.fn().mockResolvedValue(null) },
    $transaction: jest.fn().mockImplementation(async (fn: any) => fn(tx)),
  };
  const audit: any = { log: jest.fn(), logInTransaction: jest.fn() };
  const officeApproval: any = { isApproverEligible: jest.fn().mockResolvedValue(true) };
  const service: any = new ClientService(prisma, audit, officeApproval);
  // findOne / syncContactFollowUpTaskSafe gibi yan yollar bu testin konusu degil.
  jest.spyOn(service, 'findOne').mockResolvedValue({ id: ID } as any);
  jest.spyOn(service as any, 'syncContactFollowUpTaskSafe').mockResolvedValue(undefined as any);
  return { service, prisma, tx, audit, officeApproval };
}

describe('D-1b — ClientService.update() kimlik kapilari', () => {
  const base = {
    id: ID,
    tenantId: TENANT,
    isActive: true,
    tckn: INVALID_TCKN,
    vkn: null,
    type: 'INDIVIDUAL',
    firstName: 'A',
    lastName: 'B',
    contacts: [],
  };

  it('degismeyen legacy gecersiz TCKN ile standart alan guncellemesi CALISIR (kilitlenme yok)', async () => {
    const h = buildService(base);
    await h.service.update(ID, TENANT, { phone: '5551112233' }, ACTOR);
    expect(h.tx.client.updateMany).toHaveBeenCalledTimes(1);
  });

  it('DEGISEN gecersiz TCKN -> 400, hicbir yazma YOK', async () => {
    const h = buildService({ ...base, tckn: VALID_TCKN });
    await expect(h.service.update(ID, TENANT, { tckn: INVALID_TCKN }, ACTOR)).rejects.toBeInstanceOf(BadRequestException);
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('pasif kaydi aktifleştirme: mevcut kimlik gecersizse 400 (kayit DUZELTILMEZ, aktiflesmez)', async () => {
    const h = buildService({ ...base, isActive: false });
    let caught: any;
    try {
      await h.service.update(ID, TENANT, { isActive: true }, ACTOR);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(BadRequestException);
    expect(caught.response.reasonCode).toBe('CLIENT_IDENTITY_CHECKSUM_INVALID');
    expect(h.prisma.$transaction).not.toHaveBeenCalled();
  });

  it('kimlik duzeltmesi + aktivasyon AYNI istekte: YAZILACAK SON degerler esas alinir -> gecer', async () => {
    const h = buildService({ ...base, isActive: false });
    await h.service.update(ID, TENANT, { isActive: true, tckn: VALID_TCKN }, ACTOR);
    expect(h.tx.client.updateMany).toHaveBeenCalledTimes(1);
    // Reaktivasyon guard'i: yalniz isActive:false kosulu (tckn gonderildigi icin ona kosul EKLENMEZ)
    expect(h.tx.client.updateMany.mock.calls[0][0].where).toMatchObject({ id: ID, tenantId: TENANT, isActive: false });
  });

  it('aktivasyon yazimi DOGRULANAN duruma kosulludur (tckn gonderilmediyse mevcut deger where\'e girer)', async () => {
    const h = buildService({ ...base, isActive: false, tckn: VALID_TCKN });
    await h.service.update(ID, TENANT, { isActive: true }, ACTOR);
    expect(h.tx.client.updateMany.mock.calls[0][0].where).toMatchObject({
      id: ID,
      tenantId: TENANT,
      isActive: false,
      tckn: VALID_TCKN,
      vkn: null,
    });
  });

  it('eszamanli degisiklik (count 0) aktivasyonu SESSIZCE gecerli kilmaz -> CLIENT_STATE_CHANGED', async () => {
    const h = buildService({ ...base, isActive: false, tckn: VALID_TCKN }, { updateCount: 0 });
    let caught: any;
    try {
      await h.service.update(ID, TENANT, { isActive: true }, ACTOR);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(ConflictException);
    expect(caught.response.code).toBe('CLIENT_STATE_CHANGED');
  });

  it('normal (reaktivasyon olmayan) update where\'i DEGISMEZ — yalniz id + tenantId', async () => {
    const h = buildService({ ...base, tckn: VALID_TCKN });
    await h.service.update(ID, TENANT, { notes: 'x' }, ACTOR);
    expect(h.tx.client.updateMany.mock.calls[0][0].where).toEqual({ id: ID, tenantId: TENANT });
  });
});

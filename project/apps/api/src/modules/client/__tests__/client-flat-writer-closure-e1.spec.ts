/**
 * C2-I08 E1 — FLAT WRITER KAPATMA kanıtı (owner disposition 2026-08-06).
 *
 * P1 hedefi: legacy-flat (Client.address/city/district/region/postalCode) AKTİF
 * WRITER sayısı 0. Tek yazım kapısı ClientService.create/update olduğundan
 * (A1 envanteri: bypass yok; seed/import/OCR/case hepsi create üzerinden) bu spec:
 *   1. KAYNAK-PARSE guard: client.service.ts içindeki tx.client.create /
 *      tx.client.updateMany data bloklarında flat adres anahtarı KALMADIĞINI
 *      dosya metninden kanıtlar (yeni bir flat yazım eklenirse bu test DÜŞER).
 *   2. Import-şekilli dolaylı yol: export-import'un ürettiği flat-only dto ile
 *      create çağrısı — flat kolon yazılmaz, relational SENTEZLENİR (veri kaybı yok).
 * Public API imzaları DEĞİŞMEDİ (XL-3 regex sözleşmesi ayrı spec'te yaşıyor).
 */
import * as fs from 'fs';
import * as path from 'path';
import { ClientService } from '../client.service';

function buildHarness() {
  const txClientCreate = jest.fn().mockResolvedValue({ id: 'c-new', tckn: null, vkn: null });
  const tx: any = {
    client: { create: txClientCreate, updateMany: jest.fn().mockResolvedValue({ count: 1 }) },
    clientContact: { createMany: jest.fn() },
    clientAddress: { createMany: jest.fn(), count: jest.fn().mockResolvedValue(0) },
    auditLog: { create: jest.fn() },
  };
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn(async (fn: any) => fn(tx)),
  };
  const audit = { logInTransaction: jest.fn(), log: jest.fn() };
  const officeApproval = { isApproverEligible: jest.fn().mockResolvedValue(false) };
  const svc = new ClientService(prisma as any, audit as any, officeApproval as any);
  return { svc, tx };
}

describe('C2-I08 E1 — kaynak-parse guard (flat writer = 0)', () => {
  it('client.service.ts yazım bloklarında flat adres anahtarı YOK', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'client.service.ts'), 'utf8');
    // YALNIZ Client tablosu yazım blokları taranır (tx.client.create / tx.client.updateMany
    // çağrısından kapanışına kadar); ClientAddress relational yazımı ve legacy sentez
    // bloğu KAPSAM DIŞI (onlar E1'in koruduğu hedefin kendisi).
    const flatKey = /^\s+(address|city|district|region|postalCode):/m;
    for (const marker of ['tx.client.create(', 'tx.client.updateMany(']) {
      let from = 0;
      while (true) {
        const start = src.indexOf(marker, from);
        if (start === -1) break;
        const end = src.indexOf('});', start);
        const block = src.slice(start, end === -1 ? undefined : end);
        expect({ marker, flatWriteFound: flatKey.test(block) }).toEqual({ marker, flatWriteFound: false });
        from = start + marker.length;
      }
    }
    // addressStr/primaryAddress hesaplaması tamamen kaldırıldı (ölü kod da yok).
    expect(src.includes('addressStr')).toBe(false);
  });
});

describe('C2-I08 E1 — dolaylı yollar (import-şekilli flat-only dto)', () => {
  it('create: flat kolon yazılmaz; legacy flat girdi ClientAddress satırına sentezlenir', async () => {
    const { svc, tx } = buildHarness();
    // export-import.service.ts:390-393 eşlemesinin ürettiği şekil (Excel satırı):
    await svc.create('t1', {
      type: 'PERSON', firstName: 'Excel', lastName: 'Satiri', tckn: '11111111110',
      address: 'İthal Cad. 7', city: 'İzmir', district: 'Konak', postalCode: '35000',
    } as any, { userId: 'importer', tenantId: 't1', role: 'ADMIN' } as any);

    const data = tx.client.create.mock.calls[0][0].data;
    for (const flat of ['address', 'city', 'district', 'region', 'postalCode']) {
      expect(data[flat]).toBeUndefined();
    }
    const rows = tx.clientAddress.createMany.mock.calls[0][0].data;
    expect(rows[0]).toMatchObject({
      clientId: 'c-new', street: 'İthal Cad. 7', city: 'İzmir', district: 'Konak',
      postalCode: '35000', isPrimary: true,
    });
  });

  it('create: addresses[] + flat birlikteyse flat İKİNCİ kez sentezlenmez (çift satır yok)', async () => {
    const { svc, tx } = buildHarness();
    await svc.create('t1', {
      type: 'PERSON', firstName: 'A', lastName: 'B', tckn: '11111111110',
      address: 'Flat Cad', city: 'FlatŞehir',
      addresses: [{ street: 'Gerçek Cad', city: 'İstanbul', isPrimary: true }],
    } as any, { userId: 'u1', tenantId: 't1', role: 'ADMIN' } as any);

    const rows = tx.clientAddress.createMany.mock.calls[0][0].data;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ street: 'Gerçek Cad', city: 'İstanbul' });
  });
});

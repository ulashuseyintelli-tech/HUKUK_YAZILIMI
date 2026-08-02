/**
 * CLIENT-ARC-07-STAFF-HISTORY-I03 — staff-only aktif/arşiv adres okuma sözleşmesi.
 *
 * KANONİK OTORİTE: `CLIENT-GOVERNANCE-CHARTER.md` §49.7 (ARC-07-D06).
 * PREDECESSORS: I01 (PR #1943, `c537cb3a`) invariant resolver · I02 (PR #1958, `b5bf8977`)
 * arşiv/restore aksiyonları. Bu dilim MUTASYON EKLEMEZ — yalnız okuma + UI yüzeyi.
 *
 * KAPSAM DIŞI (yokluğu da kanıtlanır): production kanıtı/backfill (I04–I06), resmî tüketici
 * retarget'ı (I07), legacy flat azaltımı (I08), portal expozürü, create/update audit.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ClientAddressController } from '../client-address.controller';
import { ClientAddressService } from '../client-address.service';

const SERVICE_SOURCE = readFileSync(join(__dirname, '..', 'client-address.service.ts'), 'utf-8');
const CONTROLLER_SOURCE = readFileSync(join(__dirname, '..', 'client-address.controller.ts'), 'utf-8');
const SCHEMA_SOURCE = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'prisma', 'schema.prisma'),
  'utf-8',
);

type Row = {
  id: string;
  clientId: string;
  isPrimary: boolean;
  isCurrent: boolean;
};

function buildSvc(opts: { rows?: Row[]; clientFound?: boolean } = {}) {
  const rows = opts.rows ?? [];
  const prisma: any = {
    client: {
      findFirst: jest
        .fn()
        .mockImplementation(({ where }: any) =>
          Promise.resolve(opts.clientFound === false ? null : { id: where.id }),
        ),
    },
    clientAddress: {
      // Prisma semantiğine SADIK: yalnız `where`'de GERÇEKTEN bulunan predicate uygulanır.
      // Scope predicate'i kaldıran mutasyonun testi YANLIŞLIKLA geçmesin diye şarttır.
      findMany: jest.fn().mockImplementation(({ where }: any) =>
        Promise.resolve(
          rows.filter(
            (r) =>
              (where.clientId === undefined || r.clientId === where.clientId) &&
              (where.isCurrent === undefined || r.isCurrent === where.isCurrent),
          ),
        ),
      ),
    },
  };
  const audit: any = { logInTransaction: jest.fn(), log: jest.fn() };
  // OWN-13 I02-R2: servis artik OfficeApprovalService de alir. Bu suite OKUMA projeksiyonunu
  // olcer (mutasyon YOK) → stub cagrilmaz; yine de ACIK verilir, bos nesne birakilmaz.
  const officeApproval: any = { isApproverEligible: jest.fn().mockResolvedValue(false) };
  return { svc: new ClientAddressService(prisma, audit, officeApproval), prisma };
}

const MIXED: Row[] = [
  { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
  { id: 'a2', clientId: 'c1', isPrimary: false, isCurrent: true },
  { id: 'a3', clientId: 'c1', isPrimary: false, isCurrent: false },
  { id: 'a4', clientId: 'c1', isPrimary: false, isCurrent: false },
];

const whereOf = (prisma: any) => prisma.clientAddress.findMany.mock.calls[0][0].where;
const argsOf = (prisma: any) => prisma.clientAddress.findMany.mock.calls[0][0];

// ————————————————————————————————————————————————————————————————————————
// OKUMA SÖZLEŞMESİ
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I03 — okuma sözleşmesi', () => {
  it('[1] status=active YALNIZ isCurrent=true satırları döner', async () => {
    const { svc, prisma } = buildSvc({ rows: MIXED });
    const rows = await svc.findForClient('t1', 'c1', 'active');
    expect(whereOf(prisma).isCurrent).toBe(true);
    expect(rows.map((r: any) => r.id)).toEqual(['a1', 'a2']);
  });

  it('[2] status=archived YALNIZ isCurrent=false satırları döner', async () => {
    const { svc, prisma } = buildSvc({ rows: MIXED });
    const rows = await svc.findForClient('t1', 'c1', 'archived');
    expect(whereOf(prisma).isCurrent).toBe(false);
    expect(rows.map((r: any) => r.id)).toEqual(['a3', 'a4']);
  });

  it('[3] status=all her ikisini döner (isCurrent predicate\'i HİÇ eklenmez)', async () => {
    const { svc, prisma } = buildSvc({ rows: MIXED });
    const rows = await svc.findForClient('t1', 'c1', 'all');
    expect(whereOf(prisma)).not.toHaveProperty('isCurrent');
    expect(rows.map((r: any) => r.id)).toEqual(['a1', 'a2', 'a3', 'a4']);
  });

  it('[4] birincil işareti KORUNUR — isPrimary seçilir ve birincil önce sıralanır', async () => {
    const { svc, prisma } = buildSvc({ rows: MIXED });
    await svc.findForClient('t1', 'c1', 'active');
    const args = argsOf(prisma);
    expect(args.select.isPrimary).toBe(true);
    expect(args.orderBy).toEqual([{ isPrimary: 'desc' }, { createdAt: 'asc' }]);
  });

  it('[5] tenant + client kapsamı UYGULANIR (iki katman: müvekkil çözümü + sorgu predicate\'i)', async () => {
    const { svc, prisma } = buildSvc({ rows: MIXED });
    await svc.findForClient('t1', 'c1', 'active');
    expect(prisma.client.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c1', tenantId: 't1' } }),
    );
    expect(whereOf(prisma)).toMatchObject({ clientId: 'c1', client: { tenantId: 't1' } });
  });

  it('[6] tenant/client dışı okuma FAIL-CLOSED 404 — boş liste DEĞİL (varlık sızdırmaz)', async () => {
    const { svc, prisma } = buildSvc({ rows: MIXED, clientFound: false });
    await expect(svc.findForClient('t-other', 'c1', 'all')).rejects.toBeInstanceOf(NotFoundException);
    // Adres sorgusu HİÇ çalıştırılmaz.
    expect(prisma.clientAddress.findMany).not.toHaveBeenCalled();
  });

  it('[8] aktif adres yoksa boş dizi döner (hata değil)', async () => {
    const { svc } = buildSvc({ rows: [{ id: 'a3', clientId: 'c1', isPrimary: false, isCurrent: false }] });
    await expect(svc.findForClient('t1', 'c1', 'active')).resolves.toEqual([]);
  });

  it('[9] arşivli adres yoksa boş dizi döner (hata değil)', async () => {
    const { svc } = buildSvc({ rows: [{ id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true }] });
    await expect(svc.findForClient('t1', 'c1', 'archived')).resolves.toEqual([]);
  });

  it('[9b] bilinmeyen status SESSİZCE active\'e düşmez — fail-closed 400', async () => {
    const { svc, prisma } = buildSvc({ rows: MIXED });
    await expect(svc.findForClient('t1', 'c1', 'hepsi' as any)).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_INVALID_STATUS_FILTER' },
    });
    expect(prisma.clientAddress.findMany).not.toHaveBeenCalled();
  });

  it('[9c] varsayılan status active\'tir (parametre verilmezse arşiv SIZMAZ)', async () => {
    const { svc, prisma } = buildSvc({ rows: MIXED });
    const rows = await svc.findForClient('t1', 'c1');
    expect(whereOf(prisma).isCurrent).toBe(true);
    expect(rows.every((r: any) => r.id !== 'a3')).toBe(true);
  });
});

// ————————————————————————————————————————————————————————————————————————
// PROJEKSİYON
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I03 — yanıt projeksiyonu', () => {
  it('[P1] YALNIZ personel adres yönetimi alanları seçilir (12 alan, tam liste)', async () => {
    const { svc, prisma } = buildSvc({ rows: MIXED });
    await svc.findForClient('t1', 'c1', 'all');
    expect(Object.keys(argsOf(prisma).select).sort()).toEqual(
      [
        'city',
        'clientId',
        'createdAt',
        'district',
        'id',
        'isCurrent',
        'isPrimary',
        'postalCode',
        'region',
        'street',
        'type',
        'updatedAt',
      ].sort(),
    );
  });

  it('[P2] ilişkili müvekkil verisi, audit iç yapıları ve tanılama alanları SEÇİLMEZ', async () => {
    const { svc, prisma } = buildSvc({ rows: MIXED });
    await svc.findForClient('t1', 'c1', 'all');
    const select = argsOf(prisma).select;
    for (const forbidden of ['client', 'tenantId', 'auditLog', 'metadata', 'oldValues', 'newValues']) {
      expect(select).not.toHaveProperty(forbidden);
    }
  });

  it('[P3] yeni audit veri deposu OLUŞTURULMADI — okuma yolu yalnız ClientAddress tablosunu kullanır', () => {
    // §8: yeniden kullanılabilir audit-history API/UI yok → audit görünürlüğü ERTELENDİ.
    // Arşiv/aktif ayrımı `isCurrent` durumundan türer, ayrı bir geçmiş tablosu YOK.
    expect(SERVICE_SOURCE).not.toMatch(/addressHistory|AddressHistory|clientAddressHistory/);
    expect(SERVICE_SOURCE).not.toMatch(/\$executeRaw|\$queryRaw/);
  });
});

// ————————————————————————————————————————————————————————————————————————
// CONTROLLER / YETKİLENDİRME
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I03 — controller ve yetkilendirme', () => {
  function buildController() {
    const service: any = {
      findForClient: jest.fn().mockResolvedValue([]),
      archive: jest.fn(),
      restore: jest.fn(),
    };
    return { ctrl: new ClientAddressController(service), service };
  }

  it('[C1] tenantId YALNIZ JWT\'den geçirilir; status normalize edilir', async () => {
    const { ctrl, service } = buildController();
    await ctrl.list({ user: { id: 'u1', tenantId: 't1' } } as any, 'c1', 'archived');
    expect(service.findForClient).toHaveBeenCalledWith('t1', 'c1', 'archived');
  });

  it('[C2] status verilmezse active kullanılır', async () => {
    const { ctrl, service } = buildController();
    await ctrl.list({ user: { id: 'u1', tenantId: 't1' } } as any, 'c1', undefined);
    expect(service.findForClient).toHaveBeenCalledWith('t1', 'c1', 'active');
  });

  it('[C3] bilinmeyen status controller katmanında da fail-closed reddedilir', async () => {
    const { ctrl, service } = buildController();
    expect(() => ctrl.list({ user: { id: 'u1', tenantId: 't1' } } as any, 'c1', 'hepsi')).toThrow(
      BadRequestException,
    );
    expect(service.findForClient).not.toHaveBeenCalled();
  });

  it('[7/32] PORTAL expozürü YOK — tek guard JwtAuthGuard, portal import/route/guard yok', () => {
    expect(CONTROLLER_SOURCE).toMatch(/@UseGuards\(JwtAuthGuard\)/);
    expect(CONTROLLER_SOURCE.match(/@UseGuards\(/g) ?? []).toHaveLength(1);
    expect(CONTROLLER_SOURCE).not.toMatch(/PortalAuthGuard|portal-auth|portal\.guard/i);
    expect(CONTROLLER_SOURCE).not.toMatch(/from '[^']*portal[^']*'/i);
    expect(CONTROLLER_SOURCE).not.toMatch(/@(Get|Post|Put|Patch|Delete)\('[^']*portal/i);
  });

  it('[32b] tek GET vardır ve NESTED/scope\'ludur — kapsamsız tekil adres GET\'i YOK', () => {
    expect(CONTROLLER_SOURCE.match(/@Get\(/g) ?? []).toHaveLength(1);
    expect(CONTROLLER_SOURCE).toMatch(/@Get\('clients\/:clientId\/addresses'\)/);
    expect(CONTROLLER_SOURCE).not.toMatch(/@Get\('addresses/);
  });

  it('[32c] I02 mutation route\'ları ÇOĞALTILMADI — tam 3 POST, 1 PUT, 1 DELETE', () => {
    expect(CONTROLLER_SOURCE.match(/@Post\(/g) ?? []).toHaveLength(3);
    expect(CONTROLLER_SOURCE.match(/@Put\(/g) ?? []).toHaveLength(1);
    expect(CONTROLLER_SOURCE.match(/@Delete\(/g) ?? []).toHaveLength(1);
  });

  it('[32d] yetkilendirme ReportingLine\'dan TÜRETİLMEZ ve OFFICE scope politikası okunmaz', () => {
    expect(CONTROLLER_SOURCE).not.toMatch(/reportingLine|ReportingLine/i);
    expect(SERVICE_SOURCE).not.toMatch(/reportingLine|ReportingLine/i);
    // ARC-07-D06 / §49.7'nin ASIL invariant'ı: yetkilendirme ReportingLine'dan TÜRETİLMEZ ve
    // OFFICE **scope/görünürlük** politikası OKUNMAZ. Bu KORUNUR.
    expect(SERVICE_SOURCE).not.toMatch(/officeScope|OfficeScope/i);

    // OWN-13 I02-R2 (owner D06 RATIFIED): adres MUTASYON yetkisinin elevated eşiği artık
    // mevcut kanonik `officeApproval.isApproverEligible` predicate'idir — CLIENT ikinci bir
    // capability sistemi kurmasın diye. Bu, yukarıdaki scope/görünürlük yasağını GEVŞETMEZ:
    // office-approval'dan YALNIZ `isApproverEligible` kullanılır, başka hiçbir üyesi değil.
    const officeApprovalUsages = [...SERVICE_SOURCE.matchAll(/officeApproval\.(\w+)/g)].map((m) => m[1]);
    expect([...new Set(officeApprovalUsages)]).toEqual(['isApproverEligible']);
  });
});

// ————————————————————————————————————————————————————————————————————————
// KAPSAM SINIRLARI
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I03 — kapsam sınırları', () => {
  it('[B1] SCHEMA/MIGRATION değişmedi — archivedAt/archivedBy KOLONU YOK ve kullanılmıyor (§13)', () => {
    // NOT: kaynakta KELİMEYİ aramak yeterli DEĞİL — yorum, kolonun neden EKLENMEDİĞİNİ ve
    // sıralamanın neden createdAt üzerinden yapıldığını açıklar. Ölçülen şey gerçek yüzey:
    // Prisma modelinde kolon var mı, ve kodda alan olarak kullanılıyor mu.
    const start = SCHEMA_SOURCE.indexOf('model ClientAddress');
    expect(start).toBeGreaterThan(-1);
    const model = SCHEMA_SOURCE.slice(start, SCHEMA_SOURCE.indexOf('\n}', start));
    expect(model).not.toMatch(/archivedAt|archivedBy|restoredAt|restoredBy/);
    // Kodda alan/atama olarak kullanım yok (yalnız açıklayıcı yorum var).
    expect(SERVICE_SOURCE).not.toMatch(/archivedAt\s*:/);
    expect(SERVICE_SOURCE).not.toMatch(/archivedBy\s*:/);
    expect(SERVICE_SOURCE).not.toMatch(/restoredAt\s*:|restoredBy\s*:/);
  });

  it('[B2] backfill / production mutasyonu / resmî tüketici retarget\'ı YOK (I04–I08)', () => {
    expect(SERVICE_SOURCE).not.toMatch(/backfill/i);
    expect(SERVICE_SOURCE).not.toMatch(/document|uyap|template/i);
    expect(SERVICE_SOURCE).not.toMatch(/createMany|deleteMany/);
  });

  it('[B3] I04A KASITLI GÜNCELLEME: create/update audit residual KAPANDI — TAM action kümesi', () => {
    // I03 yazıldığında `CLIENT_ADDRESS_CREATE_UPDATE_AUDIT` AÇIK residual'dı ve bu test onun
    // YOKLUĞUNU pinliyordu. `CLIENT-ARC-07-CREATE-UPDATE-AUDIT-I04A` residual'ı KAPATTI.
    // Test GEVŞETİLMEDİ — beklenti TAM liste olarak yeniden yazıldı, böylece sessizce yeni bir
    // audit action eklenmesi hâlâ testi kırar.
    const auditActions = (SERVICE_SOURCE.match(/action: 'CLIENT_ADDRESS_[A-Z_]+'/g) ?? []).sort();
    expect(auditActions).toEqual([
      "action: 'CLIENT_ADDRESS_ARCHIVE'",
      "action: 'CLIENT_ADDRESS_CREATE'",
      "action: 'CLIENT_ADDRESS_PRIMARY_REASSIGN'",
      "action: 'CLIENT_ADDRESS_PRIMARY_REASSIGN'",
      "action: 'CLIENT_ADDRESS_PRIMARY_REASSIGN'",
      "action: 'CLIENT_ADDRESS_PRIMARY_REASSIGN'",
      "action: 'CLIENT_ADDRESS_RESTORE'",
      "action: 'CLIENT_ADDRESS_UPDATE'",
    ]);
    // MÜKERRER action adı ÜRETİLMEDİ: yeniden-atama I02'nin kanonik action'ını YENİDEN KULLANIR.
    expect(SERVICE_SOURCE).not.toMatch(/CLIENT_ADDRESS_REASSIGN'|CLIENT_ADDRESS_PRIMARY_CHANGE'/);
    // Okuma yüzeyi audit YAZMAZ (okuma mutasyon değildir).
    expect(SERVICE_SOURCE).not.toMatch(/CLIENT_ADDRESS_READ'|CLIENT_ADDRESS_LIST'/);
  });

  it('[B4] DebtorAddress ve flat Client adres kolonları bu serviste hiç geçmez', () => {
    expect(SERVICE_SOURCE).not.toMatch(/debtorAddress|DebtorAddress/);
    expect(SERVICE_SOURCE).not.toMatch(/clientPrimaryAddress|clientResolvedAddress/);
  });
});

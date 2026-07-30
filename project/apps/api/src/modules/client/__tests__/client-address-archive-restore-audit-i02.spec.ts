/**
 * CLIENT-ARC-07-ARCHIVE-RESTORE-AUDIT-I02 — açık arşiv/restore yaşam döngüsü, deterministik
 * birincil yeniden-atama, transaction-bağlı lifecycle audit ve fiziksel silme fail-closed.
 *
 * KANONİK OTORİTE: `CLIENT-GOVERNANCE-CHARTER.md` §49.4 (ARC-07-D03) + §49.9 (POL-E hizalaması).
 * PREDECESSOR: `CLIENT-ARC-07-LIFECYCLE-INVARIANT-I01` (PR #1943) — saf resolver ve
 * transaction-içi invariant guard'ı bu dilimde YENİDEN YAZILMADI, TÜKETİLDİ.
 *
 * KAPSAM DIŞI (bu spec bunların YOKLUĞUNU da kanıtlar): staff history GET, arşiv/history UI,
 * portal expozürü, production backfill, resmî tüketici retarget'ı, legacy flat alan azaltımı.
 *
 * Prisma mock'lanmıştır (ClientAddress dev DB'de yok — ClientAddress-1'den beri bilinçli).
 * `$transaction` mock'u GERÇEK semantiği taklit eder: callback throw ederse hiçbir yazma
 * commit edilmiş sayılmaz ve `wasRolledBack()` true döner.
 */
import { BadRequestException, NotFoundException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { ClientAddressService } from '../client-address.service';

const SERVICE_SOURCE = readFileSync(join(__dirname, '..', 'client-address.service.ts'), 'utf-8');
const CONTROLLER_SOURCE = readFileSync(join(__dirname, '..', 'client-address.controller.ts'), 'utf-8');
const DTO_SOURCE = readFileSync(join(__dirname, '..', 'dto', 'client-address.dto.ts'), 'utf-8');
const SCHEMA_SOURCE = readFileSync(
  join(__dirname, '..', '..', '..', '..', 'prisma', 'schema.prisma'),
  'utf-8',
);

type Sib = { id: string; clientId: string; isPrimary: boolean; isCurrent: boolean };

function buildSvc(opts: { siblings: Sib[]; auditFails?: boolean }) {
  const tx = {
    clientAddress: {
      findMany: jest.fn().mockResolvedValue(opts.siblings),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      update: jest
        .fn()
        .mockImplementation(async ({ where, data }: any) => ({ id: where.id, clientId: 'c1', ...data })),
      create: jest.fn(),
      delete: jest.fn(),
    },
  };
  let rolledBack = false;
  const prisma: any = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'c1' }) },
    clientAddress: {
      // Prisma semantiğine SADIK: yalnız `where`'de GERÇEKTEN bulunan predicate'ler uygulanır.
      // Bu önemlidir — `clientId` predicate'i kaldırılırsa sorgu kapsam dışı satırı BULUR ve
      // scope testleri kırılır (diş testi bunu kanıtlar). Predicate'i mock'ta sabitlemek,
      // guard kaldırıldığında testin yanlışlıkla geçmesine yol açardı.
      findFirst: jest.fn().mockImplementation(({ where }: any) => {
        const found = opts.siblings.find(
          (s) =>
            s.id === where.id &&
            (where.clientId === undefined || s.clientId === where.clientId),
        );
        return Promise.resolve(
          found
            ? { ...found, type: 'BEYAN', street: null, city: null, district: null, region: null, postalCode: null }
            : null,
        );
      }),
      delete: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => {
      try {
        return await cb(tx);
      } catch (e) {
        rolledBack = true;
        throw e;
      }
    }),
  };
  const audit: any = {
    // Gerçek `logInTransaction` hata YUTMAZ; mock da yutmaz.
    logInTransaction: jest.fn().mockImplementation(async () => {
      if (opts.auditFails) throw new Error('audit sink down');
    }),
    log: jest.fn(),
  };
  return {
    svc: new ClientAddressService(prisma, audit),
    prisma,
    tx,
    audit,
    wasRolledBack: () => rolledBack,
  };
}

const TWO_CURRENT: Sib[] = [
  { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
  { id: 'a2', clientId: 'c1', isPrimary: false, isCurrent: true },
];

const auditCalls = (audit: any) => audit.logInTransaction.mock.calls.map((c: any[]) => c[1]);
const auditByAction = (audit: any, action: string) =>
  auditCalls(audit).find((i: any) => i.action === action);

// ————————————————————————————————————————————————————————————————————————
// ARŞİVLEME
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I02 — archive()', () => {
  it('[1] güncel non-primary adres arşivlenir', async () => {
    const { svc, prisma } = buildSvc({ siblings: TWO_CURRENT });
    const res = await svc.archive('t1', 'c1', 'a2');
    expect(res).toMatchObject({ isCurrent: false, isPrimary: false });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('[2] arşivlenen satır isCurrent=false + isPrimary=false olur ve SİLİNMEZ', async () => {
    const { svc, tx } = buildSvc({ siblings: TWO_CURRENT });
    await svc.archive('t1', 'c1', 'a2');
    expect(tx.clientAddress.update).toHaveBeenCalledWith({
      where: { id: 'a2' },
      data: { isCurrent: false, isPrimary: false },
    });
    expect(tx.clientAddress.delete).not.toHaveBeenCalled();
  });

  it('[3] birincil adres GEÇERLİ replacement ile arşivlenir — ikisi AYNI transaction\'da', async () => {
    const { svc, tx, prisma } = buildSvc({ siblings: TWO_CURRENT });
    await svc.archive('t1', 'c1', 'a1', { replacementPrimaryAddressId: 'a2' });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    // Yeniden-atama, hedefin arşivlenmesinden ÖNCE uygulanır (ara durumda primary\'siz kalınmaz).
    const reassign = tx.clientAddress.update.mock.invocationCallOrder[0];
    const archiveWrite = tx.clientAddress.update.mock.invocationCallOrder[1];
    expect(reassign).toBeLessThan(archiveWrite);
  });

  it('[4] replacement adres birincil OLUR', async () => {
    const { svc, tx } = buildSvc({ siblings: TWO_CURRENT });
    await svc.archive('t1', 'c1', 'a1', { replacementPrimaryAddressId: 'a2' });
    expect(tx.clientAddress.update).toHaveBeenCalledWith({
      where: { id: 'a2' },
      data: { isPrimary: true },
    });
  });

  it('[5] hedef arşivli + non-primary olur', async () => {
    const { svc, tx } = buildSvc({ siblings: TWO_CURRENT });
    await svc.archive('t1', 'c1', 'a1', { replacementPrimaryAddressId: 'a2' });
    expect(tx.clientAddress.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { isCurrent: false, isPrimary: false },
    });
  });

  it('[6] geride güncel adres KALIRKEN replacement\'sız birincil arşivi REDDEDİLİR', async () => {
    const { svc, tx } = buildSvc({ siblings: TWO_CURRENT });
    await expect(svc.archive('t1', 'c1', 'a1')).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_REPLACEMENT_PRIMARY_REQUIRED' },
    });
    expect(tx.clientAddress.update).not.toHaveBeenCalled();
  });

  it('[7] SON güncel adres (birincil) replacement OLMADAN arşivlenir — sıfır current/sıfır primary GEÇERLİ', async () => {
    const { svc, tx } = buildSvc({
      siblings: [{ id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true }],
    });
    await svc.archive('t1', 'c1', 'a1');
    expect(tx.clientAddress.update).toHaveBeenCalledWith({
      where: { id: 'a1' },
      data: { isCurrent: false, isPrimary: false },
    });
  });

  it('[8] BAŞKA müvekkile ait replacement REDDEDİLİR (kapsam dışı → bulunamadı)', async () => {
    const { svc, tx } = buildSvc({
      siblings: [
        ...TWO_CURRENT,
        // Farklı müvekkilin satırı kardeş kümesine ASLA girmez; kimliği tahmin edilse bile.
      ],
    });
    await expect(
      svc.archive('t1', 'c1', 'a1', { replacementPrimaryAddressId: 'other-client-addr' }),
    ).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_REPLACEMENT_PRIMARY_NOT_FOUND' },
    });
    expect(tx.clientAddress.update).not.toHaveBeenCalled();
  });

  it('[9] ARŞİVLİ bir adres replacement olarak REDDEDİLİR', async () => {
    const { svc, tx } = buildSvc({
      siblings: [
        { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
        { id: 'a2', clientId: 'c1', isPrimary: false, isCurrent: true },
        { id: 'a3', clientId: 'c1', isPrimary: false, isCurrent: false },
      ],
    });
    await expect(
      svc.archive('t1', 'c1', 'a1', { replacementPrimaryAddressId: 'a3' }),
    ).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_REPLACEMENT_PRIMARY_NOT_CURRENT' },
    });
    expect(tx.clientAddress.update).not.toHaveBeenCalled();
  });

  it('[10] ZATEN ARŞİVLİ adres için sabit hata döner (idempotent başarı DEĞİL)', async () => {
    const { svc, tx } = buildSvc({
      siblings: [
        { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
        { id: 'a3', clientId: 'c1', isPrimary: false, isCurrent: false },
      ],
    });
    await expect(svc.archive('t1', 'c1', 'a3')).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_ALREADY_ARCHIVED' },
    });
    expect(tx.clientAddress.update).not.toHaveBeenCalled();
  });

  it('[11] öngörülen-durum invariant doğrulaması COMMIT\'TEN ÖNCE çalışır (bozuk legacy veri fail-closed)', async () => {
    // Depoda ZATEN iki güncel birincil var (INV-06 ihlali). Non-primary bir satırı arşivlemek
    // ihlali ÇÖZMEZ → öngörülen küme reddedilir ve HİÇBİR yazma yapılmaz.
    const { svc, tx, wasRolledBack } = buildSvc({
      siblings: [
        { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
        { id: 'a2', clientId: 'c1', isPrimary: true, isCurrent: true },
        { id: 'a3', clientId: 'c1', isPrimary: false, isCurrent: true },
      ],
    });
    await expect(svc.archive('t1', 'c1', 'a3')).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_LIFECYCLE_VIOLATION', violation: 'MULTIPLE_PRIMARY' },
    });
    expect(tx.clientAddress.update).not.toHaveBeenCalled();
    expect(wasRolledBack()).toBe(true);
  });

  it('[12] audit yazımı BAŞARISIZ olursa arşivleme ROLLBACK olur', async () => {
    const { svc, wasRolledBack } = buildSvc({ siblings: TWO_CURRENT, auditFails: true });
    await expect(svc.archive('t1', 'c1', 'a2')).rejects.toThrow('audit sink down');
    expect(wasRolledBack()).toBe(true);
  });

  it('[12b] adres KENDİ yerine replacement seçilemez', async () => {
    const { svc } = buildSvc({ siblings: TWO_CURRENT });
    await expect(
      svc.archive('t1', 'c1', 'a1', { replacementPrimaryAddressId: 'a1' }),
    ).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_REPLACEMENT_PRIMARY_INVALID' },
    });
  });

  it('[12c] BAŞKA müvekkilin adresini arşivleme 404 (fail-closed, varlık sızdırmaz)', async () => {
    const { svc, prisma } = buildSvc({
      siblings: [{ id: 'a1', clientId: 'c-other', isPrimary: true, isCurrent: true }],
    });
    await expect(svc.archive('t1', 'c1', 'a1')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

// ————————————————————————————————————————————————————————————————————————
// GERİ ALMA
// ————————————————————————————————————————————————————————————————————————

const ARCHIVED_PLUS_CURRENT: Sib[] = [
  { id: 'a1', clientId: 'c1', isPrimary: true, isCurrent: true },
  { id: 'a3', clientId: 'c1', isPrimary: false, isCurrent: false },
];

describe('ARC-07 I02 — restore()', () => {
  it('[13] arşivli adres geri alınır', async () => {
    const { svc, prisma } = buildSvc({ siblings: ARCHIVED_PLUS_CURRENT });
    const res = await svc.restore('t1', 'c1', 'a3');
    expect(res).toMatchObject({ isCurrent: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
  });

  it('[14] VARSAYILAN: geri alınan adres güncel + NON-PRIMARY olur', async () => {
    const { svc, tx } = buildSvc({ siblings: ARCHIVED_PLUS_CURRENT });
    await svc.restore('t1', 'c1', 'a3');
    expect(tx.clientAddress.update).toHaveBeenCalledWith({
      where: { id: 'a3' },
      data: { isCurrent: true, isPrimary: false },
    });
    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
  });

  it('[15] makePrimary=true eski birinciyi AYNI transaction\'da düşürür', async () => {
    const { svc, tx, prisma } = buildSvc({ siblings: ARCHIVED_PLUS_CURRENT });
    await svc.restore('t1', 'c1', 'a3', { makePrimary: true });
    expect(prisma.$transaction).toHaveBeenCalledTimes(1);
    expect(tx.clientAddress.updateMany).toHaveBeenCalledWith({
      where: { clientId: 'c1', isPrimary: true },
      data: { isPrimary: false },
    });
    expect(tx.clientAddress.update).toHaveBeenCalledWith({
      where: { id: 'a3' },
      data: { isCurrent: true, isPrimary: true },
    });
  });

  it('[16] restore ÇOK-PRIMARY üretemez — unset, hedef yazımından ÖNCE gelir', async () => {
    const { svc, tx } = buildSvc({ siblings: ARCHIVED_PLUS_CURRENT });
    await svc.restore('t1', 'c1', 'a3', { makePrimary: true });
    expect(tx.clientAddress.updateMany.mock.invocationCallOrder[0]).toBeLessThan(
      tx.clientAddress.update.mock.invocationCallOrder[0],
    );
  });

  it('[17] ZATEN GÜNCEL adres için sabit hata döner', async () => {
    const { svc, tx } = buildSvc({ siblings: ARCHIVED_PLUS_CURRENT });
    await expect(svc.restore('t1', 'c1', 'a1')).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_ALREADY_CURRENT' },
    });
    expect(tx.clientAddress.update).not.toHaveBeenCalled();
  });

  it('[18] BAŞKA müvekkilin adresini geri alma 404 (fail-closed)', async () => {
    const { svc, prisma } = buildSvc({
      siblings: [{ id: 'a3', clientId: 'c-other', isPrimary: false, isCurrent: false }],
    });
    await expect(svc.restore('t1', 'c1', 'a3')).rejects.toBeInstanceOf(NotFoundException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('[19] audit yazımı BAŞARISIZ olursa geri alma ROLLBACK olur', async () => {
    const { svc, wasRolledBack } = buildSvc({ siblings: ARCHIVED_PLUS_CURRENT, auditFails: true });
    await expect(svc.restore('t1', 'c1', 'a3')).rejects.toThrow('audit sink down');
    expect(wasRolledBack()).toBe(true);
  });

  it('[19b] TEK güncel satır olacaksa birincilik INVARIANT ile ZORUNLUDUR (politika seçimi değil)', async () => {
    // Tüm satırlar arşivli → geri alınan satır tek current olur. INV-03 gereği birincil OLMAK
    // ZORUNDADIR; alternatif geçerli durum YOKTUR, dolayısıyla otomatik terfi bir icat değildir.
    const { svc, tx } = buildSvc({
      siblings: [
        { id: 'a3', clientId: 'c1', isPrimary: false, isCurrent: false },
        { id: 'a4', clientId: 'c1', isPrimary: false, isCurrent: false },
      ],
    });
    await svc.restore('t1', 'c1', 'a3');
    expect(tx.clientAddress.update).toHaveBeenCalledWith({
      where: { id: 'a3' },
      data: { isCurrent: true, isPrimary: true },
    });
  });
});

// ————————————————————————————————————————————————————————————————————————
// FİZİKSEL SİLME — FAIL-CLOSED
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I02 — fiziksel silme fail-closed', () => {
  it('[20] GÜNCEL adresin fiziksel silinmesi reddedilir', async () => {
    const { svc, prisma } = buildSvc({ siblings: TWO_CURRENT });
    await expect(svc.remove('t1', 'c1', 'a2')).rejects.toMatchObject({
      response: { code: 'CLIENT_ADDRESS_PHYSICAL_DELETE_NOT_AUTHORIZED' },
    });
    expect(prisma.clientAddress.delete).not.toHaveBeenCalled();
  });

  it('[21] ARŞİVLİ adresin fiziksel silinmesi DE reddedilir (POL-E ön koşulları temsil edilmiyor)', async () => {
    const { svc, prisma } = buildSvc({ siblings: ARCHIVED_PLUS_CURRENT });
    await expect(svc.remove('t1', 'c1', 'a3')).rejects.toMatchObject({
      response: {
        code: 'CLIENT_ADDRESS_PHYSICAL_DELETE_NOT_AUTHORIZED',
        unsatisfiedPolicy: 'POL-E',
      },
    });
    expect(prisma.clientAddress.delete).not.toHaveBeenCalled();
  });

  it('[22] DELETE sessizce ARŞİVLEMEYE çevrilmez — hiçbir lifecycle yazması yapılmaz', async () => {
    const { svc, tx, prisma } = buildSvc({ siblings: TWO_CURRENT });
    await expect(svc.remove('t1', 'c1', 'a2')).rejects.toBeDefined();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(tx.clientAddress.update).not.toHaveBeenCalled();
    expect(tx.clientAddress.updateMany).not.toHaveBeenCalled();
  });

  it('[23] BİRİNCİL adres silme reddi KORUNUR (daha geniş fail-closed reddin içinde)', async () => {
    const { svc, prisma } = buildSvc({ siblings: TWO_CURRENT });
    await expect(svc.remove('t1', 'c1', 'a1')).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.clientAddress.delete).not.toHaveBeenCalled();
  });

  it('[24] sabit makine-okur kod + arşiv yönlendirmesi döner; 404 sözleşmesi korunur', async () => {
    const { svc } = buildSvc({ siblings: TWO_CURRENT });
    await expect(svc.remove('t1', 'c1', 'a2')).rejects.toMatchObject({
      response: {
        code: 'CLIENT_ADDRESS_PHYSICAL_DELETE_NOT_AUTHORIZED',
        archiveAction: expect.stringContaining('/archive'),
      },
    });
    // Kapsam dışı kimlik "silinemez" DEMEZ — 404 döner (varlık sızıntısı yok).
    const other = buildSvc({ siblings: [{ id: 'a9', clientId: 'c-other', isPrimary: true, isCurrent: true }] });
    await expect(other.svc.remove('t1', 'c1', 'a9')).rejects.toBeInstanceOf(NotFoundException);
  });
});

// ————————————————————————————————————————————————————————————————————————
// AUDIT
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I02 — lifecycle audit', () => {
  it('[25] arşivleme audit kaydı yazılır (önceki + sonraki yaşam döngüsü durumu ile)', async () => {
    const { svc, audit } = buildSvc({ siblings: TWO_CURRENT });
    await svc.archive('t1', 'c1', 'a2', {}, { userId: 'u1' });
    const rec = auditByAction(audit, 'CLIENT_ADDRESS_ARCHIVE');
    expect(rec).toMatchObject({
      tenantId: 't1',
      entityType: 'CLIENT_ADDRESS',
      entityId: 'a2',
      userId: 'u1',
      oldValues: { isCurrent: true, isPrimary: false },
      newValues: { isCurrent: false, isPrimary: false },
      metadata: { clientId: 'c1', replacementPrimaryAddressId: null },
    });
  });

  it('[26] geri alma audit kaydı yazılır', async () => {
    const { svc, audit } = buildSvc({ siblings: ARCHIVED_PLUS_CURRENT });
    await svc.restore('t1', 'c1', 'a3', {}, { userId: 'u1' });
    const rec = auditByAction(audit, 'CLIENT_ADDRESS_RESTORE');
    expect(rec).toMatchObject({
      tenantId: 't1',
      entityType: 'CLIENT_ADDRESS',
      entityId: 'a3',
      userId: 'u1',
      oldValues: { isCurrent: false },
      newValues: { isCurrent: true, isPrimary: false },
      metadata: { clientId: 'c1', becamePrimary: false },
    });
  });

  it('[27] birincil yeniden-atama audit kanıtı yazılır (her iki yönde)', async () => {
    const arch = buildSvc({ siblings: TWO_CURRENT });
    await arch.svc.archive('t1', 'c1', 'a1', { replacementPrimaryAddressId: 'a2' }, { userId: 'u1' });
    expect(auditByAction(arch.audit, 'CLIENT_ADDRESS_PRIMARY_REASSIGN')).toMatchObject({
      entityId: 'a2',
      newValues: { isPrimary: true },
      metadata: { previousPrimaryAddressId: 'a1', reason: 'PRIMARY_ARCHIVED' },
    });

    const rest = buildSvc({ siblings: ARCHIVED_PLUS_CURRENT });
    await rest.svc.restore('t1', 'c1', 'a3', { makePrimary: true }, { userId: 'u1' });
    expect(auditByAction(rest.audit, 'CLIENT_ADDRESS_PRIMARY_REASSIGN')).toMatchObject({
      entityId: 'a3',
      newValues: { isPrimary: true },
      metadata: { previousPrimaryAddressId: 'a1', reason: 'RESTORED_AS_PRIMARY' },
    });
  });

  it('[28] audit gövdesi YALNIZ kimlik/durum taşır — HAM ADRES İÇERİĞİ yazılmaz', async () => {
    const { svc, audit } = buildSvc({ siblings: TWO_CURRENT });
    await svc.archive('t1', 'c1', 'a1', { replacementPrimaryAddressId: 'a2' }, { userId: 'u1' });
    const serialized = JSON.stringify(auditCalls(audit));
    for (const field of ['street', 'city', 'district', 'region', 'postalCode']) {
      expect(serialized).not.toContain(field);
    }
    // Adres tipi de dahil edilmez (içerik değil ama gereksiz).
    expect(serialized).not.toContain('BEYAN');
  });

  it('[29] audit TRANSACTION-BAĞLI: mutation tx\'i ile aynı client\'a yazılır, fire-and-forget log() KULLANILMAZ', async () => {
    const { svc, tx, audit } = buildSvc({ siblings: TWO_CURRENT });
    await svc.archive('t1', 'c1', 'a2');
    expect(audit.logInTransaction).toHaveBeenCalled();
    // İlk argüman mutation'ın kullandığı AYNI transaction client'ı olmalı.
    expect(audit.logInTransaction.mock.calls[0][0]).toBe(tx);
    expect(audit.log).not.toHaveBeenCalled();
    // Kaynak seviyesinde de fire-and-forget audit YOK.
    expect(SERVICE_SOURCE).not.toMatch(/this\.audit\.log\(/);
  });

  it('[29b] her arşiv/restore en az BİR audit kaydı yazar (audit\'siz mutasyon YOK)', async () => {
    const arch = buildSvc({ siblings: TWO_CURRENT });
    await arch.svc.archive('t1', 'c1', 'a2');
    expect(arch.audit.logInTransaction).toHaveBeenCalledTimes(1);

    const rest = buildSvc({ siblings: ARCHIVED_PLUS_CURRENT });
    await rest.svc.restore('t1', 'c1', 'a3');
    expect(rest.audit.logInTransaction).toHaveBeenCalledTimes(1);

    const both = buildSvc({ siblings: TWO_CURRENT });
    await both.svc.archive('t1', 'c1', 'a1', { replacementPrimaryAddressId: 'a2' });
    // yeniden-atama + arşiv = 2 kayıt
    expect(both.audit.logInTransaction).toHaveBeenCalledTimes(2);
  });
});

// ————————————————————————————————————————————————————————————————————————
// KAPSAM SINIRLARI (I03+ HENÜZ UYGULANMADI)
// ————————————————————————————————————————————————————————————————————————

describe('ARC-07 I02 — kapsam sınırları', () => {
  it('[30] arşiv/restore AÇIK aksiyondur; generic DTO\'ya isCurrent/isPrimary alanı EKLENMEDİ', () => {
    expect(DTO_SOURCE).toMatch(/class ArchiveClientAddressDto/);
    expect(DTO_SOURCE).toMatch(/class RestoreClientAddressDto/);
    expect(DTO_SOURCE).toMatch(/replacementPrimaryAddressId\?: string/);
    expect(DTO_SOURCE).toMatch(/makePrimary\?: boolean/);
    // Create/Update DTO'sunda isCurrent HÂLÂ yok.
    expect(DTO_SOURCE).not.toMatch(/isCurrent\?:/);
  });

  it('[31] açık POST route\'ları var; GET/history endpoint YOK (I03 sınırı)', () => {
    expect(CONTROLLER_SOURCE).toMatch(/@Post\('clients\/:clientId\/addresses\/:addressId\/archive'\)/);
    expect(CONTROLLER_SOURCE).toMatch(/@Post\('clients\/:clientId\/addresses\/:addressId\/restore'\)/);
    expect(CONTROLLER_SOURCE).not.toMatch(/@Get\(/);
    expect(CONTROLLER_SOURCE).not.toMatch(/history/i);
  });

  it('[32] PORTAL expozürü YOK — tek guard JwtAuthGuard, portal guard/import/route yok', () => {
    // NOT: kaynakta "portal" KELİMESİNİ aramak yeterli DEĞİL — yorumlar §49.7 sınırını anlatmak
    // için bu kelimeyi kullanır. Ölçülen şey gerçek expozür yüzeyi: guard, import ve route path.
    expect(CONTROLLER_SOURCE).toMatch(/@UseGuards\(JwtAuthGuard\)/);
    // Başka hiçbir guard uygulanmaz (tek @UseGuards ve içinde yalnız JwtAuthGuard).
    expect(CONTROLLER_SOURCE.match(/@UseGuards\(/g) ?? []).toHaveLength(1);
    expect(CONTROLLER_SOURCE).not.toMatch(/PortalAuthGuard|portal-auth|portal\.guard/i);
    // Portal modülünden hiçbir şey import edilmez.
    expect(CONTROLLER_SOURCE).not.toMatch(/from '[^']*portal[^']*'/i);
    expect(SERVICE_SOURCE).not.toMatch(/from '[^']*portal[^']*'/i);
    // Hiçbir route path'i portal altında değil.
    expect(CONTROLLER_SOURCE).not.toMatch(/@(Get|Post|Put|Patch|Delete)\('[^']*portal/i);
  });

  it('[33] actor YALNIZ auth context\'ten gelir — body\'den userId ASLA okunmaz', () => {
    expect(CONTROLLER_SOURCE).toMatch(/userId: req\.user\.id/);
    expect(CONTROLLER_SOURCE).not.toMatch(/dto\.userId|body\.userId/);
  });

  it('[34] SCHEMA DEĞİŞMEDİ — mevcut isCurrent/isPrimary kolonları kullanılır, raw SQL yok', () => {
    // ClientAddress modelinde bu iki kolon ZATEN vardı (20260702000000_client_address migration).
    expect(SCHEMA_SOURCE).toMatch(/isCurrent Boolean @default\(true\)/);
    expect(SERVICE_SOURCE).not.toMatch(/\$executeRaw|\$queryRaw/);
  });

  it('[35] backfill / production mutasyonu / resmî tüketici retarget\'ı bu dilimde YOK', () => {
    expect(SERVICE_SOURCE).not.toMatch(/backfill/i);
    expect(SERVICE_SOURCE).not.toMatch(/createMany|deleteMany/);
    expect(SERVICE_SOURCE).not.toMatch(/document|uyap|template/i);
  });

  it('[36] DebtorAddress ve flat Client adres kolonları bu serviste hiç geçmez', () => {
    expect(SERVICE_SOURCE).not.toMatch(/debtorAddress|DebtorAddress/);
    expect(SERVICE_SOURCE).not.toMatch(/clientPrimaryAddress|clientResolvedAddress/);
    expect(SERVICE_SOURCE).not.toMatch(/client\.update\(/);
  });
});

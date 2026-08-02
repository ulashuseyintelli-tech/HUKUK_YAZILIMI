/**
 * CLIENT-OWN-13-I02-R3 — seed CLIENT authority testleri (SAF, DB-siz; ClientService MOCK'lanır).
 *
 * Owner D04/D05/D07 (RATIFIED):
 *  - `/seed/clients`, `/seed/all`, `/seed/fix-clients` YALNIZ elevated aktör tarafından
 *    çalıştırılabilir (ADMIN tek başına YETMEZ) — gate HİÇBİR satır yazılmadan ÖNCE çalışır.
 *  - `seedClients` artık `prisma.client.create` DEĞİL, kanonik `ClientService.create`
 *    üzerinden yazar (checksum/dedup/audit tek merkezden gelir).
 *  - Satır-bazlı devam KORUNUR: bir satırın hatası önceki başarıları geri almaz, `failed`
 *    açıkça sayılır (hata sessizce başarı sayılmaz).
 */
import { ForbiddenException, BadRequestException } from '@nestjs/common';
import { SeedService } from '../seed.service';

const actorViewer = { userId: 'u1', tenantId: 't1', role: 'VIEWER' };
const actorElevated = { userId: 'u1', tenantId: 't1', role: 'USER' };

function buildDeniedClientService() {
  return {
    assertCanRunElevatedClientBulkOperation: jest
      .fn()
      .mockRejectedValue(new ForbiddenException({ code: 'CLIENT_MUTATION_DENIED_VIEWER' })),
    create: jest.fn(),
  } as any;
}

function buildAllowedClientService(createImpl?: (...args: any[]) => any) {
  return {
    assertCanRunElevatedClientBulkOperation: jest.fn().mockResolvedValue(undefined),
    create: createImpl
      ? jest.fn(createImpl)
      : jest.fn().mockImplementation(async () => ({ id: 'new-1', _existingReturned: false })),
  } as any;
}

const noopAudit = () => ({ log: jest.fn(), logInTransaction: jest.fn() } as any);

describe('SeedService.seedClients (D04/D05/D07)', () => {
  it('gate reddederse ClientService.create HİÇ çağrılmaz (hiçbir Client yazılmaz)', async () => {
    const clientService = buildDeniedClientService();
    const svc = new SeedService({} as any, noopAudit(), clientService);

    await expect(svc.seedClients('t1', actorViewer)).rejects.toBeTruthy();
    expect(clientService.create).not.toHaveBeenCalled();
  });

  it('elevated aktör: 10 satırın tamamı ClientService.create üzerinden yazılır (doğrudan prisma.client.create YOK)', async () => {
    const clientService = buildAllowedClientService();
    const prisma = { client: { create: jest.fn() } } as any; // doğrudan çağrılmamalı
    const svc = new SeedService(prisma, noopAudit(), clientService);

    const res = await svc.seedClients('t1', actorElevated);

    expect(clientService.create).toHaveBeenCalledTimes(10);
    expect(prisma.client.create).not.toHaveBeenCalled();
    expect(res.created).toBe(10);
    expect(res.failed).toBe(0);
    // create() her satırda AYNI (tenantId, actor) ile çağrılır.
    for (const call of clientService.create.mock.calls) {
      expect(call[0]).toBe('t1');
      expect(call[2]).toBe(actorElevated);
    }
  });

  it('bir satır checksum hatası atarsa (ClientService.create D01 checksum kapısı): o satır failed sayılır, ÖNCEKİ başarılı satırlar geri alınmaz (satır-bazlı devam, test #11)', async () => {
    let call = 0;
    const clientService = buildAllowedClientService(async () => {
      call++;
      // ClientService.create() gerçekte assertCreateIdentityChecksum ile AYNI hatayı atar;
      // burada mock'lanmış create()'in davranışı simüle edilir (gerçek checksum testi
      // client-create-checksum.spec.ts'te; burada seedClients'in try/catch'inin HERHANGİ
      // bir create() hatasını (checksum dahil) doğru izole ettiği kanıtlanır).
      if (call === 3) throw new BadRequestException('Geçersiz TCKN (kimlik no doğrulaması başarısız)');
      return { id: `new-${call}`, _existingReturned: false };
    });
    const svc = new SeedService({} as any, noopAudit(), clientService);

    const res = await svc.seedClients('t1', actorElevated);

    expect(clientService.create).toHaveBeenCalledTimes(10); // 3. satırdan sonra da devam etti
    expect(res.created).toBe(9);
    expect(res.failed).toBe(1);
  });

  it('ClientService.create dedup/reactivate ile mevcut kaydı dönerse (_existingReturned) created ARTMAZ', async () => {
    const clientService = buildAllowedClientService(async () => ({ id: 'existing', _existingReturned: true }));
    const svc = new SeedService({} as any, noopAudit(), clientService);

    const res = await svc.seedClients('t1', actorElevated);

    expect(res.created).toBe(0);
    expect(res.failed).toBe(0);
  });
});

describe('SeedService.seedAll (D04, test #9 — yetki ilk side-effect öncesinde)', () => {
  it('gate reddederse office/bankAccounts/lookups/... HİÇBİRİ çağrılmaz', async () => {
    const clientService = buildDeniedClientService();
    const svc = new SeedService({} as any, noopAudit(), clientService);
    const officeSpy = jest.spyOn(svc, 'seedOffice');
    const bankSpy = jest.spyOn(svc, 'seedBankAccounts');
    const clientsSpy = jest.spyOn(svc, 'seedClients');

    await expect(svc.seedAll('t1', actorViewer)).rejects.toBeTruthy();

    expect(clientService.assertCanRunElevatedClientBulkOperation).toHaveBeenCalledTimes(1);
    expect(officeSpy).not.toHaveBeenCalled();
    expect(bankSpy).not.toHaveBeenCalled();
    expect(clientsSpy).not.toHaveBeenCalled();
  });

  it('elevated aktör: seedClients AYNI actor ile çağrılır (diğer adımlar mock)', async () => {
    const clientService = buildAllowedClientService();
    const svc = new SeedService({} as any, noopAudit(), clientService);
    jest.spyOn(svc, 'seedOffice').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(svc, 'seedBankAccounts').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(svc, 'seedLookups').mockResolvedValue({} as any);
    jest.spyOn(svc, 'seedLawyers').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(svc, 'seedStaff').mockResolvedValue({ created: 0 } as any);
    const seedClientsSpy = jest
      .spyOn(svc, 'seedClients')
      .mockResolvedValue({ created: 0, failed: 0 } as any);
    jest.spyOn(svc, 'seedDebtors').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(svc, 'seedExecutionOffices').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(svc, 'seedCases').mockResolvedValue({ created: 0 } as any);
    jest.spyOn(svc, 'seedPublicInstitutions').mockResolvedValue({ created: 0, skipped: 0 } as any);
    jest.spyOn(svc, 'seedPublicInstitutionDebtors').mockResolvedValue({ created: 0, skipped: 0 } as any);

    await svc.seedAll('t1', actorElevated);

    expect(seedClientsSpy).toHaveBeenCalledWith('t1', actorElevated);
  });
});

describe('SeedService.fixExistingClients (D04/D05/D07/D08/D09)', () => {
  it('gate reddederse hiçbir okuma/yazma yapılmaz', async () => {
    const clientService = buildDeniedClientService();
    const prisma = { client: { findMany: jest.fn() } } as any;
    const svc = new SeedService(prisma, noopAudit(), clientService);

    await expect(svc.fixExistingClients('t1', actorViewer)).rejects.toBeTruthy();
    expect(prisma.client.findMany).not.toHaveBeenCalled();
  });

  it('geçersiz VKN checksum: o satır DÜZELTİLMEZ (write hiç denenmez), geçerli satır devam eder', async () => {
    const clients = [
      { id: 'c1', name: '', displayName: null, companyName: 'Geçersiz Firma', firstName: null, lastName: null, tckn: null, vkn: '9999999999', identityNo: null },
      { id: 'c2', name: '', displayName: null, companyName: 'Geçerli Firma', firstName: null, lastName: null, tckn: null, vkn: '1234567890', identityNo: null },
    ];
    const clientService = buildAllowedClientService();
    const tx = { client: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const prisma = {
      client: { findMany: jest.fn().mockResolvedValue(clients) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    } as any;
    const audit = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
    const svc = new SeedService(prisma, audit as any, clientService);

    const res = await svc.fixExistingClients('t1', actorElevated);

    expect(res.fixed).toBe(1);
    expect(res.failed).toBe(1);
    expect(tx.client.updateMany).toHaveBeenCalledTimes(1); // yalnız geçerli (c2) satır
    expect(tx.client.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'c2', tenantId: 't1' } }),
    );
    expect(audit.logInTransaction).toHaveBeenCalledTimes(1);
    // D08: audit metadata yalnız alan ADI taşır — gerçek isim/VKN DEĞERİ asla yazılmaz.
    const [, auditArgs] = audit.logInTransaction.mock.calls[0];
    expect(auditArgs.metadata).toEqual({ fieldsFixed: ['name', 'displayName', 'identityNo'] });
    expect(JSON.stringify(auditArgs)).not.toContain('1234567890');
    expect(JSON.stringify(auditArgs)).not.toContain('Geçerli Firma');
  });

  it('yazma tenant-scoped (D09): updateMany where clause\'ı id+tenantId birlikte taşır', async () => {
    const clients = [
      { id: 'c1', name: '', displayName: 'Zaten Var', companyName: null, firstName: null, lastName: null, tckn: null, vkn: null, identityNo: null },
    ];
    const clientService = buildAllowedClientService();
    const tx = { client: { updateMany: jest.fn().mockResolvedValue({ count: 1 }) } };
    const prisma = {
      client: { findMany: jest.fn().mockResolvedValue(clients) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    } as any;
    const audit = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
    const svc = new SeedService(prisma, audit as any, clientService);

    await svc.fixExistingClients('t2', actorElevated);

    const args = tx.client.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: 'c1', tenantId: 't2' });
  });

  it('count===0 (eşzamanlı değişim): audit üretilmez, failed sayılır (D07/D08)', async () => {
    const clients = [
      { id: 'c1', name: '', displayName: 'X', companyName: null, firstName: null, lastName: null, tckn: null, vkn: null, identityNo: null },
    ];
    const clientService = buildAllowedClientService();
    const tx = { client: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) } };
    const prisma = {
      client: { findMany: jest.fn().mockResolvedValue(clients) },
      $transaction: jest.fn((fn: any) => fn(tx)),
    } as any;
    const audit = { log: jest.fn(), logInTransaction: jest.fn().mockResolvedValue(undefined) };
    const svc = new SeedService(prisma, audit as any, clientService);

    const res = await svc.fixExistingClients('t1', actorElevated);

    expect(res.fixed).toBe(0);
    expect(res.failed).toBe(1);
    expect(audit.logInTransaction).not.toHaveBeenCalled();
  });

  it('boş isimli olmayan müvekkile hiç dokunmaz (mevcut davranış korunur)', async () => {
    const clients = [{ id: 'c1', name: 'Zaten Dolu', displayName: 'Zaten Dolu' }];
    const clientService = buildAllowedClientService();
    const prisma = {
      client: { findMany: jest.fn().mockResolvedValue(clients) },
      $transaction: jest.fn(),
    } as any;
    const svc = new SeedService(prisma, noopAudit(), clientService);

    const res = await svc.fixExistingClients('t1', actorElevated);

    expect(res.fixed).toBe(0);
    expect(res.failed).toBe(0);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

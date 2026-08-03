/**
 * C3-B01 — §13/5 K5.3-K5.5 açık rıza kaydı fail-closed davranışı.
 *
 * Kanıtlanan ratifiye kurallar:
 * - Geçerli opt-in yoksa rıza-kapılı tercih bayrağını AÇAN yazma RED (create + update).
 * - Reddedilen istek HİÇBİR yazma yapmaz ($transaction hiç açılmaz).
 * - Rıza geri alınabilir; revoke aynı transaction'da bayrakları FALSE'a çeker.
 * - Yetki eşiği mevcut D02 semantiğidir (VIEWER DENY) — eşik icat edilmedi.
 * - create defaults FALSE (K5.3); hata gövdesi yalnız alan ADI taşır, değer taşımaz.
 */
import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { buildClientMutationActor, ClientService } from '../client.service';
import {
  assertClientConsentGateForWrite,
  ClientConsentService,
  findConsentGatedFlagsTurningOn,
} from '../client-consent.service';

const actorOf = (role: 'ADMIN' | 'USER' | 'VIEWER', userId = 'u1') =>
  buildClientMutationActor({ userId, tenantId: 't1', role });

const buildTx = () => ({
  client: {
    update: jest.fn().mockResolvedValue({ id: 'c1' }),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    create: jest.fn().mockResolvedValue({ id: 'new' }),
    findFirst: jest.fn().mockResolvedValue({ id: 'c1' }),
  },
  clientContact: {
    createMany: jest.fn().mockResolvedValue({}),
    deleteMany: jest.fn().mockResolvedValue({}),
    findMany: jest.fn().mockResolvedValue([]),
    updateMany: jest.fn().mockResolvedValue({}),
  },
  clientAddress: {
    findMany: jest.fn().mockResolvedValue([]),
    createMany: jest.fn().mockResolvedValue({}),
    updateMany: jest.fn().mockResolvedValue({}),
    create: jest.fn().mockResolvedValue({}),
    update: jest.fn().mockResolvedValue({}),
  },
  clientConsent: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'cons-1', ...data }),
    ),
    update: jest.fn().mockImplementation(({ data }: any) =>
      Promise.resolve({ id: 'cons-1', ...data }),
    ),
  },
});

const buildPrisma = (opts: { existing?: any; activeConsent?: any } = {}) => {
  const existing =
    opts.existing ??
    ({ id: 'c1', tenantId: 't1', isActive: true, contacts: [], sendBirthdayGreeting: false } as any);
  const tx = buildTx();
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockImplementation(({ where }: any) =>
        where?.OR ? Promise.resolve(null) : Promise.resolve(existing),
      ),
      findUnique: jest.fn().mockResolvedValue(existing),
      findMany: jest.fn().mockResolvedValue([]),
    },
    clientAddress: { findMany: jest.fn().mockResolvedValue([]) },
    clientConsent: {
      findFirst: jest.fn().mockResolvedValue(opts.activeConsent ?? null),
      findMany: jest.fn().mockResolvedValue([]),
      create: jest.fn(),
      update: jest.fn(),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => (typeof cb === 'function' ? cb(tx) : [])),
  };
  return { prisma, tx };
};

const buildAudit = () => ({
  log: jest.fn().mockResolvedValue(undefined),
  logInTransaction: jest.fn().mockResolvedValue(undefined),
});

const buildOffice = () => ({ isApproverEligible: jest.fn().mockResolvedValue(false) });

const forbiddenBody = async (fn: () => Promise<unknown>) => {
  try {
    await fn();
  } catch (e) {
    expect(e).toBeInstanceOf(ForbiddenException);
    return (e as ForbiddenException).getResponse() as any;
  }
  throw new Error('ForbiddenException bekleniyordu, atılmadı');
};

// =========================================================================================
// 1. Saf geçiş tespiti
// =========================================================================================
describe('findConsentGatedFlagsTurningOn', () => {
  it('yalnız false→true geçişini yakalar; kapatma ve no-op geçiş sayılmaz', () => {
    expect(
      findConsentGatedFlagsTurningOn(
        { sendBirthdayGreeting: true, sendHolidayGreeting: false },
        { sendBirthdayGreeting: false, sendHolidayGreeting: true },
      ),
    ).toEqual(['sendBirthdayGreeting']);
    expect(
      findConsentGatedFlagsTurningOn({ sendBirthdayGreeting: true }, { sendBirthdayGreeting: true }),
    ).toEqual([]);
    expect(findConsentGatedFlagsTurningOn({ phone: 'x' }, {})).toEqual([]);
    // create yolu (existing yok): true talebi geçiştir
    expect(findConsentGatedFlagsTurningOn({ sendAnniversaryGreeting: true }, null)).toEqual([
      'sendAnniversaryGreeting',
    ]);
  });
});

// =========================================================================================
// 2. DI'sız kapı — assertClientConsentGateForWrite
// =========================================================================================
describe('assertClientConsentGateForWrite (K5.5 fail-closed)', () => {
  it('opt-in yokken bayrak açma → RED; gövde yalnız alan ADI taşır', async () => {
    const { prisma } = buildPrisma();
    const body = await forbiddenBody(() =>
      assertClientConsentGateForWrite(prisma, 't1', 'c1', { sendBirthdayGreeting: true }, { sendBirthdayGreeting: false }),
    );
    expect(body.code).toBe('KVKK_EXPLICIT_CONSENT_REQUIRED');
    expect(body.offendingFields).toEqual(['sendBirthdayGreeting']);
    expect(JSON.stringify(body)).not.toContain('true');
  });

  it('geçerli opt-in varsa bayrak açma GEÇER', async () => {
    const { prisma } = buildPrisma({ activeConsent: { id: 'cons-1', status: 'GRANTED' } });
    await expect(
      assertClientConsentGateForWrite(prisma, 't1', 'c1', { sendHolidayGreeting: true }, { sendHolidayGreeting: false }),
    ).resolves.toBeUndefined();
  });

  it('create yolunda (clientId=null) rıza kaydı var olamaz → her zaman RED', async () => {
    const { prisma } = buildPrisma({ activeConsent: { id: 'cons-1' } });
    await expect(
      assertClientConsentGateForWrite(prisma, 't1', null, { sendBirthdayGreeting: true }, null),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('clientConsent delegate yoksa fail-closed RED (fail-open değil)', async () => {
    await expect(
      assertClientConsentGateForWrite({}, 't1', 'c1', { sendBirthdayGreeting: true }, { sendBirthdayGreeting: false }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('bayrak kapatma (true→false) rıza aramaz — ek kısıtlama yönü serbest', async () => {
    const prismaNoDelegate: any = {}; // sorgu gerekmediğinin kanıtı: delegate bile yok
    await expect(
      assertClientConsentGateForWrite(prismaNoDelegate, 't1', 'c1', { sendBirthdayGreeting: false }, { sendBirthdayGreeting: true }),
    ).resolves.toBeUndefined();
  });
});

// =========================================================================================
// 3. ClientService create/update entegrasyonu
// =========================================================================================
describe('ClientService — rıza kapısı entegrasyonu', () => {
  const buildSvc = (opts: Parameters<typeof buildPrisma>[0] = {}) => {
    const { prisma, tx } = buildPrisma(opts);
    const audit = buildAudit();
    const svc = new ClientService(prisma as any, audit as any, buildOffice() as any);
    return { svc, prisma, tx, audit };
  };

  it('create + bayrak true → RED ve $transaction HİÇ açılmaz', async () => {
    const { svc, prisma } = buildSvc();
    await expect(
      svc.create('t1', { type: 'PERSON', firstName: 'A', lastName: 'B', sendBirthdayGreeting: true }, actorOf('USER')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('create bayraksız → tx.client.create varsayılanları FALSE yazar (K5.3)', async () => {
    const { svc, tx } = buildSvc();
    await svc.create('t1', { type: 'PERSON', firstName: 'A', lastName: 'B' }, actorOf('USER'));
    expect(tx.client.create).toHaveBeenCalled();
    const data = (tx.client.create as jest.Mock).mock.calls[0][0].data;
    expect(data.sendBirthdayGreeting).toBe(false);
    expect(data.sendAnniversaryGreeting).toBe(false);
    expect(data.sendHolidayGreeting).toBe(false);
  });

  it('update bayrak açma + opt-in yok → RED ve $transaction HİÇ açılmaz', async () => {
    const { svc, prisma } = buildSvc();
    await expect(
      svc.update('c1', 't1', { sendBirthdayGreeting: true }, actorOf('USER')),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('update bayrak açma + geçerli opt-in → yazma yürür', async () => {
    const { svc, prisma } = buildSvc({ activeConsent: { id: 'cons-1', status: 'GRANTED' } });
    await svc.update('c1', 't1', { sendBirthdayGreeting: true }, actorOf('USER'));
    expect(prisma.$transaction).toHaveBeenCalled();
  });
});

// =========================================================================================
// 4. ClientConsentService — grant/revoke
// =========================================================================================
describe('ClientConsentService (K5.3-K5.4)', () => {
  const buildConsentSvc = (opts: Parameters<typeof buildPrisma>[0] = {}) => {
    const { prisma, tx } = buildPrisma(opts);
    const audit = buildAudit();
    const svc = new ClientConsentService(prisma as any, audit as any);
    return { svc, prisma, tx, audit };
  };

  it('VIEWER rıza kaydedemez (D02 semantiği TÜKETİLDİ, eşik icat edilmedi)', async () => {
    const { svc, prisma } = buildConsentSvc();
    await expect(
      svc.grantConsent({ tenantId: 't1', clientId: 'c1', activity: 'GREETING_AND_OPTIONAL_COMMUNICATION', actor: actorOf('VIEWER') }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('registry dışı faaliyete rıza kaydı → fail-closed RED', async () => {
    const { svc } = buildConsentSvc();
    const body = await forbiddenBody(() =>
      svc.grantConsent({ tenantId: 't1', clientId: 'c1', activity: 'UNKNOWN_ACTIVITY', actor: actorOf('USER') }),
    );
    expect(body.code).toBe('NO_LEGAL_BASIS_REGISTERED');
  });

  it('md.5/2 dayanaklı faaliyete rıza kaydı açılamaz (rıza faaliyeti değil)', async () => {
    const { svc } = buildConsentSvc();
    const body = await forbiddenBody(() =>
      svc.grantConsent({ tenantId: 't1', clientId: 'c1', activity: 'IDENTITY_AND_CONTACT_MANAGEMENT', actor: actorOf('USER') }),
    );
    expect(body.code).toBe('ACTIVITY_DOES_NOT_TAKE_CONSENT');
  });

  it('USER grant → tarihli GRANTED satırı + audit AYNI transaction içinde', async () => {
    const { svc, tx, audit } = buildConsentSvc();
    const created = await svc.grantConsent({
      tenantId: 't1',
      clientId: 'c1',
      activity: 'GREETING_AND_OPTIONAL_COMMUNICATION',
      actor: actorOf('USER'),
      note: 'sözlü onay, telefonda',
    });
    expect(created.status).toBe('GRANTED');
    expect(created.grantedAt).toBeInstanceOf(Date);
    expect(tx.clientConsent.create).toHaveBeenCalled();
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CLIENT_CONSENT_GRANT', entityId: 'c1' }),
    );
  });

  it('revoke → satır REVOKED + kapıladığı bayraklar AYNI tx içinde FALSE + audit', async () => {
    const { svc, prisma, tx, audit } = buildConsentSvc({
      activeConsent: { id: 'cons-1', status: 'GRANTED', note: null },
    });
    await svc.revokeConsent({
      tenantId: 't1',
      clientId: 'c1',
      activity: 'GREETING_AND_OPTIONAL_COMMUNICATION',
      actor: actorOf('USER'),
    });
    expect(tx.clientConsent.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'cons-1' }, data: expect.objectContaining({ status: 'REVOKED' }) }),
    );
    expect(tx.client.updateMany).toHaveBeenCalledWith({
      where: { id: 'c1', tenantId: 't1' },
      data: {
        sendBirthdayGreeting: false,
        sendAnniversaryGreeting: false,
        sendHolidayGreeting: false,
      },
    });
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CLIENT_CONSENT_REVOKE' }),
    );
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('geçerli rıza yokken revoke → NotFound (sessiz no-op değil)', async () => {
    const { svc } = buildConsentSvc();
    await expect(
      svc.revokeConsent({ tenantId: 't1', clientId: 'c1', activity: 'GREETING_AND_OPTIONAL_COMMUNICATION', actor: actorOf('USER') }),
    ).rejects.toBeInstanceOf(NotFoundException);
  });
});

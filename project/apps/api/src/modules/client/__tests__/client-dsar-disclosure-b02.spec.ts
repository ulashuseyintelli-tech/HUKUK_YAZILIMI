/**
 * C3-B02 — §13/6 K6.1-K6.5 aydınlatma + ilgili kişi başvuru akışı.
 *
 * Kanıtlanan ratifiye kurallar:
 * - dueAt = receivedAt + 30 gün (md.13, K6.4) — create anında hesaplanır ve saklanır.
 * - Staff başvuru KAYDEDEBİLİR ve hazırlık yapabilir; NİHAİ CEVAP staff'a RED (K6.4).
 * - Statü makinesi: RECEIVED → IN_REVIEW → RESPONDED; RESPONDED terminaldir (K6.5).
 * - ERASURE cevabı hiçbir kaydı SİLMEZ; audit'e POL-E 8-koşul kapısı işaretlenir (§13/8).
 * - Görünürlük: yükseltilmiş yetki tümünü, diğerleri yalnız kendine atananı görür (K6.4).
 * - Aydınlatma: metin versiyonu elevated; teslim kaydı staff; teslim exact versiyona bağlı (K6.1).
 */
import { ConflictException, ForbiddenException } from '@nestjs/common';
import { buildClientMutationActor } from '../client.service';
import {
  CLIENT_DSAR_RESPONSE_DAYS,
  ClientDataSubjectRequestService,
  computeDsarDueAt,
} from '../client-data-subject-request.service';
import { ClientDisclosureService } from '../client-disclosure.service';

const actorOf = (role: 'ADMIN' | 'USER' | 'VIEWER', userId = 'u1') =>
  buildClientMutationActor({ userId, tenantId: 't1', role });

const buildTx = () => ({
  clientDataSubjectRequest: {
    create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'dsar-1', ...data })),
    update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'dsar-1', ...data })),
  },
  clientDisclosureText: {
    findFirst: jest.fn().mockResolvedValue(null),
    create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'text-1', ...data })),
  },
  clientDisclosureDelivery: {
    create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'del-1', ...data })),
  },
  client: { delete: jest.fn(), deleteMany: jest.fn(), updateMany: jest.fn() },
});

const buildDeps = (opts: { existingRequest?: any; disclosureText?: any } = {}) => {
  const tx = buildTx();
  const prisma: any = {
    client: {
      findFirst: jest.fn().mockResolvedValue({ id: 'c1', tenantId: 't1' }),
    },
    clientDataSubjectRequest: {
      findFirst: jest.fn().mockResolvedValue(opts.existingRequest ?? null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    clientDisclosureText: {
      findFirst: jest.fn().mockResolvedValue(opts.disclosureText ?? null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    clientDisclosureDelivery: { findMany: jest.fn().mockResolvedValue([]) },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    logInTransaction: jest.fn().mockResolvedValue(undefined),
  };
  const office = { isApproverEligible: jest.fn().mockResolvedValue(false) };
  const dsar = new ClientDataSubjectRequestService(prisma, audit as any, office as any);
  const disclosure = new ClientDisclosureService(prisma, audit as any, office as any);
  return { prisma, tx, audit, office, dsar, disclosure };
};

describe('computeDsarDueAt (md.13 — 30 gün)', () => {
  it('dueAt tam 30 gün sonrasıdır', () => {
    expect(CLIENT_DSAR_RESPONSE_DAYS).toBe(30);
    const received = new Date('2026-08-03T10:00:00.000Z');
    expect(computeDsarDueAt(received).toISOString()).toBe('2026-09-02T10:00:00.000Z');
  });
});

describe('DSAR — kayıt ve hazırlık (staff serbest, K6.4)', () => {
  it('USER (staff) başvuru kaydeder; dueAt +30 gün ve audit CLIENT_DSAR_RECEIVED', async () => {
    const { dsar, tx, audit } = buildDeps();
    const receivedAt = new Date('2026-08-03T10:00:00.000Z');
    const created = await dsar.createRequest({
      tenantId: 't1',
      clientId: 'c1',
      type: 'INFORMATION',
      channel: 'KEP',
      receivedAt,
      actor: actorOf('USER'),
    });
    expect(created.dueAt.toISOString()).toBe('2026-09-02T10:00:00.000Z');
    expect(tx.clientDataSubjectRequest.create).toHaveBeenCalled();
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CLIENT_DSAR_RECEIVED' }),
    );
  });

  it('VIEWER başvuru kaydedemez', async () => {
    const { dsar, prisma } = buildDeps();
    await expect(
      dsar.createRequest({
        tenantId: 't1',
        clientId: 'c1',
        type: 'INFORMATION',
        channel: 'WRITTEN',
        receivedAt: new Date(),
        actor: actorOf('VIEWER'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('staff atama yapamaz (atama yükseltilmiş yetki ister)', async () => {
    const { dsar } = buildDeps();
    await expect(
      dsar.createRequest({
        tenantId: 't1',
        clientId: 'c1',
        type: 'INFORMATION',
        channel: 'WRITTEN',
        receivedAt: new Date(),
        actor: actorOf('USER'),
        assignedToUserId: 'u9',
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('staff değerlendirmeye alabilir (hazırlık serbest)', async () => {
    const { dsar, tx } = buildDeps({
      existingRequest: { id: 'dsar-1', tenantId: 't1', status: 'RECEIVED', type: 'INFORMATION' },
    });
    await dsar.startReview({ tenantId: 't1', requestId: 'dsar-1', actor: actorOf('USER') });
    expect(tx.clientDataSubjectRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: 'IN_REVIEW' } }),
    );
  });
});

describe('DSAR — nihai cevap yetkisi (K6.4 staff DEĞİL)', () => {
  const existingRequest = {
    id: 'dsar-1',
    tenantId: 't1',
    status: 'IN_REVIEW',
    type: 'INFORMATION',
    dueAt: new Date('2026-09-02T10:00:00.000Z'),
  };

  it('staff (USER, eligible değil) nihai cevap veremez; hiçbir yazma olmaz', async () => {
    const { dsar, prisma } = buildDeps({ existingRequest });
    await expect(
      dsar.respond({ tenantId: 't1', requestId: 'dsar-1', responseNote: 'cevap', actor: actorOf('USER') }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ADMIN nihai cevap verir → RESPONDED + audit', async () => {
    const { dsar, tx, audit } = buildDeps({ existingRequest });
    await dsar.respond({ tenantId: 't1', requestId: 'dsar-1', responseNote: 'cevap', actor: actorOf('ADMIN') });
    expect(tx.clientDataSubjectRequest.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: expect.objectContaining({ status: 'RESPONDED' }) }),
    );
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CLIENT_DSAR_RESPOND' }),
    );
  });

  it('eligible USER (isApproverEligible=true) nihai cevap verebilir', async () => {
    const { dsar, office, tx } = buildDeps({ existingRequest });
    office.isApproverEligible.mockResolvedValue(true);
    await dsar.respond({ tenantId: 't1', requestId: 'dsar-1', responseNote: 'cevap', actor: actorOf('USER') });
    expect(tx.clientDataSubjectRequest.update).toHaveBeenCalled();
  });

  it('RESPONDED terminaldir — ikinci cevap Conflict', async () => {
    const { dsar } = buildDeps({ existingRequest: { ...existingRequest, status: 'RESPONDED' } });
    await expect(
      dsar.respond({ tenantId: 't1', requestId: 'dsar-1', responseNote: 'x', actor: actorOf('ADMIN') }),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  it('ERASURE cevabı hiçbir kaydı SİLMEZ; audit POL-E kapısını işaretler (§13/8)', async () => {
    const { dsar, tx, audit } = buildDeps({
      existingRequest: { ...existingRequest, type: 'ERASURE' },
    });
    await dsar.respond({ tenantId: 't1', requestId: 'dsar-1', responseNote: 'değerlendirildi', actor: actorOf('ADMIN') });
    expect(tx.client.delete).not.toHaveBeenCalled();
    expect(tx.client.deleteMany).not.toHaveBeenCalled();
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        metadata: expect.objectContaining({ erasureExecution: 'POL_E_8_CONDITION_GATE_REQUIRED_B03' }),
      }),
    );
  });
});

describe('DSAR — görünürlük (K6.4)', () => {
  it('elevated olmayan aktör yalnız kendine atananları görür', async () => {
    const { dsar, prisma } = buildDeps();
    await dsar.listRequests({ tenantId: 't1', actor: actorOf('USER', 'u7') });
    expect(prisma.clientDataSubjectRequest.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ assignedToUserId: 'u7' }) }),
    );
  });

  it('ADMIN tenant genelini görür (atama filtresi yok)', async () => {
    const { dsar, prisma } = buildDeps();
    await dsar.listRequests({ tenantId: 't1', actor: actorOf('ADMIN') });
    const where = (prisma.clientDataSubjectRequest.findMany as jest.Mock).mock.calls[0][0].where;
    expect(where.assignedToUserId).toBeUndefined();
  });
});

describe('Aydınlatma (K6.1-K6.2)', () => {
  it('metin versiyonu staff tarafından yayımlanamaz (elevated şart)', async () => {
    const { disclosure, prisma } = buildDeps();
    await expect(
      disclosure.createTextVersion({ tenantId: 't1', actor: actorOf('USER'), content: 'metin' }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('ADMIN metin versiyonu yayımlar → tenant içi ardışık versiyon + audit', async () => {
    const { disclosure, tx, audit } = buildDeps();
    const created = await disclosure.createTextVersion({
      tenantId: 't1',
      actor: actorOf('ADMIN'),
      content: 'aydınlatma metni v1',
    });
    expect(created.version).toBe(1);
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CLIENT_DISCLOSURE_TEXT_CREATE' }),
    );
    expect(tx.clientDisclosureText.create).toHaveBeenCalled();
  });

  it('teslim kaydı staff tarafından yapılabilir ve exact versiyona bağlanır (K6.1)', async () => {
    const { disclosure, tx, audit } = buildDeps({
      disclosureText: { id: 'text-1', tenantId: 't1', version: 3 },
    });
    await disclosure.recordDelivery({
      tenantId: 't1',
      clientId: 'c1',
      disclosureTextId: 'text-1',
      method: 'KEP',
      deliveredAt: new Date('2026-08-03T09:00:00.000Z'),
      actor: actorOf('USER'),
    });
    expect(tx.clientDisclosureDelivery.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({ disclosureTextId: 'text-1', method: 'KEP' }),
      }),
    );
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'CLIENT_DISCLOSURE_DELIVERY_RECORD',
        metadata: expect.objectContaining({ version: 3 }),
      }),
    );
  });

  it('VIEWER teslim kaydı yapamaz', async () => {
    const { disclosure } = buildDeps({ disclosureText: { id: 'text-1', tenantId: 't1', version: 1 } });
    await expect(
      disclosure.recordDelivery({
        tenantId: 't1',
        clientId: 'c1',
        disclosureTextId: 'text-1',
        method: 'WRITTEN',
        deliveredAt: new Date(),
        actor: actorOf('VIEWER'),
      }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });
});

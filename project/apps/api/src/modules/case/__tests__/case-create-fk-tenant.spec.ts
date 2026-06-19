/**
 * CASE-CREATE-FK-TENANT — POST /cases create() FK tenant ownership guard.
 *
 * Açık: create() tenant-scoped FK'leri guard'sız persist ediyordu — clientId (primaryClientId),
 * TÜM creditor id'leri (caseClient ortak alacaklılar dahil), courtId ve executionOfficeId. ValidationPipe
 * yalnız SHAPE doğrular; caller'ın doğrudan verdiği MEVCUT id'ler cross-tenant olabilir → persist sonrası
 * findOne FK-join'i (client/court/executionOffice: true) başka tenant'ın TAM kaydını döndürüyordu (sızıntı;
 * #246 update path ile aynı vektör). Fix: tx ÖNCESİ (resolveInlinePartiesBeforeTx'ten önce)
 * `validateCaseFkOwnership` reuse → cross-tenant/geçersiz → BadRequest, hiçbir taraf/dosya yaratılmaz.
 *
 * Test deseni (case-create-debtor-ownership ile aynı): mock prisma + guard tx'ten ÖNCE patladığından
 * $transaction çağrılmaz. KRİTİK kapsam: yalnız primary değil, 2. creditor (ortak alacaklı) cross-tenant
 * da reddedilir (gerçek açık caseClient TÜM creditor id'lerinde).
 */

import { BadRequestException } from '@nestjs/common';
import { CaseService } from '../case.service';

function buildService(prisma: any) {
  const stub = {} as any;
  return new CaseService(prisma, stub, stub, stub, stub, stub, stub, stub, stub, stub);
}

const FOUND = (id: string) => ({ id });

describe('CaseService.create() FK tenant ownership guard (CASE-CREATE-FK-TENANT)', () => {
  let prisma: any;
  let service: CaseService;

  beforeEach(() => {
    prisma = {
      client: { findFirst: jest.fn(async () => FOUND('cli-1')) },
      court: { findFirst: jest.fn(async () => FOUND('crt-1')) },
      executionOffice: { findFirst: jest.fn(async () => FOUND('off-1')) },
      debtor: { findMany: jest.fn(async () => []) },
      $transaction: jest.fn(),
    };
    service = buildService(prisma);
  });

  it('cross-tenant primary clientId (creditors[0].id) → BadRequest, $transaction YOK', async () => {
    prisma.client.findFirst = jest.fn(async () => null);

    await expect(
      service.create('tenant-1', { creditors: [{ id: 'foreign-cli', name: 'X', type: 'INDIVIDUAL' }] } as any, 'user-1'),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-cli', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  // KRİTİK: primary-only fix kabul edilemez — 2. creditor (ortak alacaklı) de doğrulanmalı.
  // caseClient.create TÜM creditor id'lerini persist eder; yalnız primary'i kontrol etmek ortak
  // alacaklı id'sini cross-tenant bırakırdı.
  it('cross-tenant 2. creditor (ortak alacaklı, creditors[1].id) → BadRequest, $transaction YOK', async () => {
    prisma.client.findFirst = jest.fn(async ({ where }: any) => (where.id === 'cli-1' ? FOUND('cli-1') : null));

    await expect(
      service.create(
        'tenant-1',
        {
          creditors: [
            { id: 'cli-1', name: 'Ana Alacaklı', type: 'INDIVIDUAL' },
            { id: 'foreign-cli-2', name: 'Ortak Alacaklı', type: 'INDIVIDUAL' },
          ],
        } as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    // her iki creditor id'si de tenant-scope ile sorgulandı (loop primary'de durmadı)
    expect(prisma.client.findFirst).toHaveBeenCalledTimes(2);
    expect(prisma.client.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-cli-2', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cross-tenant courtId (creditor geçerli) → BadRequest, $transaction YOK', async () => {
    prisma.court.findFirst = jest.fn(async () => null);

    await expect(
      service.create(
        'tenant-1',
        { creditors: [{ id: 'cli-1', name: 'X', type: 'INDIVIDUAL' }], courtId: 'foreign-crt' } as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.court.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-crt', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('cross-tenant executionOfficeId (creditor geçerli, courtId yok) → BadRequest, $transaction YOK', async () => {
    prisma.executionOffice.findFirst = jest.fn(async () => null);

    await expect(
      service.create(
        'tenant-1',
        { creditors: [{ id: 'cli-1', name: 'X', type: 'INDIVIDUAL' }], executionOfficeId: 'foreign-off' } as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.executionOffice.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-off', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('valid same-tenant (creditor+court+office hepsi bulundu) → guard geçer, akış $transaction\'a ulaşır', async () => {
    // Guard reddetmezse akış tx'e ulaşır; post-tx makinesini stub'lamamak için $transaction sentinel atar.
    prisma.$transaction = jest.fn(async () => {
      throw new Error('SENTINEL_TX_REACHED');
    });

    await expect(
      service.create(
        'tenant-1',
        {
          creditors: [{ id: 'cli-1', name: 'X', type: 'INDIVIDUAL' }],
          courtId: 'crt-1',
          executionOfficeId: 'off-1',
        } as any,
        'user-1',
      ),
    ).rejects.toThrow('SENTINEL_TX_REACHED'); // BadRequest DEĞİL → guard geçti, tx'e ulaşıldı

    expect(prisma.client.findFirst).toHaveBeenCalledWith({ where: { id: 'cli-1', tenantId: 'tenant-1' }, select: { id: true } });
    expect(prisma.court.findFirst).toHaveBeenCalledWith({ where: { id: 'crt-1', tenantId: 'tenant-1' }, select: { id: true } });
    expect(prisma.executionOffice.findFirst).toHaveBeenCalledWith({ where: { id: 'off-1', tenantId: 'tenant-1' }, select: { id: true } });
    expect(prisma.$transaction).toHaveBeenCalled();
  });

  it('inline-YENİ creditor (id YOK) guard\'dan muaf → client.findFirst ÇAĞRILMAZ (resolve tenant-scope\'lar)', async () => {
    // inline-yeni müvekkil id taşımaz → guard atlar (resolve içinde ClientService.create tenant-scoped yaratır).
    // cross-tenant courtId ile kısa-devre yapıp resolve'a ulaşmadan guard davranışını izole ederiz.
    prisma.court.findFirst = jest.fn(async () => null);

    await expect(
      service.create(
        'tenant-1',
        { creditors: [{ name: 'Yeni Müvekkil', type: 'INDIVIDUAL' }], courtId: 'foreign-crt' } as any,
        'user-1',
      ),
    ).rejects.toBeInstanceOf(BadRequestException);

    expect(prisma.client.findFirst).not.toHaveBeenCalled(); // inline-yeni creditor guard'da doğrulanmaz
    expect(prisma.court.findFirst).toHaveBeenCalledWith({
      where: { id: 'foreign-crt', tenantId: 'tenant-1' },
      select: { id: true },
    });
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });
});

/**
 * C3-B03 — §13/8 K8.1-K8.5 legal hold + 8-koşullu fail-closed silme kapısı.
 *
 * Kanıtlanan ratifiye kurallar:
 * - Kapı: koşullardan biri CONFIRMED değilse DO_NOT_DELETE + owner/legal sınıflandırması.
 * - Sekiz koşul birden CONFIRMED olsa bile YÜRÜTME YOK (K8.5 yöntem NOT SELECTED) —
 *   executionAllowed HER ZAMAN false; bu modülde silme yürütücüsü yoktur.
 * - Aktif hold koşul-6'yı DB'den EZER; iddia ile açılamaz.
 * - Hold koyma elevated + gerekçe zorunlu; kaldırma maker-checker (AYNI kişi onaylayamaz).
 * - RELEASE_REQUESTED hâlâ aktif hold sayılır (onaysız düşmez).
 * - Scheduler/otomatik silme YOK (statik kanıt: modül scheduler kaydı içermez).
 */
import { BadRequestException, ConflictException, ForbiddenException } from '@nestjs/common';
import { readFileSync } from 'fs';
import { join } from 'path';
import { buildClientMutationActor } from '../client.service';
import {
  CLIENT_LIFECYCLE_GATE_CONDITIONS,
  decideClientDataLifecycleGate,
  type ClientLifecycleAssessment,
} from '../client-data-lifecycle-gate';
import { ClientLegalHoldService } from '../client-legal-hold.service';

const actorOf = (role: 'ADMIN' | 'USER' | 'VIEWER', userId = 'u1') =>
  buildClientMutationActor({ userId, tenantId: 't1', role });

const ALL_CONFIRMED: ClientLifecycleAssessment = Object.fromEntries(
  CLIENT_LIFECYCLE_GATE_CONDITIONS.map((c) => [c, 'CONFIRMED']),
) as ClientLifecycleAssessment;

const buildDeps = (opts: { hold?: any } = {}) => {
  const tx = {
    clientLegalHold: {
      create: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'hold-1', ...data })),
      update: jest.fn().mockImplementation(({ data }: any) => Promise.resolve({ id: 'hold-1', ...data })),
    },
    client: { delete: jest.fn(), deleteMany: jest.fn() },
  };
  const prisma: any = {
    client: { findFirst: jest.fn().mockResolvedValue({ id: 'c1', tenantId: 't1' }), delete: jest.fn(), deleteMany: jest.fn() },
    clientLegalHold: {
      findFirst: jest.fn().mockResolvedValue(opts.hold ?? null),
      findMany: jest.fn().mockResolvedValue([]),
    },
    $transaction: jest.fn().mockImplementation(async (cb: any) => cb(tx)),
  };
  const audit = {
    log: jest.fn().mockResolvedValue(undefined),
    logInTransaction: jest.fn().mockResolvedValue(undefined),
  };
  const office = { isApproverEligible: jest.fn().mockResolvedValue(false) };
  const svc = new ClientLegalHoldService(prisma, audit as any, office as any);
  return { svc, prisma, tx, audit, office };
};

// =========================================================================================
// 1. Saf kapı — 8 koşul
// =========================================================================================
describe('decideClientDataLifecycleGate (POL-E 8-koşul, fail-closed)', () => {
  it('boş/eksik değerlendirme → DO_NOT_DELETE + 8 karşılanmamış koşul', () => {
    const d = decideClientDataLifecycleGate(undefined);
    expect(d.executionAllowed).toBe(false);
    expect(d.result).toBe('DO_NOT_DELETE');
    expect(d.classification).toBe('OWNER_LEGAL_CROSS_DOMAIN_DECISION_REQUIRED');
    expect(d.unmetConditions).toHaveLength(8);
  });

  it('tek bir koşul UNKNOWN ise kapı kapanır (K8.1: süre kanıtlanmadan uygulanmaz)', () => {
    const d = decideClientDataLifecycleGate({
      ...ALL_CONFIRMED,
      RETENTION_LEGAL_BASIS_CONFIRMED: 'UNKNOWN',
    });
    expect(d.result).toBe('DO_NOT_DELETE');
    expect(d.unmetConditions).toEqual(['RETENTION_LEGAL_BASIS_CONFIRMED']);
  });

  it('SEKİZİ BİRDEN CONFIRMED olsa bile YÜRÜTME YOK (K8.5 yöntem NOT SELECTED)', () => {
    const d = decideClientDataLifecycleGate(ALL_CONFIRMED);
    expect(d.executionAllowed).toBe(false);
    expect(d.result).toBe('ALL_CONDITIONS_MET_AWAITING_OWNER_METHOD_DECISION');
    expect(d.unmetConditions).toEqual([]);
  });

  it('kapı tipi executionAllowed=true değerini TAŞIYAMAZ (tip seviyesi false)', () => {
    // Derleme-zamanı garanti: ClientLifecycleGateDecision.executionAllowed: false.
    // Çalışma zamanında da hiçbir dal true üretmez — tüm dallar yukarıda test edildi.
    const all = [
      decideClientDataLifecycleGate(undefined),
      decideClientDataLifecycleGate(ALL_CONFIRMED),
    ];
    expect(all.every((d) => d.executionAllowed === false)).toBe(true);
  });
});

// =========================================================================================
// 2. Hold koyma / kaldırma — elevated + maker-checker
// =========================================================================================
describe('ClientLegalHoldService — koyma/kaldırma (K8.4)', () => {
  it('staff (USER, eligible değil) hold koyamaz; hiçbir yazma olmaz', async () => {
    const { svc, prisma } = buildDeps();
    await expect(
      svc.placeHold({ tenantId: 't1', clientId: 'c1', scopeType: 'CLIENT', reason: 'x', actor: actorOf('USER') }),
    ).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.$transaction).not.toHaveBeenCalled();
  });

  it('gerekçesiz hold koyma RED (K8.4 gerekçe zorunlu)', async () => {
    const { svc } = buildDeps();
    await expect(
      svc.placeHold({ tenantId: 't1', clientId: 'c1', scopeType: 'CLIENT', reason: '  ', actor: actorOf('ADMIN') }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('ADMIN hold koyar → neden/aktör/zaman/kapsam audit metadata içinde', async () => {
    const { svc, audit } = buildDeps();
    const created = await svc.placeHold({
      tenantId: 't1',
      clientId: 'c1',
      scopeType: 'RECORD_FAMILY',
      recordFamily: 'PortalDocument',
      reason: 'derdest dava delili',
      actor: actorOf('ADMIN', 'admin-1'),
    });
    expect(created.status).toBe('ACTIVE');
    expect(created.placedAt).toBeInstanceOf(Date);
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'CLIENT_LEGAL_HOLD_PLACE',
        metadata: expect.objectContaining({
          scopeType: 'RECORD_FAMILY',
          recordFamily: 'PortalDocument',
          reason: 'derdest dava delili',
        }),
      }),
    );
  });

  it('CASE kapsamı caseId olmadan RED', async () => {
    const { svc } = buildDeps();
    await expect(
      svc.placeHold({ tenantId: 't1', clientId: 'c1', scopeType: 'CASE', reason: 'x', actor: actorOf('ADMIN') }),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('kaldırma talebi gerekçesiz RED; gerekçeli talep RELEASE_REQUESTED yapar + audit', async () => {
    const { svc, audit } = buildDeps({ hold: { id: 'hold-1', tenantId: 't1', status: 'ACTIVE' } });
    await expect(
      svc.requestRelease({ tenantId: 't1', holdId: 'hold-1', releaseReason: '', actor: actorOf('ADMIN') }),
    ).rejects.toBeInstanceOf(BadRequestException);
    await svc.requestRelease({
      tenantId: 't1',
      holdId: 'hold-1',
      releaseReason: 'dava kesinleşti',
      actor: actorOf('ADMIN', 'maker-1'),
    });
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({ action: 'CLIENT_LEGAL_HOLD_RELEASE_REQUEST' }),
    );
  });

  it('MAKER kendi talebini ONAYLAYAMAZ (ikinci yetkili şart — K8.4)', async () => {
    const { svc } = buildDeps({
      hold: { id: 'hold-1', tenantId: 't1', status: 'RELEASE_REQUESTED', releaseRequestedByUserId: 'maker-1' },
    });
    await expect(
      svc.approveRelease({ tenantId: 't1', holdId: 'hold-1', actor: actorOf('ADMIN', 'maker-1') }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('FARKLI yetkili onaylar → RELEASED; audit iki aktörü de taşır', async () => {
    const { svc, audit } = buildDeps({
      hold: {
        id: 'hold-1',
        tenantId: 't1',
        status: 'RELEASE_REQUESTED',
        releaseRequestedByUserId: 'maker-1',
        releaseReason: 'dava kesinleşti',
      },
    });
    const updated = await svc.approveRelease({ tenantId: 't1', holdId: 'hold-1', actor: actorOf('ADMIN', 'checker-2') });
    expect(updated.status).toBe('RELEASED');
    expect(audit.logInTransaction).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        action: 'CLIENT_LEGAL_HOLD_RELEASE_APPROVE',
        metadata: expect.objectContaining({ requestedByUserId: 'maker-1', approvedByUserId: 'checker-2' }),
      }),
    );
  });

  it('ACTIVE olmayan hold için kaldırma talebi Conflict', async () => {
    const { svc } = buildDeps({ hold: { id: 'hold-1', tenantId: 't1', status: 'RELEASED' } });
    await expect(
      svc.requestRelease({ tenantId: 't1', holdId: 'hold-1', releaseReason: 'x', actor: actorOf('ADMIN') }),
    ).rejects.toBeInstanceOf(ConflictException);
  });
});

// =========================================================================================
// 3. On-demand silme değerlendirmesi — hold koşul-6'yı EZER; hiçbir silme çağrısı yok
// =========================================================================================
describe('evaluateDeletionRequest (K8.3 model A)', () => {
  it('staff talep edemez (yalnız yetkili talep — K8.3)', async () => {
    const { svc } = buildDeps();
    await expect(
      svc.evaluateDeletionRequest({ tenantId: 't1', clientId: 'c1', actor: actorOf('USER'), assessment: ALL_CONFIRMED }),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('aktif hold varken NO_ACTIVE_LEGAL_HOLD iddiası EZİLİR → DO_NOT_DELETE', async () => {
    const { svc, audit } = buildDeps({
      hold: { id: 'hold-1', tenantId: 't1', status: 'ACTIVE', scopeType: 'CLIENT', clientId: 'c1' },
    });
    const d = await svc.evaluateDeletionRequest({
      tenantId: 't1',
      clientId: 'c1',
      actor: actorOf('ADMIN'),
      assessment: ALL_CONFIRMED, // iddia: hold yok — DB aksini söylüyor
    });
    expect(d.result).toBe('DO_NOT_DELETE');
    expect(d.unmetConditions).toContain('NO_ACTIVE_LEGAL_HOLD');
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        action: 'CLIENT_DELETION_GATE_EVALUATED',
        metadata: expect.objectContaining({ activeHoldDetected: true }),
      }),
    );
  });

  it('RELEASE_REQUESTED hold hâlâ aktiftir (onaysız düşmez — fail-closed)', async () => {
    const { svc } = buildDeps({
      hold: { id: 'hold-1', tenantId: 't1', status: 'RELEASE_REQUESTED', scopeType: 'CLIENT', clientId: 'c1' },
    });
    const d = await svc.evaluateDeletionRequest({
      tenantId: 't1',
      clientId: 'c1',
      actor: actorOf('ADMIN'),
      assessment: ALL_CONFIRMED,
    });
    expect(d.unmetConditions).toContain('NO_ACTIVE_LEGAL_HOLD');
  });

  it('hold yok + 8 koşul CONFIRMED → yine YÜRÜTME YOK; hiçbir delete çağrısı yapılmadı', async () => {
    const { svc, prisma, tx } = buildDeps();
    const d = await svc.evaluateDeletionRequest({
      tenantId: 't1',
      clientId: 'c1',
      actor: actorOf('ADMIN'),
      assessment: ALL_CONFIRMED,
    });
    expect(d.executionAllowed).toBe(false);
    expect(d.result).toBe('ALL_CONDITIONS_MET_AWAITING_OWNER_METHOD_DECISION');
    expect(prisma.client.delete).not.toHaveBeenCalled();
    expect(prisma.client.deleteMany).not.toHaveBeenCalled();
    expect(tx.client.delete).not.toHaveBeenCalled();
    expect(tx.client.deleteMany).not.toHaveBeenCalled();
  });
});

// =========================================================================================
// 4. Statik kanıt — scheduler/otomatik silme YOK (K8.3)
// =========================================================================================
describe('K8.3 — scheduler ve otomatik silme yokluğu (statik)', () => {
  it('legal-hold servis kaynağında cron/interval/timeout tabanlı tetikleyici yoktur', () => {
    const src = readFileSync(join(__dirname, '..', 'client-legal-hold.service.ts'), 'utf8');
    expect(src).not.toMatch(/@Cron|setInterval|setTimeout|scheduleJob|CronExpression/);
    // delete yürütücüsü de yoktur: prisma delete/deleteMany çağrısı içermez
    expect(src).not.toMatch(/\.delete\(|\.deleteMany\(/);
  });
});

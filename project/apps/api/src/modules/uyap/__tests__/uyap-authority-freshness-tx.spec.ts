/**
 * UYAP-AUTHORITY-FRESHNESS-TX-I01 — authority snapshot + TX-1 revalidation birim testleri
 *
 * ## Kapatılan açık
 *
 * CPE gate kararı (Phase 1 / TX-0) ile `UyapOperation` evidence commit'i (TX-1) arasında
 * bir TOCTOU penceresi vardı: Phase 1 "allowed" dedikten sonra POA azledilebilir, avukat
 * pasifleştirilebilir, dosya kapatılabilir/arşivlenebilir, masraf bloğu açılabilir veya
 * UYAP erişilebilirliği kapatılabilirdi; TX-1 bunu GÖRMEDEN commit ederdi.
 *
 * Kapsanan güvenlik invariant'ları (owner §16):
 *   FR-01 Phase 1 allowed sonucu TX-1 authority DEĞİLDİR
 *   FR-02 TX-1 commit öncesi bütün mutable kaynaklar revalidate edilir
 *   FR-03 Stale authority operation YARATAMAZ
 *   FR-04 Cross-tenant source revalidation sonucu kullanılamaz
 *   FR-05 Client-supplied snapshot/digest KABUL EDİLMEZ
 *   FR-06 Snapshot server-side üretilir
 *   FR-07 Digest tenant/action/actor/case bound'dur
 *   FR-08 System availability missing/değişmişse deny/stale
 *   FR-10 Rollback orphan evidence üretmez
 *   FR-12 Idempotency owner UyapOperation olarak kalır
 *
 * Test seviyesi: saf birim (mock Prisma + gerçek servis mantığı; DB/Nest container yok).
 * Race senaryoları GERÇEK ZAMANLAMAYA GÜVENMEZ — deterministik koordinasyon kancası kullanılır.
 */
import { UyapAuthoritySnapshotService } from '../authority/uyap-authority-snapshot.service';
import { UyapSendAuthorityResolverService } from '../authority/uyap-send-authority-resolver.service';
import { ActingLawyerResolverService } from '../../lawyer/acting-lawyer-resolver.service';
import { ExpenseBlockReasonService } from '../../expense-block-reason/expense-block-reason.service';
import {
  MockUyapAvailabilityService,
  UyapAvailabilityService,
} from '../../policy-engine/fact-store/uyap-availability.service';
import { UyapOperationEvidenceOrchestrator } from '../operation-writer/uyap-operation-evidence.orchestrator';
import { UyapAuthorityStaleError } from '../authority/uyap-authority-stale.error';
import {
  UYAP_AUTHORITY_SNAPSHOT_VERSION,
  UyapAuthoritySnapshot,
} from '../authority/uyap-authority-snapshot.types';
import {
  UyapAuthorityCoordinationHook,
  UyapAuthorityCoordinationPoint,
} from '../authority/uyap-authority-coordination.hook';

// ============================================================================
// Deterministik dünya modeli — mutable "veritabanı"
// ============================================================================

const TENANT = 'tenant-a';
const OTHER_TENANT = 'tenant-b';
const USER = 'user-1';
const LAWYER = 'lawyer-1';
const CASE = 'case-1';
const CLIENT = 'client-1';
const POA = 'poa-1';
const POA_LAWYER = 'poalawyer-1';

const PAST = new Date('2026-01-01T00:00:00.000Z');
const FUTURE = new Date('2027-01-01T00:00:00.000Z');
const T0 = new Date('2026-06-01T00:00:00.000Z');

interface World {
  caseRow: any;
  lawyerRow: any;
  poaRow: any;
  blocks: any[];
}

const freshWorld = (): World => ({
  caseRow: {
    id: CASE,
    tenantId: TENANT,
    caseStatus: 'DERDEST',
    isArchived: false,
    allowUyapActions: true,
    updatedAt: T0,
    caseClients: [{ clientId: CLIENT, client: { id: CLIENT, tenantId: TENANT } }],
  },
  lawyerRow: { id: LAWYER, tenantId: TENANT, userId: USER, isActive: true, updatedAt: T0 },
  poaRow: {
    id: POA,
    clientId: CLIENT,
    tenantId: TENANT,
    status: 'ACTIVE',
    isActive: true,
    dateIssued: PAST,
    isLimited: false,
    validUntil: null,
    scopeType: 'GENEL',
    updatedAt: T0,
    lawyers: [{ id: POA_LAWYER, lawyerId: LAWYER, tenantId: TENANT }],
  },
  blocks: [],
});

/** `World`'ü okuyan mock Prisma. Aynı nesne hem Phase 1 hem TX-1 tarafından okunur. */
const buildPrisma = (world: World) => ({
  case: {
    findFirst: jest.fn(async (args: any) => {
      const w = args?.where ?? {};
      if (w.id !== world.caseRow.id) return null;
      if (w.tenantId && w.tenantId !== world.caseRow.tenantId) return null;
      return world.caseRow;
    }),
    count: jest.fn(async (args: any) => (args?.where?.id === world.caseRow.id ? 1 : 0)),
  },
  lawyer: {
    findMany: jest.fn(async (args: any) => {
      const w = args?.where ?? {};
      if (w.userId && w.userId !== world.lawyerRow.userId) return [];
      if (w.id && w.id !== world.lawyerRow.id) return [];
      if (w.tenantId && w.tenantId !== world.lawyerRow.tenantId) return [];
      return [world.lawyerRow];
    }),
  },
  clientPowerOfAttorney: {
    findMany: jest.fn(async (args: any) => {
      const w = args?.where ?? {};
      if (w.tenantId && w.tenantId !== world.poaRow.tenantId) return [];
      const ids: string[] = w.clientId?.in ?? [];
      if (ids.length > 0 && !ids.includes(world.poaRow.clientId)) return [];
      const wantedLawyer = w.lawyers?.some?.lawyerId;
      if (wantedLawyer && !world.poaRow.lawyers.some((l: any) => l.lawyerId === wantedLawyer)) {
        return [];
      }
      return [world.poaRow];
    }),
  },
  expenseBlockReason: {
    findMany: jest.fn(async (args: any) => {
      const w = args?.where ?? {};
      return world.blocks.filter(
        (b) =>
          b.tenantId === w.tenantId &&
          b.caseId === w.caseId &&
          b.blockedActionCode === w.blockedActionCode &&
          b.status === w.status &&
          (!w.createdAt?.lte || b.createdAt.getTime() <= w.createdAt.lte.getTime()),
      );
    }),
  },
});

const buildSnapshotService = (world: World, availability?: MockUyapAvailabilityService) => {
  const prisma = buildPrisma(world) as any;
  const service = new UyapAuthoritySnapshotService(
    prisma,
    new ActingLawyerResolverService(prisma),
    new UyapSendAuthorityResolverService(prisma),
    new ExpenseBlockReasonService(prisma),
    (availability ?? new MockUyapAvailabilityService()) as unknown as UyapAvailabilityService,
  );
  return { service, prisma };
};

const CONTEXT = {
  tenantId: TENANT,
  authenticatedUserId: USER,
  caseId: CASE,
  actionCode: 'UYAP_SEND',
  evaluatedAt: T0,
} as const;

const buildSnapshot = async (world: World, availability?: MockUyapAvailabilityService) => {
  const { service } = buildSnapshotService(world, availability);
  const result = await service.build(CONTEXT);
  if (!result.ok) throw new Error(`snapshot beklenirken hata: ${result.failureCode}`);
  return { service, snapshot: result.snapshot };
};

// ============================================================================
// 1) SNAPSHOT ÜRETİMİ
// ============================================================================

describe('UYAP-AUTHORITY-FRESHNESS-TX-I01 — authority snapshot', () => {
  it('sürüm, digest ve bütün canonical kaynaklar üretilir', async () => {
    const { snapshot } = await buildSnapshot(freshWorld());

    expect(snapshot.snapshotVersion).toBe(UYAP_AUTHORITY_SNAPSHOT_VERSION);
    expect(snapshot.authorityDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.tenantId).toBe(TENANT);
    expect(snapshot.actionCode).toBe('UYAP_SEND');
    expect(snapshot.actingLawyer.actingLawyerId).toBe(LAWYER);
    expect(snapshot.caseState).toMatchObject({
      caseStatus: 'DERDEST',
      isArchived: false,
      allowUyapActions: true,
    });
    expect(snapshot.clientIds).toEqual([CLIENT]);
    expect(snapshot.authorityEvidence).toHaveLength(1);
    expect(snapshot.authorityEvidence[0]).toMatchObject({ poaId: POA, poaLawyerId: POA_LAWYER });
    expect(snapshot.expenseBlocks).toEqual([]);
    expect(snapshot.systemAvailability).toEqual({ explicitlyConfigured: true, available: true });
  });

  it('PII taşımaz — belge metni/serbest açıklama snapshot ta YOKTUR', async () => {
    const { snapshot } = await buildSnapshot(freshWorld());
    const serialized = JSON.stringify(snapshot);

    for (const forbidden of ['scopeDescription', 'note', 'resolutionNote', 'documentUrl', 'identityNo']) {
      expect(serialized).not.toContain(forbidden);
    }
  });

  it('bağlam eksikse snapshot ÜRETİLMEZ (fail-closed)', async () => {
    const { service } = buildSnapshotService(freshWorld());

    for (const bad of [
      { ...CONTEXT, tenantId: '' },
      { ...CONTEXT, authenticatedUserId: '' },
      { ...CONTEXT, caseId: '' },
      { ...CONTEXT, actionCode: '' as any },
      { ...CONTEXT, evaluatedAt: undefined as any },
    ]) {
      const result = await service.build(bad as any);
      expect(result.ok).toBe(false);
    }
  });

  it('FR-04: cross-tenant case snapshot ÜRETMEZ', async () => {
    const { service } = buildSnapshotService(freshWorld());
    const result = await service.build({ ...CONTEXT, tenantId: OTHER_TENANT });
    expect(result.ok).toBe(false);
  });
});

// ============================================================================
// 2) DIGEST ÖZELLİKLERİ (FR-07)
// ============================================================================

describe('UYAP-AUTHORITY-FRESHNESS-TX-I01 — digest', () => {
  it('deterministik: aynı dünya aynı digest i üretir', async () => {
    const a = await buildSnapshot(freshWorld());
    const b = await buildSnapshot(freshWorld());
    expect(a.snapshot.authorityDigest).toBe(b.snapshot.authorityDigest);
  });

  it('alan sırasından BAĞIMSIZ (canonical serialization)', async () => {
    const { service, snapshot } = await buildSnapshot(freshWorld());
    // Anahtarları ters sırada yeniden kur — digest DEĞİŞMEMELİ.
    const reordered = Object.fromEntries(
      Object.entries(snapshot as unknown as Record<string, unknown>).reverse(),
    ) as unknown as UyapAuthoritySnapshot;
    expect(service.digest(reordered)).toBe(service.digest(snapshot));
  });

  const digestMutations: Array<[string, (s: UyapAuthoritySnapshot) => UyapAuthoritySnapshot]> = [
    ['tenant', (s) => ({ ...s, tenantId: OTHER_TENANT })],
    ['action', (s) => ({ ...s, actionCode: 'TRIGGER_HACIZ' })],
    ['actor', (s) => ({ ...s, authenticatedUserId: 'user-2' })],
    ['case', (s) => ({ ...s, caseState: { ...s.caseState, caseId: 'case-2' } })],
  ];

  it.each(digestMutations)('%s değişince digest DEĞİŞİR (bound)', async (_label, mutate) => {
    const { service, snapshot } = await buildSnapshot(freshWorld());
    expect(service.digest(mutate(snapshot))).not.toBe(service.digest(snapshot));
  });

  it('domain-separated: sürüm digest in içindedir', async () => {
    const { service, snapshot } = await buildSnapshot(freshWorld());
    const other = { ...snapshot, snapshotVersion: 'UYAP-AUTHORITY-SNAPSHOT/v0' };
    expect(service.digest(other)).not.toBe(service.digest(snapshot));
  });
});

// ============================================================================
// 3) REVALIDATION — ZORUNLU RACE MATRİSİ (owner §11)
// ============================================================================

describe('UYAP-AUTHORITY-FRESHNESS-TX-I01 — TX-1 revalidation race matrisi', () => {
  const revalidate = async (mutate: (w: World) => void, availability?: MockUyapAvailabilityService) => {
    const world = freshWorld();
    const av = availability ?? new MockUyapAvailabilityService();
    const { snapshot } = await buildSnapshot(world, av);

    // ── Phase 1 ile TX-1 arasında dünya DEĞİŞİR ──
    mutate(world);

    const { service: txService, prisma } = buildSnapshotService(world, av);
    return txService.revalidate(snapshot, prisma as any, new Date());
  };

  it('değişiklik YOKSA fresh', async () => {
    const world = freshWorld();
    const { snapshot } = await buildSnapshot(world);
    const { service, prisma } = buildSnapshotService(world);

    const result = await service.revalidate(snapshot, prisma as any, new Date());

    expect(result.fresh).toBe(true);
  });

  describe('POA yarışları', () => {
    const cases: Array<[string, (w: World) => void, string]> = [
      ['status REVOKED', (w) => { w.poaRow.status = 'REVOKED'; w.poaRow.isActive = false; }, 'AUTHORITY_REVALIDATION_FAILED'],
      ['isActive true→false', (w) => { w.poaRow.isActive = false; }, 'AUTHORITY_REVALIDATION_FAILED'],
      ['validUntil geçmişe çekildi', (w) => { w.poaRow.isLimited = true; w.poaRow.validUntil = PAST; }, 'AUTHORITY_REVALIDATION_FAILED'],
      ['dateIssued geleceğe itildi', (w) => { w.poaRow.dateIssued = FUTURE; }, 'AUTHORITY_REVALIDATION_FAILED'],
      ['scope BU_DOSYA ya çevrildi', (w) => { w.poaRow.scopeType = 'BU_DOSYA'; }, 'AUTHORITY_REVALIDATION_FAILED'],
      ['PoaLawyer ilişkisi silindi', (w) => { w.poaRow.lawyers = []; }, 'AUTHORITY_REVALIDATION_FAILED'],
      ['acting lawyer pasifleşti', (w) => { w.lawyerRow.isActive = false; }, 'AUTHORITY_REVALIDATION_FAILED'],
      // Yetki hâlâ geçerli ama kaynak DEĞİŞTİ → STALE (revalidation failed DEĞİL)
      ['POA updatedAt değişti (içerik aynı)', (w) => { w.poaRow.updatedAt = new Date('2026-06-02T00:00:00.000Z'); }, 'AUTHORITY_CONTEXT_STALE'],
      ['validUntil ileri tarihe uzatıldı', (w) => { w.poaRow.validUntil = FUTURE; }, 'AUTHORITY_CONTEXT_STALE'],
    ];

    it.each(cases)('%s → %s', async (_label, mutate, expected) => {
      const result = await revalidate(mutate);
      expect(result.fresh).toBe(false);
      if (!result.fresh) expect(result.failureCode).toBe(expected);
    });
  });

  describe('Case yarışları', () => {
    const cases: Array<[string, (w: World) => void]> = [
      ['dosya kapandı', (w) => { w.caseRow.caseStatus = 'HITAM'; w.caseRow.updatedAt = new Date('2026-06-03T00:00:00.000Z'); }],
      ['arşivlendi', (w) => { w.caseRow.isArchived = true; w.caseRow.updatedAt = new Date('2026-06-03T00:00:00.000Z'); }],
      ['allowUyapActions kapatıldı', (w) => { w.caseRow.allowUyapActions = false; w.caseRow.updatedAt = new Date('2026-06-03T00:00:00.000Z'); }],
      ['case updatedAt değişti', (w) => { w.caseRow.updatedAt = new Date('2026-06-03T00:00:00.000Z'); }],
    ];

    it.each(cases)('%s → AUTHORITY_CONTEXT_STALE', async (_label, mutate) => {
      const result = await revalidate(mutate);
      expect(result.fresh).toBe(false);
      if (!result.fresh) {
        expect(result.failureCode).toBe('AUTHORITY_CONTEXT_STALE');
        expect(result.changedSources).toContain('CASE_STATE_CHANGED');
      }
    });

    it('CaseClient ilişkisi kaldırıldı → revalidation FAILED', async () => {
      const result = await revalidate((w) => { w.caseRow.caseClients = []; });
      expect(result.fresh).toBe(false);
      if (!result.fresh) expect(result.failureCode).toBe('AUTHORITY_REVALIDATION_FAILED');
    });

    it('client tenant uyumsuzluğu ortaya çıktı → revalidation FAILED', async () => {
      const result = await revalidate((w) => {
        w.caseRow.caseClients = [{ clientId: CLIENT, client: { id: CLIENT, tenantId: OTHER_TENANT } }];
      });
      expect(result.fresh).toBe(false);
      if (!result.fresh) {
        expect(result.failureCode).toBe('AUTHORITY_REVALIDATION_FAILED');
        expect(result.revalidationFailureCode).toBe('CLIENT_TENANT_MISMATCH');
      }
    });
  });

  describe('Masraf bloğu yarışları', () => {
    it('Phase 1 SONRASI açılan blok GÖRÜLÜR → AUTHORITY_CONTEXT_STALE', async () => {
      // Blok, snapshot evaluatedAt inden SONRA oluşturulur. Revalidation commit anını
      // kullandığı için `createdAt <= evaluatedAt` filtresine TAKILMAZ.
      const result = await revalidate((w) => {
        w.blocks.push({
          id: 'blk-1',
          tenantId: TENANT,
          caseId: CASE,
          blockedActionCode: 'UYAP_SEND',
          status: 'OPEN',
          createdAt: new Date('2026-06-05T00:00:00.000Z'),
          resolvedAt: null,
          cancelledAt: null,
        });
      });

      expect(result.fresh).toBe(false);
      if (!result.fresh) {
        expect(result.failureCode).toBe('AUTHORITY_CONTEXT_STALE');
        expect(result.changedSources).toContain('EXPENSE_STATE_CHANGED');
      }
    });

    it('OPEN→RESOLVED (blok kalktı) da DEĞİŞİMDİR → AUTHORITY_CONTEXT_STALE', async () => {
      const world = freshWorld();
      world.blocks.push({
        id: 'blk-2',
        tenantId: TENANT,
        caseId: CASE,
        blockedActionCode: 'UYAP_SEND',
        status: 'OPEN',
        createdAt: PAST,
        resolvedAt: null,
        cancelledAt: null,
      });
      const { snapshot } = await buildSnapshot(world);
      world.blocks[0].status = 'RESOLVED';

      const { service, prisma } = buildSnapshotService(world);
      const result = await service.revalidate(snapshot, prisma as any, new Date());

      expect(result.fresh).toBe(false);
      if (!result.fresh) expect(result.changedSources).toContain('EXPENSE_STATE_CHANGED');
    });

    it('blockedActionCode başka aksiyona çevrildi → değişim görülür', async () => {
      const world = freshWorld();
      world.blocks.push({
        id: 'blk-3',
        tenantId: TENANT,
        caseId: CASE,
        blockedActionCode: 'UYAP_SEND',
        status: 'OPEN',
        createdAt: PAST,
        resolvedAt: null,
        cancelledAt: null,
      });
      const { snapshot } = await buildSnapshot(world);
      world.blocks[0].blockedActionCode = 'BANK_QUERY';

      const { service, prisma } = buildSnapshotService(world);
      const result = await service.revalidate(snapshot, prisma as any, new Date());

      expect(result.fresh).toBe(false);
    });
  });

  describe('Sistem erişilebilirliği (FR-08)', () => {
    it('true→false → SYSTEM_AVAILABILITY_STALE', async () => {
      const av = new MockUyapAvailabilityService();
      const world = freshWorld();
      const { snapshot } = await buildSnapshot(world, av);

      av.setAvailable(false);

      const { service, prisma } = buildSnapshotService(world, av);
      const result = await service.revalidate(snapshot, prisma as any, new Date());

      expect(result.fresh).toBe(false);
      if (!result.fresh) {
        expect(result.failureCode).toBe('SYSTEM_AVAILABILITY_STALE');
        expect(result.changedSources).toContain('SYSTEM_AVAILABILITY_CHANGED');
      }
    });

    it('yapılandırma KALKTI → SYSTEM_AVAILABILITY_STALE', async () => {
      const av = new MockUyapAvailabilityService();
      const world = freshWorld();
      const { snapshot } = await buildSnapshot(world, av);

      av.setExplicitlyConfigured(false);

      const { service, prisma } = buildSnapshotService(world, av);
      const result = await service.revalidate(snapshot, prisma as any, new Date());

      expect(result.fresh).toBe(false);
      if (!result.fresh) expect(result.failureCode).toBe('SYSTEM_AVAILABILITY_STALE');
    });

    it('provider EXCEPTION → snapshot üretilmez / revalidation stale (fail-closed)', async () => {
      const av = new MockUyapAvailabilityService();
      const world = freshWorld();
      const { snapshot } = await buildSnapshot(world, av);

      jest.spyOn(av, 'isUyapAvailable').mockImplementation(() => {
        throw new Error('ops signal unavailable');
      });

      const { service, prisma } = buildSnapshotService(world, av);
      const result = await service.revalidate(snapshot, prisma as any, new Date());

      expect(result.fresh).toBe(false);
      if (!result.fresh) expect(result.failureCode).toBe('SYSTEM_AVAILABILITY_STALE');
    });
  });
});

// ============================================================================
// 4) ORCHESTRATOR — TX-1 ROLLBACK / ORPHAN (FR-03, FR-10)
// ============================================================================

describe('UYAP-AUTHORITY-FRESHNESS-TX-I01 — TX-1 rollback ve orphan', () => {
  const buildOrchestrator = (
    world: World,
    availability: MockUyapAvailabilityService,
    hook?: UyapAuthorityCoordinationHook,
  ) => {
    const prisma = buildPrisma(world) as any;
    // $transaction: callback'i AYNI client ile çalıştırır; rollback simülasyonu için
    // yazma çağrıları sayılır (throw olursa hiçbiri çağrılmamış olmalıdır).
    const writes = { operation: 0, attempt: 0, link: 0 };
    prisma.$transaction = jest.fn(async (fn: any) => fn(prisma));

    const operationWriter = {
      createOperationWithFirstAttemptWithinTransaction: jest.fn(async () => {
        writes.operation++;
        writes.attempt++;
        return { operation: { id: 'op-1' }, firstAttempt: { id: 'att-1' }, created: true };
      }),
    };
    const linkWriter = {
      linkWithinTransaction: jest.fn(async () => {
        writes.link++;
        return { link: { id: 'link-1' }, created: true, reason: 'CREATED' };
      }),
    };
    const config = {
      get: (key: string) =>
        ({
          UYAP_OPERATION_EVIDENCE_ENABLED: 'true',
          UYAP_OPERATION_EVIDENCE_TENANT_ALLOWLIST: TENANT,
          UYAP_OPERATION_EVIDENCE_ACTION_ALLOWLIST: 'UYAP_SEND',
        })[key],
    };
    const snapshots = new UyapAuthoritySnapshotService(
      prisma,
      new ActingLawyerResolverService(prisma),
      new UyapSendAuthorityResolverService(prisma),
      new ExpenseBlockReasonService(prisma),
      availability as unknown as UyapAvailabilityService,
    );

    const orchestrator = new UyapOperationEvidenceOrchestrator(
      prisma,
      config as any,
      operationWriter as any,
      linkWriter as any,
      snapshots,
      hook,
    );

    return { orchestrator, snapshots, writes, operationWriter, linkWriter };
  };

  const command = (snapshot: UyapAuthoritySnapshot) => ({
    tenantId: TENANT,
    caseId: CASE,
    actorUserId: USER,
    action: 'UYAP_SEND' as const,
    idempotencyToken: 'token-abc',
    cpeDecisionLogId: 'dec-1',
    authoritySnapshot: snapshot,
  });

  it('taze authority → operation + attempt + link YAZILIR', async () => {
    const world = freshWorld();
    const av = new MockUyapAvailabilityService();
    const { snapshot } = await buildSnapshot(world, av);
    const { orchestrator, writes } = buildOrchestrator(world, av);

    const result = await orchestrator.recordEvidence(command(snapshot));

    expect(result.operation.id).toBe('op-1');
    expect(writes).toEqual({ operation: 1, attempt: 1, link: 1 });
  });

  it('FR-03/FR-10: STALE authority → 0 operation, 0 attempt, 0 link', async () => {
    const world = freshWorld();
    const av = new MockUyapAvailabilityService();
    const { snapshot } = await buildSnapshot(world, av);
    const { orchestrator, writes, operationWriter, linkWriter } = buildOrchestrator(world, av);

    // Phase 1 ile TX-1 arasında POA azledilir.
    world.poaRow.status = 'REVOKED';
    world.poaRow.isActive = false;

    await expect(orchestrator.recordEvidence(command(snapshot))).rejects.toBeInstanceOf(
      UyapAuthorityStaleError,
    );

    expect(writes).toEqual({ operation: 0, attempt: 0, link: 0 });
    expect(operationWriter.createOperationWithFirstAttemptWithinTransaction).not.toHaveBeenCalled();
    expect(linkWriter.linkWithinTransaction).not.toHaveBeenCalled();
  });

  it('stale hatası exact failure code ve changedSources taşır (internal evidence)', async () => {
    const world = freshWorld();
    const av = new MockUyapAvailabilityService();
    const { snapshot } = await buildSnapshot(world, av);
    const { orchestrator } = buildOrchestrator(world, av);

    world.caseRow.allowUyapActions = false;
    world.caseRow.updatedAt = new Date('2026-06-09T00:00:00.000Z');

    try {
      await orchestrator.recordEvidence(command(snapshot));
      throw new Error('stale beklenirken başarı döndü');
    } catch (error) {
      expect(error).toBeInstanceOf(UyapAuthorityStaleError);
      const stale = error as UyapAuthorityStaleError;
      expect(stale.failureCode).toBe('AUTHORITY_CONTEXT_STALE');
      expect(stale.changedSources).toContain('CASE_STATE_CHANGED');
      // Hata mesajı PII veya ilişki adı TAŞIMAZ.
      expect(stale.message).toBe('uyap_authority_stale:AUTHORITY_CONTEXT_STALE');
    }
  });

  it('deterministik barrier: revalidation ile create ARASINDA azil → yine 0 satır', async () => {
    const world = freshWorld();
    const av = new MockUyapAvailabilityService();
    const { snapshot } = await buildSnapshot(world, av);

    // Gerçek zamanlamaya GÜVENMEDEN: revalidation'dan HEMEN ÖNCE dünyayı değiştir.
    const points: UyapAuthorityCoordinationPoint[] = [];
    const hook: UyapAuthorityCoordinationHook = {
      wait: async (point) => {
        points.push(point);
        if (point === 'beforeTxRevalidation') {
          world.poaRow.status = 'REVOKED';
          world.poaRow.isActive = false;
        }
      },
    };
    const { orchestrator, writes } = buildOrchestrator(world, av, hook);

    await expect(orchestrator.recordEvidence(command(snapshot))).rejects.toBeInstanceOf(
      UyapAuthorityStaleError,
    );

    expect(points).toEqual(['beforeTxRevalidation', 'afterTxRevalidation']);
    expect(writes).toEqual({ operation: 0, attempt: 0, link: 0 });
  });

  it('barrier taze akışta ÜÇ durağı da sırayla geçer ve akışı değiştirmez', async () => {
    const world = freshWorld();
    const av = new MockUyapAvailabilityService();
    const { snapshot } = await buildSnapshot(world, av);

    const points: UyapAuthorityCoordinationPoint[] = [];
    const hook: UyapAuthorityCoordinationHook = { wait: async (p) => { points.push(p); } };
    const { orchestrator, writes } = buildOrchestrator(world, av, hook);

    await orchestrator.recordEvidence(command(snapshot));

    expect(points).toEqual([
      'beforeTxRevalidation',
      'afterTxRevalidation',
      'beforeOperationCreate',
    ]);
    expect(writes).toEqual({ operation: 1, attempt: 1, link: 1 });
  });

  it('hook YOKSA (production) akış değişmez — no-op', async () => {
    const world = freshWorld();
    const av = new MockUyapAvailabilityService();
    const { snapshot } = await buildSnapshot(world, av);
    const { orchestrator, writes } = buildOrchestrator(world, av, undefined);

    await orchestrator.recordEvidence(command(snapshot));

    expect(writes).toEqual({ operation: 1, attempt: 1, link: 1 });
  });

  it('FR-12: idempotency sahibi UyapOperation olarak kalır (writer yolu değişmedi)', async () => {
    const world = freshWorld();
    const av = new MockUyapAvailabilityService();
    const { snapshot } = await buildSnapshot(world, av);
    const { orchestrator, operationWriter } = buildOrchestrator(world, av);

    await orchestrator.recordEvidence(command(snapshot));

    const call = operationWriter.createOperationWithFirstAttemptWithinTransaction.mock.calls[0];
    expect(call[1].idempotencyKey).toMatch(/^UYAP-OP\/v1:/);
  });
});

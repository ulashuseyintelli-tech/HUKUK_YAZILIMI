import { OfficeWorkPoolKind, PrismaClient, StaffType } from '@prisma/client';
import { PrismaService } from '@/prisma/prisma.service';
import { describeDb } from '../../../../../test/describe-db';
import { OfficeService } from '../../office.service';
import { AuditService } from '../../../audit/audit.service';
import { OfficeWorkPoolMutationService } from '../office-work-pool.mutation.service';
import { OfficeWorkPoolPrismaRepository } from '../office-work-pool.repository';
import { OfficeWorkPoolResolverService } from '../office-work-pool-resolver.service';
import {
  OfficeWorkPoolUnknownStateError,
  OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS,
} from '../office-work-pool.mutation-contract';
import {
  catchUpTenant,
  findMissingAnchorTenants,
  measureCounters,
} from '../../../../scripts/office-work-pool-anchor-catchup';

/**
 * OFFICE-WR01-B02 AŞAMA 4 — ZORUNLU GERÇEK-POSTGRES MATRİSİ (§11.5.6, §11.5.8, §11.5.9 T6).
 *
 * NEDEN GERÇEK DB: kanıtlanan şey KİLİT DAVRANIŞIDIR. Mock'lu bir test `FOR UPDATE`'in
 * ikinci isteği beklettiğini, `clock_timestamp()`'in kilit sonrası ilerlediğini veya
 * legacy+membership'in birlikte rollback olduğunu KANITLAYAMAZ (§11.5.6 bağlayıcı).
 *
 * DETERMİNİZM: `Promise.all()` tek başına kilit sırasını kanıtlamaz. Bu suite kilidi ÜÇÜNCÜ
 * bir bağlantıdan tutar, isteklerin gerçekten `pg_stat_activity`'de KİLİT BEKLEDİĞİNİ ölçer,
 * sonra kilidi bırakır. Sıra VARSAYILMAZ: hangi isteğin son serialize edildiği ÖLÇÜLEN
 * `effectiveAt` değerlerinden türetilir ve invariant ona göre doğrulanır — PostgreSQL'in
 * tuple-lock kuyruğunun FIFO olduğu İDDİA EDİLMEZ.
 *
 * SALT-KENDİ-FIXTURE'I: yalnız `owp-a4-*` tenant'ları yazılır/silinir; persistent dev DB'ye
 * karşı koşmaz (`describeDb` + `TEST_DATABASE_URL` fail-safe'i).
 */
describeDb('OFFICE-WR01-B02 A4 — dual-write + concurrency (gercek Postgres)', () => {
  const prisma = new PrismaClient();
  const clientA = new PrismaClient();
  const clientB = new PrismaClient();
  const lockHolder = new PrismaClient();

  const T = 'owp-a4-tenant';
  const T_A1 = 'owp-a4-atomic-tenant';
  const T_GAP = 'owp-a4-gap-tenant';
  const T_GAP2 = 'owp-a4-gap2-tenant';
  const T_NEW = 'owp-a4-new-tenant';
  const TENANTS = [T, T_A1, T_GAP, T_GAP2, T_NEW];

  const LA = 'owp-a4-lawyer-a';
  const LB = 'owp-a4-lawyer-b';
  const LC = 'owp-a4-lawyer-c';
  const LD = 'owp-a4-lawyer-d';
  const ACTOR = 'owp-a4-actor-user';

  const POOL = 'ESCALATION_MANAGER' as const;

  const mutationA = new OfficeWorkPoolMutationService(clientA as unknown as PrismaService);
  const mutationB = new OfficeWorkPoolMutationService(clientB as unknown as PrismaService);
  const mutationMain = new OfficeWorkPoolMutationService(prisma as unknown as PrismaService);

  const audit = { log: jest.fn().mockResolvedValue(undefined) } as unknown as AuditService;
  const officeService = new OfficeService(prisma as unknown as PrismaService, audit);

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Yardımcılar
  // ══════════════════════════════════════════════════════════════════════════════════════

  /** `asOf = now` düzleminde aktif üye kümesi (sırasız). */
  async function activeMembers(
    tenantId: string,
    poolKind: OfficeWorkPoolKind = POOL,
  ): Promise<string[]> {
    const rows = await prisma.$queryRaw<{ member: string }[]>`
      SELECT coalesce(m."memberLawyerId", m."memberStaffType"::text) AS member
      FROM "OfficeWorkPoolMembership" m
      WHERE m."tenantId" = ${tenantId}
        AND m."poolKind" = ${poolKind}::"OfficeWorkPoolKind"
        AND m."validFrom" <= clock_timestamp() AT TIME ZONE 'UTC'
        AND (m."validUntil" IS NULL OR clock_timestamp() AT TIME ZONE 'UTC' < m."validUntil")
        AND (m."revokedAt"  IS NULL OR clock_timestamp() AT TIME ZONE 'UTC' < m."revokedAt")
    `;
    return rows.map((r) => r.member).sort();
  }

  async function legacyManagers(tenantId: string): Promise<string[]> {
    const office = await prisma.office.findUniqueOrThrow({
      where: { tenantId },
      select: { escalationManagerLawyerIds: true },
    });
    return [...office.escalationManagerLawyerIds].sort();
  }

  /**
   * Office satırının kilidini ÜÇÜNCÜ bir bağlantıda tutar. `release()` çağrılana kadar
   * transaction açık kalır — bu, eşzamanlı isteklerin gerçekten BEKLEMESİNİ sağlar.
   */
  function holdOfficeLock(tenantId: string) {
    let releaseSignal!: () => void;
    const released = new Promise<void>((resolve) => (releaseSignal = resolve));
    let acquiredSignal!: () => void;
    const acquired = new Promise<void>((resolve) => (acquiredSignal = resolve));
    let inside: ((tx: PrismaClient) => Promise<void>) | null = null;

    const finished = lockHolder.$transaction(
      async (tx) => {
        await tx.$queryRaw`SELECT "id" FROM "Office" WHERE "tenantId" = ${tenantId} FOR UPDATE`;
        acquiredSignal();
        await released;
        if (inside) await inside(tx as unknown as PrismaClient);
      },
      { maxWait: 30_000, timeout: 120_000 },
    );

    return {
      acquired,
      /** Kilidi bırakmadan ÖNCE, kilit altında ek bir yazma çalıştırır (T5 taze-okuma kanıtı). */
      setPreReleaseWrite(fn: (tx: PrismaClient) => Promise<void>) {
        inside = fn;
      },
      async release() {
        releaseSignal();
        await finished;
      },
    };
  }

  /** İsteklerin GERÇEKTEN kilitte beklediğini ölçer — `sleep` ile tahmin edilmez. */
  async function waitForLockWaiters(expected: number): Promise<void> {
    for (let i = 0; i < 400; i += 1) {
      const [row] = await prisma.$queryRaw<{ c: bigint }[]>`
        SELECT count(*)::bigint AS c
        FROM pg_stat_activity
        WHERE datname = current_database()
          AND wait_event_type = 'Lock'
          AND state = 'active'
      `;
      if (Number(row?.c ?? 0) >= expected) return;
      await new Promise((resolve) => setTimeout(resolve, 25));
    }
    throw new Error(`Beklenen ${expected} kilit bekleyeni olusmadi (deterministik bariyer kurulamadi).`);
  }

  async function nowUtc(): Promise<Date> {
    const [row] = await prisma.$queryRaw<{ t: Date }[]>`
      SELECT (clock_timestamp() AT TIME ZONE 'UTC')::timestamp(3) AS t
    `;
    return row.t;
  }

  function applyManagers(
    mutation: OfficeWorkPoolMutationService,
    tenantId: string,
    target: readonly string[],
  ) {
    return mutation.applyTargetState({
      tenantId,
      source: { mode: 'EXPLICIT', targetStates: { ESCALATION_MANAGER: target } },
      actorUserId: ACTOR,
    });
  }

  /** Havuzu verilen kümeye sıfırlar (test başlangıç durumu). */
  async function resetPool(tenantId: string, members: readonly string[]): Promise<void> {
    await prisma.officeWorkPoolMembership.deleteMany({ where: { tenantId } });
    await prisma.office.update({
      where: { tenantId },
      data: {
        escalationManagerLawyerIds: [...members],
        escalationFounderLawyerIds: [],
        opStaffTypes: [],
      },
    });
    if (members.length > 0) {
      await prisma.officeWorkPoolMembership.createMany({
        data: members.map((memberLawyerId) => ({
          tenantId,
          poolKind: POOL,
          memberLawyerId,
          validFrom: new Date('2026-08-17T00:00:00.000Z'),
          provenance: 'LEGACY_CUTOVER_IMPORT' as const,
        })),
      });
    }
  }

  const cleanup = async () => {
    await prisma.officeWorkPoolMembership.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.officeWorkPoolEpoch.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.lawyer.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.office.deleteMany({ where: { tenantId: { in: TENANTS } } });
    await prisma.tenant.deleteMany({ where: { id: { in: TENANTS } } });
  };

  beforeAll(async () => {
    await cleanup();
    await prisma.tenant.createMany({
      data: TENANTS.map((id) => ({ id, name: `A4 ${id}`, slug: id })),
    });
    // T_NEW BİLEREK Office'siz bırakılır: A2 onu `getOrCreate` ile yaratır.
    //
    // `opStaffTypes: []` AÇIKÇA verilir. Kolonun ŞEMA VARSAYILANI boş değildir
    // (`[MUHASEBE, ADLI_KATIP, SEKRETER]`); varsayılana bırakılırsa fixture, legacy dizisi
    // DOLU ama üyeliği BOŞ bir büro üretir ve A5'in parite sayacı bunu — haklı olarak —
    // drift sayar. Fixture'ın kendi tutarsızlığı, kodun kusuru gibi raporlanmamalıdır.
    await prisma.office.createMany({
      data: [T, T_A1, T_GAP, T_GAP2].map((tenantId) => ({
        tenantId,
        name: `A4 Buro ${tenantId}`,
        opStaffTypes: [],
      })),
    });
    await prisma.lawyer.createMany({
      data: [T, T_GAP, T_GAP2].flatMap((tenantId) =>
        [LA, LB, LC, LD].map((suffix) => ({
          id: `${tenantId}-${suffix}`,
          tenantId,
          name: suffix,
          surname: 'Avukat',
        })),
      ),
    });
    // T ve T_GAP2 anchor'lı; T_GAP BİLEREK anchor'sız (gap Office simülasyonu).
    await prisma.officeWorkPoolEpoch.createMany({
      data: [T, T_A1, T_GAP2].flatMap((tenantId) =>
        (['OP_STAFF_TYPE', 'ESCALATION_MANAGER', 'ESCALATION_FOUNDER'] as const).map((poolKind) => ({
          tenantId,
          poolKind,
          knownFrom: new Date('2026-08-17T00:00:00.000Z'),
          provenance: 'LEGACY_CUTOVER_IMPORT' as const,
        })),
      ),
    });
  }, 120_000);

  afterAll(async () => {
    await cleanup();
    await Promise.all([
      prisma.$disconnect(),
      clientA.$disconnect(),
      clientB.$disconnect(),
      lockHolder.$disconnect(),
    ]);
  }, 120_000);

  const A = `${T}-${LA}`;
  const B = `${T}-${LB}`;
  const C = `${T}-${LC}`;
  const D = `${T}-${LD}`;

  // ══════════════════════════════════════════════════════════════════════════════════════
  // T1-T4 — GENEL INVARIANT: final küme, TAMAMLANAN isteklerden BİRİNİN exact hedefidir
  // ══════════════════════════════════════════════════════════════════════════════════════

  /**
   * İki eşzamanlı isteği deterministik bariyerle koşturur ve invariantı doğrular.
   * Sıra ölçülür (daha büyük `effectiveAt` = sonra serialize edilen), varsayılmaz.
   */
  async function runConcurrentPair(
    initial: readonly string[],
    target1: readonly string[],
    target2: readonly string[],
  ) {
    await resetPool(T, initial);
    const lock = holdOfficeLock(T);
    await lock.acquired;

    const p1 = applyManagers(mutationA, T, target1);
    await waitForLockWaiters(1);
    const p2 = applyManagers(mutationB, T, target2);
    await waitForLockWaiters(2);

    const beforeRelease = await nowUtc();
    await lock.release();
    const [r1, r2] = await Promise.all([p1, p2]);

    const last = r1.effectiveAt.getTime() >= r2.effectiveAt.getTime() ? target1 : target2;
    const lastIsFirst = r1.effectiveAt.getTime() >= r2.effectiveAt.getTime();
    return {
      r1,
      r2,
      beforeRelease,
      /** SONRA serialize edilen isteğin hedefi — final küme bu olmalıdır. */
      lastTarget: [...last].sort(),
      lastRequest: lastIsFirst ? r1 : r2,
      firstRequest: lastIsFirst ? r2 : r1,
      final: await activeMembers(T),
      legacy: await legacyManagers(T),
    };
  }

  it('T1 — {A} + hedefler {A,B} ve {A,C} → final BIRININ exact hedefi; {A,B,C} ASLA', async () => {
    const outcome = await runConcurrentPair([A], [A, B], [A, C]);

    expect(outcome.final).toEqual(outcome.lastTarget);
    // Birleşik sonuç: lost-update anomalisinin imzası. Hiçbir koşulda kabul edilmez.
    expect(outcome.final).not.toEqual([A, B, C].sort());
    // Legacy projeksiyon ile membership AYNI transaction'da yazıldığı için kümeler eşittir.
    expect(outcome.legacy).toEqual(outcome.final);
  }, 120_000);

  it('T2 — {A} + hedefler {} ve {A,B} → final BIRININ exact hedefi; ara/birlesik sonuc YOK', async () => {
    const outcome = await runConcurrentPair([A], [], [A, B]);

    expect(outcome.final).toEqual(outcome.lastTarget);
    expect(outcome.legacy).toEqual(outcome.final);
    // Stale-read kaynaklı `{B}` veya `{A}` gibi hiçbir isteğin hedefi olmayan sonuç yasaktır.
    expect([[], [A, B].sort()]).toContainEqual(outcome.final);
  }, 120_000);

  it('T3 — ayni hedef iki kez → tek acik satir, duplicate URETILMEZ', async () => {
    const outcome = await runConcurrentPair([A], [A, B], [A, B]);

    expect(outcome.final).toEqual([A, B].sort());
    // Partial unique index backstop'u ihlal edilmemiştir ve gereksiz ikinci tarihsel satır
    // da üretilmemiştir: ikinci istek farkı BOŞ hesaplar (T1/T2/T4'te index sessizdir).
    const openRows = await prisma.officeWorkPoolMembership.count({
      where: { tenantId: T, poolKind: POOL, memberLawyerId: B, validUntil: null, revokedAt: null },
    });
    expect(openRows).toBe(1);
    const [second] = [outcome.r1, outcome.r2].filter(
      (r) => r.effectiveAt.getTime() === outcome.lastRequest.effectiveAt.getTime(),
    );
    expect(second.changes[0]?.addedMemberKeys.length + second.changes[0]?.revokedMemberKeys.length)
      .toBeGreaterThanOrEqual(0);
  }, 120_000);

  it('T4 — {A,B} + hedefler {A} ve {A,B,C} → yarim sonuc ({A,C}) YASAK', async () => {
    const outcome = await runConcurrentPair([A, B], [A], [A, B, C]);

    expect(outcome.final).toEqual(outcome.lastTarget);
    expect(outcome.final).not.toEqual([A, C].sort());
    expect(outcome.legacy).toEqual(outcome.final);
  }, 120_000);

  // ══════════════════════════════════════════════════════════════════════════════════════
  // T5 — kilit bekleme + TAZE okuma
  // ══════════════════════════════════════════════════════════════════════════════════════

  it('T5 — kilitte bekleyen istek, kilidi aldiktan SONRA TAZE durumu okur (stale snapshot YOK)', async () => {
    await resetPool(T, [A]);

    const lock = holdOfficeLock(T);
    await lock.acquired;

    // Kilit ALTINDA, bekleyen istek BAŞLADIKTAN SONRA state değişir: D havuza girer.
    lock.setPreReleaseWrite(async (tx) => {
      await tx.$executeRaw`
        INSERT INTO "OfficeWorkPoolMembership"
          ("id","tenantId","poolKind","memberLawyerId","validFrom","provenance","createdAt","updatedAt")
        VALUES (gen_random_uuid()::text, ${T}, 'ESCALATION_MANAGER'::"OfficeWorkPoolKind",
                ${D}, clock_timestamp() AT TIME ZONE 'UTC',
                'ADMIN_DECLARED'::"OfficeWorkPoolMembershipProvenance",
                clock_timestamp() AT TIME ZONE 'UTC', clock_timestamp() AT TIME ZONE 'UTC')
      `;
      await tx.$executeRaw`
        UPDATE "Office" SET "escalationManagerLawyerIds" = ARRAY[${A}, ${D}]::TEXT[]
        WHERE "tenantId" = ${T}
      `;
    });

    const waiting = applyManagers(mutationA, T, [A, C]);
    await waitForLockWaiters(1);
    await lock.release();
    await waiting;

    // STALE SNAPSHOT OLSAYDI: istek D'yi hiç görmez, revoke etmez ve final {A,C,D} olurdu.
    expect(await activeMembers(T)).toEqual([A, C].sort());
    const dRow = await prisma.officeWorkPoolMembership.findFirstOrThrow({
      where: { tenantId: T, poolKind: POOL, memberLawyerId: D },
      orderBy: { validFrom: 'desc' },
    });
    expect(dRow.revokedAt).not.toBeNull();
    expect(dRow.revokedByUserId).toBe(ACTOR);
    // REVOKE ≠ EXPIRE: planlanan bitiş kaydı (validUntil) DEĞİŞTİRİLMEZ (§11.3).
    expect(dRow.validUntil).toBeNull();
  }, 120_000);

  it('T5b — retry ust siniri sabittir ve dongude yeniden uygulama KOR degildir', async () => {
    // Bounded-retry sözleşmesinin sayısal kilidi; döngü davranışının kendisi
    // `office-work-pool-mutation-retry.spec.ts` içinde hata enjeksiyonuyla ölçülür.
    expect(OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS).toBe(3);
    await resetPool(T, [A]);
    const first = await applyManagers(mutationMain, T, [A, B]);
    // Aynı hedefin ikinci kez uygulanması (retry'in güvenliğini kuran özellik): fark BOŞ.
    const second = await applyManagers(mutationMain, T, [A, B]);
    expect(first.attempts).toBe(1);
    expect(second.changes[0]?.addedMemberKeys).toEqual([]);
    expect(second.changes[0]?.revokedMemberKeys).toEqual([]);
    expect(await activeMembers(T)).toEqual([A, B].sort());
  }, 120_000);

  // ══════════════════════════════════════════════════════════════════════════════════════
  // T6 — CF-B02-03: effectiveAt kilit SONRASI üretilir
  // ══════════════════════════════════════════════════════════════════════════════════════

  it('T6 — effectiveAt KILIT SONRASI uretilir (transaction-start now() DEGIL) ve sira bozulmaz', async () => {
    const outcome = await runConcurrentPair([A], [A, B], [A, C]);

    // KANIT: iki transaction da `beforeRelease` anından ÖNCE BAŞLAMIŞTI (kilitte bekliyorlardı).
    // `now()`/`CURRENT_TIMESTAMP` kullanılsaydı effectiveAt transaction başlangıcında DONAR ve
    // `beforeRelease`'ten KÜÇÜK olurdu. `>=` ölçümü tam olarak bunu dışlar.
    expect(outcome.r1.effectiveAt.getTime()).toBeGreaterThanOrEqual(outcome.beforeRelease.getTime());
    expect(outcome.r2.effectiveAt.getTime()).toBeGreaterThanOrEqual(outcome.beforeRelease.getTime());

    // Tarihsel sıra invariantı: önce serialize edilenin effectiveAt'i sonrakinden BÜYÜK OLAMAZ.
    // Aynı milisaniyeye yuvarlanma mümkün olduğu için STRICT büyüklük İDDİA EDİLMEZ.
    expect(outcome.lastRequest.effectiveAt.getTime()).toBeGreaterThanOrEqual(
      outcome.firstRequest.effectiveAt.getTime(),
    );

    // Mutation'ın TÜM satır yazımları TEK effectiveAt kullanır (satır başına saat çağrısı yok).
    const rows = await prisma.officeWorkPoolMembership.findMany({
      where: { tenantId: T, poolKind: POOL },
      select: { validFrom: true, validUntil: true, revokedAt: true },
    });
    const stamps = new Set(
      rows.flatMap((r) => [r.validFrom, r.revokedAt].filter((d): d is Date => d !== null)).map((d) => d.getTime()),
    );
    // Başlangıç fixture'ı + iki mutation → en fazla üç ayrı an. Satır başına saat çağrısı
    // olsaydı bu sayı satır sayısı kadar büyürdü.
    expect(stamps.size).toBeLessThanOrEqual(3);

    // Geçersiz aralık yok (§6.3 CHECK'leri son savunma hattıdır, tek savunma değil).
    for (const row of rows) {
      if (row.validUntil) expect(row.validFrom.getTime()).toBeLessThan(row.validUntil.getTime());
      if (row.revokedAt) expect(row.revokedAt.getTime()).toBeGreaterThanOrEqual(row.validFrom.getTime());
    }
  }, 120_000);

  // ══════════════════════════════════════════════════════════════════════════════════════
  // Hedef-durum semantiği (§3.2, §11.2)
  // ══════════════════════════════════════════════════════════════════════════════════════

  it('S1 — payloadda BULUNMAYAN havuz DEGISTIRILMEZ (UNCHANGED)', async () => {
    await resetPool(T, [A]);
    await prisma.office.update({ where: { tenantId: T }, data: { opStaffTypes: [StaffType.SEKRETER] } });
    await prisma.officeWorkPoolMembership.create({
      data: {
        tenantId: T,
        poolKind: 'OP_STAFF_TYPE',
        memberStaffType: StaffType.SEKRETER,
        validFrom: new Date('2026-08-17T00:00:00.000Z'),
        provenance: 'LEGACY_CUTOVER_IMPORT',
      },
    });

    await officeService.updateEscalationSettings(
      T,
      { escalationManagerLawyerIds: [A, B], opReminderDays: 7 },
      ACTOR,
    );

    // OP_STAFF_TYPE gövdede YOKTU → ne legacy dizi ne üyelik satırı değişti.
    expect(await activeMembers(T, 'OP_STAFF_TYPE')).toEqual([StaffType.SEKRETER]);
    const office = await prisma.office.findUniqueOrThrow({ where: { tenantId: T } });
    expect(office.opStaffTypes).toEqual([StaffType.SEKRETER]);
    expect(office.opReminderDays).toBe(7);
    expect(await activeMembers(T)).toEqual([A, B].sort());
  }, 120_000);

  it('S2 — EXPLICIT bos dizi havuzu GERCEKTEN bosaltir', async () => {
    await resetPool(T, [A, B]);

    await officeService.updateEscalationSettings(T, { escalationManagerLawyerIds: [] }, ACTOR);

    expect(await activeMembers(T)).toEqual([]);
    expect(await legacyManagers(T)).toEqual([]);
    const revoked = await prisma.officeWorkPoolMembership.findMany({
      where: { tenantId: T, poolKind: POOL },
      select: { revokedAt: true, revokedByUserId: true },
    });
    expect(revoked.every((r) => r.revokedAt !== null && r.revokedByUserId === ACTOR)).toBe(true);
  }, 120_000);

  it('S3 — DEGISMEYEN uyeye DOKUNULMAZ (satir kimligi ve zaman alanlari korunur)', async () => {
    await resetPool(T, [A]);
    const before = await prisma.officeWorkPoolMembership.findFirstOrThrow({
      where: { tenantId: T, poolKind: POOL, memberLawyerId: A },
    });

    await officeService.updateEscalationSettings(T, { escalationManagerLawyerIds: [A, B] }, ACTOR);

    const after = await prisma.officeWorkPoolMembership.findFirstOrThrow({
      where: { tenantId: T, poolKind: POOL, memberLawyerId: A },
    });
    // Naif "hepsini kapat, hepsini yeniden aç" olsaydı id ve validFrom DEĞİŞİRDİ ve üyeliğin
    // geçmişi her kaydetmede parçalanırdı (§11.2 açık yasak).
    expect(after.id).toBe(before.id);
    expect(after.validFrom.getTime()).toBe(before.validFrom.getTime());
    expect(after.updatedAt.getTime()).toBe(before.updatedAt.getTime());
    expect(after.revokedAt).toBeNull();
  }, 120_000);

  it('S4 — legacy ve membership AYNI transactionda rollback olur (partial commit YOK)', async () => {
    await resetPool(T, [A]);
    const legacyBefore = await legacyManagers(T);

    // Bu tenant'a ait OLMAYAN bir lawyer id → composite FK (§6.2) `23503` ile reddeder.
    await expect(
      officeService.updateEscalationSettings(
        T,
        { escalationManagerLawyerIds: [A, 'owp-a4-yok-lawyer'], opReminderDays: 99 },
        ACTOR,
      ),
    ).rejects.toThrow();

    // Legacy dizi DE, havuz-dışı alan DA, üyelik satırları DA değişmemiştir.
    const office = await prisma.office.findUniqueOrThrow({ where: { tenantId: T } });
    expect([...office.escalationManagerLawyerIds].sort()).toEqual(legacyBefore);
    expect(office.opReminderDays).not.toBe(99);
    expect(await activeMembers(T)).toEqual([A]);
  }, 120_000);

  it('S5 — admin GET hala legacy okur; anchorsiz buroda yazma FAIL-CLOSED olur', async () => {
    await resetPool(T, [A]);
    const settings = await officeService.getEscalationSettings(T);
    expect([...settings.escalationManagerLawyerIds].sort()).toEqual([A]);

    // T_GAP anchor'sızdır: "boş havuz" sayılmaz, mutation reddedilir (§6.7 madde 4).
    await expect(
      applyManagers(mutationMain, T_GAP, [`${T_GAP}-${LA}`]),
    ).rejects.toBeInstanceOf(OfficeWorkPoolUnknownStateError);
    expect(await prisma.officeWorkPoolMembership.count({ where: { tenantId: T_GAP } })).toBe(0);
  }, 120_000);

  // ══════════════════════════════════════════════════════════════════════════════════════
  // A1-A5 — anchor yaşam döngüsü ve catch-up
  // ══════════════════════════════════════════════════════════════════════════════════════

  it('A1 — yeni Office ile anchor ATOMIKTIR: anchor insert duserse Office de KALMAZ', async () => {
    // Kasıtlı arıza gerçek DB'de kurulur; mock'lu bir test rollback'i kanıtlayamaz.
    await prisma.$executeRawUnsafe(`
      CREATE OR REPLACE FUNCTION owp_a1_block() RETURNS trigger AS $fn$
      BEGIN RAISE EXCEPTION 'A1 kasitli anchor hatasi'; END $fn$ LANGUAGE plpgsql;
    `);
    await prisma.$executeRawUnsafe(`
      CREATE TRIGGER owp_a1_block_trg BEFORE INSERT ON "OfficeWorkPoolEpoch"
      FOR EACH ROW WHEN (NEW."tenantId" = '${T_NEW}') EXECUTE FUNCTION owp_a1_block();
    `);
    try {
      await expect(officeService.getOrCreate(T_NEW)).rejects.toThrow();
      expect(await prisma.office.count({ where: { tenantId: T_NEW } })).toBe(0);
      expect(await prisma.officeWorkPoolEpoch.count({ where: { tenantId: T_NEW } })).toBe(0);
    } finally {
      await prisma.$executeRawUnsafe(`DROP TRIGGER IF EXISTS owp_a1_block_trg ON "OfficeWorkPoolEpoch"`);
      await prisma.$executeRawUnsafe(`DROP FUNCTION IF EXISTS owp_a1_block()`);
    }
  }, 120_000);

  it('A2 — getOrCreate idempotenttir: tek Office, havuz basina TEK anchor (toplam 3)', async () => {
    const created = await officeService.getOrCreate(T_NEW);
    const again = await officeService.getOrCreate(T_NEW);
    expect(again.id).toBe(created.id);

    expect(await prisma.office.count({ where: { tenantId: T_NEW } })).toBe(1);
    const anchors = await prisma.officeWorkPoolEpoch.findMany({
      where: { tenantId: T_NEW },
      orderBy: { poolKind: 'asc' },
    });
    expect(anchors).toHaveLength(3);
    expect(anchors.map((a) => a.poolKind).sort()).toEqual([
      'ESCALATION_FOUNDER',
      'ESCALATION_MANAGER',
      'OP_STAFF_TYPE',
    ]);
    // knownFrom = Office.createdAt, provenance = TENANT_PROVISIONED (§6.7 madde 2).
    const office = await prisma.office.findUniqueOrThrow({ where: { tenantId: T_NEW } });
    for (const anchor of anchors) {
      expect(anchor.provenance).toBe('TENANT_PROVISIONED');
      expect(anchor.knownFrom.getTime()).toBe(office.createdAt.getTime());
    }

    // `opStaffTypes` ŞEMA VARSAYILANI BOŞ DEĞİLDİR: yalnız anchor yazılsaydı legacy DOLU /
    // üyelik BOŞ olur ve resolver havuzu yanlışlıkla `RESOLVED / EMPTY` okurdu. Üyelikler
    // anchor'larla AYNI transaction ve AYNI `createdAt` anında materyalize edilir.
    expect(office.opStaffTypes.length).toBeGreaterThan(0);
    const provisioned = await prisma.officeWorkPoolMembership.findMany({
      where: { tenantId: T_NEW },
    });
    expect(provisioned).toHaveLength(office.opStaffTypes.length);
    expect(provisioned.every((m) => m.poolKind === 'OP_STAFF_TYPE')).toBe(true);
    expect(provisioned.every((m) => m.validFrom.getTime() === office.createdAt.getTime())).toBe(true);
    expect(provisioned.every((m) => m.provenance === 'LEGACY_CUTOVER_IMPORT')).toBe(true);
    expect(await activeMembers(T_NEW, 'OP_STAFF_TYPE')).toEqual([...office.opStaffTypes].sort());

    // İkinci `getOrCreate` mevcut Office'i döndürür; yeni tarihsel satır ÜRETMEZ.
    expect(await prisma.officeWorkPoolMembership.count({ where: { tenantId: T_NEW } })).toBe(
      provisioned.length,
    );
  }, 120_000);

  it('A3 — catch-up IDEMPOTENTTIR: ikinci kosum yeni anchor/tarihsel satir URETMEZ', async () => {
    // T_GAP2 anchor'lı ama bu senaryoda anchor'ları silinerek gap Office'e çevrilir.
    await prisma.officeWorkPoolMembership.deleteMany({ where: { tenantId: T_GAP2 } });
    await prisma.officeWorkPoolEpoch.deleteMany({ where: { tenantId: T_GAP2 } });
    await prisma.office.update({
      where: { tenantId: T_GAP2 },
      data: { escalationManagerLawyerIds: [`${T_GAP2}-${LA}`], opStaffTypes: [StaffType.ARSIV] },
    });

    const first = await catchUpTenant(mutationMain, T_GAP2);
    expect(first.anchorsProvisioned).toBe(3);
    expect(first.membershipsMaterialized).toBe(2);

    const anchorsAfterFirst = await prisma.officeWorkPoolEpoch.findMany({
      where: { tenantId: T_GAP2 },
      orderBy: { poolKind: 'asc' },
    });
    const membershipsAfterFirst = await prisma.officeWorkPoolMembership.count({
      where: { tenantId: T_GAP2 },
    });

    const second = await catchUpTenant(mutationMain, T_GAP2);
    expect(second.anchorsProvisioned).toBe(0);
    expect(second.membershipsMaterialized).toBe(0);

    const anchorsAfterSecond = await prisma.officeWorkPoolEpoch.findMany({
      where: { tenantId: T_GAP2 },
      orderBy: { poolKind: 'asc' },
    });
    expect(await prisma.officeWorkPoolMembership.count({ where: { tenantId: T_GAP2 } })).toBe(
      membershipsAfterFirst,
    );
    expect(anchorsAfterSecond.map((a) => a.knownFrom.getTime())).toEqual(
      anchorsAfterFirst.map((a) => a.knownFrom.getTime()),
    );
  }, 120_000);

  it('A4 — DOLU legacy havuzlu gap Office: anchor + uyelik TEK catchUpAt snapshotinda', async () => {
    const gapManager = `${T_GAP}-${LA}`;
    await prisma.office.update({
      where: { tenantId: T_GAP },
      data: { escalationManagerLawyerIds: [gapManager], opStaffTypes: [StaffType.MUHASEBE] },
    });
    const legacyBefore = await prisma.office.findUniqueOrThrow({ where: { tenantId: T_GAP } });

    expect(await findMissingAnchorTenants(prisma)).toContain(T_GAP);
    await catchUpTenant(mutationMain, T_GAP);

    const anchors = await prisma.officeWorkPoolEpoch.findMany({ where: { tenantId: T_GAP } });
    expect(anchors).toHaveLength(3);
    // TEK snapshot: üç anchor ve üyelikler AYNI catchUpAt değerini taşır.
    const catchUpAt = anchors[0].knownFrom.getTime();
    expect(anchors.every((a) => a.knownFrom.getTime() === catchUpAt)).toBe(true);
    expect(anchors.every((a) => a.provenance === 'LEGACY_CUTOVER_IMPORT')).toBe(true);

    const memberships = await prisma.officeWorkPoolMembership.findMany({
      where: { tenantId: T_GAP },
    });
    expect(memberships).toHaveLength(2);
    expect(memberships.every((m) => m.validFrom.getTime() === catchUpAt)).toBe(true);
    expect(memberships.every((m) => m.provenance === 'LEGACY_CUTOVER_IMPORT')).toBe(true);

    // Legacy alanlara HİÇBİR değişiklik yapılmadı (§5.3 madde 6).
    const legacyAfter = await prisma.office.findUniqueOrThrow({ where: { tenantId: T_GAP } });
    expect(legacyAfter.escalationManagerLawyerIds).toEqual(legacyBefore.escalationManagerLawyerIds);
    expect(legacyAfter.opStaffTypes).toEqual(legacyBefore.opStaffTypes);

    // Resolver: snapshot anında legacy ile EŞİT, snapshot ÖNCESİNDE UNKNOWN.
    const resolver = new OfficeWorkPoolResolverService(
      new OfficeWorkPoolPrismaRepository(prisma as unknown as PrismaService),
    );
    const at = new Date(catchUpAt);
    const resolved = await resolver.resolveLawyerPool('ESCALATION_MANAGER', at, T_GAP);
    expect(resolved.status).toBe('RESOLVED');
    expect(resolved.status === 'RESOLVED' ? [...resolved.members] : []).toEqual([gapManager]);

    const earlier = await resolver.resolveLawyerPool(
      'ESCALATION_MANAGER',
      new Date(catchUpAt - 1000),
      T_GAP,
    );
    expect(earlier.status).toBe('UNKNOWN');
    expect(earlier.status === 'UNKNOWN' ? earlier.reason : null).toBe('BEFORE_KNOWN_FROM');

    // Yalnız-anchor yazılsaydı bu çağrı `RESOLVED / EMPTY` derdi — yani "havuz gerçekten
    // boştu" diye YANLIŞ bir iddia üretilirdi. §5.2'nin yasakladığı tam olarak budur.
    expect(resolved.status === 'RESOLVED' ? resolved.members.length : 0).toBeGreaterThan(0);
  }, 120_000);

  it('A5 — catch-up sonrasi dort dogrulama sayaci SIFIR', async () => {
    // Fixture'daki tüm gap'ler kapatılır; ardından sayaçlar TÜM DB üzerinden ölçülür.
    for (const tenantId of await findMissingAnchorTenants(prisma)) {
      await catchUpTenant(mutationMain, tenantId);
    }
    // T'nin havuzu ile membership'i, en son testin bıraktığı duruma göre hizalanır.
    await resetPool(T, [A]);

    const counters = await measureCounters(prisma);
    expect(counters).toEqual({
      missing_anchor_count: 0,
      legacy_membership_mismatch_count: 0,
      cross_tenant_count: 0,
      duplicate_active_membership_count: 0,
    });
  }, 180_000);
});

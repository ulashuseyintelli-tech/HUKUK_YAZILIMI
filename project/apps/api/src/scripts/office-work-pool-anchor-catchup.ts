/**
 * OFFICE-WR01-B02 AŞAMA 4 — ANCHOR CATCH-UP + DOĞRULAMA ARACI (§6.7, §5.2-5.3).
 *
 * ═══ NE İÇİN VAR ═══════════════════════════════════════════════════════════════════════
 * B02 schema migration'ı bir DB'ye uygulandıktan SONRA, AŞAMA 4 uygulama sürümü tüm
 * instance'larda aktif olmadan ÖNCE, ESKİ `OfficeService.getOrCreate` kodu yeni bir `Office`
 * yaratabilir. O Office anchor'sız doğar → resolver onu fail-closed `UNKNOWN/ANCHOR_MISSING`
 * okur ve havuz mutasyonu reddedilir. Bu araç o boşluğu kapatır.
 *
 * ═══ GAP WINDOW'UN DOĞRU TANIMI (bağlayıcı) ════════════════════════════════════════════
 * Pencere bu aracın VARLIĞIYLA veya PR'ın merge'iyle AÇILMAZ. Açılması için DÖRDÜ BİRDEN
 * gerekir: (1) migration bir DB'ye uygulanmıştır, (2) eski `getOrCreate` kullanan en az bir
 * instance çalışmaya devam eder, (3) o instance yeni bir Office yaratır, (4) AŞAMA 4 sürümü
 * henüz tüm instance'larda aktif değildir. Bu araç, kendisi çalıştırıldı diye pencerenin
 * kapandığını İDDİA ETMEZ: eski yazıcılar DRAIN EDİLMEDEN çalıştırılırsa, çalıştıktan sonra
 * yeni gap Office'ler doğmaya devam eder. Drain bir ÖN KOŞULDUR ve `--drained-confirmed`
 * ile AÇIKÇA beyan edilir; araç bunu kendiliğinden varsaymaz.
 *
 * ═══ TARİHSEL DOĞRULUK SINIRI (§5.2) ═══════════════════════════════════════════════════
 * Gap Office için YALNIZ anchor yazmak YASAKTIR: legacy havuzu dolu bir Office'e yalnız
 * anchor yazılırsa resolver onu `RESOLVED / EMPTY` okur — yani "havuz gerçekten boştu" diye
 * YANLIŞ bir iddia üretilir. Bu yüzden anchor + üç legacy havuzun mevcut hedef durumu TEK
 * `catchUpAt` snapshot'ında birlikte materyalize edilir.
 *
 * `Office.createdAt` `knownFrom`/`validFrom` olarak KULLANILMAZ: Office'in createdAt ile
 * catch-up arası havuz değişiklikleri GÜNCEL legacy dizilerden kanıtlanamaz; oradan bir tarih
 * türetmek geçmiş İCAT ETMEK olurdu (OD-B02-01 = A "cutover-only effective" ile aynı ilke).
 * Yürürlükteki semantik:
 *     knownFrom = validFrom = catchUpAt
 *     asOf <  catchUpAt → UNKNOWN
 *     asOf >= catchUpAt → snapshot alınan legacy hedef durumu
 *
 * PROVENANCE — yeni enum değeri İCAT EDİLMEZ. Hem anchor hem üyelik için
 * `LEGACY_CUTOVER_IMPORT` kullanılır ve bu semantik olarak DOĞRUDUR: schema şerhi bu değeri
 * "cutover anında düz diziden ithal edilmiş — validFrom bir İTHAL tarihidir, politikanın
 * gerçek başlangıcı DEĞİLDİR" diye tanımlar; catch-up tam olarak budur. `TENANT_PROVISIONED`
 * YANLIŞ olurdu ("büro o an doğdu" — gap Office daha ÖNCE doğmuştur).
 *
 * ═══ YAZMA YOLU ════════════════════════════════════════════════════════════════════════
 * Membership yazımı `OfficeWorkPoolMutationService.applyTargetState()` ÜZERİNDEN yapılır —
 * ikinci bir doğrudan writer OLUŞTURULMAZ (§11.5.7 madde 3). Böylece Office satırı `FOR UPDATE`
 * ile kilitlenir, `effectiveAt` kilit sonrası `clock_timestamp()` ile üretilir ve her Office
 * serialize edilir. `ADOPT_LEGACY_SNAPSHOT` modu legacy alanlara HİÇBİR yazma yapmaz.
 *
 * ═══ KULLANIM ══════════════════════════════════════════════════════════════════════════
 * PRODUCTION KANONİK BİÇİMİ derlenmiş JavaScript'tir; `npx`/`tsx` ve runtime transpilation
 * KULLANILMAZ (C14-R1A). Bakım penceresinde uzak paket indirmesine bağımlı olmak kabul
 * edilemez; komut `nest build` çıktısını doğrudan pinli Node ile çalıştırır:
 *
 *   node dist/apps/api/src/scripts/office-work-pool-anchor-catchup.js
 *   node dist/apps/api/src/scripts/office-work-pool-anchor-catchup.js --apply --drained-confirmed
 *
 * Developer ergonomisi için aynı derlenmiş dosyayı çalıştıran paket script'i de vardır
 * (paket adı `@hukuk/api`; kısa `--filter api` biçimi YANLIŞTIR):
 *
 *   pnpm --filter @hukuk/api owp:anchor-catchup                       # yalnız ölçüm (varsayılan)
 *   pnpm --filter @hukuk/api owp:anchor-catchup -- --apply --drained-confirmed
 *
 * `pnpm run ... --` biçimi argv'ye literal bir `--` elemanı geçirir; bayrak tespiti
 * `argv.includes(...)` olduğu için bu zararsızdır, yine de production komutu doğrudan
 * `node` biçimidir.
 *
 * Çıkış kodu: dört sayaçtan biri sıfır değilse NON-ZERO.
 * Bağlantı bilgisi (connection string / kimlik) HİÇBİR koşulda loglanmaz.
 */
import { PrismaClient } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { OfficeWorkPoolMutationService } from '../modules/office/work-pool/office-work-pool.mutation.service';
import { OFFICE_WORK_POOL_KINDS } from '../modules/office/work-pool/office-work-pool.mutation-contract';

interface CatchUpCounters {
  missing_anchor_count: number;
  legacy_membership_mismatch_count: number;
  cross_tenant_count: number;
  duplicate_active_membership_count: number;
}

interface CatchUpReport {
  readonly mode: 'VERIFY_ONLY' | 'APPLY';
  readonly candidateTenantCount: number;
  readonly processedTenantCount: number;
  readonly anchorsProvisioned: number;
  readonly membershipsMaterialized: number;
  readonly before: CatchUpCounters;
  readonly after: CatchUpCounters;
}

/** Anchor'ı eksik olan tenant'lar — havuz başına TAM bir anchor beklenir (§6.6). */
export async function findMissingAnchorTenants(prisma: PrismaClient): Promise<string[]> {
  const rows = await prisma.$queryRaw<{ tenantId: string }[]>`
    SELECT o."tenantId"
    FROM "Office" o
    LEFT JOIN "OfficeWorkPoolEpoch" e ON e."tenantId" = o."tenantId"
    GROUP BY o."tenantId"
    HAVING count(e."id") < ${OFFICE_WORK_POOL_KINDS.length}
    ORDER BY o."tenantId" ASC
  `;
  return rows.map((row) => row.tenantId);
}

/**
 * Dört doğrulama sayacı (§8.6 V-serisinin AŞAMA 4 kesiti).
 *
 * `legacy_membership_mismatch_count` SIRASIZ KÜME eşitliği ölçer: legacy dizide tekrar eden
 * bir üye membership'te TEK satırdır ve bu bir uyumsuzluk DEĞİLDİR (parite sözleşmesi de
 * küme eşitliğidir). Anchor'sız havuz `UNKNOWN`'dır; legacy ile karşılaştırılmaz ve
 * `missing_anchor_count` altında ayrıca sayılır — iki sayaç aynı kusuru İKİ KEZ raporlamaz.
 */
export async function measureCounters(prisma: PrismaClient): Promise<CatchUpCounters> {
  const [missing] = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(*)::bigint AS c
    FROM "Office" o
    CROSS JOIN unnest(enum_range(NULL::"OfficeWorkPoolKind")) AS k(kind)
    LEFT JOIN "OfficeWorkPoolEpoch" e
      ON e."tenantId" = o."tenantId" AND e."poolKind" = k.kind
    WHERE e."id" IS NULL
  `;

  const [mismatch] = await prisma.$queryRaw<{ c: bigint }[]>`
    WITH legacy AS (
      SELECT o."tenantId", 'OP_STAFF_TYPE'::"OfficeWorkPoolKind" AS "poolKind",
             (SELECT coalesce(array_agg(DISTINCT m::text ORDER BY m::text), '{}'::text[])
                FROM unnest(o."opStaffTypes") m) AS members
      FROM "Office" o
      UNION ALL
      SELECT o."tenantId", 'ESCALATION_MANAGER'::"OfficeWorkPoolKind",
             (SELECT coalesce(array_agg(DISTINCT m::text ORDER BY m::text), '{}'::text[])
                FROM unnest(o."escalationManagerLawyerIds") m)
      FROM "Office" o
      UNION ALL
      SELECT o."tenantId", 'ESCALATION_FOUNDER'::"OfficeWorkPoolKind",
             (SELECT coalesce(array_agg(DISTINCT m::text ORDER BY m::text), '{}'::text[])
                FROM unnest(o."escalationFounderLawyerIds") m)
      FROM "Office" o
    ),
    resolved AS (
      SELECT l."tenantId", l."poolKind", l.members,
             (SELECT coalesce(
                       array_agg(DISTINCT coalesce(mm."memberLawyerId", mm."memberStaffType"::text)
                                 ORDER BY coalesce(mm."memberLawyerId", mm."memberStaffType"::text)),
                       '{}'::text[])
                FROM "OfficeWorkPoolMembership" mm
               WHERE mm."tenantId" = l."tenantId"
                 AND mm."poolKind" = l."poolKind"
                 AND mm."validFrom" <= clock_timestamp() AT TIME ZONE 'UTC'
                 AND (mm."validUntil" IS NULL OR clock_timestamp() AT TIME ZONE 'UTC' < mm."validUntil")
                 AND (mm."revokedAt"  IS NULL OR clock_timestamp() AT TIME ZONE 'UTC' < mm."revokedAt")
             ) AS active
      FROM legacy l
      JOIN "OfficeWorkPoolEpoch" e
        ON e."tenantId" = l."tenantId" AND e."poolKind" = l."poolKind"
    )
    SELECT count(*)::bigint AS c FROM resolved WHERE members IS DISTINCT FROM active
  `;

  const [crossTenant] = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(*)::bigint AS c
    FROM "OfficeWorkPoolMembership" m
    LEFT JOIN "Lawyer" l ON l."id" = m."memberLawyerId"
    WHERE m."memberLawyerId" IS NOT NULL
      AND (l."id" IS NULL OR l."tenantId" <> m."tenantId")
  `;

  const [duplicate] = await prisma.$queryRaw<{ c: bigint }[]>`
    SELECT count(*)::bigint AS c FROM (
      SELECT m."tenantId", m."poolKind",
             coalesce(m."memberLawyerId", m."memberStaffType"::text) AS member
      FROM "OfficeWorkPoolMembership" m
      WHERE m."validFrom" <= clock_timestamp() AT TIME ZONE 'UTC'
        AND (m."validUntil" IS NULL OR clock_timestamp() AT TIME ZONE 'UTC' < m."validUntil")
        AND (m."revokedAt"  IS NULL OR clock_timestamp() AT TIME ZONE 'UTC' < m."revokedAt")
      GROUP BY 1, 2, 3
      HAVING count(*) > 1
    ) d
  `;

  return {
    missing_anchor_count: Number(missing?.c ?? 0),
    legacy_membership_mismatch_count: Number(mismatch?.c ?? 0),
    cross_tenant_count: Number(crossTenant?.c ?? 0),
    duplicate_active_membership_count: Number(duplicate?.c ?? 0),
  };
}

/**
 * Tek bir gap Office'i kapatır: anchor + üç legacy hedef, TEK `catchUpAt` snapshot'ında.
 *
 * REVOCATION BEKLENMEZ: anchor'sız bir Office'te membership satırı olamaz (her iki yazıcı da —
 * migration backfill ve primitive — anchor'ı zorunlu kılar). Yine de bir revocation gerekirse
 * primitive aktör kimliği olmadığı için FAIL-CLOSED olur; bu araç sistem adına bir aktör
 * UYDURMAZ ve durum owner disposition'ı ister.
 */
export async function catchUpTenant(
  mutation: OfficeWorkPoolMutationService,
  tenantId: string,
): Promise<{ anchorsProvisioned: number; membershipsMaterialized: number }> {
  const result = await mutation.applyTargetState({
    tenantId,
    source: { mode: 'ADOPT_LEGACY_SNAPSHOT' },
    anchorPolicy: 'PROVISION_MISSING',
    membershipProvenance: 'LEGACY_CUTOVER_IMPORT',
    anchorProvenance: 'LEGACY_CUTOVER_IMPORT',
  });
  return {
    anchorsProvisioned: result.provisionedAnchorKinds.length,
    membershipsMaterialized: result.changes.reduce(
      (sum, change) => sum + change.addedMemberKeys.length,
      0,
    ),
  };
}

export async function runAnchorCatchUp(
  prisma: PrismaClient,
  options: { readonly apply: boolean },
): Promise<CatchUpReport> {
  const before = await measureCounters(prisma);
  const candidates = await findMissingAnchorTenants(prisma);

  let processedTenantCount = 0;
  let anchorsProvisioned = 0;
  let membershipsMaterialized = 0;

  if (options.apply) {
    const mutation = new OfficeWorkPoolMutationService(prisma as unknown as PrismaService);
    // Tenant'lar SIRAYLA işlenir: her biri kendi Office satırının kilidini alır ve serialize
    // edilir. Paralel koşum throughput dışında bir şey kazandırmaz, gözlemi zorlaştırır.
    for (const tenantId of candidates) {
      const outcome = await catchUpTenant(mutation, tenantId);
      processedTenantCount += 1;
      anchorsProvisioned += outcome.anchorsProvisioned;
      membershipsMaterialized += outcome.membershipsMaterialized;
    }
  }

  const after = await measureCounters(prisma);

  return {
    mode: options.apply ? 'APPLY' : 'VERIFY_ONLY',
    candidateTenantCount: candidates.length,
    processedTenantCount,
    anchorsProvisioned,
    membershipsMaterialized,
    before,
    after,
  };
}

/** Sayaçların tamamı sıfır mı — çıkış kodunun tek belirleyicisi. */
export function countersAreClean(counters: CatchUpCounters): boolean {
  return (
    counters.missing_anchor_count === 0 &&
    counters.legacy_membership_mismatch_count === 0 &&
    counters.cross_tenant_count === 0 &&
    counters.duplicate_active_membership_count === 0
  );
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2);
  const apply = argv.includes('--apply');
  const drainedConfirmed = argv.includes('--drained-confirmed');

  if (apply && !drainedConfirmed) {
    // Fail-closed ÖN KOŞUL: eski `getOrCreate` yazıcıları drain edilmeden catch-up'ın gap
    // window'u KESİN kapattığı iddia EDİLEMEZ (§12 rollout adım 4-5).
    console.error(
      JSON.stringify({
        event: 'office_work_pool_anchor_catchup_blocked',
        reason: 'DRAIN_NOT_CONFIRMED',
        message:
          '--apply icin --drained-confirmed zorunludur: eski getOrCreate kullanan tum instance drain edilmis olmalidir.',
      }),
    );
    process.exit(2);
  }

  const prisma = new PrismaClient();
  try {
    const report = await runAnchorCatchUp(prisma, { apply });
    // Bağlantı bilgisi / kimlik ASLA yazılmaz; yalnız sayaçlar ve tenant SAYILARI raporlanır.
    console.log(JSON.stringify({ event: 'office_work_pool_anchor_catchup', ...report }, null, 2));
    if (!countersAreClean(report.after)) {
      console.error(
        JSON.stringify({
          event: 'office_work_pool_anchor_catchup_failed',
          reason: 'NON_ZERO_COUNTERS',
          counters: report.after,
        }),
      );
      process.exit(1);
    }
  } finally {
    await prisma.$disconnect();
  }
}

// Modül olarak import edildiğinde (testler) main ÇALIŞMAZ.
if (require.main === module) {
  main().catch((error: unknown) => {
    console.error(
      JSON.stringify({
        event: 'office_work_pool_anchor_catchup_error',
        // Hata mesajı bağlantı bilgisi taşıyabilir; yalnız hata SINIFI raporlanır.
        errorName: error instanceof Error ? error.name : typeof error,
      }),
    );
    process.exit(1);
  });
}

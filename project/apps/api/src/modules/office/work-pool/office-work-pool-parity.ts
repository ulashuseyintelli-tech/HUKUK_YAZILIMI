import { OfficeWorkPoolKind, StaffType } from '@prisma/client';
import {
  OfficeLawyerPoolKind,
  OfficeLawyerPoolResolution,
  OfficeStaffTypePoolKind,
  OfficeStaffTypePoolResolution,
  OfficeWorkPoolResolution,
} from './office-work-pool.contract';
import { OfficeLegacyPoolReadPort } from './office-work-pool.repository';

/**
 * OFFICE-WR01-B02 AŞAMA 3 — PARİTE HARNESS'İ.
 *
 * NE YAPAR: legacy düz diziler (SOT) ile resolver çıktısını AYNI `asOf` düzleminde, tenant ve
 * havuz bazında, SIRASIZ KÜME EŞİTLİĞİ ile karşılaştırır.
 *
 * NE YAPMAZ: hiçbir şey yazmaz. Düzeltme, catch-up, dual-write ve source-of-truth değişikliği
 * KAPSAM DIŞIDIR. Mismatch bulunursa harness onu RAPORLAR; onarım owner disposition'ı ister.
 *
 * `UNKNOWN` sonuç legacy ile "eşit" SAYILMAZ:
 *  - `BEFORE_KNOWN_FROM` → tarihsel parity KAPSAMI DIŞI (ne PASS ne FAIL); ayrı sayılır.
 *  - `ANCHOR_MISSING`    → AYRI ANOMALİ; verdict'i PASS olmaktan çıkarır.
 *
 * GİZLİLİK: tenant kimlikleri ve lawyer id'leri MASKELENİR. `StaffType` maskelenmez — o bir
 * kapalı enum değeridir, kimlik değildir; maskelenmesi raporu okunamaz kılar ve hiçbir kişisel
 * veri korumaz.
 *
 * @see office-work-pool-resolver.service.ts
 */

/** Tek bir (tenant, poolKind) karşılaştırmasının sonucu. */
export type OfficeWorkPoolParityStatus =
  | 'PASS'
  | 'MISMATCH'
  | 'ANCHOR_MISSING'
  | 'BEFORE_KNOWN_FROM';

/** Ölçümün veri kaynağı. Sentetik fixture "real-data parity" DİYE RAPORLANAMAZ. */
export type OfficeWorkPoolParitySource = 'REAL_DATA_DISPOSABLE_CLONE' | 'SYNTHETIC_FIXTURE';

export interface OfficeWorkPoolParityComparison {
  readonly tenantRef: string;
  readonly poolKind: OfficeWorkPoolKind;
  readonly status: OfficeWorkPoolParityStatus;
  readonly legacyCount: number;
  readonly resolvedCount: number;
  /** Legacy'de olup resolver'da olmayan üyeler (maskeli). */
  readonly onlyInLegacy: readonly string[];
  /** Resolver'da olup legacy'de olmayan üyeler (maskeli). */
  readonly onlyInResolved: readonly string[];
}

export interface OfficeWorkPoolParityReport {
  readonly asOf: string;
  readonly source: OfficeWorkPoolParitySource;
  readonly tenantCount: number;
  /** Gerçekten karşılaştırılabilmiş (RESOLVED) çift sayısı: PASS + MISMATCH. */
  readonly comparedCount: number;
  readonly passCount: number;
  readonly mismatchCount: number;
  readonly anchorMissingCount: number;
  readonly beforeKnownFromCount: number;
  /**
   * `NOT_MEASURED`: hiç karşılaştırılabilir çift yoktu. Bu BİLEREK PASS DEĞİLDİR — sıfır ölçüm
   * üzerinden yeşil rapor üretmek harness'i yalancı yapardı.
   */
  readonly verdict: 'PASS' | 'FAIL' | 'NOT_MEASURED';
  readonly comparisons: readonly OfficeWorkPoolParityComparison[];
}

/** Resolver'ın parite için gereken en dar yüzeyi (somut servise bağlanmadan test edilebilir). */
export interface OfficeWorkPoolParityResolverPort {
  resolveLawyerPool(
    poolKind: OfficeLawyerPoolKind,
    asOf: Date,
    tenantId: string,
  ): Promise<OfficeLawyerPoolResolution>;
  resolveStaffTypePool(
    poolKind: OfficeStaffTypePoolKind,
    asOf: Date,
    tenantId: string,
  ): Promise<OfficeStaffTypePoolResolution>;
}

export interface OfficeWorkPoolParitySweepDeps {
  readonly legacy: OfficeLegacyPoolReadPort;
  readonly resolver: OfficeWorkPoolParityResolverPort;
}

export interface OfficeWorkPoolParitySweepOptions {
  readonly asOf: Date;
  readonly source: OfficeWorkPoolParitySource;
  /** Verilmezse TÜM Office satırları taranır (gerçek-veri klonu senaryosu). */
  readonly tenantIds?: readonly string[];
  /**
   * Taramadan ÇIKARILACAK tenant'lar.
   *
   * Neden var: gerçek-veri taraması `REAL_DATA_DISPOSABLE_CLONE` kaynağını ölçer, fakat aynı
   * disposable klonda test suite'inin kendi SENTETİK fixture'ı da bulunabilir. O satırlar
   * gerçek veri DEĞİLDİR; taramaya dahil edilirlerse "real-data parity" iddiası kendi test
   * verisiyle kirlenir (ve kasten anchor'sız bırakılmış bir fixture, gerçek veriye ait
   * olmayan bir `ANCHOR_MISSING` üretir). Dışlama ölçümü gizlemez: rapor `tenantCount`
   * değerini dışlamadan SONRA verir, yani kapsam okunabilir kalır.
   */
  readonly excludeTenantIds?: readonly string[];
}

/**
 * Kimlik maskesi. Deterministiktir (aynı girdi → aynı çıktı), böylece `onlyInLegacy` /
 * `onlyInResolved` listeleri karşılaştırılabilir kalır ama ham kimlik loglanmaz.
 */
export function maskIdentity(value: string): string {
  if (value.length <= 8) return '***';
  return `${value.slice(0, 4)}***${value.slice(-2)}`;
}

function toSet<T extends string>(values: readonly T[]): Set<T> {
  return new Set(values);
}

function difference<T extends string>(left: Set<T>, right: Set<T>): T[] {
  const out: T[] = [];
  for (const value of left) if (!right.has(value)) out.push(value);
  return out.sort();
}

/**
 * SAF karşılaştırma. Sırasız küme eşitliği; her iki taraf da tekilleştirilir (legacy düz dizide
 * teorik olarak tekrar bulunabilir, `String[]` kolonunda uniqueness garantisi YOKTUR).
 */
export function compareOfficeWorkPoolParity<T extends string>(
  legacyMembers: readonly T[],
  resolution: OfficeWorkPoolResolution<T>,
  maskMember: (value: T) => string,
): Pick<
  OfficeWorkPoolParityComparison,
  'status' | 'legacyCount' | 'resolvedCount' | 'onlyInLegacy' | 'onlyInResolved'
> {
  const legacySet = toSet(legacyMembers);

  if (resolution.status === 'UNKNOWN') {
    return {
      // UNKNOWN legacy ile ASLA "eşit" sayılmaz; boş legacy dizisi bile bunu PASS yapmaz.
      status: resolution.reason === 'ANCHOR_MISSING' ? 'ANCHOR_MISSING' : 'BEFORE_KNOWN_FROM',
      legacyCount: legacySet.size,
      resolvedCount: 0,
      onlyInLegacy: [...legacySet].sort().map(maskMember),
      onlyInResolved: [],
    };
  }

  const resolvedSet = toSet(resolution.members);
  const onlyInLegacy = difference(legacySet, resolvedSet);
  const onlyInResolved = difference(resolvedSet, legacySet);

  return {
    status: onlyInLegacy.length === 0 && onlyInResolved.length === 0 ? 'PASS' : 'MISMATCH',
    legacyCount: legacySet.size,
    resolvedCount: resolvedSet.size,
    onlyInLegacy: onlyInLegacy.map(maskMember),
    onlyInResolved: onlyInResolved.map(maskMember),
  };
}

/**
 * Tenant × üç havuz taraması.
 *
 * Havuzlar AYRI ölçülür (tek toplam sayı raporlanmaz): bir havuzun PASS'ı diğerinin
 * MISMATCH'ini gizleyemez.
 */
export async function runOfficeWorkPoolParitySweep(
  deps: OfficeWorkPoolParitySweepDeps,
  options: OfficeWorkPoolParitySweepOptions,
): Promise<OfficeWorkPoolParityReport> {
  const { asOf, source, tenantIds, excludeTenantIds } = options;
  const excluded = new Set(excludeTenantIds ?? []);
  const offices = (await deps.legacy.listLegacyPools(tenantIds)).filter(
    (office) => !excluded.has(office.tenantId),
  );
  const comparisons: OfficeWorkPoolParityComparison[] = [];

  for (const office of offices) {
    const tenantRef = maskIdentity(office.tenantId);

    const staffTypeResolution = await deps.resolver.resolveStaffTypePool(
      'OP_STAFF_TYPE',
      asOf,
      office.tenantId,
    );
    comparisons.push({
      tenantRef,
      poolKind: 'OP_STAFF_TYPE',
      ...compareOfficeWorkPoolParity<StaffType>(
        office.opStaffTypes,
        staffTypeResolution,
        // StaffType kapalı bir enum değeridir; maskelemek raporu okunamaz kılar, kimlik korumaz.
        (value) => value,
      ),
    });

    const lawyerPools: ReadonlyArray<readonly [OfficeLawyerPoolKind, readonly string[]]> = [
      ['ESCALATION_MANAGER', office.escalationManagerLawyerIds],
      ['ESCALATION_FOUNDER', office.escalationFounderLawyerIds],
    ];

    for (const [poolKind, legacyMembers] of lawyerPools) {
      const resolution = await deps.resolver.resolveLawyerPool(poolKind, asOf, office.tenantId);
      comparisons.push({
        tenantRef,
        poolKind,
        ...compareOfficeWorkPoolParity<string>(legacyMembers, resolution, maskIdentity),
      });
    }
  }

  const passCount = comparisons.filter((c) => c.status === 'PASS').length;
  const mismatchCount = comparisons.filter((c) => c.status === 'MISMATCH').length;
  const anchorMissingCount = comparisons.filter((c) => c.status === 'ANCHOR_MISSING').length;
  const beforeKnownFromCount = comparisons.filter((c) => c.status === 'BEFORE_KNOWN_FROM').length;
  const comparedCount = passCount + mismatchCount;

  const verdict: OfficeWorkPoolParityReport['verdict'] =
    comparedCount === 0
      ? 'NOT_MEASURED'
      : mismatchCount === 0 && anchorMissingCount === 0
        ? 'PASS'
        : 'FAIL';

  return {
    asOf: asOf.toISOString(),
    source,
    tenantCount: offices.length,
    comparedCount,
    passCount,
    mismatchCount,
    anchorMissingCount,
    beforeKnownFromCount,
    verdict,
    comparisons,
  };
}

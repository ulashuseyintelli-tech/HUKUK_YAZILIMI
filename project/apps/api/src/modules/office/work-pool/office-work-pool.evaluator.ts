import { OfficeWorkPoolKind, StaffType } from '@prisma/client';
import {
  OfficeLawyerPoolKind,
  OfficeStaffTypePoolKind,
  OfficeWorkPoolContractViolationError,
  OfficeWorkPoolDiagnostic,
  OfficeWorkPoolEvaluation,
  OfficeWorkPoolMemberCarrier,
  OfficeWorkPoolResolution,
  OFFICE_WORK_POOL_MEMBER_CARRIER,
} from './office-work-pool.contract';

/**
 * OFFICE-WR01-B02 AŞAMA 3 — SAF EVALUATOR (§7.1-7.6).
 *
 * KATMAN SINIRI (bağlayıcı): bu dosyada **IO YOKTUR** — Prisma yok, `Logger` yok, saat okuma
 * yok, env yok. Girdi tek bir snapshot'tır, çıktı karar + yapısal tanılardır. Sebep: predikatın
 * TEK kaynağı olsun ve testi gerçek DB'ye bağımlı olmasın (§7 "saf, IO-suz, tek kaynak" deseni;
 * repo emsali `client-financial-disclosure-approval-eligibility.ts`).
 *
 * @see office-work-pool.contract.ts
 * @see office-work-pool-resolver.service.ts (bu evaluator'ın TEK orchestration tüketicisi)
 */

/** Resolver'ın ihtiyaç duyduğu üyelik alanları. Prisma satırı bu şekle yapısal olarak uyar. */
export interface OfficeWorkPoolMembershipRow {
  readonly id: string;
  readonly tenantId: string;
  readonly poolKind: OfficeWorkPoolKind;
  readonly memberLawyerId: string | null;
  readonly memberStaffType: StaffType | null;
  /** Effective başlangıç — INCLUSIVE. */
  readonly validFrom: Date;
  /** Planlı bitiş — EXCLUSIVE; null = açık uçlu. */
  readonly validUntil: Date | null;
  /** İrade beyanıyla sonlandırma — EXCLUSIVE; validUntil'den AYRI (§7.2). */
  readonly revokedAt: Date | null;
}

/** Knowledge-boundary anchor'ının resolver'a lazım olan tek alanı (§6.6). */
export interface OfficeWorkPoolAnchorRow {
  readonly knownFrom: Date;
}

/**
 * Tek repository çağrısının ürettiği tam snapshot.
 *
 * `anchor === null` "anchor satırı YOK" demektir ve EMPTY ile ASLA eşitlenmez (§6.7 madde 4).
 */
export interface OfficeWorkPoolSnapshot {
  readonly anchor: OfficeWorkPoolAnchorRow | null;
  readonly memberships: readonly OfficeWorkPoolMembershipRow[];
}

/**
 * §7.1 temel predikatı — DEĞİŞTİRİLMEDEN, tek yerde:
 *
 *     validFrom <= asOf                                (INCLUSIVE)
 *     AND (validUntil IS NULL OR asOf < validUntil)    (EXCLUSIVE)
 *     AND (revokedAt  IS NULL OR asOf < revokedAt)     (EXCLUSIVE)
 *     AND row.tenantId = tenantId                      (ZORUNLU)
 *
 * Yarı-açık aralık [validFrom, validUntil): ardışık dönemler sınırda ne boşluk ne örtüşme
 * üretir. Tüm karşılaştırmalar **UTC instant** üzerindedir (getTime(), TIMESTAMP(3)); yerel
 * tarih→instant dönüşümü B02'nin kapsamı DIŞINDADIR (§7.3).
 *
 * revokedAt geçmişteki aktifliği DEĞİŞTİRMEZ: asOf < revokedAt sorgusu üyeyi hâlâ havuzda
 * gösterir (§7.2) — PermissionGrant'ın validUntil-geri-çekme yönteminin kaybettiği özellik.
 */
export function isOfficeWorkPoolMembershipActiveAt(
  row: OfficeWorkPoolMembershipRow,
  asOf: Date,
  tenantId: string,
): boolean {
  const at = asOf.getTime();
  return (
    row.tenantId === tenantId &&
    row.validFrom.getTime() <= at &&
    (row.validUntil === null || at < row.validUntil.getTime()) &&
    (row.revokedAt === null || at < row.revokedAt.getTime())
  );
}

/**
 * Deterministik sıralama. `localeCompare` BİLEREK kullanılmadı: locale'e bağlıdır, yani aynı
 * veri farklı makinede farklı sıralanabilir ve "deterministik çıktı" gate'ini yalanlar.
 */
function compareMemberKeys(a: string, b: string): number {
  if (a < b) return -1;
  if (a > b) return 1;
  return 0;
}

interface CoreParams<TMember> {
  readonly poolKind: OfficeWorkPoolKind;
  readonly asOf: Date;
  readonly tenantId: string;
  readonly snapshot: OfficeWorkPoolSnapshot;
  readonly carrier: OfficeWorkPoolMemberCarrier;
  /** Taşıyıcı uyumluysa üyeyi çıkarır; uyumsuzsa null döner (satır elenir + tanı üretilir). */
  readonly extractMember: (row: OfficeWorkPoolMembershipRow) => TMember | null;
  readonly memberKey: (member: TMember) => string;
}

function evaluateCore<TMember>(params: CoreParams<TMember>): OfficeWorkPoolEvaluation<TMember> {
  const { poolKind, asOf, tenantId, snapshot, carrier, extractMember, memberKey } = params;
  const diagnostics: OfficeWorkPoolDiagnostic[] = [];

  // §7.6 / §6.7 madde 4: anchor YOKSA fail-closed UNKNOWN. "Şimdi yarat" veya "boş kabul et"
  // yorumu YASAKTIR; anchor'ın yokluğu bir BİLGİ YOKLUĞUDUR.
  if (snapshot.anchor === null) {
    return {
      resolution: { status: 'UNKNOWN', reason: 'ANCHOR_MISSING', members: [] },
      diagnostics,
    };
  }

  // §7.6: bilgi sınırından ÖNCE sistem hiçbir iddiada bulunmaz. Sınır YALNIZ anchor.knownFrom'dur;
  // membership'lerin min(validFrom) değeri knowledge boundary olarak KULLANILMAZ
  // (§7.6 madde 7 — bağlayıcı).
  if (asOf.getTime() < snapshot.anchor.knownFrom.getTime()) {
    return {
      resolution: { status: 'UNKNOWN', reason: 'BEFORE_KNOWN_FROM', members: [] },
      diagnostics,
    };
  }

  // Aktif üyelerin kimlik→satır kümesi. Erken DISTINCT YOK: örtüşen satırların GÖRÜNÜRLÜĞÜ
  // tekilleştirmeden ÖNCE ölçülür, aksi hâlde anomali sessizce yok olurdu (§7.4).
  const activeRowIdsByKey = new Map<string, string[]>();
  const memberByKey = new Map<string, TMember>();

  for (const row of snapshot.memberships) {
    if (row.poolKind !== poolKind) {
      diagnostics.push({
        code: 'POOL_KIND_MISMATCH',
        poolKind,
        rowId: row.id,
        rowPoolKind: row.poolKind,
      });
      continue;
    }

    // Tenant maddesi predikatın parçasıdır; burada AYRICA elenir ki saf katman da cross-tenant
    // sızıntıya karşı kendi başına fail-closed olsun (§7.5). Repository sorgusu zaten
    // tenant-scoped'dur, yani bu tanı üretiliyorsa snapshot sözleşmesi ihlal edilmiştir.
    if (row.tenantId !== tenantId) {
      diagnostics.push({ code: 'CROSS_TENANT_ROW', poolKind, rowId: row.id });
      continue;
    }

    if (!isOfficeWorkPoolMembershipActiveAt(row, asOf, tenantId)) continue;

    const member = extractMember(row);
    if (member === null) {
      // Migration'daki CHECK 1-2 bunu DB düzeyinde imkânsız kılar; ikinci savunma hattı
      // satırı SONUCA SOKMAZ. Tanı yalnız AKTİF satırlar için üretilir: kapanmış bozuk bir
      // satır bu sonucu etkilemez, dolayısıyla bu kararın tanısı da değildir.
      diagnostics.push({
        code: 'MEMBER_CARRIER_MISMATCH',
        poolKind,
        rowId: row.id,
        expectedCarrier: carrier,
      });
      continue;
    }

    const key = memberKey(member);
    const existing = activeRowIdsByKey.get(key);
    if (existing === undefined) {
      activeRowIdsByKey.set(key, [row.id]);
      memberByKey.set(key, member);
    } else {
      existing.push(row.id);
    }
  }

  // §7.4: UYARI YALNIZ aynı (tenantId, poolKind, ÜYE) için aynı asOf anında birden fazla aktif
  // satır varsa üretilir. FARKLI üyelerin aynı anda aktif olması normaldir (havuz çok üyelidir)
  // ve hiçbir tanı üretmez.
  for (const [key, rowIds] of activeRowIdsByKey) {
    if (rowIds.length > 1) {
      diagnostics.push({
        code: 'DUPLICATE_ACTIVE_MEMBER',
        poolKind,
        memberKey: key,
        activeRowCount: rowIds.length,
        rowIds: [...rowIds].sort(compareMemberKeys),
      });
    }
  }

  // Küme semantiği: aynı üye deterministik biçimde TEKİLLEŞTİRİLİR, hata FIRLATILMAZ.
  const members = [...activeRowIdsByKey.keys()]
    .sort(compareMemberKeys)
    .map((key) => memberByKey.get(key) as TMember);

  return { resolution: { status: 'RESOLVED', members }, diagnostics };
}

/**
 * Lawyer-id taşıyıcılı havuzun saf değerlendirmesi.
 *
 * Runtime fail-closed: tip sistemi atlanıp staff-type havuzu geçilirse
 * `OfficeWorkPoolContractViolationError` fırlatılır — sessiz UNKNOWN'a çevrilmez, çünkü bu bir
 * veri anomalisi değil PROGRAMLAMA HATASIDIR.
 */
export function evaluateOfficeLawyerPool(
  poolKind: OfficeLawyerPoolKind,
  asOf: Date,
  tenantId: string,
  snapshot: OfficeWorkPoolSnapshot,
): OfficeWorkPoolEvaluation<string> {
  assertPoolCarrier(poolKind, 'LAWYER');
  return evaluateCore<string>({
    poolKind,
    asOf,
    tenantId,
    snapshot,
    carrier: 'LAWYER',
    // XOR bütünlüğü TAM aranır: lawyer havuzunda memberStaffType DOLU olmamalıdır.
    extractMember: (row) =>
      row.memberLawyerId !== null && row.memberStaffType === null ? row.memberLawyerId : null,
    memberKey: (member) => member,
  });
}

/**
 * Staff-type taşıyıcılı havuzun saf değerlendirmesi.
 *
 * `StaffType` bir ENUM DEĞERİDİR, bir kimlik değildir; lawyer id'leriyle tek dizi tipinde
 * birleştirilmesi `operational-escalation.service.ts`'teki tür-filtresi ile kimlik-filtresi
 * arasındaki gerçek anlam farkını yok ederdi (§7.8).
 */
export function evaluateOfficeStaffTypePool(
  poolKind: OfficeStaffTypePoolKind,
  asOf: Date,
  tenantId: string,
  snapshot: OfficeWorkPoolSnapshot,
): OfficeWorkPoolEvaluation<StaffType> {
  assertPoolCarrier(poolKind, 'STAFF_TYPE');
  return evaluateCore<StaffType>({
    poolKind,
    asOf,
    tenantId,
    snapshot,
    carrier: 'STAFF_TYPE',
    extractMember: (row) =>
      row.memberStaffType !== null && row.memberLawyerId === null ? row.memberStaffType : null,
    memberKey: (member) => member,
  });
}

/** Havuz türü ↔ imza taşıyıcısı uyumunun runtime kilidi (tip sistemi atlanırsa). */
export function assertPoolCarrier(
  poolKind: OfficeWorkPoolKind,
  expected: OfficeWorkPoolMemberCarrier,
): void {
  const actual: OfficeWorkPoolMemberCarrier | undefined =
    OFFICE_WORK_POOL_MEMBER_CARRIER[poolKind];
  if (actual !== expected) {
    throw new OfficeWorkPoolContractViolationError(
      `Havuz turu ${String(poolKind)} tasiyicisi ${String(actual)}; bu imza ${expected} bekliyor.`,
    );
  }
}

/** `RESOLVED` daraltması — tüketicilerin `status` karşılaştırmasını tekrarlamaması için. */
export function isOfficeWorkPoolResolved<T>(
  resolution: OfficeWorkPoolResolution<T>,
): resolution is { readonly status: 'RESOLVED'; readonly members: readonly T[] } {
  return resolution.status === 'RESOLVED';
}

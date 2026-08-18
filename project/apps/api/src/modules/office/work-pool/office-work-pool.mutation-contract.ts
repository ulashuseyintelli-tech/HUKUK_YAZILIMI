import { OfficeWorkPoolKind, StaffType } from '@prisma/client';
import { OFFICE_WORK_POOL_MEMBER_CARRIER } from './office-work-pool.contract';

/**
 * OFFICE-WR01-B02 AŞAMA 4 — DUAL-WRITE MUTATION SÖZLEŞMESİ (§9.4, §11.2-11.5.9).
 *
 * KAPSAM: saf tip/sözleşme + hata sınıflandırması. Sıfır IO, sıfır Nest wiring.
 * Mutation'ın kendisi `office-work-pool.mutation.service.ts` içindedir ve `OfficeWorkPoolMembership`
 * üzerinde yazma yapan TEK runtime yoludur (§11.5.7 LOCK INVARIANT).
 *
 * AŞAMA 4'ÜN SINIRI (bağlayıcı): legacy düz diziler HÂLÂ source-of-truth'tur (§9.1, §9.2 AŞAMA 4).
 * Yeni üyelik tablosu legacy hedef durumunun effective-dated MIRROR'ıdır. Okuma cutover'ı
 * (AŞAMA 6 / G8) bu PR'ın DIŞINDADIR ve altı tüketiciden hiçbiri resolver'a bağlanmamıştır.
 *
 * @see project/docs/governance/office-wr01-decomposition-r01/b02-effective-dated-pools-design-r01.md
 * @see office-work-pool.contract.ts (AŞAMA 3 okuma sözleşmesi — burada TEKRARLANMAZ)
 */

/**
 * Kapalı havuz kümesinin deterministik listesi.
 *
 * `OFFICE_WORK_POOL_MEMBER_CARRIER`'dan TÜRETİLİR; ikinci bir literal liste olarak YAZILMAZ.
 * Eksiksizlik kilidi (`satisfies Record<OfficeWorkPoolKind, …>`) orada bir kez kurulmuştur ve bu
 * liste onun izdüşümüdür — iki listenin zamanla ayrışması yapısal olarak imkânsızdır. Enum'a
 * yeni havuz eklenirse taşıyıcı tablosu typecheck'i kırar, bu liste ise sessizce eksik kalmaz.
 * Sıra `getOrCreate` anchor yazımında ve teşhis çıktısında determinizm içindir; semantik taşımaz.
 */
export const OFFICE_WORK_POOL_KINDS = Object.keys(
  OFFICE_WORK_POOL_MEMBER_CARRIER,
) as readonly OfficeWorkPoolKind[];

/**
 * Havuz türünün üye TİPİ — taşıyıcı tablosundan türetilir (§7.8).
 * `OP_STAFF_TYPE` → `StaffType` enum değeri; lawyer havuzları → `Lawyer.id`.
 * Tek bir `string[]` altında birleştirilmesi tür-filtresi ile kimlik-filtresi arasındaki
 * gerçek anlam farkını yok ederdi.
 */
export type OfficeWorkPoolMemberOf<K extends OfficeWorkPoolKind> =
  (typeof OFFICE_WORK_POOL_MEMBER_CARRIER)[K] extends 'STAFF_TYPE' ? StaffType : string;

/**
 * Admin payload'unun havuz kısmının açık hedef-durum ifadesi (§11.2, handoff §3.2).
 *
 * ÜÇ HÂL BİRBİRİNDEN AYRIDIR ve karıştırılması veri kaybı üretir:
 *   - alan YOK (`undefined`)  → `UNCHANGED`      : havuza HİÇ dokunulmaz
 *   - alan var, `[]`          → `EXPLICIT EMPTY` : havuz gerçekten boşaltılır
 *   - alan var, üyeli         → `EXPLICIT TARGET`: replace-all hedefi
 *
 * `undefined` = UNCHANGED eşlemesi mevcut API'nin BİREBİR korunmasıdır: gövdede olmayan alan
 * bugün de `prisma.office.update` tarafından dokunulmadan bırakılır. "Payload'da yoksa boş
 * hedeftir" yorumu `OFFICE_S1_FIELDS` allowlist tuzağının (§11.4, PR-1.5) mutation tarafındaki
 * eşdeğeri olurdu ve sınıflandırılmamış havuzu SESSİZCE SİLERDİ.
 *
 * Mapped type olduğu için enum'a yeni havuz eklendiğinde alan otomatik doğar.
 */
export type OfficeWorkPoolTargetStates = {
  readonly [K in OfficeWorkPoolKind]?: readonly OfficeWorkPoolMemberOf<K>[];
};

/**
 * Hedef durumun kaynağı.
 *
 * `ADOPT_LEGACY_SNAPSHOT` YALNIZ catch-up aracı içindir (§5.2): kilit altında okunan üç legacy
 * dizi aynı `effectiveAt` anında membership'e materyalize edilir ve legacy alanlara HİÇBİR
 * değişiklik yapılmaz. Admin yolu her zaman `EXPLICIT` kullanır.
 */
export type OfficeWorkPoolTargetStateSource =
  | { readonly mode: 'EXPLICIT'; readonly targetStates: OfficeWorkPoolTargetStates }
  | { readonly mode: 'ADOPT_LEGACY_SNAPSHOT' };

/**
 * Anchor politikası.
 *
 * - `REQUIRE_EXISTING` (varsayılan, admin yolu): anchor yoksa mutation FAIL-CLOSED olur.
 *   Eksik anchor'ı "boş havuz" saymak `CF-B02-01`'in düzelttiği hatanın ta kendisidir (§6.7/4).
 * - `PROVISION_MISSING`: eksik anchor'lar AYNI transaction'da, AYNI `effectiveAt` ile yazılır.
 *   YALNIZ catch-up aracı kullanır; admin yolu bunu ASLA kullanmaz.
 */
export type OfficeWorkPoolAnchorPolicy = 'REQUIRE_EXISTING' | 'PROVISION_MISSING';

/** Havuz başına uygulanan fark (§11.2). `unchanged` satırlara DOKUNULMAZ. */
export interface OfficeWorkPoolPoolChange {
  readonly poolKind: OfficeWorkPoolKind;
  readonly addedMemberKeys: readonly string[];
  readonly revokedMemberKeys: readonly string[];
  readonly unchangedMemberKeys: readonly string[];
}

/**
 * Belirsiz-commit sonrası çift-yüzey doğrulamasının sonucu (C13-R01, §9.4a/5).
 *
 * - `NOT_REQUIRED`        : önceki deneme belirsizlik bırakmadı (ilk deneme veya kesin rollback).
 * - `BOTH_SURFACES_MATCH` : legacy diziler VE aktif üyelik kümeleri hedefe eşitti → hiçbir havuz
 *                           yazımı yapılmadı. "Commit olmuş ama cevap kaybolmuş" hâlinin kanıtı.
 * - `MISMATCH_REAPPLIED`  : en az bir yüzey hedeften farklıydı → hedef durum yeniden uygulandı.
 */
export type OfficeWorkPoolVerificationOutcome =
  | 'NOT_REQUIRED'
  | 'BOTH_SURFACES_MATCH'
  | 'MISMATCH_REAPPLIED';

/** `applyTargetState()` sonucu. */
export interface OfficeWorkPoolApplyTargetStateResult {
  /** Çift-yüzey doğrulamasının bu koşumdaki sonucu (C13-R01). */
  readonly verification: OfficeWorkPoolVerificationOutcome;
  /** Kilit ALINDIKTAN SONRA `clock_timestamp()` ile üretilen TEK zaman (§11.5.9). */
  readonly effectiveAt: Date;
  /** Kaçıncı denemede commit edildi (bounded retry kanıtı, §9.4a/4). */
  readonly attempts: number;
  /** Legacy projeksiyon yazıldıysa güncel Office satırı; yazılmadıysa kilit altında okunan satır. */
  readonly office: Record<string, unknown>;
  readonly changes: readonly OfficeWorkPoolPoolChange[];
  /** `PROVISION_MISSING` altında bu transaction'da yaratılan anchor'lar. */
  readonly provisionedAnchorKinds: readonly OfficeWorkPoolKind[];
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// HATA SINIFLARI — fail-closed domain hataları
// ═══════════════════════════════════════════════════════════════════════════════════════

/** Tüm B02 mutation domain hatalarının ortak atası (tek `instanceof` kapısı). */
export class OfficeWorkPoolMutationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = new.target.name;
  }
}

/** Kilitlenecek `Office` satırı yok. `getOrCreate` çağrılmadan primitive'e girilmiş demektir. */
export class OfficeWorkPoolOfficeMissingError extends OfficeWorkPoolMutationError {
  constructor(readonly tenantId: string) {
    super(`Tenant ${tenantId} icin Office satiri yok; havuz mutasyonu kilitlenemez.`);
  }
}

/**
 * Bilgi sınırı kaydı yok veya `effectiveAt` sınırdan önce → havuzun O ANDAKİ durumu UNKNOWN.
 * Fark hesabı UNKNOWN üzerinde YAPILAMAZ: "bilmiyorum"u "boştu" sayan bir diff, mevcut
 * üyelikleri sessizce revoke ederdi. AŞAMA 4'ün catch-up'ı bu durumu kapatmak içindir (§5.2).
 */
export class OfficeWorkPoolUnknownStateError extends OfficeWorkPoolMutationError {
  constructor(
    readonly poolKind: OfficeWorkPoolKind,
    readonly reason: string,
  ) {
    super(
      `Havuz ${poolKind} icin etkin durum UNKNOWN (${reason}); hedef-durum farki hesaplanamaz.`,
    );
  }
}

/**
 * Revocation yazılacak ama aktör kimliği yok.
 * DB CHECK'i `("revokedAt" IS NULL) = ("revokedByUserId" IS NULL)` bunu zaten `23514` ile
 * reddeder; burada ÖNCEDEN ve okunur biçimde durdurulur (§6.3 CHECK 5).
 */
export class OfficeWorkPoolActorRequiredError extends OfficeWorkPoolMutationError {
  constructor(readonly poolKind: OfficeWorkPoolKind) {
    super(`Havuz ${poolKind} uzerinde revocation icin aktor kimligi (userId) zorunludur.`);
  }
}

/** Havuz kolonları YALNIZ fark hesabından yazılır; passthrough ile yazılamaz (§4 tek writer). */
export class OfficeWorkPoolLegacyPassthroughViolationError extends OfficeWorkPoolMutationError {
  constructor(readonly column: string) {
    super(
      `Legacy havuz kolonu '${column}' passthrough ile yazilamaz; hedef-durum farkindan yazilir.`,
    );
  }
}

/** Payload'daki üye, tenant'ta mevcut olmayan bir `Lawyer`'a işaret ediyor (composite FK, §6.2). */
export class OfficeWorkPoolUnknownMemberError extends OfficeWorkPoolMutationError {
  constructor(message: string) {
    super(message);
  }
}

// ═══════════════════════════════════════════════════════════════════════════════════════
// LEGACY PROJEKSİYON EŞLEMESİ
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Havuz → legacy `Office` kolonu (§2.1). `satisfies Record<OfficeWorkPoolKind, …>` eksiksizlik
 * kilidi: yeni havuz eklenip projeksiyon hedefi verilmezse typecheck kırılır, dual-write
 * sessizce eksik kalmaz.
 */
export const OFFICE_WORK_POOL_LEGACY_COLUMN = {
  OP_STAFF_TYPE: 'opStaffTypes',
  ESCALATION_MANAGER: 'escalationManagerLawyerIds',
  ESCALATION_FOUNDER: 'escalationFounderLawyerIds',
} as const satisfies Record<OfficeWorkPoolKind, string>;

/** Legacy havuz kolonlarının kümesi — passthrough guard'ı bunu kullanır. */
export const OFFICE_WORK_POOL_LEGACY_COLUMNS: readonly string[] = Object.values(
  OFFICE_WORK_POOL_LEGACY_COLUMN,
);

// ═══════════════════════════════════════════════════════════════════════════════════════
// RETRY SINIFLANDIRMASI (§9.4a madde 4, §11.5.8 T5)
// ═══════════════════════════════════════════════════════════════════════════════════════

/**
 * Denemenin ÜST SINIRI. Repo emsali: `REQUEST_TRANSACTION_MAX_ATTEMPTS = 3`
 * (`password-reset.service.ts:18`). Yeni bir sayı İCAT EDİLMEDİ.
 */
export const OFFICE_WORK_POOL_MUTATION_MAX_ATTEMPTS = 3;

/**
 * Hata sınıfı.
 *
 * - `SERIALIZATION` : gerçek eşzamanlılık çakışması. Yeni transaction'da kilit yeniden alınır,
 *   durum TAZE okunur ve fark yeniden hesaplanır.
 * - `INDETERMINATE` : commit sonucu BİLİNMİYOR (bağlantı koptu / transaction API hatası).
 *   Kör yeniden uygulama YAPILMAZ: bir sonraki deneme kilit altında iki yüzeyi de (legacy +
 *   membership) hedefle karşılaştırır; ikisi de eşitse fark BOŞ çıkar ve hiçbir satır yazılmaz
 *   — yani "oku-doğrula, farklıysa uygula" (§9.4a/5, handoff §6.1) normal yolun kendisidir.
 * - `FATAL`         : veri/politika/programlama hatası. Retry ile DÜZELMEZ, asla denenmez.
 */
export type OfficeWorkPoolMutationErrorClass = 'SERIALIZATION' | 'INDETERMINATE' | 'FATAL';

/**
 * Retry'lenebilir SERIALIZATION kodları — repo-native ve dar.
 *
 * `55P03` (lock_not_available) BİLEREK YOKTUR: bu primitive düz, BEKLEYEN `FOR UPDATE`
 * kullanır (§11.5.4 SEÇİLDİ); `NOWAIT` veya `lock_timeout` uygulanmadığı için bu kod bu yoldan
 * ÜRETİLEMEZ. Üretilemeyen bir kodu allowlist'e koymak, ileride NOWAIT'e geçilirse sessizce
 * yanlış davranış (kullanıcıya 423 yerine sessiz retry) üretirdi.
 */
const SERIALIZATION_CODES: readonly string[] = [
  'P2034', // Prisma: transaction failed due to a write conflict or a deadlock
  '40001', // PostgreSQL: serialization_failure
  '40P01', // PostgreSQL: deadlock_detected
];

/**
 * Sonucu belirsiz bırakan kodlar. Bunlar "yazıldı mı" sorusunu cevapsız bırakır; retry'in
 * güvenliği target-state semantiğinden (§9.4a/3) ve kilit-sonrası TAZE okumadan gelir.
 */
const INDETERMINATE_CODES: readonly string[] = [
  'P1017', // Prisma: server has closed the connection
  'P2028', // Prisma: transaction API error (timeout / kapanmış transaction)
  '08000', // PostgreSQL: connection_exception
  '08003', // PostgreSQL: connection_does_not_exist
  '08006', // PostgreSQL: connection_failure
  '08007', // PostgreSQL: transaction_resolution_unknown
];

/**
 * ASLA retry edilmeyen kodlar. Açıkça listelenmeleri dokümantasyon değil DAVRANIŞ kilidi
 * değildir — `classifyOfficeWorkPoolMutationError` zaten allowlist mantığıyla çalışır
 * (tanınmayan her şey `FATAL`). Liste testin okunurluğu ve niyetin kaydı içindir.
 */
export const OFFICE_WORK_POOL_NEVER_RETRIED_CODES: readonly string[] = [
  '23503', // foreign_key_violation
  '23505', // unique_violation (partial unique index backstop, §11.5.5)
  '23514', // check_violation
  'P2002', // Prisma unique constraint
  'P2003', // Prisma foreign key constraint
];

interface CodedError {
  code?: unknown;
  meta?: { code?: unknown };
  message?: unknown;
}

/** Prisma/PostgreSQL hata kodunu çıkarır (emsal: `bundle-seal.errors.ts` extractSqlState). */
export function extractOfficeWorkPoolErrorCode(error: unknown): string | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const coded = error as CodedError;
  if (typeof coded.code === 'string') return coded.code;
  if (typeof coded.meta?.code === 'string') return coded.meta.code;
  return undefined;
}

/**
 * Hata sınıflandırması — ALLOWLIST mantığı (fail-closed).
 *
 * Domain hataları (`OfficeWorkPoolMutationError`) ve tanınmayan her şey `FATAL`'dir: bir
 * doğrulama/anchor/aktör hatasını retry etmek yalnız aynı hatayı üç kez üretir ve gerçek
 * nedeni gizler (§9.4a/4 "ilgisiz bir hata ASLA retry tetiklemez").
 */
export function classifyOfficeWorkPoolMutationError(
  error: unknown,
): OfficeWorkPoolMutationErrorClass {
  if (error instanceof OfficeWorkPoolMutationError) return 'FATAL';
  const code = extractOfficeWorkPoolErrorCode(error);
  if (code === undefined) return 'FATAL';
  if (SERIALIZATION_CODES.includes(code)) return 'SERIALIZATION';
  if (INDETERMINATE_CODES.includes(code)) return 'INDETERMINATE';
  return 'FATAL';
}

/** Retry'e uygunluk — `FATAL` dışındaki iki sınıf bounded döngüye girer. */
export function isRetryableOfficeWorkPoolMutationError(error: unknown): boolean {
  return classifyOfficeWorkPoolMutationError(error) !== 'FATAL';
}

/**
 * C15-S1-MODIFIED · PR-1 — Tenant yaşam döngüsü tip güvenliği ve ortak yüklem temeli.
 *
 * KAPSAM SINIRI (önemli): bu dosya YALNIZ tip/geçiş tanımlarını ve okunabilir yüklem
 * sabitlerini içerir. Hiçbir çağrı yerine bağlanmaz; `login()`, `validateUser()`,
 * tenant resolver, mutating guard ve background worker yaptırımı **PR-2**'dedir,
 * dispatch claim/lease **PR-3**, quiesce akışı ve principal deactivation **PR-4**'tedir.
 * Bu PR mevcut tenant'ların davranışını DEĞİŞTİRMEZ.
 *
 * Tasarım kaydı: `C15-CANARY-SAFETY-REMEDIATION-DESIGN-R01.md` (§3) ve
 * `...-R01A.md` (§3.1, §4). Prisma `enum TenantLifecycle` ile birebir aynı küme.
 */

/** Prisma `enum TenantLifecycle` ile BİREBİR aynı sıra ve içerik. */
export const TENANT_LIFECYCLE_STATES = [
  "PROVISIONING",
  "ACTIVE",
  "QUIESCING",
  "SUSPENDED",
  "RETIRED",
] as const;

export type TenantLifecycleState = (typeof TENANT_LIFECYCLE_STATES)[number];

/** Worker seçimi ve login'in tek kabul ettiği durum. */
export const ACTIVE_TENANT_LIFECYCLE: TenantLifecycleState = "ACTIVE";

/** QUIESCING'in yazılabilir hedefleri (`Tenant.lifecycleTarget`). */
export const QUIESCE_TARGET_STATES = ["SUSPENDED", "RETIRED"] as const;

export type QuiesceTargetState = (typeof QUIESCE_TARGET_STATES)[number];

/**
 * İzinli geçişler. Listelenmeyen her geçiş REDDEDİLİR (fail-closed).
 *
 * Aynı duruma geçiş (X → X) BİLEREK izinli DEĞİLDİR: "zaten hedefteyim" idempotency'si
 * bir GEÇİŞ değildir ve servis katmanında koşullu `updateMany` + mevcut durumun yeniden
 * okunmasıyla ayırt edilir (R01A §3.3 F7). Burada izin verilseydi, gerçek bir durum
 * hatası sessizce başarı gibi görünürdü.
 */
const ALLOWED_TRANSITIONS: Readonly<Record<TenantLifecycleState, readonly TenantLifecycleState[]>> = {
  // Provisioning ya normal onboarding'in sonunda ACTIVE'e bağlanır ya da
  // (canary terkedilirse) doğrudan quiesce edilir.
  PROVISIONING: ["ACTIVE", "QUIESCING"],
  ACTIVE: ["QUIESCING"],
  // Quiesce faz-2 hedefe bağlar; owner açık kararıyla geri alınabilir.
  QUIESCING: ["SUSPENDED", "RETIRED", "ACTIVE"],
  // Askıdan dönüş ya da emekliliğe ilerleme — ikisi de quiesce üzerinden.
  SUSPENDED: ["ACTIVE", "QUIESCING"],
  // Mantıksal emeklilik terminaldir. Geri dönüş AYRI bir owner kararıdır ve
  // bu tabloya eklenmeden yapılamaz.
  RETIRED: [],
};

/** Girdi gerçekten bilinen bir lifecycle değeri mi (fail-closed tip koruyucu). */
export function isTenantLifecycleState(value: unknown): value is TenantLifecycleState {
  return typeof value === "string" && (TENANT_LIFECYCLE_STATES as readonly string[]).includes(value);
}

/** Geçerli bir quiesce hedefi mi. */
export function isQuiesceTargetState(value: unknown): value is QuiesceTargetState {
  return typeof value === "string" && (QUIESCE_TARGET_STATES as readonly string[]).includes(value);
}

/** Bu durumdan başka bir duruma geçilemez mi. */
export function isTerminalLifecycleState(state: TenantLifecycleState): boolean {
  return ALLOWED_TRANSITIONS[state].length === 0;
}

/** Geçiş sürerken bulunulan ara durum mu (yeni iş kabul edilmez, in-flight boşalır). */
export function isTransitionalLifecycleState(state: TenantLifecycleState): boolean {
  return state === "QUIESCING";
}

/**
 * `lifecycleTarget` YALNIZ QUIESCING'de dolu olmalıdır; diğer durumlarda NULL.
 * Bu, "hedefi olmayan quiesce" ve "quiesce dışı sızmış hedef" hatalarını yakalar.
 */
export function requiresLifecycleTarget(state: TenantLifecycleState): boolean {
  return state === "QUIESCING";
}

/**
 * `lifecycle` + `lifecycleTarget` ikilisinin tutarlılığı. Fail-closed: bilinmeyen
 * girdi, eksik hedef veya fazladan hedef ⇒ false.
 */
export function isLifecycleTargetConsistent(
  state: unknown,
  target: unknown,
): boolean {
  if (!isTenantLifecycleState(state)) return false;
  if (requiresLifecycleTarget(state)) {
    return isQuiesceTargetState(target);
  }
  return target === null || target === undefined;
}

/** Geçiş izinli mi. Bilinmeyen girdi ⇒ false (fail-closed). */
export function canTransitionLifecycle(from: unknown, to: unknown): boolean {
  if (!isTenantLifecycleState(from) || !isTenantLifecycleState(to)) return false;
  return ALLOWED_TRANSITIONS[from].includes(to);
}

/** Bir durumdan izinli hedeflerin kopyası (çağıran mutasyon yapamaz). */
export function allowedTransitionsFrom(state: TenantLifecycleState): TenantLifecycleState[] {
  return [...ALLOWED_TRANSITIONS[state]];
}

/**
 * Background worker bu tenant'ı seçebilir mi. PR-2'de query-level yükleme dönüşecek;
 * burada tek source-of-truth olarak tanımlanır ki iki yerde ayrışmasın.
 */
export function isWorkerSelectableLifecycle(state: unknown): boolean {
  return isTenantLifecycleState(state) && state === ACTIVE_TENANT_LIFECYCLE;
}

/** Bu tenant'ın principal'ları login olabilir / JWT taşıyabilir mi. */
export function isLoginableLifecycle(state: unknown): boolean {
  return isTenantLifecycleState(state) && state === ACTIVE_TENANT_LIFECYCLE;
}

/**
 * PR-2'de Prisma `where` yükleminde kullanılacak ortak sabit. Şimdilik hiçbir sorguya
 * bağlı DEĞİLDİR; buraya konmasının sebebi, üç worker'ın ayrı ayrı string yazıp
 * ayrışmasını önlemektir.
 */
export const ACTIVE_TENANT_WHERE = Object.freeze({
  lifecycle: ACTIVE_TENANT_LIFECYCLE,
});

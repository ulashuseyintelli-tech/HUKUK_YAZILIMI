/**
 * OFFICE-P2-CAP02-TELEMETRY-CANARY-SCOPE-I01 — SAF ÇEKİRDEK.
 *
 * `OFFICE-P2-CAP02-CONTROLLED-NEUTRAL-TELEMETRY-ACTIVATION-I01` H0 taraması şunu
 * ölçtü: ReportingLine telemetri katmanının TEK aktivasyon mekanizması global bir
 * boolean-benzeri flag'ti (`OFFICE_CAP02_REPORTINGLINE_SHADOW === 'observe'`).
 * Tenant/actor cohort daraltması YOKTU — flag açılsaydı TÜM gerçek üretim trafiği
 * (TELLİ HUKUK dahil) gözlem kapsamına girerdi. Bu, "controlled canary" DEĞİLDİR.
 *
 * Bu dosya üç ayrı sinyali TEK bir aktivasyon kararına indirger:
 *   master flag        (mevcut sözleşme korunur: yalnız 'observe' ACAR)
 *   tenant allowlist    (virgülle ayrılmış TAM tenantId listesi; ZORUNLU)
 *   actor allowlist     (virgülle ayrılmış TAM userId listesi; OPSİYONEL)
 *
 * MİMARİ İLKE — bu dosya Prisma/NestJS import ETMEZ, DB/ConfigService'e erişemez,
 * sistem saati/fs/rastgelelik KULLANMAZ. Yalnız RAW string girdilerden (çağıran
 * `ConfigService.get()` sonucunu OLDUĞU GİBİ geçirir) bir aktivasyon kararı üretir.
 *
 * GÜVENLİK SÖZLEŞMESİ
 *  1. Tenant allowlist BOŞSA telemetri KAPALI — master flag açık olsa bile.
 *     ("empty allowlist = tüm tenant'lar" YORUMU YASAK.)
 *  2. Eşleşme TAM KİMLİK'tir (tenantId/userId). Substring/prefix/slug eşleşmesi YOK.
 *  3. Bir liste elemanı ID şekline UYMUYORSA (cuid deseni) TÜM liste MALFORMED
 *     sayılır → fail-closed (telemetri kapalı). Kısmi güven YOK.
 *  4. Actor allowlist boşsa yalnız tenant eşleşmesi yeterlidir (actor kısıtı YOK).
 *     Actor allowlist doluysa userId de TAM eşleşmelidir.
 *  5. Bu karar authorization/ReportingLine kararı DEĞİLDİR; yalnız "bu istek için
 *     telemetri ölçülsün mü" sorusuna cevap verir. accessAffected'i ETKİLEMEZ.
 */

/** Bu repodaki cuid() kimliklerinin gözlemlenen şekli: 'c' + 20-30 alfasayısal. */
const ID_PATTERN = /^c[a-z0-9]{20,30}$/;

export type TelemetryActivationReason =
  | 'MASTER_DISABLED'
  | 'TENANT_ALLOWLIST_EMPTY'
  | 'TENANT_ALLOWLIST_MALFORMED'
  | 'TENANT_NOT_ALLOWLISTED'
  | 'ACTOR_ALLOWLIST_MALFORMED'
  | 'ACTOR_NOT_ALLOWLISTED';

export type TelemetryActivationDecision =
  | { active: true }
  | { active: false; reason: TelemetryActivationReason };

export interface TelemetryActivationInput {
  /** `ConfigService.get('OFFICE_CAP02_REPORTINGLINE_SHADOW')` ham değeri. */
  masterFlagRaw: string | undefined;
  /** `ConfigService.get('OFFICE_CAP02_REPORTINGLINE_SHADOW_TENANT_ALLOWLIST')` ham değeri. */
  tenantAllowlistRaw: string | undefined;
  /** `ConfigService.get('OFFICE_CAP02_REPORTINGLINE_SHADOW_ACTOR_ALLOWLIST')` ham değeri. */
  actorAllowlistRaw: string | undefined;
  tenantId: string;
  actorUserId: string;
}

type ParsedAllowlist = { ok: true; ids: string[] } | { ok: false };

/**
 * Virgülle ayrılmış kimlik listesini ayrıştırır. Boş elemanlar (fazladan virgül/
 * boşluk) sessizce atılır — bu MALFORMED sayılmaz. Ama kalan herhangi bir eleman
 * cuid şekline uymuyorsa (ör. slug, yanlışlıkla yapıştırılmış e-posta, boşluklu
 * ad) TÜM liste MALFORMED'dir: kısmi güven YOK.
 */
function parseIdAllowlist(raw: string | undefined): ParsedAllowlist {
  const trimmedRaw = (raw ?? '').trim();
  if (trimmedRaw === '') return { ok: true, ids: [] };
  const ids = trimmedRaw
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s.length > 0);
  if (ids.some((id) => !ID_PATTERN.test(id))) return { ok: false };
  return { ok: true, ids };
}

function isMasterEnabled(raw: string | undefined): boolean {
  // Mevcut sözleşme KORUNUR (PR #1796/#1804): yalnız 'observe' açar. Bilinmeyen
  // her değer (unset/'off'/'on'/'true'/gibberish) fail-safe dormant sayılır.
  return String(raw ?? '').trim().toLowerCase() === 'observe';
}

/**
 * Aktivasyon kararı. FAIL-CLOSED: şüphe halinde ASLA aktive etmez.
 * KARAR DÖNDÜRMEZ (authorization anlamında) — yalnız "ölçülsün mü" sorusuna cevap.
 */
export function decideTelemetryActivation(
  input: TelemetryActivationInput,
): TelemetryActivationDecision {
  if (!isMasterEnabled(input.masterFlagRaw)) {
    return { active: false, reason: 'MASTER_DISABLED' };
  }

  const tenantAllowlist = parseIdAllowlist(input.tenantAllowlistRaw);
  if (!tenantAllowlist.ok) {
    return { active: false, reason: 'TENANT_ALLOWLIST_MALFORMED' };
  }
  if (tenantAllowlist.ids.length === 0) {
    // Boş allowlist ASLA "tüm tenant'lar" anlamına gelmez.
    return { active: false, reason: 'TENANT_ALLOWLIST_EMPTY' };
  }
  if (!tenantAllowlist.ids.includes(input.tenantId)) {
    return { active: false, reason: 'TENANT_NOT_ALLOWLISTED' };
  }

  const actorAllowlist = parseIdAllowlist(input.actorAllowlistRaw);
  if (!actorAllowlist.ok) {
    return { active: false, reason: 'ACTOR_ALLOWLIST_MALFORMED' };
  }
  if (actorAllowlist.ids.length > 0 && !actorAllowlist.ids.includes(input.actorUserId)) {
    return { active: false, reason: 'ACTOR_NOT_ALLOWLISTED' };
  }

  return { active: true };
}

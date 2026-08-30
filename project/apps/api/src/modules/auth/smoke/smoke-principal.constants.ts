/**
 * C36 — SMOKE PRINCIPAL sabitleri (TEK KAYNAK).
 *
 * Bu dosyadaki değerler sözleşmedir; testler bunları differential olarak sabitler.
 * Hiçbiri secret DEĞİLDİR — secret yalnız `JWT_SMOKE_SECRET` env değişkeninde ve
 * owner-controlled broker dosyasında bulunur, bu dosyada veya log'da ASLA görünmez.
 */

/** Smoke token'ının amaç claim'i. Normal login token'ında bu claim HİÇ BULUNMAZ. */
export const SMOKE_AUTH_PURPOSE = "SMOKE" as const;

/** Smoke token audience'ı. Normal token'dan ayrışır; R13 bu claim'i hiç bilmez. */
export const SMOKE_TOKEN_AUDIENCE = "hukuk-smoke" as const;

/** Smoke token issuer'ı — sürüm etiketi taşır, böylece eski/yeni ayrımı açıktır. */
export const SMOKE_TOKEN_ISSUER = "hukuk-api-smoke-v1" as const;

/**
 * Smoke token azami ömrü (saniye). Owner hükmü: en fazla 10 dakika.
 *
 * NEDEN KISA: crash sonrası (token üretildi, `/auth/me` yapılmadı) senaryosunda
 * token'ın kendiliğinden kapanması gerekir; güvenlik revoke'un çalışmasına bağlanamaz.
 */
export const SMOKE_TOKEN_TTL_SECONDS = 600;

/** Smoke principal azami ömrü (saniye) — provisioning sırasında `expiresAt` bundan türer. */
export const SMOKE_PRINCIPAL_MAX_LIFETIME_SECONDS = 24 * 60 * 60;

/** Env değişkeni adları. Değerleri OKUNMAZ/LOGLANMAZ; yalnız varlık/eşitlik kontrolü yapılır. */
export const SMOKE_SECRET_ENV = "JWT_SMOKE_SECRET" as const;
export const SMOKE_PROVISION_PUBLIC_KEY_ENV = "SMOKE_PROVISION_PUBLIC_KEY" as const;

/**
 * Deny mesajı SABİTTİR. Route adı, principal kimliği, allowlist içeriği veya
 * herhangi bir iç durum istemciye SIZDIRILMAZ.
 */
export const SMOKE_DENIED_MESSAGE = "Bu işlem bu kimlik için gerçekleştirilemez";

/** Smoke auth başarısızlıklarında SABİT generic mesaj (enumeration-safe). */
export const SMOKE_AUTH_FAILED_MESSAGE = "Geçersiz smoke kimlik bilgisi";

/**
 * `request` üzerine yazılan doğrulanmış smoke claim alanı.
 *
 * Global guard bunu SET EDER; allowlisted handler'ların guard'ı bunu OKUR. Böylece
 * token iki kez parse edilmez ve smoke yolu, controller-level guard SIRASINA
 * bağımlı olmaz.
 */
export const SMOKE_CLAIMS_REQUEST_KEY = "smokeClaims" as const;

/** Doğrulanmış smoke token claim'leri. */
export interface SmokeTokenClaims {
  /** SmokePrincipal.userId */
  readonly sub: string;
  /** SmokePrincipal.id */
  readonly spid: string;
  /** SmokePrincipal.authGeneration — her istekte DB ile yeniden karşılaştırılır. */
  readonly gen: number;
  readonly authPurpose: typeof SMOKE_AUTH_PURPOSE;
  readonly aud: typeof SMOKE_TOKEN_AUDIENCE;
  readonly iss: typeof SMOKE_TOKEN_ISSUER;
}

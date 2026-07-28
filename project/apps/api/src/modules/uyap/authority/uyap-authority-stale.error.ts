/**
 * UYAP-AUTHORITY-FRESHNESS-TX-I01 — TX-1 tazelik ihlali.
 *
 * TX-1 içinde fırlatılır ve transaction'ı TAMAMEN geri alır: `UyapOperation`,
 * `UyapAttempt` ve `UyapAttemptCpeDecisionLink` için **0 yeni satır**, orphan 0.
 *
 * Dış yanıt GENERIC kalır (`UyapService` bunu tek bir kullanıcı mesajına çevirir);
 * `failureCode`/`changedSources` yalnız internal evidence ve telemetri içindir —
 * yetki ilişkilerinin enumeration'ını önlemek için dışarı SIZDIRILMAZ.
 */
import {
  UyapAuthorityChangedSource,
  UyapAuthorityFreshnessFailureCode,
} from './uyap-authority-snapshot.types';

export class UyapAuthorityStaleError extends Error {
  readonly failureCode: UyapAuthorityFreshnessFailureCode;
  readonly changedSources: readonly UyapAuthorityChangedSource[];
  /** I01/I03 red kodu — yalnız `AUTHORITY_REVALIDATION_FAILED` halinde dolu. */
  readonly revalidationFailureCode?: string;

  constructor(input: {
    failureCode: UyapAuthorityFreshnessFailureCode;
    changedSources: readonly UyapAuthorityChangedSource[];
    revalidationFailureCode?: string;
  }) {
    // Mesaj PII veya ilişki adı TAŞIMAZ.
    super(`uyap_authority_stale:${input.failureCode}`);
    this.name = 'UyapAuthorityStaleError';
    this.failureCode = input.failureCode;
    this.changedSources = input.changedSources;
    this.revalidationFailureCode = input.revalidationFailureCode;
  }
}

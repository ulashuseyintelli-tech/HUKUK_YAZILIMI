/**
 * UYAP-ACTING-LAWYER-RESOLVER-I01 — canonical acting-lawyer çözümleme kontratları.
 *
 * Owner kararı (DECISION-1, RATIFIED): MODEL B — ACTING-LAWYER MATCHED POA.
 * `UYAP-CONST-002` normative_rule: `actorUserId` authenticated principal'dan gelir;
 * **`actingLawyerId` server-side ilişki üzerinden çözülür; client-controlled `lawyerId`
 * execution authority DEĞİLDİR.**
 *
 * Bu dosya YALNIZ tip/kontrat taşır; sorgu ve fail-closed davranış
 * `acting-lawyer-resolver.service.ts` içindedir.
 */

/** Fail-closed çözümleme hata kodları (dış mesaj generic kalır; kod internal/evidence içindir). */
export type ActingLawyerFailureCode =
  /** Kullanıcıya bağlı aktif canonical Lawyer bulunamadı (kayıt yok VEYA isActive=false). */
  | "ACTING_LAWYER_NOT_RESOLVED"
  /** Aynı user için birden fazla Lawyer kaydı — `Lawyer.userId @unique` ihlali; fail-closed guard. */
  | "ACTING_LAWYER_AMBIGUOUS"
  /** Lawyer kaydı başka tenant'a ait — cross-tenant authority reddedilir. */
  | "LAWYER_TENANT_MISMATCH";

/**
 * Resolver girdisi. Her iki alan da **server-authoritative** olmalıdır
 * (JWT/`req.user`); request body, query veya custom header'dan ASLA doldurulmaz.
 */
export interface ActingLawyerContext {
  readonly userId: string;
  readonly tenantId: string;
}

/** Canonical çözümlenmiş acting lawyer. */
export interface ResolvedActingLawyer {
  readonly lawyerId: string;
  readonly userId: string;
  readonly tenantId: string;
}

/** Discriminated result — exception fırlatmadan fact/policy değerlendirmesi yapılabilsin diye. */
export type ActingLawyerResolution =
  | { readonly resolved: true; readonly actingLawyer: ResolvedActingLawyer }
  | { readonly resolved: false; readonly failureCode: ActingLawyerFailureCode };

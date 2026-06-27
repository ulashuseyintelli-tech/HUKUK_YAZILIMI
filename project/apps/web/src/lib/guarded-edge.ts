// P3-2B: Guarded-Edge Outcome Envelope — FRONTEND tüketici (tipler + detektörler + saf orchestration).
//
// Backend kontratı (P3-1b #535): api/src/modules/permission-diagnostics/guided-edge/guarded-edge-outcome.envelope.ts
// ile BİREBİR. Backend guarded-edge route'ları enforce'a geçtiğinde HTTP **200** ile bu zarfı dönecek
// (örn. outcome=CONFIRM_REQUIRED). Bu bir HATA DEĞİL — ara-durumdur (confirmation required intermediate state).
//
// Bu katman ENFORCEMENT AÇMAZ ve backend'e DOKUNMAZ. Yalnız: (a) zarfı generic tanır, (b) confirm payload çıkarır,
// (c) saf orchestration (runGuarded) ile "tespit → onay sor → retry" akışını sağlar. Backend henüz zarf
// dönmediği için CANLI DAVRANIŞ DEĞİŞMEZ (normal {success,data,message} yanıtları envelope sanılmaz → inert).

/** GuidedOpenDecision (AXIS-P) değerleri — backend effective-permission.types.ts ile aynı küme. */
export type GuidedOpenOutcome =
  | "ALLOW"
  | "CONFIRM_REQUIRED"
  | "ROUTE_REQUIRED"
  | "APPROVAL_REQUIRED"
  | "HARDWARE_REQUIRED"
  | "DENY_TENANT_BOUNDARY";

export interface GuardedEdgeTarget {
  resourceType: string;
  caseId?: string;
  resourceId?: string;
}

/** Onay bloğu — ham request body İÇERMEZ (backend yalnız token/expiry/hash döner). */
export interface GuardedEdgeConfirmation {
  token: string;
  expiresAt: string;
  bindingHash: string;
}

export interface GuardedEdgeOutcomeEnvelope {
  axis: "GUIDED_OPEN_PERMISSION";
  outcome: GuidedOpenOutcome;
  actionCode: string;
  target: GuardedEdgeTarget;
  decisionSource?: string;
  reasonCode?: string;
  message?: string;
  traceId?: string;
  decisionId?: string;
  auditRef?: string;
  confirmation?: GuardedEdgeConfirmation;
}

const OUTCOMES: ReadonlySet<string> = new Set<string>([
  "ALLOW",
  "CONFIRM_REQUIRED",
  "ROUTE_REQUIRED",
  "APPROVAL_REQUIRED",
  "HARDWARE_REQUIRED",
  "DENY_TENANT_BOUNDARY",
]);

/**
 * Generic detektör: yanıt bir Guarded-Edge zarfı mı? Ayırt edici = axis==='GUIDED_OPEN_PERMISSION'.
 * Normal {success,data,message} yanıtlarında axis YOKtur → false (yanlış pozitif olmaz).
 */
export function isGuardedEdgeOutcomeEnvelope(x: unknown): x is GuardedEdgeOutcomeEnvelope {
  if (!x || typeof x !== "object") return false;
  const o = x as Record<string, unknown>;
  if (o.axis !== "GUIDED_OPEN_PERMISSION") return false;
  if (typeof o.outcome !== "string" || !OUTCOMES.has(o.outcome)) return false;
  if (typeof o.actionCode !== "string") return false;
  const t = o.target as Record<string, unknown> | undefined;
  return !!t && typeof t === "object" && typeof t.resourceType === "string";
}

export function isConfirmRequiredEnvelope(
  x: unknown,
): x is GuardedEdgeOutcomeEnvelope & { outcome: "CONFIRM_REQUIRED" } {
  return isGuardedEdgeOutcomeEnvelope(x) && x.outcome === "CONFIRM_REQUIRED";
}

/** Zarftan confirmation bloğunu çıkarır (yoksa null). */
export function extractConfirmation(env: GuardedEdgeOutcomeEnvelope): GuardedEdgeConfirmation | null {
  return env.confirmation ?? null;
}

export type GuardedRunResult<T> = { status: "ok"; data: T } | { status: "cancelled" };

/**
 * Saf orchestration (React'tan bağımsız → kolay test edilir):
 *  1) requestFn() çalıştır.
 *  2) Yanıt CONFIRM_REQUIRED zarfı DEĞİLse → { ok, data } (normal akış; davranış değişmez).
 *  3) CONFIRM_REQUIRED ise → askConfirm(env) ile kullanıcıya sor.
 *     - vazgeç → { cancelled } (retry YOK).
 *     - onayla → requestFn(confirmation) ile TEK retry → { ok, data }.
 *
 * NOT: confirmation requestFn'e GEÇİRİLİR ama backend consume binding'i (token'ı hangi header/body alanına
 * koyacağı) P3-2C'de bağlanır; bu fazda requestFn confirmation'ı yok sayabilir (backend henüz consume etmiyor).
 */
export async function runGuarded<T>(
  requestFn: (confirmation?: GuardedEdgeConfirmation) => Promise<T>,
  askConfirm: (env: GuardedEdgeOutcomeEnvelope) => Promise<boolean>,
): Promise<GuardedRunResult<T>> {
  const first = await requestFn();
  if (!isConfirmRequiredEnvelope(first)) {
    return { status: "ok", data: first };
  }
  const approved = await askConfirm(first);
  if (!approved) {
    return { status: "cancelled" };
  }
  const retried = await requestFn(extractConfirmation(first) ?? undefined);
  return { status: "ok", data: retried };
}

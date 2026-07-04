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

/** P4-3B — APPROVAL_REQUIRED onay-talebi referansı (backend GuardedEdgeApproval ile birebir; ham savedIntent İÇERMEZ). */
export interface GuardedEdgeApproval {
  requestId: string;
  status: string; // 'PENDING_APPROVAL'
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
  approval?: GuardedEdgeApproval; // P4-3B — yalnız APPROVAL_REQUIRED'da
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

/**
 * P4-3B — APPROVAL_REQUIRED zarfı mı? CONFIRM_REQUIRED'dan farklı: TERMİNALDİR (token yok, retry yok); işlem onay-talebine
 * yönlendi, statü DEĞİŞMEDİ. runGuarded bunu 'approval_pending' olarak döndürür → çağıran asla başarı SANMAZ.
 */
export function isApprovalRequiredEnvelope(
  x: unknown,
): x is GuardedEdgeOutcomeEnvelope & { outcome: "APPROVAL_REQUIRED" } {
  return isGuardedEdgeOutcomeEnvelope(x) && x.outcome === "APPROVAL_REQUIRED";
}

/** Zarftan confirmation bloğunu çıkarır (yoksa null). */
export function extractConfirmation(env: GuardedEdgeOutcomeEnvelope): GuardedEdgeConfirmation | null {
  return env.confirmation ?? null;
}

export type GuardedRunResult<T> =
  | { status: "ok"; data: T }
  | { status: "cancelled" }
  // P4-3B — TERMİNAL: işlem APPROVAL_REQUIRED'a yönlendi (onay-talebi oluştu, statü DEĞİŞMEDİ). Retry YOK; çağıran başarı SANMAZ.
  | { status: "approval_pending"; envelope: GuardedEdgeOutcomeEnvelope };

/**
 * Saf orchestration (React'tan bağımsız → kolay test edilir):
 *  1) requestFn() çalıştır.
 *  2) Yanıt APPROVAL_REQUIRED zarfı ise → { approval_pending, envelope } (TERMİNAL; retry YOK; statü DEĞİŞMEDİ — P4-3B).
 *  3) CONFIRM_REQUIRED zarfı DEĞİLse → { ok, data } (normal akış; davranış değişmez).
 *  4) CONFIRM_REQUIRED ise → askConfirm(env) → vazgeç={cancelled} / onayla=TEK retry → { ok, data }.
 *
 * ⚠️ APPROVAL_REQUIRED kontrolü CONFIRM'den ÖNCE ve ok'tan ÖNCE yapılır → APPROVAL_REQUIRED yanlışlıkla 'ok' (false-success)
 *    olarak dönmez (aksi halde çağıran statü değişti sanıp refresh ederdi).
 */
export async function runGuarded<T>(
  requestFn: (confirmation?: GuardedEdgeConfirmation) => Promise<T>,
  askConfirm: (env: GuardedEdgeOutcomeEnvelope) => Promise<boolean>,
): Promise<GuardedRunResult<T>> {
  const first = await requestFn();
  if (isApprovalRequiredEnvelope(first)) {
    return { status: "approval_pending", envelope: first }; // terminal; askConfirm YOK, retry YOK
  }
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

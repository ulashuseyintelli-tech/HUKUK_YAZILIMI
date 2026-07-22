/**
 * CAP-09A Audit Attribution Foundation — typed constants.
 * Kaynak: decision-log.md OFFICE PHASE 2 / W-P2-α CAP-09 OWNER GO-DECIDE (madde 3,
 * minimum attribution contract). Değerler owner kararının birebir kopyasıdır;
 * burada icat edilmemiştir.
 */

export const AUDIT_ACTOR_TYPES = ['USER', 'SYSTEM', 'AUTOMATION', 'EXTERNAL'] as const;
export type AuditActorType = (typeof AUDIT_ACTOR_TYPES)[number];

export const AUDIT_DECISION_RESULTS = ['ALLOW', 'DENY', 'SUCCESS', 'FAILURE'] as const;
export type AuditDecisionResult = (typeof AUDIT_DECISION_RESULTS)[number];

import { UyapAttemptCpeDecisionLink } from '@prisma/client';

/**
 * UYAP-CPE-DECISION-LINK-WRITER-P05C-P03 — dormant link writer command/result tipleri.
 *
 * Karar C (P05C-RUNTIME-LINKAGE-R0, RATIFIED): link writer'in girdileri YALNIZ tenant-safe
 * referential kimliklerdir; actor/lawyer/signer input ALMAZ. "Kim" bilgisi zaten
 * UyapOperation.actorUserId'de implicit'tir. Bu servis M5 semasindaki composite FK + unique
 * kisitlarini AUTHORITATIVE kabul eder; kendi basina schema/migration EKLEMEZ.
 *
 * DORMANT: module/controller kaydi YOK, orchestration wiring YOK (ayri owner GO).
 */

/**
 * Bir UyapAttempt'i bir CpeDecisionLog kaydina baglar. Alanlarin TAMAMI referential kimliktir:
 *   - operationId/attemptId : P-E5B operation writer ciktisi
 *   - cpeDecisionLogId      : CPE decision.decisionId (CpeDecisionLog.id)
 *   - tenantId/caseId       : trusted execution context; composite FK ile DB'de dogrulanir
 */
export interface LinkCpeDecisionCommand {
  tenantId: string;
  caseId: string;
  operationId: string;
  attemptId: string;
  cpeDecisionLogId: string;
}

export type LinkCpeDecisionReason = 'CREATED' | 'IDEMPOTENT_REPLAY';

export interface LinkCpeDecisionResult {
  link: UyapAttemptCpeDecisionLink;
  /** true → yeni satir yazildi; false → mevcut exact-eslesen kayit dondu (idempotent replay). */
  created: boolean;
  reason: LinkCpeDecisionReason;
}

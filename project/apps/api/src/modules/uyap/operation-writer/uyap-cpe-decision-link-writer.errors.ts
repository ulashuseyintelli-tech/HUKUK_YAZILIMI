/**
 * UYAP-CPE-DECISION-LINK-WRITER-P05C-P03 — typed application error'lari.
 * `uyap-operation-writer.errors.ts` emsali: duz `Error` alt sinifi, HTTP semantigine BAGLANMAZ
 * (P05C-P03'te public controller yoktur).
 */

export class UyapCpeDecisionLinkValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'UyapCpeDecisionLinkValidationError';
  }
}

/**
 * Ayni cpeDecisionLogId, FARKLI bir tenant/case/operation/attempt iliskisine baglanmak istendi.
 * UYAP-CONST-002 "PRIOR ATTEMPT AUTHORITY != CURRENT ATTEMPT AUTHORITY" — bir karar en fazla bir
 * attempt'e baglanir. Fail-closed; otomatik duzeltme/fallback YOK.
 */
export class UyapCpeDecisionLinkConflictError extends Error {
  constructor(message = 'cpeDecisionLogId zaten farkli bir tenant/case/operation/attempt iliskisine bagli') {
    super(message);
    this.name = 'UyapCpeDecisionLinkConflictError';
  }
}

/**
 * Composite FK / tenant / case butunlugu ihlali (yanlis case/tenant/operation/attempt kombinasyonu).
 * DB reddini typed hale getirir; otomatik duzeltme/fallback YOK.
 */
export class UyapCpeDecisionLinkIntegrityError extends Error {
  constructor(message = 'link referential integrity ihlali (composite FK/tenant/case uyusmazligi)') {
    super(message);
    this.name = 'UyapCpeDecisionLinkIntegrityError';
  }
}

'use strict';

/**
 * GOV-TASK-REVISION-STATE-ENFORCEMENT-R01 — structured task revision model.
 *
 * Bir gorevin tasarimi superseded oldugunda orchestrator'in gidecek yeri yoktu.
 * State machine'de `HANDOFF_REQUIRED` diye bir state YOKTUR (state.cjs: 14
 * state, DECLARED..CANCELLED), dolayisiyla ajan durumu serbest metne dusuruyor
 * ve gorevi birakiyordu. Cozum yeni bir dis lifecycle state EKLEMEK DEGILDIR —
 * dis state'ler cogaltilirsa her tuketici kirilir. Cozum, revision'i ayri ve
 * structured bir ic event modeli olarak tutmaktir:
 *
 *   CURRENT_REVISION → REVISION_PROPOSED → REVISION_VALIDATED → REVISION_ACTIVE
 *
 * Handoff bir disposition DEGILDIR; ayri bir owner-gated event'tir. Ikisini
 * ayirmak bu modulun tek isidir: "tasarim degisti" ile "sahiplik degisiyor"
 * ayni cumleyle raporlandigi surece gorev her ikisinde de oluyor.
 *
 * Contract: coordination-v2/governance-orchestration-contract-v2.md §2.1, §2.2, §13
 * Norm    : AGENTS.md §7 · project/docs/governance/process-rules.md
 *
 * Cagrildigi yerler:
 * - orchestrator/state.cjs -> transition(opts.revision) opsiyonel dogrulama
 * - orchestrator/revision.test.cjs (CI: Orchestration Tests)
 * - apps/web/src/__tests__/task-disposition-invariants.test.ts (REQUIRED)
 */

/** Revision ic event modeli. Dis task lifecycle state'leri DEGILDIR. */
const REVISION_STATES = Object.freeze([
  'CURRENT_REVISION',
  'REVISION_PROPOSED',
  'REVISION_VALIDATED',
  'REVISION_ACTIVE',
]);

const REVISION_ALLOWED = Object.freeze({
  CURRENT_REVISION: Object.freeze(['REVISION_PROPOSED']),
  // Reddedilen bir oneri mevcut revision'a geri duser; task durmaz.
  REVISION_PROPOSED: Object.freeze(['REVISION_VALIDATED', 'CURRENT_REVISION']),
  REVISION_VALIDATED: Object.freeze(['REVISION_ACTIVE']),
  REVISION_ACTIVE: Object.freeze([]),
});

/**
 * Neyin superseded oldugu. Karar bu katmana gore verilir — "bir sey degisti"
 * tek basina hicbir sey soylemez.
 */
const SUPERSEDED_LAYERS = Object.freeze({
  IMPLEMENTATION_DESIGN: 'TASK_REVISION',
  TEST_DESIGN: 'TASK_REVISION',
  VALIDATION_APPROACH: 'TASK_REVISION',
  ALLOWLIST_NARROWED: 'TASK_REVISION',
  BASE_REVISION: 'TASK_REVISION',
  CONTRACT_VERSION: 'TASK_REVISION',
  ALLOWLIST_WIDENED: 'NEW_AUTHORITY_REQUIRED',
  FORBIDDEN_SURFACE_ADDED: 'NEW_AUTHORITY_REQUIRED',
  SEMANTIC_OUTCOME: 'NEW_TASK_OR_OWNER_DECISION',
  PRIMARY_OWNERSHIP: 'EXECUTOR_HANDOFF',
});

const CLASSIFICATIONS = Object.freeze([
  'TASK_REVISION',
  'NEW_AUTHORITY_REQUIRED',
  'NEW_TASK_OR_OWNER_DECISION',
  'EXECUTOR_HANDOFF',
]);

/** WIP asla sessizce atilmaz; iki mesru disposition vardir. */
const WIP_DISPOSITIONS = Object.freeze(['PRESERVE', 'REEVALUATE']);

const DRIFT_RECONCILIATION = Object.freeze(['NOT_REQUIRED', 'PASS', 'FAIL', 'PENDING']);

const VIOLATION = Object.freeze({
  REVISION_STATE_UNKNOWN: 'REVISION_STATE_UNKNOWN',
  REVISION_TRANSITION_FORBIDDEN: 'REVISION_TRANSITION_FORBIDDEN',
  SUPERSEDED_LAYER_UNKNOWN: 'SUPERSEDED_LAYER_UNKNOWN',
  REVISION_ID_NOT_MONOTONIC: 'REVISION_ID_NOT_MONOTONIC',
  SUPERSEDED_REVISION_OVERWRITE: 'SUPERSEDED_REVISION_OVERWRITE',
  WIP_DISPOSITION_INVALID: 'WIP_DISPOSITION_INVALID',
  NEXT_ACTION_REQUIRED: 'NEXT_ACTION_REQUIRED',
  REVISION_REASON_REQUIRED: 'REVISION_REASON_REQUIRED',
  AUTHORITY_WIDENING_FORBIDDEN: 'AUTHORITY_WIDENING_FORBIDDEN',
  ALLOWLIST_WIDENING_FORBIDDEN: 'ALLOWLIST_WIDENING_FORBIDDEN',
  HANDOFF_GRANT_REQUIRED: 'HANDOFF_GRANT_REQUIRED',
  HANDOFF_NOT_A_DISPOSITION: 'HANDOFF_NOT_A_DISPOSITION',
  DRIFT_RECONCILIATION_REQUIRED: 'DRIFT_RECONCILIATION_REQUIRED',
  TERMINATION_FORBIDDEN_REVISION_ELIGIBLE: 'TERMINATION_FORBIDDEN_REVISION_ELIGIBLE',
  SEMANTIC_OUTCOME_CHANGE_FORBIDDEN: 'SEMANTIC_OUTCOME_CHANGE_FORBIDDEN',
});

/**
 * Bir kayittan revision gorunumu okur.
 *
 * BACKWARD COMPATIBILITY: alan tasimayan mevcut task kayitlari gecerlidir ve
 * `revisionId = 1` olarak okunur (contract §2.1). Bu davranis olmadan modelin
 * devreye girmesi butun gecmis kayitlari gecersiz kilardi.
 */
function readRevisionView(record) {
  const r = (record && record.taskRevision) || null;
  if (!r) {
    return {
      revisionId: 1,
      revisionOf: null,
      supersededRevision: null,
      supersededLayer: null,
      revisionReason: null,
      revisionState: 'CURRENT_REVISION',
      wipDisposition: 'PRESERVE',
      driftReconciliation: 'NOT_REQUIRED',
      handoffRequested: false,
      handoffAllowed: false,
      nextRequiredAction: null,
      legacy: true,
    };
  }
  return {
    revisionId: r.revisionId,
    revisionOf: r.revisionOf != null ? r.revisionOf : null,
    supersededRevision: r.supersededRevision != null ? r.supersededRevision : null,
    supersededLayer: r.supersededLayer || null,
    revisionReason: r.revisionReason || null,
    revisionState: r.revisionState || 'CURRENT_REVISION',
    wipDisposition: r.wipDisposition || 'PRESERVE',
    driftReconciliation: r.driftReconciliation || 'NOT_REQUIRED',
    handoffRequested: r.handoffRequested === true,
    handoffAllowed: r.handoffAllowed === true,
    nextRequiredAction: r.nextRequiredAction || null,
    legacy: false,
  };
}

/**
 * Degisikligi siniflandirir. Tek girdi `supersededLayer`'dir: "ne degisti"
 * sorusunun cevabi, "ne yapmali" sorusunun cevabini belirler.
 */
function classifyChange(input) {
  const layer = input && input.supersededLayer;
  if (!layer || !Object.prototype.hasOwnProperty.call(SUPERSEDED_LAYERS, layer)) {
    return { classification: null, code: VIOLATION.SUPERSEDED_LAYER_UNKNOWN, layer: layer || null };
  }
  return { classification: SUPERSEDED_LAYERS[layer], code: null, layer: layer };
}

function isRevisionEligible(input) {
  return classifyChange(input).classification === 'TASK_REVISION';
}

function push(violations, code, detail) {
  violations.push({ code: code, detail: detail });
}

/**
 * Bir revision onerisini dogrular.
 *
 * @param {object} next  onerilen revision kaydi
 * @param {object} [prev] mevcut revision gorunumu (readRevisionView ciktisi)
 * @param {object} [opts] { ownerAuthorityRef, handoffGrantRef }
 */
function validateRevision(next, prev, opts) {
  const violations = [];
  const options = opts || {};
  const current = prev || readRevisionView(null);
  const proposed = next || {};

  // --- siniflandirma -------------------------------------------------------
  const klass = classifyChange(proposed);
  if (klass.code) push(violations, klass.code, String(klass.layer));

  // --- ic event gecisi -----------------------------------------------------
  const toState = proposed.revisionState;
  if (REVISION_STATES.indexOf(toState) === -1) {
    push(violations, VIOLATION.REVISION_STATE_UNKNOWN, String(toState));
  } else {
    const allowed = REVISION_ALLOWED[current.revisionState] || [];
    if (toState !== current.revisionState && allowed.indexOf(toState) === -1) {
      push(
        violations,
        VIOLATION.REVISION_TRANSITION_FORBIDDEN,
        current.revisionState + ' -> ' + toState,
      );
    }
  }

  // --- immutability --------------------------------------------------------
  if (!Number.isInteger(proposed.revisionId) || proposed.revisionId < 1) {
    push(violations, VIOLATION.REVISION_ID_NOT_MONOTONIC, String(proposed.revisionId));
  } else if (proposed.revisionId <= current.revisionId && toState !== current.revisionState) {
    push(
      violations,
      VIOLATION.REVISION_ID_NOT_MONOTONIC,
      proposed.revisionId + ' <= ' + current.revisionId,
    );
  }
  // Superseded olan revision yeniden yazilmaz; yalniz isaretlenir.
  if (proposed.supersededRevision != null && proposed.supersededRevision === proposed.revisionId) {
    push(
      violations,
      VIOLATION.SUPERSEDED_REVISION_OVERWRITE,
      'revision ' + proposed.revisionId + ' kendini supersede edemez',
    );
  }
  if (proposed.overwritesRevision != null) {
    push(
      violations,
      VIOLATION.SUPERSEDED_REVISION_OVERWRITE,
      'overwrite ' + proposed.overwritesRevision,
    );
  }

  // --- WIP -----------------------------------------------------------------
  if (WIP_DISPOSITIONS.indexOf(proposed.wipDisposition) === -1) {
    push(violations, VIOLATION.WIP_DISPOSITION_INVALID, String(proposed.wipDisposition));
  }

  // --- askida birakma ------------------------------------------------------
  const nextAction = String(proposed.nextRequiredAction || '').trim();
  if (!nextAction) push(violations, VIOLATION.NEXT_ACTION_REQUIRED, 'nextRequiredAction bos');
  if (!String(proposed.revisionReason || '').trim()) {
    push(violations, VIOLATION.REVISION_REASON_REQUIRED, 'revisionReason bos');
  }

  // --- authority -----------------------------------------------------------
  if (proposed.authorityWidened === true && !options.ownerAuthorityRef) {
    push(violations, VIOLATION.AUTHORITY_WIDENING_FORBIDDEN, 'owner authority yok');
  }
  if (klass.classification === 'NEW_AUTHORITY_REQUIRED' && !options.ownerAuthorityRef) {
    const code =
      klass.layer === 'ALLOWLIST_WIDENED'
        ? VIOLATION.ALLOWLIST_WIDENING_FORBIDDEN
        : VIOLATION.AUTHORITY_WIDENING_FORBIDDEN;
    push(violations, code, klass.layer + ' owner authority ister');
  }
  if (klass.classification === 'NEW_TASK_OR_OWNER_DECISION') {
    push(
      violations,
      VIOLATION.SEMANTIC_OUTCOME_CHANGE_FORBIDDEN,
      'semantic outcome degisikligi revision degildir; yeni task veya owner karari',
    );
  }

  // --- handoff -------------------------------------------------------------
  // Handoff bir disposition DEGILDIR: ayri bir owner-gated event'tir.
  if (proposed.handoffRequested === true) {
    if (!options.handoffGrantRef && proposed.handoffAllowed !== true) {
      push(violations, VIOLATION.HANDOFF_GRANT_REQUIRED, 'primary handoff explicit grant ister');
    }
    if (klass.classification === 'TASK_REVISION') {
      push(
        violations,
        VIOLATION.HANDOFF_NOT_A_DISPOSITION,
        klass.layer + ' revision-eligible; handoff yerine revision acilir',
      );
    }
  }
  if (klass.classification === 'EXECUTOR_HANDOFF' && !options.handoffGrantRef) {
    push(violations, VIOLATION.HANDOFF_GRANT_REQUIRED, 'PRIMARY_OWNERSHIP explicit grant ister');
  }

  // --- base drift ----------------------------------------------------------
  if (klass.layer === 'BASE_REVISION') {
    if (DRIFT_RECONCILIATION.indexOf(proposed.driftReconciliation) === -1) {
      push(violations, VIOLATION.DRIFT_RECONCILIATION_REQUIRED, String(proposed.driftReconciliation));
    } else if (proposed.driftReconciliation !== 'PASS' && toState === 'REVISION_ACTIVE') {
      push(
        violations,
        VIOLATION.DRIFT_RECONCILIATION_REQUIRED,
        'PASS olmadan REVISION_ACTIVE olmaz (' + proposed.driftReconciliation + ')',
      );
    }
  }

  return { valid: violations.length === 0, violations: violations, classification: klass.classification };
}

/**
 * Termination izni. Revision-eligible bir degisiklik task'i terminal ETMEZ —
 * bu modulun varlik sebebi tam olarak budur.
 */
function assertTerminationAllowed(input) {
  if (!input) return { allowed: true, violations: [] };
  if (input.taskIdentityChanged === true) return { allowed: true, violations: [] };
  if (!isRevisionEligible(input)) return { allowed: true, violations: [] };
  return {
    allowed: false,
    violations: [
      {
        code: VIOLATION.TERMINATION_FORBIDDEN_REVISION_ELIGIBLE,
        detail:
          String(input.supersededLayer) +
          ' revision-eligible; task identity ayni oldugu icin termination reddedilir',
      },
    ],
  };
}

/**
 * Handoff talebi. Bir disposition degil, ayri bir event uretir — cagiran onu
 * owner'a tasir ve gorev bu arada terminal olmaz.
 */
function buildHandoffRequest(input) {
  const o = input || {};
  return {
    event: 'HANDOFF_REQUEST',
    taskId: o.taskId || null,
    fromExecutor: o.fromExecutor || null,
    toExecutor: o.toExecutor || null,
    reason: o.reason || null,
    // Dort istisna: process-rules.md § Gerçek executor handoff istisnaları
    exception: o.exception || null,
    ownerDecisionRequired: true,
    wipDisposition: WIP_DISPOSITIONS.indexOf(o.wipDisposition) === -1 ? 'PRESERVE' : o.wipDisposition,
    grantRef: o.grantRef || null,
    allowed: !!o.grantRef,
  };
}

function formatViolations(result) {
  if (!result || result.valid) return 'REVISION_OK';
  return ['REVISION_REJECTED']
    .concat(result.violations.map((v) => '  [' + v.code + '] ' + v.detail))
    .join('\n');
}

module.exports = {
  CLASSIFICATIONS,
  DRIFT_RECONCILIATION,
  REVISION_ALLOWED,
  REVISION_STATES,
  SUPERSEDED_LAYERS,
  VIOLATION,
  WIP_DISPOSITIONS,
  assertTerminationAllowed,
  buildHandoffRequest,
  classifyChange,
  formatViolations,
  isRevisionEligible,
  readRevisionView,
  validateRevision,
};

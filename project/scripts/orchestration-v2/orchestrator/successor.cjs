'use strict';
/**
 * When one task may unblock another.
 *
 * There were three answers to this in the repository and no shared one:
 *
 *   orchestrator.evaluateEligibility   rec.state !== 'CLOSED'      (live)
 *   orchestrator.successorDisposition  r.state === 'CLOSED'        (exported)
 *   queue.head                         dependsOn -> state CLOSED   (live)
 *
 * Three copies of a rule is three places for it to drift, and the drift here has
 * a specific consequence: a task whose code merged but whose capability was
 * never actually delivered would release its successor from whichever site was
 * checked. The successor then builds on a foundation nobody verified — which is
 * the failure this whole program exists to stop, one level up from where it was
 * first found.
 *
 * So the rule lives here and every site calls it.
 *
 * The rule is VERSION-SCOPED, and deliberately not retroactive. A schema-v1
 * successor keeps schema-v1 semantics: CLOSED is enough, because v1 tasks carry
 * no delivery contract and never could have satisfied a delivery gate. Applying
 * the new rule backwards would not make old work safer — it would make every
 * historical chain permanently ineligible and force a bypass, which is how a
 * gate becomes decorative. A schema-v2 successor requires delivery evidence.
 *
 * That is not a v1 bypass. A v1 predecessor of a V2 successor is
 * LEGACY_UNVERIFIED and does NOT unlock it; the scoping is on the successor's
 * own schema, which is the task whose authority is being exercised.
 */

/** Why a predecessor did not release its successor. */
const REASONS = [
  'PREDECESSOR_NOT_DECLARED',
  'PREDECESSOR_NOT_CLOSED',
  'PREDECESSOR_DELIVERY_LEGACY_UNVERIFIED',
  'PREDECESSOR_DELIVERY_NOT_RUN',
  'PREDECESSOR_DELIVERY_FAILED',
  'PREDECESSOR_DELIVERY_STALE',
  'PREDECESSOR_DELIVERY_MERGE_SHA_MISMATCH',
  'PREDECESSOR_DELIVERY_TASK_ID_MISMATCH',
  'PREDECESSOR_DELIVERY_UNWIRED',
  'PREDECESSOR_DELIVERY_EVIDENCE_INVALID',
  'PREDECESSOR_NOT_APPLICABLE_UNPROVEN',
];

/** Delivery verdicts that are terminal-but-not-passing. */
const NON_PASSING = {
  FAIL: 'PREDECESSOR_DELIVERY_FAILED',
  STALE: 'PREDECESSOR_DELIVERY_STALE',
  NOT_RUN: 'PREDECESSOR_DELIVERY_NOT_RUN',
  UNWIRED: 'PREDECESSOR_DELIVERY_UNWIRED',
  LEGACY_UNVERIFIED: 'PREDECESSOR_DELIVERY_LEGACY_UNVERIFIED',
};

/**
 * The delivery record a CLOSED task carries, if any.
 *
 * Read from the state payload rather than recomputed: the finalizer wrote it at
 * closure time, bound to the merge SHA, and re-deriving it here would be a
 * second opinion with no access to the merge that produced the first.
 */
function deliveryOf(record) {
  if (!record) return null;
  const p = record.payload || {};
  return p.delivery || null;
}

/**
 * Does one predecessor satisfy the gate for a successor of the given schema?
 *
 * @param {object} record            the predecessor's current state record
 * @param {number} successorSchema   1 or 2 — the SUCCESSOR's schema version
 * @returns {{ok: boolean, reason: (string|null), detail: (string|null)}}
 */
function predecessorSatisfied(record, successorSchema) {
  if (!record) return { ok: false, reason: 'PREDECESSOR_NOT_DECLARED', detail: null };
  if (record.state !== 'CLOSED') {
    return { ok: false, reason: 'PREDECESSOR_NOT_CLOSED', detail: record.state };
  }
  // v1 semantics, unchanged. CLOSED is the whole rule, as it always was.
  if (successorSchema !== 2) return { ok: true, reason: null, detail: null };

  const d = deliveryOf(record);
  if (!d) {
    // Closed under the old rules. Honest rather than convenient: the work may
    // well be fine, but nothing here can say so, and saying so anyway is what
    // this program is about not doing.
    return { ok: false, reason: 'PREDECESSOR_DELIVERY_LEGACY_UNVERIFIED', detail: 'no delivery evidence recorded' };
  }

  if (d.verdict === 'PASS') {
    // Internally consistent is not the same as being about THIS task.
    //
    // Found by the WP04 dogfood run, which is the point of having one: an
    // evidence record can satisfy every shape check — PASS, complete identity,
    // verifiedAtSha === mergeSha — and still describe a different merge than
    // the predecessor actually produced. Copied from another task, or left
    // behind by an earlier attempt, it would have released the successor.
    //
    // So when the record knows its own merge sha, the evidence must agree with
    // it. Checked before the internal-consistency test because "this evidence
    // is about another commit" is the more specific answer.
    const ownMergeSha = (record.payload && record.payload.mergeSha) || null;
    if (ownMergeSha && d.mergeSha !== ownMergeSha) {
      return {
        ok: false,
        reason: 'PREDECESSOR_DELIVERY_MERGE_SHA_MISMATCH',
        detail: 'evidence mergeSha=' + String(d.mergeSha) + ' but the task merged ' + ownMergeSha,
      };
    }
    // The same substitution, one axis over. Binding the evidence to a merge sha
    // catches the copy that came from another COMMIT; it does not catch the one
    // that came from another TASK, because two tasks can name the same merge —
    // a squash that carried both, a stale record from a sibling attempt, or an
    // evidence object simply written under the wrong key.
    //
    // So when the evidence names a task, it must name THIS one. Silence is not
    // treated as a mismatch: evidence written before the field existed says
    // nothing about which task it belongs to, and refusing every such record
    // would fail closed on records that predate the question rather than on
    // records that answer it wrongly.
    const ownTaskId = (record.payload && record.payload.taskId) || null;
    if (ownTaskId && d.taskId && d.taskId !== ownTaskId) {
      return {
        ok: false,
        reason: 'PREDECESSOR_DELIVERY_TASK_ID_MISMATCH',
        detail: 'evidence taskId=' + String(d.taskId) + ' but this predecessor is ' + ownTaskId,
      };
    }
    // A PASS is only a PASS at the commit that was merged. Evidence from the
    // branch head, or from a probe that has since changed, is a different
    // claim wearing the same word.
    if (!d.verifiedAtSha || !d.mergeSha || d.verifiedAtSha !== d.mergeSha) {
      return {
        ok: false,
        reason: 'PREDECESSOR_DELIVERY_STALE',
        detail: 'verifiedAtSha=' + String(d.verifiedAtSha) + ' mergeSha=' + String(d.mergeSha),
      };
    }
    if (!d.evidenceDigest || !d.deliveryContractSha256 || !d.probeDefinitionSha256) {
      return { ok: false, reason: 'PREDECESSOR_DELIVERY_EVIDENCE_INVALID', detail: 'incomplete evidence identity' };
    }
    return { ok: true, reason: null, detail: null };
  }

  if (d.verdict === 'NOT_APPLICABLE') {
    // NOT_APPLICABLE is a claim about the DIFF, so it needs the classifier's
    // verdict, not the author's word. Absent that proof it is an assertion.
    if (d.runtimeImpact !== false || !Array.isArray(d.classifiedPaths)) {
      return { ok: false, reason: 'PREDECESSOR_NOT_APPLICABLE_UNPROVEN', detail: 'no deterministic non-runtime classification' };
    }
    return { ok: true, reason: null, detail: null };
  }

  return {
    ok: false,
    reason: NON_PASSING[d.verdict] || 'PREDECESSOR_DELIVERY_EVIDENCE_INVALID',
    detail: String(d.verdict),
  };
}

/**
 * Evaluate every predecessor of one task.
 *
 * @param {object} o
 * @param {string[]} o.predecessorTaskIds
 * @param {function} o.currentOf        (taskId) => state record | null
 * @param {number} [o.successorSchema]  defaults to 1
 * @returns {{eligible: boolean, reasons: string[]}}
 */
function evaluate(o) {
  const schema = o.successorSchema === 2 ? 2 : 1;
  const reasons = [];
  for (const pred of o.predecessorTaskIds || []) {
    const verdict = predecessorSatisfied(o.currentOf(pred), schema);
    if (!verdict.ok) {
      reasons.push(verdict.reason + ':' + pred + (verdict.detail ? '=' + verdict.detail : ''));
    }
  }
  return { eligible: reasons.length === 0, reasons };
}

module.exports = { REASONS, NON_PASSING, deliveryOf, predecessorSatisfied, evaluate };

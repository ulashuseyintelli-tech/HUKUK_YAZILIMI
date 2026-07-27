'use strict';
/**
 * Capability manifest — what this system claims to be able to do, and how each
 * claim is checked.
 *
 * The gap this closes is not a missing test. It is a missing question. Every
 * work package so far ended when its code merged and its tests passed, and the
 * question "does the shipped system actually do this through the door an
 * operator opens?" had no owner. Three separate modules reached main in that
 * state — governance-profile.cjs was called by nothing for a day, and
 * completeAfterOwnerMerge still is — and in each case every test was green.
 *
 * A capability is therefore declared here as a TARGET, not as a boolean. The
 * verifier observes the system and reports what it found; the verdict is the
 * comparison of the two. That distinction is the whole design:
 *
 *   target OPERABLE       observed OPERABLE       PASS
 *   target WIRED_DISABLED observed WIRED_DISABLED PASS   (deliberately off)
 *   target ENFORCED       observed UNWIRED        FAIL   (shipped, unreachable)
 *
 * UNWIRED is never OFF. A feature that is deliberately disabled is wired and
 * proves its disable condition; a feature nothing calls is a defect wearing the
 * same word. Collapsing them is how "merged" came to read as "delivered".
 */

const authority = require('../orchestrator/authority.cjs');

/** Where a capability lives, as far as a caller is concerned. */
const DELIVERY_CLASSES = [
  // A command an operator types.
  'OPERATOR_CLI',
  // A path reached by enqueuing work into the running service.
  'SERVICE_PATH',
  // An internal gate, but one that must be REACHED through a public entrypoint
  // to count. Naming the class this way is deliberate: it is a standing reminder
  // that requiring the gate to exist is not the same as requiring it to run.
  'INTERNAL_ENFORCEMENT_REACHED_THROUGH_PUBLIC_PATH',
  // The finalization half of the service: what happens after a merge.
  'SERVICE_FINALIZATION',
];

/**
 * What a capability is SUPPOSED to be. Declared by the author of the work.
 *
 * NOT_APPLICABLE exists for genuinely non-runtime work and is restricted in
 * WP03 by deterministic diff classification — a task that touches runtime code
 * may not select it. Here it is merely part of the vocabulary.
 */
const TARGET_STATES = ['OPERABLE', 'ENFORCED', 'ROUTABLE', 'WIRED_DISABLED', 'NOT_APPLICABLE'];

/**
 * What the probe actually found. A superset of the targets, because the states
 * worth reporting are precisely the ones no author would ever declare.
 */
const OBSERVED_STATES = [
  'OPERABLE',
  'ENFORCED',
  'ROUTABLE',
  'WIRED_DISABLED',
  // Shipped, tested, and reachable from nothing.
  'UNWIRED',
  // Reached and misbehaved.
  'FAILED',
  // Evidence exists but belongs to another commit.
  'STALE',
  // No probe ran. Distinct from FAILED on purpose: "we did not look" and "we
  // looked and it was broken" are different facts and only one of them is a bug.
  'NOT_RUN',
  'NOT_APPLICABLE',
];

const VERDICTS = ['PASS', 'FAIL', 'STALE', 'LEGACY_UNVERIFIED', 'NOT_APPLICABLE'];

/**
 * Probe classes, ordered by how much of the real world they touch.
 *
 *   PROBE_DRY      real CLI, preflight only. No executor, no PR, no network.
 *   PROBE_SEALED   real CLI AND real composition root, against a disposable
 *                  repository with process-boundary substitutes. Still no
 *                  network and no production mutation.
 *   PROBE_CERTIFY  the real chain: real PR, real CI, real merge. Owner-invoked
 *                  only, never part of routine verification or ordinary CI,
 *                  because running it is itself a mutation.
 */
const PROBE_CLASSES = ['PROBE_DRY', 'PROBE_SEALED', 'PROBE_CERTIFY'];

/** Which probe classes each mode runs. PROBE_CERTIFY is in neither. */
const MODES = {
  pulse: ['PROBE_DRY'],
  sealed: ['PROBE_DRY', 'PROBE_SEALED'],
};

class ManifestError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'ManifestError';
    this.code = code;
    this.detail = detail || null;
  }
}

/**
 * The manifest.
 *
 * Hand-written rather than derived, because a capability that no human declared
 * is a capability nobody owns. Derivation would also defeat the purpose: the
 * failure this catches is code that exists and is called by nothing, and any
 * scheme that discovers capabilities FROM the code would discover exactly the
 * unreachable modules it is supposed to flag and call them present.
 *
 * `contract` is the forward-compatible half. In WP03 a task's deliveryContract
 * is hash-pinned by its grant and this field becomes the manifest's copy of it;
 * until then it is the declaration, and its digest is what evidence binds to.
 */
const CAPABILITIES = [
  {
    capabilityId: 'GOV_COORD_V2_RUNNER_AUTHORITY',
    title: 'orch:run resolves grant authority against the repository',
    deliveryClass: 'OPERATOR_CLI',
    targetState: 'OPERABLE',
    probeId: 'PROBE_RUNNER_AUTHORITY_DRY',
    probeClass: 'PROBE_DRY',
    publicEntrypoint: 'node scripts/orchestration-v2/runtime/run-task.cjs --dev-direct --dry-run',
    contract: {
      publicEntrypointOnly: true,
      nonDestructivePulse: true,
      postMergeRequired: true,
      timeoutMs: 180000,
    },
    // Why this capability is worth a probe at all, in one line, for the panel
    // reader who has never seen this file.
    //
    // The entrypoint carries --dev-direct because #1687 closed the direct route
    // as a production path. The authority preflight still runs on it, and the
    // probe checks BOTH: that the closure holds, and that the preflight behind
    // it still refuses fabricated authority.
    rationale:
      'A grant citing a fabricated authority record passed every live gate until #1685. ' +
      'The gate now exists; this proves it is still on the path, and that the direct ' +
      'path stays closed to anyone who does not name --dev-direct.',
  },
  {
    capabilityId: 'GOV_COORD_V2_REQUEST_EXECUTOR_PATH',
    title: 'a request reaches a real executor through the service',
    deliveryClass: 'SERVICE_PATH',
    targetState: 'OPERABLE',
    probeId: 'PROBE_REQUEST_EXECUTOR_SEALED',
    probeClass: 'PROBE_SEALED',
    publicEntrypoint: 'node scripts/orchestration-v2/service/orch-service.cjs enqueue|run-once',
    contract: {
      publicEntrypointOnly: true,
      nonDestructivePulse: false,
      postMergeRequired: true,
      timeoutMs: 240000,
    },
    rationale:
      'request → admission → queue → dispatch → executor was assembled in #1687. ' +
      'Each half had passing tests for a week while nothing joined them.',
  },
  {
    capabilityId: 'MECHANICAL_GOVERNANCE_GATE',
    title: 'the governance profile refuses forbidden governance work',
    deliveryClass: 'INTERNAL_ENFORCEMENT_REACHED_THROUGH_PUBLIC_PATH',
    targetState: 'ENFORCED',
    probeId: 'PROBE_GOVERNANCE_GATE_SEALED',
    probeClass: 'PROBE_SEALED',
    publicEntrypoint: 'node scripts/orchestration-v2/service/orch-service.cjs enqueue',
    contract: {
      publicEntrypointOnly: true,
      nonDestructivePulse: false,
      postMergeRequired: true,
      timeoutMs: 180000,
    },
    rationale:
      'governance-profile.cjs shipped in #1683 with the contract naming it as the ' +
      'mechanical enforcement, and no production caller. #1687 wired it. This is the ' +
      'check that would have caught the day in between.',
  },
  {
    capabilityId: 'GOV_COORD_V2_POST_MERGE_DELIVERY_CLOSURE',
    title: 'a MERGE_READY entry can be durably finalized through the operator console',
    deliveryClass: 'SERVICE_FINALIZATION',
    targetState: 'ENFORCED',
    probeId: 'PROBE_POST_MERGE_CLOSURE_SEALED',
    probeClass: 'PROBE_SEALED',
    publicEntrypoint: 'node scripts/orchestration-v2/service/orch-service.cjs finalize',
    contract: {
      publicEntrypointOnly: true,
      nonDestructivePulse: false,
      postMergeRequired: true,
      timeoutMs: 180000,
    },
    // This one is expected to FAIL when WP01 lands, and that failure is the
    // pilot's success criterion. A verifier that only ever agrees with the
    // system it verifies has proved nothing about the system.
    rationale:
      'completeAfterOwnerMerge writes MERGED then CLOSED with no caller on any ' +
      'executable path, and the queue declares five states past MERGE_READY that ' +
      'no public command can reach. WP02 closes this.',
  },
];

/**
 * Canonicalization and digests come from authority.cjs. There is one answer in
 * this repository to "what is the canonical form of this object?", and it is
 * not this file's.
 *
 * This module used to carry its own canonicalJson and its own sha256. Two
 * independent canonicalizations is the shape of #1696, where a generator hashed
 * raw text and a validator hashed canonical JSON and the disagreement was
 * silent until a human noticed. They also differed here in a way that would
 * have bitten eventually: authority's canonicalizer REFUSES non-integer and
 * non-finite numbers rather than emitting whatever JSON.stringify produces.
 */
const canonicalJson = (value) => authority.canonicalize(value);
const digest = (value) => authority.digest(value);

/**
 * The full delivery contract for a capability — its identity as a CLAIM.
 *
 * Assembled from the capability AND its probe, because the probe's definition
 * digest is part of what is being promised: a contract that kept its digest
 * while the check behind it was rewritten would make "the verifier was not
 * weakened between the red run and the green one" unprovable.
 *
 * Presentation fields (title, rationale) are deliberately not passed through.
 * If editing a sentence invalidated a ratified grant, nobody would ever improve
 * one.
 */
function contractFor(capability, probe) {
  return authority.normalizeDeliveryContract({
    schemaVersion: 2,
    capabilityId: capability.capabilityId,
    deliveryClass: capability.deliveryClass,
    targetState: capability.targetState,
    probeId: capability.probeId,
    probeClass: capability.probeClass,
    probeDefinitionSha256: authority.digest(probe.definition),
    publicEntrypoint: capability.publicEntrypoint,
    publicEntrypointOnly: capability.contract.publicEntrypointOnly,
    nonDestructivePulse: capability.contract.nonDestructivePulse,
    postMergeRequired: capability.contract.postMergeRequired,
    timeoutMs: capability.contract.timeoutMs,
    evidencePolicy: capability.contract.evidencePolicy,
  });
}

/** The digest of that contract. The value a grant pins. */
function contractDigest(capability, probe) {
  return authority.digest(contractFor(capability, probe));
}

/**
 * Validate the manifest itself.
 *
 * Fail-closed on every shape that would let a capability quietly disappear:
 * a duplicate id (the second silently shadows the first in any map), an unknown
 * state (a typo'd target can never be matched, so the capability can never
 * pass), a missing probe id (nothing to run, and the panel would show a blank
 * rather than a failure).
 *
 * @param {Array} [caps] defaults to the shipped manifest
 * @returns {{ok: true, count: number}} or throws ManifestError
 */
function validateManifest(caps) {
  const list = caps || CAPABILITIES;
  if (!Array.isArray(list) || list.length === 0) {
    throw new ManifestError('MANIFEST_EMPTY', 'a manifest with no capabilities verifies nothing');
  }
  const seen = new Set();
  for (const c of list) {
    if (!c || typeof c !== 'object') throw new ManifestError('CAPABILITY_NOT_AN_OBJECT', String(c));
    if (typeof c.capabilityId !== 'string' || !/^[A-Z][A-Z0-9_]{2,63}$/.test(c.capabilityId)) {
      throw new ManifestError('CAPABILITY_ID_INVALID', String(c.capabilityId));
    }
    // A duplicate is not a warning. Two entries under one id means one of them
    // is never verified, and which one is an accident of iteration order.
    if (seen.has(c.capabilityId)) throw new ManifestError('CAPABILITY_ID_DUPLICATE', c.capabilityId);
    seen.add(c.capabilityId);

    if (DELIVERY_CLASSES.indexOf(c.deliveryClass) === -1) {
      throw new ManifestError('DELIVERY_CLASS_UNKNOWN', c.capabilityId + ' -> ' + String(c.deliveryClass));
    }
    if (TARGET_STATES.indexOf(c.targetState) === -1) {
      throw new ManifestError('TARGET_STATE_UNKNOWN', c.capabilityId + ' -> ' + String(c.targetState));
    }
    if (PROBE_CLASSES.indexOf(c.probeClass) === -1) {
      throw new ManifestError('PROBE_CLASS_UNKNOWN', c.capabilityId + ' -> ' + String(c.probeClass));
    }
    if (typeof c.probeId !== 'string' || !c.probeId) {
      throw new ManifestError('PROBE_ID_MISSING', c.capabilityId);
    }
    if (typeof c.publicEntrypoint !== 'string' || !c.publicEntrypoint) {
      throw new ManifestError('PUBLIC_ENTRYPOINT_UNDECLARED', c.capabilityId);
    }
    const k = c.contract;
    if (!k || typeof k !== 'object') throw new ManifestError('DELIVERY_CONTRACT_MALFORMED', c.capabilityId);
    // publicEntrypointOnly false would mean "this capability may be proved by
    // calling an internal function", which is the exact thing being outlawed.
    // It is a field rather than an assumption so that a future attempt to relax
    // it has to be written down and reviewed.
    if (k.publicEntrypointOnly !== true) {
      throw new ManifestError('PUBLIC_ENTRYPOINT_ONLY_REQUIRED', c.capabilityId);
    }
    if (!Number.isInteger(k.timeoutMs) || k.timeoutMs < 1000 || k.timeoutMs > 900000) {
      throw new ManifestError('DELIVERY_CONTRACT_TIMEOUT_INVALID', c.capabilityId + ' -> ' + String(k.timeoutMs));
    }
  }
  return { ok: true, count: list.length };
}

/**
 * Validate one probe definition against the capability that names it.
 *
 * A probe is a function plus its declared identity. Both halves are checked:
 * a probe whose id does not match the capability's probeId is a wiring mistake
 * that would otherwise run the wrong check and report the right name.
 */
function validateProbeDefinition(capability, probe) {
  if (!probe || typeof probe !== 'object') {
    throw new ManifestError('DELIVERY_PROBE_MISSING', capability.capabilityId);
  }
  if (probe.probeId !== capability.probeId) {
    throw new ManifestError(
      'PROBE_ID_MISMATCH',
      capability.capabilityId + ' expects ' + capability.probeId + ', got ' + String(probe.probeId),
    );
  }
  if (probe.probeClass !== capability.probeClass) {
    throw new ManifestError(
      'PROBE_CLASS_MISMATCH',
      capability.capabilityId + ' expects ' + capability.probeClass + ', got ' + String(probe.probeClass),
    );
  }
  if (typeof probe.run !== 'function') {
    throw new ManifestError('PROBE_NOT_RUNNABLE', capability.capabilityId);
  }
  // The definition digest travels into the evidence record. Its purpose is to
  // make "the probe was weakened between the red run and the green run"
  // mechanically detectable rather than a matter of trust — which is the only
  // way a red-then-green pilot proves anything at all.
  if (typeof probe.definition !== 'object' || probe.definition === null) {
    throw new ManifestError('PROBE_DEFINITION_MISSING', capability.capabilityId);
  }
  return { ok: true, probeDefinitionSha256: digest(probe.definition) };
}

/** Look one up. Absent is an error, never an empty result. */
function capability(capabilityId, caps) {
  const list = caps || CAPABILITIES;
  const found = list.filter((c) => c.capabilityId === capabilityId);
  if (found.length === 0) {
    throw new ManifestError('CAPABILITY_NOT_IN_MANIFEST', String(capabilityId));
  }
  if (found.length > 1) throw new ManifestError('CAPABILITY_ID_DUPLICATE', capabilityId);
  return found[0];
}

/** Capabilities a given mode is responsible for. */
function selectForMode(mode, caps) {
  const classes = MODES[mode];
  if (!classes) throw new ManifestError('MODE_UNKNOWN', String(mode));
  return (caps || CAPABILITIES).filter((c) => classes.indexOf(c.probeClass) !== -1);
}

module.exports = {
  DELIVERY_CLASSES,
  TARGET_STATES,
  OBSERVED_STATES,
  VERDICTS,
  PROBE_CLASSES,
  MODES,
  CAPABILITIES,
  ManifestError,
  canonicalJson,
  digest,
  contractFor,
  contractDigest,
  validateManifest,
  validateProbeDefinition,
  capability,
  selectForMode,
};

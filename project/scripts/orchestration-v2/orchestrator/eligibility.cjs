'use strict';
/**
 * Program live-execution eligibility — the derivation, not the decision.
 *
 * The owner's correction, verbatim in intent: a manifest is not made ELIGIBLE
 * by hand. programs.manifest.json declares itself "DERIVED / NON-AUTHORITATIVE"
 * and it means it. Editing that field to open a program would be authoring
 * authority in the one file that exists to report authority, and nothing
 * downstream could tell the difference between a derivation and a typo.
 *
 * So eligibility has TWO inputs and one rule:
 *
 *   PROGRAM-ELIGIBILITY-AUTHORITY.md   the owner's decision, with the exact
 *                                      excerpt and digest that prove it
 *   programs.manifest.json             the program's own governance state
 *
 *   A program is ELIGIBLE only if the authority names it AND its own
 *   governance does not deny it. Either alone leaves it DENIED.
 *
 * The conjunction is the interesting half. An owner can open a program for
 * orchestrated execution without thereby authorizing every task inside it: a
 * program whose own charter says IMPLEMENTATION NOT AUTHORIZED stays DENIED
 * even when the envelope names it, because the envelope grants a lane, not a
 * mandate. That is what stops "OFFICE is open" from being read as "anything
 * under OFFICE may now run".
 */

const crypto = require('crypto');

/** Eligibility is three-valued; UNKNOWN is not a synonym for DENIED. */
const ELIGIBILITY = ['ELIGIBLE', 'DENIED', 'UNKNOWN'];

/**
 * Governance states that block eligibility no matter what the envelope says.
 *
 * OWNER_GATED is deliberately NOT here. A gated program is one whose next unit
 * needs owner selection — which is exactly the situation a standing grant
 * exists to serve, and treating it as a denial would make the standing grant
 * model unreachable. NOT_AUTHORIZED is a denial; awaiting selection is not.
 */
const BLOCKING_AUTHORIZATION_STATES = ['NOT_AUTHORIZED'];

class EligibilityError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'EligibilityError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new EligibilityError(code, detail);
}

function sha256(text) {
  return crypto.createHash('sha256').update(text, 'utf8').digest('hex');
}

/**
 * Verify the authority record against the repository before believing a word of
 * it.
 *
 * The record cites an excerpt from the parent authorization envelope and the
 * digest of that excerpt. Both are checked against the file as it actually is,
 * because a governance record that cites itself is the failure mode this whole
 * layer was built to prevent — a self-authored document claiming owner approval
 * is never evidence of owner approval.
 *
 * @param {object} opts
 * @param {object} opts.authority     the parsed authority record
 * @param {function} opts.readFile    (relPath) => string
 */
function verifyAuthorityRecord(opts) {
  const a = opts.authority;
  if (!a || typeof a !== 'object') fail('ELIGIBILITY_AUTHORITY_MISSING');
  if (a.schemaVersion !== 1) fail('ELIGIBILITY_AUTHORITY_SCHEMA_UNKNOWN', String(a.schemaVersion));
  if (!a.authorizationId) fail('ELIGIBILITY_AUTHORITY_ID_MISSING');

  const ev = a.ownerDecisionEvidence;
  if (!ev || !ev.sourcePath || !ev.exactExcerpt || !ev.excerptSha256) {
    fail('ELIGIBILITY_EVIDENCE_INCOMPLETE', a.authorizationId);
  }
  // The record must not be its own evidence.
  if (ev.sourcePath.indexOf('PROGRAM-ELIGIBILITY-AUTHORITY') !== -1) {
    fail('ELIGIBILITY_EVIDENCE_SELF_REFERENTIAL', ev.sourcePath);
  }
  if (sha256(ev.exactExcerpt) !== ev.excerptSha256) {
    fail('ELIGIBILITY_EXCERPT_DIGEST_MISMATCH', ev.sourcePath);
  }

  const source = opts.readFile(ev.sourcePath);
  if (typeof source !== 'string' || source.indexOf(ev.exactExcerpt) === -1) {
    fail('ELIGIBILITY_EXCERPT_NOT_FOUND', ev.sourcePath);
  }

  if (!Array.isArray(a.eligiblePrograms)) fail('ELIGIBILITY_PROGRAM_LIST_INVALID');
  for (const p of a.eligiblePrograms) {
    if (!p || typeof p.programId !== 'string' || !p.programId) fail('ELIGIBILITY_PROGRAM_ENTRY_INVALID');
    if (typeof p.standingGrantRef !== 'string' || !p.standingGrantRef) {
      // An eligible program with no standing grant is an open door with no
      // frame: nothing would bound what runs inside it.
      fail('ELIGIBILITY_PROGRAM_WITHOUT_GRANT', p.programId);
    }
  }
  return { verified: true, authorizationId: a.authorizationId, at: ev.sourcePath };
}

/**
 * Derive one program's eligibility. Pure — no I/O, no dates, no defaults that
 * open anything.
 *
 * @returns {{programId, eligibility, reason, authorityRef, standingGrantRef}}
 */
function deriveForProgram(program, authority) {
  const id = program.programId;
  const named = (authority.eligiblePrograms || []).filter((p) => p.programId === id)[0] || null;

  if (!named) {
    return {
      programId: id,
      eligibility: 'DENIED',
      reason: 'NOT_NAMED_BY_AUTHORITY',
      authorityRef: authority.authorizationId,
      standingGrantRef: null,
    };
  }
  if (BLOCKING_AUTHORIZATION_STATES.indexOf(program.authorizationState) !== -1) {
    // The envelope grants a lane, not a mandate. A program whose own governance
    // says NOT AUTHORIZED is not opened by being named.
    return {
      programId: id,
      eligibility: 'DENIED',
      reason: 'PROGRAM_GOVERNANCE_' + program.authorizationState,
      authorityRef: authority.authorizationId,
      standingGrantRef: named.standingGrantRef,
    };
  }
  if (program.taxonomyLevel !== 'PROGRAM') {
    // An unresolved taxonomy is not a denial and not an approval. Reporting
    // UNKNOWN keeps the open question visible instead of resolving it by
    // omission — which the manifest's own §SS9 says must not happen here.
    return {
      programId: id,
      eligibility: 'UNKNOWN',
      reason: 'TAXONOMY_UNRESOLVED',
      authorityRef: authority.authorizationId,
      standingGrantRef: named.standingGrantRef,
    };
  }
  return {
    programId: id,
    eligibility: 'ELIGIBLE',
    reason: 'AUTHORITY_NAMES_PROGRAM_AND_GOVERNANCE_PERMITS',
    authorityRef: authority.authorizationId,
    standingGrantRef: named.standingGrantRef,
  };
}

/**
 * Derive the whole manifest's eligibility column.
 *
 * Returns a NEW manifest rather than mutating: the caller writes it, and a
 * diff against the committed file is then a readable record of what changed and
 * why — which is the property hand-editing destroys.
 */
function deriveManifest(opts) {
  const manifest = opts.manifest;
  const authority = opts.authority;
  verifyAuthorityRecord({ authority, readFile: opts.readFile });

  const decisions = [];
  const programs = (manifest.programs || []).map((p) => {
    const d = deriveForProgram(p, authority);
    decisions.push(d);
    return Object.assign({}, p, {
      liveExecutionEligibility: d.eligibility,
      liveExecutionEligibilityDerivation: {
        reason: d.reason,
        authorityRef: d.authorityRef,
        standingGrantRef: d.standingGrantRef,
      },
    });
  });

  // Every program the authority names must exist in the manifest. An authority
  // naming a program nobody has heard of is a typo that would otherwise be
  // silently ineffective — the quiet failure mode, where the owner believes a
  // program is open and nothing ever opens it.
  for (const p of authority.eligiblePrograms || []) {
    if (!programs.some((m) => m.programId === p.programId)) {
      fail('ELIGIBILITY_AUTHORITY_NAMES_UNKNOWN_PROGRAM', p.programId);
    }
  }

  return {
    manifest: Object.assign({}, manifest, {
      authority: 'DERIVED / NON-AUTHORITATIVE',
      eligibilityDerivedFrom: {
        authorizationId: authority.authorizationId,
        sourcePath: opts.authorityPath || null,
      },
      programs,
    }),
    decisions,
  };
}

module.exports = {
  ELIGIBILITY,
  BLOCKING_AUTHORIZATION_STATES,
  EligibilityError,
  sha256,
  verifyAuthorityRecord,
  deriveForProgram,
  deriveManifest,
};

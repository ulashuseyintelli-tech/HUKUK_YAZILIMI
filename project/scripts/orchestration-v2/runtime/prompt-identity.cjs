'use strict';
/**
 * Who the executor is working for, derived rather than written down.
 *
 * A prompt file is a shared artefact: it outlives the revision it was written
 * for, gets pointed at by the next plan, and nobody re-reads its first line.
 * The canary prompt still opened with
 *
 *     GOREV: CANARY-OFFICE-ENCRYPTION-CHARACTERIZATION-R01
 *
 * three revisions after R01, while the plan, the grant, the request and the
 * queue entry all said R03. The executor read both, believed the prose over the
 * machinery, and cited the mismatch as part of its refusal:
 *
 *     Kullanici gorevi R01; mevcut PR R03. Cakisma izni varsayilmadi.
 *
 * It was right to. Two sources disagreed about what it had been asked to do,
 * and neither of them was obviously authoritative.
 *
 * The fix is not to correct that line. It is to make the line impossible: the
 * identity block is composed from the runtime record at dispatch time, and a
 * prompt body that DECLARES an identity of its own is refused rather than
 * silently overridden. Prose may still discuss other tasks — supersession,
 * history, cross-references — because discussing a task is not claiming to be
 * one.
 */

class PromptIdentityError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'PromptIdentityError';
    this.code = code;
    this.detail = detail || null;
  }
}

/**
 * Lines that ASSIGN a task identity, in the spellings this repository uses.
 *
 * Anchored to the start of a line and to a colon, so a sentence that merely
 * names a task does not trip it. `GOREV` and `GÖREV` are both present because
 * the repository writes Turkish with and without diacritics.
 */
const DECLARATION = /^[ \t]*(GOREV|GÖREV|TASK|TASK ID|TASKID)[ \t]*:[ \t]*(\S+)/gim;

/** The shape of a task id here: FOO-BAR-R01, CLIENT-P2-U03-TRACK-B-I03. */
const TASK_ID = /^[A-Z][A-Z0-9]*(?:-[A-Z0-9]+)*-[RI]\d{2}$/;

/**
 * Every identity declaration a prompt body makes.
 *
 * Returned rather than asserted so a caller can report them all at once; being
 * told about the first of three is how a second round-trip gets earned.
 */
function declaredIdentities(body) {
  const out = [];
  const re = new RegExp(DECLARATION.source, DECLARATION.flags);
  let m;
  while ((m = re.exec(String(body || ''))) !== null) {
    const value = m[2].replace(/[.,;]+$/, '');
    if (TASK_ID.test(value)) out.push(value);
  }
  return out;
}

/**
 * Refuse a prompt whose body claims to be a task other than the one running.
 *
 * A body that declares the CORRECT id is allowed but pointless, and it is left
 * alone rather than rewritten: rewriting an authorized artefact to match what
 * the runtime already knows is a second source of truth wearing a disguise.
 */
function assertIdentityConsistent(body, taskId) {
  const declared = declaredIdentities(body);
  const wrong = declared.filter((d) => d !== taskId);
  if (wrong.length) {
    throw new PromptIdentityError(
      'PROMPT_TASK_IDENTITY_CONFLICT',
      'prompt declares ' + wrong.join(', ') + ' but the task is ' + taskId,
    );
  }
  return declared;
}

/**
 * The identity block, built from the runtime record.
 *
 * Fields with no authoritative value are OMITTED, never filled with a
 * placeholder. An executor that reads `attempt: unknown` learns something true;
 * one that reads `attempt: 1` on the fourth attempt has been lied to.
 */
function identityBlock(o) {
  const lines = ['=== TASK IDENTITY (authoritative, derived at dispatch) ==='];
  const put = (label, value) => {
    if (value === undefined || value === null || value === '') return;
    lines.push('  ' + label.padEnd(14) + ': ' + value);
  };
  put('TASK ID', o.taskId);
  put('PROGRAM', o.programId);
  put('ATTEMPT', o.attempt == null ? undefined : String(o.attempt));
  put('EXECUTOR LANE', o.lane);
  put('PLAN HASH', o.taskSpecSha256);
  if (Array.isArray(o.targetPaths) && o.targetPaths.length) {
    lines.push('  TARGET PATHS  :');
    for (const p of o.targetPaths) lines.push('    ' + p);
  }
  lines.push(
    '',
    'This block comes from the queue and plan records, not from prose. Where the',
    'text below disagrees with it, this block is correct.',
    '=========================================================',
    '',
  );
  return lines.join('\n');
}

/**
 * Identity block + body, with the conflict check applied first.
 *
 * The check runs BEFORE composition on purpose: a conflicting prompt must not
 * be delivered with a contradicting header stapled to it and the disagreement
 * left for the executor to adjudicate. That is the situation this module
 * exists to end.
 */
function composePrompt(o) {
  const body = String(o.body == null ? '' : o.body);
  assertIdentityConsistent(body, o.taskId);
  return identityBlock(o) + body;
}

module.exports = {
  PromptIdentityError,
  declaredIdentities,
  assertIdentityConsistent,
  identityBlock,
  composePrompt,
};

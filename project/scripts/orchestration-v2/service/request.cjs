'use strict';
/**
 * Task request — what an owner hands the orchestrator.
 *
 * Until now there was no such thing. A task was a `pnpm orch:run --plan X
 * --grant Y --prompt Z` invocation: three loose files, resolved by whoever
 * typed the command, validated by nothing before an executor started. That is
 * why the queue had no producer — there was no object to enqueue.
 *
 * A request is that object. It names the work, points at its authority, and is
 * resolvable to everything admission needs WITHOUT running anything. Resolving
 * it is pure file reading, so a bad request fails at the desk rather than in
 * the middle of a run.
 *
 * Deliberately NOT a plan. The plan (task.v1.json) stays the immutable pinned
 * artefact it always was; a request points at one and adds the operational
 * facts the plan has no field for — which standing grant covers it, which lane
 * runs it, what it waits on.
 *
 * Secrets never appear here. A request is committed, quoted in audit records
 * and passed between processes; anything in it should be safe on a screen.
 */

const fs = require('fs');
const path = require('path');

const authority = require('../orchestrator/authority.cjs');

/** Fields every request must carry. Anything absent is a refusal, not a default. */
const REQUIRED = ['programId', 'taskId', 'taskClass', 'planPath', 'standingGrantPath'];

/**
 * Keys that must never appear. Not an exhaustive secret scanner — a blunt
 * refusal for the shapes someone actually reaches for when in a hurry.
 */
const FORBIDDEN_KEYS = ['token', 'password', 'secret', 'apiKey', 'api_key', 'credential', 'privateKey'];

class RequestError extends Error {
  constructor(code, detail) {
    super(code + (detail ? ': ' + detail : ''));
    this.name = 'RequestError';
    this.code = code;
    this.detail = detail || null;
  }
}

function fail(code, detail) {
  throw new RequestError(code, detail);
}

function scanForSecrets(obj, trail) {
  if (!obj || typeof obj !== 'object') return;
  for (const k of Object.keys(obj)) {
    const here = (trail ? trail + '.' : '') + k;
    if (FORBIDDEN_KEYS.some((f) => k.toLowerCase().indexOf(f.toLowerCase()) !== -1)) {
      fail('REQUEST_CONTAINS_CREDENTIAL_FIELD', here);
    }
    scanForSecrets(obj[k], here);
  }
}

/**
 * Read and shape-check a request file. No authority resolution yet — that is
 * resolve(), and keeping them apart means a malformed file reports a malformed
 * file rather than a missing grant.
 */
function parse(text, sourcePath) {
  let req;
  try {
    req = JSON.parse(text);
  } catch (e) {
    fail('REQUEST_JSON_INVALID', (sourcePath || '') + ' :: ' + e.message);
  }
  if (!req || typeof req !== 'object' || Array.isArray(req)) fail('REQUEST_NOT_AN_OBJECT', sourcePath);
  if (req.schemaVersion !== 1) fail('REQUEST_SCHEMA_UNKNOWN', String(req.schemaVersion));
  for (const f of REQUIRED) {
    if (typeof req[f] !== 'string' || !req[f]) fail('REQUEST_FIELD_MISSING', f);
  }
  scanForSecrets(req, '');

  if (req.dependsOn !== undefined && !Array.isArray(req.dependsOn)) fail('REQUEST_DEPENDS_ON_INVALID', 'must be an array');
  if (req.priority !== undefined && !Number.isFinite(req.priority)) fail('REQUEST_PRIORITY_INVALID', String(req.priority));

  return {
    schemaVersion: 1,
    programId: req.programId,
    taskId: req.taskId,
    taskClass: req.taskClass,
    planPath: req.planPath,
    standingGrantPath: req.standingGrantPath,
    // Optional. A task-scoped grant stands BESIDE the standing grant when the
    // work needs one; it never substitutes for it.
    grantPath: req.grantPath || null,
    promptPath: req.promptPath || null,
    executorLane: req.executorLane || 'CLAUDE_LOCAL',
    priority: req.priority === undefined ? 100 : req.priority,
    dependsOn: (req.dependsOn || []).slice(),
    targetBranch: req.targetBranch || 'main',
    autoMerge: req.autoMerge === true,
    notes: req.notes || null,
    sourcePath: sourcePath || null,
  };
}

function readJson(repoCwd, rel, label) {
  const p = path.isAbsolute(rel) ? rel : path.join(repoCwd, rel);
  let text;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch (e) {
    fail('REQUEST_' + label + '_UNREADABLE', rel);
  }
  try {
    return JSON.parse(text);
  } catch (e) {
    fail('REQUEST_' + label + '_JSON_INVALID', rel + ' :: ' + e.message);
  }
}

/**
 * Turn a request into everything admission needs.
 *
 * Reads only; performs no validation of its own beyond "the files exist and
 * parse". The judging is admission's job, and keeping resolution dumb is what
 * lets the same resolver run at enqueue time and again at dispatch time and
 * produce the same inputs both times.
 *
 * @returns {{request, spec, standingGrant, grant, manifest, taskSpecSha256}}
 */
function resolve(opts) {
  const repoCwd = opts.repoCwd;
  const request = opts.request;

  const spec = readJson(repoCwd, request.planPath, 'PLAN');
  const standingGrant = readJson(repoCwd, request.standingGrantPath, 'STANDING_GRANT');
  const grant = request.grantPath ? readJson(repoCwd, request.grantPath, 'GRANT') : null;
  const manifest = readJson(repoCwd, 'project/docs/governance/coordination-v2/programs.manifest.json', 'MANIFEST');

  // The plan says who it is; the request must agree. A request pointing at
  // someone else's plan is the substitution the identity check exists to catch.
  if (spec.taskId && spec.taskId !== request.taskId) {
    fail('REQUEST_TASK_ID_MISMATCH', request.taskId + ' != plan ' + spec.taskId);
  }
  const grantProgram = standingGrant.program && standingGrant.program.programId;
  if (grantProgram && grantProgram !== request.programId) {
    fail('REQUEST_PROGRAM_MISMATCH', request.programId + ' != grant ' + grantProgram);
  }

  return {
    request,
    spec,
    standingGrant,
    grant,
    manifest,
    // The identity the queue deduplicates on and the merge gate later pins.
    taskSpecSha256: authority.digest(spec),
  };
}

function load(opts) {
  const repoCwd = opts.repoCwd;
  const p = path.isAbsolute(opts.requestPath) ? opts.requestPath : path.join(repoCwd, opts.requestPath);
  let text;
  try {
    text = fs.readFileSync(p, 'utf8');
  } catch (e) {
    fail('REQUEST_UNREADABLE', opts.requestPath);
  }
  return resolve({ repoCwd, request: parse(text, opts.requestPath) });
}

module.exports = { REQUIRED, FORBIDDEN_KEYS, RequestError, parse, resolve, load };

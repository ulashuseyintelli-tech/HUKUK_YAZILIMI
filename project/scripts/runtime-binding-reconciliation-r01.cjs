#!/usr/bin/env node
'use strict';

/**
 * REPOSITORY-WIDE RUNTIME BINDING, ACTIVATION AND OPERABILITY
 * RECONCILIATION PROGRAM — R01
 *
 * Static evidence collector. It intentionally does not import application
 * modules, read secrets, connect to a database, start a server, or mutate
 * runtime state. Dynamic L6 evidence is consumed only from an explicit
 * delivery-evidence JSON file produced by the shipped public-entrypoint
 * verifier.
 */

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createHash } = require('node:crypto');

const MAX_GIT_OUTPUT_BYTES = 16 * 1024 * 1024;
const HTTP_DECORATORS = new Set([
  'Get',
  'Post',
  'Put',
  'Patch',
  'Delete',
  'Options',
  'Head',
  'All',
]);
const CLASS_SUFFIXES = [
  'Service',
  'Guard',
  'Interceptor',
  'Middleware',
  'Resolver',
  'Handler',
  'Processor',
];
const FINAL_STATUSES = new Set([
  'ABSENT',
  'PARTIAL_IMPLEMENTATION',
  'CODE_PRESENT_UNBOUND',
  'BOUND_DORMANT',
  'ACTIVE_UNREACHABLE',
  'REACHABLE_NON_OPERABLE',
  'OPERABLE_UNVERIFIED',
  'VERIFIED_OPERATIONAL',
  'SUPERSEDED',
  'INTENTIONALLY_DORMANT',
  'LEGACY_ORPHAN',
  'UNKNOWN_REQUIRES_EVIDENCE',
]);
const HISTORICAL_CLOSED = new Set([
  'CLOSED',
  'PASS',
]);
const CLOSURE_MAPPING_EVIDENCE_LEVELS = new Set([
  'EXACT_CAPABILITY_REF',
  'EXACT_PACKAGE_SCRIPT_KEY',
  'DIRECT_IMPLEMENTATION_FILE',
  'BROAD_FILE_TOUCH',
  'UNMAPPED',
]);
const CLOSURE_CERTIFICATION_STATUSES = new Set([
  'CLOSED_OPERATIONAL_CONFIRMED',
  'CLOSED_STATICALLY_BOUND_UNVERIFIED',
  'CLOSED_BINDING_DEFECT',
  'CLOSED_ACTIVATION_DEFECT',
  'CLOSED_REACHABILITY_DEFECT',
  'CLOSED_OPERABILITY_DEFECT',
  'CLOSED_EVIDENCE_INSUFFICIENT',
  'CLOSED_SUPERSEDED',
  'NOT_HISTORICALLY_CLOSED',
]);
const RELIABLE_CLOSURE_CONFIDENCE = new Set(['HIGH', 'MEDIUM']);
const SUFFICIENT_CLOSURE_MAPPING = new Set([
  'EXACT_CAPABILITY_REF',
  'EXACT_PACKAGE_SCRIPT_KEY',
  'DIRECT_IMPLEMENTATION_FILE',
]);
const SEALED_R01_AUDIT_DIRECTORY = 'project/docs/audit/runtime-binding-reconciliation-r01';
const DEFAULT_DISPOSITION_FILE =
  'project/docs/audit/runtime-binding-reconciliation-r01-t13/capability-disposition-registry.json';
const SUCCESSOR_PROGRAM = 'RUNTIME-OPERABILITY-CERTIFICATION-R01';
const SUCCESSOR_TASK = 'W0-METHODOLOGY';
const SNAPSHOT_BOUNDARY = [
  'This successor methodology does not mutate or retroactively rewrite',
  'PR #1795 sealed audit artifacts.',
  '',
  'It re-evaluates closure certification using the current canonical',
  'repository snapshot and the corrected methodology.',
].join('\n');

function parseArgs(argv) {
  const out = {
    outDir: null,
    auditStartedAt: null,
    dynamicEvidence: null,
    auditBaseSha: null,
    dispositionFile: DEFAULT_DISPOSITION_FILE,
    successorOnly: false,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out-dir') out.outDir = argv[++index];
    else if (arg === '--audit-started-at') out.auditStartedAt = argv[++index];
    else if (arg === '--dynamic-evidence') out.dynamicEvidence = argv[++index];
    else if (arg === '--audit-base-sha') out.auditBaseSha = argv[++index];
    else if (arg === '--disposition-file') out.dispositionFile = argv[++index];
    else if (arg === '--successor-only') out.successorOnly = true;
    else if (arg === '--help') {
      process.stdout.write(
        [
          'Usage:',
          '  node scripts/runtime-binding-reconciliation-r01.cjs',
          '    --out-dir <repo-relative-directory>',
          '    --audit-started-at <ISO-8601>',
          '    [--audit-base-sha <commit>]',
          '    [--dynamic-evidence <repo-relative-json>]',
          `    [--disposition-file <repo-relative-json>] (default: ${DEFAULT_DISPOSITION_FILE})`,
          '    [--successor-only]',
          '',
        ].join('\n'),
      );
      process.exit(0);
    } else {
      throw new Error(`UNKNOWN_ARGUMENT: ${arg}`);
    }
  }
  if (!out.outDir) throw new Error('OUT_DIR_REQUIRED');
  if (!out.auditStartedAt || Number.isNaN(Date.parse(out.auditStartedAt))) {
    throw new Error('VALID_AUDIT_STARTED_AT_REQUIRED');
  }
  return out;
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: options.maxBuffer ?? MAX_GIT_OUTPUT_BYTES,
    env: options.env ?? process.env,
  });
  if (result.error) {
    const code = result.error.code || result.error.name || 'SPAWN_FAILED';
    throw new Error(`${code}: ${command}`);
  }
  if (result.signal) throw new Error(`PROCESS_SIGNALLED: ${command} ${result.signal}`);
  if (result.status !== 0 && !options.allowFailure) {
    const detail = String(result.stderr || result.stdout || '').slice(0, 4096);
    throw new Error(`PROCESS_FAILED: ${command} ${args.join(' ')}\n${detail}`);
  }
  return {
    status: result.status,
    stdout: String(result.stdout || ''),
    stderr: String(result.stderr || ''),
  };
}

function git(repoRoot, ...args) {
  return run('git', args, { cwd: repoRoot }).stdout.trim();
}

function normalize(value) {
  return value.replaceAll('\\', '/');
}

function relative(repoRoot, absolute) {
  return normalize(path.relative(repoRoot, absolute));
}

function sha256(value) {
  return createHash('sha256').update(value).digest('hex');
}

function walk(directory, predicate) {
  const output = [];
  if (!fs.existsSync(directory)) return output;
  const stack = [directory];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true })
      .sort((a, b) => b.name.localeCompare(a.name));
    for (const entry of entries) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') {
        continue;
      }
      const target = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(target);
      else if (predicate(target)) output.push(target);
    }
  }
  return output.sort((a, b) => normalize(a).localeCompare(normalize(b)));
}

function lineAt(text, offset) {
  let line = 1;
  for (let index = 0; index < offset; index += 1) {
    if (text.charCodeAt(index) === 10) line += 1;
  }
  return line;
}

function findBalanced(text, start, open, close) {
  if (text[start] !== open) return null;
  let depth = 0;
  let quote = null;
  let escaped = false;
  let lineComment = false;
  let blockComment = false;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    const next = text[index + 1];
    if (lineComment) {
      if (char === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      if (char === '*' && next === '/') {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (quote) {
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '/' && next === '/') {
      lineComment = true;
      index += 1;
      continue;
    }
    if (char === '/' && next === '*') {
      blockComment = true;
      index += 1;
      continue;
    }
    if (char === '"' || char === "'" || char === '`') {
      quote = char;
      continue;
    }
    if (char === open) depth += 1;
    else if (char === close) {
      depth -= 1;
      if (depth === 0) return { start, end: index, text: text.slice(start + 1, index) };
    }
  }
  return null;
}

/**
 * Replace comments and string/template literals with whitespace while keeping
 * source offsets and line numbers stable. Static capability extraction must
 * inspect syntax, not documentation or literal examples.
 */
function maskNonCode(source) {
  const chars = source.split('');
  let state = 'CODE';
  let quote = null;
  let escaped = false;

  const mask = (index) => {
    if (chars[index] !== '\n' && chars[index] !== '\r') chars[index] = ' ';
  };

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    const next = source[index + 1];

    if (state === 'LINE_COMMENT') {
      if (char === '\n') state = 'CODE';
      else mask(index);
      continue;
    }
    if (state === 'BLOCK_COMMENT') {
      if (char === '*' && next === '/') {
        mask(index);
        mask(index + 1);
        index += 1;
        state = 'CODE';
      } else {
        mask(index);
      }
      continue;
    }
    if (state === 'STRING') {
      mask(index);
      if (escaped) escaped = false;
      else if (char === '\\') escaped = true;
      else if (char === quote) {
        quote = null;
        state = 'CODE';
      }
      continue;
    }

    if (char === '/' && next === '/') {
      mask(index);
      mask(index + 1);
      index += 1;
      state = 'LINE_COMMENT';
    } else if (char === '/' && next === '*') {
      mask(index);
      mask(index + 1);
      index += 1;
      state = 'BLOCK_COMMENT';
    } else if (char === '"' || char === "'" || char === '`') {
      mask(index);
      quote = char;
      escaped = false;
      state = 'STRING';
    }
  }

  return chars.join('');
}

function extractRuntimeDecorators(source) {
  const code = maskNonCode(source);
  const decorators = [];
  for (const match of code.matchAll(/@(Cron|Interval|Timeout)\s*\(/g)) {
    const openingOffset = match.index + match[0].lastIndexOf('(');
    const balanced = findBalanced(source, openingOffset, '(', ')');
    if (!balanced) continue;
    decorators.push({
      name: match[1],
      start: match.index,
      end: balanced.end + 1,
      args: balanced.text,
    });
  }
  return decorators;
}

function extractRuntimeClassDeclarations(source) {
  const code = maskNonCode(source);
  const classes = [];
  for (const match of code.matchAll(
    /\b(?:(?:export|declare)\s+)*(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g,
  )) {
    const classKeyword = match[0].indexOf('class');
    const declarationPrefix = match[0].slice(0, classKeyword);
    const before = code.slice(0, match.index);
    if (/(?:=|:|,|\(|=>|\bnew|\breturn)\s*$/.test(before)) continue;
    if (/\bdeclare\b/.test(declarationPrefix)) continue;
    if (/\babstract\b/.test(declarationPrefix)) continue;
    classes.push({
      name: match[1],
      offset: match.index,
      line: lineAt(source, match.index),
    });
  }
  return classes;
}

function stringLiteral(value) {
  if (!value) return '';
  const match = /^\s*(['"`])([\s\S]*?)\1/.exec(value);
  return match ? match[2] : '';
}

function unique(values) {
  return [...new Set(values)].sort((a, b) => String(a).localeCompare(String(b)));
}

function symbols(value) {
  const matches = value.match(/\b[A-Z][A-Za-z0-9_$]*\b/g) || [];
  return unique(matches.filter((item) => ![
    'Module',
    'Type',
    'Promise',
    'Object',
    'String',
    'Boolean',
    'Number',
  ].includes(item)));
}

function extractNamedArray(moduleBody, field) {
  const match = new RegExp(`\\b${field}\\s*:`).exec(moduleBody);
  if (!match) return [];
  const bracket = moduleBody.indexOf('[', match.index + match[0].length);
  if (bracket === -1) return [];
  const balanced = findBalanced(moduleBody, bracket, '[', ']');
  return balanced ? symbols(balanced.text) : [];
}

function extractEnvConditions(text) {
  const conditions = [];
  const patterns = [
    /process\.env\.([A-Z][A-Z0-9_]*)/g,
    /process\.env\[['"]([A-Z][A-Z0-9_]*)['"]\]/g,
    /\b(?:config|configService)\.get(?:<[^>]+>)?\(\s*['"]([A-Z][A-Z0-9_]*)['"]/g,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) conditions.push(match[1]);
  }
  return unique(conditions);
}

function defaultOffConditions(text, conditions) {
  return conditions.filter((condition) => {
    const escaped = condition.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return [
      new RegExp(`process\\.env\\.${escaped}[\\s\\S]{0,180}===\\s*['"]true['"]`, 'i'),
      new RegExp(`get[^\\n]{0,80}['"]${escaped}['"][\\s\\S]{0,180}===\\s*['"]true['"]`, 'i'),
      new RegExp(`${escaped}[\\s\\S]{0,180}(?:default|fallback)[\\s\\S]{0,80}(?:false|off)`, 'i'),
    ].some((pattern) => pattern.test(text));
  });
}

function testFilesFor(sourceFile, allFiles) {
  const stem = path.basename(sourceFile)
    .replace(/\.(controller|service|guard|interceptor|middleware|resolver|handler|processor)?\.(ts|tsx|js|cjs)$/, '');
  if (!stem) return [];
  return allFiles
    .filter((file) => /(?:__tests__|\.spec\.|\.test\.)/.test(normalize(file)))
    .filter((file) => path.basename(file).includes(stem))
    .map((file) => normalize(file));
}

function classifyWorkstream(file, name = '') {
  const value = `${normalize(file).toLowerCase()} ${name.toLowerCase()}`;
  if (value.includes('/apps/web/') || value.includes('frontend')) return 'FRONTEND / UI ACTIVATION';
  if (value.includes('/scripts/orchestration-v2/') || value.includes('/docs/governance/')) {
    return 'GOVERNANCE / ORCHESTRATION';
  }
  if (/(\/modules\/(auth|tenant|permission-diagnostics|audit)\/|security)/.test(value)) {
    return 'AUTH / TENANT / SECURITY';
  }
  if (/(\/modules\/(office|staff|lawyer|user|reporting-line|office-approval)\b)/.test(value)) {
    return 'OFFICE / AVUKAT-PERSONEL';
  }
  if (/(\/modules\/(client|portal|client-)[^/]*)/.test(value)) return 'CLIENT / MÜVEKKİL';
  if (/(\/modules\/(debtor|debtor-scoring|address-|asset-query|legal-|case-debtor)[^/]*)/.test(value)) {
    return 'DEBTOR / BORÇLU';
  }
  if (/(\/modules\/(claim-item|claim-engine|interest-engine|fee-engine|case-balance|summary-engine|balance-)[^/]*)/.test(value)) {
    return 'RECEIVABLE / ALACAK';
  }
  if (/(\/modules\/(collection|payment-instruction|client-settlement)[^/]*)/.test(value)) {
    return 'COLLECTION / TAHSİLAT';
  }
  if (/(\/modules\/(uyap|uyap-export|icrabot|tebligat)[^/]*)/.test(value)) return 'UYAP CONNECTOR';
  return 'SHARED PLATFORM / INFRASTRUCTURE';
}

function severityFor(record) {
  // A security-adjacent name is not evidence of an exploitable production path.
  // P0 requires a separately verified live exposure and is therefore never
  // inferred by this static scanner.
  if (['CODE_PRESENT_UNBOUND', 'ACTIVE_UNREACHABLE', 'REACHABLE_NON_OPERABLE'].includes(record.finalStatus)) {
    if (record.entryPointType === 'HTTP' || record.entryPointType === 'UI') return 'P1';
    return 'P2';
  }
  if (['LEGACY_ORPHAN', 'SUPERSEDED'].includes(record.finalStatus)) return 'P3';
  if (record.finalStatus === 'BOUND_DORMANT') return 'P2';
  return 'NONE';
}

function recommendedAction(record) {
  if (record.finalStatus === 'VERIFIED_OPERATIONAL') return 'KEEP_AND_REVERIFY_ON_CHANGE';
  if (record.finalStatus === 'OPERABLE_UNVERIFIED') return 'ADD_REPRESENTATIVE_L6_VERIFICATION';
  if (record.finalStatus === 'CODE_PRESENT_UNBOUND') return 'OWNER_REVIEW_BIND_OR_DISPOSITION';
  if (record.finalStatus === 'BOUND_DORMANT') return 'VERIFY_ACTIVATION_AUTHORITY_AND_DEPLOYED_VALUE';
  if (record.finalStatus === 'ACTIVE_UNREACHABLE') return 'WIRE_REAL_ENTRYPOINT_OR_DISPOSITION';
  if (record.finalStatus === 'REACHABLE_NON_OPERABLE') return 'REPAIR_WITH_FOCUSED_RUNTIME_REGRESSION';
  if (record.finalStatus === 'INTENTIONALLY_DORMANT') return 'PRESERVE_DORMANT_CONTRACT';
  if (record.finalStatus === 'SUPERSEDED') return 'PRESERVE_HISTORY_AND_PLAN_SAFE_RETIREMENT';
  if (record.finalStatus === 'LEGACY_ORPHAN') return 'OWNER_GATED_LEGACY_DISPOSITION';
  return 'COLLECT_MISSING_EVIDENCE';
}

function finalStatusFor(input) {
  if (input.superseded) return 'SUPERSEDED';
  if (input.legacyOrphan) return 'LEGACY_ORPHAN';
  if (input.intentionallyDormant && !input.runtimeBound) return 'INTENTIONALLY_DORMANT';
  if (!input.runtimeBound) return 'CODE_PRESENT_UNBOUND';
  if (input.intentionallyDormant || input.defaultOff) return 'BOUND_DORMANT';
  if (input.active === false) return 'BOUND_DORMANT';
  if ((input.activationConditions || []).length > 0 && (input.active === null || input.active === undefined)) {
    return 'UNKNOWN_REQUIRES_EVIDENCE';
  }
  if (!input.reachable) return 'ACTIVE_UNREACHABLE';
  if (input.operable === false) return 'REACHABLE_NON_OPERABLE';
  if (input.independentlyVerified) return 'VERIFIED_OPERATIONAL';
  return 'OPERABLE_UNVERIFIED';
}

function history(repoRoot, scopes, ref = 'HEAD') {
  const args = [
    'log',
    ref,
    '--format=@@COMMIT%x1f%H%x1f%aI%x1f%s',
    '--name-only',
  ];
  if (scopes.length > 0) args.push('--', ...scopes);
  const output = run('git', args, { cwd: repoRoot, maxBuffer: MAX_GIT_OUTPUT_BYTES }).stdout;
  const commits = [];
  let current = null;
  for (const rawLine of output.split(/\r?\n/)) {
    if (rawLine.startsWith('@@COMMIT\x1f')) {
      const [, sha, authoredAt, subject] = rawLine.split('\x1f');
      current = { sha, authoredAt, subject, files: [] };
      commits.push(current);
    } else if (current && rawLine.trim()) {
      current.files.push(normalize(rawLine.trim()));
    }
  }
  const commitsByFile = new Map();
  for (const commit of commits) {
    for (const file of commit.files) {
      if (!commitsByFile.has(file)) commitsByFile.set(file, []);
      commitsByFile.get(file).push(commit);
    }
  }
  return { commits, commitsByFile };
}

function legacyHistoricalStatusForTitle(title, hasPullRequestReference = false) {
  if (/(?:\bclosure\b|\bcloseout\b|(?<![-\w])closed(?![-\w]))/i.test(title)) {
    return 'CLOSED';
  }
  if (/\bcanonical(?:ize|ization|ized)?\b/i.test(title)) return 'CANONICAL';
  return hasPullRequestReference ? 'MERGED' : 'IMPLEMENTED';
}

function closureCandidate(sourceRef, normalizedTitle, input) {
  return {
    sourceRef,
    normalizedTitle,
    claimType: input.claimType,
    matchedText: input.matchedText,
    parserRule: input.parserRule,
    confidence: input.confidence,
    disposition: input.disposition,
  };
}

function firstMatch(title, pattern) {
  const match = pattern.exec(title);
  return match ? match[0] : null;
}

function parseHistoricalClosureClaim(sourceRef, title) {
  const normalizedTitle = String(title || '').trim().replace(/\s+/g, ' ');
  if (!normalizedTitle) return null;

  const excludedRules = [
    {
      pattern: /\bfails?[- ]closed\b/i,
      claimType: 'FALSE_POSITIVE_FAIL_CLOSED',
      parserRule: 'EXCLUDE_BEHAVIORAL_FAIL_CLOSED',
    },
    {
      pattern: /\b(?:closed\s+by\s+default|default\s+closed)\b/i,
      claimType: 'FALSE_POSITIVE_DEFAULT_CLOSED',
      parserRule: 'EXCLUDE_DEFAULT_STATE_CLOSED',
    },
  ];
  for (const rule of excludedRules) {
    const matchedText = firstMatch(normalizedTitle, rule.pattern);
    if (matchedText) {
      return closureCandidate(sourceRef, normalizedTitle, {
        ...rule,
        matchedText,
        confidence: 'LOW',
        disposition: 'FALSE_POSITIVE',
      });
    }
  }

  const reliableRules = [
    {
      pattern: /\bFINAL\s+STATUS\s*:\s*CLOSED\b/i,
      claimType: 'FINAL_STATUS',
      parserRule: 'EXPLICIT_FINAL_STATUS_CLOSED',
      confidence: 'HIGH',
    },
    {
      pattern: /\bSTATUS\s*:\s*CLOSED\b/i,
      claimType: 'STATUS',
      parserRule: 'EXPLICIT_STATUS_CLOSED',
      confidence: 'HIGH',
    },
    {
      pattern: /\bCLOSED\s*\/\s*CANONICAL\s*\/\s*PASS\b/i,
      claimType: 'TERMINAL_STATUS_TRIPLE',
      parserRule: 'EXPLICIT_CLOSED_CANONICAL_PASS',
      confidence: 'HIGH',
    },
    {
      pattern: /\b(?:PROGRAM|TASK|WORKSTREAM|WAVE|PHASE|CHAIN)(?:\s+[A-Z0-9_.#/-]+){0,8}\s+CLOSED\b/i,
      claimType: 'SCOPED_TERMINAL_STATUS',
      parserRule: 'EXPLICIT_SCOPED_CLOSED',
      confidence: 'HIGH',
    },
    {
      pattern: /\b(?:CLOSEOUT\s+COMPLETED|FINAL\s+CLOSEOUT)\b/i,
      claimType: 'TERMINAL_CLOSEOUT',
      parserRule: 'EXPLICIT_TERMINAL_CLOSEOUT',
      confidence: 'HIGH',
    },
    {
      pattern: /\bFINAL\s+(?:(?:OWNER|PROGRAM|TASK|WORKSTREAM|TECHNICAL|GOVERNANCE)\s+)?CLOSURE\b/i,
      claimType: 'FINAL_CLOSURE',
      parserRule: 'EXPLICIT_FINAL_CLOSURE',
      confidence: 'HIGH',
    },
    {
      pattern: /\bFINAL\s+RECONCILIATION\s+AND\s+CLOSURE\b/i,
      claimType: 'FINAL_RECONCILIATION_CLOSURE',
      parserRule: 'EXPLICIT_FINAL_RECONCILIATION_CLOSURE',
      confidence: 'HIGH',
    },
    {
      pattern: /\b(?:record|reconcile|canonicalize|finalize|resolve|correct|move)\w*\b[^:]{0,120}\bclosure(?:\s+(?:evidence|result|status|record))?\b/i,
      claimType: 'CONTEXTUAL_CLOSURE_RECORD',
      parserRule: 'CONTEXTUAL_TERMINAL_RECORD',
      confidence: 'MEDIUM',
    },
    {
      pattern: /\b(?:governance|technical|implementation|program|phase)\s+closure\b/i,
      claimType: 'SCOPED_CLOSURE_RECORD',
      parserRule: 'SCOPED_CLOSURE_CONTEXT',
      confidence: 'MEDIUM',
    },
  ];
  for (const rule of reliableRules) {
    const matchedText = firstMatch(normalizedTitle, rule.pattern);
    if (matchedText) {
      if (
        /\b(?:request|authorize|authority|ready\s+for)\b[^:]{0,120}\bclosure\b/i.test(normalizedTitle) ||
        /\bclosure\s+(?:authority|gate|model|methodology|parser|semantics?|certification|concept|note|review)\b/i.test(normalizedTitle)
      ) {
        break;
      }
      return closureCandidate(sourceRef, normalizedTitle, {
        ...rule,
        matchedText,
        disposition: 'RELIABLE',
      });
    }
  }

  const namedCloseout = firstMatch(normalizedTitle, /\bcloseout\b/i);
  if (namedCloseout) {
    return closureCandidate(sourceRef, normalizedTitle, {
      claimType: 'FALSE_POSITIVE_CLOSEOUT_NAME',
      matchedText: namedCloseout,
      parserRule: 'EXCLUDE_UNSCOPED_CLOSEOUT_NAME',
      confidence: 'LOW',
      disposition: 'FALSE_POSITIVE',
    });
  }

  const technicalClosure = firstMatch(
    normalizedTitle,
    /\bclosure\s+(?:authority|gate|model|methodology|parser|semantics?|certification|concept|note|review)\b/i,
  );
  if (technicalClosure) {
    return closureCandidate(sourceRef, normalizedTitle, {
      claimType: 'FALSE_POSITIVE_TECHNICAL_CLOSURE',
      matchedText: technicalClosure,
      parserRule: 'EXCLUDE_TECHNICAL_CLOSURE_CONCEPT',
      confidence: 'LOW',
      disposition: 'FALSE_POSITIVE',
    });
  }

  const lowSignal = firstMatch(normalizedTitle, /(?:\bclosure\b|(?<![-\w])closed(?![-\w]))/i);
  if (lowSignal) {
    return closureCandidate(sourceRef, normalizedTitle, {
      claimType: 'LOW_CONTEXT_CLOSURE_TERM',
      matchedText: lowSignal,
      parserRule: 'LOW_CONTEXT_NOT_AUTO_CERTIFIABLE',
      confidence: 'LOW',
      disposition: 'LOW_CONFIDENCE_EXCLUDED',
    });
  }

  return null;
}

function historicalClaim(commit) {
  if (!commit) return null;
  const prMatch = /\(#(\d+)\)\s*$/.exec(commit.subject);
  const sourceRef = `git:${commit.sha}`;
  return {
    historicalWorkId: `HIST-${commit.sha.slice(0, 12).toUpperCase()}`,
    title: commit.subject,
    sourceRefs: [sourceRef],
    prNumbers: prMatch ? [Number(prMatch[1])] : [],
    mergeShas: [commit.sha],
    originalStatus: legacyHistoricalStatusForTitle(commit.subject, Boolean(prMatch)),
    closureClaim: parseHistoricalClosureClaim(sourceRef, commit.subject),
    expectedEntryPoints: [],
    expectedConsumers: [],
    expectedActivationConditions: [],
    claimedCapabilities: [],
    authoredAt: commit.authoredAt,
    changedFiles: [...commit.files],
  };
}

function makeRecord(input) {
  const record = {
    capabilityId: input.capabilityId,
    module: input.module,
    name: input.name,
    historicalWorkRefs: unique(input.historicalWorkRefs || []),
    implementationFiles: unique(input.implementationFiles || []),
    testFiles: unique(input.testFiles || []),
    entryPointType: input.entryPointType,
    expectedEntryPoints: unique(input.expectedEntryPoints || []),
    actualEntryPoints: unique(input.actualEntryPoints || []),
    providers: unique(input.providers || []),
    consumers: unique(input.consumers || []),
    producers: unique(input.producers || []),
    registrationSites: unique(input.registrationSites || []),
    activationConditions: unique(input.activationConditions || []),
    activationEvidence: {
      conditionDefined: input.activationConditions?.length > 0,
      conditionLoaded: input.activationConditions?.length > 0,
      conditionSatisfied: input.active === true
        ? true
        : input.activationConditions?.length > 0 ? null : true,
      conditionVerified: input.activationVerified === true,
    },
    codePresent: true,
    runtimeBound: Boolean(input.runtimeBound),
    active: !input.runtimeBound
      ? false
      : input.active === null || input.active === undefined ? null : Boolean(input.active),
    reachable: Boolean(input.reachable),
    consumerCount: input.consumerCount || 0,
    productionReachable: Boolean(input.reachable),
    productionActive: !input.runtimeBound
      ? false
      : input.active === null || input.active === undefined ? null : Boolean(input.active),
    operationalConsumer: input.operationalConsumer === undefined
      ? (input.consumerCount || 0)
      : input.operationalConsumer,
    operable: input.operable === null || input.operable === undefined ? null : Boolean(input.operable),
    independentlyVerified: Boolean(input.independentlyVerified),
    verificationLevel: input.verificationLevel || (input.runtimeBound ? 'L2' : 'L0'),
    staticStatus: input.staticStatus || (input.runtimeBound ? 'RUNTIME_REGISTRATION_CONFIRMED' : 'UNBOUND'),
    dynamicStatus: input.dynamicStatus || 'NOT_RUN',
    finalStatus: input.finalStatus,
    severity: input.severity || 'NONE',
    breakpoint: input.breakpoint || '',
    evidenceRefs: unique(input.evidenceRefs || []),
    blockers: unique(input.blockers || []),
    recommendedAction: input.recommendedAction || '',
    disposition: input.disposition || null,
    ownerDecisionRef: input.ownerDecisionRef || null,
    ownerDisposition: input.ownerDisposition || null,
    activationAuthority: input.activationAuthority || null,
    defect: input.defect === undefined ? null : Boolean(input.defect),
    remediationRequired: input.remediationRequired === undefined
      ? null
      : Boolean(input.remediationRequired),
    reopenCondition: input.reopenCondition || null,
  };
  if (!FINAL_STATUSES.has(record.finalStatus)) {
    throw new Error(`INVALID_FINAL_STATUS: ${record.capabilityId} ${record.finalStatus}`);
  }
  return record;
}

function csvCell(value) {
  const text = Array.isArray(value) ? value.join(' | ') : value === null ? '' : String(value);
  return `"${text.replaceAll('"', '""')}"`;
}

function markdownCell(value) {
  const text = Array.isArray(value) ? value.join('<br>') : value === null ? '' : String(value);
  return text.replaceAll('|', '\\|').replace(/\r?\n/g, '<br>');
}

function dispositionFingerprint(record) {
  return sha256(JSON.stringify({
    capabilityId: record.capabilityId,
    name: record.name,
    entryPointType: record.entryPointType,
    expectedEntryPoints: record.expectedEntryPoints,
    implementationFiles: record.implementationFiles,
  }));
}

function validateDispositionRegistryShape(registry) {
  if (!registry || registry.schemaVersion !== 1 ||
    registry.kind !== 'RUNTIME_CAPABILITY_DISPOSITION_REGISTRY') {
    throw new Error('DISPOSITION_REGISTRY_SCHEMA_INVALID');
  }
  if (!registry.sourceCommitSha || !/^[0-9a-f]{40}$/i.test(registry.sourceCommitSha)) {
    throw new Error('DISPOSITION_REGISTRY_SOURCE_SHA_INVALID');
  }
  if (!Array.isArray(registry.requiredCapabilityIds) || registry.requiredCapabilityIds.length === 0) {
    throw new Error('DISPOSITION_REGISTRY_REQUIRED_IDS_MISSING');
  }
  if (!Array.isArray(registry.entries) || registry.entries.length !== registry.requiredCapabilityIds.length) {
    throw new Error('DISPOSITION_REGISTRY_ENTRY_COUNT_MISMATCH');
  }
  const requiredIds = new Set(registry.requiredCapabilityIds);
  if (requiredIds.size !== registry.requiredCapabilityIds.length) {
    throw new Error('DISPOSITION_REGISTRY_DUPLICATE_REQUIRED_ID');
  }
  const seen = new Set();
  for (const entry of registry.entries) {
    if (!entry || typeof entry !== 'object' || typeof entry.capabilityId !== 'string') {
      throw new Error('DISPOSITION_REGISTRY_ENTRY_INVALID');
    }
    if (seen.has(entry.capabilityId)) throw new Error(`DISPOSITION_REGISTRY_DUPLICATE_ENTRY: ${entry.capabilityId}`);
    seen.add(entry.capabilityId);
    if (!requiredIds.has(entry.capabilityId)) {
      throw new Error(`DISPOSITION_REGISTRY_ENTRY_NOT_REQUIRED: ${entry.capabilityId}`);
    }
    if (entry.disposition !== 'INTENTIONALLY_DORMANT' ||
      entry.runtimeBound !== false ||
      entry.productionReachable !== false ||
      entry.productionActive !== false ||
      entry.operationalConsumer !== 0 ||
      entry.activationAuthority !== 'ABSENT' ||
      entry.defect !== false ||
      entry.remediationRequired !== false ||
      entry.reopenCondition !== 'OWNER_APPROVED_CONSUMER_AND_TASK_BOUND_ACTIVATION_GRANT') {
      throw new Error(`DISPOSITION_REGISTRY_ENTRY_SEMANTICS_INVALID: ${entry.capabilityId}`);
    }
    if (!Array.isArray(entry.implementationFiles) || entry.implementationFiles.length === 0 ||
      !Array.isArray(entry.evidenceRefs) || entry.evidenceRefs.length === 0 ||
      typeof entry.recordFingerprint !== 'string' || !/^[0-9a-f]{64}$/i.test(entry.recordFingerprint)) {
      throw new Error(`DISPOSITION_REGISTRY_ENTRY_EVIDENCE_INVALID: ${entry.capabilityId}`);
    }
  }
  if (seen.size !== requiredIds.size) throw new Error('DISPOSITION_REGISTRY_REQUIRED_ENTRY_MISSING');
  return registry;
}

function loadDispositionRegistry(repoRoot, dispositionFile, headSha, seenPaths = new Set()) {
  const normalized = normalize(String(dispositionFile || ''));
  if (!normalized || normalized.startsWith('../') || normalized.includes('/../') || path.isAbsolute(dispositionFile)) {
    throw new Error('DISPOSITION_FILE_OUTSIDE_REPOSITORY');
  }
  const absolute = path.resolve(repoRoot, normalized);
  if (!absolute.startsWith(`${repoRoot}${path.sep}`)) {
    throw new Error('DISPOSITION_FILE_OUTSIDE_REPOSITORY');
  }
  if (seenPaths.has(normalized)) {
    throw new Error(`DISPOSITION_REGISTRY_CYCLE: ${normalized}`);
  }
  const nextSeenPaths = new Set(seenPaths);
  nextSeenPaths.add(normalized);
  if (!fs.existsSync(absolute)) throw new Error('DISPOSITION_REGISTRY_MISSING');

  let registry;
  try {
    registry = JSON.parse(fs.readFileSync(absolute, 'utf8'));
  } catch (error) {
    throw new Error(`DISPOSITION_REGISTRY_INVALID_JSON: ${error.message}`);
  }
  validateDispositionRegistryShape(registry);
  run('git', ['merge-base', '--is-ancestor', registry.sourceCommitSha, headSha], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  });
  if (registry.baseRegistry !== undefined) {
    if (typeof registry.baseRegistry !== 'string' || !registry.baseRegistry.trim()) {
      throw new Error('DISPOSITION_REGISTRY_BASE_INVALID');
    }
    const base = loadDispositionRegistry(
      repoRoot,
      registry.baseRegistry,
      headSha,
      nextSeenPaths,
    );
    if (base.data.program !== registry.program) {
      throw new Error('DISPOSITION_REGISTRY_PROGRAM_MISMATCH');
    }
    const baseIds = new Set(base.data.requiredCapabilityIds);
    const overlayIds = new Set(registry.requiredCapabilityIds);
    const overlap = [...overlayIds].filter((id) => baseIds.has(id));
    if (overlap.length > 0) {
      throw new Error(`DISPOSITION_REGISTRY_OVERLAY_DUPLICATE: ${overlap.join(', ')}`);
    }
    registry = {
      ...registry,
      requiredCapabilityIds: [
        ...base.data.requiredCapabilityIds,
        ...registry.requiredCapabilityIds,
      ],
      entries: [...base.data.entries, ...registry.entries],
    };
    validateDispositionRegistryShape(registry);
  }
  return {
    path: normalized,
    sha256: sha256(fs.readFileSync(absolute)),
    data: registry,
  };
}

function applyDispositionRegistry(capabilities, registry) {
  validateDispositionRegistryShape(registry.data);
  const byId = new Map(capabilities.map((record) => [record.capabilityId, record]));
  const requiredIds = new Set(registry.data.requiredCapabilityIds);
  for (const capabilityId of requiredIds) {
    if (!byId.has(capabilityId)) throw new Error(`DISPOSITION_REGISTRY_UNKNOWN_CAPABILITY: ${capabilityId}`);
  }
  for (const entry of registry.data.entries) {
    const record = byId.get(entry.capabilityId);
    if (dispositionFingerprint(record) !== entry.recordFingerprint) {
      throw new Error(`DISPOSITION_REGISTRY_RECORD_DRIFT: ${entry.capabilityId}`);
    }
    record.finalStatus = 'INTENTIONALLY_DORMANT';
    record.severity = 'NONE';
    record.runtimeBound = false;
    record.active = false;
    record.reachable = false;
    record.consumerCount = 0;
    record.productionReachable = false;
    record.productionActive = false;
    record.operationalConsumer = 0;
    record.consumers = [];
    record.actualEntryPoints = [];
    record.disposition = entry.disposition;
    record.ownerDecisionRef = entry.ownerDecisionRef || null;
    record.ownerDisposition = entry.ownerDisposition || null;
    record.activationAuthority = entry.activationAuthority;
    record.defect = entry.defect;
    record.remediationRequired = entry.remediationRequired;
    record.reopenCondition = entry.reopenCondition;
    record.evidenceRefs = unique([...record.evidenceRefs, ...entry.evidenceRefs]);
    record.blockers = unique([...record.blockers, 'INTENTIONALLY_DORMANT_BY_CANONICAL_DISPOSITION']);
    record.recommendedAction = 'PRESERVE_DORMANT_CONTRACT';
    record.breakpoint = 'Canonical disposition: KEEP_DORMANT / DO_NOT_BIND; operational consumer yok.';
  }
}

function closureReconciliationStatus(finalStatus) {
  if (finalStatus === 'VERIFIED_OPERATIONAL') return 'CLOSED_CONFIRMED_OPERATIONAL';
  if (finalStatus === 'CODE_PRESENT_UNBOUND') return 'CLOSED_BUT_UNBOUND';
  if (finalStatus === 'BOUND_DORMANT') return 'CLOSED_BUT_DORMANT';
  if (finalStatus === 'ACTIVE_UNREACHABLE') return 'CLOSED_BUT_UNREACHABLE';
  if (finalStatus === 'REACHABLE_NON_OPERABLE') return 'CLOSED_BUT_NON_OPERABLE';
  if (finalStatus === 'SUPERSEDED') return 'CLOSED_SUPERSEDED';
  if (finalStatus === 'INTENTIONALLY_DORMANT') return 'CLOSED_NO_LONGER_REQUIRED';
  return 'CLOSED_BUT_UNVERIFIED';
}

function percent(numerator, denominator) {
  if (!denominator) return null;
  return Math.round((numerator / denominator) * 10000) / 100;
}

function isReliableClosureClaim(claim) {
  return Boolean(
    claim &&
    claim.disposition === 'RELIABLE' &&
    RELIABLE_CLOSURE_CONFIDENCE.has(claim.confidence),
  );
}

function isBroadMappingFile(file) {
  const basename = path.posix.basename(file);
  return (
    basename === 'package.json' ||
    basename === 'index.ts' ||
    basename === 'index.tsx' ||
    basename === 'tsconfig.json' ||
    basename.endsWith('.module.ts') ||
    /(?:^|[-_.])(?:manifest|barrel)(?:[-_.]|$)/i.test(basename)
  );
}

function packageScriptsAt(repoRoot, ref, file) {
  const result = run('git', ['show', `${ref}:${file}`], {
    cwd: repoRoot,
    allowFailure: true,
    maxBuffer: 1024 * 1024,
  });
  if (result.status !== 0) return {};
  try {
    return JSON.parse(result.stdout).scripts || {};
  } catch {
    throw new Error(`PACKAGE_SCRIPT_HISTORY_PARSE_FAILED: ${ref}:${file}`);
  }
}

function changedPackageScriptKeys(repoRoot, commitSha, file) {
  const before = packageScriptsAt(repoRoot, `${commitSha}^`, file);
  const after = packageScriptsAt(repoRoot, commitSha, file);
  return new Set(
    unique([...Object.keys(before), ...Object.keys(after)])
      .filter((key) => JSON.stringify(before[key]) !== JSON.stringify(after[key])),
  );
}

function packageScriptKeyFor(capability, file) {
  const prefix = `${file}:scripts.`;
  const site = capability.registrationSites.find((item) => item.startsWith(prefix));
  return site ? site.slice(prefix.length) : null;
}

function classifyClosureCapabilityMapping(claimItem, capability, changedScriptsByFile = new Map()) {
  const claimRef = claimItem.historicalWorkId;
  const claimSource = claimItem.sourceRefs[0] || claimItem.closureClaim.sourceRef;
  const changedFiles = new Set(claimItem.changedFiles);
  const implementationIntersection = capability.implementationFiles
    .filter((file) => changedFiles.has(file));
  const title = claimItem.closureClaim.normalizedTitle.toUpperCase();

  if (title.includes(capability.capabilityId.toUpperCase())) {
    return {
      claimRef,
      capabilityId: capability.capabilityId,
      evidenceLevel: 'EXACT_CAPABILITY_REF',
      evidenceRefs: [claimSource],
      rationale: 'The historical claim contains the exact capability identifier.',
    };
  }

  const packageIntersections = implementationIntersection.filter((file) =>
    path.posix.basename(file) === 'package.json');
  if (packageIntersections.length > 0) {
    for (const file of packageIntersections) {
      const scriptKey = packageScriptKeyFor(capability, file);
      if (scriptKey && changedScriptsByFile.get(file)?.has(scriptKey)) {
        return {
          claimRef,
          capabilityId: capability.capabilityId,
          evidenceLevel: 'EXACT_PACKAGE_SCRIPT_KEY',
          evidenceRefs: [claimSource, `${file}:scripts.${scriptKey}`],
          rationale: `The commit changed only the exact package script key ${scriptKey} for this capability.`,
        };
      }
    }
    return {
      claimRef,
      capabilityId: capability.capabilityId,
      evidenceLevel: 'UNMAPPED',
      evidenceRefs: [claimSource, ...packageIntersections],
      rationale: 'The package file changed, but this capability script key did not change.',
    };
  }

  const directFiles = implementationIntersection.filter((file) => !isBroadMappingFile(file));
  if (directFiles.length > 0) {
    return {
      claimRef,
      capabilityId: capability.capabilityId,
      evidenceLevel: 'DIRECT_IMPLEMENTATION_FILE',
      evidenceRefs: [claimSource, ...directFiles],
      rationale: 'The historical change directly touched the capability implementation file.',
    };
  }

  if (implementationIntersection.length > 0) {
    return {
      claimRef,
      capabilityId: capability.capabilityId,
      evidenceLevel: 'BROAD_FILE_TOUCH',
      evidenceRefs: [claimSource, ...implementationIntersection],
      rationale: 'Only a shared registration, module, manifest, barrel, or package file was touched.',
    };
  }

  return {
    claimRef,
    capabilityId: capability.capabilityId,
    evidenceLevel: 'UNMAPPED',
    evidenceRefs: [claimSource],
    rationale: 'No defensible capability-specific file or identifier mapping was found.',
  };
}

function buildClosureCapabilityMappings(repoRoot, historicalItems, capabilities) {
  const mappings = [];
  for (const claimItem of [...historicalItems.values()]
    .filter((item) => item.closureClaim)
    .sort((a, b) => a.historicalWorkId.localeCompare(b.historicalWorkId))) {
    const changedScriptsByFile = new Map();
    for (const file of claimItem.changedFiles.filter((item) => path.posix.basename(item) === 'package.json')) {
      changedScriptsByFile.set(
        file,
        changedPackageScriptKeys(repoRoot, claimItem.mergeShas[0], file),
      );
    }

    const associatedCapabilities = capabilities.filter((capability) =>
      capability.historicalWorkRefs.includes(claimItem.historicalWorkId) ||
      claimItem.closureClaim.normalizedTitle.toUpperCase().includes(capability.capabilityId.toUpperCase()));
    if (associatedCapabilities.length === 0) {
      mappings.push({
        claimRef: claimItem.historicalWorkId,
        capabilityId: null,
        evidenceLevel: 'UNMAPPED',
        evidenceRefs: [claimItem.sourceRefs[0]],
        rationale: 'The closure candidate has no capability association in this repository snapshot.',
      });
      continue;
    }
    for (const capability of associatedCapabilities) {
      mappings.push(classifyClosureCapabilityMapping(
        claimItem,
        capability,
        changedScriptsByFile,
      ));
    }
  }
  return mappings.sort((a, b) =>
    a.claimRef.localeCompare(b.claimRef) ||
    String(a.capabilityId).localeCompare(String(b.capabilityId)) ||
    a.evidenceLevel.localeCompare(b.evidenceLevel));
}

function closureCertificationStatus(runtimeStatus, hasSufficientMapping) {
  if (!hasSufficientMapping) return 'CLOSED_EVIDENCE_INSUFFICIENT';
  if (runtimeStatus === 'VERIFIED_OPERATIONAL') return 'CLOSED_OPERATIONAL_CONFIRMED';
  if (runtimeStatus === 'CODE_PRESENT_UNBOUND') return 'CLOSED_BINDING_DEFECT';
  if (runtimeStatus === 'BOUND_DORMANT') return 'CLOSED_ACTIVATION_DEFECT';
  if (runtimeStatus === 'ACTIVE_UNREACHABLE') return 'CLOSED_REACHABILITY_DEFECT';
  if (runtimeStatus === 'REACHABLE_NON_OPERABLE') return 'CLOSED_OPERABILITY_DEFECT';
  if (runtimeStatus === 'SUPERSEDED') return 'CLOSED_SUPERSEDED';
  if (runtimeStatus === 'PARTIAL_IMPLEMENTATION') return 'CLOSED_STATICALLY_BOUND_UNVERIFIED';
  return 'CLOSED_EVIDENCE_INSUFFICIENT';
}

function buildClosureCertifications(historicalItems, mappings, capabilities) {
  const itemById = historicalItems;
  const mappingsByCapability = new Map();
  for (const mapping of mappings.filter((item) => item.capabilityId)) {
    if (!mappingsByCapability.has(mapping.capabilityId)) {
      mappingsByCapability.set(mapping.capabilityId, []);
    }
    mappingsByCapability.get(mapping.capabilityId).push(mapping);
  }

  return capabilities.map((capability) => {
    const candidateMappings = mappingsByCapability.get(capability.capabilityId) || [];
    const reliableMappings = candidateMappings.filter((mapping) =>
      isReliableClosureClaim(itemById.get(mapping.claimRef)?.closureClaim));
    const sufficientMappings = reliableMappings.filter((mapping) =>
      SUFFICIENT_CLOSURE_MAPPING.has(mapping.evidenceLevel));
    const excludedCandidateRefs = unique(candidateMappings
      .filter((mapping) => !isReliableClosureClaim(itemById.get(mapping.claimRef)?.closureClaim))
      .map((mapping) => mapping.claimRef));

    if (reliableMappings.length === 0) {
      return {
        capabilityId: capability.capabilityId,
        capabilityName: capability.name,
        runtimeStatus: capability.finalStatus,
        closureCertificationStatus: 'NOT_HISTORICALLY_CLOSED',
        reliableClaimRefs: [],
        mappingEvidenceLevels: [],
        evidenceRefs: [],
        excludedCandidateRefs,
        rationale: 'No reliable historical closure claim is mapped to this capability.',
      };
    }

    const status = closureCertificationStatus(
      capability.finalStatus,
      sufficientMappings.length > 0,
    );
    return {
      capabilityId: capability.capabilityId,
      capabilityName: capability.name,
      runtimeStatus: capability.finalStatus,
      closureCertificationStatus: status,
      reliableClaimRefs: unique(reliableMappings.map((mapping) => mapping.claimRef)),
      mappingEvidenceLevels: unique(reliableMappings.map((mapping) => mapping.evidenceLevel)),
      evidenceRefs: unique(reliableMappings.flatMap((mapping) => mapping.evidenceRefs)),
      excludedCandidateRefs,
      rationale: sufficientMappings.length > 0
        ? `Reliable closure claim and sufficient mapping evaluated against runtime status ${capability.finalStatus}.`
        : 'A reliable closure claim exists, but capability mapping evidence is broad or absent.',
    };
  }).sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
}

function countBy(values, keyFor) {
  return Object.fromEntries(
    [...values.reduce((counts, item) => {
      const key = keyFor(item);
      counts.set(key, (counts.get(key) || 0) + 1);
      return counts;
    }, new Map())].sort((a, b) => a[0].localeCompare(b[0])),
  );
}

function buildPrior27Reconciliation(historicalItems, mappings, certifications) {
  const failClosedRefs = [
    'HIST-11023234457E',
    'HIST-5CAB26213FAC',
    'HIST-D21135EA08C0',
    'HIST-FBEF69159FC6',
  ];
  const packageRef = 'HIST-D004068C3FFF';
  const portalRef = 'HIST-A154EC6D29E0';
  const groupMappings = (refs) => mappings.filter((item) =>
    refs.includes(item.claimRef) && item.capabilityId);
  const certifiedForRefs = (refs) => certifications.filter((item) =>
    item.reliableClaimRefs.some((ref) => refs.includes(ref)));
  const packageMappings = groupMappings([packageRef]);
  const portalMappings = groupMappings([portalRef]);
  const failClosedMappings = groupMappings(failClosedRefs);
  const foundFailClosedClaims = failClosedRefs.filter((ref) =>
    historicalItems.get(ref)?.closureClaim?.disposition === 'FALSE_POSITIVE');

  return {
    beforeMappingCount: 27,
    groups: [
      {
        group: 'FOUR_FAIL_CLOSED_COMMITS',
        beforeMappings: 4,
        successorCandidateMappings: failClosedMappings.length,
        successorReliableMappings: 0,
        successorCertificationCount: 0,
        disposition: 'FALSE_POSITIVE_CLOSURE_CLAIMS_REMOVED',
        evidence: `${foundFailClosedClaims.length}/4 known fail-closed claims excluded`,
      },
      {
        group: 'PACKAGE_JSON_DERIVED_MAPPINGS',
        beforeMappings: 13,
        successorCandidateMappings: packageMappings.length,
        successorReliableMappings: 0,
        successorCertificationCount: 0,
        disposition: 'FEATURE_NAME_CLAIM_EXCLUDED_MAPPING_CONTAINED',
        evidence: `${packageMappings.filter((item) => item.evidenceLevel === 'EXACT_PACKAGE_SCRIPT_KEY').length} exact package-script; ${packageMappings.filter((item) => item.evidenceLevel === 'UNMAPPED').length} unmapped`,
      },
      {
        group: 'CLIENT_PORTAL_DIRECT_FILE_CANDIDATES',
        beforeMappings: 10,
        successorCandidateMappings: portalMappings.length,
        successorReliableMappings: portalMappings.filter((item) =>
          item.evidenceLevel === 'DIRECT_IMPLEMENTATION_FILE').length,
        successorCertificationCount: certifiedForRefs([portalRef]).length,
        disposition: 'DIRECT_MAPPING_RETAINED_RUNTIME_CLOSURE_NOT_CONFIRMED',
        evidence: `${certifiedForRefs([portalRef]).filter((item) => item.closureCertificationStatus === 'CLOSED_OPERATIONAL_CONFIRMED').length} operationally confirmed`,
      },
    ],
    successorReliableCapabilityMappings: groupMappings([portalRef])
      .filter((item) => item.evidenceLevel === 'DIRECT_IMPLEMENTATION_FILE').length,
  };
}

function buildSuccessorModel(repoRoot, args, auditBaseSha, inventory, historicalItems, capabilities) {
  const claims = [...historicalItems.values()]
    .filter((item) => item.closureClaim)
    .map((item) => ({
      historicalWorkId: item.historicalWorkId,
      ...item.closureClaim,
      prNumbers: item.prNumbers,
      mergeShas: item.mergeShas,
      changedFiles: item.changedFiles,
    }))
    .sort((a, b) => a.historicalWorkId.localeCompare(b.historicalWorkId));
  const mappings = buildClosureCapabilityMappings(repoRoot, historicalItems, capabilities);
  const certifications = buildClosureCertifications(historicalItems, mappings, capabilities);
  const reliableClaimRefs = new Set(claims
    .filter(isReliableClosureClaim)
    .map((item) => item.historicalWorkId));
  const reliableMappings = mappings.filter((item) => reliableClaimRefs.has(item.claimRef));
  const reliableMappingsByClaim = new Map();
  for (const mapping of reliableMappings) {
    if (!reliableMappingsByClaim.has(mapping.claimRef)) reliableMappingsByClaim.set(mapping.claimRef, []);
    reliableMappingsByClaim.get(mapping.claimRef).push(mapping);
  }
  const mappedReliableClaims = [...reliableMappingsByClaim]
    .filter(([, values]) => values.some((item) => SUFFICIENT_CLOSURE_MAPPING.has(item.evidenceLevel)))
    .map(([claimRef]) => claimRef);
  const broadOrUnmappedReliableClaims = [...reliableClaimRefs]
    .filter((claimRef) => !mappedReliableClaims.includes(claimRef));
  const certificationCounts = countBy(certifications, (item) => item.closureCertificationStatus);
  const metrics = {
    historicallyClosedClaimCount: claims.length,
    reliableClosureClaimCount: claims.filter(isReliableClosureClaim).length,
    falsePositiveClosureClaimCount: claims.filter((item) => item.disposition === 'FALSE_POSITIVE').length,
    lowConfidenceExcludedClaimCount: claims.filter((item) => item.disposition === 'LOW_CONFIDENCE_EXCLUDED').length,
    mappedClosureClaimCount: mappedReliableClaims.length,
    broadOrUnmappedClosureClaimCount: broadOrUnmappedReliableClaims.length,
    provenClosureDefectCount: certifications.filter((item) => [
      'CLOSED_BINDING_DEFECT',
      'CLOSED_ACTIVATION_DEFECT',
      'CLOSED_REACHABILITY_DEFECT',
      'CLOSED_OPERABILITY_DEFECT',
    ].includes(item.closureCertificationStatus)).length,
    closureUncertifiedCount: certifications.filter((item) => [
      'CLOSED_STATICALLY_BOUND_UNVERIFIED',
      'CLOSED_EVIDENCE_INSUFFICIENT',
    ].includes(item.closureCertificationStatus)).length,
    closureOperationalConfirmedCount: certifications.filter((item) =>
      item.closureCertificationStatus === 'CLOSED_OPERATIONAL_CONFIRMED').length,
    exactCapabilityMappings: reliableMappings.filter((item) =>
      item.evidenceLevel === 'EXACT_CAPABILITY_REF').length,
    exactPackageScriptMappings: reliableMappings.filter((item) =>
      item.evidenceLevel === 'EXACT_PACKAGE_SCRIPT_KEY').length,
    directImplementationFileMappings: reliableMappings.filter((item) =>
      item.evidenceLevel === 'DIRECT_IMPLEMENTATION_FILE').length,
    broadFileTouchMappings: reliableMappings.filter((item) =>
      item.evidenceLevel === 'BROAD_FILE_TOUCH').length,
    unmappedMappings: reliableMappings.filter((item) =>
      item.evidenceLevel === 'UNMAPPED').length,
  };

  return {
    schemaVersion: 1,
    program: SUCCESSOR_PROGRAM,
    task: SUCCESSOR_TASK,
    ownerDecision: 'RATIFIED',
    executionGrant: 'GO-COMPLETE',
    metadata: {
      auditBaseSha,
      snapshotAt: new Date(args.auditStartedAt).toISOString(),
      scanner: relative(repoRoot, __filename),
      scannerSha256: sha256(fs.readFileSync(__filename)),
      capabilityCount: capabilities.length,
      sealedPr1795ArtifactTreeSha: git(repoRoot, 'rev-parse', `${auditBaseSha}:${SEALED_R01_AUDIT_DIRECTORY}`),
      evidenceBoundary: 'STATIC_REPOSITORY_SNAPSHOT_PLUS_SHA_BOUND_L6_EVIDENCE_FROM_R01',
      snapshotBoundary: SNAPSHOT_BOUNDARY,
    },
    legacyMetric: {
      incorrectlyClosed: inventory.counts.incorrectlyClosed,
      label: 'LEGACY / NOT SUFFICIENT FOR CLOSURE CERTIFICATION',
    },
    metrics,
    mappingCounts: countBy(reliableMappings, (item) => item.evidenceLevel),
    candidateMappingCounts: countBy(mappings, (item) => item.evidenceLevel),
    certificationCounts,
    claims,
    mappings,
    certifications,
    prior27Reconciliation: buildPrior27Reconciliation(
      historicalItems,
      mappings,
      certifications,
    ),
  };
}

function requireSuccessor(condition, code) {
  if (!condition) throw new Error(`SUCCESSOR_METHODOLOGY_VALIDATION_FAILED: ${code}`);
}

function validateSuccessorModel(model, inventory) {
  const assertions = [];
  const pass = (condition, code) => {
    requireSuccessor(condition, code);
    assertions.push(code);
  };

  pass(model.schemaVersion === 1, 'SCHEMA_VERSION_1');
  pass(model.program === SUCCESSOR_PROGRAM && model.task === SUCCESSOR_TASK, 'PROGRAM_TASK_IDENTITY');
  pass(
    model.certifications.length === inventory.capabilities.length,
    'ONE_CERTIFICATION_PER_CAPABILITY',
  );
  pass(
    new Set(model.certifications.map((item) => item.capabilityId)).size === model.certifications.length,
    'UNIQUE_CAPABILITY_CERTIFICATIONS',
  );
  pass(
    model.claims.every((claim) =>
      claim.sourceRef &&
      claim.normalizedTitle &&
      claim.claimType &&
      claim.matchedText &&
      claim.parserRule &&
      ['HIGH', 'MEDIUM', 'LOW'].includes(claim.confidence)),
    'HISTORICAL_CLOSURE_CLAIM_SHAPE',
  );
  pass(
    model.mappings.every((mapping) =>
      mapping.claimRef &&
      CLOSURE_MAPPING_EVIDENCE_LEVELS.has(mapping.evidenceLevel) &&
      Array.isArray(mapping.evidenceRefs) &&
      typeof mapping.rationale === 'string'),
    'CLOSURE_CAPABILITY_MAPPING_SHAPE',
  );
  pass(
    model.certifications.every((item) =>
      CLOSURE_CERTIFICATION_STATUSES.has(item.closureCertificationStatus)),
    'CLOSURE_CERTIFICATION_ENUM_CLOSED',
  );

  const claimById = new Map(model.claims.map((claim) => [claim.historicalWorkId, claim]));
  pass(
    model.certifications.every((item) => item.reliableClaimRefs.every((ref) =>
      isReliableClosureClaim(claimById.get(ref)))),
    'ONLY_RELIABLE_CLAIMS_CERTIFY',
  );
  pass(
    model.certifications
      .filter((item) => item.closureCertificationStatus === 'CLOSED_OPERATIONAL_CONFIRMED')
      .every((item) => item.runtimeStatus === 'VERIFIED_OPERATIONAL'),
    'OPERATIONAL_CONFIRMATION_REQUIRES_L6_STATUS',
  );

  const failClosedRefs = new Set([
    'HIST-11023234457E',
    'HIST-5CAB26213FAC',
    'HIST-D21135EA08C0',
    'HIST-FBEF69159FC6',
  ]);
  const failClosedClaims = model.claims.filter((claim) => failClosedRefs.has(claim.historicalWorkId));
  pass(
    failClosedClaims.length === 4 && failClosedClaims.every((claim) =>
      claim.claimType === 'FALSE_POSITIVE_FAIL_CLOSED' &&
      claim.disposition === 'FALSE_POSITIVE' &&
      !isReliableClosureClaim(claim)),
    'FOUR_FAIL_CLOSED_FALSE_POSITIVES_EXCLUDED',
  );

  const packageClaim = claimById.get('HIST-D004068C3FFF');
  const packageMappings = model.mappings.filter((mapping) =>
    mapping.claimRef === 'HIST-D004068C3FFF' && mapping.capabilityId);
  pass(
    packageClaim?.claimType === 'FALSE_POSITIVE_CLOSEOUT_NAME' &&
    packageClaim.disposition === 'FALSE_POSITIVE',
    'FEATURE_NAME_CLOSEOUT_NOT_A_CLOSURE_CLAIM',
  );
  pass(
    packageMappings.filter((mapping) =>
      mapping.evidenceLevel === 'EXACT_PACKAGE_SCRIPT_KEY').length === 1 &&
    packageMappings.filter((mapping) =>
      mapping.evidenceLevel === 'EXACT_PACKAGE_SCRIPT_KEY')[0]?.evidenceRefs
      .some((ref) => ref.endsWith('scripts.orch:closeout')) &&
    packageMappings.every((mapping) =>
      mapping.evidenceLevel === 'EXACT_PACKAGE_SCRIPT_KEY' || mapping.evidenceLevel === 'UNMAPPED'),
    'PACKAGE_SCRIPT_MAPPING_CONTAINED_TO_EXACT_KEY',
  );

  const portalClaim = claimById.get('HIST-A154EC6D29E0');
  const portalMappings = model.mappings.filter((mapping) =>
    mapping.claimRef === 'HIST-A154EC6D29E0' && mapping.capabilityId);
  const portalCapabilityIds = new Set(portalMappings.map((mapping) => mapping.capabilityId));
  pass(
    isReliableClosureClaim(portalClaim) &&
    portalMappings.length === 10 &&
    portalMappings.every((mapping) => mapping.evidenceLevel === 'DIRECT_IMPLEMENTATION_FILE'),
    'CLIENT_PORTAL_DIRECT_FILE_MAPPINGS',
  );
  pass(
    model.certifications
      .filter((item) => portalCapabilityIds.has(item.capabilityId))
      .every((item) => item.closureCertificationStatus !== 'CLOSED_OPERATIONAL_CONFIRMED'),
    'CLIENT_PORTAL_NOT_OPERATIONALLY_OVERCLAIMED',
  );

  const explicit = parseHistoricalClosureClaim('fixture:explicit', 'FINAL STATUS: CLOSED');
  const feature = parseHistoricalClosureClaim(
    'fixture:feature',
    'feat: add closeout CLI command',
  );
  pass(isReliableClosureClaim(explicit), 'EXPLICIT_FINAL_STATUS_ACCEPTED');
  pass(
    feature?.disposition === 'FALSE_POSITIVE' && !isReliableClosureClaim(feature),
    'FEATURE_CLOSEOUT_FIXTURE_EXCLUDED',
  );

  return assertions;
}

function successorMethodologyLines(model) {
  return [
    '# Runtime Operability Certification R01 — Closure Methodology',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '## Snapshot boundary',
    '',
    '```text',
    SNAPSHOT_BOUNDARY,
    '```',
    '',
    '## Independent axes',
    '',
    'Runtime status and historical closure certification are independent. A merge, source-file',
    'presence, static registration, or passing test does not independently certify operational closure.',
    '',
    '```text',
    'MERGED',
    'CODE_PRESENT',
    'RUNTIME_BOUND',
    'ACTIVE',
    'REACHABLE',
    'CONSUMED',
    'OPERABLE',
    'INDEPENDENTLY_VERIFIED',
    'CLOSURE_CERTIFIED',
    '```',
    '',
    'Operational confirmation requires:',
    '',
    '```text',
    'RUNTIME BINDING',
    '→ ACTIVATION',
    '→ REACHABILITY',
    '→ REAL CONSUMER',
    '→ EXPECTED SIDE EFFECT',
    '→ INDEPENDENT VERIFICATION',
    '```',
    '',
    '## HistoricalClosureClaim',
    '',
    'A contextual parser emits `sourceRef`, `normalizedTitle`, `claimType`, `matchedText`,',
    '`parserRule`, and `confidence`. `LOW` confidence and false-positive candidates never enter',
    'the closure-certification denominator. Behavioural fail-closed language, default-closed state,',
    'feature/CLI/package names containing closeout, and technical closure concepts are excluded.',
    '',
    '## ClosureCapabilityMapping',
    '',
    '| Evidence level | Certification use | Meaning |',
    '|---|---|---|',
    '| EXACT_CAPABILITY_REF | Sufficient | Exact capability identifier in the claim |',
    '| EXACT_PACKAGE_SCRIPT_KEY | Sufficient | Exact changed package script key only |',
    '| DIRECT_IMPLEMENTATION_FILE | Sufficient for association only | Direct implementation/registration file changed |',
    '| BROAD_FILE_TOUCH | Insufficient | Shared module/manifest/barrel/package touch |',
    '| UNMAPPED | Insufficient | No defensible capability-specific relation |',
    '',
    '`DIRECT_IMPLEMENTATION_FILE` associates the claim with a capability but never proves runtime',
    'operation. Package-file touch is contained to the exact changed script key.',
    '',
    '## Closure certification statuses',
    '',
    ...[...CLOSURE_CERTIFICATION_STATUSES].map((status) => `- \`${status}\``),
    '',
    'A capability without a reliable closure claim is `NOT_HISTORICALLY_CLOSED`. A reliable claim',
    'with broad/unmapped evidence is `CLOSED_EVIDENCE_INSUFFICIENT`. Runtime defect statuses are',
    'assigned only after sufficient claim-to-capability mapping. `CLOSED_OPERATIONAL_CONFIRMED`',
    'requires `VERIFIED_OPERATIONAL` runtime status.',
    '',
    '## Legacy metric',
    '',
    `\`incorrectlyClosed = ${model.legacyMetric.incorrectlyClosed}\` is retained only for backward`,
    `compatibility and is labelled **${model.legacyMetric.label}**. It is not synonymous with`,
    '`provenClosureDefectCount` or `closureUncertifiedCount`.',
    '',
  ];
}

function successorCertificationLines(model) {
  const metricRows = [
    ['Historical closure claims detected', model.metrics.historicallyClosedClaimCount],
    ['Reliable closure claims', model.metrics.reliableClosureClaimCount],
    ['False-positive closure claims removed', model.metrics.falsePositiveClosureClaimCount],
    ['Exact capability mappings', model.metrics.exactCapabilityMappings],
    ['Exact package-script mappings', model.metrics.exactPackageScriptMappings],
    ['Direct implementation-file mappings', model.metrics.directImplementationFileMappings],
    ['Broad file-touch mappings', model.metrics.broadFileTouchMappings],
    ['Unmapped claims/mappings', model.metrics.unmappedMappings],
    ['Operationally confirmed closures', model.metrics.closureOperationalConfirmedCount],
    ['Proven closure defects', model.metrics.provenClosureDefectCount],
    ['Closure uncertified', model.metrics.closureUncertifiedCount],
    ['Superseded closures', model.certificationCounts.CLOSED_SUPERSEDED || 0],
  ];
  const lines = [
    '# Historical Closure Certification — R01',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '```text',
    SNAPSHOT_BOUNDARY,
    '```',
    '',
    '## Required scorecard',
    '',
    '| Measure | Count |',
    '|---|---:|',
    ...metricRows.map(([label, value]) => `| ${label} | ${value} |`),
    '',
    `Legacy \`incorrectlyClosed\`: **${model.legacyMetric.incorrectlyClosed}** — ` +
      `**${model.legacyMetric.label}**.`,
    '',
    '## Before/after reconciliation of the prior 27 relationships',
    '',
    '| Group | Before | Successor candidate mappings | Reliable mappings | Certifications | Disposition | Evidence |',
    '|---|---:|---:|---:|---:|---|---|',
    ...model.prior27Reconciliation.groups.map((group) =>
      `| ${group.group} | ${group.beforeMappings} | ${group.successorCandidateMappings} | ` +
      `${group.successorReliableMappings} | ${group.successorCertificationCount} | ` +
      `${group.disposition} | ${group.evidence} |`),
    '',
    'Interpretation:',
    '',
    '- The four `fail closed` commits are behavioral fixes, not historical closure claims.',
    '- The PR #1716 feature-name `closeout` candidate is not a closure claim. Its mapping is still',
    '  regression-audited: only `orch:closeout` is exact; other package scripts are unmapped.',
    '- The ten CLIENT portal candidates remain direct-file associations, but none is operationally',
    '  confirmed without independent runtime evidence.',
    '',
    '## Closure certification distribution',
    '',
    '| Certification status | Count |',
    '|---|---:|',
    ...Object.entries(model.certificationCounts).map(([status, count]) => `| ${status} | ${count} |`),
    '',
    '## Reliable claim-to-capability mappings',
    '',
    '| Claim | Capability | Evidence level | Runtime status | Closure certification |',
    '|---|---|---|---|---|',
  ];
  const certificationByCapability = new Map(
    model.certifications.map((item) => [item.capabilityId, item]),
  );
  const reliableClaimRefs = new Set(model.claims.filter(isReliableClosureClaim)
    .map((item) => item.historicalWorkId));
  for (const mapping of model.mappings.filter((item) =>
    item.capabilityId && reliableClaimRefs.has(item.claimRef))) {
    const certification = certificationByCapability.get(mapping.capabilityId);
    lines.push(
      `| ${mapping.claimRef} | ${mapping.capabilityId} | ${mapping.evidenceLevel} | ` +
      `${certification.runtimeStatus} | ${certification.closureCertificationStatus} |`,
    );
  }
  lines.push('');
  return lines;
}

function methodologyValidationLines(model, assertions) {
  const packageGroup = model.prior27Reconciliation.groups.find((item) =>
    item.group === 'PACKAGE_JSON_DERIVED_MAPPINGS');
  const portalGroup = model.prior27Reconciliation.groups.find((item) =>
    item.group === 'CLIENT_PORTAL_DIRECT_FILE_CANDIDATES');
  return [
    '# Methodology Validation Report — R01',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '## Generator-enforced assertions',
    '',
    ...assertions.map((assertion) => `- PASS — \`${assertion}\``),
    '',
    '## Regression teeth',
    '',
    '- The legacy word matcher classifies each of the four `fail closed` titles as `CLOSED`; the',
    '  contextual parser classifies all four as false positives and excludes them from certification.',
    `- Package containment records ${packageGroup.evidence}; the legacy file-touch model associated`,
    '  every eligible script in the same package file.',
    `- CLIENT portal containment retains ${portalGroup.successorReliableMappings} direct-file mappings`,
    '  while producing zero operational confirmations without L6 evidence.',
    '- `FINAL STATUS: CLOSED` is accepted as a high-confidence claim.',
    '- A feature or CLI name containing `closeout` is excluded unless terminal claim context exists.',
    '',
    'Focused/existing test execution, `node --check`, deterministic double-run, frozen-input equality,',
    'allowlist validation, and sealed-tree verification are recorded as PR/CI execution evidence;',
    'this deterministic artifact does not fabricate environment-dependent command outcomes.',
    '',
  ];
}

function successorDecisionLogLines(model) {
  return [
    '# Runtime Operability Certification R01 — Decision Log',
    '',
    `Audit base: \`${model.metadata.auditBaseSha}\``,
    '',
    '## ROC-W0-DEC-001 — Two independent axes',
    '',
    'Runtime status and historical closure certification are independent. Neither merge nor static',
    'binding is operational closure evidence.',
    '',
    '## ROC-W0-DEC-002 — Contextual closure claims',
    '',
    'Closure claims require contextual terminal-delivery language. Behavioral fail-closed terms,',
    'default-closed states, feature/command names, and technical closure concepts are excluded.',
    '',
    '## ROC-W0-DEC-003 — Evidence-level mapping',
    '',
    'Only exact capability references, exact changed package-script keys, and direct implementation',
    'files can associate a reliable closure claim with a capability. Broad or absent mappings cannot',
    'support defect or operational-confirmation certification.',
    '',
    '## ROC-W0-DEC-004 — Legacy metric containment',
    '',
    '`incorrectlyClosed` remains backward-compatible and explicitly non-authoritative for closure',
    'certification. New defect, uncertified, and confirmed counts are computed from the two-axis model.',
    '',
    '## ROC-W0-DEC-005 — Sealed audit preservation',
    '',
    SNAPSHOT_BOUNDARY,
    '',
  ];
}

function writeSuccessorArtifacts(outputDirectory, model, inventory) {
  const assertions = validateSuccessorModel(model, inventory);
  fs.mkdirSync(outputDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(outputDirectory, 'methodology.md'),
    `${successorMethodologyLines(model).join('\n')}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'historical-closure-certification.json'),
    `${JSON.stringify(model, null, 2)}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'historical-closure-certification.md'),
    `${successorCertificationLines(model).join('\n')}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'methodology-validation-report.md'),
    `${methodologyValidationLines(model, assertions).join('\n')}\n`,
    'utf8',
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'decision-log.md'),
    `${successorDecisionLogLines(model).join('\n')}\n`,
    'utf8',
  );
  return assertions;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptDirectory = __dirname;
  const projectRoot = path.resolve(scriptDirectory, '..');
  const repoRoot = path.resolve(projectRoot, '..');
  const outputDirectory = path.resolve(repoRoot, args.outDir);
  if (!outputDirectory.startsWith(`${repoRoot}${path.sep}`)) throw new Error('OUT_DIR_OUTSIDE_REPOSITORY');

  const headSha = git(repoRoot, 'rev-parse', 'HEAD');
  const auditBaseSha = args.auditBaseSha
    ? git(repoRoot, 'rev-parse', `${args.auditBaseSha}^{commit}`)
    : headSha;
  const commonDirectory = git(repoRoot, 'rev-parse', '--git-common-dir');
  const branch = git(repoRoot, 'branch', '--show-current');
  if (auditBaseSha !== headSha) {
    run('git', ['merge-base', '--is-ancestor', auditBaseSha, headSha], {
      cwd: repoRoot,
      maxBuffer: 1024 * 1024,
    });
    const committedAuditPaths = git(repoRoot, 'diff', '--name-only', `${auditBaseSha}..${headSha}`)
      .split(/\r?\n/)
      .filter(Boolean)
      .map(normalize);
    const allowedCommittedPaths = [
      'project/scripts/runtime-binding-reconciliation-r01.cjs',
      'project/scripts/runtime-binding-reconciliation-r01.test.cjs',
      normalize(args.dispositionFile),
    ];
    const outputPrefix = `${normalize(args.outDir).replace(/\/+$/, '')}/`;
    const unexpectedCommittedPaths = committedAuditPaths.filter((file) =>
      !allowedCommittedPaths.includes(file) && !file.startsWith(outputPrefix));
    if (unexpectedCommittedPaths.length > 0) {
      throw new Error(
        `AUDIT_BASE_TREE_DIVERGES_OUTSIDE_AUDIT_SCOPE: ${unexpectedCommittedPaths.join(', ')}`,
      );
    }
  }
  const treeStatus = run('git', ['status', '--porcelain=v1'], {
    cwd: repoRoot,
    maxBuffer: 1024 * 1024,
  }).stdout.trimEnd();
  if (treeStatus) {
    const scannerPath = relative(repoRoot, __filename);
    const scannerTestPath = relative(
      repoRoot,
      path.join(__dirname, 'runtime-binding-reconciliation-r01.test.cjs'),
    );
    const allowedOutputPrefix = `${normalize(args.outDir).replace(/\/+$/, '')}/`;
    const dispositionPath = normalize(args.dispositionFile).replace(/\/+$/, '');
    const unexpected = treeStatus
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => normalize(line.slice(3).trim()))
      .filter((file) =>
        file !== scannerPath &&
        file !== scannerTestPath &&
        !file.startsWith(allowedOutputPrefix) &&
        file !== dispositionPath &&
        !file.startsWith(`${dispositionPath}/`) &&
        !dispositionPath.startsWith(`${file.replace(/\/+$/, '')}/`));
    if (unexpected.length > 0) {
      throw new Error(`AUDIT_UNEXPECTED_DIRTY_PATHS: ${unexpected.join(', ')}`);
    }
  }

  const apiRoot = path.join(projectRoot, 'apps', 'api', 'src');
  const webRoot = path.join(projectRoot, 'apps', 'web', 'src');
  const orchestrationRoot = path.join(projectRoot, 'scripts', 'orchestration-v2');
  const sourceFiles = [
    ...walk(apiRoot, (file) => /\.(?:ts|tsx)$/.test(file)),
    ...walk(webRoot, (file) => /\.(?:ts|tsx)$/.test(file)),
    ...walk(orchestrationRoot, (file) => /\.(?:cjs|js)$/.test(file)),
  ];
  const sourceByRelative = new Map(
    sourceFiles.map((file) => [relative(repoRoot, file), fs.readFileSync(file, 'utf8')]),
  );
  const apiProductionFiles = [...sourceByRelative.keys()]
    .filter((file) => file.startsWith('project/apps/api/src/'))
    .filter((file) => !/(?:__tests__|\.spec\.|\.test\.)/.test(file));
  const testFiles = [...sourceByRelative.keys()]
    .filter((file) => /(?:__tests__|\.spec\.|\.test\.)/.test(file));

  const classIndex = new Map();
  const fileClasses = new Map();
  for (const file of apiProductionFiles) {
    const text = sourceByRelative.get(file);
    const classes = extractRuntimeClassDeclarations(text);
    for (const classInfo of classes) {
      const { name } = classInfo;
      if (!classIndex.has(name)) classIndex.set(name, []);
      classIndex.get(name).push(file);
    }
    fileClasses.set(file, classes);
  }

  const modules = new Map();
  for (const file of apiProductionFiles.filter((item) => item.endsWith('.module.ts') || item.endsWith('app.module.ts'))) {
    const text = sourceByRelative.get(file);
    const moduleDecorator = text.indexOf('@Module');
    if (moduleDecorator === -1) continue;
    const paren = text.indexOf('(', moduleDecorator);
    const body = paren === -1 ? null : findBalanced(text, paren, '(', ')');
    if (!body) continue;
    const moduleClass = /export\s+class\s+([A-Za-z_$][\w$]*)/.exec(text.slice(body.end));
    if (!moduleClass) continue;
    const name = moduleClass[1];
    const conditional = [...text.matchAll(/conditionalImports\.push\(\s*([A-Za-z_$][\w$]*)/g)]
      .map((match) => match[1]);
    modules.set(name, {
      name,
      file,
      imports: unique([...extractNamedArray(body.text, 'imports'), ...conditional]),
      controllers: extractNamedArray(body.text, 'controllers'),
      providers: extractNamedArray(body.text, 'providers'),
      exports: extractNamedArray(body.text, 'exports'),
      activationConditions: extractEnvConditions(text),
    });
  }

  const reachableModules = new Set();
  const moduleQueue = ['AppModule'];
  while (moduleQueue.length > 0) {
    const name = moduleQueue.shift();
    if (reachableModules.has(name)) continue;
    const module = modules.get(name);
    if (!module) continue;
    reachableModules.add(name);
    for (const imported of module.imports) {
      if (modules.has(imported) && !reachableModules.has(imported)) moduleQueue.push(imported);
    }
  }

  const controllerRegistrations = new Map();
  const providerRegistrations = new Map();
  for (const module of modules.values()) {
    if (!reachableModules.has(module.name)) continue;
    for (const controller of module.controllers) {
      if (!controllerRegistrations.has(controller)) controllerRegistrations.set(controller, []);
      controllerRegistrations.get(controller).push(module);
    }
    for (const provider of module.providers) {
      if (!providerRegistrations.has(provider)) providerRegistrations.set(provider, []);
      providerRegistrations.get(provider).push(module);
    }
  }

  const historyData = history(repoRoot, [], auditBaseSha);
  const historicalItems = new Map(
    historyData.commits
      .map(historicalClaim)
      .filter(Boolean)
      .map((claim) => [claim.historicalWorkId, claim]),
  );
  const capabilities = [];
  const usedIds = new Set();

  function historyRefFor(file) {
    return unique(
      (historyData.commitsByFile.get(file) || [])
        .map((commit) => `HIST-${commit.sha.slice(0, 12).toUpperCase()}`),
    );
  }

  function addCapability(prefix, nameSeed, input) {
    let base = `${prefix}-${sha256(nameSeed).slice(0, 12).toUpperCase()}`;
    let id = base;
    let suffix = 2;
    while (usedIds.has(id)) id = `${base}-${suffix++}`;
    usedIds.add(id);
    const finalStatus = input.finalStatus || finalStatusFor(input);
    const draft = {
      ...input,
      capabilityId: id,
      finalStatus,
    };
    draft.severity = input.severity || severityFor({
      ...draft,
      implementationFiles: input.implementationFiles || [],
    });
    draft.recommendedAction = input.recommendedAction || recommendedAction(draft);
    const record = makeRecord(draft);
    capabilities.push(record);
    for (const historicalWorkId of record.historicalWorkRefs) {
      const item = historicalItems.get(historicalWorkId);
      if (item) {
        item.claimedCapabilities.push(record.capabilityId);
        item.expectedEntryPoints.push(...record.expectedEntryPoints);
        item.expectedConsumers.push(...record.consumers);
        item.expectedActivationConditions.push(...record.activationConditions);
      }
    }
  }

  const dispositionRegistry = loadDispositionRegistry(repoRoot, args.dispositionFile, headSha);
  const dispositionFiles = new Set(
    dispositionRegistry.data.entries.flatMap((entry) => entry.implementationFiles),
  );
  const controllerFiles = apiProductionFiles.filter((file) => file.endsWith('.controller.ts'));
  for (const file of controllerFiles) {
    const text = sourceByRelative.get(file);
    const declaredClasses = (fileClasses.get(file) || [])
      .filter((classInfo) => classInfo.name.endsWith('Controller'));
    const firstController = declaredClasses[0];
    const controllerClasses = dispositionFiles.has(file)
      ? declaredClasses
      : firstController ? [firstController] : [];
    for (const classInfo of controllerClasses) {
      const controllerName = classInfo.name;
      const classOffset = classInfo.offset;
      const classDeclaration = `class ${controllerName}`;
      const controllerPrefix = text.slice(Math.max(0, classOffset - 3000), classOffset);
      const controllerDecorators = [...controllerPrefix.matchAll(/@Controller(?:\s*\(([^)]*)\))?/g)];
      const controllerDecorator = controllerDecorators.at(-1);
      const baseRoute = controllerDecorator ? stringLiteral(controllerDecorator[1]) : '';
      const classBrace = text.indexOf('{', classOffset + classDeclaration.length);
      const classBody = classBrace === -1 ? null : findBalanced(text, classBrace, '{', '}');
      if (!classBody) continue;
      const registrations = controllerRegistrations.get(controllerName) || [];
      const registrationSites = registrations.map((module) => `${module.file}:${module.name}.controllers`);
      const moduleActivation = unique(registrations.flatMap((module) => module.activationConditions));
      const classConditions = extractEnvConditions(classBody.text);
      const activationConditions = unique([...moduleActivation, ...classConditions]);
      const defaultOff = defaultOffConditions(`${controllerPrefix}\n${classBody.text}`, activationConditions).length > 0;
      const intentionallyDormant = /(?:INTENTIONALLY_DORMANT|default-disabled|default disabled|DORMANT|test-only|test only|local\/dev only|dev only|sadece test|test ortamında|production['’]?da[^\n]*devre dışı)/i
        .test(`${controllerPrefix}\n${classBody.text}`);

    for (const match of classBody.text.matchAll(/@(Get|Post|Put|Patch|Delete|Options|Head|All)\s*\(([^)]*)\)/g)) {
      if (!HTTP_DECORATORS.has(match[1])) continue;
      const after = classBody.text.slice(match.index + match[0].length);
      const methodMatch = /^[ \t]*(?:public\s+|protected\s+|private\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/m.exec(after);
      if (!methodMatch) continue;
      const methodName = methodMatch[1];
      const route = stringLiteral(match[2]);
      const fullRoute = `/api/${[baseRoute, route].filter(Boolean).join('/')}`.replace(/\/+/g, '/');
      const routeOffset = classBrace + 1 + match.index;
      const module = classifyWorkstream(file, `${controllerName}.${methodName}`);
      const bound = registrations.length > 0;
      const active = activationConditions.length === 0 ? true : defaultOff ? false : null;
      const reachable = bound && active !== false;
      const evidence = [
        `${file}:${lineAt(text, routeOffset)}`,
        ...registrationSites,
        'project/apps/api/src/main.ts:22',
      ];
      addCapability(
        'HTTP',
        `${file}:${controllerName}.${methodName}:${match[1]}:${fullRoute}`,
        {
          module,
          name: `${controllerName}.${methodName} — ${match[1].toUpperCase()} ${fullRoute}`,
          historicalWorkRefs: historyRefFor(file),
          implementationFiles: [file],
          testFiles: testFilesFor(file, testFiles),
          entryPointType: 'HTTP',
          expectedEntryPoints: [fullRoute],
          actualEntryPoints: bound ? [fullRoute] : [],
          providers: [controllerName],
          consumers: bound ? ['Nest HTTP router'] : [],
          producers: ['HTTP client'],
          registrationSites,
          activationConditions,
          runtimeBound: bound,
          active,
          reachable,
          consumerCount: bound ? 1 : 0,
          operable: null,
          independentlyVerified: false,
          verificationLevel: reachable ? 'L3' : bound ? 'L2' : 'L0',
          intentionallyDormant,
          defaultOff,
          breakpoint: bound ? '' : `${controllerName} hiçbir production-reachable module controllers listesinde değil.`,
          evidenceRefs: evidence,
          blockers: defaultOff ? ['DEPLOYED_ACTIVATION_VALUE_UNVERIFIED'] : [],
        },
      );
    }
  }
  }

  const rootControllerTexts = controllerFiles
    .filter((file) => {
      const classes = fileClasses.get(file) || [];
      return classes.some((item) => controllerRegistrations.has(item.name));
    })
    .map((file) => ({ file, text: sourceByRelative.get(file) }));

  for (const file of apiProductionFiles) {
    const text = sourceByRelative.get(file);
    for (const classInfo of fileClasses.get(file) || []) {
      if (!CLASS_SUFFIXES.some((suffix) => classInfo.name.endsWith(suffix))) continue;
      const name = classInfo.name;
      if (/^(?:Mock|Fake|Stub)/.test(name)) continue;
      const registrations = providerRegistrations.get(name) || [];
      const providerRegistrationSites = registrations.map((module) => `${module.file}:${module.name}.providers`);
      const productionConsumers = [];
      const referencePattern = new RegExp(`\\b${name.replaceAll('$', '\\$')}\\b`);
      for (const [candidateFile, candidateText] of sourceByRelative.entries()) {
        if (candidateFile === file) continue;
        if (/(?:__tests__|\.spec\.|\.test\.|\.module\.ts$)/.test(candidateFile)) continue;
        if (referencePattern.test(candidateText)) productionConsumers.push(candidateFile);
      }
      const controllerConsumers = rootControllerTexts
        .filter((candidate) => referencePattern.test(candidate.text))
        .map((candidate) => candidate.file);
      const directlyConstructed = new RegExp(`new\\s+${name.replaceAll('$', '\\$')}\\s*\\(`).test(text) ||
        productionConsumers.some((consumerFile) => {
        const candidate = sourceByRelative.get(consumerFile);
        return new RegExp(`new\\s+${name.replaceAll('$', '\\$')}\\s*\\(`).test(candidate);
      });
      const registered = registrations.length > 0;
      const decoratorBound = !name.endsWith('Service') && controllerConsumers.length > 0;
      const middlewareRegistrations = [...modules.values()]
        .filter((module) => reachableModules.has(module.name))
        .filter((module) => {
          const moduleText = sourceByRelative.get(module.file) || '';
          return new RegExp(`\\.apply\\([^)]*\\b${name.replaceAll('$', '\\$')}\\b`).test(moduleText);
        });
      const middlewareRegistrationSites = middlewareRegistrations
        .map((module) => `${module.file}:${module.name}.MiddlewareConsumer.apply`);
      const middlewareBound = middlewareRegistrations.length > 0;
      const aliasTokens = [];
      for (const module of [...modules.values()].filter((item) => reachableModules.has(item.name))) {
        const moduleText = sourceByRelative.get(module.file) || '';
        const aliasPattern = new RegExp(
          `provide\\s*:\\s*([A-Za-z_$][\\w$]*)[\\s\\S]{0,240}use(?:Class|Existing)\\s*:\\s*${name.replaceAll('$', '\\$')}\\b`,
          'g',
        );
        for (const aliasMatch of moduleText.matchAll(aliasPattern)) {
          aliasTokens.push(aliasMatch[1]);
        }
      }
      const aliasConsumers = [];
      for (const token of unique(aliasTokens)) {
        const tokenPattern = new RegExp(
          `(?:@Inject\\(\\s*${token}\\s*\\)|inject\\s*:\\s*\\[[^\\]]*\\b${token}\\b)`,
        );
        for (const [candidateFile, candidateText] of sourceByRelative.entries()) {
          if (/(?:__tests__|\.spec\.|\.test\.)/.test(candidateFile)) continue;
          if (tokenPattern.test(candidateText)) aliasConsumers.push(candidateFile);
        }
      }
      const lifecycleRoot = /@(Cron|Interval|Timeout)\s*\(|\bimplements\b[^{\n]*(?:OnModuleInit|OnApplicationBootstrap|OnModuleDestroy|BeforeApplicationShutdown|OnApplicationShutdown)|\bonModuleInit\s*\(|\bonApplicationBootstrap\s*\(/.test(text);
      const registrationSites = unique([
        ...providerRegistrationSites,
        ...middlewareRegistrationSites,
      ]);
      const runtimeBound = registered || directlyConstructed || decoratorBound || middlewareBound;
      const reachable = runtimeBound && (
        controllerConsumers.length > 0 ||
        productionConsumers.length > 0 ||
        middlewareBound ||
        aliasConsumers.length > 0 ||
        lifecycleRoot
      );
      const activationConditions = unique([
        ...extractEnvConditions(text),
        ...registrations.flatMap((module) => module.activationConditions),
      ]);
      const defaultOff = defaultOffConditions(text, activationConditions).length > 0;
      const deliberatelyDormant = /(?:INTENTIONALLY_DORMANT|default-disabled|default disabled|DORMANT|NOT RUNTIME|no production call-site|test-only|test only|local\/dev only|dev only|sadece test|test ortamında|production['’]?da[^\n]*devre dışı)/i.test(text);
      const superseded = /@deprecated|superseded/i.test(text);
      const legacyOrphan = !superseded && /legacy/i.test(name) && !runtimeBound;
      const active = activationConditions.length === 0 ? true : defaultOff ? false : null;
      addCapability(
        'INT',
        `${file}:${name}`,
        {
          module: classifyWorkstream(file, name),
          name,
          historicalWorkRefs: historyRefFor(file),
          implementationFiles: [file],
          testFiles: testFilesFor(file, testFiles),
          entryPointType: /@Resolver\b/.test(text) ? 'GRAPHQL' : 'INTERNAL',
          expectedEntryPoints: [],
          actualEntryPoints: unique([
            ...(middlewareBound ? ['Nest MiddlewareConsumer.apply'] : []),
            ...(aliasConsumers.length > 0 ? ['Nest provider token alias'] : []),
            ...(lifecycleRoot ? ['Nest lifecycle/scheduler root'] : []),
          ]),
          providers: [name],
          consumers: unique([
            ...productionConsumers,
            ...middlewareRegistrations.map((module) => module.file),
            ...aliasConsumers,
            ...(lifecycleRoot ? ['Nest lifecycle/scheduler'] : []),
          ]),
          producers: [],
          registrationSites,
          activationConditions,
          runtimeBound,
          active,
          reachable: reachable && active !== false,
          consumerCount: unique([
            ...productionConsumers,
            ...middlewareRegistrations.map((module) => module.file),
            ...aliasConsumers,
            ...(lifecycleRoot ? ['Nest lifecycle/scheduler'] : []),
          ]).length,
          operable: null,
          independentlyVerified: false,
          verificationLevel: reachable ? 'L2' : runtimeBound ? 'L2' : 'L0',
          intentionallyDormant: deliberatelyDormant,
          defaultOff,
          superseded,
          legacyOrphan,
          breakpoint: runtimeBound
            ? reachable ? '' : `${name} production DI/constructor yüzeyinde mevcut fakat gerçek root consumer bulunamadı.`
            : `${name} production-reachable provider kaydında veya doğrudan construction path'inde bulunamadı.`,
          evidenceRefs: [
            `${file}:${classInfo.line}`,
            ...registrationSites,
            ...unique(productionConsumers).map((consumer) => `${consumer}:consumer-reference`),
          ],
          blockers: activationConditions.length > 0 ? ['DEPLOYED_ACTIVATION_VALUE_UNVERIFIED'] : [],
        },
      );
    }
  }

  for (const file of apiProductionFiles) {
    const text = sourceByRelative.get(file);
    const code = maskNonCode(text);
    for (const decorator of extractRuntimeDecorators(text)) {
      const prefix = code.slice(0, decorator.start);
      const classMatches = [...prefix.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)];
      const ownerClass = classMatches.at(-1)?.[1] || path.basename(file);
      const after = code.slice(decorator.end);
      const methodMatch = /^[ \t]*(?:public\s+|protected\s+|private\s+)?(?:async\s+)?([A-Za-z_$][\w$]*)\s*\(/m.exec(after);
      const methodName = methodMatch?.[1] || 'scheduledHandler';
      const registrations = providerRegistrations.get(ownerClass) || [];
      const bound = registrations.length > 0;
      const activationConditions = unique([
        ...extractEnvConditions(text),
        ...registrations.flatMap((module) => module.activationConditions),
      ]);
      const defaultOff = defaultOffConditions(text, activationConditions).length > 0;
      const active = activationConditions.length === 0 ? true : defaultOff ? false : null;
      addCapability(
        'SCH',
        `${file}:${ownerClass}.${methodName}:${decorator.name}:${decorator.args}`,
        {
          module: classifyWorkstream(file, `${ownerClass}.${methodName}`),
          name: `${ownerClass}.${methodName} — ${decorator.name}(${decorator.args.trim()})`,
          historicalWorkRefs: historyRefFor(file),
          implementationFiles: [file],
          testFiles: testFilesFor(file, testFiles),
          entryPointType: 'SCHEDULER',
          expectedEntryPoints: [`${decorator.name}(${decorator.args.trim()})`],
          actualEntryPoints: bound ? [`${decorator.name}(${decorator.args.trim()})`] : [],
          providers: [ownerClass],
          consumers: bound ? ['Nest ScheduleModule'] : [],
          producers: ['Nest ScheduleModule'],
          registrationSites: registrations.map((module) => `${module.file}:${module.name}.providers`),
          activationConditions,
          runtimeBound: bound,
          active,
          reachable: bound && active !== false,
          consumerCount: bound ? 1 : 0,
          operable: null,
          independentlyVerified: false,
          verificationLevel: bound ? 'L2' : 'L0',
          intentionallyDormant: /DORMANT|default-disabled/i.test(text),
          defaultOff,
          breakpoint: bound ? '' : `${ownerClass} production ScheduleModule graph'ında provider değil.`,
          evidenceRefs: [`${file}:${lineAt(text, decorator.start)}`],
          blockers: ['SCHEDULER_TRIGGER_NOT_DYNAMICALLY_OBSERVED'],
        },
      );
    }
  }

  const webPages = [...sourceByRelative.keys()]
    .filter((file) => file.startsWith('project/apps/web/src/app/'))
    .filter((file) => file.endsWith('/page.tsx') || file.endsWith('app/page.tsx'));
  const webTexts = [...sourceByRelative.entries()]
    .filter(([file]) => file.startsWith('project/apps/web/src/'));
  for (const file of webPages) {
    const segments = file
      .replace('project/apps/web/src/app/', '')
      .replace(/\/page\.tsx$/, '')
      .split('/')
      .filter(Boolean)
      .filter((segment) => !/^\(.+\)$/.test(segment));
    const privateSegment = segments.some((segment) => segment.startsWith('_'));
    const route = segments.length === 0 ? '/' : `/${segments.join('/')}`;
    const dynamicRoute = route.replace(/\[[^\]]+\]/g, '[param]');
    const staticNeedle = route.split('/').filter((segment) => segment && !segment.startsWith('[')).join('/');
    const navigationConsumers = webTexts
      .filter(([candidateFile]) => candidateFile !== file)
      .filter(([, text]) => {
        if (!staticNeedle) return false;
        return text.includes(`/${staticNeedle}`) || text.includes(route);
      })
      .map(([candidateFile]) => candidateFile);
    const text = sourceByRelative.get(file);
    const activationConditions = extractEnvConditions(text);
    const defaultOff = defaultOffConditions(text, activationConditions).length > 0;
    const runtimeBound = !privateSegment;
    const reachable = runtimeBound && (
      route === '/' ||
      route.startsWith('/auth/') ||
      route.startsWith('/portal') ||
      navigationConsumers.length > 0
    );
    addCapability(
      'UI',
      `${file}:${route}`,
      {
        module: 'FRONTEND / UI ACTIVATION',
        name: `Next.js route ${route}`,
        historicalWorkRefs: historyRefFor(file),
        implementationFiles: [file],
        testFiles: testFilesFor(file, testFiles),
        entryPointType: 'UI',
        expectedEntryPoints: [dynamicRoute],
        actualEntryPoints: runtimeBound ? [dynamicRoute] : [],
        providers: [path.basename(path.dirname(file))],
        consumers: unique(navigationConsumers),
        producers: ['Browser navigation'],
        registrationSites: [file],
        activationConditions,
        runtimeBound,
        active: activationConditions.length === 0 ? true : defaultOff ? false : null,
        reachable,
        consumerCount: unique(navigationConsumers).length,
        operable: null,
        independentlyVerified: false,
        verificationLevel: reachable ? 'L3' : runtimeBound ? 'L2' : 'L0',
        intentionallyDormant: privateSegment || /DORMANT|disabled/i.test(file),
        defaultOff,
        breakpoint: privateSegment
          ? 'Next.js private underscore segment production route üretmez.'
          : reachable ? '' : 'Route dosyası mevcut fakat repository içinde navigation/action consumer bulunamadı.',
        evidenceRefs: [
          `${file}:1`,
          ...unique(navigationConsumers).map((consumer) => `${consumer}:navigation-reference`),
        ],
        blockers: reachable ? ['UI_RUNTIME_NOT_INDEPENDENTLY_VERIFIED'] : [],
      },
    );
  }

  const packageFiles = [
    path.join(projectRoot, 'package.json'),
    path.join(projectRoot, 'apps', 'api', 'package.json'),
    path.join(projectRoot, 'apps', 'web', 'package.json'),
  ];
  for (const packageFile of packageFiles) {
    const packageJson = JSON.parse(fs.readFileSync(packageFile, 'utf8'));
    const file = relative(repoRoot, packageFile);
    for (const [scriptName, command] of Object.entries(packageJson.scripts || {})) {
      if (!/^(?:start|dev|build|test|lint|type-check|db:|seed:|inventory:|backfill:|orch:|verify:|smoke:)/.test(scriptName)) {
        continue;
      }
      addCapability(
        'CLI',
        `${file}:${scriptName}:${command}`,
        {
          module: scriptName.startsWith('orch:') || scriptName.startsWith('verify:')
            ? 'GOVERNANCE / ORCHESTRATION'
            : classifyWorkstream(file, scriptName),
          name: `${packageJson.name}:${scriptName}`,
          historicalWorkRefs: historyRefFor(file),
          implementationFiles: [file],
          testFiles: [],
          entryPointType: 'CLI',
          expectedEntryPoints: [`pnpm ${scriptName}`],
          actualEntryPoints: [`pnpm ${scriptName}`],
          providers: [String(command)],
          consumers: ['package manager / operator'],
          producers: ['operator or CI'],
          registrationSites: [`${file}:scripts.${scriptName}`],
          activationConditions: [],
          runtimeBound: true,
          active: true,
          reachable: true,
          consumerCount: 1,
          operable: null,
          independentlyVerified: false,
          verificationLevel: 'L3',
          breakpoint: '',
          evidenceRefs: [`${file}:scripts.${scriptName}`],
          blockers: ['COMMAND_NOT_INDEPENDENTLY_EXECUTED_IN_THIS_AUDIT'],
        },
      );
    }
  }

  const schemaFile = 'project/apps/api/prisma/schema.prisma';
  const migrationsDirectory = path.join(projectRoot, 'apps', 'api', 'prisma', 'migrations');
  const migrationFiles = walk(migrationsDirectory, (file) => file.endsWith('migration.sql'))
    .map((file) => relative(repoRoot, file));
  if (fs.existsSync(path.join(repoRoot, schemaFile))) {
    addCapability(
      'MIG',
      `${schemaFile}:${migrationFiles.length}`,
      {
        module: 'SHARED PLATFORM / INFRASTRUCTURE',
        name: `Prisma migration chain (${migrationFiles.length} migrations)`,
        historicalWorkRefs: historyRefFor(schemaFile),
        implementationFiles: [schemaFile, ...migrationFiles],
        testFiles: [],
        entryPointType: 'MIGRATION',
        expectedEntryPoints: ['prisma migrate deploy'],
        actualEntryPoints: ['CI Test Suite', 'CI Client Workspace Live Smoke'],
        providers: ['Prisma Migrate'],
        consumers: ['GitHub Actions disposable PostgreSQL 16 jobs'],
        producers: ['migration.sql'],
        registrationSites: ['.github/workflows/ci.yml:Prisma migrate deploy'],
        activationConditions: ['DATABASE_URL'],
        runtimeBound: true,
        active: null,
        reachable: true,
        consumerCount: 2,
        operable: null,
        independentlyVerified: false,
        verificationLevel: 'L3',
        breakpoint: '',
        evidenceRefs: [
          schemaFile,
          '.github/workflows/ci.yml:Prisma migrate deploy',
        ],
        blockers: ['DEPLOYED_MIGRATION_STATE_NOT_READ'],
      },
    );
  }

  if (args.dynamicEvidence) {
    const dynamicPath = path.resolve(repoRoot, args.dynamicEvidence);
    if (!dynamicPath.startsWith(`${repoRoot}${path.sep}`)) throw new Error('DYNAMIC_EVIDENCE_OUTSIDE_REPOSITORY');
    const panel = JSON.parse(fs.readFileSync(dynamicPath, 'utf8'));
    if (panel.verifiedAtSha !== auditBaseSha) throw new Error('DYNAMIC_EVIDENCE_SHA_MISMATCH');
    for (const capability of panel.capabilities || []) {
      const implementationFile = 'project/scripts/orchestration-v2/delivery/manifest.cjs';
      const verified = capability.verdict === 'PASS' && capability.verifiedAtSha === auditBaseSha;
      addCapability(
        'DYN',
        `delivery:${capability.capabilityId}`,
        {
          module: 'GOVERNANCE / ORCHESTRATION',
          name: capability.capabilityId,
          historicalWorkRefs: historyRefFor(implementationFile),
          implementationFiles: [implementationFile, 'project/scripts/orchestration-v2/delivery/probes.cjs'],
          testFiles: ['project/scripts/orchestration-v2/delivery/delivery.test.cjs'],
          entryPointType: 'CLI',
          expectedEntryPoints: [capability.detail || capability.capabilityId],
          actualEntryPoints: [capability.detail || capability.capabilityId],
          providers: [capability.probeId],
          consumers: ['shipped public entrypoint verifier'],
          producers: ['operator'],
          registrationSites: [`${implementationFile}:CAPABILITIES`],
          activationConditions: [],
          runtimeBound: capability.observedState !== 'UNWIRED',
          active: capability.observedState !== 'WIRED_DISABLED',
          reachable: !['UNWIRED', 'NOT_RUN'].includes(capability.observedState),
          consumerCount: 1,
          operable: verified,
          independentlyVerified: verified,
          activationVerified: true,
          verificationLevel: verified ? 'L6' : 'L3',
          dynamicStatus: `${capability.verdict}:${capability.observedState}`,
          finalStatus: verified ? 'VERIFIED_OPERATIONAL' : undefined,
          breakpoint: verified ? '' : capability.failureCode || capability.detail || 'DYNAMIC_VERIFICATION_FAILED',
          evidenceRefs: [
            args.dynamicEvidence,
            `${implementationFile}:CAPABILITIES`,
            'project/scripts/orchestration-v2/delivery/probes.cjs',
          ],
          blockers: verified ? [] : [capability.failureCode || 'DYNAMIC_VERIFICATION_FAILED'],
        },
      );
    }
  }

  applyDispositionRegistry(capabilities, dispositionRegistry);

  capabilities.sort((a, b) => a.capabilityId.localeCompare(b.capabilityId));
  for (const item of historicalItems.values()) {
    item.claimedCapabilities = unique(item.claimedCapabilities);
    item.expectedEntryPoints = unique(item.expectedEntryPoints);
    item.expectedConsumers = unique(item.expectedConsumers);
    item.expectedActivationConditions = unique(item.expectedActivationConditions);
    const modulesForItem = unique(
      item.claimedCapabilities
        .map((id) => capabilities.find((record) => record.capabilityId === id)?.module)
        .filter(Boolean),
    );
    if (modulesForItem.length === 1) {
      item.module = modulesForItem[0];
    } else if (modulesForItem.length > 1) {
      item.module = 'CROSS_MODULE / SHARED';
    } else {
      const modulesFromFiles = unique(
        item.changedFiles.map((file) => classifyWorkstream(file, item.title)),
      );
      item.module = modulesFromFiles.length === 1
        ? modulesFromFiles[0]
        : 'CROSS_MODULE / SHARED';
    }
  }

  const counts = {
    totalHistoricalWorkItems: historicalItems.size,
    totalCapabilities: capabilities.length,
    codePresent: capabilities.filter((item) => item.codePresent).length,
    runtimeBound: capabilities.filter((item) => item.runtimeBound).length,
    runtimeBoundGap: capabilities.length - capabilities.filter((item) => item.runtimeBound).length,
    active: capabilities.filter((item) => item.runtimeBound && item.active === true).length,
    reachable: capabilities.filter((item) => item.runtimeBound && item.active === true && item.reachable).length,
    activeReachabilityGap: capabilities.filter((item) => item.runtimeBound && item.active === true).length -
      capabilities.filter((item) => item.runtimeBound && item.active === true && item.reachable).length,
    consumed: capabilities.filter((item) =>
      item.runtimeBound && item.active === true && item.reachable && item.consumerCount > 0
    ).length,
    operable: capabilities.filter((item) =>
      item.runtimeBound && item.active === true && item.reachable && item.operable === true
    ).length,
    verifiedOperational: capabilities.filter((item) => item.finalStatus === 'VERIFIED_OPERATIONAL').length,
    codePresentUnbound: capabilities.filter((item) => item.finalStatus === 'CODE_PRESENT_UNBOUND').length,
    intentionallyDormant: capabilities.filter((item) => item.finalStatus === 'INTENTIONALLY_DORMANT').length,
    boundDormant: capabilities.filter((item) => item.finalStatus === 'BOUND_DORMANT').length,
    activeUnreachable: capabilities.filter((item) => item.finalStatus === 'ACTIVE_UNREACHABLE').length,
    reachableNonOperable: capabilities.filter((item) => item.finalStatus === 'REACHABLE_NON_OPERABLE').length,
    operableUnverified: capabilities.filter((item) => item.finalStatus === 'OPERABLE_UNVERIFIED').length,
    superseded: capabilities.filter((item) => item.finalStatus === 'SUPERSEDED').length,
    legacyOrphan: capabilities.filter((item) => item.finalStatus === 'LEGACY_ORPHAN').length,
    unknown: capabilities.filter((item) => item.finalStatus === 'UNKNOWN_REQUIRES_EVIDENCE').length,
    incorrectlyClosed: capabilities.filter((item) =>
      item.historicalWorkRefs.some((ref) => HISTORICAL_CLOSED.has(historicalItems.get(ref)?.originalStatus)) &&
      ['CODE_PRESENT_UNBOUND', 'BOUND_DORMANT', 'ACTIVE_UNREACHABLE', 'REACHABLE_NON_OPERABLE'].includes(item.finalStatus)
    ).length,
  };
  counts.implementationRate = percent(counts.codePresent, counts.totalCapabilities);
  counts.bindingRate = percent(counts.runtimeBound, counts.codePresent);
  counts.activationRate = percent(counts.active, counts.runtimeBound);
  counts.reachabilityRate = percent(counts.reachable, counts.active);
  counts.operabilityRate = percent(counts.operable, counts.reachable);
  counts.verifiedDeliveryRate = percent(counts.verifiedOperational, counts.totalCapabilities);
  const historicallyClosed = capabilities.filter((item) =>
    item.historicalWorkRefs.some((ref) => HISTORICAL_CLOSED.has(historicalItems.get(ref)?.originalStatus))
  ).length;
  counts.falseClosureRate = percent(counts.incorrectlyClosed, historicallyClosed);
  counts.historicallyClosedCapabilities = historicallyClosed;

  const modulesForScorecard = unique(capabilities.map((item) => item.module));
  const scorecards = modulesForScorecard.map((module) => {
    const rows = capabilities.filter((item) => item.module === module);
    const historical = unique(rows.flatMap((item) => item.historicalWorkRefs));
    const verified = rows.filter((item) => item.finalStatus === 'VERIFIED_OPERATIONAL').length;
    const falselyClosed = rows.filter((item) =>
      item.historicalWorkRefs.some((ref) => HISTORICAL_CLOSED.has(historicalItems.get(ref)?.originalStatus)) &&
      ['CODE_PRESENT_UNBOUND', 'BOUND_DORMANT', 'ACTIVE_UNREACHABLE', 'REACHABLE_NON_OPERABLE'].includes(item.finalStatus)
    ).length;
    const severityOrder = ['P0', 'P1', 'P2', 'P3', 'NONE'];
    const riskLevel = severityOrder.find((severity) => rows.some((item) => item.severity === severity)) || 'NONE';
    return {
      module,
      historicalItems: historical.length,
      capabilities: rows.length,
      codePresent: rows.filter((item) => item.codePresent).length,
      bound: rows.filter((item) => item.runtimeBound).length,
      active: rows.filter((item) => item.runtimeBound && item.active === true).length,
      reachable: rows.filter((item) => item.runtimeBound && item.active === true && item.reachable).length,
      operable: rows.filter((item) =>
        item.runtimeBound && item.active === true && item.reachable && item.operable === true
      ).length,
      verified,
      unbound: rows.filter((item) => item.finalStatus === 'CODE_PRESENT_UNBOUND').length,
      dormant: rows.filter((item) => item.finalStatus === 'BOUND_DORMANT').length,
      falselyClosed,
      deliveryPercent: percent(verified, rows.length),
      riskLevel,
    };
  });

  const inventory = {
    schemaVersion: 1,
    program: 'REPOSITORY-WIDE RUNTIME BINDING, ACTIVATION AND OPERABILITY RECONCILIATION PROGRAM — R01',
    metadata: {
      auditBaseSha,
      auditStartedAt: new Date(args.auditStartedAt).toISOString(),
      branch,
      gitCommonDirectory: normalize(commonDirectory),
      scanner: relative(repoRoot, __filename),
      scannerSha256: sha256(fs.readFileSync(__filename)),
      dispositionFile: dispositionRegistry.path,
      dispositionRegistrySha256: dispositionRegistry.sha256,
      sourceFileCount: sourceFiles.length,
      productionModuleCount: modules.size,
      productionReachableModuleCount: reachableModules.size,
      evidenceBoundary: 'REPOSITORY_STATIC_PLUS_EXPLICIT_SHA_BOUND_DYNAMIC_EVIDENCE',
    },
    counts,
    moduleScorecards: scorecards,
    historicalWorkItems: [...historicalItems.values()]
      .sort((a, b) => a.historicalWorkId.localeCompare(b.historicalWorkId)),
    capabilities,
  };

  fs.mkdirSync(outputDirectory, { recursive: true });
  const jsonPath = path.join(outputDirectory, 'runtime-capability-inventory.json');
  if (!args.successorOnly) {
    fs.writeFileSync(jsonPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');
  }

  const columns = [
    'capabilityId',
    'module',
    'capabilityName',
    'historicalStatus',
    'codePresent',
    'runtimeBound',
    'active',
    'reachable',
    'consumerCount',
    'operable',
    'independentlyVerified',
    'finalStatus',
    'severity',
    'breakpoint',
    'evidence',
    'recommendedAction',
  ];
  const csvRows = [columns.map(csvCell).join(',')];
  for (const record of capabilities) {
    const historicalStatuses = unique(
      record.historicalWorkRefs.map((ref) => historicalItems.get(ref)?.originalStatus).filter(Boolean),
    );
    csvRows.push([
      record.capabilityId,
      record.module,
      record.name,
      historicalStatuses,
      record.codePresent,
      record.runtimeBound,
      record.active,
      record.reachable,
      record.consumerCount,
      record.operable,
      record.independentlyVerified,
      record.finalStatus,
      record.severity,
      record.breakpoint,
      record.evidenceRefs,
      record.recommendedAction,
    ].map(csvCell).join(','));
  }
  if (!args.successorOnly) {
    fs.writeFileSync(path.join(outputDirectory, 'runtime-binding-matrix.csv'), `${csvRows.join('\n')}\n`, 'utf8');
  }

  const openStatuses = new Set([
    'CODE_PRESENT_UNBOUND',
    'BOUND_DORMANT',
    'ACTIVE_UNREACHABLE',
    'REACHABLE_NON_OPERABLE',
  ]);
  const openGroups = new Map();
  for (const record of capabilities.filter((item) => openStatuses.has(item.finalStatus))) {
    const file = record.implementationFiles[0] || 'UNKNOWN_FILE';
    const key = `${record.finalStatus}\x1f${record.module}\x1f${file}`;
    if (!openGroups.has(key)) {
      openGroups.set(key, {
        status: record.finalStatus,
        module: record.module,
        file,
        severity: record.severity,
        records: [],
      });
    }
    openGroups.get(key).records.push(record);
  }
  const openRegisterLines = [
    '# Unbound and Dormant Register — R01',
    '',
    `Audit base: \`${auditBaseSha}\``,
    `Generated by: \`${relative(repoRoot, __filename)}\``,
    '',
    'Bu register mekanik envanterin açık binding/activation/reachability kırılmalarını eksiksiz gruplar.',
    'Her capability için tekil satır ve tam kanıt zinciri `runtime-binding-matrix.csv` ile',
    '`runtime-capability-inventory.json` içindedir. P0 yalnız doğrulanmış canlı exposure ile verilebilir;',
    'isim eşleşmesinden P0 üretilmez.',
    '',
    '## Sayısal Özet',
    '',
    '| Durum | Adet |',
    '|---|---:|',
    `| CODE_PRESENT_UNBOUND | ${counts.codePresentUnbound} |`,
    `| BOUND_DORMANT | ${counts.boundDormant} |`,
    `| ACTIVE_UNREACHABLE | ${counts.activeUnreachable} |`,
    `| REACHABLE_NON_OPERABLE | ${counts.reachableNonOperable} |`,
    `| P0 doğrulanmış | ${capabilities.filter((item) => item.severity === 'P0').length} |`,
    '',
    '## Eksiksiz Gruplu Register',
    '',
    '| Durum | Severity | Modül | Kaynak | Adet | Capability ID ve adları | Breakpoint | Önerilen disposition |',
    '|---|---|---|---|---:|---|---|---|',
  ];
  for (const group of [...openGroups.values()].sort((a, b) =>
    a.status.localeCompare(b.status) ||
    a.module.localeCompare(b.module) ||
    a.file.localeCompare(b.file))) {
    openRegisterLines.push(
      `| ${group.status} | ${group.severity} | ${markdownCell(group.module)} | ` +
      `\`${markdownCell(group.file)}\` | ${group.records.length} | ` +
      `${markdownCell(group.records.map((item) => `${item.capabilityId} — ${item.name}`))} | ` +
      `${markdownCell(unique(group.records.map((item) => item.breakpoint).filter(Boolean)))} | ` +
      `${markdownCell(unique(group.records.map((item) => item.recommendedAction)))} |`,
    );
  }
  openRegisterLines.push(
    '',
    '## Manuel yüksek-önem doğrulama sonucu',
    '',
    '- Break-glass controller’ları ve provider zinciri bir `BreakGlassModule` içinde tanımlı; bu modül production-reachable import graph’ında yoktur ve in-memory repository kullanır. Otomatik binding yapılmadı.',
    '- Playbook controller’ları `PlaybookModule` içinde tanımlı; `DiagnosticsModule` yalnız validator/registry/matcher servislerini doğrudan sağlar, `PlaybookModule` import etmez. Controller yüzeyi unbound kalır.',
    '- `ManifestAdminController` testlerde doğrudan instantiate edilir; production module controller listesinde bulunmaz. Mevcut önceki audit ile uyumludur; admin attack surface’i owner kararı olmadan açılmadı.',
    '- Chaos ve `__test__` HTTP yüzeyleri kaynak yorumları ve production boundary kuralları nedeniyle `INTENTIONALLY_DORMANT` olarak ayrıldı; açık register’a dahil edilmedi.',
    '- `RequestIdMiddleware` ve `HttpMetricsMiddleware`, `AppModule.configure()` içindeki `MiddlewareConsumer.apply()` kaydı üzerinden bağlı ve erişilebilir olarak doğrulandı.',
    '',
  );
  if (!args.successorOnly) {
    fs.writeFileSync(
      path.join(outputDirectory, 'unbound-and-dormant-register.md'),
      `${openRegisterLines.join('\n')}\n`,
      'utf8',
    );
  }

  const historicalStatusCounts = new Map();
  for (const item of historicalItems.values()) {
    historicalStatusCounts.set(
      item.originalStatus,
      (historicalStatusCounts.get(item.originalStatus) || 0) + 1,
    );
  }
  const historicalCapabilityCrossTab = new Map();
  for (const record of capabilities) {
    for (const ref of record.historicalWorkRefs) {
      const originalStatus = historicalItems.get(ref)?.originalStatus || 'UNKNOWN';
      const key = `${originalStatus}\x1f${record.finalStatus}`;
      historicalCapabilityCrossTab.set(key, (historicalCapabilityCrossTab.get(key) || 0) + 1);
    }
  }
  const closedCapabilities = capabilities.filter((record) =>
    record.historicalWorkRefs.some((ref) =>
      HISTORICAL_CLOSED.has(historicalItems.get(ref)?.originalStatus)));
  const closureLines = [
    '# Historical Closure Reconciliation — R01',
    '',
    `Audit base: \`${auditBaseSha}\``,
    `Tarihsel commit: ${historicalItems.size}`,
    `Closure/closeout/standalone CLOSED iddiasıyla ilişkili capability: ${closedCapabilities.length}`,
    '',
    '## Yöntem ve kanıt sınırı',
    '',
    '- Audit base’in bütün Git commit’leri tekil `historicalWorkId` ile envantere alındı.',
    '- Her capability, implementation dosyasına dokunan bütün commit’lerle ilişkilendirildi; yalnız son commit kullanılmadı.',
    '- Squash subject sonundaki `(#N)` PR referansı olarak kaydedildi. PR gövdesi veya runtime beyanı subject’ten türetilmedi.',
    '- `CANONICAL`, `MERGED` ve `IMPLEMENTED` kayıtları tarihsel iddia olarak matriste korunur; false-closure paydasına yalnız gerçek closure/closeout/standalone CLOSED ve PASS girer.',
    '- `fail-closed` bir closure beyanı değildir ve CLOSED sayılmaz.',
    '- CLOSED beyanı geçmişten silinmez; güncel capability durumu yanına eklenir.',
    '',
    '## Tarihsel kayıt dağılımı',
    '',
    '| Original status | Tarihsel iş |',
    '|---|---:|',
  ];
  for (const [status, count] of [...historicalStatusCounts].sort((a, b) => a[0].localeCompare(b[0]))) {
    closureLines.push(`| ${status} | ${count} |`);
  }
  closureLines.push(
    '',
    '## Original status → güncel capability çapraz tablosu',
    '',
    'Bu tablo non-exclusive’dir: bir capability birden fazla tarihsel commit statüsüyle ilişkili olabilir.',
    '',
    '| Original status | Güncel final status | İlişki adedi |',
    '|---|---|---:|',
  );
  for (const [key, count] of [...historicalCapabilityCrossTab].sort((a, b) => a[0].localeCompare(b[0]))) {
    const [originalStatus, finalStatus] = key.split('\x1f');
    closureLines.push(`| ${originalStatus} | ${finalStatus} | ${count} |`);
  }
  closureLines.push(
    '',
    '## Closure iddialarının tekil uzlaştırması',
    '',
    '| Capability | Original claim(s) | Güncel durum | Reconciliation | Kanıt / breakpoint |',
    '|---|---|---|---|---|',
  );
  for (const record of closedCapabilities) {
    const claims = record.historicalWorkRefs
      .map((ref) => historicalItems.get(ref))
      .filter((item) => item && HISTORICAL_CLOSED.has(item.originalStatus))
      .map((item) => `${item.historicalWorkId} ${item.originalStatus}: ${item.title}`);
    closureLines.push(
      `| ${record.capabilityId} — ${markdownCell(record.name)} | ${markdownCell(claims)} | ` +
      `${record.finalStatus} | ${closureReconciliationStatus(record.finalStatus)} | ` +
      `${markdownCell(record.breakpoint || record.evidenceRefs.slice(0, 3))} |`,
    );
  }
  closureLines.push(
    '',
    `INCORRECTLY_CLOSED_COUNT: ${counts.incorrectlyClosed}`,
    `HISTORICALLY_CLOSED_COUNT: ${counts.historicallyClosedCapabilities}`,
    `FALSE_CLOSURE_RATE: ${counts.falseClosureRate}%`,
    '',
    'Not: `CLOSED_BUT_UNVERIFIED`, geçmişteki kapanışın otomatik olarak yanlış olduğu anlamına gelmez;',
    'yalnız bu audit’in L6 bağımsız runtime teslim kanıtı üretmediğini gösterir.',
    '',
  );
  if (!args.successorOnly) {
    fs.writeFileSync(
      path.join(outputDirectory, 'historical-closure-reconciliation.md'),
      `${closureLines.join('\n')}\n`,
      'utf8',
    );
  }

  let successor = null;
  let successorAssertions = [];
  if (args.successorOnly) {
    successor = buildSuccessorModel(
      repoRoot,
      args,
      auditBaseSha,
      inventory,
      historicalItems,
      capabilities,
    );
    successorAssertions = writeSuccessorArtifacts(outputDirectory, successor, inventory);
  }

  process.stdout.write(`${JSON.stringify({
    status: args.successorOnly
      ? 'RUNTIME_OPERABILITY_CERTIFICATION_SUCCESSOR_GENERATED'
      : 'RUNTIME_BINDING_RECONCILIATION_INVENTORY_GENERATED',
    auditBaseSha,
    outputDirectory: relative(repoRoot, outputDirectory),
    counts,
    scorecards,
    successorMetrics: successor?.metrics || null,
    successorAssertions,
  }, null, 2)}\n`);
}

if (require.main === module) main();

module.exports = {
  buildClosureCapabilityMappings,
  buildClosureCertifications,
  classifyClosureCapabilityMapping,
  closureCertificationStatus,
  dispositionFingerprint,
  applyDispositionRegistry,
  extractRuntimeClassDeclarations,
  extractRuntimeDecorators,
  loadDispositionRegistry,
  maskNonCode,
  validateDispositionRegistryShape,
  isReliableClosureClaim,
  legacyHistoricalStatusForTitle,
  parseHistoricalClosureClaim,
};

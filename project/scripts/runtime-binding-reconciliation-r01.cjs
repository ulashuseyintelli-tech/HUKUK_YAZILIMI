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

function parseArgs(argv) {
  const out = {
    outDir: null,
    auditStartedAt: null,
    dynamicEvidence: null,
  };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--out-dir') out.outDir = argv[++index];
    else if (arg === '--audit-started-at') out.auditStartedAt = argv[++index];
    else if (arg === '--dynamic-evidence') out.dynamicEvidence = argv[++index];
    else if (arg === '--help') {
      process.stdout.write(
        [
          'Usage:',
          '  node scripts/runtime-binding-reconciliation-r01.cjs',
          '    --out-dir <repo-relative-directory>',
          '    --audit-started-at <ISO-8601>',
          '    [--dynamic-evidence <repo-relative-json>]',
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

function history(repoRoot, scopes) {
  const args = [
    'log',
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

function historicalClaim(commit) {
  if (!commit) return null;
  const prMatch = /\(#(\d+)\)\s*$/.exec(commit.subject);
  return {
    historicalWorkId: `HIST-${commit.sha.slice(0, 12).toUpperCase()}`,
    title: commit.subject,
    sourceRefs: [`git:${commit.sha}`],
    prNumbers: prMatch ? [Number(prMatch[1])] : [],
    mergeShas: [commit.sha],
    originalStatus: /(?:\bclosure\b|\bcloseout\b|(?<![-\w])closed(?![-\w]))/i.test(commit.subject)
      ? 'CLOSED'
      : /\bcanonical(?:ize|ization|ized)?\b/i.test(commit.subject)
        ? 'CANONICAL'
        : prMatch ? 'MERGED' : 'IMPLEMENTED',
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

function main() {
  const args = parseArgs(process.argv.slice(2));
  const scriptDirectory = __dirname;
  const projectRoot = path.resolve(scriptDirectory, '..');
  const repoRoot = path.resolve(projectRoot, '..');
  const outputDirectory = path.resolve(repoRoot, args.outDir);
  if (!outputDirectory.startsWith(`${repoRoot}${path.sep}`)) throw new Error('OUT_DIR_OUTSIDE_REPOSITORY');

  const auditBaseSha = git(repoRoot, 'rev-parse', 'HEAD');
  const commonDirectory = git(repoRoot, 'rev-parse', '--git-common-dir');
  const branch = git(repoRoot, 'branch', '--show-current');
  const treeStatus = git(repoRoot, 'status', '--porcelain');
  if (treeStatus) {
    const scannerPath = relative(repoRoot, __filename);
    const scannerTestPath = relative(
      repoRoot,
      path.join(__dirname, 'runtime-binding-reconciliation-r01.test.cjs'),
    );
    const allowedOutputPrefix = `${normalize(args.outDir).replace(/\/+$/, '')}/`;
    const unexpected = treeStatus
      .split(/\r?\n/)
      .filter(Boolean)
      .map((line) => normalize(line.slice(3).trim()))
      .filter((file) =>
        file !== scannerPath &&
        file !== scannerTestPath &&
        !file.startsWith(allowedOutputPrefix));
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
    const classes = [];
    for (const match of text.matchAll(/\b(?:export\s+)?(?:abstract\s+)?class\s+([A-Za-z_$][\w$]*)/g)) {
      classes.push({ name: match[1], offset: match.index, line: lineAt(text, match.index) });
      if (!classIndex.has(match[1])) classIndex.set(match[1], []);
      classIndex.get(match[1]).push(file);
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

  const historyData = history(repoRoot, []);
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

  const controllerFiles = apiProductionFiles.filter((file) => file.endsWith('.controller.ts'));
  for (const file of controllerFiles) {
    const text = sourceByRelative.get(file);
    const classMatch = /(?:export\s+)?class\s+([A-Za-z_$][\w$]*Controller)\b/.exec(text);
    if (!classMatch) continue;
    const controllerName = classMatch[1];
    const classOffset = classMatch.index;
    const controllerPrefix = text.slice(Math.max(0, classOffset - 3000), classOffset);
    const controllerDecorators = [...controllerPrefix.matchAll(/@Controller(?:\s*\(([^)]*)\))?/g)];
    const controllerDecorator = controllerDecorators.at(-1);
    const baseRoute = controllerDecorator ? stringLiteral(controllerDecorator[1]) : '';
    const classBrace = text.indexOf('{', classOffset + classMatch[0].length);
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
    for (const match of text.matchAll(/@(Cron|Interval|Timeout)\s*\(([^)]*)\)/g)) {
      const prefix = text.slice(0, match.index);
      const classMatches = [...prefix.matchAll(/\bclass\s+([A-Za-z_$][\w$]*)/g)];
      const ownerClass = classMatches.at(-1)?.[1] || path.basename(file);
      const after = text.slice(match.index + match[0].length);
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
        `${file}:${ownerClass}.${methodName}:${match[1]}:${match[2]}`,
        {
          module: classifyWorkstream(file, `${ownerClass}.${methodName}`),
          name: `${ownerClass}.${methodName} — ${match[1]}(${match[2].trim()})`,
          historicalWorkRefs: historyRefFor(file),
          implementationFiles: [file],
          testFiles: testFilesFor(file, testFiles),
          entryPointType: 'SCHEDULER',
          expectedEntryPoints: [`${match[1]}(${match[2].trim()})`],
          actualEntryPoints: bound ? [`${match[1]}(${match[2].trim()})`] : [],
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
          evidenceRefs: [`${file}:${lineAt(text, match.index)}`],
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
    active: capabilities.filter((item) => item.runtimeBound && item.active === true).length,
    reachable: capabilities.filter((item) => item.runtimeBound && item.active === true && item.reachable).length,
    consumed: capabilities.filter((item) =>
      item.runtimeBound && item.active === true && item.reachable && item.consumerCount > 0
    ).length,
    operable: capabilities.filter((item) =>
      item.runtimeBound && item.active === true && item.reachable && item.operable === true
    ).length,
    verifiedOperational: capabilities.filter((item) => item.finalStatus === 'VERIFIED_OPERATIONAL').length,
    codePresentUnbound: capabilities.filter((item) => item.finalStatus === 'CODE_PRESENT_UNBOUND').length,
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
  fs.writeFileSync(jsonPath, `${JSON.stringify(inventory, null, 2)}\n`, 'utf8');

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
  fs.writeFileSync(path.join(outputDirectory, 'runtime-binding-matrix.csv'), `${csvRows.join('\n')}\n`, 'utf8');

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
    `Audit base: \`${auditBaseSha}\`  `,
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
  fs.writeFileSync(
    path.join(outputDirectory, 'unbound-and-dormant-register.md'),
    `${openRegisterLines.join('\n')}\n`,
    'utf8',
  );

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
    `Audit base: \`${auditBaseSha}\`  `,
    `Tarihsel commit: ${historicalItems.size}  `,
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
    `INCORRECTLY_CLOSED_COUNT: ${counts.incorrectlyClosed}  `,
    `HISTORICALLY_CLOSED_COUNT: ${counts.historicallyClosedCapabilities}  `,
    `FALSE_CLOSURE_RATE: ${counts.falseClosureRate}%`,
    '',
    'Not: `CLOSED_BUT_UNVERIFIED`, geçmişteki kapanışın otomatik olarak yanlış olduğu anlamına gelmez;',
    'yalnız bu audit’in L6 bağımsız runtime teslim kanıtı üretmediğini gösterir.',
    '',
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'historical-closure-reconciliation.md'),
    `${closureLines.join('\n')}\n`,
    'utf8',
  );

  process.stdout.write(`${JSON.stringify({
    status: 'RUNTIME_BINDING_RECONCILIATION_INVENTORY_GENERATED',
    auditBaseSha,
    outputDirectory: relative(repoRoot, outputDirectory),
    counts,
    scorecards,
  }, null, 2)}\n`);
}

main();

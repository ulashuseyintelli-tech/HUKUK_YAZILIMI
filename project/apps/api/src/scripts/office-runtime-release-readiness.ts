/**
 * OFFICE-P6A-RUNTIME-TRUTH-AND-RELEASE-R01
 *
 * Read-only source/dist/ancestry/consumer ve release-delta scanner'i.
 *
 * Dogrudan calistirma (package.json girdisi gerekmez):
 *   npx --yes tsx src/scripts/office-runtime-release-readiness.ts \
 *     --repo-root=<canonical-or-isolated-repo-root> \
 *     --runtime-root=<runtime-worktree-root> \
 *     [--canonical-ref=origin/main] [--format=json|text]
 *
 * Script dosya, git ref, DB, runtime veya process state'i DEGISTIRMEZ. Process
 * komut satirlarini ciktiya yazmaz; yalniz redacted signature ve PID kaydeder.
 */
import { createHash } from 'crypto';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import { spawnSync } from 'child_process';

import {
  classifyDeltaPath,
  evaluateCapability,
  redactProcessSignature,
  type AncestryEvidence,
  type CapabilityEvidence,
  type ConsumerEvidence,
  type DistEvidence,
  type ProgramClass,
  type SourceEvidence,
} from './office-runtime-release-readiness.core';

interface ArtifactSpec {
  sourcePath: string;
  distPath: string;
  distMarkers: string[];
}

interface CapabilitySpec {
  id: string;
  label: string;
  commits: string[];
  artifacts: ArtifactSpec[];
}

interface ProcessRow {
  pid: number;
  parentPid: number;
  name: string;
  commandLine: string;
}

interface ScannedConsumer extends ConsumerEvidence {
  signatures: string[];
}

const CAPABILITIES: CapabilitySpec[] = [
  {
    id: 'F01_AUTHORIZATION_ENFORCEMENT',
    label: 'F01 authorization enforcement',
    commits: ['2cae1fb11685674fe78898d2781f06f5f6f30aeb'],
    artifacts: [
      {
        sourcePath: 'project/apps/api/src/modules/office-approval/office-f01-authorization.guard.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/modules/office-approval/office-f01-authorization.guard.js',
        distMarkers: ['OFFICE_F01_AUTHORIZATION_REQUIRED'],
      },
      {
        sourcePath: 'project/apps/api/src/modules/office/office-f01-projection.ts',
        distPath: 'project/apps/api/dist/apps/api/src/modules/office/office-f01-projection.js',
        distMarkers: ['PUBLIC_S0_ONLY', 'AUTHORIZED_S0_S1'],
      },
      {
        sourcePath: 'project/apps/api/src/modules/lawyer/lawyer.service.ts',
        distPath: 'project/apps/api/dist/apps/api/src/modules/lawyer/lawyer.service.js',
        distMarkers: ['isF01ActorAuthorized'],
      },
      {
        sourcePath: 'project/apps/api/src/modules/office/office.service.ts',
        distPath: 'project/apps/api/dist/apps/api/src/modules/office/office.service.js',
        distMarkers: ['office-f01-projection'],
      },
    ],
  },
  {
    id: 'LAWYER_CREDENTIAL_RESPONSE_CONTAINMENT',
    label: 'Lawyer credential response containment',
    commits: ['8899cf5fae135e55955c8cbe01927976f80f1db9'],
    artifacts: [
      {
        sourcePath: 'project/apps/api/src/modules/lawyer/lawyer-public-projection.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/modules/lawyer/lawyer-public-projection.js',
        distMarkers: ['uyapToken', 'eSignatureSerial', 'toPublicLawyer'],
      },
      {
        sourcePath: 'project/apps/api/src/modules/lawyer/lawyer.service.ts',
        distPath: 'project/apps/api/dist/apps/api/src/modules/lawyer/lawyer.service.js',
        distMarkers: ['lawyer-public-projection'],
      },
      {
        sourcePath: 'project/apps/api/src/modules/office/office.service.ts',
        distPath: 'project/apps/api/dist/apps/api/src/modules/office/office.service.js',
        distMarkers: ['lawyer-public-projection'],
      },
    ],
  },
  {
    id: 'CAP02_NEUTRAL_TELEMETRY',
    label: 'CAP-02 neutral telemetry',
    commits: [
      'd4f0e5be3c8e8ab18b18fe35ed6290cad39d7e80',
      '1801748aab2f2197ffc5882b46d182613b1e92b1',
      '4c888dbddfbe15a7e0b3b441ac8b81c5d20aecf8',
    ],
    artifacts: [
      {
        sourcePath:
          'project/apps/api/src/modules/office-approval/office-approval-shadow.service.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/modules/office-approval/office-approval-shadow.service.js',
        distMarkers: ['decideTelemetryActivation'],
      },
      {
        sourcePath: 'project/apps/api/src/scripts/office-cap02-authorization-shadow.core.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/scripts/office-cap02-authorization-shadow.core.js',
        distMarkers: ['SAME_CLASS', 'DIFFERENT_CLASS', 'UNCOMPARABLE'],
      },
    ],
  },
  {
    id: 'CAP02_CANARY_TENANT_ACTOR_SCOPE',
    label: 'Canary tenant/actor scope',
    commits: ['3c73708da29bceb71421edb6d00a6d8713f196a0'],
    artifacts: [
      {
        sourcePath: 'project/apps/api/src/scripts/office-cap02-telemetry-canary-scope.core.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/scripts/office-cap02-telemetry-canary-scope.core.js',
        distMarkers: ['TENANT_ALLOWLIST_EMPTY', 'ACTOR_NOT_ALLOWLISTED'],
      },
      {
        sourcePath:
          'project/apps/api/src/modules/office-approval/office-approval-shadow.service.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/modules/office-approval/office-approval-shadow.service.js',
        distMarkers: ['OFFICE_CAP02_REPORTINGLINE_SHADOW_TENANT_ALLOWLIST'],
      },
    ],
  },
  {
    id: 'CAP02_IDENTITY_BINDING_OPERATE',
    label: 'Identity-binding operate runner',
    commits: [
      '5ec415813c270db0347ea2ef77d3c78dd65ab48d',
      '4c888dbddfbe15a7e0b3b441ac8b81c5d20aecf8',
    ],
    artifacts: [
      {
        sourcePath: 'project/apps/api/src/scripts/office-cap02-identity-binding-operate.core.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/scripts/office-cap02-identity-binding-operate.core.js',
        distMarkers: ['FAIL_CLOSED', 'APPLY'],
      },
      {
        sourcePath: 'project/apps/api/src/scripts/office-cap02-identity-binding-operate.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/scripts/office-cap02-identity-binding-operate.js',
        distMarkers: ['FOR UPDATE', 'MUTATED_ROWS'],
      },
    ],
  },
  {
    id: 'CAP02_REPORTINGLINE_POPULATION',
    label: 'ReportingLine population / idempotency',
    commits: [
      'e633552345358193c8035b4dacfd480a44d0117f',
      'cdf26aac135eab09ce11724aec78f495d89805b7',
    ],
    artifacts: [
      {
        sourcePath:
          'project/apps/api/src/scripts/office-cap02-reportingline-initial-population.plan.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/scripts/office-cap02-reportingline-initial-population.plan.js',
        distMarkers: ['buildInitialPopulationPlan'],
      },
      {
        sourcePath: 'project/apps/api/src/scripts/office-cap02-reportingline-initial-population.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/scripts/office-cap02-reportingline-initial-population.js',
        distMarkers: ['ReportingLine'],
      },
    ],
  },
  {
    id: 'OFFICE_PASSWORD_RECOVERY',
    label: 'Password recovery + hardening',
    commits: [
      '7676d8514292f03914f1f46c0c67041f04489194',
      'b9916f5bfe9a27e483d779e5c98d31828552f92e',
    ],
    artifacts: [
      {
        sourcePath:
          'project/apps/api/src/modules/auth/password-reset/password-reset.controller.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/modules/auth/password-reset/password-reset.controller.js',
        distMarkers: ['forgot-password', 'reset-password'],
      },
      {
        sourcePath: 'project/apps/api/src/modules/auth/password-reset/password-reset.service.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/modules/auth/password-reset/password-reset.service.js',
        distMarkers: ['OFFICE_PASSWORD_RECOVERY_ENABLED', 'passwordResetToken'],
      },
      {
        sourcePath: 'project/apps/api/src/modules/auth/auth.controller.ts',
        distPath: 'project/apps/api/dist/apps/api/src/modules/auth/auth.controller.js',
        distMarkers: ['capabilities'],
      },
    ],
  },
  {
    id: 'OFFICE_STAFF_LAWYER_LIFECYCLE',
    label: 'Staff / lawyer lifecycle',
    commits: ['b0ce36db78e6d6dbc5324d7b1f0d14e3ab96c2c8'],
    artifacts: [
      {
        sourcePath: 'project/apps/api/src/modules/staff/staff.service.ts',
        distPath: 'project/apps/api/dist/apps/api/src/modules/staff/staff.service.js',
        distMarkers: ['isActive'],
      },
      {
        sourcePath: 'project/apps/api/src/modules/lawyer/lawyer.service.ts',
        distPath: 'project/apps/api/dist/apps/api/src/modules/lawyer/lawyer.service.js',
        distMarkers: ['isActive'],
      },
    ],
  },
  {
    id: 'OFFICE_APPROVAL_ENGINE',
    label: 'Office approval engine baseline',
    commits: ['a3eee8b8d12013b368193839331783a0337dd3b9'],
    artifacts: [
      {
        sourcePath: 'project/apps/api/src/modules/office-approval/office-approval.service.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/modules/office-approval/office-approval.service.js',
        distMarkers: ['approve', 'reject'],
      },
      {
        sourcePath:
          'project/apps/api/src/modules/office-approval/office-approval.controller.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/modules/office-approval/office-approval.controller.js',
        distMarkers: ['approve', 'reject'],
      },
      {
        sourcePath:
          'project/apps/api/src/modules/office-approval/office-approval-executor.service.ts',
        distPath:
          'project/apps/api/dist/apps/api/src/modules/office-approval/office-approval-executor.service.js',
        distMarkers: ['UNSUPPORTED_ACTION_CODE', 'execute'],
      },
    ],
  },
];

function normalizePath(path: string): string {
  return path.replace(/\\/g, '/');
}

function run(command: string, args: string[], cwd?: string): string {
  const result = spawnSync(command, args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim().split(/\r?\n/, 1)[0] ?? '';
    throw new Error(`COMMAND_FAILED:${command}:${result.status ?? 'UNKNOWN'}:${stderr}`);
  }
  return String(result.stdout ?? '').trim();
}

function tryRun(command: string, args: string[], cwd?: string): string | null {
  try {
    return run(command, args, cwd);
  } catch {
    return null;
  }
}

function git(cwd: string, args: string[]): string {
  return run('git', args, cwd);
}

function gitRaw(cwd: string, args: string[]): string {
  const result = spawnSync('git', args, {
    cwd,
    encoding: 'utf8',
    windowsHide: true,
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.status !== 0) {
    const stderr = String(result.stderr ?? '').trim().split(/\r?\n/, 1)[0] ?? '';
    throw new Error(`COMMAND_FAILED:git:${result.status ?? 'UNKNOWN'}:${stderr}`);
  }
  return String(result.stdout ?? '');
}

function blobAtRef(repoRoot: string, ref: string, path: string): string | null {
  return tryRun('git', ['rev-parse', `${ref}:${normalizePath(path)}`], repoRoot);
}

function workingBlob(runtimeRoot: string, path: string): string | null {
  const absolute = resolve(runtimeRoot, ...normalizePath(path).split('/'));
  if (!existsSync(absolute)) return null;
  return git(runtimeRoot, ['hash-object', '--', normalizePath(path)]);
}

function inspectSource(
  repoRoot: string,
  runtimeRoot: string,
  canonicalRef: string,
  sourcePath: string,
): SourceEvidence {
  return {
    path: normalizePath(sourcePath),
    canonicalBlob: blobAtRef(repoRoot, canonicalRef, sourcePath),
    runtimeBlob: workingBlob(runtimeRoot, sourcePath),
  };
}

function inspectDist(runtimeRoot: string, artifact: ArtifactSpec): DistEvidence {
  const absolute = resolve(runtimeRoot, ...normalizePath(artifact.distPath).split('/'));
  if (!existsSync(absolute)) {
    return {
      path: normalizePath(artifact.distPath),
      exists: false,
      sha256: null,
      requiredMarkers: [...artifact.distMarkers],
      missingMarkers: [...artifact.distMarkers],
    };
  }
  const bytes = readFileSync(absolute);
  const text = bytes.toString('utf8');
  return {
    path: normalizePath(artifact.distPath),
    exists: true,
    sha256: createHash('sha256').update(bytes).digest('hex'),
    requiredMarkers: [...artifact.distMarkers],
    missingMarkers: artifact.distMarkers.filter((marker) => !text.includes(marker)),
  };
}

function inspectAncestry(runtimeRoot: string, commit: string): AncestryEvidence {
  const result = spawnSync('git', ['merge-base', '--is-ancestor', commit, 'HEAD'], {
    cwd: runtimeRoot,
    encoding: 'utf8',
    windowsHide: true,
  });
  return {
    commit,
    inRuntimeHead: result.status === 0 ? true : result.status === 1 ? false : null,
  };
}

function parseWindowsProcesses(): ProcessRow[] | null {
  const script = [
    '$rows = Get-CimInstance Win32_Process | Select-Object ProcessId,ParentProcessId,Name,CommandLine',
    '$rows | ConvertTo-Json -Compress',
  ].join('; ');
  const output = tryRun('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command', script]);
  if (output === null || output === '') return null;
  try {
    const parsed = JSON.parse(output) as
      | Array<{ ProcessId: number; ParentProcessId: number; Name: string; CommandLine?: string }>
      | { ProcessId: number; ParentProcessId: number; Name: string; CommandLine?: string };
    return (Array.isArray(parsed) ? parsed : [parsed]).map((row) => ({
      pid: Number(row.ProcessId),
      parentPid: Number(row.ParentProcessId),
      name: String(row.Name ?? ''),
      commandLine: String(row.CommandLine ?? ''),
    }));
  } catch {
    return null;
  }
}

function parseUnixProcesses(): ProcessRow[] | null {
  const output = tryRun('ps', ['-eo', 'pid=,ppid=,comm=,args=']);
  if (output === null) return null;
  const rows: ProcessRow[] = [];
  for (const line of output.split(/\r?\n/)) {
    const match = line.match(/^\s*(\d+)\s+(\d+)\s+(\S+)\s+(.*)$/);
    if (!match) continue;
    rows.push({
      pid: Number(match[1]),
      parentPid: Number(match[2]),
      name: match[3],
      commandLine: match[4],
    });
  }
  return rows;
}

function scanConsumer(runtimeRoot: string): ScannedConsumer {
  const rows = process.platform === 'win32' ? parseWindowsProcesses() : parseUnixProcesses();
  if (rows === null) {
    return {
      state: 'UNKNOWN',
      processIds: [],
      signatures: [],
      reason: 'PROCESS_INVENTORY_UNAVAILABLE',
    };
  }

  const byPid = new Map(rows.map((row) => [row.pid, row]));
  const runtimeNeedle = normalizePath(resolve(runtimeRoot)).toLowerCase();

  const isScannerDescendant = (row: ProcessRow): boolean => {
    let current: ProcessRow | undefined = row;
    const seen = new Set<number>();
    while (current && !seen.has(current.pid)) {
      if (current.pid === process.pid) return true;
      seen.add(current.pid);
      current = byPid.get(current.parentPid);
    }
    return false;
  };

  const chainContainsRuntimeRoot = (row: ProcessRow): boolean => {
    let current: ProcessRow | undefined = row;
    const seen = new Set<number>();
    while (current && !seen.has(current.pid)) {
      seen.add(current.pid);
      if (normalizePath(current.commandLine).toLowerCase().includes(runtimeNeedle)) return true;
      current = byPid.get(current.parentPid);
    }
    return false;
  };

  const matches = rows
    .filter((row) => !isScannerDescendant(row))
    .filter((row) => /node(?:\.exe)?$/i.test(row.name))
    .filter((row) => normalizePath(row.commandLine).includes('dist/apps/api/src/main.js'))
    .filter((row) => chainContainsRuntimeRoot(row))
    .sort((left, right) => left.pid - right.pid);

  return {
    state: matches.length > 0 ? 'PRESENT' : 'ABSENT',
    processIds: matches.map((row) => row.pid),
    signatures: matches.map((row) => redactProcessSignature(row.name, row.commandLine)),
    reason: matches.length > 0 ? 'RUNTIME_ROOT_API_PROCESS_DETECTED' : 'NO_RUNTIME_ROOT_API_PROCESS',
  };
}

function parseNameStatus(raw: string): Array<{ status: string; path: string }> {
  if (raw.trim() === '') return [];
  return raw.split(/\r?\n/).map((line) => {
    const columns = line.split('\t');
    const status = columns[0];
    const path = status.startsWith('R') || status.startsWith('C') ? columns[2] : columns[1];
    return { status, path: normalizePath(path) };
  });
}

function runtimeDirtyPaths(runtimeRoot: string): string[] {
  const raw = gitRaw(runtimeRoot, ['status', '--porcelain=v1', '-uall']).trimEnd();
  if (raw === '') return [];
  return raw
    .split(/\r?\n/)
    .map((line) => line.slice(3).trim())
    .filter((path) => path.length > 0)
    .map(normalizePath)
    .sort();
}

function countByProgram(paths: string[]): Record<ProgramClass, number> {
  const counts: Record<ProgramClass, number> = {
    OFFICE: 0,
    CLIENT: 0,
    DEBTOR: 0,
    RCV_COL: 0,
    SHARED_CONTROL_PLANE: 0,
    UNKNOWN: 0,
  };
  for (const path of paths) counts[classifyDeltaPath(path)] += 1;
  return counts;
}

function scanReleaseDelta(repoRoot: string, runtimeRoot: string, canonicalRef: string) {
  const runtimeHead = git(runtimeRoot, ['rev-parse', 'HEAD']);
  const rows = parseNameStatus(
    git(runtimeRoot, ['diff', '--name-status', '--find-renames', runtimeHead, canonicalRef]),
  );
  const paths = [...new Set(rows.map((row) => row.path))].sort();
  const pathSet = new Set(paths);
  const dirtyPaths = runtimeDirtyPaths(runtimeRoot);
  const overlayParityPaths: string[] = [];
  const unexpectedRuntimeDirtyPaths: string[] = [];

  for (const path of dirtyPaths) {
    if (!pathSet.has(path)) {
      unexpectedRuntimeDirtyPaths.push(path);
      continue;
    }
    const canonicalBlob = blobAtRef(repoRoot, canonicalRef, path);
    const runtimeBlob = workingBlob(runtimeRoot, path);
    if (canonicalBlob !== null && runtimeBlob === canonicalBlob) overlayParityPaths.push(path);
  }

  const statusCounts = rows.reduce<Record<string, number>>((counts, row) => {
    const key = row.status.slice(0, 1);
    counts[key] = (counts[key] ?? 0) + 1;
    return counts;
  }, {});

  const migrationDirectories = [
    ...new Set(
      paths
        .map((path) => path.match(/^project\/apps\/api\/prisma\/migrations\/([^/]+)\//)?.[1])
        .filter((name): name is string => Boolean(name)),
    ),
  ].sort();

  return {
    runtimeHead,
    canonicalHead: git(repoRoot, ['rev-parse', canonicalRef]),
    commitCount: Number(git(runtimeRoot, ['rev-list', '--count', `${runtimeHead}..${canonicalRef}`])),
    fileCount: paths.length,
    effectiveSourceDeltaCount: paths.length - overlayParityPaths.length,
    statusCounts,
    programCounts: countByProgram(paths),
    overlayParityPaths: overlayParityPaths.sort(),
    unexpectedRuntimeDirtyPaths: unexpectedRuntimeDirtyPaths.sort(),
    schemaPaths: paths.filter((path) => path.endsWith('/prisma/schema.prisma')),
    migrationDirectories,
    configPaths: paths.filter((path) =>
      /(^|\/)(?:\.env[^/]*|[^/]*config[^/]*\.(?:js|cjs|mjs|ts|json)|tsconfig[^/]*\.json|nest-cli\.json|turbo\.json|pnpm-workspace\.yaml)$/i.test(
        path,
      ),
    ),
    dependencyPaths: paths.filter((path) =>
      /(^|\/)(?:package\.json|pnpm-lock\.yaml|package-lock\.json|yarn\.lock)$/.test(path),
    ),
    entrypointPaths: paths.filter((path) => /(^|\/)(?:main\.ts|app\.module\.ts)$/.test(path)),
    backgroundCandidates: paths.filter((path) =>
      /cron|worker|queue|scheduler|processor|background|job/i.test(path),
    ),
    unknownPaths: paths.filter((path) => classifyDeltaPath(path) === 'UNKNOWN'),
  };
}

function arg(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find((value) => value.startsWith(prefix))?.slice(prefix.length);
}

function requiredArg(name: string): string {
  const value = arg(name);
  if (!value) throw new Error(`MISSING_ARGUMENT:--${name}`);
  return value;
}

function assertRepositoryRoot(root: string, label: string): void {
  const topLevel = tryRun('git', ['rev-parse', '--show-toplevel'], root);
  if (topLevel === null || resolve(topLevel) !== resolve(root)) {
    throw new Error(`${label}_IDENTITY_UNVERIFIED`);
  }
}

function main(): void {
  const repoRoot = resolve(requiredArg('repo-root'));
  const runtimeRoot = resolve(requiredArg('runtime-root'));
  const canonicalRef = arg('canonical-ref') ?? 'origin/main';
  const format = arg('format') ?? 'json';
  if (format !== 'json' && format !== 'text') throw new Error('INVALID_FORMAT');

  assertRepositoryRoot(repoRoot, 'REPOSITORY');
  assertRepositoryRoot(runtimeRoot, 'RUNTIME');
  if (blobAtRef(repoRoot, canonicalRef, 'AGENTS.md') === null) {
    throw new Error('CANONICAL_REF_UNAVAILABLE');
  }

  const consumer = scanConsumer(runtimeRoot);
  const capabilities = CAPABILITIES.map((spec) => {
    const evidence: CapabilityEvidence = {
      id: spec.id,
      sources: spec.artifacts.map((artifact) =>
        inspectSource(repoRoot, runtimeRoot, canonicalRef, artifact.sourcePath),
      ),
      dist: spec.artifacts.map((artifact) => inspectDist(runtimeRoot, artifact)),
      ancestry: spec.commits.map((commit) => inspectAncestry(runtimeRoot, commit)),
      consumer,
    };
    return {
      label: spec.label,
      ...evaluateCapability(evidence),
      evidence,
    };
  });

  const result = {
    scanner: 'OFFICE_RUNTIME_RELEASE_READINESS_V1',
    repository: {
      root: normalizePath(repoRoot),
      canonicalRef,
      canonicalHead: git(repoRoot, ['rev-parse', canonicalRef]),
    },
    runtime: {
      root: normalizePath(runtimeRoot),
      head: git(runtimeRoot, ['rev-parse', 'HEAD']),
      dirtyPaths: runtimeDirtyPaths(runtimeRoot),
      consumer,
    },
    capabilities,
    releaseDelta: scanReleaseDelta(repoRoot, runtimeRoot, canonicalRef),
  };

  if (format === 'json') {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  console.log(`SCANNER ${result.scanner}`);
  console.log(`CANONICAL_HEAD ${result.repository.canonicalHead}`);
  console.log(`RUNTIME_HEAD ${result.runtime.head}`);
  console.log(`RUNTIME_CONSUMER ${consumer.state} ${consumer.reason}`);
  for (const capability of capabilities) {
    console.log(`${capability.id} ${capability.status} ${capability.reasons.join(',')}`);
  }
  console.log(`RELEASE_DELTA_COMMITS ${result.releaseDelta.commitCount}`);
  console.log(`RELEASE_DELTA_FILES ${result.releaseDelta.fileCount}`);
  console.log(`EFFECTIVE_SOURCE_DELTA ${result.releaseDelta.effectiveSourceDeltaCount}`);
}

try {
  main();
} catch (error) {
  const message = error instanceof Error ? error.message : 'UNKNOWN_ERROR';
  console.error(`OFFICE_RUNTIME_RELEASE_READINESS_ERROR ${message}`);
  process.exitCode = 1;
}

/**
 * Clinic Runner — Profiling Wrapper
 *
 * Performance Characterization — Task 19.1
 *
 * clinic flame / bubbleprof komut üretimi, ortam ön koşul doğrulaması
 * ve hedef RPS'in composite rapordan resolve edilmesi.
 *
 * Gerçek profiling çalıştırmaz — sadece hazırlık ve komut üretimi yapar.
 * Gerçek çalıştırma manual (staging ortamında).
 *
 * @see .kiro/specs/perf-characterization/design.md — Task 19
 * @see Requirements 13.1, 13.2, 13.3
 */

import * as fs from 'fs';
import * as path from 'path';
import { execFile as execFileCb } from 'child_process';
import { promisify } from 'util';
import { MatrixId } from '../perf-report.types';
import { CompositePerfReport } from '../composite-report.types';

const execFileAsync = promisify(execFileCb);

// ============================================================================
// Types
// ============================================================================

export type ProfileType = 'flame' | 'bubbleprof';
export type RpsMode = 'sustainable' | 'breakpoint';
export type RpsSource = 'composite-m1' | 'composite-m0' | 'override' | 'default';

export interface ClinicRunnerConfig {
  profileType: ProfileType;
  rpsMode: RpsMode;
  rpsOverride?: number;
  matrixRef?: MatrixId;
  durationSec?: number;
  outputDir?: string;
  compositeReportPath?: string;
  entryPoint?: string;
}

export interface PrereqCheck {
  name: string;
  passed: boolean;
  detail: string;
}

export interface PrereqResult {
  ok: boolean;
  missing: string[];
  versions: { node: string | null; clinic: string | null };
  supportedProfiles: { flame: boolean; bubbleprof: boolean };
  warnings: string[];
  checks: PrereqCheck[];
}

export interface ResolvedRps {
  value: number;
  source: RpsSource;
}

export interface ClinicCommand {
  argv: string[];
  commandString: string;
  expectedOutputPath: string;
  outputFilename: string;
  resolvedRps: ResolvedRps;
  prereqResult: PrereqResult;
  estimatedDurationMin: number;
}

// ============================================================================
// Shell Executor Type (DI for testing)
// ============================================================================

export type ExecFn = (
  cmd: string,
  args: string[],
) => Promise<{ stdout: string; stderr: string }>;

const defaultExecFn: ExecFn = async (cmd, args) => {
  const { stdout, stderr } = await execFileAsync(cmd, args, {
    timeout: 10_000,
    encoding: 'utf-8',
  });
  return { stdout: stdout ?? '', stderr: stderr ?? '' };
};

// ============================================================================
// Defaults
// ============================================================================

const DEFAULT_DURATION_SEC = 120;
const DEFAULT_RPS = 50;
const DEFAULT_OUTPUT_DIR = '.clinic';
const DEFAULT_ENTRY_POINT = 'src/main.ts';
const DEFAULT_MATRIX_REF: MatrixId = 'M1';
const MIN_NODE_MAJOR = 18;

// ============================================================================
// checkPrerequisites
// ============================================================================

export async function checkPrerequisites(
  execFn: ExecFn = defaultExecFn,
): Promise<PrereqResult> {
  const checks: PrereqCheck[] = [];
  const missing: string[] = [];
  const warnings: string[] = [];
  let nodeVersion: string | null = null;
  let clinicVersion: string | null = null;
  let flameOk = false;
  let bubbleprofOk = false;

  // 1. Node.js version
  try {
    const { stdout } = await execFn('node', ['--version']);
    const ver = stdout.trim();
    nodeVersion = ver;
    const major = parseInt(ver.replace(/^v/, ''), 10);
    if (major >= MIN_NODE_MAJOR) {
      checks.push({ name: 'node-version', passed: true, detail: ver });
    } else {
      checks.push({ name: 'node-version', passed: false, detail: `${ver} < v${MIN_NODE_MAJOR}.0.0` });
      warnings.push(`[prereq] Node.js ${ver} < v${MIN_NODE_MAJOR}.0.0 — clinic uyumsuz olabilir`);
    }
  } catch (err: any) {
    checks.push({ name: 'node-version', passed: false, detail: err.message ?? 'not found' });
    missing.push('node');
  }

  // 2. clinic version
  try {
    const { stdout } = await execFn('npx', ['clinic', '--version']);
    clinicVersion = stdout.trim();
    checks.push({ name: 'clinic', passed: true, detail: clinicVersion });
  } catch (err: any) {
    checks.push({ name: 'clinic', passed: false, detail: err.message ?? 'not found' });
    missing.push('clinic');
  }

  // 3. clinic flame
  try {
    await execFn('npx', ['clinic', 'flame', '--help']);
    checks.push({ name: 'clinic-flame', passed: true, detail: 'available' });
    flameOk = true;
  } catch (err: any) {
    checks.push({ name: 'clinic-flame', passed: false, detail: err.message ?? 'not found' });
    missing.push('clinic-flame');
  }

  // 4. clinic bubbleprof
  try {
    await execFn('npx', ['clinic', 'bubbleprof', '--help']);
    checks.push({ name: 'clinic-bubbleprof', passed: true, detail: 'available' });
    bubbleprofOk = true;
  } catch (err: any) {
    checks.push({ name: 'clinic-bubbleprof', passed: false, detail: err.message ?? 'not found' });
    missing.push('clinic-bubbleprof');
  }

  return {
    ok: checks.every((c) => c.passed),
    missing,
    versions: { node: nodeVersion, clinic: clinicVersion },
    supportedProfiles: { flame: flameOk, bubbleprof: bubbleprofOk },
    warnings,
    checks,
  };
}

// ============================================================================
// resolveTargetRps
// ============================================================================

export function resolveTargetRps(
  config: ClinicRunnerConfig,
  compositeReport?: CompositePerfReport | null,
): ResolvedRps {
  // 1. Manual override
  if (config.rpsOverride != null && config.rpsOverride > 0) {
    return { value: config.rpsOverride, source: 'override' };
  }

  // 2. Composite report
  if (compositeReport) {
    const matrixRef = config.matrixRef ?? DEFAULT_MATRIX_REF;
    const rpsMode = config.rpsMode ?? 'sustainable';

    // Try M1 first, then M0 fallback
    const tryMatrices: MatrixId[] = matrixRef === 'M1' ? ['M1', 'M0'] : [matrixRef, 'M1', 'M0'];

    for (const mid of tryMatrices) {
      const entry = compositeReport.index.find((e) => e.matrixId === mid);
      if (!entry) continue;

      // Primary mode
      const primaryValue = rpsMode === 'sustainable'
        ? entry.sustainableRPS
        : entry.breakpointRPS;
      if (primaryValue != null && primaryValue > 0) {
        const source: RpsSource = mid === 'M1' ? 'composite-m1' : 'composite-m0';
        return { value: primaryValue, source };
      }

      // Cross-mod fallback: sustainable yoksa breakpoint dene (veya tersi)
      const fallbackValue = rpsMode === 'sustainable'
        ? entry.breakpointRPS
        : entry.sustainableRPS;
      if (fallbackValue != null && fallbackValue > 0) {
        const source: RpsSource = mid === 'M1' ? 'composite-m1' : 'composite-m0';
        return { value: fallbackValue, source };
      }
    }
  }

  // 3. Default
  return { value: DEFAULT_RPS, source: 'default' };
}

// ============================================================================
// loadCompositeReport (helper)
// ============================================================================

function loadCompositeReport(filePath: string): CompositePerfReport | null {
  try {
    const raw = fs.readFileSync(filePath, 'utf-8');
    return JSON.parse(raw) as CompositePerfReport;
  } catch {
    return null;
  }
}

// ============================================================================
// generateOutputFilename
// ============================================================================

export function generateOutputFilename(
  config: ClinicRunnerConfig,
  resolvedRps: ResolvedRps,
  runKey?: string,
): string {
  const matrixRef = config.matrixRef ?? DEFAULT_MATRIX_REF;
  const rpsMode = config.rpsMode ?? 'sustainable';
  const rpsValue = Math.round(resolvedRps.value);
  const runKey8 = runKey ? runKey.slice(0, 8) : 'standalone';
  return `${matrixRef}_${rpsMode}_rps-${rpsValue}_runkey-${runKey8}_${config.profileType}.html`;
}

// ============================================================================
// generateClinicCommand
// ============================================================================

export async function generateClinicCommand(
  config: ClinicRunnerConfig,
  execFn: ExecFn = defaultExecFn,
): Promise<ClinicCommand> {
  const prereqResult = await checkPrerequisites(execFn);

  // Load composite if path provided
  let composite: CompositePerfReport | null = null;
  if (config.compositeReportPath) {
    composite = loadCompositeReport(config.compositeReportPath);
  }

  const resolvedRps = resolveTargetRps(config, composite);
  const runKey = composite?.metadata.compositeRunKey;
  const outputFilename = generateOutputFilename(config, resolvedRps, runKey);

  const outputDir = config.outputDir ?? DEFAULT_OUTPUT_DIR;
  const expectedOutputPath = path.join(outputDir, outputFilename);
  const durationSec = config.durationSec ?? DEFAULT_DURATION_SEC;
  const entryPoint = config.entryPoint ?? DEFAULT_ENTRY_POINT;
  const rpsValue = Math.round(resolvedRps.value);

  const argv = [
    'npx', 'clinic', config.profileType,
    '--on-port',
    `autocannon -c 1 -d ${durationSec} -R ${rpsValue} http://localhost:$PORT/api/v1/simulate`,
    '--dest', outputDir,
    '--', 'node',
    '--require', 'ts-node/register',
    '--max-old-space-size=512',
    entryPoint,
  ];

  const commandString = argv.join(' ');
  const estimatedDurationMin = Math.ceil((durationSec + 30) / 60); // +30s overhead

  return {
    argv,
    commandString,
    expectedOutputPath,
    outputFilename,
    resolvedRps,
    prereqResult,
    estimatedDurationMin,
  };
}

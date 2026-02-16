/**
 * Clinic Runner — Unit Tests (Mock'lu, CI-safe)
 *
 * Performance Characterization — Task 19.2
 *
 * Tüm testler execFn mock ile çalışır — PATH bağımlılığı yok.
 * Gerçek shell çağrısı yapılmaz.
 *
 * @see .kiro/specs/perf-characterization/design.md — Task 19
 */

import {
  checkPrerequisites,
  resolveTargetRps,
  generateClinicCommand,
  generateOutputFilename,
  ExecFn,
  ClinicRunnerConfig,
  PrereqResult,
  ResolvedRps,
} from '../clinic-runner';
import { CompositePerfReport, MatrixIndexEntry } from '../../composite-report.types';
import { MatrixId } from '../../perf-report.types';

// ============================================================================
// Mock ExecFn Helpers
// ============================================================================

function createMockExecFn(responses: Record<string, { stdout: string } | Error>): ExecFn {
  return async (cmd: string, args: string[]) => {
    const key = [cmd, ...args].join(' ');
    for (const [pattern, response] of Object.entries(responses)) {
      if (key.includes(pattern)) {
        if (response instanceof Error) throw response;
        return { stdout: response.stdout, stderr: '' };
      }
    }
    throw new Error(`Unexpected command: ${key}`);
  };
}

const allPassExec = createMockExecFn({
  'node --version': { stdout: 'v20.11.0\n' },
  'clinic --version': { stdout: '13.0.0\n' },
  'clinic flame --help': { stdout: 'Usage: clinic flame\n' },
  'clinic bubbleprof --help': { stdout: 'Usage: clinic bubbleprof\n' },
});

// ============================================================================
// Composite Report Fixture Helper
// ============================================================================

function makeIndexEntry(
  matrixId: MatrixId,
  sustainableRPS: number | null,
  breakpointRPS: number | null,
): MatrixIndexEntry {
  return {
    matrixId,
    runKey: 'test-run-001',
    completedAt: '2026-02-15T12:00:00Z',
    sustainableRPS,
    breakpointRPS,
    p99Ms: 65.0,
    eventLoopP99Ms: 30.0,
    leakSuspected: null,
    blockRateBucketCount: null,
    coldPathP99ContributionMs: null,
    warningCount: 0,
  };
}

function makeComposite(entries: MatrixIndexEntry[]): CompositePerfReport {
  return {
    metadata: {
      schemaVersion: '2.0.0',
      compositeRunKey: 'a1b2c3d4e5f67890',
      generatedAt: '2026-02-15T12:00:00Z',
      gitSha: 'abc123',
      environmentSnapshotHash: 'env-hash',
    },
    index: entries,
    matrices: [],
    overheadDelta: null,
    capacityEnvelope: null,
    duplicates: [],
    diagnostics: { m4: null, m5: null },
    normalizationsApplied: [],
    warnings: [],
  };
}

// ============================================================================
// Tests
// ============================================================================

describe('clinic-runner — Task 19.2', () => {
  // ── generateClinicCommand ──

  describe('generateClinicCommand', () => {
    it('Test 1: flame komutu — doğru argv, dosya adı, resolvedRps', async () => {
      const config: ClinicRunnerConfig = {
        profileType: 'flame',
        rpsMode: 'sustainable',
        rpsOverride: 65,
      };
      const cmd = await generateClinicCommand(config, allPassExec);

      expect(cmd.argv[0]).toBe('npx');
      expect(cmd.argv[1]).toBe('clinic');
      expect(cmd.argv[2]).toBe('flame');
      expect(cmd.argv).toContain('--on-port');
      expect(cmd.commandString).toContain('flame');
      expect(cmd.commandString).toContain('-R 65');
      expect(cmd.resolvedRps).toEqual({ value: 65, source: 'override' });
      expect(cmd.outputFilename).toContain('flame');
      expect(cmd.outputFilename).toContain('rps-65');
      expect(cmd.estimatedDurationMin).toBeGreaterThan(0);
    });

    it('Test 2: bubbleprof komutu — doğru argv, dosya adı', async () => {
      const config: ClinicRunnerConfig = {
        profileType: 'bubbleprof',
        rpsMode: 'breakpoint',
        rpsOverride: 76,
      };
      const cmd = await generateClinicCommand(config, allPassExec);

      expect(cmd.argv[2]).toBe('bubbleprof');
      expect(cmd.commandString).toContain('bubbleprof');
      expect(cmd.commandString).toContain('-R 76');
      expect(cmd.outputFilename).toContain('bubbleprof');
      expect(cmd.outputFilename).toContain('breakpoint');
    });

    it('Test 3: rpsOverride kullanıldığında source=override', async () => {
      const config: ClinicRunnerConfig = {
        profileType: 'flame',
        rpsMode: 'sustainable',
        rpsOverride: 100,
      };
      const cmd = await generateClinicCommand(config, allPassExec);
      expect(cmd.resolvedRps.source).toBe('override');
      expect(cmd.resolvedRps.value).toBe(100);
    });

    it('Test 4: composite\'tan M1 sustainable resolve', async () => {
      // compositeReportPath kullanmadan doğrudan resolveTargetRps test ediyoruz
      const composite = makeComposite([
        makeIndexEntry('M0', 60, 70),
        makeIndexEntry('M1', 65, 76),
      ]);
      const config: ClinicRunnerConfig = {
        profileType: 'flame',
        rpsMode: 'sustainable',
      };
      const rps = resolveTargetRps(config, composite);
      expect(rps).toEqual({ value: 65, source: 'composite-m1' });
    });

    it('Test 5: M1 yoksa M0 fallback', async () => {
      const composite = makeComposite([
        makeIndexEntry('M0', 60, 70),
      ]);
      const config: ClinicRunnerConfig = {
        profileType: 'flame',
        rpsMode: 'sustainable',
      };
      const rps = resolveTargetRps(config, composite);
      expect(rps).toEqual({ value: 60, source: 'composite-m0' });
    });

    it('Test 6: composite yoksa default RPS', async () => {
      const config: ClinicRunnerConfig = {
        profileType: 'flame',
        rpsMode: 'sustainable',
      };
      const rps = resolveTargetRps(config, null);
      expect(rps).toEqual({ value: 50, source: 'default' });
    });
  });

  // ── checkPrerequisites ──

  describe('checkPrerequisites', () => {
    it('Test 7: tüm prereq\'ler pass', async () => {
      const result = await checkPrerequisites(allPassExec);

      expect(result.ok).toBe(true);
      expect(result.missing).toHaveLength(0);
      expect(result.versions.node).toBe('v20.11.0');
      expect(result.versions.clinic).toBe('13.0.0');
      expect(result.supportedProfiles.flame).toBe(true);
      expect(result.supportedProfiles.bubbleprof).toBe(true);
      expect(result.checks).toHaveLength(4);
      expect(result.checks.every((c) => c.passed)).toBe(true);
    });

    it('Test 8: clinic yok — allPassed=false, missing contains clinic', async () => {
      const noClinicExec = createMockExecFn({
        'node --version': { stdout: 'v20.11.0\n' },
        'clinic --version': new Error('not found'),
        'clinic flame --help': new Error('not found'),
        'clinic bubbleprof --help': new Error('not found'),
      });

      const result = await checkPrerequisites(noClinicExec);

      expect(result.ok).toBe(false);
      expect(result.missing).toContain('clinic');
      expect(result.missing).toContain('clinic-flame');
      expect(result.missing).toContain('clinic-bubbleprof');
      expect(result.versions.node).toBe('v20.11.0');
      expect(result.versions.clinic).toBeNull();
      expect(result.supportedProfiles.flame).toBe(false);
      expect(result.supportedProfiles.bubbleprof).toBe(false);
    });

    it('Test 9: node versiyonu < 18 — ilgili check fail', async () => {
      const oldNodeExec = createMockExecFn({
        'node --version': { stdout: 'v16.20.0\n' },
        'clinic --version': { stdout: '13.0.0\n' },
        'clinic flame --help': { stdout: 'ok\n' },
        'clinic bubbleprof --help': { stdout: 'ok\n' },
      });

      const result = await checkPrerequisites(oldNodeExec);

      expect(result.ok).toBe(false);
      const nodeCheck = result.checks.find((c) => c.name === 'node-version');
      expect(nodeCheck?.passed).toBe(false);
      expect(nodeCheck?.detail).toContain('v16.20.0');
      expect(result.warnings.length).toBeGreaterThan(0);
      expect(result.warnings[0]).toContain('v16.20.0');
    });
  });

  // ── resolveTargetRps ──

  describe('resolveTargetRps', () => {
    it('Test 10: M1 sustainable → doğru değer + source', () => {
      const composite = makeComposite([
        makeIndexEntry('M1', 65, 76),
      ]);
      const rps = resolveTargetRps(
        { profileType: 'flame', rpsMode: 'sustainable' },
        composite,
      );
      expect(rps).toEqual({ value: 65, source: 'composite-m1' });
    });

    it('Test 11: M1 breakpoint → doğru değer + source', () => {
      const composite = makeComposite([
        makeIndexEntry('M1', 65, 76),
      ]);
      const rps = resolveTargetRps(
        { profileType: 'flame', rpsMode: 'breakpoint' },
        composite,
      );
      expect(rps).toEqual({ value: 76, source: 'composite-m1' });
    });

    it('Test 12: M1 yok, M0 fallback → source=composite-m0', () => {
      const composite = makeComposite([
        makeIndexEntry('M0', 60, 70),
      ]);
      const rps = resolveTargetRps(
        { profileType: 'flame', rpsMode: 'sustainable' },
        composite,
      );
      expect(rps).toEqual({ value: 60, source: 'composite-m0' });
    });

    it('Test 13: ikisi de yok → default 50 + source=default', () => {
      const composite = makeComposite([]);
      const rps = resolveTargetRps(
        { profileType: 'flame', rpsMode: 'sustainable' },
        composite,
      );
      expect(rps).toEqual({ value: 50, source: 'default' });
    });
  });

  // ── generateOutputFilename ──

  describe('generateOutputFilename', () => {
    it('runKey dahil dosya adı üretir', () => {
      const config: ClinicRunnerConfig = {
        profileType: 'flame',
        rpsMode: 'sustainable',
        matrixRef: 'M1',
      };
      const rps: ResolvedRps = { value: 65, source: 'composite-m1' };
      const filename = generateOutputFilename(config, rps, 'a1b2c3d4e5f67890');

      expect(filename).toBe('M1_sustainable_rps-65_runkey-a1b2c3d4_flame.html');
    });

    it('runKey yoksa standalone kullanır', () => {
      const config: ClinicRunnerConfig = {
        profileType: 'bubbleprof',
        rpsMode: 'breakpoint',
        matrixRef: 'M1',
      };
      const rps: ResolvedRps = { value: 76, source: 'override' };
      const filename = generateOutputFilename(config, rps);

      expect(filename).toBe('M1_breakpoint_rps-76_runkey-standalone_bubbleprof.html');
    });
  });
});

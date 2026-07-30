import * as fs from 'node:fs';
import * as path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../../../..');
const MANIFEST_ROOT = path.join(API_ROOT, 'ci-manifests');
const SCHEDULER_TESTS_DIR = path.join(API_ROOT, 'src/modules/scheduler/__tests__');
const MANIFEST_RUNNER = path.join(API_ROOT, 'scripts/run-ci-manifest.sh');

// DEBTOR-SCHEDULER-REQUIRED-CI-COVERAGE-P1-I14 (source finding: I13-SCHEDULER-CI-GAP —
// independent of LEGACY TASK 08, which P1-I13 already closed). Fresh repo-wide sweep found
// 5 pre-existing SchedulerService contract spec files that were never wired into any required
// CI manifest (unrelated to the lifecycle-guard family I09-I13 dealt with; these test Scheduler's
// own business logic — nafaka periods, tebligat-sync cron paths, disabled due-reminders dead path,
// batch-pagination helper invariants, metrics counters). This file locks two distinct drift
// classes so they cannot silently regress:
//   (a) STRUCTURAL — a new *.spec.ts file lands in src/modules/scheduler/__tests__/ and is never
//       wired into any manifest (dynamic directory scan, not a hardcoded list — catches files this
//       task's author never anticipated).
//   (b) SEMANTIC — one of the 7 tracked scheduler spec files (the 5 from I14 + I13's own
//       scheduler-passive-case-debtor-guard.spec.ts) is moved to the wrong manifest (exact
//       spec→manifest lock).
const I14_SCHEDULER_MAPPED_SPECS = [
  {
    spec: 'src/modules/scheduler/__tests__/scheduler-batch.helper.spec.ts',
    manifest: 'pure/platform-scripts-shared.txt',
  },
  {
    spec: 'src/modules/scheduler/__tests__/scheduler-due-reminders-disabled.spec.ts',
    manifest: 'pure/platform-scripts-shared.txt',
  },
  {
    spec: 'src/modules/scheduler/__tests__/scheduler-metrics.service.spec.ts',
    manifest: 'pure/platform-scripts-shared.txt',
  },
  {
    spec: 'src/modules/scheduler/__tests__/scheduler-nafaka-periods.spec.ts',
    manifest: 'pure/platform-scripts-shared.txt',
  },
  {
    spec: 'src/modules/scheduler/__tests__/scheduler-tebligat-synced-path.spec.ts',
    manifest: 'pure/platform-scripts-shared.txt',
  },
  // P1-I13 (R02-B): already wired before this task; tracked here too so a future accidental
  // move/removal of THIS file is caught by the same two guards as the 5 files I14 added.
  {
    spec: 'src/modules/scheduler/__tests__/scheduler-passive-case-debtor-guard.spec.ts',
    manifest: 'pure/platform-scripts-shared.txt',
  },
  // This guard file itself: also a *.spec.ts under the directory it dynamically scans, and also
  // wired into the same manifest — tracked so it doesn't trip its own "untracked file" check below.
  {
    spec: 'src/modules/scheduler/__tests__/scheduler-required-ci-coverage.static.spec.ts',
    manifest: 'pure/platform-scripts-shared.txt',
  },
];

function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function listManifestFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listManifestFiles(fullPath);
    return entry.isFile() && entry.name.endsWith('.txt') ? [fullPath] : [];
  });
}

function readManifest(manifestPath: string): string[] {
  return fs
    .readFileSync(manifestPath, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

function listSchedulerTestFiles(): string[] {
  return fs
    .readdirSync(SCHEDULER_TESTS_DIR, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.spec.ts'))
    .map((entry) => normalize(path.relative(API_ROOT, path.join(SCHEDULER_TESTS_DIR, entry.name))));
}

describe('DEBTOR-SCHEDULER-REQUIRED-CI-COVERAGE-P1-I14 required CI coverage', () => {
  const manifestPaths = listManifestFiles(MANIFEST_ROOT);
  const manifestContents = new Map(
    manifestPaths.map((p) => [normalize(path.relative(MANIFEST_ROOT, p)), readManifest(p)]),
  );
  const allRequiredEntries = manifestPaths.flatMap(readManifest);
  const schedulerSpecFiles = listSchedulerTestFiles();

  it('wires every scheduler/__tests__ spec file into required CI exactly once (structural drift guard)', () => {
    expect(schedulerSpecFiles.length).toBeGreaterThanOrEqual(7);

    const membership = schedulerSpecFiles.map((spec) => ({
      spec,
      totalCount: allRequiredEntries.filter((entry) => entry === spec).length,
    }));

    expect(membership.filter(({ totalCount }) => totalCount !== 1)).toEqual([]);
  });

  it('maps every known scheduler contract spec to exactly its intended manifest (semantic/wrong-domain drift guard)', () => {
    expect(I14_SCHEDULER_MAPPED_SPECS.length).toBe(7);

    const membership = I14_SCHEDULER_MAPPED_SPECS.map(({ spec, manifest }) => {
      const targetManifest = manifestContents.get(manifest) ?? [];
      return {
        spec,
        manifest,
        targetCount: targetManifest.filter((entry) => entry === spec).length,
      };
    });

    expect(membership.filter(({ targetCount }) => targetCount !== 1)).toEqual([]);
  });

  it('keeps the tracked scheduler spec list synchronized with the actual directory contents', () => {
    const trackedSet = new Set(I14_SCHEDULER_MAPPED_SPECS.map((s) => s.spec));
    const untracked = schedulerSpecFiles.filter((spec) => !trackedSet.has(spec));
    expect(untracked).toEqual([]);
  });

  it('keeps every scheduler manifest entry unique within its manifest and backed by an existing file', () => {
    for (const manifestPath of new Set(I14_SCHEDULER_MAPPED_SPECS.map((s) => s.manifest))) {
      const entries = manifestContents.get(manifestPath) ?? [];
      expect(new Set(entries).size).toBe(entries.length);
    }
    for (const { spec } of I14_SCHEDULER_MAPPED_SPECS) {
      expect(fs.existsSync(path.join(API_ROOT, normalize(spec)))).toBe(true);
    }
  });

  it('keeps the shared runner fail-closed for missing or zero-match manifests', () => {
    const runner = fs.readFileSync(MANIFEST_RUNNER, 'utf8');
    const runnerCommands = runner
      .split(/\r?\n/)
      .filter((line) => !line.trimStart().startsWith('#'))
      .join('\n');

    expect(runner).toContain('if [ ! -f "$MANIFEST" ]');
    expect(runner).toContain('if [ "${#SPECS[@]}" -eq 0 ]');
    expect(runner).toContain('if [ ! -f "$f" ]');
    expect(runnerCommands).toContain('--runTestsByPath');
    expect(runnerCommands).not.toContain('--passWithNoTests');
  });
});

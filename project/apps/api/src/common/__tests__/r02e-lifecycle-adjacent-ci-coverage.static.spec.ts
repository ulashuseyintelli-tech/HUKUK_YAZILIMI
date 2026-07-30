import * as fs from 'node:fs';
import * as path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../../..');
const MANIFEST_ROOT = path.join(API_ROOT, 'ci-manifests');
const MANIFEST_RUNNER = path.join(API_ROOT, 'scripts/run-ci-manifest.sh');

// DEBTOR-LIFECYCLE-ADJACENT-CI-COVERAGE-RECONCILIATION-P1-I11 (R02-E):
// I10's fresh sweep found 11 spec files that reference CaseDebtorLifecycleGuardService
// only as one dependency among several (not their test subject) and were never wired
// into any required-CI manifest. Per-file reconciliation in I11 found:
//  - 10 are unchanged-and-green and safely mappable to their PRIMARY domain manifest
//    (this list — MAP_NOW).
//  - 1 (collection-idempotency.spec.ts) is currently RED on fresh main (4/8 tests fail:
//    tx.claimItem.findMany mock missing after a later CollectionService.create() change)
//    and is intentionally NOT mapped here — see the I11 PR body / final disposition
//    for the REPAIR_REQUIRED finding. Wiring a red spec into required CI would turn a
//    latent gap into an immediate false block, which is worse than leaving it unwired.
const R02E_MAPPED_SPECS = [
  {
    spec: 'src/modules/debtor/__tests__/third-party-collection-delegation.spec.ts',
    manifest: 'pure/claim-collection-finance.txt',
  },
  {
    spec: 'src/modules/tebligat/__tests__/tebligat-create-validation.spec.ts',
    manifest: 'pure/uyap-icrabot-tebligat.txt',
  },
  {
    spec: 'src/modules/tebligat/__tests__/tebligat-electronic-result.spec.ts',
    manifest: 'pure/uyap-icrabot-tebligat.txt',
  },
  {
    spec: 'src/modules/address-task/address-task-scheduler.service.spec.ts',
    manifest: 'pure/platform-scripts-shared.txt',
  },
  {
    spec: 'src/modules/debtor/case-debtor.service.spec.ts',
    manifest: 'pure/platform-scripts-shared.txt',
  },
  {
    spec: 'src/modules/collection/__tests__/collection-cancel-reversal.db-gated.integration.spec.ts',
    manifest: 'db/domain-integration.txt',
  },
  {
    spec: 'src/modules/address-discovery/address-discovery.spec.ts',
    manifest: 'db/domain-integration.txt',
  },
  {
    spec: 'src/modules/debtor/address.service.spec.ts',
    manifest: 'db/domain-integration.txt',
  },
  {
    spec: 'src/modules/debtor/case-debtor.collection-guard.spec.ts',
    manifest: 'db/domain-integration.txt',
  },
  {
    spec: 'src/modules/debtor/case-debtor.remove-orphan-tasks.spec.ts',
    manifest: 'db/domain-integration.txt',
  },
];

// I11 explicitly excludes this file from R02E_MAPPED_SPECS (REPAIR_REQUIRED, not MAP_NOW).
// This guard also locks that it never silently reappears in a manifest without a
// deliberate, reviewed decision to do so.
const R02E_REPAIR_REQUIRED_SPEC = 'src/modules/collection/__tests__/collection-idempotency.spec.ts';

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

describe('DEBTOR-LIFECYCLE-ADJACENT-CI-COVERAGE-RECONCILIATION-P1-I11 required CI coverage', () => {
  const allManifestPaths = listManifestFiles(MANIFEST_ROOT);
  const allRequiredEntries = allManifestPaths.flatMap(readManifest);
  const manifestContents = new Map(
    allManifestPaths.map((p) => [normalize(path.relative(MANIFEST_ROOT, p)), readManifest(p)]),
  );

  it('maps every R02-E MAP_NOW spec to exactly its intended primary-domain manifest', () => {
    expect(R02E_MAPPED_SPECS.length).toBe(10);

    const membership = R02E_MAPPED_SPECS.map(({ spec, manifest }) => {
      const targetManifest = manifestContents.get(manifest) ?? [];
      return {
        spec,
        manifest,
        targetCount: targetManifest.filter((entry) => entry === spec).length,
        totalCount: allRequiredEntries.filter((entry) => entry === spec).length,
      };
    });

    expect(membership.filter(({ targetCount }) => targetCount !== 1)).toEqual([]);
    expect(membership.filter(({ totalCount }) => totalCount !== 1)).toEqual([]);
  });

  it('keeps every R02-E mapped entry unique within its manifest and backed by an existing file', () => {
    for (const manifestPath of new Set(R02E_MAPPED_SPECS.map((s) => s.manifest))) {
      const entries = manifestContents.get(manifestPath) ?? [];
      expect(new Set(entries).size).toBe(entries.length);
    }
    for (const { spec } of R02E_MAPPED_SPECS) {
      expect(fs.existsSync(path.join(API_ROOT, normalize(spec)))).toBe(true);
    }
  });

  it('keeps the REPAIR_REQUIRED spec out of every manifest until it is fixed', () => {
    const totalCount = allRequiredEntries.filter((entry) => entry === R02E_REPAIR_REQUIRED_SPEC).length;
    expect(totalCount).toBe(0);
    expect(fs.existsSync(path.join(API_ROOT, normalize(R02E_REPAIR_REQUIRED_SPEC)))).toBe(true);
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

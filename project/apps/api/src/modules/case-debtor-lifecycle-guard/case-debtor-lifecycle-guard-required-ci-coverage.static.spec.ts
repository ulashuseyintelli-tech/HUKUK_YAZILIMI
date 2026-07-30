import * as fs from 'node:fs';
import * as path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../../..');
const MANIFEST_ROOT = path.join(API_ROOT, 'ci-manifests');
const PURE_MANIFEST = path.join(
  API_ROOT,
  'ci-manifests/pure/platform-scripts-shared.txt',
);
const MANIFEST_RUNNER = path.join(API_ROOT, 'scripts/run-ci-manifest.sh');

// I09 reconciliation'da bulunan altı dedicated CaseDebtorLifecycleGuardService
// passive/active guard spec dosyası (bir domain dizinine toplanmamış, üç farklı
// dizine dağılmış — bu yüzden claim-item emsalindeki tek-dizin listSpecFiles()
// yerine exact path listesi kullanılır). I10 (DEBTOR-LIFECYCLE-GUARD-CI-COVERAGE-
// P1-I10, LEGACY TASK 08 R02-D) bu altısını required CI'a bağladı.
const REQUIRED_LIFECYCLE_GUARD_SPECS = [
  'src/modules/case-debtor-lifecycle-guard/case-debtor-lifecycle-guard.service.spec.ts',
  'src/modules/case-debtor-lifecycle-guard/manual-case-debtor-mutation-lifecycle-guard.spec.ts',
  'src/modules/case-debtor-lifecycle-guard/operational-create-lifecycle-guard.spec.ts',
  'src/modules/debtor/case-debtor-ownership.spec.ts',
  'src/modules/debtor/__tests__/rfa008-thirdparty-guard.spec.ts',
  'src/modules/address-discovery/address-discovery-lifecycle-guard.spec.ts',
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

describe('DEBTOR-LIFECYCLE-GUARD-CI-COVERAGE-P1-I10 required CI coverage', () => {
  const pureManifest = readManifest(PURE_MANIFEST);
  const allRequiredEntries = listManifestFiles(MANIFEST_ROOT).flatMap(readManifest);

  it('maps every dedicated lifecycle-guard spec to exactly one required manifest', () => {
    expect(REQUIRED_LIFECYCLE_GUARD_SPECS.length).toBe(6);

    const membership = REQUIRED_LIFECYCLE_GUARD_SPECS.map((spec) => ({
      spec,
      targetCount: pureManifest.filter((entry) => entry === spec).length,
      totalCount: allRequiredEntries.filter((entry) => entry === spec).length,
    }));

    expect(membership.filter(({ targetCount }) => targetCount !== 1)).toEqual([]);
    expect(membership.filter(({ totalCount }) => totalCount !== 1)).toEqual([]);
  });

  it('keeps every required lifecycle-guard entry unique and backed by an existing file', () => {
    expect(new Set(pureManifest).size).toBe(pureManifest.length);
    for (const spec of REQUIRED_LIFECYCLE_GUARD_SPECS) {
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

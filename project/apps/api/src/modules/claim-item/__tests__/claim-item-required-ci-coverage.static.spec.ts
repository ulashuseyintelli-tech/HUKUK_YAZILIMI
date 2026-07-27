import * as fs from 'node:fs';
import * as path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../../../..');
const CLAIM_ITEM_ROOT = path.join(API_ROOT, 'src/modules/claim-item');
const MANIFEST_ROOT = path.join(API_ROOT, 'ci-manifests');
const PURE_MANIFEST = path.join(
  API_ROOT,
  'ci-manifests/pure/claim-collection-finance.txt',
);
const DB_MANIFEST = path.join(API_ROOT, 'ci-manifests/db/core-lifecycle.txt');
const MANIFEST_RUNNER = path.join(API_ROOT, 'scripts/run-ci-manifest.sh');

function normalize(relativePath: string): string {
  return relativePath.split(path.sep).join('/');
}

function listSpecFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) return listSpecFiles(fullPath);
    if (!entry.isFile() || !entry.name.endsWith('.spec.ts')) return [];
    return [normalize(path.relative(API_ROOT, fullPath))];
  });
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

describe('RCV-CLAIM-FORM-HCR-03 required CI coverage', () => {
  const claimItemSpecs = listSpecFiles(CLAIM_ITEM_ROOT).sort();
  const pureManifest = readManifest(PURE_MANIFEST);
  const dbManifest = readManifest(DB_MANIFEST);
  const claimItemManifestEntries = [...pureManifest, ...dbManifest];
  const allRequiredEntries = listManifestFiles(MANIFEST_ROOT).flatMap(readManifest);

  it('maps every ClaimItem spec to exactly one required manifest', () => {
    expect(claimItemSpecs.length).toBeGreaterThan(0);
    expect(pureManifest.length).toBeGreaterThan(0);
    expect(dbManifest.length).toBeGreaterThan(0);

    const membership = claimItemSpecs.map((spec) => ({
      spec,
      targetCount: claimItemManifestEntries.filter((entry) => entry === spec).length,
      totalCount: allRequiredEntries.filter((entry) => entry === spec).length,
    }));

    expect(membership.filter(({ targetCount }) => targetCount !== 1)).toEqual([]);
    expect(membership.filter(({ totalCount }) => totalCount !== 1)).toEqual([]);
  });

  it('keeps DB-gated and non-DB ClaimItem suites in separate manifests', () => {
    const claimItemPrefix = 'src/modules/claim-item/';
    const pureClaimItemEntries = pureManifest.filter((entry) =>
      entry.startsWith(claimItemPrefix),
    );
    const dbClaimItemEntries = dbManifest.filter((entry) =>
      entry.startsWith(claimItemPrefix),
    );

    expect(
      pureClaimItemEntries.filter((entry) =>
        entry.endsWith('.db-gated.integration.spec.ts'),
      ),
    ).toEqual([]);
    expect(
      dbClaimItemEntries.filter(
        (entry) => !entry.endsWith('.db-gated.integration.spec.ts'),
      ),
    ).toEqual([]);
  });

  it('keeps manifest entries unique and backed by existing files', () => {
    for (const manifest of [pureManifest, dbManifest]) {
      expect(new Set(manifest).size).toBe(manifest.length);
      for (const entry of manifest) {
        expect(fs.existsSync(path.join(API_ROOT, entry))).toBe(true);
      }
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

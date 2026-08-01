/**
 * UYAP-FINAL-CI-ELIGIBILITY-I01 — official pipeline final CI qualification.
 *
 * This suite does not add a production path. It keeps the complete official
 * serializer test surface in the blocking pure manifest and independently
 * verifies the two terminal containment properties: default-OFF and zero
 * production reachability.
 */
import * as fs from 'node:fs';
import * as path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../../../../..');
const REPO_ROOT = path.resolve(API_ROOT, '../../..');
const SRC_ROOT = path.join(API_ROOT, 'src');
const UYAP_ROOT = path.join(SRC_ROOT, 'modules/uyap');
const OFFICIAL_ROOT = path.join(UYAP_ROOT, 'official');
const OFFICIAL_TEST_ROOT = path.join(OFFICIAL_ROOT, '__tests__');
const MANIFEST = path.join(
  API_ROOT,
  'ci-manifests/pure/uyap-icrabot-tebligat.txt',
);
const CI_WORKFLOW = path.join(REPO_ROOT, '.github/workflows/ci.yml');

const toPosix = (value: string): string => value.replace(/\\/g, '/');

function walk(root: string): string[] {
  return fs.readdirSync(root, { withFileTypes: true }).flatMap((entry) => {
    const absolute = path.join(root, entry.name);
    if (entry.isDirectory()) return walk(absolute);
    return entry.isFile() ? [absolute] : [];
  });
}

function productionTypeScriptFiles(root: string): string[] {
  return walk(root).filter(
    (file) =>
      file.endsWith('.ts') &&
      !file.endsWith('.spec.ts') &&
      !file.includes(`${path.sep}__tests__${path.sep}`),
  );
}

function manifestEntries(): string[] {
  return fs
    .readFileSync(MANIFEST, 'utf8')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith('#'));
}

describe('UYAP official pipeline final CI qualification', () => {
  it('blocking CI manifest executes every official spec exactly once', () => {
    const entries = manifestEntries();
    const officialEntries = entries
      .filter((entry) => entry.startsWith('src/modules/uyap/official/__tests__/'))
      .sort();
    const officialSpecs = fs
      .readdirSync(OFFICIAL_TEST_ROOT)
      .filter((name) => name.endsWith('.spec.ts'))
      .map((name) => `src/modules/uyap/official/__tests__/${name}`)
      .sort();

    expect(officialEntries).toEqual(officialSpecs);
    expect(new Set(entries).size).toBe(entries.length);

    const workflow = fs.readFileSync(CI_WORKFLOW, 'utf8');
    expect(workflow).toContain(
      'bash apps/api/scripts/run-ci-manifest.sh pure/uyap-icrabot-tebligat',
    );
  });

  it('M01 exact-version consumer predecessor remains in the same blocking manifest', () => {
    const m01 = 'src/modules/uyap/__tests__/uyap-m01-legal-basis-consumer.spec.ts';
    expect(manifestEntries().filter((entry) => entry === m01)).toHaveLength(1);
  });

  it('official structured emission remains default-OFF and production-unreachable', () => {
    const servicePath = path.join(
      OFFICIAL_ROOT,
      'official-alacakkalemi-structured-emission.service.ts',
    );
    const service = fs.readFileSync(servicePath, 'utf8');
    expect(service).toContain(
      "UYAP_OFFICIAL_ALACAKKALEMI_STRUCTURED_EMISSION_ENABLED === 'true'",
    );

    const moduleSource = fs.readFileSync(path.join(UYAP_ROOT, 'uyap.module.ts'), 'utf8');
    expect(moduleSource).not.toContain('UyapOfficialAlacakKalemiStructuredEmissionService');

    const callers = productionTypeScriptFiles(SRC_ROOT)
      .filter((file) => file !== servicePath)
      .filter((file) =>
        fs
          .readFileSync(file, 'utf8')
          .includes('UyapOfficialAlacakKalemiStructuredEmissionService'),
      )
      .map((file) => toPosix(path.relative(API_ROOT, file)));
    expect(callers).toEqual([]);

    const dormant = fs.readFileSync(
      path.join(OFFICIAL_ROOT, 'official-dormant-dispatch.ts'),
      'utf8',
    );
    expect(dormant).toMatch(/UYAP_DORMANT_DISPATCH_ENABLED\s*=\s*false as const/);
    expect(dormant).not.toMatch(/process\.env/);
  });

  it('canonical resolution capability and non-production claims remain fail-closed', () => {
    const serializer = fs.readFileSync(
      path.join(OFFICIAL_ROOT, 'official-canonical-serializer.ts'),
      'utf8',
    );
    const structured = fs.readFileSync(
      path.join(OFFICIAL_ROOT, 'official-alacakkalemi-structured-emission.service.ts'),
      'utf8',
    );

    expect(serializer).toContain('isResolverIssuedOfficialCodeResolution');
    expect(serializer).toContain('caller-created veya structural-copy sonuc kabul edilmez');
    expect(serializer).toMatch(/officialDtdValidated:\s*false/);
    expect(structured).toMatch(/officialDtdValidated:\s*false/);
    expect(structured).not.toMatch(/\.(create|update|upsert|delete|send|publish)\s*\(/);
  });
});

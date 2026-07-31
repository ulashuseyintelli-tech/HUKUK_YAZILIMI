import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const API_ROOT = path.resolve(__dirname, '../../../..');
const PROJECT_ROOT = path.resolve(API_ROOT, '../..');

describe('RECEIVABLE nafaka immutable Legal Basis release', () => {
  it('validates the v1-preserving registry v2 and exact dormant RCV-LB-R1 payload', () => {
    const validator = path.join(
      PROJECT_ROOT,
      'scripts/governance/validate-receivable-nafaka-legal-basis-release.cjs',
    );
    const result = spawnSync(process.execPath, [validator, '--self-test'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
    expect(result.stdout).toBe(
      'NAFAKA_LEGAL_BASIS_RELEASE_VALID ' +
        'releaseId=RCV-LB-R1 ' +
        'entryCount=7 ' +
        'releaseChecksum=57894751d415bfc02dbdacf0a5b4291c3bc8c0c8dc198b8d0913944ea1825104 ' +
        'registryVersion=2 ' +
        'registryEntryCount=13 ' +
        'registryChecksum=f62c738afc201c4733be654c5d1ce273ccad695b66b25814209cafeda4c68e0c\n',
    );
  });

  it('keeps the unsigned release dormant and absent from production module composition', () => {
    const moduleSource = fs.readFileSync(
      path.join(API_ROOT, 'src/modules/claim-item/claim-item.module.ts'),
      'utf8',
    );
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(
          PROJECT_ROOT,
          'docs/governance/receivable-legal-basis-release-r1.manifest.json',
        ),
        'utf8',
      ),
    ) as {
      runtimeStatus: string;
      signatureStatus: string;
      signatures: unknown[];
    };

    expect(manifest).toMatchObject({
      runtimeStatus: 'DORMANT_DEFAULT_OFF',
      signatureStatus: 'PENDING_NOT_EXECUTED',
      signatures: [],
    });
    expect(moduleSource).not.toContain('receivable-legal-basis-release-r1');
    expect(moduleSource).not.toContain('receivable-legal-subtype-registry-v2');
    expect(
      fs.readFileSync(
        path.join(
          PROJECT_ROOT,
          'scripts/governance/validate-receivable-nafaka-legal-basis-release.cjs',
        ),
        'utf8',
      ),
    ).not.toContain('writeFileSync');
  });
});

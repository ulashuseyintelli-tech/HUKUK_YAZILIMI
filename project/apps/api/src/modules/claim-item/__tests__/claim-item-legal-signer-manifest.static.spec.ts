import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../../..');
const DOCS_ROOT = path.join(PROJECT_ROOT, 'docs');
const VALIDATOR = path.join(
  PROJECT_ROOT,
  'scripts/governance/validate-receivable-legal-signer-manifest.cjs',
);
const ARTIFACTS = [
  'rcv-claim-legal-signer-access-control-matrix-v1.md',
  'rcv-claim-legal-signer-compromise-response-runbook-v1.md',
  'rcv-claim-legal-signer-cloudtrail-evidence-v1.json',
  'rcv-claim-legal-signer-custody-crosswalk-v1.md',
  'rcv-claim-legal-signer-kc01-key-ceremony-contract-v1.md',
  'rcv-claim-legal-signer-key-possession-evidence-v1.json',
  'rcv-claim-legal-signer-public-key-manifest-v1.checksum.json',
  'rcv-claim-legal-signer-public-key-manifest-v1.json',
  'rcv-claim-legal-signer-public-key-manifest-v1.schema.json',
  'rcv-claim-legal-signer-revocation-policy-v1.md',
  'rcv-claim-legal-signer-rotation-policy-v1.md',
  'rcv-claim-legal-signer-trust-root-onboarding-package-v1.md',
] as const;

describe('RCV-CLAIM-FORM-P02-S08-D02-KC01 public signer manifest', () => {
  it('passes the deterministic manifest, checksum, SPKI and possession self-test', () => {
    const output = execFileSync(process.execPath, [VALIDATOR, '--self-test'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });

    expect(output).toContain('LEGAL_SIGNER_MANIFEST_VALID');
    expect(output).toContain('entryCount=3');
    expect(output).toContain('crossRoleNegatives=6');
    expect(output).toContain('cloudTrailEvents=38');
  });

  it('ships every bounded ceremony, custody, lifecycle and trust-root artifact', () => {
    for (const artifact of ARTIFACTS) {
      expect(fs.existsSync(path.join(DOCS_ROOT, artifact))).toBe(true);
    }
  });

  it('contains no private AWS identity, credential or private-key field', () => {
    const combined = ARTIFACTS.map((artifact) =>
      fs.readFileSync(path.join(DOCS_ROOT, artifact), 'utf8'),
    ).join('\n');

    expect(combined).not.toMatch(/arn:aws:/i);
    expect(combined).not.toMatch(/(^|[^0-9A-Za-z])\d{12}([^0-9A-Za-z]|$)/);
    expect(combined).not.toMatch(
      /"(?:accountId|keyArn|principalArn|privateKey|secretKey|seed|credential|token|password|session|recoveryCode)"\s*:/i,
    );
  });

  it('keeps trust-root and signing authority inactive throughout the public pack', () => {
    const manifest = JSON.parse(
      fs.readFileSync(
        path.join(DOCS_ROOT, 'rcv-claim-legal-signer-public-key-manifest-v1.json'),
        'utf8',
      ),
    ) as {
      trustRootStatus: string;
      signingAuthorityStatus: string;
      productionSignatureStatus: string;
      entries: Array<{ trustRootStatus: string; signingAuthorityStatus: string }>;
    };

    expect(manifest.trustRootStatus).toBe('PENDING_ONBOARDING');
    expect(manifest.signingAuthorityStatus).toBe('NOT_ACTIVE');
    expect(manifest.productionSignatureStatus).toBe('NONE');
    expect(manifest.entries).toHaveLength(3);
    expect(manifest.entries.every((entry) => entry.trustRootStatus === 'PENDING_ONBOARDING')).toBe(
      true,
    );
    expect(manifest.entries.every((entry) => entry.signingAuthorityStatus === 'NOT_ACTIVE')).toBe(
      true,
    );
  });

  it('keeps the SPKI provider manifest distinct from the raw-key TR01 contract', () => {
    const contract = fs.readFileSync(
      path.join(DOCS_ROOT, 'rcv-claim-legal-signer-kc01-key-ceremony-contract-v1.md'),
      'utf8',
    );
    const onboarding = fs.readFileSync(
      path.join(DOCS_ROOT, 'rcv-claim-legal-signer-trust-root-onboarding-package-v1.md'),
      'utf8',
    );

    expect(contract).toContain('provider-ceremony identity');
    expect(contract).toContain('TR01');
    expect(onboarding).toContain('raw 32-byte public key');
    expect(onboarding).toContain('unpadded base64url');
    expect(onboarding).toContain('production `kms:Sign` permissions');
  });
});

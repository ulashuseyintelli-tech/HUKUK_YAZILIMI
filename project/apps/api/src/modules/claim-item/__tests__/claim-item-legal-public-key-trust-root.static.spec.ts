import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';

const PROJECT_ROOT = path.resolve(__dirname, '../../../../../..');
const DOCS_ROOT = path.join(PROJECT_ROOT, 'docs');
const VALIDATOR = path.join(
  PROJECT_ROOT,
  'scripts/governance/validate-receivable-legal-public-key-trust-root.cjs',
);
const APP_MODULE = path.join(PROJECT_ROOT, 'apps/api/src/app.module.ts');
const RESOLVER = path.join(
  PROJECT_ROOT,
  'apps/api/src/modules/claim-item/formation-intent/legal-public-key-trust-root.resolver.ts',
);
const ARTIFACTS = [
  'rcv-claim-legal-public-key-trust-root-activation-runbook-v1.md',
  'rcv-claim-legal-public-key-trust-root-aws-parity-v1.json',
  'rcv-claim-legal-public-key-trust-root-contract-v1.md',
  'rcv-claim-legal-public-key-trust-root-rollback-runbook-v1.md',
  'rcv-claim-legal-public-key-trust-root-v1.checksum.json',
  'rcv-claim-legal-public-key-trust-root-v1.json',
  'rcv-claim-legal-public-key-trust-root-v1.schema.json',
  'rcv-claim-legal-signature-envelope-verification-contract-v1.md',
] as const;

describe('RCV-CLAIM-FORM-P02-S08-D02-TR01 trust-root pack', () => {
  it('passes deterministic schema, checksum, KC01 parity and negative self-tests', () => {
    const output = execFileSync(process.execPath, [VALIDATOR, '--self-test'], {
      cwd: PROJECT_ROOT,
      encoding: 'utf8',
    });
    expect(output).toContain('LEGAL_PUBLIC_KEY_TRUST_ROOT_VALID');
    expect(output).toContain('entryCount=3');
    expect(output).toContain('rawKeyCount=3');
  });

  it('ships the complete bounded trust-root and operations pack', () => {
    for (const artifact of ARTIFACTS) {
      expect(fs.existsSync(path.join(DOCS_ROOT, artifact))).toBe(true);
    }
  });

  it('contains no private AWS identity, credential or private-key material', () => {
    const combined = [
      ...ARTIFACTS.map((artifact) => fs.readFileSync(path.join(DOCS_ROOT, artifact), 'utf8')),
      fs.readFileSync(RESOLVER, 'utf8'),
    ].join('\n');
    expect(combined).not.toMatch(/arn:aws:/i);
    expect(combined).not.toMatch(/(^|[^0-9A-Za-z])\d{12}([^0-9A-Za-z]|$)/);
    expect(combined).not.toMatch(
      /"(?:accountId|keyArn|principalArn|privateKey|secretKey|seed|credential|token|password|session|mfaSecret|recoveryCode)"\s*:/i,
    );
  });

  it('keeps the resolver dormant and introduces no KMS Sign call or production composition', () => {
    const appModule = fs.readFileSync(APP_MODULE, 'utf8');
    const resolver = fs.readFileSync(RESOLVER, 'utf8');
    expect(appModule).not.toContain('LegalPublicKeyTrustRootResolverV1');
    expect(resolver).not.toMatch(/KMSClient|SignCommand|kms:Sign|@aws-sdk\/client-kms/);
    expect(resolver).not.toMatch(/@Injectable|@Module|Controller|Cron|OnModuleInit/);
  });

  it('registers each TR01 suite exactly once in the critical CI manifest', () => {
    const manifest = fs
      .readFileSync(
        path.join(PROJECT_ROOT, 'apps/api/ci-manifests/pure/claim-collection-finance.txt'),
        'utf8',
      )
      .split(/\r?\n/)
      .filter(Boolean);
    for (const suite of [
      'src/modules/claim-item/__tests__/claim-item-legal-public-key-trust-root.static.spec.ts',
      'src/modules/claim-item/__tests__/legal-public-key-trust-root.resolver.spec.ts',
    ]) {
      expect(manifest.filter((line) => line === suite)).toHaveLength(1);
    }
  });
});

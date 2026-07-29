import { createHash, generateKeyPairSync, sign } from 'node:crypto';
import {
  LEGAL_TRUST_ROOT_ID,
  LEGAL_TRUST_ROOT_ROLES,
  LEGAL_TRUST_ROOT_VERSION,
  LegalPublicKeyTrustRootResolverV1,
  type LegalPublicKeyTrustRootBundleV1,
  type LegalTrustRootEntryV1,
  type LegalTrustRootRole,
  type LegalTrustRootSignaturePurpose,
  verifyResolvedEd25519Signature,
} from '../formation-intent/legal-public-key-trust-root.resolver';

const ROLE_PURPOSE: Readonly<Record<LegalTrustRootRole, LegalTrustRootSignaturePurpose>> = {
  LEGAL_REVIEWER: 'LEGAL_REVIEW_APPROVAL',
  FINAL_LEGAL_RATIFIER: 'FINAL_LEGAL_RATIFICATION',
  PRODUCTION_RELEASE_SIGNER: 'PRODUCTION_RELEASE',
};

function makeBundle(): {
  bundle: LegalPublicKeyTrustRootBundleV1;
  privateKeys: ReadonlyMap<LegalTrustRootRole, ReturnType<typeof generateKeyPairSync>['privateKey']>;
} {
  const privateKeys = new Map<LegalTrustRootRole, ReturnType<typeof generateKeyPairSync>['privateKey']>();
  const entries = LEGAL_TRUST_ROOT_ROLES.map((role, index): LegalTrustRootEntryV1 => {
    const pair = generateKeyPairSync('ed25519');
    const jwk = pair.publicKey.export({ format: 'jwk' });
    if (!jwk.x) throw new Error('test key did not expose an Ed25519 x coordinate');
    privateKeys.set(role, pair.privateKey);
    const raw = Buffer.from(jwk.x, 'base64url');
    const purpose = ROLE_PURPOSE[role];
    return {
      signerId: `TEST-${index + 1}`,
      role,
      algorithm: 'Ed25519',
      publicKey: raw.toString('base64url'),
      fingerprint: createHash('sha256').update(raw).digest('hex'),
      validFrom: '2026-07-29T00:00:00Z',
      validUntil: null,
      status: 'ACTIVE_FOR_VERIFICATION',
      revokedAt: null,
      allowedDocumentTypes: ['LEGAL_BASIS_RELEASE'],
      allowedSignaturePurposes: [purpose],
      forbiddenSignaturePurposes: (
        Object.values(ROLE_PURPOSE) as LegalTrustRootSignaturePurpose[]
      ).filter((value) => value !== purpose),
    };
  });
  return {
    bundle: {
      trustRootId: LEGAL_TRUST_ROOT_ID,
      trustRootVersion: LEGAL_TRUST_ROOT_VERSION,
      status: 'ACTIVE',
      runtimeStatus: 'DORMANT',
      signingAuthorityStatus: 'NOT_ACTIVE',
      entries,
    },
    privateKeys,
  };
}

function exactInput(entry: LegalTrustRootEntryV1) {
  return {
    trustRootId: LEGAL_TRUST_ROOT_ID,
    trustRootVersion: LEGAL_TRUST_ROOT_VERSION,
    signerId: entry.signerId,
    role: entry.role,
    algorithm: 'Ed25519' as const,
    publicKeyFingerprint: entry.fingerprint,
    signaturePurpose: entry.allowedSignaturePurposes[0],
    documentType: 'LEGAL_BASIS_RELEASE' as const,
    verificationTime: '2026-07-29T12:00:00Z',
  };
}

describe('TR01 exact-version trust-root resolver', () => {
  it.each(LEGAL_TRUST_ROOT_ROLES)('resolves the exact %s purpose only', (role) => {
    const { bundle } = makeBundle();
    const resolver = new LegalPublicKeyTrustRootResolverV1(bundle);
    const entry = bundle.entries.find((value) => value.role === role)!;
    expect(resolver.resolveTrustedSigner(exactInput(entry))).toEqual({ ok: true, signer: entry });

    for (const wrongPurpose of Object.values(ROLE_PURPOSE).filter(
      (value) => value !== ROLE_PURPOSE[role],
    )) {
      expect(
        resolver.resolveTrustedSigner({ ...exactInput(entry), signaturePurpose: wrongPurpose }),
      ).toEqual({ ok: false, code: 'SIGNATURE_PURPOSE_NOT_ALLOWED' });
    }
  });

  it.each([
    ['trustRootId', 'WRONG', 'TRUST_ROOT_ID_MISMATCH'],
    ['trustRootVersion', 2, 'TRUST_ROOT_VERSION_MISMATCH'],
    ['signerId', 'UNKNOWN', 'SIGNER_NOT_FOUND'],
    ['role', 'FINAL_LEGAL_RATIFIER', 'ROLE_MISMATCH'],
    ['publicKeyFingerprint', '0'.repeat(64), 'FINGERPRINT_MISMATCH'],
    ['signaturePurpose', 'FINAL_LEGAL_RATIFICATION', 'SIGNATURE_PURPOSE_NOT_ALLOWED'],
    ['verificationTime', 'not-a-time', 'VERIFICATION_TIME_INVALID'],
  ] as const)('fails closed for an exact %s mismatch', (field, value, code) => {
    const { bundle } = makeBundle();
    const resolver = new LegalPublicKeyTrustRootResolverV1(bundle);
    expect(
      resolver.resolveTrustedSigner({ ...exactInput(bundle.entries[0]), [field]: value }),
    ).toEqual({ ok: false, code });
  });

  it('rejects not-yet-valid, expired, revoked and retired entries', () => {
    const { bundle } = makeBundle();
    const base = bundle.entries[0];
    const resolve = (entry: LegalTrustRootEntryV1, verificationTime: string) =>
      new LegalPublicKeyTrustRootResolverV1({ ...bundle, entries: [entry] }).resolveTrustedSigner({
        ...exactInput(entry),
        verificationTime,
      });

    expect(resolve({ ...base, validFrom: '2026-07-30T00:00:00Z' }, '2026-07-29T00:00:00Z')).toEqual({
      ok: false,
      code: 'NOT_YET_VALID',
    });
    expect(resolve({ ...base, validUntil: '2026-07-29T06:00:00Z' }, '2026-07-29T06:00:00Z')).toEqual({
      ok: false,
      code: 'EXPIRED',
    });
    expect(resolve({ ...base, status: 'REVOKED', revokedAt: '2026-07-29T05:00:00Z' }, '2026-07-29T06:00:00Z')).toEqual({
      ok: false,
      code: 'REVOKED',
    });
    expect(resolve({ ...base, status: 'RETIRED' }, '2026-07-29T06:00:00Z')).toEqual({
      ok: false,
      code: 'SIGNER_INACTIVE',
    });
  });

  it('verifies an ephemeral Ed25519 signature and rejects payload/signature mutation', () => {
    const { bundle, privateKeys } = makeBundle();
    const entry = bundle.entries[0];
    const resolution = new LegalPublicKeyTrustRootResolverV1(bundle).resolveTrustedSigner(
      exactInput(entry),
    );
    expect(resolution.ok).toBe(true);
    if (!resolution.ok) throw new Error('expected exact signer resolution');

    const message = Buffer.from('TR01 offline verification fixture', 'utf8');
    const privateKey = privateKeys.get(entry.role)!;
    const signature = sign(null, message, privateKey);
    expect(verifyResolvedEd25519Signature(resolution.signer, message, signature)).toBe(true);
    expect(
      verifyResolvedEd25519Signature(
        resolution.signer,
        Buffer.from('mutated payload', 'utf8'),
        signature,
      ),
    ).toBe(false);
    const mutated = Buffer.from(signature);
    mutated[0] ^= 0x01;
    expect(verifyResolvedEd25519Signature(resolution.signer, message, mutated)).toBe(false);
  });
});

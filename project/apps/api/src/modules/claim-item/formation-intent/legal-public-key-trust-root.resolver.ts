import { createPublicKey, verify } from 'node:crypto';

export const LEGAL_TRUST_ROOT_ID = 'RCV-CLAIM-LEGAL-PUBLIC-KEY-TRUST-ROOT' as const;
export const LEGAL_TRUST_ROOT_VERSION = 1 as const;

export const LEGAL_TRUST_ROOT_ROLES = [
  'LEGAL_REVIEWER',
  'FINAL_LEGAL_RATIFIER',
  'PRODUCTION_RELEASE_SIGNER',
] as const;

export type LegalTrustRootRole = (typeof LEGAL_TRUST_ROOT_ROLES)[number];
export type LegalTrustRootSignaturePurpose =
  | 'LEGAL_REVIEW_APPROVAL'
  | 'FINAL_LEGAL_RATIFICATION'
  | 'PRODUCTION_RELEASE';

export interface LegalTrustRootEntryV1 {
  readonly signerId: string;
  readonly role: LegalTrustRootRole;
  readonly algorithm: 'Ed25519';
  readonly publicKey: string;
  readonly fingerprint: string;
  readonly validFrom: string;
  readonly validUntil: string | null;
  readonly status: 'PENDING' | 'ACTIVE_FOR_VERIFICATION' | 'SUPERSEDED' | 'REVOKED' | 'RETIRED';
  readonly revokedAt: string | null;
  readonly allowedDocumentTypes: readonly ['LEGAL_BASIS_RELEASE'];
  readonly allowedSignaturePurposes: readonly LegalTrustRootSignaturePurpose[];
  readonly forbiddenSignaturePurposes: readonly LegalTrustRootSignaturePurpose[];
}

export interface LegalPublicKeyTrustRootBundleV1 {
  readonly trustRootId: typeof LEGAL_TRUST_ROOT_ID;
  readonly trustRootVersion: typeof LEGAL_TRUST_ROOT_VERSION;
  readonly status: 'ACTIVE';
  readonly runtimeStatus: 'DORMANT';
  readonly signingAuthorityStatus: 'NOT_ACTIVE';
  readonly entries: readonly LegalTrustRootEntryV1[];
}

export interface ResolveTrustedSignerInputV1 {
  readonly trustRootId: string;
  readonly trustRootVersion: number;
  readonly signerId: string;
  readonly role: LegalTrustRootRole;
  readonly algorithm: 'Ed25519';
  readonly publicKeyFingerprint: string;
  readonly signaturePurpose: LegalTrustRootSignaturePurpose;
  readonly documentType: 'LEGAL_BASIS_RELEASE';
  readonly verificationTime: string;
}

export const TRUSTED_SIGNER_RESOLUTION_FAILURES = [
  'TRUST_ROOT_ID_MISMATCH',
  'TRUST_ROOT_VERSION_MISMATCH',
  'TRUST_ROOT_INACTIVE',
  'SIGNER_NOT_FOUND',
  'ROLE_MISMATCH',
  'ALGORITHM_MISMATCH',
  'FINGERPRINT_MISMATCH',
  'DOCUMENT_TYPE_NOT_ALLOWED',
  'SIGNATURE_PURPOSE_NOT_ALLOWED',
  'NOT_YET_VALID',
  'EXPIRED',
  'REVOKED',
  'SIGNER_INACTIVE',
  'VERIFICATION_TIME_INVALID',
] as const;

export type TrustedSignerResolutionFailureCode =
  (typeof TRUSTED_SIGNER_RESOLUTION_FAILURES)[number];

export type ResolveTrustedSignerResultV1 =
  | { readonly ok: true; readonly signer: LegalTrustRootEntryV1 }
  | { readonly ok: false; readonly code: TrustedSignerResolutionFailureCode };

/**
 * RCV-CLAIM-FORM-P02-S08-D02-TR01.
 *
 * Dormant, read-only and exact-version-only. This resolver is intentionally not
 * registered in a Nest module and has no production call-site in TR01.
 * Callers must provide every authority dimension; no current/latest/default,
 * role-only, fingerprint-only or provider-alias fallback exists.
 */
export class LegalPublicKeyTrustRootResolverV1 {
  constructor(private readonly bundle: LegalPublicKeyTrustRootBundleV1) {}

  resolveTrustedSigner(input: ResolveTrustedSignerInputV1): ResolveTrustedSignerResultV1 {
    if (input.trustRootId !== this.bundle.trustRootId) {
      return { ok: false, code: 'TRUST_ROOT_ID_MISMATCH' };
    }
    if (input.trustRootVersion !== this.bundle.trustRootVersion) {
      return { ok: false, code: 'TRUST_ROOT_VERSION_MISMATCH' };
    }
    if (
      this.bundle.status !== 'ACTIVE' ||
      this.bundle.runtimeStatus !== 'DORMANT' ||
      this.bundle.signingAuthorityStatus !== 'NOT_ACTIVE'
    ) {
      return { ok: false, code: 'TRUST_ROOT_INACTIVE' };
    }

    const signer = this.bundle.entries.find((entry) => entry.signerId === input.signerId);
    if (!signer) return { ok: false, code: 'SIGNER_NOT_FOUND' };
    if (signer.role !== input.role) return { ok: false, code: 'ROLE_MISMATCH' };
    if (signer.algorithm !== input.algorithm) return { ok: false, code: 'ALGORITHM_MISMATCH' };
    if (signer.fingerprint !== input.publicKeyFingerprint) {
      return { ok: false, code: 'FINGERPRINT_MISMATCH' };
    }
    if (!signer.allowedDocumentTypes.includes(input.documentType)) {
      return { ok: false, code: 'DOCUMENT_TYPE_NOT_ALLOWED' };
    }
    if (
      !signer.allowedSignaturePurposes.includes(input.signaturePurpose) ||
      signer.forbiddenSignaturePurposes.includes(input.signaturePurpose)
    ) {
      return { ok: false, code: 'SIGNATURE_PURPOSE_NOT_ALLOWED' };
    }

    const verificationTime = Date.parse(input.verificationTime);
    if (!Number.isFinite(verificationTime)) {
      return { ok: false, code: 'VERIFICATION_TIME_INVALID' };
    }
    if (verificationTime < Date.parse(signer.validFrom)) {
      return { ok: false, code: 'NOT_YET_VALID' };
    }
    if (signer.validUntil !== null && verificationTime >= Date.parse(signer.validUntil)) {
      return { ok: false, code: 'EXPIRED' };
    }
    if (signer.status === 'REVOKED' || signer.revokedAt !== null) {
      return { ok: false, code: 'REVOKED' };
    }
    if (signer.status !== 'ACTIVE_FOR_VERIFICATION') {
      return { ok: false, code: 'SIGNER_INACTIVE' };
    }

    return { ok: true, signer };
  }
}

/**
 * Verifies caller-supplied bytes only after exact trust-root resolution.
 * TR01 does not decide the future Legal Basis payload/digest preimage and does
 * not invoke AWS KMS. The resolved raw Ed25519 public key is verification-only.
 */
export function verifyResolvedEd25519Signature(
  signer: LegalTrustRootEntryV1,
  message: Uint8Array,
  signature: Uint8Array,
): boolean {
  const publicKey = createPublicKey({
    format: 'jwk',
    key: {
      crv: 'Ed25519',
      kty: 'OKP',
      x: signer.publicKey,
    },
  });
  return verify(null, message, publicKey, signature);
}

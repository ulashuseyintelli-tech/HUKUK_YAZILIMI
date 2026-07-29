# Receivable Legal Public-Key Trust Root Contract V1

## Authority and boundary

`RCV-CLAIM-LEGAL-PUBLIC-KEY-TRUST-ROOT@1` is the immutable production verification
authority for the three exact KC01 Ed25519 public keys. The repository bundle is the
canonical store because the repository contains no pre-existing database or external trust-anchor
authority. A parallel signer registry or database authority is prohibited.

The bundle being `ACTIVE` means only that its public keys may be selected for exact verification.
It does not authorize AWS KMS `Sign`, create a Legal Basis release, activate Claim Formation,
register a Nest provider or add a production call-site. Runtime remains `DORMANT`, signing
authority remains `NOT_ACTIVE`, and production signatures remain `NONE`.

## Atomic bundle

Version 1 contains exactly three entries, in this order:

1. `LEGAL_REVIEWER / TELLI-LEGAL-REVIEWER-01`
2. `FINAL_LEGAL_RATIFIER / TELLI-FINAL-LEGAL-RATIFIER-01`
3. `PRODUCTION_RELEASE_SIGNER / TELLI-PROD-LEGAL-01`

The three signer IDs, roles, aliases, raw keys, SPKI keys and both fingerprint families are
pairwise distinct. Version 1 is admitted or withdrawn as one immutable bundle; partial activation
is prohibited. An entry cannot be edited in place. Rotation creates a new public key and a new
trust-root version while retaining historical verification evidence.

## Public-key identities

The canonical verification identity is the raw 32-byte Ed25519 key, encoded as unpadded
base64url. Its SHA-256 lowercase hexadecimal digest is both `fingerprint` and the suffix of
`keyId`. The AWS provider evidence remains SPKI DER encoded as padded Base64 with a separate
SPKI SHA-256 fingerprint. The deterministic validator derives the raw key from SPKI and requires
both identities to match the checksum-pinned KC01 manifest; neither representation may substitute
silently for the other.

## Exact resolution and purpose isolation

Every lookup supplies the trust-root ID/version, signer ID, role, algorithm, raw-key fingerprint,
document type, signature purpose and verification time. There is no current/latest/default,
role-only, fingerprint-only, alias or unknown-signer fallback.

| Role | Allowed purpose | Forbidden purposes | Document type |
|---|---|---|---|
| `LEGAL_REVIEWER` | `LEGAL_REVIEW_APPROVAL` | final ratification, production release | `LEGAL_BASIS_RELEASE` |
| `FINAL_LEGAL_RATIFIER` | `FINAL_LEGAL_RATIFICATION` | legal review, production release | `LEGAL_BASIS_RELEASE` |
| `PRODUCTION_RELEASE_SIGNER` | `PRODUCTION_RELEASE` | legal review, final ratification | `LEGAL_BASIS_RELEASE` |

## Lifecycle

`PENDING`, `ACTIVE_FOR_VERIFICATION`, `SUPERSEDED`, `REVOKED` and `RETIRED` are the closed
entry vocabulary. Version 1 entries are `ACTIVE_FOR_VERIFICATION`, with `validFrom` equal to the
bundle ratification/activation timestamp and `validUntil = null`. Revoked entries fail closed.
Superseded or retired keys remain immutable historical evidence but cannot be selected as the
active signer. Historical-compromise exceptions require a later explicit policy; TR01 creates none.

Rotation, revocation and compromise behavior is pinned respectively to:

- `RCV-CLAIM-LEGAL-SIGNER-ROTATION-POLICY@1`
- `RCV-CLAIM-LEGAL-SIGNER-REVOCATION-POLICY@1`
- `RCV-CLAIM-LEGAL-SIGNER-COMPROMISE-RESPONSE@1`

## Canonicalization and activation

The checksum preimage is the complete bundle excluding only `trustRootChecksum`: UTF-8, NFC,
LF, recursive lexicographic object-key order, preserved array order, no insignificant whitespace.
The role order above is normative. SHA-256 lowercase hexadecimal is mandatory.

Repository merge plus the checksum-pinned bundle and formal governance ratification performs the
single atomic activation of version 1. No live database apply exists. The resolver is read-only and
deliberately absent from production module composition.

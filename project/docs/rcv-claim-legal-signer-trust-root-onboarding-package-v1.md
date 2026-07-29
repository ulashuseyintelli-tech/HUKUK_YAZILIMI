# Legal Signer Trust-Root Onboarding Package V1

```text
Target task              RCV-CLAIM-FORM-P02-S08-D02-TR01
Current status           NOT STARTED / OWNER GO REQUIRED
Provider manifest        AVAILABLE / CHECKSUM-PINNED
Trust root               PENDING_ONBOARDING
Signing authority        NOT_ACTIVE
Production signature     NONE
Runtime                   DORMANT
```

TR01 must consume the exact KC01 manifest checksum and verify all three SPKI keys and fingerprints.
It must then derive each Ed25519 raw 32-byte public key from the SPKI structure, encode it as
unpadded base64url and calculate the raw-key SHA-256 identity required by
`RECEIVABLE-GOVERNANCE.md` §23.29.4. The SPKI and raw identities must be cross-linked; neither may
be silently substituted for the other.

For every role, TR01 also requires exact `validFrom`, optional `validUntil`, custody owner,
role-specific authority evidence, rotation/revocation state and an exact permanent principal. The
human legal roles must remain distinct. The production service principal must be a workload
identity, not a human identity.

Activation requires a separate owner decision and exact trust-root record. KC01 does not authorize:

- production `kms:Sign` permissions;
- Legal Basis release signatures;
- signed release publication;
- resolver/provider wiring;
- runtime activation;
- D02-F01, I04 or I05.

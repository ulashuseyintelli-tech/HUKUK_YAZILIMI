# KC01 AWS KMS Legal Signer Key Ceremony Contract V1

```text
Task                    RCV-CLAIM-FORM-P02-S08-D02-KC01
Provider                AWS KMS
Region                  eu-central-1
Key spec                ECC_NIST_EDWARDS25519
Key usage               SIGN_VERIFY
Origin                  AWS_KMS
Multi-region            false
Key count               3
Private-key custody     AWS KMS / non-exportable
Trust-root status       PENDING_ONBOARDING
Signing authority       NOT_ACTIVE
Production signature    NONE
Runtime                  DORMANT
```

## Purpose and authority boundary

KC01 proves that three distinct AWS KMS Ed25519 key objects exist and that each
corresponding public key controls its own private key. The ceremony does not approve legal
content, ratify a release, activate a trust root, bind a production workload principal or sign a
production Legal Basis release.

The canonical challenge uses `ED25519_SHA_512` with `RAW` message type and
`productionAuthority=false`. Its signatures are possession evidence only. They are not legal
review, final legal ratification or publication authority.

## Environment and cost controls

- Owner-controlled AWS account and `eu-central-1` were verified before key creation.
- The existing Free Plan was preserved; AWS Organizations and IAM Identity Center organization
  activation were not used.
- The ceremony used an MFA-protected, console-only temporary IAM bootstrap identity through
  AWS CloudShell. No IAM access key was created.
- Budget `KC01-AWS-KMS-MONTHLY` is set to USD 5/month with 50%, 80% and 100% notifications.
- No account ID, key ARN, principal ARN, CloudTrail bucket identity, credential, token or MFA
  material is present in this repository pack.

## Durable audit gate

Before key creation, a multi-region CloudTrail trail covering `eu-central-1` was verified with:

- management events enabled;
- durable S3 delivery;
- log-file validation enabled;
- S3 public access blocked;
- S3 versioning enabled;
- indefinite retention with no automatic expiration;
- a retrievable harmless KMS read event.

The redacted event pack additionally proves three `CreateKey`, three `CreateAlias`, four
`TagResource`, four `GetPublicKey`, three successful `Sign`, three post-removal denied `Sign`,
three successful `Verify` and fifteen `PutKeyPolicy` events. AWS omits key request parameters from
authorization-boundary denials; those three events are correlated to the same ceremony principal
and remain explicitly unattributed to a key alias in the public pack.

The three asymmetric signing keys are not used to encrypt CloudTrail logs. Full trail, bucket,
account and event resource identifiers remain only in the owner-controlled private evidence
record referenced by the public manifest.

## Creation order and public fingerprints

| Order | Role | Signer ID | Alias | SPKI DER SHA-256 |
|---:|---|---|---|---|
| 1 | `LEGAL_REVIEWER` | `TELLI-LEGAL-REVIEWER-01` | `alias/telli-legal-reviewer-01` | `bb35e308e429124c5cd2865930d926de5cd43a7caf2cc4e690505bbe228b0f34` |
| 2 | `FINAL_LEGAL_RATIFIER` | `TELLI-FINAL-LEGAL-RATIFIER-01` | `alias/telli-final-legal-ratifier-01` | `1da0f683f9922cb564544e5d31633aacb5c3bbdc53b15f6c6c96cb6925a61e40` |
| 3 | `PRODUCTION_RELEASE_SIGNER` | `TELLI-PROD-LEGAL-01` | `alias/telli-prod-legal-01` | `88cd9f1bdb50f57bc6a7496f9b94136bfbf4658888b5d82f933f3b5fb0537314` |

The manifest fingerprint is over the exact SPKI DER bytes. It is a provider-ceremony identity,
not the production trust-root identity from `RECEIVABLE-GOVERNANCE.md` §23.29.4. TR01 must
perform the separately gated raw-32-byte/unpadded-base64url derivation and onboarding without
changing these provider bytes or silently treating this pending manifest as an active trust root.

## Possession and separation evidence

- KMS `Verify`: 3/3 PASS.
- Independent Node/OpenSSL-compatible SPKI verification: 3/3 PASS.
- Cross-role verification: 6/6 expected negative results.
- Key IDs, aliases, SPKI public keys and SPKI fingerprints: pairwise distinct.
- Temporary `kms:Sign` and `kms:Verify` grants: removed from all three key policies.
- Post-removal challenge signing: `AccessDenied` for all three keys.
- Permanent human or service `kms:Sign` principal: none.

## Public and private evidence

Public evidence consists of the manifest, checksum, closed schema, validator, redacted
possession evidence and redacted CloudTrail event evidence in this pack. Full AWS identifiers,
key policies and CloudTrail resource
references are stored only in the owner-controlled private operational record
`KC01-AWS-PRIVATE-OPERATIONAL-EVIDENCE`. The public manifest carries only its SHA-256 evidence-set
reference.

## Deferred authority

`RCV-CLAIM-FORM-P02-S08-D02-TR01` is the only next candidate. It requires a separate owner GO.
Until TR01 closes, `trustRootStatus=PENDING_ONBOARDING`,
`signingAuthorityStatus=NOT_ACTIVE`, production signing is forbidden and D02-F01 is not eligible.

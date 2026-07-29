# Legal Signer Revocation Policy V1

```text
Policy ID              RCV-CLAIM-LEGAL-SIGNER-REVOCATION-POLICY@1
Lifecycle              PENDING_ONBOARDING → ACTIVE → RETIRED | REVOKED | COMPROMISED
Append-only history    Required
Automatic recovery     Forbidden
```

Revocation triggers include suspected compromise, unauthorized signing, custody change, role
termination, account breach, key-policy drift and audit anomaly. Revocation is bound to the exact
signer/key identity and timestamp. It cannot silently revoke another role or infer a replacement.

The operational order is: stop signing, remove the signing principal, disable the key if required,
record `revokedAt`, freeze dependent release operations, preserve CloudTrail evidence, create and
onboard a replacement, then review affected signatures. Deletion is not the first response and
requires a separate destructive owner authorization.

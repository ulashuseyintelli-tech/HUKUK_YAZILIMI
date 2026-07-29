# Legal Signer Rotation Policy V1

```text
Policy ID              RCV-CLAIM-LEGAL-SIGNER-ROTATION-POLICY@1
Scheduled interval     12 months
Pre-rotation lead      30 days
Verification overlap   30 days
Automatic rotation     Not relied upon
```

Rotation creates a new AWS KMS key, public key, fingerprint and trust-root record. It does not
replace key material inside an existing asymmetric key. Alias transition occurs only after the new
key is verified and owner-authorized. The previous key becomes verification-only after cutover;
its public key and historical verification evidence remain available.

Rotation never upgrades a Legal Basis release automatically, rewrites historical signatures or
activates a signer without a separate trust-root decision. Key deletion is not a rotation step.

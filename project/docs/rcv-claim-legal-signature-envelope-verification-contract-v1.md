# Receivable Legal Signature Envelope Verification Contract V1

The future verification envelope must bind at least:

```text
signatureEnvelopeVersion
trustRootId
trustRootVersion
signerId
signerRole
publicKeyFingerprint
algorithm
signaturePurpose
documentType
payloadChecksum
signedAt
signatureEncoding
signature
```

Before cryptographic verification, every trust-root identity, purpose, document type, lifecycle
and time dimension is resolved exactly and fail-closed. `algorithm` is `Ed25519`; AWS provider
metadata calls this `ED25519_SHA_512`. The signature bytes are not produced in TR01.

TR01 deliberately does not invent the future Legal Basis signed-message contract. LB01 must pin
whether the signature covers canonical payload bytes or the canonical payload SHA-256 digest and
must bind that decision to the exact release checksum. Until then this document governs only
trust-root selection and public-key verification metadata. No production signing, approval,
release publication or runtime verification call-site is authorized by this contract.

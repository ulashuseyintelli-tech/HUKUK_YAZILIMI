# Legal Public-Key Trust Root Activation Runbook V1

## Preconditions

- implementation is merged into canonical `main`;
- required CI and deterministic bundle validation pass;
- KC01 manifest and fresh MFA/read-only AWS parity pass for all three keys;
- exact bundle and AWS parity checksums are pinned;
- no temporary or permanent `kms:Sign` principal exists;
- runtime is dormant and no production resolver call-site exists;
- rollback validation passes.

## Repository-artifact activation

The canonical store is an immutable repository artifact; there is no database or external live
apply. The activation change is one commit/PR containing one versioned three-entry bundle and one
checksum. Merge plus formal ratification changes the complete version from absent to `ACTIVE`.
Entries are never activated separately.

After merge, read the bundle back from canonical `main`, recompute both AWS parity and trust-root
checksums, validate the exact role/purpose matrix, and re-run the runtime-dormancy and production-
signing absence guards. Never invoke KMS `Sign` or mutate key policy during this runbook.

## Postconditions

```text
trustRootStatus = ACTIVE
entryCount = 3
entryStatus = ACTIVE_FOR_VERIFICATION
runtimeStatus = DORMANT
signingAuthorityStatus = NOT_ACTIVE
productionSignatureStatus = NONE
```

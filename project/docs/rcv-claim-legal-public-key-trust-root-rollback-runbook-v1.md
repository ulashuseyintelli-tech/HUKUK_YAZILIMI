# Legal Public-Key Trust Root Rollback Runbook V1

Because production signing and runtime verification are not active, version 1 can be withdrawn
without data conversion. A rollback is a new, reviewed append-only disposition that marks the
whole trust-root version withdrawn/inactive or returns the system to no active trust root. It is
never three independent entry mutations.

Rollback must preserve the bundle, checksum, KC01 manifest, AWS keys and redacted evidence for
historical audit. It must not mutate a public key in place, delete KMS keys, delete historical
evidence, fabricate a previous version or enable any signer. After rollback, exact resolver lookup
must fail closed and runtime/signing must remain dormant/inactive.

Any rollback event requires a dedicated governance/audit record and fresh owner authority. TR01
provides the ready procedure but does not pre-authorize a future rollback execution.

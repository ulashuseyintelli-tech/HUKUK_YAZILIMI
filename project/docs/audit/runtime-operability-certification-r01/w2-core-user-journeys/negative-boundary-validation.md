# W2 Negative Boundary Validation

Audit base: `9cd51295db434b437bf240a26a4421c6c8e7a211`

| Journey | Wrong tenant | Unauthorized / missing identity | Failed operation leaves no partial state | Same-tenant access | Idempotency |
|---|---|---|---|---|---|
| W2-CLIENT-01 | Foreign GET returns 404 | Protected routes return 401 | Forced transaction audit failure leaves no Client/AuditLog | Create/read PASS | N/A — no idempotency contract |
| W2-DEBTOR-01 | Foreign GET returns 404 | Protected routes return 401 | Duplicate identity returns 409 and count is unchanged | Create/read PASS | Duplicate identity guard PASS |
| W2-RECEIVABLE-01 | Foreign list is empty and detail is 404 | Protected routes return 401 | FORMATION_CONTEXT_REQUIRED leaves ClaimItem count unchanged | Active list/detail PASS | N/A for read journey |
| W2-COLLECTION-01 | Foreign GET returns 404 | Protected routes return 401 | Forced in-transaction audit failure rolls back all receipt side effects | Create/read PASS | Same key/payload replays original receipt |
| W2-OFFICE-01 | Foreign tenant reads only its own Office | Protected routes return 401 | Rejected null-name update preserves prior Office row | Update/read PASS | N/A — no idempotency contract |

The controlled identity validator resolves the actor from the signed subject and persisted user record.
A missing/unknown subject fails closed; a forged tenant claim cannot replace the persisted trusted tenant.

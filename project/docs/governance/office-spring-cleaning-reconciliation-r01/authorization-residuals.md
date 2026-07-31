# OFFICE Authorization Residuals

## F01 target surface

### `GET /lawyers/:id`

Verified current behavior:

- `JwtAuthGuard` applies at controller level;
- `tenantId` is propagated to `LawyerService.findOne`;
- credential fields `uyapToken` and `eSignatureSerial` are removed by the public
  projection and covered by focused tests;
- no endpoint-level role/capability or field-level sensitive-projection policy is
  applied.

The remaining issue is not tenant isolation or the already-fixed credential leak. It
is breadth inside the tenant: a generic authenticated user may receive lawyer
personnel/identity/bank fields without a canonical field-level access decision.

### `GET /office`

Verified current behavior:

- `JwtAuthGuard` and tenant propagation are present;
- SMTP/SMS secrets are masked;
- nested lawyer credential fields are projected out;
- no endpoint-level role/capability policy narrows the broad Office/personnel
  projection.

## Disposition

```text
RESIDUAL ID       OFFICE-SC-R01-AUTH-01
CLASS             SECURITY / AUTHORIZATION BREADTH / SENSITIVE PROJECTION
SEVERITY          P0 SUCCESSOR ORDER
CURRENT CONTROL   JWT + TENANT + SECRET/CREDENTIAL CONTAINMENT
MISSING CONTROL   OWNER-RATIFIED FIELD/ROLE/CAPABILITY POLICY + ENFORCEMENT
NEXT TASK         OFFICE-SC-F01-AUTHORIZATION-BREADTH-AND-SENSITIVE-PROJECTION-R01
STATUS            OWNER GO REQUIRED / NOT STARTED
```

This reconciliation does not choose a visibility policy and does not change either
endpoint.

# ADR-011: Audit Description Sanitization Policy

**Status:** Accepted (LOCKED)
**Date:** 2026-06-29
**Deciders:** Product / Security / Legal boundary review
**Related:** C-2D Offset Audit Detail Projection, `docs/c2d-closeout.md`, `docs/governance/product-backlog.md`

## Problem

`AuditLog` is the platform-wide factual event stream. It is used for accountability, operational review, and legal traceability.

Future features may be tempted to place user-authored free text into `AuditLog.description`, `oldValues`, `newValues`, or `metadata`, then render that text in audit UIs as a "safe summary". That creates privacy, security, and evidentiary risk:

- user text may contain PII, secrets, tokens, payment data, legal strategy, stack traces, SQL, scripts, or prompt-injection text;
- audit UI consumers may expose raw metadata or old/new values outside the intended domain context;
- later redaction of immutable audit rows can weaken evidentiary confidence;
- system facts and user statements can become indistinguishable.

This ADR defines the canonical policy for future user-authored audit description handling.

## Current State

The current codebase already contains several safe patterns:

- C-2D offset detail projection returns sanitized audit events and does not expose raw audit metadata.
- ErrorLog client ingestion uses source normalization, metadata whitelist, and PII redaction.
- Client audit diffs use mask/digest for PII and free text.
- OfficeApproval audit stores payload hashes and identifiers, not raw saved intents.
- Client payout manual reversal closure stores `closureNote` on the domain entity and writes only note presence/length to audit.

The platform also has generic audit read endpoints that can return raw `AuditLog` rows. Therefore future work must not assume all audit readers are safe by default.

## Decision

### Canonical Rule: Audit Description

```txt
AuditLog.description = SYSTEM_AUTHORED_ONLY
```

`AuditLog.description` must be a short, system-authored factual summary. It must not contain raw user-authored free text.

### Canonical Rule: User Text

```txt
User-authored text = DOMAIN ENTITY ONLY
```

User-authored notes, reasons, explanations, closure notes, evidence descriptions, or resolution comments belong to the relevant domain entity. Audit may reference them, but must not become their primary storage.

### Canonical Rule: Audit Metadata

Audit metadata may contain only:

```txt
REFERENCE
HASH
PRESENCE
LENGTH
SYSTEM FACTS
```

Examples:

- `entityId`, `requestId`, `evidenceRef`, `payloadHash`, `reasonHash`
- `closureNotePresent: true`
- `closureNoteLength: 124`
- `amount`, `currency`, `status`, `actionCode`

Raw user-authored text must not be written to `AuditLog.metadata`, `oldValues`, or `newValues`.

### Canonical Rule: Default UI

Default user interfaces must not show raw:

```txt
metadata
oldValues
newValues
```

Audit UIs must use safe projections. Raw technical inspection, if ever needed, requires a separate admin/debug surface and a separate product/security decision.

### Canonical Rule: Sanitization Model

The platform uses a hybrid model:

```txt
HYBRID

Write-time restrictions
Read-time safe projection
Presentation escaping
```

- Write time prevents raw risky user text from entering audit rows.
- Read time maps audit rows to action-specific safe summaries and masks sensitive fields.
- Presentation renders all audit text as escaped text, never as HTML or Markdown.

## Security Policy

| Content | Policy |
|---|---|
| HTML | Escape; never render as HTML in audit UI. |
| Markdown | Treat as plain text; do not render Markdown in audit UI. |
| Emoji | Allow as plain Unicode only in domain text; do not rely on it for audit semantics. |
| URL | Do not store raw user URL in audit description; mask credentials/query tokens and prefer `evidenceRef`. |
| Email | Mask. |
| Telefon | Mask. |
| TCKN | Mask or reject from audit payloads; never store raw. |
| Vergi No | Mask or reject from audit payloads; never store raw. |
| IBAN | Mask. |
| Kart | Reject full card data; never store PAN/CVV in audit. |
| JWT | Reject or mask; never store raw tokens. |
| API Key | Reject or mask; never store raw secrets. |
| Stack Trace | Do not store in `AuditLog.description`; use dedicated ErrorLog-style redacted technical channel. |
| SQL | Do not store executable/raw query text in audit description; store safe labels or hashes. |
| Script | Reject from audit description; if preserved as evidence, store as escaped domain/evidence content only. |
| XSS | Reject from audit description; presentation must still escape defensively. |
| Prompt Injection | Treat as untrusted text; do not render as instruction. Store only as escaped domain/evidence content or hash/reference. |

## Delil Modeli

```txt
System Fact != User Statement
```

Audit is evidence of a system event: who acted, when, through which system path, on which entity, and what factual state transition occurred.

User-authored text is a user statement. It can support an event, but it is not the system event itself. It must remain in the domain record or evidence store, with audit pointing to it by reference, presence, length, hash, or other safe factual metadata.

## Legal Analysis

Audit reliability depends on immutability and chain consistency. Editing, deleting, or retroactively rewriting audit rows weakens legal defensibility.

Therefore:

- audit rows must remain immutable;
- user-authored free text must not be copied into audit rows in a way that later forces destructive redaction;
- if redaction is legally required, prefer read-time masking, access restriction, or an appended redaction event over mutating the original audit row;
- evidence-facing domain records should preserve user statements under the domain's own retention, access, and evidence rules.

## Product Impact

Future audit-rich UI work must not display raw audit metadata by default. Each UI must consume a safe projection.

Future domain workflows that accept user notes must decide:

- where the user statement is stored;
- whether it is visible in list/detail views;
- whether it needs an evidence reference;
- what audit event should be emitted without copying the raw text.

## Rejected Alternatives

### Store user-authored text directly in `AuditLog.description`

Rejected because it turns audit into a raw free-text store and makes future masking legally and technically fragile.

### Rely only on frontend escaping

Rejected because escaping prevents script execution but does not solve PII, secrets, legal confidentiality, or raw metadata exposure.

### Rely only on read-time sanitization

Rejected because other consumers may query generic audit endpoints, exports, or admin surfaces. Write-time restriction remains necessary.

### Delete or edit audit rows when sensitive text appears

Rejected because destructive audit mutation weakens evidentiary integrity. Prefer append-only correction/redaction signals or safe projection.

## Future Migration Impact

This ADR does not require a schema or migration. If future work introduces a dedicated evidence or redaction model, it must be approved separately.

Existing audit rows are not rewritten by this ADR.

## Out of Scope

This ADR does not change:

- Prisma schema
- migrations
- `AuditLog` model shape
- runtime behavior
- authorization
- ledger/accounting
- statements
- offsets
- payouts
- existing audit write behavior

## Implementation Guidance

The first implementation phase should be narrow:

```txt
C2D-PD-1B — Audit Safe Projection Helper + Tests
```

Scope:

- central safe-summary helper for audit projections;
- tests proving user-authored free text is not treated as safe audit summary;
- no schema change;
- no migration;
- no financial/runtime behavior change.

## Open Questions

- Should generic `/audit/logs` be replaced or wrapped by a safe projection endpoint for non-admin surfaces?
- Which admin/debug role, if any, may inspect raw `metadata`, `oldValues`, and `newValues`?
- Should sensitive legacy audit rows be inventoried for future read-time masking?

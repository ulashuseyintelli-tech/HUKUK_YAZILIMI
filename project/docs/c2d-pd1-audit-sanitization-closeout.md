# C2D-PD-1 Closeout — Audit Description Sanitization Program

**Epic Status:** CLOSED.

**Work level:** Faster / low.

**Base:** `origin/main@09537fa97f50becbe87bfb9d00e177dadbe892fa`.

## Purpose

C2D-PD-1 closed the product/security/legal backlog item created during C-2D: future user-authored audit text must not leak into default audit UIs or be treated as a safe system fact.

This closeout records the completed chain from architecture decision to implementation and UI migration:

```txt
ADR-011
→ Audit Safe Projection Helper
→ Generic Audit Endpoint safeProjection
→ Settings Audit UI migration
→ Haciz action-specific safe projection + UI migration
```

The program changed audit read/presentation safety only. It did not change financial behavior, accounting behavior, audit write behavior, authorization, schema, or migrations.

## Completed Phases

| Phase | Status | PR | Squash commit | Scope |
|---|---|---:|---|---|
| C2D-PD-1A | MERGED | #651 | `caef767d1b7114ee944368d75346232c2d21c579` | ADR-011 audit description sanitization policy |
| C2D-PD-1B | MERGED | #652 | `bb38a236849dc5a2fbd6df9219c9ce54e0da3dd6` | Central audit safe projection helper + tests |
| C2D-PD-1C | MERGED | #655 | `d29cc94597265c86e5353267c0c884c40d998516` | Additive `safeProjection` on generic audit read endpoints |
| C2D-PD-1D | MERGED | #657 | `43e097253f6090d6c0bae7133eba8d4604aea684` | Settings Audit UI safeProjection-first migration |
| C2D-PD-1E-1 | MERGED | #663 | `a8d7468aacdc72289a261185bd53e695a96f1613` | Haciz action-specific safe read projection + UI migration |

## Final Architecture State

### ADR-011

`docs/adr/ADR-011-AUDIT-DESCRIPTION-SANITIZATION.md` is the locked architecture decision for audit text safety.

Canonical rules now recorded:

- `AuditLog.description` is system-authored only.
- User-authored text belongs to domain entities, not raw audit rows.
- Audit metadata may carry reference/hash/presence/length/system facts.
- Default UIs must use safe projection and must not show raw `metadata`, `oldValues`, or `newValues`.
- Sanitization model is hybrid: write-time restrictions, read-time safe projection, and presentation escaping.

### Helper

The audit safe projection helper centralizes safe audit presentation rules and tests the default masking/summary behavior.

### Generic Audit Reads

Generic audit read endpoints expose additive `safeProjection` while keeping backward-compatible raw fields for existing consumers:

- `GET /audit/logs`
- `GET /audit/entity-history`
- `GET /audit/user-activity`

This phase did not remove raw fields from the backend contract. It created a safe migration path for UIs.

### Settings Audit UI

Settings Audit UI is now safeProjection-first:

- raw metadata JSON is not shown by default;
- raw `oldValues`/`newValues` JSON is not shown by default;
- missing safeProjection falls back to safe system facts rather than raw JSON.

### Haciz History UI

Haciz audit history no longer consumes raw `metadata.debtors[].name` or raw `cpeWarnings`.

Haciz uses action-specific safe projection because generic safeProjection intentionally does not whitelist Haciz-specific raw metadata. Debtor display uses tenant-scoped current domain labels and safe fallbacks such as `Borçlu #N`.

## Explicitly Excluded Scope

C2D-PD-1 did not change:

- Prisma schema
- migrations
- audit write behavior
- UYAP Haciz mutation behavior
- authorization or `ActionCode` model
- ledger/accounting logic
- statement generation
- payout behavior
- offset apply/reverse behavior
- financial calculations
- raw audit admin/debug viewer policy

## Validation Summary

Merged PRs all passed CI before merge.

Additional focused validation across the chain included:

- safe projection helper tests;
- audit service safe projection tests;
- Settings Audit UI focused frontend tests;
- Haciz history focused backend/frontend tests;
- web typecheck for UI migrations;
- CI Test Suite / Architectural Guardrails / Web Tests on merged PRs.

The C2D-PD-1E-1 CI fix exported `HacizAuditSafeProjection` so public controller declaration generation remains nameable.

## Product Backlog Review

### Completed / Closed

- `C2D-PD-1A` — ADR-011 policy: DONE.
- `C2D-PD-1B` — Audit Safe Projection Helper: DONE.
- `C2D-PD-1C` — Generic audit endpoint safeProjection wiring: DONE.
- `C2D-PD-1D` — Settings Audit UI safeProjection migration: DONE.
- `C2D-PD-1E` / `C2D-PD-1E-1` — Haciz action-specific safe projection + UI migration: DONE.

### Remaining C-2D Polish / Deferred Items

The following items remain intentionally outside C2D-PD-1 and should stay backlog/deferred until separately prioritized:

- `C2D-POLISH-1` — Offset detail row button copy toggle.
- `C2D-POLISH-2` — Seeded live browser screenshot smoke for offset detail drawer.
- `C2D-DEFER-1` — Offset audit timeline pagination/grouping.
- `C2D-DEFER-2` — Richer offset source label rules.

These are UX/QA/read-model polish items. None is required for ADR-011 compliance.

## Temporary Notes / TODO Review

No C2D-PD-1 temporary implementation TODO was identified as requiring removal in this closeout.

The remaining known hygiene item from prior work remains non-blocking and unrelated to repository state:

```txt
C:\Users\ulas.htelli\Desktop\HUKUK_PROJE\HUKUK_c2d_pd1d_settings_audit_safe_ui
```

It is an orphan physical folder previously blocked by Windows file lock. It is not part of git worktree metadata and should not block this closeout.

## Closeout Decision

C2D-PD-1 is closed.

Audit presentation now has a canonical policy, reusable helper, generic safe read surface, and migrated Settings/Haciz UI consumers.

No further C2D-PD-1 implementation is recommended before a new product decision or separately prioritized backlog item.

## NEXT RECOMMENDED STEP

Active Phase: C2D-PD-1 closed.

Recommended next work: Resume the highest-value active roadmap item: `ACCT-1 — Accounting Journal Engine (PHASE 1)` with GO-ANALYZE/design-gate-first.

Why: C2D-PD-1 closed the audit safety boundary. The active roadmap now points to Accounting Domain Completion, and ACCT-1 is the highest-value / lowest-next-dependency item because it is already READY and unlocks Trial Balance, Statements, Offset/Payout journal integration, and reporting.

Backlog Review Required: YES.

READY candidates: `ACCT-1` remains READY; it still requires explicit GO-ANALYZE/design-gate before implementation.

New Product Backlog items: none.

Pending architecture decisions: none for C2D-PD-1.

## ÖNERİLEN ÇALIŞMA SEVİYESİ

Ultra/code for ACCT-1 GO-ANALYZE.

Reason: accounting journal design touches financial source-of-truth direction, multitenant data integrity, migration-applied schema, posting idempotency, and reconciliation boundaries.
# CI Gate: Carrier Write-Drift Guard — Design

**Status:** ✅ DONE
**Created:** 2026-02-06
**Depends On:** Phase 11 Wave A (DONE)

---

## Purpose

Enforce the Phase 11 carrier write-once contract at CI level.
Carrier columns (`carrier_json`, `carrier_version`, `carrier_truncated`) are immutable after initial upsert INSERT.
This CI gate prevents accidental UPDATE SET or raw SQL mutations outside the canonical upsert path.

## Implementation

Single step added to the existing `architectural-guardrails` job in `.github/workflows/ci.yml`.

### Gate Rules

| # | Pattern | Action |
|---|---------|--------|
| 1 | `UPDATE.*SET` + `carrier_(json\|version\|truncated)` outside `EXCLUDED.` | FAIL |
| 2 | `executeRaw` / `executeRawUnsafe` / `queryRawUnsafe` + `carrier_(json\|version\|truncated)` | FAIL |

### Allowlist

| Pattern | Reason |
|---------|--------|
| `EXCLUDED.carrier_*` | Upsert ON CONFLICT path (canonical write) |
| `__tests__/` directory | Test fixtures |
| `*.spec.ts` / `*.test.ts` | Test files |
| `*.sql` migrations | Schema DDL (not scanned — .ts only) |

### Trigger

Same as existing CI: push to `main`/`develop` + PR to `main`, filtered by `apps/api/src/**` and `packages/**`.

## References

- [Phase 11 DONE](./../phase-11-carrier-resilience/PHASE-11-DONE.md)
- [CI Pipeline](../../../.github/workflows/ci.yml)

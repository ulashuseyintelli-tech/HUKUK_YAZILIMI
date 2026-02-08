## CI: Lock carrier_* columns to upsert-only (Phase 11)

### What

Adds a CI guardrail step (`carrier-write-drift-gate`) to the existing `architectural-guardrails` job. This enforces the Phase 11 carrier write-once contract at pipeline level.

### Why

Carrier columns (`carrier_json`, `carrier_version`, `carrier_truncated`) on `manifest_dead_letter_queue` are write-once by design: only the canonical `upsert()` INSERT + ON CONFLICT UPDATE path may set them. Without CI enforcement, any future PR could accidentally add an UPDATE SET or raw SQL mutation that breaks the contract silently.

### What it checks

| Gate | Pattern | Expected |
|------|---------|----------|
| #1 | `UPDATE SET carrier_*` outside `EXCLUDED.` | 0 matches |
| #2 | `executeRaw` / `queryRawUnsafe` + `carrier_*` | 0 matches |

Test files and `__tests__/` directories are excluded (fixtures are allowed).

### Files changed

- `.github/workflows/ci.yml` — new step in `architectural-guardrails` job
- `.kiro/specs/phase-11-carrier-resilience/design.md` — Phase 11 design updates
- `.kiro/specs/phase-11-carrier-resilience/PHASE-11-DONE.md` — sign-off document
- `.kiro/specs/ci-carrier-write-drift-gate/design.md` — gate design spec

### Risk

Zero runtime risk. This is a CI-only change (grep-based static analysis). No application code is modified in this PR.

### Merge strategy

Squash merge recommended — single guardrail change, single commit.

### What's next

Once merged, Wave B (11.3 Redrive Depth Limit, 11.4 Carrier Compression) can begin safely under this gate.

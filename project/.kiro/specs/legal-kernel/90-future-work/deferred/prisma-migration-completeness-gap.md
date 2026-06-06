---
status: deferred
priority: high
owner: ulas
review-trigger: "CI integration gate (fix/ci-pr-gates / PR #3) bunun çözülmesini bekliyor — önkoşul"
depends-on: "—"
discovered: "CI integration gate (madde 1) Prisma migrate deploy adımı temiz DB'de patlayınca (2026-06-05)"
---

# Prisma migration completeness gap

## Problem (canonical)

> The Prisma migration history does not reproduce the schema on a clean database.
> ~80-90 models in schema.prisma (including ALL 27 Icrabot* tables, plus BankAccount,
> ClaimItem, CaseBalance, CaseInstrument, InterestRate, EvidenceBundle, ...) have NO
> CREATE TABLE migration — they were created on dev via `prisma db push`.
> `prisma migrate deploy` on a fresh database creates only ~61 of 151 tables, then the
> `20260520100000_phase2_sprint1_ordering_immutability` migration fails with
> "relation IcrabotTimelineEntry does not exist" (ALTER on a table that no migration created).

## Evidence

- `grep CREATE TABLE` across `prisma/migrations`: **61 unique tables**. schema.prisma: **151 models**.
- No migration contains `CREATE TABLE "Icrabot*"` (27 models). `IcrabotTimelineEntry` appears only in
  ALTER statements (Sprint 1 + Faz 1 tenantId).
- CI run (fix/ci-pr-gates, push `6d7dd54` / PR #3): `Test Suite` → `Prisma migrate deploy` →
  `current transaction is aborted` at `20260520100000_phase2_sprint1_ordering_immutability`.

## Why it matters

- **CI integration gate blocked:** legal-kernel integration tests need a real Postgres built from
  migrations; `migrate deploy` can't build it. (Direct prerequisite for fix/ci-pr-gates.)
- **Disaster recovery / new environment broken:** a fresh DB cannot be created from the migration
  chain. Dev (and likely prod) were built via `db push`, masking this.
- Migration history is not a trustworthy source of truth ("the migration chain lies").

## Decision (2026-06-05)

- **A — proper baseline.** Make the migration chain clean-DB-deployable. (Rejected: B `db push` hack
  in CI — green but chain still lies; C defer — this is the prerequisite, must be solved now.)
- Tracked work branch: `fix/prisma-migration-baseline`. Diff-first plan before any migration code.

## Red lines

- No `db push` hack in CI.
- Do not abandon `migrate deploy`.
- Target: a migration chain deployable from a clean DB.

## Decision owner

ulas

## Next review

CI integration gate (PR #3) açık-kırmızı bekliyor; bu kapanınca yeşillenir.

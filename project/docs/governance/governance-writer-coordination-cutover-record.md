# Governance Writer Coordination V1 — Cutover Record

```text
Cutover ID             : GOV-COORD-V1-CUTOVER-2026-07-24
Observed live main     : c046819b968d16f20cf2834ba805beb22e4aa488
Open PR count          : 0
Primary executor       : CODEX_LOCAL
Secondary executor     : DISABLED
Disposition authority  : NONE
Removal authority      : NONE
Reconciliation         : NONE
```

Bu immutable bootstrap record, `effectiveFromMainSha` öncesi mevcut owner WIP
sinyallerini grandfather eder. Kayıt hiçbir WIP için abandonment, staleness,
mergeability, cleanup veya semantic disposition kararı vermez.

## G-WIP-01

```text
Path       : C:\Development\HUKUK_YAZILIMI\HUKUK_rcv_col_tpa_04c_closure_final
Branch     : codex/rcv-col-tpa-04c-closure-final
HEAD       : 4c5ed903882be359a161e9487ea749f2dc141035
Remote gap : five commits behind observed live main
Open PR    : NONE FOUND
State      : OWNER_DECISION_REQUIRED
```

Protected overlap:

- `project/docs/adr/ADR-014-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`
- `project/docs/governance/COLLECTION-GOVERNANCE.md`
- `project/docs/governance/COLLECTION-RISK-REGISTER.md`
- `project/docs/governance/RECEIVABLE-GOVERNANCE.md`
- `project/docs/governance/SYSTEM-CONSTITUTION.md`
- `project/docs/governance/canonicalization-register.md`
- `project/docs/governance/decision-log.md`
- `project/docs/governance/master-triage-register.md`
- `project/docs/governance/product-backlog.md`

`RECEIVABLE-GOVERNANCE.md`, `canonicalization-register.md`,
`decision-log.md` ve `product-backlog.md` newer main changes ile overlap eder.
WIP içindeki owner-language canonical main'de doğrulanmamıştır.

Requirement: byte-for-byte preserve; no disposition, merge, rebase,
reconciliation, cleanup veya removal authority.

## O-WIP-01

```text
Path   : C:\Development\HUKUK_YAZILIMI\project
Branch : main
State  : OWNER_DECISION_REQUIRED
```

Untracked owner/control-plane signals:

- `.claude/launch.json`
- `.codex/hooks.json`
- `.codex/hooks/notify-stop.ps1`
- `.worktrees/`

Requirement: byte-for-byte preserve; bootstrap bu yüzeyleri kullanamaz veya
değiştiremez.

## SNAP-01

```text
Path       : C:\Development\HUKUK_YAZILIMI\project\.worktrees\adr014-pr1b-reversal-netting
Git marker : ABSENT
Branch/HEAD: UNATTRIBUTABLE
State      : OWNER_DECISION_REQUIRED
```

Source signal: directory name ADR-014/reversal gösterir; `pr_body.md` farklı bir
carrier CI işi anlatır. Yirmi untracked ADR/governance kopyası taşır; on biri
observed local main'den farklıdır. Ancestry uygulanamaz.

Requirement: byte-for-byte preserve; no disposition/removal/reconciliation.

## SNAP-02

```text
Path       : C:\Development\HUKUK_YAZILIMI\project\.worktrees\adr014-w03-ratification-hardening
Git marker : ABSENT
Branch/HEAD: UNATTRIBUTABLE
State      : OWNER_DECISION_REQUIRED
```

Yirmi untracked ADR/governance kopyası taşır; on biri observed local main'den
farklıdır. SNAP-01 ile beş shared register dosyasında da farklıdır. Ancestry
uygulanamaz.

Requirement: byte-for-byte preserve; no disposition/removal/reconciliation.

## BR-WIP-01

```text
Path       : C:\Development\HUKUK_YAZILIMI\HUKUK_ccb-001-r
Branch     : codex/ccb-001-pr1-pr6-rescue
HEAD       : 961bbaf38d3ab1a7c7a691fbd56880ca3f6ffcc8
Open PR    : NONE FOUND
Divergence : branch-only 7 / local-main-only 631 at observation
State      : OWNER_DECISION_REQUIRED
```

Protected branch-local delta:

- `.claude/settings.json`
- `CLAUDE.md`
- `project/docs/adr/ADR-012-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`
- `project/docs/governance/architecture-index.md`
- `project/docs/governance/decision-log.md`
- `project/docs/governance/product-backlog.md`

Canonical main, direct merge'i NO-GO ve branch'i rescue/evidence source olarak
kaydeder. Bu cutover record içeriği otomatik supersede veya removable ilan
etmez.

Requirement: byte-for-byte preserve; any extraction requires owner-authorized
request conversion.

## BR-WIP-02

```text
Path       : C:\Development\HUKUK_YAZILIMI\HUKUK_ver05_inventory_maintenance
Branch     : codex/ver05-inventory-maintenance
HEAD       : 8bec6c2395d924c9e5a306a87e2804f8b7c8661f
Open PR    : NONE FOUND
Divergence : branch-only 1 / local-main-only 522 at observation
State      : OWNER_DECISION_REQUIRED
```

Protected delta yalnız
`project/docs/governance/maintenance-register.md` içindeki MR-023 orphan
worktree kaydıdır.

Requirement: byte-for-byte preserve; current fact revalidation ve owner
request-conversion kararı olmadan merge/cleanup yoktur.

## Universal grandfather rule

Her kayıt için:

```text
No disposition authority
No removal authority
No reconciliation authority
No cleanup authority
Byte-for-byte preservation required
```

Hiçbir kayıt abandoned, removable, safe-to-delete, mergeable veya conclusively
stale sayılmaz.

## 2026-07-29 source-attribution reconciliation

Owner-authorized
`OWNER-WIP-MULTI-SOURCE-DISPOSITION-AND-PATH-OWNERSHIP-R01` forensic
reconciliation replaced the anonymous exact-path reservation with
source-specific ownership. No source content was deleted, reset, unlocked,
cleaned, overwritten or merged.

```text
Evidence archive : OWNER_WIP_EVIDENCE/OWNER-WIP-MULTI-SOURCE-DISPOSITION-AND-PATH-OWNERSHIP-R01/20260729T063432Z
Manifest         : sha256-manifest.txt
Manifest SHA-256 : 777108ef35abb88eb7d4277561e7033b28b6c4b2fa82312cee3a4407409d982b
Captured files   : 114
Canonical base   : 09711b503b9de34b65fc520595a7ac87955ecab5
```

Source dispositions:

- `G-WIP-01`: `CLOSED / OWN SOURCE ABSENT / STALE`. The physical source and
  branch refs are absent; its historical head is already in canonical ancestry.
  Only this source's protection is inactive.
- `SNAP-01` and `SNAP-02`: `ARCHIVED / NON-ACTIVE / PRESERVED`. They are
  filesystem snapshots without a Git/task identity; their overlapping
  governance blobs are older canonical copies superseded by current main.
- `BR-WIP-01`: `MIXED / PRESERVED`. The ADR-012/CCB governance model is
  superseded by canonical ADR-014 and cross-domain LegalApplication authority;
  `.claude/settings.json` and `CLAUDE.md` remain active owner WIP. The branch and
  worktree remain untouched.
- `HUKUK_ent_approval`: `PRESERVED / CLASSIFIED BASELINE`. HEAD, index,
  working-copy, lock metadata and raw bytes were captured separately. The six
  reviewed target paths are either byte-identical to current main or older
  baseline copies superseded by current main; none carries unique owner intent.
  The locked worktree remains untouched and was not repaired.
- `O-WIP-01` and `BR-WIP-02`: active source-specific protection remains.

The effective exact-path set is the deterministic union of entries whose
`activeProtection` is true:

```text
.claude/launch.json
.claude/settings.json
.codex/hooks.json
.codex/hooks/notify-stop.ps1
CLAUDE.md
project/docs/governance/maintenance-register.md
```

The universal invariant is fail-closed: any active attributed source keeps an
exact path forbidden. A path is releasable only when every attributed source is
inactive. Prefix protections for `.worktrees/`, `.claude/` and `.codex/` are
unchanged. This reconciliation does not grant cleanup authority for any physical
source.

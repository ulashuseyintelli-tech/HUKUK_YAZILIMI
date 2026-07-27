# PROGRAM-WIDE-WORK-INVENTORY-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-WORK-INVENTORY-R01.md
Program    : PROGRAM-WIDE SPRING CLEANING
Task       : PROGRAM-WIDE-SPRING-CLEANING-FULL-AUTHORIZED-EXECUTION-R01
Owner auth : FULL OWNER AUTHORIZATION (GO-COMPLETE — ANALYZE-FIRST + CONDITIONAL IMPLEMENTATION)
Durum      : EVIDENCE INVENTORY / NON-NORMATIVE
Rol        : Program genelinde bulunan her artefaktın deterministik sınıflandırmasını taşır.
             Semantic veya execution authority ÜRETMEZ.
Baseline   : canonical main `bfcea811` (envanter anı) → `0b555155` (PR #1668 merge sonrası)
Tarih      : 2026-07-27
```

## RELATED DOCUMENTS

- `PROGRAM-WIDE-UNFINISHED-WORK-REGISTER-R01.md`
- `PROGRAM-WIDE-INTENTIONALLY-NOT-DONE-REGISTER-R01.md`
- `PROGRAM-WIDE-STALE-ORPHAN-CLEANUP-REGISTER-R01.md`
- `PROGRAM-WIDE-MERGED-BUT-UNCLOSED-REGISTER-R01.md`
- `PROGRAM-WIDE-GHOST-REFERENCE-REGISTER-R01.md`
- `PROGRAM-WIDE-OWNER-DECISION-PACK-R01.md`
- `PROGRAM-WIDE-SPRING-CLEANING-CLOSURE-R01.md`

## 1. Taranan yüzeyler

```text
git local branches          56  (envanter anı)
git remote branches        155  (origin/main hariç)
git worktree registry       19  (canonical root dahil)
git stash                    0
GitHub open PR               0  (envanter anı) → 1 (#1668, oturum sırasında açıldı ve merge edildi)
GitHub closed-unmerged PR    5  (son 200 kapalı PR içinde)
GitHub merged PR          ~1660
fiziksel HUKUK_* dizini    148
project/.claude/worktrees/   8
project/.worktrees/          6
governance belge korpusu   ~50 dosya + 4 alt dizin
```

## 2. Sınıflandırma özeti

Her artefakt **tam olarak bir** sınıfa atanmıştır. Genel "not done" etiketi kullanılmamıştır.

| # | Sınıf | Adet | Kanıt yeri |
|---|---|---|---|
| 01 | `INTENTIONALLY_NOT_IMPLEMENTED` | 17 | INTENTIONALLY-NOT-DONE §1 (8 program gate) + §4 ARC-01..08 (8) + §3 ADR-014 cutover (1) |
| 02 | `OWNER_GATED_NOT_STARTED` | 42 | INTENTIONALLY-NOT-DONE §1 (4) + §4 `OWN-03..30` (28) + §4 `BLK-01..10` (10) |
| 03 | `AUTHORIZED_NOT_STARTED` | 0 | Yetkisi olup başlanmamış iş bulunmadı |
| 04 | `STARTED_LOCAL_WIP` | 5 | UNFINISHED-WORK §1 (U-01..U-05) |
| 05 | `LOCAL_UNPUSHED_COMMIT` | 1 branch / 5 commit | UNFINISHED-WORK §2 (`codex/ccb-001-pr1-pr6-rescue`) |
| 06 | `REMOTE_BRANCH_NO_PR` | 2 | `codex/ccb-001-pr1-pr6-rescue`, `codex/ver05-inventory-maintenance` |
| 07 | `OPEN_PR_ACTIVE` | 1 | #1668 — oturum sırasında açıldı, `KEEP_ACTIVE`, owner tarafından MERGED |
| 08 | `OPEN_PR_STALE` | 0 | Envanter anında hiç açık PR yoktu |
| 09 | `CLOSED_UNMERGED_VALID_EVIDENCE` | 4 | #406, #1473, #1662, #1664 |
| 10 | `CLOSED_UNMERGED_ABANDONED` | 0 | 7 kapalı PR'ın hepsinde gerekçe kayıtlı |
| 11 | `MERGED_CANONICAL` | 178 branch | 33 local + 145 remote (merged PR eşleşmeli) |
| 12 | `MERGED_BUT_GOVERNANCE_UNCLOSED` | 3 | MERGED-BUT-UNCLOSED §1-§2 |
| 13 | `SUPERSEDED` | 3 | #1147, #1655, master-triage §F |
| 14 | `DUPLICATE` | 2 | #1478, `claude/musing-burnell-55db1a` |
| 15 | `PARTIALLY_IMPLEMENTED` | 0 | — |
| 16 | `IMPLEMENTED_NOT_ACTIVATED` | 1 | UYAP F4-b orchestrator — flag-gated OFF (#1566), mevcut kayıtla tutarlı |
| 17 | `PLAN_ONLY_NO_IMPLEMENTATION` | 9 | UYAP I03..I07 (5) + ADR-014 PR-11..14 (4) |
| 18 | `AUTHORITY_ONLY_NO_PLAN` | 0 | — |
| 19 | `GRANT_WITHOUT_EXECUTION` | 0 | T5 R02 grant'ları #1666 ile execute edildi |
| 20 | `EXECUTION_WITHOUT_CLOSURE` | 0 (ayrı) | Bu küme sınıf 12 içinde sayılmıştır; çift sayım yapılmadı |
| 21 | `MISSING_ARTEFACT_REFERENCE` | 0 | GHOST-REFERENCE — 8 aday incelendi, 0 gerçek |
| 22 | `ORPHANED_WORKTREE_DIR` | 149 | STALE-ORPHAN-CLEANUP §4 (141 `HUKUK_*` + 8 `.claude/worktrees/`) |
| 23 | `STALE_BRANCH_SAFE_TO_DELETE` | 195 | 47 local + 148 remote — **UYGULANDI** |
| 24 | `OWNER_WIP_REQUIRES_DECISION` | 6 | U-01..U-05 + `codex/ccb-001-pr1-pr6-rescue` |
| 25 | `GENUINE_REMAINING_WORK` | 1 | ver05 orphan izleme satırı — **RECOVER_ON_FRESH_MAIN ile kapatıldı** |
| 26 | `UNKNOWN_REQUIRES_MANUAL_REVIEW` | 0 | — |

Sınıf 01/02/17 sayıları **artefakt** bazındadır (program gate + register satırı); sınıf 11/23
**branch** bazındadır. Bir artefakt birden fazla sınıfa atanmamıştır.

## 3. Branch envanteri — karar tabanı

Her branch için üç bağımsız ölçüm yapıldı; sınıflandırma tek bir ölçüme dayandırılmadı:

```text
(a) ahead/behind          : git rev-list --left-right --count origin/main...<branch>
(b) residual delta        : git diff --name-only origin/main <branch> -- <merge-base'den beri değişen dosyalar>
(c) PR state              : gh pr list --state all  (headRefName eşlemesi)
```

**Kritik yöntem notu — squash merge:** Bu repoda merge stratejisi squash'tır; bu nedenle
`git ancestry` merge kanıtı olarak KULLANILMAMIŞTIR (`AGENTS.md` §8 ile uyumlu). Bir branch'in
`ahead ≥ 1` olması unmerged olduğunu göstermez. Karar (c)'ye, (b) ile çapraz doğrulanarak verildi.

**Kanıt koruma doğrulaması:** Silme öncesinde GitHub'ın `refs/pull/<N>/head` ref'lerinin
branch tepesini kalıcı olarak koruduğu pozitif doğrulandı:

```text
git ls-remote origin refs/pull/1474/head → 9c5409df…  == origin/claude/agitated-wozniak-f180e4
git ls-remote origin refs/pull/1159/head → 8e73578c…
git ls-remote origin refs/pull/406/head  → 53fb852a…
git ls-remote origin refs/pull/1147/head → e2d5007f…
```

Bu nedenle merged/closed PR'a bağlı branch silme işlemi **geri alınabilir** ve kanıt kaybı üretmez.

## 4. Worktree envanteri — üç topoloji

Worktree kaldırma öncesi zorunlu `node_modules` junction denetimi yapıldı. Üç ayrı topoloji bulundu:

| Topoloji | Tanım | Adet | Kaldırma sonucu |
|---|---|---|---|
| **A — CANONICAL JUNCTION HAZARD** | Top-level `node_modules` junction'ı **canonical repo'ya** işaret ediyor | 2 | **KALDIRILMADI** — bkz. STALE-ORPHAN-CLEANUP-REGISTER §3 (P0) |
| **B — pnpm self-contained** | Junction'lar worktree'nin kendi `.pnpm` store'una işaret ediyor; 77k-81k dosya | 5 | Unregister edildi; fiziksel silme `Filename too long` ile başarısız → orphan dizin |
| **C — node_modules yok** | 0 `node_modules`, ~5.8k dosya | 3 | Tam silindi |

## 5. Concurrent writer tespiti

Program yürürken bağımsız bir oturum tespit edildi ve **dokunulmadı**:

```text
branch   : claude/opa-wp00-truth-inventory
worktree : C:\Development\HUKUK_YAZILIMI\HY_wp00
PR       : #1668 (2026-07-27T17:48:43Z açıldı)
dosya    : project/docs/governance/coordination-v2/activation/WP00-TRUTH-INVENTORY.md
disposition: KEEP_ACTIVE → sonrasında owner tarafından MERGED (squash `0b555155`)
çakışma  : YOK — exact dosya kapsamı bu programın yazdığı hiçbir yolla kesişmiyor
```

## 6. Uygulanmayan işlemler (bilinçli)

```text
NO reset --hard              — uygulanmadı
NO git clean                 — uygulanmadı
NO rm -rf / rd /s /q         — uygulanmadı (runbook worktree-cleanup.md §2.3)
NO owner WIP silme           — 7 owner WIP artefaktı korundu
NO stale branch direkt merge — hiçbir stale branch merge edilmedi
NO auto-merge                — OFF
NO schema/migration          — bu program schema veya migration ÜRETMEDİ
NO production activation     — yok
```

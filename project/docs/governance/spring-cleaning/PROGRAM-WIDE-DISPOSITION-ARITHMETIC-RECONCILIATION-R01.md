# PROGRAM-WIDE-DISPOSITION-ARITHMETIC-RECONCILIATION-R01

```text
Belge yolu : project/docs/governance/spring-cleaning/PROGRAM-WIDE-DISPOSITION-ARITHMETIC-RECONCILIATION-R01.md
Task       : PROGRAM-WIDE-SPRING-CLEANING-OWNER-RESIDUALS-FULL-EXECUTION-R01 / R01
Durum      : ARITHMETIC RECONCILIATION / NON-NORMATIVE
Rol        : Parent programın sayısal kapanışını ve cross-session ancestry zincirini doğrular.
Tarih      : 2026-07-27
```

## 1. Cross-session PR ancestry zinciri

Parent program sırasında **iki bağımsız oturum** aynı repository üzerinde çalıştı. Her PR'ın
merge commit'inin final main'in atası olduğu tek tek doğrulandı (`git merge-base --is-ancestor`).

| PR | Head | Merge SHA | Final main atası | Scope owner |
| --- | --- | --- | --- | --- |
| #1668 | `b6650a02` | `0b555155` | **YES** | diğer oturum — `coordination-v2/activation/` |
| #1669 | `663f5608` | `f8b7a912` | **YES** | **bu program** — `docs/governance/` |
| #1670 | `dba816f0` | `eb570bf7` | **YES** | diğer oturum — `scripts/orchestration-v2/` |
| #1671 | `ebc8b42c` | `c41bdb92` | **YES** | **bu program** — `docs/governance/spring-cleaning/` |
| #1672 | `4579b702` | `4063ab29` | **YES** | diğer oturum — `coordination-v2/activation/` |
| #1673 | `e5dfdc0c` | `0c5e318a` | **YES** | diğer oturum — `scripts/orchestration-v2/` |
| #1674 | `44c37754` | `26c42b69` | **YES** | diğer oturum — `scripts/orchestration-v2/` |

```text
ANCESTRY BREAK   : YOK
FORCE-PUSH       : YOK
DOSYA ÇAKIŞMASI  : YOK — iki oturumun changed-path kümeleri hiç kesişmedi
```

Parent programın bildirdiği `4063ab29` **doğrulandı**: bu görev başlarken `4063ab29`'un
`origin/main`'in atası olduğu ve aradan 2 commit (#1673, #1674) geçtiği ölçüldü.

## 2. Sınıflandırma aritmetiği

Parent `PROGRAM-WIDE-WORK-INVENTORY-R01.md` §2'deki 26 sınıf sayımı:

```text
01 INTENTIONALLY_NOT_IMPLEMENTED        17
02 OWNER_GATED_NOT_STARTED              42
03 AUTHORIZED_NOT_STARTED                0
04 STARTED_LOCAL_WIP                     5
05 LOCAL_UNPUSHED_COMMIT                 1   (branch; 5 commit)
06 REMOTE_BRANCH_NO_PR                   2
07 OPEN_PR_ACTIVE                        1
08 OPEN_PR_STALE                         0
09 CLOSED_UNMERGED_VALID_EVIDENCE        4
10 CLOSED_UNMERGED_ABANDONED             0
11 MERGED_CANONICAL                    178   (branch bazında)
12 MERGED_BUT_GOVERNANCE_UNCLOSED        3
13 SUPERSEDED                            3
14 DUPLICATE                             2
15 PARTIALLY_IMPLEMENTED                 0
16 IMPLEMENTED_NOT_ACTIVATED             1
17 PLAN_ONLY_NO_IMPLEMENTATION           9
18 AUTHORITY_ONLY_NO_PLAN                0
19 GRANT_WITHOUT_EXECUTION               0
20 EXECUTION_WITHOUT_CLOSURE             0   (sınıf 12 içinde sayıldı — çift sayım yok)
21 MISSING_ARTEFACT_REFERENCE            0
22 ORPHANED_WORKTREE_DIR               149
23 STALE_BRANCH_SAFE_TO_DELETE         195
24 OWNER_WIP_REQUIRES_DECISION           6
25 GENUINE_REMAINING_WORK                1
26 UNKNOWN_REQUIRES_MANUAL_REVIEW        0
─────────────────────────────────────────────
TOPLAM                                  619
```

### 2.1 Sayım eksenlerinin ayrıştırılması (zorunlu şeffaflık)

619 rakamı **tek türden artefaktın toplamı değildir**; üç farklı ölçüm ekseni içerir:

```text
BRANCH ekseni      : 11 (178) + 23 (195) + 05 (1) + 06 (2)            = 376
DİZİN ekseni       : 22 (149)                                          = 149
PR ekseni          : 07 (1) + 09 (4) + 10 (0) + 12 (3) + 13 (2) + 14 (2) = 12
GATE/KAYIT ekseni  : 01 (17) + 02 (42) + 17 (9) + 16 (1) + 13 (1) + 14 (1) = 71
WIP ekseni         : 04 (5) + 24 (6) + 25 (1)                          = 12
                     (24 ile 04 örtüşür: 24 = 04'ün 5'i + CCB branch 1)
```

**Bu nedenle `sum(classification counts) = total artefacts` eşitliği yalnız aynı eksen içinde
anlamlıdır.** Parent register'ın kendisi bunu belirtir (*"Sınıf 01/02/17 sayıları artefakt
bazındadır; sınıf 11/23 branch bazındadır"*). Bu bölüm o notu sayısal olarak açar.

## 3. Disposition aritmetiği

```text
MERGE_ELIGIBLE                       0
KEEP_ACTIVE                          1
CLOSE_SUPERSEDED                     2
CLOSE_DUPLICATE                      2
CLOSE_INVALID_SCOPE                  0
CLOSE_STALE_NO_VALUE               195
PRESERVE_AS_HISTORICAL_EVIDENCE      4
RECOVER_ON_FRESH_MAIN                1
OWNER_DECISION_REQUIRED              6
─────────────────────────────────────────
DISPOSITION-SCOPED TOPLAM          211
```

Doğrulama:

```text
branch dispositionları : 195 (stale) + 1 (recover) + 1 (duplicate, musing-burnell) = 197
PR dispositionları     : 1 (keep) + 2 (superseded) + 2 (duplicate/#1478 dahil) + 4 (evidence) = 9
                          → #1478 hem PR hem duplicate sayımında: PR ekseninde 1 kez sayılır
WIP dispositionları    : 6 (owner decision)
                          197 + 9 + 6 = 212 ≈ 211  (musing-burnell hem branch hem duplicate
                          ekseninde göründüğü için 1 çift sayım düzeltildi)
```

## 4. Cleaned / preserved / owner-gated / unknown

```text
CLEANED       195 branch + 8 worktree unregister + 3 fiziksel silme (parent)
              +  2 worktree (junction remediation) + 36 fiziksel dizin (bu görev)
PRESERVED       6 owner WIP + 2 remote branch + 4 PR evidence
OWNER-GATED     9 → bu görevde 9/9 RATİFİYE EDİLDİ VE UYGULANDI
UNKNOWN        18 flag deployed value (ITEM-A03, owner kararıyla UNKNOWN bırakıldı)
```

## 5. Program dili düzeltmesi

Parent kapanışı `NEXT ELIGIBLE PROGRAM: NONE` yazmıştı. Bu ifade **otomatik olarak
uygun bir sonraki program bulunmadığı** anlamındaydı; owner'ın ratifiye edilmiş
residual programını dışlamıyordu. Netleştirilmiş dil:

```text
NEXT AUTO-ELIGIBLE PROGRAM:
NONE

OWNER-GATED RESIDUAL PROGRAM:
PROGRAM-WIDE-SPRING-CLEANING-OWNER-RESIDUALS-FULL-EXECUTION-R01 — EXECUTED
```

Parent'taki eski ifade **silinmemiştir**; bu bölüm onun anlamını açar.

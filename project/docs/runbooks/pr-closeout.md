# Runbook: Deterministic PR Closeout

**Status:** Active · **Owner:** Platform · **Son güncelleme:** 2026-07-30

Bu runbook, owner tarafından bir task/PR'a açıkça bağlanmış merge authority mevcutken
mekanik PR kapanışını yürüten `orch:closeout` komutunun operasyon prosedürüdür.

Normatif çekirdek `AGENTS.md`'dedir: merge authority semantiği §4, CI ve merge disiplini
§5, worktree izolasyonu §6, stop condition'lar §14. Bu runbook onları tekrar etmez;
yalnız komutun nasıl çalıştırılacağını ve çıktısının nasıl okunacağını anlatır.

## Ne yapar, ne yapmaz

```text
YAPAR   : owner authority + deterministik gate'ler PASS ise
          squash-merge → main sync → authority consumption → worktree cleanup
          → branch cleanup → canonical verification

YAPMAZ  : owner authority uretmez
          serbest metin owner mesajini yorumlamaz
          semantic karar vermez
          standing / unattended / scheduled auto-merge acmaz
          authority'yi baska task veya PR'a tasimaz
```

Belirsizlikte **fail-closed** davranır: herhangi bir gate PASS değilse hiçbir mutation
yapılmaz.

## Varsayilan yol ve fallback

`AGENTS.md` §5 uyarınca merge authority PASS olan bir kapanışta **varsayılan yol bu
runner'dır**. Manuel kapanış fallback'tir ve yalnız şu durumlarda kullanılır:

| Fallback sebebi | Örnek |
|---|---|
| Runner kullanılamıyor | komut/ortam erişilemez, modül yüklenmiyor |
| Senaryo desteklenmiyor | ledger'a bağlanamayan owner beyanı; squash dışı merge method |
| Runner exact blocker üretiyor | gate'ler PASS ama runner tarafında çözülemeyen teknik hata |

Fallback kullanıldığında **gerekçesi kapanış raporunda yazılır**. Fallback gate atlamak
için kullanılamaz: manuel kapanışta da aynı gate'ler elle doğrulanır.

### Zorunlu fallback kuralı

`CLOSEOUT-AUTHORITY-CONTRACT-IMPLEMENTATION-R01` (owner OPTION A — REFINED, 2026-07-30)
ile bağlayıcı:

> Owner authority geçerli ve uygulanabilir gate'lerin tümü PASS ise; closeout-runner exact
> blocker'ı, desteklenmeyen senaryo veya ledger materialization başarısızlığı **ikinci bir
> owner merge mesajı gerektirmez.** Ajan deterministic manuel fallback uygular, exact
> gerekçeyi kaydeder, delivery gate'lerini tamamlar ve ledger dogfood'u ayrı işaretler.

Bu, `AGENTS.md` §5'in ayrıntısıdır. Fallback **gate atlamaz**.

### Precedence

```text
1. Explicit owner task instruction
2. Task-specific IF GO-COMPLETE
3. Program lock and exact task scope
4. Risk-specific safety and delivery gates
5. Ledger materialization / deterministic closeout runner
6. Runner defaults
7. Executor inference  ← hiçbir seviyede authority DEĞİL
```

Ledger 1–4'ün üstüne çıkamaz. Ledger türetilmiş kanıttır, authority kaynağı değildir.

### Gerçek delivery blocker'ları

Aşağıdakiler merge'i durdurur:

```text
owner authority absent · owner authority ambiguous · exact scope mismatch
program lock · competing writer · semantic conflict · merge conflict
required CI failure · PR not CLEAN/MERGEABLE · unauthorized schema or migration
missing production activation authority · failed backup or rollback gate
tenant isolation failure · credential leak · destructive real-data risk
runtime verification failure
```

### Tek başına blocker OLMAYANLAR

```text
ledger absent · ledger materialization failure · runner unsupported scenario
runner exact technical blocker · workspaceModule runner mismatch · dogfood failure
```

Bu grup deterministic fallback + governance residual üretir; delivery'yi durdurmaz.

### Self-authority yasağı

> Ajan kendi current task'ı için `SEMANTIC_AUTHORITY` veya `EXECUTION_GRANT` kaydı
> **oluşturamaz, ratify edemez veya onaylayamaz.** Ajan-yazımı authority merge authority
> kaynağı olarak kullanılamaz.

Owner'ın **önceden verdiği** authority'nin mekanik kanıt kaydına dönüştürülmesi bu yasağın
kapsamında değildir — ancak yalnız şu beşi birlikte çözülebiliyorsa: owner identity,
immutable owner reference, task ID, exact PR, authorized base SHA. Bugünkü materializer
sohbetten authority türetmez (`authority-to-ledger-flow.md`); bu nedenle chat-only
authority ile live koşu yapılamaz ve fallback yolu kullanılır.

## Authority

Yalnız üç task-bound tip kabul edilir:

| Tip | Anlamı |
|---|---|
| `EX_ANTE_GO_COMPLETE` | authority task brief'inde önceden verildi |
| `IN_TASK_GO_COMPLETE` | authority aynı task içinde sonradan verildi |
| `EXPLICIT_PR_MERGE_AUTHORITY` | authority doğrudan bu PR için verildi |

`"devam"`, `"uygula"`, kapsam seçimi, tasarım onayı veya commit/push/PR izni **authority
değildir** (`AGENTS.md` §4).

### Authority ledger

**Live closeout için ledger ZORUNLUDUR.** Ledger yoksa tüketim kaydı tutulamaz, dolayısıyla
reuse koruması da yoktur; runner `MERGE_AUTHORITY_LEDGER_REQUIRED` ile fail-closed olur.
`--dry-run` ledger olmadan yapısal gate'leri değerlendirebilir; machine-readable sonuç ayrıca
`LIVE_AUTHORITY_MISSING` taşır.

Schema v2 canonical SA/EG kayıtlarından PR açıldıktan ve required CI başarılı olduktan sonra
explicit üretilir. Program/task, distinct SA/EG, repository, PR, current base SHA, head SHA,
task/base branch, `git diff --name-status` scope'u, required check seti/checked SHA ve `SQUASH`
merge methoduna exact bağlıdır. Entry ve bütün ledger deterministic digest taşır.

```text
ISSUED → VALIDATED → CONSUMED
          ├────────→ REVOKED
          ├────────→ EXPIRED
          └────────→ INVALIDATED
```

Yalnız `VALIDATED` live koşuya uygundur. Başarılı merge ancestry doğrulamasından sonra ledger
cleanup'tan önce atomik `CONSUMED` yapılır. Consumed v2 ledger aynı task/PR için dahi ikinci
kez kullanılamaz. Conflict, digest tamper, partial write, head/base/scope/check drift ve
canonical authority çözümleme hatası fail-closed reddedilir.

Schema v1 yalnız unrelated historical recovery için okunabilir; yeni materializer v1 yazmaz.
Eski minimum örnek:

```json
{
  "schemaVersion": 1,
  "entries": [
    {
      "authorityRef": "OWNER-...-2026-07-28",
      "authorityType": "EX_ANTE_GO_COMPLETE",
      "taskId": "GOV-EXAMPLE-R01",
      "pr": 1234,
      "consumed": false
    }
  ]
}
```

Schema-v1 tüketilmiş bir referans aynı task + aynı PR historical recovery davranışını korur;
başka PR için `MERGE_AUTHORITY_REUSE_FORBIDDEN` üretir. Bu compatibility v2 single-use
semantiğini gevşetmez.

## Kullanım

Önce PR current base/head/scope/check setine v2 ledger materialize edilir:

```text
pnpm orch:closeout \
  --materialize-ledger \
  --program-id <PROGRAM-ID> \
  --task-id <TASK-ID> \
  --pr <NUMBER> \
  --expected-base <40-hex-sha> \
  --expected-head <40-hex-sha> \
  --branch <ajan>/<konu> \
  --worktree <worktree-yolu> \
  --target-branch main \
  --repository <owner/repo> \
  --semantic-authority-kind SEMANTIC_AUTHORITY \
  --semantic-authority-path <repo-path> \
  --semantic-authority-record-id <record-id> \
  --semantic-authority-evidence-sha <40-hex-sha> \
  --execution-grant-kind EXECUTION_GRANT \
  --execution-grant-path <repo-path> \
  --execution-grant-record-id <record-id> \
  --execution-grant-evidence-sha <40-hex-sha> \
  --allowed-paths "path/a,path/b" \
  --required-checks "Check A,Check B" \
  --merge-method SQUASH \
  --issued-by "<canonical owner name>" \
  --ledger <task-local-ledger.json> \
  --result-file <materialization-result.json>
```

Sonra aynı exact binding ile dry-run ve live koşulur:

```text
pnpm orch:closeout \
  --program-id <PROGRAM-ID> \
  --task-id <TASK-ID> \
  --pr <NUMBER> \
  --expected-head <40-hex-sha> \
  --authority-type EX_ANTE_GO_COMPLETE \
  --authority-ref <execution-grant-record-id> \
  --semantic-authority-kind SEMANTIC_AUTHORITY \
  --semantic-authority-path <repo-path> \
  --semantic-authority-record-id <record-id> \
  --semantic-authority-evidence-sha <40-hex-sha> \
  --execution-grant-kind EXECUTION_GRANT \
  --execution-grant-path <repo-path> \
  --execution-grant-record-id <record-id> \
  --execution-grant-evidence-sha <40-hex-sha> \
  --allowed-paths "path/a,path/b" \
  --required-checks "Check A,Check B" \
  --branch <ajan>/<konu> \
  --worktree <worktree-yolu> \
  --ledger <task-local-ledger.json> \
  [--result-file <task-local-live-result.json>] \
  [--target-branch main] [--dry-run] [--json]
```

Önce **daima `--dry-run`** çalıştırılır. Beklenen çıktı:

```text
STATUS  DRY_RUN_ELIGIBLE
STAGE   MERGE_GATE_VALIDATED
STRUCTURAL  DRY_RUN_STRUCTURALLY_ELIGIBLE
LIVE AUTH   LIVE_AUTHORITY_READY | LIVE_AUTHORITY_MISSING
```

Dry-run hiçbir mutation yapmaz. Ancak bundan sonra live koşu yapılır.
Bu nedenle `--result-file` dry-run ile birlikte kabul edilmez; yalnız materialization veya
live terminal sonucu için kullanılır.

Çıkış kodu: `0` = `CLOSED` veya `DRY_RUN_ELIGIBLE`, `1` = `BLOCKED` veya
`MERGED_CLEANUP_BLOCKED`.

## State machine

```text
PREFLIGHT → AUTHORITY_VALIDATED → PR_IDENTITY_VALIDATED → SCOPE_VALIDATED
→ CI_TERMINAL → MERGE_GATE_VALIDATED → MERGED → MAIN_SYNCED → LEDGER_CONSUMED
→ WORKTREE_CLEANED → BRANCH_CLEANED → CANONICAL_VERIFIED → CLOSED
```

Tek yönlüdür; bir aşama başarısızsa sonraki aşamaya geçilmez ve `stage` alanı nerede
kalındığını bildirir.

**Worktree cleanup, branch cleanup'tan ÖNCE koşar.** Sebep: bir worktree branch'i checkout
tutarken `git branch -D` çalışmaz. Sıra ters olduğunda branch silinemez ama kapanış yine
de başarılı raporlanırdı — bu, `GOV-DETERMINISTIC-PR-CLOSEOUT-PILOT-R01` canlı koşusunda
tespit edildi ve düzeltildi.

## Sonuç durumları

| status | Anlamı |
|---|---|
| `DRY_RUN_ELIGIBLE` | tüm pre-merge gate'ler PASS, mutation yapılmadı |
| `CLOSED` | zincir sonuna kadar tamamlandı |
| `BLOCKED` | bir gate PASS değil; **hiçbir mutation yapılmadı** |
| `MERGED_CLEANUP_BLOCKED` | merge gerçekleşti, sonraki bir adım takıldı |

`MERGED_CLEANUP_BLOCKED` durumunda **merge geri alınmaya çalışılmaz.** Kalan iş elle
tamamlanır; worktree/branch temizliği için `worktree-cleanup.md` izlenir.

### Merge actor ve terminal delivery temsili

Merge'i kimin gerçekleştirdiği ayrı ve dürüst kaydedilir; owner merge ile ajan fallback
merge **aynı state olarak yazılmaz**.

| `mergePerformedBy` | Anlamı | Terminal delivery |
|---|---|---|
| `LIVE_RUNNER` | deterministic runner merge etti | `RUNNER_MERGED` |
| `EXECUTOR_FALLBACK` | runner blokladı; ajan owner authority ile elle kapattı | `EXECUTOR_FALLBACK_MERGED` |
| `OWNER` | owner GitHub üzerinden merge etti | `OWNER_MERGED` |
| `NONE` | merge yok | `NOT_MERGED` |

### MERGED ≠ CLOSED — görev sınıfı bazlı acceptance

`MERGED` yalnız governance-only görevde terminaldir. Görev sınıfına göre zorunlu zincir:

```text
governance-only    MERGED → MAIN_SYNCED → FINAL_VERIFIED → CLOSED
tooling / runner   MERGED → CANONICAL SELF-TEST → DOGFOOD RESULT → CLOSED
runtime code       MERGED → DEPLOYED → APPLICATION_PATH_EXECUTED → RUNTIME_VERIFIED → CLOSED
migration          MERGED → BACKUP_VERIFIED → MIGRATION_APPLIED → DATA_RECONCILED
                          → RUNTIME_VERIFIED → CLOSED
security patch     MERGED → DEPLOYED → EXPOSURE/REGRESSION VERIFIED → CLOSED
feature flag       MERGED → DEPLOYED → DEFAULT-OFF VERIFIED → CONTROLLED ACTIVATION
                          → EVIDENCE → FINAL FLAG DISPOSITION → CLOSED
scheduler / queue  MERGED → DEPLOYED → STARTUP REGISTRATION → PRODUCER-CONSUMER EXECUTION
                          → RETRY/IDEMPOTENCY/TENANT EVIDENCE → CLOSED
```

Her görev tüm state'leri kullanmak zorunda değildir; sınıfının zincirini tamamlamadan
`CLOSED` denmez.

### Delivery ve dogfood ayrımı

Kapanış raporu şu beşi **ayrı** bildirir:

```text
DELIVERY            : PASS / FAIL
RUNTIME ACCEPTANCE  : PASS / FAIL / NOT_APPLICABLE
LEDGER DOGFOOD      : PASS / FAIL / NOT_USED
CLOSEOUT MECHANISM  : LIVE_RUNNER / EXECUTOR_FALLBACK / OWNER
FINAL TASK STATUS   : CLOSED / BLOCKED / PARTIAL
```

Geçerli ve dürüst bir kombinasyon örneği:

```text
DELIVERY: PASS · LEDGER DOGFOOD: FAIL · CLOSEOUT MECHANISM: EXECUTOR_FALLBACK
FINAL TASK STATUS: CLOSED WITH GOVERNANCE RESIDUAL
```

### workspaceModule

Ledger/authority kayıtlarında yalnız canonical enum kabul edilir
(`CANONICAL-FIVE-MODULE-WORKSPACE-MAP.md`):

```text
OFFICE · CLIENT · DEBTOR · RECEIVABLE · COLLECTION · CROSS_MODULE
SHARED_CONTROL_PLANE · UNKNOWN
```

`REPOSITORY_WIDE_RUNTIME_CONTROL_PLANE` **workspaceModule olarak GEÇERSİZDİR.**
Repository-wide control-plane görevleri `SHARED_CONTROL_PLANE` kullanır. Değer sabit
hard-code edilmez; task/authority kaydından alınır ve canonical enum'a doğrulanır.

## Idempotency ve recovery

Komut aynı context ile yeniden çalıştırılabilir:

| Durum | Davranış |
|---|---|
| PR hâlâ OPEN, mutation yok | gate'ler yeniden değerlendirilir |
| PR MERGED, cleanup yarım | yeni merge çağrılmaz; yalnız post-merge recovery koşar |
| PR başka bir SHA ile merged | `MERGE_STATE_UNVERIFIED`, fail-closed |
| Branch zaten silinmiş | başarı sayılır |
| Worktree zaten kaldırılmış | `ALREADY_ABSENT`, başarı sayılır |

## Blocker kodları

Authority: `MERGE_AUTHORITY_MISSING` · `_INVALID` · `_TASK_MISMATCH` · `_PR_MISMATCH` ·
`_REUSE_FORBIDDEN` · `AUTHORITY_RESOLUTION_FAILED` · `AUTHORITY_REFS_NOT_DISTINCT` ·
`MERGE_AUTHORITY_LEDGER_MALFORMED` · `_DIGEST_MISMATCH` · `_CONSUMED` · `_REVOKED` ·
`_EXPIRED` · `_INVALIDATED` · `CONFLICTING_MERGE_AUTHORITY_LEDGERS`

Identity/scope: `PR_NOT_OPEN` · `PR_HEAD_MISMATCH` · `REMOTE_HEAD_MISMATCH` ·
`LOCAL_HEAD_MISMATCH` · `CHANGED_PATH_SCOPE_FORBIDDEN` · `TARGET_BRANCH_UNEXPECTED` ·
`REPOSITORY_IDENTITY_MISMATCH` · `AUTHORIZED_BASE_MISMATCH` ·
`AUTHORIZED_HEAD_MISMATCH` · `AUTHORIZED_SCOPE_MISMATCH`

Collision: `COMPETING_WRITER_FOUND` · `OWNER_WIP_COLLISION`

CI/merge: `CI_NOT_TERMINAL` · `CI_FAILED` · `CI_STALLED` · `PR_NOT_MERGEABLE` ·
`PR_NOT_CLEAN` · `REQUIRED_CHECKS_BINDING_MISMATCH` · `MERGE_FAILED` ·
`MERGE_STATE_UNVERIFIED`

Beklenmedik yanıt: `UNEXPECTED_GITHUB_RESPONSE` — GitHub'dan gelen PR payload'ı şekil
doğrulamasından geçmezse (eksik `state`, sha olmayan `headRefOid`, bozuk `mergeCommitOid`)
kapanış fail-closed olur. Eksik bir alan sessizce "gate PASS" gibi değerlendirilmez.

Post-merge: `MAIN_SYNC_FAILED` · `MERGE_SUCCEEDED_LEDGER_CONSUMPTION_FAILED` ·
`BRANCH_CLEANUP_FAILED` · `WORKTREE_CLEANUP_FAILED` · `CANONICAL_VERIFICATION_FAILED`

## Güvenlik

Geçici ağ/servis hataları (`dial tcp`, `ETIMEDOUT`, `ECONNRESET`, `502/503/504`,
rate-limit) **yalnız read-only** komutlarda sınırlı ve üstel gecikmeli olarak yeniden
denenir. **Mutation komutları (`gh pr merge`) asla yeniden denenmez** — çift merge riski
üretir; hata çağırana gider ve kapanış `MERGE_FAILED` ile durur.

Komutlar `execFileSync` ile argv dizisi olarak çalıştırılır — shell yok, string
concatenation yok. Branch adı, worktree yolu ve SHA girdileri şekil doğrulamasından
geçer; option injection ve path traversal reddedilir. Token ve secret çıktıya yazılmaz.
Destructive `reset`/`clean` ve fiziksel recursive silme kullanılmaz.

## Sınırlar

- Runner **opt-in** bounded capability'dir; manuel owner-authorized kapanış geçerli
  kalır ve `AGENTS.md` runner'ı default execution path olarak tanımlamaz.
- Ledger yalnız `--dry-run` için opsiyoneldir; live closeout onsuz çalışmaz.
- Runner'ın **kritik merge-güvenliği invariant'ları** `Web Tests (vitest)` job'ında
  (REQUIRED) koşar: `apps/web/src/__tests__/closeout-runner-invariants.test.ts`.
  Tam davranış matrisi `Test Suite` job'ındadır (`pr-closeout.spec.ts`) ve o job
  required değildir — bir davranış regresyonu PR'ı kırmızı yakar ama teknik merge
  engeli üretmez.

## Referanslar

`AGENTS.md` §4 §5 §6 §14 · `project/docs/governance/closeout-production-certification.md` ·
`project/docs/runbooks/worktree-cleanup.md` ·
`project/scripts/orchestration-v2/closeout/closeout.cjs`

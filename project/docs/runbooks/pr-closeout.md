# Runbook: Deterministic PR Closeout

**Status:** Active · **Owner:** Platform · **Son güncelleme:** 2026-07-28

Bu runbook, owner tarafından bir task/PR'a açıkça bağlanmış merge authority mevcutken
mekanik PR kapanışını yürüten `orch:closeout` komutunun operasyon prosedürüdür.

Normatif çekirdek `AGENTS.md`'dedir: merge authority semantiği §4, CI ve merge disiplini
§5, worktree izolasyonu §6, stop condition'lar §14. Bu runbook onları tekrar etmez;
yalnız komutun nasıl çalıştırılacağını ve çıktısının nasıl okunacağını anlatır.

## Ne yapar, ne yapmaz

```text
YAPAR   : owner authority + 20 deterministik gate PASS ise
          squash-merge → main sync → worktree cleanup → branch cleanup
          → canonical verification → authority consumption

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

Ledger opsiyoneldir ama verildiğinde bağlayıcıdır. Kayıt `taskId` + `pr` ile bağlanır;
kapanış başarılı olduğunda runner `consumed` damgasını yazar:

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

Tüketilmiş bir referans **aynı task + aynı PR** için yeniden kullanılabilir (recovery
koşusu meşrudur); **başka bir PR** için `MERGE_AUTHORITY_REUSE_FORBIDDEN` üretir.

## Kullanım

```text
pnpm orch:closeout \
  --task-id <TASK-ID> \
  --pr <NUMBER> \
  --expected-head <40-hex-sha> \
  --authority-type EX_ANTE_GO_COMPLETE \
  --authority-ref "<owner beyani referansi>" \
  --allowed-paths "path/a,path/b" \
  --branch <ajan>/<konu> \
  --worktree <worktree-yolu> \
  --ledger <ledger.json> \
  [--target-branch main] [--required-checks "A,B"] \
  [--dry-run] [--json]
```

Önce **daima `--dry-run`** çalıştırılır. Beklenen çıktı:

```text
STATUS  DRY_RUN_ELIGIBLE
STAGE   MERGE_GATE_VALIDATED
```

Dry-run hiçbir mutation yapmaz. Ancak bundan sonra live koşu yapılır.

Çıkış kodu: `0` = `CLOSED` veya `DRY_RUN_ELIGIBLE`, `1` = `BLOCKED` veya
`MERGED_CLEANUP_BLOCKED`.

## State machine

```text
PREFLIGHT → AUTHORITY_VALIDATED → PR_IDENTITY_VALIDATED → SCOPE_VALIDATED
→ CI_TERMINAL → MERGE_GATE_VALIDATED → MERGED → MAIN_SYNCED → WORKTREE_CLEANED
→ BRANCH_CLEANED → CANONICAL_VERIFIED → CLOSED
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
`_REUSE_FORBIDDEN`

Identity/scope: `PR_NOT_OPEN` · `PR_HEAD_MISMATCH` · `REMOTE_HEAD_MISMATCH` ·
`LOCAL_HEAD_MISMATCH` · `CHANGED_PATH_SCOPE_FORBIDDEN` · `TARGET_BRANCH_UNEXPECTED` ·
`REPOSITORY_IDENTITY_MISMATCH`

Collision: `COMPETING_WRITER_FOUND` · `OWNER_WIP_COLLISION`

CI/merge: `CI_NOT_TERMINAL` · `CI_FAILED` · `CI_STALLED` · `PR_NOT_MERGEABLE` ·
`PR_NOT_CLEAN` · `MERGE_FAILED` · `MERGE_STATE_UNVERIFIED`

Post-merge: `MAIN_SYNC_FAILED` · `BRANCH_CLEANUP_FAILED` · `WORKTREE_CLEANUP_FAILED` ·
`CANONICAL_VERIFICATION_FAILED`

## Güvenlik

Komutlar `execFileSync` ile argv dizisi olarak çalıştırılır — shell yok, string
concatenation yok. Branch adı, worktree yolu ve SHA girdileri şekil doğrulamasından
geçer; option injection ve path traversal reddedilir. Token ve secret çıktıya yazılmaz.
Destructive `reset`/`clean` ve fiziksel recursive silme kullanılmaz.

## Sınırlar

- Runner **opt-in** bounded capability'dir; manuel owner-authorized kapanış geçerli
  kalır ve `AGENTS.md` runner'ı default execution path olarak tanımlamaz.
- Ledger verilmezse reuse koruması kayıt tutmaz.
- Testler `Test Suite` job'ına bağlıdır; o job required check değildir.

## Referanslar

`AGENTS.md` §4 §5 §6 §14 · `project/docs/runbooks/worktree-cleanup.md` ·
`project/scripts/orchestration-v2/closeout/closeout.cjs`

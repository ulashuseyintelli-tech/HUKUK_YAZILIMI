# Deterministic PR Closeout — Production Certification

**Status:** V1 CERTIFIED / V2 EXTENSION SELF-HOSTED-CLOSEOUT GATED · **Tarih:** 2026-07-30 · **Program:** `GOV-DETERMINISTIC-CLOSEOUT-PRODUCTION-R01`

Bu belge closeout runner'ın production readiness kaydıdır. Normatif kural üretmez;
bağlayıcı hükümler `AGENTS.md` §4 (merge authority), §5 (CI ve merge disiplini) ve §14
(stop condition) içindedir. Operasyon prosedürü `project/docs/runbooks/pr-closeout.md`.

## 1. Execution policy

```text
TASK-BOUND OWNER-AUTHORIZED AUTOMATIC CLOSEOUT   DEFAULT EXECUTION PATH
MANUAL CLOSEOUT                                  FALLBACK ONLY
STANDING AUTO-MERGE                              DISABLED
UNATTENDED MERGE                                 DISABLED
REUSABLE MERGE GRANT                             DISABLED
SCHEDULER                                        YOK
```

Merge authority PASS olan bir kapanışta varsayılan yol runner'dır (`AGENTS.md` §5).
Manuel kapanış yalnız runner kullanılamaz, senaryoyu desteklemez veya exact blocker
üretirse kullanılır ve gerekçesi raporlanır. Fallback gate atlamak için kullanılamaz.

## 2. Architecture

```text
cli.cjs          CLI, explicit materialization, atomic task-local result output
   |
merge-authority-ledger.cjs
   |             canonical SA/EG resolve, exact candidate, digest, atomic lifecycle
   |
closeout.cjs     saf karar katmani: fail-closed state machine
   |             tum I/O adapter uzerinden; hicbir dogrudan gh/git cagrisi yok
   |
gh-adapter.cjs   gercek gh/git ve task-local ledger yuzeyi, execFileSync argv dizisi
```

Karar katmanı saf ve deterministiktir; testler fake adapter ile davranışı doğrular,
ayrı bir test gerçek adapter modülünü yükler (bkz. §8 pilot geçmişi).

CI değerlendirmesi sıfırdan yazılmadı: required-check seti ve pending/failed ayrımı
`orchestrator/mergeready.cjs`'in `evaluateCi` fonksiyonundan yeniden kullanılır.

### State machine

```text
PREFLIGHT → AUTHORITY_VALIDATED → PR_IDENTITY_VALIDATED → SCOPE_VALIDATED
→ CI_TERMINAL → MERGE_GATE_VALIDATED → MERGED → MAIN_SYNCED → LEDGER_CONSUMED
→ WORKTREE_CLEANED → BRANCH_CLEANED → CANONICAL_VERIFIED → CLOSED
```

Tek yönlüdür. Worktree cleanup branch cleanup'tan **önce** gelir: bir worktree branch'i
checkout tutarken `git branch -D` çalışmaz.

## 3. Authority model

Runner authority **üretmez**, yorumlamaz, taşımaz. Yalnız üç task-bound tip kabul edilir:

| Tip | Anlamı |
|---|---|
| `EX_ANTE_GO_COMPLETE` | authority task brief'inde önceden verildi |
| `IN_TASK_GO_COMPLETE` | authority aynı task içinde sonradan verildi |
| `EXPLICIT_PR_MERGE_AUTHORITY` | authority doğrudan bu PR için verildi |

`"devam"`, `"uygula"`, `"başla"`, kapsam seçimi, tasarım onayı, implementasyon izni,
commit/push/PR izni ve CI takip talimatı **authority değildir** (`AGENTS.md` §4).

### Ledger

Live merge için **zorunludur**. Ledger yoksa tüketim kaydı tutulamaz, dolayısıyla reuse
koruması da yoktur → `MERGE_AUTHORITY_LEDGER_REQUIRED`. Dry-run yapısal uygunluğu ve live
readiness'i ayrı raporlar.

Schema v2 canonical distinct SA/EG kayıtlarını exact program/task/owner/mode ile çözer ve
repository/PR/current-base/head/branch/status-qualified scope/required-check SHA/squash methoduna
bağlar. Entry ve bütün ledger digest'lidir; temp write + validate + atomic rename kullanır.
Lifecycle `ISSUED → VALIDATED → CONSUMED`; terminal `REVOKED/EXPIRED/INVALIDATED` fail-closed.
Consumed v2 ledger aynı task/PR için dahi yeniden kullanılamaz.

Schema-v1 same-task/same-PR recovery yalnız unrelated historical compatibility olarak korunur.

## 4. Threat model

| Tehdit | Savunma |
|---|---|
| Yetkisiz merge | authority zorunlu; örtülü ifadeden türetilemez; ledger binding |
| Authority'nin başka PR'a taşınması | `consumed` damgası + PR ekseninde reuse reddi |
| Sahte veya stale canonical kayıt | canonical resolver + evidence ancestry + exact SA/EG structured field validation |
| Ledger tamper/partial write | entry+ledger digest, exclusive lock, validated temporary file, atomic rename |
| Yanlış PR'ın merge edilmesi | repository identity + PR/remote/local head üçlü doğrulama |
| Base veya branch drift | current base SHA + base/head branch exact binding |
| TOCTOU (gate ile merge arası drift) | merge çağrısından hemen önce identity + head yeniden doğrulanır |
| Scope dışı değişikliğin sızması | `git diff --name-status` exact set + digest + CLI exact allowlist |
| Başka oturumun işinin bozulması | competing writer + owner WIP collision gate'leri |
| Yarım CI'da merge | required set runtime'da hesaplanır; pending ≠ failed; ikisi de merge'i durdurur |
| Check-set drift | branch protection yeniden keşfedilir ve ledger seti/checked SHA ile exact karşılaştırılır |
| Command injection | `execFileSync` argv dizisi, shell yok; branch/path/sha şekil doğrulaması |
| Path traversal | worktree yolunda `../` reddi |
| Secret sızması | çıktıda token/secret deseni redakte edilir |
| Bozuk/eksik GitHub yanıtı | `validatePrShape` üç noktada; eksik alan sessizce PASS sayılmaz |
| Geçici ağ hatası → yanlış BLOCKED | read-only komutlarda sınırlı üstel retry |
| Çift merge | mutation komutu **retry edilmez** |
| Fiziksel repo bozulması | recursive silme yok; yalnız `worktree remove --force` + `prune` |

## 5. Failure matrix

| Aşama | Blocker | Mutation |
|---|---|---|
| PREFLIGHT | authority missing/invalid/resolution/ref-distinct/ledger missing-malformed-tampered-terminal-conflict/reuse/repository blockers | yok |
| AUTHORITY_VALIDATED | `UNEXPECTED_GITHUB_RESPONSE` | yok |
| PR_IDENTITY_VALIDATED | PR/head/remote/local/base/branch exact-binding blockers | yok |
| SCOPE_VALIDATED | path/status/digest scope drift · competing writer · owner WIP | yok |
| CI_TERMINAL | pending/failed/stalled · required-set/checked-SHA drift | yok |
| MERGE_GATE_VALIDATED | `PR_NOT_MERGEABLE` · `PR_NOT_CLEAN` · `MERGE_FAILED` | yok |
| MERGED sonrası | merge/main verification · atomic consumption · worktree/branch cleanup · canonical verification | **merge yapıldı** |

Merge öncesi her blocker **sıfır mutation** üretir. Merge sonrası bir adım takılırsa
`MERGED_CLEANUP_BLOCKED` raporlanır ve **merge geri alınmaya çalışılmaz**.

## 6. Recovery matrix

| Durum | Davranış |
|---|---|
| PR hâlâ OPEN, mutation yok | gate'ler yeniden değerlendirilir |
| PR MERGED, cleanup yarım | yeni merge çağrılmaz; yalnız post-merge recovery |
| PR başka bir SHA ile merged | `MERGE_STATE_UNVERIFIED`, fail-closed |
| Branch zaten silinmiş | başarı sayılır |
| Worktree zaten kaldırılmış | `ALREADY_ABSENT`, başarı sayılır |
| Schema-v1 aynı authorityRef, aynı task+PR | historical recovery'ye izin verilir |
| Schema-v2 `CONSUMED` | aynı task/PR dahil reuse reddedilir |
| Aynı authorityRef, farklı PR/task | `REUSE_FORBIDDEN`, sıfır mutation |

## 7. Test matrix

| Katman | Konum | Test | CI job | Required |
|---|---|---|---|---|
| Merge-güvenliği invariant'ları | `apps/web/src/__tests__/closeout-runner-invariants.test.ts` | 17 | `Web Tests (vitest)` | **evet** |
| Tam davranış matrisi | `apps/api/src/common/__tests__/pr-closeout.spec.ts` | 59 | `Test Suite` | hayır |
| V2 materializer/security/lifecycle | `scripts/orchestration-v2/closeout/merge-authority-ledger.test.cjs` | 61 | `GOV-COORD-V2 Orchestration Tests` | hayır |
| Representative real bare-Git closeout | `scripts/orchestration-v2/closeout/representative-live-closeout.test.cjs` | 1 | `GOV-COORD-V2 Orchestration Tests` | hayır |

Required katman dar tutulur: yalnız "bunlar bozulursa yetkisiz merge mümkün olur" sınırı.
Davranış matrisi orada tekrar edilmez.

Her iki katman da gerçek `gh-adapter.cjs` modülünü yükleyen bir test içerir.

## 8. Pilot history

| Aşama | PR | Sonuç |
|---|---|---|
| Runner implementasyonu | #1716 | manuel kapatıldı (self-hosting döngüsünden kaçınmak için) |
| PILOT R01 | #1720 | **runner ile kapatıldı** — ilk canlı merge |
| R01 bulguları | #1726 | cleanup sırası + idempotent recovery düzeltmesi |
| PILOT R02 | #1740 | runner ile kapatıldı; dört düzeltme canlı doğrulandı |
| R02 bulgusu | #1741 | reuse sinyali binding mismatch'ten önceye alındı |

Pilotlar **beş gerçek kusur** buldu; hepsi fake adapter testleri yeşilken vardı:

1. `gh-adapter.cjs` syntax hatası — hiçbir test onu `require` etmiyordu, CI yeşildi
2. cleanup sırası ters — runner `DELETED` raporlarken local branch duruyordu
3. `consumed` kontrolü idempotent recovery'yi de blokluyordu
4. cross-PR reuse doğru reddediliyordu ama **yanlış sinyalle** (`PR_MISMATCH`)
5. `STAGES` sabiti gerçek cleanup sırasıyla uyuşmuyordu — required invariant testi yakaladı

Çıkarım: fake adapter *davranışı* doğrular; canlı koşu *bağlantıyı, raporun doğruluğunu
ve gate'in eksenini* doğrular. Bunlar birbirinin yerine geçmez.

## 9. Known limitations

- Runner **opt-in** bounded capability'dir; `AGENTS.md` onu varsayılan yol olarak
  tanımlar ama manuel kapanışı yasaklamaz.
- Tam davranış matrisi (`Test Suite`) required check değildir; bir davranış regresyonu
  PR'ı kırmızı yakar ve `CLEAN`'i düşürür ama teknik merge engeli üretmez.
- `--dry-run` ledger'sız çalışır; bu bilinçli bir gevşemedir (mutation yok).
- Ledger/task result repository dışındaki task-specific non-secret path'te tutulur; aynı PR'a
  commit edilmesi exact-head binding'i bozacağı için yasaktır.
- Merge yalnız `squash` metodunu destekler.
- Adapter senkron `execFileSync` kullanır; paralel closeout tasarlanmamıştır.

## 10. Residual risks

1. **Required katman dar.** Davranış regresyonları required altında değil. Genişletmek
   ci.yml (control-plane) veya branch protection değişikliği ister — ayrı owner kararı.
2. **Ledger dosya tabanlı ve host-local.** Exclusive lock aynı hosttaki concurrent write'ı
   fail-closed engeller; distributed multi-host closeout tasarlanmamıştır.
3. **`consumedPr` alanı olmayan schema-v1 kayıtlar** binding `pr` alanına düşer; kayıt
   şeması genişlerse bu fallback gözden geçirilmeli.
4. **Retry yalnız desen tabanlı.** Tanınmayan bir geçici hata retry edilmez ve kapanış
   gereksiz yere durur — güvenli taraf, ama operatör müdahalesi gerektirir.
5. Pilotlar docs-only ve test-only PR'larda yapıldı; runtime/schema değiştiren bir PR
   üzerinde canlı koşu yapılmadı.

## 11. Referanslar

`AGENTS.md` §4 §5 §6 §14 · `project/docs/runbooks/pr-closeout.md` ·
`project/scripts/orchestration-v2/closeout/` · `orchestrator/mergeready.cjs`

# Deterministic PR Closeout — Production Certification

**Status:** CERTIFIED · **Tarih:** 2026-07-28 · **Program:** `GOV-DETERMINISTIC-CLOSEOUT-PRODUCTION-R01`

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
cli.cjs          CLI yuzeyi (pnpm orch:closeout), arg parse, exit code
   |
closeout.cjs     saf karar katmani: 12 asamali state machine, 27 blocker kodu
   |             tum I/O adapter uzerinden; hicbir dogrudan gh/git cagrisi yok
   |
gh-adapter.cjs   gercek gh/git yuzeyi (17 fonksiyon), execFileSync argv dizisi
```

Karar katmanı saf ve deterministiktir; testler fake adapter ile davranışı doğrular,
ayrı bir test gerçek adapter modülünü yükler (bkz. §8 pilot geçmişi).

CI değerlendirmesi sıfırdan yazılmadı: required-check seti ve pending/failed ayrımı
`orchestrator/mergeready.cjs`'in `evaluateCi` fonksiyonundan yeniden kullanılır.

### State machine

```text
PREFLIGHT → AUTHORITY_VALIDATED → PR_IDENTITY_VALIDATED → SCOPE_VALIDATED
→ CI_TERMINAL → MERGE_GATE_VALIDATED → MERGED → MAIN_SYNCED → WORKTREE_CLEANED
→ BRANCH_CLEANED → CANONICAL_VERIFIED → CLOSED
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
koruması da yoktur → `MERGE_AUTHORITY_LEDGER_REQUIRED`. `--dry-run` ledger'sız çalışır.

Binding: `authorityRef` + `taskId` + `pr` (+ live koşuda `expectedHead`). Kapanışta
runner `consumed`, `consumedPr`, `consumedTaskId`, `consumedMergeSha` yazar.

Tüketilmiş referans **aynı task + aynı PR** için recovery'ye izin verir; **başka PR veya
task** için `MERGE_AUTHORITY_REUSE_FORBIDDEN`.

## 4. Threat model

| Tehdit | Savunma |
|---|---|
| Yetkisiz merge | authority zorunlu; örtülü ifadeden türetilemez; ledger binding |
| Authority'nin başka PR'a taşınması | `consumed` damgası + PR ekseninde reuse reddi |
| Yanlış PR'ın merge edilmesi | repository identity + PR/remote/local head üçlü doğrulama |
| TOCTOU (gate ile merge arası drift) | merge çağrısından hemen önce identity + head yeniden doğrulanır |
| Scope dışı değişikliğin sızması | `allowedPaths` exact eşleşme; control-plane yolu asla scope'a giremez |
| Başka oturumun işinin bozulması | competing writer + owner WIP collision gate'leri |
| Yarım CI'da merge | required set runtime'da hesaplanır; pending ≠ failed; ikisi de merge'i durdurur |
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
| PREFLIGHT | `MERGE_AUTHORITY_MISSING` · `_INVALID` · `_LEDGER_REQUIRED` · `_TASK_MISMATCH` · `_PR_MISMATCH` · `_REUSE_FORBIDDEN` · `REPOSITORY_IDENTITY_MISMATCH` | yok |
| AUTHORITY_VALIDATED | `UNEXPECTED_GITHUB_RESPONSE` | yok |
| PR_IDENTITY_VALIDATED | `PR_NOT_OPEN` · `PR_HEAD_MISMATCH` · `REMOTE_HEAD_MISMATCH` · `LOCAL_HEAD_MISMATCH` · `TARGET_BRANCH_UNEXPECTED` | yok |
| SCOPE_VALIDATED | `CHANGED_PATH_SCOPE_FORBIDDEN` · `COMPETING_WRITER_FOUND` · `OWNER_WIP_COLLISION` | yok |
| CI_TERMINAL | `CI_NOT_TERMINAL` · `CI_FAILED` · `CI_STALLED` | yok |
| MERGE_GATE_VALIDATED | `PR_NOT_MERGEABLE` · `PR_NOT_CLEAN` · `MERGE_FAILED` | yok |
| MERGED sonrası | `MERGE_STATE_UNVERIFIED` · `MAIN_SYNC_FAILED` · `WORKTREE_CLEANUP_FAILED` · `BRANCH_CLEANUP_FAILED` · `CANONICAL_VERIFICATION_FAILED` | **merge yapıldı** |

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
| Aynı authorityRef, aynı task+PR | recovery'ye izin verilir |
| Aynı authorityRef, farklı PR/task | `REUSE_FORBIDDEN`, sıfır mutation |

## 7. Test matrix

| Katman | Konum | Test | CI job | Required |
|---|---|---|---|---|
| Merge-güvenliği invariant'ları | `apps/web/src/__tests__/closeout-runner-invariants.test.ts` | 13 | `Web Tests (vitest)` | **evet** |
| Tam davranış matrisi | `apps/api/src/common/__tests__/pr-closeout.spec.ts` | 59 | `Test Suite` | hayır |

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
- Merge yalnız `squash` metodunu destekler.
- Adapter senkron `execFileSync` kullanır; paralel closeout tasarlanmamıştır.

## 10. Residual risks

1. **Required katman dar.** Davranış regresyonları required altında değil. Genişletmek
   ci.yml (control-plane) veya branch protection değişikliği ister — ayrı owner kararı.
2. **Ledger dosya tabanlı.** Eşzamanlı iki closeout aynı ledger'a yazarsa son yazan
   kazanır. Bugün program lock (tek aktif PR) bunu pratikte engelliyor.
3. **`consumedPr` alanı olmayan eski kayıtlar** binding `pr` alanına düşer; kayıt
   şeması genişlerse bu fallback gözden geçirilmeli.
4. **Retry yalnız desen tabanlı.** Tanınmayan bir geçici hata retry edilmez ve kapanış
   gereksiz yere durur — güvenli taraf, ama operatör müdahalesi gerektirir.
5. Pilotlar docs-only ve test-only PR'larda yapıldı; runtime/schema değiştiren bir PR
   üzerinde canlı koşu yapılmadı.

## 11. Referanslar

`AGENTS.md` §4 §5 §6 §14 · `project/docs/runbooks/pr-closeout.md` ·
`project/scripts/orchestration-v2/closeout/` · `orchestrator/mergeready.cjs`

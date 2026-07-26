# Process Rules

Bu dosya `AGENTS.md` içindeki repository-level ajan standardının kısa operasyonel özetidir. Bağlayıcı baseline `AGENTS.md`'dir. `CLAUDE.md` Claude'a özgü supplement'tir ve `AGENTS.md` ile çelişemez. Governance kayıtları süreç ve karar dokümantasyonudur; çelişki halinde `AGENTS.md` uygulanır ve çelişen kayıt düzeltilmek üzere raporlanır.

Repo-local uzmanlık skill'leri resmi Codex scan yüzeyi olan `.agents/skills/` altında tanımlanır. `.codex/` Codex operasyonel config, hooks ve project-scoped custom agents yüzeyidir; mevcut owner/user WIP sayılır ve açık yetki olmadan değiştirilmez.

Repository-wide AI ground-truth rule: Sohbet geçmişi yalnız niyet ve karar taşır. Mevcut gerçekler her görevde repository state, git state, dosya içeriği, governance kayıtları, PR/CI durumu ve komut çıktılarından yeniden doğrulanır.

## Required Start

Her yeni görev çalışma seviyesi önerisiyle başlar:

```text
ÇALIŞMA SEVİYESİ ÖNERİSİ

- Faster
- Normal
- High
- Ultra

Neden: ...
```

Büyük veya uzun ömürlü workstream'lerde görev ayrıca kısa bir Session Initialization özetiyle başlar:

```text
SESSION INITIALIZATION

Repository State:
- Branch:
- HEAD:
- Working tree:
- Main / origin-main:

Execution Context:
- Requested mode:
- Bounded context:
- Allowed scope:

Context Drift:
- Conversation assumptions re-verified:
- Concurrent commits:
- Relevant upstream/local changes:
- Requires re-analysis:

Concurrent Activity:
- Untracked/user WIP:
- Other active branch/worktree signal:
- PR/CI state if relevant:

Readiness:
- Ready / Not Ready:
- Reason:
```

Bu özet tam rapor değildir; ajan işe başlamadan önce repository-first durumunu hızlı görünür kılan kısa güvenlik kontrolüdür.

## Implementation Worktree Gate

Canonical project root ana üs olarak kabul edilir: read-only doğrulama, final `main` sync ve register verification için kullanılır. Operasyon, patch, test ve PR işi isolated worktree'de yapılır.

Her `GO-IMPLEMENT`, `GO-HOTFIX` veya `GO-COMPLETE` dosya değişikliğinden önce ajan:

1. Current directory doğrular.
2. Current branch doğrular.
3. Canonical root içinde olduğunu tespit ederse implementasyonu durdurur.
4. `origin/main` tabanlı fresh isolated worktree oluşturur.
5. Dosya editini, branch commit'ini, testleri ve PR hazırlığını yalnız isolated worktree içinde yapar.

Yasak:

- canonical root içinde PR branch'i oluşturmak
- canonical root içinde dosya editleri yapmak
- canonical root'u implementation workspace olarak kullanmak
- unrelated active branch'lere veya worktree'lere dokunmak
- fiziksel worktree dizinlerini recursive delete ile silmek

## Required Pre-Analysis

Her görevde önce güncel repository gerçeği doğrulanır; önceki konuşma veya oturum hafızası güncel branch, HEAD, dosya içeriği, PR/CI/merge durumu veya governance kaydı için otorite sayılmaz.

Kod yazmadan önce en az şu başlıklar değerlendirilir:

- Çağıran yerler
- Impact Scope
- Multitenant etkisi
- Tablo ilişkileri
- Schema etkisi
- Migration etkisi
- Runtime etkisi
- Güvenlik etkisi
- Mevcut mimariyle uyumu

## Authority Modes

```text
UNKNOWN / AMBIGUOUS
↓
Read-only kal
Mutation yapma
```

```text
GO-ANALYZE
↓
ANALYZE
REPORT
STOP
```

Explicit read-only moddur; dosya değişikliği, commit, PR veya merge yoktur.

```text
GO-IMPLEMENT
↓
ANALYZE
IMPLEMENT
VERIFY
REPORT
STOP
```

Local patch + validation ile sınırlıdır. Commit, push, PR ve merge yalnız task
brief ayrıca kapsıyorsa yapılır.

```text
GO-COMPLETE — ANALYZE-FIRST CONDITIONAL EXECUTION
↓
ANALYZE
IF IMPLEMENT
IMPLEMENT
VERIFY
COMMIT
PUSH
PR
CI
IF GO-COMPLETE
SQUASH-MERGE
MAIN SYNC
CLEANUP
FINAL VERIFICATION
CLOSE
```

Implementation-eligible görevlerde tercih edilen brief biçimi `GO-COMPLETE — ANALYZE-FIRST`tır. Analiz ayrı teslim veya zorunlu owner turu değildir.

`IF IMPLEMENT` yalnız root cause doğrulanmış, çözüm aynı task objective ve bounded context içinde, canonical governance ile uyumlu, yeni owner semantiği gerektirmeyen, minimum güvenli patch/validation belirlenmiş, owner WIP/competing writer collision olmayan ve task brief dışında production/destructive işlem gerektirmeyen durumda PASS olur. Gate fail ise yalnız exact blocker için durulur.

`IF GO-COMPLETE` yalnız local validation ve required CI PASS, changed paths exact authorized scope, PR CLEAN/MERGEABLE, unexpected file/semantic conflict/merge conflict/active writer collision NONE ise PASS olur. Ex-ante `IF GO-COMPLETE` owner authority merge için yeterlidir; CI sonrasında ikinci owner mesajı istenmez. Bu standing/unattended GitHub auto-merge, scheduler veya reusable merge grant'i değildir.

Owner kararı yalnız yeni hukuki/finansal/domain/product semantiği, farklı davranış üreten birden çok makul seçenek, bounded-context/temel mimari değişikliği, task dışı schema/migration/backfill/live DB/production/cutover, destructive/data-loss/legacy removal, owner WIP mutation, canonical/semantic conflict, gerçek task-objective dışı scope expansion veya çözülemeyen CI/security/technical risk için istenir.

Aynı root cause ve bounded context içindeki supporting dosya, focused test/fixture/mock, mevcut mimarideki minimum tercih, kendi patch'inin validation düzeltmesi ve task'e doğrudan bağlı documentation/reference alignment ayrıca owner onayı gerektirmez. İlgisiz finding immediate security/data-loss/corruption riski taşımıyorsa evidence ile backlog adayı olarak ayrılır; task'e gizlice eklenmez ve task'i durdurmaz.

## Lane Ownership: Analysis Owner ≠ Implementation Owner

Analiz/review sahipliği ile implementation/execution sahipliği farklı kavramlardır; biri
diğerini ima etmez. Bir workstream'in analizini bir ajanın yapmış olması implementation
lane'inin de o ajanda olduğu anlamına gelmez; tersi de geçerlidir (ör. Analysis: Claude /
Implementation: Codex veya Analysis: Codex / Implementation: Claude).

- Her workstream, lane kararı ve execution-lane governance kaydında iki sahiplik ayrı ve
  açık yazılır:

```text
Analysis / Review Owner : <ajan>
Implementation Owner    : <ajan>
```

- Lane devri normaldir ve ayrı owner kararıyla kaydedilir; devredilen eski kayıt gerçekleşmiş
  owner kararı olarak silinmez, `SUPERSEDED BY <yeni kayıt>` işaretlenir.

Kaynak: COL/OD-18A (`decision-log.md` § `2026-07-15 — RC-COL / COL/OD-18A`).

## Approval Reporting Semantics

- `GO-ANALYZE` ve bounded `GO-IMPLEMENT` kendi tesliminde durur; yalnız yeni owner kararı veya authority gerekiyorsa `Onay Bekleniyor: YES` yazılır.
- Açık `IF GO-COMPLETE` owner yetkisiyle yürüyen zincirin sonunda stop condition yoksa `Onay Bekleniyor: NO` yazılır; çünkü kullanıcı baştan operasyon zincirini tamamlama yetkisi vermiştir.
- `GO-COMPLETE` sırasında stop condition varsa `Onay Bekleniyor: YES` yazılır; çünkü kullanıcı kararı gerekir.

## Waiting & Progress Policy

Bir görev dışsal bir bağımlılıkla (CI, başka worktree'nin WIP'i, PR review, owner deploy/karar bekleyişi) bloklandığında ajan doğrudan pasif beklemeye geçmez; önce onaylı kapsam içinde güvenli ilerlemeyi maksimize eder. Tam politika ve üç katmanlı model (Active Progress / Parallel Preparation / Passive Wait) için bkz. `docs/adr/ADR-012-WAITING-PROGRESS-POLICY.md`. Bu bölüm ile aşağıdaki CI WAIT / POLLING RULE arasında çelişki yoktur: ADR-012 yalnız "beklerken ne yapılır"ı tanımlar, "ne zaman durulur" aşağıdaki kuralda aynen geçerlidir.

## CI WAIT / POLLING RULE

Bu kural yalnız açık `IF GO-COMPLETE` owner yetkisi içeren görevler için geçerlidir. `GO-ANALYZE` ve bounded `GO-IMPLEMENT` kendi tesliminde durur. CI bekleme zinciri standing/unattended auto-merge anlamına gelmez; task-specific owner-authorized conditional merge, gate'ler PASS olduğunda zincirin yetkili parçasıdır.

`IF GO-COMPLETE` sırasında CI durumu `IN_PROGRESS` ise ajan hemen kullanıcıya dönmez. CI durumunu otomatik olarak belirli aralıklarla yeniden kontrol eder.

- Önerilen polling aralığı: 60 saniyede bir.
- Önerilen maksimum bekleme: 20 dakika.
- Bu süre içinde CI `SUCCESS` olursa GO-COMPLETE zinciri devam eder; merge → cleanup → main sync → final verification → checkpoint tamamlanır.
- CI `FAIL` olursa ajan durur, merge yapmaz, cleanup yapmaz ve `Onay Bekleniyor: YES` yazar.
- CI 20 dakika sonunda hâlâ `IN_PROGRESS` ise ajan durur, merge yapmaz, cleanup yapmaz, timeout raporu verir ve `Onay Bekleniyor: YES` yazar.
- CI bitmediği için `mergeStateStatus` `BLOCKED` ise bu tek başına stop condition sayılmaz; CI tamamlandıktan sonra `mergeStateStatus` yeniden sorgulanır.
- CI bittikten sonra `mergeStateStatus` `CLEAN` değilse ajan durur, merge yapmaz, cleanup yapmaz ve `Onay Bekleniyor: YES` yazar.
## Stop Conditions

- CI başarısız
- Merge conflict
- Scope değişti
- Mimari değişti
- Beklenmeyen dosyalar oluştu
- Schema değişti
- Migration değişti
- Güvenlik riski oluştu
- Kullanıcı kararı gerekiyor
- Yeni Product Backlog oluştu
- Active Roadmap değişmeli
- Beklenmeyen teknik risk oluştu

## Backlog Review

Her faz sonunda Backlog Review zorunludur. Bağımlılığı tamamlanan maddeler için `BACKLOG → READY` önerisi raporlanır.

## Required Report Ending

```text
══════════════════════════════

NEXT RECOMMENDED STEP

Aktif Faz:

Önerilen Sonraki İş:

Backlog Review Gerekli mi?
YES / NO

READY Durumuna Geçen Maddeler:

Yeni Eklenen Product Backlog Maddeleri:

Bekleyen Mimari Kararlar:

══════════════════════════════
```

## Worktree / Branch Cleanup Safety

Windows junction + pnpm hardlink/store + çoklu oturum nedeniyle worktree/branch temizliği bağlayıcı kurallara tabidir. Detay: `docs/runbooks/worktree-cleanup.md`.

**Yasak (kesin):** `cmd rd /s /q` · PowerShell `Remove-Item -Recurse` · `rm -rf <worktree>` · `[System.IO.Directory]::Delete(path,true)` · `.git/config` elle rewrite · paralel branch/worktree/config mutasyonu. (Hepsi junction/hardlink'i takip edip canonical'ı sessizce bozabilir veya config torn-write üretir; reparse audit "temiz" dese bile risk kalır.)

**Worktree kaldırma:** YALNIZ `git worktree remove --force <path>` → `git worktree prune`. "Directory not empty" (node_modules) kalırsa fiziksel silme YOK → `ORPHANED_WORKTREE_DIR` olarak raporla, owner manuel temizler.

**Branch kaldırma:** önce gh ile PR-merged + açık-PR-yok doğrula (squash-merge git ancestry'yi bozar → GitHub PR state esas). Sonra `git branch -D` (local) + `git push origin --delete` (remote). Branch ops junction-risksizdir.

**Her cleanup sonrası canonical integrity check ZORUNLU:** git status · `git config --list` parse · origin/main==local main · root/apps-api/apps-web `node_modules/.bin` sayıları · nest/prisma/jest/tsc/next shim · owner `HUKUK_main_dev` .bin · pnpm store. Bozulma → `pnpm install --force`; asla sessiz geçme.

**`.git/config` torn-write:** `bad config line` = stop condition. Read-only teşhis → bekle+tekrar-oku (paralel oturum kendiliğinden onarabilir) → onarılmazsa owner manuel. Ajan `.git/config` rewrite ETMEZ.

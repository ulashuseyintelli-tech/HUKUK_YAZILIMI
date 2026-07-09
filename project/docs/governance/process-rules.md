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
GO-ANALYZE
↓
Yalnız analiz
Yalnız rapor
Kod yok
```

```text
GO-IMPLEMENT
↓
Kod / dokümantasyon değişikliği
Test / validation
CI gerekiyorsa çalıştır
Dur
Merge yok
Commit/PR yalnız ayrıca istenirse yapılır
```

```text
GO-COMPLETE
↓
Kod / dokümantasyon değişikliği
Test
CI
Merge
Remote Branch Cleanup
Local Branch Cleanup
Worktree Cleanup
Main Sync
Final Verification
Checkpoint
NEXT RECOMMENDED STEP
Dur
```

GO-COMPLETE implementasyon ve validation zinciridir. Commit, push, PR, CI, merge, main sync, remote branch cleanup, local branch cleanup, worktree cleanup, final verification ve checkpoint yalnız görev brief'i açık `IF GO-COMPLETE` owner yetkisi içeriyorsa tek operasyon sayılır. Tool/system guardrail merge'i bloklarsa veya PR'a özgü açık yetki gerektirirse ajan durur ve owner'dan açık yetki ister. Aksi halde CI PASS ve `mergeStateStatus` CLEAN sonrası stop condition oluşmadıysa ajan zincir içinde tekrar onay istemez. Bu zincirde `Onay Bekleniyor: YES` yazılmaz. Yalnız stop condition oluşursa ajan durur, sebebi raporlar ve `Onay Bekleniyor: YES` yazar.

## Approval Reporting Semantics

- `GO-ANALYZE` sonunda `Onay Bekleniyor: YES` yazılır; çünkü analizden sonra kullanıcı karar verir.
- `GO-IMPLEMENT` sonunda `Onay Bekleniyor: YES` yazılır; çünkü commit / PR / merge için kullanıcı karar verir.
- Açık `IF GO-COMPLETE` owner yetkisiyle yürüyen zincirin sonunda stop condition yoksa `Onay Bekleniyor: NO` yazılır; çünkü kullanıcı baştan operasyon zincirini tamamlama yetkisi vermiştir.
- `GO-COMPLETE` sırasında stop condition varsa `Onay Bekleniyor: YES` yazılır; çünkü kullanıcı kararı gerekir.

## CI WAIT / POLLING RULE

Bu kural yalnız açık `IF GO-COMPLETE` owner yetkisi içeren görevler için geçerlidir. `GO-ANALYZE` ve `GO-IMPLEMENT` sonunda ajan kullanıcıya rapor verir; CI bekleme zinciri otomatik merge anlamına gelmez.

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

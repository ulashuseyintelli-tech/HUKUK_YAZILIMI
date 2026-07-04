# Process Rules

Bu dosya AGENTS.md içindeki Agent Operating Standard v1.0'in kısa operasyonel özetidir. Bağlayıcı kaynak AGENTS.md'dir; çelişki halinde AGENTS.md uygulanır.

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

## Required Pre-Analysis

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

GO-COMPLETE verilmişse merge, cleanup, main sync, final verification ve checkpoint tek operasyon sayılır. Kullanıcı bir görev için `GO-COMPLETE` verdiyse ve stop condition oluşmadıysa ajan zincir içinde tekrar onay istemez. Merge, remote branch cleanup, local branch cleanup, worktree cleanup, main sync, final verification ve checkpoint bu zincirde tek operasyonel bütündür. Bu zincirde `Onay Bekleniyor: YES` yazılmaz. Yalnız stop condition oluşursa ajan durur, sebebi raporlar ve `Onay Bekleniyor: YES` yazar.

## Approval Reporting Semantics

- `GO-ANALYZE` sonunda `Onay Bekleniyor: YES` yazılır; çünkü analizden sonra kullanıcı karar verir.
- `GO-IMPLEMENT` sonunda `Onay Bekleniyor: YES` yazılır; çünkü commit / PR / merge için kullanıcı karar verir.
- `GO-COMPLETE` sonunda stop condition yoksa `Onay Bekleniyor: NO` yazılır; çünkü kullanıcı baştan operasyon zincirini tamamlama yetkisi vermiştir.
- `GO-COMPLETE` sırasında stop condition varsa `Onay Bekleniyor: YES` yazılır; çünkü kullanıcı kararı gerekir.

## CI WAIT / POLLING RULE

Bu kural yalnız `GO-COMPLETE` için geçerlidir. `GO-ANALYZE` ve `GO-IMPLEMENT` sonunda ajan kullanıcıya rapor verir; CI bekleme zinciri otomatik merge anlamına gelmez.

`GO-COMPLETE` sırasında CI durumu `IN_PROGRESS` ise ajan hemen kullanıcıya dönmez. CI durumunu otomatik olarak belirli aralıklarla yeniden kontrol eder.

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
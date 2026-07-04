# Runbook: Worktree Cleanup & Git Safety (Windows + pnpm + çoklu oturum)

**Status:** Active · **Owner:** Platform · **Son güncelleme:** 2026-06-29

Bu runbook HUKUK_YAZILIMI repo'sunda biriken git worktree'lerinin ve merged branch'lerin GÜVENLİ temizliği için bağlayıcı operasyon prosedürüdür. Windows junction + pnpm hardlink/store yapısı ve çoklu Claude/Codex oturumu nedeniyle naif recursive silme canonical repoyu sessizce bozabilir. Normatif özet `process-rules.md`'dedir; bağlayıcı kaynak AGENTS.md.

## Neden bu runbook var (incident geçmişi)

- **2026-06-27/28:** worktree cleanup'ta `cmd /c rmdir /s /q` worktree node_modules'ı silerken canonical `apps/api/node_modules/.bin`'i 30→0 yaptı (`nest`/`tsc`/`prisma` shim'leri gitti → `nest build` "'nest' is not recognized"). Reparse audit "0 dış-hedef" gösterse BİLE oldu; mekanizma reparse-follow değil pnpm **store/hardlink** paylaşımı. Onarım `pnpm install --force` (+ ağır durumda store prune + reinstall).
- **2026-06-29:** aynı `cmd rd /s /q` 4 worktree'de canonical'ı bozMADI (apps/api .bin=30 korundu) — AMA bu kuralı çürütmez: **bozulma deterministik değil.** Bu yüzden `cmd rd` ve tüm recursive fiziksel silme YASAK.
- **`.git/config` torn-write:** iki oturum aynı anda branch/worktree/config yazınca "bad config line N" → tüm yerel git bloke. 2× gözlendi; paralel oturumun sonraki temiz yazımıyla kendiliğinden onarıldı.

## Yasak komutlar (KESİN — istisna yok)

- `cmd /c rd /s /q <dir>` / `rmdir /s /q`
- PowerShell `Remove-Item -Recurse [-Force]`
- `rm -rf <worktree>` (git bash)
- `[System.IO.Directory]::Delete(path, $true)` (.NET recursive)
- `.git/config` dosyasını elle rewrite (Write / sed / echo / Out-File)
- Aynı anda paralel `git worktree add/remove` · `git branch` · `git config` · upstream-set mutasyonu (torn-write riski)

Gerekçe: bunların hepsi ya junction/hardlink'i takip edip canonical'ı bozabilir, ya da config torn-write üretir. Audit "temiz" dese bile risk kalır (hardlink mekanizması audit'in dışındadır).

## Güvenli komutlar

- `git worktree list --porcelain` (envanter)
- `git worktree remove --force <path>` (TEK izinli worktree kaldırma)
- `git worktree prune`
- `git branch -D <branch>` (local; squash-merge teyitliyse)
- `git push origin --delete <branch>` (remote; merged + açık-PR-yok teyitli)
- `git fetch --prune`
- Read-only audit: `git -C <wt> status --porcelain` · `Get-Item -Force` · `fsutil reparsepoint query`
- (yalnız owner, link-only) `[System.IO.Directory]::Delete(<junction>, $false)` (hedefi korur)

## Worktree sınıflandırması

Her worktree silmeden önce şu sınıflardan birine konur:

| Sınıf | Tanım | Aksiyon |
|---|---|---|
| ACTIVE_OWNER | canonical `HUKUK_YAZILIMI` (main sync/verify) · `HUKUK_main_dev` (:3002 dev server) | DOKUNMA |
| ACTIVE_CODEX | branch `codex/*` (+ `*-mainbase`/`*-research` türevleri) | DOKUNMA |
| ACTIVE_CLAUDE_WIP | clean değil ∨ açık PR ∨ HEAD origin'de değil + güncel commit | DOKUNMA |
| DIRTY_KEEP | uncommitted/untracked iş var | DOKUNMA |
| UNKNOWN_KEEP | sahibi/merge durumu belirsiz (özellikle detached, branch yok) | DOKUNMA |
| DETACHED_VERIFY_CANDIDATE | benim açtığım detached verify worktree (origin/main snapshot, iş bitti) | aday (remove --force) |
| MERGED_CLAUDE_CLEANUP_CANDIDATE | clean ∧ Claude-sahipli ∧ PR-merged ∧ açık-PR-yok | per-branch gh-verify SONRA aday |
| SAFE_REMOVE_CANDIDATE | yukarıdaki doğrulamalar geçti | remove --force |
| ORPHANED_WORKTREE_DIR | `remove --force` "Directory not empty" bıraktı | RAPORLA, fiziksel silme YOK, owner kararı |

## Prosedür

### 0. Ön koşullar
- Başka oturum aktif git-mutasyonu yapıyor olabilir → tek-yazıcı (aşağıda). Riskli cleanup öncesi koordinasyon.
- `git fetch --prune` + canonical health (bkz. checklist) ÖNCE.

### 1. Branch cleanup (junction-RİSKSİZ; önce bunu yap)
1. PR durumu: `gh pr view <#> --json state,mergedAt` → MERGED + `mergedAt != null`. **Squash-merge git ancestry'yi BOZAR → `git merge-base --is-ancestor` GÜVENİLMEZ; GitHub PR state esastır.**
2. Açık PR yok: `gh pr list --state open --head <branch>` → 0.
3. Local: `git branch -D <branch>` (worktree çekili değilse; squash→ -d reddeder, -D kullan).
4. Remote: `git push origin --delete <branch>`.

### 2. Worktree cleanup (junction-RİSKLİ)
1. Sınıflandır (yukarıdaki tablo). Yalnız SAFE_REMOVE_CANDIDATE / DETACHED_VERIFY_CANDIDATE.
2. `git -C <path> status --porcelain` → clean olmalı.
3. `git worktree remove --force <path>`.
   - **SUCCESS** → `git worktree prune`.
   - **"Directory not empty"** (node_modules junction) → **DUR.** ORPHANED_WORKTREE_DIR olarak işaretle. Fiziksel dizini SİLME. node_modules orphan kalır (disk-only, zararsız). Owner manuel temizler (cmd rd + ANINDA integrity-check) — AJAN YAPMAZ.
4. PREVENTİF: temizlenecek/kısa-ömürlü worktree'de gate gerekmiyorsa `pnpm install` YAPMA → node_modules yok → remove temiz, risk yok.

### 3. Canonical integrity check (her cleanup SONRASI — ZORUNLU)
```text
□ git status            (hatasız çalışıyor)
□ git config --list     (.git/config parse OK)
□ origin/main == local main
□ project/node_modules/.bin                 ~12 giriş
□ project/apps/api/node_modules/.bin        ~30 giriş   ← incident metriği
□ project/apps/web/node_modules/.bin        ~24 giriş
□ shim'ler: nest · prisma · jest · tsc · next
□ owner HUKUK_main_dev apps/web .bin sağlam (:3002 etkilenmedi)
□ pnpm store mevcut (~/AppData/Local/pnpm/store/v10)
```
Bozulma → `pnpm install --force` (relink). Store dosyaları eksikse → owner-onaylı temiz reinstall (store prune + install). **Asla sessiz geçme.**

### 4. `.git/config` torn-write recovery
- **Tek-yazıcı kuralı:** aynı anda yalnız BİR oturum branch/worktree/config mutasyonu yapsın (read-only paralel olabilir).
- **Stop condition:** `fatal: bad config line N` / `bad config` → DUR, git mutasyonu yapma.
- **Teşhis (read-only):** `.git/config`'i OKU (Read), bozuk satırı tespit et (genelde boşluk çöpü / yarım section).
- **Onarım:** ÖNCE bekle + tekrar oku — paralel oturumun sonraki temiz yazımı çoğu kez kendiliğinden onarır. Onarılmazsa → **OWNER manuel** (ajan `.git/config` rewrite ETMEZ; güvenlik sınıflandırıcısı da bunu bloke eder).

## Final report format (cleanup yapan ajan HER ZAMAN raporlar)
```text
- Silinen remote branch'ler
- Silinen local branch'ler
- Kaldırılan worktree'ler
- ORPHANED kalan dizinler (owner manuel)
- Korunan owner/codex/WIP worktree'leri
- Canonical integrity check sonucu (yukarıdaki 9 kalem)
- .git/config durumu
- Kalan cleanup borçları
```

## Referanslar
- `process-rules.md` (normatif özet) · `decision-log.md` · `architecture-index.md` · AGENTS.md (Repository discipline / Worktree Isolation Protocol).

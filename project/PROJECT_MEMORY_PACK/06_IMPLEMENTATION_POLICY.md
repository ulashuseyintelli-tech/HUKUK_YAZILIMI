# 06 — IMPLEMENTATION POLICY (Navigation)

```text
Status                        : CANONICAL HANDOFF (navigation layer)
Version                       : v1.0
Generated From Canonical Main : c7f55da4 (origin/main @ 2026-07-15)
Purpose                       : Kod ve teslimat disiplinini kaydetmek
Scope                         : Implementation disiplini özeti; bağlayıcı kaynak AGENTS.md + process-rules + SYS-MIG/SYS-SOT
Authority                     : NONE (navigation). Bağlayıcı: AGENTS.md, process-rules.md, SYSTEM-CONSTITUTION (SYS-MIG-*, SYS-SOT-*), runbooks/worktree-cleanup.md
Source Documents              : AGENTS.md, process-rules.md, SYSTEM-CONSTITUTION.md, project/docs/runbooks/worktree-cleanup.md, canonicalization-policy.md
Supersedes                    : NONE
Update Policy                 : Kaynak politikalar değişince güncellenir.
```

> **Layer:** CANONICAL NAVIGATION / HANDOFF LAYER — bağlayıcı kaynak `AGENTS.md` + `process-rules.md` + `SYSTEM-CONSTITUTION`.

## Worktree / branch disiplini

- **Isolated worktree:** her implementasyon `origin/main` tabanlı ayrı worktree + ayrı branch'te yapılır.
- **Canonical root'ta implementasyon YASAK:** canonical project root yalnız read-only doğrulama, final main sync ve register verification içindir; PR branch'i orada açılmaz, dosya editlenmez.
- **Cleanup güvenliği:** recursive fiziksel silme (`rm -rf`, `Remove-Item -Recurse`, `cmd rd /s /q`, `.NET Directory.Delete(path,true)`) YASAK. Yalnız `git worktree remove --force` + `git worktree prune`. "Directory not empty" (node_modules) → fiziksel silme YOK → `ORPHANED_WORKTREE_DIR` olarak `maintenance-register.md`'ye kaydet, owner manuel temizler. Detay: `project/docs/runbooks/worktree-cleanup.md`.
- **Branch silme:** önce `gh` ile PR-merged + açık-PR-yok doğrula (squash-merge git ancestry'yi bozar → GitHub PR state esas), sonra `git branch -D` + `git push origin --delete`.

## Değişiklik ilkeleri (SYS-MIG / SYS-SOT)

- Additive-first · backward compatibility varsayılan · shadow-first (SHADOW/read-only, primary/write'tan önce) · read-only foundation · feature flag (opsiyonel-DI + fail-closed fallback) · dual-write geçici+süreli · no-guess + idempotent backfill · read ve write ayrı cutover · cutover açık owner gate ister.
- **Primary / shadow / legacy ayrımı** her zaman açıkça etiketlenir; aynı fact için iki production primary olamaz.
- **Fail-closed unresolved:** gerçek fact yoksa/çelişkiliyse işlem fail-closed olur; tahminle doldurulmaz.

## Test / doğrulama disiplini

- **Disposable Docker Postgres** container'da migration + integration/DB-gated test; production/local-dev DB'ye karşı test YOK.
- **Tenant-boundary testleri** zorunlu; batch ownership doğrulaması.
- **CI required checks:** Architectural Guardrails · Test Suite · Web Tests (vitest) · Client Workspace Live Smoke. Silent-skip YASAK; check'lerin gerçekten tamamlandığı loglardan doğrulanır.
- **Migration doğrulaması:** disposable container'da tam migration replay + apply + `\d` şema denetimi.

## Kapanış zinciri (GO-COMPLETE)

canonical main sync → **4-way SHA** (local HEAD · local main · origin/main · GitHub remote main hepsi eşit) → remote+local branch cleanup → worktree cleanup → canonical integrity check (git status · `git config --list` parse · origin/main==local main · node_modules/.bin sayıları · pnpm store) → checkpoint. Bozulma → `pnpm install --force`; sessiz geçme YOK.

## AI / ajan sınırı

- Hukuki eşik/kategori İCAT ETMEZ.
- Finansal/hukuki fact TAHMİN ETMEZ.
- Owner yerine karar VERMEZ.
- Gerçek fact yoksa `UNRESOLVED` bırakır (fail-closed).
- Sohbet hafızası/bayat kopya authority değildir; gerçek her görevde repo/git/governance/PR-CI'dan yeniden doğrulanır.

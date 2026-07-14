# 03 — OPERATING MODEL (Navigation)

```text
Status                        : CANONICAL HANDOFF (navigation layer)
Version                       : v1.0
Generated From Canonical Main : c7f55da4 (origin/main @ 2026-07-15)
Purpose                       : Session protocol + yürütme disiplini + çalışma modlarını kaydetmek
Scope                         : Operasyonel disiplin özeti; bağlayıcı kaynak AGENTS.md + process-rules.md
Authority                     : NONE (navigation). Bağlayıcı: AGENTS.md, project/docs/governance/process-rules.md
Source Documents              : AGENTS.md, process-rules.md, GOVERNANCE-INDEX.md
Supersedes                    : NONE
Update Policy                 : AGENTS.md/process-rules.md değişince güncellenir.
```

> **Layer:** CANONICAL NAVIGATION / HANDOFF LAYER — bağlayıcı kaynak `AGENTS.md` + `process-rules.md`.

## Session state header (her material yanıtta)

```text
CURRENT PROGRAM · CURRENT PHASE · CURRENT WAVE · CURRENT WORKSTREAM · CURRENT TASK
OPEN ITEMS · WAITING FOR OWNER AUTHORIZATION
```
Büyük/uzun-ömürlü işlerde Session Initialization: Repository State · Execution Context · Context Drift · Concurrent Activity · Ready/Not Ready. Bu özet sohbeti değil, güncel repo gerçeğini esas alır (AGENTS.md).

## Çalışma modları

- **GO-ANALYZE:** salt-okuma analiz + rapor. Dosya değişikliği/commit/push/merge YOK.
- **GO-DOCS:** yalnız dokümantasyon değişikliği (+ ilgili validation). Merge yalnız açıkça istenirse.
- **GO-IMPLEMENT:** kapsam içinde kod/doküman değişikliği + validation + rapor. Commit/push/merge YOK (ayrıca istenmedikçe).
- **GO-COMPLETE:** kod/doküman + test + CI + merge + remote/local branch cleanup + worktree cleanup + main sync + final verification + checkpoint = tek operasyonel bütün. Stop condition yoksa zincir içinde tekrar onay istenmez (`Onay Bekleniyor: NO`).

## Yürütme disiplini

- **Owner workstream seçer.** Ajan sonraki işi kendiliğinden SEÇMEZ ve açık owner GO olmadan açmaz.
- **Active task kapanmadan sonraki task açılmaz.**
- **Bounded-context sınırı:** ajan yalnız yetkilendirilen domain/task kapsamında çalışır; sınır dışına çıkmaz.
- **Isolated worktree:** her implementasyon origin/main tabanlı ayrı worktree+branch'te; canonical root'ta implementasyon yapılmaz (bkz [06_IMPLEMENTATION_POLICY.md](06_IMPLEMENTATION_POLICY.md)).

## Stop conditions (process-rules)

CI başarısız · merge conflict · scope değişti · mimari değişti · beklenmeyen dosya · schema/migration değişti · güvenlik riski · kullanıcı kararı gerekiyor · yeni Product Backlog · Active Roadmap değişmeli · beklenmeyen teknik risk. Herhangi biri → dur + raporla + `Onay Bekleniyor: YES`.

## Conflict / CI / runtime failure davranışı

- **CI (yalnız GO-COMPLETE):** IN_PROGRESS ise ~60 sn'de bir, en fazla 20 dk kontrol; SUCCESS → zincir devam; FAIL/timeout → dur. CI bitmeden `mergeStateStatus: BLOCKED` tek başına stop condition değildir; CI bitince yeniden sorgulanır. CI sonrası `mergeStateStatus` CLEAN değilse dur.
- **Merge conflict / source conflict / kapsam dışı değişiklik:** dur, raporla.
- **`.git/config` torn-write / runner incident:** bounded-wait; bypass YOK.

## IF GO-COMPLETE otomatik zinciri

commit → push → PR → CI izleme → (SUCCESS + CLEAN) squash merge → canonical main sync → 4-way SHA doğrulama → remote+local branch cleanup → worktree cleanup → canonical integrity check → checkpoint. Tek operasyonel bütün; stop condition yoksa tekrar onay istenmez.

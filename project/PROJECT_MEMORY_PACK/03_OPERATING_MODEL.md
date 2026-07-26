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

- **UNKNOWN / AMBIGUOUS:** read-only kalır; mutation YOK.
- **GO-ANALYZE:** explicit salt-okuma `ANALYZE → REPORT → STOP`. Dosya değişikliği/commit/push/PR/merge YOK.
- **GO-DOCS:** yalnız dokümantasyon değişikliği (+ ilgili validation). Merge yalnız açıkça istenirse.
- **GO-IMPLEMENT:** `ANALYZE → IMPLEMENT → VERIFY → REPORT → STOP`; local patch + validation. Commit/push/PR/merge yalnız brief ayrıca kapsıyorsa.
- **GO-COMPLETE — ANALYZE-FIRST:** implementation-eligible görevlerde tercih edilen tam model: `ANALYZE → IF IMPLEMENT → IMPLEMENT → VERIFY → COMMIT → PUSH → PR → CI → IF GO-COMPLETE → SQUASH-MERGE → MAIN SYNC → CLEANUP → FINAL VERIFICATION → CLOSE`. Ex-ante `IF GO-COMPLETE` owner authority varsa ve gate'ler PASS ise CI sonrası ikinci onay istenmez (`Onay Bekleniyor: NO`).

## Yürütme disiplini

- **Owner workstream seçer.** Ajan sonraki işi kendiliğinden SEÇMEZ ve açık owner GO olmadan açmaz.
- **Active task kapanmadan sonraki task açılmaz.**
- **Bounded-context sınırı:** ajan yalnız yetkilendirilen domain/task kapsamında çalışır; sınır dışına çıkmaz. Aynı root cause için doğrudan gerekli supporting dosya/test/fixture/mock ve validation düzeltmesi scope expansion değildir; farklı product outcome/domain/architecture/migration/production/destructive iş gerçek scope expansion'dır.
- **Owner gate:** yeni hukuki/finansal/domain/product semantiği, davranışsal seçenek, architecture/bounded-context değişimi, task dışı production/data/destructive işlem, owner WIP mutation, semantic conflict veya çözülemeyen risk için durulur. İlgisiz finding acil security/data-loss/corruption riski yoksa backlog adayı olarak ayrılır ve aktif task'i durdurmaz.
- **Isolated worktree:** her implementasyon origin/main tabanlı ayrı worktree+branch'te; canonical root'ta implementasyon yapılmaz (bkz [06_IMPLEMENTATION_POLICY.md](06_IMPLEMENTATION_POLICY.md)).

## Stop conditions (process-rules)

CI başarısız · merge conflict · scope değişti · mimari değişti · beklenmeyen dosya · schema/migration değişti · güvenlik riski · kullanıcı kararı gerekiyor · yeni Product Backlog · Active Roadmap değişmeli · beklenmeyen teknik risk. Herhangi biri → dur + raporla + `Onay Bekleniyor: YES`.

## Conflict / CI / runtime failure davranışı

- **CI (yalnız GO-COMPLETE):** IN_PROGRESS ise ~60 sn'de bir, en fazla 20 dk kontrol; SUCCESS → zincir devam; FAIL/timeout → dur. CI bitmeden `mergeStateStatus: BLOCKED` tek başına stop condition değildir; CI bitince yeniden sorgulanır. CI sonrası `mergeStateStatus` CLEAN değilse dur.
- **Merge conflict / source conflict / kapsam dışı değişiklik:** dur, raporla.
- **`.git/config` torn-write / runner incident:** bounded-wait; bypass YOK.

## IF GO-COMPLETE otomatik zinciri

ANALYZE → IF IMPLEMENT → IMPLEMENT → VERIFY → commit → push → PR → CI izleme → IF GO-COMPLETE → (SUCCESS + CLEAN + exact scope + no conflict) squash merge → canonical main sync → 4-way SHA doğrulama → remote+local branch cleanup → worktree cleanup → canonical integrity check → CLOSE. Bu task-specific owner-authorized conditional merge'dir; standing GitHub auto-merge/scheduler/reusable grant değildir. Stop condition yoksa tekrar onay istenmez.

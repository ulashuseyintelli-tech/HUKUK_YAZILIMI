# 02 — PHASE SYSTEM (Navigation)

```text
Status                        : CANONICAL HANDOFF (navigation layer)
Version                       : v1.0
Generated From Canonical Main : c7f55da4 (origin/main @ 2026-07-15)
Purpose                       : Bugüne kadar fiilen uygulanan çalışma metodolojisini (aşama sistemi) kayda geçirmek
Scope                         : Metodoloji özeti; yeni metodoloji/karar üretmez
Authority                     : NONE (navigation). Bağlayıcı: AGENTS.md, process-rules.md, GOVERNANCE-INDEX.md, DEBTOR-PHASE-0-COMPLETION-ROADMAP.md
Source Documents              : project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md, DEBTOR-GOVERNANCE.md §8,
                                project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md, process-rules.md
Supersedes                    : NONE
Update Policy                 : Aşama tanımları değişmez; yalnız fiili aşama ilerleyince statü güncellenir.
```

> **Layer:** CANONICAL NAVIGATION / HANDOFF LAYER — yeni metodoloji üretmez.

## Nihai çalışma metodolojisi (fiili akış)

```text
AUDIT → GOVERNANCE → OWNER DECISIONS → PHASE 0 FOUNDATION
      → PHASE 0 COMPLETION ROADMAP → PHASE 1 BLUEPRINT → IMPLEMENTATION
```

| Aşama | Amaç | Giriş kriteri | Çıkış kriteri | İzin verilen çalışma | Owner gate | Sonraki aşamaya geçiş |
|---|---|---|---|---|---|---|
| AUDIT | Mevcut durumu kanıtla tespit | Görev/alan tanımı | Bulgu seti (evidence-classed) | GO-ANALYZE (salt okuma) | — | Owner triage |
| GOVERNANCE | Kararları kanonikleştir | Bulgular | Ratifiye Domain Law / ADR | GO-DOCS | RATIFY / owner-approval | Merge → canonical |
| OWNER DECISIONS | Açık kararları kilitle | Karar noktası | decision-log kaydı | — | owner karar | İlgili workstream açılır |
| PHASE 0 FOUNDATION | Production/legal/security temeli | Kararlar | Wave 0 kapanışı | GO-IMPLEMENT | faz-bazlı GO | Completion Roadmap |
| PHASE 0 COMPLETION ROADMAP | Foundation'ı sentezle/kapat | Wave 0 CLOSED | CLOSED/OWNER-RATIFIED verdict | GO-DOCS | owner ratifikasyon | Phase 1 ELIGIBLE |
| PHASE 1 BLUEPRINT | Hedef mimariyi tasarla | Phase 0 CLOSED + owner GO | Blueprint ratifiye | GO-ANALYZE→GO-DOCS | owner GO per workstream | Execution Plan |
| IMPLEMENTATION | Kodla | Blueprint + execution plan + owner GO | Merge + validation | GO-IMPLEMENT/GO-COMPLETE | owner GO | Sonraki slice |

## Birim ayrımları (kesin)

- **Phase:** en üst program aşaması (ör. Phase 0 Foundation, Phase 1 Blueprint).
- **Wave:** bir Phase içindeki büyük kapanış dilimi (ör. Wave 0 — Production/Legal/Security Foundation).
- **Workstream:** bir konuya bağlı çok-PR'lık iş hattı (ör. MPB-028(a) legal-time, DEBTOR-SCORING-CANON).
- **Task:** tek owner yetkisiyle açılan atomik iş (ör. DBP-01, PR-EA-2).
- **Operational Gate:** bir işin ilerlemesi için karşılanması gereken kanıt kapısı (ör. Representative Evidence Operational Gate). Workstream DEĞİLDİR; bir kanıt/karar kontrolüdür.
- **Wave Gate:** bir Wave'in kapanması için gereken üst-seviye gate (ör. GATE-0/GATE-1/GATE-2). Operational Gate'ten farklıdır: Wave bütününün kapanış koşuludur.

## Mevcut fiili aşama (c7f55da4 itibarıyla)

- Borçlu Phase 0: **CLOSED / OWNER-RATIFIED** (Wave 0, 2026-07-14, PR #1240; GATE-0/1/2 PASS). Bkz [07_BORCLU_PHASE0_COMPLETION_ROADMAP.md](07_BORCLU_PHASE0_COMPLETION_ROADMAP.md).
- Borçlu Phase 1 Blueprint: **OPEN.** DBP-01 (Charter) **CLOSED / CANONICAL**. Bkz [08_BLUEPRINT_GUIDE.md](08_BLUEPRINT_GUIDE.md).
- Sonraki eligible task: **DBP-02** — ELIGIBLE / NOT AUTHORIZED (ayrı owner GO-ANALYZE).

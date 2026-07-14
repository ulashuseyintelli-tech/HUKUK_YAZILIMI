# 09 — NEW WORKSTATION HANDOFF (Navigation)

```text
Status                        : CANONICAL HANDOFF (navigation layer) — YENİ CLAUDE İÇİN İLK OKUMA
Version                       : v1.0
Generated From Canonical Main : c7f55da4 (origin/main @ 2026-07-15)
Purpose                       : Yeni bilgisayardaki Claude için kısa operasyonel başlangıç belgesi
Scope                         : Handoff + ilk okuma sırası + kritik yasaklar
Authority                     : NONE (navigation). Bağlayıcı: AGENTS.md, GOVERNANCE-INDEX.md, SYSTEM-CONSTITUTION.md
Source Documents              : AGENTS.md, GOVERNANCE-INDEX.md, SYSTEM-CONSTITUTION.md, ilgili Domain Law/roadmap/charter, decision-log.md
Supersedes                    : NONE
Update Policy                 : Aktif program/eligible task değişince güncellenir.
```

> **Layer:** CANONICAL NAVIGATION / HANDOFF LAYER. Bu belge rehberdir; **authority underlying canonical belgelerdedir.**

## İlk okuma sırası (zorunlu)

```text
1. AGENTS.md                                   (execution/safety baseline)
2. project/docs/governance/GOVERNANCE-INDEX.md (routing/discovery)
3. project/docs/governance/SYSTEM-CONSTITUTION.md (semantic üst norm)
4. project/PROJECT_MEMORY_PACK/09_NEW_WORKSTATION_HANDOFF.md (bu belge)
5. ilgili domain governance belgesi            (bkz 05_DOMAIN_INDEX.md)
6. ilgili roadmap                              (ör. DEBTOR-PHASE-0-COMPLETION-ROADMAP.md)
7. ilgili blueprint charter                    (DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md)
8. decision-log.md / product-backlog.md / register'lar
```

## Çalışma ortamı

- **Repository (canonical root):** `C:\Users\ulas.htelli\Desktop\HUKUK_PROJE\HUKUK_YAZILIMI` (yeni ofis bilgisayarında karşılığı).
- **Canonical main ilkesi:** güncel gerçek yalnız `origin/main`'dir. Her görevde `git fetch` + repo/git/governance/PR-CI'dan yeniden doğrula.
- Çalışma ortamı **yeni ofis bilgisayarıdır.** Eski PC'nin lokal repo'su geliştirme kaynağı DEĞİLDİR. **GitHub canonical ilerleme kaynağıdır.**
- **Eski sohbetler authority değildir.** Bu Memory Pack rehberdir; bağlayıcı olan underlying canonical belgelerdir.

## Aktif durum (@c7f55da4)

- İlk aktif program: **BORÇLU PLATFORMU / PHASE 1 — CANONICAL DOMAIN BLUEPRINT.**
- İlk eligible task: **DBP-02 — Business Capability & Value Stream Architecture.**
- **DBP-02 owner izni (GO-ANALYZE) olmadan AÇILMAZ.** Ajan sonraki workstream'i kendiliğinden seçmez.
- Borçlu Phase 0: CLOSED/OWNER-RATIFIED. DBP-01: CLOSED/CANONICAL.

## Kritik yasaklar

- **R0.2 governance-integration** worktree'sindeki untracked dosyalara ve **CCB-001 rescue** worktree'sine + diğer owner WIP alanlarına DOKUNMA (owner-gated).
- Untracked/non-canonical dosyaları, scratchpad taslaklarını, superseded içerikleri, merge edilmemiş eski analizleri KAYNAK OLARAK KULLANMA.
- Canonical kaynağı olmayan bilgiyi `SOURCE MISSING` / `NON-CANONICAL HISTORICAL CONTEXT` işaretle; tahminle doldurma.

## Yeni session initialization formatı

```text
CURRENT PROGRAM · CURRENT PHASE · CURRENT WAVE · CURRENT WORKSTREAM · CURRENT TASK
Repository State (git fetch + origin/main SHA) · Context Drift · Concurrent Activity · Ready/Not Ready
OPEN ITEMS · WAITING FOR OWNER AUTHORIZATION
```
Çalışma seviyesi önerisiyle başla (Faster/Normal/High/Ultra). Riskli işte önce plan → onaylı gate → izole worktree.

# 08 — BLUEPRINT GUIDE (Navigation)

```text
Status                        : CANONICAL HANDOFF (navigation layer)
Version                       : v1.0
Generated From Canonical Main : c7f55da4 (origin/main @ 2026-07-15)
Purpose                       : Blueprint'in ne olduğu/olmadığı + Borçlu Blueprint durumu
Scope                         : Blueprint metodolojisi + pointer; yeni blueprint ÜRETMEZ
Authority                     : NONE (navigation). Bağlayıcı: project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md
Source Documents              : DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md (DBP-01, CANONICAL), DEBTOR-GOVERNANCE.md, DEBTOR-PHASE-0-COMPLETION-ROADMAP.md
Supersedes                    : NONE
Update Policy                 : Blueprint work package'ları ilerleyince güncellenir.
```

> **Layer:** CANONICAL NAVIGATION / HANDOFF LAYER — yeni blueprint/karar üretmez.

## Roadmap ≠ Blueprint ≠ Execution

```text
DELIVERY ROADMAP    : nereye / neden / hangi teslim sırasıyla (owner-ratified)
DOMAIN BLUEPRINT    : hedef iş+sistem mimarisi NASIL kurulur (Phase 1)
EXECUTION PLAN      : blueprint → vertical slice / epic / migration / PR / release (sonraki)
```
Blueprint Phase 0'ı yeniden açamaz, roadmap milestone'larını keyfî değiştiremez, implementation backlog değildir, kod/migration SQL üretmez, execution yetkisi doğurmaz.

## Blueprint neyi kapsar

Bounded context · aggregate · entity/value object · domain event · state machine · authority/SoT · integration contract · dependency graph · migration strategy (target vs transitional: EXPAND→BACKFILL→SHADOW/DUAL-WRITE→RECONCILE→CUTOVER→DEPRECATE→CONTRACT) · epic/work package · owner decision gates · test/evidence modeli. **Mevcut kararları yeniden üretmez; normalize/consolidate eder** (mevcut ratifiye kararlar non-negotiable).

## Borçlu Blueprint durumu (@c7f55da4)

- **DBP-01 (Canonical Domain Blueprint Charter): CLOSED / CANONICAL.**
- Canonical charter yolu: **`project/docs/blueprint/DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md`**.
- Charter içeriği (özet): 26 non-negotiable (25 GOVERNANCE-CONFIRMED, DEBTOR-GOVERNANCE INV + SYS-* eşlemeli), 21 blueprint-resolution kararı (BR-01..21) DBP work package + owner gate'e route edildi, 9 mimari katman (L1–L9), work package planı DBP-02..12, dependency + traceability + evidence standardı + 31 zorunlu artefakt + exit kriterleri. **AUTHORITY_CONFLICT yok.**
- **DBP-02 (Business Capability & Value Stream Architecture): ELIGIBLE / NOT AUTHORIZED.** Yeni bilgisayarda **ayrı owner GO-ANALYZE** ile açılır. **Bu görev (PMP-01) kapsamında DBP-02 BAŞLATILMAZ.**
- Foundation order (DEBTOR-GOVERNANCE §8) bağlayıcıdır: DomainEvent v1 / DebtorLegalStatus v1 Party'yi beklemez (MS/DEC-15); Rule-NBA Score'u beklemez (MS/DEC-18); Min Twin NBA'dan önce (MS/DEC-16). İhlal = `AI_NBA_FOUNDATION_ORDER_VIOLATION` (Hard Stop).

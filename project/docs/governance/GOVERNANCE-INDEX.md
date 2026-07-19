# GOVERNANCE INDEX — Okuma Sırası ve Belge Haritası

```text
Belge yolu : project/docs/governance/GOVERNANCE-INDEX.md
Durum      : RATIFIED / CANONICAL
Rol        : Routing/discovery katmanıdır; semantic veya execution authority üretmeden
             görev için hangi canonical kaynağın hangi sırayla okunacağını gösterir.
```

## RELATED DOCUMENTS

- Üst çatı: `project/docs/governance/SYSTEM-CONSTITUTION.md`
- Ajan baseline: `AGENTS.md` (repo kökü) + `CLAUDE.md` (Claude supplement)
- Ratifiye domain governance: `project/docs/governance/DEBTOR-GOVERNANCE.md` ve
  `project/docs/governance/RECEIVABLE-GOVERNANCE.md`
- Collection domain governance: `project/docs/governance/COLLECTION-GOVERNANCE.md`
  (owner-approved canonicalization 2026-07-13; canonical upon approved merge)

## 1. Zorunlu okuma sırası (her yeni görev)

```text
Yeni görev
→ AGENTS.md                                   (execution ve repository-safety authority)
→ GOVERNANCE-INDEX.md                         (routing/discovery; authority değildir)
→ SYSTEM-CONSTITUTION.md                      (system-wide semantic authority)
→ İlgili TÜM RATIFIED / CANONICAL             (cross-domain görevde tek belge seçilmez;
  Domain Law / domain governance               ilgili bütün domain belgeleri okunur)
→ İlgili contract / standard                  (varsa; domain belgesinin RELATED DOCUMENTS listesinden)
→ Architecture Index → ilgili ADR             (architecture-index.md → project/docs/adr/)
→ Canonical split plan                        (varsa)
→ decision-log.md                             (son owner kararları ve supersession kayıtları)
→ Master Register                             (product-backlog.md, master-triage-register.md,
                                               active-roadmap.md — görev ID/durum kontrolü)
→ Pre-implementation consistency check        (scope, authority, invariant, status ve gate kontrolü)
→ Implementation                              (yalnız GO yetkisi + izole worktree ile)
```

`GOVERNANCE-INDEX.md` yalnız routing/discovery katmanıdır; Constitution, Domain Governance,
ADR, owner kararı veya execution izni yerine geçmez. Belge haritasında statüsü açıkça
`RATIFIED` / `CANONICAL` olan domain governance belgeleri binding seçim yüzeyidir.
`PROPOSED`, `DRAFT` veya `OWNER REVIEW` belgeleri kendiliğinden authority üretmez.

Kural: Sıradaki bir belge görev alanıyla ilgisizse atlanabilir. Cross-domain görevde ilgili
tek domain belgesi seçilemez; görevle ilişkili bütün ratified/canonical domain governance
belgeleri ve Master Register birlikte doğrulanır. Yeni domain governance belgesi ratifiye
edilip canonical belge haritasına alındığında aynı discovery kuralına otomatik olarak dahil olur.

Decision Log son owner kararlarını ve supersession kayıtlarını taşır; kayıt tarihi tek başına
üstün norm üretmez. Daha yeni bir Decision Log kaydı açık amendment, ratification veya
supersession olmadan System Constitution'ı ya da ratifiye Domain Governance'ı sessizce
override edemez.

Canonical kaynaklar arasında normatif çelişki tespit edilirse implementation durur ve yalnız
Governance Reconciliation önerilir. Çelişki tespiti tek başına doküman değiştirme, execution,
commit, merge, release veya runtime authority yetkisi oluşturmaz.

## 2. Belge haritası

| Belge | Rol | Durum |
|---|---|---|
| `AGENTS.md` (repo kökü) | agent execution ve repository-safety authority | AKTİF |
| `project/docs/governance/SYSTEM-CONSTITUTION.md` | system-wide semantic authority | RATIFIED / BINDING / CANONICAL; v1.1 RCV-P2-WS04 allocation-authority amendment (2026-07-18) + v1.2 RD01 balance-exposure contract + v1.3 XD-001 legal-application single-writer cross-domain boundary + v1.4 RCV-CLAIM-FORM-P01-R01 ClaimItem formation-admission contract (2026-07-19) |
| `project/docs/governance/GOVERNANCE-INDEX.md` | routing/discovery ve okuma sırası; authority değildir | RATIFIED / CANONICAL |
| `project/docs/governance/DEBTOR-GOVERNANCE.md` | ratifiye Debtor Domain Law | RATIFIED / BINDING / CANONICAL v1.0 (2026-07-12; PR #1139 MERGED) |
| `project/docs/governance/RECEIVABLE-GOVERNANCE.md` | ratifiye Receivable Domain Governance ve tek domain giriş noktası | RATIFIED / BINDING / CANONICAL v1.4; v1.0 baseline (2026-07-12; PR #1145 MERGED) + RCV-P2-WS04 allocation-authority amendment (2026-07-18) + RD01 balance-exposure contract + XD-001 authority boundary + RCV-CLAIM-FORM-P01-R01 formation-admission contract (2026-07-19); ClaimItem source/input ≠ target LegalCalculationBucket application grain; runtime enforcement NOT IMPLEMENTED |
| `project/docs/governance/RCV-PHASE-1-AUTHORIZATION.md` | RCV → CCB-001 identity-only program/register cross-pointer'ı, DEC-0030 disposition'ı, formal phase/workstream/package closure ve owner gate kaydı | CANONICAL / DEC-0030 CLOSED; PHASE 1 CLOSED; WS01–WS03 CLOSED; WS04 OPEN. Historical P01–P03-A closures preserved. P01/P02 AMENDMENT REQUIRED; P03 SUPERSEDED/REDESIGN; P03-A SAFETY INFRASTRUCTURE ONLY; P03-B DO NOT EXECUTE. RD01 exposure contract RATIFIED. XD-001 authority boundary RATIFIED: Receivable bucket/policy, Collection receipt/execution orchestration, target persistence single-writer cross-domain; dual authority prohibited. Physical persistence owner/aggregate UNSELECTED; ACT-28 / REC-AUTH-011/012 OPEN. PR #407 HOLD. Schema/migration/writer/data/replay/cutover NOT AUTHORIZED. NEXT ACTION TPA-02 TARGET PERSISTENCE ARCHITECTURE — GO-ANALYZE REQUIRED. |
| `project/docs/governance/OFFICE-GOVERNANCE.md` | ratifiye OFFICE Domain Law — vocabulary/ownership/boundaries/invariants/contracts | RATIFIED / CANONICAL DOMAIN LAW v1.0 (2026-07-13; PR #1177 MERGED, SHA `6fa8395d`) |
| `project/docs/governance/OFFICE-MASTER-SYNTHESIS.md` | OFFICE kanıt/gerekçe/senaryo katmanı (operasyonel değil) | CANONICAL REFERENCE / NON-NORMATIVE EVIDENCE BASELINE |
| `project/docs/governance/OFFICE-RISK-REGISTER.md` | OFFICE domain risk dossier'i; global triage/execution status otoritesi DEĞİLDİR | CANONICAL DOMAIN RISK DOSSIER |
| `project/docs/governance/OFFICE-OWNER-DECISIONS.md` | OFFICE açık owner karar dossier'i; kapanmış karar otoritesi DEĞİLDİR | CANONICAL OPEN-DECISION DOSSIER |
| `project/docs/governance/OFFICE-DELIVERY-MANIFEST.md` | OFFICE Phase 1 delivery sequencing, dependency and slice-state authority | CANONICAL / AUTHORITATIVE LIVING DELIVERY SOURCE |
| `project/docs/governance/OFFICE-PHASE2-CONSTITUTION.md` | OFFICE Phase 2 program-seviyesi normatif çerçeve; SYSTEM-CONSTITUTION ve OFFICE-GOVERNANCE'a TABİDİR, ikisini de değiştiremez; implementation authority üretmez | RATIFIED / CANONICAL PROGRAM-LEVEL NORMATIVE v1.0 (2026-07-17; kuruluş PR #1359) |
| `project/docs/governance/OFFICE-PHASE2-MASTER-SYNTHESIS.md` | OFFICE Phase 2 capability/dependency sentezi (operasyonel değil; norm kaynağı değildir) | CANONICAL REFERENCE / NON-NORMATIVE / AS-OF EVIDENCE BASELINE v1.0 (2026-07-17; kuruluş PR #1359) |
| `project/docs/governance/OFFICE-PHASE2-PROGRAM-CHARTER.md` | OFFICE Phase 2 program charter — hedef/teslimat/başarı/çıkış kriterleri; authorization belgesi DEĞİLDİR | RATIFIED / CANONICAL PHASE PROGRAM AUTHORITY v1.0 (2026-07-17; kuruluş PR #1359) |
| `project/docs/governance/OFFICE-PHASE2-ROADMAP.md` | OFFICE Phase 2 sıralama/decomposition çerçevesi; Wave/Candidate/Task/implementasyon-sırası SEÇMEZ, authority üretmez | CANONICAL PLANNING REFERENCE / NON-AUTHORIZING v1.0 (2026-07-17; kuruluş PR #1359) |
| `project/docs/governance/OFFICE-PHASE2-DECOMPOSITION.md` | OFFICE Phase 2 decomposition blueprint — dört Phase 2 foundation belgesinden (Constitution/Master-Synthesis/Charter/Roadmap) türetilir; capability delivery map + increment/Wave mimarisi + decision queue + exit coverage + first-unit seçenekleri; hiçbir Wave/unit SEÇMEZ; mutable delivery statü TAŞIMAZ (statü authority = `OFFICE-DELIVERY-MANIFEST.md`) | CANONICAL REFERENCE / NON-NORMATIVE / NON-AUTHORIZING v1.0 (2026-07-18) |
| `project/docs/adr/` + `architecture-index.md` | teknik/mimari kararlar ve gerekçeleri | KAYITLI STATÜYE GÖRE |
| Implementation standards | code/API/test/deployment/operation conventions | BELGE STATÜSÜNE GÖRE |
| Roadmap / Master Register | work sequencing, owner gates ve closure state | AKTİF; authority/implementation izni üretmez |
| `project/docs/governance/README.md` | governance klasör tanımı ve dosya listesi | AKTİF |
| `project/docs/governance/decision-log.md` | kronolojik karar kaydı | AKTİF |
| `project/docs/governance/architecture-index.md` | repo ADR kütüğü indeksi | AKTİF |
| `project/docs/governance/product-backlog.md` | Product Backlog / Master Register | AKTİF |
| `project/docs/governance/master-triage-register.md` | triage/verification register | AKTİF |
| `project/docs/governance/active-roadmap.md` | aktif fazlar | AKTİF |
| `project/docs/governance/dbind-financial-authority-decisions.md` | finansal otorite kararları | AKTİF |
| `project/docs/analysis/debtor-master-synthesis-v2.md` | borçlu hattı kanıt/gerekçe katmanı (operasyonel değil) | KANIT — SUPERSEDED BY governance |
| `project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md` | BORÇLU PLATFORMU Phase 0 (Wave 0) tamamlanma sentezi — completed foundations, owner kararları, deferred/transferred work, Blueprint girdileri, Phase 1 giriş kriterleri | CANONICAL / PHASE 0 CLOSED — PR #1240 owner-ratified Wave 0 closure'ının sentez belgesi |
| `project/docs/blueprint/` (`DEBTOR-CANONICAL-DOMAIN-BLUEPRINT-CHARTER-v1.0.md` + `DEBTOR-DBP-02..12-*.md`, 13 belge) | BORÇLU PLATFORMU Phase 1 Canonical Domain Blueprint — 9-katman mimari sentez (L1-L9), 12 work-package (DBP-02..12), 31 zorunlu artefakt, BR-01..21/N-01..26 register'ları | BLUEPRINT DOCUMENT SET: IMPLEMENTED/MERGED/CANONICALIZED (her belge kendi `Owner Approval Record`'unu taşır) / GOVERNANCE RECONCILIATION: RECORDED (`decision-log.md` 2026-07-16 DBP-GOV-01) / DBP-P1-CANONICALIZATION: VERIFIED/CLOSED (`DBP-P1-CANON-CLOSE` R1 → `DBP-REMOTE-BRANCH-CLEANUP` → R2) / OWNER BLUEPRINT RATIFICATION: RECORDED/CANONICAL (`decision-log.md` 2026-07-16 DBP-OWNER-RATIFY-01) / PHASE 1 BLUEPRINT: CANONICAL CLOSED / IMPLEMENTATION ENTRY: HOLD / NEXT IMPLEMENTATION WORKSTREAM: OWNER DECISION REQUIRED |
| `project/docs/governance/COLLECTION-GOVERNANCE.md` | Collection Domain Governance — receipt/lifecycle/allocation-execution sınırı, COL-INV-001..048, cross-domain contract haritası | OWNER-APPROVED CANONICALIZATION v1.1; v1.0 baseline (2026-07-13) + RCV-P2-WS04 legal-application boundary amendment (2026-07-18); Collection remains receipt/execution owner, not target legal-application authority |
| `project/docs/governance/COLLECTION-MASTER-SYNTHESIS.md` | Collection kanıt/kalıcı-gerçek katmanı (operasyonel değil) | CANONICAL REFERENCE / NON-NORMATIVE EVIDENCE BASELINE |
| `project/docs/governance/COLLECTION-OWNER-DECISIONS.md` | Collection owner karar dossier'i (COL/OD-01..21 + additive kararlar); kapanmış karar otoritesi DEĞİLDİR | CANONICAL OPEN-DECISION DOSSIER — RECORDED/CANONICAL: COL/OD-01, -03, -04, -05, -06, -06A, -21; COL/OD-18 → COL/OD-18A AMENDED; kalan 14 kök karar OPEN |
| `project/docs/governance/COLLECTION-RISK-REGISTER.md` | Collection domain risk dossier'i; global triage/execution status otoritesi DEĞİLDİR | CANONICAL DOMAIN RISK DOSSIER |
| `project/docs/governance/COLLECTION-DECOMPOSITION.md` | RC-COL Program→Phase→Wave→Workstream haritası; execution yetkisi üretmez | CANONICAL DECOMPOSITION — PHASE 0 CLOSED / CANONICAL; PHASE 1 CLOSED / CANONICAL; PHASE 2 ACTIVE — W2.1/W2.2A/W2.2B/W2.2C-0/W2.2C-1/W2.2C-2/W2.2C-3/W2.2C-4/W2.2C-5 CLOSED; COL/OD-06A RECORDED, W2.2C DECISION GATE SATISFIED; W2.2D-0 PR #1407 / `1156e4de` ile CLOSED / CANONICAL upon approved reconciliation merge; COL-RISK-G03 PARTIALLY MITIGATED — CONFIRMEDAT / PROJECTION HARDENING REMAINS; W2.2D-1 OWNER GO REQUIRED / IMPLEMENTATION NOT AUTHORIZED; W2.3 BLOCKED — W2.2 BOUNDARY PENDING |
| `project/docs/governance/CLIENT-GOVERNANCE-CHARTER.md` | ratifiye CLIENT Governance Charter (bounded) — client ownership/invariants (CL-INV-001..008)/cross-domain contract map konsolidasyonu; **FULL DOMAIN LAW DEĞİLDİR**, mevcut Domain Law ve owner-kararı otoritesini kendi sınırlarında korur/override etmez | RATIFIED / CANONICAL CLIENT NORMATIVE BASELINE (BOUNDED CHARTER) v1.0 (2026-07-18; Option C owner-ratified); CANONICAL UPON APPROVED MERGE TO MAIN (bkz. `decision-log.md` CLIENT-P0-T05) |

## 3. Authority eksenleri

```text
Semantic authority:
SYSTEM-CONSTITUTION → Domain Law → ADR → Implementation

Execution and safety authority:
AGENTS.md + repository policies + task authorization + environment/tool restrictions
```

Bu eksenler tek doğrusal üstünlük sırası değildir. Semantic authority execution izni
vermez; execution authority domain semantiğini değiştirmez. Her görev iki eksene aynı
anda uymalıdır.

## 4. "Neden bu kural var?" zinciri

Bir governance kuralının gerekçesi arandığında iz şudur:

```text
DEBTOR-GOVERNANCE (kural, örn. INV-07)
→ Master Synthesis (project/docs/analysis/debtor-master-synthesis-v2.md — MS/DEC, MS/ADR, MS/FND kanıtı)
→ decision-log.md (ratifikasyon ve sonraki değişiklik kayıtları)

RECEIVABLE-GOVERNANCE (kural, örn. REC-INV-001)
→ İlgili ADR ve authority kayıtları (ADR-010, ADR-013, ADR-014 ve Master Register)
→ decision-log.md (ratifikasyon ve sonraki değişiklik kayıtları)

COLLECTION-GOVERNANCE (kural, örn. COL-INV-010)
→ COLLECTION-MASTER-SYNTHESIS (F-01..F-16 / OF-01..OF-06 kanıt katmanı)
→ tm3-collection-disposition-boundary.md + dbind-financial-authority-decisions.md (bağlayıcı sınır/karar kaynakları)
→ decision-log.md (canonicalization ve sonraki değişiklik kayıtları)

OFFICE-GOVERNANCE (kural, örn. OFF-INV-05)
→ OFFICE-MASTER-SYNTHESIS (LF/OP/PR-RT-* kanıt katmanı) + OFFICE-RISK-REGISTER (STF-PRD-*)
  + OFFICE-OWNER-DECISIONS (OFF/OD-*)
→ decision-log.md (ratifikasyon 2026-07-13 ve sonraki değişiklik kayıtları)

OFFICE-PHASE2-CONSTITUTION (hüküm, örn. OFF-P2-GOV-06)
→ dayanak: OFFICE-GOVERNANCE maddesi / kapanmış OFF-OD kararı / STF-PRD hedef kontrolü /
  Phase 1 delivery kanıtı (OFFICE-DELIVERY-MANIFEST)
→ decision-log.md (owner text-ratification kaydı, 2026-07-17)
```

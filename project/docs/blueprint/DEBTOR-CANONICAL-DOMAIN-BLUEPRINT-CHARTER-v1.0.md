# DEBTOR CANONICAL DOMAIN BLUEPRINT CHARTER v1.0

> **Canonical Phase 1 start artifact (Charter).** Bu belge Blueprint'in kendisi değildir; Blueprint'in otoritesini, kapsamını, katmanlarını, çalışma paketlerini, karar sınıflarını, bağımlılıklarını, zorunlu artefaktlarını, owner review gate'lerini ve exit kriterlerini çerçeveler. Owner `DBP-01 ANALYSIS APPROVED` (2026-07-14) kararıyla `DBP-01 GO-DOCS` altında `project/docs/blueprint/` içine canonical artifact olarak taşınmıştır. İçerik GO-ANALYZE (DBP-01) çıktısıdır; bu GO-DOCS turunda yeni analiz, owner-kararı veya mimari üretilmemiştir.

---

## 1. Document Status and Authority

```text
PROGRAM            : BORÇLU PLATFORMU
PHASE              : PHASE 1 — CANONICAL DOMAIN BLUEPRINT
WORKSTREAM         : DBP-01 — CANONICAL DOMAIN BLUEPRINT CHARTER
CHARTER VERSION    : v1.0
PRODUCED UNDER     : GO-ANALYZE (DBP-01); implementation NOT authorized
ARTIFACT STATUS    : OWNER-APPROVED (DBP-01 ANALYSIS APPROVED, 2026-07-14)
CANONICAL STATUS   : CANONICAL UPON APPROVED MERGE TO MAIN
CANONICALIZED VIA  : DBP-01 GO-DOCS → project/docs/blueprint/
ANALYSIS BASE (PIN): origin/main @ 8d7c1dbc (fetch 2026-07-14)
PHASE 0            : CANONICAL / CLOSED — NOT REOPENED
                     (project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md — "PHASE 0 CLOSED")
```

**Authority basis.** Bu Charter iki eksene aynı anda tabidir (SYS-AUTH-006):
- Semantic authority: `SYSTEM-CONSTITUTION.md` (SYS-CONST-001, RATIFIED-BINDING) → `DEBTOR-GOVERNANCE.md` (RATIFIED CANONICAL DOMAIN LAW v1.0) → ADR.
- Execution/safety authority: `AGENTS.md` (repository baseline) + task authorization.

**Charter'ın kendi yetkisi.** Charter yeni domain semantiği, invariant veya SoT üretmez; mevcut ratifiye kaynakları referanslar ve Blueprint'in çalışma çerçevesini sabitler (SYS-GOV-007: alt belge üst normu yeniden üretmez, referanslar). Charter execution yetkisi doğurmaz (SYS-GOV-008, SYS-DEC-003).

**Roadmap/Input canonicalization notu.** `DR-01 DELIVERY ROADMAP v1.1` ve `BLUEPRINT INPUT CONTRACT` owner tarafından RATIFIED'dır ancak repo'ya henüz canonicalize edilmemiştir (`OWNER-RATIFIED / REPO CANONICALIZATION PENDING`). İçerikleri bu görev talimatı içinde inline sağlanmıştır ve o hâliyle otoritedir; repo canonicalization ayrı GO-DOCS'a bırakılmıştır. Bu durum DBP-01'i bloke etmez.

---

## 2. Purpose

Owner-ratified Delivery Roadmap v1.1 ve Blueprint Input Contract temelinde, `DEBTOR CANONICAL DOMAIN BLUEPRINT`'in nasıl üretileceğini bağlayıcı biçimde çerçevelemek: Blueprint'in otoritesi, kapsamı, 9 mimari katmanı, DBP-02..12 çalışma paketleri, non-negotiable ve resolution karar sınıfları, bağımlılık modeli, traceability modeli, zorunlu 31 artefakt, owner gate'leri ve exit kriterleri. Charter bu kararların **kendisini çözmez**; hangi work package'ta ve hangi owner gate'iyle çözüleceğini sabitler.

---

## 3. Canonical Inputs and Source Priority

**Kaynak önceliği (bağlayıcı):**
```text
GÜNCEL REPO GERÇEĞİ (@8d7c1dbc)
→ MERGED CANONICAL GOVERNANCE / OWNER DECISIONS
→ OWNER-RATIFIED DELIVERY ROADMAP v1.1  (repo-pending; içerik inline)
→ PHASE 0 FINAL HANDOFF                 (repo-form: DEBTOR-PHASE-0-COMPLETION-ROADMAP.md, CANONICAL/CLOSED)
→ MASTER SYNTHESIS SOURCE PACK          (debtor-master-synthesis-v2.md, CANONICAL evidence)
→ ESKİ ANALİZ VE TASLAKLAR
```

**Girdi kullanılabilirlik denetimi (@pin):**

| # | Girdi | Repo'da | Statü | Evidence class |
|---|---|---|---|---|
| 1 | Phase 0 Final Handoff | `DEBTOR-PHASE-0-COMPLETION-ROADMAP.md` | CANONICAL / PHASE 0 CLOSED (owner GO-DOCS 2026-07-14) | GOVERNANCE-CONFIRMED |
| 2 | Master Synthesis | `project/docs/analysis/debtor-master-synthesis-v2.md` (1034 satır, §A–Y) | CANONICAL evidence (2026-07-12 canonicalization pass) | GOVERNANCE-CONFIRMED |
| 3 | DR-01 Delivery Roadmap v1.1 | YOK (repo-form aday: `DEBTOR-PHASE-0-COMPLETION-ROADMAP.md` yalnız P0) | OWNER-RATIFIED / REPO CANONICALIZATION PENDING | OWNER-RATIFIED (içerik inline) |
| 4 | Blueprint Input Contract | YOK | APPROVED / REPO CANONICALIZATION PENDING | OWNER-RATIFIED (içerik inline) |
| 5 | Güncel canonical main | `@8d7c1dbc` | AKTİF | REPO-CONFIRMED |
| 6 | Merged governance / owner decisions | SYSTEM-CONSTITUTION, DEBTOR-GOVERNANCE, GOVERNANCE-INDEX, decision-log, architecture-index, DBIND, D6, ADR-010/013/014 | RATIFIED/CANONICAL | GOVERNANCE-CONFIRMED |
| 7 | Mimari kayıtlar | Party Registry design(-review), IR-0, CasePolicyEngine specs (`.kiro/specs/case-policy-engine/`, 33 dosya), DomainEvent, DebtorScore, D6, Legal Time (MPB-028(a) legal-time-authority-rebase) | Karışık (RATIFIED / DEFERRED / TARGET) | REPO-CONFIRMED / DEFERRED (per öğe) |

**AUTHORITY_CONFLICT taraması:** Talimatın non-negotiable/decision setleri ile güncel repo gerçeği (@pin) arasında **gerçek çelişki bulunmadı.** Talimatın tüm bağlayıcı hükümleri `DEBTOR-GOVERNANCE.md` INV-01..12 / §4 / §6 / §7 / §8 ve `SYSTEM-CONSTITUTION` SYS-* hükümleriyle tutarlıdır. (Tek dikkat: "CPE tek action-enforcement authority" — CPE repo'da mevcut, ancak "tek+bypass-yok" statüsünün resmî tespiti DBP-04'e bağlıdır; çelişki değil, açık resolution.)

---

## 4. Roadmap – Blueprint – Execution Boundary (bağlayıcı)

```text
DELIVERY ROADMAP (DR-01 v1.1)   → NEREYE / NEDEN / hangi teslim sırasıyla. (owner-ratified)
CANONICAL DOMAIN BLUEPRINT      → hedef iş+sistem mimarisi NASIL kurulur. (bu Phase 1)
PHASE 1 EXECUTION PLAN          → Blueprint → vertical slice / epic / migration / PR / release. (sonraki)
```

Blueprint **yapamaz:** Phase 0'ı yeniden açmak · roadmap milestone'larını keyfî değiştirmek · implementation backlog olmak · kod/migration SQL üretmek · repo davranışını kanıtsız değiştirmek · execution yetkisi doğurmak. (Kaynak: talimat + SYS-DEC-003 + SYS-GOV-008 + Phase-0 CLOSED.)

---

## 5. Target vs Transitional Architecture (her Blueprint kararında zorunlu ikili görünüm)

Her karar TARGET (nihai kanonik ownership/SoT) ve TRANSITIONAL (mevcut→target geçiş) olarak ayrı ele alınır. Geçici çözüm nihai mimari gibi sunulamaz.

```text
TRANSITIONAL DİZİSİ: EXPAND → BACKFILL → SHADOW/DUAL-WRITE → RECONCILE → CUTOVER → DEPRECATE → CONTRACT
```
Zorunlu kural: SHADOW ve read-only, PRIMARY ve write'tan önce gelir (SYS-SOT-006, SYS-MIG-006). Örnek (GOVERNANCE-CONFIRMED, §8 MS/DEC): TARGET = LegalStatus Party seviyesinde tutulabilir; TRANSITIONAL = Party hazır olana kadar `DebtorLegalStatus v1` Debtor seviyesinde (§8.1: LegalStatus, DomainEvent v1 ile birlikte P0 sonrası başlar, Party'yi beklemez).

---

## 6. Non-Negotiable Decision Register (owner-ratified + governance-confirmed)

> Kural: yalnız kaynakla doğrulanan hükümler non-negotiable olarak kaydedilmiştir. Kanıtlanmayan hiçbir madde non-negotiable sayılmadı.

| # | Non-negotiable | Kanonik kaynak | Evidence class |
|---|---|---|---|
| N-01 | Party tenant-local | DEBTOR-GOV §3/§4 (MS/ADR-001); SYS-ID-003 | GOVERNANCE-CONFIRMED |
| N-02 | Cross-tenant Party graph yasak | SYS-ID-003; DEBTOR-GOV §4 (prohibited: cross-tenant global Party) | GOVERNANCE-CONFIRMED |
| N-03 | Fuzzy Party merge insan onayı olmadan yapılamaz | DEBTOR-GOV INV-07, §7 (MS/ADR-003) | GOVERNANCE-CONFIRMED |
| N-04 | Party merge geri alınabilir / split edilebilir | DEBTOR-GOV INV-07, §7 (undo/SPLIT); MS/ADR-003 | GOVERNANCE-CONFIRMED |
| N-05 | Legal Time Authority yeniden tasarlanmaz | DEBTOR-GOV INV-05 (LegalServiceDate); SYS-LEGAL-003 | GOVERNANCE-CONFIRMED |
| N-06 | NotificationQueue hukuki süre otoritesi değildir | DEBTOR-GOV INV-04; SYS-LEGAL-004 | GOVERNANCE-CONFIRMED |
| N-07 | CasePolicyEngine tek action-enforcement authority olarak korunur; paralel/bypass ikinci otorite kurulamaz | CPE repo'da mevcut (`.kiro/specs/case-policy-engine/`, 33 dosya) = REPO-CONFIRMED; "tek+bypass-yok" statü tespiti DBP-04'e bağlı | OWNER-RATIFIED + REPO-CONFIRMED (varlık) / ARCHITECTURE RECOMMENDATION (sole-authority tespiti → DBP-04) |
| N-08 | LegalGuard–CPE entegrasyon desenini Blueprint çözer | DEBTOR-GOV §6 (ctx 13 LegalGuard), §7 (LegalGuard'dan geçer); MS/LG | GOVERNANCE-CONFIRMED (open → DBP-04) |
| N-09 | NBA hukuki/finansal işlem yapmaz | DEBTOR-GOV INV-06; SYS-AI-001/002; SYS-DEC-007; LG-07/08 | GOVERNANCE-CONFIRMED |
| N-10 | AI kanonik hukuki/finansal state yazmaz | DEBTOR-GOV INV-06; SYS-AI-001/002 | GOVERNANCE-CONFIRMED |
| N-11 | Digital Twin source of truth değildir | DEBTOR-GOV INV-09, §3 (Digital Twin ≠ SoT); SYS-AI §11 | GOVERNANCE-CONFIRMED |
| N-12 | DomainEvent v1 Party'yi beklemez | DEBTOR-GOV §8.1 (MS/DEC-15) | GOVERNANCE-CONFIRMED |
| N-13 | DebtorLegalStatus v1 Party'yi beklemez | DEBTOR-GOV §8.1 ({DomainEvent v1, LegalStatus, LegalGuard Core} bundle) | GOVERNANCE-CONFIRMED |
| N-14 | Rule-based NBA Shadow, DebtorScore'u beklemez | DEBTOR-GOV §8.1 (MS/DEC-18) | GOVERNANCE-CONFIRMED |
| N-15 | Minimum Digital Twin, NBA'yı beklemez (NBA'dan önce gelir) | DEBTOR-GOV §8.1 (MS/DEC-16) | GOVERNANCE-CONFIRMED |
| N-16 | Liability, Alacak Kalemi ve Accounting ile koordineli tasarlanır | DEBTOR-GOV §4 SoT (MS/DEC-05b); ADR-014/ADR-013/DBIND | GOVERNANCE-CONFIRMED |
| N-17 | Collection ledger yeniden yazılmaz / bypass edilmez | DEBTOR-GOV INV-10; SYS-GOV-018 | GOVERNANCE-CONFIRMED |
| N-18 | Big-bang rewrite yasak | SYS-MIG-002 (staged); MS §N | GOVERNANCE-CONFIRMED |
| N-19 | İlk geçişlerde destructive migration yapılmaz | SYS-MIG-003/010; DEBTOR-GOV INV-11 | GOVERNANCE-CONFIRMED |
| N-20 | Shadow/read-only, primary/write'tan önce gelir | SYS-SOT-006; SYS-MIG-006 | GOVERNANCE-CONFIRMED |
| N-21 | Geri alınamaz aksiyonlarda insan onayı zorunlu | DEBTOR-GOV §7 (REQUIRES_HUMAN_APPROVAL); SYS-DEC | GOVERNANCE-CONFIRMED |
| N-22 | Mock/synthetic veri legal fact olamaz | DEBTOR-GOV INV-03; LG-06; SYS-SOT-007 | GOVERNANCE-CONFIRMED |
| N-23 | AuditLog, DomainEvent ve LegalEvidence farklı kavramlardır | DEBTOR-GOV INV-08; SYS-EVID-001..005 | GOVERNANCE-CONFIRMED |
| N-24 | Phase 0 yeniden açılmaz | DEBTOR-PHASE-0-COMPLETION-ROADMAP (CANONICAL/CLOSED) | GOVERNANCE-CONFIRMED |
| N-25 | DomainEvent yayını transactional + idempotent (outbox) | DEBTOR-GOV INV-12; SYS-EVID-002 | GOVERNANCE-CONFIRMED |
| N-26 | Foundation order ihlali Hard Stop (`AI_NBA_FOUNDATION_ORDER_VIOLATION`) | DEBTOR-GOV §8.1 | GOVERNANCE-CONFIRMED |

**Sonuç:** 26 non-negotiable'ın 25'i GOVERNANCE-CONFIRMED; yalnız N-07'nin "sole authority" bileşeni DBP-04'te resmî tespite bağlıdır (varlığı REPO-CONFIRMED). AUTHORITY_CONFLICT yok.

---

## 7. Blueprint-Resolution Decision Register

> Charter bu kararları **çözmez**; hangi work package'ta, hangi owner gate'iyle çözüleceğini sabitler. Alanlar: SORU / BAĞLAM / SEÇENEKLER / ETKİLENEN BC / HUKUKİ / SEC-KVKK / MIGRATION / BACKWARD-COMPAT / ÇÖZECEK WP / OWNER SIGN-OFF / DEADLINE. (Aşağıda kompakt matris; her satır tam alan setini WP çıktısında açar.)

| DEC ID | Soru (özet) | Etkilenen BC | Çözecek WP | Owner sign-off | Deadline |
|---|---|---|---|---|---|
| BR-01 | Party–Debtor–CaseDebtor–Liability sınırı | 1,3 | DBP-03 | Owner + LDO | DBP-03 gate |
| BR-02 | LegalStatus target ownership (Party vs Debtor) | 6 | DBP-04 | Owner + LDO | DBP-04 gate |
| BR-03 | Ölüm→tereke transition modeli | 6,3 | DBP-04 | Owner + LDO (LEGAL-SIGN-OFF) | DBP-04 gate |
| BR-04 | Mirasçı modeli | 6,3 | DBP-07 | Owner + LDO | DBP-07 gate |
| BR-05 | Birleşme / unvan değişikliği | 1,6 | DBP-06 | Owner + LDO | DBP-06 gate |
| BR-06 | LegalRole–Representation–Responsibility ayrımı | 3 | DBP-07 | Owner + LDO | DBP-07 gate |
| BR-07 | LiabilityGroup–ClaimItem–Collection ilişkisi | 3 + finans | DBP-07 (ADR-014/DBIND koordineli) | Owner + Finance | DBP-07 gate |
| BR-08 | EnforcementEligibility fact kalıcılığı | 6 | DBP-04 | Owner + LDO | DBP-04 gate |
| BR-09 | LegalGuard–CasePolicyEngine entegrasyon deseni | 6,13 | DBP-04 | Owner + LDO | DBP-04 gate |
| BR-10 | AuditLog–DomainEvent–LegalEvidence ayrımı | 4-katman | DBP-05 | Owner | DBP-05 gate |
| BR-11 | DomainEvent payload/version/idempotency | Event | DBP-05 | Owner | DBP-05 gate |
| BR-12 | Outbox konsolidasyon modeli | Event | DBP-05 | Owner | DBP-05 gate |
| BR-13 | Icrabot disposition (REUSE/EXTRACT/REPLACE/RETIRE) | Supporting | DBP-05 (+DBP-11) | Owner | DBP-05 gate |
| BR-14 | Rule-based NBA vs Score-ranked NBA ayrımı | Behavior | DBP-08 | Owner | DBP-08 gate |
| BR-15 | DebtorScore feature sourcing + lineage | Behavior | DBP-08 | Owner | DBP-08 gate |
| BR-16 | Minimum vs Full Digital Twin sınırı | Read-model | DBP-09 | Owner | DBP-09 gate |
| BR-17 | Borçlu 360 read-model kompozisyonu | Read-model | DBP-09 | Owner | DBP-09 gate |
| BR-18 | Müvekkil görünürlük sınırı | Security | DBP-10 | Owner + KVKK | DBP-10 gate |
| BR-19 | KVKK retention / anonymization | Security | DBP-10 | Owner + KVKK | DBP-10 gate |
| BR-20 | M5 Behavioral Foundation Phase 1 kapsamı | Behavior | DBP-08 | Owner | DBP-08 gate |
| BR-21 | M8 Operational Intelligence faz sınırı | Read/Behavior | DBP-09/DBP-08 | Owner | DBP-09 gate |

Her BR kaydının tam alan seti (SEÇENEKLER/HUKUKİ/SEC-KVKK/MIGRATION/BACKWARD-COMPAT) ilgili WP'nin `Blueprint-Resolution Decision Register` çıktısında açılacaktır; Charter yalnız routing ve gate'i sabitler.

---

## 8. Architecture Layers (Blueprint bu 9 katmanı üretecek)

| Katman | Kapsam | Ana WP |
|---|---|---|
| L1 Business Architecture | Capability map, value stream, aktörler, decision rights, borçlu/tebligat/takip/tahsilat/sulh yaşam döngüleri | DBP-02 |
| L2 Domain Architecture | Bounded contexts, aggregate ownership, SoT, entity/VO sınırları, invariant, command/query sınırı | DBP-03 |
| L3 Legal Decision Architecture | DebtorLegalStatus, EnforcementEligibility, LegalGuard, CasePolicyEngine, HumanApproval, override/evidence | DBP-04 |
| L4 Event, Evidence, Timeline | DomainEvent, EventOutbox, LegalEvidence, AuditLog, Timeline projection, replay/idempotency | DBP-05 |
| L5 Identity & Liability | Party, PartyIdentity, PartyMatch, PartyEvolution, LegalRole, Representation, Liability, ClaimItem/Collection koordinasyonu | DBP-06, DBP-07 |
| L6 Behavior & Decision Intelligence | PaymentPromise, SettlementOffer, BehaviorFeature, FeatureSnapshot, DebtorScore, Rule/Score NBA, outcome feedback | DBP-08 |
| L7 Read Model & Product | Min/Full Digital Twin, Borçlu 360, Evidence Timeline, LegalGuard UX, Müvekkil Onay Merkezi, reporting read models | DBP-09 |
| L8 Security, Privacy, Governance | Tenant isolation, authorization, KVKK, PII minimization, retention, AIContextBuilder, evidence access, müvekkil görünürlüğü | DBP-10 (yatay) |
| L9 Transition Architecture | Backfill, shadow, dual-write, compatibility, rollback, migration invariant, test/release gate | DBP-11 (yatay) |

---

## 9. Work Package Plan (DBP-02..12)

> Doğrulama: talimattaki 11 paket kabul edildi; ekleme/silme gerekmedi. Her paket için: Amaç · Girdiler · Çözeceği kararlar · Üreteceği artefaktlar · Bağımlılıklar · Paralellik · Owner review · Exit · Sonraki pakete sözleşme. (Aşağıda özet; her paket kendi GO-ANALYZE'ında açılır. Bunlar implementation epic'i DEĞİLDİR.)

- **DBP-02 Business Capability & Value Stream** — Amaç: L1. Girdiler: MS §A/H, DEBTOR-GOV §2. Kararlar: capability/value-stream/decision-rights taksonomisi. Artefakt: #1,#2,#3. Bağımlılık: yok (kök). Paralel: DBP-03 erken. Exit: capability map onaylı. Sözleşme→DBP-03: capability→BC eşlemesi.
- **DBP-03 Canonical Domain Boundaries, Aggregates & SoT** — Amaç: L2. Girdiler: DEBTOR-GOV §4/§6, MS §H/I, SYSTEM-CONSTITUTION §5. Kararlar: BR-01. Artefakt: #4,#5,#6,#7. Bağımlılık: DBP-02. Paralel: DBP-05 erken. Exit: BC map + SoT register + aggregate ownership onaylı. Sözleşme→DBP-04..07: BC/aggregate sınırları.
- **DBP-04 Legal Decision Architecture** — Amaç: L3. Girdiler: DEBTOR-GOV §5/§6/§7 (INV-04/05/06, LG), CPE specs, MS §U. Kararlar: BR-02,03,08,09. Artefakt: #12,#13,#14,#15. Bağımlılık: DBP-03. Paralel: DBP-05. Owner+LDO gate (LEGAL-SIGN-OFF REQUIRED). Exit: LegalStatus–Eligibility–LegalGuard–CPE ilişkisi çözülü. Sözleşme→DBP-08: guard katalog+eligibility fact.
- **DBP-05 Domain Event, Legal Evidence & Timeline** — Amaç: L4. Girdiler: DEBTOR-GOV INV-08/11/12, SYS-EVID, Icrabot/Outbox repo gerçeği. Kararlar: BR-10,11,12,13. Artefakt: #11,#14,#15. Bağımlılık: DBP-03 (aggregate). Paralel: DBP-04. Exit: Audit/Event/Evidence ayrımı + payload/version/idempotency + Icrabot disposition çözülü. Sözleşme→tüm katmanlar: event/evidence contract.
- **DBP-06 Party, Identity & PartyMatch** — Amaç: L5-kimlik. Girdiler: DEBTOR-GOV §3/§4 (MS/ADR-001/003), party-registry-design(-review) (DEFERRED), IR-0, SYS-ID. Kararlar: BR-05. Artefakt: #16. Bağımlılık: DBP-03. Paralel: DBP-05 (Party, Event'i beklemez — MS/DEC-15). Exit: Party/PartyMatch spec (tenant-local, reversible merge) onaylı. Sözleşme→DBP-07: Party↔LegalRole bağı.
- **DBP-07 Legal Role, Liability & Financial Responsibility** — Amaç: L5-sorumluluk. Girdiler: DEBTOR-GOV §4 (MS/DEC-05b), ADR-014/013/DBIND, Alacak Kalemi/Accounting sınırı. Kararlar: BR-04,06,07. Artefakt: #17. Bağımlılık: DBP-03, DBP-06 kısmi. Paralel: DBP-09 Min Twin'i bloke etmez. Owner+Finance/LDO gate. Exit: LegalRole–Liability–ClaimItem/Collection koordinasyonu çözülü (Collection ledger yeniden yazılmaz — N-17). Sözleşme→DBP-08: liability sinyali.
- **DBP-08 Behavior, Feature, Score & NBA** — Amaç: L6. Girdiler: MS §V, DEBTOR-GOV INV-06, DebtorScore repo, §8.1 (MS/DEC-18). Kararlar: BR-14,15,20. Artefakt: #18,#19,#20. Bağımlılık: DBP-04 (guard). Paralel: Rule-NBA Score'u beklemez. Exit: Rule-NBA vs Score-NBA ayrımı + feature lineage çözülü. Sözleşme→DBP-09: NBA→read-model.
- **DBP-09 Digital Twin, Borçlu 360 & Product Surface** — Amaç: L7. Girdiler: MS §V/H, §8.1 (MS/DEC-16 Min Twin NBA'dan önce). Kararlar: BR-16,17,21. Artefakt: #21,#22. Bağımlılık: DBP-03/DBP-05. Paralel: Min Twin NBA'dan bağımsız. Exit: Min/Full Twin sınırı + Borçlu 360 kompozisyonu çözülü (Twin ≠ SoT — N-11). Sözleşme→Phase 1 execution: product surface.
- **DBP-10 Tenant, Authorization, KVKK, Retention & AI Context** — Amaç: L8 (yatay). Girdiler: DEBTOR-GOV INV-01/02, SYS §13, D6 KVKK, ADR-011. Kararlar: BR-18,19. Artefakt: #23,#24,#25,#26. Bağımlılık: tüm BC'lere yatay. Paralel: baştan itibaren; sona bırakılmaz. Owner+KVKK gate. Exit: authz matrix + KVKK inventory + retention/anonymization + AI context contract çözülü. Sözleşme→hepsi: constraint katmanı.
- **DBP-11 Transition, Migration, Test & Release** — Amaç: L9 (yatay). Girdiler: SYS-MIG, SYS-SOT-006, MS §N/R/S. Kararlar: EXPAND→...→CONTRACT desenleri, migration invariant, test/release gate. Artefakt: #27,#28. Bağımlılık: domain sözleşmeleri (DBP-03..07) netleşmeden KAPANAMAZ. Paralel: erken başlar, geç kapanır. Exit: her cutover için shadow-first + rollback + evidence gate tanımlı. Sözleşme→execution: migration/release gate.
- **DBP-12 Master Blueprint Synthesis, Owner Decision Pack & Execution Handoff** — Amaç: uzlaştırma. Girdiler: DBP-02..11 çıktıları. Kararlar: yeni mimari İCAT ETMEZ; çelişki reconcile. Artefakt: #29,#30,#31. Bağımlılık: tüm paketler kapalı. Exit: Blueprint Exit Criteria (§16) tümü sağlanmış + owner ratifikasyonu. Sözleşme→`DEBTOR PHASE 1 EXECUTION PLAN`.

---

## 10. Dependency Model

```text
DBP-02 ─┬─────────────► DBP-03 ─┬──► DBP-04 ─┐
        │  (capability)          │   (legal)  │
        └──────────────►         ├──► DBP-05 ─┤   DBP-04 ∥ DBP-05 (paralel)
                                 │   (event)  │
                                 ├──► DBP-06 ─┤   DBP-06(Party) DBP-05'i beklemez (MS/DEC-15)
                                 │   (party)  │
                                 └──► DBP-07 ─┘   DBP-07(Liability) DBP-09 Min Twin'i bloke etmez
                                        │
DBP-10 (yatay, baştan) ════════════════╪═════════ tüm BC'lere constraint
                                        ▼
                              DBP-08 (behavior)  ── Rule-NBA ∥ Score-NBA ayrımı içeride
                                        │            Rule-NBA Score'u beklemez (MS/DEC-18)
                                        ▼
                              DBP-09 (twin/360)  ── Min Twin NBA'dan bağımsız (MS/DEC-16)
                                        │
DBP-11 (yatay) ═════════════════════════╪═════════ domain sözleşmeleri netleşmeden KAPANAMAZ
                                        ▼
                              DBP-12 (synthesis → execution handoff)
```
Bağımlılık kuralları (talimattan, hepsi korunmuştur): DBP-04∥DBP-05 · DBP-06 Party, DBP-05'i bloke etmez · DBP-07 Liability, DBP-09 Min Twin/360'ı bloke etmez · DBP-08 içinde Rule/Score NBA ayrılır · DBP-09 Min Twin NBA'dan bağımsız · DBP-10 yataydır, sona bırakılmaz · DBP-11 domain sözleşmeleri netleşmeden kapanamaz · DBP-12 yeni mimari icat etmez.

---

## 11. Traceability Model

**İz-kimliği sözlüğü:** SRC, FND, DEC, OD, ADR, CAP, VS, ACT, BC, AGG, ENT, VO, CMD, QRY, EVT, FACT, LG, EVD, RM, API, SEC, PRV, MIG, TEST, REL, RISK, MET.

**Namespace disiplini (SYS-GOV-011/012):** `SYS-*` = sistem; `INV-*`/`MS/*` = DEBTOR domain/evidence-local; `DBP-*` = bu program; `BR-*`/`N-*` = bu Charter. Kimlikler benzersiz, sessiz anlam değişikliği yasak.

**Kurallar (bağlayıcı):** yetim referans yok · her ENT bir owner BC'ye bağlı · her CMD bir AGG + guard'a bağlı · her EVT producer+consumer gösterir · her LG rule FACT+EVD kaynağı gösterir · her product surface yalnız kanonik veya açıkça türev RM tüketir · her MIG kararı TARGET+TRANSITIONAL mimariye bağlanır.

---

## 12. Evidence Standard

Her hüküm şu sınıflardan biriyle işaretlenir: `REPO-CONFIRMED` · `GOVERNANCE-CONFIRMED` · `OWNER-RATIFIED` · `LEGAL-SIGN-OFF REQUIRED` · `ARCHITECTURE RECOMMENDATION` · `ASSUMPTION` · `SOURCE MISSING` · `CONFLICTING` · `DEFERRED`.
`ASSUMPTION` için: (a) neden gerekli, (b) yanlışsa etkisi, (c) nasıl doğrulanacağı zorunlu. Bu Charter'da açık `ASSUMPTION`/`CONFLICTING` hüküm YOK; `SOURCE MISSING` yalnız DR-01/Blueprint-Input'un repo-form yokluğu için (içerik inline OWNER-RATIFIED). `DEFERRED`: Party Registry full model (CDL-01).

---

## 13. Mandatory Artifact Set (Blueprint en az bunları üretir)

1 Business Capability Map · 2 Value Stream Architecture · 3 Actor & Decision Rights Matrix · 4 Final Bounded Context Map · 5 Aggregate Ownership Matrix · 6 Source-of-Truth Register · 7 Canonical Domain Model · 8 Target–Transitional Comparison · 9 Command Catalogue · 10 Query Catalogue · 11 Domain Event Catalogue · 12 Legal Fact Dictionary · 13 LegalGuard Rule Catalogue · 14 Legal Evidence Architecture · 15 Audit/Event/Evidence Separation Spec · 16 Party & PartyMatch Spec · 17 LegalRole & Liability Spec · 18 BehaviorFeature Dictionary · 19 DebtorScore Spec · 20 NBA Command & Guard Catalogue · 21 Min/Full Digital Twin Spec · 22 Borçlu 360 Product Architecture · 23 Authorization Matrix · 24 KVKK Data Inventory · 25 Retention & Anonymization Policy · 26 AI Context & Explanation Contract · 27 Migration & Backfill Blueprint · 28 Test & Release Gate Architecture · 29 Risk & KPI Model · 30 Owner Decision Pack · 31 Phase 1 Execution Handoff Contract.

---

## 14. Scope Exclusions

Phase 0 yeniden analizi · kod/migration · Prisma/SQL taslağı · dosya-listeli PR planı · UI piksel tasarımı · AI model/provider seçimi · Accounting/Alacak Kalemi domain'ini yeniden tasarlama · Collection ledger'ı yeniden yazma · otomatik fuzzy merge · NBA/AI işlem yetkisi · Digital Twin'i SoT yapma · owner kararı olmadan workstream açma · eksik hukuki fact'i tahmin etme · Blueprint tamamlanmadan execution backlog'unu kanonikleştirme.

---

## 15. Owner Review Gates

Her DBP paketi kendi owner review noktasında kapanır (§9). Ek zorunlu sign-off'lar: DBP-04 & DBP-07 = LEGAL-SIGN-OFF REQUIRED (LDO); DBP-07 = Finance koordinasyonu; DBP-10 = KVKK sign-off. §8.2'deki tüm owner kapıları AÇIK ve bu Charter hiçbirini verilmiş saymaz. DBP-12 sonunda owner Blueprint ratifikasyonu zorunludur.

---

## 16. Blueprint Exit Criteria

Blueprint ancak: tüm DBP paketleri kapalı · her roadmap capability'si target/deferred'a bağlı · her BC'nin owner+SoT'u belirli · target/transitional ayrık · LegalStatus–Eligibility–LegalGuard–CPE çözülü · Audit–Event–Evidence ayrımı çözülü · Party–Debtor–CaseDebtor–Liability sınırı çözülü · Rule/Score-NBA + Icrabot disposition çözülü · Min/Full Twin sınırı çözülü · Tenant/KVKK/retention tamam · owner kararları çözülü veya açıkça ertelenmiş · migration/rollback/test/release ilkeleri tamam · ilk yetkili Phase 1 vertical slice önerilmiş · çelişkisiz Execution Plan handoff'u · owner Blueprint ratifikasyonu alınmış. Blueprint tamamlandığında implementation OTOMATİK başlamaz.

---

## 17. Risks

- R-01 DR-01 v1.1 / Blueprint Input Contract repo-canonicalize değil (SOURCE MISSING repo-form) → mitigasyon: içerik inline owner-ratified; ayrı GO-DOCS ile canonicalize. Etki: orta.
- R-02 CPE "sole authority" tespiti DBP-04'e bağlı; erken varsayım paralel-otorite riski doğurur → mitigasyon: N-07 ARCHITECTURE RECOMMENDATION olarak işaretli, DBP-04 kapatır.
- R-03 Party DEFERRED (CDL-01) iken transitional bağımlılıkların yanlış okunması → mitigasyon: §8 MS/DEC-15/16/17/18 bağlayıcı; Party post-P0, foundation'ı beklemez.
- R-04 Liability×Accounting/Alacak Kalemi kesişiminde çifte-otorite → mitigasyon: N-16/N-17 + ADR-014/DBIND; DBP-07 Finance sign-off.
- R-05 analiz sırasında main hızlı ilerliyor (bu turda 3 kez) → mitigasyon: pin @8d7c1dbc; authority çekirdeği (SYSTEM-CONSTITUTION/DEBTOR-GOVERNANCE) stabil doğrulandı.
- R-06 LEGAL-SIGN-OFF gerektiren kararların (ölüm/tereke, eligibility) LDO onayı olmadan ilerlemesi → mitigasyon: DBP-04/07 gate LEGAL-SIGN-OFF REQUIRED.

---

## 18. Final Charter Verdict

Charter, ratifiye `DEBTOR-GOVERNANCE.md` + `SYSTEM-CONSTITUTION.md` + CANONICAL `debtor-master-synthesis-v2.md` + CLOSED Phase 0 ile **tam hizalı** ve **çelişkisizdir**. 26 non-negotiable'ın 25'i GOVERNANCE-CONFIRMED, 1'i (N-07 sole-authority bileşeni) DBP-04'e yönlendirilmiş; 21 resolution kararı WP+gate'e route edilmiş; 9 katman ve DBP-02..12 doğrulanmış; bağımlılık, traceability, evidence, 31 artefakt ve exit kriterleri sabitlenmiştir. **AUTHORITY_CONFLICT yok. Blueprint Charter READY FOR OWNER REVIEW.**

---

## 19. Next Eligible Task

Owner ratifikasyonu sonrası tek uygun görev: **DBP-02 — BUSINESS CAPABILITY & VALUE STREAM ARCHITECTURE** (GO-ANALYZE, ayrı owner yetkisi). DBP-02'ye otomatik geçilmez; kod/migration/execution plan üretilmez.

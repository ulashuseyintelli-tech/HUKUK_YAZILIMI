# CLIENT / MÜVEKKİL Governance Charter — Bounded Client Governance Charter

```text
Belge yolu   : project/docs/governance/CLIENT-GOVERNANCE-CHARTER.md
Durum        : OWNER RATIFIED / CANONICAL — BOUNDED CLIENT GOVERNANCE CHARTER (FULL DOMAIN LAW DEĞİLDİR)
Sürüm        : v1.0 (ratifiye)
Rol          : BOUNDED CONSOLIDATED CLIENT NORMATIVE BASELINE — client ownership, stable invariants ve cross-domain contract map için tek kanonik referans; mevcut normları KONSOLİDE eder, YENİ norm ÜRETMEZ
Kimlik uzayı : CL-INV-001..CL-INV-008 (bu belgenin invariant kimlikleri) — SYS-* / OFF-INV-* / INV-* / COL-INV-* / REC-* kimlikleriyle çakıştırılamaz
Üst / sibling otoriteler (bu belgenin İÇİNE gömülmez, yalnız referans verilir):
  - project/docs/governance/SYSTEM-CONSTITUTION.md (system-wide semantic authority — ÜST ÇATI)
  - project/docs/governance/OFFICE-GOVERNANCE.md · DEBTOR-GOVERNANCE.md · RECEIVABLE-GOVERNANCE.md · COLLECTION-GOVERNANCE.md (ratifiye Domain Law'lar — kendi sınırlarında ÜSTÜN)
  - project/docs/governance/dbind-financial-authority-decisions.md (finansal otorite kararları)
  - docs/adr/ (kabul edilmiş Client settlement/offset ADR'leri) · decision-log.md (kanonik owner kararları)
```

Bu belge owner tarafından **OWNER RATIFIED / CANONICAL BOUNDED CLIENT GOVERNANCE CHARTER** olarak ratifiye edilmiştir (Option C; `decision-log.md` CLIENT-P0-T05 kaydı). **Full CLIENT Domain Law DEĞİLDİR** ve kendini öyle tanımlamaz. `SYSTEM-CONSTITUTION.md`'ye tabidir, onu değiştiremez/zayıflatamaz; mevcut ratifiye Domain Law'ları (OFFICE / DEBTOR / RECEIVABLE / COLLECTION) ve ratifiye owner kararlarını kendi sınırlarında **korur, yeniden sahiplenmez, override etmez**. Bu ratifikasyon tek başına runtime implementation, yeni ürün/finans politikası, açık owner kararlarının kapanışı veya Phase 1 yetkisi VERMEZ. **IMPLEMENTATION AUTHORITY: NONE.**

## RELATED DOCUMENTS

- Üst çatı: `SYSTEM-CONSTITUTION.md` · Okuma sırası: `GOVERNANCE-INDEX.md`
- Sibling ratifiye Domain Law'lar: `OFFICE-GOVERNANCE.md`, `DEBTOR-GOVERNANCE.md`, `RECEIVABLE-GOVERNANCE.md`, `COLLECTION-GOVERNANCE.md`
- Finansal otorite: `dbind-financial-authority-decisions.md`
- Client settlement/offset tasarımı: `docs/adr/` (kabul edilmiş Client-offset/settlement ADR'leri) ve `docs/finance/` sınır kayıtları
- Kapanmış owner kararı otoritesi: `decision-log.md`

## 1. Status and Authority

Yukarıdaki başlık bloğu bu belgenin statü ve authority beyanıdır.

- **STATUS:** OWNER RATIFIED
- **ARTIFACT TYPE:** BOUNDED CLIENT GOVERNANCE CHARTER (full Domain Law DEĞİL)
- **NORMATIVE POSITION:** SYSTEM CONSTITUTION → **CLIENT GOVERNANCE CHARTER** → BOUNDED OWNER DECISIONS / ADR → IMPLEMENTATION
- **IMPLEMENTATION AUTHORITY:** NONE

Bu charter yalnız Client-specific ownership sınırlarını, stable invariant'ları ve cross-domain contract map'i **tek kanonik yerde konsolide eder**. Mevcut Domain Law veya owner kararının otoritesini taşımaz ve tekrar-sahiplenmez; bir çelişki görülürse implementation durur ve yalnız Governance Reconciliation önerilir (üst-çatı hükmü esas alınır, `SYS-AUTH-002`).

## 2. Purpose

Bu charter aşağıdakileri tek kanonik yerde **konsolide eder** (yeni norm ÜRETMEDEN):

- Client domain amacı (`SYS-GOV-013` primary domain; `SYS-GOV-015` scope),
- ownership ve non-ownership sınırları,
- stable Client invariants (CL-INV-001..008),
- source-of-truth referansları (Constitution Financial/Identity SOT; DBIND; COLLECTION §4.6),
- cross-domain contract map (CLIENT ↔ OFFICE / RECEIVABLE / COLLECTION / DEBTOR / DOCUMENT-PORTAL),
- açık owner-decision aileleri (referans; hiçbiri SEÇİLMEZ),
- Phase 1 blueprint sınırları (upgrade kuralı §9).

## 3. Client-Owned Scope

`SYS-GOV-015` temelli, Client domaininin sahibi olduğu alanlar:

- Client profile ve relationship
- Representation ve mandate
- Client instructions
- Client approval requirements ve limits
- Client-facing visibility context
- Communication preferences
- Fee / contract context
- Client-facing ilişkilerde creditor identity (canonical creditor relationship — `CaseClient` / creditor set — üzerinden)

## 4. Explicit Non-Owned Scope

Client domaininin sahibi OLMADIĞI, kardeş otoritelere ait alanlar:

- Debtor identity ve legal status (DEBTOR — `SYS-GOV-016`)
- Independent receivable authority (RECEIVABLE — `SYS-GOV-017`)
- Independent debt calculation (RECEIVABLE / CALCULATION otoritesi)
- Collection ledger mutation (COLLECTION — `SYS-GOV-018`)
- Accounting ledger authority (ACCOUNTING — `SYS-GOV-020`)
- Office personnel ve role authority (OFFICE — `SYS-GOV-014`)
- Other-tenant visibility (tenant isolation ile eş anlamlı değildir — `SYS-AUTH-008`)

## 5. Stable Invariants

Aşağıdaki invariant'lar mevcut kanonik normların **KONSOLİDASYONUDUR** (kaynak parantez içinde); yeni norm veya teknik çözüm tasarımı değildir.

- **CL-INV-001** — Client relationship, mandate ve instruction Client domainine aittir. *(kaynak: `SYS-GOV-015`)*
- **CL-INV-002** — Legacy client references bağımsız financial veya party authority değildir. *(kaynak: `SYS-ID-001`; Constitution Financial SOT — `Case.clientId` financial/party authority olamaz; DBIND §1)*
- **CL-INV-003** — Creditor identity canonical creditor relationship (`CaseClient` / creditor set) üzerinden belirlenir. *(kaynak: Constitution Financial SOT; DBIND §1)*
- **CL-INV-004** — Client financial settlement ile legal settlement aynı kavram değildir. *(kaynak: `SYS-LEGAL-009` / `SYS-LEGAL-010`)*
- **CL-INV-005** — Creditor disposition, Client ve Collection sınırında approval-gated paylaşımlı bir sözleşmedir. *(kaynak: Constitution Financial SOT — "Approval-gated CLIENT/COLLECTION disposition owner"; COLLECTION §4.6)*
- **CL-INV-006** — Client-facing visibility, tenant isolation ile eş anlamlı değildir; ayrı ve açık policy authority gerektirir. *(kaynak: `SYS-AUTH-008`)*
- **CL-INV-007** — Gerçek external-client approval ile staff proxy / provenance kaydı birbirine eşitlenemez. *(kaynak: Constitution operational-approval ilkesi; ilgili karar §8'de AÇIK bırakılmıştır)*
- **CL-INV-008** — Bu charter, mevcut OFFICE / RECEIVABLE / COLLECTION / DEBTOR Domain Law otoritelerini yeniden sahiplenemez veya override edemez. *(kaynak: `SYS-AUTH-002`; COLLECTION Domain Law normatif-tekrar yasağı)*

Bu bölüm yeni teknik mekanizma veya çözüm tasarımı içermez.

## 6. Cross-Domain Contract Map — Named Bounded Contracts (XDC-A–E)

Her sözleşme **referans-only**'dir; ilgili kardeş domainin kendi otoritesi bu charter'ın ÜSTÜNdedir. Bu bölüm **MODEL D — HYBRID canonicalization** (owner-ratified; `decision-log.md` CLIENT-P1-XDC-01) uyarınca beş adlandırılmış sınırlı sözleşmenin **CLIENT-tarafı kanonik index'idir**; her sözleşmenin reciprocal authority sınırı ilgili kardeş Domain Law'da **adlandırılır ve orada kalır** (RECIPROCAL HOME). Bu index yeni command/write/approval/source-of-truth authority ÜRETMEZ, açık policy'yi ÇÖZMEZ, kardeş Domain Law hükümlerini YENİDEN YAZMAZ. **AUTHORITY CONFLICT: NONE** (CLIENT-P1-XDC-01 analizi; consolidation only).

### XDC-A — CLIENT ↔ OFFICE — Client Approval and Actor Identity

- **PURPOSE:** CLIENT onay talebi + relationship/mandate/instruction bağlamı sağlar; OFFICE internal approval kararını ve approving actor identity'yi üretir. Business-effect ilgili hedef domainde kalır.
- **CLIENT PROVIDES:** client relationship / mandate / instruction context; onay talebi.
- **CLIENT CONSUMES:** internal approval kararı ve actor identity (okuma).
- **OTHER DOMAIN AUTHORITY:** OFFICE — actor / role / approval policy (`SYS-GOV-014`; OFFICE §15; ADR-009; OFF/OD-08/10/11).
- **CLIENT NON-AUTHORITY:** office role/personnel authority; approval actor kimliğini üretmek.
- **CANONICAL SOURCE REFERENCES:** `SYS-GOV-014` / `SYS-GOV-015`; OFFICE-GOVERNANCE §15/§21; ADR-009 (`OfficeApprovalRequest` ≠ `ClientApprovalRequest`, LOCKED-ayrı); Constitution Identity SOT §7; `SYS-DEC-006`.
- **OPEN OWNER-DECISION POINTERS:** OFF/OD-06, OFF/OD-12, OFF/OD-13; executed-approval reversal ownership; approval provenance — **POL-B DUAL-TRACK MODEL CANONICAL (§8.A)**, subject applicability OPEN, portal dependency POL-C (CL-INV-007 komşu, ayrı).
- **RECIPROCAL HOME:** OFFICE-GOVERNANCE §21 (OFFICE→CLIENT clause).

### XDC-B — CLIENT ↔ RECEIVABLE — Creditor Context versus Receivable Authority

- **PURPOSE:** CLIENT'ın creditor-identity/relationship (creditor ucu) sahipliğini RECEIVABLE'ın claim item + deterministic calculation otoritesinden ayırır; CLIENT receivable kompozisyonunu OKUR, mutasyon etmez.
- **CLIENT PROVIDES:** creditor identity / relationship context (creditor ucu; `CaseClient`/creditor set).
- **CLIENT CONSUMES:** claim / receivable kompozisyonu (okuma).
- **OTHER DOMAIN AUTHORITY:** RECEIVABLE — claim item, principal/interest/cost, deterministic calculation ve legal allocation (`SYS-GOV-017`).
- **CLIENT NON-AUTHORITY:** independent receivable balance veya legal allocation (`SYS-GOV-015`); claim mutation.
- **CANONICAL SOURCE REFERENCES:** `SYS-GOV-015` / `SYS-GOV-017`; Constitution Financial SOT §9 (Creditor authority + Canonical receivable balance satırları); DBIND §1; `CL-INV-002` (`Case.clientId` finansal/party authority DEĞİL).
- **OPEN OWNER-DECISION POINTERS:** adlandırılmış yüzey bugüne dek örtüktü — bu index ile named; client-facing receivable projection/masking (XDC-E ailesi). ADR-014 calc cutover / ADR-013 fee = **other-program** (bu sözleşmede çözülmez).
- **RECIPROCAL HOME:** RECEIVABLE-GOVERNANCE §6 (Domain ownership ve sınırlar).

### XDC-C — CLIENT ↔ COLLECTION — Creditor Disposition and Client Settlement

- **PURPOSE:** Tahsil edilen değerin müvekkil/creditor yönlendirmesinin (creditor disposition → client payable → payout/offset/statement) CLIENT sınırı ile COLLECTION money-out lane'i arasındaki scope/approval/read sözleşmesi.
- **CLIENT PROVIDES:** creditor identity (disposition scope); ödeme-rota bağlamı.
- **CLIENT CONSUMES:** posted disposition sonucu (client payable / payout / offset / statement).
- **OTHER DOMAIN AUTHORITY:** COLLECTION — receipt, cash provenance, allocation-execution, money-out idempotency (`SYS-GOV-018`; COLLECTION §4.6; COL-IDEM-001; kabul edilmiş Client-offset ADR'i; DBIND §3/§5). Creditor disposition = **approval-gated SHARED CLIENT/COLLECTION** (`CL-INV-005`; Constitution Financial SOT §9).
- **CLIENT NON-AUTHORITY:** collection ledger mutation; money-out execution; disposition'ı `clientId` ile kurmak.
- **CANONICAL SOURCE REFERENCES:** `SYS-GOV-018`; COLLECTION-GOVERNANCE §4.6; DBIND §1/§3/§5; Constitution Financial SOT §9 (Creditor Disposition + Payout/Offset satırları); Client-offset ADR (ACCEPTED); `CL-INV-004`/`CL-INV-005`.
- **OPEN OWNER-DECISION POINTERS:** client-settlement umbrella consolidation; COL/OD-07/08/09/10/14/15/19; financial role/approval predicate.
- **RECIPROCAL HOME:** COLLECTION-GOVERNANCE §4.6 (CLIENT-financial settlement).

### XDC-D — CLIENT ↔ DEBTOR — Client Instruction versus Debtor Legal Status

- **PURPOSE:** Client instruction/consent (sulh bağlamı) ile debtor legal status arasındaki sınır; client consent kaydedilir/talimattır, debtor yükümlülüğünü tek başına değiştirmez.
- **CLIENT PROVIDES:** müvekkil onayı / talimatı (sulh bağlamı; consent context).
- **CLIENT CONSUMES:** debtor legal-status bağlamı (okuma).
- **OTHER DOMAIN AUTHORITY:** DEBTOR — debtor identity, legal role/status, debtor workflow, sulh/legal-settlement mutation (`SYS-GOV-016`; DEBTOR §6/§7/§8; OfficeApproval REUSE).
- **CLIENT NON-AUTHORITY:** debtor legal status; unilateral debtor obligation change; otomatik/self-service settlement authority (`SYS-LEGAL-010`; MS/ADR-020).
- **CANONICAL SOURCE REFERENCES:** `SYS-GOV-015` / `SYS-GOV-016`; `SYS-LEGAL-009`/`SYS-LEGAL-010` (LegalSettlement/Sulh ≠ ClientSettlement/Creditor Disposition); DEBTOR-GOVERNANCE §6/§7/§8; `CL-INV-004`.
- **OPEN OWNER-DECISION POINTERS:** MS/OD-10, MS/OD-11; client approval artefakt kimliği + staff-proxy provenance — **POL-B DUAL-TRACK MODEL CANONICAL (§8.A)**, subject applicability OPEN, portal dependency POL-C (CL-INV-007).
- **RECIPROCAL HOME:** DEBTOR-GOVERNANCE §6 (Bounded Context Ownership).

### XDC-E — CLIENT ↔ DOCUMENT / PORTAL — Client-Facing Evidence and Visibility

Bu sözleşmenin **contract core'u canonicalize edilir; substantive policy clause'ları OWNER-GATED / ÇÖZÜLMEMİŞ pointer olarak kalır**. **Yeni DOCUMENT/PORTAL Domain Law OLUŞTURULMAZ** (Constitution shared-kernel authority korunur, `SYS-GOV-019`).

- **PURPOSE:** Client-facing belge/evidence yüzeyleri + client visibility & approval-request sınırı.
- **CLIENT PROVIDES:** client-facing görünürlük ve onay talebi bağlamı; mandate context.
- **CLIENT CONSUMES:** client-facing belge / evidence yüzeyleri.
- **OTHER DOMAIN AUTHORITY:** shared-kernel — document/evidence infrastructure, evidence integrity & retention mechanism, authentication infrastructure (`SYS-GOV-019`; `SYS-EVID-004`); Constitution visibility ilkeleri (`SYS-AUTH-008` / `SYS-AUTH-012`); internal actor identity & authorization = OFFICE (`SYS-GOV-014`). Tenant containment kaydı = CLIENT-P0-T04-C1 (finansal-yüzey tenant boundary evidence; **client-facing visibility policy DEĞİL**, `CL-INV-006`).
- **CLIENT NON-AUTHORITY:** other-tenant visibility; portal authority'yi tek başına tanımlamak; masking veya retention policy'yi tek başına belirlemek.
- **CANONICAL SOURCE REFERENCES:** `SYS-AUTH-008` / `SYS-AUTH-012`; `SYS-GOV-019`; `SYS-EVID-004`; `CL-INV-006` / `CL-INV-007`.
- **OPEN OWNER-DECISION POINTERS (yalnız pointer; ÇÖZÜLMEZ):** portal / external-client authority; client-facing masking; KVKK retention / anonymization / legal hold; external-approval vs staff-proxy provenance (**POL-B DUAL-TRACK MODEL CANONICAL, §8.A; subject applicability OPEN; portal dependency POL-C**); aggregate visibility; document/portal RBAC.
- **CONTRACT STATUS:** CONTRACT CORE = CANONICALIZED; OPEN POLICY CLAUSES = OWNER-GATED / NOT RESOLVED.
- **RECIPROCAL HOME:** yeni Domain Law YOK; shared-kernel authority Constitution'da (`SYS-GOV-019`/`SYS-EVID`), OFFICE actor authority OFFICE-GOVERNANCE'da kalır; substantive policy = bounded owner decisions/ADR (charter'a gömülmez).

## 7. Existing Superior Authorities

Bu charter aşağıdaki otoriteleri **yeniden yazmadan referans verir**; çelişki durumunda bunlar ÜSTÜNdür:

- `SYSTEM-CONSTITUTION.md`
- `OFFICE-GOVERNANCE.md`
- `RECEIVABLE-GOVERNANCE.md`
- `COLLECTION-GOVERNANCE.md`
- `DEBTOR-GOVERNANCE.md`
- `dbind-financial-authority-decisions.md`
- Kabul edilmiş Client settlement / offset ADR'leri (`docs/adr/` + `docs/finance/` sınır kayıtları)
- `decision-log.md`'deki kanonik owner kararları

## 8. Open Owner Decisions

Aşağıdaki karar aileleri, Phase 0 T05 ratifikasyonunda AÇIK bırakılmıştı; bu charter hiçbirini o zaman SEÇMEDİ veya ratifiye ETMEDİ (her biri ayrı owner kararı gerektirdi). **§25 (CLIENT Phase 1 — Blueprint/Policy Closure) bu listenin güncel disposition'ını kaydeder** — bu bölümün kendi tarihsel bağlamı korunur, yalnız her kalemin şimdiki durumu aşağıda işaretlenmiştir:

- Portal / external-client authority — **CLOSED VIA POL-C (§18) + BP-05 (§20)**
- KVKK retention / anonymization / legal-hold baseline — **CLOSED VIA POL-E (§24)**
- Client-facing masking / field visibility — **CLOSED VIA POL-D (§21) + BP-06 (§23)**
- Financial role / approval predicate — **CLOSED VIA POL-A (§8.B)**
- Aggregate visibility policy — **CLOSED VIA POL-F (§22)**
- External approval vs staff-proxy provenance — **PROVENANCE CORE MODEL CLOSED VIA POL-B (§8.A, OPTION C — DUAL-TRACK PROVENANCE); portal-authority alt-bileşeni CLOSED VIA POL-C (§18)**; **per-subject consent sufficiency: RESIDUAL / SEPARATE OWNER-GATED UNIT** (§25 residual register R2)
- Calculation cutover — **ADR-014 OWNERSHIP / OUTSIDE CLIENT PHASE 1**
- Fee / harç producer ownership — **ADR-013 OWNERSHIP / OUTSIDE CLIENT PHASE 1**
- Reversal / manual recovery policy — **COLLECTION OWNERSHIP / OUTSIDE CLIENT PHASE 1**

## 8.A POL-B — Approval Provenance Disposition (OWNER RATIFIED)

Bu bölüm CL-INV-007'yi (§5) **değiştirmez**; yalnız onun ilgili açık kararının owner disposition'ını kaydeder (`decision-log.md` CLIENT-P1-POL-B-GOV).

- **STATUS:** OWNER RATIFIED
- **MODEL:** DUAL-TRACK PROVENANCE (OPTION C)
- **FACT A — AUTHENTICATED EXTERNAL-CLIENT DECISION:** ayrı fact.
- **FACT B — STAFF-RECORDED CLIENT STATEMENT / INSTRUCTION:** ayrı fact.
- **FACT RELATIONSHIP:** DISTINCT · NON-EQUIVALENT · NON-CONVERTIBLE (CL-INV-007 gereği).
- **INTERNAL OFFICE APPROVAL:** ayrı authority fact (ADR-009; iç/patron onayı).
- **TARGET-DOMAIN EXECUTION:** ayrı business-effect fact (mutation hedef domainde kalır).
- **PER-SUBJECT SUFFICIENCY:** OPEN OWNER DECISION (hangi subject'te hangi fact yeterli — bu kararla topluca çözülmedi).
- **PORTAL / EXTERNAL-CLIENT AUTHORITY:** OPEN under POL-C.
- **EXTERNAL-TRACK IMPLEMENTATION:** NOT AUTHORIZED.
- **AS-IS DISPOSITION:** mevcut staff-recorded approval evidence bir authenticated external-client act olarak temsil EDİLEMEZ.

Bu disposition schema/enum/route/authentication implementation önermez; global provenance modeli C'dir, subject-level yeterlilik ayrıca belirlenecektir. Bu charter A/B/D seçeneklerini yasaklı subject-level sonuç olarak göstermez; D'nin subject-taxonomy kaygısı Option C içinde per-subject applicability olarak korunur.

## 8.B POL-A — Client Financial Authority Disposition (OWNER RATIFIED)

Bu bölüm CL-INV-007'yi (§5) ve §8.A POL-B disposition'ını **değiştirmez**; POL-A owner kararını disposition düzeyinde kaydeder (`decision-log.md` CLIENT-P1-POL-A-GOV).

- **STATUS:** OWNER RATIFIED
- **SELECTED MODEL:** SUBJECT-SPECIFIC EXISTING PREDICATE MATRIX (Model B)
- **CORE RULE:** Client-side financial request, approval ve execution yetkisi **financial subject'e göre** belirlenir.
- **NO SINGLE GLOBAL PREDICATE:** Tek bir predicate her Client financial yüzeyini yönetmez.
- **NEW ROLE / CAPABILITY:** NONE (yalnız mevcut kanonik predicate'ler reuse edilir).
- **PRODUCTION ENFORCEMENT:** AS-IS'in farklı olduğu yerlerde **ayrı bounded remediation gerektirir**; bu disposition production enforcement'ı tamamlanmış SAYMAZ.

### 8.B.1 Canonical Subject Matrix
- **CREDITOR DISPOSITION:** prepare → existing prepare eligibility; approve/post → existing approver eligibility; requester/approver ayrımı + existing four-eyes sınırı KORUNUR.
- **PAYOUT:** request → existing prepare eligibility; approve/finalize → PayoutApprovalPolicy; existing DBIND self-approval disposition KORUNUR.
- **OFFSET:** office-admin direct capability; existing OWN-29-A sınırı KORUNUR.
- **MANUAL RECOVERY / REVERSAL CLOSURE:** office-admin direct capability.
- **CLIENT FINANCIAL BALANCE / ADVANCE-CARI:** office-admin direct capability (PARTNER veya MANAGER); ek four-eyes YOK.
- **EXPENSE:** request/create → existing case-scoped request authority; distribution approval → existing approver eligibility (requester ≠ approver ayrık); payment recording/reversal → office-admin execution authority.
- **CLIENT STATEMENT ISSUE / VOID:** office-admin direct capability.
- **FEE / CONTRACT CONTEXT:** existing approver eligibility; money-out authority ÜRETİLMEZ.

### 8.B.2 Predicate Meanings
- **OFFICE-ADMIN CAPACITY:** PARTNER veya MANAGER direct capability, yalnız açıkça adlandırılmış subject'ler için.
- **APPROVER ELIGIBILITY:** mevcut OFFICE approver predicate; office-admin capacity ile birbirinin yerine geçmez.
- **PAYOUT APPROVAL POLICY:** mevcut payout-specific predicate; diğer subject'lere genellenmez.
- **PREPARE ELIGIBILITY:** request/preparation yetkisi; approval/execution/reversal yetkisi DEĞİL.

### 8.B.3 POL-B Consumption
- **AUTHENTICATED EXTERNAL-CLIENT DECISION:** subject-specific prerequisite fact OLABİLİR.
- **STAFF-RECORDED CLIENT STATEMENT / INSTRUCTION:** subject-specific provenance fact OLABİLİR.
- **İKİ FACT'İN HİÇBİRİ:** internal financial approval, execution veya target-domain mutation yetkisi VERMEZ.
- **PER-SUBJECT CONSENT APPLICABILITY:** OPEN / OWNER-GATED (POL-B).

### 8.B.4 Explicit Non-Selections
- `canApproveFinance`: canonical financial authority olarak SEÇİLMEDİ.
- CasePolicyEngine: ETKİNLEŞTİRİLMEDİ / SEÇİLMEDİ.
- PermissionGrant: ETKİNLEŞTİRİLMEDİ / SEÇİLMEDİ.
- UserRole: subject-specific matrix'in yerine geçmez.
- CLIENT CONSENT: financial request/approval/execution/mutation predicate DEĞİL.
- Bu non-selection'ların retirement/activation kararı bu disposition'da VERİLMEZ.

### 8.B.5 MANAGER Asymmetry
- **MANAGER AUTHORITY: SUBJECT-SPECIFIC / INTENTIONAL.** DAHİL: office-admin direct-capability subject'leri + payout-specific approval. OTOMATİK DAHİL DEĞİL: generic approver-eligibility subject'leri. **Global role normalization YETKİLENDİRİLMEDİ.**

Bu disposition schema/enum/route/wiring implementation önermez; predicate map **reference-only**'dir; production enforcement ayrı owner-gated bounded remediation'a bağlıdır.

## 9. Upgrade Rule

- **FULL CLIENT DOMAIN LAW:** Phase 0'da GEREKMEZ.
- **UPGRADE (charter → full Domain Law) yalnız şu koşullarda değerlendirilebilir:** charter sınırları yetersiz kalırsa, stable invariant hacmi materyal olarak büyürse, veya yeni Client-specific authority çatışmaları doğarsa.
- **UPGRADE AUTHORITY:** AYRI OWNER KARARI. Bu charter upgrade'i başlatmaz veya ima etmez.

## 10. Document Self-Check

Bu belge: yalnız Client ownership / invariants / cross-domain contracts konsolide eder; kendini full Domain Law olarak tanımlamaz; mevcut Domain Law veya owner-decision otoritesini yeniden sahiplenmez / override etmez; hiçbir yeni ürün / finans / portal / KVKK politikası seçmez; teknik mekanizma / route / model / field / exploit detayı içermez; **IMPLEMENTATION AUTHORITY: NONE**.

## 11. CLIENT-P1-BP-01 — Client Capability / Aggregate / Lifecycle Map (BOUNDED CONSOLIDATION — OWNER RATIFIED)

Bu bölüm `CLIENT-P1-BP-01` read-only analizinin **owner-ratified bounded consolidation**'ıdır (`decision-log.md` CLIENT-P1-BP-01-GOV; **MODEL 1 — BOUNDED CONSOLIDATION MAP**). Yalnız mevcut kanonik gerçekleri (AS-IS schema + charter §3–§8.B + XDC-A–E + POL-A + POL-B + SYSTEM-CONSTITUTION + DBIND) **konsolide eder**; yeni domain authority, policy, role, rank, predicate veya lifecycle mekanizması ÜRETMEZ. §5 `CL-INV-001..008`, §6 XDC-A–E, §8.A POL-B ve §8.B POL-A metinlerini **semantik olarak değiştirmez veya yeniden yorumlamaz**. Bu bölüm CLIENT domain kayıtlarını **yapısal/mimari konsolidasyon sözlüğü** olarak adlandırır (şema zaten repository'de kanoniktir); route/method/field-wiring/exploit/tenant-bypass mekanizma detayı İÇERMEZ (§10 self-check bu kapsamla geçerlidir). **IMPLEMENTATION AUTHORITY: NONE.**

### 11.1 Capability Boundary

- **CLIENT-OWNED capabilities:** client identity/profile; representation & mandate; client instruction/declaration; client approval-**requirement/request** context; client-facing visibility **context** (policy OPEN); communication preferences; fee/contract **context** (money-out authority ÜRETMEZ); client-side creditor identity (creditor set); external-client onboarding intake; external-client portal identity (approval'a UNWIRED).
- **CLIENT tarafından yalnız TÜKETİLEN (cross-domain; okuma; sahiplenilmez):** OFFICE internal approval kararı + actor identity (XDC-A); RECEIVABLE claim/receivable kompozisyonu (XDC-B); COLLECTION posted disposition → payable/payout/offset/statement (XDC-C); DEBTOR legal-status bağlamı (XDC-D); shared-kernel document/evidence + auth infrastructure (XDC-E); OFFICE financial predicate'leri (POL-A reuse).
- **AUTHORITY SAHİPLERİ (yeniden sahiplenilmez):** OFFICE (`SYS-GOV-014`) · RECEIVABLE (`SYS-GOV-017`) · COLLECTION (`SYS-GOV-018`) · DEBTOR (`SYS-GOV-016`) · shared-kernel (`SYS-GOV-019`). **XDC-A–E TÜKETİLİR; YENİDEN SAHİPLENİLMEZ.**

### 11.2 Structural Map (AS-IS records — precision preserved)

`onDelete` / foreign-key / tenant-column yapıları **supporting evidence** olarak kullanılır; **tek başına normatif aggregate kanıtı değildir.**

- **`Client`** — primary client identity/profile root.
- **`ClientContact` / `ClientAddress` / `ClientBankAccount`** — Client-owned **component record**'lar (canonical VALUE OBJECT olarak KESİNLEŞTİRİLMEZ).
- **`ClientPowerOfAttorney`** — identity-bearing **mandate record/entity**; client relationship bağlamında değerlendirilir.
- **`ClientApprovalRequest` + `ClientApprovalEvent`** — ayrı **approval-request / provenance ledger** (staff-recorded provenance = POL-B FACT B).
- **`ClientIntelStatement`** — ayrı **instruction/declaration evidence record**.
- **`ClientIntakeLink` ve alt kayıtları** — ayrı **onboarding/intake process boundary**.
- **`CaseClient`** — canonical **creditor-relationship record**; **AGGREGATE OWNERSHIP/TOPOLOGY NOT DECIDED → BP-02 OPEN SLOT**.
- **`ClientPortalUser`** — linked **external-client identity**; **Client aggregate membership NOT DECIDED**; portal authority ve boundary **BP-05'e ertelenir**.

### 11.3 Entity / Component / Evidence Classification

Üç sınıf kullanılır; component record'lar için canonical **VALUE OBJECT hükmü KURULMAZ**:

- **IDENTITY-BEARING ENTITY / RECORD:** `Client` · `CaseClient` · `ClientPortalUser` · `ClientApprovalRequest` · `ClientIntelStatement` · `ClientPowerOfAttorney` · `ClientIntakeLink` (+ intake submission kayıtları).
- **CLIENT-OWNED COMPONENT RECORD:** `ClientContact` · `ClientAddress` · `ClientBankAccount` · `ClientStatementLine` (+ mandate flat capability alanları component attribute olarak).
- **EVIDENCE / IMMUTABLE FACT / LEDGER:** `ClientApprovalEvent` (append-only geçiş defteri) · `ClientStatement` (immutable snapshot + `supersededById`) · `ClientIntelStatement` beyan değeri (immutable) · `ClientApprovalRequest` karar kaydı (staff-recorded = **POL-B FACT B**).
- **NAMED GAP (doldurulmaz):** POL-B **FACT A** (authenticated external-client decision) için AS-IS bağımsız evidence kaydı YOK (PORTAL channel tanımlı, external-track UNWIRED / NOT AUTHORIZED). Adlandırılır, ÇÖZÜLMEZ.

### 11.4 Lifecycle Precision (AS-IS STATE SET; TRANSITION CONTRACT NOT YET CANONICAL)

**Mevcut state set'leri (yalnız kayıt; enum üyeliğinden transition legality ÇIKARILMAZ):**

- `PoaStatus` = {PENDING, ACTIVE, EXPIRED, REVOKED}
- `ClientApprovalStatus` = {DRAFT, SENT, APPROVED, REJECTED, EXPIRED, CANCELLED}
- `ClientIntelStatus` = {ACTIVE, RETRACTED, SUPERSEDED, FALSE_POSITIVE}
- `ClientContactFollowUpStatus` = {ACTIVE, WAIVED, COMPLETED}
- `Client.isActive` = {true, false}

**TRANSITION CONTRACT: NOT YET CANONICAL.** Bu bölüm yalnız state set'leri kaydeder; hangi geçişin meşru olduğu code/test/mevcut canonical evidence ile ayrıca doğrulanmadan transition olarak yazılmaz. Doğrulanmamış geçişler **AS-IS STATE SET / TRANSITION CONTRACT NOT YET CANONICAL** olarak işaretlidir. Lifecycle redesign/normalization bu görevde YAPILMAZ.

**MANDATE DUAL-REPRESENTATION TENSION (kayıt):** mandate hem `Client` flat capability alanları (`canCollect` / `canWaive` / `canSettle` / `canRelease`; lifecycle'sız) hem de `ClientPowerOfAttorney` artifact'ı (`PoaStatus` + scope + validity) ile temsil edilir. Bu ikili temsil **tension olarak açıkça kaydedilir**; çözüm/normalization BP-02'ye aittir (OPEN SLOT).

### 11.5 Authority & Invariant Mapping (YENİ INVARIANT ID YOK)

BP-01 sonuçları mevcut otoritelere **map edilir** (yeni system/charter invariant ID üretilmez): `CL-INV-001..008` · §6 XDC-A–E · §8.B POL-A · §8.A POL-B · SYSTEM-CONSTITUTION · DBIND.

Özellikle korunan ayrımlar:

- **CONSENT ≠ INTERNAL APPROVAL** (`CL-INV-007`; ADR-009; §8.A).
- **CONSENT ≠ FINANCIAL AUTHORITY** (§8.B.3; POL-A).
- **STAFF-RECORDED FACT ≠ AUTHENTICATED EXTERNAL-CLIENT FACT** (`CL-INV-007`; §8.A dual-track).
- **MANDATE SCOPE ≠ EXECUTION AUTHORITY** (§8.B POL-A; mandate capability = scope context).
- **CLIENT SETTLEMENT ≠ LEGAL SETTLEMENT** (`CL-INV-004`; `SYS-LEGAL-009` / `SYS-LEGAL-010`; XDC-D).
- **TENANT ISOLATION ≠ CLIENT-FACING VISIBILITY** (`CL-INV-006`; `SYS-AUTH-008`).
- Creditor identity `CaseClient` / creditor set üzerinden belirlenir; `Case.clientId` finansal/party authority DEĞİL (`CL-INV-002` / `CL-INV-003`; DBIND §1).

### 11.6 Open-Slot Register (yalnız pointer; ÇÖZÜLMEZ)

- `CaseClient` aggregate topology → **BP-02**
- Relationship / mandate lifecycle detail → **BP-02**
- Per-subject consent sufficiency → **BP-04**
- Portal / external-client authority ve identity boundary → **BP-05**
- Portal / document RBAC → **BP-05 / POL-J**
- Masking ve aggregate visibility → **BP-06**
- KVKK retention / anonymization / legal hold → ilgili sonraki section
- Financial enforcement delta → ayrı owner-gated remediation
- Reversal / ledger reconciliation / ADR-013 / ADR-014 → ilgili diğer programlar

### 11.7 BP-01 Self-Check

Bu bölüm: yalnız mevcut kanonik gerçekleri konsolide eder; yeni authority/policy/role/rank/predicate/lifecycle mekanizması üretmez; `CaseClient` aggregate ownership/topology'sini SEÇMEZ; `ClientPortalUser`'ı Client aggregate'ine kesin dahil ETMEZ; component record'ları canonical value object İLAN ETMEZ; enum-only transition çıkarımı YAPMAZ; `CL-INV-001..008` / §6 / §8.A / §8.B'yi değiştirmez; portal / masking / KVKK / aggregate-visibility policy'si SEÇMEZ; financial remediation veya external-approval implementation AÇMAZ; route/field-wiring/exploit detayı İÇERMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 12. CLIENT-P1-BP-02 — Client Relationship / Mandate Lifecycle Map (BOUNDED CONSOLIDATION — OWNER RATIFIED)

Bu bölüm `CLIENT-P1-BP-02` read-only analizinin **owner-ratified bounded consolidation**'ıdır (`decision-log.md` CLIENT-P1-BP-02-GOV; **MODEL 1 — BOUNDED RELATIONSHIP / MANDATE LIFECYCLE CONSOLIDATION**). Mevcut kanonik gerçekleri (AS-IS kod/schema + charter §3–§8.B + §11 + XDC-A–E + POL-A + POL-B + SYSTEM-CONSTITUTION + DBIND) ve owner topology / mandate-evidence kararlarını **konsolide eder**; yeni domain authority, policy, role, rank, predicate veya lifecycle mekanizması ÜRETMEZ. §5 `CL-INV-001..008`, §6 XDC-A–E, §8.A POL-B, §8.B POL-A ve §11 metinlerini **semantik olarak değiştirmez veya yeniden yorumlamaz**. CLIENT domain kayıtlarını **yapısal/mimari konsolidasyon sözlüğü** olarak adlandırır; route/method/field-wiring/exploit detayı İÇERMEZ. **IMPLEMENTATION AUTHORITY: NONE; runtime/schema/writer-routing değişikliği ÖNERMEZ.** Bu bölüm §11'in `CaseClient` aggregate-topology açık slotunu (§11.2) owner kararıyla **KAPATIR**.

### 12.1 Relationship Vocabulary (kesin ayrım)

Yedi ayrık kavram (birbirine indirgenemez): **client identity** (`Client`) · **creditor relationship** (`CaseClient` rol ALACAKLI/ORTAK_ALACAKLI — CANONICAL FACT, `CL-INV-003`) · **representation** (`PoaLawyer` / `CaseLawyer`) · **mandate** (yetki kapsamı) · **power of attorney** (`ClientPowerOfAttorney` artifact) · **instruction** (`ClientIntelStatement`) · **approval / provenance** (`ClientApprovalRequest`+`ClientApprovalEvent`; POL-B FACT A/B).

### 12.2 CaseClient — Topology (OWNER RATIFIED)

- **`CaseClient` = CLIENT-OWNED SEPARATE RELATIONSHIP AGGREGATE** (owner kararı). Canonical creditor-relationship fact'ini taşır (rol ALACAKLI/ORTAK_ALACAKLI; `CL-INV-003`).
- **DEĞİL:** Case aggregate child DEĞİL · Client aggregate child DEĞİL · ayrı bounded context DEĞİL.
- AS-IS yapı (case-create tx içinde create-only; `@@unique(caseId,clientId)`; kendi `tenantId` kolonu yok; Cascade FK) = **yalnız supporting evidence, normatif aggregate kanıtı DEĞİL**. **DATABASE RELATION ≠ DDD AGGREGATE OWNERSHIP.**
- Bu karar §11.2'nin "`CaseClient` aggregate topology NOT DECIDED → BP-02 OPEN SLOT" ifadesini **RESOLVE eder**.
- **IMPL NONE:** bu ownership kararı runtime/schema/writer-routing'i DEĞİŞTİRMEZ (AS-IS create-only davranış korunur; detach/role-change/archive AS-IS'te YOK).

### 12.3 Mandate Canonical Evidence (OWNER RATIFIED)

- **CANONICAL MANDATE EVIDENCE = `ClientPowerOfAttorney` artifact** (owner kararı): noter metadata + scope (`PoaScopeType`) + validity (`isLimited`/`validUntil`) + capability + `PoaStatus` lifecycle + `PoaLawyer`.
- **`Client` flat mandate flag'leri (`canCollect`/`canWaive`/`canSettle`/`canRelease`) = LEGACY CLIENT-LEVEL CAPABILITY INDICATORS** — **legal mandate evidence DEĞİL · execution authority DEĞİL** (owner kararı).
- **MANDATE SCOPE ≠ FINANCIAL EXECUTION AUTHORITY** (§8.B POL-A).
- Dual-representation (aynı 4 boolean HEM Client-seviyesi indicator HEM PoA-seviyesi evidence) **tension olarak kaydedilir**; reconciliation bir runtime değişikliği DEĞİLDİR ve bu görevde YAPILMAZ (ayrı owner-gated).

### 12.4 Lifecycle — AS-IS STATE SET + VERIFIED TRANSITIONS

**ENUM VALUE SET ≠ LEGAL TRANSITION GRAPH.** Aşağıda yalnız kod-kanıtlı geçişler transition'dır.

- **PoA state set:** {PENDING, ACTIVE, EXPIRED, REVOKED}.
- **Verified transitions (kod-kanıtlı):** (create) → **ACTIVE**; **ACTIVE → REVOKED** (revoke; mevcut OFFICE approver-eligibility ile capability-gated — **mandate-lifecycle governance gate, POL-A finansal predicate DEĞİL**; audited); **ACTIVE → EXPIRED** (cron; `isLimited` + `validUntil<now`).
- **PENDING:** state-set üyesi; doğrulanmış production transition YOK (create hep ACTIVE; portal-amaçlı, unwired) → **AS-IS STATE SET / TRANSITION CONTRACT NOT CANONICAL.**
- Reactivation (REVOKED→\*, EXPIRED→ACTIVE): doğrulanmış kod yolu YOK.
- **`CaseClient`:** create-only; creation ötesi doğrulanmış relationship-lifecycle transition YOK.
- **`Client.isActive`:** client soft-state; relationship transition DEĞİL.
- **CLIENT INACTIVE ≠ RELATIONSHIP TERMINATION · REVOKED/EXPIRED POA ≠ CLIENT RELATIONSHIP END** (kod-doğrulanmış: revoke yalnız PoA'ya dokunur, CaseClient'a değil; isActive CaseClient'a bağlı değil).

### 12.5 Authority & Invariant Mapping (YENİ INVARIANT ID YOK)

Mevcut otoritelere map edilir; yeni system/charter invariant ID üretilmez.

- Creditor identity `CaseClient`/creditor set ile; `Case.clientId` creditor/finansal authority DEĞİL → `CL-INV-002`/`CL-INV-003`; DBIND §1.
- Mandate scope ≠ execution authority → §8.B POL-A.
- PoA revocation, mevcut OFFICE approver-eligibility ile gate'lenir (XDC-A actor/approval authority) — **mandate-lifecycle governance gate; POL-A finansal-predicate uygulaması DEĞİL.**
- Relationship persistence (CLIENT INACTIVE / REVOKED-EXPIRED PoA ilişkiyi sonlandırmaz) → `CL-INV-001` + §11 lifecycle precision; relationship (`CaseClient`) / client-state (`isActive`) / mandate-state (`PoaStatus`) = ayrık fact'ler.
- Consent/approval ≠ mandate ≠ financial authority → `CL-INV-007` / POL-B / POL-A (§11 altı non-equation korunur).
- Tenant consistency (`CaseClient` parent'lar üzerinden) → `SYS-AUTH-008` / `CL-INV-006` (supporting evidence only).

### 12.6 Open-Slot Register (yalnız pointer; ÇÖZÜLMEZ)

- **Relationship termination → OPEN / NOT SELECTED** (owner).
- KVKK retention / anonymization / legal hold → OPEN (ilgili sonraki section).
- Historical evidence retention → OPEN.
- External-client authority (PoA PENDING / portal) → **BP-05 / POL-C**.
- Per-subject consent sufficiency → **BP-04**.
- Mandate dual-representation reconciliation (runtime) → ayrı owner-gated (bu canonicalization DEĞİL).

### 12.7 BP-02 Self-Check

Bu bölüm: yalnız mevcut kanonik gerçekleri + owner kararlarını konsolide eder; `CaseClient`'ı **CLIENT-owned separate relationship aggregate** olarak kaydeder (Case/Client child DEĞİL, bounded context DEĞİL); `ClientPowerOfAttorney` artifact'ını **canonical mandate evidence** olarak kaydeder; flat flag'leri **legacy indicator** olarak sınırlar (evidence/authority DEĞİL); PoA revocation guard'ını **POL-A finansal predicate'i olarak GÖSTERMEZ**; relationship termination / KVKK / retention'ı **OPEN** bırakır; yeni authority/policy/role/rank/predicate/invariant-ID üretmez; `CL-INV-001..008` / §6 / §8.A / §8.B / §11'i değiştirmez; enum-only transition çıkarımı YAPMAZ; runtime/schema/writer-routing değişikliği ÖNERMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 13. CLIENT-P1-BP-03 — Client Instruction / Declaration Provenance Map (BOUNDED CONSOLIDATION — OWNER RATIFIED)

Bu bölüm `CLIENT-P1-BP-03` read-only analizinin **owner-ratified bounded consolidation**'ıdır (`decision-log.md` CLIENT-P1-BP-03-GOV; **MODEL 1 — BOUNDED INSTRUCTION / DECLARATION PROVENANCE CONSOLIDATION MAP**). Mevcut kanonik AS-IS gerçekleri (AS-IS kod/schema + charter §3–§8.B + §11 + §12 + XDC-A–E + POL-A + POL-B + SYSTEM-CONSTITUTION + DBIND) ve owner semantic-boundary / provenance kararlarını **konsolide eder**; yeni domain authority, policy, taxonomy, role, rank, predicate veya lifecycle mekanizması ÜRETMEZ. §5 `CL-INV-001..008`, §6 XDC-A–E, §8.A POL-B, §8.B POL-A, §11 ve §12 metinlerini **semantik olarak değiştirmez veya yeniden yorumlamaz**. CLIENT domain kayıtlarını **yapısal/mimari konsolidasyon sözlüğü** olarak adlandırır; route/method/field-wiring/exploit detayı İÇERMEZ. **IMPLEMENTATION AUTHORITY: NONE; runtime/schema/writer-routing değişikliği ÖNERMEZ.** **FIRST-CLASS AS-IS CLIENT INSTRUCTION AGGREGATE: ABSENT / NOT CLAIMED.**

### 13.1 Semantic Boundary

Ayrı tutulan kavramlar: **CLIENT DECLARATION** (müvekkile atfedilen olgu/beyan/bilgi) · **CLIENT INSTRUCTION** (belirli bir subject ve beklenen işlem/sonuç hakkında müvekkile atfedilen yönlendirici irade açıklaması) · **CLIENT REQUEST** (bir işlemin değerlendirilmesi/başlatılması talebi) · **CLIENT CONSENT** (belirli bir işleme ilişkin kabul/izin fact'i) · **INTERNAL OFFICE APPROVAL** (OFFICE-controlled karar) · **MANDATE** (PoA artifact ile kanıtlanan temsil/yetki kapsamı, §12) · **TARGET-DOMAIN EXECUTION** (ilgili domain tarafından gerçekleştirilen business effect).

**Canonical non-equations:** DECLARATION ≠ INSTRUCTION · INSTRUCTION ≠ CONSENT · INSTRUCTION ≠ INTERNAL OFFICE APPROVAL · INSTRUCTION ≠ MANDATE · INSTRUCTION ≠ FINANCIAL AUTHORITY · INSTRUCTION ≠ TARGET-DOMAIN EXECUTION · REQUEST ≠ APPROVAL.

### 13.2 AS-IS Record Classification

- **`ClientIntelStatement`** — **CLASS: STAFF-RECORDED CLIENT-ATTRIBUTED DECLARATION EVIDENCE**; POL-B ALIGNMENT: **FACT-B-LIKE RECORD**. **NOT AUTOMATICALLY:** client instruction · authenticated external-client act · consent · approval · mandate · execution authority. Precision: `createdById` = recorder/staff actor, **müvekkil principal identity DEĞİL**; `caseId` ve ilişkili creditor set **yalnız attribution context** sağlar; birden fazla `CaseClient` varsa hangi müvekkilin beyan sahibi olduğu AS-IS'te **kesin kanıtlanmayabilir**; doğrudan client/principal linkage eksikliği **OPEN provenance gap** olarak kaydedilir; bu görev schema/linkage çözümü SEÇMEZ.
- **`ClientApprovalRequest`** — approval-request/provenance ledger; staff-recorded decision fact = POL-B FACT B; **instruction aggregate DEĞİL**; internal OFFICE approval kararının yerine geçmez.
- **Intake promotion** — intake submission'dan promote edilen kayıt **authenticated external-client instruction sayılmaz**; staff review/promotion nedeniyle **FACT-B-like declaration evidence** olarak kalır; intake origin reference **korunması gereken provenance input**'tur; external authentication/authority **POL-C ve BP-05'e açıktır**.

### 13.3 Source / Provenance Classes

- **A. AUTHENTICATED EXTERNAL-CLIENT ACT** — POL-B FACT A — **AS-IS UNWIRED / OPEN.**
- **B. STAFF-RECORDED CLIENT STATEMENT** — POL-B FACT B — **AS-IS PRESENT.**
- **C. STAFF-PROMOTED INTAKE DECLARATION** — FACT-B-LIKE — **INTAKE PROVENANCE REQUIRED.**
- **D. COMMUNICATION-DERIVED CLIENT ACT** — **AS-IS CANONICAL PIPELINE ABSENT / OPEN.**
- **E. SYSTEM-DERIVED OR INFERRED DATA** — **NOT CLIENT INSTRUCTION.**

**Recorder identity ile principal/client identity birbirine EŞİTLENMEZ.**

### 13.4 Instruction Evidence Minimum Semantics

Blueprint **target semantic map**'inde gerçek bir client instruction'ın en az şu bağlara sahip olması gerektiği kaydedilir: TENANT CONTEXT · CLIENT / PRINCIPAL ATTRIBUTION · CREDITOR-RELATIONSHIP CONTEXT (when applicable) · SUBJECT · DIRECTIVE OR REQUEST CONTENT · SOURCE / PROVENANCE CLASS · RECORDER IDENTITY (when staff-recorded) · EVENT TIME · EVIDENCE REFERENCE · CURRENT EVIDENCE STATUS. **Bu liste persistence schema / DTO / API tasarımı DEĞİLDİR; alan/kolon ekleme yetkisi OLUŞTURMAZ.**

### 13.5 Evidence Lifecycle (VERIFIED AS-IS ONLY)

Yalnız doğrulanmış AS-IS davranışları canonical fact: **CREATE → ACTIVE** · **ACTIVE → RETRACTED** · **ACTIVE → FALSE_POSITIVE** · **ACTIVE → SUPERSEDED (+ NEW ACTIVE RECORD)**. Precision: enum/state üyelerinden ek transition ÇIKARILMAZ; expiry transition'ı canonical DEĞİL; **retraction fiziksel silme DEĞİL**; supersession geçmiş evidence'ı yok ETMEZ; terminal state'lerden reactivation canonical DEĞİL; create authorization / actor guard ayrıntıları **target authority olarak yorumlanmaz.**

### 13.6 Contradiction and Precedence

AS-IS: aynı subject/category bağlamında birden fazla ACTIVE declaration bulunabilir; otomatik contradiction detection canonical DEĞİL; otomatik precedence rule canonical DEĞİL; duplicate/idempotency contract canonical DEĞİL; concurrent supersession için canonical compare-and-set contract YOK. Bunlar **veri-kalitesi ve lifecycle açık slotları**dır; bu görevde policy/implementation SEÇİLMEZ. Korunan hüküm: **MULTIPLE EVIDENCE RECORDS MAY COEXIST · COEXISTENCE ≠ EQUIVALENCE · NEWER RECORD ≠ AUTOMATIC LEGAL PRECEDENCE.**

### 13.7 Cross-Domain Consumption

Instruction/declaration evidence: OFFICE'e değerlendirme + approval context sağlayabilir; RECEIVABLE'a creditor context sağlayabilir (mutation authority VERMEZ); COLLECTION'a disposition context sağlayabilir (posting/money-out authority VERMEZ); DEBTOR'a client-attributed information sağlayabilir (debtor legal-status authority VERMEZ); DOCUMENT/PORTAL yüzeylerine evidence context sağlayabilir (external authority VERMEZ). **XDC-A–E tüketilir; authority CLIENT'e taşınmaz.** *(AS-IS doğrulanmış consumer: DEBTOR modülü yalnız count-read; target-domain mutation YOK.)*

### 13.8 Open-Slot Register (yalnız pointer; ÇÖZÜLMEZ)

- Authenticated external-client source → **BP-05 / POL-C**
- Per-subject consent sufficiency → **BP-04**
- Instruction subject taxonomy → **BP-03 successor owner decision**
- Principal/client direct attribution mechanism → implementation/remediation
- Contradiction and precedence policy → ayrı owner decision
- Communication-derived instruction capture → **BP-05** veya ayrı bounded unit
- Intake provenance preservation → implementation input
- KVKK retention / anonymization / legal hold → ilgili policy section
- Idempotency / concurrency hardening → ayrı implementation authority

### 13.9 Status Precision

**CLIENT-P1-BP-03: BOUNDED PROVENANCE MODEL** · **`ClientIntelStatement`: DECLARATION EVIDENCE, NOT AUTOMATICALLY INSTRUCTION** · **AUTHENTICATED EXTERNAL-CLIENT INSTRUCTION: AS-IS ABSENT / OPEN** · **DIRECT CLIENT PRINCIPAL ATTRIBUTION: AS-IS PARTIAL / GAP** · **BUSINESS-EFFECT AUTHORITY: NONE** · **IMPLEMENTATION AUTHORITY: NONE.**

### 13.10 BP-03 Self-Check

Bu bölüm: yalnız mevcut kanonik gerçekleri + owner kararlarını konsolide eder; **first-class AS-IS client instruction aggregate'i ABSENT/NOT CLAIMED** olarak kaydeder; `ClientIntelStatement`'ı **otomatik instruction İLAN ETMEZ** (declaration evidence); recorder'ı client principal ile **EŞİTLEMEZ** (direct attribution AS-IS PARTIAL/GAP); intake promotion'ı **FACT A olarak GÖSTERMEZ**; system-derived data'yı client instruction SAYMAZ; instruction'dan business-effect authority ÜRETMEZ; yeni subject taxonomy / precedence / contradiction / consent / portal / KVKK policy SEÇMEZ; enum-only transition çıkarımı YAPMAZ; `CL-INV-001..008` / §6 / §8.A / §8.B / §11 / §12'yi değiştirmez; runtime/schema/writer-routing değişikliği ÖNERMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 14. CLIENT-P1-BP-04 — Client Approval / Consent Provenance Map (BOUNDED CONSOLIDATION — OWNER RATIFIED)

Bu bölüm `CLIENT-P1-BP-04` read-only analizinin **owner-ratified bounded consolidation**'ıdır (`decision-log.md` CLIENT-P1-BP-04-GOV; **MODEL 1 — BOUNDED APPROVAL / CONSENT PROVENANCE CONSOLIDATION MAP**). Mevcut kanonik AS-IS gerçekleri (AS-IS kod/schema + charter §3–§8.B + §11 + §12 + §13 + XDC-A–E + POL-A + POL-B + SYSTEM-CONSTITUTION + DBIND) ve owner kararlarını **konsolide eder**; yeni domain authority, policy, taxonomy, subject-sufficiency-selection, role, rank, predicate veya lifecycle mekanizması ÜRETMEZ. §5 `CL-INV-001..008`, §6 XDC-A–E, §8.A POL-B, §8.B POL-A, §11, §12 ve §13 metinlerini **semantik olarak değiştirmez veya yeniden yorumlamaz**. CLIENT domain kayıtlarını **yapısal/mimari konsolidasyon sözlüğü** olarak adlandırır; route/method/field-wiring/exploit detayı İÇERMEZ. **IMPLEMENTATION AUTHORITY: NONE; runtime/schema/writer-routing değişikliği ÖNERMEZ.** **PER-SUBJECT CONSENT SUFFICIENCY: OPEN / NOT SELECTED.** **AUTHENTICATED EXTERNAL-CLIENT DECISION (FACT A): AS-IS ABSENT / UNWIRED.**

### 14.1 Three-Track Model (ayrı ve NON-CONVERTIBLE)

- **TRACK A — Authenticated external-client act:** POL-B CLASS = FACT A; AS-IS = **ABSENT / UNWIRED**; client authentication = NOT IMPLEMENTED; business-effect authority = NONE. FACT A kaydı olsa dahi OFFICE internal approval yerine geçmez, financial authority oluşturmaz, target-domain execution gerçekleştirmez.
- **TRACK B — Staff-recorded client-attributed disposition:** POL-B CLASS = FACT B; AS-IS CARRIER = `ClientApprovalRequest` + `ClientApprovalEvent`; RECORDER = **STAFF ACTOR**; client principal authentication = **NOT PROVEN**; business-effect authority = NONE. `APPROVED`/`REJECTED` statüsü personelce kaydedilen disposition fact'idir; otomatik authenticated client consent DEĞİL; recorder identity'yi client principal identity'ye DÖNÜŞTÜRMEZ; **FACT A'ya YÜKSELTİLEMEZ**.
- **TRACK C — Internal Office approval:** AS-IS CARRIER = `OfficeApprovalRequest`; AUTHORITY OWNER = OFFICE; FUNCTION = INTERNAL APPROVAL GATE; target-domain execution = SEPARATE. Track C client consent DEĞİL, CLIENT authority DEĞİL, tek başına execution DEĞİL; ilgili target-domain işlemini yalnız canonical contract uyarınca gate edebilir.

### 14.2 Canonical Non-Equations

`CLIENTAPPROVALREQUEST ≠ AUTHENTICATED CLIENT CONSENT` · `CLIENTAPPROVALREQUEST ≠ OFFICEAPPROVALREQUEST` · `FACT A ≠ FACT B` · `FACT B ≠ INTERNAL OFFICE APPROVAL` · `CLIENT CONSENT ≠ CLIENT INSTRUCTION` · `CLIENT CONSENT ≠ MANDATE` · `CLIENT CONSENT ≠ FINANCIAL AUTHORITY` · `APPROVAL EVIDENCE ≠ EXECUTION AUTHORIZATION` · `INTERNAL OFFICE APPROVAL ≠ TARGET-DOMAIN EXECUTION` · `RECORDER IDENTITY ≠ CLIENT PRINCIPAL IDENTITY`.

### 14.3 AS-IS Client Approval Ledger

`ClientApprovalRequest` + `ClientApprovalEvent` = bounded approval-request/provenance ledger. **Verified lifecycle (kod-kanıtlı):** CREATE → DRAFT · DRAFT → SENT · SENT → APPROVED · SENT → REJECTED · SENT → EXPIRED · {DRAFT / SENT} → CANCELLED. Precision: yalnız kod/test ile doğrulanmış geçişler yazılır; enum üyelerinden ek transition ÇIKARILMAZ; terminal disposition'dan revocation/supersession canonical DEĞİL; event kayıtları historical evidence'dır; **`PORTAL` channel değeri external-client authentication kanıtı DEĞİL**; decision recorder'ın **staff actor** olması açıkça korunur.

### 14.4 Subject Inventory and Sufficiency

AS-IS envanter (yalnız mevcut değerler): **`EXPENSE_REQUEST`** · **`OPERATION`** · **`OTHER`**.

**Canonical sufficiency kararı:**

| Subject | Canonical semantik | FACT-B yeterliliği | FACT-A zorunluluğu |
|---|---|---|---|
| `EXPENSE_REQUEST` | Yetersiz / bounded label | **UNRESOLVED** | **UNRESOLVED** |
| `OPERATION` | Generic / instance-dependent | **UNRESOLVED** | **UNRESOLVED** |
| `OTHER` | Catch-all / semantik belirsiz | **UNRESOLVED** | **UNRESOLVED** |

**CANONICALIZE EDİLMEZ:** `EXPENSE_REQUEST = S5`; FACT B'nin herhangi bir subject için yeterli olduğu; FACT A'nın herhangi bir subject için zorunlu olduğu; subject etiketi üzerinden OFFICE approval veya execution zinciri türetilmesi. **Sufficiency ayrı owner `GO-DECIDE — PER-SUBJECT CONSENT SUFFICIENCY` olmadan SEÇİLMEZ.** (S1–S6 sınıflandırması analitik bir araçtır; canonical policy DEĞİLDİR.)

### 14.5 Evidence Gap / Policy Gap Ayrımı

- **EVIDENCE / CAPABILITY GAP:** authenticated external-client decision track absent · direct principal authentication absent · portal decision flow unwired.
- **POLICY GAP:** hangi subject client fact gerektirir · hangi subject FACT B kabul eder · hangi subject FACT A gerektirir · contradictory decision nasıl çözülür · approved disposition revoke/supersede edilebilir mi.
- **Capability gap ile policy gap birbirinin yerine KULLANILAMAZ.**

### 14.6 Replay / Contradiction / Concurrency

AS-IS açıkları bounded risk: request-level idempotency contract canonical DEĞİL; aynı subject için birden fazla request coexist edebilir; contradictory disposition'lar için precedence contract YOK; supersession/revocation contract YOK; concurrent terminal transition için canonical compare-and-set garantisi YOK. Korunan hüküm: **MULTIPLE RECORDS MAY COEXIST · COEXISTENCE ≠ EQUIVALENCE · NEWER RECORD ≠ AUTOMATIC LEGAL PRECEDENCE · TERMINAL STATUS ≠ IRREVOCABLE LEGAL CONSENT.** Bu görevde çözüm/implementation SEÇİLMEZ.

### 14.7 Cross-Domain Boundary

Client approval/consent evidence: OFFICE'e approval context sağlayabilir; RECEIVABLE'a context sağlayabilir (mutation authority VERMEZ); COLLECTION'a disposition context sağlayabilir (posting/payout/offset authority VERMEZ); DEBTOR'a context sağlayabilir (legal-status authority VERMEZ); portal/document yüzeylerine evidence context sağlayabilir (external authority VERMEZ). **XDC-A–E tüketilir; başka domain authority'si CLIENT'e taşınmaz.** *(AS-IS: ledger defter-only; cross-module business-effect consumer YOK.)*

### 14.8 Open-Slot Register (yalnız pointer; ÇÖZÜLMEZ)

- Per-subject consent sufficiency
- FACT-A gerektiren subject'ler
- FACT-B'nin yeterli kabul edilebileceği subject'ler
- Portal / external-client authority → **BP-05 / POL-C**
- Direct client principal attribution
- Contradiction and precedence policy
- Decision revocation / supersession policy
- Idempotency / concurrency hardening
- KVKK retention / anonymization / legal hold
- Target-domain consumption and enforcement implementation

### 14.9 Status Precision

**CLIENT-P1-BP-04: BOUNDED APPROVAL / CONSENT PROVENANCE MODEL** · **`ClientApprovalRequest`: FACT-B LEDGER, NOT AUTHENTICATED CLIENT CONSENT** · **`OfficeApprovalRequest`: INTERNAL OFFICE APPROVAL GATE, NOT TARGET-DOMAIN EXECUTION** · **PER-SUBJECT CONSENT SUFFICIENCY: OPEN / NOT SELECTED** · **AUTHENTICATED FACT-A: AS-IS ABSENT / UNWIRED** · **BUSINESS-EFFECT AUTHORITY: NONE** · **IMPLEMENTATION AUTHORITY: NONE.**

### 14.10 BP-04 Self-Check

Bu bölüm: yalnız mevcut kanonik gerçekleri + owner kararlarını konsolide eder; üç track'i (FACT A / FACT B / OFFICE) ayrı ve non-convertible kaydeder; `APPROVED` statüsünü **authenticated client consent olarak GÖSTERMEZ**; FACT B'yi FACT A'ya **YÜKSELTMEZ**; recorder'ı client principal ile **EŞİTLEMEZ**; `PORTAL` channel'ı **wired external flow olarak GÖSTERMEZ**; `OfficeApprovalRequest`'i **target-domain execution authority olarak GÖSTERMEZ**; per-subject sufficiency (S1–S6 dahil) **canonical policy YAPMAZ** (tümü UNRESOLVED/OPEN); yeni subject taxonomy / contradiction / precedence / portal / KVKK policy SEÇMEZ; enum-only transition çıkarımı YAPMAZ; `CL-INV-001..008` / §6 / §8.A / §8.B / §11 / §12 / §13'ü değiştirmez; runtime/schema/writer-routing değişikliği ÖNERMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 15. CLIENT-P1-BP-07 — Client Financial Relationship Model (BOUNDED CONSOLIDATION — OWNER RATIFIED)

Bu bölüm `CLIENT-P1-BP-07` read-only analizinin **owner-ratified bounded consolidation**'ıdır (`decision-log.md` CLIENT-P1-BP-07-GOV; **MODEL 1 — BOUNDED FINANCIAL RELATIONSHIP CONSOLIDATION MAP**). Mevcut kanonik AS-IS gerçekleri (AS-IS kod/schema + charter §3–§8.B + §11–§14 + XDC-A–E + POL-A + POL-B + T04 Financial Boundary Map + SYSTEM-CONSTITUTION + DBIND) ve owner kararlarını **konsolide eder**; yeni domain authority, ledger, financial policy, global predicate veya lifecycle mekanizması ÜRETMEZ. §5 `CL-INV-001..008`, §6 XDC-A–E, §8.A POL-B, §8.B POL-A, §11, §12, §13 ve §14 metinlerini **semantik olarak değiştirmez**. CLIENT domain kayıtlarını **yapısal/mimari konsolidasyon sözlüğü** olarak adlandırır; route/method/field-wiring/exploit **ve agent/lane/storage-type/precision-format detayı İÇERMEZ**. **IMPLEMENTATION AUTHORITY: NONE.** **SINGLE CLIENT-FINANCIAL LEDGER SOURCE-OF-TRUTH: NOT SELECTED.** **BALANCE RECONCILIATION POLICY: OPEN / NOT SELECTED.** **FINANCIAL REMEDIATION: NOT AUTHORIZED.**

### 15.1 Client Financial Boundary

**CLIENT yalnız şunların sahibidir:** creditor relationship context · mandate and instruction context · client-side provenance · creditor disposition context · client-facing financial presentation context · fee/contract context.
**CLIENT şunların sahibi DEĞİLDİR:** receivable composition · legal allocation · collection receipt ledger · payable/payout/offset execution · money-out posting · accounting journal · bank execution.

### 15.2 Canonical Authority Map

- **RECEIVABLE:** claim and receivable composition; legal allocation authority.
- **COLLECTION:** receipt, payable, payout, offset, posting ve money-out authority.
- **ACCOUNTING:** accounting representation ve journal authority.
- **OFFICE:** actor eligibility ve internal approval gate.
- **CLIENT:** creditor relationship, mandate, instruction, client-side provenance ve financial context.

Başka domain authority'si CLIENT'e **taşınmaz**.

### 15.3 Record ≠ Authority

**A RECORD DOES NOT CREATE AUTHORITY.** Authority şuradan türer: canonical policy · actor eligibility · cross-domain contract · approval requirements. Bu nedenle: `OfficeApprovalRequest` = internal approval workflow/evidence record; `CollectionDisposition` = shared disposition workflow/state record; `ClientApprovalRequest` = client-attributed provenance ledger. **Bunların hiçbiri kendi başına actor veya execution authority ÜRETMEZ.**

### 15.4 Advance / Cari Dual Representation

Mevcut yüzeyler: `CaseBalance` = **AS-IS current stored balance state**; `BalanceLedger` = **AS-IS movement history / evidence**. **Canonical karar:** SINGLE SOURCE-OF-TRUTH PRECEDENCE = **NOT SELECTED**; RECONCILIATION CONTRACT = **NOT CANONICAL**; DRIFT HANDLING = **OPEN / OWNER-GATED**. **YAZILMAZ:** `BalanceLedger` tek canonical source-of-truth'tur; `CaseBalance` tek canonical ledger'dır; iki temsil her koşulda mutlak eşleşir; bu yapı COLLECTION veya ACCOUNTING ledger'ıdır. `CaseBalance` ve `BalanceLedger`, mevcut advance/cari yüzeyinin **iki AS-IS temsilidir**; aralarındaki canonical precedence ve reconciliation **ayrı owner kararı gerektirir**.

### 15.5 Client Statement Semantics

`ClientStatement` = **CLIENT-owned, client-facing, IMMUTABLE statement/evidence artifact**. **DEĞİL:** collection ledger · accounting journal · canonical balance source · live mutable account. Statement: belirli zamanda oluşturulmuş finansal sunum/evidence artifact'ıdır; kaynak finansal kayıtları yeniden sahiplenmez; source kayıtları değiştirmez; **daha yeni statement otomatik olarak eski statement'ın hukuki yanlışlığını KANITLAMAZ**; supersession/void **underlying ledger reversal DEĞİLDİR**.

### 15.6 Payout Semantics

**PAYOUT REQUEST ≠ INTERNAL APPROVAL ≠ BANK EXECUTION ≠ PAYOUT RECORDING ≠ REVERSAL/RECOVERY.** `ClientPayout` = **COLLECTION-owned payout recording evidence**. **DEĞİL:** bank execution proof · client-owned money-out authority · accounting journal. **AS-IS banka transfer execution mekanizması modellenmemiştir; kayıt otomatik banka icrası kanıtı SAYILMAZ.** Legacy payout-recording yolu yalnız **bounded implementation gap** olarak kaydedilir (somut method/route/agent-lane ayrıntısı bu belgeye yazılmaz).

### 15.7 Offset Semantics

**OFFSET CONTEXT ≠ OFFSET APPROVAL ≠ OFFSET EXECUTION ≠ OFFSET RECORDING.** Offset authority **COLLECTION**'dadır; OFFICE actor eligibility yalnız canonical gate sağlar; CLIENT yalnız creditor/context tarafını sağlar.

### 15.8 Creditor Disposition Shared Contract

`CollectionDisposition` = CLIENT ve COLLECTION arasında **shared contract record**. **CLIENT PROVIDES:** creditor identity · creditor relationship context · disposition scope · client-side provenance (when applicable). **OFFICE PROVIDES:** internal approval gate ve actor eligibility. **COLLECTION OWNS:** posting · payable creation · offset/payout financial effect · money-out state transition. **CLIENT posting/financial-effect authority'sini SAHİPLENMEZ.** Financial effect'in yalnız canonical posting aşamasında oluştuğu AS-IS transition fact olarak kaydedilir.

### 15.9 POL-A Application

POL-A subject-specific model korunur: tek global predicate YOK; requester / approver / executor / recorder AYRI; four-eyes yalnız canonical gerekli subject'lerde; MANAGER authority global normalize EDİLMEZ; client consent / PoA flag financial predicate DEĞİL; `OfficeApprovalRequest` target-domain execution DEĞİL. **POL-A target ile AS-IS enforcement AYRI gösterilir.**

### 15.10 POL-B / Consent Boundary

BP-04 kararı korunur: **PER-SUBJECT CONSENT SUFFICIENCY = OPEN / NOT SELECTED · FACT A REQUIREMENT = UNRESOLVED · FACT B SUFFICIENCY = UNRESOLVED.** Client fact: financial authority ÜRETMEZ; OFFICE approval yerine geçmez; target-domain execution gerçekleştirmez; subject label üzerinden zorunlu KABUL EDİLMEZ.

### 15.11 AS-IS Enforcement Delta

Şu yüzeyler implementation/remediation input'u olarak kaydedilir: advance/cari actor enforcement · expense approval/payment enforcement · statement issue/void enforcement · payout-request floor · legacy payout-recording path · idempotency/concurrency gaps · stored-state/movement-history reconciliation gap. **AS-IS DELTA = KNOWN / NON-ZERO. REMEDIATION = NOT AUTHORIZED. BLUEPRINT CANONICALIZATION DOES NOT AUTHORIZE CODE.**

### 15.12 Precision / Currency

Representation farklılığı yalnız **implementation-boundary riskidir**. Bu belgeye somut database type / precision / storage-format **normatif model olarak YAZILMAZ**. Canonical: **FINANCIAL REPRESENTATIONS MAY DIFFER ACROSS CLIENT / COLLECTION / ACCOUNTING; CONVERSION AND RECONCILIATION CONTRACT = NOT SELECTED IN BP-07.**

### 15.13 Other-Program Routing

REVERSAL / MANUAL RECOVERY → **COLLECTION PROGRAM** · STORED-BALANCE RECONCILIATION → **SEPARATE OWNER-GATED UNIT** · ACCOUNTING JOURNAL RECONCILIATION → **ACCOUNTING BOUNDARY** · ADR-013 → **OTHER PROGRAM** · ADR-014 → **OTHER PROGRAM**. Bu konular CLIENT blueprint içinde çözülmez.

### 15.14 Canonical Non-Equations

`CLIENT FINANCIAL CONTEXT ≠ RECEIVABLE AUTHORITY` · `CLIENT FINANCIAL CONTEXT ≠ COLLECTION LEDGER AUTHORITY` · `CASEBALANCE ≠ COLLECTION LEDGER` · `BALANCELEDGER ≠ COLLECTION RECEIPT LEDGER` · `CLIENT STATEMENT ≠ FINANCIAL LEDGER` · `CLIENT SETTLEMENT ≠ LEGAL SETTLEMENT` · `PAYOUT RECORD ≠ BANK EXECUTION` · `OFFICE APPROVAL ≠ TARGET-DOMAIN EXECUTION` · `CLIENT CONSENT ≠ FINANCIAL AUTHORITY` · `MANDATE SCOPE ≠ EXECUTION AUTHORITY`.

### 15.15 Status Precision

**CLIENT-P1-BP-07: BOUNDED FINANCIAL RELATIONSHIP MODEL** · **CLIENT FINANCIAL AUTHORITY: CONTEXT ONLY** · **ADVANCE/CARI REPRESENTATION: DUAL AS-IS REPRESENTATION** · **SINGLE CANONICAL BALANCE SOT: NOT SELECTED** · **`ClientStatement`: IMMUTABLE CLIENT-FACING ARTIFACT, NOT LEDGER** · **`ClientPayout`: COLLECTION RECORDING EVIDENCE, NOT BANK EXECUTION** · **PER-SUBJECT CONSENT: OPEN / NOT SELECTED** · **IMPLEMENTATION AUTHORITY: NONE.**

### 15.16 BP-07 Self-Check

Bu bölüm: yalnız mevcut kanonik gerçekleri + owner kararlarını konsolide eder; `BalanceLedger`'ı tek canonical source-of-truth **İLAN ETMEZ**; `CaseBalance`'ı canonical collection ledger **İLAN ETMEZ**; `ClientStatement`'ı ledger **İLAN ETMEZ**; `ClientPayout`'u bank execution proof olarak **GÖSTERMEZ**; `OfficeApprovalRequest`'i execution authority olarak **GÖSTERMEZ**; Collection/Accounting authority'sini CLIENT'e **TAŞIMAZ**; per-subject consent **SEÇMEZ**; ledger-precedence / reconciliation / reversal / financial-remediation **SEÇMEZ**; teknik storage formatını normatif policy **YAPMAZ**; agent/lane bilgisi **İÇERMEZ**; yeni global financial predicate **ÜRETMEZ**; `CL-INV-001..008` / §6 / §8.A / §8.B / §11 / §12 / §13 / §14'ü değiştirmez; runtime/schema/writer-routing değişikliği ÖNERMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 16. CLIENT-P1-BP-08 — Cross-Domain Contract Consumption Map (BOUNDED CONSOLIDATION — OWNER RATIFIED)

Bu bölüm `CLIENT-P1-BP-08` read-only analizinin **owner-ratified bounded consolidation**'ıdır (`decision-log.md` CLIENT-P1-BP-08-GOV; **MODEL 1 — BOUNDED CROSS-DOMAIN CONTRACT CONSUMPTION MAP**). Mevcut kanonik AS-IS gerçekleri (AS-IS kod + charter §6 XDC-A–E + reciprocal clause'lar + §11–§15 + POL-A + POL-B + DBIND + SYSTEM-CONSTITUTION) ve owner kararlarını **konsolide eder**; yeni contract, contract owner değişikliği, contract version, event/API mimarisi veya policy ÜRETMEZ. §5 `CL-INV-001..008`, §6 XDC-A–E, §8.A POL-B, §8.B POL-A, §11–§15 metinlerini **semantik olarak değiştirmez**. CLIENT domain kayıtlarını **yapısal/mimari konsolidasyon sözlüğü** olarak adlandırır; route/method/field-wiring/exploit/agent-lane detayı İÇERMEZ. **IMPLEMENTATION AUTHORITY: NONE.** **CONTRACT REDESIGN: NOT AUTHORIZED.** **CONTRACT VERSIONING MODEL: NOT SELECTED.** **EVENT / API ARCHITECTURE: NOT AUTHORIZED.**

### 16.1 Core Consumption Rule

`CONSUMING A FACT ≠ OWNING THE FACT` · `REFERENCING A RECORD ≠ OWNING THE AGGREGATE` · `SHARED WORKFLOW RECORD ≠ SHARED EXECUTION AUTHORITY` · `RECORD ≠ AUTHORITY` · `PROJECTION / SNAPSHOT ≠ SOURCE-OF-TRUTH` · `CONTRACT FAILURE ≠ PERMISSION TO USE LEGACY AUTHORITY`. **Authority yalnız şunlardan türer:** canonical domain ownership · canonical policy · actor eligibility · cross-domain contract · required approval gates.

### 16.2 XDC-A — CLIENT ↔ OFFICE

CLIENT PROVIDES: mandate context · declaration/instruction provenance · client-attributed approval/consent evidence. CLIENT CONSUMES: OFFICE actor identity · OFFICE internal approval decision evidence. **AUTHORITY OWNER: OFFICE. BUSINESS-EFFECT OWNER: ilgili target domain.** Precision: `OfficeApprovalRequest` internal approval workflow/evidence record'udur; record kendi başına authority ÜRETMEZ; OFFICE approval target-domain execution DEĞİL; gerekli approval yoksa **authority-critical command yolu fail-closed durur**; read-only görünüm approval durumunu unavailable/pending gösterebilir ama **işlem başlatamaz**.

### 16.3 XDC-B — CLIENT ↔ RECEIVABLE

CLIENT PROVIDES: canonical creditor relationship · creditor identity/context. CLIENT CONSUMES: claim/receivable composition · legal allocation results. **AUTHORITY OWNER: RECEIVABLE. BUSINESS-EFFECT OWNER: RECEIVABLE.** CLIENT ClaimItem authority KAZANMAZ · receivable mutation YAPAMAZ · legal allocation yeniden hesaplayamaz/override edemez. Required receivable fact yoksa: read-only presentation degraded/unknown olabilir; calculation/disposition/mutation fact'e bağımlıysa **işlem fail-closed durur**; `Case.clientId` veya legacy alan authority fallback'i OLAMAZ.

### 16.4 XDC-C — CLIENT ↔ COLLECTION

CLIENT PROVIDES: creditor relationship context · disposition scope · client-side provenance (when applicable). CLIENT CONSUMES: posted disposition/payable/payout-recording/offset results. **AUTHORITY OWNER: COLLECTION. BUSINESS-EFFECT OWNER: COLLECTION.** `CollectionDisposition` = **SHARED CONTRACT/WORKFLOW RECORD, NOT SHARED EXECUTION AUTHORITY**; CLIENT posting/payable/payout/offset/money-out authority SAHİPLENMEZ. Required posted result/financial state yoksa: client-facing read degraded olabilir; posting/financial-effect yolu **fallback YAPAMAZ**; projection/statement/legacy kayıt collection fact'i yerine GEÇEMEZ.

### 16.5 XDC-D — CLIENT ↔ DEBTOR

CLIENT PROVIDES: declaration/instruction provenance · client-side settlement/negotiation context. CLIENT CONSUMES: debtor legal-status context · debtor-side legal-effect results. **AUTHORITY OWNER: DEBTOR.** `CLIENT SETTLEMENT ≠ LEGAL SETTLEMENT` · `CLIENT DECLARATION ≠ DEBTOR LEGAL-STATUS AUTHORITY`. Required debtor legal-status yoksa: read-only unknown/degraded olabilir; legal-effect üreten işlem **fail-closed durur**; CLIENT debtor legal-status ÜRETMEZ/override etmez.

### 16.6 XDC-E — DOCUMENT / PORTAL / SHARED INFRASTRUCTURE

SHARED KERNEL ROLE: document/evidence/authentication infrastructure. **INDEPENDENT BUSINESS AUTHORITY: NONE.** CLIENT visibility/evidence/client-facing-document context sağlayabilir. Bu görevde SEÇİLMEZ: portal/external-client authority · masking · aggregate visibility · document/portal RBAC · KVKK retention/anonymization/legal-hold · authenticated external-client approval flow. Shared infrastructure bu policy'lerin authority owner'ı olarak GÖSTERİLMEZ.

### 16.7 CLIENT-Provided Canonical Facts

`CaseClient` = canonical creditor-relationship fact · `ClientPowerOfAttorney` = canonical mandate evidence · `ClientIntelStatement` = staff-recorded client-attributed declaration evidence (NOT automatically instruction) · `ClientApprovalRequest`/`Event` = FACT-B provenance ledger (NOT authenticated client consent) · creditor disposition context = shared contract input (NOT posting authority) · client-facing statement = CLIENT-owned immutable presentation/evidence artifact (NOT financial ledger).

### 16.8 CLIENT-Consumed Facts

OFFICE: internal approval decision evidence + actor identity · RECEIVABLE: claim composition + legal allocation · COLLECTION: posting/payable/payout/offset results · DEBTOR: legal-status + debtor-side legal-effect context · SHARED INFRASTRUCTURE: document/evidence/authentication facilities. **Consumption ownership veya mutation authority OLUŞTURMAZ.**

### 16.9 Record / Evidence / Projection Precision

- `OfficeApprovalRequest`: OFFICE-owned workflow/decision evidence; NOT self-creating authority; NOT target-domain execution.
- `CollectionDisposition`: shared contract/workflow record; **COLLECTION owns financial effect**.
- `ClientStatement`: **CLIENT-owned immutable client-facing statement/evidence artifact**; NOT live ledger / collection ledger / accounting journal / canonical balance source.
- `CaseBalance` / `BalanceLedger`: BP-07 hükmü korunur — **DUAL AS-IS REPRESENTATION; SINGLE SOURCE-OF-TRUTH NOT SELECTED; RECONCILIATION CONTRACT NOT CANONICAL** (`CaseBalance` otomatik projection, `BalanceLedger` otomatik canonical SOT İLAN EDİLMEZ).

### 16.10 Failure Semantics

**READ / PRESENTATION PATH** (güvenli olduğu ölçüde): UNKNOWN / UNAVAILABLE / STALE / PARTIAL / DEGRADED READ gösterilebilir. Ancak degraded read: authority ÜRETMEZ · legacy fallback AÇMAZ · mutation BAŞLATMAZ · business effect YARATMAZ.

**AUTHORITY / COMMAND / BUSINESS-EFFECT PATH** — şunlarda **FAIL-CLOSED** gerekir: required upstream fact absent · tenant mismatch · unknown authority source · unsupported required contract · required approval absent · contradictory fact with no precedence rule · upstream fact not trustworthy enough for the action. **FAIL-CLOSED = ZERO TARGET-DOMAIN SIDE EFFECT.**

### 16.11 Legacy Fallback Ban

`CANONICAL FACT ABSENT ≠ LEGACY FIELD BECOMES AUTHORITY` · `PROJECTION AVAILABLE ≠ PROJECTION MAY AUTHORIZE MUTATION`. Özellikle: `Case.clientId` creditor authority fallback'i OLAMAZ · `ClientStatement` Collection state fallback'i OLAMAZ · `CaseBalance`/`BalanceLedger` seçilmemiş precedence'i kendiliğinden KAZANAMAZ · staff-recorded FACT B, FACT A fallback'i OLAMAZ.

### 16.12 Contradictory / Stale Facts

Canonical precedence kuralı yoksa: **MULTIPLE RECORDS MAY COEXIST · COEXISTENCE ≠ EQUIVALENCE · NEWER ≠ AUTOMATIC LEGAL PRECEDENCE.** Authority-critical işlem: otomatik seçim YAPMAZ · sessiz fallback YAPMAZ · gerekli owner/policy veya reconciliation olmadan İLERLEMEZ. Read-only görünüm conflict/unknown gösterebilir.

### 16.13 Consumption Pattern Precision

Doğrulanan AS-IS pattern: **PREDOMINANTLY QUERY-DRIVEN / SYNCHRONOUS CONSUMPTION.** Bu: normatif architectural requirement DEĞİL · event-driven consumption yasağı DEĞİL · gelecekteki API/event tasarımını BELİRLEMEZ. Canonical kayıt yalnız **AS-IS gözlemi ve compatibility riskini** taşır.

### 16.14 Versioning / Compatibility

**EXPLICIT RUNTIME CONTRACT VERSIONING: AS-IS ABSENT. VERSIONING MODEL: NOT SELECTED.** Kaynak domain modelindeki değişiklikler consumer'ları etkileyebilir — yalnız **compatibility riski**. Bu görevde contract-version-format / negotiation / adapter / event-schema / API-contract TASARLANMAZ.

### 16.15 Open-Slot Register (yalnız pointer; ÇÖZÜLMEZ)

Portal/external-client authority → **BP-05 / POL-C** · Document/portal RBAC → **BP-05 / POL-J** · Masking + aggregate visibility → **BP-06** · KVKK retention/anonymization/legal-hold · Per-subject consent sufficiency → **BP-04 successor decision** · Balance reconciliation → ayrı owner-gated unit · Reversal/manual recovery → **COLLECTION** · Contract versioning/compatibility mechanism → implementation · Event-driven/API design → implementation · Stale/contradictory fact resolution policy → ilgili owner decision.

### 16.16 Status Precision

**CLIENT-P1-BP-08: BOUNDED CROSS-DOMAIN CONTRACT CONSUMPTION MAP** · **XDC-A–E OWNERSHIP: UNCHANGED** · **CONSUMPTION: DOES NOT TRANSFER AUTHORITY** · **AUTHORITY-CRITICAL FAILURE: FAIL-CLOSED** · **READ-ONLY PROJECTION FAILURE: MAY DEGRADE WITHOUT CREATING AUTHORITY** · **LEGACY AUTHORITY FALLBACK: PROHIBITED** · **CONTRACT REDESIGN: NOT AUTHORIZED** · **IMPLEMENTATION AUTHORITY: NONE.**

### 16.17 BP-08 Self-Check

Bu bölüm: yalnız mevcut kanonik gerçekleri + owner kararlarını konsolide eder; XDC-A–E ownership'i **DEĞİŞTİRMEZ**; consumption'ı authority transfer olarak **GÖSTERMEZ**; approval-absence'ı command yolunda degraded-read olarak **GÖSTERMEZ** (authority-critical missing fact = **fail-closed**); shared-kernel'i bağımsız business authority **İLAN ETMEZ**; `CaseBalance`'ı otomatik projection **İLAN ETMEZ**; tek balance SOT **SEÇMEZ**; `ClientStatement`'ı yalnız consumed projection olarak **SINIFLANDIRMAZ** (CLIENT-owned immutable artifact); query-driven kullanımı normatif architecture **YAPMAZ**; legacy authority fallback'i **YASAKLAR**; yeni contract/version/event/API **TASARLAMAZ**; portal/masking/KVKK/RBAC policy **SEÇMEZ**; `CL-INV-001..008` / §6 / §8.A / §8.B / §11 / §12 / §13 / §14 / §15'i değiştirmez; runtime/schema/writer-routing değişikliği ÖNERMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 17. CLIENT-P1-BP-09 — Client Audit / Evidence Model (BOUNDED CONSOLIDATION — OWNER RATIFIED)

Bu bölüm `CLIENT-P1-BP-09` read-only analizinin **owner-ratified bounded consolidation**'ıdır (`decision-log.md` CLIENT-P1-BP-09-GOV; **MODEL 1 — BOUNDED AUDIT / EVIDENCE CONSOLIDATION MAP**). Mevcut kanonik AS-IS gerçekleri (AS-IS kod + charter §11–§16 + CL-INV-001..008 + XDC-A–E + POL-A + POL-B + SYSTEM-CONSTITUTION + DBIND) ve owner kararlarını **konsolide eder**; yeni policy, authority, role, predicate, invariant-ID veya **runtime evidence taxonomy** ÜRETMEZ. Aşağıdaki E1–E7 / Axis-A sınıfları **yalnız governance-seviyesi analitik sözlüktür — runtime enum, interface, tablo veya API sözleşmesi DEĞİLDİR.** §5 `CL-INV-001..008`, §6 XDC-A–E, §8.A POL-B, §8.B POL-A, §11–§16 metinlerini **semantik olarak değiştirmez.** **EVIDENCE TAXONOMY: GOVERNANCE-ONLY. RUNTIME TAXONOMY: NOT AUTHORIZED. RETENTION/KVKK/MASKING/RBAC: OPEN/NOT SELECTED. EVIDENCE REMEDIATION: NOT AUTHORIZED. IMPLEMENTATION AUTHORITY: NONE.**

### 17.1 Two-Axis Classification Model

Bir kaydın **business semantics**'i ile **evidence provenance sınıfı** birbirine karıştırılmaz.

**Axis A — Record Semantics:** BUSINESS FACT · WORKFLOW/STATE RECORD · EVIDENCE ARTIFACT · AUDIT/TRANSITION EVENT · SOURCE/EXTERNAL DOCUMENT · SNAPSHOT/PROJECTION · PRE-CANONICAL EXTERNAL INPUT · COMMUNICATION RECORD.

**Axis B — Evidence Provenance Class** (yalnız evidence niteliği taşıyan kayıtlara uygulanır): **E1** authenticated principal act · **E2** staff-recorded principal-attributed fact · **E3** internal office decision evidence · **E4** target-domain business-effect evidence · **E5** source document/external artifact · **E6** system-derived/snapshot/projected evidence · **E7** audit/transition event.

Bir business fact E1–E7 içine **zorla yerleştirilmez**; uygun değilse kayıt `EVIDENCE CLASS: NOT APPLICABLE` veya `INSUFFICIENT EVIDENCE TO CLASSIFY` taşır.

### 17.2 Core Non-Equations

`EVIDENCE ≠ BUSINESS AUTHORITY` · `AUDIT EVENT ≠ BUSINESS FACT` · `WORKFLOW STATUS ≠ LEGAL OR FINANCIAL EFFECT` · `RECORDER ≠ PRINCIPAL` · `ATTRIBUTED CLIENT FACT ≠ AUTHENTICATED CLIENT ACT` · `SOURCE DOCUMENT PRESENT ≠ CONTENT VERIFIED` · `PROJECTION/SNAPSHOT ≠ LIVE SOURCE-OF-TRUTH` · `SUPERSESSION ≠ PHYSICAL DELETION` · `VOID ≠ UNDERLYING LEDGER REVERSAL` · `DOCUMENT ACCESS ≠ DOMAIN AUTHORITY` · `RECORD ≠ AUTHORITY`.

### 17.3 Record-Specific Canonical Classification

**`CaseClient`** — RECORD SEMANTICS: CLIENT-OWNED CANONICAL CREDITOR-RELATIONSHIP BUSINESS FACT. EVIDENCE CLASS: NOT FORCED. AUTHORITY OWNER: CLIENT. Case-creation transaction'ı yalnız AS-IS writer route'udur; authority ownership kanıtı DEĞİLDİR.

**`ClientPowerOfAttorney`** — RECORD SEMANTICS: CANONICAL MANDATE EVIDENCE ARTIFACT. PROVENANCE: EXTERNAL SOURCE DOCUMENT + STAFF CAPTURE. EVIDENCE CLASS: **E5 + E2 capture layer**. Belgenin sistemde bulunması içeriğinin hukuken doğrulandığı anlamına GELMEZ; PoA mandate evidence'dır, finansal execution authority DEĞİLDİR; BP-02 mandate hierarchy korunur. AS-IS metadata/status update integrity kontrolü **PARTIAL / KNOWN GAP** olarak kaydedilir (bkz. §17.12) — bu gap PoA'nın canonical mandate evidence rolünü KALDIRMAZ; enforcement/remediation ayrı owner-gated'dir.

**`ClientApprovalRequest`** — WORKFLOW + FACT-B PROVENANCE LEDGER, **E2**. **`ClientApprovalEvent`** — AUDIT/TRANSITION EVENT, **E7**. FACT B, FACT A'ya yükseltilemez; approval status target-domain execution DEĞİLDİR; event oluşması execution kanıtı DEĞİLDİR.

**`ClientIntelStatement`** — RECORD SEMANTICS: STAFF-RECORDED CLIENT-ATTRIBUTED DECLARATION EVIDENCE. EVIDENCE CLASS: **E2**. DIRECT CLIENT PRINCIPAL ATTRIBUTION: **PARTIAL / GAP**. Otomatik instruction DEĞİLDİR; recorder staff'tır, principal DEĞİLDİR; Debtor subject ile client declarant birbirine EŞİTLENMEZ.

**`ClientIntakeSubmission` / `ClientIntakeField`** — RECORD SEMANTICS: PRE-CANONICAL EXTERNAL INPUT / STAGING RECORD. AUTHENTICATED PRINCIPAL ACT: NOT PROVEN. EVIDENCE CLASS: INSUFFICIENT UNTIL REVIEW/PROMOTION. Token possession, principal authentication DEĞİLDİR. Promotion sonrası oluşan canonical record (`ClientIntelStatement`/`DebtorAddress`) kendi provenance sınıfıyla değerlendirilir.

**`ClientStatement` / `ClientStatementLine`** — RECORD SEMANTICS: CLIENT-OWNED IMMUTABLE CLIENT-FACING SNAPSHOT/EVIDENCE ARTIFACT. EVIDENCE CLASS: **E6**. NOT: LEDGER · ACCOUNTING JOURNAL · CANONICAL BALANCE SOURCE. Supersession veya void, underlying financial reversal DEĞİLDİR.

**`ClientOffset`** — RECORD SEMANTICS: COLLECTION-OWNED FINANCIAL-EFFECT / OFFSET RECORDING FACT. EVIDENCE CLASS: **E4**. AUTHORITY OWNER: COLLECTION. Kaydın CLIENT ilişkileri taşıması offset authority'sini CLIENT'e TAŞIMAZ; reversal ayrı kayıtla temsil edilir (AS-IS fact).

**`ClientPayout` / `ClientPayoutAllocation` / `ClientPayoutManualReversal`** — RECORD SEMANTICS: COLLECTION-OWNED PAYOUT RECORDING/ALLOCATION EVIDENCE. EVIDENCE CLASS: **E4**. NOT: PROOF OF BANK EXECUTION. Request, approval, bank execution, recording ve recovery birbirinden AYRIDIR.

**`OfficeApprovalRequest`** — RECORD SEMANTICS: OFFICE-OWNED INTERNAL APPROVAL WORKFLOW/DECISION EVIDENCE. EVIDENCE CLASS: **E3**. NOT: TARGET-DOMAIN EXECUTION. Record kendi başına authority OLUŞTURMAZ.

**`CollectionDisposition`** — RECORD SEMANTICS: SHARED CLIENT/COLLECTION CONTRACT AND WORKFLOW RECORD; POSTED RESULT = COLLECTION BUSINESS-EFFECT EVIDENCE. EVIDENCE CLASS: **E4 (finansal etki doğrulandığında)**. Shared record, shared execution authority OLUŞTURMAZ.

**`AccountingJournalEntry` / `AccountingJournalLine`** — RECORD SEMANTICS: ACCOUNTING-OWNED JOURNAL/BUSINESS RECORD. EVIDENCE CLASS: **E4 (accounting effect için)**. NOT: MERELY GENERIC AUDIT EVENT. Kaynak business effect'in authority'si ilgili source domain'de; accounting representation authority ACCOUNTING'dedir.

**`AuditLog`** (generic) — RECORD SEMANTICS: GENERIC AUDIT/TRANSITION EVENT. EVIDENCE CLASS: **E7**. BUSINESS-EFFECT AUTHORITY: NONE.

**`PortalDocument`** — RECORD SEMANTICS: CLIENT-FACING EXTERNAL DOCUMENT ARTIFACT. EVIDENCE CLASS: **E5**. CONTENT VERIFICATION: NOT IMPLIED BY UPLOAD OR REVIEW STATUS. Review status tek başına hukuki doğruluk veya domain authority ÜRETMEZ.

**`PortalNotification` / `PortalMessage`** — İLETİŞİM KAYDI olarak sınıflandırılır. Otomatik **E7** veya legal evidence İLAN EDİLMEZ; evidence niteliği subject, provenance ve kullanım bağlamına göre AYRICA değerlendirilir.

### 17.4 FACT A / FACT B

BP-04 hükümleri **aynen korunur**: **FACT A** = authenticated external-client act, AS-IS ABSENT/UNWIRED. **FACT B** = staff-recorded client-attributed fact, AS-IS PRESENT. `FACT A ≠ FACT B`; **FACT B NON-CONVERTIBLE TO FACT A**. Token-gated intake submission, authenticated FACT A DEĞİLDİR.

### 17.5 Audit Coverage Model

AS-IS audit coverage **tek tip değildir**: DEDICATED DOMAIN EVENT LEDGER · GENERIC AUDITLOG · ENTITY-LIFECYCLE TIMESTAMPS ONLY · NO VERIFIED AUDIT TRAIL. **AUDIT COVERAGE: FRAGMENTED / NON-UNIFORM. UNIFORM AUDIT CONTRACT: NOT SELECTED. IMPLEMENTATION REMEDIATION: NOT AUTHORIZED.** Entity üzerindeki status/timestamp alanı **otomatik audit event DEĞİLDİR.**

### 17.6 Verified Lifecycle Precision

Yalnız kod/test ile doğrulanmış transition'lar canonical'dır. Enum üyesinden transition ÜRETİLMEZ; ölü veya çağrılmayan yollar canonical transition SAYILMAZ; workflow status ile business effect AYRILIR; update edilebilir metadata ile immutable source content BİRBİRİNE KARIŞTIRILMAZ; supersession, retraction, void ve reversal kavramları EŞİTLENMEZ. Dead-code/unused-enum/optionality ayrıntıları charter'a TAŞINMAZ; yalnız implementation-risk pointer'ı olabilir (bkz. §17.12).

### 17.7 Evidence Chain

Governance seviyesinde: `SOURCE → CAPTURE → PRINCIPAL ATTRIBUTION → RECORDER/ACTOR → REVIEW → DECISION → TARGET-DOMAIN EXECUTION → RESULTING BUSINESS-EFFECT EVIDENCE → AUDIT/TRANSITION TRAIL`. Her adım her yüzeyde bulunmayabilir. Eksik chain adımı **sessizce varsayılmaz**, sonraki adımdan **türetilmez**, authority **üretmez**, authenticated principal act yerine staff recording **kullanılmaz**.

### 17.8 Evidence Sufficiency

S0–S6 yalnız **analitik öneridir**; canonical policy YAPILMAZ. `CaseClient` business fact olduğu için otomatik S4 evidence sayılmaz. `OfficeApprovalRequest` S3 evidence olabilir; execution DEĞİLDİR. `AccountingJournalEntry` accounting effect evidence'dır; reconciliation sufficiency ayrı owner kararıdır. `PortalDocument` review status nedeniyle verified evidence kabul EDİLMEZ. `ClientIntelStatement` principal attribution gap nedeniyle authenticated evidence DEĞİLDİR. **PER-SUBJECT EVIDENCE SUFFICIENCY: OPEN / NOT SELECTED.**

### 17.9 Reference Integrity

Ayrı gösterilir: HARD FOREIGN KEY · SOFT POLYMORPHIC REFERENCE · SCALAR CROSS-MODULE REFERENCE · DOCUMENT PATH/EXTERNAL LOCATION · SELF-REFERENCE/SUPERSESSION LINK · NO DATABASE-LEVEL REFERENCE. Soft reference doğrulanmış source link DEĞİLDİR; FK bulunmaması otomatik security exploit DEĞİLDİR; document path document integrity kanıtı DEĞİLDİR; orphan ve broken-provenance riskleri ayrı kaydedilir; cross-domain FK eksikliği authority fallback izni VERMEZ.

### 17.10 Cross-Domain Evidence Ownership

**CLIENT:** client relationship, mandate evidence, client-attributed provenance, client-facing evidence artifacts. **OFFICE:** internal approval evidence. **RECEIVABLE:** claim/receivable evidence. **COLLECTION:** receipt, disposition, payout, offset ve money-out evidence. **DEBTOR:** debtor legal-status evidence. **ACCOUNTING:** accounting journal evidence. **SHARED INFRASTRUCTURE:** document, authentication ve evidence facilities — INDEPENDENT BUSINESS AUTHORITY NONE. CLIENT başka domain evidence ownership'ini SAHİPLENMEZ. **RECEIVABLE AS-IS CODE CONSUMPTION: NOT FULLY VERIFIED IN BP-09 — NO NEGATIVE CLAIM MAY BE CANONICALIZED.** XDC-B canonical authority sınırı aynen korunur.

### 17.11 Failure Semantics

**READ/PRESENTATION PATH** (güvenli olduğu ölçüde): UNKNOWN/PARTIAL/UNVERIFIED/STALE/BROKEN REFERENCE gösterilebilir. **AUTHORITY/LEGAL/FINANCIAL-EFFECT PATH:** gerekli evidence yoksa, principal attribution belirsizse, tenant mismatch varsa, çelişkili ve precedence'sizse veya güven seviyesi işlem için yetersizse — işlem **FAIL-CLOSED / ZERO TARGET-DOMAIN SIDE EFFECT** durumunda kalır.

### 17.12 AS-IS Evidence-Integrity Deltas (pointer; record-only)

Aşağıdaki dört bulgu `OFFICE-RISK-REGISTER.md`'ye record-only olarak eklenmiştir; yeni constitutional invariant veya implementation task OLUŞTURMAZ, task-scoped finding'dir; method/route/dosya-yolu/ajan-lane/exploit tarifi charter'a TAŞINMAZ:

- **PoA evidence integrity** — AS-IS: mandate metadata/status update actor-eligibility ve audit coverage PARTIAL. IMPACT: mandate evidence integrity risk. REMEDIATION: NOT AUTHORIZED. BP-02 canonical mandate hierarchy korunur.
- **Portal document decision integrity** — AS-IS: review decision precondition/audit history partial veya absent. CROSS-TENANT EXPLOIT: NOT ESTABLISHED. IMPACT: same-tenant evidence integrity / defense-in-depth gap. REMEDIATION: NOT AUTHORIZED.
- **Intake review concurrency** — AS-IS: claim/review concurrency contract partial. IMPACT: double-claim / ownership consistency risk. REMEDIATION: NOT AUTHORIZED.
- **Audit coverage fragmentation** — AS-IS: non-uniform audit coverage (bkz. §17.5). IMPACT: traceability ve evidence-chain gap. REMEDIATION: NOT AUTHORIZED.

### 17.13 Retention / KVKK Open Slots (yalnız pointer; ÇÖZÜLMEZ)

Retention süreleri · anonymization · physical deletion · legal/litigation hold · redaction/masking · portal visibility · subject access · evidence-copy policy · rejected/pending external document retention · promoted intake source retention · audit/event retention. **RETENTION / KVKK POLICY: OPEN / NOT SELECTED.**

### 17.14 Status Precision

**CLIENT-P1-BP-09: BOUNDED AUDIT / EVIDENCE MODEL.** **EVIDENCE TAXONOMY: GOVERNANCE-ONLY.** **FACT A: AS-IS ABSENT.** **AUDIT COVERAGE: FRAGMENTED / NON-UNIFORM.** **EVIDENCE-INTEGRITY DELTAS: KNOWN / NON-ZERO.** **RETENTION / KVKK: OPEN / NOT SELECTED.** **REMEDIATION: NOT AUTHORIZED.** **IMPLEMENTATION AUTHORITY: NONE.**

### 17.15 BP-09 Self-Check

Bu bölüm: business fact'leri E1–E7'ye zorla sınıflandırmaz; `CaseClient` authority owner'ını CASE olarak GÖSTERMEZ; `ClientOffset` authority'sini CLIENT'e TAŞIMAZ; `AccountingJournalEntry`'yi yalnız E7 audit event İLAN ETMEZ; PoA'nın canonical mandate evidence rolünü korur, integrity gap'i ayrıca kaydeder; `PortalDocument` gap'i için cross-tenant exploit iddiası YAPMAZ; intake submission'ı FACT A İLAN ETMEZ; RECEIVABLE hakkında eksik aramaya dayalı negatif iddia YAZMAZ; audit event'i execution evidence olarak GÖSTERMEZ; retention/KVKK/masking/RBAC kararı VERMEZ; runtime taxonomy OLUŞTURMAZ; `CL-INV-001..008` / §6 / §8.A / §8.B / §11–§16'yı değiştirmez; kod/schema/migration/test-behavior DEĞİŞTİRMEZ; canonicalization'ı implementation ile KARIŞTIRMAZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 18. CLIENT-P1-POL-C — Portal / External-Client Authority Policy (OWNER RATIFIED)

Bu bölüm `CLIENT-P1-POL-C` karar analizinin **owner-ratified policy**'sidir (`decision-log.md` CLIENT-P1-POL-C-GOV; **SELECTED MODEL: NON-AUTHORITATIVE PORTAL INTERACTION**). Mevcut kanonik AS-IS gerçekleri (AS-IS kod + charter §11–§17 + CL-INV-001..008 + XDC-A–E + POL-A + POL-B) ve owner kararını **konsolide eder**; yeni role/rank/predicate, corporate-representative modeli, delegated-user modeli, session-revocation/2FA implementasyonu veya RBAC/masking/KVKK/financial-visibility policy'si ÜRETMEZ. §5, §6, §8.A, §8.B, §11–§17 metinlerini **semantik olarak değiştirmez.** **AUTHENTICATED EXTERNAL-CLIENT FACT A: NOT PRODUCED BY AS-IS PORTAL. PORTAL CLIENT-DECISION AUTHORITY: NONE. PORTAL BUSINESS-EFFECT AUTHORITY: NONE. PORTAL IMPLEMENTATION: NOT AUTHORIZED.**

### 18.1 Portal Authority Model

Portal yalnız **bounded interaction ve presentation yüzeyidir**. Permitted interaction classes: READ/PRESENTATION · DOCUMENT UPLOAD/DOWNLOAD · MESSAGE EXCHANGE · RAW EXTERNAL INPUT · INTAKE SUBMISSION · NOTIFICATION ACCESS. Bu işlemler FACT A ÜRETMEZ, internal OFFICE approval ÜRETMEZ, RECEIVABLE mutation YAPMAZ, COLLECTION posting veya money-out ÜRETMEZ, DEBTOR legal effect ÜRETMEZ, ACCOUNTING entry ÜRETMEZ. **"View-only" canonical model adı DEĞİLDİR** — portalın write niteliğinde fakat **non-authoritative** girdileri vardır (belge yükleme, mesaj, intake gönderimi).

### 18.2 Portal Action Semantics

PORTAL READ = client-facing presentation. PORTAL DOCUMENT UPLOAD = external document/raw input, NOT verified content. PORTAL MESSAGE = communication record, NOT client instruction by default. PORTAL INTAKE SUBMISSION = pre-canonical external input; token possession ≠ principal authentication. STAFF REVIEW/PROMOTION FACT-B-like record üretebilir; source action'ı asla FACT A'ya ÇEVİRMEZ. Portal-originated record: `≠ AUTHENTICATED PRINCIPAL ACT` · `≠ CLIENT CONSENT` · `≠ CLIENT DECISION` · `≠ OFFICE APPROVAL` · `≠ TARGET-DOMAIN EXECUTION`.

### 18.3 Actor and Principal Boundary

PORTAL USER = technical client-linked account. CLIENT PRINCIPAL = legal person or natural person with decision authority. ACTING HUMAN = the natural person using the account. Precision: `PORTAL USER ≠ CLIENT PRINCIPAL` · `AUTHENTICATED SESSION ≠ PROVEN ACTING-HUMAN IDENTITY` · `AUTHENTICATED SESSION ≠ REPRESENTATION/DELEGATION BASIS` · `CLIENT RELATIONSHIP ≠ PORTAL ACCESS AUTHORITY` · `MANDATE ≠ PORTAL CREDENTIAL`.

**COMPANY/PUBLIC client'lar:** acting-human identity, corporate representation, delegation basis, term ve revocation AS-IS yapısal olarak kanıtlanmıyorsa portal act principal act SAYILAMAZ. Bu görev yeni representative/delegate modeli OLUŞTURMAZ.

### 18.4 FACT-A Boundary

POL-B korunur: **FACT A** = authenticated external-client act; **FACT B** = staff-recorded client-attributed fact; `FACT A ≠ FACT B`; **FACT B NON-CONVERTIBLE TO FACT A**. AS-IS portal şu minimum zinciri karşılamaz: ACTING-HUMAN IDENTITY · REPRESENTATION/DELEGATION BASIS · LIVE REVOCATION/SESSION INVALIDATION. Bu nedenle **AS-IS PORTAL FACT-A ELIGIBILITY: NONE.** `PORTAL` channel etiketi wired FACT-A hattı DEĞİLDİR.

### 18.5 Portal Capability Boundary

| Capability | POL-C disposition |
|---|---|
| Case / PoA read | Permitted presentation, subject to BP-06/POL-J |
| Document upload/download | Non-authoritative external artifact interaction |
| Message | Communication only |
| Notification | Presentation only |
| Intake submission | Pre-canonical input |
| Client instruction | Not automatically produced |
| Client consent/decision | Not authorized |
| Financial visibility | Separate BP-06 decision |
| Financial action | Prohibited |
| Target-domain mutation | Prohibited |

### 18.6 Portal Lifecycle Precision

AS-IS lifecycle fact'leri kaydedilebilir: client-linked technical account · password authentication · active/disabled state · credential-change/recovery surfaces · existing session behavior. Canonical target policy bu aşamada SEÇİLMEZ: invitation · activation ceremony · multi-user delegation · 2FA requirement · credential assurance · token/session versioning · session revocation mechanism · relationship-termination propagation. **PORTAL LIFECYCLE POLICY: PARTIAL/OPEN. IMPLEMENTATION: NOT AUTHORIZED.**

### 18.7 AS-IS Security/Integrity Deltas (pointer; record-only, `OFFICE-RISK-REGISTER.md`'ye eklendi)

- **Session invalidation** — AS-IS: disable/password-change mevcut portal session'ı kanıtlanabilir şekilde revoke ETMİYOR. IMPACT: stale authenticated session risk. REMEDIATION: NOT AUTHORIZED.
- **Credential recovery delivery** — AS-IS: reset mekanizması kodda var, teslimat kanalı eksik/doğrulanmamış. IMPACT: recovery capability gap. REMEDIATION: NOT AUTHORIZED.
- **Case-detail field exposure** — AS-IS: portal detay sunumu client-sunumu için amaçlanmamış alanları içerebilir. CROSS-TENANT EXPOSURE: NOT ESTABLISHED. IMPACT: same-client field-level disclosure/masking gap. ROUTING: BP-06/POL-D. REMEDIATION: NOT AUTHORIZED.
- **Corporate representation** — AS-IS: acting-human/corporate representation yapısal olarak KANITLANMIYOR. IMPACT: FACT-A ve legal-attribution gap. REMEDIATION: NOT AUTHORIZED.
- **Document review authority** — BP-09'daki record korunur: AS-IS document review actor-eligibility/history coverage PARTIAL. ROUTING: POL-J. REMEDIATION: NOT AUTHORIZED.

Charter'a somut field, route, method veya exploit ayrıntısı YAZILMAZ.

### 18.8 Tenant / Object Access Precision

**NEW CROSS-TENANT EXPLOIT: NOT ESTABLISHED. OBJECT-LEVEL CLIENT SCOPING: AS-IS PRESENT. DEFENSE-IN-DEPTH/FIELD VISIBILITY: PARTIAL/OPEN.** Bu sonuç tenant güvenliğinin kusursuz olduğu, field-level görünürlüğün doğru olduğu veya session revocation'ın yeterli olduğu anlamına GELMEZ.

### 18.9 XDC-E Boundary

SHARED INFRASTRUCTURE provides: authentication · document · evidence · delivery facilities. **INDEPENDENT BUSINESS AUTHORITY: NONE.** Portal CLIENT context tüketir, shared infrastructure kullanır; OFFICE/RECEIVABLE/COLLECTION/DEBTOR authority'sini KAZANMAZ.

### 18.10 Open-Slot Register (yalnız pointer; ÇÖZÜLMEZ)

Document/portal RBAC → **POL-J** · Field masking → **POL-D/BP-06** · Aggregate visibility → **POL-F/BP-06** · Financial visibility → **BP-06** · KVKK retention/anonymization/legal-hold → **POL-E** · Acting-human identity model · Corporate representation/delegation · Multi-user portal model · Session revocation · Credential assurance/2FA · Portal audit coverage · FACT-A implementation.

### 18.11 BP-05 Effect

**POL-C: DECIDED/CANONICALIZATION PENDING → bu kayıtla CANONICAL.** **BP-05 ENTRY: POL-C PREREQUISITE SATISFIED AFTER CANONICAL MERGE.** **BP-05 FINALIZATION: STILL REQUIRES POL-J.** **BP-06: STILL OWNER-GATED.** BP-05 bu governance kapanışı sırasında BAŞLATILMAZ.

### 18.12 Status Precision

**CLIENT-P1-POL-C: CLOSED/CANONICAL.** **MODEL: NON-AUTHORITATIVE PORTAL INTERACTION.** **PORTAL FACT A: NOT PRODUCED.** **PORTAL CLIENT-DECISION AUTHORITY: NONE.** **PORTAL BUSINESS-EFFECT AUTHORITY: NONE.** **BP-05 ENTRY PREREQUISITE: SATISFIED.** **POL-J: OPEN/REQUIRED FOR BP-05 FINALIZATION.** **PORTAL REMEDIATION: NOT AUTHORIZED.** **IMPLEMENTATION AUTHORITY: NONE.**

### 18.13 POL-C Self-Check

Bu bölüm: portal modelini "view-only" olarak YANLIŞ ADLANDIRMAZ; portal upload/mesaj/intake'i FACT A İLAN ETMEZ; portal user'ı client principal İLAN ETMEZ; corporate representation VARSAYMAZ; FACT B'yi FACT A'ya YÜKSELTMEZ; portal'a OFFICE approval veya target-domain execution authority KAZANDIRMAZ; cross-tenant exploit iddiası YAPMAZ; field exposure'ı yalnız same-client presentation/masking gap olarak kaydeder; session/recovery/representation bulgularını record-only tutar; POL-J veya BP-06 policy'si SEÇMEZ; kod/schema/migration DEĞİŞTİRMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 19. CLIENT-P1-POL-J — Document / Portal RBAC Policy (OWNER RATIFIED)

Bu bölüm `CLIENT-P1-POL-J` karar analizinin **owner-ratified policy**'sidir (`decision-log.md` CLIENT-P1-POL-J-GOV; **SELECTED MODEL: OPTION A — INHERITED OFFICE OBJECT-SCOPE + BOUNDED RESOURCE/ACTION MATRIX**). Mevcut kanonik AS-IS gerçekleri (AS-IS kod + charter §11–§18 + CL-INV-001..008 + XDC-A–E + POL-A + POL-B + POL-C) ve owner kararını **konsolide eder**; yeni role/rank/predicate, object-scope modeli, masking policy, aggregate-visibility policy veya predicate-wiring ÜRETMEZ. §5, §6, §8.A, §8.B, §11–§18 metinlerini **semantik olarak değiştirmez.** **OBJECT-SCOPE POLICY: INHERITS OFF/OD-08 — NO COMPETING POL-J MODEL. NEW ROLE/RANK/PREDICATE: NONE. MASKING/AGGREGATE VISIBILITY: OPEN/NOT SELECTED. IMPLEMENTATION AUTHORITY: NONE.**

### 19.1 Core RBAC Model

**Portal-side access:** ACTOR = portal technical account. MODEL = non-authoritative interaction (POL-C korunur). REQUIRED SCOPE = tenant + linked client + resource/object relation. BUSINESS-EFFECT AUTHORITY: NONE. Portal account kendi bağlı client context'i dışına çıkamaz; client relationship nedeniyle her client-related object'e otomatik erişemez; FACT A, OFFICE approval veya target-domain execution ÜRETEMEZ.

**Staff-side access:** ACTOR = authenticated office actor. REQUIRED SCOPE = tenant + OFF/OD-08 object scope + action-specific existing actor eligibility. TARGET-DOMAIN AUTHORITY: UNCHANGED. Staff JWT tek başına review, approval veya bütün client/case nesnelerine erişim yetkisi DEĞİLDİR.

### 19.2 OFF/OD-08 Inheritance

Object-level authorization için yeni CLIENT-specific model OLUŞTURULMAZ. **OFFICE OBJECT-SCOPE AUTHORITY: OFF/OD-08.** **SELECTED DIRECTION: DIRECT-REPORT/TEAM-SCOPE DEFAULT.** **CURRENT ENFORCEMENT: PARTIAL/INCOMPLETE.** **POL-J ROLE: CONSUMER/POINTER — NOT COMPETING OWNER.** `STF-PRD-BOLA-001` ve `STF-PRD-SCP-001` mevcut risk kayıtları korunur ve bu disposition'a bağlanır (bkz. §19.8); aynı object-scope riski için mükerrer risk kartı AÇILMAZ.

### 19.3 Resource / Action Boundary

| Resource / action | Portal | Staff |
|---|---|---|
| Client-scoped presentation | Linked-client + object scope | OFF/OD-08 object scope |
| Case list/detail | Creditor/client relationship scope | OFF/OD-08 scope |
| PoA read | Linked-client scope | OFF/OD-08 scope |
| Portal document upload/download/delete | Bounded non-authoritative interaction | Review ayrı authority |
| Portal document review | Yok | Existing OFFICE eligibility + object scope |
| Intake submit | Pre-canonical external input | Review/promotion ayrı authority |
| Intake claim/review/promotion | Yok | Existing OFFICE eligibility + object scope |
| Message/notification | Participant/recipient scope | Object/client scope |
| Consent/decision | Yetkisiz | BP-04/OFFICE boundaries apply |
| Financial action | Yetkisiz | İlgili target-domain authority |
| Target-domain mutation | Yetkisiz | İlgili domain contract'ına bağlı |

Yeni capability taxonomy, role veya predicate OLUŞTURULMAZ.

### 19.4 Review Authority Precision

`AUTHENTICATED STAFF ≠ ELIGIBLE REVIEWER` · `ELIGIBLE REVIEWER ≠ OFFICE APPROVER` · `OFFICE APPROVER ≠ TARGET-DOMAIN EXECUTOR`. Authoritative review/approval niteliğindeki action'lar mevcut OFFICE actor-eligibility modelini VE OFF/OD-08 object scope'unu **birlikte** tüketmelidir. POL-J bu görevde mevcut predicate'i GENİŞLETMEZ, yeni predicate ÜRETMEZ veya runtime'a BAĞLAMAZ. AS-IS'te yalnız tenant-JWT ile çalışan review yüzeyleri: **KNOWN/NON-ZERO AUTHORIZATION DELTA. REMEDIATION NOT AUTHORIZED.**

### 19.5 Object Access ≠ Field Visibility

`TENANT MATCH ≠ OBJECT AUTHORIZATION` · `OBJECT AUTHORIZATION ≠ FIELD VISIBILITY`. Bir case, document veya client nesnesine erişim; bütün alanların gösterilmesini, internal notes'un açıklanmasını veya finansal detayların sunulmasını otomatik MEŞRULAŞTIRMAZ. Mevcut viewer-aware presenter deseni: **AS-IS ARCHITECTURAL EXEMPLAR — NOT SELECTED POL-J POLICY.** Field-level kararlar: masking → **POL-D/BP-06**; aggregate visibility → **POL-F/BP-06**; financial visibility → **BP-06**.

### 19.6 Document Precision

`DOCUMENT OWNERSHIP ≠ DOCUMENT ACCESS TO ALL ACTORS` · `DOCUMENT ACCESS ≠ DOCUMENT REVIEW AUTHORITY` · `DOCUMENT REVIEW ≠ DOMAIN BUSINESS APPROVAL` · `DOCUMENT UPLOAD ≠ VERIFIED CONTENT` · `REVIEW STATUS ≠ LEGAL VALIDITY`. `PortalDocument`, intake evidence, case document ve PoA artifact sınırları birbirine DÖNÜŞTÜRÜLMEZ.

### 19.7 Failure Semantics

Fail-closed durumları: TENANT MISMATCH · CLIENT MISMATCH · OBJECT/RELATIONSHIP MISMATCH · OFF/OD-08 SCOPE FAILURE · UNKNOWN ACTOR ELIGIBILITY · UNSUPPORTED ACTION · MISSING REQUIRED REVIEW AUTHORITY → **DENY. ZERO WRITE. ZERO BUSINESS SIDE EFFECT.** Read/presentation yüzeyinde güvenli olduğu ölçüde NOT FOUND/NOT AVAILABLE/PARTIAL/MASKING REQUIRED/POLICY PENDING gösterilebilir. Legacy linkage veya tenant-flat fetch authority fallback'i OLAMAZ.

### 19.8 AS-IS Risk Disposition (pointer; mevcut kayıtlara bağlı, mükerrer kart YOK)

**OBJECT-SCOPE ENFORCEMENT: `STF-PRD-BOLA-001`/`STF-PRD-SCP-001` — OPEN/PARTIALLY MITIGATED.** **REPORTINGLINE: SCHEMA FOUNDATION PRESENT, ENFORCEMENT CONSUMPTION INCOMPLETE.** **STAFF REVIEW ROLE-TIER: INCONSISTENT/PARTIAL.** **FIELD VISIBILITY: OPEN/ROUTED TO POL-D/POL-F/BP-06.** **REMEDIATION: NOT AUTHORIZED.** Method, route, dosya adı veya kesin kullanım-site sayısı charter'a YAZILMAZ.

### 19.9 POL-C Boundary

**PORTAL MODEL: NON-AUTHORITATIVE INTERACTION. PORTAL FACT A: NONE. PORTAL CLIENT-DECISION AUTHORITY: NONE. PORTAL BUSINESS-EFFECT AUTHORITY: NONE.** POL-J, POL-C authority modelini GENİŞLETEMEZ.

### 19.10 BP-05 Effect

Canonical merge sonrasında: **POL-C: CLOSED/CANONICAL. POL-J: CLOSED/CANONICAL. BP-05 AUTHORITY/RBAC PREREQUISITES: SATISFIED. BP-05: NOT STARTED. BP-06: OWNER-GATED.** BP-05 bu governance görevi içinde BAŞLATILMAZ.

### 19.11 Status Precision

**CLIENT-P1-POL-J: CLOSED/CANONICAL.** **MODEL: INHERITED OFFICE OBJECT-SCOPE + BOUNDED RESOURCE/ACTION MATRIX.** **OBJECT-SCOPE OWNER: OFFICE/OFF-OD-08.** **PORTAL AUTHORITY: UNCHANGED/NON-AUTHORITATIVE.** **FIELD VISIBILITY: OPEN/ROUTED TO BP-06.** **RBAC ENFORCEMENT DELTA: KNOWN/NON-ZERO.** **BP-05 AUTHORITY/RBAC PREREQUISITES: SATISFIED.** **IMPLEMENTATION AUTHORITY: NONE.**

### 19.12 POL-J Self-Check

Bu bölüm: OFF/OD-08'e rakip object-scope modeli ÜRETMEZ; portal account'u client principal İLAN ETMEZ; tenant match'i object authority SAYMAZ; staff JWT'yi review eligibility SAYMAZ; review'i OFFICE approval veya target execution SAYMAZ; presenter desenini zorunlu masking policy YAPMAZ; mevcut riskler için mükerrer risk kartı AÇMAZ; exact implementation-site sayısını normatif kayda TAŞIMAZ; POL-D/POL-F/BP-06 kararı VERMEZ; kod/schema/migration DEĞİŞTİRMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 20. CLIENT-P1-BP-05 — Portal / External-Client Model (OWNER RATIFIED)

Bu bölüm `CLIENT-P1-BP-05` karar analizinin **owner-ratified policy**'sidir (`decision-log.md` CLIENT-P1-BP-05-GOV; **SELECTED MODEL: OPTION A — BOUNDED NON-AUTHORITATIVE PORTAL PROCESS MODEL**). Bu bölüm konsolide edici (foundational değil) bir blueprint birimidir: POL-C (§18), POL-J (§19) ve BP-09 (§17) sonuçlarını **tek bir bounded portal/external-client process modelinde birleştirir**; yeni authority, role, rank, predicate, object-scope modeli veya runtime taxonomy ÜRETMEZ. §5, §6, §8.A, §8.B, §11–§19 metinlerini semantik olarak değiştirmez. **PORTAL MODEL: BOUNDED NON-AUTHORITATIVE PROCESS SURFACE. PORTAL FACT A: NONE. PORTAL AUTHORITY: NONE. BP-06: OWNER-GATED. IMPLEMENTATION AUTHORITY: NONE.**

### 20.1 Portal Model

Portal ve public intake yüzeyi CLIENT domain'in **bounded interaction/process surface**'idir; authority-owning bağımsız bir aggregate veya domain DEĞİLDİR. Portal kendi başına hiçbir target-domain (OFFICE/RECEIVABLE/COLLECTION/DEBTOR/ACCOUNTING) business-effect'i ÜRETMEZ; yalnız input-alma/sunum/etkileşim yüzeyi olarak konumlanır. Bu model POL-C'nin NON-AUTHORITATIVE PORTAL INTERACTION kararıyla birebir tutarlıdır; onu genişletmez, daraltmaz veya yeniden yorumlamaz.

### 20.2 Two External Channels

CLIENT domain'in iki ayrı external channel'ı canonical olarak AYRI tutulur ve birbirine dönüştürülmez:

- **SESSION-BASED PORTAL** — `ClientPortalUser` authenticated session; AS-IS bilinen linked-client bağlamı; POL-C/POL-J kapsamındaki bounded interaction rejimi.
- **TOKEN-BASED PUBLIC INTAKE** — `client-intake-public` token-gated erişim; principal kimliği AS-IS kanıtlanmamış; PRE-CANONICAL EXTERNAL INPUT niteliği BP-09'dan korunur.

Bu iki kanal ortak bir "external actor" soyutlamasına indirgenmez; her biri kendi capability/lifecycle/evidence sınırlarını korur.

### 20.3 Actor Precision

Dört katmanlı actor ayrımı canonical olarak sabitlenir: **PORTAL ACCOUNT** (teknik kimlik bilgisi) ≠ **CLIENT PRINCIPAL** (karar yetkisine sahip hukuki/gerçek kişi) ≠ **ACTING HUMAN** (fiilen input'u giren gerçek kişi) ≠ **CORPORATE REPRESENTATIVE** (tüzel kişi adına yetkili temsilci). Bu dört katmanlı ayrım **PERSON dahil TÜM client tiplerine** uygulanır: PERSON client için dahi "portal hesabı = o kişinin kendisi" varsayımı otomatik canonical fact DEĞİLDİR (kimlik bilgisi paylaşımı/hesap erişim devri yapısal olarak dışlanamaz). COMPANY/PUBLIC client'ta acting-human/corporate-representation POL-C'de zaten AS-IS KANITLANMIYOR olarak kaydedilmiştir; BP-05 bunu genişletmeden aynen devralır.

### 20.4 Capability Map

| Capability | Portal (session-based) | Public intake (token-based) |
|---|---|---|
| Case/PoA read (presentation) | Permitted, POL-J object-scope'a tabi | Yok |
| Document upload/download | Non-authoritative external artifact | Yok |
| Message exchange | Communication only | Yok |
| Notification access | Presentation only | Yok |
| Raw external input / intake submission | N/A | Pre-canonical, principal authentication NOT PROVEN |
| Client instruction | Otomatik üretilmez | Otomatik üretilmez |
| Client consent/decision | Yetkisiz | Yetkisiz |
| Financial visibility | Ayrı BP-06 kararı | Yetkisiz |
| Financial action / target-domain mutation | Yasak | Yasak |

### 20.5 External-Input Lifecycle

Beş aşamalı zincir canonical olarak sabitlenir: **EXTERNAL ACTION → RAW/PRE-CANONICAL INPUT → STAFF REVIEW → CANONICAL PROMOTION (yalnız destekleniyorsa) → TARGET-DOMAIN PROCESS (yalnız ayrıca yetkilendirilmişse).** Hiçbir adım atlanamaz; sonraki adımın varlığı önceki adımın otomatik tamamlandığı anlamına GELMEZ; canonical promotion, target-domain execution'ı OTOMATİK TETİKLEMEZ. Promotion sonrası üretilen kayıt FACT-B-benzeri olabilir, ancak kaynak external action'ı asla FACT A'ya YÜKSELTMEZ (bkz. §20.6).

### 20.6 POL-C Consumption

POL-C'nin (§18) core kararı DEĞİŞMEDEN tüketilir: **NON-AUTHORITATIVE PORTAL INTERACTION. PORTAL FACT A: NOT PRODUCED. PORTAL CLIENT-DECISION AUTHORITY: NONE. PORTAL BUSINESS-EFFECT AUTHORITY: NONE.** BP-05 bu kararı genişletmez, daraltmaz veya bir istisna eklemez.

### 20.7 POL-J Consumption

POL-J'nin (§19) core kararı DEĞİŞMEDEN tüketilir: **PORTAL REQUIRED SCOPE = tenant + linked client + object relation** (business-effect authority NONE). **STAFF REQUIRED SCOPE = tenant + OFF/OD-08 object scope + action-specific existing actor eligibility.** Non-equation zinciri korunur: `STAFF JWT ≠ OBJECT AUTHORIZATION` · `OBJECT AUTHORIZATION ≠ ELIGIBLE REVIEWER` · `ELIGIBLE REVIEWER ≠ OFFICE APPROVER` · `OFFICE APPROVER ≠ TARGET-DOMAIN EXECUTOR`. BP-05 yeni object-scope modeli veya predicate ÜRETMEZ.

### 20.8 Portal Identity / Lifecycle

AS-IS kayda alınabilir fact'ler: client-linked technical account · password authentication · active/disabled state · credential-change/recovery surface · mevcut session behavior (POL-C §18.6'dan korunur). Aşağıdakiler AS-IS **ABSENT veya PARTIAL/GAP** olarak sabitlenir; hiçbiri bu kayıtla ÇÖZÜLMEZ:

- **Invitation ceremony** — ABSENT.
- **Multi-user delegation** — ABSENT.
- **Live session revocation** — PARTIAL/GAP (POL-C §18.7 session-invalidation bulgusu korunur).
- **Credential recovery** — PARTIAL/GAP (POL-C §18.7 credential-recovery-delivery bulgusu korunur).
- **Client-relationship-termination propagation** — UNVERIFIED/OPEN.

### 20.9 Document and Intake Evidence

BP-09 (§17) evidence sınıflandırması DEĞİŞTİRİLMEDEN tüketilir: **PortalDocument = external artifact (E5)** — içerik doğrulaması upload/review-status'tan TÜRETİLMEZ; review-status = workflow durumu, LEGAL VALIDITY DEĞİLDİR. **Intake submission = PRE-CANONICAL EXTERNAL INPUT** — principal authentication NOT PROVEN. **Promoted output** staff-review sonrası FACT-B-benzeri bir kayıt üretebilir, ancak kaynak external action bu promotion ile FACT A'ya asla ÇEVRİLMEZ (§20.5 zinciriyle tutarlı).

### 20.10 Object Access / Field Visibility

`OBJECT ACCESS ≠ FIELD VISIBILITY` (POL-J §19.5'ten korunur). Field-level kararlar bu kayıtla SEÇİLMEZ; routing: masking → **POL-D/BP-06**; aggregate visibility → **POL-F/BP-06**; financial visibility → **BP-06**. Mevcut viewer-aware presenter deseni (`office-approval-detail.presenter.ts` `toDetailDtoForViewer()`) yine **AS-IS ARCHITECTURAL EXEMPLAR** olarak kaydedilir; **mandatory masking policy olarak SEÇİLMEZ.**

### 20.11 KVKK / Retention Routing

Aşağıdaki dokuz alan yalnız **pointer** olarak kaydedilir; hiçbiri bu kayıtla karara bağlanmaz: retention · anonymization · deletion · legal hold · masking · portal visibility · subject access · evidence copy · audit retention. **ROUTING: POL-E. STATUS: OPEN/NOT SELECTED.**

### 20.12 AS-IS Delta Pointers (mükerrer risk kartı YOK)

BP-05 hiçbir yeni risk kartı AÇMAZ; yalnız mevcut kayıtlara bounded pointer eklenir:

- Session invalidation / credential recovery / acting-human-representation → **POL-C risk disposition** (`OFFICE-RISK-REGISTER.md`, §18.7).
- Object-scope enforcement / staff review authority delta → **POL-J disposition**, `STF-PRD-BOLA-001` / `STF-PRD-SCP-001` (§19.8).
- Audit/evidence-integrity delta (PoA/PortalDocument/intake-concurrency/audit-fragmentation) → **BP-09 disposition** (§17, `OFFICE-RISK-REGISTER.md`).
- Field-disclosure/masking gap → **POL-C → BP-06** routing (§18.7, §20.10).

### 20.13 Canonical Non-Equations

`PORTAL ACCOUNT ≠ CLIENT PRINCIPAL` · `CLIENT PRINCIPAL ≠ ACTING HUMAN` · `ACTING HUMAN ≠ CORPORATE REPRESENTATIVE` · `AUTHENTICATED SESSION ≠ PROVEN ACTING-HUMAN IDENTITY` · `AUTHENTICATED SESSION ≠ REPRESENTATION/DELEGATION BASIS` · `TOKEN POSSESSION ≠ PRINCIPAL AUTHENTICATION` · `EXTERNAL INPUT ≠ CANONICAL FACT` · `STAFF REVIEW ≠ TARGET-DOMAIN AUTHORIZATION` · `CANONICAL PROMOTION ≠ TARGET-DOMAIN EXECUTION` · `FACT B (staff-recorded) ≠ FACT A (authenticated external act)` · `OBJECT ACCESS ≠ FIELD VISIBILITY`.

### 20.14 Status Precision

**CLIENT-P1-BP-05: CLOSED/CANONICAL.** **MODEL: BOUNDED NON-AUTHORITATIVE PORTAL PROCESS MODEL.** **PORTAL FACT A: NONE.** **PORTAL AUTHORITY: NONE.** **TWO EXTERNAL CHANNELS: SESSION-BASED PORTAL + TOKEN-BASED PUBLIC INTAKE, CANONICALLY DISTINCT.** **ACTOR PRECISION: 4-LAYER, ALL CLIENT TYPES.** **POL-C + POL-J CONSUMPTION: UNCHANGED.** **FIELD VISIBILITY / KVKK: OPEN/ROUTED.** **BP-06: OWNER-GATED.** **IMPLEMENTATION AUTHORITY: NONE.**

### 20.15 BP-05 Self-Check

Bu bölüm: POL-C/POL-J kararlarını GENİŞLETMEZ veya DARALTMAZ; portal/public-intake'e yeni authority, role, rank veya predicate KAZANDIRMAZ; external action'ı FACT A'ya YÜKSELTMEZ; iki external channel'ı BİRLEŞTİRMEZ; PERSON client için acting-human identity VARSAYMAZ; field-masking/aggregate-visibility/financial-visibility/KVKK policy'si SEÇMEZ; mevcut riskler için mükerrer risk kartı AÇMAZ; BP-06'yı BAŞLATMAZ; Phase 1 blueprint'i bütünüyle CLOSED İLAN ETMEZ; kod/schema/migration DEĞİŞTİRMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 21. CLIENT-P1-POL-D — Client-Facing Field Visibility / Masking Policy (OWNER RATIFIED)

Bu bölüm `CLIENT-P1-POL-D` karar analizinin **owner-ratified policy**'sidir (`decision-log.md` CLIENT-P1-POL-D-GOV; **SELECTED MODEL: OPTION B — VIEWER-AWARE EXPLICIT FIELD CONTRACT**). Mevcut kanonik AS-IS gerçekleri (AS-IS kod + charter §15 BP-07 + §17 BP-09 + §18 POL-C + §19 POL-J + §20 BP-05 + OFF/OD-08) ve owner kararını **konsolide eder**; yeni object-scope modeli, aggregate-visibility policy, financial-visibility policy, KVKK/retention policy, client-type-specific policy veya presenter/DTO implementasyonu ÜRETMEZ. §5, §6, §8.A, §8.B, §11–§20 metinlerini semantik olarak değiştirmez. **RAW CLIENT-FACING ENTITY RESPONSE: PROHIBITED. INTERNAL-ONLY/UNKNOWN FIELDS: OMIT. OBJECT AUTHORIZATION: UNCHANGED/POL-J. AGGREGATE VISIBILITY: OPEN/POL-F. FINANCIAL VISIBILITY: OPEN/BP-06. RETENTION/KVKK: OPEN/POL-E. IMPLEMENTATION AUTHORITY: NONE.**

### 21.1 Selected Model

**OPTION B — VIEWER-AWARE EXPLICIT FIELD CONTRACT.** Client-facing sunum, kaynak entity'nin (veya ORM sonucunun) doğrudan/geniş serileştirilmesi yerine, kaynak + viewer-context'e bağlı **açık bir field contract** (allowlist/projection) üzerinden yapılmalıdır. Bu bir runtime taxonomy, DTO sınıfı seçimi veya presenter implementasyonu DEĞİLDİR — canonical policy-yönü'dür.

### 21.2 Raw Entity Response Prohibition

**CLIENT-FACING RAW ENTITY VEYA BROAD ORM RESPONSE (select'siz `include`/tam model spread'i) YASAKTIR.** Client-facing her presentation, hangi alanların döneceğini açıkça tanımlayan bir allowlist/projection contract'a **gerektirir**. Bu hüküm mevcut AS-IS uygulamayı (bazı client-facing okuma yüzeylerinin select kullanmadan geniş fetch yaptığı) **retrospektif olarak PATCH ETMEZ** — yalnız ileri-dönük canonical policy yönünü sabitler; AS-IS delta §21.10'da record-only kaydedilmiştir.

### 21.3 Field Classification Contract

Üç kategori, canonical davranışıyla birlikte:

- **CLIENT-SAFE** — açık allowlist'e dahil edilmiş, client-facing sunum için tasarlanmış alanlar. Yalnız bu kategori, projection contract'ında varsayılan olarak YER ALIR.
- **INTERNAL-ONLY** — dahili personel/sistem/operasyon amaçlı alanlar. **MASKELENMEZ; TAMAMEN OMIT EDİLİR.** Masking bu kategori için yanlış mekanizmadır (maskeleme "alan var ama değeri gizli" anlamına gelir; internal-only alan client-facing contract'ta hiç YER ALMAMALIDIR).
- **UNKNOWN / UNCLASSIFIED** — henüz sınıflandırılmamış herhangi bir alan. **VARSAYILAN: OMIT.** Yeni bir alan şemaya eklendiğinde, açıkça CLIENT-SAFE olarak allowlist'e alınana kadar client-facing contract'a otomatik GİRMEZ (fail-closed default).

Bu üçlü sınıflandırma **canonical policy yönüdür**, ancak somut alan-alan (field-by-field) atama bu belgeye YAZILMAZ — yalnız §21.5'te kategorik, route/dosya/field-adı içermeyen bir AS-IS pointer kaydedilmiştir.

### 21.4 Masking / Redaction Boundary

**MASKING/REDACTION: CONTEXT-DEPENDENT.** Sensitive bir alan yalnız **açık bir client-facing amacı varsa** mask/redact edilerek allowlist'e girebilir (örn. bir kimlik numarasının kısmi gösterimi) — omission'ın alternatifi olarak değil, CLIENT-SAFE sınıflandırmasının bir alt-türü olarak. **MIXED-PURPOSE ALANLAR** (hem staff hem client tarafından farklı amaçlarla kullanılabilen tek bir serbest-metin alanı gibi) **doğrudan CLIENT-SAFE İLAN EDİLEMEZ** — böyle bir alan ya (a) amaç-bazlı ayrıştırılmalı (internal-only bileşen + ayrı client-facing bileşen) ya da (b) viewer-context'e bağlı koşullu allowlist'e girmelidir; hangisinin seçileceği bu kayıtla KARARLAŞTIRILMAZ, yalnız ilke sabitlenir.

### 21.5 AS-IS Field-Exposure Findings (kategorik pointer; route/dosya/field-adı YOK)

CLIENT-P1-POL-D read-only analizi, mevcut client-facing okuma yüzeylerinde şu kategorik AS-IS deseni doğruladı: bazı yüzeyler açık allowlist kullanıyor (CLIENT-SAFE, temiz); bazı yüzeyler select'siz geniş fetch kullanıyor ve bu yolla (a) staff'a-özel serbest-metin notların, (b) dahili sistem/otomasyon/tespit-pipeline durumunun, (c) dahili personel kimlik referanslarının, (d) sunucu-içi dosya yollarının, (e) dahili workflow/audit-trail kayıtlarının **same-client** (bkz. §21.10 — cross-tenant DEĞİL) sunuma karıştığı görüldü. Ayrıca en az bir **mixed-purpose** alan deseni (hem onay hem red durumunda aynı serbest-metin alanının koşulsuz döndüğü) tespit edildi — bu, §21.4'ün mixed-purpose hükmünün doğrudan gerekçesidir. Somut field/route/method/dosya-adı bu belgeye YAZILMAZ.

### 21.6 Object Authorization Boundary

**OBJECT AUTHORIZATION: UNCHANGED / POL-J.** POL-D yalnız object-access ZATEN verilmiş bir kaydın hangi alanlarının sunulacağını düzenler; hangi kaydın hangi viewer'a görünür olacağını (tenant/client/object-relation scope) DÜZENLEMEZ. `TENANT MATCH ≠ OBJECT AUTHORIZATION ≠ FIELD VISIBILITY` (POL-J §19.5) bu kayıtla AYNEN korunur. POL-D, POL-J'nin OFF/OD-08 inheritance modeline rakip veya ek bir object-scope modeli ÜRETMEZ.

### 21.7 Presenter Pattern Boundary

Mevcut viewer-context-aware presenter deseni (`office-approval-detail.presenter.ts` benzeri: viewer-ilişkisine bağlı seviye + masked-fields sidecar) **yalnız AS-IS ARCHITECTURAL EXEMPLAR olarak kaydedilir** — Option B'nin **zorunlu implementasyonu veya referans mimarisi olarak SEÇİLMEDİ.** Bu desenin CLIENT-facing yüzeylere uygulanıp uygulanmayacağı, hangi mekanizma ile (yeni presenter, DTO sınıfı, global interceptor, başka bir yaklaşım) uygulanacağı **implementation-zamanı kararıdır, bu blueprint kaydıyla SEÇİLMEZ.**

### 21.8 Client-Type Neutrality

**PERSON / COMPANY / PUBLIC client türleri için farklı bir visibility policy SEÇİLMEZ.** AS-IS analiz, client-type'ın herhangi bir field-visibility farkına neden olmadığını doğruladı; bu kayıt bunu DEĞİŞTİRMEZ, yeni bir client-type-conditional kural ÜRETMEZ.

### 21.9 Open-Slot Routing (yalnız pointer; ÇÖZÜLMEZ)

**AGGREGATE VISIBILITY → POL-F** (çoklu-kayıt rollup/istatistik sunumu; bu kayıt tek-kayıt field-visibility'sinden ayrıdır, hiç ele alınmadı). **FINANCIAL VISIBILITY → BP-06** (hangi finansal alanların/özetlerin portala açılacağı; POL-D yalnız mekanizma ilkesini sabitler, eşik/kapsam kararı vermez). **RETENTION/KVKK → POL-E** (BP-09'un `RETENTION/KVKK: OPEN/NOT SELECTED` dispozisyonu bu kayıtla DEĞİŞMEDİ; masking/omission bir alanın saklama/silme/anonimleştirme rejimini ETKİLEMEZ).

### 21.10 AS-IS Risk Disposition (pointer; mükerrer kart YOK)

Bu kaydın §21.5 bulguları, POL-C'nin (§18.7) zaten kaydettiği **case-detail field-exposure** delta'sına doğrudan bağlanır — o delta zaten "client-sunumu-amaçlanmamış alanlar; **cross-tenant NOT ESTABLISHED**, same-client field-level gap, BP-06/POL-D'ye routed" olarak kayıtlıydı; POL-D bu routing'i **tüketir ve kapatır** (artık POL-D'nin kendi disposition'ına bağlıdır), **yeni bir risk kartı AÇMAZ.** **SAME-CLIENT DISCLOSURE ≠ CROSS-TENANT EXPOSURE** — bu kayıt hiçbir yeni cross-tenant iddiası TAŞIMAZ. **REMEDIATION: NOT AUTHORIZED** (field-level select/allowlist uygulaması implementation'dır, bu blueprint kaydı bunu YETKİLENDİRMEZ).

### 21.11 Canonical Non-Equations

`RAW ENTITY RESPONSE ≠ CLIENT-FACING PRESENTATION` · `OBJECT ACCESS ≠ FIELD VISIBILITY` · `FIELD MASKING ≠ OBJECT AUTHORIZATION` · `MASKING ≠ DATA DELETION` · `MASKING ≠ ANONYMIZATION` · `MASKING ≠ RETENTION POLICY` · `CLIENT-SAFE PRESENTATION ≠ SOURCE-OF-TRUTH OWNERSHIP` · `DOCUMENT ACCESS ≠ ACCESS TO INTERNAL REVIEW METADATA` · `FINANCIAL VISIBILITY ≠ FINANCIAL AUTHORITY` · `SAME-CLIENT DISCLOSURE ≠ CROSS-TENANT EXPOSURE` · `MIXED-PURPOSE FIELD ≠ CLIENT-SAFE BY DEFAULT`.

### 21.12 Status Precision

**CLIENT-P1-POL-D: CLOSED/CANONICAL.** **MODEL: VIEWER-AWARE EXPLICIT FIELD CONTRACT.** **RAW CLIENT-FACING ENTITY RESPONSE: PROHIBITED.** **INTERNAL-ONLY / UNKNOWN FIELDS: OMIT.** **MASKING/REDACTION: CONTEXT-DEPENDENT, MIXED-PURPOSE-FIELD-EXEMPT.** **OBJECT AUTHORIZATION: UNCHANGED/POL-J.** **AGGREGATE VISIBILITY: OPEN/POL-F.** **FINANCIAL VISIBILITY: OPEN/BP-06.** **RETENTION/KVKK: OPEN/POL-E.** **IMPLEMENTATION AUTHORITY: NONE.**

### 21.13 POL-D Self-Check

Bu bölüm: POL-J'nin object-scope modelini GENİŞLETMEZ veya rakip model ÜRETMEZ; POL-C'yi yeniden AÇMAZ; portal authority'yi GENİŞLETMEZ; presenter desenini zorunlu implementasyon YAPMAZ; PERSON/COMPANY/PUBLIC için farklı policy SEÇMEZ; mixed-purpose alanı doğrudan client-safe İLAN ETMEZ; same-client bulgusunu cross-tenant exploit olarak SUNMAZ; POL-F/BP-06/POL-E kararı VERMEZ; mevcut riskler için mükerrer risk kartı AÇMAZ; runtime field taxonomy/DTO/presenter seçimi YAPMAZ; kod/schema/migration DEĞİŞTİRMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 22. CLIENT-P1-POL-F — Client-Facing Aggregate Visibility Policy (OWNER RATIFIED)

Bu bölüm `CLIENT-P1-POL-F` karar analizinin **owner-ratified policy**'sidir (`decision-log.md` CLIENT-P1-POL-F-GOV; **SELECTED MODEL: OPTION B — CLIENT-SCOPED NON-FINANCIAL AGGREGATE VISIBILITY**). Mevcut kanonik AS-IS gerçekleri (AS-IS kod + charter §15 BP-07 + §19 POL-J + §21 POL-D + SEC-XTEN-AUTOMATION-STATS-01 kapanışı) ve owner kararını **konsolide eder**; yeni object-scope modeli, financial-visibility policy, KVKK/retention policy, staff aggregate authority veya dashboard/query implementasyonu ÜRETMEZ. §5, §6, §8.A, §8.B, §11–§21 metinlerini semantik olarak değiştirmez. **CLIENT-FACING FINANCIAL AGGREGATES: NOT AUTHORIZED. CROSS-CLIENT PORTAL AGGREGATION: PROHIBITED. OFFICE/TEAM AGGREGATES: OUTSIDE CLIENT-FACING POL-F SCOPE. IMPLEMENTATION AUTHORITY: NONE.**

### 22.1 Selected Model

**OPTION B — CLIENT-SCOPED NON-FINANCIAL AGGREGATE VISIBILITY.** Client-facing aggregate görünürlüğü yalnız **tek linked client + viewer-authorized object set + explicit non-financial aggregate contract** sınırında mümkündür.

### 22.2 Core Policy

**Canonical rule: AGGREGATE CALCULATION SET MUST BE A SUBSET OF VIEWER-AUTHORIZED OBJECT SET.** Viewer'ın erişemediği kayıtlar count, total, category, trend, distribution veya drill-down yoluyla dolaylı olarak ifşa edilemez.

### 22.3 Definitions

`FILTERED RECORD LIST ≠ AGGREGATE` · `PAGINATION TOTAL ≠ BUSINESS SUMMARY` · `CLIENT-SIDE REDUCE/LENGTH ≠ AUTHORITATIVE SERVER AGGREGATE` · `SINGLE-OBJECT PRESENTATION ≠ CROSS-CASE AGGREGATE` · `VISIBLE AGGREGATE ≠ ACCESS TO UNDERLYING RECORDS` · `ACCESS TO UNDERLYING RECORDS ≠ PERMISSION TO AGGREGATE`. Bir listenin tarayıcıda toplanması veya sayılması canonical aggregate contract OLUŞTURMAZ.

### 22.4 Allowed Aggregate Class

**Permitted class: CLIENT-SCOPED NON-FINANCIAL OPERATIONAL AGGREGATES.** Örnek semantic family: unread message count · unread notification count · explicitly approved operational record counts. **Mevcut AS-IS ve doğrulanmış iki aggregate:** portal notification unread count · portal message unread count — bunlar linked-client scoped olmalı, object/recipient relation'ını korumalı, business authority ÜRETMEMELİ ve POL-D explicit response contract'ına tabi OLMALIDIR. Başka operational count veya summary yalnız ayrı ve açık aggregate contract ile eklenebilir; bu kayıt yeni aggregate endpoint veya liste TASARLAMAZ.

### 22.5 Prohibited Aggregate Classes

Mevcut POL-F kararı altında client-facing olarak yetkilendirilmez: cross-client aggregates · tenant-wide aggregates · office-wide aggregates · team/direct-report aggregates · financial totals · financial balances · financial trends · financial category distributions · accounting aggregates. **Portal hesabının tek Client bağlantısı multi-client aggregation authority OLUŞTURMAZ.**

### 22.6 Cross-Case Scope

Tek client'ın birden fazla case'i üzerinden non-financial aggregation, yalnız şu koşullarla policy bakımından **mümkün olabilir**: tüm dahil edilen case'ler linked client'a ait · tüm case'ler POL-J object authorization'ından geçer · aggregate dimension explicit olarak client-safe · hiçbir internal/unknown dimension ifşa edilmez. **Bu kayıt belirli bir cross-case aggregate'i yetkilendirmez veya oluşturmaz.**

### 22.7 POL-J Consumption

**PORTAL SCOPE: TENANT + LINKED CLIENT + OBJECT RELATION. STAFF SCOPE: TENANT + OFF/OD-08 OBJECT SCOPE.** POL-F object authorization KURMAZ, OFF/OD-08'i DEĞİŞTİRMEZ, tenant-wide veriye fallback YAPMAZ. **SCOPE UNKNOWN: DO NOT AGGREGATE. CLIENT SCOPE ABSENT: DO NOT FALL BACK TO TENANT-WIDE DATA.**

### 22.8 POL-D Consumption

Aggregate response'ları da POL-D'ye tabidir: **RAW AGGREGATE RESPONSE: NOT AUTOMATICALLY CLIENT-SAFE. INTERNAL-ONLY DIMENSIONS: OMIT. UNKNOWN/UNCLASSIFIED DIMENSIONS: OMIT. DRILL-DOWN IDENTIFIERS: EXPLICIT CLIENT-FACING CONTRACT REQUIRED.** Aggregate internal status, internal category, personel kimliği, teknik tanımlayıcı veya workflow metadata üzerinden dolaylı disclosure YAPAMAZ.

### 22.9 Client-Side Derived Cards (AS-IS delta, record-only)

Tarayıcıda mevcut liste üzerinden hesaplanan kartlar **PRESENTATION-DERIVED VALUE**'dur, canonical aggregate DEĞİLDİR. Eksik, kısıtlı veya `take`-uygulanmış bir alt küme üzerinden hesaplanan değer TOTAL/COMPLETE/AUTHORITATIVE/CURRENT FINANCIAL FACT olarak ETİKETLENEMEZ. AS-IS'te eksik veri üzerinden düşük hesaplanabilen finansal kart: **KNOWN PRESENTATION-ACCURACY DELTA — REMEDIATION: NOT AUTHORIZED** (bu bölümün kendisinde record-only kaydedilir; ayrı risk kartı AÇILMADI, repository'nin mevcut deseninde eşdeğer kayıt gerektirmiyor).

### 22.10 Financial Aggregate Decision

**CLIENT-FACING FINANCIAL AGGREGATES: NOT AUTHORIZED UNDER POL-F OPTION B.** Portala aggregate olarak sunulamaz: claimed amount total · collected amount total · outstanding amount total · advance/cari total · payable total · payout total · accounting total. **Gerekçeler:** `principalAmount` canonical aggregate source DEĞİLDİR · Collection status-filter convention canonical DEĞİLDİR · advance/cari single source-of-truth SEÇİLMEMİŞTİR · reconciliation contract canonical DEĞİLDİR · payout recording bank execution DEĞİLDİR · accounting representation CLIENT authority'sinde DEĞİLDİR. `AGGREGATE ≠ SOURCE-OF-TRUTH` · `SUMMARY ≠ RECONCILIATION` · `FINANCIAL VISIBILITY ≠ FINANCIAL AUTHORITY`.

### 22.11 BP-06 Financial Boundary

POL-F kararı bütün finansal alan görünürlüğünü YASAKLAMAZ. BP-06 ayrı olarak değerlendirebilir: single-object client-safe financial fields · explicitly curated case-level financial context. Ancak BP-06 bu alanları aggregate total'a DÖNÜŞTÜREMEZ, BP-07 source/reconciliation boşluklarını OVERRIDE EDEMEZ, CLIENT'e financial authority VEREMEZ. **SINGLE-OBJECT FINANCIAL VISIBILITY: BP-06 OWNER-GATED. FINANCIAL AGGREGATE VISIBILITY: NOT AUTHORIZED.**

### 22.12 Confidence / Source Precision (pointer; POL-F içinde çözülmez)

Claimed amount: source confidence NON-UNIFORM · collected amount: status-filter semantics NOT CANONICAL · outstanding amount: source-dependent · advance/cari: SOT NOT SELECTED, reconciliation OPEN · payable: NOT PAYMENT · payout recorded: NOT BANK EXECUTION · accounting representation: ACCOUNTING AUTHORITY.

### 22.13 Failure Semantics

**Scope belirsizliği:** DO NOT AGGREGATE, NO TENANT-WIDE FALLBACK. **Source eksikliği/stale veri:** güvenli read yüzeyinde PARTIAL/STALE/UNAVAILABLE/NOT COMPUTED gösterilebilir; ancak COMPLETE/CURRENT/AUTHORITATIVE/LEGAL-FINANCIAL FACT iddiası YAPILAMAZ. **Inference riski:** küçük grup/tek kayıt/nadir kategori üzerinden hassas bilgi çıkarılabiliyorsa ve açık disclosure policy yoksa OMIT/WITHHOLD.

### 22.14 AS-IS Staff Aggregates

Staff-facing client/office/tenant aggregate'leri **OUTSIDE CLIENT-FACING POL-F AUTHORIZATION**'dır. Bu kayıt mevcut staff reports/dashboard'larını YETKİLENDİRMEZ, OFF/OD-08 rollout'u YAPMAZ, staff aggregate scope'unu DEĞİŞTİRMEZ, mevcut staff financial summaries'i portala AÇMAZ. Staff-side AS-IS mekanizmaları yalnız evidence/input olarak referanslanır.

### 22.15 Open-Slot Register (yalnız pointer; ÇÖZÜLMEZ)

Single balance source-of-truth · balance reconciliation · Collection status-filter convention · principal-amount source hardening · financial aggregate expansion · small-group inference thresholds · client-facing trend policy · aggregate drill-down policy. **Option C'ye gelecekte geçiş ayrı owner policy kararı gerektirir.**

### 22.16 BP-06 Effect

Canonical merge sonrasında: **POL-D: CLOSED/CANONICAL. POL-F: CLOSED/CANONICAL. BP-06 VISIBILITY PREREQUISITES: SATISFIED. BP-06: READY/NOT STARTED. POL-E/KVKK: OPEN.** BP-06 bu görev sırasında BAŞLATILMAZ.

### 22.17 Canonical Non-Equations

`FILTERED RECORD LIST ≠ AGGREGATE` · `PAGINATION TOTAL ≠ BUSINESS SUMMARY` · `CLIENT-SIDE REDUCE/LENGTH ≠ AUTHORITATIVE SERVER AGGREGATE` · `SINGLE-OBJECT PRESENTATION ≠ CROSS-CASE AGGREGATE` · `VISIBLE AGGREGATE ≠ ACCESS TO UNDERLYING RECORDS` · `ACCESS TO UNDERLYING RECORDS ≠ PERMISSION TO AGGREGATE` · `AGGREGATE ≠ SOURCE-OF-TRUTH` · `SUMMARY ≠ RECONCILIATION` · `FINANCIAL VISIBILITY ≠ FINANCIAL AUTHORITY` · `CLIENT-SCOPED ≠ TENANT-WIDE`.

### 22.18 Status Precision

**CLIENT-P1-POL-F: CLOSED/CANONICAL.** **MODEL: CLIENT-SCOPED NON-FINANCIAL AGGREGATE VISIBILITY.** **FINANCIAL AGGREGATES: NOT AUTHORIZED.** **CROSS-CLIENT AGGREGATES: PROHIBITED.** **POL-D: CONSUMED/UNCHANGED.** **BP-06: READY/NOT STARTED.** **RECONCILIATION: OPEN.** **IMPLEMENTATION AUTHORITY: NONE.**

### 22.19 POL-F Self-Check

Bu bölüm: POL-J object authorization modelini GENİŞLETMEZ veya rakip model ÜRETMEZ; OFF/OD-08'i DEĞİŞTİRMEZ; POL-D field contract'ını yeniden AÇMAZ; filtered list'i aggregate SAYMAZ; pagination total'ı business summary YAPMAZ; client-side reduce'ı canonical aggregate İLAN ETMEZ; multi-client portal aggregation YETKİLENDİRMEZ; financial aggregate visibility AÇMAZ; staff aggregate authority GENİŞLETMEZ; BP-07 SOT/reconciliation boşluklarını OVERRIDE ETMEZ; POL-E/KVKK kararı VERMEZ; yeni aggregate endpoint/dashboard/query/cache/materialized-view TASARLAMAZ; mevcut riskler için mükerrer risk kartı AÇMAZ; kod/schema/migration DEĞİŞTİRMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 23. CLIENT-P1-BP-06 — Client-Facing Visibility Model (OWNER RATIFIED)

Bu bölüm `CLIENT-P1-BP-06` karar analizinin **owner-ratified consolidating blueprint**'idir (`decision-log.md` CLIENT-P1-BP-06-GOV; **SELECTED MODEL: OPTION B — BOUNDED CLIENT-FACING VISIBILITY MAP**). BP-06, foundational değil **consolidating** bir blueprint birimidir: POL-J(§19)+POL-D(§21)+POL-F(§22) sonuçlarını, BP-07(§15)+BP-08(§16)+BP-09(§17) sınırlarını koruyarak **tek bounded resource-bazlı client-facing visibility map'inde birleştirir**; yeni object-scope modeli, field-contract modeli, aggregate-visibility modeli, financial-authority veya KVKK/retention policy ÜRETMEZ. §5, §6, §8.A, §8.B, §11–§22 metinlerini semantik olarak değiştirmez. **FINANCIAL AGGREGATES: NOT AUTHORIZED. CLIENT STATEMENT PORTAL VISIBILITY: NOT AUTHORIZED. IMPLEMENTATION AUTHORITY: NONE.**

### 23.1 Selected Model

**OPTION B — BOUNDED CLIENT-FACING VISIBILITY MAP.** Client-facing visibility, POL-J+POL-D+POL-F'yi resource-bazlı tek bir haritada konsolide eder; field-by-field allowlist tasarımı (Option C) veya implementation-oriented mimari (Option D) SEÇİLMEDİ.

### 23.2 Visibility Layering

Client-facing visibility şu sırayla değerlendirilir: **1. OBJECT AUTHORIZATION → 2. FIELD VISIBILITY CONTRACT → 3. AGGREGATE VISIBILITY POLICY → 4. SOURCE CONFIDENCE/FRESHNESS → 5. PRESENTATION RESULT.** Object authorization başarısızsa field veya aggregate değerlendirmesi YAPILMAZ. **Canonical non-equations:** `OBJECT ACCESS≠FIELD VISIBILITY` · `FIELD VISIBILITY≠AGGREGATE VISIBILITY` · `VISIBLE VALUE≠SOURCE-OF-TRUTH OWNERSHIP` · `FINANCIAL VISIBILITY≠FINANCIAL AUTHORITY` · `LIST≠AGGREGATE` · `CLIENT-SIDE REDUCE≠AUTHORITATIVE TOTAL`.

### 23.3 POL-J Consumption

**CONSUMED/UNCHANGED.** Portal viewer: TENANT+LINKED CLIENT+RESOURCE/OBJECT RELATION. Staff viewer: TENANT+OFF/OD-08 OBJECT SCOPE+action-specific actor eligibility (gerektiğinde). BP-06 yeni object-scope modeli OLUŞTURMAZ, OFF/OD-08'i DEĞİŞTİRMEZ, portal account'a client-related tüm nesnelere erişim VERMEZ, staff JWT'yi sınırsız object authority SAYMAZ.

### 23.4 POL-D Consumption

**CONSUMED/UNCHANGED.** Raw entity/ORM response PROHIBITED. Internal-only ve unknown/unclassified alan: OMIT. Context-dependent alan: gerekli context yoksa OMIT. Sensitive alan: yalnız açık client-facing amaç varsa mask/redact. Client-safe alan: açık contract üzerinden present. Masking/omission/redaction object authority OLUŞTURMAZ. Mevcut viewer-aware presenter deseni yalnız **AS-IS ARCHITECTURAL EXEMPLAR**, SEÇİLMİŞ implementasyon DEĞİL.

### 23.5 POL-F Consumption

**CONSUMED/UNCHANGED.** Permitted aggregate class: CLIENT-SCOPED NON-FINANCIAL OPERATIONAL AGGREGATES — AS-IS doğrulanmış örnekler: unread notification count, unread message count. Yasak kalan: total claimed/collected/outstanding/advance-cari/payable/payout, accounting totals, financial trends. Cross-client/tenant-wide/office-wide/team-wide aggregate'ler BP-06 authority'sine GİRMEZ.

### 23.6 Resource Visibility Map

**Client profile:** BOUNDED CLIENT-SAFE PRESENTATION; raw client record PROHIBITED; portal account client principal veya acting-human identity olarak SUNULMAZ. **Case list:** PERMITTED, curated list presentation, aggregate DEĞİL; POL-J object scope + POL-D field contract'ına tabi; pagination/kayıt-sayısı business aggregate DEĞİLDİR. **Case detail:** yalnız açık case-detail contract üzerinden PERMITTED; broad entity include CANONICAL DEĞİL; internal notes, internal personnel references, automation/workflow state, internal risk/detection data, OCR/technical processing data, internal audit trail, technical metadata, internal financial engine details client-facing response'ta YER ALAMAZ; case list ve detail aynı presentation-policy ailesine bağlıdır. **Debtor-related context:** case erişimi tüm debtor-side çalışma alanını GÖRÜNÜR YAPMAZ; client-safe legal context PRESENTED OLABİLİR, internal case/debtor work notes OMIT, belirsiz representative/legal-context alanları sınıflandırılana kadar OMIT; DEBTOR legal-status authority CLIENT'e TAŞINMAZ. **Power of attorney:** mandate metadata context/legal-basis dependent; storage location/file path internal-only/OMIT; mandate display execution authority'ye EŞİT DEĞİLDİR. **Portal documents:** dört katman ayrı korunur — document metadata (client-safe, object contract) · document content (client-safe, object contract) · review status (workflow presentation, content verification DEĞİL) · internal review metadata (reviewer identity/internal review data: OMIT); mixed-purpose review text varsayılan OMIT, client-facing rejection reason yalnız ayrı açık projection contract ile var OLABİLİR — bir red gerekçesinin ileride sunulması internal review note'u görünür YAPMAZ, aynı storage alanını otomatik client-safe YAPMAZ, hukuki doğruluk veya target-domain approval ÜRETMEZ. **Messages:** message content client-facing communication; sender presentation name/type client-safe OLABİLİR; internal staff identifier OMIT; PORTAL MESSAGE≠CLIENT INSTRUCTION. **Notifications:** yalnız client-facing oluşturulan içerik PERMITTED; notification legal fact/business authority/approval/instruction ÜRETMEZ. **Approval/provenance evidence:** POL-B+BP-04+BP-09 korunur — FACT A AS-IS ABSENT; FACT B staff-recorded, FACT A'ya NON-CONVERTIBLE; audit event business authority DEĞİL; bu ledger'ların portal görünürlüğü BU GÖREVLE AÇILMAZ (AS-IS yapısal olarak erişilemez kalır).

### 23.7 Non-Financial Aggregate Visibility

Permitted mevcut operational aggregate'ler: unread notification count, unread message count — tek linked-client scope, viewer-authorized object/recipient set, açık response contract, internal dimension YOK, financial/legal authority ÜRETMEZ koşullarına tabidir. Yeni operational count ayrı açık aggregate contract GEREKTİRİR; BP-06 yeni aggregate endpoint YETKİLENDİRMEZ.

### 23.8 Client-Side Derived Values

Tarayıcı tarafında hesaplanan count/sum/total/dashboard-card canonical aggregate DEĞİLDİR; partial/limited-input reduce TOTAL/COMPLETE/AUTHORITATIVE/CURRENT BALANCE/CURRENT FINANCIAL FACT olarak ETİKETLENEMEZ. Eksik/kısıtlı collection listesi üzerinden hesaplanan mevcut financial card: **KNOWN PRESENTATION-ACCURACY DELTA, CANONICAL AGGREGATE: NO, REMEDIATION: NOT AUTHORIZED** — mevcut risk kaydına pointer (POL-F disposition), mükerrer kart AÇILMAZ.

### 23.9 Single-Object Financial Presentation

**Claimed amount:** partial case-level context olarak PRESENTED OLABİLİR; authoritative current claim ESTABLISHED DEĞİL; source confidence'ı aşan etiket ("KESİN ALACAK", "GÜNCEL TOPLAM ALACAK", "CANONICAL CLAIM BALANCE") YASAKTIR. **Collection records:** curated single-case collection-event listesi PRESENTED OLABİLİR (list presentation); collected total NOT AUTHORIZED; full collection record varsayılan client-safe DEĞİL; status-filter semantiği canonical olmadığı için liste "tam tahsilat toplamı" olarak YORUMLANAMAZ. **Outstanding amount:** AS-IS portal visibility ABSENT; BP-06 bunu YETKİLENDİRMEZ; source semantics + collection-filter bağımlılığı nedeniyle ayrı owner kararı GEREKİR. **Advance/cari:** authoritative client-facing değer NOT AUTHORIZED; single SOT NOT SELECTED; reconciliation NOT CANONICAL; "güncel bakiye" olarak SUNULAMAZ. **Payable:** payable≠paid; client-facing visibility BP-06'da NOT AUTHORIZED. **Payout recording:** payout recorded≠bank execution≠money transferred; client-facing visibility BP-06'da NOT AUTHORIZED. **Accounting representation:** authority owner ACCOUNTING; client-facing BP-06 scope'unun DIŞINDA.

### 23.10 Client Statement Decision

`ClientStatement` CLIENT-owned immutable artifact, belirli zamanda oluşturulmuş snapshot, live ledger DEĞİL, canonical current balance DEĞİL, çoklu finansal kayıttan üretilen client-level financial rollup taşır. POL-F Option B nedeniyle: **CLIENT STATEMENT PORTAL/CLIENT-FACING VISIBILITY: NOT AUTHORIZED** — gerekçe: client-facing financial aggregate visibility PROHIBITED. Statement'ın "client-facing artifact" olarak modellenmiş olması görünürlük yetkisi OLUŞTURMAZ. Gelecekte açılması ayrı owner policy kararı + POL-F expansion + source/reconciliation review GEREKTİRİR. Supersession veya void, underlying financial reversal DEĞİLDİR.

### 23.11 Financial Confidence Map

Claimed amount: PARTIAL/source confidence non-uniform. Collection context: PARTIAL/status-filter policy open. Outstanding: source-dependent/not portal-authorized. Advance/cari: unavailable as authoritative. Payable: not payment. Payout recorded: not bank execution. Accounting: outside client authority. BP-06 bu source/reconciliation boşluklarını ÇÖZMEZ.

### 23.12 Failure Semantics

Object authorization belirsizliği: DENY/ZERO DATA. Field contract eksikliği: OMIT. Aggregate scope belirsizliği: DO NOT AGGREGATE/NO TENANT-WIDE FALLBACK. Source güvenilirliği yetersizliği: AUTHORITATIVE/CURRENT/COMPLETE/LEGAL-FINANCIAL FACT olarak SUNULAMAZ; uygunsa PARTIAL/STALE/UNAVAILABLE/NOT COMPUTED/POLICY PENDING kullanılabilir — bu statüler authority ÜRETMEZ, legacy fallback AÇMAZ, business effect DOĞURMAZ.

### 23.13 Drill-Down / Inference

Aggregate görünür olsa dahi viewer'ın underlying records'a erişim yetkisi otomatik OLUŞMAZ. Küçük grup/nadir kategori/tek kayda indirgenebilen aggregate disclosure, policy ABSENT ise OMIT/WITHHOLD. Mevcut iki unread count'ta hassas category veya staff identity disclosure BULUNMAMALIDIR.

### 23.14 Portal / Staff Presentation Separation

Staff-facing reports/dashboards/accounting summaries/statement generation/office-wide aggregates client-facing BP-06 authority'sine DÖNÜŞMEZ. **STAFF VISIBILITY≠PORTAL VISIBILITY. STAFF AGGREGATE≠CLIENT-FACING AGGREGATE AUTHORITY.** OFF/OD-08 staff object scope'u DEĞİŞMEDEN kalır.

### 23.15 POL-E / KVKK Routing

BP-06 dışında açık kalır: retention · anonymization · physical deletion · legal/litigation hold · subject-access response · document retention · message retention · notification retention · audit/event retention · portal account history. Visibility veya omission: DATA DELETION/ANONYMIZATION/RETENTION POLICY/SUBJECT-ACCESS RESPONSE'a EŞİT DEĞİLDİR.

### 23.16 AS-IS Delta Pointers (mükerrer kart YOK)

Field disclosure→POL-C/POL-D. Object scope→POL-J/`STF-PRD-BOLA-001`/`STF-PRD-SCP-001`. Portal process→BP-05. Audit/evidence→BP-09. Client-side financial card accuracy→POL-F disposition. **VISIBILITY ENFORCEMENT DELTA: KNOWN/NON-ZERO. REMEDIATION: NOT AUTHORIZED.**

### 23.17 Canonical Non-Equations

`OBJECT ACCESS≠FIELD VISIBILITY` · `FIELD VISIBILITY≠AGGREGATE VISIBILITY` · `SINGLE-OBJECT FINANCIAL CONTEXT≠FINANCIAL AGGREGATE` · `FINANCIAL VISIBILITY≠FINANCIAL AUTHORITY` · `VISIBLE VALUE≠SOURCE-OF-TRUTH OWNERSHIP` · `STATEMENT≠LIVE LEDGER` · `PAYOUT RECORDING≠BANK EXECUTION` · `REVIEW STATUS≠VERIFIED DOCUMENT CONTENT` · `FACT B≠AUTHENTICATED CLIENT ACT` · `LIST≠AGGREGATE` · `CLIENT-SIDE REDUCE≠AUTHORITATIVE TOTAL`.

### 23.18 Phase 1 Remaining Slots

Foundational blueprint: COMPLETE/CANONICAL. Portal blueprint: COMPLETE/CANONICAL. Visibility blueprint: COMPLETE/CANONICAL (bu kayıtla). POL-E/KVKK: OPEN/NOT SELECTED. **PHASE 1 BLUEPRINT: OPEN** — per-subject consent sufficiency, reconciliation, implementation/remediation slotları da ilgili owner-gated kayıtlar olarak açık kalır, BP-06 modelini BLOKE ETMEZ. Phase 1 bu kayıtla CLOSED İLAN EDİLMEZ.

### 23.19 Status Precision

**CLIENT-P1-BP-06: CLOSED/CANONICAL.** **MODEL: BOUNDED CLIENT-FACING VISIBILITY MAP.** **POL-J/POL-D/POL-F: CONSUMED/UNCHANGED.** **FINANCIAL AGGREGATES: NOT AUTHORIZED.** **CLIENT STATEMENT VISIBILITY: NOT AUTHORIZED.** **SINGLE-OBJECT FINANCIAL CONTEXT: PARTIAL/EXPLICITLY LABELED ONLY.** **VISIBILITY ENFORCEMENT DELTA: KNOWN/NON-ZERO.** **POL-E/KVKK: OPEN.** **PHASE 1 BLUEPRINT: OPEN.** **IMPLEMENTATION AUTHORITY: NONE.**

### 23.20 BP-06 Self-Check

Bu bölüm: POL-J object-scope modelini GENİŞLETMEZ veya rakip model ÜRETMEZ; POL-D field contract'ını yeniden AÇMAZ; POL-F aggregate policy'sini yeniden AÇMAZ; BP-07 SOT/reconciliation boşluklarını OVERRIDE ETMEZ; BP-08 authority map'ini DEĞİŞTİRMEZ; BP-09 evidence taxonomy'sini DEĞİŞTİRMEZ; financial aggregate visibility YETKİLENDİRMEZ; ClientStatement portal visibility YETKİLENDİRMEZ; advance/cari'yi authoritative current balance YAPMAZ; payout recording'i bank execution YAPMAZ; mixed-purpose review note'u client-safe İLAN ETMEZ; staff visibility'yi portal authority'sine DÖNÜŞTÜRMEZ; POL-E/KVKK kararı VERMEZ; yeni risk kartı AÇMAZ; DTO/presenter/masking implementasyonu YAPMAZ; kod/schema/migration DEĞİŞTİRMEZ; Phase 1'i CLOSED İLAN ETMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 24. CLIENT-P1-POL-E — Retention / Anonymization / Evidence-Preservation Baseline (OWNER RATIFIED)

Bu bölüm `CLIENT-P1-POL-E` karar analizinin **owner-ratified data-lifecycle policy**'sidir (`decision-log.md` CLIENT-P1-POL-E-GOV; **SELECTED MODEL: OPTION A — MINIMUM EVIDENCE-PRESERVING BASELINE**). Fixed retention period, otomatik silme/anonimleştirme tetikleyicisi, legal-hold authority modeli **SEÇİLMEDİ**. §5, §6, §8.A, §8.B, §11–§23 metinlerini semantik olarak değiştirmez. **DESTRUCTIVE DATA-LIFECYCLE ACTION: FAIL-CLOSED. IMPLEMENTATION AUTHORITY: NONE.**

### 24.1 Selected Model

**OPTION A — MINIMUM EVIDENCE-PRESERVING BASELINE.** Sabit süre veya otomatik tetikleyici seçmeden, destructive işlemi 8-koşullu fail-closed kapıya bağlayan bir başlangıç duruşu.

### 24.2 Core Policy

Hiçbir kayıt **fiziksel olarak silinemez, anonimleştirilemez, geri döndürülemez şekilde redakte edilemez veya destructive biçimde dönüştürülemez**, şu 8 koşulun TÜMÜ açıkça belirlenmeden: (1) record-family owner, (2) business terminal event, (3) retention/legal basis, (4) evidence dependency, (5) cross-domain dependency, (6) active hold status, (7) reference-integrity impact, (8) authorized deletion method. Bu koşullardan biri belirsizse: **DO NOT DELETE. DO NOT ANONYMIZE. DO NOT CASCADE. DO NOT PURGE. CLASSIFY: OWNER/LEGAL/CROSS-DOMAIN DECISION REQUIRED.**

### 24.3 Baseline Nature

Option A: sabit saklama süresi SEÇMEZ; tüm kayıtları süresiz saklama yükümlülüğü KURMAZ; mevcut fiziksel veriyi hukuken gerekli İLAN ETMEZ; mevcut kod davranışını KVKK'ya tam uyumlu İLAN ETMEZ; ileride record-family bazlı retention matrisi kurulmasını ENGELLEMEZ. **Canonical precision:** `EVIDENCE-PRESERVING BASELINE≠PERMANENT RETENTION POLICY` · `NO AUTHORIZED DELETION≠LEGAL REQUIREMENT TO KEEP FOREVER` · `POLICY GAP≠DELETE AUTHORITY` · `CURRENT TECHNICAL BEHAVIOR≠VERIFIED LEGAL COMPLIANCE`.

### 24.4 Business Lifecycle ≠ Data Lifecycle

Şu iş olayları kendiliğinden veri silme/anonimleştirme tetikleyicisi DEĞİLDİR: client inactive · client relationship terminated · case closed · PoA expired · PoA revoked · declaration retracted · declaration false-positive · approval rejected/cancelled/expired · statement void/superseded · portal account disabled · intake promoted/rejected · document rejected. **Canonical non-equations:** `BUSINESS TERMINATION≠DATA DELETION` · `CLIENT INACTIVE≠DELETE CLIENT DATA` · `POA EXPIRED/REVOKED≠DELETE MANDATE EVIDENCE` · `RETRACTION/FALSE-POSITIVE≠PHYSICAL DELETION` · `VOID/SUPERSESSION≠UNDERLYING RECORD DELETION` · `PORTAL DISABLEMENT≠DELETE PORTAL HISTORY` · `CASE CLOSURE≠AUTOMATIC CLIENT-RECORD PURGE`.

### 24.5 Record-Family Classification

Şu 18 record ailesi bağımsız retention/deletion sınıfı olarak korunur: client identity/profile · client contact · client address · client bank component · CaseClient relationship · client power of attorney · client approval request/event · client intel statement · client intake link/submission/field · portal user/credential metadata · portal document · portal message · portal notification · client statement/line · client payout/offset references · generic AuditLog · document/source artifact · cross-domain references. **ONE RECORD-FAMILY DECISION≠ENTERPRISE-WIDE RETENTION RULE.**

### 24.6 Evidence-Preservation Classes

Ayrı değerlendirilir: business record · workflow record · audit/transition event · source document · staff-recorded attributed fact · authenticated principal act · financial/legal-effect evidence · pre-canonical external input · snapshot/projection. Destructive işlemden önce doğrulanmalı: denetim zinciri · hukuki ispat değeri · finansal mutabakat · supersession/reversal zinciri · kaynak belgenin doğrulanabilirliği · cross-domain referans bütünlüğü · actor/principal provenance.

### 24.7 Evidence-Critical Families

Ayrı owner ve gerekiyorsa hukuk değerlendirmesi olmadan deletion-safe SAYILAMAZ: CaseClient · power of attorney · approval request/event · client intel statement · client statement/line · portal document · portal message · payout/offset references · AuditLog · financial/accounting references. **Status değişikliği evidence değerini otomatik ortadan kaldırmaz:** `REJECTED/RETRACTED/FALSE-POSITIVE/EXPIRED/CANCELLED/VOID/SUPERSEDED ≠ NO EVIDENCE VALUE`.

### 24.8 Cross-Domain Ownership

**CLIENT:** client relationship + client-side evidence. **OFFICE:** internal approval + staff-actor evidence. **RECEIVABLE:** claim/receivable evidence. **COLLECTION:** receipt/disposition/payout/offset/money-out evidence. **DEBTOR:** debtor legal-status evidence. **ACCOUNTING:** accounting journal evidence. **SHARED INFRASTRUCTURE:** storage/authentication/generic-audit facilities, INDEPENDENT BUSINESS AUTHORITY YOK. CLIENT: COLLECTION kayıtlarının retention owner'ı DEĞİLDİR; ACCOUNTING kayıtlarının retention owner'ı DEĞİLDİR; RECEIVABLE/DEBTOR delillerinin retention süresini tek başına BELİRLEYEMEZ; shared infrastructure kayıtlarına business-authority ATFEDEMEZ. `CLIENT REFERENCE≠CLIENT RETENTION OWNERSHIP`.

### 24.9 Financial Record Boundary

BP-07/BP-08 hükümleri korunur: `CLIENT STATEMENT≠LIVE LEDGER` · `PAYOUT RECORDING≠BANK EXECUTION` · `VOID/SUPERSESSION≠FINANCIAL REVERSAL`. Şu kayıtlar için retention/deletion kararı ayrı COLLECTION ve/veya ACCOUNTING girdisi GEREKTİRİR: client statement/line · payout · offset · collection disposition · balance/ledger references · accounting journal references. **POL-E bunlar için sabit süre veya imha tetikleyicisi SEÇMEZ.**

### 24.10 Legal / Evidence Hold Baseline

Destructive işlemi durdurabilecek hold/review adayları: active litigation · potential dispute · regulatory/audit review · financial reconciliation · evidence preservation · security incident · data-subject request review. **Canonical baseline:** `ACTIVE DOCUMENTED HOLD/REVIEW OVERRIDES SCHEDULED DESTRUCTIVE PROCESSING` · `HOLD RELEASE DOES NOT AUTOMATICALLY REQUIRE IMMEDIATE DELETION`. Bu hüküm spesifik hold authority SEÇMEZ, litigation-hold doktrininin tüm ayrıntılarını canonical hukuk sonucu İLAN ETMEZ, tüm uyuşmazlık ihtimallerinde sınırsız saklama KURMAZ. Hukukî dayanak veya hold applicability belirsizse: **LEGAL REVIEW REQUIRED, NO AUTOMATIC DELETION.**

### 24.11 Subject-Access / Deletion Request Routing

`ROUTINE PORTAL VISIBILITY≠DATA-SUBJECT ACCESS RESPONSE` · `MASKING/OMISSION≠DATA DELETION` · `MASKING≠ANONYMIZATION` · `ANONYMIZATION≠PHYSICAL DELETION` · `RETENTION≠PORTAL VISIBILITY`. İlgili kişi talebi doğrudan purge job'a DÖNÜŞMEZ; aktif hukuki dayanak+evidence dependency incelemesi olmadan otomatik silme OLUŞTURMAZ; subject-access response'u normal portal görünürlüğüyle BİRLEŞTİRMEZ. Bu görev subject-access response kapsamını veya yetkili actor'ünü SEÇMEZ.

### 24.12 Technical Reference Safety

Ayrı değerlendirilir: hard foreign key · on-delete restrict · on-delete cascade · on-delete set-null · soft polymorphic reference · scalar cross-module reference · file path/external location · supersession link · audit entity-type/entity-id. **Canonical precision:** `DATABASE CASCADE≠LEGAL RETENTION RULE` · `DATABASE RESTRICT≠LEGAL REQUIREMENT TO KEEP` · `NO FOREIGN KEY≠SAFE TO DELETE` · `SUCCESSFUL DELETE≠EVIDENCE-SAFE DELETE`. Cascade/SetNull/soft-reference davranışları yalnız teknik gerçek olarak kaydedilir.

### 24.13 Portal / Intake Baseline

Şu kayıtlar için otomatik retention/deletion kararı VERİLMEDİ: rejected/pending document · raw intake field · promoted intake source · rejected intake source · portal message · portal notification · account/credential history · reset-token metadata · session/login evidence. `INTAKE PROMOTION≠SOURCE DELETION` · `DOCUMENT REJECTION≠DOCUMENT DELETION` · `MESSAGE READ≠MESSAGE DELETION` · `NOTIFICATION READ≠NOTIFICATION DELETION` · `ACCOUNT DISABLEMENT≠ACCOUNT-HISTORY DELETION`. Filesystem artifact ile database metadata'sı aynı transaction veya aynı retention birimi SAYILMAZ.

### 24.14 AS-IS Gap Register (record-only, mükerrer kart YOK)

Owner-listelenen 11 gap ailesi record-only kaydedildi: no unified retention contract · no unified legal-hold contract · non-uniform audit coverage · physical file/database lifecycle separation · soft-reference orphan risk · superseded/retracted record permanence · portal account history gap · raw intake source retention gap · message/notification retention gap · document review history gap · cross-domain copy/duplication gap. **Ek 3 doğrulanan gap:** `ClientAddress.isCurrent` AS-IS pasif/tutarsız (şema yorumu "arşiv, silinmez" ile şu an hiç uyuşmuyor — kod hiçbir yerde `false` atamıyor); **portal JWT revocation AS-IS ABSENT** (POL-C §18'in mevcut "session-invalidation yok" bulgusuyla AYNI kök-neden, mükerrer kart DEĞİL, ek teknik teyit); **password-reset token plaintext storage** (POL-C §18'in "credential-recovery-delivery eksik" bulgusuyla ilişkili aynı özellik alanı, ek teknik detay). Bu kayıt remediation AÇMAZ, güvenlik düzeltmesi YAPMAZ, schema/kod değişikliği BAŞLATMAZ, yeni workstream otomatik AÇMAZ.

### 24.15 Current Behavior Disposition

Repository'de AS-IS destructive data-lifecycle mekanizmasının büyük ölçüde bulunmaması: **EVIDENCE-PRESERVING EFFECT: YES. FORMAL RETENTION COMPLIANCE: NOT ESTABLISHED. FORMAL DELETION COMPLIANCE: NOT ESTABLISHED. INTENTIONAL POLICY: NOT PROVEN.** Mevcut "silinmiyor" davranışı yalnız baseline ile uyumlu bir teknik durumdur; tamamlanmış KVKK saklama-imha politikası DEĞİLDİR.

### 24.16 Legal-Source Precision

Hukukî kanıt seviyeleri ayrıştırılır: OFFICIAL-TEXT VERIFIED · OFFICIAL-GUIDANCE VERIFIED · COULD-NOT-VERIFY/LEGAL REVIEW REQUIRED. Doğrulanamayan hususlar kesin hukuk hükmü olarak YAZILMAZ. Özellikle açık bırakılır: law-office-specific retention periods · professional-liability/malpractice periods · financial/accounting retention periods · direct litigation-hold doctrine application · VERBİS status and policy obligation applicability · technical destruction method catalogue.

### 24.17 Open Decision Register

Seçilmemiş olarak kaydedilir: per-record-family retention periods · per-record-family deletion triggers · per-record-family anonymization method · legal-hold authority · hold creation/release workflow · VERBİS applicability · periodic destruction schedule · subject-access response scope · cross-domain financial retention periods.

### 24.18 Phase 1 Effect

Foundational blueprint set: COMPLETE/CANONICAL. Portal blueprint: COMPLETE/CANONICAL. Visibility blueprint: COMPLETE/CANONICAL. **Data-lifecycle baseline: COMPLETE/CANONICAL (bu kayıtla). Policy family set: COMPLETE/CANONICAL.** **PHASE 1: CLOSURE REVIEW READY, NOT CLOSED.** Phase 1 bu kayıtla CLOSED İLAN EDİLMEZ; ayrı closure/synthesis kararı GEREKİR.

### 24.19 Recommended Future Sequence (başlatılmadı)

Owner-gated önerilen sıra: (1) `CLIENT-P1-PHASE-1-CLOSURE-ANALYZE`, (2) `CLIENT-P1-POL-E-R1` (VERBİS status + legal-verification + AS-IS gap triage), (3) ayrı yetkilendirilmiş implementation/remediation birimleri. Bu kayıt sırasında sonraki birim BAŞLATILMADI.

### 24.20 Status Precision

**CLIENT-P1-POL-E: CLOSED/CANONICAL.** **MODEL: MINIMUM EVIDENCE-PRESERVING BASELINE.** **FIXED RETENTION PERIODS: NOT SELECTED.** **AUTOMATIC DELETION: NOT AUTHORIZED.** **AUTOMATIC ANONYMIZATION: NOT AUTHORIZED.** **LEGAL-HOLD CONTRACT: OPEN/NOT IMPLEMENTED.** **CROSS-DOMAIN RETENTION: OWNER-GATED.** **POL-E-R1: RECOMMENDED/NOT STARTED.** **PHASE 1: CLOSURE REVIEW READY, NOT CLOSED.** **IMPLEMENTATION AUTHORITY: NONE.**

### 24.21 POL-E Self-Check

Bu bölüm: fixed retention period SEÇMEZ; deletion trigger SEÇMEZ; anonymization method SEÇMEZ; legal-hold authority SEÇMEZ; VERBİS sonucu ÜRETMEZ; "süresiz saklama hukuken zorunlu" hükmü KURMAZ; mevcut no-delete davranışını tam compliance İLAN ETMEZ; business terminal event'i deletion trigger YAPMAZ; cross-domain retention ownership'i CLIENT'e TAŞIMAZ; financial/accounting period SEÇMEZ; database cascade'i legal policy SAYMAZ; portal visibility'yi retention ile EŞİTLEMEZ; gap register remediation'ı BAŞLATMAZ; POL-J/POL-D/POL-F/BP-06/BP-07/BP-08/BP-09'u yeniden AÇMAZ; yeni risk kartı AÇMAZ; kod/schema/migration DEĞİŞTİRMEZ; Phase 1'i CLOSED İLAN ETMEZ. **BLUEPRINT CANONICALIZATION ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 25. CLIENT Phase 1 — Blueprint / Policy Closure (OWNER RATIFIED)

Bu bölüm `CLIENT-P1-PHASE-1-CLOSURE` karar analizinin **owner-ratified final closure kaydı**dır (`decision-log.md` CLIENT-P1-PHASE-1-CLOSURE-GOV; **SELECTED MODEL: OPTION A — PHASE 1 BLUEPRINT/POLICY CLOSED WITH RESIDUAL REGISTER**). Bu kayıt yalnız CLIENT Phase 1'in bounded blueprint, authority boundaries, lifecycle models, provenance policies, portal policy, visibility policy ve retention/data-lifecycle baseline katmanlarını kapatır. §5, §6, §8.A, §8.B, §11–§24 substantive hükümlerini DEĞİŞTİRMEZ (§8'in üst-seviye bullet listesi yalnız disposition annotation ile güncellendi, tarihsel bağlamı korunur). **IMPLEMENTATION AUTHORITY: NONE.**

### 25.1 Selected Model

**OPTION A — PHASE 1 BLUEPRINT/POLICY CLOSED WITH RESIDUAL REGISTER.** Phase 1'in 20 canonical biriminin tamamı kapalı; hiçbir gerçek closure blocker bulunmadı; kalan tüm açık kalemler bir residual register'da (R2–R7) sınıflandırılıp routed edildi, hiçbiri "closure blocker" (R1) olarak işaretlenmedi.

### 25.2 Closure Scope — Canonical Non-Equations

`PHASE 1 CLOSED ≠ IMPLEMENTATION COMPLETE` · `PHASE 1 CLOSED ≠ SECURITY REMEDIATION COMPLETE` · `PHASE 1 CLOSED ≠ KVKK FULL COMPLIANCE CERTIFIED` · `PHASE 1 CLOSED ≠ FINANCIAL RECONCILIATION COMPLETE` · `PHASE 1 CLOSED ≠ PHASE 2 AUTHORIZED`.

### 25.3 Canonical Set — 20/20

CLIENT-P1-ENTRY-GOV · CLIENT-P1-XDC-01 · CLIENT-P1-POL-01-GOV · CLIENT-P1-POL-B-GOV (§8.A) · CLIENT-P1-POL-A-GOV (§8.B) · CLIENT-P1-BP-ENTRY-01-GOV · CLIENT-P1-BP-01-GOV (§11) · CLIENT-P1-BP-02-GOV (§12) · CLIENT-P1-BP-03-GOV (§13) · CLIENT-P1-BP-04-GOV (§14) · CLIENT-P1-BP-07-GOV (§15) · CLIENT-P1-BP-08-GOV (§16) · CLIENT-P1-BP-09-GOV (§17) · CLIENT-P1-POL-C-GOV (§18) · CLIENT-P1-POL-J-GOV (§19) · CLIENT-P1-BP-05-GOV (§20) · CLIENT-P1-POL-D-GOV (§21) · CLIENT-P1-POL-F-GOV (§22) · CLIENT-P1-BP-06-GOV (§23) · CLIENT-P1-POL-E-GOV (§24). **Tamamı CLOSED/CANONICAL, tekil, boşluk yok.** **Canonical conclusion:** FOUNDATIONAL BLUEPRINT: CLOSED/CANONICAL · PORTAL BLUEPRINT: CLOSED/CANONICAL · VISIBILITY BLUEPRINT: CLOSED/CANONICAL · POLICY FAMILY SET: CLOSED/CANONICAL · DATA-LIFECYCLE BASELINE: CLOSED/CANONICAL.

### 25.4 Exit Gates

**PASS.** Charter §8'in Phase 0 T05'te kaydedilen 9 orijinal açık karar ailesinden: 6'sı Phase 1'in kendi kapsamında tam kapandı (portal-authority/KVKK/masking/financial-predicate/aggregate-visibility/provenance-core-model); 1'inin dar bir alt-bileşeni (per-subject consent sufficiency) kasıtlı olarak ayrı, gelecekteki bir owner-gated birime routed edildi (blocker değil); 3'ü hiçbir zaman Client Phase 1'in kendi kararı değildi (calculation cutover→ADR-014, fee/harç→ADR-013, reversal/manual-recovery→COLLECTION) — bunlar §8'de artık "OUTSIDE CLIENT PHASE 1" olarak işaretlidir.

### 25.5 §8 Reconciliation

§8'in 9 bulleti güncel disposition ile annotate edildi (bkz. §8, üst-seviye metin); tarihsel çerçeve ("Phase 0 T05'te AÇIK bırakılmıştı") korundu, hiçbir substantive hüküm silinmedi/yeniden yazılmadı — yalnız her kalemin ŞİMDİKİ durumu eklendi.

### 25.6 Residual Register (canonical, hiçbiri R1 değil)

**R2 — Non-blocking policy residuals:** per-subject consent sufficiency · BP-03 subject-taxonomy refinement (yalnız gelecekte ihtiyaç doğarsa) · financial aggregate expansion beyond POL-F Option B.

**R3 — Implementation/enforcement gaps:** POL-A implementation PARTIAL · POL-J object-scope enforcement PARTIAL/INCOMPLETE · POL-D field-visibility delta'ları (case detail, document review metadata, message sender ID) · POL-F presentation-accuracy delta'sı · BP-09 evidence-integrity delta'ları · ClientAddress.isCurrent behavior gap · portal JWT revocation gap · plaintext reset-token gap · portal account-history gap.

**R4 — Cross-domain owner decisions:** single balance source-of-truth · balance reconciliation · Collection status-filter convention · reversal/manual recovery · accounting retention/reconciliation · calculation cutover · fee/harç producer ownership.

**R5 — Legal/regulatory verification:** VERBİS applicability · law-office-specific retention periods · legal-hold authority/direct doctrine application · financial/accounting retention periods · per-record-family deletion/anonymization rules.

**R6 — Phase 2 or later capability:** Phase 2 implementation plan · portal capability expansion · client-facing financial aggregates/statements · new operational aggregates · advanced subject/consent model.

**R7 — Known risks/remediation candidates (dedup edilmiş, mevcut kayıtlara pointer, mükerrer kart YOK):** `STF-PRD-BOLA-001` · `STF-PRD-SCP-001` · POL-C security delta'ları · POL-D visibility delta'ları · POL-E retention/security gap'leri.

### 25.7 R1 — Phase 1 Closure Blocker

**R1: NONE IDENTIFIED.** Bu hüküm residual'lerin önemsiz olduğu, remediation gerektirmediği veya Phase 2'ye taşınmayacağı anlamına GELMEZ — yalnız hiçbirinin Phase 1'in KENDİ blueprint/policy canonicalization kapsamını kapatmayı ENGELLEMEDİĞİ anlamına gelir.

### 25.8 Cross-Domain Boundary

**CLIENT:** client relationship + client-side evidence. **OFFICE:** internal actor/approval. **RECEIVABLE:** claim authority. **COLLECTION:** receipt/payout/reversal authority. **DEBTOR:** debtor legal status. **ACCOUNTING:** accounting journal authority. **SHARED INFRASTRUCTURE:** independent business authority YOK. Phase 1 closure hiçbir cross-domain authority'yi CLIENT'e TAŞIMAZ.

### 25.9 Phase 2 Entry Boundary

**PHASE 2: NOT AUTHORIZED.** Phase 2 entry AYRI owner kararı gerektirir. İleride Phase 2 açılırsa: Phase 1 canonical setini consume eder; residual register'ı taşır; her implementation/remediation için ayrı authority ister; POL-J/POL-D/POL-F/POL-E sınırlarını yeniden AÇAMAZ; financial/accounting authority'yi CLIENT'e TAŞIYAMAZ. Bu kayıt Phase 2 roadmap veya task decomposition ÜRETMEZ.

### 25.10 Final Program Status

**CLIENT PHASE 0: CLOSED/CANONICAL.** **CLIENT PHASE 1: CLOSED/CANONICAL.** **PHASE 1 TYPE: BLUEPRINT + POLICY CLOSURE.** **IMPLEMENTATION COMPLETION: NOT CLAIMED.** **REMEDIATION COMPLETION: NOT CLAIMED.** **PHASE 2: NOT AUTHORIZED.** **POL-E-R1: RECOMMENDED/NOT STARTED.**

### 25.11 Status Precision

**CLIENT-P1-PHASE-1-CLOSURE: CLOSED/CANONICAL.** **CANONICAL SET: 20/20 CLOSED/CANONICAL.** **EXIT GATES: PASS.** **REAL CLOSURE BLOCKERS: NONE.** **RESIDUAL REGISTER: RECORDED/NON-BLOCKING.** **PHASE 1: CLOSED/CANONICAL.** **PHASE 2: NOT AUTHORIZED.** **IMPLEMENTATION AUTHORITY: NONE.**

### 25.12 Phase 1 Closure Self-Check

Bu bölüm: implementation completion İDDİA ETMEZ; security remediation completion İDDİA ETMEZ; KVKK full compliance CERTIFY ETMEZ; financial reconciliation completion İDDİA ETMEZ; Phase 2'yi YETKİLENDİRMEZ veya roadmap ÜRETMEZ; POL-E-R1'i BAŞLATMAZ; VERBİS sonucu ÜRETMEZ; residual'leri CLOSED veya RESOLVED İLAN ETMEZ; cross-domain authority'yi CLIENT'e TAŞIMAZ; §5/§6/§8.A/§8.B/§11–§24 substantive hükümlerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; kod/schema/migration DEĞİŞTİRMEZ. **BLUEPRINT/POLICY CLOSURE ≠ IMPLEMENTATION AUTHORITY; IMPLEMENTATION AUTHORITY: NONE.**

## 26. CLIENT Phase 2 U01 — Portal Credential-Recovery Technical Closure (OWNER RATIFIED)

Bu bölüm, Phase 1 kapanışından (§25) sonra owner-authorized **CLIENT-P2-U01 — Portal Credential-Recovery Hardening** biriminin teknik implementasyon kapanış kaydıdır (`decision-log.md` CLIENT-P2-U01-GOV). Bu, Phase 1'in §25.9'da bıraktığı "PHASE 2: NOT AUTHORIZED" durumunu, yalnız U01 birimi için, owner'ın ayrı ve açık GO-IMPLEMENT kararıyla açar — Phase 2'nin geri kalanı hâlâ **OPEN**'dır, bu kayıtla genel bir Phase 2 roadmap'i ÜRETİLMEZ. §5, §6, §8.A, §8.B, §11–§25 substantive hükümlerini DEĞİŞTİRMEZ.

### 26.1 Technical Lineage

**CORE IMPLEMENTATION:** PR #1477 (task: `CLIENT-P2-CREDENTIAL-RECOVERY-P01`, squash SHA `d46ebdb54e442569a0a6ea794f032880eb998f4a`, merged `origin/main` 2026-07-20). **UNIQUE COMPLEMENT:** PR #1483 (task: `CLIENT-P2-U01-R1`, squash SHA `68d41e17e124ae34c808c8b27c3983fd4aea7009`, merged `origin/main` 2026-07-21). **SUPERSEDED PR:** #1478 — **CLOSED / UNMERGED / PARTIALLY EXTRACTED.**

### 26.2 Duplicate Reconciliation Record

Aynı gün, `CLIENT-P2-U01` adı altında bağımsız bir owner-authorized görev (bu kaydın kaynağı), PR #1477'nin varlığından habersiz olarak (task-start dedup taraması o anda temiz döndü), aynı çekirdek işlevi baştan implement etti ve PR #1478 olarak açtı — gerçek bir eşzamanlı iki-oturum çakışması, süreç hatası değil. Owner GO-RECONCILE ile hunk-seviyesi sınıflandırma yapıldı: PR #1477'nin çekirdek tasarım kararları (token formatı, rate-limit guard, atomic reset, e-posta teslimatı, reset-password sayfası) **canonical** ilan edildi ve **değiştirilmeden korundu**; PR #1478'in bu alanlardaki alternatif implementasyonu **wholesale iptal edildi, hiç merge edilmedi**. Tek gerçek unique complement (D3) bulundu: `/portal/*` recovery route'larının staff-auth katmanı tarafından `/auth/login`'e yanlış yönlendirilmesi — PR #1477'nin kendi yeni `reset-password` sayfası dahil, canlı tarayıcıda doğrulanmış gerçek bir açık kalan boşluktu. Bu complement ayrı, bounded bir dala (`claude/client-p2-u01-r1`) çıkarılıp PR #1483 olarak merge edildi; `portal.service.ts`/`.controller.ts`/`.module.ts` bu reconciliation'ın hiçbir aşamasında değiştirilmedi. **PR #1478'in kendi CI'ının PASS olması canonical implementasyon olduğu anlamına GELMEZ** — merge edilmeden kapatıldı.

### 26.3 Technical Outcome

**CREDENTIAL-RECOVERY: FUNCTIONAL END TO END.** Forgot-password delivery `EmailProviderService` üzerinden wired. Reset token DB'de yalnız SHA-256 digest olarak saklanır; ham token yalnız teslimat linkinde bulunur, DB'ye asla yazılmaz. Token tüketimi atomic/tek-kullanımlıktır; replay reddedilir. Credential-recovery'ye özel, login bucket'ından bağımsız rate-limit guard uygulanır. Reset-password web sayfası mevcuttur. Public recovery route'lar staff-auth olmadan erişilebilirdir. Private portal route'lar `portal_token` korumasında kalır. Tenant/client izolasyonu gerçek Postgres'e karşı (db-gated) test edilmiştir. **SCHEMA / MIGRATION / BACKFILL: NONE** (bu kayda kadarki tüm implementasyon — çekirdek + complement — mevcut `resetToken`/`resetTokenExp` kolonlarını kullanır, hiçbir migration üretmedi).

### 26.4 Canonical Precision — Non-Equations

`PASSWORD-RESET TOKEN ≠ PORTAL SESSION` · `PASSWORD RESET ≠ EXISTING JWT REVOCATION` · `PUBLIC RECOVERY ROUTE ≠ PUBLIC PORTAL NAMESPACE` · `STAFF-AUTH DELEGATION ≠ PORTAL-AUTH REMOVAL` · `HASHED RESET TOKEN ≠ PASSWORD HASH` · `EMAIL PROVIDER ACCEPTANCE ≠ GUARANTEED FINAL DELIVERY` · `TECHNICAL IMPLEMENTATION CLOSED ≠ ALL PORTAL SECURITY GAPS CLOSED`.

### 26.5 Route-Auth Boundary

**PUBLIC PORTAL RECOVERY ROUTES:** `/portal/login`, `/portal/forgot-password`, `/portal/reset-password` — staff-auth context bu route'ları `/auth/login`'e YÖNLENDİRMEZ. **PRIVATE PORTAL ROUTES:** `portal_token` gerektirir, korumaları DEĞİŞMEDİ. `/portal/*` namespace'inin staff-auth katmanından (`AuthProvider`) portal'ın kendi auth katmanına (`PortalLayout`'un `portal_token` guard'ı) devredilmesi, **bütün portal route'larını public YAPMAZ** — yalnız staff-auth redirect-layer'ının bu namespace'te devre dışı kalmasıdır; private route koruması ayrı, bağımsız bir mekanizmadır ve değişmemiştir.

### 26.6 Phase 1 Policy Consumption

U01, aşağıdaki Phase 1 canonical sınırlarını **consume eder, değiştirmez, yeniden AÇMAZ:** POL-C (§18, non-authoritative portal process) · POL-D (§21, explicit client-facing presentation) · POL-J (§19, portal object-scope boundary) · POL-E (§24, credential/retention gap recording — bu birim POL-E'nin kaydettiği "plaintext reset-token gap" ve "portal JWT revocation gap"ından ilkini KAPATIR, ikincisini AÇIK bırakır, bkz. §26.8) · BP-05 (§20, bounded portal process) · BP-06 (§23, client-facing visibility model).

### 26.7 Gap Disposition — Closed / Implemented

**CREDENTIAL-RECOVERY DELIVERY GAP:** CLOSED/IMPLEMENTED. **PLAINTEXT RESET-TOKEN GAP (POL-E §24, R3):** CLOSED/IMPLEMENTED. **MISSING RESET-PASSWORD PAGE:** CLOSED/IMPLEMENTED. **PUBLIC RECOVERY ROUTE STAFF-AUTH REDIRECT GAP:** CLOSED/IMPLEMENTED. **CREDENTIAL-RECOVERY RATE-LIMIT GAP:** CLOSED/IMPLEMENTED. **RESET TOKEN REPLAY / TOCTOU GAP:** CLOSED/IMPLEMENTED. **TENANT / CLIENT ISOLATION EVIDENCE GAP:** CLOSED/DB-GATED (PR #1477'nin kendi testleri mocked-prisma unit seviyesindeydi; PR #1483 gerçek Postgres'e karşı tenant/client cross-account izolasyon kanıtını ekledi).

### 26.8 Gap Disposition — Open Residuals

**PORTAL JWT / SESSION REVOCATION (POL-E §24, R3):** OPEN/NOT IMPLEMENTED — `PortalAuthGuard` tamamen stateless kalır, bir şifre sıfırlama mevcut portal JWT'lerini geçersiz KILMAZ. **PORTAL ACCOUNT / LOGIN HISTORY:** OPEN. **MFA:** NOT SELECTED. **GENERAL SESSION MANAGEMENT:** U01 dışında. **PASSWORD-RESET DELIVERY BOUNCE / FİNALİTE:** U01 dışında (mail provider mesajı kabul ettiyse sonraki bounce bu birimin kapsamı dışındadır). **POL-E-R1:** NOT STARTED. Bu residual'ler U01 kapanışını BLOKE ETMEZ ve otomatik successor authority ÜRETMEZ.

### 26.9 Final Program Status

**CLIENT-P2-U01: CLOSED/CANONICAL.** **TECHNICAL CORE: PR #1477.** **TECHNICAL COMPLEMENT: PR #1483.** **PR #1478: CLOSED/UNMERGED/SUPERSEDED AND PARTIALLY EXTRACTED.** **PORTAL JWT REVOCATION: OPEN/NOT AUTHORIZED.** **PHASE 2 (genel): OPEN.** **NEXT UNIT: OWNER-GATED/NOT AUTO-STARTED.**

### 26.10 Status Precision

**CREDENTIAL-RECOVERY: FUNCTIONAL END TO END.** **RESET TOKEN: SHA-256 DIGEST ONLY.** **PUBLIC RECOVERY ROUTES: ACCESSIBLE.** **PRIVATE PORTAL ROUTES: PORTAL-AUTH PROTECTED.** **SCHEMA/MIGRATION: NONE.** **DUPLICATE IMPLEMENTATION: RESOLVED (PR #1478 CLOSED/UNMERGED).** **IMPLEMENTATION AUTHORITY: U01 ONLY / CONSUMED.**

### 26.11 U01 Self-Check

Bu bölüm: CLIENT-P2-U02'yi BAŞLATMAZ; portal JWT/session revocation implementasyonu YAPMAZ; `tokenVersion`/login-history modeli/MFA ÜRETMEZ; POL-E-R1'i BAŞLATMAZ; genel Phase 2 roadmap'i ÜRETMEZ veya YETKİLENDİRMEZ; PR #1477 veya #1478'i yeniden AÇMAZ; §5/§6/§8.A/§8.B/§11–§25 substantive hükümlerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; kod/schema/migration DEĞİŞTİRMEZ (implementasyon zaten PR #1477/#1483 ile ayrı merge edildi, bu kayıt yalnız governance closure'dır). **TECHNICAL IMPLEMENTATION CLOSED ≠ ALL PORTAL SECURITY GAPS CLOSED; IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).**

## 27. CLIENT Phase 2 U02 — Portal Session Revocation Technical Closure (OWNER RATIFIED)

Bu bölüm, §26'nın (CLIENT-P2-U01) açık bıraktığı "portal JWT revocation gap" successor candidate'ini kapatan, owner-authorized **CLIENT-P2-U02 — Portal Session Revocation / Credential-State Enforcement** biriminin teknik implementasyon kapanış kaydıdır (`decision-log.md` CLIENT-P2-U02-GOV). §5, §6, §8.A, §8.B, §11–§26 substantive hükümlerini DEĞİŞTİRMEZ; Phase 2'nin geri kalanı hâlâ **OPEN**'dır, bu kayıtla genel bir Phase 2 roadmap'i ÜRETİLMEZ.

### 27.1 Technical Lineage

**IMPLEMENTATION:** PR #1493 (task: `CLIENT-P2-U02`, squash SHA `289068f17319c58400d3ce80770f23612b50eaa3`, merged `origin/main` 2026-07-21). Tek implementasyon zinciri — mükerrer/rakip PR yok, dedup taraması hem task-start'ta hem merge öncesinde temiz döndü.

### 27.2 Selected Model

**OPTION A — `ClientPortalUser.tokenVersion`** (database-backed monotonic counter), OFFICE-AUTH-P01'in (`User.tokenVersion`) kanıtlanmış deseninin portal'a bounded uyarlaması. Owner, GO-ANALYZE'de karşılaştırılan 6 seçenekten (A: tokenVersion · B: credentialsChangedAt/iat cutoff · C: server-side session table · D: revocation denylist/cache · E: short-lived-access+refresh-token · F: hold/browser-only-logout) Option A'yı **SEÇTİ**; C/D/E owner'ın kendi STOP CONDITION/yasak listesiyle bounded scope dışında bırakıldı.

### 27.3 Login / Guard / Revocation-Trigger Contract

**LOGIN:** `PortalService.login()` JWT payload'ına DB'deki güncel `tokenVersion`'ı claim olarak ekler (`{sub,clientId,tenantId,type,tokenVersion}`). **GUARD:** `PortalAuthGuard`, imza+type doğrulamasından SONRA `clientPortalUser` PK lookup yapar (SIGNATURE+TYPE → DATABASE USER LOOKUP → ACTIVE-STATE CHECK → CLIENT/TENANT CLAIM CHECK → VERSION CHECK); §26.8'de kaydedilen önceki AS-IS tamamen-stateless guard davranışı **SONA ERDİ.** **REVOCATION TRIGGERS (4, hepsi kendi AYNI atomic write'ı içinde `tokenVersion:{increment:1}`):** password reset success (`resetPassword`) · password change success (`changePassword`) · account disable (`disablePortalUser`, `isActive:false` ile AYNI update) · account reactivate (`createPortalUser` reactivate dalı, yeni password/`isActive:true` ile AYNI update). Başarısız reset/password-change version ARTIRMAZ.

### 27.4 Legacy JWT Cutover

**MISSING tokenVersion CLAIM:** yalnız claim HİÇ YOKSA 0 kabul edilir (deploy-öncesi token'lar için backward-compat). **KABUL KOŞULU:** DB `tokenVersion==0` olduğu SÜRECE. **GEÇERSİZ TİP/NEGATİF/NON-INTEGER CLAIM:** DENY (0'a normalize edilmez, doğrudan reddedilir). **DEPLOY ANINDA ZORLA TOPLU LOGOUT: YOK** — ilk credential-state değişikliğinden (reset/change/disable/reactivate) SONRA eski/claim'siz token reddedilir. **CUTOVER: ZERO-IMMEDIATE-DISRUPTION** (OFFICE-AUTH-P01'in kendi kanıtlanmış cutover davranışıyla birebir).

### 27.5 Fail-Closed Contract

`PORTAL USER NOT FOUND` · `PORTAL USER DISABLED` · `CLIENT CLAIM MISMATCH` · `TENANT CLAIM MISMATCH` · `STALE / FUTURE VERSION` · `INVALID VERSION TYPE` · `DATABASE LOOKUP FAILURE` — hepsi **DENY**, hepsi AYNI genel `UnauthorizedException` mesajına düşer (ret nedeni response'ta AYRIŞTIRILMAZ). Ham JWT, parola, password hash, reset token, token digest veya signing secret hiçbir audit/log kaydına YAZILMAZ.

### 27.6 Canonical Precision — Non-Equations

`MISSING VERSION COMPATIBILITY ≠ PERMANENT VERSION BYPASS` · `VALID SIGNATURE ≠ CURRENT CREDENTIAL STATE` · `VALID PORTAL JWT ≠ CLIENT BUSINESS AUTHORITY` · `VALID PORTAL SESSION ≠ FACT A` · `PASSWORD RESET ≠ AUTHENTICATED CLIENT INSTRUCTION` (POL-C, §18, DEĞİŞMEDİ).

### 27.7 OFFICE Precedent Boundary

**OFFICE `User.tokenVersion`:** REFERENCE PRECEDENT ONLY. **PORTAL `ClientPortalUser.tokenVersion`:** SEPARATE, INDEPENDENT CLIENT IMPLEMENTATION — ayrı model, ayrı guard, ayrı migration. **OFFICE User modeli, staff JWT pipeline'ı, staff authentication authority'si BU KAYITLA DEĞİŞMEDİ.** Aynı teknik örüntünün (monotonic version counter) iki farklı bounded-context'te bağımsız kullanılması, authentication authority birleşmesi veya bounded-context birleşmesi ANLAMINA GELMEZ. (Ayrıca bkz. `OFFICE-DELIVERY-MANIFEST.md` CANDIDATE-B — OFFICE'in kendi ayrı, DEFERRED, refresh-token içeren staff-side session-revocation adayı; CLIENT-P2-U02 bu adayı KAPATMAZ, ONUNLA İLGİLİ DEĞİLDİR.)

### 27.8 Phase 1 / U01 Policy Consumption

U02, aşağıdaki canonical sınırları **consume eder, değiştirmez, yeniden AÇMAZ:** POL-C (§18, portal non-authoritative — password reset authenticated client instruction'a DÖNÜŞMEDİ) · POL-J (§19, object access boundary) · BP-05 (§20, bounded portal process) · BP-06 (§23, visibility boundary) · POL-E (§24, evidence-preserving baseline) · CLIENT-P2-U01 (§26, credential-recovery core ve public/private route boundary — route sınırı DEĞİŞMEDİ, staff/Office authentication modeli DEĞİŞMEDİ).

### 27.9 Migration Precision

**ALTERED MODEL:** `ClientPortalUser` YALNIZ. **ADDED FIELD:** `tokenVersion Int @default(0)` (additive, NOT NULL DEFAULT 0). **DROP/RENAME/DATA UPDATE/FK CHANGE/UNRELATED INDEX-CONSTRAINT CHANGE: NONE. BACKFILL SCRIPT: NONE** (mevcut satırlar migration'ın kendi `DEFAULT 0`'ı ile otomatik dolar). Implementasyon sırasında görülen, bu migration'la İLGİSİZ, önceden var olan RC-COL kaynaklı bir FK-rename schema-drift'i (`BankSettlementEvidence`/`BankTransaction`) tespit edilip **U02 migration'ına dahil EDİLMEDİ** — bu drift'in kendisi ayrı, RC-COL'a ait, bu kayıtla açılmayan bir gözlemdir.

### 27.10 Gap Disposition — Closed / Implemented

**PORTAL JWT / SESSION REVOCATION (POL-E §24 / §26.8'in "portal JWT revocation gap" kaleminin successor'ı): CLOSED/IMPLEMENTED.** Post-password-reset old JWT continuation · post-password-change old JWT continuation · disabled-account existing-JWT continuation · reactivated-account pre-disable-JWT revival · portal JWT database-state validation gap · tenant/client claim revalidation gap — **hepsi CLOSED/IMPLEMENTED.**

### 27.11 Gap Disposition — Open Residuals

**PER-DEVICE SESSION MANAGEMENT: OPEN/NOT SELECTED. SERVER-SIDE SESSION TABLE / REFRESH-TOKEN ARCHITECTURE / REMOTE SINGLE-SESSION LOGOUT / ADMIN FORCE-LOGOUT ENDPOINT: NOT IMPLEMENTED. LOGIN HISTORY: OPEN. MFA / TWO-FACTOR ACTIVATION: NOT SELECTED. SECURITY-INCIDENT SESSION CONSOLE: NOT IMPLEMENTED.** Bu residual'ler U02 kapanışını BLOKE ETMEZ, otomatik CLIENT-P2-U03 authority ÜRETMEZ.

### 27.12 Final Program Status

**CLIENT-P2-U02: TECHNICAL + GOVERNANCE CLOSED/CANONICAL.** **PR #1493, squash `289068f1`.** **MODEL: `ClientPortalUser.tokenVersion`.** **CREDENTIAL-STATE REVOCATION: ENFORCED.** **PHASE 2 (genel): OPEN.** **NEXT UNIT: OWNER-GATED/NOT AUTO-STARTED.**

### 27.13 U02 Self-Check

Bu bölüm: CLIENT-P2-U03'ü BAŞLATMAZ; session table/refresh-token/JTI-denylist/remote-single-session-logout/login-history/admin-force-logout/MFA implementasyonu YAPMAZ; POL-E-R1'i BAŞLATMAZ; genel Phase 2 roadmap'i ÜRETMEZ veya YETKİLENDİRMEZ; OFFICE/staff authentication modelini veya CANDIDATE-B'yi DEĞİŞTİRMEZ; PR #1493'ü yeniden AÇMAZ; §5/§6/§8.A/§8.B/§11–§26 substantive hükümlerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; kod/schema/migration DEĞİŞTİRMEZ (implementasyon zaten PR #1493 ile ayrı merge edildi, bu kayıt yalnız governance closure'dır). **TECHNICAL IMPLEMENTATION CLOSED ≠ ALL PORTAL SESSION-MANAGEMENT CAPABILITY CLOSED; IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).**

## 28. CLIENT Phase 2 U03-I01 — Case Detail Field-Visibility Technical Closure (OWNER RATIFIED)

Bu bölüm, POL-D (§21) / BP-06 (§23) politikalarının `getCaseDetail()` yüzeyindeki ilk somut enforcement diliminin (`CLIENT-P2-U03-I01`) teknik kapanış kaydıdır (`decision-log.md` CLIENT-P2-U03-I01-GOV). §5, §6, §8.A, §8.B, §11–§27 substantive hükümlerini DEĞİŞTİRMEZ. **CLIENT-P2-U03 (genel POL-D/BP-06 enforcement programı) BU KAYITLA CLOSED İLAN EDİLMEZ — yalnız case-detail dilimi kapanır, documents/messages/PoA/notifications yüzeyleri OPEN kalır.**

### 28.1 Technical Lineage

**IMPLEMENTATION:** PR #1499 (task: `CLIENT-P2-U03-I01`, squash SHA `ad6a3fdfb539bf634e080a7063bb4f69ceafe7f8`, merged `origin/main` 2026-07-21). Bu birim, `CLIENT-P2-U03-ANALYZE`'ın (GO-ANALYZE-only, önceki tur) getCaseDetail() için tespit ettiği somut POL-D/BP-06 delta'sının bounded implementasyonudur; `CLIENT-P2-NEXT-UNIT-SELECTION-01`'in H2 (field-visibility) hipotezinin ilk dilimidir.

### 28.2 Selected Enforcement Model

**OPTION A — PRISMA-LEVEL EXPLICIT NESTED SELECT.** `PortalService.getCaseDetail()`'daki select'siz `include`, `Case`/`CaseDebtor`/`Collection`/`Due` seviyelerinde açık, nested bir `select` (`CASE_DETAIL_SELECT`, tek dosyada, yalnız bu yüzeye özgü) ile değiştirildi. Yeni web-shared response-type katmanı, DTO sınıfı veya global serializer/interceptor **ÜRETİLMEDİ** — mevcut kod-tabanı deseniyle (`getClientCases`'in kendi curated select'i) tutarlı, en dar müdahale.

### 28.3 Approved Response Contract

**Case top-level:** `id, fileNumber, executionFileNumber, type, caseStatus, workflowStage, caseDate, principalAmount`. **Debtor:** `debtors[].debtor.{name,type}` (CaseDebtor'un kendi `id`'si dahil hiçbir başka alanı YOK — web tarafı React key için array index kullanır). **Collection:** `collections[].{id,date,type,amount}`. **Due:** `dues[].{id,type,amount,dueDate,currency}`.

### 28.4 Explicitly Omitted Field Families

`Case.dahiliNot` (şemanın kendi yorumu: "Müvekkile gitmez") · `Case.muvekkilNotu` (owner-decision-required, implementasyona dahil edilmedi) · staff/personel referansları (`sorumluPersonelId`/`responsibleLawyerId`/`responsibleStaffId`/`createdById`) · otomasyon/risk/OCR alanları (`automationConfig`/`isAutoMode`/`riskScore`/`ocrText`/`detectionKeywords` vd.) · `Case.metadata` · `Case.showToClient` (erişim-gate bayrağının kendisi) · `CaseDebtor`'un quick-note/passivation/tebligat-takip alanları · `Collection.idempotencyKey` · `Collection.description` · `Due.description` · `Due.finalizationNote` + vergi alanları (`hasKdv`/`kdvRate`/`hasBsmv`/`hasKkdf`) · lookup-relation ID'leri. Hepsi **UNKNOWN/UNCLASSIFIED veya INTERNAL-ONLY → varsayılan OMIT** ilkesiyle dışarıda; owner sınıflandırması gelmeden implementasyona dahil EDİLMEDİ.

### 28.5 Raw Lifecycle Disposition

**RAW `CaseLifecycle` (lifecycleEvents): TAMAMEN KALDIRILDI** — BP-06 §23.6'nın açıkça yasakladığı "internal audit trail" kategorisi. Web sayfasındaki raw "İşlem Geçmişi" bölümü kaldırıldı; yerine yeni bir timeline/event-mapping/derived presentation **ÜRETİLMEDİ**. **RAW LIFECYCLE REMOVED ≠ FUTURE CURATED CLIENT TIMELINE PROHIBITED** — ileride ayrı, açık bir contract ile curated bir timeline sunulması bu kayıtla ne yetkilendirilir ne de yasaklanır.

### 28.6 Non-Equations / Precision

`SAME-CLIENT FIELD EXPOSURE ≠ CROSS-TENANT INCIDENT` · `FIELD VISIBILITY ≠ OBJECT AUTHORIZATION` · `VALID OBJECT ACCESS ≠ ALL ENTITY FIELDS CLIENT-SAFE` · `RAW LIFECYCLE REMOVED ≠ FUTURE CURATED CLIENT TIMELINE PROHIBITED` · `TECHNICAL I01 CLOSED ≠ CLIENT-P2-U03 FULLY CLOSED` · `TYPE-SAFE WEB INTERFACE ≠ SECURITY BOUNDARY` · `EXPLICIT BACKEND SELECT = FAIL-CLOSED FIELD PROJECTION`. **Doğru ifade: "CLIENT-FACING BROAD RESPONSE / INTERNAL-FIELD EXPOSURE CONTAINED"** — "cross-tenant vulnerability fixed" iddiası bu kayıtla KURULMAZ (bulgu her zaman same-client'tı, §21.10/BP-06 ile tutarlı).

### 28.7 Open Residual Surfaces

**DOCUMENT FIELD VISIBILITY: OPEN/NOT STARTED** (`getDocuments` — `filePath`/`reviewedBy`/`reviewNote` mixed-purpose). **MESSAGE FIELD VISIBILITY: OPEN/NOT STARTED** (`getMessages` — `senderId` staff-identity). **POA FIELD VISIBILITY: OPEN/NOT STARTED** (`getClientPoas` — `filePath`/`fileSize`/`mimeType`, hiç consumer'ı yok). **NOTIFICATION FAIL-CLOSED PROJECTION: OPEN/NOT STARTED** (`getNotifications` — bugün select'siz ama model'de internal alan yok; mekanizma fail-closed DEĞİL). **OWNER-DECISION-REQUIRED CASE FIELDS: OPEN** (`muvekkilNotu`, CaseDebtor debtor-adjacent alanlar, Due vergi alanları — `CLIENT-P2-U03-ANALYZE`'ın madde 8'i). **CURATED CLIENT TIMELINE: NOT SELECTED. `CLIENT-P2-U03-I02`: NOT AUTHORIZED.** Object-scope (`STF-PRD-BOLA-001`/`STF-PRD-SCP-001`/OFF/OD-08/CAP-02) ve OFFICE authority'si bu kayıtla **DEĞİŞMEDİ**.

### 28.8 Final Unit Status

**CLIENT-P2-U03-I01: TECHNICAL + GOVERNANCE CLOSED/CANONICAL.** **CLIENT-P2-U03 (genel): PARTIAL — I01 ONLY.** **PR #1499, squash `ad6a3fdf`.** **SCHEMA/MIGRATION: NONE. OBJECT-SCOPE: UNCHANGED. FINANCIAL AUTHORITY: UNCHANGED.** **NEXT UNIT: OWNER-GATED/NOT AUTO-STARTED.**

### 28.9 U03-I01 Self-Check

Bu bölüm: `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ; POL-D/BP-06 enforcement'ının TAMAMLANDIĞINI iddia ETMEZ; `CLIENT-P2-U03-I02`'yi BAŞLATMAZ; documents/messages/PoA/notifications yüzeylerine dokunmaz veya bunları CLOSED İLAN ETMEZ; curated client timeline SEÇMEZ veya YETKİLENDİRMEZ; POL-J'yi yeniden AÇMAZ; OFFICE CAP-02/OFF-OD-08/STF-PRD-BOLA-001/SCP-001 statülerini DEĞİŞTİRMEZ; session/MFA/finansal-model/POL-E-R1 işini BAŞLATMAZ; genel Phase 2 roadmap'i ÜRETMEZ; §5/§6/§8.A/§8.B/§11–§27 substantive hükümlerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; kod/schema/migration DEĞİŞTİRMEZ (implementasyon zaten PR #1499 ile ayrı merge edildi, bu kayıt yalnız governance closure'dır). **TECHNICAL IMPLEMENTATION CLOSED ≠ ALL FIELD-VISIBILITY SURFACES CLOSED; IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).**

## 29. CLIENT Phase 2 U03-I02 — Portal Document Field-Visibility Technical Closure (OWNER RATIFIED)

Bu bölüm, POL-D (§21) / BP-06 (§23) politikalarının portal document yüzeyindeki enforcement diliminin (`CLIENT-P2-U03-I02`) teknik kapanış kaydıdır (`decision-log.md` CLIENT-P2-U03-I02-GOV). §5, §6, §8.A, §8.B, §11–§28 substantive hükümlerini DEĞİŞTİRMEZ. §28.7'nin "`CLIENT-P2-U03-I02`: NOT AUTHORIZED" ifadesi bu kayıtla owner tarafından ayrıca yetkilendirilip kapatılmıştır — §28'in kendi metni DEĞİŞTİRİLMEMİŞTİR. **CLIENT-P2-U03 (genel POL-D/BP-06 enforcement programı) BU KAYITLA CLOSED İLAN EDİLMEZ — yalnız case-detail (I01) + document (I02) dilimleri kapanır, messages/PoA/notifications yüzeyleri OPEN kalır.**

### 29.1 Technical Lineage

**IMPLEMENTATION:** PR #1506 (task: `CLIENT-P2-U03-I02`, squash SHA `0becb12afb33584b71f05d4902ef6cd733e0e57e`, merged `origin/main` 2026-07-21). Bu birim, §28.7'nin (`CLIENT-P2-U03-I01`) açık bıraktığı "DOCUMENT FIELD VISIBILITY: OPEN/NOT STARTED" bulgusunun bounded implementasyonudur; `getDocuments()` (liste) ve `uploadDocument()` (yükleme response'u) aynı slice altında ele alınmıştır — aynı kaynak model, aynı client sayfası, aynı response contract, aynı field-exposure kök nedeni.

### 29.2 Selected Enforcement Model

**PRISMA-LEVEL EXPLICIT SELECT — §28.2 ile aynı desen.** `PortalService.getDocuments()`'ın select'siz `findMany()`'ı ve `uploadDocument()`'ın select'siz `create()`'i, ortak, tek bir typed sabit (`PORTAL_DOCUMENT_CLIENT_SELECT`) ile değiştirildi. Yeni DTO sınıfı, class-transformer, global interceptor veya web-shared response-type katmanı **ÜRETİLMEDİ**. Upload'ın write-contract'ı (`filePath` dahil DB'ye yazılan alanlar) DEĞİŞMEDİ — yalnız `create()`'in döndürdüğü response daraltıldı.

### 29.3 Approved Client Response Contract

Hem liste hem upload response'unda yalnız: `id, type, title, description, fileName, fileSize, mimeType, status, createdAt`.

### 29.4 Explicitly Omitted Field Families

`filePath` (internal-only server storage location) · `reviewedBy` (internal staff user identifier) · `reviewedAt` (client presentation için seçilmedi) · `reviewNote` (mixed-purpose internal review text — REJECTED status'un kendisi client'a döner, ancak raw internal review metni DEĞİL) · `clientId`/`tenantId` (authorization context, presentation data DEĞİL) · `caseId` (bu dilimde authorize edilmedi) · `updatedAt` (mevcut client presentation için gerekmiyor). Hepsi **UNKNOWN/UNCLASSIFIED veya INTERNAL-ONLY → varsayılan OMIT** ilkesiyle dışarıda.

### 29.5 Internal/Admin Boundary Preservation

`getPendingDocuments()`/`reviewDocument()` (staff/admin yüzeyi) **DEĞİŞMEDİ** — `reviewedBy`/`reviewedAt`/`reviewNote`/`filePath` veritabanında ve staff workflow'unda **KORUNUR**, hiçbiri silinmedi. `getDocument()` (internal download helper) ve `deleteDocument()` (internal file-deletion helper) kendi raw, select'siz `doc` erişimlerini korur; `filePath` bu iki metotta hâlâ internal olarak kullanılır (dosya sistemi okuma/silme için) ve **hiçbir zaman client JSON response'una dönmez** — `deleteDocument()`'ın controller'a döndürdüğü `filePath` zaten yalnız internal `unlinkSync` çağrısı için kullanılıyordu, controller client'a yalnız `{success:true}` döndürüyordu (bu davranış I02 öncesinde de böyleydi, I02 bunu DEĞİŞTİRMEDİ). **CLIENT FIELD OMISSION ≠ DATABASE FIELD REMOVAL. CLIENT FIELD OMISSION ≠ ADMIN WORKFLOW REMOVAL.**

### 29.6 Non-Equations / Precision

`SAME-CLIENT FIELD EXPOSURE ≠ CROSS-TENANT INCIDENT` · `FIELD VISIBILITY ≠ OBJECT AUTHORIZATION` · `DOCUMENT RESPONSE PROJECTION ≠ DOCUMENT ACCESS MODEL REDESIGN` · `FILE PATH OMITTED ≠ FILE STORAGE ARCHITECTURE SECURED` · `RAW REVIEW NOTE OMITTED ≠ CLIENT-SAFE REJECTION-REASON CONTRACT CREATED` · `TECHNICAL I02 CLOSED ≠ CLIENT-P2-U03 FULLY CLOSED` · `TYPE-SAFE INTERFACE ≠ SECURITY BOUNDARY` · `EXPLICIT BACKEND SELECT = FAIL-CLOSED FIELD PROJECTION`. **Doğru ifade: "PORTAL DOCUMENT BROAD RESPONSE / INTERNAL DOCUMENT-METADATA EXPOSURE CONTAINED"** — "cross-tenant vulnerability fixed" iddiası bu kayıtla KURULMAZ.

### 29.7 Open Residual Surfaces

**MESSAGE FIELD VISIBILITY: OPEN/NOT STARTED** (`getMessages` — `senderId` staff-identity). **POA FIELD VISIBILITY: OPEN/NOT STARTED** (`getClientPoas` — `filePath`/`fileSize`/`mimeType`, hiç consumer'ı yok). **NOTIFICATION FAIL-CLOSED PROJECTION: OPEN/NOT STARTED** (`getNotifications` — bugün select'siz ama model'de internal alan yok; mekanizma fail-closed DEĞİL). **CLIENT-SAFE DOCUMENT REJECTION-REASON CONTRACT: NOT SELECTED** — mevcut ret notification mesajı bu kayıtla yeniden tasarlanmadı. **`CLIENT-P2-U03-I03`: NOT AUTHORIZED.** **CASE DETAIL FIELD VISIBILITY (I01): CLOSED/CANONICAL, bu kayıtla DEĞİŞMEDİ.** Object-scope (`STF-PRD-BOLA-001`/`STF-PRD-SCP-001`/OFF/OD-08/CAP-02) ve OFFICE authority'si bu kayıtla **DEĞİŞMEDİ**.

### 29.8 Final Unit Status

**CLIENT-P2-U03-I02: TECHNICAL + GOVERNANCE CLOSED/CANONICAL.** **CLIENT-P2-U03 (genel): PARTIAL — I01 + I02 ONLY.** **PR #1506, squash `0becb12a`.** **SCHEMA/MIGRATION: NONE. OBJECT-SCOPE: UNCHANGED. FINANCIAL AUTHORITY: UNCHANGED. ADMIN WORKFLOW: UNCHANGED. FILE STORAGE: UNCHANGED.** **NEXT UNIT: OWNER-GATED/NOT AUTO-STARTED.**

### 29.9 U03-I02 Self-Check

Bu bölüm: `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ; POL-D/BP-06 enforcement'ının TAMAMLANDIĞINI iddia ETMEZ; `CLIENT-P2-U03-I03`'ü BAŞLATMAZ; messages/PoA/notifications yüzeylerine dokunmaz veya bunları CLOSED İLAN ETMEZ; client-safe rejection-reason contract SEÇMEZ veya YETKİLENDİRMEZ; POL-J'yi yeniden AÇMAZ; OFFICE CAP-02/OFF-OD-08/STF-PRD-BOLA-001/SCP-001 statülerini DEĞİŞTİRMEZ; M4 live migration veya OF01 migration gate'ine dokunmaz (ayrı, operasyonel bir bulgudur, bu CLIENT docs-only kayıtla canonicalize EDİLMEZ); session/MFA/finansal-model/POL-E-R1 işini BAŞLATMAZ; genel Phase 2 roadmap'i ÜRETMEZ; §5/§6/§8.A/§8.B/§11–§28 substantive hükümlerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; kod/schema/migration/test/CI DEĞİŞTİRMEZ (implementasyon zaten PR #1506 ile ayrı merge edildi, bu kayıt yalnız governance closure'dır). **TECHNICAL IMPLEMENTATION CLOSED ≠ ALL FIELD-VISIBILITY SURFACES CLOSED; IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).**

## 30. CLIENT Phase 2 U03-I03 — Portal Message Field-Visibility Technical Closure (OWNER RATIFIED)

Bu bölüm, POL-D (§21) / BP-06 (§23) politikalarının portal message yüzeyindeki enforcement diliminin (`CLIENT-P2-U03-I03`) teknik kapanış kaydıdır (`decision-log.md` CLIENT-P2-U03-I03-GOV). §5, §6, §8.A, §8.B, §11–§29 substantive hükümlerini DEĞİŞTİRMEZ. §29.7'nin "`CLIENT-P2-U03-I03`: NOT AUTHORIZED" ifadesi bu kayıtla owner tarafından ayrıca yetkilendirilip kapatılmıştır — §29'un kendi metni DEĞİŞTİRİLMEMİŞTİR. **CLIENT-P2-U03 (genel POL-D/BP-06 enforcement programı) BU KAYITLA CLOSED İLAN EDİLMEZ — yalnız case-detail (I01) + document (I02) + message (I03) dilimleri kapanır, PoA/notifications yüzeyleri OPEN kalır.**

### 30.1 Technical Lineage

**IMPLEMENTATION:** PR #1524 (task: `CLIENT-P2-U03-I03`, squash SHA `802f5d75dfbc3dc498d4fda50a4de290c6b38c28`, merged `origin/main` 2026-07-22). Bu birim, §29.7'nin (`CLIENT-P2-U03-I02`) açık bıraktığı "MESSAGE FIELD VISIBILITY: OPEN/NOT STARTED" bulgusunun bounded implementasyonudur; `getMessages()` (liste) ve `sendMessageFromClient()` (client-send response'u) aynı slice altında ele alınmıştır — aynı kaynak model, aynı client sayfası, aynı response contract, aynı field-exposure kök nedeni.

### 30.2 Selected Enforcement Model

**PRISMA-LEVEL EXPLICIT SELECT — §28.2/§29.2 ile aynı desen.** `PortalService.getMessages()`'ın select'siz `findMany()`'ı ve `sendMessageFromClient()`'ın select'siz `create()`'i, ortak, tek bir typed sabit (`PORTAL_MESSAGE_CLIENT_SELECT`) ile değiştirildi. Yeni DTO sınıfı, class-transformer, global interceptor veya web-shared response-type katmanı **ÜRETİLMEDİ**. Mesaj write-contract'ı (`senderId: clientId` dahil) DEĞİŞMEDİ — yalnız `create()`/`findMany()`'ın döndürdüğü response daraltıldı. Web production sayfası (`portal/messages`) zaten yalnız onaylı 6 alanı tüketiyordu; production kodda değişiklik gerekmedi, yalnız focused test eklendi.

### 30.3 Approved Client Response Contract

Hem liste hem client-send response'unda yalnız: `id, content, senderType, senderName, isRead, createdAt`.

### 30.4 Explicitly Omitted Field Families

`senderId` (internal technical actor identifier — OFFICE mesajlarında staff `User.id`, CLIENT mesajlarında clientId) · `clientId`/`tenantId` (authorization context, presentation data DEĞİL) · `caseId` (bu dilimde client response'ta authorize edilmedi) · `readAt` (mevcut client presentation için gerekmiyor). Hepsi **UNKNOWN/UNCLASSIFIED veya INTERNAL-ONLY → varsayılan OMIT** ilkesiyle dışarıda. **`senderName` CLIENT-SAFE ≠ `senderId` CLIENT-SAFE.**

### 30.5 Message Write and Admin Boundary Preservation

`sendMessageFromClient()`'ın write-contract'ı (`senderId: clientId` dahil) **DEĞİŞMEDİ** — actor/representation modeli bu kayıtla yeniden AÇILMADI. `sendMessageFromOffice()`/`getClientMessages()`/`getClientsWithMessages()`/`getUnreadMessageCount()`/`markMessagesAsRead()` (staff/admin yüzeyi) **DEĞİŞMEDİ** — kendi raw, select'siz erişimlerini korur; OFFICE-originated mesajlar client listesinde görünmeye devam eder (content/senderType=OFFICE/senderName/isRead/createdAt ile), yalnız `senderId` (staff `User.id`) artık client response'una hiç dönmez. **CLIENT FIELD OMISSION ≠ DATABASE FIELD REMOVAL. CLIENT FIELD OMISSION ≠ ADMIN RESPONSE CHANGE. CLIENT FIELD OMISSION ≠ MESSAGE ACTOR MODEL CHANGE.**

### 30.6 Non-Equations / Precision

`SAME-CLIENT FIELD EXPOSURE ≠ CROSS-TENANT INCIDENT` · `FIELD VISIBILITY ≠ OBJECT AUTHORIZATION` · `MESSAGE RESPONSE PROJECTION ≠ MESSAGE ACCESS MODEL REDESIGN` · `STAFF senderId OMITTED ≠ STAFF IDENTITY MODEL REDESIGNED` · `MESSAGE WRITE SEMANTICS PRESERVED ≠ ACTOR MODEL APPROVED` · `TECHNICAL I03 CLOSED ≠ CLIENT-P2-U03 FULLY CLOSED` · `EXPLICIT BACKEND SELECT = FAIL-CLOSED FIELD PROJECTION`. **Doğru ifade: "PORTAL MESSAGE BROAD RESPONSE / INTERNAL SENDER-IDENTIFIER EXPOSURE CONTAINED"** — "cross-tenant vulnerability fixed" veya "message authorization redesigned" iddiaları bu kayıtla KURULMAZ.

### 30.7 Open Residual Surfaces

**POA FIELD VISIBILITY: OPEN/NOT STARTED** (`getClientPoas` — `filePath`/`fileSize`/`mimeType`, hiç consumer'ı yok). **NOTIFICATION FAIL-CLOSED PROJECTION: OPEN/NOT STARTED** (`getNotifications` — bugün select'siz ama model'de internal alan yok; mekanizma fail-closed DEĞİL). **`CLIENT-P2-U03-I04`: NOT AUTHORIZED.** Message retention, message encryption, message actor/representation model, client-safe case-link presentation ve admin message field visibility bu kayıtla ÇÖZÜLMÜŞ SAYILMAZ. **CASE DETAIL (I01) + DOCUMENT (I02) FIELD VISIBILITY: CLOSED/CANONICAL, bu kayıtla DEĞİŞMEDİ.** Object-scope (`STF-PRD-BOLA-001`/`STF-PRD-SCP-001`/OFF/OD-08/CAP-02) ve OFFICE authority'si bu kayıtla **DEĞİŞMEDİ**.

### 30.8 Final Unit Status

**CLIENT-P2-U03-I03: TECHNICAL + GOVERNANCE CLOSED/CANONICAL.** **CLIENT-P2-U03 (genel): PARTIAL — I01 + I02 + I03 ONLY.** **PR #1524, squash `802f5d75`.** **SCHEMA/MIGRATION: NONE. OBJECT-SCOPE: UNCHANGED. FINANCIAL AUTHORITY: UNCHANGED. MESSAGE WRITE SEMANTICS: UNCHANGED. ADMIN MESSAGE SURFACES: UNCHANGED.** **NEXT UNIT: OWNER-GATED/NOT AUTO-STARTED.**

### 30.9 U03-I03 Self-Check

Bu bölüm: `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ; POL-D/BP-06 enforcement'ının TAMAMLANDIĞINI iddia ETMEZ; `CLIENT-P2-U03-I04`'ü BAŞLATMAZ; PoA/notifications yüzeylerine dokunmaz veya bunları CLOSED İLAN ETMEZ; message actor/representation modelini yeniden AÇMAZ; POL-J'yi yeniden AÇMAZ; OFFICE CAP-02/OFF-OD-08/STF-PRD-BOLA-001/SCP-001 statülerini DEĞİŞTİRMEZ; M4 live migration veya OF01 migration gate'ine dokunmaz; session/MFA/finansal-model/POL-E-R1 işini BAŞLATMAZ; genel Phase 2 roadmap'i ÜRETMEZ; §5/§6/§8.A/§8.B/§11–§29 substantive hükümlerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; kod/schema/migration/test/CI DEĞİŞTİRMEZ (implementasyon zaten PR #1524 ile ayrı merge edildi, bu kayıt yalnız governance closure'dır). **TECHNICAL IMPLEMENTATION CLOSED ≠ ALL FIELD-VISIBILITY SURFACES CLOSED; IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).**

## 31. CLIENT Phase 2 U03-I04 — Portal PoA Field-Visibility Technical Closure (OWNER RATIFIED)

Bu bölüm, POL-D (§21) / BP-06 (§23) politikalarının portal PoA yüzeyindeki enforcement diliminin (`CLIENT-P2-U03-I04`) teknik kapanış kaydıdır (`decision-log.md` CLIENT-P2-U03-I04-GOV). §5, §6, §8.A, §8.B, §11–§30 substantive hükümlerini DEĞİŞTİRMEZ. §30.7'nin "`CLIENT-P2-U03-I04`: NOT AUTHORIZED" ifadesi bu kayıtla owner tarafından ayrıca yetkilendirilip kapatılmıştır — §30'un kendi metni DEĞİŞTİRİLMEMİŞTİR. **CLIENT-P2-U03 (genel POL-D/BP-06 enforcement programı) BU KAYITLA CLOSED İLAN EDİLMEZ — yalnız case-detail (I01) + document (I02) + message (I03) + PoA (I04) dilimleri kapanır, notifications yüzeyi OPEN kalır.**

### 31.1 Technical Lineage

**IMPLEMENTATION:** PR #1529 (task: `CLIENT-P2-U03-I04`, squash SHA `e7f1894cf3c11c67ac28b8c984329f9080b7a61b`, merged `origin/main` 2026-07-22). Bu birim, §30.7'nin (`CLIENT-P2-U03-I03`) açık bıraktığı "POA FIELD VISIBILITY: OPEN/NOT STARTED" bulgusunun bounded implementasyonudur; `getClientPoas()`'ın top-level raw `include`'ını hedef alır. **Consumer FOUND:** `apps/web/src/app/portal/poas/page.tsx` gerçekten `/api/portal/poas`'ı çağırır, `portal/layout.tsx`'te navigasyon linki mevcuttur.

### 31.2 Selected Enforcement Model

**PRISMA-LEVEL EXPLICIT SELECT — §28.2/§29.2/§30.2 ile aynı desen.** `PortalService.getClientPoas()`'ın top-level raw `include`'ı, tek bir typed sabit (`PORTAL_POA_CLIENT_SELECT`) ile değiştirildi. Yeni DTO sınıfı, class-transformer veya global interceptor **ÜRETİLMEDİ**. Web production sayfası (`portal/poas`) zaten yalnız approved alanları tüketiyordu; production kodda değişiklik gerekmedi, yalnız focused test eklendi.

**Brief'ten kasıtlı sapma (gerçek consumer + şemaya göre doğrulandı):** Owner talimatının taslak alan listesi (`isActive`/`scope`/`createdAt`) gerçek koda uymuyordu ve KULLANILMADI — `isActive` şemada var ama sayfa hiç kullanmıyor (WHERE zaten `isActive:true` dayattığından response'ta hep sabit `true` olurdu, bilgi taşımaz); `scope` şemanın kendi yorumuyla `@deprecated - scopeDescription kullan`; `createdAt` sayfa tarafından hiç tüketilmiyor. Buna karşılık owner talimatının taslağında YER ALMAYAN ama sayfanın OLMADAN render edilemediği `status`, `isLimited`, `journalNo`, `notaryName`, `notaryCity` alanları contract'a DAHIL EDİLDİ. Bu sapma PR #1529 açıklamasında gerekçeli olarak belgelenmiştir.

### 31.3 Approved Client Response Contract

**Top-level:** `id, notaryName, notaryCity, journalNo, poaNumber, dateIssued, isLimited, validUntil, status, canCollect, canWaive, canSettle, canRelease`. **Nested:** `lawyers[].lawyer.{name, surname, barNumber}` — `barNumber` sayfa tarafından görsel render edilmiyor ama mevcut kodda zaten curated seçiliydi, korundu (I03'teki `isRead` emsaliyle aynı gerekçe).

### 31.4 Explicitly Omitted Field Families

`clientId` (authorization context) · `filePath` (internal-only server storage location) · `fileSize`/`mimeType` (download contract'ı seçilmediği sürece client presentation'a girmez) · `scopeType`/`scopeDescription` (sayfa tarafından tüketilmiyor) · `isActive` (WHERE'de zaten sabit true, presentation'a gerek yok) · `createdAt`/`updatedAt` (sayfa tüketmiyor) · deprecated `poaDate` · join-metadata (`PoaLawyer.id`/`poaId`/`lawyerId`/`isPrimary`/`createdAt`). Hepsi **UNKNOWN/UNCLASSIFIED veya INTERNAL-ONLY → varsayılan OMIT** ilkesiyle dışarıda.

### 31.5 PoA Business Logic and Admin Boundary Preservation

`poa.service.ts` (staff/admin PoA yüzeyi), PoA lifecycle/expiry/delivery mekanizmaları **DEĞİŞMEDİ** — dokunulmadı. Object/tenant authorization modeli **DEĞİŞMEDİ**: `ClientPowerOfAttorney` modelinde `tenantId` alanı hiç yoktur; mevcut `clientId` + `Client` ilişkisi üzerinden auth modeli sessizce değiştirilmedi. **CLIENT FIELD OMISSION ≠ DATABASE FIELD REMOVAL. CLIENT FIELD OMISSION ≠ POA LIFECYCLE/ADMIN CHANGE. CLIENT FIELD OMISSION ≠ POA DOCUMENT DOWNLOAD CONTRACT CREATED.**

### 31.6 Non-Equations / Precision

`SAME-CLIENT FIELD EXPOSURE ≠ CROSS-TENANT INCIDENT` · `FIELD VISIBILITY ≠ OBJECT AUTHORIZATION` · `POA RESPONSE PROJECTION ≠ POA DOCUMENT DOWNLOAD CONTRACT` · `filePath OMITTED ≠ FILE STORAGE ARCHITECTURE SECURED` · `fileSize/mimeType OMITTED ≠ FUTURE DOWNLOAD FEATURE PROHIBITED` · `TECHNICAL I04 CLOSED ≠ CLIENT-P2-U03 FULLY CLOSED` · `EXPLICIT BACKEND SELECT = FAIL-CLOSED FIELD PROJECTION`. **Doğru ifade: "PORTAL POA BROAD RESPONSE / INTERNAL POA METADATA EXPOSURE CONTAINED"** — "cross-tenant vulnerability fixed" veya "PoA document storage secured" iddiaları bu kayıtla KURULMAZ.

### 31.7 Open Residual Surfaces

**NOTIFICATION FAIL-CLOSED PROJECTION: OPEN/NOT STARTED** (`getNotifications` — bugün select'siz ama model'de internal alan yok; mekanizma fail-closed DEĞİL). **`CLIENT-P2-U03-I05`: NOT AUTHORIZED.** PoA belge indirme/görüntüleme contract'ı, PoA lifecycle authority'si bu kayıtla ÇÖZÜLMÜŞ SAYILMAZ. **CASE DETAIL (I01) + DOCUMENT (I02) + MESSAGE (I03) FIELD VISIBILITY: CLOSED/CANONICAL, bu kayıtla DEĞİŞMEDİ.** Object-scope (`STF-PRD-BOLA-001`/`STF-PRD-SCP-001`/OFF/OD-08/CAP-02) ve OFFICE authority'si bu kayıtla **DEĞİŞMEDİ**.

### 31.8 Final Unit Status

**CLIENT-P2-U03-I04: TECHNICAL + GOVERNANCE CLOSED/CANONICAL.** **CLIENT-P2-U03 (genel): PARTIAL — I01 + I02 + I03 + I04 ONLY.** **PR #1529, squash `e7f1894c`.** **SCHEMA/MIGRATION: NONE. OBJECT-SCOPE: UNCHANGED. FINANCIAL AUTHORITY: UNCHANGED. POA LIFECYCLE: UNCHANGED. ADMIN POA SERVICES: UNCHANGED.** **NEXT UNIT: OWNER-GATED/NOT AUTO-STARTED.**

### 31.9 U03-I04 Self-Check

Bu bölüm: `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ; POL-D/BP-06 enforcement'ının TAMAMLANDIĞINI iddia ETMEZ; `CLIENT-P2-U03-I05`'i BAŞLATMAZ; notifications yüzeyine dokunmaz veya CLOSED İLAN ETMEZ; PoA download/storage/lifecycle authority'si ÜRETMEZ; POL-J'yi yeniden AÇMAZ; OFFICE CAP-02/OFF-OD-08/STF-PRD-BOLA-001/SCP-001 statülerini DEĞİŞTİRMEZ; session/MFA/finansal-model/POL-E-R1 işini BAŞLATMAZ; genel Phase 2 roadmap'i ÜRETMEZ; §5/§6/§8.A/§8.B/§11–§30 substantive hükümlerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; kod/schema/migration/test/CI DEĞİŞTİRMEZ (implementasyon zaten PR #1529 ile ayrı merge edildi, bu kayıt yalnız governance closure'dır). **TECHNICAL IMPLEMENTATION CLOSED ≠ ALL FIELD-VISIBILITY SURFACES CLOSED; IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).**

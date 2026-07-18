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

Aşağıdaki karar aileleri AÇIK bırakılır; bu charter hiçbirini SEÇMEZ veya ratifiye etmez (her biri ayrı owner kararı gerektirir):

- Portal / external-client authority
- KVKK retention / anonymization / legal hold
- Client-facing masking
- Financial role / approval predicate
- Aggregate visibility policy
- External approval vs staff-proxy provenance — **POL-B RATIFIED: OPTION C — DUAL-TRACK PROVENANCE (bkz. §8.A)**; per-subject applicability + portal authority (POL-C) OPEN
- Calculation cutover
- Fee / harç producer ownership
- Reversal / manual recovery policy

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

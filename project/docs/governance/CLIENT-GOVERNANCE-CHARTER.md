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

## 32. CLIENT Phase 2 U03-I05 — Portal Notification Field-Visibility Technical Closure (OWNER RATIFIED)

Bu bölüm, POL-D (§21) / BP-06 (§23) politikalarının portal notification yüzeyindeki enforcement diliminin (`CLIENT-P2-U03-I05`) teknik kapanış kaydıdır (`decision-log.md` CLIENT-P2-U03-I05-GOV). §5, §6, §8.A, §8.B, §11–§31 substantive hükümlerini DEĞİŞTİRMEZ. §31.7'nin "`CLIENT-P2-U03-I05`: NOT AUTHORIZED" ifadesi bu kayıtla owner tarafından ayrıca yetkilendirilip kapatılmıştır — §31'in kendi metni DEĞİŞTİRİLMEMİŞTİR. **`CLIENT-P2-U03-ANALYZE`'ın (18 bölüm) tespit ettiği beş somut field-visibility yüzeyi (case-detail/document/message/PoA/notification) bu kayıtla TAMAMLANMIŞTIR. Ancak §32.7'de kaydedilen bir residual nedeniyle CLIENT-P2-U03 (genel POL-D/BP-06 enforcement programı) BU KAYITLA CLOSED İLAN EDİLMEZ.**

### 32.1 Technical Lineage

**IMPLEMENTATION:** PR #1538 (task: `CLIENT-P2-U03-I05`, squash SHA `bb54478aee885a96cfc654af8ab1ec31a3ab9015`, merged `origin/main` 2026-07-22). Bu birim, §31.7'nin (`CLIENT-P2-U03-I04`) açık bıraktığı "NOTIFICATION FAIL-CLOSED PROJECTION: OPEN/NOT STARTED" bulgusunun bounded implementasyonudur; `getNotifications()`'ın select'siz `findMany()`'ını hedef alır. **Consumer FOUND:** `apps/web/src/app/portal/layout.tsx`'in bell-icon dropdown'ı gerçekten `/api/portal/notifications`'ı çağırır, kendi `interface Notification` tanımına sahiptir.

### 32.2 Selected Enforcement Model

**PRISMA-LEVEL EXPLICIT SELECT — §28.2/§29.2/§30.2/§31.2 ile aynı desen.** `PortalService.getNotifications()`'ın select'siz `findMany()`'ı, tek bir typed sabit (`PORTAL_NOTIFICATION_CLIENT_SELECT`) ile değiştirildi. Yeni DTO sınıfı, class-transformer veya global interceptor **ÜRETİLMEDİ**. **Brief'ten sapma YOK** — bu birimde owner talimatının taslak alan listesi hem şemaya hem gerçek consumer'ın kendi `interface Notification`'ına birebir uydu. Web production sayfası zaten yalnız approved alanları tüketiyordu; production kodda değişiklik gerekmedi, yalnız focused test eklendi.

**linkUrl güvenlik incelemesi (brief'in açık talebi üzerine yapıldı):** consumer tarafında yalnız Next.js client-side `router.push(n.linkUrl)` ile tüketilir; producer tarafında (`createNotification()`) TEK çağrı yeri (`sendMessageFromOffice()`) bu alanı set eder ve değeri her zaman hardcoded literal `"/portal/messages"`dir — kullanıcı girdisinden türetilmez. Güvenli, STOP condition tetiklenmedi.

### 32.3 Approved Client Response Contract

`id, type, title, message, linkUrl, isRead, createdAt`.

### 32.4 Explicitly Omitted Field Families

`clientId`/`caseId` (authorization context, presentation data DEĞİL) · `readAt` (mevcut client presentation için gerekmiyor). Hepsi **UNKNOWN/UNCLASSIFIED veya INTERNAL-ONLY → varsayılan OMIT** ilkesiyle dışarıda.

### 32.5 Staff-Facing/Internal Boundary Preservation

`getUnreadCount()`/`markAsRead()`/`markAllAsRead()`/`createNotification()` **DEĞİŞMEDİ** — kendi raw, select'siz erişimlerini korur. `createNotification()`'ın write-contract'ı DEĞİŞMEDİ. **CLIENT FIELD OMISSION ≠ DATABASE FIELD REMOVAL. CLIENT FIELD OMISSION ≠ NOTIFICATION PRODUCER/LINK CONTRACT CHANGE.**

### 32.6 Non-Equations / Precision

`SAME-CLIENT FIELD EXPOSURE ≠ CROSS-TENANT INCIDENT` · `FIELD VISIBILITY ≠ OBJECT AUTHORIZATION` · `EXPLICIT SELECT = FAIL-CLOSED FIELD PROJECTION` (bu birimin kendi amacı: gelecekte modele eklenecek bilinmeyen bir alan artık otomatik olarak client response'una GİRMEZ) · `TECHNICAL I05 CLOSED ≠ CLIENT-P2-U03 FULLY CLOSED`. **Doğru ifade: "PORTAL NOTIFICATION BROAD RESPONSE / FUTURE-FIELD AUTO-LEAK RISK CONTAINED."**

### 32.7 CLIENT-P2-U03 Program-Wide Residual Audit (owner talimatı üzerine, taze yapıldı)

Owner, I05-GOV talimatında §29–§31'in ve ilgili risk/synthesis kayıtlarının taze kontrol edilmesini ve I01–I05 dışında açık bir U03 field-visibility residual'i varsa U03'ün CLOSED ilan edilmemesini talep etmiştir. Bu denetim §28.7/§29.7/§30.7/§31.7'nin tam metni fresh `origin/main` üzerinden okunarak yapılmıştır.

**Bulgu — BLOCKING residual (U03'ün kendi orijinal analiz kapsamının parçası, hiç kapatılmamış):**

**OWNER-DECISION-REQUIRED CASE FIELDS** — `Case.muvekkilNotu`, `CaseDebtor` debtor-adjacent alanlar, `Due` vergi alanları (`CLIENT-P2-U03-ANALYZE`'ın madde 8'i). Bu kalem §28.7'de (I01 kapanışı) açıkça `OPEN` olarak kaydedilmiş, ancak §29.7/§30.7/§31.7'nin hiçbirine taşınmamıştır — yani hiçbir zaman ayrı bir I-birimine atanmamış, owner tarafından karara bağlanmamış ve hiçbir kayıtta "çözüldü" veya "ayrı programa ertelendi" DENMEMİŞTİR. Bu, `CLIENT-P2-U03-ANALYZE`'ın kendi orijinal kapsamının (case-detail field-visibility analizinin bir alt-parçası) bugün hâlâ sessizce açık kalan bir dilimidir. **Bu residual CLIENT-P2-U03'ün CLOSED ilanını BLOKLAR.**

**Bulgu — NON-BLOCKING, ayrı gelecek programlara açıkça ertelenmiş kalemler (U03'ün kendi kapanışını bloklamaz):**

Aşağıdaki kalemler her kendi biriminin metninde AÇIKÇA "ayrı, owner-gated contract/karar gerekir" dille ertelenmiştir — U03'ün ölçülebilir teslim kapsamının (I01–I05, beş somut field-visibility yüzeyi) bir parçası DEĞİLDİR, kendi başlarına ayrı, henüz yetkilendirilmemiş gelecek programlardır:

```text
CURATED CLIENT TIMELINE:
NOT SELECTED (§28.7) — case-detail lifecycle'ın yerine curated
sunum; I01'in kendi metninde "ne yetkilendirilir ne yasaklanır" dendi.

CLIENT-SAFE DOCUMENT REJECTION-REASON CONTRACT:
NOT SELECTED (§29.7) — reviewNote'un yerine geçecek client-safe
ret-gerekçesi; I02'nin kendi metninde ayrı contract gerektiği belirtildi.

MESSAGE ACTOR/REPRESENTATION MODEL REOPEN,
MESSAGE RETENTION, MESSAGE ENCRYPTION,
CLIENT-SAFE CASE-LINK PRESENTATION,
ADMIN MESSAGE FIELD VISIBILITY:
ÇÖZÜLMÜŞ SAYILMAZ (§30.7) — I03'ün kendi metninde bunların field-
visibility'nin ÖTESİNDE ayrı kategoriler (actor model/retention/
encryption/admin-scope) olduğu ve reopen edilmediği belirtildi.

POA DOCUMENT DOWNLOAD/VIEW CONTRACT,
POA LIFECYCLE AUTHORITY:
ÇÖZÜLMÜŞ SAYILMAZ (§31.7) — I04'ün kendi metninde "İleride PoA
belgesi client'a sunulacaksa ayrı owner-gated contract gerekir"
dendi; lifecycle authority zaten hiç CLIENT field-visibility
kapsamında DEĞİLDİ.

NOTIFICATION FAIL-CLOSED PROJECTION:
BU KAYITLA (I05) ÇÖZÜLDÜ — mekanizma artık explicit select
kullandığından, modele eklenecek gelecekteki bilinmeyen bir alan
otomatik olarak client response'una GİRMEZ.
```

**Sonuç:** U03'ün beş numaralı teknik dilimi (I01–I05) tamamlanmıştır. Ancak `CLIENT-P2-U03-ANALYZE`'ın kendi kapsamından kaynaklanan OWNER-DECISION-REQUIRED CASE FIELDS kalemi hiçbir zaman ayrı bir birime atanmadan veya karara bağlanmadan açık kalmıştır. Bu nedenle **CLIENT-P2-U03: PARTIAL** statüsü korunur; CLOSED ilan edilmesi için ya bu kalem ayrı bir `CLIENT-P2-U03-I06` (veya eşdeğer) birimi olarak ele alınmalı ya da owner bu alanlar için doğrudan bir CLIENT-SAFE/OMIT kararı vermelidir.

### 32.8 Final Unit Status

**CLIENT-P2-U03-I05: TECHNICAL + GOVERNANCE CLOSED/CANONICAL.** **CLIENT-P2-U03-I01/I02/I03/I04/I05 (beş teknik dilim): TÜMÜ CLOSED/CANONICAL.** **CLIENT-P2-U03 (genel program): PARTIAL — §32.7'deki OWNER-DECISION-REQUIRED CASE FIELDS residual'i nedeniyle CLOSED İLAN EDİLEMEZ.** **PR #1538, squash `bb54478a`.** **SCHEMA/MIGRATION: NONE. OBJECT-SCOPE: UNCHANGED. FINANCIAL AUTHORITY: UNCHANGED.** **NEXT: OWNER-GATED/NOT AUTO-STARTED** — `CLIENT-P2-U03-I06` (case fields residual) veya owner'ın doğrudan bu alanlar için karar vermesi.

### 32.9 U03-I05 Self-Check

Bu bölüm: `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ (residual nedeniyle PARTIAL korunur); yeni teknik unit BAŞLATMAZ; yeni runtime/code/test/CI/schema/migration değişikliği YAPMAZ; notification producer/link contract'ını GENİŞLETMEZ; POL-J'yi yeniden AÇMAZ; OFFICE CAP-02/OFF-OD-08/STF-PRD-BOLA-001/SCP-001 statülerini DEĞİŞTİRMEZ; §32.7'de listelenen non-blocking kalemleri (curated timeline, rejection-reason contract, message actor model, PoA download contract) SEÇMEZ veya YETKİLENDİRMEZ; session/MFA/finansal-model/POL-E-R1 işini BAŞLATMAZ; §5/§6/§8.A/§8.B/§11–§31 substantive hükümlerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; kod/schema/migration/test/CI DEĞİŞTİRMEZ (implementasyon zaten PR #1538 ile ayrı merge edildi, bu kayıt yalnız governance closure'dır). **TECHNICAL IMPLEMENTATION CLOSED ≠ PROGRAM CLOSED; IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).**

## 33. CLIENT Phase 2 U03-I06 — Client Transparency and Financial Disclosure Policy (OWNER RATIFIED, GOVERNANCE-ONLY)

Bu bölüm, §28.7'nin (I01) açtığı ve §32.7'nin (I05 program-wide residual audit) `CLIENT-P2-U03`'ün CLOSED ilanını BLOKE eden tek kalem olarak doğruladığı **OWNER-DECISION-REQUIRED CASE FIELDS** residual'inin **politika seviyesinde** kapanış kaydıdır (`decision-log.md` CLIENT-P2-U03-I06-GOV). Chat-level `CLIENT-P2-U03-I06-ANALYZE` (bu session, read-only alan-bazlı karar matrisi) owner tarafından incelenmiş, üst-politika owner tarafından yeniden çerçevelenmiş ve owner tarafından RATIFİYE edilmiştir. **Bu kayıt GOVERNANCE-ONLY'dir — hiçbir kod/schema/migration/test/CI/runtime değişikliği İÇERMEZ, hiçbir implementasyon yetkisi VERMEZ.** §5, §6, §8.A, §8.B, §11–§32 substantive hükümlerini DEĞİŞTİRMEZ.

### 33.1 Policy Lineage

`CLIENT-P2-U03-ANALYZE`'ın madde 8'i → §28.7 (I01, OPEN kaydı) → §32.7 (I05, program-wide residual audit, BLOCKING tespiti) → chat-level `CLIENT-P2-U03-I06-ANALYZE` (alan-bazlı karar matrisi, GO-ANALYZE, read-only) → **owner'ın üst-politika reframe'i** (saf "parasal alanlar hariç her şey görünür" kuralının fazla geniş olduğu, güvenlik verisi/ham otomasyon/iç not/gereksiz üçüncü-kişi verisini istemeden kapsayacağı gerekçesiyle reddi) → bu kayıt (`CLIENT-P2-U03-I06-GOV`).

### 33.2 Core Visibility Principle — Transparency by Default, Financial Disclosure by Gate

**Müvekkil, kendi dosyasındaki gerçekleşmiş ve doğrulanmış tüm hukuki ve operasyonel işlemleri görür.** Temel ayrım: **gerçekleşmiş işlem → CLIENT-VISIBLE; henüz gerçekleşmemiş, doğrulanmamış veya taslak işlem → NOT CLIENT-VISIBLE.** **Parasal sonuçlar ise ancak ofis tarafından müvekkile açıklanması onaylandıktan ve bildirim gönderildikten sonra görünür hâle gelir** (bkz. §33.4). Şeffaflık ana kuraldır; gizlilik dar ve açıkça tanımlanmış bir istisnadır — **bir alan yalnız "internal" adı taşıdığı için gizlenemez; gizleme açık veri sınıflandırması ve hukuki/operasyonel gerekçe gerektirir.**

**Client-visible bilgi sınıfları (genel, non-financial):** dosyanın tarafları ve hukuki sıfatları · borçlu ve karşı taraf avukatı bilgileri · dosyada yapılan hukuki işlemler · tebligat süreçleri ve sonuçları · başvurular/talepler/hacizler/sorgular · duruşmalar/süreler/takvim olayları · belgeler ve müvekkile açıklanabilir dosya içerikleri · dosyanın güncel işlem/ilerleme durumu · gerçekleşmiş ve doğrulanmış operasyonel işlem geçmişi.

### 33.3 Never-Raw-Exposed Categories (Dar İstisna, Geniş Yorumlanamaz)

İç avukat çalışma notları · personel değerlendirmeleri · taslak hukuki strateji · yetki/rol/güvenlik kayıtları · sistem içi teknik kimlikler · audit altyapısının ham teknik kayıtları · şifre/token/erişim/entegrasyon verileri · üçüncü kişilere ait gereksiz kişisel veriler · doğrulanmamış veya iptal edilmiş taslak işlemler · müvekkile açıklanması mesleki sır veya dosya güvenliği bakımından sakıncalı kayıtlar. **Bu istisnalar geniş yorumlanamaz.**

### 33.4 Financial Disclosure Gate — FAIL-CLOSED

Dosyaya giren para/tahsilat/mahsup/masraf/vekâlet ücreti gibi parasal bilgiler müvekkile **varsayılan olarak doğrudan açılmaz.** Bir parasal kayıt ancak aşağıdaki **5 koşulun TAMAMI** gerçekleştiğinde görünür olur: **(1)** tahsilat/parasal işlem kesinleşmiş · **(2)** ofis tarafından müvekkile açıklanması onaylanmış · **(3)** müvekkile gönderilecek parasal bilgilendirme içeriği onaylanmış · **(4)** bilgilendirme bildirimi başarıyla gönderilmiş · **(5)** onay ve gönderim olayı sistemde immutable/auditable biçimde kayıtlı. **FAIL-CLOSED RULE: No approval or no successful notification = no client financial visibility.**

**Onay sonrası gösterilecek kırılım (örnek şekil, bu kayıtla schema/implementasyon SEÇİLMEZ):** toplam tahsilat · masrafa mahsup · vekâlet ücretine mahsup · müvekkile ödenecek · onay tarihi · bildirim tarihi · ödeme durumu (onaylandı/ödendi/bekliyor). Taslak hesaplamalar, henüz onaylanmamış dağıtımlar, banka mutabakatı tamamlanmamış hareketler ve iç muhasebe çalışma kayıtları **hiçbir koşulda** gösterilmez.

### 33.5 Exact Field Dispositions (I06 Residual Closure — §28.7 + §32.7 Kapatılır)

Bu tablo, `CLIENT-P2-U03-ANALYZE`'ın madde 8'inin ve §28.7/§32.7'nin isimlendirdiği **OWNER-DECISION-REQUIRED CASE FIELDS** kaleminin tamamını kapatır:

```text
Case.muvekkilNotu:
CLIENT-SAFE PROJECTION
INVARIANT: yalnız müvekkile yönelik not semantiği; dahiliNot ile
birleştirilemez/aynı semantikte kullanılamaz (şema düzeyinde zaten
ayrı, bağımsız kolon — invariant yapısal olarak sağlanmış durumda).

CaseDebtor.role:
CLIENT-SAFE PROJECTION

CaseDebtor.liabilityAmount + CaseDebtor.liabilityType:
SEPARATE CURATED FINANCIAL CONTRACT
Doğrudan açılmaz; yalnız Track B (financial disclosure contract)
kapsamında, office-approval + notification gate sonrasında gösterilebilir.

CaseDebtor.debtorLawyerName + CaseDebtor.debtorLawyerBarNo:
CLIENT-SAFE PROJECTION

CaseDebtor.debtorLawyerId:
OMIT (teknik/internal kimlik)

CaseDebtor asset-query alanları
(assetVehicle, assetRealEstate, assetBank, assetSgkWage, assetLastQueryAt):
CLIENT-SAFE CURATED PROJECTION
RAW VALUES: NOT CLIENT-FACING. Curated şekil: sorgu türü, sorgu tarihi,
sonuç durumu, bulgu var/yok/işlem sürüyor, varsa gerçekleştirilen takip işlemi.

CaseDebtor.caseNote:
OMIT (client-facing olduğu ayrıca sınıflandırılmadıkça iç not kabul edilir)

Due vergi alanları (hasKdv, kdvRate, hasBsmv, hasKkdf):
CLIENT-SAFE CURATED PROJECTION
Teknik boolean seti olarak DEĞİL, anlaşılır hesap dökümü içinde: ana
alacak, KDV, BSMV, KKDF, faiz, masraf, toplam. Tahsil edilmiş tutarla
veya mahsup dağılımıyla ilişkili kısım, Track B financial disclosure
gate tamamlanmadan gösterilmez.

Mevcut OMIT kalan gruplar (I01'den beri karara bağlanmış, YENİDEN AÇILMAZ):
lifecycle/passivation · ham tebligat-takip internal alanları · quickNote ·
ham otomasyon/provider verisi · internal identifier'lar · taslak/doğrulanmamış işlemler.
```

### 33.6 Track Separation — Non-Financial Transparency vs. Financial Disclosure Contract

**TRACK B, TRACK A içine veya tek bir implementation unit'e SIKIŞTIRILAMAZ** — onay, bildirim teslimi, idempotency, immutable audit ve düzeltme/iptal semantiği nedeniyle ayrı, bounded bir sözleşme gerektirir. Bu kayıt yalnız ayrımı ve kapsamı kaydeder; **Track A veya Track B'nin herhangi bir implementasyon veya ANALYZE detayını AÇMAZ.**

```text
TRACK A — NON-FINANCIAL TRANSPARENCY PROJECTION:
- Case.muvekkilNotu
- CaseDebtor.role
- curated debtor-lawyer identity (Name + BarNo)
- curated asset-query status
- non-disbursed Due tax presentation (yapısal hesap dökümü şekli;
  tahsil edilmiş tutarla ilişkili kısım hariç)

TRACK B — FINANCIAL DISCLOSURE CONTRACT:
- tahsilat
- masrafa mahsup
- vekâlet ücretine mahsup
- müvekkile gönderilecek net tutar
- office approval
- notification-content approval
- successful notification delivery
- immutable/auditable disclosure event
- idempotency
- correction / reversal semantics
- CaseDebtor.liabilityAmount / liabilityType (curated financial contract parçası)
```

### 33.7 Non-Equations / Precision

`POLICY RATIFIED ≠ IMPLEMENTED` · `FIELD DISPOSITION DECIDED ≠ CASE_DETAIL_SELECT DEĞİŞTİRİLDİ` · `TRACK A/B SCOPE DEFINED ≠ TRACK A/B AUTHORIZED FOR ANALYSIS VEYA IMPLEMENTATION` · `GOVERNANCE-ONLY CLOSURE ≠ U03 FINAL CLOSURE` · `TRANSPARENCY BY DEFAULT ≠ UNBOUNDED DISCLOSURE` (dar istisnalar §33.3 ile sınırlı kalır) · `CLIENT-SAFE CURATED PROJECTION ≠ RAW FIELD EXPOSURE` (asset-query ve Due vergi alanları için curated şekil zorunlu, ham select değil) · `FINANCIAL GATE PASSED (gelecekte) ≠ RETROACTIVE DISCLOSURE OF PRE-GATE RECORDS` (gate yalnız ileri-dönük gösterim kuralıdır, geçmiş kayıtların otomatik yeniden-sınıflandırılması bu kayıtla KURULMAZ). **Doğru ifade: "CASE FIELDS VISIBILITY POLICY RATIFIED / TRACK A+B SCOPE BOUNDED / ZERO IMPLEMENTATION AUTHORITY GRANTED."**

### 33.8 Final Status

**CLIENT-P2-U03-I06 (POLICY): RATIFIED/CANONICAL.** **CLIENT-P2-U03 (genel program): PARTIAL — NOT READY FOR FINAL CLOSURE** (policy resolved, implementation units remain: Track A + Track B). **TRACK A: NOT AUTHORIZED. TRACK B: NOT AUTHORIZED.** **SCHEMA/MIGRATION: NONE. RUNTIME: UNCHANGED. OBJECT-SCOPE: UNCHANGED.** **IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).** **NEXT: OWNER-GATED/NOT AUTO-STARTED** — Track A için GO-ANALYZE (owner'ın kendi önerdiği sıra: önce Track A ANALYZE, sonra Track A IMPLEMENT, sonra Track B ANALYZE, sonra Track B IMPLEMENT, ancak ikisinin canonical kapanışından sonra U03 final closure).

### 33.9 U03-I06 Self-Check

Bu bölüm: `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ (PARTIAL korunur, gerekçe artık "policy resolved, implementation units remain"); Track A veya Track B'nin herhangi bir ANALYZE veya IMPLEMENT işini BAŞLATMAZ; production kod/schema/migration/test/CI/runtime DEĞİŞTİRMEZ; portal projection'ı (`CASE_DETAIL_SELECT` dahil) GENİŞLETMEZ; mail/notification implementasyonu KURMAZ; approval workflow implementasyonu KURMAZ; finansal ledger DEĞİŞTİRMEZ; `CLIENT-P2-U03-I07` veya başka yeni unit AÇMAZ; §32.7'de listelenen non-blocking kalemleri (curated timeline, rejection-reason contract, message actor model, PoA download contract) SEÇMEZ veya YETKİLENDİRMEZ; §5/§6/§8.A/§8.B/§11–§32 substantive hükümlerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; OFFICE CAP-02/OFF-OD-08/STF-PRD-BOLA-001/SCP-001 statülerini DEĞİŞTİRMEZ. **POLICY RATIFIED ≠ PROGRAM CLOSED; POLICY RATIFIED ≠ IMPLEMENTATION AUTHORIZED; IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).**

## 34. CLIENT Phase 2 Track A — Non-Financial Transparency Projection Technical Closure (OWNER RATIFIED)

Bu bölüm, §33'ün (I06 policy ratifikasyonu) yetkilendirdiği ve §33.8/§33.9'un "Track A için GO-ANALYZE" olarak sıraya koyduğu **TRACK A — NON-FINANCIAL TRANSPARENCY PROJECTION**'ın üç bounded implementation unit'inin (I01/I02/I03) **teknik kapanışını canonicalize eder** (`decision-log.md` CLIENT-P2-U03-TRACK-A-GOV). Implementasyon zaten üç ayrı owner GO-IMPLEMENT + IF GO-COMPLETE zinciriyle, üç ayrı PR ile, CI 4/4 PASS doğrulanarak merge edilmiştir; **bu kayıt yalnız governance closure'dır, yeni kod/schema/migration/test/CI/runtime değişikliği İÇERMEZ.**

### 34.1 Technical Lineage

§33 (I06, transparency-by-default + financial-disclosure-gate ratifikasyonu + Track A/B ayrımı) → owner `CLIENT-P2-U03-TRACK-A-A01` GO-ANALYZE (read-only design, muvekkilNotu/role/debtor-lawyer identity) → `CLIENT-P2-U03-TRACK-A-I01` GO-IMPLEMENT (PR #1559, squash `eeba1e8f`) → owner `CLIENT-P2-U03-TRACK-A-A02` GO-ANALYZE (read-only design, asset-query curated contract) → `CLIENT-P2-U03-TRACK-A-I02` GO-IMPLEMENT (PR #1564, squash `1540bd06`) → **owner'ın mimari kapsam düzeltmesi** ("Burada bence kapsam kayması oluşmuş" — Due tax/interest için önerilen "hesap dökümü" çerçevesinin hesaplama motoru bounded-context'ine kaydığının tespiti, bkz. §34.3) → owner `CLIENT-P2-U03-TRACK-A-A03` GO-ANALYZE (read-only, daraltılmış Due field-visibility disposition) → `CLIENT-P2-U03-TRACK-A-I03` GO-IMPLEMENT (PR #1569, squash `774bdc63`) → bu kayıt (`CLIENT-P2-U03-TRACK-A-GOV`, GOVERNANCE-ONLY).

### 34.2 Approved Client Response Contracts (I01 + I02 + I03)

```text
TRACK-A-I01 (PR #1559, squash eeba1e8f):
Case.muvekkilNotu → CLIENT-SAFE (dahiliNot'tan yapısal/bağımsız kolon, invariant korunur)
CaseDebtor.role → CLIENT-SAFE, 12 değerli exhaustive Türkçe label-map + nötr
  "Hukuki Taraf" fallback (ASIL_BORCLU/MUTESELSIL_KEFIL/CIRANTA/KESIDECI/MUHATAP/
  MIRASCI/TASFIYE_MEMURU/IFLAS_MASASI dahil tam 12 değer — önceki GO-ANALYZE'ın
  8-değer yanlış sayımı owner stop-condition'ıyla düzeltildi)
CaseDebtor.debtorLawyerName + debtorLawyerBarNo → CLIENT-SAFE
CaseDebtor.debtorLawyerId → OMIT (teknik/internal kimlik)
Test: API 19/19 + web 23/23; tam portal regresyon API 139/139 (12 suite) + web 82/82 (7 dosya)

TRACK-A-I02 (PR #1564, squash 1540bd06):
CaseDebtor asset-query alanları (assetVehicle/assetRealEstate/assetBank/
  assetSgkWage/assetLastQueryAt) → RAW DEĞER CLIENT'A HİÇ DÖNMEZ.
Curated contract: debtors[].assetQuery { vehicle, realEstate, bank, sgkWage,
  lastQueryAt }, 5 curated durum (NOT_QUERIED/FOUND/NOT_FOUND/RESULT_PENDING/
  RESULT_UNAVAILABLE), ham AssetQueryStatus (UNKNOWN/YES/NO/PENDING/ERROR) API
  tarafında pure mapper (asset-query-projection.ts) ile dönüştürülür; tanınmayan/
  gelecek ham değer fail-safe RESULT_UNAVAILABLE'a düşer. Web yalnız curated
  durum → Türkçe etiket çevirisi yapar, ham enum'u hiç görmez.
AssetQuery/EnforcementAction modelleri (resultData/errorMessage/requestedBy/
  reason/idempotencyKey) select'e hiç dahil değil.
Test: mapper 10/10 + API 25/25 + web 33/33; tam portal regresyon API 155/155
  (13 suite) + web 92/92 (7 dosya)

TRACK-A-I03 (PR #1569, squash 774bdc63):
Due alanları (14): interestType, interestRate, interestStartDate, interestEndDate,
  accruesInterest, sourceDocumentNo, hasKdv, kdvRate, hasBsmv, hasKkdf,
  requiresFinalization, isFinalized, finalizationDate, isPrimary → CLIENT-SAFE,
  SAKLI DEĞER AS-IS (sıfır hesaplama/türetme).
interestType doğrulanmış 6-değerli evren (YASAL/SABIT/AVANS/TEMERRUT/YOKSUN/
  TICARI, DTO @IsEnum(InterestType) ile sınırlı, DB kolonu constraint'siz TEXT);
  web-side basit label-map + nötr "Faiz Türü Belirtilmemiş" fallback.
Hâlâ OMIT: caseId, interestDays, sourceDocumentId, finalizationNote, sortOrder,
  createdAt, updatedAt, description.
Fail-closed tutarsız veri: isFinalized=false + finalizationDate dolu → nötr
  "Kesinleşme Bilgisi Kontrol Ediliyor" (ne "Kesinleşti" ne "Kesinleşme Gerekiyor"
  iddia edilir).
Test: API 27/27 + web 57/57; tam portal regresyon API 157/174 (13/15 suite,
  17 skipped) + web 116/116 (7 dosya)
```

### 34.3 Scope Precision — Due Tax/Interest Presentation, §33.5/§33.6 Ön-Çerçevesinin Daraltılması (Owner-Ratified, Track-A-A03)

§33.5'in "Due vergi alanları... teknik boolean seti olarak DEĞİL, anlaşılır **hesap dökümü** içinde: ana alacak, KDV, BSMV, KKDF, faiz, masraf, toplam" ifadesi ve §33.6'nın Track A kapsamına yazdığı "non-disbursed Due tax presentation (**yapısal hesap dökümü şekli**)" ifadesi, I06 karar anında henüz bounded bir implementation unit'e ayrıştırılmamış bir **ön-çerçeve**dir. `CLIENT-P2-U03-TRACK-A-A03` GO-ANALYZE hazırlığı sırasında owner bu çerçevenin CLIENT'ın bounded-context'i dışına — hesaplama motoruna (KDV/BSMV/KKDF oranı uygulanması, faiz hesaplama formülleri, güncel bakiye/toplam türetimi, Interest Engine/Claim Formation/Accounting alanı) — kaydığını tespit etmiş ve REDDETMİŞTİR: *"Burada bence kapsam kayması (scope creep) oluşmuş... Bu noktada kapsamı yeniden daraltmak daha doğru yaklaşım."* Owner "hesap dökümü/toplam" kavramını **tamamen Track B'ye (Financial Disclosure)** devretmiş, Track A'yı yalnız **saklı değerlerin AS-IS gösterimiyle** (hiçbir hesaplama/türetme/formül olmadan) sınırlamıştır — bir "hesap dökümü" veya "hesaplanan tutar" değil, bağımsız ham gösterge kümesi (`KDV Dahil (%20)`, `BSMV Uygulanıyor`, `Faiz Oranı: %9.5` gibi ayrık satırlar).

**Bu kayıt §33.5/§33.6'nın metnini DEĞİŞTİRMEZ/SİLMEZ** (geriye dönük edit yapılmaz, append-only ilke korunur) — yalnız hangi TARAFıN (Track A mı Track B mi) hesap dökümünü/toplamı üreteceğini netleştiren, çapraz-referanslı bir **kesinlik notu**dur: **Track A** ham flag/oran/tarihi AS-IS gösterir (bu §34.2'de listelenen 14 Due alanı); **Track B** (hâlâ NOT AUTHORIZED) ileride, onay-sonrası financial disclosure gate kapsamında, "ana alacak/KDV/BSMV/KKDF/faiz/masraf/toplam" hesap dökümünü üretebilir. §33'e bakan gelecekteki bir okuyucu bu §34.3'ü zorunlu çapraz referans olarak okumalıdır.

### 34.4 Non-Financial / Non-Calculation Boundary Preservation

Track A'nın üç unit'i de (I01/I02/I03) şunları YAPMAZ: KDV/BSMV/KKDF tutarı hesaplama · faiz tutarı/güncel bakiye hesaplama · tahsilat/mahsup/vekâlet ücreti kesintisi · müvekkile net ödeme hesabı · onay/bildirim/mail workflow'u · financial disclosure event/audit/immutable snapshot · `AssetQuery`/`EnforcementAction` ham teknik/provider/job verisi client'a sızıntısı. Bunların TAMAMI Track B (Financial Disclosure Contract) kapsamındadır ve **NOT AUTHORIZED** kalır. Object-scope (`STF-PRD-BOLA-001`/`STF-PRD-SCP-001`/OFF/OD-08/CAP-02) bu kayıtla DEĞİŞMEDİ, dokunulmadı — **SAME-CLIENT FIELD EXPOSURE ≠ CROSS-TENANT INCIDENT.**

### 34.5 Non-Equations / Precision

`TRACK A TECHNICALLY CLOSED ≠ CLIENT-P2-U03 CLOSED` · `TRACK A CLOSED ≠ TRACK B AUTHORIZED` · `DUE ALANLARI AS-IS GÖSTERİLİR ≠ HESAP DÖKÜMÜ/TOPLAM ÜRETİLDİ` (bkz. §34.3) · `CURATED ASSET-QUERY PROJECTION ≠ RAW AssetQueryStatus/AssetQuery MODEL EXPOSURE` · `12-DEĞERLİ DebtorRole LABEL-MAP ≠ YENİ ROL/YETKİ TAKSONOMİSİ` (yalnız sunum çevirisi, yetki modeli DEĞİŞMEDİ) · `interestType 6-DEĞERLİ DOĞRULANMIŞ EVREN ≠ ENUM DB-SEVİYESİNDE CONSTRAINT'Lİ` (DTO `@IsEnum` ile sınırlı, DB kolonu `TEXT`; bilinmeyen değer nötr fallback'e düşer, hata FIRLATMAZ). **Doğru ifade: "TRACK A (I01+I02+I03) TECHNICALLY + GOVERNANCE CLOSED/CANONICAL / TRACK B NOT AUTHORIZED / CLIENT-P2-U03 PARTIAL."**

### 34.6 Final Status

**TRACK A (NON-FINANCIAL TRANSPARENCY PROJECTION): CLOSED/CANONICAL** — I01 (PR #1559) + I02 (PR #1564) + I03 (PR #1569) tümü TECHNICAL + GOVERNANCE CLOSED/CANONICAL. **TRACK B (FINANCIAL DISCLOSURE CONTRACT): NOT AUTHORIZED / NOT STARTED.** **CLIENT-P2-U03 (genel program): PARTIAL — NOT READY FOR FINAL CLOSURE** (Track A implementation tamamlandı; Track B implementation units eksik; U03 final closure ikisinin de canonical kapanışını gerektirir). **SCHEMA/MIGRATION: NONE (üç unit'in de). RUNTIME: UNCHANGED (yalnız select/response projection genişletildi). OBJECT-SCOPE: UNCHANGED. IMPLEMENTATION AUTHORITY: NONE (implementasyon üç ayrı PR ile ayrı merge edildi, bu kayıt yalnız governance closure'dır).** **NEXT: OWNER-GATED/NOT AUTO-STARTED** — Track B için GO-ANALYZE, veya owner'ın doğrudan farklı bir sıra tercih etmesi; `CLIENT-P2-U03-I07` veya CLIENT-P2-U03 final closure hiçbiri bu kayıtla otomatik başlatılmaz.

### 34.7 Track A Self-Check

Bu bölüm: `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ (PARTIAL korunur, gerekçe "Track A closed, Track B implementation units remain"); Track B'nin herhangi bir ANALYZE veya IMPLEMENT işini BAŞLATMAZ; production kod/schema/migration/test/CI/runtime DEĞİŞTİRMEZ (I01/I02/I03 zaten ayrı PR'larla merge edilmiş, bu kayıt yalnız canonicalize eder); §33.5/§33.6'nın metnini SİLMEZ/EDİT ETMEZ (yalnız §34.3 ile çapraz-referanslı kesinlik notu ekler); §5/§6/§8.A/§8.B/§11–§33 substantive hükümlerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; `CLIENT-P2-U03-I07` veya başka yeni unit AÇMAZ; OFFICE CAP-02/OFF-OD-08/STF-PRD-BOLA-001/SCP-001 statülerini DEĞİŞTİRMEZ. **TRACK A CLOSED ≠ PROGRAM CLOSED; TRACK A CLOSED ≠ TRACK B AUTHORIZED; IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).**

## 35. CLIENT Phase 2 Track B — Financial Disclosure Architecture Canonicalization (OWNER RATIFIED, GOVERNANCE-ONLY)

Bu bölüm, §34'ün (Track A kapanışı) sıraya koyduğu **TRACK B — FINANCIAL DISCLOSURE CONTRACT**'ın mimari tasarımını ve owner'ın verdiği altı karar noktasını canonicalize eder (`decision-log.md` CLIENT-P2-U03-TRACK-B-D01-GOV). Mimari, chat-level `CLIENT-P2-U03-TRACK-B-A01` (read-only envanter) ve `CLIENT-P2-U03-TRACK-B-D01` (read-only GO-DESIGN) turlarında hazırlanmış, owner tarafından incelenip altı açık karar noktasında ratifiye edilmiştir. **Bu kayıt GOVERNANCE-ONLY'dir — hiçbir kod/schema/migration/test/CI/runtime değişikliği İÇERMEZ, hiçbir implementasyon yetkisi VERMEZ.**

### 35.1 Lineage

§33 (I06, transparency-by-default + financial-disclosure-gate ratifikasyonu + Track A/B ayrımı) → §34 (Track A teknik kapanışı, PR #1559/#1564/#1569) → owner'ın canlı politika ihlali tespiti (`CASE_DETAIL_SELECT`/`getClientCases()`'in ham `collections` ifşası, §33.4 ile çelişki) → `CLIENT-P2-U03-TRACK-B-U00` (case-detay remediation, PR #1582) → `CLIENT-P2-U03-TRACK-B-U00B` (case-liste remediation, PR #1584) → chat-level `CLIENT-P2-U03-TRACK-B-A01` (read-only envanter: money model'leri, allocation semantics, approval authority, notification/delivery, idempotency/correction precedent) → chat-level `CLIENT-P2-U03-TRACK-B-D01` (read-only GO-DESIGN, 21 karar alanı) → owner'ın altı owner-kararı ratifikasyonu → bu kayıt (`CLIENT-P2-U03-TRACK-B-D01-GOV`, GOVERNANCE-ONLY).

### 35.2 Bounded-Context Ownership & Non-Recalculation İlkesi

Track B, tahsilat/dağıtım/muhasebe hesaplamalarını **sahiplenmez** — bunlar RECEIVABLE/client-settlement/ledger bounded-context'lerinin zaten olgun, reconciliation-doğrulanmış sorumluluğudur. Track B, yalnız yetkili sonuçları **tüketir**: snapshot, onay bağlama, içerik onayı, bildirim gönderim bağlama, yayınlama durumu, curated okuma sözleşmesi, düzeltme/supersession/reversal sunumu. Track B şunları YAPMAZ ve yapamaz: tahsilat oluşturma, tahsis hesaplama, ledger hesaplama, banka mutabakatı, muhasebe politikası kuralları, ödeme icrası, müvekkile fiili para transferi.

### 35.3 Aggregate Root & V1 Kapsam Sınırı

**Birincil kaynak aggregate: `CollectionDisposition`, zorunlu kaynak durumu: `POSTED`.** Gerekçe: bu model zaten tam gereken şekli taşıyor — tutar, kalem kırılımı, onay bağlantısı, POSTED zaman damgası; `Collection` ile `collectionId @unique` üzerinden doğal 1:1 idempotent ilişkisi var (`CollectionDisposition.collectionId String @unique`). **V1 desteklenen kapsam: yalnız `beneficiaryScope = SINGLE_CASE_CLIENT`.**

**`CASE_CREDITOR_CLUSTER` (çoklu-alacaklı, `caseClientId` null) — OWNER KARARI: V1 KAPSAMI DIŞI.** Sessizce atlanamaz: bu scope'ta bir disclosure oluşturma girişimi **fail-closed `UNSUPPORTED_SCOPE` sonucu üretmelidir** — disclosure oluşturulmaz, sessizce atlanmaz, bir client sahibi çıkarsanmaz (varsayım yapılmaz).

### 35.4 Yetkili Kaynak Bağlama

Yetkilendirilmiş yetkili kaynaklar: `Collection` (status=CONFIRMED, amount/currency/date kopyalanır) · `CollectionDisposition` (status=POSTED, totalAmount/currency/postedAt kopyalanır) · `CollectionDispositionLine` (type+amount KOPYALANIR, referans değil). `ClientPayout` yalnız ileride **kayıt-edilmiş-ödeme kanıtı** sağlayabilir (§35.15). `LedgerEntry`/`LedgerAllocation` **V1 disclosure kaynağı DEĞİLDİR** (§35.17). Disclosure snapshot'ı onaylanan kaynak değerlerini kopyalar; yayınlanmış disclosure'lar kaynak kayıtlar sonradan değişse/reversed olsa/superseded olsa da **yeniden yazılmaz** — değişikliği yansıtmak yeni bir düzeltme versiyonu gerektirir (§35.13).

### 35.5 Model Kararı & Disclosure Kalem Taksonomisi

**Canonical model: `ClientFinancialDisclosure` (kök) → `ClientFinancialDisclosureVersion` (immutable finansal snapshot) → `ClientFinancialDisclosureLine` (normalize dağıtım satırları).**

```text
ClientFinancialDisclosure:
- kararlı aggregate kimliği
- tenant/case/case-client sahipliği
- CollectionDisposition idempotency anchor'ı
- current-effective versiyon işaretçisi

ClientFinancialDisclosureVersion:
- immutable finansal snapshot
- versiyon yaşam döngüsü
- ofis onayı bağlaması
- içerik onayı bağlaması
- bildirim kanıtı
- yayınlama kanıtı
- düzeltme/supersession/reversal bağlantıları

ClientFinancialDisclosureLine:
- normalize dağıtım satırları
- mevcut CollectionDispositionLineType taksonomisi (YENİDEN KULLANILIR)
- kesin Decimal tutar
- kaynak-satır izlenebilirliği
```

**Disclosure kalem taksonomisi yeni bir finansal tahsis taksonomisi İCAT ETMEZ** — mevcut `CollectionDispositionLineType` evreni doğrudan yeniden kullanılır. V1 client sunumu, mevcut olduğunda şu dispozisyon satırları için curated etiket içerir: `CLIENT_PAYABLE` · `CONTRACTUAL_FEE_WITHHELD` · `FIRM_EXPENSE_REIMBURSEMENT` · `CLIENT_EXPENSE_REIMBURSEMENT` · `OFFSET_CLIENT_ADVANCE` · `OTHER`. `HELD_PENDING_DISTRIBUTION` asla client-görünür DEĞİLDİR — yalnız POSTED kaynak dispozisyonlar disclosure oluşturabildiğinden yapısal olarak imkânsızdır.

### 35.6 Immutability & Versiyonlama Sözleşmesi

Yayınlanmış finansal değerler yerinde asla mutasyona uğramaz. Yayınlanmış bildirim içeriği yerinde asla mutasyona uğramaz. Düzeltmeler yeni versiyon yaratır; supersession eski versiyonu korur; reversal orijinal versiyonu korur. Zorunlu bağlamalar: `snapshotHash` · `sourceFingerprint` · `notificationContentHash` · disclosure versiyonu · alıcı kimliği. **Yayınlama, onaylanmış fingerprint'i yeniden doğrulamalıdır** — stale onay veya TOCTOU yayınlamasını önlemek için.

### 35.7 Durum Makinesi

Canonical minimum yaşam döngüsü: `DRAFT → OFFICE_APPROVAL_PENDING → OFFICE_APPROVED → CONTENT_APPROVAL_PENDING → CONTENT_APPROVED → SEND_PENDING → (SEND_FAILED ⟲) → PUBLISHED`, ayrıca `CANCELLED` (finansal taahhüt öncesi) ve yalnız PUBLISHED'ten ulaşılabilir `SUPERSEDED`/`REVERSED`. **Yalnız `PUBLISHED` client-görünürdür.** **OWNER KARARI (§35.11 ile birlikte):** provider-acceptance bir `SENT` audit olayı üretebilir, ama `SENT` ayrı, kalıcı bir client-facing durum olarak GEREKMEZ — durum satırı `SEND_PENDING`'ten doğrudan `PUBLISHED`'e, tek guarded geçişte ilerler.

### 35.8 Ofis Disclosure Onayı

Mevcut `OfficeApprovalRequest` substrate'i disclosure-özel bir sözleşmeyle yeniden kullanılır. **Canonical `actionCode`: `CLIENT_FINANCIAL_DISCLOSURE_APPROVE`** (yeni migration gerekmez — substrate'in kendi tasarımı: actionCode string, tek modüle bağımlı değil). Onay, tam olarak disclosure versiyonuna ve `snapshotHash`'e bağlanmalıdır. Mevcut onaylayıcı yetkinlik kuralları, repository truth doğruladığı ölçüde yeniden kullanılır: bugün doğrulanmış substrate `isApproverEligible()` (PARTNER veya `canApproveOfficeActions=true`); owner'ın işaret ettiği daha geniş rol kümesi (MANAGER/SUPER ADMIN/yetkilendirilmiş avukat) **implementasyon aşamasında (I01/I03) mevcut yetkinlik modeliyle doğrulanacak/genişletilecek bir kapsam olarak kaydedilir — bugün var olduğu iddia edilmez.** Bu yetkinliğe sahip olmayan staff hiçbir koşulda nihai finansal-disclosure onaylayıcısı OLAMAZ. Requester/approver ayrımı ve stale-onay reddi zorunlu kalır. İç dağıtım onayı (`DISTRIBUTION_APPROVED`), müvekkile-açıklama onayına EŞDEĞER DEĞİLDİR.

### 35.9 İçerik Onayı (Owner Kararı)

**OWNER KARARI: Ayrı bir ikinci `OfficeApprovalRequest` OLUŞTURULMAYACAK.** Disclosure versiyonu üzerinde ayrı, auditable bir durum geçişi kullanılır — finansal onaydan bağımsız bir onay olayıdır, ancak ikinci bir genel onay kaydı gereksiz karmaşıklık yaratacağından reddedilmiştir. Zorunlu alanlar/kanıt: `notificationContent` · `notificationContentHash` · `contentApprovedAt`/`By` · onaylanmış alıcı kimliği · disclosure versiyonu · finansal `snapshotHash`. İçerik onayından sonra: içerik düzenlenemez, alıcı değiştirilemez, tutarlar değiştirilemez, kalem taksonomisi değiştirilemez, para birimi değiştirilemez — herhangi biri değişirse onaylanmış versiyon geçersiz kalır.

### 35.10 Teslimat Kanıtı & Mock-Provider Yasağı

Canonical başarı eşiği: **gerçek SMTP/provider kabulü + kalıcı provider message ID.** Bu yalnız "provider mesajı kabul etti"yi kanıtlar — inbox teslimatını, okunmayı veya alıcı eylemini KANITLAMAZ. Eksik message ID → `SEND_FAILED`. **Mock provider production yayınlamayı ASLA yetkilendiremez** — zorunlu production invariant'ı: `EMAIL_PROVIDER` onaylı gerçek bir provider olarak yapılandırılmamışsa yayınlama yasaktır; sessiz mock fallback'i Financial Disclosure gate'ini tatmin edemez.

### 35.11 Gönderim / Yayınlama Sırası (Owner Kararı)

**OWNER KARARI: Başarılı gönderim sonrası ek bir insan-kontrollü yayınlama onayı GEREKMEZ.** Zorunlu sıra: (1) `SEND_PENDING`'i kalıcı commit et · (2) provider çağrısını DB transaction'ı DIŞINDA yap · (3) gerçek-provider kabulü + message ID zorunlu tut · (4) snapshot/içerik/alıcı bağlamalarını yeniden doğrula · (5) `PUBLISHED`'e tek idempotent, guarded DB geçişi tamamla · (6) provider-kabul/`SENT` audit olayını ve yayınlama olayını kaydet. Sistem şunları ÖNLEMELİDİR: gönderim kanıtı olmadan portal yayınlaması · kalıcı disclosure versiyonu olmadan bildirim gönderimi · çift gönderim · çift yayınlama · stale onay yayınlaması · değişmiş-alıcı yayınlaması.

### 35.12 Idempotency / Concurrency

Zorunlu doğal constraint'ler: `@@unique([tenantId, collectionDispositionId])` (kök) · `@@unique([tenantId, disclosureId, version])` · disclosure-versiyonu gönderim idempotency anahtarı. Repository-native desenler yeniden kullanılır: advisory lock · transaction-içi re-check · doğal unique constraint · P2002 replay · compare-and-swap durum geçişi · snapshot/içerik hash yeniden-doğrulaması.

### 35.13 Düzeltme / Supersession / Reversal

Yayınlanmış disclosure geçmişi **asla silinmez veya sessizce yeniden yazılmaz.** Finansal değişiklik (toplam tutar/para birimi/satır tipi/satır tutarı/müvekkil net tutarı/alıcı sahipliği/kaynak dispozisyon bağlaması dahil herhangi biri) → yeni versiyon + yeni finansal ofis onayı + yeni içerik onayı + yeni bildirim + yeni yayınlama, kısayol YOK.

**OWNER KARARI (yazım/sunum düzeltmesi):** yazım-only düzeltme her zaman yeni versiyon + yeni içerik onayı + yeni bildirim + yeni yayınlama gerektirir. Finansal ofis onayı yalnız şu KOŞULLARIN TAMAMI sağlanırsa yeniden kullanılabilir: `snapshotHash` değişmemiş · `sourceFingerprint` değişmemiş · para birimi değişmemiş · tüm finansal satırlar/tutarlar değişmemiş · müvekkil alıcı kimliği değişmemiş. Bunlardan herhangi biri değişmişse tam finansal yeniden-onay ZORUNLUDUR.

### 35.14 Client Portal Sözleşmesi & Disclosure Geçmişi (Owner Kararı)

Client API yalnız tenant+client+case object-scope içindeki `PUBLISHED` disclosure'ları taşır. **OWNER KARARI: Varsayılan yüzey current-effective disclosure'ı gösterir; müvekkil ayrıca düzeltme/reversal geçmişine erişebilir — eski kayıtlar gizlenmez, ancak normal ekranda gürültü yaratmayacak AYRI bir "Bildirim Geçmişi" yüzeyinde sunulur** (tek, birleşik bir liste değil). İzin verilen alanlar: opaque disclosure ID · versiyon · para birimi · totalCollected · curated satırlar · clientNetAmount · approvedAt/notifiedAt/publishedAt · current/effective işareti · supersession/reversal ilişkisi · client-safe düzeltme gerekçesi · kanıt-desteklenen remittance durumu. **Gösterilmez:** internal approver ID · onay yorumları · provider hata detayı · idempotency anahtarları · hash'ler · ham ledger ID'leri · banka bilgisi · yayınlanmamış değerler · taslak workflow durumları.

### 35.15 Remittance Etiketleme Kısıtı

Disclosure şu dördü ayırt etmelidir: Müvekkile Aktarılacak / Ödeme Kaydedildi / Ödeme Gerçekleşti / Banka Mutabakatı Tamamlandı. **Mevcut `ClientPayout` mimarisi yalnız "Ödeme Kaydedildi"yi kanıtlar** (`ClientPayoutStatus` tek değer: `RECORDED`). Bu nedenle **V1, gelecekte yetkili bir banka-icra/mutabakat sözleşmesi kurulmadıkça "Ödeme Gerçekleşti" veya "Banka Mutabakatı Tamamlandı" İDDİA EDEMEZ.**

### 35.16 Çoklu Para Birimi & Hassasiyet

Bir disclosure tam olarak bir para birimi taşır; farklı para birimleri ayrı disclosure gerektirir; cross-currency agregasyon YOK; otomatik FX YOK. Canonical V1 hassasiyeti: `Decimal(15,2)` (mevcut `Collection`/`CollectionDisposition`/`CollectionDispositionLine`/`ClientPayout` ile tam tutarlı). Zorunlu kesin reconciliation: `Σ satırlar = totalCollected`, `CLIENT_PAYABLE satırı = clientNetAmount`, tolerans YOK. Yuvarlama artıkları Track B tarafından sessizce atanamaz.

### 35.17 Ledger-Seviyeli Kırılım Hariç Tutulması (Owner Kararı)

**OWNER KARARI: Ana para/faiz/vergi gibi ledger-seviyeli kırılım V1 DIŞINDADIR.** V1 yalnız mevcut `CollectionDispositionLineType` dağıtım taksonomisini tüketir. Gelecekteki herhangi bir ledger-seviyeli kırılım, ayrı, owner-gated bir curated contract gerektirir — bu kayıtla YETKİLENDİRİLMEZ.

### 35.18 Güvenlik & Audit

Zorunlu invariant'lar: tenant izolasyonu · case/client object-scope · yayınlanmamış disclosure'ın DB sorgusu SEVİYESİNDE dışlanması · yetkinliksiz staff'ın nihai onaylayıcı olma yasağı · stale onay reddi · onaydan önce alıcı bağlaması · replay-safe gönderim/yayınlama · cross-client disclosure numaralandırması YOK · mock-provider production yayınlaması YOK · client-side filtreleme birincil disclosure sınırı OLARAK KULLANILMAZ. Append-only audit kanıtı zorunlu: disclosure yaratma · kaynak bağlama · ofis onayı talep/karar · içerik onayı/red · gönderim talebi · provider kabulü · gönderim hatası · yayınlama · düzeltme versiyonu · supersession · reversal.

### 35.19 Implementasyon Treni (yetkilendirilmedi)

```text
D01-GOV: mimari canonicalization (bu kayıt)
I01: schema + migration + model-seviyesi constraint'ler
I02: snapshot yaratma, kaynak bağlama, reconciliation
I03: ofis onayı + aggregate içerik onayı
I04: provider dispatch + mock-provider production guard'ı + yayınlama durum makinesi
I05: client portal API projeksiyonu
I06: client portal web sunumu + disclosure geçmişi
I07: düzeltme, supersession, reversal
I08: Track B governance kapanışı
```
`I01`–`I08`'in HİÇBİRİ bu GO-DOCS kaydıyla otomatik yetkilendirilmez.

### 35.20 Non-Equations / Precision

`ARCHITECTURE RATIFIED ≠ IMPLEMENTATION AUTHORIZED` · `TRACK B ARCHITECTURE CANONICAL ≠ TRACK B CLOSED` · `SIX OWNER DECISIONS RATIFIED ≠ SCHEMA CREATED` · `POSTED CollectionDisposition AGGREGATE ROOT ≠ CLIENT TRACK B RECALCULATES ALLOCATION` (Track B yalnız TÜKETİR) · `CollectionDispositionLineType YENİDEN KULLANILDI ≠ YENİ FİNANSAL TAKSONOMİ İCAT EDİLDİ` · `PROVIDER-ACCEPTED KANIT EŞİĞİ ≠ INBOX TESLİMATI KANITLANDI` · `"ÖDEME KAYDEDİLDİ" KANITLANDI ≠ "ÖDEME GERÇEKLEŞTİ"/"BANKA MUTABAKATI TAMAMLANDI" KANITLANDI` (§35.15, sert kısıt) · `CASE_CREDITOR_CLUSTER V1 DIŞI ≠ SESSİZCE ATLANIR` (fail-closed `UNSUPPORTED_SCOPE` zorunlu) · `LEDGER-SEVİYELİ KIRILIM HARİÇ ≠ 4-KATEGORİLİ DAĞITIM EKSİK`. **Doğru ifade: "TRACK B ARCHITECTURE RATIFIED/CANONICAL — ALTI OWNER KARARI DAHİL / TRACK B IMPLEMENTATION NOT AUTHORIZED / CLIENT-P2-U03 PARTIAL."**

### 35.21 Final Status

**TRACK A: CLOSED/CANONICAL** (değişmedi). **TRACK B LIVE REMEDIATION: COMPLETE** (case-detay PR #1582 + case-liste PR #1584, ikisi de ayrı merge edildi). **TRACK B ARCHITECTURE: RATIFIED/CANONICAL** (bu kayıtla — 21 karar alanı + altı owner kararı). **TRACK B IMPLEMENTATION: NOT AUTHORIZED/NOT STARTED.** **CLIENT-P2-U03 (genel program): PARTIAL — NOT READY FOR FINAL CLOSURE.** **SCHEMA/MIGRATION: NONE. RUNTIME: UNCHANGED. IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).** **NEXT: OWNER-GATED/NOT AUTO-STARTED** — `CLIENT-P2-U03-TRACK-B-I01` (schema + migration + model-seviyesi constraint'ler), otomatik başlatılmaz.

### 35.22 Track B Architecture Self-Check

Bu bölüm: `CLIENT-P2-U03`'ü veya Track B'yi CLOSED İLAN ETMEZ; `I01`–`I08`'in hiçbirini BAŞLATMAZ; production kod/schema/migration/test/API/portal DEĞİŞTİRMEZ; yeni migration OLUŞTURMAZ; §5/§6/§8.A/§8.B/§11–§34 substantive hükümlerini DEĞİŞTİRMEZ; `CollectionDisposition`/`CollectionDispositionLine`/`OfficeApprovalRequest`/`EmailProviderService`/ledger modellerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; hesaplama/tahsis/muhasebe/ödeme icrası yetkisi VERMEZ. **ARCHITECTURE RATIFIED ≠ IMPLEMENTATION AUTHORIZED; IMPLEMENTATION AUTHORITY: NONE (bu kayıtla).**

## 36. CLIENT / MÜVEKKİL MİMARİSİ — SPRING CLEANING PROGRAM CLOSURE (OWNER RATIFIED)

Bu bölüm, owner'ın dört paketlik `CLIENT / MÜVEKKİL MİMARİSİ — SPRING CLEANING` programının canonical kapanışını kaydeder. Program, `CLIENT-PROGRAM-FULL-AUDIT-R01` policy-fidelity ve cross-cutting risk taramasında tespit edilen **geçmiş** (legacy) CLIENT residual'larının bounded remediation'ıdır; yeni yetenek geliştirmez, Track B'yi başlatmaz.

### 36.1 Program Yapısı ve Canonical SHA'lar

```text
1. CLIENT-SEC-P01 — PORTAL RESET-TOKEN TRANSPORT HARDENING
   CLOSED / CANONICAL / PASS · PR #1613 · squash 7fcd3b98

2. CLIENT-POL-F-R01 — FINANCIAL AGGREGATE POLICY REMEDIATION
   CLOSED / CANONICAL / PASS · PR #1614 · squash 771425d6

3. CLIENT-CONFIG-P01 — HARDCODED LOCALHOST CONFIGURATION REMEDIATION
   CLOSED / CANONICAL / PASS · PR #1617 · squash 24852ac1

4. CLIENT-REMEDIATION-CLOSEOUT-R01 — FINAL RECONCILIATION AND CLOSURE
   bu kayıt
```

### 36.2 Paket 1 — Reset-Token Transport (CLIENT-SEC-P01)

Portal parola sıfırlama token'ı URL **query string**'inde (`?token=`) taşınıyordu: sunucu/proxy/CDN access log'larına yazılır, `Referer` ile dışa sızar, `location.search` okuyan analytics'e görünür; landing page URL'i hiç temizlemediği için ham token tarayıcı geçmişinde de kalıyordu (1 saat TTL penceresi). Aynı sınıf zafiyet OFFICE tarafında `OFFICE-AUTH-P02-HARDENING-R01` (PR #1494, `b9916f5b`) ile fragment'a taşınarak kapatılmış; portal hattı o hardening'in kapsamı dışında kaldığı için güncellenmemişti. **Çözüm:** canonical OFFICE emsalinin en küçük uyarlaması — `#token=` fragment transport, `history.replaceState` ile okuma-sonrası URL temizliği, `useSearchParams` kaldırıldı, query-string fallback BIRAKILMADI, eski `?token=` linkleri kabul edilmez, `/portal/forgot-password` "yeni bağlantı iste" affordance'ı eklendi. Token üretimi/sha256-hash-only persistence/1 saat expiry/tek-kullanımlık atomik tüketim/`tokenVersion` artışı/enumeration-safe generic mesajlar DEĞİŞMEDİ. Schema/migration YOK.

### 36.3 Paket 2 — Financial Aggregate Policy (CLIENT-POL-F-R01)

Üç kalıntı §22.10 ("CLIENT-FACING FINANCIAL AGGREGATES: NOT AUTHORIZED … claimed amount total · collected amount total … `principalAmount` canonical aggregate source DEĞİLDİR"), §22.11 ("BP-06 bu alanları aggregate total'a DÖNÜŞTÜREMEZ … FINANCIAL AGGREGATE VISIBILITY: NOT AUTHORIZED") ve §34.3/§34.4 (Track A yalnız AS-IS gösterim; hesap dökümü/toplam Track B'ye devredilmiştir) ile çelişiyordu: (a) dashboard "Toplam Alacak" = cross-case `Σ principalAmount`, CANLI ve sıfır olmayan; (b) dashboard "Tahsil Edilen" = `Σ collections`, TRACK-B-U00B'de API'den kaldırılan alana bağlı ölü kod (kalıcı yanıltıcı "0 ₺"); (c) case-detail "Toplam Alacak" = `Σ Due.amount`, tek case içinde olsa da türetilmiş toplam. **Üçü de kaldırıldı**; ikame finansal değer/placeholder/tooltip-taşıma/isim-değiştirme YAPILMADI. **Korunanlar:** tekil case `principalAmount` gösterimi (§23.9 single-object PRESENTED OLABİLİR), tekil Due kalemleri AS-IS (§34.2 onaylı 14-alan contract), "Toplam Dosya"/"Aktif Dosya" non-financial sayaçlar (§23.6 "kayıt-sayısı business aggregate DEĞİLDİR"). API/DTO/schema/migration DEĞİŞMEDİ (`principalAmount` ve `dues[].amount` izinli tekil gösterimler ve staff-side tüketiciler için korundu).

### 36.4 Paket 3 — API Base URL Configuration (CLIENT-CONFIG-P01)

Portal bildirim/mesaj/belge yüzeylerindeki **11 çağrı** `NEXT_PUBLIC_API_URL`'i HİÇ okumadan literal `http://localhost:8080` adresine gidiyordu; web ile API farklı origin'deyse istekler kullanıcının kendi localhost'una gidiyor ve `catch` blokları hatayı yutuyordu (sessiz işlevsizlik). **Çözüm:** canonical config katmanı `apps/web/src/lib/config/portal-api-url.ts` (mevcut `lib/config/feature-flags.ts` fail-fast emsali) — env okur + `new URL()` ile doğrular + yalnız http/https kabul eder + trailing slash normalize eder; **development/test:** açık localhost fallback YALNIZ bu katmanda; **production:** env yok/geçersizse sessiz fallback YOK, `console.error` + `throw` ile fail-fast. Relative `/api` modeli elendi (`next.config.js`'de rewrites/proxy YOK, farklı origin → absolute base URL zorunlu). Endpoint path/method/body/`Authorization: Bearer`/blob indirme akışı DEĞİŞMEDİ.

### 36.5 Paket 4 — Closeout Remediation (bu kayıt)

**R1 — token-yokluğu kalıcı spinner (2 dosya).** `messages/page.tsx` ve `documents/page.tsx` içinde `if (!token) return;` ifadesi `try/finally`'den ÖNCE çalıştığı için `setLoading(false)` hiç çağrılmıyor, `loading` başlangıçta `true` olduğundan kullanıcı KALICI spinner görüyordu. `layout.tsx` bu kusurdan muaftır (loading kapanışı ayrı effect'te koşulsuz). **Çözüm:** erken dönüşte de `setLoading(false)` çağrılır; API çağrısı yapılmaması guard'ı AYNEN korunur. Genel auth hook veya loading-state abstraction OLUŞTURULMADI.

**R2 — sekiz portal sayfasında sessiz production localhost fallback.** Module-level `const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8080"` deseni (cases · cases/[id] · forgot-password · login · portal ana sayfa · poas · profile · reset-password) env'i okuduğu için Paket 3'ün 11 literal çağrısı kadar ağır DEĞİLDİ, ancak production env eksikse sessizce kullanıcının localhost'una düşüyordu ve Paket 3'ün config sözleşmesiyle tutarsızdı. Fresh main taraması sekiz dosyanın **tamamının** `"use client"` (aynı browser-only sözleşme, 1 fetch/dosya, query param yok) olduğunu doğruladı → tek bounded migration olarak Paket 3'ün canonical `portalApiUrl()` helper'ına taşındı. **İkinci config helper OLUŞTURULMADI; helper sözleşmesi DEĞİŞTİRİLMEDİ.** Böylece portal production çağrılarının tamamı (11 + 8 = 19) canonical config katmanından geçer.

### 36.6 Residual Disposition Register

```text
R1 Token-yokluğu kalıcı spinner (messages + documents)
   → CLOSED_BY_IMPLEMENTATION (bu kayıt)

R2 Sekiz portal sayfasında sessiz localhost fallback
   → CLOSED_BY_IMPLEMENTATION (bu kayıt)

R3 Governance/audit reconciliation (üç paketin canonical kaydı yoktu)
   → CLOSED_BY_IMPLEMENTATION (bu §36 + decision-log kayıtları)

R4 Üç orphaned fiziksel worktree dizini
   (HUKUK_client_sec_p01, HUKUK_client_pol_f_r01, HUKUK_client_config_p01)
   git registry temiz; fiziksel silme "Filename too long" ile başarısız
   → ACCEPTED_NON_BLOCKING_RESIDUAL (local hygiene; CLIENT/repository blocker DEĞİL)
   → FRESH DISPOSITION (CLIENT-LEGACY-ORPHAN-WORKTREE-DISPOSITION-R01):
     üçü de fresh envanterle SAFE_TO_DELETE bulundu — worktree kaydı yok,
     live process yok, ilgili PR'lar terminal/MERGED (#1613/#1614/#1617,
     origin/main atası doğrulandı), `apps/api/src/` zaten silinmişti (owner
     WIP yok), 14376 reparse point'in tamamı kendi `node_modules\.pnpm\...`
     içine işaret ediyordu (0 external, 0 canonical hedef). Junction-guard
     tekniğiyle (önce reparse point'leri hedefe girmeden link olarak
     kaldır, sonra kalan ağacı sil) güvenle temizlendi; canonical
     node_modules/apps-api-node_modules/package.json/pnpm-lock.yaml
     bütünlüğü her adımda korundu.
     → CLOSED_BY_PHYSICAL_CLEANUP. Ayrıntı:
       `project/docs/governance/coordination-v2/activation/CLIENT-LEGACY-ORPHAN-WORKTREE-DISPOSITION-R01.md`.

R5a 515 pre-existing apps/api tsc --noEmit hatası
   (uyap/** + scripts/** test dosyaları; fresh main'de birebir aynı,
    kanonik build gate `nest build` PASS)
   → TRANSFERRED_TO_SEPARATE_BACKLOG (repository-geneli, CLIENT DIŞI)

R5b 19 staff-side dosyada env + localhost fallback deseni
   → TRANSFERRED_TO_SEPARATE_BACKLOG / OUTSIDE CLIENT PROGRAM

R5c cases/[id]/page.tsx:90 exhaustive-deps lint warning (pre-existing)
   → TRANSFERRED_TO_SEPARATE_BACKLOG (küçük teknik borç, CLIENT blocker DEĞİL)

GOV-REQ-20260725-PILOT-001 mekanik governance rewrite'ı
   (başka bir ajan tarafından yürütüldü: 33af46ea request, ba26f6ad result)
   → CLOSED_BY_CANONICAL_EVIDENCE (bu programın bulgusu DEĞİL)
```

### 36.7 Program Statüsü

**CLIENT / MÜVEKKİL MİMARİSİ — SPRING CLEANING: CLOSED / CANONICAL / PASS.** Dört paketin tamamı merge edildi ve canonical main üzerinde doğrulandı. **Açık CLIENT blocker YOKTUR.** Kalan residual'ların tamamı yukarıda kesin disposition almıştır (`ACCEPTED_NON_BLOCKING_RESIDUAL` veya `TRANSFERRED_TO_SEPARATE_BACKLOG`); hiçbiri `BLOCKING_OPEN` değildir.

### 36.8 Track B Readiness

```text
1.  Açık CLIENT P0/P1 security blocker           : YOK (SEC-P01 kapandı)
2.  Açık Track A financial aggregate ihlali      : YOK (POL-F-R01 kapandı)
3.  Portal production API config blocker         : YOK (CONFIG-P01 + R2 kapandı)
4.  Açık bounded runtime residual                : YOK (R1 kapandı)
5.  Canonical governance kayıtları güncel        : EVET (bu §36 + decision-log)
6.  Track A / Track B sınırı korunuyor           : EVET (§34.3/§34.4 dokunulmadı)
7.  Schema / migration drift                     : YOK (dört pakette de sıfır)
8.  Competing program writer                     : YOK
9.  Canonical main temiz, testler PASS           : EVET
10. Track B'yi engelleyen owner kararı           : §35 "IMPLEMENTATION: NOT
    AUTHORIZED/NOT STARTED" — mimari ratifiye, implementasyon owner-gated

TRACK_B_READY
```

Track B Financial Disclosure implementasyonu **bu kayıtla YETKİLENDİRİLMEZ**. §35'in `IMPLEMENTATION AUTHORITY: NONE` hükmü ve `CLIENT-P2-U03-TRACK-B-I01`'in owner-gated statüsü DEĞİŞMEZ; readiness yalnız "engelleyici CLIENT residual kalmadı" tespitidir.

### 36.9 Closure Self-Check

Bu bölüm: yeni yetenek EKLEMEZ; Track B'yi BAŞLATMAZ veya yetkilendirmez; §5/§6/§8.A/§8.B/§11–§35 substantive hükümlerini DEĞİŞTİRMEZ; geçmiş kanıtı yeniden yazmaz veya silmez (append-only); schema/migration OLUŞTURMAZ; backend endpoint contract'ı DEĞİŞTİRMEZ; auth/tenant mimarisini DEĞİŞTİRMEZ; `CLIENT-P2-U03` programını (§34/§35'te PARTIAL kalan) CLOSED İLAN ETMEZ — kapatılan yalnız **Spring Cleaning remediation programıdır**. **SPRING CLEANING CLOSED ≠ CLIENT-P2-U03 CLOSED · TRACK_B_READY ≠ TRACK B AUTHORIZED · RESIDUAL TRANSFERRED ≠ RESIDUAL FIXED.**

## 37. CLIENT Phase 2 Track B I01 — Financial Disclosure Data Foundation Technical Closure (OWNER RATIFIED)

Bu bölüm, §35'te ratifiye edilen Track B Financial Disclosure mimarisinin **veri temeli** diliminin (`CLIENT-P2-U03-TRACK-B-I01`) teknik kapanış kaydıdır (`decision-log.md` CLIENT-P2-U03-TRACK-B-I01 kaydı). §5, §6, §8.A, §8.B, §11–§36 substantive hükümlerini DEĞİŞTİRMEZ. §35'in ve §36.8'in "`CLIENT-P2-U03-TRACK-B-I01`: owner-gated / NOT AUTHORIZED / NOT STARTED" ifadeleri bu kayıtla owner tarafından ayrıca yetkilendirilip **yalnız I01 dilimi için** kapatılmıştır — **§35'in ve §36'nın kendi metinleri DEĞİŞTİRİLMEMİŞTİR**. **TRACK B (genel) BU KAYITLA CLOSED İLAN EDİLMEZ — kapatılan yalnız veri temeli (I01) dilimidir; API/service/authorization projection/UI/dashboard/disclosure publication dilimleri OPEN ve NOT AUTHORIZED kalır.**

### 37.1 Canonical Kimlik ve SHA

```text
TASK          : CLIENT-P2-U03-TRACK-B-I01
TASK CLASS    : SCHEMA + DATABASE MIGRATION + MODEL-LEVEL CONSTRAINTS
PR            : #1629
SQUASH SHA    : 32a42ed4425083585dce06b447dc4a175deb2985
MERGED        : 2026-07-27 (origin/main)
DIFF          : 3 dosya, +777 / -5
CANONICAL SRC : bu charter §35 (owner-ratified mimari, 21 karar alani + alti owner karari)
```

Kapsam: `project/apps/api/prisma/schema.prisma` · yeni migration `20260726190741_client_p2_u03_track_b_i01_financial_disclosure_foundation` · yeni db-gated model-invariant spec'i. **Yeni runtime service/controller/resolver/UI dosyasi YOK. Yeni dependency YOK.**

### 37.2 Eklenen Model Yüzeyi

§35.5'in birebir uygulanmasıdır: `ClientFinancialDisclosure` (kararlı aggregate kimliği; tenant/case/case-client sahipliği; `CollectionDisposition` idempotency anchor'ı; current-effective versiyon işaretçisi) → `ClientFinancialDisclosureVersion` (§35.4 kopyalanan kaynak değerleri, yaşam döngüsü, §35.8 ofis onayı bağlaması, §35.9 içerik onayı, §35.10/§35.11 gönderim ve yayınlama kanıtı, §35.13 supersession/reversal) → `ClientFinancialDisclosureLine` (normalize dağıtım satırları + kaynak-satır izlenebilirliği). Mevcut beş modele yalnız back-relation satırı eklendi (`Tenant`, `Case`, `CaseClient`, `CollectionDisposition`, `CollectionDispositionLine`); bu modellerin hiçbir mevcut alanı, ilişkisi veya semantiği DEĞİŞMEDİ.

`ClientFinancialDisclosureStatus` enum'u §35.7'nin **açıkça saydığı on bir durumu** taşır: `DRAFT` · `OFFICE_APPROVAL_PENDING` · `OFFICE_APPROVED` · `CONTENT_APPROVAL_PENDING` · `CONTENT_APPROVED` · `SEND_PENDING` · `SEND_FAILED` · `PUBLISHED` · `CANCELLED` · `SUPERSEDED` · `REVERSED`. **Ayrı kalıcı `SENT` durumu OLUŞTURULMADI** — §35.7 + §35.11'in üçüncü owner kararı gereği gönderim kanıtı alan seviyesinde (`sendIdempotencyKey`/`providerMessageId`/`providerAcceptedAt`) tutulur, kalıcı client-visible durum yalnız `PUBLISHED`'dır. §35.3'ün `UNSUPPORTED_SCOPE` sonucu bir **durum değil bir sonuçtur**, bu nedenle enum'da temsil EDİLMEDİ. **Canonical kaynakta bulunmayan hiçbir lifecycle, enum, status veya authorization alani UYDURULMADI.**

### 37.3 Tenant Sahipliği ve Referential Integrity

Üç modelin hepsinde `tenantId` NOT NULL + `Tenant` FK `Restrict`; her modelde `@@unique([tenantId, id])` (bileşik tenant FK hedefi). `Case` bağlaması **tenant-scoped bileşik FK**'dir (`[tenantId, caseId]` → `Case[tenantId, id]`) — cross-tenant `caseId` ataması **veritabanı seviyesinde reddedilir**; bu, repository'de on yedi modelde kullanılan canonical desendir (`ClaimFormationSnapshot`, `PasswordResetToken`, `Collection` vb.). Versiyon→kök, versiyon supersession (self-relation) ve satır→versiyon bağları da bileşik tenant FK'dir. `CaseClient`'te `tenantId` kolonu **bulunmadığından** (tenant `Case` üzerinden türetilir) oraya plain FK + `Restrict` uygulanmıştır (`ClientPayoutAllocation` emsali); **bu bir tenant-güvenlik iddiası DEĞİLDİR** — `caseClientId`'nin tenant tutarlılığı servis katmanında doğrulanmalıdır. `officeApprovalRequestId` **scalar**'dır, FK kurulmaz (`CollectionDisposition`'ın cross-module FK kurmama konvansiyonu).

**On bir FK'nin tamamı `onDelete: Restrict`'tir**; `onDelete: Cascade`/`SetNull`/`NoAction` sayısı sıfırdır. Finansal ve audit geçmişi cascade ile silinemez, orphan disclosure oluşamaz (§35.18). Migration'daki on bir `ON UPDATE CASCADE` Prisma'nın canonical referential-update default'udur (repository'de kırk beş migration dosyasında aynı); `ON DELETE CASCADE` sayısı **sıfırdır**.

### 37.4 Constraint Yüzeyi

§35.12'nin zorunlu kıldığı constraint'ler eksiksiz uygulanmıştır: `@@unique([tenantId, collectionDispositionId])` (dispozisyon başına tek disclosure — idempotency) · `@@unique([tenantId, disclosureId, version])` (versiyon numarası tekilliği) · `@@unique([tenantId, sendIdempotencyKey])` (çift gönderim engeli) · `@@unique([tenantId, supersedesVersionId])` (bir versiyon yalnız bir kez supersede edilir) · `@@unique([tenantId, officeApprovalRequestId])` (bir ofis onayı yalnız bir kez tüketilir) · `currentVersionId @unique` · `@@unique([tenantId, id])` ×3.

**V1 kapsam enforcement'ı (§35.3, fail-closed):** `caseClientId` NOT NULL'dur. `CASE_CREDITOR_CLUSTER` dispozisyonlarının `caseClientId`'si null olduğundan cluster kapsamı için disclosure oluşturmak **yapısal olarak imkânsızdır**; bir client sahibi asla çıkarsanmaz. Bu, ikinci owner kararının model seviyesindeki desteğidir — `UNSUPPORTED_SCOPE` sonucunun servis katmanında üretilmesi gereği ORTADAN KALKMAZ.

### 37.5 Para ve Para Birimi

Beş para kolonu `Decimal @db.Decimal(15,2)` (veritabanında `numeric(15,2)` olarak doğrulandı) ve `currency @default("TRY")` üç modelde ayrı ayrı taşınır. `Float` sayısı **sıfırdır**; gizli global currency varsayımı YOKTUR. Mevcut `Collection`/`CollectionDisposition`/`CollectionDispositionLine`/`ClientPayout` hassasiyetiyle birebir aynıdır (§35.16).

### 37.6 Yaşam Döngüsü ve Immutability — Dürüst Sınır

`status @default(DRAFT)`: yeni kayıt **asla** published, client-görünür veya approved değildir — güvenli varsayılan model seviyesindedir.

**Bu kayıt tam satır immutability'si İDDİA ETMEZ.** §35.6 gereği finansal snapshot alanları oluşturulduktan sonra değişmez; ancak yaşam döngüsü damgaları (`publishedAt`, `supersededAt`, `providerMessageId`, `sendFailureCode` vb.) **aynı satıra** yazıldığından satır veritabanı seviyesinde tamamen immutable **DEĞİLDİR**. `snapshotHash` · `sourceFingerprint` · `notificationContentHash` alanları hazırdır, fakat hash yeniden-doğrulaması, stale-onay reddi ve TOCTOU koruması **servis katmanı işidir ve bu kayıtla uygulanmamıştır**. **SCHEMA IMMUTABILITY FIELDS PRESENT ≠ IMMUTABILITY ENFORCED.**

### 37.7 Kanıt ve CI Enforcement

`track-b-i01-schema-foundation.db-gated.integration.spec.ts` — **18 model-seviyesi invariant testi**, gerçek PostgreSQL 16 üzerinde (disposable Docker, repo-pinned `postgres:16-alpine`; production veya local-development veritabanına dokunulmadı): geçerli minimum kayıt · güvenli `DRAFT` varsayılanı · required parent · invalid FK · cross-tenant case reddi · cross-tenant versiyon reddi · beş unique ihlali · `Decimal(15,2)` hassasiyeti · invalid line enum · invalid status enum · RESTRICT/cascade-yok/orphan-yok · §35.3 cluster yapısal imkânsızlığı · current-version işaretçisi. Migration rehearsal: temiz veritabanı (tüm canonical migration zinciri + I01) PASS ve mevcut şema + temsili yerel veri üzerinde PASS (satırlar korundu, tutarlar byte-exact). Migration statik profili: bir CreateEnum, üç CreateTable, yirmi CreateIndex, on bir AddForeignKey; `DROP TABLE`/`DROP COLUMN`/`RENAME`/`DELETE`/`TRUNCATE`/mevcut kolonda `SET NOT NULL` sayısı **sıfır**; historical migration DEĞİŞTİRİLMEDİ.

**CI ENFORCEMENT — BU KAYITLA KAPATILAN RESIDUAL:** PR #1629 merge edildiğinde bu spec **hiçbir CI manifest'inde kayıtlı değildi**, dolayısıyla CI'da **hiç koşmuyordu**; CI'ın jest çağrılarının hiçbiri catch-all olmadığı için allowlist dışındaki spec sessizce çalışmaz. Sebep kaydedilmiştir: #1629 ilk halinde `.github/workflows/ci.yml`'e explicit step ekliyordu ve GOV-COORD-V1 guard'ı bunu `CONTROL_PLANE_SCOPE_FORBIDDEN: non-bootstrap control-plane diff` ile reddetti (ci.yml, PR #1591 ile `coordinationControlPlane` listesine alınmıştır); step o PR'dan çıkarıldı ve CI enforcement'ı açık residual olarak beyan edildi. Bu kayıtla spec, binding gerektirmeyen canonical yola bağlanmıştır: `project/apps/api/ci-manifests/db/domain-integration.txt`. **YENİ CI STEP AÇILMADI, ci.yml'e DOKUNULMADI, CI-8 jest-invocation bütçesi TÜKETİLMEDİ** (mevcut manifest'e spec satırı eklemek bütçe harcamaz).

### 37.8 Migration Live-Apply Dispozisyonu

`pending-migration-coordination-register.md` bu migration'ı cross-workstream görünürlük kaydı olarak taşır ve live-apply durumunu `UNKNOWN / OWNER VERIFICATION REQUIRED` olarak gösterir. **Bu kayıt o durumu DEĞİŞTİRMEZ**: gerçek veritabanına bağlanılmamış, hiçbir credential okunmamıştır. **MIGRATION MERGED ≠ MIGRATION APPLIED.** Live-apply doğrulaması owner/operasyon işidir.

### 37.9 Statü Kesinliği

```text
CLIENT-P2-U03-TRACK-B-I01 : AUTHORIZED / IMPLEMENTED / VERIFIED / MERGED / CANONICAL
PR #1629, squash 32a42ed4

TRACK B ARCHITECTURE      : RATIFIED/CANONICAL (§35, degismedi)
TRACK B DATA FOUNDATION   : CLOSED/CANONICAL (bu kayitla)
TRACK B API / SERVICE     : NOT AUTHORIZED / NOT STARTED
TRACK B AUTHORIZATION
PROJECTION                : NOT AUTHORIZED / NOT STARTED
TRACK B UI / DASHBOARD    : NOT AUTHORIZED / NOT STARTED
TRACK B DISCLOSURE
PUBLICATION RUNTIME       : NOT AUTHORIZED / NOT STARTED

TRACK A                   : CLOSED/CANONICAL (§34, degismedi)
CLIENT-P2-U03 (genel)     : PARTIAL — NOT READY FOR FINAL CLOSURE
SPRING CLEANING (§36)     : CLOSED/CANONICAL/PASS (degismedi)

RUNTIME                   : UNCHANGED
CLIENT-VISIBLE FINANCIAL
DATA                      : NONE
MIGRATION LIVE-APPLY      : UNKNOWN / OWNER VERIFICATION REQUIRED
IMPLEMENTATION AUTHORITY  : NONE (bu kayitla — sonraki dilimler icin)
NEXT                      : OWNER-GATED / NOT AUTO-STARTED
```

Korunan invariant'lar:

```text
SCHEMA EXISTS       != DATA MAY BE DISCLOSED
DATA EXISTS         != CLIENT IS AUTHORIZED TO VIEW IT
I01 CLOSED          != TRACK B FULLY IMPLEMENTED
I01 SCHEMA READY    != CLIENT DISCLOSURE AUTHORIZED
TRACK_B_READY       != ALL TRACK B IMPLEMENTATION AUTHORIZED
MIGRATION MERGED    != MIGRATION APPLIED
NO CLIENT-VISIBLE FINANCIAL DATA YET
```

### 37.10 Register Düzeltmesi

`spring-cleaning/PROGRAM-WIDE-MERGED-BUT-UNCLOSED-REGISTER-R01.md`, `CLIENT-P2-U03-TRACK-B-I01`'i "kapanışı DOĞRULANAN merged PR'lar" listesinde göstermiştir. Bu tespit yazıldığı anda **yanlıştı**: `decision-log.md`'de `recordId=CLIENT-P2-U03-TRACK-B-I01` taşıyan bir satır YOKTU, bu charter'da bir I01 teknik kapanış bölümü YOKTU, ve §35 hâlâ `TRACK B IMPLEMENTATION: NOT AUTHORIZED/NOT STARTED` + `SCHEMA/MIGRATION: NONE` diyordu. I01 kodda merged, governance'ta ise **açık** durumdaydı. Gerçek kapanış bu kayıtla yapılmıştır. İlgili register'a bu düzeltme **hiçbir statü alanı değiştirilmeden** dipnot olarak işlenmiştir. **MERGED ≠ CLOSED; REGISTER CLAIM ≠ VERIFIED FACT.**

### 37.11 Closure Self-Check

Bu bölüm: Track B'nin API/service/authorization projection/UI/dashboard/disclosure publication dilimlerini BAŞLATMAZ veya yetkilendirmez; `CLIENT-P2-U03`'ü (§34/§35'te PARTIAL kalan) CLOSED İLAN ETMEZ; §35'in veya §36'nın kendi metnini DEĞİŞTİRMEZ; yeni lifecycle/enum/status/authorization alanı ÜRETMEZ; canonical enum adı UYDURMAZ; Track A davranışını DEĞİŞTİRMEZ; Receivable/Collection/Claim/Due/Payment semantiğine DOKUNMAZ; migration live-apply durumunu `APPLIED` İLAN ETMEZ; `pending-migration-coordination-register.md`'nin live-apply alanlarını DEĞİŞTİRMEZ; POL-E/POL-J'yi yeniden AÇMAZ; OFFICE CAP-02/OD-08/STF-PRD statülerini DEĞİŞTİRMEZ; yeni risk kartı AÇMAZ; yeni dependency EKLEMEZ; `.github/workflows/ci.yml`'e DOKUNMAZ; yeni CI step AÇMAZ; schema veya migration DEĞİŞTİRMEZ (implementasyon zaten PR #1629 ile ayrı merge edildi — bu kayıt governance kapanışı + CI enforcement bağlamasıdır). **TECHNICAL DATA FOUNDATION CLOSED ≠ TRACK B CLOSED; IMPLEMENTATION AUTHORITY: NONE (sonraki dilimler için).**

## 38. CLIENT Phase 2 Track B I02 — Disclosure Service Foundation and Invariant Enforcement (OWNER RATIFIED, RATIFICATION-ONLY)

Bu bölüm, §35'te ratifiye edilen Track B mimarisinin **ilk post-schema implementasyon diliminin** canonical kimliğini ve bağlayıcı sözleşmesini ratifiye eder (`decision-log.md` `CLIENT-P2-U03-TRACK-B-I02` kaydı). §5, §6, §8.A, §8.B, §11–§37 substantive hükümlerini DEĞİŞTİRMEZ; §35'in, §36'nın ve §37'nin **kendi metinleri DEĞİŞTİRİLMEMİŞTİR**.

**BU BÖLÜM RATIFICATION-ONLY'DİR.** Hiçbir kod, schema, migration, test veya CI değişikliği içermez ve I02 implementasyonunu BAŞLATMAZ.

### 38.1 Task Kimliği

```text
TASK ID    : CLIENT-P2-U03-TRACK-B-I02
TASK TITLE : DISCLOSURE SERVICE FOUNDATION AND INVARIANT ENFORCEMENT
PROGRAM    : CLIENT / MUVEKKIL — TRACK B FINANCIAL DISCLOSURE
ONCEKI     : CLIENT-P2-U03-TRACK-B-I01 (§37, CLOSED/CANONICAL)
STATUS     : RATIFIED / CANONICAL
EXECUTION  : OWNER-GATED / NOT STARTED
```

Bu kimlik tekildir. `I02A`, `S01`, `R01` gibi alternatif veya paralel bir kimlik ÜRETİLMEMİŞTİR ve üretilmeyecektir.

### 38.2 Objective

Track B disclosure şeması üzerinde çalışan, **henüz hiçbir API veya UI'a bağlanmamış** service-level domain temelini kurmak: aggregate/version/line oluşturma zinciri, tenant tutarlılığı, canonical snapshot ve içerik hash'i, idempotency ve eşzamanlılık koruması, transaction sınırı ve fail-closed lifecycle guard'ları.

I02'nin varlık sebebi, §37.3 ve §37.6'nın **bilinçli olarak servis katmanına bıraktığı** iki invariant'ı kapatmaktır: `caseClientId` tenant tutarlılığı ve yayınlanmış/snapshot içeriğin immutability + hash yeniden-doğrulaması.

### 38.3 In-Scope Contract

1. Disclosure aggregate oluşturma service contract'ı.
2. Disclosure version ve disclosure line oluşturma zinciri.
3. Tenant consistency enforcement.
4. `Case`, `CaseClient`, kaynak disposition ve tenant ilişki doğrulaması.
5. Fail-closed ownership kontrolleri.
6. Canonical snapshot üretimi.
7. Deterministik canonical content serialization.
8. Content hash üretimi ve persistence.
9. Hash re-verification contract'ı.
10. Version sequence / idempotency enforcement.
11. Duplicate creation ve concurrent-version race prevention.
12. Transaction boundary.
13. Append / version / supersession invariant'ları.
14. Lifecycle transition guard foundation.
15. Published/approved içerik üzerinde yetkisiz mutation reddi.
16. Model-seviyesi constraint hatalarının güvenli, tiplenmiş domain hatalarına çevrilmesi.
17. Pozitif, negatif ve concurrency testleri.
18. Audit / provenance kayıtlarının korunması.

Kabul edilebilir dosya türleri: domain service · application service · repository interface · Prisma repository implementasyonu · transaction boundary · typed domain errors · hash/canonicalization helper · tenant invariant kontrolleri · idempotency enforcement · service-level unit/integration/concurrency testleri.

### 38.4 Out-of-Scope Contract

```text
HTTP controller · REST endpoint · GraphQL resolver · client-facing API
portal UI · dashboard · finansal kart · authorization projection
office approval runtime · notification gonderimi · publication runtime
e-posta · portal inbox teslimi · Track A degisikligi
migration apply operasyonu · yeni schema · yeni migration · yeni dependency
```

```text
I02 SERVICE EXISTS      != DISCLOSURE IS CLIENT-VISIBLE
DISCLOSURE RECORD EXISTS != DISCLOSURE MAY BE PUBLISHED
CONTENT HASH EXISTS     != CONTENT IS APPROVED
I02 CLOSED              != TRACK B FULLY IMPLEMENTED
```

### 38.5 Tenant Consistency Contract

I02 implementasyonu şunları zorunlu tutar:

- `tenantId` ile `caseId` aynı tenant'a ait olmalıdır.
- `caseClientId` seçilen case'e bağlı olmalıdır.
- `CaseClient` üzerinden bağlanan `Client`, canonical disclosure owner'ı ile uyumlu olmalıdır.
- Kaynak `CollectionDisposition` ve kaynak satırlar aynı tenant/case/client sınırında olmalıdır.
- Cross-tenant ID kombinasyonları, transaction başlamadan veya herhangi bir write gerçekleşmeden **fail-closed** reddedilmelidir.
- Kullanıcıdan gelen serbest `tenantId` / `caseId` / `caseClientId` kombinasyonuna güvenilmez.
- Tenant ilişkileri repository sorgularıyla yeniden doğrulanır.
- "ID mevcutsa kabul et" modeli (IDOR'a açık) KULLANILMAZ.

Gerekçe: §37.3'te kayıtlı olduğu üzere `CaseClient` tablosunda `tenantId` kolonu **yoktur**; oradaki bağ plain FK + `Restrict`'tir ve **veritabanı seviyesinde bir tenant güvencesi sağlamaz**. Bu boşluğu kapatmak I02'nin birincil sorumluluğudur.

### 38.6 Snapshot / Hash Contract

- Disclosure version, kaynak finansal değerlerin **snapshot**'ıdır (§35.4).
- Kaynak kayıtlar sonradan değişse bile eski version **sessizce değişmez**.
- Content hash, canonical serialization üzerinden **deterministik** üretilir.
- Aynı içerik aynı hash'i üretir; alan sırası, locale veya object key sırası hash'i değiştirmez.
- Persist edilmiş hash, approval / send / publication öncesinde yeniden doğrulanabilecek biçimde saklanır.
- Hash uyuşmazlığı **fail-closed** sonuç üretir.

Şema tarafı hazırdır: `snapshotHash`, `sourceFingerprint`, `notificationContentHash` alanları I01 ile mevcuttur; **alanların varlığı enforcement DEĞİLDİR** (§37.6).

### 38.7 Immutability Contract

- Approved/published içerik **yerinde güncellenmez**; yeni version + supersession zinciri kullanılır.
- Service-level mutation guard açıkça test edilir.
- §35.13'ün supersession/reversal semantiği korunur; `@@unique([tenantId, supersedesVersionId])` ile bir versiyonun yalnız bir kez supersede edilebilmesi DB tarafından zaten garanti altındadır (§37.4).
- Satırın DB seviyesinde tam immutable OLMADIĞI (yaşam döngüsü damgaları aynı satıra yazılır — §37.6) bilinerek, immutability servis katmanında enforce edilir.

### 38.8 Concurrency / Idempotency Contract

Kapsanması zorunlu yarış durumları:

```text
ayni source icin es zamanli iki aggregate create
ayni disclosure icin es zamanli version create
ayni version number uretimi
ayni idempotency key kullanimi
ayni source line'in duplicate eklenmesi
ayni active/current version'in iki kez atanmasi
```

Enforcement **yalnız** `findFirst` + `create` gibi race'e açık application kontrolüne dayanamaz. DB unique constraint + transaction + hata eşlemesi **birlikte** kullanılır. I01'in sağladığı unique kümesi (§37.4) bu enforcement'ın temelidir. Repository'nin canonical transaction ve retry precedent'i izlenir.

### 38.9 Transaction Contract

Aggregate + version + line oluşturma **tek bir transaction** içinde tamamlanır; kısmi yazım bırakılmaz. Transaction sınırı service katmanında açıkça tanımlanır ve testle kanıtlanır. Constraint ihlalleri (P2002 vb.) transaction sınırında yakalanıp tiplenmiş domain hatalarına çevrilir; ham Prisma hatası çağırana sızmaz.

### 38.10 Safe Lifecycle Boundary

I02 **yapabilir**: DRAFT üretimi · version creation · validation · supersession hazırlığı · immutable snapshot enforcement.

I02 **yapamaz**: office approval request gönderme · content approval tamamlama · send · publish · revoke notification · client portal disclosure.

`ClientFinancialDisclosureStatus` enum'unda 11 durumun tanımlı olması, bu geçişlerin I02 içinde aktive edilebileceği anlamına **gelmez**. Her transition ayrı bounded task ile yetkilendirilir.

### 38.11 Live Migration Execution Gate

Phase A salt-okuma doğrulaması (`pending-migration-coordination-register.md` §21, 2026-07-28):

```text
LIVE MIGRATION STATUS:
NOT_APPLIED

LIVE APPLY PRECONDITION:
NOT SATISFIED

BLOCKER:
I01_LIVE_MIGRATION_NOT_APPLIED

IMPLEMENTATION / DEPLOYMENT:
DO NOT START UNTIL SEPARATE MIGRATION APPLY AUTHORITY
```

I01 migration'ı canonical `main`'de mevcuttur fakat doğrulanan hedef veritabanında (`hukuk_db` @ `localhost:5432`) **uygulanmamıştır**: `_prisma_migrations` kaydı yok, 0/3 tablo, enum yok, kısmi uygulama izi yok, 102/102 checksum uyumlu, ghost kayıt yok. I02 kodu yazılabilir hale gelmeden önce migration'ın ayrı bir owner-gated operasyonla uygulanması gerekir.

**Bu bölüm migration uygulama yetkisi ÜRETMEZ.**

### 38.12 Acceptance Gates

I02'nin implementasyona alınabilmesi için:

1. I01 schema canonical `main`'de mevcut — **KARŞILANDI** (§37).
2. I01 migration status kesin — **KARŞILANDI** (`NOT_APPLIED`, register §21).
3. Live apply `APPLIED` **veya** implementation planında açık deployment gate — **§38.11 ile gate açıkça yazıldı**.
4. Tenant consistency modeli exact — §38.5.
5. `CaseClient` tenant sınırı service-level enforce edilecek — §38.5.
6. Snapshot source chain exact — §38.6 + §35.4.
7. Canonical serialization ve hash algoritması belirli — I02 planında belirlenecek, §38.6 sözleşmesine uyacak.
8. Hash re-verification noktaları belirli — approval / send / publication öncesi (§38.6).
9. Transaction sınırı belirli — §38.9.
10. Idempotency key kapsamı belirli — `@@unique([tenantId, sendIdempotencyKey])` (§37.4) + §38.8.
11. Version uniqueness ve race handling belirli — §38.8.
12. Published/approved mutation politikası belirli — §38.7.
13. UI / API / publication kapsam dışı — §38.4.
14. Test ve güvenlik gereksinimleri belirli — §38.3/17 + §38.8.
15. Implementation authority ayrıca verilmeden kod başlatılmayacak — §38.13.

### 38.13 Implementation Authority

```text
IMPLEMENTATION AUTHORITY:
NONE
```

Bu bölüm ile I02 branch'i açılmaz, worktree oluşturulmaz, service dosyası veya test scaffold'u yazılmaz, schema değiştirilmez, migration üretilmez, API/UI taslağı eklenmez. **RATIFICATION ≠ IMPLEMENTATION.**

### 38.14 Stop Conditions

I02 implementasyonu ileride yetkilendirildiğinde şu durumlarda durulur: I01 migration'ı hedef ortamda hâlâ uygulanmamışsa ve deployment gate açılmamışsa · tenant/snapshot/hash/immutability için owner kararı gerektiren birden fazla makul model çıkarsa · schema veya migration değişikliği zorunlu görünürse · API/UI/publication olmadan service güvenli tamamlanamıyorsa · genel authorization mimarisi değişikliği gerekirse · cross-domain Receivable/Collection refactor'u gerekirse · competing writer varsa · yeni dependency zorunlu olursa.

### 38.15 Status ve Self-Check

```text
CLIENT-P2-U03-TRACK-B-I02 : RATIFIED / CANONICAL
EXECUTION                 : OWNER-GATED / NOT STARTED
IMPLEMENTATION AUTHORITY  : NONE
LIVE MIGRATION PRECONDITION: NOT SATISFIED (I01_LIVE_MIGRATION_NOT_APPLIED)

TRACK B ARCHITECTURE      : RATIFIED/CANONICAL (§35, degismedi)
TRACK B DATA FOUNDATION   : CLOSED/CANONICAL (§37, degismedi)
TRACK B SERVICE FOUNDATION: RATIFIED / NOT STARTED (bu kayitla)
TRACK B API / UI / DASHBOARD / AUTHORIZATION PROJECTION /
PUBLICATION RUNTIME       : NOT AUTHORIZED / NOT STARTED
TRACK A (§34) · SPRING CLEANING (§36) : degismedi
CLIENT-P2-U03 (genel)     : PARTIAL — NOT READY FOR FINAL CLOSURE
RUNTIME: UNCHANGED · CLIENT-VISIBLE FINANCIAL DATA: NONE
```

Bu bölüm: I02 implementasyonunu BAŞLATMAZ veya yetkilendirmez; migration uygulama yetkisi ÜRETMEZ; Track B'nin API/UI/publication dilimlerini AÇMAZ; `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ; §35/§36/§37'nin kendi metinlerini DEĞİŞTİRMEZ; I01 statüsünü DEĞİŞTİRMEZ; Spring Cleaning kayıtlarını DEĞİŞTİRMEZ; Track A sınırını DEĞİŞTİRMEZ; yeni lifecycle/enum/status alanı ÜRETMEZ; `pending-migration-coordination-register.md` §19/§20'nin metinlerini DEĞİŞTİRMEZ; başka programların (RCV / OFFICE / T5 / DX-006 / UYAP / DEBTOR) kayıtlarına DOKUNMAZ; kod, schema, migration, test veya CI DEĞİŞTİRMEZ.

**SCHEMA EXISTS ≠ DATA MAY BE DISCLOSED · MIGRATION MERGED ≠ MIGRATION APPLIED · RATIFIED ≠ AUTHORIZED TO IMPLEMENT · NO CLIENT-VISIBLE FINANCIAL DATA YET.**

## 39. CLIENT Phase 2 Track B — I01 Live-Apply Factual Reconciliation ve I02 Blocker Kaldırılması (OWNER RATIFIED, RECONCILIATION-ONLY)

Bu bölüm, §37'de teknik olarak kapatılan `CLIENT-P2-U03-TRACK-B-I01` migration'ının **fiilen uygulanmış** olduğunu kayda geçirir ve §38.11'de yazılı `I01_LIVE_MIGRATION_NOT_APPLIED` blocker'ını kaldırır (`decision-log.md` `CLIENT-P2-U03-TRACK-B-I01-LIVE-APPLY` kaydı; `pending-migration-coordination-register.md` §22).

§5, §6, §8.A, §8.B, §11–§38 substantive hükümlerini DEĞİŞTİRMEZ; **§37'nin ve §38'in kendi metinleri DEĞİŞTİRİLMEMİŞTİR.** **BU BÖLÜM RECONCILIATION-ONLY'DİR** — hiçbir kod, schema, migration, test veya CI değişikliği içermez ve I02 implementasyonunu BAŞLATMAZ.

### 39.1 I01 Live Migration Dispozisyonu

```text
CLIENT-P2-U03-TRACK-B-I01

SCHEMA / MIGRATION          : MERGED / CANONICAL   (§37, degismedi)
LIVE MIGRATION              : APPLIED
LIVE MIGRATION PRECONDITION : SATISFIED

target                      : localhost:5432 / hukuk_db  (PostgreSQL 16.14, primary)
migration                   : 20260726190741_client_p2_u03_track_b_i01_financial_disclosure_foundation
checksum (ilk 16)           : af3c84ac17e13e8d
finished_at                 : 2026-07-28 00:33:21.733 UTC
repository SHA              : 32a42ed4 (PR #1629) · governance closure f16202a6 (PR #1705)

APPLY ATTRIBUTION           : UNATTRIBUTED / NOT DETERMINED
PRE-APPLY SAFETY EVIDENCE   : NOT AVAILABLE
```

Apply, `MIGRATION-TRAIN-20260728-PENDING-FOUR-LIVE-APPLY-R01` görevi devralmadan **önce**, kimliği belirlenemeyen tek bir `migrate deploy` koşusunda gerçekleşmiştir; o görev bu nedenle `BLOCKED / COMPETING_MIGRATION_OPERATION` ile durdurulmuş ve hedefe **hiçbir yazma yapmamıştır**. Ayrıntı ve incident kaydı: register §22.

### 39.2 I01 Canlı Şema Doğrulaması

Salt-okuma ile canlı hedefte doğrulandı — §37'nin canonical sözleşmesiyle **birebir**:

```text
tablolar                  : 3/3   ClientFinancialDisclosure · ...Version · ...Line
ClientFinancialDisclosureStatus : 11/11 durum (§35.7'nin saydigi kume)
FK delete_rule            : RESTRICT = 11/11   (ON DELETE CASCADE = 0)
para kolonlari            : numeric(15,2) x5   (Float/double = 0)
index                     : 13 unique / 23 toplam
I01 bakimindan beklenmeyen drift : YOK
```

### 39.3 I02 Blocker Dispozisyonu

```text
CLIENT-P2-U03-TRACK-B-I02
— DISCLOSURE SERVICE FOUNDATION AND INVARIANT ENFORCEMENT

STATUS                      : RATIFIED / CANONICAL      (§38, degismedi)
EXECUTION                   : OWNER-GATED / NOT STARTED
LIVE MIGRATION PRECONDITION : SATISFIED
BLOCKER                     : NONE
IMPLEMENTATION AUTHORITY    : NONE
```

§38.11'in `BLOCKER: I01_LIVE_MIGRATION_NOT_APPLIED` hükmü bu kayıtla **karşılanmış ve kaldırılmıştır** — §38'in kendi metni değiştirilmemiş, blocker bu ayrı kayıtla kapatılmıştır (§28.7/§29/§37 emsali).

**I02 implementasyonu bu kayıtla YETKİLENDİRİLMEZ.** §38.13'ün `IMPLEMENTATION AUTHORITY: NONE` hükmü aynen korunur; kod başlatılması için ayrı, task-bounded owner yetkisi gerekir.

### 39.4 UYAP POA Drift'inin CLIENT Üzerindeki Etkisi

Aynı apply koşusunda uygulanan `20260726210000_uyap_poa_tenant_safety_i01` migration'ı, `schema.prisma`'da tanımlı iki Tenant FK'sini (`ClientPowerOfAttorney_tenantId_fkey`, `PoaLawyer_tenantId_fkey`) üretmemiştir; bu drift **açıktır** ve `UYAP-POA-TENANT-FK-DRIFT-REMEDIATION-R01` ile ayrıca kapatılacaktır.

```text
UYAP POA DRIFT != CLIENT I01 LIVE MIGRATION NOT APPLIED
CLIENT I02 IMPACT: NONE
```

Bu drift bir **UYAP tenant-integrity blocker'ıdır**; CLIENT I02'nin migration precondition'ını açık tutmaz.

### 39.5 Statü ve Self-Check

```text
TRACK B ARCHITECTURE        : RATIFIED / CANONICAL       (§35, degismedi)
TRACK B DATA FOUNDATION     : CLOSED / CANONICAL          (§37, degismedi)
TRACK B I01 LIVE            : APPLIED                     (bu kayitla)
TRACK B SERVICE FOUNDATION  : RATIFIED / NOT STARTED · BLOCKER NONE (bu kayitla)
TRACK B API / UI / DASHBOARD / AUTHORIZATION PROJECTION /
PUBLICATION RUNTIME         : NOT AUTHORIZED / NOT STARTED
TRACK A (§34) · SPRING CLEANING (§36) : degismedi
CLIENT-P2-U03 (genel)       : PARTIAL — NOT READY FOR FINAL CLOSURE
RUNTIME: UNCHANGED · CLIENT-VISIBLE FINANCIAL DATA: NONE
IMPLEMENTATION AUTHORITY    : NONE
```

Bu bölüm: I02 implementasyonunu BAŞLATMAZ veya yetkilendirmez; migration uygulama yetkisi ÜRETMEZ; geçmişteki unattributed apply'ı **retroaktif olarak ratifiye ETMEZ** ve onun hakkında olmayan bir güvence üretmez; Track B'nin API/UI/publication dilimlerini AÇMAZ; `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ; §35/§36/§37/§38'in kendi metinlerini DEĞİŞTİRMEZ; UYAP POA drift'ini KAPATMAZ; diğer dört migration'ın program statülerini DEĞİŞTİRMEZ; Bank constraint-name drift'ini DÜZELTMEZ; kod, schema, migration, test veya CI DEĞİŞTİRMEZ.

**I01 APPLIED ≠ CLIENT DATA MAY BE DISCLOSED · I02 RATIFIED ≠ I02 IMPLEMENTATION AUTHORIZED · APPLIED ≠ SAFELY APPLIED · CLIENT-VISIBLE FINANCIAL DATA: NONE.**

## 40. CLIENT Phase 2 Track B I02 — Disclosure Service Foundation Technical Closure (OWNER RATIFIED)

Bu bölüm, §38'de ratifiye edilen `CLIENT-P2-U03-TRACK-B-I02` sözleşmesinin **teknik kapanış** kaydıdır (`decision-log.md` `CLIENT-P2-U03-TRACK-B-I02-CLOSURE` kaydı). §5, §6, §8.A, §8.B, §11–§39 substantive hükümlerini DEĞİŞTİRMEZ; §35'in, §37'nin, §38'in ve §39'un **kendi metinleri DEĞİŞTİRİLMEMİŞTİR**. §38.13'ün `IMPLEMENTATION AUTHORITY: NONE` hükmü owner tarafından **yalnız bu task için** kaldırılmış, implementasyon yürütülmüş ve bu kayıtla **tüketilmiş** sayılmaktadır — sonraki Track B dilimlerine **devredilmez**.

### 40.1 Canonical Kimlik ve SHA

```text
TASK   : CLIENT-P2-U03-TRACK-B-I02
TITLE  : DISCLOSURE SERVICE FOUNDATION AND INVARIANT ENFORCEMENT
PR     : #1745
SQUASH : bf5e668bcf07d572cdad11a76232381f7d52701f
DIFF   : 7 dosya, +1338 / -0
```

**SCHEMA/MIGRATION: NONE** — I01 şeması I02 için yeterli çıktı (§26 doğrulandı). **API/UI/CONTROLLER: NONE.** **YENİ DEPENDENCY: NONE.**

### 40.2 Dormant Servis Sınırı

`ClientFinancialDisclosureWriterService` **bilerek Nest provider DEĞİLDİR** ve production call-site'ı **yoktur** (`TransactionalClaimItemFormationFinalizerService` emsali). Yalnız `DRAFT` versiyon üretir; ofis onayı, içerik onayı, gönderim, yayınlama ve reversal runtime'ları **kapsam dışıdır** (§38.10).

### 40.3 Yeniden Kullanılan Canonical Emsaller

Hiçbir algoritma veya generic kütüphane **uydurulmadı**: `canonicalJsonStringify` + `stableJsonHash` (`permission-diagnostics/guided-edge/canonical-json`) · domain-separated `sha256(contractVersion ‖ 0x00 ‖ canonicalJson)` (`claim-item-formation-canonical`) · `pg_advisory_xact_lock(hashtextextended(...))` (ClaimItem transactional finalizer) · tiplenmiş `ConflictException` + donmuş kod listesi (`claim-item-formation-finalizer.contract`). Repo lint kuralı gereği para biçimlendirmede `toFixed()` **kullanılmadı**.

### 40.4 Tenant Consistency Enforcement

Tüm ownership doğrulamaları write'tan **önce** ve **aynı transaction** içinde yapılır: `Case` tenant-scoped · `CaseClient` case-scoped · **`CaseClient`'in `Client`'ının tenant'ı input tenant'ı ile karşılaştırılır** (§37.3: `CaseClient`'te `tenantId` kolonu YOKTUR, oradaki bağ tenant güvencesi VERMEZ) · disposition tenant+case scoped · dispozisyonun `caseClientId`'si input ile eşleşmeli · `Collection` tenant+case scoped ve `CONFIRMED` · para birimi tutarlılığı. **"`findUnique(id)` → kayıt varsa kabul et" modeli KULLANILMADI.**

### 40.5 Snapshot / Hash Sözleşmesi

§35.4 gereği `Collection`(amount/currency/date), `CollectionDisposition`(totalAmount/currency/postedAt) ve satır(type+amount) **kopyalanır**, referans tutulmaz. Satır sırası `sourceDispositionLineId` üzerinden deterministik sıralanır ve `sortOrder` **türetilir** → kaynak okuma sırası hash'i değiştiremez. `Decimal(15,2)` canonical string locale-bağımsızdır ve **2'den fazla ondalık sessizce yuvarlanmaz, REDDEDİLİR** (§35.16 "yuvarlama artıkları sessizce atanamaz"). Hash payload'ı yaşam döngüsü / gönderim / içerik-onayı / `id` / timestamp alanı **taşımaz**.

§35.16 zorunlu kesin reconciliation, **TOLERANS YOK**: `Σ satırlar = totalCollected` · `CLIENT_PAYABLE satırı = clientNetAmount`. `HELD_PENDING_DISTRIBUTION` satırı asla kabul edilmez (§35.5); `CASE_CREDITOR_CLUSTER` kapsamı fail-closed reddedilir (§35.3).

### 40.6 Transaction / Idempotency / Concurrency

aggregate + version + lines + current-version işaretçisi **tek transaction**'da. `sendIdempotencyKey` tenant-scoped; aynı anahtar + aynı kaynak parmak izi → **replay** (duplicate YOK), aynı anahtar + farklı kaynak durumu → `DISCLOSURE_IDEMPOTENCY_CONFLICT`. Caller versiyon numarası **veremez**. `P2002`/`P2003`/`P2025`/`P2034` tiplenmiş domain hatasına çevrilir; ham Prisma hatası, SQLSTATE veya stack trace **sızdırılmaz**, finansal payload log'a **yazılmaz**.

### 40.7 Test Kanıtı

```text
unit (SAF, DB-siz)      : 15/15 PASS   (brief §30'un 12 maddesi)
integration (PostgreSQL 16): 21/21 PASS   (brief §31 + §32'nin 4 yaris senaryosu,
                            GERCEK ayri PrismaClient baglantilari)
toplam                  : 36/36 PASS · API build PASS · I02 tsc hatasi 0 · eslint 0
CI manifest binding (yeni manifest ACILMADI, CI-8 butcesi ARTMADI: 16/18):
  pure/client-portal      324 -> 339  (+15)
  db/domain-integration   184 -> 205  (+21)
```

Testler yalnız disposable PostgreSQL üzerinde koştu; canlı `hukuk_db`'ye **dokunulmadı** (test-infra fail-closed guard'ı korundu).

### 40.8 Diş (Teeth) Doğrulaması — Dürüst Sonuç

```text
[A] client-tenant kontrolu kaldirildi     -> 1 test FAIL   (dis VAR)
[C] reconciliation toplam kontrolu kald.  -> 1 unit FAIL   (dis VAR)
[B] advisory lock kaldirildi              -> 21/21 GECTI   (dis YOK)
[D] TOCTOU fingerprint re-check kaldirildi-> 21/21 GECTI   (dis YOK)
geri yukleme                              -> 36/36 PASS
```

**B ve D için açık beyan:** bunlar **defense-in-depth**tir, yük taşıyan değil. Duplicate önlemenin gerçek enforcer'ı `@@unique([tenantId, collectionDispositionId])` DB constraint'idir; advisory lock çatışma gürültüsünü azaltır ve versiyon-sequence hesabını serileştirir. TOCTOU re-check'ini izole eden bir test **kurulamıyor**, çünkü advisory lock testi tetikleyecek araya-girmeyi zaten engelliyor. Bu sınır kod yorumlarında da yazılıdır ve koruma yük taşıyor gibi **sunulmamaktadır**.

İlk teeth turu metodolojik olarak hatalıydı (yanlış spec, tutmayan regex ve gerçek bir kapsam boşluğu); `[2b]` izole cross-tenant testi bu turda **eklendi** ve A'nın dişi kanıtlandı.

### 40.9 Statü

```text
CLIENT-P2-U03-TRACK-B-I02 : AUTHORIZED / IMPLEMENTED / VERIFIED / MERGED / CANONICAL
I02 IMPLEMENTATION AUTHORITY : CONSUMED / CLOSED  (sonraki dilimlere DEVREDILMEZ)

TRACK B ARCHITECTURE      : RATIFIED/CANONICAL     (§35, degismedi)
TRACK B DATA FOUNDATION   : CLOSED/CANONICAL       (§37, degismedi)
TRACK B I01 LIVE          : APPLIED                (§39, degismedi)
TRACK B SERVICE FOUNDATION: CLOSED/CANONICAL       (bu kayitla)
TRACK B API / UI / DASHBOARD / AUTHORIZATION PROJECTION /
APPROVAL / PUBLICATION RUNTIME : NOT AUTHORIZED / NOT STARTED
TRACK A (§34) · SPRING CLEANING (§36) : degismedi
CLIENT-P2-U03 (genel)     : PARTIAL — NOT READY FOR FINAL CLOSURE
RUNTIME: UNCHANGED · CLIENT-VISIBLE FINANCIAL DATA: NONE
```

### 40.10 Closure Self-Check

Bu bölüm: Track B'nin API/UI/dashboard/authorization projection/approval/publication dilimlerini BAŞLATMAZ veya yetkilendirmez; `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ; §35/§37/§38/§39'un kendi metinlerini DEĞİŞTİRMEZ; schema/migration ÜRETMEZ; Track A davranışını DEĞİŞTİRMEZ; client-görünür hiçbir finansal veri AÇMAZ; disclosure servisini production akışına BAĞLAMAZ; UYAP/OFFICE/RCV/DEBTOR statülerini DEĞİŞTİRMEZ; yeni dependency EKLEMEZ.

**I02 SERVICE EXISTS ≠ DISCLOSURE IS CLIENT-VISIBLE · DISCLOSURE RECORD EXISTS ≠ DISCLOSURE MAY BE PUBLISHED · CONTENT HASH EXISTS ≠ CONTENT IS APPROVED · I02 CLOSED ≠ TRACK B FULLY IMPLEMENTED · CLIENT-VISIBLE FINANCIAL DATA: NONE.**

## 41. CLIENT Phase 2 Track B I03 — Approval Policy Owner Kararları ve Canonical Rol Eşlemesi (OWNER RATIFIED, POLICY-ONLY)

Bu bölüm, `CLIENT-P2-U03-TRACK-B-I03 — APPROVAL WORKFLOW AND INTEGRITY GATES` görevinin `APPROVAL_POLICY_UNDERDETERMINED` blocker'ını kapatan **owner kararlarını** ve bu kararların **repository'deki canonical karşılıklarını** kayda geçirir (`decision-log.md` `CLIENT-P2-U03-TRACK-B-I03-APPROVAL-POLICY` kaydı).

§5, §6, §8.A, §8.B, §11–§40 substantive hükümlerini DEĞİŞTİRMEZ; §35'in, §37'nin, §38'in, §39'un ve §40'ın **kendi metinleri DEĞİŞTİRİLMEMİŞTİR**. §35.8'in *"daha geniş rol kümesi … implementasyon aşamasında (I01/I03) doğrulanacak/genişletilecek bir kapsam olarak kaydedilir — bugün var olduğu iddia edilmez"* hükmü bu bölümle **karara bağlanmıştır**; §35.8'in metni yeniden yazılmamıştır.

**BU BÖLÜM POLICY-ONLY'DİR** — hiçbir kod, schema, migration, test veya CI değişikliği içermez ve I03 implementasyonunu BAŞLATMAZ.

### 41.1 Blocker Dispozisyonu

```text
BLOCKER  : APPROVAL_POLICY_UNDERDETERMINED
DURUM    : CLOSED (owner karari ile)
KAPSAM   : yalniz CLIENT-P2-U03-TRACK-B-I03
```

Belirsiz olan iki nokta owner tarafından karara bağlandı: **(a)** office approver rol kümesi (§35.8 bunu açıkça I03'e bırakmıştı) ve **(b)** içerik onaylayıcısının yeterliliği ile office approver'dan ayrımı (charter sessizdi).

### 41.2 Owner Kararları

```text
KARAR 1 — Office approver eligibility
  active user AND same tenant AND office approval capability
  AND final financial approval authority

KARAR 2 — Requester ayrimi
  requesterId != officeApprovedById            (self-approval FORBIDDEN)

KARAR 3 — Content approver eligibility
  office approver ile AYNI yeterlilik kumesi
  ayri/daha gevsek staff kumesi OLUSTURULMAZ

KARAR 4 — Four-eyes
  requesterId        != officeApprovedById
  requesterId        != contentApprovedById
  officeApprovedById != contentApprovedById
  -> en az iki ayri final approver; requester hicbir asamayi onaylayamaz

KARAR 5 — Approval ownership
  office approval  : OfficeApprovalRequest, actionCode = CLIENT_FINANCIAL_DISCLOSURE_APPROVE
  content approval : ayri ikinci OfficeApprovalRequest DEGILDIR;
                     disclosure version uzerinde ayri, denetlenebilir lifecycle transition
```

### 41.3 Canonical Rol Eşlemesi (repository truth)

Owner'ın adlandırdığı küme repository'nin **mevcut** yetkinlik modeline eşlenmiştir. **Yeni role enum'u veya paralel yetki modeli ÜRETİLMEMİŞTİR.**

| Owner ifadesi | Canonical karşılık | Kaynak |
| --- | --- | --- |
| `PARTNER` | `Lawyer.lawyerRank = PARTNER` | `enum LawyerRank` |
| `MANAGER` | `Lawyer.lawyerRank = MANAGER` | `enum LawyerRank` |
| explicitly authorized lawyer | `Lawyer.canApproveOfficeActions = true` | `isApproverEligible()` / `PayoutApprovalPolicy` emsalinin "yetkilendirilmiş avukat" tanımı |
| `SUPER_ADMIN` | **CANONICAL KARŞILIĞI YOK** | aşağıya bakınız |
| active user | `User.isActive = true` | `User` |
| same tenant | `User.tenantId = <tenant>` | `User` |
| office approval capability + lawyer binding | `User.lawyer` linki **zorunlu** | `isApproverEligible()` |

**`SUPER_ADMIN` bulgusu:** repository'de `SUPER_ADMIN` adlı bir rol/enum/capability **hiç yoktur** (`schema.prisma` ve `apps/api/src` taramasında 0 eşleşme). `enum UserRole` yalnız `ADMIN | USER | VIEWER` taşır ve **finansal onay yetkisi `UserRole` üzerinde tutulmaz** — mevcut canonical model onay yetkisini `Lawyer.lawyerRank` + `Lawyer.canApproveOfficeActions` üzerinden çözer ve **linkli `Lawyer` kaydı olmayan kullanıcıyı (staff) dışlar**. `UserRole.ADMIN`'i finansal onaylayıcı saymak, owner'ın *"sıradan staff final approver olamaz"* kuralını ve mevcut lawyer-binding invariant'ını ihlal ederdi. Owner'ın *"exact adlar farklıysa mevcut canonical karşılıkları kullanılacaktır; yeni role enum'u uydurulmayacaktır"* talimatı gereği `SUPER_ADMIN` için **karşılık üretilmemiştir**; küme üç canonical yeterlilikle uygulanır.

**Sonuç — I03 eligibility predikatı:**

```text
aktif  AND  ayni tenant  AND  linkli Lawyer
AND ( lawyerRank IN (PARTNER, MANAGER)  OR  canApproveOfficeActions = true )
```

Bu, `PayoutApprovalPolicy`'nin (PAYOUT-APPROVAL-2, 2026-07-04 owner kararı) kuralıyla **birebir aynıdır**; o karar da MANAGER'ı yalnız kendi actionCode'u için yetkili sayan **izole** bir politikadır. I03 aynı deseni izler: paylaşılan `isApproverEligible()` **DEĞİŞTİRİLMEZ**, `resolveApproverEligible()` dispatcher'ına `CLIENT_FINANCIAL_DISCLOSURE_APPROVE` için **üçüncü bir dal** eklenir — bu, `office-approval.service.ts`'in kendi yorumunun öngördüğü genişleme yoludur (*"Üçüncü bir action-özel policy gerekirse buraya yeni bir dal eklenir"*). Genişleme başka hiçbir actionCode'a **sızmaz**.

### 41.4 Bütünlük ve Stale-Onay Kuralı

Her iki onay aşamasından **hemen önce** `verifyPersistedSnapshot()` çağrılır (§40.6'da I02 ile sağlanan contract). `MISMATCH` halinde: status geçişi YOK · onay tamamlanması YOK · yayınlama uygunluğu YOK · tiplenmiş integrity error ZORUNLU. Onay talebi `disclosureVersionId` **ve** `snapshotHash`'e tam bağlanır. Şunlar stale sayılır ve reddedilir: yeni versiyon oluşturulması · snapshot hash değişimi · finansal satır değişimi · alıcı bağlaması değişimi · versiyonun superseded/cancelled/reversed olması · onay talebinin başka versiyona ait olması. Finansal içerik değişirse eski onay **yeniden kullanılamaz**: yeni versiyon + yeni ofis onayı + yeni içerik onayı + yeni bildirim/yayınlama zinciri zorunludur (§35.6/§35.13 ile tutarlı).

### 41.5 Transition Sözleşmesi

```text
DRAFT -> OFFICE_APPROVAL_PENDING -> OFFICE_APPROVED
      -> CONTENT_APPROVAL_PENDING -> CONTENT_APPROVED
```

Geçersiz atlamalar reddedilir: `DRAFT→OFFICE_APPROVED` · `DRAFT→CONTENT_APPROVED` · `OFFICE_APPROVAL_PENDING→CONTENT_APPROVAL_PENDING` · `OFFICE_APPROVED→CONTENT_APPROVED`. Geçişler servis üzerinden ve transaction içinde yapılır.

### 41.6 Rejection Sınırı

Canonical enum rejection için kalıcı bir durum vermiyorsa **yeni enum/status üretilmez**. Minimum fail-closed davranış: geçiş tamamlanmaz · disclosure published olmaz · audit kanıtı korunur · yeni deneme mevcut canonical `DRAFT`/versiyon modelinden başlatılır. Rejection için schema/migration gerekirse bu bir **STOP koşuludur** ve raporlanır.

### 41.7 Schema Dispozisyonu

```text
schema change : NONE
new migration : NONE
```

I01 alanları (`officeApprovalRequestId`, `officeApprovedAt/ById`, `notificationContent(+Hash)`, `contentApprovedAt/ById`, `approvedRecipientEmail/PortalUserId`) §35.9'un şart koştuğu kanıt kümesini karşılar. `OfficeApprovalRequest.actionCode` **string**tir (substrate tek modüle bağımlı değil), bu nedenle `CLIENT_FINANCIAL_DISCLOSURE_APPROVE` yeni migration gerektirmez; yalnız TS `ActionCode` enum üyesi eklenir (kod, schema değil). `requesterUserId`/`approverUserId` alanları KARAR 2/4'ün gerektirdiği ayrımı taşımaya yeterlidir.

### 41.8 Statü

```text
I03 APPROVAL POLICY BLOCKER : CLOSED
I03 IMPLEMENTATION          : AUTHORIZED / NOT STARTED
I04 / I05 / I06 / I07       : NOT STARTED (sirali entry gate)

TRACK B ARCHITECTURE (§35) · DATA FOUNDATION (§37) · I01 LIVE (§39) ·
SERVICE FOUNDATION (§40) · TRACK A (§34) · SPRING CLEANING (§36) : degismedi
CLIENT-P2-U03 (genel)       : PARTIAL
RUNTIME: UNCHANGED · CLIENT-VISIBLE FINANCIAL DATA: NONE
```

### 41.9 Self-Check

Bu bölüm: I03 implementasyonunu BAŞLATMAZ; kod/schema/migration/test/CI DEĞİŞTİRMEZ; yeni role enum'u, yeni capability veya paralel yetki modeli ÜRETMEZ; `SUPER_ADMIN` için karşılık UYDURMAZ; paylaşılan `isApproverEligible()`'ı DEĞİŞTİRMEZ; başka actionCode'ların yeterlilik kuralını DEĞİŞTİRMEZ; §35.8'in metnini yeniden YAZMAZ; Track B'nin send/publish/API/UI dilimlerini AÇMAZ; `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ.

**POLICY RATIFIED ≠ POLICY IMPLEMENTED · APPROVAL ELIGIBLE ≠ APPROVAL GRANTED · APPROVED ≠ PUBLISHED · CLIENT-VISIBLE FINANCIAL DATA: NONE.**

## 42. CLIENT Phase 2 Track B I03 — Approval Workflow Technical Closure (OWNER RATIFIED)

Bu bölüm, §41'de ratifiye edilen `CLIENT-P2-U03-TRACK-B-I03 — APPROVAL WORKFLOW AND INTEGRITY GATES` görevinin **teknik kapanış** kaydıdır (`decision-log.md` `CLIENT-P2-U03-TRACK-B-I03-CLOSURE` kaydı). §5, §6, §8.A, §8.B, §11–§41 substantive hükümlerini DEĞİŞTİRMEZ; §35'in, §37'nin, §38'in, §39'un, §40'ın ve §41'in **kendi metinleri DEĞİŞTİRİLMEMİŞTİR**. §41.8'in `I03 IMPLEMENTATION: AUTHORIZED / NOT STARTED` hükmü bu kayıtla **tüketilmiş** sayılır — sonraki Track B dilimlerine (I04–I07) **devredilmez**.

### 42.1 Canonical Kimlik ve SHA

```text
TASK   : CLIENT-P2-U03-TRACK-B-I03
TITLE  : APPROVAL WORKFLOW AND INTEGRITY GATES
POLICY : PR #1761 · dcee49ce39c528db2c1afcef9cd743991f34419a  (§41, owner kararlari)
IMPL   : PR #1766 · 691ef164a6f511b1084d4a092208b7d4a2ac3ba1
DIFF   : 13 dosya, +1831 / -59
```

**SCHEMA/MIGRATION: NONE** — §41.7 dispozisyonu doğrulandı; I01 alanları yeterli çıktı. **CONTROLLER/ROUTE/RESOLVER/UI: NONE.** **SEND/PUBLISH/NOTIFICATION DISPATCH: NONE** (I04). **YENİ DEPENDENCY: NONE.** **`ci.yml`: DOKUNULMADI** (manifest-tabanlı bağlama).

Eksi 59 satırın tamamı I02'nin `verifyPersistedSnapshot` gövdesinin **taşınmasıdır** (aşağıda §42.4); silinen davranış YOKTUR.

### 42.2 Dormant Servis Sınırı

`ClientFinancialDisclosureApprovalService` **bilerek Nest provider DEĞİLDİR** ve production call-site'ı **yoktur** (I02'nin `ClientFinancialDisclosureWriterService` emsali). Nest'e kayıtlı olan **yalnız** izole yeterlilik politikasıdır (`ClientFinancialDisclosureApprovalPolicy`), çünkü dispatcher onu çağırır.

```text
APPROVAL SERVICE EXISTS != DISCLOSURE MAY BE SENT
APPROVED                != PUBLISHED
APPROVAL ELIGIBLE       != APPROVAL GRANTED
```

### 42.3 Yeterlilik İzolasyonu (§41.3 uygulaması)

Paylaşılan `OfficeApprovalService.isApproverEligible()` **DEĞİŞTİRİLMEDİ**. `resolveApproverEligible()` dispatcher'ına `CLIENT_FINANCIAL_DISCLOSURE_APPROVE` için **üçüncü bir dal** eklendi — `PayoutApprovalPolicy` (PAYOUT-APPROVAL-2) ile birebir aynı izolasyon deseni. Genişleme başka hiçbir actionCode'a **sızmaz**; `office-approval` (250), `client-payout` (72), `disposition-posting` (41) ve `policy-engine` (404) suite'leri değişiklik olmadan PASS.

Predikat tek bir saf fonksiyondadır (`isDisclosureApproverEligible`) ve hem Nest policy'si hem dormant servis onu çağırır → **kopya YOK, drift YOK**.

**`SUPER_ADMIN` için karşılık ÜRETİLMEDİ** (§41.3 bulgusu). Predikat `UserRole`'ü **hiç okumaz**; bu, `DISCLOSURE_APPROVER_CANDIDATE_SELECT` üzerinde ayrı bir testle (`[P8]`) kanıtlanmıştır. Linkli `Lawyer` kaydı olmayan kullanıcı (staff) **dışlanır**.

### 42.4 Bütünlük Kapısının Transaction İçine Alınması

§41.4 "her iki onaydan **hemen önce** `verifyPersistedSnapshot()`" hükmü, kapının **açık transaction içinde** çalışmasını gerektirir. I02'nin metodu `PrismaClient`e bağlıydı. Çözüm: gövde davranışı, select kümesi ve verdict semantiği **değişmeden** transaction-yetenekli serbest bir fonksiyona (`verifyPersistedDisclosureSnapshot`) ayrıştırıldı; I02 metodu ona delege eder. **İkinci bir doğrulama kopyası ÜRETİLMEDİ**; I02 hash'leri byte düzeyinde aynıdır ve I02 suite'i (36/36) değişmeden PASS eder.

### 42.5 Uygulanan Kapılar

```text
YASAM DONGUSU (§41.5) — dort gecis, atlamalar reddedilir:
  DRAFT -> OFFICE_APPROVAL_PENDING -> OFFICE_APPROVED
        -> CONTENT_APPROVAL_PENDING -> CONTENT_APPROVED

FOUR-EYES (§41.2 KARAR 2/4), ucu de ayri testle kanitli:
  requesterId != officeApprovedById
  requesterId != contentApprovedById
  officeApprovedById != contentApprovedById

STALE-ONAY (§41.4) — hepsi fail-closed:
  snapshot hash degisimi · finansal satir degisimi · yeni versiyon ·
  baska versiyona ait talep · superseded / cancelled / reversed ·
  tuketilmis talep · ilerlemis status · bildirim icerigi/alici degisimi
```

Onay talebi `disclosureVersionId` **ve** `snapshotHash`'e tam bağlanır; `savedIntent` ayrıca `payloadHash` ile doğrulanır (talep gövdesi sonradan oynanmış olamaz). İçerik onayı ikinci bir `OfficeApprovalRequest` **değildir** (§41.2 KARAR 5); versiyon üzerinde ayrı denetlenebilir bir transition'dır ve `notificationContentHash` ile mühürlenir.

### 42.6 Transaction / Eşzamanlılık

Her geçiş tek transaction içinde ve **üç katman birlikte**: `pg_advisory_xact_lock` · application pre-check · **koşullu `updateMany`** (beklenen statü + boş approver alanı `where`de; `count !== 1` → reddedilir). Uygulama pre-check'ine **tek başına güvenilmez**. `P2002`/`P2025` tiplenmiş hataya çevrilir; ham Prisma hatası, SQLSTATE, stack trace, finansal payload ve alıcı e-postası **sızdırılmaz** — yetkilendirme reddi **403**, invariant ihlali **409** olarak iki ayrı hata sınıfıyla ayrılmıştır.

### 42.7 Test Kanıtı

```text
saf unit (DB-siz)              : 12/12 PASS
approval integration (PG 16)   : 29/29 PASS  (brief §9'un 22 maddesi + 7 ek senaryo,
                                 GERCEK ayri PrismaClient baglantilariyla 3 yaris testi)
client-financial-disclosure    : 95/95 PASS  (I01 + I02 regresyonu dahil)
office-approval 250 · client-payout 72 · disposition-posting 41 · policy-engine 404 PASS
CI manifest (gercek run-ci-manifest.sh):
  pure/client-portal      +1 spec -> 28 suite / 351 test PASS
  db/domain-integration   +1 spec -> 22 suite / 243 test PASS
yeni manifest ACILMADI, CI-8 butcesi ARTMADI · API build PASS · eslint 0 · I03 tsc hatasi 0
```

Testler yalnız disposable PostgreSQL 16 üzerinde koştu; canlı `hukuk_db`'ye **dokunulmadı**.

### 42.8 Diş (Teeth) Doğrulaması — 6/6 KORUMA DİŞ TAŞIYOR

```text
[A] requester != office approver kaldirildi  -> test [8]  FAIL
[B] four-eyes kaldirildi                     -> test [10] FAIL
[C] approver yeterliligi kaldirildi          -> test [4]  FAIL
[D] snapshot hash dogrulamasi kaldirildi     -> test [12] FAIL
[E] status gecis guard'i kaldirildi          -> test [19] FAIL
[F] icerik hash dogrulamasi kaldirildi       -> test [13] FAIL
geri yukleme                                 -> 95/95 PASS
```

Her mutasyonun production kodundan gerçekten kaldırıldığı **statik olarak** doğrulandı (eşleşme sayısı + marker kontrolü); tutmayan regex veya yanlış suite kullanılmadı. I02'nin `[B]`/`[D]` dişsiz sonucunun aksine burada **altı korumanın altısı da yük taşımaktadır**.

### 42.9 Statü

```text
CLIENT-P2-U03-TRACK-B-I03 : AUTHORIZED / IMPLEMENTED / VERIFIED / MERGED / CANONICAL
I03 IMPLEMENTATION AUTHORITY : CONSUMED / CLOSED  (I04-I07'ye DEVREDILMEZ)

TRACK B ARCHITECTURE      : RATIFIED/CANONICAL     (§35, degismedi)
TRACK B DATA FOUNDATION   : CLOSED/CANONICAL       (§37, degismedi)
TRACK B I01 LIVE          : APPLIED                (§39, degismedi)
TRACK B SERVICE FOUNDATION: CLOSED/CANONICAL       (§40, degismedi)
TRACK B APPROVAL POLICY   : CLOSED/CANONICAL       (§41, degismedi)
TRACK B APPROVAL RUNTIME  : CLOSED/CANONICAL       (bu kayitla)

TRACK B SEND / PUBLICATION / REVERSAL RUNTIME (I04) : NOT STARTED
TRACK B AUTHORIZATION PROJECTION / READ API   (I05) : NOT STARTED
TRACK B PORTAL PRESENTATION                   (I06) : NOT STARTED
TRACK B ACCEPTANCE / PROGRAM CLOSURE          (I07) : NOT STARTED
TRACK A (§34) · SPRING CLEANING (§36) : degismedi
CLIENT-P2-U03 (genel)     : PARTIAL — NOT READY FOR FINAL CLOSURE
RUNTIME: UNCHANGED · CLIENT-VISIBLE FINANCIAL DATA: NONE
```

### 42.10 Closure Self-Check

Bu bölüm: Track B'nin send/publication/reversal, authorization projection, read API ve portal dilimlerini BAŞLATMAZ veya yetkilendirmez; `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ; §35/§37/§38/§39/§40/§41'in kendi metinlerini DEĞİŞTİRMEZ; schema/migration ÜRETMEZ; yeni role enum'u veya paralel yetki modeli ÜRETMEZ; paylaşılan `isApproverEligible()`'ı DEĞİŞTİRMEZ; başka actionCode'ların yeterlilik kuralını DEĞİŞTİRMEZ; approval servisini production akışına BAĞLAMAZ; client-görünür hiçbir finansal veri AÇMAZ; UYAP/OFFICE/RCV/DEBTOR statülerini DEĞİŞTİRMEZ; yeni dependency EKLEMEZ.

**APPROVAL RUNTIME EXISTS ≠ DISCLOSURE MAY BE SENT · APPROVED ≠ PUBLISHED · APPROVAL ELIGIBLE ≠ APPROVAL GRANTED · I03 CLOSED ≠ TRACK B FULLY IMPLEMENTED · CLIENT-VISIBLE FINANCIAL DATA: NONE.**

## 43. CLIENT Phase 2 Track B I04 — Send, Publication and Reversal Runtime Closure (OWNER RATIFIED)

Bu bölüm, `CLIENT-P2-U03-TRACK-B-I04 — SEND, PUBLICATION AND REVERSAL RUNTIME` görevinin **teknik kapanış** kaydıdır (`decision-log.md` `CLIENT-P2-U03-TRACK-B-I04-CLOSURE` kaydı). §5, §6, §8.A, §8.B, §11–§42 substantive hükümlerini DEĞİŞTİRMEZ; §35'in, §37'nin, §38'in, §39'un, §40'ın, §41'in ve §42'nin **kendi metinleri DEĞİŞTİRİLMEMİŞTİR**.

### 43.1 Canonical Kimlik ve SHA

```text
TASK   : CLIENT-P2-U03-TRACK-B-I04
TITLE  : SEND, PUBLICATION AND REVERSAL RUNTIME
PR     : #1770
SQUASH : 438db3c832635deb4d6a2a71fe7504f3c0279316
DIFF   : 4 dosya, +1463 / -0
```

**SCHEMA/MIGRATION: NONE** · **CONTROLLER/ROUTE/RESOLVER/UI: NONE** · **YENİ DEPENDENCY: NONE** · **`ci.yml`: DOKUNULMADI**.

### 43.2 §35.11 Zorunlu Sırasının Birebir Uygulanması

```text
(1) SEND_PENDING kalici commit edilir              -> beginSend()
(2) provider cagrisi DB TRANSACTION'I DISINDA      -> dispatchAndPublish() 2. adim
(3) gercek-provider kabulu + KALICI message ID     -> eksikse SEND_FAILED (§35.10)
(4) snapshot / icerik hash / alici baglamasi gonderimden ONCE VE SONRA dogrulanir
(5) PUBLISHED'e TEK idempotent guarded gecis       -> publishedAt + providerMessageId NULL guard'li
(6) provider-kabul (SENT) ve yayinlama olaylari AYRI AYRI AuditLog'a yazilir
```

### 43.3 §35.10 Mock Provider Yasağı

Yayınlama yalnız onaylı gerçek provider'larla (`smtp` / `sendgrid` / `ses`) mümkündür. `mock`, boş değer veya listede olmayan herhangi bir ad **fail-closed** reddedilir ve guard provider'a **tek byte gitmeden önce** çalışır. Sessiz mock fallback'i Financial Disclosure gate'ini tatmin **edemez**.

### 43.4 Çift Gönderim ve Çift Yayınlama

Çift gönderim `sendRequestedAt` üzerinden **koşullu sahiplenme (claim)** ile engellenir: yalnız `NULL`dan bugüne çevirebilen çağıran provider'a gider. Sahiplenme yalnızca ayrı, guarded bir `retrySend()` operatör eylemiyle serbest bırakılır — dispatch kendi kendine sıfırlayamaz. Çift yayınlama erken already-published kontrolü, guarded geçiş ve audit tekilliği ile engellenir.

### 43.5 §35.13 Reversal / Supersession

`PUBLISHED → REVERSED` ve `PUBLISHED → SUPERSEDED`. **Geçmiş ASLA silinmez** — `providerMessageId` ve `publishedAt` korunur. Supersession yalnız aynı disclosure kökü içinde, daha yüksek versiyonlu ve **kendi ofis + içerik onayı tamamlanmış** bir versiyonla kurulur; `@@unique([tenantId, supersedesVersionId])` bir versiyonun en fazla **bir kez** supersede edilmesini DB seviyesinde garanti eder. Kısayol YOKTUR.

### 43.6 Sızıntı Sınırı ve Mimari

Provider hata **detayı** yalnız internal `sendFailureDetail` kolonunda kalır; audit metadata'sına finansal tutar, alıcı e-postası, bildirim içeriği veya hash **yazılmaz**. Ham Prisma hatası, SQLSTATE ve stack trace sızdırılmaz (403 authz / 409 invariant). Gönderim bir **port** (`DisclosureNotificationDispatcher`) üzerinden yapılır; dormant servis Nest'in `EmailProviderService`'ine doğrudan bağlanmaz. Yeterlilik I03'ün **aynı saf predikatını** kullanır; ikinci bir yetki kuralı üretilmemiştir.

### 43.7 Test Kanıtı ve Diş Doğrulaması

```text
publication integration      : 24/24 PASS  (gercek PostgreSQL 16)
client-financial-disclosure  : 119/119 PASS (I01+I02+I03 regresyonu dahil)
CI manifest (gercek run-ci-manifest.sh): db/domain-integration 23 suite / 267 test PASS
yeni manifest ACILMADI, CI-8 butcesi ARTMADI · API build PASS · eslint 0 · I04 tsc hatasi 0
GERCEK E-POSTA GONDERILMEDI — port sahte adaptorle saglandi.

DIS (TEETH) — 6/6 KORUMA DIS TASIYOR:
  [A] mock provider guard'i             -> test [1]  FAIL
  [B] gonderim sahiplenme kontrolu      -> test [22] FAIL
  [C] message ID kanit kapisi           -> test [5]  FAIL
  [D] gonderim sonrasi alici dogrulamasi-> test [12] FAIL
  [E] gonderim oncesi yayinlanabilirlik -> test [9]  FAIL
  [F] cift yayinlama on-kontrolu        -> test [8]  FAIL
  geri yukleme                          -> 119/119 PASS
```

### 43.8 Statü

```text
CLIENT-P2-U03-TRACK-B-I04 : AUTHORIZED / IMPLEMENTED / VERIFIED / MERGED / CANONICAL

TRACK B ARCHITECTURE / DATA FOUNDATION / I01 LIVE / SERVICE FOUNDATION /
APPROVAL POLICY / APPROVAL RUNTIME (§35/§37/§39/§40/§41/§42) : degismedi
TRACK B SEND-PUBLICATION-REVERSAL RUNTIME : CLOSED/CANONICAL  (bu kayitla)

TRACK B AUTHORIZATION PROJECTION / READ API (I05) : NOT STARTED
TRACK B PORTAL PRESENTATION                 (I06) : NOT STARTED
TRACK B ACCEPTANCE / PROGRAM CLOSURE        (I07) : NOT STARTED
CLIENT-P2-U03 (genel) : PARTIAL — NOT READY FOR FINAL CLOSURE
RUNTIME: UNCHANGED · CLIENT-VISIBLE FINANCIAL DATA: NONE
```

### 43.9 Closure Self-Check

Bu bölüm: authorization projection, read API ve portal dilimlerini BAŞLATMAZ; `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ; §35–§42'nin kendi metinlerini DEĞİŞTİRMEZ; schema/migration ÜRETMEZ; publication servisini production akışına BAĞLAMAZ; client-görünür hiçbir finansal veri AÇMAZ; gerçek e-posta GÖNDERMEZ; yeni dependency EKLEMEZ.

**PROVIDER ACCEPTED ≠ DELIVERED TO INBOX · SENT ≠ PUBLISHED · PUBLISHED ≠ EVERY CLIENT MAY VIEW · CLIENT-VISIBLE FINANCIAL DATA: NONE.**

## 44. CLIENT Phase 2 Track B I05 — Client Authorization Projection and Read API Closure (OWNER RATIFIED)

Bu bölüm, `CLIENT-P2-U03-TRACK-B-I05 — CLIENT AUTHORIZATION PROJECTION AND READ API` görevinin **teknik kapanış** kaydıdır (`decision-log.md` `CLIENT-P2-U03-TRACK-B-I05-CLOSURE` kaydı). §5, §6, §8.A, §8.B, §11–§43 substantive hükümlerini DEĞİŞTİRMEZ; §35'in ve §37–§43'ün **kendi metinleri DEĞİŞTİRİLMEMİŞTİR**.

### 44.1 Canonical Kimlik ve SHA

```text
TASK   : CLIENT-P2-U03-TRACK-B-I05
TITLE  : CLIENT AUTHORIZATION PROJECTION AND READ API
PR     : #1777
SQUASH : 185be942c73b6dec95c408aede1f7aca8026c80a
DIFF   : 4 dosya, +729 / -0
```

**SCHEMA/MIGRATION: NONE** · **CONTROLLER/ROUTE/RESOLVER/UI: NONE** · **YENİ DEPENDENCY: NONE** · **`ci.yml`: DOKUNULMADI**.

### 44.2 Yetki Zinciri

Her okuma server tarafında baştan çözülür; client girdisi **asla güvenilmez**:

```text
portalUserId -> ClientPortalUser (isActive)
             -> clientId
             -> Client (tenantId ESLESMELI)
             -> CaseClient (muvekkilin gercekten bagli oldugu dosyalar)
             -> ClientFinancialDisclosure (tenant scope)
             -> ClientFinancialDisclosureVersion (YALNIZ client-gorunur statuler)
```

`CaseClient`'te `tenantId` kolonu **yoktur** (§37.3); tenant güvencesi kökün kendi `tenantId`'sinden ve client eşleşmesinden **birlikte** gelir. "`caseClientId` verildi, kabul et" modeli **kullanılmamıştır**. `caseId` filtresi kapsamı yalnız **daraltır**, genişletmez.

### 44.3 §35.7 Görünürlük Sınırı

Yalnız `PUBLISHED` / `SUPERSEDED` / `REVERSED` client-görünürdür. `DRAFT`, `OFFICE_APPROVAL_PENDING`, `OFFICE_APPROVED`, `CONTENT_APPROVAL_PENDING`, `CONTENT_APPROVED`, `SEND_PENDING`, `SEND_FAILED` ve `CANCELLED` durumundaki hiçbir versiyon client'a **ulaşmaz** — sekiz durumun her biri ayrı ayrı test edilmiştir.

### 44.4 §35.14 İki Ayrı Yüzey (OWNER KARARI)

Varsayılan yüzey **yalnız current-effective** disclosure'ları taşır; düzeltme ve reversal geçmişi **ayrı** "Bildirim Geçmişi" yüzeyindedir. İki yüzey **kesişmez** ve tek birleşik liste **üretilmez**; ayrım tip düzeyinde de zorlanır (`CURRENT` / `HISTORY`).

### 44.5 §35.14 Alan Sınırı

Çıktı `CLIENT_DISCLOSURE_ALLOWED_FIELDS` beyaz listesiyle **birebir** kurulur ve `assertProjectionShape()` ile fail-closed doğrulanır — fazladan **veya** eksik anahtar hatadır, dolayısıyla ileride eklenecek bir alan **sessizce sızamaz**. Internal approver kimliği, onay yorumu, provider hata detayı, provider message ID, idempotency anahtarı, hash, ham ledger kimliği, bildirim metni, alıcı e-postası ve taslak workflow durumu projeksiyona **girmez**. Tutarlar canonical `Decimal` string'dir (locale-bağımsız); `toFixed()` **kullanılmamıştır**.

Kapsam dışı, yayınlanmamış ve var olmayan kayıt **aynı 404 gövdesini** üretir — bir kaydın **varlığı** bile sızdırılmaz.

### 44.6 Test Kanıtı ve Diş Doğrulaması

```text
projection integration       : 11/11 PASS  (gercek PostgreSQL 16)
client-financial-disclosure  : 106/106 PASS (I01+I02+I03 regresyonu dahil)
CI manifest (gercek run-ci-manifest.sh): db/domain-integration 24 suite / 278 test PASS
yeni manifest ACILMADI, CI-8 butcesi ARTMADI · API build PASS · eslint 0 · I05 tsc hatasi 0

DIS (TEETH) — 6/6 KORUMA DIS TASIYOR:
  [A] portal kullanicisi aktiflik kontrolu -> test [4] FAIL
  [B] tenant eslesme kontrolu              -> test [5] FAIL
  [C] client scope filtresi                -> test [6] FAIL
  [D] client-gorunur statu filtresi        -> test [1] FAIL
  [E] current/history ayrimi               -> test [2] FAIL
  [F] canonical para bicimi                -> test [9] FAIL
  geri yukleme                             -> 106/106 PASS
```

### 44.7 Statü

```text
CLIENT-P2-U03-TRACK-B-I05 : AUTHORIZED / IMPLEMENTED / VERIFIED / MERGED / CANONICAL

TRACK B §35/§37/§39/§40/§41/§42/§43 : degismedi
TRACK B AUTHORIZATION PROJECTION / READ API : CLOSED/CANONICAL  (bu kayitla)

TRACK B PORTAL PRESENTATION          (I06) : NOT STARTED
TRACK B ACCEPTANCE / PROGRAM CLOSURE (I07) : NOT STARTED
CLIENT-P2-U03 (genel) : PARTIAL — NOT READY FOR FINAL CLOSURE
RUNTIME: UNCHANGED · CLIENT-VISIBLE FINANCIAL DATA: NONE (projeksiyon HENUZ ROUTE EDILMEDI)
```

### 44.8 Closure Self-Check

Bu bölüm: portal sunum dilimini BAŞLATMAZ; hiçbir HTTP rotası AÇMAZ; `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ; §35–§43'ün kendi metinlerini DEĞİŞTİRMEZ; schema/migration ÜRETMEZ; projeksiyonu production akışına BAĞLAMAZ; client-görünür hiçbir finansal veri AÇMAZ; yeni dependency EKLEMEZ.

**PUBLISHED ≠ EVERY CLIENT MAY VIEW · CLIENT-VISIBLE DATA = ONLY SERVER-AUTHORIZED PROJECTION · PROJECTION EXISTS ≠ PROJECTION IS ROUTED · CLIENT-VISIBLE FINANCIAL DATA: NONE.**

## 45. CLIENT Phase 2 Track B I06 — Portal Financial Disclosure Presentation Closure (OWNER RATIFIED)

Bu bölüm, `CLIENT-P2-U03-TRACK-B-I06 — PORTAL FINANCIAL DISCLOSURE PRESENTATION` görevinin **teknik kapanış** kaydıdır (`decision-log.md` `CLIENT-P2-U03-TRACK-B-I06-CLOSURE` kaydı). §5, §6, §8.A, §8.B, §11–§44 substantive hükümlerini DEĞİŞTİRMEZ; §35'in ve §37–§44'ün **kendi metinleri DEĞİŞTİRİLMEMİŞTİR**.

### 45.1 Canonical Kimlik ve SHA

```text
TASK   : CLIENT-P2-U03-TRACK-B-I06
TITLE  : PORTAL FINANCIAL DISCLOSURE PRESENTATION
PR     : #1782
SQUASH : 1b7692aaf99831076a995591110f0b35e9f5716d
DIFF   : 8 dosya, +670 / -3
```

**SCHEMA/MIGRATION: NONE** · **YENİ DEPENDENCY: NONE** · **`ci.yml`: DOKUNULMADI**.

### 45.2 Client-Görünürlük Eşiği

Bu dilim, Track B'nin **client-visible financial data**'yı ilk kez açan dilimidir — ve yalnız **server-authorized projeksiyon** üzerinden açar:

```text
CLIENT-VISIBLE DATA = ONLY SERVER-AUTHORIZED PROJECTION
```

Üç rota da `PortalAuthGuard` arkasındadır:

```text
GET /api/portal/financial-disclosures          -> VARSAYILAN yuzey (yalniz current-effective)
GET /api/portal/financial-disclosures/history  -> AYRI "Bildirim Gecmisi" yuzeyi
GET /api/portal/financial-disclosures/:id      -> tek kayit
```

Kapsam `req.portalUser.sub` (portal kullanıcı kimliği) üzerinden **server tarafında yeniden çözülür**; token'daki `clientId` **kullanılmaz** — token alanı manipüle edilse bile kapsam genişlemez.

### 45.3 Adaptör Sınırı

`ClientFinancialDisclosurePortalService`'in **tek işi** I05 projeksiyonuna delege etmektir. Kendi sorgusunu **yazmaz**, kendi alan seçimini **yapmaz**, kendi yetki kararını **vermez**. Böylece §35.14 alan sınırı ve yetki zinciri **tek kaynakta** kalır; portal katmanında paralel bir projeksiyon **doğamaz**.

### 45.4 Sunum Sınırı

İki yüzey **ayrı uçlardan** çekilir ve istemcide **birleştirilmez** (§35.14 owner kararı: tek birleşik liste üretilmez). Sayfa hiçbir finansal **değer türetmez** — toplam, oran, bakiye veya fark **hesaplamaz**; server-authorized projeksiyonda ne geldiyse yalnız onu gösterir. Bu, §22.10/§22.11 aggregate yasağının portal tarafındaki karşılığıdır.

### 45.5 Test Kanıtı ve Diş Doğrulaması

```text
portal adaptor integration : 6/6 PASS      (gercek PostgreSQL 16)
portal (tum API suite)     : 193/193 PASS  (17 suite)
web vitest (TAM SUITE)     : 1381/1381 PASS (145 dosya)
API build PASS · WEB next build PASS · eslint 0 error · I06 tsc hatasi 0
CI manifest: db/domain-integration +1 spec; yeni manifest ACILMADI, CI-8 butcesi ARTMADI.
Web spec'leri `pnpm --filter @hukuk/web test` ile tamami kosuldugundan binding GEREKMEZ.

DIS (TEETH) — 4/4:
  [A] current/history ayrimi kaldirildi (tek birlesik liste) -> web [1]+[2] FAIL
  [B] ayri gecmis ucu kaldirildi                             -> web [2]+[3] FAIL
  [C] yasak alanlar sayfaya sizdirildi                       -> web [5]  FAIL
  [D] I05 projeksiyonuna delegasyon kaldirildi               -> API [1][4][5] FAIL
  geri yukleme -> API 6/6 + web 6/6 PASS
```

`[C]` bir koruma-kaldırma değil, kasıtlı bir **sızıntı enjeksiyonudur**; sızıntı testinin diş taşıdığını kanıtlamak için bu biçimde kurulmuştur ve öyle raporlanmaktadır.

**YAN DÜZELTME:** `portal-admin-actor-id.spec.ts`'in `PortalController` kurucu çağrısı iki argümana güncellendi (davranış testi **değişmedi**, yalnız boş stub eklendi).

### 45.6 Statü

```text
CLIENT-P2-U03-TRACK-B-I06 : AUTHORIZED / IMPLEMENTED / VERIFIED / MERGED / CANONICAL

TRACK B §35/§37/§39/§40/§41/§42/§43/§44 : degismedi
TRACK B PORTAL PRESENTATION : CLOSED/CANONICAL  (bu kayitla)

TRACK B ACCEPTANCE / PROGRAM CLOSURE (I07) : NOT STARTED
CLIENT-P2-U03 (genel) : PARTIAL — I07 bekliyor
RUNTIME: PORTAL READ PATH LIVE · CLIENT-VISIBLE FINANCIAL DATA: SERVER-AUTHORIZED PROJECTION ONLY
```

### 45.7 Closure Self-Check

Bu bölüm: `CLIENT-P2-U03`'ü CLOSED İLAN ETMEZ; §35–§44'ün kendi metinlerini DEĞİŞTİRMEZ; schema/migration ÜRETMEZ; yazma/onay/gönderim/yayınlama akışlarına HİÇBİR production call-site AÇMAZ (bunlar dormant kalır); projeksiyon dışında hiçbir finansal alan AÇMAZ; yeni dependency EKLEMEZ.

**PUBLISHED ≠ EVERY CLIENT MAY VIEW · SENT ≠ PUBLISHED · CLIENT-VISIBLE DATA = ONLY SERVER-AUTHORIZED PROJECTION.**

## 46. CLIENT Phase 2 Track B I07 — Production Readiness, Acceptance and Program Closure (OWNER RATIFIED)

Bu bölüm, `CLIENT-P2-U03-TRACK-B-COMPLETION-PROGRAM-R01` programının **kabul ve kapanış** kaydıdır (`decision-log.md` `CLIENT-P2-U03-TRACK-B-I07-PROGRAM-CLOSURE` kaydı). §5, §6, §8.A, §8.B, §11–§45 substantive hükümlerini DEĞİŞTİRMEZ; §35'in ve §37–§45'in **kendi metinleri DEĞİŞTİRİLMEMİŞTİR**.

### 46.1 Program Zinciri ve SHA Kütüğü

```text
I01 DATA FOUNDATION           #1740 / #1743  32a42ed4 · f16202a6   CLOSED / APPLIED
I02 SERVICE FOUNDATION        #1745 / #1748  bf5e668b · a24faeaf   CLOSED / CANONICAL
I03 APPROVAL POLICY (gov)     #1761          dcee49ce              CLOSED / CANONICAL
I03 APPROVAL RUNTIME          #1766 / #1769  691ef164 · 8f2fc5cd   CLOSED / CANONICAL
I04 SEND-PUBLICATION-REVERSAL #1770 / #1774  438db3c8 · bcfc93cd   CLOSED / CANONICAL
I05 AUTHORIZATION PROJECTION  #1777 / #1779  185be942 · ecfff5aa   CLOSED / CANONICAL
I06 PORTAL PRESENTATION       #1782 / <gov>  1b7692aaf99831076a995591110f0b35e9f5716d            CLOSED / CANONICAL
I06-R01 NAV REMEDIATION       #1790          0c0e463087422236a8dbf6972565f931fe6878f6              CLOSED / CANONICAL
```

Her kalem hem implementasyon hem governance kapanışı ile merge edilmiştir; hiçbiri "rapor yazıldı" ile kapatılmamıştır.

### 46.2 Kümülatif Kanıt

```text
client-financial-disclosure API suite : I01+I02+I03+I04+I05 zinciri regresyonsuz
portal API suite                      : 193/193 PASS (17 suite)
web vitest TAM SUITE                  : 1381/1381 PASS (145 dosya)
CI manifest (gercek run-ci-manifest.sh): db/domain-integration ve pure/client-portal PASS
API build PASS · WEB next build PASS · eslint 0 error
DIS (TEETH) toplami                   : I03 6/6 · I04 6/6 · I05 6/6 · I06 4/4  = 22 mutasyon
yeni manifest ACILMADI · CI-8 butcesi ARTMADI · ci.yml HIC DEGISMEDI
SCHEMA/MIGRATION: yalniz I01 (additive); I02-I06'da NONE
```

Tüm DB testleri disposable PostgreSQL 16 üzerinde koştu; canlı `hukuk_db`'ye **dokunulmadı** ve **gerçek e-posta gönderilmedi**.

### 46.3 Runtime Gerçeği — DÜRÜST BEYAN

Bu program **kod olarak tamamdır**, fakat runtime yüzeyi **kısmidir** ve bu bilerek böyledir:

```text
OKUMA YOLU  (projeksiyon -> portal)  : LIVE       (I05 + I06)
YAZMA YOLU  (disclosure uretimi)     : DORMANT    (I02, production call-site YOK)
ONAY YOLU   (ofis + icerik onayi)    : DORMANT    (I03, production call-site YOK)
GONDERIM/YAYINLAMA YOLU              : DORMANT    (I04, production call-site YOK)
```

Repository doğrulaması: `ClientFinancialDisclosureWriterService`, `ClientFinancialDisclosureApprovalService` ve `ClientFinancialDisclosurePublicationService` için test dışı **sıfır** call-site vardır ve hiçbiri Nest provider **değildir**. Ayrıca `DisclosureNotificationDispatcher` portunun **hiçbir production adaptörü yoktur** — port ve onu tüketen servis dışında implementasyon **bulunmamaktadır**.

**Sonuç:** bugün bir disclosure **üretilemez, onaylanamaz ve yayınlanamaz**; portal yüzeyi yayınlanmış kayıt olmadığı sürece **boş** döner. Bu bir kusur değil, §38.4/§42.2/§43.9'de kayıtlı **kasıtlı dormant sınırdır**; kaldırılması **ayrıca yetkilendirilmiş** bir aktivasyon görevi gerektirir.

### 46.4 Production Activation — NOT VERIFIABLE

```text
PRODUCTION TARGET     : repository disinda dogrulanamaz
EMAIL_PROVIDER runtime: UNKNOWN (secret/.env OKUNMADI — Phase 0 no-secrets kurali)
ACTIVATION VERDICT    : NOT VERIFIABLE FROM REPOSITORY
```

Owner talimatı §15 gereği bu belirsizlik **yalnız aktivasyon bölümünü** durdurur; I03–I06 kod ve governance kapanışlarını **durdurmaz**. §35.10'un "mock provider production yayınlamayı ASLA yetkilendiremez" invariant'ı kodda uygulanmıştır (onaylı provider allowlist'i, guard provider'a tek byte gitmeden önce çalışır), fakat çalışma zamanı değerinin doğrulanması repository dışı bir işlemdir ve **yapılmamıştır**.

### 46.5 Açık Kalan Owner-Gated Kalemler

```text
A. AKTIVASYON ADAPTORU  : dormant yazma/onay/yayinlama servislerini production akisina
                          baglayacak, owner-gated bir adaptor + call-site. NOT AUTHORIZED.
B. PROVIDER ADAPTORU    : DisclosureNotificationDispatcher'in gercek implementasyonu
                          (EmailProviderService koprusu). NOT AUTHORIZED.
C. PRODUCTION DOGRULAMA : EMAIL_PROVIDER ve hedef ortamin owner tarafindan dogrulanmasi.
                          REPOSITORY DISI.
```

Bunların hiçbiri bu programın kapsamında **değildi** ve hiçbiri bu kayıtla **yetkilendirilmemektedir**.

### 46.6 Program Statüsü

```text
CLIENT-P2-U03 TRACK B FINANCIAL DISCLOSURE

I01 CLOSED / APPLIED
I02 CLOSED / CANONICAL
I03 CLOSED / CANONICAL
I04 CLOSED / CANONICAL
I05 CLOSED / CANONICAL
I06 CLOSED / CANONICAL
I07 CLOSED / CANONICAL   (bu kayitla)

PROGRAM : CLOSED / CANONICAL / PASS
KAPSAM  : kod + governance TAM; runtime aktivasyonu KAPSAM DISI ve NOT AUTHORIZED

RUNTIME: PORTAL READ PATH LIVE · WRITE/APPROVAL/PUBLICATION PATH DORMANT
CLIENT-VISIBLE FINANCIAL DATA: SERVER-AUTHORIZED PROJECTION ONLY
LIVE CRITICAL BLOCKER: NONE
```

### 46.8 Kapanış Sonrası Bulunan ve Kapatılan Eksik (I06-R01)

I06 kapanışından (§45) **sonra** yapılan bir tamlık kontrolünde, portal finansal bildirim sayfasının portal navigasyonunda **bağlantısının bulunmadığı** tespit edildi: sayfa yalnız URL elle yazılarak ulaşılabiliyordu. Bu, sunum diliminin gerçek bir eksiğiydi ve **raporlanıp bırakılmak yerine kapatıldı**.

```text
PR #1790 · 0c0e463087422236a8dbf6972565f931fe6878f6
  layout.tsx : /portal/financial-disclosures baglantisi (Finansal Bildirimler sekmesi)
  spec       : [7] navigasyon regresyon testi (layout kaynagini okur)
  DIS        : nav href'i bozuldu -> [7] FAIL; geri yuklemede 7/7 PASS
  web vitest TAM SUITE 1382/1382 PASS · next build PASS · eslint 0 error
```

**Yalnız gezinme:** yetki zinciri, alan sınırı ve projeksiyon **değişmedi**; API, servis, schema, migration ve `ci.yml` **dokunulmadı**. Client-görünür veri kümesi aynen kalır.

### 46.7 Program Closure Self-Check

Bu bölüm: aktivasyon adaptörünü, provider adaptörünü veya herhangi bir production call-site'ı YETKİLENDİRMEZ; `CLIENT-P2-U03`'ün Track A veya diğer dilimleri hakkında HÜKÜM VERMEZ; §35–§45'in kendi metinlerini DEĞİŞTİRMEZ; schema/migration ÜRETMEZ; production ortamı hakkında DOĞRULANMAMIŞ hiçbir iddia TAŞIMAZ; UYAP/OFFICE/RCV/DEBTOR statülerini DEĞİŞTİRMEZ.

**PROGRAM CLOSED ≠ FEATURE ACTIVATED · CODE COMPLETE ≠ RUNTIME LIVE · SENT ≠ PUBLISHED · PUBLISHED ≠ EVERY CLIENT MAY VIEW.**

## 47. CLIENT Financial Disclosure Production Activation — Runtime Binding Program Closure (OWNER RATIFIED)

Bu bölüm, `CLIENT-FINANCIAL-DISCLOSURE-PRODUCTION-ACTIVATION-R01` programının **kabul ve kapanış** kaydıdır (`decision-log.md` `CLIENT-FD-ACT-R01-I07-PROGRAM-CLOSURE` kaydı). §46'nın ve önceki tüm bölümlerin **kendi metinleri DEĞİŞTİRİLMEMİŞTİR**. Bu program, §46'da `CLOSED / CANONICAL / PASS` ilan edilen `CLIENT-P2-U03-TRACK-B-COMPLETION-PROGRAM-R01`'in **runtime binding devamıdır** — I01–I07 (Track B) yeniden AÇILMAMIŞ, yalnız Track B'nin dormant servisleri gerçek çalışma zamanına BAĞLANMIŞTIR.

### 47.1 Program Zinciri ve SHA Kütüğü

```text
I01 RUNTIME BINDING RECONCILIATION   (read-only)                          CLOSED
I02 PRODUCTION COMPOSITION BINDING   #1808                0335c4cf        CLOSED / CANONICAL
I03 AUTHORIZED WRITE ENTRYPOINT      #1814                7d64263a        CLOSED / CANONICAL
I04 DISPATCHER ADAPTER               #1819                cf82ea70d37a16287674e82d0bee99d540277b88        CLOSED / CANONICAL
I05 ACTIVATION GATES + TELEMETRY     #1827                9cd51295db434b437bf240a26a4421c6c8e7a211        CLOSED / CANONICAL
I06 E2E / RESTART / CONCURRENCY      #1840                ee195d8e7f1067c159415e5c6ad069e26d1ac9d4        CLOSED / CANONICAL
I07 GOVERNANCE CLOSEOUT              (bu kayıt)                          CLOSED / CANONICAL
```

Her implementasyon kalemi tam CI kapısından (9/9 required+non-required check) geçerek merge edilmiştir. Tek istisna: I05'in ilk hazırlanışında `Orchestration Tests` `origin/main`'de PR-dışı bir nedenle (başka oturumun PR #1824'ü) kırıktı; owner bu somut duruma **sınırlı bir override** verdi, fakat merge öncesi son kapıda `origin/main` zaten yeşile dönmüş olduğu için **override fiilen kullanılmadan**, I05 rebase edilip **tam 9/9 CI ile** merge edilmiştir. Ayrıntı §47.9'dadır.

### 47.2 Runtime Call-Site Envanteri — ÖNCESİ / SONRASI

```text
                                ONCESI (I01 olcumu)        SONRASI (I06 sonrasi)
Writer          call-site       0 (test-disi)               2 (composition + I03 entrypoint)
Approval        call-site       0 (test-disi)               1 (composition)
Publication     call-site       0 (test-disi)               2 (composition + dispatcher secimi)
Dispatcher      production      YOK                          ClientFinancialDisclosureEmailDispatcher
                adapter                                      (EmailProviderService koprusu)
Portal read     call-site       1 (LIVE, degismedi)          1 (degismedi)
```

### 47.3 Provider Adaptör Kimliği ve Mekanizması

`ClientFinancialDisclosureEmailDispatcher implements DisclosureNotificationDispatcher`, canonical `EmailProviderService` üzerinden gönderir. Provider adı **uydurulmadı**: `EmailProviderService`'e eklenen `get providerName()` public getter'ı okur (additive, davranış değişmedi). Retryable/terminal sınıflandırması adapter'da yapılır (`classifyDispatchFailure`) çünkü `EmailProviderService` bu ayrımı hiç taşımıyordu. İki katmanlı fail-closed: dispatcher seçimi composition'da (`ClientFinancialDisclosureModule`), yayınlama kapısı da aynı seçim noktasında (§47.4) — biri atlansa diğeri korur. Yapılandırılmamış/onaysız provider `UnconfiguredDisclosureNotificationDispatcher`'a düşer; bu sınıf başarı taklit etmez, mesaj ID'siz döner.

### 47.4 Aktivasyon Bayrakları ve Varsayılan Durum

```text
CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED         varsayilan KAPALI, YALNIZ birebir 'true'
CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED   varsayilan KAPALI, YALNIZ birebir 'true'
```

Katı-literal parser I05'te bilinçli bir **daraltmadır**: I03'ün ilk `trim().toLowerCase()` deseni `'TRUE'`/`'True'`/`' true '` değerlerini de açıyordu; bu artık kapalıdır. İki bayrak birbirinden bağımsız okunur (LEVEL 0/1/2); yazma açık/yayınlama kapalı geçerli ve kasıtlı bir kuruluştur. Canonical enforcement noktası composition'daki dispatcher seçimidir — controller bypass edilse bile dış gönderim gerçekleşemez.

### 47.5 Telemetri Sözleşmesi

12 canonical event adı (`disclosure_create_requested` … `publication_reversed`) sabit tanımlıdır; bu PR zincirinde yalnız ilk ikisi (`disclosure_create_requested`, `disclosure_created`) gerçekten emit edilmektedir — approval ve publication servisleri kasıtlı olarak Nest-bağımsız kaldığı için (§38.4/§42.2/§43.9) onlara logger enjekte edilmemiştir; kalan 10 event'in emisyonu bu programın kapsamı DIŞINDADIR ve NOT AUTHORIZED'dır. 18 yasak alan (`amount`, `snapshotHash`, `recipientEmail`, `secret`, `providerMessageId` vb.) `buildDisclosureTelemetry()` tarafından fail-closed atılır.

### 47.6 Happy-Path, Security, Integrity, Failure Kanıtı

I06'nın gerçek Nest composition suite'i: oluştur → office onay → content onay → yayınla → portal görünürlüğü zincirinin **her adımı DB'den doğrulandı** (yalnız dönüş değeriyle değil). Security/integrity matrisinin tekil maddeleri (tenant, self-approval, four-eyes, hash, stale onay, cross-tenant okuma, published-only/reversal filtresi) I02–I05'te ayrı ayrı merge edilmiş suite'lerde **zaten** yük taşımaktadır; I06 bunları tekrar iddia etmek yerine happy-path + restart + concurrency + provider-failure kanıtına odaklandı. Dört senaryolu provider hata matrisi (timeout/retryable/terminal/mesaj-ID-siz) hiçbirinin `PUBLISHED` üretmediğini ve yayınlanmamış kaydın portalda görünmediğini DB + projeksiyon üzerinden kanıtladı.

### 47.7 Restart Proof

İKİ AYRI `TestingModule` + İKİ AYRI `PrismaClient` (aynı service instance'ında ikinci çağrı DEĞİL): Instance A kalıcı niyeti (`SEND_PENDING`) yazıp tamamen kapanır (DI grafiği + bağlantı yok edilir); Instance B yepyeni DI grafiğiyle devralır; provider tam bir kez çağrılır, tek message ID, deterministik `PUBLISHED`. İkinci senaryoda A gönderim sırasında düşer (sahiplenme kalıcı işaretli kalır); B'nin kör dispatch denemesi reddedilir; kurtarma yalnız explicit `retrySend()` ile, canonical yoldan.

### 47.8 Concurrency Proof

İki AYRI instance aynı versiyonu eşzamanlı yayınlar: tek kazanan, tek provider çağrısı, tek `PUBLISHED` geçişi, deterministik kaybeden (last-write-wins yok), tek `PUBLISHED` audit kaydı.

### 47.9 Diş (Teeth) Defteri — Metodolojik Dürüstlük Kaydı

```text
I02  5/5   app.module kaydi · fail-closed provider adi · dispatcher basari-taklidi ·
           clean-arch siniri · controller yasagi
I03  5/5   aktivasyon kapisi · yetki · tenant scope · POSTED durum kapisi ·
           deterministik idempotency
I04  6/6   fail-closed fallback · message ID zorunlulugu · retryable/terminal ayrimi ·
           alici guard'i · basari-taklidi · provider call-count korumasi
I05  4/4   yayinlama kapisi · kati-literal parser · onaysiz adapter engeli ·
           hassas alan filtresi
I06  3/5   restart tek-kazanan (YENI) · yayinlama kapisi gercek graph (YENI) ·
           message ID zorunlulugu gercek graph (YENI)
     2 madde CIKARILDI: ilk mutasyon turunda "published-only filtre" ve "duplicate
     publication guard" icin denenen mutasyonlar ilgili testleri KIRMADI — gercek
     enforcer ayni WHERE kosulundaki BASKA bir alandi (publishedAt/providerMessageId
     NULL kontrolu), statu kismi bu implementasyonda REDUNDANT'tir. Bu iki koruma
     zaten I04 (test [F]) ve I05'te (test [D]) AYRI enforcer yollarindan dis tasidigi
     KANITLANMISTI; I06'da yanlis bir "yeni dis" iddia etmek yerine capraz referans
     verildi ve iki hatali mutasyon SILINDI.
TOPLAM DOGRULANMIS MUTASYON: 23  (5+5+6+4+3)
```

I02'nin `[D]`/`[E]` testinde de benzer bir metodolojik düzeltme yaşanmıştı (ekleme-mutasyon ilk turda yanlış alarm verdi, doğrulayıcı düzeltilip yeniden koşuldu). Bu program boyunca **hiçbir diş iddiası doğrulanmadan bırakılmamıştır**.

### 47.10 CI İstisna Defteri

```text
PR #1827 (I05) ilk hazirlanis: Orchestration Tests origin/main'de FAILURE
  KAYNAK        : origin/main, PR #1824 (baska oturum), commit 70337658
  KANIT         : basarisiz test seti (DV20/382/AC05/AC14/AC15/AC18/AC19/AC20) origin/main
                  ile BIREBIR ayniydi; PR diff'i 0 orchestration dosyasina dokunuyordu;
                  required check'ler (Web Tests, Architectural Guardrails) SUCCESS'ti
  OWNER KARARI  : bu somut durum icin sinirli merge istisnasi (BAGLAYICI OWNER KARARI)
  SONUC         : merge oncesi son kapida origin/main baska bir oturum tarafindan
                  yesile DONDURULMUSTU (commit e7455888); PR #1827 REBASE edildi ve
                  ISTISNA KULLANILMADAN tam 9/9 CI ile merge edildi
  ISTISNA KAPSAMI: yalniz bu PR + yalniz bu failure seti + yalniz bu kaynak;
                  standing exception DEGILDIR, baska PR'a TASINAMAZ (fiilen de tasinmadi)
PR #1840 (I06)   : 9/9 CI (Orchestration Tests dahil) — istisna GEREKMEDI
```

### 47.11 Rollback

```text
CLIENT_FINANCIAL_DISCLOSURE_PUBLICATION_ENABLED=false
CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED=false
```

Bugünkü fiili durum zaten budur (her iki bayrak hiçbir ortamda `'true'`ya ayarlanmamıştır — repository dışı doğrulama, §47.12). Yeni yazma durur, yeni dış yayınlama durur; portal read yolu etkilenmez; mevcut yayınlanmış kayıtlar okunabilir kalır (I06 test [1]/[5] ile kanıtlı).

### 47.12 Production Verification Sınırı

```text
REAL PRODUCTION VERIFICATION : NOT PERFORMED / OWNER-GATED
```

Gerçek e-posta gönderilmedi, canlı `hukuk_db`'ye dokunulmadı, production secret okunmadı, production flag hiçbir ortamda açılmadı. Bunun için gerçek deployment, gerçek production flag'ler, gerçek provider credential'ı, owner-onaylı gerçek alıcı, delivery kanıtı ve runtime logları gerekir — hiçbiri bu programın kapsamında değildi.

### 47.13 Final Capability Matrix

```text
Capability     Code   Binding  Call-site  Adapter  Tests  Teeth  Runtime
Writer         PASS   PASS     PASS       N/A      PASS   PASS   FAKE/SANDBOX VERIFIED
Approval       PASS   PASS     PASS       N/A      PASS   PASS   FAKE/SANDBOX VERIFIED
Publication    PASS   PASS     PASS       PASS     PASS   PASS   FAKE/SANDBOX VERIFIED
Notification   PASS   PASS     PASS       PASS     PASS   PASS   FAKE/SANDBOX VERIFIED
Portal read    PASS   PASS     PASS       N/A      PASS   PASS   VERIFIED
Reversal       PASS   PASS     PASS       N/A      PASS   PASS   FAKE/SANDBOX VERIFIED
```

`FAKE/SANDBOX VERIFIED` = gerçek Nest composition + gerçek PostgreSQL + gerçek servis zinciri, sahte olan yalnız provider'ın ağ çağrısı. `REAL PROVIDER NOT VERIFIED`.

### 47.14 Final Verdict

```text
CLIENT-FINANCIAL-DISCLOSURE-PRODUCTION-ACTIVATION-R01

CLOSED / CANONICAL / ACTIVATION READY
REAL PRODUCTION VERIFICATION: OWNER-GATED / NOT PERFORMED

RUNTIME: WRITE + APPROVAL + PUBLICATION PATH BOUND AND REACHABLE (flags default OFF)
         PORTAL READ PATH LIVE (degismedi)
CLIENT-VISIBLE FINANCIAL DATA: SERVER-AUTHORIZED PROJECTION ONLY
LIVE CRITICAL BLOCKER: NONE
```

### 47.15 Residuals ve Owner-Gated Kalemler

```text
A. GERCEK PRODUCTION SAGLAYICI  : EMAIL_PROVIDER'in gercek smtp/sendgrid/ses degerine
                                   ayarlanmasi ve gercek credential. REPOSITORY DISI.
B. IKI BAYRAGIN PRODUCTION'DA   : CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED ve
   ACILMASI                       ...PUBLICATION_ENABLED'in gercek ortamda 'true'
                                   yapilmasi. REPOSITORY DISI, OWNER KARARI GEREKIR.
C. KALAN 10 TELEMETRI EVENT'I   : office/content approval ve publication event'lerinin
                                   emisyonu icin domain servislerine logger-port
                                   enjeksiyonu. AYRI BIR DILIM, BU PROGRAMDA YAPILMADI.
D. GERCEK PRODUCTION DOGRULAMA  : gercek alici, gercek deployment, runtime log kaniti.
                                   REPOSITORY DISI.
```

### 47.16 Program Closure Self-Check

Bu bölüm: production flag'lerini AÇMAZ; gerçek e-posta göndermez; production secret okumaz; live database mutasyonu yapmaz; `PRODUCTION VERIFIED` iddia ETMEZ; §35–§46'nın kendi metinlerini DEĞİŞTİRMEZ; Track A veya diğer CLIENT dilimleri hakkında hüküm VERMEZ; UYAP/OFFICE/RCV/DEBTOR statülerini DEĞİŞTİRMEZ.

**ACTIVATION READY ≠ PRODUCTION VERIFIED · CODE BOUND ≠ FLAG ON · FLAG DEFAULT OFF ≠ FEATURE DISABLED FOREVER.**

## §48 Production Verification Kapanışı (CLIENT-FD-VERIFICATION-R01)

Bu bölüm additive'dir. §1–§47'nin hiçbir metni bu bölümle DEĞİŞTİRİLMEDİ, SİLİNMEDİ veya yeniden yazılmadı — §47.12/§47.14'teki "NOT PERFORMED" ifadeleri yalnız §48.6'daki POINTER ile güncel-dışı işaretlenir, kendi metinleri byte-unchanged kalır.

### 48.1 Program Özeti

§47.12'nin "NOT PERFORMED / OWNER-GATED" bıraktığı REAL PRODUCTION VERIFICATION kalemini kapatan ayrı, takip programı. Bu program §47'nin zaten canonicalize ettiği runtime binding'in GERÇEK provider ile çalıştığını ampirik olarak KANITLAMAYA yöneliktir; yeni bir capability, mimari veya kalıcı aktivasyon eklemedi.

### 48.2 Yürütme Modeli — Owner Kabulü

```text
Agent production secret okumadi.
Agent production credential kullanarak gercek dis gonderim tetiklemedi.
Agent canli runtime feature flag'lerini degistirmedi.
Agent gercek e-posta gondermedi.
```

Bu dört sınır owner'ın "SAFE PRODUCTION VERIFICATION HANDOFF" mesajının "SINIR KABULÜ" bölümünde birebir kabul ettiği, ajanın kendisinin iki pushback turunda savunduğu sınırdır. Yürütme ikiye bölündü: **AGENT-EXECUTED** runtime hazırlığı (`HY_WT/RUNTIME` git sync, build, restart, boot doğrulama, secret-safe presence-only kontrol, owner-çalıştırılabilir runbook hazırlığı) ve **OWNER-EXECUTED** gerçek aktivasyon + gönderim (flag'leri yalnız kendi terminal oturumuna yükleme, `fixture`→`write`→`publish`→`cleanup` aşamalarını bizzat çalıştırma).

### 48.3 Runbook Güvenlik Tasarımı

`prod-verification-run.cjs`: alıcı (`info@tellihukuk.com`) sabit, script argümanından değiştirilemez. `assertWriteEnabled()`/`assertPublicationEnabled(providerName)`, canonical `isDisclosureWriteEnabled()`/`isDisclosurePublicationEnabled()`/`CLIENT_FINANCIAL_DISCLOSURE_APPROVED_PROVIDERS` mantığını script içinde bağımsızca tekrarlar — script gerçek Nest DI'ı hiç boot etmediği için (`dotenv` script dizininden resolve olmuyor, `ConfigModule.forRoot()` çalışmıyor) bu tekrar ZORUNLUYDU; aksi halde script canonical composition'daki flag kapılarını SESSİZCE atlar ve flag KAPALI olsa bile gerçek gönderim yapabilirdi (bu boşluk ajan tarafından teslimden ÖNCE bulundu ve kapatıldı). Owner'a teslim edilen mekanizma `.env` dosyasını DEĞİŞTİRMEK değil, yalnız owner'ın kendi terminal oturumunun ortam değişkenlerini kullanmaktı — canlı sunucu process'ine hiç dokunulmadı, hiçbir şey diske kalıcı yazılmadı, terminal kapatılınca her şey otomatik silindi.

### 48.4 Kanıt Kompozisyonu

| Kalem | Kaynak | Etiket |
|---|---|---|
| `write` çıktısı: `CONTENT_APPROVED`, `providerCallCount=0` | Owner stdout raporu | OWNER-ATTESTED |
| `publish` çıktısı: `status=PUBLISHED`, `providerMessageId`, `approvedRecipientEmail=info@tellihukuk.com`, `publishedAt` | Owner stdout raporu | OWNER-ATTESTED |
| `info@tellihukuk.com` gelen kutusunda gerçek e-posta | Owner Outlook ekran görüntüsü | OWNER-ATTESTED (yapısal olarak ajanın erişemeyeceği tek kanıt) |
| Cleanup sonrası `PRODVERIFY-` satır sayısı (12 tablo) | Ajanın bu turdaki Prisma count sorgusu (satır içeriği okunmadı) | AGENT-VERIFIED — hepsi 0 |
| Runtime sağlığı (port 8080, 401 guard) | Ajanın bu turdaki `curl` doğrulaması | AGENT-VERIFIED |
| Deployed SHA'nin Program B işini içerdiği | Ajanın bu turdaki `git merge-base --is-ancestor eb4aab69 HEAD` doğrulaması | AGENT-VERIFIED |

Owner-attested kalemler ASSUMED/INFERRED değil, owner'ın kendi ortamında yalnız owner'ın üretebileceği birincil kanıt olarak kabul edilmiştir — dört sınır gereği bunlar zaten ajan tarafından GÖRÜLEMEZ, tasarım gereği.

### 48.5 Beklenmeyen Bulgu — SHA Mutabakatı

Ajan bu turda runtime process'in kendi görünür eylemleri DIŞINDA bir noktada yeniden başlatıldığını tespit etti (PID 35384→59604; worktree HEAD `36208cdbab07a712a79756151b065270b88c64ae`→`3c73708da29bceb71421edb6d00a6d8713f196a0`). Araya giren commit'ler:

```text
3c73708d feat(office): scope ReportingLine telemetry to a canary tenant/actor cohort (#1849)
0970fc31 docs(governance): dort program aktivasyon karar paketi (#1851)
d0cd266c fix(governance): attribute overlapping owner-WIP path protections (#1850)
```

`git diff --stat` ile üçünün de yalnız OFFICE telemetry-scope ve governance-coordination dosyalarına dokunduğu, `client-financial-disclosure/` veya `notification/email-provider.service.ts` yüzeyine SIFIR dokunuş olduğu doğrulandı. Kim/ne zaman/neden yeniden başlattığı ajan tarafından BİLİNMİYOR, tahmin EDİLMEDİ — bu bulgu doğrulamanın geçerliliğini ETKİLEMEZ, yalnız kayıt hassasiyeti için saklanır.

### 48.6 Final Verdict

```text
CLIENT-FINANCIAL-DISCLOSURE-PRODUCTION-VERIFICATION-R01

CLOSED / CANONICAL / PRODUCTION VERIFIED
KANIT KOMPOZISYONU: OWNER-ATTESTED (gonderim + teslim) + AGENT-VERIFIED (DB + runtime + SHA)

§47 GUNCELLEME (POINTER, MUTASYON DEGIL):
  §47.12 "REAL PRODUCTION VERIFICATION: NOT PERFORMED / OWNER-GATED" -> bu bolum (§48) ile
    SUPERSEDE edildi; §47'nin kendi metni DEGISMEDI, byte-unchanged kaldi.
  §47.14 Final Verdict -> CLIENT-FINANCIAL-DISCLOSURE-PRODUCTION-ACTIVATION-R01 artik
    ACTIVATION READY + PRODUCTION VERIFIED.

IKI BAYRAK: hala varsayilan KAPALI (bu bir dogrulama kosuydu, kalici aktivasyon DEGIL)
LIVE CRITICAL BLOCKER: NONE
```

### 48.7 Temizlik ve Kalan İş

`prod-verification-run.cjs` ve `PRODVERIFY-RUNBOOK.md`, doğrulama tamamlandıktan sonra `HY_WT/RUNTIME`'dan silindi — tek seferlikti, kalıcı değildi, git'e hiç commit edilmedi. Kalan iş: **NONE**. Owner'ın kendi notu gereği, mimari veya provider değişikliği olmadıkça yeni bir verification programı gerekmez.

**PRODUCTION VERIFIED, BİR KEZ KANITLANMIŞTIR — KALICI AKTİVASYON DEĞİLDİR. İKİ BAYRAK YARIN DA VARSAYILAN KAPALI KALIR.**

## §49 ClientAddress Yaşam Döngüsü, Arşiv, Primary ve Uyumluluk Sözleşmesi (ARC-07)

Bu bölüm additive'dir. §1–§48'in hiçbir metni DEĞİŞTİRİLMEDİ, SİLİNMEDİ veya yeniden yazılmadı. **GOVERNANCE-ONLY: bu bölüm hiçbir runtime davranışı, schema, migration veya veri mutasyonu YETKİLENDİRMEZ.** `IMPLEMENTATION AUTHORITY: NONE` — her uygulama dilimi ayrı owner GO gerektirir.

### 49.1 Kapsam ve Amaç

`ARC-07` (master-triage-register §D) owner tarafından bilinçli olarak kapsam-dışı bırakılmış bir kalemdi: `ClientAddress` backfill (flat→tablo) + `isCurrent` arşiv UI + dedicated GET endpoint. `VER-02` (§ilgili kayıt: `decision-log.md` `CLIENT-VER-02-ADDRESS-PERSIST-R01`) kapanırken bu üç kalem açıkça ERTELENDİ. Bu bölüm, owner'ın `CLIENT-ARC-07-ADDRESS-CURRENT-ARCHIVE-OWNER-DECISION-R01` ve `CLIENT-ARC-07-D07-PRODUCTION-ADDRESS-EVIDENCE-R01` analizleri sonrasında verdiği **D01–D07 kararlarını kanonikleştirir** — herhangi bir arşiv/restore implementasyonu, production kanıt toplama, backfill veya kaynak-otorite göçü BAŞLAMADAN ÖNCE.

### 49.2 ARC-07-D01 — `isCurrent` Anlamı (OWNER RATIFIED)

```text
isCurrent = ACTIVE / NOT ARCHIVED
```

`isCurrent` ŞU ANLAMLARA GELMEZ: birincil adres · seçili yazışma adresi · en son kullanılan adres · portal-görünür adres · hukuken otoriter adres.

**Birden çok `isCurrent=true` satır İZİNLİDİR** — farklı tipteki (MERNIS/TICARI/TEBLIGAT/FATURA/BEYAN) adreslerin eşzamanlı aktif olması normal ve kasıtlı durumdur.

### 49.3 ARC-07-D02 — `isPrimary` ile İlişki (OWNER RATIFIED)

```text
isPrimary=true            -> isCurrent=true ZORUNLU
isCurrent=false           -> isPrimary=false ZORUNLU
en az bir current varsa   -> current'lar arasında TAM BİR primary
sıfır primary             -> YALNIZ sıfır current varken izinli
çok current               -> İZİNLİ
çok primary               -> YASAK
```

`OBJECT SELECTION (isPrimary) ≠ LIFECYCLE STATE (isCurrent)` — iki eksen bağımsızdır ve birbirinin yerine kullanılamaz.

### 49.4 ARC-07-D03 — Arşiv Yaşam Döngüsü (İLKESEL OLARAK ONAYLANDI)

```text
archive        : EXPLICIT lifecycle action
restore        : EXPLICIT lifecycle action
audit          : archive + restore icin ZORUNLU
primary arsiv  : deterministik yeniden-atama OLMADAN YAPILAMAZ
fiziksel silme : FAIL-CLOSED
fiziksel silme, arsivin YERINE KULLANILAMAZ
hard delete    : POL-E on kosullari acikca karsilanana kadar YETKISIZ
```

**Bu governance görevi hiçbir runtime implementasyonu YETKİLENDİRMEZ** — arşiv/restore servisi, endpoint ve audit kodu `I02` dilimine aittir.

### 49.5 ARC-07-D04 — Backfill Governance (İLKESEL OLARAK ONAYLANDI)

Zorunlu sıra ve koşullar: dry-run apply'dan ÖNCE · production sayımları mutasyondan ÖNCE · owner-gated apply · idempotent eligibility · açık duplike ele alma · açık conflict kovaları · **açık run provenance** · açık post-apply doğrulama · rollback sınırları apply'dan ÖNCE belgelenir.

**PROVENANCE MEKANİZMASI ZORUNLU DEĞİL, SEÇİLECEK:** Prisma şemasına run-tag kolonu eklenmesi **ZORUNLU DEĞİLDİR**. İzin verilen mekanizmalar arasında şunlar bulunabilir: immutable evidence ledger · migration execution record · run manifest · deterministik inserted-record listesi · bounded audit metadata. **Implementasyon görevi, repository gerçeğinin desteklediği EN DAR mekanizmayı seçer.**

### 49.6 ARC-07-D05 — Kaynak-Otorite Geçişi (AŞAMALI STRATEJİ ONAYLANDI)

```text
STAGE 1  Gecici tek-yon uyumluluk yazimi KALIR.
STAGE 2  Legal/UYAP/dokuman/validation tuketicileri acik bir ClientAddress
         resolver/adapter'a RETARGET edilir.
STAGE 3  YALNIZ tuketici hazirligi KANITLANDIKTAN SONRA legacy flat yazimlar
         azaltilabilir veya durdurulabilir.
```

Sözleşme hükümleri: `ClientAddress` **hedeflenen gelecek yapısal kaynaktır**. Legacy `Client` flat alanları **bugün aktif uyumluluk yüzeyleridir**. Resmî tüketiciler ve validation gate'leri flat-bağımlı kaldığı sürece **flat yazımlar DURDURULAMAZ**. Çift-kaynak belirsizliği **ölçülmeli ve açıkça çözülmelidir**. **Sessiz kaynak-otorite değişimi YASAKTIR.**

### 49.7 ARC-07-D06 — Read/History Sözleşmesi (OWNER RATIFIED)

Gerekli: aktif-adres read sözleşmesi · arşiv/history read sözleşmesi · **staff-only** · tenant/client scoped · audit-görünür. **Client portal expozürü YOK** — portal expozürü ayrı bir CLIENT visibility policy kararı gerektirir (POL-D/POL-F/BP-06 sınırları içinde).

### 49.8 ARC-07-D07 — Production Kanıtı (OWNER RATIFIED)

```text
production kanit          : production backfill APPLY oncesi ZORUNLU
sorgulanan hukuk_db Docker: DEVELOPMENT/INTEGRATION kaniti olarak SINIFLANDIRILDI
                            production olarak KABUL EDILMEDI
local/integration sayimlar: production sayimi olarak ATIF EDILEMEZ
production mutasyonu      : AYRICA owner-authorized
lifecycle contract + test : production verisi OLMADAN ilerleyebilir
production backfill design: temsili kanit olmadan KAPANAMAZ
```

### 49.9 POL-E Hizalaması

`ClientAddress`, POL-E'nin (§24) 18 bağımsız retention/deletion sınıfından biri olan **"client address"** ailesine aittir ve **korunan bir iş kaydı ailesidir**.

- Mevcut runtime hard-delete davranışı bir **implementasyon residual'ıdır**.
- **Bu governance kaydı tarihsel silmeleri geriye dönük SINIFLANDIRMAZ.**
- Gelecekteki destructive lifecycle aksiyonları **FAIL-CLOSED**'dır.
- Arşiv/restore implementasyonu **audit evidence GETİRMEK ZORUNDADIR**.
- Fiziksel silmeye izin verilmeden önce POL-E'nin sekiz koşulu çözülmelidir: record-family owner · terminal event · retention basis · evidence dependency · cross-domain dependency · hold status · reference integrity · authorized deletion method.

**POL-E implementasyonunun genel olarak tamamlandığı İDDİA EDİLMEZ.**

### 49.10 AS-IS Durum (ÖLÇÜLMÜŞ, hedef DEĞİL)

```text
isCurrent varsayilan       : true
isCurrent=false YAZAN kod  : YOK (repo-genelinde sifir production yolu)
archive endpoint           : YOK
restore endpoint           : YOK
hard delete                : VAR
hard delete guard          : YALNIZ primary silmeyi engeller
ClientAddressService audit : YOK (adres yasam dongusu audit'i sifir)
dedicated GET/history      : YOK
ClientAddress'e inbound FK : YOK
legacy flat Client alanlari: GENIS OLCUDE TUKETILIYOR
legal/UYAP/dokuman/validation tuketicileri: FLAT-BAGIMLI
production ClientAddress dagilimi: BILINMIYOR
```

`isCurrent` şu an **fiilen inert'tir**: `client.service.ts` içindeki `where: { isCurrent: true }` filtresi hiçbir satırı diskalifiye etmediği için pratikte pass-through'dur.

### 49.11 TARGET Sözleşme (HENÜZ UYGULANMADI)

D01–D07 hükümleri hedef sözleşmedir. **Hiçbiri şu an implementasyonda mevcut DEĞİLDİR.** `AS-IS ≠ TARGET` — bu bölüm hedef davranışı halihazırda uygulanmış gibi SUNMAZ.

### 49.12 Bounded Context Sınırı

**CLIENT SAHİBİDİR:** `ClientAddress` yaşam döngüsü · active/archive semantiği · `ClientAddress` primary invariant'ı · staff-side Client adres geçmişi · `ClientAddress` uyumluluk geçişi.

**CLIENT SAHİBİ DEĞİLDİR:** `DebtorAddress` yaşam döngüsü · ACT-23 · debtor service-attempt adres seçimi · UYAP domain law · document domain law · OFFICE access-scope enforcement.

Dış tüketiciler ileride kanonik `ClientAddress` resolver'ını tüketebilir; fakat **CLIENT onların domain mantığını YENİDEN UYGULAMAZ.**

**ACT-23 İLİŞKİSİ: SHARED VOCABULARY ONLY.** Paylaşılan schema, servis, migration veya writer bağımlılığı **YOKTUR** — `ClientAddress` ile `DebtorAddress` sıfır kod/şema paylaşır ve `ClientAddress`'e hiçbir inbound FK bulunmaz (`CaseDebtor.selectedAddressId` yalnız `DebtorAddress`'e bağlıdır). Benzer terminoloji teknik bağımlılık DEĞİLDİR.

### 49.13 Implementation Train (KANONİK SIRA)

```text
I01  CLIENT-ARC-07-LIFECYCLE-INVARIANT-I01
     saf lifecycle resolver/invariant sozlesmesi · service-level validation ·
     odakli testler · production veri mutasyonu YOK · repository gercegi
     kacinilmaz kilmadikca schema migration YOK
I02  CLIENT-ARC-07-ARCHIVE-RESTORE-AUDIT-I02
     explicit archive · explicit restore · primary yeniden-atama kurali ·
     hard-delete fail-closed · adres yasam dongusu audit'i
I03  CLIENT-ARC-07-STAFF-HISTORY-I03
     staff-only active/history GET · UI archive/restore/history ·
     tenant/client scope · portal expozuru YOK
I04  CLIENT-ARC-07-PRODUCTION-EVIDENCE-I04
     gercek production count-only kanit · mutasyon YOK
I05  CLIENT-ARC-07-BACKFILL-DRY-RUN-I05
     dry-run · eligibility/conflict kovalari · provenance tasarimi · apply YOK
I06  CLIENT-ARC-07-BACKFILL-APPLY-I06
     ayrica owner-authorized production mutasyonu · yalniz production kaniti
     ve dry-run onayindan SONRA
I07  CLIENT-ARC-07-OFFICIAL-CONSUMER-ADAPTER-I07
     UYAP · dokuman/sablonlar · validation gate'leri · ilgili web akislari ·
     acik adres resolver
I08  CLIENT-ARC-07-LEGACY-FLAT-REDUCTION-I08
     kaynak-otorite gocu · uyumluluk-yazimi azaltimi · yalniz resmi tuketici
     hazirligindan SONRA
```

### 49.14 Canonical NEXT

```text
NEXT ELIGIBLE IMPLEMENTATION TASK:
NONE — ARC-07 MUHENDISLIK ZINCIRI TAMAMLANDI

STATUS: ENGINEERING COMPLETE / WAITING FOR PRODUCTION DEPLOYMENT PROGRAM

TAMAMLANAN DILIMLER (muhendislik zinciri):
I01  CLIENT-ARC-07-LIFECYCLE-INVARIANT-I01        CLOSED / VERIFIED   PR #1943
I02  CLIENT-ARC-07-ARCHIVE-RESTORE-AUDIT-I02      CLOSED / VERIFIED   PR #1958
I03  CLIENT-ARC-07-STAFF-HISTORY-I03              CLOSED / VERIFIED   PR #1961
I04A CLIENT-ARC-07-CREATE-UPDATE-AUDIT-I04A       CLOSED / VERIFIED   PR #1970
I07  CLIENT-ARC-07-OFFICIAL-CONSUMER-ADAPTER-I07  CLOSED / VERIFIED   PR #1979

DEPLOYMENT-BAGIMLI DILIMLER (owner karari, 2026-07-30 — TEKNIK BLOK DEGIL, PROGRAMATIK BEKLEME):
I04  CLIENT-ARC-07-PRODUCTION-EVIDENCE-I04     DEFERRED — authoritative production ortami MEVCUT DEGIL
I05  CLIENT-ARC-07-BACKFILL-DRY-RUN-I05         BLOCKED — WAITING FOR PRODUCTION DEPLOYMENT PROGRAM
I06  CLIENT-ARC-07-BACKFILL-APPLY-I06            BLOCKED — WAITING FOR PRODUCTION DEPLOYMENT PROGRAM
I08  CLIENT-ARC-07-LEGACY-FLAT-REDUCTION-I08     BLOCKED — WAITING FOR PRODUCTION DEPLOYMENT PROGRAM
```

Bu bölüm hiçbir dilimi **başlatmaz**. `I04`→`I05`→`I06`→`I08` zinciri mühendislik eksikliği DEĞİL, authoritative production ortamının (deployment) HENÜZ VAR OLMAMASI nedeniyle bekliyor — bu fark owner'ın 2026-07-30 kararıyla açıkça kayıtlıdır (bkz. §49.17). §49.6 D05 Stage 3 hükmü hâlâ geçerlidir: legacy flat azaltımı yalnız tüketici hazırlığı kanıtlandıktan SONRA başlar — I07 bu kanıtın **bir parçasıdır** (resmî tüketiciler artık flat-bağımlı DEĞİL), TAMAMI DEĞİLDİR (flat YAZIM hâlâ devam ediyor, VER-02 create/update). Program gerçek bir production deployment owner tarafından yetkilendirilip oluşturulduğunda YENİDEN AÇILIR; `I04`/`I05`/`I06`/`I08` **otomatik olarak YETKİLENDİRİLMEZ**.

### 49.15 Statü Kesinliği

```text
ARC-07                     : ENGINEERING COMPLETE / WAITING FOR PRODUCTION DEPLOYMENT PROGRAM
VER-02                     : CLOSED / VERIFIED (degismedi)
CLIENT-DOCUMENT-ADDRESS-OUTPUT-DEFECT-R01 : CLOSED / VERIFIED (degismedi)
ACT-23                     : UNAFFECTED
PRODUCTION DATA            : NOT VERIFIED
RUNTIME                    : I01 + I02 ile DEGISTI (invariant guard, arsiv/restore, audit)
SCHEMA / MIGRATION         : DEGISMEDI (I01 ve I02 diff 0)
STAFF HISTORY API / UI     : IMPLEMENTED (I03); PORTAL EXPOZURU YOK
ADRES AUDIT GORUNURLUGU    : DEFERRED (yeniden kullanilabilir audit-history UI konvansiyonu yok)
CREATE/UPDATE AUDIT        : CLOSED / VERIFIED (I04A, PR #1970)
PRODUCTION EVIDENCE (I04)  : DEFERRED — owner beyani: production ortami yok/deploy edilmemis
BACKFILL (I05/I06)         : BLOCKED — WAITING FOR PRODUCTION DEPLOYMENT PROGRAM (programatik, teknik DEGIL)
OFFICIAL CONSUMER ADAPTER (I07): CLOSED / VERIFIED (PR #1979) — UYAP/document/template-engine artik
                             ortak ClientAddress resolver kullanir; flat YAZIM DURMADI (D05 Stage 1)
LEGACY FLAT REDUCTION (I08): BLOCKED — WAITING FOR PRODUCTION DEPLOYMENT PROGRAM (programatik, teknik DEGIL)
FIZIKSEL SILME             : FAIL-CLOSED (I02); POL-E on kosullari TEMSIL EDILMIYOR
BACKFILL                   : BLOCKED (I05/I06) — WAITING FOR PRODUCTION DEPLOYMENT PROGRAM
IMPLEMENTATION AUTHORITY   : NONE (I04/I05/I06/I08 icin gercek production ortami + owner GO gerekir)
CLIENT PROGRAM SONRASI ADIM: genel feature backlog'a doner — ARC-07'ye BAGLI DEGIL (bkz. §49.17)
```

### 49.16 Bölüm Self-Check

Bu bölüm: arşiv/restore İMPLEMENTE ETMEZ · `isCurrent` runtime davranışını DEĞİŞTİRMEZ · audit kodu EKLEMEZ · GET/history endpoint AÇMAZ · Prisma şemasını DEĞİŞTİRMEZ · migration ÜRETMEZ · backfill ÇALIŞTIRMAZ · production verisine ERİŞMEZ · `ClientAddress` satırlarını DEĞİŞTİRMEZ · legacy flat yazımları DEĞİŞTİRMEZ · UYAP/doküman tüketicilerini RETARGET ETMEZ · `DebtorAddress`'e DOKUNMAZ · ACT-23'ü DEĞİŞTİRMEZ · VER-02'yi YENİDEN AÇMAZ · Financial Disclosure'ı DEĞİŞTİRMEZ · §1–§48 metinlerini DEĞİŞTİRMEZ · POL-E implementasyonunun tamamlandığını İDDİA ETMEZ.

**OWNER DECISION RATIFIED ≠ IMPLEMENTED · CONTRACT CANONICAL ≠ BEHAVIOR CHANGED · AS-IS ≠ TARGET · DEV DATASET ≠ PRODUCTION EVIDENCE.**

### 49.17 Mühendislik Zinciri Kapanışı ve İki Hat Ayrımı (OWNER RATIFIED, 2026-07-30)

I01 → I02 → I03 → I04A → I07 dilimlerinin tamamlanmasıyla owner, ARC-07'nin **mühendislik geliştirme zincirinin** tamamlandığını ve kalan dilimlerin doğasının **değiştiğini** tespit etti: `I04`/`I05`/`I06`/`I08` artık "sıradaki uygun görev" değildir — bunlar **authoritative bir production ortamının var olmasına programatik olarak bağımlıdır**. Bu bir teknik eksiklik veya eksik implementasyon DEĞİLDİR; `CLIENT-ARC-07-PRODUCTION-EVIDENCE-I04`'ün owner tarafından `DEFERRED` ilan edilmesinin (§49.14) doğal sonucudur.

```text
ARC-07 STATU: ENGINEERING COMPLETE / WAITING FOR PRODUCTION DEPLOYMENT PROGRAM
```

**İKİ AYRI HAT:**

```text
HAT 1 — GELECEKTEKI DEPLOYMENT ZINCIRI (production programina bagli, bu program DEGIL):
  Production deployment yetkilendirilir/olusturulur
    -> I04  Production Evidence (D07 kanit sartlari)
    -> I05  Backfill Dry-Run
    -> I06  Backfill Apply (ayrica owner-authorized)
    -> I08  Legacy Flat Reduction

HAT 2 — CLIENT URUN GELISTIRME (ARC-07'ye BAGLI DEGIL, simdi acik):
  VER-02 (CLOSED) + ARC-07 muhendislik zinciri (CLOSED)
    -> CLIENT genel feature backlog'u (Client Workspace, cok-adres UX
       iyilestirmeleri, veya backlog'daki baska maddeler) — ARC-07
       kapanmasini veya production deployment'i BEKLEMEZ.
```

**KAPSAM AÇIKLIĞI:** bu bölüm ARC-07'yi **kapatmaz** ve `I04`–`I08`'i **iptal etmez** — Hat 1, gerçek bir production ortamı owner tarafından yetkilendirilip oluşturulduğunda **aynı kanonik sırayla** devam eder. Bu bölüm yalnız şunu netleştirir: (a) ARC-07'nin mühendislik geliştirme yükümlülüğü şu an için tamamlanmıştır, (b) kalan dilimlerin bekleme nedeni programatik (production yokluğu) olup teknik değildir, (c) CLIENT programındaki **sonraki implementasyon işi** artık ARC-07'nin kapanmasını şart koşmaz ve genel backlog'dan owner GO ile bağımsızca seçilebilir.

**Bu bölüm self-check:** production deployment OLUŞTURMAZ · I04–I08'i BAŞLATMAZ · backfill ÇALIŞTIRMAZ · production verisine ERİŞMEZ · §1–§49.16 metinlerini DEĞİŞTİRMEZ · yalnız §49.14/§49.15'in STATÜ bloklarını (kural metni değil) günceller.

## 50. Pasif (Soft-Deactivated) Müvekkil Okuma Politikası — OWN-14 (OWNER RATIFIED, 2026-08-01)

Bu bölüm `OWN-14` (Owner Decision Register, `master-triage-register.md`) kalemini kapatan
owner kararlarının kanonik kaydıdır. **ADDITIVE RESIDUAL CANONICALIZATION**: mevcut
owner-locked **Task 4A / karar #2** çekirdeği (`ClientService.findOne` VARSAYILAN olarak
`isActive:false` kaydı DÖNDÜRMEZ; `includeInactive` açık opt-in'dir) **AYNEN GEÇERLİDİR** —
silinmedi, yeniden ifade edilerek anlamı değiştirilmedi ve geriye dönük genişletilmiş gibi
gösterilmedi. Bu bölüm yalnız o çekirdeğin **yazılı olmayan residual politikasını**
(yüzey kapsamı, alt kayıt davranışı, cross-module sınırı) kanonikleştirir.

**KOD DAVRANIŞI DEĞİŞMEDİ.** Kanonikleştirmeyi hazırlayan READ-ONLY analiz
(`CLIENT-OWN-14-FINDONE-ACTIVE-POLICY-CANONICALIZATION-R01`) 14 CLIENT okuma noktasını
inceledi ve **kararın kendi kapsamı içinde SIFIR sapma** buldu; bu bölüm bir davranış
değişikliği yetkilendirmez.

### 50.1 D01 — Staff Discovery/Read Politikası (RATIFIED)

Pasif müvekkiller, CLIENT modülünün kullanıcıya dönük staff discovery/read yüzeylerinde
**varsayılan olarak gösterilmez.**

Bu kapsama **en az** şunlar girer:

```text
findAll
findOne
search
timeline
Client Workspace alt-okumalari
```

`includeInactive` **dış API/query yüzeyi olarak AÇILMAZ.**

Yalnız mutasyon sonrasında teknik response üretmek için kullanılan ve kodda açıkça
gerekçelendirilmiş **internal re-fetch** çağrıları `includeInactive:true` kullanabilir.

### 50.2 D01 — Cross-Module Sınırı (RATIFIED)

CLIENT dışındaki modüllerin şu amaçlı client okumaları **bu kararın KAPSAMI DIŞINDADIR:**

```text
FK/tenant dogrulamasi
tarihsel isim cozumleme
muhasebe ve delil butunlugu
gecmis kayitlarin okunmasi
```

**OWN-14 bu modüllere tek taraflı filtre politikası DAYATMAZ.** CLIENT staff discovery/read
politikası, tarihsel/referans amaçlı başka-domain okumalarına **otomatik uygulanmaz**.

### 50.3 D02 — Soft-Deactivation Etkisi (RATIFIED)

Client soft-deactivation **yalnız `Client.isActive=false` etkisi doğurur.**

Soft-deactivation:

```text
alt kayitlari SILMEZ
PASIFLESTIRMEZ
cascade mutation BASLATMAZ
tarihsel ve hukuki kayit butunlugunu BOZMAZ
```

`Case`, vekalet, adres, portal bağlantısı, muhasebe, belge, activity ve audit kayıtları
**korunur.**

Bu koruma, alt kayıtların **her kullanıcıya otomatik görünür olduğu anlamına GELMEZ.** Her
alt kaydın görünürlüğü, yetkilendirmesi ve lifecycle davranışı **kendi canonical domain
politikasına tabidir.**

**KAVRAM AYRIMI:** soft-deactivation; **arşivleme, KVKK fiziksel silme veya
anonimleştirme DEĞİLDİR.** (`ClientAddress.isCurrent=false` arşivleme ARC-07/§49'un ayrı
kavramıdır; fiziksel silme POL-E/§24'ün sekiz koşullu fail-closed kapısına tabidir ve
`ClientService.remove()` bunu YAPMAZ.)

### 50.4 D03 — Pasif Müvekkile Yeni Dosya: DEFERRED / CROSS-DOMAIN

Pasif müvekkile yeni dosya açılabilmesi **OWN-14 kapsamında kanonikleştirilmeyecek veya
değiştirilmeyecektir.**

Mevcut runtime davranışı bu turda **KORUNUR**, fakat owner tarafından arzu edilen nihai
politika olarak **RATIFİYE EDİLMİŞ SAYILMAZ.**

```text
D03 STATUS: DEFERRED / CROSS-DOMAIN / CURRENT RUNTIME UNCHANGED
```

Bu konu **CLIENT + CASE ortak sınırında, ayrı bir cross-domain karar maddesi** olarak
kaydedilmiştir. Bu turda CASE koduna veya governance alanına DOKUNULMAMIŞTIR; D03 için
implementation task AÇILMAMIŞ ve successor OTOMATİK BAŞLATILMAMIŞTIR.

### 50.5 Bölüm Self-Check

Bu bölüm: Task 4A / owner-locked karar #2 çekirdeğini DEĞİŞTİRMEZ · kod veya test davranışı
DEĞİŞTİRMEZ · `includeInactive`'i dış API yüzeyi AÇMAZ · CLIENT dışı modüllere politika
DAYATMAZ · CASE davranışını DEĞİŞTİRMEZ · alt kayıtların görünürlüğünü tek başına
BELİRLEMEZ · schema/migration ÜRETMEZ · production verisine ERİŞMEZ · ARC-07 kilidini
DEĞİŞTİRMEZ · CLIENT Phase 2 genel yetkisi DOĞURMAZ · Portal Phase 2'yi BAŞLATMAZ ·
§1–§49.17 metinlerini DEĞİŞTİRMEZ.

**RESIDUAL CANONICALIZED ≠ BEHAVIOR CHANGED · POLICY WRITTEN ≠ NEW AUTHORITY ·
SOFT-DEACTIVATION ≠ ARCHIVE ≠ ERASURE · D03 DEFERRED ≠ D03 RATIFIED.**


---

## §51 — CLIENT Same-Tenant Mutation Authorization (OWN-13 / I01)

Kaynak: owner kararlari **D01 / D02 / D03 (RATIFIED)** ve **EXECUTION GRANT: GO-IMPLEMENT /
BOUNDED I01**. Bu bolum ADDITIVE'dir; §1–§50.5 metinleri DEGISMEDI.

### 51.1 Neden bu bolum var (kanonik bosluk)

OWN-13 once "OFFICE/DEBTOR mimarisi kapsiyor" gerekcesiyle kapatilmak istenmis, owner bunu
REDDETMISTIR. Kanonik ayrim:

- `JwtAuthGuard` + `tenantId` = **authentication + tenant isolation**.
- `JwtAuthGuard` + `tenantId` **≠ same-tenant mutation authorization**.
- PR #762 yalnizca **deactivate/reactivate lifecycle gecislerini** korur.
- OFFICE/DEBTOR capability mimarisi CLIENT mutasyonlarini **otomatik kapsamaz**; yalniz
  yeniden kullanilabilir kanonik pattern / authority kaynagi olabilir.

Bu nedenle OWN-13 SUPERSEDED veya COVERED **sayilmaz**.

### 51.2 D01 — CREATE AUTHORITY (RATIFIED)

Muvekkil olusturma operasyonel bir buro islemidir.

| Rol | Karar |
|---|---|
| `UserRole.VIEWER` | DENY |
| `UserRole.USER` | ALLOW |
| `UserRole.ADMIN` | ALLOW |

Create icin **lawyer profili sart degildir**: sekreter, hukuk personeli ve yetkili operasyon
personeli USER rolüyle muvekkil olusturabilir. Create isleminde mevcut tenant isolation,
kimlik/checksum dogrulamalari, duplicate kontrolleri ve audit **korunur**.

### 51.3 D02 — UPDATE AUTHORITY (RATIFIED)

Once **coarse gate** uygulanir:

- VIEWER: hicbir CLIENT mutation yapamaz.
- USER: yalniz standart operasyonel alanlari guncelleyebilir.
- ADMIN: standart ve hassas alanlari guncelleyebilir.

**Standart operasyonel alanlar:** iletisim bilgileri · operasyonel notlar · tebrik/iletisim
tercihleri · hukuki kimligi veya temsil yetkisini degistirmeyen diger alanlar.

**Hassas alanlar:** kisi/sirket turu · TCKN/VKN ve diger resmi kimlik numaralari · ad/soyad
veya ticari unvanin hukuki kimligi degistiren bolumu · vergi dairesi/vergi kimligi ·
vekalet/temsil yetkisi niteligindeki alanlar · mevcut lifecycle alanlari · DTO'da bulunan ve
acikca standart allowlist'e alinmamis yeni alanlar.

**Hassas update icin:** (1) actor VIEWER olmamali; VE (2) actor `UserRole.ADMIN` **VEYA**
`officeApproval.isApproverEligible(actor)` olmalidir.

Bilinmeyen/yeni update alanlari **fail-closed** bicimde hassas kabul edilir. DTO alanlarinin
tamami siniflandirilmadan implementation yapilmaz.

**Ilk create islemi bu hassas-update ayriminin ISTISNASIDIR:** USER create yapabilir; mevcut
checksum, duplicate ve audit kapilari zorunludur.

**Partial update UYGULANMAZ:** tek request hem standart hem hassas alan iceriyorsa butun
request hassas yetki gerektirir.

### 51.4 D03 — AUTHORITY SOURCE (RATIFIED)

CLIENT icin **ikinci ve paralel bir rol/capability altyapisi kurulmayacaktir**. Iki mevcut
kaynak birlikte kullanilir:

- coarse mutation boundary: `UserRole.ADMIN / USER / VIEWER`
- elevated authority: `UserRole.ADMIN` **VEYA** mevcut `officeApproval.isApproverEligible(actor)`

CLIENT kendi action mapping politikasini tanimlar; ancak OFFICE eligibility **hesabini
kopyalamaz veya yeniden uretmez**. OFFICE/DEBTOR politikalari CLIENT'i otomatik kapsamaz;
yalniz mevcut authority primitive'leri yeniden kullanilir.

### 51.5 I01 kapsami (uygulanan)

1. `POST /clients` · 2. `PUT /clients/:id` · 3. mevcut deactivate/reactivate davranisinin
korunmasi · 4. gerekli API enforcement · 5. create/edit UI capability gorunurlugu ·
6. governance kayitlari · 7. odakli testler + mutation-teeth kanit.

Kanonik yuzeyler:

- `apps/api/src/modules/client/client-mutation-policy.ts` — saf, DB'siz merkezi politika.
  `classifyClientField` fail-closed'dir: lifecycle degilse ve standart allowlist'te yoksa
  **SENSITIVE**. `decideClientCreate` / `decideClientUpdate` / `deriveClientMutationCapabilities`
  stabil `reasonCode` uretir.
- `ClientController.create/update` — I01 route sinirinda kapi (`assertCanCreateClient` /
  `assertCanUpdateClient`). Kapi **route** seviyesindedir cunku `ClientService.create/update`
  ayrica servis-ici guvenilen cagiranlara da hizmet eder (bkz. §51.7 R1).
- `GET /clients/lifecycle-eligibility` — mevcut `eligible` alani DEGISMEDI; `capabilities`
  nesnesi **additive** eklendi. Frontend politikayi yeniden hesaplamaz.

### 51.6 Degismeyen davranislar (backward compatibility)

- Lifecycle gecisleri (`isActive` degisimi) **hala** `assertCanManageLifecycle` semantigine
  tabidir; OWN-13 bu esigi ne gevsetir ne degistirir. ADMIN olmak tek basina yeterli degildir.
- Mevcut response alanlari silinmedi/degistirilmedi · schema/migration YOK · mevcut ADMIN ve
  eligible-lawyer akislari korunmustur.
- Reddedilen mutasyon: 403 + stabil `reasonCode` + **yalniz alan ADLARI**. Ham TCKN/VKN veya
  baska bir alan DEGERI hata gövdesine, log'a veya audit'e yazilmaz.

### 51.7 I02 residual matrisi (ACILMADI, otomatik baslatilmaz)

Bunlar **kapali gosterilmez**; OWN-13 kapsaminda acik kalan yuzeylerdir:

| Id | Residual | Not |
|---|---|---|
| R1 | Servis-ici cagiranlarin actor threading'i | `case.service.ts` muvekkil cozumlemesi ve `export-import.service.ts` toplu ice aktarim `ClientService.create`'i actor'suz cagirir; yetki route sinirinda uygulanir, bu cagiranlar I01 DISIDIR |
| R2 | Address mutation endpoint'leri | ayri yetki yuzeyi |
| R3 | Bulk backfill | |
| R4 | Reminder/notification/document-request gonderimleri | |
| R5 | Intake-link mutation'lari | |
| R6 | POA upload | |
| R7 | OWN-10 / OWN-12 / OWN-15 | ayri task'lar |
| R8 | CASE/DEBTOR/OFFICE implementation | D03: otomatik kapsanmaz |
| R9 | schema/migration/production | |

### 51.8 Bolum Self-Check

Bu bolum: owner D01/D02/D03 metnini **lossless** tasir · yeni bir authorization modeli ICAT
ETMEZ · OFFICE eligibility hesabini KOPYALAMAZ · lifecycle esigini GEVSETMEZ · tenant
isolation'i DEGISTIRMEZ · schema/migration URETMEZ · production verisine ERISMEZ ·
§1–§50.5 metinlerini DEGISTIRMEZ · adres/bulk/notification/intake/POA yuzeylerini KAPALI
GOSTERMEZ.

**OWN-13 = PARTIAL (I01 CLOSED). "Butun CLIENT mutation authorization tamamlandi" IFADESI
GECERSIZDIR · AUTHENTICATION ≠ AUTHORIZATION · TENANT ISOLATION ≠ MUTATION AUTHORIZATION ·
ROUTE-LEVEL GATE ≠ SERVICE-WIDE GATE (bkz. R1).**

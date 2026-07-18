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

## 6. Cross-Domain Contract Map

Her sözleşme **referans-only**'dir; ilgili kardeş domainin kendi otoritesi bu charter'ın ÜSTÜNdedir.

### CLIENT ↔ OFFICE — authority, internal approval, actor identity

- **CLIENT PROVIDES:** client relationship / mandate / instruction context; onay talebi.
- **CLIENT CONSUMES:** internal approval kararı ve actor identity.
- **OTHER DOMAIN AUTHORITY:** OFFICE — actor / role / approval policy (`SYS-GOV-014`; OFFICE §15; ADR-009; OFF/OD-08/10/11).
- **CLIENT NON-AUTHORITY:** office role/personnel authority; approval actor kimliğini üretmek.
- **OPEN OWNER DECISION:** OFF/OD-06, OFF/OD-12, OFF/OD-13.

### CLIENT ↔ RECEIVABLE — creditor context vs receivable authority

- **CLIENT PROVIDES:** creditor identity / relationship context (creditor ucu).
- **CLIENT CONSUMES:** claim / receivable kompozisyonu (okuma).
- **OTHER DOMAIN AUTHORITY:** RECEIVABLE — claim item, principal/interest/cost, deterministic calculation (`SYS-GOV-017`).
- **CLIENT NON-AUTHORITY:** independent receivable balance veya legal allocation (`SYS-GOV-015`).
- **OPEN OWNER DECISION:** adlandırılmış CLIENT↔RECEIVABLE contract yüzeyi bugün örtüktür — gelecekte konsolide edilebilir.

### CLIENT ↔ COLLECTION — disposition, payable, payout, settlement

- **CLIENT PROVIDES:** creditor identity (disposition scope); ödeme-rota bağlamı.
- **CLIENT CONSUMES:** posted disposition sonucu (client payable / payout / offset / statement).
- **OTHER DOMAIN AUTHORITY:** COLLECTION — receipt, cash provenance, allocation-execution, money-out idempotency (`SYS-GOV-018`; COLLECTION §4.6; COL-IDEM-001; kabul edilmiş Client-offset ADR'i; DBIND §3/§5).
- **CLIENT NON-AUTHORITY:** collection ledger mutation; disposition'ı `clientId` ile kurmak.
- **OPEN OWNER DECISION:** client-settlement umbrella consolidation; COL/OD-07/08/09/10/14/15/19.

### CLIENT ↔ DEBTOR — client instruction/approval vs debtor legal status

- **CLIENT PROVIDES:** müvekkil onayı / talimatı (sulh bağlamı).
- **CLIENT CONSUMES:** debtor legal-status bağlamı (okuma).
- **OTHER DOMAIN AUTHORITY:** DEBTOR — debtor identity, legal role/status, sulh taslağı (`SYS-GOV-016`; DEBTOR §7/§8; OfficeApproval REUSE).
- **CLIENT NON-AUTHORITY:** debtor legal status; client disposition debtor yükümlülüğünü tek başına değiştiremez (`SYS-LEGAL-010`).
- **OPEN OWNER DECISION:** müvekkil görünürlük / self-service (MS/OD-10, MS/OD-11).

### CLIENT ↔ DOCUMENT / PORTAL — client-facing evidence and visibility

- **CLIENT PROVIDES:** client-facing görünürlük ve onay talebi.
- **CLIENT CONSUMES:** client-facing belge / evidence yüzeyleri.
- **OTHER DOMAIN AUTHORITY:** Constitution visibility ilkeleri (`SYS-AUTH-008` / `SYS-AUTH-012`); tenant containment kaydı (CLIENT-P0-T04-C1, canonical).
- **CLIENT NON-AUTHORITY:** other-tenant visibility.
- **OPEN OWNER DECISION:** portal / external-client authority; client-facing masking; KVKK retention / anonymization / legal hold.

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
- External approval vs staff-proxy provenance
- Calculation cutover
- Fee / harç producer ownership
- Reversal / manual recovery policy

## 9. Upgrade Rule

- **FULL CLIENT DOMAIN LAW:** Phase 0'da GEREKMEZ.
- **UPGRADE (charter → full Domain Law) yalnız şu koşullarda değerlendirilebilir:** charter sınırları yetersiz kalırsa, stable invariant hacmi materyal olarak büyürse, veya yeni Client-specific authority çatışmaları doğarsa.
- **UPGRADE AUTHORITY:** AYRI OWNER KARARI. Bu charter upgrade'i başlatmaz veya ima etmez.

## 10. Document Self-Check

Bu belge: yalnız Client ownership / invariants / cross-domain contracts konsolide eder; kendini full Domain Law olarak tanımlamaz; mevcut Domain Law veya owner-decision otoritesini yeniden sahiplenmez / override etmez; hiçbir yeni ürün / finans / portal / KVKK politikası seçmez; teknik mekanizma / route / model / field / exploit detayı içermez; **IMPLEMENTATION AUTHORITY: NONE**.

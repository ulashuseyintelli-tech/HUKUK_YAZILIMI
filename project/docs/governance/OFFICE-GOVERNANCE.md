# OFFICE Domain Governance — Domain Law

```text
Belge yolu   : project/docs/governance/OFFICE-GOVERNANCE.md
Durum        : RATIFIED / CANONICAL DOMAIN LAW (owner text-ratification: 2026-07-13; canonical SHA `6fa8395dc9d7f25d37a9330fe454b1d6724522a5`)
Sürüm        : v1.0 (ratifiye)
Rol          : DOMAIN LAW SOURCE OF TRUTH — vocabulary/ownership/boundaries/invariants/contracts
Kimlik uzayı : OFF-INV-01..OFF-INV-10 (bu belgenin invariant kimlikleri) — SYS-*/MS/* ile çakıştırılamaz
Sibling dossier'lar (bu belgenin İÇİNE gömülmez, yalnız referans verilir):
  - project/docs/governance/OFFICE-MASTER-SYNTHESIS.md (CANONICAL REFERENCE / NON-NORMATIVE EVIDENCE BASELINE)
  - project/docs/governance/OFFICE-RISK-REGISTER.md (STF-PRD-*, CANONICAL DOMAIN RISK DOSSIER)
  - project/docs/governance/OFFICE-OWNER-DECISIONS.md (OFF/OD-*, CANONICAL OPEN-DECISION DOSSIER)
```

Bu belge owner tarafından **RATIFIED / CANONICAL DOMAIN LAW** olarak text-ratifiye edilmiştir (`decision-log.md` ratifikasyon kaydı; canonical SHA `6fa8395dc9d7f25d37a9330fe454b1d6724522a5`; `SYS-CAN-001/SYS-DEC-002`). `SYSTEM-CONSTITUTION.md`'ye tabidir, onu değiştiremez/zayıflatamaz. Bu ratifikasyon tek başına runtime implementation, `STF-PRD-*` risklerinin triyajı, `OFF/OD-*` kararlarının kapanışı veya Phase 0 yetkisi vermez.

## RELATED DOCUMENTS

- Üst çatı: `SYSTEM-CONSTITUTION.md` · Okuma sırası: `GOVERNANCE-INDEX.md`
- Sibling domain governance: `DEBTOR-GOVERNANCE.md`, `RECEIVABLE-GOVERNANCE.md`
- Approval engine otoritesi: `docs/adr/ADR-009-UNIVERSAL-OFFICE-APPROVAL.md`
- Finansal self-approval otoritesi: `dbind-financial-authority-decisions.md`
- Global risk/triage otoritesi: `master-triage-register.md` · Yetkili iş sırası: `product-backlog.md`
- Kapanmış owner kararı otoritesi: `decision-log.md`

## 1. Status and Authority

Yukarıdaki başlık bloğu bu belgenin statü ve authority beyanıdır. Bu belge Domain Law'dır: yalnız vocabulary, ownership, boundaries, invariants ve cross-domain contracts taşır. Owner decision dossier'i ve risk dossier'i bu belgenin **dışındadır** (bkz. §23, §24 — yalnız reference-only tablo).

## 2. Constitutional Basis

`SYSTEM-CONSTITUTION.md §5 (SYS-GOV-013)`: beş primary legal-operation domain — OFFICE, CLIENT, DEBTOR, RECEIVABLE, COLLECTION. `SYS-GOV-014`: *"OFFICE actor, user/staff role, authorization, organizational responsibility ve office-level approval policy sahibidir."* Bu belge bu cümleyi ayrıntılandırır (`SYS-AUTH-002`); değiştiremez/zayıflatamaz.

## 3. Domain Ownership

```text
Person / actor identity boundary · UserAccount
Staff/Lawyer organizational identity (Employment/StaffProfile, LawyerCredential)
OrganizationMembership · OrganizationalTitle · SystemRole · PermissionGrant · ResourceAssignment
Office configuration authority boundary · Organizational responsibility
Office-level approval actor/policy boundary · Delegation
Session/lifecycle · Offboarding · Audit attribution · Personel read models
```

## 4. Non-Owned Domain Boundaries

| Domain | Sahip olduğu |
|---|---|
| CLIENT | client identity, mandate, instruction, client approval, client visibility (`SYS-GOV-015`) |
| DEBTOR | debtor identity, CaseDebtor, legal role, address/service evidence, legal status (`SYS-GOV-016`) |
| RECEIVABLE | claim item, principal/interest/cost bucket, deterministic calculation (`SYS-GOV-017`) |
| COLLECTION | receipt, cash provenance, idempotency, reversal, legal allocation bağlantısı (`SYS-GOV-018`) |

## 5. Canonical Vocabulary

| Kavram | Bağlayıcı tanım |
|---|---|
| Person | İnsanın stable identity kaydı; login hesabı/employment/credential değildir |
| UserAccount | Authentication ve platform hesabı; session/credential/MFA/token burada |
| OrganizationMembership | Person/UserAccount'ın tenant/organization bağlamındaki üyeliği; tenant-local |
| Employment / StaffProfile | Çalışma ilişkisi + HR lifecycle; login hesabı değil |
| LawyerCredential | Mesleki yeterlilik; baro/sicil/credential state |
| OrganizationalTitle | Org unvanı/governance statüsü; otomatik permission üretmez |
| SystemRole | Teknik platform rolü; iş unvanı değil |
| PermissionGrant | Belirli permission, belirli scope+geçerlilikle |
| ResourceAssignment | Kaynak üzerinde çalışma; otomatik access/approval authority üretmez |
| ApprovalAuthority | Role/title'dan ayrı; scope/amount/currency/validity/version taşır |
| Delegation | Delegator/delegate/authority/scope/start-end lifecycle |
| Tenant / Organization / Office / Team | Teknik izolasyon / iş varlığı / fiziksel büro / iş dağılım birimi |

**OFF-INV-01 (karıştırma yasağı):**
```text
Person ≠ UserAccount ≠ OrganizationMembership ≠ Employment/StaffProfile ≠ LawyerCredential
OrganizationalTitle ≠ SystemRole ≠ PermissionGrant
ResourceAssignment ≠ OperationalResponsibility ≠ LegalResponsibility ≠ TaskAssignment ≠ CaseAccess ≠ ClientAccess ≠ ApprovalAuthority
```

## 6. Person and Actor Identity Boundary

Person insanın stable identity kaydıdır. Person↔UserAccount cardinality'si açık owner kapısıdır (bkz. `OFFICE-OWNER-DECISIONS.md` OFF/OD-01); bu belge bir varsayım üretmez.

## 7. UserAccount

Authentication/platform hesabı; organizasyon ilişkisini temsil etmez (§9). Çoklu tenant/org membership desteği OFF/OD-02.

## 8. OrganizationMembership

Tenant/organization bağlamındaki üyelik; tenant-local state+authority taşır. **OFF-INV-02**: OrganizationMembership/Employment active-state, UserAccount active-state ile **aynı kavram değildir**.

## 9. Employment / StaffProfile

Çalışma ilişkisi ve HR lifecycle; login hesabı olarak kullanılamaz. Aynı anda çoklu aktif Employment OFF/OD-03; external counsel/contractor lifecycle'ı OFF/OD-04.

## 10. LawyerCredential

Mesleki yeterlilik; Employment/SystemRole/Membership değildir. Credential inactive iken case assignment eligibility invariant'ı hedef mimaride zorunludur (bkz. `OFFICE-MASTER-SYNTHESIS.md` LF-RT-10/OP-RT-11).

## 11. OrganizationalTitle, SystemRole and PermissionGrant

**OFF-INV-03**: OrganizationalTitle otomatik olarak sınırsız platform permission üretmez. "Partner" title/SystemRole ayrımı OFF/OD-05; "FoundingLawyer" tarihsel statüsü OFF/OD-06. PermissionGrant scope+geçerlilikle verilir; direct grant/deny desteği OFF/OD-09.

## 12. ResourceAssignment, Responsibility and Access

**OFF-INV-04**: ResourceAssignment, OperationalResponsibility, LegalResponsibility, TaskAssignment, CaseAccess, ClientAccess, ApprovalAuthority ayrı tutulur; biri diğerini otomatik üretmez. Case/client access ilişkisi OFF/OD-10; manager/team/office erişim kapsamı OFF/OD-08.

## 13. Authorization Invariants

**OFF-INV-05** — hedef zincir:
```text
Authentication → UserAccount active-state → OrganizationMembership/Employment active-state
→ Tenant resolution → Resource load → Permission evaluation → Object-scope evaluation
→ Business invariant → Atomic mutation → Audit
```
Frontend gate ≠ security boundary; JWT doğrulama ≠ permission kontrolü; tenant filter ≠ object-level scope; schema alanı ≠ enforcement kanıtı.

## 14. Office Configuration Authority Boundary

Office/branch configuration OFFICE authority'sindedir, §13 zincirinin tamamına tabidir. İlişkili risk: `OFFICE-RISK-REGISTER.md` → STF-PRD-CFG-001.

## 15. Office Approval Boundary

`ADR-009` `OfficeApprovalRequest` engine/executor için **tek otoritedir**; bu belge ikinci bir approval engine tasarlamaz. `dbind-financial-authority-decisions.md §5` + VER-36/OWN-29-A/B/C/D aksiyon-bazlı finansal self-approval istisnaları için **tek otoritedir**. Bu belge yalnız approval'ın actor tarafını (Person/OrganizationalTitle/SystemRole, `ApprovalAuthority` scope/amount/currency/validity/version) tanımlar. Self-approval identity düzeyi OFF/OD-11; çoklu approval seviyesi OFF/OD-12.

## 16. Delegation

Tek boolean değil; delegator/delegate/authority/scope/start-end lifecycle. Scope/limit delegator'ınkini aşamaz. Kapsamı OFF/OD-13.

## 17. Session and Lifecycle

**OFF-INV-06**: Session/token hem UserAccount hem OrganizationMembership/Employment active-state'ine bağlıdır. Revocation stratejisi OFF/OD-15; inactive olduğunda akıbet OFF/OD-14.

## 18. Offboarding

**OFF-INV-07**: Offboarding tek `isActive=false` değildir; orchestration:
```text
freeze → revoke → inventory → reassign → terminate → invalidate → verify → audit
```
Reactivation eski authority'yi otomatik geri vermez; reactivation ≠ rehire. Revoke↔reassignment sırası OFF/OD-16; reactivation/rehire ayrımı OFF/OD-17.

## 19. Audit and Attribution

**OFF-INV-08**: Audit en az şunu açıklar: acting Person, UserAccount, tenant/org bağlamı, acting role/authority kaynağı, delegator/delegate, target resource, before/after, reason, timestamp, outcome, correlation. Application log ≠ domain audit. Hassas alan görünürlüğü audit/export projeksiyonlarında da OFF-INV-10'a (§20) tabidir.

## 20. Personel Read Models

**OFF-INV-09**: Personel 360/workload/dashboard canonical writer değildir; kaynağını açıklamalı, deny≠empty ayırmalı, mock'u gerçek gibi sunmamalı, freshness taşımalı. Workload kullanım amacı OFF/OD-19.

**OFF-INV-10 — Sensitive Data Minimization and Field-Level Access**: TCKN, IBAN, leave, termination reason ve benzeri hassas alanlar varsayılan olarak maskeli veya erişilemez olmalıdır. Tam görünürlük explicit field-level permission ve purpose-bound access gerektirir. List, detail, export, audit projection ve read-model yüzeyleri aynı allowlist ve minimization politikasını uygular. İlişkili owner kapısı: OFF/OD-18. İlişkili risk: `OFFICE-RISK-REGISTER.md` → STF-PRD-PRIV-001.

## 21. Cross-Domain Contracts

**OFFICE → RECEIVABLE**: preparedBy/approvedBy/approval authority/actor identity/permission/audit/lifecycle bağlantıları tanımlanır; finansal formül/bakiye/tahakkuk semantiği **değiştirilemez**.
**OFFICE → DEBTOR**: kimin erişebileceği/hangi Person-UserAccount aktör olduğu/access üretip üretmediği/audit attribution tanımlanır; debtor'ın canonical kimliği/ilişkileri **değiştirilemez**.
**OFFICE → CLIENT (XDC-A — Client Approval and Actor Identity)**: OFFICE internal actor identity, role/rank/delegation authority, internal approval kararı ve approval audit/evidence otoritesini elinde tutar; CLIENT tarafı client relationship, mandate/instruction ve client-side approval context'idir. Business-effect ilgili hedef business domainde kalır. `OfficeApprovalRequest` (internal) ile `ClientApprovalRequest` (external) **eşitlenemez** (ADR-009 LOCKED). Client'ın relationship/mandate/instruction otoritesi **değiştirilemez**. AÇIK: executed-approval reversal ownership · OFF/OD-06 · OFF/OD-12 · OFF/OD-13 · approval provenance (CL-INV-007 komşu). Bu clause yeni reversal veya delegation politikası ÜRETMEZ. CLIENT-tarafı index: `CLIENT-GOVERNANCE-CHARTER.md` §6 XDC-A.

## 22. Forbidden Conflations

```text
1. Frontend gate güvenlik sınırı sayılmaz.        8. Unit test = production behavior kanıtı değil.
2. Tenant isolation = object authorization değil. 9. Schema alanı = enforcement kanıtı değil.
3. User active-state = Membership active-state   10. Açık PR source of truth sayılmaz.
   değil.                                        11. Safe default owner kararı sayılmaz.
4. Title/SystemRole/PermissionGrant aynı değil.   12. UNKNOWN alan tahminle doldurulmaz.
5. Assignment/responsibility/access aynı değil.   13. ADR-009/DBIND ikinci motorla yeniden
6. isActive=false = offboarding tamam değil.          üretilmez.
7. Reactivation ile rehire aynı sayılmaz.
```

## 23. Related Owner Decisions *(reference-only — tam dossier: `OFFICE-OWNER-DECISIONS.md`)*

| ID | Konu | ID | Konu |
|---|---|---|---|
| OFF/OD-01 | Person↔UserAccount cardinality | OFF/OD-13 | Delegation kapsamı |
| OFF/OD-02 | UserAccount çoklu membership | OFF/OD-14 | Inactive→Membership akıbeti |
| OFF/OD-03 | Çoklu Employment | OFF/OD-15 | Session revocation stratejisi |
| OFF/OD-04 | External counsel lifecycle | OFF/OD-16 | Offboarding sırası |
| OFF/OD-05 | Partner role/statü | OFF/OD-17 | Reactivation/rehire |
| OFF/OD-06 | FoundingLawyer statüsü | OFF/OD-18 | Hassas alan görünürlüğü |
| OFF/OD-07 | Tenant↔Organization cardinality | OFF/OD-19 | Workload kullanım amacı |
| OFF/OD-08 | Manager/team erişim kapsamı | OFF/OD-21 | Son owner/admin kaldırma |
| OFF/OD-09 | Direct grant/deny | | |
| OFF/OD-10 | Case/client access ilişkisi | | |
| OFF/OD-11 | Self-approval identity düzeyi | | |
| OFF/OD-12 | Çoklu approval seviyesi | | |

*(Not: candidate `OD-20`, OFFICE karar setinden çıkarılmış ve repository-wide/cross-program governance dependency olarak yeniden sınıflandırılmıştır — bkz. `OFFICE-MASTER-SYNTHESIS.md`. `OFF/OD-20` numarası bu nedenle burada YOK ve yeniden kullanılmaz.)*

## 24. Related Risk References *(reference-only — tam dossier: `OFFICE-RISK-REGISTER.md`)*

| ID | Konu | ID | Konu |
|---|---|---|---|
| STF-PRD-BOLA-001 | Anonim PDF erişimi | STF-PRD-OPS-001 | Mock metrik |
| STF-PRD-SES-001 | Offboarding sonrası session | STF-PRD-PERF-001 | N+1 sorgu |
| STF-PRD-RBAC-001 | Dekoratif role/permission | STF-PRD-BOLA-002 | Task assignee scope |
| STF-PRD-SCP-001 | Düz object-level scope | STF-PRD-DATA-001 | App-check-only uniqueness |
| STF-PRD-CFG-001 | Office config gate | STF-PRD-SES-002 | JWT stale-authority |
| STF-PRD-LIFE-001 | Lifecycle residue | STF-PRD-PRIV-001 | Maskesiz hassas alan |

## 25. Test and Release Gates *(PROPOSED)*

`OFFICE_TENANT_ISOLATION` · `OFFICE_IDENTITY_SEPARATION` · `OFFICE_AUTHORIZATION_PIPELINE` · `OFFICE_APPROVAL_BOUNDARY_INTEGRITY` · `OFFICE_LIFECYCLE_OFFBOARDING` · `OFFICE_AUDIT_ATTRIBUTION` · `OFFICE_READ_MODEL_INTEGRITY` · `OFFICE_PRIVACY_FIELD_MASKING`

## 26. Mandatory Pre-Task Checklist

```text
1. System Constitution okundu mu?              7. Current/target-state ayrıldı mı?
2. Governance Index okundu mu?                 8. İlgili OFF/OD kontrol edildi mi?
3. OFFICE-GOVERNANCE.md okundu mu?             9. İlgili STF-PRD kontrol edildi mi?
4. Sibling domain governance okundu mu?        10. Cross-domain dependency çıkarıldı mı?
5. Program/Wave/Workstream/Task doğrulandı mı? 11. Scope/forbidden scope doğrulandı mı?
6. Owner mode doğrulandı mı?
```

## 27. Mandatory Completion Checklist

```text
- OFFICE invariant'ları korunuyor mu?          - Lifecycle/session etkisi değerlendirildi mi?
- Sibling domain ownership ihlal edildi mi?    - Audit attribution değerlendirildi mi?
- ADR-009/DBIND değiştirildi mi?               - Backward compatibility değerlendirildi mi?
- Tenant/object scope ayrımı korundu mu?       - Yeni bulgular NOT AUTHORIZED raporlandı mı?
- Conflation üretildi mi?                      - Register/canonical status iddiaları doğrulandı mı?
```

## 28. Supersession and Compatibility

Bu belge `SYSTEM-CONSTITUTION.md`/`DEBTOR-GOVERNANCE.md`/`RECEIVABLE-GOVERNANCE.md`/`ADR-009`/`dbind-financial-authority-decisions.md`'yi supersede etmez; yalnız `SYS-GOV-014`'ü ayrıntılandırır (additive, Constitution §7 tablo revizyonu gerekmez). `GOVERNANCE-INDEX.md`'nin "Collection Governance | REZERVE" satırı bu belge tarafından değiştirilmez.

## 29. Document Self-Check

```text
- Vocabulary/ownership/boundary/invariant/contract complete: YES
- OFF/OD register EMBEDDED:                                  NO (kasıtlı — reference-only §23)
- STF-PRD register EMBEDDED:                                 NO (kasıtlı — reference-only §24)
- 150 senaryo EMBEDDED:                                       NO (kasıtlı — Master Synthesis'te)
- OFF-INV-01..10 unique:                                      YES
- OFF/OD-20 referenced here:                                  NO (kasıtlı — çıkarıldı, §23 notu)
- Unsupported new decisions:                                  NO
```

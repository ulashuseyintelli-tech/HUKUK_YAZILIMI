# UYAP Connector Normative Annex v1.0

```text
Belge yolu   : project/docs/blueprint/UYAP-CONNECTOR-NORMATIVE-ANNEX-v1.0.md
Durum        : CANONICAL SUBORDINATE ANNEX — UYAP-CONSTITUTION-V11-01 (2026-07-21)
Fonksiyon    : Merkezi UYAP Anayasası'nın (v1.1) yetkilendirdiği tek normatif annex
Kanonik kök  : project/docs/blueprint/UYAP-CONNECTOR-MASTER-SYNTHESIS-v1.0.md (§19)
Kaynak       : decision-log.md UYAP-CONSTITUTION-V11-01 owner kararları D1-D12
Implementation Authority : NONE
Real Transport : 0
UYAP Cutover : HARD HOLD
```

## Annex Otoritesi ve Sınırları (D1)

Bu belge **bağımsız bir anayasa değildir.** Yalnız `UYAP-CONNECTOR-MASTER-SYNTHESIS-v1.0.md` (§19, Constitution v1.1) tarafından yetkilendirilen tek subordinate normatif annex'tir. Kurallar:

- Bu annex, kanonik kök `UYAP-CONNECTOR-MASTER-SYNTHESIS-v1.0.md`'nin altındadır ve onun yetkisiyle vardır.
- Modül belgeleri (Office/Client/Debtor/Receivable/Collection) buradaki normatif kuralları **kopyalayamaz** — yalnız referans verir (rule duplication PROHIBITED, OD-UYAP-02).
- Bir çelişki tespit edilirse öncelik sırası: **synthesis kanonik kök + bu owner karar kaydı (`UYAP-CONSTITUTION-V11-01`) üstündür.**
- Bu annex `IMPLEMENTATION AUTHORITY` üretmez; her runtime/schema/migration işi ayrı owner GO gerektirir.

`UYAP-CONST-*` kimlik uzayı kuralları (KARAR 2, F0): kimlikler **yeniden kullanılamaz, yeniden numaralandırılamaz**; değişiklik gerekirse madde `DEPRECATED` veya `SUPERSEDED` yapılır (silinmez/üzerine yazılmaz). Her madde owner, status, effective date ve decision basis taşır.

---

## UYAP-CONST-001 — Official Channel and Authority

```text
id                    : UYAP-CONST-001
title                 : Official Channel and Authority
status                : RATIFIED
owner                 : OWNER
effective_date        : 2026-07-21
decision_basis        : UYAP-CONSTITUTION-V11-01 / D11 (+ F1-R2 official source ledger)
```

**normative_rule:**
- Kurumsal Web Servisi (BİGM) **official READ / data-ingestion / reporting channel**'dır; **doğrulanmış write adapter DEĞİLDİR** (dava/icra bilgisi + evrak + makbuz kurumun kendi veritabanına alınır/raporlanır; 2000/4000 dosya eşiği, TT-VPN, test-ortamı-önce — resmî sayfada VERIFIED).
- Avukat Portal **human-interactive write channel**'dır (e-imza/m-imza ile dava/icra açma, evrak gönderme, harç); **portal automation PROHIBITED.**
- Hukuk bürosu için programatik write transport kanalı **UNVERIFIED / EXTERNAL_AUTHORITY_REQUIRED.**
- Avukat Portal'ın insan-etkileşimli write capability'si **programatik connector authority ÜRETMEZ.**
- `OD-UYAP-08` (Transport Channel): **NOT READY / EXTERNAL-AUTHORITY-BLOCKED.**
- `OD-UYAP-10` (Cutover): **HARD HOLD.**

**non_equations:** `OFFICIAL READ CHANNEL ≠ WRITE TRANSPORT` · `PORTAL HUMAN WRITE ≠ PROGRAMMATIC CONNECTOR AUTHORITY` · `VENDOR-REPORTED PROTOCOL DETAIL ≠ PRIMARY-SOURCE FACT`

**implementation_status:** NONE (real transport 0; transport kanalı seçilmedi).

**supersession:** — (yeni)

---

## UYAP-CONST-002 — Tenant, Actor, Lawyer and Representation Authority

```text
id                    : UYAP-CONST-002
title                 : Tenant, Actor, Lawyer and Representation Authority
status                : RATIFIED
owner                 : OWNER
effective_date        : 2026-07-21
decision_basis        : UYAP-CONSTITUTION-V11-01 / D5 (OD-UYAP-03 normatif yön)
```

**normative_rule:** Her operation aşağıdaki kimlikleri ayırır: `actorUserId`, `actingLawyerId`, `representedPartyId`, `approverId`, `signatureOwnerId`.
- `actorUserId` **authenticated principal**'dan gelir (server-authoritative).
- `actingLawyerId` **server-side ilişki/delegation** üzerinden çözülür; **client-controlled `lawyerId` execution authority DEĞİLDİR.**
- `tenantId` yalnız authenticated/trusted context'ten gelir; client-body tenant otoritesi kabul edilmez.
- Personel hazırlama ve veri girişi yapabilir; **varsayılan final approval, signature veya legal execution authority DEĞİLDİR.**
- **Approval authority ≠ signature authority** (aynı kavram değildir).
- POA, actor/lawyer authority ve CPE **her yeni attempt'te yeniden değerlendirilir**; önceki attempt'in authority kararı yeni attempt'e **otomatik taşınamaz.**

**non_equations:** `CLIENT-SUPPLIED lawyerId ≠ EXECUTION AUTHORITY` · `STAFF DATA-ENTRY ≠ FINAL APPROVAL/SIGNATURE/EXECUTION` · `APPROVAL AUTHORITY ≠ SIGNATURE AUTHORITY` · `PRIOR ATTEMPT AUTHORITY ≠ CURRENT ATTEMPT AUTHORITY`

**implementation_status:** NONE. Bu madde `OD-UYAP-03` için normatif yönü belirler; implementation modeli ayrı owner GO gerektirir (mevcut kodda Lawyer↔JWT bağı yok, `lawyerId` body'den — F4-a bulgusu).

**supersession:** — (yeni)

---

## UYAP-CONST-003 — Credential and Signature Custody

```text
id                    : UYAP-CONST-003
title                 : Credential and Signature Custody
status                : RATIFIED
owner                 : OWNER
effective_date        : 2026-07-21
decision_basis        : UYAP-CONSTITUTION-V11-01 / D6 (+ 5070 EIK-05/06)
```

**normative_rule:**
- **PIN veya private key uygulamanın kontrolüne GEÇEMEZ** (custody PROHIBITED — değişmez).
- **Shared credential modeli YASAKTIR.**
- İmza yalnız **operator-present** veya **dışarıda imzalanmış payload intake** modeliyle kurulabilir; **provider doğrulanmadan biri runtime modeli olarak SEÇİLEMEZ.**
- **Signature success, provider acceptance veya legal effect DEĞİLDİR.**
- `OD-UYAP-04` transport-spesifik ayrıntılar bakımından **OPEN / EXT** kalır.
- Sınıflandırma (F1-R2): 5070 EIK-06-B/C = STATUTORY FACT (imza oluşturma verisi araç-dışı-çıkarılamaz + üçüncü-kişi elde-edemez); credential/PIN/private-key custody yasağı = SECURITY INFERENCE + OWNER-RATIFIED POLICY (doğrudan kanun lafzı olarak sunulmaz).

**non_equations:** `SIGNATURE SUCCESS ≠ PROVIDER ACCEPTANCE ≠ LEGAL EFFECT` · `STATUTORY FACT (5070 m.6) ≠ CREDENTIAL-CUSTODY PROHIBITION (inference + policy)`

**implementation_status:** NONE (imza yolu bugün dead stub — F4-a; no-signature/draft mode).

**supersession:** — (yeni)

---

## UYAP-CONST-004 — Operation, Attempt and Evidence Identity

```text
id                    : UYAP-CONST-004
title                 : Operation, Attempt and Evidence Identity
status                : RATIFIED
owner                 : OWNER
effective_date        : 2026-07-21
decision_basis        : UYAP-CONSTITUTION-V11-01 / D2 + D3
```

**normative_rule:**
- **Hedef evidence modeli: `UyapOperation` 1 → N `UyapAttempt`** (TARGET ARCHITECTURE kararı). `UyapRequestLog` mevcut runtime davranışı bu kararla **DEĞİŞMEZ**; schema/migration ÜRETİLMEZ; mevcut kayıtlar backfill EDİLMEZ. `CpeExecutionRecord` **hazır journal DEĞİLDİR** — yalnız unique-key ve state-hash bakımından kısmi emsaldir (mutable status, caller-supplied executionId — F4-a-R1).
- Kimlik ayrımı normatiftir:
  - `operationId`: **server-generated, opaque, immutable** operation identity.
  - `attemptId`: **server-generated, her denemede yeni** identity.
  - `idempotencyKey`: aynı yetkilendirilmiş operation'ın tekrar yürütülmesini engelleyen, **versioned ve server-controlled semantic key** — **yalnız ham payload hash'ine eşitlenemez.**
  - `clientRequestId`: **yalnız correlation**; authority veya idempotency source DEĞİLDİR.
  - `providerTransactionId` / `providerIdempotencyKey`: ayrı dış-provider evidence alanları; **yalnız provider desteği doğrulanırsa** kullanılır.
- **Client-supplied key:** hukukî authority değildir; server-generated operation identity yerine geçmez; duplicate legal/financial effect önleme garantisi sayılmaz.

**non_equations:** `CLIENT-SUPPLIED KEY ≠ SERVER OPERATION IDENTITY` · `idempotencyKey ≠ RAW PAYLOAD HASH` · `clientRequestId ≠ AUTHORITY/IDEMPOTENCY SOURCE` · `CpeExecutionRecord ≠ READY OPERATION/ATTEMPT JOURNAL`

**implementation_status:** NONE. TARGET ARCHITECTURE; schema/migration bu kararla üretilmez (F4-b, ayrı owner+migration GO).

**supersession:** — (yeni)

---

## UYAP-CONST-005 — Three-State Constitution and Non-Equations

```text
id                    : UYAP-CONST-005
title                 : Three-State Constitution and Non-Equations
status                : RATIFIED
owner                 : OWNER
effective_date        : 2026-07-21
decision_basis        : UYAP-CONSTITUTION-V11-01 / D4
```

**normative_rule:** Üç state alanı **ayrı ve normatiftir**. Minimum semantik set:
```text
InternalOperationState : DRAFT · VALIDATED · AWAITING_APPROVAL · APPROVED · AWAITING_SIGNATURE ·
                         SIGNED · ATTEMPT_IN_PROGRESS · MANUAL_REVIEW_REQUIRED · CANCELLED
ProviderState          : NOT_DISPATCHED · DISPATCH_IN_PROGRESS · RECEIVED · ACCEPTED · REJECTED · OUTCOME_UNKNOWN
LegalEffectState       : NONE · PENDING_CONFIRMATION · CONFIRMED
```
Precision (cross-state geçerlilik):
- `ATTEMPT_IN_PROGRESS + NOT_DISPATCHED + NONE` **geçerli olabilir.**
- `ACCEPTED + NONE` **geçerlidir**; hukukî etki ayrıca doğrulanır.
- `OUTCOME_UNKNOWN + CONFIRMED` **geçersizdir.**
- `DRAFT/VALIDATED` ile provider state'in `RECEIVED/ACCEPTED` olması **geçersizdir.**
- Provider kabulü **tek başına hukukî etki veya mutabakat DEĞİLDİR.**

**non_equations (zorunlu):**
```text
INTERNAL_SUCCESS ≠ PROVIDER_ACCEPTED      PROVIDER_ACCEPTED ≠ LEGAL_EFFECT_CONFIRMED
TRANSPORT_ERROR ≠ PROVIDER_REJECTED       TIMEOUT ≠ FAILED
OUTCOME_UNKNOWN ≠ RETRY_ELIGIBLE          LOCAL_SIMULATION ≠ DISPATCHED
RECEIPT_PRESENT ≠ RECONCILED
```

**implementation_status:** NONE. Bugünkü tek `UyapRequestLog.status` alanı bu ayrımı çökertiyor (F4-a); üç-alan modeli TARGET (F4-b, ayrı owner GO). State isimleri bu annex ile normatif set olarak ratifiye edilir; runtime enum üretimi bu görevle YAPILMAZ.

**supersession:** — (yeni)

---

## UYAP-CONST-006 — Idempotency, Retry and OUTCOME_UNKNOWN

```text
id                    : UYAP-CONST-006
title                 : Idempotency, Retry and OUTCOME_UNKNOWN
status                : RATIFIED
owner                 : OWNER
effective_date        : 2026-07-21
decision_basis        : UYAP-CONSTITUTION-V11-01 / D7 (+ D3 idempotency, OD-UYAP-07)
```

**normative_rule:**
```text
timeout veya network ambiguity
→ ProviderState.OUTCOME_UNKNOWN
→ blind retry PROHIBITED
→ status query destekleniyorsa ÖNCE status query
→ evidence reconciliation
→ authorized manual review
→ explicit disposition sonrasında yeni attempt
```
- Provider idempotency ve status query desteği **doğrulanmadıkça** "provider-guaranteed retry safety" iddiası **kurulamaz** (EXT).
- Güvenli retry için minimum önkoşul (OD-UYAP-07 baseline korunur): tenant scope · actor/lawyer authority · POA/CPE revalidation · atomic attempt claim · attempt lineage · idempotency key · provider outcome classification · status query · outcome-unknown handling · evidence · truthful API response.

**non_equations:** `OUTCOME_UNKNOWN ≠ FAILED` · `OUTCOME_UNKNOWN ≠ RETRY_ELIGIBLE` · `RETRY DISABLED ≠ SAFE RETRY CAPABILITY`

**implementation_status:** NONE. `POST /uyap/retry-failed` hard-disabled (503); safe retry contract OPEN (UYAP-RETRY-AUTH-02).

**supersession:** — (yeni)

---

## UYAP-CONST-007 — PII Minimization, Evidence and Retention

```text
id                    : UYAP-CONST-007
title                 : PII Minimization, Evidence and Retention
status                : RATIFIED
owner                 : OWNER
effective_date        : 2026-07-21
decision_basis        : UYAP-CONSTITUTION-V11-01 / D8
```

**normative_rule:** Varsayılan evidence modeli:
- Ham TCKN, adres, IBAN, hesap, plaka veya belge payload'ını **generic JSON logunda SAKLAMAZ.**
- Mümkünse **domain entity reference** kullanır.
- Correlation/reconciliation gerekiyorsa **versioned keyed digest** kullanabilir.
- **Masked değer yalnız display/logging içindir** (canonical evidence modeli değildir).
- **Field-level encryption yalnız** ham verinin zorunlu saklanma gerekçesi varsa değerlendirilir.
- ErrorLog ve audit metadata **whitelist/redaction** prensibiyle üretilir.

**Retention:** kategori/amaç/hukukî-dayanak bazlıdır; **evrensel 10 yıl DEĞİLDİR**; legal hold ile normal retention **ayrı tutulur**; exact süreler **LDO/kategori kararı olmadan dondurulmaz** (azami periyodik imha döngüsü ≤6 ay — sentez §9).

`queryDebtorAssets` ham identity persistence'i: **OPEN IMPLEMENTATION CANDIDATE** (F4-b P-E1); bu görevle DÜZELTİLMEZ.

**non_equations:** `MASKED DISPLAY VALUE ≠ CANONICAL EVIDENCE MODEL` · `RAW PII IN JSON LOG ≠ MINIMIZED EVIDENCE` · `LEGAL HOLD ≠ NORMAL RETENTION` · `RETENTION PERIOD ≠ UNIVERSAL 10-YEAR`

**implementation_status:** NONE. Bugün maskIdentity yalnız stdout'a bağlı, durable JSON ham PII taşıyor (F4-a); remediation F4-b (ayrı GO).

**supersession:** — (yeni)

---

## UYAP-CONST-008 — Simulator and Shadow Truthfulness

```text
id                    : UYAP-CONST-008
title                 : Simulator and Shadow Truthfulness
status                : RATIFIED
owner                 : OWNER
effective_date        : 2026-07-21
decision_basis        : UYAP-CONSTITUTION-V11-01 / D11
```

**normative_rule:** Simulator: **local-only · deterministic · no-network · default-disabled · no-credential · no-legal-effect.**
- **Offline shadow, gerçek provider gönderimi DEĞİLDİR.**
- Local simulation completed, provider dispatch/acceptance/legal-effect iddiası ÜRETMEZ (truthfulness containment: `simulated:true · dispatched:false · providerAccepted:false · legalEffectConfirmed:false`).

**non_equations:** `LOCAL SIMULATION ≠ DISPATCHED` · `OFFLINE SHADOW ≠ REAL PROVIDER SEND` · `SIMULATOR SUCCESS ≠ PROVIDER EVIDENCE`

**implementation_status:** NONE (simulator NOT STARTED — SIMULATOR-01; P04C-SHADOW NOT STARTED).

**supersession:** — (yeni)

---

## UYAP-CONST-009 — Metrics, Incident and Cutover Gates

```text
id                    : UYAP-CONST-009
title                 : Metrics, Incident and Cutover Gates
status                : RATIFIED
owner                 : OWNER
effective_date        : 2026-07-21
decision_basis        : UYAP-CONSTITUTION-V11-01 / D10 + D11 (cutover)
```

**normative_rule:** Üç normatif metrik sınıfı **ratifiye edilir** (exact threshold ÜRETİLMEZ):
```text
Safety Invariant   : tek ihlal incident veya otomatik HOLD doğurabilir
Release Gate       : pilot/cutover öncesi karşılanır
Operational SLO    : üretimde süre/kalite hedefi
```
- Safety invariant ihlali incident veya **otomatik HOLD** doğurabilir.
- `OD-UYAP-10` (Cutover): **HARD HOLD** (10 precondition — hiçbiri karşılanmıyor).
- Exact threshold/statü adları bu annex ile **dondurulmaz** (ölçüm + owner kararı gerektirir).

**non_equations:** `METRIC CLASS RATIFIED ≠ EXACT THRESHOLD SET` · `SAFETY INVARIANT ≠ OPERATIONAL SLO`

**implementation_status:** NONE (metrik altyapısı yok — F4-a).

**supersession:** — (yeni)

---

## UYAP-CONST-010 — Capability Autonomy and A0-A5

```text
id                    : UYAP-CONST-010
title                 : Capability Autonomy and A0-A5
status                : RATIFIED
owner                 : OWNER
effective_date        : 2026-07-21
decision_basis        : UYAP-CONSTITUTION-V11-01 / D9
```

**normative_rule:** Otonomi taksonomisi:
```text
A0 — Observe / read-only
A1 — Draft preparation
A2 — Validation and recommendation
A3 — Human approval/signature queue
A4 — Explicit human approval + human-controlled signature/credential ile execution
A5 — Capability-specific conditional autonomy
```
- **A5: zorunlu hedef DEĞİLDİR · global DEĞİLDİR · otomatik progression DEĞİLDİR.** A5 ayrı eligibility, dış otorite izni, owner kararı, süreli geçerlilik, kill-switch ve yeniden doğrulama tarihi gerektirir.
- A0-A5 seviyeleri capability-bazlı değerlendirilir; portal robotu / gizli endpoint / PIN-özel-anahtar custody / kullanıcı-yerine-imza yasakları seviyeden bağımsız kalıcıdır (KARAR 6).

**non_equations:** `A4 (human-controlled) ≠ A5 (conditional autonomy)` · `A5 ≠ MANDATORY ROADMAP END` · `CAPABILITY-SPECIFIC AUTONOMY ≠ GLOBAL AUTONOMY`

**implementation_status:** NONE (taksonomi normatif; hiçbir capability A5 değerlendirmesinde değil).

**supersession:** — (yeni)

---

## Owner Approval Record

```text
UYAP-CONSTITUTION-V11-01 — OWNER GO-DOCS + IF GO-COMPLETE
Kaynak: F1 (UYAP-MASTER-ANALIZ-02 R1+R2) + F4-a (EVIDENCE-01 R1) owner-accepted analysis basis.
Canonical kök: project/docs/blueprint/UYAP-CONNECTOR-MASTER-SYNTHESIS-v1.0.md (§19).
Owner kararları: D1-D12 (bkz. decision-log.md UYAP-CONSTITUTION-V11-01, 2026-07-21).
Ratifiye maddeler: UYAP-CONST-001..010 (RATIFIED).
IMPLEMENTATION AUTHORITY: NONE. REAL TRANSPORT: 0. UYAP CUTOVER: HARD HOLD.
F3 (MODULE-BASED UYAP BOUNDARY CONTRACTS): SELECTED / NOT STARTED.
F4-b: NOT AUTHORIZED / NOT STARTED.
```

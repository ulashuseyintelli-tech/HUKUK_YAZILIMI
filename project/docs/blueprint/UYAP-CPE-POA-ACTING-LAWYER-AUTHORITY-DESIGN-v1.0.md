# UYAP CPE POA + Acting-Lawyer Authority Design v1.0

```text
Task              : UYAP-CPE-POA-AND-ACTING-LAWYER-AUTHORITY-DESIGN-01
Tür               : DOMAIN / SECURITY / AUTHORITY DESIGN (docs-only)
Durum             : CANONICAL DESIGN — OWNER DECISION GATE (2 karar) BEKLİYOR
Tarih             : 2026-07-26
Kanıt tabanı      : canonical main `1b682a9a`
Yetki             : Owner `GO-DESIGN` (ANALYZE-FIRST) — GO-IMPLEMENT DEĞİL
Tüketilen canonical: UYAP-CONST-002 (RATIFIED) · UYAP-BC-OFFICE-001 · UYAP-BC-CLIENT-001 ·
                    UYAP-PROGRAM-AUDIT-RECONCILIATION-v1.0 (§8 R-01/R-02)
IMPLEMENTATION AUTHORITY : NONE
REAL TRANSPORT / CUTOVER : NOT AUTHORIZED / HARD HOLD
```

Bu belge **tasarımdır**; kod, schema, migration, feature flag, canary veya transport üretmez.
Hiçbir implementation paketi bu belgeyle başlatılmaz.

---

## A. Current-State Map (repository kanıtıyla)

### A.1 POA yüzeyi — iki model, biri ölü

| Model | tenantId | Bağlantı | Kod kullanımı | Disposition |
|---|---|---|---|---|
| `ClientPowerOfAttorney` (+ `PoaLawyer`) | **YOK** | `clientId` → `Client`; `PoaLawyer` M:N `Lawyer` | **7 dosya** (poa/case/client/portal/automation×2/seed) | **CANONICAL / LIVE** |
| `PowerOfAttorney` | VAR | `lawyerId` (zorunlu), `clientId` (nullable), `CaseLawyer.powerOfAttorneyId` | **0 dosya** (yalnız schema + FK) | **DEAD / LEGACY** |

`ClientPowerOfAttorney` alanları: `status: PoaStatus (ACTIVE|EXPIRED|REVOKED|PENDING)` · `isActive` ·
`isLimited` + `validUntil` · `dateIssued` · `scopeType: PoaScopeType (GENEL|ICRA_TAKIP|BU_DOSYA|OZEL)` +
`scopeDescription` · yetki bayrakları `canCollect|canWaive|canSettle|canRelease` · noter/dosya metadata.
`PoaLawyer`: `@@unique([poaId, lawyerId])`, `isPrimary`.

**Kanıtlanan eksikler:** POA'da `effectiveFrom` YOK (yalnız `dateIssued` + `validUntil`) ·
azil/istifa/askı için ayrı state YOK (`REVOKED` tek kova) · revocation zaman damgası YOK ·
soft-delete alanı YOK (`isActive` boolean) · **`ClientPowerOfAttorney`/`PoaLawyer`'da `tenantId` YOK**
(tenant yalnız `client.tenantId` üzerinden türetilebilir).

### A.2 Identity yüzeyi — köprü var, dormant

- `User.lawyer Lawyer? @relation("LawyerUser")` · `Lawyer.userId String?` **`@@unique([userId])`**
  → **canonical User→Lawyer köprüsü 1:0..1 ve tekil, MEVCUT.**
- `User.staffMember StaffMember?` · `StaffMember.userId String?` `@unique`.
- `Lawyer`: `tenantId` · `@@unique([id, tenantId])` · `officeId?` · `isActive` ·
  yetki bayrakları `canAppearInUyap`, `canSign`, `canBeResponsible`, `canApproveOfficeActions`,
  `defaultPermissions Json?` (`canSyncUYAP` dahil), `permissionsLocked`, `role LawyerRole`.
- `CaseLawyer`: `@@unique([caseId, lawyerId])`, `role`, `isResponsible`, `hasSignatureAuthority`,
  `casePermissions Json?`, `permissionSource`, `powerOfAttorneyId?` (**ölü** `PowerOfAttorney`'e).
  **`tenantId` YOK.**
- `ReportingLine`: `tenantId` + `actorUserId` + `managerUserId?` → **yönetim/eskalasyon hiyerarşisi**,
  UYAP delegation kaynağı DEĞİL.
- `CaseClient`: `caseId` ↔ `clientId` (temsil zincirinin case ayağı).

**BC-OFFICE-001 zaten tespit etmiş:** *"`actingLawyerId` server-side resolve YOK — `lawyerId` her yazma
yolunda `@Body`'den (Lawyer↔JWT `LawyerUser` köprüsü dormant)"*.

### A.3 Authentication / context yüzeyi

- JWT payload: `sub`, `tenantId`, `email`, `role`, `tokenVersion`; `JwtStrategy.validate` → tam `User` satırı.
- `@CurrentUser()` → `request.user`; `@CurrentUser('tenantId')` → tenant (server-authoritative).
- `ActionContext`: `debtorId?`, `assetId?`, `expenseId?`, **`userId?` ("audit için")**, `source?`,
  `metadata?`, `expectedStateVersion?` → **`tenantId` YOK, `actingLawyerId` YOK.**

### A.4 CPE / fact / gate yüzeyi

- `POWER_OF_ATTORNEY_MISSING` (gates.compiled.ts): `actionCodes: [UYAP_SEND]`, `severity: HARD`,
  `priority: 25`, `condition: (facts) => facts.get('case.has_power_of_attorney') !== true`.
- `case.has_power_of_attorney` **üretim yolu YOK**: `addCaseLevelFacts` set etmez, kayıtlı 5 computed
  provider üretmez, hiçbir production writer yazmaz (yalnız test fixture'ları) → fact yalnız persisted
  `icrabotCaseFlag` satırından gelebilir.
- `ComputedFactProvider`: `factKey`, `dependsOn[]`, `compute(caseId, context?, facts?)` —
  **tenant/actor parametresi YOK** (yalnız `ActionContext` üzerinden).
- `GateChecker.checkGates(caseId, actionCode, facts, context?)` → **context gate değerlendirmesine ULAŞIR**
  (mevcut POA gate'i kullanmıyor).
- `evaluateDecision` her çağrıda tam 1 `CpeDecisionLog` yazar (CASE_NOT_FOUND hariç).

### A.5 UYAP_SEND giriş noktaları ve mevcut authority davranışı

| Giriş | CPE | Authority davranışı |
|---|---|---|
| `POST /api/uyap/test/payment-order` → `sendPaymentOrder` | `canPerformAction(caseId, UYAP_SEND, { debtorId, userId: request.lawyerId })` | Controller `lawyerId`'yi **hiç set etmiyor** |
| `POST /api/uyap/xml/submit/:caseId` | `@CpeRequired(ActionCode.UYAP_SEND)` guard → aynı gate | `actorUserId: req.user?.id` yalnız diagnostic |

**Fail-open by omission (kanıt, uyap.service.ts):**
```ts
if (!request.skipPoaCheck && request.creditor.id && request.lawyerId && request.tenantId) { … POA … }
```
Dört koşuldan biri bile düşerse **servis seviyesi POA doğrulaması hiç çalışmaz**; `test/payment-order`
yolunda `lawyerId` hiç set edilmediği için bu blok **fiilen ölüdür**. Ayrıca client-supplied
`request.lawyerId`, CPE'ye "audit için" tanımlı `ActionContext.userId` alanına konur — semantik uyumsuzluk
+ untrusted-input yüzeyi.

**Sonuç:** Bugün UYAP_SEND'i fiilen durduran tek şey, hiçbir üreticisi olmayan bir flag'e bakan CPE
gate'idir. Bu **doğru sonucu yanlış nedenle** verir: authority kanıtlanmadığı için değil, fact hiç
yazılmadığı için bloklar. Her iki giriş de aynı gate'ten geçtiğinden **gate fact'inin canonical
türetilmesi iki yolu birden düzeltir.**

### A.6 Operation taxonomy

`ActionCode`'da yalnız `UYAP_SEND` (HIGH), `UYAP_QUERY` (LOW), `SYNC_UYAP` (LOW), `TRIGGER_HACIZ` (HIGH)
mevcuttur. Görev emrindeki `UYAP_DOCUMENT_UPLOAD` / `UYAP_CASE_OPEN` / `UYAP_ENFORCEMENT_ACTION` /
`UYAP_LAWSUIT_ACTION` / `UYAP_SEIZURE_ACTION` / `UYAP_STATUS_QUERY` **repository'de YOKTUR**; bu tasarım
bunları uydurmaz (bkz. §D — NOT REQUIRED).

---

## B. Canonical Decision

### B.1 Seçilen model — **MODEL B (acting-lawyer matched POA)**

```text
Authenticated JWT user
→ tenant membership (server-authoritative)
→ canonical Lawyer identity (User.lawyer, @@unique([userId]))
→ actingLawyerId (SERVER-SIDE RESOLVED)
→ case → CaseClient → Client (representation)
→ ClientPowerOfAttorney ∋ PoaLawyer(actingLawyerId)  (POA actor'a EŞLEŞİR)
→ temporal + revocation + scope evaluation
→ CPE facts (computed, actor-aware)
→ UYAP_SEND gate
```

**Neden B (uydurma değil, ratifiye kural):** `UYAP-CONST-002` normative_rule —
*"`actorUserId` authenticated principal'dan gelir (server-authoritative). `actingLawyerId` **server-side
ilişki/delegation** üzerinden çözülür; **client-controlled `lawyerId` execution authority DEĞİLDİR**.
Personel hazırlama ve veri girişi yapabilir; **varsayılan final approval, signature veya legal execution
authority DEĞİLDİR**."* + `UYAP-BC-CLIENT-001` — *"POA her attempt'te yeniden değerlendirilir;
representedParty operasyon anında doğrulanır"*. Repository'de köprü (`Lawyer.userId @unique`) ve POA↔lawyer
ilişkisi (`PoaLawyer`) zaten mevcuttur; B **mevcut modelle uygulanabilir**.

### B.2 Reddedilen alternatifler

| Model | Karar | Gerekçe |
|---|---|---|
| **A — client-level POA** | **REDDEDİLDİ** | POA'nın client için "herhangi bir" varlığı, işlemi yapan avukatı kanıtlamaz. `UYAP-CONST-002` (actor ≠ authority) ve `UYAP-BC-OFFICE-001` BOUNDARIES ile **canonically inconsistent**; evidence hukuki aktörü eksik gösterir (non-repudiation kaybı). |
| **C — POA holder + internal delegation** | **BASELINE OLARAK REDDEDİLDİ / OWNER-GATED EK OLARAK AÇIK** | `UYAP-CONST-002` "ilişki/**delegation**" ifadesiyle kavramsal olarak izin verir; ancak repository'de **canonical UYAP delegation source-of-truth YOKTUR**: `ReportingLine` yönetim hiyerarşisidir, `CaseLawyer` case ataması + iç yetki bayrağıdır, `Lawyer.defaultPermissions` iç capability'dir — hiçbiri "X avukatının vekaletini Y avukatı kullanabilir" hukuki hükmünü taşımaz. Uydurulamaz → **DECISION-1**. |
| **D — başka model** | **GEREKMİYOR** | Repository mevcut yapısı B'yi destekliyor; yeni model gerekçesi yok. |

### B.3 Kesin ayrımlar (tasarımın bağlayıcı sözlüğü)

```text
AUTHENTICATION        : JwtStrategy.validate → User (kim olduğu)
TENANT MEMBERSHIP     : User.tenantId (server-authoritative; @CurrentUser('tenantId'))
PROFESSIONAL IDENTITY : User.lawyer → Lawyer (canonical, @@unique([userId]))
INTERNAL AUTHORIZATION: Lawyer.canAppearInUyap / defaultPermissions.canSyncUYAP /
                        CaseLawyer.casePermissions — BÜRO İÇİ yetkidir, POA DEĞİLDİR
CASE ASSIGNMENT       : CaseLawyer — operasyonel ilişki, hukuki temsil DEĞİLDİR
CLIENT REPRESENTATION : Case → CaseClient → Client
POWER OF ATTORNEY     : ClientPowerOfAttorney (+PoaLawyer) — hukuki vekâlet varlığı ve kapsamı
OPERATION AUTHORITY   : yukarıdakilerin KESİŞİMİ (hiçbiri tek başına yeterli değildir)
CPE FACT              : bu zincirden deterministik türetilen policy girdisi
```

**Bağlayıcı olumsuz kurallar:** role/permission sahibi olmak POA sayılmaz · case'e atanmış olmak hukuki
temsil sayılmaz · POA sahibi olmak her UYAP işlemini otomatik yetkilendirmez · client-provided
`actingLawyerId` **untrusted input**'tur.

---

## C. Authority Sequence (canonical)

```text
1  REQUEST            : POST /api/uyap/... (JwtAuthGuard)
2  AUTHENTICATION     : req.user = User (sub, tokenVersion doğrulanmış)
3  TENANT RESOLUTION  : ctxTenantId = req.user.tenantId   [body'den ASLA]
4  ACTING LAWYER      : Lawyer WHERE userId = req.user.id AND tenantId = ctxTenantId AND isActive
                        → 0 kayıt  → ACTING_LAWYER_NOT_RESOLVED (fail-closed)
                        → >1 kayıt → ACTING_LAWYER_AMBIGUOUS   (fail-closed; @@unique gereği beklenmez,
                                     yine de savunmacı kontrol)
                        → tenant uyuşmazlığı → LAWYER_TENANT_MISMATCH
                        body.lawyerId varsa: YOK SAYILIR veya çözülen değerle EŞLEŞMİYORSA reddedilir
5  CASE/CLIENT        : Case WHERE id = caseId AND tenantId = ctxTenantId          (yoksa fail-closed)
                        clients = CaseClient(caseId) → Client WHERE tenantId = ctxTenantId
                        → boş küme → CASE_CLIENT_MISMATCH
6  POA LOOKUP         : ClientPowerOfAttorney WHERE clientId ∈ clients
                          AND client.tenantId = ctxTenantId            (tenant DOĞRUDAN doğrulanır)
                          AND EXISTS PoaLawyer(poaId, lawyerId = actingLawyerId)
7  LIFECYCLE/SCOPE    : temporal + revocation + scope değerlendirmesi (§C.1, §C.2)
8  CPE FACTS          : §E fact seti (computed, actor-aware)
9  POLICY DECISION    : canPerformAction(caseId, UYAP_SEND, ctx) → CpeDecisionLog (TX-0)
10 EVIDENCE MUTATION  : TX-1 içinde authority REVALIDATION (§F) → operation/attempt/link
```

### C.1 Temporal + revocation kuralı (fail-closed)

| Durum | Kaynak | Sonuç |
|---|---|---|
| `status != ACTIVE` (`EXPIRED`/`REVOKED`/`PENDING`) | `PoaStatus` | RED (`…_REVOKED` / `…_EXPIRED` / `…_NOT_EFFECTIVE`) |
| `isActive = false` | `ClientPowerOfAttorney` | RED (soft-delete eşdeğeri) |
| `isLimited = true` ve `validUntil < now` | — | RED (`POWER_OF_ATTORNEY_EXPIRED`) |
| `isLimited = true` ve `validUntil` NULL | — | **RED** (belirsiz süre → fail-closed) |
| `dateIssued` NULL veya `dateIssued > now` | — | **RED** (`POWER_OF_ATTORNEY_NOT_EFFECTIVE`) |
| `client.tenantId ≠ ctxTenantId` | — | RED (`CLIENT_TENANT_MISMATCH`) |
| `PoaLawyer` yok / farklı lawyer | — | RED (`POWER_OF_ATTORNEY_LAWYER_MISMATCH`) |
| Çelişen kayıtlar (biri geçerli biri revoked, aynı client+lawyer) | — | **RED** (`AUTHORITY_RECORD_CONFLICT`) — "en az bir geçerli var" mantığı YASAK |
| Hiçbir eşleşme | — | RED (`POWER_OF_ATTORNEY_MISSING`) |

**Genel ilke:** her belirsizlik ve her eksik veri **RED**'dir. "Geçerli sayılabilir" davranışı yoktur.

### C.2 Operation-scope kuralı

`UYAP_SEND` (icra takibi gönderimi) için kabul edilen `PoaScopeType`:

```text
GENEL      → KABUL
ICRA_TAKIP → KABUL
BU_DOSYA   → KABUL yalnız POA'nın hedef case ile canonical bağı KANITLANABİLİRSE.
             Mevcut şemada ClientPowerOfAttorney↔Case bağı YOKTUR → bugün FAIL-CLOSED (RED).
OZEL       → RED (yapılandırılmamış `scopeDescription` makine tarafından yorumlanamaz)
```

`canCollect|canWaive|canSettle|canRelease` bayrakları **UYAP_SEND için kullanılmaz** (ahzu kabz/feragat/
sulh/ibra farklı işlem aileleridir); ileride ilgili action'lara bağlanabilir — bu tasarım bağlamaz.

### C.3 Tenant invariants (hepsi zorunlu, bypass YOK)

```text
ctxTenantId = req.user.tenantId                     (body'den ASLA)
case.tenantId        == ctxTenantId
client.tenantId      == ctxTenantId
actingLawyer.tenantId== ctxTenantId
poa.client.tenantId  == ctxTenantId                 (POA'da tenantId olmadığı için ZORUNLU dolaylı kontrol)
poaLawyer.lawyer.tenantId == ctxTenantId
```
Cross-tenant için **fallback, admin veya super-admin bypass YOKTUR**. Gerçek super-admin operasyonları
gerekiyorsa normal `UYAP_SEND` authority zincirinin **dışında** ayrı bir action ve ayrı evidence yolu ile
tasarlanır (bu tasarımın kapsamı dışında).

---

## D. Data Model Delta

| # | Değişiklik | Sınıf | Gerekçe |
|---|---|---|---|
| D-1 | `ClientPowerOfAttorney.tenantId` + `@@unique([id, tenantId])` | **REQUIRED** | POA'da tenant kolonu yok; tenant yalnız nested `client` üzerinden. Repo'nun kendi UYAP evidence precedent'i (composite tenant-safe FK) ve fail-closed ilkesi DB seviyesinde tenant kanıtı ister. Backfill: `client.tenantId`'den türetilir. |
| D-2 | `PoaLawyer.tenantId` + composite FK (`poaId,tenantId`) ve (`lawyerId,tenantId`) | **REQUIRED** | Cross-tenant POA↔Lawyer bağı DB seviyesinde imkânsız hale gelmeli. |
| D-3 | `ClientPowerOfAttorney.effectiveFrom` | **OPTIONAL / DECISION-2** | Bugün `dateIssued` proxy olarak kullanılabilir; ayrı yürürlük tarihi hukuki ihtiyaca bağlı. |
| D-4 | Revocation ayrıntısı (`revokedAt`, `revocationBasis: AZIL/ISTIFA/IPTAL/ASKI`) | **OPTIONAL / DECISION-2** | `REVOKED` tek kova; ayrım hukuki raporlama/evidence için gerekebilir. Authority sonucunu DEĞİŞTİRMEZ (hepsi RED). |
| D-5 | `ClientPowerOfAttorney` ↔ `Case` bağı (BU_DOSYA kapsamı için) | **OPTIONAL / DECISION-2** | Yoksa `BU_DOSYA` kalıcı fail-closed kalır. |
| D-6 | `Lawyer.userId` köprüsü | **NOT REQUIRED** | Zaten mevcut ve `@@unique`. |
| D-7 | Yeni UYAP operation taxonomy (`UYAP_DOCUMENT_UPLOAD` vb.) | **NOT REQUIRED** | `UYAP_SEND` bu tasarım için yeterli; taxonomy genişletmesi ayrı owner kararıdır. |
| D-8 | `PowerOfAttorney` (dead model) kaldırma | **NOT REQUIRED (bu tasarımda)** | Legacy removal ayrı owner kararı + ayrı migration; `CaseLawyer.powerOfAttorneyId` FK'sı bağlıdır. |
| D-9 | `case.has_power_of_attorney` schema kaldırma | **NOT REQUIRED (bu tasarımda)** | §G Faz 3. |

**Bu görevde migration ÜRETİLMEZ.** D-1/D-2 ayrı bounded implementation paketi + pending-migration
coordination register gate'i gerektirir.

---

## E. CPE Fact Model + Provider

### E.1 Fact seti (minimum, açıklanabilir, hata taksonomisine 1:1)

| Fact | Anlam | Provider girdisi |
|---|---|---|
| `actor.is_canonical_lawyer` | `User→Lawyer` köprüsü tekil, aktif, tenant-eşleşmiş | ctx.userId, ctx.tenantId |
| `actor.has_matching_power_of_attorney` | acting lawyer ↔ case client(ler)i için ≥1 POA (tenant-tutarlı) | + caseId |
| `poa.is_effective_at_evaluation_time` | temporal + revocation + isActive (§C.1) | + evaluatedAt |
| `poa.covers_requested_operation` | scope kuralı (§C.2) | + actionCode |
| `authority.is_unambiguous` | çelişen POA / birden çok lawyer kimliği yok | — |

Gate koşulu bu beş fact'in **konjonksiyonudur**; hepsi `true` değilse HARD block. Tek boolean hukuken
farklı durumları gizlemesin diye ayrıştırıldı; daha fazla fact üretilmedi (CPE policy ihtiyacı kadar).

`case.has_power_of_attorney` **artık authority kaynağı DEĞİLDİR** (§G).

### E.2 Provider ve context sözleşmesi (API delta — REQUIRED)

Mevcut `ComputedFactProvider.compute(caseId, context?, facts?)` imzası actor/tenant taşımaz; bu yüzden:

```text
ActionContext EK ALANLARI (REQUIRED):
  tenantId?: string          // server-authoritative
  actingLawyerId?: string    // SERVER-SIDE RESOLVED (client'tan ASLA)
  authoritySnapshotId?: string
```

Yeni servis sorumlulukları:

```text
ActingLawyerResolver     : (userId, tenantId) → { actingLawyerId } | fail-closed reason
UyapSendAuthorityResolver: (UyapSendAuthorityContext) → AuthorityResult
                            { granted, facts, matchedPoaIds[], snapshot, failureReason }
UyapAuthorityFactProvider: ComputedFactProvider implementasyonu (5 fact), resolver'ı çağırır
```

`UyapSendAuthorityContext = { tenantId, userId, actingLawyerId, caseId, clientIds[], operationType,
evaluatedAt }`.

**Untrusted input sınırı:** `body.lawyerId` / `body.actingLawyerId` / `body.tenantId` **hiçbir koşulda**
authority girdisi değildir. `sendPaymentOrder`'ın mevcut koşullu POA bloğu (§A.5) authority yolundan
çıkarılır; POA doğrulaması resolver'da tek noktada ve koşulsuz yapılır.

---

## F. Concurrency / Freshness (TOCTOU)

**Senaryo:** T1 POA geçerli okunur → T2 başka transaction POA'yı revoke eder → T3 operation + evidence yazılır.

**Tasarım — iki fazlı doğrulama + snapshot:**

```text
FAZ 1 (TX dışı, CPE değerlendirmesi):
  resolver authority'yi hesaplar; her eşleşen POA için (poaId, updatedAt) çifti
  authoritySnapshot'a alınır; CpeDecisionLog'a snapshot referansı yazılır.

FAZ 2 (TX-1 içinde, evidence yazımından ÖNCE, aynı transaction):
  matchedPoaIds poaId ASC sırasıyla yeniden okunur (deterministik sıra → deadlock önleme)
  ve (status, isActive, validUntil, updatedAt) snapshot ile KARŞILAŞTIRILIR.
  Fark varsa  → AUTHORITY_CONTEXT_STALE → TX-1 rollback, operation/attempt/link YAZILMAZ.
  Aynıysa     → evidence yazımı devam eder.
```

- **Lock ordering:** mevcut TX-1 sırası (operation → attempt → link) korunur; POA satırları TX-1'in
  **ilk** adımında `poaId ASC` sırayla okunur. Client/Case satırları kilitlenmez → mevcut lock
  hiyerarşisiyle çakışma yok.
- Kilitleme yerine **optimistic karşılaştırma** tercih edilir (`updatedAt` + status alanları): POA yazma
  hacmi düşüktür, uzun kilit tutmak evidence TX'ini gereksiz büyütür.
- **Stale `true` fact kabul edilmez**: FAZ 1 ile FAZ 2 arasındaki her değişiklik fail-closed'dır.
- `UYAP-CONST-002` "POA/authority/CPE her attempt'te yeniden değerlendirilir" kuralı FAZ 1'in her attempt
  için tekrarlanmasıyla sağlanır; prior-attempt authority taşınmaz.

---

## G. Legacy Flag Geçişi (öneri — bu görevde uygulanmaz)

```text
Faz 1 : Computed authority canonical olur. `case.has_power_of_attorney` AUTHORITY OLARAK OKUNMAZ;
        yalnız compatibility telemetry için (fark varsa uyarı) tutulabilir.
Faz 2 : Legacy writer/fixture'lar kaldırılır (bugün production writer zaten YOK).
Faz 3 : Schema/flag temizliği ayrı migration ile yapılır.
```
Backward-compat yüzeyleri: mevcut fact tüketicileri (`rules.compiled.ts` bir kuralda okur) ·
test fixture'ları (4 spec) · `POWER_OF_ATTORNEY_MISSING` gate adı **korunur** (dış kontrat kırılmaz) ·
error code'lar additive eklenir · idempotency key üretimi etkilenmez · evidence şeması değişmez
(`actingLawyerId` alanı zaten mevcut, bugün null).

---

## H. Fail-Closed Hata Taksonomisi

| Kod | Katman | Dışa gösterim |
|---|---|---|
| `ACTING_LAWYER_NOT_RESOLVED` | resolver | generic |
| `ACTING_LAWYER_AMBIGUOUS` | resolver | generic |
| `LAWYER_TENANT_MISMATCH` | resolver | generic |
| `CLIENT_TENANT_MISMATCH` | resolver | generic |
| `CASE_CLIENT_MISMATCH` | resolver | generic |
| `POWER_OF_ATTORNEY_MISSING` | gate (**mevcut, korunur**) | generic |
| `POWER_OF_ATTORNEY_NOT_EFFECTIVE` | resolver | generic |
| `POWER_OF_ATTORNEY_EXPIRED` | resolver | generic |
| `POWER_OF_ATTORNEY_REVOKED` | resolver | generic |
| `POWER_OF_ATTORNEY_SCOPE_MISMATCH` | resolver | generic |
| `POWER_OF_ATTORNEY_LAWYER_MISMATCH` | resolver | generic |
| `INTERNAL_UYAP_PERMISSION_MISSING` | resolver (DECISION-1'e bağlı) | generic |
| `CASE_ASSIGNMENT_MISSING` | resolver (DECISION-1'e bağlı) | generic |
| `AUTHORITY_RECORD_CONFLICT` | resolver | generic |
| `AUTHORITY_CONTEXT_STALE` | TX-1 revalidation | generic |

**Güvenlik kuralı:** dış yanıt **tek generic mesaj** verir (mevcut `POWER_OF_ATTORNEY_MISSING` davranışı
korunur) — ayrıntılı `failureReason` yalnız `CpeDecisionLog` + evidence'a yazılır. Ayrıntılı dışa
gösterim POA/temsil ilişkilerinin enumeration'ına yol açar.

**Backward compatibility:** `POWER_OF_ATTORNEY_MISSING` **yeniden adlandırılmaz**; yeni kodlar additive'dir.

---

## I. Evidence / Audit Bağı

Her operation için server-side türetilip evidence zincirine bağlanacaklar:

```text
authenticatedUserId   → UyapOperation.actorUserId          (mevcut alan)
actingLawyerId        → UyapOperation.actingLawyerId       (mevcut alan, bugün null)
representedPartyId    → UyapOperation.representedPartyId   (mevcut alan)
tenantId / caseId     → mevcut
operationType         → mevcut (operationType)
matchedPoaIds[]       → YENİ: authority evidence referansı (id listesi, İÇERİK DEĞİL)
authoritySnapshotHash → YENİ: (poaId, updatedAt, status) demetinin versioned digest'i
evaluationTimestamp / policyVersion / decisionLogId / authorityResult / failureReason
```

**PII/minimizasyon:** POA belgesi, dosya yolu, noter/yevmiye bilgisi, `scopeDescription` serbest metni
evidence'a **kopyalanmaz** — yalnız `poaId` referansı + versioned digest. `UYAP-CONST-007` (PII
minimizasyon) ve legal-hold gereksinimleri korunur.

---

## J. Security & Legal Invariants (makine tarafından test edilebilir)

```text
INV-01  actingLawyerId ASLA request body'den türetilmez.
INV-02  tenantId ASLA request body'den türetilmez (yalnız authenticated principal).
INV-03  Lawyer.userId ↔ User eşlemesi tekil olmalıdır; çoklu/eksik eşleme fail-closed'dır.
INV-04  POA eşleşmesi acting lawyer'ı İÇERMEK ZORUNDADIR (client-level yeterli değildir).
INV-05  poa.client.tenantId == ctxTenantId == case.tenantId == actingLawyer.tenantId.
INV-06  status != ACTIVE veya isActive=false olan POA authority üretemez.
INV-07  isLimited=true ve validUntil NULL/geçmiş → authority YOK.
INV-08  dateIssued NULL veya gelecekte → authority YOK.
INV-09  scopeType ∈ {GENEL, ICRA_TAKIP} dışındaki değerler UYAP_SEND için authority üretmez
        (BU_DOSYA canonical case bağı olmadan RED, OZEL RED).
INV-10  Çelişen POA kayıtlarında "en az biri geçerli" mantığı YASAKTIR → RED.
INV-11  Role/permission tek başına, case assignment tek başına authority üretmez.
INV-12  Authority kararı ile evidence yazımı arasında POA değişmişse TX-1 rollback edilir.
INV-13  Denied kararlar da CpeDecisionLog'a yazılır; evidence tabloları yazılmaz.
INV-14  Dış hata yanıtı authority ayrıntısı sızdırmaz (tek generic mesaj).
INV-15  POA belge içeriği/serbest metin evidence tablolarına kopyalanmaz.
INV-16  Cross-tenant admin/super-admin bypass yoktur.
```

---

## K. Minimum Test Matrisi (sonraki implementation için)

**Pozitif:** geçerli tenant+user+lawyer+client+case+POA+scope · çok avukatlı POA (`PoaLawyer` ≥2) ·
aynı POA'nın birden çok case'te kullanımı · idempotent replay (aynı Idempotency-Key → yeni operation YOK) ·
(DECISION-1 kabul edilirse) izinli delegation yolu.

**Negatif:** POA yok · süresi geçmiş · `dateIssued` gelecekte/NULL · `REVOKED`/`EXPIRED`/`PENDING` ·
`isActive=false` · `isLimited=true` + `validUntil` NULL · farklı tenant (case/client/lawyer/POA her biri) ·
farklı client · farklı case · POA başka lawyer'a ait · `Lawyer.userId` eşleşmesi yok · çoklu lawyer
kimliği (ambiguity) · yalnız `CaseLawyer` var POA yok · yalnız role/permission var POA yok ·
`canAppearInUyap=false` (DECISION-1) · scope `OZEL`/`BU_DOSYA` · **`body.actingLawyerId` spoofing** ·
çelişen POA kayıtları · concurrent revoke (TX-1 stale) · cross-tenant super-admin denemesi.

**Evidence:** allowed/denied kararların actor+POA referansları · TX-1 rollback'te orphan evidence YOK ·
replay'de duplicate operation/attempt/link YOK · POA içeriği kopyalanmıyor · authority digest deterministik.

---

## L. Implementation Decomposition (bounded, sıralı — hiçbiri bu görevle başlatılmaz)

| # | Paket | Kapsam | Schema | Bağımlılık |
|---|---|---|---|---|
| **I01** | `UYAP-ACTING-LAWYER-RESOLVER-I01` | `User→Lawyer` canonical resolver (tenant-safe, ambiguity fail-closed) + testler | YOK | — |
| **I02** | `UYAP-POA-TENANT-SAFETY-I02` | D-1/D-2 tenantId + composite FK + backfill + migration | **VAR** | I01 |
| **I03** | `UYAP-SEND-AUTHORITY-RESOLVER-I03` | POA eşleşme + temporal/revocation + scope + hata taksonomisi | YOK | I01, I02 |
| **I04** | `UYAP-CPE-AUTHORITY-FACT-BRIDGE-I04` | `ActionContext` genişletme + 5 fact provider + gate rewiring + legacy flag okumayı bırakma | YOK | I03 |
| **I05** | `UYAP-AUTHORITY-FRESHNESS-TX-I05` | TX-1 revalidation + authority snapshot → evidence alanları | YOK | I04 |
| **I06** | `UYAP-LEGACY-POA-FLAG-DEPRECATION-I06` | Faz 1-2 legacy flag emeklilik + telemetry | YOK | I05 |
| **I07** | `UYAP-AUTHORITY-GOVERNANCE-CLOSURE-I07` | Governance closure + register kayıtları | YOK | I06 |

**Tek büyük PR önerilmez.** I02 ayrıca `pending-migration-coordination-register` GO-MIGRATE gate'i gerektirir.

### L.1 Preflight bağımlılığı

`UYAP-SEND-HARD-GATE-PREFLIGHT-R01` **başlayabilmesi için zorunlu:** **I01 + I03 + I04**
(authority zinciri canlı ve gate canonical fact'ten besleniyor olmalı).
`UYAP-OPERATION-EVIDENCE-CANARY-R02` için ek olarak **I05** zorunludur (TOCTOU kapatılmadan canary
tekrarlanmaz).

---

## M. Owner Decision Gate

### DECISION-1 — Office-internal delegation (Model C eki) kabul edilsin mi?

```text
DECISION:
UYAP_SEND yetkisi YALNIZ POA'da adı geçen acting lawyer'a mı verilecek (Model B),
yoksa aynı büroda POA sahibi avukatın yetkisi canonical bir delegation kaydıyla
başka bir avukat/personel tarafından mı kullanılabilecek (Model C eki)?

OPTION A — MODEL B ONLY (fail-closed)
  Anlam : POA'da PoaLawyer olarak kayıtlı acting lawyer dışında kimse UYAP_SEND yapamaz.
  Fayda : UYAP-CONST-002 ile tam uyum; non-repudiation en güçlü; ek model gerekmez;
          I01-I05 ile uygulanabilir.
  Risk  : Büro içi görevlendirme, birlikte vekâlet (tevkil) ve izin/rapor senaryolarında
          operasyonel sürtünme; POA'ya eklenmemiş yeni avukat işlem yapamaz.

OPTION B — MODEL C EKİ (canonical delegation ile)
  Anlam : POA sahibi lawyer set'i + canonical bir "UYAP execution delegation" kaydı ile
          yetkili acting lawyer genişletilir.
  Fayda : Gerçek büro işleyişine uyum; personel hazırlama + avukat yetkisi ayrımı kurulabilir.
  Risk  : Repository'de canonical delegation source-of-truth YOKTUR (ReportingLine yönetim
          hiyerarşisi, CaseLawyer case ataması, defaultPermissions iç capability) → YENİ model +
          lifecycle + owner/legal semantiği gerekir; POA kapsamı ile iç organizasyon yetkisinin
          karışması riski; tevkil yetkisi hukuken POA metnine bağlıdır ve repository bunu taşımaz.

RECOMMENDATION:
  OPTION A (Model B only). Gerekçe: UYAP-CONST-002 ve UYAP-BC-OFFICE-001 zaten server-side
  resolution + "personel varsayılan execution authority DEĞİL" hükmünü ratifiye etmiştir;
  delegation için canonical kaynak repository'de yoktur ve uydurulamaz. Model C ekine ihtiyaç
  doğarsa AYRI bir owner+legal workstream'de (delegation source-of-truth + lifecycle) tasarlanmalıdır.

DEFAULT IF UNDECIDED:
  FAIL-CLOSED / NO IMPLEMENTATION — Model B only geçerlidir; delegation yolu AÇILMAZ.
```

### DECISION-2 — POA lifecycle şema kapsamı ne kadar genişletilsin?

```text
DECISION:
Mevcut PoaStatus (ACTIVE|EXPIRED|REVOKED|PENDING) + isActive + isLimited/validUntil + dateIssued
hukuken yeterli mi, yoksa effectiveFrom / revokedAt / azil-istifa-askı ayrımı / POA↔Case bağı
şema düzeyinde eklenmeli mi?

OPTION A — MEVCUT ŞEMA YETERLİ (yalnız D-1/D-2 tenant güvenliği eklenir)
  Anlam : ACTIVE dışındaki her durum RED; dateIssued yürürlük proxy'si; BU_DOSYA kalıcı fail-closed.
  Fayda : En küçük schema delta; authority sonucu zaten fail-closed; I02 tek migration paketi.
  Risk  : Azil/istifa/askı hukuki raporlamada ayrışmaz; BU_DOSYA kapsamlı vekâletler kullanılamaz;
          yürürlük tarihi ile düzenleme tarihi ayrışan vekâletler yanlış değerlendirilebilir.

OPTION B — LIFECYCLE GENİŞLETME (D-3/D-4/D-5 dahil)
  Anlam : effectiveFrom, revokedAt + revocationBasis, POA↔Case canonical bağı eklenir.
  Fayda : Hukuki doğruluk ve evidence zenginliği artar; BU_DOSYA kapsamı kullanılabilir hale gelir.
  Risk  : Daha büyük schema/migration/backfill yüzeyi; mevcut POA verisinde bu alanlar yok →
          backfill semantiği owner/legal kararı gerektirir (hangi tarih effectiveFrom sayılacak?).

RECOMMENDATION:
  OPTION A (şimdilik). Gerekçe: authority sonucu her iki seçenekte de aynı fail-closed davranışı
  üretir; genişletme hukuki raporlama ihtiyacıdır ve backfill semantiği ayrı legal girdi ister.
  D-3/D-4/D-5 ayrı bir bounded pakette (I02'den sonra) ele alınabilir.

DEFAULT IF UNDECIDED:
  FAIL-CLOSED / NO IMPLEMENTATION — OPTION A kapsamı geçerlidir; D-3/D-4/D-5 AÇILMAZ,
  BU_DOSYA ve OZEL kapsamlar RED kalır.
```

**Owner'a sorulmayanlar (repository/governance tarafından zaten cevaplanmış):**
`actingLawyerId`'nin server-side çözülmesi · `body.lawyerId`'nin authority olmaması · personelin
varsayılan execution authority olmaması · POA'nın her attempt'te yeniden değerlendirilmesi
(hepsi `UYAP-CONST-002` + `UYAP-BC-OFFICE-001`/`-CLIENT-001` ile RATIFIED).

---

## N. Non-Authorization Clause

Bu tasarım hiçbir implementation, schema, migration, feature flag, canary, transport, production adapter,
credential custody, portal automation veya cutover yetkisi **üretmez**. Devam eden HOLD'lar 6/6 korunur.

**NEXT ELIGIBLE TASK:** `UYAP-ACTING-LAWYER-RESOLVER-I01` — **NOT GRANTED / NOT STARTED**
(DECISION-1 ve DECISION-2 owner tarafından karara bağlanmadan başlatılamaz).

## Owner Approval Record

```text
Task           : UYAP-CPE-POA-AND-ACTING-LAWYER-AUTHORITY-DESIGN-01
Owner yetkisi  : GO-DESIGN (ANALYZE-FIRST), docs-only
Kanıt tabanı   : canonical main `1b682a9a`
Seçilen model  : MODEL B — acting-lawyer matched POA (UYAP-CONST-002 ile uyumlu)
Açık kararlar  : DECISION-1 (delegation) · DECISION-2 (POA lifecycle şema kapsamı)
Default        : her iki kararda FAIL-CLOSED / NO IMPLEMENTATION
```

---

## Ek — UYAP-CPE-POA I01/I02 HISTORICAL RECONCILIATION (2026-07-27)

```text
Kaynak : PROGRAM-WIDE-SPRING-CLEANING-OWNER-RESIDUALS-FULL-EXECUTION-R01 / ITEM-02
Statü  : HISTORICAL TRUTH RECORD — append-only
Rol    : Bu bölüm yalnız TARİHSEL GERÇEĞİ kaydeder. Hiçbir yetki üretmez,
         hiçbir gate açmaz, hiçbir mevcut hüküm veya statüyü DEĞİŞTİRMEZ.
```

Bu belgenin yukarıdaki bölümlerinde geçen `NOT GRANTED / NOT STARTED` ifadeleri
**yazıldıkları tarih itibarıyla doğruydu** ve tarihsel kayıt olarak korunur. Aşağıdaki tablo,
o ifadelerden sonra repository'de gerçekleşmiş olayları ekler.

| Eksen | Gerçek |
| --- | --- |
| **IMPLEMENTATION** | **MERGED / CANONICAL** — `UYAP-ACTING-LAWYER-RESOLVER-I01`: PR #1627, squash `dde01ca2` (2026-07-26). `UYAP-POA-TENANT-SAFETY` (§L'de `I02`): PR #1633, squash `e20b36ff` (2026-07-27); `schema.prisma` + `prisma/migrations/20260726210000_uyap_poa_tenant_safety_i01` içerir. |
| **HISTORICAL AUTHORITY RECORD** | **NOT FOUND / INCOMPLETE** — `decision-log.md` ve governance korpusu taramasında bu iki paketi başlatan bir owner GO kaydı, grant veya `GO-MIGRATE` gate kaydı **bulunamamıştır**. `DECISION-1` (office-internal delegation) ve `DECISION-2` (POA lifecycle şema kapsamı) için de çözüm kaydı bulunamamıştır. |
| **RETROACTIVE RATIFICATION** | **NONE** — bu kayıt geçmişte var olmayan bir yetkiyi var saymaz, `NOT GRANTED` ifadesini `GRANTED`'a çevirmez ve `GO-MIGRATE` gate'ini geriye dönük açmaz. |
| **CURRENT OPERATIONAL STATUS** | **VERIFY SEPARATELY** — bkz. §Ek.2. Kod merge edilmiştir; migration **uygulanmamıştır**. |

### Ek.1 — Task ID drift çözümü (mekanik, authority etkisi YOK)

Aynı iş paketi iki farklı ID ile dolaşımdadır:

```text
canonical decomposition (§L, I02 satırı)
    UYAP-POA-TENANT-SAFETY-I02
    kapsam: "D-1/D-2 tenantId + composite FK + backfill + migration"   Schema: VAR   Bağımlılık: I01

repository artefaktları (hepsi tutarlı biçimde "i01" eki taşır)
    PR #1633 başlığı  : "UYAP-POA-TENANT-SAFETY-I01 — canonical tenantId + composite tenant-safe FK"
    branch            : claude/uyap-poa-tenant-safety-i01
    squash commit     : e20b36ff
    migration dizini  : 20260726210000_uyap_poa_tenant_safety_i01
```

**Adjudication:** Kapsam tanımları birebir örtüşmektedir (`tenantId` + composite FK + migration).
Bu **iki ayrı iş değildir**; tek paketin yanlış sonek ile adlandırılmasıdır. Canonical paket
kimliği `§L`'nin verdiği **`UYAP-POA-TENANT-SAFETY-I02`**'dir; repository artefaktlarındaki
`-I01` soneki bir **isimlendirme hatasıdır** ve ayrıca `UYAP-ACTING-LAWYER-RESOLVER-I01` ile
sayısal olarak çakışmaktadır.

**Uygulanan düzeltme — yalnız crosswalk:**

```text
UYAP-POA-TENANT-SAFETY-I02   (canonical paket kimliği)
  ALIAS / REPOSITORY LABEL:  UYAP-POA-TENANT-SAFETY-I01
  PR #1633 · e20b36ff · migration 20260726210000_uyap_poa_tenant_safety_i01
```

**Bilinçli olarak YAPILMAYAN:** migration dizini yeniden adlandırılmamıştır. Prisma migration
adı `_prisma_migrations` tablosundaki checksum/kimlik kaydının parçasıdır; yeniden adlandırma
bir schema/migration mutasyonudur ve bu görev tarafından yetkilendirilmemiştir. PR başlığı ve
squash commit mesajı da tarihsel kayıttır ve değiştirilmez.

### Ek.2 — Migration live-apply durumu (metadata-only ölçüm)

2026-07-27'de `prisma migrate status` **salt-okuma metadata sorgusu** ile ölçülmüştür.
Hiçbir `.env` değeri, connection string, credential veya veri içeriği okunmamış/raporlanmamıştır.
Hiçbir migration uygulanmamıştır.

```text
ÖLÇÜM (local development database — .env'in çözdüğü hedef):
  105 migration bulundu
  UYGULANMAMIŞ 3 migration:
    20260726120000_claim_formation_projection_binding_persistence   (PR #1630)
    20260726190741_client_p2_u03_track_b_i01_financial_disclosure_foundation (PR #1629)
    20260726210000_uyap_poa_tenant_safety_i01                        (PR #1633)

UYAP-POA-TENANT-SAFETY LIVE APPLY STATUS:
  NOT APPLIED  (local development database, 2026-07-27 ölçümü)

PRODUCTION APPLY STATUS:
  UNKNOWN — production veritabanına erişilmemiştir; bu ölçüm production hakkında
  hiçbir iddia taşımaz.
```

**Sonuç:** Kod main'de canonical'dır fakat şema değişikliği **hiçbir çalışan veritabanında
etkin değildir**. `I02` paketi bu nedenle `IMPLEMENTATION_COMPLETE / NOT APPLIED` durumundadır.

### Ek.3 — Bu kaydın açmadıkları

```text
I03..I07                      : NOT GRANTED / NOT STARTED olarak KALIR
DECISION-1 / DECISION-2       : AÇIK KALIR — default FAIL-CLOSED / NO IMPLEMENTATION
GO-MIGRATE gate               : AÇILMADI
migration apply yetkisi       : NONE
UYAP CUTOVER HARD HOLD        : KORUNUR
IMPLEMENTATION AUTHORITY      : NONE
```

Bu bölüm bir **uzlaştırma kaydıdır, ratifikasyon değildir.** Owner'ın I01/I02'nin yetkiyle mi
yürütüldüğüne dair kararı hâlâ açıktır ve bu kayıt onu vermez.

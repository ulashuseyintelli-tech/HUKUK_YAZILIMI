---
status: active
review-trigger: "Sprint sonu — Faz 1 imzasına kadar"
---

# Aggregate Boundaries

**Tarih:** 2026-05-19  
**Durum:** Active — Faz 1'in kilit noktası  
**Bağlam:** Vocabulary critical-path stabilize edildi (`03-vocabulary-unification.md`). Engine topology + policy/runtime ayrımı net (`05-engine-consolidation-decision.md`). Şimdi: hangi şeyler **aynı consistency boundary** içindedir?

---

## 0. Anayasal Soru ve Disiplin

> **Aggregate = transactional consistency boundary. Başka hiçbir şey değil.**

Bu belge tek bir soruya cevap arar:

> **Which invariants must be transactionally consistent?**

DDD purity trap uyarısı:
- Her şeyi ayrı aggregate yapmak → distributed mini-monolit → consistency cehennemi
- Her şeyi tek aggregate yapmak → contention + scale problemi
- "Textbook bounded context" peşinde koşmak → academic showcase, ürün değil

Hukuk yazılımı için kural: **az aggregate, kalın sınırlar, açık invariants**.

---

## 1. Aggregate Listesi (5)

İlk versiyonda **sadece 5 aggregate**. Geri kalan her şey ya bir aggregate'in içinde event/entity/projection, ya reference data, ya da operational artifact.

| Aggregate | Identity | Sorumluluğu | Lifecycle |
|---|---|---|---|
| **Tenant** | TenantId | Multi-tenant kök, billing, RBAC | Tenant.created → ... |
| **Case** | (TenantId, CaseId) | Tek hukuki dosya — açılış, takip akışı, ödeme, kapanış. **Money Truth Kernel'in merkezi.** | CASE_OPENED → CASE_CLOSED |
| **Debtor** | (TenantId, DebtorId) | Borçlu kimliği. Cross-case yaşar (aynı borçlu farklı dosyalarda). Identity facts: TCKN/VKN, ad, adres listesi. | Debtor.registered → Debtor.archived |
| **Client** | (TenantId, ClientId) | Alacaklı kimliği. Cross-case yaşar. | Client.registered → Client.archived |
| **Lawyer** | (TenantId, LawyerId) | Avukat kimliği. Cross-case yaşar. Baro no, izinler. | Lawyer.registered → Lawyer.archived |

**Bu kadar.**

---

## 2. NOT Aggregates (kasıtlı olarak)

Aşağıdakiler aggregate **değildir**. Her birinin nerede yaşadığı netleşir:

### 2a. Case'in iç event'leri (Case aggregate stream'inde)

| Concept | Niye aggregate değil |
|---|---|
| Payment | Bir Case'e bağlı, kendi state lifecycle'ı yok. `PAYMENT_RECEIVED` / `PAYMENT_REVERSED` Case stream'inde event. |
| Claim / ClaimItem | Case'e bağlı, kendi lifecycle'ı yok. `CLAIM_REGISTERED` Case stream'inde event. |
| InterestPolicy | Case'e atanır, immutable. `INTEREST_POLICY_ASSIGNED` Case stream'inde event. |
| Instrument (çek, bono, sözleşme) | Case'e bağlı. `INSTRUMENT_REGISTERED` Case stream'inde event. |
| CaseDebtor (case-debtor relation) | Case-içi projection. "Bu case'de debtor X'in rolü Y, tebligat adresi Z". Debtor aggregate'in cross-case identity'sinden ayrı. |
| CaseLawyer | Aynı pattern. |
| Tebligat (Faz 2) | Case stream'inde event + sealed artifact. |
| Haciz (Faz 2) | Case stream'inde event. |
| Sale (Faz 2) | Case stream'inde event. |

### 2b. Reference data (aggregate değil, stream/tablo)

| Concept | Sorumluluğu |
|---|---|
| RateTable (TCMB) | `reference_data_events.RATE_TABLE_PUBLISHED` — tarih + oran satırı |
| InterpretationProfile | Per-tenant immutable profile (`TBK100_v1`, `TBK100_v2`, vs.) |
| ExecutionOffice | 860 önceden seed edilmiş icra dairesi — read-only catalog |
| TariffYear | Yıllık tarife — read-only catalog |
| HolidayCalendar (Faz 2) | Adli tatil + resmi tatil tablosu |

### 2c. Operational mechanisms (aggregate değil, internal infrastructure)

| Concept | Yer |
|---|---|
| OutboxAction | `IcrabotOutboxAction` — internal dispatch queue |
| TimelineEntry | `IcrabotTimelineEntry` — Case stream'in projection'ı |
| EngineRun | `IcrabotEngineRun` — rule eval audit |
| FactStore (Icrabot Fact/Flag) | Case stream'in mutable projection'ı |

---

## 3. Concept Ownership Table

| Concept | Aggregate Owner | Mutable? | Emits Event? | Projection Only? | Transaction Boundary |
|---|---|---|---|---|---|
| Tenant identity | Tenant | yes (settings) | yes | no | Tenant |
| Case fileNumber | Case | no (immutable after CASE_OPENED) | no (set by CASE_OPENED payload) | no | Case |
| Case caseStatus | Case | no (event-derived) | yes (status change events) | no | Case |
| Case ExecutionPath | Case | no (immutable after CASE_OPENED) | no (set by CASE_OPENED payload) | no | Case |
| Case ProcedureType | Case | no (immutable after CASE_OPENED) | no (set by CASE_OPENED payload) | no | Case |
| Case current balance | (none — projection) | yes (rebuilt) | no (calculator output) | **yes** | rebuildable from Case stream |
| Case timeline | (none — projection) | yes (rebuilt) | no | **yes** | rebuildable |
| ClaimItem (line item) | Case | no (compensating event for correction) | yes (`CLAIM_REGISTERED`) | no | Case |
| Payment | Case | no (compensating event) | yes (`PAYMENT_RECEIVED`, `PAYMENT_REVERSED`) | no | Case |
| Payment allocation (TBK 100 result) | (none — calculator output) | yes (rebuilt) | no | **yes** | rebuildable |
| Instrument (çek/bono) | Case | no | yes (`INSTRUMENT_REGISTERED`) | no | Case |
| InterestPolicy assignment | Case | no (yeni assignment yeni event) | yes (`INTEREST_POLICY_ASSIGNED`) | no | Case |
| Debtor identity (TCKN, ad) | Debtor | yes (correction event-driven) | yes | no | Debtor |
| Debtor address list | Debtor | yes (events: address added/updated) | yes | no | Debtor |
| Debtor's role in a Case | Case | no (case-specific) | yes (within Case stream) | no | Case |
| Client identity | Client | yes | yes | no | Client |
| Client's role in a Case | Case | no | yes | no | Case |
| Lawyer identity, baro no | Lawyer | yes | yes | no | Lawyer |
| Lawyer's role in a Case | Case | no | yes | no | Case |
| RateTable (TCMB) row | (none — reference) | no (append-only series) | yes (`RATE_TABLE_PUBLISHED` reference stream) | no | reference_data_events |
| InterpretationProfile | (none — reference) | no | no (config) | no | reference catalog |
| ExecutionOffice (860) | (none — reference) | rare (catalog update) | no | no | reference catalog |
| OutboxAction | (none — infrastructure) | yes (status updates) | no | no | own queue table |
| TimelineEntry | (none — projection) | no (append-only projection) | no | **yes** | rebuildable from event log |
| FactStore current value (`IcrabotCaseFact`) | (none — projection of Case stream) | yes (upsert) | no (audit log keeps history) | **yes** | rebuildable |
| EngineRun audit | (none — internal) | no | no (own audit) | no | own audit table |

---

## 4. Invariants per Aggregate

### 4a. Case Aggregate

**Hard invariants (transactionally enforced):**
1. `tenant_id` immutable after CASE_OPENED
2. `case_id` unique per tenant
3. `fileNumber` unique per tenant
4. `aggregate_version` monotonic + gap-free per case (DB unique constraint)
5. `INSTRUMENT_REGISTERED` veya `CLAIM_REGISTERED`'dan en az biri olmadan `INTEREST_POLICY_ASSIGNED` olamaz (alacak kaynağı tanımlı olmalı)
6. **`PAYMENT_RECEIVED` her zaman kabul edilir** — `INTEREST_POLICY_ASSIGNED` olmasa bile. Pratikte: ödeme önce gelebilir, faiz tartışmalı olabilir, avukat henüz politika seçmemiş olabilir, dosya migration'dan geliyor olabilir. **Ödeme = hukuki gerçek, kayıt edilmesi engellenmemeli.**
   
   Ama: **`INTEREST_POLICY_ASSIGNED` olmadan balance/allocation finalization yapılamaz.** TBK 100 mahsup için faiz politikası gerek. Policy atanmadıkça ödeme **"unallocated"** durumda kayıt altında kalır, projection'da görünür ama bucket'lara dağıtılmaz. Avukat policy atadıktan sonra geriye dönük allocation hesaplanır.
7. `CASE_CLOSED` sonrası yeni `PAYMENT_RECEIVED`, `CLAIM_REGISTERED`, `INTEREST_POLICY_ASSIGNED` olamaz (yalnızca `CASE_REOPENED` sonrası kabul)
8. **`CASE_SUSPENDED` ödeme yasağı değil, workflow kısıtıdır.** Ödeme kabul edilir (sulh görüşmesi, taksit protokolü, geçici durdurma, ihtiyati süreç, icranın geri bırakılması — pratikte sık olur). Ama enforcement action'lar (haciz, satış, müzekkere) suspended state'te yasak. Allocation strategy ve faiz işletimi profile'a göre değişebilir.

**Soft invariants (eventual / FK):**
- `creditor_client_id` referansı bir Client aggregate'e işaret eder (FK)
- `debtor_id` referansı bir Debtor aggregate'e işaret eder (FK)
- `lawyer_id` referansı bir Lawyer aggregate'e işaret eder (FK)
- `execution_office_id` referansı reference catalog'a işaret eder (FK)

### 4b. Debtor Aggregate

**Hard invariants:**
1. `tenant_id` immutable
2. (TCKN OR VKN) unique per tenant — aynı kişi iki kez kaydedilemez
3. `aggregate_version` monotonic per debtor
4. Identity facts (ad, soyad, TCKN/VKN) correction by event (`DEBTOR_IDENTITY_CORRECTED`)

**Cross-aggregate ilişki:** Bir Debtor birden fazla Case'de yer alabilir. Case'in Debtor referansı ona bir CaseDebtor projection'ı ekler ama Debtor aggregate'in stream'i Case'e bağımlı değil.

### 4c. Client / Lawyer Aggregate

Debtor ile aynı pattern. Cross-case identity, kendi event stream'i, identity facts mutable via compensating event.

### 4d. Tenant Aggregate

**Hard invariants:**
1. `tenant_id` immutable
2. Tenant settings JSON-doc içinde (subscription plan, RBAC, vs.) — billing/auth katmanı, kernel ile az ilgili

Faz 1'de Tenant aggregate çoğunlukla pasif. Auth/billing katmanı işliyor.

---

## 5. Cross-Aggregate Boundaries

İki aggregate arasında **transactional consistency yok**. Sadece eventual.

### 5a. Case → Debtor

Case açılırken `caseDebtors` listesi yazılır. Debtor henüz oluşturulmamışsa **önce Debtor aggregate yaratılır, sonra Case yaratılır** (iki ayrı transaction). Race condition: Debtor mevcut değilse FK fail.

Mevcut `case.service.create()` zaten bu pattern'de — debtor yoksa aynı transaction'da yaratıyor (NOT cross-aggregate, **iki aggregate'i aynı tx'te update ediyor**). Bu **DDD ilkesinin esnek yorumu** — pratikte kabul edilebilir, çünkü:
- Debtor yaratımı idempotent (TCKN/VKN unique constraint var)
- Case yaratımı atomik olmalı (ya tüm aggregate ya hiç)
- İki aggregate de aynı tenant'a bağlı

**Faz 1 kararı:** Mevcut "tek transaction'da iki aggregate" pattern'i korunur. Saf DDD değil, ama legal-grade tutarlılık için pragmatik.

### 5b. Case → Reference Data

Case `RateTable` ve `InterpretationProfile`'ı **read-only** olarak kullanır. Calculator çağrısı bu reference'ları parametre alarak deterministic çalışır. Reference data değişimi Case stream'ine event olarak girmez (refData dış parametre).

### 5c. Case'ler Arası

İki ayrı Case birbirini etkileyemez. Bir Case'in event'i başka Case'in state'ini değiştiremez. **Cross-case event link yok.**

İstisna: Aynı debtor birden fazla case'de varsa, debtor identity update tüm case'lere yansır (Debtor aggregate'in projection'ı tüm case'leri tarayan UI tarafında birleştirir). Ama Case stream'i Debtor'dan event almaz.

---

## 6. Multi-Tenant Isolation

Tüm aggregate'lerin identity'sinde `tenant_id` zorunlu kompozit:

- `(tenant_id, case_id)` Case primary key'in kavramsal hali
- `(tenant_id, debtor_id)` Debtor için
- `(tenant_id, client_id)` Client için
- `(tenant_id, lawyer_id)` Lawyer için

Hard rule: **Cross-tenant query yasak.** Repository katmanında her query `tenant_id` parametresi alır.

`IcrabotCaseFact`, `IcrabotTimelineEntry`, `IcrabotEngineRun` gibi infrastructure tabloları da `tenant_id` taşımalı (mevcut schema'da bunu doğrulamak Faz 1 görevidir — kritik audit noktası).

---

## 7. ExecutionPath × ProcedureType Matrisi

`03-vocabulary-unification.md` #22'de iki ayrı kavramı ayırdık. Aggregate'in payload'ında her ikisi de yer alır, **bağımsız boyutlardır:**

| ExecutionPath ↓ \ ProcedureType → | ILAMSIZ | ILAMLI | KAMBIYO |
|---|---|---|---|
| HACIZ | ✅ Genel haciz yolu (en yaygın) | ✅ İlamlı haciz | ✅ Kambiyo senedi → haciz |
| IFLAS | ✅ İflas yolu (tüzel kişi) | ✅ İlamlı iflas | ✅ Kambiyo → iflas (bono) |
| REHIN | ⚠️ Rehinli alacak farklı semantik | ⚠️ İlamlı rehin satışı | ⚠️ Kambiyo + rehin nadir |
| IPOTEK | ✅ İpoteğin paraya çevrilmesi | ✅ İlamlı ipotek | ❌ İpotek + kambiyo geçersiz |
| TAHLIYE | ✅ Kira tahliye | ⚠️ İlamlı tahliye nadir | ❌ Tahliye + kambiyo yok |

**Aggregate karar:** Her iki boyut Case aggregate'in `CASE_OPENED` event payload'ında zorunlu alan. Atandıktan sonra immutable. Yanlış kombinasyon (örn IPOTEK + KAMBIYO) Case açılırken **policy gate** tarafından reddedilir (PolicyGateService işi).

---

## 8. ClaimItem ↔ Due İlişkisi (P1 Pending)

`90-future-work/pending/duetype-vs-claimitemtype.md` aktif. 14 gün timeout.

**Aggregate boundaries belgesi geçici varsayım:**

İki kavram **ayrı** kabul edilir (ilk hipotez):
- `ClaimItem` = total receivable line (CLAIM_REGISTERED event payload'ı içinde)
- `Due` = scheduled installment (örn aylık nafaka, dönemsel kira)

Her ikisi de **Case aggregate'in event stream'inde** olur. Birleşim/ayrım Faz 2'de netleşir.

P1 sonucu "merge" çıkarsa: bu belge revize edilir. Şu an tutucu varsayım.

---

## 9. AllocationType ↔ ClaimItemType Subset Mapping + AllocationPolicy

TBK 100 mahsup zinciri:

```
PAYMENT_RECEIVED event
   ↓
TBK100Allocator.allocate(payment, currentClaimBreakdown, allocationPolicy)
   ↓
AllocationStep[]  (bu liste, payment'in nereye gittiği — her step bir AllocationType taşır)
   ↓
Balance projection (her ClaimItemType bucket'ı için new amount)
```

### 9a. AllocationType ↔ ClaimItemType Mapping (hard)

| AllocationType | Maps to ClaimItemType(s) |
|---|---|
| INTEREST | INTEREST + PRE_INTEREST + POST_INTEREST |
| EXPENSE | EXPENSE |
| FEE | FEE |
| ATTORNEY_FEE | ATTORNEY_FEE |
| PENALTY | PENALTY + CHECK_PENALTY + CONTRACTUAL_PENALTY |
| PRINCIPAL | PRINCIPAL |
| OTHER | TAX_KDV + TAX_BSMV + TAX_KKDF + OTHER |

**Subset disiplini:** Her `AllocationType` en az bir `ClaimItemType`'a karşılık gelmeli. AllocationType kümesi ClaimItemType kümesinin **gruplanmış subset'i**.

### 9b. AllocationPolicy (sıralama policy-driven)

**Hardcoded mahsup sırası YOK.** Bunun yerine **AllocationPolicy** kavramı kullanılır.

Gerekçe: Klasik yaklaşım `EXPENSE → INTEREST → PRINCIPAL` görünse de, gerçek uygulamada:
- Sözleşmesel override (taraflar farklı sıra kararlaştırmış olabilir)
- İlam özel hükmü ("önce vekalet ücreti")
- Mahkeme kararı (bilirkişi raporu farklı sıra önerebilir)
- Akdi faiz vs temerrüt faizi öncelik farklılıkları
- Cezai şart, vekalet ücreti, vergi kalemlerinin yeri tartışmalı
- Profile-based allocation (`TBK100_v1` vs `TBK100_v2`)

İhtiyaçları farklı sıralamaları gerektirir.

**AllocationPolicy yapısı:**

```
AllocationPolicy {
  policy_id: 'DEFAULT_TBK100' | 'CONTRACT_OVERRIDE_X' | 'COURT_ORDER_Y' | ...
  ordering: AllocationType[]   // ordered list — sıra önemli
  ties: 'oldest_first' | 'pro_rata' | ...   // aynı priority'de eşitlik kuralı
  reasoning?: string            // default'tan sapma varsa zorunlu
  effective_from: ISO8601
  references?: string[]         // ilam, sözleşme hükmü, mahkeme kararı linki
}
```

**Default profile:** `DEFAULT_TBK100` — klasik genel sıra (somut sıralama interest-engine'in implementation kararı, bu belgede freeze değil).

**Policy-driven allocation:**
- Case açıldığında veya `INTEREST_POLICY_ASSIGNED` event'inde `allocation_policy_id` taşınır
- Calculator çağrısında policy parametre alır
- Default'tan sapma için event payload'ında `reasoning` zorunlu

**Bu bölüm kavramsal kayıt.** Implementation kararı bu belgenin dışında. Önemli olan: TBK 100 sırası **anayasal kural değil**, policy'dir. Her payment için hangi policy uygulandığı event'te kayıtlı.

### 9c. Mapping calculator'ın iç sorumluluğu

Payment allocation event payload'ında hem AllocationType hem amount yer alır. Projection ClaimItemType bucket'larını günceller. Calculator pure function olduğu için (`asOf` + `interpretationProfileId` + `allocationPolicyId` zorunlu parametre).

---

## 10. Bu Belgenin Kapsamı Dışı

Aşağıdakiler **bu belgede kararlaştırılmaz**, başka belgeler tutar:

- Event payload schema'ları → `07-event-taxonomy-v1.md`
- Causality kuralları (yasak transition'lar, kullanıcı kararı gerektirenler) → `08-causality-rules.md`
- Day count, asOf semantiği → `09-temporal-semantics.md`
- Implicit guard rules (kapalı case'e payment vs.) → `10-implicit-rules.md`
- Domain Event Bridge (case.service'in event emission disiplini) → `11-domain-event-bridge.md`
- Snapshot policy → `00-architecture.md §9` (genel), Faz 2 daemon spec ayrı
- Replay strategy → Faz 2
- Projection storage detayları → implementation (her projection'ın spec'i)

---

## 11. Aggregate Sayısı Disiplini

Bu belge **5 aggregate** ile başlar. İlerleyen fazlarda yeni aggregate eklemek için:

1. Bir invariant tanımla
2. Bu invariant'in **aynı transaction içinde** zorlanması gerektiğini kanıtla
3. Mevcut bir aggregate içinde zorlanamayacağını göster
4. Yeni aggregate için ADR aç (`91-decision-log/`)

Aksi halde: yeni concept ya mevcut bir aggregate'in iç event'i, ya projection, ya reference data, ya da operational mechanism olur.

**Hard rule (mimari):** Yeni aggregate eklenmeden önce ADR zorunlu.

---

## 12. Faz 2'ye Bırakılan Sorular

| Soru | Niye şimdi değil |
|---|---|
| Tebligat aggregate olur mu? | Şimdi sadece Case stream'inde event. Sealed artifact pattern eklenince ayrı aggregate olabilir mi sorusu netleşir. → `90-future-work/deferred/sealed-artifacts-pattern.md` |
| PoA (Vekaletname) aggregate olur mu? | Operational, Faz 2 |
| Haciz / Sale aggregate olur mu? | Faz 2 dispatch path eklenince düşünülür |
| External Case (UYAP) aggregate sınırı | Faz 2 |

---

## 13. Mevcut Koda Eşleme (Reality Check)

Bu belge **yeni bir aggregate yaratmıyor**. Mevcut Prisma modelleri zaten bu sınırlara yakın:

| Aggregate | Ana Prisma Model |
|---|---|
| Tenant | `Tenant` |
| Case | `Case` (+ ilgili: `CaseClient`, `CaseDebtor`, `CaseLawyer`, `CaseStaff`, `Due`, `Collection`, `ClaimItem`, `Document`, ...) |
| Debtor | `Debtor` (+ `DebtorAddress`, `EstateHeir`) |
| Client | `Client` |
| Lawyer | `Lawyer` |

Mevcut yapı zaten **5 aggregate'e yakın** organize. Bu belgenin işi:
1. Sınırı netleştir
2. Hard invariants'ı belge haline getir
3. Cross-aggregate FK ile transactional consistency'i ayır
4. Case'in iç event stream'i kavramını formalize et (event ingestion bridge ile)

Yani **rewrite yok, formalize var** (ADR-0001 ile uyumlu).

---

## 14. DoD

- [x] 5 aggregate listesi
- [x] Concept ownership tablosu (25+ satır)
- [x] Hard invariants per aggregate (Invariant #6 ve #8 hukuki gerçeğe göre revize edildi: ödeme her zaman kabul edilir, finalization policy'e bağlı)
- [x] Cross-aggregate FK pattern (DDD pragmatic)
- [x] Multi-tenant isolation hard rule
- [x] ExecutionPath × ProcedureType matrisi (avukat tarafından doğrulandı)
- [x] ClaimItem/Due geçici varsayım (P1 pending)
- [x] AllocationType ↔ ClaimItemType mapping
- [x] AllocationPolicy kavramı (TBK 100 sırası policy-driven, hardcoded değil)
- [x] Faz 2'ye bırakılan sorular
- [x] Mevcut Prisma'ya eşleme
- [x] **ulas onayı (2026-05-19)**

**Decision Status:** Accepted  
**Accepted On:** 2026-05-19  
**Supersedes:** none

---

## 15. Sıradaki Adım

İmza sonrası → `07-event-taxonomy-v1.md`. Mevcut v28-engine UYAP event'leri envanter olarak alınır, eksikler eklenir (`CASE_OPENED`, `CLAIM_REGISTERED`, `INTEREST_POLICY_ASSIGNED`, `PAYMENT_REVERSED`, `INSTRUMENT_REGISTERED`, `CASE_RESUMED`, `CASE_REOPENED`).

Event taxonomy bu belgedeki **aggregate ownership'i** referans alacak — her event hangi aggregate'in stream'ine ait?

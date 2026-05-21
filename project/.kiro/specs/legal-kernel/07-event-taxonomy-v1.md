---
status: active
review-trigger: "Faz 1 imzasına kadar — sprint sonu"
---

# Event Taxonomy v1

**Tarih:** 2026-05-19  
**Durum:** Active — Faz 1 vocabulary freeze'in son kilit belgesi  
**Bağlam:** Vocabulary stabilize (`03`), engine topology kararlaştı (`05`), aggregate boundaries imzalandı (`06`). Şimdi: hangi event'ler var, hangileri yok, kim emit eder, ne payload taşır?

---

## 0. Anayasal Kural (mutlak)

> **Events represent legal facts, not internal computations.**

Bu cümle bu belgenin tek koruyucu prensibidir. Her event tanımı bu cümleye karşı sınanır:

> "Bu olmuş bir hukuki gerçek mi, yoksa bir hesaplama sonucu mu?"

Eğer hesaplama sonucu ise → **event değildir**. Projection veya calculator çıktısıdır.

### Event Olmayanlar (kasıtlı yasak)

| İsim | Niye event değil | Yerine ne |
|---|---|---|
| `PAYMENT_ALLOCATED` | TBK 100 allocator çıktısı | `payment_allocation_log` projection |
| `BALANCE_UPDATED` | Calculator çıktısı | `case_balance_view` projection |
| `INTEREST_RECALCULATED` | Calculator çıktısı | `case_balance_view` projection (asOf parametreli) |
| `PROJECTION_REBUILT` | Internal computation | (telemetry log, event değil) |
| `CACHE_INVALIDATED` | Internal mechanism | (telemetry log) |
| `DASHBOARD_REFRESHED` | UI mechanism | (telemetry log) |
| `RULE_EVALUATED` | EngineRunner internal | `IcrabotEngineRun` audit (event log değil) |
| `FACT_WRITTEN` | EngineRunner internal | `IcrabotFactAudit` audit |

**Hard rule:** Yukarıdaki pattern'lerden biri taxonomy'ye eklenmek istenirse, ADR gerekir. Default cevap: **hayır, projection olarak yaz**.

---

## 1. Dört Katmanlı Yapı

Event'ler 4 farklı kaynaktan gelir, **ayrı namespace'lerde** tutulur. Karıştırılmaları replay consistency'yi öldürür.

| Katman | Kaynak | Truth Doğası | Storage | Aggregate Owner |
|---|---|---|---|---|
| **1. Domain Events** | Kullanıcı niyeti (avukat komutu) | Legal fact | `case_events` | Case / Debtor / Client / Lawyer |
| **2. Reference Events** | Sistem dışı referans değişimi | External fact (regulatory/economic) | `reference_data_events` | (none — global stream) |
| **3. Integration Events** | Dış sistem (UYAP, banka, PTT, KEP) | External world report | `case_events` (Case stream'inde) ama `source: 'external'` flag'li | Case |
| **4. Operational Events** | Runtime davranışı | Telemetry, **legal fact değil** | `operational_log` (ayrı tablo) | (none) |

### Anayasal ayrım (katman 1 vs 4)

> **What is emitted by user intent vs what is emitted by external reality vs what is emitted by runtime mechanism?**

Bu üç farklı dünya. Karıştırma yasak.

- **User intent (1):** Avukat "ödeme girdi" → `PAYMENT_RECEIVED` (Case stream)
- **External reality (3):** UYAP "tebligat tebliğ oldu" → `TEBLIGAT_DELIVERED` (Case stream, source=uyap)
- **Runtime mechanism (4):** Outbox dispatch fail → `OUTBOX_DISPATCH_FAILED` (operational_log, **NOT case stream**)

---

## 2. Layer 1 — Domain Events (Faz 1 Money Truth Kernel)

Money Truth Kernel için canonical event listesi. **Az sayıda, kalın sınırlı.**

### Naming Kuralı (mutlak)

> `NOUN_PAST_PARTICIPLE`

Olmuş bir gerçeklik, komut değil. Örnekler:

| ✅ Doğru | ❌ Yanlış |
|---|---|
| `PAYMENT_RECEIVED` | `RECEIVE_PAYMENT` |
| `CASE_OPENED` | `OPEN_CASE` |
| `CLAIM_REGISTERED` | `REGISTER_CLAIM` |
| `INSTRUMENT_REGISTERED` | `ADD_INSTRUMENT` |
| `INTEREST_POLICY_ASSIGNED` | `ASSIGN_INTEREST_POLICY` |

### Canonical Domain Events (13)

#### Case Aggregate — Lifecycle (5 event)

| Event | Anlamı | Emit Trigger |
|---|---|---|
| `CASE_OPENED` | Dosya açılışı | `case.service.create()` transaction commit sonrası |
| `CASE_SUSPENDED` | Dosya askıya alındı (sulh, ihtiyati durdurma, anlaşma) | Avukat komutu / mahkeme kararı |
| `CASE_RESUMED` | Askıdan devam (suspended → active) | Avukat komutu |
| `CASE_CLOSED` | Dosya kapanışı (tahsilat tamam, feragat, hitam) | Avukat komutu / sistem (full payment trigger) |
| `CASE_REOPENED` | Kapanmış dosya yeniden açıldı (hatalı kapanış, sonradan iade, ödeme iptali, mahkeme kararı, vb.) | Avukat komutu (gerekçe zorunlu) |

**Önemli ayrım:**
- `CASE_RESUMED`: askıdaki dosya devam ediyor (suspended → active)
- `CASE_REOPENED`: kapanmış dosya yeniden açıldı (closed → active). `CASE_CLOSED` immutable kalır, `CASE_REOPENED` `caused_by` ile zinciri kurar. Hukuki gerçek (kapanmış olduğu) silinmez, üzerine yeni bir hukuki gerçek (yeniden açılma) eklenir.

`CASE_CLOSED` sonrası `PAYMENT_RECEIVED`, `CLAIM_REGISTERED`, `INTEREST_POLICY_ASSIGNED` doğrudan kabul edilmez. Önce `CASE_REOPENED` gelmek zorunda. (Hard Invariant — `06-aggregate-boundaries.md §4a #7` ile uyumlu.)

#### Case Aggregate — Alacak Kaynakları (3 event)

| Event | Anlamı | Emit Trigger |
|---|---|---|
| `INSTRUMENT_REGISTERED` | Çek/bono/sözleşme/ilam — alacak nedeninin tanımı | Avukat komutu (case açılışı veya sonradan ekleme) |
| `CLAIM_REGISTERED` | Asıl alacak iddiası (kalem listesi: ana para + faiz + masraf + ...) | Avukat komutu |
| `INTEREST_POLICY_ASSIGNED` | **Legal computation contract** — faiz türü + başlangıç + day count + interpretation profile + allocation policy | Avukat komutu (case açılışı veya sonradan değişim) |

#### Case Aggregate — Para Hareketleri (2 event)

| Event | Anlamı | Emit Trigger |
|---|---|---|
| `PAYMENT_RECEIVED` | Ödeme alındı (her durumda kayıt — CASE_SUSPENDED, policy yok, fark etmez) | Avukat komutu / banka entegrasyonu (`source` flag'li) |
| `PAYMENT_REVERSED` | Ödeme iptal (banka return, hatalı giriş düzeltmesi, geri ödeme) | Avukat komutu / banka entegrasyonu |

**`PAYMENT_ALLOCATED` event değildir** (Anayasal Kural — Allocation is a calculation result).

#### Identity Aggregate Events (3 event)

| Event | Aggregate | Anlamı |
|---|---|---|
| `DEBTOR_REGISTERED` | Debtor | Yeni borçlu kaydı |
| `DEBTOR_IDENTITY_CORRECTED` | Debtor | TCKN/VKN/ad düzeltmesi (compensating event) |
| `DEBTOR_ADDRESS_ADDED` | Debtor | Adres eklendi |

Client + Lawyer için aynı pattern (`CLIENT_REGISTERED`, `CLIENT_IDENTITY_CORRECTED`, `LAWYER_REGISTERED`, `LAWYER_IDENTITY_CORRECTED`) — şu an Faz 1'in critical path'inde değil ama vocabulary'de yer ayrılır. Implementation: case create flow'unda zaten yaratılıyor, formalize edilecek.

---

## 3. Layer 2 — Reference Events

Sistem dışı referans değişiklikleri. Case'e ait değil ama deterministic replay için gerekli.

| Event | Anlamı | Source |
|---|---|---|
| `RATE_TABLE_PUBLISHED` | TCMB avans/kanuni/TTK 1530 oran satırı yayınlandı | TCMB EVDS API / manual |
| `TARIFF_PUBLISHED` | Yıllık tarife yayınlandı | Resmi Gazete (gazette-watcher) |

`reference_data_events` tablosunda. Per-tenant değil, **global stream**. Aggregate yok.

`HOLIDAY_PUBLISHED` Faz 2'ye bırakıldı (adli tatil + resmi tatil tablosu).

`REGULATORY_EVENT` (içtihat/Yargıtay yorum değişimi) — `90-future-work/deferred/regulatory-events-stream.md`'de deferred.

---

## 4. Layer 3 — Integration Events

Dış sistem rapor eder, biz kayıt altına alırız. **Case stream'inde** (yani Domain Event gibi davranır) ama event payload'ında `source: 'external'` ve `external_reference` zorunlu.

### Mevcut v28-engine UYAP Event'leri (envanterden)

`uyap-event-ingest.service.ts:75-241`'da normalize edilen event tipleri (mevcut canonical):

| UYAP Event | Domain Event Eşleniği (canonical) | Notu |
|---|---|---|
| `ASSET_FOUND_VEHICLE` | `ASSET_DISCOVERED` (vehicle subtype) | Faz 2'ye bırakıldı |
| `ASSET_FOUND_REAL_ESTATE` | `ASSET_DISCOVERED` (real_estate subtype) | Faz 2 |
| `ASSET_FOUND_BANK_ACCOUNT` | `ASSET_DISCOVERED` (bank subtype) | Faz 2 |
| `ASSET_FOUND_SALARY` | `ASSET_DISCOVERED` (salary subtype) | Faz 2 |
| `CASE_STATUS` | (UYAP'tan gelen status update) | Faz 2 |
| `TEBLIGAT_DELIVERED` | `TEBLIGAT_DELIVERED` (Faz 2) | Sealed artifact pattern ile |
| `TEBLIGAT_FAILED` | `TEBLIGAT_FAILED` (Faz 2) | |
| `HACIZ_PLACED` | `HACIZ_PLACED` (Faz 2) | |
| `HACIZ_LIFTED` | `HACIZ_LIFTED` (Faz 2) | |
| `PAYMENT_RECEIVED` | **`PAYMENT_RECEIVED`** (Layer 1 ile birleşir, source=uyap) | Money Truth Kernel için kritik |
| `OBJECTION_FILED` | `OBJECTION_FILED` (Faz 2) | |
| `LAWSUIT_FILED` | `LAWSUIT_FILED` (Faz 2) | |
| `SALE_SCHEDULED` | `SALE_SCHEDULED` (Faz 2) | |
| `SALE_COMPLETED` | `SALE_COMPLETED` (Faz 2) | |
| `SAFAHAT_UPDATE` | (UYAP timeline mirror — projection) | Faz 2, event değil |

### Faz 1 Integration Events (sadece kritik)

Money Truth Kernel için bu fazda **yalnız bir** integration event'i kanonize ediyoruz:

| Event | Anlamı | Source |
|---|---|---|
| `PAYMENT_RECEIVED` (source=external) | Banka/UYAP/icra dairesi'nden ödeme bildirimi | UYAP / Bank API |

Aynı `PAYMENT_RECEIVED` event tipi hem user-intent (avukat girdi) hem external (UYAP rapor etti) durumlarında kullanılır. Ayrım payload'daki `source` ve `actor` field'larında:

```
PAYMENT_RECEIVED {
  source: 'user' | 'external'
  actor: { type: 'user' | 'system', userId?, externalSystem?: 'uyap' | 'bank' | 'icra_dairesi' }
  external_reference?: string  // örn UYAP'ın kendi event_id'si
  ...
}
```

Diğer integration event'leri (TEBLIGAT_*, HACIZ_*, SALE_*, ASSET_*, OBJECTION_*) **Faz 2'de canonical hale getirilir**. Mevcut UYAP ingest'i çalışmaya devam eder, ama vocabulary canonical taxonomy'ye Faz 2'de uydurulur.

---

## 5. Layer 4 — Operational Events (telemetry)

Runtime mekanik davranışları. **Legal fact değil.** Ayrı bir tabloya yazılır (`operational_log`), event log'a girmez.

Örnek (canonize **edilmez**, sadece pattern):
- `OUTBOX_DISPATCH_FAILED` — outbox worker bir external send yapamadı
- `ENGINE_RUN_ABORTED` — rule eval crash
- `RETRY_SCHEDULED` — retry queue'ya alındı
- `RATE_FETCH_FAILED` — TCMB EVDS API timeout
- `CACHE_INVALIDATED` — fact store cache reset

**Bu event'lerin canonical taxonomy'si bu belgede tutulmaz.** Implementation kendi telemetry pattern'ini kullanır. Önemli olan: bunlar **case_events** veya **reference_data_events** tablolarına yazılmaz, replay'i etkilemez.

---

## 6. Canonical Event Payload Schemas (Faz 1)

Aşağıda 12 domain event'in payload schema'ları. Naming `snake_case`. Money tipi `{ amount_minor: bigint, currency: 'TRY' }`. Tarih `ISO 8601`.

### Common Header (her event'te zorunlu)

```typescript
{
  event_id: UUID
  event_type: string         // örn 'CASE_OPENED'
  schema_version: 1          // Faz 1 = 1
  
  tenant_id: UUID
  aggregate_type: 'Case' | 'Debtor' | 'Client' | 'Lawyer'
  aggregate_id: UUID
  aggregate_version: bigint  // monotonic, gap-free per aggregate
  
  occurred_at: ISO8601       // wall-clock event time (avukat ne zaman yaptı)
  recorded_at: ISO8601       // insert time (DB'ye ne zaman yazıldı)
  
  caused_by?: UUID           // parent event id (causality chain)
  
  actor: {
    type: 'user' | 'system' | 'external'
    user_id?: UUID
    external_system?: 'uyap' | 'bank' | 'kep' | 'ptt' | 'icra_dairesi'
    external_reference?: string
  }
  
  source: 'user' | 'external' | 'migration'
  
  payload: { ... event-specific }
}
```

### CASE_OPENED

```typescript
{
  ...header
  payload: {
    file_number: string                    // büro dosya numarası (immutable)
    execution_file_number?: string         // icra dairesi dosya no
    case_type: CaseTypeEnum                // GENERAL_EXECUTION, MORTGAGE, ...
    execution_path: ExecutionPath          // HACIZ, IFLAS, REHIN, IPOTEK, TAHLIYE
    procedure_type: ProcedureType          // ILAMSIZ, ILAMLI, KAMBIYO
    sub_category?: CaseSubCategory         // GENEL, NAFAKA, DOVIZ, KIRA, CEZA
    currency: Currency                     // Faz 1: TRY-only
    
    case_date: ISO8601                     // takip başlangıç tarihi
    
    creditor_client_ids: ClientId[]        // alacaklılar (FK)
    debtor_ids: DebtorId[]                 // borçlular (FK)
    lawyer_ids?: LawyerId[]                // avukatlar (FK)
    execution_office_id?: string           // icra dairesi (reference catalog FK)
    
    notes?: string
    metadata?: Record<string, unknown>
  }
}
```

### INSTRUMENT_REGISTERED

```typescript
{
  ...header
  payload: {
    instrument_id: UUID                    // unique within case
    instrument_type: 'CHECK' | 'BOND' | 'POLICE' | 'CONTRACT' | 'INVOICE' | 'JUDGMENT' | 'OTHER'
    
    // Tarih alanları (instrument_type'a göre)
    draw_date?: ISO8601                    // keşide tarihi (çek)
    presentation_date?: ISO8601            // ibraz tarihi (çek)
    due_date?: ISO8601                     // vade tarihi (bono, fatura)
    notice_date?: ISO8601                  // ihtar tarihi (sözleşme)
    judgment_date?: ISO8601                // ilam tarihi
    
    instrument_number?: string             // çek/bono numarası, fatura no
    issuer?: string                        // keşideci, fatura kesen
    amount?: Money                         // ekspedis, fatura toplamı
    
    notes?: string
  }
}
```

### CLAIM_REGISTERED

```typescript
{
  ...header
  payload: {
    claim_id: UUID                         // unique within case
    items: ClaimItem[]                     // alacak kalemleri
    
    instrument_reference?: UUID            // hangi instrument'a bağlı (varsa)
    
    notes?: string
  }
}

ClaimItem {
  item_id: UUID
  item_type: ClaimItemType                 // PRINCIPAL, INTEREST, EXPENSE, FEE, ATTORNEY_FEE, PENALTY, ...
  amount: Money
  description?: string
  reference_date?: ISO8601                 // bu kalemin başlangıç tarihi (varsa)
}
```

### INTEREST_POLICY_ASSIGNED

**Legal computation contract.** Bu event'in payload'ı yıllar sonra "o gün hangi yorum uygulanıyordu?" sorusunun cevabı.

```typescript
{
  ...header
  payload: {
    policy_id: 'CAMBIAL_CHECK' | 'GENERAL_ENFORCEMENT' | 'TTK_1530_SUPPLY_DELAY' | 'CONTRACTUAL' | ...
    
    // Faiz hesaplama temelleri (canonical, freeze)
    interest_type: InterestTypeCode         // LEGAL_3095, COMMERCIAL_AVANS_3095_2_2, TTK_1530, CONTRACTUAL, ...
    rate_series_source: 'TCMB_REESKONT_AVANS_TABLE' | 'TCMB_TTK1530_TABLE' | 'KANUNI_FAIZ_TABLE' | 'CONTRACT'
    
    // Başlangıç tarihi (event-based veya fixed)
    start_event: 'DRAW_DATE' | 'PRESENTATION_DATE' | 'DUE_DATE' | 'NOTICE_DATE' | 'DEFAULT_DATE' | 'FOLLOWUP_DATE' | 'JUDGMENT_DATE'
    start_date: ISO8601                    // start_event'ten türetilir, atandığında freeze
    
    // Hesaplama davranışı
    day_count_basis: 360 | 365
    compounding_rule: 'NONE' | 'ANNUAL' | 'CUSTOM'
    
    // Sözleşmesel akdi faiz (varsa)
    fixed_rate?: number                    // örn 0.48 = %48 (CONTRACTUAL veya COMMERCIAL_FIXED için)
    
    // Hukuk yorum profile'ı
    interpretation_profile_id: string      // 'TBK100_v1', 'TBK100_v2', 'YARGITAY_12HD_2026_OCT', ...
    
    // Allocation (TBK 100) policy
    allocation_policy_id: string           // 'DEFAULT_TBK100', 'CONTRACT_OVERRIDE_X', 'COURT_ORDER_Y', ...
    
    // Tarihsel replay için
    effective_from: ISO8601                // bu policy hangi tarihten itibaren geçerli
    
    // Audit / explainability
    is_default_profile: boolean            // bu atama default profile mi, override mı
    reasoning?: string                     // is_default_profile=false ise ZORUNLU, default ise opsiyonel
    references?: string[]                  // is_default_profile=false ise önerilen (ilam, sözleşme, mahkeme kararı linki)
  }
}
```

**Reasoning kuralı:**
- `is_default_profile: true` → `reasoning` opsiyonel. Normal dosya açılışında bürokrasi yok.
- `is_default_profile: false` → `reasoning` ZORUNLU. Default'tan sapma audit edilebilir olmalı.

CI gate: `is_default_profile=false && !reasoning` event'i kabul edilmez.

**Kural:** Bir case için aynı anda yalnızca **bir aktif** `INTEREST_POLICY_ASSIGNED` olabilir. Yeni assignment önceki implicit superseded yapar (`caused_by` zinciri korunur). Faz 1'de bu nadir bir senaryo — manuel.

### PAYMENT_RECEIVED

```typescript
{
  ...header
  payload: {
    payment_id: UUID
    amount: Money
    payment_date: ISO8601                  // ödemenin yapıldığı tarih (effective)
    
    // Borçlu attribütü (opsiyonel — multi-debtor allocation için)
    for_debtor_id?: DebtorId
    
    // Kanal
    channel: CollectionChannel             // NAKIT, BANKA, CEK, SENET, KREDI_KARTI, ICRA_DAIRESI, HACIZ, DIGER
    payment_type: CollectionType           // TAHSILAT, MAHSUP, IADE, ...
    
    // Source (user vs external)
    // (header'da source ve actor alanları zaten var)
    
    bank_reference?: string                // havale/EFT referansı
    receipt_number?: string                // makbuz no
    
    notes?: string
  }
}
```

**Kritik:** Payload'da `allocation` alanı **YOKTUR**. Allocation policy uygulayan calculator'ın çıktısıdır, projection'a yazılır.

### PAYMENT_REVERSED

```typescript
{
  ...header
  payload: {
    reversed_payment_id: UUID              // hangi PAYMENT_RECEIVED iptal ediliyor
    
    // İptal türü (ne yapılıyor)
    reversal_type: 'FULL' | 'PARTIAL'      // ödeme tamamen mi, kısmen mi iptal
    reversed_amount?: Money                // PARTIAL ise zorunlu, tutar
    
    // İptal sebebi (niye yapılıyor — hukuki kategori)
    reversal_reason: 
      | 'BANK_RETURN'                      // banka iadesi (havale geri döndü)
      | 'DATA_CORRECTION'                  // hatalı kayıt düzeltmesi
      | 'DUPLICATE_ENTRY'                  // mükerrer ödeme tespiti
      | 'COURT_ORDER'                      // mahkeme kararı (tahsilatın iadesi)
      | 'WAIVER_REVOCATION'                // feragat geri çekildi
      | 'BANKRUPTCY_CLAWBACK'              // iflas masası geri istedi
      | 'OTHER'
    
    reasoning: string                      // ZORUNLU — audit için
    
    // Banka iadesi ise referans
    bank_reference?: string                // BANK_RETURN için iade dekont no
    court_reference?: string               // COURT_ORDER için karar referansı
    
    notes?: string
  }
}
```

**Önemli:** `reversal_type` (ne yapılıyor) ve `reversal_reason` (niye yapılıyor) ayrı kavramlar. Tipi kayıt sınıflandırması, sebep hukuki kategorisi.

**`caused_by` zorunlu** — hangi `PAYMENT_RECEIVED`'in iptal edildiği zincir olarak kayıtlı (Hard Rule HR-23).

**Ayrım — bu event "mahsup iptali" değildir:** Mahsup (allocation) projection'ın çıktısı, payment reverse edilince allocation otomatik yeniden hesaplanır. Bu event sadece **ödeme'nin** iptalini temsil eder.

### CASE_SUSPENDED / CASE_RESUMED / CASE_CLOSED / CASE_REOPENED

```typescript
// CASE_SUSPENDED
{
  ...header
  payload: {
    reason: 'SETTLEMENT_NEGOTIATION' | 'INSTALLMENT_PROTOCOL' | 'PRECAUTIONARY' | 'COURT_ORDER' | 'WITHDRAWAL' | 'OTHER'
    reasoning?: string                     // OTHER için zorunlu
    expected_resume_date?: ISO8601         // varsa
    references?: string[]                  // protokol, mahkeme kararı linki
  }
}

// CASE_RESUMED (askıdan devam)
{
  ...header
  // caused_by ZORUNLU — hangi CASE_SUSPENDED'i takip ediyor (HR-23)
  payload: {
    reasoning?: string
    references?: string[]
  }
}

// CASE_CLOSED
{
  ...header
  payload: {
    closure_reason: 
      | 'FULL_PAYMENT'                     // tahsilat tamam
      | 'WAIVER'                           // alacaklı feragat
      | 'WITHDRAWAL'                       // takipten vazgeçme
      | 'BANKRUPTCY'                       // iflas
      | 'STATUTE_OF_LIMITATIONS'           // zamanaşımı
      | 'SETTLEMENT_FINAL'                 // sulh sonucu kapanış
      | 'OTHER'
    reasoning?: string                     // OTHER için zorunlu
    closure_date: ISO8601                  // hukuki kapanış tarihi
    references?: string[]
  }
}

// CASE_REOPENED (kapanmış dosya yeniden açıldı)
{
  ...header
  // caused_by ZORUNLU — hangi CASE_CLOSED yeniden açılıyor (HR-23)
  payload: {
    reopen_reason: 
      | 'INCORRECT_CLOSURE'                // hatalı kapanış (avukatın hata düzeltmesi)
      | 'PAYMENT_RETURNED'                 // sonradan tahsilat geri döndü (banka iadesi vb.)
      | 'COURT_ORDER'                      // mahkeme kararıyla yeniden açılış
      | 'BANKRUPTCY_CLAWBACK'              // iflas masası geri istedi
      | 'NEW_CLAIM_DISCOVERED'             // sonradan ek alacak tespit edildi
      | 'WAIVER_REVOCATION'                // feragat geri çekildi
      | 'OTHER'
    reasoning: string                      // ZORUNLU (audit için)
    references?: string[]                  // mahkeme kararı, banka dekontu, vb.
  }
}
```

### Immutability ve Closure Sonrası Disiplin

**Anayasal kural:** `CASE_CLOSED` event'i immutable kalır, **silinmez veya düzeltilmez**. Kapanmış dosyada yeni hukuki gerçek işlemek için **`CASE_REOPENED` zorunlu**.

| Senaryo | Yaklaşım |
|---|---|
| Hatalı kapatıldı, tekrar açılmalı | `CASE_REOPENED { reopen_reason: 'INCORRECT_CLOSURE' }` |
| Sonradan tahsilat iadesi geldi | `CASE_REOPENED { reopen_reason: 'PAYMENT_RETURNED' }` → ardından `PAYMENT_REVERSED` |
| Mahkeme kararıyla yeniden açılış | `CASE_REOPENED { reopen_reason: 'COURT_ORDER' }` |
| Sonradan ek alacak tespit edildi | `CASE_REOPENED { reopen_reason: 'NEW_CLAIM_DISCOVERED' }` → ardından `CLAIM_REGISTERED` |

`CASE_REOPENED` sonrası dosya tekrar `CASE_CLOSED` ile kapanabilir. Aynı dosyanın yaşam döngüsünde N tane `CASE_CLOSED` + `CASE_REOPENED` çifti olabilir — hepsi kayıt altında.

### Identity Events (DEBTOR_REGISTERED vb.)

```typescript
// DEBTOR_REGISTERED
{
  ...header (aggregate_type: 'Debtor')
  payload: {
    debtor_type: DebtorType                // INDIVIDUAL, COMPANY, PUBLIC_INSTITUTION, ESTATE
    
    // Individual
    first_name?: string
    last_name?: string
    tckn?: string                          // 11 hane
    birth_date?: ISO8601
    
    // Company
    company_name?: string
    vkn?: string                           // 10 hane
    tax_office?: string
    
    // Public institution
    institution_name?: string
    detsis_no?: string
    
    // Estate (Tereke)
    deceased_name?: string
    deceased_tckn?: string
    death_date?: ISO8601
    
    // Contact (initial — sonra ayrı event'lerle güncellenebilir)
    email?: string
    phone?: string
  }
}

// DEBTOR_IDENTITY_CORRECTED
{
  ...header (aggregate_type: 'Debtor')
  // caused_by ÖNERİLEN — hangi DEBTOR_REGISTERED'in correction'ı
  payload: {
    // Hangi alanlar değişti (her alan için old → new)
    corrected_fields: {
      [field: string]: {
        previous_value_hash: string         // sha256(canonical(old_value)) — old value PII içerebileceği için hash
        new_value: any                      // yeni değer (audit'te görünür)
      }
    }
    
    // Düzeltme sebebi (hukuki kategori)
    correction_reason: 
      | 'TYPO_FIX'                          // dizgi/yazım hatası (örn isim harf hatası)
      | 'MERNIS_UPDATE'                     // MERNİS'ten gelen güncel bilgi
      | 'COURT_ORDER'                       // mahkeme kararı (örn ad değişimi)
      | 'IDENTITY_VERIFICATION'             // kimlik doğrulama sonucu (TCKN/VKN düzeltmesi)
      | 'MERGE_DUPLICATE'                   // mükerrer kayıt birleştirmesi
      | 'COMPANY_TRANSFORMATION'            // şirket nev'i değişimi (Ltd → A.Ş.)
      | 'OTHER'
    
    correction_reasoning: string            // ZORUNLU — audit için
    corrected_by: UUID                      // hangi user (actor.user_id ile aynı, ama explicit kayıt için)
    
    // Hukuki referans
    references?: string[]                   // MERNİS sorgu sonucu, mahkeme kararı, ticaret sicil gazetesi linki
    
    // Effective date — bu correction hangi tarihten itibaren geçerli (geçmişe etkili olabilir)
    effective_from?: ISO8601                // verilmezse occurred_at varsayılır
  }
}
```

**Kritik:** `previous_value_hash` PII içeren old value'yu **doğrudan saklamaz**, hash'ini saklar. Replay sırasında value yeniden inşa edilemez (KVKK uyumu) ama "değer değişti, X'e döndü" kanıtı korunur. Mahkeme'de gerekirse, hash + correction event zinciri yeterli kanıttır.

**TCKN/VKN/ünvan değişimi hukuki etki doğurur** — bu yüzden basit edit gibi davranılmaz. `correction_reason` taxonomy'si KVKK ve hukuki audit için zorunlu sınıflandırma.

// DEBTOR_ADDRESS_ADDED
{
  ...header (aggregate_type: 'Debtor')
  payload: {
    address_id: UUID
    address_type: 'MERNIS' | 'BUSINESS_HQ' | 'DECLARED_CLIENT' | 'DECLARED_DOCUMENT' | ...
    street: string
    city: string
    district?: string
    postal_code?: string
    country?: string
    is_primary: boolean
    is_mernis: boolean
    confidence_level?: 'LOW' | 'MEDIUM' | 'MEDIUM_HIGH' | 'HIGH'
  }
}
```

Client + Lawyer için aynı pattern. Faz 1'de minimal payload.

---

## 7. Reference Event Payloads

### RATE_TABLE_PUBLISHED

```typescript
{
  event_id: UUID
  event_type: 'RATE_TABLE_PUBLISHED'
  schema_version: 1
  
  occurred_at: ISO8601                     // resmi yayın tarihi (TCMB)
  recorded_at: ISO8601                     // bizim kayıt zamanımız
  
  source: 'TCMB_EVDS' | 'RESMI_GAZETE' | 'MANUAL'
  source_reference: string                 // örn 'TCMB 20.12.2025'
  
  payload: {
    interest_type: InterestTypeCode        // LEGAL_3095, COMMERCIAL_AVANS_3095_2_2, TTK_1530, ...
    valid_from: ISO8601                    // bu oran hangi tarihten itibaren geçerli
    valid_to?: ISO8601                     // sonraki rate yayınlanana kadar
    annual_rate: number                    // decimal: 0.3975 = %39.75
    
    version_hash: string                   // canonical content hash
  }
}
```

`reference_data_events` global stream. Per-tenant değil. Her tenant aynı veriyi okur.

### TARIFF_PUBLISHED

```typescript
{
  ...standard reference header
  payload: {
    year: number                           // 2025, 2026, ...
    tariff_data: { ... }                   // resmi tarife yapısı (bkz tariff.service.ts)
    effective_from: ISO8601
    effective_to?: ISO8601
  }
}
```

---

## 8. Event Ownership Map (Aggregate × Event)

`06-aggregate-boundaries.md` §3 Concept Ownership tablosu ile uyumlu.

| Aggregate | Owns Events |
|---|---|
| **Case** | `CASE_OPENED`, `CASE_SUSPENDED`, `CASE_RESUMED`, `CASE_CLOSED`, `CASE_REOPENED`, `INSTRUMENT_REGISTERED`, `CLAIM_REGISTERED`, `INTEREST_POLICY_ASSIGNED`, `PAYMENT_RECEIVED`, `PAYMENT_REVERSED` (+ Faz 2: tebligat/haciz/sale/objection event'leri) |
| **Debtor** | `DEBTOR_REGISTERED`, `DEBTOR_IDENTITY_CORRECTED`, `DEBTOR_ADDRESS_ADDED` (+ Faz 2: address updated/removed, etc.) |
| **Client** | `CLIENT_REGISTERED`, `CLIENT_IDENTITY_CORRECTED` (+ Faz 2) |
| **Lawyer** | `LAWYER_REGISTERED`, `LAWYER_IDENTITY_CORRECTED` (+ Faz 2) |
| **Tenant** | (Faz 2 — settings change events) |
| **(global / no aggregate)** | `RATE_TABLE_PUBLISHED`, `TARIFF_PUBLISHED` |

---

## 9. Causality Chain Patterns

`caused_by` (parent event UUID) zorunlu olduğu yerler:

| Event | caused_by Zorunlu? | Niye |
|---|---|---|
| `PAYMENT_REVERSED` | **Evet** | Hangi PAYMENT_RECEIVED'in reverse'ı |
| `CASE_RESUMED` | **Evet** | Hangi CASE_SUSPENDED'i takip ediyor |
| `CASE_REOPENED` | **Evet** | Hangi CASE_CLOSED yeniden açılıyor |
| `DEBTOR_IDENTITY_CORRECTED` | Önerilen | Hangi DEBTOR_REGISTERED'in correction'ı |
| Diğer event'ler | Opsiyonel | Audit / debugging |

**Hard rule:** `PAYMENT_REVERSED`, `CASE_RESUMED`, `CASE_REOPENED` `caused_by` taşımıyorsa kabul edilmez. Bu Case aggregate'in invariant'ı (HR-23).

---

## 10. Schema Versioning

Faz 1 = `schema_version: 1`. **Yeni alan eklenebilir, mevcut alan silinemez veya semantiği değişemez.**

Schema değişimi gerekirse:
- Backward compatible (yeni opsiyonel alan): `schema_version: 1` kalır
- Breaking change: `schema_version: 2`, ADR yazılır, **eski v1 event'ler asla migrate edilmez** (delili bozar)
- Replay code v1 ve v2 event'leri ayrı ayrı handle eder

Bu Faz 2 işidir. Faz 1'de **sadece v1**.

---

## 11. Bu Belgenin Kapsamı Dışı

Aşağıdakiler bu belgede **karara bağlanmaz**:

- Event payload serialization format (JSON vs Protobuf vs Avro) → implementation
- Event log storage tablosu detayları (partition stratejisi, indeksler) → implementation
- Snapshot strategy implementation → Faz 2
- Replay daemon design → Faz 2
- Event bus / Kafka → rejected (`90-future-work/rejected/kafka-event-bus.md`)
- Multi-region replication → rejected (`90-future-work/rejected/`)
- Faz 2 event'lerinin (tebligat, haciz, sale, objection) tam payload schema'ları → bu fazda placeholder

---

## 12. Mevcut v28-engine Taxonomy ile Mapping

`uyap-event-ingest.service.ts:108-241`'da normalize edilen event tipleri canonical taxonomy'ye nasıl eşlenir:

| v28 Mevcut Event | Faz 1 Canonical | Faz 2 Canonical |
|---|---|---|
| `PAYMENT_RECEIVED` | ✅ (source=external) | (aynı) |
| `CASE_STATUS` | ⚠️ map to one of CASE_SUSPENDED/RESUMED/CLOSED | tam taxonomy Faz 2 |
| `TEBLIGAT_DELIVERED` / `_FAILED` | — | ✅ Faz 2 |
| `HACIZ_PLACED` / `_LIFTED` | — | ✅ Faz 2 |
| `OBJECTION_FILED` | — | ✅ Faz 2 |
| `LAWSUIT_FILED` | — | ✅ Faz 2 |
| `SALE_SCHEDULED` / `_COMPLETED` | — | ✅ Faz 2 |
| `ASSET_FOUND_*` | — | ✅ Faz 2 (`ASSET_DISCOVERED` ile birleşir) |
| `SAFAHAT_UPDATE` | (event değil — projection mirror) | (projection) |

Faz 1'de v28-engine taxonomy'nin **hepsi production'da çalışmaya devam eder**. Sadece Faz 1 critical path event'leri (`PAYMENT_RECEIVED` özellikle) canonical schema'ya uydurulur. Diğer event'ler "as-is" işlemeye devam eder, Faz 2'de canonicalization yapılır.

---

## 13. Hard Rules (Event Taxonomy Disiplini)

(00-architecture.md Hard Rules'a eklenir)

**HR-20 (yeni):** Event payload'ında calculator çıktısı veya projection alanı bulunamaz. Allocation, balance, computed totals event'e yazılamaz.

**HR-21 (yeni):** Event naming `NOUN_PAST_PARTICIPLE` formatında olmak zorunda. Komut adı (`RECEIVE_PAYMENT`) yasak.

**HR-22 (yeni):** Yeni event tipi tanımlamak için ADR + event taxonomy revize zorunlu. "Geçici event" yasak.

**HR-23 (yeni):** `PAYMENT_REVERSED`, `CASE_RESUMED`, `CASE_REOPENED` event'leri `caused_by` taşımak zorunda. CI gate kontrol eder.

**HR-24 (yeni):** Operational event'ler (telemetry) `case_events` veya `reference_data_events` tablolarına yazılamaz. `operational_log` ayrı tablo.

---

## 14. DoD

- [x] Anayasal kural (Events represent legal facts) yazıldı
- [x] 4 katmanlı yapı (Domain / Reference / Integration / Operational)
- [x] Naming kuralı (NOUN_PAST_PARTICIPLE)
- [x] **13** canonical Faz 1 domain event listesi (CASE_REOPENED eklendi — kapanmış dosyaya geri dönüş)
- [x] Her event için canonical payload schema
- [x] `INTEREST_POLICY_ASSIGNED` legal computation contract olarak detaylandırıldı (`is_default_profile` ile reasoning bürokrasisi azaltıldı, override ise zorunlu)
- [x] `PAYMENT_ALLOCATED` event olmadığı kayıt altında (anayasa)
- [x] `PAYMENT_REVERSED` payload sertleştirildi: `reversal_type` (FULL/PARTIAL) + `reversal_reason` (BANK_RETURN, COURT_ORDER, BANKRUPTCY_CLAWBACK, vs.) ayrı kavramlar
- [x] `DEBTOR_IDENTITY_CORRECTED` audit payload sertleştirildi: `previous_value_hash` (KVKK için), `correction_reason` taxonomy, `corrected_by`, `effective_from`, `references`
- [x] `CASE_CLOSED` immutable + `CASE_REOPENED` ile kapanış sonrası geri dönüş disiplini
- [x] Causality chain patterns (caused_by zorunluluk haritası — PAYMENT_REVERSED + CASE_RESUMED + CASE_REOPENED)
- [x] Mevcut v28 taxonomy ile mapping
- [x] Layer 4 (operational) ayrımı
- [x] 5 yeni Hard Rule (HR-20..24)
- [x] **ulas onayı (2026-05-19)**

**Decision Status:** Accepted  
**Accepted On:** 2026-05-19  
**Supersedes:** none

---

## 15. Sıradaki Adım

İmza sonrası → `08-causality-rules.md`. Yasak transition'lar (örn `CASE_CLOSED` sonrası `PAYMENT_RECEIVED` block), kullanıcı kararı gerektiren transition'lar (örn `INTEREST_POLICY` değişimi reasoning zorunlu), policy gate'in event taxonomy üzerindeki rolü.

Sonra `09-temporal-semantics.md` ve `10-implicit-rules.md` ile vocabulary freeze tamamlanır. Ardından `11-domain-event-bridge.md` (case.service'in event emission disiplini) ile implementation hazırlığı başlar.

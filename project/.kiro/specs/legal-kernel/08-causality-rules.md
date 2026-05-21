---
status: active
review-trigger: "Faz 1 imzasına kadar — sprint sonu"
---

# Causality Rules

**Tarih:** 2026-05-19  
**Durum:** Active — vocabulary freeze'in 4. belgesi  
**Bağlam:** Event taxonomy imzalandı (`07`). Şimdi: hangi event dizileri **hukuken kabul edilebilir**?

---

## 0. Constitutional Principle

> **Events may be recorded automatically.**  
> **Legal consequences may not be inferred automatically unless explicitly authorized by policy.**

Bu cümle bu belgenin tek koruyucu prensibidir.

### Pratik sonuçları

- Sistem `PAYMENT_RECEIVED` event'ini otomatik kayıt edebilir (banka entegrasyonundan gelse bile).
- Ama **`PAYMENT_RECEIVED` → ödeme'nin hukuki etkisi (mahsup, tahsilat tamamı kapanış, vb.) otomatik çıkarılmaz.**
- Hukuki sonuç (allocation, balance recompute) **explicit policy** üzerinden çıkar.
- Hukuki kararlar (closure, reopen, override, profile change) **explicit human authority** gerektirir.

### Niye Önemli

Sistem "AI avukat oldu" gibi davranmamalı. Event ingestion otomatik olabilir; **hukuki yorum, sorumluluk gerektiren bir karardır**. Otomatize edilemeyecek seviyeleri belge haline getirmek, mahkemede "neden böyle yapıldı?" sorusunun cevabını korumak için kritik.

### Bu Belgenin NE OLMADIĞI

08 **workflow document değildir**. Aşağıdakileri içermez:

- ❌ BPMN diyagramı
- ❌ Tam state machine (tüm transitions)
- ❌ Her path için modeling
- ❌ Orchestration DSL
- ❌ Workflow engine spec'i

08 sadece **legal causality constraints** tanımlar:
- Ne neyi tetikleyebilir
- Ne neyi tetikleyemez
- Hangi transition kullanıcı kararı ister
- Hangi transition otomatik olabilir

---

## 1. Allowed Causality

Hangi event hangi otomatik tetikleme yapabilir, hangi koşulda.

### Kategori Açıklamaları

- **May Trigger:** Bu event olduğunda otomatik gerçekleşmesi izin verilen reaksiyon. Tetikleme **policy onayıyla** olur.
- **Requires Policy:** Reaksiyonun çalışabilmesi için ilgili policy (örn `INTEREST_POLICY_ASSIGNED`, `AllocationPolicy`) atanmış olmalı.
- **Requires Human:** Reaksiyon avukatın açık kararını gerektirir, otomatik olmaz.

### Tablo

| Event | May Trigger | Requires Policy | Requires Human |
|---|---|---|---|
| `CASE_OPENED` | timeline projection oluşturma; (varsa) initial CLAIM_REGISTERED kaydı | no | no |
| `INSTRUMENT_REGISTERED` | claim normalization; rate series lookup | no | no |
| `CLAIM_REGISTERED` | balance projection bucket initialization | no | no |
| `INTEREST_POLICY_ASSIGNED` | balance recomputation; allocation reset (önceki hesaplar geçersiz) | (kendisi policy) | yes (override durumlarında) |
| `PAYMENT_RECEIVED` | allocation recomputation (TBK 100); balance projection update; **closure_eligibility flag** ama otomatik kapatma YOK | yes (`InterestPolicy` + `AllocationPolicy` gerek) | no |
| `PAYMENT_REVERSED` | allocation reversal; balance recompute; **reopen_eligibility flag** ama otomatik reopen YOK | yes | yes (mahkeme kararı/banka iadesi gerekçesi) |
| `CASE_SUSPENDED` | timer pause (tebligat süreleri Faz 2'de); enforcement_blocked flag set | no | yes (sebep gerekli) |
| `CASE_RESUMED` | timer resume; enforcement_blocked flag clear | no | yes |
| `CASE_CLOSED` | projection freeze (snapshot); audit lock | no | yes (closure_reason gerekli) |
| `CASE_REOPENED` | projection unfreeze; balance recomputation | no | yes (reopen_reason zorunlu) |
| `DEBTOR_REGISTERED` | identity index update | no | no |
| `DEBTOR_IDENTITY_CORRECTED` | identity index reindex; cross-case projection refresh | no | yes (correction_reason gerekli) |
| `DEBTOR_ADDRESS_ADDED` | address index update | no | no |
| `RATE_TABLE_PUBLISHED` | (per-case rate lookup yeniden yapılır asOf bazlı; otomatik recalc YOK) | no | no |
| `TARIFF_PUBLISHED` | (per-case tariff lookup; otomatik recalc YOK) | no | no |

### Önemli Notlar

**1) Tetikleme = projection update, NOT new event.**

`PAYMENT_RECEIVED` olduğunda allocation hesaplaması yapılır → **`payment_allocation_log` projection'ına yazılır**, yeni event yaratılmaz. (Anayasa: events represent legal facts, allocation is computation.)

**2) Closure / Reopen otomatik değil.**

`PAYMENT_RECEIVED` ile bakiye sıfırlanırsa sistem **`closure_eligibility = true`** flag'i set eder, ama **`CASE_CLOSED` event'ini otomatik atmaz**. Avukat görür, karar verir, manuel olarak `CASE_CLOSED` emit eder.

Aynı şekilde `PAYMENT_REVERSED` sonrası bakiye negatife geçerse (çift tahsilat alınmış vs.) **`reopen_eligibility = true`** flag'i set edilir, ama `CASE_REOPENED` otomatik atılmaz. Hukuki karar (banka iadesi mi, mahkeme kararı mı, hatalı kayıt mı) avukatın değerlendirmesiyle olur.

**3) Reference event'ler otomatik recalc tetiklemez.**

`RATE_TABLE_PUBLISHED` geldiğinde bütün case'lerin faiz hesabı **otomatik güncellenmez**. Replay sırasında veya görüntüleme sırasında `asOf` parametresine göre doğru rate seçilir. Yeni event kaydedilmez (computation, projection).

---

## 2. Forbidden Chains

Aşağıdaki event zincirleri **hiçbir koşulda kabul edilmez**. CI gate ve runtime validation ile engellenir.

### 2a. Anayasa İhlali (Computation Event Yaratma)

| Yasak Zincir | Niye | Yerine |
|---|---|---|
| `PAYMENT_RECEIVED` → `PAYMENT_ALLOCATED` | Allocation event değil, projection | `payment_allocation_log` update |
| `PAYMENT_RECEIVED` → `BALANCE_UPDATED` | Balance projection | `case_balance_view` update |
| `RATE_TABLE_PUBLISHED` → `INTEREST_RECALCULATED` (per case) | Computation | asOf bazlı yeniden okuma |
| `INSTRUMENT_REGISTERED` → `CLAIM_AUTO_GENERATED` | Otomatik claim çıkarımı **legal inference**, otomatize edilmez | Avukat manuel `CLAIM_REGISTERED` emit eder |

### 2b. Lifecycle Violation

| Yasak Zincir | Niye |
|---|---|
| `CASE_CLOSED` → `PAYMENT_RECEIVED` (direct) | Kapanmış dosyaya doğrudan ödeme yazılamaz. Önce `CASE_REOPENED` zorunlu. **(Bkz. aşağıda — ödeme yok sayılmaz, sadece canonical akış reopening gerektirir.)** |
| `CASE_CLOSED` → `CLAIM_REGISTERED` (direct) | Aynı. |
| `CASE_CLOSED` → `INTEREST_POLICY_ASSIGNED` (direct) | Aynı. |
| `CASE_CLOSED` → `CASE_SUSPENDED` | Kapanmış dosya askıya alınamaz. |
| `CASE_SUSPENDED` → `CASE_CLOSED` (direct) | Önce `CASE_RESUMED` zorunlu, sonra closure değerlendirmesi. **(Soft rule — bazı senaryolarda istisna olabilir, ama default yasak.)** |
| `CASE_OPENED` → `PAYMENT_RECEIVED` (without `INTEREST_POLICY_ASSIGNED`) | İzin verilir ama allocation **finalization** yapılamaz (HR-6 gereği). Ödeme `unallocated` durumda bekler. **Forbidden değil, sadece restricted.** |

#### Kapanış Sonrası Gelen Ödeme — Açıklama

> **Kapanış sonrası gelen ödeme fiziksel/hukuki gerçek olarak reddedilmez. Sadece kapanmış case stream'e doğrudan `PAYMENT_RECEIVED` yazılamaz.**

Pratikte ne olur:

1. Banka entegrasyonu / icra dairesi / UYAP'tan kapanmış bir case için ödeme bildirimi gelirse:
   - Sistem ödemeyi **reddetmez**.
   - Ödeme `pending_intake` durumunda bekletilir (operational queue, event log değil).
   - Avukata bildirim gider: "Kapanmış X dosyasına Y tutar ödeme geldi. Reopen mi, başka case'e mi yönlendireceksiniz?"
   
2. Avukat kararı:
   - **(a) Reopen + ödeme:** `CASE_REOPENED { reopen_reason: 'PAYMENT_RETURNED' }` → ardından `PAYMENT_RECEIVED`. İki event ardışık emit edilir (transaction).
   - **(b) Başka case'e yönlendir:** Pending intake silinir, doğru case'de manuel `PAYMENT_RECEIVED` emit edilir.
   - **(c) İade et:** Pending intake silinir, banka iadesi süreci işletilir (avukat dış işlem).

Önemli: Pending intake **operational mechanism**, event log'a girmez. Hukuki gerçek (ödeme alındı) sadece avukat kararı sonrası uygun case stream'inde event olarak kayıt altına alınır.

### 2c. Causality Chain Violations

| Yasak Zincir | Niye |
|---|---|
| `PAYMENT_REVERSED` without `caused_by` | HR-23 — hangi PAYMENT_RECEIVED reverse ediliyor net olmalı |
| `CASE_RESUMED` without `caused_by` to `CASE_SUSPENDED` | HR-23 |
| `CASE_REOPENED` without `caused_by` to `CASE_CLOSED` | HR-23 |
| `PAYMENT_REVERSED` zinciri (önceki PAYMENT_REVERSED'i reverse eden) | Mantık karmaşası — yerine yeni `PAYMENT_RECEIVED` (orijinal tutarda) emit edilir |

### 2d. Automatic Enforcement (Anayasa İhlali)

| Yasak Zincir | Niye | Yerine |
|---|---|---|
| `CASE_OPENED` → `ENFORCEMENT_ACTION_TRIGGERED` (otomatik haciz, müzekkere) | **Hukuki karar otomatize edilmez** | Avukat manuel komut |
| `PAYMENT_REVERSED` → `ENFORCEMENT_RESUMED` (otomatik haciz devam) | Aynı | Avukat değerlendirir |
| `OBJECTION_FILED` (Faz 2) → `CASE_SUSPENDED` (otomatik) | Aynı | Avukat değerlendirir |

**Not:** Faz 2'de (tebligat, haciz, sale event'leri) bu liste genişler.

---

## 3. Human Authority Boundaries

En kritik bölüm. Sistemin "AI avukat oldu" gibi davranmasını engelleyen ayrım.

### Tablo

| Decision Type | Automatic OK? | Human Required? | Niye |
|---|---|---|---|
| Event ingestion (UYAP'tan, banka'dan) | ✅ Evet | ❌ Hayır | Olay olmuş, kayıt zorunlu |
| Allocation recomputation (TBK 100) | ✅ Evet | ❌ Hayır | Pure computation, policy belirler |
| Balance projection update | ✅ Evet | ❌ Hayır | Pure computation |
| Timeline projection refresh | ✅ Evet | ❌ Hayır | Pure projection |
| Identity reindex (DEBTOR_IDENTITY_CORRECTED sonrası) | ✅ Evet | ❌ Hayır | Pure index update |
| Closure eligibility flag | ✅ Evet | ❌ Hayır | Sadece **flag**, action değil |
| Reopen eligibility flag | ✅ Evet | ❌ Hayır | Sadece flag |
| Case closure (`CASE_CLOSED` emit) | ❌ Hayır | ✅ Evet | Hukuki karar — closure_reason gerekli |
| Case reopen (`CASE_REOPENED` emit) | ❌ Hayır | ✅ Evet | Hukuki karar — reopen_reason zorunlu |
| Interpretation profile override | ❌ Hayır | ✅ Evet | Default'tan sapma legal decision |
| Allocation policy override (DEFAULT_TBK100 dışı) | ❌ Hayır | ✅ Evet | Sözleşmesel/mahkeme kararı |
| Interest policy değişimi (yeni `INTEREST_POLICY_ASSIGNED`) | ❌ Hayır | ✅ Evet | Hukuki yorum değişimi |
| Identity correction (`DEBTOR_IDENTITY_CORRECTED`) | ❌ Hayır | ✅ Evet | KVKK + hukuki etki |
| Payment reversal | ⚠️ Kısmen | ✅ Genelde evet | Banka iadesi otomatik kabul edilebilir, diğerleri avukat onayı |
| Enforcement action (haciz, müzekkere — Faz 2) | ❌ Hayır | ✅ Evet | Hukuki sorumluluk |
| Tebligat send (Faz 2) | ❌ Hayır | ✅ Evet | Geri alınamaz dış aksiyon |
| UYAP submit (Faz 2) | ❌ Hayır | ✅ Evet | Geri alınamaz dış aksiyon |

### Default Pozisyon

> **Şüphe varsa: Human Required.**

Yeni bir karar tipi sisteme eklenirken default automatic kabul edilmez. ADR yazılır, "neden bu otomatize edilebilir?" sorusu cevaplanır.

### Otomatik Kabul Edilebilir Reversal (İstisna — Sınırlı)

`PAYMENT_REVERSED` için **tek otomatik durum** ve **sıkı şart**: bank return.

> **BANK_RETURN automatic reversal is allowed only if matched to a prior PAYMENT_RECEIVED by immutable bank reference.**

Pratik uygulama:

| Şart | Açıklama |
|---|---|
| **Match by immutable reference** | Bank return bildiriminde gelen referans (havale ID, IBAN, valör tarihi, exact amount) önceki `PAYMENT_RECEIVED` event'inin payload'ındaki `bank_reference` ile **birebir** eşleşmek zorunda |
| **Single match** | Eşleşme **tek** bir PAYMENT_RECEIVED'a olmalı. Birden fazla potansiyel match varsa otomatik reversal **devreye girmez**, avukata düşer |
| **Time window** | Eşleşme makul bir zaman penceresinde olmalı (örn 30 gün). Eski tarihli match şüpheli, manuel onaya düşer |
| **No prior reversal** | Eşleşen PAYMENT_RECEIVED daha önce reverse edilmemiş olmalı (tek seferlik) |
| **Source = external (bank)** | Reversal event'inin `source: 'external'` ve `actor.external_system: 'bank'` olmalı; user-initiated bank_return otomatik kabul edilmez |
| **Reversal_reason = 'BANK_RETURN'** | Diğer reversal_reason'lar (DATA_CORRECTION, COURT_ORDER, vb.) otomatik değildir |

Bu şartlardan **biri bile** sağlanmıyorsa: sistem otomatik reversal **emit etmez**. Avukata bildirim gider: "Banka iadesi geldi ama eşleşme net değil. Manuel inceleme gerekiyor."

Diğer reversal sebepleri (DATA_CORRECTION, COURT_ORDER, BANKRUPTCY_CLAWBACK, WAIVER_REVOCATION, DUPLICATE_ENTRY) **her zaman** avukat kararı gerektirir, otomatik kabul edilmez.

---

## 4. Policy Gate'in Causality Üzerindeki Rolü

`PolicyGateService` (eski `CasePolicyEngine`) bu causality kurallarının **runtime enforcer'ıdır**.

### Pre-Action Gate

`canPerformAction(caseId, actionCode, context)` çağrısı şu causality kontrollerini yapar:

| Çağrı | Kontrol |
|---|---|
| `canPerformAction('PAYMENT_RECEIVE')` | Case kapalı mı? Eğer kapalıysa CASE_REOPENED gerekli (DENY + suggest reopen) |
| `canPerformAction('CASE_CLOSE')` | Bakiye sıfır mı? closure_eligibility flag set mi? Değilse warn ama allow (avukat kararı) |
| `canPerformAction('CASE_REOPEN')` | Case gerçekten kapalı mı? CASE_REOPENED için reopen_reason zorunlu |
| `canPerformAction('INTEREST_POLICY_OVERRIDE')` | Mevcut active policy var mı? Override için reasoning gerekli |
| `canPerformAction('IDENTITY_CORRECT')` | Field-level rules: TCKN değişimi MERNIS doğrulama gerektiriyor mu? |
| `canPerformAction('ENFORCEMENT_TRIGGER')` (Faz 2) | Case suspended mi? enforcement_blocked flag set mi? |

### Decision Output

```typescript
PolicyDecision {
  decision: 'ALLOW' | 'DENY' | 'WARN'
  reason?: string                    // DENY veya WARN ise zorunlu
  suggestion?: string                // alternatif aksiyon önerisi
  required_fields?: string[]         // hangi field'ların doldurulması gerek
  references?: string[]              // hangi causality rule'a bağlı
}
```

### Kural

> **PolicyGate may not append legal facts. PolicyGate must write decision logs for allow/deny decisions.**

İki ayrı kural, ikisi de zorunlu:

**1) PolicyGate event log'a yazamaz** (HR-15 + HR-28 ile uyumlu):
- `case_events` tablosuna doğrudan write yapamaz
- `reference_data_events` tablosuna write yapamaz
- Hukuki gerçek (legal fact) yaratamaz — sadece kabul/red kararı verir

**2) PolicyGate her decision'ı kayıt altına almak ZORUNDA**:
- Allow decision → decision log'a yazılır (kim ne için aksiyon istedi, hangi kural izin verdi)
- Deny decision → decision log'a yazılır (kim ne için aksiyon istedi, hangi kural reddetti, suggestion ne)
- Warn decision → decision log'a yazılır (uyarı override edildi mi, sonuç ne oldu)

**Niye zorunlu:** "PolicyGate niye reddetti?" sorusunun cevabı 6 ay sonra mahkeme/audit'te kaybolmamalı. Decision log audit trail'in parçası, replay'de kullanılır.

**Decision log nereye yazar:** `CpeDecisionLog` Prisma modeli (mevcut). Append-only — silme/düzeltme yok. Hash chain ile bütünlük korunur (ileride v38 audit log gibi).

**CI gate:** PolicyGate metodlarında `case_events` veya `reference_data_events` tablolarına yazma çağrısı tespit edilirse build fail.

### Causality Enforcement Zamanlaması

Causality enforcement **runtime düzeyde, event store'a yazmadan ÖNCE** çalışır:

```
Domain command (case.service.create vb.)
   ↓
PolicyGate.canPerformAction(...)  ← causality check + decision log
   ↓ ALLOW
Transaction execute
   ↓
Event store'a write (case_events)
   ↓ AFTER COMMIT
EventRuntime processes (fact write, projection update, outbox)
```

Event store'a varan bir event **causality'i geçmiş demektir**. Yani replay sırasında causality violation tespit edilirse, bu PolicyGate'in zamanında durduramadığı bir durumdur — alarm üretilir, manuel müdahale gerekir.

---

## 5. Causality Cycles

Bir event sıralaması içinde aynı işlem **döngüsel olarak tekrarlanmamalı**. Replay tutarlılığı için kritik.

| Pattern | Kabul Edilebilir mi? | Örnek |
|---|---|---|
| `CASE_SUSPENDED` → `CASE_RESUMED` → `CASE_SUSPENDED` → `CASE_RESUMED` ... | ✅ Evet (sınırsız) | Tekrarlı sulh görüşmesi |
| `CASE_CLOSED` → `CASE_REOPENED` → `CASE_CLOSED` → `CASE_REOPENED` ... | ✅ Evet (sınırsız) | Sonradan iadeler, ek alacaklar, mahkeme kararları |
| `PAYMENT_RECEIVED` → `PAYMENT_REVERSED` → `PAYMENT_RECEIVED` (yeni) | ✅ Evet | Yanlış kayıt düzeltmesi |
| `PAYMENT_REVERSED` → `PAYMENT_REVERSED` (önceki PAYMENT_REVERSED'i reverse et) | ❌ Yasak | Yerine yeni `PAYMENT_RECEIVED` |
| `INTEREST_POLICY_ASSIGNED` → `INTEREST_POLICY_ASSIGNED` (override) | ✅ Evet (caused_by önerilen) | Yargıtay yorum değişimi sonrası |
| `DEBTOR_IDENTITY_CORRECTED` → `DEBTOR_IDENTITY_CORRECTED` (önceki düzeltmeyi düzelt) | ✅ Evet | Birden çok düzeltme katmanı |

### Cycle Detection (Soft Rule)

Aynı case içinde **24 saat içinde 5+ aynı tip event** sistem tarafından flag'lenir (örn 5 PAYMENT_RECEIVED + 5 PAYMENT_REVERSED gibi anormal pattern). Bu **engellemez**, sadece audit warn üretir. İlerleyen fazda anomaly detection olarak gelişebilir.

---

## 6. Replay Causality

Event log'dan state'i yeniden inşa ederken causality kuralları **runtime'da** değil, **offline doğrulamada** kullanılır.

### Replay Validation

Bir case'in event stream'i yeniden okunduğunda şu kontroller yapılır:

1. `aggregate_version` monotonic + gap-free mi?
2. `caused_by` zincirleri valid mi (referans verilen event mevcut mu)?
3. Forbidden chain pattern var mı? (Bölüm 2'deki yasak zincirler)
4. Lifecycle invariant'lar tutuyor mu? (CLOSED → REOPENED zorunlu, vs.)

Replay sırasında bir ihlal tespit edilirse: **replay durur, audit alarmı üretilir**. Manuel müdahale gerekir.

Bu **case_events tablosunun bütünlüğünü** korumak için kritik. Append-only constraint + DB trigger zaten doğrudan UPDATE/DELETE'i engeller; causality kontrolü ek bir mantık katmanı.

---

## 7. Bu Belgenin Kapsamı Dışı

- Event payload schema'ları → `07-event-taxonomy-v1.md`
- Day count, asOf, effective_from semantiği → `09-temporal-semantics.md`
- Implicit guard rules → `10-implicit-rules.md`
- PolicyGate implementation → `05-engine-consolidation-decision.md` + implementation
- Workflow orchestration / state machine engine → **out of scope, intentionally**
- BPMN / orchestration DSL → **out of scope, intentionally**

---

## 8. Hard Rules (Causality Disiplini)

(00-architecture.md Hard Rules'a eklenir)

**HR-25 (yeni):** Otomatik tetiklenen reaksiyonlar **legal consequence inference** yapamaz. Sadece projection update, flag set, audit log yazımı.

**HR-26 (yeni):** Closure (`CASE_CLOSED`), reopen (`CASE_REOPENED`), policy override, identity correction, enforcement action **avukat kararı** gerektirir. Otomatize edilemez.

**HR-27 (yeni):** Forbidden chain pattern'leri (Bölüm 2) CI gate ile engellenir. Replay validation aşamasında tespit edilen ihlal alarm üretir.

**HR-28 (yeni):** PolicyGate event log'a yazamaz, sadece decision log'a (HR-15 ile uyumlu — pekiştirir).

---

## 9. DoD

- [x] Constitutional principle (events automatic, legal consequences not) — 00-architecture.md anayasal cümle (E) olarak eklendi
- [x] Allowed causality tablosu (15 event × may trigger / requires policy / requires human)
- [x] Forbidden chains (4 kategori: anayasa ihlali, lifecycle, causality, automatic enforcement)
- [x] **Closed-case payment intake disiplini netleştirildi** — ödeme reddedilmez, pending intake'te bekler, avukat kararı sonrası canonical akışa girer
- [x] Human authority boundaries (17 decision type)
- [x] **BANK_RETURN otomatik reversal sıkı şartlarla sınırlandırıldı** — immutable bank reference match, single match, time window, no prior reversal, source=external
- [x] PolicyGate'in causality enforcer rolü
- [x] **PolicyGate decision log zorunluluğu sertleştirildi** — allow/deny/warn her durum kayıt altında
- [x] Causality enforcement zamanlaması (event store'a write'tan ÖNCE)
- [x] Replay validation kuralları
- [x] Cycle detection (soft rule)
- [x] 4 yeni Hard Rule (HR-25..28)
- [x] "Out of scope" listesi (BPMN, state machine, DSL — kasıtlı)
- [x] **ulas onayı (2026-05-19)**

**Decision Status:** Accepted  
**Accepted On:** 2026-05-19  
**Supersedes:** none

---

## 10. Sıradaki Adım

İmza sonrası → `09-temporal-semantics.md`. **Senin verdiğin kritik not** uygulanacak:

> Takvim zamanı, hukuki zaman, replay zamanı **ayrılmalı**.  
> `occurred_at`, `recorded_at`, `effective_from`, `asOf` aynı şey değil.

Bu ayrım 09'un omurgası olur. Adli tatil, day count basis, holiday-aware date arithmetic de orada.

Sonra `10-implicit-rules.md` (sadece event taxonomy ve aggregate invariant'ta temizce ifade edilemeyen kurallar — hidden invariant mezarlığı değil), `11-domain-event-bridge.md` (case.service'in event emission disiplini, yeni bus değil).

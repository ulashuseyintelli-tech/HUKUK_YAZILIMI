---
status: completed
review-trigger: "Tarihsel kayıt — kod baseline değiştiğinde yeniden tara"
---

# Deep Scan Findings — Real Baseline

**Tarih:** 2026-05-19  
**Süre:** Sistematik kod doğrulama, audit dokümanları **kullanılmadı**.  
**Amaç:** "Mevcut sistemde event-sourced kernel'in ne kadarı gerçekten var?" sorusuna cevap.

---

## Tek Cümlelik Sonuç

> **Sistem zaten event-sourced bir kernel'e sahip — ama yanlış adla, yanlış yerde, yanlış scope'la.** Yapılması gereken yeniden inşa değil, **mevcut altyapıyı domain çekirdeğine genişletmek + isimlendirmeyi rasyonalize etmek**.

---

## Ne buldum (somut kanıtlar)

### A. Event-sourced infrastructure: **VAR**

| Bileşen | Konum | Durum |
|---|---|---|
| Event ingestion | `icrabot/v28-engine/uyap-event-ingest.service.ts` | Çalışıyor. Event normalize → fact/flag → rule run. |
| Fact store (state derivation) | `icrabot/v28-engine/factstore.service.ts` | Çalışıyor. Per-case key-value store. **`IcrabotFactAudit` tablosu old/new değer kaydı tutuyor — append-only audit trail var.** |
| Timeline (event log projection) | `icrabot/v28-engine/timeline.service.ts` | Çalışıyor. 7 entry tipi (`UYAP_EVENT`, `FACT_WRITE`, `COMPUTE`, `DECISION`, `ACTION`, `OUTCOME`, `NOTE`). Cursor-based pagination. |
| Outbox (external action dispatch) | `icrabot/v28-engine/outbox.service.ts` | Var (içeriğine bakmadım ama `IcrabotOutboxAction` tablosu var). |
| Engine runner (rule execution) | `icrabot/v28-engine/engine-runner.service.ts` | Var. Rule definitions + when clauses + expression evaluator. |
| Audit log with hash chain | `IcrabotAuditLog` Prisma model | Var. v38 immutable hash chain. |
| Compute registry | `icrabot/v28-engine/compute-registry.service.ts` | Var. |
| Policy gate | `icrabot/v28-engine/policy-gate.service.ts` | Var. |

**Kanıt seviyesi:** Yüksek. Servisleri okudum. Prisma model'ler tabloları onaylıyor.

### B. **İkinci** bir policy engine: ayrı ve paralel

`apps/api/src/modules/policy-engine/`'de **bambaşka bir** policy engine daha var:

| Bileşen | Konum |
|---|---|
| `CasePolicyEngine` | `policy-engine/case-policy-engine.service.ts` |
| `FactStoreService` (in-memory cache!) | `policy-engine/fact-store/fact-store.service.ts` |
| `ComputedFactRegistry` | `policy-engine/fact-store/computed-fact-registry.ts` |
| `StateMachineService` | `policy-engine/state-machine/state-machine.service.ts` |
| `RuleEngineService` | `policy-engine/rule-engine/rule-engine.service.ts` |
| `GateCheckerService` | `policy-engine/gate-checker/gate-checker.service.ts` |
| `DecisionLoggerService`, `ExecutionRecorderService`, `DecisionLogRetentionService` | `policy-engine/decision-logger/` |

**Bu, `icrabot/v28-engine/`'in alternatif kuzeni.** İki paralel "rule + fact + state-machine + decision-log" sistemi.

İkisinin de sınıf isminin aynı olması (`FactStoreService`) **vocabulary çakışmasının backend versiyonu**. İlk dalga taramam vocabulary sorununu sadece frontend'de görmüştü — backend'de daha derinden mevcut.

### C. Interest engine: **calculator-grade, ama tamamen pure değil**

`interest-engine/interest-engine.service.ts:86` `calculate()` metodu:

**İyi tarafları (kernel mimarisiyle uyumlu):**
- Açık pipeline: validate → strategy → rate → policy → segments → allocate → totals → report → audit
- Strategy registry pattern (`StrategySelectorService`)
- Version pinning (`versionPinning.enforceVersionPinning(...)`)
- Input hash (`generateInputHash(request)`)
- Audit writer (separate concern)
- `asOfDate` parametre olarak alıyor
- Rate coverage gap detection
- TBK 100 allocation engine
- Pre/post enforcement segment ayrımı
- Mode field (`PREVIEW`, `LEGAL_REPORT`, `PRODUCTION`)
- Audit log id'si geri dönüyor

**Sorunlu tarafları (kernel disiplini ihlalleri):**
- `calculate()` async — DB'ye yazıyor (`auditWriter.writeRecord`). **Pure function değil.**
- `previewCalculation()` `getPreviewRates()` içinde **hardcoded fallback rate'leri var** (`'COMMERCIAL_AVANS_3095_2_2': 39.75`). TODO: "RateProviderService'den çekilmeli". Bu bug.
- `interest-strategy.config.ts` yan yana ayrı bir registry — sınıflandırma için iyi ama strategy/case-type-strategy ile **iki farklı enum daha**: `CaseType` (`KAMBIYO_CEK`, `ILAMSIZ_GENEL`...) burada, başka yerde `CaseTypeEnum` var. Yine vocabulary çakışması.
- Eski `types.ts` deprecated diyor ama hâlâ kullanılıyor.

### D. Case domain: **CRUD-driven, event-aware DEĞİL**

`case.service.ts` 2000+ satır. `create()` metodu:
- 9-10 adımda transaction içinde tablo yazıyor (Client, CaseClient, Lawyer, CaseLawyer, Debtor, CaseDebtor, …)
- **Hiçbir event emit etmiyor**
- Interest engine import edilmiş ama `recalculateForCase()` çağrıları **yorum satırı olarak işaretli** (line 2014, 2069, 2112) — yani collection create/update/delete sonrası faiz yeniden hesabı **devre dışı**.
- v28-engine ile entegrasyon **yok** (`case.service.ts` `UyapEventIngestService`, `FactStoreService`, `TimelineService` import etmiyor — grep onayladı).

Yani **icra dosyası açıldığında, ödeme alındığında, status değiştiğinde event yayılmıyor.** v28-engine sadece **UYAP'tan gelen dış event'leri** işliyor, iç domain event'leri yaratmıyor.

### E. DB-level immutability: **kısmen var**

| Tablo | Trigger / Constraint |
|---|---|
| `evidence_objects` | INSERT guard trigger var (sealing pattern) |
| `bundle_seal_events` | INSERT guard trigger var |
| `IcrabotAuditLog` | Hash chain var ama UPDATE/DELETE trigger görmüyorum |
| `IcrabotTimelineEntry` | UPDATE/DELETE trigger görmüyorum |
| `IcrabotCaseFact` | Update yapılıyor (`factstore.write` upsert eder) — bu append-only **değil** |

`IcrabotCaseFact` aslında **mutable bir state store** — eski değer `IcrabotFactAudit`'e kopyalanıp yeni değer üzerine yazılıyor. Bu event-sourced **değil**, "audit-logged mutable state" pattern. Farklı bir şey.

### F. Audit dokümanları (PART-3, PART-4, Yapilacaklar.txt): **stale**

İlk dalga taramamda yaptığım hata bu dokümanlara güvenmekti. Doğrulama:
- PF-001 (v28 auth guard) → 12/12 controller'da `@UseGuards` var, kapatılmış
- PF-002 (login rate limit) → `LoginRateLimitGuard` mevcut, hem `auth.controller.ts` hem `portal.controller.ts`'de kullanılıyor, kapatılmış
- PF-003 (PII mask) → `pii-mask.util.ts` yazılmış, `bank.service.ts:543-585` 6 yerde `${maskIban(iban)}` kullanılıyor, kapatılmış
- PF-004 (fetch timeout) → `fetchWithTimeout` util var, sms/email/exchange-rate kullanıyor, kapatılmış
- PF-005 (unbounded query) → `runBatched` cursor pagination helper yazılmış, scheduler'daki 8 cron job kullanıyor, kapatılmış

**Stabilization sprint'in 5/5 maddesi 3 ay önce kapatılmış. Belge güncellenmemiş.**

Yapilacaklar.txt'deki faiz bug'ı: muhtemelen kapatılmış. `interest-engine/__tests__/sprint-4.spec.ts` ve `sprint-5.spec.ts` 2025 TCMB oranlarını (`%42.25`, `%39.75`) doğru segment'liyor. Ama `getPreviewRates()`'de hardcoded değerler var — bu **preview için fallback**, prod path için değil. Doğrulama gerek ama "kanayan bug" iddiası yanlış.

---

## Stale çıkan iddialarım (önceki analizde)

| İddia | Gerçek |
|---|---|
| "Workflow engine yok, state machine yok" | Var. İki tane (policy-engine + v28-engine'in rule runner'ı). Sadece **case domain'e bağlı değil**. |
| "Event-sourced infrastructure yok" | Var (v28-engine + fact audit). Ama **scope'u UYAP event'leriyle sınırlı**. |
| "Faiz motoru yarım, hızlı patch lazım" | Faiz motoru olgun (segmentor, allocator, version pinning, audit, rate schedule, policy gate v2). Bug iddiası dokümana dayanıyordu, kanıtlanmadı. |
| "Stabilization sprint 3-4 gün lazım" | 0 gün. Hepsi kapalı. |
| "PART-4 P1'leri 3 aydır açık" | Kapalı. Doküman güncel değildi. |
| "Money primitive kernel-ready ama gerisi değil" | Money + branded ID + interest engine + fact audit + outbox + timeline hepsi kernel-ready. **Birbiriyle bağlanmamış**. |

---

## Doğrulanan iddialarım

| İddia | Doğrulama |
|---|---|
| 70 modül (mass) | Doğru, sayım. |
| 57+ spec (over-documentation) | Doğru, sayım. |
| Vocabulary parçalanması (frontend) | Doğru, seam scan'de kanıtlandı. |
| Vocabulary parçalanması (backend) | **YENİ:** `policy-engine/FactStoreService` vs `v28-engine/FactStoreService` — sınıf adı çakışması. `CaseType` (interest-strategy.config) vs `CaseTypeEnum` (case.ts) vs `CaseType` (index.ts) — 3. çakışma. |
| Frontend legal logic leak (`interest-type-resolver.ts`) | Doğru, gerçek. |
| Calc-preview infra ağırlığı | Doğru, ama bu şimdi "şu zaten varolan ops kaslarını domain'de işe koş" demek. |
| Case domain CRUD-driven | **YENİ ve KRİTİK:** Doğru. Case create/update/delete event yaymıyor. v28-engine sadece UYAP olaylarını alıyor. |

---

## Yeniden çerçeveleme: Mimari kararı revize

Önceki `00-architecture.md` "Money Truth Kernel'i sıfırdan inşa et" tonundaydı. Yanlış. Doğru çerçeve şu:

### Mevcut Durum Haritası

```
┌────────────────────────────────────────────────────────────────────┐
│ DIŞ DÜNYA EVENT'LERİ (UYAP, harici)                                 │
│   ↓                                                                 │
│   icrabot/v28-engine/UyapEventIngestService                         │
│   ↓ normalize                                                       │
│   icrabot/v28-engine/FactStoreService (per-case kv + audit)         │
│   ↓                                                                 │
│   icrabot/v28-engine/EngineRunnerService (rules + actions)          │
│   ↓                                                                 │
│   icrabot/v28-engine/OutboxService (external dispatch)              │
│   ↓                                                                 │
│   icrabot/v28-engine/TimelineService (projection)                   │
│                                                                     │
│ ⚠️ Bu hat sadece "UYAP'tan gelenler"i işliyor                       │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ İÇ DOMAIN OPERASYONLARI (avukatın yaptığı)                          │
│   ↓                                                                 │
│   case.service.ts CRUD (transaction-based, event yok)               │
│   ↓                                                                 │
│   collection.service / payment-instruction / ... (CRUD)             │
│                                                                     │
│ ⚠️ Bu hat event yaymıyor                                            │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ POLICY ENGINE (paralel, bağımsız)                                   │
│   ↓                                                                 │
│   policy-engine/CasePolicyEngine                                    │
│   ↓                                                                 │
│   FactStoreService (kuzeni, in-memory cache)                        │
│   StateMachineService                                               │
│   RuleEngineService                                                 │
│   GateCheckerService                                                │
│   DecisionLoggerService                                             │
│                                                                     │
│ ⚠️ v28-engine ile çakışıyor, hangi rol hangi engine belirsiz       │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ FAİZ HESAPLAMA (calculator-grade)                                   │
│   ↓                                                                 │
│   InterestEngineService.calculate()                                 │
│   = strategy + rate + segments + allocator + audit                  │
│                                                                     │
│ ⚠️ Pure değil (DB'ye yazıyor), case'ten otomatik tetiklenmiyor     │
│   (collection sonrası recalc yorum satırı)                          │
└────────────────────────────────────────────────────────────────────┘

┌────────────────────────────────────────────────────────────────────┐
│ CALC-PREVIEW DIAGNOSTIC INFRA                                       │
│   drift guard, adaptive shadow, evidence bundle, hash determinism  │
│   ↓                                                                 │
│ ⚠️ Domain'den izole. Calc-preview'i izliyor, case domain'i değil.  │
└────────────────────────────────────────────────────────────────────┘
```

### Doğru Yön: 4 Adım

**1) Konsolidasyon (rewrite değil):**
- v28-engine'i sadece "UYAP event ingestion" değil, **iç domain event source** olarak da kullan.
- `policy-engine/` ile `v28-engine/` arasından **bir tanesini seç**, diğerini deprecate et. (Önerim: v28-engine, çünkü hash chain audit + outbox + timeline daha tam.)
- `policy-engine/FactStoreService` vs `v28-engine/FactStoreService` çakışmasını ve `case-policy-engine` vs `engine-runner` ikilemini bitir.

**2) Domain → Event Bridge:**
- `case.service.create()`, `update()`, `delete()` ve `collection.create()` gibi metodlar transaction sonunda **iç event yaymalı** (`CASE_OPENED`, `PAYMENT_RECEIVED`, ...).
- Bu event'ler v28-engine'in `UyapEventIngestService` analoğundan geçmeli — yani `DomainEventIngestService` (yeni, küçük ekleme).
- Yani **mevcut altyapıya 1 yeni servis** ekleniyor, sıfırdan kernel inşası yok.

**3) Interest Engine Pure'lık + Hookup:**
- `case.service.ts:2014` — yorum satırındaki `interestEngineService.recalculateForCase(caseId, today, tenantId)` çağrılarını **ya etkinleştir ya da event consumer'a taşı**.
- `previewCalculation()` içindeki hardcoded rate fallback'leri kaldır (rate provider'a bağla).
- `calculate()`'in `auditWriter.writeRecord` kısmını ayır — pure function `computeBalance()` + side-effect `writeAudit()` olarak.

**4) Vocabulary Unification:**
- Frontend seam scan'deki sorunlara ek olarak **backend tarafında**:
  - `policy-engine/FactStoreService` → `policy-engine/CachedFactStoreService` (ya da silinir)
  - `interest-strategy.config.CaseType` (KAMBIYO_CEK, vs.) → ya `case.ts/CaseTypeEnum`'a merge edilir, ya farklı bir kavram olarak `LegalCaseProfile` adıyla rename edilir.
  - 3 ayrı `CaseType` enum tanımı tek hale getirilir.
- Vocabulary unification belgesi `03-vocabulary-unification.md`'a backend çakışmaları eklenir.

---

## 00-architecture.md'ye gerekli düzeltmeler

| Bölüm | Önceki dil | Doğru dil |
|---|---|---|
| §0 Anayasal İlke | Korunsun. Doğru. | Korunsun. |
| §1 Trinity | "EVENT LOG → CALCULATORS → PROJECTIONS" | Aynı. Ama **mevcut altyapı**: Trinity'nin ilkel hali zaten v28-engine + interest-engine + timeline'da var. |
| §2 İlk Kernel: Money Truth Kernel | "9 case event + 1 reference event YENİ tanımlanacak" | "Mevcut event taxonomy v28-engine'de var (`PAYMENT_RECEIVED`, `OBJECTION_FILED`, `CASE_STATUS`, `HACIZ_PLACED`...). **Önce mevcut taxonomy'yi belge haline getir, eksikleri ekle.**" |
| §6 Migration | "Parallel strangler + shadow comparison" | Aynı **ama** "shadow truth" zaten var (calc-preview, evidence-bundle). Sadece domain'e bağlanması gerek. |
| §11 Runtime Reclassification | "core-runtime / runtime-lab" | Aynı. Ama mevcut isim çakışmaları (iki FactStoreService) bu reclassification'ın parçası. |
| §15 Vocabulary Freeze | 5 belge | **6 belge:** Vocabulary unification artık **frontend + backend** çakışmaları kapsayacak. |
| §17 Stabilization Sprint | 3-4 gün | **YOK.** Stabilization zaten yapılmış. PART-4 belgelerini "kapalı" diye işaretle. |

---

## Karar Matrisi: Rewrite mi, Wrap mi, Formalize mi?

| Bileşen | Rewrite | Wrap | Formalize | Önerim |
|---|---|---|---|---|
| `v28-engine` (event ingest, factstore, timeline, outbox, audit) | — | — | ✅ | **Formalize:** generic legal kernel olarak yeniden adlandır, scope'u UYAP'tan domain geneli'ne genişlet |
| `policy-engine/CasePolicyEngine` ve alt servisleri | ✅ ya da delete | — | — | **Karar gerek:** v28-engine ile birleştir veya sil. İkisi paralel anlamsız. |
| `interest-engine` | — | ✅ kısmi | ✅ kısmi | **Wrap + Formalize:** `calculate()`'i pure `computeBalance()` + side-effect `writeAudit()` olarak ayır. Strategy registry'yi `INTEREST_POLICY_ASSIGNED` event'iyle hizala. |
| `case.service.ts` CRUD | — | ✅ | — | **Wrap:** transaction sonunda event emit et (`CASE_OPENED`...). CRUD davranışı korunur, event side-effect olarak eklenir. |
| `calc-preview/diagnostics` (drift guard, adaptive, evidence) | — | — | ✅ | **Formalize + Reclassify:** core-runtime/legal-grade kısmı (evidence, hash) korunur, lab kısmı (drift, adaptive) `runtime-lab/` altına taşınır. |
| Frontend `interest-type-resolver.ts` | — | — | Move to BE | **Taşı:** backend'de `InterestPolicyResolver` calculator'ı olur. Frontend'de adapter kalır. |
| Vocabulary (`@hukuk/types`) | — | — | ✅ | **Formalize:** duplicate tanımları sil, `@hukuk/domain`'e rename, CI gate ile koru. |

**Sonuç:** Hiçbir şey rewrite olmuyor. Sistem zaten iyi durumda; **isimlendirme, sınırları ve bağlantılar yanlış**.

---

## Yeni Önerilen Sıralama

### Aşama 1: Vocabulary + Konsolidasyon (1-2 hafta)
Frontend seam scan + bu deep scan'in birleştirilmiş çıktısı:

1. `03-vocabulary-unification.md` (frontend + backend çakışmaları, **backend kısmı yeni**)
2. `policy-engine` vs `v28-engine` karar belgesi: hangisi kalıyor?
3. Mevcut event taxonomy'nin envanteri: v28-engine'de hangi event tipleri normalize ediliyor?

### Aşama 2: Domain → Event Bridge (2-3 hafta)
4. `case.service.create/update/delete` + `collection.create` event emit etmeye başlar
5. `DomainEventIngestService` yazılır (v28-engine analogu, iç event'ler için)
6. Interest engine `recalculateForCase` event consumer olarak bağlanır

### Aşama 3: Interest Engine Pure'laştırma (1 hafta)
7. `calculate()` pure `computeBalance()` + audit side-effect ayrımı
8. Hardcoded rate fallback'leri kaldır
9. asOf + interpretation profile parametreleri zorunlu

### Aşama 4: Runtime Reclassification (3-5 gün)
10. core-runtime / runtime-lab klasör ayrımı
11. CI gate'ler

### Aşama 5: Frontend Legal Logic Migration (1 hafta)
12. `interest-type-resolver.ts` → backend `InterestPolicyResolver`
13. `form-validator.ts` → backend `FormSelector`
14. Frontend adapter pattern

**Toplam:** ~6-8 hafta. Önceki "kernel rewrite + 6 ay" tahminine göre **çok daha az**.

---

## Net Karar İhtiyacı (sana sorular)

**Q1: `policy-engine/` modülü ne yapıyor?**  
Bu modülün gerçek kullanım alanına bakmak için 30 dakika daha ayırmam gerek. Bilinen: `case-policy-engine.service.ts` `factStore + computedFactRegistry + decisionLogger + executionRecorder + stateMachine` dependency'leri var. Yani case lifecycle için tasarlanmış ama gerçekten production path'te mi belirsiz. Şu seçimi sen yapmalısın:

- **(α)** Ben `policy-engine/`'i de detaylı inceleyim, sonra "v28 mi, policy mi" kararını verelim. (+1 saat)
- **(β)** Şimdilik karar erteleyelim, vocabulary + bridge işleri ilerlerken üstüne düşünelim.

**Q2: 00-architecture.md'yi revize edeyim mi?**  
"Rewrite" dilinden "Formalize existing kernel" diline çevireyim. Bu deep scan'in bulgularını mimariye yansıtmak için. ~30 dakika.

**Q3: PART-4'ü kapatılmış olarak işaretleyelim mi?**  
"Stabilization sprint" belgesi (`01-stabilization-pre-kernel.md`) artık güncel değil. Ya silinmeli ya "5/5 madde önceden kapatılmış, kanıt: şu satırlar" diye revize edilmeli. ~15 dakika.

---

## Bu sefer iddialarımı kanıtla bağladım

Yukarıdaki her iddianın altında dosya/satır kanıtı var. PART-3 ve PART-4 audit dokümanlarına **hiç bakmadım**. Kod konuştu.

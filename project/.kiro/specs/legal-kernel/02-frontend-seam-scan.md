---
status: completed
review-trigger: "Tarihsel kayıt — Frontend seam değişimi gerektiren büyük refactor olursa yeniden tara"
---

# Frontend Seam Scan

**Tarih:** 2026-05-19  
**Süre:** 1 günlük disiplinli inceleme (audit DEĞİL — seam scan)  
**Amaç:** Frontend'in future legal kernel ile çarpışacağı yerleri haritalamak. UI polish / component cleanup / accessibility / design system konuları kapsam dışı.

---

## 1. Router Model

**Bulgu:**
- Next.js 14, **App Router** (`src/app/`), route groups kullanılıyor: `(dashboard)`, `auth`, `portal`
- Dashboard route'ları: cases, debtors, calendar, tasks, reports, ai-tools, uyap-export, admin, settings, onboarding
- Portal route'ları: müvekkil portalı (cases, documents, poas, messages, profile)
- İki paralel app içinde (dashboard = avukat, portal = müvekkil)

**Kernel etkisi:** Düşük. Router yapısı modern ve sağlam. Migration sırasında route'lar değişmez, sadece data source değişir (legacy → projection).

**Kırmızı bayrak:** `cases/[id]/page.tsx` + `page-new.tsx` + `page-v2.tsx` + `_v2_disabled/` klasörü = **3 paralel implementasyon**, hangisi gerçek belirsiz. Bu tek başına bir disiplin sinyali (yarım kalmış refactor'lar).

---

## 2. State Management

**Bulgu:**
- `@tanstack/react-query` server state için
- `zustand` client state için
- `react-hook-form` + `zod` form state ve validation için

**Kernel etkisi:** Çok düşük. Tech stack zaten doğru: TanStack Query "projection consumer" pattern'ine ideal — backend projection değişirse cache invalidate yeter, frontend computation gerektirmez.

**Pozitif sinyal:** Modern stack seçilmiş, gereksiz Redux/MobX yükü yok.

---

## 3. Shared Contract Discipline

**Bulgu:**
- `packages/types` workspace paketi mevcut, frontend ve backend ikisi de import ediyor
- `Money` value object **bigint kuruş** olarak tanımlanmış (`amountMinor: bigint, currency: Currency`) — calc-grade
- Branded ID'ler (`CaseId`, `ClientId`, vs.) tanımlı
- `MoneyUtils` (add, subtract, multiply, divide, format, sum) tek kaynak

**Bu büyük bir avantaj.** Mimari tartışmamızda baştan kurmamız gereken `packages/@hukuk/domain` zaten var, sadece adı `@hukuk/types`. Money primitive'i kernel'in beklediği şekilde yazılmış.

**Çakışma sinyalleri (ciddi):**

| Çakışma | Nerede | Risk |
|---|---|---|
| **2 ayrı `CaseStatus`** | `index.ts`'de `CaseStatus` (4 değer) + `case.ts`'de `CaseStatusEnum` (6 değer, `DERDEST` ekstra) | Kritik. Ekran A vs B'de farklı status setleri görür. |
| **2 ayrı `CaseType`** | `index.ts`'de `CaseType` (8 değer) + `case.ts`'de `CaseTypeEnum` (9 değer, `ALIMONY` eklenmiş) | Kritik. Aynı sebep. |
| **2 ayrı `DebtorRole`** | `index.ts`'de 7 değer + `apps/web/src/types/debtor.ts`'de 12 değer (`MUSETEREK_BORCLU` typo'lu) | Kritik. Aynı domain kavramı 3. kez tanımlanmış. |
| **2 ayrı `DebtorType`** | `index.ts`'de 2 değer + frontend'de 4 değer (`PUBLIC_INSTITUTION`, `ESTATE` eklenmiş) | Kritik. |
| **2 ayrı `ServiceStatus` / `ServiceReturnReason`** | `packages/types/index.ts` + `apps/web/src/lib/api.ts` (>4000 satır!) | Kritik. |
| **2 ayrı `InterestTypeCode`** | Backend `LEGAL_3095`, `COMMERCIAL_AVANS_3095_2_2`... + frontend `YASAL`, `TICARI_DEGISEN`... | Bilinçli mapping yapılmış (`mapUiToApiInterestType`). Olumlu disiplin. Ama mapping katmanı kernel migration sırasında yeniden değerlendirilmeli. |

**Kök sebep:** İki paralel evrim — `packages/types/src/index.ts` orijinal, `case.ts/debtor.ts` daha sonra "yeni domain" olarak eklenmiş ama eski export'lar silinmemiş. Frontend bazı yerlerden eskiyi, bazılarından yeniyi import ediyor.

**Vocabulary freeze ile kapanır:** Event Taxonomy belgesi yazılırken hangi enum'un kanonik olduğu kararlaştırılır, diğerleri silinir. Frontend tek import yolu kullanır.

---

## 4. Hardcoded Domain Vocabulary

**Bulgu:**

Frontend'de "label map" pattern'i çok yaygın ama **iki katlı**:

1. **Şer'i (legitimate) labels:** `packages/types/src/index.ts`'deki enum + label çiftleri. Sorun yok.
2. **Local re-definitions:** Component dosyalarında **duplicate label map**'ler:
   - `components/tebligat/TebligatPanel.tsx`: `TebligatTypeLabels`, `AddressTypeLabels`, `ChannelLabels`, `StatusColors`, `StatusLabels` — hepsi local
   - `app/portal/cases/page.tsx`: `statusLabels`, `statusColors` — local
   - `components/reports/InterestReport.tsx`: `interestTypeLabels` — local (üstelik shared'da `InterestTypeLabels` var)

**Hardcoded listeler:**

- **İl listeleri:** `app/(dashboard)/settings/page.tsx` ve `cases/new/page.tsx`'de `bigCities = ['İstanbul', 'Ankara', 'İzmir']` literal
- **Mock data with cities:** `debtor-profile.tsx`, `client-profile.tsx`'de örnek veriler
- **DOC_TYPES:** `app/portal/documents/page.tsx` ve `app/portal/poas/page.tsx`'de hardcoded
- **REPORT_TYPES:** `components/reports/scheduled-reports.tsx` ve `email-report-modal.tsx`'de **iki ayrı yerde aynı liste**
- **FORM_RULES:** `lib/form-validator.ts`'de form metadata hardcoded (`FORM_7`, `FORM_10`, `FORM_45`...)

**Kernel etkisi:** Bunların çoğu **Reference Data Stream**'in (TCMB, tarife, form types) frontend'e nasıl döneceği kararına bağlı. Hardcoded liste = stream değişiminden frontend habersiz kalır.

**Aksiyon:** Vocabulary freeze tamamlanınca `@hukuk/types` (veya yeniden adlandırılmış `@hukuk/domain`) paketi tek import noktası olur. CI gate: frontend'de duplicate enum tanımı yasak.

---

## 5. Form Semantics

**Bulgu:**
- `react-hook-form` + `zod` modern ve uygun
- `cases/new/page.tsx` çok büyük (812+ satır görünür) — ama bu form mantığının bir yerde kümelenmiş olması iyi sinyal (parçalanmış değil)
- Form schema'ları Zod ile yapılıyor → otomatik tipler türetilebiliyor

**Risk:** Form çıktısı **mutable plain object** olarak backend'e gönderiliyor (`POST /cases` endpoint). Kernel migration'da bu çıktı doğrudan event'e çevrilemeyebilir; aradaki mapping disiplini lazım.

Örnek: `cases/new/page.tsx`'de form bir "case" yaratıyor ama gerçekte yaratılması gereken event sırası:
```
CASE_OPENED
INSTRUMENT_REGISTERED  (varsa çek/bono)
CLAIM_REGISTERED
INTEREST_POLICY_ASSIGNED
```

Yani **bir form gönderimi = N event** olacak. Frontend bunu bilmiyor (haklı olarak), backend command handler'ında dağılacak. Ama UX'i etkileyen bir nokta: kullanıcı "kaydet"e bastığında transaction tamamı atomik olmalı, yoksa yarım state bırakır.

**Aksiyon:** Vocabulary freeze sonrası, kernel migration için `case-creation-command.md` mini spec'i yazılır: form payload → event sequence map.

---

## 6. Business Logic Leakage (Frontend computes legal things)

**Bulgu — bu en kritik kategorimiz:**

| Dosya | Ne yapıyor | Şiddet |
|---|---|---|
| `lib/interest-type-resolver.ts` | **400+ satır frontend'de hukuki mantık.** "Çek için her zaman ticari", "İpotek + akdi oran var → AKDI", "Aidat → KMK m.20 aylık %5", "Tacir kira → ticari" — hepsi kuralları frontend kodunda. | **CRITICAL** |
| `lib/form-validator.ts` | Form seçim mantığı: "İpotek varsa Form 45", "Çek için Form 10", "Tahliye varsa özel form" — İİK madde referansları kodda. | **CRITICAL** |
| `__tests__/ilamli-subcategory.test.ts` `calculateWizardResult()` | Wizard'ın "doğru cevabı" frontend'de hesaplanıyor | **HIGH** |
| `components/case-detail/CaseHeader.tsx` `calculateDays()` | İİK 78 madde referansıyla "kalan gün" hesabı frontend'de | **MEDIUM** |
| `components/reports/InterestReport.tsx` | Faiz raporu rendering içinde label mapping ve mantık karışmış | **LOW** (sadece görsel) |

**Bu mimarinin tek anayasal kuralının ihlalidir:**
> "Legal facts are immutable. Interpretations are rebuildable."

Frontend hukuki yorum yapıyor → yorum versiyonlanmıyor → mahkemede "bu hesabı neden böyle yaptınız" sorusunun cevabı yok. Üstelik hesaplar **render time**'da çalışıyor, deterministik replay edilemiyor.

**Bu, kernel migration'ın gerçek hedefi.**

Migration sonrası kural:
- Frontend hesaplama yapmaz
- "Bu form için hangi faiz türü?" sorusu backend'de `interestTypeResolver` calculator'ına gider
- "Bu durumda hangi form?" sorusu backend'de `formSelector` calculator'ına gider
- Frontend sadece sonucu gösterir + kullanıcıya "override etmek ister misiniz" diye sorar
- Override ise → yeni event (`INTEREST_POLICY_ASSIGNED` `reasoning` ile)

---

## 7. Kernel Migration Risk Map

| Risk | Şiddet | Açıklama |
|---|---|---|
| **R-1**: Frontend legal computation (interest, form rules, day count) | KRİTİK | İlk gün taşınmalı. Aksi halde "shadow truth" karşılaştırması anlamsız (frontend zaten farklı hesaplıyor). |
| **R-2**: Duplicate enum tanımları | YÜKSEK | Vocabulary freeze ile beraber kapanır. CI gate ile engellenebilir. |
| **R-3**: Hardcoded reference data (formlar, iller, baro listeleri) | ORTA | Reference Data API ile çözülür, ama bu Faz 2 işi. |
| **R-4**: 4000+ satırlık `lib/api.ts` | ORTA | Bir mimari koku. Kernel migration sırasında split olmalı, ama acil değil. Burada da label map duplikasyonları var. |
| **R-5**: Yarım kalmış refactor'lar (`api.ts.backup`, `page-new.tsx`, `_v2_disabled/`) | DÜŞÜK | Ama disiplin sinyali. Kernel migration başlamadan temizlenmeli. |
| **R-6**: Mock data UI'da (örnek müvekkil, örnek borçlu) | DÜŞÜK | Sadece dev kalıntısı, prod'da görünmüyor olmalı. Doğrulanmadı. |
| **R-7**: Form payload → event sequence mapping disiplini | DÜŞÜK | Kernel migration sırasında command handler'da çözülür. |

---

## 8. Required Shared Packages (Vocabulary Freeze Sonrası)

Kernel'e geçişte frontend'in ihtiyaç duyacağı paket yapısı:

```
packages/
  @hukuk/domain          (yeni — eski types refactor'u)
    enums/               (CaseStatus, TakipTuru, FaizTuru, ... — TEK kaynak)
    value-objects/       (Money, LegalDate, TCKN, VKN, BarNumber)
    branded-ids/         (zaten var)
    events/              (event payload schema'ları — Faz 1)
    
  @hukuk/calc            (yeni — pure functions, browser + node)
    interest-segmentor   (display preview için frontend de kullanabilir)
    tbk-100-allocator    (read-only preview için)
    balance-folder       (display için)
    
  @hukuk/legal-time      (yeni — adli tatil, day count basis)
  
  @hukuk/types           (mevcut, zamanla @hukuk/domain'e taşınır)
  @hukuk/ui              (mevcut, dokunulmaz)
```

**Önemli karar:** `@hukuk/calc` paketi **hem frontend hem backend** tarafından kullanılabilir mi? 

İki seçenek:
- **(α) Ortak paket:** Frontend "preview" amaçlı aynı calculator'ı çağırır, ama yazılı sonuç backend'in yazdığıdır. Hesap tek kod, çift çalışıyor. Drift riski yok ama paket browser-safe olmalı (no Node API).
- **(β) Backend-only:** Frontend her preview için backend API'ye gider. Hesap her zaman tek yerde. Network roundtrip artar.

**Önerim: (α).** Calculator pure function olduğu için paylaşmak güvenli. Mahkemede sunulan sonuç her zaman backend'in yazdığı snapshot olur. Frontend preview anlık feedback için aynı kod çağırabilir.

Ama bu kararı vocabulary freeze sırasında verelim, şimdi değil.

---

## 9. Recommended Migration Seams

Kernel migration sırasında dokunulacak frontend yerleri (öncelik sırası):

| # | Seam | Sebep | Effort |
|---|---|---|---|
| 1 | `lib/interest-type-resolver.ts` → backend'e taşı | R-1, anayasa ihlali | M |
| 2 | `lib/form-validator.ts` → backend'e taşı | R-1, anayasa ihlali | M |
| 3 | Duplicate enums → tek `@hukuk/domain` import'u | R-2 | S (mass replace) |
| 4 | `lib/api.ts` (4000+ satır) → modüler split (`api/cases.ts`, `api/debtors.ts`, ...) | Maintenance | L |
| 5 | `cases/[id]/page.tsx` üçleme → tek dosyaya konsolidasyon | R-5 | S |
| 6 | `cases/new/page.tsx` form → command/event mapping | R-7 | M |
| 7 | Hardcoded reference data → `/api/lookup/*` | R-3 | M (Faz 2) |

Strangler fig disiplini: bu seam'ler **kernel canlıya çıkana kadar dokunulmaz** (anayasa kuralı: stabilization fix'leri target architecture yönünde). Onlar Faz 1+ işi.

Sadece #5 (üçleme konsolidasyon) ve #3'ün başlangıcı (yeni eklenen kod tek import kullanmaya başlar) stabilization sprint'inde yapılabilir.

---

## 10. Red Flags

| # | Red Flag | Açıklama |
|---|---|---|
| RF-1 | `lib/api.ts` 4000+ satır + `api.ts.backup` + `api-new.ts` | God file + yarım refactor. |
| RF-2 | `cases/[id]/` altında `page.tsx`, `page-new.tsx`, `page-v2.tsx`, `_v2_disabled/`, `v2/` | 5 paralel implementasyon attempt. Hangisi prod kullanıyor belirsiz. |
| RF-3 | Frontend'de hukuki kural mantığı (interest-type-resolver, form-validator, calculateDays) | Anayasal ihlal. Kernel migration'ın hedefi. |
| RF-4 | `packages/types/src/index.ts` ve `case.ts` paralel enum'lar | İki kaynak çakışması. |
| RF-5 | Mock data (`debtor-profile.tsx`'de "ahmet@example.com") | Prod'da çıkar mı belirsiz, ama imaj problemi. |
| RF-6 | `__tests__/ilamli-subcategory.test.ts` içinde `calculateWizardResult()` (test'in test ettiği şeyi test'in kendisi yazıyor) | Test gerçek implementasyonu mu test ediyor, yoksa mock'u mu? |
| RF-7 | Çok sayıda local label map (`StatusLabels`, `interestTypeLabels`...) | Vocabulary parçalanması. |

---

## 11. Net Sonuç ve Stratejik Yorum

Frontend'in **stack seçimi mükemmel** (Next 14 + RHF + Zod + TanStack + Zustand). Bu ekibin teknik karar yetkinliğini gösteriyor.

Frontend'in **mimari disiplini orta**. İki ana sorun:

1. **Vocabulary parçalanması** (4 farklı yerden import edilebilen aynı enum) — vocabulary freeze ile çözülür, mekanik iş.

2. **Hukuki yorum frontend'de** — bu ciddi, ama **tek bir dosyada toplanmış** (`interest-type-resolver.ts`). Yani temizlenmesi mümkün. Eğer 30 component'te dağıtılmış olsaydı kernel migration imkânsızdı; toplu olması büyük şans.

`@hukuk/types` paketinin var olması ve `Money` value object'inin doğru tasarlanması, kernel migration'ı 6 ay olmaktan çıkarıp **3 ay civarına** indiriyor. Yani frontend, sandığımdan daha hazır.

**En önemli tek aksiyon:** Vocabulary freeze sırasında Aggregate Boundaries belgesinden hemen önce **vocabulary unification** spec'i yazılır:
- `packages/types`'de duplicate enum'ları sil
- Frontend'de local label map'leri sil
- Tek import yolu, CI gate

Bu tek başına frontend'in kernel-ready'liğini %70 → %90'a çıkarır.

---

## 12. Kapsam Dışı (Bilinçli Karar)

Bu scan **incelenmedi**, kasten:

- WCAG / accessibility audit
- Bundle size / Core Web Vitals
- Component design system tutarlılığı
- Animation / transition smoothness
- i18n / dil yönetimi (Türkçe-only varsayımı)
- SEO / meta tags
- Image optimization
- CSS architecture
- Mobile responsiveness

Bunlar ürün-market-fit sonrası problemler. Şu an kernel migration'ı bloklamıyor.

---

## 13. Sıradaki Adım

`00-architecture.md`'deki vocabulary freeze sırasına ekleme:

| # | Belge | Süre |
|---|---|---|
| **0** | **`vocabulary-unification.md`** (YENİ) — duplicate enum'ları kanonik tek versiyonda topla | 1 gün |
| 1 | `01-aggregate-boundaries.md` | 2 gün |
| 2 | `02-event-taxonomy-v1.md` | 3 gün |
| 3 | `03-causality-rules.md` | 2 gün |
| 4 | `04-temporal-semantics.md` | 1 gün |
| 5 | `05-implicit-rules.md` | 1 gün |

Toplam ~10 iş günü.

**Stabilization sprint frontend'e dokunmuyor — onaylanan plan korundu.**

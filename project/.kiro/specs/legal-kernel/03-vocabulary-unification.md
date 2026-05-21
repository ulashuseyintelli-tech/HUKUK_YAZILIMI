---
status: active
review-trigger: "Vocabulary matrix tamamlanıp imzalanana kadar — sprint sonu"
---

# Vocabulary Unification — Pre-Aggregate Migration

**Tarih:** 2026-05-19  
**Süre:** 1 iş günü  
**Durum:** Stabilization sprint sonrası, Aggregate Boundaries belgesinden ÖNCE  
**Gerekçe:** Frontend Seam Scan'de tespit edilen vocabulary parçalanması (4 kanaldan paralel enum tanımları) Event Taxonomy yazılmadan kapatılmalı. Aksi halde event payload schema'ları "hangi enum versiyonuyla?" sorusunu yanıtlayamaz.

---

## Anayasal kural

> **Domain enum'lar tek kaynaktan gelir.** Tek kaynak: `packages/@hukuk/domain` (mevcut `@hukuk/types` paketinin yeniden organize edilmiş hali).

Frontend ve backend ikisi de bu paketten import eder. Local re-definition CI gate ile bloklanır.

## Vocabulary Priority Rule (anayasal)

> **Vocabulary freeze is domain-priority-driven.**  
> Kernel-critical vocabulary must be canonicalized before aggregate design.  
> Operational vocabulary may remain provisional until later phases.

İki kategori:

**Critical-path (kernel-defining):**
Para, alacak, ödeme, mahsup, takip yolu — Money Truth Kernel'in başarı kriterini etkileyen kavramlar. Bunların canonical source'u aggregate boundaries'den **önce** seçilmeli.

- `CaseType / CaseTypeEnum` (#2)
- `CaseStatus` (#1)
- `ExecutionPath` (#22)
- `ClaimItemType` (#23)
- `CollectionStatus` + `CollectionType` + `CollectionChannel` (#24)
- `DueType` (#25)
- `InterestTypeCode` (#8)
- `AllocationType` (#26)

**Operational (workflow & UI):**
Görev, öncelik, kullanıcı rolü, abonelik planı — kernel'i belirlemiyor. Provisional kalabilir, Faz 2 vocabulary cleanup'ında finalize edilir.

- `TaskStatus`
- `Priority`
- `UserRole`
- `Plan`

Faz 1 hedefi: critical-path concept'lerin %100'ü canonical, operational concept'lerin yer tutucusu var.

---

## Migration Matrisi

Her domain kavramı için doldurulacak. Format:

| Concept | Backend Source(s) | Frontend Source(s) | Canonical Future Source | Migration Action |
|---|---|---|---|---|

### Bilinen çakışmalar (Frontend Seam Scan + Backend Deep Scan):

#### Frontend tarafı

| # | Concept | Backend Source | Frontend Source | Canonical Future | Migration Action |
|---|---|---|---|---|---|
| 1 | `CaseStatus` | `packages/types/src/index.ts` (4 değer: ACTIVE, CLOSED, SUSPENDED, ARCHIVED) | `packages/types/src/case.ts` (6 değer: + DRAFT, DERDEST) | `case.ts` (6 değer kanonik) | `index.ts`'den `CaseStatus` enum'ı sil. Bütün importları `case.ts`'e yönlendir. |
| 2 | `CaseType` | `packages/types/src/index.ts` (8 değer) | `packages/types/src/case.ts` `CaseTypeEnum` (9 değer: + ALIMONY) | `case.ts` `CaseTypeEnum` | `index.ts`'den sil, isim ortakla. |
| 3 | `DebtorRole` | `packages/types/src/index.ts` (7 değer) | `apps/web/src/types/debtor.ts` (12 değer, **typo: MUSETEREK_BORCLU**) | `packages/@hukuk/domain` (12 değer, **MUSTEREK_BORCLU** doğru) | Frontend local tanımı sil. Typo'yu düzelt (DB'de varsa migration). 12 değer kanonik. |
| 4 | `DebtorType` | `packages/types/src/index.ts` (2 değer) | `apps/web/src/types/debtor.ts` (4 değer: + PUBLIC_INSTITUTION, ESTATE) | `packages/@hukuk/domain` (4 değer) | Frontend local tanımı sil. Backend'i 4 değere genişlet. |
| 5 | `ServiceStatus` (tebligat) | `packages/types/src/index.ts` (9 değer) | `apps/web/src/lib/api.ts` içinde duplicate (god file) | `packages/@hukuk/domain` | `lib/api.ts`'den çıkar, shared paketten import et. |
| 6 | `ServiceReturnReason` | `packages/types/src/index.ts` (7 değer) | `apps/web/src/lib/api.ts` duplicate | `packages/@hukuk/domain` | Aynı şekilde. |
| 7 | `ServiceChannel` | `packages/types/src/index.ts` (4 değer) | `apps/web/src/lib/api.ts` duplicate | `packages/@hukuk/domain` | Aynı şekilde. |
| 8 | `InterestTypeCode` | `packages/types/src/interest.ts` (12 değer) | `apps/web/src/lib/interest-type-resolver.ts` (7 değer: YASAL, TICARI_DEGISEN vb.) | Backend kanonik | Mevcut `mapUiToApiInterestType` korunsun **ama sunset** — kernel migration'da frontend artık inference yapmayacak (Hard Rule #13). |
| 9 | `TebligatTypeLabels` | yok | Çoklu component'te local: `TebligatPanel.tsx`, `lib/api.ts`, vs. | `packages/@hukuk/domain` `TebligatTuru` enum + label map | Tek label map yer, tüm import'lar buradan. |
| 10 | `AddressTypeLabels` | yok | Çoklu component'te local | `packages/@hukuk/domain` | Aynı şekilde. |
| 11 | `interestTypeLabels` (display) | `packages/types/src/interest.ts` `InterestTypeLabels` | `components/reports/InterestReport.tsx` local map | Shared'daki kullanılmalı | Component'i shared'a yönlendir. |
| 12 | Form codes (`FORM_7`, `FORM_10`, ...) | yok (backend serbest) | `apps/web/src/lib/form-validator.ts` `FORM_RULES` | `packages/@hukuk/domain` `FormType` enum + metadata. **Form selection logic kernel migration'da backend'e gider** | Şimdilik shared'a taşı. Kernel migration'da `formSelector` calculator yazılır, frontend rules silinir. |
| 13 | İl listesi | `packages/shared/src/data/` (kontrol edilmeli) | `cases/new/page.tsx`, `settings/page.tsx`'de `bigCities = ['İstanbul', 'Ankara', 'İzmir']` literal | Reference Data API (`/api/lookup/cities`) | Faz 2 işi. |
| 14 | Form metadata sabitleri (DOC_TYPES, REPORT_TYPES) | yok | Frontend'de duplicate (`scheduled-reports.tsx`, `email-report-modal.tsx`) | `packages/@hukuk/domain/constants` | Tek dosya. |

#### Backend tarafı (Deep Scan'den eklendi)

| # | Concept | Konum 1 | Konum 2 | Canonical Future | Migration Action |
|---|---|---|---|---|---|
| 15 | `FactStoreService` (sınıf adı) | `icrabot/v28-engine/factstore.service.ts` (DB write + audit) | `policy-engine/fact-store/fact-store.service.ts` (cached read + scope) | İki ayrı sınıf, **farklı isimler:** v28 = `FactStoreService` (canonical write), policy = `CachedFactReader` (read cache + scope, write'ı v28'e delege) | Policy'deki sınıfı **rename**, `writeFact*` metodları v28'e delege. Aynı tabloyu yazıyorlar zaten. |
| 16 | `CaseType` (3. tanım) | `interest-strategy.config.ts` (KAMBIYO_CEK, ILAMSIZ_GENEL, TTK_1530_SUPPLY...) — **legal classification** | `case.ts` `CaseTypeEnum` (CHECK, GENERAL_EXECUTION, RENTAL...) — **persistence type** | İki ayrı kavram: `case.ts` = veri tipi, `interest-strategy` = legal profile. **Rename:** `interest-strategy.config.CaseType` → `LegalCaseProfile` (veya `InterestPolicyProfile`) | İki kavram olarak ayır, isimle netleştir. Mapping fonksiyonu eklenir. |
| 17 | `CasePolicyEngine` ("engine" değil "gate") | `policy-engine/case-policy-engine.service.ts` | — | **Rename:** `PolicyGateService` (`policy-gate/` modülünde) | Engine consolidation kararı uyarınca. Eski isim alias kalır. |
| 18 | `EngineRunnerService` (UYAP'a özel değil, generic runtime) | `icrabot/v28-engine/engine-runner.service.ts` | — | **Rename:** `EventRuntimeService` (`core-runtime/event-runtime/` modülünde) | Engine consolidation kararı uyarınca. |
| 19 | `UyapEventIngestService` (sadece UYAP, generic değil) | `icrabot/v28-engine/uyap-event-ingest.service.ts` | — | **Rename + Companion:** `UyapAdapter` (UYAP-specific) + yeni `DomainEventIngestService` (iç domain için) | Engine consolidation kararı. |
| 20 | "Engine" patlaması (6 modül `*-engine` ile bitiyor, çoğu engine değil) | `automation/workflow-engine.service.ts`, `claim-engine`, `summary-engine`, `policy-engine`, `interest-engine`, `icrabot/v28-engine` | — | Sadece 3'ü gerçek engine kalır: `interest-engine`, `core-runtime/event-runtime`, `policy-gate` | Diğerleri Faz 2'de service'e dönüşür (`automation/automation-orchestrator.service`, `claim/claim.service`, `summary/summary.service`). Şimdi yapma — Faz 1 kapsamı dışı. |
| 21 | `IcrabotCaseFact` / `IcrabotCaseFlag` (ikili kullanım) | v28-engine yazıyor | policy-engine de yazıyor (`writeFactToDb`) | Yazma tek noktadan: v28-engine. Policy delege eder. | `policy-engine/fact-store/fact-store.service.ts:writeFactToDb` v28'in `factStore.write`'ı çağırmalı. **PENDING** — bkz `90-future-work/pending/policy-write-delegation.md` |
| 22 | `ExecutionPath` (takip yolu) | `prisma/schema.prisma` `enum ExecutionPath` (5 değer: HACIZ, IFLAS, REHIN, IPOTEK, TAHLIYE) | `packages/types/src/case.ts` `ExecutionPathEnum` (6 değer: + ILAMSIZ, ILAMLI, KAMBIYO) | İki kavram karışmış: **takip yolu** (HACIZ/IFLAS/REHIN/IPOTEK/TAHLIYE) ve **takip türü-yöntemi** (ILAMSIZ/ILAMLI/KAMBIYO). Bunlar farklı boyutlar. | Canonical: prisma'daki 5 değer kalır (gerçek "yol"), `case.ts`'deki ILAMSIZ/ILAMLI/KAMBIYO ayrı bir enum'a (`ProcedureType` zaten Prisma'da var) taşınır. İki boyut ayrı kayıt. |
| 23 | `ClaimItemType` (alacak kalemi türü) | `prisma/schema.prisma` `enum ClaimItemType` (14 değer: PRINCIPAL, INTEREST, PRE_INTEREST, POST_INTEREST, EXPENSE, FEE, ATTORNEY_FEE, PENALTY, CHECK_PENALTY, CONTRACTUAL_PENALTY, TAX_KDV, TAX_BSMV, TAX_KKDF, OTHER) | `apps/api/src/modules/claim-item/dto/claim-item.dto.ts` `enum ClaimItemType` (aynı 14 değer) | Backend canonical (Prisma + DTO senkron). Frontend duplicate yok. | `prisma/schema.prisma` canonical. DTO `@hukuk/domain`'den re-export edecek. **TBK 100 mahsup sırasının semantiği bu enum'a bağlı** — kernel-critical. |
| 24 | `CollectionStatus` + `CollectionType` + `CollectionChannel` | `prisma/schema.prisma` ve `collection/dto/collection.dto.ts` (PENDING/CONFIRMED/CANCELLED/REFUNDED + CASH/BANK_TRANSFER/CHECK + NAKIT/BANKA/CEK/SENET/KREDI_KARTI/ICRA_DAIRESI/HACIZ/DIGER) | Frontend `lib/api.ts` içinde duplicate label maps | Üç ayrı kavram: status (lifecycle), type (kategori), channel (fiziksel kanal). | Hepsi `@hukuk/domain` altında ayrı enum. Prisma `CollectionType` enum'da hem yeni (TAHSILAT/FERAGAT/MAHSUP/SULH/IADE) hem eski (CASH/BANK_TRANSFER/CHECK/OTHER) değerler var — **kafa karışıklığı**. Yeni → kanonik, eski → migration sonrası sunset. |
| 25 | `DueType` (taksit/talep türü) | `prisma/schema.prisma` `enum DueType` (13 değer: PRINCIPAL, INTEREST, EXPENSE, VEKALET_UCRETI, HARC, TAZMINAT, CEZAI_SART, NAFAKA, KIRA, AIDAT, KOMISYON, PRIM, OTHER) | `apps/api/src/modules/case/dto/case.dto.ts` `enum DueType` (aynı 13 değer) | Backend canonical (senkron). | `prisma/schema.prisma` canonical. **`ClaimItemType` ile büyük örtüşme var** (PRINCIPAL, INTEREST, EXPENSE) — ikisi farklı kavram mı, aynı mı? Soru: due = scheduled installment, claim item = total receivable. Kavramsal ayrım korunmalı, ama enum birleşmeli mi? **PENDING** olarak işaretle. |
| 26 | `AllocationType` (TBK 100 mahsup hedefi) | `apps/api/src/modules/collection/dto/collection.dto.ts` `enum AllocationType` (7 değer: PRINCIPAL, INTEREST, EXPENSE, FEE, ATTORNEY_FEE, PENALTY, OTHER) | — | Backend canonical (tek tanım). | `@hukuk/domain` altında. **Bu enum `tbk-100-allocator.service.ts`'in çıktısının doğru kategorize edilmesi için kritik.** `ClaimItemType` ile **subset ilişkisi** olmalı (her allocation type bir claim item type'a karşılık gelir). Mapping tablosunun yazılması gerek. |

#### Pending — kavramsal soru (operational tablonun **dışında**)

| # | Concept | Pending Soru | Tracker |
|---|---|---|---|
| P1 | `DueType` vs `ClaimItemType` | Aynı kavramın iki yüzü mü? Birleşsin mi yoksa ayrı kalsın mı? | `90-future-work/pending/duetype-vs-claimitemtype.md` (timeout 2026-06-02) |
| P2 | `CollectionType` (Prisma) eski + yeni değerler bir arada | Eski (CASH, BANK_TRANSFER, CHECK, OTHER) ne zaman silinir? | Vocabulary unification spec imza tarihi + 6 hafta (sunset rule) |

#### Operational vocabulary (provisional, Faz 2'de finalize)

Bu concept'ler kernel-critical değil, Money Truth Kernel'in başarı kriterini etkilemiyor. Faz 1'de **olduğu gibi bırakılır**, Faz 2 vocabulary cleanup'ında finalize edilir.

| Concept | Notu |
|---|---|
| `TaskStatus` | UI workflow'u, kernel ile ilgisiz |
| `Priority` | UI/sorting, kernel ile ilgisiz |
| `UserRole` | Auth/RBAC, kernel ile ilgisiz |
| `Plan` (subscription) | Billing, kernel ile ilgisiz |
| `ServiceStatus` / `ServiceChannel` / `ServiceReturnReason` | Tebligat domain'i (Faz 2 — sealed artifacts pattern ile birlikte revize) |
| `AddressType` / `DebtorRiskLevel` / `PublicInstitutionType` / `ThirdPartyType` | Operational, Faz 2 |
| `EnforcementType` / `EnforcementStatus` (Prisma) | Faz 2 (haciz domain'i) |
| `WorkflowStage` (Prisma) | Faz 2 (workflow orkestrasyon) |

---

## Paket Yeniden Adlandırma

**Mevcut:** `packages/types`  
**Hedef:** `packages/domain` (npm scope: `@hukuk/domain`)

Geçiş:
1. Yeni dizin oluşturulur, içerik kopyalanır
2. `package.json` adı değişir
3. Eski paket tek `index.ts` ile yeni pakete re-export eder (deprecation period)
4. Bütün import'lar mass replace ile yeni isme döner
5. Eski paket silinir

**Süre:** 0.5 gün (pure mekanik). Bu spec'in scope'unun dışında — ayrı migration script ile yapılır.

---

## CI Gate'ler (vocabulary disiplinini koruyan)

Vocabulary unification tamamlandığında bu gate'ler eklenir:

1. **No domain enum redefinition in frontend:** `apps/web/src/**/*.{ts,tsx}` içinde `enum CaseStatus`, `enum DebtorRole`, vs. tanımı yasak. AST tarama ile.
2. **No local label map for shared enums:** `Record<CaseStatus, string>` veya benzeri pattern frontend component'lerinde yasak. Sadece `@hukuk/domain` içinde.
3. **No hardcoded city/province literals:** `cases/new`, `settings` dışında `'İstanbul' | 'Ankara' | 'İzmir'` pattern'i yasak (Faz 1 son toleransı, Faz 2'de tamamen kalkar).
4. **No legal computation in frontend (Hard Rule #13):** `apps/web/src/**/*.{ts,tsx}` içinde:
   - Faiz türü resolution logic (if-else trees with TBK / TTK / 3095 keywords)
   - Day count arithmetic (İİK madde referanslı süre hesabı)
   - Allocation logic (mahsup, TBK 100)
   
   Tespit edilen pattern'ler: `interest-type-resolver.ts`, `form-validator.ts`, `CaseHeader.tsx::calculateDays()`. Bu dosyalar **whitelist'e alınır**, yeni eklenenler bloklanır. Whitelist Faz 1 sonunda boşaltılır (taşınma tamamlandığında).
5. **No duplicate `FactStoreService` class:** Backend'de tek bir `FactStoreService` (canonical, write-side). `policy-engine`'deki sınıf `CachedFactReader` adına dönüşür.
6. **Layer discipline (Hard Rule #15-17):**
   - `PolicyGateService` DB write yapamaz (decision log dışında) — runtime tarama
   - `EventRuntimeService` legal authorization kararı veremez — code review gate
   - `CaseService` direct outbox.create çağıramaz — AST tarama
7. **Deprecation sunset (Hard Rule #18):** `@deprecated` JSDoc tag'i olan sınıf/fonksiyon, sunset tarihinden sonra import edilmesi yasak. CI tarihi karşılaştırır, blok eder.

---

## Deprecation Period

Hard rename değil, deprecation period stratejisi (Q2 onayı uyarınca):

```
Aşama 1 — Co-existence (vocabulary unification spec imza tarihi → +4 hafta)
  - Eski isimler @deprecated JSDoc ile alias kalır
  - Yeni isimler kanonik
  - Yeni kod sadece yeni isimleri kullanır (CI gate uyarısı)
  - Eski kullanımlar yavaş yavaş yenisine geçer

Aşama 2 — Sunset (imza tarihi + 4 hafta)
  - CI gate eski isimlerin yeni import edilmesini bloklar
  - Mevcut kullanımlar refactor edilir
  - Bütün import'lar yenisinde

Aşama 3 — Removal (imza tarihi + 6 hafta)
  - @deprecated alias'lar silinir
  - Kod tabanı tek vocabulary'de
```

**Sunset tarihi:** Bu spec onaylandığında belirlenir.

Aliaslar şöyle yazılır:

```typescript
/**
 * @deprecated Use `PolicyGateService` from 'policy-gate' module.
 * Will be removed on YYYY-MM-DD.
 */
export { PolicyGateService as CasePolicyEngine } from 'policy-gate';
```

---

## Definition of Done (Faz 1 — Critical Path)

**Kernel-critical concepts (~%100 tamamlanır):**

- [x] Migration matrisi critical-path satırlar dolu (frontend 14 + backend #15-21 + critical-path #22-26)
- [x] Pending P1 (`duetype-vs-claimitemtype.md`) için pending document açıldı, 14 gün timeout
- [ ] Mass replace script taslağı (henüz YAZILMADI — implementation territory)
- [ ] `packages/types` → `packages/domain` rename **planı** (henüz uygulanmadı)
- [ ] `policy-engine/FactStoreService` → `CachedFactReader` rename **planı**
- [ ] `CasePolicyEngine` → `PolicyGateService` rename **planı**
- [ ] `EngineRunnerService` → `EventRuntimeService` rename **planı**
- [ ] `interest-strategy.config.CaseType` → `LegalCaseProfile` rename **planı**
- [ ] CI gate'ler (7 madde) için spec (henüz uygulanmadı)
- [ ] `@deprecated` alias'ların sunset tarihi belirlenmiş (vocabulary unification spec imza tarihi + 4 hafta — sunset için, + 6 hafta — removal için)

**Operational concepts (provisional, Faz 2):**

- [ ] TaskStatus, Priority, UserRole, Plan, ServiceStatus/Channel/ReturnReason, AddressType, EnforcementType/Status, WorkflowStage canonical source seçimi → **Faz 2'ye ertelendi** (Vocabulary Priority Rule kuralı uyarınca)

**Bu spec için DoD:**

- [x] Critical-path 5 backend concept (#22-26) matrise eklendi
- [x] Operational vocabulary provisional olarak işaretlendi
- [x] Vocabulary Priority Rule anayasal kural olarak yazıldı
- [x] Pending P1 document açıldı (DueType vs ClaimItemType)
- [x] **ulas onayı (2026-05-19):** vocabulary spec imzalandı

**Decision Status:** Accepted  
**Accepted On:** 2026-05-19  
**Supersedes:** none

**Sunset tarihleri (imzadan başlayarak):**
- Deprecation co-existence: 2026-05-19 → 2026-06-16 (4 hafta)
- Sunset (CI gate yeni import bloklar): 2026-06-16
- Removal (alias dosyaları silinir): 2026-06-30 (6 hafta)

---

## Sıradaki Adım

Vocabulary spec **imzalandığında**:

1. Sunset tarihleri başlar (imza + 4 hafta sunset, + 6 hafta removal)
2. Hard Rule #18 ve #19 CI lint warning aşamasına geçer
3. Implementation kararları ayrı spec'lerde yazılır (rename script, CI gate kodu, vb.)
4. `06-aggregate-boundaries.md` başlar — kernel-critical vocabulary'nin aggregate sınırlarına nasıl yansıyacağı

**Operational vocabulary cleanup `90-future-work/deferred/operational-vocabulary-cleanup.md` olarak işaretlenir** (Faz 2 işi).


---

## Appendix A — Historical Draft Inventory (Deprecated)

> Bu tablo belgenin **erken iskeletinden** kalan, henüz doldurulmamış concept listesidir. Vocabulary Priority Rule eklendikten sonra **kullanımdan kaldırıldı** — operational concept'ler bilinçli olarak Faz 2'ye ertelendi (`90-future-work/deferred/operational-vocabulary-cleanup.md`).
> 
> Historical reference olarak burada tutulur, **aktif gerçekliği temsil etmez**. Artık ana matriste critical-path concept'ler var; operational olanlar provisional notunda.

| Concept | Backend Source | Frontend Source | Canonical Future | Migration Action |
|---|---|---|---|---|
| `ExecutionPath` | (artık ana matris #22'de) | — | — | — |
| `WorkflowStage` | Faz 2 (workflow orchestration) | — | — | — |
| `ClaimItemType` | (artık ana matris #23'te) | — | — | — |
| `PaymentMethod` | yok — `CollectionType` + `CollectionChannel` ana matris #24'te | — | — | — |
| `CollectionStatus` | (artık ana matris #24'te) | — | — | — |
| `DueType` | (artık ana matris #25'te) | — | — | — |
| `TaskStatus` | Faz 2 (operational) | — | — | — |
| `Priority` | Faz 2 (operational) | — | — | — |
| `UserRole` | Faz 2 (auth/RBAC) | — | — | — |
| `Plan` | Faz 2 (billing) | — | — | — |

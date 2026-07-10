# Debtor Scoring Canonicalization — Design Specification

**Tarih:** 2026-07-10 · **Statü:** GO-DOCS (design-only; kod/test/schema/migration/runtime değişikliği yok) · **Soy:** MPB-028 kapanışında ID'siz PROPOSED bırakılan takip maddesi (b) — "iki rakip risk formülünün ikisinin de CANCELLED/REFUNDED tahsilatı filtrelememesi (kanonik `DebtorScoring` konsolidasyonu)". GO-ANALYZE (2026-07-10) bu iki formüle ek olarak üçüncü bir (dormant) formül, iki manuel risk yüzeyi ve beş etkilenen tüketici sitesi tespit etti; bu belge o analizin kalıcı tasarım kaydıdır.

**Bu belge implementasyon başlatmaz.** Her faz kendi ayrı GO-IMPLEMENT yetkisini gerektirir (Bölüm 8). `COLLECTION-STATUS-FILTER-HOTFIX` ayrı bir implementasyon işi olarak önerilir (Bölüm 9) ve bu tasarım PR'ı içinde hiçbir kod değişmez.

**Revizyon (2026-07-10):** Bölüm 12 — Phase 2 read-only `DebtorScoringService` şartnaması eklendi (GO-ANALYZE çıktısı + M1-M7 owner kararları). Bölüm 9'daki hotfix o günün ilerleyen saatlerinde PR #1047 ile CLOSED; D1-D7 kararları decision-log'da kayıtlı.

---

## 1. Current-State Inventory

### 1.1 Skor üreten formüller

| # | Formül | Konum | Ölçek / Polarite | Durum | `Case.riskScore` ilişkisi |
|---|---|---|---|---|---|
| **F1** | `RiskService.analyzeCase` | `apps/api/src/modules/risk/risk.service.ts:29` | 0-100, **yüksek = KÖTÜ**; 5 faktör: varlık (0-25) + tahsilat geçmişi (0-25) + dosya yaşı (0-20) + aşama (0-15) + davranış (0-15) | AKTİF — controller'dan on-demand (`analyzeCase`, MPB-028 sonrası tenant-guarded) | **YAZMAZ** — yalnız `RiskReport` satırı yazar (`risk.service.ts:55`) |
| **F2** | `AutomationService.calculateRiskScore` | `apps/api/src/modules/automation/automation.service.ts:270` | 0-100, **yüksek = KÖTÜ**; 50 baz ± varlık sayısı / tahsilat oranı (×30) / yaş / aşama (OBJECTION +15, SEIZURE −5) | AKTİF — her gece yarısı cron (`@Cron(EVERY_DAY_AT_MIDNIGHT)`, `automation.service.ts:230`), tüm tenant'ların ACTIVE dosyalarını dolaşır | **TEK GERÇEK YAZAR** (`automation.service.ts:249-252`) + kendi `RiskReport`'unu yazar (`:255-263`) |
| **F3** | icrabot Risk Scoring v4 | `apps/api/src/modules/icrabot/config/risk-scoring.config.ts` | 0-100, **TERS POLARİTE: yüksek = İYİ** — `RISK_THRESHOLDS`: LOW {70-100}, MEDIUM {40-69}, HIGH {20-39}, CRITICAL {0-19} (`:329-334`); 5 kategori (YAKALAMA/HACIZ/SATIS/ISTIRAK/TAHSILAT), ağırlıklı faktör katkıları | **DORMANT** — `IcrabotModule` `app.module.ts:98-99,234`'te yorum satırı (import + registration kapalı) | Doğrudan yazmaz; **silahlı ama boşta yazma yolu:** `task-orchestrator.service.ts:301` `riskScore`'u Case-update whitelist'inde tutar ve `prisma.case.update`'i tenant guard'sız çağırır (`:307-310`). Bugün hiçbir decision-rule `updates.riskScore` üretmiyor (statik tarama), ama modül reaktive edildiğinde bu yol tek konfigürasyonla açılır. |

### 1.2 Manuel risk yüzeyleri (formül değil, ayrı eksenler)

| # | Yüzey | Konum | Nitelik |
|---|---|---|---|
| **M1** | `Debtor.riskLevel` | schema enum `DebtorRiskLevel` {DUSUK, ORTA, YUKSEK, COK_YUKSEK} (`schema.prisma:3035-3040`); FE `debtors/page.tsx` filtre + rozet + edit select; API `debtor.service.ts:435-436` filtre, `:1750-1765` byRisk stats; değişiklik cross-case bildirim tetikler (`debtor-cross-case-notification.service.ts`) | Kullanıcı eliyle atanan borçlu-seviyesi etiket. **Bilinen yanlış eşleme:** `debtor.service.ts:2225` `COK_YUKSEK`'i `RISK_BANKRUPTCY` issue koduna çevirir — "çok yüksek risk" ≠ "iflas"; iflas gerçeği ayrı bir durum alanıdır (bkz. Bölüm 2.9 sınır notu). |
| **M2** | `Case.riskId → LookupRisk` | `report.service.ts:263-311` (`getRiskReport`: `risk: { name, color }` + `groupBy riskId`) | Kullanıcı eliyle atanan dosya-seviyesi etiket (ad/renk). Risk raporunda hesaplanan `riskScore` ile yan yana sunulur; iki ayrı eksenin tek görünümde karışması tüketici tarafında anlam belirsizliği üretir. |

### 1.3 Kapsam dışı bounded context'ler (INTENTIONAL_BOUNDED_CONTEXT — dokunulmaz)

| Yüzey | Konum | Neden kapsam dışı |
|---|---|---|
| Client Workspace operating risk (`ClientOperatingRiskLevel`, `riskLevel: 'low'\|'medium'\|'high'`) | `client.service.ts:170, 2414-2424`; FE `lib/api.ts:62` | Müvekkil operasyon sağlığı sinyali — borçlu/dosya tahsilat riski değil. Kendi sinyal-severity mantığı var, skorlamayla veri paylaşmıyor. |
| calc-preview scenario ranker `riskScore` | `calc-preview/diagnostics/simulation-api/scenario-ranker.*` | Simülasyon senaryosu sıralama girdisi (kullanıcı verir, sistem hesaplamaz); Pareto/tie-break mantığı diagnostics-only. |

---

## 2. Confirmed Defects

1. **Üç rakip skor formülü** (F1/F2/F3): aynı kavram ("dosyanın tahsilat riski, 0-100") için üç bağımsız implementasyon; faktörleri, ağırlıkları ve çıktı dağılımları uyumsuz. Aynı dosya için F1 ile F2 farklı skor üretir; hangisinin "doğru" olduğu tanımsız.
2. **F3 ters polarite:** icrabot v4'te yüksek skor = İYİ (LOW risk 70-100). F1/F2 ve tüm aktif tüketicilerde yüksek skor = KÖTÜ. Aynı isim (`riskScore`, 0-100) altında iki zıt anlam.
3. **Aktif tüketicilerin tamamı yüksek = kötü varsayar:** `risk.service.ts:313-347` (getHighRiskCases ≥50, stats bantları), `ai.service.ts:313-337` (>70 riskli, <30 iyi), `report.service.ts:279` (desc sıralama), FE `reports/page.tsx:821-825` (≥70 kırmızı, ≥40 sarı), `policy-engine/fact-store.service.ts:175` (metriğe geçirir). Somut çarpışma örneği: dormant `SettlementCalculator` (`icrabot/v28-engine/compute-registry.service.ts:227`) `riskScore > 70` için daha büyük sulh indirimi verir — girdisi icrabot-v4 skoruysa mantık terstir (en kolay tahsil edilecek dosyaya en büyük indirim), `Case.riskScore` ise doğrudur. Girdi kaynağı input-mapping'e gömülü; reaktivasyon öncesi zorunlu doğrulama (Bölüm 7.4).
4. **`Case.riskScore`'un tek yazarı F2 nightly cron'dur** (`automation.service.ts:249-252`) — üç formülün en zayıfı, persist edilen tek değer.
5. **F1 `Case.riskScore`'u güncellemez:** kullanıcı on-demand analiz yaptırdığında zengin F1 skoru yalnız `RiskReport`'a yazılır; sistemin geri kalanının okuduğu `Case.riskScore` bir önceki gecenin F2 değerinde kalır. "Analiz yaptım ama listedeki skor değişmedi" tutarsızlığı yapısaldır.
6. **`RiskReport` çift-yazar / şekil kayması:** F1 `factors`'a 5-faktör skor şeması yazar (`risk.service.ts:61`), F2 `{hasAssets, hasCollections, caseAge…}` şeması yazar (`automation.service.ts:321-328`). Aynı Json kolonunda iki farklı şema; tüketici hangi satırın hangi şemada olduğunu ayırt edemez.
7. **`RiskReport`'ta doğrudan `tenantId`, `source`, `calculationVersion` yok** (`schema.prisma:2491-2506`): tenant izolasyonu yalnız `case` ilişkisi üzerinden dolaylı; hangi formülün/versiyonun yazdığı kayıtta yok — geçmiş kayıtların yorumlanabilirliği düşük.
8. **Scoring'in `NotificationQueue` sinyaline bağımlılığı:** F1 davranış skoru `notifications: { where: { status: "DELIVERED" } }` okur (`risk.service.ts:41, 177`). PR #1027 mock-fabrikasyonu durdurduğundan yeni dosyalarda DELIVERED neredeyse hiç oluşmayacak; bu skor bileşeni sessizce sabitlenir. `NotificationQueue` operasyonel kuyruktur, hukuki/davranışsal gerçek otoritesi değildir (bkz. `legal-time-authority-rebase.md` Bölüm 4 — aynı ilke). Kanonik scoring tebligat gerçeğini `Tebligat` alanlarından okumalıdır.
9. **Sınır notu (bu hattın kapsamında ÇÖZÜLMEZ):** `extractRiskFlags` (`debtor.service.ts:2270-2276`) şemada olmayan `bankruptcyStatus`/`concordatStatus`/`isDeceased` alanlarını okur — MPB-028 follow-up (d), ayrı hat. Bu tasarım yalnız sınırı tarif eder: kanonik skor, riskFlags'i girdi alacaksa bu hayalet alan kararı önce kapanmalıdır; almayacaksa bağımsızdır.

---

## 3. Collection Status Defect — `CONFIRMED_DEFECT`

`CollectionStatus` enum'u: `PENDING / CONFIRMED / CANCELLED / REFUNDED` (`schema.prisma:2406-2411`).

```text
CONFIRMED_DEFECT: Collection-tabanlı skor/AI/policy metrikleri Collection.status
filtrelemiyor. PENDING (henüz onaylanmamış), CANCELLED (iptal) ve REFUNDED (iade)
kayıtları "tahsil edildi" gibi sayılıyor.

DOĞRU KURAL:
- yalnız status = CONFIRMED sayılır; tercihen ham toplam yerine
- kanonik balance/payment authority çıktısı (CCB-001/ADR-014 computeBalance hattı,
  PAYMENT/REVERSAL ayrımıyla) tüketilir.
```

Etki yönü: iptal/iade edilmiş tahsilat skoru YANLIŞ İYİLEŞTİRİR (dosya olduğundan güvenli görünür), tahsilat oranını şişirir, AI tahmin/önerilerini ve policy metriklerini bozar. PENDING'in sayılması ayrıca "onaylanmamış parayı tahsil edilmiş sayma" hatasıdır.

---

## 4. Etkilenen Aktif Siteler

| Site | Konum | Etki |
|---|---|---|
| F1 collection score | `risk.service.ts:111-127` (sum `:113`) | İptal/iade/pending dahil toplam → tahsilat skoru yanlış düşer (dosya güvenli görünür) |
| F1 behavior score | `risk.service.ts:164-180` (`collections.length > 0`, `:174`) | İptal edilmiş tek tahsilat bile "borçlu ödüyor" sinyali verir (−3) |
| F2 nightly persisted `Case.riskScore` | `automation.service.ts:282-290` (+ `getRiskFactors:328`) | Bozuk oran her gece `Case.riskScore`'a persist edilir — tüm downstream tüketiciler etkilenir |
| AI prompt/fallback metrics | `ai.service.ts:184, 217, 311` | LLM'e yanlış "Tahsil Edilen/Kalan Borç/Tahsilat Oranı" anlatılır; kural-bazlı fallback tahmini de aynı toplamı kullanır |
| Policy-engine computed metrics | `policy-engine/fact-store/fact-store.service.ts:151-173` (`collectionRate`) | Yetki/karar kurallarına şişirilmiş `collectionRate` gidebilir; `riskScore` fact'i de (`:175`) F2'nin bozuk değerini taşır |

Statik taramada `riskScore`/`collectionRate` fact'lerini tüketen kod-içi policy kuralı bulunamadı; DB-tanımlı kurallar runtime'da referans verebilir — hotfix öncesi tüketici taraması Phase 3'ün shadow kapsamına dahildir (`ASSUMED` sınırı açıkça işaretlenir).

---

## 5. Target Architecture

### 5.1 `DebtorScoringService` (yeni, kanonik)

Tek skor üretim noktası. **Tek kanonik polarite: yüksek = KÖTÜ** (0 = en güvenli, 100 = en riskli) — tüm aktif tüketicilerle uyumlu; yalnız dormant F3 terstir ve adaptörle çevrilir (Bölüm 7.4). Girdi kuralları:

- Tahsilat gerçeği: **kanonik balance/payment authority** çıktısından (status-doğru; PAYMENT/REVERSAL ayrımı yapılmış) — ham `collections` toplamı YASAK.
- Tebligat gerçeği: `Tebligat` alanlarından (`tebligSayilmaDate`/`deliveredAt`/rejim alanları); `NotificationQueue` girdi DEĞİL.
- Varlık/aşama/yaş girdileri: mevcut kanonik alanlardan; faktör seti ve ağırlıklar implementasyon fazında tek şemaya bağlanır (F1'in 5-faktör ayrışımı başlangıç adayıdır).

### 5.2 `DebtorScoringSnapshot` (kavramsal model; kesin Prisma söz dizimi implementasyonda)

| Alan | Tip (kavramsal) | Amaç |
|---|---|---|
| `score` | `Int` (0-100) | Kanonik skor, yüksek = kötü |
| `scoreBand` | `String`/enum (`LOW/MEDIUM/HIGH/CRITICAL`) | Eşikler tek yerde; tüketiciler bant okur, eşik kopyalamaz |
| `factorBreakdown` | `Json` (TEK şema, versiyonlu) | Faktör katkıları — `RiskReport.factors` çift-şema sorununun kapanışı |
| `tenantId` | `String` (doğrudan kolon) | Dolaylı (relation-üzerinden) değil doğrudan tenant izolasyonu |
| `sourceCaseId` | `String` (FK) | Hangi dosyadan hesaplandığı — izlenebilirlik |
| `calculationVersion` | `String`/`Int` | Formül değiştiğinde eski/yeni skorları ayırt etmek için |
| `inputsHash` | `String` | Aynı girdiyle idempotent yeniden hesap doğrulaması / cache anahtarı |
| `inputProvenance` | `Json` | Hangi kanonik balance çıktısı + hangi tebligat gerçeği + hesap anındaki girdi özetleri |

---

## 6. Entity-Level Decision (tasarım tavsiyesi)

- **Kanonik skor v1: Case-level.** Bugün skor üreten/tüketen her şey Case seviyesindedir (`Case.riskScore`, `RiskReport.caseId`, tüm tüketiciler). "DebtorScoring" adı hedef kavramdır, v1 kapsamı dosya skorudur.
- **Debtor-level / cross-case aggregate: ayrı read-model, sonraki faz.** Borçlunun tüm dosyalarından türetilen birleşik görünüm v1'e alınmaz; kendi tasarım kararlarını (ağırlıklama, tenant sınırı, pasif dosya etkisi) ayrıca ister.
- **`Debtor.riskLevel` manuel etiket olarak AYRI kalır** — kullanıcı yargısı ekseni; hesaplanan skorla birleştirilmez, otomatik yazılmaz. (`COK_YUKSEK → RISK_BANKRUPTCY` yanlış eşlemesinin düzeltilmesi bu hattın işi değildir; ayrı küçük iş olarak not edilir.)
- **`LookupRisk` manuel case etiketi olarak AYRI kalır** — raporlarda hesaplanan skordan görsel olarak ayrıştırılması Phase 4 tüketici işine girer.

---

## 7. Legacy Handling

1. **`Case.riskScore` geçişte legacy alias/türetilmiş alan olabilir:** Phase 5'ten itibaren cron kanonik servisten beslenir ve `Case.riskScore`'a snapshot'ın `score`'u yazılabilir (türetilmiş alan). Kolonun kaldırılması bu tasarımın kapsamı dışında, ayrı owner kararıdır.
2. **Yeni kanonik snapshot olmadan `Case.riskScore` tek otorite SAYILMAZ:** bugünkü değer, filtre defekti taşıyan F2 çıktısıdır; yeni tüketici entegrasyonları bu alana bağlanmamalıdır.
3. **F2 cron formülü kaldırılmadan önce shadow compare zorunlu** (Phase 3): açık dosyalar için mevcut `Case.riskScore` vs kanonik skor farkı raporlanır; fark dağılımı görülmeden switch yapılmaz. Geçmiş veriye backfill yapılmaz; skor zaten günlük yeniden hesaplanan bir değerdir.
4. **F3/icrabot reaktivasyon öncesi polarity adapter ZORUNLU:** icrabot v4 skoru kanonik polariteye çevrilmeden hiçbir icrabot tüketicisine (SettlementCalculator dahil) veya `Case.riskScore` yazma yoluna bağlanamaz; `task-orchestrator.service.ts:301` whitelist'inden `riskScore` kaldırılır ya da kanonik servise delege edilir (Phase 6).

---

## 8. Rollout Strategy

| Phase | Kapsam | Not |
|---|---|---|
| **Phase 1** | docs/design | Bu belge |
| **Phase 2** | Read-only `DebtorScoringService` | Hiçbir tüketiciyi değiştirmez; tek formül + tek `factorBreakdown` şeması + tam test kapsamı; kanonik balance entegrasyon şekli owner kararına bağlı (Bölüm 10, D7) |
| **Phase 3** | Shadow compare | Mevcut `Case.riskScore` vs kanonik skor; fark dağılım raporu; DB-tanımlı policy kurallarının riskScore/collectionRate tüketimi taraması |
| **Phase 4** | Consumers switch | AI (`ai.service.ts`) / report (`report.service.ts`) / policy fact-store / FE (`reports/page.tsx`) kanonik kaynağa döner; `LookupRisk` etiketi görsel olarak ayrışır |
| **Phase 5** | Cron switch + F2 removal | Gece cron'u kanonik servisi çağırır; F2 formülü silinir; `Case.riskScore` türetilmiş alana düşer |
| **Phase 6** | icrabot polarity adapter + whitelist cleanup | Reaktivasyon ön koşulu; `task-orchestrator` riskScore yazma yolu kapanır/delege edilir |
| **Phase 7** | Opsiyonel migration | `RiskReport`'a `tenantId`/`source`/`calculationVersion` (ya da `RiskReport`'un `DebtorScoringSnapshot` lehine dondurulması) — ayrı owner GO |

Her faz ayrı PR ve ayrı GO-IMPLEMENT'tir; Phase 5 ve 7 davranış/schema etkisi nedeniyle owner gate ister.

---

## 9. Separate Hotfix Note — `COLLECTION-STATUS-FILTER-HOTFIX`

Kanonik hattan bağımsız, öne alınabilir dar düzeltme olarak önerilir. **Bu design PR'ında kod değişmez; hotfix ayrı GO-IMPLEMENT ister.**

```text
COLLECTION-STATUS-FILTER-HOTFIX (önerilen ayrı iş)
- Kapsam: Bölüm 4'teki 5 site — collection-tabanlı metrikler yalnız
  status = CONFIRMED sayar (veya kanonik balance çıktısını tüketir).
- PENDING/CANCELLED/REFUNDED dışlanır.
- Beklenen davranış değişikliği: risk skorları (gece cron'u ertesi gün tüm
  portföyü yeniden puanlar), AI prompt/fallback çıktıları ve policy
  collectionRate metriği DEĞİŞİR — bu bir bug-fix'tir ama görünür etkidir.
- Ayrı GO-IMPLEMENT + kendi test kapsamı + kendi register kaydı gerektirir.
```

---

## 10. Owner Decisions

| # | Karar | Tasarım önerisi | Statü |
|---|---|---|---|
| D1 | Canonical polarity | **Yüksek = KÖTÜ** (0-100) — tüm aktif tüketicilerle uyumlu | ÖNERİ — owner onayı bekliyor |
| D2 | Canonical entity | **Case-level v1**; debtor-level aggregate ayrı read-model/faz | ÖNERİ — owner onayı bekliyor |
| D3 | Hotfix öne alınacak mı? | Öneri: EVET — dar, bağımsız, ölçülebilir; ama görünür skor değişimi owner bilgisiyle olmalı | OWNER KARARI |
| D4 | `RiskReport` tenantId/source/version migration bu hatta mı? | Öneri: Phase 7'de opsiyonel; alternatif: `RiskReport` dondurulur, tarih `DebtorScoringSnapshot`'ta birikir | OWNER KARARI |
| D5 | `Case.riskScore` deprecated olacak mı? | Öneri: Phase 5'te türetilmiş alias; kaldırma ayrı karar | OWNER KARARI |
| D6 | icrabot v4: adapter mı, rewrite mı? | Öneri: reaktivasyonda polarity **adapter** (v4 iç faktörleri değerli); kanonik skora tam devir ayrıca değerlendirilir | OWNER KARARI |
| D7 | Canonical balance entegrasyonu PR-2 (Phase 2) içinde mi, ayrı mı? | Öneri: Phase 2 servis arayüzü balance-authority çıktısını girdi alacak şekilde tasarlanır; gerçek bağlama ADR-014 hattının hazırlığına göre Phase 2 içinde ya da Phase 2.5 olarak ayrılır | OWNER KARARI |

---

## 11. Final Verdict

```text
DEBTOR-SCORING-CANONICALIZATION VERDICT:
- Three competing formulas confirmed: YES — F1 RiskService.analyzeCase (aktif,
  Case.riskScore yazmaz), F2 AutomationService.calculateRiskScore (aktif nightly
  cron, tek yazar), F3 icrabot Risk Scoring v4 (dormant, ters polarite,
  task-orchestrator whitelist'inde silahlı-boşta yazma yolu).
- Collection status defect confirmed: YES — CONFIRMED_DEFECT; PENDING/CANCELLED/
  REFUNDED tahsilatlar 5 aktif sitede "tahsil edildi" sayılıyor (risk.service ×2,
  automation.service persisted skor, ai.service prompt/fallback, policy fact-store
  collectionRate). Doğru kural: yalnız CONFIRMED / kanonik balance çıktısı.
- Canonical polarity recommended: HIGH = BAD (0-100; tüm aktif tüketicilerle uyumlu;
  F3 reaktivasyonu polarity adapter'a bağlı).
- Canonical entity recommended: CASE-LEVEL v1; debtor-level/cross-case aggregate
  ayrı read-model, sonraki faz; Debtor.riskLevel ve LookupRisk manuel eksen olarak
  ayrı kalır.
- Case.riskScore status: LEGACY — tek yazarı F2 nightly cron; F1 güncellemiyor;
  geçişte türetilmiş alias olabilir; kanonik snapshot olmadan tek otorite sayılmaz.
- RiskReport schema debt: CONFIRMED — çift-yazar/farklı factors Json şeması;
  doğrudan tenantId/source/calculationVersion yok; Phase 7 opsiyonel migration
  veya dondurma kararı owner'da.
- Hotfix recommended: YES — COLLECTION-STATUS-FILTER-HOTFIX ayrı GO-IMPLEMENT işi;
  bu design PR'ında kod değişmedi.
- GO-DOCS: YES
- GO-IMPLEMENT: NO
- Owner decisions required: D1-D7 (Bölüm 10) — polarite, entity, hotfix önceliği,
  RiskReport migration, Case.riskScore deprecation, icrabot adapter/rewrite,
  canonical balance entegrasyon fazı.
```

---

## 12. Phase 2 — Read-Only `DebtorScoringService` Şartnamesi (2026-07-10 eki)

Phase 2 GO-ANALYZE'ının kalıcı kaydı. **M1-M7 owner kararları bu ekle NİHAİDİR** (Bölüm 12.9). Bu bölüm implementasyon başlatmaz; PR-2A ayrı GO-IMPLEMENT ister.

### 12.1 Phase 2 Sınırı

```text
PHASE 2 YAPAR:
- Yeni, bağımsız, read-only DebtorScoringService (apps/api/src/modules/debtor-scoring/,
  tenant-zorunlu, on-demand, deterministik)
- Kanonik girdi adaptörleri: canonical balance, confirmed collections, asset-query,
  tebligat/serviceStatus sinyalleri
- Tek factorBreakdown şeması + inputProvenance + dataGaps + warnings + explainability
- Kendi birim/regresyon/saflık testleri

PHASE 2 YAPMAZ:
- Case.riskScore YAZMAZ (hiçbir Prisma write yok)
- Persistence YOK (snapshot DB'ye yazılmaz — M4: ayrı schema fazı)
- Endpoint YOK (internal read-only endpoint dahil — M3: Phase 3'e bırakıldı)
- Cron/scheduler DEĞİŞTİRMEZ; AI/report/policy/UI consumer switch YAPMAZ
- Schema/migration, RiskReport migration YAPMAZ
- icrabot aktivasyonu/adaptörü YAPMAZ
- Cross-case/debtor-level aggregate YAPMAZ (M6)
- Otomatik hukuki/finansal aksiyon TETİKLEMEZ
```

### 12.2 Input Authority Matrix

| Input | Mevcut kaynak | Kanonik kaynak (Phase 2) | Güven durumu | Kullanım |
|---|---|---|---|---|
| Confirmed collection total | ham `collections` (PR #1047 sonrası CONFIRMED-only) | `CaseBalanceOrchestration.computeCaseBalance(tenantId, caseId)` | AUTHORITATIVE | KULLAN — birincil |
| Outstanding balance | `Case.principalAmount` | `computeCaseBalance` çıktısı (`cutoverReadiness` gate'li) | AUTHORITATIVE | KULLAN — unsafe'te fallback + provenance |
| Case age | `Case.createdAt` | aynı | AUTHORITATIVE | KULLAN |
| Asset signal | `debtor.assets[]` var/yok | `CaseDebtor.assetVehicle/RealEstate/Bank/SgkWage` (`AssetQueryStatus`) + `assetLastQueryAt`; `Asset[]` ikincil | AUTHORITATIVE — UNKNOWN "sorgulanmadı"yı YES/NO'dan ayırır | KULLAN |
| Service status | F1'de `NotificationQueue DELIVERED` (yasak) | `CaseDebtor.serviceStatus` + `Tebligat.status/deliveredAt` (varlık/durum düzeyi) | AUTHORITATIVE | KULLAN |
| Legal service date / süre | `Tebligat.tebligSayilmaDate` (MERNİS dalı +15 hatalı) | gelecek `LegalDeadlineService` | FOUNDATION_REQUIRED | KULLANMA → `DATA_GAP: LEGAL_TIME_AUTHORITY_PENDING` (M5) |
| Workflow stage | `Case.workflowStage` | aynı | AUTHORITATIVE (tazeliği değişken) | KULLAN |
| Payment behavior | F1 "herhangi collection −3" | CONFIRMED collection tarihleri | DERIVED | KULLAN |
| Manual `Debtor.riskLevel` / `LookupRisk` | manuel eksenler | — | LEGACY_ONLY | KULLANMA (skora girmez) |
| Bankruptcy/concordat/legalStatus | hayalet alanlar (MPB-028(d) açık) | gelecek `Debtor.legalStatus` tasarımı | DATA_GAP | KULLANMA → `DATA_GAP: LEGAL_STATUS_UNMODELED` |
| NotificationQueue delivered | F1 girdisi | — | NON_AUTHORITATIVE | KULLANMA (test ile kilitli) |
| `Case.riskScore`/`RiskReport`/`Case.riskId` | legacy | — | LEGACY_ONLY | KULLANMA (yalnız Phase 3 shadow referansı) |

### 12.3 F1/F2/F3 Reconciliation

| Factor | F1 | F2 | F3 (dormant, ters polarite) | Kanonik v1 | Gerekçe |
|---|--:|--:|--:|---|---|
| Varlık | 0-25 tür-bazlı | ±10/±10 adet | coverage (değer) | **EVET (revize)** | Kaynak `AssetQueryStatus`'a taşınır; UNKNOWN artık "varlık yok" sayılmaz |
| Tahsilat oranı | 0-25 bant | −rate×30 | ters | **EVET (revize)** | Girdi kanonik balance; F1 bant eğrisi korunur |
| Dosya yaşı | 0-20 bant | +10/+10 | ters | **EVET** | F1 bantları |
| Aşama | 0-15 tablo | 2 dal | yok | **EVET** | F1 13-aşama tablosu |
| Davranış | 0-15 (NotificationQueue'lu) | yok | ayrı compute | **EVET (revize)** | itiraz=lifecycle/stage, ödeme=CONFIRMED recency, tebligat=`serviceStatus` |
| Haciz sırası/likidite (F3 YR/IR/SR) | yok | yok | var | **HAYIR (v1)** | Varlık-düzeyi ayrı problem; F3 ters polarite Phase 6 adapter konusu |
| Borçlu tipi | yok | yok | var | **HAYIR (v1)** | Bilinçli dışlama (kalibrasyon/adalet tartışması ayrı) |
| Süre/kesinleşme yakınlığı | yok | yok | yok | **DATA_GAP** | Legal Time Authority PR-2 önkoşul |

### 12.4 Servis Kontratı

```ts
interface DebtorScoringService {
  calculateCaseScore(tenantId: string, caseId: string): Promise<DebtorScoringResult>;
}

interface DebtorScoringResult {
  score: number;                 // 0-100, yüksek = KÖTÜ (D1)
  scoreBand: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; // 0-24 / 25-49 / 50-74 / 75-100
  calculationVersion: string;    // "dscan-v1.0" — formül değişiminde artar
  factorBreakdown: FactorContribution[]; // {factorCode, rawInput, points, maxPoints, direction, note}
  inputProvenance: InputProvenance;      // BALANCE_AUTHORITY | CONFIRMED_FILTER_FALLBACK | CASE_DEBTOR_FIELDS | TEBLIGAT | CASE
  dataGaps: DataGap[];           // {code, factorCode, effect: NEUTRALIZED|PARTIAL|EXCLUDED, note}
  warnings: string[];
  calculatedAt: string;
  tenantId: string;
  caseId: string;
}
```

Kural: **Score hiçbir zaman tek başına hukuki aksiyon yetkisi vermez** — kontratta yetki alanı yoktur; HIGH/CRITICAL bantları yalnız "insan değerlendirmesi önerilir" anlamı taşır.

### 12.5 Faktör Modeli (M1 — ağırlıklar ONAYLI)

| Factor code | Kaynak | Aralık | Ağırlık | Yön | DATA_GAP davranışı |
|---|---|---|---|---|---|
| `FIN_RECOVERY` | computeCaseBalance → fallback CONFIRMED util | 0-25 | **25** | oran ↑ = puan ↓ | balance unsafe + fallback boş → NEUTRALIZED (orta puan) |
| `ASSET_COVERAGE` | `CaseDebtor.asset*` + `Asset[]` | 0-25 | **25** | YES ↑ = puan ↓ | tüm kanallar UNKNOWN/PENDING/ERROR → NEUTRALIZED + `ASSET_QUERY_NOT_RUN`; **`NO` = gerçek negatif (tam puan, gap DEĞİL)** |
| `CASE_AGE` | `Case.createdAt` | 0-20 | **20** | yaş ↑ = puan ↑ | gap olmaz; <30 gün `EARLY_LIFECYCLE` işareti |
| `STAGE_PROGRESS` | `Case.workflowStage` | 0-15 | **15** | ileri aşama = puan ↓ | gap olmaz |
| `BEHAVIOR` | lifecycle (itiraz) + CONFIRMED ödeme recency + `serviceStatus` | 0-15 | **15** | işbirliği = puan ↓ | Tebligat kaydı hiç yok → alt-bileşen NEUTRALIZED + `SERVICE_NOT_INTEGRATED` |
| `LEGAL_DEADLINE` (rezerve) | LegalDeadlineService (yok) | — | 0 | — | daima `EXCLUDED` + `LEGAL_TIME_AUTHORITY_PENDING` (M5: kaba tarih hesabı YASAK) |

**Eksik veri politikası (M2 — NİHAİ):** nötr puan (NEUTRALIZED) + `dataGaps` kaydı + `warnings`; **v1'de ayrı sayısal confidence alanı YOK.** Diğer zorunlu ayrımlar: hiç collection yok ≠ yalnız CANCELLED/REFUNDED var (ikincisi `warnings` notu üretir, puan farkı üretmez); tebligat entegrasyonu yok ≠ tebliğ edilemedi (RETURNED/FAILED gerçek olumsuz sinyaldir).

### 12.6 Balance Entegrasyonu (M7 — NİHAİ)

`CaseBalanceOrchestration.computeCaseBalance(tenantId, caseId)` (interest-engine/orchestration) **servis-servise doğrudan modül import'uyla** tüketilir; **internal HTTP YOK.** `cutoverReadiness` güvensizse finansal girdi `collection-confirmed.util` CONFIRMED-only fallback'ine düşer ve `inputProvenance` bunu `CONFIRMED_FILTER_FALLBACK` olarak işaretler. Policy-engine fact-store KULLANILMAZ (legacy `Case.riskScore` taşır; yön ileride tersine kurulur). Circular dependency yok: debtor-scoring → interest-engine/prisma tek yönlü. On-demand tek dosya ~8-12 sorgu; portföy-geneli koşum Phase 2'de yok.

### 12.7 Shadow Compare Kontratı (Phase 3 için şimdiden)

```text
{ legacyScore, canonicalScore, delta, legacyFormula: "F2_NIGHTLY",
  canonicalVersion, factorDifferences[], dataGaps[], safeForConsumerSwitch }
```

- Delta bantları: 0-9 / 10-24 / ≥25; band-atlaması (örn. MEDIUM→CRITICAL) ayrı ve öncelikli sayılır.
- Beklenen farklar: iptal/iade/pending geçmişli dosyalarda canonical ↑; tüm asset kanalları UNKNOWN olan dosyalarda canonical ↓ (F1/F2 karamsarlığı kalkar).
- Blocker'lar: balance-unsafe iken üretilmiş skor; ≥2 DATA_GAP'li faktör; determinizm ihlali → `safeForConsumerSwitch=false`.
- Persist YOK (M4) — yapılandırılmış log/telemetry; PII taşınmaz (yalnız id/skor/faktör kodu), tenant alanı zorunlu. Desen: mevcut `balance-display-shadow-diff` modülü.

### 12.8 Test Planı (Phase 2 implementasyonunda zorunlu)

1) Yalnız CONFIRMED sayılır (fallback yolu) · 2) CANCELLED/REFUNDED/PENDING dışlanır · 3) tüm asset kanalları UNKNOWN → DATA_GAP + nötr · 4) kanal `NO` → tam risk puanı · 5) `NotificationQueue` hiçbir sorguda yer almaz · 6) Tebligat kaydı yok → `SERVICE_NOT_INTEGRATED` · 7) tenant isolation · 8) determinizm (aynı girdi + sabit asOf → aynı sonuç) · 9) `Debtor.riskLevel` skora etkisiz · 10) hiçbir Prisma write çağrısı yok (`Case.riskScore` yazılmaz) · 11) dataGaps/warnings eksik faktörleri isimleriyle içerir · 12) F3/icrabot import'u modülde yok (statik saflık guard'ı, W0.1 emsali).

### 12.9 PR Planı ve Owner Kararları (NİHAİ)

**PR planı (owner onaylı):** `PR-2A` contracts + saf deterministik engine (DB'siz) → `PR-2B` kanonik input adapter'ları → `PR-2C` servis orkestrasyonu + testler. **Endpoint Phase 3'e bırakıldı.** Her PR ayrı GO-IMPLEMENT ister; PR-2B'nin tek riskli teması interest-engine modül export'udur (gerekirse tek satır exports eklemesi PR-2B kapsamında raporlanır).

| Karar | Sonuç |
|---|---|
| M1 Ağırlıklar | **25/25/20/15/15 ONAY** |
| M2 Eksik veri | **nötr puan + dataGaps + warnings; v1'de confidence alanı YOK** |
| M3 Internal endpoint | **Phase 2'de YOK — Phase 3** |
| M4 Snapshot persistence | **Phase 2'de YOK — ayrı schema fazı** |
| M5 Legal Time yokken | **DATA_GAP; kaba serviceStatus tarih hesabı YOK** |
| M6 Cross-case aggregate | **Phase 2 DIŞI** |
| M7 Balance adapter | **servis-servise doğrudan import; internal HTTP YOK** |

### 12.10 Phase 2 Verdict

```text
DEBTOR-SCORING-CAN PHASE 2 VERDICT:
- Read-only service feasible: YES — SAFE_FOR_READ_ONLY
- Canonical inputs available: YES (computeCaseBalance + AssetQueryStatus +
  serviceStatus/Tebligat + createdAt/workflowStage)
- Blocked inputs: LEGAL_DEADLINE (FOUNDATION_REQUIRED), legalStatus (DATA_GAP),
  NotificationQueue (NON_AUTHORITATIVE), manuel etiketler (LEGACY_ONLY)
- Formula v1 ready: YES (M1-M2 ile kilitlendi)
- Schema migration required: NO
- Case.riskScore write required: NO
- Consumer switch included: NO — NOT_SAFE_FOR_CONSUMER_SWITCH (Phase 3 shadow şartı)
- GO-IMPLEMENT ready: YES — PR-2A için READY (ayrı owner GO ile)
```

---

**İlgili kayıtlar:** MPB-028 (P0 security fix — follow-up (b) soyu) · `legal-time-authority-rebase.md` (NotificationQueue-otorite-değildir ilkesi + snapshot/calculationVersion deseni) · CCB-001/ADR-014 (kanonik balance/payment authority hattı) · `canonicalization-policy.md` (ARCHITECTURAL_DRIFT sınıflandırma çerçevesi).

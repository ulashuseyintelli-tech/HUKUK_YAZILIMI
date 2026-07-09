# CCB-001 Legal / Owner Sign-off Record

```text
Status:
SIGNED_OFF_WITH_CONDITIONS

Implementation under review:
codex/ccb-001-pr1-pr6-rescue @ 961bbaf3

Current main:
does not yet contain this implementation.
```

**Güncelleme notu (2026-07-09, üçüncü tur — Owner Review tamamlandı):** Owner, bu belgeyi (961bbaf3 kanıt tabanıyla, Payment Allocation Authority Separation bölümü dahil) inceledi ve **`SIGNED_OFF_WITH_CONDITIONS`** kararını verdi (bkz. Bölüm 7). Bu, **CCB-001'in main'e merge edilmesi anlamına GELMEZ** — yalnız owner'ın teknik/hukuki bulguları kabul ettiği ve merge'in hangi koşullarla ilerleyebileceğini kayda geçirdiği anlamına gelir. Koşullar karşılanmadan/izlenmeden gerçek merge işlemi (branch'in kendisi + `product-backlog.md` conflict çözümü) ayrı bir GO-COMPLETE gerektirir.

**Bu belge neden main üzerinde yaşıyor:** Bu kayıt, `codex/ccb-001-pr1-pr6-rescue` WIP branch'inin inceleme sürecini belgeler. Kasıtlı olarak main-tabanlı ayrı bir dokümantasyon branch'inde oluşturulmuştur, çünkü implementasyon branch'i eş-zamanlı geliştirme altındadır ve commit edilmemiş çalışma içerebilir. Bu belge yalnız governance metadata'sıdır ve CCB-001'in main'e merge edildiği anlamına gelmez — **main şu an bu implementasyonu içermemektedir.**

**Durum:** `SIGNED_OFF_WITH_CONDITIONS` (2026-07-09). Aşağıdaki tablo ve bulgular GO-ANALYZE turlarında toplanan repository kanıtıdır. Belgedeki teknik maddeler "review altında"/"kanıt bulundu" dilinde yazılmıştır; nihai onay yalnız Bölüm 7'deki owner kararıdır.

**İlişkili dosyalar:** `product-backlog.md` (`ID: CCB-001`), `docs/adr/ADR-012-CCB-001-CANONICAL-LEGAL-CALCULATION-CORE.md`, `canonicalization-register.md` (`CAN-CUT-02`), `docs/finance/tm3-collection-disposition-boundary.md` (ONAYLANDI 2026-06-26), `docs/governance/dbind-financial-authority-decisions.md` (ONAYLANDI 2026-07-04).

---

## 1. Scope

| Alan | Değer |
|---|---|
| İncelenen branch | `codex/ccb-001-pr1-pr6-rescue` |
| İncelenen commit (tip) | `961bbaf3` ("fix(ccb-001): reconcile allocation behavior and authority metadata before ADR-012") — önceki tur `fcdbebde`'yi inceliyordu |
| Merge-base (main ile ortak ata) | `7b222c50` |
| Bu kaydın oluşturulduğu tarih | 2026-07-09 (ilk tur), 2026-07-09 (ikinci tur — `961bbaf3` refresh) |
| Değerlendirme yöntemi | GO-ANALYZE serisi (kod okuma, izole read-only worktree'de test çalıştırma, `git diff -w` ile CRLF-gürültüsünden arındırılmış gerçek diff analizi) — bu belge kodu tekrar değiştirmez, yalnız bulguları konsolide eder |

**`961bbaf3`'ün getirdiği değişiklikler (R1-R5, başka bir eş-zamanlı oturum tarafından yapıldı, bu turda doğrulandı):**
- **R1:** `FIN-TBK100-DI-001` (main'de PR #989/`f1bab70c` ile kapanmış DI-export hotfix'i) bu branch'e hiç yansımamıştı — forward-port edildi.
- **R2:** `allocation-engine`'de COST/ANCILLARY/INTEREST/PRINCIPAL adımları artık cent-normalize ediliyor (float-dust birikimi riski giderildi, mevcut `minor-unit.ts` yardımcıları kullanıldı, yeni kütüphane yok).
- **R3:** `allocateSinglePayment()` negatif ödemeyi doğrudan reddediyor (`TBK100AllocatorService.allocate()`'in mevcut guard'ıyla tutarlı).
- **R5 (önemli):** `case-balance-display.ts`'deki `authority` alanı artık sabit `SHADOW_ONLY` değil — `status==='OK'` iken `CANONICAL_CANDIDATE` (mevcut ama hiç atanmamış enum değeri) dönüyor, çünkü bu display artık `CaseService`/`ReportService` tarafından production tek-kaynak olarak tüketiliyor. Kod içi yorum bilinçli olarak `CANONICAL_PRIMARY`/`ACTIVE` DEĞİL `CANDIDATE` seçmiş — ADR-012'nin PR-11 gate dilinde owner'dan henüz resmi "cutover tamamlandı" beyanı alınmadığı için. Bu, madde 1/9'un etiket-gerçek-durum tutarsızlığını düzeltiyor.
- **R4:** Aynı oturum, branch'in kendi `product-backlog.md`/`decision-log.md`'sine "PR-11/13/14 kapsamı kodda governance kaydından önde, yalnız WIP-branch, main'i etkilemiyor" notu düşmüş — bu belgenin Bölüm 14'teki uyarısıyla aynı ruhta.
- **Test kanıtı (bu turda yeniden doğrulandı):** 21 test suite / 173 test, dahil golden-legal-fixture-matrix, PASS. Commit mesajı ayrıca daha geniş bir set iddia ediyor (60 suite/785 test) — bu geniş set bu turda tekrar çalıştırılmadı, yalnız curated 21-suite alt kümesi doğrulandı.

**Not:** Bu kayıt, sign-off anındaki branch tip'ini (`961bbaf3`) referans alır. Branch üzerinde bu tarihten sonra yeni commit eklenirse, bu kayıt otomatik olarak geçersiz sayılır ve yeniden değerlendirme gerekir.

---

## 2. Golden Legal Fixture Scenario Table

Kaynak: `project/apps/api/src/modules/interest-engine/orchestration/__tests__/ccb001-golden-legal-fixture-matrix.spec.ts` (branch üzerinde, 13 adlandırılmış senaryo, test suite PASS — internal-consistency kanıtı, hukuki doğruluk kanıtı DEĞİL).

| Senaryo | Konu | Test durumu (bu turda çalıştırıldı) | Reviewer kararı |
|---|---|---|---|
| A / I / N | Basit TRY hukuki bakiye — final bakiye, fee diagnostics, trace, case-scoped kaynaklar | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION |
| B | Anaparaya ulaşmayan kısmi ödeme — gelecek faiz tabanı değişmez | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION |
| C | Anaparaya ulaşan kısmi ödeme — yalnız gelecek faiz tabanını mutasyona uğratır | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION |
| D | TBK100 sırası: masraf, fer'i, faiz, anapara (allocation trace içinde) | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION |
| E | Reversal netting — trace kanıtı, ekstra bir allocation oracle'ı olmuyor | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION |
| F | NO_BUCKETS — hukuki ve gösterim statüsü BLOKLU (fail-closed) | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION (revize NO_BUCKETS açıklamasıyla kabul) |
| G | Yabancı para, FX-basis olmadan — bloklu, uydurma TRY dönüşümü yok | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION |
| H | Açık yabancı sözleşme-bazı olsa da TRY dönüşüm otoritesi yoksa hâlâ bloklu | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION |
| J | Takip tarihi öncesi/sonrası faiz fazlarının ayrımı ve toplam mutabakatı | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION — *Covered by the overall SIGNED_OFF_WITH_CONDITIONS decision. No separate owner decision was recorded for this individual item.* |
| K | Aynı-gün ödemeler — tarih+id'ye göre deterministik, inputHash kararlı | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION — *Covered by the overall SIGNED_OFF_WITH_CONDITIONS decision. No separate owner decision was recorded for this individual item.* |
| L | Tutulan fazla ödeme (overpayment) — hukuki borçtan ayrı, kalan borcu asla negatif yapmıyor | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION — *Covered by the overall SIGNED_OFF_WITH_CONDITIONS decision. No separate owner decision was recorded for this individual item.* |
| M | Karışık para birimi gösterimi — bir para birimi FX-unsafe ise bloklu, TRY satırı ayrı kalıyor | PASS | ☑ PASS ☐ FAIL ☐ NEEDS_REVISION |

**Reviewer notu:** Owner 2026-07-09 mesajında A/I/N, B, C, D, E, F, G, H, M senaryolarını doğrudan kapsayan tematik kategorileri açıkça onayladı (bkz. Bölüm 1'in üstündeki owner özetine referans). J/K/L için ayrı satırlardaki not, bu üç maddenin owner tarafından tek tek adlandırılmadığını, yalnız genel `SIGNED_OFF_WITH_CONDITIONS` kararının kapsamında olduğunu — agent çıkarımı OLMADAN — açıkça belirtir.

---

## 3. Technical Verification Checklist

**Dil netliği:** "VERIFIED" burada yalnız *"GO-ANALYZE ile repo kanıtı bulundu ve testler geçti"* anlamına gelir — bu, owner/Avukat onayının yerini tutmaz ve maddenin nihai/tamamlanmış sayıldığı anlamına gelmez. Her satırın nihai statüsü yalnız "Reviewer kararı" sütunundaki işaretlenmiş kutudur.

| # | Madde | Evidence | Teknik durum (review-altı kanıt) | Reviewer kararı |
|---|---|---|---|---|
| 1 | Canonical calculation wiring | `case.service.ts: getCalculationSummary()` → `computeCaseBalance` → `toCaseBalanceDisplay` → `adaptCanonicalCalculationSummary`, koşulsuz. **R5 (961bbaf3):** `authority` alanı artık gerçek durumu yansıtıyor (`CANONICAL_CANDIDATE`, önceden hardcoded `SHADOW_ONLY`) | VERIFIED (kod+test), etiket-gerçek tutarsızlığı R5 ile düzeltildi | ☑ ACCEPT ☐ REJECT |
| 2 | TBK100 allocation order | `tbk100-allocator.service.ts` — masraf→fer'i→faiz→anapara sırası (önceki hatalı "faiz-önce" sırasından düzeltilmiş). **R2 (961bbaf3):** cent-normalizasyon eklendi (float-dust riski giderildi). **R3:** negatif ödeme guard'ı eklendi | VERIFIED | ☑ ACCEPT ☐ REJECT |
| 3 | Reversal netting (PR-1A/1B) | `case-balance.service.spec.ts`, `'CCB-001 PR-1B'` testleri, ADR-012 ile aynı commit (`be9c0c90`) | VERIFIED | ☑ ACCEPT ☐ REJECT |
| 4 | NO_BUCKETS fail-closed (PR-2) | `case-balance.service.ts` (`CaseBalanceSkipReason='NO_BUCKETS'`, `NO_BUCKETS_FOR_PAYMENT_CURRENCY`) — **salt-okunur display/hesaplama motorunda**, merge-base'de (CCB-001 öncesi) zaten mevcut. **Netleştirme (2026-07-09, GO-ANALYZE "Payment Allocation Authority" turu):** Bu, ödeme para biriminin dosyadaki hiçbir `ClaimItem` bucket'ına eşleşmemesi durumunda hesaplama motorunun bakiye özeti üretmeyi reddetmesidir — tahsilat girişinde kullanıcıdan bucket seçmesini istemek DEĞİL (öyle bir UI alanı yok, `CollectionModal.tsx` grep ile doğrulandı), müvekkil/ofis dağıtım kararı da DEĞİL. Ayrı, farklı bir kavramla karıştırılmamalı: write-path'teki (`summary-engine.service.ts`) `NO_CLAIM_ITEMS` guard'ı — "kalem yoksa ledger'a yazma" — CCB-001'in NO_BUCKETS'ından bağımsız, önceden var olan bir korumadır. | VERIFIED (pre-existing), anlam netleştirildi | ☑ ACCEPT (revize açıklamayla) ☐ REJECT |
| 5 | Fee projection | `case-balance-fee-projection.ts` + spec PASS | VERIFIED (kod+test), adapter kontratı gevşek tip (`unknown`) | ☑ ACCEPT ☐ REJECT — *Covered by the overall SIGNED_OFF_WITH_CONDITIONS decision. No separate owner decision was recorded for this individual item.* |
| 6 | Snapshot/trace (AllocationLog dahil) | `case-balance-snapshot.ts`, `CalculationAllocationTrace`, `calculationTrace` — ephemeral (kalıcı değil) | VERIFIED işlevsel olarak; **kalıcılık YOK** — bkz. Bölüm 6 | ☑ ACCEPT (inherited-risk olarak, Koşul 1) ☐ REJECT |
| 7 | Adapter output | `case-calculation-summary.adapter.ts`, production path'e wired, test PASS | VERIFIED | ☑ ACCEPT ☐ REJECT |
| 8 | UI switch | `HesapOzetiPanel.tsx` — guarded-primary-pilot koşullu mantığı tamamen kaldırılmış, koşulsuz canonical | VERIFIED (tam geçiş) | ☑ ACCEPT ☐ REJECT |
| 9 | Legacy fallback removal | `getCalculationSummary()` legacy fallback yok, `ServiceUnavailableException`. **R1 (961bbaf3):** main'de zaten kapalı `FIN-TBK100-DI-001` (TBK100AllocatorService DI export eksikliği) bu branch'e forward-port edildi — gerçek tahsilat yolu artık bu branch'te de canonical TBK100 sırasını kullanıyor | VERIFIED (kaldırılmış + DI-eksikliği giderildi) | ☑ ACCEPT — bkz. Bölüm 5 |
| 10 | Golden fixture kapsamı | 13 senaryo (Bölüm 2) | Test-PASS; hukuki kapsam yeterliliği reviewer kararına açık | ☑ ACCEPT ☐ EKSİK SENARYO VAR: _______ |
| 11 | Merge readiness (main-divergence) | Kod dosyalarında main ile 0 dosya-seviyesi çakışma; yalnız `product-backlog.md` çakışması (bu belgenin kapsamı dışı, ayrı ele alınacak) | VERIFIED (düşük risk) | ☑ ACCEPT — *Covered by the overall SIGNED_OFF_WITH_CONDITIONS decision. No separate owner decision was recorded for this individual item.* (İlgili `product-backlog.md` çakışması Bölüm 7 Koşul 3'te owner tarafından ayrıca ele alınmıştır.) |
| 12 | Payment Allocation Authority Separation | Bölüm 4 — CCB-001 = calculation-only, allocation-yazımı SummaryEngine'de, dağıtım CollectionDisposition'da | VERIFIED (kod+governance kanıtı) | ☑ ACCEPT — bkz. Bölüm 4, duplicate-TBK100 bulgusu Koşul 2'ye bağlı |

---

## 4. Payment Allocation Authority Separation

**Bulgu (GO-ANALYZE ile doğrulandı, 2026-07-09 — "Payment Allocation Authority / CCB-001 Sign-off Reconciliation" turu):** CCB-001'in ödeme tahsis (allocation) otoritesi yoktur — yalnız hesaplama otoritesi vardır.

- Ödeme kaydı anındaki yasal alacak dağıtımı (legal debt allocation), mevcut, onaylı TM3 mimarisi altında çalışan **`SummaryEngineService` write-path'i** tarafından yapılır (`allocatePaymentToLedgerInTx()` → `LedgerEntry`+`LedgerAllocation` yazımı, `CollectionService.create()` ile aynı transaction).
- **CCB-001, hiçbir zaman ödeme tahsisi oluşturmaz, mutasyona uğratmaz veya kalıcı hale getirmez.** `case-balance.service.ts` / `allocation-engine.service.ts` / `tbk100-allocator.service.ts` içinde `.create(`/`.update(`/`.upsert(`/`prisma.` — sıfır eşleşme (doğrulandı); bu üç dosya salt-okunur.
- CCB-001 yalnız zaten kaydedilmiş yasal gerçeklerden (`ClaimItem`, `LedgerEntry`, `Collection` — `computeCaseBalance()`'ın kendi kod yorumuyla "READ-ONLY okumalar") bakiyeyi **türetir ve görüntüler**.
- Müvekkil/ofis dağıtımı (client/office distribution) **yalnız ve tamamen `CollectionDisposition`'da** kalır — `docs/governance/dbind-financial-authority-decisions.md` §3-4 gereği onay-kapılı (`recommend → approval → post`), CCB-001 bu domain'e hiç girmez (branch diff'inde `collection`/`CollectionDisposition`/`client-settlement` dosyalarına dokunuş yok).

**Kanıt tabanı:** `docs/finance/tm3-collection-disposition-boundary.md` (ONAYLANDI 2026-06-26, invariant #7: "Legal allocation ≠ müvekkil/ofis dağıtımı"), `docs/governance/dbind-financial-authority-decisions.md` (ONAYLANDI 2026-07-04, §3-4), doğrudan kod incelemesi (`case-balance.service.ts`, `allocation-engine.service.ts`, `tbk100-allocator.service.ts`, `summary-engine.service.ts`, `CollectionModal.tsx`).

**Bilinen ilgili ama ayrı risk (bu belgenin kapsamı dışı):** Sistemde TBK100 sırasını hesaplayan iki bağımsız implementasyon vardır — `SummaryEngineService`'in kendi private `allocateWithTBK100()`/`allocateLegacy()` metodları (write-path) ve CCB-001'in `interest-engine/allocation/*`'ı (display-path). Bunlar aynı kodu paylaşmaz. Bu bir CCB-001 sign-off blocker'ı değildir — canonicalization/duplicate-implementation-consistency kapsamına giren, ayrı bir governance kaydı (potansiyel yeni CAN-* maddesi) gerektiren bir bulgudur. Bu belge bu konuda yeni bir governance kararı AÇMAZ, yalnız bulguyu kayda geçirir.

**Owner/Avukat onayı gerekiyor:** Bu otorite ayrımı (CCB-001 = hesaplama-only, SummaryEngine = allocation-yazımı, CollectionDisposition = müvekkil/ofis dağıtımı) doğru ve yeterli mi?

☑ EVET, bu ayrım doğru ve CCB-001 sign-off açısından yeterli.
☐ HAYIR — ek netleştirme/değişiklik gerekiyor (gerekçe: _______________).

**Owner notu (2026-07-09):** Duplicate TBK100 implementation bulgusu (yukarıda "Bilinen ilgili ama ayrı risk") ayrı bir CAN/backlog maddesi olarak değerlendirilecek — bkz. Bölüm 7, Koşul 2. Bu belge o maddeyi AÇMAZ, yalnız takip yükümlülüğünü kayda geçirir.

---

## 5. Legacy Removal Ratification

Legacy `getCalculationSummary` (satır-içi, `faiz=0` stub hesaplama) artık üretim otoritesi olarak **tamamen kaldırılmıştır** — `case.service.ts`'de fallback yolu yoktur, canonical servis kullanılamazsa istek `ServiceUnavailableException` ile başarısız olur.

**Owner/Avukat onayı gerekiyor:** Legacy'nin geri-dönüşsüz şekilde üretim yolundan çıkarılmış olması kabul ediliyor mu?

☑ EVET, kabul ediyorum — legacy artık yalnız `legacy-reference/` içinde referans/tarihsel amaçlı kalır.
☐ HAYIR — legacy fallback'in geçici olarak geri eklenmesi isteniyor (gerekçe: _______________).

---

## 6. Inherited Risk Acknowledgment — Non-Persisted BalanceSnapshot / AllocationLog

**Bulgu (GO-ANALYZE ile doğrulandı):** Ne CCB-001'in `BalanceSnapshot`/`calculationTrace` mekanizması ne de legacy `getCalculationSummary` hiçbir zaman bir hesaplama anının kalıcı (persisted) kaydını tutmuştur. Legacy'de snapshot/hash kavramı hiç yoktu; CCB-001 en azından bir `inputHash`/`balanceSnapshotId` üretiyor ama bunu hiçbir yere yazmıyor (ne DB modeli ne `.create()` çağrısı var). `report.service.ts`/`template-engine.service.ts` (hukuki belge üretimi) bu hesaplamayı her belge üretiminde taze olarak tekrar yapıyor.

**Sınıflandırma:** `NON-BLOCKING FOLLOW-UP` — owner tarafından teyit edildi (2026-07-09). CCB-001 bu riski yaratmamıştır, kötüleştirmemiştir; sistem bu riski her zaman taşımıştır.

**Owner tarafından onaylanacak metin:**

> Neither the legacy `getCalculationSummary` nor CCB-001's canonical pipeline persists a point-in-time calculation snapshot for generated legal documents (report/template). This is a **pre-existing gap unchanged by CCB-001** — CCB-001 additionally computes (but does not yet store) a `balanceSnapshotId`/`inputHash` fingerprint, which legacy never had. Owner acknowledges this inherited risk and treats it as a **separate, non-blocking follow-up** (persisted `BalanceSnapshot` model + write-on-document-generation), independent of CCB-001 merge readiness. This acknowledgment does NOT block CCB-001 merge.

☑ Owner bu metni aynen onaylıyor.
☐ Owner farklı bir karar veriyor: _______________________________________________

**Owner kararı (2026-07-09):** Şimdilik merge blocker değil; persisted `BalanceSnapshot`/`AllocationLog` ayrı follow-up olarak izlenecek — bkz. Bölüm 7, Koşul 1.

---

## 7. Final Verdict

**Choose exactly one — default state is PENDING, no box is pre-checked:**

☑ `SIGNED_OFF_WITH_CONDITIONS` — merge onaylanır, aşağıdaki koşullarla:

1. Persisted `BalanceSnapshot` / `AllocationLog` ayrı follow-up olarak izlenecek (merge blocker değil, bkz. Bölüm 6).
2. Duplicate TBK100 implementation riski (`SummaryEngineService` private allocator vs CCB-001 `interest-engine/allocation/*`) ayrı bir CAN/backlog maddesi olarak değerlendirilecek (bkz. Bölüm 4).
3. `product-backlog.md`'deki `ID: CCB-001` Status çakışması (main-senkron vs branch-local versiyon) merge hazırlığı sırasında çözülecek (bkz. Bölüm 8).

☐ `SIGNED_OFF` — merge onaylanır, koşulsuz.
☐ `REVISION_REQUIRED` — aşağıdaki madde(ler) düzeltilmeden merge onaylanmaz: _______________________________
☐ `BLOCKED` — owner/Avukat arasında çözülmemiş anlaşmazlık var: _______________________________

**Şu anki durum: `SIGNED_OFF_WITH_CONDITIONS`** — yukarıdaki 3 koşul karşılanmadan/izlenmeden gerçek CCB-001 merge işlemi başlatılmaz. Bu, teknik/hukuki içeriğin owner tarafından kabul edildiği anlamına gelir; merge'in kendisi ayrı bir GO-COMPLETE gerektirir.

**Reviewer(s):** Ulaş Hüseyin Telli (Owner) **Tarih:** 2026-07-09

---

## 8. Evidence Appendix — Kapsam Dışı Bırakılan Madde

`product-backlog.md`'deki `ID: CCB-001` Status satırı çakışması (main'in main-senkron versiyonu ile bu branch'in branch-local versiyonu arasında) **bu belgenin kapsamı dışıdır** — talimat gereği bu turda çözülmemiştir, ayrı bir GO-IMPLEMENT gerektirir.

Bu belgenin dayandığı tüm teknik bulgular, bu konuşma oturumunun önceki GO-ANALYZE turlarında (Session Initialization, Holistic Verification Checklist, AllocationLog Gap Scope, Legacy Snapshot Risk Comparison) üretilmiştir; burada tekrar üretilmemiş, yalnız konsolide edilmiştir.

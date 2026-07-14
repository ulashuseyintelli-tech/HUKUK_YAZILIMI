# BORÇLU PLATFORMU — Phase 0 Completion Roadmap

```text
Belge yolu : project/docs/governance/DEBTOR-PHASE-0-COMPLETION-ROADMAP.md
Durum      : CANONICAL / PHASE 0 CLOSED
Rol        : Phase 0 boyunca yapılan audit, governance, owner kararları, foundation
             geliştirmeleri, operational gate ve Wave 0 kapanışının tek kanonik sentezi.
             Yeni implementasyon/PR dizisi yetkilendirmez; Blueprint açmaz.
Owner yetkisi: OWNER GO-DOCS (2026-07-14) — "Phase 0 Completion Roadmap"
```

## RELATED DOCUMENTS

- `project/docs/governance/decision-log.md` — kronolojik karar kaydı (bu belgenin tüm PR/SHA
  alıntılarının birincil kaynağı)
- `project/docs/governance/product-backlog.md` — Product Backlog / Master Register
- `project/docs/analysis/debtor-master-synthesis-v2.md` — kanıt/gerekçe katmanı (GATE-0/1/2
  ve Wave tanımlarının kaynağı, Section R/AE/Y)
- `project/docs/design/legal-time-authority-rebase.md` — MPB-028(a) tasarım belgesi (PR-1..PR-6)
- `project/docs/governance/DEBTOR-GOVERNANCE.md` — ratifiye Debtor Domain Law
- `project/docs/governance/maintenance-register.md` — worktree/cleanup kayıtları (MR-007, MR-055, MR-056 vb.)

---

## 1. Phase 0 Purpose

Phase 0, BORÇLU PLATFORMU programının **Wave 0 — Production / Legal / Security Foundation**
aşamasının tamamını kapsar. Amacı `debtor-master-synthesis-v2.md` Section AE/Y'de tanımlanan
hedeflerdir: *"tenant-leak=0 + mock-legal-write=0 + kanonik süre + demo temizliği"*. Bu, borçlu
modülünün üç doğrulanmış P0 güvenlik/hukuki-doğruluk bulgusunu (tenant izolasyonu, mock
legal-write, süre otoritesi) kalıcı olarak kapatmak ve bunun üzerine hukuki süre hesabının
kanonik bir kaynağa (NotificationQueue'dan Tebligat'a) rebase edilmesi için gerekli minimum
foundation'ı kurmak amacıyla tasarlanmıştır.

## 2. Starting State

Phase 0'ın başlangıç noktası, borçlu modülü master audit'inde (GO-ANALYZE, 2026-07-10) tespit
edilen üç CONFIRMED P0 bulgusuydu (`debtor-master-synthesis-v2.md` Section E, FND-01/02/03):

- **FND-01** — Tenant tek-savunma: `RiskService`/`AiService`/`NotificationService` cross-tenant
  veri sızıntısına açıktı (yalnız `caseId` ile sorgu, `tenantId` kontrolsüz).
- **FND-02** — Mock legal-write: `uets.service.ts`/`scheduler.service.ts` gerçek PTT/UETS
  entegrasyonu olmadan `Math.random()`/sabit-başarı ile sahte tebliğ sonucu üretip
  `CaseDebtor.serviceStatus`'a yazıyordu.
- **FND-03** — Süre otoritesi non-canonical: kesinleşme/itiraz süresi hesabı
  `NotificationQueue.deliveredAt`'ten geliyordu; kanonik kaynak (`Tebligat.tebligSayilmaDate`)
  hiç kullanılmıyordu.

Ek olarak FND-04 (guard'sız otomatik aşama geçişi, P1) ve FND-05 (demo UI, P2) de kayıtlıydı.

## 3. Completed Foundations

Tüm maddeler PR numarası + squash-merge SHA ile doğrulanmıştır (kaynak: `decision-log.md`,
`product-backlog.md`).

| # | Madde | PR | Squash SHA | Tarih |
|---|---|---|---|---|
| 1 | **MPB-028** — Tenant izolasyonu + mock legal-write containment + demo FE karantina | #1027 | `612eede9c8a9d0e6f1eedbda921add647924109c` | 2026-07-10 |
| 2 | **LEGAL-TIME-AUTHORITY-REBASE PR-1** — Amended Design Specification (docs-only) + `tebligat.service.ts` TK 21/2 hata düzeltmesi (Madde 20 ≠ Madde 21/1/21/2 ayrımı, birincil kanun metniyle doğrulandı) | #1034 | (docs-only, ayrı SHA kaydı yok — squash commit kaydı `decision-log.md`'de) | 2026-07-10 |
| 3 | **MPB-028(a) PR-2** — `LegalDeadlineService`/`LegalDeadlineSnapshot` foundation + blocker resolution (objection period parametre girdisi, TK m.20 üretim yolu) | #1185 | `94cf35f1d59aa0e3e85b6b1f2c13b6aaae83c635` | 2026-07-13 |
| 4 | **MPB-028(a) PR-3A** — Shadow Read + Diff Engine (`LegalTimeShadowDiff`, flag varsayılan kapalı) | #1192 | `e22777c66d98bc0d069629a07baf7cf0b13f9c41` | 2026-07-13 |
| 5 | **MPB-028(a) PR-3B** — Evidence Activation (DI runtime kaydı, `LegalTimeShadowController`, local evidence procedure runbook) | #1198 | `6b07bd096dc4096ef5328cb8fa2bb1eaf6b54696` | 2026-07-13 |
| 6 | **Owner Decision 3 docs update** — Canonical Legal Time Model kararının tasarım belgesine işlenmesi + Bölüm 7 PR sıralaması güncellemesi (docs-only) | #1205 | (docs-only) | 2026-07-13 |
| 7 | **MPB-028(a) PR-3C** — Canonical Proceeding-Type and Legal-Period Rule Matrix (`ProceedingType`/`RentalType`/`BankruptcyType`/`JudgmentExecutionType`/`NextActionType` additive enum'lar, `legal-period-rule-matrix.ts`, `ProceedingClassificationService`, `LegalPeriodCalculationService`) | #1212 | `e39ce54c51af9ab35123c39e9913c6f51b8e4db3` | 2026-07-13 |
| 8 | **GATE-1 CI Tenant-Isolation Regression Coverage** — 18 Borçlu Wave 0 tenant-boundary test dosyasının CI'a (`.github/workflows/ci.yml`) bağlanması | #1174 | `e27f5f3cb9b57b66444f5214530b2fe1b2fc13aa` | 2026-07-13 |
| 9 | **MPB-028(a) PR-4** — Consumer-by-Consumer Read-Only Cutover (`DebtorService`, `finalizationRequestEligibleDate`/`finalizationEligibilitySource`) | #1228 (+ governance closure #1232) | `78013f74ead639231304239740529d60b2594bfb` (+ `40ea3a315d518d928de3ce9e9d179e873c4568b9`) | 2026-07-14 |
| 10 | **MPB-028(a) PR-5** — WorkflowEngine Canonical Legal-Time Switch (`calculateNextActionTime`, dar kapsam) | #1235 (+ governance closure #1237) | `71ee4d642b61e18ba696442ab22f50ffed3e60ee` (+ `e9c126e040975119630d15207cc9dde3870d3e5f`) | 2026-07-14 |
| 11 | **Wave 0 Exit Review + Owner Wave Decision** — CLOSED/OWNER-RATIFIED, GATE-0/1/2 PASS | #1240 | `12265269ad66b4ad15172a9c8f8cbf65a94dbb16` | 2026-07-14 |

## 4. Canonical Owner Decisions

Bu bölüm, Phase 0 boyunca alınan ve gelecekteki çalışmayı bağlayıcı şekilde çerçeveleyen owner
kararlarını konu başlıklarına göre gruplar (kaynak: `decision-log.md`, `legal-time-authority-rebase.md`
Bölüm 6/6A).

**Tenant isolation / mock legal-write (MPB-028):**
- Bu ürün tercihi değil, güvenlik ve hukuki doğruluk gereğidir — owner kararı beklenmeden
  GO-IMPLEMENT'e açıldı.

**Legal-time authority (Owner Decision 1-6, `legal-time-authority-rebase.md` Bölüm 6):**
- Kanonik takip-tipi gün tablosu icrabot'un 6 kırılımını esas alır.
- `Case.nextActionAt` hukuki deadline alanı olarak KULLANILMAZ (yalnız operasyonel scheduler
  girdisi).
- Geçmiş veriye backfill YOK; önce shadow/read-only recompute, backfill ayrı owner onayı ister.
- Rollout feature-flag (`LEGAL_TIME_CUTOVER`) ile kademeli.
- `LegalServiceDate` ve `FinalizationDate` AYRI kavramlardır, birbirine karıştırılmaz.
- `NotificationQueue.deliveredAt` bundan böyle hiçbir hukuki süre hesabının girdisi DEĞİLDİR
  (yalnız legacy fallback olarak PR-4/PR-5'te bilinçli korunur).

**Owner Decision 3 — Canonical Legal Time Model (`legal-time-authority-rebase.md` Bölüm 6A):**
- "Proceeding Type ≠ Instrument Type" temel ilkesi: kambiyo tek hukuki takip yolu, çek/bono/
  poliçe ayrı belge türleridir (`CaseInstrument[]` modeli korunur, yeni `InstrumentType`
  enum'ı KURULMADI).
- `PLEDGE`/`MORTGAGE`/bağımsız `EVICTION`/`PUBLIC_RECEIVABLE` bilinçli olarak UNRESOLVED
  bırakıldı — doğrulanmamış süre kuralı eklenmedi.

**PR-4 legal semantics revizyonları (owner'ın birden fazla kez daralttığı scope):**
- `nextActionEligibleDate`, `finalizationDate` olarak YAYIMLANMAZ.
- `finalizationDate` LEGACY COMPATIBILITY alanıdır — GERÇEK bir kesinleşme olgusu değildir,
  hiçbir canonical hesapla DOLDURULMAZ, flag'den bağımsız kalır.
- İtiraz/durdurucu-etki fact'i repoda kanonik olarak BULUNAMADIĞI için (kapsamlı araştırmayla
  kanıtlandı) gerçek `finalizationDate` veya `enforcementCapabilityStatus` ÜRETİLMEZ.
- UI flag açıkken "Kesinleşti"/"Kesinleşme tarihi" hükmünü ASLA göstermez.

**PR-5 scope daraltması (owner'ın iki kez daralttığı scope):**
- PR-5 YALNIZ `WorkflowEngine.calculateNextActionTime` kapsamındadır.
- `NotificationService.getPaymentDeadline` gerçek consumer'ı olmadığı için kapsam dışı
  bırakıldı.
- `NotificationQueue` KALDIRILMAZ, yalnız legacy fallback olarak kalır.
- `RuleEngine.checkNotificationExpiry`/Scheduler'ın otomatik `ENFORCEMENT` geçişi/MTS'e hiç
  dokunulmadı.

**Wave 0 kapanış kararı (GATE-2 dar kapsam — owner-override):**
- GATE-2, bu Wave 0 kapanışı bakımından yalnız *"kanonik tebliğ/süre otoritesinin kurulması +
  shadow evidence + kanonik takip/süre matrisi + read-path consumer cutover + WorkflowEngine
  süre kaynağı geçişi"* ile SINIRLIDIR.
- `debtor-master-synthesis-v2.md` Section R/AE'deki geniş "GATE-2 = EPIC-02/06 merged" okuması
  bu kapanış kararı bakımından SUPERSEDE edilmiştir (MS metni silinmedi/değiştirilmedi).

## 5. Operational Evidence

**Representative Evidence Operational Gate** (MPB-028(a) PR-3C sonrası, PR-4 öncesi):
disposable Docker Postgres container'da 12 temsili senaryo oluşturuldu (gerçek/tüzel kişi
alacaklı/borçlu, kamu kurumu, çek, bono, ilamsız, kira, tahliye, ipotek, rehin); shadow
hesaplama (PR-3B, `LegalTimeShadowService`) ile canonical period hesaplama (PR-3C,
`LegalPeriodCalculationService`) TAM eşleşme gösterdi. Container iş bitince temizlendi.
Sonuç: **DELIVERED**.

**CI regression coverage:** GATE-1 (PR #1174) ile 18 Borçlu Wave 0 tenant-boundary test
dosyası `.github/workflows/ci.yml`'e bağlandı; GitHub Actions log'unda "Test Suites: 13
passed, 13 total" ve "Test Suites: 5 passed, 5 total" ile doğrulandı, out-of-scope dosya
seçimi sıfırdı.

**PR-2..PR-5 zincirinin toplam test kanıtı** (her kapanışta ayrı ayrı CI 4/4 SUCCESS +
canonical main == origin/main == GitHub remote main VERIFIED ile doğrulanmıştır):
PR-2 72/72, PR-3A 101/101 (PR-2 regresyonu dahil), PR-3C 118/118 unit/static + 20/20
disposable-DB (PR-2/PR-3 regresyonu dahil), PR-4 BE 10/10 unit + 6/6 disposable-DB + 219/219
debtor regresyon + FE 7/7 + 1072/1072 regresyon, PR-5 BE 9/9 unit + 5/5 disposable-DB +
100/100 automation regresyon + 74/74 legal-deadline regresyon.

## 6. Deferred / Transferred Work

Aşağıdaki maddeler **silinmiş veya çözülmüş sayılmaz**; owner kararıyla Phase 0 sonrasına
taşınan açık domain workstream'leridir:

- **`Debtor.legalStatus`** (MPB-028(d), EPIC-06/DEC-07) — hiç başlamadı, kendine ait backlog
  ID'si yok, hiçbir GO-ANALYZE/GO-IMPLEMENT turu açılmadı.
- **Objection/Enforcement Capability Canonicalization** — itiraz olgusunun
  (`objectionFiledAt`/`objectionEffect`) ve cebrî icra kabiliyetinin
  (`enforcementCapabilityStatus`) kanonik fact olarak modellenmesi; PR-4/PR-5 kapanışlarında
  ayrı gelecek workstream olarak kaydedildi.
- **`finalizationRequestStatus`** (müdürlük/UYAP idari teyit akışı) — ayrı workstream.
- **PR-6 (backfill)** — NOT AUTHORIZED, ayrı owner onayı ister.
- **Holiday/calendar** — Owner Decision 3'ten beri ayrı workstream (tatil/iş günü hesaplaması
  kanonik süre motoruna dahil değil).
- **Unresolved proceeding rules** — `PLEDGE`/`MORTGAGE`/bağımsız `EVICTION`/`PUBLIC_RECEIVABLE`
  bilinçli olarak UNRESOLVED (PR-3C owner kararı, doğrulanmamış süre kuralı eklenmedi).
- **`MPB-028(c)` / `ENFORCEMENT-ACTION-TENANT-CASEDEBTOR-MIGRATION`** — PARTIAL/OPEN. PR-EA-1
  (#1080), PR-EA-2 (#1085, SHA `532e67e0`), PR-EA-3A (#1090, SHA `dbae2342`), PR-EA-3A.1
  (#1100, SHA `c1ad9f55`), PR-EA-4 (#1134, SHA `bb34c17e`) CLOSED; PR-EA-3B **HOLD** (production
  ortamı yok, backfill adayı çıkmadı); PR-EA-5 (NOT NULL hardening) ve PR-EA-6 (cleanup)
  **NOT AUTHORIZED**.
- **DEBTOR-SCORING-CANON Phase 3** — consumer switch (`Case.riskScore` RETIRE) henüz
  uygulanmadı; Phase 2 (kanonik `DebtorScoringService`) CLOSED.
- **Legacy remediation** — `RuleEngine.checkNotificationExpiry` ve Scheduler'ın otomatik
  `ENFORCEMENT` geçişi hâlâ itiraz fact'i olmadan, "itiraz yapılmadı" varsayımıyla çalışıyor;
  `NotificationService.getPaymentDeadline` gerçek consumer'ı olmadığı için dokunulmadı.

## 7. Known Limitations

Bu bölüm, yukarıdaki deferred maddelerin **teknik risk profilini** açıkça kaydeder — bunlar
"iyileştirme fırsatı" değil, bilinen ve owner tarafından kabul edilmiş açık risklerdir:

- Scheduler'ın `checkPaymentOrderDeadlines`/`processExpiredPaymentOrder` metodu, itiraz
  kontrolü YAPMADAN, yalnız süre geçtiği için `workflowStage=ENFORCEMENT`'a otomatik geçiş
  yapmaya ve DecisionLog'a "itiraz yapılmadı" sabit gerekçesini yazmaya devam ediyor. PR-5
  yalnız bu geçişin TARİH KAYNAĞINI (bazı case'lerde) kanonikleştirdi, KARAR MEKANİZMASINI
  değiştirmedi.
- `Debtor.legalStatus` alanı modellenmediği sürece, iflas/konkordato gibi hukuki durumların
  risk skorlamasına doğru yansıtılması mümkün değildir (`extractRiskFlags` var olmayan
  alanları okuyor).
- MPB-028(c)'nin NOT NULL hardening'i (PR-EA-5) yapılmadığı sürece `EnforcementAction.tenantId`/
  `caseDebtorId` şema seviyesinde zorunlu değildir (yalnız guarded write-path ile korunuyor).
- `PLEDGE`/`MORTGAGE`/bağımsız `EVICTION`/`PUBLIC_RECEIVABLE` takip türlerinde kanonik süre
  motoru UNRESOLVED döner; bu türlerdeki dosyalar flag açık olsa bile legacy fallback'e düşer.

## 8. Blueprint Inputs

Blueprint (Phase 1 mimari tasarımı) aşağıdaki kurulmuş girdilerden başlayabilir — bu bir
tasarım kararı değil, mevcut envanterdir:

- Kanonik `LegalPeriodCalculationService.computeCanonicalLegalPeriod` API'si (PR-3C):
  `{tenantId, tebligatId, caseId, callerSuppliedPerformanceDays?}` → `RESOLVED`/`UNRESOLVED`.
- `LEGAL_TIME_CUTOVER` feature-flag deseni (opsiyonel-DI + fail-closed fallback), PR-4/PR-5'te
  iki kez tekrarlanmış, kanıtlanmış bir entegrasyon şablonu.
- `ProceedingType`/`RentalType`/`BankruptcyType`/`JudgmentExecutionType`/`NextActionType`
  additive enum seti ve `legal-period-rule-matrix.ts` tek merkezli kural tablosu.
- FACT/GATE mimari vizyonu (owner, PR-4 sürecinde kaydedildi): FACTS (serviceStatus/
  objectionStatus/objectionFiledAt/objectionEffect/enforcementCapabilityStatus) arka planda
  tutulur; GATES yalnız hukuki sonuç doğuran işlemlerde kontrol edilir; fact eksik/çelişkiliyse
  fail-closed.
- Disposable Docker Postgres + representative-scenario evidence deseni (Operational Gate'te
  kanıtlanmış, tekrar kullanılabilir bir doğrulama prosedürü).

## 9. Phase 1 Entry Criteria

Wave 0'ın CLOSED/OWNER-RATIFIED olması, **Phase 1 Blueprint'in açılabilir olduğu** anlamına
gelir — otomatik olarak açıldığı anlamına GELMEZ. Blueprint açılmadan önce owner'ın ayrıca:

1. Hangi deferred workstream'in (Objection/Enforcement Capability, `Debtor.legalStatus`,
   MPB-028(c) kalanı, müdürlük/UYAP) Phase 1'in kapsamına gireceğini belirlemesi,
2. Blueprint'in kendi GO-DOCS/GO-ANALYZE yetkisini vermesi

gerekir. Bu belge bu iki adımdan hiçbirini yerine getirmez.

## 10. Phase 0 Final Verdict

**PHASE 0 COMPLETION ROADMAP: CLOSED.** Wave 0 (Production/Legal/Security Foundation) owner
tarafından 2026-07-14 tarihinde CLOSED/OWNER-RATIFIED ilan edildi (`decision-log.md` aynı
tarihli kayıt, PR #1240). `GATE-0: PASS`, `GATE-1: PASS`, `GATE-2: PASS — PHASE 0 NARROW
LEGAL-TIME SCOPE`. Yukarıdaki Deferred/Transferred Work ve Known Limitations bölümlerindeki
hiçbir madde bu verdict'i geçersiz kılmaz — bunlar owner tarafından bilinçli olarak Phase 0
kapsamı dışında bırakılmıştır.

**PHASE 1 BLUEPRINT: ELIGIBLE BUT NOT OPENED.**

---

**WAITING FOR OWNER AUTHORIZATION.**

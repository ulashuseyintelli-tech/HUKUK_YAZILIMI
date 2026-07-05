# ALC-AUTH-4A Display Authority Reconcile

## Guarded Primary Balance Display — İki Governance Hattının Birleştirilmesi

**Tarih:** 2026-07-05 · **Statü:** RATIFIED (owner, 2026-07-05 — bkz. Bölüm 11) · **Yetki:** Bu belge, guarded primary balance display (canonical vs legacy `HesapOzetiPanel` gösterimi) konusunda o güne kadar birbirinden habersiz ilerlemiş iki governance hattının kanonik reconciliation kaydıdır. Kod değişikliği YAPILMAZ, feature flag AÇILMAZ, rollout BAŞLAMAZ.

---

## 1. Scope

Bu belge üç girdiyi tek bir sonuca bağlar:

1. ALC-AUTH-4A GO-ANALYZE (chat, 2026-07-05) — sign-off contract, UI copy taslağı, checklist, pilot acceptance criteria.
2. `docs/audit/` altındaki 8 dosyalık paralel guarded-primary rollout denetim seti (repo kökünde, `project/` dışında).
3. `project/docs/governance/` ALC-AUTH-* zinciri (`product-backlog.md`, `decision-log.md`, `master-triage-register.md`).

Kapsam dışı: kod değişikliği, migration, feature flag açma, rollout başlatma, `ALC-AUTH-4A-IMPL` implementasyonu. Bu belge yalnız NEREDE ANLAŞMA, NEREDE BOŞLUK, NEREDE DRIFT olduğunu kayıt altına alır.

---

## 2. Evidence Sources

**Kod (bu oturumda doğrudan okundu):**
- `apps/web/src/lib/guarded-primary-display.ts`
- `apps/web/src/lib/balance-shadow-display.ts`
- `apps/web/src/lib/config/feature-flags.ts`
- `apps/web/src/components/finance/HesapOzetiPanel.tsx`
- `apps/web/src/components/finance/BalanceShadowDiffPanel.tsx`
- `apps/web/src/__tests__/balance-shadow-display.test.tsx`
- `apps/api/src/modules/balance-display-shadow-diff/balance-display-shadow-diff.types.ts`
- `apps/web/src/app/(dashboard)/cases/[id]/page.tsx` (wiring)

**`docs/audit/` seti (repo kökü, 8 dosya, tamamı bu oturumda okundu):**
- `DISPLAY-AUTHORITY-AUDIT.md`
- `CUTOVER-BLOCKER-REMEDIATION-PLAN.md`
- `SHADOW-DIFF-READINESS-AUDIT.md`
- `GUARDED-PRIMARY-CUTOVER-SCOPE-FREEZE.md`
- `GUARDED-PRIMARY-PILOT-ROLLOUT-CHECKLIST.md`
- `OVERPAYMENT-DISPLAY-WORDING-SIGNOFF.md`
- `PRIMARY-CUTOVER-READINESS-REFRESH.md`
- `PRIMARY-ELIGIBLE-FIXTURE-DESIGN.md`

**Governance (`project/docs/governance/`):**
- `product-backlog.md` — ALC-AUTH-1/1A/1B/1C/3B/3C/3D/3E kayıtları.
- `decision-log.md` — 2026-07-04/05 ALC-AUTH satırları.
- `master-triage-register.md` — ACT-27/ACT-28 cross-reference notları.

---

## 3. Two Governance Tracks

İki hat, aynı kodu, aynı zaman diliminde, birbirinden habersiz izlemiş:

| `docs/audit/` hattı (issue#/CB-#) | `project/docs/governance/` hattı (ALC-AUTH-*) |
|---|---|
| #417 Display Authority Audit | ALC-AUTH-1 kök-neden analizi (en yakın karşılık) |
| #420 backend contract, #425 shadow-diff endpoint, #429 opt-in UI | balance-display-shadow-diff modülü (ayrı PR geçmişi) |
| #432 Shadow Diff Readiness Audit | (karşılığı yok) |
| #435 → CB-01..CB-11 Cutover Blocker Remediation Plan | ALC-AUTH-1/1A/1B/1C |
| CB-05/CB-06 Overpayment wording sign-off | (karşılığı yok — overpayment ALC-AUTH hattında hiç işlenmedi) |
| #458 Guarded Primary Cutover Scope Freeze | ALC-AUTH-3D |
| #460 Guarded Cutover Eligibility Evidence Pack | ALC-AUTH-3D/3E testleri |
| Rollout Checklist §7.8 | ALC-AUTH-3E |
| Primary Eligible Fixture Design | (karşılığı yok — Bölüm 9) |

**Tek köprü:** commit `2fe55ad0` (owner, 2026-07-05) — yalnız 2 dosyayı (`GUARDED-PRIMARY-*`) ALC-AUTH-3D/3E SHA'larıyla senkronize etti. Tek yönlü, manuel, tek seferlik. Ters yön (product-backlog.md'nin CB-#/issue-# referans vermesi) hiç olmadı.

---

## 4. Reconciliation Result

Alt-satır (bottom-line) governance kararında **çelişki yok**. Sekiz `docs/audit/` dosyasının TAMAMI ve `product-backlog.md`'nin ALC-AUTH-3E kapanışı aynı sonuca varıyor:

- Global primary cutover: **NO-GO**
- Guarded eligible-subset pilot: **CONDITIONAL / LIMITED GO**
- Feature flag + URL opt-in: **zorunlu, ikisi birden**
- Production varsayılan: **KAPALI**
- Legacy `calculation-summary` fallback: **zorunlu, her koşulda korunur**

İki hat farklı kelime/numaralandırma kullanıyor ama aynı teknik gerçeği anlatıyor. Fark, PAPER TRAIL'de (kim neyi nerede kaydetmiş) — karar özünde değil.

---

## 5. Confirmed Stop Condition

```text
ALC-AUTH guarded-primary pilot, kısmi canonical / kısmi legacy durumu UI'da
açıkça görünmeden tenant-wide / default-on / lawyer sign-off aşamasına geçemez.
```

Bu LOCK, owner tarafından 2026-07-05'te teyit edildi ve bu belgeyle kalıcı hale getirilmiştir.

---

## 6. Partial Canonical / Partial Legacy Display Risk

**Mekanizma (kod-doğrulanmış):** `guarded-primary-display.ts:348-352`'deki `hasCostOrAttorneyFeeUnderstatementRisk()`, `report.totals.diffs`'te `COSTS_DELTA`/`ATTORNEY_FEE_DELTA` `severity==='RED'` ise `buildGuardedPrimaryCalculationResult()`'ta (`:364-381`) yalnız `toplamBorc`/`sonBorc`/`kalanBorc`'u legacy'de bırakır; diğer 5 alan (`asilAlacak`/`takipTutari`/`takipSonrasiFaiz`/`toplamTahsilat`/`kalanAnapara`) canonical kalır.

**Kopukluk:** Bu suppress kontrolü `evaluateGuardedPrimaryDisplayPilot()`'un `reasonCodes`'una YANSIMAZ (ayrı fonksiyon, ayrı hesap). Sonuç: `HesapOzetiPanel.tsx:206-228`'deki banner "Guarded canonical primary candidate" / "ELIGIBLE" gösterirken, panelin en öne çıkan 3 rakamı (`:278-310`, TOPLAM BORÇ/SON BORÇ/KALAN BORÇ) sessizce legacy'dir — sıfır görsel ayrım, sıfır kod-seviyesi sinyal.

**Test kapsamı:** `balance-shadow-display.test.tsx:556-635` bu senaryoyu yalnız DEĞER seviyesinde doğruluyor (doğru sayı döndüğünü test ediyor); banner/UI metnini bu senaryoda HİÇ doğrulamıyor (grep-doğrulandı, sıfır assertion).

**Bu risk `docs/audit/` setinde HİÇ ele alınmamış** — bkz. Bölüm 7.

---

## 7. docs/audit Findings

| Dosya | Ana içerik | Stop condition'ı ele alıyor mu? |
|---|---|---|
| `GUARDED-PRIMARY-CUTOVER-SCOPE-FREEZE.md` | §4/§7/§10: ALC-AUTH-3E field-level fallback kuralını DEĞER seviyesinde tanımlar, evidence-pack/checklist maddesi olarak ekler. | **Hayır.** Yalnız "doğru sayı mı" sorusu; "kullanıcı görebiliyor mu" sorusu yok. |
| `GUARDED-PRIMARY-PILOT-ROLLOUT-CHECKLIST.md` | §7.8: Cost/Attorney-Fee Understatement Smoke — aynı senaryo için smoke-test tanımı; §9 rollback trigger'ı da değer-regresyonu üzerine kurulu. | **Hayır.** Aynı gerekçe. |
| `OVERPAYMENT-DISPLAY-WORDING-SIGNOFF.md` | CB-05/CB-06: HELD/OVERPAYMENT_BLOCKED için gerçek bir UI-wording sign-off metodolojisi VAR (§8-9 wording matrisleri). | **Hayır**, kapsamı yalnız overpayment; cost/attorney-fee için hiç CB-numarası açılmamış (kendi taksonomilerinde de boşluk). |
| `CUTOVER-BLOCKER-REMEDIATION-PLAN.md` | #432 sonrası CB-01..CB-11 iş paketleri; "UI wording / legal sign-off" kategorisi VAR ama yalnız CB-01 (principal-unavailable) + CB-05/CB-06 (overpayment) için açılmış. | **Hayır**, kategori var ama cost/attorney-fee için hiç örneklenmemiş. |
| `DISPLAY-AUTHORITY-AUDIT.md` | #417, en temel doküman: `HesapOzetiPanel` = saf legacy tespiti (R1, RED). | **Hayır**, ve ayrıca kendisi artık drift'li (bkz Bölüm 10). |
| `PRIMARY-CUTOVER-READINESS-REFRESH.md` | #432 sonrası özet; guarded eligible subset kriterleri. | **Hayır**, değer/eligibility odaklı. |
| `SHADOW-DIFF-READINESS-AUDIT.md` | #432: 18 senaryolu classification matrisi; S03 (masraf/vekalet) `EXPECTED_CANONICAL_DIFF`/YELLOW olarak işaretli ama izole bir blocker değil. | **Hayır**. |
| `PRIMARY-ELIGIBLE-FIXTURE-DESIGN.md` | En güncel dosya; fixture tasarımı + KRİTİK açık soru (bkz Bölüm 9). | **Hayır** (farklı bir açık soru taşıyor). |

**Sonuç:** 8 dosyanın hiçbiri UI-transparency/sign-off-authority sorusunu sormuyor. ALC-AUTH-4A'nın bulgusu gereksiz değil — bu 8 dosyanın kendi taksonomisinde de karşılığı olmayan, gerçek bir boşluğu dolduruyor.

---

## 8. ALC-AUTH Findings

Kısa recap (detay: `product-backlog.md`):

- **ALC-AUTH-1/1A/1B/1C** — canonical principal/cost/fee/payment authority gap kök-neden analizi; `totalDebtAmount` contract çakışması reconcile edildi (PR #917 kanonik kaldı).
- **ALC-AUTH-3B** — `totalDebtAmount` gross-principal plumbing (PR #917, MERGED).
- **ALC-AUTH-3C** — guard/backend blocker kopukluğu kanıtı (analiz, kod değişikliği yok).
- **ALC-AUTH-3D** — guard authority alignment; frontend artık backend `cutoverReadiness.safeForPrimaryDisplay`'e tek yerden bağımlı (PR #922+#925, MERGED/FINAL).
- **ALC-AUTH-3E** — cost/attorney-fee understatement suppress (PR #929, MERGED). "B1/guarded-primary-pilot ekseninde bilinen son blocker kapandı" notuyla kapanmıştı — bu notun "son blocker" ifadesi Bölüm 5-6'daki UI-transparency bulgusuyla artık NÜANSLI okunmalı: değer-seviyesinde son blocker doğruydu, kullanıcı-görünürlüğü seviyesinde değildi.

---

## 9. Newly Discovered Open Question: CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY

`PRIMARY-ELIGIBLE-FIXTURE-DESIGN.md` §3/§4/§11 (Risk 1): display adapter `CLAIM_ITEM_COLLECTED_AMOUNT_NOT_AUTHORITY` diagnostic'ini HER ZAMAN genel bir bilgi/guardrail sinyali olarak üretiyor ve mevcut shadow-readiness bunu blocker listesine taşıyor. Bu, gerçek veriyle `safeForPrimaryDisplay=true` elde etmeyi YAPISAL olarak imkânsız kılabilir — sorun veri eksikliği değil, sinyalin kendisinin "gerçek contamination" ile "genel bilgilendirici uyarı" arasında ayrılmamış olması.

**Bu, UI-copy meselesinden TAMAMEN AYRI, backend/display-adapter sınıflandırma sorunudur.**

**Karar:** `ALC-AUTH-4A-IMPL` scope'una DAHİL EDİLMEZ. Ayrı backlog maddesi olarak açılır: **`ALC-AUTH-3E-B-NEXT`** (bkz `product-backlog.md`).

---

## 10. Documentation Drift: DISPLAY-AUTHORITY-AUDIT.md / OVERPAYMENT-DISPLAY-WORDING-SIGNOFF.md

Her iki doküman da şu cümleyi taşıyor (özetle): *"`HesapOzetiPanel` legacy `calculation-summary`'de kalıyor, değiştirilmedi / canlı legal panel `HesapOzetiPanel` `calculation-summary` üzerinde kalır."*

Bu önerme, ALC-AUTH-3B/3D/3E (bağımsız hat) `guarded-primary-display.ts`'i fiilen `HesapOzetiPanel.tsx:166-172`'ye bağlamasından ÖNCEki mimariyi anlatıyor — kod-doğrulanmış olarak artık DOĞRU DEĞİL: guarded pilot aktifken panel `guardedPrimaryHesap`'ı gerçekten tüketiyor.

**Canlı risk yok:** overpayment senaryoları zaten guarded-eligible kapsamının dışında tutuluyor (`GUARDED-PRIMARY-CUTOVER-SCOPE-FREEZE.md` §6) — yani CB-05/CB-06 wording kurallarının pratik geçerliliği bozulmadı. Ama iki dokümanın kendi cümlesi artık yanlış.

**Karar:** `ALC-AUTH-4A-IMPL` scope'una DAHİL EDİLMEZ. Ayrı, docs-only, düşük öncelikli backlog notu: **`ALC-AUTH-DOC-REFRESH`** (bkz `product-backlog.md`).

---

## 11. Owner Locks (2026-07-05)

```text
1. Global primary cutover: NO-GO.
2. Guarded eligible-subset pilot: CONDITIONAL / LIMITED GO only.
3. Feature flag + URL opt-in zorunlu.
4. Production default: OFF.
5. ALC-AUTH-4A stop condition geçerli:
   partial canonical / partial legacy görünür değilse pilot genişletilemez.
6. ALC-AUTH-4B rollout BLOCKED.
7. ALC-AUTH-4C telemetry sonraya bırakılır.
8. PR #938 HOLD kalır; reconcile bulguları işlenmeden merge edilmez.
```

---

## 12. Implementation Preconditions (ALC-AUTH-4A-IMPL için önceden kilitlenen scope)

Bu sınır, `ALC-AUTH-4A-IMPL` GO-ANALYZE/GO-IMPLEMENT'i başladığında geçerli olacak — bu belge implementasyonu YETKİLENDİRMEZ, yalnız gelecekteki scope'u önceden kilitler:

```text
IN:
- partial canonical / partial legacy UI state
- Türkçe authority copy
- banner/reason code fix
- toplamBorc / sonBorc / kalanBorc authority visibility
- UI tests

OUT:
- backend eligibility classification
- ClaimItem contamination logic
- rollout
- telemetry
- feature flag default change
- allocation engine
- legacy calculation engine
```

`OUT` listesindeki "backend eligibility classification" ve "ClaimItem contamination logic" maddeleri, Bölüm 9'daki `ALC-AUTH-3E-B-NEXT`'in kapsamıdır — iki iş kasıtlı olarak ayrıştırılmıştır, karıştırılmamalıdır.

---

## 13. Rollout Blockers

- **ALC-AUTH-4B** (rollout planning): BLOCKED BY ALC-AUTH-4A reconciliation (bu belge — TAMAMLANDI) + ALC-AUTH-4A-IMPL (veya eşdeğer UI authority visibility fix — BAŞLAMADI) + avukat/product copy sign-off (BAŞLAMADI).
- **ALC-AUTH-4C** (telemetry/kill-switch): AFTER 4A reconciliation + 4A-IMPL + 4B rollout plan.
- **ALC-AUTH-3E-B-NEXT** (contamination/guardrail classification): BAĞIMSIZ blocker — 4A-IMPL'i beklemez, ama kapanmadan gerçek veriyle `safeForPrimaryDisplay=true` elde etmek garanti değildir.
- **ALC-AUTH-DOC-REFRESH**: bağımsız, düşük öncelikli, docs-only.

---

## 14. References

- `apps/web/src/lib/guarded-primary-display.ts`, `HesapOzetiPanel.tsx`, `BalanceShadowDiffPanel.tsx`, `feature-flags.ts`, `balance-shadow-display.ts`
- `apps/web/src/__tests__/balance-shadow-display.test.tsx`
- `apps/api/src/modules/balance-display-shadow-diff/balance-display-shadow-diff.types.ts`
- `docs/audit/DISPLAY-AUTHORITY-AUDIT.md`
- `docs/audit/CUTOVER-BLOCKER-REMEDIATION-PLAN.md`
- `docs/audit/SHADOW-DIFF-READINESS-AUDIT.md`
- `docs/audit/GUARDED-PRIMARY-CUTOVER-SCOPE-FREEZE.md`
- `docs/audit/GUARDED-PRIMARY-PILOT-ROLLOUT-CHECKLIST.md`
- `docs/audit/OVERPAYMENT-DISPLAY-WORDING-SIGNOFF.md`
- `docs/audit/PRIMARY-CUTOVER-READINESS-REFRESH.md`
- `docs/audit/PRIMARY-ELIGIBLE-FIXTURE-DESIGN.md`
- `project/docs/governance/product-backlog.md` (ALC-AUTH-1..3E, ALC-AUTH-4A/4B/4C, ALC-AUTH-3E-B-NEXT, ALC-AUTH-DOC-REFRESH)
- `project/docs/governance/decision-log.md` (2026-07-04/05 ALC-AUTH satırları)
- `project/docs/governance/master-triage-register.md` (ACT-27/ACT-28 cross-reference)

---

**GOVERNANCE NOTU:** Bu belge implementasyon yetkisi VERMEZ. `ALC-AUTH-4A-IMPL` için ayrı GO-ANALYZE, `ALC-AUTH-3E-B-NEXT` ve `ALC-AUTH-DOC-REFRESH` için ayrı owner GO-IMPLEMENT onayı gerekir.

# DEBTOR-EXTERNAL-CASE-STATUS-INTEGRITY-P1-I15-D2 — Kanonik Kontrat

**Durum:** OWNER-RATIFIED (kod haline getirildi D2-I01/D2-I02'de; bu belge D2-I03
kapsamında geriye dönük materialize edilmiştir — yeni policy ÜRETMEZ, mevcut
owner kararını ve onun kod karşılığını tek bir okunabilir yerde kayıt altına alır).

**Kapsam:** `ExternalCase.attachmentStatus` (borçlunun alacaklı olduğu dış icra
dosyasındaki haciz durumu) — provenance, geçiş yetkisi, kanıt ve terminal-durum
kuralları.

**PR zinciri:**
| İterasyon | PR | Merge SHA | İçerik |
|---|---|---|---|
| D2-I01 | #2084 | `341ce95b5b6d9c6773285f23844ce1198f2e80ce` | Şema: enum'lar + additive/nullable provenance alanları, migration, 13 disposable-DB testi |
| D2-I02 | #2088 | `0e0466bd44915c6d079b83272952fd9d20d06585` | Backend: actor-authority + CAS/lock transition servisleri, generic update'ten status ayrımı |
| D2-I03 | (bu PR) | — | Frontend enforcement + minimal read-only backend capability projection + bu kontrat |

Kod kaynağı (bu belge onlarla çelişirse KOD ESASTIR, bu belge güncellenir):
`project/apps/api/prisma/schema.prisma` (ExternalCase modeli + 3 enum, ~satır 1731-1815),
`project/apps/api/src/modules/debtor/external-case-status-authority.service.ts`,
`project/apps/api/src/modules/debtor/external-case-status-transition.service.ts`,
`project/apps/api/src/modules/debtor/dto/third-party.dto.ts`.

## 1. Beş Statünün Semantiği

| Statü | Anlam | Nasıl üretilir |
|---|---|---|
| `HACIZ_TALEP` | Haciz talep edildi (dış dosyanın başlangıç durumu) | `createExternalCase()` — DAİMA bu statüyle başlar, client seçemez |
| `CEVAP_BEKLENIYOR` | Üçüncü şahıs/icra dairesinden cevap bekleniyor | Manuel FACT/PROCESS geçişi |
| `HACIZ_KONDU` | Haciz fiilen konuldu | Manuel FACT/PROCESS geçişi |
| `TAHSIL_BASLADI` | Tahsilat başladı (kısmi) | YALNIZ SYSTEM_DERIVED — canonical Collection kaydından türetilir |
| `KAPANDI` | Dosya kapandı (terminal) | Manuel lawyer-close (4 sebep) VEYA SYSTEM_DERIVED tam tahsilat (`FULLY_COLLECTED`) |

## 2. İzinli Geçiş Matrisi

Yalnız kod içindeki `MANUAL_FACT_OR_PROCESS_TRANSITIONS` sabiti (
`external-case-status-transition.service.ts`) bu 3 kenarı tanımlar — başka HİÇBİR
(from,to) çifti manuel yoldan kabul edilmez:

```
HACIZ_TALEP        → CEVAP_BEKLENIYOR
HACIZ_TALEP        → HACIZ_KONDU
CEVAP_BEKLENIYOR   → HACIZ_KONDU
```

`KAPANDI` bu matrisin parçası DEĞİLDİR — ayrı `closeManual()` yoludur (bkz. §4).
`TAHSIL_BASLADI` ve tam-tahsilat `KAPANDI` bu matrisin parçası DEĞİLDİR — ayrı
`applySystemDerivedProjection()` yoludur (bkz. §7). İcad edilmiş başka bir geçiş
YOKTUR; frontend bu matrisi bağımsız olarak kopyalamaz, backend'in döndürdüğü
per-item `allowedManualTransitions` projeksiyonunu kullanır (bkz. §8).

## 3. Provenance Ayrımı (`ExternalCaseStatusSource`)

- **MANUAL** — staff/lawyer tarafından elle, kanıtla kaydedilmiş (`transitionManual`, `closeManual`).
- **SYSTEM_DERIVED** — canonical Collection kayıtlarından türetilmiş (`applySystemDerivedProjection`, tek çağıran: `ThirdPartyService.addExternalCaseCollection()`).
- **UYAP_RESULT** — gelecekte gerçek UYAP adapter sonucu için ayrılmış; **bugün hiçbir koda bağlı DEĞİLDİR**, hiçbir writer bu değeri üretmez, public client asla seçemez.
- `statusSource === null` → **LEGACY_UNCLASSIFIED** (D2 öncesi satırlar; sahte backfill değeri ÜRETİLMEDİ).

## 4. Actor Authority Kuralları

Tek yetki kapısı: `ExternalCaseStatusAuthorityService`. İkinci bir authority motoru
yoktur — `ActingLawyerResolverService` (I01) ve
`TriggerHacizAuthorizationService`'in (I15-D1-R1) "case.findFirst + roster
.some()" deseni CaseStaff için de aynen tekrarlanır.

- **Manuel FACT/PROCESS** (3 kenar): tam `CaseLawyer` ataması OLAN avukat **VEYA**
  tam `CaseStaff` ataması + `canEdit=true` OLAN personel. Salt tenant membership
  yetmez.
- **Manuel KAPANDI**: **yalnız** tam `CaseLawyer` ataması olan avukat. Staff,
  `canEdit=true` olsa bile YAPAMAZ.
- Actor kimliği HER ZAMAN authenticated principal'dan gelir (`req.user` →
  `CurrentUser("id")`), asla body/DTO'dan değil.
- `confirmedBy` / iki-aşamalı lawyer-confirmation YOKTUR — owner tarafından
  reddedildi; staff kanıtla doğrudan kaydeder.

## 5. Evidence Gereksinimleri

`externalReference` (kanıt/belge referansı) ve `statusOccurredAt` (dış dünyada
gerçekleşme anı) her manuel FACT/PROCESS geçişi ve manuel kapatma için mantıken
gereklidir.

**Mevcut gerçek durum (dürüstçe kaydedilir):** `TransitionExternalCaseStatusDto`
ve `CloseExternalCaseDto` bu iki alanı backend'de `@IsOptional()` işaretler —
sunucu tarafında ZORUNLU DEĞİLDİR. D2-I03 bunu **yalnız frontend form-submit
kapısında** zorunlu kılar (bkz. §8) — bu bir UI-seviyesi tamlık kuralıdır, sunucu
tarafı validasyon değildir. Bu, API'yi frontend dışından çağıran bir istemcinin
evidence olmadan da geçiş yapabileceği anlamına gelir; bu D2-I03'ün kapsamı
dışında bırakılan, owner'ın bu iterasyonda backend DTO'sunu sıkılaştırma talebi
OLMADAN, tek taraflı icat edilmeyen bilinen bir sınırdır.

## 6. Generic Update Status Yazamaz

`UpdateExternalCaseDto`'da `attachmentStatus` alanı YOKTUR (D2-I02'de kaldırıldı).
`ThirdPartyController.updateExternalCase()` → `ThirdPartyService.updateExternalCase()`
yalnız metadata alanlarını (externalOffice, externalCaseNo, counterpartyName,
claimAmount, claimCurrency, attachedAt, notes, priorityNote) günceller. Global
`ValidationPipe({whitelist:true, forbidNonWhitelisted:true})` (`main.ts`) sayesinde
`attachmentStatus` alanı gönderilirse istek 400 ile REDDEDİLİR — bu yalnız bir
API sözleşmesi değil, gerçek runtime garantisidir.

**D2-I03 tespiti:** D2-I02 merge'inden (`0e0466bd`) bu yana, frontend'in
`AddExternalCaseModal`/`EditExternalCaseModal`'ı hâlâ `attachmentStatus` alanını
create/update body'sine gönderiyordu — bu, `forbidNonWhitelisted` nedeniyle HER
dış-dosya oluşturma/düzenleme isteğinin 400 ile başarısız olduğu anlamına gelir.
D2-I03 bu alanı formlardan kaldırarak bu regresyonu da düzeltir (bkz. final rapor).

## 7. Collection-Derived TAHSIL_BASLADI / KAPANDI

`ThirdPartyService.addExternalCaseCollection()` → tek çağıran
`applySystemDerivedProjection()` → `SELECT...FOR UPDATE` ile pessimistic kilit
(bounded optimistic retry DEĞİL — sistem tetiklemeli mutasyon insan onayı
beklemeden HER ZAMAN yakınsamalıdır). `closureReason=FULLY_COLLECTED` YALNIZ bu
yoldan üretilir; manuel `closeManual()` bu sebebi seçemez (DTO + servis katmanında
çift doğrulanır).

## 8. Terminal KAPANDI / No-Reopen

`KAPANDI`'dan çıkan hiçbir geçiş (manuel matriste veya SYSTEM_DERIVED yolda)
tanımlı DEĞİLDİR. Ne `transitionManual`, ne `closeManual`, ne
`applySystemDerivedProjection` `KAPANDI`'yı kaynak (`from`) olarak kabul eder.
Frontend'de reopen/backward-transition UI'ı YOKTUR (D2-I03).

## 9. Frontend Capability Projection (D2-I03 minimal ekleme)

Frontend, hangi manuel geçişlerin mevcut aktör için kullanılabilir olduğunu veya
aktörün manuel kapatma yapıp yapamayacağını KENDİ BAŞINA tahmin etmez/hardcode
etmez. `ThirdPartyService.getExternalCases()` artık her satır için, TEK bir
authority çözümlemesiyle (liste başına 1 kez — N+1 YOK, çünkü bir case-debtor'a
ait tüm ExternalCase kayıtları AYNI Case'e bağlıdır) şunları döner:

- `allowedManualTransitions: ExternalCaseStatus[]` — §2 matrisinden, yalnız
  `from === item.attachmentStatus` VE aktör §4'teki FACT/PROCESS yetkisine
  sahipse dolu; değilse `[]`.
- `canManualClose: boolean` — yalnız `item.attachmentStatus !== "KAPANDI"` VE
  aktör §4'teki lawyer-only kapatma yetkisine sahipse `true`.

Bu projeksiyon `ExternalCaseStatusAuthorityService`'in YENİ, throw ETMEYEN 2
public metodunu (`canAttemptFactOrProcessTransition`,
`canAttemptManualClosure`) kullanır — mevcut private çözümleme mantığını
(`tryResolveAssignedLawyer`/`tryResolveEditableAssignedStaff`) AYNEN reuse eder;
paralel bir yetki motoru kurulmamıştır.

## 10. Production Migration / Backfill

D2-I01/D2-I02/D2-I03 hiçbirinde production migration veya backfill
UYGULANMAMIŞTIR. Şema değişiklikleri additive+nullable; hiçbir satırda sahte
geriye-dönük değer üretilmemiştir (null üçlü = LEGACY_UNCLASSIFIED, bkz. §3).

## 11. Real UYAP Result Adapter

`UYAP_RESULT` provenance değeri bugün hiçbir gerçek UYAP adapter'ına bağlı
DEĞİLDİR ve bu task (D2) kapsamında aktive EDİLMEMİŞTİR — yalnız gelecekteki bir
entegrasyon için contract/enum seviyesinde yer ayrılmıştır.

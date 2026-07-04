# SCHED-1 — Scheduler NAFAKA DueType Contract & Verification Note

> **Tür:** Read-only forensic / contract note. **KOD YOK · test değişikliği YOK · migration YOK · schema YOK.**
> **Sonuç:** `DECISION: NO-CODE CLOSURE (false-positive)` — STATUS-1 backlog'undaki "scheduler nafaka'yı PRINCIPAL
> yazıyor" iddiası **mevcut kod için yanlış**. Mevcut kod zaten doğru ve test+derleme ile kilitli.
> **Tarih:** 2026-06-24 · **Base:** origin/main `c71e258` · **Yöntem:** read-only kod kanıtı (elle doğrulama).

## 1. İddia (STATUS-1 backlog adayı)

> "Scheduler NAFAKA `DueType.PRINCIPAL` fix — `scheduler.service.ts:188` nafakayı PRINCIPAL yazıyor (NAFAKA/null
> olmalı); dormant ama re-save/backfill'de computeBalance'ta nafaka ikilenir." (kaynak: memory/STATUS-1 synth.)

Bu iddianın **mevcut kodda doğru olup olmadığı** SCHED-1'de kanıtlanacaktı (test-first; fix yalnız gerekiyorsa).

## 2. NAFAKA DueType Sözleşmesi (kanonik, doğrulandı)

| Katman | Beklenen | Mevcut kod | Durum |
|---|---|---|---|
| **Scheduler periyodik üretim** | Dönemsel nafaka borcu `DueType.NAFAKA` ile yazılır | `scheduler.service.ts:210` `type: DueType.NAFAKA` (`addNafakaPeriod`) + `existingPeriodDue` dedup (`:189`) | ✅ DOĞRU |
| **Due→ClaimItem köprüsü** | NAFAKA bakiye/alacak otoritesi DEĞİL → ClaimItem üretilmez (yalnız Due/taksit takvimi) | `due-to-claim-item.mapper.ts:32` `[DueType.NAFAKA]: null` (exhaustive `Record`, silent-default yasak) | ✅ DOĞRU |
| **Enum** | NAFAKA geçerli bir DueType | `schema.prisma:2887` `enum DueType { … NAFAKA … }` | ✅ MEVCUT |
| **Hukuki dayanak** | NAFAKA→null (tbk100 R1/R2) | mapper yorumu + ledger | ✅ |

**Yani sözleşme:** scheduler **NAFAKA** yazar (PRINCIPAL değil); kanonik ClaimItem modeline NAFAKA **materialize edilmez**
(`null`). Bu, iddianın "olması gereken" davranışının **tam olarak hâlihazırda uygulanmış** halidir.

## 3. Live Usage Assessment

- **PRINCIPAL yazan production kod:** Yalnız generic "Asıl Alacak" şablonu (`claim-engine.service.ts` ILAMSIZ_GENEL) —
  **nafaka ile ilgisiz**. Nafaka yolu PRINCIPAL yazmaz.
- **`scheduler.service.ts:188` (iddia edilen satır):** `addNafakaPeriod` fonksiyonudur ve `DueType.NAFAKA` yazar —
  iddia edilen PRINCIPAL yazımı bu satırda **yoktur**. İddia bayat/yanlış satır referansı.
- **Hiçbir mevcut kod yolu** nafaka borcunu/kalemini PRINCIPAL olarak üretmez.

## 4. Gerçek artık risk: legacy VERİ (kod değil) — zaten izleniyor

"Yanlış PRINCIPAL nafaka" bir **legacy DATA** sorunudur (tarihsel olarak `type=PRINCIPAL` ile kaydedilmiş nafaka
satırları). Bu, balance-display-shadow-diff readiness ledger'ında **zaten sınıflandırılmış**:

- `nafaka-periodic-due` → `LEGACY_AUTHORITY_RISK` — "NAFAKA must not be blind PRINCIPAL materialization." (mapper bunu
  `null` ile zaten karşılıyor.)
- `legacy-principal-nafaka` → `LEGACY_AUTHORITY_RISK` — "Scheduler avoids duplicate due; remediation remains separate."

Yani: scheduler dedup eder, mapper materialize etmez; kalan tek konu **eski veride yanlış-tipli satırların remediation'ı**,
ki bu **legal-gated balance cutover strand'ine** aittir ve **bilinçli olarak ayrı** tutulmuştur. SCHED-1 kapsamı değildir.

## 5. Test kapsamı (sözleşme zaten kilitli)

- `due-to-claim-item.mapper.spec.ts:26` (tablo) + `:40-42` (ayrı test): `NAFAKA → null` **açıkça test edilir**.
- `mapDueTypeToClaimItemType` exhaustive `Record<DueType,…>` → yeni DueType eklenince **derleme hatası** (silent default yasak).
- `scheduler-nafaka-periods.spec.ts`: scheduler nafaka dönem davranışı için mevcut suite.

→ Yeni RED test gereksiz: sözleşme hem derleme-zamanı hem test ile zaten korunuyor. Ek guard testi düşük-değer.

## 6. Explicit Non-Goals

KOD YOK · yeni scheduler mimarisi YOK · balance engine refactor YOK · payment allocation refactor YOK · migration YOK ·
schema/enum değişikliği YOK · legacy-veri remediation YOK (legal-gated cutover'a ait) · UI YOK · permission YOK.

## 7. DECISION

**`NO-CODE CLOSURE (false-positive)`** (karar ağacı dalı **D**).

- Mevcut kod NAFAKA sözleşmesini **doğru** uygular (scheduler→NAFAKA · mapper→null) ve test+derleme ile kilitlidir.
- İddia edilen "scheduler PRINCIPAL yazıyor" davranışı mevcut kodda **yoktur** (bayat/yanlış-satır iddia).
- Gerçek artık risk **legacy veri remediation**'dır; **legal-gated balance cutover** strand'ine aittir, readiness
  ledger'ında izlenir, SCHED-1 kapsamı **dışındadır**.
- **Aksiyon:** kod/test değişikliği yapılmaz. STATUS-1'deki "Scheduler NAFAKA DueType fix" adayı **düşürülür** (mevcut
  kod için geçersiz); nafaka veri-remediation'ı balance cutover gündeminde kalır.

---

> **Kayıt:** SCHED-1 = doğrula-önce disiplininin sonucu: yakından bakınca "fix" gerektirmeyen, zaten doğru ve kilitli bir
> sözleşme. Tek gerçek konu legacy veri olup ayrı/legal-gated. Kod yazılmadı.

# TM47F — Payment Reversal Lifecycle Boundary Note

> **Status:** PRODUCT DECISION CLOSED (TM46) — implementation NOT AUTHORIZED.
> **Implementation status:** NOT AUTHORIZED.
> **Scope:** Docs-only lifecycle/boundary note. Kod, schema, migration, API contract, test behavior ve UI degisikligi yok.
> **Base:** `origin/main@e11a32bd6a4559825c011036fa44c601a8dee233`

---

## 0. Neden Bu Not Var

Bu hat teknik bug kapatma hattı degildir. Tahsilat iptalinden sonra paranin muekkil settlement, statement ve payout tarafindaki sonucu urun, muhasebe ve hukuk kararidir.

TM46 karari bu siniri netlestirdi: `PAYMENT_REVERSED` producer korunur; asil karar downstream lifecycle davranisindadir.

Bu dokuman sonraki dar implementation islerine sinir birakmak icindir:

- TM47B — Statement eligibility behavior
- TM47C — Payout eligibility behavior
- TM47D — Prior payout/manual reversal workflow
- TM47E — `manualReversalRequiredAt` ops visibility

`TM47A — PAYMENT_REVERSED producer` ilk oncelik degildir. TM46 karar 2-D uyarinca producer degisikligi yetkili degildir.

---

## 1. TM46 Nihai Urun Kararlari

| # | Baslik | Karar |
|---|---|---|
| 1 | Ana muhasebe ilkesi | Para muekkile odenmediyse degistirilebilir; odendiyse otomatik dokunulmaz. Muhasebe yetkisi olan kisiler muhasebe icinde ayrica duzeltme yapabilir. |
| 2 | `PAYMENT_REVERSED` producer | Producer'a dokunulmaz; yalniz downstream settlement/statement/payout davranisi tanimlanir. |
| 3 | HELD disposition | `HELD_PENDING_DISTRIBUTION` otomatik `REVERSED` yapilabilir. |
| 4 | POSTED disposition | Statement/payout durumuna gore ayrisir. |
| 5 | Prior statement | Statement henuz muekkile gonderilmediyse degisebilir; gonderildiyse immutable kalir. |
| 6 | Prior payout | Manuel reversal workflow'a duser. |
| 7 | `manualReversalRequiredAt` semantics | Already-posted money icin manuel reversal workflow marker'i; ayni zamanda statement ve payout blocker. |
| 8 | Marker UI/ops visibility | Admin/ops queue ve dosya finance/audit yuzeyinde gorunur. |
| 9 | Statement aciklamasi | Duruma gore farkli aciklama kullanilir. Default label: "Iptal edilen tahsilat duzeltmesi". |
| 10 | Payout sonrasi kapatma | Kullanici secer: geri odeme / offset-mahsup / feragat. |

---

## 2. Mevcut Implementation Status

Mevcut runtime davranisi bu dokumanla degismez.

```txt
Collection.cancel()
  -> Collection CANCELLED
  -> PAYMENT_REVERSED outbox event append
  -> PaymentReversedRegistrar
  -> CollectionReversalService.reverseFromPaymentReversed()
```

Mevcut durum:

- `Collection.cancel()` mevcut `PAYMENT_REVERSED` event uretimini korur.
- `PAYMENT_REVERSED` producer scope/semantics bu hatta degistirilmez.
- HELD disposition otomatik `REVERSED` yapilabilir.
- POSTED disposition otomatik `REVERSED` yapilmaz.
- POSTED disposition icin mevcut default: status `POSTED` kalir ve `manualReversalRequiredAt` marker'i yazilir.
- `ClientStatement`, `ClientPayout` ve `BalanceLedger` otomatik degistirilmez.
- `manualReversalRequiredAt` mevcut default'ta operasyonel marker'dir; TM46 kararina gore sonraki implementation'da marker + statement/payout blocker davranisi tasarlanacaktir.

---

## 3. Lifecycle Boundary

### 3.1 HELD disposition

`PAYMENT_REVERSED` geldigi anda disposition henuz HELD ise:

```txt
HELD_PENDING_DISTRIBUTION -> REVERSED
```

Bu durum finansal belge veya fiili muekkil odemesi uretmedigi icin otomatik kapanis guvenlidir.

### 3.2 POSTED disposition

`PAYMENT_REVERSED` geldigi anda disposition POSTED ise:

```txt
POSTED korunur
manualReversalRequiredAt marker yazilir
Statement / payout / BalanceLedger otomatik degistirilmez
```

POSTED durum, paranin muekkil-ofis settlement hattina girdigini gosterir. Bu nedenle kor reversal yasaktir; sonuc statement ve payout durumuna gore belirlenmelidir.

### 3.3 Prior statement

Statement henuz muekkile gonderilmediyse sonraki TM47B isinde degistirilebilirlik kurali tanimlanabilir.

Statement muekkile gonderildiyse immutable kalir. Duzeltme eski statement'i geriye donuk degistirmek degil, yeni duzeltme/supersede/adjustment akisi tasarlamaktir.

### 3.4 Prior payout

Payout gerceklesmisse otomatik reversal yapilmaz. Kayit manuel reversal workflow'a duser.

Kapatma secenegi kullanici kararidir:

- geri odeme
- offset-mahsup
- feragat

Bu seceneklerin teknik modeli TM47D disindadir; TM47F yalniz siniri kaydeder.

---

## 4. `manualReversalRequiredAt` Semantics

TM46 karari sonrasi hedef semantik:

```txt
manualReversalRequiredAt =
  already-posted money icin manuel reversal workflow marker'i
  + statement blocker
  + payout blocker
```

Mevcut implementation bu alanla POSTED disposition icin operasyonel gorunurluk marker'i yazar. Statement/payout blocker davranisi henuz uygulanmis sayilmaz; TM47B/TM47C/TM47D kapsaminda dar patch'lerle tasarlanacaktir.

Marker gorunurlugu TM47E kapsamindadir:

- admin/ops queue
- dosya finance yuzeyi
- audit/finance takip yuzeyi

---

## 5. Multitenant ve Veri Butunlugu Siniri

Bu boundary tenant-scoped kalir.

- `PAYMENT_REVERSED` event/outbox context'i tenant bilgisini tasir.
- `CollectionDisposition` tenant/case guard'lari korunur.
- Cross-tenant veya wrong-case durumlarda mutasyon yapilmamasi gerekir.
- Statement, payout ve manual reversal workflow sonraki implementasyonlarda tenant + case + caseClient scope ile tasarlanmalidir.

Bu dokuman tenant davranisini degistirmez; yalniz sonraki implementasyonlar icin invariant'i tekrarlar.

---

## 6. Open Implementation Sequencing

Onayli teknik sira:

| Sira | Hat | Kapsam |
|---|---|---|
| 1 | TM47B — Statement eligibility behavior | Statement gonderilmemisse degistirilebilirlik; gonderildiyse immutable duzeltme yolu. |
| 2 | TM47C — Payout eligibility behavior | `manualReversalRequiredAt` varken payout uygunluk/bloklama davranisi. |
| 3 | TM47D — Prior payout/manual reversal workflow | Payout sonrasi geri odeme / offset-mahsup / feragat workflow'u. |
| 4 | TM47E — `manualReversalRequiredAt` ops visibility | Admin/ops queue ve dosya finance/audit gorunurlugu. |

Not: TM47A producer hattina girilmez; TM46 karar 2-D producer degisikligini yetkilendirmemistir.

---

## 7. No-Go List

TM47F docs-only hattinda ve sonraki dar isler acilmadan once yasaklar:

- schema/migration yok
- formula change yok
- broad settlement rewrite yok
- payout lifecycle implementation yok
- statement lifecycle implementation yok
- producer scope change yok
- `Collection.cancel()` davranis degisikligi yok
- `PaymentReversedRegistrar` davranis degisikligi yok
- `CollectionReversalService` davranis degisikligi yok
- `ClientStatementService` / `ClientPayoutService` / `BalanceLedger` davranis degisikligi yok
- API contract degisikligi yok
- UI implementation yok
- dependency/lockfile/generated file yok
- test behavior degisikligi yok

---

## 8. Acceptance Boundary

Bu dokumanin kabul kriteri:

- TM46 product decision sonucu repo icinde kayitlidir.
- Mevcut `PAYMENT_REVERSED` producer'in korunacagi aciktir.
- POSTED sonrası lifecycle'in teknik bug degil urun/muhasebe/hukuk siniri oldugu aciktir.
- Sonraki TM47B/TM47C/TM47D/TM47E isleri icin dar, sirali ve davranis degistirmeyen baslangic zemini vardir.

Bu dokuman runtime davranisi degistirmez.

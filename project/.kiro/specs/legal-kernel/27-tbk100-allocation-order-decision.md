---
status: product-legal-rule
type: legal-decision-record
phase: 2
date: 2026-06-13
signed-off-by: Av. Ulaş Hüseyin Telli
review-trigger: "allocator behavior PR öncesi — re-pin stratejisi + (varsa) içtihat dayanağı eklenmesi"
purpose: "TBK 100 kısmi ödeme / tahsilat mahsup SIRASINI ürün hukuki kuralı olarak kilitler. Mevcut engine sırasından (faiz-önce) FARKLI; allocator davranış değişikliği AYRI PR ile uygulanır (bu belge yalnız karardır, kod değil)."
---

# 27 — TBK 100 Allocation Order — Legal Decision Record (P-0)

**Durum:** product-legal-rule (ürün hukuki kuralı)
**Karar sahibi / sign-off:** Av. Ulaş Hüseyin Telli
**Bağlam:** D-E (cost-inclusive bakiye) strand'i; kanonik bakiye motoru = `interest-engine` (recompute otoriter).
Açık hukuki kararlar defteri: `memory/tbk100-legal-decisions-ledger.md` (A bölümü).

> Bu belge yalnız MAHSUP SIRASI KARARINI kaydeder. Kod, allocator, test güncellemesi bu belgeyle BAŞLAMAZ;
> davranış değişikliği AYRI PR + ayrı onayla (re-pin stratejisi §5).

---

## 1. FINAL PRODUCT RULE — Mahsup Sırası

Kısmi ödeme / tahsilat gerçekleştiğinde tahsil edilen tutar şu sırayla mahsup edilir:

```
1) MASRAF      (costs)
2) FER'İ       (ancillaries)
3) FAİZ        (accruedInterest)
4) ANAPARA     (principal)
```

İcra harçları (tahsil harcı, cezaevi harcı vb.) devlet tarafından, asıl alacak düşülmeden önce tahsil edilir →
MASRAF kademesinde değerlendirilir.

## 2. Kalem Sınıflandırması (slot eşlemesi)

**İLKE (kritik):** Kalemin SINIFLANDIRMASI = HUKUKİ NİTELİK; mahsup SIRASI = kategori-düzeyi ürün kuralı (§1).
Bu ikisi AYRI tutulur. Vekâlet ücreti hukuki nitelik gereği **fer'i alacaktır** → veri modelinde fer'i
(ancillaries) tarafında temsil edilir; "masraf gibi davransın" diye sınıfı değiştirilmez. Mahsup sırasındaki
yeri, ait olduğu kategorinin (FER'İ) sıradaki konumuyla belirlenir.

**MASRAF (costs Map):**
| Kalem (ClaimItemType)        | AncillaryType (slot)            |
|------------------------------|---------------------------------|
| FEE (Harç)                   | HARC                            |
| (Tebligat masrafı)           | TEBLIGAT_MASRAFI                |
| (Komisyon)                   | KOMISYON                        |
| EXPENSE (genel masraf)       | TEBLIGAT_MASRAFI veya DIGER     |
| TAX_KDV / TAX_BSMV / TAX_KKDF | DIGER (varsayılan — aş. Not)    |

**FER'İ (ancillaries Map):**
| Kalem (ClaimItemType)            | AncillaryType (slot)        |
|----------------------------------|-----------------------------|
| ATTORNEY_FEE (Vekâlet ücreti)    | VEKALET_UCRETI              |
| CHECK_PENALTY (çek tazminatı)    | CEK_TAZMINATI               |
| PENALTY                          | DIGER                       |
| CONTRACTUAL_PENALTY (cezai şart) | DIGER                       |

**FAİZ:** accruedInterest (engine'in segmentli hesabı; sabit-oran/sabit-tutar faiz türleri ayrı karar — ledger §E).
**ANAPARA:** principal (claimBucket).

> Not: `ATTORNEY_FEE` → **FER'İ** (ancillaries[VEKALET_UCRETI]) — hukuki nitelik gereği; mevcut kod da zaten
> VEKALET_UCRETI'yi ancillaries Map'inde tutuyor (taşıma YOK). `KOMISYON` → MASRAF (costs).
> `DIGER` hem masraf (EXPENSE) hem fer'i (PENALTY) için kullanılabilir; ayrım costs/ancillaries Map'i ile yapılır.
>
> **Vergiler (TAX_*):** varsayılan MASRAF (DIGER). Hukuki nitelik field-based: vergi BAĞLI doğduğu kaleme göre
> sınıflanır — FAİZE bağlı KDV/BSMV/KKDF → FER'İ; masraf/vekâlete bağlı → MASRAF. Parent-link veri modelinde
> henüz yok (ayrı karar) → o gelene kadar varsayılan MASRAF/DIGER.
> **Cezaevi harcı:** Yargıtay gereği BORÇLUYA YÜKLENEMEZ (alacaklı öder) → borçlu bakiyesine/masrafına DAHİL
> EDİLMEZ. Bu bir SINIFLANDIRMA değil DIŞLAMA kuralıdır; assembler katmanında uygulanır (mahsup sırasını etkilemez).
> **Vekâlet ayrımı:** vekâlet ÜCRETİ → FER'İ (VEKALET_UCRETI); vekâlet HARCI + PULU + BARO PULU → MASRAF (taraf masrafı).

## 3. Mevcut Kod Sırası ile Fark

**Mevcut engine** (`TBK100_ALLOCATION_ORDER` + `allocateSinglePayment` + `tbk100-allocator.allocate`):
```
FAİZ → (masraf + fer'i, per-tip interleaved) → ANAPARA
```
**Yeni ürün kuralı:**
```
MASRAF → FER'İ → FAİZ → ANAPARA
```
Başlıca farklar:
1. **FAİZ 1. kademeden 3. kademeye** taşınır (masraf+fer'iden sonra) — en büyük davranış değişimi.
2. Kademe ayrımı netleşir: önce TÜM masraf, sonra TÜM fer'i (mevcut interleaved değil).
3. `KOMISYON` → masraf (costs) grubuna sınıflanır. `VEKALET_UCRETI` ancillaries (fer'i) Map'inde KALIR
   (hukuki nitelik = fer'i; mevcut kodla uyumlu, taşıma YOK).
4. ANAPARA son kalır (değişmez).

## 4. Behavior PR Etkisi

- Dokunulacak: `domain.types.ts` (TBK100_ALLOCATION_ORDER), `allocation-engine.service.ts` (allocateSinglePayment
  kademe sırası), `tbk100-allocator.service.ts` (allocate sırası), KOMISYON costs sınıflandırması (VEKALET zaten ancillaries'te).
- **Test etkisi (re-pin):** ödemeli senaryolar (golden 15.2, sprint-3/4, payment-allocation / allocation-engine /
  tbk100-allocator characterization) → allocation step'leri ve kalan tutarlar YENİ kurala göre yeniden pinlenir.
- Etkilenmez: ödemesiz toplam (totalDue), PR-X1 cost-inclusive total (sıra total'i değiştirmez).
- Kapsam: D-E assembler'dan BAĞIMSIZ; allocator'ın temel mahsup sırasını etkileyen ürün/hukuk kararıdır.

## 5. Uygulama Sırası (kod ileride)

1. (bu belge) Karar kaydı ✅
2. Allocator behavior PR plan-review (re-pin stratejisi: önce ESKİ sırayı characterization'la kilitle →
   sonra YENİ sırayı pinle; doc-18 kademe-2 capture deseni).
3. Allocator + sınıflandırma kodu + re-pin (ayrı PR, ayrı onay).

## 6. Legal Authority / Citation

```
Product legal rule signed off by Av. Ulaş Hüseyin Telli.
External statutory / case-law citations (TBK m.100, İİK, Yargıtay içtihadı): TODO — public / legal-grade
release öncesi doğrulanacak. Bu belge dış hukukçu görüşü veya Yargıtay içtihadı onayı OLARAK SAYILMAZ;
projede benimsenen ürün hukuki pozisyonudur (doc-23/25 atıf modeliyle aynı).
```

---

**Decision Status:** Locked (product legal rule). Signed-off-by Av. Ulaş Hüseyin Telli, 2026-06-13.
Allocator davranış değişikliği NOT started; ayrı PR + ayrı onay. İçtihat dayanağı = açık TODO.

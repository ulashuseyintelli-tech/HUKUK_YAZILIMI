---
status: legal-signoff
type: legal-signoff
review-trigger: "ulas açık 'devam' onayı + kademe-2 capture planı — TBK100 minor-unit implementation öncesi"
phase: 2
date: 2026-06-08
purpose: "doc 18 (TBK100 minor-unit adoption) için legal sign-off kaydı. Para hesabı politikasını (kuruş/2dp, HALF_UP away-from-zero, minor-unit iç temsil) hukuken onaylar. YALNIZ politika onayıdır; teknik implementation AYRI onayla başlar."
---

# 25 — TBK100 Legal Sign-Off Record

**Durum:** legal-signoff
**Tür:** legal-signoff
**Bağlam:** doc 18 (`18-tbk100-minor-unit-adoption-decision.md`, accepted-pending-implementation) — beklenen legal sign-off bu belgedir.

> Bu belge yalnız HESAP POLİTİKASINI onaylar. Kod, helper, allocator değişikliği, test güncellemesi bu belgeyle başlamaz. Implementation AYRI ve açık "devam" onayıyla (doc 18 §6/§7 + kademe-2 capture).

---

## 1. Hukuki görüş (verbatim)
> Türk Lirası üzerinden yürütülen TBK100 mahsup ve faiz hesaplarında para değerleri kuruş hassasiyetinde (2 ondalık basamak) değerlendirilir.
>
> Kuruş altı değerler hesaplama sürecinde oluşabilse de, sistem sınırında iki ondalık basamağa normalize edilir.
>
> Yuvarlama yöntemi:
> - HALF_UP
> - Away-from-zero
>
> Örnekler:
> - 0.005 TL → 0.01 TL
> - 0.004 TL → 0.00 TL
> - -0.005 TL → -0.01 TL
>
> Bu nedenle minor-unit (kuruş bazlı) iç temsil kullanılması hukuken ve operasyonel olarak kabul edilmiştir.
>
> Kuruş seviyesinde oluşabilecek sonuç farklılıkları bilinçli ve kabul edilmiş hesap politikası sonucudur.
>
> Bu karar yalnız hesap politikasını onaylar; teknik implementasyon ayrıca onaylanacaktır.

## 2. Onaylanan politika (özet)
- **Para hassasiyeti:** TRY, kuruş = 2 ondalık; sistem sınırında normalize.
- **Yuvarlama:** HALF_UP, away-from-zero.
- **İç temsil:** minor-unit (kuruş/bigint cents) — hukuken+operasyonel kabul (doc 18 Yaklaşım B ile birebir).
- **Kabul edilen etki:** kuruş-seviyesi sonuç farkları **bilinçli, kabul edilmiş hesap politikasıdır** (mahkeme raporu determinizmi açısından sorun değil).

## 3. doc 18 ile uyum
- doc 18 §3 (R1 boundary policy) ile **birebir tutarlı**: HALF_UP · away-from-zero · `0.005 → 0.01`.
- Sign-off örnekleri (`0.005→0.01`, `0.004→0.00`, `-0.005→-0.01`) HALF_UP away-from-zero ile tutarlı.
- doc 18 Yaklaşım B (minor-unit/bigint cents, Money VO değil) onaylanan "minor-unit iç temsil" ile örtüşür.
- **Düzeltme (bu sign-off ışığında):** doc 18 §4'teki provizyonel prototip örneği `remainingPayment: 234.5569999999999 → 234.55` HALF_UP away-from-zero'ya aykırıydı; **`→ 234.56` olarak düzeltildi** (3. ondalık 6 ≥ 5 → yukarı). Nihai değerler implementation'da kademe-2 capture ile gerçek koddan yeniden doğrulanacaktır.

## 4. Otorite / atıf
```
Bu kayıt, Ulaş tarafından beyan edilen ve projede benimsenen hukuki pozisyon olarak tutulur.
Dış hukukçu / Yargıtay içtihadı onayı ayrıca eklenmedikçe external legal opinion sayılmaz.
(doc 23 atıf modeliyle aynı.)
```

## 5. Onay zinciri (doc 18)
```
Yaklaşım B + R1 prensip onayı   ✅ (doc 18)
Decision record (doc 18)        ✅
Legal sign-off (bu belge)       ✅  ← kapandı
ulas açık "devam" onayı         ⏳  BEKLENİYOR
Implementation + kademe-2       ⏳  (ayrı PR; doc 18 §6 guardrails)
```

## 6. Sıradaki adım (implementation DEĞİL)
- Implementation **başlamaz**. Ön koşul: **ulas açık "devam"** + doc 18 §6 guardrails (no schema/migration/DB/event/public-API/Money-VO; yalnız `tbk100-allocator.service.ts` internals + L1/L2 characterization) + §7 kademe-2 capture (gerçek koddan exact değerler).
- "devam" geldiğinde: önce plan-review (legal-time PR-1/2/3 deseni gibi), sonra gate-gate.

---
**Sign-Off Status:** Legal sign-off ✅ (ulas beyanı, 2026-06-08). Yalnız politika onayı. Implementation NOT started; ayrı "devam" bekler.

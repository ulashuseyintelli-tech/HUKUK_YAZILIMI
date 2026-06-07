---
status: partial-signoff
type: legal-signoff
review-trigger: "kalan sorular (Q1 geçmiş yön, Q6 acil köprü C, Q7 prod TZ) cevaplanınca tam sign-off'a yükselt; doc 20+22 revizyonu (ayrı gate) öncesi"
phase: 2
date: 2026-06-07
purpose: "legal-time strand'inin kritik çatallanmasını (doc 22 §10 Soru 5) hukuki karara bağlayan resmi kayıt. Ödeme günü faiz muamelesi hakkında benimsenen hukuki pozisyon. KISMİ sign-off: yalnız Q5 yetkili biçimde cevaplandı. Kod/implementation/politika yürürlüğü İÇERMEZ."
---

# 23 — legal-time Legal Sign-Off Record (PARTIAL)

**Durum:** partial-signoff
**Tür:** legal-signoff
**Strand:** legal-time · day-count / ödeme günü faiz muamelesi
**Bağlam:** doc 19 (observation) · doc 20 (decision draft) · doc 21 (forensic evidence) · doc 22 (legal awareness review)

> Bu belge bir KARAR KAYDIDIR. Kod, fix, runtime veya politika uygulaması bu belgeyle başlamaz. Implementation HÂLÂ blocked.

---

## 1. Hukuki görüş (verbatim)
> "Borçlunun ödemeyi gerçekleştirdiği gün için temerrüt veya gecikme faizi hesaplanmaz; faiz borcun ödendiği bir önceki güne kadar işletilir. Hukuki kural olarak faiz hesaplamalarında ödeme günü hesaba dahil edilmez."

## 2. Soru 5 kararı (doc 22 §10)
Hukuki görüşün koddaki karşılığı:
```
START_OF_DAY = doğru hukuki politika  (ödeme günü faiz dışı; faiz ödeme tarihinden önceki güne kadar)
END_OF_DAY   = hatalı politika        (ödeme gününü faize dahil eder)
```
- `START_OF_DAY` → boundary = paymentDate → segment `[.., paymentDate)` → ödeme günü hariç. **Hukuken doğru.**
- `END_OF_DAY` → boundary = paymentDate+1 → ödeme günü dahil. **Hukuken hatalı.**
- Mevcut sistem default'u (Zod `.default(END_OF_DAY)` + 5/5 case-type stratejisi) bu karara **aykırı**.

## 3. Sınıflandırma değişikliği
```
legal-time konusu artık SAF BUG-FIX değildir.
Hesap politikası değişikliği sınıfındadır (TBK100 / doc-18 seviyesinde ayrı onay zinciri gerektirir).
```
"Doğruluk restorasyonu" (doc 20/22) çerçevesinin dayanağı (END_OF_DAY'in amaçlanan-ve-doğru olması) ortadan kalkmıştır.

> **Nüans:** Bu kayıt tek başına politika değişikliğini yürürlüğe sokmaz. Yalnızca hukuki pozisyonu kaydeder. Politikanın fiilen değiştirilmesi (default END_OF_DAY → START_OF_DAY) ayrı bir karar + onay zinciri + implementation gerektirir.

## 4. Sorun iki bileşene ayrışır (düşmedi, yeniden adlandırıldı)
Düşen tez: ~~"UTC bug = alacaklı aleyhine 1 günlük faiz kaybı"~~ (END_OF_DAY'i doğru sayan doc 21 çerçevesi).
Kalan iki gerçek sorun:
1. **Determinizm:** Aynı dosya UTC ve Istanbul ortamında farklı hesap verebilir → mahkeme tekrarlanabilirliği riski (canlı mayın, hangi politika doğru olursa olsun).
2. **Politika:** Sistem default'u END_OF_DAY tasarlanmış; bu hukuki görüşe göre yanlış → START_OF_DAY'e geçiş gerekir.

```
TZ bug-fix  →  hesap politikası düzeltmesi (START_OF_DAY) + determinizm güvenliği
```

## 5. Geçmiş hesap yönü — Q7'ye kilitli
```
Prod = Istanbul → END_OF_DAY gerçekten uygulanmış olabilir
                → ödeme günü fazla faiz → borçlu aleyhine OVER-CHARGE riski
                → START_OF_DAY'e geçiş geçmiş tutarları DÜŞÜRÜR (borçlu lehine düzeltme)

Prod = UTC      → sistem kazara START_OF_DAY gibi davranmış olabilir
                → bu eksende geçmiş hesap DOĞRU olabilir
                → asıl sorun niyet/determinizm; geçmiş yeniden-hesap gerekmeyebilir
```
**KRİTİK NOT: Q7 (prod TZ kesin teyidi) cevaplanmadan geçmiş hesap etkisi kesin sınıflandırılamaz.**

## 6. Teknik sonuç — sıra kilitli
```
ÖNCE politika kararı (START_OF_DAY)  →  SONRA teknik determinizm.
Aksi halde "yanlış politikayı deterministik hale getirme" riski doğar.
```
Not: START_OF_DAY benimsenirse `adjustEndDateForPayment` no-op olur (addDays çağırmaz) → `addDays`/`format` zinciri faiz yolunda büyük ölçüde devre dışı kalır → TZ-fix kapsamı daralır/ikincilleşir.

## 7. Kalan açık sorular (bu sign-off KISMİ)
```
Q1 — geçmiş hesap yönü (yalnız ileriye mi, geçmiş yeniden-hesap mı)   [AÇIK — Q7'ye bağlı]
Q6 — acil TZ pin (C) yetkisi                                          [AÇIK]
Q7 — prod TZ kesin teyidi (UTC / Europe/Istanbul / bilinmiyor)        [AÇIK — en kritik]
```

## 8. Otorite / atıf
```
Bu kayıt, Ulaş tarafından beyan edilen ve projede benimsenen hukuki pozisyon olarak tutulur.
Dış hukukçu / Yargıtay içtihadı onayı ayrıca eklenmedikçe external legal opinion sayılmaz.
```

## 9. İzlenecek revizyonlar (AYRI GATE — PR B)
Bağımlılık yönü: **doc 23 → doc 20 revizyonu → doc 22 revizyonu** (tersi değil). Bu PR yalnız doc 23 ekler; aşağıdakiler ayrı pakette yapılır:
- **doc 20** (adoption decision): Approach A gerekçesi "doğruluk restorasyonu"ndan "hesap politikası değişikliği (END_OF_DAY→START_OF_DAY) + determinizm" çerçevesine revize edilmeli; statü policy-change/doc-18-class'a yükseltilmeli.
- **doc 22** (legal awareness): §3 hukuki anlam + §6 geçmiş yeniden-hesap + §9 Approach A gerekçesi bu karar ışığında güncellenmeli.
- **Implementation HÂLÂ blocked.**

---
**Sign-Off Status:** partial (yalnız Q5). Implementation NOT authorized. Politika yürürlüğe sokulmadı. Geçmiş etki Q7'ye bağlı.

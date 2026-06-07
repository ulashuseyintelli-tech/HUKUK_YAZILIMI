---
status: partial-signoff
type: legal-signoff
review-trigger: "Q1–Q7 hukuki olarak cevaplandı (status partial-signoff KORUNUYOR). DEPLOYMENT GATE AÇIK: ilk production deployment ÖNCESİ runtime TZ/date doğrulaması ZORUNLU. Policy START_OF_DAY adopsiyonu + determinizm ayrı implementation onayı; doc 20+22 revizyonu (PR B) öncesi."
phase: 2
date: 2026-06-07
purpose: "legal-time strand'inin Q1-Q7 hukuki/operasyonel yanıtlarını kaydeder. Q5 ile ödeme günü faiz politikası START_OF_DAY olarak benimsenmiştir; Q1/Q6/Q7 prod yok / deployment öncesi doğrulama bağlamında resolved edilmiştir. partial-signoff statüsü yalnız ilk production deployment öncesi runtime TZ/date validation gate'i açık olduğu için korunur. Kod/implementation/politika yürürlüğü içermez."
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
**KARARLAŞTI (Q7, 2026-06-07): production deploy EDİLMEMİŞ → bu matrisin hiçbir kolu gerçek geçmiş veriye uygulanmaz → geçmiş hesap ekseni KAPANDI. Matris yalnızca gelecekteki ilk deploy'da runtime TZ doğrulaması için referans kalır (bkz. §7 deployment gate).**

## 6. Teknik sonuç — sıra kilitli
```
ÖNCE politika kararı (START_OF_DAY)  →  SONRA teknik determinizm.
Aksi halde "yanlış politikayı deterministik hale getirme" riski doğar.
```
Not: START_OF_DAY benimsenirse `adjustEndDateForPayment` no-op olur (addDays çağırmaz) → `addDays`/`format` zinciri faiz yolunda büyük ölçüde devre dışı kalır → TZ-fix kapsamı daralır/ikincilleşir.

## 7. Soru kararları (Q1–Q7) + deployment gate

**Bağlam (operasyonel gerçek, ulas beyanı, 2026-06-07):** HUKUK_YAZILIMI henüz **production'a deploy edilmemiş.** Çalışan prod container yok; legally-relied geçmiş production hesabı yok. Bu, "geçmiş etki" eksenini kapatır ve konuyu **deployment-öncesi hazırlığa** taşır.

> **"partial-signoff" ne demek:** Hukuki sorular (Q1–Q7) CEVAPLANDI. "partial" olmasının TEK sebebi **deployment gate'in AÇIK kalması** (aşağıda) — cevaplanmamış hukuki soru DEĞİL.

```
Q1 — geçmiş hesap yönü        → resolved: geçmiş prod hesabı YOK → retrospective recalculation NOT APPLICABLE
Q2 — geçmiş kapsam            → resolved (N/A) — geçmiş yok
Q3 — bildirim/mahkeme         → resolved (N/A) — sunulmuş geçmiş rapor yok
Q4 — önemsizlik eşiği         → resolved (N/A) — etkilenen geçmiş hesap yok
Q5 — END_OF_DAY doğru mu      → resolved: START_OF_DAY doğru, END_OF_DAY hatalı (§2)
Q6 — acil TZ pin (C) yetkisi  → resolved: GEREKLİ DEĞİL — canlı prod yok, durdurulacak "kanama" yok
Q7 — prod runtime TZ          → resolved (pre-deployment context): production NOT DEPLOYED → canlı teyit anlamsız
```

**🔓 DEPLOYMENT GATE (AÇIK — bu yüzden status hâlâ partial-signoff):**
```
İlk production deployment ÖNCESİ runtime timezone/date davranışı doğrulaması ZORUNLU.
(Q7 doğrulama planı — Node resolvedTZ/offsetMinutes + adjustEndDateForPayment davranışı —
 ilk deploy gate'i olarak saklanır.)
```

**Caveat (kayıt doğruluğu):** "Production yok" ulas beyanı operasyonel gerçektir (doc 23 atıf modeli geçerli). EĞER herhangi bir ortam (staging/demo/pilot) güvenilen/dışa verilen hukuki hesap ürettiyse, Q1 "not applicable" yeniden değerlendirilmelidir.

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
**Sign-Off Status:** partial-signoff (Q1–Q7 hukuki olarak RESOLVED; "partial" = deployment gate AÇIK, cevaplanmamış hukuki soru DEĞİL). Implementation NOT authorized. Politika yürürlüğe sokulmadı. Geçmiş etki: NOT APPLICABLE (prod yok). Deployment gate: ilk deploy öncesi runtime TZ doğrulaması ZORUNLU.

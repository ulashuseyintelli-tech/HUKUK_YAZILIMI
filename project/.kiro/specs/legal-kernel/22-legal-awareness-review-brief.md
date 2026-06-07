---
status: reviewed
type: legal-awareness
review-trigger: "Sorular doc 23'te (Q1-Q7) resolved. Kalan açık tek kapı: ilk prod deploy öncesi runtime TZ doğrulaması (deployment gate). Implementation ayrı 'devam' onayı ister."
phase: 2
date: 2026-06-07
purpose: "day-count timezone bug'ının teknik bulgusunu (doc 19/20/21) hukuki/operasyonel karara çeviren brief. Karar kapısıdır; kod değil. Sorular doc 23'te cevaplandı; PR B ile çerçeve remediation'dan pre-deployment policy correction'a güncellendi."
---

# 22 — Legal Awareness Review — Brief

**Strand:** legal-time · day-count timezone bug
**Durum:** reviewed (sorular doc 23'te resolved)
**Girdi:** doc 19 (observation) · doc 20 (decision) · doc 21 (forensic evidence) · doc 23 (legal sign-off) · Gate 1 characterization

> Amaç: teknik bulguyu hukuki karara çevirmek. Bu bir karar kapısıdır, kod değil. Bu belge fix/runtime/paket değişikliği İÇERMEZ.

> **PR B reframe (2026-06-07, doc 23 sonrası):** Bu brief başlangıçta "END_OF_DAY doğru + UTC bug = alacaklı aleyhine kayıp / remediation" çerçevesindeydi. doc 23 çevirdi: **ödeme günü faiz işlemez → START_OF_DAY doğru, END_OF_DAY hatalı.** Ayrıca **production deploy edilmemiş** → geçmiş etki/remediation YOK. Aşağıdaki bölümler bu çerçeveyle güncellendi; eski ifadeler tarihsel bağlam için işaretlendi.

---

## 1. Sorunun kısa tanımı
Faiz hesabında "ödeme günü faiz işler mi" kuralı (END_OF_DAY) **sunucu saat dilimi UTC olduğunda sessizce tersine dönüyor.** Sonuç: ödemeli faiz hesaplarında ödeme sınırı bir gün kayıyor. Sorun gizli bir kenar durum değil; sistemin **ana faiz hesaplama yolunda** ve **varsayılan ayar olarak** mevcut. (doc 23 sonrası: asıl mesele bu default'un — END_OF_DAY — hukuken yanlış olması.)

## 2. Teknik mekanizma (sade)
- Sistem tarihleri "Istanbul (+03:00) gece yarısı" olarak okuyor; bu doğru.
- **Ama** gün ekleme/biçimlendirme işlemleri sunucunun yerel saatine göre yapılıyor. Sunucu UTC ise, "Istanbul gece yarısı" aslında "bir önceki gün 21:00 UTC" olarak görülüyor → takvim günü bir gün geriye kayıyor.
- "Ödeme günü +1 gün" (END_OF_DAY) hesabı bu yüzden "+0 gün"e çöküyor → END_OF_DAY pratikte START_OF_DAY gibi davranıyor.
- Toplam gün sayısı hesabı (`calculateDays`) ve dönem/safhalama (`determinePhase`) **etkilenmiyor** — onlar sabit ve doğru.

## 3. Hukuki anlamı (doc 23 ile TERSİNE GÜNCELLENDİ)
- **doc 23 hukuki kuralı:** "Ödeme günü faiz İŞLEMEZ; faiz ödeme tarihinden önceki güne kadar." → **doğru politika START_OF_DAY.**
- Mevcut default **END_OF_DAY ödeme gününü faize DAHİL eder → hukuken YANLIŞ.** (Uygulansaydı: ödeme günü için fazladan faiz → **borçlu aleyhine OVER-CHARGE.**)
- ~~ESKİ ÇERÇEVE (geçersiz): "Bu politika değişikliği değil, bug; UTC her ödemede borçlu lehine ~1 gün eksik (alacaklı aleyhine)."~~ → Bu, END_OF_DAY'i doğru sayan hatalı çerçeveydi; doc 23 ile düştü.
- **Düzeltme = default'u START_OF_DAY yapmak** (bir hesap politikası düzeltmesi). UTC'nin END→START çöküşü kazara doğru sonuç verir, ama güvenilemez (determinizm).
- **Prod deploy edilmediği için** bu sapma hiçbir gerçek dosyada **GERÇEKLEŞMEDİ** (doc 23 Q1).

## 4. Etkilenecek case sınıfları (deploy sonrası, hipotetik)
Üç koşul: **(a) hesapta ödeme var, (b) ödeme kuralı END_OF_DAY, (c) sunucu UTC.**
- (b) evrensel default (Zod + 5/5 strateji). (c) repo kanıtı UTC.
- → Deploy edilseydi: ödeme içeren tüm faiz hesapları (kısmi/taksitli ödeme dosyaları, çok-ödemeli uzun vadeli dosyalar, ödeme-tarihi oran-değişimi/takip gününe komşu dosyalar). **Prod yok → şu an gerçek etkilenen yok.**

## 5. Etkilenmeyen / düşük riskli durumlar
- **Ödemesiz hesaplar** → `adjustEndDateForPayment` çalışmaz → etkilenmez.
- **START_OF_DAY** kuralı → no-op, kararlı (ve doc 23'e göre DOĞRU politika).
- **Toplam gün/faiz** ödeme yoksa doğru.
- **Sabit oranlı "light preview"** → etkilenmez.

## 6. Geçmiş hesaplar için yeniden hesap (doc 23 → N/A)
```
N/A — production deploy EDİLMEMİŞ (doc 23 Q1).
Geçmiş production hesabı yok → retrospective recalculation UYGULANAMAZ.
Geçmiş-etki ekseni KAPALI.
(Q2/Q3/Q4 = N/A: geçmiş kapsam / bildirim / önemsizlik eşiği — hepsi konusuz.)
```
> Caveat: staging/demo/pilot güvenilen/dışa verilen hesap ürettiyse bu yeniden değerlendirilir (doc 23).

## 7. Mahkeme/rapor çıktısı riski (deploy sonrası geçerli)
- Faiz hesap raporları mahkemeye delil → tutar determinizmi kritik.
- Risk: aynı dosyanın UTC sunucu vs Istanbul makinesinde **farklı sonuç** vermesi → tekrarlanabilirlik/savunulabilirlik zedelenir.
- Rapor "Aynı Gün Ödeme: END_OF_DAY" derken hesabın START gibi davranması → beyan-hesap çelişkisi. **(Çözüm: policy START_OF_DAY + determinizm; deploy öncesi.)**

## 8. Acil mitigasyon C (doc 23 → GEREKSİZ)
```
C (bootstrap TZ pin) GEREKSİZ — canlı prod yok, durdurulacak "kanama" yok (doc 23 Q6).
En fazla deploy-zamanı determinizm garantisi olarak opsiyonel; ana çözüm değil.
```

## 9. Asıl fix A (doc 23 → bug-fix DEĞİL, policy correction + determinizm)
- A artık "doğruluk restorasyonu" değil: **(P) policy correction** (default END_OF_DAY → START_OF_DAY; hukuki düzeltme, doc 23 Q5) + **(D) determinizm hijyeni** (day-count TZ-değişmez).
- START_OF_DAY benimsenince `adjustEndDateForPayment` no-op → `addDays`/`format` faiz yolunda devre dışı → (D) büyük ölçüde gereksizleşir; (P) asıl iş.
- Pre-deployment olduğu için historical baggage yok, blast radius düşük (ama policy default `calculation.types` + `case-type-strategy.registry`'ye dokunur — doc 20 §4).

## 10. Legal sign-off soruları (→ doc 23'te RESOLVED)
> **Bu sorular doc 23'te cevaplandı (Q1-Q7 resolved):** Q5=START_OF_DAY doğru; Q1/Q2/Q3/Q4=N/A (prod yok); Q6=acil pin gereksiz; Q7=prod deploy edilmemiş → deploy-öncesi doğrulama. Aşağıdaki liste tarihsel referans olarak korunur.
1. Düzeltme yönü (ileriye/geçmiş) → Q1: ileriye (geçmiş yok).
2. Geçmiş kapsam → Q2: N/A.
3. Bildirim/mahkeme → Q3: N/A.
4. Önemsizlik eşiği → Q4: N/A.
5. END_OF_DAY doğru mu → Q5: HAYIR, START_OF_DAY.
6. Acil köprü C yetkisi → Q6: gereksiz.
7. Prod TZ teyidi → Q7: deploy edilmemiş; deploy-öncesi doğrulama zorunlu.

## 11. Implementation'a geçiş şartları (doc 23 sonrası güncel sıra)
```
doc 23 (Q1-Q7 resolved) ✅
→ PR B doküman revizyonu (doc 20 + doc 22, bu) ✅
→ implementation planı + ulas açık "devam"  [(P) policy default + (D) determinizm; characterization kademe-2]
→ deployment gate: ilk prod deploy ÖNCESİ runtime TZ/date doğrulaması ZORUNLU
Implementation HÂLÂ blocked.
```

---
**Legal Awareness Status:** reviewed (sorular doc 23'te resolved). Çerçeve: pre-deployment policy correction + determinizm. Geçmiş etki: N/A (prod yok). Deployment gate açık. Implementation NOT authorized.

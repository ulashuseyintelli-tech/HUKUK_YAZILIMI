---
status: review-required
type: legal-awareness
review-trigger: "legal sign-off (§10 soruları) + prod TZ kesin teyidi + ulas açık 'devam' onayı — T0 fix öncesi"
phase: 2
date: 2026-06-07
purpose: "day-count timezone bug'ının teknik bulgusunu (doc 19/20/21) hukuki/operasyonel karara çeviren brief. Karar kapısıdır; kod değil. T0 fix HÂLÂ onaysız."
---

# 22 — Legal Awareness Review — Brief

**Strand:** legal-time · day-count timezone bug
**Durum:** review-required
**Girdi:** doc 19 (observation) · doc 20 (decision draft) · doc 21 (forensic evidence) · Gate 1 characterization · prod≈UTC varsayımı · END_OF_DAY ödeme-günü muamelesi
**Katman ayrımı:** doc 19 = observation · doc 20 = decision draft · doc 21 = forensic evidence · **doc 22 = legal awareness review brief**

> Amaç: teknik bulguyu hukuki karara çevirmek. Bu bir karar kapısıdır, kod değil. T0 fix HÂLÂ onaysız. Bu belge fix/runtime/paket değişikliği İÇERMEZ.

---

## 1. Sorunun kısa tanımı
Faiz hesabında "ödeme günü faiz işler mi" kuralı (END_OF_DAY) **sunucu saat dilimi UTC olduğunda sessizce tersine dönüyor.** Sonuç: ödemeli faiz hesaplarında ödeme sınırı bir gün erkene kayıyor; ödeme günü hak edilen ~1 günlük faiz hesaba katılmıyor. Sorun gizli bir kenar durum değil; sistemin **ana faiz hesaplama yolunda** ve **varsayılan ayar olarak** mevcut.

## 2. Teknik mekanizma (sade)
- Sistem tarihleri "Istanbul (+03:00) gece yarısı" olarak okuyor; bu doğru.
- **Ama** gün ekleme/biçimlendirme işlemleri sunucunun yerel saatine göre yapılıyor. Sunucu UTC ise (kanıtlar UTC'yi gösteriyor), "Istanbul gece yarısı" aslında "bir önceki gün 21:00 UTC" olarak görülüyor → takvim günü bir gün geriye kayıyor.
- "Ödeme günü +1 gün" (END_OF_DAY) hesabı bu yüzden "+0 gün"e çöküyor → END_OF_DAY pratikte START_OF_DAY gibi davranıyor.
- Toplam gün sayısı hesabı (`calculateDays`) ve dönem/safhalama (`determinePhase`) **etkilenmiyor** — onlar sabit ve doğru.

## 3. Hukuki anlamı
- Bu **bir hesap politikası değişikliği değil; istenen davranıştan sapma (bug).** Kod en baştan Istanbul/+03:00 ve END_OF_DAY niyetini taşıyor; UTC ortamı bu niyeti bozuyor.
- Pratik etki: **ödeme günü için TBK'nin öngördüğü "o gün faiz işler" muamelesi uygulanmıyor.** Her ödemede borçlu lehine ~1 günlük faiz eksik hesaplanıyor (alacaklı aleyhine sapma).
- Tek başına küçük (bir gün) görünse de **sistematik ve yinelenen**: çok ödemeli/uzun vadeli dosyalarda ödeme adedi kadar birikir; ayrıca kayan sınır bir **oran değişim gününe veya takip (kesinleşme) gününe** denk gelirse o güne yanlış oran/safha uygulanması yoluyla etki büyür.

## 4. Etkilenen case sınıfları
Üç koşul birlikte gerçekleştiğinde etkilenir: **(a) hesapta en az bir ödeme var, (b) ödeme kuralı END_OF_DAY, (c) sunucu UTC.**
- (b) **evrensel varsayılan** (Zod default + 5/5 case-type stratejisi END_OF_DAY) → ödeme kuralı neredeyse her dosyada END_OF_DAY.
- (c) repo kanıtı UTC.
- → **Pratikte: ödeme içeren tüm faiz hesapları.** Özellikle:
  - Kısmi/taksitli ödemesi olan icra ve alacak dosyaları.
  - Çok sayıda ödeme kaydı olan uzun vadeli dosyalar (birikimli sapma).
  - Ödeme tarihi bir oran değişimi veya takip tarihiyle aynı/komşu olan dosyalar (yüksek etki).

## 5. Etkilenmeyen / düşük riskli durumlar
- **Ödemesiz hesaplar** (payment yok) → `adjustEndDateForPayment` hiç çalışmaz → etkilenmez.
- **START_OF_DAY** kuralıyla yapılan hesaplar → no-op, kararlı (ama bu varsayılan değil).
- **Toplam gün ve faiz** sabit `[başlangıç, bitiş)` üzerinde ödeme yoksa doğru.
- **Sabit oranlı "light preview"** yolu (ödeme tarihi geçmez) → etkilenmez.
- **Sunucu gerçekte Istanbul/+03:00 ise** → bug latent (hiç tetiklenmez). *Bu, doğrulanması gereken kritik varsayım (bkz. §10).*

## 6. Geçmiş hesaplar için yeniden hesap sorusu
Karar gerektiren nokta: **Düzeltme ileriye mi dönük, yoksa geçmişe de mi uygulanacak?**
- Eğer prod gerçekten UTC ise, **bugüne kadar üretilmiş ödemeli faiz hesapları sistematik olarak ~1 gün eksik** olabilir.
- Sorular: Hangi tarih aralığındaki dosyalar yeniden hesaplanmalı? Mahkemeye sunulmuş/icraya konmuş raporlar var mı? Yeniden hesap müvekkil/karşı taraf bildirimi gerektirir mi? Maddi eşik (önemsizlik sınırı) var mı?

## 7. Mahkeme/rapor çıktısı riski
- Faiz hesap raporları **mahkemeye delil** olarak sunuluyor → tutarın determinizmi ve doğruluğu kritik.
- Risk: aynı dosyanın **farklı ortamda (UTC sunucu vs Istanbul geliştirici makinesi) farklı sonuç** vermesi → raporun tekrarlanabilirliği/savunulabilirliği zedelenir; karşı tarafın itirazına açık.
- Ayrıca rapor metninde "Aynı Gün Ödeme: END_OF_DAY" yazarken hesabın START_OF_DAY gibi davranması → **rapor beyanı ile fiili hesap çelişir** (tutarsızlık delili).

## 8. Acil mitigasyon C neden sadece geçici
"C" = uygulama başlangıcında sunucu saatini `Europe/Istanbul`'a sabitlemek (tek satır).
- ✅ Artısı: prod UTC ise **anında** ana yolu doğruya çevirir ("kanama durdurma").
- ⚠️ Eksisi: **kök nedeni gizler** — kod hâlâ sunucu-saatine bağımlı; ileride biri TZ'yi değiştirir/yeni ortam eklerse bug geri döner. Ayrıca **global** etki: tüm sistemin tarih/saat davranışını değiştirir (loglar, zamanlayıcılar, başka modüller) → öngörülemeyen yan etki riski.
- → C ancak **geçici köprü**; kalıcı çözüm değil.

## 9. Asıl fix A neden tercih ediliyor
"A" = `day-count-calculator.ts` iç fonksiyonlarını saat-diliminden **bağımsız** hale getirmek (string tabanlı/UTC-sabit aritmetik).
- Dış arayüz, string giriş/çıkış kontratı, `calculateDays`/`determinePhase` **değişmez**.
- Etki yüzeyi **dar ve izole** (tek zincir, tek dosya iç mantığı) → düşük yan etki.
- Sonuç **ortamdan bağımsız** olur: UTC de Istanbul da aynı (doğru) sonucu verir → mahkeme tekrarlanabilirliği garanti.
- C'nin global yan etkisini taşımaz.

## 10. Legal sign-off için cevaplanacak sorular
1. **Düzeltme yönü:** Sadece ileriye dönük mü, geçmiş dosyalar da yeniden mi hesaplanacak?
2. **Geçmiş kapsam:** Yeniden hesap yapılacaksa hangi tarih aralığı / dosya sınıfları?
3. **Bildirim:** Etkilenen müvekkil/dosyalar için bildirim veya mahkemeye düzeltme gerekir mi?
4. **Önemsizlik eşiği:** ~1 günlük fark hukuken ihmal edilebilir kabul ediliyor mu, yoksa her kuruş mu?
5. **END_OF_DAY doğru politika mı?** Düzeltme END_OF_DAY'i amaçlanan haline getirecek; bu ödeme-günü muamelesi hukuken doğru tercih mi (yoksa START_OF_DAY mı olmalı)?
6. **Acil köprü (C) yetkisi:** Kalıcı fix'e kadar geçici TZ pin uygulansın mı?
7. **Prod TZ teyidi:** Çalışan ortamın gerçekten UTC olduğu operasyonel olarak doğrulanmalı (bug canlı mı, latent mı buna bağlı).

## 11. Implementation'a geçiş şartları (sıra kilitli)
T0 fix (A) yalnızca şu üçü tamamlanınca başlar:
1. **Legal sign-off** — §10 sorularına yanıt (özellikle geçmiş yeniden-hesap yönü).
2. **Prod TZ kesin teyidi** — deploy ortamında çalışan container saat dilimi.
3. **ulas açık "devam" onayı** + implementation planı (karakterizasyon kademe-2 ile nihai-TL deltası pinlenir, sonra fix, sonra characterization güncelleme — ayrı PR).

---
**Legal Awareness Status:** review-required. No implementation. No runtime change. Sıradaki adım: §10 sorularına hukuki/operasyonel yanıt.

# K3-L D2 — Karar Paketi R02 (somutlaştırma)

- **Tarih:** 01.10.2026 (TSİ)
- **Dayanak:** owner GO "K3-L teknik hesap kusurları ve kararların tamamlanması", madde 2–5.
- **İlişki:** R01 (`K3L-D2-DECISION-PACKAGE-R01.md`) kanıt ve ayrıntı kaydı olarak yerinde kalır. R02 sınıflamayı üç gruba indirir, teknik düzeltmeleri kaydeder ve 3095 kaydını düzeltir.
- **Bağımsız inceleme:** R02 taslağı ayrı bir ajanla çürütülmeye çalışıldı; bulgular işlendi (§8).
- **R03 (01.10.2026):** `K3L-D2-DECISION-PACKAGE-R03.md` bu paketten sonra kapananları (TK-5, TK-7 görünürlük, TK-9, TK-10, TK-11; KP-2, KP-3 ilk aşama, KP-7, KP-8, KP-9 durum gösterimi, KP-11), TK-6 / TK-12 / TK-13'ün durumunu ve owner cevabı gereken kalan soruları taşır. Bu dosyadaki "uygulanmadı" ifadeleri o tarihten önceki durumu anlatır.
- **Bu belge KP seçeneklerinin toplu kabulü DEĞİLDİR.** "Öneri" sütunu owner kararını bekler.
- **Kapsam dışı:** canlı yayın, bayrak açma, canlı DB erişimi, geçmiş kayıt düzeltmesi, UYAP gönderimi, hizmet kabulü.

## 1. Tam liste — üç grup

**Grup 1 — Önceden verilmiş owner/yönetişim kararıyla çözülen.** Yeniden onaya açılmaz; kalan iş uygulamadır.
**Grup 2 — Hesap politikası seçmeden düzeltilebilen teknik kusur.**
**Grup 3 — Yeni ürün / hukuk / yetki kararı gerektiren.**

| # | Konu | Grup | Karar kaynağı ya da durum |
|---|---|---|---|
| KP-1 | Anaparalar arası mahsup sırası | **3** | Owner yönü var: ALC-P1-3 "owner düzeltmesi R2" — **dominant ölçüt ilk takip edilen borç, vade değil**. 7 adımlı dizi backlog'un "Technical Value" alanında, onay kaydı yok; ALC-P1-3 `Status: BACKLOG`. Teyit soruları §4'te. |
| KP-2 | Seçilmemiş "YASAL" dosya faiz türü | **3** | TBK 120 + 3095 md. 1 (7589 md. 10 ile değişik, **yürürlük 31/7/2026**, §5). Ürün + hukuk. |
| KP-3 | İstenmiş işlemiş faiz kayıtlarının temsili | **3** | Anlam karara bağlı (ADR-014 değişikliği md. 8); eski kayıt envanteri, göç biçimi ve dönem çakışması kuralı açık. |
| KP-4 | Sorumluluğu kaydedilmemiş çek tazminatı | **3** | Kimin sorumlu olduğu owner kararıyla belli (yalnız keşideci ve lehine aval); **kayıt yokken** ne yapılacağı ürün kararı. |
| KP-5 | Tarihi kaydedilmemiş masraf | **3** | Tarih ilkesi karara bağlı (ADR-014); masraf tarihi alanı veri modeli kararı. |
| KP-6 | Q4 / MUST-10 okuması | **1** | ADR-014 MUST-3 ve I-15: dosya içi mahsup sırası masraf → fer'i → faiz → anapara. MUST-10 yalnız ücret projeksiyonunun ayrı tutulmasıdır. "Q4 dağıtılmaz" notu kova yapısı notudur ve ADR-014'ten eski. **Okuma A (aşama ertelemesi) bağlayıcı kuraldan çıkar; owner'a yeniden sorulmaz.** |
| KP-7 | Pilot ekrandaki "Toplam tahsilat" etiketi | **3 (daraltıldı)** | Alan anlamları ALC-AUTH-1B'de karara bağlı (owner review, PR #909): `allocatedPaidAmount` = borca tahsis edilen, `grossReceivedAmount` = dosyaya fiilen gelen. **Açık kalan yalnız** pilot etiketinin hangi alanı göstereceği; ALC-AUTH-1B kaydında "guarded primary öncesi UI/Av. sign-off" engeli. |
| KP-8 | DİĞER türündeki çoklu OCR evrakı | **3** | Ürün (R01 §6.1). |
| KP-9 | Kanıtsız varsayılan yetkinin onayı | **3** | Ürün / yetki (R01 §6.2). |
| KP-10 | Geçmiş dosya etki sayımı için erişim | **3** | Erişim GO'su (R01 §5; ek sorgular §6). |
| KP-11 | Hesap tarihi varsayılanı | **3** | Ürün (COL/OD-02). |
| TK-1 | Oran türe göre süzülmüyordu | **2** | **MERGED `d4f2b9fc`** (#2859, 01.10.2026 01:50 TSİ) |
| TK-2 | Eksik oran → sessiz 0 / komşu oran, "OK" | **2** | **MERGED `d4f2b9fc`** (#2859, 01.10.2026 01:50 TSİ). Hedef davranış ADR-014 MUST-7 ("missing required rate" → fail closed) ve RD01. |
| TK-3 | Hesap tarihinden sonraki ödeme bakiyeden düşüyordu | **2** | **MERGED `2507f73c`** (#2860, 01.10.2026 02:14 TSİ) |
| TK-4 | Brüt tahsilatta bekletilen kısım iki kez | **2** | **MERGED `2507f73c`** (#2860, 01.10.2026 02:14 TSİ) |
| TK-5 | `totalPaidAmount`/`allocatedPaidAmount` tahsis edileni değil yüz değeri taşıyor | **2 (KP-7 ile birlikte)** | Hedef anlam ALC-AUTH-1B'de karara bağlı. Ancak pilot etiketi bu alanı gösterdiği için değer değişikliği etiketi doğrudan değiştirir; KP-7 kararıyla birlikte uygulanır. |
| TK-6 | Masraf/fer'i kanonik mahsup simülasyonunda yok | **2 + 3** | Hedef karara bağlı (MUST-3/I-15, doc-27; KP-6 = grup 1). Uygulama yalnız KP-4 ve KP-5 seçimlerini bekler. |
| TK-7 | İstenmiş faiz sessizce dışlanıyor | **2 + 3** | Görünür tanı (engelsiz) teknik: grup 2. Engel kuralı (dönem çakışması) KP-3: grup 3. |
| TK-8 | Kalıcı yolda eşit `sortOrder` sırası belirsiz | **1** | ADR-014 MUST-7 ("non-deterministic allocation" → fail closed) ve I-02/I-03 (deterministik sıra, açık eşitlik kuralı). KP-1'i beklemeden düzeltilebilir. |
| TK-9 | Denetimi eksik NO_INTEREST "açık faizsiz" etiketleniyor | **1** | decision-log PR-A0 A2 (denetim alanları zorunlu), PR-A5; RCV-CLAIM-FORM-P01 "UNRESOLVED ≠ NO_INTEREST". Bugün sayısal etkisi yok. |
| TK-10 | Politika bekletmeli kalem faiz alıyor | **1** | RECEIVABLE-GOVERNANCE 23.7.8 (owner durumu RATIFIED — BINDING): faiz hesaplanamaz ve borç faizsiz de sayılamaz → çözülemeyen (D2-b1 yolu). Aynı bölüm "IMPLEMENTATION AUTHORITY NONE" diyor; uygulama ayrı GO ister. Oluşturma bayrağının kod varsayılanı kapalı; **canlı ayar ölçülmedi.** |
| TK-11 | Borçlu skoru `totalDue`'yu para birimleri arasında topluyor | **2** | REC-ALLOC-008 çapraz para birimi toplamını yasaklar. Üretimde çağıranı yok (`debtor-scoring.module.ts`). |
| TK-12 | Takip talebi metni TBK 100 sırasını masraf/fer'i için söylüyor | **2 + 3** | TK-6'ya bağlı (KP-4/5). |
| TK-13 | Şablon "YASAL"ı belirtilmemiş sayıp TİCARİ seçiyor | **3** | KP-2'ye bağlı. |

**Bu GO'da uygulanmayan grup 1–2 maddeleri:** TK-5, TK-7 görünürlük, TK-8, TK-9, TK-10, TK-11. GO yalnız TK-1…TK-4 için uygulama yetkisi verdiği için ayrı dar PR adayı olarak bırakıldı; TK-10 ayrıca açık uygulama GO'su ister. Önerilen sıra:
1. TK-9 (b2 öncesi zorunlu)
2. TK-8
3. TK-7 görünürlük
4. TK-11
5. TK-10 (GO ile)
6. TK-5 (KP-7 ile)

## 2. Teknik düzeltmeler (grup 2) — bu GO

| # | Önce (sentetik) | Sonra | PR |
|---|---|---|---|
| TK-1 | YASAL kalem A (%73) + SABIT kalem B (%36,5): A faizi 121,00, toplam 2.180 "OK" | A 180,00, toplam 2.239 "OK" | #2859 `d4f2b9fc` |
| TK-2 | Oran boşluğu → 121,00 veya 100,00 "OK"; oran yok → 0 faiz "OK" | Anapara görünür, faiz `null`, durum UNAVAILABLE, gerekçe kodu `RATE_COVERAGE_MISSING`, eksik dönem tanıda | #2859 `d4f2b9fc` |
| TK-3 | Hesap tarihi 11.04, ödeme 01.05: 1.000 | 1.100; ödeme "hesap tarihinden sonra" bilgisinde (`PAYMENTS_AFTER_AS_OF_EXCLUDED`) | #2860 `2507f73c` |
| TK-4 | 1.200 tahsilat, HELD 200: brüt 1.400 | 1.200 | #2860 `2507f73c` |

**Korunan işleyiş (GO madde 4):**
- Tahsilat, borçlu ve sorumluluk kaydı değişmez ve reddedilmez; kanonik yol salt okuma.
- Hesap tarihi filtresi yalnız o tarihin hesabından çıkarır.
- Hesap tarihinden sonraki iptalin sıfır net etkisi (ADR-014 MUST-6) korunur.
- Tek tahsilattan ikinci para kaydı üretilmez.
- Resmî (kalıcı) mahsup yeniden dağıtılmaz.
- Adli belge, ofis içi sorumluluk ve mutabakat hesapları ayrı kalır.

**Bilinen sınırlar:**
- **TK-4 belirtiyi düzeltiyor.** Kök TK-5: `allocatedPaidAmount` tahsis edileni değil yüz değeri taşıyor. REC-ALLOC-008'e göre tahsilat = Σ uygulanan + bekletilen kalan; TK-5 KP-7 ile düzeltilince brüt formülü bu tanıma kendiliğinden oturur.
- İade edilmiş fazla ödemenin tutarı yüz değerde kalıyor.
- Kanonik hesapta hiç tahsis almayan ve HELD kaydı da olmayan tahsilat brüte girmiyor. Bu önceden de böyleydi.
- **TK-2 eski oranı yakalamaz.** Oran tablosunun eskimesini yakalamaz: açık uçlu son satır "kapsanmış" sayılır (§4 KP-2).

## 3. Grup 1 — karar var, iş uygulama

- **KP-6:** ADR-014 MUST-3 ve I-15 dosya içi mahsubu masraf → fer'i → faiz → anapara sırasıyla zorunlu kılıyor. Bugünkü kanonik simülasyon masraf ve fer'iyi mahsuba almıyor; bu bağlayıcı kurala aykırı (TK-6).
  - **Aynı örnekte** (R01 K-3a: 10.000 %36,5, masraf 500, tazminat 1.000; 1.200 tahsilat 31.01; hesap tarihi 02.03):

    | Durum | Mahsup | Toplam |
    |---|---|---|
    | kurala göre | masraf 500 + tazminat 700 | anapara 10.000 + faiz 600 + tazminat 300 = **10.900** (elle) |
    | bugünkü kanonik | faiz 300 + anapara 900 | 9.373 + masraf 500 + tazminat 1.000 = **10.873** (motor) |

  - Kalıcı yol bugün masraf 500 + tazminat 700 dağıtıyor (kod okuması). Kanonik yol aynı parayı başka kaleme yazıyor.
  - TK-6 uygulaması yalnız KP-4 (sorumluluğu kaydedilmemiş tazminat) ve KP-5 (tarihsiz masraf) seçimlerini bekler.
- **TK-8:** ADR-014 MUST-7 belirsiz tahsiste fail-closed, I-03 açık eşitlik kuralı ister. Eşit `sortOrder`'da sonuç değişiyorsa işlem açık tanıyla durur; ayrı bir sıra seçilmez. Kalıcı yolun genel sırası KP-1'e bağlı.
- **TK-9:** hedef davranış kayıtlı (denetimi eksik NO_INTEREST çözülemeyen sayılır). Sayısal etkisi bugün yok: iki durum da engel.
- **TK-10:** hedef davranış kayıtlı; uygulama ayrı GO ister (23.7.8 "IMPLEMENTATION AUTHORITY NONE").

## 4. Grup 3 — owner kararı bekleyenler (her biri aynı örnekte)

Sabit oran %36,5 (günlük tutarın binde biri) kullanıldı.
- "motor" = gerçek `CaseBalanceService` + motor + görünüm (`evidence/`).
- "motorla eşdeğer" = motor ayrı girdilerle koşuldu, sonuç birleştirildi.
- "elle" = elle hesap.

### KP-1 — Anaparalar arası mahsup sırası
- **Owner yönü (R2):** dominant ölçüt "ilk takip edilen borç", vade değil. TBK 102: muaccel → ilk takip edilen → (takip yoksa) vade → orantılı → güvencesi en az. TBK 101: borçlu bildirimi ve makbuz önce gelir.
- **Örnek A (R01):** takip 15.03; tahsilat 15.000 (01.04); hesap tarihi 30.04. A 10.000 %36,5, başlangıç = vade 01.01, `sortOrder` 1. B 10.000 %73, başlangıç = vade 01.03, `sortOrder` 0.

| Sıra | Toplam |
|---|---|
| Bugünkü kanonik (faiz başlangıcı; A önce) | 6.898,16 (motor) |
| Aynı takip → vade (A önce) | 6.898,16 (motor; aynı sıra) |
| `sortOrder` (B önce) + işleyen faiz | 6.709,08 (elle, varsayımsal; bugünkü kalıcı yol işleyen faiz hesaplamaz: A 5.000, B 0) |

- **Örnek B (R01, faizsiz anapara N):** sıra A→N ile N→A arasındaki fark 1.065,00 TL (motorla eşdeğer).
- **Owner'dan istenen teyitler:**
  1. Aynı takipteki anaparalarda "ilk takip edilen" eşit kalıyor. TBK 102 bu durumda vadeyi yalnız "takip yoksa" sayıyor; aynı takipte vadeye geçilmesi bir yorum mu?
  2. Vadesi kaydedilmemiş anaparada ne yapılır: açık engel mi (ADR-014 MUST-7 eğilimi)?
  3. Borçlu bildirimi ve makbuz için yapısal alan (ALC-P1-1) gelene kadar kanuni sıra etiketle mi uygulanır, yoksa çok anaparalı ödemeli dosya engelde mi kalır?
- **Bağımlılık:** kalem düzeyinde takip tarihi alanı (dosya düzeyinde `Case.caseDate` var) ve ALC-P1-1. ALC-P1-3 zincirinde avukat onayı şartı var.
- **Öneri:** teyitlerden sonra dizi iki yolda tek, sürümlü kural olarak uygulanır.

### KP-2 — Seçilmemiş "YASAL" dosya faiz türü
- **Örnek (motor):** 10.000 TL kalem, faiz durumu UNKNOWN, kalem başlangıcı 01.01; dosya türü kullanıcı seçmeden varsayılan YASAL; takip 15.01; 1.000 TL tahsilat 10.02; hesap tarihi 31.03. Oran tablosu seed biçiminde: LEGAL_3095 2024-06-01'den açık uçlu %24. Seed değeri; gerçek oran doğrulanmadı.

| Seçenek | Hesap özeti (ofis içi) | Adli belge (takip talebi) |
|---|---|---|
| (A) varsayılan YASAL meşru (bugün) | **9.561,46 "OK"**; "tür varsayıldı" tanısı yok | çek/senet/fatura dosyasında şablon TİCARİ seçiyor (TK-13): belge ile hesap ayrışabilir |
| (B) hesap sürer + "dosya faiz türü teyitsiz" uyarısı; yeni dosyada açık seçim zorunlu | 9.561,46 + uyarı | TK-13 düzeltilince hesapla aynı tür |
| (C) seçim kaynağı olmayan tür çözülemeyen sayılır | 10.000 anapara görünür, faiz `null`, UNAVAILABLE | belge faiz satırı üretilemez |

- R01'deki 9.860,60 ayrı bir senaryoydu: SABIT dosya türü, kalem oranı %36,5.
- **Öneri:** hukuki doğrulama bitene kadar kural değişmesin; sonra B.
- **Ek (§5):** 31/7/2026'dan itibaren kanuni faiz formülle belirleniyor (reeskont × %80). Oran tablosunun bunu yansıtıp yansıtmadığı ölçülmedi. Seed'deki son LEGAL_3095 satırı açık uçlu %24.
  - Bu bir veri ve oran kuralı işi (ALC-P1-4, owner R3); KP-2'den bağımsız.
  - TK-2 bunu yakalamaz.

### KP-3 — İstenmiş işlemiş faiz kayıtları
- **Örnek (motor, R01):** 10.000 anapara, istenmiş faiz 500 (01.12–20.01), takip 20.01, tahsilat 1.000 (01.03), hesap tarihi 31.03; anapara faizi takip tarihinden işliyor.

| Seçenek | Ofis içi toplam | Adli belge |
|---|---|---|
| (A) bugünkü sessiz dışlama | 9.682 "OK"; 500 hiçbir çıktıda yok | talepte 500 var: ayrışık |
| (B) dışlama + görünür tanı (TK-7) | 9.682 + "istenmiş faiz hesaba katılmadı: 500" | ayrışıklık görünür |
| (C) ACCRUED_INTEREST kovası (ADR-014 hedefi) | 10.197 (elle) | uyumlu |

- **Öneri:** hemen B (teknik), karar sonrası C.
- **Owner'dan istenen:** eski kayıt envanteri, göç biçimi ve dönem çakışması kuralı.

### KP-4 — Sorumluluğu kaydedilmemiş çek tazminatı
- **Örnek (motor):** çek 10.000 (01.01'den %36,5), çek tazminatı 1.000, sorumluluk kaydı yok; borçlular keşideci ve ciranta; ödemesiz; hesap tarihi 02.03.
- Alacak kalanı 10.600; tazminat dahil 11.600.

| Seçenek | Ekrandaki toplam | Cirantanın ödemesi |
|---|---|---|
| (i) tüm borçlular sorumlu (bugünkü varsayılan) | 11.600, herkes için | kalıcı yolda keşidecinin tazminatına gidiyor (kod okuması); owner kararına aykırı |
| (ii) tazminat dışarıda + tanı | 10.600 + "tazminat sorumluluğu kaydedilmemiş" | tazminata gitmez |
| (iii) ödemesiz dosyada brüt kesin + etiket; ödemeli dosyada engel | 11.600 etiketli; ödemeli dosyada UNAVAILABLE | ödemeli dosya kayıt tamamlanana kadar hesaplanmaz |

- **Öneri:** (iii).
- **Bağımlılık:** TK-6.

### KP-5 — Tarihi kaydedilmemiş masraf
- **Örnek (elle):** 10.000 (01.01'den %36,5); tahsilat 1.000 (31.01); masraf 500 sisteme 15.02'de girilmiş, gerçek tarihi yok; hesap tarihi 02.03.

| Seçenek | Mahsup | Toplam |
|---|---|---|
| (i) kayıt anı (`createdAt`) masraf tarihi | tahsilatta masraf yoktu → faiz 300 + anapara 700 | 9.300 + 279 + 500 = **10.079** |
| (ii) ödemeli dosyada engel + tanı | — | UNAVAILABLE; 10.000 anapara ve 500 masraf görünür |
| (iii) masraf tarihi alanı; ör. gerçek tarih 10.01 | masraf 500 + faiz 300 + anapara 200 | 9.800 + 294 = **10.094** |

- **Öneri:** kısa vadede (ii), kalıcı çözüm (iii). `createdAt` hukuki masraf tarihi sayılmamalı.

### KP-7 — Pilot "Toplam tahsilat" etiketi (daraltılmış)
- **Örnek (motor):** 1.000 anapara, 1.200 tahsilat (01.01), HELD 200.

| Seçenek (etiketin gösterdiği alan) | Değer |
|---|---|
| (A) `grossReceivedAmount` — dosyaya fiilen gelen | **1.200** |
| (B) borca tahsis edilen (TK-5 sonrası `allocatedPaidAmount`) | **1.000** |

- **Bugün:**
  - Web pilotu etiketi `totalPaidAmount` ile dolduruyor: 1.200. Bu, B'nin adı ama yüz değer.
  - API uyum katmanı aynı satıra `grossReceivedAmount`'ı koyuyor: TK-4 öncesi 1.400, sonrası 1.200.
  - ADR-014 I-10 (UI = API = rapor) iki yolun aynı alanı göstermesini ister; hangi alanın gösterileceği etiket kararıdır.
- **Öneri:** A. Pilot varsayılan kapalı.

### KP-8 — DİĞER türündeki çoklu OCR evrakı
- **Örnek:** taramada iki satır var: fatura 11.800 (10.000 + KDV 1.800) ve DİĞER (sözleşme eki, 3.000).

| Seçenek | Sonuç |
|---|---|
| (A) fatura → rozetli PRINCIPAL taslak; DİĞER → zorunlu seçim (kalem türü / yalnız belge / çıkar) | toplam 11.800; 3.000 yalnız kullanıcı kalem seçerse eklenir |
| (B) bugün: açılış 400, elle giriş | toplam kullanıcının girdiği kadar; aynı fatura iki kez girilirse 23.600 (kambiyo dışında ikinci giriş uyarısı yok) |

- **Öneri:** A (R01 §6.1).

### KP-9 — Kanıtsız varsayılan yetkinin onayı
- **Parasal etkisi yok.** Örnek: yeni avukat Y'nin varsayılanı {görüntüle, düzenle}.

| Seçenek | Sonuç |
|---|---|
| (A) ayrı "onayla" aksiyonu + durum rozeti | onaydan sonra açılan dosyalara uygulanır; iz ayrı eylem kaydında |
| (B) bugün: değiştir → geri al | iki yanıltıcı değişiklik kaydı; aradaki dosyalar ara değeri alır |
| (C) aynı değeri kaydetmek onay sayılır | iz yok, "onay" ile "değişiklik" ayırt edilemez |

- **Öneri:** A (R01 §6.2). Ek karar: kendi kaydını kim onaylayabilir?

### KP-10 — Geçmiş dosya etki sayımı için erişim
- **Parasal değil.** Seçenekler:
  - (A) son yedeğin izole geri yüklemesinde salt okuma;
  - (B) canlıda salt okuma rolü;
  - (C) ölçmeden karar.
- **Öneri:** A. Sorgular R01 §5'te, ekler §6'da.

### KP-11 — Hesap tarihi varsayılanı
- **Örnek (motor, TK-3 dalında):** 1.000 TL (01.01'den %36,5); 100 TL ödeme 01.05.

| Varsayılan | Hesap tarihi | Toplam |
|---|---|---|
| (A) bugün | 30.09 | **1.172** |
| (B) son ödeme tarihi | 01.05 | **1.020** |
| (C) kullanıcı seçer (ör. 11.04) | 11.04 | **1.100**; 100 TL ödeme "hesap tarihinden sonra" bilgisinde |

- **Öneri:** owner tercihi.
- "Bugün" UTC günüyle üretiliyor (TSİ 00:00–03:00 arası bir önceki gün). Bu ADR-014 I-06 gün kesimi konusu, ayrı karar.

## 5. 3095 md. 1 — resmî kaynak doğrulaması ve kayıt düzeltmesi

Kaynaklar resmî sitelerden indirildi, birincil metinler elle yoklandı. İndirme 30.09.2026, UTC 21:27–21:34. SHA-256 değerleri:

| Kaynak | SHA-256 |
|---|---|
| mevzuat.gov.tr `1.5.3095.pdf` | `f1d5cf34f3dc2fd338833ebcbc379da67590a960ba3169efef2a9567c865fb4a` |
| mevzuat.gov.tr `1.5.7589.pdf` | `88749eb59cfaf0b539e564629ada76e205234e240fdb6ec5c08bb398e922207c` |
| resmigazete.gov.tr `eskiler/2026/07/20260731-1.htm` | `b9ee9b03725d2d3426f4ac24efed01874f6032dc0b3d9f293bcb94b257e7e16a` |

- **Değişiklik:** 3095 md. 1, **7589 sayılı Kanun md. 10** ile değiştirildi.
  - 7589: "Yargının Etkin ve Verimli İşlemesine Yönelik Bazı Kanunlarda Değişiklik Yapılmasına Dair Kanun"; TBMM teklifi 2/3737.
  - **Kabul:** 16/7/2026.
  - **Resmî Gazete:** 31/7/2026, sayı 33326.
- **Yürürlük:** 7589 md. 26/1-c: "Diğer maddeleri yayımı tarihinde". md. 10 (a) ve (b) bentlerinde yok, yani **31/7/2026**. mevzuat.gov.tr yürürlük listesi de 31/7/2026 gösteriyor.
- **Yeni metin:** sözleşmede oran yoksa kanuni faiz, TCMB'nin **önceki yılın 31 Aralık günü kısa vadeli kredi işlemlerinde uyguladığı reeskont oranının yüzde sekseni**. 30 Haziran oranı önceki yılın 31 Aralık oranından beş puan veya daha çok farklıysa yılın ikinci yarısında 30 Haziran oranının yüzde sekseni geçerli.
- **Geçiş:** 7589 bu değişiklik için yeni bir geçiş hükmü eklemedi. 7589 Geçici Madde 1 başka kanunlarla ilgili. 3095'in mevcut Geçici Madde 1–2'si duruyor; bunların bu değişikliğe uygulanıp uygulanmayacağı ve yıl ortasında yürürlüğe giren hükmün 2026'nın hangi dönemine hangi oranla uygulanacağı hukuki yorum ister. Burada varsayılmadı.
- **Önceki metin:** 5335 md. 14 ile yıllık %12; Cumhurbaşkanı değiştirebiliyordu (KHK/700).
  - AYM 22/7/2025, E.2024/24, K.2025/164 (RG 1/12/2025, 33094): md. 1'i "sözleşmeden kaynaklanmayan borç ilişkileri" yönünden iptal etti; iptal 1/9/2026'da yürürlüğe girecekti.
  - Karar PDF'i görüntü; iptal yürürlük tarihi TBMM S.Sayısı 280 gerekçesinden.
- **Düzeltilen kayıtlar:**
  - R01 KP-2 ve bellek "16/7/2026'da değişti" diyordu. Doğrusu: 16/7/2026 kabul tarihi, yürürlük 31/7/2026.
  - R01'deki "kısa vadeli reeskont oranı" ifadesi kanun metnine göre düzeltildi.
  - "Yıl ortasında değişirse" ifadesi daraltıldı: kıyas yalnız 30 Haziran ile önceki 31 Aralık arasında.
  - `product-backlog.md` ALC-P1-4'e kanunlaştı notu eklendi.
- **Ölçülmeyen:** TCMB'nin 31/12/2025 ve 30/6/2026 reeskont oranları, oran tablosunun güncelliği, seed'deki %24'ün dayanağı.
- **Bu doğrulama tek başına hesap politikası değişikliği yetkisi değildir.** Oran tablosuna ya da hesaba dokunulmadı.

## 6. Etki sayımı planına ekler (KP-10; salt okuma, ayrı GO)

R01 §5 koşulları aynen geçerli: izole kopya, veritabanı adı "test" içerir, salt okuma işlem, çıktı yalnız sayı.

**SQL-5 — TK-2 adayları: kalemin faiz türünde oran satırı hiç olmayan ya da ilk oranı faiz başlangıcından sonra başlayan**
```sql
SELECT ci."tenantId", ci."interestTypeCode"::text AS tur, count(*) AS kalem, count(DISTINCT ci."caseId") AS dosya,
       count(*) FILTER (WHERE r.ilk IS NULL) AS turde_oran_yok,
       count(*) FILTER (WHERE r.ilk IS NOT NULL AND ci."interestStartDate" < r.ilk) AS baslangic_ilk_orandan_once,
       count(*) FILTER (WHERE ci."interestStartDate" IS NULL) AS baslangicsiz
FROM "ClaimItem" ci
LEFT JOIN (SELECT "tenantId", "interestType", min("validFrom") AS ilk FROM rate_schedule GROUP BY 1, 2) r
       ON r."tenantId" = ci."tenantId" AND r."interestType" = ci."interestTypeCode"::text
WHERE ci."itemType" = 'PRINCIPAL' AND ci."status" IN ('ACTIVE','COLLECTED')
  AND ci."interestTypeCode" IS NOT NULL
  AND ci."interestTypeCode"::text NOT IN ('COMMERCIAL_FIXED','CONTRACTUAL')
GROUP BY 1, 2 ORDER BY 1, 2;
-- Sınır:
--  * legacy tür alanından ve dosya düzeyinden çözülen türler dahil değil;
--  * başlangıcı boş kalem ayrı sayılır (dosya düzeyinden başlangıç alabilir);
--  * oran tablosunun ara boşlukları SQL-4'te;
--  * son oranı hesap tarihinden önce biten tür yakalanmaz.
-- Kesin sayı kanonik harness ile.
```

**SQL-6 — TK-4 yaklaşık adayları: kısmi fazla ödemesi olan tahsilatlar**
```sql
SELECT o."tenantId", count(*) AS held_kayit, count(DISTINCT o."caseId") AS dosya
FROM "CollectionOverpayment" o
WHERE o."status" = 'HELD' AND o."remainingAmount" > 0
  AND COALESCE((o."metadata"->>'allocatedAmount')::numeric, 0) > 0
GROUP BY 1 ORDER BY 1;
-- Sınır: çift sayım kanonik hesapta tahsis alan tahsilatta oluyordu. Kalıcı yoldaki allocatedAmount > 0 bununla aynı
-- değil (ör. kalıcıda 0 olup kanonikte faize giden tahsilat sayılmaz). Kesin sayı kanonik harness ile.
```

TK-3'ün etkisi veriye değil hesap tarihine bağlıdır; geçmiş tarihli rapor ve ekstre sayısı uygulama günlüğünden ölçülür, DB'den ölçülmez.

## 7. Kanıt sınırları

- **Sayılar sentetik.** Ölçüm düzenekleri test paketine eklenmedi. Motorla ölçülenler ve ölçüldükleri kod:
  - R01 `evidence/dp-scenarios.*`: main `626362b8`.
  - R02 `evidence/kp-r02.*`: dal `claude/k3l-tk-asof-gross-received-r01` @ `2d9ec8ec`, TK-3/TK-4 dahil.
  - `evidence/kp2-yasal.*`: main `0bd440ae` kodu.
  - "elle" işaretliler elle hesap.
- **Canlı veri ölçülmedi.** Canlı R27 bu düzeltmeleri içermiyor (main ≠ canlı).
- **Hukuki metin** resmî kaynaktan okundu; avukat teyidi yerine geçmez.
- **Dış belge / UYAP kabulü iddia edilmez.**

## 8. Bağımsız inceleme bulguları ve işlenişi

Taslak ayrı bir ajanla çürütülmeye çalışıldı: yeniden hesap, kaynak ve şema kontrolü. Yeniden hesaplanan tüm sayılar ve 3095 tarihleri doğru çıktı. İşlenen düzeltmeler:
- KP-1 grup 1 → 3: dizi onaylı karar değil, owner yönü var.
- KP-6 grup 3 → 1: ADR-014 MUST-3/I-15.
- KP-7 daraltıldı: alan anlamları ALC-AUTH-1B'de karara bağlı.
- TK-5 grup 2 (KP-7 ile birlikte).
- TK-8 dayanağı ADR-014 MUST-7 ve I-02/I-03.
- TK-10'a uygulama yetkisi notu eklendi; "canlı etkisi yok" ifadesi "kod varsayılanı kapalı, canlı ölçülmedi" yapıldı.
- KP-2 örneği gerçek YASAL senaryosuyla motorda yeniden ölçüldü.
- KP-1 `sortOrder` satırı "varsayımsal" olarak etiketlendi.
- "Takip tarihi alanı yok" ifadesi "kalem düzeyinde yok" yapıldı.
- 3095 geçiş ifadesi düzeltildi; SHA-256 değerleri eklendi.
- SQL-5 ve SQL-6'ya sınır notları eklendi.
- Açık PR'lar önce "düzeltme PR'ı" olarak yazıldı; merge sonrası MERGED SHA'larıyla güncellendi (#2859 `d4f2b9fc`, #2860 `2507f73c`).

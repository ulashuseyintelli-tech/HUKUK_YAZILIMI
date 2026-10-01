# K3-L D2 — Kalan teknik kalemler ve owner kararları R03

- **Tarih:** 01.10.2026 (TSİ)
- **İş:** K3L-D2-REMAINING-R03 (owner GO 01.10.2026; ilgili cümleler Ek A'da).
- **İlişki:** R01 (`K3L-D2-DECISION-PACKAGE-R01.md`) kanıt ve ayrıntı kaydı; R02 (`…-R02.md`) üç gruplu sınıflama, TK-1…TK-4 ve 3095 kaydı. Bu belge R02'den sonra kapananları, uygulanan owner kararlarını ve **hâlâ owner cevabı gerekenleri** taşır.
- **Bağımsız inceleme:** taslak ayrı bir ajanla kaynak koda karşı çürütülmeye çalışıldı; bulgular işlendi (§8).
- **Durum ayrımı:** teknik teslim = aşağıdaki PR'lar · canlı yayın = yok (canlı R27 bunların hiçbirini içermez) · dış belge / UYAP kabulü iddia edilmez.
- **Bu belge öneri sütunlarının toplu kabulü DEĞİLDİR.** Her soru owner kararını bekler.
- **Kapsam dışı:** canlı yayın, bayrak açma, canlı DB erişimi, geçmiş kayıt düzeltmesi, gerçek tahsilat işlemi, e-posta ve UYAP gönderimi.

## 1. Bu turda kapananlar

Saatler merge anıdır (TSİ).

| Kalem | Ne değişti | PR / commit |
|---|---|---|
| **TK-9** | Denetimi (gerekçe, onaylayan, zaman) eksik faizsizlik beyanı "açık faizsiz" sayılmıyor; kalem çözülemeyen olarak kalıyor | #2863 `e46ae534` (12:45) |
| **TK-10** | Politika bekletmeli oluşum kalemi, kendi faiz otoritesi yokken dosya düzeyinden faiz almıyor; faizsiz de sayılmıyor (RECEIVABLE-GOVERNANCE 23.7.8; uygulama yetkisi GO §2) | #2863 `e46ae534` |
| **TK-11** | Borçlu skoru finansal girdisi para birimleri arasında toplam yapmıyor (REC-ALLOC-008) | #2863 `e46ae534` |
| **KP-7 + TK-5** | Kanonik görünümde Toplam tahsilat / Borca uygulanan / Dağıtım bekleyen ayrı; `totalPaidAmount` belgelenmiş anlamına getirildi; uyum katmanı v2; pilot farklı tarihli raporu birleştirmiyor | #2864 `83a2898f` (13:15) |
| **KP-3 ilk aşama + TK-7 görünürlük** | Talep edilmiş işlemiş faiz kanonik görünümde ve hesap özetinde ayrı blok ve uyarıyla görünür; bu iki yerde toplamlara eklenmiyor | #2864 `83a2898f` |
| **KP-11** | Hesap tarihi varsayılanı Türkiye takvimine göre bugün; sihirbaz taslağı hesap tarihini saklıyor; ödeme önizlemesi kullandığı tarihi döndürüyor | #2865 `9a44391a` (13:50) |
| **KP-2 + TK-13 (yeni dosya)** | Sihirbazda faiz türü açık seçim; tür istekte gelmezse kaynağı "sistem varsayılanı" olarak yazılıyor ve YASAL kesin tercih sayılmıyor; kaynağı doğrulanamayan eski varsayılan uyarıyla; şablon açıkça seçilmiş YASAL'ı ezmiyor | #2866 `e7c28685` (14:19) |
| **KP-9 (durum)** | Avukatın varsayılan dosya yetkisinin durumu görünür: salt okuma ucu, avukat satırında rozet, avukat formunda neden ve kayıtlı değer. Onay aksiyonu yok | #2868 `b0e35bf5` (14:58) |
| **KP-8** | Sihirbazda evrak taraması kullanıcı teyidi olmadan borç yaratmıyor: tek belge taraması ile çoklu taramadaki fatura ve diğer belge karar bekleyen kayıt oluyor; kalem yalnız formda incelenip eklenince oluşuyor; aynı fatura (no + tutar + para birimi) ikinci kez eklenmiyor | #2869 `04b764ac` (15:40) |

**Uygulanmayan ya da kısmen uygulanan owner kararları:**

| Karar | Uygulanan | Uygulanmayan | Neden |
|---|---|---|---|
| KP-3 | Görünürlük; görünüm ve hesap özetinde çift sayım yok | Kova ve muhasebeleştirme | GO §3: "bu GO ile kendiliğinden muhasebeleştirme yapma"; tasarım §4'te |
| KP-8 | Karar kuyruğu, DİĞER sınıflandırma, sihirbazda mükerrer fatura koruması | Taranan belgenin dosyaya ek olarak yüklenmesi; sunucu tarafında mükerrer fatura koruması | "Yalnız ek belge" kararı yalnız sihirbaz taslağında (tarayıcıda) tutuluyor, sunucuda izi yok; belge yükleme için sihirbazda arka uç bağlantısı yok. Çoklu taramada çek / senet / poliçe için teyit, tarama inceleme tablosundaki satır seçimi olarak kaldı |
| KP-9 | Durum gösterimi | "Bu değerleri onayla" aksiyonu | Mevcut kurallar çelişiyor; tek soru §3.7 |
| KP-11 | Varsayılan, taslak, önizleme çıktısı | Takip talebi belgelerinde hesap tarihi | Taslak belge toplamı ve tarihi hukuki karar; §3.8 |
| KP-2 | Sihirbaz, kaynak kaydı, uyarı, şablon | Eski dosyalarda ve API'den türsüz açılan dosyada şablon / hesap ayrışması | Mevcut dosyanın davranışını değiştirmek olurdu; §3.9 |
| KP-1 | — | Anapara sırası | GO §5: "bu sırayı henüz uygulama"; üç teyit §3.1 |
| KP-4, KP-5 | — | Eksik sorumluluk / tarihsiz masraf | Seçenekler §3.2 ve §3.3 |
| TK-8 | — | Eşit `sortOrder`'da fail-closed | Uygulama bir seçim ve yeni mekanizma gerektiriyor; tek soru §3.4 |
| TK-6, TK-12 | Görünür sınır (`UNAPPLIED_MAY_BELONG_TO_COSTS`) | Masraf / fer'i mahsubu | KP-4 ve KP-5'e bağlı (§2) |
| Oran verisi | Mekanizma dökümü ve kontrol tasarımı | Kod, veri, yeniden hesap | GO §6; §5 |
| KP-10 | Plan | Ölçüm | GO §8; §6 |

**KP-9 için alan sınıflandırması notu.** Yeni uç `OfficeF01AuthorizationGuard` arkasındadır. `storedPermissions`, sınıflandırma matrisinin satır 89'unda S1 sayılan `lawyer.defaultPermissions`'ın yalnız bilinen yedi anahtarını taşır; yani matrisin S1 saydığı ama okuma yanıtlarının taşımadığı bu veri, yeni uçtan F01 yetkili aktöre okunur olmuştur. Türetilmiş alanların (`appliesAtCaseOpen`, `reason`, `managementRecordedAt`) dayanağı GO §5'tir. Yönetim kaydını yazan kişi dönmez. Mevcut okuma yanıtlarına alan eklenmedi; F01 izin listesi dosyası değişmedi.

## 2. TK-6, TK-12 ve TK-13 neden son raporda görünmedi

R02 kapanış raporunda kalan teknik işler iki listeden derlendi:
- R02 tablosundaki tam satırlar (TK-1…TK-13);
- "Bu GO'da uygulanmayan grup 1–2 maddeleri" listesi (TK-5, TK-7 görünürlük, TK-8, TK-9, TK-10, TK-11).

TK-6, TK-12 ve TK-13 ikinci listede yoktu. Çünkü grupları "2 + 3" ya da "3" idi; yani uygulama bir owner kararına bağlıydı. Rapor bunları ilgili KP kalemleri altında saydı, ama TK numarasıyla ayrıca yazmadı. Bu yüzden sayaç eksik liste üzerinden kapanmış gibi göründü. **Hiçbiri kapanmamış ya da başka kaleme taşınmamıştı.** Bugünkü durum:

| # | Kusur | Grup | R03 sonrası durum | Neyi bekliyor |
|---|---|---|---|---|
| TK-6 | Masraf ve fer'i kanonik mahsup simülasyonunda yok (ADR-014 MUST-3 / I-15) | 2 + 3 | **AÇIK.** Yalnız görünür sınır eklendi: borca uygulanmayan ödeme varken masraf / fer'i varsa `UNAPPLIED_MAY_BELONG_TO_COSTS` uyarısı (#2864) | KP-4 ve KP-5 (§3.2, §3.3) |
| TK-12 | Takip talebi metni TBK 100 sırasını masraf / fer'i için söylüyor; kanonik hesap uymuyor | 2 + 3 | **AÇIK** | TK-6 |
| TK-13 | Şablon "YASAL"ı belirtilmemiş sayıp TİCARİ seçiyor | 3 | **KISMEN KAPANDI.** Sihirbazdan açılan yeni dosyada kapandı (#2866). Eski dosyalarda ve API'den türsüz açılan dosyada ayrışma sürüyor; uyarı görünür | §3.9 |

**TK-13 kapsam düzeltmesi.** R02, "çek / senet / fatura dosyasında" diyordu. Koda göre TİCARİ'ye düşen yalnız dosya türü `CHECK` ya da `BOND` olan dosyalardır. Şablondaki fatura / cari hesap dalı `subCategory` üzerinden çalışıyor; ama `Case.subCategory` yalnız GENEL / NAFAKA / DOVIZ / KIRA / CEZA değerlerini alabiliyor ve sihirbaz faturayı GENEL yazıyor. O dal kayıtlı dosyada hiç çalışmıyor; fatura dosyasında şablon YASAL yazıyor.

On üç kalemin tamamı:

| Kalem | Durum |
|---|---|
| TK-1, TK-2, TK-3, TK-4 | MERGED (#2859, #2860) |
| TK-5 | MERGED (#2864) |
| TK-6 | AÇIK (KP-4 / KP-5) |
| TK-7 görünürlük | MERGED (#2864). Engel kuralı (dönem çakışması) KP-3 kova tasarımına bağlı (§4) |
| TK-8 | AÇIK — tek soru (§3.4) |
| TK-9, TK-10, TK-11 | MERGED (#2863) |
| TK-12 | AÇIK (TK-6) |
| TK-13 | Sihirbazdan açılan yeni dosyada MERGED (#2866); eski dosyalar AÇIK (§3.9) |

## 3. Owner'ın cevabı gereken kalan sorular

"motor" = gerçek kanonik motorla ölçüldü; "elle" = elle hesap. Tüm sayılar sentetiktir.

| § | Soru | Öneri | Sayısal fark |
|---|---|---|---|
| 3.1 | KP-1: aynı takipteki anaparalarda sıra (üç teyit) | (a) / (a) / (a) | 94,54 · 189,08 · 1.065,00 |
| 3.2 | KP-4: sorumluluğu kayıtsız çek tazminatı nasıl tamamlansın | (ii) + (i) | ciranta için 1.000 |
| 3.3 | KP-5: tarihsiz masraf hangi tarihe bağlansın | kısa vadede (ii), kalıcı (iii) | 15 |
| 3.4 | TK-8: eşit `sortOrder`'da ne yapılsın | önce ölçüm; ara adım (c) | kalem bazında 5.000 |
| 3.5 | KP-7 / D1: bekletilen para "Toplam tahsilat"a girer mi | (a) girer | 1.500 |
| 3.6 | KP-3: kova tasarımının üç açık noktası | §4 | 515 |
| 3.7 | KP-9: yönetici kendi kaydının varsayılanını onaylayabilir mi | (A) | parasal değil |
| 3.8 | KP-11: taslak takip talebinde toplam ve hesap tarihi | (a) | 300 ve 2.581,77 |
| 3.9 | TK-13: eski çek / senet dosyasında şablon ve hesap farklı faiz türü kullanıyor | (c) | 591,78 |

### 3.1 KP-1 — kalan üç teyit (sıra UYGULANMADI)

Owner'ın "ilk takip edilen borç" yönlendirmesi, ajanların yazdığı yedi adımlı dizinin onayı **sayılmadı**. Dizi uygulanmadı.

**Örnek A (R01 K-8):**
- takip 15.03; tahsilat 15.000 (01.04); hesap tarihi 30.04;
- A: 10.000, %36,5, faiz başlangıcı = vade 01.01;
- B: 10.000, %73, faiz başlangıcı = vade 01.03;
- tahsilat gününe kadar işleyen faiz 1.520.

**Örnek B (R01 K-2):**
- 01.03'te 6.000 tahsilat; hesap tarihi 30.09;
- A: 10.000, %36,5, vade 01.01;
- N: 5.000, faizsiz, vade 01.02.

| # | Teyit | Seçenekler ve sonuç | Fark | Öneri |
|---|---|---|---|---|
| 1 | Aynı takipteki anaparalarda "ilk takip edilen" eşit kalıyor. Vadeye geçmek TBK 102'nin bir yorumu. Uygulansın mı? | (a) vadesi önce gelen (A önce): **6.898,16** (motor) · (b) orantılı: ödeme faizden sonra 13.480, yarı yarıya; kalan A 3.260 + B 3.260, 01.04–30.04 faiziyle **6.803,62** (elle) · (c) sıra kullanıcıdan istenir: kullanıcı seçene kadar hesap yok | a–b: **94,54** | (a), çıktıda "aynı takip — vade sırası (yorum)" etiketiyle |
| 2 | Vadesi kaydedilmemiş anaparada ne olsun? | (a) ödemeli çok anaparalı dosyada açık engel (ADR-014 MUST-7); bilinen tutarlar görünür, kesin bakiye yok · (b) faiz başlangıcı vade sayılır · (c) en sona konur. Örnek A'da A'nın vadesi kayıtsızsa: (b) **6.898,16**, (c) B önce **6.709,08** (elle) | b–c: **189,08** | (a); sonra vade alanı tamamlatılır |
| 3 | Borçlu bildirimi ve makbuz için yapısal alan (ALC-P1-1) yokken ne olsun? | (a) kanuni sıra (TBK 102) "borçlu bildirimi kaydı yok" etiketiyle uygulanır · (b) çok anaparalı ödemeli dosya engelde kalır. Örnek B'de A önce **10.567,67**, N önce **11.632,67** | **1.065,00** | (a); ALC-P1-1 gelince bildirim önce gelir |

Bağımlılıklar:
- kalem düzeyinde takip tarihi alanı (bugün yalnız dosya düzeyinde `Case.caseDate` var);
- TK-8;
- ALC-P1-3 zincirindeki avukat onayı şartı.

### 3.2 KP-4 — sorumluluğu kaydedilmemiş çek tazminatı

**GO §4 sınırı:**
- gerçek tahsilat reddedilmez, mevcut tahsilat silinmez;
- belirsizlik hesap, dağıtım ya da kesinlik iddiasını sınırlar;
- bilinen tutarlar görünür kalır;
- adli dosya toplamı kişi bazındaki sorumlulukla eşitlenmez;
- resmî mahsup iç hesapla sessizce değiştirilmez.

**Örnek (motor, R02):**
- çek 10.000, 01.01'den %36,5; çek tazminatı 1.000, sorumluluk kaydı yok;
- borçlular keşideci ve ciranta; hesap tarihi 02.03;
- alacak kalanı 10.600, tazminat dahil 11.600.

**Eksik sorumluluk nasıl tamamlansın?** Varsayım yapılmadı; seçenekler:

| Seçenek | Adli dosya toplamı | Kişi bazında | Cirantanın 500 TL ödemesi (eklenen örnek) |
|---|---|---|---|
| (i) Avukat kalem kartında sorumluları seçer. Seçilene kadar tazminat "sorumluluğu belirsiz" ayrı satırda kalır | 11.600 (görünür) | keşideci 10.600 + belirsiz 1.000; ciranta 10.600 + belirsiz 1.000 (kimseye yazılmaz) | Tahsilat kaydedilir. Tazminata tahsis edilmez; anapara / faize gider (10.600 → 10.100). Resmî mahsup kaydı ileriye doğru bu kuralla yazılır, geçmiş kayıt değişmez |
| (ii) Sistem kayıtlı rollerden owner kuralını önerir (yalnız keşideci + lehine aval; K3-L kararı). Avukat onaylamadan kesinleşmez | 11.600 | önerildiği hâliyle (keşideci 11.600, ciranta 10.600); onaya kadar "öneri" etiketi | (i) ile aynı; onaydan sonra ciranta tazminattan sorumlu değil |
| (iii) Ödemesiz dosyada brüt kesin + etiket; ödemeli dosyada kişi bazlı kesin bakiye üretilmez (R02 önerisi) | 11.600 etiketli | ödemeli dosyada "hesaplanamadı — sorumluluk eksik"; bilinen kalemler görünür | Tahsilat kaydedilir; kişi bazlı kesin bakiye sorumluluk tamamlanana kadar yok |

- Fark: (i) ve (ii) arasında ciranta için 1.000 TL; (iii)'te kişi bazlı rakam yok.
- **Öneri:** (ii) ile (i) birlikte. Sistem önerir, avukat onaylar; onaya kadar tazminat hiçbir kişiye yazılmaz ve ödeme dağıtımında tazminata gitmez. R02'deki (iii) yerine öneriliyor, çünkü GO §4 bilinen tutarların görünür kalmasını istiyor.
- **Bağımlılık:** TK-6.

### 3.3 KP-5 — tarihi kaydedilmemiş masraf

**Örnek (elle, R02):**
- 10.000, 01.01'den %36,5; tahsilat 1.000 (31.01);
- masraf 500, sisteme 15.02'de girilmiş, gerçek tarihi yok;
- hesap tarihi 02.03.

**Tarihsiz masraf hangi tarihe bağlansın?** Varsayım yapılmadı; seçenekler:

| Seçenek | Mahsup | Toplam |
|---|---|---|
| (i) kayıt anı (`createdAt`) geçici tarih, etiketli | tahsilatta masraf yoktu → faiz 300 + anapara 700 | **10.079** |
| (ii) ödemeli dosyada tarih girilene kadar kesin hesap yok; 10.000 anapara ve 500 masraf görünür; tahsilat kaydı değişmez | — | hesaplanamadı |
| (iii) masraf tarihi alanı; avukat girer (ör. gerçek tarih 10.01) | masraf 500 + faiz 300 + anapara 200 | **10.094** |
| (iv) avukata tek soru: "masraf bu tahsilattan önce mi yapıldı?" (tam tarih yerine sıra bilgisi) | "önce" → (iii) ile aynı; "sonra" → (i) ile aynı | 10.094 / 10.079 |

- Fark: (i)–(iii) **15** TL. Fark, tahsilat tutarına ve masrafın tahsilata göre konumuna bağlı.
- **Öneri:** kısa vadede (ii); kalıcı çözüm (iii), girişte (iv) kolaylığıyla. `createdAt` hukuki masraf tarihi sayılmaz.

### 3.4 TK-8 — kalıcı yolda eşit `sortOrder` (tek soru)

R02, TK-8'i "karar var, iş uygulama" grubuna koymuştu; GO §2 de uygulama yetkisi verdi. Kaynakla eşleştirince uygulamanın bir seçim ve yeni mekanizma gerektirdiği görüldü; bu yüzden uygulanmadı.

| | |
|---|---|
| Kaynak | `summary-engine.service.ts`, `allocatePaymentToLedgerInTx` → `allocateWithTBK100` |
| Mevcut davranış | Aktif kalemler yalnız `orderBy: { sortOrder: 'asc' }` ile okunuyor; ikinci sıralama anahtarı yok. Aynı türdeki kalemler arasında pay, okuma sırasına göre dağılıyor |
| Eşitliğin sıklığı (kod) | Dosya açılışında `Due` kaydı `sortOrder` yazılmadan oluşuyor (şema varsayılanı 0) ve alacak kalemi bunu devralıyor. Sihirbazla açılan çok anaparalı dosyada eşitlik **kuraldır**; yalnız sonradan eklenen kalem `en büyük + 1` alıyor. Canlıdaki sayı ölçülmedi (SQL-8) |
| Hedef davranış | Belirsiz tahsiste işlem açık tanıyla durur; ayrı bir sıra seçilmez |
| Bağlayıcı karar | ADR-014 MUST-7 ("non-deterministic allocation" → fail closed), I-02 / I-03; R02 grup 1 |

**Neden uygulanmadı:**
- "İşlem durur" tahsilatın reddi olarak uygulanırsa GO §4'e aykırı olur (gerçek para kaydı reddedilmez).
- Uygun mekanizma K3-L D1 bekletmesidir (`CollectionAllocationHold`). Ama bugünkü model:
  - tahsilatı ya **tamamen** bekletiyor ya tamamen mahsup ediyor (kısmi bekletme yok; tahsilat başına tek ödeme defteri kaydı);
  - yalnız iki bekletme nedeni tanıyor (hesabına ödeme yapılan borçlu eksik / sorumlu değil);
  - bekletmeyi **borçlu girilince** çözüyor; sıra kararıyla çözen bir akış yok.
- Bekletmenin çözülmesi bir sıra seçimi ister; o da KP-1'dir (§3.1) ve henüz uygulanmayacak. Çözülemeyen bekletme, tahsilatın borçtan düşmesini süresiz durdurur.
- Eşitlik kural olduğu için fail-closed, sihirbazla açılmış çok anaparalı dosyalardaki tahsilatların hepsini bekletir.
- Mahsup tanıları normal mahsupta saklanmıyor ve gösterilmiyor (yalnız fazla ödeme engeli olayında kalıcı yazılıyor); "yalnız görünür tanı" da bir saklama yeri seçimi ister.

**Soru:** Eşit `sortOrder` yüzünden aynı türdeki kalemler arası payı belirsiz kalan tahsilatta ne yapılsın?
- (a) Tahsilat kaydedilir; yalnız belirsiz anapara payı bekletilir, masraf / fer'i / faiz payı mahsup edilir. Gerekenler: kısmi bekletme modeli, yeni bekletme nedeni (PostgreSQL enum değeri → migration), sıra kararıyla çözme akışı. En büyük iş.
- (b) Tahsilatın tamamı bekletilir. Gerekenler: yeni bekletme nedeni (migration) ve sıra kararıyla çözme akışı; faiz / masraf payı da bekler.
- (c) Açık bir eşitlik kuralı seçilir: kalem oluşturma sırası (`createdAt`, sonra kimlik). Kalem listeleme sorguları bugün zaten bu ikinci anahtarı kullanıyor. Yeni mekanizma gerekmez; ama R02'deki "ayrı bir sıra seçilmez" ifadesinin değişmesi demektir ve KP-1 teyitleri gelince yerini o sıraya bırakır.

**Öneri:** önce ölçüm (SQL-8). Ara adım olarak (c), çıktıda "eşit sıra — oluşturma sırası (geçici kural)" etiketiyle; kalıcı kural KP-1 teyitleriyle. (a) ve (b), KP-1 çözülmeden çözülemeyen bekletme üretir.

**Sayısal örnek (elle):** iki anapara A ve B, 10.000'er, faizsiz; 5.000 tahsilat.

| Seçenek | Sonuç |
|---|---|
| (a) / (b) | 5.000 bekletilir; borç 20.000 görünür, "mahsubu bekleyen 5.000" ayrı satır |
| (c) A önce oluşturulmuş | A 5.000, B 10.000 |
| Bugün, okuma sırası B'yi önce döndürürse | A 10.000, B 5.000 |

Toplam borç her durumda 15.000 (bekletme hariç). Kalem bazında fark 5.000.

### 3.5 KP-7 ile K3-L D1 uzlaştırması (teyit)

- **İki kural:**
  - D1 (owner GO 2026-09-29 §6): mahsubu bekletilen tahsilat "tahsil edilen" sayılmaz.
  - KP-7 (R03): "Toplam tahsilat" dosyaya fiilen giren paradır.
- **#2864'te uygulanan yorum:**
  - bekletilen para Toplam tahsilata girer;
  - Borca uygulanana girmez, borçtan düşülmez;
  - "Dağıtım bekleyen" içinde "Mahsubu bekleyen tahsilat (borçtan düşülmedi, dağıtıma kapalı)" satırında ayrı gösterilir.
- **Örnek (motor, gerçek PostgreSQL testi):** 500 mahsup edilmiş + 1.500 bekletilen.

| Seçenek | Toplam tahsilat | Borca uygulanan | Dağıtım bekleyen |
|---|---|---|---|
| (a) #2864'teki yorum | 2.000 | 500 | 1.500 (tamamı mahsubu bekleyen) |
| (b) D1'in harfî okuması | 500 | 500 | 0; bekletilen 1.500 ayrı kutuda |

- **Fark:** 1.500.
- **Öneri:** (a). Para dosyaya girmiştir; borç ve dağıtım korumaları aynen sürer.
- **Geri dönüş:** (b) seçilirse `receivedAmount` ve `notAppliedAmount` birlikte değişir; "Toplam tahsilat = Borca uygulanan + Dağıtım bekleyen" eşitliği bekletileni dışarıda bırakacak biçimde yeniden tanımlanır. Küçük bir değişiklik, ama tek satır değil.

### 3.6 KP-3 — talep edilmiş işlemiş faiz kovasının tasarım onayı

§4'teki tasarımın üç açık noktası:
1. dönem çakışması kuralı;
2. talep edilmiş faize faiz yürütülmemesi;
3. eski kayıtların göç biçimi.

Owner onayı olmadan muhasebeleştirme yapılmadı. Aynı örnekte fark 515 (§4).

### 3.7 KP-9 — yönetici kendi kaydının varsayılan yetkisini onaylayabilir mi (tek soru)

R01'in önerdiği "Bu değerleri onayla" aksiyonu için mevcut kurallar:

| Kural | Bugün |
|---|---|
| Yönetim yetkisi | Var: ADMIN ya da aynı büroda aktif, bağlı PARTNER; işlem içinde kilitli satırdan yeniden doğrulanıyor |
| Denetim | Var: `LAWYER_PRIVILEGE_CHANGED` + değer izi |
| Kendini onaylama | **Çelişkili.** Avukat yetki alanlarının güncellemesinde kendi kaydı için kısıt yok (ortak avukat kendi varsayılanını değiştirip kaydedebiliyor). Kendini onaylama yasağı üç başka akışta var: ofis onay talepleri (müvekkil ödemesi onayında üst düzey aktör istisnasıyla), müvekkil mali bilgilendirme onayı, legal hold kaldırma |

**Soru:** Onay aksiyonunda hangi kural geçerli olsun?
- (A) Güncelleme ile aynı yetki: yönetici kendi kaydını da onaylayabilir. Yeni kural üretmez; bugün "değiştir-kaydet" ile zaten yapılabiliyor.
- (B) Kendi kaydı için başka bir yönetici (ADMIN ya da başka PARTNER) şartı. Tutarlı olması için güncelleme yolunda da aynı şart gerekir; bu, bugün yapılabilen bir işlemi daraltır ve tek ortaklı büroda ADMIN gerektirir.

**Örnek (parasal değil):** ortak avukat Y'nin varsayılanı {dosya düzenleme, mali düzenleme}; yönetim kaydı yok.

| Seçenek | Sonuç |
|---|---|
| (A) | Y kendi kaydını onaylar; sonra açılan dosyalarda Y'ye bu yetkiler kopyalanır. Tek kişinin işlemi; ayrı eylem kaydıyla izlenir |
| (B) | Y onaylayamaz; ikinci yönetici onaylayana kadar yeni dosyalarda Y'ye varsayılan yetki yazılmaz. Y bugünkü gibi değeri değiştirip kaydedebiliyorsa kural dolanılır |

- **Öneri:** (A). Yazma yolundan daha sıkı bir onay kuralı dolanılabilir olur. Mali işlemlerin kendi ikinci avukat onayı (K3) bundan etkilenmez. (B) istenirse yetki sertleştirmesi olarak güncelleme yoluyla birlikte ayrı karar olmalı.
- **Etki ölçümü:** SQL-13 (§6).

### 3.8 KP-11 — taslak takip talebinde toplam ve hesap tarihi

**Kayıtlı dosyadan üretilen belgeler:** toplam her biçimde kayıtlı kalemlerden sunucuda hesaplanıyor; biçimler arasında fark yok ve hesap tarihine bağlı değil.

**Sihirbazın taslak belgeleri (alacak kalemi formundaki indirme düğmeleri):**
- Web üç biçime farklı veri gönderiyor. Sunucu **PDF** ve **Word**'de toplamı gönderilen kalemlerden yeniden hesaplıyor (istemci toplamı kullanılmıyor); **XML**'de istemcinin gönderdiği toplamı kullanıyor.
- PDF'e tek kalem (asıl alacak) gidiyor → PDF toplamı asıl alacak.
- Word'e asıl alacak, takip öncesi faiz ve yan kalemler gidiyor → Word toplamı takip tutarı.
- XML'e `son_borc` gidiyor: takip tutarı + icra masrafları + ihtiyati haciz masrafları + vekalet ücreti + takip sonrası faiz + tahsil harcı. Tahsil harcı = (takip tutarı + icra masrafları + ihtiyati haciz masrafları − peşin harç) × %4,55. Takip sonrası faiz hesap tarihine bağlı.
- Taslak belgelerde hesap tarihi yazmıyor.
- Taslak belgeler dosya faiz türünü kullanmıyor: Word çek / senette TİCARİ %39,75, diğerlerinde YASAL %24 yazıyor; PDF ve XML sabit "YASAL" gönderiyor.

**Örnek (elle; girdiler varsayımdır):** anapara 10.000; takip öncesi faiz 300; icra masrafı 400; vekalet ücreti 1.500; peşin harç 51,50; hesap tarihi takipten 30 gün sonra, %24.

| Taslak biçimi | Toplam |
|---|---|
| PDF | **10.000,00** |
| Word | **10.300,00** |
| XML | **12.881,77** (10.300,00 + 400 + 1.500 + takip sonrası faiz 197,26 + tahsil harcı 484,51) |
| Word − PDF | 300,00 |
| XML − Word | 2.581,77 (hesap tarihi bir gün ilerlerse 6,58 artar) |

**Soru:** Taslak takip talebinde hangi toplam gösterilsin ve hesap tarihi yazılsın mı?
- (a) Üç biçim de takip tutarını gösterir (takip tarihindeki alacak: asıl alacak + takip öncesi faiz + yan kalemler). Hesap tarihi yazılmaz, çünkü toplam ona bağlı olmaz. PDF'in eksik kalemleri ve XML toplamı buna göre düzeltilir.
- (b) Üç biçim de son borcu gösterir ve hesap tarihi belgede yazar.
- (c) Bugünkü durum: üç biçim üç farklı toplam, tarih yok.

**Öneri:** (a), avukat teyidiyle. Takip talebi takip tarihindeki alacağı bildirir; masraf, vekalet ücreti ve tahsil harcı icra dairesince hesaplanır. Bu öneri hukuki yorum içerir. PDF'e yalnız asıl alacağın gitmesi ayrıca teknik bir kusurdur; karar beklemeden düzeltilebilir, ama bu GO'nun kalemleri arasında değildi.

### 3.9 TK-13 — eski çek / senet dosyasında şablon ve hesap farklı faiz türü kullanıyor

**Bugün:**
- Sihirbazdan açılan yeni dosyada faiz türü açıkça seçiliyor ve kaynağı kaydediliyor (#2866); şablon ve hesap aynı türü kullanıyor.
- Dosya türü `CHECK` ya da `BOND`, faiz türü YASAL ve kaynağı açık seçim değilse (eski dosya, ya da API'den türsüz açılmış dosya): hesap YASAL ile yapılıyor, şablon TİCARİ yazıyor. Hesap özetinde uyarı görünüyor; tür değiştirilmedi.
- Fatura dosyaları etkilenmiyor (§2 kapsam düzeltmesi).

**Örnek (elle):** 10.000 TL, 90 gün. Belge oranları tarife dosyasından (`config/tariffs/2026.yaml`): YASAL %24, TİCARİ %48.

| | Faiz |
|---|---|
| Hesap (YASAL %24) | 591,78 |
| Belge metni (TİCARİ %48) | 1.183,56 |
| Fark | **591,78** |

**Soru:** Bu dosyalarda ne yapılsın?
- (a) Bugünkü durum: uyarı görünür, ayrışma kalır.
- (b) Şablon kayıttaki türü (YASAL) kullanır. Belge metni değişir; daha önce TİCARİ ile üretilmiş belgelerle tutarsızlık doğabilir.
- (c) Kullanıcıya dosya bazında "dosya faiz türünü teyit et" adımı (yeni yazma yolu, denetimli). Teyitten sonra şablon ve hesap aynı türü kullanır; teyit edilmeyen dosyada (a) sürer.

**Öneri:** (c). Sistem türü kendiliğinden değiştirmez; karar dosyayı bilen avukatta kalır. Kapsamın boyutu SQL-9 ile ölçülür (§6).

## 4. KP-3 — "talep edilmiş işlemiş faiz" kovası: somut tasarım (uygulanmadı)

**Bugün (#2864 sonrası):**
- INTEREST / PRE_INTEREST / POST_INTEREST türünde, tutarı sıfırdan büyük, etkin kalem görünür.
- Bu kalem **kanonik görünümde ve hesap özetinde** hiçbir toplama girmez; iki yol aynı kuralı kullanır (`claimedInterestAmount`). Uyarı: `CLAIMED_INTEREST_NOT_INCLUDED`.
- **Kalıcı mahsup yolunda** ise aynı kalemler faiz kovasına girer ve tahsilattan pay alır. İki yol bu kalemlerde ayrışıyor; kova tasarımının kapatacağı fark budur.

**Hedef (ADR-014): sabit tutarlı işlemiş faiz kovası.**

| Konu | Tasarım | Açık nokta |
|---|---|---|
| Kaynak | Etkin INTEREST kategorisi kalem. Tutar = `demandedAmount ?? amount`, sıfırdan büyük. Tutarsız kalem yalnız faiz ayarı taşır, kova üretmez | — |
| Kova tipi | `CLAIMED_ACCRUED_INTEREST`, sabit tutar, para birimi kalemin kendisi. Ana kalem (anapara) bağı kalem metadata'sından; yoksa dosya düzeyi | Bağ alanı yoksa: dosya düzeyi mi, engel mi? |
| Faize faiz | Kova üzerinde faiz İŞLEMEZ (varsayılan). Ticari cari hesap gibi istisnalar kapsam dışı | **Hukuki teyit** (TBK 388/3, TTK 8/2 ayrımı) |
| Dönem çakışması | Talep edilen faizin dönemi [ilk gün, son gün], iki uç dahil. Anaparanın kanonik faizi bu dönemi tekrar saymaz: kanonik başlangıç = max(kalem başlangıcı, talep döneminin son günü + 1 gün). Dönem bilinmiyorsa kova üretilmez; kalem çözülemeyen olur ("faiz dönemi kayıtlı değil"), toplam tahminle kurulmaz | **Owner kuralı:** çakışmada kanonik başlangıç mı kaysın, engel mi? |
| Mahsup sırası (MUST-3) | masraf → fer'i → **faiz** → anapara. Faiz içinde önce talep edilen (eski dönem), sonra kanonik işleyen faiz (tarih sırası) | TBK 100'de faiz içi sıra — avukat teyidi |
| Kalıcı yol | `summary-engine` aynı kovayı aynı sırayla tahsis eder (iki yol tek kural) | KP-1 / TK-8 ile aynı sürümde |
| Gösterim | "Takip öncesi işlemiş faiz (talep edilen)" ayrı satır; toplamda bir kez | — |
| Eski kayıt göçü | Önce envanter (SQL-7). Dönem alanı dolu kayıtlar doğrudan; dönemsiz kayıtlar avukat onaylı dönem girişiyle. Otomatik göç yok | Göç biçimi owner kararı |
| Hazır olma kapısı | Kova üretilemeyen talep edilmiş faiz kaydı varken o para biriminde "kesin" bakiye yok; tutar görünür | — |

**Aynı örnekte (R02 KP-3):** 10.000 anapara; talep edilen faiz 500 (01.12–19.01 dahil, 50 gün); takip 20.01; kanonik faiz başlangıcı 20.01; tahsilat 1.000 (01.03); hesap tarihi 31.03.

| Durum | Sonuç |
|---|---|
| Bugün (#2864) | 9.682 + "talep edilmiş işlemiş faiz hesaba dahil edilmedi: 500" (motor) |
| Kova ile | 10.197 (elle; R01) |
| Fark | **515** |

## 5. Oran verisinin doğruluğu

**Bu turda yapılmayanlar (GO §6):**
- canlı oran tablosuna yazma, yeni oran yükleme;
- geçmiş faizleri yeniden hesaplama;
- doğrulanmamış oranı başka bir oranla değiştirme.

### 5.1 Bugünkü mekanizma (kod okuması; main `e7c28685`, yollar `apps/api/` altında)

| Konu | Bugün | Kaynak |
|---|---|---|
| Model | `RateSchedule` → `rate_schedule`: `tenantId`, `interestType` (metin), `validFrom`, `validTo?` (null = açık uçlu), `annualRate` Decimal(10,6) kesir, `source` (metin), `sourceRef?`, `versionHash`, `createdAt`, `createdBy?`. **Yok:** benzersizlik kısıtı, CHECK (validTo ≥ validFrom, oran aralığı), resmî belge no / URL / hash, yayın tarihi | `prisma/schema.prisma` `model RateSchedule` |
| Kiracı anahtarı | `tenantId` **Office.id**'ye bağlı (FK). Kanonik okuma **Tenant.id** ile süzüyor. Office.id ayrı bir kimlik; ikisini eşleyen göç yok → canlıda kanonik yol oran bulamıyor olabilir (**ölçülmedi**). DB testleri bunu `Office.id = Tenant.id` kurarak aşıyor | şemada `tenant Office @relation`; `src/modules/interest-engine/rates/rate-provider.service.ts` `fetchRatesFromPrisma`; `docs/governance/decision-log.md` ADR-014 W0.2 kaydı |
| Tür kodları | Motor: `LEGAL_3095`, `COMMERCIAL_AVANS_3095_2_2`, `TTK_1530`, `COMMERCIAL_FIXED`, `CONTRACTUAL`, mevduat türleri. Dosya düzeyi köprü: YASAL → LEGAL_3095; TICARI / AVANS → COMMERCIAL_AVANS; TEMERRUT → TTK_1530; SABIT → COMMERCIAL_FIXED. Kalem düzeyinde zengin kod yoksa yalnız YASAL / TICARI / SABIT kabul ediliyor; diğerleri `UNSUPPORTED_INTEREST_TYPE` | `interest-engine/types/domain.types.ts`; `interest-engine/mapping/interest-type-bridge.ts`; `interest-engine/assembler/claim-bucket-assembler.ts` |
| Başlangıç verisi | `seed:rates` betiği `validTo` yazmıyor; **tüm satırlar açık uçlu**. LEGAL_3095: 2006-01-01 %9, **2024-06-01 %24 (son satır, açık uçlu)**, `sourceRef = "Resmi Gazete"`. İkinci bir set (`RateSyncService.seedHistoricalRates`, üretimde çağıranı yok) 2025 avans oranlarında birinciyle **çelişiyor** | `scripts/seed-interest-rates.ts`; `src/modules/interest-engine/rate-sync.service.ts` |
| Güncelleme | Yalnız EVDS zamanlanmış işi (avans + mevduat); anahtar (`TCMB_EVDS_API_KEY`) yoksa sessizce atlar. **LEGAL ve TTK için senkron yok.** `validFrom` = EVDS gözlem tarihi (yürürlük değil). Denetim kaydı ve `createdBy` yok. API'de oran tablosuna yazan HTTP ucu yok (denetleyicide yalnız bakiye, hesap, kayıt, iz ve metrik uçları var); web'de var olmayan uçları çağıran bir istemci ve hiçbir sayfaya bağlı olmayan bir panel duruyor. Ürün içinde düzeltme yolu yok | `rate-sync.service.ts`; `rate-schedule.service.ts`; `interest-engine.controller.ts`; web `lib/api/interest-engine.ts` |
| Okuma | `getRatesForPeriod` türe ve tarihe göre okur. Kayıplar: `sourceRef` atılıyor; motora giden `versionHash` alanına satır kimliği yazılıyor; kaynak her satırda "TCMB" | `rate-provider.service.ts`; `interest-engine/orchestration/case-balance.service.ts` `gatherRates` |
| Seçim | Çakışan açık uçlu satırlarda en geç başlayan kazanıyor. Başlangıç verisinin doğru sonuç vermesi buna bağlı | `interest-engine/segments/timeline-generator.ts` |
| TK-2 kapsama | Dönemi gün gün kapsamayan oran → `RATE_COVERAGE_MISSING`. **Yakalamadıkları:** eskimiş açık uçlu son satır, yanlış değer / tür, mükerrer `validFrom`, kaynak / hash, kiracı anahtarı uyuşmazlığı ("oran yok" olarak görünür) | `interest-engine/calc-prep/rate-coverage.ts` |
| Oran tablosu dışındaki oran kaynakları | (1) Kayıtlı dosyanın belge metni: tarife dosyası (YASAL 24 / TİCARİ 48 / AVANS 32); tarife bulunamazsa sunucu yedeği 24. (2) Faiz önizleme ucu: kod içi sabitler (yasal 24; avans 39,75; TTK 1530 39,75; mevduat 45 / 42 "tahmini") — sihirbazdaki takip öncesi ve sonrası faiz bunlarla hesaplanıyor. (3) Sihirbazın taslak Word belgesi: web'de sabit 39,75 / 24,00. Bu kaynaklar birbirinden ve oran tablosundan bağımsız; ör. TTK 1530 için başlangıç verisinde 2026 oranı %43, önizlemede %39,75 | `src/config/tariffs/2026.yaml` `interest_rates`; `fee-engine.service.ts` `getInterestRate`; `template-engine.service.ts` `determineInterestInfo`; `interest-engine.controller.ts` (önizleme); web `ProfessionalClaimItemForm.tsx` |

### 5.2 Hukuki kaynak ile kodda uygulanan kural (ayrı ayrı)

| | Kaynak (resmî metin) | Kodda uygulanan |
|---|---|---|
| Kanuni (yasal) faiz | 3095 md. 1, **7589 sayılı Kanun md. 10 ile değişik**. Kabul 16/7/2026; RG 31/7/2026, sayı 33326; **yürürlük 31/7/2026** (7589 md. 26/1-c). Oran: TCMB'nin önceki yılın 31 Aralık günü kısa vadeli kredi işlemlerinde uyguladığı reeskont oranının %80'i. 30 Haziran oranı 31 Aralık oranından en az 5 puan farklıysa yılın ikinci yarısında 30 Haziran oranının %80'i | `LEGAL_3095` için tabloda **sabit satırlar**. Son satır 2024-06-01'den açık uçlu %24. Formül (reeskont × %80) **uygulanmıyor**; 31/7/2026 sonrası için ayrı satır yok |
| Önceki rejim | 5335 md. 14 ile yıllık %12; Cumhurbaşkanı değiştirebilir (KHK 700). AYM 22/7/2025, E.2024/24, K.2025/164 (RG 1/12/2025, 33094), "sözleşmeden kaynaklanmayan borç ilişkileri" yönünden iptal; yürürlüğü 1/9/2026 | Ayrım yok; tek tür, tek tablo |
| Geçiş | 7589 bu değişiklik için yeni geçiş hükmü eklemedi. 3095'in Geçici Madde 1–2'sinin uygulanıp uygulanmayacağı ve yıl ortası yürürlüğün 2026'nın hangi dönemine hangi oranla uygulanacağı **hukuki yorum** ister | Kural yok (varsayım yapılmadı) |
| Ticari (avans) | 3095 md. 2/2: TCMB avans oranı | `COMMERCIAL_AVANS_3095_2_2` satırları; EVDS işi (anahtar varsa) |

**Kaynak dosyalar.** İndirme 30.09.2026, UTC 21:27–21:34. Özetler 01.10.2026'da saklanan dosyalardan yeniden hesaplandı; R02 §5 kaydıyla aynı.

| Kaynak | İlgili hüküm | SHA-256 |
|---|---|---|
| https://www.mevzuat.gov.tr/mevzuatmetin/1.5.3095.pdf | 3095 md. 1 (güncel metin), md. 2/2 | `f1d5cf34f3dc2fd338833ebcbc379da67590a960ba3169efef2a9567c865fb4a` |
| https://www.mevzuat.gov.tr/mevzuatmetin/1.5.7589.pdf | 7589 md. 10 (değişiklik), md. 26/1-c (yürürlük) | `88749eb59cfaf0b539e564629ada76e205234e240fdb6ec5c08bb398e922207c` |
| https://www.resmigazete.gov.tr/eskiler/2026/07/20260731-1.htm | RG 31/7/2026, sayı 33326 (yayım) | `b9ee9b03725d2d3426f4ac24efed01874f6032dc0b3d9f293bcb94b257e7e16a` |

Hukuki okuma avukat teyidi yerine geçmez.

### 5.3 Doğrulama kontrolü tasarımı (mevcut mimariye uygun; salt okuma)

**Amaç:** her oran satırının türünü, değerini ve dönemini sürümlü bir resmî referansa karşı sınamak. Sonuç tanı üretir; satırı değiştirmez ve hesabı kendiliğinden düzeltmez.

1. **Referans kayıt: `RateReferenceRegime`**
   - Sürümlü, hash'li, kodda.
   - Alanlar: `interestType`, `effectiveFrom`, `effectiveTo`, `rule`, `legalBasis`, `evidence`, `status`.
     - `rule`: `FIXED{annualRate}` ya da `DERIVED{reference: "TCMB_REESKONT_KISA_VADE", factor: 0.8, observationDates}`.
     - `legalBasis`: kanun / madde / RG.
     - `evidence`: URL, SHA-256, alınma zamanı.
     - `status`: `VERIFIED_OFFICIAL` / `UNVERIFIED`.
   - Emsal: `src/config/uyap-interest-crosswalk.ts` (durum + kanıt türleri; kodda var). Backlog'daki ALC-P1-4 `LegalRateRule` (FIXED_RATE / DERIVED_FROM_REFERENCE_RATE) aynı ayrımı öneriyor; kodda yok.
   - Kayıt örneği: 3095 md. 1 için 31/7/2026'dan itibaren `DERIVED` rejim. Kanıt §5.2 adresleri.
2. **Saf fonksiyon:** `verifyRateTable(rows, regimes, asOfDate) → RateVerificationFinding[]`.
   - Konum: `calc-prep/rate-coverage.ts` yanında; aynı ISO gün ve `validTo` dahil semantik.
   - Bulgu kodları:
     - `RATE_REGIME_CHANGED_NOT_REFLECTED`: açık uçlu satır, yeni rejimin yürürlüğünü geçiyor. LEGAL %24 bugün tam olarak bu.
     - `RATE_VALUE_MISMATCH`: FIXED rejimde değer farklı.
     - `RATE_DERIVED_INPUT_UNVERIFIED`: DERIVED rejimde referans oran gözlemi kayıtlı değil. Değer **hesaplanmaz**; reeskont oranı doğrulanmadan formül uygulanmaz.
     - `RATE_PERIOD_OVERLAP_AMBIGUOUS`: çakışan satırlar.
     - `RATE_DUPLICATE_VALID_FROM`
     - `RATE_SOURCE_UNTRACEABLE`: `sourceRef` jenerik ya da yok.
     - `RATE_TENANT_KEY_MISMATCH`: satır anahtarı Office.id, okuma Tenant.id.
     - `RATE_PARALLEL_SOURCE_DIVERGES`: tablo dışındaki bir kaynak (tarife dosyası, önizleme sabiti) aynı tür ve tarih için farklı değer taşıyor.
3. **Bağlanma noktaları (ayrı GO ile):**
   - (a) `gatherRates` sonrası, motor öncesi → para birimi düzeyinde tanı. Engel değil, uyarı; "kesin" iddiasını sınırlar.
   - (b) Salt okuma harness → izole kopyada sayım (KP-10 protokolü).
   - (c) Yazım öncesi `RateScheduleService.addRate` kapısı.
4. **Bu turda yapılan:** yalnız tasarım ve bu belge. Fonksiyon, kayıt ve testler ayrı PR adayı.
   - Bağımlılık: hukuki yorum (§5.2 geçiş) ve TCMB 31/12/2025 ile 30/6/2026 reeskont oranlarının resmî kaynaktan alınması.

### 5.4 Riskler (öncelik sırasıyla)
1. **Kiracı anahtarı uyuşmazlığı** (Office.id ↔ Tenant.id). Kanonik yol canlıda oran bulamıyor olabilir; TK-2 sonrası bu, faiz işleyen kalemlerde "faiz çözülemedi" demek. **Önce ölçülmeli** (SQL-11).
2. **Eskimiş son satır.** LEGAL %24, 31/7/2026 sonrası da uygulanıyor. Hiçbir kontrol yakalamıyor.
3. **Birbirinden bağımsız oran kaynakları.** Oran tablosu, tarife dosyası, önizleme sabitleri ve web sabitleri ayrı ayrı güncelleniyor; tablo doğrulansa bile belge ve önizleme ayrı kalıyor.
4. **Çelişen iki başlangıç seti; izlenemeyen kaynak.** `sourceRef` jenerik.
5. **DB kısıtı yok.** Mükerrer `validFrom`'da seçim belirsiz.

## 6. KP-10 — izole etki ölçümü planı (yalnız plan)

**Bu GO'da yapılmayanlar:** yeni yedek alma, taşıma, kişisel veri erişimi.

**Koşullar (R01 §5 / R02 §6, aynen):**
- son yedeğin izole kopyası;
- veritabanı adı "test" içerir;
- salt okuma işlem;
- çıktı yalnız sayı (kiracı ve tür bazında; kişi ya da dosya kimliği yok).

**Yeni sayımlar (R03 kararları için):**

| # | Ne ölçülür | Neden |
|---|---|---|
| SQL-7 | Etkin, tutarı > 0 INTEREST / PRE_INTEREST / POST_INTEREST kalemi olan dosya ve kalem sayısı; dönem alanı (başlangıç / bitiş) dolu olanlar; bu kalemlere kalıcı yolda tahsis edilmiş tutar | KP-3 kova göçünün boyutu ve iki yol arasındaki fark (§4) |
| SQL-8 | Ödemeli, aynı türde birden çok etkin kalemi aynı `sortOrder`'da olan dosya sayısı | TK-8'in etkileyeceği dosya sayısı (§3.4) |
| SQL-9 | `Case.interestType = YASAL`, `metadata.interestTypeSource` boş ve dosya türü CHECK / BOND olan dosya sayısı; ayrıca YASAL + kaynak boş tüm dosyalarda kendi faiz ayarı olmayan kalem sayısı | §3.9'un ve KP-2 uyarısının kapsamı |
| SQL-10 | Etkin `CollectionAllocationHold` sayısı ve tutarı | KP-7 / D1 yorumunun etkisi (§3.5) |
| SQL-11 | `rate_schedule.tenantId`'si Tenant.id ile eşleşmeyen satır sayısı; Office.id ≠ Tenant.id olan ofis sayısı | §5.4 risk 1 |
| SQL-12 | Kısmi fazla ödemeli tahsilat sayısı (`totalPaidAmount` değerinin değiştiği dosyalar) | TK-5 gösterim etkisi |
| SQL-13 | Kayıtlı varsayılan yetkisi olup yönetim kaydı bulunmayan aktif avukat sayısı; tek bağlı PARTNER'ı olan büro sayısı | KP-9 (§3.7): onay bekleyen kayıtların ve (B) seçeneğinin etkisi |
| SQL-14 | Dövizli (TRY dışı) dosyalarda `Due.currency` / `ClaimItem.currency` değeri dosya para biriminden farklı olan kayıt sayısı | §7 ek bulgu 1 |

Sorgu metinleri, çalıştırma GO'su verildiğinde R01 §5 biçiminde (SQL + sınır notları) yazılır.

## 7. Kanıt sınırları ve ek bulgular

- Tüm sayılar sentetiktir. Canlı sıklık bilinmiyor; KP-10 bunun içindir.
- "motor" etiketli sonuçlar gerçek kanonik motorla (ve belirtildiği yerde gerçek PostgreSQL ile) ölçüldü; "elle" etiketliler elle hesaptır.
- §5.1 kod okumasıdır; canlı oran tablosu okunmadı.
- Hukuki metin bu paketi yazan ajan tarafından resmî PDF'ten okundu. Avukat teyidi yerine geçmez.
- **Ek bulgu 1 (kod okuması, çalışma zamanında ölçülmedi; bu GO'nun dışında):** dosya açılışında `dues[]` yolundan gelen `Due` kaydı para birimi yazılmadan oluşturuluyor (şema varsayılanı TRY) ve alacak kalemi bu değeri devralıyor; `DueDto`'da para birimi alanı yok.
  - Dövizli dosyada ya da formda farklı para birimi seçilen kalemde tutar TRY olarak kaydedilir.
  - Kambiyo evrakı yolu etkilenmez; evrak kendi para birimini taşır.
  - Dövizli dosyada kalem TRY yazıldığında tahsilat girişi para birimi uyuşmazlığıyla reddedilir.
  - KP-8 yalnız belge ile dosya para birimi **farklıysa** kaydın forma yüklenmesini engeller; ikisi de aynı dövizdeyse bu kusuru kesmez.
  - Ayrı iş olarak işaretlendi; ölçüm SQL-14.
- **Ek bulgu 2 (kod okuması; bu GO'nun dışında):** sihirbazın taslak PDF takip talebine yalnız asıl alacak gidiyor (takip öncesi faiz ve yan kalemler gitmiyor); taslak belgeler faiz türü ve oranını sabit değerlerden alıyor (§3.8, §5.1).

## 8. Bağımsız inceleme bulguları ve işlenişi

Taslak, ayrı bir ajanla kaynak koda karşı çürütülmeye çalışıldı (salt okuma). Her bulgu yazan ajan tarafından kodla yeniden doğrulandı.

| Bulgu | İşleniş |
|---|---|
| Taslak PDF toplamı `son_borc` değil: sunucu PDF ve Word'de toplamı kalemlerden yeniden hesaplıyor; yalnız XML istemci toplamını kullanıyor | §3.8 yeniden yazıldı (PDF 10.000 / Word 10.300 / XML 12.881,77); #2865 açıklamasındaki not düzeltildi |
| TK-13 fatura dosyasını etkilemiyor: şablondaki fatura dalı kayıtlı dosyada çalışmayan bir değere bakıyor | §2 kapsam düzeltmesi, §3.9; #2866 testindeki gerçek dışı fikstür değeri düzeltildi |
| TK-8 kaynağındaki fonksiyon adı yanlıştı | §3.4 düzeltildi |
| KP-8: forma yüklenmiş tarama kaydı, tarama yinelenince yeni kimlikle değişiyor, form eski değeri tutuyordu; gönderim bu değeri kullanıcı eklemeden kaleme çevirebiliyordu | #2869'da kapatıldı: kayıt kimliği korunuyor, kuyruktan düşen kaydın formu boşalıyor, taramadan yüklenen form kalemi kendiliğinden listeye alınmıyor; kenar yolu yeniden üreten testler eklendi |
| KP-8: mükerrer fatura koruması yalnız sihirbazda ve numaralı faturada; "yalnız ek belge" kararı yalnız tarayıcı taslağında; çoklu taramada kambiyo evrakı kuyruğa girmiyor | §1 satırı ve "kısmen uygulanan" tablosu bu sınırlarla yazıldı |
| TK-8: seçenek (a) ve (b)'nin maliyeti eksik anlatılmıştı (kısmi bekletme yok; iki bekletme nedeni var; çözüm borçlu girişine bağlı); eşitlik "olabilir" değil, sihirbazla açılan çok anaparalı dosyada kural | §3.4 seçenekleri ve önerisi yeniden yazıldı |
| KP-7 / D1 geri dönüşü "tek satır" değil | §3.5 düzeltildi |
| Kendini onaylama yasağı üç akışta var; biri istisnalı | §3.7 tablosu genişletildi |
| "Yeni dosyada kapandı" yalnız tür açıkça geldiğinde doğru; API türü isteğe bağlı kabul ediyor | §1, §2, §3.9 "sihirbazdan açılan" olarak daraltıldı |
| Talep edilmiş faiz kalemleri kalıcı mahsupta faiz kovasına giriyor | §4 "Bugün" bölümüne eklendi; SQL-7 genişletildi |
| KP-3 örneğinde dönem sonu dahil / hariç tutarsızlığı | §4: dönem 01.12–19.01 dahil (50 gün), kanonik başlangıç 20.01 |
| Oran tablosu dışında başka oran kaynakları var; kalem düzeyi köprü daha dar; `LegalRateRule` kodda yok | §5.1 satırları, §5.3, §5.4 risk 3 |
| Ek bulgu eksikti: yalnız `dues[]` yolu; açılışta kesin; tahsilat reddi; KP-8 aynı dövizde kesmiyor | §7 ek bulgu 1 |

İncelemenin doğrulayamadıkları: GO metni (depoda değil; ilgili cümleler Ek A'da), §5.2 hukuki metinler, "motor" etiketli sonuçlar, canlı veri.

## Ek A — owner GO metninden ilgili cümleler (01.10.2026, K3L-D2-REMAINING-R03)

Bu belgedeki "GO §N" atıfları aşağıdaki metne yapılır. Alıntılar owner'ın metninden aynen alınmıştır.

- **§2:** "TK-5, TK-7'nin görünürlük kısmı, TK-8, TK-9, TK-10 ve TK-11 için uygulama GO'su veriyorum; şu sınırla: Önce her birini kaynak dosya, mevcut davranış, hedef davranış ve bağlayıcı karar ile eşleştir. Politika seçmeden giderilebilen kusurları küçük, bağımlılığı belli PR'larla düzelt. […] Yeni mahsup sırası, borçlu sorumluluğu veya hesap formülü seçimi gerektiren kısmı ayrı tut. […] TK-6/TK-12/TK-13'ün son raporda neden görünmediğini de açıklığa kavuştur […] Sayacı eksik liste üzerinden kapatma."
- **§3, KP-7:** "'Toplam tahsilat' dosyaya fiilen giren, mevcut geçerli iptal/ters kayıt sözleşmesine göre netleştirilmiş parayı göstersin. 'Borca uygulanan' ve 'Dağıtım bekleyen' ayrı gösterilsin. Aynı para iki kez sayılmasın. Tarih kapsamı açık olsun […] Mevcut API alanlarının anlamını sessizce değiştirme."
- **§3, KP-11:** "Yeni hesapta varsayılan Türkiye takvimine göre bugün olsun; kullanıcı tarihi görüp değiştirebilsin. Kaydedilmiş hesap veya taslak yeniden açıldığında kendi tarihi korunsun, otomatik olarak bugüne taşınmasın. Hesap ve çıktı üzerinde kullanılan tarih açıkça yazsın. Gün sınırı ve UTC dönüşümü regresyonla korunsun."
- **§3, KP-2:** "Yeni dosyada kullanıcı seçmeden YASAL faiz kesin tercih kabul edilmesin; açık seçim istensin. Mevcut dosyaların faiz türünü değiştirme. Kaynağı veya kullanıcı tercihi doğrulanamayan eski varsayılanı uyarıyla göster; geçersiz olduğuna kendiliğinden hükmetme. Bu karar yeni bir yasal oran veya yürürlük hesabı onayı değildir."
- **§3, KP-3:** "İlk aşamada kaydın varlığını, tutarını ve mevcut hesaba dahil edilip edilmediğini açıkça göster. Eksikliği genel uyarı içinde kaybetme. Aynı faizi hem mevcut talepte hem yeniden hesapta iki kez toplama. Yeni faiz kovası ve bunun faiz/mahsup kuralları için ayrıca somut tasarım çıkar; bu GO ile kendiliğinden muhasebeleştirme yapma."
- **§3, KP-8:** "OCR sonucu kullanıcı teyidi olmadan borç yaratmasın. FATURA, kullanıcı incelemesine sunulan taslak kaleme yönlendirilsin; mevcut oluşum ve onay kapıları korunsun. DİĞER için kullanıcıdan belgeyi sınıflandırması veya yalnız ek belge olarak tutması istensin. Evrak ve alacak kalemi arasındaki ilişki korunarak ikinci anapara oluşması engellensin."
- **§4:** "Sorumluluğu veya tarihi eksik diye gerçek para girişinin kaydı reddedilmez ve mevcut tahsilat silinmez. Belirsizlik; ilgili hesap, dağıtım veya kesinlik iddiasını sınırlasın. Bilinen tutarlar görünür kalsın. Adli dosya toplamı ile kişi bazında ofis içi sorumluluğu birbirine eşitleme. Eksik sorumluluğun nasıl tamamlanacağı ve tarihsiz masrafın hangi tarihe bağlanacağı konusunda varsayım yapma; seçenekleri örnekli getir. Resmî tahsilat/mahsup bilgisini iç hesapla sessizce değiştirme."
- **§5:** "KP-1 için benim 'ilk takip edilen borç' yönlendirmemi ajanların ürettiği yedi adımlı dizinin onayı sayma. Kalan üç teyidi mevcut örnekleriyle tek kısa karar tablosunda getir; bu sırayı henüz uygulama. KP-9'da kanıtsız varsayılan yetkinin durumu açıkça gösterilebilir. Yeni onay aksiyonu ancak mevcut yönetim yetkisi, denetim ve kendini onaylama kurallarıyla uygulanabiliyorsa bu kapsamdadır. Yeni onaylayıcı yetkisi oluşturma. Eksik tek politika varsa yalnız o kararı sor."
- **§6:** "Önce mevcut oran güncelleme, kaynak, geçerlilik ve denetim mekanizmasını çıkar. Resmî kaynağa göre oran türü, değer ve dönem doğruluğunu sınayacak kontrolü mevcut mimariye uygun tasarla. 3095/7589 iddiasını ve yürürlük bilgisini kaynak URL, ilgili madde ve kaynak dosya özetiyle izlenebilir kıl. Kaynağın hukuki yorumu ile kodda uygulanmış kuralı ayrı göster. Bu tur canlı oran tablosuna yazma, yeni oran yükleme veya geçmiş faizleri yeniden hesaplama. Doğrulanmamış oranı otomatik olarak başka oranla değiştirme."
- **§8:** "KP-10 için yalnız izole etki ölçümünün planını hazırla; yeni yedek alma, taşıma veya kişisel veri erişimi başlatma."

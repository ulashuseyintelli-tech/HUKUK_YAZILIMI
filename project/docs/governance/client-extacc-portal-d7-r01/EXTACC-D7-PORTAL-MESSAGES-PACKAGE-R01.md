# EXTACC D-7 — PORTAL MESAJ AKIŞI CANLI KABUL PAKETİ (R01 · owner bloğu metni R02 · koşucu kapanışı R03)

> **DURUM: HAZIR — güncel (R06) baytlar CANLIDA KOŞULMADI.** Önceki baytlarla 2026-10-09'da owner onayıyla canlı koşum yapıldı (aşağıdaki R06 notu; o koşumların sonuç kaydı bu belgede değildir). Canlı Run/Recover ve yayın bu paketle yetkilendirilmez; GO biçimi `OWNER-GO-CLIENT-EXTACC-D7-YYYYMMDD-RNN`
> (D-4/D-5 GO'ları kabul **edilmez**). Tanım: `client-extacc-d8-staff-surface-r01` §5 (D-7) ve §6 (birleşik D-9); şablon: D-5 paketi + D-4 koşucusu (R03).
> **ÖN KOŞUL:** canlı API dist'i **R27** (`E28A6863…5134`; D-5 ile aynı pin). Owner bloğunun salt okuma kapıları (paket pinleri, dist pini,
> `.env` pini) **tüm modlarda** — Preflight, QrTest, Run **ve Recover** — mod dalından önce koşar; canlı dist R27 değilse blok **her modda DUR** verir
> (Recover dahil; bkz. §9 ve §10 K-4). Hizmet kabulü H1–H8 **0/8** değişmez.
> **R01 inceleme düzeltmeleri (2026-09-29):** iki bağımsız incelemenin bulguları uygulandı — §11.
> **R02 (2026-10-01) — owner bloğu metni ve Recover yetkisi (yalnız metin; kod/akış/pinler DEĞİŞMEDİ) — §12:** Run çıkış 5/6 **Recover yetkisi
> DEĞİLDİR**: Run'ın koşucu içindeki kendi kapanış adımları ile ayrıca başlatılan Recover ayrıdır; Recover yalnız kanıt incelendikten sonra
> AYRI owner onayıyla, BİR KEZ başlatılır; blok Recover'ı otomatik başlatmaz ("BİR KEZ" kodla zorlanmaz — §8.1). Recover'ın **canlı yazma
> kümesi** belgeye (§8.1) ve bloğun Recover girişine (yalnız bilgi metni; yeni soru/akış yok) yazıldı. Canlı veri onay metni §8 kayıt listesiyle
> eşleştirildi; "sentetik tenant CLOSED" ifadesi "dosyalar CLOSED, personel pasif, portal pasif; tenant yaşam döngüsü değişmez" olarak düzeltildi
> (koşucunun kanıt metni pinlidir, değişmedi — §3 notu). Owner adımına "Mesajlar sekmesine geçin" eklendi; beyan seçenekleri ana sayfa/özeti
> hata sayfasından ayırır (harfler ve kod aynı). "Hiçbir dosyaya yazılmaz" türü kapsamsız ifadeler ölçülen kapsama daraltıldı. Blok öz-testine
> G-1..G-4 eklendi. Koşucu, sahte API, QR betiği, pinli 9 dosya ve paket digest **DEĞİŞMEDİ**. Bu revizyon D-7 canlı koşumu ya da Recover için
> yetki DEĞİLDİR; **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.**
> **R02 inceleme düzeltmeleri (2026-10-01; yalnız metin ve belge; blok mantığı, pinli 9 dosya ve paket digest DEĞİŞMEDİ) — §12.1:** kalıntı
> satırının altındaki not kanıttaki "sentetik tenant CLOSED" ifadesinin koşucunun sabit metni olduğunu ve kapanışın doğrulandığını göstermediğini
> söyler (§3 notu); Recover'ın çıkış kodu yeni bir Recover için yetki değildir ve **ikinci bir Recover bu paketle tanımlı değildir, owner kararı
> gerektirir** (§5 adım 7, §8.1, §10 K-6); blok öz-testine G-5 ve G-6 eklendi; §9'a üç sınır notu (D7-E11) ve Recover yetkisinin ölçülmediği
> yazıldı. Blok ve blok öz-testi sha256 değerleri değişti (§7; önceki değerler "R02 ilk tur" olarak korunur).
> **R02 koşucu öz-testi kütüphane kökü (2026-10-03; yalnız `d7-selftest.js` + bu belge) — §6.4, §12.2:** koşucu öz-testi artık Prisma istemcisi
> ve bcrypt için canlı yayın ağacını **varsaymaz**; kütüphane kökü `D7T_LIB_ROOT` ortam değişkeniyle verilir (verilmezse betiğin kendi checkout'u),
> kök canlı yayın ağacının altındaysa test **koşmaz**, modül bulunamazsa açık hatayla durur. Repodaki dosyanın kendisi (ayna değil) canlı olmayan
> kütüphane köküyle koşuldu: **41/41 PASS**. Öz-testin ölçtükleri (41 ölçüt), koşucu, blok, blok öz-testi, sahte API, QR betiği, pinli 9 dosya ve
> paket digest **DEĞİŞMEDİ**; `d7-selftest.js` sha256 değeri değişti (§7; önceki değer korunur). Canlı Run kapıları ve pin denetimi aynıdır.
> **R02-b ek sınırlar (2026-10-03; yalnız bu belge) — §12.3:** Run / normal kapanış / AYRI Recover sınırlarına dört ek yazıldı: pencere açma
> tuzağı (§5 adım 1, §9), kurulum ile makbuz arasındaki pencere (§9; açık owner sorusu §10 K-7), Recover'ın 1 ve 2 çıkış kodları (§3 notu),
> koşucu öz-testinde uzun yol önekli kök (§6.4). Dördü de kaynaktan okundu; canlıda **ölçülmedi**. Owner bloğu, koşucu, iki öz-test, QR betiği,
> sahte API, pinli 9 dosya ve paket digest **DEĞİŞMEDİ**; hiçbir blok / koşucu / öz-test bu turda çalıştırılmadı. Bu ek hiçbir canlı koşum ya da
> Recover için yetki DEĞİLDİR.
> **R03 (2026-10-03) — koşucu kapanış eksikleri (koşucu, sahte API, iki öz-test, owner bloğu ve bu belge değişti; koşucu pini ve paket digest
> değişti) — §13:** (a) makbuz artık kurulumdan **hemen sonra** atanır ve dosyaya yazılır; iki ek dosya yazmasından biri hata verse de Run kendi
> kapanışını koşar ve Recover makbuzu bulur (önceki baytlarda bu pencerede sentetik kullanıcılar **aktif**, dosyalar **ACTIVE** kalıyordu — izole
> senaryoda ölçüldü, §13.1); kanıttaki `setup` alanı yarım kurulumu `fatal` + makbuz durumundan ayırır. (b) Run'ın kendi kapanışında personel
> oturumu 401/403 ile reddedilirse **bir kez** yeniden giriş + **bir kez** yeniden deneme; başka 4xx'te yeniden giriş yok; Recover değişmedi
> (§13.2; canlı etkisi kaynaktan okundu, canlıda ölçülmedi; kabulü açık owner kararı **K-8**). (c) "ürün bulgusu" yalnız DB kapanışı
> ölçülmüşken yazılır; kurtarma adımı "ÖNERİ (yetki DEĞİL)" biçimindedir ve ikinci Recover'a yol tarif etmez; kalıntı metnindeki kapanış özeti
> ölçülenden kurulur; bloğun Run kapanış satırı parçaları kanıttaki verdict'lerden kurulur; bloğun Recover bitiş satırı 0 / 1 / 2 / 3'ü yalnız
> ölçüleni söyleyerek açıklar (§13.3). Çıkış kodu fonksiyonları ve öncelik **değişmedi**. Canlı Run / Recover **koşulmadı**, owner bloğu
> çalıştırılmadı (yalnız blok öz-testi); bu revizyon hiçbir canlı koşum ya da Recover için yetki DEĞİLDİR.
> **R03-c (2026-10-03) — kapanış / Recover doğruluğu (owner talimatı madde 2; koşucu, sahte API, iki öz-test, owner bloğu ve bu belge değişti;
> koşucu pini ve paket digest değişti) — §14:** (a) bloğun Recover bitiş satırı, mevcut oturum reddinin Recover'da **her zaman** ölçülemediğini ve
> yeni giriş reddinin P7-C3L/D satırlarından okunduğunu kodlardan önce yazar; 2 ve 1 neyin doğrulandığını adlandırır (portal DB kapanışı ya da hesap
> yok + personel/dosya kapanışı). (b) Makbuz bellekte var ama dosyası yazılamamışsa ya da okunamıyorsa kanıttaki kurtarma adımı ve bloğun Run 5/6
> metni uygulanamayan `-Mode Recover -ReceiptFile <makbuz>` önerisini **yazmaz**; kanıttaki `receipt` nesnesinden yeni makbuz dosyası yolu (öz-testte
> uçtan uca ölçüldü) **[R03-d'de GEÇERSİZ → §14.5: o yol WinPS 5.1'de kullanılamıyordu; yerine kanıttaki `recovery.makbuzJson`'dan iki kabukta ölçülmüş
> TEK komut]** ya da kanıtta da yoksa **somut engel** yazılır. (c) Tarama: koşucu oturumunun 200'ü yalnız P7-C2 PASS **ve** P7-C5 PASS iken ürün
> bulgusudur (hesap ölçüm sırasında yeniden açılırsa "ürün bulgusu adayı DEĞİL"); hesap yokken P7-C1 günlük satırı "kapatıldı" demez. Çıkış kodları
> **değişmedi**. Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum ya da Recover için yetki DEĞİLDİR.
> **R03-d (2026-10-04) — R03-c bağımsız doğrulamasının bulguları (koşucu, sahte API, iki öz-test, owner bloğu ve bu belge değişti; koşucu pini ve
> paket digest değişti) — §14.5:** R03-c (c)'deki **"ürün bulgusu adayı DEĞİL" sınıflaması YANLIŞTI**: ürünün guard'ı eski oturumu sürüm farkıyla
> `isActive`'ten bağımsız reddeder ve yeniden açma sürümü artırır — P7-C2 PASS + P7-C5 FAIL iken 200 artık sürüme bağlı sınıflanır ("ÜRÜN BULGUSU ADAYI"
> + ayrı "yeniden AÇILDI … (Recover kapatabilir)" satırı; "adayı DEĞİL" yalnız sürüm verilme değerine eşit ve hesap açıkken). R03-c (b)'deki "receipt
> nesnesini yeni JSON dosyasına yazın" yolu ölçülmemişti ve WinPS 5.1'de kullanılamıyordu; yerine iki kabukta ölçülmüş TEK komut. Bloğun Recover kod
> açıklamaları yalnız okunabilir kanıt varken; bayat makbuz önerilmez. Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum ya da Recover için
> yetki DEĞİLDİR. **[R03-e'de değişti → §14.6:** "adayı DEĞİL" dalı kaldırıldı; sürüm kuralı artık her 200'e uygulanır.**]** **[R03-f'de değişti → §14.7:**
> "(Recover kapatabilir)" kesin ifadesi kaldırıldı — Recover metni Run'ın kapatma çağrılarına bağlı; "yeniden AÇILDI" yalnız `isActive` false→true ölçülmüşken.**]**
> **R03-e (2026-10-04) — R03-d iki bağımsız doğrulamasının bulguları (koşucu, sahte API, iki öz-test, owner bloğu ve bu belge değişti; koşucu pini ve
> paket digest değişti) — §14.6:** (B1) R03-d'nin sürüm kuralı yalnız P7-C2 PASS + P7-C5 FAIL dalındaydı; kardeş dal (kapatmadan sonra hesap AÇIK) 200'ü
> sürüme bakmadan "ürün bulgusu SAYILMADI" yazıyor, 2xx kapatma çağrısına rağmen "kapatma YAPILMADI" diyordu. Artık koşucu oturumunun **her** 200'ü tek
> fonksiyonla, kaynağa karşı denetlenmiş bir **karar tablosuyla** sınıflanır; "ürün bulgusu değil" yalnız T5'te; "sürüm geri dönüşü → adayı DEĞİL" dalı
> kaldırıldı (AYRIŞTIRILAMADI). Kapatma metni ölçülene bağlı; açık portal erişimi ürün bulgusundan **ayrı** satırda (kanıt + blok ekranı); verilme sürümü
> koşucunun token'ındaki claim'den (İMZASIZ decode; token kanıta yazılmaz). (B2) R03-d'de geçersizleşen satırlar işaretlendi. (B3) 5xx'in guard'ı
> geçtiğini gösterdiği not edildi (kod değişmedi). Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum ya da Recover için yetki DEĞİLDİR.
> **[R03-f'de değişti → §14.7:** karar sırası (b'den bağımsız T1 → TG → T3, sonra T0), TI yalnız a = b = c, T5 metni ("kapatma DB'ye yansımadı" yerine ölçülen),
> açık erişim metni ("portal hesabı açık … (Recover kapatabilir)" yerine ölçülen durum + Run'ın kapatma çağrılarına bağlı Recover metni), P7-C1 açıklaması.**]**
> **R03-f (2026-10-04) — R03-e iki bağımsız doğrulamasının MINOR bulguları (koşucu, sahte API, iki öz-test, owner bloğu ve bu belge değişti; koşucu pini ve
> paket digest değişti) — §14.7:** (F1) P7-C1 açıklaması ölçülene indi: "kapatma çağrısı yetkili uçta 2xx döndü (admin/disable-user) ya da hesap zaten
> kapalıydı ya da 2xx olmadan kapatma adımından sonra DB'de kapalı görüldü — DB kapanışı P7-C2 / P7-C5 satırlarında"; gözlemde hangi dayanağın tuttuğu
> (`dayanak=`); "kapatıldı" DB kapanışı ölçülmeden yazılmaz. (F2) "(Recover kapatabilir)" kesin ifadesi kaldırıldı: Run'daki son kapatma çağrısı 401/403 ise
> "Recover aynı personel kimliğiyle kapatmayı yeniden dener; Run'da kapatma HTTP <kod> ile reddedildi — Recover'ın kapatabildiği ÖLÇÜLMEDİ (…)", aksi halde
> "Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür)". (F3) Kısmi durum metinleri ölçülenle: "portal hesabı AKTİF (…)" / "portal kapanışı
> TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (…)"; "yeniden AÇILDI" yalnız `isActive` false→true ölçülmüşken; T5 "hesap aktif kaldı …; guard
> hasPortalAccess okumaz; 200 beklenir — ürün bulgusu değil (…)". (F4) TI yalnız a = b = c; a = c ≠ b → T2 ADAY. (F5) b'den bağımsız ADAY hücreleri T0'dan
> önce: T1 → **TG** (yeni: token claim'i geçersiz — guard her isteği reddeder, `portal-auth.guard.ts:42-45`) → T3. (F6) Bloğun bayat R03-d yorumu düzeltildi
> (yalnız yorum). Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum ya da Recover için yetki DEĞİLDİR.
> **[R03-g'de değişti → §14.8:** Recover modunun açık erişim metni ölçülene bağlı; token JWT olarak okunamazsa TJ (ADAY); bloğun Recover bilgi metni koşula bağlı.**]**
> **R03-g (2026-10-04) — R03-f iki bağımsız doğrulamasının MINOR kenarları; son tur (koşucu, sahte API, iki öz-test, owner bloğu ve bu belge değişti; koşucu
> pini ve paket digest değişti) — §14.8:** (G1) Recover modunda açık erişim metni ölçülene bağlı: Recover kapatmayı 2xx ile yapıp P7-C2 PASS ölçtüyse ve
> erişim HTTP ölçümleri sırasında yeniden açıldıysa "Recover kapattı (kapatma çağrısı 2xx, P7-C2 PASS) ama erişim HTTP ölçümleri sırasında yeniden açıldı
> (P7-C5 FAIL) — açık erişim KAPANMADI; …"; "bu Recover kapatamadı" yalnız kapatma adımından sonra DB'de kapalı ölçülmemişken. (G2) Bloğun Recover bilgi
> metni: "yetkili uç çağrılır (…, en çok 2 deneme); çağrı 2xx dönerse ürün şunları yazar: …; 401/403'te kapatma yapılmaz (sonuç Recover kanıtında …)". (G3)
> Token JWT olarak okunamazsa (verilme sürümü s1'e düşse de) HTTP 200 → yeni hücre **TJ** (ADAY; ürün guard'ı bu token'ı DB'den önce reddeder,
> `portal-auth.guard.ts:36`); T5'e ulaşmaz. (G4) T2'nin a = c ≠ b dalında b > c iken "ALTINDA" notu. (G5) Sıra girdileri (B / T1 → TG / TJ). (G6) §14.6 (v)
> işaretlendi. Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum ya da Recover için yetki DEĞİLDİR.
> **R04-recover-girdi (2026-10-04) — owner kararı madde 5 + 6 (koşucu, koşucu öz-testi, owner bloğu, blok öz-testi ve bu belge değişti; koşucu pini ve paket
> digest'i YENİ; sahte API DEĞİŞMEDİ) — §14.9:** (i) Yeni Recover girdisi `-Mode Recover -RunEvidenceDir '<tamamlanmış Run kanıt dizini>'`: makbuzu blok, ayrı Recover onayından (owner bu modu ayrıca başlatır; blok bu onayı sormaz ve ölçmez — değişmedi) sonra,
> Run kanıtındaki `recovery.makbuzJson` alanından Run kanıt dizininin **dışına** (kardeş dizin) yazar ve Recover başlamadan doğrular (manifest / hash bağı, runId /
> kimlik bağı, GO defteri satırı, geri okuma, kaynağın değişmediği); biri tutmazsa Recover başlamaz ve başarı sayılmaz. Var olan makbuz ezilmez; `-ReceiptFile` yolu
> korunur; Run başarısız oldu diye otomatik Recover yoktur. (ii) Recover bitiş ekranı portal erişimini son ölçüme göre AÇIK / KAPALI / ÖLÇÜLEMEDİ diye gösterir.
> (iii) Ret ölçütlerinde (P7-C3L/D, P7-C4L/D) 503 / 429 dışındaki 5xx gözlemi "ret kanıtlanmadı; neden kesinleşmedi (ürün kusuru olarak sınıflanmadı)" der; sonuç
> (verdict) ve çıkış kodları değişmedi. Manifestin bağımsız çapası **yoktur** (sınır; ekrana ve kayda yazılır). Aşama 1'de koşucu öz-testi koşulmamıştı (yalnız blok
> öz-testi, iki kabukta); aşama 2'de koşuldu — aşağıdaki not. Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum ya da Recover için yetki DEĞİLDİR.
>
> **R04-b (2026-10-04) — aşama 2: kurtarma adımının hizalanması + koşucu öz-testlerinin koşulması (koşucu, koşucu öz-testi, owner bloğu, blok öz-testi ve bu belge
> değişti; koşucu pini ve paket digest'i YENİ; sahte API DEĞİŞMEDİ) — §14.9 "R04-b":** (a) **Kurtarma adımı hizalandı:** koşucunun kanıta yazdığı kurtarma adımı
> (`recovery.adim`) artık bloğun Run sonu ekranıyla aynı seçeneği gösterir — kanıtta makbuz metni varken `-Mode Recover -RunEvidenceDir '<bu koşumun kanıt dizini>'`.
> Önceki baytlar elle TEK komut veriyor ve yeni makbuzu Run kanıt dizininin **içine** yazdırıyordu; makbuz güncelken de `-ReceiptFile <makbuz>` öneriyordu. İkisi de
> kaldırıldı; kanıtta makbuz yoksa "makbuz YOK … (K-7)" metni aynen. Blokta yalnız metin (Run sonu satırı) + pin. (b) **Recover makbuza yazmaz (ölçüldü):** D-7 koşucusunun
> Recover'ında makbuz yazımı yoktur (kaynak) ve bloğun kardeş dizine yazdığı makbuzun baytları gerçek Recover'dan önce = sonra (koşucu öz-testi Z19-b, iki kabuk) —
> `RECOVER-GIRDI-KAYDI.json`'daki `makbuzSha256` Recover'dan sonra da tutar; D-6'daki salt okunur bayrağın D-7'de karşılığı yoktur. (c) **Ölçülen (son baytlar):** koşucu
> öz-testi **88/88**, blok öz-testi **84/84** iki kabukta; gerçek koşucu kanıtıyla çıkarma iki kabukta ve o makbuzla gerçek Recover (kimlik bağı OK) koşucu öz-testinin
> kalıcı kalemi. Sonuç (verdict) ve çıkış kodları **değişmedi**. Pinler: **§7**. Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum ya da Recover için yetki DEĞİLDİR.
>
> **R04-c (2026-10-05) — aşama 3: odak doğrulamanın beş somut noktası (yalnız owner bloğu, blok öz-testi ve bu belge değişti; koşucu, koşucu öz-testi, sahte API,
> `PkgPins` ve paket digest'i DEĞİŞMEDİ; D-6 R04-c ile aynı ilke) — §14.9 "R04-c":** **K1** Recover bitiş ekranındaki PORTAL ERİŞİMİ satırı DB kapalıyken artık yalnız DB
> durumundan kurulmaz: aynı Recover kanıtındaki yeni giriş reddi ölçütleri (P7-C3L / P7-C3D) satıra yazılır; yeşil "KAPALI (DB + yeni giriş reddi PASS)" **yalnız** ikisi
> PASS iken; biri FAIL (ör. kapanıştan sonra giriş kabul edildi) → kırmızı "DB'de kapalı AMA yeni giriş reddi FAIL (…) — erişim kapalı SAYILMAZ"; ölçülemeyen / satır yok →
> sarı "DB'de kapalı; yeni giriş reddi ÖLÇÜLEMEDİ (…)". **K2** `-ReceiptFile`, manifesti olan (tamamlanmış) Run kanıt dizinindeki makbuzla ve o dizindeki kanıtta makbuz
> metni varken **reddedilir** (DUR; `-RunEvidenceDir`'e yönlendirir) — orijinal kanıt dizinine yazılmaz; kanıtta makbuz metni yoksa bu paketle tanımlı tek yol olduğu için
> sürer ve kanıt dizininin değişeceği açıkça yazılır. **K3** `-RunEvidenceDir` yolunda makbuz node'dan önce iki noktada yeniden ölçülür; kayda yazılan özetten farklıysa
> Recover başlamaz ve dizin KULLANILMAZ diye işaretlenir; Recover'dan sonra makbuz yeniden ölçülür ve "RECOVER GİRDİSİ (makbuz): … DEĞİŞMEDİ / DEĞİŞTİ" satırıyla gösterilir.
> **K4** manifest yokken DUR metni kalan yolu ve makbuz dosyasının ölçülen durumunu yazar. **K5** makbuz yazımından sonraki beklenmeyen istisna da KULLANILMAZ işareti + DUR
> üretir. Çıkış kodları **değişmedi**; Recover yine soru sormaz. **Ölçülen (son baytlar):** blok öz-testi **88/88** iki kabukta; koşucu öz-testi bu aşamada **koşulmadı**
> (koşucu değişmedi — R04-b baytlarında 88/88 ölçülmüştü). Pinler: **§7**. Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum ya da Recover için yetki DEĞİLDİR.
>
> **R05 (2026-10-08) — kapsam ihlalinde dur (owner kararı "D-7 dar düzeltme"; koşucu, sahte API, koşucu öz-testi, bloktaki koşucu pini + paket digest'i ve bu belge
> değişti; blok öz-testi ve QR betiği DEĞİŞMEDİ) — §15:** kapsam dışı üç ölçütten (D7-4N · D7-4S · D7-4U) biri **FAIL ya da ÖLÇÜLEMEYEN** ise koşucu **o anda durur**:
> kalan mesaj / yanıt / okundu adımları koşulmaz, giriş bilgisi **gösterilmez**, telefon adımı **başlamaz**; kapanış ve kanıt yazımı **çalışır**. FAIL, ÖLÇÜLEMEYEN'e
> çevrilmez; yalnız ÖLÇÜLEMEYEN varsa FAIL üretilmez; koşulmayan adımlar PASS sayılmaz. Önceki baytlar (R04-b) bu durumda akışı sürdürüyor ve giriş bilgisini
> gösterebiliyordu. Çıkış kodu fonksiyonları ve öncelik **değişmedi**. "Kimlikten makbuz" yaması **yapılmadı** (owner kararı — §10 K-7). **Ölçülen (son baytlar):**
> koşucu öz-testi **98/98**, blok öz-testi **88/88** iki kabukta. Pinler: **§7**. Canlı Run / Recover **koşulmadı**; bu revizyon hiçbir canlı koşum
> ya da Recover için yetki DEĞİLDİR.
>
> **R06 (2026-10-09) — 300 saniyelik gözlem penceresi (owner kararı; koşucu, koşucu öz-testi, blok, blok öz-testi ve bu belge değişti; sahte API ve QR betiği
> DEĞİŞMEDİ) — §16:** canlı inceleme süresi 120 sn → **300 sn**; süre telefon girişi algılanıp ikinci personel yanıtı gönderildikten sonraki **tek gözlem penceresidir**; pencerede iki ayrı gözlem yapılır: GÖZLEM A (telefonda **mesaj listesi**) ve GÖZLEM B (telefonda **ikinci personel yanıtı**). Owner ekranı telefon adımlarını
> numaralı ve süreleriyle gösterir. Giriş bekleme sınırı (20 dk), kapanış mantığı ve çıkış kodları **değişmedi**; "tamamlandı" girdisi **yoktur** — her süre dolunca koşucu
> kendiliğinden ilerler. **Ölçülen (son baytlar):** koşucu öz-testi **99/99**, blok öz-testi **88/88** iki kabukta. Pinler: **§7**.
> **Durum satırlarına not:** 2026-10-09'da owner onayıyla, bu revizyondan ÖNCEKİ (120 saniyelik pencereli) baytlarla canlı koşum yapıldı; R06 (300 saniyelik) baytlar canlıda **koşulmadı**. O koşumların
> **sonuç kaydı bu belgede DEĞİLDİR** (yerel kayıt; public kayıt ayrı owner kararıdır) ve bu paketin kabulü **yoktur**; yukarıdaki "canlıda koşulmadı" ifadeleri yazıldıkları
> revizyonun tarihini taşır. Bu revizyon yeni bir canlı Run / Recover için yetki DEĞİLDİR.

## 1. Ne ölçer ve ne yapmaz

Uçtan uca: sentetik müvekkile yetkili personelle portal hesabı (gönderimsiz) → koşucu kendi portal oturumuyla **dış HTTPS** üzerinden mesaj
gönderir/listeler/okundu işaretler, personel yanıtını **yerel API**'den gönderir → owner **telefondan** (mobil veri) giriş yapar (girişten
sonra portal **ana sayfası** açılır; **Mesajlar sekmesine** geçer — §5 adım 4), mesaj sayfasında bu koşumun mesajlarını görür, isterse bir
mesaj gönderir; giriş algılanınca koşucu **ikinci** personel yanıtını gönderir (owner yeni mesajı ve zil simgesindeki bildirim rozetini görür
— §9) → kapanış (D-4 R03 kuralları). Koşucu **e-posta/SMS üretmez ve çağırmaz** (forgot/reset/change-password ve belge
uçları yasak; kaynak taraması T-1), **dış admin uçlarını çağırmaz** (D7-5 = D-8 kapsamı), **mesaj/bildirim silmez** (ürünte silme ucu yok),
telefondan gönderilen mesajın **içeriğini kendi kanıtına yazmaz** (yalnız sayı; mesaj satırının kendisi canlı DB'de kalır). Parola/token/GO/DB
URL'yi blok ve koşucu **kendi kanıt/log dosyalarına yazmaz** (öz-test ortamında ölçülen kapsam: blok öz-testi R-9, koşucu öz-testi S-1); parola
**özetleri** canlı DB'de sentetik hesaplarda durur, canlı API'nin kendi uygulama günlüğü AYRIDIR ve içeriği bu paketle ölçülmez (§8, §9; R02).

## 2. Kaynak yan etki bulgusu (HY_WT_R27 `portal.controller.ts` / `portal.service.ts`; koşucu yazımından ÖNCE ölçüldü)

| Uç | Guard | Yazdığı | Bildirim | E-posta/outbox | Audit |
|---|---|---|---|---|---|
| `POST /api/portal/messages` (`sendMessageFromClient`) | `PortalAuthGuard` (DB doğrulamalı) | **yalnız** `PortalMessage` (senderType `CLIENT`, senderId = clientId, senderName sabit "Müvekkil") | **yok** | **yok** | **yok** (yalnız `logger.log` clientId) |
| `GET /api/portal/messages` · `messages/unread-count` · `POST messages/mark-read` | `PortalAuthGuard` | mark-read: `OFFICE` satırlarını `isRead=true` | — | — | yok |
| `POST /api/portal/admin/messages/:clientId` (`sendMessageFromOffice`) | personel oturumu | `PortalMessage` (`OFFICE`, senderId = user.id) **+ `PortalNotification`** (type `MESAJ`, "Yeni Mesaj", linkUrl `/portal/messages`) | **1 satır / yanıt** (DB) | **yok** | **yok** |
| `GET /api/portal/admin/messages/:clientId` (`getClientMessages`) | personel oturumu | müvekkil (`CLIENT`) mesajlarını **okundu işaretler** (yan etki); **dönüş gövdesi `{ client, messages }`** (müvekkil tenantta değilse 404; çıplak dizi DEĞİL — koşucu D7-3G ve sahte API bu sözleşmeyi kullanır) | — | — | yok |
| `GET /api/portal/admin/messages/clients` | personel oturumu | — | — | — | yok |

- `EmailProviderService` `portal.service.ts` içinde yalnız `sendResetEmail` (D-5) tarafından kullanılır; `PortalMessage`/`PortalNotification`
  tablolarına `apps/api/src` altında başka yazıcı/okuyucu (cron, outbox, e-posta) **yok**. **Sonuç: ne müvekkil mesajı ne personel yanıtı
  herhangi bir adrese (gerçek/sentetik `.invalid`) gönderim denemesi üretir** → gönderim için ayrı owner kararı GEREKMEZ (SMTP dokunulmaz).
- **Kapsam dışı `caseId`:** `resolveCaseReference` (CLIENT-K1) yabancı tenant / aynı tenant başka müvekkil / bulunmayan / biçimsiz id için
  **400 "Geçersiz dosya referansı"** döner ve satır yazılmaz (varlık sızdırılmaz). D-8 §5 tanımındaki **404 değil**; koşucu **400 ölçer**
  (`FOREIGN_CASE_EXPECT = 400`); canlı 404 verirse satır FAIL olur (canlı dist ≠ kaynak işareti). Üç varyantın üçü de **ölçülür**: yabancı tenant
  dosyası (D7-4N), **aynı sentetik tenantta ikinci sentetik müvekkile bağlı, `showToClient=true` dosya (D7-4S; tek kapsam dışılık müvekkil bağı)**,
  bulunmayan id (D7-4U). Biçimsiz id (uzunluk > 64 / dize değil) yalnız kaynaktan okundu, canlıda **ölçülmez**.
- **Personel (büro) mesaj uçları:** bu paket bu uçları yalnız **yerel API'den, sentetik elev1 personelle** çağırır (D7-3, D7-3N, D7-3U, D7-3G,
  D7-3F, D7-3B) ve personel yetki modelini **ölçmez**. Bu uçlara ilişkin bir güvenlik kaydı owner-yerel kısıtlı kayıtta izlenir
  (**SEC-PORTAL-ADMIN-MSG-01**, AÇIK; ayrıntı public repoya yazılmaz). Dışarıdan kapalı olması **kenar** (D-8) kararıdır. → owner notu §10 K-2.
- Şema: tanımdaki "ClientMessage" modeli yok; gerçek model **`PortalMessage`** (`clientId, tenantId, caseId?, content, senderType, senderId,
  senderName, isRead, readAt`) ve **`PortalNotification`** (`clientId, caseId?, type, title, message, isRead, linkUrl`). Silme ucu yok.
- Kenar izin listesi (Caddyfile şablonu: `client-external-access-r01/templates/Caddyfile.template` — `@deny path_regexp ^/api/portal/admin(/|$)`,
  `web` regexp'inde `portal/messages`, `aget` regexp'inde `messages|messages/unread-count`, `apost` regexp'inde `messages|messages/mark-read`):
  `GET/POST /api/portal/messages`, `GET messages/unread-count`, `POST messages/mark-read`, `GET /portal/messages` **izinli**; `/api/portal/admin/*` **403**
  → koşucu admin uçlarını yalnız yerel API'den (8080) çağırır. Canlı Caddy yapılandırmasının şablonla aynı olduğu bu pakette **ölçülmez** (D-8 sondası).
- Web `/portal/messages` sayfası açılışta `mark-read` çağırır ve 10 sn'de bir listeyi yeniler → telefon, 2. personel yanıtını okundu işaretleyebilir;
  koşucu bunu **yargılamaz**, yalnız `phoneObservation.office2ReadByPhone` olarak raporlar.

## 3. Ölçütler

| ID | Ölçüt | Kaynak |
|---|---|---|
| P7-00 / P7-01 / P7-02 | elev1 ADMIN değil · gönderimsiz portal hesabı (`.invalid`) · DB aktif+erişim+e-posta | D-4 kalıbı |
| P7-03L / P7-04D | koşucu portal girişi yerel 201 · dosya listesi dış 200 yalnız `I3-<runId>` | HTTP |
| **D7-1** | dış `POST /api/portal/messages {content:'D7-<runId>'}` **201** + DB satırı (clientId/tenantId/senderType=CLIENT/isRead=false/caseId=null) | HTTP+DB |
| **D7-2** | dış `GET /api/portal/messages` **200** ve **yalnız bu koşumun** mesajları (id kümesi; en az 1 kendi mesajı — boş doğrulama yok) | HTTP |
| **D7-4N / D7-4S / D7-4U / D7-4P** | yabancı tenant dosyası / **aynı tenant başka müvekkil dosyası** / bulunmayan id ile POST → **400** ve satır yok (üçü aynı cevap) · kendi dosyası → 201 + caseId doğru · **R05:** D7-4N / D7-4S / D7-4U'dan biri PASS değilse koşucu o anda durur; sonraki ölçütler ÖLÇÜLEMEYEN yazılır (§15) | HTTP+DB |
| **D7-3 / D7-3N** | personel yanıtı **yerel** `POST /portal/admin/messages/:clientId` (elev1) 201 + OFFICE satırı → dış GET'te görünür · `PortalNotification` **+1** (MESAJ, `/portal/messages`). Personel yanıtı **yanıtsız** kalırsa ikisi de **ÖLÇÜLEMEYEN** (FAIL değil) | HTTP+DB |
| **D7-3U** | dış `unread-count` **1** → `mark-read` 2xx → **0**; DB OFFICE satırı `isRead=true` + `readAt`. Personel yanıtı / ilk `unread-count` / `mark-read` **yanıtsız** kalırsa **ÖLÇÜLEMEYEN** (FAIL değil) | HTTP+DB |
| D7-3G / D7-3F | personel yerel GET 200, **gövde `{ client, messages }`** (ürün sözleşmesi; çıplak dizi FAIL) ve tüm koşum mesajları `messages` içinde; müvekkil mesajları okundu işaretlenir · yabancı tenant müvekkiline personel mesajı **404**, satır yok | HTTP+DB |
| P7-DISP / P7-WAIT | QR `/portal/messages` + giriş bilgisi yalnız konsol · koşucu dışından giriş (DB loginCount; cihaz/ağ owner beyanı) | konsol/DB |
| **D7-3B** | telefon girişinden SONRA 2. personel yanıtı 201 **+ DB OFFICE satırı (clientId/tenantId/senderId/content)**; okunmamış sayacı **raporlanır**, yargılanmaz | HTTP+DB |
| D7-5 | dış admin uçları 403 — **bu koşucuda ÇAĞRILMAZ/ÖLÇÜLMEZ** (kanıtta `d75Note`; D-8 sondası ölçer) | not |
| P7-C1 … P7-C5, P7-C2V | kapanış (D-4 R03 kuralları; korumalı uç **`GET /api/portal/messages`**) | DB+HTTP |
| **P7-MSG-KEPT** | koşucunun yazdığı `PortalMessage` satırlarının **tamamı yerinde** (`yerinde=k/k`) ve `PortalMessage`/`PortalNotification` **SİLİNMEDİ**; kanıt `yerinde=k/k · saklandı: n mesaj (koşucu k · telefon t) + m bildirim satırı (kapanış, ölçülen: <U-CLOSE ve portal DB ölçümü>) — SİLİNMEDİ` (R03; R01/R02 baytlarında parantez SABİT "(sentetik tenant CLOSED; portal pasif)" idi); `messageResidue.deleted=false`. Koşucu **hiç mesaj yazmadıysa** (ya da Recover makbuzunda `runnerMessageIds` yoksa) boş-doğrulama PASS **verilmez**: **ÖLÇÜLEMEYEN** + yalnız rapor. Koşucu mesaj id'leri makbuza `runnerMessageIds` olarak yazılır; Recover bunlarla gerçek sayım yapar | DB |
| U-CLOSE / U-ISO / P7-D9 | personel/dosya kapanışı · izolasyon (yalnız sayı) · birleşik | DB |

Gösterim kapısı (R05): `P7-03L, P7-04D, D7-1, D7-2, D7-4N, D7-4S, D7-4U, D7-3, D7-3U` PASS değilse giriş bilgisi gösterilmez, telefon beklenmez.
Kapsam dışı üç ölçüt (D7-4N / 4S / 4U) ayrıca **durdurucudur**: biri FAIL ya da ÖLÇÜLEMEYEN ise sıradaki adımlar hiç koşulmaz (§15). D7-3N / D7-4P / D7-3G / D7-3F
kapı dışıdır (kusur FAIL olur, akış sürer). R04-b ve önceki baytlarda D7-4N / 4S / 4U da kapı dışıydı. Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF REDDİ · 5 PERSONEL/DOSYA · 6 PORTAL KAPANIŞI DOĞRULANMADI ·
7 KANIT YAZILAMADI (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0); owner bloğu 90 kapı · 91 node. Recover ölçülemeyeni 0 yapmaz (C4 Recover'da hep ÖLÇÜLEMEYEN → 3).

**Not (R02) — "sentetik tenant CLOSED" ifadesi:** P7-MSG-KEPT kanıt metnindeki "(sentetik tenant CLOSED; portal pasif)" (Recover kanıtında
"(sentetik tenant CLOSED)") ve `messageResidue.note` içindeki "sentetik tenant kapanışı" ifadeleri koşucunun (pinli, bu revizyonda DEĞİŞMEDİ)
**SABİT** metnidir: koşucu bu metni kapanış sonucuna bakmadan, kapanış doğrulanmadığında da (çıkış 5/6) aynen yazar (kaynaktan okundu: metin
şablonu `out.portalClose` / `out.closure` değerine bağlı değildir). Kanıt metnindeki "sentetik tenant CLOSED" koşucunun SABİT ifadesidir;
kapanışın doğrulandığını **GÖSTERMEZ** — kapanış durumu DOĞRULANDI / DOĞRULANAMADI satırındadır (Run: bloğun "Portal erişim kapanışı …" satırı
ve kanıttaki P7-D9; Recover'da böyle bir satır gösterilmez, durum çıkış kodu satırındadır); anlamı: hedeflenen kapanış = **dosyalar CLOSED +
personel pasif + portal pasif**; tenant yaşam döngüsü değişmez. Tenant kaydı kapatılmaz (kaynaktan okundu: kapanışta yazılanlar `User`, `Case`,
portal hesabı, müvekkil erişim bayrağı ve kapatma audit satırıdır; `Tenant` satırına yazma yoktur).
Owner bloğu bu açıklamayı kalıntı satırının altında (Run ve Recover bitişi) gösterir; onay metni kapanışı ve tenant yaşam döngüsünü ayrıca yazar.
**R03 güncellemesi (bu notun yukarısı R01/R02 koşucu baytlarının kaydıdır):** koşucu bu sabit ifadeyi artık **yazmaz**. Parantez içindeki kapanış
özeti ölçülenden kurulur (`closureTag`): personel/dosya için U-CLOSE ile aynı kaynak — "personel pasif + dosyalar CLOSED (U-CLOSE PASS)" ya da
"personel/dosya kapanışı DOĞRULANMADI (U-CLOSE PASS değil)"; portal için "portal hesabı YOK" · "portal DB'de pasif ölçüldü (P7-C2 PASS)" · "portal DB
kapanışı DOĞRULANMADI". `messageResidue.note` artık "sentetik tenant kapanışıyla erişilemez" demez; erişimin kapanıp kapanmadığını P7-C* ve U-CLOSE
satırlarına bırakır. Bloğun kalıntı notu bu yeni metni anlatır (blok öz-testi G-5); onay metni koşucunun eski ifadesine atıf yapmaz (G-2). Öz-test
C-1 bu öz-testin tüm kanıtlarında parantezin U-CLOSE / P7-C2 verdict'iyle tutarlı olduğunu ölçer.
**Not (R02) — Recover çıkışı:** "C4 Recover'da hep ÖLÇÜLEMEYEN" portal hesabı varken geçerlidir; hesap hiç oluşmadıysa C3/C4 satırları üretilmez (§9).
**Not (R02-b) — Recover'da 1 ve 2 (kaynaktan okundu: koşucu `recoverExitCode` + `recoverMode`; canlıda ölçülmedi; koşucu öz-testinin iki Recover
senaryosu — Z5, Z10-r — bu iki kodu üretmez).** Yukarıdaki çıkış listesi Run içindir. Bloğun Recover bitiş satırı 0 / 3 / 6 / 5 / 4 / 7 / 91
kodlarını açıklar; **1 ve 2'yi açıklamaz** (blok metni bu turda değiştirilmedi). Koşucu Recover'da bu iki kodu da döndürebilir ve blok node
kodunu değiştirmeden taşır. Recover'da öncelik 6 > 5 > 1 > 2 > 3 > 0'dır (kanıt yazılamazsa 7; 5/6 korunur):
- **Recover 1 (DURDU):** portal DB kapanışı ve personel/dosya kapanışı doğrulanmıştır (6 ve 5 koşulları yoktur), ama Recover'ın hazırlık
  adımında (portal durumunun okunması ya da makbuzdaki sentetik personelin geçici oturumunun açılması) beklenmeyen bir hata oluşmuştur; hata
  özeti kanıttaki `fatal` alanındadır. 1, hem 2'den hem 3'ten önce gelir: aynı kanıtta FAIL ya da ÖLÇÜLEMEYEN satır da bulunabilir — satırlar
  (P7-C3L/C3D, P7-C4L/C4D, P7-MSG-KEPT) ayrıca okunur; 1 "HTTP reddi doğrulandı" anlamına **gelmez**. Koşucu süreci kanıt yazmadan
  yakalanmamış bir hatayla biterse (ör. kütüphane yüklenemedi) node'un kendi çıkış kodu da 1 olur; blok yalnız "0 + kanıt yok" durumunu 7'ye
  çevirir, 1'i olduğu gibi taşır — 1'de önce kanıt dosyasının var olup olmadığına bakılır (bu cümle Run için de geçerlidir). **R03-d:** Node
  davranışı artık ölçüldü — geçersiz `AH_PRISMA_ROOT` ile koşucu Recover'da kanıt YAZMADAN **1** ile çıkar (R03-d koşucusunda da;
  `r04\recover-dogrulugu\r2\dogrulama-ortak\crash-probe\crash-probe.log`); blok Recover bitiş satırı kod açıklamalarını artık yalnız okunabilir kanıt
  varken yazar, kanıt yoksa kırmızı "KAPANIŞ DOĞRULANMADI — kanıt yok; koşucu yakalanmamış hatayla bitti, hiçbir kapanış ölçülmedi" (§14.5).
- **Recover 2 (FAIL):** kapanışlar doğrulanmış ve hazırlık hatası yoktur, ama en az bir satır FAIL'dir. Koşucu mantığında Recover'da bu
  yalnız **P7-MSG-KEPT** ile oluşur: makbuzdaki koşucu mesaj satırlarından (`runnerMessageIds`) en az biri DB'de yerinde değildir
  (`yerinde=k/n`, k < n). Diğer satırların FAIL'i 2 üretmez: P7-C1 / C2 / C2V / C5 ve P7-C3L / C3D FAIL'i **6**, U-CLOSE FAIL'i **5**
  verir; P7-C4L / C4D Recover'da FAIL olamaz (portal hesabı varken hep ÖLÇÜLEMEYEN). Bu paket mesaj satırı silmez; 2'nin nedeni
  CLIENT/owner tarafından incelenir, paket bunun için bir adım tanımlamaz.
- Koşucunun kapı düzeyindeki aynı sayılar (1 = TLS doğrulaması kapalı ya da bilinmeyen mod · 2 = zorunlu ortam değişkeni eksik · 3 =
  `D7_RECOVER_CONFIRM` yok) blok üzerinden başlatılan Recover'da beklenmez: bu değerleri blok kurar ve TLS değişkeni ortamda tanımlıysa
  kapıda (90) durur (kaynaktan okundu).
- 1 ve 2 dahil hiçbir Recover çıkış kodu yeni bir Recover için yetki değildir; sonuç CLIENT'a/owner'a bildirilir (§5 adım 7, §8.1, §10 K-6).
- **R03:** bloğun Recover bitiş satırı artık **1 ve 2'yi de açıklar** ve 0'ı "FAIL ve ÖLÇÜLEMEYEN satır yok — koşucu mantığında fiilen beklenmez"
  diye yazar (eski "0 kapanış + HTTP reddi doğrulandı" kaldırıldı); 3'ü "portal DB kapanışı ölçüldü ya da portal hesabı yok, FAIL yok, en az bir
  ölçüt ÖLÇÜLEMEYEN — yeni giriş reddinin ölçülüp ölçülmediği P7-C3L/D satırlarından okunur" diye yazar (§13.3; blok öz-testi O-6). Yukarıdaki
  anlamlar ve koşucunun `recoverExitCode` kuralı **değişmedi**.

## 4. Owner bloğu (`scripts/d7-owner-live-block.ps1`) — modlar

Preflight (salt okuma; main senkron, paket pinleri, **R27 dist pini**, `.env` sha, `PUBLIC_PORTAL_BASE_URL` **biçim kapısı** (https + yalnız alan adı;
yol/port/IP/localhost DUR) — adres canlı `.env`'den okunur, blokta host literali **yoktur**; R05 eşleşmesi Run/QrTest'te owner'ın konsola yazdığı
adresle ölçülür (eşleşmezse GO sorulmadan DUR), 8080 tek dinleyici, yabancı kabul
süreci yok, DB kimliği, dış zincir: 8081 yalnız loopback = HY-Caddy, Cloudflared Running) · QrTest (canlı veri yok; **`d7-qr-test.js`** ile
`/portal/messages` — `extacc-qr-test.js` yalnız `/portal/login` kabul ettiğinden kullanılmaz) · **Run**: konsol → bağımsız pencere teyidi → canlı
veri işleme "EVET" → GO (yerel) → defter (sha256) → koşum → ekran temizliği → owner beyanı (8 soru, ayrı dosya) → manifest · **Recover**: `-ReceiptFile`;
soru/GO yok. `owner-block.json`: `emailSendsPlanned=0`, `messageRowsDeleted=false`. Canlı süreler bloğun içinden zorlanır (20 dk bekleme · 5 sn yoklama ·
**300 sn inceleme — R06; önceki 120 sn** · 120 sn geç oluşma). Kanıt JSON'ları **UTF-8** olarak okunur (WinPS 5.1 varsayılanı ANSI; kalıntı metni bozulmasın).

**R04 — Recover girdisi (2026-10-04; §14.9).** Recover artık `-ReceiptFile <makbuz>` **ya da** `-RunEvidenceDir <tamamlanmış Run kanıt dizini>` ile başlatılır (biri;
ikisi birlikte DUR). `-RunEvidenceDir` yolunda makbuzu blok, owner bu modu ayrıca başlattıktan sonra, Run kanıtındaki `recovery.makbuzJson` alanından Run kanıt
dizininin **dışına** (kardeş dizin) yazar ve Recover başlamadan doğrular; biri tutmazsa Recover başlamaz. Recover yine soru sormaz; blok AYRI owner onayını sormaz ve
ölçmez (değişmedi). Run çıkış 5/6 ekranı kanıtta makbuz metni varsa bu seçeneği gösterir (blok Recover'ı kendiliğinden başlatmaz). Recover bitiş
ekranı portal erişimini son ölçüme göre AÇIK / KAPALI / ÖLÇÜLEMEDİ diye gösterir. Kapılar, Run sırası, node çağrısı ve çıkış kodları değişmedi.

**R04-b (2026-10-04; §14.9 "R04-b").** Koşucunun kanıta yazdığı kurtarma adımı (`recovery.adim`) da aynı seçeneği gösterir (elle komut koşucudan kaldırıldı); blokta yalnız
Run sonu satırının metni değişti ("kanıttaki kurtarma adımı da bu seçeneği gösterir"). D-7 koşucusu Recover'da makbuz dosyasına yazmaz (ölçüldü — Z19-b); kapılar, Run
sırası, Recover okuma kapısı, node çağrısı ve çıkış kodları değişmedi.

**R04-c (2026-10-05; §14.9 "R04-c").** (K1) Recover bitiş ekranındaki PORTAL ERİŞİMİ satırı DB kapalıyken kanıttaki yeni giriş reddi ölçütlerine (P7-C3L/D) bağlıdır —
yeşil "KAPALI (DB + yeni giriş reddi PASS)" yalnız ikisi PASS iken; biri FAIL → kırmızı, ölçülemeyen / satır yok → sarı. (K2) `-ReceiptFile` ile verilen makbuz manifesti
olan (tamamlanmış) bir Run kanıt dizinindeyse ve o dizindeki kanıtta makbuz metni varsa blok **DURUR** (90; node çağrılmaz, Recover bilgi metni gösterilmez) ve
`-RunEvidenceDir`'e yönlendirir; kanıtta makbuz metni yoksa (tek kalan yol) sürer ve kanıt dizininin değişeceği Recover başında, bitişinde ve Run sonu ekranında yazılır.
(K3) `-RunEvidenceDir` yolunda makbuzun sha256'sı Recover kanıt dizini açılmadan önce ve node çağrısından hemen önce yeniden ölçülür; kayıttaki özetten farklıysa Recover
başlamaz; Recover'dan sonra "RECOVER GİRDİSİ (makbuz): Recover'dan sonra DEĞİŞMEDİ / DEĞİŞTİ …" satırı gösterilir (D-6'daki satırın ikizi; çıkış kodunu değiştirmez).
(K4) Manifest yokken DUR metni kalan yolu söyler. (K5) Yazımdan sonraki beklenmeyen istisna da KULLANILMAZ işareti + DUR üretir. Recover yine soru sormaz; kapılar, Run
sırası, node çağrısı ve çıkış kodları değişmedi.

**R02 — Recover (yalnız metin).** Recover, Run'ın koşucu içindeki kendi kapanış adımlarından AYRI bir canlı yazma işlemidir; otomatik değildir,
blok onu Run'dan sonra kendiliğinden başlatmaz (öz-test G-4: Run çıkış 5/6'da tek node çağrısı, mod `run`; AST: `Invoke-RecoverMode` yalnız
akıştaki mod dalında). Recover başlarken blok, canlı yazma kümesini (§8.1) ve yetki kuralını konsola yazar (yalnız bilgi: soru sorulmaz, akış
değişmez — öz-test G-3). Blok AYRI owner onayını **sormaz ve ölçmez**; "BİR KEZ" kuralı **kodla zorlanmaz** (§8.1). Recover'ın çıkış kodu
yeni bir Recover için yetki değildir; ikinci bir Recover bu paketle tanımlı değildir, owner kararı gerektirir (§8.1, §10 K-6; öz-test G-6).
**R02 — beyan seçenekleri (yalnız istem metni; harfler ve kod aynı).** "Girişten sonra ne gördünüz?" sorusunda **M** artık "portal açıldı: ana
sayfa/özet ya da Mesajlar sekmesindeki mesaj sayfası", **D** "hata sayfası ya da portal dışı başka sayfa" olarak yazılır (önceki metinde ana
sayfa "D = başka/hata sayfası" altına düşüyordu). "Yeniledikten sonra" sorusunda **M** "portal içeriği hâlâ açık: mesaj sayfası ya da ana
sayfa/özet"tir. Kabul edilen harf kümesi (M/G/D/Y/?) ve bu yanıtları okuyan kod (`-ceq 'M'` karşılaştırmaları) DEĞİŞMEDİ; ana sayfa ile mesaj
sayfası ayrımı harfle yapılmaz, "mesaj sayfasında kaç mesaj vardı" ve "ikinci yanıtı mesaj sayfasında gördünüz mü" sorularıyla izlenir.
Rozet sorusu "zil simgesindeki rozet (okunmamış BİLDİRİM sayacı; mesaj sayacı değildir)" olarak yazılır (§9).
**R02 — kayıt alanı.** `owner-block.json` içindeki `revision` alanı kodda sabittir ve **`R01` kalır** (R02 yalnız metin revizyonudur; alan
değiştirilirse mantık eşitliği bozulurdu). Koşumun hangi blok baytlarıyla yapıldığı blok sha256'sıyla (§7) izlenir, bu alanla değil.

## 5. Owner adımları (telefon: Wi-Fi KAPALI, mobil veri, gizli sekme)

1. Bağımsız PowerShell penceresi. `-Mode Preflight` → "PREFLIGHT GEÇTİ" değilse durun.
   **R02-b — pencereyi owner doğrudan açar** (Başlat menüsü → Windows PowerShell). Ajan pencereyi PowerShell 7 içinden `Start-Process` ile
   açarsa çocuk Windows PowerShell 5.1 süreci PS7 modül yolunu (`PSModulePath`) devralır ve `Get-FileHash` **bulunamaz** (aynı not D-6
   belgesinin R02 sürümünde — PR #2880; bu dalda ve `main`'de henüz yok — §4 adım 1'de kayıtlıdır; D-5 paket belgesinde kaydı yoktur. Bu paket
   için 2026-10-03'te yerel olarak ölçüldü, PowerShell 7.6.6 → Windows PowerShell 5.1.26100: `Start-Process` → `Get-FileHash=False`; PowerShell 7
   içinden çağrı işleciyle doğrudan çağrı → `True`; ölçüm yalnız komut aramasıdır, blok çalıştırılmadı. Başlat menüsünden açılan pencere bu
   turda **ölçülmedi**; kalıcı `PSModulePath` değerinde PowerShell 7 parçası olmadığı bağımsız doğrulamada ölçüldü).
   Bu bloğun `Sha` fonksiyonu `Get-FileHash` kullanır (paket pinleri, canlı dist pini, `.env` pini, kanıt manifesti); bulunamazsa pin kapıları
   ölçüm yapamaz ve blok **her modda** ilk pin ölçümünde "DUR - beklenmeyen hata" ile çıkış 90 verir (kaynaktan okundu; blok bu koşulda
   çalıştırılmadı). Bu 90 bir pin uyuşmazlığı değildir (uyuşmazlıkta mesaj "DOSYA PİNİ uyuşmuyor" olur); ölçümün yapılamadığını gösterir. Blok
   bu durumu kendisi düzeltmez. Bu yol kullanılacaksa çocuk süreç için modül yolu önce düzeltilmelidir (ölçülen düzeltme: `Start-Process`
   öncesinde ebeveyn ortamından `PSModulePath` geçici olarak kaldırılır → çocuk kendi varsayılanını kurar → `Get-FileHash=True`).
2. `-Mode QrTest` → R05 kararındaki public portal adresini yazın (canlı `.env` değeriyle eşleşmeli) → QR'ı okutun; portal sayfası (giriş sayfasına yönlenir) açılırsa **E**; giriş yapmayın.
3. `-Mode Run`: pencere teyidi, R05 public portal adresi (https://…), EVET, GO ref. Koşucu önce makine ölçümlerini yapar (D7-1…D7-3F); konsolda QR + giriş bilgisi görünür. **Run'dan önce konsol penceresini büyütün:** ilk ekran uzundur (numaralı adımlar + QR + giriş bilgisi; kesin satır sayısı adres uzunluğuna bağlıdır, ölçülmedi) ve numaralı telefon adımları QR'ın **üstündedir** — pencere kısaysa yukarı kaydırın.
4. Telefonda giriş yapın. Girişten sonra açılan sayfa mesaj sayfası **değildir**: portal **ana sayfası (özet)** açılır (kaynak: giriş sayfası
   `/portal`'a yönlendirir). Üst menüden **Mesajlar sekmesine geçin**; mesaj sayfasında **üç** mesaj görünmeli (ekrandaki `D7-…` metinleri).
   İsterseniz kısa bir mesaj gönderin (kişisel veri yazmayın).
5. Giriş algılanınca ikinci personel yanıtı gelir; mesaj sayfasında yeni mesajı (sayfa listeyi 10 sn'de bir yeniler) ve üst çubuktaki **zil
   simgesinin rozetini** izleyin. Rozet **okunmamış bildirim sayacıdır** (mesaj sayacı değildir; açıklama §9). **300 sn (R06; önceki 120 sn)** sonra ekran temizlenir, kapatma çalışır.
6. Beyan sorularını (8) yanıtlayın; sayfayı yenileyip gördüğünüzü bildirin. Girişten sonra ana sayfa ya da mesaj sayfası açıldıysa **M**, yine
   giriş sayfası geldiyse **G**, hata sayfası ya da portal dışı bir sayfa geldiyse **D** yazın (§4, R02). Pencereyi kapatın. Mesaj satırları
   DB'de **kalır** (kanıt); silme beklemeyin.
7. **Çıkış 5/6 Recover yetkisi DEĞİLDİR (R02; owner kuralı 2026-10-01).** Run kendi kapanış adımlarını (portal kapatma, personel/dosya kapanışı)
   koşucu İÇİNDE zaten denedi; 5/6 bu adımların doğrulanamadığını söyler. Blok Recover başlatmaz; ajan da otomatik başlatmaz. Önce kanıt dizini
   incelenir (`d7-evidence.json` içindeki `recovery.neden` ve açık kalan kaynaklar) ve sonuç CLIENT'a/owner'a bildirilir; kanıttaki kurtarma
   adımı metni bir **öneridir**, yetki değildir (R03 koşucusu bunu metnin başında yazar: "ÖNERİ (yetki DEĞİL): çıkış kodu Recover yetkisi
   değildir; önce kanıt incelenir. …"; R01/R02 baytlarındaki "… ile BİR KEZ" önerisi kaldırıldı — §13.3).
   Recover (`-Mode Recover -ReceiptFile <kanıt dizinindeki d7-setup-receipt.json>`) yalnız bu inceleme sonrası **AYRI owner onayıyla**, **BİR
   KEZ** koşulur; canlıya ne yazdığı §8.1'dedir; ürün bulgusu varsa Recover onu düzeltmez; kabul tekrarlanmaz. "BİR KEZ" kodla zorlanmaz:
   ikinci bir Recover'ı blok da koşucu da engellemez. Recover'ın çıkış kodu (3/5/6 dahil) yeni bir Recover için yetki değildir; **ikinci bir
   Recover bu paketle tanımlı değildir; owner kararı gerektirir** (§8.1, §10 K-6). Recover sonucu CLIENT'a/owner'a bildirilir.
   **R04 (2026-10-04; §14.9) — Recover girdisi:** `-ReceiptFile` yerine **`-Mode Recover -RunEvidenceDir <Run kanıt dizini>`** kullanılır (Run çıkış 5/6 ekranı, kanıtta
   makbuz metni varsa bu seçeneği somut yoluyla gösterir): makbuzu blok, Run kanıt dizininin **dışına** (kardeş dizin `<Run dizini>.recover-girdi-<UTC zaman>`) yazar ve
   doğrular; doğrulama tutmazsa Recover başlamaz (blok 90 ile durur) ve Run kanıt dizini değişmez. Kanıt dizinindeki `d7-setup-receipt.json` dosyasını `-ReceiptFile`
   ile vermeyin (Recover `recover-*` dizinini makbuzun yanında açar). AYRI owner onayı ve "BİR KEZ" kuralı aynen geçerlidir; blok Recover'ı kendiliğinden başlatmaz.
   **R04-b (§14.9 "R04-b"):** kanıttaki `recovery.adim` metni de bu seçeneği gösterir (elle komut artık yoktur).
   **R04-c (§14.9 "R04-c"):** Recover bitiş ekranındaki "PORTAL ERİŞİMİ (son ölçüme göre …)" satırını **rengiyle birlikte** okuyun: yeşil "KAPALI (DB + yeni giriş reddi
   PASS)" = DB kapalı ve kanıttaki P7-C3L + P7-C3D PASS; kırmızı "DB'de kapalı AMA yeni giriş reddi FAIL (…) — erişim kapalı SAYILMAZ" = DB kapalı görünüyor ama kapanıştan
   sonra giriş reddedilmedi → CLIENT'a bildirin; sarı "DB'de kapalı; yeni giriş reddi ÖLÇÜLEMEDİ (…)" = ret ölçülemedi (portal hesabı satırı DB'de yokken de böyledir).
   Satır çıkış kodunu değiştirmez. "RECOVER GİRDİSİ (makbuz): Recover'dan sonra DEĞİŞMEDİ (sha256 önce = sonra = …)" satırı beklenir; kırmızı "… DEĞİŞTİ ya da okunamadı …"
   görülürse kardeş dizindeki `RECOVER-GIRDI-KAYDI.json` özeti artık dosyayı anlatmaz — kanıt dizinini CLIENT'a iletin (bu satır Recover yetkisi değildir). "Kanıt dizinindeki
   makbuzu `-ReceiptFile` ile vermeyin" kuralını blok artık **zorlar**: o dizindeki kanıtta makbuz metni varken blok 90 ile durur ve `-Mode Recover -RunEvidenceDir '<dizin>'`
   yolunu gösterir. Kanıtta makbuz metni yoksa `-ReceiptFile` tek kalan yoldur ve **Run kanıt dizinini değiştirir** (`recover-*` dizini orada açılır) — bu yolu kullanma
   kararı owner / CLIENT'a aittir.

## 6. Öz-testler (canlıya dokunmadan; 2026-09-29; disposable DB `5449/d67_test`, sahte API 8200/8459, gerçek TLS)

> **Hangi baytlar (R02):** bu tablo ve §6.1 **R01 kayıtlarıdır** (2026-09-29; blok `EDDF7BF3…CA5D`, blok öz-testi `9A5A31F0…70B3`) ve tarihsel
> olarak korunur. Blok ve blok öz-testi R02'de (iki turda) değişti; **son dosya baytlarının sonuçları §6.3'tedir** — güncel durum için §6.3
> okunur. §6.2 "R02 ilk tur" kaydıdır (o turun baytlarıyla) ve tarihsel olarak korunur. `d7-selftest.js` 2026-10-03'de değişti (yalnız kütüphane
> kökü); onun son baytları ve repodaki dosyanın kendisiyle yapılan koşum **§6.4**'tedir.
> **R03 notu (2026-10-03):** koşucu, sahte API, koşucu öz-testi, blok ve blok öz-testi R03'te değişti; **son baytların sonuçları §13.4'tedir**
> (koşucu öz-testi 56/56, blok öz-testi 69/69 iki kabukta). §6.1–§6.4 tarihsel kayıttır.

| Test | Sonuç |
|---|---|
| `d7-selftest.js`: Z1 normal 0 (tüm ölçütler PASS; telefon: sayfa 200 · giriş 201 · 3 mesaj · mark-read · gönderim 201 · 2. yanıt görüldü; kalıntı 5 mesaj + 2 bildirim "yerinde=4/4 … SİLİNMEDİ"; **Z1-g** D7-3G `gövde={client,messages} · listede=3/3`, D7-4S 400 + satır yok, D7-3B `satır=true`, makbuz `runnerMessageIds` 4; admin yalnız yerel; kapanış sonrası telefon oturumu 401) · Z2 liste sızıntısı → D7-2 FAIL, 2 · Z3 kapsam dışı caseId kabul → D7-4N/**4S**/4U FAIL, 2 (kalıntı 8) · Z4-a send 500 → 2 · Z4-b send 500 + kapatma 500 → **6** · Z5 yarım (kapatma 500) 6 → Recover 3 (C4 ölçülemeyen; kalıntı makbuz id'leriyle **gerçek sayım** `yerinde=4/4`) · Z6 mark-read etkisiz → D7-3U FAIL 2 · Z7 bildirim yok → D7-3N FAIL 2 · Z8 guard kusuru → C4 200, ÜRÜN BULGUSU, 6 · **Z14-a** personel yanıtı yanıtsız → D7-3/3N/3U/3F **ÖLÇÜLEMEYEN** (FAIL 0), 3 · **Z14-b** unread-count yanıtsız → D7-3U ÖLÇÜLEMEYEN, 3 · Z9 kapılar (onay 3 · D-5 GO 3 · none+canlı DB 4 · TLS 1 · slug 4 · http 4) · Z10 create 500 → 6, P7-MSG-KEPT **ÖLÇÜLEMEYEN** (boş-doğrulama yok) · **Z10-r** Recover (id listesi yok) → P7-MSG-KEPT ÖLÇÜLEMEYEN · Z10-b geç oluşma görülüp kapatıldı · Z11 konsolsuz 4 · Z12 makbuz 1 · Z13 telefon yok → 3 (`yerinde=3/3`) · S-1 sır sızıntısı (parolalar/JWT/DB URL/GO/**telefon mesajı içeriği**/tuzak içerik) yok · T-1…T-8, P-1/P-2 statik | **41/41 PASS** (üçüncü koşum, inceleme düzeltmeleri sonrası; önceki: 37/37 — §6.1) |
| `d7-owner-block-selftest.ps1` (AST ile gerçek fonksiyonlar; gerçek node; K-1..K-5 + **K-6/K-6b R05 owner girdisi, K-7 adres biçim kapısı, K-8 çözülmemiş adres**; R-1..R-9; V-1..V-5; L-1/L-2 6 süre; O-1..O-3; M-1 kalıntı metni; Z; Q (+Q-U `/portal/messages` + `d7-qr-test.js`, **+Q-R05**); S-1..S-4 + **S-5 topoloji literali yok**) | **52/52 PASS** WinPS 5.1 ve pwsh 7.6.6 (inceleme düzeltmesi; `d7-owner-block-selftest-fix-*.log`) · **kapanış düzeltmesi (6 yeni test): 58/58 PASS WinPS 5.1.26100 ve 58/58 pwsh 7.6.6**, çıkış 0 (`kapanis-duzeltme\d7-block-selftest-winps.log` / `-pwsh.log`; ilk koşum 57/58: K-7 IPv4 kabulü → kapı düzeltildi) · koşucu öz-testi blok değişikliğinden sonra yeniden: **41/41 PASS** (`kapanis-duzeltme\d7-selftest.log`) |

### 6.1 Koşucu öz-testi sonucu

İlk koşum 34/37: Z3 (kabul edilen kusurlu satırlar liste ölçümünde "yabancı" sayılıyordu → koşucu bunları kendi satırı sayar, D7-4N/4U yine FAIL), Z5-b (test `=== null` yerine `== null`), Z10-b (create zaman aşımı 1,5 sn < geç yazım 3 sn). İkinci koşum **37/37 PASS**, çıkış 0. Kanıt: `HY_R27_AGENT_EVIDENCE\extacc-d7-r01\d7-selftest-run1.log`, `d7-selftest-run2.log`, `selftest-run2-artifacts\` (log/makbuz/kanıt; sink ve sertifika dosyaları kopyalanmadı).
**Üçüncü koşum (inceleme düzeltmeleri, §11): 41/41 PASS, çıkış 0** — `d7-selftest-run3-fix.log`, `selftest-run3-fix-artifacts\`, blok öz-testleri `d7-owner-block-selftest-fix-winps51.log` / `-pwsh7.log`, özet `SUMMARY-FIX-R01.txt`.
Not: 37/37 sonucu D7-3G'deki ürün-sözleşmesi kusurunu yakalayamamıştı (sahte API de çıplak dizi döndürüyordu); düzeltme sonrası koşucu `{ client, messages }` ister ve çıplak dizi FAIL olur.

### 6.2 R02 ilk tur (2026-10-01) — o turun dosya baytlarıyla (tarihsel; son baytların sonuçları §6.3)

Test edilen baytlar (**R02 ilk tur**): blok `09935375…0BFF`, blok öz-testi `0720672D…8BFE` (tam değerler §7; her log ve status dosyası koşum
öncesi/sonrası sha256 taşır). Koşucu, sahte API, QR betiği ve pinli 9 dosya R01 baytlarıdır (değişmedi). Canlı DB, canlı API, canlı yayın dizini ve
canlı günlükler kullanılmadı. Bu bölümdeki "son dosya baytları / son koşum" ifadeleri R02 ilk turunun son baytlarını anlatır; inceleme
düzeltmelerinden sonraki baytlar için §6.3 geçerlidir.

| Test | Sonuç (R02) |
|---|---|
| `d7-owner-block-selftest.ps1` — önceki 58 ölçüt + **G-1** blok kaynağında (yorumlar dahil) "hiçbir … dosya/log/günlük/kanıt/rapor … yazılmaz" türü kapsamsız mutlak iddia yok (451 satır tarandı; desen 4 bilinen mutlak cümleyi yakalar, kapsamı adlandırılmış ve ilgisiz 2 cümleyi yakalamaz) · **G-2** owner'a GÖSTERİLEN canlı veri onayı metni (Write-Host yakalaması): koşucunun yazdıkları → ürünün kendi yazdıkları (kaynaktan okundu; API günlüğü içeriği ölçülmez) → kapanış ("dosyalar CLOSED + personel pasif + portal pasif"; tenant yaşam döngüsü değişmez) → diğer tenantlar için yalnız U-ISO (sayı) sırasıyla; eski "Gerçek müvekkil verisine dokunulmaz" / tek başına "(sentetik tenant CLOSED)" yok; 10 kalem §8'de de geçer · **G-3** Recover başlarken gösterilen bilgi metni: ayrı canlı yazma işlemi, AYRI owner onayı (blok sormaz/ölçmez), "BİR KEZ" kodla zorlanmaz, canlı yazma kümesi; metin node çağrısından önce; yeni soru yok (AST soru komutu 0; kuyruktaki 2 yanıt tüketilmedi); tek node çağrısı (mod `recover`); GO defteri değişmez · **G-4** Run çıkış 5/6 metni Run'ın kendi kapanışını Recover'dan ayırır, "Recover yetkisi değildir / blok başlatmaz / önce kanıt / AYRI owner onayı, BİR KEZ" der; tek node çağrısı (mod `run`); çıkış 0'da Recover metni yok; AST: `Invoke-RunMode` içinde tek `Invoke-Node`, `Invoke-RecoverMode` yalnız akıştaki mod dalında | **62/62 PASS** Windows PowerShell 5.1.26100.9549 ve **62/62 PASS** pwsh 7.6.6 (çıkış 0). Önceki 58 ölçüt değişmeden PASS |
| Negatif kontrol + mutasyon (repo dışı geçici kopya; yeni öz-test + yeni belge): **eski blok baytları** `EDDF7BF3…CA5D`; 6 metin bozması (yoruma mutlak iddia · onay metninden tenant yaşam döngüsü cümlesi silindi · Recover bilgi metninden personelin geçici yeniden aktifleştirilmesi silindi · 5/6 metni eski emre döndü · çıkış 0'da görünen satıra Recover önerisi eklendi · Recover bitişindeki "yeni Recover için yetki değildir" satırı silindi); 1 mantık bozması (Run 5/6 dalına otomatik `Invoke-RecoverMode` çağrısı); bozulmamış kopya | **27/27 beklenenle uyumlu** (9 varyant × WinPS 5.1 + pwsh 7 + mantık eşitliği): eski blok **58/62, çıkış 1, FAIL = tam olarak G-1..G-4**; her metin bozması yalnız hedef ölçütü FAIL ettirdi (61/62); otomatik Recover bozması G-4'ü (ve R-2.5, R-2.6, O-1'i) FAIL ettirdi; bozulmamış kopya 62/62 |
| Mantık eşitliği (AST; yorumlar, Write-Host komutları ve Read-Answer/Read-Host istem metinleri çıkarılır, boşluk normalize) | eski ve yeni blokta kalan kod **birebir eşit** (18304/18304 karakter; 28/28 fonksiyon, fonksiyon başına fark 0; istem 13/13; Write-Host 37 → 65, fonksiyon içi 34 → 62; yorum 39 → 53) WinPS 5.1 + pwsh 7. **İstisna yok** (metin seçen ifade dahil hiçbir kod değişmedi). Negatif kontrol: otomatik Recover çağrısı eklenmiş kopya FARK verir |
| `d7-selftest.js` (bloğu T-3..T-8'de statik okur) | **41/41 PASS**, çıkış 0 — **ayna kopyada**: öz-test Prisma/bcrypt'i sabit olarak canlı yayın dizininden yüklediği ve o dizin bu işte yasak olduğu için, gereken `scripts` dizinleri repo dışına bayt bayt kopyalandı (65 dosya; 64'ü kaynakla sha eşit) ve **yalnız aynadaki `d7-selftest.js` içinde tek satır** (`REL` sabiti) canlı olmayan kütüphane köküne (R27 aday worktree'si) çevrildi. Blok, koşucu, sahte API ve QR betiği aynada **son baytlarla** (sha log/status içinde). Disposable DB `5449/d67_test` (yerel; 130 migration = R27 şeması), sahte API 8200/8459, gerçek TLS. Repodaki `d7-selftest.js` DEĞİŞMEDİ ve **değiştirilmemiş hâliyle bu turda KOŞULMADI** (neden: canlı yayın dizininden kütüphane yükler) — *bu cümle R02 ilk turunun tarihsel kaydıdır; **güncel durum (2026-10-03):** repodaki dosya düzeltildi ve kendisi koşuldu, 41/41 PASS (§6.4); ayna kopya sonucu tarihsel kanıttır* |
| Ayrıştırma + kodlama | iki `.ps1` dosyası WinPS 5.1 ve pwsh 7'de parse hatası 0; UTF-8 BOM korunur; satır sonu LF (CR 0); katı UTF-8 çözümü geçerli; kontrol karakteri (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) 0 — belge dahil üç dosyada |
| Paket digest | pinli 9 dosyadan bloktan bağımsız betikle yeniden hesaplandı: `7C42FCCD…7BDD` = bloktaki `$ExpPackage` (değişmedi); pin listesi eski blokla aynı; pin uyuşmazlığı yok; `ExpLiveDist` / `ExpEnvSha` değişmedi; blok kendi pin listesinde değildir |

**G-1'in sınırı (R02 inceleme).** G-1 yalnız "hiçbir … dosya/log/günlük/kanıt/rapor … yazılmaz" kalıbını (aynı satırda; "hiçbir" → en çok
40 karakter → bu adlardan biri → en çok 40 karakter → "yazılmaz/yazmaz") ölçer; başka biçimli bir mutlak iddiayı (ör. "asla", "hiçbir zaman",
"tüm … silinir", iki satıra bölünmüş cümle) yakalamaz. G-1 PASS, blok kaynağında kapsamsız mutlak iddia bulunmadığının genel kanıtı değildir;
yalnız bu kalıbın bulunmadığını söyler.

Çalışma sırasındaki koşumlar (son koşumdan ayrı): §8 güncellenmeden önceki ilk koşumda G-2 belge eşleşmesi FAIL verdi (61/62; beklenen, log
saklanmadı). `d7-r02\deneme\` altındaki iki deneme koşumu (62/62 ×2 kabuk) ve deneme negatif kontrolü son baytlardan ÖNCEKİ ara baytlara aittir ve
korunur; ikinci denemede öz-test çıktısına gözlem dökümü eklendi (uzun ölçüt adları tablo genişliğinde gözlem sütununu düşürüyordu). Kanıt (repo dışı; loglar PR/belge/public repoya yapıştırılmaz): `HY_R27_AGENT_EVIDENCE\d7-r02\` — `test\` (son koşum logları,
status dosyaları: komut, çıkış kodu, koşum öncesi/sonrası sha256), `negatif\` (varyantlar ve sonuç tablosu), `js-oz-test\` (ayna, manifest, log),
`onceki\` (R01 baytları). Loglar yerel kullanıcı adından arındırılarak yazılır.

### 6.3 R02 inceleme düzeltmeleri (2026-10-01) — SON dosya baytlarıyla

Test edilen baytlar: blok `8B3B22C0…25AE`, blok öz-testi `1BB152D8…7B21` (tam değerler §7; her log ve status dosyası koşum öncesi/sonrası sha256
taşır). Bu turda değişen yalnız blok METNİ (yorum + konsol çıktısı; istem metinleri ve kod değişmedi), blok öz-testi (yalnız yeni metni ölçen G-5 ve
G-6 + başlık yorumu) ve bu belgedir. Koşucu, sahte API, QR betiği, `d7-selftest.js` ve pinli 9 dosya değişmedi. Canlı DB, canlı API, canlı yayın
dizini ve canlı günlükler kullanılmadı; owner bloğu, koşucu ya da sonda **canlıya karşı çalıştırılmadı** (blok öz-testi bloğun yalnız
fonksiyonlarını AST ile yükler; `d7-selftest.js` ayna kopyası koşucuyu yalnız tek kullanımlık test veritabanı ve sahte API'ye karşı başlatır).
**2026-10-03 notu:** bu bölüm blok ve blok öz-testi için hâlâ son baytları anlatır (ikisi de değişmedi). `d7-selftest.js` 2026-10-03'de değişti;
onun son baytları ve repodaki dosyanın kendisiyle yapılan koşum §6.4'tedir. Bu bölümdeki ayna kopya sonucu tarihsel kanıttır.

| Test | Sonuç (son baytlar) |
|---|---|
| `d7-owner-block-selftest.ps1` — önceki 62 ölçüt + **G-5** kalıntı satırının altındaki not (owner'a GÖSTERİLEN metin; Run kapanış doğrulanmadı çıkış 6 · Run çıkış 0 · Recover çıkış 6): "sentetik tenant CLOSED" koşucunun SABİT ifadesidir ve kapanışın doğrulandığını GÖSTERMEZ; kapanış durumu Run'da "Portal erişim kapanışı … DOĞRULANDI / DOĞRULANAMADI" satırındadır (satır kalıntı satırından önce gösterilir), Recover'da çıkış kodu satırındadır; hedeflenen kapanış = dosyalar CLOSED + personel pasif + portal pasif; tenant yaşam döngüsü DEĞİŞMEZ; eski eşitlik ("sentetik tenant CLOSED" = …) bitiş metninde yok · **G-6** ikinci Recover için yol tanımlanmaz: Recover bitiş metni (taklit betik çıkış 0/3/5/6) "bu çıkış kodu yeni bir Recover için yetki DEĞİLDİR; Recover BİR KEZ koşulur (kodla zorlanmaz); sonuç CLIENT'a bildirilir" ve "ikinci bir Recover bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir" der; Run 5/6 metni aynı kuralı taşır; gösterilen metinlerde ve blok kaynağında (yorumlar dahil; 460 satır tarandı) "tekrar ancak … onayıyla / yeni onayla tekrar edilebilir" türü tekrar yolu yok (desen 4 bilinen tekrar-yolu cümlesini yakalar, 5 ilgisiz cümleyi yakalamaz); bu belgenin §5, §8 ve §10 bölümleri "bu paketle tanımlı değildir" der ve tekrar yolu tanımlamaz | **64/64 PASS** Windows PowerShell 5.1.26100.9549 ve **64/64 PASS** pwsh 7.6.6 (çıkış 0). Önceki 62 ölçüt değişmeden PASS |
| Negatif kontrol + mutasyon (repo dışı geçici kopya; son öz-test): **R01 blok baytları** `EDDF7BF3…CA5D`; **R02 ilk tur blok baytları** `09935375…0BFF`; bozulmamış kopya; 11 blok metin bozması (R02 ilk turdaki 6 bozma + Run kalıntı notu eski eşitliğe döndü · Recover kalıntı notundan "GÖSTERMEZ" silindi · Recover bitişine "tekrar ancak AYRI owner onayıyla" geri kondu · "ikinci bir Recover … TANIMLI DEĞİLDİR" satırı silindi · başlık yorumuna "yeni onayla tekrar edilebilir" eklendi); 1 mantık bozması (Run 5/6 dalına otomatik `Invoke-RecoverMode` çağrısı); 2 belge bozması (§5 adım 7'ye tekrar yolu geri kondu · §8.1'den "tanımlı değildir" cümlesi silindi) | **51/51 beklenenle uyumlu** (17 varyant × WinPS 5.1 + pwsh 7 + mantık eşitliği): R01 bloğu **58/64, çıkış 1, FAIL = tam olarak G-1..G-6**; R02 ilk tur bloğu **62/64, çıkış 1, FAIL = tam olarak G-5, G-6**; her metin/belge bozması yalnız hedef ölçüt(ler)i FAIL ettirdi (Recover bitişindeki yetki cümlesinin silinmesi G-3 ve G-6'yı; diğerleri tek ölçütü, 63/64); otomatik Recover bozması G-4'ü (ve G-5, G-6, R-2.5, R-2.6, O-1'i) FAIL ettirdi; bozulmamış kopya 64/64 |
| Mantık eşitliği (AST; yorumlar, Write-Host komutları ve Read-Answer/Read-Host istem metinleri çıkarılır, boşluk normalize) | **R02 ilk tur bloğu → son blok:** kalan kod **birebir eşit** (18304/18304 karakter; 28/28 fonksiyon, fonksiyon başına fark 0; istem 13/13; Write-Host 65 → 71, fonksiyon içi 62 → 68; yorum 53 → 56). **R01 bloğu → son blok:** yine birebir eşit (18304/18304; Write-Host 37 → 71; yorum 39 → 56). WinPS 5.1 + pwsh 7. İstisna yok. Negatif kontrol: otomatik Recover çağrısı eklenmiş kopya FARK verir |
| `d7-selftest.js` (bloğu T-3..T-8'de statik okur) | **41/41 PASS**, çıkış 0 — yine **ayna kopyada** (yöntem §6.2 ile aynı: 65 dosya bayt bayt kopya, 64'ü kaynakla sha eşit; yalnız aynadaki `d7-selftest.js` içinde tek satır `REL` canlı olmayan kütüphane köküne çevrildi). Blok aynada **son baytlarla** (sha status dosyasında). Disposable DB `5449/d67_test`, sahte API 8200/8459, gerçek TLS. Repodaki `d7-selftest.js` DEĞİŞMEDİ ve değiştirilmemiş hâliyle bu turda da KOŞULMADI — *bu cümle o turun tarihsel kaydıdır; **güncel durum (2026-10-03):** repodaki dosya düzeltildi ve kendisi koşuldu, 41/41 PASS (§6.4); ayna kopya sonucu tarihsel kanıttır* |
| Ayrıştırma + kodlama | iki `.ps1` dosyası WinPS 5.1 ve pwsh 7'de parse hatası 0; UTF-8 BOM korunur; satır sonu LF (CR 0); katı UTF-8 çözümü geçerli; kontrol karakteri (0x00–0x08, 0x0B, 0x0C, 0x0E–0x1F) 0 — belge dahil üç dosyada |
| Paket digest | pinli 9 dosyadan bloktan bağımsız betikle yeniden hesaplandı: `7C42FCCD…7BDD` = bloktaki `$ExpPackage` (değişmedi); pin listesi R02 ilk tur bloğuyla aynı; pin uyuşmazlığı yok; `ExpLiveDist` / `ExpEnvSha` değişmedi |

Öz-testin ölçmediği: G-5 ve G-6 owner'a gösterilen METNİ (ve G-6 ayrıca blok kaynağını + bu belgenin üç bölümünü) ölçer; kapanışın gerçekten
doğrulanıp doğrulanmadığını, owner onayının verilip verilmediğini ya da ikinci bir Recover'ın engellendiğini ölçmez (blok engellemez — §8.1, §9).
Recover senaryoları koşucunun yerine konan taklit betikle üretilir. G-6'nın tekrar-yolu deseni yalnız dört kalıbı arar ("tekrar ancak", "tekrar
edilebilir", "tekrar gerekiyorsa", "yeni … onayla/onayıyla … tekrar"); başka sözcüklerle yazılmış bir tekrar yolunu yakalamaz.
Kanıt (repo dışı): `HY_R27_AGENT_EVIDENCE\d7-r02\tur2\` — `test\` (son koşum logları + status: komut, çıkış kodu, sha256 önce/sonra),
`negatif\` (varyant üreticisi, koşucu, `son\` sonuç tablosu), `js-oz-test\` (ayna, manifest, log, status), `r02-ilk-tur\` (commit `a71cd2c8`
baytları), `deneme\` (son baytlardan önceki deneme koşumu). Loglar yerel kullanıcı adından ve test DB parolasından arındırılarak yazılır.

### 6.4 R02 koşucu öz-testi kütüphane kökü (2026-10-03) — `d7-selftest.js` SON baytlarıyla, repodaki dosyanın KENDİSİYLE

**Sorun.** `d7-selftest.js` Prisma istemcisini ve bcrypt'i sabit bir yoldan, canlı yayın ağacının `node_modules` dizininden yüklüyordu. Bu yüzden
repodaki dosya canlı ağaca dokunmadan koşulamıyordu; §6.2 ve §6.3 sonuçları yalnız o tek satırı değiştirilmiş **ayna kopyada** üretilmişti.

**Düzeltme (yalnız `d7-selftest.js`; sha256 `2867FBC5…A1E3`, tam değer §7).** Değişen yalnız kütüphane kökü çözümü, ret denetimi ve bir çıktı
satırıdır; öz-testin ölçtüğü 41 ölçütün hiçbiri (T-3..T-8 statik ölçütleri dahil) değişmedi. Koşucu, blok, blok öz-testi, sahte API, QR betiği ve
pinli 9 dosya değişmedi; paket digest aynıdır.

- **Kök nereden gelir.** `D7T_LIB_ROOT` ortam değişkeni verilirse o; verilmezse betiğin bulunduğu checkout'un proje kökü (betik konumundan göreli
  çözülür). Modüller kökün altında eskisiyle aynı göreli yolda aranır (`node_modules\.pnpm\…` — Prisma istemcisi 5.22.0, bcrypt 5.1.1).
- **Canlı ağaç reddi.** Kök canlı yayın ağacının altındaysa test **koşmaz** (çıkış 2). Bu ret, kökte hiçbir dosya yoklanmadan ve hiçbir modül
  yüklenmeden **önce**, yalnız yol karşılaştırmasıyla yapılır (büyük/küçük harf, düz/ters bölü, `..` parçaları normalize edilir). Kök ya da iki modül
  dizini bir bağlantı (junction / symlink) üzerinden canlı ağaca çözülüyorsa test yine koşmaz (gerçek yol okunur; modül yüklenmez).
  *R02-b düzeltme notu: "kökte hiçbir dosya yoklanmadan önce" ifadesi yalnız ad karşılaştırmasının tanıdığı yol yazımları için geçerlidir
  (aşağıdaki Negatif (b) satırında ölçülen dört biçim). Uzun yol önekiyle (`\\?\C:\…`) verilen bir canlı kök ad karşılaştırmasından geçer ve
  ancak dosya yoklamasından **sonraki** gerçek yol denetiminde reddedilir — ayrıntı bu bölümün "Sınırlar" listesinde.*
- **Canlı ağaç yolu dosyada literal değildir.** Yol owner bloğunun `$Rel` sabitinden okunur (blok yalnız metin olarak okunur, çalıştırılmaz). Blok
  canlı ağaç değiştiğinde ret denetimi kendiliğinden onu izler. `$Rel` okunamazsa ret denetimi yapılamayacağı için test başlamaz (çıkış 2).
- **Sessiz geri düşüş yok.** Kök yoksa ya da modüllerden biri kökte bulunamazsa test açık bir mesajla ve çıkış 2 ile durur; canlı ağaca düşmez.
- **Çıktı.** Kullanılan kök ve kaynağı (`D7T_LIB_ROOT` / betik konumu) koşumun ilk satırında yazılır; yerel kullanıcı adı maskelenir.

**Repodaki dosyanın koşum komutu** (ayna/kopya değil; parola ve bağlantı dizesi belgeye yazılmaz):

```powershell
$env:D7T_LIB_ROOT = '<bağımlılıkları kurulu, canlı OLMAYAN bir checkout>\project'
$env:D7T_DB_URL   = '<tek kullanımlık test Postgres bağlantı dizesi; yerel 5449/d67_test olmak zorunda>'
node project\docs\governance\client-extacc-portal-d7-r01\scripts\d7-selftest.js
```

*R03 notu:* DB kapısı genelleştirildi — `D7T_DB_URL` yalnız `127.0.0.1`, 5432 dışı bir port ve `_test` ile biten (`hukuk_db` olmayan) bir
veritabanı adı ister (port sabit değil; kendi tek kullanımlık konteyneriniz); `%TEMP%\d67-test-pg.url` artık okunmaz; koşucuya beklenen DB adı bu
addan verilir. Yukarıdaki "5449/d67_test olmak zorunda" ifadesi R02 baytlarının kaydıdır (§13.4).

Bu turda kullanılan kök: R27 aday çalışma ağacının proje kökü (`HY_WT_R27\project`; canlı yayın ağacı değildir, `node_modules` gerçek dizindir —
bağlantı değil). Ortam önceki ayna koşumlarıyla aynıdır: tek kullanımlık test Postgres `5449/d67_test` (yerel), sahte API 8200/8459, gerçek TLS.

| Ölçüm (2026-10-03) | Sonuç |
|---|---|
| `d7-selftest.js` — **repodaki dosyanın kendisi**, `D7T_LIB_ROOT` = canlı olmayan kök | **41/41 PASS**, çıkış 0 (önceki ayna koşumlarıyla aynı sayı). İlk çıktı satırı kullanılan kökü yazar. Status dosyası: komut, çıkış kodu, koşum öncesi/sonrası sha256 (değişmedi), git blob kimliği |
| Negatif (a) — `D7T_LIB_ROOT` verilmedi; betiğin checkout'unda `node_modules` yok | çıkış 2, "kütüphane kökünde modül bulunamadı: @prisma/client, bcrypt … test BAŞLAMADI"; hiçbir ölçüt koşmadı |
| Negatif (b) — kök canlı yayın ağacının altında (dört biçim: bloğun `$Rel` değeri · ağaç kökü, küçük harf + düz bölü · bir alt dizin · `..` parçalı) | dördünde de çıkış 2, "kütüphane kökü canlı yayın ağacının altında … test BAŞLAMADI". Ön yükleme sondası (aşağıda): canlı ağaç altında **modül yükleme 0, modül çözümü 0, fs çağrısı 0**; alt süreç 0 — ret, `require`'dan ve dosya yoklamasından önce |
| Negatif (c) — var olmayan kök | çıkış 2, "kütüphane kökü yok … test BAŞLAMADI" |
| Negatif (d) — var ama `node_modules` içermeyen kök | çıkış 2, "kütüphane kökünde modül bulunamadı …" |
| Ek (yalnız bu dallar için **ayna**, ana sonuç değildir): kök bağlantı üzerinden "canlı" ağaca çözülüyor · yalnız `node_modules` bağlantı · blok yok | 4/4 beklenen: bağlantılı iki durumda çıkış 2, "bağlantı üzerinden canlı yayın ağacına çözülüyor"; blok yokken çıkış 2, "`$Rel` okunamadı". Bu dallar repodaki konumda canlı ağaca dokunmadan üretilemez; öz-test dosyası bayt bayt kopyalandı (sha eşit), yalnız aynadaki blok kopyasında `$Rel` satırı kanıt dizinindeki **sahte** bir ağaca çevrildi (gerçek canlı ağaç kullanılmadı) |
| `d7-owner-block-selftest.ps1` (blok ve blok öz-testi baytları değişmedi; belge son baytlarla) | **64/64 PASS** Windows PowerShell 5.1.26100.9549 ve **64/64 PASS** pwsh 7.6.6 (çıkış 0). Blok `8B3B22C0…25AE` ve blok öz-testi `1BB152D8…7B21` koşum öncesi/sonrası aynı. *R02-b notu: "belge son baytlarla" bu turun (kütüphane kökü) belge baytlarını anlatır; R02-b eklerinden (§12.3) ve bağımsız doğrulama düzeltmelerinden sonra blok öz-testi belgenin son hâliyle **yeniden koşuldu** (2026-10-03, tur 5): 64/64 ve 64/64, çıkış 0; blok ve öz-test özetleri aynı — G-2 ve G-6 bu belgeyi okur* |
| Paket digest | pinli 9 dosyadan bloktan bağımsız betikle yeniden hesaplandı: `7C42FCCD…7BDD` = bloktaki `$ExpPackage` (değişmedi); `d7-selftest.js` pin listesinde değildir |

**Sondanın ölçtüğü ve ölçmediği.** Sonda (`node -r` ile yüklenen, kanıt dizinindeki ölçüm betiği) öz-test sürecinin canlı ağaç ön eki altındaki
bir yola yaptığı modül yüklemelerini (`Module._load`, `Module._resolveFilename`), eşzamanlı `fs` çağrılarını ve alt süreç başlatmalarını sayar.
Pozitif kontrol: aynı sonda canlı olmayan kök için fs çağrısı 3, modül yükleme 1 saydı (kör değil). Sonda yalnız öz-testin kendi sürecini ölçer;
ret durumlarında alt süreç başlamadığı için (sayı 0) kapsam tamdır. Bu ölçümlerde canlı yayın ağacı yoklanmadı: yol yalnız ortam değişkeni değeri
olarak verildi.

**Sınırlar.**
- Blok dosyası yoksa öz-test artık başlamaz (çıkış 2); önceki baytlarda dinamik senaryolar koşar, T-3 FAIL ile çıkış 1 verirdi. Blok mevcutken
  ölçülen hiçbir şey değişmedi.
- Yol karşılaştırması UNC biçimli (`\\sunucu\paylaşım\…`) bir kökü canlı ağaçla eşleştirmez; bağlantılar gerçek yol okunarak yakalanır, ağ
  paylaşımı üzerinden verilen bir kök yakalanmaz. Denetim yanlışlıkla canlı ağaçtan yüklemeyi önler; kasıtlı atlatmaya karşı bir güvenlik sınırı
  değildir.
- **Uzun yol önekli kök (R02-b; kaynaktan okundu + ifade kopyasıyla ölçüldü; öz-testin kendisi bu biçimle koşulmadı).** Kök, uzun yol
  önekiyle (`\\?\C:\…` biçimi) canlı yayın ağacını gösterecek şekilde verilirse ad karşılaştırması onu **yakalamaz**: karşılaştırma önekli
  yazımı, sürücü harfiyle başlayan ağaç yoluyla eşleştirmez. Öz-test bu durumda kökün varlığını ve iki modül dizinindeki `package.json`
  dosyalarını **yoklar** (dosya sistemi çağrıları canlı ağaca gider); ardından gerçek yol denetimi öneksiz yolu okur ve test "bağlantı
  üzerinden canlı yayın ağacına çözülüyor ya da gerçek yolu okunamadı" mesajıyla, çıkış 2 ile **başlamaz**; modül yüklenmez. Bu ret, bloğun
  `$Rel` yazımı kendi gerçek yoluyla aynıysa geçerlidir (yolda bağlantı ya da 8.3 kısa ad bileşeni yoksa; **ölçülmedi** — canlı ağaç
  yoklanmadı). 8.3 kısa adlı yazım da ad karşılaştırmasının tanımadığı aynı sınıftadır. Yani bu biçimde
  ret, dosya yoklamasından **önce değil sonra** gelir; "Canlı ağaç reddi" maddesindeki cümle ve Negatif (b) satırındaki "fs çağrısı 0" ölçümü
  yalnız orada sayılan dört biçim için geçerlidir. Önekli kök var olmayan bir yolu ya da modül taşımayan bir alt dizini gösteriyorsa ret,
  gerçek yol denetimine gelmeden "kütüphane kökü yok" ya da "modül bulunamadı" mesajıyla verilir (yine çıkış 2; modül yüklenmez; yoklama
  yine yapılmıştır).
  Ölçüm (2026-10-03): öz-testteki iki ifade (`underLive`, `realOf`) birebir kopyalanıp canlı ağaç yerine geçici bir **vekil** dizinle
  çalıştırıldı (node v24.18.0): önekli yazımda ad karşılaştırması `false`, varlık yoklaması `true`, gerçek yol öneksiz, gerçek yol
  karşılaştırması `true`; aygıt önekli yazım (`\\.\C:\…`) aynı sonucu verdi. Bu bir ifade kopyası ölçümüdür, öz-test koşumu değildir; canlı
  yayın ağacı yoklanmadı. UNC maddesindeki kayıt burada da geçerlidir: denetim yanlışlıkla canlı ağaçtan yüklemeyi önler; kasıtlı atlatmaya
  karşı bir güvenlik sınırı değildir.
- Ret yalnız kütüphane kökünü kapsar; öz-test betiğinin kendisinin hangi dizinden çalıştırıldığı denetlenmez.
- Kök, tek kullanımlık test veritabanının şemasıyla uyumlu bir Prisma istemcisi taşımalıdır (bu turda R27 aday ağacı; test veritabanı R27 şeması).
  Şeması farklı bir kök verilirse senaryolar FAIL ya da ölçülemedi verebilir — bu, kökün yanlış seçildiğini gösterir, ürün bulgusu değildir.
- D-4, D-5 ve EXTACC paketlerinin öz-testleri aynı sabit kütüphane kökünü taşır; bu düzeltme yalnız D-7 öz-testini kapsar.
- Öz-test önceki gibi disposable DB'de satır ve `%TEMP%\d7-selftest-*` dizini bırakır (§9).

**Ayna kopya sonucu tarihsel kanıttır.** §6.2 ve §6.3'teki ayna koşumları (`d7-r02\js-oz-test\`, `d7-r02\tur2\js-oz-test\`) o turların kaydı olarak
korunur; güncel sonuç bu bölümdeki, repodaki dosyanın kendisiyle yapılan koşumdur.
Kanıt (repo dışı): `HY_R27_AGENT_EVIDENCE\d7-r02\tur4\` — öz-test logu + status (komut, çıkış kodu, sha256 önce/sonra), negatif ölçüm logları ve
sonda çıktıları, ek ayna ölçümü, blok öz-testi logları (iki kabuk), paket digest ve ayrıştırma/kodlama logları, kullanılan betikler. Loglar yerel
kullanıcı adından ve test DB parolasından arındırılarak yazılır.

## 7. Pinler

**R06 (2026-10-09) — güncel baytlar tablonun ilk dört satırıdır.** Onların altındaki satırlarda geçen "son baytlar" ifadeleri yazıldıkları revizyona aittir: koşucu, blok, koşucu öz-testi ve blok öz-testi için o satırlar artık **ÖNCEKİ** baytları gösterir (sahte API ve QR betiği R06'da değişmedi; onların satırları günceldir).

| Dosya | sha256 |
|---|---|
| `d7-portal-messages-live-run.js` **R06** (son baytlar; §16: canlı inceleme süresi 300000 ms + owner ekranında numaralı telefon adımları ve aşama süreleri; giriş bekleme, kapanış, verdict ve çıkış kodları aynı; bloğun PkgPins'inde) | `E3B4D217D1551DF6E59908B62B461B75CD1001F0047E1DF4F36F9B90FEBE1413` |
| `d7-owner-live-block.ps1` **R06** (son baytlar; §16: YALNIZ `$LiveParams` inceleme süresi 300000 + koşucu pini + `$ExpPackage` + başlık notu) | `CC2B85AB80108AF6B4730237CAECEC50AFDC11C52D68FD29447BCC3614E4263D` |
| `d7-selftest.js` **R06** (son baytlar; P-VIEW yeni (1) + P-1 değişti (1); 99 ölçüt — son baytlarda **99/99 PASS**; §16) | `46813EDC37EF66B3E5AE1574334D8D2DFC273C9663EF654ECFD6F42969BD086C` |
| `d7-owner-block-selftest.ps1` **R06** (son baytlar; YALNIZ canlı süre tablosu beklentisi 300000 ve L-1 açıklaması; 88 ölçüt — son baytlarda iki kabukta **88/88 PASS**; §16) | `290BC95B58528D4B3445479D1F428BA5B02D62A3FEC11DE826CBD93A5EAD3653` |
| `d7-portal-messages-live-run.js` **R05** (son baytlar; §15: kapsam dışı üç ölçütten biri PASS değilse durur — kalan adımlar ve gösterim yok, kapanış aynen; üç ölçüt gösterim kapısında; kanıtta `scopeStop`; çıkış kodu fonksiyonları aynı; bloğun PkgPins'inde) | `6E88FCCB33C0943C0D7BBF391509C05D646CA0E06483E0FA82DB58EFA31BBA49` |
| `d7-owner-live-block.ps1` **R05** (son baytlar; §15: YALNIZ koşucu pini + `$ExpPackage` + başlık notu; kapılar, Run sırası, node çağrısı, çıkış kodları, ekran metinleri, Recover yolu değişmedi) | `2CACFA3FCD69DCBAAB148A875A5CDA81D59C0208E0BFE2E95301849228687DC5` |
| `d7-fake-portal-api.js` **R05** (son baytlar; §15: `scope` düğmesi (tür N / S / U · davranış accept / 429 / 503 / hang) — yalnız o kapsam dışı denemeye uygulanır; diğer davranışlar aynı) | `ED7FCBEFF6AFE3DFAB066C54CA2D202DD9C245B597A136B25F765EEDEE5D6814` |
| `d7-selftest.js` **R05** (son baytlar; Z24-a … Z24-i ve T-15 yeni (10) + Z3, Z4-a değişti (2); 98 ölçüt — son baytlarda **98/98 PASS**; §15.4) | `890D2AC240214814F72DF3D35CFADD33AEB8839B15C39A55D739CA59E085D59F` |
| önceki (**R04-b**; R04-c'de değişmedi; **R05'te DEĞİŞTİ**): `d7-portal-messages-live-run.js` ( §14.9 "R04-b": kurtarma adımı bloğun `-RunEvidenceDir` seçeneğiyle hizalandı — elle komut ve `receiptFromEvidenceCommand` kaldırıldı; verdict ve çıkış kodları aynı; bloğun PkgPins'inde) | `20DC82E2EE807F480E02BF9EC4BAF409F847489972B466D16955BB4F5DF51965` |
| önceki (**R04-c**; **R05'te DEĞİŞTİ** — yalnız pin + digest + başlık notu): `d7-owner-live-block.ps1` (§14.9 "R04-c": K1 Recover bitiş ekranındaki PORTAL ERİŞİMİ satırı DB kapalıyken kanıttaki P7-C3L/D verdict'lerine bağlı (ad + renk: `Get-RecoverPortalAccess` `goster` / `renk`); K2 `-ReceiptFile` manifesti olan Run kanıt dizinindeki makbuzla ve kanıtta makbuz metni varken DUR + `-RunEvidenceDir` yönlendirmesi (`Assert-ReceiptFileRoute`), kanıtta makbuz metni yokken izin + "orijinal kanıt dizini DEĞİŞİR" metni (`Get-RunDirWriteNote`: Recover başı, Recover bitişi, Run sonu ekranı); K3 `New-RecoverInputFromRun` yol + makbuz özeti döndürür, makbuz node'dan önce iki noktada yeniden ölçülür (`Assert-RecoverInputUnchanged`; fark → DUR + KULLANILMAZ işareti) ve Recover'dan sonra "RECOVER GİRDİSİ (makbuz): … DEĞİŞMEDİ / DEĞİŞTİ" satırı; K4 manifest yokken DUR metni kalan yolu ve makbuz dosyasının durumunu yazar; K5 yazımdan sonraki adımlar tek try/catch içinde (beklenmeyen istisna → işaret + DUR; `Set-RecoverInputUnusable`); başlık notu; **`PkgPins` ve `$ExpPackage` DEĞİŞMEDİ**; kapılar, Run sırası, node çağrısı, çıkış kodları değişmedi; Recover soru sormaz) | `04BE4AC46CA5BA238566C76AADBD65C2D27839A05CF9374D2756DAF4C355718C` |
| önceki (**R04-b**; §14.9 "R04-b": Run sonu metni "kanıttaki kurtarma adımı da bu seçeneği gösterir" (yalnız METİN) + koşucu pini + `$ExpPackage` + başlık notu): `d7-owner-live-block.ps1` | `01D5EA53C1E8FC6BC3EB8F433083FB537D24CDFA9C472D5B107DC8E86D4F1113` |
| `d7-owner-block-selftest.ps1` **R04-c** (son baytlar; **R05'te DEĞİŞMEDİ** — R05 blok baytlarıyla yeniden koşuldu: 88 ölçüt, iki kabukta, §15.4; RG-12, RG-13, RG-14, RG-15 yeni (4) + RG-1, RG-9, RG-10 değişti → 88 ölçüt; satır rengi `Get-HostLines` ile ölçülür; sahte koşucuya `EXSTUB_REWRITE=force` eklendi (Recover'da makbuza bayt ekleme taklidi — D-7 gerçek koşucusu yazmaz); §14.9 "R04-c") | `94C315E873BD5B654CCBE5AAAC7CAF46DDF21060173AEAE0C717507CE1E93391` |
| önceki (**R04-b**; O-8 değişti — Run sonu metni; 84 ölçüt; §14.9 "R04-b"): `d7-owner-block-selftest.ps1` | `8A5CE9F3081E3A1EF0C871BF234E88C8C20091172B7D1B3EEB97E71A5172657F` |
| önceki (**R03-g**; R04, R04-b ve R04-c'de değişmedi; **R05'te DEĞİŞTİ**): `d7-fake-portal-api.js` ( guard NORMAL taklidi ürün guard'ı gibi JWT olmayan token'ı (`portalToken opaque`) DB'ye bakmadan reddeder (`portal-auth.guard.ts:36`; R03-e/f'de kabul ediyordu — ürün davranışı değildi) + `reopenOn extLogin` (yeniden açma tetiği başarılı kapatmadan sonraki İLK dış portal girişi yanıtlandıktan sonra; varsayılan `messages` = önceki davranış)) | `BEF6E73226DC50E2361C54A37299EA943B850B253243C960E006225A8C77740E` |
| önceki (**R04-b**; **R05'te DEĞİŞTİ**): `d7-selftest.js` (R04-c'de değişmedi ve yeniden koşulmadı — koşucu değişmedi; sonuç R04-b baytlarında ölçülmüştür; T-14 yeni (1) + Z18, Z19-b, Z20-d, C-1 değişti (4); 88 ölçüt — R04-b baytlarında **88/88 PASS**; §14.9 "R04-b") | `466EC3EF37A748DCA3032AA40D66FD1179B0EF75DE7D5F42BA6CC6F142AD3440` |
| `d7-qr-test.js` (değişmedi) | `15E6431396E978423BAE72F3B7511F3972F12847EF96AA02C12937E0F2233E15` |
| önceki (**R04 aşama 1** baytları, commit `553f199b`; §14.9): koşucu (5xx gözlem metni `rejectObs`) · blok (`-RunEvidenceDir`, Recover bitiş ekranında PORTAL ERİŞİMİ satırı) · blok öz-testi (RG-1 … RG-10 yeni + O-8 değişti + O-9 kaldırıldı; 84 ölçüt) · sahte API (değişmedi) · koşucu öz-testi (T-13 yeni; 87 ölçüt — aşama 1'de koşulmamıştı; aşama 2'de aşama 1 baytlarında 87/87 PASS ölçüldü) | `AB38AC97DD400B13A2BD71F561EEC7C3EA8A37AB937DC02DE31BA992810F41C2` · `C52CBDA8EACC8B0EABACF4256D3B14DD10E58E1F2904D5C1919889185FA3978E` · `7EEBCB6C0924FCE4BD081A684E72F171ACA42DF40077BE52FBC6F68A88B587D9` · `BEF6E73226DC50E2361C54A37299EA943B850B253243C960E006225A8C77740E` · `BF699CFF766E13737D1F80EED916050B97C13892DCB9545CC8CDB4D2B4D8EEFD` |
| önceki (**R03-g** son baytlar; §14.8): koşucu · blok · blok öz-testi (75 ölçüt) · sahte API (R04'te değişmedi) · koşucu öz-testi (86 ölçüt) | `4446C256EF83A0401B7C93F3FD28B6C1A14AF18F1FD04237349D6E37517A9001` · `EF3FCF08A382B6B62C4B62307B06E4D204E89017AE0FD8CD141E43AD8577C1DA` · `DDA5A722F8D157485130DA4B0E5F6A4E828E4727995D7546282213D5B24C3A8C` · `BEF6E73226DC50E2361C54A37299EA943B850B253243C960E006225A8C77740E` · `82A0B53B11E7EDECB152E84B9A76EAD89D771DF1975E45E73018851557238BF3` |
| önceki (**R03-f** son baytlar): koşucu · blok · blok öz-testi · sahte API · koşucu öz-testi | `23AB099FA6F8EE7B300504F42F2699241336ECDF97D5ED667614722456CC04DB` · `A2C9F7D8DCFD3BCA7D006E689E3F5EAB8C0A7B8DF562DE5130C7F1198F7D1B2C` · `92D655806625661F6B718536E05E4D52B019A1FE6B9A92B32EDAD90D57CA3743` · `B2207C96AF7B9D3286290DAC4231B40449A94AD7BF5A8B76AB9364A95A4950E8` · `E394E62700ECA48BA66FAA6197EE594D3EBD2CB53394104C9B97D73DBEABAD71` |
| önceki (**R03-e** son baytlar): koşucu · blok · blok öz-testi · sahte API · koşucu öz-testi | `EE3704A4BECEDF9DA40F31A7362A526CA6D5539D4CF8A1573C548359CF7A0F0F` · `A26418795FF72805B663A6324A59F973D41AB5E7E6251079C6C1CC2823358B5F` · `50C375F6F42D5B3CE7FDA373D4689FDE8ED94778FC19A17DDD67BA7CE8CE55BC` · `1982837C8D68FD30CA4CE106070DD74BCFDCC4B9FF4CC68089E7CA835D2E4229` · `FCEBE8D0D923C98D84D83D8DFB47435FC056ACBDD38B116DF509CAD63EBD6BAA` |
| önceki (**R03-d** son baytlar): koşucu · blok · blok öz-testi · sahte API · koşucu öz-testi | `27BFE5CE5427EA7BB0C68B86064972994513DBCA373155EDC38092A3F74326AA` · `9B409218FCB48532DDF56A72071A1D186CDE714200AD4F80A0B97C025F5DB63B` · `66FE3BFC0954C0CDA59BFE1945256E65060305EB58367DFEB69E0A5982147034` · `30B29115311EBF4663DA24F0A1A8748E968DD04AEC3EC16171B403AB524FD122` · `3EA4AAAC35D94E77FFB311A5ABBB53BFC044A25C6D9FA2D6EA3B473FBD27C203` |
| önceki (**R03-c** son baytlar): koşucu · blok · blok öz-testi · sahte API · koşucu öz-testi | `08B5CA7A…E501` · `75B5E8E6…0DF6` · `A63945DE…2247` · `387A923B…2920` · `8AC501B7…8B1E` |
| önceki (**R03** son baytlar): koşucu · blok · blok öz-testi · sahte API · koşucu öz-testi | `F4B9BE18…22D3` · `4BAE9DE0…964D` · `A2EE5703…906D` · `CA4BDA3D…637B` · `120049AC…09B5` |
| önceki (R01 düzeltme; R02'de değişmedi): `d7-portal-messages-live-run.js` | `E752DA1EFCA9B8C7529CC0EC66B4F90530025FBF9918F4A9B56DBB3A6916D2B6` (ondan önce `3A58DF7C…4D55`) |
| önceki (**R02** son baytlar; inceleme düzeltmeleri dahil; yalnız metin): `d7-owner-live-block.ps1` | `8B3B22C0FD9A08DE61C58EEEE8423A7FA5884B43FE680363F96FCFCDA50C25AE` |
| önceki (**R02** son baytlar; G-1..G-6 + gözlem dökümü): `d7-owner-block-selftest.ps1` | `1BB152D876A264BC91F3262AB40BAC25C326F563B6506E374427C0ADAB557B21` |
| önceki (**R02 ilk tur**, commit `a71cd2c8`): `d7-owner-live-block.ps1` | `0993537584078789A9B199B8DA3BA9B40DFB31055C8517C2F974B5E66F7E0BFF` (yalnız metin farkı; mantık eşitliği §6.3) |
| önceki (**R02 ilk tur**, commit `a71cd2c8`): `d7-owner-block-selftest.ps1` | `0720672D86217990B19D4C3C4D7F53972DA999200DBEB9CADBFF7998A0988BFE` (G-1..G-4 + gözlem dökümü; 62 ölçüt) |
| önceki (R01 kapanış düzeltmesi): `d7-owner-live-block.ps1` | `EDDF7BF39231B67726528061654E2B668CABE48104059D9ACCB5D83B0C36CA5D` (host/kullanıcı yolu literali kaldırıldı, R05 owner girdisi + adres biçim kapısı; ondan önce `2F62C6C9…26DE8`, `881ABCB0…1427`) |
| önceki (R01 kapanış düzeltmesi): `d7-owner-block-selftest.ps1` | `9A5A31F0AA208EC85434C72D7F9C91E910C8DF34E61E29A13F6BC3516B1470B3` (6 yeni test; ondan önce `6574F027…D26E0`) |
| önceki (R01/R02; R02'de değişmedi): `d7-fake-portal-api.js` | `7B9D32388A34E91088B316147BCCE6E7AC66EC30AEDFFA4C8F841FE9461EBD7D` |
| önceki (**R02 kütüphane kökü düzeltmesi**; 2026-10-03; §6.4): `d7-selftest.js` | `2867FBC58282982F79218F2A468884677626B89D34BE91F963FB58FEAD32A1E3` |
| önceki (R01 düzeltme baytları; R02'nin ilk iki turunda değişmedi): `d7-selftest.js` | `D5E12B00D1F708D056F1949CAE9EC76519DF3B71F4CBCDC0C67473CE630345DB` (kütüphane kökü sabit olarak canlı yayın dizini; yalnız ayna kopyada koşuldu) |

**Paket digest (R06 — son; blok içinde `$ExpPackage`): `2008ABE78FBCD74309A408931311720E246A9D2FF4186ADEEF2B2A9B97BF2610`** — pin listesindeki 9 dosyadan bloğun `Digest` kuralıyla yeniden hesaplandı (önce önceki pinlerle `FBE19948…` elde edilerek hesap doğrulandı); pin listesinde değişen **yalnız koşucu satırı**. Blok öz-testi **PIN-1** aynı eşitliği her koşumda ölçer (R06 son koşumları: iki kabukta 9/9). Aşağıdaki paragraflar önceki revizyonların kaydıdır.

**Paket digest (R05; **R06'da geçersiz**; blok içinde `$ExpPackage`): `FBE19948B35319DB170B333826FF2DFA07659E221A97BB2E8AB57EE8DB45DC5D`** — pin listesindeki 9 dosyadan bloğun `Digest` kuralıyla (dosya yolu + NUL + sha256 + satır
sonu; sıralı; UTF-8 sha256) yeniden hesaplandı: önce R04-b pinleriyle `16D95F54…D1C5` elde edilerek hesap doğrulandı, sonra R05 baytlarıyla bu değer bulundu; pin listesinde
değişen **yalnız koşucu satırı** (`20DC82E2…1965` → `6E88FCCB…BA49`). Blok öz-testi **PIN-1** aynı eşitliği her koşumda ölçer (R05 son koşumları: iki kabukta 9/9).
Kanıttaki `revision` yine `R03`; R05 koşucusu `packageDigest` `FBE19948…` ile ve kanıttaki `displayGate` alanının dokuz kalemli olmasıyla ayırt edilir. Aşağıdaki
paragraflar önceki revizyonların kaydıdır.

**R04-c pin ölçümü (R05'ten önceki baytlar):** bu aşamada koşucu, sahte API ve koşucu öz-testi değişmedi → `PkgPins` ve `$ExpPackage` **DEĞİŞMEDİ**. Ölçüm (iki kabukta;
`r04\d6-d7-recover-hazirlik\asama3\pin-degismedi.log`): bloktaki `$PkgPins` ve `$ExpPackage` atamalarının metni aşama 2 ucu (`bcea51c1`) bloğundaki atamalarla **aynı**;
9 pinli dosya bu dalın dosyalarından yeniden hesaplandı → uyuşmazlık 0; paket digest'i yeniden hesap = `16D95F54…D1C5` = `$ExpPackage`; pinli dosyalarda `git status`
farkı yok. Blok öz-testi **PIN-1** aynı eşitliği her koşumda ölçer (R04-c son koşumları: iki kabukta 9/9, digest `16D95F54…` = `$ExpPackage`). Blok ve blok öz-testi
PkgPins'te **değildir**; yukarıdaki tabloda yalnız bu iki dosyanın özeti değişti. Koşucu değişmediği için kanıt alanları, `revision` (`R03`) ve `packageDigest`
(`16D95F54…`) aynıdır; R04-b ile R04-c **yalnız blok dosyasının sha256'sıyla** ayırt edilir (owner koşumdan önce blok dosyasının sha256'sını kaydeder).

**Paket digest (R04-b; R04-c'de DEĞİŞMEDİ; **R05'te geçersiz**): `16D95F54DB430D3E113DA86DF36719BC68C19DD934E8D32170D44682014AD1C5`** — pin listesindeki 9 dosyadan bloğun kendi `Sha` + `Digest`
fonksiyonlarıyla (AST'den yüklenerek; bloğun akışı çalışmadan) yeniden hesaplandı (9 pin, uyuşmazlık 0; R04-b'de pin listesinde değişen yalnız koşucu satırı;
`r04\d6-d7-recover-hazirlik\asama2\d7\test\son-pin-dogrulama.log`). Blok öz-testi **PIN-1** bu eşitliği her koşumda ölçer (R04-b son koşumları: iki kabukta 9/9, digest
`16D95F54…` = `$ExpPackage`). Kanıttaki `revision` yine `R03` (C-1 son baytlarda ölçtü); R04-b koşucusu `packageDigest` `16D95F54…` ile ayırt edilir; kanıtta yeni alan yok —
Run kanıtındaki `recovery.adim` metni §14.9 "R04-b"deki biçimdedir. Aşağıdaki paragraf R04 (aşama 1) kaydıdır.

**Paket digest (R04 aşama 1; R04-b'de geçersiz): `01DFD77FE88240A0BCBF8A986FBF4F80F759C975D233D9BB68B00B93118CA789`** — pin listesindeki 9 dosyadan bloğun kendi `Sha` + `Digest`
fonksiyonlarıyla (AST'den yüklenerek; bloğun akışı çalışmadan) yeniden hesaplandı (9 pin, uyuşmazlık 0; R04'te pin listesinde değişen yalnız koşucu satırı;
`r04\d6-d7-recover-hazirlik\asama1\d7\test\pin-dogrulama-son.log`). Blok öz-testi **PIN-1** bu eşitliği her koşumda ölçer (R04 aşama 1 koşumları: iki kabukta 9/9, digest
`01DFD77F…` = `$ExpPackage`). Kanıttaki `revision` yine `R03` (C-1 ölçer — aşama 2'de ölçüldü); R04 (aşama 1) koşucusu `packageDigest` `01DFD77F…` ile ayırt edilir; kanıtta yeni
alan yok — P7-C3L/D ve P7-C4L/D gözlemi 503 / 429 dışındaki 5xx'te §14.9 (iii)'teki metindir. `-RunEvidenceDir` ile hazırlanan Recover girdisi dizinindeki
`RECOVER-GIRDI-KAYDI.json` bloğun yazdığı yeni bir kayıttır (kayıt türü `EXTACC-D7-RECOVER-INPUT`, `revision` `R04`); `owner-block.json` `revision` alanı yine `R01`.
Aşağıdaki paragraf R03-g kaydıdır.

**Paket digest (R03-g; R04'te geçersiz): `78F626CD3C0FB47393521BAF4FB7BBB2A326D900EAB7C9EA968E49C5FB5F3A0D`** — pin listesindeki 9 dosyadan
bloktan bağımsız betikle yeniden hesaplandı (9 pin, uyuşmazlık 0; R03-g'de pin listesinde değişen yalnız koşucu satırı;
`r04\recover-dogrulugu\r5\d7\test\pin-dogrulama-son.log`). Blok öz-testi **PIN-1** bu eşitliği her koşumda ölçer (R03-g son koşumları: iki kabukta
9/9, digest `78F626CD…` = `$ExpPackage`). Kanıttaki `revision` yine `R03` (C-1 ölçer); R03-g koşucusu `packageDigest` `78F626CD…` ile ayırt edilir;
kanıtta yeni alan yok — `portalClose.sessionVersion.hucre` artık `TJ` olabilir; Recover kanıtında `portalClose.acikErisim` ve kurtarma nedeni §14.8'deki
biçimdedir. Aşağıdaki paragraf R03-f kaydıdır.

**Paket digest (R03-f; blok içinde `$ExpPackage`): `CD86CD77FA279B0A60FEA3B484D56427DEF66AC90463C99D4EB4E2CE9D9FEE51`** — pin listesindeki 9 dosyadan
bloktan bağımsız betikle yeniden hesaplandı (9 pin, uyuşmazlık 0; R03-f'de pin listesinde değişen yalnız koşucu satırı;
`r04\recover-dogrulugu\r4\d7\test\pin-dogrulama-son.log`). Blok öz-testi **PIN-1** bu eşitliği her koşumda ölçer (R03-f son koşumları: iki kabukta
9/9, digest `CD86CD77…` = `$ExpPackage`). Kanıttaki `revision` yine `R03` (C-1 ölçer); R03-f koşucusu `packageDigest` `CD86CD77…` ile ayırt edilir;
kanıtta yeni alan yok — `portalClose.sessionVersion.hucre` artık `TG` olabilir, P7-C1 gözlemi `· dayanak=…` ile biter, `closeText` / `acikErisim` / kurtarma
nedeni metinleri §14.7'deki biçimdedir. Aşağıdaki paragraf R03-e kaydıdır.

**Paket digest (R03-e; blok içinde `$ExpPackage`): `0AED059114569A3562C28AC02F452C1CFC9F350124DEF4AAC6128F198ACD55CF`** — pin listesindeki 9 dosyadan
bloktan bağımsız betikle yeniden hesaplandı (9 pin, uyuşmazlık 0; R03-e'de pin listesinde değişen yalnız koşucu satırı;
`r04\recover-dogrulugu\r3\d7\test\pin-dogrulama-son.log`). Blok öz-testi **PIN-1** bu eşitliği her koşumda ölçer (R03-e son koşumları: iki kabukta
9/9, digest `0AED0591…` = `$ExpPackage`). Kanıttaki `revision` yine `R03` (C-1 ölçer); R03-e koşucusu `packageDigest` `0AED0591…` ile ayırt edilir;
kanıtta yeni alanlar `issuedVersion`, `portalClose.sessionVersion.hucre`, `portalClose.closeText`, `portalClose.acikErisim`. Aşağıdaki paragraf R03-d kaydıdır.

**Paket digest (R03-d; R03-e'de geçersiz): `1E046F24A1443081908F2040791C6891D895F57C31FF33CDE4CD20C8D8D6C89D`** — pin listesindeki 9 dosyadan
bloktan bağımsız betikle yeniden hesaplandı (9 pin, uyuşmazlık 0; R03-d'de pin listesinde değişen yalnız koşucu satırı;
`r04\recover-dogrulugu\r2\d7\test\pin-dogrulama-son.log`). Blok öz-testi **PIN-1** bu eşitliği her koşumda ölçer. Aşağıdaki paragraf R03-c kaydıdır.

**Paket digest (R03-c; R03-d'de geçersiz): `97C9F56AE550FF0048CBB606071109E2C8F33158714482C48B25ECC46E528CE3`** — pin listesindeki 9 dosyadan
bloktan bağımsız betikle yeniden hesaplandı (9 pin, uyuşmazlık 0; R03-c'de pin listesinde değişen yalnız koşucu satırı;
`r04\recover-dogrulugu\d7\test\pin-dogrulama-yeni.log`). Blok öz-testi **PIN-1** bu eşitliği her koşumda ölçer. Aşağıdaki paragraf R03 kaydıdır.

**Paket digest (R03; R03-c'de geçersiz): `3CF44049643447DED5F925F11DADCE67ECFBCD8D213B107E9E96AB6C5F96EA59`** — pin listesindeki 9 dosyadan bloktan
bağımsız betikle yeniden hesaplandı (9 pin, uyuşmazlık 0; R03'te pin listesinde değişen yalnız koşucu satırı). Yöntem doğrulaması: aynı betik
`origin/main` aynasında (R02 baytları) `7C42FCCD…7BDD` = eski `$ExpPackage` verdi. Blok öz-testi **PIN-1** bu eşitliği her koşumda ölçer.
`ExpLiveDist` (R27 `E28A6863…5134`) ve `ExpEnvSha` **değişmedi**. Canlı Preflight'ın paket/senkron kapısı ancak bu dosyalar main'e merge edilip ana
checkout senkron olduğunda geçer (bloğun `$Repo` yolu ana checkout'tur). Bu bölümün aşağısı R01/R02 kaydıdır.

Önceki paket digest (R01/R02; R03'te **geçersiz**): `7C42FCCD6349F95E42128F78CA1A86DF36EB20E246FD0D9936A8B1098DBA7BDD` (ondan önce `ABA91BAA…320E`) —
bağımsız yeniden hesaplama ile **eşit** (`kapanis-duzeltme\pin-dogrulama.txt`: 9 pin, uyuşmazlık 0; blok dosyası PkgPins'te değildir, blok
değişince digest değişmez); `ExpLiveDist` = R27 `E28A6863…5134`; `ExpEnvSha` = EXTACC bloğuyla aynı.
R02'de değişen yalnız blok (metin) ve blok öz-testidir; ikisi de pin listesinde değildir. Paket digest R02 baytlarıyla bloktan bağımsız betikle
yeniden hesaplandı ve `7C42FCCD…7BDD` ile eşit bulundu (R02 ilk tur: `d7-r02\test\paket-digest.log`; son baytlar: `d7-r02\tur2\test\paket-digest.log`).
Blok sha'sı değiştiği için R01 ya da R02 ilk tur baytlarıyla yapılmış bir Preflight/QrTest sonucu (varsa) son baytları kapsamaz; bloğun `$Repo` yolu
ana checkout olduğundan Preflight paket/senkron kapısı ancak bu dosyalar main'e merge edilip main senkron olduğunda geçer. R02 satırlarındaki
(blok ve blok öz-testi; son baytlar ve "R02 ilk tur") sha256 değerleri dosyaların ham baytlarından ölçülmüştür (UTF-8 BOM dahil, satır sonu LF).
2026-10-03 düzeltmesinde değişen yalnız `d7-selftest.js` ve bu belgedir; `d7-selftest.js` pin listesinde değildir (blok onu okumaz ve çalıştırmaz).
Paket digest o baytlarla yeniden hesaplandı ve `7C42FCCD…7BDD` ile eşit bulundu (`d7-r02\tur4\paket-digest.log`); blok ve blok öz-testi sha256
değerleri değişmedi. `d7-selftest.js` satırındaki değer dosyanın ham baytlarından ölçülmüştür (BOM yok, satır sonu LF).

## 8. Canlıda oluşacak kayıtlar ve kapanış

Bu liste owner bloğunun canlı veri onay metnindeki kalemleri **kapsar** (R02; öz-test G-2: 10 kalem iki yerde de geçer); §8 ek ayrıntı taşır
(ör. kullanıcı sayısı, dosya numaraları, audit eylem adları, okundu bayrakları — bunlar onay metninde yoktur). Kaynak: koşucu `E752DA1E…D2B6` + `i3-lib.js` `setupI3` + R27 aday commit'indeki `portal.service.ts` — **kaynaktan okundu, canlıda koşulmadı**.
**R03 notu:** koşucu R03'te (`F4B9BE18…22D3`) yazılan kayıt kümesi **aynıdır**; değişen sıradır — makbuz kurulumdan hemen sonra, iki ek dosyadan
**önce** yazılır (§13.1). Run'ın kapanışındaki tek yeniden giriş (§13.2) DB'ye yazmaz (kaynaktan okundu); yeniden deneme başarılıysa yazma kümesi
normal kapanışla aynıdır.

**Koşucunun yazdıkları (Run).** Bu koşum için İKİ yeni sentetik tenant: hedef `ah-<runId>` ve yabancı `ah-<runId>-x`. Hedef tenantta sentetik
personel kullanıcıları (9 kullanıcı; avukat/personel profilleri ve bir yetki kaydıyla), iki sentetik müvekkil, iki dosya (`I3-<runId>` ve ikinci
müvekkile bağlı `I3-<runId>-s`, yalnız D7-4S için) ve bir borçlu (+ dosya bağları); yabancı tenantta bir sentetik müvekkil ve bir dosya
(`I3-<runId>-xf`, yalnız D7-4N için). Sentetik müvekkile BİR portal hesabı (`.invalid` adres; e-posta yok). **PortalMessage**: koşucu 4 (müvekkil
×2, personel ×2) + telefondan gönderilirse +1; **PortalNotification**: 2 (personel yanıtı başına 1). Telefon girişi görülmezse 3 mesaj + 1 bildirim (ikinci
personel yanıtı gönderilmez). **R05 — kapsam durdurmasında (§15):** personel yanıtı ve kendi dosyasıyla mesaj YAZILMAZ: PortalMessage 1 (yalnız ilk müvekkil
mesajı) — ürün kapsam dışı denemeyi yanlışlıkla kabul ettiyse 2 (o satır da kalır; silme ucu yok); PortalNotification 0.

**Ürünün kendi yazdıkları (kaynaktan okundu).** Portal erişimi açma/kapatma **audit** satırları (`CLIENT_PORTAL_ACCESS_ENABLE` / `…_DISABLE`);
portal **giriş sayacı** ve son giriş zamanı (her başarılı portal girişinde); okundu bayrakları (`mark-read`, personel listesi); canlı API
**uygulama günlüğü**nde portal hesabı / portal girişi / mesaj gönderimi satırları (maskeli sentetik adres ya da müvekkil kimliği ile).
**E-posta/SMS yok** (mesaj akışı kaynakta gönderim üretmez — §2). API günlüğünün tam içeriği bu paketle **ölçülmez**; blok canlı API uygulama
günlüğünün içeriğini ölçmez, değiştirmez, silmez; yalnız başlatıcı günlüğündeki DB kimliği satırını okur (salt okuma kapısı).

**Kapanış sonrası durum.** Portal hesabı pasif + sürüm artmış, müvekkil portal erişimi kapalı, **personel pasif** (iki sentetik tenantın tüm
kullanıcıları; sürüm artmış), **dosyalar CLOSED**. Tenant kaydı kapatılmaz: **tenant yaşam döngüsü değişmez** (§3 notu). **Mesaj/bildirim
satırları yerinde kalır** ve kanıtta "saklandı" olarak raporlanır (silinmiş gibi DEĞİL).

**Diğer tenantlar.** Koşucunun yazma hedefleri kimlik bağı kapısıyla bu iki sentetik tenanta bağlıdır (kaynak); diğer tenantlar için **ölçülen**
yalnız **U-ISO**'dur: tenant başına kullanıcı ve müvekkil SAYISI önce/sonra aynı — içerik karşılaştırılmaz (sınırları §9).

### 8.1 Recover ne yazar (R02) — Run'ın kendi kapanışından AYRI bir canlı yazma işlemi

Recover kabul ölçütlerini koşmaz; yalnız kapanışı yeniden dener ve **canlıya yazar**. Yazma kümesi (koşucu `recoverMode` + `closePortal` +
`i13-lib.js` `closeAccess` kaynağından okundu; canlıda koşulmadı; öz-testte sahte API ile Z5 senaryosunda koşulur):

1. **Portal hâlâ açıksa** (hesap aktif ya da müvekkil erişim bayrağı açık): makbuzdaki sentetik personel (elev1) **geçici olarak yeniden
   aktifleştirilir ve parola özeti yeniden yazılır** (`User.isActive=true` + yeni `passwordHash`; parola bloğun o Recover koşumu için ürettiği rastgele
   değerdir; blok ve koşucu onu kendi kanıt/log dosyalarına yazmaz); o personelle yerel API'de oturum açılır ve yetkili uç çağrılır (`POST /portal/admin/disable-user`, en çok 2
   deneme): portal hesabı pasif + sürüm artışı (+ bekleyen sıfırlama alanları temizlenir), müvekkil portal erişimi kapalı, **kapatma audit
   satırı** (`CLIENT_PORTAL_ACCESS_DISABLE`; aktör: sentetik personel).
2. **Portal DB'de kapalı durumdaysa** (1. adımla ya da önceden): pasif portal hesabına **yalnız ölçüm için yeni rastgele parola özeti**
   yazılır (`ClientPortalUser.passwordHash`; hesap pasif kalır) ve bu parolayla yerel + dış adresten giriş **denenir** (401 beklenir; P7-C3L/C3D).
3. **Personel/dosya kapanışı (`closeAccess`)**: iki sentetik tenantın TÜM kullanıcıları pasif + sürüm artışı (her çağrıda yeniden artar), açık
   dosyalar CLOSED. 1. adımda aktifleştirilen personel burada yeniden pasifleştirilir; bu adım doğrulanmazsa personel **aktif kalmış olabilir**
   (çıkış 5; portal da doğrulanmadıysa 6).
4. Makbuzun yanında yeni bir `recover-<zaman>-<id>` kanıt dizini (`d7-evidence.json`, `d7-recover.log`, `SHA256-MANIFEST.txt`).
   **R04 (§14.9):** `-RunEvidenceDir` ile başlatıldıysa blok bundan önce Run kanıt dizininin **kardeşi** olan `<Run dizini>.recover-girdi-<UTC zaman>` dizinini açar ve
   içine makbuzu (`d7-setup-receipt-kanittan.json`) ile `RECOVER-GIRDI-KAYDI.json` dosyasını yazar (yerel dosya; canlıya yazma değildir); `recover-*` dizini de oradadır.
   Bu yolda Run kanıt dizinine ve manifestine yazılmaz.

Recover'ın **yazmadıkları**: GO defteri değişmez, GO sorulmaz; mesaj/bildirim satırları silinmez; `Tenant` satırına yazma yoktur; kimlik bağı
(makbuz ↔ tenant/slug/runId) doğrulanmazsa koşucu canlı DB'ye yazmadan durur (çıkış 4). Recover **U-ISO ölçmez**. Canlı API uygulama günlüğüne
düşen satırlar (personel/portal girişi denemeleri) bu paketle ölçülmez.

**"Recover BİR KEZ" kuralı kodla zorlanmaz.** Blok Recover'da GO sormaz, defter tutmaz ve aynı makbuzla ikinci bir Recover'ı engellemez; koşucu
da engellemez. İkinci bir Recover yukarıdaki yazmaları **yeniden** yapar (ör. kullanıcı sürümleri yeniden artar, pasif portal hesabına yeniden
ölçüm parolası özeti yazılır). Kural owner disiplinidir: Recover yalnız kanıt incelendikten sonra, AYRI owner onayıyla, bir kez başlatılır;
Recover'ın çıkış kodu (3/5/6 dahil) yeni bir Recover için yetki değildir. **İkinci bir Recover bu paketle tanımlı değildir; owner kararı
gerektirir** (§10 K-6) — bu belge ve blok metni ikinci bir Recover için koşul ya da yol tanımlamaz (öz-test G-6).
Koşucunun Recover kanıtındaki kurtarma adımı (R03; `recoveryAdvice` + `recoverStepText`): Recover kurtarma gerektiren bir sonuçla biterse
`recovery.adim` "ÖNERİ (yetki DEĞİL): kanıt incelenir ve sonuç CLIENT'a bildirilir. Bu çıkış kodu yeni bir Recover için yetki değildir; İKİNCİ bir
Recover bu paketle TANIMLI DEĞİLDİR, owner kararı gerektirir." der; çıkış 3'te metin kanıttaki verdict'lerden kurulur ("ÖNERİ (yetki DEĞİL): Recover
TEKRARLANMAZ — kanıttaki portal DB ölçütleri: P7-C2=… · P7-C5=…; ÖLÇÜLEMEYEN satırlar (…) Run kanıtıyla değerlendirilir"). R01/R02 baytlarındaki
"Owner bloğu `-Mode Recover -ReceiptFile <makbuz>` ile BİR KEZ" önerisi ve çıkış 3'teki sabit "DB kapalı" iddiası **kaldırıldı** (öz-test C-1, Z17).
Bu metin bir öneridir; yetki değildir ve ikinci bir Recover'ı tanımlamaz. R03 makbuzu ayrıca `setupComplete` alanını taşır; Recover bunu kanıtta
`setupEvidence` olarak raporlar (makbuz yarım kurulumdan geldiyse "Run kurulumu YARIM kalmıştı").

## 9. Sınırlar

- Sahte API ürünün kendisi değildir: ürünün gerçek guard/rol davranışı, `resolveCaseReference` 400'ü, bildirim üretimi ve tenant yaşam döngüsü
  yalnız canlıda ölçülür. Öz-testte "telefon" bir istemci taklididir.
- D7-5 (dış admin uçları 403) bu pakette ölçülmez; D-8 sondasının kaydıyla birlikte değerlendirilir.
- Okunmamış sayacının telefonda görünen değeri owner beyanıdır; web sayfası açılışta mark-read çağırdığından koşucu 2. yanıt sonrası sayacı yalnız raporlar.
- **Rozet = bildirim sayacı (R02).** Telefonda görülen rozet, üst çubuktaki zil simgesinin üzerindeki sayıdır ve **okunmamış `PortalNotification`**
  sayısını gösterir (`GET /api/portal/notifications/unread-count`; 30 sn'de bir yenilenir; 9'dan büyükse "9+"). **Mesaj** okunmamış sayacı
  (`GET /api/portal/messages/unread-count`, D7-3U'nun ölçtüğü API değeri) web arayüzünde bir rozet olarak **gösterilmez** (web kaynağında bu uca
  çağrı yok). Koşum iki personel yanıtı için iki bildirim satırı yazar; mesaj sayfasını açmak bildirimleri okundu yapmaz, bu yüzden rozet
  koşucunun raporladığı mesaj sayacından farklı bir değer gösterebilir. Rozet değeri yalnız owner beyanıdır ve yargılanmaz. Kaynak: R27 aday
  commit'indeki `apps/web/src/app/portal/layout.tsx`, `login/page.tsx`, `messages/page.tsx` (main ile fark 0); canlı web derlemesi ölçülmez (aşağıda).
- **Web derlemesi ölçülmez (R02).** Blok canlı **API** dist'ini pinler; canlı **web** derlemesi (`.next`) pinlenmez ve bu paketle ölçülmez.
  Giriş sonrası açılan sayfa (ana sayfa), Mesajlar sekmesi, mesaj sayfasının 10 sn'lik yenilemesi ve rozet davranışı **kaynak okumasına**
  dayanır; canlıdaki davranış yalnız owner beyanıyla gözlenir. Canlı web derlemesi kaynakla aynı değilse §5 adımlarındaki ekran tarifleri tutmayabilir.
- **U-ISO sınırı (R02).** U-ISO yalnız **sayı** ölçer: bu koşumun iki sentetik tenantı dışındaki tenantlarda tenant başına `User` ve `Client`
  satır sayılarının önce/sonra özetini karşılaştırır. İçerik değişikliğini, başka tabloları (dosya, mesaj, audit vb.) ve iki ölçüm arasında
  birbirini götüren ekleme+silmeyi **görmez**; PASS "başka tenanta dokunulmadı" kanıtı değildir, yalnız "bu iki sayım değişmedi" demektir.
  Koşum sırasında (20 dk'lık telefon beklemesi dahil) canlıda başka bir tenantta kullanıcı ya da müvekkil eklenir/silinirse U-ISO **FAIL** olur
  (koşumdan bağımsız değişiklik; koşucu ayırt edemez) — bu durumda sonuç CLIENT tarafından incelenir. Recover U-ISO ölçmez.
- Recover'da mevcut oturum reddi ölçülemez (oturum saklanmaz) → portal hesabı varken Recover çıkışı en iyi 3 (hesap hiç oluşmadıysa C3/C4 satırı üretilmez).
- **Recover çıkış 0, koşucu mantığında fiilen ulaşılamaz (R02 inceleme, D7-E11 b; kaynaktan okundu, canlıda koşulmadı).** Bloğun Recover
  özetindeki "0 kapanış + HTTP reddi doğrulandı" ifadesi çıkış kodu açıklamasıdır; koşucunun `recoverExitCode` kuralında 0 yalnız hiç
  ÖLÇÜLEMEYEN satır yoksa döner. Portal hesabı **varsa** mevcut oturum reddi (P7-C4L/C4D) Recover'da ÖLÇÜLEMEYEN'dir (oturum saklanmaz). Hesap
  **yoksa** Run'da mesaj ölçümleri koşmamıştır, makbuzda `runnerMessageIds` bulunmaz ve mesaj kalıntısı (P7-MSG-KEPT) ÖLÇÜLEMEYEN olur. İki
  durumda da en iyi çıkış **3**'tür (PASS sayılmaz). Dayanak: portal hesabı satırının koşucu dışında silinmediği varsayımı (koşucu ve ürünün
  kapatma ucu hesabı silmez; API kaynağında hesabı doğrudan silen bir çağrı bulunmadı; şema düzeyinde zincirleme silme incelenmedi). Blok
  öz-testindeki Recover çıkış 0 senaryoları (V-1, Z-8, G-3, G-6) koşucunun yerine konan taklit betikle üretilir; koşucunun Recover mantığını
  ölçmez. Blok metnindeki açıklama bu turda değiştirilmedi. **R03: blok metni düzeltildi** — Recover bitiş satırı 0'ı "FAIL ve ÖLÇÜLEMEYEN satır
  yok — koşucu mantığında fiilen beklenmez" diye yazar (§13.3; blok öz-testi O-6). Koşucunun Recover mantığı değişmedi; dayanak varsayımı aynı.
- **"DOĞRULANDI" satırının sınırı (R02 bağımsız ölçüm; kaynaktan okundu, koşumla üretilmedi).** Run sonunda gösterilen "Portal erişim
  kapanışı … DOĞRULANDI (DB + yeni giriş + mevcut oturum mesaj ucunda reddi)" metni sabittir ve P7-D9 PASS olduğunda yazılır. Koşucuda
  P7-D9, bu parçaların bir kısmı ölçülmeden de PASS olabilir: portal hesabı hiç oluşmadıysa kapanış C2…C5 satırlarını üretmeden tamam
  sayılır; koşucunun portal oturumu yoksa mevcut oturum reddi (P7-C4) gerekli sayılmaz. Bu iki durumda satır ölçülmemiş parçayı
  doğrulanmış gibi gösterir; hangi parçaların gerçekten ölçüldüğü kanıttaki ölçüt satırlarından (P7-C2…P7-C5) okunur. Metin R01'den
  beri aynıdır; düzeltmesi blok mantığına dokunur (D-6 R02'de beyanlı istisnayla yapıldı) ve bu revizyonda **yapılmadı** — sıradaki
  blok revizyonunun işidir. **R03: KAPANDI** — satır artık sabit değildir: "P7-D9 PASS — DOĞRULANDI yalnız bu satırın devamında PASS yazan
  parçalar içindir (kanıttan): DB kapalı + sürüm arttı [P7-C2/C2V/C5]: … · yeni giriş reddi [P7-C3L/D]: … · mevcut oturum reddi, koşucunun kendi
  portal oturumu [P7-C4L/D]: … · personel/dosya kapanışı [U-CLOSE]: …"; her parça kanıttaki verdict'lerden PASS / FAIL / ÖLÇÜLMEDİ (D-6 R02
  kalıbı; §13.3; blok öz-testi O-4/O-5). Satır rengi yine yalnız P7-D9'a bağlıdır ve bu, owner'a ayrı bir not satırıyla söylenir.
- **Run kapanışında personel oturumu yenilenmez (R02 inceleme, D7-E11 a; kaynaktan okundu, canlıda ölçülmedi).** Run'ın kapanış çağrısı
  (`POST /portal/admin/disable-user`) koşumun başında alınan personel (elev1) token'ını kullanır; Run'da oturumu yenileyen bir yol yoktur
  (yeniden oturum açma yalnız Recover'da vardır — §8.1 adım 1). Token kapanış anında geçersizse yetkili uç isteği 4xx ile reddeder
  (`JwtAuthGuard`; beklenen 401), koşucu 4xx yanıtta ikinci denemeyi yapmaz, portal erişimi açık kalır ve koşum **çıkış 6** ile biter
  (personel/dosya kapanışı yine denenir). Koşum, telefon beklemesi (en çok 20 dk) ve inceleme süresi (R06: 300 sn; önceki 120 sn) boyunca sürer. Personel token
  süresi kaynakta `JWT_EXPIRES_IN` ile belirlenir (kaynak varsayılanı `7d`; R27 aday commit'inde aynı); canlıdaki değer ve canlıdaki token
  süresi **ölçülmedi**. **R03: DEĞİŞTİ** — Run'ın kendi kapanışında kapatma ucu 401/403 dönerse koşucu bir kez yeniden giriş + bir kez yeniden
  deneme yapar (§13.2; öz-test Z16-a: 401 → çıkış 0). Başka 4xx'te (ör. 404), yeniden giriş reddedilirse ya da 429 alınırsa yeniden deneme yoktur
  ve kapanış yine doğrulanmaz (çıkış 6). Canlı token süresi bu revizyonda da ölçülmedi.
- **Recover yetkisi ölçülmez ve zorlanmaz (R02 inceleme).** Blok AYRI owner onayını sormaz ve ölçmez; "BİR KEZ" kuralını kodla zorlamaz (GO
  sorulmaz, defter tutulmaz; ikinci bir Recover'ı blok da koşucu da engellemez). Run çıkış 5/6 Recover yetkisi değildir (§5 adım 7, §8.1,
  K-5); ikinci bir Recover bu paketle tanımlı değildir (K-6). Öz-test G-3/G-4/G-6 yalnız owner'a gösterilen METNİ ve node çağrı sayısını
  ölçer; onayın verilip verilmediğini ölçmez.
- **Recover'ın kapı bağımlılıkları (R02).** Recover bu bloktan ancak **tüm salt okuma kapıları** geçerse başlar: main = origin/main ve takipli
  dosyalar temiz, paket pinleri + digest, canlı API dist pini (R27), canlı `.env` pini ve adres biçimi, 8080'de tek dinleyici (canlı API ayakta),
  başka kabul süreci yok, başlatıcı günlüğünde DB kimliği, `node` çözülebilir. Biri sağlanmazsa blok çıkış 90 ile durur ve Recover **başlamaz**
  (ör. Run'dan sonra main'e commit gelmiş ve checkout senkron değil; `.env` ya da dist değişmiş; API kapalı) → K-4. Dış zincir (Caddy/Cloudflared)
  ve yerel konsol kapıları Recover'da **aranmaz** (öz-test Z-8); zincir bozukken dış adresten giriş reddi (P7-C3D) ölçülemeyen kalabilir.
  Koşucunun kendi kapıları: TLS doğrulaması açık, beklenen DB = bağlı DB, API adresi beyanı, origin biçimi, `D7_RECOVER_CONFIRM`, makbuz
  biçimi + runId eşleşmesi + kimlik bağı. Portal hâlâ açıksa kapatma için canlı API'ye personel girişi gerekir (§8.1 adım 1).
- Owner bloğu **her modda** (Recover dahil) paket/dist/.env pinlerini ister. Run 5/6 ile bittikten sonra canlı dist değişirse (ör. R26'ya geri
  dönüş) Recover bu bloktan **çalışmaz**; kapanış bloktan tamamlanamaz → §10 K-4. Koşucu (`d7-portal-messages-live-run.js`) dist pini ölçmez;
  yalnız DB/API/origin kapılarına bakar — ama GO'suz/bloksuz koşum bu paketle yetkilendirilmez.
- **Kurulum ile makbuz arasındaki pencere (R02-b; kaynaktan okundu, canlıda ölçülmedi; koşucu öz-testinde bu yol için senaryo yok).** Koşucu
  Run'da önce kurulumu yapar (`setupI3`; tek veritabanı işlemidir — kendi içinde hata verirse geri alınır), ardından **makbuz atanmadan
  önce** iki ek dosyayı ayrı ayrı yazar (yabancı tenantta `I3-<runId>-xf`, hedef tenantta `I3-<runId>-s`; §8). Makbuz nesnesi ancak bu iki
  yazmadan sonra kurulur ve dosyaya yazılır. Bu iki yazmadan biri hata verirse:
  - makbuz **oluşmaz**: kanıt dizininde `d7-setup-receipt.json` yoktur, kanıtta `receipt` alanı yoktur;
  - Run'ın koşucu içindeki kendi kapanışı makbuza bağlıdır: makbuz yokken portal kapanışı da personel/dosya kapanışı da **çalıştırılmaz**;
    kanıta "kapatılacak bir şey yok" yazılır (`portalClose.nothingCreated`, `closure.nothingToClose`), U-CLOSE / P7-MSG-KEPT / P7-D9 satırları
    üretilmez, U-ISO ÖLÇÜLEMEYEN olur, `recovery.gerekli=false` yazılır ve koşum **çıkış 1** ile biter (5 ya da 6 **değil**; hata özeti
    `fatal` alanındadır);
  - oysa kurulum işlemi tamamlanmıştır: iki sentetik tenant, hedef tenanttaki sentetik kullanıcılar (profil ve yetki kayıtları dahil — §8; **aktif** — şema varsayılanı; parola
    özeti bloğun o koşum için ürettiği rastgele paroladan, blok ve koşucu parolayı kendi kanıt/log dosyalarına yazmaz), müvekkiller, borçlu
    ve ana dosya (**ACTIVE** — şema varsayılanı; dosya bağlarıyla birlikte) canlı DB'de **kalır**; ikinci yazma hata verdiyse yabancı tenanttaki ek dosya da kalır.
    Kullanıcılar pasifleştirilmez, sürümleri artırılmaz, dosyalar CLOSED yapılmaz. Portal hesabı ve mesaj satırı bu noktada henüz yoktur
    (oluşturma isteği gönderilmemiştir);
  - blok Run bitişinde "Portal erişim kapanışı DOĞRULANAMADI (çıkış 1)" satırını gösterir (kanıtta P7-D9 yoktur), beyan sorularını yine
    sorar (giriş bilgisi hiç gösterilmediği halde), 5/6 metnini **göstermez**; GO tüketilmiştir (defter satırı koşucudan önce yazılır);
  - **Recover bu durumda bu bloktan koşulamaz:** Recover makbuz dosyası ister; blok `-ReceiptFile` verilmediğinde ya da dosya yokken çıkış
    90 ile durur, koşucu makbuzu okuyamazsa çıkış 4 verir. Bu paket makbuzsuz bir kapanış yolu tanımlamaz.

  Çıkış 1 tek başına bu durumu ayırt etmez: makbuz **dosyası yazılamadığında** da çıkış 1 olur, ama o yolda makbuz nesnesi atanmıştır ve
  Run kendi kapanışını koşar (öz-test Z12: aktif kullanıcı 0). Ayrım kanıttaki `closure` alanından okunur (`nothingToClose` = kapanış hiç
  çalışmadı). **Aynı kanıt biçimi** (çıkış 1, `receipt` yok, `nothingCreated` / `nothingToClose`) kurulumun **kendisi** hata verip geri alındığında
  ve ilk izolasyon sayımı hata verdiğinde de oluşur; o iki durumda canlı DB'de kalıntı **yoktur**. `closure` alanı bu üç durumu ayırmaz; ayrım
  `fatal` metninden ve sentetik tenantın DB'de bulunup bulunmadığından okunur (DB'ye bakma owner/CLIENT kararıdır — K-7). Kalan iki sentetik
  tenant, kanıt dizinindeki runId'den türeyen **slug** değerleriyle (`ah-<runId>`, `ah-<runId>-x`) tanınır (tenant adları farklıdır). Bu pencerede
  hata olasılığı ölçülmedi; kurulum işleminin onayı sırasında bağlantı kopması gibi sonucu belirsiz durumlar ayrıca incelenmedi. **Bu
  durumda yapılacak iş owner/CLIENT kararıdır** (§10 K-7); bu belge bir çözüm tanımlamaz. Koşucudaki sıranın değiştirilmesi pinli dosyaya
  dokunur (koşucu sha256'sı ve paket digest değişir) ve bu turda **yapılmadı**.

  **R03: kusur giderildi (koşucu sırası değişti; §13.1).** Makbuz artık `setupI3`'ten hemen sonra atanır ve dosyaya yazılır; iki ek dosyanın
  kimlikleri yazıldıkça makbuza eklenir (`foreignCaseId`, `sameTenantOtherCaseId`, `setupComplete`). İki ek yazmadan biri hata verirse makbuz
  **vardır**, Run'ın kendi kapanışı **koşar** (portal hesabı henüz yoktur → P7-C1 PASS; `closeAccess` → kullanıcılar pasif + sürüm artışı, açık
  dosyalar CLOSED; U-CLOSE, P7-D9 PASS), çıkış 1'dir (fatal) ve Recover makbuzu bulur. Ölçüldü (öz-test, disposable DB'de geçici tetikleyiciyle
  verilen yazma hatası): ikinci ek yazma hatasında yeni baytlar hedef tenantta 9/9 kullanıcıyı pasif, dosyaları CLOSED bırakır; eski baytlar aynı
  senaryoda **9 kullanıcı AKTİF, 1 dosya ACTIVE** (yabancı tenantta 1 dosya ACTIVE) bırakıp `closure.nothingToClose` yazdı (§13.4). Yukarıdaki
  maddelerin anlattığı makbuzsuz kalıntı bu iki yazma için **artık oluşmaz**. Kalan pencere: kurulumun **kendisi** (`setupI3`, tek işlem) — hata
  verirse işlem geri alınır (kaynaktan okundu; öz-test Z15-c'de ölçüldü: sentetik tenant sayısı 0/0) ve makbuz yoktur; işlemin onayı sırasında
  sonucu belirsiz bir kopma bu revizyonda da **incelenmedi** (K-7). Kanıttaki `setup` alanı bu durumları ayırır (§13.1).
- **Pencere açma yolu (R02-b).** Ajanın PowerShell 7'den `Start-Process` ile açtığı Windows PowerShell 5.1 penceresinde `Get-FileHash`
  bulunamaz; blok pin kapılarını ölçemez ve çıkış 90 ile durur (§5 adım 1). Blok bu durumu kendisi tespit etmez ve düzeltmez.
- **Recover'ın 1 ve 2 çıkış kodları (R02-b).** Bloğun Recover bitiş satırı bu iki kodu açıklamaz; koşucu Recover'da ikisini de
  döndürebilir. Anlamları §3'teki "Recover'da 1 ve 2" notundadır. **R03:** bloğun Recover bitiş satırı artık ikisini de açıklar (§13.3; O-6).
- Canlı Caddy yapılandırmasının repo şablonuyla aynı olduğu ölçülmez (D-8).
- Öz-test disposable DB'de satır bırakır (sentetik tenantlar; silme yok) ve `%TEMP%\d7-selftest-*` dizinlerinde giriş bilgisi taşıyan `*.sink`
  dosyaları + kendinden imzalı TLS anahtarı bırakır (yalnız disposable DB'deki artık pasif hesaplara ait; silinmez). Canlı DB'ye dokunulmadı.

## 10. Owner kararları ve notlar (teknik olarak tamamlanmış; karar gerektirenler)

- **K-1 Mesaj kalıntısı:** canlı koşum sonrası sentetik tenantta kalan PortalMessage/PortalNotification satırlarının "saklandı" kaydıyla kabulü
  (ürünte silme ucu yok; koşucu silmez). Alternatif (DB'den elle silme) bu paketin kapsamı dışıdır ve önerilmez.
- **K-2 SEC-PORTAL-ADMIN-MSG-01** (kısıtlı kayıt; AÇIK): D-7 kabulü için engel **değil** — D-7 müvekkil yüzeyini ölçer; etkilenen adımlar
  (D7-3/3N/3U/3G/3F/3B) yalnız personel yanıtını **üretmek** için yerel API'yi kullanır. Kayıt bu paketle **giderilmez**; ürün değişikliği ayrı iş ve
  owner kararıdır. Kayıt giderilirken personel yetki kuralı değişirse bu koşucunun personel aktörü (elev1) yeni kurala göre yeniden doğrulanır.
- **K-3 Tanım sapması:** D-8 §5 "kapsam dışı caseId → 404" yerine kaynak **400**; paket 400'ü kabul ölçütü sayar. Tanımın güncellenmesi owner/CLIENT kararı.
  **Karar durumu iki belgede farklı yazıyor (R02 inceleme, D7-E11 c; iki belge okunarak doğrulandı):** bu madde "owner/CLIENT kararı" der; R27 paketi
  (`client-release-r27-r01` §10, "Karar gerektirmeyenler") "ürün 400 döner ve tanım buna göre güncellendi" der; D-8 paketi §5 tablosu tanım
  sütununda 404'ü korur ve 400'ü "sapma" olarak kaydeder. Hangisinin geçerli olduğu **owner teyidi ister**; bu paket teyit gelene kadar K-3'ü
  açık sayar (ölçüt değişmez: koşucu 400 ölçer).
- **K-4 Recover ve dist değişimi:** Run 5/6 ile bittikten sonra canlı dist değişmişse Recover bu bloktan çalışmaz (her modda dist pini). Seçenekler:
  (a) canlı dist'i R27'ye geri getirip Recover'ı bu blokla koşmak; (b) yeni dist pinli bir blok sürümü (sıradaki revizyon; R02 yalnız metindir, dist pini aynı) hazırlatıp Recover'ı onunla koşmak;
  (c) CLIENT kararıyla kapanışı ayrı bir yolla doğrulamak. Bu paket hiçbirini kendiliğinden yapmaz. Dist dışındaki kapı bağımlılıkları §9'dadır.
  **R03 durumu: AÇIK (değişmedi).** R03 dist pinini değiştirmedi; değişen paket digest'idir (§7). R03 baytları main'e girmeden canlı Preflight
  paket kapısı geçmez (bloğun `$Repo` yolu ana checkout'tur).
- **K-5 Recover yetkisi (R02; owner kuralı 2026-10-01):** Run çıkış 5/6 otomatik Recover yetkisi DEĞİLDİR. Run'ın koşucu içindeki kapanış
  adımları Run'ın parçasıdır; ayrıca başlatılan Recover ayrı bir canlı yazma işlemidir (§8.1) ve kanıt incelemesi + açık kalan kaynakların
  bildirilmesi sonrasında **AYRI owner onayı** gerektirir; BİR KEZ başlatılır; blok ve ajan Recover'ı otomatik başlatmaz (§5 adım 7; öz-test
  G-3/G-4). Koşucunun kanıttaki kurtarma adımı metni (pinli, değişmedi) bir öneridir. "BİR KEZ" kodla zorlanmaz (§8.1).
  Bilgi (R02 inceleme; belge okunarak doğrulandı): R27 paketi (`client-release-r27-r01` §11 uygulama sırası tablosu) D-6/D-7 ve D-5 satırlarının
  "Durma" sütununda "5/6 → Recover" kısaltmasını taşır; bu kısaltma K-5 kuralını (kanıt incelemesi + AYRI owner onayı) yazmaz. R27 belgesi bu
  işin kapsamı dışındadır ve **değiştirilmedi**; D-7 için geçerli kural bu maddedir.
  **R03 durumu:** kural aynı. Koşucunun kanıttaki kurtarma adımı artık bu kuralı kendisi yazar ("ÖNERİ (yetki DEĞİL): çıkış kodu Recover yetkisi
  değildir; önce kanıt incelenir. Recover yalnız AYRI owner onayıyla başlatılır …"; öz-test C-1). Run'ın kapanışındaki tek yeniden giriş (§13.2)
  Run'ın **kendi** kapanışının parçasıdır; Recover değildir ve Recover yetkisi doğurmaz.
- **K-6 İkinci Recover (AÇIK owner sorusu; R02 inceleme):** owner kuralı Recover'ı BİR KEZ tanımlar. **İkinci bir Recover bu paketle tanımlı
  değildir; owner kararı gerektirir.** Bu belge ve blok metni ikinci bir Recover için koşul, onay biçimi ya da adım tanımlamaz; Recover'ın çıkış
  kodu (3/5/6 dahil) yeni bir Recover için yetki değildir. Recover'dan sonra kapanış hâlâ doğrulanmamışsa (ör. Recover çıkış 5/6) ne
  yapılacağı — ikinci Recover'a izin verilip verilmeyeceği, hangi kanıtla ve hangi onay biçimiyle, ya da kapanışın başka bir yolla
  tamamlanacağı — owner'ın vereceği karardır; bu paketle ikinci bir Recover başlatılmaz. Teknik durum: blok ve koşucu ikinci bir
  Recover'ı engellemez (§8.1); kural kodda değil, bu maddede ve gösterilen metindedir (öz-test G-6 yalnız metni ölçer).
  **R03 durumu: AÇIK (değişmedi).** Koşucunun Recover kanıtındaki adım metni de bu kuralı yazar ("İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR,
  owner kararı gerektirir"; öz-test C-1); R01/R02 koşucusunun Recover 5/6'da yazdığı "… ile BİR KEZ" önerisi kaldırıldı.
- **K-7 — owner kararı (2026-10-08):** "kimlikten makbuz" türü bir kapanış yaması **YAPILMAYACAK**. Makbuz yoksa **durulur**; kalıcı koşum kimliğiyle (kanıt
  dizininin adı = GO defteri satırı = blok kaydı; üçü de ilk canlı yazımdan önce yazılır) **yalnız ilgili sentetik kayıtların salt okuma dökümü** çıkarılır;
  aktif hesaplar, kalan dosya / satırlar ve önerilen kapatma işlemleri **somut listeyle** owner'a sunulur. Bu karar canlı silme, kapatma ya da Recover yetkisi
  **değildir**; işlem kararı o liste üzerinden ayrıca verilir. Aşağıdaki madde durumun teknik tarifidir (değişmedi).
- **K-7 Makbuzsuz yarım kurulum (R02-b; karar yukarıda):** Run, kurulum tamamlandıktan sonra ve makbuz atanmadan önce hata verirse (§9
  "Kurulum ile makbuz arasındaki pencere"; kaynaktan okundu, canlıda ölçülmedi) sentetik kullanıcılar aktif ve dosya(lar) ACTIVE kalabilir,
  Run'ın koşucu içindeki kendi kapanışı çalışmaz, koşum çıkış 1 ile biter ve makbuz dosyası oluşmadığı için Recover bu bloktan koşulamaz.
  Bu durumda ne yapılacağı — kapanışın tamamlanıp tamamlanmayacağı, hangi yolla, hangi kanıtla ve hangi onay biçimiyle — **owner/CLIENT
  kararıdır**. Bu paket bu durum için bir adım, onay biçimi ya da makbuzsuz kapanış yolu tanımlamaz ve kendiliğinden hiçbir şey yapmaz;
  DB'ye elle yazma bu paketin kapsamı dışıdır. Çıkış 1 de tek başına Recover yetkisi değildir: Recover yalnız kanıt incelemesinden sonra,
  AYRI owner onayıyla başlatılır (K-5).
  **R03 durumu: kusurun ana yolu GİDERİLDİ, madde DARALARAK AÇIK.** İki ek dosya yazmasından biri hata verirse artık makbuz vardır, Run'ın kendi
  kapanışı koşar (kullanıcılar pasif, dosyalar CLOSED) ve Recover makbuzu bulur (§9, §13.1; öz-test Z15-a/b/r). Açık kalan dar durum: kurulumun
  **kendisi** (`setupI3`, tek işlem) sonucu belirsiz biterse (ör. işlem onayı sırasında bağlantı kopması; incelenmedi) makbuz yoktur. Bu durumda
  koşucu yalnız **ölçer ve bildirir**: kanıttaki `setup` alanı (aşama `kurulum`, durum `KURULUM_HATASI`, makbuz dosyası yok) ve sentetik tenant
  slug'larının DB'deki sayısı (salt okuma); sayı 0'dan büyükse kurtarma nedenine "KURULUM: makbuz YOK ama sentetik tenant slug'ı DB'de VAR …" satırı
  yazılır (tenantın bu koşumun kurulumundan mı, önceden var olan bir slug'dan mı geldiği `fatal` metninden okunur). Makbuzsuz kapanış yolu bu
  pakette **tanımlı değildir**; ne yapılacağı owner/CLIENT kararıdır.
- **K-8 Run kapanışında tek yeniden giriş kabulü (AÇIK owner kararı; R03):** R03 (b) Run'ın kendi kapanışına canlı API'ye en çok **bir** ek personel
  girişi (`POST /auth/login`) ve en çok **bir** ek kapatma çağrısı ekler (§13.2). Canlıya ek etkisi **kaynaktan okundu, canlıda ölçülmedi**: DB yazması
  yok; personel giriş hız sınırının bellek içi sayacı +1; HTTP metrikleri ve API uygulama günlüğü satırları. Bu davranışın canlı koşumda kabul edilip
  edilmediği owner kararıdır; bu belge onu kabul edilmiş saymaz. Reddedilirse R02 davranışına (yeniden giriş yok; portal açık kalır, çıkış 6) dönmek
  koşucu değişikliğidir (koşucu pini + paket digest değişir). Aynı karar D-6 paketinde (R03, PR #2904; main'de henüz yok) OK-6 olarak açıktır.
- Bilgi (R02'de güncellendi): bu maddenin R01 metni "`EXTACC-D5` bloğunun QrTest'i `extacc-qr-test.js` ile `/portal/forgot-password` ister; o
  betik yalnız `/portal/login` kabul eder (çıkış 4)" diyordu. Bu durum **D-5 R03 ile giderildi**: D-5 bloğunun QrTest'i artık kendi
  `d5-qr-test.js` betiğini çağırır (`/portal/forgot-password`; D-5 paket belgesi R03 notu ve §6 pin tablosu). D-7 QrTest'i baştan beri
  `d7-qr-test.js` kullanır; bu notun D-7'ye etkisi yoktur.
- Bilgi (kapanış düzeltmesi, 2026-09-29): owner bloğundan public host ve yerel kullanıcı yolu literalleri **kaldırıldı** — portal adresi canlı `.env`
  `PUBLIC_PORTAL_BASE_URL`'den okunur (biçim kapısı) ve Run/QrTest'te owner'ın konsola yazdığı R05 adresiyle doğrulanır; kanıt kökü `$env:USERPROFILE`'a
  görelidir. Canlı kök, launcher günlüğü yolu ve DB kimlik dizesi (R26/D-4/D-5 ile aynı, betiğin çalışması için gerekli) yerinde kaldı. D-4/D-5/EXTACC
  bloklarında aynı sertleştirme **ayrı iş** (R27 belgesi §9; eski paketler bu turda değiştirilmez).

## 11. R01 inceleme düzeltmeleri (2026-09-29; iki bağımsız inceleme)

| Bulga | Karar | Değişiklik |
|---|---|---|
| ÖNEMLİ — D7-3G ürün gövdesi `{ client, messages }` iken koşucu çıplak dizi bekliyordu (canlıda sahte FAIL); sahte API de diziyi taklit ediyordu | **doğrulandı, düzeltildi** | koşucu `ag.body.messages` (nesne şart; çıplak dizi FAIL) + gözleme `gövde=`; sahte API `{ client, messages }`; öz-test Z1-g `gövde={client,messages} · listede=3/3`; §2/§3 |
| Belge "Preflight/Run DUR" derken blok tüm modlarda durur | doğrulandı, düzeltildi | §1 ön koşul, blok başlığı, §9, §10 K-4 |
| D7-3B "+DB satırı" ölçütte değildi | doğrulandı, düzeltildi | `o2` satırı (clientId/tenantId/senderType/senderId/content) ölçütte; gözlem `satır=` |
| D7-3N/D7-3U yanıtsız çağrıda FAIL üretiyordu | doğrulandı, düzeltildi | `o1`/`u1`/`mr` yanıtsız → ÖLÇÜLEMEYEN; sahte API `reply=hang`, `unread=hang`; öz-test Z14-a/Z14-b |
| "aynı tenant başka müvekkil → 400" ölçülmüyordu | doğrulandı, düzeltildi (ölçüm eklendi) | kurulumda ikinci sentetik müvekkile bağlı `showToClient=true` dosya; **D7-4S**; makbuz `sameTenantOtherCaseId`; Z1-e/Z1-g/Z3 |
| P7-MSG-KEPT boş ownIds ile 0===0 PASS; Recover'da sabit koşul | doğrulandı, düzeltildi | Run: mesaj yoksa ÖLÇÜLEMEYEN; makbuza `runnerMessageIds`; Recover gerçek sayım / id listesi yoksa ÖLÇÜLEMEYEN; Z10, Z10-r, Z5-b, Z13 |
| Owner bloğunda canlı topoloji literalleri (emsal) | ilk incelemede "değişiklik yok" denmişti; **kapanış düzeltmesinde (2026-09-29) düzeltildi** (ortak kural: canlı topoloji ayrıntısı public repoya yazılmaz) | `$ExpBaseUrl` `.env`'den + `Assert-PortalBaseUrl` + `Confirm-PortalBaseUrlR05` (Run/QrTest); `$EvRoot` `$env:USERPROFILE`; blok öz-testi K-6/K-6b/K-7/K-8/Q-R05/S-5 (58/58 ×2 kabuk); §4, §5, §7, §10 |
| (kapanış) §2/§10 admin uçlarının yetki modeli ayrıntısı public belgede | doğrulandı, **düzeltildi** | ayrıntı public repodan çıkarıldı (`product-backlog.md`'ye eklenen satır R02'de **geri alındı**); owner-yerel kısıtlı kayıt **SEC-PORTAL-ADMIN-MSG-01**; §2 ve K-2 yalnız ID taşır |
| Caddyfile şablonunun repo yolu belgede yoktu | doğrulandı, düzeltildi | §2 yol + ilgili regexp satırları; canlı Caddy eşitliği ölçülmez (§9) |
| `%TEMP%` altında üç `d7-selftest-*` dizini (üçüncüsü belgelenmemiş) | doğrulandı; silme yok | kanıt dizinine `SUMMARY-FIX-R01.txt` notu; §9 sınır |
| P-1'de sentetik canlı DB URL literali (emsal) | doğrulandı, **değişiklik yok** (D-4/D-5 ile aynı; sahte kullanıcı/parola) | — |

## 12. R02 (2026-10-01) — owner bloğu metni ve Recover yetkisi

**Kapsam.** Yalnız owner bloğunun METNİ (yorumlar, konsol çıktısı, istem metinleri), blok öz-testi ve bu belge değişti. Koşucu
(`d7-portal-messages-live-run.js`), sahte API, QR betiği, `d7-selftest.js` ve bloğun pin listesindeki 9 dosya **değişmedi**; paket digest aynıdır.
Blok mantığı değişmedi (§6.2 mantık eşitliği: istisna yok). Örnek alınan düzeltme: D-5 paketi R04. Owner kuralı (2026-10-01): Run çıkış 5/6
otomatik Recover yetkisi değildir; Recover yalnız kanıt incelendikten sonra AYRI owner onayıyla, bir kez başlatılır; blok Recover'ı otomatik
başlatmaz; kapsamsız mutlak ifade kullanılmaz; metin yalnız ölçüleni iddia eder.

| Bulgu | Karar | Değişiklik |
|---|---|---|
| D7-E1 — blok ve §5 adım 7, çıkış 5/6'da Recover'ı doğrudan talimat gibi yazıyordu | düzeltildi | blok: 5/6 metni Run'ın kendi kapanışını Recover'dan ayırır ("Recover YETKİSİ DEĞİLDİR / blok BAŞLATMAZ / önce kanıt / AYRI owner onayı, BİR KEZ"; kanıttaki kurtarma adımı öneridir); başlık yorumu; §5 adım 7; §10 K-5; öz-test G-4 |
| D7-E2 — Recover'ın canlı yazma kümesi belgede/blokta yoktu | düzeltildi | §8.1 "Recover ne yazar"; blok Recover girişinde bilgi metni (yalnız Write-Host; soru/akış yok) + başlık yorumu + 5/6 metninde özet; öz-test G-3 |
| D7-E3 — "Recover BİR KEZ" kodla zorlanmaz | belgelendi (kod değişmedi) | §8.1 son paragraf, §5 adım 7, §10 K-5; blok metinleri "kodla ZORLANMAZ" der |
| D7-E4 — girişten sonra açılan sayfa mesaj sayfası değil; beyan seçeneği ana sayfayı hata sayfasıyla aynı harfe düşürüyordu | düzeltildi (yalnız metin) | §5 adım 4 "Mesajlar sekmesine geçin"; beyan istemleri: M = portal açıldı (ana sayfa/özet ya da mesaj sayfası), D = hata/portal dışı sayfa; harf kümesi ve `-ceq 'M'` kodu aynı (§4 R02 notu) |
| D7-E5 — rozetin neyi saydığı yazılmamıştı | belgelendi | §9 "Rozet = bildirim sayacı"; §5 adım 5; beyan istemi "zil simgesindeki rozet (okunmamış BİLDİRİM sayacı; mesaj sayacı değildir)" |
| D7-E6 — "sentetik tenant CLOSED" ifadesi tenant yaşam döngüsünün değiştiği izlenimini veriyordu | düzeltildi (blok metni + belge) | blok onay metni ve kalıntı satırı notu: "dosyalar CLOSED + personel pasif + portal pasif; tenant yaşam döngüsü DEĞİŞMEZ"; §3 notu, §8. Koşucunun kanıt metni pinlidir, **değişmedi** (aynı ifadeyi üretmeye devam eder; §3 notu anlamını sabitler) |
| D7-E7 — canlı veri onay metni §8 kayıt listesiyle eşleşmiyordu | düzeltildi | onay metnindeki kalemler §8'de de geçer; §8 ek ayrıntı taşır (ikinci sentetik müvekkil ve `-s` dosyası, ürünün kendi yazdıkları, API günlüğü satırları, U-ISO sınırı); "Gerçek müvekkil verisine dokunulmaz" mutlak ifadesi kaldırıldı; öz-test G-2 kalemleri hem gösterilen metinde hem §8'de ölçer |
| D7-E8 — öz-test atıfları eski baytlara bağlıydı | düzeltildi | §6 başına "hangi baytlar" notu; §6.3 son baytların koşumu (§6.2 = R02 ilk tur); §7 pinler |
| D7-E9 — U-ISO'nun neyi ölçmediği yazılmamıştı | belgelendi | §9 "U-ISO sınırı"; blok onay metninde "yalnız SAYI; içerik karşılaştırılmaz" |
| D7-E10 — Recover'ın kapı bağımlılıkları ve web derlemesinin ölçülmediği yazılmamıştı | belgelendi | §9 "Recover'ın kapı bağımlılıkları", "Web derlemesi ölçülmez"; §10 K-4 atfı |
| Bayat satır — "D-5 bloğunun QrTest'i çıkış 4" | düzeltildi | §10: D-5 R03 ile giderildiği yazıldı |
| Kapsamsız mutlak ifadeler ("… hiçbir dosyaya/kanıta yazılmaz") | düzeltildi | blok SIR yorumu ve §1: "blok ve koşucu kendi kanıt/log dosyalarına yazmaz" + ölçülen kapsam; canlı DB'deki parola özetleri ve canlı API günlüğü ayrı yazıldı; öz-test G-1 |

**Bu revizyonda yapılmayanlar / açık kalanlar.**
- D7-E11 (üç kısa belge notu): R02 ilk turunda notların içeriği verilmediği için uygulanmamıştı; içerik inceleme düzeltmeleri turunda verildi ve
  kaynak okunarak doğrulanıp **uygulandı** (§12.1).
- Koşucunun kanıt metinleri ("sentetik tenant CLOSED", "Owner bloğu `-Mode Recover …` ile BİR KEZ") pinli dosyadadır ve değişmedi; düzeltilmeleri
  koşucu sha'sını ve paket digest'i değiştirir — ayrı iş. *R03: yapıldı (§13.3; koşucu pini ve paket digest değişti — §7).*
- "Recover BİR KEZ" ve "AYRI owner onayı" kodla zorlanmaz/ölçülmez (blok mantığı bu revizyonda değiştirilemez); kural belge + gösterilen metindir.
- `owner-block.json` `revision` alanı `R01` kalır (§4).
- Repodaki `d7-selftest.js` kütüphaneleri canlı yayın dizininden yükler; bu turda yalnız ayna kopyada koşuldu (§6.2). Öz-testin kütüphane kökünün
  canlı yayın dizinine bağlı olması ayrı bir düzeltme konusudur (bu işin kapsamı dışında: yalnız blok, blok öz-testi ve belge değişebilir).
  *Bu madde R02 ilk turunun tarihsel kaydıdır. **Güncel durum (2026-10-03): KAPANDI** — kütüphane kökü ortamdan verilir, canlı yayın ağacı
  reddedilir; repodaki dosyanın kendisi koşuldu, 41/41 PASS (§6.4, §12.2). Ayna kopya sonucu tarihsel kanıttır.*
- Blok öz-testinin çıktısı yerel kullanıcı adını maskelemez (yalnız gözlem dökümü ve geçici dizin satırı maskelidir); kanıt logları yazılırken
  maskelendi. D-5 öz-testindeki tam maske (M-1) D-7'ye taşınmadı.
- Web arayüzü tarifleri (ana sayfa, Mesajlar sekmesi, zil rozeti) kaynak okumasıdır; canlı web derlemesi ölçülmedi (§9).
- **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.** Bu revizyon hiçbiri için yetki değildir.

### 12.1 R02 inceleme düzeltmeleri (2026-10-01; yalnız metin ve belge)

**Kapsam.** R02 ilk turu (commit `a71cd2c8`) bağımsız incelendi; engelleyici ya da önemli bulgu çıkmadı. Aşağıdaki küçük bulgular **yalnız metin
ve belge** düzeltmesiyle kapatıldı: blok METNİ (yorum + konsol çıktısı), blok öz-testi (yalnız yeni metni ölçen G-5/G-6) ve bu belge. Blok
mantığı değişmedi (§6.3 mantık eşitliği: R02 ilk tur bloğu → son blok birebir eşit, istisna yok); koşucu, sahte API, QR betiği, `d7-selftest.js`
ve pinli 9 dosya değişmedi; paket digest aynıdır. Owner kuralı: Run çıkış 5/6 Recover yetkisi değildir; Recover yalnız kanıt incelendikten sonra
AYRI owner onayıyla, BİR KEZ başlatılır; blok başlatmaz; **ikinci bir Recover bu kuralda tanımlı değildir** — metin bir tekrar yolu tanımlamaz.

| Bulgu | Karar | Değişiklik |
|---|---|---|
| D7V-1 — kalıntı satırının altındaki açıklama ("sentetik tenant CLOSED" = dosyalar CLOSED + …) kapanış doğrulanmadığında da durum iddiası gibi okunuyordu | düzeltildi (blok metni + belge) | Run ve Recover bitişindeki not yeniden yazıldı: ifade koşucunun SABİT metnidir, kapanışın doğrulandığını GÖSTERMEZ; kapanış durumu Run'da "Portal erişim kapanışı … DOĞRULANDI / DOĞRULANAMADI" satırındadır; anlamı: hedeflenen kapanış = dosyalar CLOSED + personel pasif + portal pasif; tenant yaşam döngüsü değişmez. §3 notu aynı cümleyi taşır. Öz-test G-5 |
| D7V-2 — Recover bitiş metni "tekrar ancak AYRI owner onayıyla" diyerek ikinci Recover için yol tanımlıyordu | düzeltildi (blok metni + belge) | bitiş metni: "Bu çıkış kodu yeni bir Recover için yetki DEĞİLDİR; Recover BİR KEZ koşulur (kodla zorlanmaz); sonuç CLIENT'a bildirilir." + "İkinci bir Recover bu paketle TANIMLI DEĞİLDİR; owner kararı gerektirir."; Run 5/6 metni ve başlık yorumu aynı kuralı taşır; §4, §5 adım 7, §8.1; §10'a açık owner sorusu **K-6**. Öz-test G-6 |
| D7V-3 — §8 "blok günlükleri okumaz, değiştirmez, silmez" (blok başlatıcı günlüğünden DB kimliği satırını okur) | düzeltildi | §8: "blok canlı API uygulama günlüğünün içeriğini ölçmez, değiştirmez, silmez; yalnız başlatıcı günlüğündeki DB kimliği satırını okur (salt okuma kapısı)" |
| D7V-4 — §7 "İlk iki satırdaki sha256" (R02 satırları tablonun ilk iki satırı değil) | düzeltildi | §7: "R02 satırlarındaki (blok ve blok öz-testi …) sha256 değerleri …" |
| D7V-5 — §10 K-4(b) "(R02)" (R02 zaten bu metin revizyonunun adı) | düzeltildi | "(sıradaki revizyon; R02 yalnız metindir, dist pini aynı)" |
| D7V-6 — §9'da Recover yetkisinin ölçülmediği/zorlanmadığı yazılmamıştı | belgelendi | §9 "Recover yetkisi ölçülmez ve zorlanmaz" |
| D7V-7 — §8 "onay metniyle AYNI kalemleri taşır" (§8 daha ayrıntılı; ölçülen yalnız 10 kalemin iki yerde geçmesi) | düzeltildi | §8: "onay metnindeki kalemleri kapsar (G-2: 10 kalem iki yerde de geçer); §8 ek ayrıntı taşır"; blok yorumu, öz-test başlık yorumu ve §12 D7-E7 satırı aynı ifadeye çekildi |
| D7V-8 — G-1'in neyi yakalamadığı yazılmamıştı | belgelendi | §6.2 "G-1'in sınırı" |
| D7-E11 a — Run kapanışında personel oturumu yenilenmez | doğrulandı (koşucu kaynağı: Run `closePortal` çağrısına oturum yenileyici verilmez; 4xx yanıtta ikinci deneme yok; portal açık kalırsa çıkış 6), belgelendi | §9. Token süresi kaynakta `JWT_EXPIRES_IN` (varsayılan `7d`); canlıda ölçülmedi |
| D7-E11 b — bloğun Recover özetindeki "0 = kapanış + HTTP reddi doğrulandı" koşucu mantığında fiilen ulaşılamaz | doğrulandı (koşucu kaynağı: `recoverExitCode` + `closePortal` + kalıntı ölçümü; hesap satırının koşucu dışında silinmediği varsayımıyla), belgelendi | §9. Blok metnindeki açıklama değiştirilmedi |
| D7-E11 c — K-3 karar durumu iki belgede farklı | doğrulandı (bu belge §10 K-3 ↔ R27 paketi §10 "Karar gerektirmeyenler"; D-8 paketi §5 tablosu), belgelendi | §10 K-3: owner teyidi ister. R27 ve D-8 belgeleri değiştirilmedi |

**Bu turda yapılmayanlar / sınırlar.**
- **Recover bitişindeki not, istenen cümleden bir yerde ayrılır:** Recover'da owner'a "DOĞRULANDI / DOĞRULANAMADI" satırı **gösterilmez** (blok bu
  satırı yalnız Run'da, owner beyanından önce yazar). Satır Recover'a metin olarak da eklenmedi: bloğun kapanış metni kanıttaki P7-D9 satırından
  üretilir ve Recover kanıtında P7-D9 yoktur — eklenen satır her Recover'da "DOĞRULANAMADI" derdi; doğru bir satır metin değil mantık değişikliği
  ister. Bu yüzden Recover notu kapanış durumu için "yukarıdaki çıkış kodu satırındadır" der ve böyle bir satırın gösterilmediğini açıkça yazar;
  Run notu istenen cümleyi aynen taşır.
- Canlı veri onay metnindeki açıklama ("… kanıt metnindeki "sentetik tenant CLOSED" = dosyalar CLOSED + personel pasif + portal pasif") koşumdan
  ÖNCE gösterilen bir tanımdır, durum bildirimi değildir; bu turda değiştirilmedi (D7V-1 yalnız kalıntı satırının altındaki notu kapsar).
- Bloğun Recover özetindeki "0 kapanış + HTTP reddi doğrulandı" açıklaması değiştirilmedi (D7-E11 b yalnız belge notudur).
- R27 paketi §11 tablosundaki "5/6 → Recover" kısaltması ve R27 §10'daki K-3 ifadesi bu işin kapsamı dışındadır; değiştirilmedi (K-3, K-5 notları).
- İkinci Recover kodla engellenmez; K-6 açık owner sorusudur. Koşucunun Recover kanıtındaki `recovery.adim` metni (pinli) 5/6'da yine "Recover …
  BİR KEZ" önerir (§8.1); koşucu değiştirilmediği için bu metin durur. *R03: koşucu metni düzeltildi ("ÖNERİ (yetki DEĞİL) … İKİNCİ bir Recover bu
  paketle TANIMLI DEĞİLDİR"); bloğun Recover özetindeki "0 kapanış + HTTP reddi doğrulandı" açıklaması da düzeltildi (§13.3).*
- Repodaki `d7-selftest.js` bu turda da yalnız ayna kopyada koşuldu (§6.3). *Bu madde o turun tarihsel kaydıdır. **Güncel durum (2026-10-03):**
  repodaki dosya düzeltildi ve kendisi koşuldu, 41/41 PASS (§6.4, §12.2).*
- **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.** Bu tur hiçbiri için yetki değildir.

### 12.2 R02 koşucu öz-testi kütüphane kökü (2026-10-03; yalnız `d7-selftest.js` ve belge)

**Kapsam.** Değişen iki dosya: `scripts/d7-selftest.js` (yalnız kütüphane kökü çözümü + canlı ağaç reddi + bir çıktı satırı) ve bu belge. Koşucu
(`d7-portal-messages-live-run.js`), owner bloğu, blok öz-testi, QR betiği, sahte API ve bloğun pin listesindeki 9 dosya **değişmedi**; paket digest
aynıdır (`7C42FCCD…7BDD`). Canlı Run kapıları ve pin denetimi blokta durur ve bu düzeltmeyle gevşetilmedi (bloğa dokunulmadı). Öz-testin ölçtüğü
41 ölçüt aynıdır. Ayrıntı, komut, sonuç ve sınırlar §6.4'tedir.

**Bu turda yapılmayanlar / sınırlar.**
- Canlı yayın ağacı, canlı DB, canlı API ve canlı günlükler kullanılmadı ve okunmadı; ret ölçümlerinde canlı ağaç yolu yalnız ortam değişkeni
  değeri olarak verildi (§6.4 sonda ölçümü).
- D-4, D-5 ve EXTACC paketlerinin öz-testleri aynı sabit kütüphane kökünü taşır; değiştirilmedi (ayrı iş).
- Öz-testin bıraktığı disposable DB satırları ve `%TEMP%\d7-selftest-*` dizinleri silinmedi (önceki turlarla aynı davranış; §9).
- **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.** Bu tur hiçbiri için yetki değildir.

### 12.3 R02-b ek sınırlar (2026-10-03; yalnız belge)

**Kapsam.** Değişen tek dosya bu belgedir. Owner bloğu, koşucu (`d7-portal-messages-live-run.js`), blok öz-testi, koşucu öz-testi, QR betiği,
sahte API ve bloğun pin listesindeki 9 dosya **değişmedi**; §7'deki sha256 değerlerine dokunulmadı. Bu turda çalışma ağacında yeniden ölçülen:
paket dizinindeki altı betiğin sha256'sı §7 ile eşit; pin listesindeki 9 dosyanın sha256'sı bloktaki pin satırlarıyla eşit (9/9). Paket digest
yeniden **hesaplanmadı** (girdisi olan 9 dosya değişmedi). Hiçbir blok, koşucu ya da öz-test **çalıştırılmadı**; canlı ortama, konteynerlere ve
`.env` dosyasına dokunulmadı. Konu: D-6/D-7 kabul koşumunun "Run / normal kapanış / AYRI Recover" sınırları için yapılan salt okuma
araştırmasının bu belgede eksik ya da çelişkili bulduğu kalemler; her kalem belgeye yazılmadan önce kaynakta yeniden okunarak doğrulandı.

| Kalem | Kaynakta doğrulama | Belgede |
|---|---|---|
| R02B-1 — pencere açma tuzağı bu belgede yoktu (D-6 belgesinin R02 sürümünde — PR #2880; bu dalda ve `main`'de henüz yok — §4 adım 1'de kayıtlı) | doğrulandı: bloğun `Sha` fonksiyonu `Get-FileHash` çağırır (paket pinleri, canlı dist, `.env`, kanıt manifesti); komut bulunamazsa hata akıştaki genel yakalayıcıya düşer (çıkış 90). Yerel ölçüm 2026-10-03: PowerShell 7.6.6'dan `Start-Process` ile açılan Windows PowerShell 5.1.26100 çocuğunda `Get-FileHash=False`, PowerShell 7 içinden çağrı işleciyle doğrudan çağrıda `True`, ebeveyn `PSModulePath` geçici kaldırılınca `True` | §5 adım 1, §9 "Pencere açma yolu" |
| R02B-2 — kurulum ile makbuz arasındaki pencere belgede yoktu | doğrulandı: koşucu Run'da `setupI3` çağrısından sonra iki `case.create` yazması makbuz nesnesi atanmadan önce gelir; makbuz yokken kapanış dalları `nothingCreated` / `nothingToClose` döner ve `closePortal` / `closeAccess` çağrılmaz; çıkış kuralı bu durumda 1 verir; `setupI3` tek işlemdir; `User.isActive` ve `Case.status` şema varsayılanları aktif / ACTIVE (çalışma ağacındaki şema ve R27 aday commit'indeki şema; aynı); blok Recover'da makbuz dosyası ister (yoksa 90), koşucu makbuzu okuyamazsa 4 | §9 "Kurulum ile makbuz arasındaki pencere", §10 **K-7** (açık owner sorusu) |
| R02B-3 — Recover'ın 1 ve 2 çıkış kodlarının anlamı belgede yoktu | doğrulandı: koşucu `recoverExitCode` sırası 6 → 5 → 1 → 2 → 3 → 0; `fatal` yalnız hazırlık adımındaki yakalayıcıda atanır; Recover'da FAIL verip 6 ya da 5 üretmeyen tek satır P7-MSG-KEPT'tir; bloğun Recover bitiş satırı 1 ve 2'yi saymaz; koşucu öz-testinde iki Recover senaryosu vardır (Z5 → 3, Z10-r → 0 değil) | §3 "Not (R02-b) — Recover'da 1 ve 2", §9 kısa atıf |
| R02B-4 — blok ↔ koşucu metin farkları: (a) Recover özetindeki "0 kapanış + HTTP reddi doğrulandı", (b) Run kapanış satırının sabit metin oluşu | belgede **zaten kayıtlı**: (a) §9 "Recover çıkış 0, koşucu mantığında fiilen ulaşılamaz" maddesi ve §12.1 D7-E11 b; (b) §9 "DOĞRULANDI satırının sınırı" maddesi | değişiklik yok |
| R02B-5 — koşucu öz-testinde uzun yol önekli kök | doğrulandı: `d7-selftest.js` kök denetimi sırası — ad karşılaştırması (`underLive`) → kök varlığı → iki `package.json` yoklaması → gerçek yol (`realOf`) karşılaştırması → modül yükleme; önekli yazım ilk adımdan geçer, dördüncü adımda reddedilir. İfade kopyası ölçümü 2026-10-03 (vekil dizin; node v24.18.0) | §6.4 "Canlı ağaç reddi" düzeltme notu + "Sınırlar" yeni madde |

**Bu turda yapılmayanlar / sınırlar.**
- Blok metni değiştirilmedi: Recover bitiş satırı 1 ve 2 kodlarını açıklamaz; blok pencere açma tuzağını tespit etmez ve düzeltmez.
- Koşucu değiştirilmedi (pinli): kurulum → iki ek dosya → makbuz sırası aynıdır; K-7 açık owner sorusudur.
- Koşucu öz-testi değiştirilmedi: uzun yol önekli kök yine dosya yoklamasından sonra reddedilir; kurulum ile makbuz arasındaki pencere için
  senaryo yoktur.
- **Blok öz-testi bu belgeyi okur ve bu turda KOŞULMADI.** G-2 §8'deki on kalemi, G-6 §5, §8 ve §10'da "bu paketle tanımlı değildir"
  cümlesinin bulunmasını ve dört tekrar-yolu kalıbının bulunmamasını ölçer. §8'e dokunulmadı; §5 ve §10'a eklenen metin bu kalıpları içermez
  (aynı bölüm sınırları ve aynı desenle yapılan statik denetim; bu bir öz-test koşumu **değildir**). §6.4'teki 64/64 sonucu belgenin bu
  turdan **önceki** baytlarıyla alınmıştır; belgenin son baytlarıyla blok öz-testi koşumu sıradaki işin parçasıdır.
- Yerel ölçümler (pencere açma yolu; ifade kopyası) oturum içi ölçümdür: çıktıları repoya ya da kanıt dizinine **yazılmadı**; yalnız komut
  araması ve geçici vekil dizin kullanıldı, canlı yayın ağacı yoklanmadı.
- D-6 belgesi ve diğer paketler bu işin kapsamı dışındadır; değiştirilmedi.
- **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.** Bu tur hiçbiri için yetki değildir.
- *R03 notu:* bu listedeki "koşucu değiştirilmedi", "blok metni 1 ve 2'yi açıklamaz" ve "pencere için senaryo yoktur" maddeleri R02-b turunun
  kaydıdır; R03'te üçü de değişti (§13).

## 13. R03 — koşucu kapanış eksikleri (2026-10-03)

**Kapsam.** Owner talimatı: geçmiş testler tekrarlanmadan, açık kalan kaynakların güvenle belirlenip kapatılmasını engelleyen kusurlar için dar
koşucu düzeltmesi + izole hata senaryosu; yalnız uyarı metni eklemek çözüm sayılmaz. Normal Run kapanışı ile AYRI Recover yetkisi ayrı kalır
(çıkış 5/6 Recover yetkisi değildir). Emsal: D-6 R03 / R03-b (PR #2904; `main`'de henüz yok — o dala yazılmadı, yalnız okundu). Bu turda canlı
Run / Recover **koşulmadı**; owner bloğu **çalıştırılmadı** (yalnız blok öz-testi); canlı yayın ağacı, canlı DB, canlı `.env`, canlı API / portlar ve
canlı günlükler okunmadı / kullanılmadı. Ürün kaynağı okumaları R27 aday çalışma ağacı (`HY_WT_R27`, commit `1b758d29`) üzerindendir.

| Dosya | Değişiklik |
|---|---|
| `d7-portal-messages-live-run.js` (koşucu) | (a) makbuz `setupI3`'ten hemen sonra atanır + yazılır; ek dosya kimlikleri yazıldıkça eklenir (`setupComplete`); kanıtta `setup`; Recover kanıtında `setupEvidence` · (b) `closePortal`'da 401/403'te tek yeniden giriş + tek yeniden deneme; Run `staffReauth` verir, Recover vermez; kanıtta `portalClose.staffReauth` · (c) `productFinding` yalnız P7-C2 PASS iken; `recoveryAdvice` (portal satırı bağımsız, `adim` "ÖNERİ (yetki DEĞİL)", makbuzsuz kurulum satırı), `recoverStepText` (Recover 3 adımı verdict'lerden), `closureTag` (kalıntı parantezi ölçülenden), `messageResidue.note`, Recover `temporaryAccess` + ölçülen `temporaryAccessClosed`; `revision` alanı `R03`. Çıkış kodu fonksiyonları (`exitCodeOf`, `recoverExitCode`) ve öncelik **değişmedi** |
| `d7-fake-portal-api.js` (sahte API) | benzersiz personel token'ı (sıra no); senaryolar `staffAuth: expireOnDisable`, `disable: forbidden \| notFound`, `relogin: reject \| rateLimit` |
| `d7-selftest.js` (koşucu öz-testi) | DB kapısı kendi tek kullanımlık konteyner için genelleştirildi (§6.4 R03 notu); Z15-a/b/c/r, Z16-a..f, Z17, Z18, C-1, T-9, T-10 (41 → 56 ölçüt) |
| `d7-owner-live-block.ps1` (owner bloğu) | `PkgPins` koşucu pini + `$ExpPackage`; Run kapanış satırı parçaları verdict'lerden + satır rengi notu; kalıntı notu; onay metnindeki koşucu ifadesi atfı; Recover bitiş satırı 0/1/2/3; kurulum yarım bilgi satırı; başlık notu. Kapılar, mod sırası, node çağrısı, çıkış kodları **değişmedi**; `owner-block.json` `revision` alanı `R01` kalır |
| `d7-owner-block-selftest.ps1` (blok öz-testi) | PIN-1, O-4, O-5, O-6, O-7 (64 → 69 ölçüt); G-2 ve G-5 yeni metne göre güncellendi |

### 13.1 (a) Kurulum ile makbuz arasındaki pencere (§9, K-7)

**Kusur (R02 baytları; izole senaryoda ölçüldü).** Run önce kurulumu (`setupI3`, tek işlem), ardından **makbuz atanmadan önce** iki ek dosyayı
(yabancı tenant `I3-<runId>-xf`, hedef tenant `I3-<runId>-s`) ayrı ayrı yazıyordu. Bu iki yazmadan biri hata verirse makbuz yoktu; Run'ın kendi
kapanışı "kapatılacak bir şey yok" sayılıyordu (`closePortal` / `closeAccess` çağrılmıyordu) ve Recover makbuz dosyası olmadığı için koşulamıyordu.
Eski baytlarla ölçülen (öz-test Z15-a negatif kontrolü): ikinci ek yazma hata verdiğinde hedef tenantta **9 kullanıcının 9'u AKTİF**, 1 dosya
**ACTIVE**, yabancı tenantta 1 dosya **ACTIVE** kaldı; kanıt `closure = {ok:true, nothingToClose:true}`, makbuz dosyası yok, çıkış 1.

**Düzeltme.** Makbuz `setupI3` döner dönmez atanır (`setupComplete: false`) ve dosyaya yazılır (yazılamazsa önceki gibi portal hesabı açılmadan
durulur). Ek dosya kimlikleri yazıldıkça makbuza eklenir ve dosya yeniden yazılır (`foreignCaseId`; `sameTenantOtherCaseId` + `setupComplete: true`).
Recover makbuzdan yalnız kimlik bağı alanlarını ve personel/portal alanlarını kullanır; ek dosya kimlikleri Recover için gerekmez (kaynaktan okundu:
`closeAccess` iki sentetik tenanttaki tüm ACTIVE dosyaları kapatır).

**Bulunması — kanıttaki `setup` alanı** (`asama` = son başlayan adım · `tamamlanan` · `durum` · `makbuzDosyasi` (ölçüldü) · makbuz yoksa
`sentetikTenantDB = { hedef, yabanci }` — `ah-<runId>` / `ah-<runId>-x` slug'larının DB'deki sayısı, salt okuma):

| `setup.durum` | Ne zaman | Makbuz | Run'ın kendi kapanışı |
|---|---|---|---|
| `TAMAM` | beş adım tamam (izolasyon sayımı, kurulum, makbuz, iki ek dosya) | var | koşar |
| `YARIM_MAKBUZ_VAR` | ek dosya yazmalarından biri hata verdi | var (`setupComplete=false`) | **koşar**; Recover makbuzu bulur |
| `YARIM_MAKBUZ_DOSYASI_YAZILAMADI` | makbuz dosyası yazılamadı | bellekte var, dosya yok | koşar (öz-test Z12); makbuz dosyası olmadığı için Recover bloktan koşulamaz |
| `KURULUM_HATASI` | `setupI3` hata verdi (tek işlem; kaynaktan okundu: geri alınır) | yok | "kapatılacak bir şey yok"; sentetik tenant sayısı ölçülür (Z15-c: 0/0) |
| `KURULUM_BASLAMADI` | ilk izolasyon sayımı hata verdi | yok | aynı; koşucu yazma yapmamıştır |

Makbuz yokken sentetik tenant sayısı 0'dan büyük ölçülürse kurtarma nedenine "KURULUM: makbuz YOK … ama sentetik tenant slug'ı DB'de VAR …" satırı
yazılır ve adım "makbuz YOK: Recover bu kanıtla başlatılamaz; makbuzsuz kapanış yolu bu pakette tanımlı değildir (owner/CLIENT kararı; K-7)" der
(birim ölçümü Z18; gerçek bir belirsiz işlem onayı senaryosu koşulmadı). Bloğun Run bitişi `setup.durum` TAMAM değilse "KURULUM YARIM KALDI …"
bilgi satırı gösterir (O-7); bu satır Recover yetkisi değildir. Recover kanıtı makbuzdaki `setupComplete` alanını `setupEvidence` olarak raporlar.

**İzole senaryolar** (arıza disposable DB'ye senaryonun runId'sine bağlı geçici bir BEFORE INSERT tetikleyicisiyle verilir; koşucuya test kancası
**eklenmedi** — koşucu canlıdakiyle aynı kodu koşar; tetikleyici senaryodan sonra kaldırılır):
- **Z15-a** ikinci ek yazma (`-s`) hata verir → makbuz VAR (`setupComplete=false`, `foreignCaseId` var, `sameTenantOtherCaseId` yok); Run kapanışı
  koştu (`closure.ok`, `nothingToClose` yok; P7-C1 / U-CLOSE / P7-D9 PASS); hedef tenantta 9/9 kullanıcı pasif, dosyalar CLOSED; yabancı `-xf` CLOSED;
  API çağrısı 0; `setup.asama=ek-dosya-ayni-tenant`, `durum=YARIM_MAKBUZ_VAR`; P7-MSG-KEPT ÖLÇÜLEMEYEN, kapanış özeti "personel pasif + dosyalar CLOSED
  (U-CLOSE PASS); portal hesabı YOK"; çıkış 1.
- **Z15-r** aynı makbuzla Recover makbuzu bulur ve koşar (çıkış 4 değil): P7-C1 PASS (portal hesabı yok; kapatma ucu çağrılmaz), U-CLOSE PASS,
  `setupEvidence.setupComplete=false`; mesaj id listesi yok → P7-MSG-KEPT ÖLÇÜLEMEYEN → çıkış 3.
- **Z15-b** birinci ek yazma (`-xf`) hata verir → makbuz VAR (`foreignCaseId` yok), kapanış koştu, kullanıcılar pasif, `asama=ek-dosya-yabanci`; çıkış 1.
- **Z15-c** kurulumun kendisi hata verir (yabancı tenant yazması reddedilir) → işlem geri alındı: makbuz YOK, `asama=kurulum`, `durum=KURULUM_HATASI`,
  `sentetikTenantDB = {hedef: 0, yabanci: 0}`; kurtarma gerekmez; çıkış 1.
- **T-10** (statik) kaynak sırası: `setupI3` → makbuz ataması → makbuz yazımı → iki ek dosya yazması.

### 13.2 (b) Run kapanışında personel oturumu reddi — tek yeniden giriş + tek yeniden deneme (§9, K-8)

**Kusur (R02 baytları).** Run'ın `closePortal` çağrısına oturum yenileyici verilmiyordu; personel token'ı kapanış anında geçersizse (ör. 20 dk'ya
varan telefon beklemesi + 120 sn inceleme sonrası) kapatma ucu 401 verir, koşucu 4xx'te ikinci denemeyi yapmaz, **portal hesabı açık kalır**, koşum
çıkış 6 ile biter. Eski baytlarla ölçülen (Z16-a negatif kontrolü): kapatma çağrısı 1, personel girişi 1, P7-C2 FAIL, çıkış 6.

**Düzeltme ve sınır.** Kapatma ucu **401 ya da 403** dönerse ve DB'de portal hâlâ açıksa koşucu makbuzdaki sentetik personelle **bir kez** yeniden
giriş yapar (koşum başında kullanılan aynı kimlik bilgisi: makbuzdaki personel e-postası + tenant slug'ı + bu koşumun parolası; yeni token sır
listesine eklenir) ve kapatmayı **bir kez** yeniden dener. Başka 4xx (ör. 404) → yeniden giriş yok; ikinci 401/403 → yeniden giriş yok (döngü yok);
yeniden giriş reddedilir ya da 429 alınırsa yeniden deneme yok; 5xx / belirsiz yanıt için en çok iki adım kuralı değişmedi. Toplam: yeniden giriş ≤ 1,
kapatma çağrısı ≤ 3. Yeniden giriş fonksiyonu DB'ye yazmaz (Prisma çağrısı yok; statik ölçüt T-9); Recover'ın geçici erişim yolu (personeli aktif
yapıp parola özeti yazmak) Run'da **kullanılmaz** — personel pasifse yeniden giriş reddedilir ve yeniden deneme yapılmaz. Recover değişmedi (oturumu
Recover başında açar; 401/403'te yeniden giriş yapmaz). Yeniden giriş Run'ın **kendi** kapanışının parçasıdır; Recover değildir, Recover yetkisi doğurmaz.

**Canlıya ek etkisi — kaynaktan okundu, canlıda ölçülmedi** (`HY_WT_R27` `apps/api/src/modules/auth/auth.controller.ts` `POST /auth/login` +
`guards/login-rate-limit.guard.ts`, `auth.service.ts` `login()`, `auth.module.ts`, `portal/portal.controller.ts` + `portal.service.ts` `disablePortalUser`):
- **DB:** personel girişi (`AuthService.login`) yalnız **okur** (`user.findFirst` + tenant + bcrypt karşılaştırması + token üretimi); `lastLoginAt`,
  giriş sayacı ya da audit satırı **yazmaz**. Portal hesabının giriş sayacı (`ClientPortalUser.loginCount`) personel girişinden etkilenmez.
- **Hız sınırı:** `LoginRateLimitGuard` (personel kovası, portal kovasından ayrı; anahtar `request.ip`) her girişte — başarılı olanlar dahil — bellek
  içi sayacı 1 artırır; 60 sn pencerede 10 deneme → 5 dk blok (429). Sayaç DB'ye yazılmaz. Koşucu yerel API'ye loopback'ten bağlanır; aynı anahtarı
  paylaşan başka personel girişleri o pencerede aynı kovayı kullanır. 429 alınırsa yeniden deneme yapılmaz → çıkış 6 (öz-test Z16-d).
- **Reddin yeri:** `admin/disable-user` `JwtAuthGuard` arkasındadır (geçersiz / süresi dolmuş token → 401); `disablePortalUser` müvekkil bulunamazsa
  404, yetki denetimi (`assertCanManagePortalAccess`) başarısızsa 403 verir — üçü de **yazmadan önce** döner. Reddedilen ilk çağrı yazmamıştır;
  yeniden deneme çift yazma üretmez. Personel token süresi kaynakta `JWT_EXPIRES_IN` (varsayılan `7d`); canlı değer **ölçülmedi**.
- **Diğer:** bellek içi HTTP metrikleri (+1 giriş, +1 kapatma isteği) ve canlı API uygulama günlüğü satırları — **ölçülmedi**. Yeniden deneme başarılıysa
  yazma kümesi normal kapanışla **aynıdır** (portal pasif + sürüm artışı + bekleyen sıfırlama alanları temiz + müvekkil erişimi kapalı + kapatma audit
  satırı; aktör sentetik personel).
- **Kanıt:** `portalClose.staffReauth = { neden, giris, yenidenDeneme }` (yalnız HTTP kodları; token yok), P7-C1 gözlemindeki çağrı listesi
  ("personel oturumu YENİLENDİ (tek yeniden giriş)"), `calledEndpoints`'te `POST <API>/auth/login (kapanış: personel oturumu yenileme)`; kapanış yine
  doğrulanmazsa kurtarma nedeni "PERSONEL OTURUMU kapanışta reddedildi …" satırını taşır.

**İzole senaryolar:** **Z16-a** ilk kapatma çağrısında personel token'ları geçersizleşir (401) → tek yeniden giriş (201) + tek yeniden deneme (201) →
portal kapandı, kapanış ölçütlerinin tamamı PASS, **çıkış 0 (6 değil)**; kapatma çağrısı 2, personel girişi 2. **Z16-b** kapatma ucu her çağrıda 403
→ yeniden giriş 1, yeniden deneme 1, sonra durur (kapatma 2, giriş 2) → çıkış 6. **Z16-c** 404 → yeniden giriş yok (kapatma 1, giriş 1) → çıkış 6.
**Z16-d** 401 + yeniden giriş 429 → yeniden deneme yok (kapatma 1, giriş 2) → çıkış 6. **Z16-f** (Z5 koşumu) iki kez 500 → yeniden giriş yok
(kapatma 2, giriş 1) → çıkış 6.

### 13.3 (c) Kapanış metinleri yalnız ölçüleni söyler

**Koşucu (kanıt).**
- **Ürün bulgusu:** koşucunun portal oturumunun kapanış sonrası 200 dönmesi **yalnız DB kapanışı ölçülmüşken** (P7-C2 PASS) ürün bulgusudur ve dayanağını
  adlandırır ("… DB kapanışı ölçüldükten sonra (P7-C2 PASS) …"). DB'de portal hâlâ açıksa P7-C4L/D yine FAIL'dir ama gözlem "portal hesabı DB'de hâlâ
  AÇIK (P7-C2 FAIL …) — kapatma YAPILMADI; oturumun erişmesi bu durumda ürün bulgusu SAYILMADI" der, `productFinding` yazılmaz. Eski baytlar 403 / 404
  / 401 + 429 / iki kez 500 / süre dolumu yollarının hepsinde portal AÇIK iken "ÜRÜN BULGUSU … Recover bunu düzeltemez; token 7 gün geçerli" yazıyordu
  (Z16-a..d, Z16-f negatif kontrolü) — açık kalan portal hesabını kapatmaktan alıkoyabilecek yanlış çıkarım. Gerçek ürün bulgusu korunur (Z16-e, Z8
  guard bayat koşumu).
- **Kurtarma nedeni:** portal erişim satırı ürün bulgusu satırından **bağımsızdır** (ölçüt `portalDbClosed` = P7-C2 PASS + P7-C2V FAIL değil + P7-C5
  PASS); DB'de açık ölçüldüyse satır değerleriyle ve kapatma çağrılarıyla yazılır; DB kapalıyken doğrulanmayan ölçütler adıyla yazılır; süre iddiası
  ("token 7 gün") yerine "portal oturumunun geçerlilik süresi bu koşumda ÖLÇÜLMEDİ"; geç oluşma satırı "birkaç dakika sonra Recover BİR KEZ" yerine
  "hesap sonradan oluşmuş olabilir" der.
- **Kurtarma adımı:** "ÖNERİ (yetki DEĞİL)" ile başlar. Run: "çıkış kodu Recover yetkisi değildir; önce kanıt incelenir. Recover yalnız AYRI owner
  onayıyla başlatılır (owner bloğu `-Mode Recover -ReceiptFile <makbuz>`); kabul ölçütleri tekrarlanmaz." Recover: "kanıt incelenir ve sonuç CLIENT'a
  bildirilir. Bu çıkış kodu yeni bir Recover için yetki değildir; İKİNCİ bir Recover bu paketle TANIMLI DEĞİLDİR, owner kararı gerektirir." Recover
  çıkış 3: kanıttaki P7-C2 / P7-C5 verdict'lerinden ("… P7-C2=PASS · P7-C5=PASS" ya da hesap yokken "P7-C2=ÜRETİLMEDİ · P7-C5=ÜRETİLMEDİ (portal hesabı
  YOK …)") — önceki sabit "Recover TEKRARLANMAZ: DB kapalı …" kaldırıldı (Z17).
- **Kalıntı metni:** "(sentetik tenant CLOSED; portal pasif)" yerine "(kapanış, ölçülen: …)" (§3 notu); `messageResidue.note` ölçülmeyen erişim
  iddiasını taşımaz. **Recover geçici erişimi:** "kapanışta yeniden kapatıldı" sabit iddiası (U-CLOSE'dan önce yazılıyordu) kaldırıldı; yerine ölçülen
  `temporaryAccessClosed` (U-CLOSE ile aynı kaynak).

**Owner bloğu.**
- **Run kapanış satırı:** SABİT "Portal erişim kapanışı koşucu tarafından DOĞRULANDI (DB + yeni giriş + mevcut oturum mesaj ucunda reddi)." yerine
  "Portal erişim kapanışı: koşucunun birleşik ölçütü P7-D9 PASS — DOĞRULANDI yalnız bu satırın devamında PASS yazan parçalar içindir (kanıttan): DB
  kapalı + sürüm arttı [P7-C2/C2V/C5]: … · yeni giriş reddi, yerel + dış [P7-C3L/D]: … · mevcut oturum reddi, koşucunun kendi portal oturumu, mesaj
  ucunda, yerel + dış [P7-C4L/D]: … · personel/dosya kapanışı [U-CLOSE]: … . Telefondaki oturumun reddini koşucu ÖLÇMEZ (yenileme sorusu beyandır)."
  Her parça PASS / FAIL / ÖLÇÜLMEDİ (D-6 R02 kalıbı). Gerekçe ölçüldü: P7-D9 PASS iken portal hesabı hiç açılmamış olabilir (yarım kurulum Z15-a:
  P7-C2..C5 satırı yok) ya da koşucunun portal oturumu olmayabilir. Satır rengi yine yalnız P7-D9'a bağlıdır; bu, ayrı bir not satırıyla söylenir.
- **Kalıntı notu:** "koşucunun SABİT ifadesidir" yerine "Parantez içindeki kapanış özeti koşucunun kanıttaki U-CLOSE ve portal DB ölçümünden kurulur
  (R03; sabit ifade değildir) …". Onay metni koşucunun eski ifadesine atıf yapmaz ("hedeflenen kapanış = …; sonuç kanıttaki U-CLOSE ve P7-C* satırlarından
  okunur").
- **Recover bitiş satırı:** "0 kapanış + HTTP reddi doğrulandı" (koşucu mantığında fiilen ulaşılamaz — §9) ve "3 DB kapalı ama bazı HTTP kontrolleri
  ÖLÇÜLEMEDİ" kaldırıldı; 0 / 3 / 2 / 1 koşucunun `recoverExitCode` kuralına göre yazılır (§3 R03 notu).
- **Kurulum bilgisi:** Run bitişinde `setup.durum` TAMAM değilse "KURULUM YARIM KALDI (kanıttaki setup alanı): durum=… · son aşama=… · makbuz dosyası=…"
  bilgi satırı; "Bu bilgi Recover yetkisi DEĞİLDİR".
- Run 5/6 metni (Recover yetkisi değildir; blok başlatmaz; önce kanıt; AYRI owner onayı) **değişmedi**.

### 13.4 Öz-testler, negatif kontroller, pinler (ölçülen)

Kanıt kökü (repo dışı): `HY_R27_AGENT_EVIDENCE\r04\d7-closure-r03\` (`test\`, `neg\`, `onceki\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık
konteynerinde (`postgres:16-alpine`, loopback, 5432 dışı port, `_test` adlı veritabanı; şema `D7T_LIB_ROOT`'taki üretilmiş Prisma istemcisinin şemasından
`prisma db push` ile; iş sonunda kaldırıldı) ve `D7T_LIB_ROOT` = canlı olmayan R27 aday çalışma ağacı proje kökü ile koşuldu; `d5-reset-pg` /
`d67-test-pg` / `seca-test-pg` kullanılmadı. Sahte API 8200 / dış 8459, gerçek TLS. Negatif kontroller `git archive` aynasında (çalışma ağacı bozulmadı).
Dalın tabanı `7ae481e3`; `origin/main` bu iş sırasında bir commit ilerledi (`9898e05e`, OFFICE banka hesapları) — D-7 paketine ve pinli 9 dosyaya
dokunmuyor.

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d7-selftest.js` — **SON BAYTLAR** (koşucu `F4B9BE18…`, sahte API `CA4BDA3D…`, öz-test `120049AC…`, blok `4BAE9DE0…`; 6 betiğin sha256'sı koşum öncesi = sonrası) | **56/56 PASS**, çıkış 0 (yeni 15: Z15-a/b/c/r, Z16-a..f, Z17, Z18, C-1, T-9, T-10; önceki 41 aynen PASS; C-1: 25 kanıt, 9'unda kurtarma gerekli, sorun yok; S-1: 77 dosya, sızıntı yok) | `test\d7-selftest-son.log`, `test\son-kosum-sha-once.txt` / `-sonra.txt`, `test\son-kosum-artifaktlar\` (giriş bilgisi taşıyan sink ve anahtar dosyaları kopyalanmadı) |
| **Negatif — koşucu:** eski koşucu baytları (`E752DA1E…`, `7ae481e3`) + R03 öz-test / sahte API / blok (ayna) | **41/56**, çıkış 1 — FAIL = **tam olarak yeni 15 ölçüt**; önceki 41 ölçüt eski baytlarda da PASS. Eski davranış ölçüldü: Z15-a/b'de makbuz yok, kapanış `nothingToClose`, hedef tenantta 9/9 kullanıcı AKTİF + dosya ACTIVE; Z16-a'da tek 401 → yeniden giriş yok → portal AÇIK → çıkış 6; Z16-a..d/f'de portal AÇIK iken "ÜRÜN BULGUSU … token 7 gün"; Z17'de Recover 3 adımı sabit "DB kapalı"; T-10'da makbuz ek dosyalardan sonra | `neg\neg-eski-kosucu.log`, `neg\neg-eski-kosucu-gozlem.txt`, `neg\ayna-eski-kosucu-kurulum.txt` |
| `d7-owner-block-selftest.ps1` — **SON BAYTLAR** (blok `4BAE9DE0…`, öz-test `A2EE5703…`; belge son hâliyle) | **69/69 PASS** Windows PowerShell 5.1 · **69/69 PASS** PowerShell 7, çıkış 0 (PIN-1: 9/9 dosya, digest `3CF44049…` = `$ExpPackage`) | `test\blok-oz-test-winps51.log`, `test\blok-oz-test-pwsh7.log` |
| **Negatif — blok:** eski blok baytları (`8B3B22C0…`, `origin/main`) + R03 blok öz-testi + R03 koşucu, pinli dosyalar ve belge (ayna) | **62/69**, çıkış 1, iki kabukta da — FAIL = tam olarak yeni 5 ölçüt + güncellenen 2 ölçüt: **PIN-1** (koşucu `F4B9BE18` ≠ eski pin `E752DA1E`; digest `3CF44049` ≠ `7C42FCCD`), **O-4 / O-5** (eski sabit "DOĞRULANDI (DB + yeni giriş …)" cümlesi; parça yok), **O-6** (eski "0 kapanış + HTTP reddi doğrulandı"), **O-7** (kurulum bilgi satırı yok), **G-5** (eski "koşucunun SABİT ifadesidir" notu), **G-2** (onay metninde koşucunun eski "sentetik tenant CLOSED" ifadesine atıf); kalan 62 ölçüt eski blokta da PASS | `neg\neg-eski-blok-winps51.log`, `neg\neg-eski-blok-pwsh7.log`, `neg\ayna-eski-blok-kurulum.txt` |
| Pin hesabı (yöntem doğrulaması + yeni pinler) | `origin/main` aynasında 9 pin uyuşmazlık 0, digest `7C42FCCD…` = eski `$ExpPackage`; R03 baytlarında 9 pin uyuşmazlık 0, digest `3CF44049…` = `$ExpPackage` | `onceki\pin-dogrulama-main.log`, `test\pin-dogrulama-yeni.log` |
| Ayrıştırma | iki ps1: parse hatası 0 (WinPS 5.1 ve pwsh 7); `Get-FileHash` iki kabukta bulunuyor; `node --check` (koşucu, sahte API, öz-test) 0 | `test\parse-iki-kabuk.log` |

Birim ölçümleri (koşucu öz-testi): **Z17** `recoverStepText` — hesap yokken metinde "PASS" yok ("P7-C2=ÜRETİLMEDİ · P7-C5=ÜRETİLMEDİ (portal hesabı YOK
…)"); DB kapalıyken "P7-C2=PASS · P7-C5=PASS" + ÖLÇÜLEMEYEN satırlar adıyla; Z5 Recover kanıtında (çıkış 3) adım kanıttaki verdict'i yazar. **Z18**
`recoveryAdvice` — (i) portal DB'de açık → portal satırı değerleriyle + "ürün bulgusu SAYILMADI"; (ii) ürün bulgusu + HTTP sonrası DB açık (P7-C5 FAIL) →
iki satır da; (iii) makbuz yok + sentetik tenant VAR → KURULUM satırı + "makbuz YOK: Recover bu kanıtla başlatılamaz"; (iv) Recover adımı ikinci Recover
kuralını yazar, "BİR KEZ" yok; `closureTag` U-CLOSE PASS ↔ DOĞRULANMADI. **C-1** bu öz-testin tüm Run / Recover kanıtlarında: `revision=R03`; sabit
iddia yok ("sentetik tenant CLOSED", "… kapanışıyla erişilemez", "token 7 gün", "birkaç dakika sonra Recover", "Recover BİR KEZ", "ile BİR KEZ",
"kapanışta yeniden kapatıldı", "TEKRARLANMAZ: DB kapalı"); kalıntı parantezi U-CLOSE / P7-C2 verdict'iyle tutarlı; ürün bulgusu yalnız P7-C2 PASS iken;
her Run kanıtında `setup.durum`.
Blok öz-testi: **PIN-1** pin + digest eşitliği · **O-4** tüm parçalar PASS + eski sabit cümle gösterilen metinde ve kaynakta yok + parçalar "Koşum bitti."
satırında + satır rengi notu + renk mantığı aynı · **O-5** parça varyantları (hesap yok → ÖLÇÜLMEDİ/ÖLÇÜLMEDİ/ÖLÇÜLMEDİ/PASS; oturum yok; C2V
ÖLÇÜLEMEYEN; FAIL yumuşatılmaz; P7-D9 FAIL → DOĞRULANAMADI) · **O-6** Recover bitiş satırı 0/1/2/3 (taklit betik) · **O-7** kurulum yarım bilgi satırı ·
**G-5** yeni kalıntı notu · **G-2** onay metninde koşucunun eski ifadesine atıf yok.

### 13.5 Durum

- **Kapalı:** kurulum ile makbuz arasındaki pencerede makbuzsuz kalıntı (iki ek dosya yazması için; K-7'nin ana yolu); Run kapanışında personel oturumu
  süre dolumu / tek seferlik 401-403 reddi nedeniyle portalın açık kalması (§9 D7-E11 a); açık portal hesabında yanlış "ürün bulgusu" ve portal açık
  satırının bastırılması; kanıttaki kurtarma adımının Recover'a yol tarif etmesi ("… ile BİR KEZ"; K-6 ile çelişki); Recover çıkış 3 adımının sabit
  "DB kapalı" iddiası; kalıntı metnindeki sabit "(sentetik tenant CLOSED; portal pasif)"; bloğun Run kapanış satırının sabit metni (§9); bloğun Recover
  bitiş satırındaki "0 kapanış + HTTP reddi doğrulandı" ve 1 / 2 kodlarının açıklanmaması.
- **Açık owner kararları:** K-1, K-2 aynen; **K-3** (400 ↔ 404 tanım teyidi) aynen; **K-4** (Recover ve dist değişimi) aynen; **K-5** kural aynen (çıkış
  5/6 Recover yetkisi değildir); **K-6** (ikinci Recover) aynen; **K-7** daraldı (yalnız kurulumun kendisinin sonucu belirsiz bitmesi; makbuzsuz kapanış
  yolu tanımlı değil); **K-8** yeni (Run kapanışında tek yeniden giriş kabulü).
- **Ölçülmeyenler:** yeniden girişin canlı etkisi (DB yazmaması, hız sınırı sayacı, metrik / günlük) yalnız kaynaktan okundu; canlı personel token
  süresi (`JWT_EXPIRES_IN`) ve canlı hız sınırı anahtarı ölçülmedi; sahte API ürünün kendisi değildir (ürünün gerçek JWT süresi / yetki reddi / hız
  sınırı davranışı canlıda ölçülmedi); kurulum işleminin onayı sırasında sonucu belirsiz bir kopma (`setupI3` için) üretilmedi ve incelenmedi; makbuzsuz
  durumda "sentetik tenant VAR" kurtarma satırı yalnız birim ölçümüyle (Z18) sınandı; ek dosya yazma hatası gerçek bir DB arızasıyla değil, tetikleyiciyle
  üretildi; R03 dalı main'e girmedi ve canlı Preflight bu baytlarla koşulmadı.
- **Preflight / QrTest / Run / Recover canlıda KOŞULMADI.** Bu revizyon hiçbiri için yetki değildir; canlı koşum ayrı owner GO'su
  (`OWNER-GO-CLIENT-EXTACC-D7-YYYYMMDD-RNN`) ister.
- **R03-c notu:** §13.4'teki "(ii) ürün bulgusu + HTTP sonrası DB açık (P7-C5 FAIL) → iki satır da" ölçümü R03 içindir; R03-c'de bu dal **değişti**
  (§14). §13'ün tabloları R03 baytlarının tarihsel kanıtıdır.

## 14. R03-c — kapanış / Recover doğruluğu (2026-10-03; owner talimatı madde 2)

Kapsam: owner talimatı madde 2 — "kapanış veya Recover hakkında kanıtın desteklemediği başarı ifadesi bulunmasın; ölçülemeyen mevcut oturum
reddi açıkça belirtilsin; makbuz yazılamadığında uygulanamayacak bir Recover komutu önerilmesin, gerçekten kullanılabilir kurtarma yolu ya da
somut engel gösterilsin". Önceki bağımsız doğrulamanın açık bıraktığı maddeler **kaynakta doğrulandı** (R03 baytları `e35f6ac6`) ve dar düzeltildi;
ek tarama (7c) iki kalem daha buldu. Canlı Run / Recover **koşulmadı**, owner bloğu **çalıştırılmadı** (yalnız blok öz-testi); canlı ağaç, canlı DB,
canlı `.env`, canlı API/portlar kullanılmadı. Çıkış kodu fonksiyonları ve öncelik **değişmedi**; kanıttaki `revision` alanı `R03` kalır.

### 14.1 Kaynakta doğrulanan açıklar (R03 baytları)

| No | Açık (R03) | Etki |
|---|---|---|
| 7a | Bloğun Recover bitiş satırında "mevcut oturum reddi Recover'da ÖLÇÜLEMEZ" yalnız 3'ün açıklamasındaydı; "2 = kapanışlar doğrulandı …" ve "1 = DURDU: kapanışlar doğrulandı …" hangi kapanışların doğrulandığını söylemiyordu (HTTP reddi değil: portal DB kapanışı ya da hesap yok + personel/dosya) | 2 / 1 okunurken mevcut oturum reddinin de doğrulandığı sanılabilirdi |
| 7b | Run'ın kurtarma adımı (`recoveryAdvice`) yalnız makbuz **yolu** var mı diye bakıp `-Mode Recover -ReceiptFile <makbuz>` öneriyordu: makbuz bellekte var ama ilk yazımı başarısızsa (`setup.durum = YARIM_MAKBUZ_DOSYASI_YAZILAMADI`, `makbuzDiskte = false`) ya da sonraki yazımlar başarısız / dosya okunamıyorsa da aynı komut yazılıyordu. Bloğun Run 5/6 metni dosyaya hiç bakmadan aynı komutu öneriyordu | uygulanamayan Recover komutu önerisi |
| 7c-1 | Tarama: `closePortal` koşucu oturumunun 200'ünü yalnız P7-C2 PASS ile ürün bulgusu sayıyordu; P7-C5 (HTTP ölçümlerinden **sonraki** DB) yargıdan sonra okunuyordu. Hesap P7-C2 ile P7-C5 arasında yeniden açılırsa (P7-C5 FAIL) "ÜRÜN BULGUSU … Recover düzeltemez" yazılıyor, portal satırı açık değerleri göstermiyordu (D-6 6a ile aynı kusur) | ölçülmemiş ürün bulgusu; açık hesap kurtarma nedeninde görünmüyordu |
| 7c-2 | Tarama: portal hesabı **yokken** (ör. yarım kurulum) Run ve Recover günlüğündeki satır "OK P7-C1 portal erişimi yetkili uçla kapatıldı" diyordu — kapatma yapılmamıştı, ölçülen yalnız "hesap yok" (kanıttaki gözlem doğruydu; satır açıklaması günlükte) | kanıtın desteklemediği kapanış ifadesi |

**Recover makbuzu nasıl okur (kaynaktan):** blok `-ReceiptFile` yolunda dosya var + JSON + `record = EXTACC-D7-SETUP-RECEIPT` + `runId` 8 hex; koşucu
`record` + `elevUserId` + `elevEmail` + `runId` eşleşmesi + DB kimlik bağı (doğrulanmazsa yazmadan çıkış 4). Run kanıtındaki `receipt` alanı koşucunun
bellekteki makbuz nesnesidir (`runnerMessageIds` dahil; parola / token içermez). Dosya yoksa ya da okunamıyorsa bu nesneden yazılan yeni bir dosya
Recover'ın iki kapısını da geçebilir — öz-testte **uçtan uca ölçüldü** (Z19-b). Makbuz hiç oluşmadıysa (kurulum yarıda) önceki metin kalır: "makbuz
YOK: Recover bu kanıtla başlatılamaz; makbuzsuz kapanış yolu bu pakette tanımlı değildir (owner/CLIENT kararı; K-7)".

### 14.2 Değişiklik

- **Koşucu (7b):** yeni `receiptFileState` (salt okuma: dosya var + JSON + kayıt türü + runId + personel alanları; bellekteki makbuzla eşitlik). Run
  adımı: makbuz kullanılabilirse komut önerilir (diskteki makbuz bellektekinden farklıysa "FARKLI" + yazma hatası); bellekte var ama dosya yok /
  okunamıyorsa komut **önerilmez**: "makbuz dosyası YOK|OKUNAMIYOR (neden · yazma hatası · setup.durum=…): bu makbuz yoluyla bloktan Recover
  BAŞLATILAMAZ … Kullanılabilir yol: bu kanıttaki `receipt` nesnesi … yeni bir JSON dosyasına yazılır ve Recover yalnız AYRI owner onayıyla
  `-ReceiptFile <o dosya>` ile başlatılır". Kanıtta yeni alan `recovery.makbuzDurumu`; `makbuzDiskte` (dosya var mı) aynen.
- **Koşucu (7c-1):** P7-C5 DB okuması oturum yargısından önce (satır sırası aynı); `productFinding` yalnız P7-C2 PASS + P7-C5 PASS; P7-C5 FAIL'de gözlem
  "ürün bulgusu adayı DEĞİL — hesap ölçüm sırasında yeniden AÇILDI (P7-C5 FAIL …)"; `recoveryAdvice` ürün bulgusu satırını yalnız P7-C2 + P7-C5 PASS
  iken yazar, portal satırı HTTP sonrası değerlerle "yeniden AÇILDI … açık erişim kapatılmalıdır" der.
- **Koşucu (7c-2):** hesap yok dalında P7-C1 açıklaması "portal hesabı YOK (DB'de ölçüldü) — kapatılacak portal erişimi yok; kapatma çağrısı
  YAPILMADI"; verdict değişmedi.
- **Blok (7a, yalnız METİN):** Recover bitiş satırı "HER KODDA: mevcut oturum reddi Recover'da ÖLÇÜLEMEZ — HER ZAMAN (P7-C4L/D; …); yeni giriş
  reddinin ölçülüp ölçülmediği kanıttaki P7-C3L/D satırlarından okunur · 0 = … · 3 = …; personel/dosya kapanışı doğrulandı · 2 = portal DB kapanışı
  (ya da portal hesabı yok) ve personel/dosya kapanışı doğrulandı, hazırlık hatası yok, en az bir satır FAIL (Recover'da yalnız P7-MSG-KEPT …) ·
  1 = DURDU: portal DB kapanışı (ya da portal hesabı yok) ve personel/dosya kapanışı doğrulandı ama hazırlık adımında hata (…) · 6 · 5 · 4 · 7 · 91".
- **Blok (7b, yalnız METİN):** yeni `Get-ReceiptFileState`; Run 5/6: makbuz okunabiliyorsa önceki öneri + "Makbuz dosyası: VAR"; değilse "MAKBUZ
  DOSYASI YOK|OKUNAMIYOR …: bu makbuzla bloktan Recover BAŞLATILAMAZ" + kanıttaki receipt yolu ya da "SOMUT ENGEL (K-7)". Recover'ın canlı yazma
  kümesini ve ikinci Recover kuralını anlatan satırlar aynen. `PkgPins` koşucu pini + `$ExpPackage`. Kapılar, sıra, Recover okuma kapısı, çıkış
  kodları değişmedi.
- **Sahte API:** `reopen normal|afterDisable` (başarılı kapatmadan sonraki ilk yerel mesaj listesi isteğinde hesap DB'de yeniden açılır).

### 14.3 Öz-testler, negatif kontroller (ölçülen)

Kanıt kökü (repo dışı): `HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\d7\` (`test\`, `neg\`, `onceki\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık
konteynerinde (`postgres:16-alpine`, loopback, 5432 dışı port, `_test` adlı veritabanı; şema `D7T_LIB_ROOT`'taki üretilmiş Prisma istemcisinin
şemasından `prisma db push`; iş sonunda kaldırıldı); `D7T_LIB_ROOT` = canlı olmayan R27 aday çalışma ağacı proje kökü; sahte API 8200 / dış 8459.
Negatif kontroller `git archive e35f6ac6` aynasında (çalışma ağacı bozulmadı).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d7-selftest.js` — **SON BAYTLAR** (koşucu `08B5CA7A…`, sahte API `387A923B…`, öz-test `8AC501B7…`, blok `75B5E8E6…`; 6 betiğin sha256'sı koşum öncesi = sonrası) | **59/59 PASS**, çıkış 0 (yeni 3: Z15-d, Z19-a, Z19-b; değişen 3: Z16-e, Z18, C-1; önceki 53 aynen) | `test\d7-selftest-son.log`, `test\son-kosum-sha.txt`; ara koşumlar `test\d7-selftest-ilk*.log` |
| `d7-owner-block-selftest.ps1` — **SON BAYTLAR** (blok `75B5E8E6…`, öz-test `A63945DE…`; belge son hâliyle) | **70/70 PASS** Windows PowerShell 5.1 · **70/70 PASS** PowerShell 7, çıkış 0 (PIN-1: 9/9, digest `97C9F56A…` = `$ExpPackage`) | `test\blok-oz-test-winps51.log`, `test\blok-oz-test-pwsh7.log` |
| **Negatif — koşucu:** R03 baytları (`e35f6ac6` aynası: koşucu `F4B9BE18…`, blok `4BAE9DE0…`, belge) + R03-c öz-test / sahte API | **53/59**, çıkış 1 — FAIL = tam olarak yeni / değişen 6 kalem (Z15-d, Z16-e, Z18, Z19-a, Z19-b, C-1). Eski davranış ölçüldü: hesap ölçüm sırasında yeniden açılmışken `productFinding` + "… Recover düzeltemez", portal satırı açık değerleri yazmıyor; makbuz yolu klasör olup yazma EISDIR ile başarısızken adım `-Mode Recover -ReceiptFile <makbuz>` öneriyor; hesap yokken günlükte "OK P7-C1 portal erişimi yetkili uçla kapatıldı". Kanıttaki `receipt` nesnesinden yazılan dosyayla Recover eski baytlarda da koştu (çıkış 3, kimlik OK) — yol koşucu değişikliğine bağlı değildir | `neg\neg-eski-kosucu.log`, `neg\neg-eski-kosucu-gozlem.txt`, `neg\ayna-kurulum.txt` (Z15-d eklenmeden önceki ara negatif: `neg\neg-eski-kosucu-ilk.log`, 53/58) |
| **Negatif — blok:** aynı ayna (R03 bloğu + R03 belgesi) + R03-c blok öz-testi | **68/70**, çıkış 1 — FAIL = **O-6**, **O-8** (iki kabukta da; PIN-1 aynada eski koşucu + eski pinle tutarlı → PASS) | `neg\neg-eski-blok-winps51.log`, `neg\neg-eski-blok-pwsh7.log` |
| Pin hesabı | 9 pin uyuşmazlık 0, digest `97C9F56A…` = `$ExpPackage` | `test\pin-dogrulama-yeni.log` |
| Ayrıştırma | iki ps1: parse hatası 0 (WinPS 5.1 ve pwsh 7); `node --check` (koşucu, sahte API, öz-test) 0 | `test\parse-iki-kabuk.log` |

Yeni / değişen ölçütler:
- **Z19-a** (yeni senaryo `guard: stale` + `reopen: afterDisable`): kapatma 201 → P7-C2 PASS; hesap ölçüm sırasında yeniden açıldı → P7-C5 FAIL; oturum
  200 → P7-C4L/D FAIL + "ürün bulgusu adayı DEĞİL — hesap ölçüm sırasında yeniden AÇILDI …"; `productFinding` yok; "Recover düzeltemez" yok; portal
  satırı HTTP sonrası değerlerle; DB'de hesap açık; çıkış 6.
- **Z19-b** (uçtan uca): gösterimden sonra makbuz yolu klasör yapılır (sonraki makbuz yazımı EISDIR); kapatma 500 → portal açık, çıkış 6; kanıtta
  `receiptWriteError` + `makbuzDurumu=OKUNAMADI`; adım komut önermez + kanıttaki `receipt` yolu; o nesne (`runnerMessageIds` dahil) değiştirilmeden
  dosyaya yazılıp Recover'a verilir → kayıt `EXTACC-D7-RECOVER`, kimlik bağı OK, disable-user çağrıldı, portal pasif + erişim kapalı, yeni giriş 401,
  P7-MSG-KEPT PASS, personel pasif, çıkış 3.
- **Z15-d** (yeni, uçtan uca): hesap yokken (Z15-a Run, Z15-r Recover) P7-C1 günlük satırı "portal hesabı YOK (DB'de ölçüldü) — kapatılacak portal
  erişimi yok; kapatma çağrısı YAPILMADI"; "kapatıldı" yok; disable-user çağrısı 0.
- **Z18 (v)** (birim; değişen Z18'in yeni kolu): `setup.durum = YARIM_MAKBUZ_DOSYASI_YAZILAMADI`, makbuz bellekte, dosya yok → komut yok, "makbuz
  dosyası YOK (dosya yok (ENOENT) · makbuz yazma hatası: … · setup.durum=YARIM_MAKBUZ_DOSYASI_YAZILAMADI): … BAŞLATILAMAZ" + kanıttaki receipt
  yolu; yol klasörse "OKUNAMIYOR (EISDIR)"; makbuz okunabiliyorsa komut önerilir; `receiptFileState` beş durum. **Z18 (ii)** (değişti): P7-C5 FAIL
  iken ürün bulgusu satırı yok, portal satırı "yeniden AÇILDI". **Z16-e** (değişti): gerçek ürün bulgusunun dayanağı "(P7-C2 PASS + P7-C5 PASS)".
  **C-1** (değişti): ürün bulgusu yalnız P7-C2 + P7-C5 PASS iken; makbuz dosyası kullanılamıyorken Run adımı komut önermez.
- **O-6** (blok, değişti): genel cümle kodlardan önce; 2 / 1 doğrulananı adlandırır; eski "2 = kapanışlar doğrulandı" / "1 = DURDU: kapanışlar
  doğrulandı" yok. **O-8** (blok, yeni): Run çıkış 5/6 metni dört makbuz durumunda (var · yok · bozuk · kanıtta da yok); ikinci Recover kuralı dördünde de.

### 14.4 Durum

- **Kapalı:** 7a, 7b (kanıtta ve blokta), 7c-1, 7c-2. **R03-d: 7c-1'in kapanışı GERİ ALINDI** (R03-c'nin "adayı DEĞİL" sınıflaması yanlıştı) ve 7a /
  7b R03-c bağımsız doğrulamasında eksik bulundu (kanıtsız 1; BOM'lu makbuz; bayat makbuz) — düzeltmeler §14.5.
- **Açık owner kararları:** K-1 … K-8 aynen. Kanıttaki `receipt` nesnesinden makbuz dosyası yazmak (7b kullanılabilir yolu) Recover'dan önceki bir
  dosya işlemidir: kim yazar ve Run kanıt dizini dışında mı yazılır — owner / CLIENT kararıdır; bu paket onu kendiliğinden yapmaz. **[R03-d'de GEÇERSİZ
  → §14.5]** — `receipt` nesnesinden yazma yolu kaldırıldı. **Güncel açık owner kararı: "`recovery.makbuzJson`'dan yazılan yeni makbuz dosyasını kim,
  nereye yazar".** Bugünkü durum (blok kaynağından, `d7-owner-live-block.ps1` Invoke-RunMode): blok Run sonunda gösterdiği TEK komutla dosyayı **Run kanıt
  dizinine** (`<kanıt dizini>\d7-setup-receipt-kanittan.json`) yazdırır; Run'ın `SHA256-MANIFEST.txt` dosyası bu komut gösterilmeden **önce** yazılır
  (`Write-Manifest`, Write-OwnerDeclaration'ın `finally` bloğu) — dolayısıyla owner komutu koştuğunda oluşan yeni makbuz dosyası Run manifestinde **yer
  almaz**. Komutu blok koşmaz; owner koşar. Makbuz hiç oluşmadıysa makbuzsuz kapanış yolu tanımlı değildir (K-7).
- **Ölçülmeyenler:** canlıda hiçbiri koşulmadı; sahte API ürünün kendisi değildir (hesabın ölçüm sırasında yeniden açılması dış müdahale taklididir).
  `YARIM_MAKBUZ_DOSYASI_YAZILAMADI` durumu uçtan uca üretilmedi (ilk makbuz yazımı başarısızsa Run kendi kapanışını koşar ve kapanış doğrulanırsa
  kurtarma gerekmez — Z12); bu durumun adım metni birim ölçümüyle (Z18 v) sınandı; uçtan uca ölçülen, sonraki yazımların başarısız olduğu durumdur
  (Z19-b). Bloğun Recover okuma kapısı kanıttaki `receipt` kopyasıyla ayrıca koşulmadı (kapı yalnız dosya + JSON + kayıt türü + runId biçimine bakar —
  kaynaktan; koşucunun kapısı ve kimlik bağı Z19-b'de koşuldu). Mevcut oturum reddi Recover'da yapısal olarak ölçülemez; Run kanıtındaki P7-C4 satırları
  tek kaynaktır.
- Bu revizyon canlı Run / Recover'ı yetkilendirmez; canlı koşum ayrı owner GO'su ister.

### 14.5 R03-d — R03-c bağımsız doğrulamasının bulguları (2026-10-04)

Kapsam: owner ölçütü — kapanış veya Recover hakkında kanıtın desteklemediği ifade YOK; Recover'da ölçülemeyen mevcut oturum reddi açık; makbuz
yazılamadığında uygulanamayan Recover komutu YOK, gerçekten kullanılabilir yol ya da somut engel. Bulgular önce **kaynakta doğrulandı** (R03-c yerel ucu
`0692b678`; ürün kaynağı `HY_WT_R27` salt okuma), sonra D-6 R03-d ile aynı ilkeyle dar düzeltildi. Canlı Run/Recover **koşulmadı**, owner bloğu
**çalıştırılmadı** (yalnız blok öz-testi). Çıkış kodu fonksiyonları ve öncelik **değişmedi**; kanıttaki `revision` `R03` kalır.

**Önceki turun hatası (açıkça):** R03-c §14.2 / §14.3'teki "P7-C2 PASS + P7-C5 FAIL (hesap ölçüm sırasında yeniden açıldı) iken koşucu oturumunun
200'ü **ürün bulgusu adayı DEĞİL**" sınıflaması ve Z19-a beklentisi **yanlıştı**. Kaynak (`HY_WT_R27`): `portal-auth.guard.ts` 66-68 — claim sürümü DB
sürümünden farklı eski token `isActive`'ten **bağımsız** reddedilir (pasif hesap da 58-60'ta); `portal.service.ts` 307-316 — yeniden açma
`tokenVersion`'ı **artırır** (kapatma da 763-769'da). Hesap ürün yoluyla yeniden açılsa bile eski oturumun reddedilmesi beklenir; 200 bir oturum iptali
**ürün bulgusu adayıdır**. R03-c sahte API'si yeniden açmada sürümü değiştirmediği için hata öz-testte görünmedi.

| No | Bulgu | Kaynakta doğrulama (0692b678) | Düzeltme |
|---|---|---|---|
| M1 | P7-C2 PASS + P7-C5 FAIL iken 200 → "adayı DEĞİL", productFinding / "Recover düzeltemez" düşüyor | `closePortal` `if (flags)` dalı sürüme bakmıyor; sahte API `reopen` sürümü değiştirmiyor — **doğrulandı** | **[R03-e'de değişti → §14.6: kural yalnız bu dalda kalmıştı; artık her 200 tek karar tablosundan; "adayı DEĞİL" dalı kaldırıldı]** D-6 ile aynı `sessionClassDuringChange` (metin "mesaj ucuna"): sürüm farkı → "ÜRÜN BULGUSU ADAYI — eski oturum sürüm reddine rağmen erişti" (`productFinding`, "oturum reddi ürün tarafıdır, Recover düzeltemez", `sessionVersion.sinif=ADAY`) + AYRI "yeniden AÇILDI (P7-C5 FAIL …): açık erişim kapatılmalıdır (Recover kapatabilir)"; eşit + hesap açık → "adayı DEĞİL"; eşit + pasif → ADAY; bilinmiyor → "ayrıştırılamadı (ÖLÇÜLEMEDİ)". Blok ADAY'ı "ADAYIDIR (CLIENT doğrular)" gösterir. Sahte API `afterDisable` sürümü artırır, `afterDisableRevert` geri döndürür |
| M2 (minör) | Blok Recover 1'i "… doğrulandı" diye açıklıyor; kanıtsız 1 mümkün | blok satırı yalnız "kanıt dosyası yoksa … bitmiş olabilir" diye çekince taşıyordu, kanıtı ölçmüyordu — **doğrulandı**; R03-d koşucusunda kanıtsız 1 **ölçüldü** (`dogrulama-ortak\crash-probe\crash-probe.log`) | `Get-RecoverEvidenceState` (dosya + `EXTACC-D7-RECOVER` + `exitCode` = süreç kodu); değilse kırmızı "KAPANIŞ DOĞRULANMADI — kanıt yok; koşucu yakalanmamış hatayla bitti, hiçbir kapanış ölçülmedi" / "… EŞİT DEĞİL"; kod açıklamaları yalnız okunabilir kanıt varken; çekince cümlesi kaldırıldı |
| m3 | 3 "portal DB kapanışı ölçüldü" (P7-C2V ÖLÇÜLEMEYEN olabilir) | `portalDbClosed` C2V için yalnız "FAIL değil" — **doğrulandı** | "3 = FAIL yok, en az bir ölçüt ÖLÇÜLEMEYEN — P7-C2 / P7-C5 ölçüldü; P7-C2V FAIL değil (ÖLÇÜLEMEYEN olabilir — kanıttaki satır) ya da portal hesabı yok …"; 2 / 1 "3'teki portal ölçütleri" |
| m4 | "receipt nesnesini yeni JSON dosyasına yazın" kullanılamıyor (BOM; PS 7 tarih dönüşümü; 5.1 derinlik) | koşucu Recover okuması BOM atmıyor — **doğrulandı**; PS 7 `receipt.createdAt` → DateTime **ölçüldü** (O-9) | `readReceiptForRecover` (BOM atılır, tek kaynak); Run kanıtı `recovery.makbuzJson` = `JSON.stringify(receipt, null, 1)`; adım ve blok TEK komut: `(Get-Content -Raw -Encoding UTF8 -LiteralPath '<kanıt>' \| ConvertFrom-Json).recovery.makbuzJson \| Set-Content -Encoding UTF8 -NoNewline -LiteralPath '<kanıt dizini>\d7-setup-receipt-kanittan.json'` + AYRI owner onayıyla `-Mode Recover -ReceiptFile '<o dosya>'` (gerekçe: dizge taşımak gidiş-dönüş dönüşümlerini dışlar) |
| m5 | (D-6'ya özgü) | D-7'de yabancı satır temizliği ve "temizlendi" açıklaması **yok** (kaynak taraması) | — |
| m6 | `makbuzDiskte` `existsSync` → klasörde true | **doğrulandı** (negatifte ölçüldü); `setup.makbuzDosyasi` da `existsSync` | ikisi de `statSync().isFile()` (setup'ta ENOENT → false, başka hata → null) |
| m7 | Bayat makbuzda blok "VAR" deyip öneriyor | **doğrulandı** (bayat makbuz runnerMessageIds'i içermeyebilir → P7-MSG-KEPT eksik sayım) | koşucu: bayatta öneri yok + TEK komut ("farklı alan(lar): runnerMessageIds …"); blok: makbuzJson metin eşitliği, eşit değilse "BAYAT … ÖNERİLMEZ" + TEK komut |

**Öz-testler ve negatif kontroller (ölçülen).** Kanıt kökü `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\r2\` (`d7\test\`,
`d7\neg\`, `dogrulama-ortak\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık konteynerinde (`postgres:16-alpine`, loopback, yüksek port, `_test`
adlı veritabanı; şema `HY_WT_R27` `apps/api/prisma/schema.prisma` kopyasından `prisma db push --skip-generate`; iş sonunda kaldırıldı);
`D7T_LIB_ROOT` = `HY_WT_R27\project`; ortak ağır koşu kilidi alındı / bırakıldı; koşumdan önce kullanılabilir commit ölçüldü (≥ 4 GB).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d7-selftest.js` — son baytlar | **63/63 PASS**, çıkış 0 (yeni 4: Z20-a..d; değişen 4: Z18, Z19-a, Z19-b, C-1; S-1 PASS) | `d7\test\d7-selftest-son.log` (+ `.sha-once` / `.sha-sonra`) |
| `d7-owner-block-selftest.ps1` — son baytlar (belge son hâliyle) | **72/72 PASS** Windows PowerShell 5.1 · **72/72 PASS** PowerShell 7 (PIN-1 9/9, digest = `$ExpPackage`) | `d7\test\blok-oz-test-son-winps51.log`, `d7\test\blok-oz-test-son-pwsh7.log` |
| **Negatif — koşucu:** `0692b678` aynası + R03-d öz-test / sahte API | **55/63**, çıkış 1 — FAIL = tam olarak Z18, Z19-a, Z19-b, Z20-a, Z20-b, Z20-c, Z20-d, C-1. Eski davranış ölçüldü: yeniden açılan hesapta (sürüm 1→2) "adayı DEĞİL"; sürüm geri dönüşünde de aynı; makbuz okunamazken TEK komut yok; bayat makbuzda `-ReceiptFile <makbuz>`; klasörde `makbuzDiskte=true`; Run kanıtlarında `recovery.makbuzJson` yok | `d7\neg\neg-eski-kosucu.log`, `d7\neg\neg-eski-gozlem.txt`, `d7\neg\ayna-kurulum.txt` |
| **Negatif — blok:** aynı ayna + R03-d blok öz-testi | iki kabukta **68/72**, çıkış 1 — FAIL = tam olarak O-6, O-8, O-9, O-10 | `d7\neg\neg-eski-blok-winps51.log`, `d7\neg\neg-eski-blok-pwsh7.log` |
| Pin · ayrıştırma | 9 pin uyuşmazlık 0, digest `1E046F24…` = `$ExpPackage`; iki ps1 parse hatası 0 (iki kabuk), `node --check` 0, iki ps1 UTF-8 BOM | `d7\test\pin-dogrulama-son.log`, `d7\test\parse-iki-kabuk.log` |

Yeni / değişen ölçütler: **Z19-a** (guard kusur taklidi + yeniden açma → ADAY + ayrı satır; "adayı DEĞİL" / "SAYILMADI" yok) · **Z20-a** (guard normal →
401, P7-C4 PASS) · **Z20-b** (sürüm geri dönüşü → "adayı DEĞİL") · **Z20-c** (sınıflama + kurtarma nedeni birim) · **Z20-d** (bayat makbuz; klasör
`makbuzDiskte=false`; BOM'lu makbuz) · **Z18 (v)** (TEK komut metni) · **Z19-b** (komut WinPS 5.1 ve PS 7 ile **gerçekten** koşuldu: 5.1 BOM'lu, 7
BOM'suz, ikisi `makbuzJson`'a birebir, koşucu kapısı ok; iki Recover kimlik bağı OK, P7-MSG-KEPT makbuzdaki koşucu id'leriyle PASS, çıkış 3) · **C-1**
(ürün bulgusu yalnız P7-C2 + P7-C5 PASS ya da ADAY; Run kanıtında `makbuzJson` birebir; bayatta komut yok) · **O-6** (3 metni + "1 + kanıt yok" + "kod
farklı") · **O-8** (bayat + TEK komut somut yollarla) · **O-9** (bloğun gösterdiği TEK komut iki kabukta; bloğun ve GERÇEK koşucunun Recover kapısı) ·
**O-10** (ADAY gösterimi).

**Ölçülmeyenler / sınır:** canlıda hiçbiri koşulmadı. Sahte API ürün değildir (yeniden açma bir dış müdahale taklididir); ADAY bir **aday**dır (kaynak +
sahte API); canlı guard'ın 200 verdiği bir durum gözlenmedi. "Sürüm eşit ama hesap pasif → ADAY" dalı yalnız birim ölçümüyle (Z20-c). Gerçek bir
makbuz yazma hatası izin / disk ile uçtan uca koşulmadı (Z19-b: yol klasör → EISDIR; bayatlık birim ile). Blok Recover'ının koşucuyu gerçek veriyle
çağırması ölçülmedi (blok öz-testinde koşucu sahte, kapı fonksiyonu gerçek; koşucu tarafı Z19-b'de gerçek DB ile). `-ReceiptFile` için yazılan yeni
dosyanın kim tarafından ve nereye yazılacağı owner / CLIENT kararıdır. Bu revizyon canlı Run / Recover'ı yetkilendirmez.

### 14.6 R03-e — R03-d iki bağımsız doğrulamasının bulguları (2026-10-04)

Kapsam: owner ölçütü **iki yönlüdür** — kanıtın desteklemediği BAŞARI iddiası da, kanıtın desteklemediği "ürün bulgusu DEĞİL / SAYILMADI" iddiası da
yazılmaz; ölçülmeyen "ölçülmedi / ayrıştırılamadı" diye yazılır. Bulgular önce **kaynakta doğrulandı** (R03-d yerel ucu `74bcbd22`; ürün kaynağı
`HY_WT_R27` @ `1b758d29`, salt okuma), sonra D-6 R03-e (D-6 paketi §13.6) ile aynı ilkeyle dar düzeltildi. Canlı Run/Recover **koşulmadı**, owner bloğu
**çalıştırılmadı** (yalnız blok öz-testi). Çıkış kodu fonksiyonları ve öncelik **değişmedi**; kanıttaki `revision` `R03` kalır.

**B1 (major) — kaynakta doğrulama.** `74bcbd22` koşucusunda `closePortal` → `judgeSession` üç dallıydı: `flags && c5ok` → kesin bulgu; `flags` (P7-C2
PASS) → R03-d sürüm kuralı; **aksi halde** (P7-C2 FAIL) `sessionWhileOpen` + "portal hesabı DB'de hâlâ AÇIK … — kapatma YAPILMADI; oturumun erişmesi bu
durumda ürün bulgusu SAYILMADI" — sürüme ve kapatma çağrısının 2xx olup olmadığına **bakmadan**; `recoveryAdvice`'ın aday koşulu yalnız `P7-C2 PASS && P7-C5
FAIL` idi — **doğrulandı**. Ürün yoluyla erişilebilir: `portal.service.ts:564-598` `changePassword` sürümü artırır, `isActive`'e dokunmaz; kapatma 403
dönerse hesap açık kalır ve sürüm verilme sürümünden büyüktür → guard (`portal-auth.guard.ts:66-68`) eski oturumu reddetmeliydi → 200 **ADAY**. Negatif
kontrolde eski baytlarda ölçüldü: Z21-c (sürüm 0→1, kapatma 403) → "ürün bulgusu SAYILMADI"; Z21-g (kapatma 201, yalnız `isActive=false`) → "kapatma
YAPILMADI" + "SAYILMADI".

**Düzeltme — tek sınıflama (`sessionClass200`, saf fonksiyon; D-6 ile aynı kod, uç metni "mesaj ucuna").** Koşucu oturumunun **her** HTTP 200 yanıtı
(P7-C2 PASS ya da FAIL) bu fonksiyondan geçer. Girdiler: `b` = oturumun verildiği sürüm (token claim'i; okunamazsa girişten önce okunan s1), `st1` = HTTP
ölçümlerinden **önce** DB (P7-C2 okuması: satır var mı, `isActive`, `hasPortalAccess`, `tokenVersion`), `st2` = HTTP ölçümlerinden **sonra** DB (P7-C5
okuması). `a` = st1 sürümü, `c` = st2 sürümü; "pasif" = `isActive ≠ true` (guard ölçütü).

| Hücre | Koşul | Sınıf | Metin özü (kanıtta ölçülen değerlerle) |
|---|---|---|---|
| B | st1 ve st2 kapalı (isActive=false + hasPortalAccess=false), c = a | BULGU | R03-c kuralı (P7-C2 PASS + P7-C5 PASS) aynen; verilme sürümünden bağımsız (guard pasif hesabı reddeder) |
| T0 | b bilinmiyor | AYRISTIRILAMADI | "oturumun verildiği sürüm bilinmiyor" **[R03-f düzeltmesi → §14.7:** bu hücrede önceden yazan "Run'da claim ya da s1 her zaman vardır; yalnız birim ölçümde oluşur" cümlesi YANLIŞTI — Run'da token claim'i geçersizse (tam sayı ≥ 0 değil) verilme sürümü bilinmez ve s1'e düşülmez; ürünün imzaladığı token'da claim her zaman DB'deki tam sayıdır (`portal.service.ts:443`), bu yüzden canlıda pratikte beklenmez. R03-f'de geçersiz claim T0 değil **TG (ADAY)**; T0 artık b'den bağımsız T1 / TG / T3 hücrelerinden SONRA değerlendirilir.**]** |
| T1 | st1 satırı YOK | ADAY | "hesap satırı HTTP ölçümlerinden ÖNCE DB'de YOK — guard satır yokken reddeder"; "sürüm null" YAZILMAZ |
| T1s | st1 var, st2 satırı YOK | a > b ya da (a = b, st1 pasif) → ADAY · (a = b, st1 açık) ya da a < b → AYRISTIRILAMADI | satırın HTTP'den SONRA silindiği açıkça yazılır |
| TA | c < a (sürüm ölçüm aralığında AZALDI — "sürüm geri dönüşü") | AYRISTIRILAMADI | "ürün yazıcıları yalnız artırır; ürün dışı yazım ölçüldü, istek anındaki sürüm ölçülmedi" |
| TI | c = a ama isActive aralıkta değişti | AYRISTIRILAMADI | "sürüm artmadan yeniden açma / kapatma: ürün dışı; istek anındaki isActive ölçülmedi" **[R03-f'de değişti → §14.7:** TI yalnız a = b = c; a = c ≠ b → T2 ADAY.**]** |
| T2 | b < a ya da b > c | ADAY | "eski oturum sürüm reddine rağmen erişti — verilme b, HTTP öncesi a, sonrası c; ürün yazıcıları yalnız artırdığından istek anında da farklıydı" |
| T2a | a < b ≤ c | AYRISTIRILAMADI | "HTTP öncesi sürüm verilmenin ALTINDA (ürün dışı azaltma); istek anında eşit olabilir" |
| T3 | a = b = c, st1 ve st2 pasif | ADAY | "pasif hesap reddine rağmen erişti" **[R03-f'de değişti → §14.7:** koşul c = a, st1 ve st2 pasif — b'den ve hasPortalAccess'ten bağımsız; T0'dan önce.**]** |
| T4 | a = b < c, st1 pasif | ADAY | "istek artıştan önceyse pasiflik, sonraysa sürüm reddi; ret nedeni ayrıştırılamadı (pasiflik ya da sürüm)" |
| T5 | a = b = c, st1 ve st2 açık | **SAYILMADI** | "kapatma DB'ye yansımadı — hesap önce ve sonra açık, sürüm verilme sürümüyle aynı; guard kabul eder → 200 beklenir; ürün bulgusu değil (guard'ın satır kimliği ve tenant yaşam döngüsü koşulları ÖLÇÜLMEDİ …)" — "ürün bulgusu değil" **yalnız bu hücrede** **[R03-f'de değişti → §14.7:** metin "hesap aktif kaldı (isActive=true …) ve sürüm verilme sürümüyle aynı; guard hasPortalAccess okumaz; 200 beklenir — ürün bulgusu değil (satır kimliği ve tenant yaşam döngüsü ölçülmedi …)"; "kapatma DB'ye yansımadı" kaldırıldı.**]** |
| T6 | a = b < c, st1 açık | AYRISTIRILAMADI | "sürüm istek sırasında değişti; istek anındaki sürüm ölçülmedi" |

**Varsayım (metinde ve kodda açık).** Ürünün `ClientPortalUser.tokenVersion` yazıcıları **yalnız artırır**: `portal.service.ts` :315 (yeniden açma),
:587 (changePassword), :724 (resetPassword), :769 (disable) — dördü de `increment: 1` (bu turda grep ile yeniden doğrulandı; ClientPortalUser'a başka
yazım yalnız :307 (aynı yeniden açma), :345 (yeni satır — yalnız satır yokken), :429 (loginCount), :628 (resetToken); ham SQL yok). `isActive`'i
değiştiren iki yazım (:307-317, :765-770) aynı yazımda sürümü artırır; satırı silen ürün yolu yalnız Client cascade'dir; create-user mevcut satırı **aynı
id** ile yeniden açar (:289-317). Bu varsayım yalnız st1–st2 aralığına uygulanır; aralıkta ölçümle çiğnendiyse (TA, TI) sınıf AYRISTIRILAMADI. **İstek
anındaki DB durumu ÖLÇÜLMEDİ** (koşucu yalnız HTTP'den önce ve sonra okur).

**Görev tablosuna karşı kaynak denetimi — farklı hücreler ve gerekçe** (D-6 §13.6 ile aynı): (1) "st2 satırı YOK → ADAY" yarısı: st1 açık ve a = b iken
satır HTTP'den **sonra** silinmişse istek anında satır açık ve aynı sürümde olabilir → ADAY kanıtla desteklenmez → **T1s'de AYRISTIRILAMADI**. (2) "st1.v ≠
b → ADAY": a < b iken ürün artışları istek anında sürümü b'ye getirebilir → yalnız b ∉ [a, c] iken ADAY (T2), a < b ≤ c → **T2a AYRISTIRILAMADI**. (3) Görev
tablosunda olmayan durum: st1 açık, st2 pasif, a = b = c (sürüm artmadan kapatma — ürün dışı) → **TI**; görevdeki T4'ün "st2 açık ve st2.v = b (ürün dışı
yeniden açma)" hücresi de TI'dır. (4) B: R03-c'nin P7-C2 PASS + P7-C5 PASS kuralı **korundu**, T0'dan önce. (5) Guard `hasPortalAccess`'i **okumaz**
(`portal-auth.guard.ts:47-60`): T5'te "açık" = `isActive=true`; açık **portal erişimi** (isActive ya da hasPortalAccess) ayrı satırdadır.

**R03-d'nin "sürüm geri dönüşü → adayı DEĞİL" dalı neden kaldırıldı.** st1 kapalı (a = b + 1), st2 açık (c = b): sürüm ölçüm aralığında **azaldı** —
ürün yazıcıları yalnız artırdığından bu bir ürün dışı yazımdır ve istek bu yazımdan önce de sonra da olabilir (önce: sürüm b+1 ≠ b → ret beklenirdi;
sonra: açık + sürüm b → kabul). Ne "DEĞİL" ne "ADAY" kanıtla desteklenir → **TA AYRISTIRILAMADI**. Görevin önerdiği T2 (ADAY) da seçilmedi: T2'nin
gerekçesi ("ürün yazıcıları yalnız artırdığından istek anında da farklıydı") aralıkta azalma **ölçülmüşken** geçerli değildir.

**Diğer değişiklikler (koşucu; D-6 ile aynı).** (i) Kapatma metni ölçülene bağlı (`portalClose.closeText`): "kapatma YAPILMADI (2xx kapatma çağrısı yok)
— DB'de AÇIK (isActive=… hasPortalAccess=… sürüm a→b)" **yalnız** 2xx kapatma çağrısı yokken; 2xx varken "kapatma çağrısı 2xx döndü ama DB'de AÇIK /
kapanış TAMAMLANMADI (…)" ya da "… ama kapatmadan sonra hesap satırı DB'de YOK"; "hâlâ" kaldırıldı. (ii) ADAY her hücrede: `productFinding` ("… oturum
reddi ürün tarafıdır, Recover düzeltemez" — açık-erişim metnini **içermez**) + `sessionVersion` {sinif, hucre, verilen, verilenKaynak, httpOncesi,
olcumSonrasi}; `recoveryAdvice`'ın aday koşulu tabloyu kullanır. (iii) Hesap HTTP ölçümlerinden sonra açıksa **AYRI** `portalClose.acikErisim` = "portal
hesabı açık (…) — açık erişim kapatılmalıdır (Recover kapatabilir)"; kurtarma nedeninde portal ERİŞİM satırı oturum satırından ayrıdır; Recover modunda
"(Recover kapatabilir)" **yazılmaz**. **[R03-f'de değişti → §14.7:** "portal hesabı açık" ve "(Recover kapatabilir)" kaldırıldı — durum ölçülenle ("portal
hesabı AKTİF (…)" / "portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (…)"), Run'daki Recover metni kapatma çağrılarına bağlı.**]**
(iv) AYRISTIRILAMADI ve SAYILMADI da kendi oturum satırını yazar. (v) **Verilme sürümü:** portal token'ının payload'ı
**İMZASIZ** decode edilir (token kanıta / günlüğe yazılmaz); claim esas, yoksa guard kuralıyla 0, geçersizse bilinmiyor (T0), token JWT değilse s1
**[R03-f/g'de değişti:** claim geçersizse sınıflamada **TG** (ADAY; R03-f, §14.7); token JWT olarak okunamazsa verilme sürümü yine s1 (P7-C2V referansı) ama
sınıflamada **TJ** (ADAY; R03-g, §14.8) — ikisi de T0'a / T5'e ulaşmaz.**]**;
kanıtta `issuedVersion`; makbuzdaki `portalIssuedTokenVersion` esas değere güncellenir + `portalIssuedTokenVersionKaynak`. **Blok:** Run sonu ekranında
`portalClose.acikErisim` ürün bulgusu satırından AYRI "PORTAL ERİŞİMİ: …" satırında (yalnız gösterim).

**B3 (not; kapsam dışı — kod DEĞİŞTİRİLMEDİ; ölçülmeyen / açık).** Guard kendi hata yollarını 401'e çevirir (`portal-auth.guard.ts:87-89`); bu yüzden
**yerel** API'den P7-C4L için gelen 5xx guard'ın kendisinden gelmez — guard geçilmiş olabilir. Koşucu: 503 / 429 → ÖLÇÜLEMEYEN; diğer 5xx → P7-C4 FAIL
+ çıkış 6, ama ADAY **sınıflamaz** (`sessionVersion` yazılmaz). 5xx'in guard'dan sonra mı yoksa guard'dan önceki bir katmanda mı üretildiği **ölçülmedi**;
dış (DIŞ HTTPS) 5xx kenar katmanından da gelebilir. 5xx'in aday sayılıp sayılmayacağı açık kalır.

**Öz-testler ve negatif kontroller (ölçülen).** Kanıt kökü `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\r3\` (`d7\test\`,
`d7\neg\`, `dogrulama-ortak\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık konteynerinde (`postgres:16-alpine`, adında `test`, loopback yüksek port,
`_test` adlı veritabanı; şema `HY_WT_R27` `apps/api/prisma/schema.prisma` **kopyasından** `prisma db push --skip-generate`; iş sonunda yalnız o konteyner
kaldırıldı); `D7T_LIB_ROOT` = `HY_WT_R27\project`; ortak ağır koşu kilidi her koşumda alındı / bırakıldı; her koşumdan önce FreeVirtualMemory ölçüldü
(≥ 4 GB; `dogrulama-ortak\bellek-olcum.txt`).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d7-selftest.js` — son baytlar (koşucu `EE3704A4…`, sahte API `1982837C…`, öz-test `FCEBE8D0…`, blok `A2641879…`) | **76/76 PASS**, çıkış 0 (yeni 13: Z21-a..l, T-11; değişen 9: Z16-b, Z16-c, Z16-d, Z16-f, Z18, Z19-a, Z20-b, Z20-c, C-1; S-1 PASS) | `d7\test\d7-selftest-son.log` (+ `.sha-once` / `.sha-sonra`); blok pini güncellenmeden önceki aynı öz-test baytlarıyla koşum `d7-selftest-ilk1.log` (76/76) |
| `d7-owner-block-selftest.ps1` — son baytlar (blok `A2641879…`, öz-test `50C375F6…`) | **73/73 PASS** Windows PowerShell 5.1 · **73/73 PASS** PowerShell 7 (PIN-1 9/9, digest `0AED0591…` = `$ExpPackage`; O-11 yeni) | `d7\test\blok-oz-test-son-winps51.log`, `d7\test\blok-oz-test-son-pwsh7.log`; belge §14.6 / §7 / §14.4 güncellendikten sonra yeniden (G-2 belgenin §8'ini okur; §8 değişmedi): iki kabukta 73/73, `d7\test\blok-oz-test-son-belgeli-*.log` |
| **Negatif — koşucu:** `git archive 74bcbd22` aynası (koşucu `27BFE5CE…`, blok `9B409218…`) + R03-e öz-test / sahte API | **54/76**, çıkış 1 — FAIL = tam olarak Z16-b, Z16-c, Z16-d, Z16-f, Z18, Z19-a, Z20-b, Z20-c, Z21-a, Z21-b, Z21-c, Z21-d, Z21-e, Z21-f, Z21-g, Z21-h, Z21-i, Z21-j, Z21-k, Z21-l, C-1, T-11 (22 = yeni 13 + değişen 9). Eski davranış ölçüldü: açıkken sürüm artmış + kapatma 403 → "hâlâ AÇIK … ürün bulgusu SAYILMADI"; 2xx kapatmada "kapatma YAPILMADI"; sürüm geri dönüşünde "adayı DEĞİL"; C-1'de "SAYILMADI" T5 olmadan ve kesin bulgu sınıfsız | `d7\neg\neg-eski-kosucu.log`, `d7\neg\neg-eski-gozlem.txt`, `d7\neg\ayna-kurulum.txt` |
| **Negatif — blok:** aynı ayna + R03-e blok öz-testi | iki kabukta **72/73**, çıkış 1 — FAIL = yalnız **O-11** (PIN-1 aynada eski koşucu + eski pinle tutarlı → PASS) | `d7\neg\neg-eski-blok-winps51.log`, `d7\neg\neg-eski-blok-pwsh7.log` |
| Pin · ayrıştırma | 9 pin uyuşmazlık 0, digest `0AED0591…` = `$ExpPackage`; iki ps1 parse hatası 0 (WinPS 5.1 ve PS 7), `node --check` (koşucu, sahte API, öz-test) 0, iki ps1 UTF-8 BOM'lu | `d7\test\pin-dogrulama-son.log`, `d7\test\parse-iki-kabuk-son.log` |

Yeni / değişen ölçütler: **Z21-a** (karar tablosu, 18 girdi, 12 hücre; metin beklentileri; "ürün bulgusu değil" yalnız T5; "DEĞİL" yok; satır yokken
"sürüm null" yok) · **Z21-b** (claim decode) · **Z21-c/d** T2 (açıkken sürüm +1 + kapatma 403; guard kusur taklidi → ADAY + ayrı satırlar · guard normal →
401) · **Z21-e/f** T1 (satır silme) · **Z21-g/h** T3 (sürüm artmadan pasif; 2xx kapatma metni) · **Z21-i/j** TI (sürüm artmadan yeniden açma) · **Z21-k**
claim ≠ s1 · **Z21-l** claim okunamaz → s1 · **T-11** statik · **Z16-b, Z16-c, Z16-d, Z16-f** (T5 metni + ölçülen kapatma metni) · **Z18 (i)** ("hâlâ" /
koşulsuz "SAYILMADI" yok) · **Z19-a** (T2 + hücre) · **Z20-b** (TA) · **Z20-c** (kurtarma nedeni sınıflara göre; Recover'da "(Recover kapatabilir)" yok) ·
**C-1** (ürün bulgusu: BULGU + P7-C2/C5 PASS ya da ADAY — P7-C2 FAIL dalı dahil; "SAYILMADI" yalnız T5) · **O-11** (blok: ayrı "PORTAL ERİŞİMİ:" satırı).

**Ölçülmeyenler / sınır.** Canlıda hiçbiri koşulmadı. Sahte API ürün değildir: "Şifre Değiştir" (sürüm +1), satır silme, sürüm artmadan pasif / yeniden
açma ve sürüm geri dönüşü dış müdahale ya da kusur **taklitleridir**. ADAY bir **aday**dır (kaynaktan çıkarım + sahte API ölçümü); canlı guard'ın 200
verdiği bir durum gözlenmedi. Claim decode gerçek ürün JWT'sinde ölçülmedi (sahte API ürünün claim adlarıyla üç parçalı token üretir). T0, T1s, T2a, T4,
T6 hücreleri ve "T5 + hasPortalAccess=false" yalnız birim ölçümüyle (Z21-a) sınandı. Guard'ın satır kimliği ve tenant yaşam döngüsü koşulları koşumda
ölçülmez (T5 metninde yazılı). Recover'da mevcut oturum reddi (P7-C4) **her zaman** ölçülemez (değişmedi). B3 açık. `recovery.makbuzJson`'dan yazılan
yeni makbuz dosyasını kim, nereye yazar — açık owner kararı (§14.4). Bu revizyon canlı Run / Recover'ı yetkilendirmez.

### 14.7 R03-f — R03-e iki bağımsız doğrulamasının MINOR bulguları (2026-10-04)

Kapsam: iki doğrulamada blocker / major yoktu; MINOR bulgular D-6 R03-f ile aynı ilkeyle dar kapatıldı (D-6 belgesi §13.7). Owner ölçütü **iki yönlüdür**
— kanıtın desteklemediği başarı / yetenek iddiası da, kanıtsız "bulgu değil" de yazılmaz. Her madde önce **kaynakta doğrulandı** (R03-e yerel ucu
`68cfae80`; ürün kaynağı `HY_WT_R27` @ `1b758d29`, salt okuma), sonra eski baytlarda negatif kontrolle ölçüldü. Karar tablosunun F4 / F5 dışındaki
hücreleri **değişmedi**. Canlı Run / Recover **koşulmadı**, owner bloğu **çalıştırılmadı** (yalnız blok öz-testi). Çıkış kodu fonksiyonları ve öncelik
**değişmedi**; kanıttaki `revision` `R03` kalır.

| Madde | Kaynakta (`68cfae80`) — doğrulama | Düzeltme (R03-f) |
|---|---|---|
| F1 | P7-C1 PASS koşulu `disabledNow ∨ (hesap zaten kapalı) ∨ flags`; açıklama sabit "portal erişimi YETKİLİ uçla kapatıldı (admin/disable-user) ya da zaten kapalıydı"; 2xx dönüp DB açık kaldığında (Z21-g: yalnız `isActive=false`, bayrak açık, P7-C2 FAIL) da "kapatıldı"; kimlik reddi ve geç oluşma satırları da aynı açıklamayı taşıyordu — **doğrulandı** (eski baytlarda Z22-c: 43 P7-C1 satırının 39'unda "kapatıldı") | `C1_DESC` = "kapatma çağrısı yetkili uçta 2xx döndü (admin/disable-user) ya da hesap zaten kapalıydı ya da 2xx olmadan kapatma adımından sonra DB'de kapalı görüldü — DB kapanışı P7-C2 / P7-C5 satırlarında" (üç yol); gözlem `· dayanak=…`. **Görev metninden sapma:** üçüncü yol ("2xx olmadan DB'de kapalı görüldü") PASS koşulunda (`flags`) olduğundan açıklamaya eklendi; yazılmasaydı açıklama o dalda kanıtsız olurdu |
| F2 | `acikErisim` ve kurtarma nedeni son eki Run'da sabit "açık erişim kapatılmalıdır (Recover kapatabilir)"; Recover aynı makbuz personeliyle aynı `disable-user` ucunu çağırır — Run'da 401/403 reddinde Recover'ın kapatabildiği **ölçülmemiştir** — **doğrulandı** (eski baytlarda Z22-d: açık erişimli kanıtlarda "Recover kapatabilir") | `recoverCloseText(disableCalls)`: son kapatma çağrısı `HTTP 401` / `HTTP 403` → "Recover aynı personel kimliğiyle kapatmayı yeniden dener; Run'da kapatma HTTP <kod> ile reddedildi — Recover'ın kapatabildiği ÖLÇÜLMEDİ (personel yetkisi düzelmeden Recover da reddedilebilir)"; aksi halde "Recover kapatmayı yeniden dener (sonuç Recover kanıtında ölçülür)". Recover modu metni değişmedi |
| F3 | Pasif + bayrak açık için "portal hesabı açık"; yalnız bayrak yeniden açıldığında "hesap ölçüm sırasında yeniden AÇILDI"; T5 "kapatma DB'ye yansımadı" (kapatma çağrısı 403 ile hiç 2xx dönmemiş olabilir) — **doğrulandı** (eski baytlarda Z22-e) | "portal hesabı AKTİF (…)" / "portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (…)"; "yeniden AÇILDI" yalnız `isActive` false→true ölçülmüşken, yalnız bayrak açıldıysa "erişim bayrağı ölçüm sırasında yeniden açıldı (hesap pasif; …)"; T5 "hesap aktif kaldı (…); guard hasPortalAccess okumaz (…); 200 beklenir — ürün bulgusu değil (satır kimliği ve tenant yaşam döngüsü ölçülmedi …)" |
| F4 | TI T2'den önce değerlendiriliyor, a = c ≠ b iken ADAY'ı bastırıyordu — **doğrulandı** (eski baytlarda Z21-i: `AYRISTIRILAMADI/TI`) | TI yalnız a = b = c; a = c ≠ b → **T2 ADAY** ("sürüm iki uçta verilme sürümünden farklı; ölçülen ürün dışı yazım … sürüme dokunmadı (aralıkta sürüm değişimi ölçülmedi — varsayım: ürün yazıcıları yalnız artırır) …") |
| F5 | T0 b'den bağımsız ADAY hücrelerinden önce; geçersiz claim'de T0 — guard bu oturumu her istekte DB'den önce reddeder (`portal-auth.guard.ts:42-45`) — **doğrulandı** (eski baytlarda Z22-a: `AYRISTIRILAMADI/T0`; Z21-a: T1 / TG / T3 girdileri b bilinmiyorken T0). §14.6'daki "Run'da claim ya da s1 her zaman vardır" cümlesi yanlıştı (T0 satırında işaretlendi) | Sıra B → **T1** → **TG** (yeni: claim geçersiz → ADAY) → **T3** (st1 ve st2 pasif, sürüm iki uçta aynı; b'den ve `hasPortalAccess`'ten bağımsız) → T0 → T1s → TA → TI → T2 → T2a → T5 → T4 → T6; Run `issuedClaimInvalid` verir; `sessionClass200(issued, st1, st2, claimInvalid)` |
| F6 | Bloktaki ADAY gösterim yorumu R03-d'den kalmaydı ("P7-C2 PASS + P7-C5 FAIL iken sürüm sınıflaması"); "PORTAL ERİŞİMİ:" yorumu Recover'ın kapatabileceğini söylüyordu — **doğrulandı** (eski baytlarda O-12) | Yalnız yorum; gösterilen metin, kapılar, sıra, çıkış kodları değişmedi |

**Sahte API (ürün değil).** `portalToken badClaim` → `tokenVersion` claim'i `-1`; guard NORMAL taklidi ürün gibi geçersiz claim'i DB'ye bakmadan reddeder;
guard `stale` claim'e bakmaz (değişmedi).

**Öz-testler ve negatif kontroller (ölçülen).** Kanıt kökü `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\r4\` (`d7\test\`,
`d7\neg\`, `dogrulama-ortak\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık konteynerinde (`postgres:16-alpine`, adında `test`, loopback yüksek port,
`_test` adlı veritabanı; şema `HY_WT_R27` `apps/api/prisma/schema.prisma` **kopyasından** `prisma db push --skip-generate`; iş sonunda yalnız o konteyner
kaldırılır); `D7T_LIB_ROOT` = `HY_WT_R27\project`; ortak ağır koşu kilidi her koşumda alındı / bırakıldı; her koşumdan önce FreeVirtualMemory ölçüldü
(≥ 4 GB; `dogrulama-ortak\bellek-olcum.txt`).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d7-selftest.js` — son baytlar (koşucu `23AB099F…`, sahte API `B2207C96…`, öz-test `E394E627…`, blok `A2C9F7D8…`) | **82/82 PASS**, çıkış 0 (yeni 6: Z22-a, Z22-b, Z22-c, Z22-d, Z22-e, T-12; değişen 17: Z16-b, Z16-c, Z16-d, Z16-f, Z18, Z19-a, Z20-a, Z20-b, Z20-c, Z21-a, Z21-c, Z21-d, Z21-g, Z21-h, Z21-i, Z21-j, T-11; C-1, S-1 PASS). Z22-c için Z1 normal koşumunun ardından TEK Recover eklendi (hesap zaten kapalı → disable-user çağrısı yok, dayanak "hesap zaten kapalıydı", çıkış 3) | `d7\test\d7-selftest-son.log` (+ `.sha-once` / `.sha-sonra`); ilk koşum `d7-selftest-ilk1.log` 82/82 (blok pinleri öncesi) |
| `d7-owner-block-selftest.ps1` — son baytlar (blok `A2C9F7D8…`, öz-test `92D65580…`) | **74/74 PASS** Windows PowerShell 5.1 · **74/74 PASS** PowerShell 7 (PIN-1 9/9, digest `CD86CD77…` = `$ExpPackage`; O-12 yeni) | `d7\test\blok-oz-test-son-winps51.log`, `d7\test\blok-oz-test-son-pwsh7.log` |
| **Negatif — koşucu:** `git archive 68cfae80` aynası (koşucu `EE3704A4…`, blok `A2641879…`) + R03-f öz-test / sahte API | **59/82**, çıkış 1 — FAIL = tam olarak Z16-b, Z16-c, Z16-d, Z16-f, Z18, Z19-a, Z20-a, Z20-b, Z20-c, Z21-a, Z21-c, Z21-d, Z21-g, Z21-h, Z21-i, Z21-j, Z22-a, Z22-b, Z22-c, Z22-d, Z22-e, T-11, T-12 (23 = yeni 6 + değişen 17). Eski davranış ölçüldü: geçersiz claim → T0; a = c ≠ b → TI; P7-C1 "kapatıldı" (43 satırın 39'u); "(Recover kapatabilir)"; pasif hesapta "yeniden AÇILDI" ve "portal hesabı açık"; T5 "kapatma DB'ye yansımadı" | `d7\neg\neg-eski-kosucu.log`, `d7\neg\neg-eski-gozlem.txt`, `d7\neg\neg-eski-p7c1-sayim.txt`, `d7\neg\ayna-kurulum.txt` |
| **Negatif — blok:** aynı ayna + R03-f blok öz-testi | iki kabukta **73/74**, çıkış 1 — FAIL = yalnız **O-12** (PIN-1 aynada eski koşucu + eski pinle tutarlı → PASS) | `d7\neg\neg-eski-blok-winps51.log`, `d7\neg\neg-eski-blok-pwsh7.log` |
| Pin · ayrıştırma | 9 pin uyuşmazlık 0, digest `CD86CD77…` = `$ExpPackage`; iki ps1 parse hatası 0 (WinPS 5.1 ve PS 7), `node --check` (koşucu, sahte API, öz-test) 0, iki ps1 UTF-8 BOM'lu | `d7\test\pin-dogrulama-son.log`, `d7\test\parse-iki-kabuk.log` |

Not: Z22-b'nin özü (guard normal → 401, P7-C4 PASS, bulgu yok) eski koşucuda da tutar; eski baytlarda FAIL vermesinin nedeni aynı koşumdaki açık-erişim
metnidir (F2 / F3) — `neg-eski-gozlem.txt`.

**Ölçülmeyenler / sınır.** Canlıda hiçbiri koşulmadı. F1'in üçüncü dayanağı ("2xx yok — kapatma adımından sonra DB'de kapalı görüldü") uçtan uca ölçülmedi.
TG gerçek ürün JWT'sinde ölçülmedi (ürün token'ında claim DB'deki tam sayıdır, `portal.service.ts:443` — canlıda pratikte beklenmez); guard normal ikizi
sahte API'nin claim doğrulamasıdır. F2: 401/403 sonrasında Recover'ın gerçekten kapatıp kapatamadığı ölçülmedi (metin bunu söyler). "Erişim bayrağı yeniden
açıldı (hesap pasif)" dalı, TG + pasif hesap, T3'ün b bilinmiyor / b aralık dışında varyantları ve TI'nın a = b = c açma girdisi yalnız birim ölçümüyle
(Z22-e, Z21-a) sınandı. B3 açık (değişmedi). Recover'da mevcut oturum reddi (P7-C4) her zaman ölçülemez (değişmedi). Bu revizyon canlı Run / Recover'ı
yetkilendirmez.

### 14.8 R03-g — R03-f iki bağımsız doğrulamasının MINOR kenarları; son tur (2026-10-04)

Kapsam: R03-f'nin iki bağımsız doğrulaması (ikisi de ok=true) yalnız MINOR kenarlar bıraktı; bunlar D-6 R03-g ile aynı ilkeyle dar kapatıldı (D-6 belgesi
§13.8). Karar tablosunun aşağıdakiler dışındaki hücreleri ve onaylanmış metinler **değişmedi**. Her madde önce **kaynakta doğrulandı** (R03-f yerel ucu
`61a5bd27`; ürün kaynağı `HY_WT_R27` @ `1b758d29`, salt okuma), sonra eski baytlarda negatif kontrolle ölçüldü. Canlı Run / Recover **koşulmadı**, owner bloğu
**çalıştırılmadı** (yalnız blok öz-testi). Çıkış kodu fonksiyonları ve öncelik **değişmedi**; kanıttaki `revision` `R03` kalır.

| Madde | Kaynakta (`61a5bd27`) — doğrulama | Düzeltme (R03-g) |
|---|---|---|
| G1 | Recover modunda `acikErisim` (`closePortal`) ve kurtarma nedeni son eki (`recoveryAdvice`) sabit "açık erişim KAPANMADI (bu Recover kapatamadı; …)" — kurtarma nedeninin "kapatmadan sonra DB'de kapalı ölçüldü (P7-C2=PASS) ama … yeniden AÇILDI (P7-C5 FAIL …)" dalında da; Recover kapatmayı 2xx ile yapıp P7-C2 PASS ölçtüyse "kapatamadı" kanıtsızdır — **doğrulandı** (eski baytlarda Z23-d (2): kapatma 201, P7-C2 PASS, P7-C3L/D 401, P7-C5 FAIL → "açık erişim KAPANMADI (bu Recover kapatamadı; …)") | `recoverOpenAccessText` (D-6 ile aynı; P7 kimlikleriyle): kapatmadan sonra DB'de kapalı **değilse** "açık erişim KAPANMADI (bu Recover kapatamadı; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı)" (R03-f metni korunur); kapalıysa (P7-C2 PASS) "Recover kapattı (kapatma çağrısı 2xx, P7-C2 PASS) ama erişim HTTP ölçümleri sırasında yeniden açıldı (P7-C5 FAIL) — açık erişim KAPANMADI; ikinci Recover bu paketle TANIMLI DEĞİL — owner kararı" · "hesap Recover başında zaten kapalıydı (kapatma çağrısı yapılmadı; P7-C2 PASS) ama …" · "kapatma çağrısı 2xx dönmedi ama kapatma adımından sonra DB'de kapalı ölçüldü (P7-C2 PASS); …". Run modu değişmedi (`recoverCloseText`) |
| G2 | Bloğun `Invoke-RecoverMode` bilgi metni (0e04f4a6'dan kalma): "… yetkili uç çağrılır (admin/disable-user, en çok 2 deneme): portal hesabı pasif + sürüm artışı, müvekkil portal erişimi kapalı, kapatma audit satırı" — koşulsuz; Run'da kapatma 401/403 ile reddedilebilir ve ürün yetki reddinde yazmadan döner — **doğrulandı** (eski baytlarda O-13: kaynakta ve gösterilen Recover ekranında koşulsuz biçim) | "… yetkili uç çağrılır (admin/disable-user, en çok 2 deneme); çağrı 2xx dönerse ürün şunları yazar: portal hesabı pasif + sürüm artışı, müvekkil portal erişimi kapalı, kapatma audit satırı (aktör: sentetik personel); 401/403'te kapatma yapılmaz (sonuç Recover kanıtında: P7-C1 / P7-C2 satırları ve portalClose.acikErisim)." Blok öz-testine **O-13** (statik + gösterilen) |
| G3 | `issuedVersionOf`: claim OKUNAMADI → verilme sürümü s1; `sessionClass200`'ün bu durum için girdisi yoktu → a = b = c ve iki uç aktifken **T5 "ürün bulgusu değil"**. Ürün guard'ı JWT olmayan token'ı `verifyAsync`'te (`portal-auth.guard.ts:36`) DB'den önce reddeder; ürünün verdiği token `jwtService.sign` ile JWT'dir (`portal.service.ts:438-446`) — **doğrulandı** (eski baytlarda Z23-a: `SAYILMADI/T5`; Z21-a: TJ girdileri T5 / T0 / T3 / T6) | Yeni hücre **TJ** (ADAY): "token JWT olarak okunamadı (üç parçalı JWT değil ya da payload JSON nesnesi değil) — ürün guard'ı bu token'ı DB'den önce reddeder (portal-auth.guard.ts:36 verifyAsync; hesap durumundan ve sürümden bağımsız)"; sıra B → T1 → TG → **TJ** → T3 → T0 …; T5'e ulaşmaz. `sessionClass200(issued, st1, st2, claimInvalid, claimUnreadable)`; Run 5. girdiyi `issuedVersion.claimDurum === 'OKUNAMADI'`'dan kurar. `issuedVersionOf` değerleri değişmedi (P7-C2V referansı aynı) |
| G4 | T2'nin a = c ≠ b + `isActive` değişti (tiOut) dalında b > c iken "(DB sürümü verilme sürümünün ALTINDA — ürün dışı azaltma)" notu yoktu — **doğrulandı** (eski baytlarda Z21-a `T2-TIdışı-alt`) | Not tiOut dalına da eklendi |
| G5 | Z21-a'da B'nin TG'den ve T1'in TG'den önce geldiğini sınayan girdi yoktu | Z21-a'ya sıra girdileri: B-TG, T1-TG, B-TJ, T1-TJ (+ TJ, TJ-b-yok, TJ-pasif, TJ-artış ve G4 girdisi `T2-TIdışı-alt`: b=3, st1 (aktif, 1), st2 (pasif, bayrak açık, 1) → T2 ADAY + ALTINDA) — 33 girdi, 14 hücre |
| G6 | §14.6 (v) "claim … geçersizse bilinmiyor (T0)" R03-f'den beri bayattı | Cümleye "[R03-f/g'de değişti: … TG (ADAY; §14.7) … TJ (ADAY; §14.8) …]" işareti (onaylanmış metin silinmedi) |

**Güncel karar sırası (R03-g).** B → T1 → TG → **TJ** → T3 → T0 → T1s → TA → TI → T2 → T2a → T5 → T4 → T6 (ilk tutan hücre); T2'nin a = c ≠ b dalı b > c iken
ALTINDA notunu da yazar.

**Sahte API (ürün değil).** (i) Guard NORMAL taklidi artık ürün guard'ı gibi JWT olmayan token'ı (`portalToken opaque`) DB'ye bakmadan reddeder
(`portal-auth.guard.ts:36`); R03-e/f'de kabul ediyordu — **ürün davranışı değildi**. Bu yüzden Z21-l'nin beklentisi değişti (opaque token + guard kusur taklidi →
T2 değil **TJ**; gerekçe: sahte API'nin opaque token'ı ürün davranışı değildir, ürün guard'ı bu token'ı DB'den önce reddeder ve 200'ün sınıfı sürümden
bağımsızdır). Guard `stale` kusur taklidi değişmedi. (ii) `reopenOn extLogin`: yeniden açma tetiği başarılı kapatmadan sonraki İLK **dış** portal girişi
yanıtlandıktan sonra (o giriş kapalı hesabı görür); Recover'ın HTTP ölçümleri yalnız yeni giriştir (mesaj listesi isteği yoktur). Varsayılan `messages`
(önceki davranış aynen).

**Öz-testler ve negatif kontroller (ölçülen).** Kanıt kökü `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\recover-dogrulugu\r5\` (`d7\test\`,
`d7\neg\`, `dogrulama-ortak\`). Koşucu öz-testi ajanın **kendi** tek kullanımlık konteynerinde (`postgres:16-alpine`, adında `test`, loopback yüksek port,
`_test` adlı veritabanı; şema `HY_WT_R27` `apps/api/prisma/schema.prisma` **kopyasından** `prisma db push --skip-generate`; iş sonunda yalnız o konteyner
kaldırılır); `D7T_LIB_ROOT` = `HY_WT_R27\project`; ortak ağır koşu kilidi her koşumda alındı / bırakıldı (`dogrulama-ortak\kilit-olay.txt`); her koşumdan önce
FreeVirtualMemory ölçüldü (≥ 4 GB; `dogrulama-ortak\bellek-olcum.txt`).

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d7-selftest.js` — son baytlar (koşucu `4446C256…`, sahte API `BEF6E732…`, öz-test `82A0B53B…`, blok `EF3FCF08…`) | **86/86 PASS**, çıkış 0 (yeni 4: Z23-a, Z23-b, Z23-c, Z23-d; değişen 3: Z21-a, Z21-l, T-11; C-1, S-1 PASS) | `d7\test\d7-selftest-ilk1.log` (son baytlarla; `.sha-once` / `.sha-sonra` eşit) |
| `d7-owner-block-selftest.ps1` — son baytlar (blok `EF3FCF08…`, öz-test `DDA5A722…`) | **75/75 PASS** Windows PowerShell 5.1 · **75/75 PASS** PowerShell 7 (PIN-1 9/9, digest `78F626CD…` = `$ExpPackage`; O-13 yeni) | `d7\test\blok-oz-test-ilk1-winps51.log`, `d7\test\blok-oz-test-ilk1-pwsh7.log`; belge güncellendikten sonra yeniden (G-2 belgenin §8'ini okur; §8 değişmedi): `d7\test\blok-oz-test-son-belgeli-*.log` |
| **Negatif A — koşucu:** `git archive 61a5bd27` aynası (ESKİ koşucu `23AB099F…`, ESKİ blok `A2C9F7D8…`) + R03-g öz-test + R03-g sahte API | **80/86**, çıkış 1 — FAIL = tam olarak Z21-a, Z21-l, Z23-a, Z23-c, Z23-d, T-11 (6). **Z23-b PASS** — beklenen: özü sahte API'nin guard sadakatidir (JWT olmayan token → 401), koşucu değişikliğine bağlı değildir | `d7\neg\neg-A-eski-kosucu.log`, `d7\neg\neg-A-eski-gozlem.txt`, `d7\neg\ayna-kurulum.txt` |
| **Negatif B — önceki yerel ucun TÜM paket baytları:** `git archive 61a5bd27` aynası (ESKİ koşucu, ESKİ blok, ESKİ sahte API `B2207C96…`) + yalnız R03-g koşucu öz-testi | **79/86**, çıkış 1 — FAIL = tam olarak Z21-a, Z21-l, Z23-a, Z23-b, Z23-c, Z23-d, T-11 (7 = yeni 4 + değişen 3) | `d7\neg\neg-B-eski-paket.log`, `d7\neg\neg-B-eski-gozlem.txt` |
| **Negatif — blok:** ayna A (ESKİ blok) + R03-g blok öz-testi | iki kabukta **74/75**, çıkış 1 — FAIL = yalnız **O-13** (PIN-1 aynada eski koşucu + eski pinle tutarlı → PASS) | `d7\neg\neg-eski-blok-winps51.log`, `d7\neg\neg-eski-blok-pwsh7.log` |
| Pin · ayrıştırma | 9 pin uyuşmazlık 0, digest `78F626CD…` = `$ExpPackage`; iki ps1 parse hatası 0 (WinPS 5.1 ve PS 7), `node --check` (koşucu, sahte API, öz-test) 0, iki ps1 UTF-8 BOM'lu | `d7\test\pin-dogrulama-son.log`, `d7\test\parse-iki-kabuk-son.log` |

Eski davranış ölçüldü (`neg-A-eski-gozlem.txt`, `neg-B-eski-gozlem.txt`): Z21-a — `TJ` girdisi `SAYILMADI/T5`, `TJ-b-yok` T0, `TJ-pasif` T3, `TJ-artış` T6,
`T2-TIdışı-alt` ALTINDA notsuz; Z21-l — opaque token + guard kusur taklidi `ADAY/T2`; Z23-a — `SAYILMADI/T5` "… 200 beklenir — ürün bulgusu değil …"; Z23-c —
`recoverOpenAccessText` yok, Recover kurtarma nedeni "yeniden AÇILDI … : açık erişim KAPANMADI (bu Recover kapatamadı; …)"; Z23-d (2) — kapatma 201 + P7-C2
PASS iken `acikErisim` "… (bu Recover kapatamadı; …)"; T-11 — 4 girdili çağrı; Z23-b (yalnız ayna B) — eski sahte API opaque token'ı kabul etti: P7-04D 200,
gösterim yapıldı, P7-C4 200 → T5; O-13 — eski blokta koşulsuz "…, en çok 2 deneme): portal hesabı pasif …" (kaynakta ve gösterilen Recover ekranında).

Yeni / değişen ölçütler: **Z23-a** (TJ uçtan uca, guard kusur taklidi; a = b = c, iki uç aktif — R03-f'de T5) · **Z23-b** (TJ ikizi, guard normal: dış zincir 401,
P7-C4L/D 401 PASS, productFinding yok) · **Z23-c** (G1 birim: `recoverOpenAccessText` 7 girdi + Recover modunda kurtarma nedeni iki dal) · **Z23-d** (G1 uçtan
uca, Z16-b makbuzu üzerinde iki Recover: kapatma 403 → "bu Recover kapatamadı" korunur; kapatma 201 + dış giriş ölçümünden sonra yeniden açma → "Recover
kapattı (…) ama erişim … yeniden açıldı …", "kapatamadı" yok) · **Z21-a** (33 girdi, 14 hücre) · **Z21-l** (T2 → TJ) · **T-11** (5 girdili çağrı) · **O-13**
(blok: Recover bilgi metni koşula bağlı — kaynak + gösterilen).

**Ölçülmeyenler / sınır.** Canlıda hiçbiri koşulmadı. G1'in "hesap Recover başında zaten kapalıydı" ve "2xx dönmedi ama … kapalı ölçüldü" dalları yalnız birim
ölçümüyle (Z23-c) sınandı; uçtan uca ölçülen dal 2xx + yeniden açmadır (sahte API dış müdahale taklidi). G2'nin "401/403'te kapatma yapılmaz" cümlesi ürün
kaynağından (yetki reddi yazmadan önce döner — §13.2) ve sahte API'nin `disable forbidden` taklidinden gelir; canlı ürünün bu yolu koşulmadı. TJ'nin uçtan uca
ölçümü sahte API'nin opaque token'ıyla yapıldı; ürünün JWT olmayan token verdiği bir durum bilinmiyor.

**Doğrulayıcıların bulgu SAYMADIĞI ama owner'a açık bilinen sınırlar.** (1) **TG ve TJ yalnız sahte API'de ölçüldü:** ürünün imzaladığı token'da claim DB'deki
tam sayıdır ve token JWT'dir (`portal.service.ts:438-446`) — canlıda bu iki hücrenin tutması pratikte beklenmez; sahte API'nin `badClaim` / `opaque` token'ları ve
guard normal taklidi ürünün kendisi değildir. (2) **Recover bitiş ekranı `acikErisim`'i göstermez** (önceki tasarım; değişmedi): bloğun Recover bitiş satırı yalnız
çıkış kodunu açıklar; açık erişim metni Recover kanıtındadır — owner kanıtı okumadan Recover'dan sonra erişimin açık kalıp kalmadığını ekranda görmez [**R04'te kapandı:** Recover bitiş ekranı artık "PORTAL ERİŞİMİ (son ölçüme göre …)" satırını gösterir — §14.9 (ii)]. (3) **B
hücresinin bulgu metnindeki "portal erişimi kapatıldıktan" ifadesi** DB kapanışı HTTP ölçümlerinden önce ve sonra ölçülmüşken (P7-C2 PASS + P7-C5 PASS)
yazılır; kapanışın dayanağı (2xx / hesap zaten kapalıydı / 2xx olmadan DB'de kapalı görüldü) bu metinde ayrışmaz — P7-C1 gözlemindeki `dayanak=` alanındadır.
(4) Bu belgenin **§8.1** maddesi 1 (Recover yazma kümesi; R02 metni) ürünün kapatma yazımlarını çağrının 2xx dönmesine bağlamadan anlatır — G2 kapsamı bloğun
gösterilen metniydi; belge metni **değiştirilmedi** (blok metni artık koşula bağlı). Dördü de bu turda kapsam dışı bırakıldı (owner kararı). B3 açık
(değişmedi). Recover'da mevcut oturum reddi (P7-C4) her zaman ölçülemez (değişmedi). Bu revizyon canlı Run / Recover'ı yetkilendirmez.

### 14.9 R04-recover-girdi — Recover girdisini blok yazar ve doğrular; Recover bitiş ekranı; 5xx gözlem metni (2026-10-04; owner kararı madde 5 + 6)

Kapsam (owner kararı 2026-10-04, madde 5 — üç iş, tek teslim; D-6 §13.9 ile aynı ilke): (i) ayrı Recover onayından sonra makbuzu **blok** yazar ve Recover başlamadan
bütünlüğünü doğrular; (ii) Recover bitiş ekranı portal erişimini **son ölçüme göre** AÇIK / KAPALI / ÖLÇÜLEMEDİ diye gösterir; (iii) ret ölçütlerinde 5xx gözlem metni ret
kanıtlanmadığını ve nedenin kesinleşmediğini söyler — **sonuç (verdict) ve çıkış kodları değişmedi**. Ayrı Recover onayı korunur; Run başarısız oldu diye otomatik
Recover **yoktur**. Canlı Run / Recover **koşulmadı**, owner bloğu **çalıştırılmadı** (yalnız blok öz-testi). Bu revizyon hiçbir canlı koşum ya da Recover için yetki
DEĞİLDİR. Taban: origin/main `549b8344`. Aşama 1'de (commit `553f199b`) koşucu öz-testi (`d7-selftest.js`) koşulmamıştı; **aşama 2'de koşuldu** ve kurtarma adımı
hizalandı — bu bölümün sonundaki **"R04-b (aşama 2)"**. Aşağıdaki (i)–(iii) aşama 1'in metnidir; aşama 2'de değişen yerler **[R04-b: …]** diye işaretlendi.

**(i) Yeni Recover girdisi — `-Mode Recover -RunEvidenceDir '<tamamlanmış Run kanıt dizini>'`.** `-ReceiptFile` yolu korunur; ikisi birlikte verilemez (DUR). Sıra:
salt okuma kapıları (değişmedi) → kaynak doğrulama → yazım → geri okuma → Recover bilgi metni (§8.1; değişmedi) → koşucu (Recover). D-7'de Recover **soru sormaz**
(değişmedi; öz-test G-3 ve RG-10): ayrı onay, owner'ın bu modu ayrıca başlatmasıdır; blok bu onayı sormaz ve ölçmez. Makbuz bu başlatmadan **sonra** yazılır.

| Adım | Blok ne yapar | Tutmazsa |
|---|---|---|
| Kaynak doğrulama (yazımdan ÖNCE) | Dizin adı `extacc-d7-live-<runId>-<zaman>`; `SHA256-MANIFEST.txt` var ve biçimli; manifestte `d7-evidence.json`, `owner-block.json`, `goref-consumed.json` satırları; **manifestteki her dosyanın** sha256'sı satırına eşit (dosya bir kez okunur; aynı baytlar hem özetlenir hem ayrıştırılır); kanıt kayıt türü Run kanıtı (`EXTACC-D7-PORTAL-MESSAGES-LIVE-RUN` — Recover kanıtından makbuz çıkarılmaz); runId = dizin adı = makbuz = `owner-block.json` (mod Run) = `goref-consumed.json` = **GO defteri satırı** (GO sha256 + runId; kanıt dizininin dışında); `recovery.makbuzJson` dizge + JSON + Recover okuma kapısı alanları (kayıt türü, runId biçimi, `elevUserId`, `elevEmail`); kimlik alanları (`record`, `runId`, `tenantId`, `tenantSlug`, `foreignTenantId`, `clientId`, `foreignClientId`, `caseId`, `elevUserId`, `elevEmail`) kanıttaki `receipt` nesnesiyle eşit; `tenantSlug` = `ah-<runId>` | DUR (çıkış 90) — makbuz yazılmaz, kardeş dizin oluşmaz, Recover başlamaz; ekranda somut neden |
| Yazım | Hedef = Run kanıt dizininin **kardeşi** `<Run dizini>.recover-girdi-<UTC yyyyMMddTHHmmssZ>`; içinde `d7-setup-receipt-kanittan.json`. Dizin ya da dosya **zaten varsa DUR** (ezme yok; dosyalar yalnız "yeni oluştur" kipiyle açılır) | DUR — var olan dizin / dosya değişmez |
| Yazımdan sonra | Dosya bayt olarak **geri okunur** ve beklenen baytlarla karşılaştırılır; bloğun Recover okuma kapısı (`Get-ReceiptFileState`, `recovery.makbuzJson` metin eşitliği dahil) koşulur; `d7-evidence.json` ve `SHA256-MANIFEST.txt` sha256'sı **yeniden ölçülür** (önce = sonra); yanına `RECOVER-GIRDI-KAYDI.json` yazılır (kaynak dizin adı, kanıt adı + sha256, manifest sha256, manifest satırı, runId, yeni dosyanın sha256'sı / bayt sayısı, kodlama tanımı, bağımsız çapa durumu, zaman) | DUR — Recover başlamaz, başarı sayılmaz; hedef dizin **silinmez**, `RECOVER-GIRDI-KULLANILMAZ.txt` (neden) ile işaretlenir; yarım / doğrulanamamış makbuz yerinde kalır ve **`-ReceiptFile` ile verilse de reddedilir** (işaret dosyası varsa DUR). İşaret dosyası da yazılamazsa ekran bunu söyler (o durumda kodla zorlanamaz). **[R04-c — K5:** bu adımlarda adımın kendi yakalamadığı **beklenmeyen** bir istisna da (ör. okuma kapısında dosya kilidi) aynı yola düşer: "Recover girdisi hazırlanamadı: yazımdan sonraki adımda BEKLENMEYEN hata (…)" + işaret + DUR (önceki baytlarda işaret yazılmıyordu)**]** |
| Node'dan önce **[R04-c — K3]** | Makbuzun sha256'sı **iki noktada** yeniden ölçülür ve `RECOVER-GIRDI-KAYDI.json`'a yazılan `makbuzSha256` ile karşılaştırılır: (1) Recover kanıt dizini (`recover-*`) açılmadan önce, (2) node çağrısından hemen önce | DUR (çıkış 90) — node çağrılmaz, başarı sayılmaz; dizin `RECOVER-GIRDI-KULLANILMAZ.txt` ile işaretlenir: "Recover girdisi artık doğrulanmış girdi DEĞİL: makbuz doğrulamadan SONRA, node başlamadan ÖNCE DEĞİŞTİ ya da okunamadı (…; sha256 kayıttaki=… · şimdi=…)". (1)'de `recover-*` dizini açılmaz; (2)'de boş bir `recover-*` dizini kalır (kanıt / log yok) |
| Recover | Koşucu yeni dosyayla çağrılır; `recover-*` kanıt dizini makbuzun yanında, yani **kardeş dizinde** açılır. Run kanıt dizinine ve manifestine **yazılmaz** | — |
| Recover'dan sonra **[R04-c — K3; D-6 R04-b satırının ikizi]** | Blok makbuzun sha256'sını yeniden ölçer: önce = sonra ise "RECOVER GİRDİSİ (makbuz): Recover'dan sonra DEĞİŞMEDİ (sha256 önce = sonra = …; D-7 koşucusu Recover'da makbuz dosyasına yazmaz)"; değilse kırmızı "… DEĞİŞTİ ya da okunamadı (sha256 önce=… · sonra=…) — RECOVER-GIRDI-KAYDI.json'daki makbuzSha256 Recover'dan ÖNCEKİ baytlara aittir" | çıkış kodu **değişmez** (Recover koşmuştur); satır kırmızı — kanıt dizini CLIENT'a iletilir |

**Kodlama tanımı (açık).** Yeni makbuz dosyasının baytları = `recovery.makbuzJson` **dizgesinin UTF-8 kodlaması**: BOM **yok**; satır sonları dizgede ne ise o (koşucunun
`JSON.stringify(…, null, 1)` çıktısı LF'dir; **dönüştürülmez**); sonda ek satır sonu **yok**. Geçersiz UTF-16 (eşlenmemiş vekil) ya da BOM karakteriyle başlayan dizge
yazılmaz (DUR). `RECOVER-GIRDI-KAYDI.json` ve `RECOVER-GIRDI-KULLANILMAZ.txt` de UTF-8 BOM'suzdur.

**Bağımsız çapa (ölçüldü — uydurulmadı).** Manifest ve kanıt **içeriği** için bağımsız çapa **yoktur**: bloğun Run kayıtları (`owner-block.json`, `goref-consumed.json`,
`owner-declaration.json`, GO defteri) manifest ya da kanıt özeti taşımaz; ilk üçü kanıtla aynı dizindedir ve aynı manifestle örtülüdür. GO defteri (kanıt dizininin
dışında) yalnız runId ↔ GO sha256 bağını taşır → **runId çapası** olarak doğrulanır. Sonuç: manifest kanıtla **birlikte** değiştirilirse bu doğrulama bunu
**yakalayamaz**; sınır ekrana ("SINIR: manifestin bağımsız çapası YOK …") ve `RECOVER-GIRDI-KAYDI.json`'a (`bagimsizCapa`) yazılır. Yeni dosyanın yanındaki iki özetin
eşitliği kaynak bütünlüğü kanıtı sayılmaz; kaynak bağı manifest + runId / kimlik bağı + GO defteri satırıdır.

**Run sonu ekranı (çıkış 5/6).** Kanıtta makbuz metni (`recovery.makbuzJson`) varsa elle komut yerine `-Mode Recover -RunEvidenceDir '<kanıt dizini>'` gösterilir
(somut yol; "AYRI owner onayıyla, BİR KEZ", "otomatik DEĞİL"; blok Recover'ı kendiliğinden başlatmaz); kanıt dizinindeki makbuz dosyasının durumu (VAR … EŞİT / YOK /
OKUNAMIYOR / BAYAT) bilgi olarak yazılır ve "-ReceiptFile ile VERMEYİN" denir (Recover `recover-*` dizinini makbuzun yanında açar; Run kanıt dizini değişir). Kanıtta
makbuz metni yoksa R03-d dalları aynen (dosya okunabiliyorsa `-ReceiptFile <makbuz>` önerisi; değilse SOMUT ENGEL). "Recover ayrı bir CANLI YAZMA işlemidir … ikinci bir
Recover bu paketle TANIMLI DEĞİLDİR" satırları aynen. **[R04-b:** aşama 1'de koşucunun kanıta yazdığı kurtarma adımı metni (elle TEK komut; yeni makbuzu Run kanıt
dizininin içine yazdırıyordu) değişmemişti ve bloğun önerisiyle çelişiyordu; R04-b'de koşucu metni bloğun seçeneğiyle hizalandı ve ekran metni "(kanıttaki kurtarma adımı
da bu seçeneği gösterir)" oldu — aşağıda "R04-b (aşama 2)".**]** **[R04-c — K2:** "-ReceiptFile ile VERMEYİN" satırı artık "…; blok bu durumda o yolu REDDEDER (DUR)" diye
biter ve blok o yolu gerçekten reddeder; kanıtta makbuz metni yokken gösterilen `-ReceiptFile <makbuz>` dalına "DİKKAT: kanıtta makbuz metni (recovery.makbuzJson) yok →
-RunEvidenceDir kullanılamaz; bu yol recover-* dizinini Run kanıt dizinine açar — orijinal kanıt dizini DEĞİŞİR; manifest kapsamı dışında kalır. Bu yolu kullanma kararı
owner / CLIENT'a aittir." satırı eklendi — aşağıda "R04-c (aşama 3)".**]**

**(ii) Recover bitiş ekranı.** Kod açıklamalarından ayrı tek satır: `PORTAL ERİŞİMİ (son ölçüme göre, bu Recover'ın kanıtından; DB durumu): <durum> — <ölçülen>.
Yeni giriş reddi kanıttaki P7-C3L/D satırlarından okunur; mevcut oturum reddi Recover'da ÖLÇÜLEMEZ.` Son ölçüm sırası: HTTP ölçümlerinden sonraki DB okuması
(`afterMeasure`, P7-C5) → kapatma adımından sonraki (`after`, P7-C2) → Recover başındaki (`before`).

| Durum | Koşul (Recover kanıtındaki `portalClose`) | Gösterilen |
|---|---|---|
| AÇIK | son ölçümde `isActive=true` | "portal hesabı AKTİF (isActive=… hasPortalAccess=… sürüm=…; son ölçüm: …)" + varsa "kanıttaki açık erişim metni: …" (`acikErisim`) |
| AÇIK | son ölçümde hesap pasif, `hasPortalAccess=true` | "portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (…)" (koşucunun `isOpenAccess` / `openStateTxt` ayrımı) |
| KAPALI | son ölçümde hesap pasif + bayrak kapalı | "hesap pasif + müvekkil erişim bayrağı kapalı (…)" |
| KAPALI | son ölçümde hesap satırı yok | "portal hesabı satırı DB'de YOK (hasPortalAccess=…; son ölçüm: …)" |
| ÖLÇÜLEMEDİ | Recover kanıtı okunamıyor (yok / kayıt türü / exitCode farklı) · `portalClose` yok · geç oluşma dışlanamadı · kapanış adımı hatası (DB değeri yok) | somut neden |

Mevcut kod açıklamaları, "mevcut oturum reddi Recover'da ÖLÇÜLEMEZ" ve ikinci Recover'ın bu paketle tanımlı olmadığı satırları korunur; çıkış kodu değişmez. §14.8
"bilinen sınır (2)" (Recover bitiş ekranı `acikErisim`'i göstermez) bu değişiklikle **kapandı**.

**[R04-c — K1:** yukarıdaki satır biçimi ve tablo **R04 / R04-b baytlarının** davranışıdır. Son baytlarda satırın başlığı "…; DB durumu + yeni giriş reddi ölçütleri): "
oldu ve iki KAPALI satırı değişti: DB kapalıyken gösterilen ad ve **renk** aynı kanıttaki P7-C3L / P7-C3D verdict'lerine bağlıdır (önceki baytlarda satır yalnız DB
durumundan kuruluyor ve yeni giriş reddi FAIL / ölçülemeyen iken de yeşil "KAPALI" basılıyordu — odak doğrulamada ölçüldü). AÇIK ve ÖLÇÜLEMEDİ satırlarının metni aynı.
Güncel tablo: aşağıda "R04-c (aşama 3)".**]**

**(iii) 5xx gözlem metni (koşucu).** Ret ölçütlerinde (yeni giriş P7-C3L/D — `judge401`; mevcut oturum P7-C4L/D — `judgeSession`) 503 / 429 **dışındaki** 5xx gözlemi artık
"HTTP <kod> — ret kanıtlanmadı; neden kesinleşmedi (ürün kusuru olarak sınıflanmadı)" (`rejectObs`; önce yalnız "HTTP <kod>"; P7-C3L/D'deki ölçüm parolası notu aynen
eklenir). Değişmeyenler: verdict (401 beklenirken 401 gelmedi → FAIL), 503 / 429 → ÖLÇÜLEMEYEN ("neden UNKNOWN"), çıkış kodu fonksiyonları ve öncelik, kanıttaki
`revision` (`R03`), `sessionVersion` / `productFinding` (5xx'te yazılmaz — değişmedi). Diğer 5xx gözlemleri (mesaj uçları, kapsam ölçümleri, kapatma çağrıları) owner
kapsamında **değil** — dokunulmadı.

**Öz-testler ve negatif kontrol (ölçülen) — AŞAMA 1 BAYTLARI.** Bu tablodaki her sayı **aşama 1 baytlarında** (blok `C52CBDA8…`, blok öz-testi `7EEBCB6C…`, koşucu
`AB38AC97…`, koşucu öz-testi `BF699CFF…`) ölçülmüştür; **son baytların** (R04-b) sonuçları aşağıdaki "R04-b (aşama 2)" tablosundadır. Kanıt kökü
`D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\d6-d7-recover-hazirlik\asama1\` (`d7\test\`, `d7\neg\`, `taban\`); aşama 2'de eklenen satırın kanıtı `…\asama2\`.

| Koşum | Sonuç | Kanıt |
|---|---|---|
| `d7-owner-block-selftest.ps1` — aşama 1 baytları (blok `C52CBDA8…`, blok öz-testi `7EEBCB6C…`, koşucu `AB38AC97…`; belgenin aşama 1 hâliyle — G-2 / G-6 belgeyi okur) | **84/84 PASS** Windows PowerShell 5.1 · **84/84 PASS** PowerShell 7 (PIN-1 9/9, digest `01DFD77F…` = `$ExpPackage`); 75 − 1 (O-9 kaldırıldı) + 10 (RG-1 … RG-10) = 84; O-8 değişti | `d7\test\blok-oz-test-son-winps51.log`, `d7\test\blok-oz-test-son-pwsh7.log` (`son-sha-once.txt` = `son-sha-sonra.txt`: koşum sırasında dosya değişmedi) |
| **Negatif — blok:** `git archive 549b8344` (origin/main) aynası (ESKİ blok `EF3FCF08…`, ESKİ koşucu `4446C256…`, ESKİ belge) + R04 blok öz-testi | **73/84**, çıkış 1 — FAIL = tam olarak O-8, RG-1, RG-2, RG-3, RG-4, RG-5, RG-6, RG-7, RG-8, RG-9, RG-10 (11), iki kabukta aynı küme; PIN-1 PASS (aynada eski pin + eski koşucu tutarlı) | `d7\neg\neg-eski-blok-winps51.log`, `d7\neg\neg-eski-blok-pwsh7.log`, `d7\neg\ayna-kurulum.txt`, `d7\neg\neg-blok-sha.txt` |
| Taban (değişiklik öncesi, origin/main baytları) | 75/75 PASS iki kabukta | `taban\d7-blok-oz-test-taban-winps51.log`, `taban\d7-blok-oz-test-taban-pwsh7.log`, `taban\taban-sha256.txt` |
| `d7-selftest.js` (koşucu öz-testi; T-13 yeni → 87 ölçüt) — **aşama 1 baytları** (koşucu `AB38AC97…`, öz-test `BF699CFF…`; `git archive 553f199b` aynasında, öz-test `git show 553f199b` baytlarıyla) | aşama 1'de koşulmamıştı; **aşama 2'de ölçüldü: 87/87 PASS** (T-13 dahil), çıkış 0; kendi tek kullanımlık Postgres (postgres:16-alpine, loopback, `_test` adlı DB), `D7T_LIB_ROOT` = canlı olmayan R27 çalışma ağacı; koşum öncesi = sonrası betik sha256'ları | `asama2\d7\test\d7-selftest-asama1-ucu.log` (+ `.bellek`, `.sha-once`, `.sha-sonra`), `asama2\neg-ayna\asama1-ucu-553f199b-kurulum.txt` |
| T-13'ün ifadeleri (ad-hoc; Postgres / sahte API gerekmez; **öz-testin kendisi değildir**) | yeni koşucu baytlarında (`AB38AC97…`) TUTTU; origin/main koşucu baytlarında (`4446C256…`) TUTMADI (`rejectObs` yok; eski yalın son dal 2) | `d7\test\t13-adhoc-yeni-kosucu.log`, `d7\neg\t13-adhoc-eski-kosucu.log`, `d7\test\t13-adhoc.js` |
| Koşucu öz-testinin bloğa bakan statik kalemlerinin (T-3 … T-6) ad-hoc eşdeğeri (**öz-testin kendisi değildir**) | TUTTU — pin listesi = koşucunun require ağacı + `d7-qr-test.js`; BOM / `exit $rc` / finally; Preflight dalı yazmaz; Run kapıları | `d7\test\blok-statik-adhoc-son.log`, `d7\test\blok-statik-adhoc.js` |
| Pin · ayrıştırma | 9 pin uyuşmazlık 0, digest `01DFD77F…` = `$ExpPackage`; iki ps1 ayrıştırma hatası 0 (WinPS 5.1 ve PS 7), `node --check` (koşucu, koşucu öz-testi, sahte API, qr-test) 0, iki ps1 UTF-8 BOM'lu, satır sonu LF | `d7\test\pin-dogrulama-son.log`, `d7\test\parse-iki-kabuk-son.log` |

Yeni / değişen blok öz-testi ölçütleri (her ret kalemi **somut neden metnini** ister; kaynak sahte koşucuyla GERÇEK `Invoke-RunMode`'un ürettiği Run kanıt dizinidir, ret
kalemleri onun kopyalarında koşar): **RG-1** geçerli çıkarma — hedef kardeş dizinde, baytlar = sahte koşucunun yazdığı makbuz metni (tarih biçimli alan + ASCII dışı
karakter dahil), BOM yok, yalnız LF, ek satır sonu yok, kayıt dosyası doğru, Run dizini (dosya adları + her dosyanın sha256'sı) ve manifest değişmedi, Recover yeni
dosyayla başladı, GERÇEK koşucunun `readReceiptForRecover` kapısı "ok" · **RG-2** değiştirilmiş kaynak (makbuzJson / manifest satırı / başka dosya → "manifest uyuşmuyor";
yazım sırasında kaynak değişirse "yazım sırasında DEĞİŞTİ" + işaret) · **RG-3** bozulmuş / yanlış koşuma ait makbuz, Recover kanıtı, dizin adı, JSON olmayan metin, makbuz
olmayan kayıt · **RG-4** kimlik alanı (beş alan + türetilen slug + başka koşumun blok kaydı) · **RG-5** eksik kaynak (dizin, dosya yolu, kanıt, manifest, manifest
satırları, makbuzJson, GO defteri satırı) · **RG-6** ezme yok (hedef dizin / aynı adlı dosya; "yeni oluştur" var olan dosyada istisna) · **RG-7** yazma hatası (gerçek ACL
reddi; kısmi yazım, kayıt yazımı ve işaret yazımı taklitleri) · **RG-8** geri okuma uyuşmazlığı taklitleri + işaretli dizindeki sağlam makbuzun `-ReceiptFile` ile de
reddi · **RG-9** Recover bitiş ekranı (AÇIK ×2, KAPALI ×2, ÖLÇÜLEMEDİ ×4) · **RG-10** çift kaynak reddi, Recover yeni soru sormaz (kuyruktaki yanıtlar tüketilmez; AST),
statik (çıkarma bilgi metninden ve node çağrısından önce; Run'da otomatik Recover yok; silme / üzerine yazma çağrısı yok; kodlama tanımı kaynakta) · **O-8** (değişti) Run
sonu ekranı yeni seçeneği gösterir · O-9 kaldırıldı (blok artık elle TEK komutu göstermez; makbuzu blok yazar → RG-1 iki kabukta).

**Ölçülmeyenler / sınır (aşama 1 metni; aşama 2'de kapananlar işaretlendi).** (1) ~~Koşucu öz-testi koşulmadı~~ **[R04-b: KAPANDI — aşama 1 baytlarında 87/87, son
baytlarda 88/88 ölçüldü (aşağıda)]**; kalan kısım: sahte API kaynağında
ret ölçütünün ucuna (portal girişi / mesaj listesi) 503 dışında 5xx döndüren bir senaryo anahtarı **görülmedi** (500 yalnız yasak uç, oluşturma, kapatma ve işleyici
hatasında) — 5xx metni uçtan uca ölçülmedi (birim + statik: T-13). (2) ~~Gerçek koşucu kanıtıyla çıkarma ölçülmedi~~ **[R04-b: KAPANDI — koşucu öz-testi Z19-b gerçek
koşucu kanıtıyla çıkarmayı iki kabukta ölçer (aşağıda)]**; aşama 1'deki durum: blok öz-testi sahte koşucunun kanıtını
kullanır (alan adları koşucu kaynağından: `record`, `runId`, `receipt`, `recovery.makbuzJson` = makbuzun `JSON.stringify(…, null, 1)` metni). (3) Manifestin bağımsız çapası yok (yukarıda). (4) `-RunEvidenceDir` yalnız manifesti yazılmış
(tamamlanmış) Run kanıt dizini içindir; manifest yoksa bu yol kapalıdır ve yalnız `-ReceiptFile` yolu kalır (o yol Run kanıt dizinine `recover-*` dizini açar)
**[R04-c — K4: DUR metni artık bunu söyler ve makbuz dosyasının ölçülen durumunu yazar; K2: manifest VARKEN ve kanıtta makbuz metni varken `-ReceiptFile` Run dizinindeki
makbuzla reddedilir]**.
(5) D-7 koşucusunun Recover'ı makbuz dosyasını yeniden yazmaz (kaynaktan okundu: makbuz yazımları yalnız Run'dadır; ~~ölçülmedi~~ **[R04-b: ÖLÇÜLDÜ — Z19-b: makbuz
baytları gerçek Recover'dan önce = sonra, iki kabukta; T-14: recoverMode kaynağında makbuz / dosya yazımı yok]**); `RECOVER-GIRDI-KAYDI.json`'daki
`makbuzSha256` yazım anındaki değerdir ve Recover'dan sonra da dosyayı anlatır. (6) İkinci bir çıkarma / ikinci Recover kodla **engellenmez** (her çıkarma yeni zaman damgalı kardeş dizin açar; ikinci bir Recover
bu paketle tanımlı değildir, owner kararı gerektirir — değişmedi). (7) ~~PORTAL ERİŞİMİ satırı bir DB durumudur; HTTP reddi kanıt satırlarından okunur~~ **[R04-c — K1:
DEĞİŞTİ — DB kapalıyken satır yeni giriş reddi ölçütlerini (P7-C3L/D) de taşır ve rengi onlara bağlıdır]**; mevcut oturum reddi
Recover'da ölçülemez (değişmedi). (8) Canlıda hiçbiri koşulmadı; B3 açık (değişmedi).

#### R04-b (aşama 2; 2026-10-04) — kurtarma adımının hizalanması + koşucu öz-testlerinin koşulması

Kapsam (owner: "Yeni genel inceleme turları açma. Yalnız bulunan somut kusurun gerektirdiği düzeltme ve testi yap"; D-6 §13.9 "R04-b" ile aynı ilke): aşama 1'in bıraktığı
**somut kusur** (kurtarma adımı bloğun önerisiyle çelişiyordu) giderildi, D-6'da bulunan ikinci kusurun D-7'deki karşılığı **ölçüldü** (yok) ve aşama 1'de koşulmayan
koşucu öz-testi koşuldu. Sonuç (verdict), çıkış kodu fonksiyonları, kapılar, Run sırası ve kanıttaki `revision` (`R03`) **değişmedi**. Canlı Run / Recover **koşulmadı**,
owner bloğu **çalıştırılmadı** (yalnız öz-testler); canlı ağaç, canlı DB, canlı `.env`, canlı portlar ve canlı kanıt dizinlerine dokunulmadı. Kanıt kökü:
`D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\d6-d7-recover-hazirlik\asama2\` (`d7\test\`, `d7\neg\`, `neg-ayna\`, `ortak\`).

**Kusur — kurtarma adımı bloğun önerisiyle çelişiyordu (kaynakta + ölçümle doğrulandı).** Aşama 1 baytlarında blok Run sonunda `-Mode Recover -RunEvidenceDir '<kanıt dizini>'`
gösterirken koşucunun kanıta yazdığı `recovery.adim` (a) makbuz dosyası yok / okunamıyor / bayatken elle TEK komut veriyor ve yeni makbuzu Run kanıt dizininin **içine**
(`<kanıt dizini>\d7-setup-receipt-kanittan.json`) yazdırıyordu; (b) makbuz güncelken `-Mode Recover -ReceiptFile <makbuz>` öneriyordu — blok aynı durumda "bu dosyayı -ReceiptFile ile
VERMEYİN" der (Recover `recover-*` dizinini Run kanıt dizininde açar). Ölçüm: aşama 1 baytlarının koşumunda makbuz metni taşıyan 24 Run kanıtının 23'ünde (b), 1'inde (a) vardı.

| Durum (Run kanıtı) | Aşama 1 koşucu metni | R04-b koşucu metni (`recovery.adim`) | Blok Run sonu ekranı |
|---|---|---|---|
| kanıtta makbuz metni VAR, makbuz dosyası güncel | `-Mode Recover -ReceiptFile <makbuz>` | `… Recover yalnız AYRI owner onayıyla başlatılır — owner bloğunun şu seçeneğiyle: -Mode Recover -RunEvidenceDir '<bu koşumun kanıt dizini>'` + "Run kanıt dizininin DIŞINDA kardeş bir dizine yazar; doğrulama tutmazsa Recover BAŞLAMAZ" + "Run kanıt dizinine dosya YAZILMAZ" + "(durumu: VAR — koşucunun bellekteki son makbuzuyla EŞİT) `-ReceiptFile` ile VERİLMEZ" | aynı seçenek + "… VAR — … EŞİT — bu dosyayı -ReceiptFile ile VERMEYİN" |
| kanıtta makbuz metni VAR, dosya YOK / OKUNAMIYOR / BAYAT | elle TEK komut (Run dizininin içine) + `-ReceiptFile '<yeni makbuz>'` | aynı seçenek; durum yalnız bilgi: "YOK (… · setup.durum=…)" / "OKUNAMIYOR (…)" / "BAYAT (… farklı alan(lar): …; sonradan eklenen kimlikleri içermeyebilir → bu dosyayla Recover eksik kapanış yapabilir)" | aynı seçenek + dosyanın durumu |
| kanıtta makbuz metni YOK, dosya okunabilir | `-Mode Recover -ReceiptFile <makbuz>` | değişmedi (bloğun aynı dalı; koşucunun kendi Run'ında oluşmaz — makbuz yokken makbuz yolu da verilmez; saf fonksiyon dalı) | `-Mode Recover -ReceiptFile <makbuz>` |
| kanıtta makbuz metni YOK, dosya yok | "bu koşumda makbuz YOK … (K-7)" | **aynen** (seçenek / komut yok) | SOMUT ENGEL |

Elle komut ve `receiptFromEvidenceCommand` koşucudan **kaldırıldı**; Run kanıt dizininin içine dosya yazdıran komut **hiçbir dalda** yoktur. Blokta yalnız METİN: Run sonu satırı
"(kanıttaki kurtarma adımı da bu seçeneği gösterir)". **Elle komutu iki kabukta koşan eski kalemin kaldırılma gerekçesi:** komut artık hiçbir çıktıda yok; ölçtüğü yol (makbuzun
kanıttaki `recovery.makbuzJson`'dan yazılması) bloğa geçti ve blok öz-testi RG-1'de (sahte koşucu kanıtı; iki kabuk) ölçülüyor. Koşucu öz-testindeki kalem (Z19-b) kaldırılmadı,
**yeniden yazıldı**: RG-1'in ölçmediği şeyi — **gerçek koşucunun yazdığı kanıtla** çıkarmayı — ölçer (aşağıda).

**D-6'daki ikinci kusurun D-7 karşılığı (kaynak + ölçüm): YOK.** D-6 koşucusu Recover'da makbuza `residueFiles` yazıyordu; D-7 koşucusunun `recoverMode`'unda makbuz yazımı
yoktur (makbuz yazımlarının tamamı Run'dadır; T-14 statik: `recoverMode` kaynağında `writeJson` / `saveReceipt` / `writeFileSync` / `appendFileSync` yok) ve bloğun kardeş dizine
yazdığı makbuzun baytları gerçek Recover'dan önce = sonra ölçüldü (Z19-b, iki kabukta). Bu nedenle D-7 bloğuna salt okunur bayrak ve Recover sonrası makbuz ölçümü **eklenmedi**
(blokta yalnız metin + pin).

**Öz-testler — R04-b BAYTLARI** (koşucu `20DC82E2…`, koşucu öz-testi `466EC3EF…`, blok `01D5EA53…`, blok öz-testi `8A5CE9F3…`, sahte API `BEF6E732…` — değişmedi).
**[R04-c:** bu tablodaki "son baytlar" ifadesi **R04-b baytları** demektir. Koşucu, koşucu öz-testi ve sahte API R04-c'de değişmedi (bu satırların sonuçları o dosyaların
bugünkü baytları için de geçerlidir; yeniden koşulmadı); **blok ve blok öz-testi R04-c'de değişti** — bu tablodaki blok öz-testi sayıları (84/84, negatif 83/84 ve 73/84)
R04-b blok baytlarına aittir; son baytların sonuçları aşağıdaki "R04-c (aşama 3)" tablosundadır.**]**

| Koşum | Sonuç | Kanıt (`asama2\`) |
|---|---|---|
| `d7-selftest.js` — son baytlar | **88/88 PASS**, çıkış 0 (87 + T-14; Z18, Z19-b, Z20-d, C-1 değişti; T-13 PASS); kendi tek kullanımlık Postgres (postgres:16-alpine, 127.0.0.1 yüksek port, `_test` adlı DB; şema R27 çalışma ağacının `schema.prisma` kopyasından `db push --skip-generate`), `D7T_LIB_ROOT` = canlı olmayan R27 çalışma ağacı; koşum öncesi FreeVirtualMemory ≈ 31 GB; betik sha256'ları önce = sonra | `d7\test\d7-selftest-son.log` (+ `.bellek`, `.sha-once`, `.sha-sonra`) |
| `d7-owner-block-selftest.ps1` — son baytlar, bu belgenin son hâliyle (G-2 / G-6 belgeyi okur) | **84/84 PASS** Windows PowerShell 5.1 · **84/84 PASS** PowerShell 7 (PIN-1 9/9, digest `16D95F54…` = `$ExpPackage`); sayı değişmedi; O-8 değişti; betik sha256'ları önce = sonra | `d7\test\blok-oz-test-son2-winps51.log`, `…-pwsh7.log`, `…-sha-once.txt`, `…-sha-sonra.txt` (belge R04-b eklerinden ÖNCE aynı betik baytlarıyla: `blok-oz-test-son-*.log`, 84/84 ×2) |
| Pin · ayrıştırma — son baytlar | 9 pin uyuşmazlık 0, digest `16D95F54…` = `$ExpPackage`; iki ps1 ayrıştırma hatası 0 (iki kabuk), `node --check` 0 (dört js), ps1 UTF-8 BOM'lu, tüm betiklerde CR 0 (LF) | `d7\test\son-pin-dogrulama.log`, `d7\test\son-parse-iki-kabuk.log` |
| **Negatif — koşucu öz-testi (yeni) · aşama 1 ucu aynası** (`git archive 553f199b`: koşucu `AB38AC97…`, blok `C52CBDA8…`) | **83/88**, çıkış 1 — FAIL = tam olarak **Z18, Z19-b, Z20-d, C-1, T-14** (5; yeni + değişen kalemlerin tamamı) | `d7\neg\neg-kosucu-asama1-ucu-553f199b.log`, `neg-ayna\asama1-ucu-553f199b-kurulum.txt` |
| **Negatif — koşucu öz-testi (yeni) · taban aynası** (`git archive 549b8344`: koşucu `4446C256…`, blok `EF3FCF08…`) | **82/88**, çıkış 1 — FAIL = **Z18, Z19-b, Z20-d, C-1, T-13, T-14** (6; aşama 1'in T-13'ü dahil) | `d7\neg\neg-kosucu-taban-549b8344.log`, `neg-ayna\taban-549b8344-kurulum.txt` |
| **Negatif — blok öz-testi (yeni) · aşama 1 ucu aynası** (aynadaki ESKİ belgeyle) | **83/84**, çıkış 1, iki kabukta aynı küme — FAIL = **O-8**; PIN-1 PASS (aynada eski pin + eski koşucu tutarlı) | `d7\neg\neg-blok-asama1-ucu-553f199b-winps51.log`, `…-pwsh7.log` |
| **Negatif — blok öz-testi (yeni) · taban aynası** (aynadaki ESKİ belgeyle) | **73/84**, çıkış 1, iki kabukta aynı küme — FAIL = **O-8, RG-1 … RG-10** (11); PIN-1 PASS | `d7\neg\neg-blok-taban-549b8344-winps51.log`, `…-pwsh7.log` |
| Ara koşum (son baytlar DEĞİL; sonuç sayılmaz) | koşucu öz-testi ara 1: 88/88 (C-1'in "seçenek ölçülen Run kanıtı" eşiği 5 iken; ölçülen 24 → eşik 15'e çıkarıldı, başka değişiklik yok); blok öz-testi ara 1: 84/84 iki kabukta | `d7\test\d7-selftest-ara1.log`, `d7\test\blok-oz-test-ara1-*.log` |

**Gerçek Run kanıtıyla çıkarma (kalıcı öz-test kalemi — Z19-b; ad-hoc değil).** Koşucu öz-testinin ürettiği GERÇEK Run kanıtı (çıkış 6: makbuz dosyası gösterimden sonra yazılamaz
hale geldi, kapatma 500 → portal açık) kopyalanarak tamamlanmış bir Run kanıt dizini kurulur — `owner-block.json`, `goref-consumed.json` ve GO defteri satırı bloğun Run'da yazdığı
biçimde, `SHA256-MANIFEST.txt` bloğun **kendi** `Write-Manifest` fonksiyonuyla. Bloğun çıkarma fonksiyonları (AST ile yüklenir; bloğun akışı çalışmaz) **iki kabukta** koşulur.
Ölçülen (son baytlar, iki kabukta da): kaynak doğrulama (`Test-RunEvidenceSource`) geçti (manifestte 3 dosya); `New-RecoverInputFromRun` makbuzu Run dizininin **kardeşine** yazdı
(tek kardeş dizin); dosyanın baytları = kanıttaki `recovery.makbuzJson`'un UTF-8 baytları (991 bayt; `runnerMessageIds` dahil; BOM yok, CR yok); `RECOVER-GIRDI-KAYDI.json` kaynak
kanıt sha256 + makbuz sha256 / bayt + runId + kayıt türünü taşıyor; Run kanıt dizini (dört dosya, alt dizin yok) ve öz-testin kanıt dosyası **değişmedi**; GERÇEK koşucunun
`readReceiptForRecover` kapısı dosyayı kabul etti; GERÇEK koşucunun Recover'ı bu dosyayla (test Postgres'ine karşı) **kimlik bağı OK** ile koştu (çıkış 3: portal pasif + erişim
kapalı, yeni giriş 401, P7-MSG-KEPT makbuzdaki koşucu id'leriyle PASS, personel pasif); makbuz baytları Recover'dan önce = sonra.

Yeni / değişen ölçütler: **Z18** (değişti; (v) birim — dört durumun adımı; elle komut ve `-ReceiptFile` önerisi makbuz güncelken de yok) · **Z19-b** (değişti; yukarıdaki uçtan uca
ölçüm) · **Z20-d** (değişti; BAYAT makbuz: aynı seçenek + durum bilgisi) · **C-1** (değişti; taranan tüm kanıtlarda elle komut yok ve makbuz metni olan her Run adımı seçeneği
gösterir — son koşumda 24 Run kanıtı) · **T-14** (yeni; statik: koşucuda elle komut / `receiptFromEvidenceCommand` yok, Recover makbuza yazmaz; blok aynı seçeneği gösterir, yorum dışı
blok kaynağında "elle komut" ifadesi yok) · **O-8** (değişti; Run sonu metni "kanıttaki kurtarma adımı da bu seçeneği gösterir", "elle komut" ifadesi yok).

**Ölçülmeyenler / sınır (R04-b).** (1) **Gerçek `Invoke-RecoverMode` ile gerçek koşucunun TEK zincirde koşumu ölçülmedi:** blok canlı DB adını (`hukuk_db`) ve canlı yolları kendisi
kurar; zincir iki yarıda ölçüldü — blok → sahte koşucu (RG-1) ve bloğun çıkarma fonksiyonları + gerçek koşucu (Z19-b). (2) Tamamlanmış Run kanıt dizinindeki `owner-block.json`,
`goref-consumed.json` ve GO defteri satırı Z19-b'de öz-testin yazdığı eşdeğerlerdir (bloğun gerçek Run'ı gerçek koşucuyla koşulmadı); manifest bloğun kendi fonksiyonuyla yazıldı.
(3) Kanıtta makbuz yokken `-ReceiptFile` dalı (bloğun `elseif` dalı) yalnız kanıt okunamadığında / makbuz metni yokken görülür; koşucunun kendi Run'ında oluşmaz (birim: Z18 (v)).
(4) 5xx gözlem metni uçtan uca ölçülmedi (birim + statik: T-13 — değişmedi). (5) Manifestin bağımsız çapası yok; ikinci çıkarma / ikinci Recover kodla engellenmez — değişmedi.
(6) Canlıda hiçbiri koşulmadı; B3 açık (değişmedi).

#### R04-c (aşama 3; 2026-10-05) — odak doğrulamanın beş somut noktası (K1–K5)

Kapsam (owner: "Yeni genel inceleme turları açma. Yalnız bulunan somut kusurun gerektirdiği düzeltme ve testi yap"; D-6 §13.9 "R04-c" ile aynı ilke): aşama 2 uç baytlarının
(`bcea51c1`) odak doğrulaması beş somut nokta bıraktı (kanıt: `…\asama2\dogrulama-odak\` — `tur2-*.log`, `odak-probe.ps1`). Beşi de bu aşamada önce kaynakta ve o günlüklerde
doğrulandı (iki kabukta), sonra giderildi. **Değişen: yalnız owner bloğu, blok öz-testi ve bu belge.** Koşucu, sahte API ve koşucu öz-testi **değişmedi** → `PkgPins` ve
`$ExpPackage` **değişmedi** (§7 "R04-c pin ölçümü"); Postgres açılmadı, koşucu öz-testi **koşulmadı**. Kapılar, Run sırası, node çağrısı ve **çıkış kodları değişmedi** (yeni
DUR'lar mevcut kapı kodu 90 ile biter); Recover yine **soru sormaz**. Canlı Run / Recover **koşulmadı**, owner bloğu canlı modda **çalıştırılmadı**; canlı ağaç, canlı DB,
canlı `.env`, canlı portlar ve canlı kanıt dizinlerine dokunulmadı. Kanıt kökü: `D:\Development\HUKUK_YAZILIMI\HY_R27_AGENT_EVIDENCE\r04\d6-d7-recover-hazirlik\asama3\`
(`d7\`, `d7\neg\`, `neg-ayna\`, `odak-yeniden\`).

| # | Odak bulgusu (aşama 2 baytları; probe kalemi) | Düzeltme (blok) | Blok öz-testi |
|---|---|---|---|
| K1 | Recover bitiş ekranındaki "PORTAL ERİŞİMİ … KAPALI" satırı yalnız DB durumundan kuruluyor ve **her zaman yeşil** basılıyordu; aynı kanıtta yeni giriş reddi FAIL (kapanıştan sonra giriş HTTP 200) ya da ölçülemeyen iken de (A13-m, A13-m-akis: çıkış 6, satır yeşil) | `Get-RecoverPortalAccess` DB KAPALI iken kanıttaki P7-C3L / P7-C3D verdict'lerini okur; gösterilen ad (`goster`) ve renk (`renk`) bunlara bağlıdır (aşağıdaki tablo). "Mevcut oturum reddi Recover'da ÖLÇÜLEMEZ" metni ve çıkış kodu aynı | **RG-9** (değişti): 16 koşum; metin + satır rengi; yeşil satır sayısı = 1 |
| K2 | `-ReceiptFile <Run dizinindeki makbuz>` reddedilmiyordu: node 1, `recover-*` Run dizininde açıldı → **Run kanıt dizini değişti** (A12-c) | `Assert-ReceiptFileRoute`: makbuzun dizininde `SHA256-MANIFEST.txt` varsa ve o dizindeki kanıtta makbuz metni (`recovery.makbuzJson` — Run sonu ekranının `-RunEvidenceDir` önerdiği koşulun aynısı) varsa **DUR** (90; node çağrılmaz, Recover bilgi metni gösterilmez) + "-Mode Recover -RunEvidenceDir '<dizin>' kullanın". Manifest var ama kanıtta makbuz metni yok / kanıt okunamıyor (tek kalan yol) → izin; "bu yol recover-* dizinini Run kanıt dizinine açar — orijinal kanıt dizini DEĞİŞİR; manifest kapsamı dışında kalır" Recover başında (UYARI / DİKKAT), Recover bitişinde (NOT) ve Run sonu ekranının `-ReceiptFile <makbuz>` dalında yazılır (D-7 koşucusu Recover'da makbuza yazmaz — D-6'daki "makbuzu yerinde yeniden yazabilir" ifadesi bu pakette yoktur). Manifesti olmayan dizin: davranış değişmedi | **RG-12** (yeni) |
| K3 | Makbuz geri okuma doğrulamasından sonra, node başlamadan önce değişirse fark edilmiyordu: node 1, kayıttaki `makbuzSha256` ≠ koşucunun okuduğu (A9-e); D-7'de Recover'dan sonra makbuzun değişip değişmediği ekranda gösterilmiyordu | `New-RecoverInputFromRun` yol + kayda yazılan makbuz özetini döndürür; `Assert-RecoverInputUnchanged` makbuzu **iki noktada** yeniden ölçer (Recover kanıt dizini açılmadan önce · `Invoke-Node` satırının hemen öncesinde); fark / okunamadı → dizin KULLANILMAZ + DUR (90; node çağrılmaz). Recover'dan sonra "RECOVER GİRDİSİ (makbuz): Recover'dan sonra DEĞİŞMEDİ / DEĞİŞTİ …" satırı (D-6 R04-b satırının ikizi; çıkış kodu değişmez) | **RG-13** (yeni); **RG-1**, **RG-10** (değişti) |
| K4 | Manifest yokken (Run beyan adımında kesilmiş) DUR metni kalan yolu söylemiyordu (A4-p-metin) | DUR metnine eklendi: "Run tamamlanmamış olabilir (manifest yazılmadan kesilmiş): bu durumda bu paketle tanımlı tek yol, kanıt dizinindeki makbuz dosyası okunabiliyorsa '-Mode Recover -ReceiptFile <makbuz>' — bu yol Run kanıt dizinine yazar; karar owner / CLIENT." + kanıt dizinindeki makbuz dosyasının ölçülen durumu (VAR … EŞİT / YOK / OKUNAMIYOR / BAYAT; kullanılamıyorsa "bu paketle Recover BAŞLATILAMAZ", bayatsa "Recover ÖNERİLMEZ"). Kapı aynı (yalnız metin + salt okuma ölçümü) | **RG-14** (yeni) |
| K5 | Makbuz yazıldıktan sonraki adımda **beklenmeyen** istisna (ör. okuma kapısında dosya kilidi) olursa dizin KULLANILMAZ diye işaretlenmiyor ve o dizindeki makbuz sonradan `-ReceiptFile` ile kabul edilebiliyordu (A16-a) | `New-RecoverInputFromRun` içinde yazımdan sonraki tüm adımlar (yazım, geri okuma, okuma kapısı, kaynağın yeniden ölçümü, kayıt yazımı) **tek try/catch** içinde: "Recover girdisi hazırlanamadı: yazımdan sonraki adımda BEKLENMEYEN hata (<tür>) …" + işaret + DUR. İşaretleme tek fonksiyonda (`Set-RecoverInputUnusable`) | **RG-15** (yeni) |

**K1 — Recover bitiş ekranı (güncel).** `PORTAL ERİŞİMİ (son ölçüme göre, bu Recover'ın kanıtından; DB durumu + yeni giriş reddi ölçütleri): <ad> — <ölçülen>. Yeni giriş reddi
kanıttaki P7-C3L/D satırlarından okunur; mevcut oturum reddi Recover'da ÖLÇÜLEMEZ.` Son ölçüm sırası değişmedi (`afterMeasure` → `after` → `before`).

| Gösterilen ad | Renk | Koşul |
|---|---|---|
| `AÇIK` — "portal hesabı AKTİF (…)" / "portal kapanışı TAMAMLANMADI: hesap pasif ama müvekkil erişim bayrağı açık (…)" | kırmızı | son ölçümde `isActive=true` ya da `hasPortalAccess=true` (P7-C3L/D ne olursa olsun) — metin değişmedi |
| `KAPALI (DB + yeni giriş reddi PASS)` — "<DB metni>; P7-C3L=PASS, P7-C3D=PASS" | **yeşil** | DB kapalı (hesap pasif + bayrak kapalı) **ve** iki ölçüt PASS — yeşil **yalnız** bu durumda |
| `DB'de kapalı AMA yeni giriş reddi FAIL (P7-C3L=…, P7-C3D=…) — erişim kapalı SAYILMAZ` — "<DB metni>" | **kırmızı** | DB kapalı; ölçütlerden biri FAIL (aynı kimlikli birden çok satır varsa biri FAIL ise FAIL) |
| `DB'de kapalı; yeni giriş reddi ÖLÇÜLEMEDİ (P7-C3L=…, P7-C3D=…)` — "<DB metni>" | **sarı** | DB kapalı; FAIL yok ve en az biri PASS değil: ÖLÇÜLEMEYEN / satır yok / satır tek değil / tanınmayan değer. **Portal hesabı satırı DB'de yokken** de bu satır gösterilir (koşucu hesap yokken giriş reddini ölçmez — kaynaktan: `closePortal` hesap-yok dalı C3 satırı üretmeden döner) |
| `ÖLÇÜLEMEDİ` — somut neden | sarı | Recover kanıtı okunamıyor · `portalClose` yok · geç oluşma dışlanamadı · kapanış adımı hatası · DB değeri yok — değişmedi |

**Öz-testler — SON BAYTLAR** (blok `04BE4AC4…`, blok öz-testi `94C315E8…`; koşucu `20DC82E2…`, koşucu öz-testi `466EC3EF…`, sahte API `BEF6E732…` — **değişmedi**):

| Koşum | Sonuç | Kanıt (`asama3\`) |
|---|---|---|
| `d7-owner-block-selftest.ps1` — son baytlar, bu belgenin son hâliyle (G-2 / G-6 belgeyi okur) | **88/88 PASS** Windows PowerShell 5.1 · **88/88 PASS** PowerShell 7 (PIN-1 9/9, digest `16D95F54…` = `$ExpPackage`); 84 + 4 (RG-12 … RG-15) = 88; RG-1, RG-9 ve RG-10 değişti; betik sha256'ları önce = sonra | `d7\blok-oz-test-son-winps51.log`, `…-pwsh7.log`, `…-sha-once.txt`, `…-sha-sonra.txt` |
| **Negatif — blok öz-testi (yeni) · aşama 2 ucu aynası** (`git archive bcea51c1`: blok `01D5EA53…`, koşucu `20DC82E2…`; aynadaki ESKİ belgeyle) | **81/88**, çıkış 1, iki kabukta aynı küme — FAIL = tam olarak **RG-1, RG-9, RG-10, RG-12, RG-13, RG-14, RG-15** (7; yeni + değişen kalemlerin tamamı; her biri senaryonun ölçülen eski davranışıyla FAIL: ör. RG-1 "DEĞİŞMEDİ" satırı yok, RG-12 node 1 + Run dizini değişti, RG-13 node 1, RG-15 işaret 0); PIN-1 PASS (aynada pin + koşucu tutarlı) | `d7\neg\neg-blok-bcea51c1-winps51.log`, `…-pwsh7.log`, `…-sha-once.txt`, `neg-ayna\bcea51c1-kurulum.txt` |
| Odak probe'un yeniden koşumu (`asama2\dogrulama-odak\odak-probe.ps1` **değiştirilmeden**; yeni blok baytlarına karşı; 109 kalem) | PowerShell 7: DİKKAT **1** (A1-portal — K1'in beklenen sonucu: probe, kapalı DB + C3 satırı olmayan kanıt için yeşil bekliyordu; artık sarı) · Windows PowerShell 5.1: DİKKAT **2** (A1-portal + A4-i — aşağıda "ölçülmeyenler (5)"). **A9-e, A12-c, A16-a artık BEKLENEN** (node 0, çıkış 90 · Run dizini değişmedi · KULLANILMAZ işareti var); A13-m-akis satırı kırmızı; çapraz kabuk (Run bir kabukta, `-RunEvidenceDir` Recover diğerinde) iki yönde başladı. Aşama 2 baytlarında aynı probe: PS 7 DİKKAT 3 (A9-e, A12-c, A16-a), WinPS 5.1 DİKKAT 4 (+ A4-i) | `odak-yeniden\asama3-d7-pwsh7.log`, `…-winps51.log`, `…-capraz.log`, `NOT.txt` |
| Ayrıştırma — son baytlar | iki ps1: ayrıştırma hatası 0 (Windows PowerShell 5.1 ve PowerShell 7); UTF-8 BOM'lu, CR 0 (LF) | `parse-iki-kabuk-son.log` |
| `PkgPins` / `$ExpPackage` | **DEĞİŞMEDİ** — iki kabukta ölçüldü (§7 "R04-c pin ölçümü") | `pin-degismedi.log` |
| `d7-selftest.js` (koşucu öz-testi) | bu aşamada **KOŞULMADI** — koşucu, sahte API ve koşucu öz-testi değişmedi (sha256'ları aşama 2 ile aynı: `00-baslangic-durum.txt`); son ölçüm **R04-b baytlarında** 88/88 (yukarıdaki R04-b tablosu). Postgres açılmadı | — |
| Ara koşumlar (belge düzenlenmeden önce; sonuç sayılmaz) | deneme 1: 88/88 iki kabukta · ara: 88/88 iki kabukta (son ps1 baytları; belge R04-c eklerinden önce) | `d7\deneme1-*.log`, `d7\ara-blok-oz-test-*.log` |

Yeni / değişen ölçütler (her ret kalemi **somut neden metnini** ister; kaynak sahte koşucuyla GERÇEK `Invoke-RunMode`'un ürettiği Run kanıt dizinidir): **RG-1** (değişti; K3) —
Recover'dan sonra makbuz baytları / sha256 = kayıt ve "RECOVER GİRDİSİ (makbuz): Recover'dan sonra DEĞİŞMEDİ (sha256 önce = sonra = <özet>" satırı bitiş satırından sonra ·
**RG-9** (değişti; K1) — sahte koşucunun Recover kanıtına `EXSTUB_EXTRA` ile P7-C3L / P7-C3D satırları verilir; 16 koşumda tek satır, çıkış kodu değişmeden (0 / 1 / 3 / 6), tek
node çağrısı; AÇIK ×2 kırmızı (P7-C3L/D PASS olsa da), KAPALI + PASS/PASS yeşil, FAIL varyantları ×4 kırmızı (FAIL/FAIL · PASS/FAIL · FAIL/ÖLÇÜLEMEYEN · aynı kimlikli iki
satırdan biri FAIL), ÖLÇÜLEMEDİ varyantları ×4 sarı (ÖLÇÜLEMEYEN/PASS · satır yok · tek satır eksik · aynı kimlikli iki PASS satırı), hesap yok sarı, ÖLÇÜLEMEDİ ×4 sarı; yeşil
satır sayısı 1; renk `Write-Host` kaydının `ForegroundColor` alanından ölçülür · **RG-10** (değişti; statik) — `$rin = New-RecoverInputFromRun $runEvidenceDir`; silme / üzerine
yazma taraması ve "soru komutu yok" (AST) taraması yeni üç yardımcı fonksiyonu da kapsar; `Invoke-RunMode` bunları çağırmaz · **RG-12** (yeni; K2) — (a) manifest + makbuz metni
var → DUR, node 0, Recover bilgi metni gösterilmedi, Run dizini (dosya adları + sha256) değişmedi, somut `-RunEvidenceDir '<dizin>'` yönlendirmesi; (a2) yönlendirilen yol aynı
dizinle çalışır (node 1, makbuz kardeş dizinde); (b) GERÇEK Run (kanıtta makbuz metni yok): Run sonu ekranı `-ReceiptFile <makbuz>` + DİKKAT cümlesi; `-ReceiptFile` Recover
başlar (node 1), UYARI / DİKKAT bitiş satırından önce, NOT sonra; ölçüm: `recover-*` Run dizininde açıldı → Run dizini değişti (makbuz dosyasının baytları değişmedi);
(b2) kanıt okunamıyor → aynı uyarıyla izin · **RG-13** (yeni; K3) — (a) kayıt dosyası yazılırken makbuza bayt eklenir → ilk ölçüm noktası: DUR, node 0, `recover-*` açılmaz,
işaret + neden, kayıttaki özet eski baytlara ait; o makbuz sonradan `-ReceiptFile` ile de reddedilir; (b) `Set-RunEnv` sırasında bayt eklenir → ikinci ölçüm noktası ("node
çağrısından hemen önce"): node 0, işaret, ortam temiz; (c) özet ölçülemezse "şimdi=okunamadı"; (d) statik: iki ölçüm, ikincisi `$rc = Invoke-Node` satırının hemen öncesinde;
(e) koşucu taklidi makbuzu Recover'da yeniden yazarsa (`EXSTUB_REWRITE=force`) bitiş ekranı kırmızı "… DEĞİŞTİ ya da okunamadı (sha256 önce=<kayıttaki> · sonra=<yeni>) …" der,
çıkış kodu değişmez · **RG-14** (yeni; K4) — DUR metni + makbuz dosyasının dört durumu (okunabilir / yok / bozuk / bayat); kapı aynı (kardeş dizin yok, node 0); (e) yönlendirilen
`-ReceiptFile` manifesti olmayan dizinde başlar (davranış değişmedi) · **RG-15** (yeni; K5) — okuma kapısı (IOException) ve geri okuma karşılaştırması
(InvalidOperationException) istisna taklitleri → işaret + DUR, kayıt yok, node 0; işaretli dizindeki TAM makbuz `-ReceiptFile` ile de reddedilir; statik: dış try/catch.

**Ölçülmeyenler / sınır (R04-c).** (1) **K3'ün kapatamadığı aralık:** bloğun son ölçümü ile koşucunun makbuzu kendi okuması arasındaki aralık blokla kapatılamaz (koşucu
değişmedi); Recover'dan sonraki ölçüm ayrıca gösterir. Ölçüm sha256 eşitliğidir: dosya değiştirilip **aynı baytlara** geri getirilirse görülmez. (2) **K2 kapısı makbuzun kendi
dizinine bakar:** makbuz Run kanıt dizininin bir **alt dizinindeyse** kapı devreye girmez (`recover-*` o alt dizinde açılır); makbuz başka bir dizine kopyalandıysa Run dizini
zaten değişmez. Makbuz yalnız dosya adıyla (dizinsiz) verilirse blok dizini çözemez ve node çağrılmadan durur (önceki davranış; odak A10-c). (3) **K2'nin izin verdiği iki
durumda** (manifest yok · manifest var + kanıtta makbuz metni yok / kanıt okunamıyor) `-ReceiptFile` **Run kanıt dizinine yazar** (`recover-*` dizini): owner şartı "makbuz
tamamlanmış Run kanıt dizininin dışına yazılır, orijinal kanıt ve manifest değişmez" bu yolda **karşılanmaz**; blok bunu ekrana yazar ama engellemez (bu paketle tanımlı tek
yol). Karar owner / CLIENT'a aittir. (4) **K1 — hesap satırı yok → sarı** bir tasarım kararıdır (satır "giriş reddi ölçülmedi" der; yeşil yalnız ölçülmüş ret içindir). Hesap
satırı yokken müvekkil erişim bayrağı açık (`hasPortalAccess=true`) durumu ayrıca adlandırılmadı (odak A13-g2 gözlemi; bu aşamanın beş noktasında değil) — satır sarıdır ve değer
metindedir. (5) **A4-i (odak probe; yalnız Windows PowerShell 5.1):** manifestte aynı dosya büyük/küçük harf farkıyla iki kez geçerse PowerShell 7 reddeder, Windows PowerShell
5.1 kabul eder (iki satırın özeti de dosyaya eşit olmak zorundadır — atlatma değil, fazladan girdi). Beş nokta arasında değildir; **dokunulmadı**. (6) Doğrulanmış (işaretsiz)
kardeş dizindeki makbuzun sonradan `-ReceiptFile` ile verilmesi (odak A17-b) ve aynı Run dizini ile ikinci `-RunEvidenceDir` (A17-a) kodla engellenmez — değişmedi. (7) Gerçek
`Invoke-RecoverMode` ile gerçek koşucunun tek zincirde koşumu ölçülmedi (R04-b sınırı; değişmedi): K1'in okuduğu P7-C3L/D satırları blok öz-testinde sahte koşucunun
kanıtındadır (kimlik ve verdict değerleri koşucu kaynağından okundu: `judge401` → PASS / FAIL / UNMEASURED; hesap yokken satır yok); "… DEĞİŞTİ" satırı yalnız koşucu taklidiyle
ölçüldü (D-7 gerçek koşucusu Recover'da makbuza yazmaz — Z19-b). (8) Canlıda hiçbiri koşulmadı; owner bloğu canlı modda çalıştırılmadı; B3 açık (değişmedi).

## 15. R05 — kapsam ihlalinde dur (2026-10-08; owner kararı "D-7 dar düzeltme")

**Karar (owner, 2026-10-08).** Kapsam dışı üç ölçütten (D7-4N yabancı tenant dosyası · D7-4S aynı tenantta başka müvekkilin dosyası · D7-4U bulunmayan kimlik)
herhangi biri **FAIL ya da ÖLÇÜLEMEYEN** ise kalan mesaj / yanıt / okundu adımlarına geçilmez, giriş bilgisi gösterilmez, telefon adımı başlatılmaz; kapanış ve
gerekli kanıt yazımı çalışmaya devam eder. FAIL, ÖLÇÜLEMEYEN'e çevrilmez; yalnız ÖLÇÜLEMEYEN varsa sonuç FAIL diye sunulmaz; atlanan adımlar PASS sayılmaz.
Makbuzsuz dar durum için yama yapılmaz (§10 K-7). Bu revizyon canlı Run / Recover yetkisi **değildir**.

### 15.1 Önceki davranış (R04-b baytları; kaynaktan okundu, öz-testte de böyle bekleniyordu)

Üç ölçüt gösterim kapısında değildi. Biri FAIL ya da ÖLÇÜLEMEYEN olsa da koşucu kendi dosyasıyla mesajı, personel yanıtını, okundu işaretlemeyi ve personel
okumasını koşuyor; kapıdaki altı ölçüt PASS ise giriş bilgisini gösterip telefonu bekliyor ve ikinci personel yanıtını gönderiyordu. Eski öz-test ölçütü Z3 bunu
("akış geri kalanı PASS; gösterim + telefon yapılır") beklenen davranış sayıyordu.

### 15.2 Değişiklik

| Dosya | Değişen |
|---|---|
| `d7-portal-messages-live-run.js` | Üç ölçütün **her birinin yargısından hemen sonra** verdict PASS değilse koşucunun mevcut `stopped` alanı kurulur ve ölçüm bloğundan çıkılır (**istisna fırlatılmaz**). Koşulmayan ölçütler ÖLÇÜLEMEYEN yazılır (gerekçe: durduran ölçüt ve verdict'i). Durduran ölçütün satırına dokunulmaz. Üç ölçüt gösterim kapısı listesine eklendi (ikinci emniyet). Kanıtta yeni alan `scopeStop` (`olcut`, `verdict`, `kosulmayan`). O ana kadar yazılan mesaj kimlikleri (ürünün yanlışlıkla kabul ettiği satır dahil) makbuza yazılır. **Kapanış (`finally`) ve çıkış kodu fonksiyonları DEĞİŞMEDİ** |
| `d7-fake-portal-api.js` | `scope` düğmesi (tür N / S / U · davranış accept / 429 / 503 / hang): yalnız o kapsam dışı denemeye uygulanır (deneme, koşucunun mesaj içeriği son ekinden tanınır). Diğer davranışlar aynı |
| `d7-selftest.js` | Z24-a … Z24-i ve T-15 yeni; Z3 ve Z4-a yeni davranışa göre değişti (§15.4) |
| `d7-owner-live-block.ps1` | yalnız koşucu pini + `$ExpPackage` + başlık notu |

**Durma noktası.** Koşucu **ilk** PASS olmayan ölçütte durur; sıradaki kapsam dışı denemeler de **gönderilmez** (ör. D7-4N FAIL iken D7-4S ve D7-4U
ÖLÇÜLEMEYEN kalır). Gerekçe: ihlal ya da belirsizlik görüldükten sonra yeni yazma denemesi yapılmaz.

### 15.3 Sonuç sınıfı (çıkış kodu fonksiyonları değişmedi; öz-testte ölçüldü)

| Durum | Durduran ölçüt | Sonraki ölçütler | Çıkış |
|---|---|---|---|
| Ürün kapsam dışı denemeyi kabul etti / 400 dışında yanıt verdi (503 ve 429 hariç) | **FAIL** (ÖLÇÜLEMEYEN'e çevrilmez) | ÖLÇÜLEMEYEN | **2** |
| Yanıt yok (zaman aşımı) · 503 · 429 | **ÖLÇÜLEMEYEN** (FAIL üretilmez; FAIL sayısı 0) | ÖLÇÜLEMEYEN | **3** |
| Yukarıdakilerden biri + portal kapanışı doğrulanmadı | verdict kanıtta **aynen durur** | ÖLÇÜLEMEYEN | **6** (kapanış başarısızlığı öne geçer; ihlal satırı gizlenmez) |
| Üçü de PASS | — | akış önceki gibi | önceki gibi |

### 15.4 Hedefli doğrulama (son baytlarla; ölçülen)

| Koşu | Sonuç |
|---|---|
| `d7-selftest.js` (koşucu öz-testi; tek kullanımlık `postgres:16-alpine` konteyneri, yalnız geri döngü, `_test` adlı veritabanı, şema `prisma db push --skip-generate`; kütüphane kökü canlı olmayan R27 çalışma ağacı; sahte API 8200 / 8459; iş sonunda konteyner kaldırıldı) | **98/98 PASS**, çıkış 0 |
| `d7-owner-block-selftest.ps1` — Windows PowerShell 5.1 | **88/88 PASS**, çıkış 0 (PIN-1: 9/9 + yeni paket digest'i) |
| `d7-owner-block-selftest.ps1` — PowerShell 7 | **88/88 PASS**, çıkış 0 |

Yerel kayıt (git dışı): `r04\d7-r05-ihlalde-dur\` (koşu günlükleri, dosya özetleri önce = sonra). İlk koşu (yeni ölçüt kimlikleri mevcut Z22 kimlikleriyle çakışırken;
98/98) **son sayılmadı**; kimlikler Z24 yapıldıktan sonra son baytlarla yeniden koşuldu. Mutasyon turu **koşulmadı**.

Yeni / değişen ölçütler:

- **Z24-a … Z24-f** — üç ölçütün her birinde FAIL ve ÖLÇÜLEMEYEN yolu (FAIL: ürün denemeyi kabul eder, 201 + satır; ÖLÇÜLEMEYEN: D7-4N'de 429, D7-4S'de 503,
  D7-4U'da yanıtsız). Her birinde ölçülen: durduran ölçütün verdict'i; önceki ölçütler PASS; sonraki kapsam / mesaj / yanıt / okundu ölçütleri ve gösterim /
  telefon / ikinci yanıt ÖLÇÜLEMEYEN (hiçbiri PASS değil); durdurmadan sonra dış mesaj gönderimi, okunmamış sayacı, okundu işaretleme ve yerel personel mesaj
  ucu çağrısı **0** (sahte API'nin çağrı kayıtlarından); giriş bilgisi gösterilmedi (gösterim kaydı boş, telefon taklidi tetiklenmedi); kapanış ölçütlerinin
  **tamamı PASS** (portal pasif, erişim kapalı, aktif personel 0, açık dosya 0); çıkış 2 (FAIL sayısı 1) / 3 (FAIL sayısı 0); makbuzdaki mesaj kimliği sayısı.
- **Z24-g / Z24-h** — durdurma + kapatma çağrısı 500: çıkış **6**; durduran ölçüt kanıtta FAIL / ÖLÇÜLEMEYEN olarak durur; portal kapanış ölçütleri FAIL;
  kurtarma notu var; personel / dosya kapanışı yine çalıştı; sonraki işlevsel çağrı ve gösterim yok.
- **Z24-i** — hatasız akış korunur (Z1 koşumu): kapı listesi dokuz kalem, hepsi PASS; `scopeStop` yok; gösterim yapıldı; çıkış 0.
- **T-15** (statik) — üç durdurma noktası kendi dosyasıyla mesajdan önce ve sırayla; durdurma fonksiyonu istisna fırlatmaz; kapı listesi; kapanış `finally`'de.
- **Z3** (değişti) — eski "kapsam dışı kabul" taklidi artık D7-4N'de durur (FAIL, çıkış 2; gösterim yok; ikinci kapsam denemesi yapılmadı).
- **Z4-a** (değişti) — müvekkil mesajı 500 iken kapsam denemesi de 500 döner → D7-4N FAIL → durur; koşucu hiç mesaj yazmadığı için P7-MSG-KEPT ÖLÇÜLEMEYEN.

### 15.5 Sınırlar ve ölçülmeyenler

1. **Canlıda koşulmadı.** Ölçümler sahte API + tek kullanımlık veritabanıyladır; ürünün gerçek davranışı ilk canlı koşumda ölçülür.
2. **Durdurma ilk müvekkil mesajından SONRADIR** (D7-1 / D7-2 kapsam ölçütlerinden önce koşar): en az 1 mesaj satırı her durumda yazılır ve kalır (silme ucu yok).
   Ürün kapsam dışı denemeyi kabul ederse o satır da kalır; koşucu onu kendi satırı sayar, makbuza yazar ve "saklandı" diye raporlar — **silmez**.
3. **İlk PASS olmayan ölçütte durulduğu için** sonraki kapsam ölçütleri o koşumda **ölçülmez** (ÖLÇÜLEMEYEN). Üçünün de sonucu isteniyorsa bu ayrı bir karardır.
4. **Yanıtsız denemede** (zaman aşımı) ürünün satırı sonradan yazması olasılığı için bekleme yoktur; kapanıştaki kalıntı sayımı o anki durumu ölçer.
5. **400 beklenir:** 400 dışındaki her yanıt (503 / 429 hariç) FAIL'dir ve durdurur; yanıt **gövdesi** ölçülmez (başka nedenle gelen 400 de PASS sayılır — §9, değişmedi).
6. **Blok:** yalnız pin ve başlık notu değişti. Blok `scopeStop` alanını ayrıca göstermez; durdurma nedeni koşucunun konsol özetindeki ölçüt satırlarında ve
   kanıttaki `stopped` / `scopeStop` alanlarındadır. Bloğun gerçek koşucuyla tek zincirde koşumu bu revizyonda da ölçülmedi (blok öz-testi sahte koşucu kullanır).
7. **Makbuzsuz dar durum** (kurulum bitti, makbuz yok) için yol tanımlanmadı — owner kararı §10 K-7.
8. SEC-PORTAL-ADMIN-MSG-01 açık (değişmedi; bu paket ölçmez ve kapatmaz).

### 15.6 Durum

**HAZIR — CANLIDA KOŞULMADI.** Güncel baytlar R05'tir (§7). Preflight / QrTest / Run / Recover canlıda koşulmadı; D-7 kabulü **yok**.

*(Bu satır R05 tarihlidir. Güncel baytlar R06'dır — §16; 2026-10-09'daki canlı koşumlar için belge başındaki R06 notuna bakın. D-7 kabulü yine **yok**.)*

## 16. R06 — 300 saniyelik gözlem penceresi (2026-10-09; owner kararı)

**Karar (owner, 2026-10-09).** Gözlem penceresi 120 saniyeden 300 saniyeye çıkarılır; D-7'de bu, giriş algılandıktan sonraki tek gözlem penceresidir. Giriş bekleme sınırı, kapanış mantığı ve çıkış kodları
değişmez; "tamamlandı" girdisi eklenmez. QR ekranında numaralı telefon adımları ve aşama süreleri açıkça görünür. Bu revizyon yeni canlı Run / Recover yetkisi **değildir**.

**Gerekçe (değerlendirme; kesin kök neden DEĞİL).** 2026-10-09'daki canlı koşumda telefonda mesaj listesi ve ikinci personel yanıtı gözlenmedi. Ölçülen zaman çizelgesi 120 saniyelik pencerenin
telefon adımları için yetmemesiyle **uyumludur**; bunun tek neden olduğu ölçülmedi (telefondaki işlemlerin kesin zamanı kayıtlı değildir).

### 16.1 Değişiklik

| Dosya | Değişen |
|---|---|
| `d7-portal-messages-live-run.js` | canlı `D7_VIEW_MS` 120000 → **300000** (tek sabit); owner ekranı metni: numaralı beş telefon adımı ve "SÜRELER:" satırı. Bekleme döngüsü, kapanış (`finally`), verdict'ler ve çıkış kodu fonksiyonları **değişmedi**; koşucu konsoldan girdi **okumaz** |
| `d7-owner-live-block.ps1` | `$LiveParams` içindeki aynı süre 300000; koşucu pini; `$ExpPackage`; başlık notu. Kapılar, Run sırası, node çağrısı, ekran metinleri, Recover yolu değişmedi |
| `d7-selftest.js` | P-1 canlı inceleme süresini açıkça ölçer; **P-VIEW** yeni (aşağıda) |
| `d7-owner-block-selftest.ps1` | canlı süre tablosu beklentisinde yalnız inceleme süresi 300000 |

**Telefon adımları (owner ekranındaki sıra).** 1) QR → bir kez giriş (portal Ana Sayfası açılır; mesaj sayfası değil) · 2) üst menüden "Mesajlar" · 3) **GÖZLEM A — mesaj listesi** (girişten önce yazılan üç mesaj) · 4) **GÖZLEM B — ikinci yanıt** (metni `…-OFFICE-2`; ilk yanıttan son ekiyle ayrılır) ve zil rozeti · 5) koşum bitince owner bloğu isteyince bir kez yenileme ve beyan. Adım listesi QR'ın ÜSTÜNDEdir; QR, adres ve giriş bilgisi ilk ekranın son satırlarıdır.

### 16.2 Süreler — bunlar BEKLEME sürelerinin üst sınırlarıdır, kesin toplam koşum süresi DEĞİLDİR

Giriş bekleme en çok 20 dk · gözlem penceresi 300 sn. Koşumun toplam süresi bu beklemelere ek olarak kurulum, makine ölçümleri, kapanış çağrıları ve owner'ın giriş / beyan sürelerini içerir;
belgede kesin bir toplam süre sınırı **verilmez** ve kodda toplam koşum için ayrı bir üst sınır **yoktur** (giriş beklemesinin ve gözlem beklemesinin kendi üst sınırı vardır; yoklama döngüsündeki tek tek veritabanı sorguları için ayrı bir zaman aşımı bu revizyonda ölçülmedi).
Pencere uzadığı için sentetik portal hesabı ve personel oturumu daha uzun açık kalır: personel token süresi canlıda ölçülmedi; kapanışta 401 / 403 gelirse mevcut tek yeniden
giriş yolu (R03) çalışır — değişmedi.

### 16.3 Hedefli doğrulama (son baytlarla; ölçülen)

| Koşu | Sonuç |
|---|---|
| `d7-selftest.js` (tek kullanımlık `postgres:16-alpine` konteyneri, yalnız geri döngü, `_test` adlı veritabanı; kütüphane kökü canlı olmayan R27 çalışma ağacı; sahte API; iş sonunda konteyner kaldırıldı) | **99/99 PASS**, çıkış 0 |
| `d7-owner-block-selftest.ps1` — Windows PowerShell 5.1 | **88/88 PASS**, çıkış 0 |
| `d7-owner-block-selftest.ps1` — PowerShell 7 | **88/88 PASS**, çıkış 0 |

**P-VIEW** (yeni) — ölçtükleri: canlı inceleme süresi sabitinin 300000 ms olması; giriş bekleme süresinin değişmemesi; koşucu kaynağında inceleme beklemesi çağrısının sayısı (tam bir) ve `process.stdin` geçmemesi (ikisi de kaynak aramasıdır — çalışma anı davranışı değil); normal senaryonun (Z1) gösterim dosyasında numaralı beş adım, iki gözlemin ayrı adımlar olması, ikinci yanıt metninin (`…-OFFICE-2`) ekranda bulunması, "SÜRELER:" satırının Z1 kanıtındaki süre değerleriyle (ekrandaki gibi saniyeye / dakikaya yuvarlanmış hâliyle) **birebir** eşleşmesi (D-7 adımlarında süre geçmez), ilk QR satırının 3. ve 4. adımdan ve "SÜRELER:" satırından SONRA, giriş bilgisinden ÖNCE gelmesi (sıra yalnız 3. ve 4. adım için ölçülür; 1., 2. ve 5. adımın yalnız ekranda BULUNDUĞU ölçülür, konumu değil), giriş bilgisinin ilk ekranın son satırları olması ve "GÖZLEM süresi başladı" satırının giriş bilgisinden SONRA gelmesi. Öz-testler kısa test süreleriyle koşar: ekranda **300 sn yazdığı** ve 300 saniyenin **gerçek süre olarak beklendiği ölçülmedi** (ölçülen: canlı kipte sabitin 300000 olması, pencereden devralınan değerlerin yok sayılması ve ekranın süreyi koşumun süre değerinden yazması). Mutasyon turu **koşulmadı**.

### 16.4 Sınırlar

1. Canlıda bu baytlarla koşum **yapılmadı**. Telefon gözlemlerinin 300 saniyede tamamlanacağı bir **öngörüdür**, ölçüm değildir.
2. İş erken bitse de koşucu sürenin dolmasını bekler ("tamamlandı" girdisi yoktur — owner kararı).
3. Kapalı / geçersiz oturumda portalın giriş sayfasına yönlendirmek yerine hata ya da boş durum göstermesi ayrı bir ürün gözlemidir; bu revizyonun **kapsamı dışındadır**.
4. Önceki koşumların kanıtlarına dokunulmadı.
5. Ekran pencereyi boyutlandırmaz ve temizlemeden alta ekler: ilk ekran kısa bir konsol penceresine sığmayabilir; numaralı adımlar QR'ın üstünde kalır (Run adımındaki "pencereyi büyütün" notu). Owner'ın pencere yüksekliği ölçülmedi.

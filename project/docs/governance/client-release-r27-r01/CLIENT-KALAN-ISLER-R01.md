# CLIENT — KALAN İŞLER TEK ÇALIŞMA LİSTESİ (R03) · 2026-10-03

> **DURUM: CLIENT GENEL KABUL TAMAMLANMADI.** Bu belge CLIENT'in kalan kabul işlerini tek yerde toplar: D-1…D-9, H1…H8, açık
> güvenlik işleri, hazır teslimler ve tek owner karar listesi. Belge **kabul vermez**, sayaç ilerletmez ve hiçbir canlı işlemi
> yetkilendirmez. Yeni canlı Run/Recover, e-posta gönderimi, yayın, migration, servis/SMTP/firewall değişikliği ve PR merge'i ayrı
> owner kararıdır (§11).
>
> **R02'de değişenler** (R01 metni git geçmişindedir): D-5 teşhisi kanıtın taşıdığı kesinlik düzeyine çekildi (§3) · beyan
> penceresinin kapandığı ölçüldü, kanıt paketi "tamamlanmadı" (§3.2) · tablolar "mevcut kabul / eksik kanıt / hazırlık durumu /
> bağımlılık / sonraki işlem / owner kararı" sütunlarına geçti · D-6/D-7 koşucu öz-testleri teslim edilen dosyalarla tekrarlanabilir
> (§4) · D-8 kapsam boşluklarının kabule etkisi (§5) · H3/H6/H8 ölçüt + kanıt + beyan taslağı (§7) · hazırlık hükmü (§10).
>
> **R03'te değişenler (2026-10-03):** dört PR birleştirildi (§9) · D-5 koşumunun ikinci takip kaydı (iki eksik beyan, bugünkü özet
> envanteri, açık beyan / çıkarım ayrımı) · A2 owner kararıyla ürün düzeltmesi (PORTAL-RESET-FORM-01, #2900) · "teşhis satırı yok →
> API'ye ulaşmadı" ifadesi düzeltildi (§3.1) · KR-6 canlı salt okuma sayımı yapıldı · D-6 kapanış düzeltmesi yerelde hazır, D-7
> kapanışı ve D-8 sonda kapsamı sırada (§4, §5) · H6/H8 yayın adayına karşı yeniden değerlendirildi, H1/H2/H4/H5/H7 kararları günlük
> dille (§7) · karar listesi güncellendi (§11). Owner'ın 2026-10-03 karar tablosu koordinasyon kaydındadır; bu belge onu yalnız
> CLIENT kalemleri için anar.
>
> Kaynak ayrımı: **[Ö]** bu çalışmanın kendi ölçümü (salt okuma ya da izole test) · **[B]** mevcut kayıt belgesinin iddiası
> (yeniden ölçülmedi) · **[K]** yayın koordinatörünün ölçümü (aday doğrulama kaydı; depoda değil) · **[O]** owner beyanı (makine
> ölçümü değildir).

## 1. Kimlikler — `main` ile canlı ayrı tutulur

| Konu | Değer | Kaynak |
|---|---|---|
| Canlı ürün | **R27** — kaynak `1b758d29`, API dist `E28A6863…5134`, WEB `B2DEE365…F621` / `W2UQpBPD…`; migration 0 | [B] `record/R27-LIVE-RECORD-R01.md` §1 |
| `main` | R03 tabanı `5477a073` (#2885 dahil). **main ≠ canlı**: `1b758d29` `main`'in atası değildir; `main` canlı adaydan 170'ten fazla commit ve 5 migration ileridedir (`main` sık ilerler) | [Ö] git |
| Canlı veritabanı kodlaması | **UTF8** — salt okunur `SHOW server_encoding`, 2026-10-02 20:39Z; yalnız bu tek okuma yapıldı (owner talimatı CLIENT-HAZIRLIK-KAPANISI-R02 madde 3: "bu okuma yetkilidir"); çıktı yerel kanıt dizinindedir (depoya alınmadı). #2884'ün tek ortam ön koşulu karşılanıyor | [Ö] |
| Yayın B0/B1/B2 · D-1…D-4 kabulleri · D-5 koşumu | Tamamlandı / koşuldu; **tekrarlanmadı, yeniden çalıştırılmadı** | [B] |
| Ağ azaltım kuralı (8080 engeli) ve geri dönüş yedekleri | **Korunur**; bu çalışma dokunmadı | [B] |
| Yayın adayı çalışması | Taslak PR #2895 (taban `release/r27-candidate` = `1b758d29`); **tek yazarı yayın koordinatörüdür**. CLIENT yalnız düzeltme ve kanıt teslim eder: #2884 adaya `f69783af` olarak alındı (manifest çakışması yalnız #2884'ün satırlarıyla çözüldü; saf testleri aday üstünde 116/116 [K]). Adayın birleştirilmesi ve canlı yayın için owner GO'su **yok** | [K] |
| Canlı portal hesapları (KR-6 sayımı) | 2026-10-03, salt okunur, yalnız sayı: toplam 7 portal hesabı, **aktif 0**; aktifler arasında birebir ya da biçim farkıyla çakışan adres 0 (ölçüm aracı kör değil: toplam sayıyı gördü). Veri düzeltme yetkisi değildir | [Ö] |

## 2. D halkaları — tek tablo

Kabul ölçütlerinin kanonik tanımı `client-external-access-r01` §7'dir; paket ölçütleri ilgili paket belgesindedir.

| Halka | Mevcut kabul | Eksik kanıt | Hazırlık durumu | Bağımlılık | Sonraki işlem | Gerekli owner kararı |
|---|---|---|---|---|---|---|
| **D-1** intake bağlantısı dış cihazdan açılır | **Kabul — dar (intake)**: runId `cff5c692` 22/22 [B]; cihaz/ağ [O] | yok | tamam | — | yok; kapsam genişletilmez | — |
| **D-2** form sentetik veriyle gönderilir | **Kabul — dar (intake)**: `cff5c692` [B] | yok | tamam | — | yok | — |
| **D-3** doğru büro/dosya/statü | **Kabul — dar (intake)**: `cff5c692` [B] | yok | tamam | — | yok | — |
| **D-4** portal girişi dış cihazdan | **Kabul — dar**: runId `e34b7e6d` 21/21 [B]; telefon [O] | yok | tamam | — | yok; Run/Recover tekrarlanmaz | — |
| **D-5** portal parola sıfırlama uçtan uca | **Kabul yok.** runId `00c96bd5`: çıkış 3 · 21 PASS / 0 FAIL / 8 ÖLÇÜLEMEYEN [Ö]; "e-posta gelmedi" [O] | (a) uçtan uca sıfırlama hiç ölçülmedi (8 ölçüt) · (b) kök neden **kanıtlanmadı** · (c) bu koşumun kanıt paketi manifestsiz — **tamamlanamaz** (§3.2) | teşhis: UNKNOWN düzeyinde tamam · API yaması #2884: `main`'de (`be08dbe9`) ve adayda · web yaması #2900: `main`'de (`8b9a9989`) · aday doğrulaması: koordinatörde · yayın: **GO yok** | doğrulanmış aday (API + web) → onaylı yayın → pin güncellemesi → yeni D-5 GO'su | §3.3 sırası | yayın GO'su · yeni D-5 GO'su · alıcı adresi · tek gönderim onayı |
| **D-6** belge yükleme/indirme/silme | **Kabul yok** — canlı koşum yok | canlı Run + owner beyanı (D6-*, P6-C*) | blok R02 `main`'de (#2880 → `6744abff`) · kapanış düzeltmesi R03 **yerelde hazır, yayımlanmadı** (bağımsız doğrulama: 1 major + 3 minor açık; §4.4) | R03 major düzeltmesi + PR (CLIENT yuvası sırası: portal → F1 → D-6) · ayrı GO · dış zincir · canlı dist pini (yayından önce ya da pin güncellemesinden sonra) | R03 tamamlama → Preflight → QrTest → Run | D-6 GO · telefon yüklemesi · kalıcı izlerin kabulü · kalıntıda sıra · OK-5 (§4.4) |
| **D-7** mesaj gönderme/okuma | **Kabul yok** — canlı koşum yok | canlı Run + owner beyanı (D7-*, P7-C*) | blok R02 `main`'de (#2882 → `0e04f4a6`) · kapanış eksikleri (makbuzdan önceki yarım kurulum, oturum yenileme, kapanış satırı) **sırada** (§4.4) | D-7 kapanış düzeltmesi (CLIENT yuvası, D-6'dan sonra) · ayrı GO · dış zincir · canlı dist pini · SEC-PORTAL-ADMIN-MSG-01 açık (engel değil) | kapanış düzeltmesi → Preflight → QrTest → Run | D-7 GO · kalan mesaj/bildirim satırları "saklandı" · kapsam dışı dosya referansında 400'ün ölçüt sayılması · Recover kuralı |
| **D-8** personel yüzeyi dışarıdan kapalı | **Kısmi**: yalnız 2026-09-27 telefon beyanı, 5 GET 403 [O]; R27 öncesi | sonda canlıda koşulmadı; telefon beyanı R27 sonrası yinelenmedi; katman ölçülmez | sonda + öz-test hazır (pin `D5FA37D1…579B`) · HEAD / OPTIONS ve 18 kodlama varyantının sondaya alınması **sırada** (CLIENT yuvası) · diğer ana makine adı kısıtlı envanterde belirlendi (§5) | sonda revizyonu (pin + öz-test + belge) · ayrı GO · dış zincir · ad kapsamı kararı | revizyon → GO → sonda + telefon beyanı | D-8 GO + ad kapsamı (§5) |
| **D-9 (intake)** | **Kabul — dar**: `cff5c692` [B] | yok | tamam | — | yok | — |
| **D-9 (portal, D-4 koşumu)** | **Kabul — dar**: `e34b7e6d` [B] | yok | tamam | — | yok | — |
| **D-9 (birleşik)** | **Açık** | D-5 bileşeni ölçülemeyenli; D-6/D-7 bileşenleri yok (§6) | — | D-5, D-6, D-7 koşumları | koşumlardan sonra kayıt | birleşik kabul onayı; dar kanıt genel kapanış sayılmaz |

D-1/D-2/D-3/D-4 ve dar D-9 kabullerinin kapsamı **korunur**; bu belge onları genişletmez ya da daraltmaz.

## 3. D-5 — düzeltilmiş teşhis, kanıt durumu, uygulanabilir sıra

### 3.1 Teşhis (kesinlik düzeyi: kök neden KANITLANMADI)

Owner beyanı [O] (yeniden sorulmaz): form **bir kez** gönderildi; genel başarı ekranı görüldü; e-posta ulaşmadı; posta kutusu
kontrolleri yapıldı.

| | |
|---|---|
| **Mevcut kanıtın gösterdiği** [Ö] | koşumun izlediği hesapta sıfırlama token'ı **görülmedi**; ilgili günlüklerde gönderim kaydı **bulunamadı** |
| **UNKNOWN** | talebin API'ye ulaşıp ulaşmadığı · formda gönderilen adres metni |
| **Ne doğrulanmış ne dışlanmış** | SMTP ve e-posta sağlayıcısı. Önceki kayıtlardaki "neden SMTP/sağlayıcı değil" ifadesi kanıtın taşıdığından güçlüydü ve **kaldırıldı** |
| **Kullanıcı hatası** | varsayılmaz; kanıt yok |
| **Okunmamış kaynaklar** | kenar / tünel günlüğü ve e-posta sağlayıcısının kendi kayıtları bu çalışmada **okunmadı** (erişim owner'da). "Daha fazlası çıkarılamaz" denmez; bu iki kaynak okunursa UNKNOWN'lar daralabilir |

Gözlenen tabloyla (başarı ekranı · token yok · günlük satırı yok · e-posta yok) **uyumlu adaylar — hiçbiri kanıtlanmadı**:

| # | Aday | Dayanak | #2884 ne yapar |
|---|---|---|---|
| A1 | Formda yazılan adres kayıtlı adresle yalnız harf büyüklüğü ya da baş/son boşlukla farklıydı | kaynak okumasıyla doğrulanmış kusur sınıfı (canlı kaynak) | **kapatır** |
| A2 | **Web tarafı:** sıfırlama sayfası tarayıcıda devralınmadan (hydration) önce doldurulan adres API'ye **boş** gider; API aynı başarı yanıtını verir, sıfırlama kaydı ve e-posta oluşmaz | ayrı bir ölçümde üretim derlemesinde doğrulanmış davranış (2026-10-02; ölçülen sayfa dosyası canlı kaynakla aynı); bu koşumda olduğu **ölçülmedi**. 2026-10-03 yeniden üretim (#2894 sonrası `main`): kusur üç portal formunda sürüyor; belirti değişti — erken girilen değer devralmada **siliniyor**, istek çıkmıyor; tarayıcı denetimi atlanırsa yine boş gövde gidiyor | **kapatmaz**; yalnız "e-posta alanı boş" teşhis satırı kazandırır. **Ürün düzeltmesi: PORTAL-RESET-FORM-01, PR #2900** (owner kararı: yeni D-5 denemesinden önce yayında olacak; elle yazma talimatı düzeltmenin yerine geçmez) |
| A3 | Talep API'ye ulaşmadı (kenar katmanı) | erişim günlüğü yok; kenar günlüğü okunmadı | API'ye ulaşan istekte hangi dalın çalıştığını gösterir. Günlük kapsamı ve kayıt mekanizması doğrulanmadan bir teşhis satırının **yokluğu** "ulaşmadı" anlamına **gelmez** — UNKNOWN kalır |
| A4 | SMTP / sağlayıcı | token görülmediği için gönderim aşamasına gelindiğine dair iz yok; **dışlanmadı** | gönderim sonucu satırı (mevcut) |

#2884 **kaynak okumasıyla doğrulanmış bir kusur sınıfını** (A1) kapatır ve sessiz dallara teşhis satırı ekler. **#2884'ün bu koşumun
kök nedenini giderdiği kanıtlanmamıştır.** Kazanımı: istek API'ye ulaşırsa hangi sessiz dalın çalıştığı günlükte görünür; bu
uçtan uca izleme **değildir**. A2 için ürün düzeltmesi web tarafındadır: PR #2900 (owner kararı KR-3, §11). A2 de eski koşumun kök
nedeni olarak sunulmaz.

### 3.2 Bu koşumun kanıt paketi — TAMAMLANMADI

Ayrıntı: `client-extacc-portal-d5-r01/D5-RUN-00C96BD5-TAKIP-20261002.md`, **`D5-RUN-00C96BD5-TAKIP-20261003.md`** (iki eksik
beyan, beş dosyanın 2026-10-03 özet envanteri — koşum sonu değerleriyle aynı — ve dokuz sorunun açık beyan / çıkarım ayrımı) ve
paket belgesi §8. Koşum çıkış 3 / ÖLÇÜLEMEYEN olarak kalır; D-5 yeniden kabulü ve birleşik D-9 için **yeterli sayılmaz**. Eksik
tarihsel paket bağımsız hazırlık işlerini bekletmez.

- Beyan penceresi **kapanmıştır** [Ö 2026-10-02]: süreç yok; makine koşumdan sonra yeniden başladı. Blok, beyan dosyasını, birleşik
  kararı ve manifesti beyan sorularından sonra yazar; akış o noktaya gelmedi. **Üç dosya yoktur ve bu koşum için sonradan
  üretilmez**; üretilmiş gibi gösterilmez. Yeni Run başlatılmadı.
- Beş özgün dosya korunur; ham bayt özetleri koşum sonu ile aynıdır [Ö].
- Bloğun dokuz sorusu: biri açık owner beyanı (e-posta gelmedi), altısı o beyandan **çıkarım** (owner beyanı değildir), iki eksik
  soru 2026-10-03'te owner'a bir kez soruldu ve **sonradan verilmiş hatırlama beyanı** olarak kaydedildi (telefon mobil verideydi;
  yenilemede giriş sayfası görüldü — bu koşumda telefonda portal oturumu olmadığı için oturum reddini kanıtlamaz). Blok dosyası
  üretilmedi.
- Kapanış üç ayrı görünümdedir: (a) kapanış — DB, token, yeni giriş, personel/dosya: **PASS** · (b) özgün (sıfırlama öncesi)
  oturumun reddi: **PASS** · (c) sıfırlama sonrası kontroller: **ÖLÇÜLEMEYEN** (8 ölçüt; sıfırlama gerçekleşmedi). (c) PASS sayılmaz.

### 3.3 Uygulanabilir sıra: API + web düzeltmeleri → doğrulanmış aday → onaylı yayın → pin → tek deneme

| Adım | İçerik | Durum (2026-10-03) | Yetki |
|---|---|---|---|
| 1 Teşhis | §3.1 — kök neden **UNKNOWN**; dört aday kayıtlı. Okunmamış iki kaynak (kenar günlüğü, sağlayıcı kayıtları) owner erişimi ister | erişilebilen kaynaklarla tamam; kök neden açık | okunmamış kaynakların okunması (isteğe bağlı) |
| 2 API yaması | #2884 (A1'i kapatır; teşhis satırları; hesap açmada çakışma kuralı işlem içinde) | **`main`'de** `be08dbe9` (main CI yeşil) · adayda `f69783af` [K] | — |
| 2b Web yaması (A2) | PORTAL-RESET-FORM-01: üç portal formu, değer gönderim anında alandan okunur, boş / biçimsiz giriş istek üretmez, tek gönderim tek istek | **`main`'de** `8b9a9989` (#2900; main CI yeşil); üretim derlemesinde doğrulandı; adaya uyarlama koordinatörde | — |
| 2c Dev token kaybı (F1) | şifre sıfırla sayfalarının geliştirme ortamındaki token kaybı; üretim davranışı korunur | **PR #2902** açık; güvenlik adayına eklenmez | aynı teslim yetkisi; sıra koordinatörde |
| 3 Aday | #2884 + #2900 + gerekli giriş formu bağımlılıkları (#2894'ün aday parçası) yayın adayına; #2825 sırası korunur | **koordinatörde** (adayın tek yazarı); birleşik aday doğrulaması sürüyor | yayın GO'su ayrı karar |
| 3b Ön koşul | canlı veritabanı kodlaması UTF8 | **ölçüldü** (§1) | — |
| 4 Yayın | canlı API ve WEB dist değişir; `.env` ve şema değişmez (CLIENT kalemleri için migration 0) | **GO yok** | yayın GO'su |
| 5 Pin güncellemesi | owner bloklarının canlı dist pinleri yeni değere çekilir (D-5/D-6/D-7/D-8). Değerleri (aday SHA, derleme özetleri, dosya listesi) koordinatör verir; D-5 paket ve pin dosyalarının tek yazarı CLIENT'tir | aday kesinleşince | birleştirme yetkisi |
| 6 Tek deneme | Preflight → **QrTest** (pin değiştiği için yeniden) → Run (tek gönderim) → pencere kapanmadan dokuz beyan sorusu → manifest. Otomatik ikinci gönderim, ikinci Run ya da Recover **yok** | **başlatılmadı** | yeni D-5 GO'su · alıcı adresi (yalnız konsol) · tek gönderim onayı |

Kabul ölçütü değişmez: Run çıkış 0 **ve** owner beyanı. Çıkış 3 kabul değildir. E-posta teslimi makineyle ölçülmez; yalnız owner
beyanıdır. Token'ın veritabanına yazılması teslimi kanıtlamaz.

Yayınsız yeni deneme seçeneği **kapandı**: owner 2026-10-03 kararıyla web düzeltmesi yeni D-5 denemesinden önce yayında olacak ve
elle yazma talimatı ürün düzeltmesinin yerine kabul edilmez (§11 KR-2, KR-3).

## 4. D-6 / D-7 — Run, normal kapanış ve ayrı Recover sınırları

Ayrıntı ilgili paket belgelerindedir (`client-extacc-portal-d6-r01`, `client-extacc-portal-d7-r01`; R02 metinleri #2880 ve #2882'de).

### 4.1 Doğrulama teslim edilen dosyalara bağlıdır [Ö]

| | D-6 (#2880) | D-7 (#2882) |
|---|---|---|
| Blok öz-testi (iki kabukta) | 73/73 | 64/64 |
| Koşucu öz-testi — **commit'teki dosya, doğrudan** | **51/51** | **41/41** |
| Öz-testin canlı ağaç bağımlılığı | **giderildi**: kütüphane kökü ortam değişkeninden (varsayılan: checkout'un kendi kökü); canlı ağaç altındaki kök **modül yüklenmeden** reddedilir | aynı |
| Canlı Run kapıları, pin denetimi, koşucu, pinli dosyalar | **değişmedi**; paket digest aynı | **değişmedi**; paket digest aynı |
| Ayna kopyadaki önceki sonuçlar | **ayrı tarihsel kanıt** olarak korunur; teslim doğrulaması sayılmaz | aynı |
| Bilinen sınır | ret denetimi ad karşılaştırmasıdır: 8.3 kısa ad, `subst` ya da UNC yazımıyla verilen canlı kök bu denetimle yakalanmaz | UNC biçimli kök ad karşılaştırmasıyla eşleşmez; ayrıntı paket belgesinde |

Blok kendi pin listesinde değildir; kanıttaki revizyon alanı "R01" kalır. Owner koşumdan **önce** blok dosyasının özetini paket
belgesindeki değerle karşılaştırır.

Not: R27 paket belgesindeki D-6 / D-7 blok öz-test sayıları (64/64 ve 58/58) `main`'deki blok baytlarına aittir; #2880 ve #2882
merge edilince 73/73 ve 64/64 olur ve o satırlar ayrıca güncellenir (D-7'nin yeni sayısı D-6'nın eski sayısıyla aynıdır; karıştırılmaz).

### 4.2 Run ve normal kapanış

- Sıra: Preflight (salt okuma) → QrTest (canlı veri yok) → Run (ayrı GO; tek koşum). D-6 ve D-7 **aynı anda koşamaz**.
- Normal kapanış Run'ın **koşucu içindeki** kapanış adımlarıdır; Recover bundan ayrı bir işlemdir.
- Çıkış kodları: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN (tipik: telefon girişi görülmedi) · 1 durdu · 4 kimlik/hedef reddi · 5 personel/dosya
  kapanışı doğrulanmadı · 6 portal kapanışı doğrulanmadı · 7 kanıt yazılamadı. Öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0.
- Kabul: çıkış 0 **ve** owner beyanı. Telefondaki oturumun reddi makineyle ölçülmez (yalnız owner'ın yenileme beyanı).
- Run kapanışında personel oturumu yenilenmez: koşum başındaki oturum geçersizleşirse portal açık kalabilir ve çıkış 6 olur
  (kaynaktan okundu; oturum süresi canlıda ölçülmedi).
- Diğer bürolardaki kullanıcı/müvekkil **sayıları** önce/sonra karşılaştırılır; koşum sırasında başka bir büroda ekleme/silme olursa
  bu ölçüt FAIL verir (koşumdan bağımsız değişiklik ayırt edilemez) → koşum penceresi buna göre seçilir.
- Kalıcı izler (silinmez; "saklandı" diye kabul owner kararı): sentetik büro/kullanıcı/müvekkil/dosya kayıtları, portal erişimi
  açma/kapatma denetim satırları, API günlük satırları; D-6'da boş kova dizini; D-7'de mesaj ve bildirim satırları.

### 4.3 Ayrı Recover sınırı

- Çıkış 5/6 **Recover yetkisi değildir**. Blok Recover başlatmaz; ajan otomatik başlatmaz.
- Sıra: önce kanıt incelenir ve sonuç bildirilir → Recover yalnız **ayrı owner onayıyla, bir kez**, owner tarafından başlatılır.
- "Bir kez" kuralı kodla **zorlanmaz** (Recover'da GO sorulmaz, defter tutulmaz). İkinci Recover bu paketlerle tanımlı değildir.
- Recover da bloğun tüm salt okuma kapılarından geçer: Run ile Recover arasına **yeni yayın** (canlı dist / `.env` değişimi) ya da
  senkronlanmamış `main` ilerlemesi girerse blok Recover'ı başlatmaz. **Yayın sırası ile D-6/D-7 sırası birlikte kararlaştırılır.**
- Recover canlıya yazar (sentetik kayıtlarla sınırlı; ayrıntı paket belgelerinde). Kabul ölçütlerini, mevcut oturum reddini ve
  telefondaki oturumu **ölçmez**; en iyi çıkışı pratikte 3'tür.
- D-6 kalıntı senaryosu: belge satırları silinse de dosya diskte kaldıkça kapanış ölçütü FAIL verir. Dosyanın Recover'dan önce elle
  silinmesi ya da ikinci Recover **owner kararıdır** (§11 KR-5).
- D-7'de kurulum ile makbuz arasındaki pencerede hata olursa makbuz oluşmaz ve bu bloktan Recover koşulamaz; yapılacak iş owner /
  CLIENT kararıdır (paket belgesi; çözüm tanımlı değil).

### 4.4 Kapanış eksiklerinin giderilmesi (R03 — 2026-10-03)

Owner'ın istediği dört sınır kaynakla değerlendirildi. Yalnız uyarı metni eklemek çözüm sayılmadı; koşucuya dar düzeltme ve izole hata
senaryosu hazırlandı. Yeni canlı Run / Recover başlatılmadı; normal Run kapanışı ile ayrı Recover yetkisi ayrı tutuldu.

| Sınır | Değerlendirme | Durum |
|---|---|---|
| Personel oturumu kapanışta geçersizleşirse | **kusur gerçek**: Run kapanışı oturum yenilemiyor, yetkili uç reddederse portal açık kalıyor (çıkış 6). Düzeltme: 401/403'te aynı sentetik personelle **bir** kez yeniden giriş + tek yeniden deneme. Canlıya ek etkisi kaynaktan okundu (giriş uç noktası veritabanına yazmaz; bellekteki giriş hız sınırı sayacı +1); canlıda ölçülmedi | D-6: **yerelde hazır** (öz-test 62/62; yeni senaryolar eski koşucuda düşüyor) · D-7: sırada |
| D-7'de makbuz yazılmadan yarım kalan kurulum | kurulumdan sonraki iki ek yazma makbuzdan önce geliyor; hata olursa makbuz yok, kapanış "kapatılacak bir şey yok" sayıyor | **sırada** (D-7 kapanış düzeltmesi; makbuzun kurulumdan hemen sonra yazılması + izole hata senaryosu) |
| D-6 depolama erişim hatası ile doğrulanmış kalıntının ayrılması | **kusur gerçek**: erişim hatası doğrulanmış kalıntıyı gizleyebiliyor ya da FAIL'e çevrilebiliyordu. Düzeltme: doğrulanmış kalıntı FAIL, erişim hatası ÖLÇÜLEMEYEN + ayrı neden; kanıtta ayrı `durum` alanı. Kapanış bağlamında ikisi de çıkış 6 verir (kapanış doğrulanmamıştır) — ayrı çıkış kodu istenip istenmediği **OK-5 owner kararı** | D-6: yerelde hazır |
| Kapanış metninin yalnız ölçüleni söylemesi | **kusur gerçek**: kanıttaki bazı kurtarma / kapanış metinleri ölçülmemiş şeyi iddia ediyor ya da ikinci Recover'a yol tarif ediyordu; düzeltildi ("ÖNERİ — yetki değil"). Bağımsız doğrulama bir **major** buldu: kapatma hiç yapılmadığında koşucunun kendi oturumunun açık kalması yanlışlıkla "ürün bulgusu — Recover düzeltemez" diye yazılıyor ve owner'ı açık kalan portalı kapatmaktan alıkoyabilir (R02'den kalma) | D-6: **major düzeltilmeden yayımlanmayacak**; CLIENT yuvası sırası: portal → F1 → D-6 → D-7 |

Pinler: D-6 koşucusu değiştiği için bloğun pin listesi, paket digest'i, blok ve blok öz-testi özetleri birlikte değişti (blok öz-testi
iki kabukta yeşil); belge güncellendi. Değerler PR açılırken paket belgesindedir.

## 5. D-8 sondası — 46 isteğin kapsamı, yan etkiler, kapsam boşluklarının kabule etkisi (**çalıştırılmadı**)

Sonda `client-extacc-d8-staff-surface-r01/scripts/d8-staff-surface-probe.js` (pin `D5FA37D1…579B`; belge ve blok pini ile eşit [Ö]).
Durum açmaz: sentetik veri, hesap, token, veritabanı erişimi yoktur; kapanış/Recover gerekmez; yeniden koşulabilir.

**İstekler: 46, sıralı, tekrar denemesiz, istek başına 15 sn.** 37 ret vektörü (403 beklenir) + 9 pozitif (3 sayfa 200, 6 API 401).

| Yöntem | Toplam | Ret vektörü | Pozitif |
|---|---|---|---|
| GET | 27 | 21 | 6 |
| POST | 10 | 8 | 2 |
| PUT | 3 | 3 | 0 |
| PATCH | 1 | 1 | 0 |
| DELETE | 5 | 4 | 1 |

Gövde: POST / PUT / PATCH'te boş JSON `{}` (14 istek); GET ve DELETE gövdesiz (32). Kimlik başlığı **yok**. Tek origin.

| # | Yöntem · yol | Beklenen | Kenar geçirirse uygulamada ne olur (kaynak `1b758d29`) |
|---|---|---|---|
| 01–04 | GET `/` · `/auth/login` · `/dashboard` · `/auth/reset-password` | 403 | web sayfası; yazma yok |
| 05 | GET `/api/auth/me` | 403 | 401; DB/yazma yok |
| 06 | POST `/api/auth/login` `{}` | 403 | bellek içi giriş sayacı **+1** (60 sn'de düşer; tek istek blok üretmez), sonra 400; DB yazma/audit/kilit yok |
| 07 | POST `/api/auth/register` `{}` | 403 | 400; yazma yok |
| 08 | GET `/api/auth/capabilities` | 403 | 200; yalnız yapılandırma bayrağı |
| 09–10 | GET `/api/cases` · `/api/users` | 403 | 401 |
| 11 | GET `/api/health` | 403 | 404 |
| 12–13 | POST `/api/portal/admin/create-user` · `disable-user` `{}` | 403 | 401; yazma yok |
| 14–15 | GET `/api/portal/admin/documents/pending` · `messages/clients` | 403 | 401 |
| 16 | GET `/api/portal/admin` | 403 | 404 |
| 17–20 | GET admin yol varyantları (büyük harf · nokta segmenti · kodlanmış eğik çizgi · sorgu) | 403 | 401 ya da 404 (çalışma zamanında ölçülmedi); yazma yok |
| 21 | DELETE `/intake/d8probe` (web) | 403 | sonuç ölçülmedi; rota işleyicisi yok |
| 22–24 | DELETE · PUT · PATCH `/api/public/intake/d8probe` | 403 | 404 |
| 25 | GET `/api/portal/login` | 403 | 404; portal giriş sayacına dokunmaz |
| 26–31 | izinli portal yollarında yanlış yöntem | 403 | 404 |
| 32, 34 | POST `/portal/profile` · `/portal/login` (web) | 403 | sonuç ölçülmedi; yazma yok |
| 33 | GET `/api/portal/change-password` | 403 | 404 |
| 35–37 | GET `/robots.txt` · `/api` · `/api/` | 403 | 404 |
| 38–40 | GET `/portal/login` · `/portal/forgot-password` · `/portal/reset-password` | **200** | web sayfası; sıfırlama isteği **gönderilmez**; yazma yok |
| 41–43 | GET `/api/portal/cases` · `documents` · `messages` | **401** | guard ilk kontrolde durur; DB okuması bile yok |
| 44–46 | POST `messages` `{}` · DELETE `documents/d8probe` · POST `change-password` `{}` | **401** | guard işleyiciden önce durur; yazma yok |

Bilinçli dışarıda bırakılanlar: portal giriş/sıfırlama POST'ları, intake POST, belge yükleme. Telefon adımı ayrı: 5 GET, mobil veri,
owner beyanı.

**Yan etkiler.** Beklenen durumda ret vektörleri uygulamaya ulaşmaz. Uygulamaya ulaşan 9 pozitif istek yalnız bellek içi istek
kimliği ve metrik sayacı üretir; DB yazımı, audit, hız sınırı sayacı, hesap kilidi, hata kaydı yoktur. Tek olası iz vektör 06'dır.
Yerelde tek kanıt dosyası yazılır (ana makine adını içerir; ham hâliyle depoya konmaz). Sağlayıcı kenarının kendi kayıtları ve canlı
kenar günlüğü **ölçülemedi (UNKNOWN)**.

**Katman sınırı.** 403'te kesin katman alanı daima `unknown`'dır; başlık ve gövde imzası yalnız ipucudur. Ret vektöründe "tamam"
yalnız durum 403'tür: kenar reddi ile uygulama 403'ü ayrışmaz. Sonda sunucunun kendi çıkışından koşar; dış ağ ayağı yalnız telefon
beyanıdır.

**Üç kapsam boşluğu ve kabule etkisi** (üçü de koşumdan önce karar ister):

| Kimlik | Boşluk | Karar verilmezse kabul ne söyleyebilir | Seçenekler |
|---|---|---|---|
| D8-E1 | HEAD / OPTIONS vektörü yok | "personel yüzeyi **beş yöntemde** (GET/POST/PUT/PATCH/DELETE) kapalı". HEAD ve OPTIONS için hüküm **verilemez** | iki vektör ekle (pin + öz-test + belge birlikte) / "yöntem kapsamı = 5 yöntem" diye kayda geç |
| D8-E2 | yol kodlama varyantı canlı listede 4, izole provada 18 | "ölçülen **dört** varyantta kapalı". "Kodlama varyantlarına karşı kapalı" genellemesi **yapılamaz** | 18 vektörü taşı / mevcut 4 ile yetin ve sınırı yaz |
| D8-E3 | tek ana makine adı; tünele bağlı diğer adlar kapsam dışı | kabul **yalnız birincil ad** içindir. "Dışarıdan kapalı" genellemesi diğer adlar için **yapılamaz** | her ad için ayrı koşum (adlar public belgeye yazılmaz) / "kapsam = yalnız birincil ad" kararı |

Üç boşluk "sınır kaydıyla kabul" yolunda D-8'i **dar kabul** yapar (yöntem, varyant ve ad kapsamı beyanla sınırlı); sonda
revizyonu yolunda pin, öz-test ve belge birlikte değişir ve koşum ondan sonra yapılır. SEC-API-BIND-01 açıkken D-8 sonucu ayrıca
"dışarıdan erişilemez" diye genellenmez (§8).

**R03 (2026-10-03):**
- **Diğer ana makine adları (D8-E3)** kısıtlı yerel envanterde belirlendi (tünelin yerel ölçüm ucundan salt okuma; adlar depoya
  yazılmaz): birincil addan başka **bir** adlı ad daha var; ikisi de aynı yerel kenar servisine yönlenir, yol kısıtı yok; diğer
  her ad 404 döner. Kenarın iki ad için aynı filtreyi uygulayıp uygulamadığı **ölçülmedi** (canlı kenar yapılandırmasının şablonla
  eşitliği zaten D8-E6'dır). Kapsam owner kararıdır: (a) sonda her iki ad için ayrı koşulur; (b) "kapsam = yalnız birincil ad"
  diye kayda geçer — o durumda diğer ad için "dışarıdan kapalı" denmez.
- **HEAD / OPTIONS ve 18 kodlama varyantı (D8-E1 / D8-E2)** sondaya alınacak; gerçek istek sayısı, yan etkiler, öz-test ve pinler
  birlikte güncellenecek. İş CLIENT yuvasında D-6 / D-7 kapanışından sonra sıradadır; canlı sonda çalıştırılmayacak. 403 sonucu
  kesin katman kanıtı sayılmaz.

Diğer sınırlar (minor; koşumu engellemez; kimlikler bu belgede tanımlıdır): uygulama katmanını ayırt eden başlık kanıta alınmıyor
(D8-E4) · 403 dışı kenar hataları "bulgu" diye sınıflanır, dış zincir ön ölçümü yok (D8-E5) · canlı kenar yapılandırmasının
şablonla eşitliği ölçülmüyor (D8-E6) · dış ağdan makine koşumu yok (D8-E7) · blok kanıtı mühürlemiyor (D8-E8) · telefon beyanı
için dosya şablonu yok (D8-E11).

Kanıt kabul kontrol listesi (koşulduğunda): satır 46 (37 + 9) · kimlik başlıklı istek 0 · boş olmayan gövde 0 · boş JSON gövde 14,
gövdesiz 32 · ölçülemeyen 0 · bulgu listesi boş. 403 dışı ret bulgusu kısıtlı kayda alınır; public PR'a ayrıntı yazılmaz.

## 6. D-9 — her koşumun kapanışı ayrı değerlendirilir

| Koşum | Kapanış satırları | Sonuç | Birleşik D-9'a katkısı |
|---|---|---|---|
| Intake `cff5c692` | bağlantı kullanıldı, açık bağlantı yok, public uç kapalı (yerel + dış), kullanıcı pasif, dosya kapalı | PASS [B] | bileşen hazır (**dar**: yalnız intake) |
| D-4 `e34b7e6d` | yeni giriş reddi, mevcut oturum reddi (yerel + dış), DB pasif, sürüm artışı, personel pasif, dosya kapalı | PASS [B] | bileşen hazır (**dar**: yalnız giriş koşumu) |
| D-5 `00c96bd5` | (a) kapanış: **PASS** · (b) özgün oturumun reddi: **PASS** · (c) sıfırlama sonrası kontroller: **ÖLÇÜLEMEYEN** (8 ölçüt; bunlardan kapanışa ait ikisi sıfırlama sonrası oturum reddidir: P5-C4L / P5-C4D). Kurtarma gerekmedi; ayrı Recover başlatılmadı. Kanıt paketi manifestsiz | kapanış makinece doğrulandı; kapanışa ait iki satır ölçülemeyen; paket tamamlanmadı [Ö] | **yeterli değil**: ölçülemeyen satır PASS saydırmaz; manifestsiz paket tamamlanmış sayılmaz |
| D-6 | — | koşulmadı | yok |
| D-7 | — | koşulmadı | yok |

Birleşik D-9, D-4/D-5/D-6/D-7 koşumlarının kapanış satırlarının hiçbiri FAIL/ÖLÇÜLEMEYEN olmadığında kaydedilir. **Dar kanıt genel
kapanış sayılmaz**: intake ve D-4 kapanışları yalnız kendi koşumlarını kapatır.


## 7. H1–H8 — hizmet kabulü **0/8** (değişmedi)

Bir H ancak (a) kendi ölçüt kümesi karşılanmış **ve** (b) açık owner hizmet-kabulü kararı kayıtlıysa ilerler. **(b) koşulu sekiz
hizmetin hiçbirinde kayıtlı değildir**; bu çalışma hiçbir sayacı ilerletmedi ve hiçbir imzayı tamamlanmış saymadı. D sonuçlarından
H sayacı türetilmez. PASS sayıları kapanış kayıtlarının kendi etiketleridir [B].

Bu bölümde "R27 §10 K-n" R27 paket belgesinin karar numaralarıdır; bu belgenin kendi kararları §11'de **KR-n** diye adlandırılır.

| H | Mevcut kabul | Eksik kanıt | Hazırlık durumu | Bağımlılık | Sonraki işlem | Gerekli owner kararı |
|---|---|---|---|---|---|---|
| H1 Kimlik | yok (teknik: İ9 `d19ce2c7` 14/0/0) | tazelik: ölçümden sonra müvekkil servisi değişti (#2645); canlı R27'de yeniden ölçülmedi | hüküm bekliyor | R27 §10 K-12 | hüküm → beyan | B-2 hükmü · tazelik seçimi · imza (§11 KR-12) |
| H2 Adres/iletişim | yok (teknik: `8811f395` 13/13) | — | hüküm bekliyor | R27 §10 K-12 | hüküm → beyan | KB-03 (a)/(b) · imza (§11 KR-12) |
| **H3 Vekâlet** | yok (teknik: İ10 `c9b07bcb` 10/0/0) | yok — ölçüt kümesi tamam; ölçülmeyen yollar beyanda "kapsam dışı" yazılmalı | **beyan taslağı hazır** | — (vekâlet yolları yayın adayı taslağında değişmiyor [Ö]) | owner beyanı imzalar | **imza + bir seçim**: ölçülmeyen kalemler "kabul dışı" mı, "ayrı canlı ölçüm" mü. İkincisi seçilirse H3 yalnız imzayla kapanmaz (§11 KR-12) |
| H4 Talimat/beyan/rıza | yok (teknik: `e28c5c06` 14/14) | H4-08 gerçek yayın ayağı gerçek sağlayıcıyla ölçülmedi | hüküm bekliyor | R27 §10 K-12; H6 beyanıyla çelişmemeli | hüküm → beyan | H4-08 hükmü · imza (§11 KR-12) |
| H5 Bilgi/belge toplama | yok (dar kabul `dda5d8c3` hizmet kabulü **değildir**) | — | hüküm bekliyor | R27 §10 K-13 | ayrı hizmet-kabulü satırı | R27 §10 K-13 · B-I11-2 hükmü (§11 KR-12) |
| **H6 Gönderim** | yok (teknik: İ12 `92d04ef3` 17/17; bağımsız doğrulama 10/10) | yok — ölçüt kümesi tamam; gerçek alıcı/sağlayıcı ölçülmedi (test alıcısı) | **beyan taslağı hazır** | **yayın adayına karşı yeniden değerlendirildi (§7.1)**: aday yayın yetkisine kilit + görüntüleyici reddi ekliyor; G1–G7 davranışı değişmiyor; adaydaki odak testleri yeşil [K] | owner beyanı imzalar | imza — yayından önce mi sonra mı (§11 KR-12) |
| H7 Portal | yok (teknik: İ16 `6b883b16` 12/12, R25B) | tazelik: ölçümden sonra portal kodu değişti; H7-05b · K-1 yazma matrisi (portal ölçütü) · PSUS yalnız tek kullanımlık ortamda | hüküm bekliyor | R27 §10 K-12 ve K-11; D-5 tamamlanmadı | hüküm → beyan | hükümler · tazelik · "D-5 tamamlanmadan imzalanır mı" (§11 KR-12) |
| **H8 Muhasebe kayıt kapanışı (F04)** | yok (teknik: İ15 `1b83637a` 5/5; bağımsız doğrulama 7/7; test kanıtı 10/10) | yok — ölçüt kümesi tamam; **canlı yarış testi değildir** | **beyan taslağı hazır** | **yayın adayına karşı yeniden değerlendirildi (§7.1)**: aday muhasebeleştirme işlemine yetki kilidi ekliyor; yedi senaryoluk test kanıtı adayda **yenilendi** (10/10 [K]) | owner beyanı imzalar | imza — yayından önce mi sonra mı (§11 KR-12) |

**"Yalnız imza bekliyor" iddiası kayıt düzeyinde doğrulandı — H6 ve H8 için yalnız imza; H3 için imza + bir seçim.** Üçünde de
bekleyen ayrı hüküm (R27 §10 K-12 kalemi) yoktur. Ölçüt, tamamlanmış kanıt, sınırlar, kaynak tazeliği (ölçümü belirleyen kaynak
dosyalarda ölçüm kaynağı → canlı R27 arasında 0 fark; kapsam beyan belgesinde) ve owner'ın imzalayacağı **gerçek beyan metinleri**:
`H3-H6-H8-OWNER-BEYAN-TASLAKLARI-R01.md`. Taslaklar imzalanmadıkça sayaç **0/8** kalır.

`office-remaining-decisions-r01` §4'teki toplu metin olduğu gibi imzalanmamalıdır (açık kalemleri örtük kabul ettirir).

### 7.1 H6 / H8 — yayın adayında değişen davranışlara karşı (R03)

Aday taslağı (`1b758d29` + yedi güvenlik teslimi; koordinatörün doğrulama kaydı) H6 ve H8'in dayandığı modüllerde şunları değiştirir
[Ö, `git diff`]:

| H | Adaydaki değişiklik | H ölçütlerine etkisi | Adaydaki odak kanıtı [K] |
|---|---|---|---|
| H6 | finansal beyan **yayınında** yetkili aktör satırları kilitlenir ve görüntüleyici reddedilir; ilgili denetleyicilere görüntüleyici yazma engeli eklenir | G3/G6 yayın yolunda yetki kararı artık iptalle serileşir; İ12'deki yayın aktörü yetkiliydi → beklenen davranış aynı. G1/G2 (bilgi talebi), G4/G5 (durum / sağlayıcı), G7 (aylık ekstre, modül değişmedi) etkilenmez | finansal beyan yayını 26/26 · onayı 29/29 · uçtan uca 6/6 · bilgi talebi sağlayıcı sonucu 6/6 |
| H8 | muhasebeleştirme işleminde, ilk finansal yazımdan önce yetkili aktör kilidi; denetleyiciye görüntüleyici yazma engeli | KABUL-5 (başka büronun dağıtımı → 404) önceki adımda kalır; kilit sırası değiştiği için yedi senaryoluk yarış kanıtı **adayda yeniden koşuldu** | tahsilat / iptal yarışı (yedi senaryo + A2, C, 5) **10/10** · muhasebeleştirme servisi birim testi yeşil |

Bu sonuçlar koordinatörün aday doğrulama koşusundandır (tek kullanımlık veritabanı; depoya alınmadı) ve bu çalışmada yeniden
koşulmadı. Eski kabul taslağı yeni sürüme **otomatik taşınmaz**: H6 / H8 beyanları canlı R27 için yazılmıştır; aday yayınlanırsa
beyanın 4. maddesi gereği owner, adaydaki bu kanıtla yeniden değerlendirir.

### 7.2 H1 / H2 / H4 / H5 / H7 — kalan kararlar günlük dille

Hiçbir seçenek bu belgede seçilmedi.

- **H1 Kimlik — B-2 ve tazelik.** Bugün: müvekkil kaydını kapatma / yeniden açma gibi işlemler reddedildiğinde sistem "yetkiniz yok"
  der ve hiçbir şey yazmaz, ama ret yanıtında ekranın ya da başka bir sistemin nedeni ayırt edebileceği sabit bir kod yoktur.
  Ölçümden sonra müvekkil oluşturma kodu değişti (#2645) ve canlı R27'de yeniden ölçülmedi. Seçenekler: (a) sabit kodu "sonraki ürün
  işi" sayıp imzala — kullanıcı reddi yine görür, yalnız otomatik ayırt etme sonraya kalır; (b) önce sabit kod eklensin — küçük ürün
  işi + yayın. Tazelik: mevcut ölçüm yeterli sayılır ya da canlı R27'de dar yeniden ölçüm (yeni GO) yapılır.
- **H2 Adres ve iletişim — KB-03.** Bugün: iletişim kişileri tek tek eklenip silinmez; liste her kayıtta bütün olarak yeniden
  yazılır ve canlıda doğru çalıştığı ölçüldü. Seçenekler: (a) böyle kalsın — iki ekrandan aynı anda düzenlenirse sonuncu kazanır;
  (b) ayrı ekle / sil / düzelt işlemleri yapılsın — ürün işi + yayın, H2 sonra yeniden ölçülür.
- **H4 Talimat / beyan / rıza — H4-08.** Bugün: finansal beyanın gerçek yayını yalnız onaylı e-posta sağlayıcısıyla yapılabilir; bu
  canlıda yeniden koşulmadı, H6'nın test alıcısına yaptığı gönderim kanıtına bağlandı. Seçenekler: (a) bağlı kanıt yeterli — H6'daki
  "gerçek sağlayıcı ölçülmedi" sınırı H4'e de yazılır; (b) gerçek sağlayıcıyla ayrı canlı ölçüm — gerçek gönderim ve yeni GO ister.
- **H5 Bilgi / belge toplama — B-I11-2 ve ayrı satır.** Bugün: dışarıdan gelen bilgi formu çalışıyor; gelen bilgiyi ana kayda aktarma
  yetkisiz kişide reddediliyor ama ret yanıtında sabit kod yok (H1 ile aynı sınıf). H5 toplu imza metnine dahil değil, ayrı imza
  satırı ister. Seçenekler: sabit kodu sonraki iş say ya da önce ekle; ardından H5 için ayrı imza.
- **H7 Portal — test ortamı kanıtı ve tazelik.** Bugün: portalın dört ret nedeni, müvekkilin dosya referansıyla yazma denemeleri ve
  askıya alınmış büroda portalın kapanması yalnız tek kullanımlık test ortamında ölçüldü (canlıda üretmek canlı bir büroyu askıya
  almayı ya da canlı yükleme yapmayı gerektirir). Ölçümden sonra portal kodu değişti; #2884 ve #2900 da portalı değiştiriyor.
  Seçenekler: (a) test ortamı kanıtı yeterli; (b) yazma denemelerini D-6 canlı koşumuna bağla. Portal değişiklikleri yayınlanmadan
  imza verilirse imza bugünkü canlı portala aittir. "D-5 tamamlanmadan H7 imzalanır mı" ayrı sorudur.

## 8. Güvenlik işleri

**Bu tabloda teknik ayrıntı yoktur** (public depo kuralı: açık bulgu yalnız kimlik · durum · etkilediği adım). Ayrıntı, giderilen
davranış ve kalan risk kısıtlı kayıttadır. "Mevcut kabul" sütunu risk kabulünü gösterir: R27 yayını için verilen owner risk kabulü
public kayıtlarda yalnız SEC-PORTAL-ADMIN-MSG-01 için açıkça yazılıdır; **sonradan çıkan kayıtlar o kabulün kapsamında sayılmaz**.
Bu çalışma açık bulguları topluca kapatmadı.

| Kimlik | Mevcut kabul / durum | Eksik kanıt | Hazırlık durumu | Bağımlılık / etkilediği adım | Sonraki işlem | Gerekli owner kararı |
|---|---|---|---|---|---|---|
| **SEC-PORTAL-REQ-01** | risk kabulü **yok** (R27 kabulü genişletilmedi) · AÇIK (canlıda) | canlıda ölçülmedi | yama **`main`'de** (`be08dbe9`) ve yayın adayında; canlıda değil | portal giriş ve sıfırlama talebi; portal hesabı açma; D-5 yeni denemesi | aday doğrulaması → yayın | KR-8 |
| SEC-PORTAL-REQ-01-K1 | risk kabulü yok · AÇIK (kalan risk; #2884 kapatmaz) | — | yama yok | portal hesabı açma | ayrı iş | KR-4 |
| SEC-PORTAL-REQ-01-K2 | risk kabulü yok · AÇIK (önceden var) | canlı salt okuma sayımı yapıldı (2026-10-03): bugün etkilenen **aktif hesap 0** | yama yok | portal girişi ve sıfırlama talebi | politika kararı | KR-4 |
| SEC-PORTAL-REQ-01-K3 | KOŞULLU | — | yayın paketinde ele alınır | #2884 yayını | yayın paketi | KR-8 |
| SEC-PORTAL-REQ-01-K4 | risk kabulü yok · AÇIK (önceden var; #2884 dışında) | — | yama yok | portal hesabı açma ve kapatma | ayrı iş | KR-14 |
| SEC-STAFF-XFF-01 | risk kabulü yok · AÇIK | ek ölçüm gerekir | yama yok | D-8 sonda vektörü 06; yayın sonrası ürün düzeltmesi | ek ölçüm + ayrı yama | KR-14 |
| SEC-API-BIND-01 | ağ düzeyinde azaltım uygulandı (kural korunur) · AÇIK | kapanış gösterilmedi | kalıcı düzeltme yok | D-8 sonucunun genellenmesi | kalıcı düzeltme yolu | KR-14 |
| SEC-MAIL-LOG-01 | risk kabulü yok · AÇIK | — | yama yok | her D-5 gönderim denemesi | günlük satırlarının ele alınması | KR-14 |
| SEC-PORTAL-ADMIN-MSG-01 | **R27 koşullu risk kabulü** · AÇIK | dış kapalılık D-8 ile ölçülmedi | yama yok | D-7 personel yanıtı adımları; H7 beyanı | yetki kuralı + ayrı yama | KR-14 (R27 §10 K-11) |
| D5-SEC-R01 / R02 / R03 | KOŞULLU — kod canlıda (R27) | canlı davranış ölçümü yalnız R01'in parola politikası ayağında | — | D-5 kabulü | D-5 kabulünün tamamlanması | KR-2 |
| FRK-1 | AÇIK | — | dar düzeltme hazır değil | sonraki yayınlarda B1 otomatik geri dönüş kararı | dar düzeltme + izole harness | KR-14 |
| LS-1 | KOŞULLU — B3 kapıları eklendi (#2862) | canlı B3 koşulmadı | kalıcı çözüm yok | B3 | kalıcı çözüm | KR-14 |
| B3H-1 / B3H-2 / B3H-3 / F1 | KAPANDI (betik düzeyi, #2862) | canlı B3 koşulmadı | — | B3 | — | — |
| R27 §10 K-5 · K-14 / K-15 · eski bloklardaki yerel topoloji literalleri | AÇIK | — | — | engelleyici değil / sonraki yayınlarda B0/B1 | — | KR-14 |

## 9. PR'lar — kesin durum [Ö 2026-10-03]

Dört PR owner'ın koşullu birleştirme yetkisiyle (bu sayfada owner'ın kendi teyidi + koordinasyon kaydındaki owner kararı KR-7)
sırayla birleştirildi: her biri yalnız tam uç SHA eşleşince, PR denetimleri yeşilken ve `main` CI boşken (koşan / sıradaki 0), uç
commit'e sabitli squash ile. Kanonik `main` checkout'u yalnız ileri sarılarak senkronlandı. Force-push ya da koruma atlama yok.

| PR | İçerik | Uç (tam SHA eşleşti) | Birleştirme commit'i | `main` CI |
|---|---|---|---|---|
| #2880 | D-6 owner bloğu R02 + öz-test bağımsızlığı + belge sınırları | `357027bb` | `6744abff` | yeşil |
| #2882 | D-7 owner bloğu R02 + öz-test bağımsızlığı + belge sınırları | `4d368a8f` | `0e04f4a6` | yeşil |
| #2884 | portal e-posta eşleşmesi + teşhis satırları + hesap açma çakışma kuralı (API; migration yok). Commit gövdesi düzeltilmiş özetle verildi (eski "SMTP değil" ifadesi `main`'e taşınmadı) | `7bdcc533` | `be08dbe9` | yeşil |
| #2885 | D-5 koşum kaydı, kalan işler tablosu R02, H3/H6/H8 beyan taslakları (yalnız belge) | `a2e7dae5` | `5477a073` | yeşil |
| #2900 | PORTAL-RESET-FORM-01 — üç portal formu (yalnız web); owner'ın teslim yetkisiyle (IF GO-COMPLETE) | `281fd9d4` | `8b9a9989` | yeşil |
| #2902 | F1 — şifre sıfırla sayfaları geliştirme ortamında token kaybetmez (yalnız web; güvenlik adayına eklenmez) | açık | — | PR denetimleri koşuyor; birleştirme sırası koordinatörde |
| bu PR | R03 güncellemesi + D-5 takip kaydı (2) (yalnız belge) | — | — | — |

Koordinatörün sıralama isteğiyle #2899 (OFFICE) #2884 ile #2885 arasında birleştirildi.

## 10. Hazırlık hükmü

| Ölçüt | Durum |
|---|---|
| Dört PR'ın birleştirilmesi ve birleştirme commit'lerinin `main` CI'ı | **karşılandı** — dört PR birleştirildi; dört birleştirme commit'inin `main` CI'ı (CI · Push on main · GOV-COORD-V2) yeşil; kanonik `main` senkron |
| D-5 teşhisi kanıtın taşıdığı düzeyde | karşılandı (§3.1); kök neden UNKNOWN, dört aday |
| D-5 tarihsel kanıt paketi | **eksik kalır** (manifest yok, üretilmez); takip kayıtlarıyla kapatıldı; bağımsız hazırlığı bekletmez |
| API düzeltmesi (#2884) | `main`'de; adaya alındı (`f69783af`), adaydaki saf testleri 116/116 [K] |
| Web düzeltmesi (#2900) | üretim derlemesinde doğrulandı; `main`'de (`8b9a9989`, main CI yeşil); aday uyarlaması koordinatörde |
| Yayın adayı (API + web) | **hazır değil** — birleşik aday doğrulaması koordinatörde sürüyor; canlı yayın GO'su yok |
| D-6 kapanış düzeltmesi | yerelde hazır; bağımsız doğrulamanın **major** bulgusu açık |
| D-7 kapanış düzeltmesi · D-8 sonda revizyonu | sırada |
| Canlı kabul | **eksik**: D-5, D-6, D-7, D-8 (kısmi), birleşik D-9; H1–H8 0/8 |

**REPO TESLİMİ (dört PR): GO-COMPLETE** — birleştirmeler ve birleştirme sonrası `main` CI'ları yeşil.

**HAZIRLIK TAMAM** olan paketler: #2884 API düzeltmesi (`main`'de, adaya alındı) · PORTAL-RESET-FORM-01 web düzeltmesi (#2900,
`main`'de; üretim derlemesinde doğrulandı). Yayın adayı (API + web birleşik) **henüz hazır değil** — doğrulaması koordinatörde.
D-6 / D-7 kapanış hazırlığı ve D-8 sonda revizyonu **tamamlanmadı** (§4.4, §5).

**CLIENT GENEL KABUL TAMAMLANMADI** (canlı kabul eksik: D-5, D-6, D-7, D-8, birleşik D-9; hizmet kabulü 0/8).

## 11. Tek owner karar listesi (KR-n; R27 paketinin K-n numaralarından ayrıdır)

**Kapanan kararlar (R03):** KR-1 (iki beyan alındı, takip kaydında) · KR-2 ve KR-3 (owner 2026-10-03: web düzeltmesi yeni D-5'ten
önce yayında; yayınsız deneme ve elle yazma talimatı kapandı) · KR-6 (sayım yapıldı: aktif hesap 0) · KR-7 (dört PR birleştirildi)
· KR-8'in hazırlık kısmı (aday kapsamı genişletildi; tek yazar yayın koordinatörü).

| # | Karar | Seçenekler / not | Ne zaman |
|---|---|---|---|
| KR-4 | SEC-PORTAL-REQ-01-K1 ve K2 için ürün politikası | seçenekler ve sonuçları owner'a doğrudan sunuldu (public belgeye yazılmaz); bugün etkilenen aktif hesap 0 | yayından önce |
| KR-8 | Yayın GO'su | doğrulanmış nihai aday, açık riskler ve geri dönüş planı koordinatörden somut paket olarak gelir | aday hazır olunca |
| KR-5 | D-6 / D-7 Recover kuralı ve açık paket kararları (D-6 OK-1…OK-5; D-7 K-4…K-7) | ayrı onayın kaydı · ikinci Recover · D-6 kalıntısında sıra · D-6 kalıntı bağlamında ayrı çıkış kodu (OK-5) · D-7 makbuzsuz yarım kurulum · yayın ile D-6/D-7 sırası | D-6/D-7 koşumundan önce |
| KR-17 | D-6 R03: Run kapanışında 401/403'te tek yeniden giriş | aynı sentetik personel, veritabanı yazması yok; canlıya ek etkisi giriş hız sınırı sayacı +1 (kaynaktan okundu) — Run'ın kendi kapanış yetkisi içinde sayılır mı | D-6 PR'ı birleştirilmeden önce |
| KR-18 | Portal formları (#2900, `main`'de) küçük görünür değişiklikler | başarılı girişte düğme yönlendirme bitene dek "Giriş yapılıyor..." kalır — kabul edilmezse küçük takip düzeltmesi · API tarafında giriş / şifremi unuttum gövde doğrulaması ayrı iş olarak açılsın mı | yayından önce (ilki) / herhangi bir zaman (ikincisi) |
| KR-9 | D-8: GO + ad kapsamı (birincil ad / iki ad) + katman `unknown` iken PASS'in kabulü + R27 sonrası telefon beyanının yenilenmesi | §5 R03 | D-8 koşumundan önce |
| KR-10 | D-6: GO · telefon yüklemesi · kalıcı izlerin kabulü · belge onay/ret akışı ayrı paket mi | — | D-6 koşumundan önce |
| KR-11 | D-7: GO · kalan mesaj/bildirim satırları "saklandı" · SEC-PORTAL-ADMIN-MSG-01 açıkken koşum teyidi · kapsam dışı dosya referansında 400'ün ölçüt sayılması | — | D-7 koşumundan önce |
| KR-12 | H beyanları: H6 · H8 imzası (yayından önce mi sonra mı); H3 imza + kapsam seçimi (açık bırakıldı) · H1 / H2 / H4 / H5 / H7 hükümleri (§7.2, günlük dille) | taslaklar: `H3-H6-H8-OWNER-BEYAN-TASLAKLARI-R01.md` | herhangi bir zaman |
| KR-13 | Birleşik D-9: `00c96bd5` kapanışı D-5 bileşeni sayılır mı | varsayılan: **hayır** (bu kayıtta da yeterli sayılmadı) | D-9 kaydından önce |
| KR-14 | Güvenlik öncelikleri: SEC-MAIL-LOG-01 · SEC-STAFF-XFF-01 / SEC-API-BIND-01 kalıcı düzeltme · SEC-PORTAL-ADMIN-MSG-01 · SEC-PORTAL-REQ-01-K4 · FRK-1 · LS-1 · R27 §10 K-5 / K-14 / K-15 | — | herhangi bir zaman |
| KR-15 | Sıradaki blok revizyonlarının kapsamı: D-7 kapanış satırının yalnız ölçüleni yazması · D-6 blok metnindeki eksikler (OK-4) | — | herhangi bir zaman |
| KR-16 | Public depodaki dal commit'lerinde görünen yazar adresi | dal commit'leri yerel git yapılandırmasındaki adresle yazılıyor; adres bu belgeye yazılmaz; yalnız ileriye dönük karar | herhangi bir zaman |

## 12. Bayat satır düzeltmeleri

R01'de (bu PR'ın önceki commit'lerinde) düzeltilenler: `R27-RELEASE-PACKAGE-R01.md` (§1.2, §1.5, §7, §8, §10, §11, kapanış) ·
`record/R27-LIVE-RECORD-R01.md` (§6, §7 ileri atıflar) · `client-extacc-portal-d5-r01` paket belgesi (durum, §7, §8) ·
`H1-H8-ACIK-OLCUTLER-R01.md` §12 · `product-backlog.md` H5 satırı · `client-external-access-r01` iki satırı.

R02'de düzeltilenler: bu belgenin R01 §3.1'indeki "blok beyan sorularını koşum penceresinde bekliyor" ifadesi (pencere kapanmıştır)
· D-5 paket belgesi §8.2–§8.7 (teşhis ifadesi, üç ayrı kapanış görünümü, "kanıt paketi tamamlanmadı", web tarafı adayı) · H8'in
adı · R27 paket belgesinin D-5 satırı (üç görünüm + manifestsiz paket) · bu belgeye yapılan atıfların bölüm / karar numaraları
(R27 paketi, H1–H8 belgesi, `product-backlog.md` H5 satırı, D-5 paketi ve takip kaydı).

Bağımsız inceleme (salt okuma, 2026-10-03) bu belge kümesinde beş major ve on dört küçük bulgu verdi; hepsi bu metinde ele alındı:
karar kimlikleri R27 paketinin numaralarından ayrıldı (KR-n) · D-5 aday listesine web tarafı adayı ve okunmamış kaynaklar eklendi ·
güvenlik tablosu altı sütuna çekildi ve teknik ayrıntı çıkarıldı · H3 / H6 tazelik kanıtının kapsamı düzeltildi · küçük bulgular
(D-8 sınır tanımları, gövde ifadesi, QrTest adımı, yayın bağımlılığı, kayıt atıfları) işlendi.

R03'te düzeltilenler: §3.1'deki "teşhis satırının yokluğu bir sonraki denemede API'ye ulaşmadığını gösterir" ifadesi
(günlük kapsamı doğrulanmadan UNKNOWN kalır) · #2884'ün teşhis katkısının uçtan uca izleme gibi sunulması · D-5 sırasındaki
"elle yazma" owner adımı (owner kararıyla kaldırıldı) · PR durumları ve karar listesi.

Düzeltilmeyenler (bilinçli): `decision-log.md`'ye satır eklenmedi (owner kararı kaydı değildir) · `H1-H8-ACIK-OLCUTLER-R01.md`
içindeki kaymış `product-backlog.md` satır atıfları (ayrı iş).

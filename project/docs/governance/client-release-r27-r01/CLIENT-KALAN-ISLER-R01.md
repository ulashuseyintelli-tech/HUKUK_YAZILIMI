# CLIENT — KALAN İŞLER TEK ÇALIŞMA LİSTESİ (R02) · 2026-10-02

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
> Kaynak ayrımı: **[Ö]** bu çalışmanın kendi ölçümü (2026-10-02; salt okuma ya da izole test) · **[B]** mevcut kayıt belgesinin
> iddiası (yeniden ölçülmedi) · **[O]** owner beyanı (makine ölçümü değildir).

## 1. Kimlikler — `main` ile canlı ayrı tutulur

| Konu | Değer | Kaynak |
|---|---|---|
| Canlı ürün | **R27** — kaynak `1b758d29`, API dist `E28A6863…5134`, WEB `B2DEE365…F621` / `W2UQpBPD…`; migration 0 | [B] `record/R27-LIVE-RECORD-R01.md` §1 |
| `main` | `7ba023c1`. **main ≠ canlı**: `1b758d29` `main`'in atası değildir; `main` canlı adaydan 168 commit ve 5 migration ileridedir (ölçüm: 2026-10-02 22:03Z; `main` sık ilerler) | [Ö] git |
| Canlı veritabanı kodlaması | **UTF8** — salt okunur `SHOW server_encoding`, 2026-10-02 20:39Z; yalnız bu tek okuma yapıldı (owner talimatı CLIENT-HAZIRLIK-KAPANISI-R02 madde 3: "bu okuma yetkilidir"); çıktı yerel kanıt dizinindedir (depoya alınmadı). #2884'ün tek ortam ön koşulu karşılanıyor | [Ö] |
| Yayın B0/B1/B2 · D-1…D-4 kabulleri · D-5 koşumu | Tamamlandı / koşuldu; **tekrarlanmadı, yeniden çalıştırılmadı** | [B] |
| Ağ azaltım kuralı (8080 engeli) ve geri dönüş yedekleri | **Korunur**; bu çalışma dokunmadı | [B] |
| Yayın adayı çalışması | Ayrı bir oturumun taslak PR'ı #2895 (taban `release/r27-candidate` = `1b758d29`). Bu belge o işe **dokunmaz**; yalnız #2884'ün o adaya uygulanabilirliği salt okunur ölçüldü (§3.3) | [Ö] |

## 2. D halkaları — tek tablo

Kabul ölçütlerinin kanonik tanımı `client-external-access-r01` §7'dir; paket ölçütleri ilgili paket belgesindedir.

| Halka | Mevcut kabul | Eksik kanıt | Hazırlık durumu | Bağımlılık | Sonraki işlem | Gerekli owner kararı |
|---|---|---|---|---|---|---|
| **D-1** intake bağlantısı dış cihazdan açılır | **Kabul — dar (intake)**: runId `cff5c692` 22/22 [B]; cihaz/ağ [O] | yok | tamam | — | yok; kapsam genişletilmez | — |
| **D-2** form sentetik veriyle gönderilir | **Kabul — dar (intake)**: `cff5c692` [B] | yok | tamam | — | yok | — |
| **D-3** doğru büro/dosya/statü | **Kabul — dar (intake)**: `cff5c692` [B] | yok | tamam | — | yok | — |
| **D-4** portal girişi dış cihazdan | **Kabul — dar**: runId `e34b7e6d` 21/21 [B]; telefon [O] | yok | tamam | — | yok; Run/Recover tekrarlanmaz | — |
| **D-5** portal parola sıfırlama uçtan uca | **Kabul yok.** runId `00c96bd5`: çıkış 3 · 21 PASS / 0 FAIL / 8 ÖLÇÜLEMEYEN [Ö]; "e-posta gelmedi" [O] | (a) uçtan uca sıfırlama hiç ölçülmedi (8 ölçüt) · (b) kök neden **kanıtlanmadı** · (c) bu koşumun kanıt paketi manifestsiz — **tamamlanamaz** (§3.2) | teşhis: UNKNOWN düzeyinde tamam · yama #2884: hazır, merge edilmedi · yayın hazırlığı: **başlatılmadı** | #2884 merge → yayın (aday kapsamı + GO) → pin PR'ı → yeni D-5 GO'su | §3.3 sırası | D-5 yol seçimi · yayın GO'su · yeni D-5 GO'su · alıcı adresi · tek gönderim onayı |
| **D-6** belge yükleme/indirme/silme | **Kabul yok** — canlı koşum yok | canlı Run + owner beyanı (D6-*, P6-C*) | blok R02 #2880: hazır, merge edilmedi · blok öz-testi 73/73 · koşucu öz-testi teslim dosyasıyla 51/51 (§4) | #2880 merge (blok `main` checkout'undan okunur) · ayrı GO · dış zincir · canlı dist pini R27 (yayından önce ya da pin PR'ından sonra) | Preflight → QrTest → Run | D-6 GO · telefon yüklemesi · kalıcı izlerin kabulü · kalıntıda sıra kararı (§4.3) |
| **D-7** mesaj gönderme/okuma | **Kabul yok** — canlı koşum yok | canlı Run + owner beyanı (D7-*, P7-C*) | blok R02 #2882: hazır, merge edilmedi · blok öz-testi 64/64 · koşucu öz-testi teslim dosyasıyla 41/41 (§4) | #2882 merge · ayrı GO · dış zincir · canlı dist pini · SEC-PORTAL-ADMIN-MSG-01 açık (engel değil) | Preflight → QrTest → Run | D-7 GO · kalan mesaj/bildirim satırları "saklandı" · kapsam dışı dosya referansında 400'ün ölçüt sayılması · Recover kuralı |
| **D-8** personel yüzeyi dışarıdan kapalı | **Kısmi**: yalnız 2026-09-27 telefon beyanı, 5 GET 403 [O]; R27 öncesi | sonda canlıda koşulmadı; telefon beyanı R27 sonrası yinelenmedi; katman ölçülmez | sonda + öz-test hazır (pin `D5FA37D1…579B`); **kapsam kararı bekliyor** (§5) | ayrı GO · dış zincir · D8-E1/E2/E3 kararı | karar → (gerekirse sonda revizyonu) → GO → sonda + telefon beyanı | D-8 GO + §5 kapsam kararları |
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
| A2 | **Web tarafı:** sıfırlama sayfası tarayıcıda devralınmadan (hydration) önce doldurulan adres API'ye **boş** gider; API aynı başarı yanıtını verir, sıfırlama kaydı ve e-posta oluşmaz | ayrı bir ölçümde üretim derlemesinde doğrulanmış davranış (2026-10-02; ölçülen sayfa dosyası canlı kaynakla aynı); bu koşumda olduğu **ölçülmedi** | **kapatmaz**; yalnız "e-posta alanı boş" teşhis satırı kazandırır (boş gönderim yanlış yazılmış adresten ayırt edilir). `main`'deki giriş formu düzeltmesi (#2894) düğmeyi devralmaya kadar kapatır, alan değerini **eşitlemez** |
| A3 | Talep API'ye ulaşmadı (kenar katmanı) | erişim günlüğü yok; kenar günlüğü okunmadı | teşhis satırının **yokluğu** bir sonraki denemede bunu gösterir |
| A4 | SMTP / sağlayıcı | token görülmediği için gönderim aşamasına gelindiğine dair iz yok; **dışlanmadı** | gönderim sonucu satırı (mevcut) |

#2884 **kaynak okumasıyla doğrulanmış bir kusur sınıfını** (A1) kapatır ve sessiz dallara teşhis satırı ekler. **#2884'ün bu koşumun
kök nedenini giderdiği kanıtlanmamıştır.** Kesin kazanımı: bir sonraki denemede API tarafındaki neden ölçülebilir olur. A2 için
ürün düzeltmesi web tarafındadır ve bu çalışmanın kapsamında **değildir** (§11 KR-3).

### 3.2 Bu koşumun kanıt paketi — TAMAMLANMADI

Ayrıntı: `client-extacc-portal-d5-r01/D5-RUN-00C96BD5-TAKIP-20261002.md` ve paket belgesi §8.

- Beyan penceresi **kapanmıştır** [Ö 2026-10-02]: süreç yok; makine koşumdan sonra yeniden başladı. Blok, beyan dosyasını, birleşik
  kararı ve manifesti beyan sorularından sonra yazar; akış o noktaya gelmedi. **Üç dosya yoktur ve bu koşum için sonradan
  üretilmez**; üretilmiş gibi gösterilmez. Yeni Run başlatılmadı.
- Beş özgün dosya korunur; ham bayt özetleri koşum sonu ile aynıdır [Ö].
- Bloğun dokuz sorusundan yedisi owner beyanından ya da onun sonucundan okunur; **ikisi eksiktir** (telefonun ağı · koşumdan sonra
  telefondaki sayfa yenilenince görülen ekran). Yanıtlar takip kaydına işlenir; blok dosyası üretilmez (§11 KR-1).
- Kapanış üç ayrı görünümdedir: (a) kapanış — DB, token, yeni giriş, personel/dosya: **PASS** · (b) özgün (sıfırlama öncesi)
  oturumun reddi: **PASS** · (c) sıfırlama sonrası kontroller: **ÖLÇÜLEMEYEN** (8 ölçüt; sıfırlama gerçekleşmedi). (c) PASS sayılmaz.

### 3.3 Uygulanabilir sıra: teşhis/yama → yayın hazırlığı → yeni GO ile tek deneme

| Adım | İçerik | Durum | Yetki |
|---|---|---|---|
| 1 Teşhis | §3.1 — kök neden **UNKNOWN**; dört aday kayıtlı. Güncel veritabanından geçmiş eşleşme türetilmez. Okunmamış iki kaynak (kenar günlüğü, sağlayıcı kayıtları) owner erişimi ister | **bu çalışmanın erişebildiği kaynaklarla tamam**; kök neden açık | okunmamış kaynakların okunması (isteğe bağlı) |
| 2 Yama | #2884 (A1'i kapatır; A2/A3 için teşhis satırı). Durum §9 | açık; merge edilmedi; CI 10/10 (§10) | merge onayı |
| 2b Web tarafı (A2) | sıfırlama sayfasında erken doldurulan alanın boş gitmesi: düzeltme seçenekleri ayrı ölçüm kaydındadır; bu çalışmada kod değişmedi | **karar bekliyor** | §11 KR-3 |
| 3a Aday kapsamı | Ölçüm [Ö, `git merge-tree`, salt okuma]: #2884 canlı kaynağa **tek başına** taşınırsa portal servisinde 2 çakışma bölümü çıkar (hesap açmadaki işlem içi yetki satırları canlıda yok — #2825). İşlem içi yetki satırlarını içeren aday taslağı (#2895) üstünde servis ve testler **otomatik birleşir**; yalnız CI manifestinde tek satır elle çözülür. Sonuç: #2884 ya o adaya eklenir ya da hesap açma ayağı elle uyarlanır | ölçüldü; **karar bekliyor** | aday kapsamı kararı (yayın planı owner'da) |
| 3b Ön koşul | canlı veritabanı kodlaması UTF8 | **ölçüldü** (§1) | — |
| 3c Aday derleme + izole prova | B0 → B1 → B2 kalıbı; geri dönüş B3 (#2862; canlıda koşulmadı) | **başlatılmadı** | yayın hazırlığı GO'su |
| 3d Yayın | canlı API dist değişir; `.env` ve şema değişmez (yalnız #2884 için migration 0). WEB yalnız #2884 için değişmez; A2 düzeltmesi kapsama alınırsa WEB de değişir | **başlatılmadı** | yayın GO'su |
| 3e Pin PR'ı | owner bloklarının canlı dist pini yeni değere çekilir (D-5/D-6/D-7/D-8 blokları dahil). #2880 ve #2882 bundan **önce** `main`'de olmalı | **başlatılmadı** | merge onayı |
| 4 Tek deneme | Preflight → **QrTest** (pin PR'ı bloğu değiştirdiği için yeniden koşulur; canlı veri işlemez, GO tüketmez) → Run (tek gönderim) → pencere kapanmadan dokuz beyan sorusu → manifest. A2 web tarafında düzeltilmediyse owner adımı: sayfa **tam yüklendikten sonra** adres alana elle yazılır (yapıştırma / otomatik doldurma yok). Otomatik ikinci gönderim, ikinci Run ya da Recover **yok** | **başlatılmadı** | yeni D-5 GO'su · alıcı adresi (yalnız konsol) · tek gönderim onayı |

Kabul ölçütü değişmez: Run çıkış 0 **ve** owner beyanı. Çıkış 3 kabul değildir. E-posta teslimi makineyle ölçülmez; yalnız owner
beyanıdır. Token'ın veritabanına yazılması teslimi kanıtlamaz.

Alternatif (yayınsız yeni deneme): canlı R27 değişmeden yeni GO ile deneme. Kök neden UNKNOWN olduğu için aynı sonuç yeni bir GO ve
gönderim onayını tüketerek tekrarlanabilir ve yine teşhis satırı oluşmaz. **Önerilmez**; karar owner'ındır (§11 KR-2).

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

## 5. D-8 sondası — 46 isteğin kapsamı, yan etkiler, kapsam boşluklarının kabule etkisi (**çalıştırılmadı**)

Sonda `client-extacc-d8-staff-surface-r01/scripts/d8-staff-surface-probe.js` (pin `E150EEDA…514C`; belge ve blok pini ile eşit [Ö];
R04 D8-E1/E2 ile değişti — önceki `D5FA37D1…579B`). Durum açmaz: sentetik veri, hesap, token, veritabanı erişimi yoktur;
kapanış/Recover gerekmez; yeniden koşulabilir.

**İstekler: 68, sıralı, tekrar denemesiz, istek başına 15 sn.** 59 ret vektörü (403 beklenir) + 9 pozitif (3 sayfa 200, 6 API 401).
R04'te eklenenler: **D8-E1** HEAD + OPTIONS üç yüzeyde (personel sayfası, personel API, admin portal yolu) = 6 vektör;
**D8-E2** izole provadan 18 kodlama/normalizasyon varyantı (2'si — büyük harf `ADMIN` ve nokta-segment `./admin` — eski 4 varyanttan
devralındı, mükerrer istek yok). Ret 37→59, toplam 46→68.

| Yöntem | Toplam | Ret vektörü | Pozitif |
|---|---|---|---|
| GET | 41 | 35 | 6 |
| POST | 11 | 9 | 2 |
| PUT | 3 | 3 | 0 |
| PATCH | 1 | 1 | 0 |
| DELETE | 6 | 5 | 1 |
| HEAD | 3 | 3 | 0 |
| OPTIONS | 3 | 3 | 0 |

Gövde: POST / PUT / PATCH'te boş JSON `{}` (15 istek); GET / DELETE / HEAD / OPTIONS gövdesiz (53). Kimlik başlığı **yok**. Tek origin.
Tekrar denemesiz, istek başına 15 sn (değişmedi).

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
| 16–18 | GET admin yol varyantları (`/api/portal/admin` kök · `%2F`-önek · `?x=1` sorgu) | 403 | normalize sonucu admin rotası (401) veya 404 (çalışma zamanında ölçülmedi); yazma yok |
| 19 | DELETE `/intake/d8probe` (web) | 403 | sonuç ölçülmedi; rota işleyicisi yok |
| 20–22 | DELETE · PUT · PATCH `/api/public/intake/d8probe` | 403 | 404 |
| 23 | GET `/api/portal/login` | 403 | 404; portal giriş sayacına dokunmaz |
| 24–29 | izinli portal yollarında yanlış yöntem | 403 | 404 |
| 30, 32 | POST `/portal/profile` · `/portal/login` (web) | 403 | sonuç ölçülmedi; yazma yok |
| 31 | GET `/api/portal/change-password` | 403 | 404 |
| 33–35 | GET `/robots.txt` · `/api` · `/api/` | 403 | 404 |
| **36–38** | **D8-E1 HEAD** `/` · `/api/auth/me` · `/api/portal/admin/documents/pending` | 403 | kenar matcher'ı yöntem duyarlı → HEAD varsayılan 403. Geçerse: sayfa → Next HEAD=GET başlıkları (gövde yok) 200/3xx; API/admin → Express HEAD→GET işleyici → `JwtAuthGuard` 401; DB/yazma/audit/**giriş sayacı yok** |
| **39–41** | **D8-E1 OPTIONS** `/` · `/api/auth/me` · `/api/portal/admin/documents/pending` | 403 | geçerse: API/admin → Nest `enableCors` ön uçuşu guard/rota öncesinde **204** (Origin başlığı yok → ACAO yok; DTO/giriş sayacı çalışmaz; yazma/audit/hata kaydı **yok**); sayfa → Next 405/404 (ölçülmedi) |
| **42–59** | **D8-E2** izole provadan 18 kodlama/normalizasyon varyantı (16 GET + 1 POST `{}` + 1 DELETE): yüzde-kodlama · kodlanmış/düz traversal · çift slash · nokta-segment · büyük harf · sondaki slash · noktalı virgül · boş bayt · çift kodlama · geçersiz unicode | 403 | kenar ham yolu **temizler** (yüzde-çöz + `.`/`..`/`//`) → izin listesini aşmaz. Geçer ve uygulama çözerse: admin → `JwtAuthGuard` 401 / rota yok → 404 / personel sayfası → 200; yazma yok |
| 60–62 | GET `/portal/login` · `/portal/forgot-password` · `/portal/reset-password` | **200** | web sayfası; sıfırlama isteği **gönderilmez**; yazma yok |
| 63–65 | GET `/api/portal/cases` · `documents` · `messages` | **401** | guard ilk kontrolde durur; DB okuması bile yok |
| 66–68 | POST `messages` `{}` · DELETE `documents/d8probe` · POST `change-password` `{}` | **401** | guard işleyiciden önce durur; yazma yok |

Bilinçli dışarıda bırakılanlar: portal giriş/sıfırlama POST'ları, intake POST, belge yükleme. Telefon adımı ayrı: 5 GET, mobil veri,
owner beyanı. **D8-E1/E2 yan etki:** yeni 24 vektör (6 HEAD/OPTIONS + 18 varyant) beklenen 403'te uygulamaya ULAŞMAZ; kenar geçirse bile
yazma/audit/hız sınırı sayacı üretmez — HEAD/OPTIONS GET-ish yüzeyde guard 401 ya da CORS 204; OPTIONS giriş sayacını (login) tetiklemez
(CORS ön uçuşu guard'tan önce 204, DTO çalışmaz). HEAD yanıtı **gövdesizdir** → sağlayıcı imzası ve `suspectAppOrigin403` HEAD'te okunamaz;
katman yine `unknown`.

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
| D8-E1 | ~~HEAD / OPTIONS vektörü yok~~ → **R04'te eklendi** (hazır, canlıda koşulmadı) | HEAD ve OPTIONS artık üç yüzeyde (sayfa/API/admin) sondada; 403 beklenir, kenar geçirirse etki §5 tabloda | **sonda revizyonu seçildi**: 6 vektör eklendi, pin + öz-test + belge birlikte güncellendi (öz-test 17/17); AÇIK: owner GO + canlı koşum |
| D8-E2 | ~~yol kodlama varyantı canlı listede 4, izole provada 18~~ → **R04'te 18'in tamamı eklendi** (hazır, canlıda koşulmadı) | 18 varyant sondada; öz-test sağlıklı kenarda hepsi 403, bozuk kenarda normalize-olan sızar | **18 vektör taşındı**; pin + öz-test + belge birlikte güncellendi; AÇIK: owner GO + canlı koşum |
| D8-E3 | tek ana makine adı; tünele bağlı diğer adlar kapsam dışı | kabul **yalnız birincil ad** içindir. "Dışarıdan kapalı" genellemesi diğer adlar için **yapılamaz** | her ad için ayrı `--origin` koşumu (adlar public belgeye yazılmaz; parametre eklenmez — belge §1b) / "kapsam = yalnız birincil ad" kararı — **owner kararı** |

D8-E1/E2 **sonda revizyonu yoluyla** kapatıldı (pin `E150EEDA…514C`, öz-test 17/17, canlı koşum owner GO'suna bağlı); D8-E3 hâlâ
**owner kapsam kararı** (ad başına koşum / yalnız birincil ad). "Sınır kaydıyla dar kabul" yolu yalnız E3 için geçerli kalır.
SEC-API-BIND-01 açıkken D-8 sonucu ayrıca "dışarıdan erişilemez" diye genellenmez (§8).

Diğer sınırlar (minor; koşumu engellemez; kimlikler bu belgede tanımlıdır): uygulama katmanını ayırt eden başlık kanıta alınmıyor
(D8-E4) · 403 dışı kenar hataları "bulgu" diye sınıflanır, dış zincir ön ölçümü yok (D8-E5) · canlı kenar yapılandırmasının
şablonla eşitliği ölçülmüyor (D8-E6) · dış ağdan makine koşumu yok (D8-E7) · blok kanıtı mühürlemiyor (D8-E8) · telefon beyanı
için dosya şablonu yok (D8-E11).

Kanıt kabul kontrol listesi (koşulduğunda): satır 68 (59 + 9) · kimlik başlıklı istek 0 · boş olmayan gövde 0 · boş JSON gövde 15,
gövdesiz 53 (GET/DELETE/HEAD/OPTIONS) · ölçülemeyen 0 · bulgu listesi boş. 403 dışı ret bulgusu kısıtlı kayda alınır; public PR'a ayrıntı yazılmaz.

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
| **H6 Gönderim** | yok (teknik: İ12 `92d04ef3` 17/17; bağımsız doğrulama 10/10) | yok — ölçüt kümesi tamam; gerçek alıcı/sağlayıcı ölçülmedi (test alıcısı) | **beyan taslağı hazır** | **yayın kapsamı**: yayın adayı taslağı finansal beyan modülünde 4 test dışı dosyayı değiştiriyor [Ö] — yayınlanırsa beyanın 4. maddesi gereği kabul yeniden değerlendirilir | owner beyanı imzalar | imza — yayından önce mi sonra mı (§11 KR-12, KR-8) |
| H7 Portal | yok (teknik: İ16 `6b883b16` 12/12, R25B) | tazelik: ölçümden sonra portal kodu değişti; H7-05b · K-1 yazma matrisi (portal ölçütü) · PSUS yalnız tek kullanımlık ortamda | hüküm bekliyor | R27 §10 K-12 ve K-11; D-5 tamamlanmadı | hüküm → beyan | hükümler · tazelik · "D-5 tamamlanmadan imzalanır mı" (§11 KR-12) |
| **H8 Muhasebe kayıt kapanışı (F04)** | yok (teknik: İ15 `1b83637a` 5/5; bağımsız doğrulama 7/7; test kanıtı 10/10) | yok — ölçüt kümesi tamam; **canlı yarış testi değildir** | **beyan taslağı hazır** | **yayın kapsamı**: yayın adayı taslağı kayıt modülünde 10 test dışı dosyayı değiştiriyor [Ö] — yayınlanırsa test kanıtı o kaynakta yenilenmeden kabul geçerli sayılmaz | owner beyanı imzalar | imza — yayından önce mi sonra mı (§11 KR-12, KR-8) |

**"Yalnız imza bekliyor" iddiası kayıt düzeyinde doğrulandı — H6 ve H8 için yalnız imza; H3 için imza + bir seçim.** Üçünde de
bekleyen ayrı hüküm (R27 §10 K-12 kalemi) yoktur. Ölçüt, tamamlanmış kanıt, sınırlar, kaynak tazeliği (ölçümü belirleyen kaynak
dosyalarda ölçüm kaynağı → canlı R27 arasında 0 fark; kapsam beyan belgesinde) ve owner'ın imzalayacağı **gerçek beyan metinleri**:
`H3-H6-H8-OWNER-BEYAN-TASLAKLARI-R01.md`. Taslaklar imzalanmadıkça sayaç **0/8** kalır.

`office-remaining-decisions-r01` §4'teki toplu metin olduğu gibi imzalanmamalıdır (açık kalemleri örtük kabul ettirir).

## 8. Güvenlik işleri

**Bu tabloda teknik ayrıntı yoktur** (public depo kuralı: açık bulgu yalnız kimlik · durum · etkilediği adım). Ayrıntı, giderilen
davranış ve kalan risk kısıtlı kayıttadır. "Mevcut kabul" sütunu risk kabulünü gösterir: R27 yayını için verilen owner risk kabulü
public kayıtlarda yalnız SEC-PORTAL-ADMIN-MSG-01 için açıkça yazılıdır; **sonradan çıkan kayıtlar o kabulün kapsamında sayılmaz**.
Bu çalışma açık bulguları topluca kapatmadı.

| Kimlik | Mevcut kabul / durum | Eksik kanıt | Hazırlık durumu | Bağımlılık / etkilediği adım | Sonraki işlem | Gerekli owner kararı |
|---|---|---|---|---|---|---|
| **SEC-PORTAL-REQ-01** | risk kabulü **yok** (R27 kabulü genişletilmedi) · AÇIK | canlıda ölçülmedi | yama hazır (#2884); merge edilmedi, canlıda değil | portal giriş ve sıfırlama talebi; portal hesabı açma; D-5 yeni denemesi | merge → yayın | KR-7, KR-8 |
| SEC-PORTAL-REQ-01-K1 | risk kabulü yok · AÇIK (kalan risk; #2884 kapatmaz) | — | yama yok | portal hesabı açma | ayrı iş | KR-4 |
| SEC-PORTAL-REQ-01-K2 | risk kabulü yok · AÇIK (önceden var) | canlı sayım yapılmadı | yama yok | portal girişi ve sıfırlama talebi | sayım → karar | KR-4, KR-6 |
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

## 9. Dört PR — kesin durum [Ö 2026-10-02 22:03Z; tek ölçüm]

| PR | İçerik | Uç | Yerel doğrulama | Durum |
|---|---|---|---|---|
| #2884 | portal e-posta eşleşmesi, teşhis satırları ve hesap açma çakışma kuralı. Dış yanıtlar, şema, kayıtlı adres biçimi değişmez; migration yok. Ayrıntı PR'da ve kısıtlı kayıtta | `7bdcc533` | yeni birim + gerçek Postgres 86/86 (Türkçe yerel ayarlı veritabanında ve bağlantı havuzu 3 ile de); mutasyon 34/34 + hedefli 12/12 + 5/5; `pure/client-portal` 150 suite / 2229 test; `pure/architecture-guards` 78 / 1359. Bağımsız inceleme önceki ucun (`4d16ba6a`) CI'da **kırmızı** olduğunu buldu (eşzamanlılık testi koşucunun bağlantı havuzuna sığmıyordu; ürün davranışı değil) — test düzeltildi | açık; merge edilmedi; CI 10/10 (§10) |
| #2880 | D-6 owner bloğu R02 + koşucu öz-testinin canlı ağaç bağımlılığının giderilmesi + belgede Run / kapanış / Recover sınırları. Koşucu ve pinli dosyalar değişmedi | `357027bb` | blok öz-testi 73/73 ×2 kabuk (belgenin son hâliyle); koşucu öz-testi commit'teki dosyayla 51/51; negatif kontroller; bağımsız doğrulama (altı küçük düzeltme uygulandı) | açık; merge edilmedi |
| #2882 | D-7 owner bloğu R02 + koşucu öz-testinin canlı ağaç bağımlılığının giderilmesi + belgede sınırlar. Koşucu ve pinli dosyalar değişmedi | `4d368a8f` | blok öz-testi 64/64 ×2 kabuk (belgenin son hâliyle); koşucu öz-testi commit'teki dosyayla 41/41; negatif kontroller 7/7; bağımsız doğrulama (bir major + beş küçük düzeltme uygulandı) | açık; merge edilmedi |
| bu PR (#2885) | D-5 koşum kaydı ve takip kaydı, bu tablo, H3/H6/H8 beyan taslakları, bayat satır düzeltmeleri (yalnız belge) | — | bağımsız inceleme (beş major + on dört küçük bulgu; hepsi bu metinde ele alındı) | açık; merge edilmedi |

**Hiçbiri merge edilmedi; hiçbiri canlıda değil.** Merge owner kararıdır.

## 10. Hazırlık hükmü

| Ölçüt | Durum |
|---|---|
| D-5 teşhisi kanıtın taşıdığı düzeyde yazıldı | karşılandı (§3.1); kök neden UNKNOWN, dört aday kayıtlı |
| Dört PR'ın CI'ı | **karşılandı — ölçüm 2026-10-03 07:12Z**: #2880 (`357027bb`), #2882 (`4d368a8f`), #2884 (`7bdcc533`) ve #2885 (`88348662`) 10/10 başarılı, birleştirilebilir. #2884'te `db/domain-integration`, `pure/architecture-guards` ve `pure/client-portal` adımlarının bu uçta koştuğu ayrıca doğrulandı (önceki uç `4d16ba6a` kırmızıydı; test düzeltildi). Bu satırı taşıyan commit'in kendi CI'ı push'tan sonra koşar |
| D-6 / D-7 doğrulaması teslim edilen dosyalarla tekrarlanabilir | karşılandı (§4.1) |
| #2884 açık soruları | kanıtlandı ya da yamalandı; kalan riskler kısıtlı kayıtta kimlikleriyle duruyor; **ürün politikası kararı açık** (§11 KR-4) |
| D-5 koşumu `00c96bd5` kanıt bütünlüğü | **AÇIK — tamamlanamaz**: manifest yok; pencere kapandı; iki owner beyanı eksik (§3.2) |
| Canlı kabul | **eksik**: D-5, D-6, D-7, D-8 (kısmi), birleşik D-9; H1–H8 0/8 |

**Hüküm: HAZIRLIK GO-COMPLETE DEĞİL.** Açık madde: D-5 koşumu `00c96bd5` kanıt bütünlüğü — manifest yok ve bu koşum için üretilemez; iki owner beyanı eksik. CI (dört PR) ve teslim dosyalarının doğrulaması (D-6 / D-7 öz-testleri, #2884 testleri) tamamdır.

**CLIENT GENEL KABUL TAMAMLANMADI** (canlı kabul eksik: D-5, D-6, D-7, D-8, birleşik D-9; hizmet kabulü 0/8).

## 11. Tek owner karar listesi (KR-n; R27 paketinin K-n numaralarından ayrıdır)

| # | Karar | Seçenekler / not | Ne zaman |
|---|---|---|---|
| KR-1 | D-5 koşumu `00c96bd5` için iki eksik beyan | (i) telefon hangi ağdaydı · (ii) koşum bittikten sonra telefondaki sayfa yenilenince ne görüldü. Yanıtlar takip kaydına işlenir; kanıt paketi yine manifestsiz kalır | ilk fırsatta |
| KR-2 | D-5 yol seçimi | **A (önerilen)**: #2884 merge → yayın → pin PR'ı → yeni GO ile tek deneme (§3.3) · **B**: yayınsız yeni deneme (önerilmez) | D-5'ten önce |
| KR-3 | D-5 web tarafı adayı (A2) | (a) sıfırlama sayfası düzeltmesi yayın kapsamına alınır (ayrı iş; seçenekleri ayrı ölçüm kaydında) · (b) düzeltme olmadan tek denemede owner adımı: sayfa tam yüklendikten sonra adres elle yazılır · (c) okunmamış kaynaklar (kenar günlüğü, sağlayıcı kayıtları) önce okunur | D-5'ten önce |
| KR-4 | SEC-PORTAL-REQ-01-K1 ve K2 için ürün politikası kararı | seçenekler ve etkileri kısıtlı kayıttadır; owner'a doğrudan sunulur (public belgeye yazılmaz) | #2884 yayınından önce |
| KR-5 | D-6 / D-7 Recover kuralı | ayrı onayın nasıl verilip kaydedileceği · ikinci Recover gerekirse yol · D-6 kalıntısında sıra · D-7'de makbuzsuz yarım kurulumda yapılacak iş · yayın ile D-6/D-7 sırası · paket belgelerindeki açık kararlar (D-6 OK-1…OK-4; D-7 K-4…K-7) | D-6/D-7 koşumundan önce |
| KR-6 | Canlı veritabanında salt okuma **sayımı** (SEC-PORTAL-REQ-01-K2; adres yazılmaz, yalnız sayı) | yap / yapma | #2884 yayınından önce (isteğe bağlı) |
| KR-7 | Merge onayları: #2884, #2880, #2882, #2885 | inceleme sonrası; `main` CI boşken, uç commit'e sabitli | — |
| KR-8 | Yayın: aday kapsamı (#2884 hangi adaya girer; A2 düzeltmesi girer mi) + yayın hazırlığı GO'su + yayın GO'su | yayın planı seçenekleri koordinasyon kaydındadır. Aday H6/H8 modüllerini değiştirirse o beyanlar yeniden değerlendirilir (§7) | KR-2 = A ise |
| KR-9 | D-8: GO + D8-E1/E2/E3 (§5) + katman `unknown` iken PASS'in kabulü + R27 sonrası telefon beyanının yenilenmesi | sınır kaydıyla dar kabul / sonda revizyonu | D-8 koşumundan önce |
| KR-10 | D-6: GO · telefon yüklemesi yapılsın mı · kalıcı izlerin kabulü · belge onay/ret akışı ayrı paket mi | — | D-6 koşumundan önce |
| KR-11 | D-7: GO · kalan mesaj/bildirim satırları "saklandı" · SEC-PORTAL-ADMIN-MSG-01 açıkken koşum teyidi · kapsam dışı dosya referansında 400'ün ölçüt sayılması | — | D-7 koşumundan önce |
| KR-12 | H beyanları: H6 · H8 taslaklarının imzası; H3 imza + seçim · H1/H2/H4/H7 hükümleri (R27 §10 K-12) · H5 için ayrı satır (R27 §10 K-13) | taslaklar: `H3-H6-H8-OWNER-BEYAN-TASLAKLARI-R01.md`; H6/H8 için yayın sırası (KR-8) | herhangi bir zaman |
| KR-13 | Birleşik D-9: `00c96bd5` kapanışı D-5 bileşeni sayılır mı | varsayılan: **hayır** | D-9 kaydından önce |
| KR-14 | Güvenlik öncelikleri: SEC-MAIL-LOG-01 · SEC-STAFF-XFF-01 / SEC-API-BIND-01 kalıcı düzeltme · SEC-PORTAL-ADMIN-MSG-01 · SEC-PORTAL-REQ-01-K4 · FRK-1 · LS-1 · R27 §10 K-5 / K-14 / K-15 | — | herhangi bir zaman |
| KR-15 | Sıradaki blok/koşucu revizyonlarının kapsamı (hepsi pin değiştirir; canlı koşumu engellemez): D-7 kapanış satırının yalnız ölçüleni yazması · D-6 koşucusunda kova erişim reddinin ÖLÇÜLEMEYEN sayılması · koşucuların kanıta yazdığı kurtarma adımı metni · D-6 blok metnindeki eksikler | — | herhangi bir zaman |
| KR-16 | Public depodaki dal commit'lerinde görünen yazar adresi | dal commit'leri yerel git yapılandırmasındaki adresle yazılıyor; bu adres `main`'deki commit'lerde görünen adresten farklı türdedir (adres bu belgeye yazılmaz). Geçmiş yeniden yazılmaz (force-push yok); karar yalnız ileriye dönüktür | herhangi bir zaman |

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

Düzeltilmeyenler (bilinçli): `decision-log.md`'ye satır eklenmedi (owner kararı kaydı değildir) · `H1-H8-ACIK-OLCUTLER-R01.md`
içindeki kaymış `product-backlog.md` satır atıfları (ayrı iş).

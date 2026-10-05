# EXTACC D-8 — PERSONEL YÜZEYİ DIŞARIDAN KAPALI · D-6/D-7 TANIMI · BİRLEŞİK D-9 (R01)

> **DURUM: HAZIRLIK R05 — owner kararları işlendi (§3b); kanıt kuralının gerçek API ile izole provası çağıranda (yapılmadı);
> CANLIDA KOŞULMADI; canlı sonda GO'su YOK.** D-8 kısmi kaydı (owner telefonu, 5 GET → 403, 2026-09-27 21:14–21:15) **tamamlanmış
> sayılmaz**: katman ölçülmedi; diğer yöntem/yollar açık. Bu paket makine ölçümünü ve telefon beyanını ayırır.
>
> **R05 (2026-10-05; üçüncü tur 2026-10-06) — ad başına koşum; owner kararlarıyla üç ayrı alan.** Owner talimatı (2026-10-05, aynen): "D-8 hazırlığında
> birincil adı ve sahipliği doğrulanmış diğer yayın adlarını ayrı satırlarda göster. Bir adın sonucu diğerine taşınmasın; ret sonucu
> ile reddeden katmanın kimliği ayrı değerlendirilsin. Canlı sonda kapsamı ve GO'su ayrıca kesinleşecek." Aynı gün owner, bekleyen
> D-8 kararlarını verdi (§3b). Bu revizyonun **geçerli** kuralları: **(1)** bir süreç = bir ad = bir kanıt (zorunlu ad kimliği
> `--alias AD-<n>`; çok adlı döngü yok) · **(2)** ad düzeyinde **üç ayrı alan + pozitif kontrol** — HTTP / ret sonucu · kenar
> engelleme sonucu · katman doğrulaması; her biri yalnız PASS / FAIL / ÖLÇÜLEMEYEN; ikisini birleştiren tek bir "PASS" ya da "D-8
> PASS" üretilmez (§1.1) · **(3)** API'ye özgü kanıt: API'nin kabul **etmediği** biçimdeki istek kimliğini atıp **yenisini
> üretmesi**; gönderilen değerin aynen dönmesi API kanıtı **sayılmaz** (sıradan bir yansıtan katman da onu üretir) · **(4)** birincil
> ad dışındaki her ad için **kapsam yetkisi kapısı** (§1) · **(5)** çıkış kodu dört alandan türer; çıkış 5 ("değerlendirme gerekir")
> ve bütün "karar bekliyor" işaretleri **kalktı** · **(6)** public satıra yalnız alan değerleri ve ad kimliği yazılır (§1b) ·
> **(7)** öz-test "ayırt edici girdi → ölçülen alan" biçimindedir; owner blokları iki kabukta sınanır. DEĞİŞMEYENLER: vektör
> listeleri (59 ret + 9 pozitif), kimlik bilgisi göndermeme, ham yol sadakati, `design` / `measured` ayrımı, `d8-staff-` dosya adı
> öneki. Canlı sonda **çalıştırılmadı**; bu revizyon GO ya da kapsam kararı **değildir** (açık kalan tek karar §3b); pinler değişti (§7).
>
> **R05'in önceki iki turu (2026-10-05; tarihsel — git geçmişindedir).** İlk tur "ret hükmü + katman hükmü" diye iki hüküm ve
> çıkış kodu 5'i getirdi; ikinci tur (üç bağımsız doğrulamanın bulguları üzerine) eşleşen yankıyı ileri kalibrasyon olmadan da API
> kanıtı saydı ve sınama işaretli 403'ü ayrı sınıfa aldı. **Bu üçüncü turla şu kurallar GEÇERSİZDİR:** "ret hükmü `KAPALI` /
> `KAPALI-DEGIL` / `DEGERLENDIRME-GEREKIR`" ve "katman hükmü `ADLANDIRILDI-API` / `ADLANDIRILAMADI`" · "gönderilen kimlik aynen
> döndüyse yanıtı API üretmiştir" · "API'nin ürettiği 403 owner kararı bekliyor (çıkış 5)" · "kanıtsız 5xx / 429 → çıkış 3, kanıtsız
> 3xx / 4xx → çıkış 5" · "ret hükmü kapalı olan adın sayıları ve özet SHA-256'sı public tabloya yazılır". **R04'ten kalan şu kurallar
> da geçersizdir:** "ret vektöründe 403 = tamam", "katman `unknown` ise PASS düşmez", "`suspectAppOrigin403 > 0` ise PASS düşmez",
> "D-8 PASS = sonda çıkış 0 ve telefon 5/5".
>
> Önceki revizyon notları (tarihsel; R05'le çelişen kural cümleleri yukarıdaki nota göre okunur):
> R01 gözden geçirme düzeltmeleri (2026-09-29): (a) katman yalnız `Server` başlığından; boş 403 gövdesi tek başına `caddy` demez ·
> (b) ham request-target korunur (seçenek nesnesiyle istek) ve öz-testte kenarın gördüğü yolla birebir doğrulanır ·
> (c) istek listesi/yan etki tablosu; "giriş denenmez" yerine "kimlik bilgisi gönderilmez" · (d) öz-test.
> İkinci tur inceleme düzeltmeleri (2026-09-29): DELETE gövdesiz (yalnız POST/PUT/PATCH `{}`) · giriş sayacı ifadesi (uygulama
> boş gövdeli isteği de sayar) · kimlik/yazma bayrakları ölçülen `measured` alanından, `design` beyanı ayrı · S2 açıklaması (bulgu = 7)
> · `POST /api/auth/register` + `GET /api/auth/capabilities` vektörleri (37 ret) · `suspectAppOrigin403` sayacı · koşum bloğunda
> yer tutucular · öz-test **15/15**.
> Kapanış düzeltmesi (2026-09-29, üçüncü tur): §4/§5 D-6/D-7 tanımları paketlere işaret eden eşleme tablolarına çevrildi (koşucular
> YAZILDI; model adları `PortalMessage`/`PortalNotification`; D7-4 kaynak 400; D6-1 makine yüklemesi; D6-6 zorunlu bekleyen liste — "ölçüldü"
> notlarıyla) · §6 birleşik D-9 bileşen→ölçüt tablosu + "saklanan kayıt silinmiş gibi raporlanmaz" / Recover kuralları. Sonda ve öz-test
> DEĞİŞMEDİ (§7 pinleri aynı); canlı sonda yine çalıştırılmadı.
> **R27-R03 düzeltmesi (2026-09-30):** `Server`/sağlayıcı başlıkları ve gövde imzası reddin katmanının **kesin kanıtı sayılmaz** — yalnız
> İPUCU olarak `layerHint`/`denyLayerHints`'e yazılır; sondada kesin katman kanıt kaynağı olmadığından 403 satırlarında `layer` daima `unknown`.
> `unknown` ret ölçümünü (satır `ok`, çıkış kodu) **başarısız saydırmaz**. Ham request-target korunur (değişmedi). Öz-test yeni anlama göre
> güncellendi: **15/15**; eski (başlıktan katman türeten) sonda yeni öz-testte **9/15** (negatif kontrol). Canlı sonda yine çalıştırılmadı.
> **R04 D8-E1/E2 (2026-10-03):** yöntem kapsamı HEAD ve OPTIONS ile genişletildi (üç yüzeyde: personel sayfası, personel API, admin portal
> yolu = 6 vektör) ve izole provadaki (edge-allowlist-probe.js) **18 kodlama/normalizasyon varyantının tamamı** sondaya alındı. Ret 37→**59**,
> toplam istek 46→**68** (yöntem dağılımı §1a/§5). Öz-test sahte kenarı artık gerçek Caddy yol temizliğini (yüzde-çöz + `.`/`..`/`//`) modeller;
> öz-test **17/17** (S7, T-3 eklendi; eski sonda ile negatif kontrol 12/17). `layer` 403'te hâlâ `unknown` kuralı aynen korunur; "403 = kesin
> katman kanıtı değildir" değişmedi. HEAD yanıtı **gövdesizdir** → sağlayıcı imzası/`suspectAppOrigin403` HEAD'te okunamaz (ipucu `none`/şüpheye
> girmez), katman yine `unknown`. Canlı sonda yine **çalıştırılmadı**; pin değişti (§7).

## 1. D-8 makine sondası (`scripts/d8-staff-surface-probe.js`)

Owner PC'sinden, gerçek alan adı ve gerçek TLS ile (TLS doğrulaması kapalıysa reddeder). **Bir süreç = bir ad = bir kanıt:** sonda tek
`--origin https://<public host>` ve zorunlu bir ad kimliği `--alias AD-<n>` alır (AD-1 = birincil ad); ad kimliği yoksa ya da biçime
uymuyorsa, ya da bir parametre yinelenmişse sonda koşmaz (kapı, çıkış 4). Çok adlı döngü ya da ikinci origin parametresi **yoktur**.
Sonda başka bir adın kanıtını okumaz ve var olan bir kanıt ya da özet dosyasının üzerine yazmaz (kapı, çıkış 4). Okuduğu dosyalar:
kendi kaynağı (SHA-256 için) ve — yalnız AD-1 dışındaki adlarda — kapsam yetkisi kaydı ile o kaydın gösterdiği kanıt dosyaları
(yalnız SHA-256 için; içerik yorumlanmaz, hiçbir yere yazılmaz). `--vantage <etiket>` owner'ın **beyan ettiği** koşum konumudur
(ölçüm değildir).

**Kapsam yetkisi kapısı (owner kararı, §3b-K6).** Birincil ad (AD-1) dışındaki her ad kimliği için sonda, kısıtlı bir **kapsam
yetkisi kaydı** (`--scope-record <dosya>`) olmadan **koşmaz**: istek atılmaz, çıkış 4, ileti tam olarak
`KOŞULMADI — kapsam yetkisi doğrulanmadı` (ikinci satırda ad / yol / özet değeri içermeyen bir neden sınıfı). Kayıt (JSON; alan
adları sondanın başlık yorumundadır) en az şunları bağlar ve sonda bunları **ölçer** — yalnız "alan dolu mu" diye bakmaz:

| Bağ | Sondanın ölçtüğü | Tutmazsa (neden sınıfı) |
|---|---|---|
| ad kimliği | kayıttaki ad kimliği = `--alias` | `AD-KIMLIGI-UYUSMUYOR` |
| ana makine | kayıttaki ana makine = `--origin` ana makinesi, **birebir** (büyük / küçük harf dışında; alt alan, önek, sondaki nokta, port ekli değer eşleşme değildir) | `ANA-MAKINE-UYUSMUYOR` |
| iki kanıt kalemi | **(i)** yetkili sağlayıcı hesabındaki bölge / özel ad kaydı **ve** **(ii)** DNS zinciri — ikisi de var; tünel kaydı türü tanınır ama zorunlu kalemin yerine **geçmez** | `KALEM-EKSIK` · yalnız tünel kaydı sunulmuşsa `YALNIZ-TUNEL-KAYDI` |
| her kalem: dosya + SHA-256 + tarih | kanıt dosyası var, boş değil, SHA-256'sı kayıttakiyle aynı; tarih geçerli ve gelecekte değil; listelenen **her** kalem (ek tünel kalemi dahil) ölçülür | `KANIT-DOSYASI-YOK` · `KANIT-DOSYASI-BOS` · `OZET-TUTMUYOR` · `KALEM-BICIMI-GECERSIZ` |
| iki ayrı kanıt | iki zorunlu kalem aynı dosyayı ya da aynı içeriği göstermiyor | `AYNI-KANIT-IKI-KALEMDE` |

Kayıt ve kanıt dosyaları **kısıtlıdır** (depoya girmez): ham kanıta ve adsız özete yalnız **durum + kalem türleri** yazılır; ad, yol,
özet değeri ve tarih yazılmaz. Sonda kanıtın **içeriğini yorumlamaz** — sahipliği kendisi doğrulamaz; içeriğin yeterliliği kayıt
sahibinin incelemesidir. AD-1 için kapı yoktur ve `--scope-record` verilmez (verilirse sonda durur; kayıt sessizce yok sayılmaz):
birincil adı owner bloğu canlı yapılandırmadan okur (§1d). Kapı telefon listesi çağrısında da geçerlidir. **Sınır (ölçülemez):**
sonda, AD-1 ad kimliğiyle koşulan adın gerçekten birincil ad olduğunu ölçemez; bu bağ yalnız owner bloğundadır (blok adı canlı
yapılandırmadan okur ve yalnız AD-1 için yazılmıştır). Başka ad için owner bloğu **yazılmamıştır** (kapsam ve ad başına GO ayrıca —
§3b).

**59 ret vektörü** (personel sayfaları `/`, `/auth/login`, `/dashboard`, `/auth/reset-password`; personel API `/api/auth/me`,
`POST /api/auth/login`, `POST /api/auth/register`, `GET /api/auth/capabilities`, `/api/cases`, `/api/users`, `/api/health`;
`/api/portal/admin/*` düz/kök/`%2F`-önek/sorgu varyantları; intake DELETE/PUT/PATCH; izinli yollarda yanlış yöntem;
`/api`, `/api/`, `/robots.txt`; **D8-E1: HEAD ve OPTIONS üç yüzeyde — personel sayfası `/`, personel API `/api/auth/me`, admin
`/api/portal/admin/documents/pending`**; **D8-E2: izole provadan (edge-allowlist-probe.js) taşınan 18 kodlama/normalizasyon
varyantı — yüzde-kodlama, kodlanmış/düz traversal, çift slash, nokta segmenti, büyük harf, sondaki slash, noktalı virgül,
boş bayt, çift kodlama, geçersiz unicode**) → hepsinde **403** beklenir. `POST /api/auth/account-recovery/find-tenants` sondada YOKTUR
(login ile aynı hız sınırı sayacını paylaşır; yan etkiyi artırmamak için).
**9 pozitif** (izinli çiftler; yazma yok): sayfalar 200; `cases/documents/messages` GET, `POST messages`,
`DELETE documents/:id`, `POST change-password` token olmadan **401**. **Toplam 68 istek.** Vektör listesi R04 ile aynıdır.

**Kimlik bilgisi gönderilmez; yazma verisi gönderilmez.** Ret listesinde POST/PUT/PATCH/DELETE istekleri VARDIR — POST/PUT/PATCH
gövdesi boş JSON `{}`, **DELETE gövdesiz** (yalnız `content-type: application/json` başlığı); hiçbir istekte authorization/cookie/
x-api-key başlığı yoktur. `POST /api/auth/login` boş gövdeyle ret listesindedir: kimlik bilgisi gönderilmez; **uygulama bu isteği
yine de giriş sayacına +1 yazar** (`LoginRateLimitGuard` DTO doğrulamasından önce, IP bazlı 10/dk pencere; kendi semantiğinde
başarısız giriş denemesi sayar) — istek uygulamaya ulaşmadığı sürece bu olmaz. forgot-password/reset-password çağrılmaz (e-posta),
intake POST ve belge yükleme yapılmaz. Sonda yönlendirme izlemez, tekrar denemez. Kanıt dosyasında iki AYRI alan vardır: `design {
credentialsSent:false, writesAttempted:false }` betik **tasarım beyanıdır** (ölçüm değil); `measured { requestCount,
credentialHeaderRequests, nonEmptyBodyRequests, bodies {empty, emptyJson} }` istek döngüsünden **türetilir** (her satırda gönderilen
başlık adları, gövde ve gönderilen istek kimliği `sent` alanındadır). Her ret satırında `ifPassed` (kenar geçirirse olası sonuç) yer alır.

**R05'te istek profilinde değişen tek şey:** her istekte tek kullanımlık bir `x-request-id` başlığı (kimlik bilgisi değildir; her
istekte yeni değer). Başlık iki **biçimden** birini taşır (§1.1 "istek kimliği protokolü"): API'nin kabul ettiği biçim ya da kabul
**etmediği** biçim (kabul desenindeki karakter kümesinde olmayan tek bir karakter içerir). Ret vektörlerinin **hepsi** kabul edilmeyen
biçimi taşır; pozitiflerin yarısı kabul edilen biçimi taşır. İstek uygulamaya ulaşırsa: kabul edilen biçimdeki değer o isteğin
kimliği olur (uygulama o istekte 5xx üretirse değer uygulamanın hata kaydına yazılır); kabul edilmeyen biçimdeki değer uygulamada
**atılır** (kimlik olarak kullanılmaz; uygulama kendi kimliğini üretir). Sondanın vektör listesindeki uçlarda başka bir etkisi
kaynakta görülmedi (başlığı ayrıca okuyan üç yer aynı iç modüldedir — yinelenme anahtarı, bağlam ve iz kimliği; hiçbiri genel kayıtlı
değildir ve sondanın listesinde o modülün ucu yoktur; bütün istek başlıklarını günlüğe yazan bir satır kaynak taramasında bulunmadı —
ana dal tabanında okundu, canlı sürümde ayrıca ölçülmedi). Bu istek profili, canlı sonda GO'su verilirken **ayrıca onaylanacak**
kapsam kalemidir (§3b, açık kalan karar); GO verilmemiştir.

**Ham request-target korunur:** istek `https.request({host, port, path, method, servername})` ile atılır; `path` vektördeki ham
dizedir (`/api/portal/./admin/...`, `%2F`, `?x=1` normalize edilmez). Öz-test S1-p bunu kenarın gördüğü `req.url` ile birebir
doğrular; URL-string ile istek atan kopya bu testte düşer.

### 1.1 Üç ayrı alan + pozitif kontrol; API'ye özgü kanıt

Aynı durum kodunu birden çok katman üretebilir (403: kenar varsayılan reddi · sağlayıcı kuralı · sınama sayfası · uygulama; 404: tünel
varsayılanı · web · API; 5xx: zincir hatası · uygulama). Bu yüzden sonda, owner'ın 2026-10-05 kararlarıyla (§3b), ad düzeyinde **üç
ayrı alan** ve ayrı bir **pozitif kontrol** kaydı üretir (kanıtta `nameVerdict { httpReject, edgeBlocking, layerVerification,
positiveControl }`). Her biri yalnız `PASS` / `FAIL` / `OLCULEMEYEN` değerini alır; hiçbiri diğerinin yerine geçmez; ikisini birleştiren
tek bir "PASS" ya da "D-8 PASS" **üretilmez**. Her alanın nedenleri (`reasons`) ayrı ayrı yazılır. Hiçbir belirsiz durum PASS'a
düşmez: bir alanın PASS koşulu birebir sağlanmıyorsa değeri `OLCULEMEYEN`'dir.

**(a) HTTP / ret sonucu** (`httpReject`) — yalnız **durum kodu ölçütü**, yalnız ret vektörleri; yanıtı hangi katmanın ürettiği bu
alana girmez:

| Değer | Koşul |
|---|---|
| `PASS` | bütün ret vektörleri 403 (sınama işaretli 403 de durum kodu olarak 403'tür; kenar hükmü (b)'dedir — §3b-K3) |
| `FAIL` | en az bir ret vektörüne **doğrulanmış** başka bir HTTP yanıtı geldi — hangi kod olursa olsun: 2xx · 3xx · 403 dışı 4xx · 429 · 5xx · sınıflanamayan kod (§3b-K5) |
| `OLCULEMEYEN` | FAIL yok ama **yanıt alınamayan** ret vektörü var (taşıma hatası). FAIL ile tek etikette birleşmez |

**(b) Kenar engelleme sonucu** (`edgeBlocking`):

| Değer | Koşul |
|---|---|
| `FAIL` | engellenmesi gereken bir isteğin **API'ye ulaştığı** API'ye özgü kanıtla gösterildi — API'nin o isteğe **403 vermesi bunu kapatmaz** (§3b-K1) · **ya da** ret vektörü hiç reddedilmedi (2xx; API kanıtı aranmaz) |
| `OLCULEMEYEN` | FAIL yok ve şunlardan en az biri var: kalibrasyon `YOK` / `GECERSIZ` (§3b-K2) · sınama (challenge) ya da tanınmayan azaltım işaretli 403 — durum kodu eşleşir ama hedeflenen erişim kuralının uygulandığını **kanıtlamaz** (§3b-K3) · ret-403 dışındaki bir yanıtta azaltım işareti · pozitifler beklendiği gibi değil (tekdüze 403 dahil) · yanıt alınamayan vektör · durum kodu ölçütü PASS değil ama API'ye ulaşma kanıtı da yok · ret yanıtında katmanı belirlenemeyen kimlik başlığı (yansıma / yabancı kimlik) |
| `PASS` | bunların **hiçbiri** yok. Kayıt eki zorunludur (kanıtta `scope`): "yalnız bu istek profili, bu konum, bu vektör kümesi için" + varsayımlar. PASS şu demektir: bütün ret vektörleri azaltım işareti taşımayan 403 aldı, izinli yollar beklendiği gibi yanıtlandı, kalibrasyon geçerliydi ve engellenmesi gereken hiçbir isteğin API'ye ulaştığına dair kanıt görülmedi. PASS **"reddi kenar üretti" kanıtı değildir**; reddeden katman (c)'dedir |

Kalibrasyon eksikliği somut olumsuz kanıtı **silmez**: kalibrasyon eksikken ya da yansıtan bir katman görülmüşken de API'ye özgü
kanıt FAIL verir; sınama işaretli yanıtların yanında başka bir satırda API kanıtı varsa FAIL korunur. Kalibrasyon eksikken "kapalı"
(PASS) hükmü **verilmez**.

**(c) Katman doğrulaması** (`layerVerification`) — kanıtın desteklemediği katman kesinliği **reddedilir**:

| Değer | Koşul |
|---|---|
| `FAIL` | bir ret satırını API'nin yanıtladığı kanıtlı |
| `PASS` | **yalnız** bütün ret satırlarında yanıtlayan katmanın API **olmadığı** gösterilebiliyorsa. Bu yöntemle doğrulanamayan satır (ön uçuş · yolu belirsiz · web yolu) varken PASS **yazılmaz** — bugünkü vektör kümesi böyle satırlar içerdiğinden bu değer bugün **üretilemez** |
| `OLCULEMEYEN` | diğer her durum; kapsam sayısıyla birlikte (kanıtta `coverage`: kaç ret satırında "API değil" gösterildi · kaç satır API kanıtlı · kaç satır ölçülemez ve neden sınıfı) |

Kenar, tünel ya da sağlayıcı bu sondayla **hiçbir koşulda adlandırılamaz**; sonda adlandırmaz. Sağlıklı koşumda, bu vektör kümesiyle
(öz-testte ölçüldü): 59 ret satırının **30**'unda "API değil" **çıkarımı** yapılır; **29**'unda katman ölçülemez — 13 web yolu (web
uygulamasının ürettiği bir 403 kenar reddinden bu yöntemle ayırt edilemez), 2 API önekli ön uçuş, 14 yolu belirsiz satır.

**Pozitif kontrol** (`positiveControl`) — API'ye geçmesine **izin verilen** yollar; (a)–(c) kurallarına **karıştırılmaz** (§3b-K1):
`PASS` dokuz pozitifin hepsi beklenen kodu verdi · `FAIL` beklenmeyen ve 403 olmayan yanıt (ör. token'sız 200; web pozitifinde 3xx /
404) = bulgu · `OLCULEMEYEN` pozitif reddedildi (403; tek bir pozitif de olsa) / yanıtsız / API'den geldiği kanıtsız 5xx · 429 ·
sınıflanamayan kod.

**Çıkış kodu** dört alandan türer (sondada tek işlev). Eşleme — sondanın kanıta yazdığı metinle aynen:
`herhangi bir alan FAIL → 2 · FAIL yok ve kenar engelleme PASS → 0 · diğer her durum → 3 · kapı → 4 · kanıt yazılamadı → 7 · beklenmeyen durma → 1`.
"Herhangi bir alan" pozitif kontrolü de kapsar. FAIL ölçülemeyenin önündedir (aynı koşumda taşıma hatası olsa da FAIL çıkış 2 verir;
ölçülemeyen nedenler kayıtta kalır). Kapı (4) = istek atılmaz: kapsam yetkisi doğrulanmadı · origin https değil ya da içinde kimlik /
sorgu / parça var · TLS doğrulaması kapalı · ad kimliği / konum etiketi yok ya da geçersiz · parametre yinelenmiş · `--out` yok ·
`--phone-list` ile `--out` birlikte · kanıt ya da özet dosyası zaten var · konum etiketi ana makine adını ya da bir etiketini içeriyor ·
`D8_HTTP_TIMEOUT_MS` geçersiz · istek kimliği planı tutarsız. 7 = ölçüm yapıldı ama kanıt / özet yazılamadı (ham kanıtı olmayan özet
kanıt sayılmaz). 1 = sonda beklenmeyen biçimde durdu — **ölçülemeyen** sayılır. Tanınmayan bir alan değeri hiçbir koşulda 0 vermez.
**Çıkış 5 kalkmıştır.** Çıkış 0 "D-8 kapandı" demek **değildir** (§3).

**Satır düzeyi.** `outcome` (durum kodu sınıfı): `RET-403` · `SINAMA-ISARETLI-403` · `TANINMAYAN-AZALTIM-ISARETLI-403` ·
`DORTYUZ-403-DISI` · `HIZ-SINIRI-429` · `REDDEDILMEDI-2XX` · `YONLENDIRME-3XX` · `SUNUCU-HATASI-5XX` · `SONUC-YOK` (taşıma hatası;
yalnız hata **sınıfı** `errorClass`: `AD-COZULMEDI` / `BAGLANTI` / `TLS` / `ZAMAN-ASIMI` / `DIGER`) · `SINIFLANAMADI`. Hata iletisi
metni ve yönlendirme hedefi kanıta yazılmaz. **Azaltım işareti** (sağlayıcının bir yanıt başlığı; satırda `mitigationMark`: `YOK` /
`SINAMA` / `TANINMAYAN` — başlığın değeri kanıta yazılmaz): tanınan sınama (challenge) değeri, virgül / boşlukla ayrılmış listenin
**ögesi** olarak ve harf duyarsız aranır (iki ayrı başlık satırı tek listedir); başlık var ama değeri tanınmıyorsa (boş değer dahil)
`TANINMAYAN`. Sınama yanıtı bir ret **kararı** değildir — "tarayıcı olduğunu göster" yanıtıdır; ziyaretçi sınamayı geçerse asıl
istek hedefe gider (sağlayıcı belgesi 2026-10-05'te önceki turda okundu, bu turda yeniden okunmadı: işaret her sınama sayfası türünde
bulunur; sınama yanıtının durum kodu o belgede yazmıyor — **ölçülmedi**). İşaret yalnız kenar engelleme hükmünü **düşürür** (var olan hiçbir işaret PASS'a düşmez); durum
kodu ölçütünü ve bir bulguyu değiştirmez (işaretli 2xx yine reddedilmemiştir); katmana girmez. Yalnız bilinen başlık okunur:
işaretsiz bir sınama yanıtı bu sondayla ayırt edilemez (kenar engelleme PASS kaydının eki bu sınırı da taşır).

**API'ye özgü kanıt — istek kimliği protokolü.** Önceki kural "gönderdiğim kimlik aynen döndüyse yanıtı API üretmiştir" diyordu;
isteğin başlığını yanıta **yansıtan sıradan bir aracı katman** da aynı gözlemi üretir. Ürün kaynağı
(`apps/api/src/common/request-id.middleware.ts`): API, gelen `x-request-id` değeri kabul ettiği biçimdeyse yanıta **aynen** geri
yazar; kabul **etmediği** biçimdeyse değeri **atar ve yeni bir kimlik üretir** (`randomUUID()`). Yansıtan bir katman birinci
davranışı taklit eder; ikincisini üretemez. Kural buna göre kuruludur:

| Konu | Kural |
|---|---|
| Gönderilen biçim (`sent.requestIdForm`; her istekte tek kullanımlık değer) | ret vektörlerinin **hepsi** → `GECERSIZ-BICIM` (API'nin kabul etmediği biçim) · API pozitifleri sınıf içi sırayla `GECERLI-BICIM`, `GECERSIZ-BICIM`, … (bugün 3 + 3) · web pozitifleri sınıf içi sırayla aynı dönüşüm (bugün 2 + 1). Sonda başlarken iki biçimin gerçekten ayrıştığını denetler; ayrışmıyorsa istek atmaz (çıkış 4) |
| Gözlem (`idObs`) | `YOK` · `AYNEN` (gönderilen değer geri döndü) · `YENI-KIMLIK` (farklı değer, API'nin ürettiği biçimde) · `BASKA-DEGER` · `SONUC-YOK`. Yanıt başlığının **değeri** kanıta yazılmaz |
| Anlam (`idSignal` = gözlem × gönderilen biçim) | `DEGISTIRME`: geçersiz biçim gönderildi, yeni kimlik döndü — API'nin ikinci davranışı; yansıtan katman bunu **üretemez** · `AYNEN-GERI-YAZMA`: geçerli biçim gönderildi, aynen döndü — API'nin birinci davranışı; yansıtan katman da üretir (**tek başına API kanıtı değildir**; yalnız kalibrasyon girdisidir) · `YANSIMA`: geçersiz biçim gönderildi, **aynen** döndü — API bunu üretemez: **yansıtan katman göstergesi** (API kanıtı sayılmaz) · `YABANCI-KIMLIK`: API'nin üretemeyeceği başka her değer (geçerli biçim gönderildi ama farklı değer döndü · geçersiz biçim gönderildi ama API biçiminde olmayan değer döndü) — kendi kimliğini **damgalayan** ya da başlığı **ezen** katman göstergesi |
| Başlıksız bölge | API'nin kimlik başlığı yazamayacağı yanıtlar (kaynak okuması): API öneki **dışındaki** yollar (web pozitifleri dahil) ve **ön uçuş** (OPTIONS — ara katmandan önce biter). Bu bölgede görülen **her** kimlik başlığı yabancı bir katmanındır |
| Kalibrasyon (aynı ad, aynı koşum; `calibration.result`) | `GECERSIZ`: yansıma göstergesi (başlıksız bölgede aynı değer · herhangi bir satırda `YANSIMA`) **ya da** yabancı kimlik göstergesi (başlıksız bölgede başka değer · herhangi bir satırda `YABANCI-KIMLIK`) var · `VAR`: gösterge yok **ve** API pozitiflerinde **iki davranış da tam** (geçerli biçim gönderilenlerin tamamında aynen geri yazma, geçersiz biçim gönderilenlerin tamamında değiştirme; her birinden en az bir tane) **ve** web pozitiflerinin tamamı ölçülmüş **ve** başlıksız bölgede ölçülen en az bir yanıt var · `YOK`: diğer her durum (kısmi kalibrasyon dahil) |
| API kanıtı (`layerId` = `UYGULAMA-API`) | `DEGISTIRME` **ve** satır başlıksız bölgede değil **ve** API kanıtı kullanılabilir (`calibration.apiEvidenceUsable`: koşumda **hiç** yabancı kimlik göstergesi yok **ve** başlıksız bölgede ölçülen en az bir yanıt var — damgalayan katmanın arandığı yer). Kalibrasyonun `VAR` olması **şart değildir**: eksik kalibrasyon ve yansıtan katman "yeni kimlik" gözlemini açıklayamaz; damgalayan katman açıklar ve o görülmüşse kanıt **kullanılmaz** |
| "API değil" (`layerId` = `API-DEGIL-CIKARIM`) | yalnız bir **çıkarımdır**: kalibrasyon `VAR` + yanıtta başlık yok + ön uçuş değil + yol `API-KESIN`. Hangi üst katmanın yanıtladığı her durumda ölçülemez |
| Diğer her durum | `OLCULEMEYEN` + neden sınıfı (`layerWhy`): `WEB-YOLU` · `ON-UCUS` · `YOL-BELIRSIZ` · `KALIBRASYON-YOK` / `-GECERSIZ` · `YANSIMA` · `YABANCI-KIMLIK` · `AYIRT-ETMEYEN-GOZLEM` · `KANIT-KULLANILAMAZ` |

`Server` başlığı, gövde imzası, boş / dolu gövde **ipucudur** (`hints`, `layerHint`, `hintsOnly`; yalnız kısıtlı ham kanıtta) ve hiçbir
alana girmez. **Yol sınıfı (`pathClass`):** `API-KESIN` = ham yol tam `/api` önekli ve normalleştirilecek bir yanı yok (yüzde dizisi,
nokta segmenti, çift eğik çizgi, noktalı virgül, büyük harfli önek içermez; sorgu ve sondaki tek eğik çizgi etkilemez) — API bu
isteği işleseydi istek kimliği ara katmanı kesin çalışırdı. `API-BELIRSIZ` = ham ya da çözülmüş / sadeleştirilmiş biçimi API önekine
düşen diğer her yol; çıkarım yapılmaz (örnekler: çift eğik çizgili yol API'de önek dışına düşer; çözülemeyen yüzde dizisinde ara
katman çalışmaz; ikisinde de API yanıtı başlıksız olur). `ONEK-DISI` = web yolu.

**Gözlem → alanlara etkisi** (ret vektörleri; öz-test kalemi son sütunda):

| # | Gözlem | HTTP / ret | Kenar engelleme | Katman | Öz-test |
|---|---|---|---|---|---|
| 1 | bütün ret vektörleri işaretsiz 403, kimlik başlığı yok; pozitifler beklendiği gibi; kalibrasyon `VAR` | PASS | PASS (kayıt ekiyle) | OLCULEMEYEN (kapsam sayısı) | S1 |
| 2 | 403, API'nin "değiştirme" kanıtıyla (gösterge yok) | PASS (kod 403) | **FAIL** — API'nin 403'ü kapatmaz | **FAIL** | A-1, A-2 |
| 3 | 403 dışı yanıt (3xx / 4xx / 429 / 5xx), API kanıtlı | **FAIL** | **FAIL** | **FAIL** | S2, L-2, L-2b, L-9 |
| 4 | 403 dışı yanıt, API kanıtı yok | **FAIL** | OLCULEMEYEN | OLCULEMEYEN | L-3 … L-8 |
| 5 | 2xx (OPTIONS 204 dahil) | **FAIL** | **FAIL** | kanıta göre | S2, U-3 |
| 6 | yanıt alınamayan ret vektörü | OLCULEMEYEN (FAIL yoksa) | OLCULEMEYEN | OLCULEMEYEN | H-1, S4 |
| 7 | 403, sınama ya da tanınmayan azaltım işaretli | PASS (kod 403) | OLCULEMEYEN | işaret katmana girmez | S3-ch, S3-az |
| 8 | 7 + başka bir satırda API kanıtı | PASS | **FAIL** korunur | **FAIL** | A-4 |
| 9 | 403, gönderilen (geçersiz biçimli) değer **aynen** döndü — yansıma | PASS | OLCULEMEYEN (API kanıtı **değil**) | OLCULEMEYEN | R-1, R-2 |
| 10 | 403, API biçiminde "yeni kimlik" ama koşumda damga göstergesi var | PASS | OLCULEMEYEN (kanıt kullanılmaz) | OLCULEMEYEN | M-1, M-3 |
| 11 | kalibrasyon `YOK` / `GECERSIZ`, API kanıtı yok | koda göre | OLCULEMEYEN — "kapalı" verilmez | OLCULEMEYEN ("API değil" çıkarımı yapılmaz) | K-5, E-1, R-3 |
| 12 | kalibrasyon `YOK` ya da yansıtan katman görülmüş, **API kanıtı var** | koda göre | **FAIL** — eksik kalibrasyon kanıtı silmez | **FAIL** | A-3 |
| 13 | bütün istekler 403 (pozitifler dahil) | PASS | OLCULEMEYEN (tekdüze ret) | OLCULEMEYEN | U-1 |
| 14 | sunulmayan ad: bütün istekler aynı 404 / 3xx / 401 | **FAIL** | OLCULEMEYEN | OLCULEMEYEN | U-2 |

**Ölçülemeyen iki sınır** (öz-testte SINIR-1 / SINIR-2 kalemleriyle **kayıtlıdır**; güvence değildir):
- **PASS yönünde — varsayım** (kenar engelleme PASS kaydının ekinde yazılıdır): API'nin ürettiği yanıtta kimlik başlığı zincirde
  düşürülmüyor. Kalibrasyon bunu yalnız pozitiflerin yanıtında gösterir; yalnız API'nin **ret** yanıtından başlığı silen bir katman
  varsa API'ye ulaşan bir istek "API değil" görünür ve kenar engelleme PASS çıkar. Kaynakta ve şablonda başlığı silen satır yok —
  okundu; canlı zincir ölçülmedi.
- **FAIL yönünde:** yalnız API önekli ve ön uçuş olmayan **ret** yanıtlarına, API'nin ürettiği biçimde kendi kimliğini yazan ve başka
  hiçbir yanıtta görünmeyen bir katman API'den ayırt edilemez — o yanıtlar API kanıtı sayılır (FAIL / bulgu adayı; kısıtlı kayıtta
  incelenir). Aynı yerde API biçiminde **olmayan** bir değer yabancı kimlik sayılır (OLCULEMEYEN).

**Bu protokol KAYNAK OKUMASIDIR; gerçek API ile izole provasını çağıran koşacak — bu pakette YAPILMADI.** Dayanak:
`apps/api/src/common/request-id.middleware.ts` (başlık adı, kabul edilen biçim, kabul edilen değer aynen yanıta yazılır, edilmeyenin
yerine `randomUUID()`), `app.module.ts` (ara katman `forRoutes('*')`), `main.ts` (genel önek `api`, `enableCors`); kilit dosyasındaki
Nest 10.4.20 / Express 4 sürümlerinin ara katmanı `/api` ve `/api/*` için kaydetmesi. Canlı sürümün (R27, `1b758d29`) kaynağında
ara katman dosyası ana dal ile bayt bayt aynıdır (blob eşitliği bu turda yeniden ölçüldü); `main.ts` yalnız ters vekil ayarının yazım
biçiminde farklıdır (önek ve CORS aynı; önceki turun ölçümü). Kenar şablonları R27 kaynak ağacında yoktur (yalnız ana dalda, "canlıya
uygulanmadı" notuyla). Öz-testteki sahte API bu kaynak okumasının **modelidir**, gerçek API değildir. Önceki turda yapılan çerçeve
düzeyi ölçüm (2026-10-05; depo dışı kayıt; kurulu Nest 10.4.20 + Express 4.21.2 ve ürünün ara katman kaynağıyla kurulan küçük bir
uygulamaya 68 vektör; ölçülen: düz `/api` yolları ve HEAD → başlık var; OPTIONS → 204, yok; çift eğik çizgi → 404, yok; çözülemeyen
yüzde dizisi → 400, yok; önek dışı → yok; uygulamanın ürettiği 403 / 503 → var; biçime uymayan kimlik → farklı değer) bu turda
**yinelenmedi**; yeni protokolün dayandığı "kabul edilmeyen biçim → yeni kimlik" davranışı o ölçümde yalnız tek gözlemle yer alır.
İzole prova, sıradan yansıyan girdi ile API'ye ulaşmayı **gerçekten ayırt eden** kanıtı sınamalı ve kanıtın desteklemediği katman
kesinliğini reddetmelidir; ölçülecek ayırt edici girdiler: (i) gerçek API'nin pozitif yanıtlarında iki davranış (aynen geri yazma ·
değiştirme) ve üretilen kimliğin biçimi; (ii) gerçek API'nin **ret** yanıtlarında (401 / 403 / 404 / 400 / 429 / 5xx; HEAD dahil)
başlığın bulunması — PASS yönündeki varsayım; (iii) gerçek API'nin ön uçuş, çift eğik çizgi ve çözülemeyen yüzde dizisi yanıtlarında
başlığın **bulunmaması**; (iv) gerçek web uygulamasının hiçbir yanıtında bu başlığın bulunmaması (bulunursa canlıda kalibrasyon hep
`GECERSIZ` çıkar); (v) şablon kenarın kabul edilmeyen biçimdeki istek başlığını değiştirmeden iletmesi ve kendi ret yanıtlarına
başlık yazmaması; (vi) araya konan yansıtan katmanla (yalnız API önekli retlerde · her yerde) API kanıtının **oluşmaması**; (vii)
araya konan damgalayan / ezen katmanla kanıtın kullanılmaması. Prova sonucu PR açıklamasına ve sonra bu bölüme işlenir; o zamana kadar
yukarıdaki kurallar ölçüm değil kaynak okumasıdır. Canlı zincirin başlığı değiştirmeden geçirdiği ancak koşumun kendi kalibrasyonuyla
görülür.

**"Kimliksiz istekte uygulama 403 üretmez" bir genelleme değildir.** Bu, yalnız sondanın vektör listesindeki uçlar için kaynak
okumasıdır (çalışma zamanında ölçülmedi); uygulamanın başka uçları kimlik kontrolünden önce 403 üretebilir. Uygulamanın ürettiği 403
bu yüzden varsayımla değil kimlik kanıtıyla sınıflanır (tablo satırı 2).

**Adsız özet.** Sonda ham kanıtın (`<kanıt>.json`; ana makine adını içerir, **kısıtlı**, depoya girmez) yanına ad içermeyen ayrı bir
özet yazar (`<kanıt>.ozet.json`): ad kimliği, revizyon, sondanın kendi SHA-256'sı, vektör kümesi kimliği, kapsam yetkisi durumu
(yalnız durum + kalem türleri), yöntem kapsamı sayıları, durum sınıfı / hata sınıfı / kimlik anlamı / katman kimliği sayıları,
kalibrasyon, dört alan ve nedenleri (yalnız değer + neden + sayı), katman kapsam sayısı, çıkış kodu eşlemesi, zaman, çıkış kodu, beyan
edilen konum etiketi, gönderilen başlık **adları** ve biçim sayıları. İçermez: ad, hata metni, yönlendirme hedefi, yol düzeyinde bulgu,
ipuçları, gönderilen / dönen kimlik değerleri, kanıt dosyası yolu / özeti / tarihi. **Yöntem sınıfı düzeyinde sayı içerir** (HEAD /
OPTIONS / varyant kaç tanesi reddedildi) — bu yüzden **özet de kısıtlıdır** ve depoya konmaz. **Public satıra (§1b) bu özetten yalnız
dört alanın değeri ve ad kimliği aktarılır; hiçbir sayı, neden, yol / yöntem ayrıntısı ve hiçbir özet (SHA-256) değeri public belgeye
yazılmaz — kenar engelleme PASS olan koşumda da** (§3b-K4). **Ad denetiminin ölçülen kapsamı:** (a) istek atılmadan — owner'ın
verdiği konum etiketi ana makine adının tam dizgisini ya da nokta ile ayrılmış bir **etiketini** (harf / rakam dışı karakterler
atıldıktan sonra en az 3 karakter; noktası tireye çevrilmiş türev dahil) içeriyorsa sonda koşmaz (çıkış 4); (b) özet yazılmadan — özet
metninde adın **tam dizgisi** geçiyorsa özet yazılmaz (çıkış 7). (b) parça yakalamaz; adın parçası yalnız (a)'da ve yalnız owner
etiketinde aranır.
**Vektör kümesi kimliği** (`vectorSetId`) vektör listesinden türetilir (sırayla "grup yöntem hamYol beklenenKodlar" satırlarının
SHA-256'sı): adlar arasında aynı listenin koşulduğunu gösterir (bu revizyonun değeri §7; vektörler değişmediği için değer önceki
turlarla aynıdır — istek kimliği biçimi bu kimliğe girmez, sondanın pinine girer).

### 1a. İstek listesi — beklenen sonuç ve kenar geçirirse olası yan etki

Beklenen: her ret vektörü **403**. Aşağıdaki "kenar geçirirse" sütunu R27 kaynağından (`apps/api/src/modules/auth`,
`modules/portal`, `main.ts` global prefix `api`) türetilmiştir ve uygulamanın ne yapacağını anlatır; gözlemin **nasıl sınıflanacağı**
§1.1 tablosundadır (ör. API'nin "değiştirme" kanıtlı 401 / 404 / 400 / 403 yanıtı ve her 2xx → kenar engelleme FAIL; web'in kanıtsız
404 / 405 yanıtı → durum kodu ölçütü FAIL, kenar engelleme ÖLÇÜLEMEYEN).

| Vektör grubu | Yöntem / gövde | Beklenen | Kenar geçirirse (uygulama) |
|---|---|---|---|
| Personel sayfaları `/`, `/auth/login`, `/dashboard`, `/auth/reset-password` | GET | 403 | Next sayfa 200/302; yazma yok; personel yüzeyi dışarıya açık |
| `GET /api/auth/me`, `/api/cases`, `/api/users` | GET | 403 | personel `JwtAuthGuard` → 401 (token yok); yazma yok |
| **`POST /api/auth/login`** | POST, boş `{}` gövde, **kimlik bilgisi gönderilmez** | 403 | `LoginRateLimitGuard` DTO doğrulamasından **önce** çalışır → personel giriş hız sınırı sayacı (IP bazlı, 10/dk) **+1** (uygulama semantiğinde başarısız giriş denemesi sayılır), sonra DTO **400**. Tek istek blok üretmez; sayaç +1 = yan etki + bulgu |
| `POST /api/auth/register` | POST, boş `{}` gövde | 403 | guard yok; `ValidationPipe` (whitelist) `{}` → **400**; yazma yok; personel API dışarıya açık = bulgu |
| `GET /api/auth/capabilities` | GET | 403 | guard yok → 200 (statik bayrak); yazma yok; personel API dışarıya açık = bulgu |
| `GET /api/health` | GET | 403 | R27'de kök `health` ucu yok → 404 |
| `/api/portal/admin/*` düz (create-user/disable-user POST boş gövde; documents/pending, messages/clients GET) | GET / POST `{}` | 403 | `JwtAuthGuard` → 401 (token yok); yazma yok |
| admin varyantları (`/api/portal/admin` kök, `%2Fadmin`-önek, `?x=1` sorgu) | GET | 403 | normalizasyona göre admin rotası (401) veya 404; yazma yok |
| **D8-E1 HEAD** üç yüzeyde: `/` (sayfa), `/api/auth/me` (personel API), `/api/portal/admin/documents/pending` (admin) | HEAD (gövdesiz) | 403 | kenar izin matcher'ı yöntem duyarlı → HEAD hiçbir kurala uymaz, varsayılan 403. Kenar geçirirse: sayfa → Next HEAD=GET başlıkları (gövde yok) 200/3xx; API/admin → Express HEAD'i GET işleyicisine yönlendirir → `JwtAuthGuard` 401 (token yok); DB/yazma/audit/giriş sayacı yok |
| **D8-E1 OPTIONS** üç yüzeyde: `/`, `/api/auth/me`, `/api/portal/admin/documents/pending` | OPTIONS (gövdesiz) | 403 | HEAD gibi matcher'a uymaz → 403. Kenar geçirirse: API/admin → Nest `enableCors` ön uçuşu yönlendirme/guard öncesinde **204** (Content-Length 0; istek Origin başlığı yok → ACAO yansıtılmaz; guard/rota/DTO/giriş sayacı çalışmaz; yazma/audit/hata kaydı yok); sayfa → Next 405/404 (çalışma zamanıyla doğrulanmadı) |
| **D8-E2** izole provadan 18 kodlama/normalizasyon varyantı (yüzde-kodlama, kodlanmış/düz traversal, çift slash, nokta segmenti, büyük harf, sondaki slash, noktalı virgül, boş bayt, çift kodlama, geçersiz unicode) — 16 GET + 1 POST `{}` + 1 DELETE | GET / POST `{}` / DELETE (gövdesiz) | 403 | kenar ham yolu **temizler** (yüzde-çöz + `.`/`..`/`//` sadeleştir) → izin listesini aşmaz: admin'e normalize olan `@deny` ile 403, diğeri varsayılan-ret 403. Kenar geçirir ve uygulama çözerse: admin → `JwtAuthGuard` 401 / rota yok → 404 / personel sayfası → 200; yazma yok |
| intake `DELETE /intake/:id` (web) | DELETE (gövdesiz) | 403 | Next sayfa rotasına yazma yöntemi → 404/405 (kaynak/çalışma zamanıyla ölçülmedi) |
| intake API DELETE/PUT/PATCH `/api/public/intake/:id` | DELETE (gövdesiz) / PUT `{}` / PATCH `{}` | 403 | rota yok → 404; yazma yok |
| izinli yolda yanlış yöntem: `GET /api/portal/login`, `POST /api/portal/cases`, `DELETE cases/:id`, `DELETE/PUT messages`, `PUT/POST documents/:id`, `GET change-password` | GET / POST-PUT `{}` / DELETE (gövdesiz) | 403 | rota yok → 404; yazma yok |
| web yazma: `POST /portal/profile`, `POST /portal/login` | POST `{}` | 403 | Next 404/405; yazma yok |
| `/robots.txt`, `/api`, `/api/` | GET | 403 | Next/Nest 404 |
| **Pozitifler** `GET /portal/login|forgot-password|reset-password` | GET | 200 | — (izinli) |
| **Pozitifler** `GET /api/portal/cases|documents|messages`, `POST messages {}`, `DELETE documents/:id`, `POST change-password {}` | token yok | 401 | — (`PortalAuthGuard` token yokken durur; yazma yok) |

### 1b. Ad başına satır tablosu (D8-E3)

Her ad **ayrı satırdır**; her satır yalnız o adın **kendi koşumundan** dolar. Bir adın sonucu başka bir ada taşınmaz; şablon ya da
izole ölçüm çıkarımları hiçbir satırın gerekçesi olamaz. Ortak ya da toplam bir hüküm satırı ve tek bir "D-8" hükmü **yoktur**. Adlar
public belgeye yazılmaz (yalnız ad kimliği); ad ↔ ad kimliği eşlemesi, ad sayısı ve sınıfı kısıtlı kayıttadır.

| Ad kimliği | Kapsam yetkisi | HTTP / ret sonucu | Kenar engelleme sonucu | Katman doğrulaması | Pozitif kontrol | Koşum (tarih · konum · sonda pini · vektör kümesi) | Dış ağ beyanı |
|---|---|---|---|---|---|---|---|
| **AD-1** (birincil ad) | birincil ad — kapı yok (ad canlı yapılandırmadan okunur) | KOŞULMADI — canlı sonda GO'su yok | KOŞULMADI — canlı sonda GO'su yok | KOŞULMADI — canlı sonda GO'su yok | KOŞULMADI — canlı sonda GO'su yok | — | bu revizyon için YOK (eski beyan R27 öncesidir; ada bağlanmadı) |
| diğer yayın adları | KOŞULMADI — kapsam yetkisi doğrulanmadı | KOŞULMADI — kapsam yetkisi doğrulanmadı | KOŞULMADI — kapsam yetkisi doğrulanmadı | KOŞULMADI — kapsam yetkisi doğrulanmadı | KOŞULMADI — kapsam yetkisi doğrulanmadı | — | — |

Doldurma kuralları:
- Dört sonuç hücresine **yalnız** şu değerlerden biri yazılır: `PASS` · `FAIL` · `OLCULEMEYEN` (adsız özetteki `nameVerdict` alan
  değeri, yorumlanmadan) ya da iki "KOŞULMADI" metninden biri. Kapsam yetkisi hücresi: AD-1 için yukarıdaki sabit metin; başka bir ad
  için `DOGRULANDI` (sondanın yazdığı durum) ya da `KOŞULMADI — kapsam yetkisi doğrulanmadı`.
- Public satıra **başka hiçbir şey yazılmaz**: sayılar (durum sınıfı, yöntem kapsamı, kalibrasyon, katman kapsamı, neden sayıları),
  nedenler, yol / yöntem / durum ayrıntısı, kanıt ve özet dosyalarının SHA-256 değerleri ve her türlü hassas kanıt **kısıtlı kayıtta**
  kalır — kenar engelleme `PASS` olan koşumda da. (Özet yöntem sınıfı düzeyinde sayı taşır ve sondanın vektör listesi public'tir;
  özet düşük entropili olduğundan SHA-256'sı da sayıların denenerek sınanmasına yarar.)
- "Koşum" hücresine yalnız tarih, beyan edilen konum etiketi, sonda pini ve vektör kümesi kimliği yazılır (§7 değerleriyle aynı
  olmalıdır; farklıysa satır bu revizyonun ölçümü sayılmaz). Elle yazılan konum etiketi adı ya da bir parçasını içeremez (sonda
  reddeder; §1.1 "ad denetiminin ölçülen kapsamı").
- Kapsam yetkisi doğrulanan her ad **kendi ad kimliğiyle ayrı satır** alır; doğrulanmayanlar için tek "diğer yayın adları" satırı
  kalır (ad sayısı yazılmaz). Sahipliği doğrulanmamış ad için sonda koşmaz; satıra yorum eklenmez.
- `OLCULEMEYEN` bir alan `PASS`'a çevrilmez; `FAIL` bir alanın ayrıntısı kısıtlı kayda alınır.

### 1c. Öz-test (`scripts/d8-selftest.js`)

Canlıya dokunmaz; yalnız node çekirdek modülleri + openssl + iki PowerShell kabuğu. **Model:** gerçek TLS'li sahte kenar (şablonun 4
izin regex'i + admin reddi; karar gerçek Caddy yol temizliği modeliyle; arka uca ham yolu iletir) **+ sahte API** — istek kimliği ara
katmanını ürün kaynağından çalışma anında okunan kurallarla **birebir** uygular: gelen kimlik kaynak desenince kabul ediliyorsa yanıta
aynen yazılır, edilmiyorsa atılır ve `randomUUID()` ile yenisi üretilir; ara katman yalnız Express'in `/api` ve `/api/*` için ürettiği
ifadelerle eşleşen ham yolda çalışır; OPTIONS ön uçuşu ve çözülemeyen yüzde dizisi başlıksızdır. **Aracı katman girdileri:** yansıtan
(isteğin kimliğini yanıta kopyalar), damgalayan (kendi kimliğini yazar — API'nin ürettiği biçimle aynı biçimde) ve ezen (API'nin
başlığını siler ya da üzerine yazar) katmanlar; her biri "yalnız şu yanıtlarda" ve "her yerde" biçimleriyle. Sahte uç her isteğe ne
yanıt verdiğini (üreten katman, durum, kimlik, işaret) kaydeder; kalemler sondanın sınıfını bu **zemin gerçeğiyle** karşılaştırır. Her
kalem **ayırt edici girdi → sondanın ölçtüğü alan** biçimindedir. Gönderilen kimlik biçimlerinin kaynaktaki desenle gerçekten kabul /
ret edildiği, kenarın gördüğü değerler ürün kaynağından okunan desenle sınanarak **ölçülür** (K-SRC, Y-1). Port `D8_SELFTEST_PORT` ile
değişir (varsayılan 8457; 8080 / 3002 / 5432 / 5447–5449 / 5591 / 18095 reddedilir); `D8_SELFTEST_PROBE` başka bir sonda dosyasını
sınar (negatif ayna / mutasyon). Çıkış: 0 hepsi PASS · 1 en az bir FAIL · 2 FAIL yok ama ölçülemeyen kalem var · 4 port kapısı.

Aşağıda alan sırası her yerde "HTTP / ret · kenar engelleme · katman doğrulaması · pozitif kontrol"dür (P = PASS · F = FAIL · O =
OLCULEMEYEN); parantez içindeki sayı sondanın çıkış kodudur.

| Kalem | Girdi → ölçülen alan |
|---|---|
| K-SRC · K-PORT | ürün kaynağındaki dayanaklar okunabildi; sondanın kabul deseni kaynaktaki metinle birebir, "üretilen kimlik" deseni `randomUUID()` çıktılarını tanır · öz-test port kapısı |
| S1 · K-1 · L-1 | sağlıklı kenar → P · P · O · P (0); üç alan + pozitif kontrol ayrı, birleşik PASS yok, kayıt eki var · kalibrasyon: API pozitiflerinde aynen geri yazma 3/3 **ve** değiştirme 3/3, başlıksız bölge temiz → `VAR` · "API değil" çıkarımı yalnız düz `/api` yolunda (30 satır); ön uçuş (2), yolu belirsiz (14), web yolu (13) → `OLCULEMEYEN` |
| S1-p · S1-c · Y-1 · Y-2 · S7 | ham yol birebir (68/68) · kimlik bilgisi başlığı yok, gövde 0 / 2 bayt · **istek kimliği planı**: 59 ret vektörünün hepsinde gönderilen değer kaynak deseniyle **kabul edilmez**, API pozitiflerinde 3 + 3, web pozitiflerinde 2 + 1; tek kullanımlık · plan kapısı: iki biçim ayrışmıyorsa (bozulmuş kopya) sonda istek atmaz (4) · 3 HEAD + 3 OPTIONS + 18 varyant |
| S2 · N-5 | bozuk kenar (AD-2, tam kapsam yetkisi kaydıyla) → F · F · F · P (2); 20 sızan istek: API'nin işlediği 17 yanıtta **değiştirme** kanıtı, 2 ön uçuş 204, 1 başlıksız 404 · AD-2 koşumu AD-1'in dosyalarını değiştirmez; sonda yalnız üç yerde dosya okur |
| S3 · S3-b · S3-c · S3-dN | sağlayıcı engelleme imzası · başlıksız boş 403 · sağlayıcı `Server` + boş gövde · gövdesi dolu ama kimlik başlıksız 403 → ipuçları değişir, dört alan ve katman kimliği S1 ile aynı |
| **S3-ch · S3-chF · S3-az · S3-azP** | sınama işaretli 403 (hepsinde / birkaçında) → P · **O** · O · P (3): durum kodu ölçütü PASS kalır, kenar engelleme PASS **değil** · işaretin altı yazımı tanınır · **tanınmayan** değerli işaret (beş değer; boş değer dahil) → aynı sonuç · işaret pozitifin beklenen yanıtında → kenar engelleme O (3); işaretli 2xx → bulgu kalır (2) |
| **A-1 · A-2 · A-3 · A-4** | **API'nin ürettiği 403** (geçersiz biçim → yeni kimlik) → P · **F** · **F** · P (2) — S3-dN ile aynı durum kodları · yalnız yolu belirsiz vektörde → yine API kanıtı · kalibrasyon `YOK` iken ve yansıtan katman görülmüşken API kanıtı → kenar engelleme yine F · sınama işaretli yanıtlar + başka satırda API kanıtı → F korunur |
| **R-1 · R-2 · R-3** | **yansıtan aracı** yalnız API önekli retlerde (ön uçuş hariç; başlıksız bölge temiz) → gönderilen değer aynen döner = `YANSIMA`, **API kanıtı yok**: P · O · O · P (3) · yansıtan her yerde (kenar + web; API başlığının üzerine de yazan) → API kanıtı yok · yansıma tek bölgede (ön uçuş · tek web ret · tek web pozitifi, iki biçimde) → kalibrasyon `GECERSIZ` |
| **M-1 · M-2 · M-3 · M-4** | **damgalayan aracı** bütün ret yanıtlarında (API biçiminde kimlik) → "yeni kimlik" gözlemi API kanıtı **sayılmaz**: P · O · O · P (3) · damga + gerçek sızıntı (API 401) → kanıt kullanılamaz, durum kodu ölçütü F (2) · damga tek bölgede (web ret · ön uçuş · bir web pozitifi + API'nin 403'ü) → kanıt kullanılamaz (3) · API biçiminde **olmayan** değer yalnız API önekli retlerde → yabancı kimlik (3) |
| **E-1 · E-2** | **ezen aracı** başlığı siler → kalibrasyon `YOK`, "kapalı" verilmez (3); sızıntıda API kanıtı yok ama durum kodu ölçütü F (2) · başlığın üzerine yazar / canlı API kaynaktaki gibi davranmıyor → kalibrasyon `GECERSIZ`, kanıt kullanılamaz (3) |
| **SINIR-1 · SINIR-2** | sondanın **ölçemediği** iki durumun kaydı (güvence değil; §1.1): yalnız API önekli retlere API biçiminde kimlik yazan katman → F sayılır (2) · yalnız API'nin 403 yanıtından başlığı silen katman → P · P görünür (0) |
| **K-5 · K-10 · Z-1** | kısmi kalibrasyon (5/6 · 1/6 · yalnız değiştirme · yalnız aynen geri yazma) → `YOK`, çıkarım yok (3) · bir web pozitifi ölçülemedi → `YOK` (3) · başlıksız bölge hiç ölçülemedi + API'nin 403'ü → kanıt kullanılamaz (3) |
| L-2 · L-2b · L-9 · L-3 · L-4 · L-5 · L-6 · L-8 · **H-1** | API kanıtlı 5xx / 429 / 3xx → F · F · F · P (2) · kanıtsız 5xx / 404 / yönlendirme (hedef kanıta yazılmaz) / 429 / sınıflanamayan kod (600) → **F** · O · O · P (2) · **yanıt alınamayan** tek ret vektörü → **O** · O · O · P (3) — doğrulanmış başka yanıtla tek etikette birleşmez |
| U-1 · **U-2** · **U-3** | tekdüze 403 → P · O · O · O (3) · sunulmayan ad (hepsi 404 / 301 / 401 / damgalı 404 / yansıtılmış 404 / 404 + taşıma hatası) → **F** · O · O · F (2) · kardeşler: hepsi 200 → F · F; yalnız pozitifler 404 → pozitif kontrol F; 404 + bir API kanıtlı yanıt → kenar engelleme F |
| P-1 … P-5 | pozitif kontrol ayrı kayıt: token'sız 200 → P · O · O · **F** (2) · FAIL ölçülemeyenin önünde · tek pozitif 403 → pozitif kontrol O (3) · kanıtsız 5xx → O (3) · web pozitifinde 302 / 404 → F (2) |
| G-1 · **GT-1** · **X-1** · **X-2** | kenar her şeyi geçirir: API'nin işlediği her ret yanıtı API kanıtlı, başlıksız API yanıtları `OLCULEMEYEN` · **değişmezler** (bütün koşumlarda, zemin gerçeğiyle): kimlik anlamı bağımsız türetilenle aynı; API'nin üretmediği yanıt API sayılmaz; API yanıtı "API değil" sayılmaz; katman doğrulaması hiçbir koşumda PASS değil; kenar engelleme PASS'in koşulları · **çıkış kodu eşlemesi** bütün koşumlarda bağımsız yazılmış eşlemeyle aynı; 5 hiç üretilmez · tanınmayan alan değeri 0 vermez |
| N-1 … N-4 · O-1 · O-1b · S5-a…e · S6 | ad kimliği kapısı · yinelenen parametre · konum etiketi kapısı · var olan kanıtın üzerine yazmama · etiket ana makine adını / parçasını içeriyorsa durma · http origin, TLS kapalı, kanıt yazılamaz (7), `--out` yok, geçersiz zaman aşımı · `--phone-list` ayrı çağrı |
| **SA-1 … SA-8** | **kapsam yetkisi kapısı** (sentetik kayıt / dosyalarla): kayıt yok → koşmaz (4), ileti sabit metin · yalnız tünel kaydı / zorunlu kalem eksik → RET · özet tutmuyor / dosya sonradan değişti / dosya yok / boş → RET · ana makine birebir değil (alt alan, sondaki nokta, port, önek) → RET · ad kimliği uyuşmuyor → RET · **tam kayıt** → koşar; kanıtta yalnız durum + kalem türleri · biçimsel hileler (aynı dosya iki kalemde, gelecekteki tarih, tanınmayan tür …) → RET · AD-1 ile kayıt verilmez; telefon listesinde de kapı |
| O-2 · O-3 · V-1 · V-2 | adsız özette ad / yol / hata metni / yönlendirme hedefi / satır düzeyi bulgu / sağlayıcı adı / kanıt dosyası bilgisi yok, alan kümesi sabit, sayılar ham kanıtla ve zemin gerçeğiyle uyumlu (11 koşumda) · özet SHA-256'sı bağımsız hesapla eşleşir · vektör kümesi kimliği kaynaktan bağımsız hesapla eşleşir · bir vektörü değişen kopyada kimlik değişir |
| T-1 … T-4 · D-1 · **DOC-1** · B-0 | statik: pozitif liste · seçenek nesnesi, `ifPassed`, kimlik / kalibrasyon / katman / alan / çıkış kodu işlevleri ipucu okumaz · D8-E1/E2 kaynak kapsamı · **"karar bekliyor" eşlemesi, "değerlendirme gerekir" sınıfı ve çıkış 5 sondada kalmadı**; çıkış kodu tek işlevden · pinler · **belge ↔ kod ↔ öz-test**: belgedeki çıkış kodu eşlemesi sondanın kanıta yazdığı metinle aynı; §1b sütunları ve satır biçimi; "diğer yayın adları" satırı sondanın kapı iletisiyle birebir · belgedeki iki blok tek satır, yalnız ASCII, yalnız AD-1 |
| **B-G** | blok düzeneğinin kapısı (§3b-K8): test ikamesi **kanıtlanamayan** (belgedeki biçimden kaymış: çift tırnak · değişmez dize değil · iki atama · ikinci mutlak `.env` yolu · sonda yolu kaymış · yalnız telefon bloğunda kayma) blok kümesi **hiç koşturulmaz** (kabuk başlatılmaz, betik dosyası yazılmaz, kenara istek gitmez); gerçek bloklardan hazırlanan dokuz metinde canlı kök adı, `.env` uzantılı değer ya da sahte dosyalar dışında mutlak yol yok |
| **B-1 … B-T2** (her biri iki kabukta) | belgeden çıkarılan blok metni, yalnız test için `.env` yolu / sonda yolu / pin ikamesi ve sahte kullanıcı köküyle, sahte `.env` ve sahte kenara karşı: olağan akış (çıkış 0, özet SHA'sı; kabuğun **ölçülen** tam sürümü gözleme yazılır) · satır sayısı 0 ve 2 → sonda hiç koşmaz · https olmayan / yollu değer → koşmaz · pin uyuşmazlığı → koşmaz · bozuk kenarda blok çıkış 2'yi aktarır · telefon listesi bloğu istek atmaz · telefon bloğunda pin uyuşmazlığı. Kabuk yoksa kalem **ÖLÇÜLEMEDİ**'dir (geçti değil) |
| S4 · S4-b | kenar kapalı → O · O · O · O (3; `BAGLANTI`) · doğrulanamayan sertifika → aynı (`TLS`); hata iletisi kanıtta yok |

**Son koşu (R05 üçüncü tur baytları, 2026-10-06; Windows, node 24.18.0; kabuk sürümleri öz-testin kendi çıktısından: Windows PowerShell 5.1 = 5.1.26100.9549 (Desktop) · pwsh 7 = 7.6.6 (Core)):** 107 kalem — **PASS 107 · FAIL 0 · ÖLÇÜLEMEDİ 0**, çıkış 0 (iki kabuktaki 14 blok kalemi dahil).

**Negatif ayna (iki eski sonda, yeni öz-testte):**
- **R04 sondası (`origin/main` baytları, `E150EEDA…514C`)**: **20 / 107** (çıkış 1; 107 kalem raporlandı). Düşen 87 kalem: K-SRC, S1, K-1, L-1, S1-c, Y-1, Y-2, S7, S2, N-5, S3, S3-b, S3-c, S3-dN, S3-ch, S3-chF, S3-az, S3-azP, A-1, A-2, A-3, A-4, R-1, R-2, R-3, M-1, M-2, M-3, M-4, E-1, E-2, SINIR-1, SINIR-2, K-5, K-10, Z-1, L-2, L-2b, L-9, L-3, L-4, L-5, L-6, L-8, H-1, U-1, U-2, U-3, P-1, P-2, P-3, P-4, P-5, G-1, N-1, N-2, N-3, N-4, O-1, O-1b, S5-e, S6, SA-1, SA-2, SA-3, SA-4, SA-5, SA-6, SA-7, SA-8, GT-1, X-1, X-2, O-2, O-3, V-1, V-2, T-2, T-4, D-1, DOC-1, B-1 (iki kabukta), B-5 (iki kabukta), S4-b, S4. Geçen 20 kalem: K-PORT, S1-p, S5-a, S5-b, S5-c, S5-d, T-1, T-3, B-0, B-G, B-2 (iki kabukta), B-3 (iki kabukta), B-4 (iki kabukta), B-T (iki kabukta), B-T2 (iki kabukta) — bunlar sondanın yeni kurallarına değil vektör listesine, eski kapılara, blok metnine ve düzeneğin kendi kapısına bakar (R04 sondası ad kimliği almaz, istek kimliği göndermez, alan ve adsız özet üretmez).
- **R05 düzeltme turu sondası (bir önceki commit `d58b74a6`, `5BBC86B4…C5AB`)**: **36 / 107** (çıkış 1; 107 kalem raporlandı). Düşen 71 kalem: K-SRC, S1, K-1, L-1, Y-1, Y-2, S2, N-5, S3, S3-b, S3-c, S3-dN, S3-ch, S3-chF, S3-az, S3-azP, A-1, A-2, A-3, A-4, R-1, R-2, R-3, M-1, M-2, M-3, M-4, E-1, E-2, SINIR-1, SINIR-2, K-5, K-10, Z-1, L-2, L-2b, L-9, L-3, L-4, L-5, L-6, L-8, H-1, U-1, U-2, U-3, P-1, P-2, P-3, P-4, P-5, G-1, N-2, SA-1, SA-2, SA-3, SA-4, SA-5, SA-6, SA-7, SA-8, GT-1, X-1, X-2, O-2, T-2, T-4, D-1, DOC-1, S4-b, S4. Geçen 36 kalem: K-PORT, S1-p, S1-c, S7, N-1, N-3, N-4, O-1, O-1b, S5-a, S5-b, S5-c, S5-d, S5-e, S6, O-3, V-1, V-2, T-1, T-3, B-0, B-G, B-1 (iki kabukta), B-2 (iki kabukta), B-3 (iki kabukta), B-4 (iki kabukta), B-5 (iki kabukta), B-T (iki kabukta), B-T2 (iki kabukta) — bunlar bu turda değişmeyen kapılar ve statik kalemlerdir; o sonda iki hüküm üretir, bütün isteklere kabul edilen biçimde kimlik gönderir ve aynen dönen değeri API kanıtı sayar.

**Mutasyon provası (bu turun son baytları):** sondanın tek bir kuralı bozulmuş **74 kopyasının 74'i yakalandı**. "Yakalandı" = öz-testin 107 kaleminin hepsi raporlandı (senaryolar koştu; 74 / 74 mutantta 107 kalem) **ve** mutasyonla ilgili — taban koşusunda geçen — kalem FAIL oldu; öz-test çıkışının ≠ 0 olması tek başına sayılmadı; her alternatif sondada düşen pin kalemi D-1 hiçbir mutantta "ilgili" sayılmadı; hedefi kaynakta tam bir kez bulunmayan mutant üretilmez. Bu turda eklenen / değişen her kural için en az bir mutant vardır (istek kimliği protokolü · üç alan + pozitif kontrol + çıkış kodu · kapsam yetkisi kapısı); son grup önceki turlardan taşınan kapı / sızıntı kurallarının yeni öz-testte yeniden ölçümüdür.

| Mutasyon | FAIL olan ilgili kalem |
|---|---|
| gönderilen değerin AYNEN dönmesini (yansıma) API kanıtı say | R-1, R-2, GT-1 |
| yabancı kimlik (damga) göstergesi varken de API kanıtını kullan | M-1, M-2, M-3, E-2 |
| başlıksız bölge hiç ölçülmeden de API kanıtını kullan | Z-1 |
| API'nin ürettiği biçim aranmaz: her farklı değer "yeni kimlik" | M-4 |
| ret vektörlerine GEÇERLİ biçim gönder (önceki protokol) | Y-1, A-1, R-1 |
| pozitiflerin hepsine GEÇERLİ biçim gönder ("değiştirme" kalibrasyonu yok) | Y-1, K-1, S1 |
| kalibrasyon: "değiştirme" davranışı aranmaz | K-5 |
| kalibrasyon: "aynen geri yazma" davranışı aranmaz | K-5 |
| yansıma göstergesi kalibrasyonu geçersiz kılmaz | R-1, R-3 |
| yabancı kimlik göstergesi kalibrasyonu geçersiz kılmaz | M-1, M-3, E-2 |
| ön uçuş başlıksız bölgeden sayılmaz | M-3, R-3, K-1 |
| web pozitifi ölçülmese de kalibrasyon VAR | K-10 |
| başlıksız bölgedeki "yeni kimlik" de API adayı sayılır | M-1 |
| geçerli biçimde AYNEN dönen değer API kanıtı sayılır | K-1, G-1 |
| "API değil" çıkarımı kalibrasyon VAR değilken de yapılır | K-5, E-1, R-3 |
| "API değil" çıkarımı yolu belirsiz satırda da yapılır | L-1, G-1, GT-1 |
| "API değil" çıkarımı ön uçuşta da yapılır | L-1, G-1, GT-1 |
| istek kimliği plan kapısını kaldır | Y-2 |
| yanıt başlığının değerini kanıta yaz | A-1, M-1 |
| web pozitiflerinin tamamı aynı biçimi alır (yalnız geçersiz biçim) | Y-1 |
| API'nin 403'ü kenar engelleme FAIL sayılmaz | A-1, A-2, A-3, A-4 |
| durum kodu ölçütü: yalnız 2xx FAIL sayılır | L-3, L-4, U-2, GT-1 |
| kanıtsız 5xx / 429 / sınıflanamayan kod durum kodu ölçütünde FAIL sayılmaz | L-3, L-6, L-8 |
| yanıt alınamayan ret vektörü FAIL sayılır | H-1, S4, S4-b, P-2 |
| sınama işaretli 403 olağan ret sayılır | S3-ch, S3-chF |
| tanınmayan değerli azaltım işareti yok sayılır | S3-az |
| sınama işareti yalnız tam değerle tanınır (harf duyarlı, liste yok) | S3-chF |
| kalibrasyon eksikliği kenar engelleme nedeni değildir | K-5, E-1, R-1 |
| sınama işaretli 403 kenar engelleme nedeni değildir | S3-ch |
| tekdüze 403 nedeni üretilmez | U-1 |
| pozitifteki beklenmeyen yanıt yok sayılır | P-1, P-5 |
| pozitif reddi (403) bulgu sayılır | P-3, U-1 |
| pozitifte kanıtsız 5xx bulgu sayılır | P-4 |
| çıkış kodu: pozitif kontrol FAIL çıkış 2 vermez | P-1, X-1 |
| çıkış kodu: FAIL → 3 | X-1, S2, A-1 |
| çıkış kodu: kenar engelleme PASS olmasa da 0 | S3-ch, K-5, X-1 |
| çıkış kodu: tanınmayan alan değeri denetlenmez | X-2 |
| reddedilmeyen (2xx) ret vektörü kenar engelleme FAIL sayılmaz | S2, U-3, GT-1 |
| katman doğrulaması: doğrulanamayan satırlar yok sayılır (PASS yazılır) | S1, GT-1 |
| katman doğrulaması: API'nin yanıtladığı kanıtlı satır FAIL vermez | A-1, S2 |
| ret-403 dışındaki yanıtta azaltım işareti yok sayılır | S3-azP |
| pozitifler beklendiği gibi değilken kenar engelleme nedeni üretilmez | P-3, U-1 |
| PASS kaydının ekinden varsayımı çıkar | S1, SINIR-2 |
| eksik kalibrasyonda API kanıtı kenar engelleme FAIL vermez (kalibrasyon VAR şartı) | A-3, U-3 |
| durum kodu ölçütü PASS değilken kenar engelleme nedeni üretilmez | L-3, L-4, H-1 |
| yanıtsız vektör kenar engelleme nedeni değildir | H-1, K-10 |
| ret yanıtında katmanı belirsiz kimlik başlığı nedeni üretilmez | R-1, M-1 |
| tek bir alan olarak birleşik hüküm de yazılır | S1 |
| kapsam yetkisi kapısını kaldır (kayıt yoksa da koş) | SA-1, SA-8 |
| kanıt dosyasının özeti karşılaştırılmaz | SA-3 |
| ana makine bağı denetlenmez | SA-4 |
| ana makine: son ek (alt alan) eşleşmesi yeter | SA-4 |
| ad kimliği bağı denetlenmez | SA-5 |
| tünel kaydı zorunlu kalemin yerine geçer | SA-2 |
| iki zorunlu kalemden biri yeter | SA-2 |
| aynı kanıt iki kalemde kabul edilir | SA-7 |
| boş kanıt dosyası kabul edilir | SA-3 |
| gelecekteki tarih kabul edilir | SA-7 |
| kapsam kaydının yolunu kanıta ve özete yaz | SA-6, O-2 |
| ret iletisinin metni değişir (public satır metniyle aynı değil) | SA-1 |
| AD-1 ile verilen kapsam kaydı sessizce yok sayılır | SA-8 |
| yalnız zorunlu kalemlerin dosyası ölçülür (ek kalem ölçülmez) | SA-3 |
| ret iletisine kayıt yolunu ekle | SA-2, SA-3 |
| kanıt dosyası yoksa kalem atlanır | SA-3 |
| ham yolu göndermeden önce normalleştir | S1-p, T-2 |
| var olan kanıtın üzerine yazma kapısını kaldır | N-4 |
| yönlendirme hedefini kanıta yaz | L-5, P-5 |
| konum etiketinde ad parçası denetimini kaldır | O-1b |
| zaman aşımı ortam değeri kapısını kaldır | S5-e |
| yinelenen parametre kapısını kaldır | N-2 |
| adsız özete ana makine adını yaz (ad denetimi açık) | S1, O-2, O-3 |
| adsız özete ana makine adını yaz, sondanın ad denetimini kapat | O-2 |
| taşıma hatasında hata kodunu satıra yaz | S4, S4-b, P-2 |
| konum etiketi kapısını kaldır | N-3 |

Mutasyon koşusunun taban koşusunda belge henüz son hâlinde değildi: pin kalemi D-1 ve belge kalemi DOC-1 tabanda FAIL'di (D-1, DOC-1) ve hiçbir mutantta "ilgili" sayılmadı. Belge son hâline geldikten sonra kapı metni mutantı ("ret iletisinin metni değişir (public satır metniyle aynı değil)") ayrıca yeniden koşuldu: taban 107 / 107 (FAIL 0), mutantta 107 kalem raporlandı ve SA-1, DOC-1 FAIL — belge ↔ kod bağı da mutantı yakalıyor.

**Kabuk yokluğu provası (bu turun baytları; belge son hâlindeyken):** kabuk adı var olmayan bir yürütülebilire çevrildiğinde (iki kabuk için ayrı ayrı denendi) o kabuğun 7 kalemi ÖLÇÜLEMEDİ oldu ve öz-test çıkışı 0 değil 2 verdi — pwsh 7 yok: çıkış 2 · 100 PASS · 0 FAIL · 7 ÖLÇÜLEMEDİ (107 kalem) · Windows PowerShell 5.1 yok: çıkış 2 · 100 PASS · 0 FAIL · 7 ÖLÇÜLEMEDİ (107 kalem).

**Blok düzeneği deneyi (depo dışı, yalıtılmış kopya; bu turun baytları — §3b-K8):** paketin kopyasında belgedeki iki bloğun `.env` yolu değiştirilip öz-test o kopyada koşturuldu. (A) yol var olmayan bir köke çevrildi: 107 kalem raporlandı, FAIL yalnız B-0 (belgedeki yolun değiştiğini gösteren kalem); kabuğa verilen 20 betikten belgedeki yolu taşıyan 0, canlı kök adını taşıyan 0 — bloklar sahte `.env` ile koştu. (B) ölçüm bloğunda yol çift tırnakla yazıldı (ikame kanıtlanamaz): 107 kalem raporlandı, FAIL B-0, B-G, B-1 (iki kabukta), B-2 (iki kabukta), B-3 (iki kabukta), B-4 (iki kabukta), B-5 (iki kabukta), B-T (iki kabukta), B-T2 (iki kabukta); kabuğa verilen betik 2 (yalnız iki kabuğun sürüm sorgusu) — owner bloğu **hiç koşmadı**.

**Öz-testin ölçmediği** (hiçbiri "geçti" sayılmaz):
- **gerçek API ve gerçek kenar** (§1.1: izole provayı çağıran koşacak — yapılmadı); canlı zincirin kimlik başlığını geçirip
  geçirmediği, canlı kenarın şablonla eşitliği, gerçek web uygulamasının yanıtlarında bu başlığın bulunup bulunmadığı. Kenar engelleme
  PASS kaydındaki varsayım ve FAIL yönündeki sınır (SINIR-1 / SINIR-2) bu yüzden ölçüm değil kayıttır.
- katman doğrulamasının `PASS` dalı: bugünkü vektör kümesi doğrulanamayan satırlar içerdiğinden hiçbir girdiyle üretilemez (yalnız
  "hiçbir koşumda PASS değil" ölçülür).
- kapsam yetkisi kapısı kanıt dosyalarının **içeriğini** ölçmez (sonda da ölçmez); AD-1 ad kimliğiyle koşulan adın gerçekten birincil
  ad olduğu ölçülmez (§1).
- özet yazımından hemen önceki ikinci ad denetimi (çıkış 7) dürüst girdiyle tetiklenemez (yalnız mutasyonla gösterildi).
- özet ile ham kanıttan **yalnız birinin** yazılamadığı durumlar tetiklenemedi (yalnız "ikisi de yazılamadı" ölçüldü: S5-c).
- hata sınıflarından `AD-COZULMEDI` ve `DIGER` için senaryo yok (`BAGLANTI`, `TLS`, `ZAMAN-ASIMI` ölçülüyor).
- pozitif vektörde API kanıtlı 5xx / 429 → pozitif kontrol `FAIL` dalı senaryosuz.
- owner blokları betik dosyasından (`-File`) koşturuldu; konsola yapıştırma davranışı ve canlı `.env`'e karşı koşum ölçülmedi.
- sondanın beklenmeyen biçimde durması (çıkış 1) dürüst girdiyle tetiklenemez; yakalanmamış istisnada çalışma ortamının verdiği koddur.
- öz-test CI'da koşmaz; elle koşuldu.

Günlükler depo dışındadır (`HY_R27_AGENT_EVIDENCE\r04\d8-hazirlik\r05\tur3\`; önceki turlar `…\r05\` ve `…\r05\duzeltme\`). Önceki
revizyonların kanıtları (R04 `r04\d8-probe-r02\`; R03 `extacc-d8-r01-is3-fix\`, `extacc-d8-r01-is3\`) korunur.

### 1d. Owner blokları — yalnız AD-1 (canlıda ÇALIŞTIRILMADI)

**Bu paket revizyonunda canlı sonda çalıştırılmadı.** Koşum, owner'ın canlı sonda kapsamı kararı ve **ad başına GO**'sundan sonra, kayıt
sahibinin penceresinde yapılır (§3b, açık kalan karar). Blok **yalnız AD-1 (birincil ad)** içindir; başka ad için blok
**yazılmamıştır** (kapsam ve ad başına GO ayrıca; başka bir ad ayrıca kapsam yetkisi kaydı ister — §1). Dış origin yer tutucu
değildir: blok onu canlı yapılandırmadan (`.env` `PUBLIC_PORTAL_BASE_URL`; tek satır, salt okuma, D-5/D-6/D-7 bloklarıyla aynı kaynak)
okur, https / yolsuz origin biçim kapısından geçirir ve sondanın pinini doğrular; kapılardan biri tutmazsa sonda hiç koşmaz. Blok
canlı dist pini taşımaz (yalnız sondanın kendi SHA-256'sını pinler). Kanıt kökü kullanıcı profiline görelidir (public belgeye canlı
alan adı ve kullanıcı yolu yazılmaz). Blok mantık taşımaz (sınıflama sondadadır): ad kimliğini ve beyan edilen konum etiketini verir,
sondanın çıkış kodunu ve — **kısıtlı kayıt için** — adsız özetin SHA-256'sını yazdırır (bu değer public belgeye yazılmaz; §1b).
Sondanın kendi çıktısının son satırları dört alanı ayrı ayrı verir (`D8-HTTP-RET` · `D8-KENAR-ENGELLEME` · `D8-KATMAN-DOGRULAMA` ·
`D8-POZITIF-KONTROL`).

Ölçüm (normal pencere):
```powershell
& { $ErrorActionPreference='Stop'; $e='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\.env'; $l=@([IO.File]::ReadAllLines($e) | Where-Object { $_ -match '^\s*PUBLIC_PORTAL_BASE_URL\s*=' }); if($l.Count -ne 1){ throw 'PUBLIC_PORTAL_BASE_URL satiri 1 degil - DUR' }; $ExpBaseUrl=($l[0] -replace '^\s*PUBLIC_PORTAL_BASE_URL\s*=\s*','').Trim().Trim('"').Trim("'"); if($ExpBaseUrl -cnotmatch '^https://[A-Za-z0-9.-]+(:\d+)?$'){ throw 'PUBLIC_PORTAL_BASE_URL https/yolsuz origin degil - DUR' }; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-extacc-d8-staff-surface-r01\scripts\d8-staff-surface-probe.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '369A51DD739DE8135FA95E39E1C87A8BC4675AD60976C16175381AD2FEAE8370'){ throw 'D8 SONDA SHA UYUSMUYOR - DUR' }; $o=Join-Path $env:USERPROFILE ('Documents\CLIENT-EVIDENCE-20260911\extacc-d8-AD-1-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'); New-Item -ItemType Directory -Force -Path $o | Out-Null; & node $f --alias AD-1 --vantage canli-ana-makine-cikisi --origin $ExpBaseUrl --out "$o\d8-probe.json"; $c=$LASTEXITCODE; 'D8 AD-1 cikis=' + $c; $s="$o\d8-probe.ozet.json"; if(Test-Path -LiteralPath $s){ 'D8 AD-1 adsiz ozet SHA256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $s).Hash } else { 'D8 AD-1 adsiz ozet YOK' } }
```

Telefon listesi (ayrı çağrı; istek atmaz, kanıt yazmaz; ölçüm bloğu listeyi yazdırmaz):
```powershell
& { $ErrorActionPreference='Stop'; $e='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\.env'; $l=@([IO.File]::ReadAllLines($e) | Where-Object { $_ -match '^\s*PUBLIC_PORTAL_BASE_URL\s*=' }); if($l.Count -ne 1){ throw 'PUBLIC_PORTAL_BASE_URL satiri 1 degil - DUR' }; $ExpBaseUrl=($l[0] -replace '^\s*PUBLIC_PORTAL_BASE_URL\s*=\s*','').Trim().Trim('"').Trim("'"); if($ExpBaseUrl -cnotmatch '^https://[A-Za-z0-9.-]+(:\d+)?$'){ throw 'PUBLIC_PORTAL_BASE_URL https/yolsuz origin degil - DUR' }; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-extacc-d8-staff-surface-r01\scripts\d8-staff-surface-probe.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '369A51DD739DE8135FA95E39E1C87A8BC4675AD60976C16175381AD2FEAE8370'){ throw 'D8 SONDA SHA UYUSMUYOR - DUR' }; & node $f --alias AD-1 --origin $ExpBaseUrl --phone-list; 'D8 AD-1 telefon listesi cikis=' + $LASTEXITCODE }
```

Konum etiketi `canli-ana-makine-cikisi` bir **beyandır**: blok canlı ana makinede koşar ve istek o makinenin çıkışından gider; sonda
konumu ölçmez. Dış ağ ayağı yalnız telefon beyanıdır (§2). Blok çıktısındaki `cikis=` değeri §1.1'deki çıkış kodudur: 0'da kenar
engelleme PASS'tir (katman doğrulaması ayrı satırdadır; kapanış değildir — §3); 2'de en az bir alan FAIL'dir; 3'te FAIL yoktur ama
kenar engelleme PASS değildir (ölçülemeyen); 4'te sonda istek atmamıştır (blok önceden açtığı kanıt dizinini boş bırakır; boş dizin
kanıt değildir — ör. konum etiketi adın bir etiketini içeriyorsa); 1'de sonda beklenmeyen biçimde durmuştur (ölçülemeyen); 7'de özet
ya da ham kanıt yazılamamıştır.

## 2. D-8 telefon adımı (owner beyanı; makine ölçümü değildir)

Sonda `--phone-list` ile (ayrı çağrı; §1d ikinci blok) 5 adres yazar (`/auth/login`, `/`, `/api/auth/me`,
`/api/portal/admin/documents/pending`, `/api/cases`). Telefonda (Wi-Fi kapalı, mobil veri, gizli sekme) her adres için: **E** =
hata/erişim engellendi · **S** = sayfa/veri açıldı · **?**. Beyan `owner-declaration-d8.json` olarak ayrı dosyaya elle yazılır (sonda
yazmaz) ve **hangi ad için** verildiğini ad kimliğiyle taşır. S = ürün/kenar bulgusu adayı. Beyanın her ad için ayrı mı alınacağı,
canlı sonda kapsamı ve ad başına GO ile **birlikte netleşecek** açık karardır (§3b); o zamana kadar bir adın beyanı başka bir adın
satırına yazılmaz. Kapsam yetkisi kapısı telefon listesi çağrısında da geçerlidir (birincil ad dışındaki bir ad için liste, kapsam
yetkisi kaydı olmadan yazdırılmaz).

## 3. D-8 kapanış tanımı — ad başına, üç ayrı alan + pozitif kontrol

D-8 **ad başına** kaydedilir; "D-8 PASS" diye tek bir hüküm **yoktur** ve bir adın sonucu başka bir ad için söylenmez. Bir adın
satırı (§1b) şu kayıtlar **ayrı ayrı** yazılarak tamamlanır; hiçbiri diğerinin yerine geçmez ve her biri **kanıtın desteklediği**
değeri taşır:

1. **HTTP / ret sonucu** — `PASS` / `FAIL` / `OLCULEMEYEN` (yalnız durum kodu ölçütü). Beklenen 403 yerine doğrulanmış başka bir
   HTTP yanıtı `FAIL`'dir; yanıt alınamaması `OLCULEMEYEN`'dir.
2. **Kenar engelleme sonucu** — `PASS` / `FAIL` / `OLCULEMEYEN`. "Dışarıdan kapalı" sözü yalnız bu alan `PASS` olan ad için ve kayıt
   ekiyle söylenir: "yalnız bu istek profili, bu konum, bu vektör kümesi için" + varsayım ("API'nin ürettiği yanıtta kimlik başlığı
   zincirde düşürülmüyor" — kalibrasyon bunu yalnız pozitiflerin yanıtında gösterir; izole prova yapıldığında bu satır ölçümle
   güncellenir). Engellenmesi gereken bir isteğin API'ye ulaştığı kanıtlanmışsa — API 403 vermiş olsa da — alan `FAIL`'dir (bulgu
   adayı). Kalibrasyon eksikse ya da yanıt bir sınama yanıtıysa alan `OLCULEMEYEN` kalır: ne "kapalı" ne kesin API sızıntısı yazılır.
3. **Katman doğrulaması** — `PASS` / `FAIL` / `OLCULEMEYEN`; ayrı alandır ve kenar engelleme sonucunun yerine geçmez. Bugünkü vektör
   kümesinde bu yöntemle doğrulanamayan satırlar bulunduğundan değer `PASS` olamaz; `OLCULEMEYEN` olağan sonuçtur ve satıra öyle
   yazılır (kapsam sayısı kısıtlı kayıtta). İpucu (`hints`, `layerHint`) katman kanıtı diye raporlanmaz; kenar / tünel / sağlayıcı
   adlandırılmaz.
4. **Pozitif kontrol** — `PASS` / `FAIL` / `OLCULEMEYEN`; izin verilen yollar ayrı kayıttır.
5. **Dış ağ beyanı** (telefon; §2) — makine ölçümü değildir; ayrı dosyada, ad kimliğiyle. Beyanı olmayan adın satırında "dış ağ ayağı
   YOK" yazılır.

Sonda çıkış kodları: **0** = FAIL yok ve kenar engelleme `PASS` (tek başına kapanış **değildir**: diğer alanlar ve beyan ayrıca
yazılır) · **2** = en az bir alan `FAIL` (bulgu adayı) · **3**, **1**, **7** = ölçülemeyen / kanıt yok — kapanış değildir · **4** = sonda
koşmadı (kapsam yetkisi doğrulanmayan ad için satıra "KOŞULMADI — kapsam yetkisi doğrulanmadı" yazılır).

Kurallar:
- Ölçülemeyen kontrol PASS sayılmaz; kanıt yoksa satır "KOŞULMADI" kalır.
- Kanıttaki `measured.credentialHeaderRequests` 0 ve `measured.nonEmptyBodyRequests` 0 değilse koşum kanıt olarak KABUL EDİLMEZ (sonda
  beklenmeyen bir şey göndermiştir).
- Özetteki `probeSha256` §7 pinine, `vectorSetId` §7 değerine eşit değilse satır bu revizyonun ölçümü sayılmaz.
- Bulgu ayrıntısı (yol, yöntem, durum), sayılar ve nedenler **kısıtlı kayda** alınır; public PR'a ve public satıra yazılmaz (§1b).
  `POST /api/auth/login` uygulamaya ulaştıysa personel giriş sayacı +1 yan etkisi de kayda yazılır (tek istek; blok üretmez).
- Bu sonda sunucunun kendi çıkışından koşar; SEC-API-BIND-01 açıkken D-8 sonucu ayrıca "dışarıdan erişilemez" diye genellenmez.
- Bu belge canlı sonda, yayın, migration, e-posta, Run ya da Recover yetkisi **vermez**.

### 3b. OWNER KARARLARI (2026-10-05)

Owner bu kararları 2026-10-05'te verdi. Kararların metni bu belgeye koordinatör aracılığıyla alındığı biçimiyle, **aynen** yazılmıştır;
kararın aslı koordinasyon kaydındadır ve bu belge onun yerine geçmez (birleştirmeden önce metinler o kayıtla karşılaştırılır). Sonda,
öz-test ve bu belge bu kararlara göre yazılmıştır; "öz-test" sütunu kararı ölçen kalemleri gösterir.

| # | Karar (owner, aynen) | Bu revizyonda nasıl uygulandı | Öz-test |
|---|---|---|---|
| K1 | "Kenarda engellenmesi gereken isteğin API'ye ulaştığı kanıtlanırsa kenar ölçütü FAIL/bulgu adayıdır; API'nin 403 vermesi bunu kapatmaz. API'ye geçmesine izin verilen yolları bu kuralla karıştırma." | API'ye özgü kanıtlı ret satırı — durum kodu 403 olsa da — kenar engelleme `FAIL` ve katman doğrulaması `FAIL` (çıkış 2); durum kodu ölçütü ayrı alandır. Pozitif vektörler ayrı "pozitif kontrol" kaydındadır | A-1, A-2, P-1 |
| K2 | "Gerekli kalibrasyon başarısız veya eksikse koşum genel olarak 'kapalı' hükmü veremez. Bağımsız olarak kanıtlanan ihlal yine FAIL/bulgu olarak korunur. Kalibrasyon eksikliği somut olumsuz kanıtı silemez." | kalibrasyon `VAR` değilken kenar engelleme `PASS` verilmez (`OLCULEMEYEN`); aynı koşumda API'ye özgü kanıt varsa `FAIL` korunur (kalibrasyon `YOK` iken de, yansıtan katman görülmüşken de) | K-5, E-1, R-3, A-3, U-3 |
| K3 | "HTTP durum kodu eşleşmesi ayrı kaydedilebilir; fakat challenge yanıtı, hedeflenen erişim kuralının uygulandığını kanıtlamaz. Kenar engelleme hükmü ÖLÇÜLEMEYEN/UNKNOWN kalır. Başka bağımsız kanıt yoksa ne 'kapalı' ne de kesin API sızıntısı yazılır." | sınama işaretli (ve tanınmayan azaltım işaretli) 403: HTTP / ret `PASS`, kenar engelleme `OLCULEMEYEN` (çıkış 3); başka satırda API kanıtı varsa `FAIL` korunur | S3-ch, S3-chF, S3-az, S3-azP, A-4 |
| K4 | "Her ad için HTTP/ret sonucu, kenar engelleme sonucu ve katman doğrulaması ayrı alanlar olsun. Kanıtın desteklediği PASS / FAIL / ÖLÇÜLEMEYEN değerini yaz. Sahiplik doğrulanmamışsa 'KOŞULMADI — kapsam yetkisi doğrulanmadı' de. Kısıtlı ad ve altyapı ayrıntıları yerine gerektiğinde ad kimliği kullan; public kayda hassas kanıt taşıma." | üç ayrı alan + pozitif kontrol (§1.1); §1b tablosu ad kimliği başına ayrı sütunlarla; public satırda yalnız alan değerleri; kapsam yetkisi doğrulanmayan ad için sonda koşmaz ve o metni yazar | S1, GT-1, X-1, SA-1, DOC-1, O-2 |
| K5 | "Beklenen 403 yerine doğrulanmış başka HTTP yanıtı geldiyse durum kodu ölçütü FAIL kalır. Yanıt alınamaması ise ÖLÇÜLEMEYEN'dir. Bunları genel 'owner değerlendirmesi' etiketi altında birleştirme." | HTTP / ret: 403 dışı her doğrulanmış yanıt `FAIL` (kanıtsız 5xx / 429 / 3xx / 4xx dahil); yanıtsız ret vektörü `OLCULEMEYEN`; "değerlendirme gerekir" etiketi ve çıkış 5 kaldırıldı | L-3 … L-8, H-1, U-2, T-4 |
| K6 | Diğer adın kapsam yetkisi: "yetkili sağlayıcı hesabındaki bölge/özel ad kaydı + DNS zinciri yeterli. Tünel kaydı tek başına yeterli değil. Kanıt eksikse yalnız eksik girdiyi iste; sahiplik kapısını uygulamayı bekletme." | kapsam yetkisi kapısı sondada (§1): AD-1 dışındaki ad kimliği kayıtsız koşmaz; iki kalem + dosya + SHA-256 + tarih + ad kimliği / ana makine bağı ölçülür; yalnız tünel kaydı RET. Bugün hiçbir ek ad için kayıt sunulmadı — eksik olan yalnız bu girdidir | SA-1 … SA-8 |
| K7 | "R27 yayın paketi ve kalan işler karar listesindeki eski 'tek PASS ile kapanış' ifadelerini düzeltmek için dar kapsam genişletmesini onaylıyorum. … Yalnız D-8'in güncel karar ve kapanış tanımını düzelt. Tarihsel koşum sonuçlarını değiştirme." | `client-release-r27-r01/R27-RELEASE-PACKAGE-R01.md` — yalnız D-8 ölçüt satırı + tek cümlelik not · `CLIENT-KALAN-ISLER-R01.md` — D-8 satırı, §3.3, §5, §11 KR-9 | — (belge) |
| K8 | "Öz-testin canlı hedefe çıkmasını engelleyen ikame kontrolü zorunlu kalsın. İkame kanıtlanamazsa owner bloğu hiç çalışmamalı." | öz-testin blok düzeneği, `.env` yolu / sonda yolu / pin ikamesi kanıtlanmadan bloğu hiç koşturmaz (değişmedi; bu turun baytlarında iki kabukta yeniden ölçüldü) | B-G, B-0, B-1 … B-T2 |
| K9 | İzole prova ölçütü: prova "sıradan yansıyan girdi ile API'ye ulaşmayı gerçekten ayırt eden kanıtı sınayacak; kanıtın desteklemediği katman kesinliğini reddedecek." | kanıt kuralı "kabul edilmeyen biçim → yeni kimlik" üzerine yeniden kuruldu; yansıma, damga, ezme ve kısmi kalibrasyonda katman / kenar hükmü `OLCULEMEYEN` (§1.1). **Gerçek API ile izole provayı çağıran koşacak — yapılmadı**; öz-testteki API bir modeldir | R-1 … R-3, M-1 … M-4, E-1, E-2, Z-1, SINIR-1, SINIR-2 |
| K10 | "Bu talimat canlı sonda, yayın, migration, e-posta, Run veya Recover yetkisi vermiyor." | canlıya hiçbir istek atılmadı; blok yalnız AD-1 için hazır ve çalıştırılmadı | — |

**AÇIK KALAN TEK D-8 KARARI — canlı sonda kapsamı ve ad başına GO:** hangi adlar, hangi pencere, hangi istek profili (her istekte tek
kullanımlık `x-request-id`; ret vektörlerinde API'nin kabul etmediği biçimde — §1). Telefon beyanının ad başına alınıp alınmayacağı
bu GO ile **birlikte** netleşir. GO yok; kapsam kesinleşmedi; blok yalnız AD-1 için yazıldı ve çalıştırılmadı.

## 4. D-6 belge akışı — tanım ve paket eşlemesi (koşucu + owner bloğu HAZIR: `client-extacc-portal-d6-r01`; canlıda koşulmadı)

Bağlayıcı kaynak paket belgesidir: `client-extacc-portal-d6-r01/EXTACC-D6-PORTAL-DOCUMENTS-PACKAGE-R01.md` (§1 sapma kaydı, §2 ölçütler,
§7 owner kararları). Bu tanım ile paket arasındaki **ölçülmüş** sapmalar aşağıda "ölçüldü" notuyla yazılır; tanım paketi geçersiz kılmaz.

| Konu | Tanım (bu belge, 2026-09-29 öncesi) | Paket (ölçüldü) |
|---|---|---|
| Uçlar (Caddy izin listesi) | `GET /api/portal/documents` · `POST documents/upload` (multipart, ≤10 MB, pdf/jpg/png/doc/docx) · `GET documents/:id/download` · `DELETE documents/:id` · admin uçları yalnız iç ağdan (dış 403 = D-8) | aynı; `admin/documents/pending` yalnız **yerel GET**; `approve|reject` **çağrılmaz** (D-6 §1, §7) |
| Sentetik veri | D-4 kurulumu; 1 sentetik PDF (runId gömülü, ≤ 50 KB); kapsam dışı ikinci müvekkil | aynı; kapsam dışı satır **yabancı tenantın** müvekkiline Prisma ile yazılan dosyasız satır, kapanışta Prisma ile temizlenir ve raporlanır (P6-FOREIGN-CLEAN) |
| Yan etkiler | `PortalDocument` satırı; diskte dosya; audit; bekleyen liste | **ölçüldü (kaynak `HY_WT_R27` portal.controller/service):** belge uçlarında bildirim/e-posta/outbox/**audit**/event YOK; yalnız `reviewDocument` (approve/reject) `PortalNotification` yazar — paket çağırmaz; audit farkı yalnız hesap aç/kapa; yükleme log satırı **maskesiz** (D-6 §1) |
| D6-1 | telefon: yükleme 201, owner beyanı **zorunlu** | **sapma (ölçüldü, D-6 §1):** makine ölçümü koşucunun kendi **dış** multipart yüklemesi (D6-1/D6-1D); telefon yüklemesi **opsiyonel**, beyan ayrı dosyada (`owner-declaration.json`) |
| D6-2 / D6-3 / D6-5 | liste yalnız bu koşum · indirme sha = yüklenen · DELETE → satır + dosya yok | aynı (D6-2L/2D, D6-3, D6-5/5D/5L); dosya yokluğu **üç durumlu `stat`** (`var`/`yok`/`olculemez`; `olculemez` → ÖLÇÜLEMEYEN, PASS değil) |
| D6-4 | kapsam dışı `:id` indirme/silme **404** | aynı (D6-4A/4B/4C; 200 → "KAPSAM DIŞI BELGEYE ERİŞİLDİ" ürün bulgusu) |
| D6-6 | personel onay/ret iç ağdan (**opsiyonel**) | **sapma (ölçüldü):** yalnız bekleyen liste GET'i, **zorunlu** ölçüt (FAIL → 2); onay/ret bilinçli çağrılmaz (bildirim satırı + silme kilidi) — onay/ret canlı kabulü **ayrı paket, owner kararı** (D-6 §7) |
| Kapanış | belge satırı ve dosya YOK; D-4 kuralları; Recover owner kararı | aynı + P6-C-DOC üç durumlu; Recover `D6_RESIDUE_CLEANUP=1` satırları Prisma ile siler, **dosya silmez** (listeler); Recover ölçülemeyeni 0 yapmaz (D-6 §2) |
| Owner adımları | telefondan yükleme beyanı zorunlu | **sapma:** 9 beyan sorusu; telefon yüklemesi yapıldıysa koşucu silmesinden önce telefondan silinmesi beklenir (D-6 §4) |
| Öz-test | — | koşucu 51/51 · owner bloğu WinPS 5.1 ve pwsh 7 (sayılar D-6 §5/§8) |

## 5. D-7 mesaj akışı — tanım ve paket eşlemesi (koşucu + owner bloğu HAZIR: `client-extacc-portal-d7-r01`; canlıda koşulmadı)

Bağlayıcı kaynak: `client-extacc-portal-d7-r01/EXTACC-D7-PORTAL-MESSAGES-PACKAGE-R01.md` (§2 kaynak yan etki bulgusu, §3 ölçütler, §10 owner kararları).

| Konu | Tanım (bu belge, 2026-09-29 öncesi) | Paket (ölçüldü) |
|---|---|---|
| Uçlar | `GET/POST /api/portal/messages` · `GET messages/unread-count` · `POST messages/mark-read`; personel `GET/POST /api/portal/admin/messages/:clientId` (iç ağ) | aynı; admin uçları yalnız **yerel API**; `getClientMessages` gövdesi `{ client, messages }` (çıplak dizi FAIL) ve müvekkil mesajlarını okundu işaretler (D-7 §2) |
| Sentetik veri | D-4 kurulumu; içerik `D7-<runId>` | aynı + yabancı tenant dosyası (D7-4N) ve aynı tenantta ikinci sentetik müvekkile bağlı dosya (D7-4S) |
| Yan etkiler | "`ClientMessage`" satırları; bildirim/e-posta tetikleyicisi **açık soru** | **ölçüldü (D-7 §2):** model adı `ClientMessage` **değil** — `PortalMessage` + `PortalNotification`; `sendMessageFromClient` yalnız `PortalMessage` yazar; **yalnız `sendMessageFromOffice`** `PortalNotification` (MESAJ, `/portal/messages`) yazar; **e-posta/SMS/outbox/audit YOK** — açık soru kapandı, gerçek alıcıya gönderim gerektiren kısım yok |
| D7-1 / D7-2 / D7-3 | telefon POST 201 · GET yalnız bu koşum · personel yanıtı görünür, unread 1 → mark-read 0 | makine ölçümü koşucunun kendi **dış** POST'u (D7-1); D7-2; D7-3/3N/3U (yanıtsız çağrı → ÖLÇÜLEMEYEN, FAIL değil); D7-3B telefon girişinden sonra 2. yanıt + DB satırı |
| D7-4 | kapsam dışı `caseId` ile POST **404** | **sapma (ölçüldü, D-7 §2/§10 K-3):** kaynak `resolveCaseReference` **400** "Geçersiz dosya referansı", satır yazılmaz; paket **400** ölçer (D7-4N/4S/4U); canlı 404 verirse FAIL (dist ≠ kaynak işareti) |
| D7-5 | dış admin uçları 403 (D-8) | paket **çağırmaz/ölçmez** (`d75Note`); D-8 sondası ölçer |
| Kapanış | mesaj satırları kalır; U-ISO; D-4 kuralları; "satır kaldı" owner kararı | aynı; **P7-MSG-KEPT** = koşucu satırları yerinde (`yerinde=k/k`), `PortalMessage`/`PortalNotification` **SİLİNMEDİ**, "saklandı: n" olarak raporlanır; boş doğrulama PASS vermez (D-7 §3, §10 K-1) |
| Öz-test | — | koşucu 41/41 · owner bloğu WinPS 5.1 ve pwsh 7 (sayılar D-7 §6/§11) |

## 6. Birleşik D-9 tanımı — bileşen → ölçüt kimliği

D-9 (birleşik) = D-4/D-5/D-6/D-7 koşumlarının her birinde aşağıdaki bileşenlerin **ayrı satırlarda** ölçülmesi; herhangi biri
FAIL ya da ÖLÇÜLEMEYEN ise D-9 PASS sayılmaz. Ekran görüntüsü kanıt yerine geçmez; owner beyanı makine ölçümünden ayrı tutulur.

| Bileşen (talimat 4) | Ölçüt kimliği (paket) | Ne ölçülür |
|---|---|---|
| Portal oturumu / DB kapanışı | D-4 R03 kuralları; **P5-C1…P5-C5** (D-5) · **P6-C1…P6-C5** (D-6) · **P7-C1…P7-C5** (D-7) | portal pasif, `tokenVersion` verilme sürümünden büyük, `hasPortalAccess=false`, `resetToken` NULL (P5); HTTP: yeni giriş 401 yerel+dış, **mevcut oturum 401** (P5-C4*/P6-C4/P7-C4 — korumalı uç paket başına farklı) |
| Sıfırlama bağlantısı | **P5-C-TOKEN** (D-5) | kapanışta token temizlendi; tek kullanım yalnız gözlem (P5-SINGLE-USE-OBS, owner beyanıyla birleşik) |
| Belge erişimi / kalıntısı | **P6-C-DOC** (üç durumlu) · **P6-FOREIGN-CLEAN** (D-6) | müvekkilin `PortalDocument` satırı 0 ve bilinen dosyalar diskte `yok`; `olculemez` → ÖLÇÜLEMEYEN, PASS değil; sentetik yabancı satır Prisma ile temizlendi (açıkça raporlanır) |
| Mesajlar | **P7-MSG-KEPT** (D-7) | koşucunun yazdığı `PortalMessage` satırları **yerinde**; `PortalMessage`/`PortalNotification` **SİLİNMEDİ** ("saklandı: n" raporu); boş doğrulama PASS değil |
| Sentetik personel ve dosya kapanışı | **U-CLOSE** (her paket) | personel pasif, Case CLOSED, elev personel 401 |
| İzolasyon | **U-ISO** (her paket) | sentetik olmayan tenant parmak izi değişmedi |
| Intake bağlantısı | D-1..D-3 (kabul, `cff5c692`) | USED/iptal; bu tanımda yeniden ölçülmez |

Kurallar:
- **Saklanan kayıtlar silinmiş gibi raporlanmaz:** test/audit satırları, `PortalMessage`/`PortalNotification` ve onaylanmış `PortalDocument`
  kayıtları kanıtta "saklandı: n" ile yazılır; "temizlendi/silindi" yalnız gerçekten silinen sentetik satırlar için (P6-FOREIGN-CLEAN,
  Recover `D6_RESIDUE_CLEANUP=1`).
- **Yarım kalma → Recover:** Run 5/6 ile biterse Recover makbuzla kapanışı tamamlar; Recover **ölçülemeyeni 0 yapmaz** — mevcut oturum reddi
  Recover'da ölçülemez (→ en iyi 3), dosya `olculemez` → 6; Recover'ın 0 verebildiği tek yol hesabın hiç açılmamış olduğu erken dönüştür
  (HTTP reddi ölçülmez). Belge kalıntısında dosya owner tarafından elle silinir ve Recover bir kez daha koşar; kova ACL okunamıyorsa önce düzeltilir.
- Mesaj kalıntısı owner kararı K-1 (D-7 §10) ile "saklandı" kaydıyla kabul edilir; DB'den elle silme önerilmez.
- H1–H8 sayacı D-9'dan türetilmez (0/8 değişmez).

## 7. Pinler

`d8-staff-surface-probe.js` `369A51DD739DE8135FA95E39E1C87A8BC4675AD60976C16175381AD2FEAE8370` · `d8-selftest.js` `D5131DF1D4019852E9BE11DBE3B3508C02A572406A2719A399BEA8FA8A09600F`.
Vektör kümesi kimliği (59 ret + 9 pozitif; vektörler R04 ile aynı): `83AD1AB6DF5E52FD4FD028C5C6A411CDD9D22BCAB53194ABD9915D47920FF0F2`.
(R05 üçüncü tur, 2026-10-06, 2026-10-05 tarihli owner kararlarıyla: ad başına üç ayrı alan + pozitif kontrol · API'ye özgü kanıt = kabul edilmeyen
biçimdeki istek kimliğinin yenisiyle değiştirilmesi · birincil ad dışındaki adlar için kapsam yetkisi kapısı · çıkış kodu dört alandan,
çıkış 5 kalktı · öz-test 107 kalem; canlıda koşulmadı. Önceki pinler: R01 ilk `DD6448A5…` / `E50EAE0C…`; birinci tur düzeltme
`51B78C3B…` / `F9E9BD65…` [13/13]; ikinci tur `6400223…` / `A311CF00…` [15/15]; R27-R03 katman ipucu `D5FA37D1…` / `AD7B0759…` [15/15,
2026-09-30]; R04 D8-E1/E2 `E150EEDA…` / `45FC0B5E…` [17/17, 2026-10-03]; R05 ilk baytlar `DDC882FF…` / `65CA8A4F…` [66/66,
2026-10-05]; R05 düzeltme turu `5BBC86B4…` / `7249C7B1…` [86/86, 2026-10-05; bu turla geçersiz].)

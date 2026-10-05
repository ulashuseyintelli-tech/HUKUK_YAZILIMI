# EXTACC D-8 — PERSONEL YÜZEYİ DIŞARIDAN KAPALI · D-6/D-7 TANIMI · BİRLEŞİK D-9 (R01)

> **DURUM: HAZIR — CANLIDA KOŞULMADI.** D-8 kısmi kaydı (owner telefonu, 5 GET → 403, 2026-09-27 21:14–21:15) **tamamlanmış
> sayılmaz**: katman ölçülmedi; diğer yöntem/yollar açık. Bu paket makine ölçümünü ve telefon beyanını ayırır.
>
> **R05 (2026-10-05) — ad başına koşum, iki ayrı hüküm.** Owner talimatı (2026-10-05, aynen): "D-8 hazırlığında birincil adı ve
> sahipliği doğrulanmış diğer yayın adlarını ayrı satırlarda göster. Bir adın sonucu diğerine taşınmasın; ret sonucu ile reddeden
> katmanın kimliği ayrı değerlendirilsin. Canlı sonda kapsamı ve GO'su ayrıca kesinleşecek." Bu revizyonda: **(1)** bir süreç = bir ad =
> bir kanıt (zorunlu takma ad `--alias AD-<n>`; çok adlı döngü yok) · **(2)** ret sonucu ile katman kimliği iki ayrı alan ve iki ayrı
> hüküm; ikisini birleştiren tek bir "PASS" üretilmez · **(3)** katman kimliği yalnız kanıtla (API'nin istek kimliği yankısı); kenar /
> tünel / sağlayıcı adlandırılmaz · **(4)** ad içermeyen ayrı özet dosyası; public tablo yalnız ondan dolar · **(5)** yeni çıkış kodu 5
> (DEĞERLENDİRME GEREKİR) · **(6)** öz-test "ayırt edici girdi → ölçülen sınıf" biçiminde yeniden yazıldı; owner blokları iki kabukta
> sınanır. **R04'ten kalan şu kurallar artık GEÇERSİZDİR:** "ret vektöründe 403 = tamam", "katman `unknown` ise PASS düşmez",
> "`suspectAppOrigin403 > 0` ise PASS düşmez", "D-8 PASS = sonda çıkış 0 ve telefon 5/5". DEĞİŞMEYENLER: vektör listeleri (59 ret +
> 9 pozitif), kimlik bilgisi göndermeme, ham yol sadakati, `design` / `measured` ayrımı, `d8-staff-` dosya adı öneki. Canlı sonda
> **çalıştırılmadı**; bu revizyon GO, kapsam ya da kabul kararı **değildir** (bekleyen owner kararları §3b); pinler değişti (§7).
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
`--origin https://<public host>` ve zorunlu bir takma ad `--alias AD-<n>` alır (AD-1 = birincil ad); takma ad yoksa ya da biçime
uymuyorsa, ya da `--origin` / `--alias` yinelenmişse sonda koşmaz (kapı, çıkış 4). Çok adlı döngü ya da ikinci origin parametresi
**yoktur**. Sonda başka bir adın kanıtını okumaz (okuduğu tek dosya kendi kaynağıdır — SHA-256 için) ve var olan bir kanıt ya da özet
dosyasının üzerine yazmaz (kapı, çıkış 4). `--vantage <etiket>` owner'ın **beyan ettiği** koşum konumudur (ölçüm değildir).

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

**R05'te istek profiline eklenen tek şey:** her istekte tek kullanımlık bir `x-request-id` başlığı (kimlik bilgisi değildir; API'nin
kabul ettiği biçimde; her istekte yeni değer). İstek uygulamaya ulaşırsa bu değer o isteğin kimliği olur; uygulama o istekte 5xx
üretirse değer uygulamanın hata kaydına yazılır. Sondanın vektör listesindeki uçlarda başka bir etkisi kaynakta görülmedi (başlığı
yinelenme anahtarı olarak da okuyan bir iç yönetim denetleyicisi vardır; sondanın listesinde o uçlar yoktur). Bu istek profili canlı
sonda GO'sunun kapsamındadır (§3b).

**Ham request-target korunur:** istek `https.request({host, port, path, method, servername})` ile atılır; `path` vektördeki ham
dizedir (`/api/portal/./admin/...`, `%2F`, `?x=1` normalize edilmez). Öz-test S1-p bunu kenarın gördüğü `req.url` ile birebir
doğrular; URL-string ile istek atan kopya bu testte düşer.

### 1.1 İki ayrı değerlendirme: ret sonucu ve katman kimliği

Aynı durum kodunu birden çok katman üretebilir (403: kenar varsayılan reddi · sağlayıcı kuralı · uygulama; 404: tünel varsayılanı ·
web · API; 5xx: zincir hatası · uygulama). Bu yüzden sonda iki soruyu **ayrı alanlarda** yanıtlar ve ikisini tek bir "PASS"ta
birleştirmez.

**(1) Ret sonucu** — satırda `outcome`; yalnız durum kodundan türer, katman bu alana girmez:
`RET-403` (403 ile reddedildi) · `DORTYUZ-403-DISI` (403 dışı 4xx) · `HIZ-SINIRI-429` · `REDDEDILMEDI-2XX` · `YONLENDIRME-3XX` ·
`SUNUCU-HATASI-5XX` · `SONUC-YOK` (taşıma hatası; yalnız hata **sınıfı** `errorClass`: `AD-COZULMEDI` / `BAGLANTI` / `TLS` /
`ZAMAN-ASIMI` / `DIGER`) · `SINIFLANAMADI`. Hata iletisi metni ve yönlendirme hedefi kanıta yazılmaz.

**(2) Katman kimliği** — satırda `layerId`; **yalnız kanıtla**. Dışarıdan gösterilebilen tek imza API'nin istek kimliği yankısıdır:
sonda gönderdiği tek kullanımlık değerin yanıtta **aynen** dönüp dönmediğine bakar (`echo`: `ESLESTI` / `FARKLI-DEGER` / `YOK`).
Aynı değer dönerse o yanıtı API üretmiştir. Başlığın yalnız var olması (farklı değer) yankı **değildir**. `Server` başlığı, gövde
imzası, boş / dolu gövde **ipucudur** (`hints`, `layerHint`, `hintsOnly`; yalnız kısıtlı ham kanıtta) ve katman kimliğine girmez.
Kenar, tünel ya da sağlayıcı bu sondayla **hiçbir koşulda adlandırılamaz**; sonda adlandırmaz.

- **Kalibrasyon (aynı ad, aynı koşum):** API pozitiflerinin **tamamında** yankı eşleşmeli **ve** API öneki dışındaki hiçbir yanıtta
  (web pozitifleri dahil) kimlik başlığı bulunmamalıdır (ters kalibrasyon). Önek dışı bir yanıtta başlık görülürse başlık API'ye özgü
  değildir → kalibrasyon `GECERSIZ` → o koşumda **bütün** katman kimlikleri `OLCULEMEDI`. Kalibrasyon `VAR` değilse hiçbir satır
  adlandırılmaz ve "API değil" çıkarımı yapılmaz.
- **`UYGULAMA-API`:** kalibrasyon `VAR` + yankı `ESLESTI` (yol sınıfından bağımsız).
- **`API-DEGIL-CIKARIM`** yalnız bir **çıkarımdır** ve yalnız güvenle söylenebildiği yerde yapılır: kalibrasyon `VAR` + yanıtta
  başlık yok + istek ön uçuş (OPTIONS) değil + yol `API-KESIN`. Hangi üst katmanın yanıtladığı her durumda ölçülemez.
- **Yol sınıfı (`pathClass`):** `API-KESIN` = ham yol tam `/api` önekli ve normalleştirilecek bir yanı yok (yüzde dizisi, nokta
  segmenti, çift eğik çizgi, noktalı virgül, büyük harfli önek içermez; sorgu etkilemez) — API bu isteği işleseydi istek kimliği ara
  katmanı kesin çalışırdı. `API-BELIRSIZ` = ham ya da çözülmüş / sadeleştirilmiş biçimi API önekine düşen diğer her yol; çıkarım
  yapılmaz → `OLCULEMEDI` (örnekler: çift eğik çizgili yol API'de önek dışına düşer; çözülemeyen yüzde dizisinde ara katman çalışmaz;
  ikisinde de API yanıtı yankısız olur). `ONEK-DISI` = web yolu → `UYGULANAMAZ` (web'in imzası yok).
- **OPTIONS:** ön uçuş, istek kimliği ara katmanından önce yanıtlanır → API önekli yolda `OLCULEMEDI`.

**Bu kural KAYNAK OKUMASIDIR; izole prova bekliyor.** Dayanak: `apps/api/src/common/request-id.middleware.ts` (başlık adı, kabul edilen
biçim, gelen değer geçerliyse aynen yanıta yazılır), `app.module.ts` (ara katman `forRoutes('*')`), `main.ts` (genel önek `api`,
`enableCors`); kilit dosyasındaki Nest 10.4.20 / Express 4 sürümlerinin ara katmanı `/api` ve `/api/*` için kaydetmesi. Canlı sürümün
(R27, `1b758d29`) kaynağında ilk iki dosya `main` ile bayt bayt aynıdır; `main.ts` yalnız ters vekil ayarının yazım biçiminde farklıdır
(önek ve CORS aynı). Kenar şablonları R27 kaynak ağacında yoktur (yalnız `main`'de, "canlıya uygulanmadı" notuyla). Kuralın **gerçek API
+ şablon kenar ile izole provası yapılmadı**; öz-testteki sahte API bu kaynak okumasının modelidir, gerçek API değildir.
Yapılan tek ölçüm **çerçeve düzeyindedir** (2026-10-05; depo dışı kayıt, canlıya / veritabanına dokunmadan): kurulu Nest 10.4.20 +
Express 4.21.2 paketleri ve ürünün ara katman kaynağıyla kurulan küçük bir uygulamaya 68 vektör doğrudan gönderildi — ölçülen yankı
68/68 vektörde modelin öngörüsüyle uyumlu; "API değil" çıkarım koşulunu çürüten vektör 0 (düz `/api` yolları ve HEAD → yankı var;
OPTIONS → 204, yok; çift eğik çizgi → 404, yok; çözülemeyen yüzde dizisi → 400, yok; önek dışı → yok; uygulamanın ürettiği 403 / 503 →
var; biçime uymayan kimlik → farklı değer). Bu ölçüm gerçek API'nin tamamı (modüller, guard'lar) ve kenar değildir; izole prova
bekleyen iştir. Canlı zincirin başlığı değiştirmeden geçirdiği ancak koşumun kendi kalibrasyonuyla görülür.

**Gözlem → ret sonucu → katman kimliği → ad düzeyi ret hükmüne etkisi** (ret vektörleri):

| # | Gözlem | Ret sonucu | Katman kimliği | Ad düzeyi ret hükmüne etkisi |
|---|---|---|---|---|
| 1 | 403, yankı eşleşti | `RET-403` | `UYGULAMA-API` | **DEĞERLENDİRME GEREKİR (5) — OWNER KARARI BEKLİYOR**: kenar geçirmiş, uygulama reddetmiş demektir; bulgu mu sayılacağı, kabul mü edileceği kararı verilmedi (§3b) |
| 2 | 403, başlık yok, yol `API-KESIN`, OPTIONS değil | `RET-403` | `API-DEGIL-CIKARIM` | reddedildi; KAPALI'yı engellemez |
| 3 | 403, başlık yok, yol API öneki dışında | `RET-403` | `UYGULANAMAZ` | reddedildi; KAPALI'yı engellemez |
| 4 | 403, başlık yok, OPTIONS ya da yol `API-BELIRSIZ` | `RET-403` | `OLCULEMEDI` | reddedildi; KAPALI'yı engellemez |
| 5 | 403, kalibrasyon `YOK` / `GECERSIZ` | `RET-403` | `OLCULEMEDI` (bütün satırlar) | **DEĞERLENDİRME GEREKİR (5)**: API kaynaklı 403 denetimi bu koşumda yapılamadı |
| 6 | 403, kimlik başlığı var ama farklı değer | `RET-403` | `OLCULEMEDI` | **DEĞERLENDİRME GEREKİR (5)**: kaynak okumasıyla açıklanamayan gözlem |
| 7 | bütün istekler 403 (pozitifler dahil) | `RET-403` | `OLCULEMEDI` | **ÖLÇÜLEMEDİ (3)**: tekdüze ret — "personel kapalı, portal açık" gözlemi değildir |
| 8 | 403 dışı yanıt (3xx / 4xx / 429 / 5xx), yankı eşleşti | ilgili sınıf | `UYGULAMA-API` | **KAPALI DEĞİL (2)**: istek uygulamaya ulaştı |
| 9 | 3xx ya da 403 dışı 4xx, API'den geldiği kanıtsız | `YONLENDIRME-3XX` / `DORTYUZ-403-DISI` | çıkarım ya da `OLCULEMEDI` | **DEĞERLENDİRME GEREKİR (5)**: KAPALI sayılmaz, otomatik bulgu da sayılmaz (tünel varsayılanı da, kenarı geçen istek de aynı kodu verebilir) |
| 10 | 2xx (OPTIONS 204 dahil) | `REDDEDILMEDI-2XX` | yankı varsa `UYGULAMA-API` | **KAPALI DEĞİL (2)** |
| 11 | 5xx ya da 429, API'den geldiği kanıtsız | `SUNUCU-HATASI-5XX` / `HIZ-SINIRI-429` | çıkarım ya da `OLCULEMEDI` | **ÖLÇÜLEMEDİ (3)**: ret sayılmaz, bulgu da sayılmaz |
| 12 | taşıma hatası (ad çözülmedi / bağlantı / TLS / zaman aşımı) | `SONUC-YOK` + hata sınıfı | `SONUC-YOK` | **ÖLÇÜLEMEDİ (3)** |

Pozitif vektörler: beklenen kod + (API pozitifinde) yankı = kalibrasyon girdisi · pozitif **403** aldıysa ÖLÇÜLEMEDİ (3) · beklenmeyen ve
403 olmayan yanıt (ör. token'sız 200) **POZİTİF BULGU (2)** · API'den geldiği kanıtsız 5xx / 429 ya da taşıma hatası ÖLÇÜLEMEDİ (3).

**Ad düzeyinde iki ayrı hüküm** (kanıtta `nameVerdict { ret, layer }`):

- **RET HÜKMÜ** — öncelik sırasıyla ilk karşılanan: `KAPALI-DEGIL` (2) → `POZITIF-BULGU` (2) → `OLCULEMEDI` (3) →
  `DEGERLENDIRME-GEREKIR` (5) → `KAPALI` (0). `KAPALI` = bütün ret vektörleri 403, hiçbirinin API'den geldiği kanıtlı değil,
  pozitifler beklendiği gibi, kalibrasyon `VAR`; kayıt eki zorunludur: **"yalnız bu istek profili, bu konum, bu vektör kümesi için"**.
  Hükmün nedenleri (`reasons`) ayrı ayrı yazılır; sınıflanamayan her durum `OLCULEMEDI`'dir — hiçbir belirsiz durum `KAPALI` sayılmaz.
- **KATMAN HÜKMÜ** — yalnız `ADLANDIRILDI-API` / `ADLANDIRILAMADI` / `OLCULEMEDI`; **PASS / FAIL değeri almaz** ve çıkış kodunu
  etkilemez. "Ret `KAPALI` + katman `ADLANDIRILAMADI`" **olağan sonuçtur** (403'ü hangi üst katmanın ürettiği bu yöntemle
  gösterilemez); kabulü owner kararıdır (§3b).

**Çıkış kodu** yalnız ret hükmünden türer: **0** `KAPALI` · **2** `KAPALI-DEGIL` / `POZITIF-BULGU` · **3** `OLCULEMEDI` · **4** kapı
(origin https değil · TLS doğrulaması kapalı · takma ad / konum etiketi yok ya da geçersiz · parametre yinelenmiş · kanıt dosyası
zaten var · etiket ana makine adını içeriyor) · **5** `DEGERLENDIRME-GEREKIR` · **7** kanıt / özet yazılamadı. Çıkış 0 tek başına
"D-8 kapandı" demek **değildir** (§3).

**"Kimliksiz istekte uygulama 403 üretmez" bir genelleme değildir.** Bu, yalnız sondanın vektör listesindeki uçlar için kaynak
okumasıdır (çalışma zamanında ölçülmedi); uygulamanın başka uçları kimlik kontrolünden önce 403 üretebilir. Uygulamanın ürettiği 403
bu yüzden yukarıdaki tabloda ayrı satırdır (1) ve varsayımla değil yankı kanıtıyla sınıflanır.

**Tasarım kaydındaki tabloya eklenen sınıflar** (uygulama ayrıntısıdır; owner kararı değildir, §3b'deki kararların yerine geçmez):
kalibrasyon `VAR` değilken ret hükmü `KAPALI` verilmez (satır 5) · farklı değerli kimlik başlığı ayrı neden (satır 6) · 429 ayrı sınıf
(satır 8 / 11) · pozitif vektör bulgusu `KAPALI-DEGIL` ile karıştırılmaz (`POZITIF-BULGU`) · önek dışı **herhangi** bir yanıtta kimlik
başlığı kalibrasyonu `GECERSIZ` yapar · `API-BELIRSIZ` yol sınıfı.

**Adsız özet.** Sonda ham kanıtın (`<kanıt>.json`; ana makine adını içerir, **kısıtlı**, depoya girmez) yanına ad içermeyen ayrı bir
özet yazar (`<kanıt>.ozet.json`): takma ad, revizyon, sondanın kendi SHA-256'sı, vektör kümesi kimliği, yöntem kapsamı sayıları (beş yöntem
· HEAD n/3 · OPTIONS n/3 · varyant n/18), ret sonucu sayıları, hata sınıfı sayıları, katman kimliği sayıları, kalibrasyon, iki hüküm
ve nedenleri, zaman, çıkış kodu, beyan edilen konum etiketi, gönderilen başlık **adları**. İçermez: ad, hata metni, yönlendirme
hedefi, yol / yöntem düzeyinde bulgu, ipuçları. Sonda özeti yazmadan önce içinde ana makine adının geçmediğini kendisi denetler;
geçiyorsa yazmaz (etiket adı içeriyorsa istek atmadan durur). **Public tablo (§1b) yalnız bu özetten dolar ve public belgeye yalnız
bu özetin SHA-256'sı yazılır**; ham kanıtın özeti yazılmaz (ad düşük entropilidir; ham kanıt özeti adı doğrulamaya yarar).
**Vektör kümesi kimliği** (`vectorSetId`) vektör listesinden türetilir (sırayla "grup yöntem hamYol beklenenKodlar" satırlarının
SHA-256'sı): adlar arasında aynı listenin koşulduğunu gösterir (bu revizyonun değeri §7).

### 1a. İstek listesi — beklenen sonuç ve kenar geçirirse olası yan etki

Beklenen: her ret vektörü **403**. Aşağıdaki "kenar geçirirse" sütunu R27 kaynağından (`apps/api/src/modules/auth`,
`modules/portal`, `main.ts` global prefix `api`) türetilmiştir ve uygulamanın ne yapacağını anlatır; gözlemin **nasıl sınıflanacağı**
§1.1 tablosundadır (ör. API'nin yankılı 401 / 404 / 400 yanıtı ve her 2xx → KAPALI DEĞİL; web'in yankısız 404 / 405 yanıtı →
DEĞERLENDİRME GEREKİR).

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

Her ad **ayrı satırdır**; her satır yalnız o adın **kendi adsız özetinden** dolar. Bir adın sonucu başka bir ada taşınmaz; şablon ya
da izole ölçüm çıkarımları hiçbir satırın gerekçesi olamaz. Ortak / toplam hüküm satırı **yoktur**. Adlar public belgeye yazılmaz
(yalnız takma ad); ad ↔ takma ad eşlemesi kısıtlı kayıttadır.

| Takma ad | Sahiplik | Kapsam ve GO | Koşum (tarih · konum · sonda pini · vektör kümesi) | Ret sonucu sayıları | Yöntem kapsamı | Kalibrasyon | Katman kimliği sayıları | **RET HÜKMÜ** | **KATMAN HÜKMÜ** | Dış ağ beyanı | Adsız özet SHA-256 |
|---|---|---|---|---|---|---|---|---|---|---|---|
| **AD-1** (birincil ad) | birincil yayın adı — canlı yapılandırmadan okunur; sahiplik kanıtı ölçütü **owner kararı bekliyor** (§3b) | **GO YOK** | — | — | — | — | — | **ÖLÇÜLMEDİ** | **ÖLÇÜLMEDİ** | bu revizyon için YOK (2026-09-27 beyanı R27 öncesidir; ada bağlanmadı) | — |
| diğer yayın adları | satır yalnız sahipliği doğrulanınca açılır; **bugün doğrulanmış ek ad yok** | — | — | — | — | — | — | — | — | — | — |

Doldurma kuralları: hücreler özetteki alanlardan birebir alınır (`outcomeCounts.deny`, `coverage`, `calibration`, `layerCounts.deny`,
`nameVerdict.ret.value` + nedenler, `nameVerdict.layer.value`, `vantage`, `probeSha256`, `vectorSetId`) · özeti olmayan ad
**ÖLÇÜLMEDİ** kalır · bir adda farklı vektör kümesi koşulursa `vectorSetId` farklıdır ve o satırın kapsamı ayrıca yazılır · ret hükmü
`DEGERLENDIRME-GEREKIR` ise satıra "owner değerlendirmesi bekliyor" yazılır, hüküm yorumlanarak değiştirilmez · bulgu ayrıntısı (yol,
yöntem) public tabloya **yazılmaz**, kısıtlı kayıtta kalır.

### 1c. Öz-test (`scripts/d8-selftest.js`)

Canlıya dokunmaz; yalnız node çekirdek modülleri + openssl + iki PowerShell kabuğu. **Model:** gerçek TLS'li sahte kenar (şablonun 4
izin regex'i + admin reddi; karar gerçek Caddy yol temizliği modeliyle; arka uca ham yolu iletir) **+ sahte API yankısı** (başlık adı,
kabul biçimi, genel önek ürün kaynağından çalışma anında okunur; ara katman yalnız Express'in `/api` ve `/api/*` için ürettiği
ifadelerle eşleşen ham yolda çalışır; OPTIONS ön uçuşu ve çözülemeyen yüzde dizisi yankısızdır). Sahte uç her isteğe ne yanıt verdiğini
(üreten katman, durum, yankı) kaydeder; kalemler sondanın sınıfını bu **zemin gerçeğiyle** karşılaştırır. Her kalem **ayırt edici
girdi → sondanın ölçtüğü sınıf** biçimindedir. Port `D8_SELFTEST_PORT` ile değişir (varsayılan 8457; 8080 / 3002 / 5432 / 5447–5449
reddedilir); `D8_SELFTEST_PROBE` başka bir sonda dosyasını sınar (negatif ayna / mutasyon). Çıkış: 0 hepsi PASS · 1 en az bir FAIL ·
2 FAIL yok ama ölçülemeyen kalem var · 4 port kapısı.

| Kalem | Girdi → ölçülen sınıf |
|---|---|
| K-SRC · K-PORT | ürün kaynağındaki dayanaklar okunabildi · öz-test port kapısı |
| S1 · K-1 · L-1 | sağlıklı kenar → çıkış 0, RET `KAPALI` + KATMAN `ADLANDIRILAMADI` iki ayrı satır, birleşik PASS yok · 6 API pozitifi yankılı + 3 web pozitifi başlıksız → kalibrasyon `VAR` · "API değil" çıkarımı yalnız düz `/api` yolunda; OPTIONS, çift eğik çizgi, çözülemeyen yüzde dizisi → `OLCULEMEDI`; web yolu → `UYGULANAMAZ` |
| S1-p · S1-c · Y-1 · S7 | ham yol birebir (68/68) · kimlik başlığı yok, gövde 0 / 2 bayt · istek kimliği 68 istekte var, ürün kaynağındaki biçime uyar, tek kullanımlık · 3 HEAD + 3 OPTIONS + 18 varyant ve özetteki yöntem kapsamı |
| S2 · N-5 | bozuk kenar (ikinci ad AD-2) → çıkış 2 `KAPALI-DEGIL`; 20 sızan istek: yankılı 401 / 404 → `UYGULAMA-API`, OPTIONS 204 → reddedilmedi, çift eğik çizgili yankısız 404 → API'den geldiği kanıtsız · AD-2 koşumu AD-1'in dosyalarını değiştirmez; sonda kendi kaynağından başka dosya okumaz |
| S3 · S3-b · S3-c | sağlayıcı imzası · başlıksız boş 403 · sağlayıcı `Server` + boş gövde → ipuçları değişir, katman kimliği ve iki hüküm S1 ile aynı kalır |
| **S3-dN · S3-dY** | gövdesi dolu ama **yankısız** 403 (kenar üretir) → çıkış 0 · **yankılı** 403 (API üretir) → çıkış 5 `DEGERLENDIRME-GEREKIR` + "owner kararı bekliyor"; ne `KAPALI` ne `KAPALI-DEGIL`. (R04'ün S3-d kalemi "uygulama-403 taklidinde çıkış 0" bekliyordu; iki ayrı girdiye bölündü.) |
| K-2 · K-3 · K-4 | web yanıtında yankı → `GECERSIZ`, 68 satırın hepsi `OLCULEMEDI`, çıkış 5 · API pozitifleri yankısız → kalibrasyon `YOK`, çıkarım yok, çıkış 5 · biçime uymayan kimlik (API kendi değerini üretir) → `FARKLI-DEGER`, çıkış 5 |
| F-1 · F-2 | farklı değerli başlık bütün ret yanıtlarında → yankı sayılmaz, `GECERSIZ`, çıkış 5, yanıt değeri kanıta yazılmaz · yalnız API önekli ret yanıtlarında → kalibrasyon `VAR` ama o satırlar `OLCULEMEDI`, çıkış 5 |
| L-2 · L-2b · L-3 · L-4 · L-5 · L-6 | yankılı 5xx → 2 · yankılı 429 → 2 · yankısız 5xx → 3 · yankısız 404 → 5 · yönlendirme → 5 (hedef kanıta yazılmaz) · yankısız 429 → 3 |
| U-1 · P-1 | tekdüze 403 (68/68) → çıkış 3; ret vektörü sayıları S1 ile aynı ama hüküm `KAPALI` değil · pozitifte token'sız 200 → çıkış 2 `POZITIF-BULGU` |
| G-1 | kenar her şeyi geçirir: API'nin ürettiği hiçbir yanıt "API değil" diye sınıflanmaz; yankısız API yanıtları `OLCULEMEDI`; yankı varsa yol sınıfından bağımsız `UYGULAMA-API` |
| N-1 … N-4 · O-1 | takma ad kapısı · yinelenen `--origin` / `--alias` · konum etiketi kapısı · var olan kanıtın üzerine yazmama · etiket ana makine adını içeriyorsa istek atmadan durma |
| O-2 · O-3 · V-1 · V-2 | adsız özette ad / yol / hata metni / yönlendirme hedefi / satır düzeyi bulgu yok, alan kümesi sabit · özet SHA-256'sı bağımsız hesapla eşleşir · vektör kümesi kimliği kaynaktan bağımsız hesapla eşleşir · bir vektörü değişen kopyada kimlik değişir |
| S4 · S4-b · S5-a…d · S6 | kenar kapalı → 3 (`BAGLANTI`) · doğrulanamayan sertifika → 3 (`TLS`) · kapılar 4 / 4 / 7 / 4 · `--phone-list` ayrı çağrı (istek atmaz) |
| T-1 … T-4 · D-1 · B-0 | statik: pozitif liste · seçenek nesnesi, `ifPassed`, katman ve hüküm işlevleri ipucu okumaz · D8-E1/E2 kaynak kapsamı · "karar bekliyor" eşlemesi tek satırda · pinler · belgedeki iki blok tek satır, yalnız ASCII, yalnız AD-1 |
| **B-1 … B-T2** (her biri iki kabukta) | belgeden çıkarılan blok metni, yalnız test için `.env` yolu / sonda yolu / pin ikamesi ve sahte kullanıcı köküyle, sahte `.env` ve sahte kenara karşı: olağan akış (çıkış 0, özet SHA'sı) · satır sayısı 0 ve 2 → sonda hiç koşmaz · https olmayan / yollu değer → koşmaz · pin uyuşmazlığı → koşmaz · bozuk kenarda blok çıkış 2'yi aktarır · telefon listesi bloğu istek atmaz · telefon bloğunda pin uyuşmazlığı. Kabuk yoksa kalem **ÖLÇÜLEMEDİ**'dir (geçti değil) |

**Son koşu (R05 baytları, 2026-10-05; Windows, node 24.18.0, Windows PowerShell 5.1 + pwsh 7.6):** 66 kalem — **PASS 66 · FAIL 0 ·
ÖLÇÜLEMEDİ 0**, çıkış 0 (iki kabuktaki 14 blok kalemi dahil).

**Negatif ayna:** R04 sondası (`origin/main` baytları, `E150EEDA…514C`) bu öz-testte **20 / 66** (çıkış 1). Düşen 46 kalem: S1, K-1,
L-1, S1-c, Y-1, S7, S2, N-5, S3, S3-b, S3-c, S3-dN, S3-dY, K-2, K-3, K-4, F-1, F-2, L-2, L-2b, L-3, L-4, L-5, L-6, U-1, P-1, G-1, N-1,
N-2, N-3, N-4, O-1, S6, O-2, O-3, V-1, V-2, T-2, T-4, D-1, B-1 ve B-5 (iki kabukta), S4-b, S4 — R04 sondası takma ad almaz, yankı
ölçmez, iki hüküm ve adsız özet üretmez. Geçen 20 kalem: K-SRC, K-PORT, S1-p, S5-a…d, T-1, T-3, B-0 ve bloğun kendi kapıları (B-2, B-3,
B-4, B-T, B-T2 iki kabukta) — bunlar sondanın yeni kurallarına değil vektör listesine, eski kapılara ve blok metnine bakar.

**Mutasyon provası:** R05 sondasının tek bir kuralı bozulmuş **19 kopyasının 19'u yakalandı**. "Yakalandı" = öz-testin 66 kalemi koştu
**ve** mutasyonla ilgili kalem FAIL oldu (öz-test çıkışının ≠ 0 olması tek başına sayılmadı; her alternatif sondada düşen pin kalemi
D-1 sayılmadı):

| Mutasyon | FAIL olan ilgili kalem |
|---|---|
| yankısız yanıtı API say | S1, L-1, S3-dN, G-1 |
| farklı değerli başlığı yankı say | K-4, F-1, F-2 |
| tekdüze 403'ü `KAPALI` say | U-1 (mutant çıkış 0 verdi) |
| "API değil" çıkarımını API önekine düşen her yolda yap | L-1, G-1 |
| "API değil" çıkarımını OPTIONS'ta da yap | L-1, G-1 |
| API'nin ürettiği yankılı 403'ü hükme katma | S3-dY, T-4 |
| kalibrasyon yokken `KAPALI` ver | K-2, K-3 |
| ters kalibrasyonu yok say | K-2, F-1 |
| ham yolu göndermeden önce normalleştir | S1-p, T-2 |
| adsız özete adı yaz, sondanın ad denetimini kapat | O-2 |
| adsız özete adı yaz (ad denetimi açık) | S1, O-2, O-3 — sonda özeti yazmadı, çıkış 7 |
| takma ad kapısını kaldır | N-1 |
| API'den geldiği kanıtsız 5xx'i ret say | L-3 |
| var olan kanıtın üzerine yaz | N-4 |
| yankıyla kanıtlı 403 dışı yanıtı bulgu sayma | S2, L-2, L-2b (hüküm kapalı biçimde `OLCULEMEDI`'ye düştü) |
| API'den geldiği kanıtsız 404'ü ret say | L-4 |
| pozitif vektördeki beklenmeyen yanıtı yok say | P-1 |
| taşıma hatasında hata iletisini kanıta yaz | S4, S4-b |
| yönlendirme hedefini kanıta yaz | L-5 |

**Kabuk yokluğu provası:** kabuk adı var olmayan bir yürütülebilire çevrildiğinde (iki kabuk için ayrı ayrı denendi) o kabuğun 7
kalemi ÖLÇÜLEMEDİ oldu ve öz-test çıkışı 2 verdi (0 değil; 59 PASS · 0 FAIL · 7 ÖLÇÜLEMEDİ).

**Öz-testin ölçmediği:** özet yazımından hemen önceki ikinci ad denetimi dürüst girdiyle tetiklenemez (yalnız mutasyonla gösterildi) ·
gerçek API ve gerçek kenar (§1.1: izole prova bekliyor) · canlı zincirin başlığı geçirip geçirmediği. Günlükler depo dışındadır
(`HY_R27_AGENT_EVIDENCE\r04\d8-hazirlik\r05\`). Önceki turların kanıtları (R04 `r04\d8-probe-r02\`; R03 `extacc-d8-r01-is3-fix\`,
`extacc-d8-r01-is3\`) korunur.

### 1d. Owner blokları — yalnız AD-1 (canlıda ÇALIŞTIRILMADI)

**Bu paket revizyonunda canlı sonda çalıştırılmadı.** Koşum, owner'ın canlı sonda kapsamı kararı ve **ad başına GO**'sundan sonra, kayıt
sahibinin penceresinde yapılır (§3b). Blok **yalnız AD-1 (birincil ad)** içindir; başka ad için blok **yazılmamıştır** (sahiplik
ölçütü ve ad başına GO owner kararıdır). Dış origin yer tutucu değildir: blok onu canlı yapılandırmadan (`.env`
`PUBLIC_PORTAL_BASE_URL`; tek satır, salt okuma, D-5/D-6/D-7 bloklarıyla aynı kaynak) okur, https / yolsuz origin biçim kapısından
geçirir ve sondanın pinini doğrular; kapılardan biri tutmazsa sonda hiç koşmaz. Kanıt kökü kullanıcı profiline görelidir (public belgeye
canlı alan adı ve kullanıcı yolu yazılmaz). Blok mantık taşımaz (sınıflama sondadadır): takma adı ve beyan edilen konum etiketini
verir, sondanın çıkış kodunu ve **adsız özetin SHA-256'sını** yazdırır.

Ölçüm (normal pencere):
```powershell
& { $ErrorActionPreference='Stop'; $e='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\.env'; $l=@([IO.File]::ReadAllLines($e) | Where-Object { $_ -match '^\s*PUBLIC_PORTAL_BASE_URL\s*=' }); if($l.Count -ne 1){ throw 'PUBLIC_PORTAL_BASE_URL satiri 1 degil - DUR' }; $ExpBaseUrl=($l[0] -replace '^\s*PUBLIC_PORTAL_BASE_URL\s*=\s*','').Trim().Trim('"').Trim("'"); if($ExpBaseUrl -cnotmatch '^https://[A-Za-z0-9.-]+(:\d+)?$'){ throw 'PUBLIC_PORTAL_BASE_URL https/yolsuz origin degil - DUR' }; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-extacc-d8-staff-surface-r01\scripts\d8-staff-surface-probe.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'DDC882FFCEF71CE20A8CD8FA583BD2BC392266A99394B6860AF80C233F75A876'){ throw 'D8 SONDA SHA UYUSMUYOR - DUR' }; $o=Join-Path $env:USERPROFILE ('Documents\CLIENT-EVIDENCE-20260911\extacc-d8-AD-1-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'); New-Item -ItemType Directory -Force -Path $o | Out-Null; & node $f --alias AD-1 --vantage canli-ana-makine-cikisi --origin $ExpBaseUrl --out "$o\d8-probe.json"; $c=$LASTEXITCODE; 'D8 AD-1 cikis=' + $c; $s="$o\d8-probe.ozet.json"; if(Test-Path -LiteralPath $s){ 'D8 AD-1 adsiz ozet SHA256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $s).Hash } else { 'D8 AD-1 adsiz ozet YOK' } }
```

Telefon listesi (ayrı çağrı; istek atmaz, kanıt yazmaz; ölçüm bloğu listeyi yazdırmaz):
```powershell
& { $ErrorActionPreference='Stop'; $e='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\.env'; $l=@([IO.File]::ReadAllLines($e) | Where-Object { $_ -match '^\s*PUBLIC_PORTAL_BASE_URL\s*=' }); if($l.Count -ne 1){ throw 'PUBLIC_PORTAL_BASE_URL satiri 1 degil - DUR' }; $ExpBaseUrl=($l[0] -replace '^\s*PUBLIC_PORTAL_BASE_URL\s*=\s*','').Trim().Trim('"').Trim("'"); if($ExpBaseUrl -cnotmatch '^https://[A-Za-z0-9.-]+(:\d+)?$'){ throw 'PUBLIC_PORTAL_BASE_URL https/yolsuz origin degil - DUR' }; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-extacc-d8-staff-surface-r01\scripts\d8-staff-surface-probe.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'DDC882FFCEF71CE20A8CD8FA583BD2BC392266A99394B6860AF80C233F75A876'){ throw 'D8 SONDA SHA UYUSMUYOR - DUR' }; & node $f --alias AD-1 --origin $ExpBaseUrl --phone-list; 'D8 AD-1 telefon listesi cikis=' + $LASTEXITCODE }
```

Konum etiketi `canli-ana-makine-cikisi` bir **beyandır**: blok canlı ana makinede koşar ve istek o makinenin çıkışından gider; sonda
konumu ölçmez. Dış ağ ayağı yalnız telefon beyanıdır (§2).

## 2. D-8 telefon adımı (owner beyanı; makine ölçümü değildir)

Sonda `--phone-list` ile (ayrı çağrı; §1d ikinci blok) 5 adres yazar (`/auth/login`, `/`, `/api/auth/me`,
`/api/portal/admin/documents/pending`, `/api/cases`). Telefonda (Wi-Fi kapalı, mobil veri, gizli sekme) her adres için: **E** =
hata/erişim engellendi · **S** = sayfa/veri açıldı · **?**. Beyan `owner-declaration-d8.json` olarak ayrı dosyaya elle yazılır (sonda
yazmaz) ve **hangi ad için** verildiğini takma adla taşır. S = ürün/kenar bulgusu adayı. Beyanın her ad için ayrı mı alınacağı
**owner kararıdır** (§3b); karar verilene kadar bir adın beyanı başka bir adın satırına yazılmaz.

## 3. D-8 kapanış tanımı — ad başına, iki ayrı hükümle

D-8 **ad başına** değerlendirilir; "D-8 PASS" diye tek bir hüküm **yoktur** ve bir adın sonucu başka bir ad için söylenmez. Bir adın
satırı şu dört şey **ayrı ayrı** yazılarak kapanır; hiçbiri diğerinin yerine geçmez:

1. **Ret hükmü** `KAPALI` (çıkış 0) ve kayıt eki: "yalnız bu istek profili, bu konum, bu vektör kümesi için". `OLCULEMEDI` (3) ya da
   `DEGERLENDIRME-GEREKIR` (5) kapanış **değildir**; `KAPALI-DEGIL` / `POZITIF-BULGU` (2) bulgudur.
2. **Katman hükmü** ayrı satırda, olduğu gibi: `ADLANDIRILDI-API` / `ADLANDIRILAMADI` / `OLCULEMEDI`. PASS / FAIL değeri almaz. "Ret
   `KAPALI` + katman `ADLANDIRILAMADI`" olağan sonuçtur; **kabulü owner kararıdır** — sonda ya da bu belge o kabulü vermez.
3. **Dış ağ beyanı** (telefon; §2) — makine ölçümü değildir; ayrı dosyada, takma adla.
4. **Owner kabulü** — o ad için, yukarıdaki üç kayıt görülerek.

Kurallar:
- Ölçülemeyen kontrol PASS sayılmaz; kanıt yoksa satır **ÖLÇÜLMEDİ** / `OLCULEMEDI` kalır. İpucu (`hints`, `layerHint`) katman kimliği
  diye raporlanmaz.
- Kanıttaki `measured.credentialHeaderRequests` 0 ve `measured.nonEmptyBodyRequests` 0 değilse koşum kanıt olarak KABUL EDİLMEZ (sonda
  beklenmeyen bir şey göndermiştir).
- Özetteki `probeSha256` §7 pinine, `vectorSetId` §7 değerine eşit değilse satır bu revizyonun ölçümü sayılmaz.
- Bulgu ve değerlendirme gerektiren satırlar (yol, yöntem, durum) **kısıtlı kayda** alınır; public PR'a yol / yöntem ayrıntısı yazılmaz.
  `POST /api/auth/login` uygulamaya ulaştıysa personel giriş sayacı +1 yan etkisi de kayda yazılır (tek istek; blok üretmez).
- Bu sonda sunucunun kendi çıkışından koşar; SEC-API-BIND-01 açıkken D-8 sonucu ayrıca "dışarıdan erişilemez" diye genellenmez.

### 3b. BEKLEYEN OWNER KARARLARI (hiçbiri verilmedi; bu belge hiçbirini vermiş sayılmaz)

| # | Karar | Neden gerekli | Bu revizyondaki durum |
|---|---|---|---|
| 1 | **Sahiplik kanıtı ölçütü** — hangi kanıt bir adı "sahipliği doğrulanmış" yapar | owner talimatı ek adları bu koşula bağlıyor; bir adın yapılandırmada yazılı olması sahiplik değildir | ölçüt tanımlı değil; kodda sahiplik kapısı **yok** (biçimsel bir "alan dolu mu" kapısı geçiş dikte ederdi); §1b'de ek ad satırı açılmadı |
| 2 | **API'nin ürettiği 403'ün sayılışı** — yankıyla kanıtlı 403 bulgu mu sayılsın, kabul mü edilsin | 403 "reddedildi" demektir ama isteğin kenarı geçip uygulamaya ulaştığını da gösterir | kodda **karar bekliyor**: çıkış 5, `DEGERLENDIRME-GEREKIR`, `pendingOwnerDecision`; ne `KAPALI` ne otomatik bulgu. Eşleme sondada tek satırdadır (`API_KAYNAKLI_403_HUKMU`); karar gelince yalnız o satır değişir |
| 3 | **Canlı sonda kapsamı ve ad başına GO** — hangi adlar, hangi vektör kümesi, hangi pencere | hüküm yalnız koşulan ada verilir; 68 istek × ad; istek profili her istekte tek kullanımlık kimlik başlığı içerir | GO yok; kapsam kesinleşmedi; blok yalnız AD-1 için yazıldı ve çalıştırılmadı |
| 4 | **"Ret `KAPALI` + katman `ADLANDIRILAMADI`" kabulü** | reddeden üst katman bu yöntemle adlandırılamaz; kenara işaret başlığı eklemek ya da kenar günlüğü okumak canlı değişiklik / canlı okumadır ve kapsam dışıdır | iki hüküm ayrı yazılır; kabul verilmedi |
| 5 | **Telefon beyanı ad başına mı** | kapanış tanımı dış ağ beyanı ister; mevcut tek beyan R27 öncesidir ve ada bağlı değildir | karar yok; §1b'de "dış ağ beyanı" sütunu ad başınadır ve boştur |

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

`d8-staff-surface-probe.js` `DDC882FFCEF71CE20A8CD8FA583BD2BC392266A99394B6860AF80C233F75A876` · `d8-selftest.js` `65CA8A4F98B52C28EF03DF2A828C369EE45BD6DCD0CDB1D05EB65B4FF5D55757`.
Vektör kümesi kimliği (59 ret + 9 pozitif; vektörler R04 ile aynı): `83AD1AB6DF5E52FD4FD028C5C6A411CDD9D22BCAB53194ABD9915D47920FF0F2`.
(R05, 2026-10-05: ad başına koşum · ret sonucu ve katman kimliği iki ayrı hüküm · adsız özet · çıkış kodu 5 · öz-test 66 kalem;
canlıda koşulmadı. Önceki pinler: R01 ilk `DD6448A5…` / `E50EAE0C…`; birinci tur düzeltme `51B78C3B…` / `F9E9BD65…` [13/13]; ikinci tur
`6400223…` / `A311CF00…` [15/15]; R27-R03 katman ipucu `D5FA37D1…` / `AD7B0759…` [15/15, 2026-09-30]; R04 D8-E1/E2 `E150EEDA…` /
`45FC0B5E…` [17/17, 2026-10-03].)

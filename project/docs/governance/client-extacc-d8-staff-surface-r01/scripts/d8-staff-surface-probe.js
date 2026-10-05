'use strict';
/*
 * EXTACC D-8 R05 — PERSONEL YÜZEYİ DIŞARIDAN KAPALI: AD BAŞINA makine ölçümü (owner PC'sinden, gerçek alan adı, gerçek TLS).
 *
 * BİR SÜREÇ = BİR AD = BİR KANIT. Sonda tek `--origin` ve zorunlu bir ad kimliği (`--alias AD-<n>`; AD-1 = birincil ad) alır; çok adlı
 *            döngü ya da ikinci origin YOKTUR; başka bir adın kanıtını OKUMAZ ve var olan bir kanıt dosyasının ÜZERİNE YAZMAZ. Bir adın
 *            sonucu başka bir ada taşınmaz: her ad ayrı süreç, ayrı dosya. Okuduğu dosyalar: kendi kaynağı (SHA-256 için) ve — yalnız
 *            AD-1 dışındaki adlarda — kapsam yetkisi kaydı ile o kaydın gösterdiği kanıt dosyaları (yalnız SHA-256 için; içerik
 *            yorumlanmaz, hiçbir yere yazılmaz).
 * KAPSAM YETKİSİ KAPISI (owner kararı 2026-10-05): birincil ad (AD-1) dışındaki her ad kimliği için sonda, kısıtlı bir "kapsam yetkisi
 *            kaydı" (`--scope-record <dosya>`) olmadan KOŞMAZ — istek atılmaz, çıkış 4, ileti tam olarak
 *            "KOŞULMADI — kapsam yetkisi doğrulanmadı" (+ ad / yol / özet değeri içermeyen neden SINIFI). Kayıt (JSON):
 *              { "record": "EXTACC-D8-SCOPE-AUTHORIZATION", "nameAlias": "AD-<n>", "originHost": "<ana makine>",
 *                "items": [ { "type": "SAGLAYICI-HESABI-KAYDI", "file": "<yol>", "sha256": "<64 onaltılık>", "date": "YYYY-AA-GG" },
 *                           { "type": "DNS-ZINCIRI",            "file": "<yol>", "sha256": "<64 onaltılık>", "date": "YYYY-AA-GG" } ] }
 *            Sonda şunları ÖLÇER (yalnız "alan dolu mu" değil): ad kimliği `--alias` ile aynı · `originHost`, `--origin` ana makinesiyle
 *            BİREBİR aynı (büyük / küçük harf dışında; alt alan, önek, sondaki nokta eşleşme DEĞİLDİR) · iki kanıt kalemi de VAR:
 *            (i) yetkili sağlayıcı hesabındaki bölge / özel ad kaydı, (ii) DNS zinciri · her kalemin dosyası VAR, boş değil ve
 *            SHA-256'sı kayıttakiyle AYNI · tarih geçerli ve gelecekte değil · iki kalem aynı dosyayı / aynı özeti göstermiyor.
 *            `TUNEL-KAYDI` türü tanınır ama tek başına YETMEZ (yalnız tünel kaydı sunulmuşsa RET). Göreli dosya yolu kaydın dizinine
 *            göre çözülür. Kayıt ve kanıt dosyaları KISITLIDIR (depoya girmez): ham kanıta ve adsız özete yalnız DURUM + kalem TÜRLERİ
 *            yazılır; ad, yol, özet değeri, tarih yazılmaz. Sonda kanıtın İÇERİĞİNİ yorumlamaz (sahipliği kendisi doğrulamaz);
 *            içeriğin yeterliliği kayıt sahibinin incelemesidir. AD-1 için kapı yoktur ve `--scope-record` verilmez (birincil adı
 *            owner bloğu canlı yapılandırmadan okur). SINIR: sonda AD-1 ile koşulan adın gerçekten birincil ad olduğunu ÖLÇEMEZ.
 * NE ÖLÇER : izin listesi DIŞINDAKİ (yöntem, yol) çiftlerine verilen yanıt (59 ret vektörü: personel sayfaları, personel API'si,
 *            /api/portal/admin/*, izinli yollarda yanlış yöntem, HEAD/OPTIONS [D8-E1], 18 kodlama/normalizasyon varyantı [D8-E2];
 *            HAM yol korunur) ve 9 pozitif kontrol (3 sayfa 200, 6 API 401).
 *
 * AD DÜZEYİNDE ÜÇ AYRI ALAN + POZİTİF KONTROL (owner kararları 2026-10-05). Her alan YALNIZ `PASS` / `FAIL` / `OLCULEMEYEN` alır; alanlar
 * birbirinin yerine geçmez; birleşik tek "PASS" ya da "D-8 PASS" ÜRETİLMEZ. Kanıtta `nameVerdict { httpReject, edgeBlocking,
 * layerVerification, positiveControl }`; her alanda `value` + nedenler (`reasons`).
 *   (a) HTTP / RET SONUCU (`httpReject`) — YALNIZ durum kodu ölçütü (yalnız ret vektörleri):
 *         PASS         bütün ret vektörleri 403 (sınama işaretli 403 de durum kodu olarak 403'tür; kenar hükmü (b)'dedir)
 *         FAIL         en az bir ret vektörüne DOĞRULANMIŞ başka bir HTTP yanıtı geldi — hangi kod olursa olsun (2xx · 3xx · 403 dışı
 *                      4xx · 429 · 5xx · sınıflanamayan kod); hangi katmanın ürettiği bu alana GİRMEZ
 *         OLCULEMEYEN  FAIL yok ama yanıt alınamayan ret vektörü var (taşıma hatası)
 *   (b) KENAR ENGELLEME SONUCU (`edgeBlocking`):
 *         FAIL         engellenmesi gereken bir isteğin API'YE ULAŞTIĞI API'ye ÖZGÜ kanıtla gösterildi — API'nin o isteğe 403 vermesi
 *                      bunu KAPATMAZ (kenarda engellenmesi gereken istek API'ye ulaşmıştır) · YA DA ret vektörü hiç reddedilmedi (2xx)
 *         OLCULEMEYEN  FAIL yok ve şunlardan en az biri var: kalibrasyon eksik / geçersiz · sınama (challenge) ya da tanınmayan azaltım
 *                      işaretli 403 (durum kodu eşleşir ama hedeflenen erişim kuralının uygulandığını KANITLAMAZ) · ret-403 dışındaki
 *                      bir yanıtta azaltım işareti · pozitifler beklendiği gibi değil (tekdüze 403 dahil) · yanıt alınamayan vektör ·
 *                      durum kodu ölçütü PASS değil ama API'ye ulaşma kanıtı da yok · ret yanıtında katmanı belirlenemeyen kimlik
 *                      başlığı (yansıma / yabancı kimlik)
 *         PASS         bunların HİÇBİRİ yok. Kayıt eki zorunludur (`scope`): yalnız bu istek profili, bu konum, bu vektör kümesi için +
 *                      varsayımlar. PASS "reddi kenar üretti" kanıtı DEĞİLDİR; reddeden katman (c)'dedir.
 *         Kalibrasyon eksikliği somut olumsuz kanıtı SİLMEZ: kalibrasyon eksikken / yansıtan katman görülmüşken de API'ye özgü kanıt
 *         FAIL verir. Kalibrasyon eksikken "kapalı" (PASS) hükmü VERİLMEZ.
 *   (c) KATMAN DOĞRULAMASI (`layerVerification`) — kanıtın desteklemediği katman kesinliği REDDEDİLİR:
 *         FAIL         bir ret satırını API'nin yanıtladığı kanıtlı
 *         PASS         YALNIZ bütün ret satırlarında yanıtlayan katmanın API OLMADIĞI gösterilebiliyorsa. Bu yöntemle doğrulanamayan
 *                      satır (ön uçuş · yolu belirsiz · web yolu) varken PASS YAZILMAZ — bugünkü vektör kümesi böyle satırlar içerir.
 *         OLCULEMEYEN  diğer her durum + kapsam sayısı (`coverage`: kaç ret satırında "API değil" gösterildi · kaç satır API kanıtlı ·
 *                      kaç satır ölçülemez ve neden sınıfı). Kenar / tünel / sağlayıcı bu sondayla HİÇBİR koşulda adlandırılmaz.
 *   POZİTİF KONTROL (`positiveControl`) — API'ye geçmesine İZİN VERİLEN yollar; (a)–(c) kurallarına KARIŞTIRILMAZ:
 *         PASS dokuz pozitifin hepsi beklenen kodu verdi · FAIL beklenmeyen ve 403 olmayan yanıt (ör. token'sız 200; web pozitifinde
 *         3xx / 404) = bulgu · OLCULEMEYEN pozitif reddedildi (403) / yanıtsız / API'den geldiği kanıtsız 5xx · 429 · sınıflanamayan kod.
 *
 * SATIR DÜZEYİ: `outcome` (durum kodu sınıfı): RET-403 · SINAMA-ISARETLI-403 · TANINMAYAN-AZALTIM-ISARETLI-403 · DORTYUZ-403-DISI ·
 *       HIZ-SINIRI-429 · REDDEDILMEDI-2XX · YONLENDIRME-3XX · SUNUCU-HATASI-5XX · SONUC-YOK (taşıma hatası; yalnız `errorClass`:
 *       AD-COZULMEDI / BAGLANTI / TLS / ZAMAN-ASIMI / DIGER — hata İLETİSİ ve yönlendirme HEDEFİ kanıta yazılmaz) · SINIFLANAMADI.
 *       AZALTIM İŞARETİ (sağlayıcının yanıt başlığı; satırda `mitigationMark`: YOK / SINAMA / TANINMAYAN — başlığın DEĞERİ kanıta
 *       yazılmaz): tanınan sınama (challenge) değeri virgül / boşlukla ayrılmış listenin ÖGESİ olarak ve harf duyarsız aranır (iki ayrı
 *       başlık satırı tek listedir); başlık VAR ama değer tanınmıyorsa (boş değer dahil) TANINMAYAN. İşaret yalnız kenar engelleme
 *       hükmünü DÜŞÜRÜR (var olan hiçbir işaret PASS'a düşmez); durum kodu ölçütünü ve bir bulguyu DEĞİŞTİRMEZ; katmana GİRMEZ.
 *       Yalnız bilinen başlık okunur; işaretsiz bir sınama yanıtı bu sondayla ayırt edilemez.
 *
 * API'YE ÖZGÜ KANIT — İSTEK KİMLİĞİ PROTOKOLÜ (kaynak: apps/api/src/common/request-id.middleware.ts). API, gelen `x-request-id` değerini
 * kabul ettiği biçimdeyse yanıta AYNEN geri yazar; kabul ETMEDİĞİ biçimdeyse ATAR ve YENİ bir kimlik üretir (`randomUUID()`).
 * İsteğin başlığını yanıta yansıtan SIRADAN bir aracı katman birinci davranışı taklit eder; ikincisini üretemez. Bu yüzden:
 *   GÖNDERİLEN BİÇİM (`sent.requestIdForm`; her istekte tek kullanımlık değer):
 *     · ret vektörlerinin HEPSİ           → GECERSIZ-BICIM (API'nin kabul etmediği biçim)
 *     · API pozitifleri (sınıf içi sırayla) → GECERLI-BICIM, GECERSIZ-BICIM, GECERLI-BICIM, … (bugün 3 + 3)
 *     · web pozitifleri (sınıf içi sırayla) → GECERLI-BICIM, GECERSIZ-BICIM, GECERLI-BICIM (bugün 2 + 1)
 *   GÖZLEM (`idObs`): YOK · AYNEN (gönderilen değer geri döndü) · YENI-KIMLIK (farklı değer, API'nin ürettiği biçimde) · BASKA-DEGER ·
 *     SONUC-YOK. Yanıt başlığının DEĞERİ kanıta yazılmaz.
 *   ANLAM (`idSignal` = gözlem × gönderilen biçim):
 *     · DEGISTIRME        GECERSIZ-BICIM gönderildi, YENI-KIMLIK döndü — API'nin ikinci davranışı; yansıtan katman bunu ÜRETEMEZ
 *     · AYNEN-GERI-YAZMA  GECERLI-BICIM gönderildi, AYNEN döndü — API'nin birinci davranışı; yansıtan katman da aynısını üretir
 *                         (tek başına API kanıtı DEĞİLDİR; yalnız kalibrasyon girdisidir)
 *     · YANSIMA           GECERSIZ-BICIM gönderildi, AYNEN döndü — API bunu üretemez: YANSITAN KATMAN GÖSTERGESİ (API kanıtı SAYILMAZ)
 *     · YABANCI-KIMLIK    API'nin üretemeyeceği başka her değer (GECERLI-BICIM gönderildi ama farklı değer döndü · GECERSIZ-BICIM
 *                         gönderildi ama API biçiminde olmayan değer döndü): kendi kimliğini DAMGALAYAN ya da başlığı EZEN katman göstergesi
 *   BAŞLIKSIZ BÖLGE = API'nin kimlik başlığı yazamayacağı yanıtlar (kaynak okuması): API öneki DIŞINDAKİ yollar (web pozitifleri dahil)
 *     ve ön uçuş (OPTIONS — ara katmandan önce biter). Bu bölgede görülen HER kimlik başlığı yabancı bir katmanındır.
 *   KALİBRASYON (aynı ad, aynı koşum; `calibration.result`):
 *     · GECERSIZ  yansıma göstergesi (başlıksız bölgede AYNEN · herhangi bir satırda YANSIMA) YA DA yabancı kimlik göstergesi
 *                 (başlıksız bölgede başka değer · herhangi bir satırda YABANCI-KIMLIK) var
 *     · VAR       gösterge yok VE API pozitiflerinde İKİ davranış da tam: GECERLI-BICIM gönderilenlerin TAMAMI AYNEN-GERI-YAZMA,
 *                 GECERSIZ-BICIM gönderilenlerin TAMAMI DEGISTIRME (her birinden en az bir tane) VE web pozitiflerinin tamamı ölçülmüş
 *                 VE başlıksız bölgede ölçülen en az bir yanıt var (hiçbirinde başlık yok)
 *     · YOK       diğer her durum (kısmi kalibrasyon dahil)
 *   KATMAN KİMLİĞİ (`layerId` + neden sınıfı `layerWhy`):
 *     · UYGULAMA-API       DEGISTIRME + satır başlıksız bölgede DEĞİL + API kanıtı kullanılabilir (`calibration.apiEvidenceUsable`:
 *                          koşumda HİÇ yabancı kimlik göstergesi yok VE başlıksız bölgede ölçülen en az bir yanıt var). Kalibrasyon
 *                          `VAR` ŞART DEĞİLDİR (eksik kalibrasyon ve yansıtan katman bu kanıtı açıklayamaz; damgalayan katman açıklar).
 *     · API-DEGIL-CIKARIM  yalnız ÇIKARIM: kalibrasyon VAR + başlık YOK + ön uçuş değil + yol API-KESIN (hangi üst katmanın
 *                          yanıtladığı her durumda ölçülemez)
 *     · OLCULEMEYEN        diğer her durum (WEB-YOLU · ON-UCUS · YOL-BELIRSIZ · KALIBRASYON-YOK / -GECERSIZ · YANSIMA ·
 *                          YABANCI-KIMLIK · AYIRT-ETMEYEN-GOZLEM · KANIT-KULLANILAMAZ)
 *     · SONUC-YOK
 *   Server başlığı, gövde imzası, boş / dolu gövde İPUCUDUR (`hints`, `layerHint`); katman kimliğine ve hiçbir alana GİRMEZ.
 *   ÖLÇÜLEMEYEN İKİ SINIR (öz-testte SINIR-1 / SINIR-2 kalemleriyle KAYITLI; güvence değildir):
 *     · PASS yönünde — VARSAYIM (kenar engelleme PASS kaydının ekinde yazılıdır): API'nin ürettiği yanıtta kimlik başlığı zincirde
 *       düşürülmüyor. Kalibrasyon bunu yalnız pozitiflerin yanıtında gösterir; yalnız API'nin RET yanıtından başlığı silen bir katman
 *       varsa API'ye ulaşan bir istek "API değil" görünür.
 *     · FAIL yönünde: YALNIZ API önekli ve ön uçuş olmayan RET yanıtlarına, API'nin ürettiği biçimde KENDİ kimliğini yazan ve başka
 *       hiçbir yanıtta görünmeyen bir katman API'den ayırt edilemez — o yanıtlar API kanıtı sayılır (FAIL / bulgu adayı).
 *   YOL SINIFI (`pathClass`; kaynak okuması — Nest 10.4.20 + Express 4: `setGlobalPrefix("api")` + `forRoutes('*')` ara katmanı
 *     `/api` ve `/api/*` için kaydeder; `enableCors` ön uçuşu ara katmandan ÖNCE yanıtlar; yüzde dizisi çözülemezse ara katman
 *     çalışmaz): API-KESIN = ham yol tam `/api` önekli ve normalleştirilecek bir yanı yok (yüzde dizisi, nokta segmenti, çift
 *     eğik çizgi, noktalı virgül, büyük harfli önek yok) — API bu isteği işleseydi ara katman kesin çalışırdı · API-BELIRSIZ =
 *     ham ya da çözülmüş / sadeleştirilmiş biçimi API önekine düşen diğer her yol (çıkarım YAPILMAZ) · ONEK-DISI = web yolu.
 *   Bu protokol KAYNAK OKUMASIDIR; gerçek API ile izole provası bu betikte YAPILMADI (paket belgesi §1.1: çağıran koşar).
 *
 * ADSIZ ÖZET: ham kanıtın yanına (`<out>.json` → `<out>.ozet.json`) ad İÇERMEYEN ayrı bir özet yazılır (ad kimliği, revizyon, sondanın
 *            SHA-256'sı, vektör kümesi kimliği, kapsam yetkisi durumu, sayılar, kalibrasyon, üç alan + pozitif kontrol, zaman, çıkış
 *            kodu, beyan edilen konum etiketi, gönderilen başlık ADLARI). İçermez: ad, hata metni, yönlendirme hedefi, yol düzeyinde
 *            bulgu, kanıt dosyası yolu / özeti. Yöntem SINIFI düzeyinde sayı İÇERİR — bu yüzden özet de KISITLIDIR (depoya konmaz).
 *            Public satıra YALNIZ alan DEĞERLERİ ve ad kimliği yazılır: sayı, neden, yol / yöntem ayrıntısı ve hiçbir özet (SHA-256)
 *            değeri yazılmaz — PASS olan koşumda da (paket belgesi §1b).
 *            AD DENETİMİ (ölçülen kapsam): (a) istek atılmadan — owner'ın verdiği konum etiketi, ana makine adının TAM dizgisini
 *            ya da nokta ile ayrılmış bir ETİKETİNİ (harf / rakam dışı atıldıktan sonra ≥ 3 karakter; tireli türev dahil)
 *            içeriyorsa sonda koşmaz (çıkış 4); (b) özet yazılmadan — özet metninde adın TAM dizgisi geçiyorsa özet yazılmaz
 *            (çıkış 7). (b) yalnız tam dizgiyi yakalar; adın parçası yalnız (a)'da, yalnız owner etiketinde aranır.
 * HAM YOL  : istek `https.request({host, port, path, method, servername})` ile atılır; `path` vektördeki HAM dizedir
 *            ('/api/portal/./admin/...', '%2F', '?x=1' normalize EDİLMEZ). Öz-test kenarın gördüğü yolu birebir doğrular.
 * İSTEK LİSTESİ VE YAN ETKİ (KİMLİK BİLGİSİ GÖNDERİLMEZ):
 *   · Ret listesinde POST/PUT/PATCH/DELETE vardır — POST/PUT/PATCH gövdesi BOŞ JSON `{}`; DELETE GÖVDESİZ (yalnız
 *     `content-type: application/json` başlığı). Hiçbir istekte authorization/cookie/x-api-key başlığı yoktur.
 *   · Her istekte tek kullanımlık `x-request-id` vardır (kimlik bilgisi DEĞİLDİR). İstek uygulamaya ulaşırsa: GECERLI-BICIM değer o
 *     isteğin kimliği olur (uygulama o istekte 5xx üretirse değer uygulamanın hata kaydına yazılır); GECERSIZ-BICIM değer
 *     uygulamada ATILIR (kimlik olarak kullanılmaz; kaynakta günlüğe yazan satır görülmedi). Ret vektörleri yalnız GECERSIZ-BICIM
 *     taşır. Sondanın vektör listesindeki uçlarda başka bir etkisi kaynakta görülmedi (başlığı ayrıca okuyan üç yer aynı iç
 *     modüldedir — yinelenme anahtarı, bağlam ve iz kimliği; hiçbiri genel kayıtlı değildir ve o modülün ucu listede YOKTUR).
 *   · Beklenen: her ret vektörü 403. KENAR GEÇİRİRSE olası uygulama sonucu, her vektörde `ifPassed` alanındadır. Öne çıkanlar:
 *       - POST /api/auth/login (boş gövde): LoginRateLimitGuard DTO doğrulamasından ÖNCE çalışır → personel giriş hız sınırı
 *         sayacı (IP bazlı, 10/dk) +1, sonra DTO 400. Kimlik bilgisi gönderilmez; uygulama bu isteği YİNE DE giriş sayacına
 *         +1 yazar (uygulamanın kendi semantiğinde başarısız giriş denemesi sayılır). Tek istek blok üretmez.
 *       - POST /api/auth/register (boş gövde): guard yok; ValidationPipe (whitelist) `{}` → 400; yazma yok.
 *       - GET /api/auth/capabilities: guard yok → 200 (statik bayrak); yazma yok; personel API dışarıya açık = bulgu.
 *       - POST /api/auth/account-recovery/find-tenants SONDADA YOK (login ile AYNI sayacı paylaşır; yan etkiyi artırmamak için).
 *       - /api/portal/admin/* : JwtAuthGuard → 401 (token yok; yazma yok).
 *       - GET /api/auth/me · /api/cases · /api/users : 401 (token yok). GET /api/health : R27'de kök ucu yok → 404.
 *       - izinli yolda yanlış yöntem (POST /api/portal/cases, PUT/DELETE messages, …): rota yok → 404 (yazma yok).
 *       - personel sayfaları (/, /auth/login, /dashboard, …): Next sayfa 200/302 (yazma yok) — yüzey dışarıya AÇIK = bulgu.
 *       - HEAD (D8-E1): personel sayfası → Next 200/3xx gövdesiz; personel API/admin → Express HEAD'i GET işleyicisine
 *         yönlendirir → JwtAuthGuard 401 (token yok); DB/yazma/audit/giriş sayacı yok.
 *       - OPTIONS (D8-E1): personel API/admin → Nest enableCors ön uçuşu guard/rota'dan ÖNCE 204 (Content-Length 0; Origin
 *         başlığı yok → ACAO yansıtılmaz; giriş sayacı/yazma/audit YOK); personel sayfası → Next 405/404 (çalışma zamanıyla doğrulanmadı).
 *       - 18 kodlama/normalizasyon varyantı (D8-E2): kenar ham yolu normalize etmeden reddederse 403; geçer ve uygulama
 *         çözerse hedefe göre sayfa 200 / admin 401 / rota yok 404; yazma yok; varyant izin listesini aştı = bulgu.
 *   · "Kimliksiz istekte uygulama 403 üretmez" bir GENELLEME DEĞİLDİR: yalnız bu sondanın vektör listesindeki uçlar için kaynak
 *     okumasıdır (çalışma zamanında ölçülmedi). Uygulamanın ürettiği 403 bu yüzden varsayımla değil kimlik kanıtıyla sınıflanır.
 * YAPMAZ   : kimlik bilgisi göndermez; forgot-password/reset-password çağırmaz (e-posta); intake POST, belge yükleme, mesaj yazma yok;
 *            DB erişimi yok; yönlendirme izlemez; tekrar denemez. Pozitif listedeki POST/DELETE'ler token olmadan guard 401'de durur.
 * KANIT    : `design` alanı (credentialsSent / writesAttempted = false) betik TASARIM BEYANIDIR (ölçüm değil).
 *            `measured { requestCount, credentialHeaderRequests, nonEmptyBodyRequests, bodies }` istek döngüsünden TÜRETİLİR:
 *            gönderilen başlık adları, gövde, gönderilen istek kimliği ve biçimi her satırda `sent` alanındadır (kimlik başlığı yok;
 *            gövde ∈ {'', '{}'}). Yanıt başlığı DEĞERLERİ kanıta yazılmaz (yalnız ad / varlık / gözlem sınıfı).
 *            `vantage` owner'ın BEYAN ettiği konum etiketidir (ölçüm değil). `vectorSetId` vektör listesinden türetilir
 *            (sırayla "grup yöntem hamYol beklenenKodlar" satırlarının SHA-256'sı): adlar arasında aynı listenin koşulduğunu gösterir.
 * KULLANIM : node d8-staff-surface-probe.js --alias AD-1 --vantage <etiket> --origin https://<public-host> --out <kanit.json>
 *            node d8-staff-surface-probe.js --alias AD-<n> --scope-record <kayit.json> --vantage <etiket> --origin https://<host> --out <kanit.json>
 *            node d8-staff-surface-probe.js --alias AD-<n> [--scope-record <kayit.json>] --origin https://<public-host> --phone-list
 *            --phone-list AYRI çağrıdır: owner'ın telefonda (mobil veri) açacağı 5 adresi yazar, İSTEK ATMAZ, kanıt yazmaz
 *            (beyan ayrı dosyadadır; makine ölçümü değildir). Kapsam yetkisi kapısı bu çağrıda da geçerlidir.
 * ÇIKIŞ    : dört alandan türer (TEK YER: `exitCodeOf`) — 2 herhangi bir alan FAIL (pozitif kontrol dahil) · 0 FAIL yok ve kenar
 *            engelleme PASS · 3 diğer her durum (ÖLÇÜLEMEYEN) · 4 kapı — istek atılmaz (kapsam yetkisi doğrulanmadı · origin https
 *            değil ya da içinde kimlik / sorgu / parça var · TLS doğrulaması kapalı · ad kimliği / konum etiketi yok ya da geçersiz ·
 *            parametre yinelenmiş · --out yok · --phone-list ile --out birlikte · kanıt ya da özet dosyası zaten var · konum etiketi
 *            ana makine adını ya da bir etiketini içeriyor · D8_HTTP_TIMEOUT_MS geçersiz · istek kimliği planı tutarsız) ·
 *            7 kanıt / özet yazılamadı (ölçüm yapıldı; ham kanıtı olmayan özet kanıt sayılmaz) · 1 sonda beklenmeyen biçimde durdu
 *            (ÖLÇÜLEMEYEN sayılır; kapanış değildir). Çıkış 0 "D-8 kapandı" demek DEĞİLDİR: katman doğrulaması ayrı alandır ve canlı
 *            sonda kapsamı ile ad başına GO ayrı owner kararıdır (paket belgesi §3).
 */
const https = require('https'); const fs = require('fs'); const pathMod = require('path'); const crypto = require('crypto');

const REVISION = 'R05';
/** API'nin istek kimliği başlığı (apps/api/src/common/request-id.middleware.ts REQUEST_ID_HEADER). */
const RID_HEADER = 'x-request-id';
/** API'nin KABUL ettiği biçim — ürün kaynağındaki SAFE_REQUEST_ID ile AYNI ifade (öz-test kaynak metniyle karşılaştırır). */
const RID_ACCEPTED_RX = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,127}$/;
/** API'nin kabul etmediği değerin yerine ÜRETTİĞİ kimliğin biçimi: `randomUUID()` (RFC 4122 sürüm 4, küçük harf). */
const RID_GENERATED_RX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const ALIAS_RX = /^AD-[1-9][0-9]{0,2}$/;
const VANTAGE_RX = /^[a-z0-9][a-z0-9-]{1,39}$/;
/** Birincil ad kimliği: kapsam yetkisi kapısı YALNIZ bu kimlik için yoktur. */
const PRIMARY_ALIAS = 'AD-1';
/** Kapsam yetkisi doğrulanmadığında yazılan ileti — public satırdaki metinle BİREBİR aynıdır (paket belgesi §1b). */
const SCOPE_REFUSAL_TEXT = 'KOŞULMADI — kapsam yetkisi doğrulanmadı';
const SCOPE_RECORD_KIND = 'EXTACC-D8-SCOPE-AUTHORIZATION';
/** Kanıt kalemi türleri. İlk ikisi ZORUNLUDUR; tünel kaydı tanınır ama tek başına yetmez. */
const SCOPE_REQUIRED_TYPES = ['SAGLAYICI-HESABI-KAYDI', 'DNS-ZINCIRI'];
const SCOPE_TUNNEL_TYPE = 'TUNEL-KAYDI';

// ─── ALAN DEĞERLERİ VE ÇIKIŞ KODU — TEK YER ───────────────────────────────────────────────────────────────────────────────
const FIELD_VALUES = ['PASS', 'FAIL', 'OLCULEMEYEN'];
/** Çıkış kodu eşlemesi (paket belgesi §1.1 bu metni AYNEN taşır; öz-test üçünü karşılaştırır). */
const EXIT_CODE_MAP = 'herhangi bir alan FAIL → 2 · FAIL yok ve kenar engelleme PASS → 0 · diğer her durum → 3 · kapı → 4 · kanıt yazılamadı → 7 · beklenmeyen durma → 1';
/** Dört alandan çıkış kodu. Tanınmayan bir alan değeri hiçbir koşulda 0 vermez. */
function exitCodeOf(v) {
  const vals = [v.httpReject.value, v.edgeBlocking.value, v.layerVerification.value, v.positiveControl.value];
  if (vals.includes('FAIL')) return 2;
  if (!vals.every((x) => FIELD_VALUES.includes(x))) return 3;
  return (v.edgeBlocking.value === 'PASS' && v.httpReject.value === 'PASS' && v.positiveControl.value === 'PASS') ? 0 : 3;
}
const KAYIT_EKI = 'YALNIZ bu istek profili (requestProfile), bu konum (vantage; beyan) ve bu vektör kümesi (vectorSetId) için. Kenar engelleme PASS şu demektir: bütün ret vektörleri azaltım işareti taşımayan 403 aldı, izinli yollar beklendiği gibi yanıtlandı, kalibrasyon geçerliydi ve engellenmesi gereken hiçbir isteğin API\'ye ulaştığına dair kanıt görülmedi; reddi HANGİ katmanın ürettiği bu alanda değil katman doğrulamasındadır. VARSAYIMLAR: (1) API\'nin ürettiği yanıtta kimlik başlığı zincirde düşürülmüyor (kalibrasyon bunu yalnız pozitiflerin yanıtında gösterir); (2) işaretsiz bir sınama yanıtı bu sondayla ayırt edilemez';
/** Sağlayıcının AZALTIM İŞARETİ (yanıt başlığı). Tanınan tek değer sınamadır (`challenge`). İşaret yalnız kenar engelleme hükmünü
 *  DÜŞÜRMEK için okunur (var olan hiçbir işaret PASS'a düşmez; bulguyu da kaldırmaz); durum kodu ölçütüne ve katmana girmez. */
const MITIGATION_MARK = { header: 'cf-mitigated', challenge: /(^|[\s,])challenge([\s,]|$)/i };
/** Azaltım işareti SINIFI (başlığın değeri hiçbir yere yazılmaz): başlık YOKSA `YOK` · VAR ve değeri — virgül / boşlukla ayrılmış
 *  listenin bir ögesi olarak, harf duyarsız — tanınan sınama değerini taşıyorsa `SINAMA` · VAR ama değeri tanınmıyorsa (boş değer
 *  dahil) `TANINMAYAN`. Node aynı adlı iki başlık satırını ", " ile tek değere birleştirir (liste biçimi). */
function mitigationMarkOf(headers) {
  const v = (headers || {})[MITIGATION_MARK.header];
  if (v === undefined) return 'YOK';
  return MITIGATION_MARK.challenge.test(Array.isArray(v) ? v.join(', ') : String(v)) ? 'SINAMA' : 'TANINMAYAN';
}

function arg(name) { const i = process.argv.indexOf(name); return i > 0 ? process.argv[i + 1] : null; }
function argCount(name) { return process.argv.filter((a) => a === name).length; }
function reject(msg) { console.error('REDDEDİLDİ: ' + msg); process.exit(4); }
const ORIGIN = arg('--origin'); const OUT = arg('--out'); const PHONE = process.argv.includes('--phone-list');
const ALIAS = arg('--alias'); const VANTAGE = arg('--vantage'); const SCOPE_RECORD = arg('--scope-record');
if (!ORIGIN || !/^https:\/\/[^/]+$/.test(ORIGIN)) reject('--origin https://<host> (yolsuz) gerekli');
if (process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0') reject('TLS doğrulaması kapalı');
if (['--origin', '--alias', '--out', '--vantage', '--scope-record'].some((n) => argCount(n) > 1)) reject('BİR SÜREÇ = BİR AD = BİR KANIT: --origin / --alias / --out / --vantage / --scope-record birer kez verilir (çok adlı koşum yok)');
if (!ALIAS || !ALIAS_RX.test(ALIAS)) reject('--alias AD-<n> gerekli (ad kimliği; ana makine adı DEĞİL)');
let ORIGIN_URL = null; try { ORIGIN_URL = new URL(ORIGIN); } catch (e) { ORIGIN_URL = null; }
if (!ORIGIN_URL || ORIGIN_URL.username || ORIGIN_URL.password || ORIGIN_URL.search || ORIGIN_URL.hash) reject('--origin yalnız https://<host>[:port] olabilir (kimlik / sorgu / parça yok)');
if (PHONE && OUT) reject('--phone-list AYRI çağrıdır; --out ile birlikte verilmez');
if (!PHONE && !OUT) reject('--out <kanit.json> gerekli');
if (!PHONE && (!VANTAGE || !VANTAGE_RX.test(VANTAGE))) reject('--vantage <etiket> gerekli (beyan edilen koşum konumu; küçük harf / rakam / tire, 2–40 karakter)');
const TIMEOUT_RAW = process.env.D8_HTTP_TIMEOUT_MS === undefined ? '15000' : String(process.env.D8_HTTP_TIMEOUT_MS);
if (!/^\d{3,6}$/.test(TIMEOUT_RAW) || Number(TIMEOUT_RAW) < 500 || Number(TIMEOUT_RAW) > 120000) reject('D8_HTTP_TIMEOUT_MS geçersiz (500–120000 ms tam sayı)');
const TIMEOUT_MS = Number(TIMEOUT_RAW);
const HOST = ORIGIN_URL.hostname; const PORT = Number(ORIGIN_URL.port || 443);
const SUMMARY_OUT = OUT ? (/\.json$/i.test(OUT) ? OUT.replace(/\.json$/i, '.ozet.json') : OUT + '.ozet.json') : null;
/** Sondanın kendi SHA-256'sı. */
const SELF_SHA = crypto.createHash('sha256').update(fs.readFileSync(__filename)).digest('hex').toUpperCase();

// ─── İSTEK KİMLİĞİ PLANI ──────────────────────────────────────────────────────────────────────────────────────────────────
const RID_FORMS = ['GECERLI-BICIM', 'GECERSIZ-BICIM'];
/** Tek kullanımlık istek kimliği. GECERLI-BICIM: API'nin kabul ettiği biçim (aynen geri yazar). GECERSIZ-BICIM: kabul desenindeki
 *  karakter kümesinde OLMAYAN bir karakter (`~`) taşır → API atar ve yeni kimlik üretir; yansıtan bir katman aynen geri döndürür. */
function newRequestId(form) { const hex = crypto.randomBytes(16).toString('hex'); return form === 'GECERLI-BICIM' ? 'd8r' + hex : 'd8r~' + hex; }
/** Hangi istekte hangi biçim: ret vektörlerinin hepsi GECERSIZ-BICIM; pozitifler kendi sınıfı (API / web) içindeki sırayla
 *  GECERLI-BICIM, GECERSIZ-BICIM, GECERLI-BICIM, … */
function ridFormOf(grp, ordinalInClass) { return grp === 'deny' ? 'GECERSIZ-BICIM' : (ordinalInClass % 2 === 0 ? 'GECERLI-BICIM' : 'GECERSIZ-BICIM'); }
// Plan kapısı: iki biçim gerçekten ayrışmıyorsa (kabul deseni değişmiş / üretim bozulmuş) kanıt kuralı anlamsızdır — istek atılmaz.
{ const g = newRequestId('GECERLI-BICIM'); const x = newRequestId('GECERSIZ-BICIM');
  if (!RID_ACCEPTED_RX.test(g) || RID_ACCEPTED_RX.test(x) || RID_GENERATED_RX.test(g) || RID_GENERATED_RX.test(x) || g === x) reject('istek kimliği planı tutarsız (GECERLI-BICIM kabul desenine uymalı, GECERSIZ-BICIM uymamalı; ikisi de API\'nin ürettiği biçimde olmamalı)'); }

// ─── KAPSAM YETKİSİ KAPISI ────────────────────────────────────────────────────────────────────────────────────────────────
/** Kapsam yetkisi doğrulanmadı: istek atılmaz. İleti SABİTTİR; ikinci satır yalnız neden SINIFINI taşır (ad / yol / özet değeri yok). */
function scopeRefuse(why) { console.error(SCOPE_REFUSAL_TEXT); console.error('D8-KAPSAM-YETKISI=RET neden=' + why); process.exit(4); }
function validIsoDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const t = Date.parse(s + 'T00:00:00Z'); if (Number.isNaN(t) || new Date(t).toISOString().slice(0, 10) !== s) return false;
  return t <= Date.now() + 24 * 3600 * 1000; // gelecekteki tarih kanıt tarihi olamaz (bir günlük saat dilimi payı)
}
/** AD-1 dışındaki ad için kapsam yetkisi kaydını ÖLÇER. Dönüş: yalnız durum + kalem türleri (kanıta yazılan tek şey budur). */
function verifyScopeAuthorization() {
  if (ALIAS === PRIMARY_ALIAS) {
    if (SCOPE_RECORD !== null) reject('--scope-record yalnız AD-1 dışındaki ad kimlikleri içindir (birincil ad için kapsam yetkisi kapısı yoktur; kayıt sessizce yok sayılmaz)');
    return { required: false, status: 'KAPI-YOK-BIRINCIL-AD', itemTypes: [] };
  }
  if (!SCOPE_RECORD) scopeRefuse('KAYIT-YOK');
  let rec = null; try { rec = JSON.parse(fs.readFileSync(SCOPE_RECORD, 'utf8')); } catch (e) { scopeRefuse('KAYIT-OKUNAMADI'); }
  if (!rec || typeof rec !== 'object' || Array.isArray(rec) || rec.record !== SCOPE_RECORD_KIND || !Array.isArray(rec.items)) scopeRefuse('KAYIT-BICIMI-GECERSIZ');
  if (rec.nameAlias !== ALIAS) scopeRefuse('AD-KIMLIGI-UYUSMUYOR');
  if (typeof rec.originHost !== 'string' || rec.originHost.toLowerCase() !== HOST.toLowerCase()) scopeRefuse('ANA-MAKINE-UYUSMUYOR');
  const known = SCOPE_REQUIRED_TYPES.concat([SCOPE_TUNNEL_TYPE]);
  const shapeOk = (it) => it && typeof it === 'object' && !Array.isArray(it) && known.includes(it.type) && typeof it.file === 'string' && it.file.length > 0 && typeof it.sha256 === 'string' && /^[0-9A-Fa-f]{64}$/.test(it.sha256) && validIsoDate(it.date);
  if (rec.items.length === 0 || !rec.items.every(shapeOk)) scopeRefuse('KALEM-BICIMI-GECERSIZ');
  const missing = SCOPE_REQUIRED_TYPES.filter((t) => !rec.items.some((it) => it.type === t));
  if (missing.length === SCOPE_REQUIRED_TYPES.length) scopeRefuse(rec.items.some((it) => it.type === SCOPE_TUNNEL_TYPE) ? 'YALNIZ-TUNEL-KAYDI' : 'KALEM-EKSIK');
  if (missing.length > 0) scopeRefuse('KALEM-EKSIK');
  const base = pathMod.dirname(pathMod.resolve(SCOPE_RECORD)); const seen = [];
  for (const it of rec.items) {
    const f = pathMod.resolve(base, it.file); let buf = null;
    try { if (!fs.statSync(f).isFile()) scopeRefuse('KANIT-DOSYASI-YOK'); buf = fs.readFileSync(f); } catch (e) { scopeRefuse('KANIT-DOSYASI-YOK'); }
    if (buf.length === 0) scopeRefuse('KANIT-DOSYASI-BOS');
    const got = crypto.createHash('sha256').update(buf).digest('hex').toUpperCase();
    if (got !== it.sha256.toUpperCase()) scopeRefuse('OZET-TUTMUYOR');
    seen.push({ type: it.type, file: f.toLowerCase(), sha: got });
  }
  // İki zorunlu kalem aynı dosyayı ya da aynı içeriği gösteremez (tek bir dosyanın iki ada bölünmesi iki kanıt değildir).
  const req = seen.filter((s) => SCOPE_REQUIRED_TYPES.includes(s.type));
  for (const a of req) for (const b of req) if (a !== b && a.type !== b.type && (a.file === b.file || a.sha === b.sha)) scopeRefuse('AYNI-KANIT-IKI-KALEMDE');
  return { required: true, status: 'DOGRULANDI', itemTypes: Array.from(new Set(seen.map((s) => s.type))).sort() };
}
const SCOPE_AUTH = verifyScopeAuthorization();

// Kenar geçirirse olası uygulama sonucu (R27 kaynağından): kısa etiketler.
const FX = {
  page: 'Next sayfa 200/302; yazma yok; personel yüzeyi dışarıya açık = bulgu',
  jwt401: 'personel JwtAuthGuard → 401 (token yok); yazma yok; personel API dışarıya açık = bulgu',
  login: 'LoginRateLimitGuard sayacı +1 (IP bazlı, 10/dk; DTO doğrulamasından ÖNCE; uygulama semantiğinde başarısız giriş denemesi sayılır) → sonra DTO 400; kimlik bilgisi gönderilmez; sayaç +1 = yan etki + bulgu',
  register: 'POST /api/auth/register guard yok; ValidationPipe (whitelist) boş gövdeyi 400 ile keser; yazma yok; personel API dışarıya açık = bulgu',
  capabilities: 'GET /api/auth/capabilities guard yok → 200 (statik bayrak); yazma yok; personel API dışarıya açık = bulgu',
  health: 'R27 kök /api/health ucu yok → 404; yazma yok; izin listesi dışı = bulgu',
  admin: '/api/portal/admin/* JwtAuthGuard → 401 (token yok); yazma yok; admin yüzeyi dışarıya açık = bulgu',
  adminVar: 'normalizasyona göre admin rotası (→ 401) veya 404; yazma yok; varyant geçti = bulgu',
  noRoute: 'uygulamada bu (yöntem, yol) için rota yok → 404; yazma yok; yanlış yöntem geçti = bulgu',
  nextMethod: 'Next sayfa rotasına yazma yöntemi → 404/405; yazma yok; geçti = bulgu',
  notFound: 'Next/Nest 404; yazma yok; izin listesi dışı = bulgu',
  // D8-E1 — HEAD/OPTIONS. Kenar izin matcher'ları yöntem duyarlıdır (method GET/POST/DELETE); HEAD ve OPTIONS hiçbir izin
  // kuralına uymaz → varsayılan `respond 403`. "Kenar geçirirse" sonucu kaynak 1b758d29'den türetilir.
  headPage: 'HEAD personel sayfası: Next App Router HEAD = GET başlıkları (gövde yok) → 200/3xx; personel yüzeyi dışarıya açık = bulgu; yazma yok',
  headApi: 'HEAD personel API: Express HEAD isteğini GET işleyicisine yönlendirir → global SmokeAuthorizationGuard (Bearer yok → geçer) → JwtAuthGuard 401; gövde yok; DB/yazma/audit/giriş sayacı yok',
  headAdmin: 'HEAD admin: Express HEAD→GET işleyici → JwtAuthGuard 401 (token yok); gövde yok; yazma/audit yok',
  optionsPage: 'OPTIONS personel sayfası: Next App Router sayfası yalnız GET/HEAD → 405 (Allow: GET, HEAD) ya da 404 (çalışma zamanıyla doğrulanmadı); yazma yok',
  optionsApi: 'OPTIONS personel API: Nest enableCors ön uçuşu yönlendirme/guard öncesinde 204 (Content-Length 0); istek Origin başlığı yok → ACAO yansıtılmaz; guard/rota/DTO/giriş sayacı çalışmaz; yazma/audit/hata kaydı yok',
  optionsAdmin: 'OPTIONS admin: Nest CORS ön uçuşu @deny ve JwtAuthGuard öncesinde 204; admin işleyici çalışmaz; yazma yok',
  // D8-E2 — izole provadan taşınan 18 kodlama/normalizasyon varyantı (edge-allowlist-probe.js EVASION). Amaç: kenar ham yolu
  // normalize edip izin listesini aşmaya izin vermiyor mu. Kenar reddederse 403; geçer ve uygulama ham yolu çözerse hedefe göre.
  evasion: 'kodlama/normalizasyon varyantı: kenar ham yolu normalize etmeden reddederse 403; geçer ve uygulama çözerse hedefe göre personel sayfası 200 / admin JwtAuthGuard 401 / rota yok 404; yazma yok; varyant izin listesini aştı = bulgu',
};
// Kenar izin listesi (client-external-access-r01/templates/Caddyfile.template) DIŞI vektörler — hepsi 403 beklenir.
// [ad, yöntem, HAM yol, kenar geçirirse olası sonuç]
const DENY = [
  ['personel kök',                'GET',    '/',                                          FX.page],
  ['personel giriş sayfası',      'GET',    '/auth/login',                                FX.page],
  ['personel panel',              'GET',    '/dashboard',                                 FX.page],
  ['personel sıfırlama sayfası',  'GET',    '/auth/reset-password',                       FX.page],
  ['personel oturum',             'GET',    '/api/auth/me',                               FX.jwt401],
  ['personel giriş API (boş gövde, kimlik bilgisi yok)', 'POST', '/api/auth/login',       FX.login],
  ['personel kayıt API (boş gövde, kimlik bilgisi yok)', 'POST', '/api/auth/register',    FX.register],
  ['personel yetenek bayrağı',    'GET',    '/api/auth/capabilities',                     FX.capabilities],
  ['personel dosya listesi',      'GET',    '/api/cases',                                 FX.jwt401],
  ['personel kullanıcılar',       'GET',    '/api/users',                                 FX.jwt401],
  ['sağlık ucu',                  'GET',    '/api/health',                                FX.health],
  ['portal admin create (boş gövde)',  'POST', '/api/portal/admin/create-user',           FX.admin],
  ['portal admin disable (boş gövde)', 'POST', '/api/portal/admin/disable-user',          FX.admin],
  ['portal admin belgeler',       'GET',    '/api/portal/admin/documents/pending',        FX.admin],
  ['portal admin mesajlar',       'GET',    '/api/portal/admin/messages/clients',         FX.admin],
  ['portal admin kök',            'GET',    '/api/portal/admin',                          FX.adminVar],
  ['portal admin kodlanmış /',    'GET',    '/api/portal%2Fadmin/documents/pending',      FX.adminVar],
  ['portal admin sorgu ile',      'GET',    '/api/portal/admin/documents/pending?x=1',    FX.admin],
  // (portal admin büyük harf '/ADMIN/' ve nokta-segment '/./admin/' artık D8-E2 kodlama bloğundadır; tekrar istek yok)
  ['intake DELETE',               'DELETE', '/intake/d8probe',                            FX.nextMethod],
  ['intake API DELETE',           'DELETE', '/api/public/intake/d8probe',                 FX.noRoute],
  ['intake API PUT (boş gövde)',  'PUT',    '/api/public/intake/d8probe',                 FX.noRoute],
  ['intake API PATCH (boş gövde)', 'PATCH', '/api/public/intake/d8probe',                 FX.noRoute],
  ['portal login GET (yöntem)',   'GET',    '/api/portal/login',                          FX.noRoute],
  ['portal cases POST (boş gövde)', 'POST', '/api/portal/cases',                          FX.noRoute],
  ['portal cases DELETE',         'DELETE', '/api/portal/cases/d8probe',                  FX.noRoute],
  ['portal messages DELETE',      'DELETE', '/api/portal/messages',                       FX.noRoute],
  ['portal messages PUT (boş gövde)', 'PUT', '/api/portal/messages',                      FX.noRoute],
  ['portal documents PUT (boş gövde)', 'PUT', '/api/portal/documents/d8probe',            FX.noRoute],
  ['portal documents POST id (boş gövde)', 'POST', '/api/portal/documents/d8probe',       FX.noRoute],
  ['portal profile POST (web, boş gövde)', 'POST', '/portal/profile',                     FX.nextMethod],
  ['portal change-password GET',  'GET',    '/api/portal/change-password',                FX.noRoute],
  ['portal login sayfası POST (web, boş gövde)', 'POST', '/portal/login',                 FX.nextMethod],
  ['bilinmeyen kök yol',          'GET',    '/robots.txt',                                FX.notFound],
  ['api kök',                     'GET',    '/api',                                       FX.notFound],
  ['api kök slash',               'GET',    '/api/',                                      FX.notFound],
  // D8-E1 — HEAD / OPTIONS ret vektörleri (üç yüzey: personel sayfası · personel API · admin portal yolu). Gövdesiz.
  ['HEAD personel sayfası',       'HEAD',   '/',                                          FX.headPage],
  ['HEAD personel API',           'HEAD',   '/api/auth/me',                               FX.headApi],
  ['HEAD admin portal yolu',      'HEAD',   '/api/portal/admin/documents/pending',        FX.headAdmin],
  ['OPTIONS personel sayfası',    'OPTIONS','/',                                          FX.optionsPage],
  ['OPTIONS personel API',        'OPTIONS','/api/auth/me',                               FX.optionsApi],
  ['OPTIONS admin portal yolu',   'OPTIONS','/api/portal/admin/documents/pending',        FX.optionsAdmin],
  // D8-E2 — izole provadan (edge-allowlist-probe.js EVASION) taşınan 18 kodlama/normalizasyon varyantı. HAM yol korunur.
  ['varyant %61dmin',             'GET',    '/api/portal/%61dmin/documents/pending',      FX.evasion],
  ['varyant %61dmin POST (boş gövde)', 'POST', '/api/portal/%61dmin/create-user',         FX.evasion],
  ['varyant admin%2Fdocuments',   'GET',    '/api/portal/admin%2Fdocuments%2Fpending',    FX.evasion],
  ['varyant DELETE kodlu traversal', 'DELETE', '/api/portal/documents/x%2F..%2Fadmin%2Fdocuments%2Fpending', FX.evasion],
  ['varyant düz traversal',       'GET',    '/api/portal/cases/../admin/documents/pending', FX.evasion],
  ['varyant kodlu traversal ..%2Fadmin', 'GET', '/api/portal/documents/..%2Fadmin/documents/pending', FX.evasion],
  ['varyant çift slash',          'GET',    '//api/portal/admin/documents/pending',       FX.evasion],
  ['varyant nokta segment',       'GET',    '/api/portal/./admin/documents/pending',      FX.evasion],
  ['varyant büyük harf /API/',    'GET',    '/API/portal/cases',                          FX.evasion],
  ['varyant büyük harf /ADMIN/',  'GET',    '/api/portal/ADMIN/documents/pending',        FX.evasion],
  ['varyant sondaki slash',       'GET',    '/api/portal/cases/',                         FX.evasion],
  ['varyant noktalı virgül',      'GET',    '/api/portal/cases;x=1',                      FX.evasion],
  ['varyant web traversal intake', 'GET',   '/intake/abc/../../auth/login',               FX.evasion],
  ['varyant web traversal _next', 'GET',    '/_next/../auth/login',                       FX.evasion],
  ['varyant web kodlu traversal', 'GET',    '/_next/%2e%2e/auth/login',                   FX.evasion],
  ['varyant boş bayt kodlu',      'GET',    '/api/portal/cases%00/admin',                 FX.evasion],
  ['varyant çift kodlama',        'GET',    '/api/portal/documents/%252e%252e/admin',     FX.evasion],
  ['varyant unicode slash',       'GET',    '/api/portal/admin%c0%afdocuments/pending',   FX.evasion],
];
// Pozitifler — izinli çiftler uygulamaya ULAŞIR; hiçbiri yazma yapmaz (token yok → guard 401; sayfa GET → 200).
const ALLOW = [
  ['portal giriş sayfası',              'GET',  '/portal/login',                       [200]],
  ['şifremi unuttum sayfası',           'GET',  '/portal/forgot-password',             [200]],
  ['sıfırlama sayfası',                 'GET',  '/portal/reset-password',              [200]],
  ['portal dosyalar (token yok)',       'GET',  '/api/portal/cases',                   [401]],
  ['portal belgeler (token yok)',       'GET',  '/api/portal/documents',               [401]],
  ['portal mesajlar (token yok)',       'GET',  '/api/portal/messages',                [401]],
  ['portal mesaj gönder (token yok)',   'POST', '/api/portal/messages',                [401]],
  ['portal belge sil (token yok)',      'DELETE', '/api/portal/documents/d8probe',     [401]],
  ['portal parola değiştir (token yok)', 'POST', '/api/portal/change-password',        [401]],
];
/** Vektör kümesi kimliği: sırayla "grup yöntem hamYol beklenenKodlar" satırlarının SHA-256'sı (adlar arasında aynı liste mi?). */
const VECTOR_SET_ID = crypto.createHash('sha256').update(
  DENY.map((v) => `deny ${v[1]} ${v[2]} 403`).concat(ALLOW.map((v) => `allow ${v[1]} ${v[2]} ${v[3].join(',')}`)).join('\n'), 'utf8').digest('hex').toUpperCase();

// ─── SINIFLAR ─────────────────────────────────────────────────────────────────────────────────────────────────────────────
const OUTCOMES = ['RET-403', 'SINAMA-ISARETLI-403', 'TANINMAYAN-AZALTIM-ISARETLI-403', 'DORTYUZ-403-DISI', 'HIZ-SINIRI-429', 'REDDEDILMEDI-2XX', 'YONLENDIRME-3XX', 'SUNUCU-HATASI-5XX', 'SONUC-YOK', 'SINIFLANAMADI'];
const LAYER_IDS = ['UYGULAMA-API', 'API-DEGIL-CIKARIM', 'OLCULEMEYEN', 'SONUC-YOK'];
const LAYER_WHYS = ['DEGISTIRME-KANITI', 'BASLIK-YOK-KALIBRASYON-VAR', 'WEB-YOLU', 'ON-UCUS', 'YOL-BELIRSIZ', 'KALIBRASYON-YOK', 'KALIBRASYON-GECERSIZ', 'YANSIMA', 'YABANCI-KIMLIK', 'AYIRT-ETMEYEN-GOZLEM', 'KANIT-KULLANILAMAZ', 'YANITSIZ'];
const ID_OBS = ['YOK', 'AYNEN', 'YENI-KIMLIK', 'BASKA-DEGER', 'SONUC-YOK'];
const ID_SIGNALS = ['YOK', 'DEGISTIRME', 'AYNEN-GERI-YAZMA', 'YANSIMA', 'YABANCI-KIMLIK', 'SONUC-YOK'];
const ERROR_CLASSES = ['AD-COZULMEDI', 'BAGLANTI', 'TLS', 'ZAMAN-ASIMI', 'DIGER'];
const VECTOR_CLASSES = ['BES-YONTEM', 'HEAD', 'OPTIONS', 'VARYANT'];
/** Durum kodu sınıfı (katman bu alana GİRMEZ). Azaltım işareti taşıyan 403 ayrı sınıftır: durum kodu ölçütünde 403'tür, kenar
 *  engelleme hükmünde olağan ret SAYILMAZ (tanınan sınama ya da tanınmayan işaret; tanınmayan sınıf değeri de ret sayılmaz). */
function outcomeOf(status, mark) {
  if (status === 0) return 'SONUC-YOK';
  if (status === 403) return mark === 'YOK' ? 'RET-403' : (mark === 'SINAMA' ? 'SINAMA-ISARETLI-403' : 'TANINMAYAN-AZALTIM-ISARETLI-403');
  if (status === 429) return 'HIZ-SINIRI-429';
  if (status >= 200 && status < 300) return 'REDDEDILMEDI-2XX';
  if (status >= 300 && status < 400) return 'YONLENDIRME-3XX';
  if (status >= 400 && status < 500) return 'DORTYUZ-403-DISI';
  if (status >= 500 && status < 600) return 'SUNUCU-HATASI-5XX';
  return 'SINIFLANAMADI';
}
/** Taşıma hatası SINIFI — yalnız hata kodundan; ileti metni (ana makine adı içerebilir) hiçbir yere yazılmaz. */
function errorClassOf(e) {
  const c = String((e && e.code) || '');
  if (c === 'D8_TIMEOUT' || c === 'ETIMEDOUT' || c === 'ESOCKETTIMEDOUT') return 'ZAMAN-ASIMI';
  if (/^(ENOTFOUND|EAI_[A-Z]+)$/.test(c)) return 'AD-COZULMEDI';
  if (/^(ERR_TLS_|ERR_SSL_|ERR_OSSL_|CERT_|UNABLE_TO_|DEPTH_ZERO_|SELF_SIGNED_|HOSTNAME_MISMATCH)/.test(c) || c === 'EPROTO') return 'TLS';
  if (/^(ECONNREFUSED|ECONNRESET|ECONNABORTED|EHOSTUNREACH|EHOSTDOWN|ENETUNREACH|ENETDOWN|EADDRNOTAVAIL|EPIPE)$/.test(c)) return 'BAGLANTI';
  return 'DIGER';
}
function looseForms(pathname) {
  const forms = [pathname]; let p = pathname;
  for (let i = 0; i < 3; i++) { let d; try { d = decodeURIComponent(p); } catch (e) { break; } if (d === p) break; p = d; forms.push(p); }
  for (const f of forms.slice()) {
    const out = []; for (const s of f.split('/')) { if (s === '' || s === '.') continue; if (s === '..') { out.pop(); continue; } out.push(s); }
    forms.push('/' + out.join('/'));
  }
  return forms;
}
/** Yol sınıfı (kaynak okuması; başlıktaki "YOL SINIFI"). API-KESIN yalnız normalleştirilecek bir yanı olmayan `/api` önekli ham yoldur. */
function pathClassOf(rawPath) {
  const pathname = String(rawPath).split('?')[0];
  if (/^\/api(?:\/[A-Za-z0-9_~-][A-Za-z0-9._~-]*)*\/?$/.test(pathname)) return 'API-KESIN';
  return looseForms(pathname).some((f) => /^\/+api(?:$|[^a-z0-9_.~-])/i.test(f)) ? 'API-BELIRSIZ' : 'ONEK-DISI';
}
function vectorClassOf(grp, method, pathClass, ifPassed) {
  if (grp === 'allow') return pathClass === 'ONEK-DISI' ? 'POZITIF-WEB' : 'POZITIF-API';
  if (method === 'HEAD') return 'HEAD';
  if (method === 'OPTIONS') return 'OPTIONS';
  return ifPassed === FX.evasion ? 'VARYANT' : 'BES-YONTEM';
}
/** Kimlik GÖZLEMİ: yanıttaki başlık değeri gönderilenle karşılaştırılır; değerin kendisi hiçbir yere yazılmaz. */
function idObsOf(measuredRow, got, sentId) {
  if (!measuredRow) return 'SONUC-YOK';
  if (got === undefined) return 'YOK';
  if (got === sentId) return 'AYNEN';
  return (typeof got === 'string' && RID_GENERATED_RX.test(got)) ? 'YENI-KIMLIK' : 'BASKA-DEGER';
}
/** Gözlemin ANLAMI = gözlem × gönderilen biçim. API yalnız iki şey üretebilir: GECERLI-BICIM → AYNEN (AYNEN-GERI-YAZMA) ve
 *  GECERSIZ-BICIM → YENI-KIMLIK (DEGISTIRME). GECERSIZ-BICIM → AYNEN yansıtan katmandır; kalan her değer yabancı kimliktir. */
function idSignalOf(idObs, form) {
  if (idObs === 'SONUC-YOK' || idObs === 'YOK') return idObs;
  if (idObs === 'AYNEN') return form === 'GECERLI-BICIM' ? 'AYNEN-GERI-YAZMA' : 'YANSIMA';
  return (idObs === 'YENI-KIMLIK' && form === 'GECERSIZ-BICIM') ? 'DEGISTIRME' : 'YABANCI-KIMLIK';
}
/** Başlıksız bölge: API'nin kimlik başlığı yazamayacağı yanıtlar (kaynak okuması) — API öneki DIŞINDAKİ yol ya da ön uçuş. */
function inHeaderlessZone(x) { return x.pathClass === 'ONEK-DISI' || x.method === 'OPTIONS'; }
/** Kalibrasyon (aynı ad, aynı koşum). GECERSIZ: yansıma ya da yabancı kimlik göstergesi var. VAR: gösterge yok + API pozitiflerinde
 *  iki davranış da tam + web pozitiflerinin tamamı ölçülmüş + başlıksız bölgede ölçülen yanıt var. YOK: diğer her durum.
 *  `apiEvidenceUsable`: DEGISTIRME gözlemi API'ye özgü sayılabilir mi — koşumda HİÇ yabancı kimlik göstergesi yok VE başlıksız
 *  bölgede ölçülen en az bir yanıt var (damgalayan katmanın arandığı yer). Eksik kalibrasyon ve yansıma bunu düşürmez. */
function calibrationOf(rows) {
  const m = rows.filter((x) => x.status !== 0); const zone = m.filter(inHeaderlessZone);
  const api = rows.filter((x) => x.vectorClass === 'POZITIF-API'); const web = rows.filter((x) => x.vectorClass === 'POZITIF-WEB');
  const apiG = api.filter((x) => x.sent.requestIdForm === 'GECERLI-BICIM'); const apiX = api.filter((x) => x.sent.requestIdForm === 'GECERSIZ-BICIM');
  const c = { apiPositives: api.length,
    apiWriteBackOf: apiG.length, apiWriteBack: apiG.filter((x) => x.idSignal === 'AYNEN-GERI-YAZMA').length,
    apiReplaceOf: apiX.length, apiReplace: apiX.filter((x) => x.idSignal === 'DEGISTIRME').length,
    webPositives: web.length, webMeasured: web.filter((x) => x.status !== 0).length,
    zoneRows: rows.filter(inHeaderlessZone).length, zoneMeasured: zone.length, zoneHeaderRows: zone.filter((x) => x.idObs !== 'YOK').length,
    reflectionRows: m.filter((x) => x.idSignal === 'YANSIMA' || (inHeaderlessZone(x) && x.idObs === 'AYNEN')).length,
    foreignIdRows: m.filter((x) => x.idSignal === 'YABANCI-KIMLIK' || (inHeaderlessZone(x) && x.idObs !== 'YOK' && x.idObs !== 'AYNEN')).length };
  const positive = c.apiWriteBackOf > 0 && c.apiWriteBack === c.apiWriteBackOf && c.apiReplaceOf > 0 && c.apiReplace === c.apiReplaceOf && c.webPositives > 0 && c.webMeasured === c.webPositives && c.zoneMeasured > 0;
  c.result = (c.reflectionRows > 0 || c.foreignIdRows > 0) ? 'GECERSIZ' : (positive ? 'VAR' : 'YOK');
  c.apiEvidenceUsable = c.foreignIdRows === 0 && c.zoneMeasured > 0;
  return c;
}
/** Katman kimliği — YALNIZ kimlik protokolünden (durum kodu, kalibrasyon, yöntem, yol sınıfı, kimlik anlamı); ipuçları buraya GİRMEZ.
 *  Kanıtın desteklemediği her durumda OLCULEMEYEN. Dönüş: { id, why }. */
function layerIdOf(x, cal) {
  if (x.status === 0) return { id: 'SONUC-YOK', why: 'YANITSIZ' };
  const zone = inHeaderlessZone(x);
  if (x.idSignal === 'DEGISTIRME' && !zone) return cal.apiEvidenceUsable ? { id: 'UYGULAMA-API', why: 'DEGISTIRME-KANITI' } : { id: 'OLCULEMEYEN', why: 'KANIT-KULLANILAMAZ' };
  if (x.idSignal === 'YANSIMA' || (zone && x.idObs === 'AYNEN')) return { id: 'OLCULEMEYEN', why: 'YANSIMA' };
  if (x.idSignal === 'YABANCI-KIMLIK' || (zone && x.idObs !== 'YOK')) return { id: 'OLCULEMEYEN', why: 'YABANCI-KIMLIK' };
  if (x.idSignal === 'AYNEN-GERI-YAZMA') return { id: 'OLCULEMEYEN', why: 'AYIRT-ETMEYEN-GOZLEM' };
  if (x.idObs !== 'YOK') return { id: 'OLCULEMEYEN', why: 'KANIT-KULLANILAMAZ' };
  if (x.pathClass === 'ONEK-DISI') return { id: 'OLCULEMEYEN', why: 'WEB-YOLU' };
  if (x.method === 'OPTIONS') return { id: 'OLCULEMEYEN', why: 'ON-UCUS' };
  if (x.pathClass !== 'API-KESIN') return { id: 'OLCULEMEYEN', why: 'YOL-BELIRSIZ' };
  if (cal.result !== 'VAR') return { id: 'OLCULEMEYEN', why: 'KALIBRASYON-' + cal.result };
  return { id: 'API-DEGIL-CIKARIM', why: 'BASLIK-YOK-KALIBRASYON-VAR' };
}
const countBy = (list, keys, f) => { const m = {}; for (const k of keys) m[k] = 0; for (const x of list) { const k = f(x); if (k !== null && k !== undefined) m[k] = (m[k] || 0) + 1; } return m; };
/** Ad düzeyi DÖRT ALAN. Nedenler ayrı ayrı toplanır; alan değeri: FAIL nedeni varsa FAIL · yoksa ve OLCULEMEYEN nedeni varsa ya da PASS
 *  koşulu birebir sağlanmıyorsa OLCULEMEYEN · aksi PASS. Hiçbir belirsiz durum PASS'a düşmez. */
function verdictsOf(rows, cal) {
  const deny = rows.filter((x) => x.group === 'deny'); const allow = rows.filter((x) => x.group === 'allow');
  const complete = deny.length === DENY.length && allow.length === ALLOW.length;
  const proven = (x) => x.layerId === 'UYGULAMA-API';
  const noDecision = (x) => x.outcome === 'SUNUCU-HATASI-5XX' || x.outcome === 'HIZ-SINIRI-429' || x.outcome === 'SINIFLANAMADI';
  const field = () => { const R = []; return { R,
    add: (value, reason, list) => { if (list.length) R.push({ value, reason, count: list.length, rows: list.map((x) => rows.indexOf(x)) }); },
    flag: (value, reason) => R.push({ value, reason, count: 1, rows: [] }),
    close: (passCondition) => { if (R.some((r) => r.value === 'FAIL')) return 'FAIL'; if (R.length === 0 && !passCondition) R.push({ value: 'OLCULEMEYEN', reason: 'SINIFLANAMAYAN-DURUM', count: 1, rows: [] }); return R.length ? 'OLCULEMEYEN' : 'PASS'; } }; };

  // (a) HTTP / RET SONUCU — yalnız durum kodu ölçütü.
  const H = field();
  H.add('FAIL', 'RET-VEKTORUNE-403-DISI-YANIT', deny.filter((x) => x.status !== 0 && x.status !== 403));
  H.add('OLCULEMEYEN', 'RET-VEKTORU-YANITSIZ', deny.filter((x) => x.status === 0));
  const httpReject = { value: H.close(complete && deny.every((x) => x.status === 403)), reasons: H.R };

  // POZİTİF KONTROL — izin verilen yollar; ret kurallarına karıştırılmaz.
  const P = field();
  P.add('FAIL', 'POZITIF-BEKLENMEYEN-YANIT', allow.filter((x) => x.status !== 0 && !x.statusExpected && x.status !== 403 && !(noDecision(x) && !proven(x))));
  P.add('OLCULEMEYEN', 'POZITIF-REDDEDILDI-403', allow.filter((x) => x.status === 403));
  P.add('OLCULEMEYEN', 'POZITIF-YANITSIZ', allow.filter((x) => x.status === 0));
  P.add('OLCULEMEYEN', 'POZITIF-KANITSIZ-5XX-429', allow.filter((x) => x.status !== 0 && !x.statusExpected && noDecision(x) && !proven(x)));
  const positiveControl = { value: P.close(complete && allow.every((x) => x.statusExpected)), reasons: P.R };

  // (b) KENAR ENGELLEME SONUCU.
  const E = field();
  E.add('FAIL', 'API-YE-ULASTI-KANITLI', deny.filter(proven)); // API'nin 403'ü dahil: kenarda engellenmesi gereken istek API'ye ulaşmıştır
  E.add('FAIL', 'RET-VEKTORU-REDDEDILMEDI-2XX', deny.filter((x) => x.outcome === 'REDDEDILMEDI-2XX'));
  if (cal.result !== 'VAR') E.flag('OLCULEMEYEN', 'KALIBRASYON-' + cal.result);
  E.add('OLCULEMEYEN', 'SINAMA-ISARETLI-403', deny.filter((x) => x.outcome === 'SINAMA-ISARETLI-403'));
  E.add('OLCULEMEYEN', 'TANINMAYAN-AZALTIM-ISARETLI-403', deny.filter((x) => x.outcome === 'TANINMAYAN-AZALTIM-ISARETLI-403'));
  E.add('OLCULEMEYEN', 'AZALTIM-ISARETI-RET-403-DISINDA', rows.filter((x) => x.status !== 0 && x.mitigationMark !== 'YOK' && !(x.group === 'deny' && x.status === 403)));
  E.add('OLCULEMEYEN', 'POZITIF-BEKLENDIGI-GIBI-DEGIL', allow.filter((x) => !x.statusExpected));
  if (rows.length > 0 && rows.every((x) => x.status === 403)) E.flag('OLCULEMEYEN', 'TEKDUZE-403');
  E.add('OLCULEMEYEN', 'YANITSIZ-VEKTOR', rows.filter((x) => x.status === 0));
  if (httpReject.value !== 'PASS') E.flag('OLCULEMEYEN', 'DURUM-KODU-OLCUTU-PASS-DEGIL');
  E.add('OLCULEMEYEN', 'RET-YANITINDA-KATMANI-BELIRSIZ-KIMLIK-BASLIGI', deny.filter((x) => x.status !== 0 && x.idObs !== 'YOK' && !proven(x)));
  const edgePass = complete && deny.every((x) => x.outcome === 'RET-403' && x.idObs === 'YOK') && rows.every((x) => x.mitigationMark === 'YOK') && allow.every((x) => x.statusExpected) && cal.result === 'VAR' && httpReject.value === 'PASS';
  const edgeBlocking = { value: E.close(edgePass), reasons: E.R, scope: KAYIT_EKI };

  // (c) KATMAN DOĞRULAMASI — kanıtın desteklemediği katman kesinliği reddedilir.
  const L = field();
  const notApi = deny.filter((x) => x.layerId === 'API-DEGIL-CIKARIM'); const unverifiable = deny.filter((x) => x.layerId !== 'API-DEGIL-CIKARIM' && !proven(x));
  L.add('FAIL', 'RET-SATIRINI-API-YANITLADI-KANITLI', deny.filter(proven));
  L.add('OLCULEMEYEN', 'KATMANI-DOGRULANAMAYAN-RET-SATIRI', unverifiable);
  const layerVerification = { value: L.close(complete && notApi.length === deny.length), reasons: L.R,
    coverage: { denyRows: deny.length, shownNotApi: notApi.length, provenApi: deny.filter(proven).length, unverifiable: unverifiable.length, unverifiableByReason: countBy(unverifiable, [], (x) => x.layerWhy) } };

  return { httpReject, edgeBlocking, layerVerification, positiveControl };
}
/** Metinde ana makine adının TAM dizgisi geçiyor mu (özet ve sözlük denetimi; büyük/küçük harf duyarsız). Parça yakalamaz. */
function containsName(text) { const t = String(text).toLowerCase(); return [HOST, ORIGIN_URL.host].some((n) => n && t.includes(String(n).toLowerCase())); }
/** Owner'ın ELLE verdiği etikette adın tam dizgisi ya da nokta ile ayrılmış bir ETİKETİ geçiyor mu. Karşılaştırmadan önce iki
 *  tarafta harf / rakam dışı karakterler atılır (noktası tireye çevrilmiş türev de yakalanır); 3 karakterden kısa parça aranmaz. */
function labelLeaksName(label) {
  const norm = (s) => String(s).toLowerCase().replace(/[^a-z0-9]/g, ''); const t = norm(label);
  return [HOST, ORIGIN_URL.host].concat(HOST.split('.')).map(norm).filter((p) => p.length >= 3).some((p) => t.includes(p));
}
// Ön denetim (istek atılmadan): owner etiketi adı ya da bir parçasını, özetin sabit sözlüğü adın tam dizgisini içeriyorsa sonda koşmaz.
if (labelLeaksName(VANTAGE || '') || containsName([REVISION, ALIAS, VANTAGE || '', KAYIT_EKI, EXIT_CODE_MAP, RID_HEADER, 'EXTACC-D8-STAFF-SURFACE-SUMMARY', SCOPE_AUTH.status].concat(OUTCOMES, LAYER_IDS, LAYER_WHYS, ID_OBS, ID_SIGNALS, RID_FORMS, ERROR_CLASSES, VECTOR_CLASSES, FIELD_VALUES, SCOPE_REQUIRED_TYPES, [SCOPE_TUNNEL_TYPE]).join(' '))) reject('konum etiketi ana makine adını ya da bir etiketini içeriyor (ya da özet sözlüğü adı içeriyor) — adsız özet yazılamaz');
if (!PHONE && (fs.existsSync(OUT) || fs.existsSync(SUMMARY_OUT))) reject('kanıt ya da özet dosyası zaten var — başka bir koşumun / adın kanıtının üzerine yazılmaz');

/** Kimlik taşıyabilecek istek başlıkları (ölçüm: gönderilen başlık adları bunlarla karşılaştırılır). */
const CREDENTIAL_HEADERS = /^(authorization|cookie|x-api-key|proxy-authorization)$/i;
/** Ham request-target korunur: URL string DEĞİL, seçenek nesnesi (path olduğu gibi gider).
 *  Dönüşte `sent` = gerçekten gönderilen başlık adları + gövde (POST/PUT/PATCH '{}', diğerleri '') + gönderilen istek kimliği ve biçimi. */
function req(method, path, form) {
  const requestId = newRequestId(form);
  const headers = { host: ORIGIN_URL.host, 'user-agent': 'extacc-d8-probe', 'content-type': 'application/json', accept: '*/*', [RID_HEADER]: requestId };
  const body = (method === 'POST' || method === 'PUT' || method === 'PATCH') ? '{}' : '';
  const sent = { headerNames: Object.keys(headers), body, requestId, requestIdForm: form };
  return new Promise((resolve) => {
    const r = https.request({ host: HOST, port: PORT, path, method, servername: HOST, headers, timeout: TIMEOUT_MS }, (res) => {
      let b = ''; res.setEncoding('utf8'); res.on('data', (c) => { if (b.length < 4096) b += c; });
      const done = () => resolve({ status: res.statusCode, body: b, headers: res.headers, sent });
      res.on('end', done); res.on('close', done); res.on('error', done);
    });
    r.on('timeout', () => r.destroy(Object.assign(new Error('zaman aşımı'), { code: 'D8_TIMEOUT' })));
    r.on('error', (e) => resolve({ status: 0, errorClass: errorClassOf(e), sent }));
    if (body) r.write(body);
    r.end();
  });
}
/** Server başlığından yalnız ürün ADI (sürüm/ek bilgi atılır): 'Caddy', 'cloudflare', 'nginx', ''. */
function serverName(h) { const v = String((h && h.server) || '').trim(); return v.split(/[\s/;,]/)[0].slice(0, 20); }
/** Katman ipuçları AYRI alanlarda; hiçbiri katman kimliği DEĞİLDİR (yalnız kısıtlı ham kanıtta; adsız özete girmez). */
function hintsOf(r) {
  const h = r.headers || {}; const body = String(r.body || '');
  return { bodyEmpty: body.trim() === '', providerSignature: /cloudflare|error code:\s*10\d\d|cf-error/i.test(body),
    edgeHeaderPresent: !!h['cf-ray'], serverHeaderValue: serverName(h), cfMitigatedPresent: h[MITIGATION_MARK.header] !== undefined };
}
/** Katman İPUCU (kanıt değil): Server 'Caddy' → 'caddy' · sağlayıcı gövde imzası + sağlayıcı Server → 'edge-provider' · aksi null. */
function layerHintOf(r, hints) {
  if (r.status !== 403) return null;
  const s = hints.serverHeaderValue.toLowerCase();
  if (s === 'caddy') return 'caddy';
  if (hints.providerSignature && s === 'cloudflare') return 'edge-provider';
  return null;
}
const row = (grp, name, method, path, r, expect, ifPassed) => {
  const measuredRow = r.status !== 0; const hints = measuredRow ? hintsOf(r) : null; const pathClass = pathClassOf(path);
  const idObs = idObsOf(measuredRow, measuredRow ? (r.headers || {})[RID_HEADER] : undefined, r.sent.requestId);
  const mitigationMark = measuredRow ? mitigationMarkOf(r.headers) : null; // sınıf (YOK / SINAMA / TANINMAYAN); başlığın değeri yazılmaz
  return { group: grp, vectorClass: vectorClassOf(grp, method, pathClass, ifPassed), name, method, path, pathClass, status: r.status, expected: expect,
    statusExpected: measuredRow && expect.includes(r.status), outcome: outcomeOf(r.status, mitigationMark), mitigationMark, errorClass: r.errorClass || null,
    idObs, idSignal: idSignalOf(idObs, r.sent.requestIdForm), layerId: null, layerWhy: null,
    layerHint: hints ? layerHintOf(r, hints) : null, hints, ifPassed: grp === 'deny' ? ifPassed : null, sent: r.sent };
};

(async () => {
  if (PHONE) {
    const list = ['/auth/login', '/', '/api/auth/me', '/api/portal/admin/documents/pending', '/api/cases'];
    console.log(`TELEFON — ${ALIAS} (Wi-Fi KAPALI, mobil veri, gizli sekme) — her adres için ne gördüğünüzü not edin (E = hata/erişim engellendi · S = sayfa/veri açıldı · ?):`);
    list.forEach((p, i) => console.log(`  ${i + 1}. ${ORIGIN}${p}`));
    console.log('Beyan makine ölçümü DEĞİLDİR ve yalnız bu ad içindir; koşucu kanıtı ayrı dosyadadır. Bu çağrı istek atmaz.');
    return;
  }
  const t0 = new Date().toISOString(); const rows = [];
  for (const [name, method, path, fx] of DENY) rows.push(row('deny', name, method, path, await req(method, path, ridFormOf('deny', 0)), [403], fx));
  const ordinal = { 'ONEK-DISI': 0, API: 0 }; // pozitifler: kendi sınıfı (web / API) içindeki sıra
  for (const [name, method, path, exp] of ALLOW) { const k = pathClassOf(path) === 'ONEK-DISI' ? 'ONEK-DISI' : 'API'; rows.push(row('allow', name, method, path, await req(method, path, ridFormOf('allow', ordinal[k]++)), exp, null)); }
  const calibration = calibrationOf(rows);
  for (const x of rows) { const l = layerIdOf(x, calibration); x.layerId = l.id; x.layerWhy = l.why; }
  const verdict = verdictsOf(rows, calibration); const exitCode = exitCodeOf(verdict);
  const deny = rows.filter((x) => x.group === 'deny'); const allow = rows.filter((x) => x.group === 'allow');
  const coverage = {}; for (const k of VECTOR_CLASSES) { const v = deny.filter((x) => x.vectorClass === k); coverage[k] = { of: v.length, measured: v.filter((x) => x.status !== 0).length, rejected403: v.filter((x) => x.outcome === 'RET-403').length }; }
  const outcomeCounts = { deny: countBy(deny, OUTCOMES, (x) => x.outcome), allow: countBy(allow, OUTCOMES, (x) => x.outcome) };
  const idSignalCounts = { deny: countBy(deny, ID_SIGNALS, (x) => x.idSignal), allow: countBy(allow, ID_SIGNALS, (x) => x.idSignal) };
  const layerCounts = { deny: countBy(deny, LAYER_IDS, (x) => x.layerId), allow: countBy(allow, LAYER_IDS, (x) => x.layerId) };
  const errorClassCounts = countBy(rows.filter((x) => x.status === 0), ERROR_CLASSES, (x) => x.errorClass);
  // İPUCU dağılımları (kanıt değil; yalnız ham kanıtta): 403 ret satırlarında Server / gövde imzası ipucu + dolu gövdeli, sağlayıcı imzasız 403 sayısı.
  const denyLayerHints = deny.filter((x) => x.status === 403).reduce((m, x) => { const k = x.layerHint || 'none'; m[k] = (m[k] || 0) + 1; return m; }, {});
  const hintFullBody403 = rows.filter((x) => x.status === 403 && x.hints && !x.hints.bodyEmpty && !x.hints.providerSignature).length;
  // ÖLÇÜM (istek döngüsünden türetilir): kimlik başlığı gönderilen istek sayısı; '' veya '{}' dışı gövdeli istek sayısı; gövde dağılımı.
  const bodies = rows.reduce((m, x) => { const k = x.sent.body === '' ? 'empty' : (x.sent.body === '{}' ? 'emptyJson' : 'other'); m[k] = (m[k] || 0) + 1; return m; }, {});
  const measured = { requestCount: rows.length, credentialHeaderRequests: rows.filter((x) => x.sent.headerNames.some((h) => CREDENTIAL_HEADERS.test(h))).length,
    nonEmptyBodyRequests: bodies.other || 0, bodies };
  const requestProfile = { headerNames: Array.from(new Set(rows.reduce((a, x) => a.concat(x.sent.headerNames), []))), userAgentClass: 'extacc-d8-probe',
    requestCount: measured.requestCount, credentialHeaderRequests: measured.credentialHeaderRequests, nonEmptyBodyRequests: measured.nonEmptyBodyRequests,
    distinctRequestIds: new Set(rows.map((x) => x.sent.requestId)).size,
    requestIdForms: { deny: countBy(deny, RID_FORMS, (x) => x.sent.requestIdForm), allowApi: countBy(allow.filter((x) => x.vectorClass === 'POZITIF-API'), RID_FORMS, (x) => x.sent.requestIdForm), allowWeb: countBy(allow.filter((x) => x.vectorClass === 'POZITIF-WEB'), RID_FORMS, (x) => x.sent.requestIdForm) } };
  const finishedAt = new Date().toISOString();
  const strip = (f) => Object.assign({}, f, { reasons: f.reasons.map((r) => ({ value: r.value, reason: r.reason, count: r.count })) });
  // ADSIZ ÖZET (KISITLI; depoya konmaz). Ad, hata metni, yönlendirme hedefi, yol düzeyinde bulgu, kanıt dosyası yolu / özeti İÇERMEZ.
  // Public satıra bu özetten YALNIZ dört alanın değeri ve ad kimliği aktarılır (paket belgesi §1b).
  const summary = { record: 'EXTACC-D8-STAFF-SURFACE-SUMMARY', revision: REVISION, nameAlias: ALIAS, vantage: VANTAGE, probeSha256: SELF_SHA, vectorSetId: VECTOR_SET_ID,
    scopeAuthorization: SCOPE_AUTH, vectorCounts: { deny: DENY.length, allow: ALLOW.length, total: DENY.length + ALLOW.length }, requestProfile, coverage, outcomeCounts, errorClassCounts, idSignalCounts, layerCounts, calibration,
    nameVerdict: { httpReject: strip(verdict.httpReject), edgeBlocking: strip(verdict.edgeBlocking), layerVerification: strip(verdict.layerVerification), positiveControl: strip(verdict.positiveControl) },
    exitCodeMap: EXIT_CODE_MAP, startedAt: t0, finishedAt, exitCode };
  const summaryText = JSON.stringify(summary, null, 1);
  const summaryRefused = containsName(summaryText);
  const summarySha256 = summaryRefused ? null : crypto.createHash('sha256').update(Buffer.from(summaryText, 'utf8')).digest('hex').toUpperCase();
  const failRows = new Set(); for (const f of [verdict.httpReject, verdict.edgeBlocking, verdict.layerVerification, verdict.positiveControl]) for (const r of f.reasons) if (r.value === 'FAIL') for (const i of r.rows) failRows.add(i);
  const findings = rows.filter((x, i) => failRows.has(i));
  const out = { record: 'EXTACC-D8-STAFF-SURFACE-PROBE', revision: REVISION, nameAlias: ALIAS, originHost: ORIGIN_URL.host, vantage: VANTAGE, probeSha256: SELF_SHA, vectorSetId: VECTOR_SET_ID,
    scopeAuthorization: SCOPE_AUTH, startedAt: t0, finishedAt, deny: DENY.length, allow: ALLOW.length, requestProfile, calibration, coverage, outcomeCounts, errorClassCounts, idSignalCounts, layerCounts,
    nameVerdict: verdict, exitCodeMap: EXIT_CODE_MAP, exitCode, summary: { written: false, sha256: null },
    findings: findings.map((x) => `${x.group} ${x.method} ${x.path} → HTTP ${x.status} [${x.outcome} · ${x.idSignal} · ${x.layerId}]`), unmeasured: rows.filter((x) => x.status === 0).length,
    hintsOnly: { denyLayerHints, fullBody403WithoutProviderSignature: hintFullBody403 }, rows,
    design: { credentialsSent: false, writesAttempted: false, note: 'betik TASARIM BEYANI (ölçüm değil): vektör listesinde kimlik bilgisi ve yazma verisi yoktur; ölçüm `measured` alanındadır' },
    measured,
    note: 'ÜÇ AYRI ALAN + POZİTİF KONTROL: nameVerdict.httpReject (yalnız durum kodu ölçütü) · nameVerdict.edgeBlocking (kenar engelleme) · nameVerdict.layerVerification (katman doğrulaması; kapsam sayısıyla) · nameVerdict.positiveControl (izin verilen yollar). Her biri yalnız PASS / FAIL / OLCULEMEYEN alır; birleşik tek PASS yoktur; çıkış 0 kapanış değildir. API\'ye özgü kanıt YALNIZ istek kimliği protokolünden ve aynı koşumun kalibrasyonundan türer (rows[].idObs / idSignal / layerId / layerWhy): GECERSIZ-BICIM gönderilen istekte API\'nin ürettiği biçimde YENİ kimlik = DEGISTIRME; gönderilen değerin AYNEN dönmesi API kanıtı DEĞİLDİR (yansıtan katman göstergesi). Kenar / tünel / sağlayıcı adlandırılmaz. hintsOnly, rows[].hints ve rows[].layerHint İPUCUDUR (Server başlığı, gövde imzası, boş gövde) — kanıt değildir, hiçbir alana ve adsız özete girmez. vantage beyandır (ölçüm değil). Yanıt başlığı değerleri, hata iletileri ve yönlendirme hedefleri kanıta yazılmaz. scopeAuthorization yalnız durum + kalem türleridir (kayıt, yol, özet değeri yazılmaz). Bu dosya ana makine adını içerir (KISITLI); adsız özet de kısıtlıdır; public satıra yalnız dört alanın değeri ve ad kimliği yazılır. Ret listesindeki POST/PUT/PATCH gövdesi boş JSON, DELETE gövdesizdir; hiçbirinde kimlik bilgisi yoktur (measured.credentialHeaderRequests). Kenar geçirirse olası sonuç rows[].ifPassed alanındadır. Owner telefon beyanı ayrı dosyadadır.' };
  // Önce adsız özet yazılır; ham kanıttaki `summary.written` özetin GERÇEKTEN yazıldığını gösterir (yazımdan sonra kesinleşir).
  let summaryFail = summaryRefused ? 'ÖZET ANA MAKİNE ADINI İÇERİYOR — yazılmadı' : null;
  if (!summaryRefused) { try { fs.writeFileSync(SUMMARY_OUT, summaryText, { flag: 'wx' }); out.summary.written = true; out.summary.sha256 = summarySha256; } catch (e) { summaryFail = 'ÖZET YAZILAMADI'; } }
  if (summaryFail) { out.exitCode = 7; out.summary.reason = summaryFail; }
  try { fs.writeFileSync(OUT, JSON.stringify(out, null, 1), { flag: 'wx' }); } catch (e) { console.error('KANIT YAZILAMADI'); process.exit(7); }
  if (summaryFail) { console.error(summaryRefused ? 'ADSIZ ÖZET YAZILMADI: özet içinde ana makine adı geçiyor' : 'ADSIZ ÖZET YAZILAMADI'); process.exit(7); }
  for (const x of rows) console.log(`${x.group.padEnd(5)} ${x.method.padEnd(7)} ${x.path.padEnd(45)} ${String(x.status).padEnd(3)} durum=${x.outcome}${x.errorClass ? '(' + x.errorClass + ')' : ''} kimlik=${x.idSignal} katman=${x.layerId}/${x.layerWhy}${x.layerHint ? ' (ipucu: ' + x.layerHint + ')' : ''}`);
  const why = (f) => (f.reasons.length ? ' — ' + f.reasons.map((r) => `${r.reason}×${r.count}`).join(' · ') : '');
  const cov = verdict.layerVerification.coverage;
  console.log(`\nD-8 SONDA ${REVISION} · ${ALIAS} · kapsam yetkisi ${SCOPE_AUTH.status} · konum (beyan) ${VANTAGE} · vektör kümesi ${VECTOR_SET_ID.slice(0, 16)}… · ret ${DENY.length} + pozitif ${ALLOW.length}`);
  console.log(`  durum kodu (ret vektörleri): ${JSON.stringify(outcomeCounts.deny)}`);
  console.log(`  kalibrasyon: API aynen geri yazma ${calibration.apiWriteBack}/${calibration.apiWriteBackOf} · API değiştirme ${calibration.apiReplace}/${calibration.apiReplaceOf} · web ölçülen ${calibration.webMeasured}/${calibration.webPositives} · başlıksız bölgede ölçülen ${calibration.zoneMeasured}/${calibration.zoneRows}, başlıklı ${calibration.zoneHeaderRows} · yansıma göstergesi ${calibration.reflectionRows} · yabancı kimlik göstergesi ${calibration.foreignIdRows} → ${calibration.result} (API kanıtı ${calibration.apiEvidenceUsable ? 'kullanılabilir' : 'KULLANILAMAZ'})`);
  console.log(`  kimlik anlamı (ret vektörleri): ${JSON.stringify(idSignalCounts.deny)} · ipucu (kanıt değil) ${JSON.stringify(denyLayerHints)}`);
  console.log(`  kimlik bilgisi başlığı taşıyan istek ${measured.credentialHeaderRequests}/${measured.requestCount} · dolu gövde ${measured.nonEmptyBodyRequests} · sonuç yok ${out.unmeasured}`);
  console.log(`HTTP / RET SONUCU  : ${verdict.httpReject.value}${why(verdict.httpReject)}`);
  console.log(`KENAR ENGELLEME    : ${verdict.edgeBlocking.value}${why(verdict.edgeBlocking)}${verdict.edgeBlocking.value === 'PASS' ? ' — ' + KAYIT_EKI : ''}`);
  console.log(`KATMAN DOĞRULAMASI : ${verdict.layerVerification.value} — "API değil" gösterilen ${cov.shownNotApi}/${cov.denyRows} · API kanıtlı ${cov.provenApi} · ölçülemeyen ${cov.unverifiable} ${JSON.stringify(cov.unverifiableByReason)}`);
  console.log(`POZİTİF KONTROL    : ${verdict.positiveControl.value}${why(verdict.positiveControl)}`);
  console.log(`D8-AD=${ALIAS}\nD8-KAPSAM-YETKISI=${SCOPE_AUTH.status}\nD8-HTTP-RET=${verdict.httpReject.value}\nD8-KENAR-ENGELLEME=${verdict.edgeBlocking.value}\nD8-KATMAN-DOGRULAMA=${verdict.layerVerification.value}\nD8-POZITIF-KONTROL=${verdict.positiveControl.value}\nD8-OZET-SHA256=${summarySha256}\nD8-CIKIS=${exitCode}`);
  // Çıkış kodu olay döngüsü boşalınca verilir (son satırlar kesilmesin); boşta bağlantılar kapatılır, takılırsa 3 sn sonra zorla çıkılır.
  process.exitCode = exitCode; https.globalAgent.destroy(); setTimeout(() => process.exit(exitCode), 3000).unref();
})();

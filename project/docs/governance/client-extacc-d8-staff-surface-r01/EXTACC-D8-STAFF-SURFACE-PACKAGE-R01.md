# EXTACC D-8 — PERSONEL YÜZEYİ DIŞARIDAN KAPALI · D-6/D-7 TANIMI · BİRLEŞİK D-9 (R01)

> **DURUM: HAZIRLIK R06 — owner'ın 2026-10-06 kararları işlendi (§3c): kenar engelleme bu sondayla PASS üretmez (kanıt sınırı) ·
> pozitif kontrolde 403 istisnası yok · kapsam yetkisi kapısında birleşik belge kabul edilir, içerik incelemesi dosya bütünlüğünden ayrı
> kaydedilir. AD-1 İÇİN CANLI SONDA 2026-10-06'DA BİR KEZ KOŞULDU (aşağıdaki koşum kaydı; §1b); başka ad ve ikinci koşum için GO YOK.**
> **KOŞUM KAYDI (2026-10-06; owner onayıyla, tek koşum; R06 sonda baytlarıyla — pini §7 "önceki pinler" listesindedir; vektör kümesi §7 ile aynı):** AD-1 satırının sonucu —
> HTTP / ret sonucu `FAIL` · kenar engelleme sonucu `FAIL` · katman doğrulaması `OLCULEMEYEN` · pozitif kontrol `PASS`. Bu bir **ölçüt
> ihlali / bulgu adayıdır**; nedeni ayrı değerlendirilir ve ayrıntısı kısıtlı kayıttadır ("ürün güvenlik kusuru kesinleşti" demek
> değildir; "dışarıdan kapalı" hükmü de değildir). **D-8 kapanmadı.** Diğer yayın adları koşulmadı. Bu belgedeki "canlıda koşulmadı /
> çalıştırılmadı" ifadeleri bu koşumdan önceki revizyon notlarıdır. D-8 kısmi kaydı
> (owner telefonu, 5 GET → 403, 2026-09-27 21:14–21:15) **tamamlanmış sayılmaz**: katman ölçülmedi; diğer yöntem/yollar açık. Bu paket
> makine ölçümünü ve telefon beyanını ayırır.
>
> **R08 (2026-10-06; owner talimatı — §3d-D9) — yerel karşılaştırmalı owner bloğu (yalnız AD-1) + kesinleştirmede kayıtlı ham kanıt
> özeti kapısı. HAZIRLIK: canlıya uygulanmadı, yeni bloklar ÇALIŞTIRILMADI; canlı koşum izni DEĞİLDİR.** R07'de eksik kalan yerel
> karşılaştırmalı ölçüm bloğu ve kesinleştirme bloğu yazıldı (§1d "R08"). **İstek bütçesi (hazırlık bütçesi):** 68 dış + 1 yerel
> karşılaştırma = sondanın attığı 69; sayaç okumaları bu 69'a **dahil değildir** ve blokta yoktur — kullanılırsa ayrı kalemdir: normalde 3
> → toplam **72**, 7'ye çıkarsa en çok **76**. Yöntemler, olası yan etkiler, zaman aşımı ve iptal davranışı §1d'de yazılıdır; "tamamı
> salt okuma, veri değişmez" **denmez**. **Ham kanıt özeti koşum sonunda ayrı kayda alınır; kesinleştirme o değer verilmeden yapılmaz ve
> sonradan değişmiş kanıtı reddeder** (`--evidence-sha256`; sonda "beklenen" değeri dosyadan türetmez). Güven sınırı: kanıt ile ayrı
> kayıt birlikte ve tutarlı değiştirilirse ayırt edilemez (§1d). Owner istisnası `PASS`, HTTP 403 başarısı ya da kenar / katman `PASS`'i
> olarak sunulmaz (R07 kuralı aynen). Sondanın revizyon adı R08'dir; **dar kabul kuralının sürümü R07 kalır** (kural değişmedi). Vektör
> listesi, vektör kümesi kimliği, dış istek profili, dört alanın kuralları ve çıkış kodu eşlemesi **değişmedi**. Yerel istek ve sayaç
> okumaları **ayrı izin kalemleridir**. Pinler değişti (§7). Öz-test 141 kalem (§1c). §1b AD-1 satırı ve 2026-10-06 koşum kaydı aynen.
>
> **R07 (kural sürümü; owner kararı 2026-10-06 — §3d) — dar kabul istisnası; canlıya uygulanmadı, canlı sonda GO'su değildir.**
> R06 kuralıyla bir ret vektörüne gelen 403 dışı her doğrulanmış yanıt durum kodu ölçütünü FAIL yapar. Owner, **yalnız mevcut kodlanmış
> boş baytlı GET vektörü** ("varyant boş bayt kodlu"; ham istek hedefi `/api/portal/cases%00/admin`) için HTTP 400 yanıtına dar bir kabul
> sınıfı tanımladı; sınıfın adı tam olarak **"İzin verilen bozuk istek reddi — katman doğrulanmadı"**dır. **Bu bir owner kabul
> kuralıdır; uygulamaya hiç ulaşılmadığının teknik kanıtı değildir.** Sınıf yalnız beş koşulun **hepsi** tutuyorsa uygulanır (tanımlı
> vektör ve HTTP 400 · incelenmiş hata yanıtının özellikleri · uygulamaya ulaşma kanıtı yok · aynı ham yol ve Host ile yerel kenarda 403 ·
> sonda dışı ek kanıt kullanılıyorsa geçerli ve açıklanamayan artış yok); biri eksik ya da çelişkiliyse istisna yoktur ve R06'nın FAIL /
> ÖLÇÜLEMEYEN kuralları aynen uygulanır (§1.1 "Dar kabul istisnası"). Sınıf: 2xx yanıtları kapsamaz · başka vektöre uygulanmaz · kenar
> engelleme ve katman doğrulamasına PASS vermez · başka bir bulguyu kapatmaz · genel D-8 kabulü üretmez.
> **İstisna uygulanan koşum "HTTP / ret PASS" diye sunulmaz (owner şartı 2026-10-06, §3d-D8):** o koşumda HTTP / ret alanı `PASS`
> değil, ayrı değer **`OWNER-ISTISNASIYLA-UYGUN`** alır; satırın gerçek HTTP kodu **400** olarak kalır ve sınıfın adı ayrı görünür. Bu
> değer 403 başarısı değildir; owner kabul kuralına dayandığını açıkça söyler.
> **Geçmiş koşuma geriye dönük uygulanmaz:** yukarıdaki 2026-10-06 koşum kaydı ve §1b AD-1 satırı (FAIL · FAIL · OLCULEMEYEN · PASS)
> **aynen kalır**; o koşumun kanıtı R06 sonda baytlarıyla yazılmıştır ve R07 sondası onu kesinleştirmeyi reddeder (öz-test MR-9).
> Sondaya iki **isteğe bağlı** girdi ve istek atmayan bir ikinci adım eklendi (§1); verilmezlerse sonda R06 ile **aynı 68 isteği**
> atar ve istisna uygulanmaz. Yerel kenar karşılaştırması verilirse toplam istek **dış 68 + yerel 1 = 69** olur; yerel istek sonraki
> koşum paketinde **ayrı izin kalemidir** (§1a, §3d). **Bu revizyondaki owner bloğu yerel karşılaştırmayı içermez** — o blokla yapılan
> koşumda yerel gözlem yoktur ve istisna **uygulanmaz** (§1d). DEĞİŞMEYENLER: vektör listesi (59 ret + 9 pozitif) ve vektör kümesi
> kimliği, dış istek profili, kenar engelleme / katman doğrulaması / pozitif kontrol kuralları, kanıt sınırı, çıkış kodu eşlemesi (FAIL →
> 2 · FAIL yok → 3; ölçüm koşumu 0 üretmez). Pinler değişti (§7). Öz-test 125 kalem (§1c).
>
> **R06 (2026-10-06) — owner kararlarıyla en küçük düzeltme (takip PR'ı; R05 `main`'dedir: #2942 → `c9f51af1`).** Gerçek API ile
> izole prova (§1.1) şunu ölçmüştü: kenar **yalnız** API'nin 403 yanıtından kimlik başlığını silerse R05 sondası "durum kodu PASS · kenar
> engelleme PASS · çıkış 0" veriyordu — oysa istek API'ye ulaşmıştı. Owner bu sonucu **kabul etmedi** (kararların açık metni §3c).
> Bu revizyonun **geçerli** kuralları:
> **(1) Kanıt sınırı.** Sondanın elindeki tek katman kanıtı "API'nin yeni kimlik üretmesi"dir; o yalnız isteğin API'ye **ulaştığını**
> gösterebilir. İsteğin API'ye ulaş**madığını** gösteren bağımsız hiçbir kanıt sondada yoktur: kimlik başlığının bulunmaması bunu
> kanıtlamaz, pozitif yolların kalibrasyonu da ret yollarında başlığın korunacağını kanıtlamaz. Sonuç: **kenar engelleme ve katman
> doğrulaması bu sondayla `PASS` üretmez** — FAIL yoksa değer `OLCULEMEYEN`'dir (sağlıklı koşumda neden sınıfı
> `ULASMAMA-BAGIMSIZ-KANITI-YOK`; diğer ölçülemeyen nedenlerinden ayrı sınıftır) · "API değil" çıkarımı ve "API değil gösterilen"
> kapsam sayısı **kalktı** · **ölçüm koşumu çıkış 0 üretmez** (herhangi bir alan FAIL → 2 · FAIL yok → 3). Kesin kenar kabulü **sonda
> dışı bağımsız kanıt ve owner değerlendirmesi** gerektirir; yöntem önerisi ayrıca sunulur (bu belge yöntem tanımlamaz).
> **(2) Pozitif kontrol.** İzinli yolda beklenen kod yerine doğrulanmış başka **her** HTTP yanıtı — **403 dahil** — `FAIL`'dir; yanıt
> alınamaması `OLCULEMEYEN` kalır. Beklenmeyen yanıt bir **ölçüt ihlali / bulgu adayıdır**; nedeni ayrı değerlendirilir — "ürün
> güvenlik kusuru kesinleşti" demek **değildir**.
> **(3) Kapsam yetkisi kapısı.** İki kanıt türünün aynı dosyada bulunması tek başına ret nedeni **değildir** (birleşik belge kabul
> edilir); zorunlu olan iki ayrı kanıt unsuru, ad bağı, dosya bütünlüğü ve **içerik incelemesi beyanıdır**. Sonda yalnız dosya
> bütünlüğünü ölçer; içerik incelemesini yalnız "beyan var" diye kaydeder — sahipliği sondanın doğruladığı anlamına gelen durum adı ve
> ifadeler **kalktı**. Tarih denetimi sınır saatlerinde ölçüldü: TSİ / UTC farkı geçerli belgeyi reddetmiyor (kod değişmedi; §1).
> **R05 notlarında ve tarihsel tablolarda geçen şu kurallar R06 ile GEÇERSİZDİR:** "kenar engelleme PASS" ve "çıkış 0" · "`API değil`
> çıkarımı" ve "30 satırda API değil gösterildi" · "pozitif 403 → ÖLÇÜLEMEYEN" · "iki zorunlu kalem aynı dosyayı gösteremez" · kapsam
> yetkisinin "doğrulandı" durum adı. DEĞİŞMEYENLER: vektör listesi (59 ret + 9 pozitif) ve vektör kümesi kimliği, istek profili, kimlik
> bilgisi göndermeme, ham yol sadakati, öz-testin ikame kapısı. Pinler değişti (§7). R06 baytlarıyla gerçek API yinelemesi **dört
> kipte** yapıldı (§1.1 "R06 baytlarıyla yineleme"). Canlı sonda **çalıştırılmadı**; bu revizyon canlı sonda GO'su **değildir**.
>
> **R05 dördüncü tur (2026-10-06; tarihsel — `main`'deki R05) — dar düzeltmeler (iki bağımsız doğrulamanın küçük bulguları + izole provanın ilk koşusu).**
> **(a)** pozitif kontrolde **tek kural**: beklenen kod → uygun · yanıt alınamadı → ÖLÇÜLEMEYEN · 403 → ÖLÇÜLEMEYEN · beklenen
> dışındaki doğrulanmış her başka yanıt → FAIL; hüküm gönderilen kimlik biçimine bağlı değildir (§1.1) · **(b)** kapsam yetkisi kapısı
> eksik kalemin **türünü** adlandırır (§1) · **(c)** katman doğrulamasında **desteksiz kesinlik yok**: koşumun kalibrasyonu API'nin
> "kabul edilmeyen biçim → yeni kimlik" davranışını hiç göstermediyse ret satırındaki "yeni kimlik" kenar engellemede yine FAIL'dir ama
> katman doğrulaması ÖLÇÜLEMEYEN kalır (§1.1) · **(d)** §1b satır biçimi koşum hücresine göre ölçülür; koşum hücresine pin ve vektör
> kümesi kimliği kısa biçimde yazılır · **(e)** §1'de owner'ın asgari ölçütünün ötesindeki koşullar "uygulayıcı sıkılaştırması" diye
> ayrı işaretlendi · **(f)** gerçek API ile izole prova işlendi (ilk koşu + son baytlarla yineleme; §1.1). Vektör listesi ve istek profili **değişmedi**;
> pinler değişti (§7). Canlı sonda çalıştırılmadı.
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
> **R05'in ilk iki turu (2026-10-05; tarihsel — PR'ın commit geçmişindedir).** İlk tur "ret hükmü + katman hükmü" diye iki hüküm ve
> çıkış kodu 5'i getirdi; ikinci tur (üç bağımsız doğrulamanın bulguları üzerine) eşleşen yankıyı ileri kalibrasyon olmadan da API
> kanıtı saydı ve sınama işaretli 403'ü ayrı sınıfa aldı. **Bu üçüncü turla şu kurallar GEÇERSİZDİR:** "ret hükmü `KAPALI` /
> `KAPALI-DEGIL` / `DEGERLENDIRME-GEREKIR`" ve "katman hükmü `ADLANDIRILDI-API` / `ADLANDIRILAMADI`" · "gönderilen kimlik aynen
> döndüyse yanıtı API üretmiştir" · "API'nin ürettiği 403 owner kararı bekliyor (çıkış 5)" · "kanıtsız 5xx / 429 → çıkış 3, kanıtsız
> 3xx / 4xx → çıkış 5" · "ret hükmü kapalı olan adın sayıları ve özet SHA-256'sı public tabloya yazılır". **R04'ten kalan şu kurallar
> da geçersizdir:** "ret vektöründe 403 = tamam", "katman `unknown` ise PASS düşmez", "`suspectAppOrigin403 > 0` ise PASS düşmez",
> "D-8 PASS = sonda çıkış 0 ve telefon 5/5". **Üçüncü turun şu üç kuralı dördüncü turla değişti:** "pozitif vektörde API'den geldiği
> kanıtsız 5xx / 429 / sınıflanamayan kod ÖLÇÜLEMEYEN'dir" (artık FAIL) · "API kanıtlı ret satırı her koşumda katman doğrulamasını FAIL
> yapar" (artık yalnız kalibrasyon o davranışı en az bir kez gösterdiyse) · "kapının ret nedeni yalnız sınıftır" (artık eksik kalemin
> türü de yazılır).
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
(yalnız SHA-256 için; içerik yorumlanmaz, hiçbir yere yazılmaz). **R07:** yalnız istek atmayan kesinleştirme adımında (`--finalize`;
aşağıda) sonda, **aynı adın** ve **aynı sonda baytlarının** yazdığı tek ham kanıt dosyasını da okur; ad kimliği / ana makine / konum
etiketi / sonda pini / vektör kümesi tutmayan kanıt reddedilir (ölçüm çağrısında hiçbir kanıt dosyası okunmaz). `--vantage <etiket>`
owner'ın **beyan ettiği** koşum konumudur (ölçüm değildir).

**Kapsam yetkisi kapısı (owner kararları, §3b-K6 ve §3c-T4).** Birincil ad (AD-1) dışındaki her ad kimliği için sonda, kısıtlı bir
**kapsam yetkisi kaydı** (`--scope-record <dosya>`) olmadan **koşmaz**: istek atılmaz, çıkış 4, ileti tam olarak
`KOŞULMADI — kapsam yetkisi doğrulanmadı` (ikinci satırda ad / yol / özet değeri içermeyen bir neden sınıfı; zorunlu bir kalem
eksikse aynı satırda **eksik kalemin türü** — aşağıda). Kapının varlığı ve **asgari kanıt ölçütü** owner kararıdır: yetkili sağlayıcı
hesabındaki bölge / özel ad kaydı **ve** DNS zinciri; tünel kaydı tek başına yetmez.

**İki ayrı şey ayrı kaydedilir (owner kararı 2026-10-06, §3c-T4): dosya bütünlüğü ve içerik incelemesi.**
- **Dosya bütünlüğü — sondanın ölçtüğü tek şey:** listelenen her kalemin dosyası var, boş değil ve SHA-256'sı kayıttakiyle aynı.
  Kanıtta `fileIntegrity: OLCULDU`. Bu, dosyanın **neyi gösterdiği** hakkında hiçbir şey söylemez.
- **İçerik incelemesi — bir insan incelemesidir:** sonda kanıtın içeriğini **okumaz**, yorumlamaz ve sahipliği **doğrulamaz**.
  Kayıtta inceleyenin beyanı **zorunlu ayrı alandır** (`review`: kim · ne zaman · hangi kalem türleri — iki zorunlu türü de kapsar);
  sonda onu yalnız "beyan var" diye kaydeder (kanıtta `contentReview: BEYAN-VAR`; inceleyenin adı ve tarih hiçbir çıktıya yazılmaz).
  Beyanın doğruluğu ve içeriğin yeterliliği kayıt sahibinin sorumluluğundadır.

Kayıt (JSON; alan adları sondanın başlık yorumundadır) şunları bağlar ve sonda bunları **ölçer** — yalnız "alan dolu mu" diye bakmaz:

| Bağ | Sondanın ölçtüğü | Tutmazsa (neden sınıfı) |
|---|---|---|
| ad kimliği | kayıttaki ad kimliği = `--alias` | `AD-KIMLIGI-UYUSMUYOR` |
| ana makine | kayıttaki ana makine = `--origin` ana makinesi, **birebir** (büyük / küçük harf dışında; alt alan, önek, sondaki nokta, port ekli değer eşleşme değildir) | `ANA-MAKINE-UYUSMUYOR` |
| iki ayrı kanıt unsuru (**owner'ın asgari ölçütü**) | **(i)** yetkili sağlayıcı hesabındaki bölge / özel ad kaydı **ve** **(ii)** DNS zinciri — ikisi de kayıtta **ayrı kalem** olarak var (kalem sayısı değil **tür** ölçülür); tünel kaydı türü tanınır ama zorunlu kalemin yerine **geçmez** | `KALEM-EKSIK` · yalnız tünel kaydı sunulmuşsa `YALNIZ-TUNEL-KAYDI` — ikisinde de aynı satırda **eksik kalemin türü** yazılır: `eksik=<tür>[,<tür>]` (yalnız eksik olan tür; var olan tür, ad, yol, özet değeri yazılmaz) |
| dosya bütünlüğü (her kalem: dosya + SHA-256 + tarih) | kanıt dosyası var, **boş değil** ve SHA-256'sı kayıttakiyle aynı; tarih geçerli; listelenen **her** kalem (ek tünel kalemi dahil) ölçülür | `KANIT-DOSYASI-YOK` · `KANIT-DOSYASI-BOS` · `OZET-TUTMUYOR` · `KALEM-BICIMI-GECERSIZ` |
| içerik incelemesi beyanı | `review` alanı var; inceleyen dolu; inceleme tarihi geçerli; incelenen kalem türleri tanınan türlerdir ve iki zorunlu türü kapsar. Sonda beyanın **içeriğini** değil yalnız varlığını ve tamlığını ölçer | `INCELEME-BEYANI-YOK` · `INCELEME-BEYANI-GECERSIZ` |

**İki ayrı dosya zorunlu değildir (owner kararı 2026-10-06).** Sağlayıcı hesabı kaydı ile DNS zinciri **tek bir birleşik belgede**
bulunabilir: iki kalem aynı dosyayı (ya da aynı içeriği) gösterebilir. Zorunlu olan iki ayrı kanıt **unsurudur** (iki tür, kayıtta iki
ayrı kalem), ad bağı, dosya bütünlüğü ve inceleme beyanı. R05'teki "iki zorunlu kalem aynı dosyayı ya da aynı içeriği gösteremez"
sıkılaştırması **kalktı** (öz-test SA-9).

Eksik kalemin adlandırılması owner kararının ikinci yarısının karşılığıdır ("kanıt eksikse yalnız eksik girdiyi iste"): ret
iletisindeki `eksik=` değeri hangi girdinin isteneceğini söyler (tür adları: `SAGLAYICI-HESABI-KAYDI` · `DNS-ZINCIRI`). Dosyası
bulunamayan ya da özeti tutmayan bir kalemde ileti yalnız neden sınıfını taşır; hangi kalem olduğu kayıttan belirlenir.

**Tarih denetimi — ölçüldü, kod değişmedi (§3c-T4).** Kayıttaki tarihler yalnız `YYYY-AA-GG` biçimindedir. "Gelecekteki tarih kanıt
tarihi olamaz" denetimi UTC gününe göre **bir takvim günü payla** yapılır (tarih ≤ UTC bugün + 1 gün → kabul) ve yerel saat dilimine
bağlı değildir. Sınır saatlerinde ölçülen (sondanın saati sabitlenerek, yerel saat dilimi TSİ; öz-test SA-11 ve depo dışı ölçüm):
yerel gün UTC gününden ilerideyken (TSİ 00:00–03:00) tarihi yerel **bugün** olan belge **kabul edilir** — "gelecekte" diye
reddedilmez; UTC bugün + 2 gün ve sonrası her saatte reddedilir. Aynı ölçüm düzeltme öncesi sonda baytlarında (`main`) da aynı sonucu
verdi: bu yönde bir kusur **yoktu**, düzeltme gerekmedi. **Saatli biçim** (`…T00:30:00+03:00`, `…T21:30:00Z` gibi) her saatte
`KALEM-BICIMI-GECERSIZ` ile reddedilir — bu bir **biçim** reddidir, saat dilimine bağlı değildir; kayıt tarihi tarih-yalnızdır. Payın
yan etkisi: yerel gün UTC günüyle aynıyken "yarın" tarihli kalem de kabul edilir (bir günlük pay bilinçlidir).

**Uygulayıcı sıkılaştırmaları (owner kararı değildir; owner 2026-10-06'da boş dosya ve özet uyuşmazlığı reddinin kalmasını ayrıca
teyit etti — §3c-T4).** Aşağıdaki koşullar owner'ın asgari ölçütünün **ötesindedir**:

| Sıkılaştırma | Sondanın yaptığı | Neden sınıfı |
|---|---|---|
| boş kanıt dosyası kabul edilmez (owner teyidi: "kalsın") | RET, istek atılmaz | `KANIT-DOSYASI-BOS` |
| gelecekteki tarih kanıt tarihi olamaz (bir günlük payla; yukarıda) | RET, istek atılmaz | `KALEM-BICIMI-GECERSIZ` |
| AD-1 ile kapsam yetkisi kaydı **verilmez** | `--scope-record` AD-1 ile verilirse sonda durur (kapı, çıkış 4); kayıt sessizce yok sayılmaz | — |
| kapı telefon listesi çağrısında da geçerlidir | AD-1 dışındaki ad için adres listesi kayıtsız yazdırılmaz (çıkış 4, aynı ileti) | kapının neden sınıfları |

Kayıt ve kanıt dosyaları **kısıtlıdır** (depoya girmez): ham kanıta ve adsız özete yalnız **durum + dosya bütünlüğü durumu + içerik
incelemesi beyanı durumu + kalem türleri** yazılır; ad, yol, özet değeri, tarih ve inceleyen yazılmaz. Kayıt kabul edildiğinde durum
`KAYIT-KABUL-EDILDI`'dir ve sondanın çıktısındaki metin şudur (public satıra da bu yazılır, §1b):
`kapsam yetkisi kaydı kabul edildi — dosya bütünlüğü ölçüldü; içerik incelemesi beyanı kayıt sahibinde`. Sonda sahipliği doğrulamaz ve
hiçbir çıktısında bunu ima eden bir ifade kullanmaz. AD-1 için kapı yoktur: birincil adı owner bloğu canlı yapılandırmadan okur (§1d).
**Sınır (ölçülemez):** sonda, AD-1 ad kimliğiyle koşulan adın gerçekten birincil ad olduğunu ölçemez; bu bağ yalnız owner bloğundadır
(blok adı canlı yapılandırmadan okur ve yalnız AD-1 için yazılmıştır). Başka ad için owner bloğu **yazılmamıştır** (kapsam ve ad başına
GO ayrıca — §3c).

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
kapsam kalemidir (§3c, açık kalan kararlar); GO verilmemiştir.

**Ham request-target korunur:** istek `https.request({host, port, path, method, servername})` ile atılır; `path` vektördeki ham
dizedir (`/api/portal/./admin/...`, `%2F`, `?x=1` normalize edilmez). Öz-test S1-p bunu kenarın gördüğü `req.url` ile birebir
doğrular; URL-string ile istek atan kopya bu testte düşer.

**R07 — isteğe bağlı iki girdi ve istek atmayan ikinci adım (yalnız dar kabul istisnası için; kural §1.1'de, owner kararı §3d'de).**
Verilmezlerse sonda R06 ile **aynı 68 isteği** atar; istisna uygulanmaz.

| Girdi | Ne yapar | Tanınmayan değer |
|---|---|---|
| `--local-edge http://127.0.0.1:<port>` (yalnız bu biçim) | **yerel kenar karşılaştırması:** dış 68 isteğin **hepsinden sonra**, yalnız tanımlı tek vektörü (GET, aynı ham istek hedefi), **dış adın Host başlığıyla**, geri döngüdeki yerel kenara düz http ile **bir kez** gönderir. Yeniden deneme ve yönlendirme takibi yoktur; kimlik bilgisi ve gövde yoktur; istek kimliği başlığı ret vektörlerindeki gibi kabul edilmeyen biçimdedir. İstek kanıta **ayrı kayıt** olarak yazılır (`localEdgeComparison`; satır listesinde değildir) ve toplam istek sayısına **dahildir** (`measured.requestCount` = dış 68 + yerel 1; `externalRequests` / `localEdgeRequests` ayrı). Yalnız geri döngü **adresi** `127.0.0.1` kabul edilir — ad çözümlemesine bağlı olmamak için `localhost` adı da **kabul edilmez**: başka ad / adres, https, yol / sorgu / kimlik, portsuz değer kapıdır | kapı, çıkış 4, istek atılmaz |
| `--offprobe-evidence KULLANILMIYOR` \| `KULLANILACAK` | **sonda dışı ek kanıt beyanı** (owner beyanıdır; ölçüm değildir). Sonda o kanıtı ölçmez, nasıl elde edildiğini bilmez ve hiçbir çıktısında anlatmaz (yöntem kısıtlı kayıttadır). `KULLANILMIYOR`: bu satırın değerlendirmesinde ek kanıt kullanılmıyor. `KULLANILACAK`: kullanılacak, sonucu koşumdan **sonra** oluşur → sınıf koşum anında **kesinleşmez**. Beyan verilmezse eksik kanıt sayılır | kapı, çıkış 4, istek atılmaz (sonuç değerleri koşum anında verilemez) |
| `--finalize <kanıt.json> --evidence-sha256 <koşum sonunda kayda alınmış SHA-256> --offprobe-result GECERLI-ACIKLANAMAYAN-ARTIS-YOK` \| `GECERSIZ-YA-DA-ACIKLANAMAYAN-ARTIS` `--out <kesinleştirme.json>` (aynı `--alias` / `--vantage` / `--origin` ile) | **kesinleştirme adımı — istek atmaz.** **Kayıtlı özet kapısı (R08):** `--evidence-sha256` zorunludur ve koşum **sonunda ayrı kayda alınmış** ham kanıt SHA-256'sıdır; sonda bu değeri dosyadan **türetmez** — dosyanın gerçek özetini hesaplar ve **verilen** değerle karşılaştırır; farklıysa kesinleştirme yapılmaz (`KANIT-OZETI-KAYITLA-UYUSMUYOR`; içerik yorumlanmadan önce), yoksa / 64 onaltılık hane değilse kapıdır. Kesinleştirme kaydına ikisi de yazılır (`registeredEvidenceSha256` = verilen · `sourceEvidenceSha256` = hesaplanan). Yalnız `KULLANILACAK` beyanlı kanıtı, owner'ın verdiği sonuçla yeniden değerlendirir: kalibrasyon, katman kimliği, dar sınıf kararı ve dört alan kanıttaki **satırlardan yeniden türetilir** (kanıttaki eski hükme güvenilmez). İncelenmiş yanıt özeti kararda kanıttaki **ham değerle** karşılaştırılır; türetilmiş "eşleşti" alanı karara girmez. Kanıt **kendi içinde tutarsızsa** reddedilir: yeniden türetilen dört alan, çıkış kodu ya da **beş koşul** kanıttaki kayıtla aynı değilse; ya da tanımlı satırın türetilmiş "özet eşleşti" alanı ham özetle çelişiyorsa — yalnız türetilmiş alanı elle çevrilmiş kanıt kabul edilmez (öz-test MR-9). Kaynak kanıtın üzerine yazmaz; ana makine adı içermeyen **ayrı bir kesinleştirme kaydı** yazar (kaynak kanıtın SHA-256'sı, kaynak koşumun alan değerleri, yeni dar sınıf kaydı, yeni dört alan, çıkış kodu). Çıkış kodu aynı eşlemeyle türer (2 / 3) | kapı, çıkış 4: kanıt okunamadı / biçimi geçersiz / **bu sonda baytlarıyla, bu revizyonla, bu vektör kümesiyle yazılmamış** (geçmiş koşuma geriye dönük uygulanmaz) / bu ad için değil / satırları vektör listesiyle aynı değil / kanıtta kesinleştirilecek beyan yok / kendi içinde tutarsız / **kanıtın özeti kayıtlı değerle aynı değil** / kayıtlı özet verilmemiş ya da biçimsiz; ölçüm ya da telefon parametresiyle birlikte verilmiş; kayıt dosyası zaten var |

Kesinleştirme adımının **sınırları (ölçülemez):** ham değerleri, türetilmiş alanları ve koşul kaydı **birlikte ve
tutarlı biçimde** yeniden yazılmış bir kanıt dosyasını adım **ayırt edemez** (öz-test MR-9 bunu sınır kaydı olarak ölçer: böyle bir kanıtta
sınıf uygulanır). Bu yüzden **ham kanıtın SHA-256'sı koşum SONUNDA ayrı kayda alınır** (§1d R08 bloğu bunu yazdırır ve kanıt dizininin
dışına yazar) ve kesinleştirme o değer **verilmeden yapılmaz**: sonda kanıt dosyasının gerçek özetini verilen değerle karşılaştırır ve
eşit değilse kesinleştirmez (R08 — kayıtlı özet kapısı; öz-test MR-11). **Bu kapının güven sınırı:** kanıt dosyası ile ayrı kayıt
**birlikte** ve tutarlı biçimde değiştirilirse (ve yeni değer verilirse) sonda bunu ayırt edemez; korunma, ayrı kaydın kanıt dizininin
dışında ve bağımsız bir yerde (koşum çıktısının alındığı kısıtlı kayıt / manifest) tutulmasına dayanır — her ikisine de yazma erişimi
olan biri için teknik engel değildir. Adım ayrıca sonucun (beyanın) doğruluğunu ölçemez; aynı kanıt için ikinci bir kesinleştirmeyi engelleyemez (iki
farklı sonuçla iki kayıt varsa bu **çelişkili kanıttır** ve istisna kabul edilmez — kayıt sahibinin kuralıdır, sonda ölçmez).

### 1.1 Üç ayrı alan + pozitif kontrol; API'ye özgü kanıt; kanıt sınırı

Aynı durum kodunu birden çok katman üretebilir (403: kenar varsayılan reddi · sağlayıcı kuralı · sınama sayfası · uygulama; 404: tünel
varsayılanı · web · API; 5xx: zincir hatası · uygulama). Bu yüzden sonda, owner'ın 2026-10-05 ve 2026-10-06 kararlarıyla (§3b, §3c),
ad düzeyinde **üç ayrı alan** ve ayrı bir **pozitif kontrol** kaydı üretir (kanıtta `nameVerdict { httpReject, edgeBlocking,
layerVerification, positiveControl }`). Her biri yalnız `PASS` / `FAIL` / `OLCULEMEYEN` değerini alır (tek ek değer — R07: yalnız HTTP /
ret alanında ve yalnız dar kabul istisnası uygulanan koşumda `OWNER-ISTISNASIYLA-UYGUN`; `PASS` değildir — aşağıda); hiçbiri diğerinin yerine geçmez;
ikisini birleştiren tek bir "PASS" ya da "D-8 PASS" **üretilmez**. Her alanın nedenleri (`reasons`) ayrı ayrı yazılır. Hiçbir belirsiz
durum PASS'a düşmez.

**Kanıt sınırı (owner kararı 2026-10-06, §3c-T2).** Bu sondanın elindeki tek katman kanıtı "API'nin yeni kimlik üretmesi"dir
(aşağıda "istek kimliği protokolü") ve o yalnız isteğin API'ye **ulaştığını** gösterebilir. İsteğin API'ye **ulaşmadığını** gösteren
bağımsız hiçbir kanıt sondada yoktur:
- kimlik başlığının **bulunmaması** bunu kanıtlamaz — zincirde yalnız API'nin ret yanıtından başlığı silen bir katman varsa API'ye
  ulaşan istek, kenarın reddettiği istekle dışarıdan **aynı** görünür (gerçek API ile izole provada ölçüldü; aşağıda);
- pozitif yolların kalibrasyonu, ret yollarında başlığın korunacağını kanıtlamaz.

Bu yüzden **kenar engelleme ve katman doğrulaması alanları bu sondayla `PASS` üretmez** ve **ölçüm koşumu çıkış 0 üretmez**. Sağlıklı
kenar ile başlığı silinmiş API reddi ayırt edilemediği için ikisine de kenar engelleme PASS verilmez; ikisi de `OLCULEMEYEN`'dir.
Kesin kenar kabulü **sonda dışı bağımsız kanıt ve owner değerlendirmesi** gerektirir; yöntem önerisi ayrıca sunulur (bu belge yöntem
tanımlamaz ve bu iş için yeni ürün telemetrisi ya da mimari değişiklik getirmez).

**(a) HTTP / ret sonucu** (`httpReject`) — yalnız **durum kodu ölçütü**, yalnız ret vektörleri; yanıtı hangi katmanın ürettiği bu
alana girmez. Bu alan `PASS` üretebilir; PASS yalnız "bütün ret vektörleri 403 aldı" demektir, kenar engellemesi demek **değildir**:

| Değer | Koşul |
|---|---|
| `PASS` | bütün ret vektörleri 403 (sınama işaretli 403 de durum kodu olarak 403'tür; kenar hükmü (b)'dedir — §3b-K3). **R07:** dar kabul istisnası uygulanan koşum `PASS` **almaz** (aşağıdaki son satır) |
| `FAIL` | en az bir ret vektörüne **doğrulanmış** başka bir HTTP yanıtı geldi — hangi kod olursa olsun: 2xx · 3xx · 403 dışı 4xx · 429 · 5xx · sınıflanamayan kod (§3b-K5). **R07:** dar sınıfın **uygulandığı** tek satır bu kuralın dışındadır; sınıfın uygulanmadığı ya da kesinleşmediği satır bu kuralla `FAIL`'dir |
| `OLCULEMEYEN` | FAIL yok ama **yanıt alınamayan** ret vektörü var (taşıma hatası). FAIL ile tek etikette birleşmez |
| `OWNER-ISTISNASIYLA-UYGUN` (R07; **yalnız bu alanda**; owner şartı §3d-D8) | FAIL nedeni yok, ölçülemeyen nedeni yok ve **tam bir** satır aşağıdaki dar kabul sınıfında: istisna dışındaki bütün ret vektörleri 403 aldı; o tek satırın **gerçek HTTP kodu 400'dür** ve öyle kaydedilir (`status` 400 · `outcome` `DORTYUZ-403-DISI` · `acceptedClass` = sınıfın adı). Bu değer `PASS` **değildir** ve **403 başarısı değildir**: toplu uygunluğun **owner istisnasına dayandığını** açıkça söyler; kenar engelleme ya da katman doğrulaması için `PASS` üretmez (o iki alan ve pozitif kontrol bu değeri hiç almaz ve görmez). O satır "403" **sayılmaz**; sayılar kanıtta `httpReject.counts` alanında ayrı tutulur. Çıkış kodu eşlemesinde FAIL değildir (FAIL yok → 3). Çıktıda `D8-HTTP-RET=OWNER-ISTISNASIYLA-UYGUN` ve `HTTP / RET SONUCU` satırında açık cümle (öz-test MR-10) |

**Dar kabul istisnası — "İzin verilen bozuk istek reddi — katman doğrulanmadı" (owner kararı 2026-10-06; kural sürümü R07 — §3d).**
**Bu bir owner kabul kuralıdır; uygulamaya hiç ulaşılmadığının teknik kanıtı değildir.** Yanıtı hangi katmanın ürettiği bu sondayla
ölçülemez (kanıt sınırı aynen geçerlidir); sınıf yalnız (a) alanında **tek bir satırın** durum kodu ölçütünü tek başına `FAIL`
yapmamasıdır. O koşumda (a) alanı `PASS` değil `OWNER-ISTISNASIYLA-UYGUN` değerini alır; satırın gerçek HTTP kodu (400) ve sınıfın adı ayrı
görünür. "Sağlayıcıda erken ret kanıtlandı" **denmez**.

*Kapsam — satır numarasıyla değil, değişmez tanımla sabittir* (liste sırası değişse de başka isteğe taşınmaz; öz-test MR-2, MR-7):
vektör kimliği `D8E2-BOS-BAYT-KODLU` = ret listesindeki "varyant boş bayt kodlu" vektörü **+** yöntem `GET` **+** ham istek hedefi
`/api/portal/cases%00/admin`. Üçü de birebir tutmalı ve ret listesinde **tam bir** vektör bu tanımla eşleşmelidir.

*Koşullar — hepsi* (kanıtta `malformedRejectClass.conditions`; her koşul ayrı kaydedilir):

| # | Koşul | Sondanın ölçtüğü / kaydettiği | Tutmazsa neden sınıfı |
|---|---|---|---|
| 1 | tam olarak tanımlı vektör ve HTTP 400 | tanımlı satırın durum kodu 400 (2xx dahil başka her kod istisna dışıdır) | `TANIMLI-VEKTOR-HTTP-400-DEGIL` (tanım tam bir vektörle eşleşmiyorsa ayrıca `TANIM-TEK-VEKTORLE-ESLESMIYOR`) |
| 2 | incelenmiş hata yanıtı özellikleriyle uyum — yalnız genel bir sağlayıcı başlığı **yeterli değildir** | içerik türü tam `text/html` · gövde tam **155 bayt** · gövdenin SHA-256'sı `EFCA0895B4D88B27A94249F8E7AC0083EFF0A4FF3AC37C2841B3F6D7E11C1905` — üçü birlikte; özet kanıttaki **ham değerle** karşılaştırılır (türetilmiş "eşleşti" alanıyla değil). Bu üç **değer** owner metninde yoktur (owner "incelenmiş hata yanıtı özellikleriyle uyum" dedi): 2026-10-06 teşhis ölçümünde incelenen yanıttan uygulayıcı tarafından sabitlenmiştir (ölçüm kısıtlı kayıttadır). `Server` başlığı ve gövde imzası ipucudur; bu karara **girmez** | `INCELENMIS-YANIT-OZELLIKLERI-UYUSMUYOR` |
| 3 | uygulama kimliği ya da başka olumlu uygulamaya ulaşma kanıtı yok | o yanıtta kimlik başlığı **hiç** yok (yeni kimlik, yansıma ve yabancı kimlik dahil her kimlik başlığı istisnayı geçersiz kılar) ve satır API kanıtlı değil | `UYGULAMAYA-ULASMA-KANITI-VAR-YA-DA-CELISKILI` |
| 4 | aynı ham yol ve ad bağlamıyla (Host) yerel kenarda 403 gözlemi | `--local-edge` ile atılan tek isteğin yanıtı 403 ve kimlik başlıksız. Parametre verilmediyse, yanıt 403 değilse ya da alınamadıysa koşul tutmaz | `YEREL-KENAR-403-GOZLEMI-YOK` |
| 5 | bu değerlendirmede sonda dışı ek kanıt (sayaç kanıtı) kullanılıyorsa geçerlilik koşulları sağlanmış ve açıklanamayan artış yok | sonda bu kanıtı **ölçmez**; owner beyanını kaydeder: `KULLANILMIYOR` → koşul uygulanmaz · `KULLANILACAK` + kesinleştirme sonucu `GECERLI-ACIKLANAMAYAN-ARTIS-YOK` → sağlandı | beyan yok → `EK-KANIT-BEYANI-YOK` · beyan `KULLANILACAK`, sonuç verilmedi → `EK-KANIT-SONUCU-YOK` · sonuç `GECERSIZ-YA-DA-ACIKLANAMAYAN-ARTIS` → `EK-KANIT-GECERSIZ-YA-DA-ACIKLANAMAYAN-ARTIS` |

*Durum* (kanıtta ve adsız özette `malformedRejectClass.state`; çıktıda `D8-DAR-SINIF=` satırı): `UYGULANDI` — beş koşulun hepsi tutuyor ·
`KESINLESMEDI-EK-KANIT-SONUCU-YOK` — eksik olan **yalnız** ek kanıtın sonucudur (beyan `KULLANILACAK`); sınıf **uygulanmaz**, satır
`FAIL`'dir, çıkış 2; sonuç kesinleştirme adımıyla verilir (§1) · `UYGULANMADI` — diğer her durum. **Olumlu uygulamaya ulaşma kanıtı
istisnayı geçersiz kılar. Eksik veya çelişkili kanıt istisnaya kabul edilmez; mevcut FAIL / ÖLÇÜLEMEYEN kuralları uygulanır.**

*Sınıfın yapmadıkları:* 2xx yanıtları kapsamaz · başka vektörlere uygulanmaz · **kenar engelleme veya katman doğrulamasına PASS
vermez** — o iki alan sınıfı **görmez**: istisna uygulanan koşumda, uygulanmayan aynı girdideki değer ve nedenlerle **birebir aynıdır**
(o satır 403 almamıştır; kenar engelleme nedeni `DURUM-KODU-OLCUTU-PASS-DEGIL` olarak kalır — burada "durum kodu ölçütü" istisnasız
ölçüttür, yani "bütün ret vektörleri 403"; sınıf koşumu "temiz gözlem" sınıfına da taşımaz; öz-test MR-8) · başka bir bulguyu
kapatmaz · genel D-8 kabulü üretmez · çıkış kodu eşlemesini değiştirmez (istisna uygulanan ve başka FAIL olmayan koşum **3** verir) · HTTP / ret alanında
`PASS` üretmez (değer `OWNER-ISTISNASIYLA-UYGUN`'dur; "403 başarısı" diye sunulmaz).

*Kayıt:* uygulandığında o satır `acceptedClass` alanında sınıfın **tam adını** taşır (durum kodu sınıfı `DORTYUZ-403-DISI` olarak
kalır); sınıfın adı ve "owner kabul kuralı; teknik kanıt değildir" cümlesi çıktıda, ham kanıtta ve adsız özette yer alır. Adsız özete
ham yol, yöntem ve yerel adres yazılmaz (yalnız vektör kimliği, durum, koşullar, nedenler, beyan / sonuç, yerel yanıtın durum kodu).
Karar tarihi kanıta, özete ve çıktıya yazılmaz (orada yalnız kural sürümü `R07` bulunur); tarih bu belgede ayrı kayıtlıdır (§3d).

**(b) Kenar engelleme sonucu** (`edgeBlocking`) — **`PASS` üretilmez**:

| Değer | Koşul |
|---|---|
| `FAIL` | engellenmesi gereken bir isteğin **API'ye ulaştığı** API'ye özgü kanıtla gösterildi — API'nin o isteğe **403 vermesi bunu kapatmaz** (§3b-K1) · **ya da** ret vektörü hiç reddedilmedi (2xx; API kanıtı aranmaz). API'ye ulaşma kanıtı bulunan ihlal her durumda FAIL olarak **korunur** |
| `OLCULEMEYEN` — neden `ULASMAMA-BAGIMSIZ-KANITI-YOK` | FAIL yok ve başka hiçbir ölçülemeyen nedeni de yok: bütün ret vektörleri işaretsiz, kimlik başlıksız 403 aldı; izinli yollar beklendiği gibi yanıtlandı; kalibrasyon `VAR`. Gözlem temizdir ama isteğin API'ye ulaşmadığını gösteren **bağımsız kanıt yoktur**. Sağlıklı kenar da, zincirde başlığı silinmiş bir API reddi de bu sınıfta **aynı** görünür. Bu sınıf **başarılı kenar engellemesi değildir** |
| `OLCULEMEYEN` — diğer neden sınıfları (her biri ayrı) | FAIL yok ve şunlardan en az biri var: kalibrasyon `YOK` / `GECERSIZ` (§3b-K2) · sınama (challenge) ya da tanınmayan azaltım işaretli 403 — durum kodu eşleşir ama hedeflenen erişim kuralının uygulandığını **kanıtlamaz** (§3b-K3) · ret-403 dışındaki bir yanıtta azaltım işareti · pozitifler beklendiği gibi değil (tekdüze 403 dahil) · yanıt alınamayan vektör · durum kodu ölçütü PASS değil ama API'ye ulaşma kanıtı da yok · ret yanıtında katmanı belirlenemeyen kimlik başlığı (yansıma / yabancı kimlik) |
| `PASS` | **üretilmez** (kanıt sınırı). Kayıt eki (kanıtta `scope`) her koşumda yazılır: "yalnız bu istek profili, bu konum, bu vektör kümesi için" + kanıt sınırının metni |

Kalibrasyon eksikliği somut olumsuz kanıtı **silmez**: kalibrasyon eksikken ya da yansıtan bir katman görülmüşken de API'ye özgü
kanıt FAIL verir; sınama işaretli yanıtların yanında başka bir satırda API kanıtı varsa FAIL korunur. Kalibrasyon, API kanıtının
**kullanılabilirliği** ve yansıma / damga göstergeleri içindir (FAIL yönü ona dayanır); "kalibrasyon `VAR` → kapalı" çıkarımı
**yapılmaz**.

**(c) Katman doğrulaması** (`layerVerification`) — kanıtın desteklemediği katman kesinliği **reddedilir**; **`PASS` üretilmez**:

| Değer | Koşul |
|---|---|
| `FAIL` | bir ret satırını API'nin yanıtladığı kanıtlı **ve** koşumun kendi kalibrasyonu API'nin "kabul edilmeyen biçim → yeni kimlik" davranışını **en az bir kez** gösterdi (`calibration.apiReplace` ≥ 1) |
| `PASS` | **üretilmez**: "yanıtlayan katman API değil" hiçbir ret satırında gösterilemez — başlık yokluğu **satır düzeyinde de** kanıt değildir. R05'teki "API değil" çıkarımı (`API-DEGIL-CIKARIM`) **kalktı** |
| `OLCULEMEYEN` | diğer her durum; kapsam sayısıyla birlikte (kanıtta `coverage`: kaç satır API kanıtlı · kaç satır ölçülemez ve neden sınıfı). "API değil gösterilen" sayısı **yoktur** |

**Desteksiz kesinlik yok (§3b-K9; R05 dördüncü tur).** Koşumun kendi kalibrasyonu API'nin "kabul edilmeyen biçim → yeni kimlik"
davranışını **hiç göstermediyse** (API pozitiflerinde değiştirme 0 / N), bir ret satırındaki "yeni kimlik" gözlemi kenar engelleme
alanında yine `FAIL` / bulgu adayıdır (§3b-K1, K2: somut olumsuz kanıt silinmez) — **ama** katman doğrulaması alanı "API yanıtladı"
kesinliği **bildirmez**: değer `OLCULEMEYEN`, neden sınıfı `YENI-KIMLIK-GOZLEMI-KALIBRASYON-DEGISTIRMEYI-GOSTERMEDI`; o satır kapsam
sayısında "API kanıtlı" değil "ölçülemez" sayılır. Kalibrasyon bu davranışı en az bir kez gösterdiyse (kalibrasyon sonucu `YOK` /
`GECERSIZ` olsa da) alan `FAIL`'dir. Öz-test: A-5 (değiştirme 0/3 → kenar F, katman O · 1/3 → kenar F, katman F), U-3, SINIR-1.

Kenar, tünel ya da sağlayıcı bu sondayla **hiçbir koşulda adlandırılamaz**; sonda adlandırmaz. Sağlıklı koşumda, bu vektör kümesiyle
(öz-testte ölçüldü): 59 ret satırının **59**'unda katman ölçülemez — 30 düz `/api` satırı (başlık yok; başlık yokluğu ulaşmamayı
kanıtlamaz), 13 web yolu (web uygulamasının ürettiği bir 403 kenar reddinden bu yöntemle ayırt edilemez), 2 API önekli ön uçuş, 14 yolu
belirsiz satır; API kanıtlı satır 0.

**Pozitif kontrol** (`positiveControl`) — API'ye geçmesine **izin verilen** yollar; (a)–(c) kurallarına **karıştırılmaz** (§3b-K1).
**Tek kural** (owner kararı 2026-10-06, §3c-T3; yalnız durum kodundan — gönderilen kimlik biçimine ve satırın katman kimliğine
**bağlı değildir**; **403 istisnası yoktur**):

| Pozitif vektörün yanıtı | Pozitif kontrole etkisi |
|---|---|
| beklenen kod (sayfa 200 · API 401) | uygun; dokuzunun hepsi böyleyse `PASS` |
| yanıt alınamadı (taşıma hatası) | `OLCULEMEYEN` |
| beklenen dışındaki **doğrulanmış** her HTTP yanıtı: 2xx · 3xx · **403 dahil** her 4xx (ör. 404) · 429 · 5xx · sınıflanamayan kod — hangi katman üretmiş olursa olsun; tek bir pozitif de olsa, tekdüze ret de olsa | `FAIL` (ölçüt ihlali / bulgu adayı) |

Pozitif kontrol `FAIL`'i bir **ölçüt ihlali / bulgu adayıdır**; nedeni ayrı değerlendirilir. "Ürün güvenlik kusuru kesinleşti" demek
**değildir** (ör. reddedilen bir izinli yol yanlış yapılandırılmış bir kenar kuralı, sunulmayan bir ad ya da geçici bir kesinti
olabilir); sondanın çıktısı ve kanıtı da bu adı kullanır. R05'te reddedilen pozitif (403) `OLCULEMEYEN` sayılıyordu; **artık `FAIL`'dir**
— bu yüzden tekdüze 403 (pozitifler dahil bütün istekler 403) artık pozitif kontrol `FAIL` ve çıkış 2 verir (durum kodu ölçütü PASS
kalır; kenar engelleme `OLCULEMEYEN`). Öz-test: P-3, P-7, U-1 (403) · P-4, P-6 (5xx / 429) · K-10 (yanıtsız → ölçülemeyen).

**Çıkış kodu** dört alandan türer (sondada tek işlev). Eşleme — sondanın kanıta yazdığı metinle aynen:
`herhangi bir alan FAIL → 2 · FAIL yok → 3 (ölçüm koşumu 0 üretmez) · kapı → 4 · kanıt yazılamadı → 7 · beklenmeyen durma → 1`.
"Herhangi bir alan" pozitif kontrolü de kapsar. FAIL ölçülemeyenin önündedir (aynı koşumda taşıma hatası olsa da FAIL çıkış 2 verir;
ölçülemeyen nedenler kayıtta kalır). **Ölçüm koşumu çıkış 0 üretmez** (owner kararı 2026-10-06: belirsizlik başarılı kenar
engellemesi gibi sunulmaz): kenar engelleme bu sondayla PASS olamadığından FAIL yoksa sonuç her zaman ölçülemeyendir (3) — sağlıklı
koşum da 3 verir. R05'teki "FAIL yok ve kenar engelleme PASS → 0" eşlemesi **kalktı**. Çıkış 0 yalnız `--phone-list` çağrısında görülür
(istek atmaz; ölçüm değildir). Kapı (4) = istek atılmaz: kapsam yetkisi doğrulanmadı · origin https değil ya da içinde kimlik /
sorgu / parça var · TLS doğrulaması kapalı · ad kimliği / konum etiketi yok ya da geçersiz · parametre yinelenmiş · `--out` yok ·
`--phone-list` ile `--out` birlikte · kanıt ya da özet dosyası zaten var · konum etiketi ana makine adını ya da bir etiketini içeriyor ·
`D8_HTTP_TIMEOUT_MS` geçersiz · istek kimliği planı tutarsız · **(R07)** `--local-edge` geri döngü http adresi değil · `--offprobe-evidence`
/ `--offprobe-result` değeri tanınmıyor · `--finalize` ölçüm ya da telefon parametresiyle birlikte · **(R08)** `--evidence-sha256` yok / 64 onaltılık hane değil / ölçüm
çağrısında verilmiş · kanıtın özeti kayıtlı değerle aynı değil · kesinleştirilecek kanıt kabul
edilmedi (§1). 7 = ölçüm yapıldı ama kanıt / özet yazılamadı (ham kanıtı olmayan özet
kanıt sayılmaz). 1 = sonda beklenmeyen biçimde durdu — **ölçülemeyen** sayılır. Tanınmayan bir alan değeri de 0 vermez.
**Çıkış 5 kalkmıştır.** Hiçbir çıkış kodu "D-8 kapandı" demek **değildir** (§3).

**Satır düzeyi.** `outcome` (durum kodu sınıfı): `RET-403` · `SINAMA-ISARETLI-403` · `TANINMAYAN-AZALTIM-ISARETLI-403` ·
`DORTYUZ-403-DISI` · `HIZ-SINIRI-429` · `REDDEDILMEDI-2XX` · `YONLENDIRME-3XX` · `SUNUCU-HATASI-5XX` · `SONUC-YOK` (taşıma hatası;
yalnız hata **sınıfı** `errorClass`: `AD-COZULMEDI` / `BAGLANTI` / `TLS` / `ZAMAN-ASIMI` / `DIGER`) · `SINIFLANAMADI`. Hata iletisi
metni ve yönlendirme hedefi kanıta yazılmaz. **Azaltım işareti** (sağlayıcının bir yanıt başlığı; satırda `mitigationMark`: `YOK` /
`SINAMA` / `TANINMAYAN` — başlığın değeri kanıta yazılmaz): tanınan sınama (challenge) değeri, virgül / boşlukla ayrılmış listenin
**ögesi** olarak ve harf duyarsız aranır (iki ayrı başlık satırı tek listedir); başlık var ama değeri tanınmıyorsa (boş değer dahil)
`TANINMAYAN`. Sınama yanıtı bir ret **kararı** değildir — "tarayıcı olduğunu göster" yanıtıdır; ziyaretçi sınamayı geçerse asıl
istek hedefe gider (sağlayıcı belgesi 2026-10-05'te önceki turda okundu, bu turda yeniden okunmadı: işaret her sınama sayfası türünde
bulunur; sınama yanıtının durum kodu o belgede yazmıyor — **ölçülmedi**). İşaret kenar engelleme alanına **ayrı bir ölçülemeyen
nedeni** yazar (var olan hiçbir işaret "temiz gözlem" sınıfına düşmez; FAIL'i de kaldırmaz); durum kodu ölçütünü ve bir bulgu adayını
değiştirmez (işaretli 2xx yine reddedilmemiştir); katmana girmez. Yalnız bilinen başlık okunur: işaretsiz bir sınama yanıtı bu sondayla
ayırt edilemez (kenar engelleme kaydının eki bu sınırı da taşır).

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
| Başlıksız düz `/api` satırı (R05'te "API değil" çıkarımı) | **çıkarım yapılmaz** (owner kararı 2026-10-06): kalibrasyon `VAR` + yanıtta başlık yok + ön uçuş değil + yol `API-KESIN` olan satır `OLCULEMEYEN`'dir, neden `BASLIK-YOKLUGU-KANIT-DEGIL` — başlığın bulunmaması isteğin API'ye ulaşmadığını kanıtlamaz. Katman kimliği kümesi: `UYGULAMA-API` · `OLCULEMEYEN` · `SONUC-YOK` ("API değil" diye bir sınıf yoktur) |
| Diğer her durum | `OLCULEMEYEN` + neden sınıfı (`layerWhy`): `WEB-YOLU` · `ON-UCUS` · `YOL-BELIRSIZ` · `KALIBRASYON-YOK` / `-GECERSIZ` · `YANSIMA` · `YABANCI-KIMLIK` · `AYIRT-ETMEYEN-GOZLEM` · `KANIT-KULLANILAMAZ` · `BASLIK-YOKLUGU-KANIT-DEGIL` |

`Server` başlığı, gövde imzası, boş / dolu gövde **ipucudur** (`hints`, `layerHint`, `hintsOnly`; yalnız kısıtlı ham kanıtta) ve hiçbir
alana girmez. **Yol sınıfı (`pathClass`):** `API-KESIN` = ham yol tam `/api` önekli ve normalleştirilecek bir yanı yok (yüzde dizisi,
nokta segmenti, çift eğik çizgi, noktalı virgül, büyük harfli önek içermez; sorgu ve sondaki tek eğik çizgi etkilemez) — API bu
isteği işleseydi istek kimliği ara katmanı kesin çalışırdı. `API-BELIRSIZ` = ham ya da çözülmüş / sadeleştirilmiş biçimi API önekine
düşen diğer her yol (örnekler: çift eğik çizgili yol API'de önek dışına düşer; çözülemeyen yüzde dizisinde ara katman çalışmaz;
ikisinde de API yanıtı başlıksız olur). `ONEK-DISI` = web yolu. Yol sınıfı artık yalnız ölçülemeyen satırın **neden sınıfını** belirler;
hiçbir yol sınıfında "API değil" denmez.

**Gözlem → alanlara etkisi** (ret vektörleri; öz-test kalemi son sütunda). Kenar engelleme ve katman sütunlarında `PASS` **yoktur**:

| # | Gözlem | HTTP / ret | Kenar engelleme | Katman | Öz-test |
|---|---|---|---|---|---|
| 1 | bütün ret vektörleri işaretsiz 403, kimlik başlığı yok; pozitifler beklendiği gibi; kalibrasyon `VAR` (**sağlıklı kenar** — ya da zincirde başlığı silinmiş API reddi; ikisi ayırt edilemez) | PASS | **OLCULEMEYEN** — `ULASMAMA-BAGIMSIZ-KANITI-YOK` (çıkış 3) | OLCULEMEYEN (kapsam sayısı) | S1, SINIR-2 |
| 2 | 403, API'nin "değiştirme" kanıtıyla (gösterge yok) | PASS (kod 403) | **FAIL** — API'nin 403'ü kapatmaz | **FAIL** | A-1, A-2 |
| 3 | 403 dışı yanıt (3xx / 4xx / 429 / 5xx), API kanıtlı | **FAIL** | **FAIL** | **FAIL** | S2, L-2, L-2b, L-9 |
| 4 | 403 dışı yanıt, API kanıtı yok | **FAIL** | OLCULEMEYEN | OLCULEMEYEN | L-3 … L-8 |
| 5 | 2xx (OPTIONS 204 dahil) | **FAIL** | **FAIL** | kanıta göre | S2, U-3 |
| 6 | yanıt alınamayan ret vektörü | OLCULEMEYEN (FAIL yoksa) | OLCULEMEYEN | OLCULEMEYEN | H-1, S4 |
| 7 | 403, sınama ya da tanınmayan azaltım işaretli | PASS (kod 403) | OLCULEMEYEN (işaret sınıfı) | işaret katmana girmez | S3-ch, S3-az |
| 8 | 7 + başka bir satırda API kanıtı | PASS | **FAIL** korunur | **FAIL** | A-4 |
| 9 | 403, gönderilen (geçersiz biçimli) değer **aynen** döndü — yansıma | PASS | OLCULEMEYEN (API kanıtı **değil**) | OLCULEMEYEN | R-1, R-2 |
| 10 | 403, API biçiminde "yeni kimlik" ama koşumda damga göstergesi var | PASS | OLCULEMEYEN (kanıt kullanılmaz) | OLCULEMEYEN | M-1, M-3 |
| 11 | kalibrasyon `YOK` / `GECERSIZ`, API kanıtı yok | koda göre | OLCULEMEYEN (kalibrasyon sınıfı) | OLCULEMEYEN | K-5, E-1, R-3 |
| 12 | kalibrasyon `YOK` ya da yansıtan katman görülmüş, **API kanıtı var**; kalibrasyon "değiştirme" davranışını **en az bir kez** gösterdi | koda göre | **FAIL** — eksik kalibrasyon kanıtı silmez | **FAIL** | A-3, A-5 |
| 13 | bütün istekler 403 (pozitifler dahil) | PASS | OLCULEMEYEN (tekdüze ret) — **pozitif kontrol FAIL**, çıkış 2 | OLCULEMEYEN | U-1, P-7 |
| 14 | sunulmayan ad: bütün istekler aynı 404 / 3xx / 401 | **FAIL** | OLCULEMEYEN | OLCULEMEYEN | U-2 |
| 15 | ret satırında "yeni kimlik" var ama kalibrasyon "değiştirme" davranışını **hiç göstermedi** (0 / N) | koda göre | **FAIL** — bulgu adayı (kanıt silinmez) | **OLCULEMEYEN** — "API" kesinliği bildirilmez | A-5, U-3, SINIR-1 |

**İki sınır** (öz-testte SINIR-1 / SINIR-2 kalemleriyle **kayıtlıdır**; güvence değildir):
- **Ulaşmama yönünde — kanıt sınırı (R05'te "PASS yönündeki varsayım"dı).** API'nin ürettiği yanıtta kimlik başlığının zincirde
  düşürülmediği **ölçülemez**: kalibrasyon bunu yalnız pozitiflerin yanıtında gösterir. Yalnız API'nin **ret** yanıtından başlığı silen
  bir katman varsa API'ye ulaşan bir istek, kenarın reddettiği istekle aynı görünür. Kaynakta ve şablonda başlığı silen satır yok —
  okundu; canlı zincir ölçülmedi. **Bu sınır gerçek API ile gösterildi** (aşağıda "Gerçek API ile izole prova", sonuç 5): R05 sondası o
  durumda kenar engelleme PASS / çıkış 0 veriyordu. **R06'da bu bir varsayım olmaktan çıktı:** sonda iki durumu da `OLCULEMEYEN`
  bırakır (neden `ULASMAMA-BAGIMSIZ-KANITI-YOK`, çıkış 3) ve PASS vermez. Sınır kapatılamaz; kesin kenar kabulü sonda dışı bağımsız
  kanıt ve owner değerlendirmesi gerektirir (öneri ayrıca sunulur). Öz-test SINIR-2 bunu regresyon olarak ölçer (§1c).
- **FAIL yönünde:** yalnız API önekli ve ön uçuş olmayan **ret** yanıtlarına, API'nin ürettiği biçimde kendi kimliğini yazan ve başka
  hiçbir yanıtta görünmeyen bir katman API'den ayırt edilemez — o yanıtlar API kanıtı sayılır: kenar engelleme `FAIL` (bulgu adayı;
  kısıtlı kayıtta incelenir). Katman doğrulaması bu gözlemde **yalnız** koşumun kalibrasyonu "değiştirme" davranışını en az bir kez
  gösterdiyse `FAIL` verir (sınır o durumda iki alanda da sürer); kalibrasyon o davranışı hiç göstermediyse — örneğin API pozitifleri
  kabul edilmeyen biçimdeki değeri aynen döndürüyorsa — kenar engelleme yine `FAIL` kalır ama katman doğrulaması `OLCULEMEYEN`'dir
  ("desteksiz kesinlik yok"; öz-test SINIR-1'in ikinci girdisi). Aynı yerde API biçiminde **olmayan** bir değer yabancı kimlik sayılır
  (OLCULEMEYEN).

**Bu protokolün dayanağı kaynak okumasıdır ve gerçek API ile izole provayla ölçülmüştür (aşağıda "Gerçek API ile izole prova";
ilk iki koşu R05 sonda baytlarıyla — istek kimliği protokolü R06'da değişmedi; R06 baytlarıyla dört kipte yinelendi).** Dayanak:
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
başlığın bulunması — R05'te PASS yönündeki varsayım, R06'da kanıt sınırı; (iii) gerçek API'nin ön uçuş, çift eğik çizgi ve çözülemeyen yüzde dizisi yanıtlarında
başlığın **bulunmaması**; (iv) gerçek web uygulamasının hiçbir yanıtında bu başlığın bulunmaması (bulunursa canlıda kalibrasyon hep
`GECERSIZ` çıkar); (v) şablon kenarın kabul edilmeyen biçimdeki istek başlığını değiştirmeden iletmesi ve kendi ret yanıtlarına
başlık yazmaması; (vi) araya konan yansıtan katmanla (yalnız API önekli retlerde · her yerde) API kanıtının **oluşmaması**; (vii)
araya konan damgalayan / ezen katmanla kanıtın kullanılmaması. Provanın ilk koşusunun sonucu aşağıdadır. Canlı zincirin başlığı
değiştirmeden geçirdiği ancak koşumun kendi kalibrasyonuyla görülür.

**Gerçek API ile izole prova (2026-10-06; R05 sonda baytlarıyla — TARİHSEL KAYIT; çağıran koştu — kanıt depo dışındadır).**

> **R06 okuma notu (owner kararı 2026-10-06).** Aşağıdaki tablo R05 sondasının ölçülen çıktısıdır ve **değiştirilmedi**. Tablodaki
> iki satır "kenar engelleme PASS · çıkış 0" verir: **izin listeli (sağlıklı)** ve **başlığı silinen API 403'ü** ("aynısı + kenar o
> yanıttan başlığı siliyor"). İkincisinde istek API'ye ulaşmıştı; sonda bunu göremedi ve iki satır birbirinden **ayırt edilemedi**.
> Owner bu sonucu kabul etmedi. **R06 sondasında bu iki satırın ikisi de `PASS · OLCULEMEYEN · OLCULEMEYEN · PASS`, çıkış 3'tür**
> (kenar engelleme nedeni `ULASMAMA-BAGIMSIZ-KANITI-YOK`; çıkış 0 **değil**). Bu sonuç iki ayrı yerde ölçüldü: öz-testteki **model**
> girdileriyle (S1 ve SINIR-2; aynı SINIR-2 girdisinde düzeltmesiz `main` sondası kenar engelleme PASS / çıkış 0 verir — §1c
> "Negatif ayna") ve **R06 sonda baytlarıyla gerçek API'ye karşı** (2026-10-06; dört kip — bu bölümün sonundaki "R06 baytlarıyla
> yineleme"). Tablonun R06 baytlarıyla **yinelenmeyen** beş satırının (sızıntı · yansıtan iki kip · damgalayan · ezen) alan
> değerlerinin R06 kurallarıyla değişmemesi (FAIL satırları FAIL, ölçülemeyen satırlar ölçülemeyen kalır) kuraldan türetilen bir
> beklentidir; gerçek API ile R06 baytlarında ölçülmemiştir.

*Yöntem.* Gerçek API = **yayın adayı derlemesi** (salt okunarak, geçici bir çalışma dizininden çalıştırıldı; 127.0.0.1:18095) +
**tek kullanımlık veritabanı** (yalnız bu prova için açılan, koşu sonunda kaldırılan yerel veritabanı; 127.0.0.1:5591) + **yerel
kenar** (127.0.0.1:8457'de yerel bir TLS vekili: öz-testteki izin listesi ve yol temizliği modeli — şablondaki kenar yazılımının
kendisi değil, modeli). Canlı servis, canlı `.env`, canlı veritabanı ve dış posta **yok**. Kenar her isteğin **gerçekte** nereye
gittiğini (API'ye iletildi / kenar yanıtladı) kendi **zemin günlüğüne** yazdı; sondanın satır bazındaki iddiası bu günlükle
karşılaştırıldı. Beklenti dikte edilmedi; aşağıdakiler ölçülen değerlerdir. Alan sırası: durum kodu · kenar engelleme · katman
doğrulaması · pozitif kontrol.

| Kenar kipi | Alanlar | Çıkış | Kalibrasyon | Ret vektörü: gerçekte API'ye ulaşan / sondanın API dediği / yanlış pozitif / kaçan |
|---|---|---|---|---|
| izin listeli (sağlıklı) | PASS · PASS · ÖLÇÜLEMEYEN · PASS | 0 | VAR (aynen 3/3 · değiştirme 3/3 · başlıksız bölgede başlık 0) | 0 / 0 / 0 / 0 |
| saydam geçiş (her /api isteği API'ye) | FAIL · FAIL · FAIL · PASS | 2 | VAR | 46 / 42 / 0 / 4 |
| sızıntı (iki yol API'ye) | FAIL · FAIL · FAIL · PASS | 2 | VAR | 6 / 4 / 0 / 2 |
| **gerçek API 403'ü** (bir ret vektörü API'nin kimliksiz 403 ürettiği rotaya) | **PASS · FAIL · FAIL · PASS** | 2 | VAR | 1 / 1 / 0 / 0 |
| aynısı + kenar o yanıttan başlığı siliyor | PASS · PASS · ÖLÇÜLEMEYEN · PASS | **0** | VAR | 1 / 0 / 0 / **1** |
| yansıtan (yalnız API önekli retlerde) | PASS · ÖLÇÜLEMEYEN · ÖLÇÜLEMEYEN · PASS | 3 | GEÇERSİZ (yansıma 44) | 0 / 0 / 0 / 0 |
| yansıtan (her yanıtta) | PASS · ÖLÇÜLEMEYEN · ÖLÇÜLEMEYEN · PASS | 3 | GEÇERSİZ (yansıma 62) | 0 / 0 / 0 / 0 |
| damgalayan (kenar kendi kimliğini yazar) | PASS · ÖLÇÜLEMEYEN · ÖLÇÜLEMEYEN · PASS | 3 | GEÇERSİZ (yabancı 18) | 0 / 0 / 0 / 0 |
| ezen (API yanıtındaki başlığı isteğin değeriyle ezer) | PASS · ÖLÇÜLEMEYEN · ÖLÇÜLEMEYEN · PASS | 3 | GEÇERSİZ (değiştirme 0/3) | 0 / 0 / 0 / 0 |

Sonuçlar (prova kaydından aynen; R05 sondasının davranışını anlatır — 5. maddedeki "PASS verir (çıkış 0)" R06'da geçerli değildir):
1. **Sıradan yansıma API kanıtı üretmedi**: yansıtan iki kipte "API'ye ulaştı" iddiası 0, kenar engelleme ÖLÇÜLEMEYEN.
2. **Gerçek API iki davranışı da gösterdi**: kabul ettiği biçimdeki kimliği aynen yazdı (3/3), kabul etmediği biçimdekini atıp UUID v4
   üretti (3/3). API önekli 401 / 400 / 404 / 200 / HEAD yanıtlarının hepsinde başlık var (saydam geçişte 42 / 42).
3. **Gerçek API 403'ü kenar ölçütünü FAIL yaptı** (durum kodu ölçütü PASS kaldı): API'nin 403 vermesi sızıntıyı kapatmıyor.
4. **Kanıtlanamayan 4 satır kaynak okumasıyla aynı sınıfta**: 2 ön uçuş (OPTIONS 204, başlıksız), çift eğik çizgili yol (404,
   başlıksız), çözülemeyen yüzde dizisi (400, başlıksız). Sonda bunlara "API değil" DEMEDİ (ÖLÇÜLEMEYEN); üçünün de durum kodu 403
   olmadığı için durum kodu ölçütü zaten FAIL.
5. **Ölçülemeyen sınır gerçek API ile gösterildi**: yalnız API'nin ret yanıtından başlığı silen bir katman varsa sonda kenar engelleme
   PASS verir (çıkış 0) ve sızıntıyı görmez. Katman doğrulaması bu durumda da ÖLÇÜLEMEYEN kalır. PASS kaydı bu varsayımı taşır;
   kapatılamaz, kayıt.
6. Yanlış pozitif hiçbir kipte yok (0 / 9 kip).

*Provada OLMAYAN — ölçülmeyen budur:* **tünel / sağlayıcı ayağı** provada yoktu (istekler yerel kenara doğrudan gitti) ve **gerçek
web uygulaması** provada yoktu — web yanıtları kenarın **sentetik sayfasıydı**. Canlı zincirin (kenar yazılımı, tünel, sağlayıcı,
web uygulaması) bu başlığa ne yaptığı bu provayla **ölçülmedi**; o, pozitif yollar için ancak canlı koşumun kendi kalibrasyonuyla
görülür — ret yolları için sondayla hiç görülemez (kanıt sınırı). Sonuç 5'teki sınır (yalnız API'nin ret yanıtından başlığı silen
katman → R05 sondasında kenar engelleme PASS) gerçek API ile gösterilmiştir ve **kapatılamaz**. R05'te bu, kenar engelleme PASS
kaydının varsayımıydı; **R06'da sonda bu durumda PASS vermez** (`OLCULEMEYEN`).

İlk koşu sonda baytları `369A51DD…8370` ile yapıldı (yukarıdaki tablo o koşunun çıktısıdır). **R05'in son baytlarıyla yineleme
(2026-10-06; sonda `EE0C6998…3F1A` — R05'in `main`'deki baytları, R06 pini **değildir**; aynı düzenek, aynı dokuz kip):** dokuz kipin dokuzunda dört alan, çıkış kodu, kalibrasyon sonucu ve
zemin günlüğüyle karşılaştırma sayıları yukarıdaki tabloyla **aynıdır** (yanlış pozitif 0 / 9 kip; gerçek API 403'ü → PASS · FAIL ·
FAIL · PASS, çıkış 2; yansıtan, damgalayan ve ezen kiplerde kenar engelleme ÖLÇÜLEMEYEN, çıkış 3; sınır kipi çıkış 0). Kenarsız
doğrudan API ölçümü iki koşuda aynı sınıfları verdi: kimliksiz 403 / 401 / 404 yanıtlarında kabul edilen biçim aynen, edilmeyen biçim
yerine yeni kimlik; ön uçuş, çift eğik çizgili yol, çözülemeyen yüzde dizisi ve API öneki dışındaki yollarda başlık yok. İki koşuda da
API günlüğünde hata satırı ve gönderilen kimlik değeri yoktur; yayın adayı ağacı koşudan önce ve sonra aynı ölçülmüştür. R05 dördüncü
turda değişen üç kural (pozitif kontrolde tek kural, kapının eksik kalemi adlandırması, katman doğrulamasında desteksiz kesinlik yok) bu
dokuz kipin hiçbirinde farklı bir alan değeri üretmedi; o kuralların ayırt edici girdileri öz-testtedir (P-6, SA-2, A-5).

**R06 baytlarıyla yineleme (2026-10-06; sonda `4A517621…8B71` — R06 pini; aynı düzenek; DÖRT kip; çağıran koştu — kanıt depo
dışındadır).** Owner'ın kabul etmediği sonucun düzeldiği gerçek API ile ölçüldü. Beklenti dikte edilmedi; aşağıdakiler ölçülen
değerlerdir (alan sırası yukarıdaki tabloyla aynı).

| Kenar kipi | Alanlar (R06) | Çıkış | Kenar engelleme nedeni | Ret vektörü: gerçekte API'ye ulaşan / sondanın API dediği / yanlış pozitif / kaçan | R05'te aynı satır |
|---|---|---|---|---|---|
| izin listeli (sağlıklı) | PASS · ÖLÇÜLEMEYEN · ÖLÇÜLEMEYEN · PASS | 3 | `ULASMAMA-BAGIMSIZ-KANITI-YOK` | 0 / 0 / 0 / 0 | PASS · PASS · ÖLÇÜLEMEYEN · PASS, çıkış 0 |
| **gerçek API 403'ü** | PASS · FAIL · FAIL · PASS | 2 | `API-YE-ULASTI-KANITLI` | 1 / 1 / 0 / 0 | aynı |
| aynısı + kenar o yanıttan başlığı siliyor | PASS · ÖLÇÜLEMEYEN · ÖLÇÜLEMEYEN · PASS | **3** | `ULASMAMA-BAGIMSIZ-KANITI-YOK` | 1 / 0 / 0 / **1** | PASS · PASS · ÖLÇÜLEMEYEN · PASS, çıkış **0** |
| saydam geçiş (her /api isteği API'ye) | FAIL · FAIL · FAIL · PASS | 2 | `API-YE-ULASTI-KANITLI` (+ 2xx ve durum kodu nedenleri) | 46 / 42 / 0 / 4 | aynı |

Okuma: (1) sağlıklı kenar ile başlığı silinmiş API reddi sondada **yine aynı görünür** — ikisi de ÖLÇÜLEMEYEN, çıkış 3; sonda
ikisine de PASS vermez. Başlığı silinen kipte API'ye ulaşan 1 istek sondayla **görülemez** (kaçan 1): sınır kapanmadı, yalnız başarılı
kenar engellemesi gibi sunulmuyor. (2) API'ye ulaşma kanıtı bulunan ihlal FAIL olarak korundu (iki kip). (3) Dört kipte kalibrasyon
`VAR`, pozitif kontrol PASS, yanlış pozitif 0. Ağ izolasyonu bu koşuda ölçüldü: API süreci yalnız geri döngü arayüzünü dinledi ve
geri döngü dışına bağlantı açmadı (izolasyon yalnız prova başlatıcısının sürecinde kuruldu; ürün kodu, canlı ayar ve firewall
değişmedi). Yayın adayı ağacı koşudan önce ve sonra aynı ölçüldü. **Koşulmayan:** diğer beş kip (sızıntı · yansıtan iki kip ·
damgalayan · ezen) R06 baytlarıyla gerçek API'ye karşı koşulmadı; "Provada OLMAYAN" sınırları (tünel / sağlayıcı ayağı, gerçek web
uygulaması, şablondaki kenar yazılımının kendisi) bu yineleme için de aynen geçerlidir. Aynı koşuda sonda dışı bağımsız kanıt
yönteminin izole ön denetimi de yapıldı; sonucu depo dışı kayıttadır ve owner'a ayrıca sunulur (bu belge yöntem tanımlamaz).

**"Kimliksiz istekte uygulama 403 üretmez" bir genelleme değildir.** Bu, yalnız sondanın vektör listesindeki uçlar için kaynak
okumasıdır (çalışma zamanında ölçülmedi); uygulamanın başka uçları kimlik kontrolünden önce 403 üretebilir. Uygulamanın ürettiği 403
bu yüzden varsayımla değil kimlik kanıtıyla sınıflanır (tablo satırı 2).

**Adsız özet.** Sonda ham kanıtın (`<kanıt>.json`; ana makine adını içerir, **kısıtlı**, depoya girmez) yanına ad içermeyen ayrı bir
özet yazar (`<kanıt>.ozet.json`): ad kimliği, revizyon, sondanın kendi SHA-256'sı, vektör kümesi kimliği, kapsam yetkisi durumu
(yalnız durum + dosya bütünlüğü durumu + içerik incelemesi beyanı durumu + kalem türleri), yöntem kapsamı sayıları, durum sınıfı / hata
sınıfı / kimlik anlamı / katman kimliği sayıları, kalibrasyon, dört alan ve nedenleri (yalnız değer + neden + sayı), kenar engelleme
kaydının eki (kapsam + kanıt sınırı), katman kapsam sayısı, çıkış kodu eşlemesi, zaman, çıkış kodu, beyan edilen konum etiketi,
gönderilen başlık **adları** ve biçim sayıları, **(R07)** dar kabul istisnası kaydı (`malformedRejectClass`: sınıfın adı, uyarı cümlesi,
kural sürümü, vektör kimliği, durum, beş koşul, nedenler, ek kanıt beyanı / sonucu, yerel yanıtın durum kodu — ham yol, yöntem ve yerel
adres **olmadan**) ve dış / yerel istek sayıları. İçermez: ad, hata metni, yönlendirme hedefi, yol düzeyinde bulgu adayı, ipuçları,
gönderilen / dönen kimlik değerleri, kanıt dosyası yolu / özeti / tarihi, inceleyen. **Yöntem sınıfı düzeyinde sayı içerir** (HEAD /
OPTIONS / varyant kaç tanesi reddedildi) — bu yüzden **özet de kısıtlıdır** ve depoya konmaz. **Public satıra (§1b) bu özetten yalnız
dört alanın değeri ve ad kimliği aktarılır; hiçbir sayı, neden, yol / yöntem ayrıntısı ve hiçbir özet (SHA-256) değeri public belgeye
yazılmaz** (§3b-K4). **Ad denetiminin ölçülen kapsamı:** (a) istek atılmadan — owner'ın
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

**R07 — yerel kenar karşılaştırma isteği (isteğe bağlı; dış istek listesine dahil değildir, vektör kümesi kimliğini değiştirmez).**

| İstek | Nereye | Yöntem / gövde | Beklenen | Not |
|---|---|---|---|---|
| "varyant boş bayt kodlu" vektörünün **aynı ham istek hedefi**, Host başlığı = dış adın ana makinesi | **yerel kenar** (yalnız geri döngü, düz http; `--local-edge`) — dış ağa çıkmaz | GET (gövdesiz); kimlik bilgisi yok; istek kimliği başlığı kabul edilmeyen biçimde | 403 | dış 68 istekten **sonra**, **bir kez**; yeniden deneme / yönlendirme takibi yok. Yerel kenar geçirirse olası uygulama sonucu dış vektördekiyle aynıdır (kodlama varyantı satırı; yazma yok). Kanıtta ayrı kayıt |

**İstek sayısı ve izin kapsamı (sonraki koşum paketi için — §3d):** yerel karşılaştırma **verilmeyen** koşumda toplam **68** istek (R06
ile aynı; istisna uygulanmaz); **verilen** koşumda **dış 68 + yerel kenar 1 = 69** istek. Yerel istek canlı ana makinenin kendi
kenarına gider ve dış isteklerden **ayrı bir izin kalemidir**: canlı sonda GO'su verilirken ayrıca onaylanır; onaylanmadıysa
`--local-edge` verilmez. Kesinleştirme adımı istek atmaz (izin kalemi değildir; kısıtlı kayda yazılan bir beyanın işlenmesidir).

### 1b. Ad başına satır tablosu (D8-E3)

Her ad **ayrı satırdır**; her satır yalnız o adın **kendi koşumundan** dolar. Bir adın sonucu başka bir ada taşınmaz; şablon ya da
izole ölçüm çıkarımları hiçbir satırın gerekçesi olamaz. Ortak ya da toplam bir hüküm satırı ve tek bir "D-8" hükmü **yoktur**. Adlar
public belgeye yazılmaz (yalnız ad kimliği); ad ↔ ad kimliği eşlemesi, ad sayısı ve sınıfı kısıtlı kayıttadır.

| Ad kimliği | Kapsam yetkisi | HTTP / ret sonucu | Kenar engelleme sonucu | Katman doğrulaması | Pozitif kontrol | Koşum (tarih · konum · sonda pini · vektör kümesi) | Dış ağ beyanı |
|---|---|---|---|---|---|---|---|
| **AD-1** (birincil ad) | birincil ad — kapı yok (ad canlı yapılandırmadan okunur) | FAIL | FAIL | OLCULEMEYEN | PASS | 2026-10-06 · canli-ana-makine-cikisi · 4A517621…8B71 · 83AD1AB6…F0F2 | bu revizyon için YOK (eski beyan R27 öncesidir; ada bağlanmadı) |
| diğer yayın adları | KOŞULMADI — kapsam yetkisi doğrulanmadı | KOŞULMADI — kapsam yetkisi doğrulanmadı | KOŞULMADI — kapsam yetkisi doğrulanmadı | KOŞULMADI — kapsam yetkisi doğrulanmadı | KOŞULMADI — kapsam yetkisi doğrulanmadı | — | — |

**AD-1 satırı R06 sonda baytlarının 2026-10-06 koşumudur ve aynen korunur.** Koşum hücresindeki kısa pin R06 pinidir (§7 "önceki
pinler"). R07'nin dar kabul istisnası (§1.1, §3d) bu satıra **uygulanmaz** — kural geçmiş koşuma geriye dönük işlemez; satırdaki `FAIL`
değerleri R07 kuralıyla yeniden yorumlanmaz ve `PASS`'a çevrilmez.

**Dar sınıf notu (R07; tablo dışında, satır başına bir satır).** *(Bu revizyonda dar sınıfın uygulandığı koşum yoktur.)*

Doldurma kuralları:
- **Dar sınıf uygulanan koşum (R07):** HTTP / ret hücresine sondanın verdiği değer **aynen** yazılır: `OWNER-ISTISNASIYLA-UYGUN`. Bu koşumda
  HTTP / ret hücresine `PASS` yazılmaz (sonda o değeri üretmez; owner şartı §3d-D8) ve hücreye başka
  bir şey eklenmez; ama o satır için yukarıdaki "Dar sınıf notu" başlığının altına **zorunlu** bir not satırı eklenir: ad kimliği +
  sınıfın tam adı ("İzin verilen bozuk istek reddi — katman doğrulanmadı") + "Bu bir owner kabul kuralıdır; uygulamaya hiç
  ulaşılmadığının teknik kanıtı değildir." cümlesi + kural sürümü. Notu olmayan böyle bir satır eksiktir. Not sayı, yol / yöntem ayrıntısı ve özet değeri içermez. Öz-test bu notun varlığını **ölçemez**
  (public belgeden sınıfın uygulanıp uygulanmadığı bilinemez); kural kayıt sahibinindir.
- Dört sonuç hücresine **yalnız** adsız özetteki `nameVerdict` alan değeri (yorumlanmadan) ya da iki "KOŞULMADI" metninden biri
  yazılır. **Koşum hücresi boşken (`—`)** dört sonuç hücresi aynı "KOŞULMADI" metnini taşır (kapsam yetkisi doğrulanmamış satırda
  `KOŞULMADI — kapsam yetkisi doğrulanmadı`; diğerlerinde `KOŞULMADI — canlı sonda GO'su yok`). **Koşum hücresi doldurulduğunda**
  (kanıtı olan gerçek bir koşumdan sonra): **HTTP / ret sonucu** ve **pozitif kontrol** hücreleri `PASS` / `FAIL` / `OLCULEMEYEN` alır (HTTP / ret hücresi, yalnız dar sınıf
  uygulanan koşumda, `PASS` yerine `OWNER-ISTISNASIYLA-UYGUN` taşır — yukarıdaki kural; başka hiçbir hücre bu değeri almaz);
  **kenar engelleme sonucu** ve **katman doğrulaması** hücreleri yalnız `FAIL` / `OLCULEMEYEN` alır — **bu iki hücreye `PASS`
  yazılmaz** (sonda o değeri üretmez; kanıt sınırı, §1.1). O iki hücrede `PASS` yazan satır bu sondanın ölçümü olamaz ve DOC-1'i düşürür.
- **`OLCULEMEYEN` başarı değildir.** Kenar engelleme hücresindeki `OLCULEMEYEN`, "personel yüzeyi dışarıdan kapalı" demek **değildir**;
  satırın yanına ya da başka bir belgeye bu anlamı taşıyan bir ifade yazılmaz. Kesin kenar kabulü sonda dışı bağımsız kanıt ve owner
  değerlendirmesiyle, **ayrıca** kaydedilir (§3); o kayıt bu tablonun hücrelerine yazılmaz.
- Kapsam yetkisi hücresi: AD-1 için yukarıdaki sabit metin; başka bir ad için sondanın kabul metni —
  `kapsam yetkisi kaydı kabul edildi — dosya bütünlüğü ölçüldü; içerik incelemesi beyanı kayıt sahibinde` — ya da
  `KOŞULMADI — kapsam yetkisi doğrulanmadı` (bu durumdaki satır doldurulamaz: sonda koşmamıştır). Kabul metni sahipliğin sonda
  tarafından doğrulandığı anlamına **gelmez**: sonda dosya bütünlüğünü ölçmüştür; içeriği inceleyen kayıt sahibidir (§1).
- Public satıra **başka hiçbir şey yazılmaz**: sayılar (durum sınıfı, yöntem kapsamı, kalibrasyon, katman kapsamı, neden sayıları),
  nedenler, yol / yöntem / durum ayrıntısı, kanıt ve özet dosyalarının SHA-256 değerleri ve her türlü hassas kanıt **kısıtlı kayıtta**
  kalır. (Özet yöntem sınıfı düzeyinde sayı taşır ve sondanın vektör listesi public'tir; özet düşük entropili olduğundan SHA-256'sı da
  sayıların denenerek sınanmasına yarar.)
- "Koşum" hücresine yalnız tarih, beyan edilen konum etiketi, sonda pini ve vektör kümesi kimliği yazılır. Pin ve vektör kümesi
  kimliği bu tabloya **kısa biçimde** yazılır (ilk 8 … son 4 onaltılık hane, `XXXXXXXX…XXXX`); **tam 64 haneli değer bu tabloya
  yazılmaz**. Hücrenin biçimi tam olarak şudur: `YYYY-AA-GG · <konum etiketi> · <sonda pini kısa> · <vektör kümesi kimliği kısa>`.
  Kısa değerler §7'deki değerlerin kısa biçimiyle aynı olmalıdır; farklıysa satır bu revizyonun ölçümü sayılmaz (tam değerlerin
  eşitliği kısıtlı kayıtta, adsız özetteki `probeSha256` / `vectorSetId` ile denetlenir — §3). Elle yazılan konum etiketi adı ya da
  bir parçasını içeremez (sonda reddeder; §1.1 "ad denetiminin ölçülen kapsamı").
- Öz-test (DOC-1) bu tablonun **biçimini** koşum hücresine göre ölçer: boş koşum hücreli satırda "KOŞULMADI" metni; dolu koşum
  hücreli satırda yalnız alan değerleri (kenar engelleme ve katman doğrulaması hücrelerinde `PASS` yok) ve yukarıdaki kısa biçimli
  koşum hücresi. Kural dışı doldurma (sonuç hücresinde sayı / neden · kenar engelleme ya da katman hücresinde `PASS` · koşum hücresinde
  yol ya da tam özet · koşum hücresi boşken sonuç değeri · koşum hücresi doluyken "KOŞULMADI") DOC-1'i düşürür. Öz-test kısa değerlerin
  §7 ile eşitliğini ve "dış ağ beyanı" hücresinin içeriğini **ölçmez**. (R05'te yalıtılmış kopyada ölçülen iki yönlü DOC-1 deneyi R06
  baytlarında yinelenmedi — §1c.)
- Kapsam yetkisi kaydı kabul edilen her ad **kendi ad kimliğiyle ayrı satır** alır; kaydı olmayan ya da kabul edilmeyenler için tek
  "diğer yayın adları" satırı kalır (ad sayısı yazılmaz). Kapsam yetkisi kaydı kabul edilmemiş ad için sonda koşmaz; satıra yorum
  eklenmez.
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
değişir (varsayılan 8457; 8080 / 3002 / **8081** / 5432 / 5447–5449 / 5591 / 18095 ve **47200–47299 / 47998–47999** aralıkları
reddedilir); `D8_SELFTEST_PROBE` başka bir sonda dosyasını
sınar (negatif ayna / mutasyon). Çıkış: 0 hepsi PASS · 1 en az bir FAIL · 2 FAIL yok ama ölçülemeyen kalem var · 4 port kapısı.
**R07:** dar kabul istisnası için geri döngüde düz http ile dinleyen ikinci bir **sahte yerel kenar** vardır (`D8_SELFTEST_LOCAL_PORT`,
varsayılan 8458; aynı yasak liste; sahte kenar portundan farklı olmalı). Dış ad `localhost:<port>`, yerel kenar `127.0.0.1:<yerel port>`
olduğundan sondanın yerel isteğinde Host başlığının dış adın ana makinesi olduğu **ölçülür**. İncelenmiş 400 yanıtının gövdesi öz-testte
**bağımsız** kurulur (standart hata sayfası, 155 bayt) ve SHA-256'sı bağımsız hesaplanır; sonda yalnız bayt sayısını ve özeti taşır.
Sahte kenar o yanıtı birebir ya da **tek özelliği** ayrılmış biçimde verir (başka vektöre · 2xx · kimlik başlıklı · gövdesi bir bayt
farklı · içerik türü farklı · yalnız genel sağlayıcı başlığı).

Kapsam yetkisi kapısının **tarih** girdilerinde (SA-11) sondanın saati, sondaya dokunulmadan, yalnız o girdinin alt sürecine yüklenen
bir ön yükleme dosyasıyla sabitlenir (`Date.now`) ve yerel saat dilimi TSİ olarak verilir; bu girdiler istek atılmayan `--phone-list`
kipinde koşar. Sonda bir sınama kancası **taşımaz**.

Aşağıda alan sırası her yerde "HTTP / ret · kenar engelleme · katman doğrulaması · pozitif kontrol"dür (P = PASS · F = FAIL · O =
OLCULEMEYEN); parantez içindeki sayı sondanın çıkış kodudur. **R06'da kenar engelleme ve katman sütunlarında P yoktur; çıkış 0 yoktur.**

| Kalem | Girdi → ölçülen alan |
|---|---|
| K-SRC · K-PORT | ürün kaynağındaki dayanaklar okunabildi; sondanın kabul deseni kaynaktaki metinle birebir, "üretilen kimlik" deseni `randomUUID()` çıktılarını tanır · öz-test port kapısı |
| **S1** · K-1 · **L-1** | **sağlıklı kenar → P · O · O · P (3)** — kenar engelleme PASS **değil**; tek neden `ULASMAMA-BAGIMSIZ-KANITI-YOK`; üç alan + pozitif kontrol ayrı, birleşik PASS yok; kayıt eki kapsamı ve kanıt sınırını taşır (kanıtta, özette ve çıktıda aynı) · kalibrasyon: API pozitiflerinde aynen geri yazma 3/3 **ve** değiştirme 3/3, başlıksız bölge temiz → `VAR` · **"API değil" çıkarımı yok**: başlıksız düz `/api` satırı (30) → `OLCULEMEYEN` / `BASLIK-YOKLUGU-KANIT-DEGIL`; ön uçuş (2), yolu belirsiz (14), web yolu (13) → `OLCULEMEYEN`; kapsam: API kanıtlı 0, ölçülemeyen 59; hiçbir satırın katman kimliği "API değil" değil |
| S1-p · S1-c · Y-1 · Y-2 · S7 | ham yol birebir (68/68) · kimlik bilgisi başlığı yok, gövde 0 / 2 bayt · **istek kimliği planı**: 59 ret vektörünün hepsinde gönderilen değer kaynak deseniyle **kabul edilmez**, API pozitiflerinde 3 + 3, web pozitiflerinde 2 + 1; tek kullanımlık · plan kapısı: iki biçim ayrışmıyorsa (bozulmuş kopya) sonda istek atmaz (4) · 3 HEAD + 3 OPTIONS + 18 varyant |
| S2 · N-5 | bozuk kenar (AD-2, tam kapsam yetkisi kaydıyla) → F · F · F · P (2); 20 sızan istek: API'nin işlediği 17 yanıtta **değiştirme** kanıtı, 2 ön uçuş 204, 1 başlıksız 404 · AD-2 koşumu AD-1'in dosyalarını değiştirmez; sonda yalnız dört yerde dosya okur (R07: dördüncüsü yalnız kesinleştirme adımındaki tek kanıt dosyasıdır; R06'da üç) |
| S3 · S3-b · S3-c · S3-dN | sağlayıcı engelleme imzası · başlıksız boş 403 · sağlayıcı `Server` + boş gövde · gövdesi dolu ama kimlik başlıksız 403 → ipuçları değişir; dört alan, nedenler ve katman kimliği S1 ile aynı (3) |
| **S3-ch · S3-chF · S3-az · S3-azP** | sınama işaretli 403 (hepsinde / birkaçında) → P · O · O · P (3): durum kodu ölçütü PASS kalır; kenar engelleme nedeni **işaret sınıfıdır** — S1'in "temiz gözlem" sınıfından **ayırt edilir** · işaretin altı yazımı tanınır · **tanınmayan** değerli işaret (beş değer; boş değer dahil) → aynı sonuç · işaret pozitifin beklenen yanıtında → ayrı neden sınıfı (3); işaretli 2xx → bulgu adayı kalır (2) |
| **A-1 · A-2 · A-3 · A-4 · A-5** | **API'nin ürettiği 403** (geçersiz biçim → yeni kimlik) → P · **F** · **F** · P (2) — S3-dN ile aynı durum kodları · yalnız yolu belirsiz vektörde → yine API kanıtı · kalibrasyon `YOK` iken ve yansıtan katman görülmüşken API kanıtı → kenar engelleme yine F · sınama işaretli yanıtlar + başka satırda API kanıtı → F korunur · **katman doğrulamasında desteksiz kesinlik yok (A-5):** aynı ret vektörünü API 403 ile yanıtlamış; koşumun kalibrasyonu "değiştirme" davranışını **hiç göstermedi** (0/3) → P · **F** · **O** · P (2), neden sınıfı yazılı, kapsamda API kanıtlı satır 0 · **en az bir kez** gösterdi (1/3) → P · F · **F** · P (2) |
| **R-1 · R-2 · R-3** | **yansıtan aracı** yalnız API önekli retlerde (ön uçuş hariç; başlıksız bölge temiz) → gönderilen değer aynen döner = `YANSIMA`, **API kanıtı yok**: P · O · O · P (3) · yansıtan her yerde (kenar + web; API başlığının üzerine de yazan) → API kanıtı yok · yansıma tek bölgede (ön uçuş · tek web ret · tek web pozitifi, iki biçimde) → kalibrasyon `GECERSIZ` (kenar nedeni kalibrasyon sınıfı) |
| **M-1 · M-2 · M-3 · M-4** | **damgalayan aracı** bütün ret yanıtlarında (API biçiminde kimlik) → "yeni kimlik" gözlemi API kanıtı **sayılmaz**: P · O · O · P (3) · damga + gerçek sızıntı (API 401) → kanıt kullanılamaz, durum kodu ölçütü F (2) · damga tek bölgede (web ret · ön uçuş · bir web pozitifi + API'nin 403'ü) → kanıt kullanılamaz (3) · API biçiminde **olmayan** değer yalnız API önekli retlerde → yabancı kimlik (3) |
| **E-1 · E-2** | **ezen aracı** başlığı siler → kalibrasyon `YOK` (kenar nedeni kalibrasyon sınıfı; S1'in sınıfından ayrı) (3); sızıntıda API kanıtı yok ama durum kodu ölçütü F (2) · başlığın üzerine yazar / canlı API kaynaktaki gibi davranmıyor → kalibrasyon `GECERSIZ`, kanıt kullanılamaz (3) |
| **SINIR-1** | sondanın **ölçemediği** durumun kaydı (güvence değil; §1.1): yalnız API önekli retlere API biçiminde kimlik yazan katman (kalibrasyon `VAR`) → kenar F ve katman F sayılır (2) · aynı aileden, koşumun kalibrasyonu öncülü **göstermiyor** (API pozitifleri değeri aynen döndürüyor: değiştirme 0/3) + tek bir kenar 403'ünde API biçiminde kimlik → kenar yine F (sınır sürer), katman **O** (2) |
| **SINIR-2 — REGRESYON (§3c-T5)** | **yalnız API'nin 403 yanıtından başlığı silen katman** (zemin gerçeği: bir ret vektörünü API yanıtladı — istek API'ye ulaştı; kalibrasyon `VAR`) → **düzeltilmiş sonda: P · O · O · P (3)**, tek neden `ULASMAMA-BAGIMSIZ-KANITI-YOK`; o satır "API değil" sayılmaz; dört alan, nedenler, satır düzeyi katman kimliği, durum sayıları, kapsam ve çıkış kodu **sağlıklı kenarla (S1) birebir aynı** — ikisi ayırt edilemediği için ikisine de PASS verilmez · **eski kuralı geri getiren sonda kopyası** (yalnız iki ifade: "başka neden yoksa kenar engelleme PASS" + "FAIL yok ve kenar PASS → çıkış 0") aynı girdide **yanlış PASS** üretir: P · **P** · O · P (**0**); sağlıklı kenarda da P · P (0) |
| **K-5 · K-10 · Z-1** | kısmi kalibrasyon (5/6 · 1/6 · yalnız değiştirme · yalnız aynen geri yazma) → `YOK`; kenar nedeni kalibrasyon sınıfı (3) · bir web pozitifi ölçülemedi → `YOK`, **yanıtsız pozitif → pozitif kontrol O** (3) · başlıksız bölge hiç ölçülemedi + API'nin 403'ü → kanıt kullanılamaz (3) |
| L-2 · L-2b · L-9 · L-3 · L-4 · L-5 · L-6 · L-8 · **H-1** | API kanıtlı 5xx / 429 / 3xx → F · F · F · P (2) · kanıtsız 5xx / 404 / yönlendirme (hedef kanıta yazılmaz) / 429 / sınıflanamayan kod (600) → **F** · O · O · P (2) · **yanıt alınamayan** tek ret vektörü → **O** · O · O · P (3) — doğrulanmış başka yanıtla tek etikette birleşmez |
| **U-1** · **U-2** · **U-3** | **tekdüze 403 → P · O · O · F (2)** — pozitif kontrol **FAIL** (izinli dokuz yolun dokuzu reddedildi; 403 istisnası yok); çıktı "ölçüt ihlali / bulgu adayı" der · sunulmayan ad (hepsi 404 / 301 / 401 / damgalı 404 / yansıtılmış 404 / 404 + taşıma hatası) → **F** · O · O · F (2) · kardeşler: hepsi 200 → F · F; yalnız pozitifler 404 → pozitif kontrol F; 404 + bir API kanıtlı yanıt → kenar engelleme F, katman O (kalibrasyonda değiştirme 0/3) |
| P-1 … **P-7** | pozitif kontrol ayrı kayıt, **tek kural, 403 istisnası yok**: token'sız 200 → P · O · O · **F** (2) · FAIL ölçülemeyenin önünde · **tek pozitif 403 (web / API) → pozitif kontrol F (2)** (P-3) · API'den geldiği kanıtsız 5xx / 429 / sınıflanamayan kod (600) → F (2) · web pozitifinde 302 / 404 → F (2) · iki sıra paritesi (P-6): API'nin izinli bir yolda ürettiği 503 / 429, gönderilen kimlik biçiminin iki sırasında **aynı** hüküm · **P-7: bütün pozitifler 403** (API pozitiflerinde 403'ü API üretti; kalibrasyon `VAR`) → F ×9 (2); tekdüze 403 → F ×9 (2); iki girdide durum kodları aynı, hüküm aynı; **yanıtsız pozitif → O** (3) |
| G-1 · **GT-1** · **X-1** · **X-2** | kenar her şeyi geçirir: API'nin işlediği her ret yanıtı API kanıtlı, başlıksız API yanıtları `OLCULEMEYEN` · **değişmezler** (bütün koşumlarda, zemin gerçeğiyle): kimlik anlamı bağımsız türetilenle aynı; API'nin üretmediği yanıt API sayılmaz; **hiçbir satır "API değil" sayılmaz**; **kenar engelleme ve katman doğrulaması hiçbir koşumda PASS değil**; "temiz gözlem" neden sınıfı yalnız tek başına yazılır ve o sınıftaki koşumlar arasında zemin gerçeğinde hem "bütün ret yanıtlarını kenar üretti" hem "bir ret yanıtını API üretti" olan vardır; pozitif kontrol değeri yalnız durum kodlarından bağımsız türetilenle aynı (403 dahil her beklenmeyen yanıt F); API'ye ulaşma nedeni kayıttaysa kenar engelleme F; katman doğrulaması F yalnız kalibrasyon "değiştirme" davranışını en az bir kez gösterdiyse · **çıkış kodu eşlemesi** bütün koşumlarda bağımsız yazılmış eşlemeyle aynı; **yalnız 2 ve 3 gözlenir — 0 hiç üretilmez**; çıkış 2 biçimleri arasında "yalnız kenar engelleme F" de gözlenir · tanınmayan alan değeri de 0 vermez |
| N-1 … N-4 · O-1 · O-1b · S5-a…e · S6 | ad kimliği kapısı · yinelenen parametre · konum etiketi kapısı · var olan kanıtın üzerine yazmama · etiket ana makine adını / parçasını içeriyorsa durma · http origin, TLS kapalı, kanıt yazılamaz (7), `--out` yok, geçersiz zaman aşımı · `--phone-list` ayrı çağrı (çıkış 0 yalnız burada görülür) |
| **SA-1 … SA-8** | **kapsam yetkisi kapısı** (sentetik kayıt / dosyalarla): kayıt yok → koşmaz (4), ileti sabit metin · yalnız tünel kaydı / zorunlu kalem eksik → RET ve **eksik kalemin türü adlandırılır** · özet tutmuyor / dosya sonradan değişti / dosya yok / boş → RET · ana makine birebir değil (alt alan, sondaki nokta, port, önek) → RET · ad kimliği uyuşmuyor → RET · **tam kayıt** → koşar; kanıtta yalnız durum (`KAYIT-KABUL-EDILDI`) + dosya bütünlüğü + içerik incelemesi beyanı durumu + kalem türleri · biçimsel hileler (gelecekteki tarih, geçersiz tarih, tanınmayan tür …) → RET · AD-1 ile kayıt verilmez; telefon listesinde de kapı |
| **SA-9** (§3c-T4, T5) | **birleşik sahiplik belgesi**: iki zorunlu kalem **aynı dosyayı** gösteriyor; dosya bütünlüğü + iki tür + bağ + inceleme beyanı tam → **KABUL** (sonda koşar; alanlar S1 ile aynı) · aynı içerik iki ayrı dosyada → KABUL · beyan yok → RET · tek tür → RET (eksik tür adlandırılır) · aynı türden iki kalem → RET · boş belge → RET · özeti tutmayan belge (birinci / ikinci kalemde) → RET · yalnız tünel kalemi → RET |
| **SA-10** (§3c-T4) | **içerik incelemesi beyanı zorunlu ve dosya bütünlüğünden ayrı**: beyan alanı yok / null → RET (`INCELEME-BEYANI-YOK`); inceleyen · tarih · incelenen kalem türleri eksik ya da bozuk (15 girdi) → RET (`INCELEME-BEYANI-GECERSIZ`) — hepsinde dosyalar var ve özetleri tutuyor · tam beyan → KABUL · kanıtta iki **ayrı** alan (`fileIntegrity: OLCULDU` · `contentReview: BEYAN-VAR`) · kabul çıktılarında, kanıtta ve özette "doğrulandı" yok, inceleyenin adı yok · sondanın kod satırlarında eski "doğrulandı" durumu yok · inceleme tarihi sınır saatinde kalem tarihiyle aynı kuralla (yerel bugün → KABUL · UTC bugün + 2 gün → RET) |
| **SA-11** (§3c-T4) | **tarih denetimi sınır saatlerinde** (saat sabitlenir; yerel saat dilimi TSİ): yerel gün UTC gününden ilerideyken (TSİ 00:00:00 ve 02:59:59) tarihi yerel **bugün** olan belge → **KABUL** · UTC bugün + 2 gün ve sonrası → RET (dört sınır saatinde) · aradaki tek gün bir günlük payla KABUL · **saatli biçim** iki ayrı saatte de RET (biçim reddi) · karşı girdi: aynı kayıt saat sabitlenmeden KABUL. Bu kalem düzeltmesiz (`main`) sondada da geçer: tarih kuralı değişmedi |
| O-2 · O-3 · V-1 · V-2 | adsız özette ad / yol / hata metni / yönlendirme hedefi / satır düzeyi bulgu adayı / sağlayıcı adı / kanıt dosyası bilgisi / inceleyen yok, alan kümesi sabit, sayılar ham kanıtla ve zemin gerçeğiyle uyumlu (14 koşumda; R07: dar sınıfın uygulandığı koşum dahil — özette ham yol / yerel adres yok) · özet SHA-256'sı bağımsız hesapla eşleşir · vektör kümesi kimliği kaynaktan bağımsız hesapla eşleşir · bir vektörü değişen kopyada kimlik değişir |
| T-1 … **T-5** · D-1 · **DOC-1** · B-0 | statik: pozitif liste · seçenek nesnesi, `ifPassed`, kimlik / kalibrasyon / katman / alan / çıkış kodu işlevleri ipucu okumaz · D8-E1/E2 kaynak kapsamı · "karar bekliyor" eşlemesi, "değerlendirme gerekir" sınıfı ve çıkış 5 sondada yok; çıkış kodu tek işlevden · **T-5: kalkan kuralların izi kod satırlarında yok** ("API değil" çıkarımı · pozitif 403 istisnası · aynı kanıtın iki kalemde reddi · "doğrulandı" durumu · PASS kaydının eki); kenar engelleme ve katman alanları yalnız PASS üretmeyen kapatıcıyla kapanır; çıkış kodu işlevinde 0 dönüşü yok · pinler · **belge ↔ kod ↔ öz-test**: belgedeki çıkış kodu eşlemesi sondanın kanıta yazdığı metinle aynı; §1b sütunları ve satır biçimi **koşum hücresine göre** (boşken dört sonuç hücresi "KOŞULMADI"; doluyken yalnız alan değerleri — kenar engelleme ve katman hücrelerinde PASS yok — + kısa biçimli koşum hücresi); kapsam yetkisi hücresindeki kabul metni sondanın çıktısıyla birebir; §3 ve §1d "ölçüm koşumu çıkış 0 üretmez" der; 2026-10-06 karar bölümü var · belgedeki iki blok tek satır, yalnız ASCII, yalnız AD-1 |
| **B-G** | blok düzeneğinin kapısı (§3b-K8): test ikamesi **kanıtlanamayan** (belgedeki biçimden kaymış: çift tırnak · değişmez dize değil · iki atama · ikinci mutlak `.env` yolu · sonda yolu kaymış · yalnız telefon bloğunda kayma) blok kümesi **hiç koşturulmaz** (kabuk başlatılmaz, betik dosyası yazılmaz, kenara istek gitmez); gerçek bloklardan hazırlanan dokuz metinde canlı kök adı, `.env` uzantılı değer ya da sahte dosyalar dışında mutlak yol yok |
| **B-1 … B-T2** (her biri iki kabukta) | belgeden çıkarılan blok metni, yalnız test için `.env` yolu / sonda yolu / pin ikamesi ve sahte kullanıcı köküyle, sahte `.env` ve sahte kenara karşı: olağan akış — **sağlıklı kenarda blok "cikis=3" aktarır (0 değil)**, özet SHA'sı; kabuğun **ölçülen** tam sürümü gözleme yazılır · satır sayısı 0 ve 2 → sonda hiç koşmaz · https olmayan / yollu değer → koşmaz · pin uyuşmazlığı → koşmaz · bozuk kenarda blok çıkış 2'yi aktarır · telefon listesi bloğu istek atmaz · telefon bloğunda pin uyuşmazlığı. Kabuk yoksa kalem **ÖLÇÜLEMEDİ**'dir (geçti değil) |
| S4 · S4-b | kenar kapalı → O · O · O · O (3; `BAGLANTI`) · doğrulanamayan sertifika → aynı (`TLS`); hata iletisi kanıtta yok |
| **MR-1** (R07; §3d — a) | **dar sınıf uygulanır:** tanımlı vektör incelenmiş 400 yanıtını birebir aldı + yerel kenar 403 + beyan `KULLANILMIYOR` → **OWNER-ISTISNASIYLA-UYGUN · O · O · P (3)** — HTTP / ret `PASS` **değil**; yalnız o satır sınıfın **tam adını** taşır; o satır 403 **sayılmaz** (403 58/59 · dar sınıf 1); kenar engelleme ve katman **PASS değil**, "temiz gözlem" sınıfı da değil; ad ve "owner kabul kuralı; teknik kanıt değildir" cümlesi çıktıda, kanıtta ve özette; yerel istek: aynı ham hedef, Host = dış adın ana makinesi, bir kez, bütün dış isteklerden **sonra** (iki sahte ucun ortak sıra sayacıyla ölçülür), kimlik bilgisi / gövde yok, kanıtta ayrı kayıt, toplam 68 + 1 = 69; karşı girdi: sağlıklı kenarda sınıf uygulanmaz |
| **MR-2** (b) | **başka isteğe uygulanmaz:** incelenmiş yanıt başka bir vektöre geldi → F · O · O · P (2) · aynı ham yol başka yöntemle (sonda kopyası) → tanım eşleşmez, F (2), yerel istek atılmaz · ham yol tek karakter farklı (kopya) → F (2); karşı girdi: aynı sahte kenar kipinde paket sondası → sınıf uygulanır |
| **MR-3** (c) | **2xx ve uygulamaya ulaşma kanıtı:** aynı gövde / içerik türüyle 200 → F · F · O · P (2) · aynı yanıt + API'nin ürettiği biçimde yeni kimlik → F · F · F · P (2) · aynı yanıt + yansıtılmış kimlik → F · O · O · P (2); üçünde de sınıf uygulanmaz |
| **MR-4** (d) | **yerel kenar gözlemi:** parametre verilmedi · yerel yanıt 404 / 200 / aynı 400 · kimlik başlıklı 403 · yanıtsız → sınıf uygulanmaz, F · O · O · P (2), tek neden `YEREL-KENAR-403-GOZLEMI-YOK`; atılan yerel istek toplam sayıya dahil ve bir kez |
| **MR-5** (d) | **incelenmiş yanıt özellikleri:** gövde aynı uzunlukta ama tek baytı farklı · içerik türü farklı · yalnız genel sağlayıcı başlığı (gövde boş) → sınıf uygulanmaz, F · O · O · P (2), tek neden `INCELENMIS-YANIT-OZELLIKLERI-UYUSMUYOR`; `Server` başlığı karara girmez |
| **MR-6** (d) | **sonda dışı ek kanıt:** beyan yok → uygulanmaz (2) · beyan `KULLANILACAK` → **kesinleşmez** (durum ayrı, satır F, çıkış 2) · kesinleştirme `GECERSIZ-…` → uygulanmaz (2) · kesinleştirme `GECERLI-…` → **uygulanır: OWNER-ISTISNASIYLA-UYGUN · O · O · P (3)**; kesinleştirme istek atmaz (sahte kenar 0 + sahte yerel kenar 0), kaynak kanıtı değiştirmez, ayrı kayıt yazar · "geçerli" sonucu tek başına yetmez (yanıtı tutmayan koşum yine uygulanmaz) |
| **MR-7** (e) | **liste sırası:** tanımlı vektörü listenin başına taşıyan sonda kopyası sınıfı yine o vektöre uygular; eski sırasına gelen vektör işaretlenmez · statik: tanım tek yerde (kimlik + ad + yöntem + ham hedef); karar işlevinde sıra numarası / dizin erişimi yok; paket listesinde tanımla eşleşen tam bir vektör |
| **MR-8** (f) | **alanlar birbirine dönüşmez:** aynı girdide sınıf uygulanan ve uygulanmayan iki koşumda kenar engelleme, katman doğrulaması ve pozitif kontrol alanları (değer + nedenler + kapsam) **bayt düzeyinde aynı**; değişen yalnız HTTP / ret (F → OWNER-ISTISNASIYLA-UYGUN; P değil) ve çıkış kodu (2 → 3); kenar engelleme nedeni `DURUM-KODU-OLCUTU-PASS-DEGIL` kalır; kesinleştirme öncesi / sonrası da aynı |
| **MR-9** | **kapılar:** `localhost` adı dahil `127.0.0.1` dışındaki her yerel ad / adres, https / yollu / portsuz değer, tanınmayan beyan ya da sonuç, yinelenen parametre, ölçüm çağrısında sonuç, telefon listesiyle birlikte → çıkış 4, iki sahte uca da istek yok · kesinleştirme retleri: beyansız ya da `KULLANILMIYOR` beyanlı kanıt · elle "uygulandı" yazılmış kanıt · **önceki revizyonun (R06) / başka sonda baytlarının kanıtı — geçmiş koşuma geriye dönük uygulanmaz** · başka ad / konum · satırı ya da sırası değiştirilmiş kanıt · var olan kaydın üzerine yazmama · başka `--origin` · **yalnız türetilmiş "eşleşti" alanı elle çevrilmiş kanıt → kendi içinde tutarsız** (karar ham özetle verilir; yeniden türetilen beş koşul kanıttaki kayıtla karşılaştırılır); değiştirilmemiş aynı kanıt kesinleştirilir ama sınıf uygulanmaz · **sınır kaydı (güvence değil):** ham değerleri, türetilmiş alanı ve koşul kaydı birlikte tutarlı yeniden yazılmış kanıt **ayırt edilemez** — yalnız koşum anında kaydedilen ham kanıt özetiyle karşılaştırma gösterir (§1) |
| **MR-10** (§3d-D8) | **sınıf uygulanan koşum "HTTP / ret PASS" diye sunulmaz:** uygulanan her koşumda ve kesinleştirme kaydında HTTP / ret alanı `OWNER-ISTISNASIYLA-UYGUN` — ham kanıtta, adsız özette, `D8-HTTP-RET` satırında ve `HTTP / RET SONUCU` satırında; hiçbirinde `PASS` değil · satırın **gerçek HTTP kodu 400** (zemin gerçeği = kanıt satırı = çıktı satırı), durum sınıfı `DORTYUZ-403-DISI`, sınıfın adı ayrı; 403 sayısına girmez · çıktı "403 başarısı değildir, owner kabul kuralına dayanır" der · kenar engelleme, katman doğrulaması ve pozitif kontrol bu değeri hiç almaz; kenar / katman `PASS` değil; çıkış 3 · değer sınıfın uygulanmadığı hiçbir koşumda geçmez · karşı girdiler: sınıfsız aynı girdi F, kesinleştirme `GECERSIZ-…` F, sağlıklı kenar P (R06 davranışı aynen) · statik: değer sondada tek sabit; alan değerleri kümesi ve çıkış kodu işlevi değişmedi |
| **MR-11** (R08; §3d-D9) | **kayıtlı özet kapısı:** `--evidence-sha256` verilmeden / biçimsiz değerle kesinleştirme → kapı (4), istek yok, kayıt yok · yanlış değer → `KANIT-OZETI-KAYITLA-UYUSMUYOR` · **kanıt koşumdan sonra tek bayt değiştirilmiş, verilen değer koşum sonu kaydı** → ret (içerik yorumlanmadan önce; revizyonu değiştirilmiş kanıtta da neden budur) · doğru değer (küçük harfle de) → kesinleştirir; kayıtta verilen ve hesaplanan özet ayrı alanlarda ve eşit · ölçüm çağrısında verilirse kapı · statik: "beklenen" değer dosyadan türetilmez, karşılaştırma `JSON` çözümlemesinden önce · **sınır kaydı (kusur değil):** kanıt **ve** verilen değer birlikte tutarlı değiştirilirse kabul edilir |
| **B-GY** (R08) | **son kapı — hiçbir blok koşturulmadan önce:** kabuğa verilecek her metin hazırlama işlevlerinden bağımsız bir denetimden geçer; bilerek bozulmuş 15 metin (yerel adres ikame edilmemiş · iki kez · ataması yok · değişmez olarak · çift tırnaklı · boşluklu · ikinci geri döngü adresi · `localhost` · canlı port sözcüğü · başka dış adres · ikinci `--local-edge` · canlı `.env` yolu · geçici dizin dışı yol · kanıt kökü ikamesiz · kullanıcı kökü dışarıda) **reddedilir**: kabuk başlatılmaz, betik yazılmaz, iki sahte uca 0 istek; iyi biçimli metin ve mevcut 9 hazırlanmış blok kabul edilir; kapının kendi denetimi geçmeden hiçbir metin başlatılmaz |
| **B-GZ** (R08) | **gerçek yeni bloklarla ikame kapısı:** belgedeki yerel karşılaştırmalı blok eski hazırlama yoluyla (yerel adres ikamesiz) hazırlanırsa son kapıda **reddedilir** (0 istek); bloğun bozulmuş biçimleri (yerel adres iki kez / hiç yok / çift tırnaklı / başka port / beyan değişkeni iki kez) ve kesinleştirme bloğunun bozulmuş biçimleri hazırlama aşamasında reddedilir; doğru ikameyle hazırlanan metinlerde canlı değişmez (8081, canlı `.env` yolu, canlı sonda yolu dışı mutlak yol) **kalmaz** |
| **B-Y1 … B-Y3** (R08; iki kabukta) | **yerel karşılaştırmalı ölçüm bloğu, test ikamesiyle:** beyan `KULLANILMIYOR` + tanımlı vektöre incelenmiş 400 → sahte kenara tam **68**, sahte yerel uca tam **1** istek (yerel istek en sonda; Host = dış ad); blok `cikis=3` aktarır; `D8-HTTP-RET=OWNER-ISTISNASIYLA-UYGUN` — **`PASS` / 403 başarısı diye geçmez**; ham kanıt özeti ekranda **ve** kanıt dizininin **dışındaki** kayıt dosyasında, ikisi de dosyanın bağımsız hesaplanan özetiyle aynı (Y1) · beyan yer tutucuda (belgede yazıldığı gibi) ya da tanınmayan değerde → blok **durur**, iki uca 0 istek; pin uyuşmazlığı → durur (Y2) · beyan `KULLANILACAK` → sınıf kesinleşmez, `cikis=2`, özet kaydı yine yazılır (Y3) |
| **B-K1 … B-K3** (R08; iki kabukta) | **kesinleştirme bloğu:** koşum çıktısından alınan kayıtlı değerle → `kesinlestirme cikis=3`, istek yok, kayıtta verilen = hesaplanan özet, HTTP / ret `OWNER-ISTISNASIYLA-UYGUN` (K1) · **kanıt koşumdan sonra tek bayt değiştirilmiş** → sonda reddeder (`KANIT-OZETI-KAYITLA-UYUSMUYOR`, `cikis=4`, kayıt yok); verilen değer yanlış / yer tutucu / kayıt dosyası yok / sonuç yer tutucu → blok durur, sonda koşmaz (K2) · **sınır kaydı (kusur değil):** kanıt, kayıt dosyası ve verilen değer birlikte tutarlı değiştirilirse kesinleştirme kabul eder (K3) |
| **DOC-3** (R08) | belge ↔ kod: istek bütçesi (68 + 1 = 69; sayaç ayrı: 72 / en çok 76) · yöntem sayıları sondanın vektör listesinden bağımsız sayımla aynı · zaman aşımı değerleri koddaki değerlerle aynı (15 000 ms; 69 × 15 = 1 035 sn) · iptal davranışı ve güven sınırı cümleleri · "tamamı salt okuma" yalnız olumsuz bağlamda · yeni bloklar ÇALIŞTIRILMADI · §3d-D9 owner cümleleri · R07 pinleri tam değerleriyle "önceki pinler"de |
| **DOC-2** | belge ↔ kod ↔ öz-test (R07): sınıfın adı ve uyarı cümlesi üçünde aynı; §3d karar tarihini ve kural sürümünü ayrı taşır; incelenmiş yanıt özellikleri ve vektör tanımı belgede; "dış 68 + yerel 1" ve ayrı izin kalemi yazılı; owner bloğu yerel karşılaştırmayı içermez ve kuralı yazılı; **§1b AD-1 satırı ve koşum kaydı değişmedi** (FAIL · FAIL · OLCULEMEYEN · PASS); HTTP / ret alanının ek değeri §1.1, §1b ve §3d'de, "`PASS` yazılmaz" kuralı §1b'de, owner şartının cümlesi §3d'de |

**R07'de beklentisi değişen eski kalemler (kural değişikliğinin ya da yeni kaydın doğrudan sonucu):** K-PORT (yasak listeye 8081 ve iki
aralık eklendi; sahte yerel kenar portu aynı kapıdan geçer) · N-5 (sonda artık dört yerde dosya okur: dördüncüsü yalnız kesinleştirme
adımındaki tek kanıt dosyasıdır) · GT-1 ((7) durum kodu ölçütü, dar sınıfın bağımsız beklendiği tek satır dışında; yeni (14); taranan
koşum sayısı) · O-2 (özetin üst düzey alan kümesine `malformedRejectClass` eklendi; revizyon `R07`; 14 koşum) · D-1 (yeni pinler) ·
DOC-1 (§1b HTTP / ret hücresi ek değeri de kabul eder; başka hiçbir hücre etmez) · GT-1 (1) (HTTP / ret alanı, yalnız dar sınıfın
bağımsız beklendiği koşumda, `PASS` yerine ek değeri alır; değer başka hiçbir koşumda geçmez).
Diğer kalemlerin beklentisi değişmedi.

**R08'de beklentisi değişen eski kalemler:** B-0 (belgede artık **dört** blok; yeni iki blok ayrı sınıflanır) · D-1 (pin; dört bloktaki
pin) · DOC-2 (e) (yerel karşılaştırmayı içermeyen bloklar artık "ilk iki blok") · MR-6 / MR-9 (kesinleştirme çağrıları kayıtlı özeti de
verir; kayıtta `registeredEvidenceSha256`; beklenen sonuçlar aynı) · O-2 ve kesinleştirme kaydı (sondanın revizyon adı `R08`; kural
sürümü `R07` aynen). Diğer kalemlerin beklentisi değişmedi.

**Son koşu (R08 baytları — §7 pinleri, 2026-10-06; Windows, node 24.18.0; kabuk sürümleri öz-testin kendi çıktısından: Windows PowerShell 5.1 = 5.1.26100.9549 (Desktop) · pwsh 7 = 7.6.6 (Core)):** 141 kalem — **PASS 141 · FAIL 0 · ÖLÇÜLEMEDİ 0**, çıkış 0. R07'nin 125 kalemine on altı kalem eklendi (MR-11 · B-GY · B-GZ · DOC-3 · iki kabukta B-Y1 … B-Y3 ve B-K1 … B-K3). Yeni bloklar yalnız sahte uçlara karşı, ikamesi kanıtlandıktan sonra koşturuldu; canlıya, dış adrese ve canlı yerel portlara istek atılmadı. **R08 baytlarıyla yapılmayanlar:** negatif ayna, mutasyon provası, yalıtılmış kopya deneyi, gerçek API ile izole prova.

**Önceki koşu (R07 baytları — §7 "önceki pinler", 2026-10-06; Windows, node 24.18.0; kabuk sürümleri öz-testin kendi çıktısından: Windows PowerShell 5.1 = 5.1.26100.9549 (Desktop) · pwsh 7 = 7.6.6 (Core)):** 125 kalem — **PASS 125 · FAIL 0 · ÖLÇÜLEMEDİ 0**, çıkış 0 (iki kabuktaki 14 blok kalemi dahil). R06'nın 114 kalemine on bir kalem eklendi (MR-1 … MR-10 · DOC-2); bütün koşumları tarayan değişmez kalemi (GT-1) 109 koşum taradı: dar sınıf bağımsız beklentinin verdiği 2 koşumda uygulandı (HTTP / ret alanı ikisinde de `OWNER-ISTISNASIYLA-UYGUN`, `PASS` değil), diğer 107 koşumda uygulanmadı; görülen çıkış kodları yalnız 2 ve 3'tür. Değişiklik öncesi taban (R06 baytları, aynı makine, aynı gün): 114 / 114, çıkış 0. **R07 baytlarıyla yapılmayanlar:** negatif ayna (R06 sondasının R07 öz-testinde koşturulması), mutasyon provası, yalıtılmış kopya deneyi, gerçek API ile izole prova — hiçbiri koşulmadı; aşağıdaki "Negatif ayna" ve "Mutasyon provası" bölümleri **R06 baytlarının** kaydıdır.

**Önceki koşu (R06 baytları, 2026-10-06; Windows, node 24.18.0; kabuk sürümleri öz-testin kendi çıktısından: Windows PowerShell 5.1 = 5.1.26100.9549 (Desktop) · pwsh 7 = 7.6.6 (Core)):** 114 kalem — **PASS 114 · FAIL 0 · ÖLÇÜLEMEDİ 0**, çıkış 0 (iki kabuktaki 14 blok kalemi dahil). R05'in 109 kalemine beş kalem eklendi (P-7 · SA-9 · SA-10 · SA-11 · T-5); bütün koşumları tarayan değişmez kalemi (GT-1) 89 koşum taradı ve görülen çıkış kodları yalnız 2 ve 3'tür.

**Negatif ayna — düzeltmesiz kod yanlış PASS üretir (§3c-T5).** `main`'deki R05 sondası (`git show c9f51af1:<sonda yolu>`; SHA-256
`EE0C6998…3F1A`) R06 öz-testinde koşturuldu: **77 / 114** (öz-test çıkışı 1; 114 kalem raporlandı).
- **Regresyon girdisi (SINIR-2 — yalnız API'nin 403 yanıtından başlığı silen katman; zemin gerçeği: bir ret vektörünü API yanıtladı):** düzeltmesiz sonda → çıkış 0 · durum kodu PASS · kenar engelleme PASS · katman OLCULEMEYEN · pozitif kontrol PASS — **yanlış PASS**; düzeltilmiş sonda (son koşu) → çıkış 3 · durum kodu PASS · kenar engelleme OLCULEMEYEN (ULASMAMA-BAGIMSIZ-KANITI-YOK) · katman OLCULEMEYEN · pozitif kontrol PASS.
- **Sağlıklı kenar girdisi (S1):** düzeltmesiz sonda → çıkış 0 · durum kodu PASS · kenar engelleme PASS · katman OLCULEMEYEN · pozitif kontrol PASS; düzeltilmiş sonda → çıkış 3 · durum kodu PASS · kenar engelleme OLCULEMEYEN (ULASMAMA-BAGIMSIZ-KANITI-YOK) · katman OLCULEMEYEN · pozitif kontrol PASS. Düzeltmesiz sonda iki girdiyi de aynı "kenar engelleme PASS · çıkış 0" sonucuyla veriyordu (ayırt edemiyordu); düzeltilmiş sonda ikisini de `OLCULEMEYEN` / çıkış 3 verir — ikisine de PASS yok.
- Düşen 37 kalem: S1, L-1, Y-2, S2, N-5, S3, S3-b, S3-c, S3-dN, S3-ch, S3-az, S3-azP, A-1, A-2, R-3, E-1, SINIR-2, K-5, U-1, U-2, P-3, P-7, P-4, N-1, SA-1, SA-6, SA-9, SA-10, GT-1, X-1, X-2, O-2, T-5, D-1, DOC-1, B-1 (iki kabukta). Bunların bir bölümü (ör. Y-2, A-1, A-2, R-3, E-1, K-5, N-1, SA-1) kendi girdisinde değil, karşılaştırdığı sağlıklı kenar koşumunun çıkış kodu / neden sınıfı yüzünden düşer; her alternatif sondada düşen pin kalemi D-1 de düşenler arasındadır.
- Geçen 77 kalem: K-SRC, K-PORT, K-1, S1-p, S1-c, Y-1, S7, S3-chF, A-3, A-4, A-5, R-1, R-2, M-1, M-2, M-3, M-4, E-2, SINIR-1, K-10, Z-1, L-2, L-2b, L-9, L-3, L-4, L-5, L-6, L-8, H-1, U-3, P-1, P-2, P-6, P-5, G-1, N-2, N-3, N-4, O-1, O-1b, S5-a, S5-b, S5-c, S5-d, S5-e, S6, SA-2, SA-3, SA-4, SA-5, SA-7, SA-8, SA-11, O-3, V-1, V-2, T-1, T-2, T-3, T-4, B-0, B-G, B-2 (iki kabukta), B-3 (iki kabukta), B-4 (iki kabukta), B-5 (iki kabukta), B-T (iki kabukta), B-T2 (iki kabukta), S4-b, S4 — bunlar bu turda değişmeyen kurallara bakar (vektör listesi, istek kimliği protokolü, API'ye ulaşma kanıtının FAIL vermesi, 403 dışı yanıtların sınıflanması, kapılar, blok metni). **SA-11 (tarih denetimi, sınır saatleri) düzeltmesiz sondada da geçer**: tarih kuralı bu turda değişmedi.

**Mutasyon provası (R06 baytları; bu turda değişen kurallar için).** Sondanın tek bir kuralı bozulmuş **35 kopyasının 35'i yakalandı** (R06 sonda ve öz-test baytları; paketin yalıtılmış bir kopyasında; taban 114 / 114, çıkış 0). "Yakalandı" = öz-testin 114 kaleminin hepsi raporlandı **ve** mutasyonla ilgili — taban koşusunda geçen — kalem FAIL oldu; öz-test çıkışının ≠ 0 olması tek başına sayılmadı; her alternatif sondada düşen pin kalemi D-1 hiçbir mutantta "ilgili" sayılmadı; hedefi kaynakta tam bir kez bulunmayan mutant üretilmez. Mutantlar **yalnız bu turda değişen kurallar** içindir: kanıt sınırı 12 · pozitif kontrol 5 · kapsam yetkisi kapısı 18. R05'in 88 mutantı R06 baytlarında yinelenmedi.

| Mutasyon | FAIL olan ilgili kalem |
|---|---|
| kenar engelleme: başka neden yoksa PASS (R05 kuralı; çıkış kodu yeni) | S1, SINIR-2, GT-1 |
| çıkış kodu: FAIL yoksa ve durum kodu + pozitif PASS ise 0 (belirsizlik başarı gibi) | S1, X-1, GT-1 |
| R05 kuralının tamamı: kenar engelleme PASS + çıkış 0 (düzeltmesiz davranış) | S1, SINIR-2, X-1, GT-1 |
| "API değil" çıkarımı geri gelir (başlıksız düz /api satırı API değil sayılır) | L-1, S1, GT-1 |
| "temiz gözlem" neden sınıfı yazılmaz (genel sınıfa düşer; ayırt edilemez) | S1, SINIR-2, S3-ch |
| "temiz gözlem" neden sınıfı HER koşumda yazılır (diğer ölçülemeyenlerden ayırt edilemez) | S3-ch, K-5, GT-1 |
| kalibrasyon eksikliği kenar engelleme nedeni değildir (kalibrasyon yokken de "temiz gözlem" sayılabilir) | K-5, E-1, GT-1 |
| kenar engelleme kaydının ekinden kanıt sınırı çıkar | S1 |
| kanıt sınırı çıktıya yazılmaz (owner bloğunun çıktısı sınırı göstermez) | S1 |
| kapsam sayısına "API değil gösterilen" geri gelir | S1, L-1, O-2 |
| katman doğrulaması olağan kapatıcıyla kapanır (PASS üretebilir kapatıcı) | T-5 |
| çıkış kodu eşleme METNİ eski kalır (kanıttaki metin "… → 0" der) | X-1, DOC-1 |
| pozitif kontrolde 403 istisnası geri gelir (reddedilen pozitif FAIL sayılmaz) | P-3, P-7, U-1, GT-1 |
| yalnız TEKDÜZE 403 pozitif kontrolde FAIL sayılmaz (tek pozitif 403 sayılır) | U-1, P-7, GT-1 |
| yalnız TEK pozitif 403 FAIL sayılmaz (hepsi reddedildiyse sayılır) | P-3, P-7, GT-1 |
| yanıt alınamayan pozitif FAIL sayılır | K-10, P-7, GT-1 |
| beklenmeyen yanıt "güvenlik kusuru" diye adlandırılır | P-3, U-1 |
| iki kalemin aynı dosyayı göstermesi yine ret nedeni (birleşik belge reddedilir) | SA-9 |
| inceleme beyanı zorunlu değil (iki denetim de kalkar) | SA-9, SA-10 |
| inceleme beyanı alanı yoksa kabul (var ama bozuksa ret) | SA-9, SA-10 |
| inceleyen (kim) denetlenmez | SA-10 |
| inceleme tarihi (ne zaman) denetlenmez | SA-10 |
| incelenen kalemlerin iki zorunlu türü kapsaması aranmaz | SA-10 |
| incelenen kalemlerde tanınmayan tür kabul edilir | SA-10 |
| inceleyenin adı kanıta ve özete yazılır | SA-6, SA-10, O-2 |
| kabul durumu yine "doğrulandı" adını taşır | SA-6, SA-10, GT-1 |
| içerik incelemesi ayrı alan olarak yazılmaz (yalnız dosya bütünlüğü) | SA-6, SA-10 |
| kabul metni "sahiplik doğrulandı" der | SA-6, SA-10, DOC-1 |
| boş kanıt dosyası kabul edilir | SA-3, SA-9 |
| kanıt dosyasının özeti karşılaştırılmaz | SA-3, SA-9 |
| tek kanıt türü yeter (iki ayrı kanıt unsuru aranmaz) | SA-2, SA-9 |
| tarih: bir günlük pay kalkar (UTC gününe göre "bugün"den ileri tarih ret) — yerel gün ilerideyken geçerli belge reddedilir | SA-11 |
| tarih: gelecekteki tarih kabul edilir | SA-7, SA-11 |
| tarih: yerel güne göre, paysız karşılaştırma | SA-11 |
| tarih: pay iki güne çıkar (UTC bugün + 2 kabul) | SA-11 |

**Belge kalemi DOC-1 — R06 kuralları iki yönde (depo dışı, yalıtılmış kopya).** Belge kopyasına **tek** bir dönüşüm uygulanıp öz-test o kopyada koşturuldu; 12 girdinin hepsinde 114 kalem raporlandı. **Kurala uygun** (4 girdi: değişmemiş belge · AD-1 satırı kurala göre dolu: PASS · OLCULEMEYEN · OLCULEMEYEN · PASS · AD-1 satırı kurala göre dolu: PASS · FAIL · FAIL · FAIL · ek ad satırı (AD-2), kapsam yetkisi hücresi sondanın KABUL metni, koşulmamış) → 4 / 4 girdide 114 / 114, çıkış 0 — satır gerçek bir koşumdan sonra belgenin kendi kuralıyla doldurulduğunda pinli öz-test düşmüyor. **Kural dışı** (8 girdi) → 8 / 8 girdide FAIL **yalnız** DOC-1 (çıkış 1): dolu satırda KENAR ENGELLEME hücresi PASS · dolu satırda KATMAN DOĞRULAMASI hücresi PASS · ek ad satırında kapsam yetkisi hücresi eski durum adı · §3 kapanış tanımından "ölçüm koşumu çıkış 0 üretmez" çıkarıldı · §1d anlatımından "ölçüm koşumu çıkış 0 üretmez" çıkarıldı · belgedeki çıkış kodu eşlemesi R05 metniyle değiştirildi · 2026-10-06 karar bölümünün başlığı silindi · §1b doldurma kuralından sondanın kabul metni silindi. R05'in 19 girdili deneyi (koşum hücresi biçimi, sayı / neden / yol yazılması vb.) R06 baytlarında yinelenmedi; o kurallar bu turda değişmedi.

**R05 dördüncü turun kayıtları (tarihsel; R06 baytlarında YİNELENMEDİ).** R05'in 88 mutantlık tablosu (88 / 88 yakalandı; 109
kalemlik öz-testte), iki eski sondayla negatif aynası (R04 sondası 20 / 109 · R05 üçüncü tur sondası 100 / 109), 19 girdili iki yönlü
DOC-1 deneyi, kabuk yokluğu provası (bir kabuk yokken o kabuğun 7 kalemi ÖLÇÜLEMEDİ, öz-test çıkışı 2) ve blok düzeneği deneyi (ikamesi
kanıtlanamayan blok hiç koşmadı) `main`'deki R05 belgesindedir (`c9f51af1`, bu dosyanın o sürümü §1c). O ölçümler R05 baytlarına aittir;
o tablodaki bazı mutantlar ("pozitif reddi (403) bulgu sayılır", "aynı kanıt iki kalemde kabul edilir", "çıkış kodu: kenar engelleme
PASS olmasa da 0", "API değil çıkarımı …") R06'da **kuralın kendisi** ya da kalkmış bir kural olduğundan geçerli mutant değildir. Öz-testin
blok düzeneği kodu R06'da değişmedi; yalnız B-1'in beklenen blok çıktısı "cikis=0" yerine "cikis=3" oldu (bu turun son koşusunda iki
kabukta ölçüldü).

**Öz-testin ölçmediği** (hiçbiri "geçti" sayılmaz):
- **R08 — yeni bloklar:** (1) bloklar **canlıda çalıştırılmadı**; öz-test onları yalnız test ikamesiyle (sahte `.env`, sahte kenar, sahte
  yerel uç, sahte kullanıcı kökü) koşturur — canlı `.env` satırı, canlı yerel kenarın gerçekten `127.0.0.1:8081`'de dinlediği ve o
  adresteki sürecin canlı kenar olduğu **ölçülmedi** (kayıt sahibinin beyanı; port farklıysa koşum paketi `$y`'yi düzeltir). (2) Bloğun
  yerel adres **biçim kapısı** ve iptal (Ctrl+C) davranışı koşturularak ölçülmedi: biçimi bozuk bir yerel adres taşıyan metni son kapı
  kabuğa vermez (statik olarak blok metninde aranır); iptal davranışı koddan okundu. (3) Zaman aşımı en kötü durumu hesaptır; yalnız
  tek yanıtsız vektörle ölçülen `ZAMAN-ASIMI` sınıfı vardır. (4) Sayaç okumaları öz-testte **yoktur** (blok onları yapmaz). (5) Kayıtlı
  özet kapısının güven sınırı ölçülür ama kapatılamaz (sınır kaydı: B-K3, MR-11). (6) Son kapı metin düzeyinde bir denetimdir; ağ
  düzeyinde bir engel değildir.
- **R07 — dar kabul istisnası:** (1) gerçek sağlayıcının, gerçek yerel kenarın ve gerçek uygulamanın boş baytlı istek hedefine ne yanıt
  verdiği **ölçülmedi** — öz-testteki 400 yanıtı, teşhis ölçümünde incelenen yanıttan sabitlenen özelliklerden (içerik türü + bayt sayısı +
  SHA-256; değerler owner metninde yoktur — §3d) bağımsız kurulmuş bir
  **girdidir**; canlıya ya da yerel kenara istek atılmadı. İncelenmiş yanıtın içerik türü başlığı tam `text/html` değilse (ör. karakter
  kümesi ekliyse) ya da sağlayıcı sayfayı değiştirirse sınıf uygulanmaz (satır FAIL kalır) — dar tarafta kalan bilinçli seçimdir.
  (2) **Sonda dışı ek kanıt** ölçülmez: sonda yalnız beyanı ve sonucu kaydeder; beyanın doğruluğu, kanıtın geçerlilik koşulları ve
  "açıklanamayan artış yok" hükmü kayıt sahibinindir. (3) Kesinleştirme adımı kanıt dosyasının **içeriğine güvenir**; öz-test, revizyon / pin /
  vektör kümesi / ad / ana makine / konum / satır sırası değişikliğinin, hükümle tutarsız satırın ve **yalnız türetilmiş alanı** (özet
  eşleşti · içerik türü eşleşti) elle çevrilmiş kanıtın reddedildiğini ölçer; ham değerleri ve koşul kaydı **birlikte tutarlı** yeniden
  yazılmış kanıtın ayırt **edilemediğini** de sınır kaydı olarak ölçer (MR-9) — o durumu yalnız koşum anında kaydedilen ham kanıt
  SHA-256'sı gösterir (§1); aynı kanıt için iki kesinleştirme engellenmez. (4) Yerel kenar isteğinin gerçekten **canlı
  kenar sürecine** gittiği ölçülmez: sonda verilen geri döngü adresine gider; o adreste canlı kenarın dinlediği kayıt sahibinin
  beyanıdır. (5) Owner bloğu yerel karşılaştırmayı içermediği için blok düzeneği (B-*) yeni girdileri **koşturmaz**. (6) Negatif ayna
  (R06 sondası R07 öz-testinde) ve mutasyon provası R07 baytlarıyla **yapılmadı**.
- **isteğin API'ye ulaşmadığı**: sondayla ve öz-testle **ölçülemez** (kanıt sınırı). Öz-test yalnız şunu ölçer: sağlıklı kenar ile
  başlığı silinmiş API reddi sondada aynı görünür ve ikisine de PASS verilmez (S1, SINIR-2, GT-1). Kesin kenar kabulünün yöntemi bu
  paketin dışındadır (öneri ayrıca sunulur).
- **gerçek API ve gerçek kenar**: öz-testteki API bir modeldir. Gerçek API ile izole prova R05 sonda baytlarıyla dokuz kipte yapıldı
  (§1.1); **R06 baytlarıyla yalnız dört kipte yinelendi** (diğer beş kip yinelenmedi). O provada da **olmayanlar**: tünel / sağlayıcı ayağı, gerçek web uygulaması (web yanıtları kenarın
  sentetik sayfasıydı), şablondaki kenar yazılımının kendisi. Canlı zincirin kimlik başlığını geçirip geçirmediği, canlı kenarın
  şablonla eşitliği, gerçek web uygulamasının yanıtlarında bu başlığın bulunup bulunmadığı **ölçülmedi**. FAIL yönündeki sınır
  (SINIR-1) güvence değil kayıttır.
- kenar engelleme ve katman doğrulamasının `PASS` dalı **yoktur**; öz-test bunu bütün koşumlarda (GT-1) ve statik olarak (T-5) ölçer.
- kapsam yetkisi kapısı kanıt dosyalarının **içeriğini** ölçmez (sonda da ölçmez) ve **inceleme beyanının doğruluğunu** ölçemez (yalnız
  beyanın varlığını ve tamlığını); AD-1 ad kimliğiyle koşulan adın gerçekten birincil ad olduğu ölçülmez (§1).
- kapsam yetkisi tarihleri yalnız `YYYY-AA-GG` biçiminde kabul edilir; saatli biçim reddedilir (SA-11) — saatli tarih yazan bir kayıt
  sahibi "biçim" nedeniyle ret alır. Tarih girdileri yalnız TSİ (UTC+3) ile ölçüldü; başka saat dilimi ölçülmedi.
- özet yazımından hemen önceki ikinci ad denetimi (çıkış 7) dürüst girdiyle tetiklenemez (R05'te yalnız mutasyonla gösterildi).
- özet ile ham kanıttan **yalnız birinin** yazılamadığı durumlar tetiklenemedi (yalnız "ikisi de yazılamadı" ölçüldü: S5-c).
- hata sınıflarından `AD-COZULMEDI` ve `DIGER` için senaryo yok (`BAGLANTI`, `TLS`, `ZAMAN-ASIMI` ölçülüyor).
- kapsam yetkisi kapısında dosyası bulunamayan / boş / özeti tutmayan kalemin **hangisi** olduğu iletide yazılmaz (yalnız neden
  sınıfı); eksik kalem adlandırması yalnız zorunlu kalem **türü** eksikken yapılır ve ölçülür (SA-2).
- §1b tablosunda doldurulmuş bir satırın kısa pin / vektör kümesi değerlerinin §7 ile **eşitliği** ve "dış ağ beyanı" hücresinin
  içeriği ölçülmez (DOC-1 yalnız biçimi ölçer).
- owner blokları betik dosyasından (`-File`) koşturuldu; konsola yapıştırma davranışı ve canlı `.env`'e karşı koşum ölçülmedi.
- sondanın beklenmeyen biçimde durması (çıkış 1) dürüst girdiyle tetiklenemez; yakalanmamış istisnada çalışma ortamının verdiği koddur.
- R05'in 88 mutantı, kabuk yokluğu provası ve blok düzeneği deneyi R06 baytlarında yinelenmedi (yukarıda).
- öz-test CI'da koşmaz; elle koşuldu.

Günlükler depo dışındadır (R06: `HY_R27_AGENT_EVIDENCE\r04\d8-hazirlik\r06\`; R05: `…\r05\tur4\`; izole prova `…\r05\izole-prova\`;
önceki turlar `…\r05\tur3\`, `…\r05\` ve `…\r05\duzeltme\`). Önceki
revizyonların kanıtları (R04 `r04\d8-probe-r02\`; R03 `extacc-d8-r01-is3-fix\`, `extacc-d8-r01-is3\`) korunur.

### 1d. Owner blokları — yalnız AD-1 (ölçüm bloğu 2026-10-06'da bir kez çalıştırıldı; telefon listesi bloğu çalıştırılmadı)

**Ölçüm bloğu 2026-10-06'da, owner onayıyla, AD-1 için bir kez çalıştırıldı (sonuç §1b ad satırında); ikinci koşum yeni onay ister.**
Aşağıdaki paragraf koşumdan önceki kuralı anlatır ve sonraki koşumlar için geçerlidir. Koşum, owner'ın canlı sonda kapsamı kararı ve **ad başına GO**'sundan sonra, kayıt
sahibinin penceresinde yapılır (§3c, açık kalan kararlar); owner'ın 2026-10-06 talimatı canlı sonda GO'su **değildir** (§3c-T0). Blok
**yalnız AD-1 (birincil ad)** içindir; başka ad için blok
**yazılmamıştır** (kapsam ve ad başına GO ayrıca; başka bir ad ayrıca kapsam yetkisi kaydı ister — §1). Dış origin yer tutucu
değildir: blok onu canlı yapılandırmadan (`.env` `PUBLIC_PORTAL_BASE_URL`; tek satır, salt okuma, D-5/D-6/D-7 bloklarıyla aynı kaynak)
okur, https / yolsuz origin biçim kapısından geçirir ve sondanın pinini doğrular; kapılardan biri tutmazsa sonda hiç koşmaz. Blok
canlı dist pini taşımaz (yalnız sondanın kendi SHA-256'sını pinler). Kanıt kökü kullanıcı profiline görelidir (public belgeye canlı
alan adı ve kullanıcı yolu yazılmaz). Blok mantık taşımaz (sınıflama sondadadır): ad kimliğini ve beyan edilen konum etiketini verir,
sondanın çıkış kodunu ve — **kısıtlı kayıt için** — adsız özetin SHA-256'sını yazdırır (bu değer public belgeye yazılmaz; §1b).
Sondanın kendi çıktısının son satırları dört alanı ayrı ayrı verir (`D8-HTTP-RET` · `D8-KENAR-ENGELLEME` · `D8-KATMAN-DOGRULAMA` ·
`D8-POZITIF-KONTROL`).

**R07 — aşağıdaki ilk iki blok yerel kenar karşılaştırmasını İÇERMEZ** (yerel karşılaştırmalı blok R08'de ayrıca yazıldı — bu bölümün
sonunda). Aşağıdaki ölçüm bloğu `--local-edge` ve `--offprobe-evidence` vermez
(blok metni R06 ile aynıdır; yalnız sonda pini değişti — 2026-10-06 koşumu R06 pinli blokla yapıldı; aşağıdaki güncel pinli bloklar
**çalıştırılmadı** ve yeni bir koşum yeni onay ister). Kural: **yerel gözlem yok → dar kabul istisnası uygulanmaz** — bu blokla
yapılan koşumda sonda R06 ile aynı 68 dış isteği atar, çıktıda `D8-DAR-SINIF=UYGULANMADI` yazar ve boş baytlı vektör 403 dışında bir
yanıt alırsa HTTP / ret sonucu R06'daki gibi `FAIL`'dir. Dar sınıfın değerlendirileceği bir koşum için blok **ayrıca** yazılır ve ayrı
onay ister: (1) yerel kenar isteği ayrı izin kalemidir (dış 68 + yerel 1; §1a, §3d); (2) yerel kenarın geri döngü adresi blokta tek,
açık bir değişkendir — `http://127.0.0.1:8081` adresi depoda zaten yazılıdır (kenar şablonu ve dış erişim paketi); R07'deki "public
belgeye yazılmaz" cümlesi bu yüzden **düzeltildi**; (3) öz-testin blok düzeneği, yerel adresin test ikamesi **kanıtlanmadan** böyle bir
bloğu koşturmaz (bu makine canlı ana makine olabilir — ikamesiz blok canlı yerel kenara istek atar; §3b-K8; öz-test B-GY, B-GZ). Bu üç
iş **R08'de yapıldı**: blok aşağıda ("R08") yazılıdır ve **çalıştırılmadı**. Bloklar sondanın `D8-HTTP-RET` satırını **ayrıştırmaz** (yalnız çıkış kodunu ve özetin SHA-256'sını
aktarır): yeni `OWNER-ISTISNASIYLA-UYGUN` değeri blok metninde değişiklik gerektirmedi; blok onu `PASS` gibi göstermez ve reddetmez.

Ölçüm (normal pencere):
```powershell
& { $ErrorActionPreference='Stop'; $e='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\.env'; $l=@([IO.File]::ReadAllLines($e) | Where-Object { $_ -match '^\s*PUBLIC_PORTAL_BASE_URL\s*=' }); if($l.Count -ne 1){ throw 'PUBLIC_PORTAL_BASE_URL satiri 1 degil - DUR' }; $ExpBaseUrl=($l[0] -replace '^\s*PUBLIC_PORTAL_BASE_URL\s*=\s*','').Trim().Trim('"').Trim("'"); if($ExpBaseUrl -cnotmatch '^https://[A-Za-z0-9.-]+(:\d+)?$'){ throw 'PUBLIC_PORTAL_BASE_URL https/yolsuz origin degil - DUR' }; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-extacc-d8-staff-surface-r01\scripts\d8-staff-surface-probe.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '04D0188320FADBC98F7A634F334E7065DF0110CBB58A9758B0DBE223A8B781AD'){ throw 'D8 SONDA SHA UYUSMUYOR - DUR' }; $o=Join-Path $env:USERPROFILE ('Documents\CLIENT-EVIDENCE-20260911\extacc-d8-AD-1-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'); New-Item -ItemType Directory -Force -Path $o | Out-Null; & node $f --alias AD-1 --vantage canli-ana-makine-cikisi --origin $ExpBaseUrl --out "$o\d8-probe.json"; $c=$LASTEXITCODE; 'D8 AD-1 cikis=' + $c; $s="$o\d8-probe.ozet.json"; if(Test-Path -LiteralPath $s){ 'D8 AD-1 adsiz ozet SHA256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $s).Hash } else { 'D8 AD-1 adsiz ozet YOK' } }
```

Telefon listesi (ayrı çağrı; istek atmaz, kanıt yazmaz; ölçüm bloğu listeyi yazdırmaz):
```powershell
& { $ErrorActionPreference='Stop'; $e='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\.env'; $l=@([IO.File]::ReadAllLines($e) | Where-Object { $_ -match '^\s*PUBLIC_PORTAL_BASE_URL\s*=' }); if($l.Count -ne 1){ throw 'PUBLIC_PORTAL_BASE_URL satiri 1 degil - DUR' }; $ExpBaseUrl=($l[0] -replace '^\s*PUBLIC_PORTAL_BASE_URL\s*=\s*','').Trim().Trim('"').Trim("'"); if($ExpBaseUrl -cnotmatch '^https://[A-Za-z0-9.-]+(:\d+)?$'){ throw 'PUBLIC_PORTAL_BASE_URL https/yolsuz origin degil - DUR' }; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-extacc-d8-staff-surface-r01\scripts\d8-staff-surface-probe.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '04D0188320FADBC98F7A634F334E7065DF0110CBB58A9758B0DBE223A8B781AD'){ throw 'D8 SONDA SHA UYUSMUYOR - DUR' }; & node $f --alias AD-1 --origin $ExpBaseUrl --phone-list; 'D8 AD-1 telefon listesi cikis=' + $LASTEXITCODE }
```

Konum etiketi `canli-ana-makine-cikisi` bir **beyandır**: blok canlı ana makinede koşar ve istek o makinenin çıkışından gider; sonda
konumu ölçmez. Dış ağ ayağı yalnız telefon beyanıdır (§2). Blok çıktısındaki `cikis=` değeri §1.1'deki çıkış kodudur. **Ölçüm bloğu
`cikis=0` yazdırmaz: ölçüm koşumu çıkış 0 üretmez** (owner kararı 2026-10-06, §3c-T2). 2'de en az bir alan FAIL'dir (ölçüt ihlali /
bulgu adayı; nedeni ayrı değerlendirilir); **3 olağan sonuçtur** — FAIL yoktur ve kenar engelleme `OLCULEMEYEN`'dir: sağlıklı bir
koşumda sondanın çıktısındaki neden `ULASMAMA-BAGIMSIZ-KANITI-YOK`'tur ("gözlem temiz ama isteğin API'ye ulaşmadığını gösteren bağımsız
kanıt yok"), başka bir neden sınıfı yazıyorsa koşumda ayrıca ölçülemeyen bir durum vardır; **3 başarılı kenar engellemesi demek
değildir**. 4'te sonda istek atmamıştır (blok önceden açtığı kanıt dizinini boş bırakır; boş dizin kanıt değildir — ör. konum etiketi
adın bir etiketini içeriyorsa); 1'de sonda beklenmeyen biçimde durmuştur (ölçülemeyen); 7'de özet ya da ham kanıt yazılamamıştır.
Sondanın çıktısı her koşumda "kenar engelleme kaydının eki" satırında kanıt sınırını da yazar. Telefon listesi bloğunun `cikis=0`
yazdırması olağandır (istek atmaz; ölçüm değildir).

**R08 — yerel karşılaştırmalı ölçüm bloğu ve kesinleştirme bloğu (yalnız AD-1). HAZIR — ÇALIŞTIRILMADI. Bu bölüm bir hazırlıktır;
canlı koşum izni DEĞİLDİR.** Owner talimatı §3d-D9'dadır. Bu iki blok yukarıdaki iki bloğun (yerel karşılaştırmasız ölçüm · telefon
listesi) yerine geçmez; onlar aynen durur. Dar kabul istisnasının (§1.1, §3d) değerlendirileceği bir koşum bu blokla yapılır ve **ayrı
onay** ister: dış 68 istek, yerel kenar isteği ve — kullanılacaksa — sayaç okumaları **ayrı izin kalemleridir**.

**İstek bütçesi (hazırlık bütçesi; henüz canlı koşum izni değildir).**

| Kalem | İstek | Kim atar | Not |
|---|---|---|---|
| dış istekler (59 ret + 9 pozitif) | 68 | sonda | yukarıdaki ölçüm bloğuyla aynı liste (§1a); vektör kümesi kimliği değişmedi |
| yerel karşılaştırma | 1 | sonda | yalnız `127.0.0.1` üzerinden, dış isteklerin hepsinden sonra, bir kez |
| **sondanın attığı toplam** | **69** | | kanıtta `measured.requestCount` = 69 (`externalRequests` 68 + `localEdgeRequests` 1) |
| sayaç okumaları (sonda dışı ek kanıt) | normalde 3 · en çok 7 | **bu blok DEĞİL** — ayrı adım | **bu 69'a DAHİL DEĞİLDİR**; blok sayaç okuması yapmaz. Kullanılırsa ayrı izin kalemidir |
| **toplam bütçe** | **normalde 72 · en çok 76** | | 68 dış + 1 yerel karşılaştırma + 3 sayaç = 72; sayaç okumaları 7'ye çıkarsa 68 + 1 + 7 = 76 |

Sayaç yönteminin ayrıntısı (ne okunduğu, nereden okunduğu) bu belgeye ve sondaya **yazılmaz** (kısıtlı kayıt); burada yalnız sayısı
ve bütçeye ayrı kalem olarak girdiği yazılıdır. Sayaç okuması kullanılmayacaksa bütçe 69'dur.

**Yöntemler (sondanın kaynağındaki vektör listesinden sayıldı).** Dış 68 istek: GET 41 · POST 11 · DELETE 6 · PUT 3 · PATCH 1 ·
HEAD 3 · OPTIONS 3. Bunların **21'i yazma yöntemidir** (POST 11 + PUT 3 + PATCH 1 + DELETE 6; 18'i ret vektörü, 3'ü token'sız pozitif);
POST / PUT / PATCH isteklerinin 15'i boş JSON gövdesi `{}` taşır, DELETE gövdesizdir. Yerel karşılaştırma: **1 GET**, gövdesiz. Hiçbir
istekte kimlik bilgisi yoktur; her istek tek kullanımlık bir istek kimliği başlığı taşır (§1).

**Olası yan etkiler — "tamamı salt okuma, veri değişmez" DENMEZ.** Sonda yazma verisi göndermez ve beklenen sonuç her ret vektöründe
kenarın 403 vermesidir; ama:
- kenar bir yazma isteğini **geçirirse** olası uygulama sonucu §1a tablosundadır (ör. boş gövdeli personel giriş isteği uygulamaya
  ulaşırsa giriş hız sınırı sayacı +1 olur). Bu bir olasılıktır; koşumdan önce "olmaz" denemez;
- sağlayıcı / tünel tarafında isteklerin **kayda geçmesi, puanlanması ya da hız sınırına sayılması** ölçülmedi (bilinmiyor);
- yerel karşılaştırma isteği yerel kenarın **günlüğüne düşebilir** (ölçülmedi); yerel kenar onu **geçirirse** istek uygulamaya ulaşır —
  o durumda yerel yanıt 403 olmaz ya da kimlik başlığı taşır ve dar kabul istisnası **zaten uygulanmaz**;
- pozitif vektörler (9 istek) tasarım gereği uygulamaya **ulaşır** (token olmadığı için 401 / sayfa 200 beklenir; yazma beklenmez);
- geçerli biçimdeki istek kimliği, uygulama o istekte 5xx üretirse uygulamanın hata kaydına yazılır (§1).

**Zaman aşımı (koddan okundu).** İstek başına sınır **15 000 ms**'dir (`D8_HTTP_TIMEOUT_MS` ortam değişkeniyle 500–120 000 ms; blok
bu değişkeni ayarlamaz — pencerede tanımlı değilse 15 000 ms geçerlidir). Bu sınır bir **boşta kalma** sınırıdır: bağlantıda o süre
boyunca hiç veri akmazsa istek kesilir ve satır `SONUC-YOK` / `ZAMAN-ASIMI` olur; sürekli ama çok yavaş akan bir yanıt için ayrı bir
toplam süre üst sınırı **yoktur** (gövdenin 4096 bayttan fazlası tutulmaz ama okunur). İstekler **sırayladır**, **yeniden deneme
yoktur**, yönlendirme izlenmez. En kötü durum (her istek boşta kalma sınırına takılırsa): 68 × 15 sn = 1 020 sn dış + 15 sn yerel =
**1 035 sn ≈ 17 dk 15 sn**; sonda çıkışta en çok 3 sn daha bekler. Değişken üst sınıra (120 000 ms) çekilirse aynı hesap 69 × 120 sn =
8 280 sn = 138 dk verir. Kesinleştirme bloğu istek atmaz; süresi dosya okuma ve hesaptan ibarettir.

**İptal davranışı (koddan okundu; canlıda denenmedi).** Koşum ön planda, tek süreçtir; arka plan ya da zamanlanmış çalıştırma yoktur.
Koşum kesilirse (pencere kapatılır / Ctrl+C):
- o ana kadar **gönderilmiş istekler geri alınamaz**; süren istek yarıda kalır;
- sonda kanıtı ve adsız özeti **yalnız bütün istekler bittikten sonra** yazar (önce özet, hemen ardından ham kanıt) — yarıda kesilen
  koşum **kanıt bırakmaz**; sondanın iptal için ayrı bir işleyicisi yoktur. Çok dar bir aralıkta (özet yazıldı, ham kanıt yazılmadı)
  yalnız özet kalabilir; ham kanıtı olmayan özet kanıt sayılmaz;
- blok kanıt dizinini sondadan **önce** açar: kesilen koşumdan boş (ya da yalnız özet içeren) bir dizin kalır; boş dizin kanıt değildir;
- blok kesildiği için **özet kaydı oluşmaz** ve `cikis=` satırı yazılmaz; kesinleştirme yapılamaz;
- yeniden koşum **yeni onay** ister (istekler yeniden gider; bütçe yeniden harcanır).

**Ham kanıt özeti — koşum sonunda kaydedilir, kesinleştirmeden önce.** Ölçüm bloğu, sonda bittikten hemen sonra ham kanıtın
SHA-256'sını hesaplar, ekrana `D8 AD-1 ham kanit SHA256=…` diye yazar **ve** kanıt dizininin **dışında** ayrı bir dosyaya yazar
(kanıt kökünde, kanıt dizininin adıyla: `extacc-d8-AD-1-<damga>Z.kanit-sha256.txt`; var olan dosyanın üzerine yazmaz). Ham kanıt
yoksa (sonda 4 / 1 / 7 ile çıktıysa) kayıt yazılmaz ve bu açıkça yazdırılır. **Kayıt sahibi ekrandaki değeri koşum biter bitmez kısıtlı
kayda / koşum manifestine alır** — asıl "ayrı kayıt" odur. Kesinleştirme bloğunda bu değer **elle** verilir (`$h`); blok ve sonda onu
kanıt dosyasından yeniden hesaplayıp "beklenen" diye **kullanmaz**. Blok önce verilen değerin kanıt kökündeki kayıt dosyasındaki
değerle aynı olduğunu denetler (ikisi de koşum anı kaydıdır; dosya yoksa ya da değer farklıysa blok durur), sonra sondayı
`--evidence-sha256` ile çağırır; sonda kanıt dosyasının gerçek özetini **verilen** değerle karşılaştırır ve farklıysa kesinleştirmez
(`KANIT-OZETI-KAYITLA-UYUSMUYOR`, çıkış 4, kayıt yazılmaz) — **sonradan değişmiş kanıt reddedilir**.

**Güven sınırı (açıkça).** Kanıt dosyası **ile** ayrı kayıt **birlikte ve tutarlı biçimde** değiştirilirse — yani kanıt değiştirilir,
kanıt kökündeki kayıt dosyası yeni özete göre yeniden yazılır **ve** kesinleştirme bloğuna yeni değer verilirse — blok ve sonda bunu
**ayırt edemez**; kesinleştirme yürür (öz-test bunu "sınır kaydı" olarak ölçer: B-K3, MR-11). Korunma, ayrı kaydın kanıt dizininin
**dışında ve bağımsız bir yerde** tutulmasına dayanır: koşum çıktısının alındığı kısıtlı kayıt / manifest. Kanıt kökündeki kayıt
dosyası kanıtla **aynı kök dizindedir** ve tek başına bağımsız sayılmaz. Hem kanıta hem o bağımsız kayda yazma erişimi olan biri için
bu denetim **teknik engel değildir**; bir bütünlük denetimidir, yetki denetimi değildir.

**Bloklar hüküm üretmez.** Sondanın satırlarını aynen aktarırlar. Dar sınıf uygulanan koşumda HTTP / ret satırı
`D8-HTTP-RET=OWNER-ISTISNASIYLA-UYGUN`'dur: bu **`PASS` değildir, HTTP 403 başarısı değildir**; kenar engelleme ve katman doğrulaması
satırları `OLCULEMEYEN` kalır (o iki alan `PASS` üretmez — §1.1). Bloğun kendi yazdığı satırlar yalnız çıkış kodu, özet değerleri ve
kayıt durumudur.

**Değişkenler — koşum paketi doldurur; bloklar yazıldığı haliyle DURUR (varsayılan yok):**
- ölçüm bloğu `$y` = yerel kenar adresi `http://127.0.0.1:8081` (kenar şablonundaki ve dış erişim paketindeki yerel giriş adresi —
  depoda zaten yazılıdır). Yalnız `http://127.0.0.1:<port>` biçimi kabul edilir (blokta ve sondada). Canlı yerel kenar başka bir
  portta dinliyorsa koşum paketi bu değişmezi düzeltir; sonda adresi ölçmez (§1c "ölçmediği").
- ölçüm bloğu `$k` = sonda dışı ek kanıt beyanı: `KULLANILACAK` ya da `KULLANILMIYOR`. Belgede yer tutucu yazılıdır; iki değerden
  biri yazılmadan blok **durur** (istek atılmaz).
- kesinleştirme bloğu `$j` = ham kanıt dosyasının tam yolu · `$h` = **koşum sonunda ayrı kayda alınmış** SHA-256 (64 büyük harf
  onaltılık hane) · `$r` = sonda dışı ek kanıtın sonucu (`GECERLI-ACIKLANAMAYAN-ARTIS-YOK` ya da
  `GECERSIZ-YA-DA-ACIKLANAMAYAN-ARTIS`). Üçü de yer tutucudur; doldurulmadan blok **durur**.

Yerel karşılaştırmalı ölçüm (normal pencere; **69 istek atar** — onaysız çalıştırılmaz):
```powershell
& { $ErrorActionPreference='Stop'; $e='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\.env'; $l=@([IO.File]::ReadAllLines($e) | Where-Object { $_ -match '^\s*PUBLIC_PORTAL_BASE_URL\s*=' }); if($l.Count -ne 1){ throw 'PUBLIC_PORTAL_BASE_URL satiri 1 degil - DUR' }; $ExpBaseUrl=($l[0] -replace '^\s*PUBLIC_PORTAL_BASE_URL\s*=\s*','').Trim().Trim('"').Trim("'"); if($ExpBaseUrl -cnotmatch '^https://[A-Za-z0-9.-]+(:\d+)?$'){ throw 'PUBLIC_PORTAL_BASE_URL https/yolsuz origin degil - DUR' }; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-extacc-d8-staff-surface-r01\scripts\d8-staff-surface-probe.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '04D0188320FADBC98F7A634F334E7065DF0110CBB58A9758B0DBE223A8B781AD'){ throw 'D8 SONDA SHA UYUSMUYOR - DUR' }; $y='http://127.0.0.1:8081'; if($y -cnotmatch '^http:[/][/]127[.]0[.]0[.]1:[0-9]{1,5}$'){ throw 'D8 YEREL KENAR ADRESI gecersiz - DUR' }; $k='BEYAN-SECILMEDI'; if(@('KULLANILACAK','KULLANILMIYOR') -cnotcontains $k){ throw 'D8 EK KANIT BEYANI secilmedi (KULLANILACAK ya da KULLANILMIYOR) - DUR' }; $o=Join-Path $env:USERPROFILE ('Documents\CLIENT-EVIDENCE-20260911\extacc-d8-AD-1-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'); $g=$o + '.kanit-sha256.txt'; New-Item -ItemType Directory -Force -Path $o | Out-Null; & node $f --alias AD-1 --vantage canli-ana-makine-cikisi --origin $ExpBaseUrl --local-edge $y --offprobe-evidence $k --out "$o\d8-probe.json"; $c=$LASTEXITCODE; 'D8 AD-1 cikis=' + $c; $p="$o\d8-probe.json"; if(Test-Path -LiteralPath $p){ $hh=(Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash; 'D8 AD-1 ham kanit SHA256=' + $hh; if(Test-Path -LiteralPath $g){ 'D8 AD-1 ham kanit ozet kaydi ZATEN VAR - yazilmadi' } else { [IO.File]::WriteAllText($g, $hh); 'D8 AD-1 ham kanit ozet kaydi yazildi (kanit dizininin disinda)' } } else { 'D8 AD-1 ham kanit YOK - ozet kaydi yazilmadi' }; $s="$o\d8-probe.ozet.json"; if(Test-Path -LiteralPath $s){ 'D8 AD-1 adsiz ozet SHA256=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $s).Hash } else { 'D8 AD-1 adsiz ozet YOK' } }
```

Kesinleştirme (ayrı çağrı; **istek atmaz**; yalnız beyanı `KULLANILACAK` olan koşumun kanıtı için):
```powershell
& { $ErrorActionPreference='Stop'; $e='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\.env'; $l=@([IO.File]::ReadAllLines($e) | Where-Object { $_ -match '^\s*PUBLIC_PORTAL_BASE_URL\s*=' }); if($l.Count -ne 1){ throw 'PUBLIC_PORTAL_BASE_URL satiri 1 degil - DUR' }; $ExpBaseUrl=($l[0] -replace '^\s*PUBLIC_PORTAL_BASE_URL\s*=\s*','').Trim().Trim('"').Trim("'"); if($ExpBaseUrl -cnotmatch '^https://[A-Za-z0-9.-]+(:\d+)?$'){ throw 'PUBLIC_PORTAL_BASE_URL https/yolsuz origin degil - DUR' }; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-extacc-d8-staff-surface-r01\scripts\d8-staff-surface-probe.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '04D0188320FADBC98F7A634F334E7065DF0110CBB58A9758B0DBE223A8B781AD'){ throw 'D8 SONDA SHA UYUSMUYOR - DUR' }; $j='KANIT-DOSYASI-YOLU'; $h='KOSUM-SONU-KAYITLI-SHA256'; $r='SONUC-SECILMEDI'; if(-not (Test-Path -LiteralPath $j -PathType Leaf)){ throw 'D8 KANIT DOSYASI yok - DUR' }; if($h -cnotmatch '^[0-9A-F]{64}$'){ throw 'D8 KAYITLI OZET 64 onaltilik hane (buyuk harf) degil - DUR' }; if(@('GECERLI-ACIKLANAMAYAN-ARTIS-YOK','GECERSIZ-YA-DA-ACIKLANAMAYAN-ARTIS') -cnotcontains $r){ throw 'D8 EK KANIT SONUCU secilmedi - DUR' }; $d=Split-Path -Parent $j; $g=$d + '.kanit-sha256.txt'; if(-not (Test-Path -LiteralPath $g -PathType Leaf)){ throw 'D8 KOSUM SONU OZET KAYDI dosyasi yok - DUR' }; if(([IO.File]::ReadAllText($g)).Trim() -cne $h){ throw 'D8 VERILEN OZET kosum sonu kayit dosyasindaki degerle ayni degil - DUR' }; & node $f --alias AD-1 --vantage canli-ana-makine-cikisi --origin $ExpBaseUrl --finalize $j --evidence-sha256 $h --offprobe-result $r --out (Join-Path $d 'd8-kesinlestirme.json'); 'D8 AD-1 kesinlestirme cikis=' + $LASTEXITCODE }
```

Blok çıktıları: ölçüm bloğunda `D8 AD-1 cikis=` §1.1'deki çıkış kodudur (dar sınıf uygulanan ve başka FAIL olmayan koşum **3** verir;
beyan `KULLANILACAK` ise sınıf koşum anında kesinleşmez ve boş baytlı vektör 400 aldıysa çıkış **2**'dir — kesinleştirme bloğu bundan
sonra çalıştırılır). Kesinleştirme bloğunda `D8 AD-1 kesinlestirme cikis=` aynı eşlemedir (2 / 3; 4 = kesinleştirme yapılmadı, neden
sınıfı sondanın iletisindedir). Kesinleştirme kaydı kanıt dizinine `d8-kesinlestirme.json` adıyla yazılır; dosya varsa sonda üzerine
yazmaz (ikinci kesinleştirme aynı dizinde reddedilir). Hiçbir çıkış kodu D-8 kapanışı değildir (§3).

## 2. D-8 telefon adımı (owner beyanı; makine ölçümü değildir)

Sonda `--phone-list` ile (ayrı çağrı; §1d ikinci blok) 5 adres yazar (`/auth/login`, `/`, `/api/auth/me`,
`/api/portal/admin/documents/pending`, `/api/cases`). Telefonda (Wi-Fi kapalı, mobil veri, gizli sekme) her adres için: **E** =
hata/erişim engellendi · **S** = sayfa/veri açıldı · **?**. Beyan `owner-declaration-d8.json` olarak ayrı dosyaya elle yazılır (sonda
yazmaz) ve **hangi ad için** verildiğini ad kimliğiyle taşır. S = ürün/kenar bulgusu adayı. Beyanın her ad için ayrı mı alınacağı,
canlı sonda kapsamı ve ad başına GO ile **birlikte netleşecek** açık karardır (§3c); o zamana kadar bir adın beyanı başka bir adın
satırına yazılmaz. Kapsam yetkisi kapısı telefon listesi çağrısında da geçerlidir (birincil ad dışındaki bir ad için liste, kapsam
yetkisi kaydı olmadan yazdırılmaz).

## 3. D-8 kapanış tanımı — ad başına, üç ayrı alan + pozitif kontrol; sonda tek başına kapanış üretmez

D-8 **ad başına** kaydedilir; "D-8 PASS" diye tek bir hüküm **yoktur** ve bir adın sonucu başka bir ad için söylenmez.

**Sonda tek başına D-8'i kapatamaz (owner kararı 2026-10-06, §3c-T2).** Kenar engelleme alanı sondayla `PASS` üretmez ve ölçüm koşumu
çıkış 0 üretmez. Sondanın verebileceği en iyi sonuç "FAIL yok; kenar engelleme `OLCULEMEYEN`"dir ve bu **ne kapanıştır ne başarılı
kenar engellemesidir**. Bir adın satırı (§1b) şu kayıtlar **ayrı ayrı** yazılarak doldurulur; hiçbiri diğerinin yerine geçmez ve her
biri **kanıtın desteklediği** değeri taşır:

1. **HTTP / ret sonucu** — `PASS` / `FAIL` / `OLCULEMEYEN` (yalnız durum kodu ölçütü). Beklenen 403 yerine doğrulanmış başka bir
   HTTP yanıtı `FAIL`'dir; yanıt alınamaması `OLCULEMEYEN`'dir. `PASS` yalnız "bütün ret vektörleri 403 aldı" demektir; kenar
   engellemesi demek değildir. **R07 (§3d):** tek tanımlı satır "İzin verilen bozuk istek reddi — katman doğrulanmadı" sınıfındaysa
   alan `PASS` **değil** `OWNER-ISTISNASIYLA-UYGUN` değerini alır: "diğer 58 ret vektörü 403 aldı; tanımlı satırın gerçek HTTP kodu 400'dür ve owner
   kabul kuralıyla ayrı sınıftadır" demektir — 403 başarısı değildir, o satır 403 sayılmaz, sınıf teknik kanıt değildir, satırın yanına
   dar sınıf notu yazılır (§1b) ve bu değer aşağıdaki 2. ve 3. kayıtlara hiçbir şey vermez.
2. **Kenar engelleme sonucu** — sondadan yalnız `FAIL` / `OLCULEMEYEN`. Engellenmesi gereken bir isteğin API'ye ulaştığı
   kanıtlanmışsa — API 403 vermiş olsa da — alan `FAIL`'dir (bulgu adayı) ve öyle **korunur**. FAIL yoksa alan `OLCULEMEYEN`'dir:
   sağlıklı koşumda neden "bağımsız kanıt yok"tur (`ULASMAMA-BAGIMSIZ-KANITI-YOK`); kalibrasyon eksikse, yanıt bir sınama yanıtıysa ya
   da başka bir ölçülemeyen nedeni varsa o neden sınıfı yazılır — ne "kapalı" ne kesin API sızıntısı. **"Dışarıdan kapalı" sözü
   sondanın çıktısına dayanarak söylenmez.** Başlığın bulunmaması isteğin API'ye ulaşmadığını kanıtlamaz; sağlıklı kenar ile başlığı
   silinmiş API reddi sondada ayırt edilemez (gerçek API ile izole provada ölçüldü, §1.1). **Kesin kenar kabulü**, sonda **dışı**
   bağımsız kanıt ve owner değerlendirmesiyle **ayrıca** kaydedilir; yöntem önerisi ayrıca sunulur ve owner kabul etmeden bu belgeye
   yöntem yazılmaz. O kayıt yapılana kadar adın kenar engelleme durumu "ölçülemeyen"dir.
3. **Katman doğrulaması** — sondadan yalnız `FAIL` / `OLCULEMEYEN`; ayrı alandır ve kenar engelleme sonucunun yerine geçmez.
   `OLCULEMEYEN` olağan sonuçtur ve satıra öyle yazılır (kapsam sayısı kısıtlı kayıtta). `FAIL` yalnız koşumun kendi kalibrasyonu
   API'nin "kabul edilmeyen biçim → yeni kimlik" davranışını en az bir kez gösterdiyse yazılır; göstermediyse aynı gözlem kenar
   engellemede `FAIL` kalır ama bu alan `OLCULEMEYEN`'dir (§1.1 "desteksiz kesinlik yok"). İpucu (`hints`, `layerHint`) katman kanıtı
   diye raporlanmaz; kenar / tünel / sağlayıcı adlandırılmaz; hiçbir satır için "API değil" denmez.
4. **Pozitif kontrol** — `PASS` / `FAIL` / `OLCULEMEYEN`; izin verilen yollar ayrı kayıttır. Tek kural (§1.1): beklenen kod → uygun ·
   yanıt alınamadı → `OLCULEMEYEN` · beklenen dışındaki doğrulanmış her yanıt, **403 dahil** → `FAIL`. Pozitif kontrol `FAIL`'i bir
   ölçüt ihlali / bulgu adayıdır; nedeni ayrı değerlendirilir ("ürün güvenlik kusuru kesinleşti" diye sunulmaz).
5. **Dış ağ beyanı** (telefon; §2) — makine ölçümü değildir; ayrı dosyada, ad kimliğiyle. Beyanı olmayan adın satırında "dış ağ ayağı
   YOK" yazılır.

Sonda çıkış kodları: **ölçüm koşumu çıkış 0 üretmez** · **2** = en az bir alan `FAIL` (ölçüt ihlali / bulgu adayı) · **3** = FAIL
yok; kenar engelleme ölçülemeyen — sağlıklı koşumun olağan sonucudur; **kapanış değildir ve başarılı kenar engellemesi değildir** ·
**1**, **7** = ölçülemeyen / kanıt yok — kapanış değildir · **4** = sonda koşmadı (kapsam yetkisi doğrulanmayan ad için satıra
"KOŞULMADI — kapsam yetkisi doğrulanmadı" yazılır).

Kurallar:
- Ölçülemeyen kontrol PASS sayılmaz ve hiçbir belgede kapanış / başarı gibi sunulmaz; kanıt yoksa satır "KOŞULMADI" kalır.
- Kanıttaki `measured.credentialHeaderRequests` 0 ve `measured.nonEmptyBodyRequests` 0 değilse koşum kanıt olarak KABUL EDİLMEZ (sonda
  beklenmeyen bir şey göndermiştir).
- Özetteki `probeSha256` §7 pinine, `vectorSetId` §7 değerine eşit değilse satır bu revizyonun ölçümü sayılmaz. (§1b AD-1 satırı R06
  revizyonunun ölçümüdür — pini §7 "önceki pinler" listesindedir; R07 kuralıyla yeniden değerlendirilmez.)
- **Dar kabul istisnası (R07, §3d) kapanış üretmez:** sınıf yalnız HTTP / ret kaydında tek bir satırın tek başına `FAIL` saydırılmamasıdır;
  kenar engelleme ve katman doğrulaması kayıtlarını değiştirmez, başka bir satırdaki bulgu adayını kapatmaz ve genel D-8 kabulü değildir.
  Sınıfın uygulandığı bir koşumda kanıt olarak şunlar **birlikte** aranır: ham kanıt + adsız özet (`malformedRejectClass.state` =
  `UYGULANDI`) ve — beyan `KULLANILACAK` idiyse — kesinleştirme kaydı (verilen kayıtlı özet = hesaplanan özet; R08) **ile** koşum sonunda
  bağımsız kayda alınmış özet değeri (kesinleştirme kaydındaki değer onunla aynı olmalıdır). Eksik ya da çelişkili kayıtla
  sınıf kabul edilmez.
- Bulgu adayının ayrıntısı (yol, yöntem, durum), sayılar ve nedenler **kısıtlı kayda** alınır; public PR'a ve public satıra yazılmaz
  (§1b). `POST /api/auth/login` uygulamaya ulaştıysa personel giriş sayacı +1 yan etkisi de kayda yazılır (tek istek; blok üretmez).
- Bu sonda sunucunun kendi çıkışından koşar; SEC-API-BIND-01 açıkken D-8 sonucu ayrıca "dışarıdan erişilemez" diye genellenmez.
- Bu belge canlı sonda, yayın, migration, e-posta, Run ya da Recover yetkisi **vermez**.

### 3b. OWNER KARARLARI (2026-10-05)

Bu kararlar owner'ın 2026-10-05 tarihli talimatıdır: CLIENT çalışma sayfasında verildi ve owner tarafından orada teyit edildi.
Kararların metni bu belgeye **aynen** yazılmıştır. Sonda, öz-test ve bu belge bu kararlara göre yazılmıştır; "öz-test" sütunu kararı
ölçen kalemleri gösterir. "Bu revizyonda nasıl uygulandı" sütunu uygulayıcının anlatımıdır (owner metni değildir). Dördüncü turda
eklenen iki kural — pozitif kontrolde tek kural (K5'in pozitiflerdeki karşılığı olarak) ve katman doğrulamasında desteksiz kesinlik yok
(K9'un uygulanışı olarak) — **çağıranın kararıdır**; kural metinleri owner'ın sözleri değildir ve ilgili satırda "dördüncü tur" diye
işaretlidir. **Bu tablonun "nasıl uygulandı" sütunu R05'i anlatır; owner'ın 2026-10-06 kararlarıyla (§3c) değişen yerler satırda "R06"
diye işaretlidir** — kenar engelleme `PASS` üretmez, pozitif kontrolde 403 istisnası yoktur, kapsam yetkisi kapısında birleşik belge
kabul edilir ve inceleme beyanı zorunludur.

| # | Karar (owner, aynen) | Bu revizyonda nasıl uygulandı | Öz-test |
|---|---|---|---|
| K1 | "Kenarda engellenmesi gereken isteğin API'ye ulaştığı kanıtlanırsa kenar ölçütü FAIL/bulgu adayıdır; API'nin 403 vermesi bunu kapatmaz. API'ye geçmesine izin verilen yolları bu kuralla karıştırma." | API'ye özgü kanıtlı ret satırı — durum kodu 403 olsa da — kenar engelleme `FAIL` (çıkış 2) ve, koşumun kalibrasyonu o davranışı en az bir kez gösterdiyse, katman doğrulaması `FAIL` (K9 satırı); durum kodu ölçütü ayrı alandır. Pozitif vektörler ayrı "pozitif kontrol" kaydındadır ve pozitifteki API kanıtı ret alanlarına karışmaz | A-1, A-2, A-5, P-1, P-6 |
| K2 | "Gerekli kalibrasyon başarısız veya eksikse koşum genel olarak 'kapalı' hükmü veremez. Bağımsız olarak kanıtlanan ihlal yine FAIL/bulgu olarak korunur. Kalibrasyon eksikliği somut olumsuz kanıtı silemez." | kalibrasyon `VAR` değilken kenar engelleme `OLCULEMEYEN`'dir (neden kalibrasyon sınıfı); aynı koşumda API'ye özgü kanıt varsa `FAIL` korunur (kalibrasyon `YOK` iken de, yansıtan katman görülmüşken de). **R06:** kenar engelleme kalibrasyon `VAR` iken de `PASS` üretmez (§3c-T2); kalibrasyon yalnız API kanıtının kullanılabilirliği içindir | K-5, E-1, R-3, A-3, U-3 |
| K3 | "HTTP durum kodu eşleşmesi ayrı kaydedilebilir; fakat challenge yanıtı, hedeflenen erişim kuralının uygulandığını kanıtlamaz. Kenar engelleme hükmü ÖLÇÜLEMEYEN/UNKNOWN kalır. Başka bağımsız kanıt yoksa ne 'kapalı' ne de kesin API sızıntısı yazılır." | sınama işaretli (ve tanınmayan azaltım işaretli) 403: HTTP / ret `PASS`, kenar engelleme `OLCULEMEYEN` (çıkış 3); başka satırda API kanıtı varsa `FAIL` korunur | S3-ch, S3-chF, S3-az, S3-azP, A-4 |
| K4 | "Her ad için HTTP/ret sonucu, kenar engelleme sonucu ve katman doğrulaması ayrı alanlar olsun. Kanıtın desteklediği PASS / FAIL / ÖLÇÜLEMEYEN değerini yaz. Sahiplik doğrulanmamışsa 'KOŞULMADI — kapsam yetkisi doğrulanmadı' de. Kısıtlı ad ve altyapı ayrıntıları yerine gerektiğinde ad kimliği kullan; public kayda hassas kanıt taşıma." | üç ayrı alan + pozitif kontrol (§1.1); §1b tablosu ad kimliği başına ayrı sütunlarla; public satırda yalnız alan değerleri; kapsam yetkisi doğrulanmayan ad için sonda koşmaz ve o metni yazar | S1, GT-1, X-1, SA-1, DOC-1, O-2 |
| K5 | "Beklenen 403 yerine doğrulanmış başka HTTP yanıtı geldiyse durum kodu ölçütü FAIL kalır. Yanıt alınamaması ise ÖLÇÜLEMEYEN'dir. Bunları genel 'owner değerlendirmesi' etiketi altında birleştirme." | HTTP / ret: 403 dışı her doğrulanmış yanıt `FAIL` (kanıtsız 5xx / 429 / 3xx / 4xx dahil); yanıtsız ret vektörü `OLCULEMEYEN`; "değerlendirme gerekir" etiketi ve çıkış 5 kaldırıldı. **Dördüncü tur (çağıranın kararı):** aynı ayrım pozitif kontrolde de tek kuraldır — beklenen dışındaki doğrulanmış her yanıt `FAIL`, yanıt alınamaması `OLCULEMEYEN`; gönderilen kimlik biçimine bağlı değildir. **R06 (owner kararı, §3c-T3):** R05'teki "pozitif 403 → `OLCULEMEYEN`" istisnası **kalktı** — reddedilen pozitif de `FAIL`'dir | L-3 … L-8, H-1, U-2, T-4 · P-3, P-4, P-6, P-7 |
| K6 | Diğer adın kapsam yetkisi: "yetkili sağlayıcı hesabındaki bölge/özel ad kaydı + DNS zinciri yeterli. Tünel kaydı tek başına yeterli değil. Kanıt eksikse yalnız eksik girdiyi iste; sahiplik kapısını uygulamayı bekletme." | kapsam yetkisi kapısı sondada (§1): AD-1 dışındaki ad kimliği kayıtsız koşmaz; iki kalem + dosya + SHA-256 + tarih + ad kimliği / ana makine bağı ölçülür; yalnız tünel kaydı RET; zorunlu bir kalem eksikse ret iletisi **eksik kalemin türünü** adlandırır (dördüncü tur). Asgari ölçütün ötesindeki koşullar §1'de "uygulayıcı sıkılaştırması (owner kararı değildir)" diye ayrı işaretlidir. **R06 (owner kararı, §3c-T4):** iki kalemin aynı dosyayı göstermesi ret nedeni değildir (birleşik belge); içerik incelemesi beyanı zorunludur ve dosya bütünlüğünden ayrı kaydedilir. Bugün hiçbir ek ad için kayıt sunulmadı — eksik olan yalnız bu girdidir | SA-1 … SA-11 |
| K7 | "R27 yayın paketi ve kalan işler karar listesindeki eski 'tek PASS ile kapanış' ifadelerini düzeltmek için dar kapsam genişletmesini onaylıyorum. … Yalnız D-8'in güncel karar ve kapanış tanımını düzelt. Tarihsel koşum sonuçlarını değiştirme." | `client-release-r27-r01/R27-RELEASE-PACKAGE-R01.md` — yalnız D-8 ölçüt satırı + tek cümlelik not · `CLIENT-KALAN-ISLER-R01.md` — D-8 satırı, §3.3, §5, §11 KR-9 | — (belge) |
| K8 | "Öz-testin canlı hedefe çıkmasını engelleyen ikame kontrolü zorunlu kalsın. İkame kanıtlanamazsa owner bloğu hiç çalışmamalı." | öz-testin blok düzeneği, `.env` yolu / sonda yolu / pin ikamesi kanıtlanmadan bloğu hiç koşturmaz (değişmedi; bu turun baytlarında iki kabukta yeniden ölçüldü) | B-G, B-0, B-1 … B-T2 |
| K9 | İzole prova ölçütü: prova "sıradan yansıyan girdi ile API'ye ulaşmayı gerçekten ayırt eden kanıtı sınayacak; kanıtın desteklemediği katman kesinliğini reddedecek." | kanıt kuralı "kabul edilmeyen biçim → yeni kimlik" üzerine yeniden kuruldu; yansıma, damga, ezme ve kısmi kalibrasyonda katman / kenar hükmü `OLCULEMEYEN` (§1.1). **Dördüncü tur (çağıranın kararı):** koşumun kalibrasyonu "yeni kimlik" davranışını hiç göstermediyse ret satırındaki aynı gözlem kenar engellemede `FAIL` kalır ama katman doğrulaması "API" kesinliği bildirmez (`OLCULEMEYEN`). **Gerçek API ile izole prova R05 sonda baytlarıyla yapıldı** (sonuç §1.1'de — sıradan yansıma API kanıtı üretmedi; desteklenmeyen katman kesinliği bildirilmedi; aynı prova başlığı silinen API reddinde R05 sondasının kenar engelleme PASS verdiğini de ölçtü — R06'nın düzelttiği budur, §3c-T2); R06 baytlarıyla yinelenmedi; öz-testteki API bir modeldir | R-1 … R-3, M-1 … M-4, E-1, E-2, Z-1, SINIR-1, SINIR-2, A-5 |
| K10 | "Bu talimat canlı sonda, yayın, migration, e-posta, Run veya Recover yetkisi vermiyor." | canlıya hiçbir istek atılmadı; blok yalnız AD-1 için hazır ve çalıştırılmadı | — |

### 3c. OWNER KARARLARI (2026-10-06)

Bu kararlar owner'ın 2026-10-06 tarihli talimatıdır; CLIENT çalışma sayfasında verildi ve owner tarafından orada teyit edildi.
Metinler bu belgeye **aynen** yazılmıştır. "Bu revizyonda nasıl uygulandı" sütunu
uygulayıcının anlatımıdır (owner metni değildir). Kararların dayanağı gerçek API ile izole provanın ölçtüğü sonuçtur (§1.1): kenar yalnız
API'nin 403 yanıtından kimlik başlığını silerse R05 sondası "durum kodu PASS · kenar engelleme PASS · çıkış 0" veriyordu, oysa istek
API'ye ulaşmıştı; owner bu sonucu kabul etmedi.

| # | Karar (owner, aynen) | Bu revizyonda nasıl uygulandı | Öz-test |
|---|---|---|---|
| T2 | "Gerçek API'nin 403 yanıtından kimlik başlığı silindiğinde kenar engelleme PASS çıkmasını kabul etmiyorum. Başlığın bulunmaması, isteğin API'ye ulaşmadığını kanıtlamaz. Pozitif yolların kalibrasyonu da ret yollarında başlığın korunacağını kanıtlamaz. En küçük düzeltmeyi uygula: - HTTP 403 eşleşmesi kendi alanında PASS kalabilir. - Kenar engelleme, bağımsız yeterli kanıt yoksa ÖLÇÜLEMEYEN olsun. - API'ye ulaşma kanıtı bulunan ihlal FAIL olarak korunsun. - 'API değil' çıkarımı ve kapsam sayıları da aynı kanıt sınırına uysun. - Çıkış kodu ve kapanış belgeleri, bu belirsizliği başarılı kenar engellemesi gibi sunmasın. Sağlıklı kenar ile başlığı silinmiş API reddi dışarıdan ayırt edilemiyorsa ikisine de kenar engelleme PASS verme. Bu sınırı dürüstçe ölçülemeyen bırakmak yeterlidir; bu iş için yeni ürün telemetrisi veya geniş mimari değişiklik istemiyorum." | HTTP / ret alanı değişmedi (bütün ret vektörleri 403 → `PASS`). **Kenar engelleme sondayla `PASS` üretmez**: sondada "ulaşmama"yı gösteren bağımsız kanıt bulunmadığından FAIL yoksa alan her koşumda `OLCULEMEYEN`'dir; sağlıklı koşumun neden sınıfı `ULASMAMA-BAGIMSIZ-KANITI-YOK`'tur ve diğer ölçülemeyen nedenlerinden (kalibrasyon, işaretli 403, yansıma, yanıtsız vektör …) ayrı sınıftır. API'ye ulaşma kanıtı (ve reddedilmeyen ret vektörü) `FAIL` olarak **korunur**. "API değil" çıkarımı satır düzeyinde **kalktı** (o satırlar `OLCULEMEYEN` / `BASLIK-YOKLUGU-KANIT-DEGIL`); "API değil gösterilen" kapsam sayısı kalktı; katman doğrulaması `PASS` üretmez. **Çıkış kodu:** herhangi bir alan FAIL → 2 · FAIL yok → 3; ölçüm koşumu **0 üretmez**. Kapanış tanımı (§3), ad başına satır kuralı (§1b), owner bloğu anlatımı (§1d), R27 paketi ve dış erişim paketindeki D-8 satırları ölçülemeyeni kapanış / başarı gibi sunmaz. Yeni ürün telemetrisi, yeni kanıt girdisi ya da mimari değişiklik **eklenmedi**; kesin kenar kabulü için sonda dışı bağımsız kanıt ve owner değerlendirmesi gerekir (yöntem önerisi ayrıca sunulur) | S1, SINIR-2, L-1, GT-1, X-1, X-2, T-5, DOC-1, B-1 |
| T3 | "İzinli yolda beklenen kod yerine doğrulanmış başka HTTP yanıtı gelmesi, 403 DAHİL, pozitif kontrol ölçütünde FAIL olsun. Yanıt alınamaması ÖLÇÜLEMEYEN kalsın. Beklenmeyen yanıtı 'ürün güvenlik kusuru kesinleşti' diye sunma; önce ölçüt ihlali/bulgu adayıdır, nedeni ayrı değerlendirilir. Kod, test ve rapordaki 403 istisnasını uzlaştır." | pozitif kontrolde tek kural: beklenen kod → uygun · yanıt alınamadı → `OLCULEMEYEN` · beklenen dışındaki doğrulanmış **her** yanıt, 403 dahil → `FAIL`. R05'teki `POZITIF-REDDEDILDI-403` (ölçülemeyen) neden sınıfı kalktı; tek pozitif 403, bütün pozitifler 403 ve tekdüze 403 pozitif kontrol `FAIL` verir (çıkış 2). Sondanın çıktısı ve kanıt notu FAIL satırlarını "ölçüt ihlali / bulgu adayı; nedeni ayrı değerlendirilir" diye adlandırır. 403 istisnasının geçtiği yerler uzlaştırıldı: sonda (kural, başlık yorumu, kanıt notu), öz-test (P-3, P-4, U-1, U-2, GT-1) ve belgeler (§1.1, §3, §3b-K5, R27 paketi, kalan işler listesi) | P-3, P-7, U-1, K-10, P-4, GT-1, T-5 |
| T4 | "Boş veya hash'i uyuşmayan kanıtın reddi kalsın. Tarih kontrolünün TSİ/UTC farkıyla geçerli belgeyi reddetmediğini doğrula. İki kanıt türünün aynı dosyada bulunmasını tek başına ret nedeni yapma. Sağlayıcı hesabı kaydı ile DNS zinciri tek bir birleşik belgede bulunabilir. İki ayrı kanıt unsuru, içerik incelemesi ve ad bağı zorunlu; iki ayrı dosya zorunlu değil. Sonda dosyanın içeriğini doğrulamıyorsa 'sahipliği makine doğruladı' yazma. İçerik incelemesi ile dosya bütünlüğü kontrolünü ayrı kaydet." | boş dosya ve SHA-256 uyuşmazlığı reddi **kaldı**. **Tarih denetimi ölçüldü** (sınır saatleri, TSİ; düzeltme öncesi ve sonrası baytlarda aynı sonuç): yerel gün UTC gününden ilerideyken yerel bugünün tarihi reddedilmiyor — kod **değişmedi**; saatli biçim her saatte biçim nedeniyle reddedilir (§1). "İki zorunlu kalem aynı dosyayı / içeriği gösteremez" kuralı **kalktı**: birleşik belge kabul edilir; zorunlu olan iki ayrı kanıt unsuru (iki tür, iki kalem), ad kimliği / ana makine bağı, dosya bütünlüğü ve **içerik incelemesi beyanı** (yeni zorunlu `review` alanı: kim · ne zaman · hangi kalem türleri). Kanıtta iki **ayrı** alan: `fileIntegrity: OLCULDU` (sondanın ölçtüğü) ve `contentReview: BEYAN-VAR` (sondanın yalnız varlığını kaydettiği insan beyanı). Durum adı `KAYIT-KABUL-EDILDI` oldu; kodda, kanıtta, özette, çıktıda ve belgelerde sahipliğin sonda tarafından doğrulandığı anlamına gelen ifade kalmadı; public satır metni: "kapsam yetkisi kaydı kabul edildi — dosya bütünlüğü ölçüldü; içerik incelemesi beyanı kayıt sahibinde" | SA-3, SA-6, SA-9, SA-10, SA-11, DOC-1 |
| T5 | "Dış erişim paketindeki eski D-8 ölçüt satırını da aynı takip PR'ında dar biçimde güncelleme yetkisi veriyorum. Tarihsel sonuçları koru. Mevcut başlık-silme provasını regresyon testi yap: düzeltmesiz kod yanlış PASS üretmeli; düzeltilmiş kod ÖLÇÜLEMEYEN vermeli. Pozitif 403 ve birleşik sahiplik belgesi senaryolarını da doğrula. Mevcut testleri kullan; yeni geniş prova veya çok turlu inceleme başlatma." | `client-external-access-r01/CLIENT-EXTERNAL-ACCESS-PACKAGE-R01.md` — yalnız kabul ölçütleri tablosundaki D-8 satırı güncel tanıma atıfla güncellendi; izole prova sonuç satırı ve diğer tarihsel sonuçlar **değişmedi**. Başlık-silme girdisi öz-testin mevcut SINIR-2 kipidir ve regresyon kalemi oldu: düzeltilmiş sonda `OLCULEMEYEN` / çıkış 3; eski kuralı geri getiren kopya ve `main`'deki düzeltmesiz sonda aynı girdide kenar engelleme PASS / çıkış 0 (sayılar §1c "Negatif ayna"). Pozitif 403 (P-3, P-7, U-1) ve birleşik sahiplik belgesi (SA-9) girdileri mevcut öz-testin içindedir; yeni geniş prova başlatılmadı, gerçek API yinelemesi koşulmadı | SINIR-2, P-3, P-7, U-1, SA-9 |
| T0 | "Bu talimat canlı sonda GO'su değildir." | canlıya hiçbir istek atılmadı; canlı ayar, günlükleme ya da ürün değişikliği yok; owner bloğu çalıştırılmadı | — |

**AÇIK KALAN D-8 KARARLARI (iki kalem):**
1. **Canlı sonda kapsamı ve ad başına GO** — hangi adlar, hangi pencere, hangi istek profili (her istekte tek kullanımlık
   `x-request-id`; ret vektörlerinde API'nin kabul etmediği biçimde — §1). Telefon beyanının ad başına alınıp alınmayacağı bu GO ile
   **birlikte** netleşir. GO yok; kapsam kesinleşmedi; blok yalnız AD-1 için yazıldı ve çalıştırılmadı.
2. **Kesin kenar kabulünün yöntemi** — sonda kenar engellemesi için `PASS` üretmediğinden bir adın "dışarıdan kapalı" sayılması, sonda
   dışı bağımsız kanıt ve owner değerlendirmesi gerektirir. Yöntem önerisi ayrıca sunulur; owner karar verene kadar her adın kenar
   engelleme durumu — sonda koşsa da — "ölçülemeyen"dir ve D-8 o ad için kapanmış sayılmaz.

Bu iki kalem §3d'deki kararla **kapanmaz**: dar kabul istisnası canlı sonda GO'su ya da kenar kabulü değildir; yalnız 1. kalemin
kapsamına bir satır ekler (yerel kenar karşılaştırma isteği — ayrı izin kalemi).

### 3d. OWNER KARARI (2026-10-06) — dar kabul istisnası; kural sürümü R07

**Karar tarihi: 2026-10-06 · Kural sürümü: R07 · Yürürlük: R07 sonda baytlarıyla yapılacak koşumlar.** Bu karar §3c'deki aynı günlü
kararlardan **ayrı** kaydedilir: R06 kurallarının (§3c) üzerine gelen ayrı bir kuraldır ve **geçmiş koşuma geriye dönük uygulanmaz** —
2026-10-06 AD-1 koşumunun kanıtı ve `FAIL` kaydı (§1b) değişmez; o koşuma bu kuralla `PASS` verilmez. Kararın kaynağı owner'ın
2026-10-06'da CLIENT oturumuna verdiği yazılı talimattır ("D-8 A/B kararı ve dar uygulama"; owner aynı gün uygulama yetkisini ayrıca
yineledi): aşağıda tırnak içindeki cümleler o talimattaki owner cümleleridir, tırnaksız olanlar aynı talimatın özetidir. "Nasıl
uygulandı" sütunu uygulayıcının anlatımıdır (owner metni değildir).

**Sınıfın adı (tam olarak): "İzin verilen bozuk istek reddi — katman doğrulanmadı".**
**"Bu bir owner kabul kuralıdır; uygulamaya hiç ulaşılmadığının teknik kanıtı değildir."**
"Sağlayıcıda erken ret kanıtlandı" **yazılmaz**.

İncelenmiş hata yanıtının özellikleri (kuralın 2. koşulu bunlara bağlıdır). **Bu değerler owner metninde yoktur** — owner "incelenmiş
hata yanıtı özellikleriyle uyum" dedi; değerler 2026-10-06 teşhis ölçümünde incelenen yanıttan **uygulayıcı tarafından sabitlenmiştir**
(ölçüm kısıtlı kayıttadır): durum **400** · içerik türü `text/html` · gövde tam
**155 bayt**, SHA-256 `EFCA0895B4D88B27A94249F8E7AC0083EFF0A4FF3AC37C2841B3F6D7E11C1905` · uygulamanın kimlik başlığı **yok**.

| # | Karar (owner talimatı; tırnak içindekiler owner'ın cümleleri) | Bu revizyonda nasıl uygulandı | Öz-test |
|---|---|---|---|
| D1 | Yalnız mevcut kodlanmış boş baytlı GET vektörü için HTTP 400 yanıtına dar bir kabul istisnası. Sınıfın adı: "İzin verilen bozuk istek reddi — katman doğrulanmadı". "Bu bir owner kabul kuralıdır; uygulamaya hiç ulaşılmadığının teknik kanıtı değildir." | sondada tek tanım; uygulandığında yalnız o satır sınıfın tam adını taşır ve durum kodu ölçütünü tek başına `FAIL` yapmaz; satır 403 sayılmaz (sayılar ayrı); satırın gerçek HTTP kodu 400 olarak kalır ve HTTP / ret alanı `PASS` değil `OWNER-ISTISNASIYLA-UYGUN` olur (D8); ad ve cümle çıktıda, ham kanıtta ve adsız özette (§1.1) | MR-1, DOC-2 |
| D2 | Kapsam satır numarasıyla değil, değişmez vektör kimliği + yöntem + ham request-target tanımıyla sabitlenecek; liste sırası değişince istisna başka isteğe taşınamasın. | tanım: vektör kimliği `D8E2-BOS-BAYT-KODLU` (ret listesindeki "varyant boş bayt kodlu" vektörü) + `GET` + `/api/portal/cases%00/admin`; satır bu üçlüyle aranır; karar işlevinde sıra numarası yoktur; tanım tam bir vektörle eşleşmiyorsa istisna yoktur | MR-2, MR-7 |
| D3 | Koşullar (hepsi): (1) tam olarak tanımlı vektör ve HTTP 400; (2) incelenmiş hata yanıtı özellikleriyle uyum — "yalnız genel bir sağlayıcı başlığı yeterli değil"; (3) uygulama kimliği ya da başka olumlu uygulamaya ulaşma kanıtı bulunmaması; (4) aynı ham yol ve ad bağlamıyla yerel kenarda 403 gözlemi; (5) bu değerlendirmede kullanılan sayaç kanıtı varsa geçerlilik koşulları sağlanmış ve açıklanamayan artış bulunmaması. | beş koşul ayrı ayrı ölçülür / kaydedilir (§1.1 tablosu). (2): içerik türü + bayt sayısı + gövde SHA-256'sı birlikte (değerler owner metninde yoktur; teşhis ölçümünde incelenen yanıttan uygulayıcı sabitledi — yukarıda); özet ham değerle karşılaştırılır; `Server` başlığı karara girmez. (4): isteğe bağlı `--local-edge` girdisi — tek istek, yalnız `127.0.0.1`, "ad bağlamı" dış adın Host başlığı olarak uygulandı; ayrıca yerel 403'ün kimlik başlıksız olması aranır (**uygulayıcı sıkılaştırması**: kimlik başlıklı yerel 403 "çelişkili kanıt" sayılır). (5): sonda sayaç kanıtını **ölçmez**; owner beyanı (`--offprobe-evidence`) ve — beyan "kullanılacak" ise — istek atmayan kesinleştirme adımındaki sonuç (`--offprobe-result`) kaydedilir. Sayaç yönteminin ayrıntısı bu belgeye ve sondaya **yazılmaz** (kısıtlı kayıt) | MR-1, MR-3, MR-4, MR-5, MR-6 |
| D4 | "Olumlu uygulamaya ulaşma kanıtı istisnayı geçersiz kılar. Eksik veya çelişkili kanıt istisnaya kabul edilmez; mevcut FAIL / ÖLÇÜLEMEYEN kuralları uygulanır." | kimlik başlığı taşıyan yanıt (yeni kimlik · yansıma · yabancı kimlik) → istisna yok; beyan yok / sonuç yok / yerel gözlem yok / yanıt özellikleri tutmuyor → istisna yok; o satır R06 kuralıyla `FAIL`'dir. Tanınmayan girdi sessizce "yok" sayılmaz (kapı, çıkış 4) | MR-3 … MR-6, MR-9, GT-1 (14) |
| D5 | Bu sınıf: 2xx yanıtları kapsamaz · başka vektörlere uygulanmaz · kenar engelleme veya katman doğrulamasına PASS vermez · başka bulguyu kapatmaz · genel D-8 kabulü üretmez. | kenar engelleme ve katman doğrulaması alanları sınıfı **görmez**: sınıf uygulanan ve uygulanmayan aynı girdide iki alan birebir aynıdır; kanıt sınırı ve çıkış kodu eşlemesi değişmedi (ölçüm koşumu 0 üretmez). Sınıf HTTP / ret alanında da `PASS` üretmez (D8). 2026-10-06 koşumunun `FAIL` kaydı ve bulgu adayı değerlendirmesi **ayrıdır**: bu kural onlara dokunmaz ve hiçbirini kapatmaz; D-8 açık kalır | MR-2, MR-3, MR-8, GT-1 |
| D6 | Yeni kuralın karar tarihi (2026-10-06) ve sürümü (R07) ayrı kaydedilsin; geçmiş koşuma geriye dönük PASS verilmesin. 2026-10-06 koşum kaydı ve §1b AD-1 satırı aynen kalır. | bu bölüm ayrı kayıttır; kanıtta / özette / çıktıda kural sürümü `R07` yazılır. Kesinleştirme adımı yalnız R07 sonda baytlarının yazdığı kanıtı kabul eder (R06 kanıtı reddedilir). §1b AD-1 satırı ve belgenin başındaki koşum kaydı değişmedi (koşum kaydındaki parantez "pin §7 ile aynı" yerine "R06 pini — §7 önceki pinler" diye düzeltildi; sonuç değerleri aynen) | MR-9, DOC-2 |
| D7 | "Eklenen yerel karşılaştırma isteğini sonraki koşum paketinin istek sayısı ve izin kapsamına açıkça işle." | yerel karşılaştırmalı koşum: **dış 68 istek + 1 yerel kenar isteği = 69**; yerel istek **ayrı izin kalemidir** (§1a). İlk ölçüm bloğu yerel karşılaştırmayı **içermez**: o blokla yapılan koşumda yerel gözlem yoktur → istisna uygulanmaz (§1d). **R08:** yerel karşılaştırmalı blok **yazıldı** (§1d "R08"; yalnız AD-1) ve **ÇALIŞTIRILMADI**; yerel istek ve — kullanılırsa — sayaç okumaları **ayrı izin kalemleridir** (bütçe: 68 + 1 = 69; sayaçla 72, en çok 76) | MR-1, MR-4, DOC-2, B-Y1, DOC-3 |
| D8 | (owner'ın 2026-10-06 gece verdiği ek şart) "İstisna uygulanan HTTP 400 satırını 'HTTP/ret PASS' diye sunma. Gerçek HTTP kodu 400; sınıf 'İzin verilen bozuk istek reddi — katman doğrulanmadı' olarak ayrı görünmeli. Toplu politika uygunluğu hesaplanıyorsa bunun owner istisnasına dayandığı açık olmalı; 403 başarısı, kenar engelleme veya katman PASS'i üretmemeli." | sınıf uygulanan koşumda HTTP / ret alanı `PASS` **olmaz**: yalnız bu alan için ayrı değer `OWNER-ISTISNASIYLA-UYGUN` yazılır (anlamı: istisna dışındaki bütün ret vektörleri 403 + tam bir satır owner istisnası sınıfında; koşul: FAIL nedeni yok, ölçülemeyen nedeni yok, tam bir satır). Satırın `status` değeri 400, durum sınıfı `DORTYUZ-403-DISI` olarak kalır; sınıfın adı satırda ayrı alandadır; satır 403 sayısına girmez. Çıktı bu değerin owner kabul kuralına dayandığını ve 403 başarısı olmadığını yazar. Kenar engelleme, katman doğrulaması ve pozitif kontrol bu değeri almaz ve görmez (yalnız üç değer); çıkış kodu eşlemesi değişmedi. §1b satırına bu değer aynen yazılır (`PASS` yazılmaz). Owner blokları `D8-HTTP-RET` satırını ayrıştırmaz (değişiklik gerekmedi). Değerin **adı** uygulama seçimidir (owner metni değildir) | MR-10, MR-1, MR-6, MR-8, GT-1, DOC-1, DOC-2 |
| D9 | (owner talimatı, 2026-10-06 — R08) "R07 için eksik yerel karşılaştırmalı owner bloğunu hazırla. Kapsam önce yalnız AD-1: - 68 dış istek + 127.0.0.1 üzerinden tek yerel karşılaştırma. - Sayaç okumaları kullanılacaksa bunları 69 isteğe dahilmiş gibi gösterme; ek istek sayısını ayrıca belirt. - Yöntemleri, olası yan etkileri, zaman aşımını ve iptal davranışını açıkça yaz. 'Tamamı salt okuma, veri değişmez' iddiasında bulunma. - Ham kanıt özetini kesinleştirmeden önce kaydet; sonradan değişmiş kanıtı reddet. - Owner istisnası, HTTP 403 başarısı veya kenar/katman PASS'i olarak sunulmasın." · "Bloğu canlıya ulaşmayan test ikamesiyle doğrula. Gerekli pin ve belge güncellemelerini dar kapsamda yap." · "İstek bütçesini toplamıyla yaz: 68 dış + 1 yerel karşılaştırma + 3 sayaç = normalde 72; sayaç okumaları 7'ye çıkarsa en çok 76. Bunlar hazırlık bütçesidir, henüz canlı koşum izni değildir." · "Ham kanıt için beklenen SHA-256 değerini, kesinleştirme sırasında yeniden hesaplayıp 'beklenen' diye kullanma. Koşum sonunda ayrı kayda alınmış değerle karşılaştır. Kanıtla bu kayıt birlikte değiştirilirse bunun hangi güven sınırında kaldığını açıkça belirt." | §1d "R08": yerel karşılaştırmalı ölçüm bloğu + kesinleştirme bloğu (yalnız AD-1; mevcut iki blok durur). Bütçe tablosu (69; sayaç ayrı kalem: 72 / en çok 76 — blok sayaç okuması yapmaz). Yöntem sayıları, olası yan etkiler, zaman aşımı ve iptal davranışı koddan okunarak yazıldı; "tamamı salt okuma" denmedi. Ham kanıt özeti koşum sonunda ekrana ve kanıt dizininin dışındaki kayıt dosyasına yazılır; kesinleştirme `--evidence-sha256` (verilen kayıtlı değer) olmadan yapılmaz ve dosyanın özeti onunla aynı değilse reddeder; sonda "beklenen" değeri dosyadan türetmez. Güven sınırı §1 ve §1d'de açık cümleyle. Bloklar hüküm üretmez; `OWNER-ISTISNASIYLA-UYGUN` `PASS` / 403 başarısı diye sunulmaz. Bloklar iki kabukta, canlıya ulaşmayan test ikamesiyle doğrulandı; ikame kanıtlanmadan blok koşturulmaz. Dar kabul kuralı (D1–D8) **değişmedi** | MR-11, B-GY, B-GZ, B-Y1 … B-Y3, B-K1 … B-K3, DOC-3 |

**Bu karar şunları vermez:** canlı sonda GO'su · yerel kenara istek izni (ayrı izin kalemi) · kenar kabulü · D-8 kapanışı · başka ad için
kapsam. Canlıya ve yerel kenara bu revizyon (R07) ve R08 için hiçbir istek atılmadı; R08 blokları çalıştırılmadı.

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

`d8-staff-surface-probe.js` `04D0188320FADBC98F7A634F334E7065DF0110CBB58A9758B0DBE223A8B781AD` · `d8-selftest.js` `778AA5BDF578F369FBAE9448BF3851B1F241EC644DFC57CCE47D56EC4E94070F`.
Vektör kümesi kimliği (59 ret + 9 pozitif; vektörler R04 ile aynı): `83AD1AB6DF5E52FD4FD028C5C6A411CDD9D22BCAB53194ABD9915D47920FF0F2`.
(**R08** — 2026-10-06, owner talimatı §3d-D9: yerel karşılaştırmalı ölçüm bloğu + kesinleştirme bloğu (yalnız AD-1; ÇALIŞTIRILMADI) ·
kesinleştirmede kayıtlı ham kanıt özeti kapısı (`--evidence-sha256`; sonradan değişmiş kanıt reddedilir; güven sınırı §1d) · sondanın
revizyon adı R08, dar kabul kuralının sürümü R07 aynen · öz-test 141 kalem · **canlıda koşulmadı**. R07'den değişmeyenler: vektör listesi
ve vektör kümesi kimliği, dış istek profili, dört alanın kuralları, dar kabul kuralı, çıkış kodu eşlemesi. **Önceki pinler — R07:** sonda
`DE925B2AA89EA06DE0CED9EF15E269549AA596F7D9FA6BC7AEA8EE7761B5B51E` · öz-test
`66E389377404DE57B99173C6684B5FBCC5F73D6AEA70DCEB0DBD056FFCAF13A7` [125/125, 2026-10-06; `main` #2946 → `a19c4476`]. Aşağıdaki
parantez R07 notudur ve tarihsel olarak korunur.)
(**R07** — kural sürümü; owner kararı 2026-10-06, §3d: yalnız tanımlı tek vektör için dar kabul istisnası "İzin verilen bozuk istek
reddi — katman doğrulanmadı" — owner kabul kuralıdır, teknik kanıt değildir; uygulandığında HTTP / ret alanı `PASS` değil `OWNER-ISTISNASIYLA-UYGUN` olur; isteğe bağlı yerel kenar karşılaştırması (+1 istek) ve
sonda dışı ek kanıt beyanı; istek atmayan kesinleştirme adımı · öz-test 125 kalem · **canlıda koşulmadı**; geçmiş koşuma uygulanmaz.
R06'dan değişmeyenler: vektör listesi ve vektör kümesi kimliği, dış istek profili, kenar engelleme / katman doğrulaması / pozitif
kontrol kuralları, kanıt sınırı, çıkış kodu eşlemesi. **Önceki pinler — R06:** sonda `4A5176211DBD8FDB1523C78A49E87C7F1AEEA00B320EED1C6806A5A11F208B71` · öz-test
`389B84F2CFD44B6BF7E56BA352386242F02B217C74E5F16DDC793C31AE9CBFF1` [114/114, 2026-10-06; `main`
#2943 → `7cc31a3a`; **AD-1 canlı koşumu (2026-10-06) bu sonda baytlarıyla yapıldı** — §1b satırındaki kısa pin budur; R06'nın gerçek API
ile izole prova yinelemesi de bu baytlarladır]. Aşağıdaki parantez R06 notudur ve tarihsel olarak korunur.)
(R06, 2026-10-06, owner'ın 2026-10-06 kararlarıyla — §3c: kenar engelleme ve katman doğrulaması sondayla PASS üretmez (kanıt sınırı);
"API değil" çıkarımı kalktı; ölçüm koşumu çıkış 0 üretmez · pozitif kontrolde 403 istisnası yok · kapsam yetkisi kapısında birleşik
belge kabul edilir, içerik incelemesi beyanı zorunlu ve dosya bütünlüğünden ayrı · öz-test 114 kalem · gerçek API ile izole prova bu
sonda baytlarıyla dört kipte yinelendi (§1.1); canlıda koşulmadı. R05'ten
değişmeyenler: ad başına üç ayrı alan + pozitif kontrol · API'ye özgü kanıt = kabul edilmeyen biçimdeki istek kimliğinin yenisiyle
değiştirilmesi · çıkış 5 yok · vektör listesi ve vektör kümesi kimliği. Önceki pinler: R01 ilk `DD6448A5…` /
`E50EAE0C…`; birinci tur düzeltme `51B78C3B…` / `F9E9BD65…` [13/13]; ikinci tur `6400223…` / `A311CF00…` [15/15]; R27-R03 katman ipucu
`D5FA37D1…` / `AD7B0759…` [15/15, 2026-09-30]; R04 D8-E1/E2 `E150EEDA…` / `45FC0B5E…` [17/17, 2026-10-03]; R05 ilk baytlar
`DDC882FF…` / `65CA8A4F…` [66/66, 2026-10-05]; R05 düzeltme turu `5BBC86B4…` / `7249C7B1…` [86/86, 2026-10-05]; R05 üçüncü tur
`369A51DD…` / `D5131DF1…` [107/107, 2026-10-06; gerçek API ile izole provanın ilk koşusu bu sonda baytlarıyla yapıldı — §1.1]; R05
dördüncü tur `EE0C6998…` / `B19735A3…` [109/109, 2026-10-06; `main` #2942 → `c9f51af1`; gerçek API ile izole provanın yinelemesi bu
sonda baytlarıyla yapıldı; kenar engelleme PASS / çıkış 0 üretebiliyordu — R06 ile geçersiz].)

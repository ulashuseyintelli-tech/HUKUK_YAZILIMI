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
> **R03'te değişenler (2026-10-03):** dört PR ve PORTAL-RESET-FORM-01 (#2900, ayrı teslim yetkisi) birleştirildi (§9) · D-5 koşumunun ikinci takip kaydı (iki eksik beyan, bugünkü özet
> envanteri, açık beyan / çıkarım ayrımı) · A2 owner kararıyla ürün düzeltmesi (PORTAL-RESET-FORM-01, #2900) · "teşhis satırı yok →
> API'ye ulaşmadı" ifadesi düzeltildi (§3.1) · KR-6 canlı salt okuma sayımı yapıldı · D-6 / D-7 kapanış düzeltmeleri ve D-8 sonda kapsamı ayrı PR'larda
> (#2904, #2905, #2906; §4, §5) · H6/H8 yayın adayına karşı yeniden değerlendirildi, H1/H2/H4/H5/H7 kararları günlük
> dille (§7) · karar listesi güncellendi (§11). Owner'ın 2026-10-03 karar tablosu koordinasyon kaydındadır; bu belge onu yalnız
> CLIENT kalemleri için anar.
>
> **R03-b (2026-10-04):** owner'ın 2026-10-03 talimatıyla ("CLIENT PR'larını birleştir, kalan işleri takip et"; bu sayfada owner'ın kendi
> teyidi) D-6 / D-7'nin kapanış ve Recover metinleri ölçülene bağlandı (R03-c … R03-g; §4.4) ve #2904, #2905, #2906 birleştirildi (§9) ·
> KR-4 seçenekleri mevcut adaya etkisiyle owner'a sunuldu (§11; ayrıntı kısıtlı kayıtta). Canlı yayın, migration, Run / Recover ya da
> gönderim yapılmadı.
>
> **R05 (2026-10-06):** D-8 hazırlığı owner'ın 2026-10-05 kararlarıyla güncellendi — ad başına üç ayrı alan + pozitif kontrol, API'ye özgü kanıt kuralı, diğer adlar için kapsam yetkisi kapısı (§2 D-8 satırı, §5, §11 KR-9); canlı sonda yapılmadı. Dördüncü tur (2026-10-06): pozitif kontrolde tek kural · kapının eksik kalemi adlandırması · katman doğrulamasında desteksiz kesinlik yok · gerçek API ile izole provanın ilk koşusu paket belgesine işlendi (§5).
>
> **R06 (2026-10-06; owner'ın 2026-10-06 kararları — takip PR'ı, canlıya uygulanmadı):** gerçek API ile izole prova, kenar yalnız API'nin 403 yanıtından kimlik başlığını silerse R05 sondasının "kenar engelleme PASS · çıkış 0" verdiğini ölçmüştü; owner bu sonucu kabul etmedi. D-8 hazırlığı buna göre düzeltildi: **kenar engelleme sondayla PASS üretmez** (bağımsız kanıt yoksa ÖLÇÜLEMEYEN; API'ye ulaşma kanıtı FAIL olarak korunur; "API değil" çıkarımı kalktı; ölçüm koşumu çıkış 0 üretmez) · pozitif kontrolde **403 dahil** beklenmeyen her yanıt FAIL (ölçüt ihlali / bulgu adayı) · kapsam yetkisi kapısında birleşik belge kabul edilir, içerik incelemesi beyanı zorunlu ve dosya bütünlüğünden ayrı kaydedilir (§2 D-8 satırı, §5, §11 KR-9). Kesin kenar kabulü sonda dışı bağımsız kanıt ve owner değerlendirmesi gerektirir (yöntem önerisi ayrıca sunulur). Düzeltme gerçek API ile izole provada R06 sonda baytlarıyla dört kipte yinelendi (§5 R06 maddeleri). Canlı sonda yapılmadı; bu talimat canlı sonda GO'su değildir.
>
> **R07 (2026-10-06; owner talimatları "CLIENT D-8 takibi ve kalan işler" ve "D-8 birincil ad koşumu" — canlı ayar, yayın, migration yok):** #2943 (`7cc31a3a`) tamamlanmış **hazırlık** teslimidir. **AD-1 için canlı sonda owner onayıyla 2026-10-06'da BİR KEZ koşuldu:** HTTP / ret sonucu **FAIL** · kenar engelleme sonucu **FAIL** · katman doğrulaması **ÖLÇÜLEMEYEN** · pozitif kontrol **PASS** — ölçüt ihlali / bulgu adayı; nedeni ayrı değerlendirilecek; ayrıntı kısıtlı kayıtta (public satır: D-8 paket belgesi §1b). **D-8 kapanmadı**; bu sonuç "dışarıdan kapalı" hükmü ya da CLIENT genel kabulü değildir; ikinci koşum yeni onay ister. Sonda dışı yöntem owner kararıyla **sınırlı ek kanıttır**: yalnız kapsadığı 42 ret satırı için geçerlidir; artış tek başına ulaşma kanıtı, artış olmaması da ad için "kapalı" hükmü değildir; kapsanmayan 17 ret satırı ÖLÇÜLEMEYEN kalır; telefon beyanı bu boşluğun yerine konmaz (yöntem ayrıntısı ve koşumdaki sonucu kısıtlı kayıtta). Diğer ad, sağlayıcı hesabı kaydı incelenmeden ve ayrı kapsam GO'su alınmadan koşulmaz. Yeni kısıtlı kayıt: SEC-API-METRICS-01 (§8). **Bu kayıtta açık tutulan işler ve gerçek ön koşulları:** (1) A adayının son doğrulaması ve ayrı yayın kararı — yayın yürütücüsünde (yayın 2026-10-05'te ertelendi); (2) başarılı yayın ve canlı kimlik doğrulamasından sonra pin güncellemesi (D-5 / D-6 / D-7 blokları); (3) yeni D-5 — yayına ve pin güncellemesine bağlı; (4) D-6 ve D-7 — **A yayınına bağlı değildir**: blokları bugünkü canlı sürüme pinlidir, her biri kendi GO'sunu ve §2'deki kararlarını ister; yayın önce olursa pin güncellemesi gerekir; (5) D-8 — yayına bağlı değildir (blok canlı sürüm pini taşımaz); AD-1'deki ölçüt ihlalinin değerlendirilmesi, ad başına ölçüm ve yukarıdaki kanıt sınırları; (6) birleşik D-9 — D-5, D-6, D-7 koşumlarına bağlı; (7) H1–H8 ölçüm ve owner beyanları (0/8); (8) portal e-posta benzersizlik / migration paketi (yerel dal; owner kararları bekliyor) ve §8'deki açık güvenlik kayıtları. D-5 `00c96bd5` koşumunun tarihsel sonuçları aynen korunur: ölçülmüş PASS'ler yerinde kalır; ölçülemeyen kısımlar ve kabul yokluğu yeni kanıtla geriye dönük kapatılmaz; geçmiş koşuma PASS ya da eksik owner beyanı üretilmez. `main`'deki değişiklikler canlıya çıkmış sayılmaz (`main`, canlı sürümün kaynağından 217 commit ve 6 migration ileridedir — ölçüm 2026-10-06).
>
> **D-8 AD-1 ikinci canlı koşum (2026-10-08; owner onayıyla, tek koşum; R09 sonda baytları — canlı ayar değişikliği ajan tarafından yapılmadı, yayın ve migration yok):** HTTP / ret sonucu `OWNER-ISTISNASIYLA-UYGUN` (**PASS değildir**; dar owner kabul sınıfı kesinleştirme adımında uygulandı) · kenar engelleme sonucu **ÖLÇÜLEMEYEN** · katman doğrulaması **ÖLÇÜLEMEYEN** · pozitif kontrol **PASS**. Sonda 68 dış + 1 yerel kenar = 69 istek attı; sonda dışı ek kanıt için 3 yerel okuma yapıldı (toplam 72); toplam süre sınırı ve iptal devreye girmedi. Sonda dışı ek kanıt geçerlilik koşullarını sağladı ve açıklanamayan artış göstermedi — **yalnız kapsadığı 42 ret satırı için**; kapsanmayan 17 ret satırı ÖLÇÜLEMEYEN kalır. **Owner kararı (2026-10-08): bu koşum ölçüm teslimidir; kesin kenar kabulü ve D-8 genel kapanışı verilmedi**; 17 satırın ve katmanın belirsizliği açık kalır; 2026-10-06 koşumunun FAIL kaydı (FAIL · FAIL · ÖLÇÜLEMEYEN · PASS) değişmez ve o koşumun bulgu adayı değerlendirmesi ayrıdır. Koşumdan önce owner sağlayıcı tarafında bölge düzeyinde bir ayarı kapattı ve kapalı kalmasına karar verdi (ayrıntı kısıtlı kayıtta). Kayıt: D-8 paket belgesi §3e (ham kanıt dosyasının adı ve SHA-256'sı orada; ham kanıt, ad ve yol ayrıntısı depoya konmaz). **Açık kalanlar:** kesin kenar kabulünün yöntemi (owner kararı) · diğer yayın adı (kapsam yetkisi kaydı) · telefon beyanı · D-6 / D-7 canlı kabulleri (ayrı GO; D-8'e bağlı değil) · D-5 (yayına bağlı) · birleşik D-9 · H1–H8.
>
> **D-8 sonda kural sürümü R07 (owner kararı 2026-10-06; hazırlık — canlıya uygulanmadı, canlı sonda GO'su değildir):** D-8 sondasına dar bir kabul istisnası eklendi — sınıfın adı "İzin verilen bozuk istek reddi — katman doğrulanmadı". **Bu bir owner kabul kuralıdır; uygulamaya hiç ulaşılmadığının teknik kanıtı değildir.** Yalnız mevcut kodlanmış boş baytlı GET vektörüne ve yalnız beş koşulun hepsi tutuyorsa uygulanır (HTTP 400 · incelenmiş yanıt özellikleri · uygulamaya ulaşma kanıtı yok · yerel kenarda 403 · sonda dışı ek kanıt kullanılıyorsa geçerli ve açıklanamayan artış yok); 2xx yanıtları kapsamaz, başka vektöre uygulanmaz, kenar engelleme ve katman doğrulamasına PASS vermez, başka bir bulguyu kapatmaz, genel D-8 kabulü üretmez. İstisna uygulanan koşum "HTTP / ret PASS" diye sunulmaz (owner şartı): o alan ayrı değer `OWNER-ISTISNASIYLA-UYGUN` alır, satırın gerçek HTTP kodu 400 olarak kalır; bu değer 403 başarısı değildir. **Geçmiş koşuma geriye dönük uygulanmaz:** yukarıdaki 2026-10-06 AD-1 sonucu (FAIL · FAIL · ÖLÇÜLEMEYEN · PASS) aynen kalır ve D-8 açık kalır. Sonraki koşumda yerel kenar karşılaştırması istenirse istek sayısı dış 68 + yerel 1 olur; yerel istek ayrı izin kalemidir ve mevcut owner bloğu onu içermez (o blokla istisna uygulanmaz). Sonda pini değişti: güncel pin D-8 paket belgesi §7'dedir; bu belgede geçen `4A517621…8B71` R06 pinidir (2026-10-06 koşumunun pini). Ayrıntı: D-8 paket belgesi §1.1, §1a, §1d, §3d. **R08 (2026-10-06; hazırlık):** yerel karşılaştırmalı owner bloğu (yalnız AD-1; bütçe 68 dış + 1 yerel = 69, sayaç okumaları ayrı kalem: 72 / en çok 76) ve kesinleştirmede kayıtlı ham kanıt özeti kapısı hazır; bloklar canlıda koşulmadı, canlı koşum izni değildir; D-8 açık. **R09 (2026-10-07; hazırlık):** sondaya çalıştırıcıdan bağımsız toplam süre sınırı (owner bloklarında 5 dakika — sondanın sınırı; iş akışının bütününün süresi değildir) ve iptal dosyası eklendi; ikisi de ölçüm çağrısında zorunludur (vermeyen eski çağrı koşmaz), kesilen koşum eksiktir ve hüküm üretmez (çıkış 6; kesinti kaydındaki sayılar istemci sayılarıdır); bloklar canlıda koşulmadı, canlı koşum izni değildir; D-8 açık.
>
> Kaynak ayrımı: **[Ö]** bu çalışmanın kendi ölçümü (salt okuma ya da izole test) · **[B]** mevcut kayıt belgesinin iddiası
> (yeniden ölçülmedi) · **[K]** yayın koordinatörünün ölçümü (aday doğrulama kaydı; depoda değil) · **[O]** owner beyanı (makine
> ölçümü değildir).

## 1. Kimlikler — `main` ile canlı ayrı tutulur

| Konu | Değer | Kaynak |
|---|---|---|
| Canlı ürün | **R27** — kaynak `1b758d29`, API dist `E28A6863…5134`, WEB `B2DEE365…F621` / `W2UQpBPD…`; migration 0 | [B] `record/R27-LIVE-RECORD-R01.md` §1 |
| `main` | R03 tabanı `5477a073` (#2885 dahil). **main ≠ canlı**: `1b758d29` `main`'in atası değildir; `main` canlı adaydan 170'ten fazla commit ve 5 migration ileridedir (`main` sık ilerler) | [Ö] git |
| Canlı veritabanı kodlaması | **UTF8** — salt okunur `SHOW server_encoding`, 2026-10-02 20:39Z (owner talimatı CLIENT-HAZIRLIK-KAPANISI-R02 madde 3: "bu okuma yetkilidir"; o tarihte yapılan tek canlı okuma); çıktı yerel kanıt dizinindedir (depoya alınmadı). #2884'ün tek ortam ön koşulu karşılanıyor | [Ö] |
| Yayın B0/B1/B2 · D-1…D-4 kabulleri · D-5 koşumu | Tamamlandı / koşuldu; **tekrarlanmadı, yeniden çalıştırılmadı** | [B] |
| Ağ azaltım kuralı (8080 engeli) ve geri dönüş yedekleri | **Korunur**; bu çalışma dokunmadı | [B] |
| Yayın adayı çalışması | Taslak PR #2895 (taban `release/r27-candidate` = `1b758d29`); **tek yazarı yayın koordinatörüdür**. CLIENT yalnız düzeltme ve kanıt teslim eder: #2884 adaya `f69783af` olarak alındı (manifest çakışması yalnız #2884'ün satırlarıyla çözüldü; saf testleri aday üstünde 116/116 [K]). Adayın birleştirilmesi ve canlı yayın için owner GO'su **yok** | [K] |
| Canlı portal hesapları (KR-6 sayımı) | 2026-10-03, salt okunur, yalnız toplu sayı (owner talimatı CLIENT-MERGE-YAYIN-HAZIRLIK-VE-KABUL-TAMAMLAMA-R04 madde 4; owner'ın bu sayfadaki teyidi): bugün etkilenen **aktif hesap 0** (ölçüm aracı kör değil). Veri düzeltme yetkisi değildir | [Ö] |

## 2. D halkaları — tek tablo

Kabul ölçütlerinin kanonik tanımı `client-external-access-r01` §7'dir; paket ölçütleri ilgili paket belgesindedir.

| Halka | Mevcut kabul | Eksik kanıt | Hazırlık durumu | Bağımlılık | Sonraki işlem | Gerekli owner kararı |
|---|---|---|---|---|---|---|
| **D-1** intake bağlantısı dış cihazdan açılır | **Kabul — dar (intake)**: runId `cff5c692` 22/22 [B]; cihaz/ağ [O] | yok | tamam | — | yok; kapsam genişletilmez | — |
| **D-2** form sentetik veriyle gönderilir | **Kabul — dar (intake)**: `cff5c692` [B] | yok | tamam | — | yok | — |
| **D-3** doğru büro/dosya/statü | **Kabul — dar (intake)**: `cff5c692` [B] | yok | tamam | — | yok | — |
| **D-4** portal girişi dış cihazdan | **Kabul — dar**: runId `e34b7e6d` 21/21 [B]; telefon [O] | yok | tamam | — | yok; Run/Recover tekrarlanmaz | — |
| **D-5** portal parola sıfırlama uçtan uca | **Kabul yok.** runId `00c96bd5`: çıkış 3 · 21 PASS / 0 FAIL / 8 ÖLÇÜLEMEYEN [Ö]; "e-posta gelmedi" [O] | (a) uçtan uca sıfırlama hiç ölçülmedi (8 ölçüt) · (b) kök neden **kanıtlanmadı** · (c) bu koşumun kanıt paketi manifestsiz — **tamamlanamaz** (§3.2) | teşhis: UNKNOWN düzeyinde tamam · API yaması #2884: `main`'de (`be08dbe9`) ve adayda · web yaması #2900: `main`'de (`8b9a9989`) · aday doğrulaması: koordinatörde · yayın: **GO yok** | doğrulanmış aday (API + web) → onaylı yayın → pin güncellemesi → yeni D-5 GO'su | §3.3 sırası | yayın GO'su · yeni D-5 GO'su · alıcı adresi · tek gönderim onayı |
| **D-6** belge yükleme/indirme/silme | **Kabul yok** — canlı koşum yok · bugünkü R27 ile pin ve kaynak uyumlu (2026-10-06 salt okuma karşılaştırması); güncel Preflight ve ayrı koşum GO'su bekliyor | canlı Run + owner beyanı (D6-*, P6-C*) | blok R02 `main`'de (#2880 → `6744abff`) · kapanış düzeltmesi R03 … R03-g `main`'de (**#2904** → `039f4137`; koşucu öz-testi 102/102 R03-g baytlarında; son commit yalnız bloğun onay metnini değiştirdi ve blok öz-testi son baytlarda 83/83 iki kabukta — koşucu öz-testi bu commit'ten sonra yeniden koşulmadı; R03-g bağımsız doğrulamasında blocker/major yok; §4.4) · dar hazırlık R04 … **R04-c** `main`'de (**#2923** → `f1b9f772`; **güncel baytlar bunlardır** — pinler ve öz-test sayıları D-6 paket belgesi §6 / §13.9) | ayrı GO · dış zincir · canlı dist pini (yayından önce ya da pin güncellemesinden sonra) | Preflight → QrTest → Run | D-6 GO · telefon yüklemesi · kalıcı izlerin kabulü · kalıntıda sıra · OK-5 / OK-6 · ~~makbuz kurtarma dosyasının yazarı ve yeri~~ — karar ve uygulama kapandı (owner kararı 2026-10-04, R04: makbuzu blok, ayrı Recover onayından sonra Run kanıtından kanıt dizininin dışına yazar ve Recover'dan önce doğrular); **canlı Recover'da doğrulanmadı** (§4.4) |
| **D-7** mesaj gönderme/okuma | **Kabul yok** — canlı koşum yok · bugünkü R27 ile pin ve kaynak uyumlu (2026-10-06 salt okuma karşılaştırması); güncel Preflight ve ayrı koşum GO'su bekliyor | canlı Run + owner beyanı (D7-*, P7-C*) | blok R02 `main`'de (#2882 → `0e04f4a6`) · kapanış düzeltmesi R03 … R03-g `main`'de (**#2905** → `95a35711`; öz-test 86/86, blok öz-testi 75/75 iki kabukta; son bağımsız doğrulamada blocker/major yok; §4.4) · dar hazırlık R04 … **R04-c** `main`'de (**#2923** → `f1b9f772`; pinler ve öz-test sayıları D-7 paket belgesi §14.9) · **R05 kapsam ihlalinde dur** (owner kararı 2026-10-08; koşucu + sahte API + koşucu öz-testi + bloktaki pin: kapsam dışı üç ölçütten biri FAIL / ÖLÇÜLEMEYEN ise kalan adımlar ve gösterim yok, kapanış çalışır; koşucu öz-testi 98/98, blok öz-testi 88/88 iki kabukta; **güncel baytlar R05'tir** — D-7 paket belgesi §7 / §15) | ayrı GO · dış zincir · canlı dist pini · SEC-PORTAL-ADMIN-MSG-01 açık (engel değil) | Preflight → QrTest → Run | D-7 GO · kalan mesaj/bildirim satırları "saklandı" · kapsam dışı dosya referansında 400'ün ölçüt sayılması · Recover kuralı · K-8 (Run kapanışında tek yeniden giriş) · ~~makbuz kurtarma dosyasının yazarı ve yeri~~ — karar ve uygulama kapandı (owner kararı 2026-10-04, R04; D-6 ile aynı ilke); **canlı Recover'da doğrulanmadı** · ~~makbuzsuz yarım kurulum~~ — owner kararı 2026-10-08: yama yok; makbuz yoksa dur, koşum kimliğiyle salt okuma döküm, somut liste üzerinden karar (D-7 paket belgesi §10 K-7) |
| **D-8** personel yüzeyi dışarıdan kapalı | **Kısmi**: yalnız 2026-09-27 telefon beyanı, 5 GET 403 [O]; R27 öncesi; bir ada bağlanmadı | AD-1 (birincil ad) için canlı sonda 2026-10-06'da bir kez koşuldu: HTTP / ret **FAIL** · kenar engelleme **FAIL** · katman doğrulaması **ÖLÇÜLEMEYEN** · pozitif kontrol **PASS** — ölçüt ihlali / bulgu adayı, nedeni ayrı değerlendirilecek (ayrıntı kısıtlı kayıtta); **2026-10-08'de R09 sonda baytlarıyla ikinci koşum (owner onayı; tek koşum): HTTP / ret `OWNER-ISTISNASIYLA-UYGUN` (PASS değil; owner kabul kuralı) · kenar engelleme **ÖLÇÜLEMEYEN** · katman doğrulaması **ÖLÇÜLEMEYEN** · pozitif kontrol **PASS** — owner ölçüm teslimi olarak kabul etti; kesin kenar kabulü ve D-8 kapanışı YOK (D-8 paket belgesi §3e)**; diğer yayın adları **KOŞULMADI — kapsam yetkisi doğrulanmadı**; telefon beyanı R27 sonrası yinelenmedi; **sonda koşsa da kenar engellemesi için kabul kanıtı üretmez** (aşağıda) | sonda **R06** (owner kararları 2026-10-05 ve 2026-10-06; R05 `main`'dedir: **#2942** → `c9f51af1`; R04 tabanı #2906): ad başına koşum (zorunlu ad kimliği) · ad düzeyinde **üç ayrı alan + pozitif kontrol** — HTTP / ret sonucu · kenar engelleme sonucu · katman doğrulaması; her biri yalnız PASS / FAIL / ÖLÇÜLEMEYEN; birleşik PASS yok · **kanıt sınırı (R06): kenar engelleme ve katman doğrulaması sondayla PASS üretmez** — sondada isteğin API'ye ulaşmadığını gösteren bağımsız kanıt yoktur (başlığın bulunmaması bunu kanıtlamaz); FAIL yoksa alan ÖLÇÜLEMEYEN'dir ve **ölçüm koşumu çıkış 0 üretmez** (sağlıklı koşum çıkış 3) · API'ye özgü kanıt (API'nin kabul etmediği biçimdeki istek kimliğini atıp yenisini üretmesi) yalnız "ulaştı"yı gösterir → FAIL · **pozitif kontrolde 403 dahil** beklenmeyen her doğrulanmış yanıt FAIL (ölçüt ihlali / bulgu adayı) · birincil ad dışındaki adlar için kapsam yetkisi kapısı (birleşik belge kabul edilir; içerik incelemesi beyanı zorunlu ve dosya bütünlüğünden ayrı) · ad içermeyen özet (kısıtlı); 68 istek (vektörler R04 ile aynı), pin `4A517621…8B71`; öz-test 114 kalem (owner blokları iki kabukta); gerçek API ile izole prova **R05 baytlarıyla** yapıldı (sonuç paket belgesi §1.1'de — o prova başlığı silinen API reddinde R05 sondasının kenar engelleme PASS / çıkış 0 verdiğini ölçtü; R06 bunu düzeltir) — **R06 baytlarıyla gerçek API yinelemesi koşulmadı**; canlı istek yok (§5) | ad başına ayrı GO · dış zincir · diğer adlar için kapsam yetkisi kaydı (yetkili sağlayıcı hesabındaki bölge / özel ad kaydı + DNS zinciri + içerik incelemesi beyanı) · **kesin kenar kabulü için sonda dışı bağımsız kanıt** (yöntem önerisi ayrıca sunulur) | kapsam + ad başına GO → kapsamdaki adların koşumu + telefon beyanı → alan değerlerinin ad başına satıra yazılması (kenar engelleme hücresi FAIL ya da ÖLÇÜLEMEYEN olur; ÖLÇÜLEMEYEN kapanış değildir) → kesin kenar kabulünün ayrı kanıtla owner değerlendirmesi | **açık kalan iki D-8 kararı:** (1) canlı sonda kapsamı ve ad başına GO (telefon beyanının ad başına olup olmadığı onunla birlikte netleşir); (2) kesin kenar kabulünün yöntemi — sonda dışı bağımsız kanıt ve owner değerlendirmesi. Diğer D-8 kararları 2026-10-05 ve 2026-10-06'da verildi (§5 R05 / R06, §11 KR-9) |
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
| 2c Dev token kaybı (F1) | şifre sıfırla sayfalarının geliştirme ortamındaki token kaybı; üretim davranışı korunur | **`main`'de** `7ae481e3` (#2902; main CI yeşil); güvenlik adayına eklenmez | — |
| 3 Aday | #2884 + #2900 + gerekli giriş formu bağımlılıkları (#2894'ün aday parçası) yayın adayına; #2825 sırası korunur | **koordinatörde** (adayın tek yazarı); birleşik aday doğrulaması sürüyor | yayın GO'su ayrı karar |
| 3b Ön koşul | canlı veritabanı kodlaması UTF8 | **ölçüldü** (§1) | — |
| 4 Yayın | canlı API ve WEB dist değişir; `.env` ve şema değişmez (CLIENT kalemleri için migration 0) | **GO yok** | yayın GO'su |
| 5 Pin güncellemesi | owner bloklarının canlı dist pinleri yeni değere çekilir (D-5 / D-6 / D-7). **D-8 canlı dist pini taşımaz:** D-8 bloğu yalnız sondanın kendi SHA-256'sını pinler ve canlı dist'e bakmaz; yayınla değişmez (D-8 pini yalnız sonda değişince güncellenir — §5). Değerleri (aday SHA, derleme özetleri, dosya listesi) koordinatör verir; D-5 paket ve pin dosyalarının tek yazarı CLIENT'tir | aday kesinleşince | birleştirme yetkisi |
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

Not: #2880 ve #2882 birleştirildi; `main`'deki blok öz-test sayıları D-6 için 73/73, D-7 için 64/64'tür (R27 paket belgesindeki satırlar R03'te güncellendi; D-7'nin yeni sayısı D-6'nın eski sayısıyla aynıdır, karıştırılmaz).

### 4.2 Run ve normal kapanış

- Sıra: Preflight (salt okuma) → QrTest (canlı veri yok) → Run (ayrı GO; tek koşum). D-6 ve D-7 **aynı anda koşamaz**. **Ardışıktır (owner talimatı 2026-10-06):** bir koşumun kapanışı ya da gerekli Recover tamamlanmadan diğer koşuma ya da yayına geçilmez.
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
| Personel oturumu kapanışta geçersizleşirse | **kusur gerçek**: Run kapanışı oturum yenilemiyor, yetkili uç reddederse portal açık kalıyor (çıkış 6). Düzeltme: 401/403'te aynı sentetik personelle **bir** kez yeniden giriş + tek yeniden deneme. Canlıya ek etkisi kaynaktan okundu (giriş uç noktası veritabanına yazmaz; bellekteki giriş hız sınırı sayacı +1); canlıda ölçülmedi | D-6: **#2904** · D-7: **#2905** |
| D-7'de makbuz yazılmadan yarım kalan kurulum | **kusur gerçek**: eski koşucuda ek yazma hata verince 9/9 sentetik kullanıcı aktif, dosyalar açık kalıyordu (izole senaryoda ölçüldü). Düzeltme: makbuz kurulumdan hemen sonra yazılır, ek kimlikler eklendikçe güncellenir; kanıtta kurulum durumu alanı (yarım kurulum bulunur). Makbuz dosyası yazılamaz, okunamaz ya da bayatsa artık uygulanamayan Recover komutu önerilmez (R03-c / R03-d; aşağıdaki satır) | D-7: **#2905** (`main`'de) |
| D-6 depolama erişim hatası ile doğrulanmış kalıntının ayrılması | **kusur gerçek**: erişim hatası doğrulanmış kalıntıyı gizleyebiliyor ya da FAIL'e çevrilebiliyordu. Düzeltme: doğrulanmış kalıntı FAIL, erişim hatası ÖLÇÜLEMEYEN + ayrı neden; kanıtta ayrı `durum` alanı; blok Run satırı da ikisini ayırır. Kapanış bağlamında ikisi de çıkış 6 verir — ayrı çıkış kodu istenip istenmediği **OK-5 owner kararı** | D-6: **#2904** |
| Kapanış metninin yalnız ölçüleni söylemesi | **kusur gerçek**: kanıttaki bazı kurtarma / kapanış metinleri ölçülmemiş şeyi iddia ediyor, ikinci Recover'a yol tarif ediyor, kapatma hiç yapılmadığında açık hesaptaki oturumu "ürün bulgusu — Recover düzeltemez" diye yazıyordu; D-7 bloğunun kapanış satırı sabit "DOĞRULANDI" idi. Düzeltildi (R03 / R03-b): ürün bulgusu yalnız DB kapanışı ölçülmüşken; portal açık satırı bağımsız; kapanış satırı kanıttaki verdict'lerden | D-6: **#2904** · D-7: **#2905** (`main`'de) |
| Kapanış / Recover doğruluğu (owner talimatı 2026-10-03; R03-c … R03-g) | **kusurlar gerçek ve giderildi** (beş tur, her biri bağımsız doğrulamalı; son turda blocker/major yok): Recover bitiş satırı her kodda "mevcut oturum reddi Recover'da ÖLÇÜLEMEZ" der, kod açıklamaları yalnız okunabilir kanıt varken yazılır (kanıtsız çıkışta "KAPANIŞ DOĞRULANMADI — kanıt yok") · makbuz dosyası yoksa / okunamıyorsa / bayatsa `-ReceiptFile <makbuz>` önerilmez; kanıttaki makbuz metninden iki kabukta ölçülmüş tek komut verilir, kanıtta da yoksa somut engel yazılır · koşucunun eski portal oturumunun 200'ü ürün kaynağına dayanan tek karar tablosuyla sınıflanır ("ürün bulgusu değil" yalnız hesap aktif ve sürüm aynıyken) · "kapatıldı", "kapatma YAPILMADI", "Recover kapatabilir" / "kapatamadı" gibi ifadeler yalnız ölçülen kapatma çağrısı ve DB değerleriyle yazılır. Açık: makbuz kurtarma dosyasını kimin, nereye yazacağı (owner kararı); canlıda hiçbiri koşulmadı | D-6: **#2904** → `039f4137` · D-7: **#2905** → `95a35711` |

Pinler: koşucular değiştiği için blokların pin listesi, paket digest'leri, blok ve blok öz-testi özetleri birlikte değişti (blok öz-testi
iki kabukta yeşil). Son değerler paket belgelerindedir (D-6 §6, D-7 §7) ve PR #2904 / #2905 açıklamalarında.

## 5. D-8 sondası — istek kapsamı, yan etkiler, kapsam boşluklarının kabule etkisi (**çalıştırılmadı**)

> **R06 (owner kararları 2026-10-05 ve 2026-10-06; canlıya uygulanmadı, canlı istek yok) — güncel tanım.** Owner talimatı (2026-10-05):
> "D-8 hazırlığında birincil adı ve sahipliği doğrulanmış diğer yayın adlarını ayrı satırlarda göster. Bir adın sonucu diğerine
> taşınmasın; ret sonucu ile reddeden katmanın kimliği ayrı değerlendirilsin. Canlı sonda kapsamı ve GO'su ayrıca kesinleşecek." Aynı
> gün owner bekleyen D-8 kararlarını verdi; 2026-10-06'da, gerçek API ile izole provanın sonucu üzerine, dört karar daha verdi (açık
> metinleri paket belgesi §3b ve §3c'de). Sonda **ad başına** koşar (zorunlu ad kimliği; bir süreç = bir ad = bir kanıt) ve ad düzeyinde
> **üç ayrı alan + pozitif kontrol** üretir; her biri yalnız PASS / FAIL / ÖLÇÜLEMEYEN alır ve hiçbiri diğerinin yerine geçmez —
> birleşik tek "PASS" ya da "D-8 PASS" yoktur:
> - **HTTP / ret sonucu** (yalnız durum kodu ölçütü): bütün ret vektörleri 403 → PASS · bir ret vektörüne doğrulanmış başka bir HTTP
>   yanıtı (hangi kod olursa olsun) → FAIL · yanıt alınamayan ret vektörü → ÖLÇÜLEMEYEN. Bu ikisi tek etikette birleşmez. PASS yalnız
>   "ret vektörleri 403 aldı" demektir; kenar engellemesi demek değildir.
> - **Kenar engelleme sonucu — sondayla PASS üretilmez (R06; kanıt sınırı):** sondanın elindeki tek katman kanıtı API'nin yeni kimlik
>   üretmesidir ve o yalnız isteğin API'ye **ulaştığını** gösterir. Ulaşma kanıtı varsa FAIL — API'nin o isteğe 403 vermesi bunu
>   kapatmaz; ret vektörü hiç reddedilmediyse (2xx) FAIL. FAIL yoksa alan **her koşumda ÖLÇÜLEMEYEN**'dir: isteğin API'ye
>   ulaşmadığını gösteren bağımsız kanıt sondada yoktur (başlığın bulunmaması bunu kanıtlamaz; pozitif yolların kalibrasyonu ret
>   yollarında başlığın korunacağını kanıtlamaz). Sağlıklı koşumun neden sınıfı "bağımsız kanıt yok"tur; kalibrasyon eksik / geçersizse,
>   yanıt sınama (challenge) ya da tanınmayan azaltım işareti taşıyorsa, pozitifler beklendiği gibi değilse ya da yanıtsız vektör varsa
>   ayrı neden sınıfı yazılır. Kalibrasyon eksikliği somut olumsuz kanıtı silmez. Sağlıklı kenar ile başlığı silinmiş API reddi ayırt
>   edilemediğinden ikisine de PASS verilmez.
> - **Katman doğrulaması — PASS üretilmez:** kanıtın desteklemediği katman kesinliği reddedilir. "API değil" çıkarımı **kalktı** (başlık
>   yokluğu satır düzeyinde de kanıt değildir): kapsam sayısıyla ÖLÇÜLEMEYEN; API'nin yanıtladığı kanıtlı ret satırı varsa **ve**
>   koşumun kendi kalibrasyonu API'nin "kabul edilmeyen biçim → yeni kimlik" davranışını en az bir kez gösterdiyse FAIL. Kalibrasyon o
>   davranışı hiç göstermediyse aynı gözlem kenar engellemede FAIL kalır ama katman doğrulaması ÖLÇÜLEMEYEN'dir. Kenar / tünel /
>   sağlayıcı adlandırılmaz.
> - **Pozitif kontrol:** API'ye geçmesine izin verilen yollar ayrı kayıttır. Tek kural (R06: 403 istisnası yok; gönderilen kimlik
>   biçimine bağlı değil): beklenen kod → uygun · yanıt alınamadı → ÖLÇÜLEMEYEN · beklenen dışındaki doğrulanmış **her** yanıt (2xx,
>   3xx, **403**, 404, 429, 5xx, sınıflanamayan kod) → FAIL. FAIL bir ölçüt ihlali / bulgu adayıdır; nedeni ayrı değerlendirilir —
>   "ürün güvenlik kusuru kesinleşti" demek değildir. Tekdüze 403 (pozitifler dahil hepsi 403) artık pozitif kontrol FAIL verir.
>
> **API'ye özgü kanıt** artık "gönderdiğim kimlik aynen döndü" değildir — isteğin başlığını yansıtan sıradan bir aracı katman da onu
> üretir. Kaynakta API, kabul ettiği biçimdeki kimliği aynen geri yazar, kabul etmediği biçimdekini atıp **yenisini üretir**; sonda
> ret vektörlerine kabul edilmeyen biçimi gönderir: yeni kimlik = API kanıtı adayı, aynı değerin dönmesi = yansıtan katman göstergesi
> (kanıt sayılmaz), kendi kimliğini damgalayan katman görülmüşse kanıt kullanılmaz. Kuralın dayanağı kaynak okumasıdır; **gerçek API
> ile izole prova R05 sonda baytlarıyla yapıldı** (2026-10-06; yöntem, sonuç tablosu ve ölçülmeyenler paket belgesi §1.1'de); R06
> baytlarıyla dört kipte yinelendi (aşağıda R06 maddeleri). **Kapsam yetkisi kapısı:** birincil ad (AD-1) dışındaki her
> ad kimliği için sonda, kısıtlı bir kapsam yetkisi kaydı olmadan koşmaz (yetkili sağlayıcı hesabındaki bölge / özel ad kaydı + DNS
> zinciri; tünel kaydı tek başına yetmez) — "KOŞULMADI — kapsam yetkisi doğrulanmadı"; zorunlu bir kalem eksikse ret iletisi eksik
> kalemin **türünü** adlandırır. R06: iki kalem tek **birleşik belgeyi** gösterebilir (iki ayrı dosya zorunlu değil; iki ayrı kanıt
> unsuru, ad bağı, dosya bütünlüğü ve içerik incelemesi beyanı zorunlu); sonda yalnız **dosya bütünlüğünü** ölçer (dosya var, boş değil,
> özeti tutuyor), **içerik incelemesini** yalnız "beyan var" diye kaydeder — sahipliği sondanın doğruladığı söylenmez. **Çıkış kodu:**
> herhangi bir alan FAIL → 2 · FAIL yok → 3 · kapı → 4; **ölçüm koşumu çıkış 0 üretmez** (çıkış 5 de yok). **Public satır** yalnız alan
> değerlerini ve ad kimliğini taşır (sayı, neden, özet değeri yazılmaz); kenar engelleme ve katman hücrelerine PASS yazılmaz. Vektör
> listesi (68 istek) ve istek profili **değişmedi**. Pin `4A517621…8B71`. Ayrıntı, ad başına satır
> tablosu ve karar tabloları paket belgesindedir (`client-extacc-d8-staff-surface-r01` §1.1, §1b, §3, §3b, §3c). **Bu bölümde aşağıda
> kalan "403 sonucu tamam", "katman daima `unknown`", "bulgu listesi boş", "yerelde tek kanıt dosyası" ifadeleri R04 ve öncesini
> anlatır; geçersizdir. R05'in "kenar engelleme PASS (kayıt ekiyle)", "çıkış 0", "API değil çıkarımı", "pozitif 403 → ÖLÇÜLEMEYEN"
> ve "iki kalem aynı dosyayı gösteremez" kuralları R06 ile geçersizdir; R05'in ilk iki turundaki "iki ayrı hüküm", "yankı eşleşti =
> API", "çıkış 5 / karar bekliyor" kuralları da geçersizdir (PR'ların commit geçmişindedir).**
>
> **R04 revizyonu (PR #2906 → `45d47143`, `main`'de; canlıya uygulanmadı):** HEAD / OPTIONS (D8-E1) ve izole provadaki 18 kodlama varyantının tamamı (D8-E2)
> sondaya alındı → **68 istek** (59 ret + 9 pozitif; GET 41 · POST 11 · PUT 3 · PATCH 1 · DELETE 6 · HEAD 3 · OPTIONS 3; boş JSON gövde
> 15, gövdesiz 53; kimlik başlığı yok; tekrar denemesiz; istek başına 15 sn), yeni pin `E150EEDA…514C`. Yeni vektörlerin "kenar
> geçirirse" etkisi canlı aday kaynağından türetildi (HEAD → GET işleyicisi → kimliksiz 401; OPTIONS → CORS ön uçuşu, işleyiciden önce;
> yazma / audit / giriş sayacı yok). 68 istek tablosu ve yan etkiler paket belgesindedir. Aşağıdaki 46 istek tablosu birleştirilmiş
> **R02** sondasına aittir ve #2906 ile geçersizdir (tarihsel). 403 sonucu kesin katman kanıtı sayılmaz.

Sonda `client-extacc-d8-staff-surface-r01/scripts/d8-staff-surface-probe.js` (R06 pini `4A517621…8B71`; paket belgesi §7 ve iki owner
bloğundaki pinle eşit [Ö 2026-10-06]; `main`'deki R05 pini `EE0C6998…3F1A` idi. Aşağıdaki 46 istek tablosunun ait olduğu R02 sondasının pini `D5FA37D1…579B` idi; tarihsel).
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
Yerelde **iki** dosya yazılır (R05): ham kanıt (ana makine adını içerir; kısıtlı, depoya konmaz) ve ad içermeyen özet (yöntem sınıfı
düzeyinde sayı taşır; o da kısıtlıdır, depoya konmaz — public satıra yalnız alan değerleri ve ad kimliği aktarılır; paket belgesi
§1b). R04 ve öncesinde tek kanıt dosyası yazılıyordu. R05'te uygulamaya ulaşan pozitif isteklerin yarısı (ve kenar geçirirse ret
vektörlerinin hepsi) API'nin kabul etmediği biçimde bir istek kimliği taşır; API bu değeri atar (kimlik olarak kullanmaz) ve yenisini
üretir — kaynakta bunu günlüğe yazan satır görülmedi. Sağlayıcı kenarının kendi kayıtları ve canlı kenar günlüğü **ölçülemedi
(UNKNOWN)**.

**Katman ve kanıt sınırı (R05 / R06).** Durum kodu, kenar engelleme ve katman üç ayrı alandır. API'ye özgü kanıt yalnız istek kimliği
protokolünden gelir (kabul edilmeyen biçimdeki kimliğin yenisiyle değiştirilmesi); başlık ve gövde imzası yalnız ipucudur. API'nin
yanıtladığı kanıtlı ret satırı — 403 verse de — kenar engelleme ve katman doğrulamasında FAIL'dir (owner kararı). 403'ü hangi üst
katmanın ürettiği bu yöntemle **adlandırılamaz**. **R06:** bu kanıt yalnız "ulaştı"yı gösterebildiğinden kenar engelleme ve katman
doğrulaması sondayla PASS **üretmez**; başlığın bulunmaması isteğin API'ye ulaşmadığını kanıtlamaz. Sonda sunucunun kendi çıkışından
koşar (konum etiketi beyandır); dış ağ ayağı yalnız telefon beyanıdır. (R04'te kesin katman alanı daima `unknown` idi ve ret
vektöründe "tamam" yalnız durum 403'tü.)

**Üç kapsam boşluğu ve kabule etkisi** (tablo R03 öncesi durumu anlatır — tarihsel: D8-E1 ve D8-E2 R04'te sondaya alındı ve artık
boşluk değildir; D8-E3 R05'te ad başına koşumla ele alındı ama kapsam ve ad başına GO hâlâ owner kararıdır; güncel durum aşağıdaki
R03 / R05 notlarındadır):

| Kimlik | Boşluk | Karar verilmezse kabul ne söyleyebilir | Seçenekler |
|---|---|---|---|
| D8-E1 | HEAD / OPTIONS vektörü yok | "personel yüzeyi **beş yöntemde** (GET/POST/PUT/PATCH/DELETE) kapalı". HEAD ve OPTIONS için hüküm **verilemez** | iki vektör ekle (pin + öz-test + belge birlikte) / "yöntem kapsamı = 5 yöntem" diye kayda geç |
| D8-E2 | yol kodlama varyantı canlı listede 4, izole provada 18 | "ölçülen **dört** varyantta kapalı". "Kodlama varyantlarına karşı kapalı" genellemesi **yapılamaz** | 18 vektörü taşı / mevcut 4 ile yetin ve sınırı yaz |
| D8-E3 | tek ana makine adı; tünele bağlı diğer adlar kapsam dışı | kabul **yalnız birincil ad** içindir. "Dışarıdan kapalı" genellemesi diğer adlar için **yapılamaz** | her ad için ayrı koşum (adlar public belgeye yazılmaz) / "kapsam = yalnız birincil ad" kararı |

Üç boşluk "sınır kaydıyla kabul" yolunda D-8'i **dar kabul** yapar (yöntem, varyant ve ad kapsamı beyanla sınırlı); sonda
revizyonu yolunda pin, öz-test ve belge birlikte değişir ve koşum ondan sonra yapılır. SEC-API-BIND-01 açıkken D-8 sonucu ayrıca
"dışarıdan erişilemez" diye genellenmez (§8).

**R03 (2026-10-03):**
- **Diğer ana makine adları (D8-E3):** ad envanteri kısıtlı kayıttadır (ayrıntı public depoya yazılmaz). Kapsam owner kararıdır:
  (a) sonda envanterdeki her ad için ayrı koşulur; (b) "kapsam = yalnız birincil ad" diye kayda geçer — o durumda diğer adlar için
  "dışarıdan kapalı" denmez.
- **HEAD / OPTIONS ve 18 kodlama varyantı (D8-E1 / D8-E2)** PR #2906'da sondaya alındı (bu bölümün başındaki R04 notu); öz-test
  17/17, eski sondada yeni kalemler düşüyor; canlı sonda çalıştırılmadı. 403 sonucu kesin katman kanıtı sayılmaz.

**R05 (owner kararları 2026-10-05; dördüncü tur 2026-10-06) — R06 ile değişen yerler bu listenin altındaki R06 maddelerindedir:**
- **Ad başına koşum (D8-E3):** sonda her ad için ayrı süreçte, zorunlu ad kimliğiyle koşar; başka bir adın kanıtını okumaz, var olan
  kanıtın üzerine yazmaz. Ad başına satır tablosunda AD-1 (birincil ad) **KOŞULMADI — canlı sonda GO'su yok**; diğer yayın adları
  **KOŞULMADI — kapsam yetkisi doğrulanmadı**. Owner bloğu yalnız AD-1 için yazıldı; çalıştırılmadı.
- **Kapsam yetkisi (owner kararı):** birincil ad dışındaki bir adın sondalanması için yeterli kanıt, yetkili sağlayıcı hesabındaki
  bölge / özel ad kaydı **ve** DNS zinciridir; tünel kaydı tek başına yeterli değildir. Sonda bu kapıyı uygular: kayıt yoksa, ad
  kimliği ya da ana makine birebir uyuşmuyorsa, iki kalemden biri eksikse, bir kanıt dosyası yoksa ya da özeti tutmuyorsa istek
  atmadan durur (çıkış 4); zorunlu bir kalem eksikse ret iletisi eksik kalemin türünü adlandırır ("kanıt eksikse yalnız eksik
  girdiyi iste"). Kayıt ve kanıt dosyaları kısıtlıdır (depoya girmez). Eksik olan yalnız girdidir: bugün hiçbir ek ad için
  kayıt sunulmadı. Asgari ölçütün ötesindeki koşullar (boş dosya · gelecekteki tarih · AD-1 ile kayıt verilmez · telefon listesinde de
  kapı) uygulayıcı sıkılaştırmasıdır (paket belgesi §1). R05'teki "iki kalem aynı dosyayı / içeriği gösteremez" koşulu R06'da owner
  kararıyla **kalktı**; içerik incelemesi beyanı zorunlu oldu (aşağıda R06).
- **Katmanı ayırt eden kanıt (D8-E4) ve 403 dışı yanıtların sınıflanması (D8-E5):** 403 dışı her doğrulanmış ret yanıtı durum kodu
  ölçütünde FAIL'dir; kenar engelleme yalnız API'ye özgü kanıt (ya da 2xx) varsa FAIL, kanıt yoksa ÖLÇÜLEMEYEN'dir. 403 de tek sınıf
  değildir: sınama (challenge) ya da tanınmayan azaltım işareti taşıyan 403 durum kodu ölçütünde 403'tür ama hedeflenen erişim
  kuralının uygulandığını kanıtlamaz (kenar engelleme ÖLÇÜLEMEYEN). FAIL ölçülemeyenin önündedir (aynı koşumda ikisi varsa çıkış 2).
  Kanıt kuralının dayanağı kaynak okumasıdır; gerçek API ile izole prova R05 baytlarıyla yapıldı (aşağıdaki madde). İki sınır paket
  belgesinde ve öz-testte kayıtlıdır: (ulaşmama yönünde; R05'te "PASS yönündeki varsayım"dı) API'nin ret yanıtından kimlik başlığını
  silen bir katman görülemez — gerçek API ile gösterildi; kapatılamaz; **R06'da sonda bu durumda PASS vermez** (ölçülemeyen); (FAIL
  yönünde) yalnız API önekli ret yanıtlarına API'nin
  ürettiği biçimde kendi kimliğini yazan bir katman API'den ayırt edilemez (kenar engelleme FAIL; katman doğrulaması yalnız koşumun
  kalibrasyonu o davranışı en az bir kez gösterdiyse FAIL, göstermediyse ÖLÇÜLEMEYEN).
- **Gerçek API ile izole prova — ilk koşu (2026-10-06; çağıran koştu; sonda baytları `369A51DD…8370`):** gerçek API = yayın adayı
  derlemesi, tek kullanımlık veritabanı, yerel kenar; canlı servis / canlı `.env` / canlı veritabanı / dış posta yok; sondanın satır
  bazındaki iddiası kenarın zemin günlüğüyle karşılaştırıldı. Ölçülen (dokuz kenar kipi; tablo ve altı sonuç maddesi paket belgesi
  §1.1'de aynen): sıradan yansıma API kanıtı üretmedi (yansıtan iki kipte "API'ye ulaştı" iddiası 0) · gerçek API iki davranışı da
  gösterdi (aynen 3/3, değiştirme 3/3) · gerçek API'nin 403'ü kenar ölçütünü FAIL yaptı (durum kodu ölçütü PASS kaldı) · yalnız
  API'nin ret yanıtından başlığı silen katmanla **R05 sondası** kenar engelleme PASS verdi (çıkış 0) — istek API'ye ulaşmışken; owner
  bu sonucu **kabul etmedi** ve R06 bunu düzeltti (aşağıda) · yanlış pozitif hiçbir kipte yok (0 / 9 kip). **Provada olmayan
  (ölçülmeyen):** tünel / sağlayıcı ayağı ve gerçek web uygulaması (web yanıtları kenarın sentetik sayfasıydı). R05 dördüncü turda
  sondanın üç kuralı değişti; **R05'in son baytlarıyla yineleme yapıldı** (sonda `EE0C6998…3F1A`): dokuz kipin dokuzunda alanlar, çıkış
  kodları ve zemin günlüğü karşılaştırması ilk koşuyla aynı. R06 baytlarıyla yineleme (dört kip) aşağıdaki R06 maddelerindedir.
- **Dördüncü tur (2026-10-06; iki bağımsız doğrulamanın küçük bulguları):** pozitif kontrolde tek kural (önceden API'nin izinli bir
  yolda ürettiği 5xx, gönderilen kimlik biçimine göre çıkış 3 ya da çıkış 2 veriyordu; artık iki sırada da FAIL) · kapının eksik
  kalemi adlandırması · katman doğrulamasında desteksiz kesinlik yok · ad başına satır tablosunda koşum hücresine pin ve vektör kümesi
  kimliği kısa biçimde yazılır ve öz-test satır biçimini koşum hücresine göre ölçer (satır gerçek bir koşumdan sonra kurala göre
  doldurulduğunda pinli öz-test düşmez).
- **Owner kararları (2026-10-05; verildi):** kenarda engellenmesi gereken isteğin API'ye ulaştığı kanıtlanırsa bulgu adayıdır (API'nin
  403'ü bunu kapatmaz) · kalibrasyon eksikse "kapalı" hükmü verilmez, kanıtlı ihlal yine korunur · sınama yanıtı erişim kuralının
  uygulandığını kanıtlamaz · her ad için üç ayrı alan, kanıtın desteklediği değerle · 403 yerine başka doğrulanmış yanıt FAIL, yanıt
  alınamaması ÖLÇÜLEMEYEN · diğer adın kapsam yetkisi ölçütü (yukarıda).

**R06 (owner kararları 2026-10-06; takip PR'ı; canlıya uygulanmadı — açık metinler paket belgesi §3c'de):**
- **Kanıt sınırı:** owner, gerçek API'nin 403 yanıtından kimlik başlığı silindiğinde kenar engelleme PASS çıkmasını kabul etmedi —
  başlığın bulunmaması isteğin API'ye ulaşmadığını kanıtlamaz; pozitif yolların kalibrasyonu ret yollarında başlığın korunacağını
  kanıtlamaz. Düzeltme: HTTP 403 eşleşmesi kendi alanında PASS kalır · kenar engelleme bağımsız kanıt yoksa ÖLÇÜLEMEYEN (sonda PASS
  üretmez; sağlıklı koşumun neden sınıfı "bağımsız kanıt yok" — diğer ölçülemeyen nedenlerinden ayrı) · API'ye ulaşma kanıtı bulunan
  ihlal FAIL olarak korunur · "API değil" çıkarımı ve "API değil gösterilen" kapsam sayısı kalktı · **ölçüm koşumu çıkış 0 üretmez**
  (FAIL → 2 · FAIL yok → 3). Yeni ürün telemetrisi ya da mimari değişiklik eklenmedi; sınır dürüstçe ölçülemeyen bırakıldı.
- **Regresyon (öz-testte; ölçüldü):** başlığı silinen API 403'ü girdisinde düzeltilmiş sonda `PASS · ÖLÇÜLEMEYEN · ÖLÇÜLEMEYEN · PASS`,
  çıkış 3 verir ve sağlıklı kenardan ayırt edilemez (ikisine de PASS yok); `main`'deki düzeltmesiz sonda aynı girdide kenar engelleme
  PASS, çıkış 0 verir (sayılar paket belgesi §1c "Negatif ayna").
- **Gerçek API ile yineleme (R06 sonda baytları; 2026-10-06; dört kip; ölçüldü — tablo paket belgesi §1.1'de):** sağlıklı kenar →
  `PASS · ÖLÇÜLEMEYEN · ÖLÇÜLEMEYEN · PASS`, çıkış 3 (R05'te kenar engelleme PASS, çıkış 0) · gerçek API 403'ü → `PASS · FAIL · FAIL ·
  PASS`, çıkış 2 (değişmedi) · aynı yanıttan kimlik başlığı silinince → `PASS · ÖLÇÜLEMEYEN · ÖLÇÜLEMEYEN · PASS`, çıkış 3 (R05'te
  yanlış PASS, çıkış 0) · saydam geçiş → `FAIL · FAIL · FAIL · PASS`, çıkış 2; yanlış pozitif dört kipte 0. Başlığı silinen kipte
  API'ye ulaşan istek sondayla **yine görülemez** (sınır kapanmadı; yalnız başarılı kenar engellemesi gibi sunulmuyor). Bu koşuda API
  süreci yalnız geri döngü arayüzünü dinledi ve geri döngü dışına bağlantı açmadı (ölçüldü; izolasyon yalnız prova başlatıcısında);
  yayın adayı ağacı önce / sonra aynı. **Koşulmayan:** diğer beş kip R06 baytlarıyla; tünel / sağlayıcı ayağı ve gerçek web uygulaması
  bu yinelemede de yok.
- **Pozitif kontrol:** izinli yolda beklenen kod yerine doğrulanmış başka her HTTP yanıtı, **403 dahil**, FAIL; yanıt alınamaması
  ÖLÇÜLEMEYEN. Beklenmeyen yanıt önce ölçüt ihlali / bulgu adayıdır, nedeni ayrı değerlendirilir ("ürün güvenlik kusuru kesinleşti"
  diye sunulmaz). Tekdüze 403 artık pozitif kontrol FAIL, çıkış 2.
- **Kapsam yetkisi kapısı:** boş ya da özeti uyuşmayan kanıtın reddi kaldı · tarih denetimi sınır saatlerinde ölçüldü (TSİ / UTC farkı
  geçerli belgeyi reddetmiyor; kod değişmedi; saatli biçim her saatte biçim nedeniyle reddedilir) · sağlayıcı hesabı kaydı ile DNS
  zinciri tek birleşik belgede olabilir (iki ayrı kanıt unsuru, içerik incelemesi beyanı ve ad bağı zorunlu; iki ayrı dosya değil) ·
  sonda yalnız dosya bütünlüğünü ölçer, içerik incelemesini yalnız "beyan var" diye ayrı kaydeder; "sahipliği sonda doğruladı"
  anlamına gelen ifade kalmadı.
- **Açık kalan iki D-8 kararı:** (1) canlı sonda kapsamı ve ad başına GO (telefon beyanının ad başına olup olmadığı onunla birlikte
  netleşir); (2) kesin kenar kabulünün yöntemi — sonda kenar engellemesi için PASS üretmediğinden bir adın "dışarıdan kapalı"
  sayılması sonda dışı bağımsız kanıt ve owner değerlendirmesi gerektirir; yöntem önerisi ayrıca sunulur (§11 KR-9). Owner'ın
  2026-10-06 talimatı canlı sonda GO'su değildir.

Diğer sınırlar (minor; koşumu engellemez; kimlikler bu belgede tanımlıdır): dış zincir ön ölçümü yok (D8-E5'in kalanı; D8-E4 ve
D8-E5'in sınıflama kısmı R05'te ele alındı) · canlı kenar yapılandırmasının şablonla eşitliği ölçülmüyor (D8-E6) · dış ağdan makine
koşumu yok (D8-E7) · blok kanıtı mühürlemiyor (D8-E8; R05'te blok adsız özetin SHA-256'sını gösterir) · telefon beyanı için dosya
şablonu yok (D8-E11).

Kanıt kabul kontrol listesi (koşulduğunda; **ad başına**, R06 — kısıtlı kayıtta denetlenir): adsız özette sonda SHA-256'sı = paket
pini ve vektör kümesi kimliği = paket değeri (paket belgesi §7) · satır 68 (59 + 9) · kimlik bilgisi başlıklı istek 0 · boş olmayan
gövde 0 · boş JSON gövde 15, gövdesiz 53 (ham kanıtta) · tekil istek kimliği 68; gönderilen biçim: ret vektörlerinin hepsi kabul
edilmeyen biçim, API pozitifleri 3 + 3, web pozitifleri 2 + 1 · kalibrasyon VAR (API pozitiflerinde aynen geri yazma 3/3 ve
değiştirme 3/3, web pozitifleri 3/3 ölçülmüş, başlıksız bölgede başlık 0, yansıma göstergesi 0, yabancı kimlik göstergesi 0) · ret
vektörlerinde kimlik başlığı 0 · azaltım işareti 0 · sonuç yok 0 · dört değer **ayrı ayrı** yazılır: HTTP / ret sonucu, kenar
engelleme sonucu, katman doğrulaması (kapsam sayısıyla), pozitif kontrol. Bu liste kanıtın **kabul edilebilirliğini** denetler; kenar
engellemesinin kabulünü değil: liste eksiksiz tutsa da kenar engelleme alanı ÖLÇÜLEMEYEN'dir (neden "bağımsız kanıt yok") ve kesin kenar
kabulü sonda dışı kanıtla ayrıca yapılır. Ölçüm koşumu çıkış 0 üretmez; çıkış 3 sağlıklı koşumun olağan sonucudur ve kapanış ya da
başarılı kenar engellemesi değildir; çıkış 1, 4 ve 7 kapanış değildir; çıkış 2 ölçüt ihlali / bulgu adayıdır. Bulgu adayının ayrıntısı
(yol, yöntem, durum), sayılar, nedenler ve özet SHA-256'sı kısıtlı kayıtta
kalır; public satıra yalnız alan değerleri ve ad kimliği yazılır (paket belgesi §1b). (R02 sondasına ait eski liste — satır 46 · boş
JSON gövde 14 · gövdesiz 32 · "bulgu listesi boş" — ve R05'in ilk iki turundaki "yankı 6/6" listesi geçersizdir.)

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

Aday taslağı (`1b758d29` + seçili teslimler; ölçüm anında uç `e772e60d`; koordinatörün doğrulama kaydı) H6 ve H8'in dayandığı
modüllerde şunları değiştirir [Ö, `git diff`; sonraki aday commit'leri bu modüllere dokunmuyor]:

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
| SEC-PORTAL-REQ-01-K2 | risk kabulü yok · AÇIK (önceden var) | canlı salt okuma sayımı (2026-10-03): bugün etkilenen **aktif hesap 0** | yama yok | portal girişi ve sıfırlama talebi | politika kararı | KR-4 |
| SEC-PORTAL-REQ-01-K3 | risk kabulü yok · KOŞULLU | — | yayın paketinde ele alınır | #2884 yayını | yayın paketi | KR-8 |
| SEC-PORTAL-REQ-01-K4 | risk kabulü yok · AÇIK (önceden var; #2884 dışında) | — | yama yok | portal hesabı açma ve kapatma | ayrı iş | KR-14 |
| SEC-STAFF-XFF-01 | risk kabulü yok · AÇIK | ek ölçüm gerekir | yama yok | D-8 sonda vektörü 06; yayın sonrası ürün düzeltmesi | ek ölçüm + ayrı yama | KR-14 |
| SEC-API-BIND-01 | ağ düzeyinde azaltım uygulandı (kural korunur) · AÇIK | kapanış gösterilmedi | kalıcı düzeltme yok | D-8 sonucunun genellenmesi | kalıcı düzeltme yolu | KR-14 |
| SEC-MAIL-LOG-01 | risk kabulü yok · AÇIK | — | yama yok | her D-5 gönderim denemesi | günlük satırlarının ele alınması | KR-14 |
| SEC-PORTAL-ADMIN-MSG-01 | **R27 koşullu risk kabulü** · AÇIK | dış kapalılık D-8 ile ölçülmedi | yama yok | D-7 personel yanıtı adımları; H7 beyanı | yetki kuralı + ayrı yama | KR-14 (R27 §10 K-11) |
| SEC-API-METRICS-01 | risk kabulü yok · kaynak gözlemi; **inceleme bekleyen bulgu adayı** (owner 2026-10-06) | canlıda dışarıdan erişilebilirliği ve etkisi ölçülmedi | yama yok; ürün düzeltmesi ve dışarıdan erişim denemesi yetkisi verilmedi | D-8 kesin kenar kabulünün ek kanıt yöntemi | inceleme | owner |
| D5-SEC-R01 / R02 / R03 | KOŞULLU — kod canlıda (R27) | canlı davranış ölçümü yalnız R01'in parola politikası ayağında | — | D-5 kabulü | D-5 kabulünün tamamlanması (yeni deneme: KR-8 sonrası yeni D-5 GO'su) | — |
| FRK-1 | AÇIK | — | dar düzeltme hazır değil | sonraki yayınlarda B1 otomatik geri dönüş kararı | dar düzeltme + izole harness | KR-14 |
| LS-1 | KOŞULLU — B3 kapıları eklendi (#2862) | canlı B3 koşulmadı | kalıcı çözüm yok | B3 | kalıcı çözüm | KR-14 |
| B3H-1 / B3H-2 / B3H-3 / F1 | KAPANDI (betik düzeyi, #2862) | canlı B3 koşulmadı | — | B3 | — | — |
| R27 §10 K-5 · K-14 / K-15 · eski bloklardaki yerel topoloji literalleri | AÇIK | — | — | engelleyici değil / sonraki yayınlarda B0/B1 | — | KR-14 |

## 9. PR'lar — kesin durum [Ö 2026-10-03]

Dört PR owner'ın koşullu birleştirme yetkisiyle (bu sayfada owner'ın kendi teyidi + koordinasyon kaydındaki owner karar tablosunun
CLIENT maddesi; bu belgede KR-7) ve #2900 owner'ın ayrı teslim yetkisiyle (karar tablosu 8. madde: IF GO-COMPLETE)
sırayla birleştirildi: her biri yalnız tam uç SHA eşleşince, PR denetimleri yeşilken ve `main` CI boşken (koşan / sıradaki 0), uç
commit'e sabitli squash ile. Kanonik `main` checkout'u yalnız ileri sarılarak senkronlandı. Force-push ya da koruma atlama yok.

| PR | İçerik | Uç (tam SHA eşleşti) | Birleştirme commit'i | `main` CI |
|---|---|---|---|---|
| #2880 | D-6 owner bloğu R02 + öz-test bağımsızlığı + belge sınırları | `357027bb` | `6744abff` | yeşil |
| #2882 | D-7 owner bloğu R02 + öz-test bağımsızlığı + belge sınırları | `4d368a8f` | `0e04f4a6` | yeşil |
| #2884 | portal e-posta eşleşmesi + teşhis satırları + hesap açma çakışma kuralı (API; migration yok). Commit gövdesi düzeltilmiş özetle verildi (eski "SMTP değil" ifadesi `main`'e taşınmadı) | `7bdcc533` | `be08dbe9` | yeşil |
| #2885 | D-5 koşum kaydı, kalan işler tablosu R02, H3/H6/H8 beyan taslakları (yalnız belge) | `a2e7dae5` | `5477a073` | yeşil |
| #2900 | PORTAL-RESET-FORM-01 — üç portal formu (yalnız web); owner'ın teslim yetkisiyle (IF GO-COMPLETE) | `281fd9d4` | `8b9a9989` | yeşil |
| #2902 | F1 — şifre sıfırla sayfaları geliştirme ortamında token kaybetmez (yalnız web; güvenlik adayına eklenmez); owner'ın teslim yetkisiyle (karar tablosu 9. madde) | `100668f3` | `7ae481e3` | yeşil |
| #2904 | D-6 kapanış düzeltmesi R03 … R03-g (+ R03-g ek) | `b7a04afc` | `039f4137` | yeşil |
| #2905 | D-7 kapanış düzeltmesi R03 … R03-g | `f91e1571` | `95a35711` | yeşil — ilk denemede Test Suite 20 dakika süre sınırında kesildi (bilinen CI sınırı); yalnız düşen işler yeniden koşuldu ve başarılı |
| #2906 | D-8 sonda kapsamı R04 (canlıya uygulanmadı) | `aa9b1bde` | `45d47143` | yeşil — ilk denemede Test Suite 20 dakika süre sınırında kesildi (bilinen CI sınırı); yalnız düşen işler yeniden koşuldu ve başarılı |
| bu PR | R03 / R03-b güncellemesi + D-5 takip kaydı (2) (yalnız belge) | — | — | owner talimatıyla son sırada |

Koordinatörün sıralama isteğiyle #2899 (OFFICE) #2884 ile #2885 arasında birleştirildi.

**2026-10-04:** #2904, #2905 ve #2906 owner'ın 2026-10-03 talimatıyla (bu sayfada owner'ın kendi teyidi; 2026-10-04 talimatlarıyla
sürdürüldü) aynı kurallarla, bu sırayla birleştirildi. Her birleştirmeden önce bir öncekinin `main` CI'ı tamamlanmıştı ve koordinatörün
kayıtlı kuralı gereği `main` CI'ın boş olduğu 90 saniye arayla iki kez ölçüldü. Kronoloji: 12:48:11Z #2904 için koordinatöre
"MERGE-HAZIR" yazıldı → 12:49:53Z #2904 birleşti → 12:50:33Z koordinatörün PR başına "SIRA SENDE" bekleme şartını bildiren
mesajı geldi (#2904 bu şarttan ÖNCE birleşmişti; geri alınmadı, yinelenmedi) → 13:05:26Z koordinatör #2905, #2906 ve #2903 için
bu şartı kaldırdı (kaynak: koordinatör mesajı, CLIENT oturum kaydında) → #2905 ve #2906 bu düzenle birleştirildi.

**CI süre sınırı:** `main`'deki Test Suite işinin 20 dakika sınırı bu üç birleştirmede 19:51 / 20:16 / 20:16 dakika:saniye sürdü; ikisinde
iş sınırda kesildi ve yalnız düşen işler yeniden koşularak yeşile döndü (kod hatası değil). Sınırın değiştirilmesi owner tarafından OFFICE'e
dar kapsamla atandı; PR #2914 açık; birleştirme owner kararında.

## 10. Hazırlık hükmü

| Ölçüt | Durum |
|---|---|
| Dört PR'ın (ve #2900, #2902'nin) birleştirilmesi ve birleştirme commit'lerinin `main` CI'ı | **karşılandı** — dört PR + #2900 + #2902 birleştirildi; dört birleştirme commit'inin `main` CI'ı (CI · Push on main · GOV-COORD-V2) yeşil; kanonik `main` senkron |
| D-5 teşhisi kanıtın taşıdığı düzeyde | karşılandı (§3.1); kök neden UNKNOWN, dört aday |
| D-5 tarihsel kanıt paketi | **eksik kalır** (manifest yok, üretilmez); takip kayıtlarında belgelendi — **tamamlanmadı**; bağımsız hazırlığı bekletmez |
| API düzeltmesi (#2884) | `main`'de; adaya alındı (`f69783af`), adaydaki saf testleri 116/116 [K] |
| Web düzeltmesi (#2900) | üretim derlemesinde doğrulandı; `main`'de (`8b9a9989`, main CI yeşil); aday uyarlaması koordinatörde |
| Yayın adayı (API + web) | **hazır değil** — birleşik aday doğrulaması koordinatörde sürüyor; canlı yayın GO'su yok |
| D-6 / D-7 kapanış düzeltmeleri | **`main`'de** (#2904 → `039f4137`, #2905 → `95a35711`; `main` CI yeşil; #2905 için yalnız düşen işler yeniden koşuldu); izole senaryolar, negatif kontroller, pinler, iki kabukta blok öz-testi; canlı koşum yok |
| D-8 sonda revizyonu | **`main`'de** (R06: #2943 → `7cc31a3a`; önceki R05 #2942 → `c9f51af1`, R04 #2906 → `45d47143`; `main` CI yeşil); AD-1 canlı sondası 2026-10-06'da bir kez koşuldu — sonuç FAIL alanları içerir, D-8 açık |
| Canlı kabul | **eksik**: D-5, D-6, D-7, D-8 (kısmi), birleşik D-9; H1–H8 0/8 |

**REPO TESLİMİ (dört PR + #2900 + #2902 + #2904 + #2905 + #2906): GO-COMPLETE** — birleştirmeler ve birleştirme sonrası `main` CI'ları yeşil.

**HAZIRLIK TAMAM** olan paketler: #2884 API düzeltmesi (`main`'de, adaya alındı) · PORTAL-RESET-FORM-01 web düzeltmesi (#2900,
`main`'de; üretim derlemesinde doğrulandı). Yayın adayı (API + web birleşik) **henüz hazır değil** — doğrulaması koordinatörde.
D-6 / D-7 kapanış hazırlığı ve D-8 sonda revizyonu: paketler **`main`'de** (#2904, #2905, #2906). Canlı koşumlar ayrı GO ve
canlı dist pini ister; **hazırlık tamam, canlı kabul yok**.

**CLIENT GENEL KABUL TAMAMLANMADI** (canlı kabul eksik: D-5, D-6, D-7, D-8, birleşik D-9; hizmet kabulü 0/8).

## 11. Tek owner karar listesi (KR-n; R27 paketinin K-n numaralarından ayrıdır)

**Kapanan kararlar (R03):** KR-1 (iki beyan alındı, takip kaydında) · KR-2 ve KR-3 (owner 2026-10-03: web düzeltmesi yeni D-5'ten
önce yayında; yayınsız deneme ve elle yazma talimatı kapandı) · KR-6 (sayım yapıldı: aktif hesap 0) · KR-7 (dört PR birleştirildi)
· KR-8'in hazırlık kısmı (aday kapsamı genişletildi; tek yazar yayın koordinatörü) · KR-13 (owner R04: bu koşum birleşik D-9 için
yeterli sayılmaz) · KR-15'in birleştirme kısmı (R03-b: #2904, #2905, #2906 birleştirildi; bu belge son sırada).

| # | Karar | Seçenekler / not | Ne zaman |
|---|---|---|---|
| KR-4 | SEC-PORTAL-REQ-01-K1 ve K2 için ürün politikası — **AÇIK; yayın ön koşulu** | #2884'ün adayda bulunması teknik kapsam bilgisidir; ek sertleştirmenin ertelenmesi ve kalan riskin kabulü **ayrı owner kararıdır** (yürütücünün teknik açıklaması risk kabulü değildir). Belirsizlik bir kaynak bulgusudur (kod okuması), ölçülmüş davranış değildir. En küçük düzeltme yalnız kod + test (migration yok); adaya alınırsa aday yeniden doğrulanır. Veritabanı düzeyi benzersizlik ayrı migration paketidir. Mükerrer aktif hesap durumu: 2026-10-03 sayımında aktif hesap 0; sonrası **UNKNOWN**. Ayrıntı kısıtlı kayıtta | yayından önce |
| KR-8 | Yayın GO'su | doğrulanmış nihai aday, açık riskler ve geri dönüş planı koordinatörden somut paket olarak gelir | aday hazır olunca |
| KR-5 | D-6 / D-7 Recover kuralı ve açık paket kararları (D-6 OK-1…OK-5; D-7 K-4…K-7) | ayrı onayın kaydı · ikinci Recover · D-6 kalıntısında sıra · D-6 kalıntı bağlamında ayrı çıkış kodu (OK-5) · D-7 makbuzsuz yarım kurulum · yayın ile D-6/D-7 sırası | D-6/D-7 koşumundan önce |
| KR-17 | D-6 / D-7: Run kapanışında 401/403'te tek yeniden giriş (D-6 OK-6, D-7 K-8) — kod `main`'de | aynı sentetik personel, veritabanı yazması yok; canlıya ek etkisi giriş hız sınırı sayacı +1 (kaynaktan okundu) — Run'ın kendi kapanış yetkisi içinde sayılır mı | D-6 / D-7 koşumundan önce |
| KR-18 | Portal formları (#2900, `main`'de) küçük görünür değişiklikler | başarılı girişte düğme yönlendirme bitene dek "Giriş yapılıyor..." kalır — kabul edilmezse küçük takip düzeltmesi · API tarafında giriş / şifremi unuttum gövde doğrulaması ayrı iş olarak açılsın mı | yayından önce (ilki) / herhangi bir zaman (ikincisi) |
| KR-9 | D-8 — **kararların çoğu verildi (owner, 2026-10-05):** engellenmesi gereken isteğin API'ye ulaştığı kanıtlanırsa bulgu adayıdır, API'nin 403 vermesi bunu kapatmaz · kalibrasyon eksik ya da başarısızsa "kapalı" hükmü verilmez, bağımsız kanıtlanan ihlal korunur · sınama (challenge) yanıtı erişim kuralının uygulandığını kanıtlamaz, kenar engelleme ÖLÇÜLEMEYEN kalır · her ad için HTTP / ret sonucu, kenar engelleme sonucu ve katman doğrulaması ayrı alanlardır, kanıtın desteklediği PASS / FAIL / ÖLÇÜLEMEYEN değeri yazılır · 403 yerine doğrulanmış başka yanıt FAIL, yanıt alınamaması ÖLÇÜLEMEYEN · diğer adın kapsam yetkisi: yetkili sağlayıcı hesabındaki bölge / özel ad kaydı + DNS zinciri (tünel kaydı tek başına yetmez). **Owner, 2026-10-06 (gerçek API ile izole provanın sonucu üzerine):** başlığı silinen API reddinde kenar engelleme PASS kabul edilmez — kenar engelleme bağımsız yeterli kanıt yoksa ÖLÇÜLEMEYEN'dir, API'ye ulaşma kanıtı FAIL olarak korunur, "API değil" çıkarımı ve çıkış kodu aynı kanıt sınırına uyar (sonda kenar engellemesi için PASS ve çıkış 0 üretmez) · izinli yolda beklenen kod yerine doğrulanmış başka her yanıt, 403 dahil, pozitif kontrolde FAIL'dir (ölçüt ihlali / bulgu adayı; "kusur kesinleşti" değil); yanıt alınamaması ÖLÇÜLEMEYEN · kapsam yetkisi: iki kanıt türü tek birleşik belgede olabilir; iki ayrı kanıt unsuru, içerik incelemesi ve ad bağı zorunlu; dosya bütünlüğü ile içerik incelemesi ayrı kaydedilir; boş / özeti uyuşmayan kanıt reddi kalır. **AÇIK KALAN (iki kalem):** (1) canlı sonda kapsamı (hangi adlar, hangi pencere, hangi istek profili) ve ad başına GO; R27 sonrası telefon beyanının yenilenmesi ve ad başına alınıp alınmayacağı bu GO ile birlikte netleşir · (2) **kesin kenar kabulünün yöntemi**: sonda "ulaşmama"yı kanıtlayamadığından bir adın "dışarıdan kapalı" sayılması sonda dışı bağımsız kanıt ve owner değerlendirmesi gerektirir (yöntem önerisi ayrıca sunulur); karar verilene kadar D-8 sonda koşsa da kapanmaz | §5 R05 / R06; paket belgesi §3b ve §3c (kararların açık metni). "Katman `unknown` iken PASS'in kabulü" sorusu kalktı: tek bir PASS yoktur, katman doğrulaması ayrı alandır | D-8 koşumundan önce (2. kalem: D-8'in kapanışından önce) |
| KR-10 | D-6: GO · telefon yüklemesi · kalıcı izlerin kabulü · belge onay/ret akışı ayrı paket mi | — | D-6 koşumundan önce |
| KR-11 | D-7: GO · kalan mesaj/bildirim satırları "saklandı" · SEC-PORTAL-ADMIN-MSG-01 açıkken koşum teyidi · kapsam dışı dosya referansında 400'ün ölçüt sayılması | — | D-7 koşumundan önce |
| KR-12 | H beyanları: H6 · H8 imzası (yayından önce mi sonra mı); H3 imza + kapsam seçimi (açık bırakıldı) · H1 / H2 / H4 / H5 / H7 hükümleri (§7.2, günlük dille) | taslaklar: `H3-H6-H8-OWNER-BEYAN-TASLAKLARI-R01.md` | herhangi bir zaman |
| KR-14 | Güvenlik öncelikleri: SEC-MAIL-LOG-01 · SEC-STAFF-XFF-01 / SEC-API-BIND-01 kalıcı düzeltme · SEC-PORTAL-ADMIN-MSG-01 · SEC-PORTAL-REQ-01-K4 · FRK-1 · LS-1 · R27 §10 K-5 / K-14 / K-15 | — | herhangi bir zaman |
| KR-15 | Kalan küçük işler: D-6 / D-7 PR açıklamalarındaki bilinen sınırlar · D-6 blok metnindeki kalan eksikler (OK-4) · ~~makbuz kurtarma dosyasını kimin, nereye yazacağı (D-6 / D-7)~~ — karar ve uygulama kapandı (owner kararı 2026-10-04; R04 `main`'de, #2923); canlı Recover'da doğrulanmadı — bu, D-6 / D-7 koşumunda Recover gerekirse ölçülür | — | D-6 / D-7 koşumundan önce (sonuncusu) / herhangi bir zaman |
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

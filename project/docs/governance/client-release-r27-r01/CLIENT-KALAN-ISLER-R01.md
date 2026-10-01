# CLIENT — KALAN İŞLER TEK ÇALIŞMA LİSTESİ (R01) · 2026-10-01

> **DURUM: CLIENT GENEL KABUL TAMAMLANMADI.** Bu belge D-5 denemesinden (runId `00c96bd5`, çıkış 3) sonra kalan CLIENT işlerini
> tek tabloda toplar: D-1…D-9, H1…H8, açık güvenlik işleri, hazır teslimler ve owner karar listesi. Belge **kabul vermez**, sayaç
> ilerletmez ve hiçbir canlı işlemi yetkilendirmez. Yeni canlı Run/Recover, e-posta gönderimi, yayın, migration, servis/SMTP/firewall
> değişikliği ve PR merge'i ayrı owner kararıdır (§9).
> Kaynak ayrımı: **[Ö]** bu çalışmanın kendi ölçümü (2026-10-01; salt okuma) · **[B]** mevcut kayıt belgesinin iddiası (yeniden
> ölçülmedi) · **[O]** owner beyanı (makine ölçümü değildir).

## 1. Kimlikler ve kayıt uzlaştırması

| Konu | Değer | Kaynak |
|---|---|---|
| Canlı ürün | **R27** — kaynak `1b758d29`, API dist `E28A6863…5134`, WEB `B2DEE365…F621` / `W2UQpBPD…`; migration 0; `.env` değişmedi | [B] `record/R27-LIVE-RECORD-R01.md` §1 · [Ö] 2026-10-01 16:59Z D-5 Preflight: dist ve `.env` pinleri eşit |
| `main` | Bu belge yazılırken `ef16f07f`. **main ≠ canlı**: `1b758d29` dışındaki ürün değişiklikleri (K3/OFFICE, para birimi düzeltmeleri vb.) canlıda **değildir** | [Ö] |
| Yayın B0/B1/B2 | Tamamlandı (2026-09-30); **tekrarlanmaz** | [B] canlı kayıt §2 |
| #2837 paket · #2849 R03/R03-b · #2838 pinler · #2853 canlı kayıt | MERGED `429a0f5b` · `32927399` · `59620165` · `38b0830a` | [Ö] GitHub |
| #2862 B3 geri dönüş betiği R03-c/R03-d | MERGED `496e6f6a` (2026-10-01). B3H-1/2/3 ve F1 **betik düzeyinde** kapandı (izole harness 53/53, mutant 27/27); canlı B3 **koşulmadı** | [Ö] GitHub + paket §6 |
| #2858 D-5 bloğu R04 (onay metni + Recover yetkisi) | MERGED `138aa9a3` (2026-10-01) | [Ö] GitHub |
| D-5 canlı koşumu | **Bir kez koşuldu**: runId `00c96bd5`, çıkış **3** (ÖLÇÜLEMEYEN) — kabul **değil** | [Ö] `client-extacc-portal-d5-r01` §8 |
| Ağ azaltım kuralı (8080 engeli) ve yayın geri dönüş yedekleri | **Korunur**; bu çalışma dokunmadı | [B] canlı kayıt §2, §5 |

Bu PR'da düzeltilen bayat satırlar: §10.

## 2. D halkaları — tek tablo

Kabul ölçütlerinin kanonik tanımı `client-external-access-r01` §7'dir; paket ölçütleri ilgili paket belgesindedir.

| Halka | Kabul ölçütü (özet) | Mevcut kanıt | Durum | Eksik iş | Bağımlılık | Yürütücü | Owner kararı |
|---|---|---|---|---|---|---|---|
| **D-1** intake bağlantısı dış cihazdan açılır | sayfa açılır (owner, mobil veri) | runId `cff5c692` 22/22 (#2820) [B]; cihaz/ağ [O] | **Kabul — dar (intake)** | yok; kapsam genişletilmez | — | tamamlandı | — |
| **D-2** form sentetik veriyle gönderilir | gerçek POST ile gönderim | `cff5c692` E-13 [B]; tek basış [O] | **Kabul — dar (intake)** | yok | — | tamamlandı | — |
| **D-3** doğru büro/dosya/statü | kayıt doğru tenant/dosya; kanonik hedefler değişmedi | `cff5c692` E-10…E-16 [B] | **Kabul — dar (intake)** | yok | — | tamamlandı | — |
| **D-4** portal girişi dış cihazdan | giriş (ürün 201) · yanlış parola 401 | runId `e34b7e6d` 21/21 (#2826) [B]; telefon [O] | **Kabul — dar** | yok; Run/Recover tekrarlanmaz | — | tamamlandı | — |
| **D-5** portal parola sıfırlama uçtan uca | Run çıkış 0 **ve** owner beyanı; çıkış 3 kabul değildir | runId `00c96bd5`: çıkış 3 · 21 PASS / 0 FAIL / 8 ÖLÇÜLEMEYEN [Ö]; "e-posta gelmedi" [O] | **ÖLÇÜLEMEYEN — kabul tamamlanmadı** | (1) kanıt mühürü: owner beyan dosyası + birleşik karar + manifest (§3.1) · (2) ürün düzeltmesi PR'ı #2884 incelemesi · (3) yeni deneme (§9 KP-1) | (2) merge + canlıya yayın → yeni dist pini → blok pinleri; ya da düzeltmesiz yeni deneme (§9 KP-1 B yolu) | owner bağımsız normal PowerShell penceresi + telefon; hazırlık ajan | yeni GO · alıcı adresi · tek gönderim onayı · ezme E/H · yol seçimi (KP-1) |
| **D-6** belge yükleme/indirme/silme | Run çıkış 0 + owner beyanı (D6-1…D6-6, P6-C*) | canlı koşum **yok**; öz-testler izole [B] | **Koşulmadı** | blok R02 (Recover yetki metni vb.) PR'ı #2880 incelemesi → Preflight → QrTest → Run | #2880 merge (blok `main` checkout'undan okunur) · ayrı GO · dış zincir | owner penceresi + telefon | D-6 GO · K-7 (onay/ret akışı ayrı paket mi) · telefon yüklemesi yapılsın mı · kalıcı sentetik izlerin kabulü |
| **D-7** mesaj gönderme/okuma | Run çıkış 0 + owner beyanı; kapsam dışı dosya referansında ürün **400** döner (paket 400 ölçer) | canlı koşum **yok**; öz-testler izole [B] | **Koşulmadı** | blok R02 PR'ı #2882 incelemesi → Preflight → QrTest → Run | #2882 merge · ayrı GO · dış zincir · SEC-PORTAL-ADMIN-MSG-01 açık (engel değil; etkilediği adımlar D7-3/3N/3U/3G/3F/3B) | owner penceresi + telefon | D-7 GO · K-8 (kalan mesaj/bildirim satırları "saklandı") · açık kayıt varken koşum teyidi · Recover onay kuralı |
| **D-8** personel yüzeyi dışarıdan kapalı | sonda çıkış 0 (37 ret 403 + 9 pozitif) **ve** telefon beyanı 5/5 | yalnız 2026-09-27 telefon beyanı: 5 GET 403 [O]; R27 öncesi; katman ölçülmedi | **Kısmi** | sonda canlıda koşulmadı; telefon beyanı R27 sonrası yinelenmedi; kapsam kararları (§6) | ayrı GO · dış zincir · kapsam kararı D8-E1/E2/E3 | sonda: normal pencere; telefon: owner | D-8 GO + §6 kararları |
| **D-9 (intake)** | ACTIVE bağlantı yok; public uç kapalı; kullanıcı pasif, dosya CLOSED | `cff5c692` [B] | **Kabul — dar** | yok | — | tamamlandı | — |
| **D-9 (portal, D-4 koşumu)** | DB + HTTP kapanışı ayrı ayrı | `e34b7e6d` [B] | **Kabul — dar** | yok | — | tamamlandı | — |
| **D-9 (birleşik)** | D-4/D-5/D-6/D-7 koşumlarının kapanış satırlarının hiçbiri FAIL/ÖLÇÜLEMEYEN değil | §3 | **Açık** | D-5 bileşeni ölçülemeyenli; D-6/D-7 bileşenleri yok | D-5, D-6, D-7 koşumları | koşucular owner penceresinde; kayıt ajan | birleşik kabul onayı |

D-1/D-2/D-3/D-4 ve dar D-9 kabullerinin kapsamı **korunur**; bu belge onları genişletmez ya da daraltmaz.

## 3. D-9 — her koşumun kapanışı ayrı

| Koşum | Kapanış satırları | Sonuç | Birleşik D-9'a katkısı |
|---|---|---|---|
| Intake `cff5c692` | bağlantı USED 1/1, ACTIVE yok, public 404 (yerel + dış), kullanıcı pasif, dosya CLOSED | PASS [B] | bileşen hazır (dar) |
| D-4 `e34b7e6d` | yeni giriş 401, mevcut oturum 401 (yerel + dış), DB pasif, sürüm 0→1, personel pasif, dosya CLOSED | PASS [B] | bileşen hazır (dar) |
| D-5 `00c96bd5` | P5-C1, P5-C2, P5-C-TOKEN, P5-C2V, P5-C3L/C3D, P5-C4L-S0/C4D-S0, P5-C5, U-CLOSE, P5-SCRUB, U-ISO, P5-D9 **PASS**; **P5-C4L / P5-C4D ÖLÇÜLEMEYEN** (sıfırlama sonrası oturum alınmadı; mevcut-oturum reddi yalnız sıfırlama öncesi oturumla ölçüldü). Kurtarma gerekmedi; **ayrı Recover başlatılmadı** | kapanış makinece doğrulandı; iki satır ölçülemeyen [Ö] | tanıma göre ölçülemeyen satır PASS saydırmaz → **yeterli değil** (varsayılan; owner aksi karar verebilir) |
| D-6 | P6-C*, P6-C-DOC, P6-FOREIGN-CLEAN, U-CLOSE, U-ISO | koşulmadı | yok |
| D-7 | P7-C*, P7-MSG-KEPT, U-CLOSE, U-ISO | koşulmadı | yok |

### 3.1 D-5 koşumu `00c96bd5` — kanıt bütünlüğü

Ayrıntı: `client-extacc-portal-d5-r01/EXTACC-D5-PORTAL-RESET-PACKAGE-R01.md` §8. Özet: kanıt dizininde beş dosya var ve ham bayt
sha256'ları koşum sonundan beri değişmedi; `d5-evidence.json` = `DD89C593…EA7F`. Owner beyan dosyası, birleşik karar ve manifest bu
belge yazılırken **yazılmamıştı** (blok beyan sorularını koşum penceresinde bekliyor); yazıldıklarında ayrıca doğrulanır. Orijinal
kanıt dosyalarına dokunulmadı.

## 4. H1–H8 — hizmet kabulü **0/8** (değişmedi)

Bir H ancak (a) kendi ölçüt kümesi karşılanmış **ve** (b) açık owner hizmet-kabulü kararı kayıtlıysa ilerler
(`product-backlog.md` "HIZMET KABULU 0/8" bölümü; her İ kapanış kaydının sonuç cümlesi). **(b) koşulu sekiz hizmetin hiçbirinde
kayıtlı değil**; bu çalışma hiçbir sayacı ilerletmedi. D sonuçlarından H sayacı türetilmez. Ölçüt kimlikleri ve satır atıfları
`H1-H8-ACIK-OLCUTLER-R01.md` içindedir; aşağıdaki PASS sayıları o kayıtların kendi etiketleridir [B].

| H | Ölçüt kümesi | Mevcut kanıt [B] | Eksik iş | Bağımlılık | Yürütücü | Owner kararı |
|---|---|---|---|---|---|---|
| H1 Kimlik | İ9: MUTATION_AUTHORITY, #2552-a…d, A-0, A-7, A-8 | runId `d19ce2c7` 14/0/0 (RELEASE22) | imza · B-2 hükmü · **tazelik**: ölçümden sonra müvekkil oluşturma/yeniden etkinleştirme yolu değişti (#2645) ve canlı R27'de bu kimlikle yeniden ölçülmedi [Ö: kaynak farkı] | K-12 | owner | B-2 + imza · "mevcut kanıt yeterli" / dar yeniden ölçüm |
| H2 Adres/iletişim | H2-01…H2-10 | runId `8811f395` 13/13 | imza · KB-03 / H2-10 hükmü | K-12 | owner | KB-03 (a)/(b) + imza |
| H3 Vekâlet | İ10: A-1…A-4, K9 | runId `c9b07bcb` 10/0/0 | **yalnız imza** | — | owner | imza |
| H4 Talimat/beyan/rıza | H4-01…H4-08 | runId `e28c5c06` 14/14; H4-08 gerçek yayın ayağı gerçek sağlayıcıyla ölçülmedi (test sink kanıtına bağlı) | imza · H4-08 hükmü | K-12 | owner | H4-08 hükmü + imza |
| H5 Bilgi/belge toplama | H5-01…H5-06 | İ11 `158675ab`; H5 dar kabul `dda5d8c3` (yalnız mutlak intake bağlantısı; **hizmet kabulü değildir**) | ayrı hizmet-kabulü satırı · B-I11-2 hükmü | K-13 | owner | K-13 |
| H6 Gönderim | İ12: G1…G7 | runId `92d04ef3` 17/17 (test sink; gerçek alıcı yok) | **yalnız imza** | — | owner | imza |
| H7 Portal | H7-00…H7-08 | runId `6b883b16` 12/12 (R25B); H7-05b · K-1 · PSUS yalnız disposable | imza · H7-05b/K-1/PSUS hükmü · **tazelik**: ölçümden sonra portal servis/controller/guard iki yayınla değişti (#2738, #2830, #2832) [Ö: kaynak farkı] · D-5 kabulü tamamlanmadı (sıfırlama yüzeyi H7 ölçüt kümesinde yok; biçimsel engel değil, imza öncesi bilinmesi gereken olgu) | K-12, K-11 | owner | hükümler + imza · tazelik seçimi · "D-5 tamamlanmadan imzalanır mı" |
| H8 Finansal/izlenebilirlik | İ15: KABUL-5 + yedi senaryo yöntemi | runId `1b83637a` 5/5 | **yalnız imza** | — | owner | imza |

**Sayaç: 0/8.** H3, H6, H8 yalnız imza bekler; H1/H2/H4/H7 için önce K-12 hükümleri; H5 için K-13. Hükümler yazılmadan toplu imza
metni kullanılırsa açık kalemler örtük kabul edilmiş olur (`office-remaining-decisions-r01` §7.2).

## 5. Açık güvenlik işleri (yalnız kimlik · durum · etkilediği adım)

Teknik ayrıntı kısıtlı kayıttadır ve bu belgeye/PR'a yazılmaz. R27 yayını için verilen owner risk kabulü public kayıtlarda yalnız
SEC-PORTAL-ADMIN-MSG-01 için açıkça yazılıdır; **sonradan çıkan kayıtlar o kabulün kapsamında sayılmaz**.

| Kimlik | Durum | Etkilediği adım | Sonraki iş |
|---|---|---|---|
| SEC-STAFF-XFF-01 | AÇIK | yayın sonrası ürün düzeltmesi (W9); D-8 sonda vektörü 06'nın sayaç anahtarı | ek ölçüm + ayrı yama · owner kararı |
| SEC-API-BIND-01 | AÇIK (ağ düzeyinde azaltım uygulandı; kapanış gösterilmedi) | D-8 sonucunun "dışarıdan erişilemez" diye genellenmesi | kalıcı düzeltme yolu · owner kararı |
| SEC-MAIL-LOG-01 | AÇIK | her D-5 gönderim denemesi (onay metni) | günlük satırlarının ele alınması · owner kararı |
| SEC-PORTAL-ADMIN-MSG-01 | AÇIK (R27 koşullu risk kabulü) | D-7 personel yanıtı adımları; H7 imza metni; K-11 | yetki kuralı + ayrı yama · owner kararı |
| **SEC-PORTAL-REQ-01** (yeni, 2026-10-01) | AÇIK — düzeltme #2884 içinde; merge edilmedi, **canlıda değil** | portal giriş ve sıfırlama talebi uçları; D-5 yeni denemesi | #2884 incelemesi + yayın · owner kararı |
| D5-SEC-R01 / R02 / R03 | KOŞULLU — kod canlıda (R27); canlı davranış ölçümü yalnız R01'in parola politikası ayağında (B2 DK-7) | D-5 kabulü | D-5 kabulünün tamamlanması |
| FRK-1 | AÇIK | sonraki yayınlarda B1 otomatik geri dönüş kararı | dar düzeltme + izole harness + yeniden SelfTest · owner önceliği |
| LS-1 | KOŞULLU — B3 kapıları eklendi (#2862); kalıcı çözüm uygulanmadı | B3 (zamanlanmış tetik dakikalarına denk gelen koşum güvenli durur, geri dönüş tamamlanmaz) | kalıcı çözüm · owner kararı |
| B3H-1 / B3H-2 / B3H-3 / F1 | KAPANDI (betik düzeyi, #2862); canlı B3 koşulmadı | B3 | — |
| K-5 (eski PR gövdesi + commit geçmişi) | AÇIK | yok (engelleyici değil) | owner kararı |
| K-14 / K-15 (yayın kapısı kapsamı) | AÇIK | sonraki yayınlarda B0/B1 | owner kararı |
| Eski owner bloklarında kalan yerel topoloji literalleri | AÇIK (kimliksiz) | yok (kabul engeli değil) | ayrı iş · owner kararı |

## 6. D-8 sondası — kapsam, katman sınırı, kesin istek listesi, yan etkiler (hazırlık; **çalıştırılmadı**)

Sonda `client-extacc-d8-staff-surface-r01/scripts/d8-staff-surface-probe.js` (sha `D5FA37D1…579B`; belge §7 pini ve owner bloğu
pini ile eşit [Ö]). Durum açmaz: sentetik veri, hesap, token, DB erişimi yoktur; kapanış/Recover gerekmez; yeniden koşulabilir.

**İstekler: 46, sıralı, tekrar denemesiz, istek başına 15 sn.** 37 ret vektörü (hepsi 403 beklenir) + 9 pozitif (3 sayfa 200,
6 API 401). Yöntem: GET 27 · POST 10 · PUT 3 · PATCH 1 · DELETE 5. Gövde: yazma yöntemlerinde boş JSON `{}` (14 istek), diğerlerinde
gövdesiz (32). Kimlik başlığı **yok**. Tek origin: canlı yapılandırmadaki portal adresi.

| # | Yöntem · yol | Beklenen | Kenar geçirirse uygulamada ne olur (kaynak `1b758d29`) |
|---|---|---|---|
| 01–04 | GET `/` · `/auth/login` · `/dashboard` · `/auth/reset-password` | 403 | web sayfası; yazma yok |
| 05 | GET `/api/auth/me` | 403 | 401; DB/yazma yok |
| 06 | POST `/api/auth/login` `{}` | 403 | bellek içi giriş sayacı **+1** (60 sn'de kendiliğinden düşer; tek istek blok üretmez), sonra 400; DB yazma/audit/kilit yok |
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
| 26–31 | izinli portal yollarında yanlış yöntem (POST/DELETE `cases`, DELETE/PUT `messages`, PUT/POST `documents/d8probe`) | 403 | 404 |
| 32, 34 | POST `/portal/profile` · `/portal/login` (web) | 403 | sonuç ölçülmedi; yazma yok |
| 33 | GET `/api/portal/change-password` | 403 | 404 |
| 35–37 | GET `/robots.txt` · `/api` · `/api/` | 403 | 404 |
| 38–40 | GET `/portal/login` · `/portal/forgot-password` · `/portal/reset-password` | **200** | web sayfası; sonda betik çalıştırmaz, sıfırlama isteği **gönderilmez**; yazma yok |
| 41–43 | GET `/api/portal/cases` · `documents` · `messages` | **401** | guard ilk kontrolde durur; DB okuması bile yok |
| 44–46 | POST `messages` `{}` · DELETE `documents/d8probe` · POST `change-password` `{}` | **401** | guard işleyiciden önce durur; mesaj yazılmaz, belge silinmez, parola değişmez |

Bilinçli dışarıda bırakılanlar: portal giriş/sıfırlama POST'ları, intake POST, belge yükleme. Telefon adımı ayrı: 5 GET
(`/auth/login`, `/`, `/api/auth/me`, `/api/portal/admin/documents/pending`, `/api/cases`), mobil veri, owner beyanı.

**Yan etkiler.** Beklenen durumda ret vektörleri uygulamaya ulaşmaz. Uygulamaya ulaşan 9 pozitif istek yalnız bellek içi istek
kimliği ve metrik sayacı üretir; DB yazımı, audit, hız sınırı sayacı, hesap kilidi, hata kaydı yoktur. Tek olası iz vektör 06'dır
(yukarıda). Yerelde tek kanıt dosyası yazılır (ana makine adını içerir; ham hâliyle depoya konmaz). Sağlayıcı kenarının kendi
kayıtları ve canlı kenar günlüğü **ölçülemedi (UNKNOWN)**.

**Katman sınırı.** 403'te kesin katman alanı daima `unknown`'dır; `Server` başlığı ve gövde imzası yalnız ipucudur ve katman kanıtı
diye raporlanmaz. `unknown` PASS'i düşürmez (paket §3). Ret vektöründe "tamam" yalnız durum 403'tür: kenar reddi ile uygulama 403'ü
bu alanda ayrışmaz. Ham yolun korunması öz-testte yalnız **ilk atlamaya** kadar kanıtlıdır; canlıda ilk atlama sağlayıcı kenarıdır.
Sonda sunucunun kendi çıkışından koşar; dış ağ ayağı yalnız telefon beyanıdır.

**Koşumdan önce karar isteyen kapsam boşlukları** (üçü de sonda pinini değiştirir ya da kapsam beyanı ister):

| Kimlik | Boşluk | Seçenekler |
|---|---|---|
| D8-E1 | HEAD / OPTIONS vektörü yok (izole provada vardı) | iki vektör ekle (pin + öz-test + belge birlikte) / "yöntem kapsamı = 5 yöntem" diye kayda geç |
| D8-E2 | kodlama varyantı canlı listede 4, izole provada 18 | 18 vektörü taşı / mevcut 4 ile yetin ve sınırı yaz |
| D8-E3 | tek ana makine adı; tünele bağlı diğer adlar kapsam dışı | her ad için ayrı koşum (adlar public belgeye yazılmaz) / "kapsam = yalnız birincil ad" kararı |

Diğer sınırlar (minor; koşumu engellemez): uygulama katmanını ayırt eden başlık kanıta alınmıyor (D8-E4) · 403 dışı kenar hataları
"bulgu" diye sınıflanır, dış zincir ön ölçümü yok (D8-E5) · canlı kenar yapılandırmasının şablonla eşitliği ölçülmüyor (D8-E6) ·
dış ağdan makine koşumu yok (D8-E7) · blok kanıtı mühürlemiyor (D8-E8) · telefon beyanı için dosya şablonu yok (D8-E11).

Kanıt kabul kontrol listesi (koşulduğunda): satır 46 (37 + 9) · `measured.credentialHeaderRequests = 0` ·
`measured.nonEmptyBodyRequests = 0` · boş JSON gövde 14, gövdesiz 32 · ölçülemeyen 0 · bulgu listesi boş ·
`suspectAppOrigin403` değeri not edilir. 403 dışı ret bulgusu kısıtlı kayda alınır; public PR'a yol/yöntem ayrıntısı yazılmaz.

## 7. Hazırlanan düzeltmeler ve PR'lar (hepsi incelemeye hazır; **hiçbiri merge edilmedi, canlıda değil**)

| PR | İçerik | Doğrulama |
|---|---|---|
| #2884 | portal e-posta eşleşmesi: birebir eşleşme önce; yoksa baş/son boşluk ve ASCII harf büyüklüğü farkı yalnız **tek** aktif aday varsa kabul edilir; e-posta kayıtlı adrese gider; girdi doğrulaması; sessiz dallara adres/token içermeyen teşhis günlük satırları; hesap açma çakışma kapısı aynı kuralı kullanır. Dış yanıtlar, şema ve kayıtlı adres biçimi değişmez | yeni birim + gerçek Postgres testleri PASS (Türkçe yerel ayarlı deneme veritabanında da); düzeltmesiz serviste başarısız; test edilebilir 34 mutantın 34'ü yakalandı; `pure/client-portal` 149 suite / 2198 test ve `pure/architecture-guards` 78 / 1359 PASS; üç tur bağımsız inceleme (açık blocker/major yok) |
| #2880 | D-6 owner bloğu R02: çıkış 5/6 Recover yetkisi değildir; kapanış metni yalnız ölçüleni iddia eder; onay metni telefon yüklemesinin günlük/kova etkisini söyler. Koşucu ve pinli dosyalar değişmedi | blok öz-testi 73/73 ×2 kabuk; önceki blok baytları yeni kalemlerde FAIL; paket digest aynı; iki tur inceleme + bağımsız yeniden ölçüm (blocker/major yok); koşucu öz-testi repodaki hâliyle koşulamadı (ayna kopyada 51/51) |
| #2882 | D-7 owner bloğu R02: çıkış 5/6 Recover yetkisi değildir; Recover'ın canlı yazma kümesi belgede ve blok bilgi metninde; owner adımı/beyan metni düzeltmeleri. Koşucu ve pinli dosyalar değişmedi | blok öz-testi 64/64 ×2 kabuk; önceki blok baytları yeni kalemlerde FAIL; kod `main`'deki blokla birebir eşit (AST); paket digest aynı; iki tur inceleme + bağımsız yeniden ölçüm (blocker/major yok); koşucu öz-testi repodaki hâliyle koşulamadı (ayna kopyada 41/41) |
| bu PR | D-5 koşum kaydı, kalan iş tablosu, bayat satır düzeltmeleri (yalnız belge) | — |

Not: R27 paket belgesindeki D-6/D-7 blok öz-test sayıları (64/64, 58/58) `main`'deki blok baytlarına aittir; #2880 ve #2882 merge
edilince 73/73 ve 64/64 olur ve o satırlar ayrıca güncellenir.

## 8. Uygulanmaya hazır sıradaki adımlar (sıra önerisidir; her canlı adım ayrı owner kararı)

1. **D-5 kanıt mühürü (yeni yetki gerekmez):** koşum penceresindeki beyan sorularını owner yanıtlar → ajan birleşik kararı, manifesti
   ve dosya bütünlüğünü doğrular → pencere kapatılır. Yeni Run/Recover **başlatılmaz**.
2. **PR incelemeleri:** #2884, #2880, #2882, bu kayıt PR'ı. Merge owner kararıdır.
3. **Owner imzaları (canlı iş gerektirmez):** H3, H6, H8; K-12 hükümleri verilirse H1/H2/H4/H7; K-13 ile H5.
4. **D-8:** §6 kapsam kararları → (gerekirse sonda revizyonu) → GO → sonda + telefon beyanı → kayıt.
5. **D-6 ve D-7:** R02 PR'ları merge → Preflight → QrTest → Run (ayrı GO'lar) → kayıt. D-5'e teknik bağımlılıkları yoktur; D-7'nin
   telefon adımı D-5 ile aynı dış web → API yolunu kullanır (D-4'te bu yol girişle ölçüldü).
6. **D-5 yeni deneme:** §9 KP-1.
7. **Birleşik D-9:** D-5/D-6/D-7 koşumlarının kapanış satırları ölçülemeyensiz alındıktan sonra.

## 9. Birleştirilmiş owner karar listesi

### KP-1 — D-5 yeni deneme (tek karar paketi)

| | A yolu — önce ürün düzeltmesi (önerilen) | B yolu — düzeltmesiz yeni deneme |
|---|---|---|
| Ne yapılır | (1) #2884 incelenir ve merge edilir · (2) canlı R27 kaynağı + **yalnız bu yama** ile dar aday hazırlanır (API dist değişir; WEB, `.env`, şema değişmez; migration 0). Not: `main`'deki portal servisi canlı kaynaktan 20 satır fazladır (hesap açmada işlem içi yetki denetimi, #2825 — canlıda değil); yama canlı kaynağa geri taşınırken bu satırların adaya alınıp alınmayacağı aday kapsam kararıdır · (3) yayın (B0 → B1 → B2 kalıbı; ayrı yayın paketi + izole prova) · (4) owner bloklarının canlı dist pini güncellenir (pin PR'ı; D-5/D-6/D-7 dahil sekiz blok) · (5) D-5 Preflight → Run | canlı R27 değişmeden D-5 Preflight → Run; owner formda adresi konsolda girdiğiyle **harfi harfine aynı** yazar (küçük harf, baş/son boşluksuz; otomatik düzeltme/doldurma kapalı) |
| Gereken yetki | merge onayı · yayın GO'su · pin PR merge'i · yeni D-5 GO'su · alıcı adresi (iki kez, yalnız konsol) · tek gönderim onayı · ezme E/H | yeni D-5 GO'su · alıcı adresi · tek gönderim onayı · ezme E/H |
| Kazanım | biçim farkı sınıfı kapanır; sessiz dallar günlükte teşhis satırı bırakır (neden bir sonraki denemede ölçülebilir olur) | yayın gerekmez |
| Risk | yayın işi (geri dönüş yolu B3, #2862 ile düzeltildi; canlıda koşulmadı) | neden UNKNOWN kaldığı için aynı sonuç yeni bir GO ve gönderim onayını tüketerek tekrarlanabilir; yine teşhis satırı oluşmaz |
| Değişmeyenler | SMTP ayarı, DNS, `.env`, servis yapılandırması, ağ azaltım kuralı | aynı |

Her iki yolda: QrTest yeniden gerekmez (yol ve blok değişmedi; 2026-10-01 çıkış 0 kaydı var), istenirse koşulabilir. Recover yalnız
kanıt incelemesi sonrası ayrı owner onayıyla. SMTP teslimi yine makineyle ölçülmez; yalnız owner beyanı.

### Diğer kararlar

| # | Karar | Ne zaman |
|---|---|---|
| KP-2 | #2884, #2880, #2882 ve bu kayıt PR'ının merge onayı | inceleme sonrası |
| KP-3 | D-8: GO + D8-E1/E2/E3 kapsam seçimi + katman `unknown` iken PASS'in kabulü + R27 sonrası telefon beyanının yenilenmesi | D-8 koşumundan önce |
| KP-4 | D-6: GO · K-7 · telefon yüklemesi yapılsın mı · kalıcı sentetik izlerin (sentetik kayıtlar, günlük satırı, boş kova dizini) kabulü | D-6 koşumundan önce |
| KP-5 | D-7: GO · K-8 · SEC-PORTAL-ADMIN-MSG-01 açıkken koşum teyidi · kanonik "kapsam dışı 404" satırının 400 olarak okunması | D-7 koşumundan önce |
| KP-6 | Birleşik D-9: `00c96bd5` kapanışı D-5 bileşeni sayılır mı (varsayılan: hayır) | D-9 kaydından önce |
| KP-7 | H imzaları: H3 · H6 · H8 (yalnız imza); K-12 hükümleri + H1/H2/H4/H7; K-13 + H5; H1 ve H7 için tazelik seçimi | herhangi bir zaman |
| KP-8 | Güvenlik: SEC-PORTAL-REQ-01 yayın önceliği (KP-1 A yolu ile birlikte) · SEC-MAIL-LOG-01 günlük satırları · K-11 · SEC-STAFF-XFF-01 / SEC-API-BIND-01 kalıcı düzeltme · FRK-1 önceliği · LS-1 kalıcı çözüm | herhangi bir zaman |
| KP-9 | K-5, K-14, K-15 (R27 paketi §10) | herhangi bir zaman |
| KP-10 | Canlı DB'de salt okuma **sayımı** (adres yazılmaz; yalnız sayı): yalnız biçim farkıyla (harf/boşluk) ayrışan aktif portal adresi çifti. #2884 böyle bir çiftte kapalı yönde davranır (birebir yazım kendi hesabına gider; diğer yazımlar eşleşmez ve günlüğe "belirsiz" satırı düşer); sayım yalnız etkiyi görünür kılar. Veritabanının yerel ayarı ve kayıtlı adresteki baş/son boşluk için ölçüm gerekmez (yama ikisinden bağımsızdır; Türkçe yerel ayarlı deneme veritabanında ölçüldü). **Zorunlu tek ön koşul ölçümü:** canlı veritabanının sunucu kodlaması UTF8 olmalı (salt okunur `SHOW server_encoding`; yamanın sorgusu UTF8 dışı kodlamada hata verir — depo yapılandırması UTF8'dir, canlı ölçülmedi) | sayım: isteğe bağlı · kodlama ölçümü: #2884 yayınından önce |
| KP-11 | D-5 koşum penceresindeki 9 beyan sorusunun yanıtlanması (kanıt mühürü; yeni yetki değildir) | ilk fırsatta |
| KP-12 | İkinci Recover kuralı: D-6/D-7 R02 metinleri "çıkış kodu yeni bir Recover için yetki değildir; ikinci bir Recover bu paketle tanımlı değildir, owner kararı gerektirir" der; blok bunu kodla zorlamaz. İkinci Recover gerektiğinde izlenecek yol | D-6/D-7 koşumundan önce |
| KP-13 | Sıradaki blok/koşucu revizyonlarının kapsamı (hepsi pin değiştirir; canlı koşumu engellemez): D-7 "DOĞRULANDI" satırının yalnız ölçüleni yazması · D-6 koşucusunda D6-1D erişim reddinin ÖLÇÜLEMEYEN sayılması · koşucuların kanıta yazdığı kurtarma adımı metninin yeni kurala çekilmesi · hesap açmada API tarafı parola uzunluk politikası · portal hesap kapatma ucunun girdi doğrulaması | herhangi bir zaman |

## 10. Bu PR'da düzeltilen bayat satırlar

- `R27-RELEASE-PACKAGE-R01.md`: §1.2 D-5 satırı ("Ölçülmedi" → koşum kaydı) · §1.5 pin PR'ı satırı (#2838 MERGED) · §7 madde 3 ·
  §8 W4 · §10 Y1 satırı (verildi) ve FRK-1 / LS-1 için karar satırları · §11 D-5/D-6/D-7 "5/6 → Recover" ifadesi · kapanış paragrafı.
- `record/R27-LIVE-RECORD-R01.md`: §6'ya #2862 ileri atfı (B3H-1/2/3 kapandı; FRK-1 açık) · §7'ye D-5 koşum atfı.
- `client-extacc-portal-d5-r01/…PACKAGE-R01.md`: durum satırı + §7 iki madde + yeni §8 (koşum kaydı ve teşhis).
- `H1-H8-ACIK-OLCUTLER-R01.md` §12: güncelleme notu (D-5 koşuldu, D-6/D-7 paketleri `main`'de).
- `product-backlog.md` H5 satırı ve `client-external-access-r01` iki satırı: tarihli güncelleme notu.

Düzeltilmeyenler (bilinçli): D-6/D-7 paket belgeleri kendi R02 PR'larında güncellenir; `decision-log.md`'ye satır eklenmedi (owner
kararı kaydı değildir).

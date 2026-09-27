# OFFICE — KALAN KARARLAR VE H5 GECIS PAKETI (R01, 2026-09-23)

> Bu belge **yeni analiz degildir** ve **canli yazma/yayin/restart yetkisi vermez**. Mevcut kapanis kayitlarini
> (İ9-İ16, C4, C123, AUTH-01, A3, R26 Pencere A) tek yerde uzlastirir ve owner'in tek turda karar verebilecegi
> somut secenekleri listeler. Owner GO "OFFICE KALAN İŞLERİNİ NETLEŞTİR VE H5 GEÇİŞİNİ HAZIRLA" (2026-09-23)
> kapsaminda yazildi; #2769'un (S2 + sure riski + hizmet kabulu eslemesi, 2026-09-23) uzerine kurulur.

## 0. #2769 siniflandirmasi

`#2769` **dokumantasyon/kanit isidir**: kod degismedi, yeni CI kosusu yok, yeni canli olcum yok. Tek yeni olcum
S2 sonrasi CI Test Suite suresiydi (asagida §1.3) — o da salt okuma, mevcut GitHub Actions kaydindan.

## 1. Uzlastirma duzeltmesi

### 1.1 Hizmet sayisi

`product-backlog.md`'deki onceki "Sonuc" cumlesi **"Alti hizmette (H1,H2,H3,H4,H6,H8)"** diyordu — **H7 eksikti**.
Dogru sayim: **H5 disindaki hizmetler YEDIDIR: H1, H2, H3, H4, H6, H7, H8.** Bu duzeltme asagida §4'te ve
`product-backlog.md`'nin ilgili cumlesinde uygulanir.

### 1.2 "Sekizi de kapanmis" ifadesinin duzeltilmesi

Onceki metin "Sekiz hizmetin SEKIZI de kendi İ-kilometre tasinda canli kapanmis DURUMDA (teknik sayac 18/18
tamamdir)" diyordu. Iki ayri hata:

- **H5'in canli acik boslugunu gizliyordu.** H5 kendi İ-kilometre tasinda (İ11) kapandi, AMA
  `PUBLIC_INTAKE_BASE_URL` canlida hala tanimsiz — bu, İ11 kapanisindan SONRA ayrica dogrulanan, İ11'in kendi
  kapsaminda **olculmemis** bir kusurdur (`B-I11-1`, asagida §2). "Kapanmis DURUMDA" ifadesi bunu gizleyecek
  sekilde okunabilirdi. Duzeltme: yedi hizmet (H1-H4,H6,H7,H8) kendi kilometre tasinda **hem kapandi hem canli
  somut eksik tasimiyor**; H5 kendi kilometre tasinda kapandi AMA canli somut eksigi **korur**.
- **"Teknik sayac 18/18" tumu icin YANLIS genelleme idi.** Gercek sayaclar servise gore FARKLIDIR:

  | H | İ | Sayac (kaynak) |
  |---|---|---|
  | H1 | İ9 | Sayi verilmedi; kapanis runId `d19ce2c7` ile PASS (`client-live-acceptance-i9-r01/…md:391`) |
  | H2 | İ13 | 15/18 (decision-log 2026-09-19) |
  | H3 | İ10 | Sayi verilmedi; kapanis `CLIENT-I10-LIVE-R01` (decision-log 2026-09-12) |
  | H4 | İ14 | 16/18 (decision-log 2026-09-19) |
  | H5 | İ11 | 11/17 (`10838ccb`, #2678) |
  | H6 | İ12 | 14/18 (#2724) |
  | H7 | İ16 | 18/18 (2026-09-21) — **tek 18/18 olan** |
  | H8 | İ15 | 17/18 (2026-09-20) |

  "18/18" yalniz H7 icin dogrudur. Digerleri kendi olculen sayaciyla KAPANDI (farkli payda/pay), hepsi ayni
  sayida DEGIL. Duzeltilmis ifade: **her hizmet kendi olculen kapanis esigiyle KAPANDI; sayaclar birbirinden
  farklidir ve tek bir "18/18" degeriyle ozetlenemez.**

### 1.3 14:22 olcumunun SHA/kosuma baglanmasi ve surekli CI suresinden ayrilmasi

- **S2 kapanis olcutu (tek seferlik, artik degismez):** main `9214597b97c2eb8f698d51f1677ead29b45c4dba`
  (`ci.yml` sha256 = `E248BF0220EE5CA46255B99E7C072700616E55943E61A31DBC2A70E75C6922EC`), GitHub Actions run
  `35792192750`, Test Suite job `106963061893`, sure **14 dk 22 sn** (22:24:23Z-22:38:45Z). Bu, S2 zincirinin
  (#2751→#2752→#2761→#2762→#2763) manifest sadelestirmesinin **tek dogrulama olcumudur**; bir daha
  tekrarlanmasi gerekmez, cunku S2 zaten `ci.yml` sha esitligiyle kapandi.
- **Devam eden CI suresi degiskenligi (S2'den AYRI, surekli bir risktir):** her yeni main kosusu farkli surebilir
  (bagimlilik onbellegi, runner yuku, paralel is sayisi). 14:22 **o TEK kosuma** aittir, gelecekteki her kosumun
  suresini ONGORMEZ. Sure riski kapanis kriteri ("butce %90'ina, yani 18 dk'ya yaklasilmasi") **surekli izlenmesi
  gereken bir esiktir**, S2'nin kendisi gibi bir kerelik kapanan bir olcut DEGILDIR. Bu iki kavram ayri
  tutulmalidir: S2 KAPANDI (yapisal degisiklik tamamlandi); sure riski esigi ise her kosumda yeniden dogabilir,
  o gun ayrica olculmedikce "kapali" sayilamaz — bugunku tek olcum 14:22'nin butceye 5:38 pay biraktigini
  gosterir, gelecekteki kosumlar icin bir garanti DEGILDIR.

## 2. H5 gecis karar paketi — tek karar, hazir

> Bu bolum owner'in TEK oturumda karar verebilmesi icin H5'in var olan hazirlik paketini
> (`client-h5-intake-url-r01/H5-INTAKE-URL-PACKAGE-R01.md`) ozetler. Yeni test URETILMEDI; mevcut disposable
> kanit (7 PASS/1 OLCULEMEYEN, 2026-09-21) yeterli sayilir ve TEKRARLANMAZ.

### 2.1 Onemli guncelleme: K-A/K-B on-kosulu artik CANLIDA cozulmus durumda

H5 paketinin 2026-09-21 tarihli guncellemesi, env degisikliginin TEK BASINA yetmeyecegini, ayrica **R26 web
yayininin** (K-A: portal API'ye ulasamama; K-B: `/intake/<token>` sayfasinin personel girisine yonlendirilmesi)
gerektigini soyluyordu (`CLIENT-EXTERNAL-ACCESS-PACKAGE-R01.md` §1). **Bu on-kosul artik karsilanmistir:**
R26, Pencere A'da CANLIYA ALINDI (`R26-WINDOW-A-RECORD.md`, adim A2, 2026-09-22), ve A2'nin kaynak fark listesi
**#2739'u icerir** (K-A + ayni-origin + K-B duzeltmesi; PR govdesi: "K-A — portal cozumleyicisi ... K-B —
`/intake/<token>` personel giris yonlendirmesinden muaf DEGILDI"). Canli WEB digest'i `F064DC95…` → `C17E7B13…`
oldu ve bu digest bugun hala canlidir (P1 Pencere B, S2 durumu, `project_p1_window_b_live_a3_closed` kaydi).
**Sonuc: H5'in tek kalan somut eksigi artik yalniz `.env` degeri + API yeniden baslatma + dar canli kabuldur.**
Ayrica bir web derlemesi/yayini GEREKMEZ.

### 2.2 Uygulanacak kesin deger ve kaynagi

| Alan | Deger |
|---|---|
| Degisecek anahtar | `PUBLIC_INTAKE_BASE_URL` (canli API `.env`) |
| Uygulanacak deger | Canli `.env` icindeki **`WEB_BASE_URL`** degerinin **birebir kopyasi** (emsal: davet baglantisi ayni sinif kusurda ayni yontemle giderildi, `CLIENT-WAVE5-FD-PROVIDER-OPS.md` §P2-EK) |
| Kaynak/mevcut durum | `WEB_BASE_URL` canlida **tanimli** (tek gecis, mutlak bicim, ters bolu yok); `PUBLIC_INTAKE_BASE_URL` **tanimsiz**. Deger ekrana/kayida YAZILMAZ — owner bloğu (§2.3) dosyadan okur |
| Hedef ortam | Tek canli ortam (`hukuk_db` + canli API/WEB cifti); ayri bir "hedef canli ortam" secimi YOK, tek ortam var |

### 2.3 Degisecek dosya/ayar, restart ve etkilenen servisler

- **Degisecek dosya:** canli API `.env` (tek dosya). Degisiklik owner bloğu `scripts/h5-owner-env-block.ps1` ile
  **tek satir ekleme** (mevcut satirlar birebir korunur, satir sayisi tam +1) — dosyanin tamamini yeniden
  yazmaz.
- **On-kapilar (bloktan once):** yukseltilmis pencere; canli dist `1524EDC1…4D4E` (R25B taban) pini —
  **owner bu pini R26'nin guncel digest'iyle (`A8B17A38…`) karsilastirarak guncellemeli**, cunku paket
  2026-09-21'de yazildiginda R26 henuz canlida degildi (asagida "Kalan owner karari" §2.6); `.env` sha
  degisiklik-oncesi pin; `:8080` tek dinleyici; `PUBLIC_INTAKE_BASE_URL` **yok**; `WEB_BASE_URL` tek gecis ve
  mutlak.
- **Yedek:** `.env` ayni dizine `.env.bak-H5URL-<ts>` olarak kopyalanir, sha dogrulanir.
- **Restart gereksinimi:** **EVET** — API yeniden baslatilmasi gerekir (kisa kesinti, owner penceresinde). WEB
  yeniden baslamaz, dokunulmaz.
- **Etkilenen servisler:** yalniz canli API surecinin `.env` okuma anindaki degeri. Portal, personel paneli ve
  digger `.env` anahtarlari degismez (betik allowlist ile yalniz bu tek anahtari yazar).

### 2.4 Dar kabul olcutleri (mevcut kanittan, YENIDEN KOSULMAYACAK)

`scripts/h5-url-live-run.js` + `scripts/h5-owner-live-block.ps1`, 7+1 olcut: U-00 (yetki PARTNER bagindan),
U-01 (mutlak URL), U-02 (`<PUBLIC_INTAKE_BASE_URL>/intake/<token>` birebir), U-03a (hedef sayfa 200), U-03b
(API ucu 200; 503→OLCULEMEYEN, gecersizlik kaniti degil), U-04 (ham token sizintisi yok), U-CLOSE (kapanis:
pasif kullanici, CLOSED case), U-ISO (izolasyon degismedi). **Gonderim yoktur** — yalniz baglanti uretimi ucu
cagrilir. 2026-09-21 disposable provasi (aday dist, izole DB) 7 PASS/1 OLCULEMEYEN verdi; deger girilmeden
kosulan gerileme kontrolu U-01/U-02/U-03a'yi dogru FAIL etti (olcut gercekten yakaliyor). **Bu kanit canli kabul
icin YETERLI SAYILIR** — yalniz canlida ayni betiklerle TEK kez calistirilip kapanis kaydi tutulmasi gerekir.

### 2.5 Geri alma ve korunacak kanitlar

- **Geri alma:** `scripts/h5-owner-env-block.ps1 -Rollback -BackupFile <yol>`; yedegin sha'si taban pin degilse
  geri alma **baslamaz** (fail-closed). Blok kendisi de basarisiz doğrulamada **otomatik geri alir** (yeni
  `.env` beklenen sekli tutmazsa).
- **Korunacak kanitlar:** `.env` yedek dosyasi + sha256'lari (once/sonra), owner blogunun `-SelfTest` ciktisi,
  dar kabul betiklerinin JSON ciktisi (ham token YOK, yalniz sha256), kapanis olcumu (K-CLOSE/K-ISO).
  GO ref yalniz sha256 olarak tutulur, hicbir dosyaya literal yazilmaz (bkz. C123 dersi,
  `project_office_c4_c123_live_closed_20260922` bellek kaydi).

### 2.6 Kalan owner kararlari (bu belge YETKI VERMEZ)

1. **Canli GO:** `OWNER-GO-OFFICE-H5-YYYYMMDD-Rnn` (yalniz blok calisirken yerel girilir, hicbir dosyaya
   yazilmaz).
2. **Dist pin guncellemesi:** paket §3'teki `1524EDC1…` (R25B) pini artik canli DEGIL; owner bloğu calistirilmadan
   once guncel canli API dist'i (`A8B17A38…`, R26 sonrasi) ile pin GUNCELLENMELI. Bu, betigin kod DEGISIKLIGI
   degil, calisirken okudugu sabit pin degeridir — betigi degistirmeden once owner onayi ister.
3. **Pencere sirasi:** asagida §3.

## 3. #2770 pencere durumu ve sira

- **PR #2770 durumu:** `MERGED` (95b071fa, 2026-09-23T09:21:25Z). PR govdesi acikca "Canli degisiklik
  **baslatilmadi**" diyor — yalniz disposable prova (8/8 PASS, runId `33279eb4`) ve makbuz kapisi (5/5 PASS)
  merge edildi. Su an ACIK bir canli pencere veya kaynak tutan bir islem YOK.
- **O oturuma ulasma girisimi:** `ListAgents` ile aktif/erisilebilir es-oturum listesi kontrol edildi; #2770'i
  yazan oturum listede **yok** (govde ve paket belgesi disinda dogrudan iletisim kanali bulunamadi). Bu nedenle
  "pencere durumu" **PR govdesi + `office-staff-invite-acceptance-r01/OFFICE-STAFF-INVITE-ACCEPTANCE-R01.md`**
  uzerinden dogrulandi, dogrudan mesajla degil.
- **Davet paketinin kendi durumu:** `HAZIRLIK TAMAM — DISPOSABLE PROVA PASS — CANLIYA UYGULANMADI`; canli kosum
  **ayri bir owner GO'su** ister (kendi belgesi §8: "Canli GO: `OWNER-GO-OFFICE-INVITE-YYYYMMDD-Rnn`").
- **Cakisma degerlendirmesi:** Her iki paket de (H5 ve davet) canli pencerede ayni sinif islem yapar — WEB/API
  gorevini durdurup `.env`'e allowlist'li tek anahtar yazip yeniden baslatmak. **Su an ikisi de pencere
  ACMAMIS** durumda; dolayisiyla bugun icin fiili bir cakisma YOK. Ama owner ikisini de ayni gun onaylarsa,
  **ayni anda calistirilmamalidir** — ikisi de ayni 8080/3002 dinleyicilerini ve ayni `.env` dosyasini
  yeniden baslatma dongusune sokar; eszamanli calistirma bir digerinin baslangic-durumu pinini gecersiz kilar
  (H5'in G-0 kapisi "PUBLIC_INTAKE_BASE_URL yok" dogrulamasi, davet penceresi calisirken de gecerli olmali).
  **Onerilen sira (owner karari, bu belge dayatmaz):** ikisi de hazir; H5 daha kucuk/geri alinmasi daha basit bir
  degisikliktir (tek `.env` satiri, WEB'e dokunmaz), davet penceresi ise WEB'i durdurup remote-access kurali
  ekler ve SMTP degeri degistirir (daha genis blast radius). Once H5, sonra davet penceresi mantikli bir sira
  olur, ama bu bir ONERIDIR — owner farkli sira secebilir.

## 4. H1-H4, H6, H7, H8 — toplu owner-kabul metni (tek imzada onaylanabilir)

> Asagidaki yedi hizmetin HER BIRI kendi İ-kilometre tasinda CANLIDA kapandi VE bugune kadar hicbir canli somut
> eksik RAPORLANMADI. Owner asagidaki metni TEK SEFERDE onaylayarak "hizmet kabulu" karar kapisini bu yedi
> hizmet icin kapatabilir. Hicbir yeniden olcum GEREKMEZ.

**Onay metni (owner aynen veya degistirerek kullanabilir):**

> "Asagidaki yedi hizmet icin canli kilometre tasi kapanisini (H1: İ9 runId `d19ce2c7`; H2: İ13 runId
> `8811f395`, 15/18; H3: İ10, decision-log `CLIENT-I10-LIVE-R01`; H4: İ14 runId `e28c5c06`, 16/18; H6: İ12
> runId `92d04ef3`, 14/18; H7: İ16 runId `6b883b16`, 18/18; H8: İ15 runId `1b83637a`, 17/18 + ifade duzeltmesi
> 2026-09-22) **hizmet kabulu** olarak da onayliyorum. H5 bu onaya DAHIL DEGILDIR; H5'in hizmet kabulu, canli
> `PUBLIC_INTAKE_BASE_URL` uygulamasi ve dar kabulunden SONRA ayrica degerlendirilecektir."

Bu metin onaylanirsa hizmet kabulu sayaci **7/8** olur (H5 haric). Onaylanmazsa 0/8 kalir; her satirin ayri
onaya ihtiyaci devam eder.

## 5. B1-B10 owner politika kararlari — kimlik + somut secenekler

| # | Kalem | Durum/ozet | Somut secenekler |
|---|---|---|---|
| B1 | AK-1b — cross-office kapsami | Plan §8.5 onerisi var, kod DEGISMEDI | (a) Plan §8.5 onerisini oldugu gibi onayla → kod yazilir (b) Kapsami daralt/genislet → yeni oneri istenir (c) Ertele — B1 acik kalir |
| B2 | AK-1c — ADMIN kisa-yol sirasi | Plan §8.5; teyit bekliyor | (a) Onerilen sirayi onayla (b) Alternatif sira iste (c) Ertele |
| B3 | Ayricaliksiz pasif avukatin `create` ile yeniden etkinlesmesi | Bugun IZINLI (audit'li); CLIENT R1A ilkesinin avukata uygulanip uygulanmayacagi sorusu | (a) Bugunku davranisi KORU (izinli, audit'li) — resmen onayla, kapat (b) R1A ilkesini avukata da uygula → create'i devre disi birak, ayri GO-FIX gerekir (c) Ertele |
| B4 | VIEWER'in onay YURUTME/KURTARMA yollari (payout finalize, dagitim post, FD yayin, FD kayitli karar kurtarma) | Karar degil, YURUTME baglaminda acik soru | (a) Mevcut YURUTME yetkisini KORU (b) VIEWER'i bu yurutme uclarindan da cikar → kod degisikligi gerekir (c) Ertele |
| B5 | Okuma projeksiyonlari + web karar dugmeleri (UX) | Bagli VIEWER dugmeyi GORUR, sunucu 403 verir (guvenlik ihlali YOK, yalniz UX) | (a) UX'i degistirme (mevcut 403 fail-safe yeterli) (b) Dugmeyi VIEWER icin ON-TARAFTA GIZLE → frontend degisikligi (c) Ertele |
| B6 | `POST /cases`'te CASE duzeyinde VIEWER kontrolu YOK | OFFICE kaydinin kapsami disi ama ACIK | (a) Kapsam disi kalsin, ayri backlog'a tasi (b) Simdi GO-FIX ac → CASE alaninda VIEWER kontrolu eklenir (c) Ertele |
| B7 | seed'in OFFICE disi uclarinin yalniz `JwtAuthGuard` ile korunmasi | OWN-13 D03; canlida seed modulu KAPALI (risk sinirli) | (a) Canlida kapali kaldigi surece kabul et, kapat (b) Ek rol kontrolu ekle (canlida kapali oldugu icin dusuk oncelik) (c) Ertele |
| B8 | Onceden tuketilmis FD taleplerinin kurtarilmasi | Canlida OLCULDU (2026-09-11): tuketilmis/kilitli kayit 0 → bugun canli etki 0 | (a) Olcum yeterli, kapat — bugun etkisi yok (b) Ilerideki riski onlemek icin kod duzeltmesi iste (c) Ertele |
| B9 | Yerel worktree kalintisi `C:\Development\HY_WT\AK2_LAWYER_CREATE` | Repo disi, iskelet (0 dosya); tasfiye recetesi HAZIR | (a) Tasfiyeyi ONAYLA → yurutucu calistirir (b) Koru (neden istenirse belirtilmeli) (c) Ertele |
| B10 | Kontrol→yazma penceresi: yetki karari SONRASI, yazmadan ONCESI yetki geri alinirsa yazma yine GECER | OLCULDU: 21/21 kapi ilk yazmadan once kontrol ediyor ama hicbiri yazma anina kadar yetkiyi yeniden dogrulamiyor (kosullu-updateMany deseni YOK). Istismar GOSTERILMEDI, pencere tek istek ici | (a) Bugunku davranisi KABUL ET (AK-1a emsali: "rol KARAR ANINDA DB'den" var) → kapat (b) 21 kapiya kosullu-updateMany deseni ekle → genis kod degisikligi, ayri GO-FIX (c) Ertele |

## 6. Dort spec / ADR-014 / forceExit — "teslimi engellemez" hukmunun dayanagi

**Soru:** bu hukum mevcut bir owner kararina mi, yoksa belge yorumuna mi dayaniyor?

**Cevap: belge yorumuna/kanit YOKLUGUNA dayaniyor, owner karari DEGIL.**
`office-open-items-classification-r01.md`'nin kendi "Sonuc" bolumu acikca soyle diyor: *"Dordunun de teslim
engeli oldugna dair kanit YOKTUR; urun etkileri belirsizdir — hicbirinde kullaniciya ya da calisan servise etki
OLCULMEMISTIR. 'Etki olculmedi' ile 'etki yok' AYNI SEY DEGILDIR ve bu kayit ikincisini iddia ETMEZ."* Yani:

- Hicbir owner, bu dort kalem icin "teslimi engellemez" diye ACIKCA karar VERMEDI.
- Sonuc, mevcut kayitlarda (`product-backlog.md` ilgili satirlari) urun/kullanici etkisinin hic OLCULMEMIS
  olmasindan cikarilan bir **YOKLUK cikarimidir** — "olculmedi" → "engelledigine dair kanit yok" seklinde,
  ama bu "engellemedigi kanitlanmistir" ANLAMINA GELMEZ.
- Dort kalemin UCUNDE (dort spec, ADR-014, forceExit) sayisal kapanis olcutu YOK; sure riski tek istisna
  (§1.3'teki butce esigi).
- Dort kalemin HICBIRINDE adlandirilmis sorumlu YOK; hepsi owner bağlama karari BEKLIYOR.

**Owner icin somut secim (bu belge dayatmaz):**

| Kalem | Secenek (a): simdi kapat | Secenek (b): olcum iste | Secenek (c): ayri GO-FIX ac |
|---|---|---|---|
| 4 acik spec | "Urun etkisi yok" diye KABUL ET, backlog'a indir | MinIO/skip/sira-bagimliligi icin urun etkisi olcumu ISTE | Her spec icin ayri dar onarim GO'su ac (MinIO servisi/describe kapisi, `it.todo`, kosullu skip, sira onculu bulma) |
| ADR-014 | "Yerel gölge-kanit koşucusu, canli etkisi yok" diye KABUL ET | Eksik global modul LISTESININ TAMAMLANMASINI ISTE, sonra karar | Eksik moduller icin ayri GO-FIX ac |
| forceExit | "Resmi runner zaten `--forceExit` kullaniyor, CI etkilenmiyor" diye KABUL ET | Tam manifestte acik-handle taramasi ISTE (tek dosyada 0 cikmisti — genis tarama farkli sonuc verebilir) | Genis tani + kok neden GO'su ac |

Bu belge hicbirini owner ADINA secmez veya erteleme/risk kabulu URETMEZ — yalniz secenekleri somutlastirir.

## 7. DUZELTME VE TAMAMLAMA (2026-09-26; owner GO "ADR-014 onarimini tamamla ve karar paketindeki kanit bosluklarini gider")

> Bu bolum §1.2, §4, §5 ve §6'yi kaynaklara geri donerek DUZELTIR. Hicbir sayac ilerletilmedi: hizmet kabulu
> **0/8**; B1-B10'un HICBIRI icin owner karari bulunamadi (hepsi ACIK). Yeniden olcum yapilmadi.

### 7.1 §1.2 ve §4'teki iki hata

1. **"15/18, 16/18 ..." hizmetin kendi esigi DEGIL.** Bunlar CLIENT'in program capindaki TEKNIK SAYACIDIR: 18
   İ-kilometre tasindan kacinin canli kapandigi (`decision-log.md` İ13 satiri: "sayac 15/18 (hizmet kabulu 0/8)";
   İ12 satirinda sayac 14/18; İ16 ile 18/18). "Her hizmet kendi olculen esigiyle, farkli payda ile kapandi" ifadesi
   YANLISTIR. Dogrusu: her hizmetin İ kapanisi **kendi olcut setinde FAIL 0, OLCULEMEYEN 0** ile gecti (asagida 7.2).
2. **"Hicbir canli somut eksik RAPORLANMADI" (§4 giris) EKSIKTIR:** H7'de K-A (portal production'da API'ye
   ulasamiyordu; R26 ile canlida giderildi, basarili canli portal girisi olculdu — `decision-log.md` 2026-09-21/22) ve
   H8'de "kilit <= 4 sn" ifade kusuru + Kusur B (ifade 2026-09-22 owner onayiyla duzeltildi; Kusur B betikte giderildi)
   RAPORLANMIS ve GIDERILMIS eksiklerdir. Dogru ifade: "bugun ACIK bilinen canli eksik yok; raporlanan eksikler giderildi".

### 7.2 Yedi hizmet — olcut, gecen, kalan (mevcut kayitlardan; yeniden olcum YOK)

| H | Ad | İ / runId | Kabul olcutu | Gecen | Kalan / canli olculmeyen | Kalan kabulu engeller mi (kayittaki hukum) |
|---|---|---|---|---|---|---|
| H1 | Kimlik | İ9 `d19ce2c7` | Bes gozlem PASS; gercek tenant'ta yalniz GET | 14 PASS, 7/7 olcut | Madde kalmadi. Acik bulgu B-2: lifecycle ret govdesinde stabil kod yok | Belge "ACIK, BLOKE ETMEZ, urun isi acilmaz" der — **belgenin hukmu, owner karari bulunamadi** |
| H2 | Adres ve iletisim | İ13 `8811f395` | H2-01..H2-10 + I13-00/CLOSE/ISO | 13/13 | Madde kalmadi. H2-10 (iletisim kisileri icin ayri CRUD yok) KB-03(a) ONERISIYLE olculdu | **KB-03 icin owner karari bulunamadi** |
| H3 | Vekalet | İ10 `c9b07bcb` | A-1..A-4 + K9; yetkisiz yazim 0 | 10/10, bulgu 0 | Yok (not: §4 metni H3 runId'sini vermiyordu — `c9b07bcb`) | — |
| H4 | Talimat/beyan/riza/KVKK | İ14 `e28c5c06` | I14-00 + H4-01..H4-08 + CLOSE + ISO | 14/14 | H4-08 canlida yeniden kosulmadi, İ12 G3/G5'e baglandi; "gercek yayin olgusu" ayagi İ12'de yalniz test sink'iyle olculdu | **Kayitta gerekce YOK** |
| H6 | Gonderim | İ12 `92d04ef3` | G1-G7 yedi gozlem | 17/17; bagimsiz 10/10; NOREALSEND 12/12 | CLAIM/RECLAIM/HANG yalniz disposable; loopback engellenmedi, KOSULA baglandi | Owner karari "yalniz kaydet" — kabulu engellemedigi KAYITLI |
| H7 | Portal | İ16 `6b883b16` | I16-00 + H7-00..04 + H7-05a + H7-06..08 + CLOSE + ISO | 12/12 | H7-05b, K-1 matrisi, PSUS probu yalniz disposable ("canli PASS sayilmaz"); dis (HTTPS) erisim ACILMADI | **Kayitta gerekce YOK** |
| H8 | Muhasebe kayit kapanisi | İ15 `1b83637a` | KABUL-5 PASS + kalan yedi icin secilen kanit yontemi kayitli ve uygulanmis | 5/5; yedi senaryo 10/10 (ayri PG) | Canli yaris testi DEGIL; KABUL-C dolayli kanit; 3 eski gercek kayit icin geriye donuk yazim YOK | Yontem owner kararina dayanir (`decision-log.md` 2026-09-18 CLIENT-I4-I5) |

**Owner'in bakmasi gereken uc bosluk:** H4-08 gercek yayin ayagi, H7 canli olculmeyen H7-05b/K-1/PSUS ve dis erisim,
H2-10/KB-03 — bu uc kalemde "kabulu engellemez" hukmu kayitta YOK; §4 onay metni bunlari ORTUK kabul ettirir.
Onay metni kullanilacaksa bu uc kalem ya acikca "kabul disi/sonra" diye yazilmali ya da owner ayrica karar vermeli.

### 7.3 B1-B3, B5, B7-B9 — kaynaklardan (hepsi ACIK, owner karari bulunamadi)

- **B1 AK-1b (cross-office):** Plan §8.5 onerisi tek cumle: aktorun kendi `officeId`'si varsayilan kapsam olsun
  (istisna/sira yok). Kod: `office-f01-authorization.guard.ts` `isF01ActorAuthorized(userId, tenantId)`'i
  `targetOfficeId` OLMADAN cagirir → `office-approval.service.ts:535` cross-office kontrolu rota kapisinda HIC calismaz.
  (a) secilirse hangi rotalarin kapsama girecegi kaynakta TANIMSIZ — once rota listesi gerekir. Etki: baska ofise bagli
  PARTNER/MANAGER/delege avukat (cok ofisli tenant disinda pratik etki yok — hipotez).
- **B2 AK-1c:** Cross-office kontrolu (`:535`) ADMIN kisa-yolundan (`:539`) ONCE; davranis karakterizasyon testiyle
  kilitli. Kaynakta alternatif sira ONERILMEMIS; tek mantikli alternatif (ADMIN'i one almak) baska ofise bagli ADMIN'i
  gecirir. Etki: yalniz baska ofise bagli avukat kaydi olan ADMIN.
- **B3:** Tablodaki (b) "create'i devre disi birak" YANLIS ifade. R1A create'i kapatmaz; pasif kaydin create yoluyla
  yeniden etkinlesmesini lifecycle yetkisine baglar. Kod: ayricalikli pasif kayit icin `assertCanReactivatePrivilegedLawyer`
  var; **ayricaliksiz pasif kayit YETKI KONTROLU OLMADAN** kosullu `updateMany` + `LAWYER_REACTIVATE` audit ile etkinlesir
  (`lawyer.service.ts:300-349`; eslesme ad-soyad/baro no/TCKN). Giris: `POST /lawyers`, `POST /cases` satir ici avukat, seed.
- **B5:** (b) yalniz dugmeyi gizler; onay kutusu liste/detay gorunurlugu backend'de rol elemez. Web
  `OfficeApprovalDecisionActions.tsx` dugmeleri talep sahibi olmayan herkese gosterir (FD talepleri haric).
- **B7:** OWN-13 D01-D04 owner onayli (D03 = seed acikken en az JwtAuthGuard). Kalan risk ACIK. **"Canlida KAPALI"
  iddiasinin OLCUMU bulunamadi**; kapi `seed-runtime-gate.ts` = `NODE_ENV=production` VEYA `CLIENT_SEED_ENDPOINTS_ENABLED`
  bayragi. Canli NODE_ENV degeri kayitta okunmamis → kapalilik bir HIPOTEZ; salt-okuma olcumu gerekir.
- **B8:** Olcum 2026-09-11 `hukuk_db` salt-okuma: bekleyen 0, talep 2/2 APPROVED (`RELEASE22-ADAY-HAZIRLIK-R01.md`).
  Yeni aday #2608/#2612 ile yapisal olarak kapali; olcum R26/P1 ONCESI → guncelligi hipotez. (b) icin kaynakta kod onerisi YOK.
- **B9:** "0 dosya" ve tasfiye recetesi yalniz yerel ajan bellegine dayanir (2026-09-10); repoda recete kaydi YOK. Olcum
  16 gun once, C:→D: tasimalarindan ONCE → yolun guncelligi hipotez. Dosya sistemine dokunulmadi.

### 7.4 B4, B6, B10 — gercek kapsam (kod yolu izlendi; "istismar gosterilmedi" guvenlik kaniti SAYILMADI)

**Rol modeli:** VIEWER tenant duzeyinde giris rolu (`UserRole {ADMIN, USER, VIEWER}`, `User.role`); `req.user` her istekte
DB'den okunur. Uygulama genelinde rol guard'i YOK; VIEWER yalniz OFFICE yazma guard'inda, onay KARAR metodlarinda,
FD kararinda ve CLIENT politikalarinda elenir.

- **B4 — VIEWER yurutme/kurtarma:** `isApproverEligible` (`office-approval.service.ts:476-490`) rol OKUMAZ: aktif + ayni
  tenant + staff degil + bagli avukat PARTNER veya `canApproveOfficeActions`. Dolayisiyla **PARTNER/delege avukata bagli bir
  VIEWER** su onayli kayitlari YURUTEBILIR (tek guard `JwtAuthGuard`): payout finalize (`clientPayout.create` + yevmiye),
  dagitim post (`balanceLedger.create` + POSTED), FD publish/retry/reverse/supersede (e-posta), ve karari veren kisi sonradan
  VIEWER'a dusurulmusse FD kayitli-karar kurtarma. Duz VIEWER (baglanti yok) bu kapilara TAKILIR. Ayni desende rol okumayan
  baska yazma uclari: mahsup uygula/geri al, manuel ters kayit kapatma, ucret sozlesmesi, dagitim recommend/FD taslagi
  (`isPrepareEligible` her avukata acik), masraf approve/finalize (CPE), payout request (finansal etki yok).
  **En kucuk duzeltme:** tek ortak nokta YOK — `isApproverEligible`'a rol eklemek 23 cagri yerini (inbox gorunurlugu dahil)
  degistirir = politika genislemesi. Dar yol: uc yurutme yuklemi — `PayoutApprovalPolicy.assertEligible`, FD
  `isDisclosureApproverEligible` (+select'e `role`), dagitim post oncesi `assertApprovalDecisionRole`; ~4 dosya + test; emsal
  `office-write-role.policy.ts`, `office-approval-viewer-decision-boundary.spec.ts`. Canlida VIEWER+PARTNER/delege eslesmesi
  OLCULMEDI (etki buyuklugu hipotez).
- **B6 — `POST /cases`:** rol yalniz satir ici YENI avukat (AK-1a, `case.service.ts:581-583`) ve satir ici yeni muvekkil (D01)
  yollarinda okunur. **Mevcut muvekkil/avukat id'leriyle gelen VIEWER istegi dosya ACAR** (dogrulandi). Ayni acik:
  `POST /cases/:caseId/debtors(/bulk)`, `/notes`, `/lawyers`, `/staff`, `/dues`, `/collections`, `PUT/PATCH /cases/:id`
  (yalniz `DELETE /cases/:id` ve legal-responsible-lawyer rol okur). **En kucuk duzeltme:** `CaseService.create()` basinda
  (userId kontrolunden sonra) rol reddi — tek cagiran, 1 dosya + test; CASE'e ozgu ret kodu (OFFICE kodunu yeniden kullanmak
  anlam kaydirir). Alt uclarin ayni pakete girmesi ayri urun karari.
- **B10 — kontrol→yazma yarisi:** 21/21 olcumu yalniz `isApproverEligible` cagri yerlerini sayar; **payout finalize
  (`PayoutApprovalPolicy`) ve FD `assertEligibleActor` bu 21'in DISINDADIR.** `User.role`'u degistiren HTTP yolu yok; yetki
  geri alma yollari `PUT/PATCH /lawyers/:id` (`canApproveOfficeActions=false` / rutbe) ve `DELETE /lawyers/:id`
  (`User.isActive=false`). **Somut senaryo (dagitim post):** T0 `disposition-posting.service.ts:218` transaction DISINDA
  `isApproverEligible` → true; T1 baska istek `PATCH /lawyers/:id {canApproveOfficeActions:false}` commit eder; T2 `:262`
  transaction'i acilir, `balanceLedger.create` + POSTED — yetki YENIDEN OKUNMAZ, **yazma gecer**. Pencere 4-5 DB gidis-donusu.
  Daha genis pencereler: payout finalize'da kontrol ile yazma arasinda `pg_advisory_xact_lock` beklemesi (sinirsiz);
  FD publish'te kontrol tx icinde ama commit SONRASI dis e-posta cagrisi ve ardindan PUBLISHED gecisi YENIDEN KONTROLSUZ.
  Tx icinde olmak da yetmez: READ COMMITTED + kilitsiz okuma. **Etki finansal:** yetkisi alinan kullanici zaten APPROVED
  kaydi kesinlestirebilir (yeni onay URETEMEZ). **Duzeltme secenekleri:** CLIENT R1A kosullu-`updateMany` bu kapilara DOGRUDAN
  UYMAZ (yetki baska tabloda); en az degisiklik: yetki okumasini tx icine alip `User`/`Lawyer` satirlarini `FOR SHARE` ile
  kilitlemek (tek yardimci + 3 yurutme noktasi; emsal `disposition-posting.service.ts` `FOR NO KEY UPDATE`); alternatifler
  serializable (retry gerekir) veya advisory lock (geri alma yollari da almali). Pencere sureleri OLCULMEDI.

### 7.5 §6 guncellemesi

- **ADR-014:** muhendislik tarafi #2809'da (merge'e bagli): DI koku (4 global), read-only options kacisi, ve surecin
  dogal cikisi (`ActionHandlerService` ref'li `setInterval` → `onApplicationBootstrap`/`onModuleDestroy`). §6'daki ADR-014
  satirinin (a)/(b)/(c) secimi merge sonrasi gecersizlesir. Uc sentetik `DISCREPANCY` runner kusuru degil (product-backlog
  "ADR-014 RUNNER DI_FAIL ONARIMI" kaydi): canonical elle hesapla esit; farklar legacy tasarim eksigi + fikstur kaynakli.
- **forceExit:** ACIK, owner karari bekler. Bu calismada genel jest/forceExit arastirmasi YAPILMADI; runner'da bulunan tutucu
  (ActionHandlerService araligi) jest acik-handle'larinin nedeni OLDUGU iddia EDILMEZ (olculmedi).

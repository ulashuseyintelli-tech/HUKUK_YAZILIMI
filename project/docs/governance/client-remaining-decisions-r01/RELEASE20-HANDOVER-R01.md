# RELEASE20 — TEK YAYIN DEVRI (CLIENT hatti → Office/C33)

```text
BELGE           : RELEASE20-HANDOVER-R01
URETEN          : CLIENT hatti (owner GO 2026-09-06; Faz 3'te uretildi, kalan uygulama sonrasi TAZELENDI)
YAYIN SAHIBI    : Office/C33 — motor, muhur, nonce ve owner-command O HATTA KALIR
OLCUM ANI       : 2026-09-06, yerel salt-okuma (production yazmasi 0)
DURUM           : DEVIR HAZIR — canli gecis onayi ISTENMEDI (owner ayrica verecek)
KAYNAK COMMIT   : 6dd25b31d2e9879236eda1ed3d3ec7eb74745d41
```

> **ATIF KURALI (duzeltme, PR #2536):** bu belgede bir islev icin verilen PR numarasi, o islevi
> UYGULAYAN **kod PR'idir**. Kayit/governance PR'lari ayrica belirtilir. Onceki surumde gonderim
> durumu ve OWN-12 tamamlamasi icin sehven **kayit PR'i #2531** yazilmisti; dogrusu **kod PR'i
> #2530**'dur (#2531 yalniz bu belgeyi ve kayitlari tasir).
>
> Bu belge, CLIENT hattinin **nihai** teslim durumunu Office/C33 yayin hattina devreder.
> Onceki `RELEASE-RECONCILIATION-R01.md` tarihsel kayit olarak kalir; **baglayici paket
> kimligi, kapsami, rollback bedeli ve kabul plani BURADADIR.**

---

## 1. Canli durum (yerel salt-okuma olcum, 2026-09-06)

| Konu | Deger |
|---|---|
| Canli surum | **RELEASE19** `a60d772b` |
| Canli API | pid 36544, `:::8080`, `HY_W4_RELEASE19\project\apps\api\dist\...` |
| Canli Web | pid 36764, `:::3002`, `HY_W4_RELEASE19\project\apps\web\node_modules\...` |
| RELEASE18 | dizin **mevcut** (eski rollback hedefi) |
| RELEASE20 | dizin **YOK** — paket henuz uretilmedi |
| Migration | repo **129 dizin** = RELEASE19 **129 dizin**; `diff -r` ile icerik **birebir ayni** → **migration adimi YOK** |

RELEASE19 **SUPERSEDED ILAN EDILMEMISTIR**: calisan surumdur ve bu paketin **rollback hedefidir**.

---

## 2. Paket kapsami — canlida OLMAYAN commit'ler (`a60d772b` → `6dd25b31`)

| # | Squash SHA | PR | Icerik | Sinif |
|---|---|---|---|---|
| 1 | `1a626e79` | #2515 | fix(scheduler): manuel tetiklemede dogrulanmis aktor + tenant kapsami (F02) | **kod** |
| 2 | `2a9c3c33` | #2516 | fix(scheduler): manuel/global cron cakismasinda is kaybini kapat (F02 tamamlayici) | **kod** |
| 3 | `a401d64e` | #2517 | fix(poa): OWN-13 I02-R4/R5/R6 kapanis uzlastirmasi + legacy POA upload servis-giris kapisi | **kod** |
| 4 | `93ceeedb` | #2518 | docs(governance): OWN-13 sinirli terminal kapanis — CLOSED (owner ratified) + uzlastirma duzeltmeleri | docs |
| 5 | `eb4a61f8` | #2519 | docs(governance): CLIENT kalan kararlar tek paket R01 — OWN-10/12/15, POA politikasi, filePath, MR-063, RELEASE20 kapsami | docs |
| 6 | `655a5dff` | #2520 | fix(client,poa): Faz 1 — POA yazma yetkisi, bilgi talebi yetkisi, kimlik sikilastirmasi (D-1b/D-3a/D-4/D-5/D-10) | **kod** |
| 7 | `1ea32e6e` | #2521 | feat(client): Yol1 — bilgi talebine intake baglantisi (D-3 b) | **kod** |
| 8 | `48ab1eb1` | #2522 | refactor(web): OWN-12 adim A (dar) + adim B — kanonik hata sozlesmesi ve cevap cozumleyici | **kod** |
| 9 | `c32cc73a` | #2523 | docs(governance): yayin uzlastirmasi — RELEASE19 canli gercegi ve sonraki paket girdisi | docs |
| 10 | `7c0f8575` | #2524 | docs(governance): F-B01-03 dar canli GET kabulu kaydi | docs |
| 11 | `6f6170b8` | #2525 | fix(client): intake token sizintisi, lifecycle aktivasyon yarisi ve gonderim hata yolu (Faz 1) | **kod** |
| 12 | `bc6f860d` | #2526 | docs(governance): maintenance-register MR-065/MR-066 mukerrer satir temizligi | docs |
| 13 | `35ea83d1` | #2527 | docs(governance): OFFICE kayit uzlastirmasi — RELEASE18 -> RELEASE19 devri + F06 isaretcisi | docs |
| 14 | `506927e9` | #2528 | feat(client): OWN-12 ortak tasima/kilit/alan modeli + Yol1 arayuz secenegi (Faz 2) | **kod** |
| 15 | `8338c4e6` | #2529 | docs(governance): Faz 3 — temizlik kapanisi, kayit duzeltmeleri ve RELEASE20 devri | docs |
| 16 | `815fcf96` | #2530 | fix(client): gonderim durumu dogrulanmis sonuca baglandi + OWN-12 ortak model tuketimi | **kod** |
| 17 | `83b56bdd` | #2531 | docs(governance): RELEASE20 devir tazelemesi + migration sayimi duzeltmesi | docs |
| 18 | `a810418d` | #2532 | docs(governance): OFFICE-SC-F05 tek mail teslimat kaydi (F05-5b VERIFIED) | docs |
| 19 | `3db25358` | #2533 | docs(governance): OFFICE-SC-F05 workstream kapanisi — CLOSED / VERIFIED | docs |
| 20 | `3ac49083` | #2535 | fix(office): escAssignees residual — S2 turevi sayac HTTP okuma yuzeyinden kaldirildi | **kod** |
| 21 | `6dd25b31` | #2534 | fix(notification,client): saglayici gonderim sonucunun KESINLIGI talep servisine tasindi | **kod** |

**Kod (urun) commit'i: 11 · docs commit'i: 10 · toplam: 21.**

### 2.1 Paket etkisi (olculdu)

| Olcum | Deger |
|---|---|
| Migration | **0 yeni migration** — repo 129 dizin = RELEASE19 129 dizin, icerik `diff -r` ile birebir ayni. **DUZELTME:** onceki surumdeki "127" HATALIYDI (sayim filtresi `00000000000000_baseline` ve `00000000000001_legal_kernel_triggers` dizinlerini atliyordu). Sayim repository DIZIN sayimidir; canli DB ledger olcumu DEGILDIR ve onun yerine kullanilmaz |
| Sema degisikligi | **0** |
| Yeni env anahtari | **0** (RELEASE19 `.env` bayt-es kopyalanir) |
| Lockfile degisikligi | **0** |
| Veri degisikligi | **0** — bu paket hicbir mevcut kaydi degistirmez |
| CI workflow degisikligi | **0** (`ci-manifests/` degisti; `ci.yml` DEGISMEDI) |

### 2.2 Modul disi etki

- **OFFICE:** paket OFFICE yuzeyine dokunmaz. F-B01-03 zaten canlidadir (RELEASE19).
- **COLLECTION/ACCOUNTING:** F04 kodu zaten canlidadir (RELEASE19); pakette yalniz F04 birim
  spec'inin CI manifest bagi vardir (kod degil).
- **SCHEDULER:** F02 iki duzeltmesi bu pakettedir (canlida DEGIL).
- **CLIENT/POA:** yazma yetkisi **daralir**; kabul plani §5'te dogrulanir.

---

## 3. Rollback

| Konu | Deger |
|---|---|
| Rollback hedefi | **RELEASE19** (`a60d772b`) — dogrulanmis calisan surum; RELEASE18 DEGIL |
| Yontem | Office/C33 cutover motorunun kendi geri alma yolu (bin degisimi geri) |
| DB geri alma | **YOK** (migration 0, veri degisikligi 0) |
| Env geri alma | **YOK** (yeni anahtar 0) |

### 3.1 Rollback bedeli — ACIK VE EKSIKSIZ

**RELEASE19'a donus, bu paketteki TUM yetki ve guvenlik duzeltmelerini GERI ALIR.** Bunlarin
hicbiri RELEASE19'da YOKTUR:

1. F02 — manuel scheduler tetiklemesinde dogrulanmis aktor ve tenant kapsami
2. F02 — manuel/global cron cakismasinda is kaybi (WAIT kuyrugu)
3. OWN-13 R6 — legacy `POST /poa/:id/upload` servis-giris yetki kapisi
4. Faz 1 (D-4/D-5/D-1b/D-3a) — POA yazma yetkisi, legacy upload yanitindan `filePath` cikarilmasi,
   kimlik checksum sikilastirmasi, bilgi talebi gonderim yetkisi
5. **Intake token sizintisi duzeltmesi** — geri alinirsa kullanilabilir token yeniden uygulama
   veritabanina ve API yanitlarina yazilir
6. **Lifecycle aktivasyon yarisi duzeltmesi** — geri alinirsa gecikmis istek pasiflestirmeyi
   sessizce geri alabilir
7. **Gonderim DURUMU duzeltmesi (kod PR #2530; kayit PR #2531)** — geri alinirsa talep satiri yine saglayicidan ONCE
   `SENT` yazilir; basarisiz veya dogrulanamayan gonderim kalici kayitta ve liste/detay ekraninda
   **basarili gorunur**, "gonderilmis talebe hatirlatma" yolu bu yanlis satir uzerinden acilir
8. **Belirsiz gonderim ayrimi (kod PR #2530; kayit PR #2531)** — geri alinirsa saglayici istisnasi ile
   kesin basarisizlik AYNI muamele gorur ve kullaniciya kesinlik iddia edilir
9. **Saglayici sonucunun KESINLIGI (kod PR #2534)** — geri alinirsa `EmailResult.deliveryOutcome`
   kaybolur; gercek SMTP/SendGrid/SES yollari istisnalari yakalayip `success:false` dondurdugu icin
   **timeout ile kalici ret ayni sayilir**: iletilmis olabilecek gonderim kullaniciya "gonderilemedi"
   diye bildirilir ve kullanici tekrar gonderir (MUKERRER e-posta). Ayrica `SESClient` varsayilan
   3 denemeye doner ve tasima katmaninda KOR TEKRAR GONDERIM yeniden mumkun olur
9. Yol1 ve OWN-12 web katmani (`api.ts` hata yollarinin govde/durum kodu tasimasi dahil)

> **"Guvenlik gerilemesi yoktur" DENEMEZ.** Rollback bu kapilari kaldirir ve sistem, kapatilan
> kusurlarin bulundugu duruma doner. F-B01-03 ve F04 RELEASE19'da mevcut oldugu icin **onlar**
> rollback'ten etkilenmez; rollback karari bu iki grubun **ayrimi yapilarak** verilir.

---

## 4. Devir kosullari

1. **Yayin sahibi Office/C33'tur.** Motor, muhur, nonce ve owner-command o hatta kalir; CLIENT
   hatti cutover CALISTIRMAZ.
2. **Iki sayfa ayni ortama es zamanli deployment YAPMAZ.**
3. Paket, **kod bakimindan nihai** kaynak `6dd25b31d2e9879236eda1ed3d3ec7eb74745d41` uzerinden uretilir.
   Bu belgeyi ekleyen docs commit'i (ve Office hattinin docs commit'leri) `apps/` altinda **hicbir dosyaya
   dokunmaz**; paket icerigini DEGISTIRMEZ. Cutover aninda taze main dogrulanir; kod farki cikarsa bu belge
   yeniden olculur.
4. **Canli gecis onayi ISTENMEMISTIR.** Mevcut yayin yetkisi RELEASE19 icindi ve RELEASE20'yi
   KAPSAMAZ; onay ancak paket kimligi (aday worktree + muhur + makbuz) somutlastiktan sonra ve
   YALNIZ o pakete bagli olarak istenir.

---

## 5. Sinirli canli kabul plani (cutover SONRASI, owner GO ile)

**D-8 kurali:** yazma potansiyeli olan **her** adim — "401/403 bekleniyor" denen POST/PUT/DELETE
cagrilari **dahil** — yalnizca **sentetik oldugu dogrulanmis** tenant/kayitlarda yapilir.
Gercek tenant'ta **yalnizca GET** vardir.

### 5.1 Gercek tenant (`telli-hukuk`) — SALT-OKUMA, yazma YOK

| # | Olcum | Beklenen |
|---|---|---|
| R-1 | Canli bin sha'lari = RELEASE20 generation; RELEASE19 kopyalari rollback icin mevcut | esit |
| R-2 | API/Web gorevleri Running; tek surec zinciri; altyapi portlari loopback | esit |
| R-3 | DB migration/tenant/user sayimlari cutover oncesi = sonrasi | esit |
| R-4 | Web BUILD_ID = RELEASE20 build kimligi; `GET /auth/login` 200 | esit |
| R-5 | dist marker: `client-info-request.service.js` icinde redaksiyon yardimcisi; `client.service.js` icinde lifecycle gecis kontrolu | mevcut |

> Anonim "401 bekleniyor" POST denemeleri bu tabloda **YOKTUR** — 401 beklentisi bir cagriyi
> salt-okuma yapmaz. Onlar §5.2'ye tasinmistir.

### 5.2 Sentetik tenant (`demo-firma`) — yazma potansiyeli olan adimlar

E-posta gonderen adimlarda **test saglayicisi** kullanilir. **Gercek aliciya e-posta GONDERILMEZ.**
Disposable ortamda kosulan hicbir test "production'da kosuldu" gibi SUNULMAZ.

| # | Adim | Beklenen | Not |
|---|---|---|---|
| A-0 | Anonim (token YOK): `POST /poa`, `POST /address-discovery/client-info-request`, manuel scheduler uclari | 401; kayit OLUSMAZ | yazma ucu |
| A-1 | VIEWER ile `POST /poa` | 403; vekalet OLUSMAZ | yazma denemesi |
| A-2 | Elevated olmayan USER ile `PUT /poa/:id` | 403 | yazma denemesi |
| A-3 | Yetkili aktor ile `POST /poa` | 201; kayit OLUSUR | pozitif yol |
| A-4 | Legacy `POST /poa/:id/upload` yetkisiz aktorle | 403; dosya YAZILMAZ | R6 kapisi |
| A-5 | Bilgi talebi gonderimi (test saglayicisi) | 201; DB'deki `emailBody` ham token/URL TASIMAZ | Faz 1 sizinti kapisi |
| A-6 | Ayni talep `attachIntakeLink` ile | saglayiciya giden metin baglanti TASIR; kalici govde TASIMAZ | Yol1 |
| A-7 | Pasif kaydi gecersiz kimlikle reaktive etme | 400 `CLIENT_IDENTITY_CHECKSUM_INVALID` | D-1b |
| A-8 | Ayni degerle `isActive:true` tekrar gonderimi | 200; lifecycle alanina YAZILMAZ | yaris duzeltmesi |
| A-9 | Bilgi talebi gonderimi TEST saglayicisi BASARISIZ dondurulerek | 503; **talep kaydi OLUSMAZ**, listede gorunmez | gonderim durumu |
| A-10 | Ayni gonderim, TEST saglayicisi YANIT VERMEYECEK sekilde (timeout) | 503 `..._EMAIL_INDETERMINATE`; kayit OLUSMAZ; saglayiciya **ikinci cagri YOK** | kesinlik ayrimi |

> **A-8 ve lifecycle yarisi:** yarisin kendisi (bariyer sirali eszamanli istek) canlida
> **kurulmaz**; regresyon kilidi disposable PostgreSQL uzerinde kosulan DB testidir. Canlida
> yalniz gozlenebilir sonuc dogrulanir.

---

## 6. Bu paketin ACIK kalemleri (yayin engelleyici DEGIL)

| Kalem | Durum |
|---|---|
| OWN-12 adim C — ortak cekirdek modelin uc formda tuketimi | **KAPANDI** (kod PR #2530; statik kullanim guard'i ile kilitli) |
| `api.ts` FormData/blob hata yollari | **KAPANDI** (kod PR #2530; mesaj metinleri korundu, govde/durum kodu artik tasiniyor) |
| Saglayici sonucunun kesinligi (timeout ≠ kesin ret) | **KAPANDI** (kod PR #2534; gercek saglayici katmanindan gecen regresyon) |
| `ClientModal`'in iletisim/adres DIZI yuzeyi ve `type` genisligi | ACIK degil — **BILEREK baglama ozgu**; sahte ortaklik iddia edilmedi |
| OWN-10 — yedi pasif kaydin kimlik duzeltmesi | ACIK; **veri DEGISTIRILMEDI**, guvenilir kaynak gerekir (urun akisi) |
| OWN-15 — intel statement create politikasi | **KAPSAM DISI** (onceki owner karari) — uygulama engeli DEGILDIR |
| OFFICE O-1..O-10 canli kabul, F04 canli yaris kabulu | Office/C33 kapsaminda ACIK |

---

## 7. Sinirlar

Bu belge **olcum ve devirdir**; cutover CALISTIRMAZ. Yapilmayanlar: production yazmasi, servis
durdurma/baslatma, `.env` okuma/yazma, gercek aliciya e-posta, RELEASE19'un SUPERSEDED ilani,
Office paketine mudahale, canli gecis onayinin istenmesi. Olcumler yerel salt-okuma; PII cikti YOK.

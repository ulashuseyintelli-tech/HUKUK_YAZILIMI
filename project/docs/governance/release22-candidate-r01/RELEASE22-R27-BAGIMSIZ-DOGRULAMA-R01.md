# RELEASE22 / R27 — ANA YURUTUCU BAGIMSIZ DOGRULAMASI (R01)

```text
BELGE    : RELEASE22-R27-BAGIMSIZ-DOGRULAMA-R01
KARAR    : OWNER KARARI 2026-09-11 "TEK YAYIN HATTI: RELEASE22" — aday 137406701248858221d12be94a941f8837a2a245
KONU     : R27 cutover paketi HY_C33_RELEASE22_CUTOVER_R27 (repo disi) ve kaydi RELEASE22-R27-CUTOVER-PAKETI-R01.md (#2615 9840577d)
YURUTUCU : ana yurutucu (PAGE-O0). R27'yi OFFICE 33 uretti; ana yurutucu ikinci paket veya ikinci kayit URETMEDI (tek yazici)
YETKI    : bu belge muhur, authority etkinlestirme veya cutover yetkisi DEGILDIR
```

Ana yurutucu ayni owner kararini aldi. Paket ve inceleme kaydi OFFICE 33 tarafindan uretildigi icin bu belge yalniz **bagimsiz
dogrulamadir**: R27 paketini ve `RELEASE22-R27-CUTOVER-PAKETI-R01.md` iddialarini ayri yoldan olcer. Olcumler 2026-09-11'de
salt-okuma yapildi: R27 ve R26 paket dizinlerine yazma 0; canli yalniz okundu (dinleyici/PID/komut satiri koku, bin hash,
`.env` anahtar ADI sayisi).

| Kontrol | Yontem | Sonuc |
|---|---|---|
| Paket kimligi `DBE6B8E5…` | `PACKAGE-IDENTITY.json` listesinden VE disk taramasindan (ayni dislama kurallari) ayri ayri yeniden hesap | ikisi de ESIT · 48 dosya · eksik/fazla/degisen 0 · `PACKAGE-IDENTITY.json` sha `56ACAC43…` · muhur/durum dizini ve `MANIFEST.json` YOK (muhursuz); kapanista tekrarlandi, degismedi |
| Fork dogrulugu | ayni R25 VERIFY_REPAIR kaynagi + ayni pinlerle BAGIMSIZ ikinci fork (paket DEGIL; gecici dizin) ile dosya dosya karsilastirma | 32 dosyanin 25'i BAYT-AYNI (tum nesil dosyalari, preflight, NC kosucusu, fiksturler) · 38 fark satiri yalniz R27 kaydi §4'teki paket kimligi sikilastirmasi (P-04, V-03/V-04d, OWNER-COMMAND, NC-09d/e, OC-09b/c/d) ve etiket metinleri · S-04c/V-02l soy kapisi iki forkta da R25 ile AYNI |
| S-06 / S-08b / S-08c | ana yurutucunun kendi kosucusu: paketin `tools/Seal-Package.ps1` metninden bloklar AYNEN (satir 204–215 ve 240–247), Step/Refuse kaydedici; cikti paket DISINDA | **CALISTIRILMIS KAPI: PASS / PASS / PASS** (canli host `1397C54C…`, API pid 50716, Web pid 22440). Muhur kosumu DEGILDIR; resmi Seal NOT_EXECUTED |
| RELEASE21 geri donus koku | `HY_C33_RELEASE21_CANDIDATE` PowerShell dogrulayicisi (salt-okuma, 62 s) | P-031 **88.132 dosya defterle birebir** (uyusmaz 0, okunamayan 0) · P-041/042/043 · P-050…053 (candidateDigest `569DDCE4…` yeniden turetildi) · dusen 4 kapi: 3 git (SYSTEM sahipli kok, `dubious ownership`; `safe.directory` YAZILMADI) + P-040 canli `.env` |
| Katman 1 paketleri | makbuz algoritmasiyla yeniden hesap | RELEASE22 `F0156AC1…` (makbuz `8D78B176…`) ve RELEASE21 `851C07DF…` ESIT |
| Kapsam <-> paket | 11 runtime kaynak dosyasi: aday commit'teki git blob, release kokundeki dosya ve Katman 1 defteri; derlenmis dist dosyasi ve defter | kaynak 11/11 ESIT · dist 11/11 defterle ESIT (9 degisen, 1 yeni `office-write-role.policy.js`, `create-lawyer.dto.js` bayt-ayni) · defter sha = makbuz `ledgerHash` |
| R26 | `PACKAGE-IDENTITY.json` listesinden kimlik yeniden hesabi + disk karsilastirmasi | `C319DE15…` ESIT, sapma 0 — R26 DEGISMEDI; kapanista tekrarlandi |

**Paket numarasi:** R27'yi OFFICE 33 envanterden belirledi. Ana yurutucunun bagimsiz envanteri ayni sonucu verdi: `HY_*`
dizinlerinde R01..R26 kullanilmis, R27 yalniz bu paket; governance'taki tek "R27" gecisi
`office-p8-final-r01/p8-final-certification-r01.md` icinde C22 DOGFOOD satir etiketi (C33 disi ad alani).

**Kayit bulgusu:** `RELEASE22-R27-CUTOVER-PAKETI-R01.md` satir 7'de paket kokunun ters bolulari dusmustu; duzeltme dosya
sahibinin (OFFICE 33) ayri takip PR'indadir. Paket icindeki inceleme belgesi ve paket kimligi bundan ETKILENMEDI.

Olcum araclari ve ciktilari ana yurutucu oturumunun gecici calisma dizinindedir (repo ve paket disi).

## Ek B — Tek yurutme paketi bagimsiz dogrulamasi (owner GO 2026-09-11 "R27 SON YURUTME HAZIRLIGI")

```text
KONU     : RELEASE22-R27-YURUTME-PAKETI-R01.md — #2619 5334c8c6 + #2621 96dff542 (yazici OFFICE 33)
YURUTUCU : ana yurutucu, bagimsiz dogrulama. Ayni yola yazan #2618 CLOSED_SUPERSEDED (tek yazici); yazicinin dosyasina YAZILMADI
YETKI    : bu ek muhur, -Live, authority/nonce, cutover veya canli kabul yetkisi DEGILDIR
```

Olcumler 2026-09-11, salt-okuma: R27 paket dizinine yazma 0; canliya HTTP / DB / surec temasi 0 (RELEASE21 dist dosyalari yalniz
diskten okundu). `-Live` KOSULMADI; etkileri kaynaktan.

| Kontrol | Yontem | Sonuc |
|---|---|---|
| OP-01 duzeltmesi | `tools/Invoke-OwnerPreflight.ps1:147-149` + `PACKAGE-IDENTITY.json` bayt karsilastirmasi | OP-01 `engineSha256 == motor sha` ister; alan var, deger `52C9A220…`. Tek `engineSha256` satiri cikarilinca sha tam `56ACAC43…` (satir 18'deki eski deger) → dosyadaki TEK degisiklik bu satir; yeni sha `24DC59DB…`. Pakette iki sha'ya da pin YOK |
| Paket kimligi | `PACKAGE-IDENTITY.json` listesinden (kayitli sira ve ordinal) + disk taramasi | `DBE6B8E5…` ESIT · 48 dosya · disk sapmasi 0 · fazla 0 · durum dizinleri ve `MANIFEST.json` YOK (muhursuz) |
| Preflight provasi (OFFICE 33; paket KOPYASINDA, yukseltilmemis) | kanit JSON'lari `HY_C33_RELEASE22_CUTOVER_R27.PREFLIGHT-PROVA-R01` (paket koku DISI) | ONCE OP-01 FAIL (27 PASS) → SONRA OP-01 PASS (28 PASS); kalan OP-00 / OP-05c FAIL + OP-08a / OP-09d / OP-09e N/M yukseltme kaynakli; OP-09j INFO |
| Tam SHA'lar ve satir atiflari | disk + kaynak | yurutme paketi §1 SHA'lari diskle ESIT · `Test-RealPrimitives` 31-60 / 61-71 / 72-101 / 106 · Seal `:107-108` / `:135-137` / `:169-171` / `:248` · motor faz araliklari (P-01 `:398` … R-01 `:704`) DOGRU |
| `-Live` etkisi | kaynak | canliya 4 HTTP; DB yazmasi 0 (400/404 kalici yazilmaz); restart 0; paket ici tek yazma `REAL-PRIMITIVES-RESULTS.json` (kimlik tabani ICI → digest degisir). Giris sayaci (#2621) ESIT; ek: sayac portal girisiyle de ortak (`portal.controller.ts:78`) |
| Adim 5 isaretleri | RELEASE22 ve RELEASE21 dist dosyalarinda sayim | RELEASE22 3·3·3·1·2·5·1·1 · RELEASE21 0·yok·yok·0·0·3·0·0 → sekizi de ayirt edici |
| Onayli kimlik algoritmasi | OWNER-RUN `:63-67` + R25 `APPROVED-IDENTITY-CC94722D.json` | `unsealedDigest` = her `yol:sha256` + `\n` (sonuncusu dahil); immutableBase = join (sonda `\n` yok) → ayni liste icin iki FARKLI sayi (R25: `CC94722D…` vs `6CFCF3D5…`) |
| Kapsam karsilastirmasi | ana yurutucunun bagimsiz taslagi (#2618, kapandi) ile | geri donus baglari, Adim 6 kabul kapsami (CLIENT I9 / OFFICE), FD sonucu ve kalan kararlar ayni degerler; celiski yalniz asagidaki bulgular |
| CI | GitHub | #2619 9/9 ve #2621 9/9 SUCCESS, ikisi de merge'den once tamam |

**Bulgular** (yaziciya iletildi; duzeltme yazicinin takip PR'indadir):

- **F1 (maddi) — motor bir kez kostuktan sonra R27 yeniden MUHURLENEMEZ.**
  - Motor `Finish` (`:372-391`) her sonucta, exit 1 dahil, `cutover-receipts\CUTOVER-<RUNID>.json` yazar; dizinler `:507`'de,
    P dusus kontrolunden (`:513`) once kurulur.
  - Seal S-03 (`:162-165`) claim, NONCE marker ve makbuz sayisinin 0 olmasini ister ve `-Reseal` mantigindan ONCE kosar.
  - OWNER-RUN (`:88-95`) authority varken her yeniden kosumda `-Reseal` gecer → yeniden kosum OR-05'te exit 91.
  - Reseal yalniz motor HIC kosmadiysa mumkundur (verifier REJECTED, OWNER-COMMAND 90, OWNER-RUN 91).
  - Exit 1'den sonra paket icindeki tek yol: ayni authority penceresi dolmadan OWNER-COMMAND'in dogrudan kosumu (claim ve marker
    yok; P-17 yalniz marker'a bakar) — owner karari. Pencere dolduysa ya da exit 2/3/70 → yeni C33 paket numarasi + yeni ratifikasyon.
  - Celisen yerler: yurutme paketi §2 ("exit 2 → -R02 + yeni muhur"), §4 cikis tablosu (exit 1 "pencere gecmisse reseal";
    exit 2 "yeni ratifikasyon revizyonu + yeni muhur") ve §6.1 ("motor P-08 429 → adim tekrarlanir").
- **F2 (maddi):** yurutme paketi §4 "ayri adimlarla" yolu OWNER-RUN'i atlar. OR-02 (preflight kaniti), OR-03a/03b (onayli kimlik
  ve disk sapmasi) ve OR-04b (OWNER-COMMAND sha pini) yalniz OWNER-RUN'da vardir → onaydan muhure kadar olan sapma mekanik yakalanmaz.
- **F3:** onayli `unsealedDigest` §1'deki digest'e esit CIKMAZ (algoritma farki; tabloda).
- **F5:** `-Live` exit 2 (motor ayristirma `:17`, fonksiyon cikarimi `:23`, yerel sunucu `:35`) → sonuc dosyasi YAZILMAZ.
- **F6:** elle kurtarma blogu (yurutme paketi §5.2; `RELEASE22-R27-CUTOVER-PAKETI-R01.md` §8) konsola satir satir yapistirilirsa
  ust duzey `throw` sonraki satirlari durdurmaz → blok `& { $ErrorActionPreference='Stop'; ... }` ile tek ifade ya da sha pinli `.ps1`.
- F4 (giris sayaci) #2621 ile pakete girdi; yalniz portal notu kaldi.
- Bilgi: OWNER-RUN OR-06 authority ref'ini kendi verdigi `$RATIF` ile karsilastirir (oz-tutarlilik); bagimsiz ref kontrolu
  OWNER-COMMAND `:54-55`'tir (dosya sha'si OR-04b ile pinli) ve mutasyondan once kosar.

**Satir 18 notu:** tablodaki `PACKAGE-IDENTITY.json` sha `56ACAC43…` #2616 anindaki degerdir. OP-01 duzeltmesiyle `24DC59DB…`
oldu; kimlik digest'i degismedi (bayt kaniti bu ekte).

**Durum (2026-09-11, sonra):** F1–F6 ve #2621 §6.1 duzeltmesi yazicinin takip PR'i #2623 ile main'de (squash `f3ddb4a2`, CI 9/9;
birlesen icerik head `257deb35` ile ayni). Ana yurutucu #2623'u kaynakla yeniden dogruladi: DOGRU. Ek olarak iki belgedeki PowerShell
bloklari hedef calisma ortami Windows PowerShell 5.1 ayristiricisiyla ayristirildi: yurutme paketi 5 blok ve cutover kaydi 5 blok, hata 0;
elle kurtarma bloklari `& { ... }` tek ifade. KALAN: paket ICI `README.OWNER.md` §6 satir 89–91 (exit 1/2 "reseal"; satir 89'da
`-Reseal -ResealReason` eksik) — yurutme paketi bunlari GECERSIZ sayar; duzeltme owner GO ile Adim 3'te, onay anlik goruntusunden ONCE
(README kimlik tabaninda → digest degisir).

## Ek C — RELEASE22 yayin sonrasi bagimsiz dogrulama (owner GO 2026-09-11 "RELEASE22 YAYIN SONRASI BAGIMSIZ DOGRULAMA")

```text
KOSUM    : CUT-20260911-195709-35289e18 · C33_RELEASE22_CUTOVER_APPLIED_AND_VERIFIED · 31/31 · cikis 0 (owner kostu; makbuz 16:58:28Z)
OLCUM    : ana yurutucu, salt-okuma; canli 2026-09-11T17:03:59Z; paket durum dosyalari YALNIZ okundu (paket muhurlu, yazilmadi)
YETKI    : bu ek kabul yazmasi, yeniden muhur veya cutover tekrari yetkisi DEGILDIR
```

| Kontrol | Olculen | Sonuc |
|---|---|---|
| API :8080 | tek dinleyici; node pid 46332 (baslangic 16:57:39Z); kok `HY_W4_RELEASE22`; komut satiri RELEASE22 dist `main.js` girisini tasiyor, RELEASE21 girisini tasimiyor | ESIT |
| Web :3002 | tek dinleyici; node pid 47004 (16:58:11Z); kok `HY_W4_RELEASE22`; RELEASE22 `next` girisi | ESIT |
| Eski surecler | RELEASE21 API pid 50716 ve Web pid 22440 | YOK |
| Host ve gorevler | `hukuk-task-host` api=1 web=1; `HukukPlatform-API` / `-Web` Running, IgnoreNew, tetik Logon + 15 dk tekrar. Son 15 dk tetigi `0x800710E0` (ornek calisirken yeni ornek reddi; beklenen). CutoverWriter bu token ile gorunmez; motor P-07/V-03 yukseltilmis olctu | ESIT |
| bin | host / start-api / start-web = R22 (`E744A74B` / `77B6FBCD` / `1B7654F6`) | ESIT |
| Derleme ve HTTP (yalniz GET) | BUILD_ID dosyasi `xJZ1G1TsbOnHoWUzMD8CQ`; sunulan `_buildManifest` 200, eski `g91HUaBesekB-R2rRawQj` 404; API `/` 404; Web `/` 200; capabilities 200 | ESIT |
| Aday | `HY_W4_RELEASE22` worktree HEAD `137406701248858221d12be94a941f8837a2a245` | ESIT |
| Kod isaretleri | canli dist 3·3·3·1·2·5·1·1; `client.service.js` `01CA99AEC166362363135F79509DC88D9E60BD5D5A6CDCDAAD76E599978D5143` | ESIT |
| Release-yerel env | RELEASE22 `.env` VAR; sha RELEASE21 `.env` ile ESIT (H-01 bayt kopyasi; icerik okunmadi) | ESIT |
| Baslaticilar | R21 → R22 farki yalniz kok / calisma dizini / giris / env yollari; satir sayilari ayni; baglanma adresi baslaticida ayarlanmaz | ESIT |
| Kesinti (journal) | `T1_QUIESCED-INTENT` 16:57:36.368Z → `T5_RESUMED` (api+web) 16:58:15.835Z = **39,467 s**; durdurma+bosaltma 693 ms; host + baslatici degisimi 16:57:37.129Z–37.225Z | OLCULDU |
| DB (olculen kapsam) | motor `Get-DbSnapshot` (`engine\Invoke-C33Cutover.ps1:351`): migration defteri toplam/uygulanan/bekleyen/geri alinan 130/130/0/0, `system_identifier`, Tenant 9, User 43, SmokePrincipal 2 — oncesi = sonrasi; makbuz `dbMutations 0` | olculen kapsamda degisiklik saptanmadi |
| Geri donus (RELEASE21) | kok HEAD `2187a78b`; `main.js` `28D84796…`; `next` `AFEE236A…`; `client.service.js` `5D3DF71C…`; BUILD_ID `g91HUaBesekB-R2rRawQj`; RELEASE21 `.env` VAR; paket generations/R21 `1397C54C` / `4ACA26CD` / `DA62DD2D` | YERINDE, DEGISMEDI |
| Paket durumu | `pins/`, `authority/` (CONSUMED), claim `CLAIM-203d5835b8254e1d8dfa89b15ca26319.json`, NONCE marker, journal (13 satir, her satir `prev` ozeti tasir), makbuz `CUTOVER-CUT-20260911-195709-35289e18.json`, `MANIFEST.json` | muhurlu; YAZILMADI |

**OFFICE 33 (paket yazicisi) makbuz / journal / claim icerik ve bag dogrulamasi:** #2626 (OFFICE 33): makbuz sha256 `E96E2DFEA030D2E7100E5BAAA28BA107CD687527B52772A5BA584E76FB106203`, MANIFEST payloadDigest `C7918A0DE9EB94D7DA3F1A45F4057DB20E40AFB29A4686DB8A96607A6B42D4F6`, COMMITTED, rollback yok. Ana yurutucu capraz kontrolu (salt-okuma): iki deger ESIT; authority, claim ve NONCE marker ayni nonce `203d5835b8254e1d8dfa89b15ca26319`; claim 16:57:25Z, tek kullanimlik authority penceresi (16:57:07Z–17:27:07Z) icinde; makbuz ve journal runId ayni; authority ve pins ref + paket R27 + aday `13740670` ESIT.

**Notlar:**

- Motor V-01 kapi aciklamasi "ledger 129" yazar; karsilastirmanin kendisi `dbPost == dbPre` (130). Metin bayat, davranis dogru.
- API ve Web `::` uzerinde dinliyor. Baglanma adresi uygulama varsayilani; cutover degistirmedi (baslatici farki yalniz yollar).
  Uygulama portlarinin ag disi erisimi bu turda OLCULMEDI; motor V-01 yalniz 5 altyapi portunun loopback oldugunu denetler (PASS).
- Owner istegi uzerine "Müvekkil modülü analiz ve faz durumu" oturumuna olculmus kanitlarla BILGI bildirimi yapildi. I9 canli
  kosumu AYRI owner GO ister.
- Kabul yazmasi YOK; tuketilmis RELEASE21 A-07 fixture'i kullanilmadi. R27 motoru kostugu icin paket yeniden MUHURLENEMEZ.

### Ek C.1 — Cutover oncesi gercek RELEASE21 PID'leri ve planlanmamis kesinti (ek olcum, salt-okuma, 2026-09-11 ~17:31Z)

Ek C "Eski surecler" satiri 50716 / 22440'i olcer; bunlar 13:25Z'deki (-Live) PID'lerdir. Cutover'in degistirdigi gercek RELEASE21
surecleri API **40216** (spawn 16:45:04Z) ve Web **31180** (spawn 16:33:12Z) idi; OFFICE 33 bu farki "neden olculmedi" notuyla
bildirmisti. 17:31:06Z olcumu: 40216 / 31180 / 50716 / 22440 dordu de YOK; 46332 / 47004 ve host 43300 / 25372 calisiyor.

Neden: Windows `System` ve `Microsoft-Windows-TaskScheduler/Operational` gunlukleri ile `C:\Ops\hukuk\logs\{api,web}\` altindaki
host ve baslatici gunlukleri (yerel saat +03:00, UTC'ye cevrildi):

| UTC | Olay |
|---|---|
| 16:10:04Z | Yeniden baslatma: `StartMenuExperienceHost.exe`, `TELLI\ulastelli` adina (olay 1074, "Diger (Planlanmamis)") |
| 16:10:05Z | API ve Web host'lari stop-signal ile cikti; iki gorev sonucu `0x80070001` |
| 16:12:46Z / 16:15:01Z | acilis; iki gorev "kullanici oturum acmadi" diye BASLAMADI (olay 332) |
| 16:23:14Z | Ikinci yeniden baslatma: `TrustedInstaller.exe`, SYSTEM adina, "Isletim Sistemi: Yukseltme (Planlanmis)" `0x80020003` |
| 16:25:01Z / 16:30:01Z | acilis; iki gorev yine BASLAMADI (olay 332) |
| 16:31:56Z | oturum acildi; iki gorev Logon tetigiyle basladi (host 6880 / 10608); host 994/994 closure 16:33:00Z (63 sn) |
| 16:33:18Z | Web STARTED :3002 pid 31180 |
| 16:33:44Z | API baslaticisi: DB probe 1-6 `exit=20` (UNAVAILABLE), probe 7 `exit=23` (UNCLASSIFIED, `code=none`) → `DB_NOT_READY(UNCLASSIFIED) exit 23`; gorev bitti (`0x80070017`) |
| 16:45:01Z | 15 dk zaman tetigi API gorevini yeniden baslatti (host 43836); 16:45:04Z DB hazir; **16:45:39Z API STARTED :8080 pid 40216** |

Sureler (host stop-signal → baslatici STARTED; bu aralikta HTTP erisilebilirligi OLCULMEDI): **API 35 dk 33,8 sn · Web 23 dk 13,5 sn.**

- Cutover ile iliskisi YOK: olay muhur ve cutover'dan once bitti; motor P-06 / P-07 / P-08 on durumu 16:57Z'de dogruladi (OLD, Running,
  host=2). Paket kimligi, preflight ve -Live kanitlari bu olaya dayanmaz.
- Gorevler oturum acik degilken baslamiyor (olay 332, bu olayda iki acilista olculdu); cokme toparlamasi 15 dk tetigi + DB kapisi ile
  (`runtime-reconciliation-r01/c30-f01-launcher-pin-atomic-cutover-design-r01.md` satir 201).
- Yeni gozlem: `Wait-HLDbReady` (`C:\Ops\hukuk\bin\start-api.ps1:345-362`) yalniz `exit=20`'yi yeniden dener (24 × 5 sn); `exit=23` hemen
  doner. Acilista kodsuz DB hatasi 24 × 5 sn'lik sinirli beklemeyi 7. denemede (~32 sn) kesti (baslatici toplam ~44 sn); toparlanma
  15 dk tetigine kaldi (11 dk 17 sn bekleme).
  RELEASE22 baslaticisi ayni fonksiyonu tasir (R21 → R22 farki yalniz yollar) → ayni davranis RELEASE22'de de beklenir (CIKARIM; denenmedi).
- Bu kayitla gorev, baslatici veya Windows ayari DEGISTIRILMEDI; iyilestirme owner karari.

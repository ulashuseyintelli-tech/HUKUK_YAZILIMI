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

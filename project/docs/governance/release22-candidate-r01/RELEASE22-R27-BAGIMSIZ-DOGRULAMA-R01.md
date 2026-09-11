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

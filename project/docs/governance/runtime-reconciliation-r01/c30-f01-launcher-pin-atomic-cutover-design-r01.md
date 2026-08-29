# C31 — C30-F01: LAUNCHER HASH-PIN ANALIZI + ATOMIK PIN/POINTER CUTOVER TASARIMI (R01)

```text
KAYIT              runtime-reconciliation-r01/c30-f01-launcher-pin-atomic-cutover-design-r01.md
GOREV              C31 / C30-F01 — LAUNCHER HASH-PIN ANALIZI + ATOMIK CUTOVER TASARIMI
EXECUTION CLASS    ANALYSIS + DESIGN + GOVERNANCE MATERIALIZATION
KAYIT TURU         TASARIM KAYDI — NON-AUTHORIZING (yetki URETMEZ)
ANALIZ TARIHI      2026-08-29 (UTC; C30 kapanisi cb8fe470 sonrasi fresh)
BASELINE           main == origin/main == cb8fe470 (talimat beklentisiyle BIREBIR) · acik PR 0

DESIGN                    = DELIVERED
ROOT CAUSE                = VERIFIED
OWNER DECISIONS           = PENDING
IMPLEMENTATION AUTHORITY  = NONE
PRODUCTION AUTHORITY      = NONE
PRODUCTION MUTATION       = 0 (salt-okuma analiz; before==after hash envanteri §M)
```

Kanit etiketleri: `VERIFIED` (bu oturumda komut/olcumle dogrulandi) · `OBSERVED`
(bu oturumda dosya/log iceriginde goruldu) · `INFERRED` (dogrulanmis olgulardan
turetildi) · `ATTESTED` (owner-ratified onceki qualification kaydina dayanir,
bu oturumda bagimsiz yeniden turetilemez).

---

## A. KOK NEDEN — exit 104 kanit zinciri

### A.1 Karar zincirinin tam cozumu

Zorunlu kanit zinciri (talimat §3) eksiksiz kurulmustur:

```text
1  EXIT-CODE DEFINITION   hukuk-task-host.cs baslik yorumu (satir 21-24) + kod:
                          104 = SCRIPT_READ_FAILED | SCRIPT_HASH_MISMATCH  [OBSERVED]

2  ILGILI BRANCH          hukuk-task-host.cs satir 362-363:
                            sha = Sha256File(spec.Script)            → olcum
                            if (!string.Equals(sha, spec.ScriptSha256,
                                OrdinalIgnoreCase))
                              { HostLog("SCRIPT_HASH_MISMATCH exit 104");
                                return 104; }                        [OBSERVED]

3  EXPECTED IDENTITY      Compile-time sabit, BINARY'YE GOMULU:
                            satir 69: SHA_PAPI =
                              4ACDC9D9CBCF5A0E2E1881701861DACFF4F86AB61BECABC69503EE4E7EB06819
                            satir 77: case "api" → ModeSpec(
                              C:\Ops\hukuk\bin\start-api.ps1, SHA_PAPI, ...)
                          Kaynak: HY_OPS_DURABILITY_R03\src\hukuk-task-host.cs
                          (SHA-256 119E09E2248E089CC12C307AF05A510AAAA4E4EC47
                          CA22C144888C2A0450C5BE — bu oturumda olculdu)  [VERIFIED]

4  ACTUAL IDENTITY        Forward launcher (RELEASE14 candidate):
                            C51A9C4758107881C767312141735A048D6329492CD6A3595A971516CEEEFD48
                          elevated switch log 12:04:28Z "launcher switched" satiri +
                          C30_EVIDENCE\start-api.ps1.R14-CANDIDATE dosya hash'i
                          (bu oturumda yeniden olculdu, BIREBIR)      [VERIFIED]

5  KARSILASTIRMA ANI      Canli C:\Ops\hukuk\logs\api\host-api.log (lokal saat = UTC+3):
                            15:04:27.503 stop-signal (elevated Stop-Task)
                            15:04:28.146 begin mode=api (Start-Task sonrasi yeni host)
                            15:04:32.236 pwsh ACL ok + FULL CLOSURE ok 994/994 ms=4085
                            15:04:32.236 SCRIPT_HASH_MISMATCH exit 104
                          → karar, pwsh-closure dogrulamasinin hemen ardindan,
                          child spawn'indan ONCE verildi.               [OBSERVED]

6  HOST KARARI            Fail-closed exit 104; CreateProcessW HIC CAGRILMADI.
                          Kanit: launcher.log'da 15:04:28-15:10:58 penceresinde
                          HICBIR "launcher begin" satiri yok — launcher hic
                          calistirilmadi; API listener acilamadi.       [OBSERVED]

7  JOURNAL/LOG KARSILIGI  host-api.log satiri (yukarida) + C30 execution journal
                          ADIM 5 + release14-cutover-record-r01.md §3 12:04:32
                          BLOCKER kaydi — uc kaynak tutarli.            [OBSERVED]
```

### A.2 Kaynak ↔ canli binary identity bagi (talimat §3 standardi)

```text
SOURCE SEMANTICS          = OBSERVED (kaynak bu oturumda satir satir okundu)
LIVE ↔ PACKAGE BINARY     = VERIFIED (bu oturum olcumu):
  canli C:\Ops\hukuk\bin\hukuk-task-host.exe SHA-256
    = 0FA10601936DC21EA34DE1702666F475633445080CC6A62CD8C104DF3DDA4D84
    = paket bin\hukuk-task-host.exe
    = build-manifest.json singleBinary.sha256
    = sha256-manifest.txt kaydi (2 konum, byteIdentical)
PACKAGE BINARY ↔ SOURCE   = ATTESTED:
  build-manifest.json: source.sha256 = 119E09E2… (bu oturumda olculen kaynak
  hash'iyle BIREBIR) + compiler csc 4.8.9221.0 kimligi + R03.2 FULL-CLOSURE
  owner-ratified seal (SEALED_QUALIFIED_BINARY; reproducible-build DEGIL —
  binary kaynaktan bu oturumda yeniden turetilemez, D1: APPLY rebuild YASAK).
DAVRANISSAL TEYIT         = OBSERVED:
  canli log literal'i "SCRIPT_HASH_MISMATCH exit 104" == kaynak satir 363
  literal'i; oncesindeki "pwsh ACL ok + FULL CLOSURE ok 994/994 bytes=…"
  == kaynak satir 360 format'i; log sirasi kaynaktaki dogrulama sirasiyla
  (self→pwsh→ACL→closure→script-hash) birebir.
NET SINIF                 = VERIFIED_VIA_SEALED_ATTESTATION:
  canli binary R03.2'de muhurlenen binary ile byte-identical (VERIFIED) ve o
  muhur, okunan kaynagi attestation ile baglar (ATTESTED). Zincirde bosluk
  yoktur; tek sinir reproducible-build yoklugudur ve bu sinir kayitlidir.
```

Bu sinif, kok-neden verdict'ini `VERIFIED` yapmaya yeterlidir: karar mantigi
kaynakta gorulmus, canli binary'nin o karar mantigini tasidigi hem hash-zinciri
hem davranis parmak-iziyle baglanmistir. G1 kapisinin implementation-oncesi
kalan tek acigi §H'de tanimlidir.

### A.3 Kesin siniflandirma

```text
EXIT 104 SINIFI = LAUNCHER SCRIPT HASH MISMATCH (kesin)
  - sealed host binary mismatch DEGIL (self-identity 102 gate'i gecti; begin loglandi)
  - pwsh clone manifest mismatch DEGIL ("FULL CLOSURE ok 994/994" loglandi)
  - clone ACL mismatch DEGIL ("pwsh ACL ok" loglandi)
  - config/pointer generation mismatch DEGIL (boyle bir mekanizma mevcut degil, §B)
  - launcher ACL/path/reparse reddi DEGIL (104 yalniz read-fail|hash-mismatch;
    log literal'i hash-mismatch kolunu gosteriyor)
EXPECTED = 4ACDC9D9… (SHA_PAPI, binary-gomulu; RELEASE13 launcher'inin hash'i)
ACTUAL   = C51A9C47… (RELEASE14 forward launcher)
```

### A.4 C30'da eksik kalan qualification kapisi

```text
OLGU 1 [OBSERVED]  Host, basari yolunda script-hash kontrolu icin LOG YAZMAZ
                   (kaynak satir 362-363: yalniz mismatch/read-fail loglanir).
                   Gecmis host-api.log'lari bu nedenle pin'in varligina dair
                   HICBIR iz icermiyordu.
OLGU 2 [OBSERVED]  Davranis R03 qualification'inda BILINIYOR ve TEST EDILIYORDU:
                   qual-r03-host.ps1 satir 83-93 "H04: script hash mismatch
                   fail-closed (qweb tamper → 104)"; qual-r03-results.json:
                   "tamperExit=104 (104) restored=True" PASS.
OLGU 3 [OBSERVED]  C30'un yetkili preflight kanit paketi (faz-1 + supplement)
                   launcher'i yalniz POINTER/ICERIK duzeyinde qualify etti;
                   R03 qualification kaydindaki H04 kalemini preflight kanit
                   zincirine BAGLAMADI.
SONUC              Owner-onayli sinir ifadesi aynen gecerlidir:
                   "Launcher hash-pin dependency was not exposed by the
                   authorized C30 preflight evidence and was therefore not
                   qualified before cutover."
                   Eksik kapi: "canli host'un launcher-kabul kriterlerinin
                   (pin listesi) cutover candidate'e karsi action-time
                   dogrulanmasi" diye bir kapi C30 kapi setinde YOKTU.
                   Bu kapi §H G2/G3'te tasarima baglanmistir.
KANIT/HIPOTEZ AYRIMI
                   Yukaridaki 1-3 olgu ve A.1 zinciri KANIT'tir. "Preflight
                   ekibi H04'u gorebilirdi" turu ifadeler bu kayda ALINMAMISTIR;
                   kayit yalniz kanitin destekledigi sinir ifadesini tasir.
```

### A.5 Uc davranisin aciklamasi

```text
API NEDEN BASLAYAMADI   Host 104 ile launcher'i hic spawn etmedi (A.1/6);
                        listener 8080 acilamadi; API DOWN ~7dk15sn.
ROLLBACK NEDEN CALISTI  Restore edilen dosya byte-exact RELEASE13 launcher'iydi;
                        olculen hash == SHA_PAPI pin → satir 363 kosulu FALSE →
                        akis devam: job → spawn → launcher R13 → STARTED
                        port=8080 pid=7476 (canli log 15:11:43.863). [OBSERVED]
WEB NEDEN ETKILENMEDI   start-web.ps1 hic degistirilmedi; canli hash B34B7A16…
                        == SHA_PWEB pin (satir 70) [VERIFIED]; Web host'una
                        stop/start da uygulanmadi (C30 BINDING; host-web.log
                        son kaydi 2026-08-28 — pencere boyunca sessiz). Ayrica
                        API/Web AYRI host surecleri ve AYRI pin sabitleridir;
                        API karari Web'i etkileyemez (kaynak: mode tablosu).
```

---

## B. PIN VE WRITER YUZEYI ENVANTERI

Zincirin tam resmi (guven koku binary'de):

```text
Scheduled Task (action sabit)
  → hukuk-task-host.exe (SEALED; kendi self-path'ini dogrular)
      → [compile-time] pwsh-manifest SHA pin → bin\pwsh-file-manifest.json
          → pwsh klonu 994/994 (her spawn oncesi path+size+SHA)
      → [compile-time] launcher SHA pin (SHA_PAPI/SHA_PWEB)
          → start-api.ps1 / start-web.ps1
              → [launcher-ici pin] NodeSha256 → node.exe
              → [launcher-ici pin] HelperSha256 → db-readiness.js
              → [launcher-ici SABIT YOL, icerik pin'i YOK] EntryJs/ReleaseRoot/EnvFile
                  → RELEASE worktree dist + .env
```

Yuzey envanteri (10 asgari yuzey + ek yuzeyler):

| # | Bilesen | Canonical path | Kimlik bagi | Expected kaynagi | Dogrulayici (kod ref) | Writer | Elevation | Failure → exit | Cutover'da degisir mi | Recovery | Durum |
|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | Host binary | C:\Ops\hukuk\bin\hukuk-task-host.exe | SHA-256 0FA10601… | build-manifest + sha256-manifest (paket) | Kendini dogrulamaz; self-PATH dogrular (cs:349-350); butunluk ACL+seal ile | R03.2 APPLY zinciri (elevated kopya; rebuild YASAK D1) | EVET | path-mismatch → 102 | HAYIR (release cutover'inda) | Paket kopyasindan elevated restore | VERIFIED (canli==paket==manifest) |
| 2 | API launcher | C:\Ops\hukuk\bin\start-api.ps1 | SHA-256 4ACDC9D9… | SHA_PAPI compile-time (cs:69) | Host cs:362-363 | C30-tipi elevated switch script'leri | EVET (task-user RX-only) | 104 | EVET (tek degisen guvenlik-kritik yuzey) | Byte-exact eski kopya restore (C30'da calisti) | VERIFIED |
| 3 | Web launcher | C:\Ops\hukuk\bin\start-web.ps1 | SHA-256 B34B7A16… | SHA_PWEB compile-time (cs:70) | Host cs:362-363 | ayni | EVET | 104 | EVET (Web cutover'inda) | ayni | VERIFIED |
| 4 | Release pointer | AYRI DOSYA OLARAK MEVCUT DEGIL | — | — | — | — | — | — | — | — | VERIFIED (yokluk) |
|   | | "Pointer" = launcher icindeki 4 sabit: ReleaseRoot/WorkDir/EntryJs/EnvFile (R13↔R14 candidate diff'i YALNIZ bu 4 satir [VERIFIED]). Pointer degisimi ≡ launcher dosya degisimi ≡ hash degisimi → pin'e carpar. C30'un kok mimari nedeni budur. | | | | | | | | | | |
| 5 | Host config | AYRI DOSYA OLARAK MEVCUT DEGIL | — | — | — | — | — | — | — | — | VERIFIED (yokluk) |
|   | | Tum host konfigurasyonu compile-time mode tablosudur (cs:63-88). Dis girdi YALNIZ mode ENUM'udur (task arguments "api"/"web"). | | | | | | | | | | |
| 6 | pwsh klonu | C:\Ops\hukuk\pwsh\ (994 dosya [VERIFIED sayim]) | dosya-basi size+SHA | bin\pwsh-file-manifest.json | Host VerifyClosure (cs:157-200) | R03.2 APPLY (elevated) | EVET | 108/109/110 | HAYIR | Paket pwsh-runtime kopyasi | VERIFIED (canli host "FULL CLOSURE ok 994/994" logluyor) |
| 7 | Clone manifest | C:\Ops\hukuk\bin\pwsh-file-manifest.json | SHA-256 84E530B1… | MANIFEST_SHA compile-time (cs:92) | Host cs:165-166 | R03.2 APPLY (elevated) | EVET | 109 | HAYIR | Paket kopyasi | VERIFIED |
| 8 | Launcher/bin/klon ACL | C:\Ops\hukuk\bin (inherited kok ACL'den) + pwsh (Protected) | ACE seti | APPLY runbook icacls sozlesmesi | pwsh icin host VerifyCloneAcl (cs:132-154); bin/launcher icin HOST-ICI DOGRULAYICI YOK (yalniz OS ACL engeli) | icacls (elevated) | EVET | pwsh: 111; bin/launcher: exit uretmez | HAYIR | icacls yeniden uygulama | VERIFIED (bin: Admins/SYSTEM=F, task-user=RX; pwsh: Protected=True; owner=task-user → build-manifest "honest boundary": non-elevated owner WRITE_DAC tasiyabilir, hardening onerisi acik) |
| 9 | Scheduled Task (API/Web) | \HukukPlatform-API, \HukukPlatform-Web | XML tanim | R03 task-xml paketi | Dogrulayici YOK (schtasks export/diff prosedureldir) | Register-ScheduledTask (elevated) | EVET | — | HAYIR (release cutover'inda; host-nesli cutover'inda EVET) | rollback\*.xml (R02 tanimlari) | VERIFIED (canli XML == R03 candidate; delta yalniz register-sirasinda eklenen IdleSettings default'u ve eleman sirasi [OBSERVED]) |
| 10 | Watchdog | AYRI SUREC/TASK DEGIL — uc mekanizma: (a) TimeTrigger PT15M repetition, (b) RestartOnFailure PT2M×3, (c) launcher-ici HL_HOST_PID poll (orphan-prevention) | task XML + launcher kodu | task XML + start-api.ps1:396-413,451-463 | — | task XML writer'i / launcher writer'i | EVET | — | HAYIR | — | VERIFIED (§F'te davranis kaniti) |
| 11 | Journal | MEVCUT DEGIL (C:\Ops\hukuk altinda journal yuzeyi yok [VERIFIED listeleme]; C30'da evidence-dizini duz log-append kullanildi) | — | — | — | — | — | — | — | — | VERIFIED (yokluk) |
| 12 | node.exe | Volta image 24.18.0 | SHA-256 9A4EB5F1… | launcher NodeSha256 sabiti | launcher Test-HLNodeBinary | Volta/kullanici alani (task-user YAZABILIR — elevation istemez) | HAYIR | launcher exit 11 | HAYIR | Volta reinstall | OBSERVED (pin launcher'da; canli node hash'i bu oturumda ayrica olculmedi — canli surec calisiyor oldugu icin exe kimligi listener-identity ile dogrulandi) |
| 13 | db-readiness.js | C:\Ops\hukuk\bin\db-readiness.js | SHA-256 AD18CBB6… | launcher HelperSha256 | launcher Test-HLFileSha256 | R03 APPLY (elevated) | EVET | launcher exit 18 | HAYIR | Paket kopyasi | VERIFIED |
| 14 | Release dist + .env | HY_W4_RELEASE13 (canli) / RELEASE14 (candidate) | dist: C30 manifest'leri; .env: 804F9414… (icerik OKUNMADI) | RELEASE14-MANIFEST | ICERIK ICIN HOST/LAUNCHER PIN'I YOK — yalniz yol sabiti (bilinen acik: entry-content pin'i degil) | build/deploy zinciri (task-user yazabilir) | HAYIR | — | Pointer hedefi olarak EVET (dosyalar degil, secim degisir) | worktree preserve | VERIFIED (R14 .env == R13 .env birebir) |

**Ikinci writer taramasi** [VERIFIED]: ayni yuzeye yazabilen ikinci script/task/
watchdog ARANDI, BULUNMADI. `C:\Ops\hukuk\rollback-r02-launchers\` yalniz statik
R02 yedek kopyalaridir (writer degil). Scheduler'daki HukukPlatform-* disinda bu
yuzeylere dokunan task yoktur (Hukuk*/HL* taramasi: yalniz API+Web task'lari).
Launcher'lar yalniz `logs\` altina yazar (launcher.log, child log'lari,
launch.lock) — `bin\`/`pwsh\` yuzeylerine yazan runtime bileseni yoktur; zaten
task-user token'i RX-only'dir. Tek yazim yolu ELEVATED prosedurel scriptlerdir.
Bu, cutover tasariminda "yarisan ikinci writer" riskini scheduler tetiklerine
indirger (§F).

---

## C. ATOMIKLIK TANIMI VE MIMARI SECENEKLER

### C.1 Atomiklik tanimi (baglayici)

Cok sayida Windows dosyasi ve Scheduled Task islemi fiziksel olarak tek atomik
filesystem islemi DEGILDIR ve oyle iddia edilmeyecektir. Bu tasarimda "atomik":

> Journal-korumali, tek transaction kimlikli, crash-recoverable MANTIKSAL
> atomiklik: hicbir terminal durumda pin, pointer(launcher), launcher ve calisan
> release kimlikleri birbiriyle celiskili kalmaz; her ara durum journal'dan
> deterministik olarak tek bir terminal duruma tasinabilir.

### C.2 Mimari kok gercek (tum seceneklerin zemini)

```text
[VERIFIED] Launcher pin'leri (SHA_PAPI/SHA_PWEB) sealed binary'ye compile-time
gomuludur. Bu nedenle MEVCUT trust modelinde HER launcher/pointer degisimi,
ya (i) yeni pin'li yeni sealed binary uretimini (rebuild+requalification+APPLY),
ya da (ii) pin'in binary disina tasinmasini gerektirir. (ii) secilirse guven
koku kismen dosya sistemine iner ve o dosyanin butunlugu ACL+elevation+journal
ile korunmak zorundadir (ortamda Authenticode imza zinciri YOK: NotSigned).
Bu ikilem owner'in verecegi asil karardir (K-1).
```

### C.3 SECENEK A — VERSIONED TRANSACTION MANIFEST

Host; launcher hash'lerini, release generation'ini ve transaction nonce'unu tek
versioned manifest dosyasindan (`bin\cutover-pin-manifest.json` gibi) tuketir.
Manifest same-volume temp + flush + atomic rename ile yayimlanir.

```text
SEALED BINARY DEGISIYOR MU   EVET, BIR KEZ: manifest-okuma + dogrulama + state
                             mantigi icin host kodu degisir → yeni seal.
                             SONRASINDA release cutover'lari rebuild'siz.
REBUILD/RESEAL               Ilk gecis icin zorunlu; sonraki cutover'larda YOK.
INSTALLER/QUAL ZINCIRI       Mevcut zincir YETERSIZ: yeni host icin yeni
                             qualification turu (H-testlerinin manifest
                             varyantlari + yeni negatif testler) sart.
YENI AUTHORITY YUZEYI        EVET — manifest yazari. Kontrol: elevated-only ACL
                             (bin\ mevcut ACL'i zaten task-user RX) + journal'a
                             bagli transactionId + monotonic generation +
                             ownerAuthorizationReference alani (§E pin-set).
KRITIK GUVENLIK ANALIZI      Manifest'in SHA'sini binary'ye pinlemek KAZANIMI
                             SIFIRLAR (her cutover'da manifest degisir → yine
                             rebuild). Dolayisiyla A'nin durust bicimi: manifest
                             butunlugu = ACL + elevation + journal + generation
                             + nonce. Guven koku "yalniz binary"den "binary +
                             elevated-yazilabilir tek dosya"ya GENISLER. Bu bir
                             GEVSEME MIDIR: fail-closed davranis korunur
                             (manifest yok/bozuk/stale → start REDDI), dogrulama
                             kapilarinin HICBIRI kapanmaz; ancak pin degistirme
                             yetkisi "yeni seal uret" seviyesinden "elevated
                             dosya yaz" seviyesine iner. Bu delta gizlenmez;
                             owner K-1'de acikca karar verir.
DOWNGRADE/ROLLBACK           Manifest generation monotonic; eski generation'li
                             manifest REDDEDILIR; rollback = YENI generation'la
                             eski hash'lerin yeniden yayimlanmasi (downgrade
                             degil, ileri-yonlu geri donus).
CRASH RECOVERY               Manifest yayimi tek-rename oldugu icin dosya-duzeyi
                             atomik; journal state'leri manifest oncesi/sonrasi
                             ayrimini tasir (§D).
WATCHDOG YARISI              Dusuk: PT15M tetigi transaction ortasinda host
                             baslatirsa host ya eski-tam ya yeni-tam manifest
                             gorur (rename atomikligi); yarim-dosya gormez.
                             Launcher kopyalama penceresi icin §F quiesce yine
                             gerekli (launcher yazimi rename'e cevrilse bile
                             pin-manifest/launcher cifti arasi pencere kalir).
IMPL/PROD RISK               ORTA: host kodu buyur (parse + state), test yuzeyi
                             genisler; tek seferlik seal riski.
BACKWARD COMPAT              Manifest yoksa fail-closed (yeni host eski duzenle
                             CALISMAZ) → APPLY sirasi manifest-once olmali.
```

### C.4 SECENEK B — DUAL-SLOT PIN ROTATION

Host, transaction scope'unda exact OLD + NEW pin ciftini kabul eder; yeni
release dogrulandiktan sonra eski pin ayri commit state'inde kaldirilir.
Suresiz cift-pin YASAKTIR.

```text
SEALED BINARY DEGISIYOR MU   EVET — iki alt-bicimden hangisi secilirse secilsin:
  B1 (cift compile-time pin) Her cutover'da OLD+NEW gomulu YENI binary derlenir
                             → commit'te NEW-only ikinci binary. Cutover basina
                             IKI seal turu: operasyonel maliyet en yuksek;
                             pratikte C'ye yakinsayan ama iki kat pahali hali.
  B2 (dosyadan cift pin)     Pin cifti dosyadan okunur → A'nin trust-root
                             analiziyle AYNI; A'dan tek farki gecis penceresinde
                             iki hash'in ayni anda gecerli olmasi.
REBUILD/RESEAL               B1: her cutover'da 2x. B2: bir kez (A gibi).
INSTALLER/QUAL ZINCIRI       Yetersiz; yeni qualification sart (iki-pin kabul
                             pencereleri + suresiz-cift-pin yasaginin negatif
                             testleri dahil).
YENI AUTHORITY YUZEYI        B2'de A ile ayni; B1'de yok (binary ici).
DEGERI                       Gecis penceresinde host "hicbir launcher'i kabul
                             edemez" durumuna HIC dusmez: eski launcher hala
                             start edilebilirken yeni launcher da kabul edilir;
                             rollback penceresi kesintisiz.
BEDELI                       Pencere boyunca IKI farkli launcher'in da kabulu =
                             "hangi release'in calistigi" sorusunu journal'a
                             tasir; pencere sinirlanmazsa guvenlik daralmasi
                             (bu yuzden bounded-use + expiresAt zorunlu, §E).
DOWNGRADE/ROLLBACK           Pencere icinde dogal (iki hash de gecerli); commit
                             sonrasi eski hash reddedilir → replay engeli
                             generation ile.
CRASH RECOVERY               Pencerede crash → recovery journal'dan pencereyi
                             kapatir (commit veya abort); belirsiz cift-pin
                             kalici olamaz.
WATCHDOG YARISI              EN DUSUK: transaction ortasinda tetiklenen host,
                             eski VEYA yeni launcher'dan hangisini bulursa
                             baslatabilir → API-down penceresi kisalir; ancak
                             "yanlis anda eski release'i geri baslatma"
                             olasiligi journal'la yonetilmek zorunda.
IMPL/PROD RISK               ORTA-YUKSEK: en cok yeni durum-uzayi ureten
                             secenek (pencere ici/disi × eski/yeni × crash).
BACKWARD COMPAT              B1'de tam; B2'de A ile ayni.
```

### C.5 SECENEK C — QUIESCED SEALED-HOST COORDINATION

Pin'ler compile-time KALIR (trust model DEGISMEZ). Her release cutover'i:
yeni SHA_PAPI/SHA_PWEB sabitli kaynak → derleme → qualification (H-testleri) →
seal → quiesce altinda "sealed host + launcher" ciftinin TEK koordineli
transaction'da degisimi → enable + start + verify.

```text
SEALED BINARY DEGISIYOR MU   EVET, HER CUTOVER'DA (tasarim geregi).
REBUILD/RESEAL               Her cutover'da tam tur. NOT: Bu, R03.2 D1 ("APPLY
                             rebuild YASAK") ile CELISMEZ — D1, APPLY aninda
                             qualification'daki EXACT binary yerine yenisini
                             derlemeyi yasaklar; C'de her tur KENDI
                             qualification'ini kosar ve APPLY o turun EXACT
                             binary'sini kopyalar (ayni disiplin).
INSTALLER/QUAL ZINCIRI       MEVCUT ZINCIR EN YAKIN: R03→R03.1→R03.2 zinciri
                             (build-and-perf → qual-r03-host H01-H14 →
                             sha256-manifest → APPLY runbook A0-A4) zaten tam
                             bu isi yapiyor; eksik olan yalniz "launcher pin
                             degeri release'e gore parametrik" adimi + journal.
                             Qual suite'in otomasyonu operasyonel yuku dusurur.
YENI AUTHORITY YUZEYI        YOK. Guven koku aynen binary'de kalir; pin
                             degistirme = yeni seal uretme = mevcut en yuksek
                             esik. GUVENLIK KAPISI HIC GEVSEMEZ.
DOWNGRADE/ROLLBACK           Rollback = eski sealed binary + eski launcher
                             ciftinin byte-exact restore'u (C30'un kanitladigi
                             desen, binary bileseni eklenmis hali). Eski ciftin
                             paketleri immutable saklanir (§E hash-bound).
CRASH RECOVERY               Binary+launcher cift-dosya degisimi rename-atomik
                             DEGILDIR → journal + quiesce ZORUNLU (§D/§F);
                             recovery, ciftin tutarliligini (ikisi eski VEYA
                             ikisi yeni) restore eder. Host exe'nin calisirken
                             degistirilemeyecegi (image lock) quiesce'i zaten
                             zorunlu kilar.
WATCHDOG YARISI              Quiesce (Disable-ScheduledTask, journal-visible)
                             ile pencere kapatilir; §F modeli sart.
IMPL/PROD RISK               DUSUK-ORTA: host KODU degismez (yalniz sabitler);
                             durum-uzayi en kucuk; maliyet operasyoneldir
                             (her release'te qual turu), mimari degildir.
BACKWARD COMPAT              TAM: mevcut canli duzen zaten bu modelin "tek
                             nesil" halidir.
```

### C.6 Karsilastirma ozeti ve tercih gerekcesi

```text
                       A (manifest)   B1 (cift-seal)  B2 (dosya-cift)  C (quiesce+reseal)
Guven koku             binary+dosya   binary          binary+dosya     binary (DEGISMEZ)
Cutover basina seal    0 (ilk hari)   2               0 (ilk haric)    1
Yeni durum-uzayi       orta           yuksek          en yuksek        en kucuk
API-down penceresi     orta           kisa            en kisa          orta (quiesce sureli)
Qual zinciri yenilik   yuksek         yuksek          yuksek           dusuk (parametrik pin)
Yeni authority yuzeyi  VAR            YOK             VAR              YOK
```

RECOMMENDATION (baglayici DEGIL; owner K-1'de karar verir):
**SECENEK C.** Gerekceler: (1) fail-closed guvenlik zincirinin HICBIR halkasi
tasinaz/gevsemez — talimatin mutlak kisiti en temiz bicimde saglanir; (2) mevcut
owner-ratified qualification+APPLY zinciri asgari deltayla yeniden kullanilir;
(3) durum-uzayi en kucuk oldugu icin G5-G12 kapilarinin kanitlanmasi en ucuzdur;
(4) cutover frekansi dusuktur (RELEASE nesilleri haftalar mertebesinde) —
operasyonel reseal maliyeti tasinabilirdir. Cutover frekansi belirgin artarsa
A'nin §C.3'teki durust bicimi ikinci aday olarak kayitlidir. B yalniz
"kesintisiz kabul penceresi" gereksinimi dogarsa degerlendirilmelidir.

Hicbir secenek icin BLOCKED_DESIGN_GAP durumu YOKTUR: uc secenek de kanitlanan
zincire uygulanabilirdir; secim guvenlik-modeli tercihi olarak owner'a aittir.

---

## D. JOURNAL STATE MACHINE

### D.1 Mevcut durum (kaynaktan)

```text
[VERIFIED] MEVCUT JOURNAL STATE MACHINE YOKTUR.
- C:\Ops\hukuk altinda journal yuzeyi yok (kok listeleme: backup/bin/logs/
  pwsh/rollback-r02-launchers).
- C30 mekanizmasi: elevated script'lerin evidence-dizinine DUZ LOG-APPEND'i
  (c30-elevated-api-switch.log satirlari: BEGIN → pre-hash PASS → Stop →
  drained → switched → Start → DONE) + elle yazilan execution-journal.md.
- Bu satirlar STATE DEGIL, olay kaydidir: durable-write-oncesi/sonrasi ayrimi,
  transaction kimligi, allowed-predecessor, idempotent recovery tanimi YOK.
- PREPARED/POINTER_SWITCHED/LAUNCHER_SWITCHED/VERIFIED/ROLLBACK adlari mevcut
  sistemde BULUNMAZ; asagida ONERILEN semadir. Mevcut mekanizma pin gecisini
  temsil ETMEDIGINDEN sessizce yeterli SAYILMAMISTIR (talimat §D geregi).
```

### D.2 Onerilen journal (secenekten bagimsiz cekirdek)

Konum onerisi: `C:\Ops\hukuk\journal\cutover-journal.jsonl` (append-only JSONL;
elevated-only yazim ACL'i; her satir tek durable state kaydi). Her kayit §E
pin-set alanlarini tasir.

Onerilen state'ler ve gecisler (SECENEK C temel akisi; A/B icin ek alanlar
parantezde):

```text
STATE                  DURABLE YAZIM                ALLOWED PREDECESSOR
T0 PREPARED            niyet + tam pin-set +        (yok — transaction acilisi)
                       candidate hash'leri +
                       generation + nonce
T1 QUIESCED            watchdog/task disable        PREPARED
                       kaniti (task state dump)
T2 STOPPED_DRAINED     stop + listener-drain        QUIESCED
                       kaniti (port bos)
T3 HOST_SWITCHED       yeni sealed host yazildi +   STOPPED_DRAINED
   (yalniz C/B1)       post-copy hash dogrulandi
T4 LAUNCHER_SWITCHED   yeni launcher yazildi +      HOST_SWITCHED (C/B1)
                       post-copy hash dogrulandi    STOPPED_DRAINED (A/B2)
   (A/B2: once T4a MANIFEST_PUBLISHED — atomic rename kaniti)
T5 RESUMED             task enable + start issued   LAUNCHER_SWITCHED
T6 VERIFIED            content-probe: entry EXACT + T5 RESUMED
                       listener tek PID + smoke +
                       host-log "STARTED" korele
T7 COMMITTED           terminal-basari; (B: eski    VERIFIED
                       pin kaldirma kaniti dahil)
R* ROLLBACK_INITIATED  rollback karari + gerekce    T2..T6 herhangi biri
R1 ROLLBACK_APPLIED    eski cift byte-exact restore ROLLBACK_INITIATED
                       + post-hash dogrulama
R2 ROLLBACK_VERIFIED   eski release VERIFIED        ROLLBACK_APPLIED
                       (terminal-basarisizlik ama
                       TUTARLI terminal durum)
X  ABORTED_CLEAN       T0/T1'de iptal; hicbir yuzey PREPARED | QUIESCED
                       degismedi kaniti
```

Her state kaydi icin zorunlu semantik:

```text
- once-yaz-sonra-uygula: durable niyet kaydi (ORNEK: T3 oncesi
  "T3-INTENT") → dosya islemi → durable sonuc kaydi (T3). Boylece crash
  noktasi her zaman "intent var/sonuc yok" veya "ikisi de var" olarak
  ayirt edilir.
- idempotent recovery: ayni state'e ikinci gecis zararsizdir (hash zaten
  hedefse islem no-op + kayit).
- lost-response reconciliation: Start-ScheduledTask/Stop-Task cagrisinin
  YANITI kaybolursa (elevation penceresi, RPC kopmasi) recovery once
  GERCEK durumu olcer (task state + listener + host-log tail + dosya
  hash'leri) ve journal'i olculen gercege gore tamamlar; korle yeniden
  denemez.
- append butunlugu: her satir kendinden onceki satirin SHA-256'sini tasir
  (hash-chain); truncation/stale-journal recovery'de tespit edilir.
- recovery hedefi: "son dosyayi geri yaz" DEGIL — pin/pointer(launcher)/
  host/calisan-surec DORTLUSUNU tutarli terminal duruma (T7 veya R2 veya X)
  tasimak. Hicbir recovery yolu dortluyu karisik nesilde birakamaz.
```

Crash noktasi → recovery hedefi matrisi (her durable adim icin):

```text
CRASH NOKTASI                          RECOVERY HEDEFI
T0 sonrasi, T1 oncesi                  X ABORTED_CLEAN (hicbir yuzey degismedi;
                                       dogrulama: tum before-hash'ler yerinde)
T1 sonrasi (quiesced, dokunulmamis)    X (task re-enable) veya devam karari —
                                       recovery politikasi: OTOMATIK X; devam
                                       yalniz yeni yetkiyle
T2 sonrasi                             ileri (T3'e) DEGIL — otomatik recovery
                                       her zaman GERI: R1→R2 (eski cift zaten
                                       yerinde → no-op restore + verify + re-enable)
T3-INTENT var, T3 yok                  dosya olc: yeni host tam mi? tam → T3
                                       yaz, ROLLBACK karari owner-politikasina;
                                       yarim/bozuk → R1 (eski host restore)
T3 sonrasi, T4 oncesi                  R1 (cift tutarsiz: yeni host + eski
                                       launcher → eski cifte don) [C/B1]
T4 sonrasi, T5 oncesi                  olc + karar: iki dosya da yeni-tam →
                                       T5'e devam ETMEZ (otomatik recovery
                                       fail-safe GERI: R1); ileri-tamamlama
                                       yalniz canli operator karariyla
T5 sonrasi, T6 oncesi                  T6 dogrulamasini kos: PASS → T6/T7;
                                       FAIL → R* zinciri (C30 deseni)
T6/T7 sonrasi                          transaction kapali; crash etkisiz
R1 sonrasi, R2 oncesi                  R2 dogrulamasini kos (restore idempotent)
```

(A/B secilirse T4a MANIFEST_PUBLISHED state'i ve generation-karsilastirmali
recovery kurallari eklenir; B'de ayrica PIN_WINDOW_OPEN/CLOSED ciftinin her
recovery yolunda KAPANMASI zorunludur — pencere acik terminal durum YOKTUR.)

---

## E. TOCTOU, ACL VE ANTI-ROLLBACK KORUMALARI

Tasarim, secilen secenekten bagimsiz olarak su literal korumalari icerir:

```text
 1 CANONICAL PATH RESOLUTION   Her hedef Path.GetFullPath ile cozulur; beklenen
                               literal yolla ordinal karsilastirilir (host'un
                               self-identity deseninin yazim-yoluna genislemesi).
 2 REPARSE/JUNCTION REDDI      Yazim hedefi dizin zincirinde ReparsePoint
                               attribute'u → ABORT (host VerifyClosure'daki
                               cs:172-174,184 deseninin writer tarafina aynasi).
 3 SAME-VOLUME TEMP            Temp dosya hedefle AYNI volume'de olusturulur
                               (C:\Ops\hukuk\journal\tmp\) — cross-volume
                               rename'in kopya-düsmesi engellenir.
 4 RESTRICTIVE-ACL TEMP        Temp, dogum aninda elevated-only ACL ile acilir
                               (CreateFile + explicit DACL); once-yaz-sonra-kisitla
                               penceresi olusmaz.
 5 HASH-BEFORE-COPY            Kaynak candidate hash'i, yetki kaydindaki
                               beklenen hash'le eslesmeden yazim BASLAMAZ
                               (C30 elevated script'inin korunan davranisi).
 6 FLUSH/FSYNC ESDEGERI        Temp'e yazim FileStream.Flush(true) ile diske
                               indirilir; rename oncesi durable'lik garanti.
 7 ATOMIC RENAME               MoveFileEx(REPLACE_EXISTING|WRITE_THROUGH) /
                               File.Replace — hedef ya eski-tam ya yeni-tam.
                               (C30'daki Copy-Item -Force deseni KALDIRILIR:
                               kismi-yazim penceresi C30'da fail-closed'a
                               takilirdi ama pencere gereksizdir.)
 8 POST-RENAME DOGRULAMA       Rename SONRASI hedef yeniden hash'lenir + ACL
                               yeniden okunur; ikisi de beklenene esit degilse
                               transaction FAIL → R* zinciri.
 9 STABLE FILE IDENTITY        Mumkun oldugunda dogrulama ve kullanim ayni
                               acik HANDLE uzerinden (FILE_SHARE_READ, delete-
                               paylasimsiz) yapilir; hash-sonrasi-degistirme
                               penceresi handle omru boyunca kapanir. (Host
                               tarafinda bu pencere bugun VerifyClosure→
                               CreateProcessW arasi ACL-anchor'la kapatiliyor;
                               writer tarafinda handle-pinning eklenir.)
10 DIZIN ACL/OWNER DOGRULAMA   Yazim oncesi hedef dizinin DACL protected
                               durumu + owner'i dogrulanir; build-manifest'in
                               "honest boundary" kaydi geregi HARDENING
                               ONERISI: bin\ ve pwsh\ owner'i Administrators/
                               SYSTEM yapilir (non-elevated owner WRITE_DAC
                               yolunu kapatir) — K-7 kapsaminda owner karari.
11 TRANSACTION NONCE           Her transaction tek-kullanimlik GUID nonce tasir;
                               journal ve (A/B'de) manifest ayni nonce'u tasir;
                               nonce tekrari → REDDET.
12 MONOTONIC GENERATION        Her basarili COMMIT generation'i +1 yapar;
                               generation journal'da ve (A/B'de) manifest'te;
                               kucuk-esit generation'li herhangi bir talimat
                               STALE sayilir.
13 STALE TRANSACTION REDDI     Recovery, expiresAt/bounded-use disindaki veya
                               nonce'u tuketilmis transaction kayitlarini
                               yalniz KAPATIR (X/R2'ye), asla ileri tasimaz.
14 ROLLBACK GENERATION         Rollback ESKI generation'a donus DEGILDIR: yeni
                               generation altinda eski kimliklerin yeniden
                               yayimlanmasidir (downgrade-replay ayrimi).
15 DOWNGRADE ENGELI            Yetkisiz/eski launcher hash'ine gecis: pin
                               dogrulamasi (secenege gore binary-ici veya
                               manifest) + generation + journal uclusunun
                               UCUNDEN de gecmek zorundadir; tek basina dosya
                               restore'u calisan sistem uretmez.
16 JOURNAL-DOSYA RECONCILIATION Her recovery girisi ve her yeni transaction
                               acilisi, journal'in son terminal state'i ile
                               DISK GERCEGINI (tum §B yuzey hash'leri)
                               karsilastirarak baslar; uyusmazlik →
                               transaction ACILMAZ, DRIFT raporu uretilir.
```

Pin-set kaydi (journal + varsa manifest) asgari su kimlikleri tasir; secret
ICERMEZ:

```text
transactionId              (GUID)
generation                 (monotonic int)
component                  (api | web)
launcherPath               (canonical literal)
launcherSha256
hostBinarySha256           (C/B1'de cift-degisimin parcasi)
releaseRoot                (canonical literal)
releaseManifestSha256      (RELEASE-MANIFEST dokuman hash'i)
envFileSha256              (icerik degil, kimlik — C30 ENV-COPY-01 deseni)
createdAt                  (UTC)
expiresAt | boundedUse     (suresiz pencere YASAK)
ownerAuthorizationReference (paket/supplement SHA'lari — C30 §1 deseni)
prevRecordSha256           (journal hash-chain)
```

---

## F. WATCHDOG KOORDINASYONU

### F.1 Kanitlanan mevcut mekanizmalar

```text
W1 TimeTrigger PT15M repetition   [VERIFIED task XML] StartBoundary
   2026-08-28T18:00+03 → tick'ler :00/:15/:30/:45. Host zaten calisiyorsa
   MultipleInstancesPolicy=IgnoreNew → dokunmaz [OBSERVED: Web host'u
   28.08'den beri kesintisiz, yeni instance yok]. Host olmusse yeni host
   baslatir (crash-recovery; "API self-recovered PT15M" R03 kaydi).
W2 RestartOnFailure PT2M×3        [VERIFIED task XML] — ANCAK C30'da host
   exit 104 SONRASI 12:04:32→12:10:54 penceresinde HICBIR yeniden baslatma
   OLMADI [OBSERVED host-api.log: arada "begin" satiri yok]. Cikarim
   [INFERRED]: Task Scheduler RestartOnFailure'i launch/crash failure'da
   isletir; child'in NONZERO EXIT'i "completed (with result)" sayilir ve
   restart TETIKLEMEZ. Tasarim bu davranisi VARSAYMAZ; G4 kapisi bunu
   disposable ortamda deneysel qualify eder.
W3 Launcher-ici HL_HOST_PID poll  [OBSERVED kod + log] Host olurse launcher
   child-tree'yi oldurur (orphan-prevention); Stop-Task → WM_CLOSE →
   Environment.Exit(1) → job kill-on-close → tree reaped [OBSERVED:
   "stop-signal - exiting; job kill-on-close reaps child tree"].
W4 Ayri watchdog sureci/task'i    YOK [VERIFIED tarama].
```

### F.2 Transaction sirasinda yaris analizi

```text
YARIS PENCERESI: T2(drain)→T5(resume) arasi bir PT15M tick'i gelirse scheduler
host'u baslatir; host o anki launcher'i hash'ler:
  - dosya eski-tam → ESKI release'i baslatir (transaction'in altini oyar:
    listener acilir, drain-varsayimi bozulur);
  - dosya yeni-tam (T4 sonrasi, T5 oncesi) → YENI release'i journal'in
    "resume" kaydi olmadan baslatir (journal-gercek sapmasi);
  - (mevcut Copy-Item deseninde) yarim dosya → 104 fail-closed (guvenli ama
    transaction sonucu belirsizlesir).
C30'DA GERCEKLESMEDI [OBSERVED]: pencere 12:04→12:11 tick'lere denk gelmedi
(sonraki tick 12:15'ti) ve RestartOnFailure tetiklenmedi (W2). Yani C30'un
temiz gecmis olmasi SANS + davranis kombinasyonudur; tasarim bunu garanti
altina alir.
```

### F.3 Koordinasyon modeli (owner karari K-2)

Mevcut guvenli koordinasyon mekanizmasi YOKTUR (pause/maintenance modu yok);
bu nedenle asagidaki model YENI TASARIM olarak owner'a sunulur; C31'de
UYGULANMAZ:

```text
ONERILEN (F-A) BOUNDED JOURNAL-VISIBLE QUIESCE
  T1'de: Disable-ScheduledTask (API icin; Web transaction'a dahilse Web icin)
  + journal T1 kaydina task-state dump'i + quiesce expiresAt (ornek: 30 dk).
  T5/R*/X'te: Enable-ScheduledTask + kayit. Recovery her yolda re-enable'i
  GARANTI eder (watchdog'suz kalinan sure bounded; expiresAt asilirsa recovery
  zorla R* zincirine girer ve re-enable eder). Watchdog TAMAMEN KAPATILMAZ:
  yalniz transaction'daki komponentin tetigi, yalniz pencere suresince ve
  journal'a gorunur bicimde askiya alinir; diger komponentin watchdog'u
  DOKUNULMAZ kalir.
ALTERNATIF (F-B) TICK-ARASI PENCERELEME (quiesce'siz)
  Transaction'i iki tick arasina sigdirmak + W2 davranisina guvenmek.
  REDDEDILEN VARSAYIMLAR icerir (tick hizalamasi, W2'nin deneysel olarak
  dogrulanmamis semantigi, elevation-prompt gecikmeleri) → yalniz kayit
  amacli listelenmistir; RECOMMENDATION DEGILDIR.
CRASH SONRASI WATCHDOG'UN GORDUGU DURUM
  F-A altinda: task DISABLED ise watchdog devreye giremez → recovery'nin
  ilk isi journal'i okuyup re-enable karari vermektir (bkz. §D matrisi);
  task ENABLED ve dosyalar tutarliysa watchdog normal calisir (PT15M
  self-heal — C30 rollback'inin dogal tamamlayicisi).
```

---

## G. API/WEB SIRASI VE ROLLBACK MATRISI

On-olgular: API ve Web AYRI task, AYRI host sureci, AYRI launcher ve AYRI
pin sabitidir [VERIFIED]; DB migration'lari yalniz API release'ine baglidir;
Web (Next 3002) DB'ye dogrudan gitmez; canli ayrisma zaten mevcuttur
(Web=R11, API=R13 — C30 STILL_OPEN kalemi).

| Senaryo | Analiz | Canonical terminal durum |
|---|---|---|
| API-only cutover | C30'un denedigi; tum tasarim dogrudan uygular | T7 (API yeni) veya R2 (API eski); Web DOKUNULMAMIS — her iki halde TUTARLI |
| Web-only cutover | Ayni makine, ayni desen; DB kapisi yok (RequireDb=false) | T7 veya R2; API dokunulmamis |
| API sonra Web (sirali iki transaction) | Onerilen varsayilan (K-3): API T7/R2 TERMINAL olmadan Web T0 ACILMAZ; iki ayri transactionId, ayri generation | Ara durum "API yeni + Web eski" MESRU kayitli durumdur (bugunku canli ayrismanin simetrigi); ikinci transaction ayri karara tabidir |
| Tek transaction altinda API+Web | Tek transactionId, dort-dosya durum-uzayi; kismi basari tanimi zorunlu | Yalniz "ikisi de T7" basari; herhangi biri R* → IKISI de R2'ye (cift-rollback) — bu maliyet nedeniyle RECOMMENDATION: sirali iki transaction |
| API basari / Web basarisiz | Sirali modelde: API T7 kalir, Web R2 | API yeni + Web eski; kayitli, tutarli, bir sonraki Web denemesi yeni GO ister |
| API basarisiz / Web dokunulmamis | C30'un GERCEKLESEN sonucu | API R2 + Web dokunulmamis (kanitlanmis desen) |
| Migration uygulanmis + API rollback | C30 KANITLADI: R13, post-migration schema ile 40dk 8/8 stabil; forward-compatible-migration politikasi (DDL-additive) bu senaryoyu tasarimin BIRINCIL rollback varsayimi yapar | R2 + DB migrated (restore YOK); her cutover oncesi GATE1-esdegeri "eski release + migrated schema" qualification kaniti ZORUNLU (aksi halde rollback güvencesi dusuktur → cutover GO verilemez) |
| Launcher switch basarili, host start sonucu KAYIP | T5-INTENT var / T5 sonucu yok; lost-response protokolu (§D): task state + listener + host-log olc, journal'i gercege tamamla | Olculen gercege gore T6'ya devam veya R* |
| Pointer(launcher) degisti, journal sonucu yazilamadi | T4-INTENT var / T4 yok; recovery dosyayi olcer: yeni-tam → fail-safe GERI (R1) — ileri-tamamlama yalniz operator karariyla | R2 (varsayilan) |
| Watchdog transaction ortasinda restart denemesi | F-A quiesce altinda IMKANSIZLASTIRILIR (task disabled); quiesce ihlali (baska yoldan start) → journal-gercek reconciliation DRIFT uretir | Transaction FAIL → R* zinciri + DRIFT raporu |

---

## H. IMPLEMENTATION ACCEPTANCE KAPILARI (G1-G17)

Asagidaki kapilarin TAMAMI PASS olmadan implementation'a veya production'a GO
verilemez. C31 analizinin her kapiya katkisi ve KALAN acik kayitlidir:

```text
G1  Live binary ↔ reviewed source identity
    C31 durumu: VERIFIED_VIA_SEALED_ATTESTATION (§A.2). KALAN: implementation
    fazinda G13 ile birlikte yeni uretilecek her binary icin ayni zincirin
    (source-SHA + compiler + binary-SHA + qual kaydi) YENIDEN kurulmasi.
G2  Exit-104 exact decision path
    C31 durumu: VERIFIED (§A.1). KALAN: yok (kapali).
G3  Pin/pointer/launcher writer inventory
    C31 durumu: COMPLETE (§B; ikinci writer bulunamadi). KALAN: implementation
    aninda fresh yeniden-tarama (envanter zaman-damgalidir).
G4  Hidden second writer / watchdog race qualification
    C31 durumu: statik analiz tamam (§F); W2 RestartOnFailure semantigi
    [INFERRED] — KALAN: disposable ortamda DENEYSEL dogrulama (nonzero-exit,
    crash, kill varyantlari).
G5  State-machine exhaustive transition/model test         → rehearsal (§I)
G6  Disposable successful cutover                          → rehearsal (§I)
G7  Injected-crash recovery (her durable adimda)           → rehearsal (§I)
G8  Lost-response reconciliation                           → rehearsal (§I)
G9  ACL/reparse/TOCTOU negative testler                    → rehearsal (§I)
G10 Stale transaction / replay / downgrade negative        → rehearsal (§I)
G11 API rollback with migrated schema
    C31 durumu: C30 CANLI KANITI mevcut (R13+migrated 40dk 8/8) — ancak bu
    KAPIYI KAPATMAZ: her yeni release cifti icin disposable GATE1-esdegeri
    yeniden kosulur.
G12 Web/API split-failure matrix                           → rehearsal (§I)
G13 Deterministic build/package identities
    C31 notu: host binary reproducible DEGIL (seal-attestation modeli); API
    dist BYTE-DETERMINISTIC (C30 kaniti). Kapi, secenek C'de "seal zinciri
    kaydi", A/B'de ek olarak manifest kimligi uzerinden tanimlanir.
G14 Runtime content-probe identity                         → rehearsal + cutover
G15 Stability window                                       → cutover-sonrasi
G16 Restore/rollback artefact hashes                       → implementation
G17 Production authorization package hash-bound
    C30 §1 deseni (PKG/SUP/MAN SHA baglari) aynen devralinir.
```

---

## I. REHEARSAL PLANI (C31'DE YURUTULMEZ)

Canli C:\Ops\hukuk DISINDA, disposable kopyada (ornek: C:\Ops-rehearsal\hukuk
+ ayri task adlari + ayri portlar + fixture release'ler; gercek production
secret KULLANILMAZ — qualification fixtures deseni):

```text
R-01 Successful API cutover (T0→T7 tam yol)
R-02 Successful Web cutover
R-03 Combined (sirali iki-transaction) cutover
R-04 Her durable state ONCESI ve SONRASI injected crash (T0..T7, R*, X icin
     process-kill + power-loss simulasyonu) → §D matrisindeki hedefe ulasma
R-05 Stale journal (eski transactionId ile acilis) → reddet + kapat
R-06 Truncated journal (hash-chain kirigi) → DRIFT tespiti, transaction acilmaz
R-07 Wrong launcher hash (tamper) → 104-esdegeri fail-closed + R2
R-08 Wrong manifest hash (A/B secilirse) → fail-closed
R-09 ACL drift (broad-SID write ACE enjeksiyonu) → 111-esdegeri + DRIFT
R-10 Reparse substitution (dizin→junction degisimi) → red
R-11 Watchdog restart yarisi: quiesce ihlali simulasyonu + PT15M tick'i
     transaction ortasina zorlama + W2 semantiginin deneysel olcumu (G4)
R-12 Lost UAC response (elevation penceresi kapatilir) → lost-response protokolu
R-13 Scheduled Task lost response (Start/Stop RPC kesintisi) → ayni protokol
R-14 Rollback candidate corruption (restore kaynagi bozuk) → restore REDDI +
     PRESERVED_RESIDUAL raporu (kor restore YASAK)
R-15 Generation replay/downgrade (eski generation'li manifest/talimat) → red
R-16 Migration-applied + old-runtime compatibility (GATE1-esdegeri)
```

Basari kriteri: 16/16 PASS + her testin journal cikti dosyasi hash'lenmis
evidence paketi. Rehearsal, implementation'la AYNI owner GO'suna baglanabilir
veya ayrilabilir (K-6).

---

## J. RELEASE14 CANDIDATE KARARI

Fresh karsilastirma (bu oturum):

```text
CANDIDATE SOURCE SHA       024c5b17 (worktree HEAD, detached)        [VERIFIED]
CURRENT MAIN               cb8fe470                                   [VERIFIED]
ARADAKI DELTA              yalniz docs: release14-cutover-record-r01.md
                           (+317 satir; #2488+#2489 squash'lari)      [VERIFIED]
RUNTIME-RELEVANT TREE DELTA = 0                                       [VERIFIED]
BUILD MANIFEST             RELEASE14-MANIFEST (6371dff9…) evidence'ta duruyor;
                           dist agaclarina bu oturumda DOKUNULMADI    [OBSERVED]
.ENV                       R14 == R13 birebir (804F9414…, 1410 B)     [VERIFIED]
DEPENDENCY LOCK            pnpm-lock RELEASE13'le birebir (manifest §2)[OBSERVED]
MIGRATION SETI             tek pending migration ZATEN APPLIED/VERIFIED (C30);
                           R14'un DB-oncesi kosulu ARTIK BOS KUMEDIR  [OBSERVED]
C30 SONRASI KOD DEGISIKLIGI YOK (docs-only delta)                     [VERIFIED]
```

Owner secenekleri (K-4):

```text
J-A  MEVCUT RELEASE14 CANDIDATE'I IMMUTABLE YENIDEN KULLAN
     Lehte: runtime-delta 0; dist deterministik-dogrulanmis; .env hazir;
     en dusuk yeni-is. Aleyhte: candidate'in butunlugu cutover aninda
     RELEASE14-MANIFEST'e karsi FRESH re-hash ile yeniden kanitlanmalidir
     (aradan gecen sure boyunca worktree korumasi yalniz konvansiyoneldir).
J-B  FRESH MAIN'DEN RELEASE14-R02 CUT
     Lehte: en taze kaynak; yeni kayit temizligi. Aleyhte: runtime-delta 0
     iken tum qualification zincirini (build determinism, GATE1/GATE2)
     yeniden kosturur; kazandirdigi tek sey docs-delta'dir.
J-C  CANDIDATE'I YALNIZ REHEARSAL REFERANSI OLARAK KORU
     Implementation gecikirse/yeni release gelirse dogal secenek.
RECOMMENDATION: J-A (cutover-ani fresh manifest re-hash KOSULUYLA); yeni
runtime-relevant merge olusursa otomatik J-B'ye duser.
KARAR VERILMEDEN CANDIDATE YENIDEN KULLANILMAZ.
```

---

## K. ACIK OWNER KARARLARI

```text
K-1  MIMARI SECENEK (A / B1 / B2 / C)
     PROPOSAL        SECENEK C — quiesced sealed-host coordination (§C.5)
     ALTERNATIVES    A (§C.3), B1/B2 (§C.4)
     SECURITY EFFECT C: guven koku degismez (en guclu). A/B2: koku
                     binary+elevated-dosyaya genisler (fail-closed korunur,
                     pin-degistirme esigi duser). B1: koku degismez, cift seal.
     RECOVERY EFFECT C: cift-dosya restore (kanitli desen + binary bileseni).
                     A/B2: rename-atomik manifest + tek dosya. B: pencere
                     kapatma zorunlulugu.
     RECOMMENDATION  C
     OWNER DECISION  = PENDING

K-2  WATCHDOG KOORDINASYON YONTEMI
     PROPOSAL        F-A bounded journal-visible quiesce (§F.3)
     ALTERNATIVES    F-B tick-arasi pencereleme (reddedilen varsayimlarla)
     SECURITY EFFECT F-A: watchdog yalniz pencere suresince ve kayitli askida;
                     tam kapatma YOK. F-B: yarisi sansa birakir.
     RECOVERY EFFECT F-A: her recovery yolu re-enable garantili (bounded).
     RECOMMENDATION  F-A
     OWNER DECISION  = PENDING

K-3  API/WEB TRANSACTION SIRASI
     PROPOSAL        Sirali iki bagimsiz transaction: once API (T7/R2 terminal),
                     sonra ayri GO ile Web
     ALTERNATIVES    tek-transaction kombinasyonu (cift-rollback maliyeti, §G)
     SECURITY EFFECT esdeger; sirali model durum-uzayini kucultur
     RECOVERY EFFECT sirali: kismi basari mesru kayitli durumdur
     RECOMMENDATION  sirali (API once)
     OWNER DECISION  = PENDING

K-4  RELEASE14 CANDIDATE DISPOSITION
     PROPOSAL        J-A (immutable reuse + cutover-ani fresh re-hash)
     ALTERNATIVES    J-B fresh cut, J-C rehearsal-referansi
     SECURITY EFFECT J-A kosulu re-hash'i zorunlu kilar; esdeger
     RECOVERY EFFECT degisiklik yok (RELEASE13 rollback koku korunur)
     RECOMMENDATION  J-A
     OWNER DECISION  = PENDING

K-5  SEALED-HOST DEGISIKLIGI ENGINEERING LANE'I
     PROPOSAL        C secilirse: HY_OPS_DURABILITY_R04 lane'i (R03.2 zincirinin
                     devami; ayni src/qual/manifest/APPLY yapisi; pin'ler
                     release-parametrik) — implementation GO'suyla acilir
     ALTERNATIVES    A/B secilirse: ayni lane, kapsam host-kod degisikligi +
                     yeni negatif testler
     SECURITY EFFECT lane, seal zincirini (source-SHA+compiler+binary-SHA+qual)
                     her binary icin yeniden kurmakla yukumludur (G1/G13)
     RECOVERY EFFECT rollback paketleri lane cikti standardina dahildir (G16)
     RECOMMENDATION  R04 lane'i
     OWNER DECISION  = PENDING

K-6  IMPLEMENTATION + REHEARSAL SAYFA YAPISI
     PROPOSAL        TEK sayfa (C32): implementation + disposable rehearsal
                     birlikte (rehearsal, implementation'in kabul kapisidir;
                     ayirmak yapay senkron noktasi uretir); production cutover
                     HER DURUMDA AYRI sayfa/GO
     ALTERNATIVES    ayri sayfalar (C32 impl + C33 rehearsal)
     SECURITY EFFECT esdeger; tek sayfa kapi-atlama riskini G5-G12'nin ayni
                     GO'da zorunluluguyla dengeler
     RECOVERY EFFECT yok
     RECOMMENDATION  tek sayfa + ayri production sayfasi
     OWNER DECISION  = PENDING

K-7  BACKUP / EVIDENCE / CANDIDATE RETENTION (+ ACL hardening)
     PROPOSAL        C30 retention'lari AYNEN devam (BACKUP-01 dump, C30_EVIDENCE,
                     RELEASE14 candidate + .env, RELEASE13/12/11, R03 paketi);
                     EK ONERI: bin\ + pwsh\ owner'inin Administrators'a
                     alinmasi (build-manifest hardening notu; §E/10) —
                     implementation fazinda, ayri kayitla
     ALTERNATIVES    retention daraltma (onerilMEZ: rollback kokleri)
     SECURITY EFFECT hardening non-elevated WRITE_DAC yolunu kapatir
     RECOVERY EFFECT retention, tum R* yollarinin on-kosuludur
     RECOMMENDATION  PROPOSAL aynen
     OWNER DECISION  = PENDING
```

---

## L. PR1 STATUSU

```text
DESIGN          = DELIVERED
ROOT CAUSE      = VERIFIED (§A; sinif: LAUNCHER SCRIPT HASH MISMATCH —
                  compile-time SHA_PAPI pin'i ≠ RELEASE14 launcher hash'i)
OWNER DECISIONS = PENDING (K-1..K-7)
IMPLEMENTATION  = NOT AUTHORIZED
PRODUCTION      = UNCHANGED
```

---

## M. PRODUCTION MUTATION = 0 KANITI (analiz oncesi/sonrasi)

Bu analiz yalniz salt-okuma yaptI. Guvenlik-kritik statik yuzeylerin analiz
oncesi ve PR1-oncesi tekrar olcumleri BIREBIRDIR:

```text
C:\Ops\hukuk\bin\hukuk-task-host.exe      0FA10601…D84  (before == after)
C:\Ops\hukuk\bin\start-api.ps1            4ACDC9D9…819  (before == after)
C:\Ops\hukuk\bin\start-web.ps1            B34B7A16…002  (before == after)
C:\Ops\hukuk\bin\pwsh-file-manifest.json  84E530B1…07A  (before == after)
C:\Ops\hukuk\bin\db-readiness.js          AD18CBB6…3A9  (before == after)
Scheduled Task tanimlari                  salt sorgu (schtasks /query /xml)
ACL'ler                                   salt okuma (Get-Acl)
pwsh klonu                                salt sayim (994)
log dosyalari                             salt okuma (host tarafindan yazilan
                                          canli-degisken dosyalar; bu oturumda
                                          onlara YAZIM YOLU kullanilmadi)
.env                                      ICERIK OKUNMADI; yalniz hash+boyut
                                          (804F9414…, 1410 B — C30 kanonik
                                          kaydindaki degerle birebir)
process/task action                       0 (stop/start/register YOK)
DB action                                 0
```

Secret, PII, token, `.env` icerigi bu kayda YAZILMAMISTIR.

---

## TERMINAL BEYAN (PR1 ani)

```text
C31 = DESIGN_DELIVERED / BLOCKED_OWNER_DECISION (K-1..K-7 PENDING)
NEW EXECUTION AUTHORITY = NONE
NEXT: owner checkpoint → ratifikasyon gelirse PR2 (append-only karar kaydi);
      implementation + rehearsal AYRI owner GO ister; production cutover
      AYRICA yetkilendirilir.
```

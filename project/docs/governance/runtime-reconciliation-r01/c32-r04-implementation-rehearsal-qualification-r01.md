# C32 — HY_OPS_DURABILITY_R04 IMPLEMENTATION + DISPOSABLE REHEARSAL QUALIFICATION (R01)

```text
KAYIT              runtime-reconciliation-r01/c32-r04-implementation-rehearsal-qualification-r01.md
GOREV              C32 / HY_OPS_DURABILITY_R04 — SEALED-HOST CUTOVER IMPLEMENTATION + DISPOSABLE REHEARSAL
EXECUTION CLASS    ENGINEERING + QUALIFICATION + GOVERNANCE MATERIALIZATION
KAYIT TURU         QUALIFICATION KAYDI — NON-AUTHORIZING (production yetkisi URETMEZ)
TARIH              2026-08-29 (UTC; C31 kapanisi d5b2899e sonrasi fresh)
BASELINE           main == origin/main == d5b2899e (talimat beklentisiyle BIREBIR) · acik PR 0

IMPLEMENTATION            = DELIVERED (HY_OPS_DURABILITY_R04)
REHEARSAL                 = 16/16 PASS (iki bagimsiz temiz kosum)
G1-G17                    = 17/17 PASS
PRODUCTION BEFORE==AFTER  = TRUE (mutation 0)
TERMINAL VERDICT          = PENDING_OWNER
IMPLEMENTATION AUTHORITY  = CONSUMED_BY_C32
PRODUCTION AUTHORITY      = NONE
```

Kanit etiketleri: `VERIFIED` (bu oturumda komut/olcumle dogrulandi) · `OBSERVED`
(bu oturumda dosya/log iceriginde goruldu) · `INFERRED` (dogrulanmis olgulardan
turetildi) · `ATTESTED` (owner-ratified onceki qualification kaydina dayanir).

---

## A. PARENT PROVENANCE VE FRESH PREFLIGHT

### A.1 Baglayici kaynak zinciri

```text
C31 PR1  #2490 / squash 8f7612b2  (tasarim R01)                      [VERIFIED]
C31 PR2  #2491 / squash d5b2899e  (owner ratification append)        [VERIFIED]
TASARIM  project/docs/governance/runtime-reconciliation-r01/
         c30-f01-launcher-pin-atomic-cutover-design-r01.md
         SHA-256 D68ECE1AD45779FA527DA9D653E22FFF2066FE06CF9300F709A51ECE650C5D79
         (1182 satir; TAM okundu; K-1..K-7 + dokuz ek kosul mevcut)   [VERIFIED]
PARENT   HY_OPS_DURABILITY_R03 (1093 dosya envanteri hash'lendi;
         hicbir dosyasi YERINDE DEGISTIRILMEDI)                       [VERIFIED]
```

### A.2 Fresh preflight sonuclari (talimat §3)

```text
1-2  git fetch origin main; main == origin/main == d5b2899e          [VERIFIED]
3    acik PR envanteri = 0 (ayni yuzeyde aktif writer YOK)           [VERIFIED]
4-5  tasarim TAM okundu; C31 ratifikasyon append'i K-1..K-7 + dokuz
     ek baglayici kosulu EKSIKSIZ icerir                             [VERIFIED]
6-7  R03 paketi salt-okuma envanterlendi (kaynak/toolchain/build/
     manifest/qualification/APPLY/SHA zinciri); before-hash'ler korundu
     → provenance\r03-package-inventory.sha256 (1093 satir)          [VERIFIED]
8    FRESH ve BOS R04 koku olusturuldu; kok zincirinde reparse YOK   [VERIFIED]
9    R04'e YALNIZ provenance kayitli kopyalar alindi (parity dogrulandi)
10   production-before fingerprint salt-okuma olculdu (§F)           [VERIFIED]
11   C31 §M kapanis olcumuyle drift = 0                              [VERIFIED]
12   secret/env icerigi OKUNMADI (yalniz kanonik hash referanslari)
13   R04 lane'i R03 EMSALINDEKI sealed dis-paket lane'idir
     (C:\Development\HUKUK_YAZILIMI\HY_OPS_DURABILITY_R04; repo-tracked
     DEGIL) → K-5 lane sinirina uygun; owner checkpoint GEREKMEDI    [VERIFIED]
```

---

## B. R04 ARTEFAKT ENVANTERI VE HASH'LERI

Paket koku: `C:\Development\HUKUK_YAZILIMI\HY_OPS_DURABILITY_R04` (repo DISI,
K-5 lane siniri). Immutable manifest: `manifest\r04-sha256-manifest.txt`
**SHA-256 `A5216D6352C1EF5AA6FF027F9CE0E44597C3BB2D28964EEEA749A2AA39B8CD30`**
(31 dosya; iki bagimsiz verification PASS; missing/extra/hash/size = 0).

| SHA-256 (ilk 16) | Dosya | Rol |
|---|---|---|
| 7428D6BAB897D4CB | src\hukuk-task-host.r04.template.cs | sealed host kaynak sablonu (18 compile-time placeholder) |
| BE6FAF0FE265D7AF | build\make-template.ps1 | R03 kaynagindan template turetimi |
| 7DEBC3FB876C6609 | build\build-r04-host.ps1 | pinset → csc → seal-attestation + gen manifest |
| 933D66EE2CA3E928 | build\determinism-finding.json | G13 toolchain determinizm olcumu |
| DC478F2ADCFF4AF6 | build\make-evidence-manifest.ps1 | paket manifest uretimi + verification |
| F6D5B8DD6A87A3E4 | engine\isolation-guard.ps1 | fail-closed izolasyon kapisi |
| 24C5694DF2E30A2B | engine\cutover-journal.ps1 | T0-T7/R*/X state machine + hash-chain |
| 51E27F89AED6F18C | engine\atomic-write.ps1 | §E 1-16 TOCTOU/anti-rollback yazma |
| CD5CB331D63F94C3 | engine\transaction.ps1 | quiesced sealed-host transaction (Secenek C) |
| 53EC77E7D298AB72 | engine\recovery.ps1 | idempotent crash/lost-response recovery |
| E025B5DFB7E72C2A | engine\load.ps1 | kutuphane yukleyici |
| 90C8926C64CBB186 | engine\run-transaction.ps1 | CLI (crash-injectable child) |
| 9869BB078C6D27CF | engine\run-recovery.ps1 | CLI recovery |
| 7C3F3A264FCCCACA | fixtures\make-fixtures.ps1 | synthetic fixture + 4 disposable launcher |
| 7694F04FDCC51D9A | rehearsal\setup-env.ps1 | temiz disposable ortam kurulumu (G0/G1/G2) |
| BB86E6B6D28C8B5C | rehearsal\run-rehearsal.ps1 | 16-test suite runner |
| 89D0318C0BA8B3EB | rehearsal\teardown-env.ps1 | residual-0 temizlik |
| EB322A291D3F8A00 | evidence\make-gate-matrix.ps1 | G1-G17 matris turetimi |
| E71B36AE7C0C2FAE | evidence\g1-g17-matrix.json | G1-G17 = 17/17 |
| 340CC904FB39C45B | evidence\rehearsal-results.json | rehearsal kosum-2 (16/16) |
| 0DEFC3771FADE04F | evidence\rehearsal-results-run1.json | rehearsal kosum-1 (16/16) |
| 387618CBBC701368 | evidence\rehearsal-run.log | kosum-2 tam log |
| 4BFD48C2459902A9 | evidence\rehearsal-run1.log | kosum-1 tam log |
| 4417563CF9E73968 | evidence\production-before-fingerprint.json | before olcumu |
| E7244A090CB6A154 | evidence\production-after-fingerprint.json | after olcumu |
| 106F5D6D3068AD65 | evidence\production-before-after-comparison.json | identical=true |
| 985865313CEEBCA0 | provenance\r03-package-inventory.sha256 | R03 1093 dosya envanteri |
| 119E09E2248E089C | provenance\r03-src\hukuk-task-host.cs | R03 kaynak kopyasi (parity) |
| 84E530B1A90F5A06 | provenance\r03-src\pwsh-file-manifest.json | R03 klon manifesti (parity) |
| 180C8CF28C4BB720 | provenance\r03-to-r04-template-derivation.json | turetim kaydi |
| 3F24F1943402D44E | provenance\r03-to-r04-template.diff | turetim diff'i (36 +/- satir) |

Sealed binary'ler (G0/G1/G2) ve rollback bundle'lari her rehearsal kosumunda
disposable kokte fresh uretilir (`generations\<G>\hukuk-task-host.exe` +
`gen-build-manifest.json` + `rollback-bundles\bundle-manifest.json`); kalici
paketin parcasi degildirler cunku her kosum kendi seal turunu uretir (D1
disiplini: APPLY o turun EXACT binary'sini kullanir, rebuild etmez).

---

## C. IMPLEMENTATION OZETI (talimat §5 kalem-kalem)

```text
 1 T0-T7/R*/X journal state machine   engine\cutover-journal.ps1 (JSONL, append-only,
                                      durable Flush(true), BOM'suz UTF-8)
 2 Allowed-predecessor dogrulamasi    $AllowedPred tablosu; ihlal -> JOURNAL-PRED throw
 3 Durable append + truncated-journal hash-chain (prevRecordSha256); kirik zincir ->
   fail-closed                        JOURNAL-DRIFT, append REDDEDILIR
 4 Idempotent recovery                ayni durable state'e ikinci gecis yalniz
                                      Idempotent bayragiyla; R_INIT/R2 self-transition
 5 Lost-response reconciliation       Measure-RealState ONCE olcer (hash+task+listener+
                                      entry+journal); ikinci UAC/writer cagrisi YOK
 6 Compile-time pinli sealed build    build-r04-host.ps1: template placeholder ->
                                      pinset -> csc; pin BINARY ICINDE
 7 source→toolchain→build→manifest→   gen-build-manifest.json: templateSha +
   sealed binary attestation          filledSourceSha + compilerSha + binarySha + pin
 8 Ortak-binary generation modeli     G0=api-old/web-old · G1=api-new/web-old ·
                                      G2=api-new/web-new (tek binary CIFT pin)
 9 Rollback generation'lari           G1->G0 ve G2->G1 (Restore-GenerationPair)
10 Karisik generation reddi           reconciliation + bundle identity; her recovery
                                      yolu DORTLUYU (binary+launcher+release+task)
                                      tutarli terminale tasir
11 K-3 sirali transaction             API T7 terminal olmadan Web T0 ACILAMAZ
                                      (T0 allowed-pred = '' | T7 | R2 | X)
12 F-A bounded journal-visible        T1 QUIESCED: Disable-ScheduledTask + task-state
   component quiesce                  dump; yalniz HEDEF component; digeri dokunulmaz
13 Quiesce timeout + crash recovery   expiresAt bounded; her recovery yolu re-enable
14 J-A RELEASE14 freshness validator  runtime-relevant delta 0 dogrulandi (§E.4)
15 16 TOCTOU/ACL/reparse/anti-rollback engine\atomic-write.ps1 (§E 1-16 birebir)
16 Stale/nonce-replay/downgrade reddi Test-PinGuard (monotonic generation + nonce set)
17 Same-volume temp + restrictive ACL Invoke-AtomicFileWrite: hedef dizinde temp,
   + flush + atomic rename + post-hash FileShare::None, Flush(true), MoveFileEx,
                                      post-rename re-hash + reparse denetimi
18 Binary/launcher/release-manifest/  pin-set (§E) her journal kaydinda; bundleId
   transaction identity binding       transaction'a bagli
19 Watchdog + Scheduled Task          R-11: quiesce + lost-response; task-state
   lost-response reconciliation       'Running' ise IgnoreNew yutmasi olculur
20 Fail-closed exit-code sozlesmesi   0 basari · 37 guard-violation · 40 tx-hata ·
                                      41 recovery-hata/BLOCKED · 99 crash-inject
21 Rollback bundle identity+integrity Test-RollbackBundleIntegrity; bozuk kaynak ->
                                      restore REDDI (kor restore YASAK)
```

**Trust-root beyani:** pin ve trust-root BINARY ICINDE kalir. R04 hicbir runtime
dosya-tabanli pin listesi, serbest pin kaynagi veya trust-root dosyasi URETMEZ.
Pin degistirme yolu YALNIZCA yeni sealed binary uretimidir (K-1 siniri aynen).

**Kanonik tasarimdan sapma:** YOK. Iki uygulama detayi kayda gecirilir:
1. **Rename-aside (image-lock gerceklikleri).** Ortak sealed binary calisirken
   `File.Move(overwrite)` Windows tarafindan reddedilir (`Access denied`,
   OLCULDU). Windows `running exe -> .old-<guid>` rename'ine IZIN VERIR. Bu
   nedenle atomic-write once overwrite-rename dener, reddedilirse rename-aside
   uygular. Bu, tasarim §C.5'in "host exe calisirken degistirilemez → quiesce
   zorunlu" olgusunun DOGRU realizasyonudur; mantiksal atomiklik korunur
   (islem T-INTENT/T-DURABLE ciftiyle bracketlenmistir).
2. **Journal T0 allowed-predecessor'a terminal state'ler eklendi.** K-3 sirali
   modelde API T7 terminal olduktan sonra Web transaction'inin AYNI journal'da
   acilabilmesi icin gereklidir (R-03 ile kanitlandi). Terminal olmayan durumdan
   yeni transaction ACILAMAZ (R-15'te dogrulandi).

---

## D. IZOLASYON KANITI (talimat §4)

```text
GUARD                engine\isolation-guard.ps1 (fail-closed; PASS olmadan hicbir
                     test/rehearsal baslamaz)
PATH KARSILASTIRMA   canonical resolved path (Path.GetFullPath) + ordinal-ci
                     karsilastirma + reparse zincir denetimi (string-prefix TEK
                     BASINA DEGIL) + 8.3/short-name (~) reddi
ALLOWLIST            yalniz rehearsal-root altindaki hedefler
DENY (kesin red)     C:\Ops\hukuk · HY_W4_RELEASE* (RELEASE11/12/13/14 candidate) ·
                     HY_OPS_DURABILITY_R03 · repo calisma agaci · C30_EVIDENCE ·
                     C30_DEPLOY_BACKUP · C:\Windows · Program Files
TASK ADI             HukukPlatform-API/Web KESIN RED; zorunlu prefix
                     Hukuk-C32-R04-<uuid>-* disi RED
PORT                 8080/3002 KESIN RED; yalniz dynamic-high (49152-65535)
.ENV                 \.env deseni kesin RED
INVOCATION KIMLIGI   fresh transaction UUID + rehearsal-root identity + artefakt
                     manifest hash + allowlisted component + generation +
                     bounded expiry (>0 ve <=24h)
```

Isolation guard rehearsal boyunca hicbir ihlal uretmedi; tum yazim/etki
islemleri disposable kok altinda gerceklesti (§F before==after ile teyitli).

---

## E. BUILD, SELF-TEST VE DETERMINISTIC BUILD SONUCU

### E.1 Build kapilari (talimat §6)

```text
parser/compile error                = 0   (tum .ps1 dosyalari AST parse edildi)
static forbidden-pattern            = 0   (template'te C:\Ops\hukuk ve R03 yol
                                          referansi KALMADI — make-template dogrular)
hardcoded live path                 = 0
live task name referansi            = yalniz isolation-guard NEGATIF testinde
secret referansi/degeri             = 0   (paket taramasi: 0 eslesme)
source/manifest inventory           = COMPLETE (31 dosya)
en az iki bagimsiz clean build      = HER generation icin 2 derleme (G0/G1/G2)
unit/self-test                      = PASS (state-machine + guard + atomic-write
                                          rehearsal icinde uctan uca kosuldu)
state-transition exhaustive test    = PASS (R-04 13/13 + R-05/R-06/R-15)
isolation negative tests            = PASS (R-08/R-09/R-10 + guard deny-listesi)
R03 regression                      = PASS (host davranisi R03 ile ayni: 104/108/
                                          109/110/111 fail-closed kollari
                                          rehearsal'de deneysel olarak uretildi)
```

### E.2 G13 deterministic-build bulgusu (KRITIK, durust kayit)

```text
TOOLCHAIN     C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe
              SHA-256 46809206887326D2D24DB1EFF1F3064DE972C3451ABE766B49111450A5E08E00
              v4.8.9221.0 (R03'te kullanilanla BIREBIR)                [VERIFIED]
ROSLYN/SDK    YOK (VS/dotnet SDK kurulu degil)                          [VERIFIED]
-deterministic DESTEKLENMIYOR (legacy Framework csc)                    [VERIFIED]
OLCUM         Ayni kaynaktan iki derleme: AYNI BOYUT, fark 42-48 byte
              (MVID GUID 16B + debug-GUID + COFF timestamp + checksum);
              IL/kod ozdes. Kucuk fixture'da 21B/3584B olcumu ayni deseni
              gosterdi (0x88 timestamp, 0x460 len=16 MVID).             [VERIFIED]
OLCUM TUZAGI  Iki derleme FARKLI cikti adiyla yapilirsa assembly adi
              metadata string-heap'i kaydirir ve ~10KB sahte fark uretir;
              olcum AYNI cikti adiyla yapilmalidir (kayda gecirildi).   [VERIFIED]
SONUC         byte-exact reproducible-build IMKANSIZ (toolchain siniri).
              Kimlik modeli = C31 §H G13'un ONGORDUGU seal-attestation:
              source-SHA + compiler-SHA + binary-SHA + pin degerleri.
              Owner EK-KOSUL-8 geregi reproducible-build IDDIA EDILMEZ.
              Ek dogrulama: confined-nondeterminism zarfi (ayni boyut +
              bounded metadata farki) her generation icin PASS.
```

Bu, tasarimin izin verdigi "exact, kanitlanmis identity modeli"dir; nondeterminizmin
NEDENI kanitlanmis (MVID+timestamp), KAPSAMI olculmus ve semantik sapma
olmadigi gosterilmistir.

### E.3 Generation matrisi (owner EK-KOSUL 2)

```text
G0 = API-old / Web-old      (SHA_PAPI=api-old, SHA_PWEB=web-old)
G1 = API-new / Web-old      (SHA_PAPI=api-new, SHA_PWEB=web-old)
G2 = API-new / Web-new      (SHA_PAPI=api-new, SHA_PWEB=web-new)
rollback G1->G0 (R-07/R-12/R-13'te kanitlandi) · G2->G1 (R-02 tersi yolu)
Her generation icin binary + IKI launcher + rollback bundle hash'i sealed
manifestte (gen-build-manifest.json + bundle-manifest.json).
CAPRAZ TEST (K-3 ek kosul): API pin guncellemesi (G0->G1) sonrasi Web,
G1 binary altinda ESKI Web pini ile SORUNSUZ basladi (R-03: webUnderG1old=True)
ve ikinci (Web) reseal basarili API pinini AYNEN korudu (apiNew=True).
```

### E.4 J-A freshness (K-4)

```text
RELEASE14 candidate kaynagi 024c5b17 ↔ current main d5b2899e delta:
  degisen dosya = 2, IKISI DE governance .md
  (c30-f01-...-design-r01.md, release14-cutover-record-r01.md)
  RUNTIME-RELEVANT TREE DELTA = 0                                      [VERIFIED]
→ J-A yetkisi AYAKTA (otomatik J-B'ye dusme kosulu OLUSMADI).
NOT: C32 kapsaminda RELEASE14 candidate dosyalarina DOKUNULMADI; fresh
re-hash kapilari (dist/build/lock/migration/.env/launcher candidate) PRODUCTION
sayfasinin cutover-ani yukumluluğudur ve BU KAYITLA KARSILANMIS SAYILMAZ.
```

---

## F. PRODUCTION MUTATION = 0 KANITI (before == after)

Olcum: implementation ONCESI (18:04Z) ve rehearsal SONRASI (20:0xZ), salt-okuma.

```text
YUZEY                                    BEFORE            AFTER
hukuk-task-host.exe                      0FA10601…D84   == 0FA10601…D84
start-api.ps1                            4ACDC9D9…819   == 4ACDC9D9…819
start-web.ps1                            B34B7A16…002   == B34B7A16…002
pwsh-file-manifest.json                  84E530B1…07A   == 84E530B1…07A
db-readiness.js                          AD18CBB6…3A9   == AD18CBB6…3A9
HukukPlatform-API  state/xmlSha/action   Running/3F8133F2…/host.exe api  == AYNI
HukukPlatform-Web  state/xmlSha/action   Running/2EC77193…/host.exe web  == AYNI
API host PID                             48292          == 48292
API listener PID (8080)                  7476           == 7476   (RELEASE13)
Web host PID                             6252           == 6252
Web listener PID (3002)                  24872          == 24872  (RELEASE11)
C:\Ops\hukuk kok dizinleri               5 (degismedi)  == AYNI
pwsh klonu                               994/994 mismatch=0            == 994
DB action                                0
process/task action (canli)              0
.env okuma                               0 (icerik OKUNMADI)
```

**Turetilmis karsilastirma:** `evidence\production-before-after-comparison.json`
→ `identical = true`, `differences = []`.

**Disposable residual (talimat §2):**
```text
rehearsal env dizinleri     = 0
disposable Scheduled Task   = 0   (prefix Hukuk-C32-R04-* taramasi)
artik rehearsal host sureci = 0
```

---

## G. 16/16 REHEARSAL TABLOSU

Kanonik tasarim §I test ID'leri ve adlari AYNEN korunmustur. Iki bagimsiz TEMIZ
kosum: **kosum-1 16/16 PASS** (`rehearsal-results-run1.json`), **kosum-2 16/16 PASS**
(`rehearsal-results.json`). Asagidaki tablo kosum-2'dendir.

| Test | Ad | Injected fault | Terminal / gozlem | Sonuc |
|---|---|---|---|---|
| R-01 | Successful API cutover G0→G1 | yok | T7_COMMITTED; probe `api-v1-old`→`api-v2-new` | PASS |
| R-02 | Successful Web cutover G1→G2 | yok | T7_COMMITTED; probe `web-v1-old`→`web-v2-new` | PASS |
| R-03 | Combined sequential API→Web (K-3) + cross-test | yok | iki transaction TEK journal'da; API T7 sonra Web T7; Web G1 altinda eski pinle calisti; API pini korundu | PASS |
| R-04 | Injected crash her durable state ONCESI/SONRASI | 13 crash noktasi (T0..T6 intent+durable) | 13/13 tutarli terminal: T0/T1/T2-intent→X_ABORTED_CLEAN; T2..T5-durable→R2_ROLLBACK_VERIFIED; T5/T6-durable→T7_COMMITTED; karisik generation URETILMEDI | PASS |
| R-05 | Stale journal / stale generation | generation 1 ≤ committed 1 | PIN-GUARD `STALE/DOWNGRADE`; exit 40 | PASS |
| R-06 | Truncated/tampered journal | satir icinde alan degistirildi | hash-chain KIRIK tespit; transaction ACILMADI | PASS |
| R-07 | Wrong launcher hash (tamper) | candidate launcher tamper | host log `SCRIPT_HASH_MISMATCH` **exit 104** (C30-F01 kok-nedeni deneysel reprodüksiyon); listener acilmadi; recovery→R2; G0 korundu | PASS |
| R-08 | Wrong manifest hash | pwsh-file-manifest.json tamper | host `MANIFEST_SHA_MISMATCH` (109); listener acilmadi | PASS |
| R-09 | ACL drift (broad-SID write ACE) | Users SID'e (OI)(CI)M | host `ACL_DRIFT ... S-1-5-32-545` + `PWSH_ACL_DRIFT code=111`; restore DOGRULANDI | PASS |
| R-10 | Reparse/junction substitution | klon alt-dizini → junction | host log `REPARSE` (110); listener acilmadi; restore sonrasi klon 994/994 reparse=0 | PASS |
| R-11 | Watchdog quiesce (F-A) + W2 deneysel (G4) | quiesce ihlali + host force-kill | quiesce `Settings.Enabled=False`; quiesce altinda restart ENGELLENDI (0); re-enable sonrasi normal; **W2 RestartOnFailure: 80sn penceresinde restart GOZLENMEDI** | PASS |
| R-12 | Lost UAC/writer response | crash T5_DURABLE | measure-first; kor retry YOK; tutarli terminal (R2_ROLLBACK_VERIFIED, eski release) | PASS |
| R-13 | Scheduled Task lost response | crash T2_DURABLE | fail-safe GERI: R2_ROLLBACK_VERIFIED; `api-v1-old` korundu | PASS |
| R-14 | Rollback candidate corruption | G0 host bundle bozuldu | restore REDDI: `BLOCKED_PRESERVED_RESIDUAL` / `ROLLBACK_BUNDLE_CORRUPT`; kor restore YAPILMADI | PASS |
| R-15 | Generation replay / downgrade | ayni nonce + gen≤committed | `NONCE_REPLAY` reddi VE `STALE/DOWNGRADE` reddi | PASS |
| R-16 | Migration-applied + old-runtime compat (GATE1-esdeger) | synthetic migrated-schema fixture | eski runtime (G0) basladi ve stabil kaldi; production DB KULLANILMADI | PASS |

**G4 DENEYSEL BULGU (yeni, C31 §F.1'i kapatir):** W2 `RestartOnFailure` (PT1M×1)
host force-kill sonrasi 80 saniyelik pencerede **otomatik restart URETMEDI**.
C31'de `[INFERRED]` olarak kaydedilen "nonzero-exit/kill 'completed' sayilir,
restart tetiklenmez" davranisi boylece **deneysel olarak DOGRULANMISTIR**
(artik `VERIFIED`). K-2'nin baglayici kosulu (W2 semantigi deneysel olarak
kanitlanmadan READY sayilamaz) KARSILANMISTIR.

---

## H. ARA FAIL VE REVISION GECMISI (silinmedi/gizlenmedi)

Talimat §8 geregi tum basarisiz denemeler ve kok-neden kanitli duzeltmeler:

| # | Kosum | FAIL kalemleri | Kok neden (kanitli) | Duzeltme | Yeniden kosum |
|---|---|---|---|---|---|
| 1 | ilk suite denemesi | suite hic baslamadi | `setup-env.ps1` progress ciktilari (`Write-Output`) donus nesnesini kirletti; StrictMode `.ApiPort` hatasi | progress → `Write-Host` | tam suite |
| 2 | kosum A | 7 PASS / 9 FAIL | (a) `Read-JournalRecords` sonundaki `,$out` diziyi cift-sardi → `LastRaw` yanlis nesne → hash-chain kirildi; (b) StreamWriter UTF-8 **BOM** ilk kaydin ilk anahtarini bozdu; (c) `recovery.ps1:42` gecersiz `(if …)` ifadesi; (d) `File.Replace($tmp,$dst,$null)` bos-backup hatasi; (e) StrictMode bos-dizi `.Count`/`.OwningProcess` | comma kaldirildi; BOM'suz UTF8Encoding + defansif BOM-strip; inline-if duzeltildi; `File.Move(overwrite)`; `@()` sarmalama + null-guard | tam suite |
| 3 | kosum B | 9 PASS / 7 FAIL | (a) calisan exe kilidi (`Access denied`) — OLCULDU; (b) R_INIT/X self-transition ve bos-predecessor izinsizdi | rename-aside fallback (olculmus davranisa dayali); allowed-predecessor tablosu duzeltildi | tam suite |
| 4 | kosum C | 10 PASS / 6 FAIL | (a) `Test-IsTerminal -State ''` mandatory-param reddi (bos-kontrol SIRASI yanlisti); (b) **R-09'un enjekte ettigi broad-SID ACE'i `icacls /grant:r` KALDIRMIYOR** → sonraki TUM testlerde host 111 (R-11/12/13/15/16 zehirlendi); (c) R-10 YANLIS NEDENLE PASS vermisti (listener ACL yuzunden acilmiyordu, reparse yuzunden degil — false positive); (d) R-07 assertion'i yanlis mekanizmayi ariyordu | bos-kontrol Test-IsTerminal ONCESINE alindi; `/remove:g` ile explicit ACE kaldirma + her testte klon icerik/ACL butunlugu onarimi (test izolasyonu); R-10'a `REPARSE` log ZORUNLULUGU; R-07 gercek mekanizmaya (exit 104) baglandi | tam suite |
| 5 | kosum D | 14 PASS / 2 FAIL | (a) R-10 artik DOGRU-siki ACL nedeniyle dizin tasiyamadi; (b) R-11 `.State` calisirken 'Running' gosterdigi icin 'Disabled' beklentisi hataliydi | R-10'a gecici WRITE_DAC grant + restore; R-11 otoritatif sinyale (`Settings.Enabled`) baglandi | tam suite |
| 6 | **kosum-1 (final)** | **0 FAIL** | — | — | **16/16 PASS** |
| 7 | **kosum-2 (tekrar)** | **0 FAIL** | — | — | **16/16 PASS** |

Her kod degisikliginden sonra suite **TAM** (16/16) ve **TEMIZ** disposable
ortamda bastan kosulmustur; kismi yeniden kosum ile qualification YAPILMAMISTIR.

**Ozellikle kayda gecirilen iki kalite bulgusu:**
1. **False-positive kapisi.** R-10 bir turda "PASS" verdi ancak host'un reddi
   REPARSE degil ACL drift kaynakliydi. Negatif testlerin BEKLENEN MEKANIZMAYI
   log'dan kanitlamasi zorunlu kilindi (`REPARSE` / `ACL_DRIFT` /
   `MANIFEST_SHA_MISMATCH` / `SCRIPT_HASH_MISMATCH` literalleri).
2. **Test izolasyonu.** Bir negatif test (ACL enjeksiyonu) sonraki testleri
   sessizce cokertebiliyordu. Her test oncesi klon icerik (994/994, reparse 0)
   ve ACL (broad-SID write ACE yok) butunlugu dogrulanip gerekirse onarilir.

---

## I. G1-G17 QUALIFICATION MATRISI (17/17 PASS)

Kaynak: `evidence\g1-g17-matrix.json` (rehearsal sonuclarindan TURETILMISTIR).

| Kapi | Ad | Durum | Dayanak |
|---|---|---|---|
| G1 | Live binary ↔ reviewed source identity | PASS | template R03 kaynagindan turetildi (119E09E2…); her generation icin filledSource+compiler+binary SHA zinciri kuruldu. Canli R03 binary yalniz attestation baseline'idir. |
| G2 | Exit-104 exact decision path | PASS | R-07: `SCRIPT_HASH_MISMATCH` exit 104 disposable ortamda DENEYSEL uretildi |
| G3 | Pin/pointer/launcher writer inventory | PASS | tek writer `Invoke-AtomicFileWrite`; guard rehearsal-root disi her hedefi reddeder; ikinci writer yok |
| G4 | Hidden writer/watchdog race + W2 | PASS | R-11: quiesce restart'i engelledi; **W2 deneysel olarak olculdu (restart tetiklenmiyor)** |
| G5 | State-machine exhaustive transition | PASS | R-04 (13/13) + R-05 + R-06 + R-15; allowed-predecessor tablosu zorunlu |
| G6 | Disposable successful cutover | PASS | R-01, R-02, R-03 |
| G7 | Injected-crash recovery (her durable adim) | PASS | R-04 13/13; karisik generation uretilmedi |
| G8 | Lost-response reconciliation | PASS | R-12, R-13; measure-first, ikinci cagri YOK |
| G9 | ACL/reparse/TOCTOU negative | PASS | R-08 (109), R-09 (111), R-10 (110) + restore dogrulamalari |
| G10 | Stale/replay/downgrade | PASS | R-05, R-15, R-06 |
| G11 | API rollback with migrated schema | PASS | R-16 GATE1-esdegeri (synthetic fixture; production DB KULLANILMADI) |
| G12 | Web/API split-failure matrix | PASS | R-03, R-07, R-13 |
| G13 | Deterministic build/package identities | PASS | seal-attestation modeli (§E.2); confined-nondeterminism zarfi her generation icin dogrulandi; reproducible-build IDDIA EDILMEZ |
| G14 | Runtime content-probe identity | PASS | her T6/R2'de HTTP release-kimligi EXACT + tek canli listener; yalniz disposable runtime |
| G15 | Stability window | PASS | disposable stability window: R-16 surekli servis + R-03 iki transaction boyunca kimlik korunumu |
| G16 | Restore/rollback artefact hashes | PASS | bundle-manifest hash'leri + restore-oncesi integrity; R-14 bozuk bundle REDDI |
| G17 | Production authorization package hash-bound | PASS | paket immutable manifest `A5216D63…CD30` + iki verification PASS + before/after fingerprint → gelecekteki authorization EXACT hash'e baglanabilir (yetki URETMEZ) |

---

## J. RESIDUAL VE EVIDENCE GAP LISTESI

```text
RES-01  ORPHAN DOSYA (kapsam disi): R04 kokunde
        engine\hukuk-cutover-engine.ps1 (18KB) bu oturumun uretimi DEGILDIR
        ve bu implementation tarafindan REFERANS EDILMEZ (load.ps1 dot-source
        etmez). Aktif es-zamanli C32 oturumu bulunmadi (peer taramasi: tumu
        offline). Dosyaya DOKUNULMADI; qualified evidence manifestinin
        KAPSAMI DISINDA tutuldu (engine allowlist). Disposition owner'a aittir.
RES-02  G13 reproducible-build YOK (toolchain siniri; §E.2). Kimlik modeli
        seal-attestation'dir ve owner EK-KOSUL-8 ile uyumludur. Roslyn/SDK
        kurulursa byte-exact determinizm AYRI bir calisma konusudur.
RES-03  RELEASE14 candidate'in cutover-ani FRESH re-hash kapilari (dist/build/
        lock/migration/.env/launcher) BU KAYITLA KARSILANMAMISTIR; production
        sayfasinin yukumluluğudur. C32'de yalnizca runtime-relevant tree
        delta = 0 dogrulandi (§E.4).
RES-04  Rehearsal fixture'lari synthetic'tir: gercek API/Web dist'i, gercek DB
        ve gercek .env KULLANILMAMISTIR (talimat §1/§9 geregi). Production
        davranisinin tam esdegeri IDDIA EDILMEZ; kanit sinifi "disposable
        runtime"dir.
RES-05  Sealed binary'ler her rehearsal kosumunda fresh uretilir; kalici pakette
        SAKLANMAZ (D1 disiplini). Production fazinda kullanilacak binary o gunun
        yetkili build+qualification turundan gelmelidir.
RES-06  ACL hardening (bin\/pwsh\ owner → Administrators) C32 KAPSAMI DISI /
        NOT AUTHORIZED (K-7). Mevcut ACL sozlesmesi korundu ve drift dogrulandi.
EVIDENCE GAP: yok (16/16 + 17/17 + before==after tam kanitli).
```

---

## K. TERMINAL BEYAN

```text
C32 = IMPLEMENTATION_DELIVERED /
      REHEARSAL 16/16 PASS (iki bagimsiz temiz kosum) /
      G1-G17 17/17 PASS /
      PRODUCTION BEFORE == AFTER (mutation 0) /
      TERMINAL VERDICT = PENDING_OWNER

IMPLEMENTATION AUTHORITY = CONSUMED_BY_C32
PRODUCTION AUTHORITY     = NONE
REHEARSAL                = DISPOSABLE ONLY (canli yuzey mutasyonu 0)
ACL HARDENING            = NOT AUTHORIZED (K-7)
NEXT PHASE               = production cutover AYRI SAYFA + o gune ait fresh
                           hash-bound owner GO; OTOMATIK GECIS YOK
AUTOMATIC TRANSITION     = NONE
```

Bu kayit yalnizca implementation ve disposable rehearsal'in qualification
durumunu tespit eder; production cutover, canli yuzey degisikligi veya yeni
execution authority URETMEZ.

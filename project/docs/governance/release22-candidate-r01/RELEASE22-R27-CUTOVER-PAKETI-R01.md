# RELEASE22 — R27 CUTOVER PAKETI KAYDI (R01)

```text
BELGE     : RELEASE22-R27-CUTOVER-PAKETI-R01
KARAR     : OWNER KARARI 2026-09-11 "TEK YAYIN HATTI: RELEASE22" — aday 137406701248858221d12be94a941f8837a2a245
YETKI     : bu kayit MUHURLEME, AUTHORITY ETKINLESTIRME veya CANLI CUTOVER yetkisi DEGILDIR
PAKET     : R27 — C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27 (repo DISI; asagidaki yollar paket kokune goredir)
KIMLIK    : PACKAGE-IDENTITY immutableBase.digest DBE6B8E5D8E18C85F2AA857944125FBDF277F1B8EEC39D3FAF9017C9D3E3516A (48 dosya; node + PowerShell bagimsiz ESIT)
KIMLIK DOS: PACKAGE-IDENTITY.json sha256 24DC59DBE03F44597FE6AFAA3891A74F931568FCFC6B9CBBC4FE4C8579F60E2F (2026-09-11 engineSha256 alani eklendi; onceki 56ACAC43… — digest DEGISMEDI; bkz. RELEASE22-R27-YURUTME-PAKETI-R01 §3.1)
R26       : HY_C33_RELEASE21B1_CUTOVER_R26 DEGISTIRILMEDI — tarihsel/hazir; R26 icin muhur/authority/cutover YOK
ONCEKI    : RELEASE22-ADAY-HAZIRLIK-R01 (#2614) — §4.5 bayat "R26" atfi bu PR ile duzeltildi
DUZELTME  : 2026-09-11 — §7 cikis semantigi ve §8 elle kurtarma blogu (F1/F6); gecerli yurutme metni RELEASE22-R27-YURUTME-PAKETI-R01 §4 / §5.2
```

Asagidaki bolumler, paket icindeki inceleme belgesinin (`docs/LIVE-APPROVAL-PACKAGE-R27.md`) metnidir; o dosyanin sha256 degeri
ve paketin kilit dosyalari `PACKAGE-IDENTITY.json` listesinden alinmistir (disk ile yeniden olculup esitlendi):

| Dosya (paket kokune gore) | sha256 |
|---|---|
| `engine/Invoke-C33Cutover.ps1` | `52C9A2207647AAE5CF79A3C185F85615818E98AE617AC8E88C928480EF2A8803` |
| `tools/Seal-Package.ps1` | `87FD9774D705283CFE109D2FD41778A7A66452EE83897CA67B8FC0AA6FA89794` |
| `tools/Invoke-OwnerPreflight.ps1` | `06FADC5DEFB121E85BEF4B4EDB612F855B9EF58F71EABF697198492CC762A91F` |
| `qualification/Verify-Package.node.js` | `C24439DDD35F8D076FAAAA33AAC97A0CCE4840827BCDF4CCA419243AD0342FCC` |
| `qualification/Test-RealPrimitives.ps1` | `96269C890343F72B7E49C443BC8A583217C97EF66BBE4B28F9B66D2DD434F248` |
| `qualification/Run-NegativeControls.ps1` | `E1E77F05CFF3D4E959A4297ED5346E7A38F441D4AC990367DAB80A7BAAAE90E7` |
| `qualification/negative-controls.json` | `FD9A9EDBE6BE1F89217D796462DDAF49D7AA4D1851D201646AF6695D2527D84B` |
| `qualification/Test-OwnerCommandTemplate.ps1` | `914F79CBE1D83D776DD33440EE3BE302F2D9E706259AC19107AC62102B51FDEB` |
| `qualification/NC-RESULTS.json` | `F3DC6C4ACE88E215235D856B3C3E3C1E005FE23C58ECE5322B3D7DC1EC676D86` |
| `fork/templates/OWNER-COMMAND.C33-CUTOVER.forked.ps1` | `75635B95AB0FD787A8D0F0144D5E4C1C11C757B96875B4E1ED5843D151C26D36` |
| `fork/templates/OWNER-RUN.C33-RELEASE22.forked.ps1` | `F0CB281DAA1D6F0D598CAEC3FCBE0BFAC9C7185D376442699777CE9C257052DA` |
| `fork/fork-r25-to-r27.js` | `EE2F77A6E5290624560F501B2F4826A4D4D9530355C3BBF216458CB9BA7995ED` |
| `FORK-PROVENANCE.json` | `6CFF5F4DED6F60BEFF976D1975E8F4ADFB215551EE3744DF97BFBC21CD3148E5` |
| `evidence/GENERATION-COPY-PROVENANCE.json` | `4108497424DEFDA1F909BEA5AB612204F233B87BDC553F77B7BFE80D37B89EA4` |
| `evidence/seal-gates/seal-gates-s06-s08c.json` | `232A5F13AC3B431B60E91720BB9BC9750200D4F0E64C7A1D366C8F1065DF4DF7` |
| `generations/R22/hukuk-task-host.exe` | `E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706` |
| `generations/R22/start-api.ps1` | `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` |
| `generations/R22/start-web.ps1` | `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D` |
| `generations/R21/hukuk-task-host.exe` | `1397C54C46D4E9979A79C929959129D54954F8CE36B7CFB333ED88C2522F9F22` |
| `generations/R21/start-api.ps1` | `4ACA26CD6006B0D6B5D0B06166FE60AEA05973B2F668E642C667D914076496A1` |
| `generations/R21/start-web.ps1` | `DA62DD2D507537A8E1A6495E82D163D315A56DBE97189007411D803F2AB5D531` |
| `README.OWNER.md` | `16F4B84036DA78E7EDE888B71E26FB655A7716CFA21DEAF1710FE02F0AE5E7C4` |
| `docs/ROLLBACK-PINS.md` | `59645DA668C446A79D6421D724CFA6483A2EDDFE11E8224F05ECE5DBCF9D5A09` |
| `docs/CUTOVER-TIMING.md` | `A8F33C60C862019EBC0B610EF69CD8F26D53C51736210D2077FD317D38BFFB19` |
| `docs/LIVE-APPROVAL-PACKAGE-R27.md` | `F950AD1FF437307B03D1CC911AA3729281CC7E11EB345AEB5B2C5AF9D474BAA1` |

```text
KARAR     : OWNER KARARI 2026-09-11 "TEK YAYIN HATTI: RELEASE22" — aday 13740670 secildi
DURUM     : ADAY SECIMI + R27 PAKET HAZIRLIGI TAMAM — MUHURSUZ
YAPILMADI : muhur (pins/MANIFEST) · authority · nonce · canli cutover · deploy/restart · migration · canli kabul
R26       : RELEASE21B1 paketi DEGISTIRILMEDI; tarihsel/hazir paket olarak korunur; R26 icin muhur/authority/cutover YOK
YETKI     : bu belge muhurleme, authority etkinlestirme veya cutover yetkisi DEGILDIR
KAYIT     : CLIENT sayaci 8/17 · hizmet kabulu 0/8 tam (degismedi)
```

Paket kimligi (muhursuz digest, dosya listesi, qualification verdict'leri): `PACKAGE-IDENTITY.json`.

## 1. Tam aday SHA — depodan cozuldu

| | Deger | Kanit |
|---|---|---|
| **Aday** | `137406701248858221d12be94a941f8837a2a245` | `git rev-parse 13740670^{commit}` (kanonik repo, `git fetch` sonrasi) |
| Kaynak | #2612 squash (`fix(office-approval): FD genel kutu iptal siniri …`) | first-parent log |
| origin/main tarihcesinde | EVET (origin/main `eb62fc7e`; adaydan sonra yalniz docs #2613/#2614) | `merge-base --is-ancestor` |
| RELEASE21 `2187a78b` adayin atasi | EVET — 42 commit, runtime 7 commit / 11 kaynak dosya | `git log --first-parent` + `git diff --name-status` |
| Release koku | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22` — worktree HEAD = tam aday SHA; izlenen degisiklik 0 | worktree kaydi |
| Web BUILD_ID | `xJZ1G1TsbOnHoWUzMD8CQ` | dosya |
| Katman 1 makbuzu | `HY_C33_RELEASE22_CANDIDATE\RELEASE22-CANDIDATE-RECEIPT.json` `8D78B1765EFA345CCAFB74FB8A4E3AF58638F4A045B5ABDDB39CDD88F823E6CD` (yan `.sha256` ile esit; `candidate.sourceCommit` = tam aday SHA) | dosya |

## 2. Aday icerigi — B-1 ve onayli OFFICE/FD duzeltmeleri, paket icerigiyle eslesme

Her satir: kaynak (`SOURCE`) ve derlenmis (`BUILD`) dosya **Katman 1 manifestinde listeli** VE disk sha'si **manifest sha'sina esit**
(manifest `26B31B69…` = manifestDigest). Sonuc **22/22**. Isaret sayilari RELEASE21 dist -> RELEASE22 dist (satir sayisi; parantez icinde gecis sayisi).

| Kalem | PR | Kaynak dosyalar (`apps/api/src/modules/…`) | Derlenmis sha (RELEASE22) | Isaret: RELEASE21 -> RELEASE22 |
|---|---|---|---|---|
| **CLIENT B-1** | #2609 | `client/client.service.ts` (git blob `2835fa2c` = main'deki yama) | `client.service.js` `01CA99AEC166362363135F79509DC88D9E60BD5D5A6CDCDAAD76E599978D5143` | `pureNoOpDetected` 0 -> 3 |
| **AK-2** | #2599 · #2602 | `lawyer/lawyer.service.ts`, `lawyer/dto/create-lawyer.dto.ts`, `case/case.service.ts`, `seed/seed.controller.ts`, `seed/seed.service.ts` | `lawyer.service.js` `427DB2F15BF619B99DF3448F90DE10D606C40314389AAAD26613C226F1A4323D` | `assertCreateAuthorized` 0 -> 1 · `LAWYER_REACTIVATE` 0 -> 1 |
| **AK-1a** | #2604 | `office-approval/office-f01-authorization.guard.ts`, `office-approval/office-write-role.policy.ts` (yeni), `case/case.service.ts`, `seed/seed.controller.ts` | guard `38FF644526852082…` · policy `13119AF48D9B18A5…` | `isF01WriteActorAuthorized` 0 -> 1 · `OFFICE_WRITE_DENIED_VIEWER` dosya yok -> 3 (4) |
| **AK-1a eki** | #2606 | `office-approval/office-approval.service.ts`, `office-write-role.policy.ts`, `client-financial-disclosure/…-approval-eligibility.ts`, `…-approval.service.ts` | office-approval `14F7842042DFBABE…` | `OFFICE_APPROVAL_DECISION_DENIED_VIEWER` dosya yok -> 3 (4) · `assertApprovalDecisionRoleAllowed` 0 -> 2 · `isDisclosureDecisionRoleDenied` 0 -> 1 |
| **CLF-O0-01** | #2608 · #2612 | `office-approval/office-approval.service.ts` | ayni | `assertGenericDecisionAllowed` 3 -> 5 (+`requestRevision`, +`cancel`) |

Runtime disi: CI manifest/test (#2594, #2607, #2610) ve 32 docs commit'i. **Migration / Prisma semasi / lock / env anahtari farki 0.**
Web kaynak farki 0 (tek degisen dosya bir test). API `main.js` ve web `next` girisi RELEASE21 ile bayt-ayni.
Not: `client.service.js` RELEASE21B1 (R26) derlemesiyle de bayt-aynidir; B-1 kaynagi iki adayda ayni blob'dur.

## 3. Paket numarasi ve koku

| | Deger |
|---|---|
| **Numara** | **R27** |
| **Kok** | `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27` |
| Paket kimligi literali | `HY_C33_RELEASE22_CUTOVER_R27` |
| Envanter (cakisma yok) | C33 cutover R20, R21, R22, R23, R24, R25, **R26 (= RELEASE21B1)** kullanilmis; hicbir `HY_*` dizininde R27 yok. origin/main'deki tek "R27" gecisi `office-p8-final-r01/p8-final-certification-r01.md:187` — C22 DOGFOOD kayit satiri, C33 disi ad alani |
| Koordinasyon | numara onerisi ve kayit sahipligi ana yurutucuye bildirildi; #2614 §4.5 bayat "R26" atfi bu kayit guncellemesinde duzeltildi |
| Ratifikasyon ref bicimi | `OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-YYYYMMDD-Rnn` — **`Rnn` ratifikasyon REVIZYONUDUR, paket numarasi DEGILDIR**; paket numarasi pakette sabittir (§4) |

## 4. Aday SHA, paket kimligi ve icerik digest'i — authority / muhur dogrulamasinda nasil eslesir

Muhur (owner fazi) salt-okuma olcer ve ucunu yazar: `pins/PINS.json`, `authority/CUTOVER-AUTHORITY.json`, `MANIFEST.json`.
Asagidaki her karsilastirma **kod**dur (dosya:kapi); hicbiri ratifikasyon ref'inden turetilmez.

| Baglanan | Muhurde yazilir | Cutover oncesi karsilastirilir |
|---|---|---|
| **Aday SHA** `13740670…` | Seal `S-04c`: worktree HEAD == aday, CLEAN, origin/main tarihcesinde -> `pins.candidate.sourceCommit`, `authority.boundIdentities.mainSha` | Motor `P-04` (`$bound`: authority.mainSha == pins.sourceCommit) · `P-05b` worktree HEAD == pins == **motor literali** `137406701248…` · OWNER-COMMAND `pins.candidate.sourceCommit` literal · Verifier `V-02l`/`V-03` |
| **Aday icerigi** (makbuz `8D78B176…`, candidateDigest `454F4473…`, manifestDigest `26B31B69…`, packageDigest `F0156AC1…`) | `pins.candidate.*` + `authority.boundIdentities.*` (Seal EXP literalleri + dosyadan olculen makbuz sha) | Motor `P-04` $bound esitlikleri · `P-05` makbuz sha, kritik dosyalar ordinal deftere karsi, defter dosyasi sha, BUILD_ID · Verifier `V-02`/`V-03` (EXP literalleri) |
| **Paket kimligi** `HY_C33_RELEASE22_CUTOVER_R27` | `pins.package`, `authority.package`, `MANIFEST.package` | **YENI (R27 sikilastirmasi):** motor `P-04` + OWNER-COMMAND + Verifier `V-03` uc alanin literale esitligini ister; `V-04d` motor metninde uc karsilastirmayi statik arar. Negatif kontrol: NC-09d (authority=R26) ve NC-09e (pins=R26) -> `HARD_STOP_PREFLIGHT_NOT_APPLIED [P-04]`; OC-09b/c/d (authority/pins/MANIFEST=R26) -> DURDU. R25'te bu alan yaziliyor ama **karsilastirilmiyordu** |
| **Paket icerik digest'i** (`MANIFEST.payloadDigest`) | Seal paket agacinin tamamini hash'ler (claims/journal/receipts haric); authority dosyasinin sha'si MANIFEST'te listelidir | Motor `P-02` payloadDigest'i diskten yeniden hesaplar · `P-03` motor sha == authority == pins · `P-04` authority sha == MANIFEST girdisi · OWNER-COMMAND payloadDigest + **owner-onayli motor literali** `52C9A220…` · Verifier `V-01` |
| **Onayli paket kimligi** (`PACKAGE-IDENTITY` muhursuz digest -> `docs/APPROVED-IDENTITY-*.json`) | owner onayindan sonra dogar | OWNER-RUN `OR-03a` digest == onayli; `OR-03b` disk == liste, onay-sonrasi eklenen dosyalar yalniz acik listede |

Motor, authority'yi kendi `$PackageRoot`'undan okur; baska paketin (or. R26) authority/pins/MANIFEST'i bu pakette `P-02`/`P-03`/`P-04` ile reddedilir.

## 5. Kalifikasyon — BU paketin nihai motoruna (`52C9A2207647AAE5CF79A3C185F85615818E98AE617AC8E88C928480EF2A8803`) karsi

| Takim | Sonuc |
|---|---|
| Fork (`fork/fork-r25-to-r27.js`) | kural anlamsal 32/32 · kalkan 10/10 · jeton 29/29 · pin 12/12 · sozdizimi 19/19 · yasakli kalinti 0 · pozitif eksik 0 |
| Negatif kontroller (NC) | **91/91** `QUALIFICATION_PASS` — fp 0 · fn 0 · beklenmeyen 0; yeni NC-09d (authority=R26) ve NC-09e (pins=R26) -> `HARD_STOP_PREFLIGHT_NOT_APPLIED [P-04]`; production temasi NONE (izole fikstur) |
| Gercek primitifler (yerel) | **21/21** `REAL_PRIMITIVES_PASS` (`live=False`) |
| Preflight giris yolu / nesne hazirlama | **12/12** / **14/14** |
| C36 makbuz baglama provasi | **29/29** |
| OWNER-COMMAND sablonu | **16/16** — her negatif KENDI kapisinda durdu (OC-04 ref, OC-06 aday commit, …); OC-09b/c/d paket kimligi |
| Bagimsiz verifier (muhursuz) | **PACKAGE_STATIC_VERIFIED_UNSEALED** — 14 PASS · 0 FAIL · 15 NOT_EXECUTED (muhur gerektiren kapilar: V-01/V-02*/V-03/V-05d …); V-04d paket kimligi literali motorda 3/3 |

Ilk fork kosumunda OC-00 (pozitif kontrol) DUSTU: testin sentetik MANIFEST/authority/pins'i `package` tasimiyordu; ayrica
OC-04..09 kendi kapilarina ulasmadan paket kapisinda duruyordu (ayirt edicilik kaybi). Kapi gevsetilmedi; fikstur dogru kimligi
tasiyacak ve uc yeni negatif vaka eklenecek sekilde duzeltildi, tum ciktilar silinip yeniden fork edildi.

### 5.1 Seal S-06 ve S-08c — AYRI etiketler

| Etiket | S-06 (canli bin == R21 geri donus kopyalari; ileri != geri; host gen manifest pinleri) | S-08c (canli 8080/3002 surecleri RELEASE21 girislerinden) |
|---|---|---|
| **KAYNAK INCELEMESI** (PASS SAYILMAZ) | R27 `tools/Seal-Package.ps1` satir 204–215; basarisizlik `Step` -> `Refuse` -> exit 1 | satir 240–247; ayni ret yolu |
| **CALISTIRILMIS KAPI — CANLI salt-okuma** (gercek Seal blogu, `evidence/seal-gates/`) | **PASS** — canli host `1397C54C…` | **PASS** — API pid 50716, Web pid 22440 |
| **SIMULASYON** (ayni blok, tek girdi degisti) | RELEASE22 canlida -> **FAIL** · RELEASE21B1 canlida -> **FAIL** | RELEASE22 surecleri -> **FAIL** |
| **RESMI SEAL KOSUMU** | **NOT_EXECUTED** (owner fazi) | **NOT_EXECUTED** |

Ayni kosucu R26 Seal'ine de uygulandi: canli -> PASS/PASS; RELEASE22 canlida -> S-06 FAIL, S-08c FAIL. R27 cutover'indan sonra
R26 muhurlenemez; R21B1 canliya cikmis olsaydi R27 de muhurlenemezdi. Kosucu sonucu 10/10 beklenenle uyumlu.
(`seal-gates-s06-s08c.json` `232A5F13…`, betik `DA784766…`.)

## 6. RELEASE21'e geri donus — gercek dosya/hash'lerle dogrulandi

| | Deger |
|---|---|
| Hedef | `HY_W4_RELEASE21` @ `2187a78b1621f168605920cdffccb17381dc171a` — su an CANLI (API 50716 / Web 22440) |
| Kok butunlugu (bu turda kosuldu) | muhurlu manifest `D6082E19…`'e karsi TAM yeniden hash: **88.132/88.132 esit** (SOURCE 7.026 + BUILD 4.426 + DEPS 71.887 dosya + 4.793 baglanti), farkli 0, okunamayan 0 |
| Girisler | API `main.js` `28D84796…` · Web `next` `AFEE236A…` · BUILD_ID `g91HUaBesekB-R2rRawQj` · `client.service.js` `5D3DF71C…` |
| `.env` (H-01 kaynagi) | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` (icerik okunmadi) |
| bin preimage (= canli) | host `1397C54C46D4E9979A79C929959129D54954F8CE36B7CFB333ED88C2522F9F22` · api `4ACA26CD6006B0D6B5D0B06166FE60AEA05973B2F668E642C667D914076496A1` · web `DA62DD2D507537A8E1A6495E82D163D315A56DBE97189007411D803F2AB5D531` |
| bin postimage (ileri) | host `E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706` · api `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` · web `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D` |
| Geri gelen | AK-2 · AK-1a · AK-1a eki · CLF-O0-01 · CLIENT B-1 kusurlari; F-B01-03/F04 RELEASE21'de kalir; veri geri alinmaz |

Ayrinti: `docs/ROLLBACK-PINS.md`. Nesil kopyasi Katman 1'den bayt-aynen: `evidence/GENERATION-COPY-PROVENANCE.json`.

## 7. Uygulama komutlari (owner) — siralama; hicbiri bu turda kosulmadi

Hepsi **"Yonetici olarak calistir" Windows PowerShell 5.1 ConsoleHost**. Kok: `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27`.

**Adim 0 — ratifikasyon ref'i** (`OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-YYYYMMDD-Rnn`; paket uretmez).

**Adim 1 — salt-okuma owner preflight** (DB/HTTP/login 0; `.env` icerigi okunmaz):

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27'; $p="$R\tools\Invoke-OwnerPreflight.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '06FADC5DEFB121E85BEF4B4EDB612F855B9EF58F71EABF697198492CC762A91F') { Write-Host 'PREFLIGHT ARACI SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; Write-Host ('cikis=' + $LASTEXITCODE) }
```

Beklenen `cikis=0` `OWNER_PREFLIGHT_READY` -> `preflight\OWNER-PREFLIGHT-<utc>.json` (+ `.sha256`). **READY cutover yetkisi degildir.**

**Adim 2 — canli salt-okuma gercek primitifler:**

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27'; $p="$R\qualification\Test-RealPrimitives.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '96269C890343F72B7E49C443BC8A583217C97EF66BBE4B28F9B66D2DD434F248') { Write-Host 'SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Live; Write-Host ('cikis=' + $LASTEXITCODE) }
```

**Adim 3 — onayli kimlik + calistiricilar** (ayri GO): `docs/APPROVED-IDENTITY-<digest8>.json` (= `PACKAGE-IDENTITY.json`
listesi), ratifikasyon kayit belgesi, `fork/templates/` sablonlarinin (OWNER-COMMAND `75635B95…`, OWNER-RUN `F0CB281D…`) koke
kopyasi ve yer tutucularin doldurulmasi. Doldurulmamis yer tutucuda calistiricilar DURUR (exit 90/91).

**Adim 4 — tek owner komutu** (hash -> SEAL -> VERIFIER -> CUTOVER):

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27\OWNER-RUN.C33-RELEASE22.ps1" -Confirm "C33-RELEASE22-CUTOVER-GO"
```

Cikis: **0** `C33_RELEASE22_CUTOVER_APPLIED_AND_VERIFIED` · **1** `HARD_STOP_PREFLIGHT_NOT_APPLIED` (mutasyon 0) · **2**
`ROLLBACK_COMPLETE_OLD_RUNTIME_RESTORED` (nonce tuketildi) · **3** `HARD_STOP_STATE_UNCERTAIN_MANUAL_RECOVERY_REQUIRED` ·
70 makbuz · 90/91 calistirici durdu. Otomatik reseal / tekrar YOK.
**Duzeltme (2026-09-11, F1):** motor bir kez kostuktan sonra (exit 1/2/3/70) R27 yeniden muhurlenemez (Seal S-03 makbuzu gorur). Paket ici
`README.OWNER.md` §6'nin exit 1/2 satirlari bu bakimdan HATALIDIR. Gecerli cikis semantigi: `RELEASE22-R27-YURUTME-PAKETI-R01.md` §4.

## 8. Geri donus komutlari

**Otomatik:** motor `R-01` (H/C/V kapisi duserse): yeni gorevler durur -> bin 3 dosya preimage'a (yalniz su an postimage ise;
kaynak `generations/R21` sha-dogrulamali, atomik) -> RELEASE22 `.env` (sha esitse) kaldirilir -> ACL preimage -> `HukukPlatform-API`
/ `HukukPlatform-Web` enable+start, eski nesil + API `/` 404 + Web `/` 200 -> DB snapshot esit. Tutarsa exit 2, degilse exit 3.

**Elle kurtarma** (yalniz exit 3; once `cutover-receipts\CUTOVER-<RUNID>.json` `rollback.detail` + `journal\<RUNID>.jsonl` okunur;
yalniz bin + gorev katmani; sha ve ACL korumali):

```powershell
& {
    $ErrorActionPreference = 'Stop'
    $G='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27\generations\R21'; $B='C:\Ops\hukuk\bin'
    $exp=[ordered]@{'hukuk-task-host.exe'='1397C54C46D4E9979A79C929959129D54954F8CE36B7CFB333ED88C2522F9F22';'start-api.ps1'='4ACA26CD6006B0D6B5D0B06166FE60AEA05973B2F668E642C667D914076496A1';'start-web.ps1'='DA62DD2D507537A8E1A6495E82D163D315A56DBE97189007411D803F2AB5D531'}
    foreach($f in $exp.Keys){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $G $f)).Hash -cne $exp[$f]){ throw "rollback kaynagi sapmis: $f" } }
    $sd=@{}; foreach($f in $exp.Keys){ $sd[$f]=(Get-Acl -LiteralPath (Join-Path $B $f)).Sddl }
    Stop-ScheduledTask -TaskName 'HukukPlatform-API'; Stop-ScheduledTask -TaskName 'HukukPlatform-Web'
    $t0=Get-Date; while((Get-NetTCPConnection -State Listen -LocalPort 8080,3002 -ErrorAction SilentlyContinue) -or (Get-Process -Name 'hukuk-task-host' -ErrorAction SilentlyContinue)){ if(((Get-Date)-$t0).TotalSeconds -gt 90){ throw 'surecler 90 s icinde durmadi - DUR' }; Start-Sleep -Milliseconds 500 }
    foreach($f in $exp.Keys){ $d=Join-Path $B $f; Copy-Item -LiteralPath (Join-Path $G $f) -Destination $d -Force; if((Get-FileHash -Algorithm SHA256 -LiteralPath $d).Hash -cne $exp[$f]){ throw "geri yazim dogrulanamadi: $f" }; $a=Get-Acl -LiteralPath $d; if($a.Sddl -cne $sd[$f]){ $a.SetSecurityDescriptorSddlForm($sd[$f]); Set-Acl -LiteralPath $d -AclObject $a } }
    Enable-ScheduledTask -TaskName 'HukukPlatform-API' | Out-Null; Enable-ScheduledTask -TaskName 'HukukPlatform-Web' | Out-Null
    Start-ScheduledTask -TaskName 'HukukPlatform-API'; Start-ScheduledTask -TaskName 'HukukPlatform-Web'
}
```

> **Blok TEK ifadedir** (`& { ... }` + `$ErrorActionPreference = 'Stop'`): tamami BIR KEREDE yapistirilir. Herhangi bir `throw` ya da
> cmdlet hatasi sonraki Stop / Copy / Set-Acl / Start satirlarini DURDURUR. Satir satir yapistirma YAPILMAZ (eski bicimde bir satirdaki
> `throw` yalniz o satiri durduruyor, sonraki satirlar yine kosuyordu — F6, ana yurutucu bagimsiz dogrulamasi).

Ardindan §10 blogu **geri yon beklentileriyle** (kok `HY_W4_RELEASE21`, BUILD_ID `g91HUaBesekB-R2rRawQj`, bin = preimage) kosulur.

## 9. Kesinti beklentisi

**~15–60 s** API+Web (emsaller R23 14,673 s · R24 13,716 s · R25 57,647 s; baskin bilesen start+probe, nedeni olculmedi).
Ust sinir quiesce 90 s + start 240 s (ayri). Rollback suresi olculmemis. Web BUILD_ID degisir (sekmeler bir kez yenilenebilir).
Cutover penceresinde kabul/sentetik tenant kosumu YAPILMAZ (`V-01` rollback tetikler). Ayrinti `docs/CUTOVER-TIMING.md`.

## 10. Hedefli OFFICE / CLIENT kabul plani (plan; hicbiri bu turda kosulmadi — her canli adim AYRI owner GO)

### 10.1 Teknik yayin kabulu (cutover makbuzu altinda, salt-okuma)

```powershell
$want='HY_W4_RELEASE22'; $bid='xJZ1G1TsbOnHoWUzMD8CQ'; $d="C:\Development\HUKUK_YAZILIMI\$want\project\apps\api\dist\apps\api\src\modules"
foreach($port in 8080,3002){ $c=Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1; $pr=Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess); $root=if($pr.CommandLine -match '(HY_W4_RELEASE[0-9A-Z]+)'){$Matches[1]}else{'-'}; '{0} pid={1} kok={2} {3}' -f $port,$c.OwningProcess,$root,$(if($root -ceq $want){'OK'}else{'FARKLI'}) }
foreach($f in 'hukuk-task-host.exe','start-api.ps1','start-web.ps1'){ 'bin {0} {1}' -f (Get-FileHash -Algorithm SHA256 -LiteralPath "C:\Ops\hukuk\bin\$f").Hash,$f }
'BUILD_ID=' + (Get-Content -Raw -LiteralPath "C:\Development\HUKUK_YAZILIMI\$want\project\apps\web\.next\BUILD_ID").Trim()
'buildManifest=' + $(try{(Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3002/_next/static/$bid/_buildManifest.js").StatusCode}catch{$_.Exception.Response.StatusCode.value__})
'api GET / =' + $(try{(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/').StatusCode}catch{$_.Exception.Response.StatusCode.value__}) + ' (404 beklenir)'
foreach($m in @(@('client\client.service.js','pureNoOpDetected'),@('office-approval\office-write-role.policy.js','OFFICE_WRITE_DENIED_VIEWER'),@('office-approval\office-write-role.policy.js','OFFICE_APPROVAL_DECISION_DENIED_VIEWER'),@('office-approval\office-f01-authorization.guard.js','isF01WriteActorAuthorized'),@('office-approval\office-approval.service.js','assertApprovalDecisionRoleAllowed'),@('office-approval\office-approval.service.js','assertGenericDecisionAllowed'),@('lawyer\lawyer.service.js','LAWYER_REACTIVATE'),@('lawyer\lawyer.service.js','assertCreateAuthorized'))){ '{0,-40} satir={1}' -f $m[1], @(Select-String -LiteralPath (Join-Path $d $m[0]) -SimpleMatch -Pattern $m[1]).Count }
```

Beklenen: iki port `kok=HY_W4_RELEASE22 OK`; eski PID 50716/22440 yok; bin `E744A74B…` / `77B6FBCD…` / `1B7654F6…`;
`BUILD_ID=xJZ1G1TsbOnHoWUzMD8CQ`; `buildManifest=200`; `api GET / =404`; isaret satir sayilari §2 (3 · 3 · 3 · 1 · 2 · 5 · 1 · 1).
Ek (salt-okuma): migration defteri 130/130 degismedi; API sureci -> 5432 ESTABLISHED; makbuz `dbMutations 0`.
Isaret yoksa ya da sayi farkliysa **DUR**: yama canlida degil demektir; dogrulama kabul sayilmaz.

### 10.2 Duzeltme kabulleri

| Kalem | Cutover ONCESI (yerel; aday dist + disposable PG; canli yazma 0) | Cutover SONRASI (canli; AYRI owner GO; sentetik tenant) |
|---|---|---|
| **CLIENT B-1** #2609 | `client.service.js` bayt-esit derlemede I9 provasi **PASS 14/0/0** yapildi (runId `a102dbf6`, R21B1 dist). RELEASE22 dist'inin tamamiyla **KOSULMADI** — istenirse ayni yontemle tekrar | isaret `pureNoOpDetected` satir 3 -> CLIENT I9 canli kosumu (A-8a dahil; §10.3) |
| **AK-2** #2599/#2602 | disposable: ayricalikli alanla yetkisiz create -> 403 + yazma 0; pasif ayricalikli mukerrer kaydi yetkisiz yeniden etkinlestirme -> 403; ADMIN / bagli PARTNER -> 201 + ayni tx `LAWYER_CREATE`/`LAWYER_REACTIVATE` audit | dist isaretleri; islevsel denetim yalniz owner GO + sentetik tenant (audit satiri kalici veri uretir — kapatma plani kosumdan once) |
| **AK-1a** #2604 | disposable: bagli VIEWER F01 yazma -> 403 `OFFICE_WRITE_DENIED_VIEWER`, okuma 200; POST /cases dosya ici avukat VIEWER -> 403 inline muvekkil yazilmadan | owner GO + sentetik tenant (ret yazma uretmez; kurulum yazar ve kapatilir) |
| **AK-1a eki** #2606 | disposable: VIEWER genel kutu karari -> 403 `OFFICE_APPROVAL_DECISION_DENIED_VIEWER`; FD ofis/icerik onayi -> 403 `DISCLOSURE_APPROVAL_NOT_ELIGIBLE` | **yalniz dist isaretleri** — FD senaryolari canlida KOSULMAZ (canlida FD yayini acik; gercek muvekkil e-postasi riski) |
| **CLF-O0-01** #2608/#2612 | disposable: FD talebinde genel kutu `request-revision` ve `cancel` (sahibi) -> 409 `DOMAIN_ACTION_REQUIRED`, yazma 0; sahibi olmayan cancel -> 403 | dist isareti `assertGenericDecisionAllowed` satir 5; canlida FD talebi URETILMEZ (ayni neden) |

### 10.3 CLIENT I9 sirasi

1. R27 cutover + §10.1 teknik kabul. 2. Canli dist'te `pureNoOpDetected` satir 3 (yoksa DUR). 3. I9 canli kosumu owner GO ile
(`CL_OWNER_GO_REF = OWNER-GO-CLIENT-I9-YYYYMMDD-Rnn`, `CL_API_BASE_URL = http://127.0.0.1:8080/api`; paket `d6c51ca0`'da sabit).
Sayac 8/17 -> 9/17 **yalniz** I9 canli PASS'ten sonra; hizmet kabulu 0/8 tam kalir (otomatik tam kabul cikarilmaz).

### 10.4 Gecmis OFFICE kabullerinin korunmasi

Adayin OFFICE'e getirdigi fark yalniz **yeni retlerdir** (VIEWER yazma/karar reddi; ayricalikli avukat create/yeniden etkinlestirme
siniri; FD talebinde genel kutu 409). O-1..O-10, A-03..A-06 ve **A-07** kabulleri gecerli; A-07 **yeniden kosulmaz** (fixture tuketildi).
Ayrinti #2614 §7.4.

## 11. Acik kalemler ve kisitlar (kapatilmis gosterilmez)

| Kalem | Durum |
|---|---|
| PRE-06 / B-072b CutoverWriter | NOT_MEASURED / NOT_EXECUTED — owner preflight yukseltilmis olcer; PASS sayilmadi |
| `Test-RealPrimitives -Live` | NOT_EXECUTED (Adim 2) |
| Katman 1 PRE-01/07/08 | cutover H fazinin isi (`.env` bayt-kopya, kok read-only, baslatici baglama) |
| FD kurtarma VIEWER politikasi (P1-P3), AK-1b/1c, VIEWER yurutme yollari, CASE duzeyi VIEWER, B-2, `/cases` on kontrol yarisi, ofis oto-olusturma tx disi, seed OFFICE disi uclar | #2614 §8 — degismedi |
| Ileri host | Katman 1'den bayt-aynen (`E744A74B…`), yeniden derlenmedi; R25/R26 host'u Katman 2'de derlemisti |
| R26 | tarihsel/hazir; degistirilmedi; muhur/authority/cutover YOK |

## 12. Owner'dan istenen

Bu paket incelemeye sunulur. Canli yayin icin ayri owner onayi: ratifikasyon ref'i + §7 Adim 1–4. Onay verilmezse canli sistem
RELEASE21'de kalir; aday ve paketler degistirilmeden bekler (authority penceresi baslamadigi icin sure siniri yok).

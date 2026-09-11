# RELEASE22 — R27 — TEK YURUTME PAKETI (R01)

```text
BELGE     : RELEASE22-R27-YURUTME-PAKETI-R01
GO        : owner GO 2026-09-11 "R27 SON YURUTME HAZIRLIGI"
DURUM     : YURUTME PAKETI HAZIR — asagidaki adimlarin HICBIRI kosulmadi
YAPILMADI : owner preflight · Test-RealPrimitives -Live · kimlik/sablon doldurma · muhur · authority/nonce · cutover · canli kabul yazmasi
ROLLER    : paket yazicisi OFFICE 33 · koordinasyon ve bagimsiz dogrulama ana yurutucu · R26 DEGISMEZ
YETKI     : bu belge muhur, canli primitive kosumu, cutover veya canli kabul yetkisi DEGILDIR
KAYIT     : CLIENT sayaci 8/17 · hizmet kabulu 0/8 tam (degismedi)
```

Onceki kayitlar: `RELEASE22-ADAY-HAZIRLIK-R01.md` (#2614) · `RELEASE22-R27-CUTOVER-PAKETI-R01.md` (#2615/#2617) ·
`RELEASE22-R27-BAGIMSIZ-DOGRULAMA-R01.md` (#2616). Bu belge onlari tekrar etmez; yurutme icin gereken her seyi TEK yerde toplar.

## 1. Kesin kimlikler (tam deger)

| | Deger |
|---|---|
| **Aday SHA** | `137406701248858221d12be94a941f8837a2a245` (#2612 squash; origin/main tarihcesinde) |
| Aday koku | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22` · web BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ` |
| **R27 koku** | `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27` · paket kimligi literali `HY_C33_RELEASE22_CUTOVER_R27` |
| **Paket digest'i (muhursuz, tam)** | `DBE6B8E5D8E18C85F2AA857944125FBDF277F1B8EEC39D3FAF9017C9D3E3516A` — 48 dosya; node + PowerShell bagimsiz ESIT |
| `PACKAGE-IDENTITY.json` sha256 | `24DC59DBE03F44597FE6AFAA3891A74F931568FCFC6B9CBBC4FE4C8579F60E2F` (§3.1 duzeltmesi sonrasi; onceki `56ACAC43…`) |
| Motor `engine/Invoke-C33Cutover.ps1` | `52C9A2207647AAE5CF79A3C185F85615818E98AE617AC8E88C928480EF2A8803` |
| Owner preflight `tools/Invoke-OwnerPreflight.ps1` | `06FADC5DEFB121E85BEF4B4EDB612F855B9EF58F71EABF697198492CC762A91F` |
| `qualification/Test-RealPrimitives.ps1` | `96269C890343F72B7E49C443BC8A583217C97EF66BBE4B28F9B66D2DD434F248` |
| `tools/Seal-Package.ps1` | `87FD9774D705283CFE109D2FD41778A7A66452EE83897CA67B8FC0AA6FA89794` |
| `qualification/Verify-Package.node.js` | `C24439DDD35F8D076FAAAA33AAC97A0CCE4840827BCDF4CCA419243AD0342FCC` |
| Sablon OWNER-COMMAND / OWNER-RUN | `75635B95AB0FD787A8D0F0144D5E4C1C11C757B96875B4E1ED5843D151C26D36` / `F0CB281DAA1D6F0D598CAEC3FCBE0BFAC9C7185D376442699777CE9C257052DA` |
| Katman 1 makbuzu | `8D78B1765EFA345CCAFB74FB8A4E3AF58638F4A045B5ABDDB39CDD88F823E6CD` |
| candidateDigest / manifestDigest / packageDigest | `454F447303B6D145B99EF2F3155282D02079AF2AAF0699101C20E5C6A7764C02` / `26B31B6976BFB596D399F31EA2688BF79D67FEFF991838E8D3B528E14A911869` / `F0156AC1D4C40EFC4F604EC279903B4513BE6C4F4AA200B0837AEE001F401DCE` |

**Digest'in yasam dongusu (kaynakta olculdu).** `DBE6B8E5…` hazirlik anlik goruntusudur ve iki yurutme adimi kimlik
kapsamindaki dosyalari **bilerek** degistirir:
- Adim 2 (`-Live`) `qualification/REAL-PRIMITIVES-RESULTS.json`'i yeniden yazar.
- Adim 3 OWNER-COMMAND sablonunu doldurur ve sablon testini yeniden kosar.

Bu yuzden owner'in onaylayacagi kimlik (`docs/APPROVED-IDENTITY-<digest8>.json`) **Adim 3'te** yeni digest'le uretilir ve ana
yurutucu bagimsiz yeniden hesaplar. Digest disinda kalanlar (R25 kuraliyla ayni): `PACKAGE-IDENTITY.json`, `MANIFEST.json`,
`qualification/VERIFY-RESULTS.json`, kokteki `OWNER-*.ps1`, `claims/ journal/ cutover-receipts/ preflight/ pins/ authority/`,
`docs/OWNER-RATIFICATION-*.md`, `docs/APPROVED-IDENTITY-*.json`.

## 2. Ratifikasyon referansi

**Onerilen:** `OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-20260911-R01` — **KULLANILMAMIS** (olculdu):

| Arama | Sonuc |
|---|---|
| Kanonik repo, tum tarihce (`git log --all -S`, textconv kapali) | 0 commit |
| Tum uzak dal uclari (`git grep`) · origin/main | 0 · 0 |
| Disk: tum `HY_C33_*` / `HY_C36_*` paket kokleri (authority, pins, claims, journal, preflight, docs dahil) | 0 |
| Bellek kayitlari | 0 |
| Diskteki RELEASE22 desenli tek degerler | yalniz sentetik: NC fikstur `…-20260906-R0x-FIXTURE`, OC testi `…-20260909-R01  # SENTETIK` |

- **Bicim gecerli:** Seal `S-00` (`Seal-Package.ps1:107`), motor `P-04` ve verifier desenine uyar; `FIXTURE` icermez (`:108`).
- **R01 ratifikasyon REVIZYONUDUR, paket numarasi DEGILDIR.** Paket numarasi R27 pakette sabittir: motor P-04, OWNER-COMMAND
  ve verifier V-03, authority/pins/MANIFEST `package` alanini `HY_C33_RELEASE22_CUTOVER_R27`'ye esitler.
- Desen tarihi saatle karsilastirmaz (yalniz bicim). Yeniden deneme gerekirse (exit 2) yeni revizyon (`-R02`) + yeni muhur gerekir.
- **Bu asamada authority/nonce ETKINLESTIRILMEDI** (R27'de `pins/`, `authority/`, `MANIFEST.json`, `claims/` yok — olculdu).

## 3. Kaynak incelemesi bulgulari

### 3.1 ENGEL — bulundu ve giderildi (owner preflight OP-01)

- `tools/Invoke-OwnerPreflight.ps1:148` OP-01, `PACKAGE-IDENTITY.json` icinde `engineSha256 == motor sha` ister.
  R27 kimlik dosyasinda bu alan **yoktu**: benim R26/R27 kimlik ureticim atlamisti. R25'in owner'in kostugu kokunde alan vardi ve OP-01 PASS'ti.
- Kalifikasyon kor kaldi: giris-yolu testi sentetik `{record:'FX', engineSha256}` kimligi kullaniyor.
- **Kanit — prova** (paket KOPYASI; OP-00 yukseltme sarti yalniz kopyada yamali; yukseltilmemis; canliya ve pakete yazma 0):
  - **once:** OP-01 **FAIL**
  - **sonra:** OP-01 **PASS**, 28 PASS
  - kalanlar yalniz yukseltme kaynakli: OP-00 (`elevated=False`), OP-05c (CutoverWriter sinirli token'la gorunmez), OP-08a / OP-09d / OP-09e (erisim reddi, NOT_MEASURED)
  - kanit dizini paket koku DISINDA: `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27.PREFLIGHT-PROVA-R01\` (`prova-ONCE-duzeltme.json` `7C5A1E70…`, `prova-SONRA-duzeltme.json` `0A68A716…`)
- **Duzeltme:** `PACKAGE-IDENTITY.json`'a YALNIZ ust-seviye `"engineSha256": "52C9A220…"` satiri eklendi; diger alanlar ayni.
  Dosya digest DISINDA oldugu icin paket digest'i `DBE6B8E5…` **degismedi** (PowerShell capraz dogrulama ESIT).
  Paket yeniden uretilmedi, kimlik kapsamindaki hicbir dosyaya dokunulmadi.

### 3.2 `Test-RealPrimitives.ps1 -Live` — etkiler (kaynakta dogrulandi, KOSULMADI)

| | Kaynak | Etki |
|---|---|---|
| Yerel HTTP testi | `:31-60` | `%LOCALAPPDATA%\Temp\hy-r27-realprim` silinip yeniden kurulur; gecici loopback test sunucusu (`Local-HttpTestServer.ps1`, `IPAddress::Loopback`, rastgele port, `/quit` veya 90 s bosta kapanir) |
| Kimlik cozumleme | `:61-71` | yerel SID cozumleme; yazma yok |
| CANLI bolum (yalniz `-Live`) | `:72-101` | gorev modeli (API/Web/CutoverWriter), dinleyici + surec komut satiri, host surecleri **okunur**; 4 HTTP istegi: API `GET /` (404 beklenir), Web `GET /` (200), `POST /api/auth/smoke/login {}` (400), `GET /api/auth/capabilities` (200) |
| Paket yazmasi | `:106` | `qualification/REAL-PRIMITIVES-RESULTS.json` **uzerine yazilir** — kimlik kapsaminda (§1) |
| Restart / gorev degisikligi | — | **YOK** |
| Canli DB yazmasi | canli RELEASE21 API kaynagi | **YOK**: `AllExceptionsFilter` yalniz **>=500**'u ErrorLog'a yazar (400/404 haric); `SmokeAuthorizationGuard` bearer yoksa no-op; `TenantLifecycleInterceptor` kullanici yoksa ve GET'te gecirir; `SmokeLoginDto` `{}` ile `ValidationPipe`'ta 400 (handler cagrilmaz); web uygulamasinda DB istemcisi yok. Beklenmedik 5xx olursa tek ErrorLog satiri yazilir |
| Pins varsa | `:76-82` | muhurden sonra kosulursa gorev XML sha'si pins'e karsi da denetlenir; muhurden once yerlesik varsayilanlar |

Seal `S-02b` (`Seal-Package.ps1:134-137`) `liveExecuted=true`, `REAL_PRIMITIVES_PASS`, `failed=0`, `total>=29` ve motor sha
esitligini ister → **Adim 2 muhurden once ZORUNLUDUR**. Seal `S-02` ayrica NC sonucunun motor/seam/ACL tablosuyla taze olmasini ister (olculdu: NC 91/91, motor `52C9A220…`).

### 3.3 Diger adimlarin kaynaktaki yazma yuzeyi

- **Owner preflight** — yalniz `preflight\OWNER-PREFLIGHT-<utc>.json` + `.sha256` (paket ici, digest disi). Canli DB/HTTP/login 0; `.env` icerigi okunmaz; yukseltme zorunlu.
- **Seal** — `pins/PINS.json`, `authority/CUTOVER-AUTHORITY.json` (nonce, 30 dk, tek kullanim), `MANIFEST.json`; hepsi en sonda, tum `S-*` gectikten sonra (`:314-330`).
  Salt-okuma temaslar: `docker exec hukuk-postgres psql … SELECT` (DB snapshot) · Adim 2 ile ayni HTTP problari (`S-08d`) · gorev XML disa aktarimi.
  Tek yan etki: kanonik repoda `git fetch origin` (`:189`), yalniz uzak-izleme ref'lerini gunceller. Herhangi bir `S-*` duserse `SEAL_REFUSED` + exit 1 ve hicbir sey yazilmaz.
  `authority` varsa `-Reseal -ResealReason` olmadan reddeder; onceki nonce claim edilmisse reseal YASAK (`:168-171`).
- **Verifier** — yalniz `qualification/VERIFY-RESULTS.json` (digest disi); git salt-okuma.

## 4. TEK YURUTME SIRASI

Hepsi **"Yonetici olarak calistir" Windows PowerShell 5.1 ConsoleHost**. Her adim bir oncekinin basarisina baglidir; herhangi bir
adim beklenen sonucu vermezse **DUR**; sonraki adima gecilmez.

### Adim 0 — Ratifikasyon referansi (owner)
`OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-20260911-R01` kabulu ve owner'in ratifikasyon metni (Adim 3a kaydina girer).
Komut yok; yazma yok.

### Adim 1 — Owner salt-okuma preflight

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27'; $p="$R\tools\Invoke-OwnerPreflight.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '06FADC5DEFB121E85BEF4B4EDB612F855B9EF58F71EABF697198492CC762A91F') { Write-Host 'PREFLIGHT ARACI SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; Write-Host ('cikis=' + $LASTEXITCODE) }
```

- **Yazma:** yalniz `preflight\OWNER-PREFLIGHT-<utc>.json` + `.sha256`. Production 0; restart 0.
- **Basari:** `cikis=0` `OWNER_PREFLIGHT_READY` (34 kontrol). Yukseltilmis oturumda OP-00, OP-05c ve OP-08a/09d/09e da olculmeli.
- **Basarisizlik:** 1 FAIL · 2 NOT_MEASURED (PASS degil) · 3 on kosul (yukseltme yok) · 4 PREFLIGHT_ABORTED (istisna kanita yazilir) -> DUR, neden giderilir, yeniden kosulur (tekrarlanabilir; digest disi).

### Adim 2 — Gerekli primitive kontrolleri (canli salt-okuma)

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27'; $p="$R\qualification\Test-RealPrimitives.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '96269C890343F72B7E49C443BC8A583217C97EF66BBE4B28F9B66D2DD434F248') { Write-Host 'SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Live; Write-Host ('cikis=' + $LASTEXITCODE) }
```

- **Etki:** §3.2. Restart 0; canli DB yazmasi 0 (5xx olmazsa); `REAL-PRIMITIVES-RESULTS.json` yeniden yazilir.
- **Basari:** `cikis=0` `REAL_PRIMITIVES_PASS (live=True)`; `total>=29`. CutoverWriter yukseltilmemis oturumda `NOT_MEASURED` kalabilir (Seal kabul eder; motor P-07 yukseltilmis olcer).
- **Basarisizlik:** exit 1 `REAL_PRIMITIVES_FAIL` -> Seal `S-02b` reddeder; neden giderilir, yeniden kosulur (sonuc dosyasi uzerine yazilir).

### Adim 3 — Kimlik dogrulama + calistiricilar (AYRI GO; yazici OFFICE 33, bagimsiz dogrulama ana yurutucu)

R25'te kullanilan izinli turetme deseni. Yazma YALNIZ R27 paketi icinde; production temasi 0. Sira baglayicidir:

| # | Is | Yazilan | Kimlik etkisi |
|---|---|---|---|
| 3a | Ratifikasyon kaydi `docs/OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-20260911-R01.md` (owner metni) | 1 dosya | digest disi |
| 3b | OWNER-COMMAND sablonunda `__OWNER_RATIFICATION_REF__` -> ref; kok `OWNER-COMMAND.C33-CUTOVER.ps1` = sablonun bayt-kopyasi | sablon + kok | sablon digest ICI, kok disi |
| 3c | `Test-OwnerCommandTemplate.ps1` yeniden: OC-10 artik ref'in 3a kaydini ister | `OWNER-COMMAND-TEMPLATE-RESULTS.json` | digest ICI |
| 3d | Verifier (muhursuz): `PACKAGE_STATIC_VERIFIED_UNSEALED`, `V-05d` canli PASS | `VERIFY-RESULTS.json` | digest disi |
| 3e | Onayli kimlik: Adim 2 + 3b + 3c sonrasi digest -> `docs/APPROVED-IDENTITY-<digest8>.json` (`unsealedDigest`); node + PS + ana yurutucu bagimsiz | 1 dosya | digest disi |
| 3f | OWNER-RUN sablonu: `RATIF`, `PREFLIGHT_EVIDENCE` yolu + sha (Adim 1), `APPROVED_DIGEST`/`LIST` (3e), `OWNER_COMMAND_SHA` (3b kok), kayit yollari; kok `OWNER-RUN.C33-RELEASE22.ps1` = bayt-kopya | sablon + kok | onay-SONRASI degisen (`POST_APPROVAL_CHANGED`) |

- **Basarisizlik:** herhangi bir sha/digest uyusmazligi -> DUR; yer tutucu kalirsa OWNER-RUN `exit 90`.
- Owner, Adim 4'ten once onayli digest'i ve iki calistiricinin sha'sini gorur.

### Adim 4 — Muhur -> dogrulayici -> cutover (tek owner komutu)

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27\OWNER-RUN.C33-RELEASE22.ps1" -Confirm "C33-RELEASE22-CUTOVER-GO"
```

OWNER-RUN sha'si Adim 3f'te verilir; komut o sha kontrolu ile verilir. Zincir:
1. `OR-00..OR-04b`: oturum, motor literali, preflight kaniti, onayli kimlik disk esitligi, claim 0, OWNER-COMMAND sha.
2. **SEAL**: pins/authority/MANIFEST; 30 dk pencere buradan baslar.
3. **VERIFIER**: `PACKAGE_VERIFIED`.
4. **OWNER-COMMAND** -> motor.

**Ayri adimlarla** (owner muhur ile cutover'i ayri onaylamak isterse; ikisi ayni 30 dk pencere icinde):

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27'; if ((Get-FileHash -Algorithm SHA256 -LiteralPath "$R\tools\Seal-Package.ps1").Hash -cne '87FD9774D705283CFE109D2FD41778A7A66452EE83897CA67B8FC0AA6FA89794') { Write-Host 'SEAL SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$R\tools\Seal-Package.ps1" -RatificationRef 'OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-20260911-R01'; Write-Host ('cikis=' + $LASTEXITCODE) }
```

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27'; if ((Get-FileHash -Algorithm SHA256 -LiteralPath "$R\qualification\Verify-Package.node.js").Hash -cne 'C24439DDD35F8D076FAAAA33AAC97A0CCE4840827BCDF4CCA419243AD0342FCC') { Write-Host 'VERIFIER SHA UYUSMUYOR - DUR' } else { node "$R\qualification\Verify-Package.node.js" "$R"; Write-Host ('cikis=' + $LASTEXITCODE) }
```

Sonra `OWNER-COMMAND.C33-CUTOVER.ps1 -Confirm "C33-RELEASE22-CUTOVER-GO"` (sha'si 3b'de). Pencere dolarsa OWNER-RUN claim yoksa
ELLE reseal yapar; otomatik reseal yoktur.

**Motor fazlarinin yazma / restart etkisi** (`engine/Invoke-C33Cutover.ps1`, kaynakta):

| Faz | Kapilar | Yazma / restart | Kaynak |
|---|---|---|---|
| **P** on-ucus | P-01..P-18 (+P-05b) | **0** (claim tuketilmez) | `:396-511` |
| **B** claim | B-01 | `claims\CLAIM-<nonce>.json` + `journal\NONCE-<nonce>.marker` (paket ici) — **nonce tuketilir** | `:516-524` |
| **H** release-yerel | H-01..H-04 | `HY_W4_RELEASE22\project\apps\api\.env` **CreateNew** (RELEASE21 baytlari aynen); ACL: env parent + env dosyasi `RUNTIME_CONFIG`, RELEASE22 koku `IMMUTABLE_RELEASE`. Canli kok/bin ACL yalniz dogrulanir | `:530-563` |
| **C** cutover | C-01..C-04 | `HukukPlatform-API` / `-Web` **Disable + Stop** (kesinti T1) -> `C:\Ops\hukuk\bin` host + start-api + start-web **atomik** degisim (preimage exact -> postimage exact) -> **Enable + Start** API, sonra Web (kesinti T5 biter) | `:569-628` |
| **V** post | V-01..V-03 | 0 (DB snapshot degismedi, gorevler, ACL, PRE-01/06/07/08 yeniden) | `:630-645` |
| **COMMIT** | — | journal + `cutover-receipts\CUTOVER-<RUNID>.json` | `:645-646` |
| **R** rollback | R-01 | bin preimage 3/3, `.env` (sha esitse) kaldir, ACL preimage, eski gorevler Enable+Start | `:648-706` |

Motorun DB yazmasi **0** (verifier `V-04`: INSERT/UPDATE/DELETE/TRUNCATE/DROP, migrate, provision 0). Gorev kaydi degismez (Register/Unregister 0).

**Cikis kodlari:**

| Kod | Anlam | Ne yapilir |
|---|---|---|
| **0** | `C33_RELEASE22_CUTOVER_APPLIED_AND_VERIFIED` | Adim 5 |
| **1** | `HARD_STOP_PREFLIGHT_NOT_APPLIED` — mutasyon 0, claim TUKETILMEDI | neden giderilir; pencere gecmisse reseal |
| **2** | `ROLLBACK_COMPLETE_OLD_RUNTIME_RESTORED` — RELEASE21 geri, nonce TUKETILDI | yeni deneme = yeni ratifikasyon revizyonu + yeni muhur |
| **3** | `HARD_STOP_STATE_UNCERTAIN_MANUAL_RECOVERY_REQUIRED` | reseal YOK; §5.2 elle kurtarma + owner karari |
| 70 · 90 · 91 | makbuz yazimi · OWNER-COMMAND durdu · OWNER-RUN durdu (motor calismadi) | nedene gore |

### Adim 5 — Teknik kabul (salt-okuma)

```powershell
$want='HY_W4_RELEASE22'; $bid='xJZ1G1TsbOnHoWUzMD8CQ'; $d="C:\Development\HUKUK_YAZILIMI\$want\project\apps\api\dist\apps\api\src\modules"
foreach($port in 8080,3002){ $c=Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1; $pr=Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess); $root=if($pr.CommandLine -match '(HY_W4_RELEASE[0-9A-Z]+)'){$Matches[1]}else{'-'}; '{0} pid={1} kok={2} {3}' -f $port,$c.OwningProcess,$root,$(if($root -ceq $want){'OK'}else{'FARKLI'}) }
foreach($f in 'hukuk-task-host.exe','start-api.ps1','start-web.ps1'){ 'bin {0} {1}' -f (Get-FileHash -Algorithm SHA256 -LiteralPath "C:\Ops\hukuk\bin\$f").Hash,$f }
'BUILD_ID=' + (Get-Content -Raw -LiteralPath "C:\Development\HUKUK_YAZILIMI\$want\project\apps\web\.next\BUILD_ID").Trim()
'buildManifest=' + $(try{(Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3002/_next/static/$bid/_buildManifest.js").StatusCode}catch{$_.Exception.Response.StatusCode.value__})
'api GET / =' + $(try{(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/').StatusCode}catch{$_.Exception.Response.StatusCode.value__}) + ' (404 beklenir)'
foreach($m in @(@('client\client.service.js','pureNoOpDetected'),@('office-approval\office-write-role.policy.js','OFFICE_WRITE_DENIED_VIEWER'),@('office-approval\office-write-role.policy.js','OFFICE_APPROVAL_DECISION_DENIED_VIEWER'),@('office-approval\office-f01-authorization.guard.js','isF01WriteActorAuthorized'),@('office-approval\office-approval.service.js','assertApprovalDecisionRoleAllowed'),@('office-approval\office-approval.service.js','assertGenericDecisionAllowed'),@('lawyer\lawyer.service.js','LAWYER_REACTIVATE'),@('lawyer\lawyer.service.js','assertCreateAuthorized'))){ '{0,-40} satir={1}' -f $m[1], @(Select-String -LiteralPath (Join-Path $d $m[0]) -SimpleMatch -Pattern $m[1]).Count }
```

**Beklenen:**
- 8080 ve 3002: `kok=HY_W4_RELEASE22 OK`; eski PID'ler (50716/22440) yok.
- bin: `E744A74B…` / `77B6FBCD…` / `1B7654F6…`.
- `BUILD_ID=xJZ1G1TsbOnHoWUzMD8CQ`; `buildManifest=200`; `api GET / =404`.
- Isaret satir sayilari: 3 · 3 · 3 · 1 · 2 · 5 · 1 · 1.
- Ek: migration defteri 130/130 degismedi; makbuz `dbMutations 0`.
- Isaret yoksa ya da sayi farkliysa **DUR**.

### Adim 6 — Hedefli kabul (her biri AYRI owner GO; canli yazma yalniz sentetik tenant'ta)

**CLIENT I9** (paket `client-live-acceptance-i9-r01`, `d6c51ca0`'da sabit)

- **On kosul:** Adim 5 PASS ve `pureNoOpDetected` satir 3.
- **Komut** (paket §9): `CL_ENVIRONMENT=live`, `CL_OWNER_GO_REF=OWNER-GO-CLIENT-I9-YYYYMMDD-Rnn`,
  `CL_API_BASE_URL=http://127.0.0.1:8080/api`, `CL_RUN_ID` (yazmadan once kayda gecer), paket disi `CL_STATE_FILE`;
  `node .\project\docs\governance\client-live-acceptance-i9-r01\scripts\i9-run.js`.
  - `CL_PRISMA_ROOT` / `CL_BCRYPT_PATH` paket belgesinde RELEASE21 `node_modules`'unu gosterir. RELEASE21 koku rollback hedefi olarak diskte kalir, bu yollar gecerlidir.
- **Canli yazma** (paket §5):
  - I9'un KENDI tenant'inda tek transaction'da 8 INSERT (`cl-acc-<runId>`, 3 User, …).
  - Olcumun urettigi UPDATE'ler (A-7 pozitif `isActive false->true`).
  - Kapanista 3 User `isActive=false` + `tokenVersion++` (`cl-09`).
- **Kurtarma:** yalniz runId ile `cl-09-close-access.js`.
- **Olcut:** A-0/A-7/A-8; RELEASE22'de A-8 aktif kayda `PUT {isActive:true}` icin **200** beklenir (B-1).
- **Sayac:** 8/17 -> 9/17 yalniz I9 canli PASS'ten sonra; hizmet kabulu 0/8 tam kalir.

**OFFICE**

| Kalem | Canli kapsam | Canlida KOSULMAYAN |
|---|---|---|
| AK-2 #2599/#2602 | dist isaretleri (Adim 5); islevsel: sentetik tenant, yetkisiz ayricalikli create -> 403 + yazma 0, ADMIN/bagli PARTNER -> 201 + `LAWYER_CREATE` audit (audit KALICI veri) | — |
| AK-1a #2604 | sentetik tenant, bagli VIEWER F01 yazma -> 403 `OFFICE_WRITE_DENIED_VIEWER`, okuma 200 (ret yazma uretmez; kurulum yazar ve kapatilir) | — |
| AK-1a eki #2606 | yalniz dist isaretleri | FD ofis/icerik onayi senaryolari (canlida FD yayini acik — gercek e-posta riski) |
| CLF-O0-01 #2608/#2612 | dist isareti `assertGenericDecisionAllowed` satir 5 | FD talebi uretimi (ayni neden) |

Onceki OFFICE kabulleri (O-1..O-10, A-03..A-06, A-07) gecerli; A-07 **yeniden kosulmaz** (fixture tuketildi).

## 5. RELEASE21 geri donus baglari (gercek dosya/hash)

| | Deger |
|---|---|
| Hedef | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE21` @ `2187a78b1621f168605920cdffccb17381dc171a` (worktree kaydi) — su an CANLI (API pid 50716 · Web pid 22440) |
| Kok butunlugu | muhurlu manifest `D6082E199ACA34964037B44EFD48EAB80E280EF7668B74CC605431E024B41D61`'e karsi **88.132/88.132 esit** (83.339 dosya + 4.793 baglanti), okunamayan 0 |
| Girisler | API `main.js` `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` · Web `next` `AFEE236A880DA3AC64CAB43A4DB016B73E55209B241DA7453690DC3EC43837A3` · `client.service.js` `5D3DF71CE74AD49D1081E06167E2A92C71BF7946A0E2BF32577572E1BF99E97D` · BUILD_ID `g91HUaBesekB-R2rRawQj` |
| `.env` (H-01 kaynagi) | sha256 `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` — kayitta KALIR; icerik okunmadi ve paylasilmaz |
| bin preimage (= canli) | host `1397C54C46D4E9979A79C929959129D54954F8CE36B7CFB333ED88C2522F9F22` · start-api `4ACA26CD6006B0D6B5D0B06166FE60AEA05973B2F668E642C667D914076496A1` · start-web `DA62DD2D507537A8E1A6495E82D163D315A56DBE97189007411D803F2AB5D531` |
| Pakette geri donus kopyalari | `generations/R21/` = canli bin (Katman 1 makbuzunda listeli); Seal S-06 gercek blogu canli salt-okuma PASS |
| Muhurlu R21 aday paketi | packageDigest `851C07DFCD2C6FBBA3A705840A401D4E8693A8F75BA62EE964C8763200B84A22` |

### 5.1 Otomatik (motor R-01)
H/C/V kapisi duserse API+Web birlikte RELEASE21'e preimage-aware doner. Tutarsa exit 2, tutmazsa exit 3.
Geri gelen kusurlar: AK-2 · AK-1a · AK-1a eki · CLF-O0-01 · B-1. F-B01-03/F04 RELEASE21'dedir. Veri geri alinmaz.

### 5.2 Elle kurtarma (yalniz exit 3; reseal YOK)
Once makbuzdaki `rollback.detail` ve journal okunur. Yalniz bin + gorev katmani; sha ve ACL korumali:

```powershell
$G='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27\generations\R21'; $B='C:\Ops\hukuk\bin'
$exp=[ordered]@{'hukuk-task-host.exe'='1397C54C46D4E9979A79C929959129D54954F8CE36B7CFB333ED88C2522F9F22';'start-api.ps1'='4ACA26CD6006B0D6B5D0B06166FE60AEA05973B2F668E642C667D914076496A1';'start-web.ps1'='DA62DD2D507537A8E1A6495E82D163D315A56DBE97189007411D803F2AB5D531'}
foreach($f in $exp.Keys){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $G $f)).Hash -cne $exp[$f]){ throw "rollback kaynagi sapmis: $f" } }
$sd=@{}; foreach($f in $exp.Keys){ $sd[$f]=(Get-Acl -LiteralPath (Join-Path $B $f)).Sddl }
Stop-ScheduledTask -TaskName 'HukukPlatform-API'; Stop-ScheduledTask -TaskName 'HukukPlatform-Web'
$t0=Get-Date; while((Get-NetTCPConnection -State Listen -LocalPort 8080,3002 -ErrorAction SilentlyContinue) -or (Get-Process -Name 'hukuk-task-host' -ErrorAction SilentlyContinue)){ if(((Get-Date)-$t0).TotalSeconds -gt 90){ throw 'surecler 90 s icinde durmadi - DUR' }; Start-Sleep -Milliseconds 500 }
foreach($f in $exp.Keys){ $d=Join-Path $B $f; Copy-Item -LiteralPath (Join-Path $G $f) -Destination $d -Force; if((Get-FileHash -Algorithm SHA256 -LiteralPath $d).Hash -cne $exp[$f]){ throw "geri yazim dogrulanamadi: $f" }; $a=Get-Acl -LiteralPath $d; if($a.Sddl -cne $sd[$f]){ $a.SetSecurityDescriptorSddlForm($sd[$f]); Set-Acl -LiteralPath $d -AclObject $a } }
Enable-ScheduledTask -TaskName 'HukukPlatform-API' | Out-Null; Enable-ScheduledTask -TaskName 'HukukPlatform-Web' | Out-Null
Start-ScheduledTask -TaskName 'HukukPlatform-API'; Start-ScheduledTask -TaskName 'HukukPlatform-Web'
```

Ardindan Adim 5 blogu **geri yon beklentileriyle** (kok `HY_W4_RELEASE21`, BUILD_ID `g91HUaBesekB-R2rRawQj`, bin = preimage) kosulur.

## 6. Kesinti beklentisi

**~15–60 s** API+Web (emsaller R23 14,673 s · R24 13,716 s · R25 57,647 s; baskin bilesen start+probe). Ust sinir quiesce 90 s +
start 240 s (ayri). Rollback suresi olculmemis. Web BUILD_ID degisir. Cutover penceresinde kabul/sentetik tenant kosumu YAPILMAZ
(`V-01` DB snapshot farki rollback tetikler).

## 7. FD kurtarma incelemesi — sonuc (onceden yetkilendirilen inceleme, #2614 §6)

- **Incelenen yol:** `POST /client-financial-disclosures/:disclosureVersionId/reconcile-consumed-office-approval`.
- **Kim cagirabilir:** JWT'li her kullanici; F01 kapisi yok.
  - Bayrak `CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED` birebir `'true'` olmali. Canli `.env`'de `'true'` (yalniz iki bayrak okundu).
  - Cagiran, kayittaki karar verici olmali (degilse 403 `DISCLOSURE_APPROVAL_NOT_ELIGIBLE`).
  - Karar vericinin **bugunku** rutbe/delegasyon uygunlugu denetlenir; **rol denetlenmez**.
- **Ne uygular:** yalniz duz `APPROVED` genel kutu talebini. Surume bagli, snapshot/payloadHash birebir, surum
  `OFFICE_APPROVAL_PENDING` olmali. Kayitli `approverUserId`/`decidedAt` aynen tasinir; ikinci cagri idempotent.
- **Canli olcum** (2026-09-11, `hukuk_db@5432`, tek salt-okuma transaction, yazma 0):
  - FD surumleri `PUBLISHED` 2; talepler `APPROVED` 2.
  - `OFFICE_APPROVAL_PENDING` 0 -> **kurtarma adayi 0**.
  - Bugun VIEWER olanlarin FD onay/karari 0; VIEWER 1 kullanici, uygun avukata bagli 0.
  - Rol degisikligi audit'i 0.
- **Karar anindaki rol:** iki gecmis FD onayi icin **BILINMIYOR**; hicbir yerde kayitli degil. Bugunku rolden gecmis yetki cikarilmadi.
- **Etki:** **bugun sifir**. Yeni aday olusmasi yapisal olarak kapali: #2608 dort karar rotasi, #2612 iptal, ikisi de adayda.
  Aciklik yalniz gecmis/elle DB'ye girilmis kayitlara karsi gizil; olculen 0.
- **Oneriler UYGULANMADI** (owner karari; RELEASE22 kapsaminda degil; yayini ENGELLEMEZ):
  - **P1:** kurtarmada cagirana karar-ani rol kapisi (VIEWER -> 403, yazmadan once).
  - **P2:** kanitlanamayan karar-ani yetkiyi cikarmama / audit'siz veya PR-1.3 oncesi kararda kurtarmayi kapatma.
  - **P3:** karar aninda rol/rutbe anlik goruntusunu audit'e yazma.

## 8. Kalan kararlar

**Yurutme (sirayla; her biri ayri onay):**

| # | Karar | Kim |
|---|---|---|
| 1 | Ref `OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-20260911-R01` kabulu + ratifikasyon metni | owner |
| 2 | Adim 1 owner preflight kosumu | owner (yukseltilmis) |
| 3 | Adim 2 `-Live` kosumu | owner GO |
| 4 | Adim 3 onayli kimlik + calistiricilar | owner GO; yazici OFFICE 33, dogrulama ana yurutucu |
| 5 | Adim 4 canli yayin (tek komut ya da muhur/cutover ayri) | owner |
| 6 | CLIENT I9 canli kosumu | owner GO |
| 7 | OFFICE AK-2 / AK-1a canli islevsel kabul (sentetik tenant) | owner GO (her biri) |

**Urun / politika (ACIK; RELEASE22'yi engellemez; kapatilmis gosterilmez):**
- FD kurtarma P1/P2/P3.
- AK-1b / AK-1c.
- Ayricaliksiz pasif avukatin create ile yeniden etkinlesmesi (CLIENT R1A ilkesi).
- VIEWER yurutme/kurtarma yollari: payout finalize, dagitim post, FD yayin, FD reconcile.
- CASE duzeyi VIEWER denetimi.
- B-2 (lifecycle reddi stabil kod tasimiyor).
- `/cases` on kontrol yarisi.
- Ofis oto-olusturmanin transaction disinda kalmasi.
- Seed'in OFFICE disi uclari.
- Karar dugmeleri UX'i.

**Karara baglanmis (bu GO):** RELEASE22/R27 secimi kesin · R26 degismez · RELEASE21 `.env` hash'i kayitta kalir, icerik paylasilmaz.

## 9. Sinir beyanlari

```text
CANLI GECIS / DEPLOY / RESTART = YOK · MUHUR / AUTHORITY / NONCE = YOK · -Live = KOSULMADI · CANLI KABUL YAZMASI = YOK
R27 PAKETI = yeniden URETILMEDI; tek degisiklik PACKAGE-IDENTITY.json'a engineSha256 alani (digest DISI; DBE6B8E5 degismedi)
PROVA = paket KOPYASINDA, yukseltilmemis, OP-00 yalniz kopyada yamali; canli ve paket yazmasi 0
R26 = DEGISMEDI (kimlik C319DE15 yeniden hesapla esit)
```

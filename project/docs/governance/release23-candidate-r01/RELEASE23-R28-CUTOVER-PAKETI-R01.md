# RELEASE23 — R28 — TEK INCELEME PAKETI (sabit aday 2740df3d, canli yayin oncesi)

```text
YETKI     : OWNER GO 2026-09-12 "DEVAM — ONCEDEN YETKILENDIRILMIS ADAY HAZIRLIGINI TAMAMLA" (aday derlemesi + geri donus paketi;
            canli cutover/restart/yapilandirma degisikligi YOK)
DURUM     : ADAY DERLENDI + KATMAN 1 MUHURLU + R28 PAKET HAZIRLIGI TAMAM — R28 MUHURSUZ
YAPILMADI : muhur (pins/MANIFEST) · authority · nonce · owner preflight · -Live · onayli kimlik · canli cutover · deploy/restart · migration · canli kabul
YETKI SINIRI : bu belge muhurleme, authority etkinlestirme veya cutover yetkisi DEGILDIR
KAYIT     : CLIENT sayaci 10/17 · hizmet kabulu 0/8 tam (degismedi)
```

Paket kimligi (muhursuz, dosya listesi, qualification verdict'leri): `PACKAGE-IDENTITY.json`.

## 1. Aday — depodan cozuldu, SABIT

| | Deger | Kanit |
|---|---|---|
| **Aday** | `2740df3dd58c5e711a790cc21a5f69d6dbffb35d` | #2646 squash; origin/main tarihcesinde (`merge-base --is-ancestor`) — hareketli main KULLANILMADI |
| Canli -> aday | 33 commit; **urun farki 7 dosya** (spec/test/CI-manifest haric) | `git diff --name-only 13740670..2740df3d -- project/apps` |
| Kapsam PR'lari | **#2641** `b9fd97a1` (OFFICE create sirasi) · **#2643** `d199c8dc` (B-I11-3) · **#2645** `e65ff5de` (dar atomiklik) — ucunun de adayin atasi oldugu olculdu | dosya -> commit eslemesi: `party-write-tx.ts`/`client`/`debtor`/`office-write-role.policy.ts` <- e65ff5de · `case`/`lawyer` <- e65ff5de+b9fd97a1 · `error-log.sanitize.ts` <- d199c8dc |
| Degismeyen | Prisma sema/migration 0 · `pnpm-lock.yaml` 0 · tum `package.json` 0 · `apps/web` 0 · `packages/` 0 · kok yapilandirma 0 · `project/apps` + `project/docs` DISI 0 | olculdu |
| Release koku | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23` — detached worktree; HEAD = tam aday; izlenen/izlenmeyen kir 0; `apps/api/.env` YOK (PRE-01) | worktree kaydi |
| Web BUILD_ID | `dOiGPj2M0Abls0kCibY4r` | dosya |
| Katman 1 makbuzu | `HY_C33_RELEASE23_CANDIDATE\RELEASE23-CANDIDATE-RECEIPT.json` `6BF43693D45C1245693381BCAC448DCA20522E57A6F461BB1476A1EC66D1E6D3` (yan `.sha256` esit; packageDigest bagimsiz yeniden hesapla esit) | dosya |

## 2. Derleme ve derleme farki

**Derleme (RELEASE22 yordami, #2614 §3):** `git worktree add --detach` -> `pnpm install --frozen-lockfile` (pnpm 8.15.0) ->
`pnpm db:generate` -> `pnpm build`; dordu de exit 0 (4 s / 27 s / 7 s / 69 s). turbo cache miss 3/3 (api, web, calc-preview-sdk);
`node_modules` yerel (junction YOK), Prisma istemcisi kok icinde cozuluyor.

**API `dist` (RELEASE22 3.919 -> RELEASE23 3.922 dosya):** 16 degisen + 3 yeni, silinen 0.
- Degisen: `case`, `client`, `debtor`, `error-log.sanitize`, `lawyer` icin `.js`/`.d.ts`/`.map` (15) + `tsconfig.dev.tsbuildinfo`.
- Yeni: `common/party-write-tx` (`.js`/`.d.ts`/`.map`).
- `office-write-role.policy.ts` kaynak farki ayni satirda yalniz yorum (`resolveInlinePartiesBeforeTx` -> `resolveInlinePartiesInTx`) -> `.js` AYNI (`13119AF4…`).
- `main.js` ayni (`28D84796…`) — giris hash'i derlemeyi ayirt ETMEZ. **Kapsam disi derleme farki 0.**

**Web `.next`:** kaynak farki 0; rota yuzeyi birebir — app-path-routes 55/55, routes-manifest esit, prerender 42/42; yeni BUILD_ID.

| Isaret (derlenmis dosya; satir sayisi) | RELEASE22 | RELEASE23 |
|---|---|---|
| #2643 `redactSecretPathSegments` (`error-log/error-log.sanitize.js`) | 0 | **3** |
| #2645 `party-write-tx` (case / client / debtor / lawyer `.service.js`) | 0 / 0 / 0 / 0 | **1 / 1 / 1 / 1** |
| #2645 `createPartyWriteTxContext` (`common/party-write-tx.js`, yeni dosya) | dosya yok | **2** |
| KORUNAN: `pureNoOpDetected` · `OFFICE_WRITE_DENIED_VIEWER` · `assertGenericDecisionAllowed` · `LAWYER_REACTIVATE` · `assertCreateAuthorized` | 3 · 3 · 5 · 1 · 1 | **3 · 3 · 5 · 1 · 1** |

## 3. Katman 1 — `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CANDIDATE`

- **Arac forku** `tooling/fork-r22-to-r23.js`: kural 47/47, eski jeton kalintisi 0; RELEASE22 aday paketi fork oncesi = sonrasi
  (53 dosya liste-ozeti ayni). Sertlestirme: host ureticisinin gecici dizin ozyinelemeli silmesi kaldirildi (benzersiz dizin, varsa DUR, sonda KORU).
- **Nesiller** (canli `C:\Ops\hukuk\bin` once = sonra):

| Nesil | API launcher | Web launcher | Host | Not |
|---|---|---|---|---|
| **R22 — geri donus** | `77B6FBCD…` | `1B7654F6…` | `E744A74B…` | canli bin ile **bayt-esit** kopya |
| **R23 — ileri** | `CC634BBF…` (yalniz 4 yol satiri) | `F39F7A54…` (yalniz 3 yol satiri) | `691BC146…` (26.112 B; `byteExact=false / semantic=true`) | profil `PRF-1c343861-7177-4799-be95-0c1fb72dd212` |

- **Zincir `run-chain.ps1`: 11/11 exit 0** — manifest 21,6 MB / 88.230 satir · Node 38/38 · PS 28/28 `RELEASE23_MANIFEST_VALID` ·
  ADIM2 39/39 · 2b yazici 5 / siniflandirilamayan 0 · ADIM4 22/22 · env anahtar gereksinimi RELEASE22 ile BIREBIR (149 / 25 / 6; yeni anahtar yok) ·
  R09 37/37 (+B-072b NOT_EXECUTED, R22'de de ayni) · makbuz muhru.
- **Makbuz:** packageDigest `176500F105359543B8E8092F4CB65CBB5C4ED7987F8ABA2381FD7FABA39C1F59` (50 dosya) · candidateDigest
  `EF8ED2AC844CB0CB943499C97266FD740677B9D17D6783867E248C02328D6846` · manifestDigest `E53618ED81FF02B43CB03B26656275B860D1C9B399C7D561A75BE0CA17F61AD5` ·
  defter `52075981B6315B34CB7A51271990908A6A7A570354398C6AA1C86E7ED869EC46` · durum `CANDIDATE_BUILT_AND_VERIFIED / CUTOVER_NOT_AUTHORIZED (RELEASE22 rollback pinned)`,
  production authority NONE · karsilanmayan PRE-01/07/08 (cutover H fazi) · olculemeyen PRE-06 (yukseltilmis olcum).

## 4. Paket numarasi, kok ve kimlik baglari

| | Deger |
|---|---|
| **Numara / kok** | **R28** — `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28` (C33 R20..R27 kullanildi; origin/main ve HY_* dizinlerinde R28 C33 kullanimi YOK — tek "R28" gecisi C22 DOGFOOD kayit satiri, C33 disi) |
| Paket kimligi literali | `HY_C33_RELEASE23_CUTOVER_R28` — motor P-04 + OWNER-COMMAND + verifier V-03/V-04d uc alanda (authority/pins/MANIFEST) zorunlu |
| Ratifikasyon ref bicimi | `OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-YYYYMMDD-Rnn` — **Rnn revizyondur, paket numarasi DEGILDIR** |
| Motor | `engine\Invoke-C33Cutover.ps1` `2AE770435B769A21CFF495BF2224A3385EE27A3DD2E5E6E538D6BB3218DFA927` (R27 motoru `52C9A2207647AAE5…` + jeton/anlatim; motor mekanizmasi degismedi). `FORK-PROVENANCE.json` `mechanismChanges` 3 kalem: (1) motor/OC anlatimi RELEASE23 kalemleri, (2) verifier V-06b README zorunlu kalemleri, (3) kalifikasyon kosuculari gecici alan SILMEZ |

Aday SHA, makbuz/candidate/manifest/package digest'leri, profil ve BUILD_ID muhurde `pins`/`authority`'ye yazilir ve motor P-04/P-05/P-05b,
OWNER-COMMAND literalleri ve verifier V-02*/V-03 ile karsilastirilir (R27 §4 ile ayni baglar; degerler bu belgedeki).

## 5. Kalifikasyon — BU paketin motoruna (`2AE77043…`) karsi

| Takim | Sonuc | Sonuc dosyasi sha256 |
|---|---|---|
| Fork `fork/fork-r27-to-r28.js` | anlamsal 18/18 · kalkan 1/1 · jeton 29/29 · pin 12/12 · sozdizimi 19/19 · yasakli kalinti 0 · pozitif eksik 0 | `FORK-PROVENANCE.json` |
| Negatif kontroller (NC) | **91/91** `QUALIFICATION_PASS` · fp 0 · fn 0 · beklenmeyen 0 | `3F7F569E…` |
| Gercek primitifler (yerel) | **21/21** `REAL_PRIMITIVES_PASS` (`live=False`) | `6E9631A9…` |
| Preflight giris yolu / fikstur | **12/12** / **14/14** | `AFFCEFBF…` / `EFDE1A6C…` |
| C36 makbuz baglama provasi | **29/29** | `CC4FF8DD…` |
| OWNER-COMMAND sablonu | **16/16** (OC-09b/c/d paket kimligi dahil) | `391A5811…` |
| Bagimsiz verifier (muhursuz; bu belge yazildiktan SONRA yeniden kosuldu) | **PACKAGE_STATIC_VERIFIED_UNSEALED** — FAIL 0 · NOT_EXECUTED 15 (muhur gerektiren kapilar) | `63E77A83…` (kosum zamani tasir; guncel deger `PACKAGE-IDENTITY.json`) |
| Seal S-06 / S-08c **CANLI salt-okuma** + simulasyon | **10/10** beklenenle uyumlu: R28 canli PASS/PASS (bin = R22 geri kopyalari; API 46332 / Web 47004 RELEASE22 girisleri); **R27 canli FAIL/FAIL** (tuketildi, muhurlenemez); RELEASE23 canliymis gibi -> ikisi de FAIL; RELEASE21 bin -> R27 PASS (ayirt edicilik) | `F8A155B6…` |

**Owner preflight PROVASI (2026-09-12, canli salt-okuma; R27 §3.1 emsaliyle ayni yontem):** paket scratchpad'e bayt-kopyalandi (52/52
sha esit), kopyada `tools\Invoke-OwnerPreflight.ps1` YALNIZ OP-00 on kosul satirinda `$elev` -> `$true` (1 satir; OP-00 kontrolunun kendisi
yine FAIL raporlar), YUKSELTILMEMIS WinPS 5.1 ile kopya uzerinde kosuldu. Sonuc **PASS 28 · FAIL 2 · NOT_MEASURED 3** — dusenlerin TAMAMI
yukseltme kaynakli: OP-00 (`elevated=False`), OP-05c (CutoverWriter sinirli token'da gorunmez), OP-08a/OP-09d/OP-09e (erisim reddi).
**R28'e ozgu engel YOK**; OP-01 (motor sha == `PACKAGE-IDENTITY.engineSha256`), OP-02a/b, OP-03a/b/c, OP-04a/b/c, OP-05a/b, OP-06a/b,
OP-07a/b/c, OP-08b, OP-09a/b/c/f/g/h/i/k, OP-10a/b, OP-11 PASS. Paket kokune yazma 0 (`preflight\` YOK). Kanit paket koku DISINDA:
`C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28.PREFLIGHT-PROVA-R01\` — `prova-preflight.json` `CE2A161A…` (yan `.sha256` esit),
yamali kopya `ECD17204…`, log `A19866E5…`. **Prova owner preflight'i YERINE GECMEZ**: Adim 1 yukseltilmis oturumda aynen kosulur.

**Kosum kaydi (gizlenmez):** NC ilk kosumu **90/91** verdi — NC-02 (MANIFEST tamper) README YOKKEN kosuldu (fikstur README'yi bozar;
README 23:36:20'de yazildi, NC 23:34:49'da baslamisti). Kapi gevsetilmedi; README yazildiktan sonra NC ve verifier yeniden kosuldu: 91/91, FAIL 0.
Kalifikasyon kosuculari R28'de gecici alan SILMEZ (README §2 madde 3).

## 6. RELEASE22'ye geri donus — gercek dosya/hash'lerle dogrulandi

| | Deger |
|---|---|
| Hedef | `HY_W4_RELEASE22` @ `137406701248858221d12be94a941f8837a2a245` — su an CANLI (API 46332 / Web 47004) |
| Kok butunlugu (bu turda kosuldu) | muhurlu manifest `26B31B69…`'e karsi TAM yeniden hash: **88.178/88.178 esit**, farkli 0, okunamayan 0; dusen 4 kapi = 3 git (SYSTEM sahipli kok) + P-040 `.env` (beklenen) |
| Girisler | API `main.js` `28D84796…` · Web `next` `AFEE236A…` · BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ` |
| `.env` (H-01 kaynagi) | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` (icerik okunmadi) |
| bin preimage (= canli) | host `E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706` · api `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` · web `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D` |
| bin postimage (ileri) | host `691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627` · api `CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3` · web `F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0` |
| Geri gelen | #2641 · #2645 · #2643 (B-I11-3) kusurlari; AK-2/AK-1a/AK-1a eki/CLF-O0-01/B-1 RELEASE22'de kalir; veri geri alinmaz |

Ayrinti: `docs/ROLLBACK-PINS.md`. Nesil kopyasi Katman 1'den bayt-aynen: `evidence/GENERATION-COPY-PROVENANCE.json`.

## 7. Uygulama komutlari (owner) — siralama; hicbiri bu turda kosulmadi

Hepsi **"Yonetici olarak calistir" Windows PowerShell 5.1 ConsoleHost**. Kok: `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28`.

**Adim 0 — ratifikasyon ref'i** (`OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-YYYYMMDD-Rnn`; paket uretmez).

**Adim 1 — salt-okuma owner preflight** (DB/HTTP/login 0; `.env` icerigi okunmaz):

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28'; $p="$R\tools\Invoke-OwnerPreflight.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '0E74F687BEAF55432879BE1E10D40DFB55A223CCED6119E6CC804AC1332E420C') { Write-Host 'PREFLIGHT ARACI SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; Write-Host ('cikis=' + $LASTEXITCODE) }
```

Beklenen `cikis=0` `OWNER_PREFLIGHT_READY` -> `preflight\OWNER-PREFLIGHT-<utc>.json` (+ `.sha256`). **READY cutover yetkisi degildir.**

**Adim 2 — canli salt-okuma gercek primitifler:**

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28'; $p="$R\qualification\Test-RealPrimitives.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '5DCD12B31D2457DA5B8219E7A004426D0A7C1DB932DA754196B6A8D5E74179D2') { Write-Host 'SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Live; Write-Host ('cikis=' + $LASTEXITCODE) }
```

Beklenen: 31/31 (21 cevrimdisi + 10 canli: `LIVE-P07-api/web/writer`, `LIVE-P08-gen-api/web`, `-host`, `-api-root`, `-web-root`,
`-smoke`, `LIVE-cap`), `liveExecuted=true`. `LIVE-P07-writer` yukseltilmemis token'da NOT_MEASURED doner — PASS SAYILMAZ, Adim 2 yonetici oturumunda kosulur.
Canli kontroller RELEASE22'yi (OLD nesil) bekler; RELEASE23 canli iken bu adim FAIL verir.

**Adim 3 — onayli kimlik + calistiricilar** (paket yazicisi; bagimsiz dogrulama): 3a ratifikasyon kayit belgesi -> 3b kok
`OWNER-COMMAND.C33-CUTOVER.ps1` (sablon `894BB522…`, yalniz ref doldurulur) -> 3c OC testi -> 3d verifier (muhursuz) -> 3e
`docs/APPROVED-IDENTITY-<digest8>.json` (OR-03a `unsealedDigest`) **owner onayi** -> 3f kok `OWNER-RUN.C33-RELEASE23.ps1` (sablon
`A24C04FD…`, yalniz yer tutucular). Doldurulmamis yer tutucuda calistiricilar DURUR (exit 90/91).

**Adim 4 — tek owner komutu** (hash -> SEAL -> VERIFIER -> CUTOVER); kok OWNER-RUN sha'si 3f'de owner'a verilir:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28\OWNER-RUN.C33-RELEASE23.ps1" -Confirm "C33-RELEASE23-CUTOVER-GO"
```

Cikis: **0** `C33_RELEASE23_CUTOVER_APPLIED_AND_VERIFIED` · **1** `HARD_STOP_PREFLIGHT_NOT_APPLIED` (mutasyon 0) · **2**
`ROLLBACK_COMPLETE_OLD_RUNTIME_RESTORED` (nonce tuketildi) · **3** `HARD_STOP_STATE_UNCERTAIN_MANUAL_RECOVERY_REQUIRED` ·
70 makbuz · 90/91 calistirici durdu. Otomatik reseal / tekrar YOK (README §6).

## 8. Geri donus komutlari

**Otomatik:** motor `R-01` (H/C/V kapisi duserse): yeni gorevler durur -> bin 3 dosya preimage'a (yalniz su an postimage ise;
kaynak `generations/R22` sha-dogrulamali, atomik) -> RELEASE23 `.env` (sha esitse) kaldirilir -> ACL preimage -> `HukukPlatform-API`
/ `HukukPlatform-Web` enable+start, eski nesil + API `/` 404 + Web `/` 200 -> DB snapshot esit. Tutarsa exit 2, degilse exit 3.

**Elle kurtarma** (yalniz exit 3; once `cutover-receipts\CUTOVER-<RUNID>.json` `rollback.detail` + `journal\<RUNID>.jsonl` okunur;
yalniz bin + gorev katmani; sha ve ACL korumali). R27 blogundan tek fark: govde `& { $ErrorActionPreference='Stop' … }` icine alindi
(satir-satir yapistirmada bir `throw` sonraki satirlari durdurmaz); komutlar R27 ile ayni, pinler R22 nesli. Blok sozdizimi ayristirildi
(hata 0); **kosulmadi**:

```powershell
& {
$ErrorActionPreference='Stop'
$G='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28\generations\R22'; $B='C:\Ops\hukuk\bin'
$exp=[ordered]@{'hukuk-task-host.exe'='E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706';'start-api.ps1'='77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51';'start-web.ps1'='1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D'}
foreach($f in $exp.Keys){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $G $f)).Hash -cne $exp[$f]){ throw "rollback kaynagi sapmis: $f" } }
$sd=@{}; foreach($f in $exp.Keys){ $sd[$f]=(Get-Acl -LiteralPath (Join-Path $B $f)).Sddl }
Stop-ScheduledTask -TaskName 'HukukPlatform-API'; Stop-ScheduledTask -TaskName 'HukukPlatform-Web'
$t0=Get-Date; while((Get-NetTCPConnection -State Listen -LocalPort 8080,3002 -ErrorAction SilentlyContinue) -or (Get-Process -Name 'hukuk-task-host' -ErrorAction SilentlyContinue)){ if(((Get-Date)-$t0).TotalSeconds -gt 90){ throw 'surecler 90 s icinde durmadi - DUR' }; Start-Sleep -Milliseconds 500 }
foreach($f in $exp.Keys){ $d=Join-Path $B $f; Copy-Item -LiteralPath (Join-Path $G $f) -Destination $d -Force; if((Get-FileHash -Algorithm SHA256 -LiteralPath $d).Hash -cne $exp[$f]){ throw "geri yazim dogrulanamadi: $f" }; $a=Get-Acl -LiteralPath $d; if($a.Sddl -cne $sd[$f]){ $a.SetSecurityDescriptorSddlForm($sd[$f]); Set-Acl -LiteralPath $d -AclObject $a } }
Enable-ScheduledTask -TaskName 'HukukPlatform-API' | Out-Null; Enable-ScheduledTask -TaskName 'HukukPlatform-Web' | Out-Null
Start-ScheduledTask -TaskName 'HukukPlatform-API'; Start-ScheduledTask -TaskName 'HukukPlatform-Web'
}
```

Ardindan §10 blogu **geri yon beklentileriyle** (kok `HY_W4_RELEASE22`, BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ`, bin = preimage, isaretler RELEASE22 sutunu) kosulur.

## 9. Kesinti beklentisi

**~15–60 s** API+Web (emsaller R23 14,673 s · R24 13,716 s · R25 57,647 s · **R27 39,467 s**; baskin bilesen start+probe, nedeni olculmedi).
Ust sinir quiesce 90 s + start 240 s (ayri). Rollback suresi olculmemis. Web BUILD_ID degisir (sekmeler bir kez yenilenebilir).
Cutover penceresinde kabul/sentetik tenant kosumu YAPILMAZ (`V-01` rollback tetikler). Ayrinti `docs/CUTOVER-TIMING.md`.

## 10. Teknik yayin kabulu (cutover makbuzu altinda, salt-okuma)

```powershell
& {
$want='HY_W4_RELEASE23'; $bid='dOiGPj2M0Abls0kCibY4r'; $d="C:\Development\HUKUK_YAZILIMI\$want\project\apps\api\dist\apps\api\src"
foreach($port in 8080,3002){ $c=Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1; $pr=Get-CimInstance Win32_Process -Filter ("ProcessId=" + $c.OwningProcess); $root=if($pr.CommandLine -match '(HY_W4_RELEASE[0-9A-Z]+)'){$Matches[1]}else{'-'}; '{0} pid={1} kok={2} {3}' -f $port,$c.OwningProcess,$root,$(if($root -ceq $want){'OK'}else{'FARKLI'}) }
foreach($f in 'hukuk-task-host.exe','start-api.ps1','start-web.ps1'){ 'bin {0} {1}' -f (Get-FileHash -Algorithm SHA256 -LiteralPath "C:\Ops\hukuk\bin\$f").Hash,$f }
'BUILD_ID=' + (Get-Content -Raw -LiteralPath "C:\Development\HUKUK_YAZILIMI\$want\project\apps\web\.next\BUILD_ID").Trim()
'buildManifest=' + $(try{(Invoke-WebRequest -UseBasicParsing -Uri "http://127.0.0.1:3002/_next/static/$bid/_buildManifest.js").StatusCode}catch{$_.Exception.Response.StatusCode.value__})
'api GET / =' + $(try{(Invoke-WebRequest -UseBasicParsing -Uri 'http://127.0.0.1:8080/').StatusCode}catch{$_.Exception.Response.StatusCode.value__}) + ' (404 beklenir)'
$ef="C:\Development\HUKUK_YAZILIMI\$want\project\apps\api\.env"; if(Test-Path -LiteralPath $ef){ 'env sha=' + (Get-FileHash -Algorithm SHA256 -LiteralPath $ef).Hash; 'env sddl=' + (Get-Acl -LiteralPath $ef).Sddl }else{ 'env YOK' }
foreach($m in @(@('modules\error-log\error-log.sanitize.js','redactSecretPathSegments'),@('modules\case\case.service.js','party-write-tx'),@('modules\client\client.service.js','party-write-tx'),@('modules\debtor\debtor.service.js','party-write-tx'),@('modules\lawyer\lawyer.service.js','party-write-tx'),@('common\party-write-tx.js','createPartyWriteTxContext'),@('modules\client\client.service.js','pureNoOpDetected'),@('modules\office-approval\office-write-role.policy.js','OFFICE_WRITE_DENIED_VIEWER'),@('modules\office-approval\office-approval.service.js','assertGenericDecisionAllowed'),@('modules\lawyer\lawyer.service.js','LAWYER_REACTIVATE'))){ $p=Join-Path $d $m[0]; '{0,-28} {1,-48} satir={2}' -f $m[1], $m[0], $(if(Test-Path -LiteralPath $p){@(Select-String -LiteralPath $p -SimpleMatch -Pattern $m[1]).Count}else{'DOSYA YOK'}) }
}
```

Beklenen: iki port `kok=HY_W4_RELEASE23 OK`; eski PID 46332/47004 yok; bin `691BC146…` / `CC634BBF…` / `F39F7A54…`;
`BUILD_ID=dOiGPj2M0Abls0kCibY4r`; `buildManifest=200`; `api GET / =404`; isaret satirlari sirasiyla **3 · 1 · 1 · 1 · 1 · 2 · 3 · 3 · 5 · 1**
(isaret listesi ve sayim yontemi — ayni dosya yollari, `Select-String -SimpleMatch` satir sayisi — 2026-09-12'de aday kokunde olculdu;
bloğun port/HTTP/bin kisimlari cutover oncesi anlamsizdir, kosulmadi. RELEASE22 kokunde ayni yontem **0 · 0 · 0 · 0 · 0 · DOSYA YOK · 3 · 3 · 5 · 1**
verdi — geri yon beklentisi budur); `env sha=7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` (H-01 bayt-kopya; icerik okunmaz)
ve `env sddl=` satiri **D3 kapanis TABAN CIZGISI** olarak makbuzla birlikte CLIENT'a devredilir (§11). Ek (salt-okuma): migration dizini 130 (iki kokte de 130, olculdu); API -> 5432 ESTABLISHED;
makbuz `dbMutations 0`. Isaret yoksa ya da sayi farkliysa **DUR**: yama canlida degil; dogrulama kabul sayilmaz.

## 11. CLIENT I11 ile bag (D1 -> D2 -> D3; ayni anda iki canli yurutucu YOK)

- **D1 (OFFICE/C33, bu paket):** Adim 0-4 + §10 teknik kabul; cutover makbuzu + canli SHA/BUILD_ID CLIENT'a yazili devredilir.
  CLIENT bu sure boyunca canliya DOKUNMAZ.
- **D2 (CLIENT) — TAMAMLANDI, #2654 @ `98878222`** (`I11-ADAY-BAGLAMA-VE-DOGRULAMA-R04.md`): baglama B-0..B-5 esit (HEAD, BUILD_ID,
  manifest `E53618ED…`, urun farki 7 dosya, `redactSecretPathSegments` MEVCUT, I11'in 12 urun hash'i RELEASE22 ile ayni); baglama kaydi
  `FCD57F04…`. Yeniden baglanan bloklar: **I11 §9 `A16E479155084F3B6F7D12D7A820E2BA0760411A18FB64D749FA0799C647D148`** ·
  **T-PENCERE-AC `508C532372BA04E61677569123098A285F16388BBD5F52128DB09A1A1BFD86AB`** · **T-PENCERE-KAPA
  `5895CFC7B7D400F44A50DCF81A462DED05C259E86FD5B8DFF00D3F0ECD82EB27`** (iki T betiginin main'deki dosya sha'si OFFICE tarafinda da olculdu,
  esit). Aday ikilisinde: **V-B PASS** (503, ErrorLog 1 satir, ham token 0; kanit `7121CB3A…`; RELEASE22 negatif kontrol FAIL) ·
  **V-A PASS 11 / FAIL 0 / OLCULEMEYEN 0** (runId `64245dc2`; T-AC -> I11 -> kapanis -> T-KAPA; kanit `C7E7B8E8…`).
- **D2 sonrasi aday koku bagimsiz yeniden dogrulama (OFFICE, 2026-09-12):** Katman 1 Node dogrulayicisi manifest `E53618ED…`'e karsi
  **38/38 `RELEASE23_MANIFEST_VALID`** — EXACT-SET iki yonde PASS (N-021/N-022), yeniden hashlenen 83.437 / uyusmaz 0 / okunamayan 0,
  HEAD `2740df3d`, worktree temiz. **D2 aday kokune YAZMADI.**
- **D3 (CLIENT, tek yurutucu; cutover + §10 SONRASI):** canli dist'te `redactSecretPathSegments` satir 3 gorulmeden baslamaz ->
  T-PENCERE-AC (`508C5323…`) -> I11 §9 (`A16E4791…`, gonderim ACIK) TEK KEZ -> T-PENCERE-KAPA (`5895CFC7…`). R23'e bagli bloklar cutover
  ONCESI canlida kosulursa K-API/K-BLD'de DURUR (beklenen). OFFICE bu sure boyunca canliya DOKUNMAZ; her devirde hat boslugu ana yurutucuyle teyit edilir.
- **Etkilesim — OLCULMEDI (V-A oturum `.env`'inde kostu, C33 sertlestirilmis kokte degil):** motor H-01 RELEASE23 `.env`'e
  `RUNTIME_CONFIG_FILE` sinifi uygular (korumali DACL: SYSTEM FA · Administrators FA · runtime FR; sahip SYSTEM). T-PENCERE-AC mevcut dosyaya
  `Set-Content` yazar (yonetici FA -> yazabilir); T-PENCERE-KAPA `Copy-Item -Force` ile geri yazar ve ACL'e dokunmaz. Icerik bayt-esit
  donse de DACL/sahibin korunup korunmadigi olculmedi. **Kapanis olcutu (salt-okuma):** T-KAPA sonrasi §10'daki iki `env` satiri tekrar
  kosulur -> sha `7A7228B1…` VE sddl = cutover sonrasi taban cizgisi. Farkta otomatik duzeltme YOK; owner'a bildirilir.
- **Kapanis sonrasi artik (CLIENT kaydi):** T-PENCERE-AC'nin on goruntu yedegi `ENV-PREIMAGE.env` (canli `.env`'in bayt kopyasi) CLIENT
  oturum dizininde kalir; T-PENCERE-KAPA onu kaldirmaz (tekrar-acma kilidi olarak da calisir). Akibeti ayri karar kalemi; bu pakette silme YOK.

- **★ DUZELTME 2026-09-13 — D3 ENGELLI:** CLIENT uc engelleyici kusur bildirdi, OFFICE 33 kaynakta dogruladi: (E-1) §9 K-PAR deseni
  `smtp-sink` pencere yakalayicisini (`smtp-sink-noauth.js`) paralel kabul sanip DURUR; (E-2) T-PENCERE-KAPA R-T2/R-T3 `throw`'u R-T4
  (engel kurali kaldirma + Web baslatma) ONCESINDE — API kalkmazsa engel ve kapali Web kalir; (E-3) T betiklerinde yukseltme kapisi yok
  (`.env` runtime/kullanici icin yalniz FR; `New-NetFirewallRule` yukseltme ister). Ek: T-AC oncesi yakalayici baslatma on kosulu;
  `ENV-PREIMAGE.env` yedegi korumasiz kalitsal ACL. Yukaridaki §9 `A16E4791…` / T-AC `508C5323…` / T-KAPA `5895CFC7…` hash'leri CLIENT
  duzeltmesiyle GECERSIZLESECEK; D3 bu hash'lerle KOSULMAZ. D1 (bu paket) etkilenmez. Ayrinti ve R02 kosullari:
  governance `release23-candidate-r01/RELEASE23-TEK-NIHAI-PAKET-R01.md` §0.
- **main ≠ aday:** #2655 B11 @ `78f49dd3` (`lawyer.service.ts`) adaydan sonra main'de; RELEASE23'te YOK.

## 12. Acik kalemler ve kisitlar (kapatilmis gosterilmez)

| Kalem | Durum |
|---|---|
| PRE-06 / B-072b CutoverWriter | NOT_MEASURED / NOT_EXECUTED — owner preflight yukseltilmis olcer; PASS sayilmadi (preflight provasinda OP-05c yine gorunmez) |
| Escrow / writer / broker ACL (OP-08a, OP-09d, OP-09e) | NOT_MEASURED (sinirli token erisim reddi) — yalniz Adim 1 yukseltilmis olcer |
| `Test-RealPrimitives -Live` | NOT_EXECUTED (Adim 2) |
| Katman 1 PRE-01/07/08 | cutover H fazinin isi (`.env` bayt-kopya, kok read-only, baslatici baglama) |
| OFFICE AK kabul paketi (`ak-live.ps1`) K-BLD pinleri | RELEASE22 derlemesine baglidir (`lawyer.service.js` `427DB2F1…`); RELEASE23'te `29812F1C…` -> paket DURUR (beklenen; AK-2/AK-1a canli kabulu KAPALI, yeniden kosulmaz) |
| `CL_TOKENFIX` disk artigi | AYRI acik temizlik kalemi (CLIENT); kancayi asacak silme yolu denenmedi |
| OFFICE acik is listesi | `product-backlog.md` sonu (#2647) — degismedi |
| Ileri host | Katman 1'den bayt-aynen (`691BC146…`), Katman 2'de yeniden derlenmedi |
| OFFICE #2641 / #2645 davranis kaniti | PR CI + disposable PG (kaynak uzerinde; gercek geri alma + RED kosusu). **Aday ikilisi uzerinde OFFICE islevsel kosum YAPILMADI**; aday baglari: derlenmis dosya sha'lari (`docs/ROLLBACK-PINS.md` §1) + §10 isaretleri. Canlida islevsel OFFICE denetimi ayri owner GO ister |

## 13. Owner'dan istenen

Bu paket incelemeye sunulur. Canli yayin icin owner onayi: ratifikasyon ref'i + §7 Adim 1–4 (+ Adim 3e onayli kimlik onayi).
Onay verilmezse canli sistem RELEASE22'de kalir; aday ve paketler degistirilmeden bekler (authority penceresi baslamadigi icin sure siniri yok).

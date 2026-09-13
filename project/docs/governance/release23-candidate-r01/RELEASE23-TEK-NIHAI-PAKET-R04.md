# RELEASE23 + CLIENT İ11 — TEK NİHAİ KARAR PAKETİ (R04)

```text
BELGE       : RELEASE23-TEK-NIHAI-PAKET-R04   (R03 #2669 @ 413f8266'nın YERİNE GEÇER; R01/R02 zaten tarihsel)
YETKİ       : owner GO 2026-09-13 "DOĞRUDAN OWNER GO — RELEASE23 R03 / R28 KOŞULLU CANLI YÜRÜTME" (OFFICE 33'e doğrudan) ve aynı günün
              D1-4 sonrası owner talimatı ("D1-5 PASS ve kanıt bağı kesinleşince CLIENT'a D2 devrini yapın"); R03 §4/§5 sırası ve
              kapanış/hata yolları. Bu sürüm yalnız gerçekleşeni kaydeder ve İ11 YENİDEN DENEMESİ için karar metnini hazırlar.
TARAFLAR    : OFFICE 33 — C33/D1 yürütücüsü (tamamlandı) · bu belge · D3-5 salt-okuma
              CLIENT    — İ11 (D2/D3 yürütücüsü; §9 R11 #2674 @ ae7e1ae5 dahil tüm D3 betikleri)
              ana yürütücü — bağımsız doğrulayıcı (#2661 · Ek A #2663 · Ek B #2664 · Ek C #2670 · Ek D #2671 · Ek E #2675)
DURUM       : RELEASE23 CANLIDA — D1 TAMAM (CUT-20260913-200554-ec45bc63 · APPLIED_AND_VERIFIED 31/31 · D1-5 PASS) · R28 TÜKETİLDİ ·
              D3 1. deneme 2026-09-13 ~18:41Z: §9 K-REF node ÖNCESİ DURDU (İ11 KOŞMADI) · pencere temiz kapandı · D3-5 PASS ·
              §9 R11 düzeltmesi main'de · İ11 AÇIK · YENİDEN DENEME GO TASLAĞI OWNER KARARINA SUNULUR (§7)
YAPILMADI   : İ11 canlı kabulü (K1–K3) · D3 yeniden denemesi · `i11live` / `CL_I11LIVE` akıbeti (owner/CLIENT; §4 D3-R0)
CANLI       : RELEASE23 — API :8080 PID 24668 · Web :3002 PID 45404 (kök HY_W4_RELEASE23) · bin = R23 postimage · `.env` sha = pin ·
              I11-WINDOW-BLOCK-* 0 · :2526 0 · görevler Running (2026-09-13T19:00:55Z OFFICE D3-5 salt-okuma)
YETKİ SINIRI: bu belge canlı yürütme yetkisi DEĞİLDİR; §7 yalnız owner kararına sunulan taslaktır. Tarih/ref/runId/SDDL yer tutucularını
              doldurmak ONAY DEĞİLDİR. D1, mühür, authority/nonce ve cutover bu belgeyle YENİDEN KOŞULMAZ (R28 tüketildi).
KAYIT       : CLIENT sayaç 10/17 · hizmet kabulü 0/8 tam
```

Önceki sürümler: `RELEASE23-TEK-NIHAI-PAKET-R03.md` (canlı yürütmenin dayandığı metin; sha256
`AF56312F0BD9809C36A192213D8B09C145FAD856B14E2C76DBBD67E5339FCCA2`) — bu belgedeki D3 blokları R03'ten **programatik olarak bayt-aynı**
alınmıştır; tek bağlayıcı değişiklik §9 pini ve ona bağlı satırlardır (§0). R28 paket kaydı `RELEASE23-R28-CUTOVER-PAKETI-R01.md` ve
diskteki R28 paketi **mühürlüdür ve DEĞİŞTİRİLMEZ** (MANIFEST bütünlüğü); R28 §11 notundaki "R03" göstergesi tarihseldir.
Ana yürütücü kayıtları: `RELEASE23-R28-BAGIMSIZ-DOGRULAMA-R01.md` Ek C–E. CLIENT kayıtları: `client-live-acceptance-i11-r01/` R04–R11.

## 0. R03'ten farklar (R04)

| # | Konu | R04'teki karşılığı | Doğrulama |
|---|---|---|---|
| F-1 | **D1 yürütüldü** (owner doğrudan GO) | §3 D1 kapanış kaydı: ref, preflight (iki koşum, bağlanan), `-Live`, 3a–3f, K-KİMLİK, D1-4 makbuz/journal/nonce/MANIFEST, D1-5 · kanıt kopyaları `evidence/` altında · D1 komutları bu sürümde YOKTUR (yalnız D1-5 geri yön doğrulaması için korunur) | OFFICE 33 diskten bağımsız (`verify-cutover-evidence.js` hepsi PASS) + ana yürütücü Ek E (6/6 eşit) |
| F-2 | **D3-P** koşuldu | §2.2 kaydı; komut bloğu kaldırıldı (yeniden koşulmaz) · §7 6a(i) KAPANDI | ana yürütücü Ek C #2670 |
| F-3 | **D3 1. deneme** | §2.3 kaydı · §5.1'e "§9 node öncesi kapıda durdu" satırı eklendi | CLIENT R11 belgesi · OFFICE D3-5 PASS (19:00:55Z) · ana yürütücü Ek E |
| F-4 | **§9 R11** (K-REF `gh pr list` → `gh pr list -R <origin repo>`) | §1.4 §9 pini `27E754A7…` → **`338FA301B0274D84C9F060A55B84A4C1EA78973FE73843C0D6BE796C387D805A`** · D3-2 satırı · kanonik kaynak main ≥ `ae7e1ae5` · `27E754A7…` GEÇERSİZ | OFFICE 33: merge SHA'da §9 bloğu R03 yöntemiyle (LF, sonda LF) yeniden hesaplandı — eski belge `27E754A7…`'yi yeniden üretti (yöntem doğrulandı), yeni `338FA301…`; diğer 10 pinli dosya değişmedi; R11 K-REF satırları git deposu OLMAYAN `C:\Windows\System32` cwd'sinden pwsh 7.6.5 **ve** WinPS 5.1'de çalıştı (`ghRepo=ulashuseyintelli-tech/HUKUK_YAZILIMI`), eski satır aynı cwd'de canlı hatayı birebir üretti |
| F-5 | **Yeniden deneme ön koşulları** | §4 D3-R0 (salt-okuma denetim + owner/CLIENT kararları) · §7 yalnız D3 kapsamlı yeniden deneme GO taslağı | OFFICE 33 salt-okuma: `CL_I11LIVE` worktree VAR (`a24431ba`) · `i11live` VAR (4 dosya; içerik okunmadı) |

## 1. Kesin kimlikler (tam değer)

Bağlayıcı her hash bu bölümde ve §7'de **tam** yazılıdır; kanıt tablolarındaki kısaltmalar yalnız buradaki tam değere atıftır.

### 1.1 Canlı yayın — RELEASE23

| | Değer |
|---|---|
| Sabit kaynak | `2740df3dd58c5e711a790cc21a5f69d6dbffb35d` — kök `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23` (HEAD gitdir üzerinden ölçüldü; kök SYSTEM sahipli, korumalı) |
| Web BUILD_ID | `dOiGPj2M0Abls0kCibY4r` |
| Katman 1 manifest / makbuz / packageDigest | `E53618ED81FF02B43CB03B26656275B860D1C9B399C7D561A75BE0CA17F61AD5` / `6BF43693D45C1245693381BCAC448DCA20522E57A6F461BB1476A1EC66D1E6D3` / `176500F105359543B8E8092F4CB65CBB5C4ED7987F8ABA2381FD7FABA39C1F59` |
| bin (R23 postimage = canlı) | host `691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627` · api `CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3` · web `F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0` |
| RELEASE23 `.env` (içerik okunmadı) = **`T_ENV_PRE_SHA` pini** | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` |
| RELEASE23 `.env` SDDL = **D3-5 `$base`** (D1-5 çıktısı) | `O:SYG:DUD:PAI(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;S-1-5-21-3828948545-3622927028-3332160207-1146)` |
| Aday dışı | #2655 B11 @ `78f49dd3` — RELEASE23'te YOK |

### 1.2 Cutover paketi — R28 (MÜHÜRLÜ · TÜKETİLDİ · yeniden mühürlenemez)

| | sha256 / değer |
|---|---|
| Kök / motor | `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28` · `engine\Invoke-C33Cutover.ps1` `2AE770435B769A21CFF495BF2224A3385EE27A3DD2E5E6E538D6BB3218DFA927` |
| Ratifikasyon ref / kaydı | `OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-20260913-R01` · `docs\OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-20260913-R01.md` `17E7BAFAC861DD6ACC242AD04FF899D0D6874B37B677FFFA8BE1C0009D4397D5` |
| Onaylı kimlik (3e) | `docs\APPROVED-IDENTITY-CF2739C5.json` `EE1F8A38B11927C0017AECE97013143E0630898A50ADBF5D1CCC14B8B353C7A0` · `unsealedDigest` `CF2739C5B86287F66B18CEBDDE7DEC96AA35CF6BCB99C7C2BDA39C0A6FC67B5E` |
| Çalıştırıcılar | kök `OWNER-RUN.C33-RELEASE23.ps1` `B126F9FE2E176750C46D08598A6F0ED98D9B7119376BAB790E299A443D652AD8` · kök `OWNER-COMMAND.C33-CUTOVER.ps1` `324E3C2CEAAB0C9358633B9C1B7D5CCF96676309A0DD80FBAC153FA991D88A45` |
| MANIFEST (SEALED, 61 dosya) | `MANIFEST.json` `40B04E8021B238863D7929AAD91A1B51810178A916D7EF5A90947E9665E0815E` · payloadDigest `A0A6D74D6AE67E5EAC7DA93B35FAC06FF29371DDA3E9CD19398A0C1D8BF90669` |
| authority / pins | `authority\CUTOVER-AUTHORITY.json` `3BB51BFA22458BF96A83C65F6DD8C05C3476A9E167982E7B4DF804FD2C294622` · `pins\PINS.json` `E66EC55EAD7E6C366A166B4BDBBC756050CEA9DB689756B346A65382B023FC1E` |
| nonce / claim / marker | `9adc4405ebb2445c834b1eee144baabe` · `claims\CLAIM-9adc4405ebb2445c834b1eee144baabe.json` `E6B3044333722E6AEFEDD3022A63994148A839007DDB3E6AB853F388805A7101` · `journal\NONCE-9adc4405ebb2445c834b1eee144baabe.marker` `49C46736C8AFD286EE87B0AB91F5A0F23ACB9FA26078BDE79EB1C7241547242B` |
| Makbuz / journal | `cutover-receipts\CUTOVER-CUT-20260913-200554-ec45bc63.json` `925A08038E8FF42157ED3DAF1EFF96B1E2D05B6AB8A061C1167A57E51C9089E6` · `journal\CUT-20260913-200554-ec45bc63.jsonl` `5B9242264AD84334222E6F770359BB2CE05F569ADD2186D59DAA6DC394591447` |

### 1.3 Geri dönüş — RELEASE22 (artık canlı DEĞİL)

| | Değer |
|---|---|
| Kök / kaynak | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22` @ `137406701248858221d12be94a941f8837a2a245` (HEAD gitdir) · BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ` · API `main.js` `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` · manifest `26B31B6976BFB596D399F31EA2688BF79D67FEFF991838E8D3B528E14A911869` |
| RELEASE22 `.env` (dokunulmadı) | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` |
| bin preimage (geri dönüş kaynağı `R28\generations\R22`, 3/3 eşit ölçüldü) | host `E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706` · api `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` · web `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D` |

### 1.4 CLIENT İ11 — D3 kimlikleri (main @ `ae7e1ae57545096f62d601d9d1e2302f8fb7a432` = #2674 R11; OFFICE 33 merge SHA'da ölçtü)

| | sha256 |
|---|---|
| **İ11 §9 kabul bloğu** (R11) | **`338FA301B0274D84C9F060A55B84A4C1EA78973FE73843C0D6BE796C387D805A`** — `CLIENT-LIVE-ACCEPTANCE-I11-R01.md` §9 gömülü bloktan OFFICE 33 yeniden hesapladı (LF, sonda LF); tek fark K-REF açık-PR taraması `gh pr list -R $ghRepo` |
| **T-PENCERE-AÇ** `scripts\t-window-apply.ps1` | `834DF587A312775CFD8AFEEFBDF9C1C8E36AE57E7420DE4F9D3FA1714044C8EC` (değişmedi) |
| **T-PENCERE-KAPA** `scripts\t-window-close.ps1` | `676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF` (değişmedi) |
| `smtp-sink-noauth.js` | `99A5D681686BC3704151227AB45FC01EFC9F5F6E84DE7FE686A1157E9B558800` (değişmedi) |
| **`T_ENV_PRE_SHA` pini** | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` |
| Kural adı deseni (T-AÇ K-T0 · T-KAPA R-T4a · D3-5) | `^I11-WINDOW-BLOCK-(8080\|3002)-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$` — kayıt `…\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11live\FW-RULES.txt` |
| `i11-run.js` · `i11-01-setup.js` · `i11-02-intake.js` | `27821B463D2DDA5E1F180A79A677CEA13B2EAD15840D95F8218012A0E2632F4B` · `1317D727F08C81108D027C41B9B0DF9EF8E6B5C0C99979F76AEF30E3CA427DC4` · `7D8D492BC6CE4A2E2CD3CB77EEACAC01594D1DDD9D17F9F767D0625DDB251789` |
| Kurtarma `i11-03-close-links.js` · `cl-09-close-access.js` | `87C16DB3E7A7521605C1E6F16563415949F871042BCF51617283B4A05D549740` · `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` |
| D3-P prova / mantık harness'ı (koşuldu; yeniden koşulmaz) | `B643DF51D71BC4012453CCF746CD0ECC4550897701E54346D3DBF9718FBF5803` / `998A127B0B59CFB1ACFE1D2D5BD5EDB83AFA749EAC750EC81BEC049DDFD4C731` |
| GEÇERSİZ — **kullanılmaz** | §9 R06–R10 `27E754A721749443F8B3F2F363B7676989FC115BB6B85E6E0982F62644FC6700` · R07 T-AÇ `ED64A751F75B0F0C3B1406759E92C2F20DAF29018CC893A5EB387391C822BBCF` · R07 T-KAPA `3F027B0DA7AA65F5F8C7A016F1EAD605706C2A4BDA2E703D4A6D4A199DA8BB2C` · R08 T-KAPA `88BCEA01A2A956F4E0AB5976E670162014860FF98E4E68177D4951718E3AB9D7` · R09 ara T-AÇ `B13114CAF66D7DC27B0A8C0AF7294E0ED92770CCD474DFCFBDD72D491B55736F` · R09 ara T-KAPA `A81544B8DEEFC9DA4B4271E5FEB3E8AB675469B5A2FB4030426FD7C4AE680EE0` · daha eski (tanıma amaçlı kısa): R05 §9 `9804FEF6…` · R04 §9 `A16E4791…` · R05/R06 T-AÇ `CA99E69E…` T-KAPA `0A80982B…` |

## 2. Gerçekleşen kanıt

### 2.1 D1 — canlı yayın (ayrıntı §3)

`C33_RELEASE23_CUTOVER_APPLIED_AND_VERIFIED` · runId `CUT-20260913-200554-ec45bc63` · 31/31 · rollback YOK · dbMutations 0 · dbPre == dbPost
`130|130|0|0|7660053627876716578|12|53|2` · secret üretimi 0 · `.env` bayt-kopya · journal hash zinciri 13/13 · kesinti (T1_QUIESCED-INTENT → T5_RESUMED)
**49,463 s** · D1-5 teknik kabul PASS (17:16:47Z).

### 2.2 D3-P — izole R-T4 provası (owner, yükseltilmiş; yeniden koşulmaz)

runId `4dec4f41` · PASS 9/9 · artık 0 · canlı eşit · koşum main T-KAPA `676C1542…` üretim fonksiyonunu kullandı (ana yürütücü `functionTextSha`
bağımsız türetti) · kanıt `evidence/RT4S-4dec4f41.json` `548258082703F2330A5EC7D488DFB5CCBF3EEF84C40EE0C10150B3C28CCC675F` + `.log.txt`
`A27D054953278E6542097A705303C10B6E3E36F5536D7D87D87B2CE1404C43CF` (Ek C #2670). **R03 §7 madde 6a(i) KAPANDI.**

### 2.3 D3 — 1. deneme (2026-09-13; CLIENT yönetti, owner koştu) — İ11 KOŞMADI

| Adım | Sonuç | Kanıt / ölçen |
|---|---|---|
| D2 | geçti (canlı RELEASE23; `redactSecretPathSegments` 3; env sha = pin) | CLIENT |
| D3-0 · D3-1 | geçti; T-AÇ K-T0 `FW-RULES.txt` 18:41:49Z · K-T6 kesin adlı iki kural `I11-WINDOW-BLOCK-{8080,3002}-20260913T184149Z-a60a9e0c` · API restart (K-API PID 41560) | CLIENT R11 §1 · OFFICE `i11live` dosya zamanları |
| D3-2 §9 | K-WT (worktree `CL_I11LIVE` @ `a24431ba`) · K-ARC 21/21 · K-API · K-BLD · K-SMTP · K-INTAKE geçti; **K-REF DURDU**: owner penceresi cwd `C:\Windows\System32` → `gh pr list` "not a git repository" → `K-REF: acik PR listesi alinamadi`. K-REF `node i11-run.js`'den ÖNCE → **runId yok, DB yazması yok, gönderim yok** | CLIENT R11 §1 · OFFICE: `i11s\runs` 49 dosyada 18:30Z sonrası yazım 0; yakalayıcı kaydı son yazım 18:26:53Z; i11 node süreci 0 (DB ölçülmedi) |
| D3-4 T-KAPA (`$rid=''`) | `PENCERE KAPANDI - tum adimlar basarili`, çıkış 0 (pozitif hedef kanıtı beklendiği gibi YOK); R-T4a kesin adlı iki kuralı canlıda kaldırdı | CLIENT · OFFICE D3-5 |
| **D3-5** (OFFICE, R03 bloğu birebir, `$base` = §1.1 SDDL) | **PASS** 19:00:55Z: env sha = pin · env sddl = taban · :8080 24668 / :3002 45404 kök RELEASE23 · iki kesin ad `kural yok (dogrulanmis)` · `I11-WINDOW-BLOCK-*` 0 · :2526 0 | OFFICE 33 · ana yürütücü bağımsız aynı (Ek E #2675) |
| §5.4 | K4 PASS · K1/K2/K3 YOK → **İ11 KAPANMADI** (R03 §5.1 "çıkış 0 fakat Pozitif hedef kanıtı YOK") | — |

**Bu denemenin kanıtladığı ek şey:** T-AÇ K-T6 kesin adla kural **oluşturma** yolu ve T-KAPA R-T4a kesin adla **kaldırma** yolu canlıda uçtan uca
gerçekleşti (oluşturma zamanı adda, kaldırma sonucu D3-5'te kesin adla ölçüldü). T-AÇ/T-KAPA çıktı metni CLIENT kaydındadır; OFFICE yalnız
sonuç durumunu ölçtü.

### 2.4 Bu kanıtların KANITLAMADIKLARI

- İ11 canlı gözlemleri (A-5/A-6, review→promote, kapanış) — hiç koşmadı.
- §9 R11'in K-REF sonrası kapıları (K-PAR ve sonrası) ve `node i11-run.js` canlı yolu — 1. denemede ulaşılmadı (R11 yalnız K-REF satırını değiştirdi).
- DB'de 1. denemeden yazma olmadığı — CLIENT beyanı + dosya/süreç izleri; OFFICE DB ölçmedi.
- Ek B güven sınırı (6a(ii)) aynen geçerlidir: `TELLI\ulastelli` süreçleri `i11live`/yakalayıcı kaydına yazabilir; K-T10b/R-T6 bu süreçlere karşı korunmaz.

## 3. D1 kapanış kaydı (TAMAMLANDI — hiçbir D1 adımı yeniden koşulmaz)

| Adım | Sonuç | Kanıt (sha256) |
|---|---|---|
| Owner GO (doğrudan) + D1-0 ref | `OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-20260913-R01` — biçim uygun; git tüm tarihçe/origin main/R28 paketinde 0; fikstür değil (OFFICE + ana yürütücü) | 3a kaydı `17E7BAFA…` |
| R03 §7 m.2(i) yeniden ölçüm | 21/21 eşit, fark 0; hat boşluğu teyit | Ek D #2671 @ `ca2a4571` |
| D1-1 preflight — koşum 1 (dış pwsh 7, çocuk WinPS 5.1) | `OWNER_PREFLIGHT_READY` PASS 33 · FAIL 0 · NM 0 | `preflight\OWNER-PREFLIGHT-20260913-152940.json` `75D33F3B08BF807A7CC56D2F77F6DCE05E6957A890DC703D0DAD3CE68A95B226` (kayıtta; mühürde) |
| **D1-1 preflight — koşum 2 (doğrudan yükseltilmiş WinPS 5.1; OR-02'ye BAĞLANAN)** | `OWNER_PREFLIGHT_READY` PASS 33 · FAIL 0 · NM 0 · exit 0 | `preflight\OWNER-PREFLIGHT-20260913-163708.json` `BA32673AEB128F27B08AB70FD8F27C297A67CD2DFAFBA31661D5769058929F62` |
| Preflight uzlaştırması | iki JSON arasında yalnız `runUtc`/`finishedUtc` farklı; 34 sonucun id/durum/ayrıntısı aynı (OFFICE + ana yürütücü) | — |
| D1-2 `-Live` | `REAL_PRIMITIVES_PASS` 31/31 · liveExecuted true | `qualification\REAL-PRIMITIVES-RESULTS.json` `5DDBC6818AA35E6BADE578ACA6B1694DA7B5A3137FD625C6450DDED3CDD55EE3` |
| 3b OWNER-COMMAND | 5 yer tutucu ref ile doldu; kök = şablon bayt-kopya | `324E3C2C…` |
| 3c OC testi | `OWNER_COMMAND_TEMPLATE_PASS` 16/16; motor çağrılmadı | `qualification\OWNER-COMMAND-TEMPLATE-RESULTS.json` `05F7588647EBC9B14AA1BD6679C4B759D2CC8DBB72740BBBB2C9308EE1A089C4` |
| 3d verifier (mühürsüz) | `PACKAGE_STATIC_VERIFIED_UNSEALED` failed 0 | `qualification\VERIFY-RESULTS.json` `F885C0C4C533419329AADD1C36107D36CFEBA6092654BE164B11F7D5E61FC8DD` |
| 3e + **K-KİMLİK** | `unsealedDigest` `CF2739C5…`: OFFICE 3 yol (node · WinPS 5.1 şablon kodu · diskten bağımsız) + ana yürütücü 2 yol **EŞİT**; küme = `PACKAGE-IDENTITY.json` `4A7B52DC2A824519120DA70BF2BBDBF5BEBA7C5535319CD988465F65E003CA0D` (50); sha farkı yalnız izinli 3 dosya | `EE1F8A38…` · `evidence/K-KIMLIK-CF2739C5.txt` (Ek E) |
| 3f OWNER-RUN | 8 alan doldu; kimlik provası OR-01..OR-04b PASS (salt-okuma, mühür/motor koşmadı); ana yürütücü doğruladı | `B126F9FE…` |
| **D1-4** (owner, tek OWNER-RUN) | `C33_RELEASE23_CUTOVER_APPLIED_AND_VERIFIED` 31/31 · authority 17:05:53→17:35:53Z · claim 17:06:09Z · COMMITTED 17:07:26Z | makbuz `925A0803…` · journal `5B924226…` · MANIFEST `40B04E80…` (bkz. §1.2) |
| **D1-5** teknik kabul (OFFICE, R03 bloğu birebir) | PASS 17:16:47Z — API 40544 / Web 58920 kök RELEASE23 · bin R23 · BUILD_ID · buildManifest 200 · API / 404 · env sha = pin · env sddl (§1.1) · işaretler 3·1·1·1·1·2·3·3·5·1 | `evidence/D1-5-technical-acceptance.txt` (Ek E) |
| D2 devri | OFFICE → CLIENT yazılı devir makbuzu (makbuz yolu+sha, canlı kimlik, D1-5 çıktısı, env sha, env sddl); tek devir kaydı | — |

**Kalıcı kanıt kopyaları (bu PR; kaynaktan bayt-kopya, kaynak silinmedi, sır değeri yok):** `evidence/CUTOVER-CUT-20260913-200554-ec45bc63.json`
`925A08038E8FF42157ED3DAF1EFF96B1E2D05B6AB8A061C1167A57E51C9089E6` · `evidence/CUT-20260913-200554-ec45bc63.jsonl`
`5B9242264AD84334222E6F770359BB2CE05F569ADD2186D59DAA6DC394591447` · `evidence/OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-20260913-R01.md`
`17E7BAFAC861DD6ACC242AD04FF899D0D6874B37B677FFFA8BE1C0009D4397D5` · `evidence/APPROVED-IDENTITY-CF2739C5.json`
`EE1F8A38B11927C0017AECE97013143E0630898A50ADBF5D1CCC14B8B353C7A0`.

**D1-5 bloğu** — yalnız §5.3 elle geri dönüş sonrası **geri yön** doğrulaması ve istenirse salt-okuma yeniden ölçüm için korunur (R03'ten bayt-aynı):

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

İleri yön beklenenleri §1.1; geri yön beklenenleri §5.3.

## 4. İ11 yeniden deneme — tek yürütme sırası (yalnız D2/D3; D1 YOK)

### D3-R0 — Yeniden deneme ön koşulları (owner GO'dan ÖNCE sağlanır; salt-okuma denetlenir)

| # | Ön koşul | Sahip | Durum (2026-09-13 OFFICE salt-okuma) |
|---|---|---|---|
| R0-1 | §9 R11 main'de ve kanonik çalışma ağacı `ae7e1ae5`'i içeren main'de (D3-0 ve §9 K-ARC/sha kapıları doğrular) | CLIENT / hat | main `dd9be0bf` ⊇ `ae7e1ae5` · kanonik HEAD `dd9be0bf` |
| R0-2 | `C:\Development\HY_WT\CL_I11LIVE` worktree'si YOK (1. denemenin K-WT'si oluşturdu; K-WT var olanda durur) | CLIENT (kendi worktree'si) | **VAR** (`a24431ba`, detached) |
| R0-3 | `…\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11live` YOK (D3-0 ve T-AÇ K-T0a varsa durur) | **owner kararı** — dizin canlı `.env` kopyası taşır; silme/taşıma owner'ındır; bu belge komut vermez | **VAR** (`ENV-PREIMAGE.env` · `ENV-SDDL-BASELINE.txt` · `FW-RULES.txt` · `SINK-BASELINE.txt`; içerik okunmadı) |
| R0-4 | İ11 ref'i owner'ın CLIENT'a verdiği değer, tüketilmemiş (K-REF doğrular) | owner → CLIENT | CLIENT kaydı: `OWNER-GO-CLIENT-I11-20260913-R01` (1. denemede K-REF node öncesi durduğu için tüketilmedi — CLIENT beyanı; owner teyidi GO içinde) |
| R0-5 | Tek canlı yürütücü: D3 boyunca OFFICE ve ana yürütücü canlıya YAZMAZ | hat | — |

### D2 kapısı (CLIENT) — D3'ten hemen önce

Bağlama main'de (#2654). D1-5 PASS (17:16:47Z) ve 1. denemede D2 geçti; **yeniden denemede CLIENT D2'yi yeniden ölçer**: canlı dist'te
`redactSecretPathSegments` satır 3, env sha = `T_ENV_PRE_SHA` ve §9 bloğunun K-API/K-BLD kapıları canlı RELEASE23'e karşı geçmeden D3 başlamaz.

### D3-P — İzole R-T4 provası — TAMAMLANDI (yeniden koşulmaz)

Owner yükseltilmiş pwsh 7'de koştu: runId `4dec4f41` · PASS 9/9 · artık 0 · canlı eşit (Ek C #2670; §2.2). Prova betiği
`B643DF51D71BC4012453CCF746CD0ECC4550897701E54346D3DBF9718FBF5803` · R03 §7 6a(i) KAPANDI. Komut bloğu bu sürümde yoktur.

### D3 — Canlı pencere (CLIENT yönetir; YÜKSELTİLMİŞ yürütücü)

**Yürütücü ve pencere:** D3 blokları **yükseltilmiş Administrators PowerShell 7 (`pwsh`)** penceresinde koşar (K-ELEV zorlar); T betikleri
aynı pencereden `pwsh -File` ile çağrılır — CLIENT R07 döngü **B** ile birebir aynı kabuk (döngü A WinPS 5.1 de geçti). **Karışık zincir
kurulmaz** (PowerShell 7 içinden `cmd` üzerinden `powershell.exe`: PS 7 modül yolu 5.1'e geçer, `Get-FileHash`/`Get-Acl` yüklenmez —
CLIENT ölçümü). D1 penceresi OWNER-RUN OR-00 gereği Windows PowerShell 5.1'dir; D3, D1 bittikten sonra ayrı pencerede yürür.
Ajan oturumları yükseltilmemiştir (ölçüldü: preflight provası `elevated=False`; CLIENT E-3): **yükseltilmiş pencereyi owner sağlar ve D3
bloklarını owner yapıştırarak koşar** (pencere komut satırında desen belirteci yok); CLIENT sırayı yönetir, her çıktıyı doğrular ve sonraki
bloğu verir. D3 blokları **aynı pencerede** koşar (D3-0'ın ortam değişkenleri ve §9'un `CL_*` değerleri sonraki adımlara taşınır).
Aynı anda tek canlı yürütücü: D3 boyunca OFFICE canlıya dokunmaz.

**Betik kaynağı ve dondurma kuralı:** kanonik main — `C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts\`
(sha doğrulamalı). Kanonik çalışma ağacı **`ae7e1ae5`'i içeren** main'de olmalıdır (2026-09-13 R11 merge sonrası ölçüldü: HEAD = `dd9be0bf` ⊇ `ae7e1ae5`; D3-0
sha kapısı bunu yeniden doğrular). **D3 süresince kanonik çalışma ağacında git işlemi (pull/merge/checkout) YAPILMAZ**; D3-1 ve D3-4 sha'yı
yeniden doğrular.

**Blokların kaynağı (Ek B B.4):** yükseltilmiş pencereye yapıştırılan her blok **GitHub main'deki birleşmiş R04 metninden** alınır.
Yapıştırmadan önce bloktaki sha/pin değerleri §1 ile **gözle** karşılaştırılır. Yerel kopya ve pano `ulastelli` süreçlerince
değiştirilebilir (UIPI yalnız doğrudan girdi gönderimini engeller). Bloklardaki sha kapıları betik dosyalarını korur, **blok metninin
kendisini korumaz**.

**İşletim uyarısı (ölçüldü):** D3 süresince komut satırında `smtp-sink.js` · `i11-run` · `cl-09` vb. geçen başka süreç (ör. `-Command` ile
açılmış kabuk, ajan kabuk çağrısı) bulunmamalıdır; K-PAR tasarım gereği durur.

**Pencere çalışma klasörü (1. deneme dersi):** 1. denemede §9 K-REF, owner penceresinin `C:\Windows\System32` cwd'sinde `gh pr list`
çalıştıramadığı için durdu. §9 R11 (`338FA301…`) K-REF'i `gh pr list -R <origin repo>` ile cwd'den bağımsız yaptı (OFFICE 33 System32'den iki
kabukta ölçtü). Owner penceresinin cwd'si artık kapıyı etkilemez; blokların kendi yolları mutlaktır.

**D3-0 — Ön durum + yakalayıcı + K-PAR ön-kontrolü** (OFFICE 33):

```powershell
& {
$ErrorActionPreference='Stop'
$SC='C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts'
$SP='C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad'
$want=[ordered]@{'smtp-sink-noauth.js'='99A5D681686BC3704151227AB45FC01EFC9F5F6E84DE7FE686A1157E9B558800';'t-window-apply.ps1'='834DF587A312775CFD8AFEEFBDF9C1C8E36AE57E7420DE4F9D3FA1714044C8EC';'t-window-close.ps1'='676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF'}
foreach($f in $want.Keys){ if((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $SC $f)).Hash -cne $want[$f]){ throw ('SHA UYUSMUYOR: ' + $f + ' - DUR') } }
if(@(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue).Count -ne 0){ throw ':2526 zaten dinleniyor - DUR' }
if(Test-Path -LiteralPath (Join-Path $SP 'i11live')){ throw 'i11live zaten var - T-AC K-T0a duracak (onceki pencere kapanmamis ya da yerlestirilmis dizin) - DUR, owner karari' }
$env:SINK_PORT='2526'; $env:SINK_LOG=(Join-Path $SP 'i11s\runs\smtp-sink.jsonl')
[void](New-Item -ItemType Directory -Force -Path (Split-Path -Parent $env:SINK_LOG))
[void](Start-Process -FilePath 'node' -ArgumentList ('"' + (Join-Path $SC 'smtp-sink-noauth.js') + '"') -WindowStyle Hidden -PassThru)
$t0=Get-Date; while((@(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue).Count -eq 0) -or (-not (Test-Path -LiteralPath $env:SINK_LOG))){ if(((Get-Date)-$t0).TotalSeconds -gt 15){ throw 'yakalayici 15 s icinde dinlemedi ya da kaydi yok - DUR' }; Start-Sleep -Milliseconds 300 }
$rx='ak-live|i11-run|i10-run|i9-run|i11-0|i10-0|i9-0|cl-09|ro-check|drive2?\.js|fault-proxy|start-api-r22s|smtp-sink\.js\b'
$busy=@(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -match $rx) -and ($_.ProcessId -ne $PID) })
if($busy.Count -ne 0){
  foreach($p in $busy){ 'K-PAR-ON: PID ' + $p.ProcessId + ' ' + $p.Name }
  foreach($k in @(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue)){ Stop-Process -Id ([int]$k.OwningProcess) -Force -ErrorAction SilentlyContinue }
  throw 'K-PAR on-kontrolu: §9 DURACAK - yakalayici durduruldu, D3-1 BASLATILMAZ'
}
'D3-0 TAMAM: i11live yok · yakalayici 127.0.0.1:2526 + kayit var · K-PAR on-kontrolu 0'
}
```

Sınama (canlıda koşulmadı; R02'de — R03'te blokta yalnız iki `$want` değeri değişti): bu blok belgeden çıkarılıp YALNIZ betik dizini,
scratchpad kökü ve port (2599) değiştirilerek yerelde uçtan uca koşuldu — **WinPS 5.1 başarı:** `D3-0 TAMAM`, çıkış 0, dinleyici `127.0.0.1`, kayıt dosyası var, `i11live` oluşmadı · **pwsh 7 başarı:** aynı ·
**WinPS 5.1 düşüş** (komut satırında `i11-run` belirteci taşıyan zararsız yardımcı süreç açıkken): K-PAR yakaladı, yakalayıcı durduruldu
(dinleyici 0), çıkış 1 · test süreçleri sonunda 0. `i11live` VAR dalı koşulmadı (tek satırlık salt-okuma kapısı). Blok `i11live`'ı
**oluşturmaz**: yedek dizini T-AÇ K-T0'ın işidir (R07 E-6).

**D3-1 — T-PENCERE-AÇ çağrısı** (çocuk `pwsh` çıkış kodu HEMEN kaydedilir; ≠0 ise dış blok da fırlatır ve D3-2'ye geçilmez):

```powershell
& { $ErrorActionPreference='Stop'; $f='C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts\t-window-apply.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '834DF587A312775CFD8AFEEFBDF9C1C8E36AE57E7420DE4F9D3FA1714044C8EC'){ throw 'T-AC SHA UYUSMUYOR - DUR' }; $pw=(Get-Command pwsh -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source; $env:T_MODE='live'; $env:T_GOREF='<OWNER-GO-CLIENT-I11-YYYYMMDD-Rnn>'; $env:T_ENV_PRE_SHA='7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'; $global:LASTEXITCODE=-999; & $pw -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'T-AC cikis=' + $rc; if($rc -ne 0){ throw ('T-AC cikis=' + $rc + ' - D3-2 BASLATILMAZ: ciktida K-T0 kapanis satiri VARSA D3-4, YOKSA D3-S (§5.1)') } }
```

**D3-1 yönlendirmesi (birebir satır):** çıkış ≠ 0 ise çıktıda
`K-T0: yedek dizini + yedek + SDDL tabani + yakalayici kaydi + firewall kaydi KORUMALI` satırı **VARSA → D3-4**, **YOKSA → D3-S**.
(`K-T0a:` satırı da "K-T0" ile başlar ama değişiklik öncesidir; yalnız K-T0a görünürken D3-4 koşulursa API boşuna yeniden başlar.)
Kapanış satırı basıldıysa `FW-RULES.txt` kurallardan önce yazılmıştır; K-T6 yarıda düşse bile D3-4 kaydı bulur ve oluşturulmamış
kuralı `ObjectNotFound` = zaten yok sayar (CLIENT R09 B1).

**D3-4 — T-PENCERE-KAPA çağrısı** (aynı pin; yedek güveni, pin ve kesin kural kimliği denetimi betiğin içindedir; çocuk çıkış kodu HEMEN
kaydedilir, ≠0 ise dış blok fırlatır ve **D3-5 ile kabul adımlarına geçilmez**). `$rid` §9 çıktısındaki runId'dir (`crypto.randomBytes(4)` →
8 hex küçük harf, `i11-run.js:45`); doldurulmamış yer tutucu blokta DURUR — literal `<runId>` ile koşulan T-KAPA kanıtı bu koşuma bağlayamaz
ve "Pozitif hedef kanıtı: YOK" verir. §9 runId üretmeden durduysa (ya da §9 hiç koşmadıysa) `$rid=''` yazılır:

```powershell
& { $ErrorActionPreference='Stop'; $f='C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts\t-window-close.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF'){ throw 'T-KAPA SHA UYUSMUYOR - DUR (§5.1)' }; $rid='<runId>'; if($rid -and ($rid -cnotmatch '^[0-9a-f]{8}$')){ throw 'T_RUNID gecersiz ya da yer tutucu - DUR: §9 ciktisindaki 8 hex runId yazilir (§9 runId uretmediyse bos deger)' }; $pw=(Get-Command pwsh -CommandType Application -ErrorAction Stop | Select-Object -First 1).Source; $env:T_MODE='live'; $env:T_RUNID=$rid; $env:T_ENV_PRE_SHA='7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'; $global:LASTEXITCODE=-999; & $pw -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'T-KAPA cikis=' + $rc; if($rc -ne 0){ throw ('T-KAPA cikis=' + $rc + ' - PENCERE KAPANISI EKSIK: listelenen adimlar owner a; D3-5 ve kabul adimlarina GECILMEZ; kurtarma = ayni D3-4 blogunun tekrari (§5.1)') } }
```

Çağrı deseni sınandı (canlı dışı): D3-1 ve D3-4 blokları **bu belgeden çıkarılıp** yalnız `$f` yolu ve sha değeri sahte bir çocuk betiğe
çevrilerek pwsh 7 ve WinPS 5.1 dış kabukta koşuldu — sonuçlar D3-5'ten sonraki sınama tablosunda.

**D3-S — Yalnız yakalayıcıyı durdur** (D3-1 çıktısında K-T0 kapanış satırı YOKSA — canlı değişiklik yoktur, API yeniden başlatılmaz):

```powershell
& { foreach($k in @(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue)){ Stop-Process -Id ([int]$k.OwningProcess) -Force }; Start-Sleep -Seconds 2; ':2526 dinleyici=' + @(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue).Count }
```

**D3-5 — Kapanış ölçütü** (salt-okuma; yalnız D3-4 `T-KAPA cikis=0` sonrası; §5.4 K4). `$base` = D1-5 çıktısındaki `env sddl=` satırının
değeri (yer tutucu blokta DURUR; doldurmak onay değildir):

```powershell
& {
$ErrorActionPreference='Stop'
$base='<D1-5 env sddl= satirindaki deger>'
if(($base -cnotmatch '^O:\S+G:\S+D:') -or $base.Contains('<')){ throw 'D3-5: taban SDDL yer tutucu ya da gecersiz - DUR (D1-5 env sddl= satirindaki deger yazilir)' }
$want='HY_W4_RELEASE23'; $pin='7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'
$ef="C:\Development\HUKUK_YAZILIMI\$want\project\apps\api\.env"
$rec='C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11live\FW-RULES.txt'
$rx='^I11-WINDOW-BLOCK-(8080|3002)-[0-9]{8}T[0-9]{6}Z-[0-9a-f]{8}$'
$bad=New-Object 'System.Collections.Generic.List[string]'
$h=(Get-FileHash -Algorithm SHA256 -LiteralPath $ef).Hash; 'env sha=' + $h; if($h -cne $pin){ $bad.Add('env sha pin DEGIL') }
$s=(Get-Acl -LiteralPath $ef).Sddl; 'env sddl=' + $s; if($s -cne $base){ $bad.Add('env sddl D1-5 tabanindan FARKLI') }
foreach($port in 8080,3002){ $cn=@(Get-NetTCPConnection -State Listen -LocalPort $port -ErrorAction SilentlyContinue | Select-Object -First 1); if($cn.Count -eq 0){ $bad.Add(':' + $port + ' dinleyici YOK'); continue }; $pr=Get-CimInstance Win32_Process -Filter ('ProcessId=' + $cn[0].OwningProcess); $root=if($pr.CommandLine -match '(HY_W4_RELEASE[0-9A-Z]+)'){$Matches[1]}else{'-'}; '{0} pid={1} kok={2}' -f $port,$cn[0].OwningProcess,$root; if($root -cne $want){ $bad.Add(':' + $port + ' koku ' + $root) } }
$names=@(); if(Test-Path -LiteralPath $rec){ $names=@(Get-Content -LiteralPath $rec | ForEach-Object { $_.Trim() } | Where-Object { $_ } | ForEach-Object { ($_ -split '\s+',2)[-1] }) } else { $bad.Add('FW-RULES.txt YOK') }
if(($names.Count -ne 2) -or (@($names | Where-Object { $_ -cnotmatch $rx }).Count -ne 0)){ $bad.Add('FW-RULES.txt iki gecerli kesin ad TASIMIYOR (' + $names.Count + ')') }
foreach($n in $names){ try { $null=Get-NetFirewallRule -Name $n -ErrorAction Stop; $bad.Add('kural HALA VAR: ' + $n) } catch { if($_.CategoryInfo.Category -eq [Management.Automation.ErrorCategory]::ObjectNotFound){ 'kural yok (dogrulanmis): ' + $n } else { $bad.Add('kural sorgu hatasi (yokluk SAYILMAZ): ' + $n) } } }
$iwb=@(Get-NetFirewallRule -ErrorAction Stop | Where-Object { ($_.Name -like 'I11-WINDOW-BLOCK-*') -or ($_.DisplayName -like 'I11-WINDOW-BLOCK-*') }).Count; 'I11-WINDOW-BLOCK-* salt-okuma sayimi=' + $iwb; if($iwb -ne 0){ $bad.Add('I11-WINDOW-BLOCK-* sayimi ' + $iwb) }
$sk=@(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue).Count; ':2526 dinleyici=' + $sk; if($sk -ne 0){ $bad.Add(':2526 dinleyici var') }
if($bad.Count -ne 0){ foreach($b in $bad){ '!!! ' + $b }; throw ('D3-5 FAIL (' + $bad.Count + ') - I11 KAPANMAZ; owner a (§5.1)') }
'D3-5 PASS'
}
```

Kural sayımı tüm kuralları **`-ErrorAction Stop`** ile okuyup istemci tarafında süzer: sorgu hatası yokluk sayılmaz, blok düşer. Kesin ad
denetimi yalnız `ObjectNotFound`'u yokluk sayar. Joker yalnız okumadadır; hiçbir şey silinmez (owner koşulu silme içindir).

**D3-1 / D3-4 / D3-5 sınaması (canlıda koşulmadı; 2026-09-13):** Üç blok **bu belgeden satır satır çıkarıldı**. Yalnız sınama değerleri
birebir değiştirildi, her biri tek eşleşme olarak denetlendi:
- D3-1/D3-4: `$f` → sahte çocuk betik; sha → onun sha'sı; D3-4 `$rid` → `deadbeef`.
- D3-5: `$base`/`$pin`/`$ef` → oturum dizininde sahte `.env`; `$rec` → sahte kayıt; `$want` → bugünkü canlı kök `HY_W4_RELEASE22`.

Her durum ayrı süreçte koşuldu; dış kabuk pwsh 7.6.5 ve WinPS 5.1.

| Blok | Durum | pwsh 7.6.5 | WinPS 5.1 |
|---|---|---|---|
| D3-1 / D3-4 | çocuk çıkış 0 | fırlatmadı · `cikis=0` | aynı |
| D3-1 / D3-4 | çocuk `exit 3` | fırlattı · `cikis=3` + D3-2 / D3-5 yasağı iletisi | aynı |
| D3-1 / D3-4 | çocukta `throw` (çıkış 1) | fırlattı · `cikis=1` + yasak iletisi | fırlattı; sınama stderr'i `2>&1` ile yakaladığı için 5.1 çocuğun stderr satırında erken durdu (`cikis=` satırı basılmadı) — fail-closed; D3 pwsh 7'de koşar |
| D3-1 / D3-4 | `pwsh` PATH'te yok | fırlattı (`Get-Command`), çocuk koşmadı | aynı |
| D3-4 | `$rid='<runId>'` yer tutucu | fırlattı · `T_RUNID gecersiz ya da yer tutucu - DUR` | aynı |
| D3-5 | geçerli taban + pin + kayıtta iki geçerli ama var olmayan ad | `kural yok (dogrulanmis)` ×2 · sayım 0 · `:2526` 0 · kökler eşit · **`D3-5 PASS`** | aynı |
| D3-5 | `$base` yer tutucu | fırlattı · `taban SDDL yer tutucu … DUR` | aynı |
| D3-5 | pin yanlış + SDDL farklı + kayıtta tek bozuk ad | **`D3-5 FAIL (3)`** · üç madde listelendi | aynı |
| D3-5 | kayıt dosyası yok | **`D3-5 FAIL (2)`** (`FW-RULES.txt YOK` · iki geçerli ad yok) | aynı |

Sınamada yazma yalnız oturum dizinindeki sahte dosyalardadır; firewall, görev ve servis işlemi yapılmadı (kural sorguları salt-okuma).

| Sıra | Komut | Girdi | Etki / beklenen |
|---|---|---|---|
| D3-0 | yukarıdaki blok | — | `i11live` YOK · yakalayıcı `127.0.0.1:2526` + kayıt dosyası var (komut satırında log yolu YOK) · K-PAR ön-kontrolü **0** → `D3-0 TAMAM` |
| D3-1 | **T-PENCERE-AÇ** `834DF587A312775CFD8AFEEFBDF9C1C8E36AE57E7420DE4F9D3FA1714044C8EC` (`& <pwsh> -File`, çıkış kodu aktarımlı) | `T_MODE=live` · `T_GOREF=<İ11 ref>` · `T_ENV_PRE_SHA=7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` | **T-PIN** · **K-ELEV** · K-T1..K-T3 yakalayıcı yalnız loopback, AUTH ilan yok · K-T4 API tek dinleyici · **K-T5 ayın 1'i 02:00–05:00 reddi** · **K-T0a** env sha = pin · yedek dizini yok · kayıt var · **K-T0** yeni korumalı `i11live` (kopyadan önce) + yedek + SDDL tabanı + yakalayıcı kaydı korumalı + **iki kesin ad `FW-RULES.txt`'e** (`K-T0: firewall kesin adlari kayda yazildi (…)`) + kapanış satırı `K-T0: yedek dizini + … + firewall kaydi KORUMALI` · **K-T6 Web durur + yalnız bu iki kesin adla engel kuralı** (aynı adlı kural varsa DUR; özellik doğrulaması; `K-T6: ONLEME ETKIN … kesin-ad engel kurallari (…); joker YOK`) · K-T7/K-T8 bayt düzeyinde TAM iki satır (`SMTP_HOST=127.0.0.1`, `SMTP_PORT=2526`), satır sonları/BOM/SDDL aynı · API restart (180 s) · `T-AC cikis=0` (≠0 → dış blok fırlatır; yönlendirme yukarıda) |
| D3-2 | **İ11 §9 bloğu (R11)** `338FA301B0274D84C9F060A55B84A4C1EA78973FE73843C0D6BE796C387D805A` — **TEK KEZ** (belgeden kopyalanır; yalnız üç değişken doldurulur; aynı pencereye yapıştırılır) | `$GoRef` = İ11 ref · `$SendGo` = aynı ref · `$SmtpAck = 'EVET'` | K-GO · K-WT (`CL_I11LIVE` yoksa) · K-ARC (9 araç + 12 ürün hash) · K-REF (`gh pr list -R`; ref tüketilmemiş) · K-PAR (noauth ve `smtp-sink.jsonl` dışlanır) · K-INTAKE · tek `node i11-run.js`; yazma yalnız `cl-acc-<runId>` (gönderim açık **28 satır**; başarısız gönderimde 21); kapanış koşum içinde |
| D3-3 | **Kurtarma** (yalnız koşum kesilir/durum belirsizse; `CLIENT-LIVE-ACCEPTANCE-I11-R01.md` §11) | `CL_RUN_ID=<runId>` + §9'un `CL_*` değerleri | `i11-03-close-links.js` `87C16DB3E7A7521605C1E6F16563415949F871042BCF51617283B4A05D549740` → bağlantılar REVOKED · `cl-09-close-access.js` `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` → 3 User pasif + Case CLOSED; tekrarı güvenli |
| D3-4 | **T-PENCERE-KAPA** `676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF` (`& <pwsh> -File`, çıkış kodu aktarımlı) — **K-T0 kapanış satırı sonrası HER SONUÇTA** | `T_MODE=live` · `T_RUNID=<§9 runId, 8 hex>` (yer tutucu blokta durur) · `T_ENV_PRE_SHA=7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` (T-AÇ ile aynı) | **T-PIN** · **K-ELEV** · K-T10b pozitif hedef kanıtı (kanıt dosyaları güvenilir değilse YOK) · **R-T1 yedek yalnız güvenilir ve sha = pin ise geri yazılır** · R-T2 API restart (180 s) · R-T3 env = pin + özgün hedef · **R-T4a — HER DURUMDA:** `FW-RULES.txt` güven denetimi + her ad desen/port/tekrar denetimi; her ad kendi `try`'ında `Get-NetFirewallRule -Name -ErrorAction Stop` (yalnız `ObjectNotFound` → `zaten YOK (dogrulanmis)`; başka hata → BAŞARISIZ, yoklukla karıştırılmaz) · özellik uyuşmazsa `DOKUNULMADI` · `Remove -Name` + yeniden sorgu; `R-T4a: kesin-ad engel kurallari - kaldirilan N, zaten yok M (joker YOK; baska kurala dokunulmadi)`; kayıt yok/güvenilmez/bozuk → BAŞARISIZ, **joker yedeği yok** · **R-T4b Web — HER DURUMDA** · **R-T5 yakalayıcı durdur — HER DURUMDA** · R-T6 sentetik alan dışı ileti → yeniden gönderim YOK · **R-T7 env SDDL = K-T0 tabanı** · hata varsa tüm adımlar denendikten sonra **sonda throw** (adım listesi) → dış blok `T-KAPA cikis=1` ile fırlatır · **kabul için:** `Pozitif hedef kaniti: VAR` **ve** `PENCERE KAPANDI - tum adimlar basarili.` **ve** `T-KAPA cikis=0` |
| D3-S | yalnız yakalayıcı durdur | — | D3-1 çıktısında K-T0 kapanış satırı YOKSA (T-PIN / K-ELEV / K-T1..K-T5 / K-T0a / K-T0 içi düşüş): `:2526 dinleyici=0` |
| D3-5 | **Kapanış ölçütü** — yukarıdaki blok (salt-okuma; OFFICE) | `$base` = D1-5 `env sddl=` değeri | `env sha=7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` · `env sddl` = D1-5 taban çizgisi (R-T7'den bağımsız) · :8080/:3002 kökü `HY_W4_RELEASE23` · `FW-RULES.txt`'teki iki kesin ad `kural yok (dogrulanmis)` · `I11-WINDOW-BLOCK-* salt-okuma sayimi=0` · `:2526 dinleyici=0` → **`D3-5 PASS`** (herhangi biri düşerse `D3-5 FAIL (n)` fırlatır) |

## 5. Kapanış ve geri dönüş — TÜM sonuçlarda

### 5.1 Karar tablosu

| Nokta / sonuç | Canlı durum | Yapılacak |
|---|---|---|
| D1 (preflight · `-Live` · 3a–3f · OWNER-RUN · D1-5) | **TAMAMLANDI** — RELEASE23 canlı, R28 tüketildi (§3) | D1 satırları **uygulanmaz**; hiçbir D1 adımı yeniden koşulmaz; yayın geri dönüşü yalnız §5.3 (D3 açıksa önce D3-4) ve owner kararıyla |
| D2 kapısı düşer | RELEASE23 canlı ve teknik kabul geçmiş | D3 başlamaz (yazma 0); yayın kalır; İ11 açık |
| D3-0 düşer (sha · `:2526` dolu · `i11live` var · 15 s dinleme/kayıt yok · K-PAR ön-kontrolü ≥1) | canlı değişiklik 0 (K-PAR düşüşünde blok yakalayıcıyı durdurur) | D3-1 başlamaz; neden giderilir, D3-0 yeniden · `i11live` varsa owner kararı (önceki pencere kanıtı; silme owner kararı) |
| D3-1 çıkış ≠ 0 ve **K-T0 kapanış satırı YOK** — T-PIN / K-ELEV / K-T1..K-T5 / **K-T0a** (env sha ≠ pin · yedek dizini var · kayıt yok) | değişiklik 0 (K-T0 bu kapılardan SONRA) | D3-2 koşulmaz; **D3-S** (yalnız yakalayıcıyı durdur; API yeniden BAŞLATILMAZ, D3-4 KOŞULMAZ); env sha ≠ pin ise owner'a |
| D3-1 çıkış ≠ 0, K-T0 **içinde** düştü (kapanış satırı YOK; yedek dizini oluşmuş olabilir) | canlı servis/env/kural değişikliği 0 (yazma yalnız yedek dizini + yakalayıcı kaydı ACL'i) | **D3-S**; D3-4 KOŞULMAZ; `i11live` kalırsa yeni T-AÇ K-T0a'da durur → yeni pencere owner kararı (dizin sır taşır; silme owner kararı) |
| D3-1 çıkış ≠ 0 ve **K-T0 kapanış satırı VAR** (K-T6 · env yazımı · K-T8 · restart) | yedek + SDDL tabanı + `FW-RULES.txt` var; engel/Web/env kısmen değişmiş olabilir | D3-2 koşulmaz; **D3-4 HER DURUMDA** (oluşturulmamış kural `zaten YOK`) |
| D3-1 dış blok `T-AC SHA UYUSMUYOR` ya da `pwsh` bulunamadı | değişiklik 0 (T-AÇ koşmadı) | **D3-S**; neden giderilir (dondurma kuralı / kanonik ağaç ⊇ `ae7e1ae5`); yeni deneme D3-0'dan |
| D3-2 başarısız / yarıda | sentetik tenant yazmaları | koşum içi kapanış doğrulanamadıysa D3-3 yalnız runId ile → D3-4 |
| D3-2 §9 `node i11-run.js` **öncesi** bir kapıda durur (K-GO · K-WT · K-ARC · K-API · K-BLD · K-SMTP · K-INTAKE · K-REF · K-PAR) | İ11 koşmadı (runId · DB yazması · gönderim 0); pencere açık | **D3-4 HER DURUMDA** (`$rid=''`) → D3-5; İ11 KAPANMAZ; neden giderilir (betik düzeltmesi = yeni hash + yeni belge sürümü); `CL_I11LIVE` ve `i11live` kalır → yeni pencere ayrı owner kararı (§4 D3-R0). **1. deneme böyle kapandı** (§2.3) |
| D3-4 pin'siz çağrıldı (T-PIN) | değişiklik yok | aynı bloğu pinle tekrar |
| D3-4 T-KAPA sha uyuşmaz (kanonik ağaç değişmiş) | pencere açık | T-KAPA KOŞULMAZ; betik `ae7e1ae5`'teki blob'dan sha doğrulamalı bayt-kopya ile koşulur — owner kararı; dondurma kuralı ihlali kayda yazılır |
| D3-4 R-T4a BAŞARISIZ — kayıt yok/güvenilmez/bozuk · ad deseni/port uyuşmaz · sorgu/erişim hatası · özellikleri farklı `DOKUNULMADI` · kaldırma sonrası hâlâ var | R-T4b/R-T5/R-T6/R-T7 yine denendi; engel kuralı kalmış olabilir; **başka kurala dokunulmadı** | dış blok fırlatır; D3-5 ve kabul YOK; owner'a DERHAL. Kurtarma = aynı D3-4 tekrarı (zaten kaldırılmış ad `zaten YOK` geçer). Kalıcı hatada kuralın **yalnız kesin adıyla** (D3-1 K-T0 çıktısındaki iki ad) elle kaldırılması **ayrı owner kararıdır**; joker silme yok. D3-5 salt-okuma sayımı kalan kuralı gösterir |
| D3-4 R-T1 "yedek dizini/dosyası güvenilir DEĞİL" ya da "pinli değere EŞİT DEĞİL" | env pencere değerinde kalır (SMTP loopback; yakalayıcı R-T5'te durur → dış gönderim yok); R-T4/R-T5 yine koşar, erişim geri açılır | sonda throw; owner'a DERHAL; **elle müdahale:** yedek başka kaynaktan doğrulanmadan canlı `.env`'e YAZILMAZ; doğrulanmış kaynak sha doğrulamalı `HY_W4_RELEASE22\project\apps\api\.env` (`7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC`) — owner kararı |
| D3-4 sonda throw (diğer adımlar) → `T-KAPA cikis≠0`, dış blok fırlattı | R-T4a/R-T4b/R-T5 yine denendi; listelenen adım(lar) başarısız | owner'a DERHAL; **D3-5 ve kabul adımlarına geçilmez**; otomatik tekrar YOK; kurtarma = aynı D3-4 bloğunun tekrarı (idempotent, ölçüldü) |
| D3-4 çıkış 0 fakat `Pozitif hedef kaniti: YOK` | pencere kapandı, env = pin | geri dönüş TAMAM; D3-5 koşulur; **İ11 §5.4 K3 sağlanmadı → İ11 KAPANMAZ, GO-COMPLETE DEĞİL**; owner'a (yeni İ11 penceresi ayrı karar; `cl-acc-<runId>` yeniden açılmaz) |
| D3-5 `FAIL (n)` | listelenen koşul(lar) sağlanmadı | İ11 KAPANMAZ; owner'a; `I11-WINDOW-BLOCK-*` sayımı ≠ 0 ya da kesin ad hâlâ var → aynı D3-4 tekrarı, düzelmezse yalnız kesin adla elle kaldırma ayrı owner kararı · env sha ≠ pin → R-T1 satırı · kök ≠ RELEASE23 → yayın durumu owner'a · `:2526` dolu → D3-S |
| R-T7 veya D3-5 `env sddl` tabandan farklı | içerik bayt-eşit | owner'a bildirilir; otomatik ACL düzeltmesi YOK |
| **D3 açıkken yayın geri dönüşü gerekirse** | — | **ÖNCE D3-4** (engel + Web her durumda geri açılır; env ön görüntüye), **SONRA** §5.3 |

Veri: migration yok. Koşum yazmaları **geri alınmaz**, kapatılır ve kanıt olarak kalır; `cl-acc-<runId>` yeniden açılmaz.
Geri dönüş RELEASE23'ün üç düzeltmesini geri alır (#2641 · #2645 · #2643 B-I11-3 kusurları canlıya döner); AK-2/AK-1a/CLF-O0-01/B-1 RELEASE22'dedir.

### 5.2 `.env` yazımları, yedek ve güven sınırı

**Yazım yöntemleri (R07/R09; kaynaktan okundu):**
- Motor H-01 RELEASE23 `.env`'i RELEASE22 baytlarıyla kurar ve `RUNTIME_CONFIG_FILE` sınıfını uygular (korumalı DACL: SYSTEM FA ·
  Administrators FA · runtime FR; sahip SYSTEM). Canlı RELEASE22 `.env` bugün aynı sınıfta (preflight provası OP-09h PASS; CLIENT SDDL
  ölçümü `O:SYG:DUD:PAI(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;S-1-5-21-3828948545-3622927028-3332160207-1146)`).
- **T-PENCERE-AÇ** `.env`'i **bayt düzeyinde** değiştirir: `[IO.File]::ReadAllBytes` → katı UTF-8 çözümü (geçersiz baytta DUR) → yalnız
  `SMTP_HOST`/`SMTP_PORT` satırları, satır sonları ve BOM durumu korunarak → **`[IO.File]::WriteAllBytes`**. K-T8 yazılan bayt = hesaplanan bayt,
  farklı satır tam 2 ve env SDDL'in yazımdan sonra aynı olduğunu denetler. `Get-Content`/`Set-Content` `.env` için **kullanılmaz**
  (R02'deki "`Set-Content` yazar" ifadesi R07 öncesine aitti ve bu sürümde düzeltildi).
- **T-PENCERE-KAPA** R-T1, yedeği yalnız güvenilir (sahip + korumalı DACL + yabancı kural 0 + reparse değil) ve sha = pin ise
  `Copy-Item -Force` ile geri yazar ve sonucu pinle doğrular; R-T7 env SDDL'ini K-T0 tabanıyla, OFFICE D3-5 D1-5 taban çizgisiyle bağımsız
  karşılaştırır. Farkta otomatik düzeltme yok. CLIENT karalama deneyi: korumalı DACL'lı hedefte yazımlardan sonra **DACL korundu**;
  canlıda **sahip (SYSTEM) korunumu ölçülmedi** → R-T7 + D3-5 yakalar.

**Yedek dizini ve kanıt dosyaları — güven sınırı (ana yürütücü Ek B, #2664 @ `1334d2fe`; içerik okunmadı):**

| Soru | Cevap |
|---|---|
| Kim okuyabilir? | SYSTEM · yükseltilmiş Administrators · `TELLI\ulastelli` ile çalışan her süreç — **canlı `.env`'i zaten okuyabilen kümeyle AYNI** (API bu hesapla çalışır). Codex sandbox hesapları, 5 çözümlenmemiş SID, diğer yerel kullanıcılar, Everyone/Users: erişim YOK |
| Kim yazabilir/silebilir? | canlı `.env`'e yalnız SYSTEM ve yükseltilmiş admin; **yedeğe (`ENV-PREIMAGE.env`), SDDL tabanına, taban dosyasına, `FW-RULES.txt`'e ve yakalayıcı kaydına `ulastelli` ile çalışan yükseltilmemiş her süreç de** (kapsam genişler) |
| "Güvenilir süreçler" | token'ında SYSTEM, **etkin** Administrators veya `TELLI\ulastelli` kullanıcı SID'i bulunan her süreç: canlı API/Web zinciri, ajan oturumları ve alt süreçleri, yükseltilmiş owner penceresi |
| Sır gizliliği | kapsam **genişlemez**; oluşturma penceresi kapalı (dizin kopyadan önce korumalı). Kalan: yedek ikinci kalıcı sır kopyasıdır; silme owner kararı |
| İçerik bütünlüğü | canlı yapılandırma **korunur**: değiştirilmiş/silinmiş yedek pin + güven denetimi nedeniyle **geri yazılmaz** (sonuç erişilebilirlik kaybı; §5.1 R-T1 satırı). Kural kaydı: desen/port/tekrar denetimi uymayan adı reddeder; iyi biçimli ama farklı bir adla değiştirilirse R-T4a "zaten yok" diyerek geçebilir → **D3-5 `I11-WINDOW-BLOCK-*` sayımı kalan kuralı yakalar**. SDDL tabanı değişirse D3-5 (D1-5 tabanı) yakalar. **Yakalayıcı kaydı/taban dosyası değiştirilirse K-T10b "Pozitif hedef kanıtı" ve R-T6 alıcı denetimi YANILTILABİLİR** (§7 madde 6(ii)) |
| Blokların kaynağı | yükseltilmiş pencereye yapıştırılan bloklar **GitHub main'deki birleşmiş R04 metninden** alınır; sha/pin değerleri §1 ile **gözle** karşılaştırılır (§4 D3) |
| İsteğe bağlı sertleştirme (Ek B B.5) | karar şart değil; betik değişikliği yeni hash ve yeni belge sürümü demektir (§8) |

### 5.3 Elle geri dönüş (yalnız bin + görev katmanı; sha ve ACL korumalı; tek parça `& { }`)

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

Ardından D1-5 bloğu geri yön beklentileriyle koşulur: kök `HY_W4_RELEASE22`, BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ`, bin = preimage,
işaret satırları **0 · 0 · 0 · 0 · 0 · DOSYA YOK · 3 · 3 · 5 · 1** (aynı işaret listesi ve sayım yöntemi RELEASE22 kökünde bugün ölçüldü); blokta `$want`/`$bid` geri değerlerle koşulur.

**§5.3 kapsamı — geri ALDIKLARI:** `C:\Ops\hukuk\bin` altındaki 3 dosya — `hukuk-task-host.exe`
`E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706` · `start-api.ps1` `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` ·
`start-web.ps1` `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D` — sha doğrulamalı kaynaktan
(`HY_C33_RELEASE23_CUTOVER_R28\generations\R22`) bayt-kopya; her dosyanın DACL'i kopyadan ÖNCE okunan SDDL'e geri döndürülür;
`HukukPlatform-API` ve `HukukPlatform-Web` görevleri durdurulur (90 s içinde :8080/:3002 dinleyicisi ve `hukuk-task-host` süreci yoksa DUR),
sonra Enable + Start. Başlatıcılar RELEASE22 köküne işaret ettiği için servisler RELEASE22 ile kalkar.

**§5.3 kapsamı — geri ALMADIKLARI:** RELEASE23 `.env` (kalır; RELEASE22 kendi `.env`'ini kullanır) · RELEASE23 kök ACL'i (`IMMUTABLE_RELEASE`
kalır) · veritabanı (migration yok; koşum ve kullanıcı yazmaları kalır) · paket durum dosyaları (claim, nonce işaretçisi, journal, makbuz) ·
D3 güvenlik duvarı kuralları, Web durumu, `.env` pencere değerleri ve yakalayıcı (**D3 açıksa ÖNCE D3-4**). Bu belge kapsamında **yalnız** D3 açıkken yayın geri dönüşü
gerektiğinde (D3-4'ten SONRA) koşulur; ardından §3'teki D1-5 bloğu geri yön beklentileriyle koşulur. Başka her kullanım (D3 kapalıyken
RELEASE22'ye dönüş dahil) ayrı owner kararıdır.

### 5.4 İ11 kapanış ölçütü ve kabul kaydı

İ11 canlıda **yalnız dört koşulun HEPSİ** sağlanırsa kapanır:

| # | Koşul | Kanıt (çıktı) |
|---|---|---|
| K1 | **Tam İ11 ölçütleri PASS** | §9 `i11-run cikis kodu: 0` · `CL-I11-RUN` kaydı `result: PASS`, `scope: TAM (A-5 · A-6 · review→promote)`, `measurements` PASS **11** · FAIL **0** · ÖLÇÜLEMEYEN **0** · KAPSAM DIŞI **0** |
| K2 | **Bağlantı ve kullanıcı kapanışı doğrulanmış** | `CL-I11-RUN` alanları (`i11-run.js` 241–264): `intakeLinks.anonUsableAfter: 0` (= `linksClosed`; `i11-03-close-links.js` 65) ve `intakeLinks.evidencePreserved: true` · `anonIntakeProbe.before: 200`, `anonIntakeProbe.after: 404` · `closureOk: true` · `verification.loginAfter: 401` · `verification.repeatAlreadyClosed: true` (ikinci `cl-09` çağrısı `alreadyClosed: true` + `usersDeactivated: 0` + exit 0; `i11-run.js` 185–186) · `isolation.equal: true`. Koşum kesildiyse D3-3 kurtarma komutları (`i11-03-close-links.js` `87C16DB3E7A7521605C1E6F16563415949F871042BCF51617283B4A05D549740`, `cl-09-close-access.js` `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4`) aynı doğrulamayı vermelidir |
| K3 | **T-PENCERE-KAPA pozitif hedef kanıtı ve çıkış 0** | D3-4 çıktısı `Pozitif hedef kaniti: VAR` + `PENCERE KAPANDI - tum adimlar basarili.` + `T-KAPA cikis=0` (dış blok fırlatmadı). **Sınır (Ek B):** yakalayıcı kaydı ve taban dosyası yabancı SID'lere karşı korunur, `TELLI\ulastelli` ile çalışan yükseltilmemiş süreçlere karşı korunmaz — §7 madde 6(ii) |
| K4 | **D3-5 PASS** | D3-5 bloğu `D3-5 PASS` (env sha = pin · env sddl = D1-5 tabanı · :8080/:3002 kökü RELEASE23 · kayıttaki iki kesin ad yok · `I11-WINDOW-BLOCK-*` sayımı 0 · `:2526` 0) |

Biri eksikse İ11 **KAPANMAZ**; geri dönüş/kapanış §5.1'e göre tamamlanır, yeni pencere ayrı owner kararıdır (`cl-acc-<runId>` yeniden açılmaz).

**Kabul kaydı:** CLIENT, D3 çıktılarını (D3-0, D3-1 T-PENCERE-AÇ, D3-2 §9/`CL-I11-RUN`, varsa D3-3, D3-4 T-PENCERE-KAPA, D3-5) ve **yerel kanıt
manifestini** (dosya yolu + sha256 listesi; D3-P kanıtı `evidence/RT4S-4dec4f41.*` #2670) **kendi kapanış kaydına** bağlar. Kayıt PR'ı CI → `--match-head-commit`
ile merge → main senkronu → temizlik (worktree/dal; kanıt dosyaları ve `i11live` silinmez) tamamlandıktan **SONRA** CLIENT sayacı
**10/17 → 11/17** olur. Hizmet kabulü **0/8 tam** kalır.

## 6. Kesinti ve süre

| Pencere | Beklenti | Üst sınır / kural |
|---|---|---|
| D1 cutover (API+Web) — **GERÇEKLEŞTİ** | **49,463 s** (T1_QUIESCED-INTENT 17:06:24.579Z → T5_RESUMED 17:07:14.042Z; `CUT-20260913-200554-ec45bc63`) | rollback olmadı; Web BUILD_ID değişti |
| Authority | **TÜKETİLDİ** (17:05:53Z → 17:35:53Z; claim 17:06:09Z) | yeniden mühür/authority YOK |
| D3 bakım penceresi | Web kapalı + :8080/:3002 dışarıya kapalı; API iki restart (aday provası R04 7 s / 6 s · R05 6 s / 6 s) | her restart 180 s; aşımda otomatik tekrar YOK; geçmiş süre garanti değildir (2026-09-11 logon beklemesi 35,5 dk) |

D3 1. deneme (2026-09-13): T-AÇ restart (K-API PID 41560) ve T-KAPA restart (API 24668 / Web 45404) bütçe içinde tamamlandı. Cutover penceresi
kısıtı (V-01 DB snapshot) D1 tamamlandığı için artık uygulanmaz.

## 7. TEK KOŞULLU OWNER GO TASLAĞI — İ11 YENİDEN DENEME (owner kararına)

> **GO — CLIENT İ11 TAM CANLI KABUL · YENİDEN DENEME (D2/D3; RELEASE23 CANLIDA)**
>
> Referans: İ11 `OWNER-GO-CLIENT-I11-<YYYYMMDD>-R<nn>` — owner'ın CLIENT oturumuna birebir verdiği değer (CLIENT kaydı
> `OWNER-GO-CLIENT-I11-20260913-R01`, tüketilmedi; K-REF doğrular) · gönderim kapsamı `$SendGo` = aynı ref · `$SmtpAck = 'EVET'` · Yöntem T #2644.
> **Onay sınırı:** onay yalnız owner'ın bu metni açıkça "GO" diyerek vermesidir. Tarih/ref/runId/SDDL yer tutucularını doldurmak ONAY
> DEĞİLDİR. Bu GO **D1, mühür, authority/nonce, OWNER-RUN veya cutover YETKİSİ DEĞİLDİR**; R28 tüketilmiştir ve yeniden mühürlenmez.
>
> 1. **Sabit kimlikler (tam değer; herhangi bir uyuşmazlıkta DUR):** canlı RELEASE23 kaynak `2740df3dd58c5e711a790cc21a5f69d6dbffb35d` ·
>    kök `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23` · BUILD_ID `dOiGPj2M0Abls0kCibY4r` · bin R23
>    `691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627` / `CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3` /
>    `F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0` · `T_ENV_PRE_SHA` `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` ·
>    D3-5 SDDL tabanı `O:SYG:DUD:PAI(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;S-1-5-21-3828948545-3622927028-3332160207-1146)` ·
>    İ11 §9 `338FA301B0274D84C9F060A55B84A4C1EA78973FE73843C0D6BE796C387D805A` · T-AÇ `834DF587A312775CFD8AFEEFBDF9C1C8E36AE57E7420DE4F9D3FA1714044C8EC` ·
>    T-KAPA `676C1542089C251F31318B4FC8D3884596831AB9EC8662BE0FFA822F90382DEF` · yakalayıcı `99A5D681686BC3704151227AB45FC01EFC9F5F6E84DE7FE686A1157E9B558800` ·
>    kanonik betik kaynağı main ⊇ `ae7e1ae57545096f62d601d9d1e2302f8fb7a432` (#2674 R11). Kalan kimlikler §1'dedir; §1.4 GEÇERSİZ listesindekiler
>    kullanılmaz. **B11 (#2655 @ `78f49dd3`) canlı adayda YOKTUR** ve bu GO ile yayına alınmaz.
> 2. **Ön koşullar (§4 D3-R0; hepsi sağlanmadan D3-0 başlamaz):** R0-1 kanonik ağaç ⊇ `ae7e1ae5` · R0-2 `CL_I11LIVE` worktree'si yok (CLIENT) ·
>    **R0-3 `i11live` yok — akıbeti owner kararıdır** (sır taşır; bu GO silme/taşıma yetkisi vermez, owner ayrıca karar verir veya bizzat yapar) ·
>    R0-4 İ11 ref owner'dan birebir, tüketilmemiş · R0-5 tek canlı yürütücü.
> 3. **Bağımsız doğrulama (ana yürütücü):** D3-0'dan hemen önce §1.4 pinlerinin main + kanonik ağaçta ve §1.1 canlı kimliğin (kök, bin, env
>    sha/sddl) salt-okuma yeniden ölçümü; D3-5 bağımsız salt-okuma. Sonuçlar kayda yazılmadan sıradaki adıma geçilmez.
> 4. **D2 kapısı (CLIENT, yeniden ölçülür):** canlı dist `redactSecretPathSegments` satır 3 · env sha = `T_ENV_PRE_SHA` · §9 K-API/K-BLD canlı
>    RELEASE23'e karşı; aksi hâlde D3 başlamaz.
> 5. **D3 (CLIENT yönetir; yükseltilmiş `pwsh` 7 penceresini owner sağlar ve blokları owner yapıştırarak koşar; tek yürütücü; karışık kabuk
>    zinciri yok; D3 süresince kanonik ağaçta git işlemi yok; bloklar GitHub main'deki R04 metninden alınır ve sha/pin §1 ile gözle
>    karşılaştırılır):** D3-0 → D3-1 T-AÇ (pin; çıkış kodu aktarımlı) → D3-2 İ11 §9 `338FA301…` (gönderim AÇIK) **TEK KEZ** → gerekirse D3-3 kurtarma
>    (runId) → D3-4 T-KAPA (aynı pin; `T_RUNID` = §9 runId, runId yoksa `''`) — D3-1 çıktısında **K-T0 kapanış satırı varsa her sonuçta**, yoksa
>    yalnız D3-S → D3-4 `T-KAPA cikis=0` ise D3-5 (OFFICE, salt-okuma). Çocuk çıkış kodu ≠ 0 olduğunda dış blok fırlatır, kabul adımlarına geçilmez.
>    Bakım penceresidir (Web durur; bu pencerenin iki kesin adlı engel kuralı :8080/:3002 dış erişimini kapatır; API iki restart, her biri 180 s
>    bütçe); aşımda otomatik tekrar YOK.
> 6. **Owner kabulleri:** (i) R03 6a(i) **KAPANDI** — D3-P runId `4dec4f41` PASS 9/9 (#2670) ve 1. denemede kesin adlı kural oluşturma/kaldırma
>    canlıda gerçekleşti (§2.3). (ii) **Ek B güven sınırı** bu yeniden deneme için de kabul edilir: `TELLI\ulastelli` ile çalışan yükseltilmemiş
>    süreçler yedeğe, SDDL tabanına, taban dosyasına, `FW-RULES.txt`'e ve yakalayıcı kaydına yazabilir; canlı `.env` pin + güven denetimiyle
>    korunur; SDDL tabanı sahteciliğini ve kalan engel kuralını D3-5 yakalar; **K-T10b "Pozitif hedef kanıtı" ve R-T6 alıcı denetimi bu
>    süreçlere karşı KORUNMAZ** — D3 boyunca bu dosyalara yazılmadığı varsayılır. Owner (ii)'yi kabul etmezse D3 başlamaz.
> 7. **Kapanış/geri dönüş (§5.1 bu GO'nun parçasıdır):** D3 açıkken yayın geri dönüşü gerekirse **ÖNCE D3-4, SONRA §5.3** (bin 3 dosya + iki
>    görev; `.env`, kök ACL, DB, paket durum dosyaları geri alınmaz) ve D1-5 bloğu geri yön beklentileriyle. T-KAPA R-T1 "güvenilir değil /
>    pine eşit değil" sonrası elle `.env` müdahalesi, T-KAPA sha uyuşmazlığında bayt-kopya ile koşum, R-T4a kalıcı hatasında kuralın kesin
>    adıyla elle kaldırılması, R-T7/D3-5 SDDL farkının düzeltilmesi ve yeni bir İ11 penceresi **ayrı owner kararıdır**. Otomatik tekrar YOK;
>    tüketilen İ11 ref'i ve `cl-acc-<runId>` yeniden kullanılmaz/açılmaz.
> 8. **Kapsam dışı:** D1 adımları (preflight, `-Live`, 3a–3f, OWNER-RUN) · mühür/authority/nonce/reseal · cutover · migration · bayrak · ikinci
>    API süreci · gerçek kişiye gönderim · başka tenant'a yazma · joker kural silme · `i11live` yedeğinin, `CL_TOKENFIX` ve `{}` artıklarının
>    silinmesi · RELEASE22 kökünde değişiklik · #2655 B11'in yayına alınması · İ12.
>
> **Yürütücü sorumlulukları:** owner — İ11 ref'inin CLIENT'a birebir verilmesi, `i11live` kararı, yükseltilmiş D3 penceresi ve blokların
> yapıştırılması, ayrı karar gerektiren her adım · CLIENT — R0-2, D2 kapısı, D3 sırası ve her çıktının doğrulanması, §5.4 kabul kaydı ·
> OFFICE 33 — D3-0 bloğu (bu belge), D3-5 salt-okuma değerlendirmesi, bu belge · ana yürütücü — madde 3 bağımsız doğrulama, hat boşluğu teyidi.
>
> **IF GO-COMPLETE:** İ11 §5.4 **K1–K4 hepsi** sağlandı (tam İ11 PASS 11/0/0/0 TAM · bağlantı/kullanıcı kapanışı doğrulandı · D3-4
> `Pozitif hedef kaniti: VAR` + `tum adimlar basarili` + `T-KAPA cikis=0` · `D3-5 PASS`) · CLIENT D3 çıktıları + yerel kanıt manifestini kapanış
> kaydına bağladı; CI/merge/main senkronu/temizlik tamamlandı → sayaç 10/17 → **11/17** · hizmet kabulü **0/8 tam** · RELEASE23 canlı kalır.
> Bir koşul eksikse İ11 kapanmaz, sayaç 10/17 kalır; gerçekleşen canlı durum ve eksik koşul açıkça bildirilir.

## 8. Açık kalemler (kapatılmış gösterilmez)

| Kalem | Durum |
|---|---|
| **İ11 canlı kabulü** | AÇIK — 1. deneme K-REF'te durdu (§2.3); yeniden deneme §7 (ayrı owner GO) |
| `i11live` yedek dizini (canlı `.env` kopyası + `FW-RULES.txt` + SDDL/taban dosyaları; sır taşır) | **owner kararı** — varken D3-0 ve T-AÇ K-T0a durur (§4 R0-3) |
| `C:\Development\HY_WT\CL_I11LIVE` worktree (`a24431ba`) | CLIENT — yeniden denemeden önce kaldırılır (§4 R0-2) |
| **`CL_TOKENFIX` disk artığı** · kanonik kökteki `{}` | AYRI AÇIK KALEMLER — silme owner kararı; bu belge kapsamı dışında |
| Ek B güven sınırı (yürütücü hesabı güvenilir kümede) | §5.2 — §7 madde 6(ii) owner kabulü; isteğe bağlı sertleştirme (Ek B B.5 a/b) karar şart değil, yapılırsa yeni hash + yeni belge sürümü |
| R-T4a kalıcı hatasında kesin adlı kuralın elle kaldırılması | §5.1 — ayrı owner kararı; joker silme hiçbir koşulda yok |
| R28 paketi (mühürlü, tüketildi) | DEĞİŞTİRİLMEZ; `…_R28.PREFLIGHT-PROVA-R01` ve diğer kanıt kökleri yerinde kalır; silme owner kararı |
| main ≠ canlı aday — #2655 B11 @ `78f49dd3` ve sonraki main değişiklikleri | RELEASE23'te YOK; yayınları ayrı aday/ayrı karar |
| OFFICE AK paketi K-BLD pinleri | RELEASE22'ye bağlı (`lawyer.service.js` `427DB2F1…`); RELEASE23'te `29812F1C…` → paket DURUR (beklenen; AK kabulü KAPALI, yeniden koşulmaz) |
| İ12 | başlatılmadı |

---

**Bu belge canlı değişiklik yapmaz.** RELEASE23 canlıda (D1 tamam); İ11 açık. CLIENT sayaç **10/17**; hizmet kabulü **0/8 tam**.

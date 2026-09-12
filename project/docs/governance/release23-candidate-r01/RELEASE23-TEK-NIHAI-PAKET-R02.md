# RELEASE23 + CLIENT İ11 — TEK NİHAİ KARAR PAKETİ (R02)

```text
BELGE       : RELEASE23-TEK-NIHAI-PAKET-R02   (R01 #2656 ve §0 düzeltmesi #2658'in YERİNE GEÇER)
YETKİ       : owner GO 2026-09-12 "DEVAM — ÖNCEDEN YETKİLENDİRİLMİŞ ADAY HAZIRLIĞINI TAMAMLA"
              (aday derlemesi + geri dönüş paketi; canlı cutover/restart/yapılandırma değişikliği YOK)
TARAFLAR    : OFFICE 33 — C33/D1 (derleme · Katman 1 · R28 · bu belge ve GO taslağı)
              CLIENT    — İ11 (bağlama + aday doğrulaması #2654 R04 · D3 engelleyici düzeltmeleri #2657 @ 88b3d07a R05 ·
                          K-PAR kalıntı düzeltmesi #2660 @ af79b50c R06 · yedek bütünlüğü + PS 5.1/7 #2662 @ 59abb70b R07)
              ana yürütücü — hat koordinasyonu; R28 bağımsız doğrulayıcısı (owner GO 2026-09-13 ile DOĞRUDAN atandı; kayıt #2661)
DURUM       : ADAY DERLENDİ · İ11 ADAY İKİLİSİNDE DOĞRULANDI (R04 · R05 · R07) · D1 HAZIR · D3 DÜZELTİLDİ ·
              TEK KOŞULLU GO TASLAĞI OWNER ONAYINA SUNULUR (§7)
YAPILMADI   : ratifikasyon · owner preflight (yükseltilmiş) · -Live · onaylı kimlik · mühür/authority/nonce ·
              cutover · D3-0 yakalayıcı · T-pencere · İ11 canlı koşumu
CANLI       : RELEASE22 — API :8080 PID 46332 · Web :3002 PID 47004 · bin = R22 preimage · RELEASE23 .env YOK ·
              I11-WINDOW-BLOCK kuralı 0 · :2526 dinleyici 0 (2026-09-12T21:58:18Z salt-okuma ölçüldü; DEĞİŞMEDİ)
YETKİ SINIRI: bu belge canlı yürütme yetkisi DEĞİLDİR; §7 yalnız owner onayına sunulan taslaktır
KAYIT       : CLIENT sayaç 10/17 · hizmet kabulü 0/8 tam
```

Ayrıntılı paket kaydı: `RELEASE23-R28-CUTOVER-PAKETI-R01.md` (diskteki
`HY_C33_RELEASE23_CUTOVER_R28\docs\LIVE-APPROVAL-PACKAGE-R28.md` ile bayt-aynı; sha256
`FB99418F0CAC52E80250256FCFC56F9356FFD9F0E9B293C6F62D729138C346D0`). CLIENT kayıtları: `client-live-acceptance-i11-r01/I11-ADAY-BAGLAMA-VE-DOGRULAMA-R04.md`,
`I11-D3-ENGELLEYICI-DUZELTMELER-R05.md`, `I11-D3-KPAR-KALINTI-R06.md`, `I11-D3-BUTUNLUK-VE-PS51-R07.md`. Bu belge **canlı karar için gereken her komutu ve tam hash'i tek yerde toplar**;
D1 PowerShell blokları R28 kaydından programatik olarak alınmıştır (bayt-aynı).

## 0. R01'den farklar (R02)

**D3 engelleyicileri ve iki takip bulgusu kapandı.** R01 §0'daki kusurlar (#2658) ve sonraki bulgular CLIENT tarafından üç adımda düzeltildi:
**R05** #2657 @ `88b3d07a` · **R06** #2660 @ `af79b50c` · **R07** #2662 @ `59abb70b`. Hepsi yalnız oturuma özel ortamda, aday ikilisinde
yeniden kanıtlandı. OFFICE 33 her birini **main'de kaynaktan okudu ve dosya sha'larını ölçtü**:

| # | Düzeltme | OFFICE 33 bağımsız doğrulaması | CLIENT yeniden kanıtı |
|---|---|---|---|
| E-1 (R05→R06) | §9 K-PAR deseni `smtp-sink` → `smtp-sink\.js` → **`smtp-sink\.js\b`**; `smtp-sink-noauth.js` ve kayıt `smtp-sink.jsonl` dışlanır | fark okundu; **§9 gömülü blok sha'sı yeniden hesaplandı**: R05 `9804FEF6…`, **R06 `27E754A7…`** (LF, sonda LF) | R06 gerçek süreçlerle: noauth **0** · log yolu taşıyan PS sarmalayıcı **0** · `Get-Content -Wait` izleyici **0** · eski AUTH **3** (PS 5.1 + PS 7) |
| E-2 (R05) | T-KAPA'da her adım kendi `try/catch`'inde; R-T4a (engel kaldır) · R-T4b (Web) · R-T5 · R-T6 · R-T7 **her durumda**; hatalar **sonda** fırlatılır | `t-window-close.ps1` okundu (R07'de mantık korunuyor) | hata yolu provası: R-T2/R-T3 düştü, **R-T5 yine koştu**, sonda throw; kurtarma idempotent |
| E-3 (R05) | T-AÇ ve T-KAPA canlı modda **K-ELEV** ilk kapı | kaynak okundu | yükseltilmemiş oturumda iki blok ilk değiştirici komuttan önce DURDU |
| E-6 (R07) | **Yedek bütünlüğü:** zorunlu **`T_ENV_PRE_SHA`** pini (T-AÇ K-T0a env sha = pin değilse, yedek dizini zaten varsa veya yakalayıcı kaydı yoksa **hiçbir değişiklik yapmadan** durur) · yedek dizini **pencere başına yeni**, **kopyadan ÖNCE** korumalı DACL · yedek, SDDL tabanı, taban dosyası ve yakalayıcı kaydı yalnız SYSTEM + Administrators + yürütücü · T-KAPA bunları kullanmadan önce sahip + DACL + reparse denetler; yedek **yalnız güvenilir ve sha = pin ise** geri yazılır, aksi hâlde geri yazmaz ama R-T4/R-T5 yine koşar | main'de sha ölçüldü; `t-window-apply.ps1` K-T0a/`Set-TrustedAcl`/`Get-TrustProblem` ve `t-window-close.ps1` R-T1/R-T3 kaynakta okundu | sınama 1–9 (yanlış pin · yabancı kural · yedeğe bayt ekleme · pin'siz · idempotent · yerleştirilmiş dizin) hepsi beklenen davranış |
| E-7 (R07) | **Windows PowerShell 5.1 env bozulması:** `Get-Content`/`Set-Content` yerine bayt düzeyinde değişim (katı UTF-8, satır sonları ve BOM durumu korunur, `WriteAllBytes`); iki betik **yalnız ASCII** | main'de iki betik: ASCII dışı bayt **0**, CR **0**, ayrıştırma **0** | tam pencere döngüsü **A** (WinPS 5.1, runId `51d2dcc4`) ve **B** (pwsh 7.6.5, runId `95ee9ad2`): T-AÇ çıkış 0 · İ11 **PASS 11/0/0** · T-KAPA çıkış 0 · ASCII dışı değer bayt bayt korundu |
| E-9 (R07) | `Set-Acl` zaten korumalı hedefte düşüyordu → `Set-TrustedAcl` idempotent + `icacls /inheritance:r /grant:r` (SID ile) | kaynak okundu | iki kabukta: yeni/tekrar/kopya/kalıtsal/korumalıya tekrar/yabancı kural yakalandı |

**OFFICE 33 kalıntı bulgusu (R05 deseni `smtp-sink.jsonl` alt dizgisini de eşleştiriyordu) — ölçüldü, R06 ile KAPANDI.** D3-0'daki K-PAR
ön-kontrolü §9 desenini birebir kullanır ve D3 süresince belirteç taşıyan başka süreç kalmadığını ayrıca teyit eder.

**Kayıt — R02 ara sürümündeki hatam:** R02 @ `11a953da` D3-0'ı `i11live`'ı önceden korumalı kuruyor ve D3-4 sarmalayıcısı yedek sha'sı
tutmazsa T-KAPA'yı hiç koşturmuyordu. R07'de T-AÇ K-T0a önceden var olan yedek dizininde **tasarım gereği durur** (yerleştirilmiş dizine karşı
koruma) — ön-kurulum canlıda pencereyi açtırmazdı; sarmalayıcı ise T-KAPA'nın erişimi her durumda geri açma adımlarını da engellerdi. İkisi
de **kaldırıldı**; yedek bütünlüğü CLIENT betiğinin içindedir. D3-0 artık `i11live`'ın **olmadığını** salt-okuma denetler.

**Ana yürütücü bağımsız doğrulaması (#2661, owner GO 2026-09-13 ile doğrudan atandı):** §1.1–§1.4 **44/45 EŞİT** (tek fark beklenen:
RELEASE22 kökünde manifest dışı `project/apps/api/.env`, sha'sı ayrıca pinli ve eşit) · §1.5 **12/12 EŞİT** (R06 durumunda) · K-PAR R06
11/11 · K-ELEV ilk değişiklikten önce · **K-KİMLİK BEKLEMEDE** (3e girdisi yok; OR-03a canlı GO içinde hesaplanır). Bulgularının karşılığı:

| # | Bulgu (#2661) | R02'deki karşılığı |
|---|---|---|
| 1 | `ENV-PREIMAGE.env` kalıtsal ACL ile doğar · üst dizin korumasız · T-KAPA yedek sha'sını denetlemez · taban/kanıt dosyaları zayıf ACL'de | **CLIENT R07 (E-6)** betik içinde çözdü; §1.5 yeni hash'ler; D3-1/D3-4 `T_ENV_PRE_SHA` ile çağrılır |
| 2 | Rol/ölçüm ifadeleri eskimiş | başlık, bu bölüm, §7 madde 2 ve §8 güncellendi |
| 3 | T betikleri PS 7'de prova, R02 5.1 çağırıyordu | R07 (E-7) iki kabukta da doğru; D3 penceresi **yükseltilmiş `pwsh` 7** (döngü B), karışık zincir yok |
| 4a | D3 sırasında kanonik ağaç değişirse T-KAPA sha'sı tutmaz | **dondurma kuralı** (§4 D3) + §5.1 satırı |
| 4b | K-T0 öncesi düşüşte D3-4 API'yi gereksiz yeniden başlatır | **D3-S** (yalnız yakalayıcıyı durdur) + §5.1 satırı |

**Diğer farklar:** main ≠ aday (#2655 B11 @ `78f49dd3`, RELEASE23'te yok) · D3 yürütücüsü yükseltilmiş pencere, owner sağlar.

## 1. Kesin kimlikler (tam değer)

### 1.1 Aday — sabit kaynak

| | Değer |
|---|---|
| **Sabit kaynak** | `2740df3dd58c5e711a790cc21a5f69d6dbffb35d` (#2646 squash; origin/main atası) — hareketli main KULLANILMADI |
| Kapsam | **#2641** `b9fd97a1` · **#2643** `d199c8dc` · **#2645** `e65ff5de` — üçü de adayın atası (ölçüldü) |
| Fark `13740670..2740df3d` | 33 commit · **ürün farkı 7 dosya** (`party-write-tx.ts`, `case`/`client`/`debtor`/`lawyer.service.ts`, `error-log.sanitize.ts`, `office-write-role.policy.ts`) · migration/şema/lock/`package.json`/web/`packages` **0** |
| **Aday kökü** | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23` — detached worktree, HEAD = kaynak, kirli 0, `.env` YOK |
| **Web BUILD_ID** | `dOiGPj2M0Abls0kCibY4r` |
| API giriş `main.js` | `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` (RELEASE22 ile aynı — derlemeyi AYIRT ETMEZ) |
| main ≠ aday (§0) | #2655 B11 @ `78f49dd3` (`lawyer.service.ts`) adaydan SONRA main'de; RELEASE23'te YOK |

### 1.2 Derleme manifesti — Katman 1 `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CANDIDATE`

| | sha256 |
|---|---|
| Aday makbuzu `RELEASE23-CANDIDATE-RECEIPT.json` | `6BF43693D45C1245693381BCAC448DCA20522E57A6F461BB1476A1EC66D1E6D3` |
| **Manifest** `RELEASE23-PAYLOAD-MANIFEST.json` (= manifestDigest) | `E53618ED81FF02B43CB03B26656275B860D1C9B399C7D561A75BE0CA17F61AD5` |
| candidateDigest | `EF8ED2AC844CB0CB943499C97266FD740677B9D17D6783867E248C02328D6846` |
| packageDigest (50 dosya) | `176500F105359543B8E8092F4CB65CBB5C4ED7987F8ABA2381FD7FABA39C1F59` |
| Sıralı defter `RELEASE23-PAYLOAD.ordinal.tsv` | `52075981B6315B34CB7A51271990908A6A7A570354398C6AA1C86E7ED869EC46` |
| R09 bağlama profili | `80A835B04BB2DC6F3AEB51ECC1ED1237EA208C4C4E867B0630183B739D86E198` · profil `PRF-1c343861-7177-4799-be95-0c1fb72dd212` |

### 1.3 Cutover paketi — R28 `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28` (MÜHÜRSÜZ)

| | sha256 |
|---|---|
| Paket kimliği literali | `HY_C33_RELEASE23_CUTOVER_R28` (motor P-04 · OWNER-COMMAND · verifier V-03/V-04d) |
| Motor `engine\Invoke-C33Cutover.ps1` | `2AE770435B769A21CFF495BF2224A3385EE27A3DD2E5E6E538D6BB3218DFA927` |
| Owner preflight `tools\Invoke-OwnerPreflight.ps1` | `0E74F687BEAF55432879BE1E10D40DFB55A223CCED6119E6CC804AC1332E420C` |
| `qualification\Test-RealPrimitives.ps1` | `5DCD12B31D2457DA5B8219E7A004426D0A7C1DB932DA754196B6A8D5E74179D2` |
| `tools\Seal-Package.ps1` | `650971A51F2CF592DA621EEAA92A2883F1580BB2A06A10573BC4ADB4B6DD588B` |
| `qualification\Verify-Package.node.js` | `1260E1FF42CF9C3442D2C3005ACF821C7B81646ECC181878359AB9546883EABD` |
| Şablon OWNER-COMMAND / OWNER-RUN | `894BB522AC26A36E5518CC831AB30F03623C30CC300BE30D44A25D80FD0A3D2D` / `A24C04FD573EDC46C79463DED5586EDD6E8ECABEFC6B15716C83FE4E0E13842D` |
| `PACKAGE-IDENTITY.json` (bilgi; OP-01 `engineSha256` taşır) | `EFD0EF2553ECB5DA285B13F950A26746A153A10DFAAB0FE349AFD715FFF8A1E5` — `preLiveListDigest` **ONAY ADAYI DEĞİL** |

Durum (ölçüldü): `pins/`, `authority/`, `claims/`, `journal/`, `cutover-receipts/`, `preflight/`, `MANIFEST.json`,
kök `OWNER-RUN`/`OWNER-COMMAND` **YOK**. R27 tüketildi, yeniden mühürlenemez.

### 1.4 Geri dönüş kimlikleri — RELEASE22 (şu an CANLI)

| | Değer |
|---|---|
| Kök / kaynak | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22` @ `137406701248858221d12be94a941f8837a2a245` · BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ` |
| Manifest | `26B31B6976BFB596D399F31EA2688BF79D67FEFF991838E8D3B528E14A911869` — kök TAM yeniden hash **88.178/88.178 eşit**; diskte olup manifestte olmayan yalnız `project/apps/api/.env` (P-040 beklenen istisna; sha aşağıda pinli) |
| `.env` (H-01 kaynağı; içerik okunmadı) | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` |
| bin preimage (= canlı; `generations\R22`) | host `E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706` · api `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` · web `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D` |
| bin postimage (ileri; `generations\R23`) | host `691BC146C9123B1625B4AE733EFE615F8AFFB77FB0C95EBFDAE621A6AA171627` · api `CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3` · web `F39F7A54BC51972B94FD0CF13A08F4E1AB82822A528EDAD58FC8F2318C1F59E0` |

### 1.5 CLIENT İ11 — adaya bağlanmış kimlikler (main @ `59abb70b`; dosya sha'ları OFFICE 33 tarafından ölçüldü)

| | sha256 |
|---|---|
| **İ11 §9 kabul bloğu** (R06; R23'e bağlı) | `27E754A721749443F8B3F2F363B7676989FC115BB6B85E6E0982F62644FC6700` — `CLIENT-LIVE-ACCEPTANCE-I11-R01.md` §9 gömülü bloktan OFFICE 33 yeniden hesapladı (LF, sonda LF); R07'de değişmedi |
| **T-PENCERE-AÇ** `scripts\t-window-apply.ps1` (R07) | `ED64A751F75B0F0C3B1406759E92C2F20DAF29018CC893A5EB387391C822BBCF` |
| **T-PENCERE-KAPA** `scripts\t-window-close.ps1` (R07) | `3F027B0DA7AA65F5F8C7A016F1EAD605706C2A4BDA2E703D4A6D4A199DA8BB2C` |
| **`T_ENV_PRE_SHA` pini** (T-AÇ ve T-KAPA'ya AYNI değer) | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` — cutover H-01 RELEASE23 `.env`'i RELEASE22 baytlarıyla kurar (§1.4); D1-5 `env sha=` satırı bu değere eşit olmalıdır |
| GEÇERSİZ | R04: §9 `A16E4791…` · T-AÇ `508C5323…` · T-KAPA `5895CFC7…` · R05: §9 `9804FEF6…` · R05/R06: T-AÇ `CA99E69E…` · T-KAPA `0A80982B…` · R07 ara sürüm T-AÇ `5AB1AF16…` — **kullanılmaz** |
| `i11-run.js` · `i11-01-setup.js` · `i11-02-intake.js` | `27821B463D2DDA5E1F180A79A677CEA13B2EAD15840D95F8218012A0E2632F4B` · `1317D727F08C81108D027C41B9B0DF9EF8E6B5C0C99979F76AEF30E3CA427DC4` · `7D8D492BC6CE4A2E2CD3CB77EEACAC01594D1DDD9D17F9F767D0625DDB251789` |
| Kurtarma `i11-03-close-links.js` · `cl-09-close-access.js` | `87C16DB3E7A7521605C1E6F16563415949F871042BCF51617283B4A05D549740` · `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` |
| `smtp-sink-noauth.js` | `99A5D681686BC3704151227AB45FC01EFC9F5F6E84DE7FE686A1157E9B558800` |
| Bağlayıcı `i11-bind-candidate.ps1` · V-B `i11-vb-compiled-redaction.js` | `B1C24402E7999B89AF0A4A26E93DF9B2EAADEC7CB0609A7E7B871B0AADDFBD49` · `5E0E05384CD422A85E9FD35530A88A141798FAED968E94EC8667AB7AD5AC7ABA` |
| Bağlama kaydı `I11-CANDIDATE-BINDING.json` (CLIENT yerel kanıt) | `FCD57F04E58767ED43F85152222C1A95C5B8423C54500F432D53D580FFA157EA` |

## 2. Aday üzerinde kabul sonucu — iki taraf

### 2.1 OFFICE / C33 (derlenmiş aday ve paket)

| Kanıt | Sonuç |
|---|---|
| Derleme (RELEASE22 yordamı) | worktree add · `pnpm install --frozen-lockfile` (8.15.0) · `db:generate` · `build` — dördü exit 0 (4/27/7/69 s); turbo cache miss 3/3; `node_modules` yerel (junction yok) |
| API `dist` farkı | 16 değişen + 3 yeni (`common/party-write-tx`), silinen 0; kapsam dışı derleme farkı 0; web rota yüzeyi birebir (55/55 · 42/42) |
| Derlenmiş işaretler (satır) | `redactSecretPathSegments` 3 · `party-write-tx` 1/1/1/1 · `createPartyWriteTxContext` 2 · korunan `pureNoOpDetected` 3 · `OFFICE_WRITE_DENIED_VIEWER` 3 · `assertGenericDecisionAllowed` 5 · `LAWYER_REACTIVATE` 1 |
| Katman 1 zinciri | **11/11 exit 0** — Node 38/38 · PS 28/28 · ADIM2 39/39 · yazıcı 5/sınıflandırılamayan 0 · ADIM4 22/22 · env anahtarı RELEASE22 ile birebir · R09 37/37 (+B-072b NOT_EXECUTED) |
| R28 kalifikasyonu (motor `2AE77043…`) | NC **91/91** · gerçek primitif (yerel) **21/21** · preflight giriş yolu **12/12** / fikstür **14/14** · C36 bağlama **29/29** · OC şablonu **16/16** · verifier mühürsüz **FAIL 0** (NOT_EXECUTED 15) |
| Mühür S-06 / S-08c canlı salt-okuma | **10/10** beklenenle uyumlu (R28 mühürlenebilir; R27 mühürlenemez) |
| **Owner preflight PROVASI** (kopya; yalnız OP-00 ön-koşul yamalı; yükseltilmemiş) | **PASS 28 · FAIL 2 · NOT_MEASURED 3** — düşenlerin tamamı yükseltme kaynaklı (OP-00, OP-05c, OP-08a/09d/09e). R28'e özgü engel YOK. Kanıt `HY_C33_RELEASE23_CUTOVER_R28.PREFLIGHT-PROVA-R01\prova-preflight.json` `CE2A161ABFEA9BDEE36143814E405DA51F265CAE8089CEB205A60C1320FEED1C` |
| Geri dönüş kökü | 88.178/88.178 eşit; nesil kopyası canlı bin ile bayt-eşit |
| **D2 SONRASI aday kökü** (bağımsız, OFFICE) | Katman 1 Node doğrulayıcısı manifest `E53618ED…`'e karşı **38/38** — EXACT-SET iki yönde PASS, yeniden hash 83.437 / uyuşmaz 0; **CLIENT aday köküne yazmadı** |

### 2.2 CLIENT / İ11 (aday ikilisinde; yalnız oturuma özel DB + Redis + yerel yakalayıcı)

| Kanıt | Sonuç |
|---|---|
| Bağlama B-0..B-5 (R04) | HEAD · BUILD_ID · manifest · ürün farkı 7 · `redactSecretPathSegments` MEVCUT · İ11'in 12 ürün hash'i RELEASE22 ile aynı — **hepsi eşit** |
| **V-B** derlenmiş B-I11-3 (R04) | **PASS** — 503, ErrorLog 1 satır, ham token 0 (kanıt `7121CB3A5101692EC13057C5D54FD1AC734E5759C96C7280F8D782D3236DE951`); RELEASE22 negatif kontrol FAIL |
| **V-A** birleşik dizi (R04, runId `64245dc2`) | **PASS 11 · FAIL 0 · ÖLÇÜLEMEYEN 0**; taşıma gövdesi A-5 token yok / A-6 token yalnız sağlayıcı metninde (kanıt `C7E7B8E859003EDF4B42C8BF0DD125640B0B78F7329614F7D1305B3D93F1895F`) |
| V-A tekrarı R05 blokları (runId `51c11954`; tarihsel — bloklar R07 ile değişti) | İ11 **PASS 11/0/0**; T-KAPA hata yolu (R-T5 yine koştu, sonda throw) + kurtarma (idempotent) |
| K-PAR sondası (R05 → R06) | R05: noauth **0** · eski AUTH **4** · **R06** gerçek süreçlerle (PS 5.1 + PS 7): noauth **0** · log yolu taşıyan sarmalayıcı **0** · izleyici **0** · eski AUTH **3** |
| K-ELEV izole sınama (R05) | yükseltilmemiş oturumda T-AÇ ve T-KAPA ilk değiştirici komuttan önce DURDU |
| **R07 sınamaları 1–9** (WinPS 5.1 `-File`) | yanlış pin → K-T0a durdu, değişiklik 0 · yedeğe/kayda yabancı kural → R-T1 "güvenilir DEĞİL, GERİ YAZILMADI", R-T4/R-T5 yine koştu, sonda throw · yedeğe bayt eklendi → "pinli değere EŞİT DEĞİL, GERİ YAZILMADI" · özgün bayt geri → kurtarma çıkış 0 · pin'siz T-KAPA → T-PIN durdu · idempotent tekrar çıkış 0 · yerleştirilmiş yedek dizini → K-T0a durdu |
| **R07 tam pencere döngüleri** (nihai bloklar `ED64A751…` / `3F027B0D…`; yakalayıcı kaydı zaten korumalı) | **A — WinPS 5.1:** T-AÇ 0 · İ11 runId `51d2dcc4` **PASS 11/0/0** · T-KAPA 0 · **B — pwsh 7.6.5:** T-AÇ 0 · İ11 runId `95ee9ad2` **PASS 11/0/0** · T-KAPA 0; yalnız `SMTP_HOST`/`SMTP_PORT` değişti, ASCII dışı değer ve CRLF/BOM durumu bayt bayt korundu |
| Nöbetçi (aday kökü) | R04 `1AF16597659351D368D210B0FE6B92C265099EFE853E7D8F1902902274BC6D33` · R05 `2A1062EAC54A2D5EBBCE2E7F583B4769E1654AF786420EBCCE0B88E5FCAFF7CB` · R07 iki prova oturumunda ayrı taban — hepsinde dosya 88.248 → 88.248, değişen 0 |

**Önceki yordam provası (RELEASE22 dist) aday kanıtı SAYILMADI**; V-A/V-B aday ikilisinde koşuldu. Tamamlanmış testler
(S · G · F · R · N3) gerekçeyle tekrarlanmadı (CLIENT R03 §3).

### 2.3 Bu kanıtların KANITLAMADIKLARI

- Yükseltilmiş ölçümler: OP-00, **PRE-06 / OP-05c CutoverWriter**, OP-08a/09d/09e escrow/writer/broker ACL — yalnız D1-1.
- `-Live` canlı primitifler (D1-2) ve mühür kapılarının tamamı (D1-4 içinde).
- OFFICE #2641/#2645 davranışı **aday ikilisinde işlevsel olarak koşulmadı** (kanıt PR CI + disposable PG, kaynak üzerinde); aday bağı derlenmiş dosya sha'ları + işaretlerdir.
- T-KAPA **R-T4a/R-T4b** (engel kaldırma, Web başlatma) **hiçbir modda koşulmadı** (yalnız canlı modda çalışır; akış AST ile doğru, R-T5 benzeşimi ölçüldü) — §7 madde 6a owner kabulü.
- Canlı modda sahip = `BUILTIN\Administrators` davranışı (yükseltilmiş yazım) ölçülmedi (R07 §6); `.env` sahibi/DACL korunumu canlıda R-T7 + D3-5 ile denetlenir.
- R07 kalan riski: yürütücü hesabıyla çalışan (yükseltilmemiş) süreçler güvenilir kümededir; bu hesap canlı `.env`'i zaten okuyabilir. Yedek değişikliğini pin yakalar; SDDL tabanı ve yakalayıcı kaydı için koruma sahip + DACL denetimidir.
- D3-0 bloğu canlıda koşulmadı; yerelde sınandı (§4 D3-0).
- İ11 canlı gözlemleri — canlıda yalnız D3'te ölçülür.

## 3. D1 hazırlığı — canlı GO'dan ÖNCE bitenler ve GO İÇİNDE kalan mekanik adımlar

**Bitti (bu GO altında):** aday derlemesi · Katman 1 mühürlü makbuz · R28 forku, nesiller, belgeler · tüm kalifikasyon ·
S-06/S-08c canlı salt-okuma · **owner preflight provası** · geri dönüş kökü doğrulaması · D2 sonrası aday kökü doğrulaması.

**Canlı GO'dan önce bitirilemez (yapısal):** onaylı kimlik (3e), Adım 2 `-Live` sonucunu (`REAL-PRIMITIVES-RESULTS.json`) ve 3b/3c
çıktılarını İÇERİR; mühür (S-02b) `liveExecuted=true` ister. Bu yüzden 3a–3f GO içinde, sabit sırayla ve §7 K-KİMLİK koşuluyla yürür.
Yazıcı OFFICE 33, bağımsız doğrulama ana yürütücü; production teması 0.

## 4. Tek yürütme sırası — kesin komutlar

D1 adımları **"Yönetici olarak çalıştır" Windows PowerShell 5.1 ConsoleHost** (OWNER-RUN OR-00); D3 adımları **yükseltilmiş PowerShell 7
(`pwsh`)** penceresinde (§4 D3). Her adım bir öncekinin beklenen sonucuna bağlıdır;
beklenmeyen sonuçta **DUR** ve §5 uygulanır. **Aynı anda tek canlı yürütücü:** D1 boyunca CLIENT, D3 boyunca OFFICE canlıya dokunmaz;
her devirde hat boşluğu ana yürütücüyle teyit edilir.

### D1-0 — Ratifikasyon referansı (owner)

Önerilen biçim `OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-<YYYYMMDD>-R01`. Ölçüldü: öneke ait kullanım git tüm tarihçede **0**,
origin/main'de **0**; R28 paketinde yalnız sentetik fikstür değerleri (`…-20260906-R0x-FIXTURE`, OC testi `…-20260909-R01`) — bunlar seçilmez.
Rnn revizyondur, paket numarası DEĞİLDİR.

### D1-1 — Owner preflight (salt-okuma; DB/HTTP/login 0; `.env` içeriği okunmaz)

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28'; $p="$R\tools\Invoke-OwnerPreflight.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '0E74F687BEAF55432879BE1E10D40DFB55A223CCED6119E6CC804AC1332E420C') { Write-Host 'PREFLIGHT ARACI SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; Write-Host ('cikis=' + $LASTEXITCODE) }
```

Beklenen `cikis=0` `OWNER_PREFLIGHT_READY`; yazma yalnız `preflight\OWNER-PREFLIGHT-<utc>.json` + `.sha256`. Çıkış 1 FAIL · 2 NOT_MEASURED
(PASS değil) · 3 ön koşul · 4 ABORTED → DUR (mutasyon 0; neden giderilip yeniden koşulabilir). **READY cutover yetkisi değildir.**

### D1-2 — Canlı salt-okuma gerçek primitifler

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28'; $p="$R\qualification\Test-RealPrimitives.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '5DCD12B31D2457DA5B8219E7A004426D0A7C1DB932DA754196B6A8D5E74179D2') { Write-Host 'SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Live; Write-Host ('cikis=' + $LASTEXITCODE) }
```

Beklenen `REAL_PRIMITIVES_PASS`, `liveExecuted=true`, 31/31 (21 çevrimdışı + 10 canlı), failed 0 (Seal S-02b `total>=29` ister).
Etki: 4 HTTP isteği (API `GET /` 404 · Web `GET /` 200 · `POST /api/auth/smoke/login {}` 400 · `GET /api/auth/capabilities` 200);
smoke POST canlı API belleğindeki giriş-deneme sayacını IP başına +1 artırır (DB/dosya yazması değil; mühür S-08d bir kez daha +1);
yerel test sunucusu benzersiz `%LOCALAPPDATA%\Temp\hy-r28-realprim\<utc>` altında (silme yok); `REAL-PRIMITIVES-RESULTS.json`
yeniden yazılır. Restart 0.

### D1-3 — Onaylı kimlik + çalıştırıcılar (paket yazıcısı OFFICE 33; bağımsız doğrulama ana yürütücü)

| # | İş | Kimlik etkisi |
|---|---|---|
| 3a | `docs\OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-<YYYYMMDD>-R01.md` (owner metni) | digest dışı |
| 3b | OWNER-COMMAND şablonunda `__OWNER_RATIFICATION_REF__` → ref; kök `OWNER-COMMAND.C33-CUTOVER.ps1` = şablonun bayt-kopyası | şablon digest içi, kök dışı |
| 3c | `qualification\Test-OwnerCommandTemplate.ps1` yeniden (OC-10 ref'in 3a kaydını ister) | digest içi |
| 3d | Verifier mühürsüz: `PACKAGE_STATIC_VERIFIED_UNSEALED`, V-05d canlı PASS | digest dışı |
| 3e | `docs\APPROVED-IDENTITY-<digest8>.json`; `unsealedDigest` = OR-03a (`sha256(concat(yol + ":" + sha256 + "\n"))`, ordinal sıra) — **§7 K-KİMLİK** | digest dışı |
| 3f | OWNER-RUN şablonu: ref · preflight kanıt yolu+sha (D1-1) · onaylı digest/liste (3e) · kök OWNER-COMMAND sha (3b) · kayıt yolları; kök `OWNER-RUN.C33-RELEASE23.ps1` = bayt-kopya | onay-sonrası değişen |

Yer tutucu kalırsa çalıştırıcılar DURUR (exit 90/91). Owner D1-4'ten önce onaylı digest'i ve iki çalıştırıcının sha'sını görür.

### D1-4 — Tek owner komutu (OR-00..OR-04b → SEAL [30 dk pencere] → VERIFIER → OWNER-COMMAND → motor)

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE23_CUTOVER_R28\OWNER-RUN.C33-RELEASE23.ps1" -Confirm "C33-RELEASE23-CUTOVER-GO"
```

Motor fazları: **P** ön-uçuş (yazma 0) → **B** claim (nonce tüketilir) → **H** release-yerel (RELEASE23 `.env` CreateNew = RELEASE22 baytları;
`.env` ebeveyni + dosya `RUNTIME_CONFIG_*`, RELEASE23 kökü `IMMUTABLE_RELEASE`) → **C** API/Web Disable+Stop → bin 3 dosya atomik →
Enable+Start → **V** (DB snapshot eşit) → COMMIT (makbuz). DB yazması 0; görev kaydı değişmez.
**Tek desteklenen yol OWNER-RUN'dır**; Seal/Verifier/OWNER-COMMAND elle ayrı koşulmaz. Çıkış kodları ve karşılıkları §5.1.

### D1-5 — Teknik yayın kabulü (salt-okuma) + devir makbuzu

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

Beklenen: iki port `kok=HY_W4_RELEASE23 OK` (eski PID 46332/47004 yok) · bin `691BC146…`/`CC634BBF…`/`F39F7A54…` ·
`BUILD_ID=dOiGPj2M0Abls0kCibY4r` · `buildManifest=200` · `api GET / =404` · `env sha=7A7228B1…` · işaret satırları sırasıyla
**3 · 1 · 1 · 1 · 1 · 2 · 3 · 3 · 5 · 1** (işaret listesi ve sayım yöntemi aday kökünde ölçüldü; bloğun port/HTTP/bin kısımları
cutover öncesi anlamsızdır, koşulmadı). **Devir makbuzu CLIENT'a (yazılı):** cutover makbuzu
yolu + sha · canlı SHA/BUILD_ID · bu bloğun çıktısı · **`env sha=` satırı = D3 `T_ENV_PRE_SHA` pini** (beklenen `7A7228B1…`; farklıysa D3 başlamaz) ·
**`env sddl=` satırı = D3 kapanış taban çizgisi**. OFFICE canlıdan çekilir.

### D2 kapısı (CLIENT) — D3'ten hemen önce

Bağlama main'de (#2654). Canlı dist'te `redactSecretPathSegments` satır 3 (D1-5 çıktısı) görülmeden ve §9 bloğunun K-API/K-BLD
kapıları canlı RELEASE23'e karşı geçmeden D3 başlamaz. R23'e bağlı bloklar cutover ÖNCESİ canlıda koşulursa K-API/K-BLD'de durur (beklenen).

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
(sha doğrulamalı). **D3 süresince kanonik çalışma ağacında git işlemi (pull/merge/checkout) YAPILMAZ**; D3-1 ve D3-4 sha'yı yeniden doğrular.

**İşletim uyarısı (ölçüldü):** D3 süresince komut satırında `smtp-sink.js` · `i11-run` · `cl-09` vb. geçen başka süreç (ör. `-Command` ile
açılmış kabuk, ajan kabuk çağrısı) bulunmamalıdır; K-PAR tasarım gereği durur.

**D3-0 — Ön durum + yakalayıcı + K-PAR ön-kontrolü** (OFFICE 33):

```powershell
& {
$ErrorActionPreference='Stop'
$SC='C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts'
$SP='C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad'
$want=[ordered]@{'smtp-sink-noauth.js'='99A5D681686BC3704151227AB45FC01EFC9F5F6E84DE7FE686A1157E9B558800';'t-window-apply.ps1'='ED64A751F75B0F0C3B1406759E92C2F20DAF29018CC893A5EB387391C822BBCF';'t-window-close.ps1'='3F027B0DA7AA65F5F8C7A016F1EAD605706C2A4BDA2E703D4A6D4A199DA8BB2C'}
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

Sınama (canlıda koşulmadı): bu blok belgeden çıkarılıp YALNIZ betik dizini, scratchpad kökü ve port (2599) değiştirilerek yerelde uçtan uca
koşuldu — **WinPS 5.1 başarı:** `D3-0 TAMAM`, çıkış 0, dinleyici `127.0.0.1`, kayıt dosyası var, `i11live` oluşmadı · **pwsh 7 başarı:** aynı ·
**WinPS 5.1 düşüş** (komut satırında `i11-run` belirteci taşıyan zararsız yardımcı süreç açıkken): K-PAR yakaladı, yakalayıcı durduruldu
(dinleyici 0), çıkış 1 · test süreçleri sonunda 0. `i11live` VAR dalı koşulmadı (tek satırlık salt-okuma kapısı). Blok `i11live`'ı
**oluşturmaz**: yedek dizini T-AÇ K-T0'ın işidir (R07 E-6).

**D3-1 — T-PENCERE-AÇ çağrısı:**

```powershell
& { $f='C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts\t-window-apply.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'ED64A751F75B0F0C3B1406759E92C2F20DAF29018CC893A5EB387391C822BBCF'){ throw 'T-AC SHA UYUSMUYOR - DUR' }; $env:T_MODE='live'; $env:T_GOREF='<OWNER-GO-CLIENT-I11-YYYYMMDD-Rnn>'; $env:T_ENV_PRE_SHA='7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'; pwsh -NoProfile -ExecutionPolicy Bypass -File $f; 'T-AC cikis=' + $LASTEXITCODE }
```

**D3-4 — T-PENCERE-KAPA çağrısı** (aynı pin; yedek güveni ve pin denetimi betiğin içindedir). `$rid` §9 çıktısındaki runId'dir
(`crypto.randomBytes(4)` → 8 hex küçük harf, `i11-run.js:45`); doldurulmamış yer tutucu blokta DURUR — literal `<runId>` ile koşulan T-KAPA
kanıtı bu koşuma bağlayamaz ve "Pozitif hedef kanıtı: YOK" verir (CLIENT notu). §9 runId üretmeden durduysa `$rid=''` yazılır:

```powershell
& { $f='C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i11-r01\scripts\t-window-close.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '3F027B0DA7AA65F5F8C7A016F1EAD605706C2A4BDA2E703D4A6D4A199DA8BB2C'){ throw 'T-KAPA SHA UYUSMUYOR - DUR (§5.1)' }; $rid='<runId>'; if($rid -and ($rid -cnotmatch '^[0-9a-f]{8}$')){ throw 'T_RUNID gecersiz ya da yer tutucu - DUR: §9 ciktisindaki 8 hex runId yazilir (§9 runId uretmediyse bos deger)' }; $env:T_MODE='live'; $env:T_RUNID=$rid; $env:T_ENV_PRE_SHA='7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC'; pwsh -NoProfile -ExecutionPolicy Bypass -File $f; 'T-KAPA cikis=' + $LASTEXITCODE }
```

**D3-S — Yalnız yakalayıcıyı durdur** (D3-1, K-T0'dan ÖNCE durduysa — canlı değişiklik yoktur, API yeniden başlatılmaz):

```powershell
& { foreach($k in @(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue)){ Stop-Process -Id ([int]$k.OwningProcess) -Force }; Start-Sleep -Seconds 2; ':2526 dinleyici=' + @(Get-NetTCPConnection -LocalPort 2526 -State Listen -ErrorAction SilentlyContinue).Count }
```

| Sıra | Komut | Girdi | Etki / beklenen |
|---|---|---|---|
| D3-0 | yukarıdaki blok | — | `i11live` YOK · yakalayıcı `127.0.0.1:2526` + kayıt dosyası var (komut satırında log yolu YOK) · K-PAR ön-kontrolü **0** → `D3-0 TAMAM` |
| D3-1 | **T-PENCERE-AÇ** `ED64A751…` (`pwsh -File`) | `T_MODE=live` · `T_GOREF=<İ11 ref>` · `T_ENV_PRE_SHA=7A7228B1…` | **T-PIN** · **K-ELEV** · K-T1..K-T3 yakalayıcı yalnız loopback, AUTH ilan yok · K-T4 API tek dinleyici · **K-T5 ayın 1'i 02:00–05:00 reddi** · **K-T0a** env sha = pin · yedek dizini yok · kayıt var · **K-T0** yeni korumalı `i11live` (kopyadan önce) + yedek + SDDL tabanı + taban dosyası + yakalayıcı kaydı korumalı · **K-T6 Web durur + `I11-WINDOW-BLOCK-8080/-3002`** · K-T7/K-T8 bayt düzeyinde TAM iki satır (`SMTP_HOST=127.0.0.1`, `SMTP_PORT=2526`), satır sonları/BOM/SDDL aynı · API restart (180 s) · `T-AC cikis=0` |
| D3-2 | **İ11 §9 bloğu** `27E754A7…` — **TEK KEZ** (belgeden kopyalanır; yalnız üç değişken doldurulur; aynı pencereye yapıştırılır) | `$GoRef` = İ11 ref · `$SendGo` = aynı ref · `$SmtpAck = 'EVET'` | K-GO · K-WT · K-ARC (9 araç + 12 ürün hash) · K-PAR (noauth ve `smtp-sink.jsonl` dışlanır) · K-INTAKE · tek `node i11-run.js`; yazma yalnız `cl-acc-<runId>` (gönderim açık **28 satır**; başarısız gönderimde 21); kapanış koşum içinde |
| D3-3 | **Kurtarma** (yalnız koşum kesilir/durum belirsizse; `CLIENT-LIVE-ACCEPTANCE-I11-R01.md` §11) | `CL_RUN_ID=<runId>` + §9'un `CL_*` değerleri | `i11-03-close-links.js` `87C16DB3…` → bağlantılar REVOKED · `cl-09-close-access.js` `01273998…` → 3 User pasif + Case CLOSED; tekrarı güvenli |
| D3-4 | **T-PENCERE-KAPA** `3F027B0D…` (`pwsh -File`) — **K-T0 sonrası HER SONUÇTA** | `T_MODE=live` · `T_RUNID=<§9 runId, 8 hex>` (yer tutucu blokta durur) · `T_ENV_PRE_SHA=7A7228B1…` (T-AÇ ile aynı) | **T-PIN** · **K-ELEV** · K-T10b pozitif hedef kanıtı (kanıt dosyaları güvenilir değilse YOK) · **R-T1 yedek yalnız güvenilir ve sha = pin ise geri yazılır** (aksi hâlde yazılmaz) · R-T2 API restart (180 s) · R-T3 env = pin + özgün hedef · **R-T4a engel kaldır + R-T4b Web — HER DURUMDA** · **R-T5 yakalayıcı durdur — HER DURUMDA** · R-T6 sentetik alan dışı ileti → yeniden gönderim YOK · **R-T7 env SDDL = K-T0 tabanı** · hata varsa tüm adımlar denendikten sonra **sonda throw** (`T-KAPA cikis=1`, adım listesi) · **kabul için:** `Pozitif hedef kaniti: VAR` **ve** `PENCERE KAPANDI - tum adimlar basarili.` · `T-KAPA cikis=0` |
| D3-S | yalnız yakalayıcı durdur | — | D3-1 T-PIN / K-ELEV / K-T1..K-T5 / K-T0a'da durduysa: `:2526 dinleyici=0` |
| D3-5 | **Kapanış ölçütü** (salt-okuma; OFFICE) | D1-5 bloğunun iki `env` satırı | `env sha=7A7228B1…` VE `env sddl` = D1-5 taban çizgisi (R-T7 ile bağımsız aynı karşılaştırma); API/Web kökü RELEASE23; `I11-WINDOW-BLOCK` 0; `:2526` 0 |

## 5. Kapanış ve geri dönüş — TÜM sonuçlarda

### 5.1 Karar tablosu

| Nokta / sonuç | Canlı durum | Yapılacak |
|---|---|---|
| D1-1 veya D1-2 beklenmeyen | RELEASE22, mutasyon 0 | DUR; neden giderilir, adım yeniden koşulabilir (sonuç dosyaları üzerine yazılır) |
| D1-3 K-KİMLİK sağlanmaz | RELEASE22 | DUR; fark owner'a sunulur |
| D1-4 exit **90 / 91** (motor koşmadı) | RELEASE22 | neden giderilir; OWNER-RUN yeniden (authority varsa ve claim yoksa reseal'i kendisi yapar) |
| exit **1** `HARD_STOP_PREFLIGHT_NOT_APPLIED` | RELEASE22, mutasyon 0, makbuz yazıldı | **reseal YOK**; OWNER-COMMAND doğrudan yalnız aynı pencerede ve **AYRI owner kararıyla** (bu GO kapsamında DEĞİL); pencere dolduysa yeni C33 paket numarası + yeni ratifikasyon · D3 başlamaz |
| exit **2** `ROLLBACK_COMPLETE_OLD_RUNTIME_RESTORED` | RELEASE22 geri, nonce tüketildi | D3 İPTAL; D1-5 bloğu **geri yön beklentisiyle** doğrulanır; yeni deneme = yeni paket numarası (R29) + yeni ratifikasyon |
| exit **3** `HARD_STOP_STATE_UNCERTAIN_MANUAL_RECOVERY_REQUIRED` | belirsiz | §5.3 elle kurtarma + geri yön doğrulaması; D3 İPTAL |
| exit **70** (makbuz birincil yola yazılamadı; motor koştu) | makbuz/journal okunur | owner kararı; D3 başlamaz |
| exit 0 fakat **D1-5 teknik kabul düşer** | RELEASE23 canlı, doğrulanmadı | D3 İPTAL; §5.3 elle geri dönüş + geri yön doğrulaması |
| D2 kapısı düşer | RELEASE23 canlı ve teknik kabul geçmiş | D3 başlamaz (yazma 0); yayın kalır; İ11 açık |
| D3-0 düşer (sha · `:2526` dolu · `i11live` var · 15 s dinleme/kayıt yok · K-PAR ön-kontrolü ≥1) | canlı değişiklik 0 (K-PAR düşüşünde blok yakalayıcıyı durdurur) | D3-1 başlamaz; neden giderilir, D3-0 yeniden · `i11live` varsa owner kararı (önceki pencere kanıtı; silme owner kararı) |
| D3-1 T-PIN / K-ELEV / K-T1..K-T5 / **K-T0a** (env sha ≠ pin · yedek dizini var · kayıt yok) durur | değişiklik 0 (K-T0 bu kapılardan SONRA) | D3-2 koşulmaz; **D3-S** (yalnız yakalayıcıyı durdur; API yeniden BAŞLATILMAZ, D3-4 KOŞULMAZ); env sha ≠ pin ise owner'a |
| D3-1 K-T0 sonrası durur (K-T6 · env yazımı · K-T8 · restart) | yedek + SDDL tabanı var; engel/Web/env kısmen değişmiş olabilir | D3-2 koşulmaz; **D3-4 HER DURUMDA** |
| D3-2 başarısız / yarıda | sentetik tenant yazmaları | koşum içi kapanış doğrulanamadıysa D3-3 yalnız runId ile → D3-4 |
| D3-4 pin'siz çağrıldı (T-PIN) | değişiklik yok | aynı bloğu pinle tekrar |
| D3-4 T-KAPA sha uyuşmaz (kanonik ağaç değişmiş) | pencere açık | T-KAPA KOŞULMAZ; betik `59abb70b`'deki blob'dan sha doğrulamalı bayt-kopya ile koşulur — owner kararı; dondurma kuralı ihlali kayda yazılır |
| D3-4 R-T1 "yedek dizini/dosyası güvenilir DEĞİL" ya da "pinli değere EŞİT DEĞİL" | env pencere değerinde kalır (SMTP loopback; yakalayıcı R-T5'te durur → dış gönderim yok); R-T4/R-T5 yine koşar, erişim geri açılır | sonda throw; owner'a DERHAL; **elle müdahale:** yedek başka kaynaktan doğrulanmadan canlı `.env`'e YAZILMAZ; doğrulanmış kaynak sha doğrulamalı `HY_W4_RELEASE22\project\apps\api\.env` (`7A7228B1…`) — owner kararı |
| D3-4 sonda throw (diğer adımlar) | R-T4a/R-T4b/R-T5 yine denendi; listelenen adım(lar) başarısız | owner'a DERHAL; otomatik tekrar YOK; kurtarma = aynı D3-4 bloğunun tekrarı (idempotent, ölçüldü) |
| D3-4 çıkış 0 fakat `Pozitif hedef kaniti: YOK` | pencere kapandı, env = pin | geri dönüş TAMAM; **İ11 A-5/A-6 kanıtı eksik → GO-COMPLETE DEĞİL**; owner'a (yeni İ11 penceresi ayrı karar; `cl-acc-<runId>` yeniden açılmaz) |
| R-T7 veya D3-5 `env sddl` tabandan farklı | içerik bayt-eşit | owner'a bildirilir; otomatik ACL düzeltmesi YOK |
| **D3 açıkken yayın geri dönüşü gerekirse** | — | **ÖNCE D3-4** (engel + Web her durumda geri açılır; env ön görüntüye), **SONRA** §5.3 |

Veri: migration yok. Koşum yazmaları **geri alınmaz**, kapatılır ve kanıt olarak kalır; `cl-acc-<runId>` yeniden açılmaz.
Geri dönüş RELEASE23'ün üç düzeltmesini geri alır (#2641 · #2645 · #2643 B-I11-3 kusurları canlıya döner); AK-2/AK-1a/CLF-O0-01/B-1 RELEASE22'dedir.

### 5.2 Etkileşim — kısmen ölçüldü, blok içi + kapanış ölçütüne bağlandı

Motor H-01 RELEASE23 `.env`'e `RUNTIME_CONFIG_FILE` uygular (korumalı DACL: SYSTEM FA · Administrators FA · runtime FR; sahip SYSTEM).
Canlı RELEASE22 `.env` bugün aynı sınıfta (preflight provası OP-09h PASS; CLIENT SDDL ölçümü `O:SYG:DUD:PAI(A;;FA;;;SY)(A;;FA;;;BA)(A;;FR;;;…-1146)`).
T-PENCERE-AÇ mevcut dosyaya `Set-Content` yazar (yükseltilmiş yönetici FA), T-PENCERE-KAPA `Copy-Item -Force` ile geri yazar.
CLIENT karalama deneyi: korumalı DACL'lı hedefte her iki işlemden sonra **DACL korundu**; **sahip (SYSTEM) korunumu ölçülmedi**.
Kapatma: T-AÇ K-T0 env SDDL tabanını (sahip + DACL) kaydeder, T-KAPA **R-T7** karşılaştırır; OFFICE **D3-5** aynı karşılaştırmayı D1-5
taban çizgisine karşı bağımsız yapar. Farkta otomatik düzeltme yok.

**Yedek `ENV-PREIMAGE.env` (CLIENT R07 E-6):** yedek dizini `i11live` pencere başına yeni kurulur ve **kopyadan önce** korumalı DACL alır;
yedek, SDDL tabanı, taban dosyası ve yakalayıcı kaydı yalnız SYSTEM + Administrators + yürütücü taşır. T-AÇ K-T0a env sha'sını pinle
doğrular; T-KAPA yedeği yalnız güvenilir (sahip + DACL + reparse) ve sha = pin ise geri yazar. Kalan risk §2.3.

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

## 6. Kesinti ve süre

| Pencere | Beklenti | Üst sınır / kural |
|---|---|---|
| D1 cutover (API+Web) | **~15–60 s** (emsaller 14,673 · 13,716 · 57,647 · **39,467 s**; nedeni ölçülmedi) | quiesce 90 s + start 240 s (ayrı); rollback süresi ölçülmemiş; Web BUILD_ID değişir (sekmeler bir kez yenilenebilir) |
| Authority | SEAL'den itibaren 30 dk, tek kullanım | pencere dolarsa §5.1 exit 90/91 satırı |
| D3 bakım penceresi | Web kapalı + :8080/:3002 dışarıya kapalı; API iki restart (aday provası R04 7 s / 6 s · R05 6 s / 6 s) | her restart 180 s; aşımda otomatik tekrar YOK; geçmiş süre garanti değildir (2026-09-11 logon beklemesi 35,5 dk) |

Cutover penceresinde kabul/sentetik tenant koşumu YAPILMAZ (motor V-01 DB snapshot eşitliği rollback tetikler).

## 7. TEK KOŞULLU OWNER GO TASLAĞI (owner onayına)

> **GO — RELEASE23 CANLI YAYIN + CLIENT İ11 TAM CANLI KABUL (TEK KOŞULLU ONAY)**
>
> Referanslar: C33 `OWNER-RATIFICATION-C33-RELEASE23-CUTOVER-<YYYYMMDD>-R01` · İ11 `OWNER-GO-CLIENT-I11-<YYYYMMDD>-R<nn>`
> (gönderim kapsamı `$SendGo` = aynı İ11 ref'i · `$SmtpAck = 'EVET'` · Yöntem T #2644).
>
> 1. **Sabit kimlikler:** kaynak `2740df3dd58c5e711a790cc21a5f69d6dbffb35d`, aday kökü `HY_W4_RELEASE23`, BUILD_ID
>    `dOiGPj2M0Abls0kCibY4r`, manifest `E53618ED…61AD5`, paket `HY_C33_RELEASE23_CUTOVER_R28` (motor `2AE77043…A927`),
>    İ11 §9 `27E754A7…6700`, T-AÇ `ED64A751…BBCF`, T-KAPA `3F027B0D…BB2C`, `T_ENV_PRE_SHA` `7A7228B1…FDDC` — tam değerler bu belge §1.
>    Başka SHA/kök/paket/blok kullanılmaz (§1.5 GEÇERSİZ listesi); herhangi bir sha uyuşmazlığında DUR.
> 2. **Bağımsız doğrulama (ana yürütücü; owner GO 2026-09-13 ataması bu yürütmede sürer):** (i) D1-1'den hemen önce §1.3 R28 araçları ve
>    §1.4 geri dönüş pinlerinin **yeniden ölçümü** (#2661 hazırlık ölçümü 44/45 + beklenen `.env` istisnası), (ii) D1-3/3e'de OR-03a digest'inin
>    **bağımsız hesabı**. Sonuçlar kayda yazılmadan D1-4'e geçilmez.
> 3. **D1 (OFFICE/C33; owner yükseltilmiş WinPS 5.1 penceresinde koşar):** D1-1 preflight `OWNER_PREFLIGHT_READY` → D1-2 `-Live`
>    `REAL_PRIMITIVES_PASS` (live) → D1-3 3a–3f → D1-4 tek OWNER-RUN komutu → D1-5 teknik kabul (§4 beklenenleri birebir) ve devir makbuzu.
>    Her adım yalnız öncekinin beklenen sonucuyla başlar.
> 4. **K-KİMLİK (3e onayı yalnız şu koşulla geçerlidir):** OR-03a digest'i OFFICE 33 ve ana yürütücü tarafından bağımsız hesaplanır ve
>    **eşittir**; onaylı liste ile `PACKAGE-IDENTITY.json` (§1.3 sha) listesi arasında dosya kümesi AYNIDIR ve sha farkı YALNIZ
>    `qualification/REAL-PRIMITIVES-RESULTS.json`, `fork/templates/OWNER-COMMAND.C33-CUTOVER.forked.ps1`,
>    `qualification/OWNER-COMMAND-TEMPLATE-RESULTS.json` dosyalarındadır (OWNER-RUN OR-03b kimlik dışı kuralları aynen). Aksi hâlde DUR ve fark owner'a sunulur.
> 5. **D2 kapısı (CLIENT):** canlı dist'te `redactSecretPathSegments` satır 3 ve D1-5 `env sha=` = `T_ENV_PRE_SHA` (`7A7228B1…`);
>    §9 K-API/K-BLD canlı RELEASE23'e karşı geçer; aksi hâlde D3 başlamaz.
> 6. **D3 (CLIENT yönetir; yükseltilmiş `pwsh` 7 penceresini owner sağlar ve blokları owner yapıştırarak koşar; tek yürütücü; karışık kabuk
>    zinciri yok; D3 süresince kanonik ağaçta git işlemi yok):** D3-0 (`i11live` yok · yakalayıcı + kayıt · K-PAR ön-kontrolü **0**) → D3-1 T-AÇ
>    (`T_ENV_PRE_SHA` pini) → D3-2 İ11 §9 (gönderim AÇIK) **TEK KEZ** → gerekirse D3-3 kurtarma (runId) → D3-4 T-KAPA (aynı pin) **K-T0 sonrası
>    her sonuçta**, `T_RUNID` = §9 runId — K-T0 öncesi düşüşte yalnız D3-S → D3-5 kapanış ölçütü. Bakım penceresidir (Web durur, :8080/:3002 dışarıya kapalı); her
>    restart bütçesi 180 s; aşımda otomatik tekrar YOK.
> 6a. **Owner kabulleri (bu GO ile):** (i) T-KAPA R-T4a/R-T4b için çalışma kanıtı kaynak + AST + R-T5 benzeşimidir, hiçbir modda koşulmamıştır;
>    (ii) CLIENT R07 §6 kalan riski: yürütücü hesabıyla çalışan yükseltilmemiş süreçler güvenilir kümededir (yedek değişikliğini pin yakalar).
>    Owner bunlardan birini kabul etmezse ilgili madde çıkarılır ve D3 başlamaz (yükseltilmiş canlı-dışı sınama / ek betik düzeltmesi ayrı karar).
> 7. **Kapanış/geri dönüş (§5.1 bu GO'nun parçasıdır):** exit 2/3 veya D1-5 düşerse D3 İPTAL ve RELEASE22'ye dönüş doğrulanır
>    (exit 3 / D1-5 düşüşünde §5.3 elle yol bu GO kapsamındadır); D3 açıkken geri dönüş gerekirse ÖNCE D3-4, SONRA §5.3. exit 1 sonrası
>    OWNER-COMMAND'ın doğrudan koşulması, exit 70 sonrası her adım, T-KAPA R-T1 "güvenilir değil / pine eşit değil" sonrası elle `.env`
>    müdahalesi, T-KAPA sha uyuşmazlığı ve R-T7/D3-5 SDDL farkının düzeltilmesi **ayrı owner kararıdır**. Otomatik reseal/tekrar YOK;
>    tüketilen ref/nonce yeniden kullanılmaz.
> 8. **Kapsam dışı:** migration · bayrak · ikinci API süreci · gerçek kişiye gönderim · başka tenant'a yazma · `i11live` yedeğinin ve
>    `CL_TOKENFIX` artığının silinmesi · RELEASE22 kökünde değişiklik · #2655 B11'in yayına alınması.
>
> **IF GO-COMPLETE:** RELEASE23 canlı (`C33_RELEASE23_CUTOVER_APPLIED_AND_VERIFIED` + D1-5 PASS) · İ11 üç gözlemle canlıda kapandı ·
> D3-4 `Pozitif hedef kaniti: VAR` + `tum adimlar basarili` (çıkış 0) + D3-5 PASS · CLIENT sayaç 10/17 → **11/17** · hizmet kabulü **0/8 tam** ·
> `CL_TOKENFIX` ayrı açık kalem.

## 8. Açık kalemler (kapatılmış gösterilmez)

| Kalem | Durum |
|---|---|
| **`CL_TOKENFIX` disk artığı** (`C:\Development\HY_WT\CL_TOKENFIX`) | **AYRI AÇIK KALEM** (CLIENT) — git kaydı 0, yalnız disk; kancayı aşacak alternatif silme yolu denenmedi ve denenmeyecek; seçenek (a) owner siler (b) kancayı tetiklemeyen yola açık onay |
| `i11live` yedek dizini (D3 sonrası CLIENT oturum dizininde canlı `.env` kopyası; sır taşır) | R07: pencere başına yeni, korumalı (SYSTEM + Administrators + yürütücü); T-AÇ'ın tekrar-açma kilidi; **silme owner kararı** |
| T-KAPA R-T4a/R-T4b | hiçbir modda koşulmadı (yalnız canlı modda çalışır) — §7 madde 6a (i) owner kabulü |
| R07 kalan riski (yürütücü hesabı güvenilir kümede) | §2.3 — §7 madde 6a (ii) owner kabulü |
| main ≠ aday — #2655 B11 @ `78f49dd3` | RELEASE23'te YOK (sabit aday); yayını ayrı aday/ayrı karar |
| K-KİMLİK (OR-03a) | BEKLEMEDE — 3e girdileri canlı GO içinde doğar; ana yürütücü (owner ataması) bağımsız hesaplar (#2661 §1.4) |
| PRE-06 / OP-05c · OP-08a/09d/09e | yalnız D1-1 yükseltilmiş oturumda ölçülür; NOT_MEASURED PASS sayılmaz |
| OFFICE AK paketi K-BLD pinleri | RELEASE22'ye bağlı (`lawyer.service.js` `427DB2F1…`); RELEASE23'te `29812F1C…` → paket DURUR (beklenen; AK kabulü KAPALI, yeniden koşulmaz) |
| İ12 | başlatılmadı |

---

**Canlı değişiklik yok.** CLIENT sayaç **10/17**; hizmet kabulü **0/8 tam**.

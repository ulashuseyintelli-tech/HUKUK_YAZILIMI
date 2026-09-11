# RELEASE22 / R27 — TEK YÜRÜTME PAKETİ (R01)

```text
BELGE      : RELEASE22-R27-YURUTME-PAKETI-R01
YETKİ      : owner GO 2026-09-11 "R27 SON YÜRÜTME HAZIRLIĞI" — yalnız hazırlık
YAPILMAYAN : mühür · authority/nonce · Test-RealPrimitives -Live · APPROVED-IDENTITY · cutover · canlı kabul yazması
ROLLER     : paket yazıcısı OFFİCE 33 · koordinasyon + bağımsız doğrulama ana yürütücü
DURUM      : YÜRÜTMEYE HAZIR — hiçbir adım koşulmadı; canlı RELEASE21 (API :8080 PID 50716 · Web :3002 PID 22440)
```

Kanıt etiketleri: **ÖLÇÜLDÜ** = bu turda komutla ölçüldü · **KAYNAK** = betik veya uygulama kaynağından okundu, koşulmadı ·
**ÇIKARIM** = ölçülenden türetildi. Paket bu iş için yeniden üretilmedi; R27 dizinine yazılmadı.

Önceki kayıtlar: [RELEASE22-ADAY-HAZIRLIK-R01.md](RELEASE22-ADAY-HAZIRLIK-R01.md) (#2614) ·
[RELEASE22-R27-CUTOVER-PAKETI-R01.md](RELEASE22-R27-CUTOVER-PAKETI-R01.md) (#2615, #2617) ·
[RELEASE22-R27-BAGIMSIZ-DOGRULAMA-R01.md](RELEASE22-R27-BAGIMSIZ-DOGRULAMA-R01.md) (#2616).

## 1. Kimlik — tam değerler (ÖLÇÜLDÜ, 2026-09-11)

| Konu | Değer |
|---|---|
| **Aday SHA** | `137406701248858221d12be94a941f8837a2a245` — `HY_W4_RELEASE22` worktree HEAD; origin/main tarihçesinde; sonrası yalnız belge (`db307a26`, `eb62fc7e`, `9840577d`, `e85dad08`, `8c92f653`) |
| **R27 kökü** | `C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27` — **mühürsüz**: `pins/`, `authority/`, `claims/`, `journal/`, `cutover-receipts/`, `preflight/` YOK; `MANIFEST.json` YOK; kökte `OWNER-*` YOK |
| **Paket kimliği** (immutableBase.digest, 48 dosya) | `DBE6B8E5D8E18C85F2AA857944125FBDF277F1B8EEC39D3FAF9017C9D3E3516A` — liste ve disk taramasıyla ayrı ayrı yeniden hesaplandı: eşit, sapma 0. **-Live ÖNCESİ değerdir** (§3.2, §4) |
| `PACKAGE-IDENTITY.json` | `56ACAC43DA0B38C2B2D43392EB16365E2E96FFEAF3623FB694F4C6E353352A54` |
| Web BUILD_ID (ileri) | `xJZ1G1TsbOnHoWUzMD8CQ` |
| Profil | `PRF-421d8ced-df88-4912-b78f-dd5c608e607e` |

**R27 araçları (tam sha256):**

| Dosya | sha256 |
|---|---|
| `engine/Invoke-C33Cutover.ps1` | `52C9A2207647AAE5CF79A3C185F85615818E98AE617AC8E88C928480EF2A8803` |
| `tools/Seal-Package.ps1` | `87FD9774D705283CFE109D2FD41778A7A66452EE83897CA67B8FC0AA6FA89794` |
| `tools/Invoke-OwnerPreflight.ps1` | `06FADC5DEFB121E85BEF4B4EDB612F855B9EF58F71EABF697198492CC762A91F` |
| `qualification/Test-RealPrimitives.ps1` | `96269C890343F72B7E49C443BC8A583217C97EF66BBE4B28F9B66D2DD434F248` |
| `qualification/Verify-Package.node.js` | `C24439DDD35F8D076FAAAA33AAC97A0CCE4840827BCDF4CCA419243AD0342FCC` |
| `qualification/Test-OwnerCommandTemplate.ps1` | `914F79CBE1D83D776DD33440EE3BE302F2D9E706259AC19107AC62102B51FDEB` |
| `fork/templates/OWNER-COMMAND.C33-CUTOVER.forked.ps1` | `75635B95AB0FD787A8D0F0144D5E4C1C11C757B96875B4E1ED5843D151C26D36` |
| `fork/templates/OWNER-RUN.C33-RELEASE22.forked.ps1` | `F0CB281DAA1D6F0D598CAEC3FCBE0BFAC9C7185D376442699777CE9C257052DA` |
| `FORK-PROVENANCE.json` | `6CFF5F4DED6F60BEFF976D1975E8F4ADFB215551EE3744DF97BFBC21CD3148E5` |
| `qualification/REAL-PRIMITIVES-RESULTS.json` (şimdiki: 21/21, `liveExecuted=false`) | `80251B5F4EB35093D9B67AD4BBFECB91A34C2080A8FA38DD16FFA4C7EAB47C72` |

**Aday paketi (KATMAN 1) — `HY_C33_RELEASE22_CANDIDATE`:**

| Alan | Değer |
|---|---|
| makbuz sha256 | `8D78B1765EFA345CCAFB74FB8A4E3AF58638F4A045B5ABDDB39CDD88F823E6CD` |
| candidateDigest | `454F447303B6D145B99EF2F3155282D02079AF2AAF0699101C20E5C6A7764C02` |
| manifestDigest | `26B31B6976BFB596D399F31EA2688BF79D67FEFF991838E8D3B528E14A911869` |
| packageDigest | `F0156AC1D4C40EFC4F604EC279903B4513BE6C4F4AA200B0837AEE001F401DCE` |
| ledgerHash | `6957F993907816FDB9721F5511987BDD924FD9194767F728F94411DF35A8E179` |
| releaseRoot | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22` |

**İleri bin nesli (`generations/R22`; cutover'ın `C:\Ops\hukuk\bin`'e yazacağı 3 dosya):**
host `E744A74BBD9053EB60E25459F3650E2CAF65FFCD72FF2A9B2E83ED41834D8706` ·
`start-api.ps1` `77B6FBCD82E9B98291E841E2A1AF9683EBD651AE8C27D31561CB94517640DB51` ·
`start-web.ps1` `1B7654F6A4219B41E7A742DDD0584F91EF91BDAA2DA1C2A7A16C34989110CE3D`.

## 2. Ratifikasyon referansı

Önerilen: **`OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-20260911-R01`**

- **Kullanılmamış (ÖLÇÜLDÜ):**
  - repo governance belgelerinde RELEASE22 için somut ref geçişi 0; bellek kayıtlarında 0; KATMAN 1 paketinde 0;
  - R27 paketinde yalnız sentetik/fikstür referanslar var: `…-20260906-R01-FIXTURE`, `…-20260906-R02-FIXTURE`,
    `…-20260906-R09-FIXTURE` (negatif kontroller) ve `Test-OwnerCommandTemplate.ps1`'de "SENTETİK" işaretli `…-20260909-R01`.
    Önerilen değerle eşleşen yok;
  - R27 hiç mühürlenmedi (authority/pins/claims yok): hiçbir nonce bir ref'e bağlanmadı.
- **Biçim (KAYNAK):** mühür S-00, motor P-04 ve doğrulayıcı aynı deseni ister:
  `^OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-[0-9]{8}-R[0-9]{2}(-[A-Z0-9-]+)?$` → uyuyor. `FIXTURE` içermiyor (S-00 onu reddeder).
  Tarih bileşeni yalnız biçim olarak (8 hane) denetlenir; saatle karşılaştıran kapı yok.
- **R01 ratifikasyon revizyonudur; paket numarası R27'dir (KAYNAK).** Paket kimliği `HY_C33_RELEASE22_CUTOVER_R27` literalidir:
  motor P-04, OWNER-COMMAND (şablon satır 53) ve doğrulayıcı V-03 authority/pins/MANIFEST `package` alanını bu literale karşı
  karşılaştırır. Ref'in `-R01` kısmı hiçbir yerde paket numarası olarak kullanılmaz.
- **Ref'in gireceği yerler (Adım 3–5):**
  - kök `OWNER-COMMAND.C33-CUTOVER.ps1` (şablonda 5 geçiş: yorum satırı 4, `$OC_RATIF` satır 29, authority/pins karşılaştırması
    satır 54–55, motor argümanı satır 71);
  - kök `OWNER-RUN.C33-RELEASE22.ps1` (`$RATIF` + yorum);
  - mühür `-RatificationRef` → `authority.ownerRatificationRef` ve `pins.ownerRatificationRef`;
  - kayıt belgesi `docs/OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-20260911-R01.md` (`Test-OwnerCommandTemplate` OC-10, gerçek ref
    için paketteki kaydı arar).
- **Bu aşamada authority ve nonce ÜRETİLMEDİ.**

## 3. Tek yürütme sırası

Her komut "Yönetici olarak çalıştır" **Windows PowerShell 5.1 ConsoleHost** penceresinde koşulur. Kök:
`$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27'`.

| # | Adım | Kim | Paket yazması | Canlı etki | Restart | Başarısızlıkta |
|---|---|---|---|---|---|---|
| 1 | Owner preflight | owner | `preflight\OWNER-PREFLIGHT-<utc>.json` + `.sha256` (kimlik tabanı DIŞI) | salt-okuma; DB/HTTP/login YOK | yok | exit 1/2/3/4 → DUR |
| 2 | Gerçek primitifler `-Live` | owner | `qualification\REAL-PRIMITIVES-RESULTS.json` (kimlik tabanı İÇİ) | 3 GET + 1 POST loopback; görev/süreç okuma; DB yazması 0 | yok | exit 1 → mühür S-02b reddeder; exit 2 → dosya yazılmaz |
| 3 | Kimlik doğrulama + onaylı kimlik | OFFİCE 33 (paket yazıcısı), ana yürütücü bağımsız doğrular; owner GO | onay belgeleri, kök çalıştırıcılar, `PACKAGE-IDENTITY.json` | yok | yok | uyuşmazlıkta DUR (authority yok) |
| 4 | Mühür → doğrulayıcı | owner (tek komut, Adım 5 ile birlikte) | `pins\`, `authority\` (nonce, ≤30 dk), `MANIFEST.json`, `VERIFY-RESULTS.json` | salt-okuma (DB SELECT, HTTP probe, `git fetch`) | yok | exit 91; mühür reddinde dosya yazılmaz |
| 5 | Cutover | owner (aynı komut) | `claims\`, `journal\`, `cutover-receipts\` | `C:\Ops\hukuk\bin` 3 dosya, API/Web görevleri, RELEASE22 `.env` + kök ACL; DB yazması 0 | **API+Web ~15–60 sn** | exit 1 (mutasyon 0) · 2 (geri alındı) · 3 (elle kurtarma) |
| 6 | Teknik + hedefli kabul | owner / ana yürütücü | — | teknik kabul salt-okuma; canlı yazan kabuller ayrı GO | yok | işaret yoksa DUR |

### 3.1 Adım 1 — Owner preflight (KAYNAK)

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27'; $p="$R\tools\Invoke-OwnerPreflight.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '06FADC5DEFB121E85BEF4B4EDB612F855B9EF58F71EABF697198492CC762A91F') { Write-Host 'PREFLIGHT ARACI SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p; Write-Host ('cikis=' + $LASTEXITCODE) }
```

- **34 kontrol** (OP-00…OP-11). OP-00 yükseltilmiş WinPS 5.1 ConsoleHost ister; değilse exit 3 ve kalanlar NOT_EXECUTED.
- **Okur:** zamanlanmış görevler (CutoverWriter dahil, yükseltilmiş görünürlükle), launcher/bin/host kimlikleri, release yolları,
  ACL'ler, aday/paket/geri dönüş pinleri, canlı süreç ve dinleyici tablosu.
- **Yapmaz:** production DB/HTTP/login sorgusu; `.env` içeriği (yalnız varlık/sha/bayt); ACL/env/bin/görev değişikliği; servis
  kontrolü; authority/nonce üretimi.
- **Yazar:** yalnız paket içi `preflight\OWNER-PREFLIGHT-<utc>.json` + `.sha256`. `preflight/` öneki kimlik tabanı dışındadır.
- **Beklenen:** exit 0 `OWNER_PREFLIGHT_READY`. R25 emsali: 33 PASS + 1 INFO (OP-09j: PRE-07, yani kökün salt-okunur olması
  cutover H-fazının işidir; beklenen).
- **Çıkış kodları:** 0 READY · 1 FAIL var · 2 NOT_MEASURED var (PASS değil) · 3 ön koşul · 4 ABORTED (başarılı makbuz yazılmaz).
  READY cutover yetkisi değildir.

### 3.2 Adım 2 — `Test-RealPrimitives -Live` (KAYNAK; bu turda KOŞULMADI)

```powershell
$R='C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27'; $p="$R\qualification\Test-RealPrimitives.ps1"; if ((Get-FileHash -Algorithm SHA256 -LiteralPath $p).Hash -cne '96269C890343F72B7E49C443BC8A583217C97EF66BBE4B28F9B66D2DD434F248') { Write-Host 'SHA UYUSMUYOR - DUR' } else { powershell.exe -NoProfile -ExecutionPolicy Bypass -File $p -Live; Write-Host ('cikis=' + $LASTEXITCODE) }
```

**Betik ne yapar** (`Test-RealPrimitives.ps1` satırları):

- **Motor çalıştırılmaz** (15–23): motor metninden 8 fonksiyon (`Invoke-Http`, `Resolve-PrincipalSid`, `Get-TaskModel`,
  `Get-ListenerPids`, `Get-ProcModel`, `Get-RuntimeGen`, `Get-ProcsByName`, `BuildArg`) AST ile çıkarılıp yüklenir.
- **(a) Yerel HTTP** (31–60): gizli bir `powershell.exe` ile `qualification\tools\Local-HttpTestServer.ps1` 127.0.0.1 üzerinde
  rastgele porta açılır (boşta 90 sn zaman aşımı; sonda `/quit`). Kendi geçici dizini `%LOCALAPPDATA%\Temp\hy-r27-realprim`
  başta silinip yeniden oluşturulur — yalnız bu testin alanı. Production DB bağlantısı yok.
- **(b) SID çözümlemesi** (61–71): Windows hesap → SID, 9 vaka. Dış sisteme yazma yok.
- **(c) Canlı bölüm, yalnız `-Live`** (72–101). `pins\PINS.json` henüz olmadığı için gömülü varsayılanlar (`BUILTIN_DEFAULTS`)
  kullanılır: runtime SID, 8080/3002, RELEASE21/RELEASE22 giriş yolları, host yolu, görev adları.
  - **Görev Zamanlayıcı okuma:** `HukukPlatform-API` / `-Web` (Running, principal SID = runtime SID, action host exe + `api`/`web`
    argümanı; XML sha pinsiz aşamada karşılaştırılmaz). `HukukPlatform-CutoverWriter-R06` yükseltilmemiş token ile görünmezse
    NOT_MEASURED yazılır — PASS sayılmaz, toplamın dışındadır.
  - **Süreç/dinleyici okuma:** 8080 ve 3002'de tek dinleyici ve RELEASE21 girişi (OLD nesil); `hukuk-task-host.exe` api=1, web=1.
  - **HTTP (loopback, motorun kendi `Invoke-Http`'si):** `GET http://127.0.0.1:8080/` → 404 · `GET http://127.0.0.1:3002/` → 200 ·
    `POST http://127.0.0.1:8080/api/auth/smoke/login` gövde `{}` → 400 · `GET http://127.0.0.1:8080/api/auth/capabilities` → 200.

**Canlı etki — uygulama kaynağından doğrulandı** (`modules/auth`, `main.ts`, `app.module.ts` için RELEASE21 ↔ main farkı 0,
ÖLÇÜLDÜ; RELEASE21 → aday çalışma zamanı farkı yalnız 11 dosyadır ve bunlar auth/tenant/error-log değildir):

- `POST /api/auth/smoke/login {}`:
  - global `SmokeAuthorizationGuard` rotayı `@SmokeAllowed` ile geçirir (DB veya log yazması yok);
  - `LoginRateLimitGuard`, API **sürecinin belleğinde** loopback IP sayacını 1 artırır (pencere 60 sn, en fazla 10 deneme, aşılırsa
    5 dk blok; DB/Redis kullanmaz);
  - global `ValidationPipe` `{}` gövdesini reddeder → **400**;
  - `SmokeAuthService.login` **çağrılmaz** → DB okuma/yazma yok, token üretilmez.
- `GET /` (API) → 404. Global hata filtresi `AllExceptionsFilter` yalnız **≥500** yanıtları kalıcı yazar → 404 ve 400 için
  ErrorLog yazması **yok**.
- `GET /api/auth/capabilities` → statik bayrak (`passwordRecoveryEnabled`); DB yok.
- `TenantLifecycleInterceptor` kimliksiz istekte devre dışıdır.
- Web `GET /` → Next.js sayfası kimliksiz render edilir. Aynı istek R25 mühür (S-08d) ve motor (C-04) koşumunda da yapıldı.
- **Sonuç (ÇIKARIM, kaynaktan): canlı DB yazması 0 · restart 0 · dosya sistemi yazması yalnız paket içi.** Tek canlı durum etkisi
  API sürecindeki giriş-deneme sayacıdır (+1; bir sonraki API restartında sıfırlanır).

**Paket etkisi:** tek yazma `qualification\REAL-PRIMITIVES-RESULTS.json` (satır 106). Bu dosya kimlik tabanının **içindedir** →
koşumdan sonra `DBE6B8E5…` değişir. R25 emsalinde pencerede değişen tek dosya buydu (`REALPRIMITIVES-KIMLIK-UZLASTIRMASI-R01`).

**Mühür bağı (KAYNAK):** S-02b bu dosyada verdict PASS, failed 0, **total ≥ 29**, motor sha güncel, `productionDb=false` ve
**`liveExecuted=true`** ister. Şimdiki dosya 21/21 ve `liveExecuted=false` → -Live koşulmadan mühür durur.

**Çıkış kodları:** 0 PASS · 1 herhangi bir FAIL (dosya `failed>0` ile yazılır; S-02b reddeder, neden giderilip yeniden koşulur) ·
2 erken hata: motor ayrıştırma, fonksiyon çıkarımı ya da yerel sunucu açılamadı (dosya yazılmaz).

**Öneri:** yükseltilmiş oturumda koşulsun; CutoverWriter NOT_MEASURED yerine ölçülür. Mühür ve İ9 ile aynı dakikaya
sıkıştırılmasın (§3.6).

### 3.3 Adım 3 — Kimlik doğrulama ve onaylı kimlik (owner GO; paket yazıcısı OFFİCE 33)

Yöntem R25 emsaline dayanır (`NIHAI-C33-KIMLIGI-PREFLIGHT-BAGLAMASI-R01`, `OWNER-RUN-UZLASTIRMA-R01`) ve R27 şablonlarıyla eşlenmiştir:

1. **`PACKAGE-IDENTITY.json` -Live sonrası yeniden üretilir** (OFFİCE 33). Beklenen fark yalnız `REAL-PRIMITIVES-RESULTS.json`
   satırıdır. Ana yürütücü liste ve disk taramasıyla bağımsız yeniden hesaplar, tek dosyalık farkı kanıtlar.
2. **Ratifikasyon kayıt belgesi:** `docs/OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-20260911-R01.md` (owner onay metni).
   `postApprovalPatterns` kapsamında olduğu için kimlik tabanı dışıdır.
3. **Onaylı kimlik:** `docs/APPROVED-IDENTITY-<digest8>.json`. Dosya listesi, -Live sonrası `PACKAGE-IDENTITY` listesidir.
   `unsealedDigest` **OR-03a algoritmasıyla** hesaplanır: her `yol:sha` girdisinden sonra `\n`, sonuncusu dahil.
   immutableBase (join) değeri doğrudan yazılmaz: R25'te iki algoritmanın farklı sonuç verdiği ölçüldü; yanlış değer OR-03a'yı
   cutover anında düşürür.
4. **Çalıştırıcılar:** şablonlar köke kopyalanır ve yer tutucular gerçek değerlerle doldurulur.
   - OWNER-COMMAND: `__OWNER_RATIFICATION_REF__` ×5 → ref. Kök sha'sı `$OWNER_COMMAND_SHA`'ya yazılır.
   - OWNER-RUN (şablonda 9 yer tutucu): `$RATIF`; `$PREFLIGHT_EVIDENCE` / `$PREFLIGHT_SHA` (Adım 1 dosyası ve `.sha256`);
     `$APPROVED_DIGEST` / `$APPROVED_LIST`; `$OWNER_COMMAND_SHA`; `$POST_APPROVAL_ADDED` göreli yolları (ratifikasyon belgesi,
     onaylı kimlik). Doldurulan şablon `$POST_APPROVAL_CHANGED` ile açıkça işaretlidir; kök kopya şablonla bayt-eşittir.
   - Doldurulmamış yer tutucuda iki çalıştırıcı da **durur** (exit 90): mühür, doğrulayıcı ve cutover çalışmaz (KAYNAK).
5. **Nitelemeler yeniden koşulur:** `Test-OwnerCommandTemplate.ps1` (OC-10 gerçek ref'in paketteki kaydını arar) ve
   `Verify-Package.node.js` (mühürsüz → `PACKAGE_STATIC_VERIFIED_UNSEALED`).
6. **Ana yürütücü bağımsız doğrulaması:** OWNER-RUN'ın kendi OR-01…OR-03b satırları, OR-00 hariç, salt-okuma koşulur (R25
   yöntemi); kimlik liste ve disk eşitliği ölçülür.

Yazma yalnız paket içidir: `docs/` 2 dosya, kök `OWNER-*` 2 dosya, doldurulan OWNER-RUN şablonu, `PACKAGE-IDENTITY.json` ve
nitelemeler. Canlı etki yok. Herhangi bir uyuşmazlıkta DUR: authority henüz yoktur, tüketilen bir şey yoktur.

### 3.4 Adım 4 + 5 — Mühür → doğrulayıcı → cutover (tek owner komutu)

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "C:\Development\HUKUK_YAZILIMI\HY_C33_RELEASE22_CUTOVER_R27\OWNER-RUN.C33-RELEASE22.ps1" -Confirm "C33-RELEASE22-CUTOVER-GO"
```

Kök OWNER-RUN ve OWNER-COMMAND sha'ları Adım 3'te sabitlenir ve komuttan önce `Get-FileHash` ile doğrulanır.

**Sıra** (OWNER-RUN şablonu satırları): onay kelimesi (56) → OR-00 oturum (57) → OR-01 motor sha `52C9A220…` (59) → OR-02
preflight kanıtı sha + `.sha256` (61) → OR-03a onaylı kimlik digest'i (67) → OR-03b disk = liste, sapma 0 (82) → OR-04 claim 0
(84) → OR-04b owner-command sha (86) → **MÜHÜR** `Seal-Package.ps1 -PackageRoot <kök> -RatificationRef <ref>` (97; kullanılmamış
önceki authority varsa `-Reseal`) → OR-05 SEALED + NONCE (99) → OR-06 authority (101) → **DOĞRULAYICI**
`node Verify-Package.node.js` (104) → OR-07 `PACKAGE_VERIFIED` (106) → **OWNER-COMMAND** → motor.

**Mühür** (`Seal-Package.ps1`; KAYNAK):
- **Salt-okuma ölçüm:**
  - S-00 ref biçimi; S-01 motor ayrıştırma ve seam; S-02/S-02b nitelemeler taze (NC; gerçek primitifler canlı); S-03 claim, nonce
    ve makbuz 0.
  - S-04a/b/c: aday makbuzu; 10 kritik dosya; release worktree HEAD = aday, temiz, aday origin/main tarihçesinde. Bunun için
    kanonik depoda `git fetch origin` koşar (yalnız yerel ref güncellemesi).
  - S-05: C36 R25 makbuzu ve yedek sha.
  - **S-06** canlı bin = R21 kopyaları; S-07 görevler (+CutoverWriter); S-08a/b/**c**/d ağ, dinleyici, süreç kökleri ve HTTP probe
    (Adım 2 ile aynı 4 istek).
  - S-09 pwsh/node; S-10 kökler + RELEASE21 `.env` 25 anahtar / RELEASE22 `.env` yok; S-11 veri kökleri.
  - S-12 DB snapshot: `docker exec hukuk-postgres psql -U postgres -d hukuk_db -tA -c <SELECT>` (salt-okuma).
- **Yazar,** yalnız tüm kapılar geçtikten sonra (satır 314–328): `pins\PINS.json`; `authority\CUTOVER-AUTHORITY.json` (nonce,
  ≤30 dk pencere, tek kullanım, yükseltme şartı, `package`, `boundIdentities`); `MANIFEST.json` (payloadDigest).
- **Başarısızlık:** `SEAL_REFUSED` exit 1 → hiçbir dosya yazılmaz; OWNER-RUN exit 91.

**Doğrulayıcı:** salt-okuma; `qualification\VERIFY-RESULTS.json` yazar. REJECTED → OWNER-RUN exit 91. Authority vardır ama
claim yoktur; yeniden koşumda mühür yenilenir (reseal).

**OWNER-COMMAND** (kök kopya; şablon satırları 24–71):
- Onay kelimesi, yer tutucu, WinPS 5.1 / ConsoleHost / yükseltme kontrolü.
- MANIFEST bütünlüğü ve payloadDigest; motor sha literali ve MANIFEST eşitliği; authority motor sha ve kapsam.
- **Paket kimliği:** authority, pins ve MANIFEST `package` = R27 (53). Authority ve pins ref = owner ref (54–55). Pins aday commit
  literali (56).
- Pencere ≤30 dk ve süresi dolmamış (57–62); nonce claim/marker yok (63–64) → motor (71).
- Herhangi bir kontrolde duruş → exit 90, motor çalışmaz.

**Motor** (`engine/Invoke-C33Cutover.ps1`; metinde 33 `Gate` çağrısı):
- **P** (19 kapı, claim tüketmez, mutasyon 0): paket bütünlüğü; motor ↔ authority ↔ pins; authority bağları (P-04); aday kimliği
  (P-05/P-05b); nesil (P-06: geri dönüş kopyaları = canlı bin); görevler (P-07); runtime (P-08); DB ledger/sysId/sayımlar + yedek
  (P-09); ağ (P-10); kökler/env (P-11…P-13); araçlar (P-14); ACL preimage (P-15); kod yüzeyi (P-16); dizinler (P-17);
  writer/broker (P-18). Düşerse exit 1 `HARD_STOP_PREFLIGHT_NOT_APPLIED` (claim yok, mutasyon 0).
- **B:** `claims\CLAIM-<nonce>.json` (CreateNew) → nonce tüketildi.
- **H** (release-yerel): RELEASE22 `.env` = RELEASE21 `.env` baytları (CreateNew); RELEASE22 kökü IMMUTABLE_RELEASE ACL. Canlı
  kök ve bin ACL'leri yalnız doğrulanır.
- **C:**
  1. `HukukPlatform-API` / `-Web` Disable + Stop; dinleyici 0 olana kadar beklenir (≤90 sn, force-kill yok).
  2. `C:\Ops\hukuk\bin` host + 2 launcher atomik `File.Replace` ile değişir (preimage tam → postimage tam).
  3. Enable + Start; C-03 API (tek dinleyici/node/host; `/` 404; capabilities 200; smoke login 400; provision loopback) ve
     C-04 Web (`/` 200; BUILD_ID `_buildManifest` 200).
- **V:** ağ, DB snapshot değişmedi, görevler, env, PRE-01/06/07/08 → COMMIT (exit 0).
- **R-01** (H/C/V'de bir kapı düşerse):
  - yeni süreçler durur;
  - bin preimage 3/3 `generations\R21`'den geri yazılır;
  - RELEASE22 `.env` sha eşitse kaldırılır; ACL preimage geri yazılır; eski görevler başlar.
  - Doğrulanırsa exit 2 `ROLLBACK_COMPLETE` (nonce tüketildi). Doğrulanamazsa exit 3 `STATE_UNCERTAIN`: elle kurtarma, otomatik
    tekrar veya reseal yok.
- **DB yazması: 0.** Motor DB'ye yazmaz; P-09 ve V-01 yalnız okur.

**Kesinti:** API+Web **~15–60 sn** (R23 14,7 · R24 13,7 · R25 57,6 sn). Üst sınır quiesce 90 + start 240 sn. Rollback süresi
ölçülmedi. Web BUILD_ID değişir.

**Çıkış kodları:** 0 APPLIED_AND_VERIFIED · 1 PREFLIGHT_NOT_APPLIED · 2 ROLLBACK_COMPLETE · 3 STATE_UNCERTAIN · 70 makbuz ·
90 OWNER-COMMAND durdu · 91 OWNER-RUN durdu. Pencere 30 dk'dır: dolarsa ve claim yoksa OWNER-RUN yeniden koşulur (reseal,
yeni nonce). Tüketilmiş nonce ile yeniden koşum **yasaktır**.

### 3.5 Adım 6 — Teknik ve hedefli kabul

Bkz. §6. Her canlı yazan kabul ayrı owner GO ister.

### 3.6 Canlı giriş-deneme bütçesi (KAYNAK)

Loopback `POST /api/auth/smoke/login` çağrıları: Adım 2 (1), mühür S-08d (1), motor P-08 (1, eski süreç), motor C-03 (1, yeni
süreç, taze bellek). Sınır 60 sn'de IP başına 10 deneme; aşılırsa 5 dk blok. İ9 koşumu 3 login kullanır. Bu adımlar aynı dakikaya
sıkıştırılmaz. Blok oluşursa 5 dk beklenir; kalıcı etki yoktur.

## 4. Kimlik zinciri — adımlar boyunca

| Aşama | Kimlik değeri | Ne değişir |
|---|---|---|
| Şimdi (hazırlık) | immutableBase `DBE6B8E5D8E18C85F2AA857944125FBDF277F1B8EEC39D3FAF9017C9D3E3516A` | — |
| Adım 1 | aynı (`preflight/` taban dışı) | preflight kanıtı eklenir |
| Adım 2 | **yeni** immutableBase | yalnız `qualification/REAL-PRIMITIVES-RESULTS.json` |
| Adım 3 | aynı taban + `APPROVED-IDENTITY` `unsealedDigest` (OR-03a algoritması) | onay kaydı; doldurulan OWNER-RUN şablonu `POST_APPROVAL_CHANGED` ile işaretli |
| Adım 4 | `MANIFEST.payloadDigest` (pins/authority dahil tüm paket) | mühür |
| Adım 5 | claim/journal/makbuz (MANIFEST dışı) | cutover |

## 5. RELEASE21'e geri dönüş bağları

| Bağ | Değer |
|---|---|
| Hedef | `HY_W4_RELEASE21` @ `2187a78b1621f168605920cdffccb17381dc171a` — şu an CANLI (ÖLÇÜLDÜ) |
| Girişler | API `main.js` `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` · Web `next` `AFEE236A880DA3AC64CAB43A4DB016B73E55209B241DA7453690DC3EC43837A3` · BUILD_ID `g91HUaBesekB-R2rRawQj` |
| bin preimage = `generations/R21` = canlı bin (ÖLÇÜLDÜ) | host `1397C54C46D4E9979A79C929959129D54954F8CE36B7CFB333ED88C2522F9F22` · `start-api.ps1` `4ACA26CD6006B0D6B5D0B06166FE60AEA05973B2F668E642C667D914076496A1` · `start-web.ps1` `DA62DD2D507537A8E1A6495E82D163D315A56DBE97189007411D803F2AB5D531` |
| Kök bütünlüğü | mühürlü defterle 88.132/88.132 birebir (P-031); düşen 4 kapı bilinen (3 git + canlı `.env`) — #2616 |
| RELEASE21 aday paketi | packageDigest `851C07DFCD2C6FBBA3A705840A401D4E8693A8F75BA62EE964C8763200B84A22` (yeniden hesapla eşit) |
| `.env` kaynağı | RELEASE21 `.env` mevcut, 25 anahtar; RELEASE22 `.env` yok (ÖLÇÜLDÜ). Kaynak hash'i mevcut R27 kaydında (§6) kalır; içerik paylaşılmaz |
| Mühür kapıları | S-06 (canlı bin = R21 kopyaları) ve S-08c (canlı süreçler RELEASE21 girişlerinden): kaynak incelemesi + çalıştırılmış kapı PASS (#2615, #2616) |
| Motor kapıları | P-06 (geri dönüş kopyaları = canlı bin, bayt-tam) · R-01 (otomatik geri dönüş) |
| Elle kurtarma | yalnız exit 3'te; sha ve ACL korumalı blok: `RELEASE22-R27-CUTOVER-PAKETI-R01.md` §8 |
| Veri | migration yok → geri dönüşte DB adımı yok. Yeni sürümün yazdığı veriler (ör. AK-2 audit satırları) kalır |

## 6. OFFICE / CLIENT İ9 kabul kapsamı

### 6.1 Teknik yayın kabulü (salt-okuma, cutover makbuzu altında)

Betik: `RELEASE22-R27-CUTOVER-PAKETI-R01.md` §10.1. Beklenen:
- iki port `kok=HY_W4_RELEASE22`; eski PID 50716/22440 yok;
- bin `E744A74B…` / `77B6FBCD…` / `1B7654F6…`;
- `BUILD_ID=xJZ1G1TsbOnHoWUzMD8CQ`, `_buildManifest` 200, API `/` 404;
- işaret **satır** sayıları 3 · 3 · 3 · 1 · 2 · 5 · 1 · 1 (geçiş sayımı iki politika jetonu için 4);
- migration defteri 130/130 değişmedi; API → 5432 ESTABLISHED; makbuz `dbMutations 0`.

İşaret yoksa ya da sayı farklıysa **DUR**: yama canlıda değildir.

### 6.2 Düzeltme kabulleri

| Kalem | Cutover öncesi (aday dist + disposable PG; canlı yazma 0) | Cutover sonrası (canlı; ayrı owner GO; sentetik tenant) |
|---|---|---|
| CLIENT B-1 #2609 | yamalı derlemeyle İ9 provası PASS 14/0/0 (A-8a 200) | `pureNoOpDetected` satır 3 → İ9 canlı koşumu (§6.3) |
| AK-2 #2599/#2602 | yetkisiz ayrıcalıklı create ve pasif ayrıcalıklı yeniden etkinleştirme → 403 + yazma 0; ADMIN/bağlı PARTNER → 201 + aynı tx audit | dist işaretleri; işlevsel denetim yalnız owner GO + sentetik tenant (audit satırı kalıcı) |
| AK-1a #2604 | bağlı VIEWER F01 yazma → 403 `OFFICE_WRITE_DENIED_VIEWER`; okuma 200 | owner GO + sentetik tenant |
| AK-1a eki #2606 | VIEWER genel kutu kararı → 403; FD ofis/içerik onayı → 403 `DISCLOSURE_APPROVAL_NOT_ELIGIBLE` | **yalnız dist işaretleri** — FD senaryoları canlıda koşulmaz |
| CLF-O0-01 #2608/#2612 | FD talebinde genel kutu `request-revision` ve sahibi `cancel` → 409 `DOMAIN_ACTION_REQUIRED`, yazma 0; sahibi olmayan cancel → 403 | dist işareti `assertGenericDecisionAllowed` satır 5; canlıda FD talebi üretilmez |

### 6.3 CLIENT İ9 (`client-live-acceptance-i9-r01`, paket `d6c51ca0`)

- **Ölçütler:**
  - MUTATION_AUTHORITY: İ8 U-1'den devralındı; tekrarlanmaz.
  - #2552-a/b/c/d: kimlik `reasonCode`.
  - A-0: üç uç, yalnız anonim; 401 dışı sonuçta koşum DURUR.
  - A-7 ve pozitif kontrolü.
  - **A-8:** B-1 düzeltmesiyle beklenen **200**.
- **Ön koşul:** canlı dist'te `pureNoOpDetected` satır sayısı 3.
- **Canlı yazma envanteri** (İ9 belgesi §5):
  - İ9'un **kendi** sentetik tenant'ında 8 INSERT (tek transaction);
  - 1 UPDATE (Client D reaktivasyonu);
  - kapanışta 3 UPDATE (`User.isActive=false` + `tokenVersion++`).
  - Ürünün kendi audit satırları kalır; DELETE yok; gerçek tenant'ta yalnız GET.
- **Komut:** İ9 belgesi §9. `CL_OWNER_GO_REF = OWNER-GO-CLIENT-I9-YYYYMMDD-Rnn`.
  - `CL_PRISMA_ROOT` ve `CL_BCRYPT_PATH` belgede RELEASE21 kökünü gösteriyor. Şema ve bağımlılık farkı 0 olduğu için geçerlidir
    (ÇIKARIM); GO kaydında RELEASE22 kökü de seçilebilir.
- **Sayaç:** 8/17 → 9/17 **yalnız** canlı PASS'ten sonra; hizmet kabulü 0/8 tam kalır.

### 6.4 OFFICE

Geçmiş kabuller (O-1…O-10, A-03…A-06, **A-07**) geçerlidir. A-07 yeniden koşulmaz; fixture tüketildi. Aday OFFICE'e yalnız
yeni retler getirir (#2614 §7.4).

## 7. FD kurtarma incelemesi — sonuç (#2614 §6, owner GO ile yapıldı)

- **Kim çağırabilir:** JWT'li ve kayıttaki karar vericinin kendisi olan kullanıcı, `CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED='true'`
  iken. Karar vericinin bugünkü rütbe/delege yüklemi denetlenir. **Çağıranın güncel rolü denetlenmez.**
- **Hangi kararı uygular:** yalnız düz APPROVED `OfficeApprovalRequest`; `approverUserId` ve `decidedAt` dolu; talep sürüme bağlı;
  snapshot hash birebir; sürüm hâlâ `OFFICE_APPROVAL_PENDING`. Karar sürüme aynen taşınır; ikinci çağrı idempotenttir.
- **Karar anındaki yetki:** hiçbir yerde kayıtlı değil → **BİLİNMİYOR**. Bugünkü rolden geçmiş yetki çıkarılmadı.
- **Canlı ölçüm** (salt-okuma, yazma 0): kurtarma adayı 0; VIEWER etkisi 0; rol geçmişi kaydı 0 → **bugünkü etki 0**.
- **Öneri** (uygulanmadı; owner kararı; yayını engellemez):
  - P1: #2606'daki karar anı rol kapısı kurtarmaya da uygulansın.
  - P2: karar anındaki yetki çıkarılmasın.
  - P3: karar audit'i rol ve rütbe anlık görüntüsünü yazsın.

## 8. Kalan kararlar (owner)

1. Ratifikasyon: `OWNER-RATIFICATION-C33-RELEASE22-CUTOVER-20260911-R01`'in kaydı (Adım 3'teki belge).
2. Adım 1 ve 2'nin koşumu (owner, yükseltilmiş oturum).
3. Adım 3 onayı; işlemleri paket yazıcısı OFFİCE 33 yapar.
4. Adım 4+5 cutover GO (tek komut, 30 dk pencere).
5. Adım 6 canlı kabul GO'ları: düzeltme kabulleri (sentetik tenant) ve İ9 (`CL_OWNER_GO_REF`).
6. Açık politikalar (değişmedi):
   - FD kurtarma P1–P3;
   - AK-1b/1c; VIEWER yürütme yolları; CASE düzeyi VIEWER;
   - B-2; `/cases` ön kontrol yarışı; ofis oto-oluşturmanın transaction dışında kalması; seed'in OFFICE dışı uçları;
   - host denetlenebilirlik açığı (ERRATUM §5).
7. RELEASE21 `.env` hash'i mevcut R27 kaydında kalır (owner kararı 2026-09-11).
8. Bilinen sınır (R25'ten): OWNER-RUN OR-06 kendi girdisini doğrular; ref'in bağımsız kontrolü OWNER-COMMAND satır 54–55'tir ve
   mutasyondan önce koşar.

## 9. Sınır beyanı

```text
BU TURDA: mühür 0 · authority/nonce 0 · Test-RealPrimitives -Live 0 · APPROVED-IDENTITY 0 · cutover 0 · canlı kabul yazması 0
R27 PAKETİ = YAZILMADI (kimlik yeniden hesaplandı: DBE6B8E5… liste ve disk eşit) · R26 = DEĞİŞMEDİ
CANLI = YALNIZ OKUNDU (dinleyici/PID/komut satırı kökü, bin hash, .env anahtar ADI sayısı) · NEW EXECUTION AUTHORITY = NONE
```

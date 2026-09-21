# R26 — SON YAYIN PAKETİ (R02) · API + WEB · #2740 DAHİL · iç ağ

> **DURUM: HAZIR — CANLIYA UYGULANMADI.** Bu belge R01'in yerini alır; R01 tarihsel kayıttır. Canlı uygulama, owner bu
> paketi kimliğiyle onaylayıp GO verdikten sonra başlar.
> **Kapsam dışı:** internet erişimi (kenar/DNS/`.env` anahtarı) ve hizmet kabulü. Teknik sayaç **18/18**, hizmet kabulü **0/8**.

## 1. Aday kimliği

| | Değer |
|---|---|
| Kaynak | **`c7a154b3c0728fee7618ca65e54898ed02cc8b3b`** — dal `release/r26-candidate` (origin'de) = `47fcf395` + #2740 (`799a7346`'dan birebir: `auth-context.tsx` + 2 spec) |
| Kaynak zinciri | `4443600a` (R25B'yi bit-bit üreten kaynak) → + #2739 web + #2738 `portal.service` (`47fcf395`) → + #2740 (`c7a154b3`) |
| **API** (`dist/apps/api/src`, 3867 dosya) | **`A8B17A38327975C71DDAE82FE33D1E97CB8B339FB1E35D1828FCF8D0CEB053A0`** — R01'den DEĞİŞMEDİ (#2740 yalnız web) |
| API taban (canlı R25B) | `1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E`; fark yalnız 2 dosya: `portal.service.js` `F5537058…4E48`, `.js.map` `E3DD7D02…965A` |
| **WEB** `.next` (505 dosya; `cache/` ve `trace` hariç) | **`C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326`** · BUILD_ID **`5waeMoFGGMTLAYmn9oJvW`** |
| WEB taban (canlı) | `F064DC95CBCCA6218E8D5E84A89A6472F03AF54994E425E28A02B135956282F1` · BUILD_ID `dOiGPj2M0Abls0kCibY4r` |
| `next.config.js` aday / canlı | `C43DEB5A…5B5C` / `4AD4915C…F750` (R01'den değişmedi) |
| Kaynak eşitliği | Aday web ürün kodu `799a7346` web'i ile **fark 0** (testler hariç); canlı web kaynağı `2740df3d`'den fark = #2739 + #2740 |
| Derleme | `next build` 0 (`NEXT_PUBLIC_API_URL`/`API_INTERNAL_URL` tanımsız); API derlemesi R01'deki (`nest build` 0) |

**Dahil:** #2739 (aynı origin + K-A + K-B) · #2738 (`PUBLIC_PORTAL_BASE_URL`) · **#2740 (OFFICE-AUTH-01)**.
**Dahil değil:**
- #2716 replay adapter;
- **#2727 migration** (aday migration farkı 0; `migrate deploy` YOK);
- #2730: davranışı değiştirmiyor, `trust proxy=1` canlıda zaten var;
- #2737: CI ile ilgili, ürün kodu değil;
- #2742: yalnız doküman.

## 2. Etkilenen akışların doğrulaması — SON web adayıyla (yalnız etkilenenler)

Tamamlanmış program yeniden test edilmedi. Önceki kanıtlar geçerlidir: R01 §3'teki 14/14 prova ve API portal testleri, çünkü API
değişmedi. #2740'ın kendi CI kaydı `799a7346` üzerindedir (9/9; main CI SUCCESS).

| Akış | Ölçüm (aday `5waeMoFG`, disposable API, kenar = Caddy şablonu) | Sonuç | Kanıt sha256 |
|---|---|---|---|
| Etkilenen web testleri | `auth-context-portal-delegation` + `auth-context-redirect` | 23/23 PASS | — |
| **Personel davet/parola sayfaları** (OFFICE-AUTH-01) | Girişsiz gerçek tarayıcı: `/auth/forgot-password`, `/auth/reset-password#token=…`, `/auth/accept-invite?token=…` **yerinde kalır**. Kontrol olarak `/auth/login` ve `/auth/account-recovery` de yerinde | PASS (önceki aday ve canlı: `/auth/login`'e yönleniyordu) | `office-auth-obs-r26b.json` `731BB418…EE5C` |
| **Başarılı portal girişi** | `r26-live-portal-login.js`, B2'nin canlıda koşacağı betiğin kendisi, disposable'da. İki adreste (localhost ve localhost olmayan host) giriş 201 → token → `/portal` → `/api/portal/cases` 200 AYNI ORIGIN. Engellenen istek 0. Kapanış sonrası giriş 401. İzolasyon değişmedi | **6/6 PASS** (runId `cff0713e`) | `r26b-pl-evidence-cff0713e.json` `CFF4C73B…2438` |
| **Anonim intake** | Form açılır, gönderilir ("Teşekkürler", POST 201 aynı origin). 8080'e istek 0. DB: doğru tenant/dosya/müvekkil, `CLIENT_SUBMITTED`, ipHash istemci IP'si, bağlantı USED, tekrar 404 | 3/3 + 4/4 PASS | `edge-intake-r26b.json` `F7CA08C7…792A` · `edge-db-verify-r26b.json` `B5719E06…D85E` |
| Dar kabul betiği (aday, :3012, canlı API'ye yalnız GET + başarısız giriş) | DK-2…DK-6 PASS (yeni DK-6 dahil). DK-1'de sayfa doğru; tek FAIL 3012'deki bilinen CORS yan etkisi (canlı API yalnız `localhost:3002` kaynağına izin verir, 3002'de 404 döner). Engellenen istek 0 | beklenen | `r26b-dar-kabul-cand3012.json` `629D2DC1…85C0` |

Kanıt dizini: `C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911\r26b-affected-flows-20260922\`.

## 3. B0 → B1 → B2 ne yapar

| Blok | Pencere | Ne yapar | Canlıya etkisi |
|---|---|---|---|
| **B0** SelfTest | normal | Yardımcıları, aday ve canlı kimliklerini (API/web/cfg/BUILD_ID), başlatıcı üçlüsünü, `.env` sha'sını, ACL modelini ve dinleyicileri ölçer | **Yok** (salt okuma) |
| **B1** Yayın | **yükseltilmiş** | Kapılardan sonra şu sırayla çalışır: <ul><li>doğrulanmış yedekler + web hazırlık kopyası (canlı çalışırken);</li><li>WEB, sonra API durdurulur;</li><li>API'de 2 dosya ve web'de `.next` yeniden adlandırılarak takas edilir, `next.config.js` kopyalanır (silme yok);</li><li>durmuşken kimlik kontrolü;</li><li>API başlatılır (401 uçları + boot log `Mapped`);</li><li>WEB başlatılır (`/portal/login` 200, buildManifest 200, `/intake/x` 200, rewrite `/api/auth/me` 401);</li><li>kapsam kontrolü (digest'ler, `.env`, başlatıcı üçlüsü **değişmedi**, görev eylemleri).</li></ul>Herhangi biri tutmazsa **API ve WEB birlikte otomatik geri alınır** | API ve web kısa süre durur; DB'ye yazma yok; migration yok |
| **B2** Dar canlı kabul | normal | **(A)** `r26-dar-kabul.js after`: DK-1…DK-6. Salt okuma; çıkış 0 değilse DURUR, GO ref sorulmaz. <br>**(B)** GO ref yerel girilir, sonra `r26-live-portal-login.js` çalışır: <ul><li>sentetik tenant ve portal hesabı kurulur (ilk yazma);</li><li>**BAŞARILI portal girişi** gerçek tarayıcıda localhost ve makine adıyla yapılır; dosya listesi 200;</li><li>`finally`de erişim kapanışı ve izolasyon.</li></ul>GO ref tüketim kaydı yalnız sha olarak tutulur | Yalnız sentetik tenant'a yazar ve kapatır. **API 401'i başarılı girişin yerine geçmez** |
| B2-R Kurtarma | normal | Yalnız B2 çıkışı 5 ise (kapanış doğrulanmadı): `i16-live-recover.js`; kimlik bağı yoksa sıfır yazma | Sentetik kapanış |
| B3 Elle geri dönüş | yükseltilmiş | Yedek kimliği doğrulanır. Sonra API ve web birlikte R25B'ye döner (silme yok) | API ve web kısa süre durur |

## 4. Tam hash'li komutlar (merge sonrası kanonik yol)

Betik dizini: `D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\`.
`core.autocrlf=false`; pinler merge sonrası kanonik checkout'ta yeniden doğrulanır.

| Betik | sha256 |
|---|---|
| `r26-release.ps1` | `A10EA04A002E85E75C31735089052A8202E3BE3D9FB7BF0A5BE4ACED0AF82F39` |
| `r26-rollback.ps1` | `43C1202F24A6C5CD8BCB3C59B44724E9EADF1E487BC9141875A28E41FF435686` |
| `r26-live-accept-block.ps1` | `4A218FA03425FC52353A1C7F3D4D90D164811E5AAB48A0034B33321215F66E2A` |
| `r26-dar-kabul.js` | `A4DBEC1E74E0DF1D66BAD578DACD9E9C6042046BD5146FD36DEF34E02F63B80D` |
| `r26-live-portal-login.js` | `E3CCB31FA566E4669A132F8B1BF8ED9AAF6EC29C809FE7DB177339E2655E0D63` |
| B2 paket digest'i (bloğun içinde pinli; portal-login + dar-kabul + i13/i3/ah/i12 kütüphaneleri) | `7142C952F2D55EB54472EB14A496749618BA19FB608163107228F9B7C72B7797` |
| `i16-live-recover.js` (B2-R) | `F7BBF57DA36BC278A31331309EAE5AB9E50C8FCE169F79B2D867D88D452DAB3C` |

**B0 — SelfTest (normal pencere):**
```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\r26-release.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'A10EA04A002E85E75C31735089052A8202E3BE3D9FB7BF0A5BE4ACED0AF82F39'){ throw 'R26 YAYIN BETIGI SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -SelfTest; $rc=$global:LASTEXITCODE; 'SelfTest cikis=' + $rc; if($rc -ne 0){ throw 'SelfTest PASS degil - YAYIN BASLATILMAZ' }; $g='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\r26-live-accept-block.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $g).Hash -cne '4A218FA03425FC52353A1C7F3D4D90D164811E5AAB48A0034B33321215F66E2A'){ throw 'R26 B2 BLOK SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $g -SelfTest; if($global:LASTEXITCODE -ne 0){ throw 'B2 SelfTest PASS degil - YAYIN BASLATILMAZ' } }
```

**B1 — Yayın (YÜKSELTİLMİŞ pencere; B0 PASS sonrası):**
```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\r26-release.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'A10EA04A002E85E75C31735089052A8202E3BE3D9FB7BF0A5BE4ACED0AF82F39'){ throw 'R26 YAYIN BETIGI SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'YAYIN cikis=' + $rc; if($rc -ne 0){ throw 'YAYIN PASS DEGIL - KANIT satirindaki JSON verdict alanina bakilir (ROLLBACK = otomatik geri alindi; ROLLBACK-DOGRULANAMADI / ROLLBACK-ENGELLENDI = B3)' } }
```

**B2 — Dar canlı kabul (normal pencere; B1 `YAYIN PASS` sonrası; GO ref istem geldiğinde YEREL girilir):**
```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\r26-live-accept-block.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '4A218FA03425FC52353A1C7F3D4D90D164811E5AAB48A0034B33321215F66E2A'){ throw 'R26 B2 BLOK SHA UYUSMUYOR - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f; $rc=$global:LASTEXITCODE; 'B2 cikis=' + $rc; if($rc -ne 0){ throw 'B2 PASS DEGIL - kanit dizinindeki goref-consumed.json exitCode okunur (5 = kapanis dogrulanmadi -> B2-R)' } }
```

**B2-R — Kurtarma (yalnız B2 çıkışı 5 ise; `<runId>` B2 çıktısındaki RUNID):**
```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-live-acceptance-i16-r01\scripts\i16-live-recover.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'F7BBF57DA36BC278A31331309EAE5AB9E50C8FCE169F79B2D867D88D452DAB3C'){ throw 'KURTARMA BETIGI SHA UYUSMUYOR - DUR' }; $rid='<runId>'; if($rid -cnotmatch '^[0-9a-f]{8}$'){ throw 'runId 8 hex degil ya da yer tutucu - DUR' }; $rel='C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project'; $l=@([IO.File]::ReadAllLines("$rel\apps\api\.env") | Where-Object { $_ -match '^\s*DATABASE_URL\s*=' }); if($l.Count -ne 1){ throw 'DATABASE_URL satiri 1 degil - DUR' }; $env:AH_DATABASE_URL=($l[0] -replace '^\s*DATABASE_URL\s*=\s*','').Trim().Trim('"').Trim("'"); $env:AH_PRISMA_ROOT="$rel\node_modules\.pnpm\@prisma+client@5.22.0_prisma@5.22.0\node_modules\@prisma\client"; $env:I16_LIVE_CONFIRM='1'; $env:I16_LIVE_GO_REF='R26-B2-KURTARMA'; $env:I16_RECOVER_RUNID=$rid; try { & node $f; 'KURTARMA cikis=' + $LASTEXITCODE } finally { Remove-Item Env:AH_DATABASE_URL,Env:I16_LIVE_GO_REF,Env:I16_RECOVER_RUNID -ErrorAction SilentlyContinue } }
```

**B3 — Elle geri dönüş (YÜKSELTİLMİŞ; yalnız gerekirse; yer tutucular B1 kanıt JSON'undaki `api.backup` / `web.backup`):**
```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r26-r01\scripts\r26-rollback.ps1'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne '43C1202F24A6C5CD8BCB3C59B44724E9EADF1E487BC9141875A28E41FF435686'){ throw 'R26 GERI ALMA BETIGI SHA UYUSMUYOR - DUR' }; $api='<api.backup>'; $web='<web.backup>'; if($api -like '<*' -or $web -like '<*'){ throw 'yer tutucu doldurulmadi - DUR' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -BackupApiDir $api -BackupWebDir $web -SelfTest; if($global:LASTEXITCODE -ne 0){ throw 'yedek kimligi dogrulanamadi - GERI ALMA BASLAMAZ' }; $global:LASTEXITCODE=-999; & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $f -BackupApiDir $api -BackupWebDir $web; $rc=$global:LASTEXITCODE; 'GERI ALMA cikis=' + $rc; if($rc -ne 0){ throw 'ROLLBACK DOGRULANAMADI - ESCALATE' } }
```

**Sınanan:**
- **Yayın betiği:** SelfTest WinPS 5.1 ve pwsh 7'de PASS; üçlü `P1-ONCESI` okundu.
- **Geri dönüş betiği:**
  - Canlı kopyasından yapılmış sahte yedekle SelfTest PASS, bozuk yedekle FAIL.
  - Yükseltilmemiş pencerede gerçek koşum kapıda DUR veriyor.
- **Üçlü tespiti 4/4 doğru:** canlı → `P1-ONCESI`; yalnız start-api → TANIMSIZ; yalnız host → TANIMSIZ; ikisi birden → `P1-SONRASI`.
- **B2 SelfTest:** PASS (paket digest'i eşit, araçlar var, canlı henüz R25B olarak doğru okundu).
- **B2 yayın öncesi gerçek koşum:** kapıda DUR; GO ref sorulmadı, kanıt dizini açılmadı, yazma yok.
- **B2'nin portal girişi betiği:** disposable ortamda 6/6 PASS.

## 5. OFFICE A3/P1 başlatıcı paketiyle yayın sırası — KESİN

**P1 henüz UYGULANMADI** (ölçüm: canlı `start-api.ps1` `CC634BBF…`, host `691BC146…`, web `F39F7A54…` = `P1-ONCESI`).
P1 paketi yerel `HY_P1_A3_codex\P1-delivery` klasöründe: hazırlık tamam, kurulu aday mühürü ve canlı kabulü açık,
repo'da/main'de değil. P1 yalnız `start-api.ps1` (→ `DDCCD091…`) ve host exe (→ `27099BDF…`) dosyalarını değiştirir;
web başlatıcısı, uygulama dosyaları, `.env` ve migration değişmez.

**R26 betikleri eski pinlerle kalmadı.** `r26-release.ps1` ve `r26-rollback.ps1` artık tam olarak iki tanımlı başlatıcı
üçlüsünü kabul ediyor, `P1-ONCESI` ve `P1-SONRASI`. Host exe de kontrol ediliyor (önceden hiç kontrol edilmiyordu). Yarım
P1 (ör. yalnız start-api ya da yalnız host değişmiş) **DUR** verir. Üçlü, yayın ya da geri dönüş boyunca değişmemelidir;
kanıtta hangi üçlünün ölçüldüğü yazılır.

**Seçilen sıra: R26 → P1.** Pencereler münhasır; çakışan yazıcı ya da yeniden başlatma yok. Gerekçe: R26 hazır ve
mühürlü, P1'in kurulu aday mühürü açık. İki paketin durdurma/başlatma sırası aynı (WEB sonra API durur; API sonra WEB başlar).

| Adım | Pencere | Beklenen üçlü | Uygulama kimliği |
|---|---|---|---|
| 1. R26 B0 → B1 → B2 | R26 münhasır penceresi | `P1-ONCESI` (P1 sonrasında da geçerli; bu sırada P1-ONCESI beklenir) | Önce R25B API `1524EDC1` / web `dOiGPj2M` → sonra **R26 API `A8B17A38` / web `5waeMoFG` (`C17E7B13`)** |
| 2. P1 (OFFICE) | Ayrı münhasır pencere, R26 B2 kapandıktan sonra | Önce `P1-ONCESI` → sonra `P1-SONRASI` | P1 **R26 kimliğini korur**: API `A8B17A38`, web `C17E7B13`/`5waeMoFG`, cfg `C43DEB5A`. P1 geri alması yalnız host/launcher çiftini döndürür |
| R26 geri dönüşü P1'den sonra gerekirse | B3 | `P1-SONRASI` kabul edilir | R25B'ye döner; başlatıcıya dokunmaz |
| P1 R26'dan önce uygulanırsa (seçilmedi) | — | R26 betikleri `P1-SONRASI`'nı kabul eder, **uyumsuz sıra oluşmaz** | — |

**P1 → R26 geçiş devri (P1 teslimindeki `R26-HANDOFF.md`'nin istediği tek yanıt):** seçilen sıra R26 → P1, münhasır
pencerelerle. İleri betik `r26-release.ps1` `A10EA04A…2F39`, geri betik `r26-rollback.ps1` `43C1202F…5686`; ikisi de
her iki sırada geçerli. Devir anındaki beklenen üçlü `P1-ONCESI` (`CC634BBF…` / `691BC146…` / `F39F7A54…`). Devir anındaki uygulama kimliği: API `A8B17A38…53A0`, WEB `.next` `C17E7B13…5326`, BUILD_ID `5waeMoFGGMTLAYmn9oJvW`, `next.config.js` `C43DEB5A…5B5C`.
P1'den sonra R26 geri dönüşü `r26-rollback.ps1` ile `P1-SONRASI` altında yapılır; P1'in çift geri alması R26 dosyalarına
dokunmaz. Bu yanıt owner üzerinden iletilir ve canlı yetki vermez.

**OFFICE C123 (#2742, açık PR) ile ilişki:**
- C123 kapıları dosya bazında pinli (`c-dist-pins.json`): 8 dosya, hepsi C1/C2/C3 dosyası. R26'nın değiştirdiği `portal.service.js` bu listede yok.
- R26 sonrasında da geçerli; ayrıca `trust proxy` davranışı değişmiyor.
- C123'ün canlı koşumu (ayrı GO) R26 ya da P1 pencereleriyle **çakışmaz**; kendi münhasır penceresinde koşar.

## 6. Tek karar tablosu — A3 · C1 · C2 · C3 · H8

Tarihsel OFFICE kapanışı (2026-09-10) bu kalemlerin kabulü **sayılmaz**; kanıtı olmayan kalem kapanmış sayılmaz.
Daha önce verilmiş kararlar tekrar istenmez.

| # | Eksik davranış / kanıt | Önerilen karar | Tamamlanma koşulu |
|---|---|---|---|
| **A3** başlatıcı DB yeniden deneme (#2681) | Canlıda eski başlatıcı (`CC634BBF…`): kodsuz `exit 23` hâlâ PT15M beklemeye düşer. P1 paketi hazır; kurulu aday mühürü ve canlı kabulü **yok** | P1'i **R26'dan sonra** ayrı münhasır pencerede uygula (§5) | P1 Preflight taze PASS · kurulu api/web mühürleri çıkış 0 · iki servis kimliği + sağlık + tek örnek · canlı üçlü `P1-SONRASI` · R26 uygulama kimliği korunmuş |
| **C1** `POST /cases` atomikliği (#2641 + #2645) | Kod canlıda (dosya pinleri `c-dist-pins.json`); **işlevsel canlı senaryo yok**. C123 paketi izole provada 33/33 PASS, canlıda koşulmadı | #2742'yi merge et; C123 canlı koşumunu ayrı GO ile yap. **Karma kanıt yöntemi (Ö-1)** hâlâ owner onayı bekliyor | C123 canlı koşumu C1 satırlarında PASS + kapanış (c-99-close) doğrulandı + Ö-1 kararı kayıtlı |
| **C2** VIEWER onay sınırı (#2606) | Kod canlıda; **VIEWER aktörle canlı ret senaryosu yok** | C123 canlı koşumu (C2 satırları) | C2 satırları canlıda PASS (VIEWER 403 + yazma 0) + kapanış doğrulandı |
| **C3** CLF-O0-01 / FD (#2608 + #2612) | Kod canlıda; **FD senaryoları canlıda koşulmadı**; üç ayrı kişi gerekir | Owner kararı (#2742 Ö-2/Ö-3/Ö-7): FD canlıda koşulacak mı (üç sentetik aktör, yazma bayrağı, outbox etkisi) ya da "canlıda koşulmaz" kaydı kabul mü | Ya C123 FD satırları canlıda PASS + kapanış, ya da tarihli owner kaydı "FD canlıda koşulmaz — CI + izole prova kanıtı kabul" |
| **H8** "kilit ≤ 4 sn" kapsam cümlesi | Açıklama düzeltmesi **yapıldı** (transaction + `FOR NO KEY UPDATE` + koşullu `updateMany`; betik bütçesi ≠ ürün süre taahhüdü). Kapsam cümlesi **DEĞİŞTİRİLMEDİ** | Owner: önerilen metni (F04 paketi §A, uygulanmadı) kabul et / reddet / düzelt | Owner'ın tarihli kararı + F04 paketinde metin güncellemesi (ya da mevcut hâli bilinçli korunur kaydı) |

## 7. Ortak CLIENT–OFFICE finali — kalan KESİN adımlar

| Sıra | Adım | Sahibi | Kapı |
|---|---|---|---|
| 1 | Bu paketin PR'ı → CI → merge → merge SHA'sında main CI SUCCESS | CLIENT | — |
| 2 | **R26 canlı GO** (bu paket) | **Owner** | — |
| 3 | B0 → B1 → B2 (münhasır pencere: 4 yürütücü açık teyidi) | Owner koşar; CLIENT bağımsız doğrular | B1 `YAYIN PASS`; B2 çıkış 0 |
| 4 | R26 kayıt PR'ı (bağımsız doğrulama + B2 kapanış doğrulaması) | CLIENT | main CI SUCCESS |
| 5 | P1 (A3) canlı penceresi | OFFICE + owner GO | §6 A3 koşulu |
| 6 | #2742 merge + C123 canlı koşumu (C1/C2; C3 owner kararına göre) | OFFICE + owner GO | §6 C1/C2/C3 koşulları |
| 7 | H8 metin kararı | Owner | §6 H8 |
| Ayrı | Dış erişim (alan adı/DNS/yayın imkânı) | Owner bilgi + ayrı GO | `client-external-access-r01` |
| Ayrı | Hizmet kabulü 0/8 | Owner, hizmet başına | — |

## 8. Şeffaflık

- R01'deki şeffaflık notları geçerli: canlı API'ye en fazla 4 kimliksiz GET gitmiş olabilir; kanca atlatma ihlali geri alındı.
- Bu turda canlıya giden tüm tarayıcı istekleri ya engellendi ya da yalnız GET ve var olmayan e-postayla başarısız giriş oldu. Engellenen sayısı ölçüldü.
- `HY_WT_R26` (aday kaynağı ve artefaktları) ile `HY_P1_A3_codex` (P1 paketi) **SİLİNMEZ**.
- Negatif test için bozulan sahte yedek (`HY_R26_SELFTEST_MOCK`) geri dönüş SelfTest'inden önce düzeltildi. Canlı sistem onu kullanmaz.

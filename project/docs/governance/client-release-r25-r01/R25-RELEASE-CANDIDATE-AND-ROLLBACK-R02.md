# R25 — YAYIN ADAYI + GERİ ALMA PAKETİ (R02 · R25B: yalnız K-1 + PSUS portal düzeltmeleri)

> **Durum: R25B TEKNİK YAYIN PASS — CANLIDA (2026-09-19 14:55Z).** Owner paket onayıyla koşturdu. Ayrıntılar §7'de.
> Bu bir teknik yayındır; İ13–İ16 canlı kabul koşumları ayrı owner GO'ları ister.
>
> **R01'in yerini alır.** R01'deki 10 dosyalı aday (`EB3D854F…71FC`) owner kararıyla yayına **alınmayacak**. #2716'nın 3 replay
> adapter dosyası bu yayına dahil değildir. R01 adayının digest'i ve test sonuçları R25B'nin kanıtı **sayılmaz**; aşağıdaki bütün
> ölçümler R25B üzerinde yeniden yapıldı.

## 1. Kimlik — BİRLEŞİK ARTEFAKT

R25B, canlı R24 dist'inin salt-okuma kopyası üzerine yalnız 7 portal dosyasının `ebbe1ae8` derlemesinin kopyalanmasıyla
oluşturuldu.

| Kimlik | Değer |
|---|---|
| **R25B aday dist** (tam ağaç, 3867 dosya) | **`1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E`** |
| Aday yolu | `D:\Development\HUKUK_YAZILIMI\HY_WT_R25\project\apps\api\dist-r25b\apps\api\src` |
| Taban = canlı R24 (tam ağaç, 3867 dosya) | `87712E0ED2CF71EE8268D81865C2388E030F52AF9AC7E29C56617AEDD0845453` (kopya digest'i ölçüldü, eşit) |
| Düzeltmelerin kaynak SHA'sı | `ebbe1ae8cce04de5579944bbf6b7f46a0efe0412` (#2720 K-1 → `448345c1`, #2721 PSUS → `ebbe1ae8`) |
| 7 dosya paket digest'i — aday | `4934A97C3E50197784A6469E54CB4A591672E3503A4C86FB6852D0FF97327D3A` |
| 7 dosya paket digest'i — canlı R24 (yedek kapısı) | `848C693D00616F4421339EF5272DDF25400583496EDBB94E0D8837466A5EFD7E` |
| `dist/config`, `dist/packages` | canlı kopya ile `ebbe1ae8` derlemesi **aynı** (`35091957…EFE8A`, `18586519…7D7FE`) |
| Canlı `.env` sha pini (içerik okunmaz) | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` |
| Pinli başlatıcı `C:\Ops\hukuk\bin\start-api.ps1` | `CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3` (değişmez) |

Digest reçetesi R24 ile aynı: `relpath('/')` + NUL + BÜYÜK HARF sha256 + LF; sıralama `StringComparer::Ordinal`; sonuç UTF-8 SHA256.

**Birleşik artefaktın tutarlılık kanıtı (bağımsız yeniden üretim).** Worktree `HY_WT_R25B` `ebbe1ae8`'den açıldı; kaynakta
yalnız `allocation-representative-replay-adapter.ts` `006c4dd2` (R24) hâline döndürüldü. Bu değişiklik yerel commit
`4443600ab755bff5075bc09265d4585293e6d320` olarak tutuluyor; dal push edilmedi, PR açılmadı. Derleme `pnpm install
--frozen-lockfile` → `pnpm exec prisma generate` → `pnpm exec nest build` sırasıyla alındı; üç adımın çıkış kodu da **0**,
`error TS` sayısı 0. Çıkan dist, birleşik adayla **bit bit aynı**: `1524EDC1…4D4E`; eklenen 0, silinen 0, değişen 0.
Portal dosyaları summary-engine'i içe aktarmaz (ölçüldü: 0).

İlk derleme denemesi `npx nest` çalıştırılabilir dosyasını bulamadığı için çıkış 1 ile bitti ve dist üretmedi
(`r25b-build.log`). Bu bir çağrı kusurudur, kod kusuru değildir. `pnpm exec` ile yeniden derlendi (`r25b-build2.log`).

## 2. R24 → R25B farkı — eklenen 0 · silinen 0 · değişen 7 · migration 0

| Dosya (`dist/apps/api/src/…`) | Canlı R24 sha256 | R25B sha256 | PR |
|---|---|---|---|
| `modules/portal/portal-auth.guard.js` | `5B8C092985875942C2C922557FFE9280E7DAB8CCA277A9AF4AB28980FA55B10D` | `2586222275388B54E36A0177BFE3A85A48C7D79A7F76E52B4BF67D832D6093D7` | #2721 |
| `modules/portal/portal-auth.guard.js.map` | `C82AC8D0E068EE236FFA0AF40AA38F9562E10B330CF4FF2C1DF5171882B724B3` | `CA5361965B4F777CAB55EE56E1B1C7A0195512F345FFD641BC63B944E4FDCC53` | #2721 |
| `modules/portal/portal.controller.js` | `957549CDE6F0F321081DEAC11D8B1DFB68A9D0F4B1904DCF066ECA5A96E84A2B` | `45C801FF3F91EDEB5DF958892FCDF5252812713EFA1A3BBA34365C0FC75F054A` | #2720 |
| `modules/portal/portal.controller.js.map` | `9753ADC485A4E6275E161789F41D6D4E118461C10E30BCACAE4D5FC05B93D51E` | `516E8C52BBA3C0AA583C9729151F04495EABA1E1AF8AD28BBCBCB5FF5FB6EA37` | #2720 |
| `modules/portal/portal.service.d.ts` | `CE846F6AEF0BA3B61EBFA441B7AF557622B1FF712A00D6FC7C82116A408256AA` | `A99F315981F17D0776BB71A57987DC550B2276B9A02EC40133B3ED4BD26DCA45` | #2720 |
| `modules/portal/portal.service.js` | `A27DF689C1E68271A82D07975DB775F0279FA0FCFD679EEBBEAB5CB359635EF0` | `56AC097381620C0A83F7FCCAF1E61F1D044BCD9F8F42598538D633FB33E93266` | #2720 + #2721 |
| `modules/portal/portal.service.js.map` | `B5B0120F02AA7982B259CA01AA76059590E85A891576B1E65B3B08B27D0D6B52` | `A8CE2642F3C6125E31A58F8605D817F7B07079FE1C7D97091D700DC8C8DE6303` | #2720 + #2721 |

**Dahil edilmeyenler:** `modules/summary-engine/allocation-representative-replay-adapter.{d.ts,js,js.map}` (#2716). Bu üç
dosya R25B'de canlı R24 ile birebir aynıdır. Sonuç olarak yayından sonra main kaynağı (#2716 dahil) ile canlı dist bu 3 dosyada
**bilinçli olarak farklı** kalır.

## 3. Doğrulama (R25B üzerinde, yeni koşum; CANLI KABUL DEĞİL)

| Kontrol | Sonuç | Ortam |
|---|---|---|
| Ortak regresyon (R25B kaynağı `4443600a`: 23 spec = portal 17 + storage 3 + replay 3) | portal **17/17** ve storage **3/3** suite PASS; replay 3 suite'ten 1'i PASS, **1'i FAIL (aşağıda)**, 1'i DB kapılı olduğu için atlandı. Test toplamı: 320 PASS · 1 FAIL · 2 atlandı | jest `--ci --runInBand` |
| CLIENT-PSUS probu | **7/7 PASS** | disposable `:5443`, API `:8113` = `dist-r25b/…/main.js` (süreç komut satırından doğrulandı) |
| K-1 matrisi (4 senaryo × 3 uç) | **12/12 PASS**; ret cevabı özdeş; geçerli yüklemede disk +1, geçersizde +0; DB'ye yazılan geçersiz referans 0 | aynı |
| İ13 paketi | **13/13 PASS** | aynı |
| İ14 paketi | **14/14 PASS** | aynı |
| İ15 KABUL-5 | **5/5 PASS** | aynı |
| İ16 paketi + H7-05 dört neden | **12/12 PASS** + **PASS** | aynı |
| `r25-release.ps1 -SelfTest` (canlıya dokunmaz) | **PASS**. Ölçülenler: aday `1524EDC1…`, canlı `87712E0E…`, paket pini eşit, `.env` ve başlatıcı pinleri eşit, üç uç 401 | 2026-09-19 07:31Z |

**Regresyondaki 1 FAIL — beklenen ve açıkça kayıtlı.** Başarısız test `allocation-representative-replay.static-guard` ("backend
and web collectedAmount production references exactly match the P03 manifest") testidir; beklenen 4 fazla girdi görüldü. Bunun
nedeni, R25B'de adapter'ın #2716 öncesi hâlinin kalmasıdır: manifest silinmiş 4 web dosyasını hâlâ listeler. Bu durum **bugün canlı
R24'te de aynıdır** ve #2716'nın düzelttiği kusurdur. Owner kararıyla #2716 yayına dahil edilmediği için test bu kaynakta beklendiği
gibi düşer. Bir çalışma zamanı davranışı değildir; manifest yalnız statik bir sabittir. Test gizlenmedi ve dışlanmadı.

**Ölçüm kusuru — kayıt.** K-1 matrisinin ilk koşumu probu yanlış veri kökü (`scratchpad/data`) ile başlattı. API'nin veri kökü
`scratchpad/i13s/data`'dır. Bu yüzden geçerli yüklemede sayılan disk artışı 0 çıktı ve ilk koşum 11/12 verdi. İlk sonuç
`r25b-k1-matrix-r1-wrong-data-root.json` dosyasında saklandı. Ölçüt değiştirilmedi; doğru kökle yapılan yeniden koşum 12/12 verdi.

Sınırlar:
- Yanıt kodu, yanıt mesajı ve DB yan etkisi ölçüldü. **Zamanlama eşitliği ölçülmedi.** Ret cevaplarının aynı olması zamanlama
  eşitliği anlamına gelmez.
- Yükleme temizliği, normalize edilmiş yolun kiracı kovası sınırı içinde kalmasına ve çağrı anında reparse reddine dayanır. Bu
  TOCTOU riskini **azaltır**; yarış penceresi ölçülmediği için "tamamen önlendi" denmez.
- Disposable API TCMB kur servisine dışa bağlandı (`185.98.252.10:443`, salt okuma). Bu bir gönderim değildir.

**Kanıt dizini:** `C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911\r25b-prova-20260919T073228Z`. Dizin 14 dosya içerir; `SHA256SUMS.txt`
`8F9861814EF6AA5594DF08019E7BBB67057F06D4B0EEBD8E40DEDB697BEF77DC`. Sır deseni taraması: 12 JSON incelendi, eşleşme 0.

## 4. Betikler (saf ASCII, LF; Windows PowerShell 5.1)

| Betik | Yol (main checkout) | SHA256 |
|---|---|---|
| Yayın | `D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r25-r01\scripts\r25-release.ps1` | `7E4D0118366610212A6867E0F9FD96E92119596A54B9255386A1200C59F91A3C` |
| Geri alma | `D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r25-r01\scripts\r25-rollback.ps1` | `15F597BFD4E49FE8F2072B7077DAB2C2C38B0C2C8B5532D2FB220B1CD7474A14` |

**API tamamen durmadan dosya takası yapılmaz.** Takastan ve geri almadan önce `Wait-ApiStopped` şu üç koşulu birlikte arar:
`:8080` dinleyicisi 0, `hukuk-task-host.exe … api` süreci 0 ve görev `Running` değil. Koşullar 90 saniye içinde sağlanmazsa betik
dosyalara dokunmadan durur. Otomatik geri almada da aynı bekleme uygulanır.

**`r25-release.ps1`:**
0. **Ön kapılar:** yükseltilmiş pencere; yedek dizini henüz yok; başlatıcı ve `.env` pinleri tutuyor; `:8080` üzerinde tek dinleyici
   var ve kökü `HY_W4_RELEASE23`; İ12–İ16 kabul, cron ya da sink süreci çalışmıyor.
1. **Aday kontrolü:** tam ağaç `1524EDC1…`, paket digest'i `4934A97C…`.
2. **Canlı ve yedek:** canlı `87712E0E…` olmalı. Eklenen 0, silinen 0 ve değişen kümesi **tam olarak bu 7 dosya** olmalı. Ardından
   robocopy yedeği `HY_R25_RELEASE_EVIDENCE\rollback-dist-src-R24-<ts>` alınır ve yedeğin digest'i `87712E0E…` olarak doğrulanır.
3. **Durdurma:** API durdurulur ve tamamen kapandığı doğrulanır.
4. **Takas:** 7 dosya kopyalanır; her dosyanın sha256'sı doğrulanır.
5. **Durmuşken kontrol:** API durmuşken tam ağaç `1524EDC1…` olmalı. Değilse API başlatılmaz ve yedekten geri alınır.
6. **Başlatma ve sağlık:** API başlatılır. Sağlık kontrolü en fazla 120 saniye sürer: tek dinleyici ve `/api/auth/me` = 401.
7. **Rota kontrolleri:** kimliksiz run-now = 401; kimliksiz `GET /api/portal/cases` = 401; yeni boot log'unda run-now ve
   portal upload rotaları `Mapped`; `.env`, başlatıcı ve görev eylemi değişmemiş; canlı `1524EDC1…`. Biri bile tutmazsa betik
   otomatik geri alır.
8. **Kanıt:** JSON yazılır ve SHA256'sı basılır.

**`r25-rollback.ps1 -BackupDir <yedek>`:**
1. Yedeğin tam ağaç digest'i `87712E0E…` ve 7 dosya paket digest'i `848C693D…` olmalı; değilse geri alma **başlamaz**.
2. Başlatıcı ve `.env` pinleri kontrol edilir.
3. API durdurulur ve tamamen kapandığı doğrulanır.
4. 7 dosya geri yüklenir; her dosyanın sha256'sı doğrulanır.
5. API durmuşken tam ağaç `87712E0E…` olmalı.
6. API başlatılır. `/api/auth/me`, run-now ve portal/cases uçlarının üçü de 401 dönmeli.
7. Kanıt JSON'u yazılır.

İki betik de migration çalıştırmaz, DB'ye yazmaz ve `.env` içeriğini okumaz. Başlatıcıyı ve görevi değiştirmez, ikinci API açmaz,
gönderim yapmaz.

## 5. Owner komutları — tek blok; herhangi bir git, hash ya da SelfTest hatasında YAYINA GEÇMEDEN DURUR

YALNIZ bu paket onaylandıktan sonra, yükseltilmiş Windows PowerShell'de çalıştırılır:

```powershell
$ErrorActionPreference = 'Stop'
$R = 'D:\Development\HUKUK_YAZILIMI\project'
$S = "$R\project\docs\governance\client-release-r25-r01\scripts"
function G { & git.exe -c "safe.directory=$($R -replace '\\','/')" -C $R @args; if ($LASTEXITCODE -ne 0) { throw "DUR: git $($args -join ' ') cikis $LASTEXITCODE" } }
G fetch -q origin
G pull -q --ff-only origin main
if ((G rev-parse HEAD) -ne (G rev-parse origin/main)) { throw 'DUR: main origin/main ile senkron degil' }
if (G status --porcelain --untracked-files=no) { throw 'DUR: main checkout kirli' }
if ((Get-FileHash "$S\r25-release.ps1").Hash  -ne '7E4D0118366610212A6867E0F9FD96E92119596A54B9255386A1200C59F91A3C') { throw 'DUR: release betik hash' }
if ((Get-FileHash "$S\r25-rollback.ps1").Hash -ne '15F597BFD4E49FE8F2072B7077DAB2C2C38B0C2C8B5532D2FB220B1CD7474A14') { throw 'DUR: rollback betik hash' }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$S\r25-release.ps1" -SelfTest
if ($LASTEXITCODE -ne 0) { throw "DUR: SelfTest basarisiz (cikis $LASTEXITCODE) - yayina GECILMEDI" }
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$S\r25-release.ps1"
if ($LASTEXITCODE -ne 0) { throw "YAYIN PASS DEGIL (cikis $LASTEXITCODE) - ciktidaki SONUC ve KANIT JSON'u incele" }
```

**Yalnız gerekirse geri alma.** Yedek yolu yayın çıktısında `yedek=` satırında yazar:

```powershell
powershell.exe -NoProfile -ExecutionPolicy Bypass -File 'D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r25-r01\scripts\r25-rollback.ps1' -BackupDir 'D:\Development\HUKUK_YAZILIMI\HY_R25_RELEASE_EVIDENCE\rollback-dist-src-R24-<ts>'
```

Yayın PASS olursa sıradaki adımlar İ13 → İ14 → İ15 → İ16 owner bloklarıdır. Her blok ayrı bir GO ister ve dist pini `1524EDC1…`'dir.

## 6. Ön koşullar ve açık kalemler

- Bu paket PR'ının CI'ı ve merge SHA'sındaki main CI'ı **SUCCESS** olmalı.
- Aday dizini `HY_WT_R25\…\dist-r25b` ve kanıt worktree'si `HY_WT_R25B` yayın tamamlanana kadar **silinmez**.
- İ16, R25B canlıda doğrulanıp owner bloğu canlıda PASS verene kadar kapanmaz.
- Sayaç **14/18**; hizmet kabulü **0/8**. Bu paket ikisini de değiştirmez.
- #2716'nın canlıya alınması ayrı bir karar ve ayrı bir aday gerektirir.

## 7. TEKNİK YAYIN KAYDI (2026-09-19)

Owner R25B paketini kimliğiyle onayladı: tam ağaç `1524EDC1…4D4E`; kapsam R24 üzerine yalnız 7 K-1/PSUS portal dosyası, #2716
hariç. Yayın bloğunu owner yükseltilmiş pencerede kendisi çalıştırdı; sonuç **`YAYIN PASS`**.

**Ön koşullar (yayın öncesi, taze ölçüm):**
- Main `3cfb1b37` temizdi ve origin ile senkrondu; iki betiğin hash'i pinlerle eşitti.
- `:8080` üzerinde tek dinleyici vardı (kökü `HY_W4_RELEASE23`); kabul ya da yayın süreci 0'dı.
- `-SelfTest` PASS verdi: canlı taban R24 `87712E0E…`.
- Dört yürütücü canlı yayın penceresi için AÇIK teyit verdi: Avukat personel analiz dosyası, OFFİCE 33, OFFİCE 33 - F04, Windows Disk Temizliği.
- Makine aynı gün 10:16'da (yerel saat) yeniden açılmıştı; API zamanlanmış görevle normal şekilde başlamıştı.
- Main'deki #2727 migration'ı (`20260919120000_sim_snapshot_restore_unique_indexes`) R25B kapsamında **değildir** ve uygulanmadı. Canlı migration digest'i değişmedi.

**Yayın kanıtı:** `D:\Development\HUKUK_YAZILIMI\HY_R25_RELEASE_EVIDENCE\R25-RELEASE-20260919-145508Z.json`, sha256
`12F5C7CF199DEAB064E5026B9B8CD12AC2DB3730E7A7846CA2C5E098E71A2239`. Değer owner'ın bildirdiği değerle birebir eşit.
Kanıttaki ölçümler:
- 7/7 dosya değiştirildi.
- Sağlık: `:8080` pid 36568, `/api/auth/me` = 401.
- Kimliksiz run-now = 401; kimliksiz portal/cases = 401.
- Boot log `api-out.20260919-175548.log`: run-now `Mapped` 1, portal upload `Mapped` 1, toplam `Mapped` 977.
- Kapsam: canlı digest, `.env`, başlatıcı ve görev eylemi aynı.

**Geri dönüş yedeği (KORUNUR):** `D:\Development\HUKUK_YAZILIMI\HY_R25_RELEASE_EVIDENCE\rollback-dist-src-R24-20260919-145508Z`. Tam ağaç
digest'i `87712E0E…5453`, 3867 dosya. Geri alma betiği bu yedekle kullanılabilir durumdadır. R24'ün kendi yedeği
(`HY_R24_RELEASE_EVIDENCE\rollback-dist-src-R23-20260917-220435Z`) ve R24 kanıtı (`C92B8F5F…E9AD`) dokunulmadan korunuyor.

**Bağımsız yayın sonrası doğrulama (salt okuma): 20/20 PASS**, 2026-09-19 14:59:55Z. Çıktı
`HY_R25_RELEASE_EVIDENCE\R25B-POST-VERIFY-r2.txt`, sha256 `7C02A5D57A6DB429DA8D8487806C8192C98D2CFB485387549F12D96A019BB067`.

Kullanılan betikler:
- `D:\Development\HUKUK_YAZILIMI\HY_R25_RELEASE\r25b-post-verify.ps1`, sha256 `DAFD6C9A1BB9E34229F722B5DDC05967137A4182D3B78A544BFCFB4ECDA70744`
- `r25b-tree-digest.py`, sha256 `E2DFB247FECAE57F25214A407B3399DA7609EF63ABB56C4B24B8095F1E08A2FE`

Canlı tam ağaç digest'i, yayın betiğinden **ayrı** bir uygulamayla (Python, ordinal sıralama) hesaplandı: `1524EDC1…4D4E`,
3867 dosya. Bu uygulama yayından önce canlıda (`87712E0E…`) ve adayda (`1524EDC1…`) doğru sonucu verdiği ölçülerek sınandı.

| Kontrol | Sonuç |
|---|---|
| Canlı dist (Python) | `1524EDC1…4D4E` = R25B |
| R24 yedeği (Python) | `87712E0E…5453` |
| Aday `dist-r25b` ve yeniden üretim derlemesi `HY_WT_R25B` | ikisi de `1524EDC1…`; yayına kadar korundu, korunmaya devam ediyor |
| Yedeğe göre değişen | tam olarak 7 portal dosyası |
| `.env` sha / başlatıcı / görev eylemi / görev durumu | pin / pin / `hukuk-task-host.exe api` / Running |
| Canlı migration digest'i | `DD38F07D…` (yayın öncesiyle aynı) |
| API | tek dinleyici pid 36568 (kök RELEASE23); son başlatıcı çocuğu = dinleyici |
| DB kimliği | `127.0.0.1:5432/hukuk_db` (son başlatıcı satırı) |
| Uçlar | `/api/auth/me` 401 · run-now 401 · portal/cases 401 · boş gövdeli portal login 401 |
| Kullanıcı yüzeyi (web `:3002`) | `/` 200 · `/portal/login` 200 |

**Doğrulayıcı kusuru (kayıt).** İlk koşum yarıda kaldı. PowerShell değişken adlarında büyük/küçük harf ayırmadığı için `$live`
değişkeni `$LIVE` yolunu ezdi. Kusurdan önce koşan ilk dört kontrolün dördü de PASS verdi. Yalnız değişken adı düzeltildi,
hiçbir ölçüt değişmedi; salt okuma doğrulama yeniden koşuldu. İlk sürüm `r25b-post-verify.r1-case-collision.ps1` adıyla saklandı.

**Devralınan ve bu yayında giderilmeyen sınır.** `allocation-representative-replay.static-guard` testi, R25B kaynağında
**başarısızdır**. Manifest silinmiş 4 web dosyasını hâlâ listelemektedir; bu durum canlı R24'te de aynıydı. #2716 bu kusuru
düzeltir, ancak owner kararıyla yayına dahil edilmedi. Bu nedenle "bütün testler PASS" denemez. Main kaynağında #2716 bulunur;
canlı dist bu 3 adapter dosyasında main'den bilinçli olarak farklıdır. #2716'nın canlıya alınması ayrı bir karar gerektirir.

**Kapsam sınırı.** Bu kayıt yalnız TEKNİK yayını kapatır. İ13 → İ14 → İ15 → İ16 canlı kabul koşumları her biri için ayrı owner
GO'su gerektirir; yayın onayı bunların yerine geçmez. İ16, kendi canlı koşumu PASS verene kadar kapanmaz. Zamanlama eşitliği
ölçülmedi; TOCTOU için "tamamen önlendi" denmez. **Sayaç 14/18, hizmet kabulü 0/8. DEĞİŞMEDİ.**

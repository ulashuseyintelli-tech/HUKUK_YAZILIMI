# R25 — YAYIN ADAYI + GERİ ALMA PAKETİ (R01)

> **YERİNİ ALDI → `R25-RELEASE-CANDIDATE-AND-ROLLBACK-R02.md` (R25B). Bu R01 adayı YAYINA ALINMAYACAK.** Owner kararı (2026-09-19): R25 yalnız K-1 ve PSUS portal düzeltmeleriyle sınırlandı. #2716'nın 3 replay adapter dosyası dahil değildir. Bu belgedeki aday digest'i (`EB3D854F…71FC`), paket digest'i ve test sonuçları R25B'nin kanıtı SAYILMAZ. Betik hash'leri (`095DFEEC…`, `FD42E866…`) `074dd4d0`'daki önceki sürüme aittir; güncel betikler R02'dedir. Kayıt değiştirilmeden tarihsel olarak korunur.

> **Durum: HAZIRLIK — YAYINA HAZIR İLAN EDİLMEDİ.** Paket, §7'deki CI kapıları tamamlanana kadar "yayına hazır" sayılmaz.
> Canlı yayın ayrıca **owner'ın bu somut paketi onaylamasını** bekler. Bu belge ve betikler yayını başlatmaz.

## 1. Kimlikler (karıştırılmaz)

| Kimlik | Değer |
|---|---|
| Kaynak SHA | `ebbe1ae8cce04de5579944bbf6b7f46a0efe0412` (main; #2721 merge commit'i) |
| Aday dist (tam ağaç digest, 3867 dosya) | `EB3D854F708519FFB788B41C4FF2B716F8FAE3C65DDAFC2BFB718446B91171FC` |
| Aday dist yolu | `D:\Development\HUKUK_YAZILIMI\HY_WT_R25\project\apps\api\dist\apps\api\src` (worktree `HY_WT_R25` @ `ebbe1ae8`, takipli kirli dosya 0) |
| Canlı taban = R24 (tam ağaç digest, 3867 dosya) | `87712E0ED2CF71EE8268D81865C2388E030F52AF9AC7E29C56617AEDD0845453` (2026-09-19 salt-okuma ölçümü) |
| Değişen 10 dosyanın paket digest'i — aday | `02F0E5489AD689946DC8284338696E0A881FBC9517BE4D8FD583B34BA7E3D252` |
| Aynı 10 dosyanın paket digest'i — canlı R24 (yedek kapısı) | `FFC15B32AA01CEFC7BB2FE09915A9BEF6EC3AC00149C8597DBEB7EEFAF4E5BC7` |
| Canlı `.env` sha pini (içerik okunmaz) | `7A7228B1143BE2A8406FAF4CA316064EB2E164AE23E160E1353121F64E0EFDDC` |
| Pinli başlatıcı `C:\Ops\hukuk\bin\start-api.ps1` | `CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3` (değişmez) |

Digest reçetesi (R24 ile aynı): `relpath('/')` + NUL + BÜYÜK HARF sha256 + LF. Sıralama `StringComparer::Ordinal`, sonuç UTF-8 SHA256.
Paket digest'i de aynı reçeteyle, yalnız 10 dosya üzerinden hesaplanır.

**Derleme:** `pnpm install --frozen-lockfile` → `prisma generate` → `nest build`. Üç adımın çıkış kodu da **0** ölçüldü
(günlük: `D:\Development\HUKUK_YAZILIMI\r25-build.log`). İkinci bir bağımsız derlemeyle yeniden üretilebilirlik **ölçülmedi**.

## 2. Canlıya (R24) fark — eklenen 0 · silinen 0 · değişen 10

| Dosya (`dist/apps/api/src/…`) | Canlı R24 sha256 | Aday R25 sha256 | Kaynak PR |
|---|---|---|---|
| `modules/portal/portal-auth.guard.js` | `5B8C092985875942C2C922557FFE9280E7DAB8CCA277A9AF4AB28980FA55B10D` | `2586222275388B54E36A0177BFE3A85A48C7D79A7F76E52B4BF67D832D6093D7` | #2721 PSUS |
| `modules/portal/portal-auth.guard.js.map` | `C82AC8D0E068EE236FFA0AF40AA38F9562E10B330CF4FF2C1DF5171882B724B3` | `CA5361965B4F777CAB55EE56E1B1C7A0195512F345FFD641BC63B944E4FDCC53` | #2721 |
| `modules/portal/portal.controller.js` | `957549CDE6F0F321081DEAC11D8B1DFB68A9D0F4B1904DCF066ECA5A96E84A2B` | `45C801FF3F91EDEB5DF958892FCDF5252812713EFA1A3BBA34365C0FC75F054A` | #2720 K-1 |
| `modules/portal/portal.controller.js.map` | `9753ADC485A4E6275E161789F41D6D4E118461C10E30BCACAE4D5FC05B93D51E` | `516E8C52BBA3C0AA583C9729151F04495EABA1E1AF8AD28BBCBCB5FF5FB6EA37` | #2720 |
| `modules/portal/portal.service.d.ts` | `CE846F6AEF0BA3B61EBFA441B7AF557622B1FF712A00D6FC7C82116A408256AA` | `A99F315981F17D0776BB71A57987DC550B2276B9A02EC40133B3ED4BD26DCA45` | #2720 |
| `modules/portal/portal.service.js` | `A27DF689C1E68271A82D07975DB775F0279FA0FCFD679EEBBEAB5CB359635EF0` | `56AC097381620C0A83F7FCCAF1E61F1D044BCD9F8F42598538D633FB33E93266` | #2720 + #2721 |
| `modules/portal/portal.service.js.map` | `B5B0120F02AA7982B259CA01AA76059590E85A891576B1E65B3B08B27D0D6B52` | `A8CE2642F3C6125E31A58F8605D817F7B07079FE1C7D97091D700DC8C8DE6303` | #2720 + #2721 |
| `modules/summary-engine/allocation-representative-replay-adapter.d.ts` | `682479B196DD77E9BF6D88566A6FAFC658BE1C706C16830C280CE4ED6A5ED5A4` | `B65E141F76C2CBD11E0EB196521783926728E1F3E578FA9102F87090416D4922` | #2716 |
| `modules/summary-engine/allocation-representative-replay-adapter.js` | `1808D7DCF986725D800078A60E412D2E22523678B16B21F05086612B5C5E6B36` | `9772EC6DDDE8110302F6DFF240E86726432E00BEA6D91B4535FBE7075417043D` | #2716 |
| `modules/summary-engine/allocation-representative-replay-adapter.js.map` | `9E38AFBBD294FA1AAB9C730E5FB564DFB3DE1B5EEC306ACCEA347049F76A7F7B` | `7F98878DA6F27C4C6AEFDBF31928AAF118A0CC351DDDE9FAA89444DC299C3F14` | #2716 |

**Kaynak düzeyi:** `006c4dd2..ebbe1ae8` aralığında `apps/api/src` altında test dışı yalnız 4 dosya değişti:
`portal-auth.guard.ts`, `portal.controller.ts`, `portal.service.ts` ve `allocation-representative-replay-adapter.ts`.
Aralıktaki diğer commit'ler (#2710, #2712, #2713) yalnız test ve CI dosyalarıdır; dist'e yansımaz.

**#2716 (başka oturumun işi, AÇIKÇA BEYAN — sessizce dahil edilmiyor):** Değişiklik, `ALLOCATION_REPRESENTATIVE_CONSUMER_MANIFEST_V1`
sabitinden silinmiş 4 web girdisini çıkarır (+0/−24). Derlenmiş adapter yalnız iki yerden içe aktarılır: kardeş modül
`allocation-evidence-qualification.js` ve `scripts/rcv-ws04-p03-allocation-replay-launch.js`. Nest modül grafiğinde yer almaz,
dolayısıyla çalışan API'nin davranışını değiştirmez. Aday tam ağaç digest'i bu 3 dosyayı içerir. Yalnız 7 portal dosyasını
içeren bir varyant **hazırlanmadı ve doğrulanmadı**. Owner bu 3 dosyanın dahil edilmesini bu paketin onayıyla birlikte kabul eder
ya da reddeder; reddederse ayrı bir aday gerekir.

## 3. Migration — YOK

`006c4dd2..ebbe1ae8` aralığında `apps/api/prisma` altında değişen dosya sayısı **0**. Betikler `migrate deploy` çalıştırmaz.

## 4. Doğrulama (aday dist üzerinde; CANLI KABUL DEĞİL)

| Kontrol | Sonuç | Ortam |
|---|---|---|
| Ortak regresyon (portal + storage guard + replay static guard, `ebbe1ae8`) | **22 suite / 321 test PASS**, FAIL 0 (§4.1) | jest `--ci --runInBand` |
| CLIENT-PSUS probu | **7/7 PASS** | disposable `:5443`, aday dist `:8113` |
| K-1 matrisi (4 senaryo × 3 uç) | **12/12 PASS**; ret cevabı özdeş; diske yazılan 0; geçersiz referans DB'ye yazılmadı | aynı |
| İ13 paketi | **13/13 PASS** | aynı |
| İ14 paketi | **14/14 PASS** | aynı |
| İ15 KABUL-5 | **5/5 PASS** | aynı |
| İ16 paketi + H7-05 dört neden | **12/12 PASS** + **PASS** | aynı |

Sınırlar:
- Yanıt kodu, yanıt mesajı ve DB yan etkisi ölçüldü. **Zamanlama eşitliği ölçülmedi.** Ret cevaplarının aynı olması zamanlama
  eşitliği anlamına gelmez.
- Yükleme temizliği iki şeyle korunur: normalize edilmiş yolun kiracı kovası sınırı içinde kalması ve çağrı anında reparse
  noktalarının reddi. Bu, TOCTOU riskini **azaltır**. Yarış penceresi ölçülmediği için "tamamen önlendi" denmez.
- Disposable API, TCMB kur servisine dışa bağlandı (`185.98.252.10:443`, ExchangeRateService, salt okuma). Bu bir gönderim değildir.

### 4.1 Ortak regresyon

Worktree `HY_WT_R25` @ `ebbe1ae8`, `npx jest --ci --forceExit --runInBand --runTestsByPath` ile 23 spec koşuldu:
- `ci-manifests/pure/*.txt` içindeki tüm `modules/portal/` girdileri
- `src/common/storage/__tests__/*.spec.ts`
- `allocation-representative-replay*.spec.ts`

Sonuç: **22 suite PASS · 321 test PASS · FAIL 0**, çıkış 0. Atlanan tek suite
`allocation-representative-replay.db-gated.integration.spec.ts` (2 test): DB kapılıdır, pure kapsamında değildir; `TEST_DATABASE_URL`
olmadan tasarım gereği atlanır. Bu suite'in #2716 değişikliğindeki davranışı yalnız static guard ile doğrulandı (PASS).
Günlük: `D:\Development\HUKUK_YAZILIMI\r25-regress-jest.log`.

## 5. Betikler (saf ASCII, LF; Windows PowerShell 5.1 ile koşulur)

| Betik | Yol (main checkout) | SHA256 |
|---|---|---|
| Yayın | `D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r25-r01\scripts\r25-release.ps1` | `095DFEEC31550515CA4A6C3087DC918B53533F79910AC47A4F47C3BD7DD77217` |
| Geri alma | `D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r25-r01\scripts\r25-rollback.ps1` | `FD42E866907CAB22CEE511F06A8ABDEB41D66613E6D32B3784B676723D55B154` |

**`r25-release.ps1`** (yükseltilmiş pencere; `-SelfTest` canlıya dokunmaz):

0. Ön kapılar:
   - yükseltilmiş pencere
   - yedek dizini henüz yok
   - başlatıcı ve `.env` sha pinleri tutuyor
   - `:8080` üzerinde tek dinleyici var ve kökü `HY_W4_RELEASE23`
   - İ12–İ16 kabul, cron ya da sink süreci çalışmıyor
1. Aday tam ağaç digest'i `EB3D854F…` ve paket digest'i `02F0E548…` ile eşleşiyor.
2. Canlı taban `87712E0E…` ile eşleşiyor. Fark eklenen 0, silinen 0 ve değişen kümesi tam olarak bu 10 dosya. Canlı ağaç
   `D:\Development\HUKUK_YAZILIMI\HY_R25_RELEASE_EVIDENCE\rollback-dist-src-R24-<ts>` altına robocopy ile yedeklenir ve
   yedeğin digest'inin `87712E0E…` olduğu doğrulanır.
3. `HukukPlatform-API` görevi durdurulur. Dinleyici 0, host süreci 0 ve görev `Running` değil koşulları sağlanmadan dosyalara dokunulmaz.
4. 10 dosya kopyalanır; her dosyanın sha256'sı tek tek doğrulanır.
5. API durmuşken tam ağaç digest'i `EB3D854F…` olmalı. Değilse API **başlatılmaz**, yedekten geri alınır.
6. API başlatılır.
7. Süreli sağlık kontrolü (≤120 sn): tek dinleyici ve kimliksiz `GET /api/auth/me` = 401.
8. Rota ve yetki kontrolü:
   - kimliksiz `POST /api/client-statements/monthly-delivery/run-now` = 401 (R24 ucu korunur)
   - kimliksiz `GET /api/portal/cases` = 401
   - yeni boot logunda run-now ve `POST /api/portal/documents/upload` rotaları `Mapped` olarak görünür
   - `.env`, başlatıcı ve görev eylemi değişmemiş, canlı digest `EB3D854F…`

   Herhangi biri tutmazsa betik otomatik olarak geri alır.
9. Kanıt `HY_R25_RELEASE_EVIDENCE\R25-RELEASE-<ts>.json` dosyasına yazılır ve SHA256'sı basılır.

**`r25-rollback.ps1 -BackupDir <yedek>`** (yükseltilmiş pencere):
1. Yedeğin tam ağaç digest'i `87712E0E…` ve paket digest'i `FFC15B32…` olmalı. Değilse geri alma **başlamaz**.
2. Başlatıcı ve `.env` pinleri kontrol edilir.
3. API durdurulur ve kapandığı doğrulanır.
4. 10 dosya geri yüklenir; her dosyanın sha256'sı doğrulanır.
5. API durmuşken tam ağaç digest'i `87712E0E…` olmalı.
6. API başlatılır. Sağlık kontrolü: `/api/auth/me`, run-now ve portal/cases uçlarının üçü de 401 dönmeli.
7. Kanıt JSON'u yazılır.

Betiklerin yapmadıkları: migration, DB yazımı, `.env` içeriğini okumak, başlatıcı ya da görev değişikliği, ikinci API,
gönderim. `-SelfTest` sonucu (2026-09-19 23:09Z, yükseltilmemiş, salt okuma): **PASS**. Ölçümler: aday `EB3D854F…`, canlı
`87712E0E…`, paket pini eşit, `.env` ve başlatıcı pinleri eşit, `/api/auth/me`, run-now ve portal/cases uçlarının üçü de 401.

## 6. Owner komutları (YALNIZ bu paket onaylanıp §7 kapıları tamamlandıktan sonra; yükseltilmiş Windows PowerShell)

```powershell
# 1) main senkron + betik hash kapısı
git -C D:\Development\HUKUK_YAZILIMI\project pull --ff-only origin main
$S = 'D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-release-r25-r01\scripts'
if ((Get-FileHash "$S\r25-release.ps1").Hash -ne '095DFEEC31550515CA4A6C3087DC918B53533F79910AC47A4F47C3BD7DD77217') { throw 'release betik hash' }
if ((Get-FileHash "$S\r25-rollback.ps1").Hash -ne 'FD42E866907CAB22CEE511F06A8ABDEB41D66613E6D32B3784B676723D55B154') { throw 'rollback betik hash' }
# 2) salt-okuma ön test (canlıya dokunmaz)
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$S\r25-release.ps1" -SelfTest
# 3) yayın
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$S\r25-release.ps1"
# 4) yalnız gerekirse geri alma (yedek yolu 3. adımın çıktısında yazar)
# powershell.exe -NoProfile -ExecutionPolicy Bypass -File "$S\r25-rollback.ps1" -BackupDir 'D:\Development\HUKUK_YAZILIMI\HY_R25_RELEASE_EVIDENCE\rollback-dist-src-R24-<ts>'
```

Yayın PASS olursa sıradaki adımlar İ13 → İ14 → İ15 → İ16 owner bloklarıdır. Her blok ayrı bir GO ister; blokların dist pini
`EB3D854F…` değeridir.

## 7. Yayına hazır sayılmanın ön koşulları (CI kapıları)

- `27ca3400`, `20b70e21` ve `ebbe1ae8` SHA'larının her biri kendi main CI koşumunda **SUCCESS** olmalı. İptal edilen koşum
  SUCCESS sayılmaz; daha yeni bir main SUCCESS'i eski SHA'nın yerine geçmez.
  **Durum (2026-09-19): TAMAM.** Koşumlar sessiz pencerede sırayla yapıldı:
  - `27ca3400`: run 35392914984, 2. deneme
  - `20b70e21`: run 35391532414, 3. deneme
  - `ebbe1ae8`: run 35403503455, 2. deneme

  Ayrıntı: İ12 kapanış eki #2724 (`338ecc52`).
- Bu paket PR'ının CI'ı ve merge SHA'sındaki main CI'ı **SUCCESS** olmalı.
- Aday worktree `HY_WT_R25` yayın tamamlanana kadar **silinmez**. Betik adayı bu yoldan okur.

## 8. Kapsam dışı / açık kalemler

- İ16, R25 canlıda doğrulanıp owner bloğu canlıda PASS verene kadar **kapanmaz**.
- Hizmet kabulü owner kabulü olmadan **0/8** kalır.
- `HY_WT_K1` ve `HY_WT_PSUS` worktree kalıntıları ayrı ve yayını bloke etmeyen bir temizlik kaydıdır. Silme kancası
  reddettiği için bırakıldı; kanca başka bir yöntemle aşılmadı.

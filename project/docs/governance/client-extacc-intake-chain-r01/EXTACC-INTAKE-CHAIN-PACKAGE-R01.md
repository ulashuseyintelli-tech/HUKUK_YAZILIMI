# EXTACC R01 — Dış erişim intake zinciri canlı kabul paketi (D-1 / D-2 / D-3 / D-9)

> **DURUM (2026-09-28): İKİ CANLI KOŞUM — `2a967ff1` FAIL (korunur), `cff5c692` 22/22 PASS; intake kapsamı kaydı §12.** Önceki durum: HAZIRLIK; canlı Run/Recover başlatılmamıştı. Bu belge canlı koşum GO'su değildir; GO biçimi
> `OWNER-GO-CLIENT-EXTACC-YYYYMMDD-RNN`. Hizmet kabulü H1–H8 **0/8** ve diğer kabul sayaçları **değişmez**.
> D-halkaları `client-external-access-r01` §7'de tanımlıdır.

## 1. Owner kararlarının uygulanışı

| # | Karar | Uygulama |
|---|---|---|
| 1 | Telefona aktarım: yerel QR, harici servis yok, kayıt dışı | Yerel bağımlılıklarda QR aracı **yok** (canlı ağaç, geliştirme ağacı, pnpm deposu, npm önbelleği tarandı). Owner onayıyla `qrcode-generator` **1.4.4** (Kazuhiko Arase, MIT, bağımlılıksız) npm kayıt defterinden indirildi; tarball sha512 ve sha1 npm'in yayımladığı değerlerle **eşit**; paketle gelen 5 golden test **5/5**. Yalnız `qrcode.js` + `package.json` (+ golden test) `scripts/vendor/` altına sha256 pinli alındı. QR ve adres **yalnız** `\\.\CONOUT$` konsol arabelleğine çizilir (§5). |
| 2 | 30 dk geçerlilik, tek kullanım; DTO'yu varsayma | `CreateClientWorkspaceIntakeLinkDto` hem **kaynakta** hem **canlı dist'te** `expiresAt` (`IsDateString`, gelecekte olmalı — `assertFutureExpiresAt`) ve `maxUses` (`IsInt`, `Min(1)`) taşır; servis ikisini de kayda yazar (`maxUses ?? 1`). Gövde: `{"scope":["ADDRESS"],"expiresAt":"<+30 dk>","maxUses":1}`. |
| 3 | İkinci gönderim | USED bağlantıya ikinci POST'un reddi **izole** ölçüldü (X5: 404, satır 1 kalır). Canlı pakette betik **hiç** public POST yapmaz (statik T-6 + kanıttaki `scriptPublicPostCount=0`); tek gönderim owner telefonundan. |
| 4 | GO | `OWNER-GO-CLIENT-EXTACC-YYYYMMDD-RNN`; defter `extacc-goref-ledger.txt` (yalnız sha256, koşumdan önce). |
| 5 | IP | `E-17` yalnız **dışlama** ölçer: ipHash loopback/unknown özetlerinden biri değil. Bu mobil ağ kanıtı **değildir**. Ham IP ve ipHash kanıta ve inceleme paketine **yazılmaz** (S-1 taraması). Mobil ağ = telefon gözlemi + owner beyanı (`owner-declaration.json`, ayrı dosya). ÜB-3 ayrı ürün bulgusudur (§7). Canlı veri işleme, Run'dan önce owner'a açıkça sunulur ve `EVET` yazılmadan GO sorulmaz. |
| 6 | Hata yorumları | 503 → koşum adresi göstermeden **durur**; neden `UNKNOWN` yazılır, "Redis" etiketi yok (X7). Gönderim satırı yoksa sonuç **ÖLÇÜLEMEYEN**: "owner göndermedi" ile "sayfa başarı gösterdi ama satır yok (honeypot vb.)" DB'den ayırt edilemez (X3 bunu ölçer); owner bloğu beyanla ayırır. |
| 7 | Kapanış | `E-D9` birleşik: DB'de ACTIVE bağlantı **yok** (USED/REVOKED) **ve** yerel **ve** dış public 404 **ve** kullanıcı/dosya kapanışı. Geç gönderim yarışı izole test edildi (X6). R03 güvenceleri korunur: makbuz (X9), belirsiz oluşturma (X8), kanıt yazma hatası (X10), iptal hatası + Recover (X11). |
| 8 | D-8 kaydı | §9. |

## 2. Ürün davranışı (kaynaktan doğrulandı)

- `POST /api/public/intake/:token` (`client-intake-public.service.ts`): honeypot `hp` doluysa bağlantı doğrulamasından
  **önce** `{ok:true}` döner ve hiçbir şey yazmaz. Aksi halde tek işlemde `useCount` atomik artar, limit dolunca
  **USED**; `ClientIntakeSubmission` (`CLIENT_SUBMITTED`, `sourceMeta={ipHash,ua}`) + `ClientIntakeField` yazılır.
  Bildirim göndermez; kanonik tablolara yazmaz.
- `validateActiveLink` Case/kullanıcı durumuna bakmaz (ÜB-1) → kapanışta iptal/USED + 404 ölçümü şart.
- Canlı dist'te ErrorLog `/public/intake/<token>` yolunu `:token` olarak redakte eder.

## 3. Akış (`scripts/extacc-intake-live-run.js`, owner bloğu `scripts/extacc-owner-live-block.ps1`)

1. **Kapılar** (R03 ile aynı + gösterim): gösterim kanalı (konsol) **hiçbir yazmadan önce** açılır; yoksa çıkış 4 (X15).
2. Sentetik kurulum + makbuz → giriş → makbuza `createAttemptedAt` → **gönderimsiz** oluşturma (30 dk, tek kullanım).
3. `E-02` DB'de ACTIVE / useCount 0 / maxUses 1 / expiresAt istenen değer; URL kapısı; yerel ve dış GET 200.
   503 ya da 200 dışı → adres **gösterilmez**, kapanışa geçilir.
4. Adres + QR + işaret metni (`EXTACC-<runId> sentetik adres`) yalnız owner konsolunda.
5. Owner telefonda (Wi-Fi kapalı, mobil veri, gizli sekme) açar, işaret metnini yazar, **bir kez** gönderir.
   Betik yalnız okur (varsayılan 25 dk, 5 sn aralık). Görülünce ya da süre dolunca ekran + kaydırma arabelleği temizlenir.
6. Kapanış: R03 `finalizeClosure` (iptal ya da USED, yerel/dış public 404, kullanıcı/dosya kapanışı).
7. Geç gönderim yoklaması; satır varsa **D-3** salt okuma işlem içinde ölçülür.
8. Owner bloğu: ekran temizliği → owner beyanı (ayrı dosya) → manifest; pencereyi kapatma talimatı.

## 4. Ölçütler

| Ölçüt | D | Ne ölçer |
|---|---|---|
| E-00 | — | ölçüm geçerli (elev1 ADMIN değil) |
| E-01 / E-02 | — | gönderimsiz oluşturma 201; DB'de 30 dk / tek kullanım / ACTIVE |
| E-URL / E-03L / E-03D | D-1 (kısmi) | URL kapısı; gösterimden önce yerel ve dış public GET 200 |
| E-DISP | D-1 | adres yalnız yerel konsola gösterildi |
| E-WAIT / E-LATE | D-2 | gönderim satırı pencere içinde görüldü / geç gönderim yok |
| E-10…E-16 | D-3 | tek gönderim · tenant/dosya/müvekkil = makbuz · `CLIENT_SUBMITTED` · tek ADDRESS alanı işaret metniyle, inceleme PENDING · bağlantı USED/1/1 · kanonik `DebtorAddress`+`ClientIntelStatement` önce/sonra aynı · bildirim/bilgi talebi/teslim kaydı yok |
| E-17 | — | ipHash loopback/unknown **değil** (yalnız dışlama; mobil ağ kanıtı değil) |
| U-REV-DB / U-REV-PUB-L / U-REV-PUB-D / U-CLOSE | D-9 | R03 kapanış ölçütleri |
| E-D9 | D-9 | birleşik: DB'de ACTIVE yok + yerel ve dış 404 + kapanış |
| U-ISO | — | sentetik olmayan tenantlarda tenant başına kullanıcı ve müvekkil **sayıları** önce/sonra aynı (ekleme/silme yokluğu çıkarılmaz) |

Mobil ağdan geldiği, formun telefonda açıldığı ve "Teşekkürler" ekranı **owner beyanıdır** (`owner-declaration.json`) ve
makine ölçümünden ayrı raporlanır.

## 5. Konsol ve kayıt davranışı — izole ölçüm (`scripts/extacc-console-selftest.ps1`)

Her durum yeni, gizli bir konsol penceresinde (conhost) koşar; o pencere kendi arabelleğini okur; sonuç dosyasına yalnız
doğru/yanlış yazılır.

| # | Ölçüm | Sonuç |
|---|---|---|
| C-1 | POZİTİF KONTROL: adres konsol arabelleğine çizildi | PASS |
| C-2 | temizleme sonrası arabellekte yok | PASS |
| C-3 | yönlendirilmiş stdout/stderr loguna düşmedi | PASS |
| C-4 | PowerShell transcript kaydına düşmedi | PASS |
| C-5 | konsolsuz süreçte gösterim reddedildi (çıkış 4) | PASS |

İlk koşumda C-1 **FAIL** verdi: `CONOUT$` yalnız yazma erişimiyle açılınca TTY sayılmıyordu (konsol modu okunamıyor);
gösterim hiç çalışmazdı (koşum yine yazmadan dururdu). Tanıtıcı `r+` ile açılacak şekilde düzeltildi; ardından 5/5.
**Sınır:** arabelleği kendisi tutan barındırıcılar (Windows Terminal kaydırma geçmişi, uygulama terminal paneli) bu testle
ölçülmez. Bu yüzden owner bloğu bağımsız pencere teyidi ister, çıktısı yönlendirilmiş host'u reddeder (`Assert-LocalConsole`)
ve koşum sonunda pencerenin kapatılmasını ister. Canlıdan önce `-Mode QrTest` ile QR'ın bu pencere + bu telefonla okunduğu
zararsız bir adresle (portal giriş sayfası) denenir.

## 6. Canlıda oluşacak kayıtlar ve kapanış

Yalnız yeni sentetik tenantta (ve yabancı sentetik tenantta): sentetik kullanıcılar, müvekkil(ler), dosya, borçlu, 30 dk
geçerli tek kullanımlık bağlantı, 1 gönderim + 1 alan (işaret metni), audit kayıtları. Gönderim kaydında ürün,
telefonun IP'sinin tuzsuz sha256 özetini ve tarayıcı bilgisini tutar (ÜB-3). Redis'te hız sınırı sayaçları.
**Kapanış:** bağlantı USED (gönderim olduysa) ya da REVOKED; yerel ve dış public 404; kullanıcılar pasif (tokenVersion++);
dosya CLOSED. Gerçek müvekkil verisi, kanonik tablolar ve bildirimler değişmez. Sıfır dışı çıkışta otomatik tekrar ve
otomatik Recover yoktur.

## 7. Ayrı ürün bulguları (bu pakete dahil edilmedi)

- **ÜB-1:** public doğrulayıcı Case CLOSED / kullanıcı durumunu denetlemez.
- **ÜB-2:** `expiresAt`'siz bağlantı süresizdir (bu paket 30 dk verir).
- **ÜB-3:** `sourceMeta.ipHash` tuzsuz `sha256(ip)`; IPv4 uzayı küçük olduğu için özet geri çözülebilir → ham IP'nin
  fiilen saklanması. Ürün düzeltmesi ayrı iş ve owner kararıdır.

## 8. İzole doğrulama

| Test | Sonuç |
|---|---|
| `extacc-selftest.js` (disposable PG 16 + sahte API + gerçek TLS) | **28/28** — X1 normal · X2 gönderim yok · X3 honeypot · X4 yanlış metin · X5 ikinci POST · X6 geç gönderim yarışı · X7 503 · X8 oluşturma zaman aşımı · X9 makbuz · X10 kanıt · X11 iptal hatası + Recover · X12 yanlış müvekkil · X13 gösterimsiz canlı reddi · X14 TLS · X15 konsolsuz koşum · S-1 sır/IP taraması · T-1…T-7 statik |
| `extacc-owner-block-selftest.ps1` (owner bloğunun GERÇEK fonksiyonları, AST) | PS 5.1 **25/25** · PS 7.6 **25/25** |
| `extacc-console-selftest.ps1` | **5/5** |
| qrcode-generator golden testleri | **5/5** |
| H5 regresyonu (paylaşılan dosyalar değişti) | `h5-url-selftest.js` 47/47 · H5 owner bloğu 27/27 (PS 5.1 + 7) · `h5-pin-selftest.ps1` 8/8 |

Negatif kontrol (koşum mutantları): geç gönderim algılaması kaldırıldı → X6 FAIL · satır yokken PASS → X2, X3, X6 FAIL ·
D-3 bağ denetimi kaldırıldı → X12 FAIL.

**Sınır:** sahte API ürünün yanıt biçimini ve submit mantığını taklit eder; ürünün kendisi burada koşmaz. Uçtan uca koşum
gerçek konsolda (adres gösterimiyle) ayrıca yapılmadı; gösterim modülü C-1…C-5 ile, koşumun konsolsuz reddi X15 ile ölçüldü.

## 9. D-8 kaydı (owner telefon ölçümü)

- **Zaman:** 27.09.2026, 21:14–21:15 (Türkiye saati). **Ağ:** owner beyanı: mobil veri.
- `https://bilgi.tellihukuk.com/`, `/auth/login`, `/api/auth/me`, `/api/portal/admin/documents/pending`, `/api/cases` → **403**
  (ekranda "HTTP ERROR 403"; owner ekran görüntüsüyle teyit etti). Tam admin yolu owner teyitli.
- Pozitif kontrol `/portal/login` → portal giriş formu görünür; giriş yapılmadı.
- **Ret katmanı ölçülmedi.** Tarayıcının hata görünümünden katman (Cloudflare / Caddy) çıkarılmaz; sunucu tarafında bu
  istekleri kaydeden log yoktur.
- **Kayıtlı kapsamla eşleşme:** `client-external-access-r01` §7 D-8 ölçütündeki dört yol (`/`, `/auth/login`, `/api/auth/me`,
  `/api/portal/admin/*`) ölçüldü; `/api/cases` ek. `/api/portal/admin/*` jokerinin yalnız bir örneği ölçüldü.
- **Kayıtlı kapsam dışında kalanlar** (ayrı iş; bu telefon testi tekrarlanmaz): diğer yöntemler, diğer personel yolları ve yol
  varyantları, tünele bağlı diğer ana makine adları.
- **Durum:** D-8 **kısmen kanıtlı**; kapatılmadı.

## 10. Dosyalar ve sha256

Owner bloğunda pinli (koşumun yüklediği dosyalar + QR denemesi) — paket digest
`BE1C0F6B2508A0909D0CB4B3EB48CD7500638AC172115E97007B0DD0FE89242E`:

| dosya (`project/docs/governance/` altında) | sha256 |
|---|---|
| `client-extacc-intake-chain-r01/scripts/extacc-intake-live-run.js` | `3DD2270CDFBC9DBE6462075D2C0F122E8B6CC665F909B7BFABB22C3FB0A174A5` |
| `client-extacc-intake-chain-r01/scripts/extacc-display.js` | `F257188DF66C429472C214D38D965C1E6F5A2EA490D348369AC68C5DC6F26867` |
| `client-extacc-intake-chain-r01/scripts/extacc-qr-test.js` | `61FBCEE86148DEA1B268A1B883F1690ED6F3D4BBD36EAEA29783F24D487B8B10` |
| `client-extacc-intake-chain-r01/scripts/vendor/qrcode-generator-1.4.4/qrcode.js` | `18AE399F81182BC9DE916E9C77B195DF20CC58D6F2D55A62B085A299F1BF1780` |
| `client-h5-intake-url-r01/scripts/h5-url-live-run.js` | `F2D0975DC9F9D148E4C889472FA11AE6A873A6BDF577C36657ED9BCB4FF9C359` |
| `client-live-acceptance-i13-r01/scripts/i13-lib.js` | `59BA7360F270AB66D0A892659A7569AFF1800D65B49415EF5FAD3B84DFEDD385` |
| `client-live-acceptance-i12-r01/scripts/i12-live-identity.js` | `9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F` |
| `client-acceptance-runners-i3-r01/scripts/i3-lib.js` | `56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3` |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | `DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7` |

Owner ve test araçları:

| dosya | sha256 |
|---|---|
| `scripts/extacc-owner-live-block.ps1` | `55500625BFE10216563C0BE594E072156BABA275284FD8F5A312EEA35CF350FD` |
| `scripts/extacc-selftest.js` | `71F9124CC2652ED7955CAD3F22EE96660C8BCDDC1A1338331FD0DADDE8EC405C` |
| `scripts/extacc-owner-block-selftest.ps1` | `2F73B670E68D082F886ECB25EF1989D415F0B6FDA363EC3BA740919FBB9684B0` |
| `scripts/extacc-console-selftest.ps1` | `FDCDCD2E6AE73A901A1AA58C92C0444961DB0129419CD6C6543A6CB1D7D37B57` |
| `scripts/extacc-console-probe.js` | `589ECF357281FA5594F986AB43422A966B5E0C06FF76DC7D1135DAB09A0629BB` |
| `scripts/vendor/qrcode-generator-1.4.4/package.json` | `7D8D2EE82626DF5FA88B21470AB43CBCB99E7AA50DC5757C73670BB7258B8714` |
| `scripts/vendor/qrcode-generator-1.4.4/test-qrcode.js` | `08C0FF0C5CC0F2B014E7F0A4291B17EDE92B9D929A2976792A3805952296A75B` |

QR aracı kaynağı: `https://registry.npmjs.org/qrcode-generator/-/qrcode-generator-1.4.4.tgz` · tarball 46.334 bayt ·
sha512 `HM7yY8O2ilqhmULxGMpcHSF1EhJJ9yBj8gvDEuZ6M+KGJ0YY2hKpnXvRD+hZPLrDVck3ExIGhmPtSdcjC+guuw==` ·
sha1 `63f771224854759329a99048806a53ed278740e7` · lisans MIT (`package.json` + `qrcode.js` başlığı).

**Paylaşılan H5 dosyalarındaki değişiklik** (`client-h5-intake-url-r01`): `h5-url-live-run.js` yalnız `module.exports`
genişletildi (davranış aynı); `h5-fake-api.js` gönderimsiz oluşturma gövdesi DTO ile aynı biçimde doğrulanır
(`expiresAt`/`maxUses`), public POST ürün mantığıyla eklendi, iptal gecikmesi ve yanlış bağlantı test senaryoları;
`h5-owner-live-block.ps1` yalnız pin satırı + paket digest (`48FF5E64…04D1`), blok sha `68DC7228C1A8BB560D23B1E9962365CD1171C178229EAE8C2137259A57839C55`.
H5 canlı kabul kaydı (H5 belgesi §8) koşum anındaki `d72fdaa7` değerlerine dayanır ve değişmez.

## 11. R01 inceleme düzeltmeleri (2026-09-27) — canlı koşum YOK

| # | Bulgu | Düzeltme | Negatif test |
|---|---|---|---|
| 1 | E-02 durdurma kapısı değildi: bağımsız incelemede sahte bağımlılıklarla `maxUses=99`, `expiresAt=null` → E-02 FAIL ama adres **1 kez gösterildi** | E-02 başarısızsa adres/QR **gösterilmez**, gönderim **beklenmez**; URL kapısı yalnız hesaplanır (istek yok) ki kapanışta iptal sonrası 404 ölçülebilsin; `finally` kapanışı çalışır | **X16**: E-02 FAIL → gösterim 0, telefon 0, public GET yalnız iptalden SONRA, bağlantı REVOKED, kapanış PASS, çıkış 2. R01 betiğine karşı aynı test: gösterim **evet**, telefon 1, 61 sn bekleme → FAIL (bulgu yeniden üretildi) |
| 2 | Canlı süreler pencereden devralınan `EXA_LINK_TTL_MS`, `EXA_WAIT_MS`, `EXA_POLL_MS`, `EXA_CREATE_TIMEOUT_MS`, `H5U_*_TIMEOUT_MS` ile değişebiliyordu | Koşum: bağlı DB `hukuk_db` ise (DB adı ya da beyan) süreler **sabit** — 30 dk geçerlilik, 25 dk bekleme, 5 sn yoklama, oluşturma 30 sn, iptal 30 sn, yerel/dış GET 15 sn; `H5U_*` değerleri koşum başında yazılır; etkin değerler kanıtta `params`. Owner bloğu: aynı değerleri `Set-RunEnv` içinde **açıkça** kurar; tablo eksikse koşum başlamaz; değişkenler başta ve sonda temizlenir. İzole testlerin kısa süreleri korunur | **P-1** / **P-2** (koşum), **T-8** (kaynakta doğrudan süre okuması yok), **L-1** (owner bloğu: devralınan `=1` değerleri node'a canlı değerlerle geçer), **L-2** (tablo eksik → node başlamaz) |
| 3 | Preflight "geçti" diyebiliyordu; Caddy/Cloudflared yalnız bilgi amaçlı ölçülüyordu, 8081'in diğer arayüzleri denetlenmiyordu | `Get-ExternalChainState` 8081'deki **tüm** dinleyicileri ölçer; `Assert-ExternalChain` Preflight ve Run'da **zorunlu**: en az bir `127.0.0.1:8081` dinleyicisi, **başka arayüzde dinleyici yok**, dinleyici pid = HY-Caddy servis pid'i, servis Running, Cloudflared Running. Recover'da **uygulanmaz** (kapanış dış zincir olmadan da yapılabilmeli). Canlı salt okuma ölçümü: 8081 yalnız 127.0.0.1, pid = HY-Caddy servisi, Cloudflared Running | **Z-0…Z-5** (birim), **Z-6** (Run zincir yokken GO sorulmadan durur, defter/node yok), **Z-7** (Preflight'ta kapı "GEÇTİ"den önce), **Z-8** (Recover zincir bozukken de çıkış 0) |
| 4 | QrTest owner "E" dışında yanıt verse de çıkış 0 veriyordu | Gösterim (makine) ve telefon okuması (owner beyanı) ayrı yazılır; yalnız büyük harf `E` → 0; `H` → 2; diğer/boş/küçük harf → 3; gösterim başarısızsa → DUR | **Q-E / Q-H / Q-? / Q-e / Q-boş / Q-G** |

Owner bloğu mutantları (her biri ilgili testte yakalandı): QrTest her zaman 0 → Q-H/Q-?/Q-e/Q-boş FAIL · canlı süreler kurulmuyor → L-1 FAIL ·
dış zincir kapısı kaldırıldı → Z-6/Z-7 FAIL.

Sonuçlar (son dosyalar): `extacc-selftest.js` **32/32** · owner bloğu PS 5.1 **42/42**, PS 7.6 **42/42** · konsol **5/5** ·
H5 regresyonu `h5-url-selftest.js` **47/47**, `h5-pin-selftest.ps1` **8/8**. `h5-fake-api.js`'e yalnız `linkOverride` test senaryosu eklendi.
H5 canlı kabulü ve telefon D-8 testi tekrarlanmadı.

## 12. Canlı kabul kayıtları (2026-09-28)

> **Kapsam:** yalnız **EXTACC intake zinciri**. H1–H8 **0/8** kalır; D-4…D-8 durumu **değişmez** (D-8 kısmen kanıtlı, §9).
> Ham kanıt, kimlikler, kullanıcı yolları ve sırlar repoya konmadı; kanıt yerel CLIENT kanıt kökündedir ve salt okuma
> incelendi, değiştirilmedi.

### 12.1 Koşum `2a967ff1` — FAIL (korunur)

- Çıkış **2** · 21 PASS · 1 FAIL (**E-13**) · manifest 6/6 · manifest sha256 `FF1FE6295E2334F311F44F637F7AB131382D0D60F4CDF24C0F540A6C1695F9A4`.
- **E-13 nedeni** (salt okuma inceleme; READ ONLY işlem; yalnız makbuzdaki tenant/bağlantı): kayıtlı adres değeri, belgelerde
  yer tutucu olarak geçen şablon metinle birebir eşit (koşumun gerçek işaret metni yerine yer tutucu yazılmış). Sınıf:
  **kullanıcı girdisi**; katkı eden etken: talimatta yer tutucunun yazılabilir biçimde verilmesi. Test kusuru değil (E-13 doğru
  FAIL verdi); ürün kusuru değil (saklama düz metin; form yalnız `trim`; E-13 aynı alanı okur). Bulgu notu sha256
  `8742A7F9BE7559E352FE6C3927CDD92E30885F09AF81558C003179049F64040A`.
- **Owner düzeltmesi:** form telefonda gizli sekmede açılamadı; koşum ofis PC'sinde yapıldı. Orijinal beyandaki telefon/mobil veri
  yanıtları **teyide muhtaç**; dış cihaz kabulü **PASS sayılmaz**. Not sha256 `AE355BE70E85DF2919DC5BC5505FFA11FC367D6520E99DE170CD95CA8B682423`.
- Kapanış tamamdı (bağlantı USED 1/1, tek kullanım sonrası yerel/dış 404, kullanıcılar pasif, dosya CLOSED; Recover gerekmedi).

### 12.2 Koşum `cff5c692` — PASS (intake kapsamı)

| Alan | Değer |
|---|---|
| Çıkış / özet | **0** · **22/22 PASS** · FAIL 0 · ÖLÇÜLEMEYEN 0 |
| Manifest | 6/6 eşit · sha256 `3CCF3415136FF674F79F8B1656DDB1FEE4360BA3DDC48C2C46F66F09C7A75563` |
| Koşum anındaki main / paket | `1caf3adc` / `BE1C0F6B2508A0909D0CB4B3EB48CD7500638AC172115E97007B0DD0FE89242E` (owner bloğu `55500625…50FD`) |
| Canlı süreler (kanıttaki `params`) | 30 dk geçerlilik · 25 dk bekleme · 5 sn yoklama · zaman aşımları sabit değerlerde |
| Gönderim | gönderim yapan uç çağrılmadı; betik public POST yapmadı |
| Kurtarma | gerekmedi |

**Makine ölçümleri:** gönderimsiz bağlantı 201; DB'de ACTIVE / 0-1 kullanım / `expiresAt` istenen değer; URL kapısı; gösterimden önce
yerel ve dış public GET 200; adres yalnız owner konsolunda; gönderim satırı ~180 sn içinde; **E-13 PASS** (tek ADDRESS alanı bu koşumun
işaret metnini içerir); tek gönderim makbuzdaki tenant/dosya/müvekkile bağlı, `CLIENT_SUBMITTED`; bağlantı **USED 1/1**, ACTIVE
bağlantı yok; kanonik `DebtorAddress` ve `ClientIntelStatement` önce/sonra aynı; bildirim/bilgi talebi/teslim kaydı 0;
**tek kullanım sonrası erişim kapanışı**: yerel ve dış public **404**; sentetik kullanıcılar pasif, dosya **CLOSED**.
E-17 yalnız dışlamadır: gönderimin IP özeti loopback/`unknown` değil — **mobil ağ kanıtı değildir**.

**Owner beyanı (makine ölçümü DEĞİL):** telefonda form açıldı, Gönder'e bir kez basıldı, "Teşekkürler" görüldü, Wi-Fi kapalı ve
mobil veri — hepsi `E`; beyan edilen gönderim saati **00:58**.

**Paylaşılan telefon görüntüsü (makine ölçümü DEĞİL):** görüntüyü **ChatGPT doğrudan inceledi** ve teşekkür ekranını, **5G** simgesini
ve **01:02** saatini gördüğünü bildirdi (owner'ın aktarımı). Görüntü **Claude tarafından doğrudan incelenmedi** ve kanıt dizinine
alınmadı. Beyan edilen gönderim saati (00:58, ofis PC'de verildi) ile görüntü saati (01:02, telefon) **ayrı tutulur**. Owner açıklaması:
**telefon ile PC saatleri farklı.** Bu yüzden iki saat arasındaki farktan gönderim ile ekran görüntüsü arasındaki süre **çıkarılmaz**;
saatlerin farkı ve hangisinin doğru olduğu **ölçülmedi**; saat ayarlarına dokunulmadı. Notlar: owner kanıt notu sha256
`12C2ED939982B57E354FD8D962B346FF3D3F8F25AE23BD104D872BFBEAD4986A` (içindeki "görüntü ~4 dk sonra" değerlendirmesi GEÇERSİZ; not
değiştirilmedi) · saat notu sha256 `A713BDCAD17DA4962FE3061B474D657117B3CC2E6DDE5B0D43B988AE4C70667F`.

**İzolasyon — yalnız ölçülen:** koşumdan önce ve sonra, **bu koşumun iki sentetik tenantı dışındaki** ve en az bir müvekkili ya da
kullanıcısı olan **33 tenantın** tenant başına müvekkil ve kullanıcı **kayıt sayıları** aynı. Kod (`i13-lib.js`
`isolationFingerprint`) yalnız bu koşumun tenantlarını dışlar; **önceki koşumların sentetik test tenantları bu 33'e dahildir**. Bu
yüzden "33 gerçek tenant" denemez. Ölçüm yalnız sayı dağılımıdır; ekleme/silme yokluğu ya da içerik bütünlüğü çıkarılmaz.
(Kanıttaki U-ISO etiketindeki "sentetik OLMAYAN" ifadesi bu nedenle kesin değildir; etiket düzeltmesi ayrı iştir.)

### 12.3 D-halkaları — kabul kapsamı

| Halka | Karar | Dayanak |
|---|---|---|
| **D-1** bağlantı dış cihazdan açılır | **kabul — intake kapsamı** | makine: dış adres zinciri GET 200, gönderim loopback dışından geldi · owner beyanı + ChatGPT'nin görüntü incelemesi: açılış telefonda, mobil veride. Cihaz/ağ kısmı makine ölçümü değildir |
| **D-2** form gönderilir | **kabul — intake kapsamı** | makine: gerçek public POST ile tek gönderim yazıldı, işaret metni doğru (honeypot değil) · owner beyanı: telefondan tek basış |
| **D-3** doğru büro/dosya/statü | **kabul** | makine: E-10…E-16 PASS |
| **D-9** erişim kapanışı | **kabul — yalnız bu intake koşumu** | makine: USED 1/1, ACTIVE yok, tek kullanım sonrası yerel/dış 404, kullanıcılar pasif, dosya CLOSED. **Portal, belge ve mesaj kapanışını kapsamaz** (D-4…D-7 ölçülmedi) |
| D-4 … D-7 | **değişmedi — ölçülmedi** | — |
| D-8 | **değişmedi — kısmen kanıtlı** (§9) | — |

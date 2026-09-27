# EXTACC R01 — Dış erişim intake zinciri canlı kabul paketi (D-1 / D-2 / D-3 / D-9)

> **DURUM: HAZIRLIK.** Canlı Run/Recover **başlatılmadı**. Bu belge canlı koşum GO'su değildir; GO biçimi
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
`EF95F7168FC4AEBF3BE6676C37EB6E064C2D9AEC80636B58C21D0503E923530C`:

| dosya (`project/docs/governance/` altında) | sha256 |
|---|---|
| `client-extacc-intake-chain-r01/scripts/extacc-intake-live-run.js` | `E8E435383EC7FF5033946B2906C8BFA0A4BBAE0AE526E12F6E68D91FCE59CFFC` |
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
| `scripts/extacc-owner-live-block.ps1` | `E3AEE595D0BECCC12C5492E6D106132B22FECEF18CF8D433E4C12C0219C14353` |
| `scripts/extacc-selftest.js` | `386A5E7D48C00429A23730DED61697C779C700BE544E10D992B63625143B3955` |
| `scripts/extacc-owner-block-selftest.ps1` | `E8F5C11298B425FED4CB9EF4740ED99ECAD706C6E59FC11DD6F6FF3B74698090` |
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

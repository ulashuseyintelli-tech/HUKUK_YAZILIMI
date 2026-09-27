# H5-URL — B-I11-1 GİDERME PAKETİ (R01): `PUBLIC_INTAKE_BASE_URL` + dar canlı kabul

> **DURUM (2026-09-27): H5-URL DAR CANLI KABUL KOŞULDU — runId `dda5d8c3`, çıkış 0, 13/13 PASS (§8).** Bu yalnız
> H5-URL dar canlı kabulüdür; H5 hizmet kabulü ya da D-1…D-9 kapanışı DEĞİLDİR. Hizmet kabulü **0/8**
> kalır; teknik sayaç **18/18** değişmez. Güncel akış **§6 (R02)** + düzeltmeler **§7 (R03)**'dedir; §2–§5 tarihsel kayıttır ve §4'teki
> "gönderim yoktur" iddiası **YANLIŞTIR** (bkz. §6.1).

## 1. Kusur ve kapsam

İ11 kaydındaki **B-I11-1**: `PUBLIC_INTAKE_BASE_URL` canlıda tanımsız. `ClientIntakeLinkService.buildUrl`
yalnız bu değişkeni okur:

```ts
const base = (process.env.PUBLIC_INTAKE_BASE_URL || '').replace(/\/+$/, '');
return `${base}/intake/${rawToken}`;
```

Değişken yoksa üretilen adres **göreli** olur (`/intake/<token>`) ve müvekkil tıklanabilir bir bağlantı almaz.
Bu bir **yapılandırma** kusurudur; ürün kodu değişmez, yeni yayın gerekmez, migration gerekmez.

> **DÜZELTME (2026-09-21, Codex final denetimi + izole tarayıcı provası):** Yukarıdaki cümle yalnız
> **bağlantı metninin mutlaklaşması** için doğrudur. H5'in amacına — müvekkilin bağlantıyı açıp formu
> göndermesine — **env değişikliği TEK BAŞINA YETMEZ**; yeni web derlemesi ve yeni yayın (R26) GEREKİR. Ölçülen iki
> engel: (1) canlı web derlemesi API'yi `localhost:8080` olarak gömülü çağırır (19 geçiş); (2) personel oturum
> katmanı `/intake/<token>` sayfasını muaf tutmadığı için girişsiz tarayıcı formdan `/auth/login`'e
> yönlendirilir. Aşağıdaki "HTTP 200" ölçümü sunucu yanıtıdır; istemci tarafı yönlendirmeyi ÖLÇMEZ. Giderme ve
> izole prova: `client-external-access-r01/CLIENT-EXTERNAL-ACCESS-PACKAGE-R01.md` §1.1, §10.

## 2. Kullanılacak değer — TAHMİN EDİLMEDİ, KAYITTAN DOĞRULANDI

| Dayanak | Ölçüm |
|---|---|
| Emsal karar | `CLIENT-WAVE5-FD-PROVIDER-OPS.md` §P2-EK: davet bağlantısı aynı sınıf kusurdaydı; **ürün kodu değiştirilmeden** env'e `WEB_BASE_URL` girildi ve bağlantı mutlaklaştı |
| Canlı `.env` | `WEB_BASE_URL` **tanımlı** (tek geçiş), `PUBLIC_INTAKE_BASE_URL` **tanımsız**. Ölçüm salt okuma; değer ekrana yazılmadı. Biçim: mutlak (`^https?://…`), ters bölü yok, host `localhost:3002` |
| Hedef sayfa | Rota `apps/web/src/app/intake/[token]/page.tsx` (dashboard grubu dışında). Canlı web: `http://localhost:3002/intake/<token>` → **HTTP 200** (salt okuma ölçümü) |

**Karar:** `PUBLIC_INTAKE_BASE_URL`, canlı `.env` içindeki **`WEB_BASE_URL` değerinin birebir kopyası** olur.
Owner bloğu değeri dosyadan okur; betikte sabit bir adres yoktur ve değer hiçbir çıktıya yazılmaz.

## 3. Owner bloğu — `scripts/h5-owner-env-block.ps1` (yükseltilmiş pencere)

- **Kapılar:** yükseltilmiş pencere · canlı dist `A8B17A38…53A0` (**R26**; pin 2026-09-24'te tazelendi, R25B `1524EDC1…4D4E` TARİHSEL) · pinli başlatıcı · `.env` sha **değişiklik öncesi** pin `7A7228B1…` · `:8080` tek dinleyici · `PUBLIC_INTAKE_BASE_URL` **yok** · `WEB_BASE_URL` tek geçiş ve mutlak.
- **Yedek:** `.env` **aynı dizine** `.env.bak-H5URL-<ts>` olarak kopyalanır (ACL değişmez), sha'sı doğrulanır.
- **Durdurma:** görev durdurulur; dinleyici 0, host süreci 0 ve görev `Running` değil olmadan dosyaya dokunulmaz.
- **Değişiklik:** dosya sonuna **tek satır** eklenir. Doğrulama bayt düzeyindedir: önceki satırların tamamı birebir aynı, satır sayısı tam +1, eklenen anahtar sayısı 1. Tutmazsa yedekten **otomatik geri alınır**.
- **Başlatma ve kapsam:** API başlatılır; `/api/auth/me` = 401, tek dinleyici, dist digest ve görev eylemi değişmemiş olmalı. Tutmazsa yedekten geri alınır.
- **Çıktı:** yeni `.env` sha'sı ve yedek yolu. **Değer yazdırılmaz.**
- **Geri alma:** `-Rollback -BackupFile <yol>`; yedeğin sha'sı taban pin değilse geri alma **başlamaz**.
- `-SelfTest`: yalnız kapıları koşar, hiçbir şey yazmaz. 2026-09-21 ölçümü: **PASS**.


> **PİN TAZELEME (2026-09-24; salt okuma, canlı koşum YOK).** Paket 2026-09-21'de yazıldığında canlı sürüm
> R25B ve başlatıcı P1-ÖNCESİ idi. O günden sonra R26 (Pencere A) ve P1 (Pencere B) canlıya alındı; bu yüzden
> owner bloklarındaki üç pin **bayat** kalmıştı ve bloklar kapıda DURACAKTI:
>
> | Pin | Eski (bayat) | Yeni (ölçülen canlı) |
> |---|---|---|
> | `h5-owner-env-block.ps1` `$EXP_DIST` | `1524EDC1…4D4E` (R25B) | `A8B17A38…53A0` (R26) |
> | `h5-owner-live-block.ps1` `$ExpLiveDist` | `1524EDC1…4D4E` (R25B) | `A8B17A38…53A0` (R26) |
> | `h5-owner-env-block.ps1` `$LAUNCH_PIN` | `CC634BBF…19B3` (P1-ÖNCESİ) | `DDCCD091…219C` (P1-SONRASI) |
>
> Paket digest'i (`DAF86D1E…D63B`) **değişmedi** — ölçüldü, dört araç dosyası aynı. Yeni `scripts/h5-pin-selftest.ps1`
> bu kusurun tekrarını yakalar: pinleri canlı ölçümle karşılaştırır ve ayrışma varsa FAIL verir. Koşum sonucu **5/5 PASS**.
> Bu değişiklik yalnız sabit pin değerleridir; akış, ölçüt ve geri alma yolu **değişmedi** ve canlı `.env`'e
> dokunulmadı.
>
> **Betik sha256 (tazeleme sonrası, çalıştırmadan önce karşılaştırılır):**
>
> | dosya | sha256 |
> |---|---|
> | `scripts/h5-owner-env-block.ps1` | `3226E4362339EE387C076BAB32443D18E12E2601CBC24CA54647DE5BB9982560` |
> | `scripts/h5-owner-live-block.ps1` | `4AE7B680D17FC692A9C60277DD3239ABE97622542F7B93A7738A9D395662C5CA` |
> | `scripts/h5-pin-selftest.ps1` | `D7073550F6C51DFBD37D017AAE4ECA2149C964122D1BF7E9FC4F5E6A0F00E43A` |

## 4. Dar canlı kabul — `scripts/h5-url-live-run.js` + `scripts/h5-owner-live-block.ps1`

Ölçütler (7 + kapanış):

| Ölçüt | Ne ölçer |
|---|---|
| U-00 | Ölçüm geçerliliği: elev1 ADMIN değil, yetki PARTNER bağından gelir |
| U-01 | `intakeUrl` mutlak (şema + host), ters bölü içermez |
| U-02 | `intakeUrl` = `<PUBLIC_INTAKE_BASE_URL>/intake/<ham token>` |
| U-03a | Hedef sayfa erişilebilir (web 200) |
| U-03b | Bağlantı uçta geçerli (API `/public/intake/<token>` 200). **503 → ÖLÇÜLEMEYEN**: hız sınırı Redis'e ulaşamazsa fail-closed 503 döner; bu geçersizlik kanıtı değildir |
| U-04 | Ham token yalnız oluşturma yanıtında; okuma ucunda yok |
| U-CLOSE | Erişim kapanışı: kullanıcılar pasif, Case CLOSED |
| U-ISO | Sentetik olmayan tenant dağılımı değişmedi |

**Gönderim yoktur.** Yalnız bağımsız bağlantı üretimi ucu çağrılır (`POST /client-intake-links/case/:caseId`);
bildirim akışı tetiklenmez. Ham token hiçbir çıktıya yazılmaz, yalnız sha256'sı raporlanır.

> **GERİ ÇEKİLDİ (R02, 2026-09-27, kaynaktan doğrulandı):** Yukarıdaki iki cümle YANLIŞTIR. Bu uç
> `ClientIntakeLinkService.create()` → `notifyLink()` → `dispatcher.dispatch()` zincirini koşar; yani **gönderim
> yapar**. R01 kabul betiği canlıda koşulmadığı için gönderim olmadı. R01 ayrıca kapanışta bağlantıyı **iptal
> etmiyordu**. Düzeltilmiş akış §6'dadır. U-03b satırındaki "Redis" nedeni de o provada **ölçülmemiş bir
> teşhisti**; R02 503 için neden yazmaz.

### 4.1 Disposable prova (2026-09-21) — canlı kabul DEĞİL

Aday dist `dist-r25b`, API `:8113`, disposable DB `:5443`:

| Koşum | Sonuç |
|---|---|
| `PUBLIC_INTAKE_BASE_URL` **girilmiş** | **7 PASS · 1 ÖLÇÜLEMEYEN** (U-03b, Redis yok → 503). U-01 mutlak, U-02 birebir eşit, U-03a web 200, U-04 sızıntı yok |
| `PUBLIC_INTAKE_BASE_URL` **yokken** (gerileme kanıtı) | **U-01, U-02 ve U-03a FAIL** — ölçüt kusuru gerçekten yakalıyor |

## 5. Sınırlar

- Canlıda `.env` değişikliği **API yeniden başlatması** gerektirir; bu kısa bir kesintidir ve owner penceresinde yapılır.
- Bu paket H5'in diğer ölçütlerini (H5-01…H5-06) yeniden ölçmez; onlar İ11'de kapandı.
- `PUBLIC_INTAKE_BASE_URL` dış ağdan erişilebilir bir alan adı değil, kayıtlı `WEB_BASE_URL` değeridir. Müvekkile
  dış ağdan ulaşılabilir bir adres gerekiyorsa bu **ayrı bir altyapı kararıdır** ve bu paketin kapsamı dışındadır.

## 6. R02 (2026-09-27) — gönderimsiz üretim, doğrulanabilir iptal ve kapanış

> **DURUM:** hazırlık. Canlı kabul **başlatılmadı**. Bu bölüm H5 veya H1–H8 için PASS/CLOSED **iddia etmez**.

### 6.0 Canlı durum (salt okuma ölçümü, 2026-09-27)

| Ölçüm | Değer |
|---|---|
| Canlı `.env` sha256 | `5C776BBEEE018EA5CC8192378D42D742FD4ABC1B6D0E9A3EA671CF463206908D` (owner uyguladı; **tekrarlanmaz**) |
| `PUBLIC_INTAKE_BASE_URL` / `PUBLIC_PORTAL_BASE_URL` | `https://bilgi.tellihukuk.com` (R05 owner kararı) |
| `PUBLIC_INTAKE_TRUSTED_PROXY_IPS` | `127.0.0.1` |
| Caddy | yalnız `127.0.0.1:8081` |
| Canlı dist | `A8B17A38…53A0` (R26) |

`scripts/h5-owner-env-block.ps1` artık **TARİHSEL**dir: `-SelfTest` dışında ilk satırlarda `exit 90` ile durur. Kapıları
zaten de dururdu (`.env` pini değişiklik öncesi `7A7228B1…`); red satırı bunu açık hale getirir. Değer kaynağı
artık `WEB_BASE_URL` değil R05 kararıdır; §2 ve §5'teki `WEB_BASE_URL` varsayımı eskidir.

### 6.1 Kaynaktan doğrulanan ürün davranışı

| Uç | Servis | Gönderim |
|---|---|---|
| `POST /client-intake-links/case/:caseId` (R01'in kullandığı) | `create()` → `notifyLink()` → `dispatcher.dispatch()` | **VAR** — R02 çağırmaz |
| `POST /clients/:clientId/cases/:caseId/intake-links` gövde `{"scope":["ADDRESS"]}` | `createForClientWorkspace()` → `createLinkRecord()` | **YOK** — R02 yalnız bunu çağırır |
| `…/create-and-deliver` | oluştur + teslim | **VAR** — R02 çağırmaz |
| `POST /client-intake-links/:id/revoke` | `revoke()` ACTIVE→REVOKED + denetim kaydı | — |

Yanıt biçimi `{data:{link, rawToken, intakeUrl}}`. `clientId` URL'dedir, gövdede değildir; yetki denetimi atlanmaz
(elev1 PARTNER bağıyla çağırır, ADMIN değildir).

### 6.2 Akış

1. Kurulum (sentetik tenant `ah-<runId>` + yabancı tenant) → **makbuz** diske yazılır.
2. Gönderimsiz üretim. Yanıt zaman aşımına uğrarsa kayıt **oluşmamış sayılmaz**; ölçütler ÖLÇÜLEMEYEN olur ve
   kapanış bu koşumun doğrulanmış sentetik kimlikleriyle (tenant + case + client) kaydı arar.
3. **URL kapısı:** `https` + beklenen origin + `/intake/<token>`, sorgu/parça yok. Geçmezse token içeren **hiçbir**
   adrese istek gönderilmez.
4. Geçerlilik: dış HTTPS sayfa (U-03a), **yerel** API (U-03b-L) ve **dış HTTPS** API (U-03b-D) ayrı ayrı ölçülür.
   Yönlendirme izlenmez; her istek süre sınırlıdır.
5. Kapanış — sıra değişmez: **önce** yetkili uçla iptal (kullanıcılar henüz aktif) → DB'de REVOKED (doğru tenant/
   case/client/bağlantı; yabancı tenantta bağlantı 0) → aynı token için yerel ve dış public 404 → **sonra**
   kullanıcı pasifleştirme (tokenVersion++) + Case CLOSED. İptal başarısız olsa da kullanıcı/dosya kapanışı çalışır.

### 6.3 Ölçütler

| Ölçüt | Ne ölçer | 200/404 dışı |
|---|---|---|
| U-00 | Ölçüm geçerli: elev1 ADMIN değil | — |
| U-01 | `intakeUrl` mutlak, ters bölü yok | — |
| U-02 | `intakeUrl` = `<base>/intake/<ham token>` | — |
| U-URL | URL kapısı (6.2/3) | geçmezse U-03* ÖLÇÜLEMEYEN |
| U-03a | DIŞ HTTPS sayfa 200 | 3xx FAIL (izlenmez) · 503/429/zaman aşımı ÖLÇÜLEMEYEN |
| U-03b-L | YEREL API `/public/intake/<token>` 200 | aynı |
| U-03b-D | DIŞ HTTPS API `/api/public/intake/<token>` 200 | aynı |
| U-04 | okuma ucunda ham token yok | — |
| U-REV-DB | bu koşumun tüm bağlantıları DB'de ACTIVE değil; yabancı tenantta bağlantı yok | — |
| U-REV-PUB-L / -D | iptal sonrası yerel / dış public 404 | 200 = iptal etkisiz (**çıkış 6**) · 503/zaman aşımı ÖLÇÜLEMEYEN |
| U-CLOSE | kullanıcılar pasif + Case CLOSED | — |
| U-ISO | sentetik olmayan tenantların müvekkil/kullanıcı **sayı dağılımı** | yalnız sayım; **tam veri bütünlüğü DEĞİLDİR** |

503 ve zaman aşımı için **neden yazılmaz** ve PASS sayılmaz. U-03a yalnız sunucu yanıtını ölçer; sayfanın tarayıcıda
kullanılabilirliğini ölçmez. Public SUBMIT (POST) yapılmaz.

### 6.4 Çıkış kodları ve kurtarma

| Çıkış | Anlam |
|---|---|
| 0 | tüm ölçütler PASS |
| 2 | en az bir FAIL |
| 3 | ÖLÇÜLEMEYEN var (FAIL yok) |
| 1 | koşum durdu (ör. TLS doğrulaması kapalı) |
| 4 | kimlik/hedef reddi — **yazma yok** |
| 5 | kullanıcı/dosya kapanışı doğrulanmadı |
| 6 | bağlantı iptali doğrulanmadı (en ağır) |
| 90 | owner bloğu kapıda durdu (node koşulmadı) |

5 veya 6'da kanıt dosyası `recovery` alanını ve makbuz yolunu taşır. Kurtarma: owner bloğu
`-Mode Recover -ReceiptFile <makbuz>` ile **bir kez**. Kurtarma kabul ölçütlerini **tekrarlamaz**; makbuz
kimliği (slug + id bağı) doğrulanmazsa hiçbir yazma yapmaz (çıkış 4). Aktif bağlantı varsa makbuzdaki sentetik
kullanıcıya geçici erişim verir, yetkili uçla iptal eder ve kapanışta bu erişimi yeniden kapatır (tokenVersion++).
Kurtarmada ham token bilinmediğinden public 404 ÖLÇÜLEMEYEN'dir; çıkış yalnız DB ölçümlerine bağlıdır.

### 6.5 Owner bloğu — `scripts/h5-owner-live-block.ps1` (normal PowerShell; yönetici gerekmez)

- **`-Mode Preflight`** salt okuma: GO sorulmaz; dosya, ortam ve DB yazılmaz. (`git fetch` yalnız yerel repo
  ref'lerini günceller.)
- **Kapılar (üç modda aynı):** `NODE_OPTIONS` / `NODE_TLS_REJECT_UNAUTHORIZED` / `NODE_EXTRA_CA_CERTS` tanımlıysa dur ·
  main senkron ve temiz · koşumun **yüklediği beş dosyanın** tek tek pini + paket digest'i (R01 `i12-live-identity.js`'i
  atlıyordu) · canlı dist · `.env` sha · `PUBLIC_INTAKE_BASE_URL` birebir · tek `:8080` · başka kabul süreci yok ·
  DB kimliği. Uyuşmazlık **otomatik kabul edilmez**; blok durur.
- **`-Mode Run`** tek seferlik: GO ref yerel girilir; biçim + defter + önceki tüketim kayıtları + repo literali ile
  tekrar kullanım reddedilir; sha256 GO defterine **koşumdan önce** yazılır. Literal hiçbir dosyaya yazılmaz.
- **`-Mode Recover`**: yalnız kapanış; `-ReceiptFile` zorunlu; GO sorulmaz.
- Gizli ortam değişkenleri `finally` içinde silinir; node çıkış kodu değiştirilmeden `exit $rc` ile taşınır.
- Dosya UTF-8 **BOM** ile başlar (PS 5.1 BOM'suz UTF-8'i cp1252 okur ve ayrıştıramaz).

### 6.6 İzole doğrulama (canlı DB/API/DNS/tünel KULLANILMADI)

`scripts/h5-url-selftest.js`: disposable PostgreSQL 16 (canlı sürümün 130 migration'ı) + canlı sürümün Prisma
istemcisi + `scripts/h5-fake-api.js` (ürün yanıt **biçimini** taklit eden sahte API) + gerçek TLS'li sahte dış
sunucu (sertifika doğrulaması açık; test sertifikası `NODE_EXTRA_CA_CERTS` ile). DB URL loopback/5447/`ah_h5_test`
değilse test başlamaz.

| Senaryo | Sonuç |
|---|---|
| T1–T2 normal + **gönderim yok** (yasak uç 0 çağrı, POST uçları izinli kümede, gövde yalnız `scope`) | PASS |
| T3 oluşturma zaman aşımı (kayıt oluştu, yanıt yok) → çıkış 3, kayıt bulundu ve iptal edildi | PASS |
| T4 beklenmeyen origin → çıkış 2, token içeren adrese 0 istek, kapanış tamam | PASS |
| T5 iptal hatası → çıkış 6, bağlantı ACTIVE ölçüldü, kullanıcı kapanışı yine çalıştı, kurtarma → 0 | PASS |
| T6 temizlik hatası (DB tetikleyicisi) → çıkış 5, iptal önce yapıldı, kurtarma → 0 | PASS |
| T7 503 → ÖLÇÜLEMEYEN, neden yazılmadı | PASS |
| T8 302 → FAIL, yönlendirme izlenmedi | PASS |
| T9 TLS kapalı → çıkış 1 · T10 http origin → çıkış 4; ikisinde de DB'ye yazma yok | PASS |
| T11 36 sır × 27 dosya taraması (token, parola, JWT, DB URL, GO, Authorization) | sızıntı 0 |
| S-1…S-8 statik (yüklenen dosya = pin listesi, BOM, `exit $rc`, `finally`, Preflight yazmaz, defter sırası) | PASS |

Toplam **36/36**. Negatif kontrol: gönderim yapan uca dönen mutant **20/36**, iptali atlayan mutant **26/36** —
testler bu kusurları yakalıyor. `scripts/h5-pin-selftest.ps1` (salt okuma) **8/8**: P-6 `.env` pini, P-7 paket
pinleri, P-8 tarihsel env bloğunun reddi eklendi.

Sınır: sahte API ürünün yetki/iş kurallarını ölçmez. Ürünün gönderimsiz olduğu kaynaktan doğrulanmıştır (6.1);
testler kabul betiğinin davranışını gerçek DB durumlarına karşı ölçer.

### 6.7 Ayrı ürün bulguları — kabul betiği düzeltmesine DAHİL EDİLMEDİ

- **ÜB-1:** public doğrulayıcı (`validateActiveLink`) yalnız bağlantının status/expiresAt/useCount alanlarına bakar;
  **Case CLOSED, müvekkil veya kullanıcı durumunu denetlemez**. Kapatılmış dosyanın iptal edilmemiş bağlantısı
  geçerli kalır. R02 bu yüzden iptali kapanıştan önce yapar. Ürün düzeltmesi ayrı iş ve owner kararıdır.
- **ÜB-2:** owner'ın belirttiği gövdede `expiresAt` yoktur; böyle üretilen bağlantının süre sınırı yoktur ve yalnız
  iptal ya da kullanım sınırıyla kapanır. R02 gövdeyi değiştirmedi; süre sınırı eklenmesi ayrı owner kararıdır.

Ürün kodu ve migration değişikliği **yoktur**.

### 6.8 Dosya sha256 (R02) — GEÇERSİZ, bkz. §7.5

Koşumun yüklediği dosyalar (owner bloğunda pinli):

| dosya (`project/docs/governance/` altında) | sha256 |
|---|---|
| `client-h5-intake-url-r01/scripts/h5-url-live-run.js` | `561D202DB3136B2BD956B8B68AA087B570BAAD99F7635B6B624CA55DF1158943` |
| `client-live-acceptance-i13-r01/scripts/i13-lib.js` | `59BA7360F270AB66D0A892659A7569AFF1800D65B49415EF5FAD3B84DFEDD385` |
| `client-live-acceptance-i12-r01/scripts/i12-live-identity.js` | `9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F` |
| `client-acceptance-runners-i3-r01/scripts/i3-lib.js` | `56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3` |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | `DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7` |
| **paket digest** (göreli yol NUL sha LF, ordinal sıra) | `2A96C424817DFECC29CCF33A512FC64068374DFE68F8EB98D2BD86A74E4C1ECA` |

Owner ve test araçları (çalıştırmadan önce karşılaştırılır):

| dosya | sha256 |
|---|---|
| `scripts/h5-owner-live-block.ps1` | `1210EAFA5AC72595E5FE014E90C4278D637518A1F5020868F02DAF75A6A05A79` |
| `scripts/h5-pin-selftest.ps1` | `5C46011E83E5CE10EB51250746630FC59300666B8D96531ABB85B025311FD423` |
| `scripts/h5-owner-env-block.ps1` (tarihsel) | `E0590FA51D0D5957396CDD49B1A561708E8A0FF3F1E7BE506100578E512A16E5` |
| `scripts/h5-url-selftest.js` | `1005D21FCAFDC80EDB6937014120CEECE6521E53B25711A7B76EDE70C432BC76` |
| `scripts/h5-url-selftest-reqtree.js` | `2B0C43386A4C0A0943F0968188616F097EEB7B2F7FBC6197B2CC8C3BED3F9AB7` |
| `scripts/h5-fake-api.js` | `4AECCF8A2EE3A754CC1166ACA017C7120A9CC79A5F33592EED2B93F8BFB589FF` |

## 7. R03 (2026-09-27) — inceleme bulgularının düzeltmesi

> **DURUM:** hazırlık. Canlı Run/Recover **başlatılmadı**. H5 / H1–H8 için PASS/CLOSED iddiası **yoktur**. `.env`,
> servisler, DNS ve ürün kodu değişmedi. §6.8'deki R02 sha değerleri **geçersizdir**; güncel değerler §7.5'tedir.

### 7.1 F-1 — Gecikmiş bağlantı oluşturma (`h5-url-live-run.js`)

**Kusur (R02):** oluşturma isteği zaman aşımına uğradığında kapanış DB'de kayıt bulamazsa "iptal edilecek bağlantı yok"
diye U-REV-DB PASS veriyordu. İstek sunucuda sürüyorsa kayıt kapanıştan **sonra** ACTIVE olarak oluşur ve public
doğrulayıcı Case/kullanıcı durumuna bakmadığı için (ÜB-1) geçerli kalır. Ölçüldü: R02 betiği bu senaryoda çıkış **3**,
U-REV-DB **PASS** verdi; kayıt ardından ACTIVE oluştu.

**Düzeltme:** oluşturma sonucu sınıflandırılır — `confirmed` (201 + link id), `none` (4xx: sunucu kesin reddetti),
`uncertain` (zaman aşımı, taşıma hatası, 5xx, eksik yanıt). `uncertain` iken iptal ancak kayıt DB'de **görülürse**
kanıtlanmış sayılır; kayıt yoksa U-REV-DB FAIL, çıkış **6**, kurtarma gereksinimi korunur. `confirmed` iken yanıttaki
link id DB'de tek kayıt olarak bulunmalıdır. **Bekleme eklenmedi**: bekleme işlemin tamamlandığının kanıtı değildir.
Makbuz, oluşturma isteğinden **önce** `createAttemptedAt` ile, sonra (en iyi çaba) `createOutcome`/`createLinkId` ile
güncellenir; Recover aynı kuralı makbuzdan uygular.

### 7.2 F-2 — Makbuz ve sonuç kanıtı yazma hataları (`h5-url-live-run.js`)

- Makbuz yazılamazsa (ya da oluşturma denemesi makbuza işlenemezse) oturum açma ve oluşturma isteği **gönderilmez**;
  o ana kadar kurulan sentetik veri yine kapatılır; çıkış 1. Kimlikler sonuç kanıtının `receipt` alanındadır.
  Makbuz diskte yoksa kurtarma talimatı bunu açıkça yazar.
- Sonuç kanıtı yazılamazsa çıkış **0 olamaz → 7** (Run ve Recover). İptal (6) ve kapanış (5) hataları önceliğini korur.
- Öncelik: **6 > 5 > 7 > 1 > 2 > 3 > 0**.

### 7.3 F-3 — Gerçek node çağrısının çıkış kodu (`h5-owner-live-block.ps1`)

- Kapılar node'u doğrular (`Resolve-NodeExe`): PATH'te **çalıştırılabilir dosya** olarak çözülür (fonksiyon/alias
  gölgesi yok sayılır), `--version` çağrısı sentinel ile ölçülür, çıktı `vX.Y.Z` olmalıdır.
- `Invoke-Node` node'u **dosya yoluyla** çağırır; çağrıdan önce `$global:LASTEXITCODE = -999`, hemen sonra yakalanır.
  Başlatma istisnası, Int32 olmayan kod ya da kalan sentinel → **91**. Eski LASTEXITCODE başarı sayılmaz.
- node 0 döndüyse sonuç kanıtı dosyası bulunmalıdır; yoksa **7** (`Complete-NodeRc`). Kanıt dosyası koşumdan önce
  varsa blok durur (`Assert-FreshEvidence`; eski dosya silinmez). Recover kanıt dizini adına rastgele ek eklendi
  (aynı saniyedeki iki Recover aynı dizini paylaşıyordu — öz-test V-3 bu kusuru yakaladı).
- Run/Recover akışları fonksiyona alındı (`Invoke-RunMode`, `Invoke-RecoverMode`); akışın `catch` bloğu, node
  koşmuş ve sıfır dışı dönmüşse o kodu korur, aksi halde 90.
- `$PSNativeCommandUseErrorActionPreference = $false` (PS 7'de yerli sıfır dışı çıkış istisnaya dönmez).

**Dürüst sınır:** R02 gövdesi (`& node …; return $LASTEXITCODE`) geçersiz ya da silinmiş bir node dosyasında istisna
fırlatıyordu; akışın `catch` bloğu bu durumda 90 verirdi, 0 değil. Eski LASTEXITCODE'un başarı sayıldığı ölçülen durum,
`node` adının uygulama yerine bir **fonksiyon/alias gölgesine** çözülmesidir: node hiç koşmaz, önceki kod döner
(öz-test R-7: R02 gövdesiyle node çağrısı 0, dönen kod eski değer).

### 7.4 Doğrulama (canlı DB/API/DNS/tünel ve canlı owner akışı KULLANILMADI)

| Test | Sonuç | Kapsam |
|---|---|---|
| `h5-url-selftest.js` | **47/47** | 36 regresyon + T12 gecikmiş oluşturma (koşum 6, Recover-önce 6, serbest bırakma sonrası kayıt ACTIVE, Recover-sonra 0) · T13 makbuz yazılamıyor (login 0, oluşturma 0, kurulum kapatıldı, çıkış 1) · T14 kanıt yazılamıyor → 7 · T15 kanıt + iptal hatası → 6 · T16 Recover kanıt yazılamıyor → 7 |
| `h5-owner-block-selftest.ps1` PS 5.1 | **27/27** | wrapper'ın GERÇEK fonksiyonları AST ile yüklenir; akış çalışmaz. Önceki kod 0 iken node başlatılamaz/dosya yok → Run ve Recover **91**; kodlar değişmeden taşınır; 0 + kanıt yok → 7; node doğrulaması; gölge `node`; GO tekrar kullanımı; ortam temizliği |
| `h5-owner-block-selftest.ps1` PS 7.6 | **27/27** | aynı |
| `h5-pin-selftest.ps1` | **8/8** | canlı pinler (salt okuma) |

Negatif kontroller: T12–T16 R02 (main `f0c3f2b1`) betiğine karşı **39/47** (T12-a/b/c, T13-a/b, T14, T16 FAIL; S-1
mutant adı nedeniyle). Owner bloğu testi, birebir R02 `Invoke-Node` gövdesiyle **19/27** (PS 5.1 ve PS 7; R-4, R-5,
R-7, V-4, V-5, I-1, S-1, S-2 FAIL).

### 7.5 Dosya sha256 (R03)

Koşumun yüklediği dosyalar (owner bloğunda pinli):

| dosya (`project/docs/governance/` altında) | sha256 |
|---|---|
| `client-h5-intake-url-r01/scripts/h5-url-live-run.js` | `E2D8B2E9236495CEF10F95A778EDFDC4B18EB9AAEC6090936DC847F6A271DA52` |
| `client-live-acceptance-i13-r01/scripts/i13-lib.js` | `59BA7360F270AB66D0A892659A7569AFF1800D65B49415EF5FAD3B84DFEDD385` |
| `client-live-acceptance-i12-r01/scripts/i12-live-identity.js` | `9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F` |
| `client-acceptance-runners-i3-r01/scripts/i3-lib.js` | `56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3` |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | `DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7` |
| **paket digest** | `19EC0A315C42E5F1F5E8DB2398BDC53190179299A666D6F10422A6DE5E3F8B56` |

Owner ve test araçları:

| dosya | sha256 |
|---|---|
| `scripts/h5-owner-live-block.ps1` | `43DD4A943A16F882232C9C3F4205FAFC0557BF3CB356C1BF1893D8AEF9F11E30` |
| `scripts/h5-owner-block-selftest.ps1` | `FCF6229C5A5A7B8037553193948F6C2989C0812B6F786AA9D349226CD9083A86` |
| `scripts/h5-pin-selftest.ps1` | `5C46011E83E5CE10EB51250746630FC59300666B8D96531ABB85B025311FD423` |
| `scripts/h5-url-selftest.js` | `FC2EA16A471C237F6394F79FA5A878184199C9445CECA402921D59DC4BF0ACF9` |
| `scripts/h5-fake-api.js` | `79C908548629D6A8E9C8B798873AC8C3AB531679A15C12616032B1FBE304DA85` |
| `scripts/h5-url-selftest-reqtree.js` | `2B0C43386A4C0A0943F0968188616F097EEB7B2F7FBC6197B2CC8C3BED3F9AB7` |
| `scripts/h5-owner-env-block.ps1` (tarihsel) | `E0590FA51D0D5957396CDD49B1A561708E8A0FF3F1E7BE506100578E512A16E5` |

## 8. H5-URL DAR CANLI KABUL KAYDI (2026-09-27) — runId `dda5d8c3`

> **Kapsam:** yalnız **H5-URL dar canlı kabul** koşumudur. Hizmet kabulü (H1–H8) **0/8** kalır ve bu kayıt onu
> artırmaz; D-1…D-9 dış erişim kabul zincirinin (`client-external-access-r01` §7) hiçbir halkasını **kapatmaz** (§8.5).
> Owner GO'su ile tek seferlik koşuldu; GO literali hiçbir dosyaya yazılmadı (yalnız sha256'sı yerel GO defterinde).

### 8.1 Koşum kimliği

| Alan | Değer |
|---|---|
| runId | `dda5d8c3` |
| Paket revizyonu | R03 (`record=H5-URL-LIVE-RUN`, `revision=R03`) |
| Koşum anındaki main | `d72fdaa7416a52f4a092fc405d526bd912cab9c7` |
| Owner bloğu sha256 | `43DD4A943A16F882232C9C3F4205FAFC0557BF3CB356C1BF1893D8AEF9F11E30` |
| Paket digest (kapıda ölçülen) | `19EC0A315C42E5F1F5E8DB2398BDC53190179299A666D6F10422A6DE5E3F8B56` |
| Canlı dist / `.env` (kapıda ölçülen) | `A8B17A38…53A0` / `5C776BBE…908D` |
| Çıkış kodu | **0** |
| Ölçüt özeti | **13/13 PASS** · FAIL 0 · ÖLÇÜLEMEYEN 0 |
| Kurtarma | gerekmedi (`recovery.gerekli=false`); Recover koşulmadı |

### 8.2 Ölçütler

| Ölçüt | Sonuç | Gözlem |
|---|---|---|
| U-00 | PASS | elev1 ADMIN değil; yetki PARTNER bağından |
| U-01 | PASS | `intakeUrl` mutlak, `https`, host `bilgi.tellihukuk.com` |
| U-02 | PASS | `intakeUrl` = `https://bilgi.tellihukuk.com/intake/<ham token>` |
| U-URL | PASS | beklenen origin + `https` + `/intake/<token>` |
| U-03a | PASS | DIŞ HTTPS sayfa 200 |
| U-03b-L | PASS | YEREL API `/public/intake/<token>` 200 |
| U-03b-D | PASS | DIŞ HTTPS API `/api/public/intake/<token>` 200 |
| U-04 | PASS | okuma ucunda ham token yok |
| U-REV-DB | PASS | bu koşumun tek bağlantısı ACTIVE → **REVOKED** (yetkili iptal ucu 201); oluşturma sonucu `confirmed` ve DB kaydıyla kanıtlı; yabancı sentetik tenantta bağlantı 0 |
| U-REV-PUB-L | PASS | iptal sonrası YEREL public API aynı token için **404** |
| U-REV-PUB-D | PASS | iptal sonrası DIŞ HTTPS public API aynı token için **404** |
| U-CLOSE | PASS | iki sentetik tenantta aktif kullanıcı 0 (tokenVersion++); dosya **CLOSED** (1 dosya bu koşumda kapatıldı), aktif dosya 0 |
| U-ISO | PASS | bkz. §8.3 |

Bağlantı gönderimsiz uçtan üretildi (`POST /clients/:clientId/cases/:caseId/intake-links`, HTTP 201). Gönderim yapan
uçlar çağrılmadı (`dispatchEndpointCalled=false`); **e-posta/SMS gönderimi ve public form POST'u yoktur**. Çağrılan uçlar:
login · gönderimsiz oluşturma · dış sayfa GET · yerel ve dış public GET · okuma GET · iptal POST.

### 8.3 İzolasyon — sınırı

29 sentetik olmayan tenantta, tenant başına kullanıcı ve müvekkil kayıt sayıları önce/sonra aynı (özet `5a03064f8481ea4b`).

Bu ölçüm **yalnız sayı dağılımıdır**. Hiç ekleme veya silme yapılmadığı (sayıyı koruyan ekleme+silme bu ölçümle
ayırt edilemez), kayıt içeriklerinin ya da diğer tabloların değişmediği sonucu **çıkarılamaz**.

### 8.4 Kanıt

Kanıt yerel CLIENT kanıt kökünde, `h5url-live-dda5d8c3-20260927-200318` dizinindedir; repoya **konmadı** (ham kanıt
kamuya açık repoda tutulmaz). Kanıt salt okuma incelendi, değiştirilmedi.

| dosya | sha256 |
|---|---|
| `goref-consumed.json` | `294E2FDC05F762BC86D614A18D2D317170F67918E4E7D093BB85C210D947D4AD` |
| `h5url-evidence.json` | `B294819AB40785AA8015BE41A9321F1E9BAC49FA2764135EDD5A55BCC5683F9F` |
| `h5url-run.log` | `7958BAE3EDAD46372B010BCF898F22B486D9342C3B28DCB4A639B39E496BAEDD` |
| `h5url-setup-receipt.json` | `DB1CBBA5B0262DB7F3142834A25FD1BE7E8F51BBE5E91A6D7680546B816527DD` |
| `owner-block.json` | `AF47B6E68C583719C74F890A07C581A1AD7B713D39F3462EE6491139767721B3` |
| `SHA256-MANIFEST.txt` | `67FFC6620F913F4C33536F9CE5401B8C9FF41C637E1B88CD3FD93CA35DD71772` |

Manifest doğrulaması **5/5** eşit; manifestte olmayan ya da eksik dosya yok. Altı dosyada ham token, Authorization/
Bearer, DB bağlantı dizesi, GO literali ve parola öneki taraması: eşleşme **0**. GO defteri tek satır ve tüketim
kaydının sha256'sıyla eşit; `literalWritten=false`.

### 8.5 D-1…D-9 eşleştirmesi (bu kayıt hiçbir halkayı KAPATMAZ)

D-zinciri `client-external-access-r01` §7'de tanımlıdır ve **hedef ağdan (mobil veri)** koşulur. H5 koşumunun dış
istekleri canlı sunucunun kendisinden, genel DNS üzerinden `bilgi.tellihukuk.com`'a gönderildi (HTTP durum kodu
ölçümü; tarayıcı değil). §10'daki D-1…D-9 PASS tablosu **izole provadır**, canlı kanıt değildir.

| Halka | Durum | Dayanak / eksik |
|---|---|---|
| D-1 intake bağlantısı dış cihazdan açılır | **kısmen kanıtlı** | U-03a dış HTTPS sayfa 200 ve U-03b-D dış API 200 gerçek genel host üzerinden. Eksik: dış cihaz/hedef ağ, tarayıcıda sayfanın açılıp formun görünmesi |
| D-2 form gönderilir | **ölçülmedi** | public POST bilinçli olarak yapılmadı |
| D-3 gönderim doğru büro/dosya/statüde | **ölçülmedi** | gönderim yok |
| D-4 portal girişi dış cihazdan | **ölçülmedi** | — |
| D-5 portal parola sıfırlama | **ölçülmedi** | — |
| D-6 belge yükleme/indirme/silme | **ölçülmedi** | — |
| D-7 mesaj gönderme/okuma | **ölçülmedi** | — |
| D-8 personel yüzeyi dışarıdan kapalı | **ölçülmedi** | H5 personel yollarını denemez |
| D-9 erişim kapanışı | **kısmen kanıtlı** | H5'in kendi sentetik kümesi için ölçütün üç parçası kanıtlı (kullanıcılar pasif, Case CLOSED, iptal sonrası dış public uç 404). Eksik: D-2…D-7 halkalarının oluşturacağı portal kullanıcısı, gönderim, belge ve mesaj kapanışı; hedef ağdan ölçüm |

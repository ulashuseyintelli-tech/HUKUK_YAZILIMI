# H5-URL — B-I11-1 GİDERME PAKETİ (R01): `PUBLIC_INTAKE_BASE_URL` + dar canlı kabul

> **DURUM (R02, 2026-09-27): `.env` UYGULANDI (owner) · DAR CANLI KABUL KOŞULMADI.** Bu belge owner onayı
> değildir. Kabul koşumu ayrı owner GO'su ister. H5 için PASS/CLOSED **yazılmamıştır**; hizmet kabulü **0/8**
> kalır; teknik sayaç **18/18** değişmez. Güncel akış **§6 (R02)**'dedir; §2–§5 tarihsel kayıttır ve §4'teki
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

### 6.8 Dosya sha256 (R02)

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

# CLIENT DIŞ ERİŞİM PAKETİ (R01) — müvekkil cihazından HTTPS ile intake ve portal

> **DURUM: HAZIRLIK — CANLIYA UYGULANMADI, YAYIN YAPILMADI.** Bu belge internete açma yetkisi değildir.
> Alan adı ve sağlayıcı seçimi owner kararıdır; aşağıdaki her yer tutucu parametredir.
> Teknik sayaç **18/18**, hizmet kabulü **0/8** — bu paket ikisini de değiştirmez.
>
> **R05 OWNER KARARI (2026-09-26):** Müvekkile açık web adresi **`https://bilgi.tellihukuk.com`**; önceki
> `form.tellihukuk.com` önerisinin **yerine** geçer. Gönderen e-posta **`bilgi@tellihukuk.com`** olarak korunur.
> Aktif plan bölümleri (§3, §6, §13, §14, §19) bu değerle güncellendi; §15, §17 ve §18'deki `form` örnekleri
> **tarihsel kayıttır**. Çakışma ölçümü: §19.10. Bu karar hesap açma, alan adı satın alma veya yayın yetkisi değildir.

## 1. Ölçülen engel: canlı web derlemesi API'yi `localhost:8080` çağırıyor

`apps/web/src/lib/api-transport.ts:24` → `API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'`
ve istek `${API_BASE_URL}/api${endpoint}` olarak kurulur. Bu değer **derleme anında** paketin içine gömülür.

**Ölçüm (2026-09-21, canlı derleme, salt okuma):** `HY_W4_RELEASE23/project/apps/web/.next/static` altında
`http://localhost:8080` **19 kez** gömülü.

**Sonuç:** Uzak cihazdaki tarayıcı API'yi kendi makinesinde arar. Dış erişim **yalnız yapılandırmayla (`.env`)
sağlanamaz** — bu belgenin önceki sürümünde ima edilen "env değişikliği yeter" yorumu GEÇERSİZDİR. **Yeni bir web
derlemesi ve yeni bir yayın adayı (R26) ZORUNLUDUR.** Owner onayı ister.

### 1.1 Codex denetimiyle eklenen iki ölçülmüş kusur (2026-09-21)

| # | Kusur | Canlıdaki etkisi | Giderilişi (bu PR) |
|---|---|---|---|
| K-A | Portal çözümleyicisi (`lib/config/portal-api-url.ts`) production'da `NEXT_PUBLIC_API_URL` yoksa **hata fırlatır**; canlı derlemede bu değişken tanımsız | Canlı portal arayüzü API'ye **hiç** ulaşamaz (giriş dâhil) — dış erişimden bağımsız olarak | Tarayıcıda env **hiç verilmemişse** aynı origin (boş taban); verilmiş ama geçersiz değer ve sunucu tarafı eskisi gibi fail-fast |
| K-B | Personel oturum katmanı (`lib/auth-context.tsx`) `/intake/<token>` sayfasını muaf tutmuyor | Girişsiz müvekkil formu açınca `/auth/login`'e **yönlendirilir**; form kullanılamaz. İ11/H5 kanıtları API düzeyindeydi, tarayıcı yolunu ölçmedi | Yalnız `/intake/` öneki muaf (portal emsali). Test düzeltmeden önce FAIL, sonra PASS |

### 1.2 Seçilen tasarım: aynı origin `/api`

`lib/api-base-url.ts` (yeni): `NEXT_PUBLIC_API_URL` verilmişse o kullanılır; verilmemişse ve sayfa **yerel olmayan**
bir host'tan açılmışsa taban **boş** döner → istekler `/api/...` olarak sayfanın kendi origin'ine gider ve kenar katmanı
`/api` yolunu API'ye yönlendirir. `localhost`/`127.0.0.1` ve sunucu tarafında eski `http://localhost:8080` korunur, yani
personel yüzeyinin iç kullanımı **değişmez**. Intake, portal, genel API taşıması ve hata raporlayıcı aynı çözümleyiciyi
kullanır.

**Personel erişimi bozulmaz — `next.config.js` fallback rewrite:** `/api/:path*` → `API_INTERNAL_URL`
(varsayılan `http://127.0.0.1:8080`). Personel sunucuyu `localhost` dışında bir adla (makine adı, LAN IP) açarsa aynı
origin `/api` isteği web sunucusu üzerinden iç API'ye taşınır; bugünkü derlemede bu durumda istek kullanıcının kendi
makinesine gidiyordu. `fallback` sınıfı sayfa/dosya eşleşmesini gölgelemez (web'de `app/api` rotası yok). Dış erişimde
kenar katmanı `/api`'yi **doğrudan** API'ye yönlendirir; rewrite dış yolda kullanılmaz. Doğrulama: sahte iç hedefle
(`127.0.0.1:8114`, canlı 8080'e dokunulmadı) gerçek derleme — GET/POST yöntem ve sorgu dizesiyle taşındı, `/portal/login`
ve `/intake/*` sayfa olarak kaldı; birim testi `next-config-api-rewrite.test.ts` (3).

**Sonuç: alan adı derlemeye GÖMÜLMEZ.** R26 web derlemesi `NEXT_PUBLIC_API_URL` **tanımsız** yapılır; alan adı yalnız
kenar katmanında ve API `.env`'inde (`PUBLIC_*_BASE_URL`) yer alır. Alan adı değişirse web yeniden derlenmez.

Testler: `api-base-url-same-origin.test.ts` (8) · `portal-api-url.spec.ts` ([10] → [10a]/[10b]; 17) ·
`auth-context-portal-delegation.spec.ts` (+4: `/intake/<token>` muaf; `/intake`, `/intake-admin`, `/intakes/x`
muaf DEĞİL) · `next-config-api-rewrite.test.ts` (3). Tam web paketi yerelde **259 dosya / 2518 test PASS**;
`next build` çıkış 0. Web CI işi (`Web Tests`)
tüm vitest dosyalarını otomatik koşar — manifest gerekmez.

## 2. Dış erişim izin listesi — gerçek rota ve yöntemlerden çıkarıldı

Kaynak: `client-intake-public/*.controller.ts`, `portal/portal.controller.ts`, `apps/web/src/app/**`.

### 2.1 Yayınlanacak — müvekkil yüzeyi

| Yol | Yöntem | Not |
|---|---|---|
| `/intake/*` | GET | Form sayfası (`app/intake/[token]/page.tsx`) |
| `/portal`, `/portal/login`, `/portal/forgot-password`, `/portal/reset-password`, `/portal/cases`, `/portal/cases/*`, `/portal/documents`, `/portal/financial-disclosures`, `/portal/messages`, `/portal/poas`, `/portal/profile` | GET | Portal sayfaları |
| `/_next/*`, `/favicon.ico` | GET | Next.js statik varlıkları — **olmadan sayfa çizilmez** |
| `/api/public/intake/:token` | **GET, POST** | Form okuma ve gönderimi |
| `/api/portal/login`, `/api/portal/forgot-password`, `/api/portal/reset-password`, `/api/portal/change-password` | **POST** | Kimlik akışları |
| `/api/portal/cases`, `/api/portal/cases/:id`, `/api/portal/financial-disclosures`, `/api/portal/financial-disclosures/history`, `/api/portal/financial-disclosures/:id`, `/api/portal/poas`, `/api/portal/notifications`, `/api/portal/notifications/unread-count`, `/api/portal/documents`, `/api/portal/documents/:id/download`, `/api/portal/messages`, `/api/portal/messages/unread-count` | **GET** | Okuma uçları |
| `/api/portal/notifications/:id/read`, `/api/portal/notifications/read-all`, `/api/portal/messages`, `/api/portal/messages/mark-read` | **POST** | Yazma uçları |
| `/api/portal/documents/upload` | **POST (multipart/form-data)** | Kenar katmanında gövde boyutu sınırı gerekir |
| `/api/portal/documents/:id` | **DELETE** | **GET/POST varsaymıyoruz**; DELETE açıkça izinli olmalı |

### 2.2 Yayınlanmayacak — personel yüzeyi ve yönetim

`/` ve tüm personel sayfaları · `/auth/*` · `/api/auth/*` · **`/api/portal/admin/*`** (portal hesabı açma/kapatma,
bekleyen belge onayı/reddi, büro mesaj listeleri) · `/api/` altındaki diğer tüm uçlar · seed ve ölçüm uçları.

`/api/portal/admin/*` uçları **personel** tarafıdır; müvekkil yüzeyiyle aynı ön ekte oldukları için kenar
katmanında **ayrıca** reddedilmelidir. Bu, izin listesinin en kritik satırıdır.

## 3. Kenar yöntemi ve topoloji (R03 — 2026-09-25)

> **R03 DÜZELTMESİ:** R02'de tünel "seçilen yöntem" olarak yazılmıştı. Sonradan ölçüldü ki
> **sunucunun sabit bir genel IP'si vardır** (§17) ve tünel **zorunlu değildir**. İki yol da aynı
> Caddy kararını kullanır; fark yalnız trafiğin sunucuya **nasıl ulaştığıdır**. Yol seçimi §17'dedir.

**Ortak omurga (her iki yolda aynı): YALNIZ loopback'te dinleyen Caddy.**

```
internet → Cloudflare kenarı (bilgi.tellihukuk.com)
         → cloudflared (giden 7844; gelen port AÇILMAZ)
         → Caddy 127.0.0.1:8081   ← yol VE yöntem kararının TAMAMI burada, varsayılan RET
         → Web 127.0.0.1:3002 (sayfalar + /_next)  ·  API 127.0.0.1:8080 (global prefix "api")
```

**Tünel yalnız Caddy'ye ulaşır.** `cloudflared-config.yml.template` R01'de API ve Web'e iki ayrı ingress
kuralı taşıyordu; bunlar yöntem kısıtı olmayan bir alternatif geçişti. R02'de tek ingress hedefi Caddy'dir,
son kural `http_status:404`'tür. Caddy çalışmıyorken tünel hiçbir şey sunamaz — kenar kararı atlanamaz.

**Yol dönüşümü YOKTUR.** API `main.ts:27` `setGlobalPrefix("api")` kullanır; `/api/portal/login` isteği
API'ye aynen `/api/portal/login` olarak gider. Web sayfaları da yol değiştirmeden 3002'ye taşınır.

**Neden yöntem kısıtı sağlayıcıda değil Caddy'de:** cloudflared belgesine göre ingress kuralları yalnız
hostname ve path eşler, **HTTP yöntemi eşlemez**. Sağlayıcı WAF'ıyla yöntem kısıtı yazmak, paketin regex
şablonundaki `matches` işlecini gerektirir; Cloudflare belgesi: *"Access to the `matches` operator requires a
Cloudflare Business or Enterprise plan."* Aynı 18 (yöntem, yol) çifti ve varsayılan ret davranışı **Caddy'de
eksiksiz** kurulabildiği için bu, ürünün zorunlu maliyeti değildir. `waf-rule.template.txt` ücretli planı olan
kurulumlar için **ikinci katman** olarak pakette kalır; tek başına gerekli değildir.

**Eşdeğerlik iddiası yoktur — ölçülen fark:** sağlayıcı WAF'ı isteği origin'e ulaşmadan keser; Caddy ise
istek tünelden geçip sunucuya ulaştıktan sonra, Web/API'ye ulaşmadan keser. İzin listesi ve varsayılan ret
aynıdır; **reddedilen trafiğin nerede tüketildiği** farklıdır.

**Alternatif: yerel ters vekil + 443 yönlendirme.** Genel IP, yönlendirici erişimi ve DNS A kaydı ister.
Ölçüm (2026-09-24): sunucuda yalnız özel IP `10.34.25.53/23`, 80/443 dinleyicisi yok, kurulu tünel/vekil/IIS
yok; etki alanı `telli.local` internete yönlendirilemez. Bu yüzden tünel seçilmiştir.
Sunucudan Cloudflare kenarına **TCP 7844 açık** ölçüldü (`region1/region2.v2.argotunnel.com`, 4/4 bağlantı).

**Kurulum sırasında, yayından önce ayrıca doğrulanacaklar:**
1. Sağlayıcının istemci IP'sini hangi başlıkla aktardığı.
2. Caddy'nin istemciden gelen `X-Forwarded-For`'u silip kendi değerini yazdığı — izole provada ölçüldü (§10.1),
   canlı zincirde tekrar ölçülür.
3. Caddy durdurulduğunda tünelin hiçbir şey sunamadığı.

## 4. İstemci IP'si — üründeki davranış izole ortamda sınandı

`client-intake-public/public-intake-client-ip.ts`: istemci IP'si **socket peer**'dir. `X-Forwarded-For` yalnız
peer `PUBLIC_INTAKE_TRUSTED_PROXY_IPS` **tam eşleşme** listesindeyse dikkate alınır.

İzole ölçüm (2026-09-21; canlı R25B dist'indeki derlenmiş modül, sunucu açılmadı, ağ isteği yapılmadı): **5/5 PASS**

| Senaryo | Sonuç |
|---|---|
| Allowlist boş, saldırgan XFF gönderiyor | Sahte değer **yok sayıldı**, peer kullanıldı |
| Allowlist boş, loopback peer | peer |
| Peer allowlist'te değil, XFF var | Sahte değer **yok sayıldı** |
| Peer allowlist'te, XFF var | XFF kullanıldı (amaçlanan davranış) |
| Peer allowlist'te, XFF yok | peer |

~~**#2730 (trust-proxy) bu topolojide GEREKLİDİR … canlıda değil.**~~ **DÜZELTME (2026-09-21, R26 paketi):** Bu
hüküm YANLIŞTI. `trust proxy=1` canlıda **zaten var**: canlı `main.js:8` `set('trust proxy', 1)`, kaynağı `006c4dd2`
(R24). #2730 davranışı değiştirmeyen bir refactor; aynı ayarı `trust-proxy.config.ts`'e taşıdı ve CI kapısını
güncelledi. Commit mesajında "hop ve başlangıç sırası değişmedi" yazıyor. **R26'ya ALINMADI.** Peer allowlist'e
eklendiğinde ürün `request.ip`'i okur; `request.ip` en sağdaki XFF değerini (1 hop) yansıtır. Bu davranış canlıda
bugün de geçerlidir.

### 4.1 Ş-3 — kenar, tünel topolojisinde YANLIŞ adresi yazıyordu (düzeltildi)

R01 şablonu `header_up X-Forwarded-For {remote_host}` kullanıyordu. Tünel topolojisinde Caddy'nin
gördüğü eş adres **tünel istemcisinin loopback adresidir**, müvekkilin adresi değil. Sonuç:

- `resolvePublicIntakeClientIp` peer'i (Caddy) allowlist'te bulur, `request.ip`'i okur → o da tek sabit değer;
- `PublicIntakeRateLimitGuard` anahtarı `sha256(ip)` olduğu için **bütün müvekkiller tek IP penceresine** düşer
  (`PUBLIC_INTAKE_IP_RATE_LIMIT_MAX`, varsayılan 20/dakika **herkes için ortak** olurdu);
- `sourceMeta.ipHash` bütün gönderimlerde aynı değeri taşırdı.

**Düzeltme:** kenar, tünel sağlayıcısının eklediği `CF-Connecting-IP` başlığını kullanır; başlık yoksa eş
adrese düşer. İstemcinin kendi gönderdiği `X-Forwarded-For` her durumda atılır (başlık `header_up` ile **tek
değere set edilir**, eklenmez).

**Ölçülmeyen sınır:** sağlayıcının, istemci göndermiş olsa bile `CF-Connecting-IP`'yi kendi değeriyle ezdiği
sağlayıcı belgesine dayanır; bu provada ölçülmemiştir ve canlı zincirde ayrıca doğrulanacaktır (§3 madde 1).
Caddy'ye dışarıdan doğrudan erişim yoktur: yalnız loopback dinler ve ona yalnız tünel istemcisi bağlanır.

## 5. Portal bağlantılarının personel bağlantılarından ayrılması

`PUBLIC_PORTAL_BASE_URL` eklendi (bu PR): `portal.service.ts` sıfırlama bağlantısı önce bu anahtarı okur,
yoksa **birebir eski zincir** (`WEB_BASE_URL` → `APP_BASE_URL`) çalışır. Personel daveti
(`auth/invite/user-invite.service.ts`) ve personel parola sıfırlama (`auth/password-reset/password-reset.service.ts`)
bu anahtarı **okumaz**; iç adreste kalır.

Regresyon: `portal-public-base-url.spec.ts` (6 test) + mevcut `credential-recovery.spec.ts` (9 test) → **15/15 PASS**.
Mutasyon kanıtı: değişiklik geri alındığında yeni spec'ten **2 test düşer**. Spec `pure/client-portal` manifestine bağlandı.

**Kayıt düzeltmesi:** `WEB_BASE_URL=http://localhost:3002` değeri "büro ağından erişilebilir" **değildir**; yalnız
sunucu makinesinde çözülür. Bu belgede ve kayıtlarda öyle geçmez.

## 6. Parametreler — alan adı beklenen yerler

| Parametre | Örnek | Nerede kullanılır |
|---|---|---|
| `<PUBLIC_HOST>` | `form.ornek-alanadi.tld` | Tünel/vekil host adı |
| `<OFIS_GENEL_IP>` | *(depo herkese açıktır; gerçek değer belgeye yazılmaz)* | Yol A'da `form` A kaydının hedefi ve yönlendirici NAT kuralı |
| `PUBLIC_INTAKE_BASE_URL` | `https://<PUBLIC_HOST>` | Canlı `.env` (yeni) |
| `PUBLIC_PORTAL_BASE_URL` | `https://<PUBLIC_HOST>` | Canlı `.env` (yeni; bu PR'ın eklediği anahtar) |
| `NEXT_PUBLIC_API_URL` | **TANIMSIZ bırakılır** | Web derleme zamanı — aynı origin tasarımı (§1.2); alan adı gömülmez |
| `PUBLIC_INTAKE_TRUSTED_PROXY_IPS` | tünel/vekil peer IP'si | Canlı `.env` (yeni) |
| `WEB_BASE_URL` | **değişmez** | Personel yüzeyi iç adreste kalır |

Alan adı belli olmadan bu paketin **yerel hazırlığı durmaz**: kod değişikliği, testler ve izin listesi hazırdır.

## 7. Kabul zinciri — yalnız eksik halkalar

Tekrarlanmayacaklar: İ16'nın 12 canlı ölçütü, izolasyon ölçütleri, H5-02a/H5-03/H5-04/H5-05/H5-06 (İ11), U-01/U-02/U-04.

| Halka | Kim ölçer | PASS ölçütü |
|---|---|---|
| **D-1** Sentetik intake bağlantısı dış cihazdan açılır | Owner (mobil veri) | Sayfa açılır |
| **D-2** Form sentetik veriyle gönderilir | Owner | Gönderim tamamlanır |
| **D-3** Gönderim doğru büroda, doğru dosyada, beklenen statüde görünür | Koşucu (salt okuma) + yetkili aktörle liste | Kayıt doğru tenant/case; kanonik hedefler değişmemiş |
| **D-4** Portal girişi dış cihazdan çalışır | Owner + koşucu | Giriş 200; yanlış parola 401 |
| **D-5** Portal parola sıfırlama uçtan uca | Owner + koşucu | Bağlantı `PUBLIC_PORTAL_BASE_URL` ile üretilir, fragment'ta token, sıfırlama 200 |
| **D-6** Belge akışı: yükleme, indirme, silme | Owner + koşucu | multipart POST, GET download, **DELETE** çalışır |
| **D-7** Mesaj akışı: gönderme ve okuma | Owner + koşucu | POST/GET 200; kapsam dışı 404 |
| **D-8** Personel yüzeyi dışarıdan **kapalı** | Owner + koşucu | `/`, `/auth/login`, `/api/auth/me`, `/api/portal/admin/*` → kenar reddi |
| **D-9** Erişim kapanışı | Koşucu | Sentetik kullanıcılar pasif, Case CLOSED, bağlantı iptali sonrası public uç kapalı |

Redis'in healthy olması PASS kanıtı sayılmaz; D-2 gerçek POST ile ölçülür. Gerçek müvekkil verisi ve gerçek
alıcıya gönderim yoktur.

## 8. Geri dönüş — yayını kapatmak YETMEZ

1. Tünel/vekil servisi durdurulur ve kaldırılır (Ş2'de 443 yönlendirmesi kapatılır).
2. `.env` yedeğinden geri yazılır; `.env` sha'sı taban pine döner.
3. API görevi durdurulup başlatılır; `/api/auth/me` 401, dist digest beklenen değerde.
4. **Alternatif dış erişim kalmadığı doğrulanır:**
   - Makinede tünel/vekil servisi **yok** (servis listesi ölçümü).
   - Dinleyicilerin bağlanma kapsamı ölçülür; genel arayüzde beklenmeyen dinleyici yok.
   - Yönlendiricide 443/3002/8080 yönlendirmesi kalmadığı teyit edilir (owner ölçümü).
   - Yayınlanan host adı **dışarıdan** çağrılır ve yanıt vermediği görülür (owner, hedef ağdan).
   - Sağlayıcı tarafında tünel/kayıt silinir; DNS kaydı kaldırılır.

Bu beş kontrol birlikte "dış erişim kapandı" hükmünü üretir; yalnız servis durdurma yetmez.

## 9. Uygulanacak kesin sıra

**Alan adı gerektirmeyen adımlar (owner girdisi beklemeden hazırlanabilir):**

1. Bu PR → CI → merge → merge SHA'sında main CI SUCCESS.
2. **R26 aday paketi** (§11): merge SHA'sından web + API derlemesi, `NEXT_PUBLIC_API_URL` **tanımsız**; tam ağaç
   digest'leri; disposable regresyon (İ16 izolasyon ölçütleri + §10 izole prova yeniden). **Yayın yok.**
3. R26 **teknik yayını** — ayrı owner GO'su; R25B kalıbında hash kontrollü owner bloğu. Bu adım **dış erişimi açmaz**:
   kenar yoksa hiçbir şey dışarı yayınlanmaz. Kazanım: K-A (canlı portal arayüzü API'ye ulaşır) ve K-B (intake formu
   girişsiz açılır) iç ağda da düzelir.

**Alan adı ve owner kararı gerektiren adımlar:**

4. Owner girdileri (§13) alınır; `<PUBLIC_HOST>` sabitlenir.
5. Kenar kurulur (`templates/`): tünel + yöntem kuralı **ya da** Caddy. §3'teki üç doğrulama uygulanır — izin dışı
   yöntem reddi, IP başlığı, sahte XFF. **Henüz yayın yok** (host DNS'te çözülmez ya da tünel kapalı).
6. Owner elevated blokla `.env`'e `PUBLIC_INTAKE_BASE_URL`, `PUBLIC_PORTAL_BASE_URL`,
   `PUBLIC_INTAKE_TRUSTED_PROXY_IPS` eklenir; API yeniden başlatılır. (Blok, alan adı gelince bu paketteki H5 env
   bloğu kalıbında üretilir; hash'i o anda sabitlenir.)
7. **Dış erişim açılır** — ayrı owner GO'su.
8. §7 kabul zinciri D-1..D-9 hedef ağdan (mobil veri) koşulur.
9. Kayıt PR'ı: CI → merge → merge SHA'sında main CI.

Geri dönüş: adım 7 için §8 (beş kontrol); adım 3 için R25B geri dönüş yedeği kalıbı (§11).

## 10. İzole uçtan uca prova — ölçüldü (2026-09-21, runId `d2f6d24d`)

Ortam: aday web (bu dal, `NEXT_PUBLIC_API_URL` **tanımsız**) · aday API (bu dal, #2730 dâhil) · disposable DB ·
yöntem ve yol kısıtlı kenar taklidi (istemci XFF'ini silip kendi değerini yazar) · host `form.localtest.me:3100` (yerel
OLMAYAN ad). Başsız gerçek tarayıcı (Edge/Chromium, Playwright). Gerçek müvekkil verisi yok; gerçek alıcıya gönderim yok
(SMTP yakalayıcı). Kanıt: `Documents\CLIENT-EVIDENCE-20260911\edge-isolated-d2f6d24d-20260921\`.

| Halka | Sonuç | Gözlem |
|---|---|---|
| D-1 | PASS | Intake formu dış host üzerinden açıldı (K-B düzeltmesinden SONRA; öncesinde `/auth/login`'e yönlendiriyordu) |
| D-2 | PASS | "Teşekkürler" ekranı; `POST /api/public/intake/:token` 201, istek host'u = sayfa host'u |
| Aynı origin | PASS | Tarayıcıdan `localhost:8080`'e giden istek **0**; tüm `/api` istekleri `form.localtest.me:3100` |
| D-3 | PASS | Tek gönderim; doğru tenant, dosya, müvekkil; statü `CLIENT_SUBMITTED`; alan içeriği runId taşır (salt okuma tx) |
| D-3b | PASS | `sourceMeta.ipHash` = sha256(kenarın yazdığı istemci IP'si); vekil IP'si kaydedilmedi |
| D-4 | PASS | Portal girişi arayüzden 201, token alındı, `/portal`'a geçildi; dosya listesi 200 |
| D-5 | PASS | Sıfırlama bağlantısı host'u = `PUBLIC_PORTAL_BASE_URL`, token fragment'ta; sıfırlama 201; yeni parola 201, eski 401 |
| D-6 | PASS | Belge yükleme (multipart) 201 · indirme 200 · **DELETE 200** |
| D-7 | PASS | Mesaj gönderme 201 · listeleme 200 |
| D-8 | PASS | `/`, `/auth/login`, `/api/auth/me`, `/api/portal/admin/*`, `/api/cases` → 403; `DELETE /intake/:token` → 403 |
| D-9 | PASS | Bağlantı `USED` 1/1; kenardan tekrar GET/POST 404 |

**Bu prova canlı kabul DEĞİLDİR.** Hedef ağdan (mobil veri) gerçek alan adıyla koşu, gerçek kenar sağlayıcısının yöntem
ve IP davranışı ve geri dönüşün beş kontrolü canlıda ayrıca ölçülür (§7, §8).

### 10.1 Kenar şablonunun DAVRANIŞSAL provası — 2026-09-24, gerçek Caddy ile

R01'de şablonların izin listesiyle uyumu **statik** karşılaştırmayla kaydedilmişti. R02'de şablon gerçek
Caddy ile (docker `caddy:2-alpine`, digest `sha256:6aeddd44c3078b0f9a35206472a11420648a79c184603ef95957d0a20044cb2b`)
çalıştırılıp iki sahte arka uca bağlandı. Canlı 8080/3002 **kullanılmadı**, canlı `.env` okunmadı, DNS/tünel/yayın
işlemi yapılmadı. Koşucu: `scripts/edge-probe.ps1` → **PASS 8 / 8, çıkış 0**.

| Kapı | Ölçüm | Sonuç |
|---|---|---|
| B-1 | Üretilen sunucu 443 dinlemiyor | `listen=:8081` |
| B-2 | Otomatik HTTPS kapalı | `automatic_https={"disable":true}` |
| A-1 | Admin RET rotası üretilen yapılandırmada var | sıra 0 |
| A-2 | Admin RET, catch-all RET'ten **önce** | deny=0, catchAll=6 |
| C-1 | 38 izinli çiftin her biri **doğru** arka uca 200 | WEB 14 · API 24 |
| C-2 | 29 ret vektörü 403 ve arka uca **hiç** gitmedi | 29/29 |
| C-3 | 18 kodlama/normalizasyon vektörü izin listesini aşmadı | 18/18, tamamı 403 |
| C-4 | İstemcinin sahte `X-Forwarded-For`'u silindi | gönderilen `1.2.3.4, 5.6.7.8` → arka ucun gördüğü `172.17.0.1` |

Kodlama vektörleri: `%61dmin`, `admin%2Fdocuments`, `documents/x%2F..%2Fadmin%2F…`, `cases/../admin`,
`..%2Fadmin`, `//api/…`, `/./admin`, `/API/`, `/ADMIN/`, sondaki `/`, `;x=1`, `intake/../../auth/login`,
`_next/../auth/login`, `_next/%2e%2e/auth/login`, `%00`, `%252e%252e`, `%c0%af`. **Tamamı 403.**

**R01'de bulunan iki somut kusur (düzeltildi):**

| # | Kusur | Ölçülen kanıt | Düzeltme |
|---|---|---|---|
| Ş-1 | Site adresi `{$PUBLIC_HOST}` olduğu için `caddy adapt` **`listen [":443"]`** ve automatic_https AÇIK üretiyordu: Caddy tüm arayüzlerde 443 açıp ACME denerdi | `adapt` JSON çıktısı | Site adresi `{$CADDY_LISTEN:127.0.0.1:8081}`; `auto_https off`, `admin off` |
| Ş-2 | `respond @deny 403` site bloğunda serbestti; Caddy'nin varsayılan direktif sıralamasında `respond`, `handle`'dan **sonra** gelir → admin reddi fiilen erişilmezdi (catch-all 403 sonucu maskeliyordu) | `adapt` JSON'unda deny rotası **sıra 6**, catch-all **sıra 5** | Tüm karar tek `route { }` içinde, yazım sırasıyla |

**Ş-2 mutasyon kanıtı:** allow regex'ine `admin/documents/pending` bilerek sızdırıldı ve tek vektör
`GET /api/portal/admin/documents/pending` koşuldu. R01 kalıbıyla (deny serbest + `handle`'lar) **200, arka uç API**
— yani admin reddi ölüydü. R02 kalıbıyla (tek `route`, deny ilk) **403**. Bugünkü izin listesinde bu sızıntı
yoktur; mutasyon yalnız katmanın **etkili** olduğunu göstermek içindir.

**Şablonun varlığı kanıt sayılmamıştır:** yukarıdaki satırların hepsi koşulmuş isteklerin ölçümüdür.

Şablon izin listeleri (`templates/Caddyfile.template`, `cloudflared-config.yml.template`, `waf-rule.template.txt`)
bilinen 18 izinli ve 13 reddedilmesi gereken (yöntem, yol) çiftine karşı sınandı: hata 0. Şablonlar provadaki kenar
taklidinden **daha dardır** (provada portal okuma uçlarına POST/DELETE de geçiyordu; şablonda yalnız §2.1'deki yöntemler var).

### 10.2 İstemci IP zinciri — ürünün GERÇEK parçalarıyla ölçüldü (2026-09-24)

Koşucu `scripts/edge-client-ip-probe.ps1` → **PASS 7 / 7, çıkış 0**. API tarafı taklit değildir:
`express 4.21.2` + `trust proxy = 1` (canlı `main.js` ile aynı ayar, canlı dist'te `trust proxy', 1)` ölçüldü)
+ **canlı dist'ten** derlenmiş `public-intake-client-ip.js` (yalnız okundu, sunucu açılmadı)
+ hız sınırı anahtarının birebir kendisi: `sha256(çözülen ip)`.

| # | Ölçüt | Gözlem |
|---|---|---|
| I-1 | Tünel başlığı varsa ürün gerçek istemci adresini çözer | `CF-Connecting-IP: 203.0.113.9` → ürünün çözdüğü `203.0.113.9` |
| I-2 | İstemcinin sahte `X-Forwarded-For`'u ürüne **ulaşmaz** | gönderilen `9.9.9.9, 8.8.8.8` → ürünün gördüğü `203.0.113.9` |
| I-3 | Farklı müvekkiller **ayrı** hız sınırı sayacına düşer | `203.0.113.10`→`631f0814…` · `198.51.100.20`→`140cc81d…` |
| I-4 | Aynı müvekkilin istekleri **aynı** sayaca düşer | hash eşit |
| I-5 | Başlık listeye çevrilemez; ürün tek değer görür | `xff="203.0.113.9"` (tek öğe) |
| I-6 | Tünel başlığı yoksa sahte değer kullanılmaz | gönderilen `9.9.9.9` atıldı, kenar kendi gördüğü adresi yazdı |
| I-7 | Peer allowlist'te **değilse** ürün XFF'i yok sayar | `xff=7.7.7.7`, peer `127.0.0.1` → çözülen `127.0.0.1` |

**Ş-3 mutasyon kanıtı:** şablonda `{vars.client_real_ip}` yerine R01'deki `{remote_host}` konulduğunda
`203.0.113.10` ve `198.51.100.20` **aynı** sayaca (`346840d5…`, çözülen adres `172.17.0.1`) düştü.
Düzeltilmiş şablonda ayrıştı. Kusur gerçektir ve giderilmiştir.

## 11. R26 yayın / geri dönüş paketi — içerik ve kapılar

> **GÜNCELLENDİ (2026-09-21):** Somut R26 paketi `client-release-r26-r01/R26-RELEASE-PACKAGE-R01.md` belgesindedir.
> Aşağıdaki ilk taslağın farkları:
> - Kaynak bu PR'ın merge SHA'sı değil, `47fcf395` = R25B kaynağı `4443600a` + yalnız #2739 web + #2738.
> - Main'deki ilgisiz değişiklikler (#2716, #2727 migration, #2730) ALINMADI.
> - API bir birleşik artefakt: canlı R25B + 2 dosya.

| Bileşen | Kaynak | Not |
|---|---|---|
| Web | Bu PR'ın merge SHA'sı; `NEXT_PUBLIC_API_URL` tanımsız; `API_INTERNAL_URL` tanımsız (varsayılan 127.0.0.1:8080) | Tam `.next` + gerekli dosyalar; tam ağaç digest (Ordinal, relpath/NUL/UPPER sha/LF) |
| API | Aynı SHA; `prisma generate` → `nest build` → **çıkış 0 ölçülür** → tam dist digest | #2730 (trust proxy=1) + `PUBLIC_PORTAL_BASE_URL` (#2738) içerir |
| Migration | **YOK** (bu dal şemaya dokunmaz) | Aday derlemesinde migration listesi canlıyla karşılaştırılır; fark ≠ 0 → DUR |
| `.env` | R26 teknik yayında **DEĞİŞMEZ** | Dış erişim anahtarları adım 6'da, ayrı blokla |
| Geri dönüş yedeği | Yayın anında canlı R25B web + dist kopyası ("R26 yayını öncesi R25B geri dönüş yedeği") | Digest'i yayın kaydına yazılır |
| Kapılar | Tek canlı yürütücü · taban digest = `1524EDC1…` · hash kontrollü `& { }` blok · `powershell.exe -NoProfile -ExecutionPolicy Bypass -File` · çıkış ≠ 0 → DUR | R25B kalıbı |
| Bağımsız doğrulama | Digest · `/api/auth/me` 401 · web kök 200 · portal giriş sayfası · intake sayfası girişsiz açılır · `.env` sha değişmedi · görev/başlatıcı | Yayın kaydı PR'ı |

Kalan açık: R26 **teknik yayını**, canlı web derlemesinin (`localhost:8080` 19 kez gömülü) yerini alır. Bu, personel
yüzeyinin API adresini de değiştirir: `localhost`'ta davranış aynı, diğer host'larda rewrite üzerinden. Yayın sonrası
personel girişinin `localhost:3002`'den çalıştığı bağımsız doğrulamaya dâhildir.

## 12. Ayrı tutulan owner kararları — OFFICE A3 / C1 / C2 / C3

Tarihsel OFFICE kapanışı (2026-09-10) bu kalemlerin kabulü **sayılmaz**; dördü de o tarihten sonra birleşti ve hiçbiri
için tarihli owner kabul kaydı yok → **KARAR BEKLİYOR**. Kaynak: `product-backlog.md` OFFICE açık iş listesi.
Karşılanmış senaryolar yeniden koşulmaz.

| # | Mevcut etki | Eksik kabul | Önerilen işlem | Alternatif kanıt | Tahmini emek |
|---|---|---|---|---|---|
| A3 başlatıcı DB yeniden deneme (#2681) | Canlı başlatıcı `CC634BBF…` eski; kodsuz `exit 23` hâlâ PT15M beklemeye düşer (2026-09-11 kesintisinin ~11 dk'sı) | Canlıya alınmadı; üretim + host SHA pini + cutover yapılmadı | Başlatıcıyı repo kaynağından üret, host pinini yenile, owner cutover bloğu; kabul: kontrollü yeniden başlatmada çıkış kodu ve süre | CI 15 test (mutasyonla 9 davranış testi düşer) | Hazırlık 0,5 gün + owner penceresi |
| C1 `POST /cases` atomikliği (#2641 + #2645) | Kod canlı dist'in kaynağında (`006c4dd2`'nin atası; `git merge-base --is-ancestor` ölçümü) — canlı derlemeye dâhil | İşlevsel canlı senaryo koşulmadı | Kabul CI kanıtıyla sınırlanır ya da tek sentetik dosya açılışı + hata enjeksiyonsuz salt okuma kontrolü | #2641/#2645 PR CI | Karar yalnız; koşu gerekirse 0,5 gün |
| C2 AK-1a eki VIEWER onay sınırı (#2606) | Kod canlıda (aynı ölçüm); yalnız dist işareti ölçüldü | VIEWER aktörle karar reddi canlıda koşulmadı | Sentetik VIEWER ile tek 403 senaryosu ya da CI kanıtının kabulü | #2606 PR CI | 0,5 gün |
| C3 CLF-O0-01 / FD senaryoları (#2608 + #2612) | Kod canlıda; FD senaryoları canlıda **KOŞULMAZ** kaydı yerinde (üç ayrı kişi gerekir) | Canlı FD senaryosu yok | Mevcut "canlıda koşulmaz" kaydının kabulü **ya da** üç kişilik FD zinciri için owner kaynak kararı | #2608/#2612 PR CI + FD disposable kanıtları | Karar yalnız; koşu gerekirse 1 gün + üç kişi |

## 13. Canlı yayından önce owner'dan tek listede istenenler

**Eksik altyapı bilgileri (dış erişim için; R26 teknik yayını için GEREKMEZ):**
1. ~~Kullanılacak alan adı~~ → **BELLİ: `tellihukuk.com`, yayınlanacak ad `bilgi.tellihukuk.com` (R05; önceki öneri `form`)** (owner, 2026-09-24).
2. ~~DNS yönetimi kimde~~ → **ÖLÇÜLDÜ: Turhost yetkili DNS** (§14). Geriye kalan: **bölgenin tam kayıt dökümü**
   (AXFR reddedildi, otomatik tarama tam envanter sayılmaz) ve **kayıt firması** — NS değişikliği hangi panelden
   yapılıyor.
3. **Cloudflare hesabı var mı — BİLİNMİYOR.** Yöntem kısıtı için ücretli plan **gerekmez** (§3): yöntem kararı
   Caddy'dedir, `matches` işleci kullanılmaz.

**Owner kararları:**
4. R26 teknik yayını (K-A + K-B + aynı origin + `PUBLIC_PORTAL_BASE_URL`; #2730 GEREKMEZ, bkz. §4 düzeltmesi) —
   GO / beklet. Somut paket ve güncel tek liste: `client-release-r26-r01/R26-RELEASE-PACKAGE-R01.md` §9.
5. Dış erişimin açılması (§9 adım 7) — alan adı geldikten ve kenar doğrulandıktan sonra ayrı GO.
6. H8 "≤ 4 sn" kapsam cümlesinin değiştirilmesi — F04 paketindeki önerilen metin (uygulanmadı).
7. A3 / C1 / C2 / C3 — §12'deki her satır için ayrı karar.
8. Hizmet kabulü (0/8) — teknik hazırlıktan ayrı; her hizmet için açık owner kabulü.

## 14. DNS envanteri — TAM (owner paneli + yetkili sunucu, 2026-09-24)

Alan adı **`tellihukuk.com`**, yayınlanacak ad **`bilgi.tellihukuk.com`** (R05; bugün NXDOMAIN — hiçbir mevcut kaydı
etkilemez, §19.10).

**İki kaynak birleştirildi:** owner'ın Turhost cPanel DNS Yönetimi ekranı (4 sayfa, **36 kayıt**) ad ve tip
listesini verdi; her kaydın **tam değeri** yetkili sunucudan (`cpns1.turhost.com` = `37.230.110.110`) okundu.
Uzlaştırma sonucu **36 = 36**, eksik yok. Koşucu: `scripts/dns-zone-reconcile.ps1`.

**Owner dökümü zorunluydu — kanıt:** yalnız ad tahminiyle yapılan ilk tarama 10 ad bulmuştu; panel dökümü
**17 ek ad** ortaya çıkardı. Bunların arasında `ofis` (**farklı IP ve farklı TTL**) ve beş `_acme-challenge`
kaydı vardı; hiçbiri tahminle bulunamazdı.

| # | Ad | Tip | Değer | TTL |
|---|---|---|---|---|
| 1 | `@` | A | `94.199.205.185` | 14400 |
| 2 | `@` | MX | pref 0 → `tellihukuk.com` | 14400 |
| 3 | `@` | TXT | `v=spf1 include:_spf2.trwww.com include:_spf.trwww.com -all` | 14400 |
| 4 | `@` | TXT | `google-site-verification=kMggUMyhF1YBqF26puJDDYn2L9eZKmkiDgjYZH_h1QM` | 14400 |
| 5 | `@` | NS | `cpns1.turhost.com` | 86400 |
| 6 | `@` | NS | `cpns2.turhost.com` | 86400 |
| 7 | `ftp` | A | `94.199.205.182` | 14400 |
| 8 | `autodiscover` | A | `94.199.205.185` | 14400 |
| 9 | `autoconfig` | A | `94.199.205.185` | 14400 |
| 10 | `whm` | A | `94.199.205.185` | 14400 |
| 11 | `webdisk` | A | `94.199.205.185` | 14400 |
| 12 | `cpcalendars` | A | `94.199.205.185` | 14400 |
| 13 | `cpcontacts` | A | `94.199.205.185` | 14400 |
| 14 | `webmail` | A | `94.199.205.185` | 14400 |
| 15 | `cpanel` | A | `94.199.205.185` | 14400 |
| 16 | **`ofis`** | A | **`89.106.8.58`** | **3600** |
| 17 | `mail` | CNAME | `tellihukuk.com` | 14400 |
| 18 | `www` | CNAME | `tellihukuk.com` | 14400 |
| 19 | `_caldav._tcp` | SRV | `0 0 2079 tellihukuk.com` | 14400 |
| 20 | `_caldav._tcp` | TXT | `path=/` | 14400 |
| 21 | `_carddav._tcp` | SRV | `0 0 2079 tellihukuk.com` | 14400 |
| 22 | `_carddav._tcp` | TXT | `path=/` | 14400 |
| 23 | `_caldavs._tcp` | SRV | `0 0 2080 tellihukuk.com` | 14400 |
| 24 | `_caldavs._tcp` | TXT | `path=/` | 14400 |
| 25 | `_carddavs._tcp` | SRV | `0 0 2080 tellihukuk.com` | 14400 |
| 26 | `_carddavs._tcp` | TXT | `path=/` | 14400 |
| 27 | `_autodiscover._tcp` | SRV | `0 0 443 srvc105.trwww.com` | 14400 |
| 28 | `default._domainkey` | TXT | DKIM1/RSA — **411 karakterin tamamı ölçüldü**, sonu `…7dGE0s7gVg0rXuoiQIDAQAB;` | 14400 |
| 29 | `_dmarc` | TXT | `v=DMARC1; p=none;` | 14400 |
| 30 | `_cpanel-dcv-test-record` | TXT | `_cpanel-dcv-test-record=jvzff6IVeoUgBc2dftlOtF38OKou_x5G2OltQPswaEa9YQl0SNn43UDHLXLOBaMY` | 14400 |
| 31 | `_acme-challenge` | TXT | `HrviS4xxX4i6Zu3mNlRNOh4gLAE5nNrQZQ0vFniUBS4` | 14400 |
| 32 | `_acme-challenge.www` | TXT | `gqiUovnsaN8Ln-OirwGhpUgh_0F7KR1Q9e6SATWfZBE` | 14400 |
| 33 | `_acme-challenge.mail` | TXT | `ine_s2xGtv7vfk_66t7BuQTAaVgmIl-HyAkZZEeAP3o` | 14400 |
| 34 | `_acme-challenge.autodiscover` | TXT | `a2yVeoVqEkwwtsKuFrJfS6a50_q1uFwBjjhktfuGs4M` | 14400 |
| 35 | `_acme-challenge.webdisk` | TXT | `YeRf3r45DJJb726lST-ObqKm68ELG4611CMrAJtR2gs` | 14400 |
| 36 | `_acme-challenge.cpcontacts` | TXT | `1zx6EAvAeYBHhiAMhZcssoC-CASFmVHR9T_rFcVLr0A` | 14400 |

`CAA` kaydı **yok** (ayrıca sorgulandı). Kanıt dizini: `Documents\CLIENT-EVIDENCE-20260911\dns-inventory-20260924\`.

**Kesilmiş değer sorunu yaşanmadı:** panelde kısaltılmış görünen DKIM ve DCV kayıtlarının tam değerleri
yetkili sunucudan okundu; owner'ın düzenleme ekranı açmasına gerek kalmadı.

### 14.2 DNS TAŞIMASININ MADDİ ENGELİ — wildcard sertifika DNS-01'e bağlı (YALNIZ Yol B'de geçerli)

**Ölçüm (2026-09-24, salt okuma TLS el sıkışması):** `tellihukuk.com:443` sertifikası

| Alan | Değer |
|---|---|
| Konu | **`CN=*.tellihukuk.com` — wildcard** |
| Veren | `CN=YR1, O=Let's Encrypt` |
| Geçerlilik | 2026-09-01 → **2026-11-30** (ölçüm günü kalan **67 gün**) |

Let's Encrypt belgesi: DNS-01 için *"It also allows you to issue wildcard certificates."*; HTTP-01 için
*"This challenge cannot be used to issue wildcard certificates."*

**Sonuç:** bölgedeki altı `_acme-challenge` TXT kaydı süs değildir — wildcard sertifika **yalnız DNS-01 ile**
yenilenebilir ve bu kayıtları **cPanel/AutoSSL kendisi yazar**. Nameserver'lar Cloudflare'a çevrildiğinde
Turhost bölgesi artık yetkili olmaz; cPanel kaydı kendi bölgesine yazmaya devam eder ama **internet onu
görmez** → **wildcard sertifika yenilenemez.** Yenileme penceresi tipik olarak bitişten ~30 gün önce, yani
**2026-10-31 civarı** başlar.

Bu, ana siteyi, `webmail`, `cpanel`, `whm`, `webdisk` ve posta istemcisi (`autodiscover`/`autoconfig`)
yüzeylerini etkiler. **DNS taşıması bu kalem çözülmeden başlatılmamalıdır.**

**Sağlayıcı teyidi (Turhost, 2026-09-25):** *"yalnızca alan adının DNS hizmetini Cloudflare'a taşımak,
mevcut Turhost SSL sertifikasının otomatik yenilemesinin devam edeceği anlamına gelmemektedir"*;
*"Eğer mevcut yenileme sistemi Cloudflare DNS üzerinde DNS-01 doğrulamasını gerçekleştirebilecek şekilde
çalışmıyorsa, wildcard sertifikanın otomatik yenilenmesi mümkün olmayacaktır."* Sağlayıcı ayrıca web ve
e-posta hizmetlerinin Turhost'ta kalabileceğini, ancak kayıtların Cloudflare'da eksiksiz oluşturulup
web/e-posta kayıtlarının **DNS Only** tanımlanması gerektiğini bildirmiştir — bu, §15.1 adım 1-2 ile
birebir aynıdır.

**ÖNEMLİ:** Bu engel **yalnız DNS taşımasını içeren Yol B** için geçerlidir. §17'deki **Yol A** DNS
taşıması içermediği için bu engelle **hiç karşılaşmaz**: Turhost yetkili DNS kalır, wildcard sertifikanın
DNS-01 yenilemesi bugünkü gibi çalışmaya devam eder.

**Belgede bulunamadı:** cPanel AutoSSL'in harici DNS altında DCV'yi nasıl yürüttüğü kesin olarak
belgelenmemiştir (cPanel SSL kılavuzu yalnız *"your cPanel & WHM nodes must be able to manage its
authoritative DNS server"* kısıtını verir). Bu yüzden aşağıdaki seçenekler **owner kararıdır** ve hiçbiri
bu çalışmada uygulanmamıştır:

| Seçenek | Ne olur | Bedel / risk |
|---|---|---|
| **S-1** Turhost'a sorulur: AutoSSL harici DNS ile nasıl çalışır | Sağlayıcının kendi yanıtı bağlayıcı olur | Ücretsiz; tek adım, **ilk yapılacak budur** |
| **S-2** AutoSSL wildcard yerine **ad ad HTTP-01**'e alınır | Kök `A` DNS-only kaldığı için HTTP-01 çalışır; wildcard kaybedilir, her alt alan sertifikaya tek tek girer | Turhost/cPanel tarafında ayar; yeni alt alan eklendiğinde kapsam elle genişletilir |
| **S-3** Her yenilemede `_acme-challenge` kayıtları Cloudflare'a **elle** girilir | Çalışır ama her 60 günde tekrar eder | Sürdürülebilir değil; unutulursa sertifika düşer |
| **S-4** Alan adı Cloudflare'a **taşınmaz**; partial (CNAME) setup | Turhost yetkili kalır, AutoSSL bozulmaz | **Business planı**: 200 USD/ay yıllık faturalı ya da 250 USD/ay aylık |

### 14.1 Kayıt firması ve delegasyon — RDAP'tan ölçüldü (2026-09-24)

| Alan | Ölçülen değer |
|---|---|
| Kayıt firması (registrar) | **Çizgi Telekomünikasyon A.Ş.** (IANA 1534) |
| Alan adı durumu | `clientTransferProhibited` (transfer kilidi; NS değişikliğini engellemez) |
| Kayıt / bitiş | 2012-03-16 · **2028-03-16** |
| Son değişiklik | 2026-02-14 |
| DNSSEC | `delegationSigned: false` — üst bölgede imza yok (§14 DS ölçümüyle **tutarlı**) |
| **Üst bölge (.com) delegasyonu** | **`CPNS1.TURDNS.COM`, `CPNS2.TURDNS.COM`** |

**Dikkat — iki farklı NS adı aynı sunuculardır.** Üst bölge delegasyonu `*.turdns.com`, bölgenin kendi NS
RRset'i `*.turhost.com` adlarını taşır; ikisi de **aynı IP'lere** çözülür (`37.230.110.110`, `37.230.111.111`)
ve `cpns1.turdns.com` bölgeyi aynı SOA seri numarasıyla (`2026090101`) yetkili yanıtlar. Çözüm bozulmuyor,
ancak **NS değişikliği üst bölge delegasyonunda yapılır**: owner kayıt firması panelinde bugünkü değeri
`turdns.com` adlarıyla görecektir, `turhost.com` ile değil.

**Envanterin durumu: TAM DEĞİL.** Yetkili sunucu **AXFR (bölge aktarımı) isteğini reddetti**; bu yüzden yalnız
adı bilinen kayıtlar sorgulanabildi. Sorgulanıp **bulunamayanlar**: `smtp`, `portal`, `app`, `vpn`,
`mail._domainkey`, `dkim._domainkey`, `selector1/2._domainkey`, `google._domainkey`, `turhost._domainkey`.
Bir kaydın bulunamaması yokluğunun kanıtı değildir — yalnız o adın sorgulanmış olduğunu gösterir.

**Cloudflare'ın otomatik taraması tam envanter sayılmaz.** Cloudflare belgesi: *"the quick scan is not
guaranteed to find all existing DNS records."* Tam döküm yalnız Turhost panelinden alınabilir.

**Owner'dan istenen tek şey (§13 madde 2'nin yerine):** Turhost panelinden bölgenin **tam kayıt dökümü**
(varsa zone export, yoksa tüm satırların görüntüsü) — ad, tip, değer, öncelik, TTL ile. Yukarıdaki tablo
karşılaştırma tabanıdır; dökümde bu tabloda olmayan her satır **yeni bilgidir**.

## 15. Geçiş ve geri dönüş planı — uygulanmadı, owner GO'su bekler

**Zorunlu ücret: 0,00 USD.** Cloudflare Free ($0) + Zero Trust Free ($0) + Caddy (açık kaynak).
DNS taşıması **gereklidir**: partial (CNAME) setup yalnız Business/Enterprise'dadır (200 USD/ay yıllık
faturalı ya da 250 USD/ay aylık faturalı). Free planda tek yol full setup'tır, yani **nameserver'lar
Cloudflare'a çevrilir ve Turhost yetkili DNS olmaktan çıkar.** "Mevcut DNS düzeni korunuyor" değildir;
korunan şey **kayıtların içeriği**dir, otoritesi değil.

**Cloudflare Access kullanılmıyor.** Zero Trust Free'nin 50 kullanıcı limiti, Access ile korunan uygulamalara
kimlik doğrulayarak giren kullanıcıları sayar. Bu tasarımda müvekkiller ürünün kendi portal kimliğiyle girer;
limit **müvekkil sayısı sınırı değildir ve tünel kapasitesiyle ilgisi yoktur**.

### 15.1 Sıra — owner onayı İLK CANLI DEĞİŞİKLİKTEN ÖNCE

**Hazırlık ve doğrulama bitti; bundan sonraki adımların bir kısmı canlıdır.** Plan, ilk canlı değişiklikten
**önce** owner onayına sunulur. Onay verilmeden hiçbir canlı adım başlamaz.

| # | Adım | Canlı mı | Doğrulama |
|---|---|---|---|
| 0 | ~~Turhost'tan tam kayıt dökümü~~ **TAMAMLANDI** — 36/36 uzlaştırıldı (§14) | hayır | Eksik yok |
| **0b** | **§14.2 ÖN KOŞULU: wildcard sertifika DCV kalemi çözülür** (S-1…S-4 arasında owner kararı) | hayır | Karar yazılı; S-2 seçilirse AutoSSL ayarı geçiş ÖNCESİ yapılır |
| **—** | **OWNER ONAYI — geçiş penceresi ve plan** | — | Bu satırdan sonrası canlı etkilidir |
| 1 | Cloudflare'da bölge Free planda eklenir; tarama sonucu dökümle **satır satır** karşılaştırılır, eksikler elle girilir. **NS değiştirilmez** → yayın yok | hayır (trafik hâlâ Turhost'tan) | Cloudflare'daki kayıt sayısı = döküm satır sayısı |
| 2 | Proxy durumu ayarlanır: **yalnız `form` proxy'li**; diğerleri DNS-only | hayır | Her satırın bulut durumu tek tek okunur |
| 3 | Turhost'ta **kayıt** TTL'leri 300 sn'ye indirilir | **evet** | Yetkili sunucudan TTL=300 okunur |
| 4 | Eski kayıt TTL'i kadar (14400 sn) beklenir | — | Tekrar ölçüm |
| 5 | Kayıt firmasında NS Cloudflare'a çevrilir | **evet** | Üst bölgeden delegasyon sorgusu |
| 6 | Yayılma süresince **her iki** NS setinden ayrı ayrı sorgulanır; posta akışı sınanır | — | §14 tablosunun her satırı için eski = yeni |
| 7 | Tünel + Caddy kurulur; `form` CNAME'i tünele bağlanır | **evet** | Caddy durdurulunca tünel hiçbir şey sunmaz |
| 8 | `.env` anahtarları eklenir, API yeniden başlatılır (ayrı owner bloğu) | **evet** | `.env` sha, dist digest |
| 9 | §7 kabul zinciri D-1..D-9 hedef ağdan koşulur | **evet** | Ölçütler |

**İki ayrı onay vardır ve biri diğerinin yerine geçmez:** tablodaki **geçiş onayı** (DNS ve kenar kurulumu) ile §9 adım 7'deki **dış erişim GO'su** (tünelin gerçekten yayına alınması). Adım 7'ye kadar host dışarıdan çözülse bile tünel kapalıdır ve hiçbir şey yayınlanmaz.

**TTL uyarısı — 4 saat tüm geçiş için yeterli DEĞİLDİR.** Adım 3'te indirilen TTL yalnız **bölge içi
kayıtları** (A, MX, TXT…) etkiler. **NS delegasyonunun önbelleği ayrıdır:** üst bölgedeki delegasyon TTL'i
ölçülen değerle **86400 sn**'dir ve TLD tarafındadır — bizim kontrolümüzde değildir, kayıt TTL'ini indirmek
onu düşürmez. Ayrıca çözücülerin bir kısmı NS kayıtlarını kendi politikalarıyla daha uzun tutar. Bu nedenle
adım 5'ten sonra **eski ve yeni yetkili sunucuların bir süre aynı anda yanıt vereceği** kabul edilir; her iki
tarafta da kayıtlar **aynı** olduğu sürece bu süre kesintisizdir — **koşul, adım 1'deki satır satır eşitliğin
gerçekten sağlanmış olmasıdır.**

**Posta ve ana site neden bozulmaz:** MX ve TXT proxy'lenemez — Cloudflare belgesi: *"Only records used for IP
address resolution — A, AAAA, and CNAME records — can be proxied… Other record types (such as MX or TXT) are
always DNS-only."* Kök `A` ve posta adları **gri bulut** bırakıldığı için gerçek IP değişmez. Risk kayıt
tipinden değil **eksik kopyalamadan** gelir; adım 0 ve 1 bunun için vardır.

### 15.2 Geri dönüş — anında DEĞİLDİR

- **Turhost bölgesi silinmez.** Kayıtlar panelde olduğu gibi kalır; geri dönüşün ilk adımı kayıt firmasında
  NS'i `cpns1.turdns.com` / `cpns2.turdns.com` olarak geri almaktır.
- **Geri dönüş NS değişikliğiyle tamamlanmaz.** Üst bölge delegasyon TTL'i **86400 sn**'dir ve çözücüler eski
  delegasyonu bu süre boyunca (bazıları daha uzun) kullanmaya devam eder. Bu süre boyunca trafiğin bir kısmı
  **hâlâ Cloudflare'a gider**; bu nedenle geri dönüşte Cloudflare bölgesi **hemen silinmez**, kayıtlar orada da
  doğru kalır. Bölge ancak eski delegasyonun yayıldığı ölçümle doğrulandıktan sonra kaldırılır.
- Geri dönüş **ölçümle** kapanır: her iki NS setinden §14 tablosunun her satırı sorgulanır ve posta akışı
  sınanır; "NS'i geri aldım" tek başına kanıt değildir.
- **DNSSEC/DS sırası:** bölge bugün **imzasızdır** (ölçüm: `.com` içinde DS yok, DNSKEY yok, RDAP
  `delegationSigned: false`). Bu nedenle ileri geçişte DS adımı **yoktur** ve Cloudflare'da DNSSEC **kapalı
  bırakılır**. Eğer ileride açılırsa geri dönüş sırası zorunlu olur: **önce** kayıt firmasında DS kaydı
  kaldırılır → DS TTL'i kadar beklenir → **sonra** NS değiştirilir. Ters sırada bölge doğrulanamaz hale gelir
  ve alan adı **tamamen** çözülmez.
- Tünel ve Caddy tarafı: §8'in beş kontrolü aynen uygulanır.

## 16. Portal parola kurtarma — izin listesi ile ertelenmiş karar KARŞILAŞTIRMASI

İzin listesinde `POST /api/portal/forgot-password` ve `POST /api/portal/reset-password` **vardır** (§2.1).
Ertelenmiş parola kurtarma kararı ise **personel** yüzeyine aittir. İkisi ayrı uçlar, ayrı kod yollarıdır:

| | Personel (OFFICE) | Portal (müvekkil) |
|---|---|---|
| Uç | `POST /api/auth/forgot-password`, `/api/auth/reset-password` | `POST /api/portal/forgot-password`, `/api/portal/reset-password` |
| Kaynak | `auth/password-reset/password-reset.service.ts` | `portal/portal.controller.ts` → `portal.service.ts` |
| Bayrak | **`OFFICE_PASSWORD_RECOVERY_ENABLED`; kod varsayılanı `false`** (`password-reset.service.ts:40`) | Bu bayrağı **okumaz** |
| Yönetişim durumu | `LOCAL_CERTIFIED / PRODUCTION_UNCERTIFIED` + `DEFAULT_OFF / ENVIRONMENT_UNCERTIFIED` (`OFFICE-DELIVERY-MANIFEST.md` §12 · `office-spring-cleaning-reconciliation-r01/runtime-activation-reconciliation.md`) | Ayrı; bu paketin §5'i yalnız bağlantı tabanını (`PUBLIC_PORTAL_BASE_URL`) ayırdı |
| Kenar izin listesi | **YOK — reddedilir** (`/api/auth/*`; prova RET vektörlerinde ölçüldü) | VAR |

**Sonuçlar:**

1. Kenar izin listesi personel parola kurtarmayı **açmaz**; tersine dışarıya **kapatır**. Ertelenmiş karar ve
   `OFFICE_PASSWORD_RECOVERY_ENABLED` bayrağı bu çalışmada **değiştirilmemiştir**.
2. Portal uçlarının izin listesinde olması, **hizmetin canlıda etkin ya da kabul edilmiş olduğu anlamına
   gelmez.** Ölçülen durum: `PUBLIC_PORTAL_BASE_URL` canlıda tanımsızdır (H5 ile aynı sınıf), portal sıfırlama
   akışı yalnız **izole provada** (§10, D-5) çalıştı, **hizmet kabulü 0/8**'dir ve bu paket onu değiştirmez.
3. Kapalı bir özellik bu çalışma kapsamında **açılmamıştır**. Kenar yalnız hangi uçların dışarıdan
   **erişilebilir** olacağını belirler; bir ucun etkin olup olmadığını ürün kodu ve `.env` belirler.

## 17. Cloudflare zorunlu mu? — ölçülen cevap: HAYIR (2026-09-25)

### 17.1 Dış erişimin GERÇEK teknik gereksinimleri

Ürünün dışarıdan kullanılabilmesi için karşılanması gereken dört şey vardır. Hiçbiri belirli bir
sağlayıcı adı içermez:

| # | Gereksinim | Nasıl karşılanır |
|---|---|---|
| G-1 | İnternetten çözülen bir ad (`form.tellihukuk.com`) | Turhost'ta **tek** yeni kayıt. Mevcut 36 kayda dokunulmaz. |
| G-2 | O ada gelen trafiğin ofis sunucusuna ulaşması | **Yol A:** genel IP + yönlendiricide port yönlendirme · **Yol B:** giden tünel |
| G-3 | Geçerli TLS sertifikası | **Yol A:** Caddy'nin `form` için aldığı **tek adlı** sertifika (HTTP-01) · **Yol B:** sağlayıcı kenarında |
| G-4 | Yol + yöntem izin listesi, varsayılan ret | **Her iki yolda da Caddy** — §10.1'de 86 vektörle ölçülmüş, hazır |

**Cloudflare yalnız G-2'nin B varyantını ve G-3'ü sağlar.** G-1 ve G-4 ondan bağımsızdır; G-4 zaten
Caddy'ye taşınmıştır (§3). Yani Cloudflare **bir zorunluluk değil, gelen port açmama kolaylığıdır.**

### 17.2 Ölçüm: sunucunun sabit genel IP'si VAR

| Ölçüm | Sonuç |
|---|---|
| Sunucunun dış çıkış IP'si | Sabit bir TR adresi *(değer belgeye yazılmaz — depo herkese açıktır)* |
| Sahiplik (RDAP) | `TR-TURKNET-20081126`, `ALLOCATED PA`, ülke TR |
| Ters DNS (PTR) | `…static.turk.net` — adlandırma **statik** tahsisi gösterir |
| İç topoloji | Sunucu `10.34.25.53/23`, ağ geçidi `10.34.24.254` → NAT arkasında |
| Bugünkü dinleyiciler | 80 ve 443'te dinleyici **yok**; kurulu ters vekil/tünel/IIS **yok** |

R01'de "genel IP bağımlılığı" tünel lehine bir gerekçe olarak yazılmıştı; o gerekçe **bu ölçümle
düşmüştür**. `ofis.tellihukuk.com` kaydının hedefi ise ofise ait değildir — RDAP'a göre **Litvanya**
merkezli bir sağlayıcının aralığındadır; dış erişim için kullanılmaz.

### 17.3 İki yol — değişiklik yüzeyi karşılaştırması

| | **Yol A — doğrudan (EN DAR)** | **Yol B — Cloudflare Tunnel** |
|---|---|---|
| DNS | Turhost'ta **1 yeni A kaydı** (`form`) | **Tüm bölge Cloudflare'a taşınır** (36 kayıt yeniden kurulur), NS değişir |
| Yetkili DNS | **Turhost'ta kalır** | Cloudflare'a geçer |
| Wildcard sertifika (§14.2) | **Etkilenmez** — DNS-01 bugünkü gibi çalışır | **Kırılır**; önce çözülmeli |
| `form` sertifikası | Caddy, **HTTP-01** ile tek adlı sertifika alır (wildcard değil → DNS-01 gerekmez) | Sağlayıcı kenarında |
| Yönlendirici | 80 + 443 → iç sunucuya NAT kuralı **gerekir** | Gerekmez |
| Gelen port | Açılır (saldırı yüzeyi artar; Caddy varsayılan-ret ile 18 çift dışında her şey 403) | Açılmaz |
| DDoS emme | Yok | Sağlayıcı kenarında |
| Zorunlu ücret | **0,00 USD** | 0,00 USD (Free) — ama §14.2 çözümü S-4 seçilirse 200-250 USD/ay |
| Geri dönüş | Caddy durdurulur + NAT kuralı kaldırılır → erişim hemen kesilir; `form` kaydı silinir, **ad çözümü TTL süresince önbellekte kalabilir** (sıra: §18.4) | NS geri alınır; delegasyon TTL 86400 → **anında değil** (§15.2) |
| Kenar kararı (G-4) | Aynı Caddy | Aynı Caddy |

**Ara yol C — ayrı alan adı:** `form.<yeni-alan-adı>` alınıp **yalnız o boş bölge** Cloudflare'a taşınır.
`tellihukuk.com` hiç dokunulmaz, wildcard etkilenmez, tünel kullanılabilir. Bedeli yeni bir alan adı
kaydı ve müvekkilin farklı bir alan adı görmesidir. Alt alanı tek başına Cloudflare'a delege etmek
**mümkün değildir**: Cloudflare belgesine göre subdomain setup yalnız **Enterprise** planındadır
(Free/Pro/Business: **No**).

### 17.4 Öneri — Yol A

> **R04 (2026-09-26): BU ÖNERİ GEÇERSİZDİR.** 80 ve 443 ofiste **zaten kullanımdadır** — pfSense 80 → `10.34.24.205:80` (Kolayofis), 443 → `10.34.24.205:443` (sayax). Yönlendirmeyi değiştirmek iki aktif hizmeti keser. Seçilen yol **§19**'dur. Aşağıdaki metin tarihsel kayıt olarak korunur.

**En az değişiklik gerektiren ve mevcut hizmetlerin hiçbirini riske atmayan yol A'dır.** Gerekçe:

1. Turhost DNS **korunur**; 36 kaydın hiçbiri taşınmaz, NS değişmez, MX/SPF/DKIM/DMARC'a dokunulmaz.
2. §14.2'deki **tek maddi engel ortadan kalkar** — wildcard yenilemesi bugünkü mekanizmayla sürer.
3. `form` için gereken sertifika **wildcard değildir**, dolayısıyla DNS-01'e ihtiyaç duymaz; Caddy
   HTTP-01 ile alır ve kendisi yeniler.
4. Kenar kararı (18 çift + varsayılan ret + gerçek istemci IP'si) **zaten ölçülmüş ve hazırdır**;
   Yol A'ya geçmek bu işin hiçbirini geçersiz kılmaz.
5. Geri dönüş, sunucu ve yönlendirici tarafında **hemen** kesilir; ad çözümü TTL süresince önbellekte kalabilir (§18.4). Yönlendirme **tek bir cihazda olmayabilir** — ölçülen zincir üç katmanlıdır (§18.1).

**Yol A'nın ölçülmemiş ön koşulları (owner/ISP bilgisi):**

| # | Soru | Neden gerekli |
|---|---|---|
| Ö-A1 | Genel IP sözleşmeye göre **statik** mi? | PTR "static" diyor, ama tahsis taahhüdü sağlayıcı bilgisidir. Dinamikse DNS kaydı kayar. |
| Ö-A2 | Sağlayıcı **gelen 80/443**'ü engelliyor mu? | Bazı KOBİ/ev planlarında kapalıdır. Kapalıysa Yol A uygulanamaz → Yol B veya C. |
| Ö-A3 | Yönlendiriciye yönetim erişimi var mı? | NAT kuralı için gerekir. |

Bu üçü olumluysa **Yol A uygulanabilir ve Cloudflare'a hiç ihtiyaç kalmaz.** Ö-A2 olumsuzsa tünel
zorunlu hale gelir; o zaman **Yol C** (ayrı alan adı) Yol B'ye tercih edilmelidir, çünkü
`tellihukuk.com` bölgesini ve wildcard sertifikayı hiç riske atmaz.

**Bu bölümde hiçbir canlı değişiklik yapılmamıştır:** DNS kaydı eklenmedi, NAT kuralı yazılmadı,
Caddy kurulmadı, sertifika talep edilmedi, hesap açılmadı.

## 18. Yol A — koşullu aday hazırlığı (2026-09-25)

> **R04 (2026-09-26):** Yol A mevcut 80/443 üzerinden **uygulanmayacaktır** (§19.1). `reach-test.ps1` mevcut 80/443 üzerinden **başlatılmayacaktır** — o portlar Kolayofis ve sayax'a yönlendirilmiştir; açılış yerel kontrolü geçse bile dış test o hizmetlerin yolunu değiştirmeden anlamlı sonuç vermez.

> **HÜKÜM SINIRI:** Bu bölüm "statik IP ve gelen erişim doğrulandı" demez. IP'nin statikliği
> **owner beyanıdır**; gelen erişim **ölçülmemiştir**. Yol A **koşullu adaydır**.

### 18.1 Ağ katmanı — salt okuma ölçümü

| Ölçüm | Sonuç |
|---|---|
| Sunucu arayüzü | `10.34.25.53/23`, ağ geçidi `10.34.24.254` |
| İnternete giden hop zinciri | `10.34.24.254` → **`192.168.0.1`** → **`172.17.1.222`** → genel adresler |
| Ağ geçidi `10.34.24.254` yönetim portları | 80 **açık**; 443/8080/8443 kapalı |
| İkinci cihaz `192.168.0.1` | 80 ve 443 **açık** (yönetim arayüzü olabilir) |
| Üçüncü cihaz `172.17.1.222` | 80/443/8080 **kapalı** — bu sunucudan yönetilemiyor |
| Sunucuda 80/443 dinleyicisi | **YOK** |
| Sunucu güvenlik duvarında 80/443 gelen kuralı | **YOK**; üç profil de etkin, varsayılan `NotConfigured` |
| Dış çıkış adresi | Sabit bir TR adresi *(değer belgeye yazılmaz — depo herkese açıktır)* |

**"Tek NAT kuralı" varsayımı düştü.** Sunucu ile internet arasında **en az üç** yönlendirme katmanı
vardır. Port yönlendirmesi bunlardan hangisinde (veya kaçında) yapılacağı ölçülmemiştir; `172.17.1.222`
bu sunucudan yönetilemediği için o katmana erişim owner'da olmayabilir. §17.4'teki "tek NAT kuralı"
ifadesi bu ölçümle **daraltılmıştır**.

**Çıkarım yapılmayanlar:** PTR'deki `static` ibaresi ve RDAP tahsis tipi **abonelik taahhüdü değildir**;
IP'nin statikliği owner beyanı olarak kaydedilmiştir, ölçüm olarak değil. Üst NAT (CGNAT) bulunup
bulunmadığı da **ölçülmemiştir** — hop zinciri özel adresler içerir, ancak hangi katmanın NAT yaptığı
içeriden görülemez. `ofis.tellihukuk.com` kaydı **korunur**; kullanımı bilinmediği için dokunulmamıştır.

### 18.2 Ş-4 — tünel şablonu doğrudan modda KULLANILAMAZ (kusur, düzeltildi)

Tünel şablonu istemci adresini `CF-Connecting-IP` başlığından okur. Geçerlilik koşulu, kendi yorumunda
yazdığı gibi, "Caddy'ye yalnız tünel istemcisi bağlanır" varsayımıdır. **Doğrudan modda bu varsayım
düşer:** başlığı istemcinin kendisi gönderir.

**Ölçülen sonuç (mutasyon):** tünel profili doğrudan modda çalıştırılıp iki farklı sahte
`CF-Connecting-IP` gönderildiğinde hız sınırı sayacı **bölündü** — yani saldırgan her istekte farklı
bir değer göndererek `PUBLIC_INTAKE_IP_RATE_LIMIT_MAX` sınırını tamamen etkisiz kılabilirdi.

**Düzeltme:** ayrı profil `templates/Caddyfile.direct.template` — istemci adresi **yalnız TCP eş
adresinden** alınır, istemcinin gönderdiği `CF-Connecting-IP` arka uca **iletilmez**, `X-Forwarded-For`
üzerine yazılır.

**Doğrudan mod negatif testi — `scripts/edge-direct-mode-probe.ps1`, PASS 7 / 7, çıkış 0.**
API tarafı taklit değildir: `express` + `trust proxy = 1` + canlı dist'ten `resolvePublicIntakeClientIp`
+ hız sınırı anahtarının kendisi.

| # | Ölçüt | Gözlem |
|---|---|---|
| D-0 | Başlıksız taban | Ürün eş adresi çözer |
| D-1 | Sahte `CF-Connecting-IP` kimlik değiştiremez | Sayaç **değişmedi** |
| D-2 | Sahte `X-Forwarded-For` kimlik değiştiremez | Ürünün gördüğü değer eş adres |
| D-3 | Her istekte farklı sahte başlık sayacı **bölemez** | Üç farklı değer → sayaç **aynı** (kaçış yok) |
| D-4 | `CF-Connecting-IP` arka uca iletilmez | Arka uçta **yok** |
| D-5 | Arka uca giden `X-Forwarded-For` tek değer | Tek öğe |
| M-1 | **Mutasyon:** tünel profili doğrudan modda | Sayaç **bölündü** — kusur gerçek |

**İzin listesi ve yönlendirme regresyonu korundu:** `scripts/edge-probe.ps1 -TemplateName
Caddyfile.direct.template` → **PASS 9 / 9** (38 izinli çift doğru arka uca, 29 ret, 18
kodlama/normalizasyon, XFF, admin RET sırası). Tünel profili aynı koşucuda **PASS 8 / 8** ile
regresyonsuz kaldı. Koşucunun B kapıları artık profile duyarlıdır: tünel profilinde "443 dinlemez +
auto_https kapalı", doğrudan profilde "site adresi `{$PUBLIC_HOST}` + auto_https **açık** + istemci
başlığına güvenmez".

**Dinleyici karışıklığı önlendi:** tünelin loopback girişi (`127.0.0.1:8081`) ile doğrudan modun dış TLS
dinleyicisi ayrı profillerdedir; tek şablonda ortam değişkeniyle karıştırılmaz.

### 18.3 80 ve 443 ayrı değerlendirilir

| Senaryo | Sertifika yolu | Not |
|---|---|---|
| 80 ve 443 açık | Caddy **HTTP-01** (varsayılan) | En basit |
| **80 kapalı, 443 açık** | **TLS-ALPN-01** — şablondaki `tls { issuer acme { disable_http_challenge } }` bloğu açılır | 443 üzerinden doğrulanır; 80'e gerek yok |
| 443 kapalı | Doğrudan mod uygulanamaz | Tünel ya da ayrı alan adı (§17.3) değerlendirilir |

Her iki sertifika yolu da **tek adlı** sertifika üretir; wildcard olmadığı için DNS-01 gerekmez ve
Turhost'taki wildcard yenilemesine **dokunmaz** (§14.2).

**Bugünkü başarısız bir port yoklaması ISP engeli SAYILMAZ:** sunucuda dinleyici ve NAT kuralı yoktur,
dolayısıyla bağlantının reddedilmesi beklenen davranıştır. Bu belirsizlik yalnız §18.5'teki testle kalkar.

### 18.4 Geri dönüş — önce kes, sonra geri al

Sıra bilinçlidir: **erişim önce kesilir ve kesildiği dış ağdan doğrulanır**, ancak ondan sonra bu
çalışmanın DNS/NAT değişiklikleri geri alınır.

| # | Adım | Doğrulama |
|---|---|---|
| 1 | Caddy servisi durdurulur | 443 dinleyicisi 0 |
| 2 | **Dış ağdan** (mobil veri) `https://<PUBLIC_HOST>` çağrılır | Yanıt **gelmemeli** |
| 3 | Yönlendirici(ler)de 80/443 yönlendirmesi kaldırılır | Owner ölçümü |
| 4 | **Dış ağdan** genel adrese doğrudan tekrar denenir | Yanıt **gelmemeli** |
| 5 | Sunucu güvenlik duvarındaki kurallar kaldırılır | Kural sayısı 0 |
| 6 | Turhost'ta `form` kaydı silinir | Yetkili sunucudan **NXDOMAIN** ölçülür |
| 7 | `.env` anahtarları yedekten geri yazılır, API yeniden başlatılır | `.env` sha, dist digest |

**Süre taahhüdü verilmez.** Adım 6'dan sonra ad, TTL süresince çözücülerde **önbellekte kalabilir**;
bu nedenle kesinti asıl olarak adım 1-3 ile sağlanır, DNS kaydının silinmesi tamamlayıcıdır. "Dakikalar
içinde kesin dönüş" ifadesi §17.3'ten **kaldırılmıştır**; doğru ifade: *sunucu ve yönlendirici tarafı
hemen kesilir, ad çözümü önbellek süresince kalabilir.*

### 18.5 Erişim testi neyi ölçer, neyi ölçmez — R02 DÜZELTMESİ

Bu bölümün önceki sürümündeki iki iddia **yanlıştı** ve geri çekilmiştir:

| Geri çekilen iddia | Doğrusu |
|---|---|
| "Üç ölçülmemiş kalemi tek seferde kapatır" | Test **yalnız Ö-1'i** ölçer: dış istek belirtilen porttan sunucuya **ulaşıyor mu**. Ö-2 (yönlendirmenin hangi katmanda yapılacağı) ve Ö-3 (IP'nin statikliği) bu testle **kapanmaz**. |
| "Log boşsa engelleyen katman belirlenir" | Boş kayıt yalnız **"istek sunucuya ulaşmadı"** der. Yönlendirme eksikliği, üst NAT, sağlayıcı filtresi ve mobil operatör **aynı sonucu** verir; test bunları **ayırt edemez**. |

| # | Ölçülmemiş | Durum |
|---|---|---|
| Ö-1 | Gelen 80/443 dış ağdan sunucuya ulaşıyor mu | **reach-test ölçer** — ama yalnız yönlendirme kurulduktan sonra anlamlıdır |
| Ö-2 | Port yönlendirmesi hangi katmanda yapılacak | Ölçülmedi; §18.8'deki **tek yönlendirici ekranı** ile belirlenir |
| Ö-3 | IP'nin statikliği | Owner beyanı; abonelik taahhüdü sağlayıcı kaydıdır |

**Yönlendirici yönetimi GERÇEK BAĞIMLILIKTIR.** Test ancak dış istek yönlendirici(ler) tarafından sunucuya
iletilirse bilgi üretir; yönlendirme yoksa kaydın boş olacağı zaten bilinir ve test hiçbir şey öğretmez.
Bu yüzden owner'dan **körlemesine NAT kuralı eklemesi istenmez** ve mevcut yönlendirme ile uzaktan yönetim
ayarlarına **dokunulmaz**. Sıra: önce §18.8 ekranıyla doğru cihaz ve hedef belirlenir, sonra dar kural
kurulur, **sonra** test koşulur.

### 18.6 reach-test R02 — güvenlik düzeltmesi ve öz-test

R01 kaynağı owner'ın dört koşuluna karşı incelendi; **dördü de tam karşılanmıyordu**:

| Koşul | R01 kaynağı | R02 |
|---|---|---|
| K-1 İlk değişiklikten önce durum + kurtarma bilgisi | Durum ilk kuraldan önce yazılıyordu, ama **kural adları ve süreç PID'leri hiç yazılmıyordu** (`Start-Process` `-PassThru` olmadan) | Başlangıç ölçümü + her kaynak için önce **niyet**, sonra **kimlik** (tam kural adı; PID + başlangıç zamanı) kalıcılaştırılır |
| K-2 Kısmi hatada yalnız bu koşunun kaynakları | `try/catch` **yoktu**; ikinci kural hata verirse ilki açık kalıyordu; dinleyici başarısı doğrulanmıyordu | Herhangi bir adımda hata → **yalnız durum dosyasında kayıtlı** kaynaklar geri alınır |
| K-3 Wildcard / toplu süreç yok | Kural silme `-DisplayName 'HY-REACH-TEST*'` (**wildcard**); süreç kapatma **tüm powershell/pwsh süreçlerini** komut satırı deseniyle tarıyordu | Kurallar `-Name` ile **tam adla** (runId gömülü); süreç yalnız **PID + başlangıç zamanı + komut satırında runId** üçü birden eşleşirse durdurulur |
| K-4 Kurtarma hatası ayrıca kaydedilir, PASS yok | Silme hataları `SilentlyContinue` ile **yutuluyordu**; durum dosyası **temiz olmasa bile** yeniden adlandırılıyordu → kurtarma bilgisi kayboluyordu | Her geri alma adımının sonucu kaydedilir; biri bile başarısızsa durum `kurtarma-basarisiz`, **çıkış 3**, aktif işaretçi ve durum dosyası **korunur** |

Ek düzeltmeler: dinleyici süresi artık **gerçekten** sınırlıdır (`-TimeoutMinutes`, R01'de yalnız mesajda
geçiyordu); dış teste geçmeden önce her port **yerel olarak** doğrulanır (HTTP 200 + koşum kimlikli gövde
+ kayıt satırı).

**Öz-testin yakaladığı, yeni kodda da bulunan kusurlar** (canlıda patlayacaktı):

| # | Kusur | Sonucu |
|---|---|---|
| Y-1 | `powershell -File` ile `-Ports 80,443` dizisi tek dizeye dönüşüp virgül kayboluyordu (`18480,18443` → `1848018443`) | Owner bloğu `-File` kullandığı için **canlı açılış bozulurdu**. Port listesi artık dize olarak alınıp ayrılıyor ve doğrulanıyor. |
| Y-2 | Dinleyici her turda **yeni** `GetContextAsync()` açıyordu | Gelen istek terk edilmiş göreve bağlanıyor, **yanıt hiç gitmiyordu** |
| Y-3 | Geri alma sonucu iç içe dizi dönüyordu | Sonuç satırları birleşiyor, başarısızlık **sayılamıyordu** |
| Y-4 | Dinleyici `Content-Type` göndermiyordu | PS 5.1 gövdeyi bayt dizisi döndürüyor, yerel kontrol **her zaman başarısız** oluyordu |
| Y-5 | Boş dizi pipeline'dan `ConvertTo-Json`'a verilince boş dosya | Öz-test yolunda sahte kural kaydı bozuluyordu |

**Öz-test — `scripts/reach-test-selftest.ps1`, PASS 27 / 27, çıkış 0.** Yönetici gerektirmez, canlıya
dokunmaz. **Gerçek:** dinleyici süreçleri gerçekten başlatılır, gerçek yerel HTTP isteği alır, gerçek kayıt
yazar ve gerçekten durdurulur; PID, başlangıç zamanı ve komut satırı gerçek işletim sistemi verisiyle
ölçülür. **Sahte:** güvenlik duvarı kuralları geçici bir JSON kayıt defterine yazılır — gerçek
`New/Remove-NetFirewallRule` davranışı burada **ölçülmez**; kaynakta `-Name` ile tam ad kullanıldığı statik
kapıyla doğrulanır. **Ölçülmez:** `http://+:<port>/` önekinin yönetici URL-ACL davranışı (canlıya özgü).

| Grup | Kapsanan | Sonuç |
|---|---|---|
| T0 | K-1: ilk kuraldan **önce** hata → durum dosyası, başlangıç ölçümü ve niyet kaydı mevcut | 3/3 |
| T1 | Normal açılış + kapatma: 2 kural + 2 süreç kimliğiyle kayıtlı, yerel kontrol 2/2, kayıtta `YEREL` satırlar, kapatma temiz, durum+kayıt korundu | 5/5 |
| T2–T4 | K-2: ikinci kuralda / ikinci dinleyiciden sonra / yerel kontrolde hata → yalnız oluşan kaynaklar geri alındı | 3/3 |
| T5 | K-3: benzer komut satırlı **yabancı süreç** sağ kaldı; R01 adlı ve başka koşuya ait **kurallar korundu** | 3/3 |
| T6 | K-3: kayıtlı PID başka bir sürece geçmişse o süreç **durdurulmadı** | 1/1 |
| T7 | K-4: kapatmada kural silme hatası → çıkış 3, `kurtarma-basarisiz`, başarısız adımlar kayıtlı, işaretçi korundu; ikinci kapatma temizledi | 4/4 |
| T8 | K-4: açılış hatası **ve** geri alma hatası → çıkış 3, PASS yok, kalan kurallar görünür; sonraki kapatma temizledi | 3/3 |
| T9 | Aktif koşu varken ikinci açılış çıkış 4; mevcut koşunun süreçleri etkilenmedi | 1/1 |
| S-1..S-4 | Statik: wildcard yok · süreç adıyla tarama yok · hata yutma yok · yeniden adlandırma yok | 4/4 |

### 18.7 Port başına test protokolü

| Port | Protokol | Dış cihazda yazılacak adres | Not |
|---|---|---|---|
| 80 | **Düz HTTP** | `http://<GENEL_IP>/hy-reach-<runId>` | |
| 443 | **Düz HTTP — TLS YOK** | `http://<GENEL_IP>:443/hy-reach-<runId>` | Şema `http://`, port `:443` **açıkça** yazılır. `https://` **kullanılmaz**: TLS kurulmadığı için başarısız olur ve bu bir erişim sonucu **sayılmaz**. Tarayıcı güvenli bağlantıya geçmeyi önerirse reddedilir. |

**Koşum kimliği:** her açılış rastgele bir `runId` üretir. Kimlik test yolunda, beklenen gövdede
(`HY-REACH-OK <runId> port=<port>`) ve kayıt dosyasının adında bulunur; böylece dış istek bu koşunun
sunucu kaydına **bağlanır**.

**Önce yerel kontrol:** açılış, dış teste geçmeden her portu `127.0.0.1` üzerinden dener ve HTTP 200 +
doğru gövde + yeni kayıt satırı görmezse **açılışı geri alır** (çıkış 1). Yani dış test başladığında
dinleyici ve kayıt mekanizmasının çalıştığı ölçülmüştür.

**Başarı tanımı (dar):** bir port için *dış cihazda beklenen gövde görüldü* **ve** *sunucu kaydında o
porta ait `DIS` işaretli satır var*. Bu yalnız **"dış ağdan düz HTTP isteği bu porttan sunucuya ulaştı"**
demektir. **TLS'in çalıştığı, sertifikanın alınabileceği veya H5 kabulü anlamına GELMEZ.**

**443'e özgü sınır:** bazı mobil ağlar 443'teki düz HTTP'ye müdahale edebilir. 443'te `DIS` satırı yoksa
bu, 443'te **TLS trafiğinin** ulaşmayacağını kanıtlamaz.

### 18.8 Dar NAT değişikliği — bugünkü bilgiyle YAZILAMAZ; gereken tek yönlendirici ekranı

Ölçülen zincir: sunucu → `10.34.24.254` → `192.168.0.1` → `172.17.1.222` → internet. Owner'ın beyan ettiği
genel adresin **hangi cihazın WAN arayüzünde** olduğu bilinmiyor; dolayısıyla kuralın hangi cihaza ve hangi
iç hedefe yazılacağı bugün **belirlenemez**.

**Gereken tek ekran:** `192.168.0.1` yönetim arayüzünün **WAN / İnternet durum** sayfası — WAN IP adresi ve
bağlantı tipi. Salt okumadır; hiçbir ayar değiştirilmez, uzaktan yönetim açılmaz. Bu cihaz seçildi çünkü
zincirde yönetim arayüzü görünen (80/443 açık) **en dıştaki** cihazdır.

| Ekranda görülen | Anlamı | Sonraki adım |
|---|---|---|
| WAN IP = owner'ın beyan ettiği genel adres | Genel adres bu cihazda; `10.34.24.254` ikinci bir NAT katmanıdır | **İki dar kural:** `192.168.0.1`'de TCP 80/443 → `10.34.24.254`'ün WAN adresi; `10.34.24.254`'te TCP 80/443 → `10.34.25.53`. İkinci hedef adres o ekranda ya da `192.168.0.1`'in bağlı cihaz listesinde görülür. |
| WAN IP özel adres (ör. `172.17.x.x`) | Genel adres **owner'ın bu cihazında değil**; üst katman (`172.17.1.222` ya da sağlayıcı) | Yol A owner'ın mevcut erişimiyle **uygulanamaz**; sağlayıcı/bina yöneticisi gerekir. §17.3 Yol C değerlendirilir. |
| Ekran açılamıyor (parola yok) | Yönetim erişimi yok | Yol A bu erişim sağlanana kadar **bekler**; körlemesine kural yazılmaz. |

**Dar kuralın geri alınması** (kurulursa): kurulan kural(lar) **yalnız bu çalışmada eklenen satırlar**
olarak silinir; mevcut yönlendirmelere dokunulmaz. Sonra dış cihazdan aynı test adresi tekrar denenir ve
**yanıt gelmediği** doğrulanır (§18.4 sırası).

**Bu bölümde yapılmayanlar:** DNS/NAT/güvenlik duvarı değişikliği, canlı kurulum, sertifika talebi, yayın,
reach-test'in canlı koşumu — hiçbiri. H5 ve H1–H8 hizmet kabulü (**0/8**) değişmemiştir.

## 19. SEÇİLEN YOL — Cloudflare for SaaS özel adı + yardımcı bölge + adlandırılmış tünel (R04, R05 — 2026-09-26)

> **DURUM: HAZIRLIK.** Hesap açılmadı, alan adı alınmadı, DNS değiştirilmedi, tünel kurulmadı, `.env`
> değişmedi, hiçbir hizmet yeniden başlatılmadı. `tellihukuk.com` yetkili DNS'i **Turhost'ta kalır**.

### 19.1 Neden bu yol — ölçülen kısıtlar

| Ölçüm (salt okuma) | Sonuç |
|---|---|
| pfSense yönlendirmeleri (owner ekranı) | 80 → `10.34.24.205:80` (Kolayofis), 443 → `10.34.24.205:443` (sayax) — **ikisi de aktif** |
| Ağ zinciri (owner ekranı) | Zyxel LAN `192.168.0.1` → pfSense WAN `192.168.0.100`, LAN `10.34.24.254` → hukuk sunucusu `10.34.25.53` |
| Zyxel yönlendirme/DMZ tabloları | Kayıt görünmüyor — **"dış erişim yok" kanıtı sayılmaz** |
| `10.34.24.205` | Windows sunucu, **IIS 10.0 / ASP.NET**; 80, 443, 3389, 445 açık |
| 443 sertifikası (SNI'siz) | `sayax.gelkaenerji.com.tr`, Let's Encrypt, 2026-07-14 → 2026-10-12 |
| `sayax.gelkaenerji.com.tr` dış DNS | Ofisin çıkış adresine işaret ediyor — dış 443'ün bugün bu zincirden **geçtiğine dair güçlü dolaylı işaret** (ölçüm değil) |
| Tünel çıkışı | Sunucudan Cloudflare kenarına TCP 7844 **açık** (§3) |

Bu yol **mevcut 80/443 NAT kurallarına, Zyxel'e, pfSense'e ve `10.34.24.205`'e hiç dokunmaz**; tünel giden
bağlantıdır. `tellihukuk.com` taşınmaz, NS değişmez, wildcard yenilemesi (§14.2) etkilenmez; müvekkil
yine `bilgi.tellihukuk.com` görür.

### 19.2 Önceki rapordaki ifadelerin kanıt sınırına göre düzeltilmesi

| Önceki ifade | Düzeltilmiş hali |
|---|---|
| "Ayrı portta sertifika **alınamaz**" | **Aşırıydı.** 80 ve 443 IIS'te olduğu için HTTP-01 ve TLS-ALPN-01 doğrulamaları Caddy'ye **ulaşamaz**; ancak **DNS-01** ile ayrı porttaki bir ad için sertifika alınabilir. Bu yol seçilmedi, çünkü müvekkil adresinde port gerektirir ve bazı kurumsal ağlar standart dışı portları engeller — "imkânsız" olduğu için değil. |
| "Turhost API **zorunlu**" | **Yanlıştı.** DNS-01 için sağlayıcı API'si şart değildir: `_acme-challenge.<ad>` kaydı CNAME ile API'si olan başka bir bölgeye **delege edilebilir** ya da her yenilemede TXT **elle** girilebilir. |
| "Araya ters vekil **kesinlikle yok**" | **Aşırıydı.** Ölçülen yalnız şudur: 443'te TLS, `10.34.24.205`'te **IIS tarafından** sonlanıyor ve pfSense TCP yönlendirmesi yapıyor. IIS'in arkasında ARR veya başka bir arka uç olup olmadığı **ölçülmedi** (sunucuya giriş yapılmadı). |
| "Kesinti riski **sıfır**" | **Aşırıydı.** Doğru ifade: kurulum adımları mevcut hizmetlerin **yoluna dokunmaz** (80/443 NAT, pfSense, Zyxel, IIS değişmez), bu yüzden **beklenen doğrudan etki yoktur**. Ölçülmemiş dolaylı riskler §19.7'dedir. |
| "Tünelin fallback origin olabildiği resmî belgede **açıkça yazmıyor**" | **Yanlıştı.** Cloudflare Reference Architecture açıkça yazar: *"The fallback origin is a CNAME DNS record that points to a public hostname exposed by Cloudflare Tunnel."* ([rehber](https://developers.cloudflare.com/reference-architecture/design-guides/extending-cloudflares-benefits-to-saas-providers-end-customers/)) |

### 19.3 Resmî dayanak ve plan sınırı

| Bileşen | Kaynak | Plan / ücret |
|---|---|---|
| Fallback origin = tünelin public hostname'i | Reference Architecture (yukarıda) | — |
| Cloudflare for SaaS (özel ad) | [Plans](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/plans/) | **Free planda var**; 100 özel ad dahil, ek ad başına 0,10 USD (belge ifadesi) — bu kurulum **1** ad kullanır |
| Müşteri alanının Cloudflare'da olması | [Kurulum](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/start/getting-started/) | **Gerekmez**; müşteri kendi DNS'inde CNAME ekler |
| Adlandırılmış tünel | Zero Trust Free (§3) | 0,00 USD |
| **Regional Services** | [Regional Services](https://developers.cloudflare.com/data-localization/regional-services/) | *"Regional Services is an Enterprise add-on."* — **bu kurulumda KULLANILMAZ** |

**Not:** Rehberdeki fallback-origin cümlesi **"… with Regional Services"** başlıklı bölümde geçer. Regional
Services Enterprise eklentisidir ve bu mimaride **yer almaz**; Free planda kullanılan yalnız Free bölge,
Cloudflare for SaaS (100 ad içinde) ve adlandırılmış tüneldir. SaaS + tünel birleşiminin **Free planda**
çalıştığı ayrı bir cümleyle belgelenmemiştir — kurulumun **ilk doğrulama adımıdır** (§19.5, K-1).

### 19.4 Somut kurulum planı

**DNS hedefleri**

| Bölge | Ad | Tip | Hedef | Not |
|---|---|---|---|---|
| Yardımcı (Cloudflare) | `origin.<yardımcı>` | CNAME, **proxied** | `<TUNNEL_ID>.cfargotunnel.com` | Fallback origin = tünelin public hostname'i |
| Yardımcı (Cloudflare) | `customers.<yardımcı>` | CNAME, **proxied** | `origin.<yardımcı>` | Müşteri CNAME hedefi (belgedeki `customers.saasprovider.com` kalıbı) |
| **Turhost** (`tellihukuk.com`) | `bilgi` | CNAME | `customers.<yardımcı>` | **Tek zorunlu Turhost değişikliği**; mevcut 36 kayda dokunulmaz |
| Turhost *(yalnız ön-doğrulama seçilirse)* | `_cf-custom-hostname.bilgi` | TXT | Cloudflare'ın verdiği değer | [Pre-validation](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/pre-validation/) |
| Turhost *(yalnız TXT/delege DCV seçilirse)* | `_acme-challenge.bilgi` | TXT ya da CNAME | Cloudflare'ın verdiği değer | cPanel'in mevcut `_acme-challenge.*` kayıtlarıyla **ad çakışmaz** (`bilgi` altında kayıt yok) |

**Özel ad doğrulaması — önerilen: gerçek zamanlı sahiplik + HTTP DCV (yalnız bir CNAME).**
Cloudflare belgesi: *"Real-time validation occurs automatically when your customer adds their DNS routing
record."* ([real-time](https://developers.cloudflare.com/cloudflare-for-platforms/cloudflare-for-saas/domain-support/hostname-validation/realtime-validation/)).
Belge bu yöntemin *"may cause some downtime"* olabileceğini de yazar; `bilgi` bugün **NXDOMAIN**'dir ve
müvekkil trafiği yoktur, bu yüzden bu pencere kimseyi etkilemez. Sertifika için HTTP DCV kullanılabilir,
çünkü `bilgi` **wildcard değildir** (belge: *"Wildcard custom hostnames require TXT-based validation"*).
Alternatif: iki TXT kaydıyla **ön-doğrulama** — sertifika CNAME'den önce aktif olur, bedeli Turhost'ta iki
ek kayıttır.

**TLS / Host eşlemesi**

| Kesim | TLS | Host / SNI |
|---|---|---|
| Müvekkil → Cloudflare kenarı | TLS; sertifika Cloudflare'ın `bilgi` için aldığı (HTTP DCV) | SNI ve Host = `bilgi.tellihukuk.com` |
| Kenar → tünel | Cloudflare tünel bağlantısı (giden 7844) | Özel ad trafiğinin tünele hangi Host ile ulaştığı rehberde **yazmaz** → tasarım bundan bağımsızdır (aşağıda) |
| `cloudflared` → Caddy | Düz HTTP, `127.0.0.1:8081` | `httpHostHeader` = `bilgi.tellihukuk.com` |
| Caddy → Web / API | Düz HTTP, `127.0.0.1:3002` / `127.0.0.1:8080` | aynı |

**Tünel ingress eşlemesi** (`templates/cloudflared-config.yml.template`, R03)

| # | Eşleşme | Hedef |
|---|---|---|
| 0 | `hostname: <FALLBACK_ORIGIN_HOST>` | Caddy `127.0.0.1:8081` |
| 1 | `hostname: <PUBLIC_HOST>` | Caddy `127.0.0.1:8081` |
| 2 | diğer her şey | `http_status:404` |

İki ad da **aynı ve tek** hedefe gider; API ve Web şablonda **hiç geçmez**. Yol ve yöntem kararı tünelde
değil Caddy'dedir.

### 19.5 Yardımcı ad üzerinden izin listesi aşılamaz — İZOLE ölçüm

| Katman | Koşucu | Sonuç |
|---|---|---|
| Tünel eşleşmesi | `scripts/tunnel-ingress-probe.ps1` — resmî `cloudflared 2026.9.3` ile `ingress validate` + `ingress rule` (hesap/ağ gerekmez) | **PASS 5 / 5**: yapılandırma geçerli · özel ad ve fallback adı için **admin yolu dahil her yol yalnız Caddy'ye** · yardımcı apex, rastgele ad ve `tellihukuk.com`'un diğer adları **404** · şablonda 8080/3002 **yok** |
| Caddy kararı | `scripts/edge-probe.ps1 -HostHeader <ad>` — tünel profili, üç Host: `bilgi.tellihukuk.com`, `origin.yardimci.example`, `evil.example` | **Üçünde de PASS 8 / 8**: 38 izin · 29 ret · 18 kodlama · XFF · admin RET sırası — Caddy kararı **Host'tan bağımsız** |

**Bu ölçümler canlı zincirin kanıtı DEĞİLDİR.** Önceki istemci-IP provası (7/7) ve bu tablo izoledir.
Kurulumda ayrıca ölçülecekler:

| # | Canlıda ölçülecek |
|---|---|
| K-1 | Özel ad trafiği fallback origin (tünel) üzerinden Caddy'ye ulaşıyor — SaaS + tünelin **Free planda** çalıştığının ölçümü |
| K-2 | Özel ad trafiğinin tünele geldiği Host başlığı (tasarım bağımsız, ama kayda geçer) |
| K-3 | `CF-Connecting-IP` gerçek istemci adresini taşıyor; istemcinin gönderdiği sahte başlık kenarda eziliyor |
| K-4 | Dış ağdan: 18 çift çalışıyor, `/api/portal/admin/*` ve personel yüzeyi **403**, izin dışı yöntem **403** |
| K-5 | `https://origin.<yardımcı>` ve `https://customers.<yardımcı>` doğrudan çağrıldığında da aynı sınır |

**Ölçülen kurulum tuzağı:** `config.yml` PowerShell 5.1 ile hazırlanırken iki hata `cloudflared`'ı açılmaz
kılar — `Set-Content -Encoding UTF8` **BOM** yazar ve `Get-Content` BOM'suz UTF-8 şablonu **Windows-1254**
okuyup Türkçe harfleri C1 kontrol karakterine çevirir (`yaml: control characters are not allowed`).
Şablon açıkça UTF-8 okunmalı, `config.yml` **BOM'suz** yazılmalıdır.

### 19.6 Doğrulanmış maliyetler

| Kalem | Kaynak | Ücret |
|---|---|---|
| Cloudflare Free bölge (yardımcı alan adı için) | Cloudflare planları (§3) | 0,00 USD |
| Cloudflare for SaaS | Plans | 100 ada kadar **0,00 USD**; bu kurulum 1 ad |
| Adlandırılmış tünel (Zero Trust Free) | Cloudflare planları (§3) | 0,00 USD — 50 kullanıcı sınırı **Access** kullanıcılarını sayar, bu kurulumda Access yok |
| Regional Services | Regional Services | Enterprise eklentisi — **kullanılmaz** |
| **Yardımcı alan adı** | — | Owner'ın **uygun ve kullanılmayan** bir alan adı varsa **0,00 USD**. Yoksa aşağıda |

**Yeni alan adı gerekirse — Turhost fiyat tablosu** (`turhost.com/domain/com-domain/`, 2026-09-26 okundu):

| Uzantı | Kayıt (ilk yıl) | Yenileme (yıllık) | İlk yıl + sonraki her yıl |
|---|---|---|---|
| `.com` | 2,90 USD (kampanya) | **21,99 USD** | 2,90 + her yıl 21,99 |
| `.com.tr` | 1,49 USD | **14,99 USD** | 1,49 + her yıl 14,99 |

Tabloda KDV'nin dahil olup olmadığı **belirtilmiyor**. Cloudflare Registrar için belge yalnız kayıt ve
yenilemenin *"at cost"*, kâr payı olmadan faturalandığını söyler; somut `.com` fiyatı belgede **yoktur**
(ölçülmedi). Yardımcı alan adı boş bir bölge olduğundan nameserver'larının Cloudflare'a verilmesi
**`tellihukuk.com`'u etkilemez**.

### 19.7 Kesinti riski

| Kapsam | Değerlendirme |
|---|---|
| Kolayofis, sayax | Kurulum adımları 80/443 NAT, pfSense, Zyxel ve IIS'e **dokunmaz** → beklenen doğrudan etki yok |
| `tellihukuk.com` sitesi, e-postası, wildcard sertifika | Yalnız **bir** yeni CNAME eklenir; mevcut 36 kayıt değişmez, NS değişmez |
| Hukuk uygulaması (iç kullanıcılar) | `.env` değişikliği sonrası kontrollü API yeniden başlatmasında **kısa kesinti** |
| **Ölçülmemiş dolaylı riskler** | Turhost panelinde yeni kayıt eklerken yanlış satıra dokunma (insan hatası) · cPanel AutoSSL'in `bilgi` adını görmesi (`bilgi` cPanel'de alt alan olarak tanımlı değilse işlemez — ölçülmedi) · pfSense'in giden 7844'ü ileride kısıtlaması · hukuk sunucusunda `cloudflared` + Caddy'nin ek kaynak kullanımı |

### 19.8 Geri dönüş — ölçmeden kapanış YOK

Sıra: önce dış erişim kesilir ve **dış ağdan** doğrulanır; sonra bu çalışmanın değişiklikleri geri alınır;
en son ortam kimliği ölçülür.

| # | Adım | Doğrulama |
|---|---|---|
| 1 | `cloudflared` servisi durdurulur | **Dış ağdan** (mobil veri) `https://bilgi.tellihukuk.com` → uygulama yanıtı **gelmez** (Cloudflare hata sayfası beklenir). Bu ölçülmeden sonraki adıma geçilmez. |
| 2 | Cloudflare'da özel ad silinir | Dış ağdan tekrar → uygulama yanıtı yok |
| 3 | Turhost'ta `bilgi` CNAME (ve varsa iki TXT) silinir | Yetkili sunucudan **NXDOMAIN**; çözücüler TTL süresince önbellekte tutabilir |
| 4 | Caddy durdurulur | `127.0.0.1:8081` dinleyicisi 0 |
| 5 | `.env` yedeği **hash doğrulamasıyla** geri yazılır | Yedeğin sha256'sı kurulum öncesi kaydedilen değere **eşit** olmalı; geri yazılan `.env`'in sha256'sı taban pine (`7A7228B1…FDDC`) **eşit** olmalı — eşit değilse DUR |
| 6 | **Kontrollü** API yeniden başlatma | `Stop-ScheduledTask` → 8080 dinleyicisi **0** olana kadar bekle → `Start-ScheduledTask` → 8080'de **tam 1** dinleyici. `Restart-ScheduledTask` bu sunucuda **yoktur**. |
| 7 | **Ortam kimliği ve sağlık** | API dist digest `A8B17A38…53A0` (3867 dosya) · web `.next` digest `C17E7B13…5326` (505 dosya) · `BUILD_ID` `5waeMoFGGMTLAYmn9oJvW` · başlatıcı `DDCCD091…219C` · `/api/auth/me` **401** · web `/` **200** · `HukukPlatform-API` ve `-Web` **Running/enabled** |
| 8 | Kapanış hükmü | Yalnız 1–7'nin **hepsi ölçülüp geçince**. Yardımcı bölge ve tünel kaydı silinmez; kanıt olarak korunur. |

### 19.9 Owner'dan gerçekten eksik olan

1. **Uygun, kullanılmayan bir alan adınız var mı?** Varsa adı. Yoksa hangi uzantı (`.com` / `.com.tr`) ve
   hangi kayıt firması (Turhost ya da Cloudflare Registrar).
2. ~~Cloudflare hesabınız var mı?~~ → **YOK** (owner, 2026-09-26). Kurulumun ilk adımı hesabın **owner
   tarafından** açılmasıdır; ajan hesap açamaz ve parola giremez. Hesap açmak bu kararla yetkilendirilmiş
   **değildir**.

Bunlar dışında şablonlar, testler, DNS tablosu ve geri dönüş planı hazırdır. Kurulum ayrı owner GO'su
ister; H5 ve H1–H8 hizmet kabulü (**0/8**) değişmemiştir.

### 19.10 R05 — `bilgi.tellihukuk.com` çakışma ölçümü (2026-09-26, salt okuma)

**Owner kararı:** müvekkile açık adres `https://bilgi.tellihukuk.com`; gönderen e-posta `bilgi@tellihukuk.com`
korunur; Cloudflare hesabı **yoktur**.

**DNS — yerel dilden bağımsız ölçüm** (Win32 hata kodu **9003** = NXDOMAIN; Türkçe sistemde ileti
"DNS adı yok" olarak gelir, metin eşleştirmesi kullanılmadı):

| Ad | cpns1 (yetkili) | cpns2 (yetkili) | 1.1.1.1 |
|---|---|---|---|
| `bilgi.tellihukuk.com` | NXDOMAIN | NXDOMAIN | NXDOMAIN |
| `_acme-challenge.bilgi.tellihukuk.com` | NXDOMAIN | NXDOMAIN | NXDOMAIN |
| `_cf-custom-hostname.bilgi.tellihukuk.com` | NXDOMAIN | NXDOMAIN | NXDOMAIN |
| `www.bilgi.tellihukuk.com` | NXDOMAIN | NXDOMAIN | NXDOMAIN |
| rastgele ad (joker kayıt denetimi) | NXDOMAIN | NXDOMAIN | NXDOMAIN |
| **Pozitif kontrol** `webmail.tellihukuk.com` | **VAR** | — | — |

Yetkili sunucuda `bilgi` için A, AAAA, CNAME, MX, TXT, SRV, NS **hiçbiri yok**. Bölgede **joker kayıt yoktur**.
SOA seri numarası `2026090101` — §14 envanterinden (36 kayıt) bu yana bölge **değişmemiştir**; `bilgi` o
envanterde de yoktu.

**Kullanım — barındırma sunucusunda bu ada bağlı site var mı** (ana sitenin sunucusuna 80 portundan
`Host` başlığıyla salt okuma istek):

| Host başlığı | Yanıt |
|---|---|
| `bilgi.tellihukuk.com` | 200 · 163 bayt · gövde özeti `9278D16E…` |
| rastgele, var olmayan ad | 200 · 163 bayt · gövde özeti `9278D16E…` — **birebir aynı** |
| **Pozitif kontrol** `webmail.tellihukuk.com` | 200 · 39.901 bayt · "Webmail Login" — **farklı** |

`bilgi` adı sunucunun **tanımsız ad** yanıtını alıyor; bu ada bağlı bir site **tanımlı değildir**. (cPanel
yapılandırmasına giriş yapılmadı; sonuç HTTP davranışından çıkarılmıştır.)

**E-posta ile çakışma yoktur — gerekçe:** `bilgi@tellihukuk.com` bir **posta kutusu adıdır**; teslimat
`tellihukuk.com` alanının MX kaydıyla yapılır (§14: `MX 0 tellihukuk.com`). `bilgi.tellihukuk.com` ise ayrı bir
**DNS adıdır**. Bu ada eklenecek tek CNAME; MX, SPF (`tellihukuk.com` TXT), DKIM (`default._domainkey`) ve
DMARC (`_dmarc`) kayıtlarının **hiçbirinin adını paylaşmaz**. CNAME kuralı gereği aynı adda başka kayıt
bulunmaması gerekir — ölçümle `bilgi` adında **hiç kayıt yoktur**. Uygulamanın `bilgi@tellihukuk.com`'dan
gönderdiği e-postalardaki bağlantılar `https://bilgi.tellihukuk.com/...` olur; gönderen alanı değişmez.

**Kurulumda üzerine yazılacak kayıt yoktur:** eklenecek adların (`bilgi`, ve seçilirse `_cf-custom-hostname.bilgi`,
`_acme-challenge.bilgi`) hepsi bugün NXDOMAIN'dir. Kurulum anında bu ölçüm **yeniden** yapılır; o gün bir kayıt
bulunursa **üzerine yazılmaz**, owner'a bildirilir.

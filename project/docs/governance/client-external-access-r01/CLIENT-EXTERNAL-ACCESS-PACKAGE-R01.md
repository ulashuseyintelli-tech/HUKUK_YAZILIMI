# CLIENT DIŞ ERİŞİM PAKETİ (R01) — müvekkil cihazından HTTPS ile intake ve portal

> **DURUM: HAZIRLIK — CANLIYA UYGULANMADI, YAYIN YAPILMADI.** Bu belge internete açma yetkisi değildir.
> Alan adı ve sağlayıcı seçimi owner kararıdır; aşağıdaki her yer tutucu parametredir.
> Teknik sayaç **18/18**, hizmet kabulü **0/8** — bu paket ikisini de değiştirmez.

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

## 3. Seçilen kenar yöntemi ve topoloji (R02 — 2026-09-24)

**Yöntem: giden tünel (Cloudflare Tunnel) + YALNIZ loopback'te dinleyen Caddy.**

```
internet → Cloudflare kenarı (form.tellihukuk.com)
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
1. ~~Kullanılacak alan adı~~ → **BELLİ: `tellihukuk.com`, yayınlanacak ad `form.tellihukuk.com`** (owner, 2026-09-24).
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

## 14. DNS envanteri — yetkili sunuculardan ölçüldü (2026-09-24, salt okuma)

Alan adı **`tellihukuk.com`**, yayınlanacak ad **`form.tellihukuk.com`** (bugün NXDOMAIN — hiçbir mevcut kaydı etkilemez).
Ölçüm doğrudan yetkili sunucudan (`cpns1.turhost.com` = `37.230.110.110`) yapılmıştır; özyinelemeli çözücü
yanıtı değil. **Turhost bugün gerçekten yetkili DNS'tir.**

| Ad | Tip | Değer | TTL |
|---|---|---|---|
| `tellihukuk.com` | SOA | primary `cpns1.turhost.com`, sorumlu `csf.ofis.net`, seri `2026090101` | — |
| `tellihukuk.com` | NS | `cpns1.turhost.com`, `cpns2.turhost.com` | 86400 |
| `tellihukuk.com` | A | `94.199.205.185` | 14400 |
| `tellihukuk.com` | MX | pref 0 → `tellihukuk.com` | 14400 |
| `tellihukuk.com` | TXT | `v=spf1 include:_spf2.trwww.com include:_spf.trwww.com -all` | 14400 |
| `tellihukuk.com` | TXT | `google-site-verification=kMggUMyhF1YBqF26puJDDYn2L9eZKmkiDgjYZH_h1QM` | 14400 |
| `_dmarc` | TXT | `v=DMARC1; p=none;` | 14400 |
| `default._domainkey` | TXT | DKIM1 / RSA açık anahtar (1 kayıt, tam değer panelden alınacak) | 14400 |
| `www` | CNAME | `tellihukuk.com` | 14400 |
| `mail` | CNAME | `tellihukuk.com` | 14400 |
| `webmail` | A | `94.199.205.185` | 14400 |
| `cpanel` | A | `94.199.205.185` | 14400 |
| `autodiscover` | A | `94.199.205.185` | 14400 |
| `autoconfig` | A | `94.199.205.185` | 14400 |
| `ftp` | A | **`94.199.205.182`** (kökten farklı IP) | 14400 |
| `tellihukuk.com` | CAA | **yok** | — |
| `.com` bölgesinde `tellihukuk.com` | DS | **yok** → bölge **DNSSEC ile imzalı DEĞİL** | — |
| `tellihukuk.com` | DNSKEY | yok | — |

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

### 15.1 İleri geçiş

| # | Adım | Doğrulama | Geri dönüşü |
|---|---|---|---|
| 1 | Turhost'tan tam kayıt dökümü alınır; §14 tablosuyla karşılaştırılır | Dökümdeki her satır tabloda ya da "yeni" olarak işaretli | — (salt okuma) |
| 2 | Turhost'ta kayıt TTL'leri 300 sn'ye indirilir (NS hariç) | Yetkili sunucudan TTL=300 okunur | TTL geri yükselt |
| 3 | **En az 14400 sn (4 saat) beklenir** — eski TTL'in dünyadan düşmesi | Tekrar ölçüm | — |
| 4 | Cloudflare'da bölge Free planda eklenir; otomatik tarama sonucu dökümle **satır satır** karşılaştırılır, eksikler elle girilir | Cloudflare'daki kayıt sayısı = döküm satır sayısı | Bölge silinir |
| 5 | Proxy durumu ayarlanır: **yalnız `form.tellihukuk.com` proxy'li (turuncu)**; kök `A`, `www`, `mail`, `webmail`, `cpanel`, `autodiscover`, `autoconfig`, `ftp` **DNS-only (gri)** | Her satırın bulut durumu tek tek okunur | — |
| 6 | Cloudflare NS'leri kayıt firmasında ayarlanır | Üst bölgeden NS sorgusu | **Bkz. 15.2** |
| 7 | Yayılma süresince her kayıt eski ve yeni NS'lerden ayrı ayrı sorgulanır; posta akışı sınanır | §14 tablosunun her satırı için eski = yeni | 15.2 |
| 8 | Tünel + Caddy kurulur; `form` CNAME'i tünele bağlanır | Caddy durdurulunca tünel hiçbir şey sunmaz | Tünel durdurulur, CNAME silinir |
| 9 | `.env` anahtarları eklenir, API yeniden başlatılır (ayrı owner bloğu) | `.env` sha, dist digest | `.env` yedeği |
| 10 | Dış erişim GO; §7 kabul zinciri D-1..D-9 | — | §8 beş kontrol |

**Posta ve ana site neden bozulmaz:** MX ve TXT proxy'lenemez — Cloudflare belgesi: *"Only records used for IP
address resolution — A, AAAA, and CNAME records — can be proxied… Other record types (such as MX or TXT) are
always DNS-only."* Kök `A` ve posta adları **gri bulut** bırakıldığı için gerçek IP değişmez. Risk kayıt
tipinden değil **eksik kopyalamadan** gelir; adım 1 ve 4 bunun için vardır.

### 15.2 Geri dönüş

- **Turhost bölgesi silinmez.** Kayıtlar panelde olduğu gibi kalır; geri dönüş = kayıt firmasında NS'i
  `cpns1.turhost.com` / `cpns2.turhost.com` olarak geri almak.
- NS kaydının TTL'i **86400 sn (24 saat)**; üst bölge TTL'i bizim kontrolümüzde değildir, bu yüzden geri
  dönüş anında tamamlanmaz. Geçiş penceresi bu süre göz önünde tutularak seçilir.
- **DNSSEC/DS sırası:** bölge bugün **imzasızdır** (ölçüm: `.com` içinde DS yok, DNSKEY yok). Bu nedenle ileri
  geçişte DS kaldırma adımı **yoktur**. Cloudflare'da DNSSEC **kapalı bırakılır**. Eğer ileride açılırsa
  geri dönüş sırası zorunlu olur: **önce** kayıt firmasında DS kaydı kaldırılır → DS TTL'i kadar beklenir →
  **sonra** NS değiştirilir. Ters sırada bölge doğrulanamaz hale gelir ve alan adı tamamen çözülmez.
- Tünel ve Caddy tarafı: §8'in beş kontrolü aynen uygulanır.

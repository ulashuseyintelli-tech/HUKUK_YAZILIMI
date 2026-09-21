# CLIENT DIŞ ERİŞİM PAKETİ (R01) — müvekkil cihazından HTTPS ile intake ve portal

> **DURUM: HAZIRLIK — CANLIYA UYGULANMADI, YAYIN YAPILMADI.** Bu belge internete açma yetkisi değildir.
> Alan adı ve sağlayıcı seçimi owner kararıdır; aşağıdaki her yer tutucu parametredir.
> Teknik sayaç **18/18**, hizmet kabulü **0/8** — bu paket ikisini de değiştirmez.

## 1. Ölçülen engel: canlı web derlemesi API'yi `localhost:8080` çağırıyor

`apps/web/src/lib/api-transport.ts:24` → `API_BASE_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8080'`
ve istek `${API_BASE_URL}/api${endpoint}` olarak kurulur. Bu değer **derleme anında** paketin içine gömülür.

**Ölçüm (2026-09-21, canlı derleme, salt okuma):** `HY_W4_RELEASE23/project/apps/web/.next/static` altında
`http://localhost:8080` **19 kez** gömülü.

**Sonuç:** Uzak cihazdaki tarayıcı API'yi kendi makinesinde arar. Dış erişim **yalnız yapılandırmayla sağlanamaz**;
`NEXT_PUBLIC_API_URL` genel adrese kurulmuş **yeni bir web derlemesi ve yeni bir yayın adayı** gerekir. Bu, paketin
en büyük kalemidir ve owner onayı ister.

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

## 3. Sağlayıcı önerisi ve gerekçe

**Öneri: giden tünel (ör. Cloudflare Tunnel).** Gerekçeler:
- Gelen port açılmaz; yönlendirici ve genel IP bağımlılığı olmaz. Ölçüm: makinede kurulu ters vekil, tünel
  istemcisi, IIS ve VPN **yok**; etki alanı `telli.local` internete yönlendirilemez.
- TLS sağlayıcı tarafında sonlanır; sertifika yenileme işi kalmaz.
- Yol ve yöntem kısıtı sağlayıcı yapılandırmasında tanımlanır.

**Alternatif: yerel ters vekil (Caddy) + 443 yönlendirme.** Genel IP, yönlendirici erişimi ve DNS A kaydı ister.
Kurulum daha fazla parça içerir.

**Her iki şekilde de doğrulanacaklar (kurulum sırasında, yayından önce):**
1. Kenar katmanı **yöntem kısıtını** gerçekten uyguluyor mu: izin listesi dışındaki yöntem (ör. `/intake` üzerinde
   `DELETE`) reddedilmeli.
2. İstemci IP başlığını nasıl aktarıyor: `X-Forwarded-For` mu, sağlayıcıya özel başlık mı.
3. Kenar katmanı, **istemciden gelen** `X-Forwarded-For` başlığını **silip kendi değerini mi yazıyor**. Silmiyorsa
   sahte başlık zincire girer.

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

**#2730 (trust-proxy) bu topolojide GEREKLİDİR.** Peer allowlist'e eklendiğinde ürün `request.ip` değerini okur;
`request.ip`'in XFF'i yansıtması Express'in trust-proxy ayarına bağlıdır. #2730 main'de, **canlıda değil**
(`merge-base` ile ölçüldü). Yeni yayın adayı zaten gerekli olduğundan bu değişiklik de aynı adaya girer.

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
| `NEXT_PUBLIC_API_URL` | `https://<PUBLIC_HOST>` | **Web derleme zamanı** — yeni aday gerektirir |
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

1. **Owner girdileri** (§10) alınır.
2. Yeni yayın adayı hazırlanır: `NEXT_PUBLIC_API_URL=https://<PUBLIC_HOST>` ile **web derlemesi** + API tarafında
   #2730 ve bu PR'ın `PUBLIC_PORTAL_BASE_URL` değişikliği. Digest'ler ölçülür, disposable regresyon koşulur.
3. Tünel/vekil kurulur; §2 izin listesi ve §3'teki üç doğrulama uygulanır. **Henüz yayın yok.**
4. Owner elevated blokla `.env`'e üç anahtar eklenir; API yeniden başlatılır.
5. Yeni aday yayımlanır (yayın/geri dönüş betikleriyle, R25B kalıbında).
6. §7 kabul zinciri koşulur.
7. Kayıt PR'ı: CI → merge → merge SHA'sında main CI.

## 10. Owner'dan tek seferde istenen bilgiler

1. **Kullanılacak alan adı** ve altında verilecek host adı (ör. `form.<alanadi>`).
2. **DNS yönetimi** kimde: kayıt eklemeyi kim yapacak, hangi sağlayıcı panelinde.
3. **Mevcut yayın imkânları:** kullanılabilir bir tünel/CDN hesabı var mı; yoksa genel IP ve yönlendirici erişimi var mı.

Bu üç bilgi gelmeden 2–7 arası adımlar başlatılmaz. Kod, testler ve izin listesi hazırdır.

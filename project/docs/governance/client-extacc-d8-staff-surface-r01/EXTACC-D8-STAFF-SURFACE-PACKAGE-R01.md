# EXTACC D-8 — PERSONEL YÜZEYİ DIŞARIDAN KAPALI · D-6/D-7 TANIMI · BİRLEŞİK D-9 (R01)

> **DURUM: HAZIR — CANLIDA KOŞULMADI.** D-8 kısmi kaydı (owner telefonu, 5 GET → 403, 2026-09-27 21:14–21:15) **tamamlanmış
> sayılmaz**: katman ölçülmedi; diğer yöntem/yollar açık. Bu paket makine ölçümünü ve telefon beyanını ayırır.

## 1. D-8 makine sondası (`scripts/d8-staff-surface-probe.js`)

Owner PC'sinden, gerçek alan adı ve gerçek TLS ile (`--origin https://<public host>`; TLS doğrulaması kapalıysa reddeder).
**35 ret vektörü** (personel sayfaları `/`, `/auth/login`, `/dashboard`, `/auth/reset-password`; personel API `/api/auth/me`,
`POST /api/auth/login`, `/api/cases`, `/api/users`, `/api/health`; `/api/portal/admin/*` düz/büyük harf/`./`/`%2F`/sorgu
varyantları; intake DELETE/PUT/PATCH; izinli yollarda yanlış yöntem; `/api`, `/api/`, `/robots.txt`) → hepsi **403** beklenir.
**9 pozitif** (izinli çiftler uygulamaya ulaşır, yazma yok): sayfalar 200; `cases/documents/messages` GET, `POST messages`,
`DELETE documents/:id`, `POST change-password` token olmadan **401** (guard'a ulaştı). Giriş denemesi, forgot-password, intake POST,
belge yükleme **yapılmaz** (hız sınırı/e-posta/yazma yan etkisi yok).
**Katman:** ret gövdesi/başlığından türetilir ve ayrıca kaydedilir — `edge-waf` (sağlayıcı imzası), `caddy` (boş 403 gövdesi;
Caddyfile `respond 403`), `unknown`. Dışarıdan 403 görmek katmanı kanıtlamaz; `unknown` "ret yok" demek değildir. Başlık
DEĞERLERİ kanıta yazılmaz (yalnız varlık).
Çıkış: 0 tamamı beklendiği gibi · 2 en az bir ret 403 değil (**bulgu**) · 3 ölçülemeyen · 4 kapı · 7 kanıt yazılamadı.
Öz-test (`d8-selftest.js`, sahte kenar = şablonun 4 regex'i + admin reddi, gerçek TLS): sağlıklı 0 · bozuk kenar 2 (bulgular
`/api/auth/me` + admin varyantları) · sağlayıcı reddi katman `edge-waf` · kenar kapalı 3 · kapılar 4/4/7 · telefon listesi · statik — **9/9 PASS**.

Koşum (normal pencere; `<public host>` R05 kararındaki alan adı — bloklarda `ExpBaseUrl`):
```powershell
& { $ErrorActionPreference='Stop'; $f='D:\Development\HUKUK_YAZILIMI\project\project\docs\governance\client-extacc-d8-staff-surface-r01\scripts\d8-staff-surface-probe.js'; if((Get-FileHash -Algorithm SHA256 -LiteralPath $f).Hash -cne 'DD6448A500084A87577D3E1E65B44A07D4D1729A0CEFB94AD3BEBF10CB008C18'){ throw 'D8 SONDA SHA UYUSMUYOR - DUR' }; $o='C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911\extacc-d8-' + (Get-Date).ToUniversalTime().ToString('yyyyMMdd-HHmmss') + 'Z'; New-Item -ItemType Directory -Force -Path $o | Out-Null; & node $f --origin https://bilgi.tellihukuk.com --out "$o\d8-probe.json" --phone-list; 'D8 cikis=' + $LASTEXITCODE }
```

## 2. D-8 telefon adımı (owner beyanı; makine ölçümü değildir)

Sonda `--phone-list` ile 5 adres yazar (`/auth/login`, `/`, `/api/auth/me`, `/api/portal/admin/documents/pending`, `/api/cases`).
Telefonda (Wi-Fi kapalı, mobil veri, gizli sekme) her adres için: **E** = hata/erişim engellendi · **S** = sayfa/veri açıldı · **?**.
Beyan `owner-declaration-d8.json` olarak ayrı dosyaya elle yazılır (sonda yazmaz). S = ürün/kenar bulgusu adayı.

## 3. D-8 kapanış tanımı

D-8 PASS = sonda çıkış 0 **ve** telefon beyanı 5/5 E. Katman `unknown` ise PASS düşmez ama kayıt "katman ölçülemedi" notu taşır;
`edge-waf`/`caddy` dağılımı kayda yazılır. Bulgu (403 dışı) → kısıtlı kayda alınır; public PR'a yol/yöntem ayrıntısı yazılmaz.

## 4. D-6 belge akışı — kapsam ve kanıt tanımı (koşucu HENÜZ YAZILMADI)

| Konu | Tanım |
|---|---|
| Uçlar (Caddy izin listesi) | `GET /api/portal/documents` · `POST /api/portal/documents/upload` (multipart `file` + `type/title/description/caseId`, ≤10 MB, pdf/jpg/png/doc/docx) · `GET /api/portal/documents/:id/download` · `DELETE /api/portal/documents/:id` · admin uçları (`admin/documents/pending|approve|reject`) yalnız iç ağdan (dış 403 = D-8) |
| Sentetik veri | D-4 kurulumu (İ3 tenant, sentetik müvekkil, portal hesabı `.invalid`); 1 küçük sentetik PDF (runId gömülü, ≤ 50 KB); kapsam dışı ikinci müvekkil (`foreignClientId`) |
| Yan etkiler | `PortalDocument` satırı; diskte `PORTAL_DOCUMENTS/<tenant>/…` dosyası; audit; personel bekleyen belge listesi |
| Ölçütler | D6-1 telefon: yükleme 201 (owner beyanı + DB satırı runId) · D6-2 liste 200 yalnız bu koşumun belgesi · D6-3 indirme 200 içerik sha = yüklenen · D6-4 kapsam dışı `:id` (foreign) indirme/silme **404** · D6-5 DELETE 200 → DB satırı yok + diskte dosya yok (`assertContained` içinde) · D6-6 personel onay/ret iç ağdan (opsiyonel) |
| Kapanış | belge satırı ve dosya YOK ölçülür (silme DELETE ile — ürün ucu; doğrudan dosya silme yok); D-4 kapanış kuralları (portal pasif, sürüm, HTTP 401); Recover: kalan belge varsa DELETE personel/portal oturumu olmadan yapılamaz → owner kararıyla "sentetik belge kaldı" kaydı |
| Owner adımları | telefondan yükleme (dosya seçici) gerektiği için beyan zorunlu; koşucu multipart POST'u DIŞ uçtan da kendisi yapar (makine ölçümü) |

## 5. D-7 mesaj akışı — kapsam ve kanıt tanımı (koşucu HENÜZ YAZILMADI)

| Konu | Tanım |
|---|---|
| Uçlar | `GET /api/portal/messages` · `POST /api/portal/messages` (`content`, `caseId?`) · `GET messages/unread-count` · `POST messages/mark-read`; personel: `GET/POST /api/portal/admin/messages/:clientId` (iç ağ) |
| Sentetik veri | D-4 kurulumu; mesaj içeriği `D7-<runId>` (kişisel veri yok) |
| Yan etkiler | `ClientMessage` satırları (silme ucu **yok** → satırlar kalır; tenant kapanışıyla erişilemez); bildirim/e-posta tetikleyicisi olup olmadığı ölçülecek (kaynak taraması: `sendMessageFromClient` → outbox?) — **açık soru, koşucu yazımından önce ölçülür** |
| Ölçütler | D7-1 telefon POST 201 (DB satırı runId) · D7-2 GET 200 yalnız bu koşumun mesajları · D7-3 personel yanıtı iç ağdan → portal GET'te görünür, unread-count 1 → mark-read 0 · D7-4 kapsam dışı `caseId` (foreign) ile POST **404** · D7-5 dış admin uçları 403 (D-8) |
| Kapanış | mesaj satırları kalır (sentetik tenant CLOSED); U-ISO; portal kapanışı D-4 kuralları; "satır kaldı" kaydı owner kararı |

## 6. Birleşik D-9 tanımı

D-9 (birleşik) = D-4/D-5/D-6/D-7 koşumlarının her birinde: (a) DB kapanışı (portal pasif, `tokenVersion` verilme sürümünden büyük,
`resetToken` NULL, `hasPortalAccess=false`, personel pasif, Case CLOSED), (b) HTTP reddi yerel+dış (yeni giriş 401, mevcut oturum 401),
(c) belge dosyası/satırı yok (D-6), (d) izolasyon parmak izi değişmedi (U-ISO), (e) intake bağlantısı USED/iptal (D-1..D-3 kapsamı, zaten kabul).
Oturum, bağlantı, belge ve mesaj kapanışları **ayrı satırlarda** ölçülür; biri ölçülemeyen ise D-9 PASS sayılmaz. Ekran görüntüsü
kanıt yerine geçmez; owner beyanı makine ölçümünden ayrı tutulur.

## 7. Pinler

`d8-staff-surface-probe.js` `DD6448A500084A87577D3E1E65B44A07D4D1729A0CEFB94AD3BEBF10CB008C18` · `d8-selftest.js` `E50EAE0C65EFC96821CADDE441EEF6FB7657D8F853F9F4C72A561D73735EF848`.

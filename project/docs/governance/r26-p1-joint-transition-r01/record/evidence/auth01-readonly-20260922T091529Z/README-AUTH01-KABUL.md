# OFFICE-AUTH-01 — dar salt-okuma canlı kabul (owner GO, 2026-09-22)

Yürütücü: OFFICE oturumu ebf5dee1. Canlı DB'ye yazma YOK, form gönderimi YOK, parola sıfırlama/davet işlemi başlatılmadı.
Tarayıcı katmanında yalnız GET geçti; GET dışı engellenen istek **0**. Gerçek token KULLANILMADI (sentetik işaretleyici, çıktıda maskeli).

## Kabul kapsamı (owner tanımı)
1. Üç personel sayfasına girişsiz erişim
2. Token aktarımının korunması (formun token'ı kullanabilir durumda olması)
3. `/dashboard` erişim koruması

Uçtan uca parola değiştirme veya davet kabulü bu kapsamda DEĞİLDİR.

## Sonuç: 3/3 ölçüt PASS

| Ölçüt | Kaynak | Sonuç |
|---|---|---|
| 1. Girişsiz erişim: `/auth/forgot-password`, `/auth/reset-password#token=…`, `/auth/accept-invite?token=…` | R26 #2745 B2 **DK-6** (`r26-dar-kabul-after.json`, 08:15:39Z) — **yeniden koşulmadı** | PASS (DK-6) |
| 2a. reset-password: token form durumuna alınır | `auth01-accept.json` **A2** + kontrol **A2c** | PASS — React `useState` değeri = işaretleyici; "token bulunamadı" iletisi yok; gönder düğmesi ETKİN. Kontrolde (token yok) ileti VAR, düğme DEVRE DIŞI. Hash'in URL'den silinmesi bilinçlidir (`history.replaceState`, kaynak yorumu), kayıp değildir |
| 2b. accept-invite: token forma ulaşır | **A3** + kontrol **A3c** | PASS — token URL'de korunur (`useSearchParams`); gönder düğmesi ETKİN, hata iletisi yok. Kontrolde düğme DEVRE DIŞI. Kaynak: `disabled={isLoading \|\| !token}` → düğmenin etkinliği token'ın bileşende bulunduğunu gösterir. Fiber taramasında değer bulunamadı (token hook durumu değil, render sırasında hesaplanır); ölçüt düğme farkıyla karşılandı |
| 3. `/dashboard` erişim koruması | **A1** | PASS — temiz bağlam (başlangıç çerez 0, `token` anahtarı yok); `/dashboard` → `/auth/login`; `/dashboard` yolundayken `main/aside/header/nav` HİÇ oluşmadı, görünür metin 0; sunucu HTML'inde kabuk yok; veri API'si 2xx **0** (yalnız `GET /api/auth/capabilities` 200 — herkese açık yetenek ucu); login formu göründü |

A2/A3 sayfaları token aktarımını ölçmek için açıldı. Bu, DK-6'nın tekrarı değil; ölçümün doğal sonucudur.

## Aynı canlı build bağı
- DK-6 zinciri (R26 #2745 kanıtları): web süreci pid 58736 başlangıç **07:33:42Z** (B1) → A3 kapısı 07:49:33Z web `C17E7B13…` (505) → **DK-6 08:15:39Z** → A4-S1-after-B2 08:19:07Z web `C17E7B13…`.
- Bu koşum: `identity-pre.json` / `identity-post.json` / `identity-post2.json` → web `.next` `C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326` (505 dosya; `cache/` + `trace` hariç), BUILD_ID `5waeMoFGGMTLAYmn9oJvW`, **aynı pid 58736, aynı başlangıç** → DK-6 ile bu ölçüm aynı canlı build ve aynı süreç üzerindedir.
- Sunulan içerik = disk: `auth01-served-build.json` — test edilen 3 sayfanın referans verdiği 16 script'in 16'sı canlı `.next` ile sha256 EŞİT; sunulan JS'de 7 elemanlı PUBLIC_PATHS 1, eski 4 elemanlı 0; HTML'de BUILD_ID var.

## Ölçüm aracı notu (şeffaflık)
`auth01-accept.json` içindeki **B** satırı FAIL'dir ve dosyanın `sonuc` alanı bu yüzden "PASS-OLMAYAN 1" gösterir. B, `_buildManifest.js` isteğini varsayıyordu; App Router ilk yüklemede bu isteği yapmaz → **ölçüm kusuru, ürün kusuru değil**. Kabul ölçütü değildir. Build bağı yukarıdaki dosya digest'i + süreç kimliği + `auth01-served-build.json` ile ayrıca kanıtlandı. Özgün çıktı değiştirilmeden korunmuştur.

## Dosyalar
`SHA256SUMS.txt` içindedir. Betikler: `office-auth01-accept.js`, `auth01-served-build.js`, `auth01-live-identity.ps1`.

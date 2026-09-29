# EXTACC D-5 — PORTAL PAROLA SIFIRLAMA CANLI KABUL PAKETİ (R01)

> **DURUM: HAZIR — CANLIDA KOŞULMADI.** Gerçek e-posta gönderimi, canlı Run/Recover ve yayın bu paketle yetkilendirilmez.
> **ÖN KOŞUL:** canlı API dist'i **R27** (`E28A6863…5134`; D5-SEC-R01/R02/R03). Canlı R26 iken owner bloğu Preflight/Run **DUR** verir
> (R26'da kapatma sıfırlama token'ını temizlemez → kapanış doğrulanamaz).

## 1. Ne ölçer (`client-external-access-r01` §7 D-5) ve ne yapmaz

Uçtan uca: owner telefonundan "şifremi unuttum" talebi → ürün **tek gerçek e-posta** gönderir (bağlantı `PUBLIC_PORTAL_BASE_URL`
ile, token fragment'ta) → owner e-postadaki bağlantıyı telefonda açar, konsolda gösterilen yeni parolayı girer → bir kez giriş yapar →
koşucu DB/HTTP ile ölçer → kapanış. D-4 R03'ün kapanış kuralları aynen (DB ve HTTP ayrı; sürüm verilme sürümüyle karşılaştırılır;
belirsiz oluşturma bekler; Recover ölçülemeyeni 0 yapmaz) + **P5-C-TOKEN** (kapanıştan sonra kullanılabilir token kalmaz).
Koşucu **e-posta göndermez** (talep telefondan; ürün gönderir), `reset-password`/`change-password`/belge/mesaj uçlarını çağırmaz;
alıcı adresini, parolaları, token'ları ve GO'yu hiçbir kanıta yazmaz. Gönderimsiz kontrol için `.invalid` adresle bir
`forgot-password` çağrısı yapar (P5-UNKNOWN; e-posta çıkmaz).

## 2. Ölçütler

| ID | Ölçüt | Kaynak |
|---|---|---|
| P5-GATE | alıcı adresi HİÇBİR portal hesabında yok (aktif/pasif, tüm tenantlar; büyük/küçük harf duyarsız) — aksi hâlde yazmadan çıkış 4 | DB |
| P5-00 / P5-01 / P5-02 | elev1 ADMIN değil · alıcı adresiyle sentetik müvekkile portal hesabı (gönderim yok) · DB aktif+erişim+adres+token yok | D-4 kalıbı |
| P5-03L / P5-04D | koşucu S0 (ilk parola) yerel 201 · S0 ile dış liste 200 yalnız `I3-<runId>` | HTTP |
| P5-DISP1 | 1. konsol: QR `…/portal/forgot-password` + adres (yalnız CONOUT$) | konsol |
| P5-TOKEN-ISSUED | talep sonrası DB'de token özeti + süre ≈ 1 saat (bu anda ürün e-postayı göndermiştir; gönderim koşucu ölçümü değildir) | DB |
| P5-UNKNOWN | `.invalid` adrese talep: aynı başarı cevabı, bu hesabın token durumu değişmedi, audit sayısı ayrı raporlandı | HTTP+DB |
| P5-DISP2 | 2. konsol: yeni parola (yalnız CONOUT$) | konsol |
| P5-CONSUMED | parola hash'i değişti **ve** token NULL **ve** tokenVersion tam +1 | DB |
| P5-WAIT | koşucu dışından yeni parolayla giriş (loginCount, talep öncesi tabana göre; cihaz/ağ owner beyanı) | DB |
| P5-S1-OPEN / P5-S1-EXT / P5-S0 / P5-OLDPW | S1 yerel 201 · S1 dış 200 · S0 dış 401 · eski parola dış 401 | HTTP |
| P5-SINGLE-USE | inceleme süresi boyunca hash/sürüm sabit, token yok (aynı bağlantı ikinci kez işe yaramadı) | DB |
| P5-C1 … P5-C5, P5-C-TOKEN, P5-C2V | kapanış (D-4 R03 kuralları) + token iptali | DB+HTTP |
| U-CLOSE / U-ISO / P5-D9 | personel/dosya kapanışı · izolasyon · birleşik | DB |
| P5-SCRUB (owner kararı) | alıcı adresi pasif sentetik hesapta `.invalid` ile ezildi | DB |

Çıkış: 0 PASS · 2 FAIL · 3 ÖLÇÜLEMEYEN · 1 DURDU · 4 KİMLİK/HEDEF/ADRES REDDİ · 5 PERSONEL/DOSYA · 6 PORTAL KAPANIŞI DOĞRULANMADI · 7 KANIT YAZILAMADI (öncelik 6 > 5 > 7 > 1 > 2 > 3 > 0).

## 3. Owner bloğu (`scripts/d5-owner-live-block.ps1`) — modlar ve sıra

Preflight (salt okuma; main senkron, paket pinleri, **R27 dist pini**, `.env` sha, `PUBLIC_PORTAL_BASE_URL` = R05 kararı,
`EMAIL_PROVIDER = smtp`, 8080 tek dinleyici, yabancı kabul süreci yok, DB kimliği, dış zincir: 8081 yalnız loopback = HY-Caddy,
Cloudflared Running) · QrTest (canlı veri yok) · **Run**: konsol → bağımsız pencere teyidi → canlı veri işleme "EVET" → alıcı adresi
(iki kez, yalnız konsol) → tek gönderim onayı "GÖNDER" → ezme kararı E/H → GO (yerel) → defter (sha256) → koşum → ekran temizliği →
owner beyanı (9 soru, ayrı dosya) → manifest · **Recover**: `-ReceiptFile`; ezme kararı sorulur; GO/alıcı sorulmaz.
Alıcı adresi hiçbir dosyaya yazılmaz (`owner-block.json`: `recipientWritten=false`, `plannedRealSends=1`, `scrubRequested`).
Canlı süreler bloğun içinden zorlanır (20 dk bekleme · 5 sn yoklama · 120 sn inceleme · 120 sn geç oluşma · token TTL 1 saat).

## 4. Owner adımları (telefon: Wi-Fi KAPALI, mobil veri, gizli sekme; yalnız ekranda gördüğünüz gerçek değerleri kullanın)

1. Bağımsız PowerShell penceresi (uygulama paneli DEĞİL). `-Mode Preflight` → "PREFLIGHT GEÇTİ" değilse durun.
2. `-Mode QrTest` → telefonla QR okutun; "şifremi unuttum" sayfası açılırsa **E**; formu göndermeyin.
3. `-Mode Run`: soruları yanıtlayın (pencere teyidi, EVET, alıcı adresi ×2, GÖNDER, ezme E/H, GO ref).
4. 1. konsol ekranı: QR'ı okutun, ekrandaki adresi forma **aynı** yazın, formu **bir kez** gönderin. E-postayı bekleyin.
5. 2. konsol ekranı göründüğünde: telefonda e-postadaki bağlantıyı açın, ekrandaki yeni parolayı girin, bir kez giriş yapın; listede yalnız ekrandaki dosya numarası olmalı. Sonra aynı bağlantıyı ikinci kez açıp deneyin (hata beklenir).
6. Koşum bitince ekran temizlenir; 9 beyan sorusunu yanıtlayın (adres/parola/bağlantı yazmayın). Pencereyi kapatın.
7. Çıkış 5/6 ise `-Mode Recover -ReceiptFile <kanıt dizinindeki d5-setup-receipt.json>` BİR KEZ; kabul tekrarlanmaz.

## 5. Öz-testler (canlıya dokunmadan; 2026-09-29)

| Test | Sonuç |
|---|---|
| `d5-selftest.js` (disposable DB 5447 + sahte API/posta kutusu + gerçek TLS): Z1 normal 0; Z2 adres kapısı 4; Z3 talep yok + ezme 3; Z4 talep var sıfırlama yok 3 (token kapanışta silindi); Z5 token tüketilmiyor → FAIL 2; Z6 sürüm artmıyor → S0 200 FAIL 2; Z7 kapatma token silmiyor → 6, Recover 6; Z8 token yazılmadı 3; Z9 kapılar; Z10 create 500 → 6; Z11 konsolsuz 4; Z12 makbuz 1; S-1 sır sızıntısı (alıcı/token/parolalar/JWT/DB URL/GO) yok; T/P statik | **33/33 PASS** |
| `d5-owner-block-selftest.ps1` (AST ile gerçek fonksiyonlar; gerçek node; kapılar K-1..K-8; R-1/R-8/R-9; L-1/L-2 7 süre; O-1..O-3; Z; Q; S-1..S-4) | **53/53 PASS** WinPS 5.1 ve pwsh 7.6.6 |

Öz-testte "telefon" bir istemci taklididir; yeni parolayı koşucunun **yalnız display=none ve canlı olmayan DB'de** yazdığı test
dosyasından (`D5_TEST_DISPLAY_SINK`) alır — bu yol kaynakta tek yerde, `if (con)` dalının dışında ve owner bloğunda kurulmaz (T-2, S-4).

## 6. Pinler

| Dosya | sha256 |
|---|---|
| `d5-portal-reset-live-run.js` | `D9E95BB247F74E8E9966F63C88593339E193BD5679927D7F860C8090FEDC75A1` |
| `d5-owner-live-block.ps1` (paket digest bloğun içinde `E2B80ED0…A16B`; `ExpLiveDist` = R27 `E28A6863…5134`) | `ACC5AD06CFE63AAE378FE6BC0E6B23EB2BDC152E4ECBBE33999873FCD2E6F35C` |
| `d5-fake-portal-api.js` / `d5-selftest.js` / `d5-owner-block-selftest.ps1` | `E18446C4…F848` / `2E458A12…8B4F` / `87F9BFEF…EDE6` |

## 7. Owner kararları ve sınırlar

- **K-2 alıcı adresi**, **K-3 gönderim adedi (plan 1)**, **K-4 ezme** — R27 paketi §10. Bu bilgiler uydurulmaz; gönderim yapılmadı.
- Sahte API ürünün kendisi değildir: ürünün hız sınırı (portal deposu ayrı), gerçek SMTP gönderimi ve tenant yaşam döngüsü yalnız canlıda ölçülür.
- E-postayı silmek kapanış değildir; kanıt P5-C-TOKEN'dır. Sağlayıcı günlüğü alıcıyı içerebilir (kısıtlı kayıt SEC-MAIL-LOG-01; onay metninde belirtilir).
- Bu paket H1–H8 sayacını değiştirmez (0/8).

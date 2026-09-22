# OFFICE-AUTH-01 — DAR KAPSAMLI KAPANIŞ KAYDI (R01)

| alan | değer |
|---|---|
| Durum | **OFFICE-AUTH-01 KAPANDI (dar kapsam)** — canlı R26 build'inde kabul ölçütlerinin 3'ü de kanıtlı PASS |
| Kusur / düzeltme | Personel parola sıfırlama ve davet sayfaları girişsiz açılınca login'e yönleniyordu. Düzeltme #2740 (`799a7346`); R26 ile canlıya çıktı (Pencere A kaydı: `R26-WINDOW-A-RECORD.md`) |
| Kabul kapsamı | **Owner tarafından doğrudan onaylandı (2026-09-22):** (1) üç personel sayfasına girişsiz erişim, (2) token'ın forma aktarılması, (3) `/dashboard`'un girişsiz kullanıcıyı login'e yönlendirmesi. **Kapsam dışı:** uçtan uca parola değiştirme ve davet kabulü |
| Koşum | OFFICE 33 (`20c5ed9b`, iç kimlik `ebf5dee1`), owner GO ile, salt okuma. Kanıt OFFICE 33 tarafından bu oturuma devredildi. Kayıt: OFFICE `a8d9121a` |
| Canlıya etki | Canlı DB'ye yazma yok, form gönderimi yok, gerçek token yok. Tarayıcıda yalnız GET geçti; GET dışı engellenen istek 0 |

## 1. Ölçüt → kanıt

| ölçüt | kanıt | sonuç |
|---|---|---|
| 1. Girişsiz erişim: `/auth/forgot-password`, `/auth/reset-password#token=…`, `/auth/accept-invite?token=…` login'e yönlenmez | R26 B2 **DK-6** (runId `5f06e5b1`, 08:15:39Z): `evidence/b2-5f06e5b1/r26-dar-kabul-after.json` `B1FBC0E52972A533E593895C4E476F03BE8E5189BC7C1B09AE01529CA005BB2B`. Yeniden koşulmadı | **PASS** |
| 2a. reset-password: token forma aktarılır | `auth01-accept.json` **A2** + kontrol **A2c** | **PASS.** A2: form durumundaki değer = sentetik işaretleyici; "token bulunamadı" iletisi yok; gönder düğmesi etkin. A2c (token yok): ileti var, düğme devre dışı. Hash'in URL'den silinmesi kaynakta bilinçli (`history.replaceState`) |
| 2b. accept-invite: token forma ulaşır | **A3** + kontrol **A3c** | **PASS.** A3: token URL'de korunur, düğme etkin, hata yok. A3c: düğme devre dışı. Kaynakta `disabled={isLoading \|\| !token}` |
| 3. `/dashboard` girişsiz kullanıcıyı login'e yönlendirir | **A1** | **PASS.** Temiz bağlam: çerez 0, `token` anahtarı yok. `/dashboard` → `/auth/login`; `/dashboard` yolundayken `main/aside/header/nav` oluşmadı, görünür metin 0; sunucu HTML'inde kabuk yok; veri API'si 2xx = 0 (yalnız herkese açık `GET /api/auth/capabilities` 200); login formu göründü |

## 2. Ham sonuç ve ölçüm ikamesi (owner koşulu: ham FAIL korunur, yeniden etiketlenmez)

`auth01-accept.json` **ham** sonucu: `sonuc = "PASS-OLMAYAN 1"`. **B** satırı **FAIL**: `sunulanBuildId = []`, beklenen `5waeMoFGGMTLAYmn9oJvW`. Bu çıktı **değiştirilmedi**; koşum "tümü PASS" diye yeniden etiketlenmedi.

**Yanlış varsayım:** B, sunulan BUILD_ID'yi `/_next/static/<BUILD_ID>/_buildManifest.js` isteğinden okumayı varsaydı. Next.js App Router ilk sayfa yüklemesinde bu isteği yapmaz. Bu yüzden B hiç değer görmedi (`[]`). Bu ürün kusuru değil, ölçüm aracının kusurudur.

**B'nin amacı:** Sunulan build'in canlı R26 build'i (`5waeMoFGGMTLAYmn9oJvW`) olduğunu doğrulamak.

**İkame kanıtı:** Aynı koşum, aynı süreç. `auth01-served-build.json` `31F1C877…F62F`, verdict PASS, 09:16:26Z. B'nin amacını eksiksiz karşılar; dört ayrı ölçümle daha güçlüdür:

| # | ikame ölçümü | değer |
|---|---|---|
| İ-1 | Sunucu HTML'i beklenen BUILD_ID dizesini **aynen** içerir (`html.includes('5waeMoFGGMTLAYmn9oJvW')`) | `/auth/reset-password`, `/auth/accept-invite`, `/dashboard`: **3/3 true** |
| İ-2 | Test edilen sayfaların referans verdiği her script, canlı diskteki `.next` dosyasıyla sha256 karşılaştırıldı | **16/16 EŞİT**; farklı 0, eksik 0 |
| İ-3 | Canlı disk `.next` = R26 WEB | `identity-pre/post/post2.json`: `C17E7B132FB7DED65AD0788024AA478F0949AF0D5D9045E8F47779A31A615326` (505 dosya; `cache/` ve `trace` hariç), BUILD_ID `5waeMoFGGMTLAYmn9oJvW` |
| İ-4 | Aynı canlı süreç | web pid **58736** (R26 B1'in başlattığı süreç, 07:33:42Z) pre/post/post2'de aynı; sunulan JS'de #2740'ın 7 elemanlı `PUBLIC_PATHS`'i 1, eski 4 elemanlı 0 |

Owner'ın koşulu "ikame, başarısız kontrolün amaçladığı build kimliğini eksiksiz doğruluyorsa" idi. İ-1..İ-4 bu koşulu karşılar. **İkame owner onayıyla kabul edildi.** B satırının kendisi FAIL olarak kalır.

DK-6 ile bu koşum aynı build ve aynı süreç üzerindedir. DK-6 08:15:39Z; bu koşum 09:15–09:16Z; aradaki A4-S1-after-B2 08:19Z ölçümü de `C17E7B13` ve pid 58736.

## 3. Kanıt (kopya; kaynak yerinde korunur)

Kaynak dizin: `D:\Development\HUKUK_YAZILIMI\HY_OFFICE_AUTH01_EVIDENCE\auth01-readonly-20260922T091529Z\`
Kopya: `evidence/auth01-readonly-20260922T091529Z/`. `SHA256SUMS.txt` `196D8F3E6426983C993443B3E8C56A3068AA4C2CAB7EA314133B0C20AE9471D7` ile **9/9 eşit**. OFFICE `a8d9121a` bağımsız olarak yeniden ölçtü; sır taraması temiz, işaretleyici maskeli.

| dosya | içerik |
|---|---|
| `auth01-accept.json` | A1, A2, A2c, A3, A3c PASS; **B FAIL (ham, korunur)** |
| `auth01-served-build.json` | İkame kanıtı, PASS |
| `identity-pre.json` / `identity-post.json` / `identity-post2.json` | Canlı `.next` digest'i, BUILD_ID, süreç kimliği |
| `office-auth01-accept.js` · `auth01-served-build.js` · `auth01-live-identity.ps1` | Ölçüm araçları |
| `README-AUTH01-KABUL.md` | Koşum yürütücüsünün notu |

## 4. Kapanış metni

> **OFFICE-AUTH-01 KAPANDI (dar kapsam):** Girişsiz erişim (DK-6), token aktarımı (A2/A2c, A3/A3c) ve `/dashboard` koruması (A1), canlı R26 build'inde (WEB `C17E7B13` / BUILD_ID `5waeMoFGGMTLAYmn9oJvW`) PASS verdi. Build kimliği ölçümünde ham B FAIL korunur. Owner onayıyla ikame kanıt kabul edildi: HTML BUILD_ID 3/3, sunulan script 16/16 disk eşit, aynı süreç. Uçtan uca parola değiştirme ve davet kabulü **kapsam dışı**.

Bu kayıt P1/A3'ü, hizmet kabulü sayacını (0/8) ve OFFICE genel finalini **etkilemez**.

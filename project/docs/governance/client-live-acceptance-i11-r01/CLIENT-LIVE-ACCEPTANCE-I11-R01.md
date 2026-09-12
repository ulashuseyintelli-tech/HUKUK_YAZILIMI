# CLIENT İ11 — H5 INTAKE KABUL PAKETİ (R01 — düzenek + yerel doğrulama; canlı koşum YOK)

**Durum: CANLI GO'YA HAZIR — canlı koşum YAPILMADI.** Bu belge owner onayı ya da kapsam kararı
değildir. Canlı koşum ayrı, yazılı bir owner GO'su (`OWNER-GO-CLIENT-I11-<YYYYMMDD>-R<nn>`) ister (§10).

- Kapsam ve öncüller R02'den satır kaynaklı çıkarıldı (§1–§2). **A-9/A-10 İ12'nindir**; bu pakette
  üretilmez ve sayılmaz. İ4/İ5 İ11'in öncülü değildir; İ10 kapandı (10/17).
- Düzenek: üç yeni betik ve `cl-lib.js` GO-ref deseninde `I11` (§4). Canlıda İ11 betikleri **yalnız
  İ11 GO ref'iyle** açılır. **Ürün kodu değişmedi.**
- **Kritik kapsam kararı (§6):** A-5/A-6 gerçek bir sağlayıcı çağrısı ister; canlı sağlayıcı
  `EMAIL_PROVIDER=smtp` ile **gerçek posta sunucusudur**. Gönderim kapsamı owner'ın ayrı onayı olmadan
  KAPALIDIR; kapalıyken İ11 üç gözlemin yalnız birini (review→promote) canlıda ölçer ve **kapanmaz**.
- Yerel doğrulama oturuma özel disposable DB'de, R27 derlemesiyle ve **yerel SMTP yakalayıcı** ile
  yapıldı: **5/5 senaryo DOĞRULANDI** (§7). Gönderim kapsamı açık koşumda **PASS 11 · FAIL 0 ·
  ÖLÇÜLEMEYEN 0**; 210 tablonun tamamında yazma farkı envanterle birebir.

Sayaç **10/17**, hizmet kabulü **0/8 tam**. Bu paket ikisini de değiştirmez.

---

## 1. İ11'in kapsamı — KAYNAKTAN

R02 §3.3 satır 207, birebir:

> | **İ11** | **H5 intake kabulü**: **A-5** (kalıcı gövde ham token taşımaz) · **A-6** (bağlantı yalnız
> sağlayıcı metninde) · **review→promote** kapısı (inceleme yetkisi aktarım yetkisi vermez) | KAN |
> Üç gözlem PASS; **gerçek alıcıya gönderim YOK** | H5 | 0,5–1 gün |

A-5/A-6 tanımları `client-remaining-decisions-r01/RELEASE20-HANDOVER-R01.md` §5.2 (satır 193-194):

| # | Adım | Beklenen |
|---|---|---|
| A-5 | Bilgi talebi gönderimi (test sağlayıcısı) | 201; DB'deki `emailBody` ham token/URL TAŞIMAZ |
| A-6 | Aynı talep `attachIntakeLink` ile | sağlayıcıya giden metin bağlantı TAŞIR; kalıcı gövde TAŞIMAZ |

**A-9/A-10 bu işin değildir.** R02 satır 208'e göre `A-9` (sağlayıcı reddi → 503, kayıt oluşmaz) ve
`A-10` (timeout → `..._EMAIL_INDETERMINATE`, ikinci çağrı yok) **İ12'nin (H6) yedi gözleminin**
parçasıdır. İ11 düzeneği sağlayıcı reddi/timeout senaryosu **üretmez**; İ12 kendi paketinde üretir.
İki işin ortak yüzeyi aynı uçtur (`POST /address-discovery/client-info-request`), ölçülen özellik
farklıdır: İ11 **sızıntı** (kalıcı gövde ↔ taşıma metni), İ12 **gönderim sonucu** (red/timeout).

"Üç gözlem" = **A-5 · A-6 · review→promote kapısı**.

## 2. Öncüller — satır kaynaklı

| Kaynak | Hüküm | İ11 için |
|---|---|---|
| R02 §3.3 satır 199 | "Hepsi İ7 + İ3'e bağlıdır." | İ3 **KAPALI** · İ7 **KAPALI** (canlı RELEASE22/R27) |
| R02 §5 satır 285-287 | Kabuller sıralı: İ8 → İ9 → **İ10 → İ11** → … | İ8, İ9, İ10 **KAPALI** (İ10: runId `c9b07bcb`, #2638) |
| R02 §3.5 satır 222-223 | her koşum kendi tenant'ını üretir | İ11 kendi tenant'ını üretir (`cl-acc-<runId>`) |
| R02 §5 satır 293-294 | "hiçbir iş kendisinden sonra gelen bir işe bağlı değildir … İ4 yalnız İ16'yı açar." | **İ4/İ5 İ11'in öncülü değildir** |

**Sonuç:** İ11'in açık öncülü kalmadı. Eksik olan owner'ın canlı GO'su ve **gönderim kapsamı
kararıdır** (§6, §10).

## 3. Ölçüt haritası — her gözlem gerçek uca, aktöre ve yazma etkisine bağlı

Kurulum (§5.1) üç aktör üretir. **reviewer** = USER + `StaffMember` profili + `client.intake.review`
izni (PermissionGrant, GLOBAL, ALLOW), PARTNER bağı YOK. **plain** = USER + `StaffMember`, izin YOK.
**elevated** = USER + PARTNER `Lawyer` bağı. Böylece reviewer ile plain arasındaki tek fark izin,
reviewer ile elevated arasındaki tek fark PARTNER bağıdır.

| Sıra | Kalem | Uç | Aktör | Beklenen | Yazma ölçümü |
|---|---|---|---|---|---|
| 1 | P-0r/e/p | `POST /auth/login` | üçü | 201 + token | yok |
| 2 | P-0x | — (DB) | — | reviewer izin 1 / lawyer 0 · elevated PARTNER 1 · plain izin 0 | ölçüm geçerliliği |
| 3 | **R-3** | `POST /client-intake-submissions/:id/claim` | plain | **403 `CLIENT_MUTATION_DENIED_INTAKE_REVIEW`** | başvuru fotoğrafı aynı · audit aynı |
| 4 | **R-1** | aynı uç | reviewer | **201** · başvuru `IN_REVIEW` + `claimedById=reviewer` | audit +1 (`CLIENT_INTAKE_REVIEW_COMMAND`) |
| 5 | **R-2 (KAPI)** | `POST /client-intake-fields/:fieldId/promote-address` (geçerli gövde: `debtorId`+`street`+`city`) | reviewer | **403** | `DebtorAddress` 0 · alan `promotedAt/RefId` null · başvuru aynı · audit aynı |
| 6 | **R-2b (KAPI)** | `POST /client-intake-fields/:fieldId/promote-soft` | reviewer | **403** | `ClientIntelStatement` 0 · alan aynı · audit aynı |
| 7 | **A-0i** | `POST /address-discovery/client-info-request` | anonim | **401** | talep/bildirim/adres-audit 0 · gönderim YOK |
| 8 | **A-5** | aynı uç (bağlantısız) | elevated | **201** · kalıcı `emailBody` URL/token TAŞIMAZ | `ClientInfoRequest`+`ClientNotification`+`AddressAuditLog` +1, audit +1 |
| 9 | **A-6** | aynı uç `attachIntakeLink:true` | elevated | **201** · yeni `ClientIntakeLink` · kalıcı gövde yine temiz | +1 link · diğerleri A-5 gibi |

- **A-5/A-6 yalnız gönderim kapsamı açıkken çalışır** (§6). Kapalıyken "KAPSAM DIŞI" yazılır; sessizce
  düşürülmez, PASS da sayılmaz.
- **Doğru kapı:** R-3'ün 403'ü `reasonCode` ile doğrulanır. R-2/R-2b gövdeleri **geçerlidir**; aksi
  hâlde 400 doğrulama katmanından gelir ve ölçüm yanlış kapıdan gelmiş olur (provada bu hata bir kez
  yaşandı ve düzeltildi, §7.4).
- **Dur kuralı:** bir yetkisiz deneme (R-3 · R-2 · R-2b · A-0i) beklenen reddi vermez, istek hatası
  üretir ya da yazma izi bırakırsa sonraki yetkisiz deneme **gönderilmez** (§7 F).

## 4. Düzenek — dosyalar ve tam kimlikler

Kök: `project/docs/governance/`. Canlı koşum yalnız `i11-run.js` üzerinden yapılır.

| Dosya | sha256 | R01'de |
|---|---|---|
| `client-live-acceptance-i11-r01/scripts/i11-run.js` | `B5EA80880549B8C9FB90604E326ECAD643E1833D7F7ECE0A54D41581C7757720` | **YENİ** |
| `client-live-acceptance-i11-r01/scripts/i11-01-setup.js` | `EA2765BD8237E0B2227237C0FFBCABF9B2BB2250C974D541ECC620203B1ED4A7` | **YENİ** |
| `client-live-acceptance-i11-r01/scripts/i11-02-intake.js` | `7D8D492BC6CE4A2E2CD3CB77EEACAC01594D1DDD9D17F9F767D0625DDB251789` | **YENİ** |
| `client-live-acceptance-i1b-r01/scripts/cl-lib.js` | `788F4EB87846ED620FC7D109D70077B0B9B8936D27CA9B4D1494C32E06C18EDB` | **DEĞİŞTİ** (GO deseni +I11) |
| `client-live-acceptance-i1b-r01/scripts/cl-09-close-access.js` | `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` | değişmedi |
| `client-live-acceptance-i9-r01/scripts/i9-03-isolation.js` | `0EA99FD0F37B6625A0DE92EA6B361E12C592A9EB84CD3EE85823F43F0F109B6A` | değişmedi (yeniden kullanılır) |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | `DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7` | değişmedi |
| `f04-live-acceptance-r01/scripts/f04-lib.js` | `1D35429566BC0A0469F44ED028FEF829AF204A90C9A5565C6882EF99C6305CA8` | değişmedi |

`cl-lib.js`'in İ10 kaydındaki `C3948BB5…` sürümü o koşumun sürümüdür ve tarihsel olarak doğrudur;
İ11 komutu yeni hash'i denetler. Değişiklik yalnız GO-ref desenine `11` eklenmesidir.

### 4.1 Ölçülen ürün ikilisi — İ11 davranışını belirleyen RELEASE22 dist dosyaları

| Dosya | sha256 |
|---|---|
| `modules/address-discovery/address-discovery.controller.js` | `111807F3463CE07B4147F9FE08AAA23177B9A364BB879AE2B72A4B42B3A8BB6D` |
| `modules/address-discovery/client-info-request.service.js` | `6F7BA8DED41C84C4774E5B339CA2820DB7D8A27EAAE46DBFE339E13E5E3A2FA4` |
| `modules/client-intake-review/client-intake-review.controller.js` | `ED8455F9A8F106EB6959EDE3E0E1A629170802795B1A2525D6670DFD150B26E9` |
| `modules/client-intake-review/client-intake-review-authorization.service.js` | `97DF59B722102EFC58981FFB5D64FB8D837E07F63EC3F6AAE89E2196CD931F37` |
| `modules/client-intake-promotion/client-intake-promotion.controller.js` | `2DE45ABB813C9937D7A44637B617D508B870474E7226A7BD32E979F82C636266` |
| `modules/client-intake-promotion/client-intake-promotion.service.js` | `8AE1BC03E3F2D845E45725C76C944D594D5B847082AE2ED50A8991B2C65DBE0A` |
| `modules/client-intake-link/client-intake-link.service.js` | `32223CA85292A4FE9784F5CACF9E7A07BE67A00B5F9E905FDE5D79C244422D40` |
| `modules/notification/email-provider.service.js` | `231B77F67514A2D039E760A8150250E64C26DEB6B2145A8354AA89D11C69233A` |
| `modules/client/client-workspace-command-authority.js` | `D8373C726264631A214056135EBBE36BAA12BA3C91ECCD5F8E589E3F0940A9F6` |
| `modules/client/client-mutation-policy.js` | `075FBE3DE30A45A624A04B9812F6F1E59825D032E80FE234CFC50D4865FFC81A` |

### 4.2 Kapının kaynaktan çıkarılmış hâli

- **İnceleme (claim/field-decide/reject):** `runAuthorizedClientWorkspaceCommand` sınıfı
  `INTAKE_REVIEW` → `decideClientIntakeReviewCommand`: VIEWER reddedilir, **rol tek başına yetmez**,
  `isIntakeReviewAuthorized` true olmalı. O da (a) aktörün tenant'ta aktif olmasını, (b) **avukat ya
  da personel profilinden TAM BİRİNE** sahip olmasını (`assertActiveTenantActor` XOR kuralı),
  (c) `client.intake.review` izninin GLOBAL + ALLOW ve süre içinde olmasını ister. DENY varsa ret.
- **Aktarım (promote-address / promote-soft / promote):** `assertCanManagePromotion` →
  `isApproverEligible` (PARTNER veya yetkilendirilmiş avukat). **İnceleme izni bu kapıyı AÇMAZ.**
  Ret kanonik yazmadan önce gelir ve **audit üretmez**.

---

## 5. CANLI YAZMA ENVANTERİ — yalnız sentetik tenant `cl-acc-<runId>`

### 5.1 INSERT — gönderim kapsamı KAPALI: 19 satır

| Adım | Tablo | Adet | İçerik |
|---|---|---|---|
| Kurulum (tek transaction, 18 satır) | `Tenant` | 1 | `cl-acc-<runId>` · lifecycle ACTIVE |
| | `User` | 3 | `reviewer-` / `elevated-` / `plain-<runId>@cl-acceptance.invalid` (RFC 2606) |
| | `StaffMember` | 2 | reviewer + plain (inceleme kapısının profil koşulu) |
| | `Lawyer` | 1 | PARTNER, `userId`=elevated |
| | `Client` | 1 | aktif, e-posta `client-<runId>@cl-acceptance.invalid` |
| | `Case` | 1 | ACTIVE · `CL-I11-<runId>` · GENERAL_EXECUTION |
| | `CaseLawyer` | 1 | sorumlu avukat |
| | `CaseClient` | 1 | ALACAKLI (intake bağlantısı sınırının aradığı bağ) |
| | `Debtor` + `CaseDebtor` | 1 + 1 | sentetik borçlu |
| | `ClientIntakeLink` | 1 | yalnız `tokenHash`; **ham token DB'ye yazılmaz** |
| | `ClientIntakeSubmission` | 1 | CLIENT_SUBMITTED |
| | `ClientIntakeField` | 2 | ADDRESS + CONTACT · PENDING · `promotedAt` null |
| | `PermissionGrant` | 1 | reviewer → `client.intake.review` · GLOBAL · ALLOW |
| R-1 (claim) | `AuditLog` | 1 | `CLIENT_INTAKE_REVIEW_COMMAND` |

### 5.2 INSERT — gönderim kapsamı AÇIK: 28 satır (19 + 9)

A-5 ve A-6 her biri: `ClientInfoRequest` 1 · `ClientNotification` 1 · `AddressAuditLog` 1 ·
`AuditLog` 1 (WORKSPACE komut audit'i). A-6 ayrıca `ClientIntakeLink` 1. Toplam ek: 9 satır.
Provada ölçülen fark birebir: `AddressAuditLog 2 · AuditLog 3 · ClientInfoRequest 2 ·
ClientNotification 2 · ClientIntakeLink 2` (+ kurulumun 18 satırı).

### 5.3 UPDATE

| Tablo | Satır | Alan | Adım |
|---|---|---|---|
| `ClientIntakeSubmission` | 1 | `status` → IN_REVIEW · `claimedById` · `claimedAt` | R-1 |
| `User` | 3 | `isActive=false` + `tokenVersion++` | kapanış (`cl-09`) |
| `Case` | 1 | ACTIVE → **CLOSED** | kapanış (cron maruziyeti) |

**Yazmayan adımlar:** login'ler · R-3 / R-2 / R-2b / A-0i retleri (yetki kapısı execute ve audit'ten
önce) · promote retleri (kanonik yazma ve audit yok). **Dosya yazımı 0. DELETE yoktur.** Önceki
alanlar (`cl-acc-afce215b`, `cl-acc-2ed1d6d0`, `cl-acc-d19ce2c7`, `cl-acc-c9b07bcb`) açılmaz.

### 5.4 Yetki kapısı bozuksa en kötü durum — dur kuralıyla sınırlı

| İlk başarılı yetkisiz deneme | Oluşacak yazma | Sonrası |
|---|---|---|
| R-3 (izinsiz claim) | başvuru IN_REVIEW + `claimedById=plain` + 1 audit | R-2/R-2b/A-0i gönderilmez |
| R-2 (promote-address) | `DebtorAddress` 1 + alanda `promotedRefId/At/ById` + 1 audit + başvuru durumu PARTIALLY_PROMOTED | R-2b/A-0i gönderilmez |
| R-2b (promote-soft) | `ClientIntelStatement` 1 + alan güncellemesi + 1 audit | A-0i gönderilmez |
| A-0i (anonim talep) | kimlik yoksa 401'den önce yazma yok; guard açık kalırsa `ClientInfoRequest`+`ClientNotification`+`AddressAuditLog` ve **bir e-posta gönderimi** | son yetkisiz deneme |

En fazla **bir** yetkisiz yazma olur; sonuç FAIL'dir; oluşan satır **kanıt olarak kalır, otomatik
silinmez**.

### 5.5 Kapanıştan sonra kalan durum

`cl-acc-<runId>`: **kullanıcı erişimleri kapalı; tenant ACTIVE, Case CLOSED, başvuru IN_REVIEW,
kanıt korunuyor.** Alan yeniden açılmaz.

---

## 6. GÖNDERİM GERÇEĞİ — A-5/A-6 canlıda ne demek?

| Ölçüm | Değer |
|---|---|
| Canlı sağlayıcı (`.env`) | `EMAIL_PROVIDER=smtp` · `SMTP_HOST=srvc182.trwww.com` · `SMTP_PORT=465` · `EMAIL_FROM=bilgi@tellihukuk.com` |
| Kod yolu | `EmailProviderService.send` → `sendViaSmtp` → nodemailer ile **gerçek SMTP bağlantısı** |
| İzinli-alıcı sınırı | Bu yolda **YOK** (kaynak tarandı) |
| Alıcı | sentetik müvekkilin `@cl-acceptance.invalid` adresi — **gerçek bir kişi değil**, teslim edilemez |
| Sonuç | Canlı A-5/A-6 = ofisin gerçek posta sunucusuna **bir SMTP gönderimi**; teslim edilemeyen adres nedeniyle `bilgi@tellihukuk.com` kutusuna **geri dönüş (bounce)** gelebilir |
| Kuru çalıştırma / önizleme | Üründe **yok**; kayıt yalnız gönderim başarılıysa oluşur |
| A-6'nın "sağlayıcı metninde" ayağı | Canlıda **gözlenemez** (SMTP içeriği görülemez). Yalnız gözlenebilir sağlayıcılı provada ölçülür |

**Bu yüzden gönderim kapsamı varsayılan olarak KAPALIDIR** ve yalnız owner'ın ayrı onayıyla açılır
(`CL_I11_SEND_APPROVED` = GO ref'i; sağlayıcı `mock` değilse ayrıca `$SmtpAck='EVET'`). Kapalı
koşumda A-5/A-6 "KAPSAM DIŞI" yazılır, koşum `KISMI` kapsamla PASS verir ve **İ11 kapanmaz**.

---

## 7. DOĞRULAMA — oturuma özel disposable DB + yerel SMTP yakalayıcı (2026-09-12)

### 7.1 Ortam

| Öğe | Değer |
|---|---|
| DB | oturuma özel konteyner `hy-i10-894280b1-db` · `127.0.0.1:5442` · `hukuk_i10_894280b1_test` · 210 tablo |
| API | `HY_W4_RELEASE22` dist `main.js` sha256 `28D84796…E73F5` · `:8101` · PID 39736 · komut satırı dist ile eşleşti |
| Sağlayıcı | **yerel SMTP yakalayıcı** `127.0.0.1:2525` (repo dışı araç): gelen iletiyi kaydeder, **dışarı hiçbir şey göndermez**. Başlatıcı yalnız `127.0.0.1` sink'e izin verir; varsayılan `mock` |
| Bağlantılar | API'nin uzak uçları yalnız oturum DB'si ve sink · canlı 5432/8080 **yok** |
| Canlı | `:8080` PID 46332 · `:3002` PID 47004 — **değişmedi**; canlı DB'ye dokunulmadı |

### 7.2 Senaryolar — **5/5 DOĞRULANDI** (nihai betik hash'leriyle; koşum boyunca hash değişmedi)

| Senaryo | runId | Ne yapıldı | Sonuç |
|---|---|---|---|
| **S** | `9c2dda86` | `I11_ABORT_AFTER=user` | exit 1 · tenant yok · 210 tabloda fark **0** (ROLLBACK) |
| **G** | `d2f4adec` | canlı mod: başka işin ref'i · İ11 ref'i · uyuşmaz gönderim ref'i | `i11-run` ve `i11-01` başka ref'i **reddetti** (G-0'dan önce) · İ11 ref'i kapıyı geçti, G-0 ulaşılamaz hedefi reddetti · gönderim ref'i uyuşmazsa **ret** · fark 0 |
| **N1** | `0df7e0bb` | gönderim kapsamı KAPALI | **PASS · KISMI** · P-0r/e/p/x · R-3 · R-1 · R-2 · R-2b · A-0i **PASS** · A-5/A-6 KAPSAM DIŞI · sink'e ileti **0** · talep kaydı **0** · fark = 19 satır |
| **N2** | `e790a3bc` | gönderim kapsamı AÇIK + sink | **PASS · TAM** (11 ölçüt) · A-5 201, kalıcı gövde temiz · A-6 201, yeni bağlantı · fark = 28 satır |
| **F** | `4be4aace` | vekil ilk claim'e sahte 200 | R-3 **FAIL** · R-2/R-2b/A-0i **ÇAĞRILMADI** · vekil kaydı: promote 0, bilgi talebi 0 · sonuç FAIL |

### 7.3 A-5/A-6'nın kanıtı (N2)

- **A-5:** 201 · `ClientInfoRequest` +1 · alıcı `.invalid` · **kalıcı `emailBody` URL taşımıyor** ·
  `ClientNotification` +1 · `AddressAuditLog` +1.
- **A-6:** 201 · yeni `ClientIntakeLink` (+1) · kalıcı gövde yine temiz · `tokenHash` 64-hex.
- **Sağlayıcıya giden metin (yakalayıcı kaydı):** A-5 iletisinde intake token'ı **yok**; A-6
  iletisinde **var** ve o token'ın `sha256`'sı DB'deki `tokenHash` ile **eşit** → ham token yalnız
  taşıma metninde, DB'de yalnız hash'i, kalıcı gövdede hiçbiri.
- Her iki iletinin alıcısı `@cl-acceptance.invalid`.

### 7.4 Bu doğrulamanın kanıtlamadığı / prova sırasında düzeltilenler

- Yakalayıcı **gerçek sağlayıcı değildir**; canlıda sağlayıcı davranışı (kabul/ret/gecikme) farklıdır.
  A-9/A-10 zaten İ12'nindir.
- Prova sırasında düzeltilen **düzenek** hataları (ürün kusuru değil): inceleme aktörüne profil
  eklenmesi (kapının XOR koşulu), `promote-address` gövdesinin geçerli hâle getirilmesi,
  `client-info-request`'te zorunlu `emailTo`, `CaseClient` bağının eklenmesi. Her biri ölçümün
  **yanlış kapıdan** gelmesini engellemek içindir.

### 7.5 BULGULAR (kabul ölçütü değil; kayda geçti)

- **B-I11-1 — `PUBLIC_INTAKE_BASE_URL` canlıda TANIMSIZ.** `buildUrl` = `${base}/intake/<token>`;
  base boş olduğu için üretilen bağlantı **göreli** olur (`/intake/<token>`). Canlıda intake bağlantısı
  gönderilirse müvekkil **tıklanabilir adres almaz**. Ölçüldü: `.env`'de 0 satır, makine ve kullanıcı
  ortamında tanımsız. A-6 ölçütü bundan etkilenmez (token yine yalnız taşıma metnindedir).
- **B-I11-2 — promote reddi stabil kod taşımıyor.** `assertCanManagePromotion` yalnız mesaj döndürür
  (`reasonCode`/`code` yok). İnceleme reddinde stabil kod vardır (`CLIENT_MUTATION_DENIED_INTAKE_REVIEW`).
  İ11 ölçütü 403 + kanonik yazma 0 olduğundan bloke etmez.

---

## 8. Canlı koşum öncesi kapılar — GO anında, ilk yazmadan ÖNCE (§9'daki blokta)

| Kapı | Ölçüt |
|---|---|
| K-GO | ref `OWNER-GO-CLIENT-I11-…`; gönderim kapsamı verilmişse ref ile **aynı** olmalı |
| K-WT | temiz `origin/main` worktree; **tam SHA kaydedilir** ve `origin/main` ile eşit olmalı |
| K-ARC | 8 araç + 10 ürün dosyası = **18 hash**, uyuşmazlık 0 (sayım 18 değilse KÖR) |
| K-API | `:8080` tek dinleyici süreç + komut satırı RELEASE22 dist |
| K-BLD | release HEAD `13740670…` · BUILD_ID `xJZ1G1TsbOnHoWUzMD8CQ` |
| K-SMTP | canlı sağlayıcı yazdırılır; **gönderim kapsamı açık ve sağlayıcı `mock` değilse ayrı owner onayı** (`$SmtpAck='EVET'`) yoksa DURUR |
| K-REF | ref kullanılmamış: `origin/main` + açık PR dalları + koşum kayıtları. **Tüketim** = ref'in `runId` ile aynı dosyada geçmesi; yalnız anma engellemez ama raporlanır (0 dosya tarandıysa KÖR) |
| K-PAR | kabul/governance betiği çalıştıran başka süreç 0 (blok kendini imzasıyla dışlar) |

## 9. Kesin komut — TEK SCRIPTBLOCK

`$ErrorActionPreference='Stop'` + her yerli komuttan sonra `$LASTEXITCODE` denetimi → **ilk hatada
blok durur, `node` çağrısına ULAŞILMAZ**. Blok dosyası (paket dışı) sha256
`84C2AC5759A656D0B6B68A7F936A970A2B94409C26D680D73DC82D7700214367`; PowerShell 7 ve 5.1'de
ayrıştırma hatası 0; 8 kapı · 18 hash · 24 durdurucu · tek `node` çağrısı. Aşağıdaki gömülü kopya,
hash'i verilen dosyayla **bayt bayt aynıdır** (doğrulandı).

```powershell
& {
  # I11-KAPI-BLOK — CLIENT I11 canli kabul: KAPILAR + TEK KOSUM, tek blok.
  # Herhangi bir hata blogu durdurur; sonraki komut CALISMAZ.
  $ErrorActionPreference = 'Stop'
  $selfMark = 'I11-KAPI-BLOK'   # bu blogu calistiran surec kendini "paralel kabul" sanmasin

  $GoRef   = '<OWNER-GO-CLIENT-I11-YYYYMMDD-Rnn>'
  $SendGo  = ''    # A-5/A-6 gonderim kapsami: owner ACIKCA onayladiysa $GoRef ile AYNI deger; aksi halde BOS
  $SmtpAck = ''    # gonderim kapsami aciksa ve canli saglayici 'smtp' ise owner onayi: 'EVET'
  $CANON   = 'C:\Development\HUKUK_YAZILIMI\project'
  $WT      = 'C:\Development\HY_WT\CL_I11LIVE'
  $REL     = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE22'
  $S       = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11live'
  $ENVF    = Join-Path $REL 'project\apps\api\.env'

  # ---- K-GO: ref bicimi (buyuk/kucuk harfe DUYARLI) ----
  if ($GoRef -cnotmatch '^OWNER-GO-CLIENT-I11-[0-9]{8}-R[0-9]{2}$') { throw "K-GO: ref bicimi gecersiz ('$GoRef')" }
  if ($SendGo -and $SendGo -cne $GoRef) { throw 'K-GO: gonderim kapsami ref i GO ref i ile AYNI olmali' }

  # ---- K-WT: temiz calisma kopyasi (origin/main) ----
  git -C $CANON fetch origin main
  if ($LASTEXITCODE -ne 0) { throw 'K-WT: git fetch basarisiz' }
  if (Test-Path -LiteralPath $WT) { throw "K-WT: '$WT' zaten var - once kaldir (git worktree remove)" }
  git -C $CANON worktree add --detach $WT origin/main
  if ($LASTEXITCODE -ne 0) { throw 'K-WT: git worktree add basarisiz' }
  $wtHead = (git -C $WT rev-parse HEAD)
  if ($LASTEXITCODE -ne 0) { throw 'K-WT: worktree HEAD okunamadi' }
  $originMain = (git -C $CANON rev-parse origin/main)
  if ($LASTEXITCODE -ne 0) { throw 'K-WT: origin/main okunamadi' }
  if ($wtHead -ne $originMain) { throw "K-WT: hazirlik checkout SHA ($wtHead) origin/main ($originMain) ile ayni degil" }
  Write-Output "K-WT: hazirlik checkout tam SHA = $wtHead (origin/main ile ayni)"
  $G = Join-Path $WT 'project\docs\governance'
  $D = Join-Path $REL 'project\apps\api\dist\apps\api\src'

  # ---- K-ARC: 8 arac + 10 urun dosyasi tam SHA-256 ----
  $want = [ordered]@{
    'client-live-acceptance-i11-r01\scripts\i11-run.js'            = 'B5EA80880549B8C9FB90604E326ECAD643E1833D7F7ECE0A54D41581C7757720'
    'client-live-acceptance-i11-r01\scripts\i11-01-setup.js'       = 'EA2765BD8237E0B2227237C0FFBCABF9B2BB2250C974D541ECC620203B1ED4A7'
    'client-live-acceptance-i11-r01\scripts\i11-02-intake.js'      = '7D8D492BC6CE4A2E2CD3CB77EEACAC01594D1DDD9D17F9F767D0625DDB251789'
    'client-live-acceptance-i1b-r01\scripts\cl-lib.js'             = '788F4EB87846ED620FC7D109D70077B0B9B8936D27CA9B4D1494C32E06C18EDB'
    'client-live-acceptance-i1b-r01\scripts\cl-09-close-access.js' = '012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4'
    'client-live-acceptance-i9-r01\scripts\i9-03-isolation.js'     = '0EA99FD0F37B6625A0DE92EA6B361E12C592A9EB84CD3EE85823F43F0F109B6A'
    'client-acceptance-harness-r01\scripts\ah-lib.js'              = 'DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7'
    'f04-live-acceptance-r01\scripts\f04-lib.js'                   = '1D35429566BC0A0469F44ED028FEF829AF204A90C9A5565C6882EF99C6305CA8'
  }
  $dist = [ordered]@{
    'modules\address-discovery\address-discovery.controller.js'                     = '111807F3463CE07B4147F9FE08AAA23177B9A364BB879AE2B72A4B42B3A8BB6D'
    'modules\address-discovery\client-info-request.service.js'                      = '6F7BA8DED41C84C4774E5B339CA2820DB7D8A27EAAE46DBFE339E13E5E3A2FA4'
    'modules\client-intake-review\client-intake-review.controller.js'               = 'ED8455F9A8F106EB6959EDE3E0E1A629170802795B1A2525D6670DFD150B26E9'
    'modules\client-intake-review\client-intake-review-authorization.service.js'    = '97DF59B722102EFC58981FFB5D64FB8D837E07F63EC3F6AAE89E2196CD931F37'
    'modules\client-intake-promotion\client-intake-promotion.controller.js'         = '2DE45ABB813C9937D7A44637B617D508B870474E7226A7BD32E979F82C636266'
    'modules\client-intake-promotion\client-intake-promotion.service.js'            = '8AE1BC03E3F2D845E45725C76C944D594D5B847082AE2ED50A8991B2C65DBE0A'
    'modules\client-intake-link\client-intake-link.service.js'                      = '32223CA85292A4FE9784F5CACF9E7A07BE67A00B5F9E905FDE5D79C244422D40'
    'modules\notification\email-provider.service.js'                                = '231B77F67514A2D039E760A8150250E64C26DEB6B2145A8354AA89D11C69233A'
    'modules\client\client-workspace-command-authority.js'                          = 'D8373C726264631A214056135EBBE36BAA12BA3C91ECCD5F8E589E3F0940A9F6'
    'modules\client\client-mutation-policy.js'                                      = '075FBE3DE30A45A624A04B9812F6F1E59825D032E80FE234CFC50D4865FFC81A'
  }
  $bad = 0; $checked = 0
  foreach ($k in $want.Keys) { $checked++; if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $G $k)).Hash -ne $want[$k]) { $bad++; Write-Output "UYUSMAZ  $k" } }
  foreach ($k in $dist.Keys) { $checked++; if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $D $k)).Hash -ne $dist[$k]) { $bad++; Write-Output "UYUSMAZ  dist\$k" } }
  Write-Output "K-ARC: denetlenen dosya $checked (8 arac + 10 urun) - uyusmazlik $bad"
  if ($checked -ne 18) { throw "K-ARC: denetlenen dosya 18 degil ($checked) - KOR" }
  if ($bad -ne 0) { throw "K-ARC: hash uyusmazligi $bad" }

  # ---- K-API: :8080 TEK dinleyici surec + komut satiri RELEASE22 dist ----
  $pids = @(Get-NetTCPConnection -LocalPort 8080 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($pids.Count -ne 1) { throw "K-API: :8080 dinleyici surec sayisi $($pids.Count) (1 olmali)" }
  $apiPid = [int]$pids[0]
  $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$apiPid").CommandLine
  if ($cl -notlike '*HY_W4_RELEASE22\project\apps\api\dist\apps\api\src\main.js*') { throw 'K-API: :8080 komut satiri RELEASE22 dist DEGIL' }
  Write-Output "K-API: :8080 tek dinleyici PID $apiPid - komut satiri RELEASE22 dist"

  # ---- K-BLD: release HEAD + BUILD_ID ----
  $gitdir = ((Get-Content -LiteralPath (Join-Path $REL '.git') -TotalCount 1) -replace '^gitdir:\s*','').Trim()
  $head = (Get-Content -LiteralPath (Join-Path $gitdir 'HEAD') -TotalCount 1).Trim()
  if ($head -ne '137406701248858221d12be94a941f8837a2a245') { throw "K-BLD: release HEAD beklenen degil ($head)" }
  $buildId = (Get-Content -LiteralPath (Join-Path $REL 'project\apps\web\.next\BUILD_ID') -TotalCount 1).Trim()
  if ($buildId -ne 'xJZ1G1TsbOnHoWUzMD8CQ') { throw "K-BLD: BUILD_ID beklenen degil ($buildId)" }
  Write-Output "K-BLD: HEAD 13740670... - BUILD_ID $buildId"

  # ---- K-SMTP: canli saglayici GERCEK mi? A-5/A-6 gonderim kapsami aciksa AYRI onay sart ----
  $provLine = @(Select-String -LiteralPath $ENVF -Pattern '^\s*EMAIL_PROVIDER\s*=')
  $provider = if ($provLine.Count -eq 1) { (($provLine[0].Line -replace '^\s*EMAIL_PROVIDER\s*=','').Trim()).Trim('"') } else { '(tanimsiz)' }
  $smtpHost = @(Select-String -LiteralPath $ENVF -Pattern '^\s*SMTP_HOST\s*=')
  $smtpHostVal = if ($smtpHost.Count -eq 1) { (($smtpHost[0].Line -replace '^\s*SMTP_HOST\s*=','').Trim()).Trim('"') } else { '(tanimsiz)' }
  Write-Output "K-SMTP: canli saglayici='$provider' host='$smtpHostVal' - gonderim kapsami=$(if ($SendGo) {'ACIK'} else {'KAPALI'})"
  if ($SendGo -and $provider -ne 'mock' -and $SmtpAck -cne 'EVET') {
    throw "K-SMTP: gonderim kapsami ACIK ve canli saglayici '$provider' (GERCEK). Owner'in ayri yazili onayi olmadan calistirilmaz (`$SmtpAck='EVET')."
  }

  # ---- K-REF: ref KULLANILMAMIS - repo + KOSUM KAYITLARI (tuketim isareti: runId ile ayni dosyada) ----
  $used = 0; $mentions = 0
  git -C $CANON grep -F -I -q -e $GoRef origin/main
  if ($LASTEXITCODE -eq 0) { $used++ } elseif ($LASTEXITCODE -ne 1) { throw 'K-REF: origin/main aramasi calismadi' }
  $openBranches = @(gh pr list --state open --json headRefName --jq '.[].headRefName')
  if ($LASTEXITCODE -ne 0) { throw 'K-REF: acik PR listesi alinamadi' }
  foreach ($b in $openBranches) {
    git -C $CANON fetch origin $b
    if ($LASTEXITCODE -ne 0) { throw "K-REF: '$b' dali alinamadi" }
    git -C $CANON grep -F -I -q -e $GoRef FETCH_HEAD
    if ($LASTEXITCODE -eq 0) { $used++ } elseif ($LASTEXITCODE -ne 1) { throw "K-REF: '$b' dalinda arama calismadi" }
  }
  $recRoots = @(
    $S,
    'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i9live',
    'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i10live',
    'C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911'
  )
  $recScanned = 0
  foreach ($d in $recRoots) {
    if (Test-Path -LiteralPath $d) {
      $files = @(Get-ChildItem -LiteralPath $d -Recurse -File -Force)
      $recScanned += $files.Count
      foreach ($f in $files) {
        if (Select-String -LiteralPath $f.FullName -SimpleMatch -Pattern $GoRef -Quiet) {
          # TUKETIM isareti: ayni dosyada runId de geciyorsa kosum kaydidir; aksi halde yalniz ANMA.
          if (Select-String -LiteralPath $f.FullName -Pattern 'runId' -Quiet) {
            $used++; Write-Output "K-REF: ref KOSUM KAYDINDA (tuketilmis): $($f.FullName)"
          } else {
            $mentions++; Write-Output "K-REF: ref yalnizca ANILMIS (kosum kaydi degil): $($f.FullName)"
          }
        }
      }
    }
  }
  Write-Output "K-REF: taranan kosum kaydi dosyasi $recScanned - acik PR dali $($openBranches.Count) - tuketim $used - anma $mentions"
  if ($recScanned -eq 0) { throw 'K-REF: kosum kaydi taramasi KOR (0 dosya) - ref kullanilmamisligi KANITLANAMADI' }
  if ($used -ne 0) { throw "K-REF: ref KULLANILMIS ($used isabet) - tuketilmis ref yeniden kullanilamaz" }

  # ---- K-PAR: paralel kabul kosumu yok (kendi blogu haric) ----
  $rx = 'ak-live|i11-run|i10-run|i9-run|i11-0|i10-0|i9-0|cl-09|ro-check|drive2?\.js|fault-proxy|start-api-r22s|smtp-sink'
  $busy = @(Get-CimInstance Win32_Process | Where-Object { $_.CommandLine -and ($_.CommandLine -match $rx) -and ($_.ProcessId -ne $PID) -and ($_.CommandLine -notlike "*$selfMark*") })
  if ($busy.Count -ne 0) { foreach ($p in $busy) { Write-Output "K-PAR: PID $($p.ProcessId) $($p.Name)" }; throw "K-PAR: kabul/governance betigi calistiran surec $($busy.Count)" }
  Write-Output 'K-PAR: kabul kosumu calistiran baska surec YOK'

  # ---- ORTAM + runId REZERVASYONU (ILK YAZMADAN ONCE) ----
  New-Item -ItemType Directory -Force -Path $S | Out-Null
  $env:CL_ENVIRONMENT  = 'live'
  $env:CL_OWNER_GO_REF = $GoRef
  if ($SendGo) { $env:CL_I11_SEND_APPROVED = $SendGo } else { Remove-Item Env:\CL_I11_SEND_APPROVED -ErrorAction SilentlyContinue }
  $env:CL_DATABASE_URL = ((Get-Content -LiteralPath $ENVF | Where-Object { $_ -match '^DATABASE_URL=' } | Select-Object -First 1) -replace '^DATABASE_URL=','').Trim('"')
  if (-not $env:CL_DATABASE_URL) { throw 'K-ENV: DATABASE_URL okunamadi' }
  $env:CL_API_BASE_URL = 'http://127.0.0.1:8080/api'
  $env:CL_PRISMA_ROOT  = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE22/project/apps/api/node_modules/@prisma/client'
  $env:CL_BCRYPT_PATH  = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE22/project/apps/api/node_modules/bcrypt'
  Remove-Item Env:\CL_SESSION_DB -ErrorAction SilentlyContinue
  $env:CL_RUN_ID       = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
  Add-Content -LiteralPath (Join-Path $S 'RUNID-RESERVATION.txt') -Value "$(Get-Date -Format o) runId=$($env:CL_RUN_ID) go=$GoRef gonderim=$(if ($SendGo) {'ACIK'} else {'KAPALI'})"
  $env:CL_STATE_FILE   = Join-Path $S ("i11-state-" + $env:CL_RUN_ID + ".json")
  Write-Output "HAZIR: runId=$($env:CL_RUN_ID) - durum dosyasi rezerve edildi (parola ve intake ham token BASILMAZ)"

  # ---- TEK KOSUM ----
  node (Join-Path $WT 'project\docs\governance\client-live-acceptance-i11-r01\scripts\i11-run.js')
  $code = $LASTEXITCODE
  Write-Output "i11-run cikis kodu: $code"
  if ($code -ne 0) { throw "KOSUM BASARISIZ (exit $code) - kapanis makbuzunu oku; gerekirse yalniz runId ile kurtarma (paket §11)" }
  Write-Output "SONUC: BASARILI - runId=$($env:CL_RUN_ID) - kapanis ve izolasyon makbuzda"
}
```

## 10. Owner kararına sunulan kapsam

Bu belge GO değildir. Canlı koşum için owner'ın yazılı kararı şunları kapsamalıdır:

1. **GO ref:** `OWNER-GO-CLIENT-I11-<YYYYMMDD>-R<nn>`. Koşucu başka işin ref'ini kabul etmez.
   Ref, test/taslak dosyalarında geçmeyen bir değer olmalıdır (K-REF anmayı raporlar, tüketimi durdurur).
2. **Yazma:** yalnız `cl-acc-<runId>` tenant'ında — gönderim kapalıysa **19 satır**, açıksa **28 satır**
   (§5.1–§5.2) ve kapanışta 3 kullanıcı erişim iptali + `Case` CLOSED. Dur kuralıyla sınırlı en kötü
   durum (§5.4) da bu kapsamdadır.
3. **Gönderim kapsamı — asıl karar:** A-5/A-6 canlıda ölçülsün mü?
   - **(a) KAPALI (varsayılan):** gönderim yok; canlıda yalnız review→promote kapısı ve A-0i ölçülür.
     **İ11 kapanmaz** (3 gözlemden 1'i canlı). Kalan iki gözlem provada ölçülmüş olarak kayıtta durur.
   - **(b) AÇIK:** ofisin gerçek posta sunucusuna **iki SMTP gönderimi** yapılır; alıcı sentetik
     `.invalid` adrestir (gerçek kişi değil), `bilgi@tellihukuk.com` kutusuna bounce gelebilir.
     İ11 üç gözlemle kapanabilir.
   - **(c) ERTELE:** sağlayıcıyı geçici olarak test sağlayıcısına almak `.env` değişikliği + restart
     ister; bu, mevcut kapsam dışıdır ve **ayrı bir GO** konusudur.
4. **Sınırlar:** gerçek kişiye gönderim yok · başka tenant'a yazma yok · restart, yayın, migration ve
   flag değişikliği yok · belirsiz sonuçta otomatik tekrar/silme yok.
5. **Bilgi:** B-I11-1 nedeniyle canlıda üretilecek intake bağlantısı göreli olur (tıklanamaz).

## 11. Hata / yarıda kesilme kurtarması ve erişim kapatma

| Durum | Davranış |
|---|---|
| Yanlış ref · uyuşmaz gönderim ref'i · kütüphane yolu yok · `$SmtpAck` yok | ön kontrol → **hiçbir yazma yapılmaz** (§7 G) |
| Çakışma / hedef uyuşmazlığı | G-0/G-1/G-3 → hiçbir yazma yapılmaz |
| Kurulum yarıda kesilirse | tek transaction → ROLLBACK, yetim satır 0 (§7 S) |
| Yetkisiz deneme beklenen reddi vermezse | sonraki yetkisiz deneme gönderilmez; kapanış **yine çalışır**; sonuç BAŞARISIZ (§7 F) |
| Gönderim başarısız/belirsiz | ürün 503 döner ve **kayıt oluşturmaz**; otomatik tekrar YOK (İ12'nin konusu) |
| İzolasyon farkı / ölçülemezlik | sonuç BAŞARISIZ; otomatik tekrar yok |
| Kapanış doğrulanamazsa | BAŞARILI verilmez |
| **Süreç zorla sonlanırsa** | aşağıdaki komut, **yalnız runId** ile |

```powershell
# §9'daki CL_ENVIRONMENT / CL_OWNER_GO_REF / CL_DATABASE_URL / CL_PRISMA_ROOT tanımlıyken:
$env:CL_RUN_ID = '<runId>'
node 'C:\Development\HY_WT\CL_I11LIVE\project\docs\governance\client-live-acceptance-i1b-r01\scripts\cl-09-close-access.js'
# İzolasyonu elle yeniden ölçmek (salt-okuma; durum dosyası gerekir):
$env:CL_STATE_FILE = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11live\i11-state-<runId>.json'
node 'C:\Development\HY_WT\CL_I11LIVE\project\docs\governance\client-live-acceptance-i9-r01\scripts\i9-03-isolation.js'
```

`cl-09` üç `User` satırına `isActive=false` + `tokenVersion++` yazar ve `Case`'i CLOSED yapar; login
401 olur. Tekrarı güvenlidir (`alreadyClosed=true · exit 0`). Başvuru, alanlar, bağlantı ve audit
satırlarına dokunmaz.

## 12. Kapanış ölçütü ve ŞU ANKİ DURUM

| Gözlem | Durum | Dayanak |
|---|---|---|
| A-5 kalıcı gövde ham token/URL taşımaz | **HAZIR — canlıda ölçülmedi** (gönderim kararı bekler) | §7.3 · N2 |
| A-6 bağlantı yalnız sağlayıcı metninde | **HAZIR — canlıda ölçülmedi** (gönderim kararı bekler; "sağlayıcı metni" ayağı canlıda gözlenemez) | §7.3 · N2 |
| review→promote kapısı | **HAZIR — canlıda ölçülmedi** | §7.2 · N1/N2 (R-1 + R-2/R-2b) |

İ11, canlı koşumda üç gözlem PASS olur ve kapanış doğrulanırsa kapanır; sayaç 10/17 → 11/17 olur.
Şu an **10/17**; hizmet kabulü **0/8 tam**.

## 13. Kapsam DIŞI

Deploy · migration · servis restartı · `.env`/flag değişikliği (sağlayıcı değiştirme dahil) · gerçek
kişiye gönderim · başka tenant'a yazma · silme · gerçek tenant'a çağrı · önceki alanlarda kullanıcı
erişiminin yeniden açılması · **ürün kodu değişikliği** · **A-9/A-10 ve İ12'nin diğer gözlemleri** ·
İ13…İ15 · İ16/İ17 · OFFICE kalemleri.

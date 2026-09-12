# CLIENT İ11 — H5 INTAKE KABUL PAKETİ (R01 — düzenek + yerel doğrulama; canlı koşum YOK)

**Durum: CANLI KARAR BEKLİYOR — canlı koşum YAPILMADI.** Bu belge owner onayı ya da kapsam kararı
değildir. Canlı koşum ayrı, yazılı bir owner GO'su (`OWNER-GO-CLIENT-I11-<YYYYMMDD>-R<nn>`) ister (§10).

- Kapsam ve öncüller R02'den satır kaynaklı çıkarıldı (§1–§2). **A-9/A-10 İ12'nindir**; bu pakette
  üretilmez ve sayılmaz. İ10 ve korunmuş sentetik alanlar açılmadı.
- **A-5/A-6 için canlı kanıt yöntemi (§6):** R02 bu iki gözlemi **test sağlayıcısı** ile tanımlar.
  Canlı süreçte sağlayıcı açılışta sabitlenir ve kayıt yalnız **gerçek, başarılı bir gönderimden**
  sonra yazılır → **canlı süreçte A-5/A-6 ölçülemez.** Gerçek SMTP + `.invalid` **eşdeğer değildir**
  (§6.2). Uygulanabilir yöntem ve gereken en küçük değişiklik seçenekleri etkileriyle §6.4'te.
- **Kapanış artık anonim intake bağlantılarını da kapatır (§5.6, §11).** Ürün kaynağında anonim yol
  yalnız `status/expiresAt/useCount`'a bakar — Case CLOSED ve kullanıcı iptali onu **kapatmaz**.
  Yeni adım `i11-03-close-links.js` koşumun **bütün** bağlantılarını (kurulum · A-6 · gönderim
  başarısızlığında kalan yetim) iptal eder; **yalnız `runId`** ile çalışır, durum dosyası gerektirmez.
- Yerel doğrulama oturuma özel disposable DB'de, R27 derlemesiyle, yerel SMTP yakalayıcı ve oturuma
  özel Redis ile yapıldı: **7/7 senaryo DOĞRULANDI** (§7), sapma 0.

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
| A-5 | Bilgi talebi gönderimi (**test sağlayıcısı**) | 201; DB'deki `emailBody` ham token/URL TAŞIMAZ |
| A-6 | Aynı talep `attachIntakeLink` ile | sağlayıcıya giden metin bağlantı TAŞIR; kalıcı gövde TAŞIMAZ |

Ölçütün kendisi **test sağlayıcısı** der; "gerçek alıcıya gönderim YOK" da R02'nin kapanış şartıdır.
Bu iki cümle §6'daki yöntem kararının dayanağıdır.

**A-9/A-10 bu işin değildir.** R02 satır 208'e göre `A-9` (sağlayıcı reddi → 503, kayıt oluşmaz) ve
`A-10` (timeout → `..._EMAIL_INDETERMINATE`, ikinci çağrı yok) **İ12'nin (H6) yedi gözleminin**
parçasıdır. İ11 düzeneği bu iki gözlemi ÜRETMEZ ve saymaz. Ortak yüzey aynı uçtur
(`POST /address-discovery/client-info-request`); ölçülen özellik farklıdır: İ11 **sızıntı**
(kalıcı gövde ↔ taşıma metni), İ12 **gönderim sonucu** (red/timeout).

"Üç gözlem" = **A-5 · A-6 · review→promote kapısı**.

## 2. Öncüller ve plan konumu — satır kaynaklı

| Kaynak | Hüküm | İ11 için |
|---|---|---|
| R02 §3.3 satır 199 | "Hepsi İ7 + İ3'e bağlıdır." | İ3 **KAPALI** · İ7 **KAPALI** (canlı RELEASE22/R27) |
| R02 §5 satır 287 | `İ9 → İ10 → **İ11** → İ12 → İ13 → İ14 → İ15` | İ8/İ9/İ10 **KAPALI** (İ10: runId `c9b07bcb`, #2638) |
| R02 §3.5 satır 222-223 | her koşum kendi tenant'ını üretir | İ11 kendi tenant'ını üretir (`cl-acc-<runId>`) |

### 2.1 Plan konumunun DÜZELTİLMİŞ hâli (R02 §5 ve §6'ya göre)

Önceki kapanış raporunda kalan işlerin sırası **yanlış** verilmişti. R02'nin kendi satırları:

| Kalem | Doğru konum | Kaynak |
|---|---|---|
| **İ4** (H7 portal kapsam kararı) | **Kesin 17'nin içinde**, owner kararı; zincirin sonunda DEĞİL. **Yalnız İ16'yı açar.** | R02 satır 184 · 294 · 304 |
| **İ5** (F04 kanıt yöntemi kararı) | **Kesin 17'nin içinde**, owner kararı; **İ15'ten ÖNCE gerekir** — İ15 "KABUL-5 + **İ5 kararının uygulanması**"dır | R02 satır 211 · 304 |
| **İ5b** | Zaten **kesin**; İ15'in ön koşulu | R02 satır 265 · 304 |
| **İ16** (H7 portal kabulü) | **KOŞULLU** — yalnız **İ4 = DAHİL** ise kritik yola girer | R02 satır 212 · 305 · 394 |
| **İ5a** | **KOŞULLU** — yalnız **İ5 = (a)** **ve** canlıda kilit tutan senaryo kurulursa | R02 satır 266 · 305 · 395 |
| **İ17** (yedi pasif kimlik) | **KRİTİK YOL DIŞI** — **kesin 17'ye KATILMAZ**, hiçbir kabulün öncülü değildir | R02 satır 280 · 294 · 306 |

**Kesin 17:** İ1a · İ1b · İ2 · İ3 · **İ4** · **İ5** · İ5b · İ6 · İ7 · İ8 · İ9 · İ10 · İ11 · İ12 · İ13 ·
İ14 · İ15 (R02 satır 304). Kapanan 10: İ1a · İ1b · İ2 · İ3 · İ5b · İ6 · İ7 · İ8 · İ9 · İ10.
**Kalan 7:** **İ11 → İ12 → İ13 → İ14 → İ15** (sıralı) **+ İ4 ve İ5** (owner kararları; İ5 İ15'ten önce
gerekir, İ4 İ16'yı açar). İ16/İ5a koşullu (2), İ17 kritik yol dışı (1).

### 2.2 #2552 kimlik checksum — yayın eksiği DEĞİL

Ölçüldü: PR #2552'nin merge commit'i `ad484c498f41883652fa778fc3771b37cb42c4a6`, canlı kaynak
`137406701248858221d12be94a941f8837a2a245`'in **atasıdır** (`git merge-base --is-ancestor` = EVET).
Yani düzeltme **canlıda çalışıyor**; eksik olan yalnız bir **canlı kabul ölçümüdür**, yayın boşluğu
değildir. Önceki raporda "main'de ama canlıda değil" listesine alınması **hatalıydı**; bu kayıt onu
düzeltir. İ11 bu kalemi kapsamaz.

## 3. Ölçüt haritası — her gözlem gerçek uca, aktöre ve yazma etkisine bağlı

Kurulum (§5.1) üç aktör üretir. **reviewer** = USER + `StaffMember` profili + `client.intake.review`
izni (PermissionGrant, GLOBAL, ALLOW), PARTNER bağı YOK. **plain** = USER + `StaffMember`, izin YOK.
**elevated** = USER + PARTNER `Lawyer` bağı. Böylece reviewer↔plain farkı yalnız izin, reviewer↔elevated
farkı yalnız PARTNER bağıdır.

| Sıra | Kalem | Uç | Aktör | Beklenen | Yazma ölçümü |
|---|---|---|---|---|---|
| 1 | P-0r/e/p | `POST /auth/login` | üçü | 201 + token | yok |
| 2 | P-0x | — (DB) | — | reviewer izin 1 / lawyer 0 · elevated PARTNER 1 · plain izin 0 | ölçüm geçerliliği |
| 3 | **R-3** | `POST /client-intake-submissions/:id/claim` | plain | **403 `CLIENT_MUTATION_DENIED_INTAKE_REVIEW`** | başvuru fotoğrafı aynı · audit aynı |
| 4 | **R-1** | aynı uç | reviewer | **201** · başvuru `IN_REVIEW` + `claimedById=reviewer` | audit +1 (`CLIENT_INTAKE_REVIEW_COMMAND`) |
| 5 | **R-2 (KAPI)** | `POST /client-intake-fields/:fieldId/promote-address` (geçerli gövde: `debtorId`+`street`+`city`) | reviewer | **403** | `DebtorAddress` 0 · alan `promotedAt/RefId` null · audit aynı |
| 6 | **R-2b (KAPI)** | `POST /client-intake-fields/:fieldId/promote-soft` | reviewer | **403** | `ClientIntelStatement` 0 · alan aynı · audit aynı |
| 7 | **A-0i** | `POST /address-discovery/client-info-request` | anonim | **401** | talep/bildirim/adres-audit 0 · gönderim YOK |
| 8 | **A-5** | aynı uç (bağlantısız) | elevated | **201** · kalıcı `emailBody` URL/token TAŞIMAZ | `ClientInfoRequest`+`ClientNotification`+`AddressAuditLog` +1, audit +1 |
| 9 | **A-6** | aynı uç `attachIntakeLink:true` | elevated | **201** · yeni `ClientIntakeLink` · kalıcı gövde yine temiz | +1 link · diğerleri A-5 gibi |
| 10 | **L-1** (kapanış) | `GET /api/public/intake/:token` | anonim | iptalden **önce 200**, **sonra 404** | yazma YOK (`useCount` artmaz) |

- **A-5/A-6 yalnız gönderim kapsamı açıkken çalışır** (§6). Kapalıyken "KAPSAM DIŞI" yazılır; sessizce
  düşürülmez, PASS da sayılmaz.
- **Doğru kapı:** R-3'ün 403'ü `reasonCode` ile doğrulanır. R-2/R-2b gövdeleri **geçerlidir**; aksi
  hâlde 400 doğrulama katmanından gelir ve ölçüm yanlış kapıdan gelmiş olur.
- **Dur kuralı:** bir yetkisiz deneme (R-3 · R-2 · R-2b · A-0i) beklenen reddi vermez, istek hatası
  üretir ya da yazma izi bırakırsa sonraki yetkisiz deneme **gönderilmez** (§7, senaryo F).

## 4. Düzenek — dosyalar ve tam kimlikler

Kök: `project/docs/governance/`. Canlı koşum yalnız `i11-run.js` üzerinden yapılır.

| Dosya | sha256 | R01'de |
|---|---|---|
| `client-live-acceptance-i11-r01/scripts/i11-run.js` | `27821B463D2DDA5E1F180A79A677CEA13B2EAD15840D95F8218012A0E2632F4B` | **YENİ** |
| `client-live-acceptance-i11-r01/scripts/i11-01-setup.js` | `1317D727F08C81108D027C41B9B0DF9EF8E6B5C0C99979F76AEF30E3CA427DC4` | **YENİ** |
| `client-live-acceptance-i11-r01/scripts/i11-02-intake.js` | `7D8D492BC6CE4A2E2CD3CB77EEACAC01594D1DDD9D17F9F767D0625DDB251789` | **YENİ** |
| `client-live-acceptance-i11-r01/scripts/i11-03-close-links.js` | `87C16DB3E7A7521605C1E6F16563415949F871042BCF51617283B4A05D549740` | **YENİ** |
| `client-live-acceptance-i1b-r01/scripts/cl-lib.js` | `788F4EB87846ED620FC7D109D70077B0B9B8936D27CA9B4D1494C32E06C18EDB` | GO deseninde `I11` |
| `client-live-acceptance-i1b-r01/scripts/cl-09-close-access.js` | `012739987ED4176A114D6A33F18C76ACF2DB8614F7C954B453E04126A98862C4` | değişmedi |
| `client-live-acceptance-i9-r01/scripts/i9-03-isolation.js` | `0EA99FD0F37B6625A0DE92EA6B361E12C592A9EB84CD3EE85823F43F0F109B6A` | değişmedi (yeniden kullanılır) |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | `DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7` | değişmedi |
| `f04-live-acceptance-r01/scripts/f04-lib.js` | `1D35429566BC0A0469F44ED028FEF829AF204A90C9A5565C6882EF99C6305CA8` | değişmedi |

**Ürün kodu DEĞİŞMEDİ.** `cl-09-close-access.js` de değişmedi — bağlantı kapanışı ayrı bir betiğe
eklendi; böylece İ1b/İ8/İ9/İ10 kayıtlarındaki cl-09 hash'i ve o koşumların kanıtı **bozulmaz**.

### 4.1 Ölçülen ürün ikilisi — İ11 davranışını belirleyen RELEASE22 dist dosyaları (12)

| Dosya | sha256 |
|---|---|
| `modules/address-discovery/address-discovery.controller.js` | `111807F3463CE07B4147F9FE08AAA23177B9A364BB879AE2B72A4B42B3A8BB6D` |
| `modules/address-discovery/client-info-request.service.js` | `6F7BA8DED41C84C4774E5B339CA2820DB7D8A27EAAE46DBFE339E13E5E3A2FA4` |
| `modules/client-intake-review/client-intake-review.controller.js` | `ED8455F9A8F106EB6959EDE3E0E1A629170802795B1A2525D6670DFD150B26E9` |
| `modules/client-intake-review/client-intake-review-authorization.service.js` | `97DF59B722102EFC58981FFB5D64FB8D837E07F63EC3F6AAE89E2196CD931F37` |
| `modules/client-intake-promotion/client-intake-promotion.controller.js` | `2DE45ABB813C9937D7A44637B617D508B870474E7226A7BD32E979F82C636266` |
| `modules/client-intake-promotion/client-intake-promotion.service.js` | `8AE1BC03E3F2D845E45725C76C944D594D5B847082AE2ED50A8991B2C65DBE0A` |
| `modules/client-intake-link/client-intake-link.service.js` | `32223CA85292A4FE9784F5CACF9E7A07BE67A00B5F9E905FDE5D79C244422D40` |
| `modules/client-intake-public/client-intake-public.service.js` | `92D3EA95F77843A7D5ECC86863D8352ACA98D789651C01182EC8B665EEFA29E0` |
| `modules/client-intake-public/public-intake-rate-limit.guard.js` | `1463DB9C296D77C7937A20AE791F04FA119C7E45C6971A558CEB836F9D9E2DD3` |
| `modules/notification/email-provider.service.js` | `231B77F67514A2D039E760A8150250E64C26DEB6B2145A8354AA89D11C69233A` |
| `modules/client/client-workspace-command-authority.js` | `D8373C726264631A214056135EBBE36BAA12BA3C91ECCD5F8E589E3F0940A9F6` |
| `modules/client/client-mutation-policy.js` | `075FBE3DE30A45A624A04B9812F6F1E59825D032E80FE234CFC50D4865FFC81A` |

### 4.2 Kapıların kaynaktan çıkarılmış hâli

- **İnceleme (claim/field-decide/reject):** `runAuthorizedClientWorkspaceCommand` sınıfı
  `INTAKE_REVIEW` → `decideClientIntakeReviewCommand`: VIEWER reddedilir, **rol tek başına yetmez**,
  `isIntakeReviewAuthorized` true olmalı. O da (a) aktörün tenant'ta aktif olmasını, (b) **avukat ya
  da personel profilinden TAM BİRİNE** sahip olmasını (`assertActiveTenantActor` XOR kuralı),
  (c) `client.intake.review` izninin GLOBAL + ALLOW ve süre içinde olmasını ister. DENY varsa ret.
- **Aktarım (promote-address / promote-soft):** `assertCanManagePromotion` → `isApproverEligible`
  (PARTNER veya yetkilendirilmiş avukat). **İnceleme izni bu kapıyı AÇMAZ.** Ret kanonik yazmadan
  önce gelir ve **audit üretmez**.
- **Anonim intake (`validateActiveLink`):** token → `sha256` → `tokenHash` eşleşmesi, ardından
  **yalnız** `status === ACTIVE`, `expiresAt` gelecekte, `useCount < maxUses`. **Case durumuna,
  tenant durumuna ve linki üreten kullanıcının aktifliğine BAKMAZ** (§5.6'nın gerekçesi).
- **Gönderim:** `EmailProviderService` sağlayıcıyı **kurucuda** `ConfigService`'ten okur
  (`EMAIL_PROVIDER`); istek başına veya tenant başına geçersiz kılma **YOKTUR** (§6.1).

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
| | `ClientIntakeLink` | 1 | yalnız `tokenHash`; **ham token DB'ye yazılmaz** · ACTIVE · `maxUses` 1 · +7 gün |
| | `ClientIntakeSubmission` | 1 | CLIENT_SUBMITTED |
| | `ClientIntakeField` | 2 | ADDRESS + CONTACT · PENDING · `promotedAt` null |
| | `PermissionGrant` | 1 | reviewer → `client.intake.review` · GLOBAL · ALLOW |
| R-1 (claim) | `AuditLog` | 1 | `CLIENT_INTAKE_REVIEW_COMMAND` |

### 5.2 INSERT — gönderim kapsamı AÇIK: 28 satır (19 + 9)

A-5 ve A-6 her biri: `ClientInfoRequest` 1 · `ClientNotification` 1 · `AddressAuditLog` 1 ·
`AuditLog` 1 (WORKSPACE komut audit'i). A-6 ayrıca `ClientIntakeLink` 1. Toplam ek: 9 satır.
Provada ölçülen fark birebir (§7.3).

### 5.3 INSERT — gönderim DENENDİ ve BAŞARISIZ: 21 satır (ÖLÇÜLDÜ, §7 N3)

| Tablo | Adet | Neden |
|---|---|---|
| kurulum | 18 | §5.1 |
| `AuditLog` | 1 | R-1 claim |
| **`ClientIntakeLink`** | **+1** | **A-6'nın bağlantısı gönderimden ÖNCE yazılır** (`client-info-request.service.ts` satır 197-211) → gönderim başarısız olsa da satır KALIR (yetim) |
| **`ErrorLog`** | **+1** | 503 küresel hata filtresine düşer; `occurrenceCount` aynı parmak izinde artar (iki başarısız gönderim tek satırda birleşti) |
| `ClientInfoRequest` · `ClientNotification` · `AddressAuditLog` | **0** | "gönder-sonra-yaz": kayıt yalnız doğrulanmış gönderimden sonra oluşur |

**Bu satırlar da kapanışta toplanır:** yetim bağlantı `i11-03` tarafından REVOKED yapılır (ölçüldü:
`linksTotal 2 · revoked 2 · anonUsableAfter 0`).

### 5.4 UPDATE

| Tablo | Satır | Alan | Adım |
|---|---|---|---|
| `ClientIntakeSubmission` | 1 | `status` → IN_REVIEW · `claimedById` · `claimedAt` | R-1 |
| **`ClientIntakeLink`** | **tümü (1–2)** | `status` ACTIVE → **REVOKED** | **kapanış (`i11-03`)** |
| `User` | 3 | `isActive=false` + `tokenVersion++` | kapanış (`cl-09`) |
| `Case` | 1 | ACTIVE → **CLOSED** | kapanış (`cl-09`, cron maruziyeti) |

**Yazmayan adımlar:** login'ler · R-3 / R-2 / R-2b / A-0i retleri (yetki kapısı execute ve audit'ten
önce) · promote retleri (kanonik yazma ve audit yok) · anonim form **okuması** (`useCount` artmaz).
**Dosya yazımı 0. DELETE yoktur.** Önceki alanlar (`cl-acc-afce215b`, `cl-acc-2ed1d6d0`,
`cl-acc-d19ce2c7`, `cl-acc-c9b07bcb`) açılmaz.

### 5.5 Yetki kapısı bozuksa — **en fazla BİR yetkisiz isteğin İŞLENMESİ** (dur kuralıyla sınırlı)

Sınır "en fazla bir yazma" değil, **en fazla bir yetkisiz isteğin işlenmesidir**: tek bir istek
birden çok tabloya yazabilir. Tablo bazında (kaynaktan; bu fikstürde `reviewStatus` PENDING olduğu
için `recomputeSubmissionStatus` başvuruyu **güncellemez** — `approvedTotal = 0`):

| İlk başarılı yetkisiz istek | Oluşacak yazmalar (tablo bazında) | Sonrası |
|---|---|---|
| **R-3** (izinsiz claim) | `ClientIntakeSubmission` UPDATE 1 (IN_REVIEW + `claimedById`=plain + `claimedAt`) · `AuditLog` INSERT 1 | R-2/R-2b/A-0i **gönderilmez** |
| **R-2** (promote-address) | `DebtorAddress` INSERT 1 · `ClientIntakeField` UPDATE 1 (`promotedRefType/RefId/At/ById`) · `AuditLog` INSERT 1 (tek transaction) · `ClientIntakeSubmission` UPDATE **0** (APPROVED alan yok) | R-2b/A-0i **gönderilmez** |
| **R-2b** (promote-soft) | `ClientIntelStatement` INSERT 1 · `ClientIntakeField` UPDATE 1 · `AuditLog` INSERT 1 (tek transaction) · başvuru UPDATE **0** | A-0i **gönderilmez** |
| **A-0i** (anonim bilgi talebi) | Kimlik yoksa 401 öncesi yazma yok. Guard açık kalırsa: **gerçek bir SMTP gönderimi** + başarılıysa `ClientInfoRequest` 1 · `ClientNotification` 1 · `AddressAuditLog` 1 · `AuditLog` 1; başarısızsa `ErrorLog` 1 (+ `attachIntakeLink` verilmişse `ClientIntakeLink` 1) | son yetkisiz deneme |

Sonuç FAIL'dir; oluşan satırlar **kanıt olarak kalır, otomatik silinmez**. Bağlantı satırı oluştuysa
kapanış onu REVOKED yapar.

### 5.6 Kapanıştan sonra kalan durum — ve neden bağlantı kapanışı ŞART

Ürün kaynağı (`client-intake-public.service.ts` → `validateActiveLink`) anonim yolu **yalnız**
`status === ACTIVE` + süre + kullanım sayısıyla kapatır. Dolayısıyla **cl-09 tek başına yetmez**:
Case CLOSED olsa, üç kullanıcı pasifleştirilse bile ham token'ı elinde tutan biri formu açıp
**yeni bir `ClientIntakeSubmission` + `ClientIntakeField` satırı yazabilirdi** (`submit` atomik
`useCount` artırımıyla yazar; Case durumuna bakmaz). Bu yüzden kapanış `i11-03-close-links.js` ile
başlar.

**Kapanış sonrası:** `cl-acc-<runId>` → kullanıcı erişimleri kapalı · **intake bağlantıları REVOKED
(anonim yol 404, ölçüldü)** · tenant ACTIVE · Case CLOSED · başvuru IN_REVIEW · kanıt satırları ve
`tokenHash`'ler korunuyor. Alan yeniden açılmaz.

---

## 6. A-5/A-6 İÇİN CANLI KANIT YÖNTEMİ

### 6.1 Canlı süreçte neden ölçülemez (kaynaktan)

| Olgu | Kaynak |
|---|---|
| Sağlayıcı **kurucuda** sabitlenir: `this.provider = configService.get('EMAIL_PROVIDER') \|\| 'mock'` | `email-provider.service.ts` |
| İstek başına / tenant başına sağlayıcı geçersiz kılma **YOK**; bu uçta tenant'a bağlı SMTP ayarı da yok | aynı dosya + `client-info-request.service.ts` |
| Kuru çalıştırma / önizleme ucu **YOK**; kalıcı kayıt yalnız `sendOutcome === 'sent'` ise oluşur | `client-info-request.service.ts` ("gönder-sonra-yaz") |
| Canlı yapılandırma: `EMAIL_PROVIDER=smtp` · `SMTP_HOST=srvc182.trwww.com` · `SMTP_PORT=465` · `EMAIL_FROM=bilgi@tellihukuk.com`; izinli-alıcı sınırı bu yolda **yok** | canlı `.env` (salt okuma) |

**Sonuç:** canlı süreçte A-5/A-6'nın **hiçbir ayağı** gerçek bir gönderim olmadan ölçülemez — kalıcı
gövdeyi ölçmek için bile önce başarılı bir gönderim gerekir. Sağlayıcıyı değiştirmek `.env` + **restart**
ister; bu talimat kapsamı dışıdır ve pencere boyunca **bütün canlı e-postaları** etkiler.

### 6.2 Gerçek SMTP + `.invalid` neden EŞDEĞER DEĞİL

1. **Ölçütün kendisi test sağlayıcısı diyor** (R02 §5.2, A-5 satırı). Gerçek sağlayıcı bu şartı
   karşılamaz; "gerçek alıcıya gönderim YOK" şartı da ancak alıcının var olmamasıyla değil, **gönderimin
   olmamasıyla** güvenceye alınır.
2. **Sonuç önceden kestirilemez.** Relay `.invalid` alıcıyı RCPT aşamasında reddederse → 503, **kayıt
   yok, hiçbir ölçüt kanıtlanmaz**; kabul ederse → gerçek bir posta kuyruğa girer ve
   `bilgi@tellihukuk.com` kutusuna **geri dönüş** gelir.
3. **A-6'da ham intake token'ı dışarı çıkar.** O token canlı tenant'a **anonim yazma** yetkisi verir
   (§4.2, §5.6). Token, uzak posta sunucusunun kayıtlarına ve olası bounce metnine girer. Ölçmeye
   çalıştığımız sızıntı ölçütünü ölçüm eyleminin kendisi ihlal eder.
4. **Başarısızlık bile "gitmedi" demek değildir** (ÖLÇÜLDÜ, §7 N3): yerel bağlantı reddinde bile ürün
   `CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE` döndü — sınıflandırıcı `ESOCKET`'i kesin ret saymaz
   (`email-provider.service.ts`, `SMTP_DEFINITE_REJECT_CODES` bilerek dar). Yani gerçek sağlayıcıyla
   başarısız bir A-6 denemesinden sonra bile "token dışarı çıkmadı" **denemez**.

### 6.3 SMTP sonucu ne kanıtlar?

| Sağlayıcı sonucu | Ürün davranışı | A-5 | A-6 | Kalan iz |
|---|---|---|---|---|
| **ACCEPTED** | 201, kayıtlar yazılır | kalıcı gövdenin URL taşımadığı **kanıtlanır** | yeni link + kalıcı gövde temiz **kanıtlanır**; "sağlayıcı metni bağlantı TAŞIR" ayağı **kanıtlanamaz** (canlı SMTP içeriği gözlenemez) | gerçek posta + olası bounce |
| **REJECTED** | 503 `..._EMAIL_FAILED`, kayıt yok | **ölçülemez** | **ölçülemez** | A-6 denemesinde yetim `ClientIntakeLink` + `ErrorLog` |
| **INDETERMINATE** | 503 `..._EMAIL_INDETERMINATE`, kayıt yok, otomatik tekrar yok | **ölçülemez** | **ölçülemez** | aynı + **"ileti gitmiş OLABİLİR"** (token sızmış olabilir) |

Üç sonucun ikisinde hiçbir ölçüt kanıtlanmaz; birinde de A-6 yarım kalır. **Gerçek SMTP, A-5/A-6 için
geçerli bir kanıt yöntemi değildir.**

### 6.4 Uygulanabilir yöntemler — owner kararına (etkileriyle)

| # | Yöntem | Canlı etki | A-5 | A-6 | Değerlendirme |
|---|---|---|---|---|---|
| **V1** | **A-5/A-6 canlıda ölçülmez.** Canlıda review→promote + A-0i + L-1 ölçülür (19 satır, gönderim yok). A-5/A-6 gözlenebilir sağlayıcılı prova kanıtıyla kayıtta kalır, **KAPSAM DIŞI** işaretlenir | **YOK** (gönderim, restart, yapılandırma değişikliği yok) | prova | prova | **ÖNERİLEN.** İ11 **kapanmaz**; üç gözlemden biri canlıda |
| **V2** | Canlı DB'ye bağlı **ikinci API süreci** (aynı dist, ayrı port, sağlayıcı = yerel yakalayıcı) | **AĞIR — §6.5.** Canlı dinleyici durmaz ama ikinci süreç canlı veriyle **33 zamanlanmış işi** ayrıca koşar | tam | tam | **ÖNERİLMEZ.** Bu talimat ikinci süreci ayrıca yasaklıyor |
| **V3** | `.env`'de sağlayıcıyı test sağlayıcısına alıp **restart** | Pencere boyunca **tüm canlı e-posta** yakalayıcıya gider (gerçek bildirimler kaybolur) + kesinti | tam | tam | **ÖNERİLMEZ**; ayrı GO konusu |
| **V4** | Ölçütü R02 düzeyinde değiştirme (A-5/A-6'yı ürün-kodu ölçütü sayıp prova kanıtını yeterli görme) | yok | — | — | **Owner kararı**; teknik iş değil |

**Öneri: V1.** Gerekçe: A-5/A-6'nın ölçtüğü şey **kod davranışıdır** (hangi gövde kalıcı, hangisi
taşımada) ve canlıya özgü tek değişken sağlayıcı yapılandırmasıdır — ki onu canlıda gözlemek zaten
mümkün değil. V1 hiçbir ölçütü sessizce düşürmez: iki gözlem **KAPSAM DIŞI** olarak açık kalır ve
İ11 **kapanmaz**.

### 6.5 İkinci API sürecinin zamanlayıcı etkisi (ÖLÇÜLDÜ — V2'nin gerçek bedeli)

Canlı DB'ye bağlı ikinci bir API süreci başlatılırsa:

| Ölçüm | Değer | Kaynak |
|---|---|---|
| Canlı dist'teki `@Cron` kaydı | **33** (14 dosyada) | `dist/.../modules/**` taraması |
| `ScheduleModule.forRoot()` | **5** yerde; koşulsuz (`app.module`) | dist |
| Genel zamanlayıcı kapatma bayrağı | **YOK** (yalnız `ICRABOT_OUTBOX_CRON_ENABLED` gibi tekil bayraklar) | kaynak taraması |
| Üst üste binme koruması | **süreç-içi** (`runWithOverlapGuard`, modül-önbelleği `Set`) → **süreçler arası ÇALIŞMAZ** | `common/scheduler-overlap-guard.ts` |
| Silme yapan zamanlanmış iş örneği | `error-log-retention` → `errorLog.deleteMany` | dist |

Yani ikinci süreç, canlı verinin üzerinde **33 zamanlanmış işi ikinci kez ve eşzamanlı** koşar; mevcut
koruma bunu engellemez (aynı `jobId` yalnız aynı süreç içinde dışlanır). Mükerrer bildirim, mükerrer
outbox yayını, çakışan risk-skoru/otomasyon yazmaları ve ikinci bir saklama-silme turu mümkündür.
**Bu nedenle V2 uygulanmadı ve önerilmiyor;** bu talimat da canlı DB'ye bağlı ikinci süreç
başlatılmasını yasaklamaktadır.

### 6.6 Göreli intake URL — H5 KULLANILABİLİRLİK KUSURU (AÇIK)

**B-I11-1 açık bir H5 kusuru olarak kayıtta tutulur** (§7.6). `PUBLIC_INTAKE_BASE_URL` canlıda
tanımsız olduğu için üretilecek bağlantı göreli (`/intake/<token>`) olur ve müvekkil **tıklanabilir
adres almaz**. Bu, A-5/A-6 ölçütlerini geçersiz kılmaz (token yine yalnız taşıma metnindedir) ama
**H5'in kullanılabilirliğini bozar**; İ11 hangi kapsamla koşulursa koşulsun bu kalem kapanmaz ve
teslim metnine sınır olarak yazılır.

---

## 7. DOĞRULAMA — oturuma özel disposable DB (2026-09-12)

### 7.1 Ortam

| Öğe | Değer |
|---|---|
| DB | oturuma özel konteyner `hy-i10-894280b1-db` · `127.0.0.1:5442` · `hukuk_i10_894280b1_test` · 210 tablo |
| API | `HY_W4_RELEASE22` dist `main.js` sha256 `28D84796…E73F5` · `:8101` · komut satırı dist ile eşleşti |
| Sağlayıcı | **yerel SMTP yakalayıcı** `127.0.0.1:2525` (repo dışı): gelen iletiyi kaydeder, **dışarı hiçbir şey göndermez** |
| Redis | **oturuma özel** `hy-i11-894280b1-redis` (`127.0.0.1:6389`), yalnız public-intake limiteri için; genel `REDIS_URL` ulaşılamaz bırakıldı. **Canlı `hukuk-redis` kullanılmadı** |
| Bağlantılar | API'nin uzak uçları yalnız oturum DB'si, yakalayıcı ve oturum Redis'i · canlı 5432/6379/8080 **yok** |
| Canlı | `:8080` ve `:3002` dinleyicileri **değişmedi**; canlı DB'ye dokunulmadı |

### 7.2 Senaryolar — **7/7 DOĞRULANDI**, sapma 0

| Senaryo | runId | Ne yapıldı | Sonuç |
|---|---|---|---|
| **S** | `9a9ea44c` | `I11_ABORT_AFTER=user` | exit 1 · tenant yok · 210 tabloda fark **0** (ROLLBACK) |
| **G** | `782bacb9` | canlı mod: başka işin ref'i · İ11 ref'i · uyuşmaz gönderim ref'i | `i11-run` ve `i11-01` başka ref'i **reddetti** (G-0'dan önce) · G-0 ulaşılamaz hedefi reddetti · gönderim ref'i uyuşmazsa **ret** · fark 0 |
| **N1** | `be8a360a` | gönderim kapsamı KAPALI | **PASS · KISMI** · 9 ölçüt PASS · A-5/A-6 KAPSAM DIŞI · sink 0 ileti · fark = **19 satır** · bağlantı REVOKED · anonim **200 → 404** |
| **N2** | `ef64deec` | gönderim kapsamı AÇIK + yakalayıcı | **PASS · TAM** (11 ölçüt) · fark = **28 satır** · **iki bağlantı da REVOKED** · anonim 200 → 404 |
| **F** | `fda0de2e` | vekil ilk claim'e sahte 200 | R-3 **FAIL** · R-2/R-2b/A-0i **ÇAĞRILMADI** · sonuç FAIL · kapanış yine çalıştı |
| **N3** | `e19b65f9` | **gönderim HATASI** (yakalayıcı kapalı) | A-5 **503 `..._EMAIL_INDETERMINATE`** · talep 0 · bildirim 0 · sink 0 · fark = **21 satır** (yetim link + ErrorLog) · **iki bağlantı da REVOKED** · anonim 200 → 404 · sonuç FAIL |
| **R** | `bf24f38f` | **KURTARMA**: kurulum COMMIT → **durum dosyası SİLİNDİ** → yalnız `runId` | `i11-03` ve `cl-09` durum dosyası olmadan çalıştı · bağlantı REVOKED · anonim **200 → 404** · 3 kullanıcı pasif + Case CLOSED · **tekrar güvenli** (revoked 0 / usersDeactivated 0, exit 0) · **başka tenant değişmedi** · kanıt korundu · kurtarmada **yeni INSERT 0** |

### 7.3 A-5/A-6'nın kanıtı (N2)

- **A-5:** 201 · `ClientInfoRequest` +1 · alıcı `.invalid` · **kalıcı `emailBody` URL taşımıyor** ·
  `ClientNotification` +1 · `AddressAuditLog` +1.
- **A-6:** 201 · yeni `ClientIntakeLink` (+1) · kalıcı gövde yine temiz · `tokenHash` 64-hex.
- **Sağlayıcıya giden metin (yakalayıcı kaydı):** A-5 iletisinde intake token'ı **yok**; A-6
  iletisinde **var** ve o token'ın `sha256`'sı DB'deki `tokenHash` ile **eşit** → ham token yalnız
  taşıma metninde, DB'de yalnız hash'i, kalıcı gövdede hiçbiri. Her iki iletinin alıcısı `.invalid`.

### 7.4 Bağlantı kapanışının kanıtı (N1 · N2 · N3 · F · R)

Her koşumda iki yanlı ölçüm: **iptalden önce `GET /api/public/intake/:token` → 200** (pozitif kontrol:
kapı gerçekten açıktı), **iptalden sonra → 404**. Ek olarak DB düzeyinde `anonUsableAfter = 0` ve
`evidencePreserved = true` (satır sayısı, `tokenHash` ve `useCount` değişmedi).

**Ham token hiçbir kayda, log'a, özete veya bu belgeye yazılmaz;** yürütücü süreçte üretilip alt
sürece yalnız ortam değişkeni olarak geçer (parolayla aynı desen).

### 7.5 Bu doğrulamanın kanıtlamadıkları

- Yakalayıcı **gerçek sağlayıcı değildir**; canlıda sağlayıcı davranışı farklıdır. A-9/A-10 İ12'nindir.
- Oturuma özel Redis, canlı Redis'in davranışını temsil eder ama **canlı Redis ölçülmemiştir**;
  bu yüzden canlı blokta **K-INTAKE** kapısı vardır (§8).

### 7.6 BULGULAR

| # | Bulgu | Durum |
|---|---|---|
| **B-I11-1** | `PUBLIC_INTAKE_BASE_URL` canlıda **tanımsız** (.env 0 satır; Machine/User kapsamında da yok) → `buildUrl` göreli `/intake/<token>` üretir; müvekkil tıklanabilir adres **almaz** | **AÇIK — H5 kullanılabilirlik kusuru** (§6.6). İ11 ölçütünü bloke etmez, teslim metnine sınır olarak girer |
| **B-I11-2** | promote reddi **stabil kod taşımıyor** (yalnız mesaj); inceleme reddinde `CLIENT_MUTATION_DENIED_INTAKE_REVIEW` var | AÇIK, bloke etmez |
| **B-I11-3** | Public intake ucu **5xx** verdiğinde küresel hata filtresi istek yolunu olduğu gibi yazar → **ham intake token'ı `ErrorLog.endpoint` alanına düz metin** girer (ölçüldü: `/api/public/intake/<token>`). Ucun hız sınırı Redis'e bağlı ve **Redis arızasında fail-closed 503** verir; yani bir Redis kesintisi, müvekkil formu açmaya çalıştığında token'ı DB'ye düşürür. Controller yorumu token'ı loglamadığını söyler; sızıntı **filtre katmanındadır** | **MAIN'DE ONARILDI — CANLIDA DEĞİL.** PR #2643 @ `d199c8dc`: `redactSecretPathSegments` `redactPii`'nin ilk adımı yapıldı; hattın tüm alanlarında (DB `endpoint` · `message` · `stack` · `metadata.route` · konsol · FRONTEND yolu) değer maskelenir, **rota şekli korunur** (`/api/public/intake/:token`). Hedefli regresyon testi CI manifestinde (11/11; yama etkisi kaldırılınca 9'u düşer). Yan fayda: dedupe anahtarı artık token'a bağlı değil → ErrorLog satır patlaması da kapandı. **Canlı ikili hâlâ `13740670` — onarım canlıya YANSIMADI.** RELEASE23 adayında (`2740df3d`, BUILD_ID `dOiGPj2M0Abls0kCibY4r`) **derlenmiş ikilide kanıtlandı** (V-B PASS; onarımsız R22 ikilisinde negatif kontrol FAIL — `I11-ADAY-BAGLAMA-VE-DOGRULAMA-R04.md`); canlıya **cutover ile** geçer. **K-INTAKE kapısı KALIR** (kapı onarımın yerine geçmez, yalnız koşumu korur) |

---

## 8. Canlı koşum öncesi kapılar — GO anında, ilk yazmadan ÖNCE (§9'daki blokta)

| Kapı | Ölçüt |
|---|---|
| K-GO | ref `OWNER-GO-CLIENT-I11-…`; gönderim kapsamı verilmişse ref ile **aynı** olmalı |
| K-WT | temiz `origin/main` worktree; **tam SHA kaydedilir** ve `origin/main` ile eşit olmalı |
| K-ARC | 9 araç + 12 ürün dosyası = **21 hash**, uyuşmazlık 0 (sayım 21 değilse KÖR) |
| K-API | `:8080` tek dinleyici süreç + komut satırı RELEASE22 dist |
| K-BLD | release HEAD `2740df3d…` · BUILD_ID `dOiGPj2M0Abls0kCibY4r` (RELEASE23 adayına bağlı — R04; cutover öncesi koşulursa **DURUR**) |
| K-SMTP | canlı sağlayıcı yazdırılır; **gönderim kapsamı açık ve sağlayıcı `mock` değilse** ayrı owner onayı (`$SmtpAck='EVET'`) yoksa DURUR |
| **K-INTAKE** | **rastgele** (geçersiz) token ile `GET /api/public/intake/<rastgele>` → **404** beklenir. 404 değilse koşuma girilmez (B-I11-3: sağlıksız uçta gerçek token DB'ye düşerdi) |
| K-REF | ref kullanılmamış: `origin/main` + açık PR dalları + koşum kayıtları. **Tüketim** = ref'in `runId` ile aynı dosyada geçmesi; yalnız anma engellemez ama raporlanır (0 dosya tarandıysa KÖR) |
| K-PAR | kabul/governance betiği çalıştıran başka süreç 0 (blok kendini imzasıyla dışlar) |

## 9. Kesin komut — TEK SCRIPTBLOCK

`$ErrorActionPreference='Stop'` + her yerli komuttan sonra `$LASTEXITCODE` denetimi → **ilk hatada
blok durur, `node` çağrısına ULAŞILMAZ**. Blok dosyası sha256
`A16E479155084F3B6F7D12D7A820E2BA0760411A18FB64D749FA0799C647D148`; PowerShell 7 ve 5.1'de
ayrıştırma hatası 0; **9 kapı · 21 hash · 26 durdurucu · tek `node` çağrısı**. Aşağıdaki gömülü kopya
hash'i verilen dosyayla **bayt bayt aynıdır**.

```powershell
& {
  # I11-KAPI-BLOK — CLIENT I11 canli kabul: KAPILAR + TEK KOSUM, tek blok.
  # Herhangi bir hata blogu durdurur; sonraki komut CALISMAZ.
  $ErrorActionPreference = 'Stop'
  $selfMark = 'I11-KAPI-BLOK'   # bu blogu calistiran surec kendini "paralel kabul" sanmasin

  $GoRef   = '<OWNER-GO-CLIENT-I11-YYYYMMDD-Rnn>'
  $SendGo  = ''    # A-5/A-6 gonderim kapsami: owner ACIKCA onayladiysa $GoRef ile AYNI deger; aksi halde BOS
  $SmtpAck = ''    # gonderim kapsami aciksa ve canli saglayici 'mock' DEGILSE owner onayi: 'EVET'
  $CANON   = 'C:\Development\HUKUK_YAZILIMI\project'
  $WT      = 'C:\Development\HY_WT\CL_I11LIVE'
  $REL     = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23'
  $S       = 'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11live'
  $ENVF    = Join-Path $REL 'project\apps\api\.env'
  $ApiBase = 'http://127.0.0.1:8080/api'

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

  # ---- K-ARC: 9 arac + 12 urun dosyasi tam SHA-256 ----
  $want = [ordered]@{
    'client-live-acceptance-i11-r01\scripts\i11-run.js'            = '27821B463D2DDA5E1F180A79A677CEA13B2EAD15840D95F8218012A0E2632F4B'
    'client-live-acceptance-i11-r01\scripts\i11-01-setup.js'       = '1317D727F08C81108D027C41B9B0DF9EF8E6B5C0C99979F76AEF30E3CA427DC4'
    'client-live-acceptance-i11-r01\scripts\i11-02-intake.js'      = '7D8D492BC6CE4A2E2CD3CB77EEACAC01594D1DDD9D17F9F767D0625DDB251789'
    'client-live-acceptance-i11-r01\scripts\i11-03-close-links.js' = '87C16DB3E7A7521605C1E6F16563415949F871042BCF51617283B4A05D549740'
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
    'modules\client-intake-public\client-intake-public.service.js'                  = '92D3EA95F77843A7D5ECC86863D8352ACA98D789651C01182EC8B665EEFA29E0'
    'modules\notification\email-provider.service.js'                                = '231B77F67514A2D039E760A8150250E64C26DEB6B2145A8354AA89D11C69233A'
    'modules\client-intake-public\public-intake-rate-limit.guard.js'                = '1463DB9C296D77C7937A20AE791F04FA119C7E45C6971A558CEB836F9D9E2DD3'
    'modules\client\client-workspace-command-authority.js'                          = 'D8373C726264631A214056135EBBE36BAA12BA3C91ECCD5F8E589E3F0940A9F6'
    'modules\client\client-mutation-policy.js'                                      = '075FBE3DE30A45A624A04B9812F6F1E59825D032E80FE234CFC50D4865FFC81A'
  }
  $bad = 0; $checked = 0
  foreach ($k in $want.Keys) { $checked++; if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $G $k)).Hash -ne $want[$k]) { $bad++; Write-Output "UYUSMAZ  $k" } }
  foreach ($k in $dist.Keys) { $checked++; if ((Get-FileHash -Algorithm SHA256 -LiteralPath (Join-Path $D $k)).Hash -ne $dist[$k]) { $bad++; Write-Output "UYUSMAZ  dist\$k" } }
  Write-Output "K-ARC: denetlenen dosya $checked (9 arac + 12 urun) - uyusmazlik $bad"
  if ($checked -ne 21) { throw "K-ARC: denetlenen dosya 21 degil ($checked) - KOR" }
  if ($bad -ne 0) { throw "K-ARC: hash uyusmazligi $bad" }

  # ---- K-API: :8080 TEK dinleyici surec + komut satiri RELEASE23 dist ----
  $pids = @(Get-NetTCPConnection -LocalPort 8080 -State Listen | Select-Object -ExpandProperty OwningProcess -Unique)
  if ($pids.Count -ne 1) { throw "K-API: :8080 dinleyici surec sayisi $($pids.Count) (1 olmali)" }
  $apiPid = [int]$pids[0]
  $cl = (Get-CimInstance Win32_Process -Filter "ProcessId=$apiPid").CommandLine
  if ($cl -notlike '*HY_W4_RELEASE23\project\apps\api\dist\apps\api\src\main.js*') { throw 'K-API: :8080 komut satiri RELEASE23 dist DEGIL' }
  Write-Output "K-API: :8080 tek dinleyici PID $apiPid - komut satiri RELEASE23 dist"

  # ---- K-BLD: release HEAD + BUILD_ID ----
  $gitdir = ((Get-Content -LiteralPath (Join-Path $REL '.git') -TotalCount 1) -replace '^gitdir:\s*','').Trim()
  $head = (Get-Content -LiteralPath (Join-Path $gitdir 'HEAD') -TotalCount 1).Trim()
  if ($head -ne '2740df3dd58c5e711a790cc21a5f69d6dbffb35d') { throw "K-BLD: release HEAD beklenen degil ($head)" }
  $buildId = (Get-Content -LiteralPath (Join-Path $REL 'project\apps\web\.next\BUILD_ID') -TotalCount 1).Trim()
  if ($buildId -ne 'dOiGPj2M0Abls0kCibY4r') { throw "K-BLD: BUILD_ID beklenen degil ($buildId)" }
  Write-Output "K-BLD: HEAD 2740df3d... - BUILD_ID $buildId"

  # ---- K-SMTP: canli saglayici GERCEK mi? A-5/A-6 gonderim kapsami aciksa AYRI onay sart ----
  $provLine = @(Select-String -LiteralPath $ENVF -Pattern '^\s*EMAIL_PROVIDER\s*=')
  $provider = if ($provLine.Count -eq 1) { (($provLine[0].Line -replace '^\s*EMAIL_PROVIDER\s*=','').Trim()).Trim('"') } else { '(tanimsiz)' }
  $smtpHost = @(Select-String -LiteralPath $ENVF -Pattern '^\s*SMTP_HOST\s*=')
  $smtpHostVal = if ($smtpHost.Count -eq 1) { (($smtpHost[0].Line -replace '^\s*SMTP_HOST\s*=','').Trim()).Trim('"') } else { '(tanimsiz)' }
  Write-Output "K-SMTP: canli saglayici='$provider' host='$smtpHostVal' - gonderim kapsami=$(if ($SendGo) {'ACIK'} else {'KAPALI'})"
  if ($SendGo -and $provider -ne 'mock' -and $SmtpAck -cne 'EVET') {
    throw "K-SMTP: gonderim kapsami ACIK ve canli saglayici '$provider' (GERCEK). Owner'in ayri yazili onayi olmadan calistirilmaz (`$SmtpAck='EVET')."
  }

  # ---- K-INTAKE: anonim intake ucu SAGLIKLI mi? (RASTGELE token ile; gercek token KULLANILMAZ) ----
  # Bu ucun hiz siniri Redis'e baglidir ve Redis arizasinda FAIL-CLOSED 503 doner; 503 kuresel
  # hata filtresine dusunce istek YOLU (yani TOKEN) `ErrorLog.endpoint` alanina yazilir.
  # Saglik RASTGELE bir token'la olculur: 404 beklenir. 404 degilse kosuma GIRILMEZ.
  $rnd = -join ((1..32) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
  $intakeCode = 0
  try {
    $resp = Invoke-WebRequest -Uri "$ApiBase/public/intake/$rnd" -Method GET -UseBasicParsing -TimeoutSec 20
    $intakeCode = [int]$resp.StatusCode
  } catch {
    if ($_.Exception.Response) { $intakeCode = [int]$_.Exception.Response.StatusCode }
    else { throw "K-INTAKE: istek yapilamadi - $($_.Exception.Message)" }
  }
  if ($intakeCode -ne 404) { throw "K-INTAKE: anonim intake ucu saglikli DEGIL (HTTP $intakeCode; 404 bekleniyordu). Redis/limiter kontrol edilmeli; gercek token GONDERILMEZ." }
  Write-Output 'K-INTAKE: anonim intake ucu saglikli (rastgele token -> 404)'

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
    'C:\Users\ulastelli\AppData\Local\Temp\claude\C--Development-HUKUK-YAZILIMI-project\894280b1-443c-4406-86cd-b9e22aad3f7b\scratchpad\i11s',
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
  $env:CL_API_BASE_URL = $ApiBase
  $env:CL_PRISMA_ROOT  = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE22/project/apps/api/node_modules/@prisma/client'
  $env:CL_BCRYPT_PATH  = 'C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE22/project/apps/api/node_modules/bcrypt'
  Remove-Item Env:\CL_SESSION_DB -ErrorAction SilentlyContinue
  Remove-Item Env:\CL_I11_INTAKE_TOKEN -ErrorAction SilentlyContinue
  $env:CL_RUN_ID       = -join ((1..8) | ForEach-Object { '{0:x}' -f (Get-Random -Maximum 16) })
  Add-Content -LiteralPath (Join-Path $S 'RUNID-RESERVATION.txt') -Value "$(Get-Date -Format o) runId=$($env:CL_RUN_ID) go=$GoRef gonderim=$(if ($SendGo) {'ACIK'} else {'KAPALI'})"
  $env:CL_STATE_FILE   = Join-Path $S ("i11-state-" + $env:CL_RUN_ID + ".json")
  Write-Output "HAZIR: runId=$($env:CL_RUN_ID) - durum dosyasi rezerve edildi (parola ve intake ham token BASILMAZ)"

  # ---- TEK KOSUM ----
  node (Join-Path $WT 'project\docs\governance\client-live-acceptance-i11-r01\scripts\i11-run.js')
  $code = $LASTEXITCODE
  Write-Output "i11-run cikis kodu: $code"
  if ($code -ne 0) { throw "KOSUM BASARISIZ (exit $code) - kapanis makbuzunu oku; gerekirse yalniz runId ile kurtarma (paket §11)" }
  Write-Output "SONUC: BASARILI - runId=$($env:CL_RUN_ID) - kapanis, baglanti iptali ve izolasyon makbuzda"
}
```

## 10. Owner kararına sunulan kapsam

Bu belge GO değildir. Canlı koşum için owner'ın yazılı kararı şunları kapsamalıdır:

1. **GO ref:** `OWNER-GO-CLIENT-I11-<YYYYMMDD>-R<nn>`. Koşucu başka işin ref'ini kabul etmez. Ref,
   test/taslak dosyalarında geçmeyen bir değer olmalıdır (K-REF anmayı raporlar, tüketimi durdurur).
2. **Yazma:** yalnız `cl-acc-<runId>` tenant'ında — gönderim kapalıysa **19 satır**, açıksa **28**,
   gönderim denenip başarısız olursa **21** (§5.1–§5.3); kapanışta bağlantı(lar) REVOKED + 3 kullanıcı
   erişim iptali + `Case` CLOSED. En kötü durum: **en fazla bir yetkisiz isteğin işlenmesi** (§5.5).
3. **Gönderim kapsamı — asıl karar (§6):**
   - **(a) KAPALI — ÖNERİLEN (V1):** gönderim yok; canlıda review→promote + A-0i + bağlantı kapanışı
     ölçülür. A-5/A-6 **KAPSAM DIŞI** kalır ve **İ11 kapanmaz** (sayaç 10/17).
   - **(b) AÇIK:** ofisin gerçek posta sunucusuna iki SMTP gönderimi; §6.2–§6.3'teki sakıncalar
     (kestirilemez sonuç, bounce, **ham token'ın dışarı çıkması**, başarısızlıkta bile belirsizlik)
     kabul edilmiş sayılır.
   - **(c) ERTELE:** V3/V4 ayrı GO konusudur.
4. **Sınırlar:** gerçek kişiye gönderim yok · başka tenant'a yazma yok · **canlı DB'ye bağlı ikinci
   süreç yok** · restart, yayın, migration ve flag değişikliği yok · belirsiz sonuçta otomatik
   tekrar/silme yok.
5. **Bilgi:** B-I11-1 (göreli intake URL) **açık H5 kusuru** olarak kalır; B-I11-3 **main'de onarıldı (#2643 @ `d199c8dc`) ama canlıya geçmedi** → K-INTAKE kapısı
   koşum boyunca koruma sağlar ama **ürün tarafı açıktır**.

## 11. Hata / yarıda kesilme kurtarması ve kapatma

| Durum | Davranış |
|---|---|
| Yanlış ref · uyuşmaz gönderim ref'i · kütüphane yolu yok · `$SmtpAck` yok · K-INTAKE sağlıksız | ön kontrol → **hiçbir yazma yapılmaz** |
| Çakışma / hedef uyuşmazlığı | G-0/G-1/G-3 → hiçbir yazma yapılmaz |
| Kurulum yarıda kesilirse | tek transaction → ROLLBACK, yetim satır 0 (§7 S) |
| Yetkisiz deneme beklenen reddi vermezse | sonraki yetkisiz deneme gönderilmez; kapanış **yine çalışır**; sonuç BAŞARISIZ (§7 F) |
| Gönderim başarısız/belirsiz | ürün 503 döner ve talep kaydı **yazmaz**; **yetim `ClientIntakeLink` + `ErrorLog` kalır** ve kapanış bağlantıyı REVOKED yapar (§7 N3) |
| İzolasyon farkı / ölçülemezlik | sonuç BAŞARISIZ; otomatik tekrar yok |
| Kapanış veya bağlantı iptali doğrulanamazsa | BAŞARILI verilmez |
| **Süreç zorla sonlanırsa / durum dosyası kaybolursa** | aşağıdaki iki komut, **yalnız runId** ile (ÖLÇÜLDÜ: §7 R) |

Kurtarma **durum dosyasına, ham token'a ve parolaya bağlı değildir**: `findAcceptanceField` yalnız
`runId`'den `cl-acc-<runId>` slug'ını türetir, kendi ön ekini doğrular ve tenant'ı bulur. Her iki
komut da **yalnız o tenant'a** dokunur ve **tekrarı güvenlidir**.

```powershell
# §9'daki CL_ENVIRONMENT / CL_OWNER_GO_REF / CL_DATABASE_URL / CL_PRISMA_ROOT tanımlıyken:
$env:CL_RUN_ID = '<runId>'

# 1) ANONİM YOL — koşumun BÜTÜN intake bağlantıları (kurulum · A-6 · gönderim hatasında kalan yetim)
node 'C:\Development\HY_WT\CL_I11LIVE\project\docs\governance\client-live-acceptance-i11-r01\scripts\i11-03-close-links.js'

# 2) KULLANICI ERİŞİMİ + Case cron maruziyeti
node 'C:\Development\HY_WT\CL_I11LIVE\project\docs\governance\client-live-acceptance-i1b-r01\scripts\cl-09-close-access.js'

# İzolasyonu elle yeniden ölçmek (salt-okuma; durum dosyası gerekir — kurtarmanın ŞARTI DEĞİLDİR):
$env:CL_STATE_FILE = '<...>\scratchpad\i11live\i11-state-<runId>.json'
node 'C:\Development\HY_WT\CL_I11LIVE\project\docs\governance\client-live-acceptance-i9-r01\scripts\i9-03-isolation.js'
```

`i11-03` yalnız `ACTIVE` bağlantıları `REVOKED` yapar; satır silmez, `tokenHash`/`useCount` değiştirmez;
ikinci çağrı `revoked:0 · alreadyClosed:true · exit 0` verir. `cl-09` üç `User` satırına
`isActive=false` + `tokenVersion++` yazar ve `Case`'i CLOSED yapar; ikinci çağrı
`alreadyClosed:true · exit 0`. İkisi de başvuru/alan/audit satırlarına dokunmaz.

## 12. Kapanış ölçütü ve ŞU ANKİ DURUM

| Gözlem | Durum | Dayanak |
|---|---|---|
| A-5 kalıcı gövde ham token/URL taşımaz | **KANIT YÖNTEMİ KARARI BEKLİYOR** — canlıda ölçülemez (§6.1) | §7.3 · N2 |
| A-6 bağlantı yalnız sağlayıcı metninde | **KANIT YÖNTEMİ KARARI BEKLİYOR** — canlıda "sağlayıcı metni" ayağı gözlenemez | §7.3 · N2 |
| review→promote kapısı | **HAZIR — canlıda ölçülmedi** | §7.2 · N1/N2 (R-1 + R-2/R-2b) |
| (kapanış şartı) anonim bağlantıların kapanması | **HAZIR — ölçüldü** (200 → 404, tekrar güvenli, kurtarma dahil) | §7.4 · N1/N2/N3/F/R |

Şu an **10/17**; hizmet kabulü **0/8 tam**. V1 ile koşulursa İ11 **kapanmaz** ve sayaç değişmez;
üç gözlemin canlıda PASS olması ancak §6.4'teki V2/V3/V4'ten birinin owner kararıyla seçilmesine bağlıdır.

## 13. Kapsam DIŞI

Deploy · migration · servis restartı · `.env`/flag değişikliği (sağlayıcı değiştirme dahil) · **canlı
DB'ye bağlı ikinci API süreci** · gerçek kişiye gönderim · başka tenant'a yazma · silme · gerçek
tenant'a çağrı · önceki alanlarda kullanıcı erişiminin veya intake bağlantısının yeniden açılması ·
**ürün kodu değişikliği** · **A-9/A-10 ve İ12'nin diğer gözlemleri** · İ13…İ15 · İ16/İ5a · İ17.

---

## 14. TAM KABUL UYGULAMA PAKETİ — owner kararına (henüz UYGULANMADI)

§6.4'teki seçeneklerden **A-5/A-6'nın taşıma gövdesini gerçekten gözleyen** ve R02'nin **test
sağlayıcısı** şartını karşılayan tek uygulanabilir yöntem burada somutlaştırılmıştır. **Bu bölüm
bir uygulama değil, karar metnidir; hiçbir canlı yapılandırma değiştirilmedi, restart/yayın
yapılmadı.**

### 14.1 Yöntem T — "gözlenebilir taşıma, dış çıkış yok"

Canlı API süreci **aynı kalır**; yalnız **taşıma hedefi** loopback'e çevrilir. `EMAIL_PROVIDER`
`smtp` olarak **değişmez** → canlıdaki `sendViaSmtp` kod yolu aynen çalışır, yalnız karşı taraf
yerel yakalayıcıdır.

| Owner ölçütü | Karşılanma | Dayanak |
|---|---|---|
| Gerçek SMTP çıkışı olmaması | ✔ `SMTP_HOST=127.0.0.1` → süreç dış relay'e **bağlanamaz** | `email-provider.service.ts` `sendViaSmtp` host'u ConfigService'ten alır |
| İkinci cron yürütücüsü oluşmaması | ✔ Yeni süreç **yok**; mevcut tek API süreci yerinde yeniden başlatılır | §6.5'teki 33 cron sorunu doğmaz |
| Geri dönüşün açık olması | ✔ İki anahtar; öncesi sha256 yedekli; geri alma aynı iki adım (§14.4) | — |
| **A-0i kapısı bozulsa da dış gönderim engellenmeli** | ✔ Engel **süreç genelindedir**: yetki kapısı ne yaparsa yapsın taşıma hedefi loopback'tir; yetkisiz bir istek bile dışarı çıkamaz | kapı-üstü değil, taşıma-altı engel |
| R02 "test sağlayıcısı" şartı | ✔ Yerel yakalayıcı = test sağlayıcısı; **taşıma gövdesi okunabilir** | §7.3'teki A-6 kanıtı aynı yöntemle üretildi |

### 14.2 Kesin değişiklikler

**Canlı `.env` (cutover sonrası `HY_W4_RELEASE23\project\apps\api\.env`) — TAM İKİ SATIR:**

| Anahtar | Önce | Sonra | Neden |
|---|---|---|---|
| `SMTP_HOST` | `srvc182.trwww.com` | `127.0.0.1` | dış çıkış imkânsız |
| `SMTP_PORT` | `465` | `2526` | kaynakta `secure: SMTP_PORT === '465'` → düz SMTP; yakalayıcı portu |

**DEĞİŞMEYENLER:** `EMAIL_PROVIDER` (=`smtp`) · `EMAIL_FROM` · `SMTP_USER` · `SMTP_PASS` ·
`DATABASE_URL` · bayraklar · `PUBLIC_INTAKE_BASE_URL` (B-I11-1 açık kalır) · ürün kodu · dist.

**Yakalayıcı koşulu — parola hiç iletilmez:** yakalayıcı EHLO yanıtında **AUTH ilan ETMEMELİDİR**.
Ölçüldü: AUTH ilan edilmeyince nodemailer yalnız `EHLO · MAIL · RCPT · DATA` gönderir,
**`AUTH` komutu hiç gitmez**, gövdede parola görünmez ve gönderim yine `250` alır. Böylece canlı
`SMTP_PASS` **hiçbir yere — yerel sürece bile — iletilmez** ve iki anahtar daha değiştirmek
gerekmez. Yakalayıcı yalnız `127.0.0.1`'e bağlanır, **hiçbir iletiyi dışarı göndermez** ve bir
Nest/cron süreci **değildir**.

### 14.3 Adımlar (sıralı; her adım ölçülür)

| # | Adım | Ölçüt |
|---|---|---|
| T-0 | `.env`'in sha256'sı alınır, yedeği alınır | yedek hash = canlı hash |
| T-1 | Yakalayıcı `127.0.0.1:2526` başlatılır (AUTH ilan etmeyen varyant) | port dinleniyor · dışarı bağlantı 0 |
| T-2 | İki anahtar değiştirilir | yeni `.env` yalnız 2 satırda farklı (diff ölçülür) |
| T-3 | API servisi durdurulur/başlatılır (mevcut launcher) | tek dinleyici · komut satırı RELEASE22 dist · **kesinti ölçülür** |
| T-4 | **Dış çıkış yok kanıtı**: API sürecinin uzak uçları | `srvc182`/`:465` bağlantısı **0**; yalnız DB/Redis/yakalayıcı |
| T-5 | §9 bloğu, `$SendGo` = GO ref, `$SmtpAck='EVET'` ile **TEK KEZ** | 9 kapı geçer; koşum kapsamı **TAM** |
| T-6 | A-5/A-6 kanıtı yakalayıcı kaydından | A-5 iletisinde token **yok**; A-6'da **var** ve `sha256(token)=tokenHash`; kalıcı gövdeler URL'siz |
| T-7 | Kapanış (§11) | bağlantılar REVOKED · anonim 404 · 3 kullanıcı pasif · Case CLOSED · izolasyon eşit |
| T-8 | **GERİ DÖNÜŞ** (§14.4) — sonuç ne olursa olsun | `.env` hash'i yedekle **birebir** · API yeniden başlar · yakalayıcı durur |

### 14.4 Geri dönüş (koşul aranmaz; başarısızlıkta da uygulanır)

1. `.env` yedekten geri yazılır → **sha256 yedekle birebir eşit olmalı** (ölçülür).
2. API servisi durdurulup başlatılır (aynı launcher) → tek dinleyici + dist komut satırı doğrulanır.
3. Yakalayıcı süreci durdurulur; port 2526 boş.
4. Yakalayıcı kaydı **yerel kanıt** olarak saklanır; **repoya girmez** (§14.6).

Geri dönüş adımları koşumdan **bağımsız çalıştırılabilir**: değişiklik yalnız iki `.env` satırı
olduğu için koşum yarıda kesilse bile geri alma tek başına yeterlidir.

### 14.5 Hizmet kesintisi ihtimali — ÖLÇÜLEN

| Kalem | Ölçüm |
|---|---|
| Restart kesintisi | RELEASE22 cutover'ında **39,467 s** (API **+** Web, journal'dan ölçüldü). Burada yalnız API yeniden başlar → bu değer **üst sınır**. İki restart (T-3 ve T-8) |
| Risk senaryosu | 2026-09-11 kesintisinde reboot + logon beklemesi launcher'ı uzatmıştı (Ek C.1). Pencere **reboot içermez**; yine de başlatıcı doğrulaması T-3/T-8'de ölçülür |
| Pencere boyunca giden e-posta | **Kaybolmaz, yakalanır.** Yakalayıcı gövdeyi kaydeder → geri dönüşten sonra elle yeniden gönderilebilir |
| Gerçek posta çakışma olasılığı | **Ölçüldü (salt-okuma, 16 iletim tablosu):** son 30 günde **toplam 2 satır** (`ClientNotification` 1 · `ClientStatement` 1), son 24 saatte **0**; `ClientInfoRequest` **hiç yok**. Son 30 günde gönderim olan **saat dilimi sayısı 1/720** |
| Zamanlanmış işler | Restart penceresinde tick'ler atlanır (mevcut davranış); ikinci yürütücü **yok** |

### 14.6 Kanıt sınırı — ne kanıtlar, ne KANITLAMAZ

**Kanıtlar:** canlı ikili, canlı DB ve canlı yapılandırma şekliyle, `client-info-request` yolunun
**kalıcı gövdesi token/URL taşımaz** (A-5) ve **taşıma metni bağlantı taşır** (A-6) — R02'nin
tanımladığı biçimde, **test sağlayıcısıyla**.

**KANITLAMAZ:** gerçek relay'in davranışını (kabul/ret/timeout → İ12'nin konusu) · normal
yapılandırmada iletinin gerçek alıcıya ulaştığını · B-I11-1 nedeniyle bağlantının tıklanabilir
olduğunu (göreli URL kusuru **açık kalır**).

**Token kullanımı:** A-6'nın ham token'ı yakalayıcı kaydına girer. O token **sentetik tenant'a**
aittir ve kapanışta **REVOKED** edilir (§5.6) → koşum bittiğinde işlevsizdir. Kayıt yerel kanıt
olarak saklanır, **repoya veya rapora yazılmaz**.

### 14.7 Bu paket uygulanırsa

İ11'in üç gözlemi de canlıda PASS olabilir → **İ11 kapanır**, sayaç **10/17 → 11/17**. Uygulanmazsa
V1 geçerlidir: A-5/A-6 KAPSAM DIŞI kalır ve **İ11 kapanmaz**. Her iki hâlde de B-I11-1 açık H5
kusuru olarak kayıtta durur.

# CLIENT KABUL ÖLÇÜTLERİ — İ2 / R01

**İş:** R02 ana planındaki **İ2** — eksik kabul ölçütlerinin yazımı
**Kapsam:** H2 adres/iletişim · H4 talimat/beyan/rıza/KVKK · H5 intake inceleme→aktarım · H7 portal
**Türetildiği main:** `d2223e78` (kaynak satır numaraları bu ağaca göredir)
**Bu tur:** yeni test koşumu, ürün kodu, şema, flag, gönderim veya deploy **yoktur**.

---

## 0. Bu belge ne yapar, ne yapmaz

**Yapar.** Mevcut karar, kod ve test sözleşmelerinden **ölçülebilir kabul ölçütleri** çıkarır.
Her ölçüt İ3'ün doğrudan düzeneğe çevirebileceği açıklıktadır.

**Yapmaz.** Yeni özellik veya yeni yetki politikası tasarlamaz. Mevcut eşikleri gevşetmez,
sıkılaştırmaz, birbirine genellemez. Önceki kapsam-dışı kararları geri almaz.

**H7 hakkında.** Ölçüt yazmak, portal hesaplarını aktifleştirmek veya **İ4 kapsam kararını
verilmiş saymak değildir.** H7 ölçütleri, İ4 "DAHİL" derse İ16'nın kullanacağı hazır sete
karşılık gelir; İ4 "HARİÇ" derse bu ölçütler koşulmaz ve H7 kabulü aranmaz.

---

## 1. Ölçütlerin ortak sözleşmesi

Her ölçüt sekiz alan taşır: **İşlem · Dayanak · Aktör yetki bağı · Kapsam · Başlangıç ·
Beklenen (yanıt + kalıcı durum) · Red halinde korunacak veri · Kanıt yeri.**

**Kanıt yeri** üç değerden biridir:

| Değer | Anlamı |
|---|---|
| `MEVCUT-KAYIT` | Geçerli eski kanıtla karşılanır; **yeniden test işi değildir** (§4) |
| `YEREL-İZOLE` | İ1a altyapısında (disposable DB + ayrı port + yerel yakalama) koşulabilir |
| `CANLI-YETKİ` | Yalnız ayrıca yetkilendirilecek canlı kabulle ölçülebilir — **bu belge o yetkiyi vermez** |

**Ölçüm disiplini (her ölçüt için bağlayıcı).**
- Ölçüm hatası (bağlantı kopması, timeout, 429, araç kusuru) **"kayıt yok / gönderim yok"
  sayılmaz**; sonuç `ÖLÇÜLEMEDİ`dir ve kabul verilmez.
- **Aynı satır sayısının korunması tek başına satır içeriğinin değişmediği kanıtı değildir.**
  "Değişmedi" iddiası alan-düzeyinde karşılaştırma veya kayıt digest'i ister.
- Reddedilen istekte "yazma yok" iddiası, **işlem öncesi ve sonrası kalıcı durumun**
  karşılaştırılmasıyla gösterilir; yalnız HTTP kodu yeterli değildir.

---

## 2. H2 — Adres ve iletişim

### 2.0 Yüzey ve eşik haritası

Rotalar (`client-address.controller.ts:28-147`, tamamı `JwtAuthGuard` altında):

| Rota | Servis | Eşik |
|---|---|---|
| `GET /clients/:clientId/addresses?status=active\|archived\|all` | `findForClient` | okuma (staff) |
| `POST /clients/:clientId/addresses` | `create` | koşullu (aşağıda) |
| `PUT /clients/:clientId/addresses/:addressId` | `update` | koşullu |
| `DELETE /clients/:clientId/addresses/:addressId` | `remove` | — (her zaman reddedilir) |
| `POST .../:addressId/archive` | `archive` | **her zaman elevated** |
| `POST .../:addressId/restore` | `restore` | **her zaman elevated** |

Elevated eşiği (`client-mutation-policy.ts:327-364`, owner D02/D03/D07):

- `ARCHIVE` / `RESTORE` → **her zaman** elevated (restore, `makePrimary`den bağımsız)
- `UPDATE` → hedef **şu an birincilse** veya istek **birincillik devri** talep ediyorsa elevated
- `CREATE` → yalnız açık birincillik talebi **mevcut aktif birincili düşürecekse** elevated
- **D03:** hiç aktif birincil yokken ilk adresin otomatik birincil olması **STANDARD**'dır
- **D07:** `elevatedAuthority` yalnız `isApproverEligible`'dan türer; **`UserRole.ADMIN` tek
  başına elevated SAYILMAZ.** Bu, `PUT /clients/:id` hassas-alan eşiğinden (`ADMIN ||
  isApproverEligible`, `client.service.ts:528-531`) **farklıdır ve genellenmemelidir.**

---

### H2-01 · VIEWER hiçbir adres mutasyonu yapamaz
- **İşlem:** VIEWER token'ı ile `POST`, `PUT`, `archive`, `restore` uçlarının her biri
- **Dayanak:** `client-mutation-policy.ts:357-359` · `client-address.service.ts:131-146`
- **Aktör yetki bağı:** rol `VIEWER`; eligibility sorgulanmaz (fail-closed erken ret)
- **Kapsam:** aktörün kendi tenant'ındaki müvekkil
- **Başlangıç:** müvekkilde en az bir aktif adres
- **Beklenen:** `403` + gövde `{ code: 'CLIENT_MUTATION_DENIED_VIEWER' }`; sabit mesaj
- **Red halinde korunacak:** adres satırlarının **tamamı** (alan düzeyinde) değişmez; yeni satır
  oluşmaz; lifecycle audit kaydı **yazılmaz**
- **Kanıt:** `YEREL-İZOLE`

### H2-02 · İlk adres otomatik birincil olur ve bu STANDARD'dır
- **İşlem:** `POST /clients/:clientId/addresses` (`isPrimary` talep edilmeden)
- **Dayanak:** owner **D03**, `client-mutation-policy.ts:323-325,334-335`
- **Aktör yetki bağı:** rol USER/ADMIN, **eligibility GEREKMEZ**
- **Kapsam:** aktör tenant'ı = müvekkil tenant'ı
- **Başlangıç:** müvekkilde **hiç** aktif (`isCurrent=true`) adres yok
- **Beklenen:** `201`; oluşan satır `isCurrent=true` **ve** `isPrimary=true` (INV-03 gereği);
  audit satırı aynı transaction'da
- **Red halinde korunacak:** —
- **Kanıt:** `YEREL-İZOLE`

> Bu ölçüt bilerek vardır: ilk adresin birincil olmasını "devir" sayıp elevated aramak,
> D03'ü sessizce sıkılaştırmak olurdu.

### H2-03 · Birincillik devri elevated ister
- **İşlem:** aktif birincil varken `POST` ile `isPrimary=true`, **veya** `PUT` ile
  `isPrimary=true` (devir talebi)
- **Dayanak:** `client-mutation-policy.ts:332-335` (D02/D03) · `client-address.service.ts:161-191`
- **Aktör yetki bağı:** rol USER/ADMIN **ve** `isApproverEligible(userId, tenantId) === true`.
  **ADMIN rolü tek başına yetmez (D07).**
- **Kapsam:** aktör tenant'ı = müvekkil tenant'ı
- **Başlangıç:** müvekkilde aktif birincil adres **VAR**
- **Beklenen (yetkili):** `200`; hedef `isPrimary=true`, eski birincil `isPrimary=false`,
  **ikisi de** `isCurrent=true` (INV-06 tek birincil, INV-03 tam bir current primary)
- **Red halinde korunacak (yetkisiz):** `403` `{ code: 'CLIENT_MUTATION_DENIED_LIFECYCLE' }`;
  **her iki** adres satırı alan düzeyinde değişmez; audit yazılmaz
- **Kanıt:** `YEREL-İZOLE`

### H2-04 · Mevcut birincil kaydın herhangi bir alanı elevated ister
- **İşlem:** `PUT` ile **şu an birincil olan** adresin bir alanı (ör. `street`) — birincillik
  devri talep edilmeden
- **Dayanak:** `client-mutation-policy.ts:332-333` (`targetIsPrimary === true`)
- **Aktör yetki bağı:** `isApproverEligible` zorunlu
- **Kapsam:** aktör tenant'ı = müvekkil tenant'ı
- **Başlangıç:** hedef adres `isPrimary=true`
- **Beklenen (yetkili):** `200`; yalnız istenen alan değişir; birincillik/güncellik durumu
  değişmez
- **Red halinde korunacak (elevated olmayan USER):** `403 LIFECYCLE`; satır **hiç** değişmez
- **Kanıt:** `YEREL-İZOLE`

> **Ayrım:** birincil OLMAYAN bir adresin sıradan alan güncellemesi STANDARD'dır (elevated
> gerekmez). İ3 bu iki durumu ayrı ölçmelidir; aksi hâlde eşik yanlışlıkla genelleşir.

### H2-05 · Arşivleme her zaman elevated; tekrarı sabit hata
- **İşlem:** `POST /clients/:clientId/addresses/:addressId/archive`
- **Dayanak:** `client-address.service.ts:539-560` (owner D02) · policy `329-331`
- **Aktör yetki bağı:** `isApproverEligible` zorunlu — hedef birincil olmasa bile
- **Kapsam:** aktör tenant'ı = müvekkil tenant'ı; adres o müvekkile ait
- **Başlangıç:** hedef adres `isCurrent=true`
- **Beklenen:** `200`; hedef `isCurrent=false` **ve** `isPrimary=false` (INV-02); arşiv satırı
  birincil seçimine katılmaz (INV-07); lifecycle audit kaydı aynı transaction'da (§49.4)
- **Red halinde korunacak:** yetkisizde `403 LIFECYCLE`, satır değişmez, audit yok. **Zaten
  arşivli** hedefte sabit hata döner — *idempotent başarı değildir*; durum ve audit değişmez
- **Kanıt:** `YEREL-İZOLE`

### H2-06 · Geri alma her zaman elevated; tekrarı sabit hata
- **İşlem:** `POST .../restore` (gövdede `makePrimary` olsun veya olmasın)
- **Dayanak:** `client-address.service.ts:692-715` (owner D02: `makePrimary`den **bağımsız**)
- **Aktör yetki bağı:** `isApproverEligible` zorunlu
- **Kapsam:** aktör tenant'ı = müvekkil tenant'ı
- **Başlangıç:** hedef adres `isCurrent=false`
- **Beklenen:** `200`; hedef `isCurrent=true`; `makePrimary=true` ise birincillik devri de
  gerçekleşir ve INV-03/INV-06 korunur
- **Red halinde korunacak:** yetkisizde `403 LIFECYCLE`. **Zaten güncel** hedefte
  `400 CLIENT_ADDRESS_ALREADY_CURRENT`; durum ve audit değişmez
- **Kanıt:** `YEREL-İZOLE`

### H2-07 · Fiziksel silme her zaman reddedilir ve arşive çevrilmez
- **İşlem:** `DELETE /clients/:clientId/addresses/:addressId`
- **Dayanak:** `client-address.service.ts:805-830` (owner §7, POL-E)
- **Aktör yetki bağı:** **yok** — yetki düzeyinden bağımsız olarak reddedilir (elevated aktör
  dahil)
- **Kapsam:** adres müvekkile ve tenant'a ait olmalı (aksi hâlde 404 sözleşmesi)
- **Başlangıç:** adres aktif **veya** arşivli — fark etmez
- **Beklenen:** `400` `{ code: 'CLIENT_ADDRESS_PHYSICAL_DELETE_NOT_AUTHORIZED',
  unsatisfiedPolicy: 'POL-E', archiveAction: 'POST .../archive' }`
- **Red halinde korunacak:** adres satırı **silinmez ve arşive de çevrilmez**; lifecycle audit
  kaydı **yazılmaz** (reddedilen istek yaşam döngüsünü değiştirmez)
- **Kanıt:** `YEREL-İZOLE`

### H2-08 · Okuma sözleşmesi ve kapsam dışı 404
- **İşlem:** `GET /clients/:clientId/addresses?status=active|archived|all`
- **Dayanak:** `client-address.service.ts:222-233` (charter §49.7 / ARC-07-D06)
- **Aktör yetki bağı:** staff JWT; **portal ekspozürü YOK** (bu metot portal'dan çağrılmaz)
- **Kapsam:** müvekkil **önce** tenant sınırında çözülür; adres sorgusu ayrıca
  `client: { tenantId }` ile kapsanır (bilerek yedekli)
- **Başlangıç:** müvekkilde en az bir aktif ve bir arşivli adres
- **Beklenen:** `active` → yalnız `isCurrent=true`; `archived` → yalnız `isCurrent=false`;
  `all` → ikisi
- **Red halinde korunacak:** başka tenant'ın müvekkil id'si ile `404` — **boş liste değil**
  (varlık sızdırmamak için "tenant dışı" ile "hiç adresi yok" ayırt edilemez olmalı)
- **Kanıt:** `YEREL-İZOLE`

### H2-09 · Invariant ihlali geçersiz ara durumu COMMIT etmez
- **İşlem:** yaşam döngüsü invariant'ını bozacak bir mutasyon (ör. iki birincil üretecek istek)
- **Dayanak:** `client-address.service.ts:196-210` · `client-address-lifecycle.ts:16-24`
  (INV-01…INV-08)
- **Aktör yetki bağı:** ilgili işlemin kendi eşiği (bu ölçüt eşiği değil, **atomikliği** ölçer)
- **Kapsam:** tek müvekkil; INV-08 gereği başka müvekkilin satırı hesaba katılmaz
- **Başlangıç:** geçerli bir adres kümesi
- **Beklenen:** `400` `{ code: 'CLIENT_ADDRESS_LIFECYCLE_VIOLATION', violation, invariant }`
- **Red halinde korunacak:** transaction **rollback**; adres kümesi işlem öncesi hâliyle
  **alan düzeyinde birebir aynı**; kısmi yazma yok
- **Kanıt:** `YEREL-İZOLE`

### H2-10 · İletişim kişileri: ayrı CRUD yoktur, tam değiştirme vardır
- **İşlem:** `PUT /clients/:id` gövdesinde `contacts` dizisi
- **Dayanak:** `client.service.ts:1895` (`clientContact.deleteMany`) → `1921`
  (`createMany`) — **ayrı `POST/PUT/DELETE /contacts` ucu YOKTUR**
- **Aktör yetki bağı:** `contacts` alan sınıfı **STANDARD**'dır
  (`client-mutation-policy.ts:84-104`); VIEWER reddedilir, elevated gerekmez
- **Kapsam:** aktör tenant'ı = müvekkil tenant'ı (`ClientContact` kendi `tenantId`'sini
  taşımaz; kapsam `client.tenantId` üzerinden kurulur)
- **Başlangıç:** müvekkilde N adet iletişim kaydı
- **Beklenen:** istek gövdesindeki dizi **yeni tam küme** olur; gönderilmeyen kayıtlar **silinir**
- **Red halinde korunacak:** VIEWER isteğinde mevcut kayıtların tamamı korunur
- **Kanıt:** `YEREL-İZOLE`

> **İ3 için uyarı — kabul değil, ölçüm tuzağı.** Bu yüzey *tam değiştirme* olduğu için
> "N kayıt vardı, N kayıt var" gözlemi **içeriğin korunduğunu kanıtlamaz**: eski kayıtlar
> silinip yenileri yazılmış olabilir. Karşılaştırma **kayıt kimliği + alan düzeyinde**
> yapılmalıdır. Kısmi (allowlist) bir projeksiyonun ardından tam form POST'u yapan bir
> istemci veri kaybettirebilir; bu risk ölçütün konusudur, davranış değişikliği önerisi değildir.

---

## 3. H4 — Talimat, beyan, rıza ve KVKK

### 3.0 Dört ayrı mekanizma — eşikleri birbirine genellenmez

| # | Mekanizma | Yüzey | Kararı veren | Eşik |
|---|---|---|---|---|
| 1 | **Rıza (consent)** | `clients/:id/consents` | personel (müvekkil adına kayıt) | rol tabanlı yazma kapısı |
| 2 | **Müvekkil onay defteri** | `client-approvals/*` | **kaynak müvekkil, kaydı personel** | staff JWT |
| 3 | **Büro (ofis) onayı** | `.../request\|complete-office-approval` | ofis onaylayıcısı | self-approval yasak |
| 4 | **İçerik onayı** | `.../request\|complete-content-approval` | içerik onaylayıcısı | self-approval yasak **+ four-eyes: ofis onaylayıcısı olamaz** |

**Sonuç:** finansal beyan zinciri **üç ayrı gerçek kişi** ister (talep eden · ofis onaylayıcı ·
içerik onaylayıcı). Bu üç rol tek ölçütte birleştirilemez.

### H4-01 · Rıza gerektiren faaliyet rızasız yazılamaz
- **İşlem:** `POST /clients` veya `PUT /clients/:id` gövdesinde `sendBirthdayGreeting`,
  `sendAnniversaryGreeting`, `sendHolidayGreeting`, `greetingChannel` alanlarından biri
- **Dayanak:** `client-processing-basis.registry.ts:105-107`
  (`GREETING_AND_OPTIONAL_COMMUNICATION` → `requiresExplicitConsent: true`; diğer **sekiz**
  faaliyet `false`) · `client.service.ts:1473,1733`
  (`assertClientConsentGateForWrite`) · `client-consent.service.ts:133-140`
- **Aktör yetki bağı:** alan sınıfı STANDARD; **rıza kapısı yetkiden bağımsızdır** — elevated
  aktör de rızasız yazamaz
- **Kapsam:** tenant + müvekkil
- **Başlangıç:** müvekkilde `GREETING_AND_OPTIONAL_COMMUNICATION` için aktif (`GRANTED`,
  `revokedAt=null`) rıza **YOK**
- **Beklenen:** `403`; ilgili bayrak yazılmaz
- **Red halinde korunacak:** müvekkil kaydının **tamamı** (aynı istekteki diğer alanlar dahil)
  değişmez — rıza kapısı yazma öncesi çalışır
- **Kanıt:** `YEREL-İZOLE`

### H4-02 · Rıza verme tarihçeyi korur ve audit'i aynı transaction'da yazar
- **İşlem:** `POST /clients/:id/consents`
- **Dayanak:** `client-consent.service.ts:146-198`
- **Aktör yetki bağı:** staff JWT; rıza **müvekkil adına personel tarafından kaydedilir**
  (müvekkil doğrudan çağırmaz)
- **Kapsam:** tenant + müvekkil + faaliyet
- **Başlangıç:** ilgili faaliyette aktif rıza yok
- **Beklenen:** `201`; **yeni satır** açılır (mevcut satır güncellenmez → tarihçe korunur);
  audit kaydı **aynı transaction'da**; ardından H4-01'deki yazma başarılı olur
- **Red halinde korunacak:** `requiresExplicitConsent=false` bir faaliyet için GRANT
  denenirse işlem geçersizdir; mevcut rıza satırları değişmez
- **Kanıt:** `YEREL-İZOLE`

### H4-03 · Rıza geri alma bayrak yazımını yeniden kapatır
- **İşlem:** `POST /clients/:id/consents/revoke`
- **Dayanak:** `client-consent.service.ts:199-245`
- **Aktör yetki bağı:** staff JWT; `revokedByUserId` aktörden yazılır
- **Kapsam:** tenant + müvekkil + faaliyet
- **Başlangıç:** aktif `GRANTED` rıza var
- **Beklenen:** `200`; satırda `revokedAt` dolar ve `revokedByUserId` aktör olur; **satır
  silinmez** (tarihçe korunur); sonrasında H4-01 yazması yeniden `403` verir
- **Red halinde korunacak:** aktif rıza yokken revoke denemesinde mevcut satırlar değişmez
- **Kanıt:** `YEREL-İZOLE`

### H4-04 · Müvekkil onay defteri: kaynak müvekkil, kaydı personel, içerik değişmez
- **İşlem:** `POST /client-approvals/case/:caseId` → `:id/send` → `:id/decision`
- **Dayanak:** `client-approval.controller.ts:17-53` · `client-approval.service.ts:55-175`
- **Aktör yetki bağı:** **tamamı staff JWT'dir.** `:id/decision` müvekkilin kendi API çağrısı
  **DEĞİLDİR**; kararın *kaynağı* müvekkil, *kaydı* personeldir ve sistemde aktör
  `req.user.id` olarak personeldir
- **Kapsam:** `tenantId`/`userId` daima `CurrentUser`'dan; gövdeden alınmaz
- **Başlangıç:** dosya (case) mevcut
- **Beklenen:** `DRAFT → SENT → APPROVED|REJECTED` geçişleri; ayrıca `CANCELLED` (DRAFT|SENT'ten)
  ve `EXPIRED`. Kayıt **immutable**: içerik için `PATCH/PUT/DELETE` ucu yoktur
- **Red halinde korunacak:** geçersiz durum geçişinde kayıt ve durum değişmez
- **Kanıt:** `YEREL-İZOLE`

> **İ3 için:** bu ölçüt "müvekkil sisteme girdi" iddiasını **kanıtlamaz ve kanıtlamamalıdır**.
> Müvekkilin iradesinin dış kanıtı (imza, e-posta, tutanak) bu API'nin konusu değildir.

### H4-05 · Onay maili best-effort'tur; başarısızlığı durumu değiştirmez
- **İşlem:** `:id/send` ve `:id/decision` sonrası tetiklenen bildirim
- **Dayanak:** `client-approval.service.ts:123,145,216-263` (try/catch içinde; `logger.warn`)
- **Aktör yetki bağı:** —
- **Kapsam:** tenant + onay kaydı
- **Başlangıç:** durum geçişi COMMIT edilmiş
- **Beklenen:** mail gönderilemese bile **commit'li durum değişmez** ve uç **throw etmez**;
  gönderim yolu §5'teki **Yol A**'dır (dispatcher → `ClientNotificationService.sendEmail`)
- **Red halinde korunacak:** sağlayıcı hatasında onay kaydı ve durumu aynen kalır
- **Kanıt:** `YEREL-İZOLE` (yerel yakalama + sağlayıcı hata modu)

### H4-06 · Büro onayı: talep eden kendi onaylayamaz, onaylayan eligible olmalı
- **İşlem:** `POST /client-financial-disclosures/:disclosureVersionId/request-office-approval`
  → `.../complete-office-approval`
- **Dayanak:** `client-financial-disclosure-approval.service.ts:137,244,311-318`
  (§41.2 KARAR 2) · `318` `assertApproverEligible`
- **Aktör yetki bağı:** **iki koşul birlikte** — (a) onaylayan ≠ `request.requesterUserId`,
  (b) onaylayan `assertApproverEligible`'dan geçer. Biri sağlanıp diğeri sağlanmazsa onay olmaz
- **Kapsam:** aynı tenant; hedef `disclosureVersionId`
- **Başlangıç:** ofis onayı talep edilmiş; snapshot güncel
- **Beklenen (farklı ve eligible aktör):** onay tamamlanır; `officeApprovedById` onaylayan olur
- **Red halinde korunacak:** aynı aktör denerse
  `DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN`; eligible olmayan aktörde yetki hatası;
  **snapshot bayatsa** `DISCLOSURE_APPROVAL_STALE_SNAPSHOT`. Üç durumda da onay durumu,
  `officeApprovedById` ve sürüm **değişmez**
- **Kanıt:** `YEREL-İZOLE`

### H4-07 · İçerik onayı: four-eyes — üç ayrı kişi
- **İşlem:** `.../request-content-approval` → `.../complete-content-approval`
- **Dayanak:** `client-financial-disclosure-approval.service.ts:519,598,655-672`
  (§41.2 KARAR 2/4) · `672` `assertApproverEligible`
- **Aktör yetki bağı:** **üç koşul birlikte** —
  (a) `request.requesterUserId !== contentApproverUserId` (KARAR 2: *requester hiçbir aşamayı
  onaylayamaz*),
  (b) `version.officeApprovedById !== contentApproverUserId` (KARAR 4 four-eyes),
  (c) içerik onaylayıcısı `assertApproverEligible`'dan geçer.
  → talep eden · ofis onaylayıcı · içerik onaylayıcı = **üç ayrı gerçek kişi**
- **Kapsam:** aynı tenant; hedef sürüm
- **Başlangıç:** ofis onayı tamamlanmış, içerik onayı talep edilmiş
- **Beklenen (üçüncü kişi):** içerik onayı tamamlanır
- **Red halinde korunacak:** ofis onaylayıcısı denerse `DISCLOSURE_APPROVAL_FOUR_EYES_VIOLATION`;
  talep eden denerse `DISCLOSURE_APPROVAL_SELF_APPROVAL_FORBIDDEN`; **ofis onayından sonra
  finansal içerik değişmişse** `DISCLOSURE_APPROVAL_STALE_SNAPSHOT`
  (`readIntent(request.savedIntent)?.snapshotHash !== version.snapshotHash`). Üç durumda da
  onay durumu, sürüm ve snapshot **değişmez**
- **Kanıt:** `YEREL-İZOLE`

> **İ3 için:** `STALE_SNAPSHOT` bağımsız bir güvenlik kapısıdır — four-eyes ile aynı ölçütte
> birleştirilirse, içerik değişikliğinin onayı geçersiz kıldığı ayrıca kanıtlanmamış olur.

### H4-08 · Yayın yalnız onaylı sağlayıcıya çıkar
- **İşlem:** `POST /client-financial-disclosures/:disclosureVersionId/publish`
- **Dayanak:** `client-financial-disclosure-publication.contract.ts:21`
  (`['smtp','sendgrid','ses']`) · `email-provider.service.ts:79-86`
  (`providerName` senkron okuma; charter §35.10 — **provider'a tek byte gitmeden önce**
  allowlist kontrolü)
- **Aktör yetki bağı:** ofis + içerik onayı tamamlanmış olmalı (H4-06, H4-07)
- **Kapsam:** tenant + sürüm
- **Başlangıç:** her iki onay tamam
- **Beklenen:** yapılandırılmış sağlayıcı allowlist'te ise yayın ilerler
- **Red halinde korunacak:** allowlist dışı sağlayıcıda (**varsayılan `mock` dahil**) yayın
  başlamaz; sürüm `PUBLISHED` olmaz; hiçbir bayt sağlayıcıya gitmez
- **Kanıt:** `YEREL-İZOLE` (allowlist reddi) · `CANLI-YETKİ` (gerçek yayın olgusu)

---

## 4. Geçmiş kanıtla karşılanan davranış — yeniden test **işi değildir**

Aşağıdakiler için İ3'te yeni koşum planlanmaz; kanıt mevcut kayıttır.

| Davranış | Mevcut kanıt | Sınıf | Neden yeniden test edilmez |
|---|---|---|---|
| `ClientAddress.isCurrent` şemasının canlıda bulunması | `C2_ARC07_LIVE` (K-A) | **HALEN-Ş** | Migration 129↔129 birebir; şema kalemi. **Davranış** ölçütleri (H2-01…H2-10) bundan ayrıdır |
| KVKK işleme dayanağı anahtarının varlığı | `K7_KEY_PRESENT` | **HALEN-Y** | `.env` ölçümü; değer okunmadı, okunmamalı |
| FD v1 tekil yayın olgusu + kalıcı `providerMessageId` | K-B | **HALEN-K** | Tarihsel olgu; kaydı değişmedi |
| Dört-göz ilkesinin *tasarımı* | K-B four-eyes | — | Tasarım korunuyor; ancak `office-approval` modülü OFFICE-WR01/C26 ile **değişti** → H4-06/H4-07 **yeni kanıt ister** (aşağıda) |

**Yeni veya değişmiş olduğu için ek kanıt gereken davranışlar:**

| Ölçüt | Neden yeni kanıt gerekiyor |
|---|---|
| H2-01…H2-10 | R02'de H2 için **davranış ölçütü hiç yazılmamıştı**; şema aktivasyonu davranış kabulü değildir |
| H4-01…H4-03 | Rıza/KVKK davranış ölçütü yoktu; `K7_ACCESS_GATE` R02'de `DOĞRULANAMADI` idi — **bu belge dosya bağını kurar** (§3, `client-consent.service.ts` + `client-processing-basis.registry.ts`) |
| H4-06, H4-07 | `office-approval` modülü kabul sonrası değişti (`DOĞRULANAMADI`); eşiğin bugün de geçerli olduğu ölçülmeli |
| H5-01…H5-06 | H5 yüzeyi `#2521/#2525/#2528` ile geldi; **kabul yok** |
| H7-00…H7-05 | H7 için kabul bulunamadı; **İ4 kapsam kararına bağlı** |

---

## 5. Gönderim yolları — İ1a provası hepsine geçerli DEĞİLDİR

Üç çağrı zinciri vardır ve **sağlayıcı ayarının kaynağı ikiye ayrılır**:

| Yol | Çağrı zinciri | Sağlayıcı ayarının kaynağı | İ1a kapsamı |
|---|---|---|---|
| **A** | `client-notifications/send-email` → `ClientNotificationService.sendEmail` → `officeService.getFullSmtpSettings(tenantId)` → `nodemailer.createTransport` | **Tenant `Office` satırı** (`office.service.ts:455-465`) | **ÖLÇÜLDÜ** (İ1a M-0…M-7) |
| **A′** | `NotificationDispatcherService.dispatch` → `clientNotification.sendEmail` (`notification-dispatcher.service.ts:108,126,213`) → Yol A'nın taşıması | Aynı — tenant `Office` satırı | Taşıma **aynı**; ancak claim/dedupe/reclaim mantığı **ayrı kabul ister** |
| **B** | `ClientInfoRequest` → `EmailProviderService.send` (`address-discovery/client-info-request.service.ts:3`) → `sendViaSmtp\|SendGrid\|Ses\|Mock` | **Süreç-genel ENV**: `EMAIL_PROVIDER`, `SMTP_HOST/PORT/USER/PASS`, `EMAIL_FROM` (`email-provider.service.ts:72-75,198-206`); **varsayılan `mock`** | **ÖLÇÜLMEDİ** |

**Bağlayıcı sonuç.** İ1a'nın SMTP izolasyon provası **Yol A**'yı kanıtlar. **Yol B tenant
`Office` satırını hiç okumaz**; İ1a'nın `Office`'e yazdığı yerel hedef Yol B'yi etkilemez.
Bu yüzden:

- **H5-01** (bilgi talebi gönderimi) için İ1a provası **geçerli sayılamaz**; Yol B'nin kendi
  izolasyon kanıtı gerekir (env tabanlı; `mock` varsayılanı gerçek gönderim yapmaz, ancak
  bunun **ölçülmesi** gerekir — varsayım kanıt değildir).
- **Aylık ekstre teslimi** (`client-statement.service.ts:447` → dispatcher) taşıma olarak Yol
  A′'dır; taşıma izolasyonu İ1a ile karşılanır, **teslim zincirinin kendisi** (alıcı çözümü,
  dedupe, SENT/PUBLISHED audit ayrımı) İ12'nin konusudur ve bu belgenin kapsamı dışındadır.

---

## 6. H5 — Bilgi/belge toplama: bağlantı → inceleme → aktarım

### 6.0 Yüzey ve eşik haritası

| Rota | Modül | Eşik |
|---|---|---|
| `POST /client-intake-links/case/:caseId` | link | staff JWT |
| `POST /client-intake-links/:id/revoke` | link | staff JWT |
| `GET /public/intake/:token` · `POST /public/intake/:token` | public | **kimlik yok**, `PublicIntakeRateLimitGuard` |
| `GET /client-intake-submissions[/:id]` | review | staff JWT |
| `POST /client-intake-submissions/:id/claim` · `/reject` · `/fields/bulk-review` | review | staff JWT |
| `POST /client-intake-fields/:fieldId/review` | review | staff JWT |
| `POST /client-intake-submissions/:id/promote` | promotion | **`isApproverEligible`** |
| `POST /client-intake-fields/:fieldId/promote-address` · `/promote-soft` | promotion | **`isApproverEligible`** |

### H5-01 · Bilgi talebi gönderimi Yol B'yi kullanır
- **İşlem:** `ClientInfoRequest` gönderimi
- **Dayanak:** `address-discovery/client-info-request.service.ts:3,286` ·
  `notification/email-provider.service.ts:72-75`
- **Aktör yetki bağı:** staff JWT
- **Kapsam:** tenant + müvekkil
- **Başlangıç:** gönderilecek talep hazır
- **Beklenen:** sağlayıcı sonucu `success:true|false` olarak sınıflandırılır; **sağlayıcı
  istisnası yakalanıp `success:false`'a çevrilir** (bir SendGrid timeout'u ile kalıcı hata
  aynı sonuca düşer — bu bilinen bir sınıflandırma sınırıdır)
- **Red halinde korunacak:** gönderim başarısızsa talep kaydı tutarlı kalır
- **Kanıt:** `YEREL-İZOLE` — **İ1a provası bu yol için geçerli değildir (§5)**; env tabanlı
  izolasyon ayrıca kurulmalıdır

### H5-02 · Güvenli bağlantı üretimi: ham token yalnız oluşturma yanıtında
- **İşlem:** `POST /client-intake-links/case/:caseId`
- **Dayanak:** `client-intake-link.controller.ts:21-23` ("rawToken yalnız create yanıtında;
  public submit YOK (4.4)")
- **Aktör yetki bağı:** staff JWT
- **Kapsam:** tenant + dosya
- **Başlangıç:** dosya mevcut
- **Beklenen:** `201`; yanıt ham token içerir; **sonraki hiçbir okuma ucu ham token
  döndürmez** (`GET :id`, `GET case/:caseId` dahil)
- **Red halinde korunacak:** —
- **Kanıt:** `YEREL-İZOLE`

### H5-03 · Bağlantı iptali sonraki kullanımı kapatır
- **İşlem:** `POST /client-intake-links/:id/revoke`, ardından `GET /public/intake/:token`
- **Dayanak:** `client-intake-link.controller.ts:76`
- **Aktör yetki bağı:** staff JWT (iptal) · kimlik yok (public okuma)
- **Kapsam:** tenant + bağlantı
- **Başlangıç:** bağlantı aktif
- **Beklenen:** iptal `200`; ardından public uç bağlantıyı **kullanılamaz** sayar
- **Red halinde korunacak:** iptal edilmiş bağlantı üzerinden gelen public gönderim kalıcı
  kayıt **oluşturmaz**
- **Kanıt:** `YEREL-İZOLE`

### H5-04 · Public uç veri toplar, ana kayda aktarmaz
- **İşlem:** `POST /public/intake/:token`
- **Dayanak:** `client-intake-public.controller.ts:16-30` ·
  `client-intake-promotion.controller.ts:15` ("Public uç promote ETMEZ")
- **Aktör yetki bağı:** **kimlik yok**; `PublicIntakeRateLimitGuard` + IP çözümü
  (`resolvePublicIntakeClientIp`)
- **Kapsam:** yalnız token'ın bağlı olduğu dosya/müvekkil
- **Başlangıç:** geçerli, iptal edilmemiş bağlantı
- **Beklenen:** gönderim `submission` olarak kaydedilir; alanlar `reviewStatus` **beklemede**
  başlar; **`ClientIntelStatement` veya kanonik adres kaydı OLUŞMAZ**
- **Red halinde korunacak:** hız sınırı aşımında kayıt oluşmaz; **429 bir "gönderim yok"
  kanıtı değildir** — ölçüm o koşumda `ÖLÇÜLEMEDİ`dir
- **Kanıt:** `YEREL-İZOLE`

### H5-05 · İnceleme (review) ek eşik istemez
- **İşlem:** `POST /client-intake-submissions/:id/claim`, `/fields/bulk-review`,
  `POST /client-intake-fields/:fieldId/review`, `/reject`
- **Dayanak:** `client-intake-review.service.ts:108,127,151,174` — **`isApproverEligible`
  çağrısı YOKTUR**
- **Aktör yetki bağı:** staff JWT yeterli; elevated **gerekmez**
- **Kapsam:** tenant + submission
- **Başlangıç:** submission incelenmemiş
- **Beklenen:** alanlar `APPROVED`/`REJECTED` işaretlenir; **kanonik kayıtta hiçbir değişiklik
  olmaz** (inceleme aktarım değildir)
- **Red halinde korunacak:** başka tenant'ın submission'ında işlem yapılamaz
- **Kanıt:** `YEREL-İZOLE`

### H5-06 · Aktarım (promote) elevated ister ve yalnız onaylı alanı taşır
- **İşlem:** `POST /client-intake-submissions/:id/promote` ·
  `POST /client-intake-fields/:fieldId/promote-address` · `/promote-soft`
- **Dayanak:** `client-intake-promotion.service.ts:87-89,114,242,245,336,343`
  (`assertCanManagePromotion` → `isApproverEligible`) · idempotency `63,136-138` ·
  kısmi sonuç `66,177-182` (F46-K4)
- **Aktör yetki bağı:** `isApproverEligible(userId, tenantId) === true` (PARTNER veya onay
  yetkisi verilmiş avukat). **Bu, H5-05'ten farklı bir eşiktir ve genellenmemelidir.**
- **Kapsam:** tenant + submission/alan
- **Başlangıç:** alan `reviewStatus=APPROVED`, `promotedRefId=null`
- **Beklenen:** yalnız `APPROVED` alanlar taşınır; **idempotent** (`promotedRefId` dolu alan
  tekrar yazılmaz); taşınmayan `APPROVED` alanlar **sessizce kaybolmaz** → submission
  `PARTIALLY_PROMOTED` + `skipped[]`; hepsi taşındıysa `COMPLETED`
- **Red halinde korunacak:** elevated olmayan aktörde `403`; **kanonik kayıtta (adres /
  `ClientIntelStatement`) hiçbir satır oluşmaz veya değişmez**. `APPROVED` olmayan alanda
  `400` ("Yalnız onaylı (APPROVED) alan promote edilir"); alan ve kanonik kayıt değişmez
- **Kanıt:** `YEREL-İZOLE`

---

## 7. H7 — Portal (İ4 kapsam kararına bağlı)

> Bu ölçütlerin yazılmış olması **İ4'ün "DAHİL" dediği anlamına gelmez** ve hiçbir portal
> hesabını aktifleştirmez. İ4 "HARİÇ" derse bu bölüm koşulmaz.

Yüzey (`portal.controller.ts:64-362`): `login`, `forgot-password`, `reset-password`
(hız sınırlı, kimliksiz) · `cases`, `cases/:id`, `financial-disclosures[/history|/:id]`,
`poas`, `notifications*`, `documents*`, `change-password` (`PortalAuthGuard`) ·
`admin/create-user`, `admin/disable-user` (staff `JwtAuthGuard` **+ servis sınırında
`isApproverEligible`** — rol tek başına yetmez, bkz. H7-00/H7-04).

### H7-01 · Portal oturumu yalnız kendi müvekkil kapsamını görür
- **İşlem:** `GET /portal/cases`, `/financial-disclosures`, `/poas`, `/documents`,
  `/notifications`
- **Dayanak:** `portal-auth.guard.ts:46-76` — `request.portalUser` **yalnız veritabanıyla
  doğrulanmış** kimlikten yazılır; ham JWT claim'i downstream authority olarak bırakılmaz
- **Aktör yetki bağı:** `ClientPortalUser` (`isActive=true`, `tokenVersion` eşleşir)
- **Kapsam:** yalnız `portalUser.clientId` ve o müvekkilin `tenantId`'si
- **Başlangıç:** portal kullanıcısı aktif; müvekkilinde en az bir dosya/belge
- **Beklenen:** yalnız kendi müvekkiline ait kayıtlar döner
- **Red halinde korunacak:** —
- **Kanıt:** `CANLI-YETKİ` veya `YEREL-İZOLE` (İ4 sonrası; portal kullanıcısı oluşturmak
  gerektiğinden İ1a altyapısına portal aktörü eklenmelidir — İ3'ün kapsamı)

### H7-02 · Başka müvekkile/tenant'a erişim reddedilir
- **İşlem:** portal token'ı ile başka müvekkilin `cases/:id` / `documents/:id` kimliği
- **Dayanak:** `portal-auth.guard.ts:61-63` (`portalUser.clientId !== payload.clientId` veya
  `client.tenantId !== payload.tenantId` → red)
- **Aktör yetki bağı:** portal token
- **Kapsam:** çapraz müvekkil ve çapraz tenant
- **Başlangıç:** iki ayrı müvekkil (gerekirse iki tenant) — **karşı kayıtlar yalnız izole
  ortamda kurulur**
- **Beklenen:** erişim reddedilir; kayıt içeriği sızmaz
- **Red halinde korunacak:** hedef kayıt okunmaz, değişmez; yanıt varlık/yokluk ayrımı
  sızdırmaz
- **Kanıt:** `YEREL-İZOLE`

### H7-03 · Personel token'ı portal uçlarında geçerli değildir
- **İşlem:** staff JWT ile `GET /portal/cases`
- **Dayanak:** `portal-auth.guard.ts:36-38` (`payload.type !== 'portal'` → red)
- **Aktör yetki bağı:** staff JWT (portal tipinde değil)
- **Kapsam:** —
- **Başlangıç:** geçerli staff oturumu
- **Beklenen:** `401`
- **Red halinde korunacak:** portal verisi dönmez
- **Kanıt:** `YEREL-İZOLE`

### H7-00 · Portal erişimi açmak elevated ister
- **İşlem:** `POST /portal/admin/create-user`
- **Dayanak:** `portal.controller.ts:202-215` · `portal.service.ts:213-219,242`
  (`assertCanManagePortalAccess` → `isApproverEligible`) · e-posta çakışma guard'ı `244-246`
- **Aktör yetki bağı:** staff JWT **yetmez** — `isApproverEligible(userId, tenantId)` zorunlu
  (PARTNER veya onay yetkisi verilmiş avukat)
- **Kapsam:** aktör tenant'ı = müvekkil tenant'ı
- **Başlangıç:** müvekkilin portal kullanıcısı yok
- **Beklenen (elevated):** portal kullanıcısı oluşur; H7-01 koşulabilir hâle gelir
- **Red halinde korunacak:** elevated olmayan staff aktörde `403`; portal kullanıcısı
  **oluşmaz**, `hasPortalAccess` değişmez. Başka **aktif** kullanıcı aynı e-postadaysa `409`
  (login e-postası global çalıştığından çakışma güvenlik riskidir)
- **Kanıt:** `YEREL-İZOLE`

### H7-04 · Erişim sonlandırma sonraki isteği keser
- **İşlem:** `POST /portal/admin/disable-user`, ardından **önceden alınmış** portal token'ıyla
  korumalı bir uç
- **Dayanak:** `portal.controller.ts:221-228` · `portal.service.ts:656-682` ·
  `portal-auth.guard.ts:57-67` (`isActive` **ve** `tokenVersion` DB'den doğrulanır)
- **Aktör yetki bağı:** staff JWT **yetmez** — `assertCanManagePortalAccess` →
  `isApproverEligible` zorunlu (`portal.service.ts:666`, "yetkisiz aktör hiçbir yazma yapmaz —
  mutasyondan/audit'ten ÖNCE"). Portal kullanıcısı kendini kapatamaz
- **Kapsam:** tenant + müvekkil
- **Başlangıç:** portal kullanıcısı aktif ve elinde geçerli token var
- **Beklenen:** `200`; **tek transaction içinde** `ClientPortalUser.isActive=false` **ve**
  `tokenVersion` +1 **ve** `Client.hasPortalAccess` kapatılır **ve** audit yazılır
  (`portal.service.ts:669-682`). Önceden alınmış token bir sonraki istekte reddedilir —
  `isActive` ve stale `tokenVersion` **bağımsız olarak** kapsar
- **Red halinde korunacak:** elevated olmayan aktörde `403` ve **hiçbir yazma yapılmaz**
  (audit dahil). Sonlandırma başarılı olduğunda müvekkilin kalıcı verisi (dosya, belge, beyan)
  **silinmez** — erişim kapanır, kayıt kalır
- **Kanıt:** `YEREL-İZOLE`

> İ1a'da `User` için ölçülen üç kanıtın (V-1 eski token reddi · V-2 yeni giriş reddi · V-3
> kalıcı durum) **portal karşılığı** budur. İ1a'nın `User` sonlandırma provası
> `ClientPortalUser` için geçerli değildir: ayrı tablo, ayrı guard, ayrı uç.

### H7-05 · Ret nedenleri ayırt edilemez
- **İşlem:** geçersiz token'ın dört farklı nedeni (devre dışı · eski `tokenVersion` ·
  bulunamayan kullanıcı · DB hatası)
- **Dayanak:** `portal-auth.guard.ts:20-25` (tüm ret nedenleri **kasıtlı olarak aynı genel
  mesaja** düşer)
- **Aktör yetki bağı:** —
- **Kapsam:** —
- **Başlangıç:** dört senaryo ayrı ayrı kurulur
- **Beklenen:** dördünde de **aynı** durum kodu ve **aynı** mesaj
- **Red halinde korunacak:** hesabın varlığı/durumu yanıttan çıkarılamaz
- **Kanıt:** `YEREL-İZOLE`

---

## 8. Karar bekleyen ölçütler

| Kimlik | Ne bekliyor | Hangi kabulü engelliyor | Somut seçenekler | Öneri |
|---|---|---|---|---|
| **KB-01** | **İ4 kapsam kararı**: portal teslime dahil mi? | H7-00…H7-05'in tamamı → **H7 kabulü** | (a) DAHİL → İ16 açılır, H7 ölçütleri koşulur (b) HARİÇ → H7 kabulü aranmaz, teslim vaadi metninden portal çıkarılır | Owner kararı; teknik öneri yok — kapsam ticari/hukuki tercihtir |
| **KB-02** | **Yol B izolasyon yöntemi**: `ClientInfoRequest` env tabanlı sağlayıcı ile nasıl izole edilecek? | **H5-01** → H5 kabulünün gönderim ayağı | (a) `EMAIL_PROVIDER=smtp` + yerel yakalamaya yönlendirilmiş `SMTP_HOST` (b) `EMAIL_PROVIDER=mock` bırakıp yalnız "gerçek gönderim yok"u ölçmek | **(a)** — `mock` gerçek taşımayı hiç çalıştırmaz, bu yüzden "sağlayıcı hatası dış gönderime dönüşmez" iddiasını kanıtlamaz |
| **KB-03** | **H2-10'un ürün karşılığı**: iletişim kişileri için ayrı CRUD ucu olmalı mı? | Hiçbir kabulü engellemez — ölçüt mevcut davranışa yazıldı | (a) Mevcut tam-değiştirme korunur, ölçüt bu hâliyle koşulur (b) Ayrı CRUD ucu eklenir → **yeni ürün işi** | **(a)** bu tur için; (b) ayrı bir iş olarak değerlendirilir, İ2 kapsamında değildir |

**KB-01 dışında hiçbir ölçüt karar beklemiyor.** KB-02 yalnız H5-01'in *yöntemini* etkiler,
ölçütün kendisini değil. KB-03 bir ürün sorusudur; ölçüt seti onsuz da eksiksizdir.

---

## 9. R02 bağı — hangi ölçüt hangi işe gider

| Hizmet | Ölçütler | R02'deki iş | Not |
|---|---|---|---|
| H2 | H2-01…H2-10 | **İ13** | R02'de "davranış ölçütü İ2'de yazılır" denmişti → **yazıldı** |
| H4 | H4-01…H4-08 | **İ14** | R02'de "beyan/rıza/KVKK davranış ölçütü İ2'de yazılır" → **yazıldı**; `K7_ACCESS_GATE`'in dosya bağı kuruldu |
| H5 | H5-01…H5-06 | **İ11** | "review≠promote kapısı" H5-05/H5-06 olarak ayrıştırıldı |
| H7 | H7-00…H7-05 | **İ4** → DAHİL ise **İ16** | Ölçütler hazır; kapsam kararı **verilmedi** |

**Çift sayım yok.** Aynı davranış iki hizmet altında ayrı ölçüt olarak yazılmadı:

- Adres **aktarımı** (`promote-address`) H5-06'dadır, H2'de tekrarlanmaz — çünkü ölçülen şey
  aktarım yetkisidir, adres yaşam döngüsü değil. Aktarım sonucu oluşan adresin invariant'ları
  H2-09'un konusudur ve orada bir kez ölçülür.
- Rıza kapısı H4-01'dedir; `greeting*` alanları H2'nin "standart alan" örneği olarak
  geçmez.
- Finansal beyan yayını H4-08'de **allowlist reddi** olarak ölçülür; teslim zincirinin kendisi
  (dedupe, SENT/PUBLISHED audit) **İ12**'nindir ve burada tekrarlanmaz.

---

## 10. Sayım

| | |
|---|---|
| Toplam ölçüt | **30** (H2: 10 · H4: 8 · H5: 6 · H7: 6) |
| `YEREL-İZOLE` ile karşılanabilir | 29 |
| `CANLI-YETKİ` gerektiren | 1 kısmi (H4-08'in gerçek yayın ayağı) |
| Karar bekleyen | **1** (KB-01 → H7'nin 6 ölçütü) + 2 yöntem/ürün sorusu (KB-02, KB-03) |

Bu belge **kabul vermez**; ölçüt tanımlar. Hiçbir hizmetin kabul sayacı bu turda artmaz.

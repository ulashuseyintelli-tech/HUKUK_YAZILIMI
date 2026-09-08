# CLIENT KABUL DÜZENEKLERİ — İ3 / R01

**İş:** R02 ana planındaki **İ3** — kabul düzeneklerinin hazırlanması (YEREL/DISPOSABLE)
**Durum:** **KESİN KAPSAM TAMAM** — H2/H4/H5'in **24 hizmet ölçütünün tamamı** koşuldu ve PASS.
H7'nin 6 ölçütü **koşullu** kapsamdadır (İ4 kararı → İ16) ve koşulmadı.
**Türetildiği main:** `105e31a7`
**Prova — iki sağlayıcı senaryosu:**
- **A (`smtp`, onaylı):** `PASS 34 · FAIL 0 · ÖLÇÜLEMEYEN 6` (40 koşum satırı)
- **B (`mock`, allowlist DIŞI):** `PASS 30 · FAIL 0` — H4-08'in ret dalı; **gerçek `dispatcher.send` 0→0**
- **C (`mock --bypass-allowlist`, NEGATİF PROVA):** H4-08N `PASS` — allowlist kaldırılınca **gerçek send 0→1**, **SMTP bağlantısı 1→1**
- **D (eksik yapılandırma, NEGATİF PROVA):** ön koşul reddetti, **gönderim çağrısı 0**
- **Düzeneğin kendi negatif kontrolleri:** `PASS 8 · FAIL 0` — dördü **mutasyon kanıtlı**

> **Sayım notu.** 40 koşum satırı 24 hizmet ölçütüne karşılık gelir: bazı ölçütler birden çok
> senaryoya ayrılmıştır (H4-06→06a/06b · H4-07→07a/07b/**07c** · H5-01→01/01b · H5-02→02a/02b ·
> H5-05→05/05b · H5-06→06/**06b**) ve üç satır **yardımcı kontroldür** (`I3-00` ölçüm geçerliliği ·
> `H5-00` taşıma bağı · `I3-V` erişim sonlandırma). **Yardımcı kontroller ve düzeneğin kendi
> negatif kontrolleri (NC-1…NC-7) hizmet ölçütü sayısına EKLENMEZ ve yeni plan maddesi
> SAYILMAZ.**

---

## 1. Bu paket ne yapar

İ2 ölçüt setini (`client-acceptance-criteria-i2-r01/`) **çalıştırılabilir düzeneklere** çevirir.
İzolasyon, ortam kapıları ve erişim sonlandırma İ1a altyapısından **devralınır**; ikinci bir
izolasyon mekanizması kurulmaz.

**Yerel PASS canlı kabul DEĞİLDİR.** Bu koşum, ölçütlerin *ölçülebilir* olduğunu ve mevcut kodun
disposable ortamda beklenen davranışı gösterdiğini kanıtlar. Hiçbir hizmetin kabul sayacı bu
turda artmaz.

### Bağlayıcı ölçüm kuralları

| Kural | Uygulaması |
|---|---|
| **Ölçülemeyen sonuç PASS olmaz** | Üç değer: `PASS` · `FAIL` · `UNMEASURED`. Belirsiz HTTP veya kurulamayan ön koşul → UNMEASURED |
| **HTTP kodu tek başına yeterli değil** | Her ölçüt kalıcı durumu işlem öncesi/sonrası `captureState` + alan düzeyinde karşılaştırır |
| **Sayım, içerik kanıtı değil** | Karşılaştırma kayıt **kimliği + alan** düzeyinde (`diffState`) |
| **Yetki rol adından çıkarılmaz** | `I3-00` her koşumda `user` ile `elev*`'in aynı rolde olduğunu doğrular |

Çıkış kodu: `0` tümü PASS · `2` en az bir FAIL · `3` FAIL yok ama ölçülemeyen var · `1` koşum hatası.

---

## 2. Aktörler — yetki bağları ürünün kendi mekanizmasından kurulur

| Aktör | Rol | Lawyer | StaffMember | `client.intake.review` grant |
|---|---|---|---|---|
| `viewer` | VIEWER | — | — | — |
| `user` | USER | — | — | — |
| `admin` | **ADMIN** | — | — | — |
| `reviewer` | USER | — | **VAR** (OFIS_KATIBI) | **VAR** (GLOBAL ALLOW) |
| `elev1/2/3` | USER | **PARTNER** | — | — |

Bu tablo İ3'ün en önemli çıktısıdır: **üç ayrı ve birbirine indirgenemez yetki mekanizması**
vardır ve her biri farklı aktörle kanıtlanır.

| Mekanizma | Kaynağı | Kimde var |
|---|---|---|
| **Elevated** (`isApproverEligible`) | PARTNER lawyer + `staffMember` YOK | `elev1/2/3` |
| **Review** (`reviewAuthority`) | `PermissionGrant` GLOBAL `client.intake.review` ALLOW | `reviewer` |
| **Workspace/coarse** | rol (VIEWER fail-closed) | — |

`admin` bilerek vardır: ADMIN rolünün **tek başına** hiçbir kapıyı açmadığını gösterir.

---

## 3. Ölçüt → sonuç

### 3.1 H2 — Adres ve iletişim (10/10 PASS)

| Ölçüt | Ölçülen | Sonuç |
|---|---|---|
| H2-01 | VIEWER dört mutasyon ucunda da RED; kalıcı etki YOK | **PASS** |
| H2-02 | İlk adres otomatik birincil, elevated GEREKMEZ (D03) → `201` | **PASS** |
| H2-03 | Birincillik devri: USER RED (yazma yok), elevated İZİN; INV-03/06 korunur | **PASS** |
| H2-04 | Mevcut birincil kaydın alanı: USER RED, elevated İZİN → `200` | **PASS** |
| H2-05 | Arşivleme elevated; **tekrarı sabit hata** (idempotent başarı DEĞİL) → `201` | **PASS** |
| H2-06 | Geri alma elevated; tekrarı sabit hata → `201` | **PASS** |
| H2-07 | Fiziksel silme **elevated aktörde bile** RED; arşive çevrilmez, audit yok | **PASS** |
| H2-08 | `status` filtresi doğru ayırır; başka tenant müvekkili **`404`** (boş liste değil) | **PASS** |
| H2-09 | Invariant ihlali geçersiz ara durumu COMMIT etmez | **PASS** |
| H2-10 | İletişim: VIEWER RED (tamamı korunur); USER **tam değiştirme** yapar | **PASS** |

### 3.2 H4 — Talimat / beyan / rıza / KVKK (8/8 PASS)

| Ölçüt | Ölçülen | Sonuç |
|---|---|---|
| H4-01 | Rıza kapısı **yetkiden bağımsız** — elevated aktör de rızasız yazamaz; aynı istekteki standart alan da yazılmaz | **PASS** |
| H4-02 | Rıza **yeni satır** olarak yazılır (güncelleme değil) ve bayrak yazımını açar | **PASS** |
| H4-03 | Geri alma satırı **silmez** (`revokedAt` + `revokedByUserId`); yazma yeniden RED | **PASS** |
| H4-04 | Onay defteri aktörü **personeldir**; içerik `PUT`/`DELETE` ucu **yok** (`404`) | **PASS** |
| H4-05 | Sağlayıcı ulaşılamazken durum geçişi COMMIT kalır, uç throw etmez | **PASS** |
| H4-06a | Büro onayı: **talep eden kendi onaylayamaz** → `403` + `SELF_APPROVAL` + durum değişmez | **PASS** |
| H4-06b | Büro onayı: **eligible olmayan** (MUHASEBE personeli) onaylayamaz → `403` + durum değişmez | **PASS** |
| H4-07a | İçerik onayı: **four-eyes** — ofis onaylayıcısı `FOUR_EYES`, talep eden `SELF_APPROVAL` ile RED | **PASS** |
| H4-07c | **2. kapı** — saklanan `notificationContentHash` bozulur → **TAM** `DISCLOSURE_APPROVAL_CONTENT_HASH_MISMATCH`; `snapshotHash` ve ofis onayı korunur | **PASS** |
| H4-07b | **5. kapı** — `OfficeApprovalRequest.savedIntent.snapshotHash` bozulur → **2. kapı GEÇİLİR** ve **TAM** `DISCLOSURE_APPROVAL_STALE_SNAPSHOT`; onay damgaları korunur | **PASS** |
| H4-08 | **A:** onaylı (`smtp`) → yayın ilerler, gerçek send `0→1` · **B:** allowlist dışı (`mock`) → `403 PROVIDER_NOT_PRODUCTION`, `PUBLISHED` olmaz, kabul damgaları `null`, **gerçek `dispatcher.send` `0→0`** | **PASS** |
| H4-08N | **NEGATİF PROVA:** allowlist etkisizleştirilince gerçek send **`0→1`** (kabul kırılır), SMTP bağlantısı **`1→1`** | **PASS** |

**Ön koşul ürünün KENDİ yolundan kuruldu.** `Collection → CollectionDisposition
(DISTRIBUTION_APPROVED) → POST /collection-dispositions/:id/post → POSTED → POST
/collection-dispositions/:id/financial-disclosure → DRAFT sürüm`. Kurulum yalnız zincirin
**girdi kayıtlarını** yazar; sürümü ürün üretir. `snapshotHash`/`sourceFingerprint` **elle
yazılmadı** — taklit etmek uyuşmazlıkta yanlış bulgu üretirdi.

İki uzlaştırma kuralı ölçüm sırasında öğrenildi ve kuruluma yansıtıldı:
`client-financial-disclosure-canonical.ts:202-223` satır toplamının `totalCollected`'a eşit
olmasını **ve tam bir `CLIENT_PAYABLE` satırı** bulunmasını şart koşar.

**Aktivasyon bayrağı** (`CLIENT_FINANCIAL_DISCLOSURE_WRITE_ENABLED`) yalnız **prova sürecinin
kendi ortamındadır**; canlı flag değiştirilmemiştir.

### 3.3 H5 — Bilgi/belge toplama (6/6 PASS)

| Ölçüt | Ölçülen | Sonuç |
|---|---|---|
| H5-01 | **Üç sonuç ayrı**: kabul→kayıt · ret→`503`+kayıt/bildirim/**audit** YOK · belirsiz→`503`+kayıt YOK (= **A-9 + A-10**) | **PASS** |
| H5-01b | Belirsiz sonuçta **otomatik tekrar gönderim yok** — belirsiz POST çevresinde sağlayıcı konuşma farkı **= 1** | **PASS** |
| H5-02a | Bağımsız bağlantı: ham token yalnız oluşturma yanıtında, okuma ucunda yok | **PASS** |
| H5-02b | **Gerçek `attachIntakeLink` akışı**: bağlantı **taşıma gövdesinde VAR**, aynı işlemin `ClientInfoRequest` + `ClientNotification` + `AddressAuditLog` kayıtlarında **YOK** (= **A-5 + A-6**) | **PASS** |
| H5-03 | İptal öncesi açık, sonrası kapalı (`status=REVOKED`); iptalli bağlantıdan **bu linke bağlı** submission oluşmaz | **PASS** |
| H5-04 | Public gönderim kaydedilir; **`DebtorAddress`** ve `ClientIntelStatement` **alan düzeyinde** değişmez | **PASS** |
| H5-05 | İnceleme: geçerli profilli USER/ADMIN/PARTNER **RED**; yalnız `client.intake.review` grant'ı izin verir | **PASS** |
| H5-05b | Profil reddi ile grant reddi **aynı dış kodu** taşır (iç neden sızmaz) → profilsiz 403 grant kanıtı **sayılamaz** | **PASS** |
| H5-06 | Aktarım: inceleyen aktör ve ADMIN RED → **hedefte satır ve audit oluşmaz**; PARTNER izin → **tam bir `DebtorAddress`** + `promotedRefType` damgası + **bir** aktarım audit'i | **PASS** |
| H5-06b | **Tekrar sözleşmesi**: `400` "zaten promote edilmiş" — yeni `DebtorAddress` yok, alan değişmez, **yeni audit yok**. `500`/belirsiz PASS üretmez | **PASS** |

### 3.4 H7 — Portal (6 ölçüt, KOŞULLU — koşulmadı)

Altı ölçüt de **KB-01 (İ4 kapsam kararı)** beklediği için koşulmadı. Bu, kapsam kararının
verilmiş sayılmadığı anlamına gelir; düzenek kodu da yazılmamıştır.

---

## 4. İ3'ün ortaya çıkardığı ölçüt düzeltmeleri

Düzeneği koşmak, İ2'nin **iki hatasını** açığa çıkardı. Her ikisi de aynı kökten geliyor:
*tek bir kontrolün yokluğundan yetki yokluğu sonucu çıkarmak.*

| # | İ2'nin ilk yazımı | Ölçülen gerçek | Düzeltme |
|---|---|---|---|
| 1 | "review ek eşik istemez, staff JWT yeterli" (serviste `isApproverEligible` çağrısı yok diye) | Kapı controller'daki authority primitive'inde | İ2 H5-05 yeniden yazıldı |
| 2 | "eşik `ADMIN VEYA elevated`" | O, **WORKSPACE** komutlarının eşiği. Review'ınki **CR-1**: `reviewAuthority` sinyali, `isApproverEligible`'dan **bağımsız**, **rol (ADMIN dahil) tek başına yetki vermez**; kaynağı `PermissionGrant` GLOBAL `client.intake.review` ALLOW | İ2 H5-05/H5-06 kaynağa bağlandı |

| 3 | "profil reddi ile grant reddi **farklı** kod taşır" | Ürün ikisini de **aynı** koda düşürür — iç neden sızmaz (doğru güvenlik davranışı). Ölçüm buna göre **sıkılaştırıldı**: negatif aktörlerin profili geçerli olmalı | H5-05b tersine çevrildi |

Ayrıca sözleşme uyumsuzlukları düzeltildi (ürün koduna dokunulmadan, **belge ürüne uyduruldu**):
- H2 başarı kodları: `@Post` **201** (arşivleme/geri alma dahil), `@Put` **200** — `@HttpCode` yok
- H2-10: iletişim kişileri `contacts` ile değil **`phones`/`emails`** (`ClientContactInputDto[]`) ile yönetilir
- H5-01: `success:false` tek başına kesin ret değildir; kesinlik `deliveryOutcome`'dan okunur
- H5-03: `ClientIntakeLink` `revokedAt` taşımaz; iptal `status` alanındadır
- H4-07b: `snapshotHash` değişiminde kod `CONTENT_HASH_MISMATCH`'tir (`STALE_SNAPSHOT` değil);
  **davranış beklentisi (red + içerik onayının yazılmaması) gevşetilmedi**, yalnız kod adı
  gerçek sözleşmeye bağlandı

### 4.1 Kapatılan yanlış PASS yolları

| Yol | Neydi | Ne oldu |
|---|---|---|
| **null karşılaştırması** | Sayım/okuma `.catch(() => null)` ile null dönüyordu; `null === null` "değişmedi" sayılıyordu | `safeCount`/`safeCapture` `{value,error}` döner; hata → **UNMEASURED** |
| **Belirsiz HTTP** | Bazı dallarda belirsizlik PASS'a düşebiliyordu | Her ölçütte `anyIndet(...)` → **UNMEASURED** |
| **Tekrar isteği** | H5-06'da `rAgain` yalnız loglanıyordu | Sonucu **ölçülür** (`>=400` ve `promotedRefId` değişmez) |
| **Genel 500** | `status >= 400` yetki reddi sayılabiliyordu | Yetki ölçütleri `isDenied()` ile **yalnız 403** kabul eder |
| **Profil gürültüsü** | Profilsiz aktörün 403'ü grant reddi sanılabilirdi | Negatif aktörlerin **geçerli profili var**; ayrım H5-05b'de ölçülür |
| **Sayım eşitliği** | H5-04'te sayım karşılaştırılıyordu | **Kayıt kimliği** listesi karşılaştırılır |

---

## 5. Yol B izolasyonu — mock kanıt yerine geçmez

H5-01 `EmailProviderService` üzerinden gider ve sağlayıcı ayarı **süreç-genel ENV**'den gelir.
İ1a'nın tenant `Office` provası bu yola **geçerli değildir**. Koşum için API şu şekilde
başlatılır:

```
EMAIL_PROVIDER=smtp  SMTP_HOST=127.0.0.1  SMTP_PORT=2526
```

`i3-sink.js` yalnız loopback'e bağlanır ve üç modu **canlı** değiştirir:

| Mod | Davranış | Ürün sınıflandırması |
|---|---|---|
| `''` | `250` kabul + diske yaz | `ACCEPTED` |
| `reject` | `MAIL FROM`'a `550` | `REJECTED` (doğrulanabilir ret) |
| `reset` | DATA'da bağlantıyı koparır → `ECONNRESET` | `INDETERMINATE` |

`reset` bilerek seçildi: `ECONNRESET` üründe `TRANSPORT_NEVER_SENT` kümesinde **değildir**
(veri gönderilmiş olabilir), bu yüzden fail-safe olarak belirsiz sayılır.

**`EMAIL_PROVIDER=mock` ile koşulursa H5-01 UNMEASURED raporlanır** — mock gerçek taşıma
hatası kanıtı yerine geçmez. Gerçek sağlayıcı sırrı veya production konfigürasyonu
kullanılmaz.

---

## 5.1 İki kapı sırası — CONTENT_HASH önce, STALE sonra

`completeContentApproval` (`approval.service.ts:598-672`) kapı sırası:
`CONTENT_REQUIRED` → **`CONTENT_HASH_MISMATCH`** → `REQUEST_NOT_FOUND` ×2 →
**`STALE_SNAPSHOT`** → `SELF_APPROVAL` → `FOUR_EYES` → eligibility.

**`recomputedContentHash` `version.snapshotHash`'i içerir** (`:628-633`). Bu yüzden sürümün
snapshot'ını bozmak **2. kapıyı** tetikler ve 5. kapıya **hiç ulaşılmaz**. İki senaryo bu
nedenle farklı alanlara enjekte edilir ve her biri **tam kod eşleşmesi** arar (`>=400` yetmez):

| Senaryo | Enjeksiyon | Ulaşılan kapı | Kanıt |
|---|---|---|---|
| H4-07c | `version.notificationContentHash` | **2.** | `409 CONTENT_HASH_MISMATCH`, tam eşleşme |
| H4-07b | `OfficeApprovalRequest.savedIntent.snapshotHash` | **5.** | `409 STALE_SNAPSHOT`, tam eşleşme, **2. kapı geçildi=true** |

Enjeksiyon geri alınamazsa **bağımlı senaryolar çalıştırılmaz** (erişim sonlandırma yine çalışır).

## 5.2 İzolasyon ön koşulu → sonda (bu sırayla)

`H5-00` iki aşamalıdır:
1. **Ön koşul (gönderim çağrısı YOK)** — yakalayıcı loopback'te dinliyor, LAN adreslerinden
   erişilemiyor, bildirilen etkin sağlayıcı `smtp`, bildirilen taşıma hedefi yakalayıcının
   adresi. Biri sağlanmazsa **sonda dahil** gönderim çağrısı **sıfır**dır.
2. **Sonda** — önceden kurulmuş izolasyonun **davranış doğrulaması**. Belirsiz, başarısız veya
   yakalanmamışsa `transportBound=false` kalır ve sonraki gönderimler **başlamaz**.

Ölçülen (A koşumu): `ön koşul=OK (sağlayıcı='smtp', hedef=127.0.0.1:2526, LAN erişimi YOK)
· sonda HTTP 201 · dispatcher çağrısı 2→3 · mesaj 0→1 · SONDA YAKALANDI=true`.

## 5.3 Üç ayrı ölçüm — hiçbiri diğerinin yerine geçmez

| Ölçüm | Ne sayar | Kaynak |
|---|---|---|
| `count()` | Teslim edilen `.eml` gövdeleri | yakalayıcı |
| `smtpConnections()` | **Açılan TCP oturumu** | yakalayıcı (`conn-*`) |
| `dispatcherSendCalls()` | **Gerçek `dispatcher.send` çağrısı** | `i3-spy.js`, `publication.service.ts:213` |

**SMTP bağlantısı "dispatcher çağrıldı" DEMEK DEĞİLDİR:** bir dispatcher (ör. mock) çağrılıp
hiç TCP açmayabilir. Bu yüzden asıl iddia `dispatcherSendCalls()`'tur; **okunamazsa `null`
döner ve sıfır KABUL EDİLMEZ** (ölçüt UNMEASURED).

**Karşı örnek (C koşumu):** allowlist etkisizleştirilince `mock` dispatcher **çağrıldı**
(`gerçek send 0→1`) ama **SMTP bağlantısı açılmadı** (`1→1`). İki ölçümün ayrı şeyler olduğu
böylece gösterildi.

### Spy — ürün kodu değiştirilmez

`i3-spy.js` `node --require` ile yüklenir ve derlenmiş `dist` sınıflarının (`...EmailDispatcher`,
`Unconfigured...Dispatcher`) `send` metotlarını **çalışma zamanında** sarmalar; davranışı
değiştirmez, yalnız sayar. Repodaki hiçbir ürün dosyası değişmez ve sarmalama **yalnız izole
prova sürecinin belleğinde** yaşar. `--bypass-allowlist` bayrağı §35.10 allowlist kontrolünü
etkisizleştirir — **yalnız negatif prova için**.

## 5.4 Yapılandırmanın tek kaynağı

API'yi bir komutla, ön kontrolü ayrı `I3_API_*` beyanıyla beslemek **iki ayrı kaynak**tı; ikisi
sessizce ayrışabilirdi. Artık `i3-start-api.js` API'yi başlatır **ve** kullandığı etkin ayarları
`i3-api-config.json`'a yazar; `i3-run.js` **yalnız o dosyayı** okur, ayrı beyan kabul etmez.

- **Eksik alan varsayılanla TAMAMLANMAZ** — `smtpHost` silindiğinde ön koşul reddeder.
- **İsteklerin bu örneğe gittiği** doğrulanır: kayıtlı `pid`, API portunun gerçek dinleyicisi mi?
- **Dosya, çalışan örneği temsil ediyor mu?** — §5.5.
- Yapılandırma dosyası **sır değeri içermez** (`secretsInConfig: false`).

Ölçülen (A): `ön koşul=OK (ETKİN sağlayıcı='smtp', hedef=127.0.0.1:2526, API örneği pid=73252
DOĞRULANDI, LAN erişimi YOK) · sonda HTTP 201 · SMTP bağlantısı 2→3 (açıldı=true) · mesaj 0→1 ·
SONDA YAKALANDI=true`.

**8.3 kısa ad tuzağı:** ürünün `assertNoReparse` koruması kısa ad (`ULASTE~1`) ile uzun adı
"yol yeniden yönlendiriliyor" sayıp reddeder. Başlatıcı çalışma dizinini `realpath` ile
çözer ve kısa ad kalırsa **fail-closed durur**.

## 5.5 Tek kaynak yetmez — dosya ≠ çalışan örnek

Tek kaynak, dosyanın **dolu** olmasını garanti eder; **doğru** olmasını değil. Yapılandırma
`emailProvider:'smtp'` derken süreç gerçekte `mock` koşuyorsa:

- `providerOk` dosyayı okur → **geçer**,
- `targetOk` dosyayı okur → **geçer**,
- `pidOk` gerçek dinleyiciyi bulur → **geçer**.

Üç kontrol de dosyanın **kendi içindeki** tutarlılığa bakar; hiçbiri süreci sorgulamaz.
`instanceToken` de yalnız dosyaya yazılıp **hiçbir yerde karşılaştırılmayan** bir etiketti.

**Tanık, API sürecinin içinden yazan `i3-spy.js`'tir.** Başlatıcı `I3_INSTANCE_TOKEN`'ı sürece
**geçirir**; spy kendi `process.pid`'ini ve sürecin gerçekten aldığı `EMAIL_PROVIDER` /
`SMTP_HOST` / `SMTP_PORT` değerlerini sayaç dosyasına yazar. `i3-lib.readRuntimeWitness()`
beş alanı dosyayla karşılaştırır; **okunamazsa "eşleşti" SAYILMAZ.**

> `.env` gölgesi: `ConfigService` dotenv'i cwd'den yükler ve dotenv **zaten tanımlı**
> `process.env` anahtarlarını ezmez — bu yüzden başlatıcının verdiği değerler etkindir. Yine de
> taşıma anahtarlarını gölgeleyen bir `.env` varsa başlatıcı **fail-closed durur**.

**Bağ yalnız ön koşulda değil, dal seçiminde de yüklüdür.** H4-08 önce `apiConfig.emailProvider`
(bildirilen) değerinden dal seçiyordu; yalan yapılandırma "onaylı sağlayıcı" dalını açıyor ve
ürün doğru davranırken (`403 PROVIDER_NOT_PRODUCTION`) **yanlış FAIL** üretiliyordu. Artık dal
`readRuntimeWitness().provider` ile seçilir; bağ yoksa H4-08 **ÖLÇÜLEMEDİ** olur.

### Ölçülen karşı örnek (dolu ama uyuşmayan yapılandırma)

Süreç `--provider mock` ile başlatıldı, ardından dosyaya `emailProvider:"smtp"` yazıldı —
**eksik alan yok**, `providerOk`/`targetOk`/`pidOk` üçü de geçiyor:

| | Yama ÖNCESİ (`origin/main` düzeneği) | Yama SONRASI |
|---|---|---|
| Ön koşul | `ön koşul=OK` → **geçti** | `ÇALIŞMA ZAMANI BAĞI=false (UYUŞMAYAN alan: provider · sürecin bildirdiği: sağlayıcı='mock')` → **reddedildi** |
| Sonda | **ATILDI** — `sonda HTTP 201` | **ATILMADI** |
| Gerçek `dispatcher.send` | — | `0→0 (değişmedi=true)`, sayaç **okunabilir** |
| H4-08 | yanlış dal → **FAIL** (ürün doğruyken) | **ÖLÇÜLEMEDİ — dal seçilmez** |
| Toplam | `PASS 29 · FAIL 2 · ÖLÇÜLEMEYEN 9` | `PASS 29 · FAIL 1 · ÖLÇÜLEMEYEN 10` |

Yama öncesi ret **sondadan sonra** (`SONDA YAKALANDI=false`) geliyordu; istenen, **sondadan
önce** reddetmektir. Karşılaştırma testin içinde yeniden yazılmış bir kopyayla değil, **gerçek
önceki düzenekle** (ayrı `origin/main` worktree'si) yapılmıştır.

Sayaç okunamazsa `null` döner ve **sıfır kabul edilmez**: ret dalı bu durumda
`GERÇEK dispatcher.send ÖLÇÜLEMEDİ (sayaç okunamadı — SIFIR KABUL EDİLMEZ)` yazar.

### Prova matrisi (tamamı disposable; canlıda hiçbir şey çalıştırılmadı)

| Prova | Yapılandırma | Sonuç |
|---|---|---|
| **A** `--provider smtp` | doğru | `PASS 34 · FAIL 0 · ÖLÇÜLEMEYEN 6` · `ÇALIŞMA ZAMANI BAĞI=true [token/pid/sağlayıcı/host/port süreççe DOĞRULANDI]` · sonda HTTP 201 · SMTP bağlantısı 2→3 · mesaj 0→1 · H4-08 yayın `PUBLISHED`, gerçek `dispatcher.send` 0→1 |
| **B** `--provider mock` | doğru | `PASS 30 · FAIL 0 · ÖLÇÜLEMEYEN 10` · H4-08 `403 …PROVIDER_NOT_PRODUCTION`, `CONTENT_APPROVED→SEND_PENDING`, gerçek `dispatcher.send` 0→0 |
| **C** `--provider mock --bypass-allowlist` | doğru | `PASS 30 · FAIL 0 · ÖLÇÜLEMEYEN 11` · H4-08N gerçek `dispatcher.send` **0→1** (bypass olmadan sıfır olmalıydı); karşı örnek: SMTP bağlantısı 1→1 |
| **D** `smtpHost` **silinmiş** | eksik | `FAIL 0` · H5-00 **ÖLÇÜLEMEDİ — ZORUNLU alan EKSİK (varsayılanla TAMAMLANMAZ)** · gönderim çağrısı 0 |
| **E** süreç `mock`, dosya `"smtp"` | **dolu ama uyuşmaz** | `PASS 29 · FAIL 1 · ÖLÇÜLEMEYEN 10` · H5-00 **sondadan ÖNCE reddedildi**, gerçek `dispatcher.send` 0→0 · H4-08 **ÖLÇÜLEMEDİ — dal seçilmez** |
| **E′** aynı uyuşmazlık, **yama öncesi** düzenek | **dolu ama uyuşmaz** | `PASS 29 · FAIL 2 · ÖLÇÜLEMEYEN 9` · ön koşul **GEÇTİ** ve **sonda ATILDI** (`HTTP 201`) · H4-08 yanlış dal → **FAIL** |
| **NC** `i3-negative.js` | — | `PASS 9 · FAIL 0` (NC-3/4/5/8/9 mutasyon kanıtlı) |

E ile E′ arasındaki tek fark düzenektir; API örneği, uyuşmazlık ve veritabanı aynıdır.

## 6. Negatif kontroller

Ayrı bir negatif kontrol dosyası **yoktur**; her ölçüt zaten hedefli bir negatif kontrol
içerir — yetkisiz aktörün reddi **ve** o redde kalıcı etkinin olmadığı aynı senaryoda ölçülür.
Önceden kapalı davranışlar için gerekçesiz geniş test tekrarı yapılmaz.

**Yanlış PASS yollarını yakalayan dar kontroller** (§4.1'in ölçüm karşılıkları):
`H5-00` taşıma bağını sonda ile doğrular · `H5-05b` iki ret nedeninin ayırt edilemediğini
gösterir · `H5-06b` tekrar isteğinin sonucunu ölçer · `I3-00` iki aktörün rol eşitliğini
doğrular · `H4-06b` eligible olmayan **ama hazırlamaya yetkili** MUHASEBE personeliyle eşiğin
gerçekten eligibility olduğunu ayırır.

### 6.1 Düzeneğin KENDİSİNİ sınayan negatif kontroller (`i3-negative.js`)

**Kopya mantık yoktur.** Kontroller ölçüt modüllerinin kullandığı **gerçek** karar
fonksiyonlarını (`i3-lib.decide.*`) ve gerçek karşılaştırma katmanını çağırır. Testin içinde
yeniden yazılmış bir `accepts`/`isDenied`/`gate` olsaydı, gerçek kapı bozulduğunda test yine
geçerdi — kendi kendini onaylardı.

**Mutasyon kanıtı:** NC-3/4/5/8/9'da gerçek kapı geçici olarak bozulur, ilgili kontrolün
**kırıldığı** gösterilir ve düzeltme `finally` içinde geri konur. Sonuç: **9/9 PASS**.

| # | Enjekte edilen bozuk durum | Ölçülen |
|---|---|---|
| NC-1 | Aynı ID (`a1`), **değişmiş** `street`; kayıt sayısı aynı | Fark **yakalanır** — kimlik eşitliği yetmez |
| NC-2 | Aynı içerikli **ikinci** satır (mükerrer hedef) | Fark **yakalanır** |
| NC-3 | Tekrar isteğinde `500` / `409` | **Kabul edilmez**; yalnız `400` sözleşmesi PASS üretir |
| NC-4 | Belirsiz HTTP ve `500` | Yetki reddi **sayılmaz**; `anyIndet` yakalar |
| NC-5 | Taşıma bağı doğrulanmamış | Gönderim ölçütleri **UNMEASURED**, gönderime geçilmez |
| NC-6 | Fotoğraf/sayım sorgusu düşer | Hata **yukarı taşınır**, `null` dönmez |
| NC-7 | `unchanged()` null fotoğrafla çağrılır | **PASS vermez** (`unmeasured`) |
| NC-8 | `matchesExactCode` "alternatif kabul" mutasyonu | **Kırılır** — "STALE **veya** CONTENT_HASH" kabulü iki senaryoyu ayrıştıramaz |
| NC-9 | Dolu ama uyuşmayan yapılandırma (sağlayıcı, bayat `instanceToken`); tanık dosyası yok | **Reddedilir**; dal seçimi için sağlayıcı **verilmez**; okunamayan tanık "eşleşti" **sayılmaz** |

**Mutasyon sonuçları:** NC-3 (`>=400 kabul`) · NC-4 (`>=400 red`) · NC-5 (`bağı yok say`) ·
NC-8 (`alternatif kod kabul`) · NC-9 (`yalnız okunabilirliğe bak`) — beşinde de bozukken iddia
**false** döndü (kontrol kırıldı) ve düzeltme geri kondu.

Bu kontroller ürün uçlarına yazma yapmaz; yalnız ölçüm aracını besler. **Yeni plan maddesi
sayılmazlar.**

Ölçülen bozuk durum reddi örnekleri: VIEWER mutasyonu (H2-01) · elevated olmayan lifecycle
(H2-03/04/05/06) · fiziksel silme (H2-07) · kapsam dışı okuma (H2-08) · invariant ihlali
(H2-09) · rızasız bayrak (H4-01) · rıza sonrası geri alma (H4-03) · iptalli bağlantı (H5-03) ·
public uçtan aktarım (H5-04) · rolle inceleme (H5-05) · inceleyenle aktarım (H5-06).

---

## 7. Koşum

```bash
export AH_DATABASE_URL="postgresql://<kullanici>:<parola>@127.0.0.1:5439/hukuk_fix1_test"
export AH_API_BASE_URL="http://127.0.0.1:8099/api"
export I3_SMTP_PORT=2526

# 1) API'yi BASLATICI ile ac — etkin ayarlari kendisi `i3-api-config.json`'a yazar.
#    Ayri `I3_API_*` beyani KABUL EDILMEZ (bkz. 5.4/5.5).
node i3-start-api.js --provider smtp     # veya: --provider mock
# 2) Kosum
node i3-run.js
# 3) Bitince
node i3-start-api.js --stop
```

Tek süreçtir: ölçüm token'ları bellekte tutulur, böylece login sayısı hız sınırı bütçesi
altında kalır. Parola bellekte üretilir; çıktıya, durum dosyasına veya repoya yazılmaz.

---

## 8. Bilinen kısıtlar

1. **Login hız sınırı.** İ3 sekiz aktörle çalışır → koşum başına ~7 login. `login-rate-limit.guard.ts`
   IP başına 10/dakika uygular ve aşılırsa **5 dakika** bloklar. Art arda koşumlarda blok
   oluşur; prova ortamında API'yi yeniden başlatmak in-memory sayacı sıfırlar (canlıda YAPILMAZ).
2. **H7 kapsam kararı.** KB-01 (İ4) gelmeden altı ölçüt koşulmaz; bunlar **koşullu**
   kapsamdadır (İ16) ve İ3'ün kesin kapsamına dahil değildir.
4. **Ölçülen sürüm.** Prova RELEASE20 derlenmiş `dist`'i (`08ce8e25`) üzerindedir; main'de
   sonradan birleşen CLIENT değişiklikleri bu `dist`'te yoktur.

---

## 9. Bu iş kapsamı dışında (yapılmadı)

Production yazımı · İ1b canlı tenant tahsisi · gerçek alıcıya gönderim · canlı flag değişikliği ·
deploy · F04 A2 tekrarı · ürün yetki sözleşmesi değişikliği · ürün kodu değişikliği.

**Gerçek ürün kusuru bulunmadı.** Koşum sırasında ortaya çıkan tüm FAIL'ler düzenek veya ölçüt
kusuruydu ve kaynağa uydurularak düzeltildi; hiçbir beklenti "kod geçsin diye" gevşetilmedi.

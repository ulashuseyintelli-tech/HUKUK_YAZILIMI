# CLIENT KABUL DÜZENEKLERİ — İ3 / R01

**İş:** R02 ana planındaki **İ3** — kabul düzeneklerinin hazırlanması (YEREL/DISPOSABLE)
**Durum:** **KISMİ** — 24 ölçüt koşuldu ve PASS; **9 ölçüt koşulmadı** (3 ön koşul + 6 İ4 kararı)
**Türetildiği main:** `f8d15f73`
**Prova:** `PASS 24 · FAIL 0 · ÖLÇÜLEMEYEN 9` (toplam 33)

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

### 3.2 H4 — Talimat / beyan / rıza / KVKK (5 PASS · 3 ÖLÇÜLEMEDİ)

| Ölçüt | Ölçülen | Sonuç |
|---|---|---|
| H4-01 | Rıza kapısı **yetkiden bağımsız** — elevated aktör de rızasız yazamaz; aynı istekteki standart alan da yazılmaz | **PASS** |
| H4-02 | Rıza **yeni satır** olarak yazılır (güncelleme değil) ve bayrak yazımını açar | **PASS** |
| H4-03 | Geri alma satırı **silmez** (`revokedAt` + `revokedByUserId`); yazma yeniden RED | **PASS** |
| H4-04 | Onay defteri aktörü **personeldir**; içerik `PUT`/`DELETE` ucu **yok** (`404`) | **PASS** |
| H4-05 | Sağlayıcı ulaşılamazken durum geçişi COMMIT kalır, uç throw etmez | **PASS** |
| H4-06 | Büro onayı: self-approval + eligibility | **ÖLÇÜLEMEDİ** |
| H4-07 | İçerik onayı: four-eyes (üç ayrı kişi) + STALE_SNAPSHOT | **ÖLÇÜLEMEDİ** |
| H4-08 | Yayın yalnız onaylı sağlayıcıya | **ÖLÇÜLEMEDİ** |

**H4-06/07/08 neden ölçülemedi.** Üçü de bir `ClientFinancialDisclosureVersion` ister; sürüm
yalnız `Collection → CollectionDisposition → **POSTED** → createFromDisposition` zincirinden
doğar. Bu finansal posting zinciri bu turda kurulmadı. Düzenek kodu (`i3-h4-disclosure.js`)
**yazılmıştır ve ön koşul sağlandığında koşar**; ön koşul denetimi başarısızsa PASS üretmez,
eksik kalemi adıyla raporlar. `snapshotHash`/`sourceFingerprint` elle yazılmadı — ürünün
doğruladığı değeri taklit etmek, uyuşmazlıkta **yanlış `STALE_SNAPSHOT` bulgusu** üretirdi.

### 3.3 H5 — Bilgi/belge toplama (7/7 PASS)

| Ölçüt | Ölçülen | Sonuç |
|---|---|---|
| H5-01 | **Üç sonuç ayrı**: kabul→kayıt · doğrulanabilir ret→`503`+kayıt YOK · belirsiz→`503`+kayıt YOK (= **A-9 + A-10**) | **PASS** |
| H5-01b | Belirsiz sonuçta **otomatik tekrar gönderim yok** (sağlayıcı konuşma farkı = 1) | **PASS** |
| H5-02 | Ham token yalnız oluşturma yanıtında; okuma ucunda ve **kalıcı gövdede** yok (= **A-5 + A-6**) | **PASS** |
| H5-03 | İptal öncesi açık, sonrası kapalı; iptalli bağlantıdan kalıcı kayıt oluşmaz | **PASS** |
| H5-04 | Public gönderim kaydedilir ama **kanonik kayda dokunmaz** | **PASS** |
| H5-05 | İnceleme: **ROL (ADMIN dahil) ve PARTNER bağı YETMEZ**; yalnız grant izin verir | **PASS** |
| H5-06 | Aktarım: **inceleyen aktör ve ADMIN yetmez** (CR-1 md.6), elevated izin, idempotent | **PASS** |

### 3.4 H7 — Portal (6 ÖLÇÜLEMEDİ)

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

Ayrıca üç sözleşme uyumsuzluğu düzeltildi (ürün koduna dokunulmadan, **belge ürüne uyduruldu**):
- H2 başarı kodları: `@Post` **201** (arşivleme/geri alma dahil), `@Put` **200** — `@HttpCode` yok
- H2-10: iletişim kişileri `contacts` ile değil **`phones`/`emails`** ile yönetilir
- H5-01: `success:false` tek başına kesin ret değildir; kesinlik `deliveryOutcome`'dan okunur

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

## 6. Negatif kontroller

Ayrı bir negatif kontrol dosyası **yoktur**; çünkü her ölçüt zaten hedefli bir negatif kontrol
içerir — yetkisiz aktörün reddi **ve** o redde kalıcı etkinin olmadığı aynı senaryoda ölçülür.
Önceden kapalı davranışlar için gerekçesiz geniş test tekrarı yapılmaz.

Ölçülen bozuk durum reddi örnekleri: VIEWER mutasyonu (H2-01) · elevated olmayan lifecycle
(H2-03/04/05/06) · fiziksel silme (H2-07) · kapsam dışı okuma (H2-08) · invariant ihlali
(H2-09) · rızasız bayrak (H4-01) · rıza sonrası geri alma (H4-03) · iptalli bağlantı (H5-03) ·
public uçtan aktarım (H5-04) · rolle inceleme (H5-05) · inceleyenle aktarım (H5-06).

---

## 7. Koşum

```bash
export AH_DATABASE_URL="postgresql://<kullanici>:<parola>@127.0.0.1:5439/hukuk_fix1_test"
export AH_API_BASE_URL="http://127.0.0.1:8099/api"
export I3_API_EMAIL_PROVIDER=smtp   # Yol B bildirimi; yoksa H5-01 UNMEASURED
export I3_SMTP_PORT=2526
node i3-run.js
```

Tek süreçtir: ölçüm token'ları bellekte tutulur, böylece login sayısı hız sınırı bütçesi
altında kalır. Parola bellekte üretilir; çıktıya, durum dosyasına veya repoya yazılmaz.

---

## 8. Bilinen kısıtlar

1. **Login hız sınırı.** İ3 yedi aktörle çalışır → koşum başına ~7 login. `login-rate-limit.guard.ts`
   IP başına 10/dakika uygular ve aşılırsa **5 dakika** bloklar. Art arda koşumlarda blok
   oluşur; prova ortamında API'yi yeniden başlatmak in-memory sayacı sıfırlar (canlıda YAPILMAZ).
2. **H4-06/07/08 ön koşulu.** Finansal posting zinciri kurulmadan koşulamaz (§3.2).
3. **H7 kapsam kararı.** KB-01 gelmeden altı ölçüt koşulmaz.
4. **Ölçülen sürüm.** Prova RELEASE20 derlenmiş `dist`'i (`08ce8e25`) üzerindedir; main'de
   sonradan birleşen CLIENT değişiklikleri bu `dist`'te yoktur.

---

## 9. Bu iş kapsamı dışında (yapılmadı)

Production yazımı · İ1b canlı tenant tahsisi · gerçek alıcıya gönderim · canlı flag değişikliği ·
deploy · F04 A2 tekrarı · ürün yetki sözleşmesi değişikliği · ürün kodu değişikliği.

**Gerçek ürün kusuru bulunmadı.** Koşum sırasında ortaya çıkan tüm FAIL'ler düzenek veya ölçüt
kusuruydu ve kaynağa uydurularak düzeltildi; hiçbir beklenti "kod geçsin diye" gevşetilmedi.

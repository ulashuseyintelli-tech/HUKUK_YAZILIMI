# CLIENT KABUL ALTYAPISI — R01 (İş İ1a)

**Durum:** HAZIR (disposable ortamda prova edildi)
**Kapsam:** R02 ana planındaki **İ1a** — yerel/disposable kabul hazırlığı
**Ölçülen kod sürümü:** RELEASE20 derlenmiş `dist`, kaynak `08ce8e2559b4d1d67fcee245413de510209507f3`
**Prova sonucu:** tam koşum **22/22 PASS**, negatif kontroller **11/11 PASS** (toplam 33/33)

---

## 1. Bu paket NEDİR, NE DEĞİLDİR

**Nedir.** Sekiz CLIENT hizmetinin kabul koşumlarının üzerinde çalışacağı **altyapı**: izole
veritabanı, sentetik tenant, ürünün kendi mekanizmasından kurulmuş üç yetki aktörü, dış
gönderime yol bırakmayan bir posta katmanı ve doğrulanmış erişim sonlandırma.

**Ne değildir.** Kabul senaryosu **içermez**. Hiçbir hizmetin kabulü bu pakete dayanarak
verilemez; bu paket yalnız kabul koşumlarının **güvenle yapılabileceğini** gösterir. Hizmet
kabulleri R02 planında ayrı işlerdir (İ3 ve sonrası).

**Kanıtladığı şey**, ürünün doğru çalıştığı değil, **ölçüm ortamının güvenilir** olduğudur.

---

## 2. Güvenlik kapıları (hepsi fail-closed)

| Kapı | Ne yapar | Nerede |
|---|---|---|
| **G-0** | Veritabanı host/port/ad + API kökü allowlist'i. Üretim işaretlerinden biri görülürse **yazma başlamaz**. Ortam çözümlenemiyorsa da başlamaz. | `ah-lib.js` `assertDisposableEnvironment()` |
| **G-0b** | Yazma COMMIT edildikten sonra API'nin **gerçekten aynı** disposable veritabanına bağlı olduğu doğrulanır. Doğrulanamazsa yazılan satırlar **geri alınır**. | `ah-01-setup.js` S3/S4 |
| **G-1** | Tenant slug'ı `ah-` ile başlamalı; `telli-hukuk`, `demo-firma` ve diğer program tenant'ları **yasak**. | `ah-lib.js` `assertOwnSlug()` |
| **G-2** | Yazan her adım dokunduğu satırın tenant'ını doğrular. | `ah-lib.js` `assertOwnTenant()` |
| **G-3** | Slug çakışması → dur. | `ah-01-setup.js` |
| **G-4** | Parola/token durum dosyasına, çıktıya veya repoya **yazılamaz** (yazmayı deneyen çağrı hata alır). | `ah-lib.js` `saveState()` |

Allowlist bilerek dardır: yalnız `127.0.0.1|localhost|::1`, port `5439`, veritabanı adı
`hukuk_fix1_test`. Genişletmek bir owner kararıdır ve bu dosyada gerekçesiyle kaydedilmelidir.

---

## 3. Üç aktör — rol adı yetki kanıtı değildir

Hassas alan eşiği üründe `role === 'ADMIN' **veya** isApproverEligible` şeklindedir
(`client.service.ts:528-531`). `elevated` aktörüne ADMIN verilseydi ölçüm **rol adını**
doğrulardı, eligibility bağını değil. Bu yüzden:

| Aktör | Rol | Lawyer bağı | Ürün eşiğinde beklenen |
|---|---|---|---|
| `viewer` | VIEWER | yok | mutation'da fail-closed DENY |
| `user` | **USER** | yok | standart alan İZİN, hassas alan DENY |
| `elevated` | **USER** | `lawyerRank = PARTNER`, `staffMember` yok | hassas alanda da İZİN |

`user` ile `elevated` **aynı roldedir**; ADMIN yolu ikisinde de kapalıdır. Aralarındaki tek fark
`isApproverEligible` (`office-approval.service.ts:452-465`) önkoşuludur. `R-0x` bu kurgunun
bozulmadığını her koşumda ölçer — bozulursa ölçüm **geçersiz** sayılır ve FAIL raporlanır.

---

## 4. Gönderim izolasyonu — ".invalid adres" tek başına kanıt sayılmaz

Engel adresten değil **taşıma hedefinden** gelir. Ürünün SMTP taşıması tenant'ın kendi `Office`
satırından beslenir (`office.service.ts:455-465` → `client-notification.service.ts:705-710`);
sentetik tenant'ın hedefi loopback'teki yakalama sunucusudur. Ortak/canlı konfigürasyona
**dokunulmaz** ve bu her koşumda ölçülür (M-7).

Beş bağımsız kanıt:

- **M-0** — yakalama sunucusu yalnız `127.0.0.1`'e bağlanır; makinenin LAN adreslerinden
  erişilemediği fiilen denenerek gösterilir.
- **M-1/M-2** — gönderim yakalanır; yakalanan alıcılar dışa gönderilebilir adres değildir.
- **M-3** — sağlayıcı 550 ile reddederse gönderim başarısız olur; **dış gönderime veya otomatik
  gerçek-sağlayıcı geçişine dönüşmez**.
- **M-4** — yakalama sunucusu **kapatılınca** gönderim ölür. Gerçek sağlayıcıya düşen bir yol
  olsaydı mesaj yine giderdi; bu ölçüm o yolun **olmadığını** gösterir.
- **M-5/M-6** — SMTP yapılandırılmamışsa ürün fail-closed durur (varsayılan sağlayıcı yok) ve
  kaynak taraması `createTransport` çağrılarının tamamının tenant ayarından beslendiğini,
  env/sabit fallback bulunmadığını doğrular.

---

## 5. Erişim sonlandırma — "denedim" yeterli değildir

Sonlandırma ürünün kendi iki mekanizmasıyla yapılır: `isActive = false` ve `tokenVersion`
artışı. Aktör başına üç kanıt ölçülür:

- **V-1** sonlandırmadan **önce** alınmış token artık reddediliyor (asıl kanıt),
- **V-2** yeni oturum açma reddediliyor,
- **V-3** kalıcı durum: `isActive=false`, `tokenVersion` arttı.

**HTTP 429 kanıt sayılmaz.** `login-rate-limit.guard.ts` isteği kimlik doğrulamaya *ulaşmadan*
reddeder; "reddedildi" görüntüsü sonlandırmadan değil hız sınırından gelir. Bu durumda V-2
ÖLÇÜLEMEDİ işaretlenir, karar V-1 + V-3 ile verilir ve rapor 429'u açıkça gösterir.

Sonlandırma **başarı ve hata yollarının ikisinde de** çalışır (`ah-run.js` `finally`) ve
doğrulanamazsa açıkça BAŞARISIZ raporlanır.

---

## 6. F04 paketinin bilinen kusurlarına girilmez

Bu paket F04 kabul paketinden **kod devralmaz**; `f04-run.js` ve `f04-02-a2-race.js`
yollarından geçilmez. İki bilinen kusur burada tekrarlanmaz:

- **Kusur B(i)** (`f04-run.js:82`): hesap kapatma yalnız `0/4` çıkış kodlarında çalışır; kurulum
  COMMIT'ten sonra başka bir kodla düşerse kapanış atlanır (fail-open).
  → `ah-run.js` **çıkış kodu beyaz listesi kullanmaz**: kurulum başlatıldıysa kod ne olursa olsun
  sonlandırma denenir. `runId` adımlardan **önce** üretilir, böylece kurulum çökse de koşum
  kimliği bilinir.
  *Bu koruma provada gerçek bir olayda çalıştı:* kurulum COMMIT sonrası exit 1 verdi, sonlandırma
  yine de koştu, durum dosyası yokken `runId` ile kurtarıldı.
- **Kusur A** (kilit bütçesi/eşik uyumsuzluğu): bu pakette kilit tutan bir yol **yoktur**.

F04 A2 koşumu bu iş kapsamında **tekrarlanmamıştır**.

---

## 7. Betikler

| Dosya | Görev |
|---|---|
| `ah-lib.js` | Ortak katman: G-0/G-1/G-2/G-4, HTTP (belirsiz sonuç ayrımı), login, kurtarma, izolasyon parmak izi |
| `ah-smtp-sink.js` | Loopback'e sabitlenmiş SMTP yakalama sunucusu (`AH_SMTP_FAIL=reject\|hang`); hiçbir baytı iletmez |
| `ah-01-setup.js` | Atomik 6 satır: Tenant + 3 User + PARTNER Lawyer + Client; `AH_ABORT_AFTER` negatif kontrol kancası |
| `ah-02-roles.js` | Yetki bağları, ölçüm geçerliliği (R-0x), tenant sınırı, komşu izolasyonu |
| `ah-03-mail.js` | Gönderim izolasyonu (M-0…M-7) |
| `ah-04-revoke.js` | Erişim sonlandırma + üç kanıt |
| `ah-00-recover.js` | `runId` ile kurtarma; `--scan` açık erişimli koşumları listeler |
| `ah-run.js` | Tek yürütücü: parolayı bellekte üretir, `finally` ile sonlandırır |
| `ah-90-negative.js` | 11 negatif kontrol |

---

## 8. Koşum

```bash
# Disposable PostgreSQL (5439) ve AYRI portta API zaten ayakta olmalı.
export AH_DATABASE_URL="postgresql://<kullanici>:<parola>@127.0.0.1:5439/hukuk_fix1_test"
export AH_API_BASE_URL="http://127.0.0.1:8099/api"
node ah-run.js            # kurulum → yetki → gönderim → sonlandırma
node ah-90-negative.js    # korumaların gerçekten kapandığını gösterir
```

Parola `ah-run.js` içinde **bellekte** üretilir ve alt süreçlere yalnız ortam değişkeniyle
geçirilir; çıktıya, durum dosyasına veya repoya yazılmaz.

Kurtarma (durum dosyası kaybolduysa):
```bash
AH_RUN_ID=<8hex> node ah-00-recover.js     # durumu yeniden kurar
node ah-00-recover.js --scan               # erişimi açık kalmış koşum var mı?
```

---

## 9. Prova sonuçları (disposable, 2026-09-08)

Ortam: PostgreSQL `127.0.0.1:5439/hukuk_fix1_test` (docker `hy-fix1-testdb`), API `127.0.0.1:8099`
ayrı çalışma dizininde, JWT sırrı bu koşum için üretildi — canlı yapılandırmadan hiçbir değer
kopyalanmadı. Canlı API (:8080) ve Web (:3002) süreçlerine dokunulmadı.

| Aşama | Sonuç |
|---|---|
| Yetki bağları (`ah-02-roles.js`) | **10/10 PASS** |
| Gönderim izolasyonu (`ah-03-mail.js`) | **8/8 PASS** |
| Erişim sonlandırma (`ah-04-revoke.js`) | **4/4 PASS** |
| Negatif kontroller (`ah-90-negative.js`) | **11/11 PASS** |

Öne çıkan ölçümler:
- `R-0x`: `user=USER/partner:false · elevated=USER/partner:true` — ADMIN yolu ikisinde de kapalı.
- `R-1` HTTP 403, `R-2` 200, `R-3` 403, `R-4` 200, `R-5` 404 — ayrımların tamamı gerçek.
- `R-6`: 1137 komşu tenant izlendi, dağılım digest'i değişmedi.
- `M-0`: `10.34.25.53`, `172.24.176.1`, `192.168.192.1` adreslerinden yakalama sunucusuna
  erişilemedi; yalnız `127.0.0.1` erişilebilir.
- `M-7`: 6 komşu `Office` satırı izlendi, SMTP yapılandırmaları değişmedi.
- `V-*`: eski token HTTP 401, yeni login HTTP 401, `tokenVersion 0→1`, aktif hesap 0.

---

## 10. Bilinen kısıtlar

1. **Login hız sınırı.** `login-rate-limit.guard.ts` IP başına 10 deneme/dakika uygular; sınır
   aşılırsa **5 dakika** blok başlar (60 sn beklemek yetmez). Tam koşum ~11 login harcar, bu
   yüzden `ah-run.js` sonlandırmadan önce pencereyi boşaltır (`AH_PRE_REVOKE_PAUSE_MS`,
   varsayılan 61 sn). Blok başlamışsa sunucunun bildirdiği `retryAfter` beklenmelidir —
   `ah-90-negative.js` bunu otomatik yapar. **İ3 kabul koşumları bu bütçeyi hesaba katmalıdır.**
2. **Ölçülen sürüm.** Prova, RELEASE20 derlenmiş `dist`'i (`08ce8e25`) üzerinde yapılmıştır;
   main'de sonradan birleşen CLIENT değişiklikleri (ör. `#2552`) bu `dist`'te **yoktur**. Altyapı
   ölçümleri bu farktan etkilenmez, ancak hizmet kabulleri koşulmadan önce hangi kod sürümünün
   çalıştığı kaydedilmelidir.
3. **Disposable veritabanı paylaşımlıdır.** `hukuk_fix1_test` içinde başka programların bıraktığı
   ~1190 tenant vardır. Bu paket kendi kayıtlarını `ah-` önekiyle ayırır ve komşu dağılımın
   değişmediğini her koşumda ölçer; yine de veritabanı tek kullanıcılı sayılmamalıdır.
4. **Varsayılan temizlik silme değildir.** Koşum sonunda erişim kapatılır, kayıtlar **silinmez**.
   Silme gerekiyorsa ayrı ve bilinçli bir karardır.

---

## 11. Bu iş kapsamı dışında (yapılmadı)

Production veritabanına yazma · canlı tenant tahsisi · gerçek alıcıya gönderim · canlı flag
değişikliği · deploy · ürün yetki sözleşmesi değişikliği · F04 A2'nin yeniden koşulması ·
F04 paketi A/B onarımı · İ1b.

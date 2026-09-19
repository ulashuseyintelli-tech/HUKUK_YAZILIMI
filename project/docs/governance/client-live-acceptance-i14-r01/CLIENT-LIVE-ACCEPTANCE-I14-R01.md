# CLIENT İ14 — H4 TALİMAT/BEYAN/ONAY CANLI KABUL PAKETİ (R01 — düzenek + disposable prova; CANLI KOŞULMADI)

**Kanonik bağ:** R02 §3.3 İ14. H4 talimat/beyan/onay kabulüdür; ölçütler İ2'den gelir.
- Kapsam: four-eyes yenileme değil, **beyan/rıza/KVKK davranışı** (yetkisiz erişim RED, kayıt yazılıyor, audit izi).
- Kapanış: ölçüt setinin tamamı PASS.
- Ölçüt kaynağı: `client-acceptance-criteria-i2-r01/…-I2-R01.md` §3 (**H4-01…H4-08**).

**Bu belge canlı kabul VERMEZ.** Canlı koşum ayrı owner GO'su ister (§6). İ12 ve İ13 GO'ları buraya genişletilmez.

---

## 1. Düzenek — yeni mekanizma YOK
Düzenek dört parçadan oluşur:
- İ3 ölçücüleri: `i3-h4-declarations` (H4-01…05) ve `i3-h4-disclosure` (H4-06…08).
- İ3 kurulumu: `setupI3` + `setupDisclosureChain`.
- İ13 ortak kütüphanesi `i13-lib`: izolasyon parmak izi ve kimlik bağlı nihai kapanış. **İ13 paketi #2715'e bağlıdır.**
- İ12 kimlik bağı.

Yeni dosyalar yalnız şunlar: `scripts/i14-live-run.js` ve `scripts/i14-owner-live-block.ps1`.

**Çalışma koşulları:**
- Mevcut tek canlı API kullanılır. env, restart ve firewall değişikliği yoktur.
- Login bütçesi: 5 oturum (user · elev1 · elev2 · elev3 · accountant) + kapanışta 1. Sınır 10/dk.
- **Paket digest:** `B24458E974F18929715763EB98B19557EC3B9C03138D3742E6EF061251352FBF`

| Dosya | sha256 |
|---|---|
| `client-live-acceptance-i14-r01/scripts/i14-live-run.js` | `C18291AD…CF2D` |
| `client-live-acceptance-i13-r01/scripts/i13-lib.js` | `59BA7360…D385` |
| `client-live-acceptance-i13-r01/scripts/i13-live-recover.js` | `5C7D7352…3C87` |
| `client-acceptance-runners-i3-r01/scripts/i3-h4-declarations.js` | `55FD7B30…5FD6` |
| `client-acceptance-runners-i3-r01/scripts/i3-h4-disclosure.js` | `033B952A…99EA` |
| `client-acceptance-runners-i3-r01/scripts/i3-lib.js` | `56F3788E…74A3` |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | `DF882DB7…BFD7` |
| `client-live-acceptance-i12-r01/scripts/i12-live-identity.js` | `9516E462…774F` |

## 2. Gönderim sınırı — kaynaktan

- **H4-04 / H4-05 onay maili:** Yol A üzerinden gider, yani tenant'ın `Office` satırı kullanılır. H4-05, **sentetik** tenant'ın Office SMTP'sini bilerek ölü bir porta yönlendirir (`127.0.0.1:65535`). Böylece best-effort başarısızlık ölçülür. Alıcı adresleri `.invalid`'dir; gerçek alıcıya gönderim mümkün değildir.
- **H4-08 (yayın allowlist'i) canlıda KOŞULMAZ.** Canlıdaki onaylı sağlayıcıyla yapılacak bir yayın, env-SMTP üzerinden GERÇEK sunucuya çıkardı.
  - Runner'a çalışma zamanı bağı verilmez. Bu durumda runner yayın çağrısı yapmaz ve H4-08'i ÖLÇÜLEMEYEN yazar (kaynak: `i3-h4-disclosure.js`, `!declared` dalı).
  - `i14-live-run.js` bu satırı yalnız şu koşulda **İ12 canlı kabul kanıtına bağlar**: satırın beklenen biçimde atlandığı doğrulanmışsa.
  - İ12 kanıtı runId `92d04ef3`, bu PR'dan önce kapandı:
    - **G3:** onaylı sağlayıcıyla PUBLISHED, SENT+1/PUBLISHED+1.
    - **G5:** allowlist dışı istek 403 `DISCLOSURE_PUBLICATION_PROVIDER_NOT_PRODUCTION`, durum SEND_PENDING, smtpConn +0.
  - Kanıt dosyaları iki şeyle doğrulanır: İ12 manifestindeki **sha256 pini** ve **runId**. Okunamazsa sonuç ÖLÇÜLEMEYEN, pin tutmazsa FAIL olur.
  - Bu bağ, İ2 §9'daki ayrımla uyumludur: yayın teslim zinciri İ12'nindir, allowlist reddi H4-08'indir.

## 3. Ölçüt haritası

| Kimlik | Gözlem (İ2 §3) |
|---|---|
| I14-00 | ölçüm geçerliliği: `user` ile `elev*` aynı rolde, fark yalnız PARTNER bağı |
| H4-01 | rıza kapısı yetkiden bağımsızdır: elevated aktör de rızasız bayrak yazamaz |
| H4-02 | rıza YENİ satır olarak yazılır, bayrak yazımını açar, audit aynı transaction'dadır |
| H4-03 | geri alma satırı silmez (`revokedAt` dolar); bayrak yazımı yeniden reddedilir |
| H4-04 | onay defteri: aktör personeldir; içerik için PATCH/PUT/DELETE ucu yoktur (404) |
| H4-05 | onay maili best-effort: sağlayıcıya ulaşılamasa da durum geçişi commit kalır, uç hata fırlatmaz |
| H4-06a/b | büro onayı: talep eden kendi talebini onaylayamaz (SELF_APPROVAL); eligible olmayan (MUHASEBE) aktör onaylayamaz |
| H4-07a | içerik onayı four-eyes kuralına tabidir; üç ayrı kişi gerekir |
| H4-07c | saklanan `notificationContentHash` bozulursa 2. kapı devreye girer: tam `CONTENT_HASH_MISMATCH` |
| H4-07b | `savedIntent` bozulursa 5. kapı devreye girer: tam `STALE_SNAPSHOT`. Enjeksiyon `finally` bloğunda geri alınır. |
| H4-08 | yayın allowlist kapısı: **İ12 canlı G3 + G5 kanıtına bağlıdır** (§2) |
| I14-CLOSE / I14-ISO | nihai kapanış (login 401, eski token 401) · sentetik olmayan tenant dağılımı değişmedi |

## 4. CANLI YAZMA ENVANTERİ — yalnız `ah-<runId>` ve `ah-<runId>-x` (disposable provada ölçüldü)

- **Kurulum:** İ13 ile aynıdır (Tenant 2 · User 9 · Lawyer 3 · StaffMember 5 · PermissionGrant 1 · Client 3 · Case 1 · CaseClient 1 · Debtor 1). Ek olarak FD zinciri kurulur: Collection 1 · ExpenseRequest 1 · OfficeApprovalRequest · CollectionDisposition 1.
- **Ürün yolundan yazılanlar:**
  - ClientConsent 1 (verildi ve geri alındı)
  - ClientApprovalRequest 2
  - Office 1 (**yalnız sentetik tenant**, ölü port)
  - disposition post (journal 3)
  - ClientFinancialDisclosureVersion 1. Durum **CONTENT_APPROVED**'da kalır ve **yayınlanmaz**.
  - AuditLog: `CLIENT_CONSENT_GRANT` · `_REVOKE` · `CLIENT_UPDATE` · `OFFICE_APPROVAL_EXECUTION_SUCCEEDED`
- **Doğrudan DB enjeksiyonu** (H4-07b/c; yalnız sentetik sürümün hash ve savedIntent alanlarına yapılır, `finally`'de geri alınır).
- **Kapanış (UPDATE):** kullanıcılar `isActive=false` ve `tokenVersion+1`; Case CLOSED. **DELETE yoktur.**
- **Gerçek tenant'a yazma:** yok. Sentetik olmayan tenant'ların Office satırlarına dokunulmaz.

## 5. DISPOSABLE PROVA (2026-09-18) — CANLI KABUL DEĞİL

Ortam İ13 provasıyla aynıdır:
- DB `hy-i13-894280b1-db`, 130 migration.
- API: canlı R24 dist, `:8113`. Tek uzak bağlantısı disposable DB'dir.
- Sentetik olmayan komşu tenant var.

| Senaryo | Sonuç |
|---|---|
| **N1** normal akış | **14/14 PASS** (çıkış 0) · H4-08 İ12'ye bağlandı: sha pini tuttu, G3=PASS, G5=PASS, runner yayın çağrısı yapmadı · I14-ISO eşit (11 tenant) |
| NC1a/b kapılar | İ13 biçimli GO ref → 3 · beklenen DB farklı → 4 · tenant sayısı değişmedi |
| NC2a İ12 kanıtı değiştirilmiş (bayt düzeyinde) | H4-08 **FAIL**, çıkış 2 |
| NC2b İ12 kanıt dizini yok | H4-08 **ÖLÇÜLEMEYEN**, çıkış 3 |
| NC3 kurulumdan sonra çöküş | çıkış 1 · `finally` kapanışı: aktif kullanıcı 0, ACTIVE case 0 |

Negatif kontroller **10/10 OK**.

**Prova notu:** ilk NC denemesinde ardışık koşumlar login hız sınırına (429, 5 dk blok) takıldı. Bu bir ölçüm hatası değildir; ürün davranışıdır. Provada sayacı sıfırlamak için API yeniden başlatıldı. **Canlıda bu yapılmaz**; canlı koşum tek sefer ve 6 login ile sınırlıdır.

## 6. CANLI KOŞUM — AYRI OWNER GO GEREKİR (hazır paket)

**Önkoşul:** İ13 paketi (#2715) main'de olmalıdır; `i13-lib` onu kullanır.

**Owner'ın yapacakları:**
- İ14 için yeni GO ref: `OWNER-GO-CLIENT-I14-YYYYMMDD-RNN`.
- `scripts/i14-owner-live-block.ps1` bloğunu normal PowerShell'de çalıştırmak. Yönetici gerekmez.

**Bloğun işleyişi:**
1. Kapıları doğrular: main senkron · paket digest `B24458E9…2FBF` · canlı dist `1524EDC1…4D4E` (R25B) · tek API · açık pencere yok · DB kimliği.
2. GO ref yerelde girilir.
3. `i14-live-run.js` çalışır (`I14_I12_EVIDENCE_DIR` = İ12 kanıt dizini).
4. GO ref tüketimi yalnız sha256 olarak kaydedilir ve manifest yazılır.

**Kapanış ölçütü:** H4-01…H4-08 (H4-08 İ12 bağıyla) + I14-00/CLOSE/ISO **tamamı PASS**, FAIL 0, ÖLÇÜLEMEYEN 0. Ardından CLIENT bağımsız salt-okuma doğrulaması yapar ve kayıt PR'ı açılır.

**Hizmet kabulü (H4) owner kabulü olmadan değişmez.**

## R25 bağı (2026-09-19, R02) — canlı dist pini R25B'ye değişti

Owner kararıyla R25 yalnız onaylı K-1 (#2720) ve PSUS (#2721) portal düzeltmeleriyle sınırlandı. #2716'nın 3 replay adapter dosyası bu yayına **dahil değil**. Owner bloğunun canlı dist kapısı **R25B** artefaktına bağlandı: `1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E` (3867 dosya).

R25B **birleşik bir artefakttır**: tabanı canlı R24 dist'i (`87712E0E…5453`), üzerine yalnız 7 portal dosyası `ebbe1ae8` derlemesinden kopyalandı. Aynı digest, `ebbe1ae8` kaynağında yalnız adapter kaynağı `006c4dd2` hâline döndürülerek alınan bağımsız bir derlemeyle bit bit yeniden üretildi. Paket digest'i değişmedi. Blok R24 dist'inde ve 10 dosyalı R25 adayında (`EB3D854F…71FC`) **DURUR**; bu kasıtlıdır, fail-closed davranış.

- **Yürütme sırası:** R25B yayını (ayrı owner onayı; yükseltilmiş pencere) → İ13 → İ14 → İ15 → İ16. Her blok bir öncekinin kapanışından sonra ve kendi GO ref'iyle koşulur.
- **R25B disposable regresyonu (aday dist `dist-r25b`, API `:8113`, yalnız disposable DB):** İ14 14/14 PASS. Bunlar canlı kabul değildir. 10 dosyalı R25 adayının sonuçları R25B'nin kanıtı SAYILMAZ; bu koşum yenidir.
- **R24 → R25B farkı:** 7 portal dosyası. Eklenen 0, silinen 0, migration 0.
- **Düzeltme notu (dış bağlantı):** Disposable provadaki API, TCMB kur servisine (`185.98.252.10:443`, ExchangeRateService, salt okuma) dışa bağlandı. Bu bir gönderim değildir. Önceki "API'nin tek uzak bağlantısı disposable DB" ölçümü yalnız o anın görüntüsüdür, sürekli bir garanti değildir.

**Canlı yayın ve canlı koşum AYRI owner onayı ister; bu bölüm onları başlatmaz.**

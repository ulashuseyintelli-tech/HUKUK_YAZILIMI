# CLIENT İ13 — H2 ADRES/İLETİŞİM CANLI KABUL PAKETİ (R01 — düzenek + disposable prova; CANLI KOŞULMADI)

**Kanonik bağ:** R02 §3.3 İ13 — "H2 adres/iletişim kabulü (ölçüt İ2'den): birincil adres değişimi/arşiv/restore
**ELEVATED**, VIEWER **DENY**, USER birincil-olmayan create/update; **iletişim kişileri** CRUD ve yetki sınırı ·
Kapanış: ölçüt setinin tamamı PASS". Ölçüt kaynağı: `client-acceptance-criteria-i2-r01/…-I2-R01.md` §2 (**H2-01…H2-10**);
KB-03 önerisi (a): iletişim kişileri için ayrı CRUD YOK, `PUT /clients/:id` tam değiştirme ölçülür (H2-10).

**Bu belge canlı kabul VERMEZ.** Canlı koşum ayrı owner GO'su ister (§6). İ12 GO'su buraya genişletilmez.

---

## 1. Düzenek — yeni mekanizma YOK

| Parça | Kaynak | Rol |
|---|---|---|
| Kurulum | İ3 `setupI3` (`i3-lib.js`) | `ah-<runId>` + `ah-<runId>-x` (yabancı) sentetik tenant, aktörler, müvekkil, dosya |
| Ölçüm | İ3 `i3-h2-address.js` (`runH2`) | H2-01…H2-10 — ürün HTTP yolundan; DB yalnız okunur |
| Kimlik bağı | İ12 `i12-live-identity.js` | kapanıştan önce hedef/yabancı ID↔slug↔runId; yoksa SIFIR yazma |
| İ13 | `scripts/i13-lib.js` · `i13-live-run.js` · `i13-live-recover.js` · `i13-owner-live-block.ps1` | kapılar · tek koşum · finally kapanışı · bağımsız kurtarma · owner bloğu |

`i13-live-run.js` **mevcut tek canlı API'ye** bağlanır. Yeni API başlatmaz; env, restart ve firewall değişikliği yoktur.
**Gönderim yolu YOK:** H2 uçlarının hiçbiri e-posta göndermez. Office/SMTP satırına dokunulmaz.
Login bütçesi: koşumda 3 oturum (viewer · user · elev1), kapanış kanıtında 1 login. Ürün sınırı 10/dk.

**Paket digest'i** `8AD6EE1166678E4D5B7417AA28BC48F661BCA610A3D01873826C1442E73648BD`. Reçete İ12 ile aynıdır:
`relpath` + NUL + UPPER sha256 + LF, ordinal sıralama, SHA256. Kapsamdaki dosyalar:

| Dosya | sha256 |
|---|---|
| `client-live-acceptance-i13-r01/scripts/i13-lib.js` | `59BA7360…D385` |
| `client-live-acceptance-i13-r01/scripts/i13-live-run.js` | `4BF58786…94CD` |
| `client-live-acceptance-i13-r01/scripts/i13-live-recover.js` | `5C7D7352…3C87` |
| `client-acceptance-runners-i3-r01/scripts/i3-h2-address.js` | `6F25425B…FF60` |
| `client-acceptance-runners-i3-r01/scripts/i3-lib.js` | `56F3788E…74A3` |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | `DF882DB7…BFD7` |
| `client-live-acceptance-i12-r01/scripts/i12-live-identity.js` | `9516E462…774F` |

## 2. Ölçüt haritası (İ2 §2 — ürün sözleşmesi, uydurma yok)

| Kimlik | Gözlem |
|---|---|
| I13-00 | ölçüm geçerliliği: `user` ile `elev1` aynı rolde (USER), fark yalnız PARTNER bağı; ADMIN yolu kapalı |
| H2-01 | VIEWER dört adres mutasyonunda 403 `CLIENT_MUTATION_DENIED_VIEWER`; kalıcı etki yok |
| H2-02 | ilk adres otomatik birincil (D03 STANDARD, elevated gerekmez) → 201 |
| H2-03 | birincillik devri: USER 403 `…_LIFECYCLE` (etki yok), elevated 200; tek birincil |
| H2-04 | mevcut birincilin alanı: USER 403, elevated 200 |
| H2-05 | arşiv elevated 201; tekrarı sabit hata 400 (idempotent başarı değil) |
| H2-06 | geri alma elevated 201; tekrarı 400 `CLIENT_ADDRESS_ALREADY_CURRENT` |
| H2-07 | fiziksel silme elevated'da bile 400 `…PHYSICAL_DELETE_NOT_AUTHORIZED`; arşive çevrilmez |
| H2-08 | durum filtresi doğru ayırır; başka tenant müvekkili **404** |
| H2-09 | invariant ihlali 400; geçersiz ara durum commit edilmez |
| H2-10 | iletişim: VIEWER 403 (korunur); USER tam değiştirme 200; karşılaştırma **kayıt kimliğiyle** (sayım tek başına kanıt değil) |
| I13-CLOSE | nihai kapanış: kullanıcılar pasif + Case CLOSED · login 401 · eski token 401; HTTP yoklaması belirsizse ÖLÇÜLEMEYEN |
| I13-ISO | sentetik olmayan tenant'ların client/user dağılım parmak izi koşum öncesi = sonrası |

## 3. CANLI YAZMA ENVANTERİ — yalnız `ah-<runId>` ve `ah-<runId>-x`

Değerler disposable provada **ölçüldü**; her koşum için aynıdır.
- **INSERT (kurulum):** Tenant 2 · User 9 · Lawyer 3 · StaffMember 5 · PermissionGrant 1 · Client 3 (yabancı tenant'ta 1) · Case 1 · CaseClient 1 · Debtor 1 (+ CaseDebtor bağı). Yabancı tenant'ta kullanıcı **yoktur**; bu tasarım gereğidir.
- **Ürün yolundan (H2 koşumu):**
  - ClientAddress 2 (oluştur / güncelle / arşiv / geri al).
  - ClientContact tam değiştirme; sonuçta 1 kişi.
  - AuditLog 10: `CLIENT_ADDRESS_CREATE` 2 · `_UPDATE` 2 · `_ARCHIVE` 2 · `_RESTORE` 1 · `_PRIMARY_REASSIGN` 1 · `CLIENT_UPDATE` 2.
- **UPDATE (kapanış):**
  - İki tenant'ta tüm kullanıcılar `isActive=false` ve `tokenVersion+1`.
  - Hedefte `Case.status` ACTIVE→CLOSED; böylece case tabanlı cron'lar bu tenant'ı seçemez.
- **DELETE:** yok. Kanıt satırları korunur.
- **Gerçek tenant'a yazma:** yok. Tüm yazmalar `ah-` sentetik önekine bağlıdır. I13-ISO bunu ölçer; kapanıştaki kimlik bağı yanlış hedefte hiçbir şey yazmaz.

## 4. DISPOSABLE PROVA (2026-09-18) — CANLI KABUL DEĞİL

| Öğe | Değer |
|---|---|
| DB | konteyner `hy-i13-894280b1-db` · `postgres:16-alpine` · `127.0.0.1:5443` · `hukuk_i13_894280b1_test` · **130 migration** (RELEASE23 = canlıyla aynı; R24 migration delta 0) · 210 tablo |
| API | **canlı R24 dist** `HY_W4_RELEASE23/…/dist/apps/api/src/main.js` · `:8113` · İ3 `i3-start-api` (koşuma özel JWT) · API'nin uzak bağlantısı YALNIZ `127.0.0.1:5443` (ölçüldü) · `PHASE9_REDIS_ENABLED=false` · gönderim/outbox/davet/aylık teslim bayrakları `false` |
| Komşu | izolasyonun anlamlı olması için sentetik olmayan tenant `komsu-buro` + müvekkil |

| Senaryo | Sonuç |
|---|---|
| **N1** normal akış (boş komşu) | **13/13 PASS**, çıkış 0. Bu turda I13-ISO önemsizdi (0 tenant). N2 bunu kapatır. |
| **N2** normal akış (komşu tenant var) | **13/13 PASS**, çıkış 0 · I13-ISO önce = sonra `1ca15e3c…` / 7 tenant |
| NC1a–e kapılar | onay yok → 3 · yanlış GO biçimi (I12) → 3 · beklenen DB farklı → 4 · türetilmemiş slug → 4 · API beyanı farklı → 4 · **tenant sayısı değişmedi** (yazma yok) |
| NC2 kurulumdan sonra çöküş (API'ye ulaşılamaz) | çıkış 1 (DURDU) · `finally` kapanışı çalıştı: aktif kullanıcı 0, ACTIVE case 0 · I13-CLOSE **ÖLÇÜLEMEYEN** (HTTP yoklaması belirsiz; PASS sayılmaz) |
| NC3a–d bağımsız kurtarma | tekrar kurtarma idempotent (0) · bilinmeyen runId → yazma yok · **gerçek tenant'ı gösteren sahte makbuz → kimlik bağı YOK, çıkış 4, sıfır yazma** · GO ref yok → 3 |
| NC4 izolasyon parmak izi | komşuya eklenen müvekkil yakalandı (digest değişti), geri alınınca eşitlendi |

Toplam: negatif kontroller **15/15 OK**. Koşum öncesi ve sonrası betik hash'leri **aynı**.
**Prova ders kaydı:** prova yardımcısında satır içi `node -e` Volta shim'i nedeniyle boş çıktı verdi. NC4 dosyaya taşındı; ürün ve paket etkilenmedi.

## 5. Kanıtlamadıkları
- Canlıda koşulmadı. Prova, canlı dist'in davranışını **disposable DB** üzerinde ölçer; canlı veriyle etkileşimi ölçmez.
- H2'nin dışındaki hizmetler (H4/H8/H7) bu paketin kapsamında değildir.

## 6. CANLI KOŞUM — AYRI OWNER GO GEREKİR (hazır paket)

**Gerekli owner eylemi:**
- İ13 için **yeni GO ref** (`OWNER-GO-CLIENT-I13-YYYYMMDD-RNN`). Ref repoda hiç geçmemiş olmalı.
- `scripts/i13-owner-live-block.ps1` bloğunu **normal PowerShell**'de çalıştırmak. Yönetici gerekmez; env, restart ve firewall işlemi yoktur.

**Blok sırası:**
1. main senkron ve temiz.
2. Paket digest `8AD6EE11…48BD` · canlı dist `1524EDC1…4D4E` (R25B; R24 `87712E0E…5453` ve 10-dosyalı R25 `EB3D854F…71FC` üzerinde blok DURUR).
3. Tek 8080 dinleyicisi · başka kabul süreci yok · açık pencere kuralı yok · launcher DB kimliği `127.0.0.1:5432/hukuk_db`.
4. GO ref **yerel** girilir. Biçim ve tüketilmemişlik (`git grep` 0) kontrol edilir.
5. runId üretilir. DB URL canlı `.env`'den süreç içinde okunur, yazdırılmaz.
6. `i13-live-run.js` çalışır.
7. GO ref tüketimi yalnız sha256 olarak kaydedilir. Sır ortam değişkenleri temizlenir. Manifest yazılır.

Kanıt dizini: `Documents\CLIENT-EVIDENCE-20260911\i13-live-<runId>-<ts>`.

**Kapanış ölçütü (İ13 KAPANIR):**
- H2-01…H2-10 + I13-00 + I13-CLOSE + I13-ISO **13/13 PASS**; FAIL 0, ÖLÇÜLEMEYEN 0.
- CLIENT bağımsız salt-okuma doğrulaması: hedef ve yabancı tenant aktif kullanıcı 0 · ACTIVE case 0 · komşu dağılım eşit.
- Kayıt PR'ı → CI → merge → post-merge CI SUCCESS.

Aksi durumda İ13 açık kalır ve somut boşluk raporlanır. **Hizmet kabulü (H2) owner kabulü olmadan değişmez.**

## R25 bağı (2026-09-19, R02) — canlı dist pini R25B'ye değişti

Owner kararıyla R25 yalnız onaylı K-1 (#2720) ve PSUS (#2721) portal düzeltmeleriyle sınırlandı. #2716'nın 3 replay adapter dosyası bu yayına **dahil değil**. Owner bloğunun canlı dist kapısı **R25B** artefaktına bağlandı: `1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E` (3867 dosya).

R25B **birleşik bir artefakttır**: tabanı canlı R24 dist'i (`87712E0E…5453`), üzerine yalnız 7 portal dosyası `ebbe1ae8` derlemesinden kopyalandı. Aynı digest, `ebbe1ae8` kaynağında yalnız adapter kaynağı `006c4dd2` hâline döndürülerek alınan bağımsız bir derlemeyle bit bit yeniden üretildi. Paket digest'i değişmedi. Blok R24 dist'inde ve 10 dosyalı R25 adayında (`EB3D854F…71FC`) **DURUR**; bu kasıtlıdır, fail-closed davranış.

- **Yürütme sırası:** R25B yayını (ayrı owner onayı; yükseltilmiş pencere) → İ13 → İ14 → İ15 → İ16. Her blok bir öncekinin kapanışından sonra ve kendi GO ref'iyle koşulur.
- **R25B disposable regresyonu (aday dist `dist-r25b`, API `:8113`, yalnız disposable DB):** İ13 13/13 PASS. Bunlar canlı kabul değildir. 10 dosyalı R25 adayının sonuçları R25B'nin kanıtı SAYILMAZ; bu koşum yenidir.
- **R24 → R25B farkı:** 7 portal dosyası. Eklenen 0, silinen 0, migration 0.
- **Düzeltme notu (dış bağlantı):** Disposable provadaki API, TCMB kur servisine (`185.98.252.10:443`, ExchangeRateService, salt okuma) dışa bağlandı. Bu bir gönderim değildir. Önceki "API'nin tek uzak bağlantısı disposable DB" ölçümü yalnız o anın görüntüsüdür, sürekli bir garanti değildir.

**Canlı yayın ve canlı koşum AYRI owner onayı ister; bu bölüm onları başlatmaz.**

## 7. CANLI KOŞUM SONUCU — İ13 KAPANDI (2026-09-19)

Owner İ13 canlı kabul GO'sunu verdi ve bloğu normal PowerShell'de kendisi koşturdu. GO ref yerel kaldı; literal hiçbir yere
yazılmadı. Owner çıktısı: **RUNID `8811f395` · çıkış 0**. Kanıt dizini:
`C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911\i13-live-8811f395-20260919-224001`.

**Bağlam (`owner-block.json`).** Koşum aşağıdaki bağlamda yapıldı:

| Alan | Değer |
|---|---|
| Main | `d78d610e7620919997b0240f77d9facfceac181c` |
| Paket | `8AD6EE11…48BD` |
| Canlı dist | `1524EDC1…4D4E` (R25B) |
| API pid | 36568 |
| Başlangıç | 2026-09-19T19:40:01Z |

**Koşum sonucu (`i13-evidence.json`): 13/13 PASS · FAIL 0 · ÖLÇÜLEMEYEN 0.**
- I13-00 ve H2-01…H2-10 geçti.
- I13-CLOSE: `closure.ok=true`. Hedef tenant'ta aktif kullanıcı 0 ve 1 case CLOSED oldu; yabancı tenant'ta aktif kullanıcı 0. Giriş 401, eski token 401.
- I13-ISO: izolasyon parmak izi önce ve sonra aynı, `f3e0eca6a4b54974` / 15 tenant.

**CLIENT bağımsız kapanış doğrulaması: PASS (6/6).** Betik `i13-closure-verify.js`, sha256
`24CD1E5141FD7C9429AF85CB70A4D1288942E4E47FBE857ECDC61093531553EE`. İ13 kütüphanesini kullanmaz; ayrı süreçte ve `hukuk_db`
üzerinde READ ONLY transaction içinde çalışır. Koşum iki kez yapıldı:
- r1: `786DA4B1…E924`
- r2: `D259993E…4DD2` (owner çıktısından sonra, taze)

| Denetim | Sonuç |
|---|---|
| V1 kanıt | 13 zorunlu satırın hepsi PASS · runId eşit |
| V2 manifest | 5 satır, tamamı eşit · manifest dışı dosya 0 (`SHA256-MANIFEST.txt` `C87E2B22…2E7`) |
| V3 erişim — hedef `ah-8811f395` | aktif/toplam kullanıcı 0/9 · ACTIVE case 0 · aktif portal kullanıcısı 0 |
| V3 erişim — yabancı `ah-8811f395-x` | aktif/toplam kullanıcı 0/0 · ACTIVE case 0 · aktif portal kullanıcısı 0 |
| V4 gerçek tenant izolasyonu | şimdi `f3e0eca6a4b54974`/15 = koşum öncesi |
| V5 GO ref | tüketim kaydında yalnız sha256 (`literalWritten=false`) · literal içeren dosya 0 |

Doğrulayıcının ret yolları disposable ortamda ayrıca sınandı: bozuk manifest ve GO ref literali, ikisi de FAIL verdi.

**Kanıt dosyaları (sha256):**

| Dosya | sha256 |
|---|---|
| `i13-evidence.json` | `61A6EFAD6680A3FC4B1CE035A4772997ADD976D9FDF9A601661A7F371A9264A9` |
| `i13-setup-receipt.json` | `C8DEA6E75C6039CC927E25E7FC7A74EF98D48493C201EF04520FE8C6A0F00E72` |
| `i13-run.log` | `FD8EC2EC7FF6661FA6D9BF8C391D63096EE330F7D7991825B252FC731986BF79` |
| `goref-consumed.json` | `B7C84C0DCC3BBD9B6A2C7EC4566EFA1377EA14C5BD97C086539F6BF9F04C6B9B` |
| `owner-block.json` | `4977D61E9E9C18A2573E02D535832CE772F7A12B5CF72BF4364F9D049CA3E766` |

**Pencere.** Dört yürütücü canlı kabul penceresi için açık teyit verdi. Pencere içindeki iki olay kayda geçti:
1. **Docker Desktop kendi kendine güncellendi.** 19:32Z'de 4.91'e güncellenip 19:33Z'de yeniden başladı. Canlı `hukuk-postgres`
   konteyneri bu nedenle yaklaşık 19:34Z'de yeniden başladı; bunu hiçbir oturum yapmadı. API süreci yeniden başlamadı. Koşum bu
   olaydan **sonra** (19:40:01–03Z) başladı ve bitti; DB yeniden başlaması koşumun içine düşmedi.
2. **Salt-okuma yedek alındı.** "Windows Disk Temizliği" oturumu, owner'ın Docker taşıma talimatıyla 19:36Z'de canlı DB'den
   salt-okuma bir `pg_dump` aldı (`default_transaction_read_only=on`, 0,7 sn). Yazma yapılmadı. Yedek koşumdan önce alındığı için
   İ13 sentetik satırlarını içermez.

**Sonuç: İ13 KAPANDI.** Sayaç **15/18**. Hizmet kabulü (H2 dahil) owner kabulü olmadan değişmez: **0/8**.
Kanıt satırları silinmez; sentetik tenant'lar kapalı durumda kalır.

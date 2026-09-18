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
2. Paket digest `8AD6EE11…48BD` · canlı dist `EB3D854F…71FC` (R25; R24 `87712E0E…5453` üzerinde blok DURUR).
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

## R25 bağı (2026-09-19) — canlı dist pini değişti

Owner bloğunun canlı dist kapısı **R25** artefaktına bağlandı: `EB3D854F708519FFB788B41C4FF2B716F8FAE3C65DDAFC2BFB718446B91171FC` (kaynak `ebbe1ae8cce04de5579944bbf6b7f46a0efe0412`, 3867 dosya). Paket digest değişmedi. Blok R24 dist (`87712E0E…5453`) üzerinde **DURUR**; bu kasıtlıdır, fail-closed davranış.

- **Yürütme sırası:** R25 yayını (ayrı owner onayı; yükseltilmiş pencere) → İ13 → İ14 → İ15 → İ16. Her blok bir öncekinin kapanışından sonra ve kendi GO ref'iyle koşulur. Canlı pencereler çakışmaz.
- **R25 disposable regresyonu (aday dist, API `:8113`, yalnız disposable DB):** İ13 13/13 PASS. Bunlar canlı kabul değildir.
- **R24 → R25 farkı:** 10 dosya. 7'si portal dosyası (#2720 K-1, #2721 PSUS). 3'ü summary-engine replay adapter dosyası (#2716): yalnız statik manifest sabiti içerir, Nest modül grafiğinde yoktur. Migration farkı 0.
- **Düzeltme notu (dış bağlantı):** Disposable provadaki API, TCMB kur servisine (`185.98.252.10:443`, ExchangeRateService, salt okuma) dışa bağlandı. Bu bir gönderim değildir. Önceki "API'nin tek uzak bağlantısı disposable DB" ölçümü yalnız o anın görüntüsüdür, sürekli bir garanti değildir.

**Canlı yayın ve canlı koşum AYRI owner onayı ister; bu bölüm onları başlatmaz.**

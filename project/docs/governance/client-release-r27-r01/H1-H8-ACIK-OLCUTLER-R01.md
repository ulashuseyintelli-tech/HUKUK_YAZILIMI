# H1–H8 AÇIK ÖLÇÜTLER TABLOSU (R01) — yalnız kayıttan, satır atıflı

> **DURUM (2026-09-29): SALT OKUMA BELGE.** Hiçbir betik koşulmadı, hiçbir sayaç ilerletilmedi. **Hizmet kabulü 0/8 DEĞİŞMEZ**
> (`PB:4539`, `ORD:218`). Bu belge kabul vermez, GO vermez, yetki vermez; yalnız sekiz hizmetin (H1–H8) kayıtlı ölçütlerini,
> kapanış kaydındaki sonuçlarını ve owner'dan beklenen somut işlemi tek tabloda toplar. Kaynak vermeyen hiçbir sayı yazılmadı;
> kaynakta sayı yoksa "kayıtta sayı yok" denir. Repo public: sır, adres, GO literali, canlı topoloji ayrıntısı yoktur.

## 0. Kaynak kısaltmaları (tümü `project/docs/governance/` altında, salt okuma)

| Kısaltma | Dosya |
|---|---|
| `PB` | `product-backlog.md` (H eşlemesi `PB:4523-4543`) |
| `DL` | `decision-log.md` |
| `I2` | `client-acceptance-criteria-i2-r01/CLIENT-ACCEPTANCE-CRITERIA-I2-R01.md` (ölçüt adları/kimlikleri; §9 `I2:687-706`, §10 `I2:708-717`; kanıt sınıfı satırları "**Kanıt:** `YEREL-İZOLE`" / `CANLI-YETKİ`) |
| `I3` | `client-acceptance-runners-i3-r01/CLIENT-ACCEPTANCE-RUNNERS-I3-R01.md` (disposable kabul düzenekleri; "Yerel PASS canlı kabul DEĞİLDİR" `I3:29-30`; H5 tablosu `I3:116-129`) |
| `I9` | `client-live-acceptance-i9-r01/CLIENT-LIVE-ACCEPTANCE-I9-R01.md` |
| `I10` | `client-live-acceptance-i10-r01/CLIENT-LIVE-ACCEPTANCE-I10-R01.md` |
| `I11P` | `client-live-acceptance-i11-r01/CLIENT-LIVE-ACCEPTANCE-I11-R01.md` (paket; ölçüt haritası `I11P:90-101`) |
| `I11K` | `client-live-acceptance-i11-r01/I11-TAM-CANLI-KABUL-KAPANIS-KAYDI-R01.md` (kapanış kaydı) |
| `I12` | `client-live-acceptance-i12-r01/CLIENT-LIVE-ACCEPTANCE-I12-R01.md` (canlı kayıt §9.15 `I12:995-1104`) |
| `I13` · `I14` · `I15` · `I16` | ilgili `client-live-acceptance-i1x-r01/CLIENT-LIVE-ACCEPTANCE-I1x-R01.md` |
| `ORD` | `office-remaining-decisions-r01/OFFICE-REMAINING-DECISIONS-R01.md` (§1.2 `ORD:21-46`, §2 `ORD:63-134`, §4 `ORD:157-173`, §7.1-7.2 `ORD:221-247`) |
| `H5P` | `client-h5-intake-url-r01/H5-INTAKE-URL-PACKAGE-R01.md` (dar kabul kaydı §8 `H5P:355-438`) |
| `EXA` | `client-external-access-r01/CLIENT-EXTERNAL-ACCESS-PACKAGE-R01.md` (D-1…D-9 tanımı §7 `EXA:193-210`) |
| `EXI` | `client-extacc-intake-chain-r01/EXTACC-INTAKE-CHAIN-PACKAGE-R01.md` (§12 `EXI:184-244`) |
| `D4P` | `client-extacc-portal-d4-r01/EXTACC-D4-PORTAL-LOGIN-PACKAGE-R01.md` (§13.6 `D4P:315-322`) |
| `D5P` · `D8P` · `R27` | `client-extacc-portal-d5-r01/EXTACC-D5-PORTAL-RESET-PACKAGE-R01.md` · `client-extacc-d8-staff-surface-r01/EXTACC-D8-STAFF-SURFACE-PACKAGE-R01.md` · `client-release-r27-r01/R27-RELEASE-PACKAGE-R01.md` (bu dalda; üçü de bu dalda **commit edilmemiş** değişiklik taşır — atıflar §12'de sha'sı verilen çalışma-ağacı sürümüne aittir: `D5P` `47cb22c5…`, `D8P` `121935f2…`, `R27` `766de640…`, kapanış düzeltmesi 2026-09-29) |
| `R23C` · `R23N` | `release23-candidate-r01/RELEASE23-R28-CUTOVER-PAKETI-R01.md` (kapsam PR'ları `R23C:20`) · `release23-candidate-r01/RELEASE23-TEK-NIHAI-PAKET-R03.md` (V-B derlenmiş B-I11-3 `R23N:178`) |

Sonuç sözlüğü: **PASS** / **FAIL** / **ÖLÇÜLEMEYEN** = kapanış kaydının kendi etiketi; **KAYITTA YOK** = ölçüt kimliğiyle
eşleşen bir kapanış satırı bulunamadı; **DISPOSABLE** = yalnız izole ortamda ölçüldü, kayıt bunu açıkça "canlı PASS değildir" diye
işaretler.

---

## 1. Sayaçların kaynaktan doğrulanması (ARTIRILMADI)

`PB:4539-4540` şu sayaçları verir: **H1/H3 sayı yok · H2 15/18 · H4 16/18 · H5 11/17 · H6 14/18 · H7 18/18 · H8 17/18**.

| H | PB'deki sayaç | Kaynakta bulunan | Doğrulama |
|---|---|---|---|
| H1 | "sayı verilmedi" | `I9:391` "Sayaç **9/17**" (CLIENT program sayacı) · `I9:439` "PASS 14 · FAIL 0 · ÖLÇÜLEMEYEN 0" · `I9:383-389` 7 ölçüt satırı "KARŞILANDI — canlı" | **H1'e özgü "x/y" ölçüt sayacı kayıtta yok**; var olan sayılar program sayacı (9/17) ve ölçüm sayısı (14 PASS). PB ifadesi bu anlamda doğru |
| H2 | 15/18 | `I13:187` "Sayaç **15/18**" · `DL:1052` | **Eşit** |
| H3 | "sayı verilmedi" | `I10:557` "Sayaç **10/17**" · `I10:614` "PASS 10 · FAIL 0 · ÖLÇÜLEMEYEN 0 · bulgu 0" · `DL:1041` | **H3'e özgü ölçüt sayacı kayıtta yok**; var olanlar program sayacı (10/17) ve ölçüm sayısı (10 PASS) |
| H4 | 16/18 | `I14:189` "Sayaç **16/18**" · `DL:1053` | **Eşit** |
| H5 | 11/17 | `I11K:6` "Sayaç 10/17 → **11/17**" · `I11K:76` | **Eşit** (payda 17: İ16 henüz kritik yola girmemişti; 18'e geçiş `client-remaining-decisions-r01/CLIENT-I4-I5-OWNER-DECISIONS-R01.md:57`) |
| H6 | 14/18 | `I12:1102` "Sayaç **14/18**" · `DL:1045`, `DL:1048` | **Eşit** |
| H7 | 18/18 | `I16:233` "Teknik sayaç **18/18**" · `DL:1055` | **Eşit** |
| H8 | 17/18 | `I15:215` "Sayaç **17/18**" · `DL:1054` | **Eşit** |

**Bağlayıcı okuma (`ORD:221-224`, 2026-09-26 düzeltmesi):** bu sayılar hizmetin kendi ölçüt eşiği DEĞİL, CLIENT programının
**18 İ-kilometre taşından kaçının canlı kapandığı**nı gösteren teknik sayaçtır; her hizmetin İ kapanışı kendi ölçüt setinde
**FAIL 0 · ÖLÇÜLEMEYEN 0** ile geçti. Bu belge o sayaçları olduğu gibi aktarır, yorumlamaz ve artırmaz.

R27 belgesinin önceki sürümündeki (sha `6a6be411…`, satır 44-50) "H2: 3 ölçüt owner kararı · H4: 2 ölçüt · H5: 6 ölçüt · H6: 4 ölçüt ·
H8: 1 ölçüt (kapsam cümlesi kararı)" sayılarının **türetimi hiçbir kapanış kaydında ya da `ORD`'de bulunamadı** (arama: bu dal +
kanonik governance). Kapanış düzeltmesiyle (2026-09-29) `R27:49-56` "Kalan" sütunu bu belgenin §2–§10 kalemleriyle **değiştirildi**;
türetimsiz sayılar artık R27'de yoktur. Aşağıdaki tablolar kayıtta **adlandırılan** kalemleri sayar; kaynağı gösterilmeyen sayı
doğrulanmış sayılmaz.

---

## 2. H1 — Kimlik (`MUTATION_AUTHORITY` + #2552) · İ9 · runId `d19ce2c7` · `PB:4530`

Kayıt: `I9:406-491` (owner GO tek koşum; `I9:428` koşum; `I9:439` PASS 14 · FAIL 0 · ÖLÇÜLEMEYEN 0). H1 için `I2`'de H1-xx kimlikli
ölçüt **yazılmamıştır** (`I2:687-706` §9 yalnız H2/H4/H5/H7'yi işler); H1'in ölçüt kimlikleri İ9 paketinin kendi haritasıdır
(`I9:62-71`).

| Ölçüt kimliği · gerçek adı | Kapanış kaydındaki sonuç | Açık ise neden | Owner'dan beklenen SOMUT işlem |
|---|---|---|---|
| `MUTATION_AUTHORITY` · VIEWER `PUT /clients/:id` 403 `CLIENT_MUTATION_DENIED_VIEWER` | **PASS — canlı** (İ8 U-1'den devralındı) `I9:383` | Kapalı | — |
| `#2552-a` create · 400 `CLIENT_IDENTITY_CHECKSUM_INVALID` + `offendingFields` | **PASS — canlı** N-1 `d19ce2c7` `I9:384`, `I9:434` | Kapalı | — |
| `#2552-b` değişen-değer | **PASS — canlı** N-2 `I9:385`, `I9:434` | Kapalı | — |
| `#2552-c/d` PUT ve POST/dedup reaktivasyon | **PASS — canlı** N-3/N-4 `I9:386`, `I9:434` | Kapalı | — |
| `A-0` üç uç anonim 401 | **PASS — canlı** A0-1/2/3 `I9:387`, `I9:438` | Kapalı | — |
| `A-7` pasif + geçersiz kimlik 400 / pasif + geçerli kimlik 200 | **PASS — canlı** P-1 `I9:388`, `I9:436` | Kapalı | — |
| `A-8` zaten aktif kayıtta 200, lifecycle alanı yazılmaz | **PASS — canlı** A-8a/A-8b `I9:389`, `I9:437` | Kapalı (B-1 çözüldü `I9:248`) | — |
| **Bulgu B-2** · lifecycle ret gövdesi stabil `code` taşımıyor (L-1 403, yazma 0) | **AÇIK, BLOKE ETMEZ** `I9:255-260`; L-1 `I9:435` | Ürün eksiği (ret gövdesi sözleşmesi); "ürün işi açılmaz, R27 düzeltmez" **belgenin hükmü**, owner kararı bulunamadı `ORD:236` | **Karar:** B-2 için "kabul dışı / sonraki iş" ya da "ürün işi aç" hükmünü `decision-log`'a yaz (ölçüt kümesinde olmadığı için sayacı etkilemez) |
| **H1 hizmet kabulü** | **0/8 içinde AÇIK** `I9:484-486`, `PB:4530` | Yalnız owner hizmet-kabulü kararı; yeniden ölçüm gerekmez `PB:4530` | **İmza:** `ORD:157-173` toplu metnindeki H1 satırını onayla (B-2 hükmü açıkça yazılarak, `ORD:244-246` uyarısı) |

## 3. H2 — Adres ve iletişim (H2-01…H2-10) · İ13 · runId `8811f395` · `PB:4531`

Kayıt: `I13:131-188`; koşum 13/13 PASS · FAIL 0 · ÖLÇÜLEMEYEN 0 (`I13:147`); bağımsız doğrulama 6/6 (`I13:152-165`); `DL:1052`.
Ölçüt adları `I2:80-220`; İ13 haritası `I13:42-54`.

| Ölçüt kimliği · gerçek adı (`I2`) | Kapanış kaydındaki sonuç | Açık ise neden | Owner'dan beklenen SOMUT işlem |
|---|---|---|---|
| H2-01 · VIEWER hiçbir adres mutasyonu yapamaz `I2:80` | **PASS — canlı** `I13:148` (harita `I13:43`) | Kapalı | — |
| H2-02 · İlk adres otomatik birincil olur ve bu STANDARD'dır `I2:91` | **PASS — canlı** `I13:148` (`I13:44`) | Kapalı | — |
| H2-03 · Birincillik devri elevated ister `I2:105` | **PASS — canlı** `I13:148` (`I13:45`) | Kapalı | — |
| H2-04 · Mevcut birincil kaydın herhangi bir alanı elevated ister `I2:120` | **PASS — canlı** `I13:148` (`I13:46`) | Kapalı | — |
| H2-05 · Arşivleme her zaman elevated; tekrarı sabit hata `I2:135` | **PASS — canlı** `I13:148` (`I13:47`) | Kapalı | — |
| H2-06 · Geri alma her zaman elevated; tekrarı sabit hata `I2:148` | **PASS — canlı** `I13:148` (`I13:48`) | Kapalı | — |
| H2-07 · Fiziksel silme her zaman reddedilir ve arşive çevrilmez `I2:160` | **PASS — canlı** `I13:148` (`I13:49`) | Kapalı | — |
| H2-08 · Okuma sözleşmesi ve kapsam dışı 404 `I2:173` | **PASS — canlı** `I13:148` (`I13:50`) | Kapalı | — |
| H2-09 · Invariant ihlali geçersiz ara durumu COMMIT etmez `I2:186` | **PASS — canlı** `I13:148` (`I13:51`) | Kapalı | — |
| H2-10 · İletişim kişileri: ayrı CRUD yoktur, tam değiştirme vardır `I2:198` | **PASS — canlı** `I13:148` (`I13:52`); **KB-03 önerisi (a) ile** ölçüldü `I13:6` | **Owner kararı:** KB-03 (ayrı CRUD ucu gerekli mi?) `I2:680`; "(a) mevcut tam-değiştirme korunur" yalnız belge önerisi, **owner kararı bulunamadı** `ORD:237`, `ORD:244` | **Karar:** KB-03 için (a) "mevcut davranış kabul, ayrı CRUD ürün işi açılmaz" ya da (b) "ayrı ürün işi aç" hükmünü `decision-log`'a yaz |
| I13-00 / I13-CLOSE / I13-ISO (ölçüm geçerliliği, kapanış, izolasyon) | **PASS — canlı** `I13:148-150` | Kapalı | — |
| **H2 hizmet kabulü** | **0/8 içinde AÇIK** `I13:187` | Yalnız owner hizmet-kabulü kararı `PB:4531` | **İmza:** `ORD:157-173` H2 satırı; KB-03 hükmü açıkça yazılmalı (`ORD:244-246`) |

Önceki R27 sürümündeki "3 ölçüt owner kararı" ifadesi için kayıtta adlandırılan tek karar kalemi **KB-03/H2-10**'dur; diğer ikisi için
kaynak bulunamadı. Güncel `R27:50` yalnız KB-03/H2-10'u taşır.

## 4. H3 — Vekalet · İ10 · runId `c9b07bcb` · `PB:4532`

Kayıt: `I10:570-666`; PASS 10 · FAIL 0 · ÖLÇÜLEMEYEN 0 · bulgu 0 (`I10:614`); `DL:1041` (`CLIENT-I10-LIVE-R01`). `I2`'de H3-xx
kimlikli ölçüt yazılmamıştır; kimlikler İ10 haritasıdır (`I10:68-77`).

| Ölçüt kimliği · gerçek adı | Kapanış kaydındaki sonuç | Açık ise neden | Owner'dan beklenen SOMUT işlem |
|---|---|---|---|
| A-1 · VIEWER `POST /poa` 403, yazma 0 | **PASS — canlı** `I10:551`, `I10:607` | Kapalı | — |
| A-2 · elevated olmayan USER `PUT /poa/:id` 403, satır değişmez | **PASS — canlı** `I10:552`, `I10:609` | Kapalı | — |
| A-3 · yetkili 201, kayıt oluşur | **PASS — canlı** `I10:553`, `I10:608` | Kapalı | — |
| A-4 · legacy upload 403, dosya/DB yazımı 0 (iki kök) | **PASS — canlı** `I10:554`, `I10:610` | Kapalı | — |
| K9 · POA'sız capability etkisiz (`NO_VALID_POA`) | **PASS — canlı** `I10:555`, `I10:611` | Kapalı | — |
| **H3 hizmet kabulü** | **0/8 içinde AÇIK** `I10:657-659` | Yalnız owner hizmet-kabulü kararı `PB:4532`; kayıtta açık madde **yok** `ORD:238` | **İmza:** `ORD:157-173` H3 satırı (runId `c9b07bcb` — `ORD:238` notu: §4 metni H3 runId'sini vermiyordu) |

## 5. H4 — Talimat, beyan, rıza ve KVKK (H4-01…H4-08) · İ14 · runId `e28c5c06` · `PB:4533`

Kayıt: `I14:130-190`; 14/14 PASS · FAIL 0 · ÖLÇÜLEMEYEN 0 (`I14:149`); bağımsız doğrulama 7/7 (`I14:158-172`); `DL:1053`.
Ölçüt adları `I2:235-357`; İ14 haritası `I14:53-64`.

| Ölçüt kimliği · gerçek adı (`I2`) | Kapanış kaydındaki sonuç | Açık ise neden | Owner'dan beklenen SOMUT işlem |
|---|---|---|---|
| H4-01 · Rıza gerektiren faaliyet rızasız yazılamaz `I2:235` | **PASS — canlı** `I14:151` (`I14:54`) | Kapalı | — |
| H4-02 · Rıza verme tarihçeyi korur ve audit'i aynı transaction'da yazar `I2:252` | **PASS — canlı** `I14:151` (`I14:55`) | Kapalı | — |
| H4-03 · Rıza geri alma bayrak yazımını yeniden kapatır `I2:265` | **PASS — canlı** `I14:151` (`I14:56`) | Kapalı | — |
| H4-04 · Müvekkil onay defteri: kaynak müvekkil, kaydı personel, içerik değişmez `I2:276` | **PASS — canlı** `I14:151` (`I14:57`) | Kapalı | — |
| H4-05 · Onay maili best-effort'tur; başarısızlığı durumu değiştirmez `I2:292` | **PASS — canlı** `I14:151` (`I14:58`) | Kapalı | — |
| H4-06 · Büro onayı: talep eden kendi onaylayamaz, onaylayan eligible olmalı `I2:303` | **PASS — canlı** H4-06a/b `I14:151` (`I14:59`) | Kapalı | — |
| H4-07 · İçerik onayı: four-eyes — üç ayrı kişi `I2:319` | **PASS — canlı** H4-07a/b/c `I14:151` (`I14:60-62`) | Kapalı | — |
| H4-08 · Yayın yalnız onaylı sağlayıcıya çıkar `I2:342` | **PASS — canlı, BAĞLI KANIT:** canlıda yeniden koşulmadı, İ12 `92d04ef3` G3 (201 PUBLISHED) + G5 (403 `..._PROVIDER_NOT_PRODUCTION`) kanıtına bağlandı `I14:152-155`; bağ V6 ile doğrulandı `I14:168` | **Owner kararı:** `I2:714` H4-08'in "gerçek yayın ayağı" tek `CANLI-YETKİ` kalemidir; İ12'de yayın **test sink**'ine gitti (gerçek sağlayıcı değil) `I12:1032-1041`; bağlı kanıtın hizmet kabulü için yeterli olduğuna dair **gerekçe kayıtta yok** `ORD:239`, `ORD:244` | **Karar:** "H4-08 gerçek yayın ayağı İ12 sink kanıtıyla kabul edilir" ya da "kabul dışı / gerçek sağlayıcıyla ayrı ölçüm" hükmünü `decision-log`'a yaz |
| I14-00 / I14-CLOSE / I14-ISO | **PASS — canlı** `I14:151`, `I14:156` | Kapalı | — |
| **H4 hizmet kabulü** | **0/8 içinde AÇIK** `I14:189` | Yalnız owner hizmet-kabulü kararı `PB:4533` | **İmza:** `ORD:157-173` H4 satırı; H4-08 hükmü açıkça yazılmalı (`ORD:244-246`) |

Önceki R27 sürümündeki "2 ölçüt owner kararı" ifadesi için kayıtta adlandırılan tek karar kalemi **H4-08 gerçek yayın ayağı**dır;
ikincisi için kaynak bulunamadı. Güncel `R27:52` yalnız H4-08'i taşır.

## 6. H5 — Bilgi/belge toplama (H5-01…H5-06) · İ11 · runId `158675ab` · `PB:4534`

Kayıt: `I11K:1-81` (K1–K4 PASS; ölçümler 11/0/0/0, kapsam TAM: A-5 · A-6 · review→promote `I11K:32-34`); `I11P:663-673` (§12);
İ11 haritası `I11P:90-101`. H5-01 = A-9 + A-10 (`I2:419`) **İ12'de** ölçüldü (`I12:21-22`, `I11P:680` İ11 kapsam dışı).
Ölçüt adları `I2:419-551`. İ11 **canlı** kaydında **H5-0x kimliğiyle satır yoktur**; H5-0x kimliğiyle ölçüm **İ3 disposable
kaydındadır** (`I3:116-129`, 6/6 PASS; "Yerel PASS canlı kabul DEĞİLDİR" `I3:29-30`). Canlı eşleme bu belgede `I2`'deki "= A-x"
atıflarıyla ve `EXA:195` ("H5-02a/H5-03/H5-04/H5-05/H5-06 (İ11)") ile kurulmuştur. **Kanıt sınıfı:** `I2` altı H5 ölçütünün
tamamı için `YEREL-İZOLE` yazar (`I2:441`, `I2:463`, `I2:477`, `I2:491`, `I2:522`, `I2:548`; `I2:713` "YEREL-İZOLE ile karşılanabilir: 29");
tek `CANLI-YETKİ` kalemi H4-08'dir (`I2:714`). Yani sözleşme gereği H5 ölçütleri disposable kanıtla karşılanabilir; canlı
ölçüm ek kanıttır, şart değildir.

| Ölçüt kimliği · gerçek adı (`I2`) | Kapanış kaydındaki sonuç | Açık ise neden | Owner'dan beklenen SOMUT işlem |
|---|---|---|---|
| H5-01 · Bilgi talebi gönderimi: üç sonuç ayrı değerlendirilir (= A-9 + A-10) `I2:419` | **PASS — canlı (İ12)** G1 503 `CLIENT_INFO_REQUEST_EMAIL_FAILED` dbRecord +0 · G2 503 `…INDETERMINATE` dbRecord +0, tek sağlayıcı çağrısı `I12:1032-1037`, runId `92d04ef3` | Kapalı (kayıtta `I12` altında; `I2:687-690` §9'un "H5 → İ11" eşlemesinden sapma **kayıtlıdır** `I11P:680`) | — (istenirse: H5-01'in İ12 `92d04ef3` ile karşılandığı çapraz atfını `decision-log`'a not et — docs işi, karar değil) |
| H5-02 · Güvenli bağlantı: ham token kalıcı gövdede taşınmaz (= A-5 + A-6) `I2:450` | **PASS — canlı** A-5 · A-6 `I11K:32-34`, harita `I11P:99-100` | Kapalı | — |
| H5-03 · Bağlantı iptali sonraki kullanımı kapatır `I2:468` | **PASS — canlı** L-1 anonim yol 200→404, tüm `ClientIntakeLink` REVOKED `I11K:36-37`, harita `I11P:101`; ayrıca dar kabul U-REV-DB / U-REV-PUB-L / U-REV-PUB-D PASS `H5P:387-389` (runId `dda5d8c3`) | Kapalı | — |
| H5-04 · Public uç veri toplar, ana kayda aktarmaz `I2:479` | **PASS — İ3 disposable (kimlikle)** `I3:125` ("Public gönderim kaydedilir; `DebtorAddress` ve `ClientIntelStatement` alan düzeyinde değişmez"); kanıt sınıfı `YEREL-İZOLE` `I2:491`, `I2:713`. **Canlıda kimlikle ölçülmedi:** İ11 haritasında public `POST /public/intake/:token` gözlemi yok (`I11P:90-101`); `EXA:195` H5-04'ü "İ11'de karşılandı" sayar ama `I11K`/`I11P`'de karşılık satırı yok. **Aynı davranış canlıda ayrıca ölçüldü, H5-04 kimliğine bağlanmadı:** EXTACC `cff5c692` gerçek public POST → tek gönderim `CLIENT_SUBMITTED`, kanonik `DebtorAddress` ve `ClientIntelStatement` önce/sonra aynı `EXI:200-214` | **`I2` sözleşmesine göre AÇIK DEĞİL** (YEREL-İZOLE yeterli, `I2:491`); yalnız `EXA:195`'in "İ11" atfı kayıt boşluğudur (doğrusu İ3) | — (karar gerekmez). **Docs işi:** `EXA:195` "İ11" atfını "İ3 `I3:125` + canlı ek kanıt EXTACC `cff5c692` `EXI:200-214`" ile düzelt. Owner **canlı** kanıt isterse ayrıca H5-04 kimliğiyle ölçüm istenir (sözleşme gereği zorunlu değil) |
| H5-05 · İnceleme: AYRI ve BAĞIMSIZ `client.intake.review` yetkisi (CR-1) `I2:493` | **PASS — canlı** R-3 (izinsiz 403 `CLIENT_MUTATION_DENIED_INTAKE_REVIEW`) · R-1 (reviewer 201) `I11K:32`, harita `I11P:94-95` | Kapalı | — |
| H5-06 · Aktarım (promote) elevated ister ve yalnız onaylı alanı taşır `I2:530` | **Kapı ayağı PASS — canlı** (reviewer `promote-address`/`promote-soft` 403, yazma 0) R-2/R-2b `I11K:32`, harita `I11P:96-97`. **Pozitif ayak ("yalnız onaylı alanı taşır") PASS — İ3 disposable (kimlikle)** `I3:128` (PARTNER izin → tam bir `DebtorAddress` + `promotedRefType` damgası + bir aktarım audit'i) ve H5-06b tekrar sözleşmesi `I3:129`; kanıt sınıfı `YEREL-İZOLE` `I2:548`. Pozitif ayak İ11 canlı haritasında yok; `I2:693` yalnız H5-05/H5-06 **bağımsızlığının** İ3'te ölçüldüğünü söyler | **`I2` sözleşmesine göre AÇIK DEĞİL** (YEREL-İZOLE yeterli, `I2:548`); canlıda pozitif aktarım kanıtı yok, sözleşme gereği gerekmez | — (karar gerekmez). Owner **canlı** pozitif aktarım kanıtı isterse ayrı ölçüm (sözleşme gereği zorunlu değil) |
| **B-I11-1** · `PUBLIC_INTAKE_BASE_URL` canlıda tanımsız → göreli bağlantı (H5 kullanılabilirlik kusuru) `I11P:323-330`, `I11P:386` | **GİDERİLDİ — canlı dar kabul:** runId `dda5d8c3`, çıkış 0, **13/13 PASS** · FAIL 0 · ÖLÇÜLEMEYEN 0 (`H5P:3`, `H5P:361-373`); U-01 mutlak URL, U-02 birebir, U-03a/U-03b-L/U-03b-D 200, U-04 sızıntı yok `H5P:379-386` | Kapalı olarak kaydedildi; **ancak** `H5P:3` "H5 hizmet kabulü DEĞİLDİR" der. `PB:4534` ve `ORD:63-134` hâlâ "CANLIYA UYGULANMADI" yazar — **bayat**; güncel durum `R27:47` ("canlıda uygulandı") | **Docs işi (karar değil):** `PB:4534` ve `ORD` §2 satırlarını `dda5d8c3` sonucuyla güncelle. **Karar:** H5 için ayrı hizmet-kabulü (aşağı) |
| B-I11-2 · promote reddi stabil kod taşımıyor `I11P:387` | **AÇIK, bloke etmez** (belge hükmü) | Ürün eksiği; H5-06 ölçütünde "stabil kod" şartı yok | **Karar:** "kabul dışı / sonraki iş" hükmü (B-2 ile aynı sınıf) |
| B-I11-3 · public 5xx'te ham token `ErrorLog.endpoint`'e düşüyordu `I11P:388` | **MAIN'DE ONARILDI** (#2643 @ `d199c8dc`, İ11 koşumunda "canlıya geçmedi" `I11P:623`; PB kaydı `PB:3933`); RELEASE23 adayının kapsam PR'ları arasında (`R23C:20`, adayın atası olduğu ölçüldü); adayda derlenmiş ikili düzeyinde V-B PASS (503, ErrorLog 1 satır, ham token 0) `R23N:178`; RELEASE23 canlıda `I11K:5` | Kapalı sayılır; **canlı ikilide onarım ayrıca ölçülmedi** (aday ikilisi V-B ölçümü + cutover kaydı ile bağlı kanıt) | — (istenirse canlı ikilide ayrı doğrulama; bu belge kapsamı dışı) |
| **Hâlâ açık H5 kalemleri (dda5d8c3 SONRASI):** | B-I11-2 hükmü · **H5 hizmet kabulü**. (H5-04 ve H5-06 pozitif ayağı `I2` sözleşmesi gereği açık **değil** — İ3 `I3:125`, `I3:128` + `I2:491`, `I2:548`; yalnız `EXA:195` "İ11" atfı docs düzeltmesi ister) | `dda5d8c3` yalnız B-I11-1'i (URL) kapattı; H5-01…H5-06 kimliklerini yeniden ölçmedi (`H5P:111` "diğer ölçütleri yeniden ölçmez"), D-1…D-9'un hiçbirini kapatmadı `H5P:422-438` | **İmza:** `ORD:157-173` metni H5'i **dışarıda bırakır** ("canlı `PUBLIC_INTAKE_BASE_URL` uygulamasından SONRA ayrıca") — o "sonra" artık geldi (`H5P:3`); owner H5 için **ayrı bir hizmet-kabulü satırı** yazabilir (B-I11-2 hükmüyle birlikte; H5-04/H5-06 için canlı kanıt istemesi isteğe bağlıdır) |

Önceki R27 sürümündeki "6 ölçüt + hizmet kabulü" ifadesi (güncel `R27:53` yalnız B-I11-2 hükmü + ayrı hizmet-kabulü satırını taşır) — H5-01…H5-06'nın altısı da yukarıda tek tek işlendi; "6 ölçüt açık" okuması kayıtla
uyuşmaz (H5-01/02/03/05 PASS canlı; H5-04 ve H5-06 pozitif ayağı İ3 disposable PASS `I3:125`, `I3:128` ve `I2` kanıt sınıfı
`YEREL-İZOLE` gereği açık değil; açık kalan yalnız B-I11-2 hükmü ve hizmet kabulüdür).

## 7. H6 — Gönderim (G1…G7) · İ12 · runId `92d04ef3` · `PB:4535`

Kayıt: `I12:995-1104`; canlı 17/17 PASS · FAIL 0 · ÖLÇÜLEMEYEN 0 (`I12:1032`); bağımsız 10/10 (`I12:1055`); NOREALSEND 12/12
toplam 0 (`I12:1075`); `DL:1045`, `DL:1048`. `I2`'de H6-xx kimliği yoktur; kimlikler İ12'nin yedi gözlemidir (`I12:19-27`).

| Ölçüt kimliği · gerçek adı | Kapanış kaydındaki sonuç | Açık ise neden | Owner'dan beklenen SOMUT işlem |
|---|---|---|---|
| G1 · A-9 bilgi talebi, sağlayıcı REJECTED → 503, kayıt yazılmaz `I12:21` | **PASS — canlı** `I12:1032-1036` | Kapalı | — |
| G2 · A-10 timeout/ECONNRESET → 503 INDETERMINATE, ikinci çağrı yok `I12:22` | **PASS — canlı** `I12:1037` | Kapalı | — |
| G3 · CANARY_AUDIT onaylı sağlayıcıyla FD yayını PUBLISHED, SENT=1/PUBLISHED=1 `I12:23` | **PASS — canlı** `I12:1038` | Kapalı | — |
| G4 · dedupe/idempotency, ikinci yayın ilerlemez `I12:24` | **PASS — canlı** 409 `I12:1040` | Kapalı | — |
| G5 · allowlist dışı sağlayıcı 403, send=0 `I12:25` | **PASS — canlı** (mock fazı) `I12:1051-1052` | Kapalı | — |
| G6 · SENT/PUBLISHED audit ayrımı `I12:26` | **PASS — canlı** `I12:1039` | Kapalı | — |
| G7 · aylık cron canlı izi, hedef tenant +1, yabancı +0, ikinci tetik +0 `I12:27` | **PASS — canlı** `I12:1045-1047` | Kapalı | — |
| CLAIM · RECLAIM · HANG (dispatcher claim / retry-publication / yanıtsız sağlayıcı) | **DISPOSABLE — canlıda ÖLÇÜLMEDİ** `I12:1089`; disposable PASS `I12:556-566` | **Owner kararı verildi:** "yalnız kaydet" `I12:1089`; kabulü engellemediği kayıtlı `ORD:240` | — (karar mevcut; imza metninde "canlıda ölçülmedi" ifadesi korunmalı) |
| Loopback önlemi | **Koşula bağlı** (teknik engel yok; tespit sonradan) `I12:1018` | Ölçüt değil, pencere önlemi | — |
| **H6 hizmet kabulü** | **0/8 içinde AÇIK** `I12:1100-1104` | Yalnız owner hizmet-kabulü kararı `PB:4535` | **İmza:** `ORD:157-173` H6 satırı |

Önceki R27 sürümündeki "4 ölçüt owner kararı" ifadesi için kayıtta adlandırılan kalemler CLAIM/RECLAIM/HANG (3, kararı verilmiş) +
loopback koşulu (ölçüt değil); "4 ölçüt açık karar" okumasının kaynağı bulunamadı. Güncel `R27:54` "karar mevcut" der.

## 8. H7 — Portal (H7-00…H7-08; İ4 = DAHİL) · İ16 · runId `6b883b16` · `PB:4536`

Kapsam kararı: `DL:1044` (`CLIENT-I4-I5-OWNER-DECISIONS-R01`, İ4 = DAHİL; KB-01 `I2:678` kapandı). Kayıt: `I16:154-234`; canlı 12/12
PASS · FAIL 0 · ÖLÇÜLEMEYEN 0 (`I16:171-186`); bağımsız 6/6 (`I16:203-218`); `DL:1055`. Ölçüt adları `I2:572-672`; H7-06/07/08
**owner eki** (`I16:54-56`, `I2`'de yok).

| Ölçüt kimliği · gerçek adı | Kapanış kaydındaki sonuç | Açık ise neden | Owner'dan beklenen SOMUT işlem |
|---|---|---|---|
| H7-00 · Portal erişimi açmak elevated ister `I2:623` | **PASS — canlı** `I16:176` | Kapalı | — |
| H7-01 · Portal oturumu yalnız DB ile doğrulanmış kimlikle kurulur (K1) `I2:572` | **PASS — canlı** `I16:177` | Kapalı | — |
| H7-02 · Nesne erişimi servis sorgusunun kapsam yükleminde çözülür (K2) `I2:587` | **PASS — canlı** (okuma kapsamı) `I16:178` | Kapalı (okuma); K-1 yazma tarafı ayrı satır | — |
| H7-03 · Personel token'ı portal uçlarında geçerli değildir `I2:613` | **PASS — canlı** `I16:179` | Kapalı | — |
| H7-04 · Erişim sonlandırma sonraki isteği keser `I2:637` | **PASS — canlı** `I16:180` | Kapalı | — |
| H7-05 · Ret nedenleri ayırt edilemez `I2:660` | **H7-05a PASS — canlı** (iki neden) `I16:181`; **H7-05b DISPOSABLE** (dört neden) `I16:59`, `I16:195` | Ölçülmedi (canlı): tenant askıya alma ve DB erişilemezliği canlıda üretilemez `I16:195`; "kabulü engellemez" gerekçesi kayıtta **yok** `ORD:241` | **Karar:** "H7-05b için disposable kanıt yeterli" hükmü `decision-log`'a |
| H7-06 · İnceleme: bekleyen liste yalnız kendi tenant'ı (owner eki) `I16:54` | **PASS — canlı** `I16:182` | Kapalı | — |
| H7-07 · Personel mesajlaşması tenant sınırı (owner eki) `I16:55` | **PASS — canlı** `I16:183` | Kapalı | — |
| H7-08 · Müvekkil mesajları yalnız kendi müvekkiline ait (owner eki) `I16:56` | **PASS — canlı** `I16:184` | Kapalı | — |
| K-1 matrisi · `caseId` gövde referansı yazılmaz, diske dosya bırakmaz (`DL:1046`) | **DISPOSABLE 12/12** `I16:196`; "K-1 yazma doğrulaması canlıda yapılmamıştır" `I16:199` | Ölçülmedi (canlı): portal belge YÜKLEME canlıda yapılmaz `I16:196`; gerekçe kayıtta **yok** `ORD:241` | **Karar:** "K-1 için disposable kanıt yeterli" ya da D-6 (belge akışı) canlı koşumuna bağla — kanonik kayıtta (main) D-6 koşucusu yok; bu dalda D-6 paketi hazır (`R27:36`, `D8P:119`), merge/kayıt yok, canlıda koşulmadı |
| CLIENT-PSUS probu · askıdaki tenant'ta portal kapalı (`DL:1047`) | **DISPOSABLE 7/7** `I16:197` | Ölçülmedi (canlı): canlı tenant askıya alınmaz `I16:197` | **Karar:** "PSUS için disposable kanıt yeterli" hükmü |
| Dış (HTTPS) erişim — K-A (portal production'da API'ye ulaşamama) | **GİDERİLDİ — canlı:** R26 Pencere A, başarılı canlı portal girişi `DL:1061`, `ORD:227`; D-4 dış cihazdan giriş kabul `D4P:319` | `ORD:241` "dış erişim AÇILMADI" ifadesi 2026-09-26 tarihlidir; `D4P:315-322` (2026-09-28) D-4'ü dar kapsamda kabul eder. H7 ölçüt kümesinde dış erişim kimliği **yok** | — (H sayacına etkisi yok; D-halkası) |
| I16-00 / I16-CLOSE / I16-ISO | **PASS — canlı** `I16:175`, `I16:185-186` | Kapalı | — |
| **H7 hizmet kabulü** | **0/8 içinde AÇIK** `I16:234` "teknik tamamlanma hizmet kabulü değildir" | Yalnız owner hizmet-kabulü kararı `PB:4536` | **İmza:** `ORD:157-173` H7 satırı; H7-05b/K-1/PSUS hükümleri açıkça yazılmalı (`ORD:244-246`) |

## 9. H8 — Muhasebe kayıt kapanışı + kilit bütçesi ifadesi · İ15 · runId `1b83637a` · `PB:4537`

Kayıt: `I15:142-216`; KABUL-5 5/5 PASS · FAIL 0 · ÖLÇÜLEMEYEN 0 `environment=live` (`I15:159`); bağımsız 7/7 (`I15:175-188`);
`DL:1054`. İ5 = (b) yöntemi owner kararı `DL:1044`. İfade düzeltmesi owner onayı `DL:1067` (kesin metin
`f04-live-acceptance-r01/F04-LIVE-ACCEPTANCE-PACKAGE-R01.md:402`). `I2`'de H8-xx kimliği yoktur.

| Ölçüt kimliği · gerçek adı | Kapanış kaydındaki sonuç | Açık ise neden | Owner'dan beklenen SOMUT işlem |
|---|---|---|---|
| K5-0 · B dağıtımı ön koşulda post edilmemiş | **PASS — canlı** `I15:164` | Kapalı | — |
| K5-1 · A aktörü B dağıtımına post: HTTP 404 (yalnız 403/404 kabul) | **PASS — canlı** `I15:165` | Kapalı | — |
| K5-2 · B'de finansal/audit iz oluşmadı (journal/apps/ledger/audit 0→0) | **PASS — canlı** `I15:166` | Kapalı | — |
| K5-CLOSE · kapanış (pasif, CLOSED, login 401, eski token 401) | **PASS — canlı** `I15:167` | Kapalı | — |
| K5-ISO · sentetik olmayan tenant parmak izi eşit | **PASS — canlı** `I15:168` | Kapalı | — |
| İ5(b) · F04 kalan yedi senaryo (A,1,2,3,4,B,D) — ayrı PostgreSQL test ortamı | **TEST KANITI** (canlı R24 kaynak SHA'sında) `I15:18-34`; **canlı yarış testi DEĞİL** `I15:170-173` | Owner kararıyla seçilen yöntem `DL:1044`; "canlı yarış PASS" olarak sunulmaz | — (karar mevcut; imza metninde "canlı yarış testi değildir" ifadesi korunmalı) |
| İ5(b) · canlı salt-okuma tutarlılık taraması (16 dağıtım; SCAN-B3 üç eski kayıt yalnız okundu) | **CANLI SALT OKUMA** `I15:35-75`, `I15:203` | KABUL-C dolaylı kanıt `DL:1044` | — |
| Kusur A · "kilit ≤ 4 sn" bir ürün garantisi değil, betik bütçesi | **İFADE DÜZELTİLDİ — owner onaylı** `DL:1067`; ürüne süre sınırı eklenmedi, kod değişmedi | Kapalı (ifade); hizmet taahhüdü istenirse ürün değişikliği + ayrı yayın `DL:1056` | — (isteğe bağlı: ürün süre taahhüdü kararı — bu bir ürün işi, kabul ölçütü değil) |
| Kusur B · commit sonrası hatada hesap açık kalıyordu | **GİDERİLDİ (İ5b, #2577)** `DL:1056`, `f04-live-acceptance-r01/F04-LIVE-ACCEPTANCE-PACKAGE-R01.md:278` | Kapalı | — |
| **H8 hizmet kabulü** | **0/8 içinde AÇIK** `I15:215` | Yalnız owner hizmet-kabulü kararı (metin kusuru giderildi) `PB:4537` | **İmza:** `ORD:157-173` H8 satırı ("+ ifade düzeltmesi 2026-09-22") |

Önceki R27 sürümündeki "1 ölçüt (kapsam cümlesi kararı)" ifadesi için kayıtta H8'e bekleyen bir "kapsam cümlesi" kararı bulunamadı;
yöntem ve ifade kararları `DL:1044` ve `DL:1067` ile verilmiştir. Güncel `R27:56` "karar mevcut" der. Kaynağı gösterilmeden bu
belgede açık kalem sayılmaz.

---

## 10. Toplu owner işlemi önerisi

**Tek imza metni:** `ORD:157-173` (§4) yedi hizmet (H1, H2, H3, H4, H6, H7, H8) için hazır tek metindir; onaylanırsa hizmet
kabulü **7/8** olur (`ORD:171`). Bu belge o metni **değiştirmez**; kullanılmadan önce `ORD:244-246`'nin şartı karşılanmalıdır:
aşağıdaki kalemler ya metne "kabul dışı / sonraki iş" diye açıkça yazılır ya da ayrı karar satırı alır (aksi hâlde imza bunları
**örtük** kabul ettirir):

| # | Kalem | Hizmet | Kaynak | Karar biçimi |
|---|---|---|---|---|
| 1 | B-2 lifecycle ret gövdesi stabil kod | H1 | `I9:255-260`, `ORD:236` | "kabul dışı / ürün işi aç(ma)" |
| 2 | KB-03 / H2-10 ayrı CRUD ucu | H2 | `I2:680`, `ORD:237`, `ORD:244` | (a) mevcut davranış kabul · (b) ürün işi |
| 3 | H4-08 gerçek yayın ayağı (İ12 sink kanıtı) | H4 | `I14:152`, `I2:714`, `ORD:239` | "bağlı kanıt yeterli" / "gerçek sağlayıcıyla ayrı ölçüm" |
| 4 | H7-05b · K-1 matrisi · PSUS (yalnız disposable) | H7 | `I16:195-199`, `ORD:241` | "disposable yeterli" / D-6 canlı koşumuna bağla |
| 5 | CLAIM/RECLAIM/HANG canlıda ölçülmedi | H6 | `I12:1089` | **karar mevcut** ("yalnız kaydet") — metinde ifade korunur |
| 6 | İ5(b) canlı yarış testi değil, KABUL-C dolaylı | H8 | `I15:170`, `DL:1044` | **karar mevcut** — metinde ifade korunur |

**H5 için ayrı satır (tek imzaya DAHİL DEĞİL, `ORD:166-168`):** `ORD` metni H5'i "canlı `PUBLIC_INTAKE_BASE_URL` uygulamasından
SONRA ayrıca" diye erteler; o ön koşul `dda5d8c3` ile karşılandı (`H5P:3`, `H5P:361-373`). Owner H5 için tek satırda şu hükmü
verebilir: (i) B-I11-2 hükmü (`I11P:387`) — zorunlu; (ii) **isteğe bağlı:** H5-04 ve H5-06 pozitif ayağı için `I2` kanıt sınıfı
`YEREL-İZOLE` (`I2:491`, `I2:548`) ve İ3 disposable PASS (`I3:125`, `I3:128`) sözleşme gereği yeterlidir — owner buna ek **canlı**
kanıt isterse (EXTACC `cff5c692` `EXI:200-214` H5-04 davranışını canlıda gösterir ama kimliğe bağlanmamıştır) bunu açıkça yazar,
yazmazsa sözleşme uygulanır. Hüküm verildiğinde H5 hizmet kabulü **ayrı bir kararla** 8/8'e tamamlanabilir; **bu belge sayacı
ilerletmez, 0/8 olduğu gibi kalır.**

**Docs işi (owner kararı gerektirmez, bu belgede YAPILMADI — ayrı PR):** `PB:4534` ve `ORD:63-134` §2 "CANLIYA UYGULANMADI"
ifadeleri `dda5d8c3` (2026-09-27) ile bayatladı; güncel durum `R27:53`. `EXA:195` H5-04'ün "İ11'de karşılandı" atfı İ3'e (`I3:125`)
düzeltilmelidir. **Yapıldı (kapanış düzeltmesi, aynı dal):** R27 §1.3 "Kalan" sütunundaki türetimsiz "N ölçüt" sayıları bu belgeye
atıfla değiştirildi (`R27:49-56`).

---

## 11. D-5 / D-6 / D-7 / D-8 halkalarının H ölçütlerine etkisi

D-halkaları dış erişim kabul zinciridir (`EXA:193-210`); H1–H8 hizmet kabulünden **ayrı** bir zincirdir ve **hiçbir kayıt D
sonuçlarından H sayacı türetmez** (`R27:42` "sayaçlar D sonuçlarından türetilmez"; `H5P:357-358`; `EXI:184`; `D4P:254`; `D5P:208`; `D8P:175`).

| Halka | Tanım (`EXA`) | Durum (`R27:33-40`) | Dokunduğu H ölçütü | H sayacına etkisi |
|---|---|---|---|---|
| D-5 · Portal parola sıfırlama uçtan uca | `EXA:203` | **Ölçülmedi**; koşucu + owner bloğu HAZIR (`D5P`), ön koşul canlı dist R27 `R27:35` | **Hiçbiri.** `I2:557-558` `forgot-password`/`reset-password` yüzeyini listeler ama H7-00…H7-08'in hiçbiri sıfırlamayı ölçmez; D-5 ölçütleri P5-xx'tir (`D5P:46-65`) | **Yok** (`D5P:208` "H1–H8 sayacını değiştirmez") |
| D-6 · Belge yükleme/indirme/silme dış cihazdan | `EXA:204` | **Ölçülmedi**; kanonik kayıtta (main) koşucu yok; bu dalda paket **HAZIR** (`client-extacc-portal-d6-r01`: koşucu + owner bloğu + belge; öz-test 51/51, blok 64/64) `R27:36`, tanım→paket eşlemesi `D8P:119`; merge/kayıt yok, canlıda koşulmadı | H7-02'nin okuma tarafı canlıda PASS (`I16:178`); **K-1 yazma tarafı** (yükleme) canlıda ölçülmedi (`I16:199`). D-6 canlıda koşulursa K-1'e **yakın** bir yükleme kanıtı üretir, ama K-1/H7-02 kimliğiyle **eşlenmemiştir** | **Yok** (H7 sayacı 18/18 zaten; K-1 hükmü owner kararı, §8) |
| D-7 · Mesaj gönderme/okuma dış cihazdan | `EXA:205` | **Ölçülmedi**; kanonik kayıtta (main) koşucu yok; bu dalda paket **HAZIR** (`client-extacc-portal-d7-r01`; öz-test 41/41, blok 58/58) `R27:36`, eşleme `D8P:137`; merge/kayıt yok, canlıda koşulmadı | H7-07/H7-08 mesajlaşma tenant/müvekkil sınırı canlıda PASS (`I16:183-184`); D-7 yalnız "dış cihazdan" ayağını ekler, H7 kimliği değil | **Yok** |
| D-8 · Personel yüzeyi dışarıdan kapalı | `EXA:206` | **Kısmi** — owner telefonu 5 GET 403 (katman ölçülmedi), makine sondası hazır, canlıda koşulmadı `R27:37`, `EXI:244` | **Hiçbiri.** H7-03 (personel token'ı portal uçlarında geçersiz, `I2:613`) farklı bir ölçüttür; D-8 kenar reddini ölçer | **Yok** |
| (bilgi) D-1/D-2/D-3/D-9 | `EXA:199-201`, `EXA:207` | Kabul (intake kapsamı) `cff5c692` `EXI:239-242`; D-4 dar kabul `e34b7e6d` `D4P:319-320`; H5-URL `dda5d8c3` hiçbir halkayı kapatmaz `H5P:422-438` | H5 alanına **konu olarak** dokunur (intake); H5-04 ile eşleme yalnız owner kararıyla kurulabilir (§6) | **Yok** — kayıtlar açıkça "H1–H8 0/8 kalır" der (`EXI:184`, `D4P:254`, `H5P:357`) |

**Sonuç:** D-5, D-6, D-7 ve D-8'in hiçbiri bir H ölçüt kimliğini yeniden ölçmez; **H sayacına etkisi yoktur.** D-zinciri
tamamlansa bile hizmet kabulü 0/8, yalnız §10'daki owner kararlarıyla değişir.

---

## 12. Sınırlar

- Bu belge yalnız listelenen kaynak dosyaları okudu; kanıt dizinleri (`CLIENT-EVIDENCE-*`, `h5url-live-*`) **açılmadı**, sha256'lar
  yeniden hesaplanmadı. "PASS" iddiaları kapanış kayıtlarının kendi etiketleridir, bu belge yeniden ölçmedi.
- H1, H3, H6, H8 için `I2`'de H-kimlikli ölçüt yoktur; tablolar ilgili İ paketinin kendi kimliklerini (A-x, G-x, K5-x) kullanır.
  H5-0x ↔ İ11 gözlemi eşlemesi `I2`'nin "= A-x" atıfları ve `EXA:195` ile kurulmuştur; İ11 **canlı** kaydı H5-0x kimliği
  taşımaz, H5-0x kimliğiyle ölçüm **İ3 disposable** kaydındadır (`I3:116-129`) ve `I2` bu ölçütlerin kanıt sınıfını
  `YEREL-İZOLE` olarak sabitler (`I2:713`).
- `decision-log.md` son satırı 2026-09-23 tarihlidir (`DL:1068`); `dda5d8c3`, EXTACC `cff5c692` ve D-4 `e34b7e6d` için decision-log
  satırı **bulunamadı** — bu üç kayıt yalnız paket belgelerindedir (`H5P` §8, `EXI` §12, `D4P` §13).
- Satır numaraları 2026-09-29 tarihli kanonik `project/docs/governance` kopyasına (main `8c1de57a`) aittir; dosyalar değişirse
  atıflar kayar. **Ölçülen kayma:** `product-backlog.md` bu belge yazılırken kanonik kopyada değişti (H tablosu 3 satır aşağı kaydı;
  atıflar son ölçüme göre düzeltildi). Bu daldaki `D8P` ve `D5P` dosyaları belge yazılırken **commit edilmemiş** değişiklik
  taşıyordu; `D5P` belgenin ilk yazımından SONRA değişti (P5 ölçüt tablosu `19-35` → `28-49`, sayaç cümlesi `81` → `125`) ve
  atıflar inceleme sonrası (R02) `D5P` sha256 `49301a3c…` / `D8P` sha256 `46a84d34…` sürümlerine göre ölçülmüştü. **Kapanış düzeltmesi
  (2026-09-29, R03):** `D5P` R02'den sonra yeniden değişti (İŞ 2 kanıt doğruluğu revizyonu; sha `47cb22c5…`; P5 tablosu `28-49` → `37-56`,
  sayaç cümlesi `125` → `143`; eski `125` artık tablo ayırıcısı), `D8P` kapanış düzeltmesiyle değişti (sha `121935f2…`; D-6/D-7 bölümleri
  `114`/`125` → `118`/`136`, D-9 `137` → `151`, sayaç cümlesi `174`), `R27` değişti (sha `766de640…`; D halkaları `30-37` → `33-40`,
  D-6/D-7 satırı `33` → `36`, §1.3 `39` → `42`, H satırları `44-50` → `49-56`). Bu belgedeki tüm `D5P`/`D8P`/`R27` atıfları bu sha'lara
  göre **yeniden ölçüldü**. Atıf yapılan her kaynak dosyanın sha256'sı kanıt dizinindeki `kaynak-sha256.txt` (R01), `kaynak-sha256-r02.txt`
  (R02) ve `kaynak-sha256-r03.txt` (R03, `HY_R27_AGENT_EVIDENCE\kapanis-duzeltme\` ve `…\is6-h1-h8-acik-olcutler\`) içinde sabitlenmiştir;
  satır doğrulaması o sha'lara karşı yapılmalıdır. Bu üç dosya bu dalda yeniden değişirse atıflar yeniden ölçülmelidir.
- Bu dalda `client-extacc-portal-d6-r01/` ve `client-extacc-portal-d7-r01/` dizinleri (2026-09-29; koşucu, öz-test, sahte API, owner bloğu,
  blok öz-testi **ve paket belgesi** — `EXTACC-D6-PORTAL-DOCUMENTS-PACKAGE-R01.md` / `EXTACC-D7-PORTAL-MESSAGES-PACKAGE-R01.md`) izlenmeyen
  paketler olarak vardır; **merge/kayıt yok, canlıda koşulmadı**. Bu belge onları H ölçütleri için **kaynak saymadı** (kanonik kayıtta
  yoklar); §8 ve §11'deki "kanonik kayıtta (main) koşucu yok; bu dalda paket hazır" ifadesi bu ayrımı taşır. `R27:36` ve `D8P:119`/`D8P:137`
  artık paketleri "HAZIR, canlıda koşulmadı" diye tanımlar. O paketler merge edilince §11'deki D-6/D-7 satırları yeniden değerlendirilir;
  **H sayacına etkisi yine olmaz** (bkz. §11 gerekçesi).
- **R02 paket revizyonu (2026-09-30):** atıf yapılan üç belge yeniden değişti (`D5P` sha256 `5dc41b83…`, `D8P` `76340fbc…`, `R27` `690949ba…`). Bu belgedeki `D5P:`/`D8P:`/`R27:` satır atıfları, önceki sürüm (yukarıdaki R03 sha'ları) ile son sürüm arasındaki satır eşlemesiyle **yeniden numaralandı** (değişen atıf: 9). Beş atıf (`R27:35`, `R27:36` ×4) içeriği güncellenen **aynı** satırları gösterir — §1.2'nin D-5 ve D-6/D-7 satırları; yalnız son test sayıları ve D-5 QR betiği eklendi, satırların anlamı (D-5/D-6/D-7 "Ölçülmedi", paket hazır, canlıda koşulmadı) değişmedi. H sayaçları ve hizmet kabulü (0/8) değişmedi.
- **Güncelleme (2026-10-01; bu belgenin ölçümleri ve sayaçları DEĞİŞMEDİ — hizmet kabulü 0/8):** (1) §11 D-5 satırındaki "Ölçülmedi" bayattır: D-5 canlıda bir kez koşuldu (runId `00c96bd5`, çıkış 3 = ÖLÇÜLEMEYEN; kabul tamamlanmadı; kayıt `client-extacc-portal-d5-r01` §8). H ölçütlerine etkisi yine yoktur. (2) §11 ve yukarıdaki maddedeki "kanonik kayıtta (main) koşucu yok; merge/kayıt yok" ifadesi bayattır: D-6 ve D-7 paketleri #2837 (`429a0f5b`) ile `main`'dedir; canlıda koşulmadılar. Söz verilen yeniden değerlendirmenin sonucu: D-6 canlı koşumu K-1 yazma tarafına en yakın kanıt adayıdır ama K-1/H7-02 kimliğiyle eşlenmemiştir; eşleme yalnız owner kararıyla kurulur — **H sayacına etkisi yok**. (3) `D5P` ve `R27` belgeleri bu tarihte yeniden değişti; bu belgedeki `D5P:`/`R27:` satır atıfları yeniden numaralandırılmadı. Güncel tek tablo (D-1…D-9, H1…H8, açık güvenlik işleri, owner kararları): `CLIENT-KALAN-ISLER-R01.md`. (4) Kanıt tazeliği notu: H1 yolunda müvekkil oluşturma/yeniden etkinleştirme (#2645) ve H7 yolunda portal servis/controller/guard (#2738, #2830, #2832) İ ölçümlerinden sonra değişti ve canlı R27'de H kimlikleriyle yeniden ölçülmedi; kusur iddiası değildir, imza öncesi owner hükmü gerektirir (`CLIENT-KALAN-ISLER-R01.md` §7).

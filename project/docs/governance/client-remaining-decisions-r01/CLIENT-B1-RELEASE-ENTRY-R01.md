# CLIENT B-1 — OFFICE/C33 YAYIN GİRDİSİ (R02 içeriği — ölçülmüş aday bağı)

**Bu dosya R01 içeriğinin yerine geçer.** R01 yazıldığında yama `main` ucunun kendisiydi ve
ortada somut bir cutover adayı yoktu; ikisi de artık doğru değil. Aşağıdaki her değer
2026-09-11'de **salt-okuma** ölçüldü (repo, aday kökleri, paket kimlikleri, canlı süreçler).

**Ölçülmüş tek cümlelik sonuç:**
> **B-1, R27/RELEASE22 adayında mevcuttur; canlı RELEASE21'de yoktur.**

**Bu belge ne DEĞİLDİR:** aday üretmez, paket/mühür/authority/cutover işlemi yapmaz, deploy
veya restart istemez, İ9'u canlıda başlatmaz, yayın seçimi yapmaz. Sayaç **8/17**, hizmet
kabulü **0/8 tam** — bu kayıt ikisini de değiştirmez.

---

## 1. Kimlikler

| Ne | Değer |
|---|---|
| **B-1 yama commit'i (squash)** | `845b92d9343a54bf98d642cdfe3d67eae93e9739` (PR #2609) |
| `main` ucu (bu kayıt yazılırken) | `8c92f6531a6c84e01fc216f57fd29891dac8bce6` — yama **artık main ucu değil**, 3 commit geride |
| **Canlı sürüm** | RELEASE21 `2187a78b1621f168605920cdffccb17381dc171a` · web `BUILD_ID g91HUaBesekB-R2rRawQj` |
| Canlı süreçler (ölçüldü, dokunulmadı) | API `:8080` PID 50716 (başl. 2026-09-10 13:05:56) · Web `:3002` PID 22440 (başl. 2026-09-09 18:15:03) — **ikisi de `HY_W4_RELEASE21` kökünden** |
| **Aday R26** | `HY_C33_RELEASE21B1_CUTOVER_R26` · kaynak `15f88e7555363e7f225f052c69021190ec09bc56` · kök `HY_W4_RELEASE21B1` |
| **Aday R27** | `HY_C33_RELEASE22_CUTOVER_R27` · kaynak `137406701248858221d12be94a941f8837a2a245` · kök `HY_W4_RELEASE22` |
| İ9 kabul paketi | `d6c51ca0` (PR #2605) — belge + betikler, **ürün kodu içermez** |

## 2. B-1 kimlik bağı — üç bağımsız katman

Kimlik **tek göstergeye** dayandırılmadı. Üç katmanın üçü de aynı sonucu veriyor.

### 2.1 Kaynak katmanı — git blob ve içerik sha256

`project/apps/api/src/modules/client/client.service.ts`:

| Nokta | Commit | Blob | Dosya içeriği sha256 |
|---|---|---|---|
| **Canlı RELEASE21** | `2187a78b` | `fe30d8ca96ad` | `4413CE5BC1DDBF1FB66819D19E1222C572469BEFAB3148269BB1A1A473065745` |
| B-1 merge (#2609) | `845b92d9` | `2835fa2ccdbf` | `08CF80C481F3A8922724B3EB10CB2736404526E48076F9AF0AB6A6FF965C2CB5` |
| **Aday R26** | `15f88e75` | `2835fa2ccdbf` | `08CF80C481F3A8922724B3EB10CB2736404526E48076F9AF0AB6A6FF965C2CB5` |
| **Aday R27** | `13740670` | `2835fa2ccdbf` | `08CF80C481F3A8922724B3EB10CB2736404526E48076F9AF0AB6A6FF965C2CB5` |

Fark matrisi: `B1 == R26` **AYNI** · `B1 == R27` **AYNI** · `R26 == R27` **AYNI** ·
`CANLI == R26` **FARKLI** (+71 / −12 — B-1 merge commit'inin kendi numstat'ıyla birebir).

**Soyağacı ayrımı (önemli):**
- **R27**, B-1 merge commit'inin **ardılıdır** (`845b92d9` → `13740670`, arada 3 commit).
- **R26 ardıl DEĞİLDİR**: `merge-base(845b92d9, 15f88e75) = 2187a78b`. R26 = canlı RELEASE21
  **+ tek commit** (`15f88e75` "fix(client): B-1 … (#2609)"), yani B-1'in **cherry-pick**'i.
  Bu yüzden R26'da B-1 kimliği ataya bakarak değil, **blob eşitliğiyle** kuruldu — ve blob
  birebir aynıdır.

### 2.2 Derleme katmanı — tam sha256

`project/apps/api/dist/apps/api/src/modules/client/client.service.js`:

| Kök | client.service.js sha256 | md5 | boyut | `pureNoOpDetected` | web BUILD_ID |
|---|---|---|---|---|---|
| `HY_W4_RELEASE21` (**CANLI**) | `5D3DF71CE74AD49D1081E06167E2A92C71BF7946A0E2BF32577572E1BF99E97D` | `DC3BB610190BD38D49101E8FA5CCC415` | 100.800 B | **0** | `g91HUaBesekB-R2rRawQj` |
| `HY_W4_RELEASE21B1` (R26) | `01CA99AEC166362363135F79509DC88D9E60BD5D5A6CDCDAAD76E599978D5143` | `E4278705E947A6EED2E9EE76ED9C933C` | 101.508 B | **3** | `siLWuewGBSK-EO-GrMd1s` |
| `HY_W4_RELEASE22` (R27) | `01CA99AEC166362363135F79509DC88D9E60BD5D5A6CDCDAAD76E599978D5143` | `E4278705E947A6EED2E9EE76ED9C933C` | 101.508 B | **3** | `xJZ1G1TsbOnHoWUzMD8CQ` |

İki adayın derlenmiş `client.service.js` dosyası **bayt-aynıdır**; canlıdaki dosya **farklıdır**.

### 2.3 Paket katmanı — kimlik makbuzları

| | **R26 / RELEASE21B1** | **R27 / RELEASE22** |
|---|---|---|
| Paket adı | `HY_C33_RELEASE21B1_CUTOVER_R26` | `HY_C33_RELEASE22_CUTOVER_R27` |
| `immutableBase.digest` | `C319DE1527D1F84F4FFE1150A34AE3510D85A652CB3834E74EB6D5130F75709D` | `DBE6B8E5D8E18C85F2AA857944125FBDF277F1B8EEC39D3FAF9017C9D3E3516A` |
| `immutableBase.fileCount` | 50 | 48 |
| `PACKAGE-IDENTITY.json` sha256 | `F7C0997BE1D2AF96BC0F45A7B4E12629C707A51DF567890EDDF49AC0EB749A4B` | `24DC59DBE03F44597FE6AFAA3891A74F931568FCFC6B9CBBC4FE4C8579F60E2F` |
| `candidate.sourceCommit` | `15f88e7555363e7f225f052c69021190ec09bc56` | `137406701248858221d12be94a941f8837a2a245` |
| `candidate.candidateDigest` | `A5F7D74B87B0463FBD25A813C27B8CF448AAD4049AF385CB7034CDB6330165E7` | `454F447303B6D145B99EF2F3155282D02079AF2AAF0699101C20E5C6A7764C02` |
| `candidate.packageDigest` | `ED04BC865BB3AA10F882817F149888A68B411183CE3566605283CFF770198958` | `F0156AC1D4C40EFC4F604EC279903B4513BE6C4F4AA200B0837AEE001F401DCE` |
| Katman 1 makbuzu | `198A7529E80494B2B9F1A0E7163014263B97BBEA15E728FD59BDACC9ACC2F0DC` | `8D78B1765EFA345CCAFB74FB8A4E3AF58638F4A045B5ABDDB39CDD88F823E6CD` |
| `candidate.webBuildId` | alan **yok** (BUILD_ID paket belgelerinde: `siLWuewGBSK-EO-GrMd1s`) | `xJZ1G1TsbOnHoWUzMD8CQ` |

**Paket ↔ gerçek derleme bağı** her iki pakette de kendi belgesinde kurulu ve ölçülen disk
değerleriyle eşit:
- R26 → `docs/LIVE-APPROVAL-PACKAGE-B1.md` §3 "Derleme çıktıları — ileri / geri (tam sha256)".
- R27 → `docs/LIVE-APPROVAL-PACKAGE-R27.md` §2: B-1 satırı **PR #2609 · git blob `2835fa2c` ·
  `client.service.js` `01CA99AE…5143`**, Katman 1 manifestiyle (`26B31B69…`) **22/22** eşleşme.
  Aynı belge şunu da kayda geçiriyor: *"`client.service.js` RELEASE21B1 (R26) derlemesiyle de
  bayt-aynıdır; B-1 kaynağı iki adayda aynı blob'dur."*

## 3. Kimlik doğrulamasında KULLANILAMAZ iki ölçüt (ölçülmüş gerekçe)

1. **API `main.js` hash'i ayırt etmez.** `dist/apps/api/src/main.js` sha256'sı
   `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` olup **RELEASE21,
   R26 ve R27'nin üçünde de aynıdır**. Web girişi (`next` binary'si
   `AFEE236A880DA3AC64CAB43A4DB016B73E55209B241DA7453690DC3EC43837A3`) de aynıdır.
2. **Tek başına `pureNoOpDetected` metin sayımı yeterli değildir.** Sayım (0 → 3) yalnız
   *doğrulayıcı* bir işarettir; kimlik §2.1–§2.3'teki **blob + dosya sha256 + paket makbuzu**
   üçlüsüyle kurulur.

## 4. İki aday AYRI SEÇENEKTİR — kapsam farkı

| | **R26 / RELEASE21B1** | **R27 / RELEASE22** |
|---|---|---|
| Kaynak | canlı `2187a78b` + **1 commit** (B-1 cherry-pick) | `2187a78b` + **… → `13740670`** (B-1 dâhil birleşik hat) |
| `apps/api/src` ürün dosyası farkı (canlıya göre) | **1** — yalnız `client/client.service.ts` | **11** — B-1 + 10 diğer |
| B-1 içeriyor mu | **EVET** (blob `2835fa2c`) | **EVET** (blob `2835fa2c`) |
| Migration / şema / env farkı | yok | yok (`Migration / Prisma şeması / lock / env anahtarı farkı 0`) |

**R27'nin B-1 dışındaki 10 ürün dosyası** (sahipleri R27'nin kendi belgesinden):

| Kalem | PR | Dosyalar |
|---|---|---|
| AK-2 | #2599 · #2602 | `lawyer/lawyer.service.ts` · `lawyer/dto/create-lawyer.dto.ts` · `case/case.service.ts` · `seed/seed.controller.ts` · `seed/seed.service.ts` |
| AK-1a | #2604 | `office-approval/office-f01-authorization.guard.ts` · `office-approval/office-write-role.policy.ts` (yeni) |
| AK-1a eki | #2606 | `office-approval/office-approval.service.ts` · `client-financial-disclosure/…-approval-eligibility.ts` · `…-approval.service.ts` |
| CLF-O0-01 | #2608 · #2612 | `office-approval/office-approval.service.ts` |

> **YORUM SINIRI (bu belgenin kuralı):** R27'nin B-1'i içermesi, diğer **10 ürün değişikliği
> için yayın onayı DEĞİLDİR** ve **R26'yı geçersiz kılmaz**. B-1'in kabul edilmiş olmasından
> "tüm `main` yayına hazır" sonucu **çıkarılamaz**. Diğer on dosyanın kabul/kanıt durumu kendi
> hatlarındadır. **Yayın seçimi owner'a aittir.**

## 5. Kayıtlı karar ile bu belgeye verilen talimat arasındaki fark — ÇÖZÜLMEDİ, BİLDİRİLİYOR

Ölçüldüğü hâliyle iki kayıt aynı yönde değil; bu belge **hiçbirini diğerinin lehine
yorumlamaz**, ikisini de olduğu gibi kaydeder:

- **Repodaki kayıt (`decision-log.md` satır 1035 · `product-backlog.md` · #2615 `9840577d`,
  #2616 `8c92f653`):** *"OWNER KARARI 'TEK YAYIN HATTI: RELEASE22'"* — owner birbirini dışlayan
  iki aday arasından RELEASE22 `13740670`'i seçti; **RELEASE21B1 / R26 için mühür, authority
  veya cutover başlatılmaz; R26 paketi DEĞİŞTİRİLMEDEN tarihsel/hazır paket olarak korunur.**
  R27 paket kimliği (`PACKAGE-IDENTITY.json`) de aynı ifadeyi taşır: *"R26 = RELEASE21B1
  (tarihsel/hazır, KULLANILMAZ)"*.
- **Bu kaydı üreten talimat (CLIENT oturumu, 2026-09-11):** *"R26/RELEASE21B1 ile
  R27/RELEASE22'yi ayrı seçenekler olarak koru. R27'nin B-1'i içermesini … R26'nın
  geçersizleşmesi olarak yorumlama. Yayın seçimi owner'a aittir."*

**Bu oturumun tutumu:** R26 ve R27 bu belgede **ayrı seçenek** olarak korunmuştur (§4). Kayıtlı
karar metni de yukarıda aynen aktarılmıştır. **Hangisinin yayına gideceği owner'ın kararıdır;
bu belge o kararı ne verir ne de verilmiş sayar.** Not: her iki kayıt da **mühür/authority/
cutover yetkisi vermediğinde birleşiyor** — aşağıya bakınız.

## 6. Mühür / authority durumu — İKİ ADAY DA HAZIR DEĞİL

`PACKAGE-IDENTITY.json` ölçümü, **her iki pakette de aynı**:

| Alan | R26 | R27 |
|---|---|---|
| `state.sealed` | **False** | **False** |
| `state.authorityProduced` | **False** | **False** |
| `state.nonceProduced` | **False** | **False** |
| `state.ratificationRef` | **None** | **None** |
| `qualification.verify.verdict` | `PACKAGE_STATIC_VERIFIED_UNSEALED` | `PACKAGE_STATIC_VERIFIED_UNSEALED` |

Nitelendirme koşumları (ikisinde de FAIL 0): gerçek primitifler 21/21 · preflight entry-path
12/12 · preflight fixture 14/14 · C36 bağlama provası 29 · owner-command şablonu (R26: 13,
R27: 16) · NC zinciri (R26: 89, R27: 91).

**Sonuç:** hiçbir aday şu hâliyle canlıya alınamaz. Sıradaki her adım **ayrı owner GO** ister:
ratifikasyon ref'i → owner preflight → `-Live` gerçek primitifler → onaylı kimlik → mühür →
cutover → teknik kabul → hedefli kabul.

## 7. Geri dönüş (rollback) pini — ÖLÇÜLDÜ, RELEASE20 DEĞİL

Her iki paket de geri dönüşü **RELEASE21'e** pinliyor — eski RELEASE20 pini **kullanılmıyor**:

| Alan | R26 | R27 |
|---|---|---|
| `rollback.release` | `HY_W4_RELEASE21` | `HY_W4_RELEASE21` |
| `rollback.sourceCommit` | `2187a78b1621f168605920cdffccb17381dc171a` | `2187a78b1621f168605920cdffccb17381dc171a` |
| `rollback.buildId` | `g91HUaBesekB-R2rRawQj` | `g91HUaBesekB-R2rRawQj` |
| `rollback.liveNow` | **True** | **True** |
| `rollback.manifestDigest` | — | `D6082E199ACA34964037B44EFD48EAB80E280EF7668B74CC605431E024B41D61` |
| Kök yeniden hash (R27) | — | 88.132/88.132 eşit (dosya 83.339 + bağlantı 4.793), okunamayan 0 |

R27'nin `docs/ROLLBACK-PINS.md` belgesi geri dönüş hedefini "**şu anda CANLI olan sürüm**"
olarak, ölçülen PID'lerle (50716 / 22440) birlikte kaydediyor. **Kesinti/rollback süresi hiçbir
adayda ölçülmemiştir** (R23/R24/R25'in üçünde de `rollback.performed = false`).

## 8. İ9'un ön koşulu (bu kayıtla sabitlenir)

> **İ9 canlı kabulü, owner'ın SEÇTİĞİ adayın canlıya geçtiğinin sürüm ve derleme kimliğiyle
> doğrulanmasına bağlıdır.** Doğrulama, seçim yapıldıktan sonra ve ayrı GO ile şu üçlüyle
> yapılır (§2'deki ölçütlerle aynı):
> 1. canlı süreçlerin komut satırındaki **kök** seçilen adayın kökü olacak,
> 2. web **`BUILD_ID`** seçilen adayınki olacak (R26 → `siLWuewGBSK-EO-GrMd1s`,
>    R27 → `xJZ1G1TsbOnHoWUzMD8CQ`; canlı bugün `g91HUaBesekB-R2rRawQj`),
> 3. canlı dist'teki `client.service.js` sha256'sı **`01CA99AE…5143`** olacak
>    (bugün `5D3DF71C…E97D`).
>
> `main.js` hash'i bu doğrulamada **kullanılamaz** (§3). İ9 bu kayıtla **başlatılmaz**; aday
> canlıya geçene kadar **bekler**.

## 9. B-1 davranış sınırı ve test kanıtı (R01'den korunur — değişmedi)

**ÖNCE:** kayıt aktifken `PUT /clients/:id` `{isActive:true}` → **404 "Müvekkil bulunamadı"**
(kayıt dururken). Kök neden: no-op istekte Prisma'ya verilen `data`nın tüm alanları
`undefined`; `updateMany` bunu `count=0` sayıyor; ürün `count===0` dalında `NotFoundException`
fırlatıyordu.

**SONRA:** başarıya devam **üç koşulun birlikte** sağlanmasına bağlı — (1) ana güncelleme
verisi **gerçekten boş** (yalnız `undefined` üzerinden; `null`/`false`/`0`/`''` **gerçek
değerdir**), (2) satır **aynı tenant** kapsamında hâlâ mevcut (aynı transaction içinde
ölçülür), (3) ilişkisel yazma **niyeti yok** (`phones`/`emails`/`addresses` gönderilmemiş).
Saf no-op'ta transaction sonrası `syncContactFollowUpTaskSafe` **atlanır**.

**DEĞİŞMEYENLER (regresyonla kilitli):** gerçek kayıt yokluğunda **404** · lifecycle yarışında
**409 `CLIENT_STATE_CHANGED`** · yetki/tenant/kimlik kapıları · `create()` ve
dedup-reaktivasyon yolu · gerçek iletişim güncellemelerinde iletişim-görevi senkronu.
`count=1` üretmek için `isActive`, `updatedAt` veya audit'e **yapay yazma eklenmedi**.
**Açıkça bildirilen mevcut davranış:** genel `CLIENT_UPDATE` audit'i saf no-op'ta **da**
yazılır; kaldırılmadı, testte `toHaveLength(1)` ile kilitlendi.

| Aşama | Ölçüm |
|---|---|
| Kusurun yeniden üretimi (yamasız) | jest **exit 1** · `SAF NO-OP → NotFoundException at client.service.ts:1888` |
| Yamalı suite (gerçek PostgreSQL) | **11/11 PASS** · jest **exit 0** |
| Tip kontrolü | `tsc` fark **0** (529 baseline hata; bu iki dosyada **sıfır**) |
| Yamalı derleme | `nest build` **exit 0** · `client.service.js` `01CA99AE…5143` |
| Yamalı derlemeyle İ9 provası | **PASS 14 / FAIL 0 / ÖLÇÜLEMEYEN 0** — A-8a artık 200, A-8b `updatedAt` değişmedi |
| Merge öncesi CI | **9/9 SUCCESS** · MERGEABLE/CLEAN |
| Post-merge main CI | **3/3 SUCCESS**, **kendi SHA'm `845b92d9` üzerinde**, iptal edilen koşum yok |

Regresyonlar `client-lifecycle-activation-race.db-gated.integration.spec.ts` içinde; dosya
`apps/api/ci-manifests/db/domain-integration.txt` manifestinde **zaten kayıtlı** → CI'da koşar.
Prova ortamı disposable PostgreSQL `127.0.0.1:5439/hukuk_fix1_test`; **canlı DB'ye 0 yazma**.

> **Uyarı:** İ9 provası **R21B1 dist'i** üzerinde koşmuştur; **tam RELEASE22 dist'i üzerinde
> koşulmamıştır**. `client.service.js` iki adayda bayt-aynı olsa da R27, B-1 dışında 10 ürün
> dosyası daha taşır; R27 seçilirse teknik/hedefli kabul o adayın kendi kapsamıyla yapılır.

## 10. Kapsam DIŞI

Aday üretme · paket/mühür/authority/cutover işlemi · ratifikasyon ref'i · deploy · restart ·
migration · canlı yazma · canlı bayrak değişikliği · İ9'un canlıda başlatılması · İ10…İ15 ·
**B-2** (UPDATE yolundaki lifecycle reddinin stabil kod taşımaması — **açık**, bu yamaya
katılmadı).

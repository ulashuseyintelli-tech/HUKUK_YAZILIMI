# CLIENT B-1 — OFFICE/C33 YAYIN GİRDİSİ (R03 içeriği — R27 aktif aday + İ9 provası)

**Bu dosya R02 içeriğinin yerine geçer.** İki şey değişti: (1) yayın hattı artık **kayıtlı owner
kararına** göre tekdir — R27/RELEASE22 **aktif aday**, R26 **tarihsel aday**; (2) İ9 provasının
yalnız R21B1 derlemesinde koşmuş olması **kapandı** — prova R27'nin **tam RELEASE22
derlemesiyle** yeniden koşuldu.

**Ölçülmüş iki cümlelik sonuç:**
> **B-1, R27/RELEASE22 adayında mevcuttur; canlı RELEASE21'de yoktur.**
> **İ9 provası R27'nin tam RELEASE22 derlemesiyle koştu: PASS 14 · FAIL 0 · ÖLÇÜLEMEYEN 0.**

**Bu belge ne DEĞİLDİR:** aday üretmez, **mühür / authority / cutover yetkisi vermez**, deploy
veya restart istemez, İ9'u canlıda başlatmaz. **Yayın yürütücüsü OFFICE/C33'tür.** Sayaç
**8/17**, hizmet kabulü **0/8 tam** — bu kayıt ikisini de değiştirmez.

**Sonradan durum notu (2026-09-11):** R27/RELEASE22 canlıya geçti (`CUT-20260911-195709-35289e18`,
`C33_RELEASE22_CUTOVER_APPLIED_AND_VERIFIED`) ve §8'deki İ9 ön koşulu kök `HY_W4_RELEASE22` +
`BUILD_ID xJZ1G1TsbOnHoWUzMD8CQ` + `client.service.js` `01CA99AE…5143` üçlüsüyle bağımsız ölçüldü.
Aşağıdaki "canlıda değil / canlı RELEASE21" ifadeleri **yazıldıkları ana** aittir. §5.5'in kapsamı
ayrıca düzeltilmiştir.

---

## 1. Kimlikler

| Ne | Değer |
|---|---|
| **B-1 yama commit'i (squash)** | `845b92d9343a54bf98d642cdfe3d67eae93e9739` (PR #2609) |
| `main` ucu (bu kayıt yazılırken) | `f3ddb4a28783…` — B-1 artık main ucu değil |
| **Canlı sürüm** | RELEASE21 `2187a78b1621f168605920cdffccb17381dc171a` · web `BUILD_ID g91HUaBesekB-R2rRawQj` |
| Canlı süreçler (ölçüldü, dokunulmadı) | API `:8080` PID 50716 · Web `:3002` PID 22440 — ikisi de `HY_W4_RELEASE21` kökünden |
| **AKTİF YAYIN ADAYI** | **R27** — `HY_C33_RELEASE22_CUTOVER_R27` · kaynak `137406701248858221d12be94a941f8837a2a245` · kök `HY_W4_RELEASE22` |
| Tarihsel aday | R26 — `HY_C33_RELEASE21B1_CUTOVER_R26` · kaynak `15f88e7555363e7f225f052c69021190ec09bc56` · **değiştirilmeden korunur** |
| İ9 kabul paketi | `d6c51ca0` (PR #2605) — belge + betikler, **ürün kodu içermez**, bu kayıtla değişmedi |

## 2. Yayın hattı — KAYITLI OWNER KARARI

Yayın hattı **tektir** ve kararı repoda kayıtlıdır; bu belge o kararı **esas alır**, yeniden
seçime açmaz:

| Referans | İçerik |
|---|---|
| `decision-log.md` satır 1035 | **RELEASE22-SINGLE-LINE-R27 — OWNER KARARI "TEK YAYIN HATTI: RELEASE22"** · aday `13740670` seçildi · RELEASE21B1/R26 için **mühür, authority veya cutover BAŞLATILMAZ**; R26 paketi **DEĞİŞTİRİLMEDEN tarihsel/hazır paket olarak korunur** |
| `product-backlog.md` | Aynı karar + KATMAN 2 = R27 HAZIR (mühürsüz) / **CANLIDA DEĞİL** |
| Kayıt PR'ları | #2615 `9840577d` (OFFICE 33) · #2617 `e85dad08` · #2616 `8c92f653` (ana yürütücü: decision-log + product-backlog + bağımsız doğrulama) |
| R27 paket kimliği | `PACKAGE-IDENTITY.json` → `purpose: "OWNER KARARI 2026-09-11 TEK YAYIN HATTI RELEASE22"` |

**Sonuç:** R27 **aktif yayın adayıdır**. R26 **tarihsel adaydır** ve bu belgede "yeniden seçim
bekleyen seçenek" olarak sunulmaz. R26'nın ölçülen değerleri aşağıda yalnız **karşılaştırma ve
tarihsel kayıt** amacıyla durur.

**Bu kayıt yetki üretmez:** mühür, authority, nonce, ratifikasyon ref'i ve cutover **yoktur**;
sıradaki her adım **ayrı owner GO** ister ve **yürütücü OFFICE/C33'tür**.

## 3. B-1 kimlik bağı — üç bağımsız katman

Kimlik tek göstergeye dayandırılmadı; üç katmanın üçü de aynı sonucu veriyor.

### 3.1 Kaynak katmanı — git blob ve içerik sha256

`project/apps/api/src/modules/client/client.service.ts`:

| Nokta | Commit | Blob | Dosya içeriği sha256 |
|---|---|---|---|
| **Canlı RELEASE21** | `2187a78b` | `fe30d8ca96ad` | `4413CE5BC1DDBF1FB66819D19E1222C572469BEFAB3148269BB1A1A473065745` |
| B-1 merge (#2609) | `845b92d9` | `2835fa2ccdbf` | `08CF80C481F3A8922724B3EB10CB2736404526E48076F9AF0AB6A6FF965C2CB5` |
| **AKTİF ADAY R27** | `13740670` | `2835fa2ccdbf` | `08CF80C481F3A8922724B3EB10CB2736404526E48076F9AF0AB6A6FF965C2CB5` |
| Tarihsel R26 | `15f88e75` | `2835fa2ccdbf` | `08CF80C481F3A8922724B3EB10CB2736404526E48076F9AF0AB6A6FF965C2CB5` |

Fark matrisi: `B1 == R27` **AYNI** · `B1 == R26` **AYNI** · `CANLI == R27` **FARKLI**
(+71 / −12 — B-1 merge commit'inin kendi numstat'ıyla birebir).

**Soyağacı ayrımı:** **R27**, B-1 merge commit'inin **ardılıdır** (`845b92d9` → `13740670`,
arada 3 commit). **R26 ardıl DEĞİLDİR** (`merge-base(845b92d9, 15f88e75) = 2187a78b`), B-1'in
cherry-pick'idir — kimliği ataya değil **blob eşitliğine** dayandırıldı.

### 3.2 Derleme katmanı — tam sha256

`project/apps/api/dist/apps/api/src/modules/client/client.service.js`:

| Kök | client.service.js sha256 | boyut | `pureNoOpDetected` | web BUILD_ID |
|---|---|---|---|---|
| `HY_W4_RELEASE21` (**CANLI**) | `5D3DF71CE74AD49D1081E06167E2A92C71BF7946A0E2BF32577572E1BF99E97D` | 100.800 B | **0** | `g91HUaBesekB-R2rRawQj` |
| `HY_W4_RELEASE22` (**AKTİF R27**) | `01CA99AEC166362363135F79509DC88D9E60BD5D5A6CDCDAAD76E599978D5143` | 101.508 B | **3** | `xJZ1G1TsbOnHoWUzMD8CQ` |
| `HY_W4_RELEASE21B1` (tarihsel R26) | `01CA99AEC166362363135F79509DC88D9E60BD5D5A6CDCDAAD76E599978D5143` | 101.508 B | **3** | `siLWuewGBSK-EO-GrMd1s` |

### 3.3 Paket katmanı — kimlik makbuzları

| | **R27 / RELEASE22 (aktif)** | R26 / RELEASE21B1 (tarihsel) |
|---|---|---|
| `immutableBase.digest` | `DBE6B8E5D8E18C85F2AA857944125FBDF277F1B8EEC39D3FAF9017C9D3E3516A` | `C319DE1527D1F84F4FFE1150A34AE3510D85A652CB3834E74EB6D5130F75709D` |
| `immutableBase.fileCount` | 48 | 50 |
| `PACKAGE-IDENTITY.json` sha256 | `24DC59DBE03F44597FE6AFAA3891A74F931568FCFC6B9CBBC4FE4C8579F60E2F` | `F7C0997BE1D2AF96BC0F45A7B4E12629C707A51DF567890EDDF49AC0EB749A4B` |
| `candidate.candidateDigest` | `454F447303B6D145B99EF2F3155282D02079AF2AAF0699101C20E5C6A7764C02` | `A5F7D74B87B0463FBD25A813C27B8CF448AAD4049AF385CB7034CDB6330165E7` |
| `candidate.packageDigest` | `F0156AC1D4C40EFC4F604EC279903B4513BE6C4F4AA200B0837AEE001F401DCE` | `ED04BC865BB3AA10F882817F149888A68B411183CE3566605283CFF770198958` |
| `candidate.webBuildId` | `xJZ1G1TsbOnHoWUzMD8CQ` | alan yok (belgede `siLWuewGBSK-EO-GrMd1s`) |

R27'nin `docs/LIVE-APPROVAL-PACKAGE-R27.md` §2'si B-1 satırını **PR #2609 · git blob
`2835fa2c` · `client.service.js` `01CA99AE…5143`** ile Katman 1 manifestine (`26B31B69…`)
bağlar; eşleşme **22/22**.

## 4. Kimlik doğrulamasında KULLANILAMAZ iki ölçüt (ölçülmüş gerekçe)

1. **API `main.js` hash'i ayırt etmez.** `dist/apps/api/src/main.js` sha256'sı
   `28D84796367BC409DBD1DEEE3FC89A35DEC844B6B6EB0DCAD954999AD8DE73F5` olup **RELEASE21, R26 ve
   R27'nin üçünde de aynıdır**; web girişi (`next` = `AFEE236A…`) de aynıdır.
2. **Tek başına `pureNoOpDetected` metin sayımı yeterli değildir** (0 → 3 yalnız doğrulayıcı
   işarettir). Kimlik §3.1–§3.3'teki **blob + dosya sha256 + paket makbuzu** üçlüsüyle kurulur.

## 5. İ9 PROVASI — R27'NİN TAM RELEASE22 DERLEMESİYLE (boşluk KAPANDI)

R02'deki "prova yalnız R21B1 dist'inde koştu" uyarısı **bu koşumla kapanmıştır**. R21B1 sonucu
R27 sonucunun yerine **kullanılmamıştır**; aşağıdaki ölçüm R27'nin kendi derlemesine aittir.

### 5.1 Ölçülen ikilinin R27 kimliğine bağlanması

| Kapı | Ölçüm |
|---|---|
| Çalıştırılan dist | `C:/Development/HUKUK_YAZILIMI/HY_W4_RELEASE22/project/apps/api/dist/apps/api/src/main.js` |
| G-A · dist sha256 | `28D84796…E73F5` — **beklenenle eşit** (başlatıcıya `I8_DIST_SHA` olarak verildi) |
| Aday ürün dosyası | aynı kökte `client.service.js` = `01CA99AE…5143` · `pureNoOpDetected` **3** |
| Kaynak/manifest bağı | kök `HY_W4_RELEASE22` ↔ `candidate.sourceCommit 13740670` ↔ paket kimliği `DBE6B8E5…` (§3.3) |
| G-E · süreç teyidi | dinleyen **PID 31948**'in komut satırı bu dist yolunu çalıştırıyor (ayrıca bağımsız ölçüldü) |
| G-B / G-C / G-D | DB hedefi `127.0.0.1:5439/hukuk_fix1_test` (disposable allowlist) · port **8101 boştu** · canlı portlar (8080/3002/3000/3001/5432) hedef olarak **yasak** |
| Süreç düzeyinde DB bağı | PID 31948 → **5439'a 5 ESTABLISHED**, **5432'ye 0** |

> **Kayda geçen sınır:** başlatıcının kendi `[G-A]…[G-E]` satırları, koşum arka plana taşınırken
> boru hattında **kesildi**. Bu yüzden beş kapının tamamı **bağımsız olarak yeniden ölçüldü**
> (dist sha256, DB hedefi, port doluluk, canlı port yasağı, süreç komut satırı). Kapı çıktısı
> kaybolduğu için "kapı geçti" iddiası **başlatıcının sözüne değil** bu ölçümlere dayanır.

**Paketin değişmez dosyalarına dokunulmadı:** `HY_C33_RELEASE22_CUTOVER_R27` yalnız **okundu**;
aday kökünde `.env` **yazılmadı** (ortam değişkenleri süreçten geçirildi), günlükler ve durum
dosyası **paket dışı** scratchpad'e yazıldı.

### 5.2 Ölçüm aracının kimliği

Koşucunun yedi dosyası, onaylı `origin/main` ağacıyla **birebir eşit** ölçüldü:
`i9-run.js` `681F5E6B…` · `i9-01-setup.js` `8CE916F2…` · `i9-02-identity.js` `99DF9EBB…` ·
`cl-lib.js` `0BA0E53C…` · `cl-09-close-access.js` `01273998…` · `ah-lib.js` `DF882DB7…` ·
`i3-lib.js` `56F3788E…`. **Betikler değiştirilmedi.**

`CL_PRISMA_ROOT` ve `CL_BCRYPT_PATH` RELEASE22 kökünden verildi; bunlar **ölçüm kütüphanesidir**,
ölçülen ürün ikilisi değildir — üçü ayrı satırda tutulur (ürün ikilisi · canlı sürüm · ölçüm
kütüphanesi).

### 5.3 Sonuç

| Kalem | Değer |
|---|---|
| runId / alan | `7dc35293` · tenant `cl-acc-7dc35293` (yazmadan **önce** ayrıldı, çakışma **0**) |
| Ortam | disposable `127.0.0.1:5439/hukuk_fix1_test` · API `http://127.0.0.1:8101/api` |
| İzolasyon tabanı | 1229 komşu tenant · client 1177 · user 1071 · digest `2cf716b27a08633b` |
| Kurulum | **8/8 satır** commit edildi |
| **Ölçümler** | **PASS 14 · FAIL 0 · ÖLÇÜLEMEYEN 0** |
| Bulgu | **1** (aşağıda) |
| Kapanış | `usersTotal 3` · `usersDeactivated 3` · `stillActive 0` · `tokenVersionBumped 3` · `evidencePreserved true` · `caseCronExposureClosed true` |
| Kapanış kararı | `ERISIM SONLANDIRILDI + CRON MARUZIYETI KAPANDI - kanit KORUNDU` |
| Doğrulama | kapatma sonrası login **401** · tekrar çağrı `alreadyClosed=true`, `usersDeactivated=0`, exit 0 |
| Koşum çıkışı | **exit 0 · result PASS** · parola/token hiçbir yere yazılmadı |

**R21B1 ile karşılaştırma:** R21B1 provası da **PASS 14 / FAIL 0 / ÖLÇÜLEMEYEN 0** vermişti.
İki sonuç **uyuşuyor**, ancak bu kayıtta geçerli olan **R27'nin kendi koşumudur**; R21B1 sonucu
onun yerine kullanılmamıştır.

### 5.4 Bulgu — L-1 / B-2 (kabul beklentisi GEVŞETİLMEDİ)

> `UPDATE yolundaki lifecycle reddi STABIL KOD TASIMIYOR (code=YOK). create/dedup yolu ayni
> yetki reddini CLIENT_MUTATION_DENIED_LIFECYCLE ile dondurur (assertCanReactivateViaCreate →
> denyMutation). Iki yol AYNI yetki kararini FARKLI sozlesmeyle bildiriyor.`

Bu **zaten bilinen B-2**'dir (İ9 paketi §7'de kayıtlı, "İ9'u BLOKE ETMEZ"). **R27 bunu
düzeltmez** ve düzeltmesi beklenmiyordu. Yetki kararı **doğrudur** (403, yazma **0**); kusur
yalnız **ret gövdesinin sözleşmesindedir**. Bu kayıt B-2'yi kapatmaz ve ürün yamasına
geçilmemiştir.

### 5.5 Ölçülen yan etki — prova ortamına özgü (KAPSAM DÜZELTİLDİ, 2026-09-11)

**Düzeltme:** bu bölümün ilk hâli etkiyi "disposable DB ile sınırlı" diye yazıyordu; "yalnız
kendi alanıma yazıldı" ifadesiyle birlikte okunduğunda **yanlış bir kapsam** veriyordu. Tam API
**paylaşılan** disposable DB'ye bağlandığında **`GreetingService` zamanlayıcısı başka tenant'lara
da yazdı.** Kapsam salt-okuma ile ölçüldü; **başka alanlarda geri alma yapılmadı**, kanıt korundu:

| Ölçüm | Değer |
|---|---|
| Yabancı alanlara tek yazma türü | `Office.lastGreetingRunAt` damgası |
| Etkilenen kapsam | **36 ayrı tenant** (`ah-*` önekli önceki kabul alanları) · 41 `Office` satırının 36'sı |
| Damgalanmayan | 5 satır (günlükte "ADMIN kullanıcı yok, damgalanmadı") |
| Zaman penceresi | `2026-09-11 11:50:00.073 → .356` UTC — **283 ms**; DB'deki bütün damgalar bu pencerede → etki bu provanındır |
| Gerçek tebrik üretimi | **YOK** — `SpecialDay` 0 · `GreetingQueue` 0 · `EMAIL_PROVIDER=mock` |
| Provanın kendi alanı | `Office` kaydı yoktu → damgalanmadı |
| Diğer bütün yazmalar | kendi alanında: `Task` 1 · `AuditLog` 2 (`CLIENT_UPDATE`) · `Client` 3 |

- Derlemede bu zamanlayıcıyı kapatan **desteklenen ortam anahtarı yok**; aynı davranış önceki
  provalarda da oluşmuştur (B-1 provası günlüğünde 20 satır).
- `EMAIL_PROVIDER=mock` verildiği için dışarı gönderim yoktur; canlı DB'ye **hiç** bağlanılmamıştır.
- **Kural (owner talimatı):** tam API provaları bundan sonra **oturuma özel disposable DB**'de
  koşulur. İ9 düzeneğinin bu kurala uyan doğrulaması
  `client-live-acceptance-i9-r01/CLIENT-LIVE-ACCEPTANCE-I9-R01.md` §6'dadır.

**Ürün kusuru olarak sınıflandırılmamıştır** (prova düzeneğinin bilinen sınırı).

### 5.6 Koşum sonrası temizlik ve canlı dokunulmazlık

| Kontrol | Ölçüm |
|---|---|
| Prova süreci | PID 31948 **kapatıldı** (komut satırı önce doğrulandı) · `:8101` dinleyici **0** |
| Canlı API / Web | `:8080` → PID **50716**, `:3002` → PID **22440** — **değişmedi** |
| Canlı DB | `hukuk-postgres` healthy · `hukuk_db` içinde `cl-acc-7dc35293` **0 kayıt** |
| Disposable alan | `cl-acc-` tenant 8 → **9** (yalnız kendi alanım) · kendi tenant'ımda aktif kullanıcı **0** |
| Başka oturumların alanları | dokunulmadı; hiçbiri açılmadı veya kapatılmadı |

## 6. Mühür / authority durumu — AKTİF ADAY DA HAZIR DEĞİL

| Alan | **R27 (aktif)** | R26 (tarihsel) |
|---|---|---|
| `state.sealed` | **False** | False |
| `state.authorityProduced` | **False** | False |
| `state.nonceProduced` | **False** | False |
| `state.ratificationRef` | **None** | None |
| `qualification.verify.verdict` | `PACKAGE_STATIC_VERIFIED_UNSEALED` | `PACKAGE_STATIC_VERIFIED_UNSEALED` |

R27 nitelendirme koşumları (FAIL 0): NC 91 · gerçek primitifler 21/21 · preflight entry-path
12/12 · preflight fixture 14/14 · C36 bağlama provası 29 · owner-command şablonu 16.

**Sonuç:** R27 şu hâliyle canlıya alınamaz. Sıradaki her adım **ayrı owner GO** ister:
ratifikasyon ref'i → owner preflight → `-Live` gerçek primitifler → onaylı kimlik → mühür →
cutover → teknik kabul → hedefli kabul. **Yürütücü OFFICE/C33.**

## 7. Geri dönüş (rollback) pini — ÖLÇÜLDÜ, RELEASE20 DEĞİL

| Alan | **R27 (aktif)** | R26 (tarihsel) |
|---|---|---|
| `rollback.release` | `HY_W4_RELEASE21` | `HY_W4_RELEASE21` |
| `rollback.sourceCommit` | `2187a78b…` | `2187a78b…` |
| `rollback.buildId` | `g91HUaBesekB-R2rRawQj` | `g91HUaBesekB-R2rRawQj` |
| `rollback.liveNow` | **True** | True |
| `rollback.manifestDigest` | `D6082E199ACA34964037B44EFD48EAB80E280EF7668B74CC605431E024B41D61` | — |
| Kök yeniden hash | 88.132/88.132 eşit (dosya 83.339 + bağlantı 4.793), okunamayan 0 | — |

**Kesinti/rollback süresi hiçbir adayda ölçülmemiştir** (R23/R24/R25'in üçünde de
`rollback.performed = false`).

## 8. İ9'un ön koşulu (bu kayıtla sabitlenir)

> **İ9 canlı kabulü, R27/RELEASE22'nin canlıya geçtiğinin sürüm ve derleme kimliğiyle
> doğrulanmasına bağlıdır.** Doğrulama, cutover'dan sonra ve **ayrı owner GO** ile şu üçlüyle
> yapılır:
> 1. canlı süreçlerin komut satırındaki **kök** `HY_W4_RELEASE22` olacak,
> 2. web **`BUILD_ID`** `xJZ1G1TsbOnHoWUzMD8CQ` olacak (bugün `g91HUaBesekB-R2rRawQj`),
> 3. canlı dist'teki `client.service.js` sha256'sı **`01CA99AE…5143`** olacak
>    (bugün `5D3DF71C…E97D`).
>
> `main.js` hash'i bu doğrulamada **kullanılamaz** (§4). **İ9 kesin iştir**; yayın bağımlılığı
> onu koşullu işe dönüştürmez. Bu kayıt İ9'u canlıda **başlatmaz**.

Prova tarafındaki teknik boşluk **kapanmıştır** (§5): İ9'un kalan tek bağımlılığı **yayın**dır.

## 9. B-1 davranış sınırı ve test kanıtı (değişmedi)

**ÖNCE:** kayıt aktifken `PUT /clients/:id` `{isActive:true}` → **404 "Müvekkil bulunamadı"**
(kayıt dururken). Kök neden: no-op istekte Prisma'ya verilen `data`nın tüm alanları `undefined`;
`updateMany` bunu `count=0` sayıyor; ürün `count===0` dalında `NotFoundException` fırlatıyordu.

**SONRA:** başarıya devam **üç koşulun birlikte** sağlanmasına bağlı — (1) ana güncelleme verisi
**gerçekten boş** (yalnız `undefined` üzerinden; `null`/`false`/`0`/`''` **gerçek değerdir**),
(2) satır **aynı tenant** kapsamında hâlâ mevcut (aynı transaction içinde ölçülür),
(3) ilişkisel yazma **niyeti yok** (`phones`/`emails`/`addresses` gönderilmemiş). Saf no-op'ta
transaction sonrası `syncContactFollowUpTaskSafe` **atlanır**.

**DEĞİŞMEYENLER (regresyonla kilitli):** gerçek kayıt yokluğunda **404** · lifecycle yarışında
**409 `CLIENT_STATE_CHANGED`** · yetki/tenant/kimlik kapıları · `create()` ve dedup-reaktivasyon
yolu · gerçek iletişim güncellemelerinde iletişim-görevi senkronu. `count=1` üretmek için
`isActive`, `updatedAt` veya audit'e **yapay yazma eklenmedi**. **Açıkça bildirilen mevcut
davranış:** genel `CLIENT_UPDATE` audit'i saf no-op'ta **da** yazılır; kaldırılmadı, testte
`toHaveLength(1)` ile kilitlendi.

| Aşama | Ölçüm |
|---|---|
| Kusurun yeniden üretimi (yamasız) | jest **exit 1** · `SAF NO-OP → NotFoundException at client.service.ts:1888` |
| Yamalı suite (gerçek PostgreSQL) | **11/11 PASS** · jest **exit 0** |
| Tip kontrolü | `tsc` fark **0** (529 baseline hata; bu iki dosyada **sıfır**) |
| Merge öncesi CI (#2609) | **9/9 SUCCESS** · MERGEABLE/CLEAN |
| Post-merge main CI | **3/3 SUCCESS**, kendi SHA `845b92d9` üzerinde |
| **İ9 provası — R27 dist** | **PASS 14 / FAIL 0 / ÖLÇÜLEMEYEN 0** (§5) |

## 10. main'de VAR / canlı RELEASE21'de YOK — RELEASE21 kaynak ağacına göre ÖLÇÜLDÜ

Taban: canlı kaynak ağacı `2187a78b` ↔ `main` `f3ddb4a2` (arada **52** commit).

**`apps/api/src` ürün dosyası: 11** (spec/test hariç)

| # | Dosya (`modules/…`) | Kalem |
|---|---|---|
| 1 | `client/client.service.ts` | **B-1** (#2609) |
| 2 | `case/case.service.ts` | AK-2 / AK-1a |
| 3 | `lawyer/lawyer.service.ts` | AK-2 (#2599 · #2602) |
| 4 | `lawyer/dto/create-lawyer.dto.ts` | AK-2 |
| 5 | `seed/seed.controller.ts` | AK-2 / AK-1a |
| 6 | `seed/seed.service.ts` | AK-2 |
| 7 | `office-approval/office-f01-authorization.guard.ts` | AK-1a (#2604) |
| 8 | `office-approval/office-write-role.policy.ts` (yeni) | AK-1a |
| 9 | `office-approval/office-approval.service.ts` | AK-1a eki (#2606) · CLF-O0-01 (#2608 · #2612) |
| 10 | `client-financial-disclosure/…-approval-eligibility.ts` | AK-1a eki |
| 11 | `client-financial-disclosure/…-approval.service.ts` | AK-1a eki |

**Ürün dışı ölçümler:** `apps/web` ürün dosyası **0** · `schema.prisma` **0** ·
migration **0** · `pnpm-lock.yaml` **0** · `.env.example` **0**.

**R27 adayı main'in ürün ağacıyla güncel:** aday `13740670`'ten sonra main'e **10 commit**
girmiştir ve bunların **ürün dosyası farkı 0**'dır (hepsi `docs(governance)` / `docs(client)`).

## 11. Kesin / koşullu sınıflandırma

- **Kesin işler: 17 · tamamlanan 8** (İ1a · İ2 · İ3 · İ5b · İ6 · İ7 · İ1b · İ8).
- **Kesin kalan 9:** **İ4 · İ5 · İ9 · İ10 · İ11 · İ12 · İ13 · İ14 · İ15.**
  **İ9 kesin iştir**; yayına bağlı olması onu koşullu işe **dönüştürmez**.
- **Koşullu — tam iki kalem:**
  1. **İ16** — İ4 **DAHİL** olduğunda devreye girer.
  2. **İ5a** — İ5'in (a) şıkkı; **canlıda kilit tutan senaryo kurulursa** süre/kilit bütçesi
     onarımı.
- **İ17** — kritik yol **dışı** veri işi.
- **B-2** — ayrı, **bloke etmeyen** ürün kusuru (§5.4); İ9'un kabulünü engellemez.
- **Hizmet kabulü: 0/8 tam** — bu kayıt değiştirmez.

## 12. Kapsam DIŞI

Aday üretme · paket/mühür/authority/cutover işlemi · ratifikasyon ref'i · owner preflight ·
`-Live` primitif koşumu · deploy · restart · migration · canlı yazma · canlı bayrak değişikliği ·
İ9'un canlıda başlatılması · B-2 ürün yaması · İ10…İ15 · İ16/İ17.

**Sonraki canlı adım:** C33 yayın kanıtı (R27 cutover'ı ve sürüm/derleme kimliği), ardından
**ayrı İ9 canlı GO**.

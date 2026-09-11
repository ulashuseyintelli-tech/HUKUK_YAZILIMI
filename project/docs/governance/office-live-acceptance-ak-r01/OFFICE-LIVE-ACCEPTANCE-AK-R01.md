# OFFICE RELEASE22 HEDEFLİ KABUL — AK-2 + AK-1a — KABUL PAKETİ R01

| alan | değer |
|---|---|
| Paket yazıcısı | OFFICE 33 |
| Bağımsız inceleme ve sunum | ana yürütücü (tek çalıştırılabilir kabul paketi olarak) |
| Dayanak | owner GO — "OFFICE RELEASE22 HEDEFLİ KABUL HAZIRLIĞI" (2026-09-11) |
| Hedef sürüm | RELEASE22 (aday `13740670`), R27 cutover ile canlı |
| Durum | **CANLI KABUL: PASS 31/31 · exit 0 · kapanış doğrulandı** — `OWNER-GO-OFFICE-AK-20260911-R01` · runId `e1293381` · ana yürütücü bağımsız doğruladı (§15) |
| Main | #2632 @ `8efbe25b` (paket) · #2633 @ `4f55f20c` (inceleme notları) |
| Bağımsız inceleme | ana yürütücü, head `a829ca7b`: **engelleyici bulgu yok**. İki isteğe bağlı not (n1: kanıt SHA'sının dosya adı · n2: exit 1'in wrapper istisnası anlamı) belge düzeltmesiyle işlendi; araç SHA'ları değişmedi |

> **§1–§14 hazırlık metnidir ve değiştirilmedi.** Oradaki prova sonuçları canlı PASS değildir. Canlı
> kabulün kaydı yalnız §15'tedir. Hazırlık aşaması canlıya hiçbir şey yazmadı, R27 mühürlü paketine
> dokunmadı ve tüketilmiş A-07 fixture'ını kullanmadı.

---

## 1. Ön koşullar — canlı koşumdan önce

| # | koşul | kim doğrular | paket nasıl zorlar |
|---|---|---|---|
| Ö-1 | **CLIENT I9 kapanışı doğrulandı** | ana yürütücü → owner | zorlayamaz; owner GO'su taşır. Not: main'de kayıt #2631 @ `225761c6` "İ9 canlı kabulü KAPANDI" diyor (`OWNER-GO-CLIENT-I9-20260911-R01`, runId `d19ce2c7`, PASS 14/0/0). Bağımsız doğrulaması ana yürütücüdedir; bu paket onu doğrulanmış saymaz |
| Ö-2 | **OFFICE canlı koşum GO'su** (`OWNER-GO-OFFICE-AK-YYYYMMDD-Rnn`) | owner | `-GoRef` biçimi (K-GO) + canlı jeton (G-0) |
| Ö-3 | Canlı API RELEASE22 ve derleme provadaki derleme | paket | K-API + K-BLD (§9) |
| Ö-4 | Eşzamanlı başka canlı kabul koşumu yok (I9 dahil) | owner | zorlayamaz. Login hız sınırı (IP başına 10/dk) ortaktır; ölçüm yalıtımı da gerekir |
| Ö-5 | Paket kanonik checkout'ta, belgedeki SHA ile | owner komutu | `ak-live.ps1` SHA kontrolü (§12) |

Bu hazırlık GO'su canlı koşumu **yetkilendirmez**.

---

## 2. Kapsam

**Kapsamda:**

- **AK-2:**
  - yetkisiz ayrıcalıklı oluşturmanın reddi;
  - mevcut pasif ayrıcalıklı avukatın yetkisiz yeniden etkinleştirilmesinin reddi;
  - yetkili oluşturma ve yetkili yeniden etkinleştirme;
  - her birinin aynı transaction'daki audit bağı.
- **AK-1a:** VIEWER'ın OFFICE yazmalarının reddi ve izinli okumaları.
- **Her retle birlikte:** bu tenant'ta yazma 0 olduğu doğrulanır.

**Kapsam dışı:**

| kalem | neden |
|---|---|
| AK-1a eki (VIEWER onay kararı) | ayrı madde |
| AK-1b / AK-1c | owner kararı |
| `/cases` ön kontrol yarışı | ayrı madde |
| CLF-O0-01 / FD iptal sınırı | ayrı madde |
| Ayrıcalıksız pasif kaydın yeniden etkinleştirilmesi | owner kararı açık |
| SMTP/SMS ayarları | dışarı gönderim riski |
| Seed uçları | — |
| A-07 ve OFFICE A-03..A-07 alanları | tüketilmiş fixture |

A-07 alanlarına **erişilemez**:
- `off-acc-` öneki G-1'de YASAK (NC-06 ile ölçüldü).
- A-03..A-07 canlı jetonu bu paketi çalıştıramaz.

---

## 3. Ölçülen kaynak sözleşmesi (RELEASE22 `13740670`)

| madde | kaynak | davranış |
|---|---|---|
| AK-2 create | `lawyer.service.ts:262-264`, `:661-672` | Aşağıdakilerden biri H2 ister: rütbe PARTNER/MANAGER, `canModifyOtherPermissions`, `permissionsLocked`. İstemezse 403 "…yalnız PARTNER veya ADMIN tarafından atanabilir." |
| AK-2 reactivate | `:277-280`, `:701-714` | Eşleşen pasif kayıt ayrıcalıklıysa H2 ister. Rütbe, izinler ya da `canApproveOfficeActions` ayrıcalık sayılır. İstemezse 403 "…yeniden etkinleştirme yalnız PARTNER veya ADMIN tarafından yapılabilir." |
| H2 | `:583-605` | ADMIN, veya aktif, aynı tenant'ta ve bağlı PARTNER |
| audit | `:285-318`, `:369-396` | `LAWYER_REACTIVATE` / `LAWYER_CREATE`, yazmayla **aynı tx** |
| AK-1a | `office-f01-authorization.guard.ts:40-51`, `office-write-role.policy.ts:15-28` | Okuma F01 aktörü ister. Yazmada VIEWER **ilk yazmadan önce** elenir: 403 `OFFICE_WRITE_DENIED_VIEWER` |
| F01 aktör | `office-approval.service.ts:501-555` | ADMIN, veya bağlı avukat (officeId + PARTNER/MANAGER ya da `canApproveOfficeActions`) |

---

## 4. Sentetik kapsam — 12 satır, tek transaction

Tenant `off-ak-<runId>`: 8 hex, her koşumda yeni. E-postalar `off-ak-<runId>-<rol>@office-acceptance.invalid` biçimindedir (RFC 2606). Parola süreç belleğinde üretilir; dosyaya ve çıktıya yazılmaz (G-4).

| # | satır | rol |
|---|---|---|
| 1 | Tenant | kabul alanı |
| 2 | Office, `autoGreetingEnabled=false` | Dakikalık tebrik cron'u bu satırı damgalamaz (A6'da, API birkaç cron turu çalıştıktan sonra `lastGreetingRunAt=null` ölçüldü; `evidence/provaA6-inventory.json`) |
| 3 | User ADMIN | AK-2 yetkili aktör |
| 4, 5 | User USER + bağlı Lawyer PARTNER | AK-2 yetkili aktör. AK-1a'da VIEWER olmayan kontrol |
| 6, 7 | User USER + bağlı Lawyer MANAGER | AK-2 yetkisiz aktör: F01 yazmayı geçer, H2'de reddedilir |
| 8, 9 | User VIEWER + bağlı Lawyer PARTNER | AK-1a aktörü. Rütbesi PARTNER'dır; yani ret rütbeden değil, rolden gelir |
| 10 | Lawyer P1, pasif PARTNER | yeniden etkinleştirme hedefi (rütbe ayrıcalığı) |
| 11 | Lawyer P2, pasif LAWYER + `canApproveOfficeActions` | yeniden etkinleştirme hedefi (delege ayrıcalığı) |
| 12 | Lawyer T, aktif LAWYER | AK-1a yazma hedefi |

Kurulum yarıda kalırsa transaction ROLLBACK olur ve hiçbir satır kalmaz.

---

## 5. Kabul adımları

Her **ret** adımı şöyle ölçülür:
- İstekten önce ve sonra tenant görüntüsü alınır: lawyer, user, office, staffMember, officeBankAccount, auditLog, case, client.
- Ölçüt: **birebir 403**, kendi kapısının kodu veya metni ile, **ve** görüntü aynı.
- 401, 400, 500, belirsiz yanıt ya da yanlış kod ret sayılmaz (NC-07).

Her **pozitif** adım şöyle ölçülür:
- Beklenen fark kümesi **kesin** olmalı; fazladan değişiklik FAIL'dir.
- Oluşan audit satırı aktör, varlık ve metadata ile doğrulanır.

Belirsiz HTTP isteği **tekrarlanmaz**; o adım ÖLÇÜLEMEDİ olur.

| ID | aktör | istek | beklenen |
|---|---|---|---|
| AK2-N1..N4 | MANAGER | `POST /lawyers`: rütbe PARTNER / rütbe MANAGER / `canModify` / `locked` | 403 create metni, F01 kodu **değil** · yazma 0 |
| AK2-N5, N6 | MANAGER | `POST /lawyers`: P1 / P2 mükerreri | 403 reactivate metni · yazma 0 |
| AK2-C1 | MANAGER | `POST /lawyers` ayrıcalıksız | 201 · [lawyer+, auditLog+] · LAWYER_CREATE, userId = MANAGER. Retler aktör-geneli değildir |
| AK2-P1 | ADMIN | PARTNER + canModify + locked | 201 · [lawyer+, auditLog+] · alanlar ve audit metadata eşleşir |
| AK2-P2 | bağlı PARTNER | MANAGER + canModify | 201 · aynısı |
| AK2-R1 | bağlı PARTNER | P1 mükerreri | 201 · [lawyer~, auditLog+] · satır sayısı değişmez · LAWYER_REACTIVATE `privileged:true`, `reactivatedFromDuplicate:true` |
| AK2-R2 | ADMIN | P2 mükerreri | 201 · aynısı |
| AK1A-R1..R4 | VIEWER | `GET /lawyers` (T listede), `GET /lawyers/:T`, `GET /lawyers/defaults`, `GET /office` | 200 |
| AK1A-R0 | — | okumalar | yazma 0 |
| AK1A-W1..W9 | VIEWER | `POST /lawyers` · `PUT /lawyers/:T` · `PATCH /lawyers/:T` · `DELETE /lawyers/:T` · `PUT /lawyers/order/update` · `PUT /lawyers/defaults/set` · `PUT /office` · `POST /office/bank-accounts` · `POST /staff` | 403 `OFFICE_WRITE_DENIED_VIEWER` · yazma 0 |
| AK1A-C1 | bağlı PARTNER (USER) | W2 ile aynı rota ve gövde: `PUT /lawyers/:T {title}` | 200 · yalnız [lawyer~]. Ret rolden gelir |
| AK1A-A1 | anonim | `GET /lawyers` | 401 |
| K-1 | — | kapanış | aktif kullanıcı 0 · aktif dava 0 · audit korunur |
| K-2 | — | 4 JWT ile `GET /lawyers` | hepsi 401 |
| I-1 | — | aktörlerin başka tenant'taki audit izi | 0 |
| I-3 | — | **yabancı tenant sayı özeti**, kendi alanı hariç: tenant başına user, lawyer, office, staffMember, case, client ve officeBankAccount sayısı | İlk API çağrısından önceki ölçüm = kapanıştan sonraki ölçüm. İçerik okunmaz. Bakılacak yabancı tenant yoksa ÖLÇÜLEMEDİ olur; kör PASS verilmez |
| I-2 | — | seyirci tenant, tam satır özeti | değişmedi. **Yalnız boş disposable DB'de.** Canlıda seyirci kurulmaz; bu kayıt oluşmaz |

**Başarı ölçütü:**
- Canlı: `exit 0` = **31/31** PASS (I-3 var, I-2 yok), kapanış doğrulanmış.
- Disposable: 32/32.

---

## 6. Yazma envanteri — canlı koşum başına, KESİN

| tablo | insert | update | delete | kaynak |
|---|---:|---:|---:|---|
| Tenant | 1 | 0 | 0 | kurulum |
| Office | 1 | 0 | 0 | kurulum |
| User | 4 | **4** | 0 | kurulum · kapanış: `isActive=false`, `tokenVersion++` |
| Lawyer | **9** | **3** | 0 | Insert: kurulumda 6, AK2-C1/P1/P2'de 3. Update: R1 ve R2 `isActive` · AK1A-C1 `T.title` |
| AuditLog | **5** | 0 | 0 | 3 × LAWYER_CREATE + 2 × LAWYER_REACTIVATE |
| **diğer 205 tablo** | 0 | 0 | 0 | — |
| **toplam** | **20** | **7** | **0** | |

**Ölçüm.** A6 provasında tüm DB'nin `pg_stat_user_tables` sayaçları okundu:
- Önce 65 saniyelik boşta pencere: 210 tablodan **0**'ı yazıldı. Bu, API'nin kendi arka plan yazmasının olmadığını gösteren gürültü kontrolüdür.
- Sonra koşum penceresi: **yalnız bu 5 tablo** yazıldı.
- A6'daki fazladan +1 Tenant, +1 Office ve +1 User seyirci içindir ve yalnız disposable'da kurulur.
- Aynı sonuç, I-3'ten önceki araç sürümüyle koşulan A5'te de birebir ölçüldü. A5'in kanıtı bu pakette değil; paketteki bütün kanıtlar dondurulmuş araçlarla üretildi.
- Kanıt: `evidence/provaA6-idle-inventory.txt`, `provaA6-write-inventory.txt` ve `pgstat6-S*.json`.

Login yazma üretmez; User'daki update'lerin tamamı kapanıştandır.

**Retlerde yazma yok:**
- 15 ret adımının her birinde tenant görüntüsü birebir aynıydı.
- Bütün DB sayaçları, envanter dışında yazma olmadığını gösterdi.

---

## 7. Canlıda kalıcı kalan veri

Canlıda silme yoktur.

| satır | son durum |
|---|---|
| Tenant `off-ak-<runId>` | 1 |
| Office | 1, tebrik kapalı |
| User | 4, hepsi `isActive=false`, `tokenVersion=1`. Login ve dağıtılmış JWT'ler 401 |
| Lawyer | 9, `isActive=true`. Kapanış avukat satırlarına dokunmaz; bu satırlara erişen kullanıcı yok (bkz. §14) |
| AuditLog | 5. Kabul kanıtı; kapanışta **korunduğu doğrulanır** |

---

## 8. Erişim kapatma ve başarısızlık yolları

| durum | ne olur | kanıt |
|---|---|---|
| G-0 / K-* kapısı düşer | yazma **başlamaz**. Exit 4 (runner) veya 2 (wrapper) | NC-01..05, gate testleri T1..T8 |
| Kurulum yarıda kalır | tek transaction ROLLBACK, satır kalmaz | — |
| G-0b (API bu DB'ye bağlı değil) | satır silinmez; erişim runId ile kapatılır, koşum durur | — |
| Kabul adımı sırasında hata | `finally` kapanışı çalışır, K-1/K-2 ölçülür. Hüküm ÖLÇÜLEMEDİ, exit 2 | **D1**: `AK_ABORT_AFTER=AK2-P1` → kapanış doğrulandı, 4 JWT 401 |
| Süreç öldürülür | runId, **ilk yazmadan önce** sonuç dosyasına ve ekrana yazılır. Bağımsız kurtarma çalıştırılır | **D2**: `AK_SKIP_CLOSE=1` → 4 aktif kullanıcı kaldı. Kurtarma: 4 kapatıldı, doğrulandı. İkinci kurtarma: `alreadyClosed`, yazma 0 |
| Kapanış doğrulanamaz | exit 3; kurtarma tekrar koşulur (idempotent) | NC-12 |

**Kurtarma komutu** (aynı GO ile, tekrar güvenli):

```
ak-live.ps1 -GoRef <GO> -Recover <runId>
```

- API'ye bağlı değildir, doğrudan DB'ye yazar. Canlı sürüm değişmiş olsa bile çalışır.
- Yalnız `off-ak-<runId>` tenant'ına dokunur (G-1/G-2).

**Tekrar koşum yoktur.** `exit ≠ 0` sonrasında kabul **otomatik tekrarlanmaz**. Yeni bir kabul koşumu yeni runId ve 12 yeni satır demektir ve owner kararıdır. Kurtarma bu kuralın dışındadır; her zaman serbesttir.

---

## 9. Kapılar

**Wrapper kapıları.** `ak-live.ps1`, yazmadan önce durur (exit 2):

- **K-GO:** GoRef biçimi; Recover runId biçimi (8 küçük hex); `-Recover` ile `-PreflightOnly` birlikte verilemez; `node` bulunmalı.
- **K-ARC:** yanındaki 6 araç dosyası dondurulmuş SHA'larla eşit olmalı (§10). Bu dosyalar: 5 AK betiği ve `ow-lib.js`.
- **K-API:** 8080 dinleyicisinin komut satırı `HY_W4_RELEASE22\…\dist\apps\api\src\main.js` olmalı. Kurtarmada atlanır.
- **K-BLD:** canlı `lawyer.service.js` ve `office-f01-authorization.guard.js`, provada koşulan derlemenin SHA'sına eşit olmalı. Kurtarmada atlanır.
  - Gerekçe: `main.js` hash'i derlemeleri ayırt etmez. RELEASE21 ile RELEASE22'nin `main.js`'i aynıdır (`28D84796…`, ölçüldü).
- **K-ENV:**
  - başlatıcı (`C:\Ops\hukuk\bin\start-api.ps1`) EnvFile'ı **koşan sürümün** `.env`'i olmalı;
  - `DATABASE_URL` süreç içinde okunur ve **basılmaz**; komut satırına konmaz;
  - hedef `127.0.0.1:5432/hukuk_db` olmalı.

**Runner kapıları.** `ak-run.js` / `ak-99-close.js`:

- **G-0:** varsayılan ortam `live`'dır (fail-safe).
  - Canlı jeton `YES-LIVE-OFFICE-ACCEPTANCE-AK2-AK1A` ister.
  - GoRef biçimini ister.
  - DB ve API ortamını çapraz kilitler: disposable ortamda 8080 yasak; canlıda yalnız 8080 geçer.
  - Loopback ve allowlist uygular.
- **G-1:** `off-ak-` öneki zorunlu. Gerçek tenant'lar ve `off-acc-`, `cl-acc-`, `f04-acc-`, `ah-` önekleri yasak.
- **G-2:** yazan her adım tenant'ı doğrular.
- **G-3:** slug çakışırsa durur.
- **G-4:** sır sonuç dosyasına yazılamaz.
- **G-0b:** yeni ADMIN ile login olmalı.
- **I-3 temel ölçümü:** kurulumdan hemen sonra, ilk API çağrısından önce alınır. Ölçülemezse kabul başlamaz: koşum hatası, `finally` içinde kapanış, hüküm ÖLÇÜLEMEDİ.

---

## 10. Araç kimliği

### 10.1 Dondurulmuş araçlar

LF satır sonu kullanılır ve `core.autocrlf=false`'tır; bu yüzden checkout'ta SHA değişmez.

| dosya | bayt | SHA-256 | canlıda |
|---|---:|---|---|
| `scripts/ak-live.ps1` | 9229 | `A0C74CD9C927FC16FF24613168D77B76209465CEBB87A40B4A2F2E3234CB719C` | **giriş** (owner komutu bunu doğrular) |
| `scripts/ak-run.js` | 8916 | `FD819B2565317F5D45197F6144382BD89B6DB3A25349A389A88BCC76FBF15251` | evet (K-ARC) |
| `scripts/ak-lib.js` | 14290 | `97EC6F432436053DA6B356BAF2D9650CCBB4A8C0EFAE967AA02374EC0F71DF98` | evet (K-ARC) |
| `scripts/ak-setup.js` | 7206 | `72A31B3D15F282DAB31B57EA1FAD5B430877FC517B61FD323C885422C25CB7B6` | evet (K-ARC) |
| `scripts/ak-cases.js` | 13965 | `1E8C59C01595A26B1CD8EB1BEA38F971D135AB37C2BDEA0F102C20C0B46A0160` | evet (K-ARC) |
| `scripts/ak-99-close.js` | 3149 | `DAAB14FEC295A2B4C5156D2E99DB7C83A8335F2660F23F4BD6D2D8140AAFAF0A` | evet (K-ARC) |
| `../office-delivery-r01/scripts/ow-lib.js` | 14004 | `612D20D1439DCAFEEB2C86AC867988133F26AE900D95F102571240D3A12F988A` | evet (K-ARC, yeniden kullanım, kopya değil) |
| `scripts/ak-negative.js` | 10287 | `F51AFB3FFE45EAEF48B5F72E278425C78F3E3627C999ACBF631D0D92DE813628` | hayır, yalnız disposable |
| `scripts/ak-start-api.js` | 7894 | `0166066731691049EAE6BE535BC4CDCC919515B3E9BD3CDD95273DE0B8DB0F5B` | hayır, yalnız prova API |
| `scripts/ak-live-gates.test.ps1` | 4846 | `86A5FE9373DA21686A87806BF03D9EA86B6486E325A8B47F24EF9D8D68D09343` | hayır, kapı testleri (§11.5) |

**Bağlama.** Her sonuç dosyası `tools` alanında koşan araçların SHA'sını taşır. A6, B3, D1 ve D2'nin dördü de 6/6 dondurulmuş SHA ile eşleşti. Battery sonunda 10 araç dosyasında drift 0 ölçüldü.

### 10.2 Derleme pinleri (K-BLD)

| derleme dosyası (`dist/apps/api/src/…`) | RELEASE22 (prova = canlı) | RELEASE21 (mutasyon provası) |
|---|---|---|
| `modules/lawyer/lawyer.service.js` | `427DB2F15BF619B99DF3448F90DE10D606C40314389AAAD26613C226F1A4323D` | `5F3E64C9…` (AK-2 metni YOK) |
| `modules/office-approval/office-f01-authorization.guard.js` | `38FF644526852082B0DEE81970C6C53DEE0C535FE09D33E5D3F3703AA3F363EA` | `BE2CF6DC…` |

Prova API'si canlının koştuğu `HY_W4_RELEASE22` dist'inden başlatıldı. Bu dizin salt okundu; hiçbir dosyası yazılmadı. Yani provada koşan derleme, canlıda koşan derlemenin kendisidir.

---

## 11. İzole doğrulama — sonuçlar

### 11.1 Ortam

- Oturuma özel konteyner `hy-ak-acc-b55080` (postgres:16-alpine), `127.0.0.1:5441`, DB `hukuk_office_ak_acc_test`.
- RELEASE22 Prisma 5.22 `migrate deploy` ile 130/130 migration uygulandı. Her prova taze DB ile başladı.
- Prova API'si `ak-start-api.js` ile başlatıldı:
  - **kabuk ortamı devralınmaz**;
  - `JWT_SECRET` o koşum için üretilir ve yazılmaz;
  - Redis ölü porta (6390) yönlendirilir;
  - `EMAIL_PROVIDER=mock`.
- Her başlatmada bağlantılar ölçüldü: 5432 = **0**, 6379 = **0**, 5441 = 3.
- Node `v24.18.0`, canlı API ile aynı.

### 11.2 Dondurulmuş araçlarla prova tablosu

| prova | derleme | runId | sonuç | kanıt SHA-256 |
|---|---|---|---|---|
| **A6** kabul + tüm-DB yazma envanteri | RELEASE22 | `41e7f47d` | **PASS 32/32** · exit 0 · kapanış doğrulandı · audit 5 korundu · I-3 1 yabancı tenant, eşit · boşta 0/210, koşum 5/210, §6 ile birebir | `provaA6-result.json` `581E5B61CB3AFB22EF7EABF1A463A212EA45E32F9A59A1EB798AEC43BECBBDCB` · `provaA6-write-inventory.txt` (tüm-DB pg_stat farkı) `A32C30F4F5B76832BC424C26E03A45A7AB7E97267267F9B09A563123A2ABD054` · `provaA6-inventory.json` (tenant satır envanteri) `2C6AFC7718641A307A713FEB98BC5F784E9D0633C3E8F78221E80EF3D679CB13` |
| **B3** mutasyon kanıtı | **RELEASE21** (AK düzeltmeleri yok) | `2b6c028b` | **FAIL 20/32, beklenen** · kapanış doğrulandı | `5B73597E742F27C8B89ACD274C8F8DE82D20839E49D7BFD1D2C5B363AC6C8E8A` |
| **D1** kesinti | RELEASE22 | `f1928684` | `AK_ABORT_AFTER=AK2-P1` → ÖLÇÜLEMEDİ, exit 2 · `finally` kapanışı doğrulandı · 4 JWT 401 · I-3: 4 yabancı tenant, eşit | `79961B3F8E5FABE88DA53D3A394D0AF5078D360305DDA49E5DFE04B401739668` |
| **D2** bağımsız kurtarma | RELEASE22 | `9e03b205` | kapanış atlandı → 4 aktif · I-3: 5 yabancı tenant, eşit · kurtarma 1: 4 kapatıldı, doğrulandı · kurtarma 2: `alreadyClosed`, yazma 0 | `83A55CAEF75A4D727C576559BBE0D96291EB9C90D0BCBB6B8828B94EEB0D6E14` · kurtarma `6F778FD12184A30D57AF27C617A7E1F8A6426F31DEF497A1A6FD51B92A6478C0` |
| **NC** negatif kontroller | — | — | **13/13** | `737E4A54C7CBDAF67C1F75A8BFDE6F1E1283D772613DAF28B4545E2CAD74BC3C` |
| **Kapı testleri** `ak-live.ps1` | canlı süreç ve derleme **salt okuma** | — | **11/11**, PS 5.1 | `491B641D7C4BFB042986D0C5F67FC51EF96CBE04722149D20990E5F5B97E465F` |

### 11.3 Mutasyon kanıtı (B3): düzenek eksik düzeltmeyi YAKALAR

RELEASE21'de ölçülen 20 FAIL, AK düzeltmelerinin olmadığı yerlerle birebir örtüşür:

- **AK2-N1..N4:** MANAGER ayrıcalıklı avukat oluşturdu. 201 döndü, `lawyer+` yazıldı.
- **AK2-N5, N6:** MANAGER pasif ayrıcalıklı kaydı yeniden etkinleştirdi. 201 döndü, `lawyer~` yazıldı.
- **AK2-C1, P1, P2:** audit YOK; fark yalnız `[lawyer+]`.
- **AK2-R1, R2:** yeniden etkinleştirme zaten yapılmıştı, audit YOK; fark `[yok]`.
- **AK1A-W1..W9:** VIEWER dokuz yazmanın dokuzunu da yaptı. W4 ve W7 ayrıca audit yazdı; W6 14 avukatı güncelledi.

Her iki derlemede de PASS olan 12 ölçüt: 5 okuma, AK1A-C1, A1, K-1, K-2, I-1, I-2 ve I-3. Bunlar kontrol ölçütleridir; düzeltmeye bağlı değildir.

### 11.4 Negatif kontroller (NC-01..13)

- **G-0 kapıları:**
  - canlı ortam, jeton yok;
  - GoRef biçimi yanlış;
  - disposable ortam ama API 8080;
  - canlı ortam ama test API'si;
  - allowlist dışında DB adı, portu, host'u ya da başka prova DB'si (4/4).
- **G-1:** 7 yabancı slug reddedildi.
- **Kesin ret kararı:** 10/10 vaka doğru.
- **G-4:** parola ve token yazılamaz.
- **Boş gözlem kümesi:** ObservationError verir; "değişmedi" sayılmaz.
- **Karşılaştırıcı:** tek alan değişimini yakalar (mutasyon).
- **Bilinmeyen runId:** alan yok bulunur, yazma 0.
- **İkinci kapanış:** `alreadyClosed`; `tokenVersion` bir kez artar.
- **NC-13, I-3 karşılaştırıcısı:**
  - kendi alanına eklenen satır özeti değiştirmez (`c4bcea48…` = `c4bcea48…`);
  - yabancı tenant'a eklenen satır özeti değiştirir (`c4bcea48…` → `febee6e0…`, user 5 → 6).

### 11.5 Kapı testleri (`ak-live-gates.test.ps1`)

DB gerekmez; canlı `.env` okunmaz. Testler:

- **T0:** saf ASCII; PS 7 ve PS 5.1'de ayrıştırma hatasız.
- **T1..T4:** K-GO.
- **T5a..c:** K-ARC; `ak-cases.js` veya `ow-lib.js`'e tek satır eklemek durdurur.
- **T6:** K-API ve K-BLD **canlı** süreç ve derleme üzerinde geçer. Sonra sahte EnvFile K-ENV'de durur.
- **T7:** kurtarma yolunda hedef DB canlı değilse durur.
- **T8:** EnvFile satırı yoksa durur.

### 11.6 Geliştirme sırasında yakalanan düzenek hataları

Bunlar kayıt içindir; hepsi düzeltildi ve hepsi fail-closed davrandı.

| prova | hata | sonuç ve düzeltme |
|---|---|---|
| A1 | `OfficeBankAccount`'ta `tenantId` yok | Kurulum öncesi gözlemde düştü; tenant kurulmadı; kapanış `found:false`; hüküm ÖLÇÜLEMEDİ. Düzeltme: `office: { tenantId }` |
| A2 | AK1A-C1 `PATCH {title}` 400 döndü (`PatchLawyerDto` title almaz) | 30/31. Düzeltme: W2 ile aynı `PUT` kullanılıyor |
| — | prova başlatıcısı: CLIXML stderr, "dinleyici yok" = exit 1, ön plan zaman aşımı | düzeltildi. Başlatıcı artık derleme ayırt edicilerini de kaydeder |
| B3 (ilk deneme) | I-3'ün ilk sürümü temel ölçümü kurulumdan **önce** alıyor ve seyirciyi hariç tutuyordu. Taze DB'de **0 yabancı tenant** gördü ve yine de PASS verdi: kör ölçüm | Düzeltme: temel ölçüm kurulumdan sonra alınır; seyirci yabancı sayılır; 0 yabancı tenant → ÖLÇÜLEMEDİ. Bu hata B3 çıktısı incelenirken yakalandı; bütün battery yeniden koşuldu |

---

## 12. Canlı koşum komutu

**Yalnız Ö-1 + Ö-2 sonrasında.** Owner'ın PowerShell penceresinde çalıştırılır.

- **Yükseltme gerekmez.** Kullanıcının EnvFile'ı okuma ve `C:\Ops\hukuk\logs`'a yazma izni vardır; bu, yalnız ACL meta verisi ölçülerek doğrulandı, içerik okunmadı. Yükseltilmiş pencerede de çalışır.
- `-PreflightOnly` önce **salt okuma** yapar. 0 dışında bir kodla çıkarsa kabul başlamaz.
- Kabul koşumu tek kez yapılır.
- Yol kanonik checkout'a göredir: git kökü `…\HUKUK_YAZILIMI\project`'tir ve izlenen yol `project/…` ile başlar.

```powershell
$P  = 'C:\Development\HUKUK_YAZILIMI\project\project\docs\governance\office-live-acceptance-ak-r01\scripts\ak-live.ps1'
$GO = 'OWNER-GO-OFFICE-AK-YYYYMMDD-Rnn'   # owner canli GO'sundaki referans
if ((Get-FileHash -Algorithm SHA256 -LiteralPath $P).Hash -ne 'A0C74CD9C927FC16FF24613168D77B76209465CEBB87A40B4A2F2E3234CB719C') { throw 'ak-live.ps1 SHA uyusmuyor - CALISTIRMAYIN' }
powershell -NoProfile -ExecutionPolicy Bypass -File $P -GoRef $GO -PreflightOnly
if ($LASTEXITCODE -ne 0) { throw "on kontrol exit $LASTEXITCODE - kabul BASLATILMADI" }
powershell -NoProfile -ExecutionPolicy Bypass -File $P -GoRef $GO
```

**Çıkış kodları:**

| kod | anlam |
|---|---|
| 0 | PASS |
| 1 | FAIL. **Ek anlam:** wrapper'da yakalanmamış istisna da 1 ile çıkar (ör. `DATABASE_URL` `[Uri]` ile ayrıştırılamaz). Bu durum yazmadan önce, ön kontrolde olur ve sonuç dosyası oluşmaz; ekrandaki PowerShell hata metninden ayırt edilir. Runner FAIL'i ise sonuç dosyası ve `HUKUM: FAIL` satırı taşır |
| 2 | ÖLÇÜLEMEDİ, koşum hatası ya da wrapper kapısı |
| 3 | KAPANIŞ DOĞRULANAMADI → kurtarma |
| 4 | G-0 düştü; yazma yok |

**Çıktılar:**
- Sonuç dosyası: `C:\Ops\hukuk\logs\office-ak-r01\ak-live-result-<zaman>.json`. SHA-256'sı ve runId'si ekrana basılır.
- PASS değilse kurtarma komutu hazır basılır.

**Canlı koşumda yapılmayanlar:**
- restart, bayrak, migration, deploy;
- `.env`'e yazma;
- ACL değişikliği;
- gerçek tenant'a istek.

**Koşum sonrası bağımsız doğrulama** ana yürütücünündür. Adımlar:
1. Sonuç dosyası SHA'sı ile runId bağını kurmak.
2. `off-ak-<runId>` envanterini salt okuma ile §6/§7'ye eşlemek: 1 / 1 / 4 pasif / 9 / 5.
3. API ve Web PID'lerinin değişmediğini ölçmek.

---

## 13. Ana yürütücü için bağımsız inceleme listesi

1. §10 SHA'larını dosyalardan hesaplayın.
2. `ak-live.ps1` içindeki `TOOL_PINS` ve `BUILD_PINS` değerlerini §10 ile karşılaştırın.
3. §10.2 pinlerini canlı `HY_W4_RELEASE22` dist'inden salt okuma ile hesaplayın.
4. `evidence/` dosyalarının SHA'larını ve içindeki `tools` alanlarını doğrulayın.
5. `ak-live-gates.test.ps1`'i kendi geçici dizininizde koşun; beklenen sonuç 11/11.
6. Kaynak sözleşmesini (§3) RELEASE22 kaynağıyla eşleyin.
7. İsteğe bağlı olarak provayı yeniden üretin:
   - kendi disposable Postgres'inizi kurun (5441, `hukuk_office_ak_acc_test`) ve `migrate deploy` koşun;
   - `AK_DATABASE_URL=… node ak-start-api.js --dist r22` ile API'yi başlatın;
   - `AK_ENVIRONMENT=disposable` ve `AK_API_BASE_URL=http://127.0.0.1:8102/api` ile `node ak-run.js` koşun;
   - bitince `node ak-start-api.js --stop` ile durdurun.

---

## 14. Sınırlar ve açık kalanlar

- **Ö-1 ve Ö-4'ü paket doğrulayamaz;** owner GO'su taşır.
- **Canlı ölçüm kapsamı.** Canlıda üç ölçüm vardır:
  - her adımda kendi tenant'ının 8 tablosunun tam görüntüsü;
  - I-1: aktörlerimizin başka tenant'taki audit izi;
  - I-3: yabancı tenant sayı özeti.

  Canlı trafik eşzamanlı olduğu için tüm-DB sayacı canlıda kesin değildir. Tüm-DB kesin envanteri **provada** ölçüldü (A6).
- **I-3 yalnız sayı düzeyindedir.** Yabancı satırlardaki güncellemeleri görmez. Koşum sırasında gerçek bir kullanıcı avukat, kullanıcı, büro, personel, dava, müvekkil ya da banka hesabı eklerse I-3 **PASS vermez**; kabul FAIL olur. Bu yanlış-negatiftir ve güvenli yöndedir. Koşumun sakin bir saatte yapılması önerilir; I9 R02 ile aynı sınırdır.
- **Kalıcı avukat satırları.** 9 avukat satırı kapatılmış tenant'ta `isActive=true` kalır. Bu tenant'a login ve JWT erişimi yoktur. Bunları pasifleştirmek 9 audit'siz update daha demektir; owner isterse ayrı karardır.
- **Audit'siz güncelleme.** AK1A-C1'deki `PUT /lawyers/:id` güncellemesi audit üretmez. Bu, AK kapsamı dışında bir ürün gözlemidir.
- **Wrapper'ın kapı sonrası bölümü izole koşulmadı.** Bu bölüm ortam değişkenlerini atar, `node`'u çağırır ve sonucu özetler. İzole koşmak canlı `.env`'i okumayı gerektirir; ben okumadım. Çağırdığı runner provadaki runner'ın kendisidir. Canlı tarafta K-ENV'i ilk kez sınayan adım owner'ın `-PreflightOnly` adımıdır; o adım salt okumadır.
- **Prova API'si dışarı istek yaptı.** Ürün cron'u TCMB döviz kuru için bir dış istek yaptı (gözlem). Prova DB'ye yazmadı: boşta pencerede 0 tablo yazıldı.
- **Bu belge canlı PASS değildir.** Canlı kabul, owner'ın canlı GO'su ile tek koşum ve ana yürütücünün koşum sonrası bağımsız doğrulamasıyla kapanır.

---

## 15. CANLI KOŞUM KAYDI — OFFICE AK-2 + AK-1a canlı kabulü KAPANDI

Yazan: OFFICE 33 (paket yazıcısı). Bağımsız doğrulama ana yürütücünündür ve kendi belgesindedir (§15.6). Bu bölüm o doğrulamayı yeniden yazmaz; yalnız atıf yapar.

### 15.1 Yetki ve koşum

| alan | değer |
|---|---|
| Yetki | owner GO "OFFICE AK CANLI KABUL VE İ9 KANITLARININ KORUNMASI" · Ref **`OWNER-GO-OFFICE-AK-20260911-R01`**. Bu ref artık **TÜKETİLDİ**; ikinci koşum için kullanılamaz |
| Onaylı sürüm | 7 araç, giriş `ak-live.ps1` `A0C74CD9C927FC16FF24613168D77B76209465CEBB87A40B4A2F2E3234CB719C` |
| Koşum öncesi koşullar | Ref kullanılmamıştı. Başka canlı kabul koşmuyordu: CLIENT İ10'un GO'su yoktu ve "hat boş" teyidini bekliyordu. Ö-1 (İ9 kapanışı) ana yürütücü tarafından canlı DB'den salt okuma ile doğrulanmıştı. Koşum öncesi ölçümleri OFFICE 33 ve ana yürütücü ayrı ayrı yaptı |
| Koşan | owner, §12 komutuyla: önce `-PreflightOnly`, sonra tek kabul. Ön kontrol çıktısı bu kayıtta yok. Komut yapısı gereği kabul yalnız ön kontrol exit 0 verirse başlar |
| Koşum penceresi (UTC) | `2026-09-11T21:13:28.937Z` → `2026-09-11T21:13:30.379Z` |
| Hedef | API `127.0.0.1:8080` (RELEASE22, pid 46332) · DB `127.0.0.1:5432/hukuk_db` |
| runId / tenant | **`e1293381`** / `off-ak-e1293381`. **Yeniden açılmaz**: kullanıcı erişimi kapalı, kanıt korunuyor |

### 15.2 Sonuç dosyası

OFFICE 33 bu dosyaları içerikten hash'ledi ve okudu.

| dosya | bayt | SHA-256 |
|---|---:|---|
| `C:\Ops\hukuk\logs\office-ak-r01\ak-live-result-20260912-001328.json` | 10838 | `F884CB666FE72EE5804EE2BD5D9C90E63CECE4BD5B0B0B91FA7A62097166609B` |
| `C:\Ops\hukuk\logs\office-ak-r01\ak-live-state-20260912-001328.json` | 1502 | `AA7D9DE306E49B01BE1E0DA4BB99B80116CAD049314B157BF3E9415B64E2B9D2` |

Sonuç dosyasında okunanlar:
- **Hüküm:** `verdict: PASS`, **31/31** ölçüt, FAIL 0, ÖLÇÜLEMEDİ 0, `runError: null`.
- **Ortam:** `live` · `127.0.0.1:5432/hukuk_db` · API `127.0.0.1:8080` · goRef = yukarıdaki ref.
- **Araçlar:** `tools` alanı 6/6 dondurulmuş SHA ile eşit (§10.1).
- **Sır taraması:** 0.
- **Ölçütler:** AK2-N1..N6 · C1 · P1 · P2 · R1 · R2 · AK1A-R1..R4 · R0 · W1..W9 · C1 · A1 · K-1 · K-2 · I-1 · I-3. Hepsi `ok`.

### 15.3 Kapanış ve izolasyon (sonuç dosyasından)

- **Kapanış (K-1):** `verified: true`.
  - Kapanıştan önce aktif kullanıcı 4; 4'ü pasifleştirildi; aktif kalan 0.
  - Aktif dava 0.
  - Audit sayısı kapanıştan önce 5, sonra 5: `auditPreserved: true`.
  - Tebrik kapalı (`greetingDisabled: true`).
- **Dağıtılmış 4 JWT (K-2):** admin, partner, manager ve viewer, kapanıştan sonra **401**.
- **I-1:** aktörlerin başka tenant'ta audit izi **0**.
- **I-3:** 10 yabancı tenant · özet `80bd81056f010f2f` → `80bd81056f010f2f`, eşit.
  - Sayılar: user 46 · lawyer 38 · office 4 · staffMember 12 · case 33 · client 24 · officeBankAccount 1.
  - Yalnız sayı düzeyindedir (§14).

### 15.4 Canlı tenant envanteri — ana yürütücü ölçümü

Ölçüm canlı DB'de, tek salt-okunur transaction ile yapıldı (`transaction_read_only=on`, 21:17:26Z). Ana yürütücü, `tenantId` taşıyan 139 tabloyu taradı.

| tablo | satır | §6 beklenen insert |
|---|---:|---:|
| Tenant | 1 | 1 |
| Office | 1 (tebrik kapalı, `lastGreetingRunAt` null) | 1 |
| User | 4 (dördü de `isActive=false`, `tokenVersion=1`) | 4 |
| Lawyer | 9 (dokuzu da aktif; P1/P2 yeniden etkin; T `title="AK Kabul"`) | 9 |
| AuditLog | 5 | 5 |
| OfficeBankAccount · StaffMember · Case · Client | 0 | 0 |
| **toplam** | **20** | **20** |

**Audit kayıtları:**

| action | varlık ← aktör |
|---|---|
| LAWYER_CREATE | C1 ← manager |
| LAWYER_CREATE | P1 ← admin |
| LAWYER_CREATE | P2 ← partner |
| LAWYER_REACTIVATE (`privileged:true`) | P1 ← partner |
| LAWYER_REACTIVATE (`privileged:true`) | P2 ← admin |

**Güncellemeler ve süreçler:**
- Güncellemeler §6'daki 7 güncellemeyle tutarlı. 4'ü User'da (kapanış), 3'ü Lawyer'da: P1/P2 `isActive` ve T `title`.
- Ana yürütücü I-3'ü dondurulmuş `foreignFingerprint` ile yeniden hesapladı: `80bd81056f010f2f`, koşum öncesi = sonrası = ölçüm anı.
- API ve Web PID'leri değişmedi.

### 15.5 Kalıcı kanıt

**Kaynaklar yerinde kalır:** `C:\Ops\hukuk\logs\office-ak-r01\`. Silinmez, buluta taşınmaz.

**Kalıcı kopya:** `C:\Users\ulastelli\Documents\OFFICE-AK-EVIDENCE-20260912\`. Kopyayı ana yürütücü oluşturdu.

| dosya | SHA-256 |
|---|---|
| `MANIFEST-SHA256.txt` | `5A7CA03BB01725D85879D228466970828D91F0DCDE05570A071B3E4E5521504E` |
| `ak-live-result-20260912-001328.json` | `F884CB66…609B` (kaynak = kopya; OFFICE 33 doğruladı) |
| `ak-live-state-20260912-001328.json` | `AA7D9DE3…B9D2` (kaynak = kopya; OFFICE 33 doğruladı) |
| `ak-postrun-verify-e1293381.json` | `0E437E9AD49C90957D435267A50CA13AAAD9660AC22431FFEFB3AD91EDB1AC0D` (ana yürütücü) |
| `ak-postrun-readonly.js` | `181A5018A6B0260245EC2B276E4700D405A79125CD7310D93BEE805A628332A1` (ana yürütücü) |
| `ak-prerun-readonly.js` | `814A6119768F379C1E7722192724D8C865DCE2B87FD75CC605B7DBE0713F1A45` (ana yürütücü) |

### 15.6 Bağımsız doğrulama kaydı

Ana yürütücünün kaydı: `RELEASE22-R27-BAGIMSIZ-DOGRULAMA-R01.md` **Ek D** — PR #2636, main `dc86cf7c`.

Karar kaydı (decision-log) ve ürün birikim listesi (product-backlog) satırları da ana yürütücünündür.

### 15.7 Kapanan ve açık kalan

**KAPANDI.** OFFICE AK-2 + AK-1a **canlı kabulü**. GO-COMPLETE koşulunun üç parçası da sağlandı: 31/31 PASS, exit 0 ve bağımsız kapanış doğrulaması.

**Kendiliğinden kapanmayanlar:**

| kalem | durum |
|---|---|
| AK-1a eki: VIEWER onay kararı | canlıda yalnız dist işareti var |
| AK-1b / AK-1c | owner kararı |
| Ayrıcalıksız pasif kaydın yeniden etkinleştirilmesi | owner kararı açık |
| `/cases` ön kontrol yarışı | açık |
| CLF-O0-01 / FD canlı senaryoları | açık |
| `off-ak-e1293381`'deki 9 aktif avukat kaydı | pasifleştirme **owner kararı**; bu paketin dışında (§14) |
| Diğer OFFICE ve CLIENT açık kalemleri | açık |

**CLIENT İ10** bu koşumun kapanışını bekliyordu. Başlaması ana yürütücünün "hat boş" teyidine ve kendi GO'suna bağlıdır.

# RELEASE21 — CLIENT İ6 UZLAŞTIRMA VE İ7 DEVİR KAYDI

```text
BELGE      : RELEASE21-CLIENT-I6-HANDOFF-R01
ÜRETEN     : CLIENT hattı (owner GO 2026-09-08 — İ6)
DEVRALAN   : Office/C33 — RELEASE21 adayının TEK ÜRETİCİSİ
DURUM      : İ6 KARŞILANDI (mevcut aday ile) / MÜKERRER PAKET ÜRETİLMEDİ
KAPSAM DIŞI: İ7 cutover · production DB yazımı · canlı kabul alanı kurulumu · gerçek gönderim
```

> Bu belge **uzlaştırma ve devir kaydıdır**. Aday paket kimliği, geçerli mühür veya yayın kanıtı
> **ÜRETMEZ** — bunları Office/C33'ün ürettiği `RELEASE21-CANDIDATE-RECEIPT.json` taşır. Buradaki
> tüm değerler o makbuzdan ve depodan **okunarak** alınmıştır; eski rapordan tahmin edilmemiştir.

---

## 1. Neden yeni paket üretilmedi

`RELEASE20-HANDOFF-TO-OFFICE-R01` (owner GO 2026-09-07, md. 1) CLIENT tarafında paket üretimini
**durdurmuş ve yeniden başlatılmayacağını** kaydetmiştir. Gerekçe orada kanıtıyla duruyor: iki hat
aynı release dizinlerine yazınca zincir 8/11'e düşmüş, iki bağımsız doğrulayıcı `GEÇERSİZ` vermişti.

Bu turda ölçülen durum aynı ihtiyacın **zaten karşılandığını** gösteriyor:

| Soru | Ölçülen |
|---|---|
| Office/C33'ün aktif adayı var mı? | **Var** — `HY_C33_RELEASE21_CANDIDATE`, mühürlenme 2026-09-08 18:24 |
| Aday üretilmiş ve doğrulanmış mı? | **Evet** — `status: CANDIDATE_BUILT_AND_VERIFIED / CUTOVER_NOT_AUTHORIZED`, `gatesAllGreen: true` |
| İ6'nın istediği CLIENT değişikliği içinde mi? | **Evet** — #2552 (`ad484c49`) adayın atasıdır |
| Adaydan sonra main'e giren ürün değişikliği var mı? | **YOK** — 0 ürün dosyası (aşağıda) |
| Üretim süreci koşuyor mu? | **Hayır** — RELEASE21 yollarını tutan süreç 0 |

**Sonuç:** İ6 için ikinci bir paket üretmek mükerrer olurdu ve kayıtlı çakışma riskini geri
getirirdi. CLIENT hattı aday üretmedi; mevcut adayı **doğruladı ve devretti**.

---

## 2. Aday kimliği (Office/C33 makbuzundan okundu)

| Alan | Değer |
|---|---|
| Sürüm adı | `HY_W4_RELEASE21` |
| Release kökü | `C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE21` |
| **Aday kaynak SHA** | `2187a78b1621f168605920cdffccb17381dc171a` (#2570) |
| Kaynak ağacı durumu | `dirty 0` — çalışma ağacı SHA ile birebir |
| **Web BUILD_ID** | `g91HUaBesekB-R2rRawQj` (canlı: `LW4jlJUOMHrvVEqakKB3i`) |
| API derlemesi | `dist` mevcut ve **#2570'in derlenmiş uçlarını içeriyor** (build adaya güncel) |
| `candidateDigest` | `569DDCE4850F2E07D9A1DA8BBE894D825A498E83946D74955F21D0E19F0CE88F` |
| `manifestDigest` | `D6082E199ACA34964037B44EFD48EAB80E280EF7668B74CC605431E024B41D61` |
| `ledgerHash` | `CF2D8A836EA0B2B8F14B8AEF129F67ACF5693E62AD4AE3F9E3E83DDB2D3FF59A` |
| `packageDigest` / dosya | `851C07DFCD2C6FBBA3A705840A401D4E8693A8F75BA62EE964C8763200B84A22` / **51** |
| Katmanlar | SOURCE 7 026 · BUILD 4 426 · DEPS 76 680 |
| `productionAuthority` | **NONE** |

> **Not:** daha önceki bir kayıtta aday `d2223e78` olarak geçiyordu; **bu değer bayattır**.
> Diskteki worktree HEAD'i ve makbuz `2187a78b`'yi gösterir.

---

## 3. Canlı ↔ aday gerçek ürün farkı

**Canlı kaynak:** `08ce8e2559b4d1d67fcee245413de510209507f3` (RELEASE20, #2536) — süreçten
doğrulandı: API pid 61532 ve Web pid 47868 `HY_W4_RELEASE20` altından çalışıyor.

`08ce8e25..2187a78b` aralığında **19 ürün dosyası** (migration dosyası bu 19'un içindedir).
Test/spec ve `ci-manifests` dosyaları ürün davranışı değildir ve ayrı tutulmuştur (**18 dosya**).

| Hat | Commit | Ürün dosyaları |
|---|---|---|
| **CLIENT** | **#2552** `ad484c49` — kimlik checksum reddi üç yolda stabil `reasonCode` | `client/client-identity-checksum.util.ts` |
| OFFICE | #2553 `ddcd4aba` — ham Office satırı modül sınırını geçmez | `office/office.service.ts` · `client-approval.service.ts` · `client-intake-link.service.ts` · `client-statement.service.ts` · `client-statement-monthly-delivery.service.ts` · `expense-request.service.ts` |
| OFFICE | #2555 `fa1e3bb2` — avukat create yazma sınırı | `lawyer.controller.ts` · `lawyer.service.ts` · `dto/create-lawyer.dto.ts` · `schema.prisma` |
| OFFICE | #2570 `2187a78b` — A-07 kontrollü yürütme | `office-approval/*` (4) · `case-status/*` (3) · `schema.prisma` · **migration** |

> **Dosya yolu sahip hattı belirlemez.** `client-*` modüllerindeki beş dosya #2553 (OFFICE)
> kapsamında değişmiştir. **CLIENT hattının ürün değişikliği tek commit ve tek dosyadır (#2552)** —
> R02'nin İ6 içeriği tam olarak budur.

### 3.1 Adaydan sonra main'e giren değişiklikler — **ürün YOK**

`2187a78b..df1ff252` = 7 commit, **0 ürün dosyası**. Tamamı `project/docs/governance/` altında:
İ3 koşucuları (**8 dosya**), F04 kabul betikleri (**7 dosya**), Office yönetişim kayıtları.
**Kabul betikleri ürün değişikliği sayılmaz** ve pakete girmez. Dolayısıyla aday, main'deki
CLIENT ürün değişikliklerinin **tamamını** taşır; paketin tazelenmesi gerekmez.

---

## 4. Migration ve yapılandırma işlemleri (İ7 girdisi)

**Tek migration:** `20260908171230_office_a07_approval_execution_binding` (#2570, OFFICE).
Canlı kaynak ağacında (`08ce8e25`) **yoktur** → dağıtılmamıştır.

```sql
SET LOCAL lock_timeout = '3s';  SET LOCAL statement_timeout = '30s';
ALTER TABLE "CaseStatusHistory" ADD COLUMN "approvalRequestId" TEXT;
ALTER TABLE "CaseStatusHistory" ADD COLUMN "approvalAttempt" INTEGER;
CREATE INDEX "CaseStatusHistory_approvalRequestId_approvalAttempt_idx" ...
```

- **Eklemelidir**: iki **nullable** skaler kolon + bir düz indeks. Modüllerarası FK kurulmaz.
- **Atomiktir**: düz `CREATE INDEX` bilinçli seçilmiştir; `CONCURRENTLY` transaction içinde
  koşamayacağı için kısmi/INVALID indeks bırakma riski taşır. Başarısızlık = tam geri alma.
- **Kilit riski sınırlandırılmıştır**: `ACCESS EXCLUSIVE` kilidi kuyruğa girdiği anda okuma dahil
  her şeyi bloke eder; `lock_timeout=3s` ile canlı kuyruğa sokulmaz, hızlı düşer.
- **Geri dönüş**: Prisma'da down-migration yoktur. RELEASE20 koduna dönüldüğünde bu kolonlar
  şemada kalır; **nullable ve referanssız** oldukları için RELEASE20 davranışını etkilemez.
  Bu bir değerlendirmedir; cutover anında `prisma migrate status` ile teyit edilmelidir
  (`migrate deploy` tek başına geçmiş bütünlüğünü doğrulamaz).

**Yapılandırma:** `evidence/env-key-requirements.json` (`valuesRead: false` — değer okunmadı).
Production boot için zorunlu 6 anahtarın (`HUKUK_DATA_ROOT`, `HUKUK_OCR_MODELS_ROOT`,
`DATABASE_URL`, `JWT_SECRET`, `NODE_ENV`, `PORT`) tamamı canlı `.env`'de **mevcut**. İki opsiyonel
fail-closed anahtar (`JWT_SMOKE_SECRET`, `SMOKE_PROVISION_PUBLIC_KEY`) de mevcut.

---

## 5. Doğrulama sonuçları ve karşılanmayan ön koşullar

**Kapılar: 10/10 exit 0** — ADIM1-PRODUCER · ADIM1-LEDGER · ADIM1-VALIDATOR-NODE ·
ADIM1-VALIDATOR-PS · ADIM2-EXTERNAL-STORAGE · ADIM2B-WRITE-SURFACE · ADIM4-DOTENV ·
ENV-KEY-REQUIREMENTS · ADIM3-BINDING-PROFILE · ADIM3-BINDING.

**Kırmızı çizgiler (hepsi 0):** `productionMutation` · `secretsConsumed` · `taskProvisioning` ·
`envelopeWindowOrNonceIssued` · `priorPackagesModified` · `repoOrPrChanges` · `release21Deployed`.

**Karşılanmayan 3 + ölçülemeyen 1 ön koşul — tamamı cutover (İ7) fazına aittir:**

| # | Gereksinim | Durum |
|---|---|---|
| PRE-01 | RELEASE21 içinde `cwd/.env` bulunmalı (ConfigModule `envFilePath` VERMEZ) | **Karşılanmadı** — dosya bu turda da yok (varlık kontrolü; içerik okunmadı) |
| PRE-07 | RELEASE21 kökü runtime kimliği için salt-okunur olmalı | **Karşılanmadı** — kök DACL `Authenticated Users` için Modify taşıyor; sertleştirme cutover H-fazında |
| PRE-08 | Başlatıcı RELEASE21'e bağlanmalı | **Karşılanmadı** — canlı bağlantı hâlâ `HY_W4_RELEASE20`; **yapı gereği ancak cutover'da karşılanır** |
| PRE-06 | Writer görevi kayıtlı olmalı | **ÖLÇÜLEMEDİ** — limited token görevleri listeleyemiyor; *yok sayılmaz, karşılandı sayılmaz* |

Bunlar **aday üretim kusuru değildir**; İ6'nın ölçütü *"aday paket üretildi ve doğrulandı"*dır,
*"cutover ön koşulları karşılandı"* değil. Sonuncusu İ7'nin ölçütüdür.

---

## 6. İ7 için somut uygulama ve geri dönüş planı (öneri — YETKİ İSTER)

**Geri dönüş hedefi: RELEASE20 / `08ce8e25`** — makbuzda `supersedes` altında sabitlenmiş ve
canlıda **çalışır durumda korunur** (cutover sonrası deploy edilmez).

| Faz | İşlem | Geri dönüş |
|---|---|---|
| H-1 | PRE-01: RELEASE21 `apps/api/.env` yerleştirilir (canlı anahtar kümesiyle; değer kopyalama owner yordamına göre) | dosya kaldırılır; canlı etkilenmez |
| H-2 | PRE-07: RELEASE21 kökü runtime kimliği için salt-okunur yapılır | ACL geri alınır |
| H-3 | PRE-06: writer görev kaydı **elevated** oturumda ölçülür (ölçülemeyen "karşılandı" sayılmaz) | — |
| H-4 | Migration `20260908171230_...` uygulanır; `migrate status` ile teyit | kolonlar nullable kalır; RELEASE20 etkilenmez |
| H-5 | PRE-08: başlatıcı RELEASE21'e bağlanır, servisler döner | başlatıcı RELEASE20'ye geri bağlanır (kod tarafı tam geri dönüş) |
| H-6 | Cutover doğrulaması + rollback hedefi kaydı → **İ7 ölçütü** | — |

**Kesinti penceresi, nonce/zarf, owner komutu ve ratifikasyon bu belgede ÜRETİLMEZ** — bunlar
Office/C33'ün cutover paketine ve owner onayına aittir.

---

## 7. Sonraki kabul çalışmasına bağlanan düzenek kimlikleri

Kabul düzenekleri **pakete girmez**; kabul koşumlarında bu kimlikler kullanılır:

| İş | Paket | Güncel kimlik (main) |
|---|---|---|
| İ1a | `client-acceptance-harness-r01/` | `d2223e78` (#2558) |
| İ2 | `client-acceptance-criteria-i2-r01/` | `3bbdbcd8` (#2565) |
| İ3 | `client-acceptance-runners-i3-r01/` | `90e558d8` (#2576) |
| İ5b | `f04-live-acceptance-r01/` | `df1ff252` (#2577) |

İ5b ile gelen `f04-09-close-access.js` (yalnız `runId`, tekrarı güvenli) **İ8'in erişim
sonlandırma provasının** aracıdır.

---

## 8. Devirde tamamlanan iş başlıkları (R02 lafzı)

- **İ6 — CLIENT teslim paketi üretimi.** Ölçüt: *"Aday paket üretildi ve doğrulandı (mevcut
  release prosedürü)"*. Öncül: *"Yok (kod hazır; İ1a/İ1b'ye bağlı DEĞİL)"*. Sahip: **Office/C33**.
- **İ7 — Canlı geçiş.** Ölçüt: *"Cutover uygulandı ve doğrulandı; rollback hedefi kayıtlı"*.
  Öncül: **İ6 + owner onayı**. Sahip: **Office/C33**.
- **İ8 — Sentetik alanın canlı sürümde doğrulanması + erişim sonlandırma provası.** Ölçüt:
  *"Alan canlıda kurulu; yetkisiz denemelerde yazma 0; erişim kapatma çalışıyor"*.
  **Öncül: İ1b onayı** (ayrı owner onayı; bu belgeyle verilmiş sayılmaz).
- **İ10 — H3 vekâlet kabulü.** Kalemler: **A-1** VIEWER 403 · **A-2** elevated olmayan USER 403 ·
  **A-3** yetkili 201 · **A-4** legacy upload 403 · **`K9` yenileme** (POA'sız capability etkisiz).
  Ölçüt: *"Beş gözlem PASS; yetkisiz denemelerde dosya/DB yazımı 0"*. Öncül: H3.

---

## 9. Verilmiş sayılmayan kararlar

- **İ4** — H7 portal kapsam kararı. **VERİLMEDİ.** İ16'yı açan tek kalemdir; İ6/İ7'yi bloke etmez.
- **İ5** — F04 kanıt yöntemi kararı ((a) canlı koşum / (b) canlı SHA'da koşulan test + ihlal izi
  yokluğu). **VERİLMEDİ.** İ5a yalnız (a) seçilir **ve** kilit tutan bir senaryo canlıda kurulursa
  devreye girer; İ5a bir *"canlı koşum"* değil, **süre sınırı onarımıdır**.
- **İ1b** — canlı sentetik tenant tahsisi. **AYRI OWNER ONAYI ŞARTTIR**; İ8'in öncülüdür.

---

## 10. Bu belgenin üretmediği şeyler

Canlı DB yazımı · deploy/cutover · canlı kabul alanı kurulumu · gerçek alıcıya gönderim ·
yeni mühür/makbuz · Office/C33 paketinde değişiklik · production yetkisi. Office/C33'ün aday
çalışma alanına **yazılmamıştır**; tüm okumalar salt-okumadır.

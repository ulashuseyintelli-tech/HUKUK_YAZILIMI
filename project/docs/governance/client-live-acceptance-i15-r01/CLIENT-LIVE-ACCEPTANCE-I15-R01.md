# CLIENT İ15 — H8 F04 KABULÜ: İ5(b) UYGULAMASI + KABUL-5 CANLI PAKETİ (R01)

**Kanonik bağ:** R02 §3.3 İ15 ve owner kararı İ5 = (b) (#2711 @ `3d927a55`).
- **İ15'in kapsamı:** "H8 F04 kabulü: KABUL-5 canlı koşum (iki sentetik tenant; çapraz post reddi + hedefte iz 0) + İ5 kararının uygulanması".
- **Kapanış koşulu:** "KABUL-5 PASS; kalan yedi için seçilen kanıt yöntemi kayıtlı ve uygulanmış".
- **Sınır:** KABUL-A2 yeniden koşulmaz; #2549 kabulü korunur. İ5a açılmaz.

Bu belgede üç kanıt **ayrı** tutulur. Hiçbiri "canlı yarış testi PASS" olarak sunulmaz.

| # | Kanıt | Durum |
|---|---|---|
| **1** | Yedi senaryonun testi. Canlı R24'ün doğrulanmış kaynak SHA'sında, ayrı PostgreSQL'de koşuldu. | **TAMAM** · 10/10 |
| **2** | Canlıda salt-okuma tutarlılık taraması | **TAMAM** · ihlal izi yok (atıflı 4 bulgu, §2.3) |
| **3** | KABUL-5 canlı koşum | **HAZIR PAKET.** Ayrı owner GO ister (§3). |

---

## 1. İ5(b) — TEST KANITI (canlı R24 kaynak SHA'sında)

| Öğe | Değer |
|---|---|
| Kaynak | `006c4dd2928f6c719669cc17b3b61f6ce3e2bc89`. R24 kaydında (#2704 @ `fe55fb41`) bu kaynaktan canlı dist `87712E0E…5453` üretildiği yazılıdır. Eski RELEASE20 (`08ce8e25`) PASS'ı **kullanılmadı**. |
| Ortam | detached worktree `HY_WT_I15_R24` · **gerçek** `pnpm install --frozen-lockfile` (node_modules junction DEĞİL, reparse=False) · `prisma generate` |
| DB | ayrı disposable PostgreSQL `postgres:16-alpine` · `127.0.0.1:5443/hukuk_i15_f04_test` · 130 migration `006c4dd2`'nin kendi CLI'siyle uygulandı · 210 tablo |
| Spec | `apps/api/src/modules/client-settlement/__tests__/f04-posting-reversal-race.db-gated.integration.spec.ts` · sha256 `28E81DCB0F616B1E50C3B73E5E7F0A5FA6A4C9DA7A80F3F0D39849CED0EC81E0` |
| Komut | `TEST_DATABASE_URL=<disposable> CI=true pnpm exec jest --runInBand` (CI=true ⇒ DB yoksa spec **atlanamaz**, hata verir) |
| Sonuç | **10/10 PASS**, jest rc=0. Yedi senaryo PASS: KABUL-1 · 2 · 3 · 4 · A · B · D. Aynı spec'teki KABUL-A2 · C · 5 de PASS. |

**Kanıt sınırı (lafız korunur):**
- Spec sıralamayı `jest.spyOn` bariyeriyle **belirlenimci** kurar. **Serbest yarış üretmez.**
- KABUL-A ve KABUL-D gerçek kilit beklemesi ölçer.
- KABUL-1, 2, 3, 4 ve B sıralı ya da hata enjeksiyonludur.
- Test TS kaynağını koşar. Dist'in bu kaynaktan üretildiğinin dayanağı R24 kaydıdır.

## 2. İ5(b) — CANLI SALT-OKUMA TUTARLILIK TARAMASI

**Betik:** `scripts/i15-f04-consistency-scan.js`.
- `SET TRANSACTION READ ONLY` içinde çalışır ve yalnız sayım döner. PII, tutar ya da kimlik yazdırmaz.
- Sorgu hatası ÖLÇÜLEMEYEN sayılır, 0 olarak yorumlanmaz.

### 2.1 Tarama kör değil — disposable doğrulama
F04 spec'inin bıraktığı disposable veride (12 dağıtım) tarama **ihlal 0** verdi. Ardından kasıtlı bozma denendi:
- POSTED dağıtım stornosuz REVERSED yapıldı → `SCAN-2/4=2` yakalandı.
- Journal satırı dengesizleştirildi → `SCAN-B1=1` yakalandı.
- İkisi de geri alındı → tarama yeniden temiz çıktı.

### 2.2 Canlı sonuç (2026-09-18T20:26Z · tenant'lar arası tüm veri · 16 dağıtım)

| Denetim | Senaryo | İhlal |
|---|---|---|
| SCAN-A: iptal edilmiş tahsilatta terslenmemiş posted journal | KABUL-A | 0 |
| SCAN-1: iptalden sonra post edilen dağıtım | KABUL-1 | 0 |
| SCAN-2/4: REVERSED/CANCELLED dağıtımda terslenmemiş posted journal | KABUL-2 · 4 | 0 |
| SCAN-3a/3b: REVERSAL > APPLY · çift REVERSAL | KABUL-3 | 0 · 0 |
| SCAN-B1/B2: dengesiz journal · post edilmemiş dağıtımda öksüz iz | KABUL-B | 0 · 0 |
| SCAN-B3: POSTED dağıtımda posted journal'ı olmayan satır | KABUL-B | **4 (atıflı, §2.3)** |
| SCAN-D1/D2: satır başına çift ledger · çift posted journal | KABUL-D | 0 · 0 |

`pg_stat_database.deadlocks` = 0. Bu kümülatif bir sayaçtır, kaynağa atfedilemez; yalnız bilgi amaçlıdır.

### 2.3 SCAN-B3 bulgularının atfı (salt-okuma)
Bu bulgular KABUL-B'nin tanımladığı **transaction içi yarım yazım** değildir:
- **3 satır — GERÇEK tenant, `postedAt` 2026-06-29 (journal-öncesi eski kayıt; owner kararı: geriye dönük veri YAZILMAZ).** Canlıdaki ilk `COLLECTION_DISPOSITION_LINE` journal'ı **2026-08-07** tarihlidir. Bu satırlar journal mekanizmasından **önce** post edilmiş eski kayıtlardır.
  - **Ayrı bir veri bütünlüğü gözlemi olarak kaydedilir.** Kapsamı genişletmez (R02 §9); geriye dönük doldurma yapılıp yapılmayacağı owner kararıdır. **Hiçbir yazma yapılmadı.**
- **1 satır — İ12 SENTETİK FIXTURE (ayrı sınıf; gerçek veri DEĞİL).** Salt-okuma ölçüm (2026-09-19): tenant **`ah-92d04ef3`** = İ12 canlı kabulünün kendi hedef tenant'ı (oluşturulma 2026-09-18T19:21, İ12 S1 anı); tahsilat `idempotencyKey` **`i12live-col-…`** kurulum imzasını taşır; dağıtım `i12-live-setup.js` tarafından G7'nin "önceki ay POSTED aktivite" ön koşulu için **doğrudan DB'ye** yazıldı — `postedAt` tasarım gereği önceki aya (2026-08-15) geri alınmıştır, `postedById` boş, satır tipi `CLIENT_PAYABLE`. Ürün posting yolu kullanılmadığı için journal beklenmez; aktif kullanıcı **0**. Bu satır F04 tutarlılık değerlendirmesinin **dışında** sınıflandırılır.

**Kanıt sınırı (lafız korunur):** "İhlal izi bulunmadı" sonucu **canlı eşzamanlılık ispatı DEĞİLDİR.** Tarama yalnız kalıcı sonuç durumunun tutarlı olduğunu gösterir. Yarışın canlıda hiç yaşanmamış olmasından ayırt edilemez.

**KABUL-C dolaylı kanıttır:**
- Spec PostgreSQL'in kilit semantiğini ham SQL ile ölçer, posting servisini ölçmez.
- Canlıda kilit modu davranışı **ölçülmez**. Üretim kodundaki mod `FOR NO KEY UPDATE`'tir (`disposition-posting.service.ts`).
- A2 kabulü (#2549) bu davranışı yalnız dolaylı olarak kapsar.

Kanıt dizini `Documents\CLIENT-EVIDENCE-20260911\i15-f04-i5b-20260918T202635Z\` altındadır. İçeriği: canlı tarama JSON'u, B3 atfı ve spec koşum günlüğü.

## 3. KABUL-5 — CANLI KOŞUM PAKETİ (ayrı owner GO)

**Betik:** `scripts/i15-kabul5-run.js`. Mevcut F04 paketini kullanır:
- `f04-01-setup.js`: İ5b onarımlı kurulum.
- `f04-09-close-access.js`: runId ile nihai kapanış.

**Sıkılaştırma:** `f04-05` çapraz tenant reddini `status >= 400` ile kabul ediyordu; bu 500'ü de PASS sayardı. Burada **yalnız 403 ya da 404** kabul edilir; İ3 dersi.

**Koşum sırası:**
1. İki `f04-acc-<runId>` tenant kurulur, her biri 11 satır.
2. A aktörüyle B'nin dağıtımına `POST /collection-dispositions/:id/post` denenir.
3. Beklenen: 403 ya da 404. B'de durum, postedAt, journal, APPLY, ledger ve audit **değişmez**.
4. `finally` her iki tenant için kapanış yapar: `f04-09` (kullanıcı pasif + tokenVersion++) ve Case CLOSED.
5. Kapanış doğrulanır: login 401, eski token 401.
6. Sentetik olmayan tenant'ların client/user/dağılım-durum parmak izinin değişmediği doğrulanır.

**Posting yapılmaz.** Hiçbir dağıtım post edilmez, bu yüzden finansal yazma yoktur.

**Canlı yazma envanteri:**
- 2 × 11 kurulum satırı (Tenant · User ADMIN · Lawyer PARTNER · Client · Case · CaseClient · Collection 100 TRY CONFIRMED · ExpenseRequest · OfficeApprovalRequest APPROVED · CollectionDisposition DISTRIBUTION_APPROVED · 1 satır).
- Kapanış: iki tenant'ta User `isActive`/`tokenVersion` ve Case CLOSED.
- DELETE yok. Geri alınamaz kayıt yok (timeline yazılmaz).

**Disposable prova** (canlı R24 dist, `:8113`, API yalnız disposable DB'ye bağlı):

| Senaryo | Sonuç |
|---|---|
| **N** normal akış | **5/5 PASS**: K5-0 ön koşul · **K5-1 HTTP 404** "Dağıtım kaydı bulunamadı" · K5-2 B'de iz 0 (journal/apps/ledger/audit 0→0) · K5-CLOSE login 401, me 401 · K5-ISO eşit |
| NC1a–c kapılar | onay yok → 3 · İ14 biçimli GO ref → 3 · API beyanı farklı → 4 · tenant sayısı değişmedi (27→27) |
| NC2 kurulumdan sonra çöküş (API'ye ulaşılamaz) | çıkış 1 · `finally` iki tenant'ı da kapattı (aktif kullanıcı 0, ACTIVE case 0) |

**Paket digest:** `E80EBD3C90849E1169D57E7F10A140FD341DEE09D785DE799FD20A8CDFF3C907`

| Dosya | sha256 |
|---|---|
| `i15-kabul5-run.js` | `85B9A691…2DBC` |
| `f04-lib.js` | `1D354295…5CA8` |
| `f04-01-setup.js` | `AB3FF27C…C25A` |
| `f04-09-close-access.js` | `4148FFAB…D712` |

**Owner eylemi:**
- Yeni GO ref: `OWNER-GO-CLIENT-I15-YYYYMMDD-RNN`.
- `scripts/i15-owner-live-block.ps1` bloğunu **normal** PowerShell'de çalıştırın; yönetici gerekmez.
- Blok şu kapıları doğrular: main, paket digest, dist `1524EDC1…4D4E` (R25B), tek API, açık pencere yok, DB kimliği. Ardından GO ref yerel girilir, koşum yapılır, GO ref tüketimi sha256 olarak kaydedilir ve manifest yazılır.

**İ15 KAPANIŞ ÖLÇÜTÜ:**
- KABUL-5 canlı koşumu **5/5 PASS**: FAIL 0, ÖLÇÜLEMEYEN 0.
- CLIENT bağımsız doğrulama PASS.
- §1 ve §2 kayıtlı (İ5(b) uygulandı).
- Kayıt PR'ı → CI → merge → post-merge CI SUCCESS.

**Hizmet kabulü (H8) owner kabulü olmadan değişmez.**

## R25 bağı (2026-09-19, R02) — canlı dist pini R25B'ye değişti

Owner kararıyla R25 yalnız onaylı K-1 (#2720) ve PSUS (#2721) portal düzeltmeleriyle sınırlandı. #2716'nın 3 replay adapter dosyası bu yayına **dahil değil**. Owner bloğunun canlı dist kapısı **R25B** artefaktına bağlandı: `1524EDC15C636B39507DD9520206E3065E6A353A531D82D4362DFE115FC04D4E` (3867 dosya).

R25B **birleşik bir artefakttır**: tabanı canlı R24 dist'i (`87712E0E…5453`), üzerine yalnız 7 portal dosyası `ebbe1ae8` derlemesinden kopyalandı. Aynı digest, `ebbe1ae8` kaynağında yalnız adapter kaynağı `006c4dd2` hâline döndürülerek alınan bağımsız bir derlemeyle bit bit yeniden üretildi. Paket digest'i değişmedi. Blok R24 dist'inde ve 10 dosyalı R25 adayında (`EB3D854F…71FC`) **DURUR**; bu kasıtlıdır, fail-closed davranış.

- **Yürütme sırası:** R25B yayını (ayrı owner onayı; yükseltilmiş pencere) → İ13 → İ14 → İ15 → İ16. Her blok bir öncekinin kapanışından sonra ve kendi GO ref'iyle koşulur.
- **R25B disposable regresyonu (aday dist `dist-r25b`, API `:8113`, yalnız disposable DB):** İ15 KABUL-5 5/5 PASS. Bunlar canlı kabul değildir. 10 dosyalı R25 adayının sonuçları R25B'nin kanıtı SAYILMAZ; bu koşum yenidir.
- **R24 → R25B farkı:** 7 portal dosyası. Eklenen 0, silinen 0, migration 0.
- **Düzeltme notu (dış bağlantı):** Disposable provadaki API, TCMB kur servisine (`185.98.252.10:443`, ExchangeRateService, salt okuma) dışa bağlandı. Bu bir gönderim değildir. Önceki "API'nin tek uzak bağlantısı disposable DB" ölçümü yalnız o anın görüntüsüdür, sürekli bir garanti değildir.

**Canlı yayın ve canlı koşum AYRI owner onayı ister; bu bölüm onları başlatmaz.**

## 4. CANLI KOŞUM SONUCU — İ15 KAPANDI (2026-09-20)

Owner İ15 canlı kabul GO'sunu verdi ve bloğu kendisi koşturdu. Blok ayrı bir
`powershell.exe -NoProfile -ExecutionPolicy Bypass -File` sürecinde çalıştı; kalıcı execution policy değişikliği yapılmadı.
GO ref yerel kaldı. Owner çıktısı: **RUNID `1b83637a` · koşum çıkışı 0**. Kanıt dizini:
`C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-20260911\i15-live-1b83637a-20260920-184902`.

**Bağlam (`owner-block.json`):**

| Alan | Değer |
|---|---|
| Main | `f19bd398f15e7c1e64f8bd3280c543abd644c9fa` |
| Paket | `E80EBD3C…C907` |
| Canlı dist | `1524EDC1…4D4E` (R25B) |
| API pid | 33248 |
| Başlangıç | 2026-09-20T15:49:02Z |

**Koşum sonucu (`i15-kabul5-evidence.json`): 5/5 PASS · FAIL 0 · ÖLÇÜLEMEYEN 0 · `environment=live`.**
İki sentetik tenant kuruldu: A `f04-acc-da1a0713`, B `f04-acc-78f68583`.

| Ölçüt | Gözlem |
|---|---|
| K5-0 | B dağıtımı ön koşulda post edilmemiş: `DISTRIBUTION_APPROVED`, `postedAt` yok, journal/apps/ledger 0 |
| K5-1 | A token'ı ile B dağıtımına post denemesi **HTTP 404** (`Dağıtım kaydı bulunamadı`). 5xx, 2xx ve başka 4xx PASS sayılmazdı |
| K5-2 | B'de finansal ve audit iz oluşmadı: durum aynı, `postedAt` yok, journal 0→0, apps 0→0, ledger 0→0, audit 0→0 |
| K5-CLOSE | A ve B kullanıcıları pasif, Case CLOSED, giriş 401, eski token 401. Finansal ve audit kanıt satırları korundu |
| K5-ISO | Sentetik olmayan tenant'ların parmak izi `0a141b64440f950d` önce ve sonra aynı |

**Kapsam sınırı — bu bir canlı yarış testi DEĞİLDİR.** Koşum, A aktörünün B'nin dağıtımına post edememesini ve iz
bırakmamasını ölçer. Eşzamanlı çift post yarışı canlıda **koşulmadı**. İ5(b) kapsamındaki yarış kanıtı §1'deki **test**
kanıtıdır; §2'deki canlı tarama ise **salt-okuma tutarlılık taramasıdır**. Bu ikisi ayrı kayıtlardır ve hiçbiri canlı yarış
testi PASS'ı olarak sunulmaz.

**CLIENT bağımsız kapanış doğrulaması: PASS (7/7).** Betik `i15-closure-verify.js`, sha256
`46D96861ABA8EC1F3B68150008284411AF6ED6EE66918BE96B51143ECF63B84E`. Koşum betiklerini kullanmaz; ayrı süreçte ve `hukuk_db`
üzerinde READ ONLY transaction içinde çalışır. Çıktı `i15-closure-verify-1b83637a.json`, sha256
`DC777F21C4A3000A07DA85A44B83CC2DF6C2F70F21EB1C5F735B9AFD45CDC420`.

| Denetim | Sonuç |
|---|---|
| V1 kanıt | 5 zorunlu satırın hepsi PASS · summary 5/0/0 · `environment=live` · crossPost 404 |
| V2 manifest | 6 satır eşit · manifest dışı dosya 0 (`SHA256-MANIFEST.txt` `06039270…D297C`) |
| V3 erişim — A `f04-acc-da1a0713` | aktif/toplam kullanıcı 0/1 · ACTIVE case 0 · aktif portal kullanıcısı 0 |
| V3 erişim — B `f04-acc-78f68583` | aktif/toplam kullanıcı 0/1 · ACTIVE case 0 · aktif portal kullanıcısı 0 |
| V4 B dağıtımı (canlı DB'den bağımsız ölçüm) | `DISTRIBUTION_APPROVED` · `postedAt` YOK · journal 0 · apply 0 · ledger 0 |
| V5 GO ref | yalnız sha256 (`literalWritten=false`) · literal içeren dosya 0 · parola saklanmadı |
| V6 sızıntı taraması | koşum penceresinde sentetik olmayan tenant'larda post edilen dağıtım 0 · yeni tenant 0 · yeni müvekkil 0 |

Doğrulayıcının ret yolu ayrıca sınandı: kanıt dizinine GO ref literali eklenince V5 FAIL, V2 UNMEASURED verdi.

**Kanıt dosyaları (sha256):**

| Dosya | sha256 |
|---|---|
| `i15-kabul5-evidence.json` | `DF1DD00D3924B5E78285F3364225DA6A0AC8A9E55EDD2EA60BB4D1049BC93E8E` |
| `f04-state-da1a0713.json` | `58B076809BD5EF07735F2116AC5BA8E25B9BCBD251D9169FEA2213C313D55D23` |
| `f04-state-78f68583.json` | `F5CB3F5CCD81F2415F462694A1741F9AA1DC7F0FEEC46B899273A686D777F46D` |
| `i15-run.log` | `46910AE3ABBC4F950666C9411D1FEA804F57A7EAECE9EB15920FA58BFEF308B1` |
| `goref-consumed.json` | `7EF2BA16C5B137DC36A9CC50AE3C940DDF90FA52B6E1B193E040C2786FB8E369` |
| `owner-block.json` | `D972A05F946605CBA3E04D070C213DBEAECDDFD9D17B37583290E4A349905797` |

**Eski kayıtların sınıflandırması korunur.** §2'deki üç gerçek eski `COLLECTION_DISPOSITION_LINE` kaydı yalnız okundu;
hiçbirine geriye dönük veri yazılmadı. Dördüncü kayıt İ12'nin sentetik fixture'ıdır (`ah-92d04ef3`, `i12live-col-`) ve ayrı
sınıfta kalır.

**Canlı ile main arasındaki bilinçli farklar (kayıt).** Canlı dist R25B'dir. Main'de olup canlıda olmayanlar: #2716 replay
adapter dosyaları ve #2730 trust-proxy değişikliği (`apps/api/src/main.ts`). Bunların canlıya alınması ayrı bir aday ve ayrı
bir karar gerektirir.

**Pencere.** Dört yürütücü açık teyit verdi. Docker taşıma kesintisi koşumdan önce kapanmıştı; kesinti sonrası canlı durum
salt-okuma olarak ölçüldü (20/20 PASS): dist `1524EDC1…`, `.env` ve başlatıcı pinleri, görev eylemi, migration tabanı, tek
dinleyici, DB kimliği `hukuk_db`, uçlar 401, web 200.

**Sonuç: İ15 KAPANDI.** Sayaç **17/18**. Hizmet kabulü (H8 dahil) owner kabulü olmadan değişmez: **0/8**. Kanıt satırları
silinmez; sentetik tenant'lar kapalı kalır.

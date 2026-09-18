# İ12 — H6 GÖNDERİM KABUL YENİLEMESİ · HAZIRLIK PAKETİ (R01)

BELGE   : CLIENT-LIVE-ACCEPTANCE-I12-R01
DURUM   : **HAZIRLIK — CANLI KABUL BAŞLAMADI.** Bu belge owner onayı/kapsam kararı değildir; canlı yürütme
          ayrı, yazılı bir owner GO'su ister (§7). İ11 CLOSED korunur; hiçbir tamamlanmış iş yeniden açılmaz.
KAPSAM  : Kanonik plan İ12 (`CLIENT-BUTUNSEL-CANLI-TESLIM-PLANI-R02.md` §3 s.208) = **H6 gönderim kabul
          yenilemesi**, yedi gözlem. Kanıt = KAN (canlı davranış) ama **test sağlayıcısı**; **gerçek alıcıya
          gönderim YOK**. Sayaç 11/17, hizmet kabulü 0/8 tam KALIR (İ12 kapanmaz — yalnız hazırlık).
BAĞIMLILIK: H6. Sıra İ11 (H5, KAPANDI) → **İ12 (H6)** → İ13 (H2). Aylık cron gözlemi için takvim bağımlılığı var
          (aşağıda tetikleme ile aşılır).

---

## 1. Yedi gözlem — kaynak bağlarıyla

Ölçüt seti İ2'de yazıldı (`client-acceptance-criteria-i2-r01/`); A-9/A-10 tanımı `RELEASE20-HANDOVER-R01.md §5`.
Ürün davranışı RELEASE23 aday kaynağında (`project/apps/api/src`) doğrulandı.

| # | Gözlem | Ürün kaynağı (RELEASE23 aday) | Beklenen |
|---|---|---|---|
| **G1 · A-9** | Bilgi talebi, test sağlayıcı **REJECTED** | `client-info-request.service.ts:304-319` (gönder-sonra-yaz :257-273); `email-provider.service.ts:68-96` REJECTED sınıfı | `503` + `CLIENT_INFO_REQUEST_EMAIL_FAILED`; `ClientInfoRequest` **YAZILMAZ**; bildirim/audit YOK |
| **G2 · A-10** | Aynı, test sağlayıcı **timeout/ECONNRESET** (veya istisna) | `client-info-request.service.ts:313-317`; `email-provider.service.ts:76-101` INDETERMINATE (ETIMEDOUT/ESOCKET/ECONNRESET/EPIPE bilerek dışarıda) | `503` + `CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE`; kayıt **YAZILMAZ**; **sağlayıcıya ikinci çağrı YOK** (tek `conn-*`) |
| **G3 · CANARY_AUDIT** | Onaylı sağlayıcı ile FD yayını | `client-financial-disclosure-publication.service.ts:299-326` | `PUBLISHED` + kalıcı `providerMessageId`; **`_SENT` audit=1 · `_PUBLISHED` audit=1 · duplicate=0** |
| **G4 · dedupe/idempotency** | Aynı FD yayını ikinci kez | `publication.service.ts:177-200` (`sendRequestedAt` claim; `ALREADY_PUBLISHED`) | ikinci yayın **ilerlemez**; **gerçek `dispatcher.send` artmaz** (idempotent) |
| **G5 · izinli-alıcı (allowlist)** | Allowlist DIŞI sağlayıcı (varsayılan `mock` dahil) ile yayın | `publication.contract.ts:21,31-49`; `publication.service.ts:169` `assertProductionProvider` | `403` `..._PROVIDER_NOT_PRODUCTION`; yayın başlamaz, `PUBLISHED` olmaz, **hiçbir bayt sağlayıcıya gitmez** (send=0) |
| **G6 · SENT/PUBLISHED audit ayrımı** | Onaylı yayın audit izi | `publication.service.ts:319-326`; `publication.contract.ts:53-59` | İki AYRI aksiyon: `CLIENT_FINANCIAL_DISCLOSURE_SENT` ≠ `..._PUBLISHED`; metadata'da tutar/alıcı/içerik YOK |
| **G7 · aylık cron canlı izi** | Aylık ekstre teslimi | `client-statement-monthly-delivery.service.ts:144-219`; cron `'0 3 1 * *'` (`monthly-period.ts:16,19`) | env `CLIENT_STATEMENT_MONTHLY_DELIVERY==='true'` yoksa **kayıt bile olmaz**; açıkken teslim defteri `markSent` izi; aynı dönem `SENT` varsa **ikinci gönderim yok** (dedupe key `STATEMENT_MONTHLY:...`) |

**Ek gözlem — A-9/A-10 FD yayın yolunda da (yeni kol):** onaylı sağlayıcı seçili + sink `reject`/`reset` → yayın
`SEND_FAILED`; `PUBLISHED` olmaz; `providerMessageId` boş; tek `dispatcher.send` (kör tekrar yok). Kaynak
`publication.service.ts:220-256`.

## 2. Mevcut durum ile fark (yeniden açma YOK)

- **Ürün davranışı**: RELEASE23 aday kaynağında yedi gözlemin tamamının mantığı MEVCUT (yukarıdaki satırlar).
  **DİKKAT — bayat yorum:** `publication.service.ts:90-94` servisi "DORMANT, production call-site YOK" diyor; oysa
  `client-financial-disclosure.controller.ts:256-266` onu `POST /client-financial-disclosures/:id/publish` ile
  HTTP'ye bağlıyor → RELEASE23'te yol **CANLI**. (Ürün kusuru değil; yalnız yorum güncelliği — kanıtla ayrıldı.)
- **Mevcut testler (repo, CI'da koşar) — hepsi KAPSANMIŞ:** A-9/A-10
  `address-discovery/__tests__/client-info-request-provider-outcome.db-gated.integration.spec.ts:213,229,253`;
  allowlist/SENT-PUBLISHED/dedupe `client-financial-disclosure/__tests__/...-publication.db-gated.integration.spec.ts:179,226,336,351,622`;
  aylık cron/dedupe `client-statement/__tests__/client-statement-monthly-c3b04.spec.ts:186,195,230,302`.
- **Kabul-koşucu (canlı düzenek) düzeyindeki BOŞLUK — İ12'nin işi:** (i) FD publish yolunda red/timeout ayrımı
  canlı düzenekte koşulmuyor (İ3 yalnız allowlist-dışı reddi ölçtü); (ii) CANARY_AUDIT `AuditLog` satır sayımı
  runner'da otomatik değil; (iii) aylık cron canlı izi kabul-koşucuda hiç koşulmadı; (iv) İ3 runner varsayılan
  yolları RELEASE20'ye sabit → RELEASE23'e yönlendirme ön koşulu. İ12 bu dördünü kapatır; **ek altyapı gerekmez**,
  mevcut i3-sink mod dosyası + i3-spy sayacı yeni kollara bağlanır.

## 3. Düzenek — İ3'ün yeniden kullanımı (yeni mekanizma YOK)

İ12, İ3 kabul-koşucu düzeneğini (`client-acceptance-runners-i3-r01/scripts/`) yeniden kullanır:
`i3-lib` (Results/setup/decide/readRuntimeWitness), `i3-start-api` (tek yapılandırma kaynağı, `i3-api-config.json`),
`i3-sink` (loopback SMTP; mod dosyası: ``→ACCEPTED, `reject`→550, `reset`→ECONNRESET, `hang`→timeout),
`i3-spy` (**gerçek `dispatcher.send` sayacı**, ürün kodu değişmez, `--require`), `i3-h5-intake` (A-9/A-10 info-request
kolu — **zaten koşar**).

**RELEASE23 yönlendirme (ön koşul):** `i3-start-api`/`i3-spy`/`i3-run` varsayılanları RELEASE20'ye sabittir; İ12
env override ile RELEASE23 build'ine yöneltilir — `I3_DIST_MAIN`, `I3_DIST_ROOT`, `AH_PRISMA_ROOT`, `AH_BCRYPT_PATH`.
Kaynak salt-okuma; **canlı `HY_W4_RELEASE23` köküne, canlı DB'ye, canlı .env'e YAZILMAZ**. İzolasyon ön koşulu
(`i3-run:118-169`): loopback erişilir + LAN erişilmez + provider=smtp→sink + pid + çalışma-zamanı tanığı (spy).

**Yeni İ12 kolları (bu paketin scriptleri):**
- `i12-fd-outcome.js` — FD publish red/timeout ayrımı (G-ek) + G3 CANARY audit-satır sayımı + G4 dedupe + G6 SENT/PUBLISHED ayrımı. i3-h4-disclosure onay zincirini (POSTED→DRAFT→ofis→içerik onayı) ÖN KOŞUL olarak kurar, sonra publish'i sink modlarıyla koşar.
- `i12-monthly.js` — G7: disposable ortamda `runMonthlyDelivery(now, scope)` tetikler; teslim defteri `markSent` izi + aynı dönem ikinci gönderim yok + env kapalıyken kayıt yok ölçer.
- `i12-run.js` — orkestratör (i3-run kalıbı): config→sink→izolasyon→disposable setup→`i3-h5-intake`(A-9/A-10)+`i12-fd-outcome`+`i12-monthly`→erişim kapanışı `finally`.

## 4. Aktör / yetki ayrımı

İ3 aktör matrisi (`i3-lib ACTORS`): `user`/`elev1-3` AYNI rol (USER); fark yalnız PARTNER lawyer bağı
(`isApproverEligible`). Yetki, rol adından DEĞİL üründen gelir.
- **G1/G2 (bilgi talebi):** `INFO_REQUEST_SEND` eşiği; gönderimden ÖNCE `runAuthorizedClientWorkspaceCommand`.
- **G3-G6 (FD):** üç ayrı kişi zinciri (talep/ofis-onay/içerik-onay: elev1/elev2/elev3); self-approval + four-eyes +
  eligibility kapıları (İ3 H4-06/07 zaten kanıtlar). Yayın `elev3` (içerik onaylayan) ile.
- **Tenant sınırı:** disposable tenant + yabancı tenant (i3-lib setup); yazma tenant-içi.

## 5. Beklenen kayıtlar · gönderim/cron etkileri · durma kuralları

- **Yazılacak kayıtlar (yalnız başarı yolunda):** G3 başarılı yayında `ClientFinancialDisclosureVersion.status=PUBLISHED`
  + `providerMessageId` + iki `AuditLog` (`_SENT`,`_PUBLISHED`); G7 açık cron'da teslim defteri `markSent` + `ClientNotification`.
- **Kayıt YAZILMAYAN yollar:** G1/G2 (503 → `ClientInfoRequest` yok); G4 ikinci yayın (ALREADY_PUBLISHED, yeni audit yok);
  G5 allowlist-dışı (yayın yok, providerMessageId yok).
- **Gönderim etkisi:** gerçek `dispatcher.send` yalnız `i3-spy` sayacıyla ölçülür; hedef **yalnız loopback sink**;
  **gerçek alıcıya bayt gitmez** (alıcı `.invalid` + allowlist + izolasyon ön koşulu).
- **Cron etkisi:** aylık iş yalnız `CLIENT_STATEMENT_MONTHLY_DELIVERY==='true'` iken kaydolur; disposable ortamda
  manuel tetiklenir; **canlı scheduler'a dokunulmaz** (deploy/restart yok).
- **Durma kuralları (i3-lib `decide.*` + `Results` üç değerli):** ölçülemeyen sonuç PASS OLMAZ (UNMEASURED); HTTP kodu
  tek başına yetmez (durum önce/sonra); yetki reddi yalnız 403; hata kodu TAM eşleşme; belirsizlik → fail-safe
  INDETERMINATE, kör tekrar yok; izolasyon ön koşulu sağlanmadan **hiçbir gönderim** (sonda dahil).

## 6. Erişim kapanışı · izolasyon doğrulaması

- **Erişim kapanışı:** `i3-run` `finally` — çıkış kodundan BAĞIMSIZ tüm test hesapları `isActive=false` +
  `tokenVersion++` (F04 kusuru B(i) tekrarlanmaz).
- **İzolasyon:** G-0 disposable ortam kapısı (yazmadan önce); disposable Postgres (docker, ayrı port); API ayrı port
  (varsayılan 8099) + `verifyApiBoundToSameDatabase`; sink 127.0.0.1 (LAN erişilmez ölçülür); çalışma-zamanı tanığı
  (`readRuntimeWitness`) config↔süreç bağını doğrular; sayı-düzeyi tenant izolasyonu (yabancı tenant sayıları eşit).

## 7. §7 — TEK KOŞULLU OWNER GO TASLAĞI + SOMUT CANLI YÜRÜTME (İ12 CANLI KABUL · owner kararına)

> **GO — CLIENT İ12 H6 GÖNDERİM TAM CANLI KABUL** (taslak; canlı yürütme ayrı yazılı owner onayı ister)
>
> Referans: İ12 `OWNER-GO-CLIENT-I12-<YYYYMMDD>-R<nn>` — owner'ın CLIENT oturumuna birebir vereceği değer.
> **Gerçek biçimli ref bu belgede/hazırlık dosyalarında ÜRETİLMEZ/yazılmaz** (yer tutucu). K-GO/K-REF İ11 ile aynı
> desende (biçim + tüketim kontrolü); ref hiçbir repo/prova dosyasına yazılmaz, yalnız koşum kanıtı.
> **Onay sınırı:** onay yalnız owner'ın bu metni açıkça "GO" demesiyle; yer tutucu doldurmak onay değildir. Bu GO
> D1/mühür/authority/cutover DEĞİLDİR; RELEASE23 canlı kalır.

Aşağıdaki metin canlı kabulün **tek tutarlı yürütme akışıdır** (yamalanmış paragraf değil): sabit kimlikler →
ön koşullar → iki SMTP kaynağının pencere yönlendirmesi → betik/sha kapısı + sayaç bağlama → yedi gözlemin
canlı kanıtı → kayıt (INSERT/UPDATE/audit) envanteri → cron kapsam izolasyonu → restart bütçesi → geri-alma/kapanış.

**7.0 · Sabit kimlikler ve kapsam sınırı.** Canlı RELEASE23 `2740df3d…` (cutover CUT-20260913-200554-ec45bc63);
test sağlayıcı = loopback sink (`reject`/`reset`/`hang` mod dosyası); **gerçek alıcıya gönderim YOK** (alıcı
`.invalid` + allowlist + izolasyon). **Kapsam dışı:** gerçek alıcıya gönderim · deploy/restart-tabanlı sürüm
değişimi · canlı scheduler'a kalıcı iş ekleme · İ11'i yeniden koşma · **ürün kodu değişimi** · kapsam büyütme ·
**ikinci bir canlı-DB API açma** · disposable ortam kapılarının (G-0) kaldırılması. Yedi gözlem (§1) TEK oturumda
ölçülür; her biri üç-değerli verdict (i3-lib `decide.*` + `Results`); **UNMEASURED PASS sayılmaz**; HTTP kodu tek
başına yetmez (durum önce/sonra); belirsizlik → fail-safe INDETERMINATE, kör tekrar yok.

**7.1 · Ön koşullar.** (a) İzolasyon ön koşulu PASS: loopback erişilir + LAN erişilmez + provider=smtp→sink + pid +
çalışma-zamanı tanığı (`readRuntimeWitness`). (b) `verifyApiBoundToSameDatabase` — canlı API'nin beklenen DB'ye bağlı
olduğu doğrulanır. (c) Pencere env değişiklikleri İ11 **T-PENCERE-AÇ/KAPA** deseniyle owner'ın yükseltilmiş
komutuyla yapılır (env değeri sha256 ile pinlenir + geri-alma değeri kaydedilir); ajan canlı .env'e yazmaz.

**7.2 · İKİ AYRI SMTP KAYNAĞI — pencere yönlendirmesi HER İKİSİNİ kapsar (kritik).** İ12 yollarının e-posta taşıması
TEK yerden gelmez; provada doğrulandı:
> - **G1/G2 (bilgi talebi) + G3-G6/FD-RED/FD-TMO/HANG (FD yayını)** → `notification/email-provider.service.ts`
>   **env tabanlı**: `EMAIL_PROVIDER` (allowlist `['smtp','sendgrid','ses']`) + `SMTP_HOST`/`SMTP_PORT`. Pencerede
>   `SMTP_HOST→127.0.0.1`, `SMTP_PORT→<sink>`, `EMAIL_PROVIDER=smtp` (allowlist-içi) yönlendirilir.
> - **G7 (aylık ekstre teslimi)** → `client-notification.service.ts` `sendEmail` → **DB satırı** `office.getFullSmtpSettings(tenantId)`
>   (Büro Ayarları > E-posta; `Office.smtpHost/smtpPort/smtpUser/smtpPass/smtpSecure`; `smtpPass` at-rest AES-256-GCM,
>   `enc:v1:` öneksiz düz-metin geriye-uyumlu). `email-provider.service` env'i BU yolu ETKİLEMEZ. Bu yüzden canlı G7'de
>   hedef tenant'ın **Office SMTP satırı** pencerede sink'e alınır — **SIR-KORUYUCU**: `i12-live-window.js` YALNIZ
>   `smtpHost`/`smtpPort`/`smtpSecure`'ı değiştirir; **`smtpUser`/`smtpPass` (SIR) OKUNMAZ/YAZILMAZ/rollback'e KONMAZ**
>   (sink AUTH ilan etmediğinden gerçek kimlik bilgisi iletilmez). Pencere sonunda host/port/secure özgün değere geri
>   alınır (rollback yalnız sırsız alanları taşır). Bu ayrım prova sırasında bulundu: yalnız env yönlendirmesi G7'de
>   "E-posta ayarları yapılandırılmamış" → `DISPATCH_FAILED` verir.

**7.3 · Betikler + tam yol + sha256 kapısı.** Canlı GO'da her betiğin main'deki sha256'sı §D3-benzeri sha kapısıyla
doğrulanır (yalnız eşleşen sha koşar). Tam yol `project/docs/governance/` altındadır; SHA256 (İ12 R04 içeriği):

| Betik (tam yol kökten) | Rol | SHA256 |
|---|---|---|
| `client-live-acceptance-i12-r01/scripts/i12-gaps.js` | G3/G4/G6/FD-RED/FD-TMO | `E6FE71228F78B5B80BB4771F0F164C9028F4816F00898D5280EDDA9226351154` |
| `client-live-acceptance-i12-r01/scripts/i12-gaps2.js` | CLAIM/RECLAIM/HANG | `CFA0E9C084D7218D39406D1AE4329353C7EF0E6F8882A2E65D7B31DFAA630E21` |
| `client-live-acceptance-i12-r01/scripts/i12-allowlist.js` | G5 gerçek negatif kontrol | `C7622F9091E23FC2063CA297844539E4E14880966631DC0047857169EAD3F007` |
| `client-live-acceptance-i12-r01/scripts/i12-cron-hook.js` | G7 predicate/direct/fireOnTick/kısa-takvim | `632E569A2C1ACEAACE70FA2E2A3DD0BBD6F8874A045830A6AA517E5E409E06CB` |
| `client-live-acceptance-i12-r01/scripts/i12-cron-run.js` | G7 a/b/c/d | `FF8766D260175999E6645537A79638EF1D54B30EEF404AC093E6A1E17C2AE534` |
| `client-live-acceptance-i12-r01/scripts/i12-cron-delivery.js` | G7-DELIV-SCOPE + G7-DEDUPE | `29A569EC6A191346E65C5ECC20F94589902FD69062C7128B7E445D93FD7AEBD1` |
| `client-live-acceptance-i12-r01/scripts/i12-window.js` | PROVA (disposable/G-0) Office SMTP penceresi · SIR-KORUYUCU · rollback sınıflandırma (ABSENT/UNREADABLE/CORRUPT/MISMATCH; doğrulanmış-kapanış-yoksa-PASS-yok) · ikinci-open özgün-koruma · 3-alan close · ikinci-close güvenli | `DB1E5A5A671EE2486D1DB0461FACC2A180E9EA04F310EC10AA531BF926DA08E8` |
| `client-live-acceptance-i12-r01/scripts/i12-live-window.js` | **AYRI CANLI** giriş noktası · SIR-KORUYUCU · canlı-güvenlik kapıları (`I12_LIVE_CONFIRM` + `I12_LIVE_GO_REF` + `I12_EXPECT_DB`/`I12_EXPECT_API` + `I12_EXPECT_TENANT_SLUG`) | `DDDB4CCA999D715AFA3F0A9AA8E409BB54854370BDAD20C190DB096014BFD1D9` |
| `client-live-acceptance-i12-r01/scripts/i12-live-preflight.js` | **CANLI PREFLIGHT** (salt-okuma) · `--phase pre` (GO-ref biçim+tüketim + DB host/port/ad + hedef slug; makbuz ARANMAZ) / `post` (+makbuz tenant/runId + API↔DB); eksik kimlikte YAZMA BAŞLAMAZ | `B010D38AE1244561EE5AE089C2BDB590182F2BC231A2F24B3425C64609574127` |
| `client-live-acceptance-i12-r01/scripts/i12-live-setup.js` | **CANLI KURULUM** (sentetik hedef tenant + FD zinciri + statement aktivitesi + Office + makbuz; makbuz artık **aktör e-postalarını** taşır — online ölçüm bunları kullanır) · canlı-güvenlik kapısı (confirm+GO-ref+DB+slug=türetilen); sır makbuza konmaz | `7E1EDC9460CA9A40B261B4A4DA89652EC4E0826AA7EC9A88B6B96AF867FD1458` |
| `client-live-acceptance-i12-r01/scripts/i12-live-measure-online.js` | **CANLI ÖLÇÜM (ONLINE · FAZLI)** — §7.9'da KOŞAN ölçüm. MEVCUT tek API'ye HTTP ile bağlanır (`I12_ONLINE_API_BASE`); makbuz tenant/runId/aktörlerini kullanır (setupI3 YOK); FD zincirini yalnız makbuz tenant'ına yazar + HTTP yayınlar. **setupI3 / yeni API boot / spy·cron-hook enjeksiyonu / port-kill İÇERMEZ.** `I12_PHASE`: `smtp` (G1·G2·G3·G6·G4·FD-RED·FD-TMO) · `mock` (G5) · `g7` (dar in-API manuel teslim + dedupe + YABANCI tenant +0) — hepsi AYNI makbuz ve AYNI tek API. **Erişim kapanışı BU BETİKTE YOK** (fazlar zincirlenebilsin diye `i12-live-recover`'a ertelenir). Sayaçlar AYRI: **smtpConnection(conn) — GERÇEK `dispatcher.send` çağrısı DEĞİLDİR ve öyle SUNULMAZ** · delivery(msg, alıcı-scoped) · dbRecord. Eşit delta HER DURUMDA denklik SAYILMAZ (FD-RED/TMO: conn+1 ≠ delivery+0). **OKUNAMAYAN SAYAÇ SIFIR SAYILMAZ** → `null` → ÖLÇÜLEMEDİ. **HEDEF-DIŞI MESAJ KAPISI (`I12-OFFTARGET`)**: her fazın sonunda (hata/çöküş dahil) ürünün adreslediği **TÜM ZARF alıcıları** (`msg-*` `X-I3-To:` + her `conn-*` `rcpt=`, DATA'ya ulaşmayan denemeler dahil) **ve** `To:`/`Cc:` başlıkları, betiklerdeki TAM adreslerden kurulu izin kümesiyle (`deliv-`/`fd-`/`alici-<runId>@ah-harness.invalid`) karşılaştırılır — izin kümesi dışında tek adres bile **FAIL** (Bcc yalnız zarfta olduğu için başlık TEK BAŞINA yetmez); zarf kanıtı eksik/okunamaz (işaretsiz eski sink kaydı, `X-I3-To`'suz teslim) → **ÖLÇÜLEMEDİ, asla PASS**; dizin okunamazsa ÖLÇÜLEMEDİ. Makbuz kimlik bağı DB'den doğrulanır; canlı-güvenlik kapısı | `76F94DC3C5FEEE58F63838A7295F69C5C8A07562AFC0DD0C7FA5F1E08D5DFC80` |
| `client-live-acceptance-i12-r01/scripts/i12-live-recover.js` | **BAĞIMSIZ KURTARMA + NİHAİ KAPANIŞ** — §7.9 try/finally'de İLK YAZMADAN itibaren HER SONUÇTA çağrılır. **HER YAZMADAN ÖNCE** hedef+yabancı tenant ID↔slug↔runId bağı DB'den doğrulanır (`i12-live-identity`); bağ yoksa **hiçbir kullanıcıya/Office kaydına YAZILMAZ** (exit 4). Office SMTP rollback ve **nihai** erişim kapanışı AYRI try/catch'te — **biri diğerinin hatasıyla ATLANMAZ**; herhangi biri doğrulanmazsa exit 1 (HATA). Makbuz yazılmadan çökülmüşse hedef, yazmadan önce üretilen runId'den TÜRETİLEN slug ile aranır; bulunmazsa `nothingToRecover`. `.env` restore PowerShell'e delegedir | `D7BAFDEB5E040ABA3C8AC0360B5E174E4E89D432E265C510B4AEF421738CD06B` |
| `client-live-acceptance-i12-r01/scripts/i12-live-cron-guard.js` | **AYLIK CRON ÇAKIŞMA KORUMASI (salt-okuma)** — `CLIENT_STATEMENT_MONTHLY_CRON='0 3 1 * *'` @ `Europe/Istanbul` ateşlemesi pencereye düşüyorsa **REDDEDER (exit 5)**. Çakışmada sentetik tenant GLOBAL koşuda süpürülür ve **G7 aynı-dönem dedupe ölçümü GEÇERSİZ** olur. `I12_ENV_FILE` verilirse YALNIZ `CLIENT_STATEMENT_MONTHLY_DELIVERY` anahtarı okunur (dosyanın başka satırı okunmaz/yazdırılmaz) | `3364686577C803E857BB0D5B188A62ED96DE73B0CDC100A83370FD50148CFFA5` |
| `client-live-acceptance-i12-r01/scripts/i12-cron-guard-prova.js` | cron koruması için **deterministik hedefli prova** (DB/API gerektirmez): sınır, ay sonu, yıl dönümü ve tz doğruluğu | `3B41C835F6E6601C2D74E1EC1B76D1115F0722A921C2B1C6F1572789AC7A5585` |
| `client-live-acceptance-i12-r01/scripts/i12-offtarget-prova.js` | **hedef-dışı mesaj kapısı (ZARF+BAŞLIK)** için hedefli prova — GERÇEK `i3-sink` + GERÇEK SMTP konuşmaları (ham soket + ürünün nodemailer'ı) ile `scanOffTarget`'in GERÇEK fonksiyonunu ölçer (kopya mantık YOK): izinli `To:` + izin dışı Bcc/RCPT TO · nodemailer `bcc:` · `reset` denemesi · eski sink/zarfsız kayıt→ÖLÇÜLEMEDİ · sink dışarı aktarmaz. `I12_NODEMAILER_PATH` gerekir | `19D7E16D68AE7E34799B74D6B1694F795CB1D67BAC601A056BC367028D074926` |
| `client-live-acceptance-i12-r01/scripts/i12-live-identity.js` | **KİMLİK BAĞI (salt-okuma, TEK KAYNAK)** — makbuz slug'ı runId'den türemiş mi (`ah-<runId>`), hedef/yabancı tenant DB'de var mı ve **id↔slug** eşleşiyor mu, her iki slug `ah-` sentetik önekli mi (assertOwnSlug). Hiçbir şey YAZMAZ; `{ok,reason}` döner — çağıran yanlış kimlikte SIFIR YAZMA ile durur | `9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F` |
| `client-live-acceptance-i12-r01/scripts/i12-live-measure.js` | **DISPOSABLE ÖLÇÜM PROVASI** (canlı DEĞİL; §7.9 canlı dizisinden ÇIKARILDI) — self-contained: kendi setupI3'ünü kurar, dist'i i3-spy+cron-hook ile boot eder, port-kill yapar, G7'yi cron-hook ile enjekte eder. **G-0 (assertDisposableEnvironment) EN BAŞTA** → canlı DB'de asla koşmaz. 12/12 kanıtı yalnız disposable davranışı belgeler; canlı ölçüm `i12-live-measure-online.js`'dir | `AB531AFBEEBF46285E9F2B5D576892CDAC677C3020850E38B90AA070ABC53F58` |
| `client-acceptance-runners-i3-r01/scripts/i3-lib.js` | düzenek | `56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3` |
| `client-acceptance-runners-i3-r01/scripts/i3-start-api.js` | düzenek | `72505F981EE167B1A664E5663DC675B2E6ACAB1CCCE84058231BA8BB0EECDFB5` |
| `client-acceptance-runners-i3-r01/scripts/i3-sink.js` | loopback SMTP sink — yalnız `127.0.0.1`'e bağlanır, **hiçbir baytı dışarı iletmez** (yalnız `net.createServer`; istemci/çıkış çağrısı YOK). Her konuşmada `conn-*` kaydına `envelope=v1` işareti ve **her `RCPT TO` için `rcpt=` satırı** yazar (DATA'ya ulaşmayan denemeler dahil); teslim edilen mesajda zarf `X-I3-To:` | `0E3884FBF3BEBE549FD0D8B29934F8D52F8E460682782FA086355AD4B5B3F7F1` |
| `client-acceptance-runners-i3-r01/scripts/i3-spy.js` | gerçek dispatcher.send sayacı | `954C4B88AFB18322564FD29F71CE1D7B6EF4EEFF4DC6716EA7B6AB08AB1F36D0` |
| `client-acceptance-runners-i3-r01/scripts/i3-h5-intake.js` | A-9/A-10 (G1/G2) | `D6D27F874C3D7409EC307F54B3BEBB4F9B8257270FE20F7E2DECD7DF6180F101` |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | G-0 + prisma/aktör altyapısı | `DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7` |

> **Disposable kapıları KALDIRILMAZ ve owner yetkisiyle AŞILMAZ.** Prova/ölçüm betikleri (`i12-gaps`, `i12-gaps2`,
> `i12-cron-*`, `i12-window.js`, **`i12-live-measure.js`** — disposable ölçüm provası) `ah-lib.assertDisposableEnvironment`
> (G-0: DB port allowlist `{5439}`, DB adı `{hukuk_fix1_test}`, loopback) taşır ve **YALNIZ disposable DB'de** koşar;
> **CANLIYA ASLA koşulmaz** ve G-0 owner
> komutuyla "aşılmaz" — G-0'lı bir betiği canlıya yöneltmek geçersizdir (sha256'lar G-0 KORUNARAK hesaplandı).
> **Canlı yürütme AYRI giriş noktalarıyla yapılır** (bkz. `i12-live-window.js`): bu betikler G-0 taşımaz ama kendi
> **canlı-güvenlik kapılarını** taşır (fail-closed; open/close için, status salt-okuma): (1) `I12_LIVE_CONFIRM=1`
> açık onay; (2) `I12_LIVE_GO_REF` DOLU (owner GO referansı — yetkilendirme kanıtı; **ham ref repoya/kanıta
> YAZILMAZ**); (3) `I12_EXPECT_DB` bağlı DB adıyla eşleşmeli + `I12_EXPECT_API` DOLU (beklenen DB/API kimliği; API↔DB
> bağı ölçümde `verifyApiBoundToSameDatabase`); (4) `I12_EXPECT_TENANT_SLUG` hedef tenant slug'ıyla eşleşmeli
> (**koşuma ait sentetik tenant sınırı — yanlış hedef reddi**); (5) TEK tenant + `othersUnchanged` + SIR-KORUYUCU.
> Sağlamlık: **ikinci open özgün yedeği korur**, **close değişen 3 alanı (host/port/secure) doğrular**, **ikinci
> close güvenlidir** (idempotent). Ölçüm mantığı prova ile AYNIdır (tek kaynak `runWindow`), ama **G-0 devre dışı
> bırakılmaz — ayrı, açıkça onaylı bir yol kullanılır**. **İkinci bir canlı-DB API AÇILMAZ.**

**7.4 · Sayaç bağlama (counter loading) + SMTP/mock anahtarı.** Tek canlı API'nin taşıması pencerede sink'e
yönlendirildikten sonra: FD yolunda gerçek `dispatcher.send` `i3-spy` deseniyle (ürün kodu değişmez, `--require` ile
`ClientFinancialDisclosureEmailDispatcher` sarmalanır) sayılır; bilgi-talebi yolunda sink `conn-*` (bağlantı) +
`msg-*` (mesaj) dosya sayımıyla; G7 yolunda **hedef-scoped** çağrının teslimini alıcı-ayrık sink `msg-*` sayımı
(hedef `deliv-target-<runId>` vs yabancı `deliv-foreign-<runId>`) + **TOPLAM sink** kontrolü (hedef-dışı=FAIL) +
teslim defteri `SENT` sayımıyla ölçer. Sink modu dosyayla anahtarlanır (``→ACCEPTED, `reject`→550, `reset`→ECONNRESET,
`hang`→greeting-timeout). **Sayaç yükleme/kaldırma restart'a bağlıdır** (i3-spy `--require` açılışta; §7.8).

**7.5 · Her ölçütün canlı kanıtı.**
> - **G1/G2:** canlı API'ye bilgi talebi; sink `reject`→`503 CLIENT_INFO_REQUEST_EMAIL_FAILED` (ClientInfoRequest
>   **INSERT yok**) · sink `reset`→`503 CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE` (INSERT yok, `conn-*` farkı=1 →
>   **sağlayıcıya ikinci çağrı yok**).
> - **G3/G6:** canlı FD sürümü üç-kişi onay zincirinden (talep/ofis-onay/içerik-onay) yayınlanır →
>   `ClientFinancialDisclosureVersion.status` **UPDATE→PUBLISHED** + `providerMessageId` yazılır + iki AYRI
>   `AuditLog` **INSERT**: `CLIENT_FINANCIAL_DISCLOSURE_SENT` (=1) ≠ `..._PUBLISHED` (=1), duplicate=0; audit
>   metadata'da tutar/alıcı/içerik YOK.
> - **G4/CLAIM:** aynı sürüm ikinci yayın → `4xx` state-guard (`DISCLOSURE_PUBLICATION_STATUS_INVALID` /
>   `ALREADY_PUBLISHED` / `SEND_ALREADY_CLAIMED`) · gerçek `dispatcher.send` **+0** · yeni `AuditLog` **+0**.
> - **G5 (gerçek negatif kontrol, yalnız "smtp aktif" DEĞİL):** pencerede tek API'nin sağlayıcı yapılandırması geçici
>   olarak **allowlist-DIŞI** bir değere (`mock`/tanımsız) alınır → **tek bir yayın denemesi** yapılır → `403
>   DISCLOSURE_PUBLICATION_PROVIDER_NOT_PRODUCTION`, yayın başlamaz, `PUBLISHED` olmaz, `providerMessageId` yok,
>   gerçek `dispatcher.send`=0 (i3-spy ile ölçülür) → sonra allowlist-içi (`smtp`) değere geri alınır (T-PENCERE-KAPA).
>   Bu, sağlayıcının yalnızca "aktif" olduğunun değil, **allowlist kapısının gerçekten reddettiğinin** kanıtıdır.
> - **G7 (teslim içeriği + dedupe):** predicate (canlı env `CLIENT_STATEMENT_MONTHLY_DELIVERY==='true'` → job kayıtlı,
>   ifade `0 3 1 * *`) + hedef tenant'ta doğru döneme (önceki ay) ait POSTED disposition/CLIENT_PAYABLE + STATEMENT_READY
>   şablonu + Office SMTP satırı → tetikte **gerçek gönderim** (sink `msg`), teslim defteri `clientStatementDeliveryLedger`
>   claim (**INSERT PENDING**) → `markSent` (**UPDATE→SENT**), `ClientNotification` **INSERT→SENT**; aynı dönem sonraki
>   tetikte ek gönderim **+0** + mükerrer kayıt **+0** (dedupeKey `STATEMENT_MONTHLY:ClientStatement:{id}:{periodKey}`;
>   `decideDeliveryClaim`: SENT→SKIP `already-sent`, taze PENDING→SKIP `fresh-pending`). **Gerçek zamanlayıcı:** canlı
>   takvim `0 3 1 * *` ya beklenir ya da owner onaylı hızlandırma AYRI kaydedilir; prova `fireOnTick`/kısa-takvim
>   hızlandırması **canlı takvim kanıtı SAYILMAZ**; canlı scheduler'a kalıcı kısa-cron EKLENMEZ.

**7.6 · Kayıt envanteri (INSERT/UPDATE/audit) — başarı VE hata yolları.**
> - **Başarı — G3 FD:** UPDATE `ClientFinancialDisclosureVersion` (→PUBLISHED, +providerMessageId); INSERT 2×`AuditLog`
>   (`_SENT`,`_PUBLISHED`). **RECLAIM** (reddi sonrası `retry-publication`): UPDATE (SEND_FAILED→…→PUBLISHED) + tek ek
>   `_PUBLISHED` audit.
> - **Başarı — G7 teslim:** INSERT/UPDATE `clientStatementDeliveryLedger` (PENDING→SENT); INSERT `ClientStatement`
>   (yoksa) veya REUSED; INSERT/UPDATE `ClientNotification` (PENDING→SENT).
> - **Hata — G1/G2:** hiçbir `ClientInfoRequest` yazılmaz (503).
> - **Hata — FD-RED/FD-TMO/HANG:** UPDATE `…Version.status→SEND_FAILED`; **PUBLISHED yok**, `providerMessageId` yok,
>   `_PUBLISHED` audit yok; gerçek send: RED/TMO=+1 (tek deneme), HANG timeout sonrası +0.
> - **Hata — G4/G5:** state-guard/allowlist reddi → yeni kayıt/audit YOK.
> - **Hata — G7 dispatch başarısız:** `clientStatementDeliveryLedger` `markFailed` (UPDATE→FAILED, `attempts++`,
>   `nextRetryAt`); `ClientNotification` FAILED. (MAX_ATTEMPTS=3; terminal denemede errorReporter.)

**7.7 · Cron kapsam izolasyonu — HEDEF-SCOPED yöntem (R04'te doğrulandı).** Üretimde aylık cron `runMonthlyDelivery(now, {})`
= boş-scope = tüm ACTIVE tenant tarar. **Canlı KABULDE boş-scope/all-tenant tetik KULLANILMAZ** (gerçek müvekkillere
gönderim riski). Bunun yerine yalnız sentetik hedef tenant'a **scope'lu** `runMonthlyDelivery(now, {tenantId: T})` çağrılır.
Bu yöntemin hedef sınırını gerçekten uyguladığı R04 provasında (§9.4) **güçlü** biçimde doğrulandı: yabancı tenant da
**TAM teslim-uygun** (dönem aktivitesi + alıcı + şablon + Office SMTP) kuruldu; hedef-scoped çağrıda yabancı tenant
teslim **ALMADI** (sink+0/ledger+0/bildirim+0) ve **toplam sink deltası = hedef** (hedef-dışı hiçbir gönderim yok).
Zayıf "yabancı aktivitesiz → SKIP" kanıtı YERİNE bu geçer. Canlı scheduler'a kalıcı kısa-cron EKLENMEZ.

**7.8 · Restart bütçesi (yöntemden TÜRETİLDİ) · geri-alma · kapanış.** Hangi ayarın restart gerektirdiği kaynaktan
belirlendi: **env SMTP (`SMTP_HOST/PORT`) ve `EMAIL_PROVIDER` süreç açılışında `ConfigService` ile okunur**
(`email-provider.service.ts:47,89`) → çalışan sürecin bu değerleri ancak **restart** ile değişir; **i3-spy sayacı**
`--require` ile açılışta yüklenir → restart gerektirir; **hedef tenant Office SMTP** ise her gönderimde DB'den okunur
(`getFullSmtpSettings`) → **restart GEREKTİRMEZ**, `i12-window.js` ile DB'de değişir. Buna göre **restart bütçesi = 3**:
> - **Restart-1 (env=smtp penceresi):** `EMAIL_PROVIDER=smtp` + `SMTP_HOST/PORT→sink` + `--require i3-spy`. G1/G2 (bilgi
>   talebi), G3/G4/G6/FD-RED/FD-TMO/HANG (FD) + G7 (statement; hedef Office SMTP `i12-window open` ile sink'te) koşar.
> - **Restart-2 (G5 allowlist-DIŞI penceresi):** `EMAIL_PROVIDER=<mock/tanımsız>` + `SMTP→sink` + `--require i3-spy`.
>   Tek yayın denemesi → `403 PROVIDER_NOT_PRODUCTION`, send=0. (Sağlayıcı açılışta sabit olduğundan AYRI boot şart;
>   **ikinci canlı-DB API açılmaz** — aynı tek API restart edilir.)
> - **Restart-3 (kapanış/geri-alma):** özgün env (gerçek SMTP + özgün `EMAIL_PROVIDER`), `--require i3-spy` YOK.
>
> Her restart: **owner'ın yükseltilmiş komutu** (auth) + **süre bütçesi**. Ölçülen soğuk boot spawn→listen = **~2,3 sn**
> (izole RELEASE23 dist); canlı kutuda graceful drain + LB health-check payıyla **restart başına ≤120 sn** operasyonel
> bütçe, öncesi/sonrası env değeri sha pin'iyle kaydedilir. Canlı sürüm `2740df3d` DEĞİŞMEZ (yalnız env + restart).

**Geri-alma (rollback) · kurtarma · SIR-KORUMA.** Hedef tenant Office SMTP'si canlıda `I12_LIVE_CONFIRM=1 node
i12-live-window.js close <tenantId>` ile özgün host/port/secure'a döner (satır yoktuysa oluşturulan satır SİLİNİR);
**sırsız rollback dosyasından** yapılır → **süreç yarıda ölse bile `close` yeniden koşulur** (ayrı giriş noktası; F04
dersi). `smtpUser`/`smtpPass` pencere boyunca HİÇ değişmez (yalnız host/port/secure), dolayısıyla kurtarma da sırları
korur — rollback dosyasında sır YOKTUR. Env geri-alma Restart-3'tür. Pencere YALNIZ hedef tenant'a dokunur; **başka
tenant'ın Office ayarı değişmez** (izolede `othersUnchanged` + `secretsUntouched` + ikinci-open/close + yanlış-hedef
reddi ile **20/20**, birleşik zincir **4/4** doğrulandı, §9.4).
**Kapanış:** erişim sonlandırma (çıkıştan bağımsız `isActive=false`+`tokenVersion++`) + Office/env geri-alma doğrulaması
+ kanıt SHA256 manifesti korumalı yerel arşive. **IF GO-COMPLETE:** yedi gözlem PASS + kapanış → İ12 KAPANIR,
**sayaç 11/17 → 12/17**, hizmet **0/8 tam**.

**7.9 · Canlı yürütme — GERÇEK PowerShell (owner'ın yükseltilmiş kabuğunda; ajan canlıya dokunmaz).** Salt-okuma
belirlenen canlı gerçekler: görev **`HukukPlatform-API`** (Running; `C:\Ops\hukuk\bin\hukuk-task-host.exe api`);
launcher `C:\Ops\hukuk\bin\start-api.ps1` sha256 `CC634BBFE0BE8F4F06482EDB30FF1E687D36B08C075665E2EC160EA8082619B3`;
app env `.env`'den (dotenv; `…HY_W4_RELEASE23\project\apps\api\.env`); API prefix `/api` (login `…/api/auth/login`).
**i3-spy KULLANILMAZ** (pinli launcher NODE_OPTIONS enjekte etmez; FD gönderim kanıtı sink+DB). REAL adımlar izolede
doğrulandı (§9.6: kurtarma 9/9 · preflight 6/6 · zincir 4/4; §9.7: kurulum+preflight-faz 9/9; **§9.9: canlı-bağlı ONLINE
ölçüm + bağımsız kurtarma — setup→online→recover tek API/tek makbuzla izolede uçtan uca**). Ölçüm artık `i12-live-measure`
(disposable prova) DEĞİL, **`i12-live-measure-online`** ile MEVCUT tek API'ye bağlanarak yapılır (adım 5). G5/G7 canlı
sınırları §7.10 + adım 5 notunda SOMUT bildirildi — paket bu sınırları örtmeden "eksiksiz" iddia ETMEZ.

```powershell
# ——— 0) SHA KAPISI (main checkout; canlıya YAZMAZ, salt betik doğrular) ———
$Gov = 'D:\Development\HUKUK_YAZILIMI\project\project\docs\governance'   # owner: main checkout kökü
$Sc  = Join-Path $Gov 'client-live-acceptance-i12-r01\scripts'
$PIN = @{
  "$Sc\i12-live-preflight.js"      = 'B010D38AE1244561EE5AE089C2BDB590182F2BC231A2F24B3425C64609574127'
  "$Sc\i12-live-setup.js"          = '7E1EDC9460CA9A40B261B4A4DA89652EC4E0826AA7EC9A88B6B96AF867FD1458'
  "$Sc\i12-live-window.js"         = 'DDDB4CCA999D715AFA3F0A9AA8E409BB54854370BDAD20C190DB096014BFD1D9'
  "$Sc\i12-window.js"              = 'DB1E5A5A671EE2486D1DB0461FACC2A180E9EA04F310EC10AA531BF926DA08E8'
  "$Sc\i12-live-measure-online.js" = '76F94DC3C5FEEE58F63838A7295F69C5C8A07562AFC0DD0C7FA5F1E08D5DFC80'
  "$Sc\i12-live-recover.js"        = 'D7BAFDEB5E040ABA3C8AC0360B5E174E4E89D432E265C510B4AEF421738CD06B'
  "$Sc\i12-live-identity.js"       = '9516E462CFFD3B22FD253F556A7F1853C6F021B175075449BD7945CCEF36774F'
  "$Sc\i12-live-cron-guard.js"     = '3364686577C803E857BB0D5B188A62ED96DE73B0CDC100A83370FD50148CFFA5'
}
foreach ($f in $PIN.Keys) { $h=(Get-FileHash -Algorithm SHA256 $f).Hash; if ($h -ne $PIN[$f]) { throw "SHA UYUŞMADI: $f (beklenen $($PIN[$f]) bulunan $h)" } }
Write-Host "SHA kapısı GEÇTİ"

# ——— OWNER PLACEHOLDER'LARI (owner doldurur; ham ref/DB URL/parola kanıta/repoya YAZILMAZ) ———
$LiveDbUrl=$env:CLIENT_LIVE_DB_URL; $GoRef=$env:OWNER_GO_REF; $LoginPw=$env:CLIENT_LIVE_LOGIN_PW
$ExpectApi='https://<canlı-api>/api'; $ExpDbHost='<host>'; $ExpDbPort='<port>'; $ExpDbName='<db>'
$RunId='<runId>'; $TenantSlug="ah-$RunId"    # sentetik slug türetilir; owner runId'i verir
$SinkPort='2529'; $EvDir='C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-<ts>'
$EnvFile = 'C:\Development\HUKUK_YAZILIMI\HY_W4_RELEASE23\project\apps\api\.env'
$WindowMinutes = 120                      # pencere üst sınırı — cron çakışma koruması bunu kullanır
$Receipt=Join-Path $EvDir 'i12-setup-receipt.json'; $Rollback=Join-Path $EvDir 'i12-live-window-rollback.json'; $Node='node'
$Repo=(Resolve-Path (Join-Path $Gov '..\..')).Path
$env:AH_DATABASE_URL=$LiveDbUrl; $env:AH_API_BASE_URL=$ExpectApi; $env:AH_LOGIN_PASSWORD=$LoginPw

# ——— ORTAK YARDIMCILAR (GERÇEK kod; yorum/yer tutucu İŞLEM YOK) ———
function Set-EnvKeys {                      # .env anahtarlarını yerinde yazar (varsa değiştirir, yoksa ekler)
  param([Parameter(Mandatory)][string]$Path, [Parameter(Mandatory)][hashtable]$Keys)
  $lines = @(Get-Content -LiteralPath $Path -Encoding UTF8)
  foreach ($k in $Keys.Keys) {
    $idx = -1
    for ($i = 0; $i -lt $lines.Count; $i++) { if ($lines[$i] -match "^\s*$([regex]::Escape($k))\s*=") { $idx = $i; break } }
    if ($idx -ge 0) { $lines[$idx] = "$k=$($Keys[$k])" } else { $lines += "$k=$($Keys[$k])" }
  }
  Set-Content -LiteralPath $Path -Value $lines -Encoding UTF8
}
function Restart-ApiTask {                  # görevi yeniden başlatır (TEK yer — çift restart YOK)
  Stop-ScheduledTask  -TaskName 'HukukPlatform-API'
  Start-ScheduledTask -TaskName 'HukukPlatform-API'
}
function Wait-ApiHealthy {                  # SÜRE-SINIRLI sağlık: /auth/login'e yanıt veren API AYAKTADIR
  param([Parameter(Mandatory)][string]$Base, [int]$TimeoutSec = 120)
  $deadline = (Get-Date).AddSeconds($TimeoutSec)
  while ((Get-Date) -lt $deadline) {
    try { $null = Invoke-WebRequest -Uri "$Base/auth/login" -Method POST -Body '{}' -ContentType 'application/json' -UseBasicParsing -TimeoutSec 10; return $true }
    catch {
      $sc = $null; if ($_.Exception.Response) { $sc = [int]$_.Exception.Response.StatusCode }
      if ($sc -ge 400 -and $sc -lt 500) { return $true }   # 400/401 = API isteği İŞLEDİ → ayakta
    }
    Start-Sleep -Seconds 3
  }
  return $false
}

# ——— 1a) PREFLIGHT --phase pre (İLK YAZMADAN ÖNCE, salt-okuma: GO/ref+tüketim+DB+hedef slug) ———
$env:I12_LIVE_GO_REF=$GoRef; $env:I12_REPO_DIR=$Repo
$env:I12_EXPECT_DB_HOST=$ExpDbHost; $env:I12_EXPECT_DB_PORT=$ExpDbPort; $env:I12_EXPECT_DB_NAME=$ExpDbName
$env:I12_EXPECT_TENANT_SLUG=$TenantSlug; $env:I12_EXPECT_RUNID=$RunId; $env:I12_SETUP_RECEIPT=$Receipt
& $Node "$Sc\i12-live-preflight.js" pre
if ($LASTEXITCODE -ne 0) { throw "PREFLIGHT(pre) REDDETTİ (exit $LASTEXITCODE) — kimlik eksik; KURULUM BAŞLAMAZ" }

# ——— 1a-2) AYLIK CRON ÇAKIŞMA KORUMASI (İLK YAZMADAN ÖNCE; salt-okuma) ———
#   `CLIENT_STATEMENT_MONTHLY_DELIVERY=true` iken GLOBAL aylık cron ('0 3 1 * *' @ Europe/Istanbul) kayıtlıdır.
#   Pencere bu ateşlemeyi kapsarsa sentetik tenant global koşuda süpürülür → G7 aynı-dönem dedupe ölçümü GEÇERSİZ.
#   Çakışma varsa HİÇ BAŞLAMAYIZ (yazma yok, pencere yok) — owner pencereyi ateşlemeden sonraya kaydırır.
$env:I12_WINDOW_MINUTES=$WindowMinutes; $env:I12_ENV_FILE=$EnvFile
& $Node "$Sc\i12-live-cron-guard.js"
if ($LASTEXITCODE -ne 0) { throw "CRON ÇAKIŞMASI (exit $LASTEXITCODE) — pencere aylık teslim ateşlemesini kapsıyor; KURULUM BAŞLAMAZ" }

# ——— 1b…8) İLK YAZMADAN İTİBAREN try/finally: KURTARMA HER SONUÇTA KOŞAR (kurulum yarıda kalsa bile) ———
$EnvBak  = Join-Path $EvDir '.env.pre-window.bak'
$SinkCap = Join-Path $EvDir 'sink-capture'      # sink bu dizine yakalar (I3_SMTP_CAPTURE ile başlatılır)
$PhaseExit = @{}
Copy-Item $EnvFile $EnvBak -Force               # geri-alma yedeği: İLK YAZMADAN ÖNCE alınır
try {
  # ——— 1b) KURULUM = İLK YAZMA (yalnız koşuma ait sentetik tenant + FD zinciri + statement + Office + makbuz) ———
  $env:I12_LIVE_CONFIRM='1'; $env:I12_RUNID=$RunId; $env:I12_EXPECT_DB=$ExpDbName; $env:I12_LIVE_LOGIN_PW=$LoginPw
  & $Node "$Sc\i12-live-setup.js"
  if ($LASTEXITCODE -ne 0) { throw "KURULUM REDDEDİLDİ/başarısız (exit $LASTEXITCODE)" }

  # ——— 2) PREFLIGHT --phase post (makbuz tenant/runId + API↔DB; eksikse PENCERE BAŞLAMAZ) ———
  & $Node "$Sc\i12-live-preflight.js" post
  if ($LASTEXITCODE -ne 0) { throw "PREFLIGHT(post) REDDETTİ (exit $LASTEXITCODE) — makbuz/API↔DB uyuşmaz" }
  $TenantId = (Get-Content $Receipt -Raw | ConvertFrom-Json).tenantId

  # ——— 3) PENCERE-AÇ (yalnız hedef tenant Office SMTP → sink; SIR-KORUYUCU; fail-closed) ———
  $env:I3_SMTP_PORT=$SinkPort; $env:I12_WINDOW_ROLLBACK=$Rollback
  $env:I12_EXPECT_API=$ExpectApi
  & $Node "$Sc\i12-live-window.js" open $TenantId
  if ($LASTEXITCODE -ne 0) { throw "pencere-aç REDDEDİLDİ (exit $LASTEXITCODE; 3=onay/GO, 4=DB/API/yanlış-hedef)" }

  # ——— 4) RESTART-1: pencere env'ini PİNLE (gerçek yazma) + görevi yeniden başlat + SÜRE-SINIRLI sağlık ———
  Set-EnvKeys -Path $EnvFile -Keys @{
    'EMAIL_PROVIDER' = 'smtp'; 'SMTP_HOST' = '127.0.0.1'; 'SMTP_PORT' = $SinkPort
    'CLIENT_STATEMENT_MONTHLY_DELIVERY' = 'true'          # G7 manuel teslim ucu için ZORUNLU
  }
  Restart-ApiTask
  if (-not (Wait-ApiHealthy -Base $ExpectApi -TimeoutSec 120)) { throw "RESTART-1 sonrası API 120 sn'de sağlıklı olmadı" }

  # ——— ÖLÇÜM ORTAK ENV (mevcut ÇALIŞAN API'ye bağlanır; yeni API BOOT EDİLMEZ) ———
  $env:I12_ONLINE_API_BASE=$ExpectApi
  $env:I12_SETUP_RECEIPT=$Receipt; $env:I12_SINK_CAPTURE=$SinkCap; $env:I12_SINK_PORT=$SinkPort

  # ——— 5) FAZ smtp: G1 · G2 · G3 · G6 · G4 · FD-RED · FD-TMO ———
  $env:I12_PHASE='smtp'; $env:I12_EVID_FILE=(Join-Path $EvDir 'evidence-phase-smtp.json')
  & $Node "$Sc\i12-live-measure-online.js"; $PhaseExit['smtp'] = $LASTEXITCODE
  if ($PhaseExit['smtp'] -eq 1 -or $PhaseExit['smtp'] -eq 2) { throw "FAZ smtp: ölçüm DURDU/FAIL (exit $($PhaseExit['smtp']))" }

  # ——— 6) FAZ g7: hedef-scoped MANUEL aylık teslim (dar in-API uç) + aynı-dönem dedupe ———
  #      AYNI makbuz, AYNI API, restart YOK (env değişmiyor). Erişim kapanışı BU FAZDA YAPILMAZ.
  $env:I12_PHASE='g7'; $env:I12_EVID_FILE=(Join-Path $EvDir 'evidence-phase-g7.json')
  & $Node "$Sc\i12-live-measure-online.js"; $PhaseExit['g7'] = $LASTEXITCODE
  if ($PhaseExit['g7'] -eq 1 -or $PhaseExit['g7'] -eq 2) { throw "FAZ g7: ölçüm DURDU/FAIL (exit $($PhaseExit['g7']))" }

  # ——— 7) RESTART-2: allowlist-DIŞI sağlayıcıyı pinle (G5 fazı için) + yeniden başlat + sağlık ———
  Set-EnvKeys -Path $EnvFile -Keys @{ 'EMAIL_PROVIDER' = 'mock' }
  Restart-ApiTask
  if (-not (Wait-ApiHealthy -Base $ExpectApi -TimeoutSec 120)) { throw "RESTART-2 sonrası API 120 sn'de sağlıklı olmadı" }

  # ——— 8) FAZ mock: G5 (allowlist-DIŞI) — AYNI makbuz, AYNI tek API ———
  $env:I12_PHASE='mock'; $env:I12_EVID_FILE=(Join-Path $EvDir 'evidence-phase-mock.json')
  & $Node "$Sc\i12-live-measure-online.js"; $PhaseExit['mock'] = $LASTEXITCODE
  if ($PhaseExit['mock'] -eq 1 -or $PhaseExit['mock'] -eq 2) { throw "FAZ mock: ölçüm DURDU/FAIL (exit $($PhaseExit['mock']))" }
}
finally {
  # ——— 9) KURTARMA + NİHAİ KAPANIŞ — HER SONUÇTA. Adımlar BİRBİRİNİN HATASIYLA ATLANMAZ. ———
  $RecErr = @()
  # (a) env geri-al (TEK restore — çift restart YOK; başarılı yolda da yalnız burada yapılır)
  try { if (Test-Path $EnvBak) { Copy-Item $EnvBak $EnvFile -Force } else { $RecErr += 'ENV_BAK_YOK' } }
  catch { $RecErr += "ENV_RESTORE: $($_.Exception.Message)" }
  # (b) görev yeniden başlat + sağlık — (a) patlasa bile KOŞAR
  try { Restart-ApiTask; if (-not (Wait-ApiHealthy -Base $ExpectApi -TimeoutSec 120)) { $RecErr += 'TASK_HEALTH_TIMEOUT' } }
  catch { $RecErr += "TASK_RESTART: $($_.Exception.Message)" }
  # (c) BAĞIMSIZ KURTARMA: DB kimlik bağı (hedef+yabancı ID/slug/runId) → Office rollback + NİHAİ erişim kapanışı.
  #     (a)/(b) patlasa bile KOŞAR. Makbuz yazılmadıysa hedef runId'den TÜRETİLEN slug ile aranır.
  try {
    $env:I12_WINDOW_ROLLBACK=$Rollback; $env:I12_SETUP_RECEIPT=$Receipt; $env:I12_RECOVER_RUNID=$RunId
    & $Node "$Sc\i12-live-recover.js"
    if ($LASTEXITCODE -ne 0) { $RecErr += "RECOVER exit $LASTEXITCODE (1=Office/erişim doğrulanmadı, 2=hedef yok, 4=KİMLİK BAĞI YOK→sıfır yazma)" }
  } catch { $RecErr += "RECOVER: $($_.Exception.Message)" }
  # (d) kanıt arşivi: faz çıktıları + SHA256 manifesti (korumalı yerel dizin)
  try {
    Get-ChildItem $EvDir -File | Get-FileHash -Algorithm SHA256 |
      ForEach-Object { "$($_.Hash) $(Split-Path $_.Path -Leaf)" } | Set-Content (Join-Path $EvDir 'SHA256-MANIFEST.txt')
  } catch { $RecErr += "EVIDENCE_MANIFEST: $($_.Exception.Message)" }

  Write-Host "FAZ ÇIKIŞLARI: $($PhaseExit.GetEnumerator() | ForEach-Object { "$($_.Key)=$($_.Value)" })"
  if ($RecErr.Count -gt 0) { throw "KURTARMA EKSİK → ESCALATE; İ12 KAPANMAZ: $($RecErr -join ' | ')" }
  # ÖLÇÜLEMEYEN (exit 3) PASS SAYILMAZ: her faz için 0 beklenir; 3 varsa gözlem eksiktir, GO verilmez.
  $Unmeasured = @($PhaseExit.GetEnumerator() | Where-Object { $_.Value -eq 3 } | ForEach-Object { $_.Key })
  if ($Unmeasured.Count -gt 0) { Write-Warning "ÖLÇÜLEMEYEN gözlem içeren faz(lar): $($Unmeasured -join ',') — PASS SAYILMAZ, İ12 kapanmaz." }
}
```

**§7.10 · G7 CANLI TETİK — DAR MEKANİZMA: KARAR (A) ALINDI ve GELİŞTİRİLDİ (yayım ayrı GO'ya bağlı).** Salt-okuma belirlenen mimari (RELEASE23
dist): `client-statement.monthlyDelivery` işi (`runMonthlyDelivery(now, scope={})`) **`scope.tenantId`/`scope.clientId`
DESTEKLER** ama **tek çağıranı** `handleMonthlyCron()` içindeki global `@Cron` (`CLIENT_STATEMENT_MONTHLY_CRON`,
scope'suz → tüm aktif tenant'lar). Merkezî `SchedulerController` manuel-run uçları YALNIZ `run-all|payment-orders|nafaka|
mts|uyap-retry` (`scheduler.service.ts:runManual` switch) — **`client-statement.monthlyDelivery` HİÇBİR HTTP/manuel uca
bağlı DEĞİL**. Sonuç: **mevcut canlı API'de yalnız hedef tenant'a G7 teslimini tetikleyecek ONAYLI dar yol YOKTUR.**
İkinci API açmak / cron-hook enjekte etmek **YASAK** (pinli launcher NODE_OPTIONS enjekte etmez; ikinci canlı-DB API yok).
**OWNER KARARI (2026-09-17): SEÇENEK (A).** Dar, kimlik-doğrulamalı ve yetkilendirilmiş manuel aylık teslim yolu
**AYRI ÜRÜN PR'INDA** geliştirildi:

- **Uç:** `POST /api/client-statements/monthly-delivery/run-now` (`ClientStatementController`), `AuthGuard('jwt')`.
- **Yetki — MEVCUT model, yeni politika İCAT EDİLMEDİ:** `decideManualSchedulerRun` (F02 owner kararı) aynen
  kullanılır → VIEWER **DENY**; elevated = `OfficeApprovalService.isApproverEligible` (PARTNER veya
  `canApproveOfficeActions`); **`UserRole.ADMIN` TEK BAŞINA YETMEZ**. Karar hiçbir yazma yapılmadan ÖNCE verilir.
- **KAPSAM aktörden TÜRETİLİR:** `runMonthlyDelivery(new Date(), { tenantId: req.user.tenantId })`. Gövde/query/param'dan
  tenant veya kapsam **OKUNMAZ** → başka tenant'a geçiş İMKÂNSIZ. **`tenantId` boşsa fail-closed DENY** (`NO_ACTOR`):
  aksi halde `scope.tenantId` undefined kalır ve ürün kodu **tüm aktif tenant'lara** düşerdi — kapsam sızıntısının tek
  yolu buydu, kapatıldı. **Boş kapsam (`{}`) ASLA çağrılmaz.**
- **Yeni gönderim yeteneği AÇMAZ:** `runMonthlyDelivery` kendi `isEnabled()` kapısını korur —
  `CLIENT_STATEMENT_MONTHLY_DELIVERY` açık değilse tek sorgu bile çalışmadan `enabled:false` döner. Yerleşik global
  cron davranışı ve takvimi **DEĞİŞMEZ**.
- **İzole testler:** `client-statement-monthly-delivery-manual.controller.spec.ts` — yetkili aktör yalnız kendi tenant
  kapsamıyla koşar · gövdedeki başka tenant ETKİSİZ · VIEWER 403 · elevated olmayan USER/ADMIN 403 · tenantId/userId
  yoksa 403 ve **koşu HİÇ çağrılmaz**.
- **Yayın adayına etkisi ve GEREKLİ YAYIN ADIMI:** Bu yeni HTTP route **yalnız yeni bir yayın (release) ile canlıya
  ulaşır**; canlıdaki RELEASE23 dist'inde YOKTUR. Dolayısıyla G7 fazı **yayım yapılana kadar** canlıda `404` alır ve
  `i12-live-measure-online` bunu **UNMEASURED** yazar (sessiz PASS YOK). Gerekli adım: ürün PR'ı main'e alındıktan
  sonra **yeni aday derleme + cutover** (ayrı owner GO'su); İ12 canlı kabulünün G7 ayağı bu yayıma BAĞLIDIR.
  **Bu belge yayın GO'su DEĞİLDİR; canlıya yayınlama yapılmadı.**

(B) "G7 disposable-only" ve (C) "doğal global cron" seçenekleri owner tarafından seçilmedi; (C) zaten global/scope'suz
olduğu için gerçek tenant'lara dokunurdu → kontrollü kabul için UYGUN DEĞİLDİ.

**§7.9 — TÜM ADIMLAR GERÇEK + İZOLEDE DOĞRULANDI (sahte komut/disposable ad YOK):** SHA kapısı · PREFLIGHT-pre/post
(`i12-live-preflight`, §9.7 9/9) · KURULUM (`i12-live-setup`, §9.7/§9.9) · PENCERE-AÇ/KAPAT (`i12-live-window` + hardened
`i12-window`; §9.6 kurtarma 9/9 · zincir 4/4) · RESTART (`HukukPlatform-API` görev + `.env` yedek/pin/geri-al) · **ÖLÇÜM
(`i12-live-measure-online` — MEVCUT tek API'ye bağlı; §9.9: G1/G2/G3/G4/G6/FD-RED/FD-TMO PASS + ayrı sayaçlar; G5/G7
UNMEASURED-somut)** · **KURTARMA (`i12-live-recover`, try/finally, §9.9: happy-path ok + fail-closed exit 4/2/1/3)**.
**FD sayaç ayrımı — AYRI raporlanır:** sendCall(conn) · delivery(msg, alıcı-scoped) · dbRecord(audit/DB). Eşit delta
HER DURUMDA denklik SAYILMAZ: FD-RED/FD-TMO'da **sendCall+1 ≠ delivery+0** (çağrı var, teslim yok) — ayrımın kanıtı.
**i3-spy CANLIDA YOK**; conn'un send-çağrısını sadık saydığının kesin kanıtı DISPOSABLE harness'tedir (§9.8 FD-COUNT-XCHECK,
her FD gözleminde conn-delta == i3-spy dispatcherSend-delta) — canlı ONLINE ölçüm bunu VARSAYMAZ, ayrı raporlar.

> **NOT — CANLI KABUL BAŞLAMADI.** Betikler ve tam yürütme sırası izolede doğrulandı; **canlı yürütme yapılmadı**.
> Canlı kabul ayrı yazılı owner GO'su + owner'ın yükseltilmiş komutuyla yapılır (§7.0). Disposable G-0 KALDIRILMAZ;
> ölçüm harness'ı canlıda (non-G-0) kendi canlı-güvenlik kapısıyla (I12_LIVE_CONFIRM + GO ref) koşar, pinli launcher
> DEĞİŞTİRİLMEZ (i3-spy yok → conn-*/msg-*/DB), 2. canlı-DB API açılmaz.

**Not (teslim yolu sır çözme):** G7 teslimi `getFullSmtpSettings` ile `smtpPass`'i OKUR/ÇÖZER. `enc:v1:` şifreli
değerler için canlı API sürecinde `CREDENTIAL_ENCRYPTION_KEY` **zaten vardır** (üretim). Pencere `smtpPass`'e
DOKUNMADIĞINDAN bu çözme etkilenmez; sink AUTH ilan etmediğinden gerçek kimlik bilgisi sink'e gitmez (izolede
legacy düz-metin ile 4/4 birleşik zincir doğrulandı, §9.4).

## 8. Hazırlık durumu (bu belge)

- İ12 kapsam/bağımlılık/ölçüt kaynaklarıyla çıkarıldı (§1); mevcut ürün/test farkı belirlendi (§2); yeniden açma yok.
- Düzenek İ3'ten yeniden kullanılır; yeni kollar (`i12-fd-outcome`, `i12-monthly`) + orkestratör tanımlı (§3).
- **PROVA:** izole/geçici ortamda koşuldu; sonuçlar §9 (R01 yedi gözlem) + §9.2 (R02 claim/reclaim/hang) + §9.3 (R03
  cron teslim içeriği) + **§9.4 (R04 cron teslim + HEDEF-SCOPED kapsam izolasyonu, güçlendirilmiş; + SIR-KORUYUCU
  pencere/kurtarma: `i12-window.js` prova + AYRI canlı `i12-live-window.js`)** + **R04c (canlı-giriş kapıları
  GO-ref/DB-API kimliği/sentetik-tenant-slug + ikinci-open özgün-koruma + 3-alan close + ikinci-close güvenli;
  izolede pencere/kapı **20/20** + birleşik zincir **4/4**)**. Ürün kusuru çıkmadı (yalnız bir **bayat yorum** ayrıldı,
  §2; ayrıca §7.2'de belgelenen iki ayrı SMTP kaynağı — env vs Office DB — bir yapılandırma gerçeğidir, kusur değil).
- **Canlı yürütme hazırlığı:** **AYRI canlı giriş noktası** `i12-live-window.js` (kapılar: `I12_LIVE_CONFIRM` +
  `I12_LIVE_GO_REF` + `I12_EXPECT_DB`/`I12_EXPECT_API` + `I12_EXPECT_TENANT_SLUG`; SIR-KORUYUCU) + prova
  `i12-window.js` (rollback sınıflandırma + kurtarma sağlamlığı, §9.6) + **canlı preflight** `i12-live-preflight.js`
  (`--phase pre/post`, §9.7) + **canlı kurulum** `i12-live-setup.js` (§9.7); **G-0 owner yetkisiyle AŞILMAZ** (§7.3).
  + **canlı ölçüm (ONLINE)** `i12-live-measure-online.js` — MEVCUT tek API'ye bağlanır (setupI3/boot/hook/port-kill YOK);
  makbuz tenant/runId/aktörlerini kullanır; sayaçlar AYRI (sendCall/delivery/dbRecord) (§9.9). `i12-live-measure.js` ise
  **DISPOSABLE prova** olarak yeniden sınıflandı (G-0 EN BAŞTA; §7.9 canlı dizisinden ÇIKARILDI). + **bağımsız kurtarma**
  `i12-live-recover.js` (Office rollback + erişim kapanışı; §7.9 try/finally, HER SONUÇTA; §9.9). §7.3 tam yol + SHA256;
  §7.9 gerçek PowerShell (SHA kapısı/preflight-pre/kurulum/preflight-post/pencere/restart-görev/**online-ölçüm**/kurtarma).
  **PAKET DURUMU:** yedi gözlem (G1/G2/G3/G4/G6/FD-RED/FD-TMO) mevcut API'ye bağlı ONLINE ölçümle izolede doğrulandı
  (§9.9); **G5 ve G7 artık AYRI FAZLARDA, AYNI makbuz ve AYNI tek API üzerinde ölçülür** (§9.10) — G5 PASS,
  **G7 PASS** (owner kararı (A): dar in-API manuel teslim ucu AYRI ürün PR'ında geliştirildi; hedef-scoped, yabancı
  tenant +0, dedupe +0). **Tek kalan bağımlılık: G7 ucu canlıya ancak YENİ YAYIN ile ulaşır** (§7.10) — yayım ayrı owner
  GO'sudur; yayım öncesi canlıda uç `404` verir ve G7 **UNMEASURED** yazılır (sessiz PASS YOK). Kurtarma artık İLK
  YAZMADAN itibaren kapsar, her yazmadan önce DB kimlik bağını doğrular ve yanlış kimlikte SIFIR YAZMA yapar (§9.10).
  Kanıt zinciri §9.1–§9.10 (R01 7 gözlem · R02 · R03 · R04 hedef-scoped · R04b SIR · R04c gate/pencere · R04d
  kurtarma 9/9 · R04e kurulum+preflight 9/9 · R04f disposable ölçüm 12/12 · R04g online-ölçüm + bağımsız kurtarma ·
  **R04h fazlı G5+G7 · kimlik bağı · sıfır yazma · ara-adım kurtarma**).
  **CANLI YÜRÜTME YAPILMADI** — ayrı yazılı owner GO'su (§7) + owner'ın yükseltilmiş komutuyla; disposable G-0 aşılmaz,
  pinli launcher değişmez, 2. canlı-DB API açılmaz, cron-hook enjekte edilmez.

## 9. PROVA SONUÇLARI (izole/geçici ortam — CANLI KABUL DEĞİL)

**Ortam (2026-09-14):** disposable Postgres `127.0.0.1:5439/hukuk_fix1_test` (docker, 130 migration uygulandı) ·
disposable Redis `127.0.0.1:6390` (canlı 6379'dan AYRI) · RELEASE23 dist **salt-okuma** (`HY_W4_RELEASE23/.../dist`,
değiştirilmedi) · SMTP → loopback sink (127.0.0.1). Canlı DB/Redis/`.env`/scheduler'a **YAZILMADI**. İzolasyon ön
koşulu (loopback + LAN erişilmez + provider=smtp→sink + pid + çalışma-zamanı tanığı) her koşumda doğrulandı.
Gerçek `dispatcher.send` `i3-spy` ile (ürün kodu değişmez) sayıldı; **gerçek alıcıya bayt gitmedi** (alıcı `.invalid`).

| Gözlem | Sonuç | Kanıt (gerçek çıktı) |
|---|---|---|
| **G1/G2 · A-9/A-10** (bilgi talebi red/belirsiz) | **PASS** | İ3-GREEN yeniden kullanım: `i3-run` (RELEASE23-retarget) H5 kolu — reject→`EMAIL_FAILED` kayıt yok · reset→`EMAIL_INDETERMINATE` kayıt yok + `conn-*` farkıyla TEK deneme (ikinci çağrı yok) |
| **G3 · CANARY** | **PASS** | `i12-gaps` (runId 0c6b7c77): PUBLISHED + `providerMessageId` + runId-kapsamlı SENT=+1/PUBLISHED=+1 + duplicate=0 + gerçek send=+1 |
| **G4 · dedupe/reclaim** | **PASS** | ikinci yayın 4xx state-guard (`STATUS_INVALID`) · gerçek send **+0** · yeni audit **+0/+0** · durum PUBLISHED kalır (beklenen çağrı/kayıt sayıları ayrı) |
| **G5 · allowlist-DIŞI** | **PASS** | `i12-allowlist` (runId 3deb5d69, mock instance): 403 `PROVIDER_NOT_PRODUCTION` · PUBLISHED değil · `providerMessageId` yok · gerçek send **+0** (tek byte gitmez) |
| **G6 · SENT/PUBLISHED ayrımı** | **PASS** | `i12-gaps`: SENT +1 ile PUBLISHED +1 AYRI aksiyon (biri diğerinin yerine geçmez) |
| **G7 · aylık cron** | **PASS (3 AYRI ölçüm)** | `i12-cron-run` (runId 1cb94efa): (a) predicate env=true→kayıtlı, ifade `0 3 1 * *` (kapalıyken kayıt yok) · (b) `runMonthlyDelivery` doğrudan çağrı, scope onurlandı (scanned=1/generated=1, periodKey 2026-08) · (c) SchedulerRegistry cron job `fireOnTick` ile GERÇEKTEN tetiklendi |
| **FD-RED/FD-TMO** (FD publish red/timeout) | **PASS** | `i12-gaps`: reject(550)→SEND_FAILED, PUBLISHED değil, gerçek send=1, PUBLISHED audit +0 · reset(ECONNRESET)→SEND_FAILED, gerçek send=1 (**ikinci çağrı YOK**, kör tekrar +2 değil) |
| **Erişim kapanışı** | **PASS** | her koşumda (I12-V/I12-V5/I3-V) çıkış kodundan bağımsız test hesapları pasif + tokenVersion++ |

**Cron tetikleme hızlandırması (açık kayıt):** G7(c)'de üretim takvimi (`0 3 1 * *`) BEKLENMEDİ; SchedulerRegistry'deki
cron job `fireOnTick()` ile in-process tetiklendi (`i12-cron-hook.js`, ürün kodu değişmez). **Bu, canlı takvimin
kanıtı DEĞİLDİR** — yalnız zamanlayıcının kayıtlı job'u gerçekten çalıştırdığının kanıtıdır. Canlı kanıt yöntemi §7'de.

**Ölçülemeyen / kapsam dışı bırakılan (uzlaştırılmış):** İzole prova KAPSAMI içinde ölçülemeyen (UNMEASURED sayılıp
PASS'a çevrilen) gözlem **yoktur** — yedi gözlem + R02 (claim/reclaim/hang) + R03 cron teslim içeriği gerçek çıktıyla
ölçüldü. Bu ifade, aşağıdaki **açık kapsam-sınırlarıyla çelişmez** (bunlar "ölçülemeyen PASS" değil, tasarımca
prova-dışı bırakılan **canlı-boyut** sınırlarıdır):
> - **Canlı takvim gerçek tetiği** (`0 3 1 * *` üretim zamanında kendiliğinden): provada BEKLENMEDİ; yalnız
>   hızlandırılmış tetik (fireOnTick/kısa-takvim) ölçüldü — **canlı takvim kanıtı SAYILMAZ**, canlı §7'de kanıtlanır.
> - **HANG "gecikmeli/kör gönderim yok"**: 20 sn gözlem penceresiyle **sınırlı** (kaynak tek-denemeli olduğu için
>   penceresi dışı otomatik yeniden gönderim mekanizması yoktur — §9.2).
> - **Gerçek alıcıya gönderim**: tasarımca YOK (loopback sink + `.invalid` + allowlist).

**Prova kanıtı ≠ canlı kabul kanıtı** — İ12 KAPANMADI; sayaç **11/17**, hizmet **0/8 tam**. Canlı kabul ayrı owner
GO'su (§7) ister.

**Scriptler (bu paket):** `scripts/i12-gaps.js` (G3/G4/G6/FD-RED/FD-TMO) · `scripts/i12-gaps2.js` (claim/reclaim/hang) ·
`scripts/i12-cron-hook.js` + `scripts/i12-cron-run.js` (G7 a/b/c/d) · `scripts/i12-cron-delivery.js` (G7-DELIV teslim
içeriği + dedupe, R03) · `scripts/i12-allowlist.js` (G5). İ3 düzeneği (`i3-lib`/`i3-start-api`/`i3-sink`/`i3-spy`/
`i3-h5-intake`) yeniden kullanıldı; RELEASE23'e env override ile yönlendirildi. Ref literali/`.env` değeri/sır
scriptlerde YOK.

### 9.2 R02 — açık ölçüm tamamlamaları (gerçek çıktı; CANLI KABUL DEĞİL)

| Ölçüm | Sonuç | Kanıt |
|---|---|---|
| **CLAIM** (gerçek dispatcher claim) | **PASS** | `i12-gaps2`: eşzamanlı iki `/publish` → biri **201 PUBLISHED**, diğeri **409 `DISCLOSURE_PUBLICATION_SEND_ALREADY_CLAIMED`** · gerçek `dispatcher.send` **TAM 1** (çift gönderim YOK) |
| **RECLAIM** (reddi sonrası) | **PASS** | reddi (`SEND_FAILED`, send+1) → **`POST /retry-publication`** (`retrySend`: SEND_FAILED→SEND_PENDING) + sink kabul → **PUBLISHED** + providerMessageId (send+1). Reclaim ürünün kendi yolu; kör tekrar değil |
| **HANG** (yanıtsız → timeout) | **PASS** | sink `hang` → **nodemailer greeting-timeout ~30 sn** (`30048ms` ölçüldü; kaynakta explicit timeout yok=default) → INDETERMINATE→`SEND_FAILED`; **ardından 20 sn gözlem penceresi + sink kabul** → gerçek send **delta 0**, PUBLISHED değil, providerMessageId yok, kayıt yok. **İddia sınırı:** "gecikmeli/kör gönderim yok" **20 sn'lik gözlem penceresiyle sınırlıdır** (sınırsız değil). Kaynak-gerekçesi: gönderim yolu **tek denemeli** — `email-provider.service` SMTP kolu tek `transporter.sendMail` çağrısı yapar (döngü/otomatik yeniden-deneme yok), SES kolu `maxAttempts:1`; `classifyTransportError` ETIMEDOUT→INDETERMINATE ve FD servisi INDETERMINATE'de kör tekrar yapmaz → penceresi içinde ikinci `dispatcher.send` gözlenmedi ve kaynak yolunda otomatik yeniden gönderim mekanizması yoktur |
| **G7d** kısa-takvim OTONOM tetik | **PASS** | `i12-cron-run`: hook 2s cron (`*/2 * * * * *`) SchedulerRegistry'ye ekler → **zamanlayıcı KENDİLİĞİNDEN ≥2 kez tetikler** (fireOnTick DEĞİL); her tetik `runMonthlyDelivery` koşar; aynı dönem tekrarında ek TESLİM yok |

**Cron teslim içeriği NOTU (R02→R03 güncel):** R02'de disposable ortamda test client'ının **dönem aktivitesi yoktu**
→ statement `SKIPPED_EMPTY_PERIOD` → teslim/ledger markSent gözlenmemişti (yalnız cron **wiring**'i: predicate +
doğrudan çağrı + otonom tetik). **R03'te bu boşluk KAPATILDI** (§9.3): doğru döneme ait sentetik aktivite +
Office SMTP satırı + STATEMENT_READY şablonu ile teslim **içeriği** (gerçek gönderim, ledger `markSent`, bildirim,
aynı-dönem-dedupe) izole provada gerçek çıktıyla ölçüldü. Repo jest testi `client-statement-monthly-c3b04.spec.ts`
(B04-8/10/13/15) ek kanıt olarak kalır.

### 9.3 R03 — cron TESLİM provası (gerçek gönderim + ledger markSent + aynı-dönem-dedupe; CANLI KABUL DEĞİL)

R03, R02'de açık kalan tek ölçümü — aylık cron'un teslim **içeriğini** — izole disposable ortamda tamamladı. Fikstür:
hedef tenant caseClient rolü `ALACAKLI` (ELIGIBLE) + önceki aya (postedAt `2026-08-15`) ait **POSTED** `CollectionDisposition`
+ `CLIENT_PAYABLE` satır (statement line üretir) + per-tenant `MessageTemplate` (`STATEMENT_READY`/`EMAIL`, isActive) +
**Office SMTP satırı** (`getFullSmtpSettings`; `smtpHost=127.0.0.1`, `smtpPort=<sink>`, düz-metin pass — bu yol env
SMTP'yi DEĞİL Office DB satırını okur, §7.2). Tetik: `i12-cron-hook.js` kısa-takvim (`*/2 * * * * *`) → zamanlayıcı
**kendiliğinden ≥2 kez** tetikler (fireOnTick DEĞİL). API izole 6390 Redis'e bağlandı (canlı 6379'dan AYRI).

R03 teslim **içeriğinin çalıştığını** (gerçek gönderim + ledger `markSent` + bildirim + aynı-dönem-dedupe)
kanıtladı; ancak scope izolasyonunu **boş-scope otonom tetik + aktivitesiz yabancı tenant** ile ölçtü — bu ZAYIF bir
kanıttır (yabancı tenant zaten teslim ALMAZDI). **R04 (§9.4) bu hükmü DÜZELTİR ve YERİNE GEÇER.**

**R03 durable kanıt:** `…\Documents\CLIENT-EVIDENCE-20260911\i12-cron-delivery-<ts>\` (manifest sha `4CCC306F…`) —
teslim içeriğinin çalıştığının ilk kanıtı; scope hükmü R04 ile güncellenmiştir.

### 9.4 R04 — cron TESLİM + KAPSAM İZOLASYONU (güçlendirilmiş; hedef-scoped; CANLI KABUL DEĞİL)

Owner (2026-09-15) scope hükmünü güçlendirmeyi istedi: yabancı tenant da **TAM teslim-uygun** olsun (dönem
aktivitesi + alıcı + şablon + Office SMTP), tetik **hedef-tenant-scoped** olsun (boş-scope DEĞİL), toplam sink
trafiği de kontrol edilsin, bildirim mükerrerliği **kesin sayı** ile ölçülsün. Fikstür: HEDEF (T) ve YABANCI (F)
tenant'ların **İKİSİ de** ALACAKLI caseClient + önceki-ay POSTED disposition/CLIENT_PAYABLE + STATEMENT_READY şablonu +
Office SMTP→sink + ayrık alıcı (`deliv-target-<runId>` / `deliv-foreign-<runId>`). Tetik: **`runMonthlyDelivery(now, {tenantId: T})`**
(hook `direct <T>` yolu; boş-scope KULLANILMADI). API izole 6390 Redis'e bağlandı.

| Ölçüm | Sonuç | Kanıt (gerçek çıktı) |
|---|---|---|
| **G7-DELIV-SCOPE** hedef-scoped teslim + kapsam | **PASS** | `i12-cron-delivery.js` (runId 1803d2ae): HEDEF **sink +1 · ledger SENT +1 (`markSent`) · bildirim SENT +1** (KESİN) · **TAM teslim-uygun YABANCI tenant: sink +0 · ledger +0 · bildirim +0** · **TOPLAM sink deltası = 1** (= hedef; hedef-dışı mesaj YOK — fazlası FAIL olurdu) · `delivered=1` |
| **G7-DEDUPE** aynı dönem 2. tamamlanmış tetik | **PASS** | ikinci **hedef-scoped** `direct <T>` (tamamlanmış): HEDEF sink +0 · ledger SENT +0 · bildirim SENT +0 · YABANCI +0 · TOPLAM sink +0 · `delivered=0` (ledger SENT→SKIP `already-sent`, bildirim `dedupeKey`) |

**Düzeltilen kapsam yöntemi:** kanıt artık "yabancı aktivitesiz → SKIP" zayıf hükmüne değil, **TAM teslim-uygun bir
yabancı tenant'ın hedef-scoped çağrıda teslim ALMAMASINA** dayanır; toplam sink trafiği hedefe eşit (hedef-dışı sıfır).
Canlı kabulde bu yüzden **boş-scope/all-tenant tetik kullanılmaz**; yalnız sentetik hedef tenant'a scope'lu çağrı (§7.5/7.7).

**Canlı pencere/kurtarma — AYRI giriş noktası + SIR-KORUMA (R04b→R04c):** `i12-window.js` (prova/G-0) ve AYRI canlı
giriş noktası `i12-live-window.js` **SIR-KORUYUCU**dur (yalnız `smtpHost`/`smtpPort`/`smtpSecure`; `smtpUser`/`smtpPass`
okunmaz/yazılmaz/rollback'e konmaz). R04b temel kapı (I12_LIVE_CONFIRM) + sır-koruma; **R04c (§9.5)** kapıları ve
sağlamlığı tamamlar. G-0 owner yetkisiyle **aşılmaz** — canlı yol ayrı, açıkça onaylı betiktir (§7.3).

**R04 durable kanıt:** `…\Documents\CLIENT-EVIDENCE-20260911\i12-cron-scope-<ts>\` — `i12-cron-delivery-evidence.json`
(G7-DELIV-SCOPE + G7-DEDUPE PASS) · `cron-scope-last-result.json` · `api-delivery-excerpt.log` + SHA256 manifesti.
Sentetik; sır/ref/.env yok.

### 9.5 R04c — canlı-giriş kapıları + pencere sağlamlığı + birleşik zincir (CANLI KABUL DEĞİL)

Owner (2026-09-16/17, D: kökü) canlı girişin kapılarını ve pencere sağlamlığını istedi. Eklenen/ölçülen:
> - **Canlı-giriş kapıları** (`i12-live-window.js`, fail-closed): `I12_LIVE_CONFIRM`, **`I12_LIVE_GO_REF`** (owner GO
>   ref DOLU; ham değer yazılmaz), **`I12_EXPECT_DB`** (bağlı DB adıyla eşleşme) + **`I12_EXPECT_API`** (kimlik beyanı),
>   **`I12_EXPECT_TENANT_SLUG`** (koşuma ait sentetik tenant sınırı → **yanlış hedef reddi**).
> - **Pencere sağlamlığı** (tek kaynak `runWindow`): **ikinci open özgün yedeği KORUR** (sink'i özgün sanmaz);
>   **close değişen 3 alanın (host/port/secure) TAMAMINI doğrular**; **ikinci close güvenlidir** (updateMany/deleteMany
>   + rollback yoksa idempotent).

| Ölçüm | Sonuç | Kanıt (gerçek çıktı) |
|---|---|---|
| **Pencere + kapı zinciri** (`verify-r04c`) | **PASS 20/20** | `[win]` 1.open reopen=false · rollback özgün 3-alan · **2.open reopen=true + originalPreserved (sink DEĞİL)** · rollback'te SIR YOK · **close 3-alan doğrulama TAMAM** · SIR değişmedi · **2.close GÜVENLİ (idempotent)** · B DOKUNULMADI · `[live]` confirm YOK→exit3 · GO-ref YOK→exit3 · yanlış DB→exit4 · API-beyanı YOK→exit4 · **YANLIŞ HEDEF (slug)→exit4** · reddedilenler A'yı değiştirmedi · tüm kapılar OK→open sır-koruyucu · 2.open özgün korundu · close 3-alan+SIR · 2.close güvenli |
| **Birleşik zincir** (`verify-chain`) | **PASS 4/4** | kurulum(gerçek-benzeri TLS gmail Office) → **pencere-aç** (Office→sink, secretsUntouched) → **ölçüm: pencere ile yönlendirilen Office üzerinden GERÇEK teslim** (sink=1, ledger SENT+1) → **pencere-kapat** (3 alan gmail'e geri) → SIR baştan sona değişmedi |

**Not:** teslim `smtpPass`'i `getFullSmtpSettings` ile çözer; `enc:v1:` değerler canlıda `CREDENTIAL_ENCRYPTION_KEY`
ile çözülür (üretimde var), pencere pass'e dokunmaz — izole zincir legacy düz-metinle doğrulandı. §7.9 gerçek
tam-yol+SHA kontrollü **PowerShell** bloklarını taşır (eski "..." / "şu desenle" anlatımı kaldırıldı).

**R04c durable kanıt:** `…\Documents\CLIENT-EVIDENCE-20260911\i12-r04c-<ts>\` — `verify-r04c.txt` (20/20) ·
`verify-chain.txt` (4/4) + SHA256 manifesti. İzole disposable (D: worktree; RELEASE23 dist/evidence C:'de);
sır/ref/.env yok.

### 9.6 R04d — kurtarma sağlamlığı + canlı preflight + gerçek §7.9 + EKSİK bildirimi (CANLI KABUL DEĞİL)

Owner (2026-09-17, D: worktree) üç somut eksik. Sonuç: kurtarma + preflight KAPATILDI ve izolede doğrulandı;
§7.9 gerçek komutlara çevrildi; **KURULUM + ÖLÇÜM live-safe betikleri EKSİK olarak SOMUT bildirildi** → paket
"eksiksiz" DEĞİL, İ12 HAZIR İLAN EDİLMEZ.

| Ölçüm | Sonuç | Kanıt (gerçek çıktı) |
|---|---|---|
| **1 · Kurtarma sağlamlığı** (`verify-recovery`) | **PASS 9/9** | close: normal→verifiedClosed+3-alan · 2.close idempotent(alreadyClosed) · 2.open özgün-korundu · **NO_ROLLBACK→ok:false (PASS/alreadyClosed VERİLMEDİ)** · **CORRUPT→reddedildi, yazma yok, dosya korundu** · **UNREADABLE(dizin)→reddedildi** · **MISMATCH→Y yazılmadı, yedek A'da** · **open FOREIGN→A yedeği üzerine yazılmadı** · open CORRUPT→A değişmedi. Her hata durumu AYRI sınıflandı |
| **2 · Canlı preflight** (`verify-preflight`) | **PASS 6/6** | tümü-iyi→PASS (4 kapı + ref: format+tüketim, DB host/port/ad, makbuz tenant/runId, API↔DB `/api` login) · yanlış DB adı→exit5 · yanlış DB portu→exit5 · tüketilmiş ref (repoda literal)→UNCONSUMED · bozuk ref biçimi→FORMAT · makbuz slug uyuşmazlığı→SETUP_RECEIPT. **Eksik kimlikte YAZMA BAŞLAMAZ** |
| **3 · Tam zincir** (`verify-chain`, değişen pencere) | **PASS 4/4** | pencere-aç(sink,secretsUntouched) → pencere ile yönlendirilen Office üzerinden GERÇEK teslim (sink=1, ledger SENT+1) → pencere-kapat verifiedClosed+3-alan özgün → SIR değişmedi |

**Canlı launcher (salt-okuma belirlendi):** görev `HukukPlatform-API` (Running); launcher `C:\Ops\hukuk\bin\start-api.ps1`
sha `CC634BBF…`; env `.env`/dotenv; API prefix `/api`. Restart = `.env` T-pencere pin + `Stop/Start-ScheduledTask
HukukPlatform-API`. **i3-spy canlıya enjekte EDİLMEZ** (pinli launcher NODE_OPTIONS geçirmez) → FD gönderim kanıtı sink+DB.

**EKSİK (owner'a somut bildirim; HAZIR İLAN EDİLMEZ):** (a) `i12-live-setup.js` (live-safe kurulum + makbuz) YOK;
(b) live-safe 7-gözlem canlı ÖLÇÜM harness'ı YOK. Disposable G-0 betikleri canlı komut sayılamaz; bu iki adım için
sahte komut/disposable ad KULLANILMADI. Paket bu iki betik yazılıp izolede doğrulanana dek **eksiksiz değildir**.

**R04d durable kanıt:** `…\Documents\CLIENT-EVIDENCE-20260911\i12-r04d-<ts>\` — `verify-recovery.txt` (9/9) ·
`verify-preflight.txt` (6/6) · `verify-chain.txt` (4/4) + SHA256 manifesti. İzole disposable (D: worktree;
RELEASE23 dist/evidence C:'de); sır/ref/.env yok.

### 9.7 R04e — canlı KURULUM + preflight FAZ-AYRIMI + doğru kontrol sırası (CANLI KABUL DEĞİL)

Owner (2026-09-17) kalan hazırlık: `i12-live-setup.js` + kontrollerin doğru sıraya bağlanması. Eklenen:
> - **`i12-live-setup.js`** (YENİ, live-safe): setupI3 + setupDisclosureChain + statement aktivitesi + Office +
>   makbuz; canlı-güvenlik kapısı (I12_LIVE_CONFIRM + GO ref + I12_EXPECT_DB=bağlı DB + I12_EXPECT_TENANT_SLUG=türetilen
>   `ah-<runId>`); yalnız koşuma ait sentetik tenant'a yazar; **sır makbuza konmaz** (login parolası env).
> - **preflight `--phase pre|post`**: **pre** = kurulum ÖNCESİ GO/ref+tüketim+DB+hedef slug (makbuz ARANMAZ →
>   makbuzu isteyen kontrol ilk kurulum yazmasının ön koşulu değildir); **post** = pencere/ölçüm ÖNCESİ makbuz
>   tenant/runId + API↔DB. Doğru sıra: **preflight pre → sentetik kurulum → makbuz → preflight post → pencere/ölçüm**.

| Ölçüm | Sonuç | Kanıt (gerçek çıktı) |
|---|---|---|
| **Kurulum + preflight faz** (`verify-setup-preflight`) | **PASS 9/9** | setup gate: confirm YOK→exit3 · GO-ref YOK→exit3 · yanlış DB→exit4 · **slug≠türetilen→exit4** · gate-iyi→tenant+POSTED disp+şablon+office+**makbuz (runId+loginEmail, PAROLA YOK)** · **preflight pre**: ref+DB+slug PASS, **makbuz ARANMADI** · **preflight post**: makbuz+API↔DB PASS · pre yanlış-DB→exit5 |

**AÇIK EKSİK (somut; İ12 HAZIR DEĞİL):** live-safe 7-gözlem **ÖLÇÜM** harness'ı (`i12-live-measure`) henüz yazılmadı
(§7.9 adım 5; runH5+FD-conn/DB+G5+G7 kompozisyonu). Disposable G-0 betikleri canlı komut sayılamaz; sahte komut
KULLANILMADI. Bu harness yazılıp izolede (FD conn-*==i3-spy çapraz-doğrulama dahil) 7/7 doğrulanana dek paket eksiksiz değildir.

**R04e durable kanıt:** `…\Documents\CLIENT-EVIDENCE-20260911\i12-r04e-<ts>\` — `verify-setup-preflight.txt` (9/9)
+ SHA256 manifesti. İzole disposable (D: worktree; RELEASE23 dist/evidence C:'de); sır/ref/.env yok.

### 9.8 R04f — DISPOSABLE ÖLÇÜM PROVASI (7 gözlem) + FD sayaç ayrımı ispatı (CANLI DEĞİL)

> **R04g SINIFLANDIRMA:** `i12-live-measure.js` DISPOSABLE provadır (self-contained: setupI3 + i3-spy/cron-hook boot +
> port-kill + cron-hook G7 enjeksiyonu) — canlıda geçersizdir ve **§7.9 canlı dizisinden ÇIKARILDI** (G-0 EN BAŞTA).
> Aşağıdaki 12/12 yalnız **disposable davranışı** belgeler (G5/G7 dahil). Canlı ölçüm §9.9 (`i12-live-measure-online`).

Owner (2026-09-17) parça: `i12-live-measure.js`. Kendi kendine yeten (gated setup + izolasyon ön koşulu +
7 gözlem + G5 mock-reboot + G7 cron-hook + kapanış), tek disposable API'ye karşı; FD gönderim kanıtı **sink+DB**,
i3-spy ile ÇAPRAZ-DOĞRULANIR. İzole koşum **PASS 12/12 · FAIL 0 · UNMEASURED 0** (RELEASE23 dist):

| Gözlem | Sonuç | Kanıt (gerçek çıktı) |
|---|---|---|
| **H5-00-ISO** | PASS | loopback erişilir · LAN erişilmez · provider=smtp (çalışma-zamanı tanığı) — sonda dahil gönderim ancak bununla |
| **G1 (A-9)** | PASS | HTTP 503 · `CLIENT_INFO_REQUEST_EMAIL_FAILED` · `ClientInfoRequest` +0 · conn +1 (tek) |
| **G2 (A-10)** | PASS | HTTP 503 · `CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE` · kayıt +0 · conn +1 (tek, kör tekrar YOK) |
| **G3 (CANARY)** | PASS | HTTP 201 · PUBLISHED · providerMessageId VAR · SENT +1 · PUBLISHED +1 · conn +1 (spy send +1) |
| **G6** | PASS | SENT +1 ≠ PUBLISHED +1 (iki AYRI aksiyon) |
| **G4 (dedupe)** | PASS | HTTP 409 · `DISCLOSURE_PUBLICATION_STATUS_INVALID` · conn +0 · SENT/PUBLISHED +0 · durum PUBLISHED kalır |
| **FD-RED** | PASS | HTTP 201 · durum SEND_FAILED · conn +1 (TEK) · spy send +1 · PUBLISHED audit +0 |
| **FD-TMO** | PASS | HTTP 201 · durum SEND_FAILED · conn +1 (TEK, kör tekrar +2 DEĞİL) · spy send +1 |
| **G7** | PASS | hedef-scoped: ilk tetik sink +1 · ledger SENT +1; ikinci tetik +0 (dedupe) |
| **G5** | PASS | mock-reboot → HTTP 403 · `PROVIDER_NOT_PRODUCTION` · PUBLISHED değil · conn +0 |
| **FD-COUNT-XCHECK** | PASS | G3/FD-RED/FD-TMO: **conn-delta == i3-spy send-delta** (conn-* send-çağrısını sadık sayar; çift/kör conn ile ayrılır) |
| **I12-CLOSE** | PASS | erişim sonlandırıldı (aktif=0) |

**FD sayaç ayrımı (owner kaygısı KAPANDI):** gönderim-çağrısı ≈ SMTP bağlantı denemesi (sink conn-*), teslim = msg-*,
çift/kör = conn-* > beklenen. i3-spy CANLIDA olmadığından conn-* proxy; izolede **conn-delta == i3-spy dispatcherSend-delta**
her FD gözleminde doğrulanarak conn-*'ın send-çağrısını sadık saydığı ve çift/kör denemeyi gerçekten ayırdığı KANITLANDI.
Ölçülemeyen PASS sayılmadı (üç değerli).

**DURUM (R04g düzeltmesi):** Bu 12/12 disposable provanın davranış kanıtıdır — **canlı ölçüm DEĞİL**. Canlı yürütmede
koşan ölçüm §9.9'daki `i12-live-measure-online`'dır; G5/G7'nin canlı sınırları §7.10 + §9.9'da somut. **canlı yürütme
YAPILMADI** (ayrı yazılı owner GO'su + §7).

**R04f durable kanıt:** `…\Documents\CLIENT-EVIDENCE-20260911\i12-r04f-<ts>\` — `i12-live-measure-evidence.json`
(12/12) + `run.txt` + SHA256 manifesti. İzole disposable (D: worktree; RELEASE23 dist/evidence C:'de); sır/ref/.env yok.

### 9.9 R04g — CANLI-BAĞLI ONLINE ÖLÇÜM + BAĞIMSIZ KURTARMA (mevcut tek API; CANLI KABUL DEĞİL)

Owner (2026-09-17): mevcut ölçüm betiği canlı yürütmeye uygunsuzdu (kendi setupI3'ünü kurar, yeni API boot eder,
i3-spy/cron-hook enjekte eder, port-kill yapar). Düzeltme: (1) `i12-live-measure.js` DISPOSABLE prova ilan edildi +
G-0 EN BAŞTA (canlı DB'de asla koşmaz) + §7.9 canlı çağrısından çıkarıldı; (2) **`i12-live-measure-online.js`** —
MEVCUT tek API'ye HTTP ile bağlanan, makbuz tenant/runId/aktörlerini kullanan (setupI3 YOK; aktör kimlikleri makbuz
e-postalarından DB okumasıyla çözülür), FD zincirini yalnız makbuz tenant'ına yazıp HTTP yayınlayan, owner sink'ini
mod dosyasıyla yönlendiren ölçüm; **boot/hook/port-kill İÇERMEZ**; (3) **`i12-live-recover.js`** — §7.9 try/finally'de
HER SONUÇTA koşan bağımsız kurtarma. İzole doğrulama: **tek disposable API bootlandı (i3-start-api) → i12-live-setup →
i12-live-measure-online (AYNI çalışan API'ye bağlandı; ikinci boot/setup YOK) → i12-live-recover** — hepsi tek makbuzla:

| Gözlem | Sonuç | Kanıt (gerçek çıktı, RELEASE23 dist) |
|---|---|---|
| **H5-00-ISO-ONLINE** | PASS | loopback sink erişilir · LAN sink erişilmez · API↔DB bağlı (login) — gönderim ancak bununla |
| **G1 (A-9)** | PASS | HTTP 503 · `CLIENT_INFO_REQUEST_EMAIL_FAILED` · dbRecord(infoReq)+0 · sendCall(conn)+1 |
| **G2 (A-10)** | PASS | HTTP 503 · `CLIENT_INFO_REQUEST_EMAIL_INDETERMINATE` · dbRecord+0 · sendCall(conn)+1 |
| **G3 (CANARY)** | PASS | HTTP 201 · PUBLISHED · providerMessageId VAR · SENT+1/PUBLISHED+1 · delivery(msg)+1 · sendCall(conn)+1 |
| **G6** | PASS | SENT+1 ≠ PUBLISHED+1 (iki AYRI aksiyon) |
| **G4 (dedupe)** | PASS | HTTP 409 · `DISCLOSURE_PUBLICATION_STATUS_INVALID` · sendCall+0 · delivery+0 · SENT/PUBLISHED+0 · PUBLISHED kalır |
| **FD-RED** | PASS | HTTP 201 · SEND_FAILED · **sendCall(conn)+1 ≠ delivery(msg)+0** · PUBLISHED dbRecord+0 |
| **FD-TMO** | PASS | HTTP 201 · SEND_FAILED · **sendCall(conn)+1 ≠ delivery(msg)+0** (kör tekrar +2 DEĞİL) |
| **G5** | UNMEASURED | bu pencerede sağlayıcı allowlist-içi (smtp→sink); allowlist-dışı ölçüm AYRI restart pini (`I12_G5_WINDOW`) gerektirir — DISPOSABLE'da ölçülü (§9.8). PASS sayılmadı. |
| **G7-LIVE** | UNMEASURED | mevcut API'de onaylı dar tetik YOK (§7.10) → canlı tetiklenemez; 2. API/hook YASAK. Davranış kanıtı DISPOSABLE'da (§9.8 G7). **KARAR gerekir.** |
| **I12-ACCESS-CLOSE** | PASS | measure finally: sentetik erişim sonlandırıldı (aktif=0) |

**SAYAÇ AYRIMI (owner kaygısı):** sendCall(conn) · delivery(msg, alıcı-scoped) · dbRecord AYRI raporlandı. Ölçülen
deltalar: G1/G2 `conn+1,msg+0,infoReq+0`; G3 `conn+1,msg+1,SENT+1,PUB+1`; G4 hepsi `+0`; FD-RED/FD-TMO `conn+1,msg+0`.
**FD-RED/FD-TMO'da sendCall+1 ≠ delivery+0** → çağrının teslimden bağımsız sayıldığı, "eşit delta = denklik" varsayımının
yapılmadığı KANITLANDI. i3-spy CANLIDA yok; conn'un send-çağrısını sadık saydığının kesin kanıtı DISPOSABLE'da (§9.8).

**BAĞIMSIZ KURTARMA (`i12-live-recover`) — izole:** happy-path (rollback mevcut) → **ok:true, exit 0**: Office SMTP
özgün değere geri (`smtp.example.invalid:587`, 3-alan doğrulandı) + erişim kapanışı (hedef+yabancı aktif=0); .env restore
PowerShell'e delege. Fail-closed çıkışlar: yabancı (ah-değil) slug→**exit 4** · makbuz/tenant yok→**exit 2** · rollback
ABSENT→Office ok:false→**exit 1** · confirm yok→**exit 3**. `assertOwnSlug` gerçek tenant'a dokunmayı engeller.
**Reclassified disposable measure G-0:** non-loopback / allowlist-dışı port·ad DB → **yazma/boot ÖNCESİ RET** (exit 1).

**PAKET DURUMU (dürüst):** canlı-ölçülebilir 7 gözlem (G1/G2/G3/G4/G6/FD-RED/FD-TMO) mevcut API'ye bağlı ONLINE ölçümle
uçtan uca izolede PASS; kurtarma bağımsız + fail-closed. **G5 ayrı allowlist-dışı restart pini gerektirir; G7 mevcut
API'de tetiklenemez → owner KARARI (§7.10).** Paket bu iki sınırı örtmez; G5/G7 davranışı DISPOSABLE'da (§9.8). CANLI
YÜRÜTME YAPILMADI (ayrı yazılı owner GO'su + §7); 2. canlı-DB API açılmadı, pinli launcher değişmedi, cron-hook enjekte edilmedi.

**Kanıt arşivi (durable, synthetic — sır/ref/.env yok):** `…\Documents\CLIENT-EVIDENCE-20260911\i12-rehearsal-<ts>\`
— `i12-gaps2-evidence.json` · `cron-predicate-state.json` · `cron-last-result.json` · `cron-run.log` + SHA256
manifesti `MANIFEST-SHA256-i12-rehearsal.txt` (manifest sha `754F33BA…`). **R01 koşumlarının (i12-gaps/i12-allowlist/
i3-run) ham logları prova ortamı ilk temizliğinde silindi**; verdict + gözlenen değerleri §9/§9.2 tablolarında korunur
(kalıcı ham-log kopyası R01 için YOK — açıkça belirtilir; R02 + cron için durable kopya + manifest bağlandı).

### 9.10 R04h — FAZLI ÖLÇÜM (G5+G7) · KURTARMA KİMLİK BAĞI · SIFIR YAZMA (izole; CANLI KABUL DEĞİL)

Owner (2026-09-17) G7 için **(A)** seçti ve İ12 paketindeki kalan uygulama eksiklerini istedi. Bu turda kapatılanlar:

1. **FAZLI ölçüm (aynı makbuz + aynı tek API):** `I12_PHASE` = `smtp` | `mock` (G5) | `g7`. G5 ve G7 artık **AYRI
   koşumlarda**, aynı kurulum makbuzuyla ölçülür. **Erişim kapanışı ölçümden ÇIKARILDI** → nihai kapanış TÜM fazlardan
   sonra `i12-live-recover` ile (aksi halde ilk faz erişimi kapatır, sonraki fazlar login olamazdı).
2. **Kurtarmada kimlik bağı:** `i12-live-identity.assertReceiptIdentity` — **her yazmadan ÖNCE** hedef VE yabancı
   tenant'ın **ID↔slug↔runId** bağı DB'den doğrulanır; yanlış kimlikte **hiçbir kullanıcıya/Office kaydına YAZILMAZ**.
3. **Adımlar birbirini atlatmaz:** Office rollback ve erişim kapanışı AYRI try/catch; **çıkış 1 = HATA**.
4. **Sayaç dürüstlüğü:** `smtpConnection(conn)` **gerçek send çağrısı olarak SUNULMAZ**; okunamayan sayaç `null` →
   **ÖLÇÜLEMEDİ** (asla +0 PASS).
5. **§7.9 gerçek zincir:** try **İLK YAZMADAN (kurulum) itibaren**; `.env` pini/geri-alması GERÇEK PowerShell
   (`Set-EnvKeys`), sağlık beklemesi süre-sınırlı (`Wait-ApiHealthy`); **çift restart KALDIRILDI** (geri-alma+restart
   yalnız `finally`'de bir kez); yorum/yer tutucu işlem YOK.

**İzole doğrulama** (disposable PG 5439 + Redis 6390 + sink 2527; API **ürün PR'ının derlenmiş dist'i** — G7 ucu dahil).
Yalnız bu turun eksikleri ölçüldü; **önceki geçerli kanıtlar (G1/G2/G3/G4/G6/FD-RED/FD-TMO — §9.9) YENİDEN AÇILMADI.**

| Ölçüt | Sonuç | Kanıt (gerçek çıktı) |
|---|---|---|
| **G7** (FAZ=g7) | PASS | HTTP 201 · **HEDEF** delivery(msg)+1 · ledger SENT+1 · **YABANCI tenant ledger SENT+0** (kapsam izolasyonu) · **ikinci tetik +0** (aynı-dönem dedupe) |
| **G7-AUTH-REACH** | PASS | dar uç kimlik-doğrulamalı ve erişilebilir (HTTP 201; 401 değil) |
| **G5** (FAZ=mock, AYNI makbuz) | PASS | HTTP 403 · `DISCLOSURE_PUBLICATION_PROVIDER_NOT_PRODUCTION` · durum `SEND_PENDING` (PUBLISHED değil) · smtpConn+0 |
| **Faz zincirlenmesi** | PASS | `mock` fazı `g7` fazından SONRA aynı makbuzla login olabildi → erişim kapanışının ertelendiği ölçüldü |
| **SIFIR YAZMA** — id↔slug uyuşmazlığı | PASS | `exit 4` · `TARGET_TENANT_ID_SLUG_MISMATCH` · `wroteNothing` · çıktıda `officeRollback`/`access` anahtarı **YOK** |
| **SIFIR YAZMA** — slug runId'den türemiyor | PASS | `exit 4` · `TARGET_SLUG_NOT_DERIVED_FROM_RUNID` · `wroteNothing` |
| **SIFIR YAZMA — durum değişmedi** | PASS | ön/son durum AYNI: Office `127.0.0.1:2527`, aktif kullanıcı `9` (hiçbir yazma olmadı) |
| **ARA-ADIM HATASI → bağımsız kurtarma** | PASS | Office rollback `ok=false` (`NO_ROLLBACK`) iken **erişim kapanışı YİNE DE koştu** (target+foreign aktif=0) · overall `ok=false` · **exit 1 (HATA)** |
| **NİHAİ KURTARMA** | PASS | `exit 0` · Office 3-alan özgüne döndü (`smtp.example.invalid:587:true`) · erişim kapandı · `envRestore=DELEGATED_TO_POWERSHELL` |

**R04h durable kanıt:** `…\Documents\CLIENT-EVIDENCE-20260911\i12-r04h-<ts>\` — `evid-g7.json` · `evid-g5.json` ·
`recover-midstep-failure.json` · `recover-final.json` · `zero-write-*.json` · `run-summary.txt` + SHA256 manifesti.
İzole disposable; sır/GO-ref/.env yok. **CANLI YÜRÜTME YAPILMADI; yayım ayrı owner GO'suna bağlıdır.**

### 9.11 R05 — KALAN KURTARMA RİSKLERİ + AYLIK CRON ÇAKIŞMA KORUMASI (izole; CANLI KABUL DEĞİL)

Owner (2026-09-17) yalnız iki somut kalan riski istedi. Ölçülenler:

#### (a) Kurulum makbuzu oluşmadan kesildiğinde runId üzerinden güvenli kurtarma — **KAPALI**
Makbuz kurulumun EN SONUNDA yazılır; ondan önceki bir kesinti "tenant var, makbuz yok" bırakır.
`i12-live-recover` bu durumda hedefi **yazmadan önce üretilen runId'den TÜREYEN slug** ile arar
(`ah-<runId>`, salt-okuma, yalnız `ah-` öneki) ve kimlik bağını DB'den doğrular.

| Senaryo | Sonuç |
|---|---|
| Makbuz SİLİNDİ, yalnız `I12_RECOVER_RUNID` verildi | **PASS** — slug `ah-r05540153` çözüldü · `identity.ok=true` · Office 3-alan özgüne döndü (`fieldsRestored=true`) · erişim hedef+yabancı `aktif=0` · **exit 0** |
| Hiç yazma olmamış runId (`ah-hicyokr05` DB'de yok) | **PASS** — `nothingToRecover=true` · `wroteNothing=true` · çıktıda `officeRollback`/`access` anahtarı **YOK** · **exit 0** · DB tenant sayısı değişmedi |

#### (b) §7.9'da API yeniden başlarken sentetik aktörlerin cron maruziyeti — **KORUMA EKLENDİ**
**Ölçülen gerçek:** canlı `.env`'de `CLIENT_STATEMENT_MONTHLY_DELIVERY` **zaten `true`** → global aylık cron
(`'0 3 1 * *'` @ `Europe/Istanbul`) canlıda **halihazırda kayıtlı**; İ12 bunu AÇMAZ, pini yalnız aynı değeri korur.

**Abartılmayan risk sınırı (kaynaktan ölçüldü):** ekstre teslimi `office.service.getFullSmtpSettings` ile tenant'ın
**KENDİ Office satırından** okunur ve **env'e geri düşüş YOKTUR**. Pencere yalnız HEDEF tenant'ın Office satırını
sink'e alır. Dolayısıyla env pini (`SMTP_HOST`/`SMTP_PORT`) **gerçek tenant'ların ekstre postasını YAKALAMAZ** ve
İ12 gerçek müvekkillere gönderim riski EKLEMEZ.

**Gerçek ve İ12'ye özgü zarar — ÖLÇÜM BÜTÜNLÜĞÜ:** pencere ateşlemeyi kapsarsa sentetik hedef tenant GLOBAL
koşuda süpürülür; aynı-dönem teslim/ledger TÜKENİR ve **G7'nin "ilk tetik +1 / ikinci tetik +0 (dedupe)" ölçümü
GEÇERSİZ-YANILTICI** olur. Ayrıca pencere, İ12 ile ilgisiz bir üretim işiyle iç içe geçer (gözlemler atfedilemez).

**Düzeltme:** `i12-live-cron-guard.js` — §7.9'da **İLK YAZMADAN ÖNCE** koşar; pencere ateşlemeyi kapsıyorsa
**exit 5 ile REDDEDER** (kurulum başlamaz, yazma yok). Hedefli deterministik prova (`i12-cron-guard-prova.js`,
DB/API gerektirmez) **8/8 PASS**:

| Ölçüt | Sonuç |
|---|---|
| ay ortası / ateşlemeden önce biten pencere | PASS — çakışma yok |
| **SINIR**: pencere TAM ateşleme anında biter | PASS — **çakışır** sayılır (fail-closed) |
| pencere ateşlemeyi kapsar | PASS — çakışır |
| ateşleme geçmiş, sonraki ay uzakta | PASS — çakışma yok |
| yıl dönümü (1 Ocak 03:00 Istanbul) | PASS — çakışır |
| ay sonu (28 Şubat → 1 Mart) | PASS — çakışma yok |
| tz doğruluğu: ateşleme Istanbul yerelinde ayın 1'i 03:00 | PASS — `2026-8-1 3:00` |

**Önceki geçerli kanıtlar (§9.9, §9.10) YENİDEN AÇILMADI.** CANLI YÜRÜTME YAPILMADI.

#### Ayrı açık kalem — `G7_MANUAL` kalıntı dizini (yayın hazırlığını BLOKE ETMEZ)
`git worktree remove` "Filename too long" ile düştü; git kaydı prune oldu, dizin diskte kaldı
(`D:\Development\HY_WT\G7_MANUAL`: 333.877 dosya, 2.237'si `node_modules` dışı, 4.800 junction).
Uzun-yol güvenli silme çağrısı araç kancasınca reddedildi (`Remove-Item on system path '/MIR' is blocked` —
yanlış-pozitif; gerçek hedef worktree diziniydi). **Kural uygulandı: DURULDU, aynı işlem başka ifadeyle
YÜRÜTÜLMEDİ.** Temizlik **owner kararıdır**.
**Teknik kanıt — bloke etmez:** yayın adayı bu dizinden DEĞİL, kanonik ağaçtan (`5593b9bb`) üretildi;
`prisma generate` + `nest build` **çıkış 0**, dist TAM AĞAÇ digest `87712E0E…5453` hesaplandı ve canlı ile
fark ölçüldü (7 dosya). Dolayısıyla kalıntı, aday üretimini veya doğrulamasını engellemez; yalnız disk temizliği
açık kalemidir.

### 9.12 R06 — YAYIN/GERİ ALMA SIRASI + B11 KARAR PAKETİ (CANLI YAYIN DEĞİL)

Owner (2026-09-17) son iki açık: B11 gerekçesinin kanonik doğrulaması ve yayın/geri alma sırasının düzeltilmesi.
Tam paket: **`I12-RELEASE-CANDIDATE-AND-ROLLBACK-R01.md`** (içerik R02). Bu turda kapatılanlar:

| Açık | Kapanış |
|---|---|
| Yayın/geri alma **sırası** | aday doğrula → canlı kimlik + **yedek bütünlüğü** → **görevi durdur + sürecin GERÇEKTEN kapandığını doğrula** (`Wait-ApiStopped`: port dinleyici 0 + `hukuk-task-host.exe api` 0 + task State ≠ Running) → dosyaları değiştir → **tam ağaç digest doğrula** → başlat → süreli sağlık. **ÇALIŞAN API'nin dist'i DEĞİŞTİRİLMEZ**; geri alma AYNI sırayı izler |
| **Üç ayrı kimlik** | KAYNAK SHA `006c4dd2…` · PAKET DIGEST `34222C14…3FE0` (8 canlı betik) · DERLEME KİMLİĞİ `87712E0E…5453` (3867 dosya) — ayrı ayrı belirtildi |
| **Migration hükmü** | artık **içerik eşitliğine** dayanıyor: 131=131 dosya **ve** içerik digest `DD38F07D…C93D` her ikisinde AYNI; eklenen/silinen/değişen **0** |
| **#2699 CI kaydı** | **#2697'nin CI'ında G7 spec'i KOŞMADI** (client-statement modülü manifest kovasında değildi). **#2699 @ `987f0c1e`** kapattı: run `35268331580` / job `105361013145`, kova `pure/claim-collection-finance`, `PASS …monthly-delivery-manual.controller.spec.ts` @ `20:06:28.350Z`. Bu yüzden KAYNAK SHA `006c4dd2` seçildi |
| **Route varlığı kanıtı** | 401 **tek başına sayılmaz**. Ölçüldü: kimliksiz gerçek uç **401**, olmayan yol **404** → 401 tutarlı ama yetersiz. Kanıt: (1) aday dist'i boot edilip log'da **birebir** `[RouterExplorer] Mapped {/api/client-statements/monthly-delivery/run-now, POST} route` (977 route satırı), (2) kimliği doğrulanmış **elevated OLMAYAN** aktörle **403 `SCHEDULER_MANUAL_RUN_DENIED_NOT_ELEVATED`** — kapı `runMonthlyDelivery`'den ÖNCE çalışır, **gönderim YOK** |
| **B11 gerekçesi** | kanonik kayıttan doğrulandı: **"POLITIKA KARARI — kusur DEGIL"**, owner GO 2026-09-12, #2655 MERGED `78f49dd3`. RELEASE23 dışı kalma nedeni **yalnız aday dondurulması** (*"aday `2740df3d`'den SONRA; adaya girmesi yeni derleme ister"*; *"canlıya çıkışı ayrı aday/ayrı karar"*). **Açık engel YOK.** Kabul edilmesi gereken tek kalem: audit yazılamazsa güncelleme **geri alınır** ve hata çağırana **ulaşır** (eskiden yutuluyordu). **Öneri: adayla yayınlansın — KARAR OWNER'IN** (ajan onaylamadı/çıkarmadı) |

**R06 durable kanıt:** `…\Documents\CLIENT-EVIDENCE-20260911\i12-r06-<ts>\` — `route-registry-boot-log.txt` ·
`unauth-401-vs-404-probe.txt` · `run-summary.txt` + SHA256 manifesti. Önceki geçerli kanıtlar (§9.9–§9.11 ve
B11'in kendi test kanıtları) **YENİDEN AÇILMADI**. **CANLIYA YAYINLANMADI.**

### 9.13 R07 — HEDEF-DIŞI MESAJ KAPISI + canlı kabul kapsamı (CANLI KABUL HENÜZ KOŞULMADI)

Owner canlı kabul GO'su (2026-09-18) iki şey netleştirdi; **ilk yazmadan ÖNCE** kapatıldı:

**(1) "Hedef dışı mesaj FAIL" — kapı EKLENDİ.** Önceki online ölçüm yalnız **beklenen** alıcıya giden mesajları
sayıyordu (`msgToCount`); izin kümesi DIŞINA giden bir mesajı **görmezdi**. Yani yanlış hedefe gönderimi
yakalayacak kontrol YOKTU. Eklenen `I12-OFFTARGET` kapısı, her fazın sonunda (hata/çöküş dahil `finally`'de)
sink'teki **TÜM** `msg-*` dosyalarının `To:` başlıklarından **her adresi** çıkarır ve izin kümesiyle karşılaştırır:

| İzin kümesi (betiklerdeki TAM adresler) | Kullanım |
|---|---|
| `deliv-<runId>@ah-harness.invalid` | G7 / aylık ekstre teslimi (`i12-live-setup` → `client.email`) |
| `fd-<runId>@ah-harness.invalid` | FD yayını (`approvedRecipientEmail`) |
| `alici-<runId>@ah-harness.invalid` | G1/G2 bilgi talebi (`emailTo`) |

Kural: izin kümesi dışında **tek mesaj bile FAIL** · `To:` okunamayan/olmayan mesaj da **hedef-dışı** ·
dizin okunamazsa **ÖLÇÜLEMEDİ** (asla "temiz" sayılmaz).

**Hedefli izole prova — `i12-offtarget-prova.js`, 6/6 PASS** (GERÇEK `scanOffTarget` ölçülür; kopya mantık YOK):

| Ölçüt | Sonuç |
|---|---|
| yalnız izinli alıcılar → hedef-dışı 0, `conn-*` sayılmaz | PASS (total=3) |
| izin DIŞI gerçek alıcı (`gercek.muvekkil@ornekhukuk.com.tr`) yakalanır | PASS |
| `To:` başlığı OLMAYAN mesaj hedef-dışı sayılır | PASS (`<To-YOK>`) |
| çok alıcılı mesajda dışarıdaki alıcı yakalanır | PASS (`sizinti@disarisi.net`) |
| büyük harfli `TO:`/adres kapıyı atlatamaz | PASS (normalize) |
| okunamayan dizin → `null` = ÖLÇÜLEMEDİ, "temiz" DEĞİL | PASS |

Test edilebilirlik için `i12-live-measure-online.js` yeniden yapılandırıldı: koşucu `require.main === module`
ile korundu, `scanOffTarget(dir, allowedSet)` dışa açıldı (canlı yol davranışı DEĞİŞMEDİ).

**(2) claim/reclaim kapsamı — OWNER KARARI: "yalnız kaydet".** `CLAIM`/`RECLAIM`/`HANG` yalnız `i12-gaps2.js`
içindedir ve o betik **G-0 taşır** → canlı DB'de **koşamaz** (tasarım gereği). Owner kararı: bunlar **§9.2'deki
mevcut disposable prova kanıtı olarak KAYDA geçer, canlıda YENİDEN ÖLÇÜLMEZ**. Canlı kabul kapsamı:
**G1 · G2 · G3 · G6 · G4 · FD-RED · FD-TMO · G5 · G7 + `I12-OFFTARGET`**.

**Pin güncellemesi:** `i12-live-measure-online.js` değiştiği için **PAKET DIGEST yenilendi**:
`34222C14…3FE0` → **`2492AEAB7E45ABCF001254FC80AA8F085E6DE4F9A1C0886F3642410B10176DA0`**
(canlı koşum bu yeni değerle doğrulanır; eski digest ile koşulmaz).

**DURUM: CANLI KABUL HENÜZ KOŞULMADI.** Koşum anı kapıları PASS ölçüldü (canlı dist `87712E0E…5453` ·
paket · cron çakışma yok · görev Running). Başlatma için owner'dan bekleyen girdiler §7.9'un
OWNER PLACEHOLDER bloğundadır (GO ref · canlı DB URL · API base · DB host/port/ad) ve **yükseltilmiş adımları
(`.env` pin + `Stop/Start-ScheduledTask`) owner bizzat koşar**. Sayaç **11/17**, hizmet **0/8** — DEĞİŞMEDİ.

### 9.14 R08 — I12-OFFTARGET ZARF (RCPT TO) KAPSAMI · sink dışarı aktarım kanıtı (CANLI KABUL HENÜZ KOŞULMADI)

**R07 kapısı EKSİKTİ — açıkça kayda geçer.** R07'deki `I12-OFFTARGET` yalnız `msg-*` dosyalarının **`To:` başlığını**
okuyordu. Sink her `RCPT TO`'yu teslim edilen mesaja `X-I3-To:` satırı olarak yazar; `/^To:/` bu satıra **uymaz**.
Sonuç: **Bcc alıcısı** (yalnız SMTP ZARFINDA bulunur, başlıkta YOKTUR) R07 kapısından **geçerdi**. Ayrıca `reset`
modunda `RCPT TO` alınıp DATA'da bağlantı koparıldığında zarf **hiçbir yere kalıcılaşmıyordu**. R07'nin 6/6'sı
**sentetik dosyalarla** ölçülmüştü; sentetik dosya yakalama katmanını hiç çalıştırmadığı için bu boşluğu
**gösteremezdi**. (Ders: yakalama katmanındaki boşluk ancak GERÇEK protokol konuşmasıyla ortaya çıkar.)

**Dar düzeltme:**
- `i3-sink.js`: her konuşmanın `conn-*` kaydına `envelope=v1` işareti + **her `RCPT TO` için `rcpt=` satırı**
  (DATA'ya ulaşmayan denemeler dahil). `conn-*` İÇERİĞİNİ okuyan başka kod YOK (tüm bağımlılar dosyaları ADIYLA sayar;
  `I3-SMTP-SINK-READY` satırı değişmedi) → geriye uyumlu.
- `scanOffTarget`: karşılaştırma artık **tüm zarf alıcıları** (`X-I3-To:` + `rcpt=`) **ve** `To:`/`Cc:` başlıkları.
  Karar üç değerli: izin dışı tek adres → **FAIL**; zarf kanıtı eksik (işaretsiz eski sink kaydı, `X-I3-To`'suz
  teslim) → **ÖLÇÜLEMEDİ, asla PASS**; dizin okunamaz → ÖLÇÜLEMEDİ. Tarayıcı baktığı msg/conn/zarf sayısını yazar.

**Hedefli izole prova — `i12-offtarget-prova.js`, 8/8 PASS** (GERÇEK sink + GERÇEK SMTP konuşmaları; GERÇEK
`scanOffTarget`; kopya mantık YOK; canlıya DOKUNULMADI):

| # | Senaryo | Sonuç |
|---|---|---|
| E1 | izinli zarf + izinli başlık | PASS — temiz; bakılan msg=1 conn=1 zarf=2 başlık=1 |
| **E2** | **izinli `To:` + izin DIŞI zarf alıcısı (Bcc)** | PASS — FAIL üretti; yakalama **yalnız `[rcpt]`/`[zarf]`**, `[baslik]` **YOK** |
| **E3** | **nodemailer 7.0.11 (ürünün taşıması) `to:` izinli + `bcc:` dış** | PASS — sink İKİ alıcıyı da kabul etti; Bcc başlıkta **YOK**; kapı zarftan yakaladı |
| E4 | `reset` modu (DATA'da kopan) + izin dışı RCPT | PASS — msg=0 ama `conn rcpt=` yakaladı |
| E5 | `envelope=v1` işaretsiz conn (eski sink) | PASS — ÖLÇÜLEMEDİ (PASS değil) |
| E6 | `X-I3-To`'suz teslim kaydı | PASS — ÖLÇÜLEMEDİ (başlık temiz olsa bile PASS değil) |
| E7 | okunamayan dizin | PASS — `null` (ÖLÇÜLEMEDİ) |
| **E8** | **sink dışarı aktarmaz** | PASS — dinleme yalnız `127.0.0.1`; teslim anında sink sürecinin **loopback-dışı uç bağlantısı 0** (Get-NetTCPConnection) |

Statik: `i3-sink.js` yalnız `net`/`fs`/`path` yükler, yalnız `net.createServer` kullanır; `connect`/`createConnection`/
`request`/`nodemailer`/`http(s)`/`tls`/`dgram`/`child_process` **YOK**; `HOST='127.0.0.1'` sabit.

**E2/E3 R07 kapısıyla koşsaydı PASS verirdi** (başlıkta yalnız izinli adres var) — yani düzeltme olmadan canlıda bir
Bcc sızıntısı kabul ölçütünden sessizce geçerdi.

**CodeQL (ilk push):** prova'da veriden kurulan `RegExp` (yalnız `.` kaçışlanıyordu) **yüksek önemde** "eksik kaçışlama" uyarısı üretti; regex kurulmadan düz metin karşılaştırmasına çevrildi, prova yine 8/8.

**Pin güncellemesi:** `i3-sink.js` `7D26418D…` → `0E3884FB…F7F1` · `i12-live-measure-online.js` → `76F94DC3…FC80` ·
**PAKET DIGEST** `4992D27F…564B` → **`2492AEAB7E45ABCF001254FC80AA8F085E6DE4F9A1C0886F3642410B10176DA0`**.
Canlı koşum bu değerle doğrulanır. **CANLI KABUL HENÜZ KOŞULMADI**; sayaç 11/17, hizmet 0/8 değişmedi.

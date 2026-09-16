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
| `client-live-acceptance-i12-r01/scripts/i12-live-preflight.js` | **CANLI PREFLIGHT** (salt-okuma) · GO-ref biçim+tüketim · DB host/port/ad · kurulum makbuzu tenant/runId · API↔DB bağı; eksik kimlikte YAZMA BAŞLAMAZ | `62837688E97A98F7D465A5546548BD6CF9B0337FD18A4DD24D111F81A3D3036E` |
| `client-acceptance-runners-i3-r01/scripts/i3-lib.js` | düzenek | `56F3788E9F84746CFFEE384D8C18B9B9A28130CC8E2285F9570AB69CC6EE74A3` |
| `client-acceptance-runners-i3-r01/scripts/i3-start-api.js` | düzenek | `72505F981EE167B1A664E5663DC675B2E6ACAB1CCCE84058231BA8BB0EECDFB5` |
| `client-acceptance-runners-i3-r01/scripts/i3-sink.js` | loopback SMTP sink | `7D26418D3D7B1B3B7929041986C1A370B9253E79B3700470231CA5D56253E75C` |
| `client-acceptance-runners-i3-r01/scripts/i3-spy.js` | gerçek dispatcher.send sayacı | `954C4B88AFB18322564FD29F71CE1D7B6EF4EEFF4DC6716EA7B6AB08AB1F36D0` |
| `client-acceptance-runners-i3-r01/scripts/i3-h5-intake.js` | A-9/A-10 (G1/G2) | `D6D27F874C3D7409EC307F54B3BEBB4F9B8257270FE20F7E2DECD7DF6180F101` |
| `client-acceptance-harness-r01/scripts/ah-lib.js` | G-0 + prisma/aktör altyapısı | `DF882DB7F33A667092F126F01E518C1A8292C8C0B3C4C039BF73D71F3ACCBFD7` |

> **Disposable kapıları KALDIRILMAZ ve owner yetkisiyle AŞILMAZ.** Prova/ölçüm betikleri (`i12-gaps`, `i12-gaps2`,
> `i12-cron-*`, `i12-window.js`) `ah-lib.assertDisposableEnvironment` (G-0: DB port allowlist `{5439}`, DB adı
> `{hukuk_fix1_test}`, loopback) taşır ve **YALNIZ disposable DB'de** koşar; **CANLIYA ASLA koşulmaz** ve G-0 owner
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
doğrulandı (§9.6: preflight 6/6 · kurtarma 9/9 · zincir 4/4). **KURULUM + ÖLÇÜM adımları EKSİK** (aşağıda somut).

```powershell
# ——— 0) SHA KAPISI (main checkout; canlıya YAZMAZ, salt betik doğrular) ———
$Gov = 'D:\Development\HUKUK_YAZILIMI\project\project\docs\governance'   # owner: main checkout kökü
$Sc  = Join-Path $Gov 'client-live-acceptance-i12-r01\scripts'
$PIN = @{
  "$Sc\i12-live-preflight.js" = '62837688E97A98F7D465A5546548BD6CF9B0337FD18A4DD24D111F81A3D3036E'
  "$Sc\i12-live-window.js"    = 'DDDB4CCA999D715AFA3F0A9AA8E409BB54854370BDAD20C190DB096014BFD1D9'
  "$Sc\i12-window.js"         = 'DB1E5A5A671EE2486D1DB0461FACC2A180E9EA04F310EC10AA531BF926DA08E8'
}
foreach ($f in $PIN.Keys) { $h=(Get-FileHash -Algorithm SHA256 $f).Hash; if ($h -ne $PIN[$f]) { throw "SHA UYUŞMADI: $f (beklenen $($PIN[$f]) bulunan $h)" } }
Write-Host "SHA kapısı GEÇTİ"

# ——— OWNER PLACEHOLDER'LARI (owner doldurur; ham ref/DB URL/parola kanıta/repoya YAZILMAZ) ———
$LiveDbUrl=$env:CLIENT_LIVE_DB_URL; $GoRef=$env:OWNER_GO_REF; $LoginPw=$env:CLIENT_LIVE_LOGIN_PW
$ExpectApi='https://<canlı-api>/api'; $ExpDbHost='<host>'; $ExpDbPort='<port>'; $ExpDbName='<db>'
$TenantId='<sentetik-hedef-tenant-id>'; $TenantSlug='<sentetik-hedef-tenant-slug>'; $RunId='<runId>'
$SinkPort='2529'; $EvDir='C:\Users\ulastelli\Documents\CLIENT-EVIDENCE-<ts>'
$Receipt=Join-Path $EvDir 'i12-setup-receipt.json'; $Rollback=Join-Path $EvDir 'i12-live-window-rollback.json'; $Node='node'

# ——— 1) KURULUM (sentetik hedef tenant + dönem aktivitesi + login user + makbuz) ———
#   *** EKSİK — live-safe (non-G-0) `i12-live-setup.js` HENÜZ YAZILMADI. Disposable G-0 betikleri canlı komut
#   OLAMAZ. Gerekli: canlı-güvenlik kapısı (I12_LIVE_CONFIRM + GO ref + beklenen DB + açık sentetik slug), yalnız
#   sentetik tenant'a yazar, {runId,tenantId,tenantSlug,loginEmail} makbuzunu ($Receipt) üretir. (owner'a bildirildi) ***

# ——— 2) PREFLIGHT (İLK YAZMADAN ÖNCE; salt-okuma; eksik kimlikte YAZMA BAŞLAMAZ) ———
$env:AH_DATABASE_URL=$LiveDbUrl; $env:AH_API_BASE_URL=$ExpectApi; $env:AH_LOGIN_PASSWORD=$LoginPw
$env:I12_LIVE_GO_REF=$GoRef; $env:I12_REPO_DIR=(Resolve-Path (Join-Path $Gov '..\..')).Path
$env:I12_EXPECT_DB_HOST=$ExpDbHost; $env:I12_EXPECT_DB_PORT=$ExpDbPort; $env:I12_EXPECT_DB_NAME=$ExpDbName
$env:I12_EXPECT_TENANT_SLUG=$TenantSlug; $env:I12_EXPECT_RUNID=$RunId; $env:I12_SETUP_RECEIPT=$Receipt
& $Node "$Sc\i12-live-preflight.js"
if ($LASTEXITCODE -ne 0) { throw "PREFLIGHT REDDETTİ (exit $LASTEXITCODE) — kimlik eksik/uyuşmaz; YAZMA BAŞLAMAZ" }

# ——— 3) PENCERE-AÇ (yalnız hedef tenant Office SMTP → sink; SIR-KORUYUCU; kapılar fail-closed) ———
$env:I3_SMTP_PORT=$SinkPort; $env:I12_WINDOW_ROLLBACK=$Rollback
$env:I12_LIVE_CONFIRM='1'; $env:I12_EXPECT_DB=$ExpDbName; $env:I12_EXPECT_API=$ExpectApi
& $Node "$Sc\i12-live-window.js" open $TenantId
if ($LASTEXITCODE -ne 0) { throw "pencere-aç REDDEDİLDİ (exit $LASTEXITCODE; 3=onay/GO, 4=DB/API/yanlış-hedef)" }

# ——— 4) RESTART-1 (env=smtp penceresi): .env T-pencere pin + görev yeniden başlat ———
#   Owner .env'e T-pencere değerlerini pinler (EMAIL_PROVIDER=smtp; SMTP_HOST=127.0.0.1; SMTP_PORT=2529),
#   öncesi .env'i sha ile yedekler. Sonra görev yeniden başlatılır (gerçek komut):
Stop-ScheduledTask  -TaskName 'HukukPlatform-API'
Start-ScheduledTask -TaskName 'HukukPlatform-API'   # ≤120 sn: launcher DB-hazırlık retry'ını kapsar
# Dinleyici + /api/auth/login 200/201 (verifyApiBoundToSameDatabase) doğrulanana kadar beklenir.

# ——— 5) ÖLÇÜM (7 gözlem, tek canlı API, hedef-scoped) ———
#   *** EKSİK — live-safe (non-G-0) 7-gözlem ÖLÇÜM harness'ı HENÜZ YAZILMADI. Disposable G-0 ölçüm betikleri
#   (i12-gaps/gaps2/cron-delivery/allowlist) canlı komut SAYILMAZ. Gerekli: G1/G2 (bilgi talebi API + sink
#   reject/reset), G3/G4/G6/FD-RED/FD-TMO/HANG (FD yayın API; gönderim kanıtı sink+DB), G5 (ayrı restart
#   EMAIL_PROVIDER=mock → 403), G7 (hedef-scoped runMonthlyDelivery(now,{tenantId:$TenantId}); boş-scope YOK).
#   Üç-değerli verdict; hedef-scoped. (owner'a bildirildi) ***

# ——— 6) RESTART-3 (env geri-al): .env özgün değere geri (sha doğrulanır) + görev yeniden başlat ———
Stop-ScheduledTask  -TaskName 'HukukPlatform-API'
Start-ScheduledTask -TaskName 'HukukPlatform-API'

# ——— 7) PENCERE-KAPAT + KURTARMA (host/port/secure → özgün; 3-alan doğrulama; SIR dokunulmadı; idempotent) ———
& $Node "$Sc\i12-live-window.js" close $TenantId
if ($LASTEXITCODE -ne 0) { throw "pencere-kapat başarısız (exit $LASTEXITCODE)" }
# Süreç yarıda öldüyse aynı komut IDEMPOTENT kurtarmadır (NO_ROLLBACK/CORRUPT/UNREADABLE/MISMATCH → fail-closed, yazma yok).

# ——— 8) ERİŞİM KAPANIŞI + kanıt arşivi (sentetik kullanıcı pasifleştirme + kanıt SHA256 manifesti korumalı arşive) ———
```

**§7.9 EKSİK KALEMLER (owner'a somut bildirim — bu paket bu yüzden "eksiksiz" DEĞİL, İ12 HAZIR İLAN EDİLMEZ):**
> - **KURULUM** (adım 1): live-safe (non-G-0) `i12-live-setup.js` YOK.
> - **ÖLÇÜM** (adım 5): live-safe (non-G-0) 7-gözlem canlı ölçüm harness'ı YOK.
> Bu iki adım için sahte komut/disposable ad KULLANILMADI; gerçek çalıştırılabilir komut YAZILMADI. **REAL + izolede
> doğrulanan** adımlar: SHA kapısı · PREFLIGHT (`i12-live-preflight`, 6/6) · PENCERE-AÇ/KAPAT (`i12-live-window` +
> hardened `i12-window`; kurtarma 9/9 · zincir 4/4) · RESTART (`HukukPlatform-API` görev + `.env` T-pencere).

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
  `i12-window.js` (rollback sınıflandırma + kurtarma sağlamlığı, §9.6) + **canlı preflight** `i12-live-preflight.js`;
  **G-0 owner yetkisiyle AŞILMAZ** (§7.3). §7.3 tam yol + SHA256; §7.8 restart bütçesi; §7.9 gerçek PowerShell
  (SHA kapısı/preflight/pencere/restart-görev/kapanış). **PAKET EKSİKSİZ DEĞİL — İ12 HAZIR İLAN EDİLMEZ:** §7.9
  KURULUM (`i12-live-setup.js`) ve 7-gözlem canlı ÖLÇÜM harness'ı live-safe (non-G-0) olarak HENÜZ YAZILMADI
  (§9.6; disposable G-0 betikleri canlı komut sayılamaz). Canlı yürütme yapılmadı — ayrı yazılı owner GO'su (§7) ister.

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

**Kanıt arşivi (durable, synthetic — sır/ref/.env yok):** `…\Documents\CLIENT-EVIDENCE-20260911\i12-rehearsal-<ts>\`
— `i12-gaps2-evidence.json` · `cron-predicate-state.json` · `cron-last-result.json` · `cron-run.log` + SHA256
manifesti `MANIFEST-SHA256-i12-rehearsal.txt` (manifest sha `754F33BA…`). **R01 koşumlarının (i12-gaps/i12-allowlist/
i3-run) ham logları prova ortamı ilk temizliğinde silindi**; verdict + gözlenen değerleri §9/§9.2 tablolarında korunur
(kalıcı ham-log kopyası R01 için YOK — açıkça belirtilir; R02 + cron için durable kopya + manifest bağlandı).

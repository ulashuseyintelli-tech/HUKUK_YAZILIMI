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
>   hedef tenant'ın **Office SMTP satırı** pencerede sink'e alınır (`smtpHost=127.0.0.1`, `smtpPort=<sink>`), pencere
>   sonunda özgün değere geri alınır (T-PENCERE-KAPA). Bu ayrım prova sırasında bulundu: yalnız env yönlendirmesi
>   G7'de "E-posta ayarları yapılandırılmamış" → `DISPATCH_FAILED` verir.

**7.3 · Betikler + tam yol + sha256 kapısı.** Ölçüm betikleri bu paketin `scripts/`'idir; canlı GO'da her betiğin
main'deki (`b07bed98` ⊇, İ12 R03 dahil) sha256'sı §D3-benzeri sha kapısıyla doğrulanır (yalnız eşleşen sha koşar):
> - `project/docs/governance/client-live-acceptance-i12-r01/scripts/i12-gaps.js` (G3/G4/G6/FD-RED/FD-TMO)
> - `.../scripts/i12-gaps2.js` (CLAIM/RECLAIM/HANG)
> - `.../scripts/i12-allowlist.js` (G5 gerçek negatif kontrol)
> - `.../scripts/i12-cron-hook.js` + `.../scripts/i12-cron-run.js` (G7 predicate/direct/fireOnTick/kısa-takvim)
> - `.../scripts/i12-cron-delivery.js` (G7-DELIV: gerçek gönderim + ledger `markSent` + aynı-dönem-dedupe)
> - İ3 düzeneği: `project/docs/governance/client-acceptance-runners-i3-r01/scripts/{i3-lib,i3-start-api,i3-sink,i3-spy,i3-h5-intake}.js`
>   + `client-acceptance-harness-r01/scripts/ah-lib.js`
>
> **Disposable kapıları KALDIRILMAZ.** Prova betikleri `ah-lib.assertDisposableEnvironment` (G-0: DB port
> allowlist `{5439}`, DB adı `{hukuk_fix1_test}`, loopback) ile disposable ortamı zorunlu kılar. Canlı yürütme bu
> betikleri **canlıya uyarlamaz**; canlı ölçüm ayrı bir salt-okuma betikle (canlı DB'ye yalnız SELECT + TEK canlı
> API üzerinden HTTP) yapılırsa sha'sı GO'da pinlenir. **İkinci bir canlı-DB API AÇILMAZ** (owner kuralı).

**7.4 · Sayaç bağlama (counter loading) + SMTP/mock anahtarı.** Tek canlı API'nin taşıması pencerede sink'e
yönlendirildikten sonra: FD yolunda gerçek `dispatcher.send` `i3-spy` deseniyle (ürün kodu değişmez, `--require` ile
`ClientFinancialDisclosureEmailDispatcher` sarmalanır) sayılır; bilgi-talebi yolunda sink `conn-*` (bağlantı) +
`msg-*` (mesaj) dosya sayımıyla; G7 yolunda **run-scoped** sink `msg-*` (alıcı `client-<runId>@…`) + teslim defteri
`SENT` sayımıyla. Sink modu dosyayla anahtarlanır (``→ACCEPTED, `reject`→550, `reset`→ECONNRESET, `hang`→greeting-timeout).

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

**7.7 · Cron kapsam izolasyonu (provada doğrulanan yöntem).** Otonom tetik `runMonthlyDelivery(now, {})` = **boş-scope
= tüm ACTIVE tenant taraması** (üretim davranışı). Kapsamın "yalnız hedefi seçtiği" prova yönteminde şöyle doğrulandı:
hedef tenant'a doğru-dönem aktivitesi + Office SMTP verildi, **yabancı tenant aktivitesiz** bırakıldı → yabancı tenant
`SKIPPED_NO_RECIPIENT`/`SKIPPED_EMPTY_PERIOD`, teslim defteri **0**; ölçüm ayrıca **run-scoped** (alıcı `client-<runId>`)
yapılarak aynı disposable DB'de birikmiş diğer koşum tenant'larının teslimlerinden yalıtıldı. Canlıda scope'lu
`runMonthlyDelivery(now, {tenantId})` doğrudan çağrısı da kullanılabilir (canlı kanıt); kalıcı kısa-cron EKLENMEZ.

**7.8 · Restart bütçesi · geri-alma · kapanış.** Restart bütçesi = **0 zorunlu restart** (pencere env değişiklikleri
API sürecini yeniden başlatmadan uygulanabilirse tercih edilir; sağlayıcı/SMTP env'i süreç başında okunuyorsa owner
yükseltilmiş komutuyla **en çok 1** kontrollü restart, öncesi/sonrası sha pin ile kaydedilir — canlı sürüm `2740df3d`
değişmez). **Geri-alma (rollback):** pencere açıkken geri dönüş gerekirse ÖNCE T-PENCERE-KAPA (env SMTP özgün hedefe,
`EMAIL_PROVIDER`/sağlayıcı allowlist-içi, hedef tenant Office SMTP özgün değere), doğrulama, sonra §6 kapanışı.
**Kapanış:** erişim sonlandırma (çıkıştan bağımsız `isActive=false`+`tokenVersion++`) + izolasyon/geri-alma
doğrulaması + kanıt SHA256 manifesti korumalı yerel arşive. **IF GO-COMPLETE:** yedi gözlem PASS + kapanış → İ12
KAPANIR, **sayaç 11/17 → 12/17**, hizmet **0/8 tam**.

## 8. Hazırlık durumu (bu belge)

- İ12 kapsam/bağımlılık/ölçüt kaynaklarıyla çıkarıldı (§1); mevcut ürün/test farkı belirlendi (§2); yeniden açma yok.
- Düzenek İ3'ten yeniden kullanılır; yeni kollar (`i12-fd-outcome`, `i12-monthly`) + orkestratör tanımlı (§3).
- **PROVA:** izole/geçici ortamda koşuldu; sonuçlar §9 (R01 yedi gözlem) + §9.2 (R02 claim/reclaim/hang) + §9.3 (R03
  cron teslim içeriği). Ürün kusuru çıkmadı (yalnız bir **bayat yorum** ayrıldı, §2; ayrıca §7.2'de belgelenen iki
  ayrı SMTP kaynağı — env vs Office DB — bir yapılandırma gerçeğidir, kusur değil).

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

| Ölçüm | Sonuç | Kanıt (gerçek çıktı) |
|---|---|---|
| **G7-DELIV** teslim içeriği + dedupe | **PASS** | `i12-cron-delivery.js`: otonom tetik=2 · **ilk tetikte gerçek gönderim** (loopback sink `msg`, alıcı `client-<runId>@ah-harness.invalid`) **+1** · **aynı dönem sonraki otonom tetiklerde ek gönderim +0** · teslim defteri `clientStatementDeliveryLedger` **SENT +1** (`markSent`) · `ClientNotification` **SENT +1** · **run-scoped** sink sayımı (mükerrer gönderim iddiası ancak bu alıcıda >1 mesajla doğardı — gözlenmedi) · **yabancı tenant teslim defteri = 0** (kapsam izolasyonu) · son (tekrar) tetik `delivered=0` (already-SENT → claim SKIP `ledger-claim-lost`) |

**Kapsam izolasyonu (provada doğrulanan yöntem):** otonom tetik boş-scope (tüm ACTIVE tenant) tarar; yabancı tenant
aktivitesiz → `SKIPPED_NO_RECIPIENT` (teslim defteri 0). Sink GLOBAL yakalama olduğundan aynı disposable DB'de
birikmiş DİĞER koşum tenant'ları da teslim alabildiği için gönderim ölçümü **bu koşumun alıcısına** (`client-<runId>`)
kapsamlandı — böylece "ilk tetik 1 / sonraki 0" iddiası kontaminasyondan yalıtıldı (bu, R03 sırasında bulunan bir
ölçüm-izolasyonu inceliğidir; ürün kusuru değil).

**R03 durable kanıt:** `…\Documents\CLIENT-EVIDENCE-20260911\i12-cron-delivery-<ts>\` — `i12-cron-delivery-evidence.json`
(G7-DELIV PASS) · `cron-delivery-last-result.json` (son tetik `delivered=0`) · `cron-delivery-predicate-state.json`
(enabled/registered, ifade `0 3 1 * *`) · `api-delivery-excerpt.log` (hook satırları) + SHA256 manifesti
`MANIFEST-SHA256-i12-cron-delivery.txt` (manifest sha `4CCC306F…`). Sentetik; sır/ref/.env yok.

**Kanıt arşivi (durable, synthetic — sır/ref/.env yok):** `…\Documents\CLIENT-EVIDENCE-20260911\i12-rehearsal-<ts>\`
— `i12-gaps2-evidence.json` · `cron-predicate-state.json` · `cron-last-result.json` · `cron-run.log` + SHA256
manifesti `MANIFEST-SHA256-i12-rehearsal.txt` (manifest sha `754F33BA…`). **R01 koşumlarının (i12-gaps/i12-allowlist/
i3-run) ham logları prova ortamı ilk temizliğinde silindi**; verdict + gözlenen değerleri §9/§9.2 tablolarında korunur
(kalıcı ham-log kopyası R01 için YOK — açıkça belirtilir; R02 + cron için durable kopya + manifest bağlandı).

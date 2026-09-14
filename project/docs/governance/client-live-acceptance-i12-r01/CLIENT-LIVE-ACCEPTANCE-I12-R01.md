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

## 7. §7 — TEK KOŞULLU OWNER GO TASLAĞI (İ12 CANLI KABUL · owner kararına)

> **GO — CLIENT İ12 H6 GÖNDERİM TAM CANLI KABUL** (taslak; canlı yürütme ayrı yazılı owner onayı ister)
>
> Referans: İ12 `OWNER-GO-CLIENT-I12-<YYYYMMDD>-R<nn>` — owner'ın CLIENT oturumuna birebir vereceği değer.
> **Gerçek biçimli ref bu belgede/hazırlık dosyalarında ÜRETİLMEZ/yazılmaz** (yer tutucu). K-GO/K-REF İ11 ile aynı
> desende (biçim + tüketim kontrolü); ref hiçbir repo/prova dosyasına yazılmaz, yalnız koşum kanıtı.
> **Onay sınırı:** onay yalnız owner'ın bu metni açıkça "GO" demesiyle; yer tutucu doldurmak onay değildir. Bu GO
> D1/mühür/authority/cutover DEĞİLDİR; RELEASE23 canlı kalır.
>
> 1. **Sabit kimlikler:** canlı RELEASE23 `2740df3d…`; test sağlayıcı = loopback sink (`reject`/`reset`/`hang` modları);
>    **gerçek alıcıya gönderim YOK** (alıcı `.invalid` + allowlist + izolasyon). Kanıt yöntemi: izole/geçici ortam
>    (disposable PG + RELEASE23 dist salt-okuma + i3-spy sayacı).
> 2. **Ön koşullar:** izolasyon ön koşulu PASS (loopback+LAN-yok+provider=smtp→sink+pid+tanık); RELEASE23 yönlendirme
>    (I3_DIST_MAIN/…); disposable ortam kapısı; aylık cron env'i disposable'da açılır (canlı scheduler'a dokunulmaz).
> 3. **Yedi gözlem** (§1) TEK koşumda ölçülür; her biri üç-değerli verdict; UNMEASURED PASS sayılmaz.
> 4. **Kapsam dışı:** gerçek gönderim · canlı DB yazma · deploy/restart · canlı scheduler değişimi · İ11'i yeniden
>    koşma · ürün kodu değişimi · kapsam büyütme.
> 5. **Kapanış:** erişim kapanışı (çıkıştan bağımsız) + izolasyon doğrulaması + kanıt SHA256 manifesti korumalı
>    yerel arşive. **IF GO-COMPLETE:** yedi gözlem PASS + kapanış → İ12 KAPANIR, **sayaç 11/17 → 12/17**, hizmet 0/8 tam.
>
> **7.1 · Test sağlayıcısının canlıya bağlanması (İ11 Yöntem-T penceresi deseni):** Canlı RELEASE23 örneğinin
> e-posta taşıması, bakım penceresinde **loopback sink'e yönlendirilir** — `SMTP_HOST→127.0.0.1`, `SMTP_PORT→<sink>`,
> noauth sink; `EMAIL_PROVIDER=smtp` (allowlist içi) korunur. Pencere owner'ın yükseltilmiş komutuyla açılır/kapanır
> (env pin + geri-alma, İ11 T-PENCERE-AÇ/KAPA deseni); **gerçek alıcıya bayt gitmez** (sink + `.invalid` + allowlist).
> Gerçek `dispatcher.send` FD yolunda `i3-spy` eşdeğeri sayaçla; bilgi-talebi yolunda sink `conn-*` sayımıyla ölçülür.
> **7.2 · Her ölçüt canlıda nasıl kanıtlanır:**
> - **G1/G2:** canlı API'ye bilgi talebi; sink `reject`→503 `EMAIL_FAILED` (ClientInfoRequest yazılmaz) · sink
>   `reset`→503 `EMAIL_INDETERMINATE` (yazılmaz, `conn-*` farkı=1 → ikinci çağrı yok).
> - **G3/G6:** canlı FD sürümü onay zincirinden yayınlanır → PUBLISHED + `providerMessageId` + `AuditLog` `_SENT`=1/
>   `_PUBLISHED`=1 (yayın runId/version-kapsamlı) + duplicate=0.
> - **G4:** aynı sürüm ikinci yayın → 4xx state-guard · gerçek send +0 · yeni audit +0.
> - **G5:** allowlist-dışı sağlayıcı (pencere dışı `mock`/yapılandırma) → 403 `PROVIDER_NOT_PRODUCTION` · send=0.
> - **G7:** predicate (canlı env `CLIENT_STATEMENT_MONTHLY_DELIVERY`) + `runMonthlyDelivery` doğrudan çağrı (scope'lu,
>   canlı kanıt) + gerçek zamanlayıcı: **canlı takvim `0 3 1 * *`** ya beklenir ya da owner onaylı hızlandırma açıkça
>   ayrı kaydedilir (prova hızlandırması canlı takvim kanıtı sayılmaz).
> - Ölçüm kuralları prova ile aynı (üç değerli verdict; UNMEASURED PASS olmaz; HTTP kodu tek başına yetmez).

## 8. Hazırlık durumu (bu belge)

- İ12 kapsam/bağımlılık/ölçüt kaynaklarıyla çıkarıldı (§1); mevcut ürün/test farkı belirlendi (§2); yeniden açma yok.
- Düzenek İ3'ten yeniden kullanılır; yeni kollar (`i12-fd-outcome`, `i12-monthly`) + orkestratör tanımlı (§3).
- **PROVA:** izole/geçici ortamda koşuldu; sonuçlar §9'da. Ürün kusuru çıkmadı (yalnız bir **bayat yorum** ayrıldı, §2).

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

**Ölçülemeyen / kapsam dışı bırakılan:** yok. Yedi gözlemin tamamı gerçek çıktıyla PASS. **Prova kanıtı ≠ canlı kabul
kanıtı** — İ12 KAPANMADI; sayaç **11/17**, hizmet **0/8 tam**. Canlı kabul ayrı owner GO'su (§7) ister.

**Scriptler (bu paket):** `scripts/i12-gaps.js` (G3/G4/G6/FD-RED/FD-TMO) · `scripts/i12-cron-hook.js` +
`scripts/i12-cron-run.js` (G7) · `scripts/i12-allowlist.js` (G5). İ3 düzeneği (`i3-lib`/`i3-start-api`/`i3-sink`/
`i3-spy`/`i3-h5-intake`) yeniden kullanıldı; RELEASE23'e env override ile yönlendirildi. Ref literali/`.env` değeri/sır
scriptlerde YOK.

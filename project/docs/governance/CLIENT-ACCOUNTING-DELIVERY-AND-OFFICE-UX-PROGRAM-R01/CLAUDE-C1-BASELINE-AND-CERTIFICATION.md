# C1 — BASELINE + COVERAGE MATRIX + METİN ONARIMI + UÇTAN UCA SERTİFİKASYON (P0 · P1 · P8)

```text
PROGRAM:      CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01
THIS PAGE:    CLAUDE-C1        LANE OWNER: CLAUDE
PREDECESSOR:  YOK — programın ilk hattı
SUCCESSOR:    C1-B02 (#2270 merge) → C2 · C3 · X1 · X2 · X3-B01
              (OWNER DÜZELTMESİ C1-B02-CLOSEOUT-CORRECTION-R01: DALGA 1'in açılma anı
               YALNIZ C1-B02'nin merge'idir; C1-B01 tek başına hat AÇMAZ)
              C1-B03+ (UAT) → tüm hatların ARDILI

ALLOWED PATHS:
  project/docs/governance/CLIENT-ACCOUNTING-DELIVERY-AND-OFFICE-UX-PROGRAM-R01/
  <C1-B02 EXACT WRITE MANIFEST>          (yalnız metin onarımı; blok başında yayımlanır)

FORBIDDEN PATHS:
  apps/web/src/components/client-compliance/**  ·  .../client-disclosure/**   (C2 · X1)
  apps/api/src/modules/client-statement/**  ·  .../client-financial-disclosure/**  (C3 · X2)
  apps/api/prisma/                                                (MIGRATION OWNER = X3)
  apps/web/src/components/client-accounting/**                    (ÇALIŞAN EKRAN)
  project/docs/governance/CLIENT-MODULE-TERMINAL-COMPLETION-PROGRAM-R01/  (KAPALI PROGRAM)
  .github/ · ci.yml · coordination-v2/activation/ · project/scripts/orchestration-v2/

BLOCK ORDER (DEĞİŞTİRİLEMEZ):
  C1-B01 → C1-B02 → C1-B03 → C1-B04 → C1-B05
BLOCKS TOTAL: 5   COMPLETED: 5 (B01, B02, B03, B04, B05 — B05 kaydı corrective PR merge'i ile atomik)
ACTIVATION DEBT: kalıcı production CREDENTIAL_ENCRYPTION_KEY provisioning (enc:v1 mühendisliği B04'te
                 hazır; anahtar owner-side) + C3 schedule + EXPENSE_ACTUAL_POSTED şablon seed'i
                 (mevcut tenant'lar) — B05 sertifikasyon bloğunda kayıtlı.
LANE STATUS:  B03 CLOSED/RUNTIME_VERIFIED (doğal-oturum UAT, #2315). B04 ENGINEERING_COMPLETE/
              COMPOSITE_ACCEPTANCE (Turhost gerçek teslim + content düzeltmesi #2322). B05
              PRODUCT_COMPLETE — A #2323 (kanonik dispatcher + G4) + B corrective PR (typed
              EXPENSE_ACTUAL + durable delivery-intent + migration 20260809210000).
PROGRAM LOCK: CLIENT ACCOUNTING DELIVERY + CLIENT OFFICE UX ONLY
```

---

## C1-B01 — FRESH BASELINE + COVERAGE MATRIX + DİLİM ATAMASI  *(docs-only)*

**1. Baseline sabitleme**
`git fetch origin` → fresh `origin/main`. `#2262` / `94ddb975` için
`git merge-base --is-ancestor` doğrulaması. Kapalı programın
`CLIENT PROGRAM STATUS: TERMINAL_CLOSED / PRODUCTION_VERIFIED / CANONICAL` satırı
**okunur** (değiştirilmez). Bayat kayıt reddi (`f34c371a`, "WAVE 4 açık") bu programın
kendi sayfasında kaydedilir — kapalı programın dosyasına DOKUNULMADAN.

**2. Coverage matrix** — master plan §6 şekli, 12 hareket, 10 sütun.
Her hücre exact dosya/route/kolon/enum referansı taşır. `UNKNOWN` geçerli ve terminal
hücre sonucudur. `.env`/secret OKUNMAZ; runtime kanıtı üretilemiyorsa `UNKNOWN`.

**3. Dilim ataması** — her boş/`UNKNOWN` hücre master plan §3'teki **mevcut** bir hatta
ve bloğa bağlanır. Yeni hat AÇILMAZ. Bu blok implementation BAŞLATMAZ.

**BLOCK RESULT:** `ANALYSIS_DELIVERED`
**MERGE SONRASI AÇILAN:** — (OWNER DÜZELTMESİ: hat açılışı YALNIZ C1-B02 merge'ine bağlıdır)

> **B01 SONUCU (2026-08-08, baseline afd84aee):** `ANALYSIS_DELIVERED` — kanıt dosyası
> `C1-B01-BASELINE-COVERAGE-MATRIX.md` (bu dizin): 13 hareket × 9 sütun exact-referanslı
> matris; #2262/#2265 ancestry VERIFIED; kapalı program satırı :1198 salt-okuma OBSERVED;
> bayat kayıt reddi kaydedildi; dilim ataması §3 (C2/C3/X1/X2/X3 + 3 hat-dışı disposition
> F-5/F-6/F-7); bulgular F-1..F-8. Runtime: Web 3002 UP, API 3001 DOWN → runtime-visible
> doğrulaması C1-B03/UAT'a ertelendi. Ürün/şema/production mutation YOK (docs-only).

---

## C1-B02 — MOJIBAKE, DİAKRİTİK VE BOŞ-DURUM METNİ ONARIMI (P1)

**Kapsam:** mojibake · "Bilgi Talepleri" boş-durum metni · Türkçe/İngilizce ve
diakritik tutarsızlıkları.

```text
YAPILMAZ: mevcut işleyen ekranların yeniden tasarımı
YAPILMAZ: bileşen API'si / prop sözleşmesi değişikliği
YAPILMAZ: şema · migration · backend çağrısı değişikliği
YAPILMAZ: "bu arada şunu da düzeltelim" — NEW FINDING RULE geçerli
```

**Yürütme kuralı:** blok başında **exact write manifest** yayımlanır (gerçek dosya
adları; `**/*` wildcard YETERSİZ). Bozukluk taraması manifesti belirler; manifest
dışına çıkılmaz — çıkmak gerekirse manifest revize edilip yeniden yayımlanır.

> Bu blok **çapraz kesen** olduğu için serilik zorunludur. Merge edilmeden C2 ve X1
> açılmaz (master plan §3-A).

**BLOCK RESULT:** `ENGINEERING_COMPLETE`
**MERGE SONRASI AÇILAN:** C2 · C3 · X1 · X2 · X3-B01 → **DALGA 1 beş paralel hat**
(OWNER DÜZELTMESİ C1-B02-CLOSEOUT-CORRECTION-R01: açılma anı = #2270 merge; X3 yalnız
B01 docs-only; X3-B02 ve X3-B03 C3'ün canonical merge/terminal predecessor koşulu
sağlanmadan BAŞLAMAZ, migration HAZIRLANMAZ; C3, X2 client-safe referans primitifi
merge edilmeden bağımlı bloğa GEÇMEZ)

> **B02 SONUCU (2026-08-08):** `ENGINEERING_COMPLETE` — exact manifest ile en küçük patch:
> (1) `client.controller.ts:330` kullanıcı-görünür mojibake ('MÃ¼vekkil bulunamadÄ±' →
> 'Müvekkil bulunamadı') + :365/:384 aynı-dosya yorumları; (2) Bilgi Talepleri boş-durumu
> sekmeye bağlamlı metne çevrildi; (3) `client-right-panel.tsx` 12 diakritik metin;
> (4) action-catalog copy 34 string Türkçe (label+description+disabledReason; repo deseni
> = inline TR copy, i18n altyapısı yok). Characterization: API 27/27 + Web 33/33 PASS;
> tsc (prod config) her iki app TEMİZ. UI smoke B02 merge sonrası canonical dev
> server'da yapıldı (aşağı bkz.).
> **B02 bulguları (disposition — blok sayacı değişmedi):** F-9 `client.controller.ts`
> dosya-geneli YORUM mojibake'si (31 satırda düzgün TR + ~15 satırda mojibake KARIŞIK —
> güvenli toplu transform mümkün değil, satır-satır onarım ayrı iş); F-10 operating-
> snapshot SIGNAL label/description'ları (:2722-3005) ve timeline title'ları
> (:1400-1442) İngilizce — owner listesi dışında bırakıldı.
> **TABLET ACCEPTANCE (C1-B02-CLOSEOUT-CORRECTION-R01):** Live Smoke'a `tablet-chromium`
> projection'ı eklendi (820×1180, chromium; playwright.client-workspace.config.ts) —
> B02 yüzeyleri desktop+mobile'A EK tablet kırılımında da gerçek API+DB ile doğrulanır;
> metin/layout görünürlük assert'leri + console-error toplayıcı (`runtimeErrors===[]`,
> başarısız network istekleri console error olarak yakalanır) bu düzeltme PR'ının yeşil
> Live Smoke check'iyle kanıtlanır. Tablet doğrulanmadan B02 ENGINEERING_COMPLETE
> SAYILMAZ — bu kayıt merge ile atomik doğrudur.

---

## C1-B03 — PORTAL UÇTAN UCA UAT (P8/1)

Güvenli **demo** portal hesabıyla portal FD ve geçmiş ekranları doğrulanır.
Desktop / tablet / mobile · console ve network temiz · **tenant izolasyonu** ·
**rol matrisi** PASS. Ürün kodu yazılmaz; bulgu çıkarsa ilgili hatta disposition
için bildirilir.

**ÖNCÜL:** C2 · C3 · X1 · X2 tamamlanmış olmalı.
**BLOCK RESULT:** `RUNTIME_VERIFIED`

> **B03 SONUCU (2026-08-09, owner RATIFIED/GO-COMPLETE):** `RUNTIME_VERIFIED` — kontrollü cutover ile
> RC `1488063d` canlıya alındı (PRESERVED w5-artifact `62199535`+hotfix rollback noktası korundu; immutable
> release worktree `.worktrees/rc-1488063d`; task-target cutover; custom-format DB backup SHA-256
> `ed341c4f…` + `pg_restore --list` PASS; 0 pending migration). UAT PASS: DSAR durum makinesi ·
> legal-hold maker-checker (403 same / 201 RELEASED farklı-eligible) · deletion-gate fail-closed ·
> rol sınırı · **tenant izolasyonu D-2/D-3 İNTAKT** · portal/web render (authenticated network tüm 200).
> UAT tenant/aktör/veri temizlendi (eski token replay 401). Kanıt: `C1-B03-RUNTIME-VERIFICATION-CLOSEOUT-R01.md`.
> Kapsam = owner GO-COMPLETE kabul matrisi (compliance yüzeyleri + izolasyon + rol); #2303 şemaları RC-dışı.

> **DÜZELTME (2026-08-09, owner ratified) — B03 REOPENED / AUTH-CONTINUITY RESIDUAL:** Yukarıdaki
> `RUNTIME_VERIFIED` ilanı ERKENDİ. Portal UAT'de token elle localStorage'a enjekte edilmişti; bu yalnız
> backend + render kabiliyetini kanıtlar, **doğal oturum sürekliliğini KANITLAMAZ**. Doğal soft-navigation
> akışında (login→link→compliance, enjeksiyon YOK) compliance'ın TÜM API çağrıları **401** döndü — aynı
> oturumda `/clients/:id/action-catalog` 200 (`lib/api.ts`) ↔ 401 (`lib/api/client.ts` apiClient). Kök neden:
> apiClient YALNIZ localStorage okuyordu; "Beni hatırla" KAPALIYKEN token yalnız sessionStorage'a yazılır
> (OFFICE-AUTH-P01). Fix: apiClient token çözümlemesi kanonik `api` singleton'ına delege (tek-kaynak) +
> regresyon testi → **CAD-C1-B03-AUTH-CONTINUITY-REMEDIATION-R01**. Yeni immutable RC + kontrollü deploy +
> doğal browser UAT PASS sonrası B03 telafi kaydıyla yeniden RUNTIME_VERIFIED yapılır. #2307 tarihsel kayıt
> olarak KORUNUR (geriye dönük silinmez).

> **YENİDEN RUNTIME_VERIFIED (2026-08-09) — auth-fix RC + doğal UAT PASS:** Fix `#2315` (`bb0471b1`) merge; yeni
> minimal immutable RC = `1488063d` + web auth-fix (#2303 şemaları DIŞI, 0 migration) → Web task cutover
> (`rc-authfix`, BUILD_ID `1Oj9kJFN`), API `rc-1488063d`'de değişmedi. **Doğal browser UAT (enjeksiyon YOK,
> "Beni hatırla" KAPALI → token sessionStorage):** login→soft-nav(link)→compliance = 8 API çağrısı **200** +
> console 0 hata; **refresh** (hard-reload) → **200**; **new tab** → tutarlı **login-redirect** (authenticated
> sayfada toplu 401 YOK). Kabul karşılandı → B03 yeniden `RUNTIME_VERIFIED`. Kanıt:
> `C1-B03-AUTH-CONTINUITY-REVERIFY-CLOSEOUT-R01.md`. Rollback: Web→`rc-1488063d/apps/web`; deep→`w5-artifact`.

---

## C1-B04 — CANARY TESLİMLERİ (P8/2)

```text
- TELLİ HUKUK GERÇEK müvekkillerine test maili GÖNDERİLMEZ.
- Demo tenant + owner'ın yetkilendirdiği canary alıcısı kullanılır.
- Olay bildirimi için TAM 1 canary.
- Dönemsel ekstre için TAM 1 canary.
- Owner teslim teyidi alınmadan kalıcı publication/schedule activation YAPILMAZ.
```

Canary çıktısı **içerik doğruluğu** üzerinden değerlendirilir: tutarlar, kesinti
kalemleri, net pay, para birimi, tarih ve izin verilen dosya referansı **doğru** mu;
yasak alan sızmış mı. "Mail gitti" tek başına PASS DEĞİLDİR.

**BLOCK RESULT:** `RUNTIME_VERIFIED`

> **B04 DURUMU (2026-08-09):** `PAUSED / PROVIDER_CONFIGURATION_REQUIRED` —
> REAL DELIVERY=0, PIPELINE/PDF=VERIFIED. İzole canary DB (`hukuk_canary_c1b04`,
> NON_PRODUCTION, 121 migration) üzerinde statement + PDF eki + dispatch-to-provider
> kanıtlandı; ancak gerçek SMTP turunda provider **535 authentication** döndü
> (535'ten parola-türü çıkarımı YAPILMADI). Config secretless doğrulandı
> (user/from EXACT=mailbox, host/port/TLS geçerli SSL kombosu); mailbox SMTP-erişimi
> ve hesap kilit/throttle durumu UNKNOWN (provider-tarafı). Canary `smtpPass`→NULL
> (row-count=1), geçici owner-run script'leri kaldırıldı, RC worktree temiz.
> Production-class demo-firma B04 mutation'ları exact-ID rollback ile geri alındı
> (audit korundu). **B04 PASS/ENGINEERING_COMPLETE İLAN EDİLMEDİ.** Sonraki gerçek
> teslim denemesi ANCAK kalıcı+şifreli credential yönetimi (`CREDENTIAL_ENCRYPTION_KEY`
> + AES-256-GCM at-rest) hazır olduğunda; owner her seferinde parola girmeyecek.
>
> **SECRET EXPOSURE SINIFLANDIRMASI (owner-ratified):**
> ```text
> REPOSITORY/LOG/PR EXPOSURE: 0
> CHAT TRANSCRIPT EXPOSURE:    YES / CREDENTIAL COMPROMISED
> ROTATION REQUIRED:          YES
> ```
> Repo/log/PR temizdir; ancak canlı denemede parola sohbet transkriptine düştüğü için
> credential COMPROMISED sayılır ve rotate edilmelidir. (Parola/parçaları/transkript
> bağlantısı bu kayda BİLİNÇLİ olarak yazılmamıştır.)
>
> **KESİN STATUS:** C1-B04 = PAUSED / PROVIDER_CONFIGURATION_REQUIRED ·
> C1-B05 = NOT ELIGIBLE / WAITING_FOR_PREDECESSOR ·
> NEXT ELIGIBLE = C1-B04 provider remediation/resumption.
> Detay: `C1-B04-CANARY-PROVIDER-CONFIG-REQUIRED-R01.md`.

---

## C1-B05 — PRODUCT_COMPLETE SERTİFİKASYONU

Master plan §9 eşiği tek sayfada kanıtla doğrulanır:

```text
ofis ekranı + portal + doğru finansal içerik + PDF + yetki + audit +
idempotency + GERÇEK canary teslimi   →   HEPSİ BİRLİKTE
```

Eksik varsa `PRODUCT_COMPLETE` **ilan edilmez**; eksik kalem ilgili hatta geri gider.
Activation borcu doğmuşsa (X3 migration, C3 schedule) ayrı kaydedilir ve owner'ın
mevcut production mutation disiplinine tabidir.

**BLOCK RESULT:** `ENGINEERING_COMPLETE` veya `WAITING_FOR_OWNER_DECISION`

> **B04 SONUÇ DÜZELTMESİ (2026-08-09, owner-ratified):** Turhost gerçek teslim controlled recovery ile
> TAMAMLANDI (transport+PDF PASS, owner inbox teyidi); content-acceptance düzeltmesi #2322 `b130c658`
> merge. **B04 = ENGINEERING_COMPLETE / COMPOSITE_ACCEPTANCE.** Detay: `C1-B04-CANARY-DELIVERY-PASS-R02.md`.

> **B05 SONUCU (2026-08-09, owner GO-COMPLETE):** İki parçalı teslim — owner kararı gereği A erken
> merge'i ARA TESLİM sayıldı, B ayrı corrective completion PR'ı ile tamamlandı:
> - **B05-A (pre-expense) #2323 `a02df8ee`:** legacy expense maili → kanonik EXPENSE_REQUEST template +
>   NotificationDispatcherService; G4 atomik claim/reclaim (advisory-lock, migration'sız); provider-outcome
>   güvenlik sınıflandırması (kesin 5xx→FAILED; belirsiz→PENDING, kör resend yok). Gerçek-PG concurrency 4/4.
> - **B05-B (post-expense, bu PR):** TYPED `EXPENSE_ACTUAL` posting (`BalanceLedger.entryKind` + tenant-başına
>   unique `postingKey`; yalnız ADMIN-gate `postExpenseActual`; generic DEBIT/reversal/ExpenseRequest
>   RECEIVED-PAID ASLA trigger değil) + DURABLE delivery-intent (QUEUED→PENDING→SENT/FAILED; posting tx'i
>   yalnız QUEUED üretir, provider commit sonrası; PENDING otomatik resend edilmez; FAILED yalnız explicit
>   reclaim). Tek additive migration `20260809210000` (preflight: rakip writer YOK; izole test DB'de
>   baseline+frontier+fresh-rebuild deploy PASS; backfill YOK). Kanıt: unit 27 + gerçek-PG 11 test PASS —
>   `C1-B05-B-TYPED-EXPENSE-ACTUAL-CLOSEOUT-R01.md`.
>
> **§9 SERTİFİKASYON (kanıt haritası):** ofis ekranı (X1 workspace + C2/C3 yüzeyleri CLOSED) · portal
> (B03 doğal-oturum UAT `RUNTIME_VERIFIED`, #2315) · doğru finansal içerik (B04 content-acceptance
> düzeltmesi #2322 + B05 tr-TR/POL-4/fail-closed içerik testleri) · PDF (B04 gerçek ekstre PDF teslimi) ·
> yetki (ADMIN/authority-gate'ler + POL-5) · audit (ledger+journal+notification aynı source identity) ·
> idempotency (G4 claim + posting `postingKey` unique, gerçek-PG concurrency kanıtı) · GERÇEK canary
> teslimi (B04 Turhost, owner inbox teyidi). **C1-B05 = PRODUCT_COMPLETE — bu kayıt B05-B corrective
> PR'ının merge'i ile atomik doğrudur.**
>
> **KALAN ACTIVATION DEBT (PRODUCT_COMPLETE'i bloklamaz; owner production-mutation disiplinine tabi):**
> (1) kalıcı production `CREDENTIAL_ENCRYPTION_KEY` provisioning (enc:v1 mühendisliği B04'te hazır;
> anahtar owner-side), (2) C3 schedule/cron aktivasyonu (bayrak OFF, envanter C3 sayfasında),
> (3) B05-B `EXPENSE_ACTUAL_POSTED` şablonunun mevcut tenant'lara seed'i (yeni tenant'ta otomatik;
> mevcutta `seedDefaultTemplates` owner-run).

---

## W4 — PRODUCTION ACTIVATION ZİNCİRİ (OWNER GO'LARI İLE KAPANDI)

> **W4 SONUÇ (2026-08-10, owner GO-COMPLETE zinciri):**
>
> ```text
> W4-ACT01  FOUNDATION CUTOVER   = COMPLETE          (backup + 121→125 + release cutover +
>                                                     stable CEK + SMTP re-provision + template 9/3/0)
> W4-ACT02A SINGLE CANARY        = CLOSED / ACCEPTED (1 gerçek e-posta; içerik kabulü PDF v3
>                                                     SHA 55541291…c166; düzeltme PR'ları #2327-#2331)
> W4-ACT02B GLOBAL ACTIVATION    = PRODUCTION_ACTIVE / COMPLETE
> ```
>
> `CLIENT_STATEMENT_MONTHLY_DELIVERY=true` kalıcı; API=`HY_W4_RELEASE5`@`ecf32001`,
> Web=`HY_W4_RELEASE3`@`c59a7cbe`; cron `0 3 1 * *` Europe/Istanbul, sonraki koşu
> **2026-09-01 03:00** (envanter 33→34); ACT02B sırasında gerçek provider çağrısı **0**;
> bounded impact PLAN: 8 taranan → beklenen gerçek e-posta **0**; queue 0/0/0;
> migration 125/125; rollback GEREKMEDİ (pointer sırası RELEASE4→RELEASE3→RELEASE2→rc-*).
> Yukarıdaki üç kalemlik ACTIVATION DEBT bu zincirle **CLOSED** (CEK→ACT01,
> şablon seed→ACT01 allowlist 9/3/0, C3 schedule→ACT02B).
> Kanıt: `W4-ACT02B-PRODUCTION-ACTIVATION-R01.md`.
>
> **C1 LANE = PRODUCT_COMPLETE + PRODUCTION_ACTIVE.**
> NEXT ELIGIBLE = CLIENT PROGRAM TERMINAL CONSOLIDATION (ayrı owner GO).

# W3 — Successor Task’ler

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


Her residual icin **tekil** successor. "Async eksikleri duzelt" gibi toplu task URETILMEDI.

---
## W3-F01-OUTBOX-WEBHOOK-HANDLER-MODEL-CONTRACT-R01
- **capability:** `IcrabotOutboxAction` / `webhook` action handler
- **defect:** W3-D01 — semada `IcrabotWebhookLog` YOK
- **paths:** `action-handler.service.ts:747-766`, `prisma/schema.prisma`
- **beklenen runtime sonucu:** `webhook` action ya gercekten kayit uretir ya da ILK denemede terminal reddedilir; 8 deneme yakilmaz
- **prerequisite:** owner karari — (a) modeli ekle, (b) handler'i kaldir, (c) `NonRetryableOutboxError` yap
- **bagimlilik:** (a) secilirse **MIGRATION**

**SONUC (R01, [PR #1998](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/1998), merge `f32e9423`):**
CLOSED. Secim (b) — handler kaldirildi. `IcrabotWebhookLog` migration
gecmisinde HICBIR ZAMAN olusturulmamis (saf olu referans); aktif/test hicbir
rule-pack `webhook` uretmiyordu; handler zaten gercek HTTP cagrisi yapmiyordu.
Producer (`EngineRunnerService`) action'i outbox'a hic yazmadan reddeder — ILK
denemede terminal, 8 deneme yakilmaz, kardes action'lar etkilenmez. Detay:
`defect-register.md` → Cozum Kaydi → W3-D01.

---
## W3-F02-OUTBOX-CONSUMER-TENANT-OWNERSHIP-R01
- **capability:** outbox consumer handler katmani
- **defect:** W3-D02 — caseId->tenant sahipligi yeniden dogrulanmaz; 5 etki tablosunda `tenantId` yok
- **paths:** `action-handler.service.ts` (6 handler), `schema.prisma` (IcrabotNotification/SmsLog/EmailLog/Task/UyapSubmission)
- **beklenen runtime sonucu:** tutarsiz `(tenantId, caseId)` cifti fail-closed reddedilir; etki satiri tenant'a atfedilebilir
- **prerequisite:** owner karari — dogrulama hangi katmanda zorunlu (dispatch mi handler mi)
- **bagimlilik:** **MIGRATION** (tenantId kolonlari + backfill)

**SONUC (R01, [PR #1990](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/1990), merge `cfccfb6c`):**
CLOSED. Yukaridaki `bagimlilik: MIGRATION` varsayimi, uygulama incelemesinde
GEREKSIZ oldugu kanitlandi — invariant, 7 handalin ONCESINDE (asil listelenen
6 + `update_case_status`) merkezi `dispatch()` gate'inde, salt `Case.tenantId`
(halihazirda NOT NULL/otoriter) uzerinden, sema degisikligi OLMADAN kapatildi.
Dogrulama katmani: dispatch (handler-basina degil). Detay: `defect-register.md`
→ Cozum Kaydi → W3-D02.

---
## W3-F03-SCHEDULER-TIMEZONE-DECLARATION-R01
- **capability:** tum `@nestjs/schedule` yuzeyi
- **defect:** W3-D04 — 32/33 job'un timezone'u ortamdan turer
- **paths:** 35 `@Cron` bildirimi
- **beklenen runtime sonucu:** `TZ` degistiginde job saatleri DEGISMEZ
- **prerequisite:** owner karari — hedef timezone ve kapsam (hepsi mi, yalniz sure hesaplayanlar mi)
- **bagimlilik:** config yok, migration yok; **scheduler politikasi** karari

**SONUC (R01, [PR #2032](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/2032), merge `9e55f0bf`):**
CLOSED. Hedef: tum runtime-bound cron yuzeyi (32 job'un tamami — sadece sure
hesaplayanlar degil). Merkezi `SCHEDULER_TIMEZONE = 'Europe/Istanbul'` sabiti
+ `resolveSchedulerTimezone(jobClass?)` ile 14 servisteki 33 `@Cron`
cagrisinin tumune explicit `timeZone` eklendi (2 dormant icrabot cron'u
HARIC — W3-F06 kapsami). `process.env.TZ=UTC` deploy pinine DOKUNULMADI
(ayri, halihazirda ratifiye edilmis karar). GERCEK NestFactory bootstrap +
2x host TZ (UTC/Europe/Istanbul) runtime testi 0 job drift dogruladi.
Migration gerekmedi. Detay: `defect-register.md` → Cozum Kaydi → W3-D04.

---
## W3-F04-CRON-TERMINAL-FAILURE-VISIBILITY-R01
- **capability:** cron failure gorunurlugu
- **defect:** W3-D05 — 14/35 metotta try/catch yok; yalniz 1 servis ErrorLog'a dusuruyor
- **paths:** 8 servis
- **beklenen runtime sonucu:** her cron hatasi `IntegrationErrorReporter(source:'CRON')` ile kayit altina alinir
- **prerequisite:** yok (mevcut ratified mekanizma)
- **bagimlilik:** kapsam bolunmeli — servis basina ayri PR

**SONUC (R01, [PR #2070](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/2070), merge `fdaf21e6`):**
CLOSED. Yukaridaki "kapsam bolunmeli — servis basina ayri PR" varsayimi,
uygulama incelemesinde GEREKSIZ oldugu kanitlandi — tum 12 servis TEK PR'da,
merkezi `reportCronJobFailure()` (mevcut ratifiye `IntegrationErrorReporter`
uzerine ince bir sarmalayici) ile kapatildi; 35 job'un fresh sinifi 9
zaten-sertifikali + 2 dormant + 24 runtime-bound (12 dosya) verdi, tumu tek
desende duzeltildi. `ERROR_LOG_METADATA_WHITELIST`'e `outcome`/`reasonCode`
eklenmeden siniflandirma sessizce ErrorLog'a ULASMIYORDU — yalniz gercek
Postgres'e karsi DB-gated runtime testiyle bulunan gercek bir prod-kodu
eksigiydi. 3 serviste (`case-task-escalation`, `operational-escalation`,
`office-approval-executor-cron`) cron-entrypoint sarmalandi ama alttaki is
metodu (testler/manuel tetikleyiciler icin dogrudan cagrilabilir olmasi
GEREKTIGI icin) bilerek DOKUNULMADI — bu, ayni metodun cron-disi cagri
yollarinda hala rapor kapsami DISINDA oldugu, owner karari bekleyen bir
kalinti olarak Cozum Kaydi'nda ayrica isaretlendi (yeni task URETILMEDI).
Migration gerekmedi. Detay: `defect-register.md` → Cozum Kaydi → W3-D05.

---
## W3-F05-OUTBOX-NO-HANDLER-POISON-DISPOSITION-R01
- **capability:** outbox dispatch
- **defect:** W3-D09 — handler'siz action sonsuza kadar pending
- **paths:** `action-handler.service.ts#dispatch`
- **beklenen runtime sonucu:** N denemeden sonra terminal durum VEYA acik "bekleyen registrar" isareti
- **prerequisite:** owner karari — mevcut davranis bilincli mi
- **bagimlilik:** yok

**SONUC (R01, [PR #2005](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/2005), merge `0c700a44`):**
CLOSED. `dispatch()`'e MISSING_TENANT_ID ile ayni desende (claim→markDeadLetter)
yeni bir handler-yok dali eklendi; handler kayitli degilse satir TEK seferde
`NO_REGISTERED_HANDLER`/`NON_RETRYABLE` ile terminal 'dead' kapanir — sonsuz
pending deseni kirildi, migration gerekmedi (mevcut sema+dead-letter yeterli).
Fresh envanter 9 kayitsiz `EVENT_PUBLISHED:*` event tipi buldu; production'daki
gercek satir hacmi bu task kapsaminda DOGRULANMADI (no-secrets kurali),
UNVERIFIED olarak kayitli, sifir varsayilmadi. Detay: `defect-register.md` →
Cozum Kaydi → W3-D09.

---
## W3-F06-DORMANT-ASYNC-SUBTREE-DISPOSITION-R01
- **capability:** icrabot, manifest-retry, playbook, evidence-bundle, trace-retention, simulation-scheduler
- **defect:** W3-D03 — kod var, hic baslamaz
- **paths:** 6 alt agac
- **beklenen runtime sonucu:** her alt agac icin **AKTIVE ET** veya **KALDIR** karari; belirsiz ara durum kalmaz
- **prerequisite:** owner karari — **AKTIVASYON YETKISI GEREKIR**
- **bagimlilik:** aktivasyon secilirse tenant/idempotency/retry sertifikasyonu ONCE yapilmalidir

---
## W3-F07-CRON-OVERLAP-AND-JOB-IDENTITY-R01
- **capability:** cron overlap + job kimligi
- **defect:** W3-D06 (33/35 overlap guard yok) + W3-D07 (31/33 UUID adli)
- **paths:** 35 `@Cron` bildirimi
- **beklenen runtime sonucu:** her job `name` ile adreslenebilir; uzun suren job kendini tetiklemez
- **prerequisite:** owner karari — coklu-instance dagitim hedefi
- **bagimlilik:** dagitik kilit gerekiyorsa altyapi karari

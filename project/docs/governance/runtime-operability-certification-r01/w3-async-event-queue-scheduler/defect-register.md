# W3 — Defect Register

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


Makine-okunur tam kayit: `defect-register.json`.

| ID | Sinif | Oncelik | Capability | Disposition | Implementation |
|---|---|---|---|---|---|
| **W3-D02** | W3-B07 TENANT_BOUNDARY_UNSAFE | **P1** | outbox consumer handler'lari | **RESOLVED** (bkz. Cozum Kaydi) | APP-LAYER (migration GEREKMEDI) |
| **W3-D01** | W3-B11 PAYLOAD_CONTRACT_MISMATCH | P2 | `webhook` handler | **RESOLVED** (bkz. Cozum Kaydi) | HANDLER REMOVED (migration GEREKMEDI) |
| **W3-D09** | W3-B10 TERMINAL_FAILURE_INVISIBLE | P2 | handler'siz action -> sonsuz pending | **RESOLVED** (bkz. Cozum Kaydi) | APP-LAYER (migration GEREKMEDI) |
| **W3-D04** | W3-B06 SCHEDULER_TIMEZONE_UNKNOWN | P2 | 32/33 cron job | **RESOLVED** (bkz. Cozum Kaydi) | APP-LAYER (migration GEREKMEDI) |
| **W3-D05** | W3-B10 TERMINAL_FAILURE_INVISIBLE | P2 | 24/35 runtime-bound cron metodu | **RESOLVED** (bkz. Cozum Kaydi) | APP-LAYER (migration GEREKMEDI) |
| **W3-D03** | W3-B04/B05 NOT_STARTED | P3 | tarihsel 6 isim → fresh 11 alt agac (icrabot/object-store/chaos/break-glass/playbook/trace-retention/simulation-scheduler) | **RESOLVED** (bkz. Cozum Kaydi) | REGISTRY + 3 BOUNDED FIX (8/11 BLOCKED, owner karari bekliyor) |
| **W3-D06** | overlap / multi-instance | P3 | 33/35 cron metodunda overlap guard yok | DEFERRED | NOT_ELIGIBLE (owner policy) |
| **W3-D07** | W3-B15 job kimligi | P4 | 31/33 job UUID adli | DEFERRED | W3-F07 ile birlesik |
| **W3-D08** | dokumantasyon | P4 | stale recovery platform kapsamli | DOKUMANTE | N/A |

## Bulunmayanlar (kanitli negatif)

| Sinif | Sonuc | Kanit |
|---|---|---|
| W3-B13 DUPLICATE_REGISTRATION | **GOZLENMEDI** | 6 `ScheduleModule.forRoot()` cagrisina ragmen 33 job, yinelenen ad 0 |
| W3-B01 PRODUCER_UNREACHABLE | **GOZLENMEDI** | outbox producer'lari gercek HTTP mutation yollarindan erisilebilir |
| W3-B02 DISPATCH_NOT_WIRED | **GOZLENMEDI** | cron -> consumer zinciri zaman damgali olcum ile dogrulandi |
| W3-B03 CONSUMER_NOT_REGISTERED (domain) | **GOZLENMEDI** | 3 registrar runtime'da kayitli |
| W3-B12 TEST_ONLY_BINDING | **GOZLENMEDI** | tum kanitlar production `AppModule` uzerinden alindi |

## Cozum Kaydi

> Bu bolum, yukaridaki AUDIT BASE satirlarini SILMEZ/ustune yazmaz; kapatilan
> bulgulari ayri bir addendum olarak kayit altina alir.

### W3-D02 — RESOLVED (W3-F02-OUTBOX-CONSUMER-TENANT-OWNERSHIP-R01)

- **Task:** RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F02-OUTBOX-CONSUMER-TENANT-OWNERSHIP-R01
- **PR:** [#1990](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/1990) — squash-merged
- **MERGE SHA:** `cfccfb6cdb21478c1436a1dcdce79c0919aa413b`
- **Kok neden:** `ActionHandlerService.dispatch()` handler'i cagirmadan once
  `action.tenantId`'yi hedef `Case`'in GERCEK sahibiyle bir daha karsilastirmiyordu;
  7 handler (`send_email`, `send_sms`, `send_notification`, `uyap_submit`,
  `create_task`, `enqueue`, `update_case_status`) bu kontrol olmadan caseId
  uzerinden dogrudan yaziyordu.
- **Cozum:** `dispatch()` icine, claim sonrasi ve HERHANGI bir handler
  cagrilmadan once, yeni `resolveOutboxActionOwnership()` (`outbox-action-ownership.ts`)
  ile merkezi bir sahiplik gate'i eklendi. Uyumsuzlukta handler hic cagrilmaz,
  timeline'a yazilmaz, dogrudan `markDeadLetter` + sinirli guvenlik-gozlemlenebilirlik
  kaydi olusur. Transient sorgu hatasi ayri kategoride kalir (markFailed/retry).
- **Sema/migration karari:** **GEREKMEDI.** Invariant, `Case.tenantId` (NOT NULL,
  halihazirda otoriter) uzerinden salt uygulama katmaninda kapatildi; asil
  AUDIT BASE satirindaki "schema + owner policy" varsayimi, uygulama incelemesiyle
  gereksiz oldugu kanitlanarak asildi (bkz. brief §10 karar disiplini).
- **Kanit:** 18 DB-free unit test (7 gercek handalik uzerinde kapsamli kanit +
  kaynak-metni tabanli yapisal guard) + 7 senaryolu (A-G) GERCEK Postgres +
  GERCEK dispatcher runtime matrisi (PR-oncesi VE post-merge fresh checkout'ta
  ayri ayri PASS) + 4/4 negatif-kanit mutasyonu kirmizi/geri-alindi + gercek CI
  (Architectural Guardrails, Test Suite, Orchestration Tests, Web Tests, CodeQL —
  hepsi PASS).
- **Post-merge acceptance (§21):** MERGED → disposable/staging canonical runtime'da
  fresh checkout + fresh disposable DB ile DISPATCHER STARTUP, SAME-TENANT PATH,
  CROSS-TENANT PATH REJECTED, EFFECT DELTA 0, RETRY/REPLAY dogrulandi.
  **PRODUCTION: NOT ACTIVATED** — paylasilan RUNTIME worktree/production DB'ye
  bu task kapsaminda dokunulmadi; ayri bir production-activation yetkisi verilmedi.
- **Successor:** W3-F01-OUTBOX-WEBHOOK-HANDLER-MODEL-CONTRACT-R01 (sirada).

### W3-D01 — RESOLVED (W3-F01-OUTBOX-WEBHOOK-HANDLER-MODEL-CONTRACT-R01)

- **Task:** RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F01-OUTBOX-WEBHOOK-HANDLER-MODEL-CONTRACT-R01
- **PR:** [#1998](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/1998) — squash-merged
- **MERGE SHA:** `f32e94239ad4c27d476a372dcb43877f31ea4c98`
- **Kok neden:** `'webhook'` action handler'i semada hic var olmamis
  `IcrabotWebhookLog` modeline `(prisma as any)` ile yaziyordu VE gercek bir HTTP
  cagrisi hic yapmadan kosulsuz `status:'sent'` iddia ediyordu (product-backlog.md
  `CAN-P0-001`'deki `send_email`/`send_sms` "fake-sent" deseninin ayni ornegi,
  `CAN-P0-008` olarak ayrica kayitliydi).
- **Fresh dogrulama:** migration gecmisinin tamami tarandi — `IcrabotWebhookLog`'a
  karsilik gelen bir tablo HICBIR ZAMAN olusturulmamis (ghost model degil, saf
  olu referans). Aktif/test hicbir rule-pack `action: webhook` uretmiyor (repo
  genelinde 0 isabet).
- **Karar:** Option C — webhook canonical bir yetenek olarak KABUL EDILMEDI.
- **Cozum:** `action-handler.service.ts`'ten handler kaydi tamamen kaldirildi;
  `engine-runner.service.ts` (producer) `action: 'webhook'`'u outbox'a hic
  yazmadan reddeder (kardes action'lar etkilenmeden) — sadece handler'i
  kaldirmanin `dispatch()`'i "No handler for action type" ile sonsuza kadar
  pending birakacagi (W3-D09 deseni) riski boylece onlendi.
  `w3-prisma-model-reference.static-guard.spec.ts`'in `KNOWN_GAPS`'i artik BOS.
- **Sema/migration karari:** **GEREKMEDI.**
- **Kanit:** 3 DB-free unit test + guncellenmis static guard (yeni negatif [6])
  + 1 DB-gated runtime dogrulama (GERCEK Postgres + GERCEK `EngineRunnerService`,
  PR-oncesi VE post-merge fresh checkout'ta ayri ayri PASS) + 2/2 negatif-kanit
  mutasyonu kirmizi/geri-alindi + gercek CI (Architectural Guardrails, Test
  Suite, Orchestration Tests, Web Tests, CodeQL, Client Workspace Live Smoke —
  hepsi PASS) + `icrabot/v28-engine`+`common/__tests__` tam regresyon (26
  suite/379 test PASS).
- **Post-merge acceptance:** MERGED → disposable checkout + fresh disposable DB
  ile runtime dogrulama tekrarlandi, PASS. **PRODUCTION: NOT ACTIVATED.**
- **Successor:** W3-F05-OUTBOX-NO-HANDLER-POISON-DISPOSITION-R01 (sirada).

### W3-D09 — RESOLVED (W3-F05-OUTBOX-NO-HANDLER-POISON-DISPOSITION-R01)

- **Task:** RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F05-OUTBOX-NO-HANDLER-POISON-DISPOSITION-R01
- **PR:** [#2005](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/2005) — squash-merged
- **MERGE SHA:** `0c700a444c94846f4cc1c7538d659b54ef7ad947`
- **Kok neden:** `ActionHandlerService.dispatch()`, action tipi icin kayitli
  handler bulunamadiginda claim ALMADAN erken donuyordu; satir 'pending'
  kalip her cron turunde tekrar bulunuyordu, `attemptCount` hic artmiyordu,
  hicbir terminal disposition veya sinirli gozlemlenebilirlik kaydi
  olusmuyordu.
- **Fresh envanter:** 12 hardcoded + 3 dinamik-kayitli (toplam 15) handler'a
  karsi, gercek (test-disi) cagri yerlerinin exhaustive taramasi 9 kayitsiz
  `EVENT_PUBLISHED:*` action tipi ortaya cikardi (`OVERPAYMENT_RECORDED`,
  `OVERPAYMENT_BLOCKED`, `CASE_OPENED`, `INTEREST_POLICY_ASSIGNED`,
  `CLAIM_ITEM_CREATED/ROLLED_BACK/CANCELLED/WAIVED/COLLECTED/UPDATED`) —
  `DomainEventIngestService.appendInTransaction()` HER event icin kosulsuz
  outbox satiri uretiyor, tuketici olup olmadigina bakmiyor. Bu, W3-D09
  desenini teorik degil SOMUT/CANLI bir risk yapiyor.
- **Karar:** mevcut sema (`status`/`attemptCount`/`lastError`/`nextRetryAt`,
  `@@index([status])`) VE mevcut dead-letter/terminal makinesi
  (`markDeadLetter`) yeterli bulundu — **migration GEREKMEDI**.
- **Cozum:** `dispatch()` icine, handler-lookup asamasinda, MISSING_TENANT_ID
  ile AYNI desende (once `claimForProcessing`, sonra `markDeadLetter`) yeni
  bir dal eklendi: handler kayitli degilse claim alinir ve satir tek seferde
  `NO_REGISTERED_HANDLER` / `NON_RETRYABLE` ile terminal 'dead' kapatilir.
  Idempotent (ikinci claim daima basarisiz olur), stale-claim recovery'yi
  etkilemez (`recoverStaleProcessingActions` sadece 'sent' satirlari
  hedefler), replay (`retryDeadAction` → pending) handler registry'yi bir
  sonraki `dispatch()` cagrisinda otomatik olarak YENIDEN kontrol eder (ayri
  bir "dogrulandi" bypass bayragi yoktur) — brief'in ayri "replay registry'yi
  yeniden dogrulamali" sartini ek kod olmadan saglar.
- **Kanit:** 5 DB-free unit test (bilinmeyen action / idempotent ikinci
  dispatch / stale-recovery hedef disi / replay yeniden-kontrol / desteklenen
  action regresyonu) + 2 DB-gated runtime testi (GERCEK Postgres + GERCEK
  `ActionHandlerService`+`OutboxService`, PR-oncesi VE post-merge fresh
  checkout'ta ayri ayri PASS) + gercek CI (Architectural Guardrails, Test
  Suite, Orchestration Tests, Web Tests, CodeQL, Client Workspace Live
  Smoke — hepsi PASS).
- **Post-merge acceptance:** MERGED → SHA'ya pin'li fresh worktree + fresh
  disposable Postgres + migrasyonlar yeniden uygulanip DB-gated runtime
  testi tekrarlandi, 2/2 PASS. **PRODUCTION: NOT ACTIVATED** — production
  DB/runtime'a bu task kapsaminda dokunulmadi.
- **Mevcut poison satir hacmi:** production `hukuk_db`'de su an kac satirin
  bu desene dustugu bu task kapsaminda DOGRULANMADI (Phase 0 no-secrets
  kurali geregi production baglantisi kurulmadi) — **UNVERIFIED**, sifir
  VARSAYILMADI.
- **Ek gozlem (owner karari bekliyor, YENI task OTOMATIK URETILMEDI):** 9
  kayitsiz `EVENT_PUBLISHED:*` event tipi bulgusu, ayri bir (a) production
  `hukuk_db` uzerinde READ-ONLY poison-row tespiti ve/veya (b) bu 9 event
  tipi icin tuketici/registrar karari successor'unu hak edebilir; brief §11
  geregi yalnizca GERCEKTEN dogrulanmis satir varsa yeni task uretilir —
  burada dogrulama yapilmadigi icin uretilmedi.
- **Successor:** W3-F03-SCHEDULER-TIMEZONE-DECLARATION-R01 (sirada).

### W3-D04 — RESOLVED (W3-F03-SCHEDULER-TIMEZONE-DECLARATION-R01)

- **Task:** RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F03-SCHEDULER-TIMEZONE-DECLARATION-R01
- **PR:** [#2032](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/2032) — squash-merged
- **MERGE SHA:** `9e55f0bf2b65fa3914087e6f5f21ad2c72eedd3e`
- **Kok neden:** Runtime'da kayitli 33 cron job'un 32'sinin timezone'u KODDA
  bildirilmemisti ve `process.env.TZ` deploy pininden turuyordu; yalniz
  `errorLogRetention` job'u (`error-log-retention.service.ts`) explicit
  `Europe/Istanbul` bildiriyordu.
- **Karar:** Owner/brief tercihi olan Option A + per-job-class istisna noktasi
  — tek merkezi canonical sabit (`SCHEDULER_TIMEZONE = 'Europe/Istanbul'`) +
  `resolveSchedulerTimezone(jobClass?)` imzasi (su an hepsi ayni degeri
  doner, ileride per-class farklilasmaya izin verir).
- **Cozum:** Yeni `apps/api/src/common/scheduler-timezone.ts` merkezi
  modulu (`SCHEDULER_TIMEZONE`, `resolveSchedulerTimezone`,
  fail-closed `assertValidSchedulerTimezone`); 14 servis dosyasindaki
  runtime-bound 33 `@Cron` cagrisinin TUMUNE (2 dormant icrabot cron'u
  HARIC — W3-F06 kapsami, DOKUNULMADI) explicit
  `{ timeZone: SCHEDULER_TIMEZONE }` eklendi. `process.env.TZ=UTC` deploy
  pinine (ayri, halihazirda ratifiye edilmis interest-engine/legal-deadline
  karari) **DOKUNULMADI** — `@nestjs/schedule`'in per-job `timeZone`
  secenegi process TZ'den bagimsiz calisir.
- **Sema/migration karari:** **GEREKMEDI.**
- **Kanit:** 9 DB-free unit test (canonical sabit/resolver/fail-closed
  validator + ay-sonu/yil-sonu/artik-yil takvim siniri determinizmi +
  `process.env.TZ`'den bagimsizlik) + genisletilmis static guard (4 yeni
  test [7]-[10], toplam 10/10 PASS) + 1 DB-gated GERCEK NestFactory
  bootstrap runtime testi (2x host TZ — UTC ve Europe/Istanbul — ile 33
  job kaydi, 0 duplicate, 4 config-gated job kosulsuz kayitli, 0 job
  drift, temiz kapanis; paylasilan sabit referans anla implicit "su an"
  bagimliligindan arindirilmis deterministik hesap) + 3/4 negatif-kanit
  mutasyonu kirmizi/geri-alindi (timezone kaldirma, gecersiz timezone,
  host-default fallback) + gercek CI (Architectural Guardrails, Test
  Suite, Orchestration Tests, Web Tests, Analyze x3, CodeQL, Client
  Workspace Live Smoke — hepsi PASS).
- **Post-merge acceptance:** MERGED → merge SHA'ya pin'li fresh worktree +
  fresh disposable Postgres + migrasyonlar yeniden uygulanip 3 test
  dosyasi (static guard + DB-free unit + DB-gated runtime) tekrarlandi,
  20/20 PASS. **PRODUCTION: NOT ACTIVATED** — production DB/runtime'a bu
  task kapsaminda dokunulmadi.
- **Known residual:** 4uncu negatif-kanit mutasyonu (dormant→bound,
  `IcrabotModule`'u gecici acma) permission classifier tarafindan
  BLOKLANDI; talimat geregi tekrar denenmedi/atlatilmadi. Static guard'in
  mevcut [4] testi (dormant class'larin BAGLI OLMADIGINI dogrulayan)
  dolayli kanit olarak kaldi — dogrudan canli mutasyon kaniti EKSIK.
- **Successor:** W3-F04-CRON-TERMINAL-FAILURE-VISIBILITY-R01 (sirada).

### W3-D05 — RESOLVED (W3-F04-CRON-TERMINAL-FAILURE-VISIBILITY-R01)

- **Task:** RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F04-CRON-TERMINAL-FAILURE-VISIBILITY-R01
- **PR:** [#2070](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/2070) — squash-merged
- **MERGE SHA:** `fdaf21e6a3db215697d73bcf0653c5b326e5ea95`
- **Kok neden:** Fresh siniflandirma, 35 `@Cron` metodunu 4 aileye ayirdi: 9
  zaten-sertifikali (`OutboxCronService.processOutboxActions` + 8
  `scheduler.service.ts` metodu, DOKUNULMADI), 2 dormant icrabot sinifi
  (DOKUNULMADI, W3-F06 kapsami), 24 runtime-bound metot (12 dosya) ise
  sessiz/kismi hata yonetimine sahipti (bare logger, eksik catch, veya iz
  birakmayan yutma) — isletmeci hangi job'un hangi sonuc sinifiyla
  sonlandigini goremiyordu.
- **Karar:** `CronExecutionResult` benzeri literal bir donus tipi
  DEGERLENDIRILDI ama uygulanmadi — NestJS `@Cron` metodunun donus degerini
  yoksaydigi icin siniflandirma ErrorLog metadata'sinda yasar. Merkezi
  wrapper, mevcut sertifikali `IntegrationErrorReporter`/`ErrorLogService`/
  `ErrorLog` zincirinden YENIDEN KULLANILDI (yeniden icat edilmedi).
- **Cozum:** Yeni `apps/api/src/common/cron-failure-reporting.ts` ->
  `reportCronJobFailure(reporter, jobId, error, {tenantId?, reasonCode?,
  metadata?})` — fire-and-forget (`void ...report().catch(()=>{})`, cron
  akisini ASLA bloklamaz/firlatmaz), her cagriyi
  `source:'CRON'/operation:jobId/metadata.outcome:'FAILED_TERMINAL'/
  metadata.reasonCode` ile isaretler. 12 servis dosyasinda 24 metoda
  (`automation.service.ts` 8, digerleri 1-3'er) bu wrapper eklendi — 3
  serviste (`case-task-escalation`, `operational-escalation`,
  `office-approval-executor-cron`) yalniz cron-entrypoint sarmalandi, alttaki
  is metodu testler/manuel tetikleyiciler icin dogrudan cagrilabilir kalmasi
  GEREKTIGI icin BILEREK dokunulmadi (bkz. Bilinen kalinti).
- **Sema/migration karari:** **GEREKMEDI.** Ancak `ERROR_LOG_METADATA_WHITELIST`
  (`error-log.sanitize.ts`) icinde `outcome`/`reasonCode` YOKTU — bu olmadan
  siniflandirma `sanitizeMetadata()` tarafindan sessizce ErrorLog satirindan
  DUSURULUYORDU. Bu, yalniz GERCEK Postgres'e karsi DB-gated runtime testi
  kosturularak bulunan gercek bir prod-kodu eksigiydi (mock'larla asla
  yakalanamazdi); whitelist'e iki alan eklendi.
- **Kanit:** W3-F03 static guard genisletildi (govde-seviyesi kapsama: 33
  bound + 2 dormant metodun TAMAMI cikarilip her birinin efektif govdesinde
  — bir seviye delegate-follow dahil — sertifikali rapor cagrisi arandigi 4
  yeni test) + 8 DB-free unit test (`cron-failure-reporting.spec.ts`,
  tenantId/metadata/rawPayload-yok/hata-yutmama) + 1 DB-free whitelist testi
  + temsilci DB-gated runtime matrisi (A-F: success/no-work/injected-failure/
  config-gated-off/config-gated-on+failure/graceful-shutdown, GERCEK Postgres
  + GERCEK `IntegrationErrorReporter`, PR-oncesi VE post-merge fresh
  checkout'ta ayri ayri PASS) + 4/4 negatif-kanit mutasyonu (wrapper kaldirma,
  bos catch, import-yolu bozma, rawPayload sizintisi eklemesi) kirmizi/
  geri-alindi + gercek CI (Architectural Guardrails, Test Suite, Orchestration
  Tests, Web Tests, Analyze x3, CodeQL, Client Workspace Live Smoke — hepsi
  PASS).
- **Post-merge acceptance:** MERGED → merge SHA'ya pin'li fresh worktree +
  fresh disposable Postgres + migrasyonlar yeniden uygulanip 5 test dosyasi
  (static guard + DB-free unit x2 + DB-gated runtime x2, W3-F03'unki dahil)
  tekrarlandi, 51/51 PASS. **PRODUCTION: NOT ACTIVATED** — production
  DB/runtime'a bu task kapsaminda dokunulmadi.
- **Bilinen kalinti (owner karari bekliyor, YENI task OTOMATIK URETILMEDI):**
  3 serviste (`case-task-escalation.service.ts`,
  `operational-escalation.service.ts`, `office-approval-executor-cron.service.ts`)
  cron-entrypoint metodu sarmalandi ama cagrilan is metodu
  (`processCaseTaskEscalations`, `processEscalations`, `runSweep`) kendi
  doc-comment'ine gore testler/manuel tetikleyiciler tarafindan da dogrudan
  cagrilabilir — bu cagri yollarinda olusan hatalar YENI wrapper kapsaminda
  DEGILDIR (retry-ownership'in birden fazla cagri yolu arasinda
  PAYLASILDIGI/muglak oldugu somut ornekler). Ayrica `runBatched()`
  yardimcisinin per-item hata izolasyonu olmadigi sistemik bulgusu
  GOZLEMLENDI ama brief'in scope-exclusion'i geregi DOKUNULMADI. Her iki
  bulgu da mekanik degil, owner-politika karari gerektirir; brief §11 geregi
  yeni task otomatik uretilmedi.
- **Successor:** W3-F06-DORMANT-ASYNC-SUBTREE-DISPOSITION-R01 (sirada,
  veya W3-F07-CRON-OVERLAP-AND-JOB-IDENTITY-R01 — brief'te belirtilen sira).

### W3-D03 — RESOLVED (W3-F06-DORMANT-ASYNC-SUBTREE-DISPOSITION-R01)

- **Task:** RUNTIME-OPERABILITY-CERTIFICATION-R01 / W3-F06-DORMANT-ASYNC-SUBTREE-DISPOSITION-R01
- **PR:** [#2087](https://github.com/ulashuseyintelli-tech/HUKUK_YAZILIMI/pull/2087) — squash-merged
- **MERGE SHA:** `0a6ea7fe99607b8a0e820802401cfa2c5f073037`
- **Fresh envanter (tarihsel bulgu GROUND-TRUTH kabul edilmedi):** tarihsel
  W3-D03 "icrabot, manifest-retry, playbook, evidence-bundle,
  trace-retention, simulation-scheduler" olarak 6 isim listeliyordu. Fresh,
  bagimsiz repo-genelinde tarama bunun yerine **11** ayri dormant/config-gated
  alt agac ortaya cikardi — 5 isim `calc-preview/diagnostics/` altinda ic ice
  bulunmustur (ust-duzey modul DEGIL), "icrabot" etiketi kismen yanlistir
  (v28-engine ve domain-event-ingest ZATEN AKTIF + sertifikali — bu envanterin
  kapsami DISINDA tutuldu, cunku zaten dormant degiller).
- **Karar:** Her 11 alt agaca `DormantSubtreeDisposition` taksonomisinden
  (KEEP_DORMANT_CONFIG_GATED / BLOCKED_BY_MISSING_POLICY /
  BLOCKED_BY_MISSING_RUNTIME_DEPENDENCY / ACTIVATE_FLAG_GATED /
  REMOVE_DEAD_CODE) tam olarak BIR terminal disposition atandi —
  UNKNOWN/DORMANT_UNCLASSIFIED kalmadi. Section 8 executor-yasagi (yeni is
  yetenegi/otomatik hukuki-bildirim aksiyonu/yeni harici entegrasyon/production
  aktivasyonu/yeni geri-alinamaz yan etki ICAT ETME yasagi) geregi hicbir alt
  agac production-aktive EDILMEDI; GO-CANONICALIZE otomatik production
  aktivasyonu ANLAMINA GELMEDI.
- **Per-subtree disposition matrisi (11/11, sifir UNKNOWN):**

  | subtreeId | Kok neden (primary/secondary) | Disposition | Runtime | Flag | Sema | Prod aktivasyon |
  |---|---|---|---|---|---|---|
  | ICRABOT-LEGACY-CORE | MODULE_UNBOUND / OWNER_POLICY_PENDING | KEEP_DORMANT_CONFIG_GATED | UNBOUND | — | GEREKMEDI | HAYIR |
  | OBJECT-STORE-EVIDENCE-BUNDLE-S3 | MODULE_UNBOUND / CONFIG_GATED_OFF | BLOCKED_BY_MISSING_POLICY | UNBOUND | EVIDENCE_BUNDLE_S3_ENABLED | GEREKMEDI | HAYIR |
  | OBJECT-STORE-BUNDLE-MANIFEST | MODULE_UNBOUND | BLOCKED_BY_MISSING_POLICY | UNBOUND | — | GEREKMEDI | HAYIR |
  | OBJECT-STORE-BUNDLE-SEAL | MODULE_UNBOUND | BLOCKED_BY_MISSING_POLICY | UNBOUND | — | GEREKMEDI | HAYIR |
  | OBJECT-STORE-MANIFEST-RETRY | MODULE_UNBOUND / SCHEMA_ABSENT | BLOCKED_BY_MISSING_RUNTIME_DEPENDENCY | UNBOUND | — | `manifest_retry_queue` sema bosluğu VAR | HAYIR |
  | OBJECT-STORE-MANIFEST-RETRY-IDEMPOTENCY | MODULE_UNBOUND | BLOCKED_BY_MISSING_RUNTIME_DEPENDENCY | UNBOUND | — | (yukaridakiyle ayni) | HAYIR |
  | CALC-PREVIEW-CHAOS | CONFIG_GATED_OFF / TEST_ONLY | KEEP_DORMANT_CONFIG_GATED | UNBOUND | ENABLE_CHAOS_ENDPOINTS | GEREKMEDI | HAYIR |
  | CALC-PREVIEW-BREAK-GLASS-TENANT-CONTEXT | MODULE_UNBOUND / SCHEMA_ABSENT | BLOCKED_BY_MISSING_POLICY | UNBOUND | — | tum repository'ler in-memory, Prisma yok | HAYIR |
  | CALC-PREVIEW-PLAYBOOK-ACTION-SIDE | MODULE_UNBOUND | BLOCKED_BY_MISSING_POLICY | UNBOUND | — | GEREKMEDI | HAYIR |
  | CALC-PREVIEW-TRACE-RETENTION | CONSUMER_ABSENT / MODULE_UNBOUND | ACTIVATE_FLAG_GATED | BOUND_FLAG_GATED (YENI) | TRACE_RETENTION_ENABLED (varsayilan false) | GEREKMEDI | HAYIR (flag kapali kaldi) |
  | CALC-PREVIEW-DIAGNOSTICS-SIMULATION-SCHEDULER | LEGACY_DEAD_CODE / MODULE_UNBOUND | REMOVE_DEAD_CODE | REMOVED (dosya silindi) | — | GEREKMEDI | N/A (kod kaldirildi) |

  (Tum 11 satir: ayni PR #2087, ayni MERGE SHA `0a6ea7fe`, ayni post-merge
  kaniti — asagida.)

- **Cozum (yalniz kod-seviyesinde bounded olan 3 aile; kalan 8 KOD
  SEVIYESINDE DEGISTIRILMEDI):**
  - **FAMILY 1 (REMOVE_DEAD_CODE):** CALC-PREVIEW-DIAGNOSTICS-SIMULATION-SCHEDULER
    — `RealSimulationScheduler`/`ManualSimulationScheduler`/`ISimulationScheduler`/
    `SimulationContext` zinciri repo genelinde (testler DAHIL) sifir referans
    tasidigi bagimsiz dogrulanip dosya + `simulation.types.ts`'teki 2 olu
    interface + `simulation/index.ts` barrel-export satiri fiziksel olarak
    kaldirildi.
  - **FAMILY 2 (KEEP_DORMANT_CONFIG_GATED, yeni test):** CALC-PREVIEW-CHAOS —
    kod DEGISTIRILMEDI; `NODE_ENV=production` hard-disable + `ENABLE_CHAOS_ENDPOINTS`
    default-off + mevcut ESLint mimari kuralinin GERCEKTEN sifir saldiri
    yuzeyi urettigini kanitlayan (onceden hic var olmayan) bir off-state test
    dosyasi eklendi.
  - **FAMILY 4 (ACTIVATE_FLAG_GATED, kazara-eksik-provider bug duzeltmesi):**
    CALC-PREVIEW-TRACE-RETENTION — `TraceRetentionService`, `CalcPreviewModule`
    providers listesinde hic yoktu (constructor'daki `setInterval` cleanup-timer
    hicbir zaman baslamiyordu — kasitli dormancy DEGIL, kazara eksik DI kaydi).
    Provider olarak eklendi; gercek cleanup-timer baslatma davranisi yeni
    `TRACE_RETENTION_ENABLED` (varsayilan false) flag'i ile gate'lendi —
    production davranisi bu PR ile DEGISMEDI.
  - **Kalan 8** (ICRABOT-LEGACY-CORE, OBJECT-STORE-EVIDENCE-BUNDLE-S3,
    OBJECT-STORE-BUNDLE-MANIFEST, OBJECT-STORE-BUNDLE-SEAL,
    OBJECT-STORE-MANIFEST-RETRY, OBJECT-STORE-MANIFEST-RETRY-IDEMPOTENCY,
    CALC-PREVIEW-BREAK-GLASS-TENANT-CONTEXT, CALC-PREVIEW-PLAYBOOK-ACTION-SIDE):
    section 8 executor-yasagi ve/veya eksik runtime bagimliligi (sema
    bosluğu) nedeniyle BLOCKED olarak siniflandirildi, kod seviyesinde
    HICBIRINE dokunulmadi.
- **Sema/migration karari:** **GEREKMEDI.** Yalniz 273 satirlik yeni bir TS
  registry dosyasi (`dormant-subtree-registry.ts`, migration ICERMEZ) + 3
  bounded ailedeki kod degisiklikleri.
- **Registry + guard:** `apps/api/src/common/dormant-subtree-registry.ts`
  (11 `DormantSubtreeRecord`, makine-okunur — her satirda subtreeId/rootPath/
  disposition/bindingExpectation/activationFlag/canonicalReplacement/
  ownerDecisionRef/primaryCause/secondaryCause/notes) +
  `w3-async-runtime-binding.static-guard.spec.ts` genisletildi (yeni "W3-F06"
  describe blogu, testler [15]-[20], 6 yeni test — registry-driven: her
  UNBOUND girdi icin hicbir dosyanin AppModule kapanisina bagli olmadigini,
  BOUND_FLAG_GATED girdinin gercekten DI'a bagli oldugunu, REMOVED girdinin
  hem dosya yoklugunu hem sembol-adi sizintisi olmadigini dogrular).
- **Kanit:** static guard 20/20 (14 onceki + 6 yeni) + 6 yeni chaos off-state
  testi + 6 yeni trace-retention flag-gate testi = 32 DB-free test,
  PR-oncesi VE post-merge fresh checkout'ta (merge SHA'ya pin'li, junction
  node_modules) ayri ayri PASS + 4 negatif-kanit mutasyonu kirmizi/geri-alindi
  (biri setInterval flag-default ters cevirme mutasyonunun gercek bir
  zamanlayici baslatip Jest'i hang ettirmesi dahil — `TaskStop` ile kill
  edilip kirli-ama-gecerli RED kaniti olarak kabul edildi) + gercek CI
  (Analyze x3, Architectural Guardrails, Client Workspace Live Smoke, CodeQL,
  Orchestration Tests, Test Suite, Web Tests — 9/9 PASS).
- **Post-merge acceptance:** MERGED → merge SHA'ya (`0a6ea7fe`) pin'li fresh
  worktree + fresh node_modules junction (ln -s hang/kismi-kopya riski
  gozlemlenip temizlenerek native `New-Item -ItemType Junction` ile
  yeniden kuruldu) + 3 test dosyasi (static guard + chaos off-state +
  trace-retention flag-gate) tekrarlandi, 32/32 PASS + differential tsc
  (merge SHA'daki tsc hatalarinin TAMAMEN ilgisiz/onceden-var-olan
  dosyalarda [interest-engine/lawyer/legal-time-shadow/scheduler/staff/uyap
  testleri] oldugu grep ile dogrulandi — W3-F06 tarafindan degistirilen
  HICBIR dosyada sifir hata). **PRODUCTION: NOT ACTIVATED** — trace-retention
  flag'i varsayilan kapali kaldi, hicbir dormant alt agac production
  davranisinda aktiflesmedi; production DB/runtime'a bu task kapsaminda
  dokunulmadi.
- **Bilinen kalinti (owner karari bekliyor, YENI task OTOMATIK
  URETILMEDI — brief §18 geregi):** 8 BLOCKED alt agacin her biri kendi
  owner kararini bekliyor (bkz. registry `notes` alanlari — OBJECT-STORE
  ailesi icin S3 mimarisinin hala istenip istenmedigi, ICRABOT-LEGACY-CORE
  icin otomatik hukuki-islem aktivasyonu, CALC-PREVIEW-BREAK-GLASS icin
  cross-tenant erisim politikasi, CALC-PREVIEW-PLAYBOOK-ACTION-SIDE icin
  otomatik aksiyon yurutme yetkisi); ayrica `TraceRetentionService.runCleanup()`/
  `cleanupTenant()` suresi gecen trace'leri yalniz SAYAR ama storage'dan
  gercekten SILMEZ (kod ici mevcut yorum: "would need storage.delete
  method") — bu, servisin KENDI onceden var olan bir eksikligidir, bu task
  kapsaminda yeni bir yetenek icat etmek section 18 geregi YAPILMADI,
  testler bu gercek davranisi OLDUGU GIBI dogruladi.
- **Successor:** W3-F07-CRON-OVERLAP-AND-JOB-IDENTITY-R01 (sirada; brief'in
  binding program-lock talimati geregi bu task TAM kapanmadan
  BASLATILMAYACAK).

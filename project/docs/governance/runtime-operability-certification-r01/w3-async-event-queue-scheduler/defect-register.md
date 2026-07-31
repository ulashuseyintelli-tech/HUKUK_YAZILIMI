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
| **W3-D04** | W3-B06 SCHEDULER_TIMEZONE_UNKNOWN | P2 | 32/33 cron job | DEFERRED | NOT_ELIGIBLE (scheduler policy) |
| **W3-D05** | W3-B10 TERMINAL_FAILURE_INVISIBLE | P2 | 14/35 cron metodunda try/catch yok | DEFERRED | NOT_ELIGIBLE (scope too broad) |
| **W3-D03** | W3-B04/B05 NOT_STARTED | P3 | icrabot + manifest-retry + playbook | DEFERRED + **GUARD** | NOT_ELIGIBLE (**activation**) |
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

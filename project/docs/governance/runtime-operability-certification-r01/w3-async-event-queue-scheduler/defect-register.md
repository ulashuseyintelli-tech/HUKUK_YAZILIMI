# W3 — Defect Register

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


Makine-okunur tam kayit: `defect-register.json`.

| ID | Sinif | Oncelik | Capability | Disposition | Implementation |
|---|---|---|---|---|---|
| **W3-D02** | W3-B07 TENANT_BOUNDARY_UNSAFE | **P1** | outbox consumer handler'lari | **RESOLVED** (bkz. Cozum Kaydi) | APP-LAYER (migration GEREKMEDI) |
| **W3-D01** | W3-B11 PAYLOAD_CONTRACT_MISMATCH | P2 | `webhook` handler | DEFERRED + **GUARD** | NOT_ELIGIBLE (schema/migration) |
| **W3-D09** | W3-B10 TERMINAL_FAILURE_INVISIBLE | P2 | handler'siz action -> sonsuz pending | DEFERRED | NOT_ELIGIBLE (owner policy) |
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

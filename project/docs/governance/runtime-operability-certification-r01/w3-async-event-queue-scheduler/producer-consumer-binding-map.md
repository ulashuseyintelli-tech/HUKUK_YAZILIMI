# W3 — Producer / Consumer Baglanma Haritasi

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


## 1. Outbox kuyrugu — tam zincir

```
TRIGGER   HTTP mutation (Case / Collection / ClaimItem / OfficeApproval / Tebligat)
   |
PRODUCER  DomainEventIngestService.appendInTransaction()   -> domain-event-ingest.service.ts:141
          EngineRunnerService  (rule action dispatch)      -> engine-runner.service.ts:228
          SeedService          (demo/seed)                 -> seed.service.ts:110
   |      (createAction: tenantId ZORUNLU, fail-closed; idempotencyKey UNIQUE)
DISPATCH  OutboxCronService.processOutboxActions()  @Cron(EVERY_MINUTE)
   |      gate: ICRABOT_OUTBOX_CRON_ENABLED (varsayilan FALSE)
TRANSPORT PostgreSQL "IcrabotOutboxAction"  (status: pending|sent|done|failed|dead)
   |      claim: updateMany CAS (status in [pending,failed] AND attemptCount < max) -> count===1
CONSUMER  ActionHandlerService.dispatch(actionId, scope)
   |      1) satir-seviyesi kapsam kontrolu (outboxRowInScope)  -> kapsam disi = "not found"
   |      2) tenantId yoksa fail-closed dead-letter (MISSING_TENANT_ID)
   |      3) handler yoksa CLAIM ETMEDEN don  (bkz. W3-D09)
   |      4) handler cagrisi (context: actionId, tenantId, actionType, idempotencyKey)
EFFECT    IcrabotNotification / IcrabotSmsLog / IcrabotEmailLog / IcrabotTask /
   |      IcrabotUyapSubmission / IcrabotCaseFact / IcrabotCaseFlag / Case / CaseLifecycle
OBSERVE   IcrabotTimelineEntry (type=OUTCOME|ERROR) + markDone/markFailed/markDeadLetter
```

**Producer degerlendirmesi:** DEFINED + REACHABLE + EXECUTED + **DELIVERED**
(runtime matrix A: uretilen satir tuketildi ve domain etkisi + timeline kaydi olustu).

## 2. Kayitli handler'lar (runtime kaniti: 16)

**Platform varsayilanlari (13)** — `ActionHandlerService.registerDefaultHandlers()`:
`open_lock`, `release_lock`, `enqueue`, `send_email`, `send_sms`, `send_notification`,
`uyap_submit`, `update_case_status`, `create_task`, `set_fact`, `set_flag`,
`batch_set_facts`, `webhook` (**BOZUK — W3-D01**).

**Domain registrar'lari (3)** — `OnModuleInit` ile:
| Handler | Registrar | Modul | Baglanma |
|---|---|---|---|
| `EVENT_PUBLISHED:PAYMENT_RECEIVED` | `PaymentReceivedRegistrar` | ClientSettlementModule | BOUND |
| `EVENT_PUBLISHED:PAYMENT_REVERSED` | `PaymentReversedRegistrar` | ClientSettlementModule | BOUND |
| `EVENT_PUBLISHED:SERVICE_OCCURRENCE_RECORDED` | `ServiceOccurrenceRecordedRegistrar` | TebligatModule | BOUND |

## 3. Kopuk zincirler

| Capability | Kopan halka | Sinif |
|---|---|---|
| `icrabot/scheduler` + `task-orchestrator` | modul (IcrabotModule) AppModule'e import EDILMEZ | UNBOUND |
| `manifest-retry` worker ailesi | provider kaydi + modul importu YOK | UNBOUND |
| `playbook` alt agaci | PlaybookModule hicbir yerden import EDILMEZ | UNBOUND |
| `EvidenceBundleModule` | DynamicModule, kapanista degil | UNBOUND |
| `TraceRetentionService`, `*SimulationScheduler` | provider kaydi YOK | UNBOUND |

"Muhtemelen buraya gidiyor" kabul EDILMEDI: her satir icin referans-turu taramasi yapildi.

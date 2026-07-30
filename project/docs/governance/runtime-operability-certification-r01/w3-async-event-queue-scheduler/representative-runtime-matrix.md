# W3 — Temsilci Runtime Matrisi

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


## 1. Temsilci set (§21) ve karsilanma

| # | Gereken tur | Secilen capability | Durum |
|---|---|---|---|
| 1 | in-process event handler | `EVENT_PUBLISHED:*` registrar'lari (3) | kayit RUNTIME'da dogrulandi; domain etkisi bu turda olculmedi -> **PARTIAL** |
| 2 | database-backed / gercek queue consumer | `IcrabotOutboxAction` + `ActionHandlerService` | **CERTIFIED** |
| 3 | scheduler / cron / polling job | `OutboxCronService` `@Cron(EVERY_MINUTE)` | **CERTIFIED** |
| 4 | tenant-scoped background operation | outbox dispatch tenant kapsami | **PARTIAL** (G PASS, M bulgu) |
| 5 | retry / idempotency kullanan operation | outbox retry + claim CAS | **CERTIFIED** |
| 6 | governance/orchestration async hatti | **NOT_PRESENT** — governance orkestrasyonu `.github/workflows` ve repo-yerel script'lerle yurur; API process'inde async governance capability'si YOKTUR | kanitlandi, yapay ornek uretilmedi |

## 2. Senaryo matrisi — 12/13 PASS

| ID | Senaryo | Beklenen | Gozlenen | Sonuc |
|---|---|---|---|---|
| A | Happy path | done, attempt=1, etki+timeline | `success=true status=done attempt=1 notification=1 timeline=1` | PASS |
| B | Consumer kayitli degil | claim YOK, pending kalir | `status=pending attempt=0` | PASS |
| C | Gecersiz payload | retryable failure | `status=failed attempt=1 nextRetry=SET` | PASS |
| D | Duplicate delivery | ikinci create null, ikinci dispatch skipped, etki 1 kez | `id2=null skipped effect 0->1->1` | PASS |
| E | Retryable failure + backoff | attempt 1->2, retry listesinde | `inRetryList=true backoffGrew=true` | PASS |
| F | Non-retryable failure | ilk denemede dead | `status=dead attempt=1 nextRetry=null` | PASS |
| G | Tenant mismatch | "not found", mutation YOK | `effectDelta=0 visibleToB=false getByB=null` | PASS |
| H | Restart/recovery (stale claim) | sent->failed, tenant korunur | `recovered=1 tenantKorundu=true` | PASS |
| I | DLQ + manuel replay | DLQ(A)=1, DLQ(B)=0, cross-tenant replay red | `crossTenantRejected=true status=pending` | PASS |
| J | **Scheduler-driven uctan uca** | cron kendisi tetikler | `created 13:44:58 -> cron tick 13:45:00 -> done` (**manuel dispatch YOK**) | PASS |
| K | Graceful shutdown | app.close() sonrasi job durur | `cronJobsAfter=0` | PASS |
| L | Bozuk handler (eksik Prisma modeli) | her zaman failed | `prismaModelVar=false status=failed` | PASS (kusur **UREDILDI**) |
| M | Consumer case->tenant sahiplik kontrolu | **guvenli olan: red** | `dispatchSuccess=true, etki YAZILDI` | **FAIL -> W3-D02** |

## 3. Applicability

`I. Graceful shutdown` API process'i icin uygulanabilir ve olculdu (K).
Ayri worker process olmadigi icin "worker restart" senaryosu N/A'dir; yerine
outbox stale-claim recovery (H) olculmustur.

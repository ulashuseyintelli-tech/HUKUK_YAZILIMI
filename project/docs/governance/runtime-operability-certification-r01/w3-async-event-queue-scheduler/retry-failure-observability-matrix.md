# W3 — Retry / Dead-Letter / Failure Gorunurlugu

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


## 1. Outbox retry sozlesmesi (olculdu)

| Ozellik | Deger | Kanit |
|---|---|---|
| max attempt | 8 (`ICRABOT_OUTBOX_MAX_ATTEMPTS`) | `outbox.constants.ts` |
| backoff | `retryBaseMs * 2^(attempt-1)`, taban 60 000 ms | `markFailed` |
| retryable siniflandirma | handler exception -> `failed` + `nextRetryAt` | matrix C, E |
| non-retryable siniflandirma | `NonRetryableOutboxError` -> **ilk denemede** `dead` | matrix F |
| terminal durum | `dead`, `nextRetryAt=null` | matrix F |
| dead-letter kuyrugu | `getDeadLetterQueue(scope)` — **VAR** | matrix I |
| manuel replay | `retryDeadAction(scope, id)` — atomik `updateMany`, `count!==1` -> 404 | matrix I |
| replay tenant kapsami | cross-tenant replay **REDDEDILIR** | matrix I: `crossTenantRejected=true` |
| duplicate riski | claim CAS ile engellenir | matrix D |
| stale claim kurtarma | 10 dk cutoff -> `failed`/`dead` | matrix H |

## 2. Failure injection sonuclari

```
ILK DENEME BASARISIZ -> RETRY VEYA TERMINAL FAILURE -> BEKLENEN DURUM
                     -> KONTROLSUZ DUPLICATE ETKI YOK
```
Dogrulandi: C (retryable), F (non-retryable terminal), H (restart/recovery),
D (duplicate delivery -> yan etki 1 kez).

## 3. Gozlemlenebilirlik

| Sinyal | Outbox | Diger 32 cron |
|---|---|---|
| execution started | kismi (yalniz anlamli sonucta log) | degisken |
| execution succeeded | `IcrabotTimelineEntry` type=OUTCOME | YOK |
| execution failed | ERROR log + `lastError` JSON + timeline | 14 metotta try/catch bile YOK |
| retry attempted | `attemptCount` + `nextRetryAt` | N/A |
| terminal failure | `status='dead'` + DLQ | N/A |
| job/message kimligi | `actionId`, `idempotencyKey` | job adi cogunlukla UUID |
| tenant kimligi | outbox satirinda | N/A |
| correlation ID | `runId` | YOK |
| sure | olculmuyor | olculmuyor |
| ErrorLog'a dusme | **VAR** (`IntegrationErrorReporter`, source=CRON) | yalniz OutboxCronService |

Log'larda secret/credential/privileged payload **GOZLENMEDI**.
Yalniz console log varligi observability certification SAYILMAMISTIR.

## 4. DLQ yoklugu bildirimi

Outbox disindaki hicbir async capability'de dead-letter/quarantine mekanizmasi **YOKTUR**.
Cron job'lar icin terminal failure durumu kavrami mevcut degildir. Varmis gibi
sertifikalandirilmamistir.

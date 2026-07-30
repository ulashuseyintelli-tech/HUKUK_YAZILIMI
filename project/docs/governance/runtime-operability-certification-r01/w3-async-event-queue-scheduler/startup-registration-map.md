# W3 — Startup / Registration Haritasi

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


## 1. Process entrypoint'leri

| Kaynak | Durum | Kanit |
|---|---|---|
| API process (`main.ts` -> `NestFactory.create(AppModule)`) | **TEK production async runtime'i** | `apps/api/package.json` `start`/`start:prod` |
| Ayri worker process | **YOK** | package scripts icinde worker entrypoint yok |
| CLI process | seed/backfill script'leri (tek seferlik, cron degil) | `db:seed`, `backfill:*`, `inventory:*` |
| GitHub Actions schedule | **YOK** | `.github/workflows/*.yml`: yalniz `push`, `pull_request` |
| Harici hosting cron | **KANIT YOK** | Docker/compose/deployment manifesti repoda yok |
| Test harness bootstrap | production bootstrap ile KARISTIRILMADI | runtime kanitlari `AppModule` uzerinden alindi |

## 2. Olculen startup zinciri (controlled-local)

```
PROCESS ENTRYPOINT   NestFactory.createApplicationContext(AppModule)
CONFIG LOAD          ConfigModule.forRoot({ isGlobal: true })
DEP CONSTRUCTION     103 modul; PrismaService.onModuleInit -> $connect
HANDLER REGISTRATION ActionHandlerService ctor -> registerDefaultHandlers() (13)
                     3 registrar OnModuleInit -> ActionHandlerService.register() (+3)
TRANSPORT/SCHEDULER  SchedulerOrchestrator -> 33 CronJob
START/LISTEN         cron job'lar baslar; app-context port DINLEMEZ
```

Olculen bootstrap suresi: **201 ms** (app-context; HTTP listener yok).

## 3. `ScheduleModule.forRoot()` cok-kez cagrilmasi

`forRoot()` **6 yerde** cagrilir: `app.module.ts`, `automation.module.ts`,
`icrabot.module.ts`, `interest-engine.module.ts`, `scheduler.module.ts`,
`policy-engine.module.ts`.

**Olcum:** `SchedulerRegistry.getCronJobs()` -> **33 job, yinelenen ad 0**.
Yani W3-B13 DUPLICATE_REGISTRATION **GOZLENMEDI**. Bu sonuc varsayilmadi, olculdu.

## 4. Kayitli cron job listesi (33)

| cron ifadesi | job sayisi |
|---|---|
| `0 0-23/1 * * *` (saatlik) | 8 |
| `0 0 * * *` / `0 09 * * *` / `0 10 * * *` vb. gunluk | 17 |
| `0 */5 * * * *` (5 dk) | 2 |
| `*/1 * * * *` (dakikalik) | 2 (`GreetingService`, `OutboxCronService`) |
| `0 */4 * * *` | 1 |
| `0 */30 * * * *` (`officeApprovalExecutor`) | 1 |
| `30 15 * * 1-5` | 1 |
| `0 8 1 * *` / `0 10 2 * *` (aylik) | 2 |
| `30 3 * * *` (`errorLogRetention`) | 1 |

**31 job UUID adiyla kayitlidir** (bkz. W3-D07).

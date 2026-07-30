# W3 — Async Yuzey Envanteri

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


## 1. Fresh teknoloji turetimi

Var olmayan teknoloji VARSAYILMADI; asagidaki liste `apps/api/package.json` bagimliliklari
ve gercek kod kullanimindan turetildi.

### MEVCUT
| Teknoloji | Kanit |
|---|---|
| `@nestjs/schedule` ^6.1.0 — in-process cron | `ScheduleModule.forRoot()` app.module.ts:155 + 5 modulde daha; 33 kayitli job |
| Database-backed outbox kuyrugu | `IcrabotOutboxAction` tablosu + `OutboxService` + `OutboxCronService` |
| In-process handler registry | `ActionHandlerService.handlers: Map<string, ActionHandler>` |
| `setInterval` polling dongusu | 18 dosya (rate-limit sweeper'lari, cache, lease, trace retention) |
| `ioredis` ^5.3.2 | yalniz `calc-preview/diagnostics/simulation-api/redis/*` (rate-limit store) |

### MEVCUT DEGIL (NOT_PRESENT — yapay ornek uretilmedi)
BullMQ/Bull, RabbitMQ (`amqplib`), Kafka (`kafkajs`), `@nestjs/event-emitter`,
`node-cron`/`agenda`/`bee-queue`, GitHub Actions `schedule:` (iki workflow da yalniz
`push`/`pull_request`), OS/harici scheduler, Docker/compose servis manifesti,
gercek giden HTTP webhook cagrisi (`webhook` handler'i yalniz DB'ye yazmayi dener).

## 2. Sinyal sayimlari (non-test kaynak)

| Sinyal | Dosya sayisi |
|---|---|
| `@Cron` | 16 sinif / 35 bildirim |
| `@Interval` / `@Timeout` | 0 / 0 |
| `setInterval` | 18 |
| `OnModuleInit` | 22 |
| `onApplicationBootstrap` | 0 |
| `OnModuleDestroy` | 8 |
| `SchedulerRegistry` kullanimi | 0 |

## 3. Cron bildirim census'u (35)

Tam liste `async-capability-inventory.json` icindedir. Ozet:

| Olcut | Deger |
|---|---|
| Toplam `@Cron` bildirimi | 35 |
| Kodda `timeZone` bildiren | **1** |
| Kodda `name` bildiren | **2** |
| Overlap guard tasiyan | **2** |
| Aktivasyon gate'i olan | 3 |
| `try/catch` TASIMAYAN | **14** |

## 4. AppModule kapanisi

- `@Module` sinifi sayisi (kaynakta): **105**
- AppModule import kapanisi: **103** dugum
- Kosullu kok: `SimulationApiModule` (`SIMULATION_API_ENABLED !== "false"` -> **varsayilan ACIK**)
- Yalniz kosullu koke bagli alt agac: `TruthLayerModule`, `SimulationApiModule`
- Cozulemeyen import: **0**; ad belirsizligi: **0**

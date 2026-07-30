# W3 — Kapsam ve Metodoloji

> PROGRAM: RUNTIME-OPERABILITY-CERTIFICATION-R01
> TASK: RUNTIME-OPERABILITY-CERTIFICATION-R01-W3-ASYNC-EVENT-QUEUE-SCHEDULER-CERTIFICATION
> AUDIT BASE: `c537cb3a61f988347fafabb419d4eccaa6e1461e`
> KANIT TURU: CONTROLLED LOCAL / DISPOSABLE DB / SENTETIK TENANT — production DB'ye DOKUNULMADI


## 1. Amac

Async consumer, event handler, queue worker, cron/scheduler ve retry/dead-letter yollarinin
**dosya varligiyla degil, calisan runtime zinciriyle** siniflandirilmasi.

Basari olcutu async dosyalarinin listelenmesi DEGILDIR. Basari, su zincirin durustce
siniflandirilmasidir:

```
PRODUCER -> DISPATCH -> STARTED TRANSPORT/SCHEDULER -> REGISTERED CONSUMER
        -> DOMAIN EFFECT -> TENANT + IDEMPOTENCY -> FAILURE/RETRY -> OBSERVABILITY
```

## 2. Yontem

| Adim | Yontem | Neden bu yontem |
|---|---|---|
| Envanter | Tum `apps/api/src` .ts dosyalarinda async sinyal taramasi (`@Cron`, `@Interval`, `@Timeout`, `setInterval`, `SchedulerRegistry`, `OnModuleInit`, `onApplicationBootstrap`, `OnModuleDestroy`) | grep tek basina yorumlanmis kodu da sayar |
| Yorum eleme | Parse ONCESI `//` ve `/* */` bosluga cevrilir | `app.module.ts` icinde **yorumlanmis** `IcrabotModule` importu ilk analizde yanlisikla BAGLI sayildi; duzeltildi |
| Modul grafi | Her `@Module({...})` icin `imports`/`providers` ust-seviye tanimlayicilari, dosyanin kendi `import` deyimleriyle **dosyaya** cozulur; kimlik `dosya#Sinif` | Iki farkli `SchedulerService` (scheduler/ ve icrabot/scheduler/) yalniz ada gore eslestirilirse karisir — nitekim ilk analizde karisti |
| Barrel takibi | `index.ts` re-export zinciri izlenir (`export { X } from`, `export * from`) | `DiagnosticsModule`/`DomainEventIngestModule` barrel uzerinden import edilir; takip edilmezse kapanis eksik cikar |
| Kapanis | `AppModule`'den BFS; kosullu `...getConditionalImports()` govdesi cozulup ayri isaretlenir | `SimulationApiModule` `SIMULATION_API_ENABLED !== "false"` ile **varsayilan ACIK** |
| Referans turu | provider olmayan siniflar icin `@UseGuards`/`@UseInterceptors`/`new X()`/`X.forRoot()`/`useClass`/ctor-injection taramasi | Rate-limit guard'lari provider DEGILDIR ama Nest enhancer'i ile **baglidir**; "unbound" demek yanlis olurdu |
| Runtime dogrulama | Gercek `NestFactory.createApplicationContext(AppModule)` + `SchedulerRegistry.getCronJobs()` + `ActionHandlerService` handler kaydi | Statik analiz tek basina delil sayilmaz |
| Senaryo matrisi | Disposable Postgres uzerinde A..M senaryolari | Mock-only basari yeterli degildir |
| Timezone | Ayni build, TEK degisken `TZ` ile diferansiyel kosum | "timezone bildirilmemis" iddiasini varsaymak yerine olcmek |

## 3. Statik ve runtime mutabakati

| Olcum | Statik | Runtime | Durum |
|---|---|---|---|
| Kaynakta `@Cron` bildirimi | 35 | — | — |
| AppModule kapanisinda BAGLI `@Cron` | 33 | 33 | **BIREBIR** |
| Dormant (IcrabotModule) `@Cron` | 2 | kayitli degil | **BIREBIR** |
| Nest `@Interval`/`@Timeout` | 0 / 0 | 0 / 0 | **BIREBIR** |
| Kayitli outbox handler | 13 varsayilan + 3 registrar | 16 | **BIREBIR** |

## 4. Runtime test siniri

Kullanilan: controlled-local, disposable `postgres:16-alpine` (port 55432, db `w3_async_db`),
sentetik tenant `w3-tenant-alpha` / `w3-tenant-beta`.

YAPILMAYAN: production database mutation, production queue publish, gercek musteri bildirimi,
gercek e-posta/SMS gonderimi, canli webhook cagrisi, production feature flag aktivasyonu,
external cloud evidence.

## 5. Bu belgenin uretmedigi yetki

Bu artefaktlar **product capability authority URETMEZ**. Hicbir capability burada
aktive edilmemis, hicbir sema/migration uygulanmamistir.

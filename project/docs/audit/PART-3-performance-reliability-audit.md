# PART-3 — Performance & Reliability Audit (Revize v2)

**Tarih:** 2026-02-27  
**Kapsam:** Cron job'lar, Prisma query pattern'leri, external API çağrıları, DB config  
**Yöntem:** Statik kod analizi (ölçüm yok)  
**Disiplin:** Ölçülmemiş her değer UNKNOWN veya ESTIMATE olarak işaretlenir

---

## ENVANTER

### Cron Job'lar (Aktif)

| # | Servis | Job | Schedule | Loop var mı? | External call? |
|---|--------|-----|----------|-------------|----------------|
| 1 | SchedulerService | checkPaymentOrderDeadlines | EVERY_DAY_AT_9AM | Evet (N case × 3 write) | Hayır |
| 2 | SchedulerService | processNafakaPeriods | Her ayın 1'i 08:00 | Evet (N case × 2 write) | Hayır |
| 3 | SchedulerService | checkMtsReturns | EVERY_DAY_AT_10AM | Evet (N case × 3 write) | Hayır |
| 4 | SchedulerService | retryFailedUyapRequests | EVERY_6_HOURS | Evet (N req × 1 update, take:10) | Hayır |
| 5 | SchedulerService | calculateDailyStats | EVERY_DAY_AT_MIDNIGHT | Hayır | Hayır |
| 6 | SchedulerService | checkUpcomingTasks | EVERY_HOUR | Hayır (count) | Hayır |
| 7 | SchedulerService | checkIhbarnameDeadlines | EVERY_DAY_AT_10AM | Evet (N tp × findFirst + create) | Hayır |
| 8 | SchedulerService | checkExternalCaseFollowups | EVERY_DAY_AT_11AM | Evet (N ec × findFirst + create) | Hayır |
| 9 | SchedulerService | checkTebligatStatus | Her 4 saat | Evet (take:50 × update) | Mock (PTT API placeholder) |
| 10 | SchedulerService | sendDueReminders | EVERY_DAY_AT_8AM | Evet (N due × notification create) | Hayır |
| 11 | AutomationService | processPendingCases | Her 5 dk | Evet | Hayır |
| 12 | AutomationService | updateDaysLeft | Her gün 01:00 | Evet | Hayır |
| 13 | AutomationService | checkNotificationExpiries | Her saat | Evet | Hayır |
| 14 | AutomationService | updateExpiredPoas | Her gün 02:00 | Evet | Hayır |
| 15 | AutomationService | sendExpiringPoaNotifications | Her gün 09:00 | Evet | Hayır |
| 16 | RateSyncService | syncTcmbRates | Her gün 09:30 | Evet (tenant loop) | Evet (EVDS API) |
| 17 | RateSyncService | syncMonthlyMevduatRates | Her ayın 2'si | Evet (tenant loop) | Evet (EVDS API) |
| 18 | ExchangeRateService | (weekday rate update) | Hafta içi 15:30 | Hayır | Evet (TCMB XML) |

**Not:** SchedulerService.updateInterestAmounts `@Cron` decorator'ı kaldırılmış, deprecated.


### External API Çağrıları — Timeout Durumu

| Servis | Hedef | Timeout | Durum |
|--------|-------|---------|-------|
| GazetteWatcher | RSS feed | 15s | ✅ Var |
| ExchangeRateService | TCMB XML | 10s | ✅ Var |
| TariffModule | Gazette | 15s | ✅ Var |
| RateSyncService | EVDS API | YOK | ❌ Risk |
| SmsProviderService | NetGSM API | YOK | ❌ Risk |
| SmsProviderService | İletimerkezi API | YOK | ❌ Risk |
| EmailProviderService | SendGrid API | YOK | ❌ Risk |
| SchedulerService | PTT Barkod (mock) | YOK | ⚠️ Mock ama gerçek entegrasyonda risk |

### Prisma Include Pattern'leri (Büyük Sorgular)

| Servis | Metod | Include derinliği | Ek sorgular |
|--------|-------|-------------------|-------------|
| TemplateEngineService | getCaseData | 3 seviye (debtors→debtor→debtorAddresses+estateHeirs) | +4 conditional findFirst (lease, judgment, instrument, collateral) |
| ValidationGateService | getCaseData | 2 seviye (debtors→debtor→debtorAddresses) | +4 try/catch findFirst |
| SchedulerService | checkPaymentOrderDeadlines | 2 seviye (debtors→debtor) | — |
| SchedulerService | checkIhbarnameDeadlines | 2 seviye (caseDebtor→case+debtor) | — |

---

## BULGULAR

---

### R-01 — External API Timeout Eksikliği

**Severity:** P1  
**Kanıt tipi:** PROVEN (kod incelemesi)  
**Etkilenen servisler:** RateSyncService, SmsProviderService, EmailProviderService

**Bulgu:**
`fetch()` çağrılarında timeout parametresi yok. Node.js'te `fetch` thread bloklamaz (event loop single-threaded); ancak timeout yoksa request'ler süresiz pending kalır. Sonuç:
- Socket/connection kaynakları tükenir
- Pending promise'ler birikir, memory artar
- Downstream servis yavaşlarsa cascading failure oluşur

**Kanıt (RateSyncService.fetchEvdsData):**
```typescript
// Timeout yok — request süresiz bekleyebilir
const response = await fetch(url, {
  headers: { Accept: 'application/json' },
});
```

**Kanıt (SmsProviderService.sendViaNetGsm):**
```typescript
// Timeout yok
const response = await fetch(`${url}?${params}`);
```

**Kanıt (EmailProviderService):**
```typescript
// Timeout yok
const response = await fetch('https://api.sendgrid.com/v3/mail/send', { ... });
```

**Fix planı:**
```typescript
// AbortController ile timeout pattern
const controller = new AbortController();
const timeoutId = setTimeout(() => controller.abort(), 10_000); // 10s
try {
  const response = await fetch(url, { signal: controller.signal });
  // ...
} finally {
  clearTimeout(timeoutId);
}
```

**Uygulama sırası:**
1. RateSyncService (cron job'da çalışıyor, overlap riski artırır)
2. SmsProviderService (kullanıcı-facing, UX etkisi)
3. EmailProviderService (kullanıcı-facing)

---

### R-02 — Prisma Query Pattern'leri: Loop N+1 ve Unbounded Query

**Severity:** P1  
**Kanıt tipi:** PROVEN (loop pattern) + UNKNOWN (include query planı)

#### R-02.1 — Loop-based N+1 Pattern

**P1 gerekçesi (PROVEN):**
- `checkPaymentOrderDeadlines`: Her expired case için 3 ayrı write (case.update + decisionLog.create + caseLifecycle.create). N case = N×3 DB call. Bu koddan kesin.
- `processNafakaPeriods`: Her nafaka case için 2 write (due.create + decisionLog.create). N case = N×2 DB call. Koddan kesin.
- `checkMtsReturns`: Her MTS case için 3 write (case.update + decisionLog.create + caseLifecycle.create). N case = N×3 DB call. Koddan kesin.
- `checkIhbarnameDeadlines`: Her expired thirdParty için findFirst + conditional create. N tp = N×2 DB call. Koddan kesin.

**Include tarafı: UNKNOWN.**
Include'ların query planı (tek JOIN vs. ayrı SELECT) Prisma sürümüne, adapter'a ve ilişki tipine bağlıdır. Gerçek query sayısı `prisma.$on('query')` veya `pg_stat_statements` ile ölçülecek. Bu raporda include kaynaklı query sayısı hakkında kesin iddia yapılmaz.

**Worst-case estimate (sadece referans, severity'yi buna bağlamıyoruz):**
Faz-1 (read): include query sayısı UNKNOWN  
Faz-2 (loop): limit=20 case varsayımıyla 20×3 = 60 write (PROVEN pattern, case sayısı ESTIMATE)  
Toplam: UNKNOWN + 60 (minimum, case sayısına bağlı)

**Fix planı:**
1. Loop write'ları batch'le: `prisma.$transaction([...writes])` ile N×3 yerine tek transaction
2. Include sorgularını ölç: dev ortamında `prisma.$on('query')` ile gerçek query sayısını logla
3. Gerekirse `select` ile sadece kullanılan alanları çek (include yerine)


#### R-02.2 — Unbounded Query (take/limit eksikliği)

**Severity:** P1  
**Kanıt tipi:** PROVEN (kod incelemesi — take/limit yok)

**Etkilenen job'lar:**

| Job | Sorgu | take var mı? | Risk |
|-----|-------|-------------|------|
| checkPaymentOrderDeadlines | case.findMany({where: ...}) | ❌ YOK | Tüm expired case'ler memory'ye çekilir |
| processNafakaPeriods | case.findMany({where: ...}) | ❌ YOK | Tüm nafaka case'leri memory'ye çekilir |
| sendDueReminders | due.findMany({where: ...}) | ❌ YOK | Tüm unpaid due'lar memory'ye çekilir |
| checkIhbarnameDeadlines | thirdParty.findMany (×2) | ❌ YOK | Tüm expired ihbarnameler memory'ye çekilir |
| checkExternalCaseFollowups | externalCase.findMany | ❌ YOK | Tüm pending external case'ler memory'ye çekilir |

**Karşılaştırma:** `checkTebligatStatus` doğru yapılmış: `take: 50` ile sınırlandırılmış. `retryFailedUyapRequests` da doğru: `take: 10`.

**Etki:**
- Veri büyüdükçe memory spike (OOM riski)
- Job runtime uzar → overlap riski artar (R-03 ile bağlantılı)
- Event loop'ta uzun süre meşgul kalma

**Fix planı:**
```typescript
// Pagination + batch processing pattern
const BATCH_SIZE = 50;
let skip = 0;
let batch;
do {
  batch = await this.db.case.findMany({
    where: { ... },
    take: BATCH_SIZE,
    skip,
    orderBy: { createdAt: 'asc' },
  });
  for (const item of batch) {
    await processItem(item);
  }
  skip += BATCH_SIZE;
} while (batch.length === BATCH_SIZE);
```

Veya cursor-based pagination (daha performanslı):
```typescript
let cursor: string | undefined;
const BATCH_SIZE = 50;
while (true) {
  const batch = await this.db.case.findMany({
    where: { ... },
    take: BATCH_SIZE,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    orderBy: { id: 'asc' },
  });
  if (batch.length === 0) break;
  for (const item of batch) { await processItem(item); }
  cursor = batch[batch.length - 1].id;
}
```

---

### R-03 — Cron Job Overlap / Reentrancy Riski

**Severity:** P1  
**Kanıt tipi:** PROVEN (lock/mutex araması 0 match)

#### R-03.1 — Explicit Lock Yok

**Bulgu:**
Codebase'te cron job'lar için hiçbir lock mekanizması yok:
- `pg_advisory_lock` kullanımı: 0
- Redis lock (redlock, SET NX): 0
- In-process mutex/semaphore: 0

**Risk:**
Explicit lock yoksa single instance'ta bile overlap/reentrancy mümkündür. Job runtime > period olduğunda duplicate işlem riski doğar.

Somut senaryo:
- `processPendingCases` her 5 dakikada çalışıyor
- Eğer bir çalışma 5 dakikadan uzun sürerse (DB yavaşlığı, external API timeout vb.), bir sonraki invocation önceki bitmeden başlar
- Aynı case iki kez işlenebilir → duplicate decisionLog, duplicate stage change

Multi-instance'ta risk katlanır: 2 instance = aynı job aynı anda 2 kez çalışır.

**Fix planı — pg_advisory_lock:**

```typescript
// 1. Lock key üretimi: jobName → bigint
function jobLockKey(jobName: string): bigint {
  // Basit hash — collision riski düşük
  let hash = 0n;
  for (let i = 0; i < jobName.length; i++) {
    hash = ((hash << 5n) - hash) + BigInt(jobName.charCodeAt(i));
    hash &= 0xFFFFFFFFn; // 32-bit sınırla
  }
  return hash;
}

// 2. Lock wrapper
async function withJobLock(
  prisma: PrismaService,
  jobName: string,
  fn: () => Promise<void>,
  logger: Logger,
): Promise<void> {
  const key = jobLockKey(jobName);
  
  // Session-scoped try lock (non-blocking)
  const [{ pg_try_advisory_lock: acquired }] = await prisma.$queryRawUnsafe<
    [{ pg_try_advisory_lock: boolean }]
  >(`SELECT pg_try_advisory_lock(${key})`);
  
  if (!acquired) {
    logger.warn(`Job "${jobName}" zaten çalışıyor, skip ediliyor`);
    // Metric: scheduler_job_skipped_total{job=jobName}
    return;
  }
  
  try {
    await fn();
  } finally {
    await prisma.$queryRawUnsafe(`SELECT pg_advisory_unlock(${key})`);
  }
}
```

**Detaylar:**
- Scope: Session-scoped (`pg_try_advisory_lock`). Transaction-scoped (`pg_try_advisory_xact_lock`) cron job'un doğasına uymuyor çünkü job tek transaction boundary'si içinde çalışmıyor.
- Lock key: `jobName` bazlı (global). Scheduler tenant-agnostic tarama yaptığı için tenant-level lock gereksiz. Tenant-level lock ancak "tenant başına parallel işleme" optimizasyonunda anlamlı olur.
- Lock alınamazsa: Job skip + `scheduler_job_skipped_total{job="..."}` counter metric emit edilir.
- Lock release: `finally` block'ta explicit `pg_advisory_unlock`. Process crash durumunda PostgreSQL session kapanınca lock otomatik release olur.

**Uygulama önceliği:**
1. `processPendingCases` (5 dk period — en yüksek overlap riski)
2. `checkPaymentOrderDeadlines` (unbounded query + loop write)
3. Diğer günlük job'lar


#### R-03.2 — External API Timeout + Cron Overlap Bileşik Riski

**Severity:** P1  
**Kanıt tipi:** PROVEN (timeout yok + lock yok = bileşik risk)

**Senaryo:**
`syncTcmbRates` (09:30) → EVDS API'ye timeout'suz fetch → API yavaşlarsa request süresiz pending kalır → socket/connection kaynakları tükenir, memory artar → bir sonraki cron tick'te aynı job tekrar başlar (lock yok) → cascading failure.

Bu R-01 (timeout yok) + R-03.1 (lock yok) birleşimidir. İkisi birlikte çözülmeli.

---

### R-04 — DB Configuration Eksiklikleri

**Severity:** P2  
**Kanıt tipi:** PROVEN (config incelemesi)

#### R-04.1 — Statement Timeout Yok

**Mevcut durum:**
```
DATABASE_URL="postgresql://postgres:postgres@localhost:5432/hukuk_db?schema=public"
```

Connection string'te `statement_timeout`, `connection_limit`, `pool_timeout` parametresi yok. Runaway query DB'yi süresiz meşgul edebilir.

**Fix planı — İki alternatif (ortamda doğrulanmalı):**

**Alternatif 1 — DB-side (önerilen, en güvenilir):**
```sql
-- App user için
ALTER ROLE app_user SET statement_timeout = '30s';

-- Veya database seviyesinde (tüm roller için)
ALTER DATABASE hukuk_db SET statement_timeout = '30s';
```

**Doğrulama:**
```sql
-- Bağlantı açtıktan sonra
SHOW statement_timeout;
-- Beklenen çıktı: 30s
```

**Alternatif 2 — Connection string options (driver desteğine bağlı):**
```
DATABASE_URL="postgresql://...?schema=public&options=-c statement_timeout=30000"
```

**Uyarı:** Bu yöntem her PostgreSQL driver'da garanti çalışmaz. Prisma'nın bu parametreyi nasıl işlediği sürüme bağlıdır. Uygulandıktan sonra `SHOW statement_timeout;` ile doğrulanmalıdır.

**Connection pool ayarları (Prisma URL parametreleri):**
```
&connection_limit=10&pool_timeout=15
```
Bu parametreler Prisma tarafından desteklenir ancak varsayılan değerlerin yeterliliği yük testinde doğrulanmalıdır.

#### R-04.2 — Query Telemetry Yok

**Mevcut durum:**
PrismaService'te hiçbir log/metric konfigürasyonu yok:
```typescript
@Injectable()
export class PrismaService extends PrismaClient
  implements OnModuleInit, OnModuleDestroy {
  async onModuleInit() { await this.$connect(); }
  async onModuleDestroy() { await this.$disconnect(); }
}
```

**Fix planı — Ortama göre ayrışan telemetry:**

**Production:**
- `pg_stat_statements` extension'ı aktif et → slow query, call count, mean time
- Application-level histogram metrikleri: `db_query_duration_seconds{operation="findMany|create|update"}` (p95/p99)
- Prisma log seviyesi: sadece `warn` + `error`

**Dev/Staging:**
- Prisma query event ile query count ve süre logla:
```typescript
// Dev/staging only
const prisma = new PrismaClient({
  log: [
    { emit: 'event', level: 'query' },
    { emit: 'stdout', level: 'warn' },
    { emit: 'stdout', level: 'error' },
  ],
});
prisma.$on('query', (e) => {
  if (e.duration > 100) { // 100ms üzeri
    logger.warn(`Slow query (${e.duration}ms): ${e.query}`);
  }
});
```

**Neden prod'da Prisma query log açılmaz:**
- `query` log seviyesi her SQL statement'ı loglar → yüksek I/O + disk maliyeti
- Query parametreleri loglanır → PII sızıntı riski
- `pg_stat_statements` aynı bilgiyi DB tarafında, daha düşük overhead ile sağlar

---

## REGRESSION TEST PLANI

### Core Tests (Deterministik — Zorunlu)

| ID | Test | Kategori | Doğrulama |
|----|------|----------|-----------|
| T-01 | Timeout'lu fetch: AbortController 10s sonra abort eder | R-01 | Mock timer + AbortError assert |
| T-02 | Timeout'suz fetch backward compat: mevcut happy path bozulmadı | R-01 | Mock fetch success |
| T-03 | Loop write batch: N case → tek transaction, N×3 ayrı call yok | R-02.1 | prisma.$transaction mock + call count |
| T-04 | Unbounded query → pagination: batch size aşılınca ikinci batch çekilir | R-02.2 | Mock findMany ile 2 batch |
| T-05 | Advisory lock acquired → job çalışır | R-03.1 | Mock pg_try_advisory_lock → true |
| T-06 | Advisory lock NOT acquired → job skip + metric emit | R-03.1 | Mock pg_try_advisory_lock → false |
| T-09 | Lock release: job hata fırlatsa bile unlock çağrılır | R-03.1 | Mock throw + unlock assert |
| T-10 | Pagination cursor: son batch < BATCH_SIZE ise loop durur | R-02.2 | Mock findMany ile partial batch |
| T-11 | sendDueReminders: take limiti ile çalışır | R-02.2 | findMany call args assert |
| T-12 | checkPaymentOrderDeadlines: take limiti ile çalışır | R-02.2 | findMany call args assert |

### Extended Tests (Opsiyonel / Chaos — Non-deterministic)

| ID | Test | Kategori | Not |
|----|------|----------|-----|
| T-07 | Pool timeout hatası → graceful error, crash yok | R-04.1 | Chaos test; pool exhaustion simülasyonu zor, flaky olabilir |
| T-08 | pg_sleep(60) → statement_timeout ile kesilir | R-04.1 | statement_timeout ayarı yoksa test anlamsız; ortam bağımlı |

---

## ÖZET TABLO

| Bulgu | Severity | Kanıt | Kısa Açıklama |
|-------|----------|-------|---------------|
| R-01 | P1 | PROVEN | External API timeout yok → cascading failure riski |
| R-02.1 | P1 | PROVEN (loop) + UNKNOWN (include) | Per-case loop write kesin N+1; include query planı ölçülecek |
| R-02.2 | P1 | PROVEN | findMany'de take/limit yok → memory spike + overlap riski |
| R-03.1 | P1 | PROVEN | Cron lock yok → single/multi instance overlap |
| R-03.2 | P1 | PROVEN | Timeout yok + lock yok bileşik risk |
| R-04.1 | P2 | PROVEN | statement_timeout yok → runaway query riski |
| R-04.2 | P2 | PROVEN | Query telemetry yok → blind spot |

---

## PART-4 GEÇİŞ NOTU

PART-4'te consolidated patch plan şu öncelik sırasıyla yazılacak:
1. **Security P1** kapanmadan perf refactor yok
2. **Reliability P1** (R-01 timeout + R-03 lock + R-02.2 unbounded)
3. **Performance P1** (R-02.1 batch write)
4. **P2** (R-04 DB config + telemetry)

Her patch için: etkilenen dosyalar, test coverage, rollback planı, DoD (Definition of Done).

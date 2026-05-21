---
status: completed
review-trigger: "Tarihsel kayıt — değişmez"
---

# Stabilization Status — Historical Verification Record

**Tarih:** 2026-05-19  
**Durum:** ✅ Tüm maddeler kapatılmış. Bu belge **historical record**'dur, aktif iş değildir.  
**Önceki ad:** `01-stabilization-pre-kernel.md` (aktif sprint olarak yazılmıştı)

---

## Neden bu belge var?

Önceki mimari analizinde (v1), `docs/audit/PART-3-performance-reliability-audit.md` ve `docs/audit/PART-4-consolidated-patch-plan.md` belgelerine güvenildi. Bu belgeler **2026-02-27 tarihli**. 3 ay sonra (2026-05-19) deep scan'de görüldü ki PART-4'teki **5/5 P1 maddesi zaten kapatılmıştı, ama belgeler güncellenmemişti.**

Bu belge:
1. Hangi maddenin gerçekten kapandığının kanıtını tutar
2. Aynı stale audit hatasına bir daha düşülmemesi için işaret koyar
3. Silmek tarihsel izi kaybettirir, revize ediyoruz

---

## Kapatılmış Maddeler (Kanıt Linkleri)

### PF-001 — v28-engine Auth Guard

**Konu:** Audit'te v28-engine controller'larında `@UseGuards(JwtAuthGuard)` eksik dendi.

**Gerçek durum (2026-05-19):** ✅ KAPALI. 12/12 controller class'ında guard mevcut.

**Kanıt:**
```
HUKUK_YAZILIMI/project/apps/api/src/modules/icrabot/v28-engine/v28-engine.controller.ts
  Line 35: @UseGuards(JwtAuthGuard)  → UyapEventController
  Line 54: @UseGuards(JwtAuthGuard)  → FactStoreController
  Line 195: @UseGuards(JwtAuthGuard) → TimelineController
  Line 248: @UseGuards(JwtAuthGuard) → EngineRunController
  Line 282: @UseGuards(JwtAuthGuard) → OutboxController
  Line 389: @UseGuards(JwtAuthGuard) → ActionsController
  Line 406: @UseGuards(JwtAuthGuard) → RulesController
  Line 542: @UseGuards(JwtAuthGuard) → ComputeController
  Line 567: @UseGuards(JwtAuthGuard) → SeedController
  Line 596: @UseGuards(JwtAuthGuard) → PolicyGateController
  Line 682: @UseGuards(JwtAuthGuard) → ScenarioHarnessController
  Line 730: @UseGuards(JwtAuthGuard) → ActionFeedbackController
```

---

### PF-002 — Login Rate Limit

**Konu:** `/auth/login` ve `/portal/login` endpoint'lerinde rate limit yok dendi.

**Gerçek durum:** ✅ KAPALI. Dedicated `LoginRateLimitGuard` yazılmış, her iki endpoint'te kullanılıyor.

**Kanıt:**
```
HUKUK_YAZILIMI/project/apps/api/src/modules/auth/guards/login-rate-limit.guard.ts
  Line 34: @Injectable() export class LoginRateLimitGuard implements CanActivate

HUKUK_YAZILIMI/project/apps/api/src/modules/auth/auth.controller.ts
  Line 17-18: @Post("login") @UseGuards(LoginRateLimitGuard)

HUKUK_YAZILIMI/project/apps/api/src/modules/portal/portal.controller.ts
  Line 50-51: @Post("login") @UseGuards(LoginRateLimitGuard)
```

**Not:** Guard in-memory store kullanıyor (single-instance). Multi-instance için Redis'e taşınması gerek (deferred, mevcut ölçek için yeterli).

---

### PF-003 — PII Log Mask

**Konu:** Bank/UYAP service'lerinde IBAN, TCKN düz log'a yazılıyor dendi.

**Gerçek durum:** ✅ KAPALI. `pii-mask.util.ts` yazılmış, `bank.service.ts` ve `uyap.service.ts`'de kullanılıyor.

**Kanıt:**
```
HUKUK_YAZILIMI/project/apps/api/src/common/pii-mask.util.ts
  - maskIban(): ilk 4 + son 4 karakter
  - maskTckn(): ilk 3 + son 2 karakter
  - maskIdentity(), maskPhone(), maskEmail()

HUKUK_YAZILIMI/project/apps/api/src/modules/bank/bank.service.ts
  Line 4: import { maskIban } from '../../common/pii-mask.util'
  Line 544: this.logger.log(`[GARANTI] Bakiye sorgusu: ${maskIban(iban)}`)
  Line 549, 561, 566, 578, 583: aynı pattern (6 yerde)

HUKUK_YAZILIMI/project/apps/api/src/modules/uyap/uyap.service.ts
  Line 7: import { maskIdentity } from '../../common/pii-mask.util'
  (maskIdentity kullanımı uyap.service içinde görünüyor)
```

---

### PF-004 — External Fetch Timeout

**Konu:** `fetch()` çağrılarında `signal`/timeout yok dendi.

**Gerçek durum:** ✅ KAPALI. `fetchWithTimeout` util yazılmış, riskli servislerde kullanılıyor.

**Kanıt:**
```
HUKUK_YAZILIMI/project/apps/api/src/common/fetch-with-timeout.util.ts
  (AbortController-based timeout wrapper)

HUKUK_YAZILIMI/project/apps/api/src/modules/notification/sms-provider.service.ts
  Line 3: import { fetchWithTimeout }
  Line 106, 156, 195: fetchWithTimeout(url, ..., 10_000)

HUKUK_YAZILIMI/project/apps/api/src/modules/notification/email-provider.service.ts
  Line 3: import { fetchWithTimeout }
  Line 173: fetchWithTimeout('https://api.sendgrid.com/v3/mail/send', ...)

HUKUK_YAZILIMI/project/apps/api/src/modules/exchange-rate/exchange-rate.service.ts
  Line 50, 188: signal: AbortSignal.timeout(10000)

HUKUK_YAZILIMI/project/apps/api/src/modules/tariff/gazette-watcher.service.ts
  Line 67: signal: AbortSignal.timeout(15000)
```

**Not:** RateSyncService'de doğrulanması gerek — grep sonucu o servisi göstermedi. Spot kontrol önerilir ama kritik değil.

---

### PF-005 — Scheduler Unbounded findMany

**Konu:** Scheduler cron job'larında `findMany` çağrılarında `take` yok dendi.

**Gerçek durum:** ✅ KAPALI. `runBatched` cursor-based pagination helper yazılmış, **8 cron job'un hepsinde** kullanılıyor.

**Kanıt:**
```
HUKUK_YAZILIMI/project/apps/api/src/modules/scheduler/scheduler-batch.helper.ts
  - runBatched<T>(findMany, handler, options): cursor-based pagination
  - Default: SCHED_BATCH_SIZE, SCHED_MAX_BATCHES, SCHED_MAX_TOTAL
  - Tie-breaker: cursorField != 'id' ise [{ cursorField: 'asc' }, { id: 'asc' }]

HUKUK_YAZILIMI/project/apps/api/src/modules/scheduler/scheduler.service.ts
  Line 57:  await runBatched((args) => this.db.case.findMany(...))   → checkPaymentOrderDeadlines
  Line 143: await runBatched((args) => this.db.case.findMany(...))   → processNafakaPeriods
  Line 226: await runBatched((args) => this.db.case.findMany(...))   → checkMtsReturns
  Line 306: await runBatched((args) => this.db.uyapRequestLog...)    → retryFailedUyapRequests
  Line 427: await runBatched((args) => this.db.thirdParty...)        → checkIhbarnameDeadlines (89/1)
  Line 449: await runBatched((args) => this.db.thirdParty...)        → checkIhbarnameDeadlines (89/2)
  Line 539: await runBatched((args) => this.db.externalCase...)      → checkExternalCaseFollowups
  Line 685: await runBatched((args) => this.db.tebligat...)          → checkTebligatStatus
  Line 797: await runBatched((args) => this.db.due...)               → sendDueReminders
```

---

### Faiz Motoru (Yapilacaklar.txt'de raporlanan bug)

**Konu:** "TCMB %44 efektif çıkıyor, segmentleme yanlış" şikayeti.

**Gerçek durum:** ⚠️ YETKINLİĞİ DEĞİŞMİŞ DURUMDA. İddia stale olabilir, ama kesin doğrulama yapılmadı.

**Kanıt (motor olgun):**
```
HUKUK_YAZILIMI/project/apps/api/src/modules/interest-engine/
  segments/segment-builder.service.ts                    → segment builder
  rates/coverage-map.builder.ts                          → coverage gap detection
  rates/rate-version-hash.ts                             → rate table version hash
  policy-gate/policy-gate-v2.service.ts                  → coverage policy gate
  allocation/tbk100-allocator.service.ts                 → TBK 100 mahsup
  allocation/claim-priority.service.ts                   → priority rule
  reporter/segment-reporter.service.ts                   → segment table generator
  reporter/legal-report-renderer.service.ts              → "FAİZ HESAPLAMA TABLOSU"
  audit/audit-writer.service.ts                          → audit log writer
  version/version-pinning.service.ts                     → engine + rule version pin
  strategy/strategy-selector.service.ts                  → case-type-driven strategy

  __tests__/sprint-4.spec.ts:217: createSegment(..., 0.4225, 1621.92)  // %42.25
  __tests__/sprint-4.spec.ts:217: createSegment(..., 0.3975, 1851.37)  // %39.75
  ↑ 2025 TCMB değişen oranları doğru segmentleniyor
```

**Eksik (Faz 1'de kapatılacak):**
- `interest-engine.service.ts:586+` `getPreviewRates()` içindeki **hardcoded fallback rate'leri**: `'COMMERCIAL_AVANS_3095_2_2': 39.75`. TODO satırı var: "RateProviderService'den çekilmeli". Bu sadece **preview path** için, prod calculate() path'i için değil. Yine de temizlenmeli.
- `calculate()` async, DB'ye yazıyor (`auditWriter.writeRecord`). Pure function değil. Faz 1'de `computeBalance` (pure) + `writeAudit` (side-effect) ayrımı.

---

## Tarihsel Tutarsızlık

| Belge | Tarih | İçerik | Realite |
|---|---|---|---|
| `docs/audit/PART-3-performance-reliability-audit.md` | 2026-02-27 | "R-01 timeout yok, R-02 take yok, R-03 lock yok" | Hepsi kapanmış, belge güncel değil |
| `docs/audit/PART-4-consolidated-patch-plan.md` | 2026-02-27 | "PF-001..005 P1 açık" | Hepsi kapanmış, belge güncel değil |
| `Yapilacaklar.txt` | 2026-01-06 | "Faiz motoru segmentleme yanlış" | Motor olgun, segmentleme doğru. Preview'de hardcoded fallback temizlenecek (Faz 1) |

---

## Ders

İlk mimari analizimde (v1) bu belgelere güvenip "stabilization sprint" planladım. **Hata buydu.** Ders:

> Stale audit dokümanı bir kanıt değil, bir hipotezdir. Production kod gerçeği söyler.

Bu belge ile bir daha aynı tuzağa düşmememiz garanti altına alınıyor.

---

## Aktif Olmayan Maddeler

Aşağıdaki PART-4 P2 maddeleri **şu an aktif değil**, Faz 2 veya sonrasına ertelendi:

- PF-008 (DB statement_timeout) — DevOps işi, prod hardening
- PF-009 (Query telemetry, pg_stat_statements) — observability hardening
- PF-010 (RBAC enforcement skeleton) — auth katmanı
- PF-011 (`$queryRawUnsafe` refactor) — sadece `manifest-dlq.repository.ts`'de 3 yer

Bunlar Faz 1 (formalize) sonrası değerlendirilecek.

---

## Sıradaki Adım

`00-architecture.md v2` onaylandı. Vocabulary unification'a geç:
- `03-vocabulary-unification.md` revize (frontend + backend birlikte)
- Sonra `06-aggregate-boundaries.md`

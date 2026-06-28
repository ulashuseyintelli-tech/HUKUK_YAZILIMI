# Hata Logları → Observability Checkpoint

**Modül:** `/settings/error-logs` (ErrorLog)
**Durum:** Çekirdek hat tamamlandı (PR-1 + PR-2a + PR-2b MERGED → `main`)
**Tarih:** 2026-06-28

Bu doküman, dormant/yarım-bağlı Hata Logları ekranının güvenli, KVKK-uyumlu,
kalıcı-dedupe'lı teknik observability paneline dönüştürülmesinin checkpoint'idir.
Sıra: **önce güvenlik → sonra otomatik toplama → sonra kalıcı dedupe.**

---

## Tamamlanan PR'lar

### PR-1 — Güvenlik (#580 → `24c0956b`)
Endpoint'ler açılmadan önce güvenlik zemini.
- `GET /error-logs`, `GET /stats`, `POST /:id/resolve` → **AdminGuard** (yalnız ADMIN).
- `POST /error-logs/log` → JwtAuthGuard kalır (frontend/istemci endpoint'i), AMA gövde sertleştirildi.
- `resolve()` → `resolvedBy = req.user.id` (body.userId YOK SAYILIR — spoof engeli).
- `POST /log` sertleştirme: `source` DAİMA `FRONTEND` (body.source drop) · `level` yalnız ERROR/WARN'a normalize · `tenantId = req.user.tenantId` · metadata **whitelist + PII redaksiyon** (`pii-mask.util`) · ham request body YAZILMAZ · Authorization/Cookie/token/secret/password drop · TCKN/VKN/IBAN/telefon/email maskelenir.
- Sanitizer: `src/modules/error-log/error-log.sanitize.ts`.

### PR-2a — Otomatik backend yakalama (#584 → `1bf5b8ea`)
- Global `AllExceptionsFilter` (`filters/all-exceptions.filter.ts`): yakalanmamış **≥500** hatalar ErrorLog'a yazılır.
- **Noise exclusion:** 400 / 404 / validation / 401 / 403 loglanmaz.
- **Regresyon yok:** `HttpException` response shape AYNEN passthrough (mevcut 4xx gövdeleri korunur).
- `RequestIdMiddleware` (`common/`): `x-request-id` korelasyon; AppModule.configure'da metrics middleware ÖNCESİNE zincirli.
- In-memory fingerprint + flood-guard (PR-2a'da DB kararı veriyordu; PR-2b'de konsol-throttle'a indirildi).
- **Logging-failure isolation:** loglama hattındaki hiçbir hata HTTP yanıtını bozmaz (fire-and-forget + try/catch).

### PR-2b — Kalıcı dedupe (#588 → `b2f6f8d3`)
ErrorLog'a 5 kolon + 3 index (additive migration):
`fingerprint` · `activeDedupeKey String? @unique` · `occurrenceCount Int @default(1)` · `firstSeenAt` · `lastSeenAt`.

- **`activeDedupeKey` kararı (kritik):** yalnız *unresolved* kayıtta dolu; `resolve()` → `null`.
  PostgreSQL nullable-unique (NULLS DISTINCT) sayesinde çözülmüş kayıtlar yan yana durur;
  aynı hata çözülüp tekrar patlarsa eski resolved kayda gömülmez → **YENİ aktif kayıt açılır.**
  (4 kolon bunu sağlayamazdı; atomik `upsert` için bu @unique alan şart.)
- **fingerprint** = hata kimliği (name + normalize-redact mesaj + stack-kök + status; endpoint-bağımsız, analitik gruplama).
- **activeDedupeKey** = `sha256(tenant + source + method + normalizedEndpoint + status + fingerprint)`. İkisi de SHA-256 64-hex.
- `normalizeEndpoint`: id segmentlerini `:id` yapar → `/cases/123` ≡ `/cases/456`.
- `ErrorLogService.log`: CREATE → **UPSERT** (aktif duplicate → `occurrenceCount++` + `lastSeenAt`; yoksa create). **P2002** yarış → `updateMany` increment fallback.
- `AllExceptionsFilter`: FloodGuard DB persistence yolundan **çıkarıldı** (her ≥500 upsert'e gider; dedupe/sayım serviste). FloodGuard artık yalnız **konsol** gürültüsünü kısar.
- **Canlı dev-DB smoke: PASS (15/15)** — iki-log→tek satır/occurrenceCount=2 · resolve→activeDedupeKey null · re-explosion→yeni unresolved (occurrenceCount=1), eski resolved increment yemedi.

---

## Migration notu
`main` üzerinde aynı timestamp'li **İKİ** migration yan yana bulunuyor:
- `20260628000000_error_logs_persistent_dedupe` (bu iş)
- `20260628000000_tm3_fazb0_client_statement_caseid_nullable` (TM3 Faz B, #587)

Farklı tablolar (ErrorLog / ClientStatement), lexical sıra deterministik (`error_logs` < `tm3`),
CI taze Postgres'te **birlikte** sorunsuz uyguladı → zararsız. (TM3 oturumu #587 migration'ını
dev-DB'ye uygularken bu sırayı görecek; forward-apply, drift yok.)

---

## Değişmez ilkeler (sonraki PR'lar için)
- `source` = `API` / `UYAP` / `CRON` **yalnız backend internal logging'den** üretilir; istemci `source` SEÇEMEZ (`POST /log` → daima `FRONTEND`).
- `fingerprint` = hata kimliği (gruplama) · `activeDedupeKey` = aktif olay kimliği (atomik dedupe).
- Ham PII (TCKN/VKN/IBAN/telefon/email) ve ham request body DB'ye YAZILMAZ.
- Her PR: ayrı branch · `main` pristine · squash merge · CI yeşil + owner "merge" deyince.

---

## Kalan işler (her biri AYRI owner GO'su gerektirir)
- **PR-3** — UYAP / CRON / outbox internal source besleme (frontend/UI/retention/migration YOK).
- **PR-4** — Frontend ErrorBoundary + `window.onerror` / `unhandledrejection` (backend 500 duplicate-log engeli).
- **PR-5** — UI: detay drawer · filtreler (resolved/tarih/endpoint) · resolve açıklaması zorunlu.
- **PR-6** — Retention cron (resolved 90g / frontend 30g / unresolved 180g).

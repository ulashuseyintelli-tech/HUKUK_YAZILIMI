# Requirements Document — Phase 11.4: Redrive Rate Limiting / Backoff Guardrail

## Giriş

Phase 11.4, DLQ redrive girişimlerini correlation chain bazında hız sınırlaması ve backoff ile kontrol eder; retry fırtınasını keser; davranışı deterministik ve gözlemlenebilir kılar. Phase 11.3 derinlik ekseninde spam'i keserken, Phase 11.4 zaman ekseninde retry storm'larını keser. UI spam, worker loop veya otomasyon kaynaklı hızlı redrive talepleri DB, queue ve downstream servisleri aşırı yükler ve aynı hatayı tekrar tekrar üretir.

**Bağımlılık:** Phase 11.3 Redrive Depth Limit (DONE/LOCKED) — `is_poison`, `poison_reason`, depth check mekanizması mevcut. Phase 11.4, depth check'ten **sonra** çalışır.

## Kapsam Dışı (Non-Goals)

- Tenant/user global rate limiting
- Queue-level throttling
- Error-type adaptive backoff (Phase 11.4.1+)

## Sözlük (Glossary)

- **Redrive_Backoff_Policy**: `redrive_count` değerine göre bir sonraki izin verilen redrive zamanını hesaplayan saf (pure) fonksiyon. Üstel backoff + jitter uygular.
- **Redrive_Rate_Limiter**: Backoff politikasını uygulayan bileşen: mevcut durumu kontrol eder (check), karar verir (decision), başarı durumunda DB'ye kaydeder (persist-on-success).
- **DLQ_Repository**: `manifest_dead_letter_queue` tablosuna erişim sağlayan mevcut `IManifestDlqRepository`. Phase 11.4 ile yeni rate limiting alanları ve metotları eklenir.
- **Admin_Controller**: Redrive endpoint'ini (`POST /admin/manifest/dlq/{dlqId}/redrive`) barındıran mevcut `ManifestAdminController`.
- **Carrier**: `IdempotencyContextCarrierV2` — iş bağlamını taşıyan, `parentCorrelationId` ile redrive zincirleme bilgisi içeren yapı.
- **Correlation_Key**: Rate limit anahtarı. `rootCorrelationId` mevcutsa root üzerinden, yoksa `correlationId` üzerinden uygulanır.
- **Cooldown_Window**: Bir redrive'dan sonra aynı correlation chain için yeni redrive'a izin verilmeyen minimum süre.
- **Backoff_Cap**: Üstel backoff'un ulaşabileceği maksimum bekleme süresi (varsayılan: 1 saat).
- **Jitter**: Thundering herd etkisini kırmak için backoff süresine eklenen rastgele %0–20 ek süre.
- **Fail_Closed**: Hata durumunda redrive'ı reddetme prensibi — belirsizlik durumunda güvenli tarafta kalma.
- **redrive_count**: Bu DLQ entry için başarılı enqueue işlemi sayısı. Worker execution outcome'unu yansıtmaz; yalnızca `atomicRedrive` başarılı döndükten sonra artırılır.
- **last_redriven_at**: Son başarılı enqueue işleminin zaman damgası. Worker'ın işi ne zaman tamamladığını değil, DLQ entry'nin retry queue'ya en son ne zaman gönderildiğini gösterir.
- **recordRedriveSuccess**: Başarılı enqueue sonrası rate limit state güncellemesi. İsim "success" içerir ancak bu "enqueue success" anlamındadır, "worker execution success" değil. Worker outcome ayrı bir domain'de (retry_queue job) izlenir.

## Gereksinimler

### Gereksinim 1: Rate Limit Anahtarı / Granülarite (FR-11.4.0)

**User Story:** Bir geliştirici olarak, rate limit'in hangi anahtar üzerinden uygulandığını bilmek istiyorum, böylece aynı correlation chain'deki tüm redrive'lar tutarlı şekilde sınırlanır.

#### Kabul Kriterleri

1. THE Redrive_Rate_Limiter SHALL rate limit anahtarını `correlationId` üzerinden uygulamalıdır
2. WHEN sistemde `rootCorrelationId` mevcut olduğunda, THE Redrive_Rate_Limiter SHALL limit'i `rootCorrelationId` bazında uygulamalıdır; aksi halde `correlationId` bazında uygulamalıdır
3. WHEN carrier_json mevcut değilse veya parse edilemezse, THE Redrive_Rate_Limiter SHALL fallback olarak `dlqEntry.id` bazında rate limit uygulamalıdır
4. THE Redrive_Rate_Limiter SHALL rate limit key uzunluğunu 256 karakter ile sınırlamalıdır; aşan key'ler hash'lenerek kısaltılmalıdır

### Gereksinim 2: Cooldown Enforcement (FR-11.4.1)

**User Story:** Bir sistem yöneticisi olarak, aynı correlation chain için cooldown süresi dolmadan redrive yapılmasını engellemek istiyorum, böylece retry storm'ları ve gereksiz downstream yükü önlenir.

#### Kabul Kriterleri

1. WHEN `now < next_allowed_redrive_at` olduğunda, THE Redrive_Rate_Limiter SHALL redrive talebini reddetmelidir
2. WHEN bir DLQ entry için ilk kez redrive talep edildiğinde (redrive_count=0, next_allowed_redrive_at=NULL), THE Redrive_Rate_Limiter SHALL redrive'a izin vermelidir

### Gereksinim 3: Üstel Backoff Politikası (FR-11.4.2)

**User Story:** Bir geliştirici olarak, redrive_count değerine göre bir sonraki izin verilen redrive zamanını deterministik olarak hesaplamak istiyorum, böylece hızlı ardışık redrive'lar üstel olarak artan bekleme süreleriyle engellenir.

#### Kabul Kriterleri

1. THE Redrive_Backoff_Policy SHALL backoff süresini şu formülle hesaplamalıdır: `k = min(redrive_count, capExponent)`, `backoff = min(max_backoff, base × 2^k)`, `jitter = Uniform(0, jitterPct) × backoff`, `next_allowed_redrive_at = now + backoff + jitter`
2. THE Redrive_Backoff_Policy SHALL `base`, `capExponent`, `max_backoff` ve `jitterPct` parametrelerini config ile yönetmelidir
3. THE Redrive_Backoff_Policy SHALL saf (pure) bir fonksiyon olmalıdır — dış duruma bağımlı olmamalıdır (now ve jitter dışarıdan enjekte edilir)
4. THE Redrive_Backoff_Policy SHALL hesaplanan backoff süresinin `max_backoff` değerini aşmamasını garanti etmelidir
5. THE Redrive_Backoff_Policy SHALL jitter değerinin `jitterPct × backoff` değerini aşmamasını garanti etmelidir

### Gereksinim 4: Persistence Model (FR-11.4.3)

**User Story:** Bir geliştirici olarak, rate limiting verilerini saklamak için DLQ tablosunda yeni kolonlara ihtiyacım var, böylece backoff durumu kalıcı olarak kaydedilebilir.

#### Kabul Kriterleri

1. THE Migration SHALL `manifest_dead_letter_queue` tablosuna `last_redriven_at TIMESTAMPTZ NULL` kolonu eklemelidir
2. THE Migration SHALL `manifest_dead_letter_queue` tablosuna `redrive_count INTEGER NOT NULL DEFAULT 0` kolonu eklemelidir
3. THE Migration SHALL `manifest_dead_letter_queue` tablosuna `next_allowed_redrive_at TIMESTAMPTZ NULL` kolonu eklemelidir
4. THE Migration SHALL `manifest_dead_letter_queue` tablosuna `rate_limit_reason TEXT NULL` kolonu eklemelidir (opsiyonel, debugging amaçlı)
5. THE Migration SHALL mevcut DLQ entry'lerini etkilememeli, yeni kolonlar varsayılan değerlerle doldurulmalıdır
6. IF migration geri alınması gerekirse, THEN THE Migration SHALL eklenen kolonları güvenli şekilde kaldırabilecek bir rollback script'i sağlamalıdır

### Gereksinim 5: Atomik Güncelleme Semantiği (FR-11.4.4)

**User Story:** Bir geliştirici olarak, rate limit state güncellemelerinin atomik olmasını istiyorum, böylece kısmi güncelleme durumunda tutarsız state oluşmaz.

#### Kabul Kriterleri

1. WHEN redrive başarıyla enqueue edildiğinde, THE DLQ_Repository SHALL `redrive_count` artırma, `last_redriven_at` güncelleme ve `next_allowed_redrive_at` güncelleme işlemlerini `atomicRedrive` transaction'ı içinde — DLQ status update ve retry job INSERT ile aynı tx'te — atomik olarak gerçekleştirmelidir (all-or-nothing: enqueue + rate limit state tek commit)
2. WHEN redrive reddedildiğinde, THE DLQ_Repository SHALL `redrive_count`, `last_redriven_at` ve `next_allowed_redrive_at` değerlerini değiştirmemelidir (read-only decision)
3. THE DLQ_Repository SHALL `atomicRedrive` transaction'ında cooldown guard'ı (`now < next_allowed_redrive_at`) status guard ile birlikte enforce etmelidir — `FOR UPDATE` lock sonrası, tek transaction'da deterministik karar

### Gereksinim 6: Deterministik Admin Response (FR-11.4.5)

**User Story:** Bir operatör olarak, rate limit nedeniyle redrive reddedildiğinde açık bir hata mesajı ve ne zaman tekrar deneyebileceğim bilgisini almak istiyorum, böylece gereksiz tekrar denemelerden kaçınabilirim.

#### Kabul Kriterleri

1. WHEN rate limit nedeniyle redrive reddedildiğinde, THE Admin_Controller SHALL HTTP 409 Conflict yanıtı dönmelidir
2. WHEN rate limit nedeniyle redrive reddedildiğinde, THE Admin_Controller SHALL yanıt gövdesinde `code: 'REDRIVE_RATE_LIMITED'`, `nextAllowedAt` (ISO 8601 timestamp), `waitSeconds` (kalan bekleme süresi saniye cinsinden) ve `policy` (base/cap/max/jitter özeti) bilgilerini içermelidir
3. WHEN redrive başarıyla gerçekleştiğinde, THE Admin_Controller SHALL yanıtta `redriveCount` (güncel redrive sayısı) ve `nextAllowedRedriveAt` (bir sonraki izin verilen zaman) bilgilerini içermelidir
4. THE Admin_Controller SHALL rate limit kontrolünü Phase 11.3 depth check'ten **sonra** ve carrier clone'dan **önce** yapmalıdır

### Gereksinim 7: Fail-Closed Stratejisi (FR-11.4.6)

**User Story:** Bir geliştirici olarak, rate limit kontrolü sırasında oluşabilecek hataların sistemi güvensiz duruma düşürmesini istemiyorum, böylece fail-closed prensibi korunur.

#### Kabul Kriterleri

1. IF rate limit kontrolü sırasında repo read/write veya policy hesaplamasında beklenmeyen hata oluşursa, THEN THE Redrive_Rate_Limiter SHALL redrive işlemini reddetmelidir (fail-closed)
2. WHEN fail-closed tetiklendiğinde, THE Admin_Controller SHALL HTTP 409 Conflict yanıtı ile `code: 'REDRIVE_RATE_LIMIT_CHECK_FAILED'` dönmelidir (non-retriable — client retry yapmamalıdır)
3. WHEN fail-closed tetiklendiğinde, THE Admin_Controller SHALL audit log'a `outcome: 'REJECTED'` ve `reason: 'RATE_LIMIT_CHECK_FAILED'` kaydetmelidir
4. THE Admin_Controller SHALL cooldown enforcement'ı `atomicRedrive` transaction'ı içinde (`FOR UPDATE` lock + cooldown guard) gerçekleştirmelidir — bu, rate limit'in tek gerçek kaynağıdır (single source of truth)
5. THE Admin_Controller SHALL controller'daki `checkRateLimit` pre-check'i yalnızca UX optimizasyonu / erken reddetme olarak kullanmalıdır — güvenlik iddiası taşımaz

> **Gerçek rate-limit enforcement tx içindedir; controller pre-check deterministik değildir ve güvenlik iddiası taşımaz.**

### Gereksinim 7.1: Concurrency Safety (NFR-11.4.6.1)

**User Story:** Bir geliştirici olarak, eşzamanlı redrive taleplerinin race condition'a yol açmamasını istiyorum, böylece cooldown bypass edilemez.

#### Kabul Kriterleri

1. THE DLQ_Repository SHALL `atomicRedrive` transaction'ında `SELECT ... FOR UPDATE` ile satır kilidi almalıdır — concurrent request'ler sıralı hale gelir
2. THE DLQ_Repository SHALL tx gate'te cooldown guard (`now < next_allowed_redrive_at`) ve status guard (`status = DLQ_OPEN`) birlikte enforce etmelidir
3. WHEN tx gate cooldown ihlali tespit ettiğinde, THE DLQ_Repository SHALL `DlqRedriveError('RATE_LIMITED')` fırlatmalıdır — HTTP 409 `REDRIVE_RATE_LIMITED` olarak map edilir
4. THE Admin_Controller SHALL controller pre-check'i (checkRateLimit) best-effort olarak kullanmalıdır — DB lock açmadan hızlı 409 + waitSeconds dönmek için; gerçek otorite tx gate'tedir

### Gereksinim 8: Uyumluluk / Varsayılan Davranış (FR-11.4.7)

**User Story:** Bir geliştirici olarak, yeni kolonların mevcut DLQ kayıtlarıyla uyumlu olmasını istiyorum, böylece migration sonrası mevcut entry'ler sorunsuz çalışmaya devam eder.

#### Kabul Kriterleri

1. WHEN `redrive_count` değeri 0 ve `next_allowed_redrive_at` değeri NULL olduğunda, THE Redrive_Rate_Limiter SHALL rate limit engellemesi uygulamamalı ve ilk redrive'a izin vermelidir
2. THE Migration SHALL `redrive_count` kolonunu `DEFAULT 0` ile, `next_allowed_redrive_at` kolonunu `NULL` ile oluşturmalıdır; böylece mevcut kayıtlar otomatik olarak "rate limit yok" durumunda başlar

### Gereksinim 9: Admin Görünürlük — DLQ Listeleme (FR-11.4.8)

**User Story:** Bir operatör olarak, DLQ listesinde her entry'nin rate limit durumunu görmek istiyorum, böylece hangi entry'lerin cooldown'da olduğunu hızlıca tespit edebilirim.

#### Kabul Kriterleri

1. WHEN DLQ entry'leri listelendiğinde, THE DLQ_Repository SHALL `last_redriven_at`, `redrive_count`, `next_allowed_redrive_at` ve `rate_limit_reason` alanlarını yanıta dahil etmelidir
2. WHEN bir DLQ entry detayı görüntülendiğinde, THE Admin_Controller SHALL `redriveCount`, `nextAllowedRedriveAt`, `lastRedrivenAt` ve (varsa) `rateLimitReason` alanlarını DTO'ya dahil etmelidir

### Gereksinim 10: Audit Logging (FR-11.4.9)

**User Story:** Bir operatör olarak, her redrive girişiminin tam audit kaydını görmek istiyorum, böylece kimin ne zaman denediğini ve sonucunu takip edebilirim.

#### Kabul Kriterleri

1. WHEN bir redrive rate limit nedeniyle reddedildiğinde, THE Admin_Controller SHALL audit log'a `outcome: 'REJECTED'`, `reason: 'RATE_LIMITED'`, `waitSeconds`, `nextAllowedAt`, `redriveCount` ve `key` (correlationId / rootCorrelationId) bilgilerini kaydetmelidir
2. WHEN bir redrive başarıyla gerçekleştiğinde, THE Admin_Controller SHALL audit log'a güncel `redriveCount` ve yeni `nextAllowedRedriveAt` değerini kaydetmelidir

### Gereksinim 11: Metrikler (FR-11.4.10)

**User Story:** Bir SRE mühendisi olarak, rate limit nedeniyle reddedilen redrive'ları ve backoff dağılımını izlemek istiyorum, böylece retry storm'larını proaktif olarak tespit edip alert kurabilirim.

#### Kabul Kriterleri

1. WHEN bir redrive rate limit nedeniyle reddedildiğinde, THE Admin_Controller SHALL `carrier_redrive_rate_limited_total` counter metriğini `gate` label'ı ile artırmalıdır; gate değerleri: `precheck` (controller pre-check reject) | `tx` (atomicRedrive tx gate reject). Cardinality: 2 (sabit, kapalı enum)
2. WHEN rate limit pre-check'i fail-closed tetiklediğinde, THE Admin_Controller SHALL `carrier_redrive_rate_check_failed_total` counter metriğini artırmalıdır (label yok; normal operasyonda 0 olmalı, > 0 → immediate investigation)
3. WHEN bir redrive başarıyla enqueue edildiğinde, THE Admin_Controller SHALL `carrier_redrive_backoff_seconds` histogram metriğine hesaplanan bekleme süresini (saniye cinsinden, `(backoffMs + jitterMs) / 1000`) kaydetmelidir; bucket'lar: `[30, 60, 120, 300, 600, 1800, 3600]`
4. WHEN bir redrive başarıyla enqueue edildiğinde, THE Admin_Controller SHALL `carrier_redrive_backoff_applied_total` counter metriğini `count_bucket` label'ı ile artırmalıdır; count_bucket değerleri: `0` | `1` | `2` | `3-4` | `5-9` | `10+` (redrive_count bazlı, 6 değer, kapalı enum). Label adı `count_bucket` — Prometheus histogram `le` bucket'ları ile çakışmayı önler
5. THE Admin_Controller SHALL mevcut `carrier_redrive_rejected_total{reason}` emission'larını korumalıdır — yeni metrikler ek boyut sağlar, mevcut dashboard'ları bozmaz

### Gereksinim 12: Test Gereksinimleri (FR-11.4.11)

**User Story:** Bir geliştirici olarak, rate limiting mekanizmasının doğruluğunu kapsamlı testlerle garanti altına almak istiyorum, böylece edge case'ler ve invariant ihlalleri erken tespit edilir.

#### Kabul Kriterleri

1. THE Test_Suite SHALL policy fonksiyonu, limiter karar matrisi ve repo atomik güncelleme için unit testler içermelidir
2. THE Test_Suite SHALL monotonicity, boundedness, latch-like invariants (no allow before next_allowed_at), no count increment on reject için property-based testler içermelidir

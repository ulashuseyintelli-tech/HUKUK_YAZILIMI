# Requirements Document — Phase 12: Redrive Operational Safeguards

## Giriş

Phase 12, DLQ redrive mekanizmasına iki operasyonel güvenlik katmanı ekler: transaction süresi gözlemlenebilirliği ve acil durum kill-switch. Phase 11.x mimariyi kilitledi; Phase 12 "doğru çalışıyor"dan "sorun çıkınca anında yakalanıyor ve durduruluyor"a geçişi sağlar.

**Bağımlılık:** Phase 11.4 Redrive Rate Limiting (DONE/LOCKED) — `atomicRedrive` tx, rate limit state, metrik altyapısı mevcut.

## Kapsam Dışı (Non-Goals)

- Incident playbook / operatör dokümanları (ops doc olarak ayrı tutulur)
- Alert kuralları / SLO mapping (Prometheus config, spec dışı)
- Lock-wait ayrı ölçümü (ileri seviye, Phase 12.x scope)
- Yeni davranış / iş mantığı değişikliği

## Sözlük (Glossary)

- **TX_Duration**: `atomicRedrive` transaction'ının başlangıcından commit/rollback'e kadar geçen süre (saniye).
- **Kill_Switch**: Env/config flag ile `POST /redrive` endpoint'ini tamamen devre dışı bırakan mekanizma. Read-only DLQ endpoint'leri etkilenmez.
- **Gauge**: Anlık durumu gösteren Prometheus metrik tipi (0 veya 1). "Şu an aktif mi?" sorusuna cevap verir.

## Gereksinimler

### Gereksinim 1: atomicRedrive TX Duration Observability (FR-12.1)

**User Story:** Bir SRE mühendisi olarak, `atomicRedrive` transaction süresinin dağılımını izlemek istiyorum, böylece contention ve yavaşlamayı proaktif olarak tespit edebilirim.

#### Kabul Kriterleri

1. THE Admin_Controller SHALL `atomicRedrive` çağrısının başlangıcından dönüşüne kadar geçen süreyi ölçmelidir (tx begin → commit/rollback)
2. THE Admin_Controller SHALL ölçülen süreyi `carrier_redrive_tx_duration_seconds` histogram metriğine kaydetmelidir
3. THE `carrier_redrive_tx_duration_seconds` histogram metriği label içermemelidir (outcome ayrımı mevcut counter'lardan cross-query ile yapılır)
4. THE `carrier_redrive_tx_duration_seconds` histogram bucket'ları şu değerleri kullanmalıdır: `[0.01, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10]` (saniye cinsinden, standart HTTP latency bucket'ları)
5. THE Admin_Controller SHALL tx duration ölçümünü hem başarılı hem başarısız (reject, error) tüm `atomicRedrive` çağrıları için yapmalıdır — outcome ne olursa olsun latency kaydedilir
6. THE `carrier_redrive_tx_duration_seconds` metriği `resetAllMetrics()` fonksiyonuna dahil edilmelidir

### Gereksinim 2: Redrive Kill-Switch (FR-12.2)

**User Story:** Bir operatör olarak, incident anında tek bir config değişikliği ile tüm redrive işlemlerini durdurmak istiyorum, böylece sistemi koruyup nefes alabilir ve kök neden analizi yapabilirim.

#### Kabul Kriterleri

1. THE Admin_Controller SHALL `REDRIVE_DISABLED` environment variable'ını kontrol etmelidir
2. WHEN `REDRIVE_DISABLED=true` olduğunda, THE Admin_Controller SHALL `POST /dlq/:dlqId/redrive` endpoint'ini HTTP 503 Service Unavailable ile reddetmelidir
3. WHEN `REDRIVE_DISABLED=true` olduğunda, THE Admin_Controller SHALL yanıt gövdesinde `code: 'REDRIVE_DISABLED'` dönmelidir
4. WHEN `REDRIVE_DISABLED=true` olduğunda, THE Admin_Controller SHALL `atomicRedrive` çağrısını yapmamalıdır — erken çıkış (short-circuit)
5. THE Kill_Switch SHALL yalnızca `POST /dlq/:dlqId/redrive` endpoint'ini etkilemelidir — read-only DLQ endpoint'leri (list, detail, cursor query) etkilenmemelidir
6. THE Kill_Switch SHALL `POST /dlq/:dlqId/resolve` endpoint'ini etkilememelidir — resolve işlemi incident anında da yapılabilmelidir

### Gereksinim 3: Kill-Switch Metrikler (FR-12.3)

**User Story:** Bir SRE mühendisi olarak, kill-switch'in aktif olup olmadığını ve kaç redrive talebinin 503 ile reddedildiğini izlemek istiyorum, böylece incident süresince durumu dashboard'dan takip edebilirim.

#### Kabul Kriterleri

1. THE Admin_Controller SHALL `carrier_redrive_kill_switch_active` gauge metriğini expose etmelidir; değer: kill-switch aktifse `1`, değilse `0`
2. WHEN kill-switch nedeniyle bir redrive reddedildiğinde, THE Admin_Controller SHALL `carrier_redrive_disabled_total` counter metriğini artırmalıdır (label yok)
3. THE `carrier_redrive_kill_switch_active` gauge metriği uygulama başlangıcında mevcut flag durumuna göre set edilmelidir
4. THE `carrier_redrive_disabled_total` ve `carrier_redrive_kill_switch_active` metrikleri `resetAllMetrics()` fonksiyonuna dahil edilmelidir

### Gereksinim 4: Test Gereksinimleri (FR-12.4)

**User Story:** Bir geliştirici olarak, tx duration observability ve kill-switch mekanizmasının doğruluğunu testlerle garanti altına almak istiyorum.

#### Kabul Kriterleri

1. THE Test_Suite SHALL tx duration histogram'ın `atomicRedrive` çağrısı sonrası observe edildiğini assert etmelidir (bucket içeriği değil, call varlığı)
2. THE Test_Suite SHALL kill-switch aktifken `POST /redrive` → 503 döndüğünü assert etmelidir
3. THE Test_Suite SHALL kill-switch aktifken `atomicRedrive` çağrılmadığını assert etmelidir
4. THE Test_Suite SHALL kill-switch kapalıyken mevcut davranışın korunduğunu assert etmelidir
5. THE Test_Suite SHALL kill-switch gauge metriğinin flag durumunu yansıttığını assert etmelidir

### Gereksinim 5: Non-Functional Requirements (NFR-12.1)

#### Kabul Kriterleri

1. THE Phase 12 SHALL mevcut Phase 11.4 metrik isimlerini ve label contract'larını değiştirmemelidir (backward compatibility — Phase 11.4 LOCKED)
2. THE Phase 12 yeni metrikleri label içermemelidir — cardinality sabit kalmalıdır (explicit: `carrier_redrive_tx_duration_seconds` labelsiz, `carrier_redrive_kill_switch_active` labelsiz, `carrier_redrive_disabled_total` labelsiz)
3. THE tx duration ölçümü minimal overhead ile yapılmalıdır — tek `Date.now()` farkı veya `process.hrtime()` yeterlidir; ek DB sorgusu veya IO yapılmamalıdır
4. THE kill-switch kontrolü endpoint'in en başında yapılmalıdır — flag aktifken hiçbir downstream çağrı (getById, depth check, rate check, atomicRedrive) tetiklenmemelidir

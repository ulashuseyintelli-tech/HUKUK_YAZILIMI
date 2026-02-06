# Gereksinimler Dokümanı

## Giriş

Bu doküman, manifest-admin idempotency implementasyonundaki kritik concurrency açıklarının kapatılması için gereksinimleri tanımlar. Mevcut "check → execute → record" akışındaki TOCTOU (Time-of-Check to Time-of-Use) yarış koşulu ve diğer concurrency problemleri ele alınmaktadır.

## Sözlük

- **Idempotency_Gate**: Aynı requestId ile gelen isteklerin yalnızca bir kez işlenmesini garanti eden atomik kontrol mekanizması
- **TOCTOU**: Time-of-Check to Time-of-Use - kontrol ve kullanım arasındaki yarış koşulu
- **Idempotency_Key**: İstek tekrarını tespit etmek için kullanılan benzersiz tanımlayıcı (HTTP header)
- **Action_Record**: manifest_admin_actions tablosundaki idempotency kaydı
- **Partial_Unique_Index**: PostgreSQL'de belirli koşulları sağlayan satırlar için benzersizlik garantisi
- **Atomic_Gate**: INSERT-first pattern ile yarış koşulunu önleyen mekanizma
- **Cached_Response**: Daha önce işlenmiş bir isteğin saklanan sonucu

## Gereksinimler

### Gereksinim 1: Atomik Idempotency Gate (TOCTOU Çözümü)

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, aynı requestId ile gelen eşzamanlı isteklerin yalnızca bir kez işlenmesini istiyorum, böylece veri tutarsızlığı ve duplicate işlemler önlensin.

#### Kabul Kriterleri

1. WHEN bir admin isteği alındığında THEN Idempotency_Gate önce manifest_admin_actions tablosuna INSERT ... ON CONFLICT ile atomik kayıt oluşturmalı (status='IN_PROGRESS')
2. WHEN INSERT başarılı olduğunda (yeni kayıt) THEN Idempotency_Gate action'ı çalıştırmalı ve sonucu kaydetmeli
3. WHEN INSERT conflict döndüğünde (mevcut kayıt) THEN Idempotency_Gate mevcut kaydın status'unu kontrol etmeli
4. WHEN mevcut kayıt status='COMPLETED' veya status='FAILED' ise THEN Idempotency_Gate cached sonucu (result_json, http_status) birebir döndürmeli
5. WHEN mevcut kayıt status='IN_PROGRESS' ve lease_expires_at > NOW() ise THEN Idempotency_Gate 409 Conflict döndürmeli, body { code: 'IN_PROGRESS', requestId, actionId } içermeli ve Retry-After: 3 header eklemeli
6. WHEN mevcut kayıt status='IN_PROGRESS' ve lease_expires_at <= NOW() ise THEN Idempotency_Gate "takeover" yapmalı ve yeni actor ile işlemi devralmalı
7. WHEN action başarıyla tamamlandığında THEN Idempotency_Gate kaydı UPDATE ile status='COMPLETED', result_json, http_status, completed_at değerleriyle güncellemeli
8. WHEN action hata ile sonuçlandığında THEN Idempotency_Gate kaydı UPDATE ile status='FAILED', result_json, http_status, completed_at değerleriyle güncellemeli

### Gereksinim 2: Resource-Level Uniqueness (Redrive Tekilleştirme)

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, farklı requestId'ler ile aynı DLQ entry'ye redrive yapılmasını engellemek istiyorum, böylece aynı bundle için birden fazla retry job oluşturulmasın.

#### Kabul Kriterleri

1. THE manifest_retry_jobs tablosu UNIQUE (bundle_id) WHERE status IN ('QUEUED','RUNNING') partial unique index içermeli
2. WHEN bir redrive isteği geldiğinde THEN Idempotency_Gate önce bundle_id için aktif job kontrolü yapmalı
3. WHEN aynı bundle_id için aktif job varsa THEN Idempotency_Gate 409 Conflict döndürmeli ve existing_job_id bilgisini içermeli (DB constraint violation → ALREADY_QUEUED error code mapping)
4. THE manifest_dlq tablosu UNIQUE (dlq_id) WHERE status IN ('DLQ_OPEN') partial unique index içermeli (opsiyonel)

### Gereksinim 3: Atomik State Transition (Resolve/Redrive)

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, resolve ve redrive işlemlerinin atomik olmasını istiyorum, böylece yarış koşulları nedeniyle tutarsız durumlar oluşmasın.

#### Kabul Kriterleri

1. WHEN bir resolve isteği geldiğinde THEN Idempotency_Gate tek bir UPDATE ... WHERE status='DLQ_OPEN' RETURNING sorgusu kullanmalı
2. WHEN resolve UPDATE boş döndüğünde ve id yoksa THEN Idempotency_Gate 404 Not Found döndürmeli
3. WHEN resolve UPDATE boş döndüğünde ve status DLQ_OPEN değilse THEN Idempotency_Gate 409 Conflict döndürmeli
4. WHEN bir redrive isteği geldiğinde THEN Idempotency_Gate SELECT ... FOR UPDATE ile kilitleme yapmalı
5. WHEN redrive işlemi yapılırken THEN Idempotency_Gate tek transaction içinde: status kontrolü, job insert, DLQ status güncelleme yapmalı
6. WHEN redrive transaction'ı başarısız olursa THEN Idempotency_Gate tüm değişiklikleri geri almalı

### Gereksinim 4: Hata Sonuçlarının Idempotent Cache'lenmesi

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, aynı requestId ile gelen isteklerin her zaman aynı HTTP status ve body döndürmesini istiyorum, başarı veya hata fark etmeksizin.

#### Kabul Kriterleri

1. THE manifest_admin_actions tablosu http_status alanı içermeli (integer, NOT NULL)
2. WHEN action hata ile sonuçlandığında THEN Idempotency_Gate http_status ve result_json'ı kaydetmeli
3. WHEN cached response döndürülürken THEN Idempotency_Gate orijinal http_status ve response body'yi birebir kullanmalı (hata dahil)
4. FOR ALL requestId değerleri, aynı requestId ile yapılan tüm istekler aynı HTTP status ve body döndürmeli (ilk çağrı 404 döndüyse, kaynak sonradan oluşsa bile aynı key ile 404 dönmeli)

### Gereksinim 5: TTL ve Resource Uniqueness Ayrımı

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, idempotency TTL süresi dolsa bile resource-level uniqueness korumasının devam etmesini istiyorum.

#### Kabul Kriterleri

1. THE manifest_admin_actions tablosu expires_at alanı içermeli (retention policy için, varsayılan 7 gün)
2. THE manifest_admin_actions tablosu lease_expires_at alanı içermeli (IN_PROGRESS timeout için, varsayılan 30 saniye)
3. WHEN idempotency TTL süresi dolduğunda THEN cleanup job eski kayıtları temizleyebilmeli
4. THE request_id UNIQUE constraint TTL'den bağımsız olarak her zaman korunmalı
5. WHEN TTL dolmuş bir kayıt cleanup job tarafından silindiğinde THEN aynı requestId ile yeni işlem başlatılabilmeli

### Gereksinim 6: Endpoint İyileştirmeleri

**Kullanıcı Hikayesi:** Bir API tüketicisi olarak, standart header isimleri ve güvenli parametre sınırları istiyorum.

#### Kabul Kriterleri

1. THE admin endpoint'leri Idempotency-Key header'ını kabul etmeli (X-Request-Id yerine)
2. WHEN Idempotency-Key header'ı yoksa THEN endpoint 400 Bad Request döndürmeli
3. THE bulk redrive endpoint'i deterministic selection kullanmalı (ORDER BY created_at ASC, id ASC)
4. WHEN maxBatch parametresi verildiğinde THEN 1 <= maxBatch <= 100 aralığında olmalı
5. WHEN olderThanHours parametresi verildiğinde THEN 0 <= olderThanHours <= 8760 (1 yıl) aralığında olmalı
6. WHEN parametre sınırları aşıldığında THEN endpoint 400 Bad Request döndürmeli

### Gereksinim 7: Audit Event Zenginleştirme

**Kullanıcı Hikayesi:** Bir güvenlik denetçisi olarak, admin işlemlerinin tam izlenebilirliği için zengin audit kayıtları istiyorum.

#### Kabul Kriterleri

1. WHEN bir admin action kaydedildiğinde THEN audit event actionId (manifest_admin_actions PK) içermeli
2. WHEN bir DLQ işlemi yapıldığında THEN audit event dlqErrorCode ve originalJobId içermeli
3. WHEN bir redrive işlemi yapıldığında THEN audit event newJobId içermeli
4. WHEN bir bulk redrive işlemi yapıldığında THEN audit event filters, maxBatch, selectedCount, redrivenCount, failedIds içermeli

### Gereksinim 8: Break-Glass ve Idempotency Sıralaması

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, auth ve break-glass kontrollerinin idempotency gate'den önce yapılmasını istiyorum, ancak cache hit durumunda tutarlılık korunmalı.

#### Kabul Kriterleri

1. WHEN bir admin isteği alındığında THEN önce auth kontrolü yapılmalı
2. WHEN auth başarılı olduğunda THEN break-glass kontrolü yapılmalı
3. WHEN break-glass başarılı olduğunda THEN idempotency gate kontrolü yapılmalı
4. WHEN idempotency cache hit olduğunda THEN cached response döndürülmeli (break-glass kapalı olsa bile idempotency tutarlılığı için cache'den dönmeli)
5. WHEN yeni request geldiğinde ve break-glass kapalıysa THEN 403 Forbidden döndürülmeli

### Gereksinim 9: Actor Tutarlılığı

**Kullanıcı Hikayesi:** Bir sistem yöneticisi olarak, tüm admin işlemlerinde tutarlı actor bilgisi istiyorum.

#### Kabul Kriterleri

1. THE manifest_admin_actions tablosu actor_id (uuid, NOT NULL) ve actor_email (varchar, nullable) alanları içermeli
2. WHEN bir action kaydedildiğinde THEN actor_id ve actor_email request context'ten alınmalı
3. THE resolved_at alanı ISO 8601 string formatında olmalı
4. FOR ALL admin işlemleri, actor_id tutarlı şekilde kaydedilmeli

# Requirements Document — Phase 11.3: Redrive Chain Depth Limit

## Giriş

Phase 11.3, DLQ redrive işlemlerinde sonsuz döngüyü (DLQ → redrive → DLQ → redrive …) engelleyen deterministik bir derinlik sınırı mekanizması tanımlar. Mevcut sistemde depth limit bulunmadığından, aynı bundle tekrar tekrar redrive edilebilir ve bu durum yalnızca admin dikkatine bağlıdır. Bu özellik, `MAX_REDRIVE_DEPTH = 3` sabit limiti, POISON flag mekanizması, operatör için açık hata mesajları ve alert-ready metrikler sağlar.

**Bağımlılık:** Phase 11.2 DLQ Carrier Storage (DONE) — `carrier_json` ve `parentCorrelationId` chain traversal için gerekli.

## Sözlük (Glossary)

- **Redrive_Depth_Calculator**: DLQ entry'lerindeki `parentCorrelationId` zincirini takip ederek mevcut redrive derinliğini hesaplayan bileşen.
- **Depth_Limit_Enforcer**: Hesaplanan derinliği `MAX_REDRIVE_DEPTH` ile karşılaştırıp redrive'ı kabul veya reddetme kararı veren bileşen.
- **Poison_Marker**: Derinlik limitini aşan DLQ entry'lerini `is_poison=true` olarak işaretleyen ve `poison_reason` kaydeden bileşen.
- **Admin_Controller**: Redrive endpoint'ini (`POST /admin/manifest/dlq/{dlqId}/redrive`) barındıran mevcut `ManifestAdminController`.
- **DLQ_Repository**: `manifest_dead_letter_queue` tablosuna erişim sağlayan mevcut `IManifestDlqRepository`.
- **Carrier**: `IdempotencyContextCarrierV2` — iş bağlamını taşıyan, `parentCorrelationId` ile redrive zincirleme bilgisi içeren yapı.
- **POISON**: Redrive derinlik limitini aşmış, tekrar redrive edilmemesi gereken DLQ entry durumu.
- **MAX_REDRIVE_DEPTH**: Maksimum izin verilen redrive derinliği (varsayılan: 3). Configurable.
- **Redrive_Chain**: Bir bundle'ın DLQ → redrive → DLQ → redrive geçmişini oluşturan `parentCorrelationId` bağlantı zinciri.

## Gereksinimler

### Gereksinim 1: Redrive Derinlik Hesaplama

**User Story:** Bir operatör olarak, bir DLQ entry'sinin kaç kez redrive edildiğini bilmek istiyorum, böylece sonsuz döngü riskini değerlendirebilirim.

#### Kabul Kriterleri

1. WHEN bir redrive talebi alındığında, THE Redrive_Depth_Calculator SHALL DLQ entry'lerindeki `parentCorrelationId` zincirini takip ederek mevcut derinliği hesaplamalıdır
2. WHEN zincirdeki bir DLQ entry'sinin `carrierJson` alanı NULL olduğunda, THE Redrive_Depth_Calculator SHALL zincir takibini o noktada durdurmalı ve o ana kadar hesaplanan derinliği döndürmelidir
3. WHEN zincirdeki bir DLQ entry'sinin `carrierJson` alanı parse edilemediğinde, THE Redrive_Depth_Calculator SHALL zincir takibini o noktada durdurmalı ve o ana kadar hesaplanan derinliği döndürmelidir
4. THE Redrive_Depth_Calculator SHALL zincir takibini en fazla `MAX_REDRIVE_DEPTH + 1` adımda sonlandırmalıdır (sonsuz döngü koruması)
5. WHEN bir DLQ entry hiç redrive edilmemişse (parentCorrelationId yok), THE Redrive_Depth_Calculator SHALL derinliği 0 olarak döndürmelidir

### Gereksinim 2: Derinlik Limiti Uygulama

**User Story:** Bir sistem yöneticisi olarak, aynı bundle'ın sonsuz kez redrive edilmesini engellemek istiyorum, böylece gereksiz job churn ve downstream side-effect'leri önleyebilirim.

#### Kabul Kriterleri

1. WHEN hesaplanan derinlik `MAX_REDRIVE_DEPTH` değerine eşit veya büyük olduğunda, THE Depth_Limit_Enforcer SHALL redrive talebini reddetmelidir
2. WHEN derinlik limiti aşıldığında, THE Depth_Limit_Enforcer SHALL ilgili DLQ entry'sini POISON olarak işaretlemek üzere Poison_Marker'ı çağırmalıdır
3. WHEN derinlik limiti aşılmadığında, THE Depth_Limit_Enforcer SHALL redrive işleminin devam etmesine izin vermelidir
4. THE Depth_Limit_Enforcer SHALL `MAX_REDRIVE_DEPTH` değerini configurable bir sabit olarak kullanmalıdır (varsayılan: 3)

### Gereksinim 3: POISON Flag Mekanizması

**User Story:** Bir operatör olarak, derinlik limitini aşmış DLQ entry'lerini açıkça görmek istiyorum, böylece bunları manuel incelemeye alıp kök neden analizi yapabilirim.

#### Kabul Kriterleri

1. WHEN bir DLQ entry POISON olarak işaretlendiğinde, THE Poison_Marker SHALL `is_poison` alanını `true` olarak ayarlamalıdır
2. WHEN bir DLQ entry POISON olarak işaretlendiğinde, THE Poison_Marker SHALL `poison_reason` alanına derinlik bilgisini içeren açıklayıcı bir mesaj yazmalıdır (örn: `REDRIVE_DEPTH_EXCEEDED: depth=3, maxDepth=3`)
3. WHEN bir DLQ entry zaten POISON olarak işaretlenmişse, THE Depth_Limit_Enforcer SHALL redrive talebini reddetmeli ve mevcut POISON durumunu korumalıdır
4. THE Poison_Marker SHALL `is_poison` ve `poison_reason` alanlarını atomik olarak güncellemeli, kısmi güncelleme yapmamalıdır

### Gereksinim 4: Veritabanı Şema Değişikliği

**User Story:** Bir geliştirici olarak, POISON flag verilerini saklamak için DLQ tablosunda yeni kolonlara ihtiyacım var, böylece derinlik limiti bilgisi kalıcı olarak kaydedilebilir.

#### Kabul Kriterleri

1. THE Migration SHALL `manifest_dead_letter_queue` tablosuna `is_poison BOOLEAN NOT NULL DEFAULT false` kolonu eklemelidir
2. THE Migration SHALL `manifest_dead_letter_queue` tablosuna `poison_reason TEXT NULL` kolonu eklemelidir
3. THE Migration SHALL mevcut DLQ entry'lerini etkilememeli, yeni kolonlar varsayılan değerlerle doldurulmalıdır
4. IF migration geri alınması gerekirse, THEN THE Migration SHALL eklenen kolonları güvenli şekilde kaldırabilecek bir rollback script'i sağlamalıdır

### Gereksinim 5: Admin Redrive Endpoint Entegrasyonu

**User Story:** Bir operatör olarak, redrive endpoint'inden derinlik limiti aşıldığında açık bir hata mesajı almak istiyorum, böylece neden redrive yapılamadığını anlayabilirim.

#### Kabul Kriterleri

1. WHEN derinlik limiti aşıldığında, THE Admin_Controller SHALL HTTP 409 Conflict yanıtı dönmelidir
2. WHEN derinlik limiti aşıldığında, THE Admin_Controller SHALL yanıt gövdesinde `code: 'REDRIVE_DEPTH_EXCEEDED'`, mevcut derinlik ve maksimum derinlik bilgisini içermelidir
3. WHEN bir POISON DLQ entry için redrive talep edildiğinde, THE Admin_Controller SHALL HTTP 409 Conflict yanıtı ile `code: 'POISON_ENTRY'` dönmelidir
4. WHEN redrive başarıyla gerçekleştiğinde, THE Admin_Controller SHALL yanıtta mevcut derinlik bilgisini (`currentDepth`) içermelidir
5. WHEN derinlik limiti aşıldığında, THE Admin_Controller SHALL audit log'a reddetme nedenini kaydetmelidir

### Gereksinim 6: Metrikler

**User Story:** Bir SRE mühendisi olarak, redrive derinlik dağılımını ve reddedilen redrive'ları izlemek istiyorum, böylece sonsuz döngü riskini proaktif olarak tespit edip alert kurabilirim.

#### Kabul Kriterleri

1. WHEN bir redrive derinlik hesaplaması yapıldığında, THE Redrive_Depth_Calculator SHALL `carrier_redrive_depth_total` histogram metriğine derinlik değerini kaydetmelidir
2. WHEN bir redrive derinlik limiti nedeniyle reddedildiğinde, THE Depth_Limit_Enforcer SHALL `redrive_rejected_total` counter metriğini `reason=DEPTH_EXCEEDED` label'ı ile artırmalıdır
3. WHEN bir DLQ entry POISON olarak işaretlendiğinde, THE Poison_Marker SHALL `redrive_rejected_total` counter metriğini `reason=POISON_FLAGGED` label'ı ile artırmalıdır

### Gereksinim 7: Hata Yönetimi ve Dayanıklılık

**User Story:** Bir geliştirici olarak, derinlik hesaplama sırasında oluşabilecek hataların redrive işlemini tamamen engellemesini istemiyorum, böylece sistem dayanıklı kalır.

#### Kabul Kriterleri

1. IF derinlik hesaplama sırasında veritabanı hatası oluşursa, THEN THE Redrive_Depth_Calculator SHALL hatayı loglamalı ve redrive işlemini güvenli şekilde reddetmelidir (fail-closed)
2. IF `parentCorrelationId` zincirinde döngüsel referans tespit edilirse, THEN THE Redrive_Depth_Calculator SHALL zincir takibini durdurmalı ve o ana kadar hesaplanan derinliği döndürmelidir
3. THE Redrive_Depth_Calculator SHALL derinlik hesaplama süresini loglamalıdır (performans izleme için)

### Gereksinim 8: DLQ Listeleme Entegrasyonu

**User Story:** Bir operatör olarak, DLQ listesinde POISON entry'leri görmek istiyorum, böylece hangi bundle'ların kalıcı sorunlu olduğunu hızlıca tespit edebilirim.

#### Kabul Kriterleri

1. WHEN DLQ entry'leri listelendiğinde, THE DLQ_Repository SHALL `is_poison` ve `poison_reason` alanlarını yanıta dahil etmelidir
2. WHERE POISON filtresi aktifse, THE DLQ_Repository SHALL yalnızca `is_poison=true` olan entry'leri döndürmelidir

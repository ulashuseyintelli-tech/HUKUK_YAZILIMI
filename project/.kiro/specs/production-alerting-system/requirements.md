# Gereksinimler Dokümanı

## Giriş

Bu doküman, calc-preview modülü için kapsamlı bir üretim uyarı sistemi tanımlar. Sistem, circuit breaker DEGRADED modu, break-glass cross-tenant erişim, JTI anomali tespiti ve manuel reset işlevselliği için akıllı uyarı yönetimi sağlar.

**Temel Prensipler:**
- Alert ≠ log. Loglar çoktur, alertler azdır.
- Her alert bir aksiyon tetiklemeli. Aksiyon yoksa alert yok.
- DEGRADED bir hata değil, kontrollü hasar modudur.

## Sözlük

- **Alert_Engine**: Uyarı üretimi, deduplikasyon ve yönlendirmeden sorumlu ana servis
- **Alert_Router**: Uyarıları sahiplik ve önceliğe göre doğru ekiplere yönlendiren bileşen
- **Correlation_Engine**: İlişkili uyarıları gruplandıran ve kök neden analizi için bağlayan bileşen
- **Flap_Detector**: HEALTHY↔DEGRADED geçişlerini izleyen ve kararsız durumları tespit eden bileşen
- **Cooldown_Manager**: Çözümleme sonrası uyarı bastırma süresini yöneten bileşen
- **Tenant_Scope**: Uyarının etki alanı (single_tenant | multi_tenant | global)
- **Priority_Level**: Uyarı öncelik seviyesi (P0 | P1 | P2 | P3)
- **Owner_Team**: Uyarıdan sorumlu ekip (SecOps | Platform/SRE | Data/Platform | Product/Backend)

## Gereksinimler

### Gereksinim 1: DEGRADED Süre Eşikleri

**Kullanıcı Hikayesi:** Bir SRE mühendisi olarak, DEGRADED modunun süresine göre kademeli uyarılar almak istiyorum, böylece uzun süreli bozulmalara uygun şekilde müdahale edebilirim.

#### Kabul Kriterleri

1. WHEN sistem DEGRADED moduna girdiğinde, THE Alert_Engine SHALL tek seferlik P3/info seviyesinde DEGRADED_ENTERED uyarısı üretmeli
2. WHILE sistem DEGRADED modunda ve süre < 15 dakika iken, THE Alert_Engine SHALL sadece ops timeline'a log yazmalı (alert üretmemeli)
3. WHEN DEGRADED süresi 15-30 dakika aralığına ulaştığında, THE Alert_Engine SHALL P2 seviyesinde DEGRADED_PERSISTING uyarısı üretmeli
4. WHEN DEGRADED süresi > 30 dakikayı aştığında, THE Alert_Engine SHALL P1 seviyesinde DEGRADED_PERSISTING uyarısı üretmeli
5. THE Alert_Engine SHALL degradedWarnAfterMs (varsayılan 15 dakika) ve degradedPageAfterMs (varsayılan 30 dakika) yapılandırma parametrelerini desteklemeli

### Gereksinim 2: Manuel Reset Uyarı Koşulları

**Kullanıcı Hikayesi:** Bir platform mühendisi olarak, manuel reset gerektiren durumlar için akıllı uyarılar almak istiyorum, böylece gereksiz gürültüden kaçınırken kritik durumları kaçırmam.

#### Kabul Kriterleri

1. WHEN manualResetRequired=true olduğunda, THE Alert_Engine SHALL anında P1 uyarısı üretmemeli (kombinasyon gerekli)
2. WHEN manualResetRequired=true VE (consecutiveFailures >= F_threshold VEYA degradedPersisting >= degradedPageAfterMs) olduğunda, THE Alert_Engine SHALL P1 seviyesinde uyarı üretmeli
3. THE Alert_Engine SHALL manualResetFailureThreshold (varsayılan 10) yapılandırma parametresini desteklemeli
4. THE Alert_Engine SHALL manualResetGracePeriodMs (varsayılan 10 dakika) yapılandırma parametresini desteklemeli

### Gereksinim 3: Güvenlik (SECURITY) Kategorisi Uyarıları

**Kullanıcı Hikayesi:** Bir güvenlik mühendisi olarak, güvenlik olayları için P0 seviyesinde acil uyarılar almak istiyorum, böylece potansiyel tehditlere anında müdahale edebilirim.

#### Kabul Kriterleri

1. WHEN JTI anomali tespit edildiğinde (HIGH veya MEDIUM severity), THE Alert_Engine SHALL P0 seviyesinde BREAK_GLASS_JTI_ANOMALY_DETECTED uyarısı üretmeli
2. WHEN cross-tenant erişim girişimi olduğunda (503 bloklanmış dahil), THE Alert_Engine SHALL P0 seviyesinde uyarı üretmeli
3. WHEN manualResetRequired=true ve eşik aşıldığında, THE Alert_Engine SHALL P0 seviyesinde güvenlik uyarısı üretmeli
4. THE Alert_Engine SHALL SECURITY kategorisindeki uyarıları SecOps ekibine yönlendirmeli
5. THE Alert_Engine SHALL SECURITY P0 uyarılarını cooldown süresinde bastırmamalı, sadece deduplikasyon ve agregasyon uygulamalı

### Gereksinim 4: Erişilebilirlik (AVAILABILITY) Kategorisi Uyarıları

**Kullanıcı Hikayesi:** Bir SRE mühendisi olarak, sistem erişilebilirliğini etkileyen durumlar için P1 seviyesinde uyarılar almak istiyorum, böylece hizmet kesintilerini minimize edebilirim.

#### Kabul Kriterleri

1. WHEN DEGRADED modu eşik süresini aştığında, THE Alert_Engine SHALL P1 seviyesinde uyarı üretmeli
2. WHEN consecutiveFailures trendi (slope-based) kritik seviyeye ulaştığında, THE Alert_Engine SHALL P1 seviyesinde uyarı üretmeli
3. THE Alert_Engine SHALL AVAILABILITY kategorisindeki uyarıları Platform/SRE ekibine yönlendirmeli

### Gereksinim 5: Kapasite (CAPACITY) Kategorisi Uyarıları

**Kullanıcı Hikayesi:** Bir platform mühendisi olarak, kaynak tüketimi ve kapasite sorunları için kademeli uyarılar almak istiyorum, böylece proaktif ölçeklendirme yapabilirim.

#### Kabul Kriterleri

1. WHEN tenant rate limit tükendiğinde, THE Alert_Engine SHALL P2 seviyesinde TENANT_RATE_LIMIT_EXHAUSTED uyarısı üretmeli
2. WHEN tenant rate limit N dakika boyunca sürekli tükendiğinde, THE Alert_Engine SHALL P1 seviyesinde TENANT_RATE_LIMIT_EXHAUSTED_SUSTAINED uyarısı üretmeli
3. WHEN queue depth yüksek seviyeye ulaştığında, THE Alert_Engine SHALL P2 seviyesinde QUEUE_DEPTH_HIGH uyarısı üretmeli
4. WHEN queue depth kritik seviyeye ulaştığında, THE Alert_Engine SHALL P1 seviyesinde QUEUE_DEPTH_CRITICAL uyarısı üretmeli
5. WHEN CPU/Memory/FD kullanımı eşik + süre koşulunu sağladığında, THE Alert_Engine SHALL uygun seviyede uyarı üretmeli
6. THE Alert_Engine SHALL CAPACITY kategorisindeki uyarıları Platform/SRE ekibine yönlendirmeli

### Gereksinim 6: Bütünlük (INTEGRITY) Kategorisi Uyarıları

**Kullanıcı Hikayesi:** Bir veri mühendisi olarak, veri bütünlüğü sorunları için P1/P2 seviyesinde uyarılar almak istiyorum, böylece veri tutarsızlıklarını hızlıca tespit edebilirim.

#### Kabul Kriterleri

1. WHEN audit trail yazma hatası oluştuğunda, THE Alert_Engine SHALL P1 seviyesinde uyarı üretmeli
2. WHEN status endpoint ile metrikler arasında uyumsuzluk tespit edildiğinde, THE Alert_Engine SHALL P2 seviyesinde uyarı üretmeli
3. THE Alert_Engine SHALL INTEGRITY kategorisindeki uyarıları Data/Platform ekibine yönlendirmeli

### Gereksinim 7: Hijyen (HYGIENE) Kategorisi Uyarıları

**Kullanıcı Hikayesi:** Bir backend geliştirici olarak, validasyon hataları ve kod kalitesi sorunları için P3 seviyesinde uyarılar almak istiyorum, böylece teknik borcu yönetebilirim.

#### Kabul Kriterleri

1. WHEN validasyon hatası spike'ı tespit edildiğinde, THE Alert_Engine SHALL P3 seviyesinde uyarı üretmeli
2. THE Alert_Engine SHALL HYGIENE kategorisindeki uyarıları Product/Backend ekibine yönlendirmeli

### Gereksinim 8: Kurtarma (RECOVERY) Uyarıları

**Kullanıcı Hikayesi:** Bir operasyon mühendisi olarak, incident çözümlendiğinde açık bildirim almak istiyorum, böylece incident durumunu doğru takip edebilirim.

#### Kabul Kriterleri

1. WHEN incident çözümlendiğinde, THE Alert_Engine SHALL P3/Info seviyesinde INCIDENT_RESOLVED uyarısı üretmeli
2. THE Alert_Engine SHALL INCIDENT_RESOLVED payload'ında resolvedAt, durationMs, rootCauseHint ve resolutionReason (auto_recovery | manual_reset | timeout) alanlarını içermeli
3. WHEN kurtarma sonrası sistem kararsız olduğunda, THE Alert_Engine SHALL P2 seviyesinde RECOVERY_WITH_FLAPPING_RISK uyarısı üretmeli

### Gereksinim 9: Flapping (Kararsızlık) Tespiti

**Kullanıcı Hikayesi:** Bir SRE mühendisi olarak, sistemin kararsız durumda olduğunu tespit etmek istiyorum, böylece kök neden analizine odaklanabilirim.

#### Kabul Kriterleri

1. THE Flap_Detector SHALL HEALTHY→DEGRADED→HEALTHY döngüsünü bir flap olarak saymalı
2. THE Flap_Detector SHALL 60 dakikalık kayan pencere kullanmalı
3. WHEN >= 3 flap/60 dakika tespit edildiğinde, THE Alert_Engine SHALL P2 seviyesinde uyarı üretmeli ve "kök neden araştırın" önerisi eklemeli
4. WHEN >= 5 flap/60 dakika tespit edildiğinde, THE Alert_Engine SHALL P1 seviyesinde uyarı üretmeli ve RCA tetiklemeli
5. THE Flap_Detector SHALL flapP2ThresholdPerHour (varsayılan 3) ve flapP1ThresholdPerHour (varsayılan 5) yapılandırma parametrelerini desteklemeli

### Gereksinim 10: Tenant Kapsamı Belirleme

**Kullanıcı Hikayesi:** Bir operasyon mühendisi olarak, uyarının etki alanını (tek tenant, çoklu tenant, global) net olarak görmek istiyorum, böylece doğru müdahale stratejisini belirleyebilirim.

#### Kabul Kriterleri

1. WHEN uyarı tek bir tenant'ı etkilediğinde, THE Alert_Engine SHALL tenantScope=single_tenant olarak belirlenmeli
2. WHEN aynı alertType 5 dakika içinde 3+ farklı tenant'ı etkilediğinde, THE Alert_Engine SHALL tenantScope=multi_tenant olarak belirlenmeli
3. WHEN uyarı cross-tenant/management path veya sistem genelini etkilediğinde, THE Alert_Engine SHALL tenantScope=global olarak belirlenmeli
4. THE Alert_Engine SHALL multiTenantMinTenants (varsayılan 3) ve multiTenantWindowMs (varsayılan 5 dakika) yapılandırma parametrelerini desteklemeli

### Gereksinim 11: Uyarı Sahiplik Yönlendirmesi

**Kullanıcı Hikayesi:** Bir operasyon yöneticisi olarak, uyarıların otomatik olarak doğru ekiplere yönlendirilmesini istiyorum, böylece müdahale süresi minimize edilsin.

#### Kabul Kriterleri

1. THE Alert_Router SHALL SECURITY kategorisindeki uyarıları SecOps ekibine yönlendirmeli
2. THE Alert_Router SHALL AVAILABILITY kategorisindeki uyarıları Platform/SRE ekibine yönlendirmeli
3. THE Alert_Router SHALL CAPACITY kategorisindeki uyarıları Platform/SRE ekibine yönlendirmeli
4. THE Alert_Router SHALL INTEGRITY kategorisindeki uyarıları Data/Platform ekibine yönlendirmeli
5. THE Alert_Router SHALL HYGIENE kategorisindeki uyarıları Product/Backend ekibine yönlendirmeli
6. THE Alert_Engine SHALL her uyarı payload'ında ownerTeam alanını içermeli

### Gereksinim 12: Cooldown Süresi Yönetimi

**Kullanıcı Hikayesi:** Bir operasyon mühendisi olarak, çözümleme sonrası aynı uyarının tekrar tetiklenmemesini istiyorum, böylece uyarı yorgunluğundan kaçınabilirim.

#### Kabul Kriterleri

1. THE Cooldown_Manager SHALL cooldownAfterResolveMs (varsayılan 30 dakika) yapılandırma parametresini desteklemeli
2. WHILE cooldown süresi aktifken, THE Alert_Engine SHALL aynı alertKey için uyarı bastırmalı
3. IF uyarı kategorisi SECURITY P0 ise, THE Alert_Engine SHALL cooldown bastırması uygulamamalı (sadece deduplikasyon/agregasyon)

### Gereksinim 13: Korelasyon ID Yönetimi

**Kullanıcı Hikayesi:** Bir SRE mühendisi olarak, aynı kök nedenden kaynaklanan uyarıları gruplandırmak istiyorum, böylece incident yönetimini kolaylaştırabilirim.

#### Kabul Kriterleri

1. THE Correlation_Engine SHALL aynı kök nedenden kaynaklanan uyarıları correlationId ile bağlamalı
2. THE Correlation_Engine SHALL correlationId'yi deterministik hash (component, windowBucket, primaryDimension) veya upstream trace id kullanarak üretmeli
3. THE Alert_Engine SHALL her uyarı payload'ında correlationId ve relatedIncidentIds[] alanlarını içermeli

### Gereksinim 14: Bakım Modu Severity Override

**Kullanıcı Hikayesi:** Bir operasyon mühendisi olarak, bakım modu sırasında uyarı seviyelerinin otomatik olarak düşürülmesini istiyorum, böylece planlı bakım sırasında gereksiz eskalasyonlardan kaçınabilirim.

#### Kabul Kriterleri

1. WHILE maintenanceMode=true iken, THE Alert_Engine SHALL maksimum severity'yi P2 ile sınırlamalı
2. IF uyarı kategorisi SECURITY ise, THE Alert_Engine SHALL severity sınırlaması uygulamamalı ancak maintenanceContext=true ile zenginleştirmeli

### Gereksinim 15: Uyarı Payload Standartları

**Kullanıcı Hikayesi:** Bir entegrasyon mühendisi olarak, tutarlı ve zengin uyarı payload'ları almak istiyorum, böylece downstream sistemlerle entegrasyonu kolaylaştırabilirim.

#### Kabul Kriterleri

1. THE Alert_Engine SHALL her uyarı payload'ında incidentId alanını içermeli
2. THE Alert_Engine SHALL her uyarı payload'ında tenantScope (single | multi | global) alanını içermeli
3. THE Alert_Engine SHALL her uyarı payload'ında recommendation alanını içermeli
4. THE Alert_Engine SHALL her uyarı payload'ında runbookLink (SECURITY.md veya ops playbook) alanını içermeli
5. THE Alert_Engine SHALL her uyarı payload'ında ownerTeam alanını içermeli
6. THE Alert_Engine SHALL her uyarı payload'ında correlationId alanını içermeli
7. THE Alert_Engine SHALL her uyarı payload'ında relatedIncidentIds[] alanını içermeli

### Gereksinim 16: Gürültü Önleme Kuralları

**Kullanıcı Hikayesi:** Bir operasyon mühendisi olarak, uyarı gürültüsünün minimize edilmesini istiyorum, böylece gerçek sorunlara odaklanabilirim.

#### Kabul Kriterleri

1. THE Alert_Engine SHALL aynı uyarıyı 15 dakika içinde tekrarlamamalı (dedupe key ile)
2. THE Alert_Engine SHALL HEALTHY→DEGRADED→HEALTHY flapping'i tek incident olarak ele almalı
3. THE Alert_Engine SHALL dedupe penceresi için yapılandırılabilir parametre desteklemeli

### Gereksinim 17: Inhibit/Suppression Kuralları

**Kullanıcı Hikayesi:** Bir operasyon mühendisi olarak, bakım modu ve özel durumlar için açık bastırma kuralları istiyorum, böylece deploy sırasında gerçek sorunları kaçırmam.

#### Kabul Kriterleri

1. WHILE maintenanceMode=true iken, THE Alert_Engine SHALL CAPACITY ve AVAILABILITY kategorisindeki uyarıları P2'ye clamp etmeli ancak tamamen susturmamalı
2. THE Alert_Engine SHALL SECURITY kategorisindeki uyarıları hiçbir koşulda bastırmamalı (suppress edilmez, sadece aggregate/dedupe edilir)
3. THE Alert_Engine SHALL inhibit kurallarını yapılandırılabilir şekilde desteklemeli
4. WHEN bir parent alert aktifken, THE Alert_Engine SHALL ilişkili child alertleri inhibit edebilmeli (örn: global outage → tenant-specific alertleri bastır)
5. THE Alert_Engine SHALL bastırılan alert sayısını (suppressed_alert_count) metrik olarak emit etmeli

### Gereksinim 18: SLO/Latency Tabanlı Trend Tanımı

**Kullanıcı Hikayesi:** Bir SRE mühendisi olarak, failure trend hesaplamasının deterministik ve ölçülebilir olmasını istiyorum, böylece implementasyon drift'inden kaçınabilirim.

#### Kabul Kriterleri

1. THE Alert_Engine SHALL failure trend hesaplamasını "rolling window + slope" yöntemiyle yapmalı
2. THE Alert_Engine SHALL trend hesaplaması için 5 dakikalık rolling window kullanmalı
3. WHEN 5 dakikalık window'da failure rate %X üstü VE artış trendi varsa, THE Alert_Engine SHALL trend-based alert üretmeli
4. THE Alert_Engine SHALL burn rate hesaplaması için SLO budget consumption oranını kullanmalı
5. THE Alert_Engine SHALL trend hesaplama parametrelerini (windowMs, slopeThreshold, minSampleCount) yapılandırılabilir şekilde desteklemeli
6. THE Alert_Engine SHALL trend hesaplaması için minimum sample count (varsayılan 10) gereksinimi uygulamalı (istatistiksel anlamlılık)

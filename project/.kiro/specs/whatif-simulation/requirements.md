# Phase 8: What-if Simulation + Condition-based Escalation

## Amaç

Sistem, bir incident için yan etkisiz "what-if" simülasyonları üretecek; evidence kalitesi ve counterfactual risklerine göre auto-escalation / promote kararlarını güvenli şekilde yönetecek; drift kontrolü ile simülasyon → gerçek yürütme arasında güven köprüsü kuracak.

## Tanımlar

- **EvidenceSnapshot**: Belirli anda alınmış metrik kanıt seti.
- **EvidenceGate**: Snapshot kalitesini değerlendirir (confidence/freshness/age).
- **ActionPolicyGuard**: Action izinlerini ve safety limitlerini değerlendirir.
- **Counterfactual**: Simülasyonun karar kalitesini düşüren koşul kategorileri.
- **Promote**: Simülasyondaki bir senaryonun gerçek yürütmeye aday edilmesi.
- **Drift**: Simülasyon anındaki evidence ile promote anındaki evidence arasındaki fark.

---

## Gereksinimler

### 1. Gate Hiyerarşisi (Hard)

#### 1.1 Gate Sırası
**When** sistem bir simülasyon veya promote işlemi gerçekleştirirken,
**then** gate'ler şu sırayla değerlendirilmelidir: EvidenceGate → ActionPolicyGuard → ActionExecutor.

**Acceptance Criteria:**
- 1.1.1 EvidenceGate her zaman ilk değerlendirilir
- 1.1.2 EvidenceGate fail durumunda PolicyGuard ve Executor çalıştırılamaz
- 1.1.3 "policy passed but evidence stale" gibi karma durumlar üretilmez

---

### 2. Evidence Snapshot Kalitesi (Hard Thresholds)

#### 2.1 Snapshot Metadata
**When** bir simülasyon yanıtı döndürülürken,
**then** yanıtta `evidenceSnapshotAt`, `snapshotAgeSec`, `flags[]` zorunlu olarak bulunmalıdır.

**Acceptance Criteria:**
- 2.1.1 Tüm simulation response'larında evidenceSnapshotAt ISO timestamp olarak bulunur
- 2.1.2 snapshotAgeSec hesaplanır ve response'a eklenir
- 2.1.3 flags[] array'i her zaman bulunur (boş olabilir)

#### 2.2 STALE_EVIDENCE Flag
**When** snapshotAgeSec > 60 ise,
**then** simülasyon çıktısında STALE_EVIDENCE flag'i olmalıdır.

**Acceptance Criteria:**
- 2.2.1 60 saniyeden eski snapshot'larda STALE_EVIDENCE flag'i eklenir
- 2.2.2 Flag eklenmesi deterministiktir

#### 2.3 LOW_CONFIDENCE Flag
**When** herhangi bir kritik metric point'inde confidence < 0.5 ise,
**then** snapshot-level LOW_CONFIDENCE flag'i oluşmalıdır.

**Acceptance Criteria:**
- 2.3.1 Kritik metrikler: error_rate, slo_burn_rate, latency_p99
- 2.3.2 Tek bir kritik metrikte bile confidence < 0.5 ise flag eklenir

#### 2.4 STALE_DATA Flag
**When** herhangi bir metric point'inde freshnessSec > 120 ise,
**then** snapshot-level STALE_DATA flag'i oluşmalıdır.

**Acceptance Criteria:**
- 2.4.1 120 saniyeden eski veri içeren point'ler tespit edilir
- 2.4.2 Point-level ve snapshot-level flag'ler ayrı ayrı tutulur

#### 2.5 Auto Gating
**When** snapshot-level LOW_CONFIDENCE veya STALE_DATA varsa,
**then** autoEscalationAllowed=false ve promoteAllowed=false olmalıdır.

**Acceptance Criteria:**
- 2.5.1 LOW_CONFIDENCE flag'i auto-escalation'ı bloklar
- 2.5.2 STALE_DATA flag'i auto-escalation'ı bloklar
- 2.5.3 Her iki flag da promote'u bloklar

---

### 3. Structured Assumptions ve Determinism

#### 3.1 Structured Assumptions
**When** simülasyon oluşturulurken,
**then** assumptions structured format kullanmalıdır (serbest metin yok).

**Acceptance Criteria:**
- 3.1.1 AssumptionSpec interface'i kullanılır
- 3.1.2 Serbest metin assumption kabul edilmez
- 3.1.3 Validation hatası döner

#### 3.2 Determinism
**When** aynı (incidentId + evidenceSnapshotId + assumptions + seed) ile simülasyon çalıştırılırsa,
**then** deterministik çekirdek aynı olmalıdır.

**Determinism Kapsamı:**
- scenarios[] (içerik ve sıralama)
- ranking[] (içerik ve sıralama)
- counterfactuals[]
- flags[]
- wouldBlock sonuçları
- riskScore ve expectedImpact türevleri

**Determinism Kapsamı Dışı (Metadata):**
- simulationId
- timestamp alanları (createdAt, startedAt, finishedAt, evidenceSnapshotAt vb.)
- computeTimeSec gibi performans ölçümleri

**Acceptance Criteria:**
- 3.2.1 Aynı input ile çalıştırılan simülasyonlar aynı scenarios[] üretir
- 3.2.2 Metadata alanları determinism kontrolünden hariçtir

#### 3.3 Seed Etki Alanı
**When** seed parametresi kullanılırken,
**then** seed şu üç şeyi kontrol etmelidir:
1. Action ordering tiebreaks
2. Heuristic confidence jitter (opsiyonel)
3. Scenario generation order

**Acceptance Criteria:**
- 3.3.1 Seed'in etki alanı dokümante edilir
- 3.3.2 Seed değiştiğinde sadece belirtilen alanlar değişir

---

### 4. Simulation İzolasyonu

#### 4.1 Yan Etkisizlik
**When** simülasyon çalıştırılırken,
**then** gerçek action executor çağrılmamalıdır.

**Acceptance Criteria:**
- 4.1.1 Simülasyon sırasında hiçbir gerçek action uygulanmaz
- 4.1.2 MockActionExecutor kullanılır

#### 4.2 SimulationContext
**When** simülasyon çalıştırılırken,
**then** SimulationContext kullanımı zorunludur: MockActionExecutor + SimulatedClock ile çalışır.

**Acceptance Criteria:**
- 4.2.1 SimulationContext mode='dry_run' olarak set edilir
- 4.2.2 SimulatedClock ile zaman simüle edilir

---

### 5. Simulation Compute Timeout (CPU Safety)

#### 5.1 Timeout Desteği
**When** simülasyon çalıştırılırken,
**then** maxComputeTimeSec desteklenmelidir. Default 30, maksimum 120.

**Acceptance Criteria:**
- 5.1.1 maxComputeTimeSec parametresi kabul edilir
- 5.1.2 Default değer 30 saniyedir
- 5.1.3 120 saniyeden büyük değerler reddedilir

#### 5.2 Timeout Davranışı
**When** simülasyon timeout olursa,
**then** aşağıdaki davranış sergilenmelidir:
- compute.timedOut = true
- scenarios[] içinde tamamlanan senaryolar döner
- compute.completedScenarios = N
- compute.totalScenarios = M
- status = COMPLETED_WITH_TIMEOUT

**Acceptance Criteria:**
- 5.2.1 Timeout durumunda partial results döner
- 5.2.2 Tamamlanan senaryo sayısı raporlanır
- 5.2.3 Status doğru set edilir

---

### 6. Counterfactual Policy

#### 6.1 CounterfactualPolicyConfig
**When** counterfactual değerlendirmesi yapılırken,
**then** davranış CounterfactualPolicyConfig ile konfigüre edilmelidir.

**Config Alanları:**
- blockAutoPromoteOn[]
- blockAutoEscalationOn[]
- warnOnlyOn[]

**Acceptance Criteria:**
- 6.1.1 Config injection desteklenir
- 6.1.2 Default değerler uygulanır

#### 6.2 Default Değerler
**When** config belirtilmezse,
**then** default değerler uygulanmalıdır:
- blockAutoPromoteOn = [CONFLICTING_SIGNALS, MISSING_SIGNAL]
- blockAutoEscalationOn = [CONFLICTING_SIGNALS, MISSING_SIGNAL]
- warnOnlyOn = [INSUFFICIENT_HISTORY, ASSUMPTION_SENSITIVE]

**Acceptance Criteria:**
- 6.2.1 Default blockAutoPromoteOn doğru uygulanır
- 6.2.2 Default blockAutoEscalationOn doğru uygulanır
- 6.2.3 Default warnOnlyOn doğru uygulanır

---

### 7. Condition-based Escalation + Hysteresis + De-escalation

#### 7.1 Escalation Trigger
**When** metric > threshold ve stableForSec >= 30 ise,
**then** escalation tetiklenmelidir.

**Acceptance Criteria:**
- 7.1.1 Threshold aşımı kontrol edilir
- 7.1.2 Stability süresi kontrol edilir (default 30s)

#### 7.2 De-escalation
**When** metric < threshold * hysteresisFactor ve deEscalationStableForSec sağlanırsa,
**then** de-escalation tetiklenmelidir.

**Acceptance Criteria:**
- 7.2.1 Hysteresis factor uygulanır (default 0.8)
- 7.2.2 De-escalation stability süresi kontrol edilir

#### 7.3 Auto Resolve
**When** autoResolveOnDeEscalation=true ve de-escalation koşulları sağlanırsa,
**then** incident otomatik resolve edilebilir (opsiyonel).

**Acceptance Criteria:**
- 7.3.1 autoResolveOnDeEscalation opsiyoneldir
- 7.3.2 Default false'tur

#### 7.4 Evidence Gate Entegrasyonu
**When** EvidenceGate fail ise,
**then** condition-based auto-escalation bloklanmalıdır.

**Acceptance Criteria:**
- 7.4.1 EvidenceGate fail durumunda escalation üretilmez

---

### 8. Promote Drift Guard

#### 8.1 Fresh Snapshot
**When** promote işlemi başlatılırken,
**then** fresh snapshot alınmalıdır.

**Acceptance Criteria:**
- 8.1.1 Promote sırasında yeni snapshot alınır
- 8.1.2 Eski snapshot ile karşılaştırılır

#### 8.2 DriftScore Hesaplama
**When** iki snapshot karşılaştırılırken,
**then** ağırlıklı driftScore hesaplanmalıdır.

**Acceptance Criteria:**
- 8.2.1 Metric bazında drift hesaplanır
- 8.2.2 Ağırlıklar uygulanır

#### 8.3 Drift Threshold
**When** driftScore > threshold ise,
**then** promote reddedilmeli (409 DRIFT_TOO_HIGH) ve RESIMULATE önerilmelidir.

**Acceptance Criteria:**
- 8.3.1 Threshold aşımında 409 döner
- 8.3.2 RESIMULATE önerisi eklenir

#### 8.4 Drift Weight Config
**When** drift hesaplanırken,
**then** aşağıdaki ağırlıklar kullanılmalıdır:
- error_rate: 2.0
- slo_burn_rate: 2.0
- latency_p99: 1.0
- saturation_cpu: 0.5
- queue_depth: 0.5
- DRIFT_THRESHOLD: 0.15

**Acceptance Criteria:**
- 8.4.1 Ağırlıklar doğru uygulanır
- 8.4.2 Threshold 0.15 olarak uygulanır

---

### 9. Snapshot Persistence ve TTL

#### 9.1 Retention
**When** snapshot store'a kaydedilirken,
**then** default retention 72 saat olmalıdır.

**Acceptance Criteria:**
- 9.1.1 Default retention 72 saattir
- 9.1.2 Config ile değiştirilebilir

#### 9.2 Promoted Snapshot Retention
**When** snapshot promoted=true ise,
**then** daha uzun tutulabilir (örn. 7 gün).

**Acceptance Criteria:**
- 9.2.1 Promoted snapshot'lar ayrı retention'a sahiptir
- 9.2.2 markPromoted() metodu çalışır

#### 9.3 Cleanup Job
**When** cleanup job çalıştırılırken,
**then** TTL dışı snapshot'lar silinmelidir.

**Acceptance Criteria:**
- 9.3.1 Periyodik cleanup çalışır
- 9.3.2 deleteExpired() silinen kayıt sayısını döner

---

### 10. API Versioning

#### 10.1 Version Prefix
**When** API endpoint'leri tanımlanırken,
**then** /v1/ prefix kullanılmalıdır.

**Acceptance Criteria:**
- 10.1.1 POST /v1/simulations
- 10.1.2 GET /v1/simulations/{id}
- 10.1.3 POST /v1/simulations/{id}/promote

#### 10.2 Phase 7 Tutarlılığı
**When** API tasarlanırken,
**then** Phase 7 API'leri ile tutarlı olmalıdır (aynı auth/tenant scoping yaklaşımı).

**Acceptance Criteria:**
- 10.2.1 Aynı auth header'ları kullanılır
- 10.2.2 Aynı tenant scoping uygulanır

---

### 11. Simulation Rate Limiting (Abuse Koruması)

#### 11.1 Concurrent Limit
**When** tenant simülasyon oluşturmaya çalışırken,
**then** concurrent simulation limit = 3 (status=RUNNING olan simülasyonlar).

**Acceptance Criteria:**
- 11.1.1 RUNNING status'taki simülasyonlar sayılır
- 11.1.2 Limit aşımında 429 döner

#### 11.2 Daily Limit
**When** tenant simülasyon oluşturmaya çalışırken,
**then** günlük simulation limit = 100 (son 24 saatte CREATED olan, status bağımsız).

**Acceptance Criteria:**
- 11.2.1 Son 24 saatteki CREATED simülasyonlar sayılır
- 11.2.2 Limit aşımında 429 TOO_MANY_SIMULATIONS döner

---

### 12. Scenario Ranking (Operator Yardımcısı)

#### 12.1 ScenarioRanker
**When** simülasyon tamamlandığında,
**then** ScenarioRanker senaryoları sıralamalı ve tradeoff üretmelidir.

**Acceptance Criteria:**
- 12.1.1 dominates listesi üretilir
- 12.1.2 tradeoffs açıklaması üretilir

---

### 13. Audit Trail Genişletmesi

#### 13.1 Simulation Audit Events
**When** simülasyon işlemleri gerçekleştirilirken,
**then** aşağıdaki audit eventleri zorunludur:
- SIMULATION_CREATED
- SIMULATION_COMPLETED
- SIMULATION_PROMOTE_REQUESTED
- SIMULATION_PROMOTE_BLOCKED
- SIMULATION_PROMOTED

**Acceptance Criteria:**
- 13.1.1 Her event tipi doğru zamanda üretilir
- 13.1.2 Event'ler audit store'a kaydedilir

# Ops Playbook System - Requirements

## Overview

Phase 7B: Incident'ları otomatik aksiyonlara, bildirimlere ve escalation'lara bağlayan operasyonel playbook sistemi.

**Amaç:** "Diagnostics var" → "Ops yönetiyoruz" geçişi.

**Önceki Phase:** Phase 7A Self-serve Diagnostics (incident detection, evidence, recommendation)

---

## Problem Statement

Phase 7A ile incident'ları tespit ediyoruz ama:
1. Bildirim yok (mail/slack/webhook)
2. Otomatik aksiyon yok (cache TTL uzat, fallback aç)
3. Escalation yok (WARNING 30dk → CRITICAL)
4. Audit trail yok (kim ne yaptı, ne oldu)

Bu demek ki: **Incident'lar "isim" olarak kalıyor, operasyonel değer üretmiyor.**

---

## Requirements

### REQ-1: Playbook Registry

#### REQ-1.1: YAML Playbook Loading
- Sistem, `playbooks/*.yaml` dizininden playbook tanımlarını yükleyebilmeli
- Her playbook benzersiz `id` ve `version` içermeli
- Yükleme sırasında schema validation yapılmalı

#### REQ-1.2: Schema Validation (Zod)
- Playbook YAML → typed model dönüşümü Zod ile yapılmalı
- Unknown fields reject edilmeli
- Required fields eksikse yükleme başarısız olmalı

#### REQ-1.3: Semantic Validation
- Unknown action type → REJECT
- Unknown incident type → REJECT
- `when` clause'lar whitelist DSL olmalı (arbitrary expression YASAK)
- Escalation döngüsü tespit edilmeli (infinite loop önleme)
- Aynı incident_type için birden fazla playbook → conflict warning

#### REQ-1.4: Versioning
- Her playbook `version` field'ı içermeli (semver)
- Aynı playbook'un farklı versiyonları yüklenebilmeli
- Aktif versiyon tenant bazlı seçilebilmeli

---

### REQ-2: Playbook Matching

#### REQ-2.1: Incident → Playbook Eşleştirme
- Incident oluştuğunda uygun playbook otomatik seçilmeli
- Eşleştirme kriterleri:
  - `incident_type` (exact match)
  - `severity` (list match)
  - `tenant_scope` (optional filter)

#### REQ-2.2: Priority Resolution
- Birden fazla playbook eşleşirse priority'ye göre seçim
- Tenant-specific playbook > global playbook

#### REQ-2.3: Dry-Run Mode
- Playbook `dry_run: true` ile çalıştırılabilmeli
- Dry-run'da: notification + audit EVET, auto-action HAYIR
- Canary rollout için kullanılacak

---

### REQ-3: Action Execution (GUARDED)

#### REQ-3.1: Action Types
Desteklenen action tipleri:
- `notification`: Bildirim gönder (slack/email/webhook)
- `auto_action`: Otomatik sistem aksiyonu
- `human_action`: İnsan müdahalesi gerektiren görev
- `escalation`: Severity yükseltme (zamanlı)

#### REQ-3.2: Auto-Action Safety Policy (KRİTİK)
Her auto-action için zorunlu safety policy:

```yaml
safety_policy:
  max_ttl_ms: 300000          # Maximum değer
  max_multiplier: 3           # Maximum çarpan
  allowed_namespaces:         # Sadece bu namespace'lerde
    - rate_provider
    - tariff_provider
  allowed_roles:              # Sadece bu roller tetikleyebilir
    - internal-ops
    - system
  cooldown_ms: 600000         # 10 dk içinde tekrar uygulama yok
```

#### REQ-3.3: Idempotency
- Aynı `incident_id` + `action_id` kombinasyonu tekrar çalıştırılırsa:
  - İkinci kez etki ETMEMELİ
  - Audit'e "skipped: already_executed" yazılmalı

#### REQ-3.4: Action Lease (Temporary Effects)
- Auto-action'lar geçici olmalı (lease süresi)
- Lease süresi dolunca otomatik rollback
- Örnek: `extend_cache_ttl` → 15 dk sonra eski TTL'e dön

```yaml
lease:
  duration_ms: 900000         # 15 dakika
  auto_rollback: true
  rollback_action: restore_cache_ttl
```

#### REQ-3.5: ActionPolicyGuard
- Her auto-action çalışmadan önce guard kontrolü
- Policy ihlali → action REJECT + audit log
- Guard bypass YASAK (internal-ops dahil)

---

### REQ-4: Notification Channel

#### REQ-4.1: Channel Types
- `console`: Development/test için
- `webhook`: Generic HTTP POST
- `slack`: Slack incoming webhook
- `email`: SMTP email (future)

#### REQ-4.2: Template System
- Her notification tipi için template
- Template variables: `{incident_type}`, `{severity}`, `{tenant_id}`, `{recommendation}`
- Türkçe template desteği

#### REQ-4.3: Delivery Guarantee
- At-least-once delivery
- Retry with exponential backoff (3 attempts)
- Dead letter queue for failed notifications

---

### REQ-5: Escalation

#### REQ-5.1: Time-Based Escalation
- Incident belirli süre ONGOING kalırsa severity yükselt
- Örnek: WARNING 30dk → CRITICAL

#### REQ-5.2: Escalation Chain
- Multi-step escalation desteklenmeli
- Örnek: INFO → WARNING (15dk) → CRITICAL (30dk)

#### REQ-5.3: Escalation Loop Prevention
- Aynı incident için maximum escalation sayısı
- Döngü tespit edilirse escalation durdurulmalı

---

### REQ-6: Human Action Tracking

#### REQ-6.1: Task Assignment
- Human action → assignee_role
- SLA timer başlatılmalı

#### REQ-6.2: Acknowledgement
- `POST /incidents/:id/acknowledge` ile kabul
- Acknowledge eden user + timestamp kaydedilmeli

#### REQ-6.3: Resolution
- `POST /incidents/:id/resolve` ile çözüm
- Resolution note zorunlu
- SLA compliance hesaplanmalı

---

### REQ-7: Audit Trail

#### REQ-7.1: Execution Logging
Her playbook execution için:
- `execution_id` (unique)
- `playbook_id` + `version`
- `incident_id`
- `tenant_id`
- `triggered_at`
- `completed_at`
- `result`: SUCCESS | PARTIAL | FAILED

#### REQ-7.2: Action Logging
Her action için:
- `action_id`
- `action_type`
- `params`
- `result`: EXECUTED | SKIPPED | FAILED | REJECTED
- `rejection_reason` (if rejected)
- `lease_id` (if temporary)

#### REQ-7.3: Immutability
- Audit log'lar immutable olmalı
- Silme/güncelleme YASAK

---

### REQ-8: Observability (Self-Metrics)

#### REQ-8.1: Playbook Metrics
```
playbook_executions_total{playbook_id, result}
playbook_actions_total{action_type, result}
playbook_execution_duration_ms{playbook_id}
playbook_escalations_total{from_severity, to_severity}
```

#### REQ-8.2: Notification Metrics
```
notification_sent_total{channel, result}
notification_delivery_latency_ms{channel}
notification_retry_total{channel}
```

#### REQ-8.3: Diagnostics API Self-Metrics
```
diagnostics_api_requests_total{endpoint, status}
diagnostics_api_latency_ms{endpoint}
diagnostics_aggregator_latency_ms{source}
```

---

### REQ-9: API Endpoints

#### REQ-9.1: Playbook Management
```
GET  /calc/diagnostics/playbooks
     → Aktif playbook listesi

GET  /calc/diagnostics/playbooks/:id
     → Playbook detayı

GET  /calc/diagnostics/playbooks/:id/history
     → Playbook execution geçmişi
```

#### REQ-9.2: Manual Trigger
```
POST /calc/diagnostics/playbooks/:id/trigger
     → Manuel playbook tetikleme (dry-run destekli)
     Body: { incident_id, dry_run?: boolean }
```

#### REQ-9.3: Incident Actions
```
POST /calc/diagnostics/incidents/:id/acknowledge
     → Incident kabul (SLA başlat)
     Body: { note?: string }

POST /calc/diagnostics/incidents/:id/resolve
     → Manuel çözüm
     Body: { resolution_note: string }
```

#### REQ-9.4: Lease Management
```
GET  /calc/diagnostics/leases/active
     → Aktif lease'ler (temporary effects)

POST /calc/diagnostics/leases/:id/revoke
     → Lease'i erken sonlandır (rollback)
```

---

### REQ-10: RBAC

#### REQ-10.1: Role Permissions

| Action | tenant-admin | internal-ops | system |
|--------|--------------|--------------|--------|
| View playbooks | ✅ | ✅ | ✅ |
| View execution history | Own tenant | All | All |
| Trigger playbook (dry-run) | ❌ | ✅ | ✅ |
| Trigger playbook (real) | ❌ | ✅ | ✅ |
| Acknowledge incident | Own tenant | All | All |
| Resolve incident | Own tenant | All | All |
| Revoke lease | ❌ | ✅ | ✅ |

---

## Non-Functional Requirements

### NFR-1: Performance
- Playbook matching: < 10ms
- Action execution: < 100ms (excluding external calls)
- Notification delivery: < 5s (first attempt)

### NFR-2: Reliability
- Playbook execution: at-least-once
- Notification: at-least-once with retry
- Lease expiry: guaranteed (background job)

### NFR-3: Safety
- Auto-action'lar ASLA policy dışı çalışmamalı
- Lease süresi dolunca rollback GARANTİLİ
- Escalation loop ASLA oluşmamalı

---

## Out of Scope (Phase 7B)

- UI Dashboard (sadece API)
- Multi-region playbook sync
- A/B testing for playbooks
- ML-based incident classification

---

## Success Criteria

1. ✅ 5 temel playbook tanımlı ve çalışır (circuit_breaker, high_error_rate, slo_breach, rate_limit, degraded_service)
2. ✅ Auto-action'lar guarded + leased + idempotent
3. ✅ Notification en az 1 channel'da çalışır (webhook)
4. ✅ Escalation timer çalışır
5. ✅ Audit trail complete
6. ✅ Self-metrics üretiliyor
7. ✅ Playbook YAML validation (schema + semantic)

---

## Dependencies

- Phase 7A: DiagnosticsIncidentService (incident detection)
- Phase 7A: DiagnosticsAuditService (audit infrastructure)
- Phase 4.3: CircuitBreakerService (auto-action target)
- Phase 4.4: VersionedCacheService (auto-action target)

---

## Glossary

| Term | Definition |
|------|------------|
| Playbook | Incident'a karşılık çalışacak aksiyon dizisi |
| Auto-action | Sistem tarafından otomatik uygulanan aksiyon |
| Human-action | İnsan müdahalesi gerektiren görev |
| Lease | Geçici etki süresi (auto-rollback ile) |
| Escalation | Severity yükseltme (zamanlı) |
| Dry-run | Sadece notification + audit, auto-action yok |

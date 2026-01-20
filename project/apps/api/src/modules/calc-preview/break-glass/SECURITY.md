# Break-Glass Security Architecture

## Overview

Cross-tenant break-glass access sistemi, internal-ops personelinin kontrollü ve denetlenebilir şekilde tenant verilerine erişmesini sağlar.

## Security Posture

> **Cross-tenant erişim ancak: VPN + internal_ops + ACTIVE grant + actor-bound token + append-only audit ile mümkün.**

> **Audit subsystem DEGRADED olduğunda break-glass endpoints 503 ile kapanır (controlled shutdown).**

Bu iki cümle, sistemin güvenlik iddiasını özetler ve hem teknik hem hukuki savunmada referans noktasıdır.

## Authority Model

Break-glass token'ları iki farklı yetki türü taşır:

| Authority Type | Condition | Purpose |
|----------------|-----------|---------|
| **Access Authority** | `exp valid` + `grant ACTIVE` | Token ile cross-tenant veriye erişim |
| **Renewal Authority** | `renewalsLeft > 0` | Token'ı yenileyerek süreyi uzatma |

### Kritik Ayrım

```
Access authority  = exp valid + grant ACTIVE
Renewal authority = renewalsLeft > 0
```

- `renewalsLeft=0` olan token **hala access için kullanılabilir** (exp dolana kadar)
- `renewalsLeft=0` olan token **renew edilemez**
- Bu kasıtlı bir tasarım: `renewalsLeft` "uzatma hakkı", erişim hakkı değil

### Guard Davranışı

```typescript
// BreakGlassGrantGuard SADECE şunları kontrol eder:
// 1. Token exp valid mi?
// 2. Grant DB'de ACTIVE mi?
// 3. Actor authorized mı?

// Guard renewalsLeft'i KONTROL ETMEZ
// renewalsLeft sadece renew API'de enforce edilir
```

## Entry Gates (Defense in Depth)

Cross-tenant erişim için 4 kapı geçilmeli:

```
┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐
│   VPN    │→ │internal_ │→ │  ACTIVE  │→ │  actor-  │
│  only    │  │   ops    │  │  grant   │  │  bound   │
└──────────┘  └──────────┘  └──────────┘  └──────────┘
```

1. **VPN**: Network seviyesinde izolasyon
2. **internal_ops**: Role-based access control
3. **ACTIVE grant**: Onaylanmış ve süresi dolmamış grant
4. **actor-bound**: Token sadece belirli actor ID'leri için geçerli

## Circuit Breaker

Anomali durumlarında otomatik koruma:

```
┌──────────┐  ┌──────────┐  ┌──────────┐
│  CLOSED  │⇄ │   OPEN   │→ │HALF_OPEN │
│ (normal) │  │ (block)  │  │ (probe)  │
└──────────┘  └──────────┘  └──────────┘
```

**Triggers:**
- Error rate > 50%
- Latency p99 > 5s
- Manual activation

## Audit Layer

Tüm break-glass işlemleri append-only audit log'a yazılır:

```
REQUEST → GRANT → ACCESS → REVOKE
```

### Audit Events

| Event | Trigger |
|-------|---------|
| `CROSS_TENANT_ACCESS_REQUESTED` | Request oluşturulduğunda |
| `CROSS_TENANT_ACCESS_GRANTED` | Request onaylandığında |
| `CROSS_TENANT_ACCESS_DENIED` | Request reddedildiğinde |
| `CROSS_TENANT_ACCESS_USED` | Grant ile veri erişildiğinde |
| `CROSS_TENANT_ACCESS_EXPIRED` | Grant süresi dolduğunda |
| `CROSS_TENANT_ACCESS_REVOKED` | Grant iptal edildiğinde |

### Audit Failure Handling

```
Audit write fail → 500 (fail-closed)
3 consecutive failures → DEGRADED mode
```

Audit yazılamazsa işlem başarısız olur. Bu kasıtlı: audit olmadan erişim güvenlik iddiasını çökertiyor.

### DEGRADED Mode Behavior

DEGRADED modunda endpoint davranışları:

| Endpoint Type | Behavior | Reason |
|---------------|----------|--------|
| Management (request/approve/renew/revoke) | 503 | Audit required |
| Cross-tenant read | 503 | Audit required |
| Status/audit trail (GET) | 200 + `auditDegraded: true` | Ops visibility |

Recovery:
- **Auto-recovery**: 3 consecutive successful audit writes → HEALTHY
- **Manual reset**: `POST /break-glass/admin/reset` by ops
- Recommended: Manual reset after confirming audit store health

## Revocation Audit

Grant iptal edildiğinde ek bilgiler kaydedilir:

| Field | Description |
|-------|-------------|
| `revokedBy` | İptal eden actor ID |
| `revocationReason` | İptal nedeni enum |
| `description` | Opsiyonel açıklama (max 200 char, NO PII) |
| `revokedAt` | İptal zamanı |

**Revocation Reasons:**
- `manual`: Kullanıcı tarafından manuel iptal
- `expiry`: Süre dolumu
- `circuit_breaker`: Circuit breaker tetiklendi
- `security_incident`: Güvenlik olayı

**Description PII Safety:**
- Max 200 karakter
- TCKN (11 haneli numara) yasak
- Telefon numarası yasak
- Email adresi yasak
- Validation: `validateRevocationDescription()` fonksiyonu ile kontrol edilir

## Token Structure

Break-glass token'ları normal JWT'lerden farklıdır:

```typescript
{
  bg: true,                    // Break-glass flag
  jti: string,                 // Unique token ID (for replay detection)
  grantId: string,             // Grant referansı
  targetTenantId: string,      // Hedef tenant
  scopes: string[],            // İzin verilen scope'lar
  renewalsLeft: number,        // Kalan yenileme hakkı (informational)
  authorizedActors: string[],  // Actor binding (max 5)
  iss: 'break-glass-authority',
  aud: 'internal-ops',
  // ... standard JWT claims
}
```

## JTI Anomaly Detection

Token'ların `jti` (JWT ID) claim'i replay ve anomali tespiti için kullanılır:

### Tracked Anomalies

| Anomaly Type | Trigger | Action |
|--------------|---------|--------|
| `HIGH_USAGE` | Same jti > 100 uses in 5min | Metric + Alert |
| `MULTI_ACTOR` | Same jti used by 3+ actors | Metric + Alert |
| `RAPID_BURST` | Reserved for future | - |

### Important Notes

- Anomaly detection is **observability only** - does NOT block access
- Blocking would require policy decision and careful consideration
- Metrics emitted: `break_glass_jti_anomaly_detected`
- In production, jti tracking would use Redis with TTL

## Invariants

| Invariant | Enforcement |
|-----------|-------------|
| INV-1: No anonymous cross-tenant | Guard rejects if no valid token |
| INV-2: Actor binding | Token only valid for authorizedActors |
| INV-3: All grants audited | Every lifecycle event produces audit record |
| INV-4: Fail-closed | DB/audit errors → deny access |
| INV-5: Time-bounded | Max 15min TTL, max 3 renewals |

## Operational Procedures

### Audit Store Down

Eğer audit store erişilemezse:

1. `AUDIT_WRITE_FAILED` metriği emit edilir
2. Break-glass endpoints 503 döner
3. Security/ops alert tetiklenir
4. Incident prosedürü başlatılır

### Grant Revocation

Emergency revocation için:

```bash
# Manual revocation
POST /break-glass/grants/{grantId}/revoke
{
  "reason": "security_incident",
  "description": "Suspicious activity detected"
}
```

## Compliance Notes

- KVKK: Tüm erişimler audit log'da
- SOC2: Append-only audit trail
- ISO27001: Role-based access + time-bounded grants


---

## Ops Playbook: Audit Store Down

### Symptoms

- `break_glass_audit_write_failed_total` metric increasing
- Break-glass endpoints returning 503
- Logs showing `AUDIT_WRITE_FAILED` entries

### Immediate Actions

1. **Verify audit store status**
   ```bash
   # Check audit store connectivity
   curl -X GET /internal/health/audit
   ```

2. **Check metrics**
   ```bash
   # Prometheus query
   break_glass_audit_write_failed_total{job="api"}
   ```

3. **Review recent failures**
   ```bash
   # Log query
   grep "AUDIT_WRITE_FAILED" /var/log/api/*.log | tail -20
   ```

### Recovery Steps

1. **If audit store is down:**
   - Escalate to infrastructure team
   - DO NOT bypass audit requirement
   - Break-glass will auto-recover when audit store is back

2. **If network issue:**
   - Check firewall rules
   - Verify DNS resolution
   - Check TLS certificates

3. **If capacity issue:**
   - Scale audit store
   - Check disk space
   - Review retention policies

### Post-Incident

1. Create incident ticket
2. Document timeline
3. Review audit logs for any gaps
4. Update runbook if needed

### Contact

- Primary: Security Team (#security-oncall)
- Secondary: Platform Team (#platform-oncall)
- Escalation: Security Lead

---

## Metrics Reference

| Metric | Description | Alert Threshold |
|--------|-------------|-----------------|
| `break_glass_audit_write_failed_total` | Total audit write failures | > 0 in 5m |
| `break_glass_jti_anomaly_detected` | JTI anomaly detected | > 0 |
| `break_glass_grant_issued_total` | Total grants issued | N/A (info) |
| `break_glass_grant_revoked_total` | Total grants revoked | N/A (info) |
| `break_glass_access_used_total` | Total cross-tenant accesses | N/A (info) |
| `break_glass_circuit_breaker_state` | Circuit breaker state | OPEN |

## Changelog

- **v1.2**: Added DEGRADED mode behavior table, PII validation for revocation description, auto-recovery with 3 consecutive successes, manual reset capability
- **v1.1**: Added jti claim for replay detection, JtiAnomalyDetectorService
- **v1.0**: Initial security architecture with authority model, revocation audit, controlled shutdown

---

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                      BREAK-GLASS SECURITY LAYER v1.2                        │
├─────────────────────────────────────────────────────────────────────────────┤
│  ENTRY GATES (Defense in Depth)                                             │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐      │
│  │   VPN    │→ │internal_ │→ │  ACTIVE  │→ │  actor-  │→ │  audit   │      │
│  │  only    │  │   ops    │  │  grant   │  │  bound   │  │ HEALTHY  │      │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘  └──────────┘      │
├─────────────────────────────────────────────────────────────────────────────┤
│  AUTHORITY MODEL                                                            │
│  ┌─────────────────────────────────┐  ┌─────────────────────────────────┐  │
│  │       ACCESS AUTHORITY          │  │      RENEWAL AUTHORITY          │  │
│  │   exp valid + grant ACTIVE      │  │      renewalsLeft > 0           │  │
│  └─────────────────────────────────┘  └─────────────────────────────────┘  │
├─────────────────────────────────────────────────────────────────────────────┤
│  CIRCUIT BREAKER                                                            │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐                                  │
│  │  CLOSED  │⇄ │   OPEN   │→ │HALF_OPEN │                                  │
│  │ (normal) │  │ (block)  │  │ (probe)  │                                  │
│  └──────────┘  └──────────┘  └──────────┘                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│  AUDIT LAYER (append-only, fail-safe)                                       │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  REQUEST → GRANT → ACCESS → REVOKE                                    │ │
│  │                                                                       │ │
│  │  Health States:                                                       │ │
│  │  ┌─────────┐  3 failures  ┌──────────┐  3 successes  ┌─────────┐     │ │
│  │  │ HEALTHY │ ──────────→  │ DEGRADED │ ───────────→  │ HEALTHY │     │ │
│  │  └─────────┘              └──────────┘  or manual    └─────────┘     │ │
│  │                                ↓                                      │ │
│  │                           503 on all                                  │ │
│  │                        management ops                                 │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│  JTI ANOMALY DETECTION (observability only)                                 │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  HIGH_USAGE: >100 uses/5min → metric + audit event                    │ │
│  │  MULTI_ACTOR: 3+ actors same jti → metric + audit event (HIGH sev)    │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────────────────────┤
│  REVOCATION AUDIT                                                           │
│  ┌───────────────────────────────────────────────────────────────────────┐ │
│  │  revokedBy | reason | description (max 200, NO PII) | revokedAt       │ │
│  │  reasons: manual | expiry | circuit_breaker | security_incident       │ │
│  │  PII validation: TCKN, phone, email patterns blocked                  │ │
│  └───────────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────────────┘
```

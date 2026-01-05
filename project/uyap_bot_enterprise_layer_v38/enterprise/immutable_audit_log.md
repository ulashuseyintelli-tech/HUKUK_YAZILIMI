## Immutable Audit Log

Amaç: Sonradan değiştirilemeyen (append-only) log.

Model:
- AuditEvent
  - id
  - tenant_id
  - case_id
  - actor (user/system)
  - event_type
  - payload_json
  - prev_hash
  - hash
  - created_at

Kural:
- Yeni event hash = sha256(prev_hash + payload_json + created_at)
- Export sırasında chain doğrulaması yapılır.

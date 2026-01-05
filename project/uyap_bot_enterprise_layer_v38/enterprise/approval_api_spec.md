## Approval API (taslak)

- POST /api/approvals/request/
  body: {case_id, job_id, reason}
- POST /api/approvals/{id}/decide/
  body: {decision: APPROVE|REJECT, note}
- GET /api/approvals/?status=PENDING

Çalışma:
- Scheduler high_impact_write job dispatch etmeden önce:
  - approval var mı kontrol eder
  - yoksa job BLOCKED + approval_request açar

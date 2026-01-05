# UYAP Bot v30 – Debtor-Scoped Planning + Per-Recipe Interval + Adaptive Scheduling

Yeni:
1) Plan bundle genişledi:
   - recipe bazında interval_seconds
   - scope: case | debtor

2) Adaptive scheduling:
   - core/adaptive_scheduler.py
   - Son X saat fail rate yükselirse interval otomatik büyür (1.5x / 2x)

3) Orchestrator:
   - core/orchestrator_v14.py artık debtor-scoped job üretir.

Plan örneği:
- core/example_plan.yaml

Tarih: 2026-01-04

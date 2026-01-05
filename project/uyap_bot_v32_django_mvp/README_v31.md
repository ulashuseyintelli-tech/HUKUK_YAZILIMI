# UYAP Bot v31 – Priority + Quotas (Queue Policy)

Yeni:
1) JobRun.priority alanı (düşük sayı = yüksek öncelik)
2) Plan bundle recipe'lerine priority eklenebilir.
3) Queue policy bundle (ParamBundle bundle_kind='queue_policy'):
   - global_concurrency
   - per_case_concurrency
   - per_case_write_concurrency
   - risk_queues max_running

Dosyalar:
- core/queue_policy_loader.py
- core/example_queue_policy.yaml
- core/scheduler.py (quota + priority dispatch)

Not:
- JobRun.priority için migrate gerekir.

Tarih: 2026-01-04

# UYAP Bot v32 – Ops API + Pause/Cancel + SLA Boost

Yeni:
1) Ops API:
   - GET /api/ops/queue_dashboard/
   - POST /api/ops/pause_recipe/  {recipe_id, reason}
   - POST /api/ops/unpause_recipe/ {recipe_id}
   - POST /api/ops/cancel_job/ {job_id}
   -> core/api_views_ops.py

2) RecipePause modeli:
   - Admin'den veya ops API ile recipe pause/unpause
   - Orchestrator paused recipe'leri planlamaz.

3) SLA Boost (opsiyonel):
   - ParamBundle bundle_kind='sla_policy' ACTIVE
   - Bekleyen job stage'e göre max_age aşınca priority boost alır.

Not:
- RecipePause modeli için migrate gerekir.

Tarih: 2026-01-05

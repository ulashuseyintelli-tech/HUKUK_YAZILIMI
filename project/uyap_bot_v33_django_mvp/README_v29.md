# UYAP Bot v29 – Plan Bundle (DAG/Planning) DB-backed

Yeni:
- Orchestrator planlama artık hardcode değil.
- ParamBundle bundle_kind='plan' ACTIVE içerik, stage bazlı hangi recipe'lerin koşacağını belirler.
- De-dup / cooldown: aynı recipe sürekli enqueue edilmez.

Dosyalar:
- core/plan_loader.py
- core/orchestrator_v14.py (plan_for_case updated)
- core/example_plan.yaml

Kurulum:
1) Admin'den ParamBundle oluştur:
   - name: plan_v1
   - bundle_kind: plan
   - content: core/example_plan.yaml
   - status: active

Scheduler tick -> plan_for_case -> plan bundle'a göre job üretir.

Tarih: 2026-01-04

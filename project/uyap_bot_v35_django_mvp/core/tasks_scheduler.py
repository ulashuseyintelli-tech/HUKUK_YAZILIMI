from celery import shared_task
from core.scheduler import plan_and_enqueue_for_all_cases

@shared_task
def tick_plan_and_enqueue(limit: int = 200) -> dict:
    created = plan_and_enqueue_for_all_cases(limit=limit)
    return {"created_jobs": created}

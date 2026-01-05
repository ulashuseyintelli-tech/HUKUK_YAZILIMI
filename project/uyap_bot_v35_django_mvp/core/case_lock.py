from django.db import transaction
from core.models import Case, CaseRunLock

def acquire_case_lock(case: Case, job_id: int, reason: str) -> bool:
    with transaction.atomic():
        lock, _ = CaseRunLock.objects.select_for_update().get_or_create(case=case)
        if lock.is_locked:
            return False
        lock.is_locked = True
        lock.locked_by_job_id = job_id
        lock.lock_reason = reason
        lock.save(update_fields=["is_locked","locked_by_job_id","lock_reason","updated_at"])
        return True

def release_case_lock(case: Case, job_id: int) -> None:
    with transaction.atomic():
        lock, _ = CaseRunLock.objects.select_for_update().get_or_create(case=case)
        if lock.is_locked and lock.locked_by_job_id == job_id:
            lock.is_locked = False
            lock.locked_by_job_id = None
            lock.lock_reason = None
            lock.save(update_fields=["is_locked","locked_by_job_id","lock_reason","updated_at"])

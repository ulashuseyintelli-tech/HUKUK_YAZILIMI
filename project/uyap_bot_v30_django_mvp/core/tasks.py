from celery import shared_task
from core.models import JobRun, JobStatus
from core.recipe_runner import run_recipe, RunnerError

@shared_task
def run_job(job_id: int) -> dict:
    job = JobRun.objects.select_related("case").get(id=job_id)
    try:
        return run_recipe(job)
    except RunnerError as e:
        job.status = JobStatus.FAILED
        job.last_error_code = "RUNNER_ERROR"
        job.last_error_message = str(e)
        job.save(update_fields=["status","last_error_code","last_error_message"])
        return {"job_id": job.id, "status": job.status, "error": str(e)}
    except Exception as e:
        job.status = JobStatus.FAILED
        job.last_error_code = "UNEXPECTED"
        job.last_error_message = str(e)
        job.save(update_fields=["status","last_error_code","last_error_message"])
        return {"job_id": job.id, "status": job.status, "error": str(e)}

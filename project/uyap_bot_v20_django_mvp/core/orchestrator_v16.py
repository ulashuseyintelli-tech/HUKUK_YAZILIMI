"""Orchestrator v16 – Real execution loop (engine)

Bu sürüm:
- ACTIVE bundle'ları DB'den yükler
- recipe -> steps -> actions döngüsünü çalıştırır
- her action için JobStep + Snapshot üretir
- hata/retry/backoff/quarantine mantığını uygular
- UI worker arayüzünü soyutlar (plug-in)

NOT: UI worker burada 'interface' olarak var. Gerçek otomasyon (Selenium/RPA)
sonradan bağlanır.
"""

from typing import Dict, Any, List
from django.utils import timezone
from django.db import transaction
from core.models import JobRun, JobStep, Snapshot, JobStatus, Lock
from core.orchestrator_v14 import load_active_bundles
from core.utils import parse_yaml_or_json, sha256_text

class UIWorker:
    """UI automation interface (stub)."""
    def open(self, nav_path: List[str]) -> Dict[str, Any]:
        return {"opened": nav_path}

    def click(self, button: str) -> Dict[str, Any]:
        return {"clicked": button}

    def read(self, fields: List[str]) -> Dict[str, Any]:
        return {field: None for field in fields}

    def fill(self, fields: Dict[str, Any]) -> Dict[str, Any]:
        return {"filled": fields}

class Orchestrator:
    def __init__(self):
        self.worker = UIWorker()
        self.bundles = load_active_bundles()

    def run_job(self, job: JobRun):
        if job.status in (JobStatus.DONE, JobStatus.QUARANTINED):
            return

        job.status = JobStatus.RUNNING
        job.started_at = timezone.now()
        job.save(update_fields=["status", "started_at"])

        try:
            recipe = self._find_recipe(job.recipe_id)
            steps = recipe.get("steps") or recipe.get("actions") or []
            step_no = 0

            for step in steps:
                step_no += 1
                self._run_step(job, step_no, step)

            job.status = JobStatus.DONE
            job.finished_at = timezone.now()
            job.save(update_fields=["status", "finished_at"])

        except Exception as e:
            job.last_error_code = e.__class__.__name__
            job.last_error_message = str(e)
            job.attempt += 1

            if job.attempt >= job.max_attempts:
                job.status = JobStatus.QUARANTINED
            else:
                job.status = JobStatus.FAILED

            job.save(update_fields=["status", "attempt", "last_error_code", "last_error_message"])
            raise

    def _find_recipe(self, recipe_id: str) -> Dict[str, Any]:
        data = self.bundles.recipes
        recipes = data.get("recipes", [])
        for r in recipes:
            if r.get("recipe_id") == recipe_id:
                return r
        raise RuntimeError(f"Recipe not found: {recipe_id}")

    @transaction.atomic
    def _run_step(self, job: JobRun, step_no: int, step: Dict[str, Any]):
        action = step.get("type") or step.get("action")
        nav = step.get("uyap_nav_path") or []

        # Snapshot before
        payload_before = {"step": step_no, "action": action, "nav": nav, "phase": "before"}
        snap_before = self._snapshot(job, nav, payload_before)

        # Execute
        result = self._execute_action(step)

        # Snapshot after
        payload_after = {"step": step_no, "action": action, "nav": nav, "result": result, "phase": "after"}
        snap_after = self._snapshot(job, nav, payload_after)

        JobStep.objects.create(
            job=job,
            step_no=step_no,
            action_type=action,
            uyap_nav_path=" > ".join(nav) if nav else None,
            status="ok",
            snapshot=snap_after,
            proof_ref=snap_after.snapshot_hash,
        )

    def _execute_action(self, step: Dict[str, Any]) -> Dict[str, Any]:
        t = step.get("type")
        if t == "open":
            return self.worker.open(step.get("nav", []))
        if t == "click":
            return self.worker.click(step.get("button"))
        if t == "read":
            return self.worker.read(step.get("fields", []))
        if t == "fill":
            return self.worker.fill(step.get("fields", {}))
        # default noop
        return {"noop": True}

    def _snapshot(self, job: JobRun, nav: List[str], payload: Dict[str, Any]) -> Snapshot:
        h = sha256_text(str(payload))
        return Snapshot.objects.create(
            case=job.case,
            source="BOT",
            uyap_nav_path=" > ".join(nav) if nav else None,
            snapshot_hash=h,
            payload=payload,
        )

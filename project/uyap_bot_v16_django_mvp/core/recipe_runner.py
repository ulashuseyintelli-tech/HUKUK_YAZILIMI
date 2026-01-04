import json, hashlib
from typing import Any, Dict, List, Optional
from django.utils import timezone
from core.models import RecipeBundle, ParamBundle, UiMapBundle, Snapshot, JobRun, JobStep, JobStatus
from core.utils import parse_yaml_or_json

def _hash(obj: Dict[str, Any]) -> str:
    b = json.dumps(obj, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return hashlib.sha256(b).hexdigest()

class RunnerError(Exception):
    pass

def load_active():
    rb = RecipeBundle.objects.filter(status="active").order_by("-version").first()
    pb = ParamBundle.objects.filter(status="active").order_by("-version").first()
    ub = UiMapBundle.objects.filter(status="active").order_by("-version").first()
    if not (rb and pb and ub):
        raise RunnerError("Missing ACTIVE bundles (recipe/params/uimap).")
    return (
        parse_yaml_or_json(rb.content),
        parse_yaml_or_json(pb.content),
        parse_yaml_or_json(ub.content),
    )

def find_recipe(recipes_pack: Dict[str, Any], recipe_id: str) -> Dict[str, Any]:
    # pack may be {'recipes': [...]} or custom
    recipes = recipes_pack.get("recipes")
    if not isinstance(recipes, list):
        raise RunnerError("ACTIVE RecipeBundle must contain top-level 'recipes' list.")
    for r in recipes:
        if isinstance(r, dict) and r.get("recipe_id") == recipe_id:
            return r
    raise RunnerError(f"Recipe not found: {recipe_id}")

def run_recipe(job: JobRun) -> Dict[str, Any]:
    recipes_pack, params_pack, uimap_pack = load_active()
    recipe = find_recipe(recipes_pack, job.recipe_id)

    # Prepare job
    job.status = JobStatus.RUNNING
    job.started_at = timezone.now()
    job.attempt = (job.attempt or 0) + 1
    job.save(update_fields=["status", "started_at", "attempt"])

    actions = recipe.get("actions") or []
    if not isinstance(actions, list):
        actions = []

    # Step 0: record recipe meta snapshot
    meta_payload = {
        "recipe_id": job.recipe_id,
        "recipe_version": recipe.get("version"),
        "uyap_nav_path": recipe.get("uyap_nav_path"),
        "params_loaded": True,
        "uimap_loaded": True,
    }
    snap0 = Snapshot.objects.create(
        case=job.case,
        source="RUNNER",
        uyap_nav_path=" > ".join(recipe.get("uyap_nav_path") or ["(none)"]),
        snapshot_hash=_hash(meta_payload),
        payload=meta_payload,
    )
    JobStep.objects.create(job=job, step_no=0, action_type="recipe_meta", uyap_nav_path=snap0.uyap_nav_path, status="ok", snapshot=snap0, proof_ref=snap0.snapshot_hash)

    # Execute actions as STUB (no real UI yet)
    step_no = 1
    for act in actions:
        payload = {"action": act, "status": "stub_executed"}
        snap = Snapshot.objects.create(
            case=job.case,
            source="RUNNER_STUB",
            uyap_nav_path="(stub action)",
            snapshot_hash=_hash(payload),
            payload=payload,
        )
        JobStep.objects.create(job=job, step_no=step_no, action_type=str(act.get("type", "action")), uyap_nav_path=snap.uyap_nav_path, status="ok", snapshot=snap, proof_ref=snap.snapshot_hash)
        step_no += 1

    job.status = JobStatus.DONE
    job.finished_at = timezone.now()
    job.save(update_fields=["status", "finished_at"])
    return {"job_id": job.id, "status": job.status, "steps": step_no}

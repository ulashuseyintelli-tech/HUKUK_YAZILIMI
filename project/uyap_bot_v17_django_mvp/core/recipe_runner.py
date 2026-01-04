import json, hashlib
from typing import Any, Dict, List, Optional
from django.utils import timezone
from core.models import RecipeBundle, ParamBundle, UiMapBundle, Snapshot, JobRun, JobStep, JobStatus
from core.utils import parse_yaml_or_json
from core.ui_worker import MockUiWorker, UiWorker, UiResult

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
    recipes = recipes_pack.get("recipes")
    if not isinstance(recipes, list):
        raise RunnerError("ACTIVE RecipeBundle must contain top-level 'recipes' list.")
    for r in recipes:
        if isinstance(r, dict) and r.get("recipe_id") == recipe_id:
            return r
    raise RunnerError(f"Recipe not found: {recipe_id}")

def _snapshot(job: JobRun, source: str, nav: str, payload: Dict[str, Any]) -> Snapshot:
    return Snapshot.objects.create(
        case=job.case,
        source=source,
        uyap_nav_path=nav,
        snapshot_hash=_hash(payload),
        payload=payload,
    )

def run_recipe(job: JobRun, ui_worker: Optional[UiWorker] = None) -> Dict[str, Any]:
    recipes_pack, params_pack, uimap_pack = load_active()
    recipe = find_recipe(recipes_pack, job.recipe_id)

    ui_worker = ui_worker or MockUiWorker(uimap_pack)

    job.status = JobStatus.RUNNING
    job.started_at = timezone.now()
    job.attempt = (job.attempt or 0) + 1
    job.save(update_fields=["status", "started_at", "attempt"])

    nav_path = recipe.get("uyap_nav_path") or ["(none)"]
    meta_payload = {
        "recipe_id": job.recipe_id,
        "recipe_version": recipe.get("version"),
        "uyap_nav_path": nav_path,
        "runner": "v17",
    }
    snap0 = _snapshot(job, "RUNNER", " > ".join(nav_path), meta_payload)
    JobStep.objects.create(job=job, step_no=0, action_type="recipe_meta", uyap_nav_path=snap0.uyap_nav_path, status="ok", snapshot=snap0, proof_ref=snap0.snapshot_hash)

    # Step 0.5: navigate
    nav_res = ui_worker.navigate(nav_path)
    snap_nav = _snapshot(job, "UI_WORKER", " > ".join(nav_path), {"op": "navigate", "result": nav_res.data, "evidence": nav_res.evidence, "ok": nav_res.ok, "error": nav_res.error})
    JobStep.objects.create(job=job, step_no=1, action_type="navigate", uyap_nav_path=snap_nav.uyap_nav_path, status="ok" if nav_res.ok else "error", snapshot=snap_nav, proof_ref=snap_nav.snapshot_hash)
    if not nav_res.ok:
        raise RunnerError(f"UI navigate failed: {nav_res.error}")

    actions = recipe.get("actions") or []
    if not isinstance(actions, list):
        actions = []

    step_no = 2
    for act in actions:
        if not isinstance(act, dict):
            continue
        t = act.get("type")
        res: UiResult
        if t == "click":
            res = ui_worker.click(act.get("button") or act.get("button_key") or "BTN_UNKNOWN")
        elif t == "fill_form":
            res = ui_worker.fill_form(act.get("fields") or {})
        elif t == "read_table":
            res = ui_worker.read_table(act.get("table") or "TABLE_UNKNOWN", act.get("filters"))
        elif t == "select_row":
            res = ui_worker.select_row(act.get("table") or "TABLE_UNKNOWN", act.get("where") or {})
        elif t == "query":
            # treat query as read_table placeholder
            res = ui_worker.read_table(act.get("table") or "TABLE_QUERY", act.get("input"))
        else:
            res = UiResult(ok=True, data={"noop": t, "act": act}, evidence={}, error=None)

        snap = _snapshot(job, "UI_WORKER", "(action)", {"action": act, "result": res.data, "evidence": res.evidence, "ok": res.ok, "error": res.error})
        JobStep.objects.create(job=job, step_no=step_no, action_type=str(t or "action"), uyap_nav_path=snap.uyap_nav_path, status="ok" if res.ok else "error", snapshot=snap, proof_ref=snap.snapshot_hash)
        if not res.ok:
            raise RunnerError(f"UI action failed at step {step_no}: {res.error}")
        step_no += 1

    job.status = JobStatus.DONE
    job.finished_at = timezone.now()
    job.save(update_fields=["status", "finished_at"])
    return {"job_id": job.id, "status": job.status, "steps": step_no}

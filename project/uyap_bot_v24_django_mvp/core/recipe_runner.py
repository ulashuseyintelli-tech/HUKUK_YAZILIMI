import json, hashlib, os
from typing import Any, Dict, List, Optional
from django.utils import timezone
from core.models import RecipeBundle, ParamBundle, UiMapBundle, Snapshot, JobRun, JobStep, JobStatus
from core.utils import parse_yaml_or_json
from core.ui_worker import MockUiWorker, UiWorker, UiResult
from core.real_ui_worker_playwright import PlaywrightUiWorker, PlaywrightConfig
from core.degraded_mode import is_degraded_mode
from core.case_lock import acquire_case_lock, release_case_lock
from core.selector_health import auto_toggle_degraded_mode
from core.extractor_engine import run_extractors
from core.decision_engine import enqueue_for_fact

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
        screenshot_path=(payload.get("evidence") or {}).get("screenshot_path") if isinstance(payload.get("evidence"), dict) else None
    )

def _get_ui_worker(uimap_pack: Dict[str, Any], recipe_id: str) -> UiWorker:
    if os.environ.get("REAL_UI", "0") == "1":
        cfg = PlaywrightConfig(
            headless=os.environ.get("PW_HEADLESS", "1") == "1",
            base_url=os.environ.get("PW_BASE_URL"),
            slow_mo_ms=int(os.environ.get("PW_SLOWMO_MS", "0")),
        )
        w = PlaywrightUiWorker(uimap_pack, cfg, recipe_id=recipe_id)
        w.start()
        return w
    return MockUiWorker(uimap_pack)

def run_recipe(job: JobRun, ui_worker: Optional[UiWorker] = None) -> Dict[str, Any]:
    # auto-toggle degraded mode based on selector health
    try:
        auto_toggle_degraded_mode()
    except Exception:
        pass

    recipes_pack, params_pack, uimap_pack = load_active()
    recipe = find_recipe(recipes_pack, job.recipe_id)

    if is_degraded_mode() and job.risk_level in ("high_impact_write", "controlled_write"):
        job.status = JobStatus.BLOCKED
        job.lock_blocked_by = "DEGRADED_MODE"
        job.save(update_fields=["status","lock_blocked_by"])
        return {"job_id": job.id, "status": job.status, "blocked_by": "DEGRADED_MODE"}

    # Case-level lock for write jobs
    if job.risk_level in ("high_impact_write","controlled_write"):
        ok = acquire_case_lock(job.case, job.id, reason=f"write_job:{job.recipe_id}")
        if not ok:
            job.status = JobStatus.BLOCKED
            job.lock_blocked_by = "CASE_LOCKED"
            job.save(update_fields=["status","lock_blocked_by"])
            return {"job_id": job.id, "status": job.status, "blocked_by": "CASE_LOCKED"}

    ui_worker = ui_worker or _get_ui_worker(uimap_pack, recipe_id=job.recipe_id)
    close_ui = hasattr(ui_worker, "stop")

    try:
        job.status = JobStatus.RUNNING
        job.started_at = timezone.now()
        job.attempt = (job.attempt or 0) + 1
        job.save(update_fields=["status", "started_at", "attempt"])

        nav_path = recipe.get("uyap_nav_path") or ["(none)"]
        meta_payload = {"recipe_id": job.recipe_id, "recipe_version": recipe.get("version"), "uyap_nav_path": nav_path, "runner": "v20", "degraded_mode": is_degraded_mode()}
        snap0 = _snapshot(job, "RUNNER", " > ".join(nav_path), meta_payload)
        JobStep.objects.create(job=job, step_no=0, action_type="recipe_meta", uyap_nav_path=snap0.uyap_nav_path, status="ok", snapshot=snap0, proof_ref=snap0.snapshot_hash)

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
                res = ui_worker.read_table(act.get("table") or "TABLE_QUERY", act.get("input"))
            elif t == "wait_for" and hasattr(ui_worker, "wait_for"):
                res = ui_worker.wait_for(act.get("selector") or act.get("selector_key") or "SEL_UNKNOWN", int(act.get("timeout_ms") or 10000))  # type: ignore
            elif t == "expect_text" and hasattr(ui_worker, "expect_text"):
                res = ui_worker.expect_text(act.get("selector") or act.get("selector_key") or "SEL_UNKNOWN", str(act.get("text") or ""), int(act.get("timeout_ms") or 10000))  # type: ignore
            elif t == "download_file" and hasattr(ui_worker, "download_file"):
                res = ui_worker.download_file(act.get("button") or act.get("button_key") or "BTN_DOWNLOAD")  # type: ignore
            elif t == "upload_file" and hasattr(ui_worker, "upload_file"):
                res = ui_worker.upload_file(act.get("field") or act.get("field_key") or "FIELD_UPLOAD", act.get("file_path") or "")  # type: ignore
            else:
                res = UiResult(ok=True, data={"noop": t, "act": act}, evidence={}, error=None)

            snap = _snapshot(job, "UI_WORKER", "(action)", {"action": act, "result": res.data, "evidence": res.evidence, "ok": res.ok, "error": res.error})
            JobStep.objects.create(job=job, step_no=step_no, action_type=str(t or "action"), uyap_nav_path=snap.uyap_nav_path, status="ok" if res.ok else "error", snapshot=snap, proof_ref=snap.snapshot_hash)

            # v23: extractor + decision hook for read_table/query actions
            if res.ok and t in ("read_table", "query") and isinstance(res.data, dict) and isinstance(res.data.get("rows"), list):
                extractor_specs = act.get("extractors") or []
                if isinstance(extractor_specs, list) and extractor_specs:
                    created = run_extractors(job.case, job.debtor, extractor_specs, res.data.get("rows") or [], snap)
                    if created > 0:
                        fact_types = list(set([s.get("fact_type") for s in extractor_specs if isinstance(s, dict) and s.get("fact_type")]))
                        for ft in [ft for ft in fact_types if ft]:
                            enqueue_for_fact(job.case, job.debtor, ft)

            if not res.ok:
                raise RunnerError(f"UI action failed at step {step_no}: {res.error}")
            step_no += 1

        job.status = JobStatus.DONE
        job.finished_at = timezone.now()
        job.save(update_fields=["status", "finished_at"])
        return {"job_id": job.id, "status": job.status, "steps": step_no}
    finally:
        # release case lock
        try:
            release_case_lock(job.case, job.id)
        except Exception:
            pass
        if close_ui and hasattr(ui_worker, "stop"):
            try:
                ui_worker.stop()  # type: ignore
            except Exception:
                pass

"""Orchestrator v14 (DB-backed bundle loader)

Amaç:
- ACTIVE RecipeBundle/ParamBundle/UiMapBundle içeriklerini yükle
- Case/Locks/Stage'e göre hangi job'ların çalışacağını planla (DAG mantığı)
- Bu sürümde: gerçek UI automation yok; sadece 'planlama' ve 'audit export' iskeleti.

Bu dosya, v1-v12 blueprint dosyalarını DB'de yönetebilmen için kritik.
"""

from dataclasses import dataclass
from typing import Any, Dict, List, Optional
from django.utils import timezone
from core.models import RecipeBundle, ParamBundle, UiMapBundle, Case, JobRun, JobStatus
from core.utils import parse_yaml_or_json

@dataclass
class LoadedBundles:
    recipes: Dict[str, Any]
    params: Dict[str, Any]
    uimap: Dict[str, Any]

def load_active_bundles() -> LoadedBundles:
    rb = RecipeBundle.objects.filter(status="active").order_by("-version").first()
    pb = ParamBundle.objects.filter(status="active").order_by("-version").first()
    ub = UiMapBundle.objects.filter(status="active").order_by("-version").first()

    if not (rb and pb and ub):
        raise RuntimeError("ACTIVE bundles missing: recipe/params/uimap must each have an active version.")

    recipes = parse_yaml_or_json(rb.content)
    params = parse_yaml_or_json(pb.content)
    uimap = parse_yaml_or_json(ub.content)
    return LoadedBundles(recipes=recipes, params=params, uimap=uimap)

def enqueue_job(case: Case, recipe_id: str, risk_level: str="read_only") -> JobRun:
    job = JobRun.objects.create(
        case=case,
        debtor=None,
        recipe_id=recipe_id,
        recipe_version=1,
        status=JobStatus.QUEUED,
        risk_level=risk_level,
    )
    return job

def plan_for_case(case: Case) -> List[JobRun]:
    bundles = load_active_bundles()
    # MVP planlama: stage'e göre temel sync işleri
    planned: List[JobRun] = []
    stage = case.stage

    # örnek: her durumda Safahat senkronu + e-tebligat izleme
    base_recipes = ["EnsureUYAPSession", "SyncSafahatTimeline"]
    if stage in ("TEBLIGAT", "KESINLESME"):
        base_recipes.append("FetchPreparedETebligatlar_Debtor")

    for rid in base_recipes:
        planned.append(enqueue_job(case, rid, risk_level="read_only"))

    return planned

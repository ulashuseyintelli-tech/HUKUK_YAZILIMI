from __future__ import annotations
from typing import Dict, List, Optional
from core.models import Case, Debtor, JobRun, JobStatus, RiskLevel

# v23 MVP: hardcoded mapping. Next: load decision rules from ParamBundle.
FACT_TO_RECIPES = {
    "AssetFound": ["FetchPriorLiens_Vehicle", "EstimateVehicleValue_AI"],
    "LienSnapshot": ["ComputeOurLienRank_Vehicle"],
    "ValuationEstimate": ["AnalyzeIK100ParticipationRisk"],
}

def enqueue_for_facts(case: Case, debtor: Optional[Debtor], fact_types: List[str]) -> List[JobRun]:
    jobs: List[JobRun] = []
    seen = set()
    for ft in fact_types:
        for rid in FACT_TO_RECIPES.get(ft, []):
            key = (case.id, debtor.id if debtor else None, rid)
            if key in seen:
                continue
            seen.add(key)
            jobs.append(JobRun.objects.create(
                case=case,
                debtor=debtor,
                recipe_id=rid,
                recipe_version=1,
                status=JobStatus.QUEUED,
                risk_level=RiskLevel.READ_ONLY,
            ))
    return jobs

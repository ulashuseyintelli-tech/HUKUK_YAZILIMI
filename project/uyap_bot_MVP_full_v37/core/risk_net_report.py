from __future__ import annotations
from typing import Dict, Any
from core.models import Case, Fact

def build_risk_net_report(case: Case) -> Dict[str, Any]:
    report: Dict[str, Any] = {"case_id": case.id, "assets": []}

    assets = Fact.objects.filter(case=case, fact_type="AssetFound")
    for a in assets:
        asset = {
            "asset": a.value,
            "risk": None,
            "expected_recovery": None,
        }
        r = Fact.objects.filter(case=case, fact_type="Computed", key="risk").order_by("-created_at").first()
        if r:
            asset["risk"] = r.value
        e = Fact.objects.filter(case=case, fact_type="Computed", key="expected_recovery").order_by("-created_at").first()
        if e:
            asset["expected_recovery"] = e.value
        report["assets"].append(asset)
    return report

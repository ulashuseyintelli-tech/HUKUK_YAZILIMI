from __future__ import annotations
from typing import Any, Dict

def risk_scoring(context: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    # params expected: weights
    weights = params.get("risk", {}).get("weights", {"rank":0.35,"prior_claims":0.20,"uncertainty":0.20,"value_confidence":0.15,"lien_activity":0.10})

    rank_order = int(context.get("our_rank") or 1)
    value_mid = float(context.get("value_mid") or 0)
    confidence = float(context.get("confidence") or 0.5)
    prior_claims_estimate = context.get("prior_claims_estimate")
    unknown_amounts_count = int(context.get("unknown_amounts_count") or 0)
    unknown_activity_count = int(context.get("unknown_activity_count") or 0)
    missing_rank_info = bool(context.get("missing_rank_info") or False)
    active_prior_liens_count = int(context.get("active_prior_liens_count") or 0)

    rank_risk = min(100.0, max(0.0, (rank_order - 1) * 20.0))
    if prior_claims_estimate is None or value_mid <= 0:
        prior_claims_risk = 60.0
    else:
        ratio = float(prior_claims_estimate) / max(1.0, value_mid)
        prior_claims_risk = min(100.0, ratio * 100.0)

    uncertainty = 0.0
    if unknown_amounts_count > 0:
        uncertainty += 30.0
    if unknown_activity_count > 0:
        uncertainty += 30.0
    if missing_rank_info:
        uncertainty += 25.0
    uncertainty_risk = min(100.0, uncertainty)

    value_confidence_risk = min(100.0, (1.0 - confidence) * 100.0)

    if active_prior_liens_count == 0:
        lien_activity_risk = 10.0
    elif active_prior_liens_count <= 2:
        lien_activity_risk = 40.0
    else:
        lien_activity_risk = 70.0

    w = {
        "rank": float(weights.get("rank", 0.35)),
        "prior_claims": float(weights.get("prior_claims", 0.20)),
        "uncertainty": float(weights.get("uncertainty", 0.20)),
        "value_confidence": float(weights.get("value_confidence", 0.15)),
        "lien_activity": float(weights.get("lien_activity", 0.10)),
    }
    score = (
        w["rank"]*rank_risk +
        w["prior_claims"]*prior_claims_risk +
        w["uncertainty"]*uncertainty_risk +
        w["value_confidence"]*value_confidence_risk +
        w["lien_activity"]*lien_activity_risk
    )
    score = round(score, 1)
    return {"score": score, "components": {"rank": rank_risk, "prior_claims": prior_claims_risk, "uncertainty": uncertainty_risk, "value_confidence": value_confidence_risk, "lien_activity": lien_activity_risk}, "thresholds": params.get("risk", {})}

def recovery_simulator(context: Dict[str, Any], params: Dict[str, Any]) -> Dict[str, Any]:
    rec = params.get("recovery", params)
    min_net = float(rec.get("min_net_for_cost_actions", 25000))
    cost_budgets = rec.get("cost_budgets", {})

    value_low = float(context.get("value_low") or 0)
    value_mid = float(context.get("value_mid") or 0)
    value_high = float(context.get("value_high") or 0)
    liquidation_factor = float(context.get("liquidation_factor") or 0.7)
    prior_claims_estimate = float(context.get("prior_claims_estimate") or 0)
    estimated_costs = float(context.get("estimated_costs") or 0)

    def net(v):
        return max(0.0, v*liquidation_factor - prior_claims_estimate - estimated_costs)

    out = {
        "expected_net_low": round(net(value_low), 2),
        "expected_net_mid": round(net(value_mid), 2),
        "expected_net_high": round(net(value_high), 2),
        "min_net_for_cost_actions": min_net,
        "estimated_costs": estimated_costs,
        "prior_claims_estimate": prior_claims_estimate,
        "liquidation_factor": liquidation_factor,
    }
    out["flags"] = {"ok_for_cost_actions": out["expected_net_mid"] >= min_net}
    return out

from __future__ import annotations
from typing import Dict, List, Tuple

def score_selector(selector: str) -> float:
    # Heuristic stability score: id/name > role/text > class
    s = selector or ""
    score = 0.0
    if s.startswith("css=#"):
        score += 0.9
    elif "name='" in s or "name=" in s:
        score += 0.8
    elif s.startswith("css="):
        score += 0.6
    elif s.startswith("text="):
        score += 0.45
    else:
        score += 0.3

    # penalize very generic selectors
    if "tbody tr" in s or "div" == s.strip():
        score -= 0.15
    # bonus if includes attribute constraints
    if "[" in s and "]" in s:
        score += 0.1
    return max(0.0, min(1.0, score))

def rank_candidates(candidates: List[str]) -> List[Tuple[str, float]]:
    scored = [(c, score_selector(c)) for c in candidates if c]
    scored.sort(key=lambda x: x[1], reverse=True)
    return scored

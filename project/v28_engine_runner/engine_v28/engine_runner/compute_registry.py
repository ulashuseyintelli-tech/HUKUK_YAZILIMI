from __future__ import annotations
from typing import Any, Callable, Dict

ComputeFn = Callable[[Dict[str, Any]], Dict[str, Any]]

class ComputeRegistry:
    def __init__(self):
        self._fns: Dict[str, ComputeFn] = {}

    def register(self, name: str, fn: ComputeFn) -> None:
        self._fns[name] = fn

    def run(self, name: str, inp: Dict[str, Any]) -> Dict[str, Any]:
        if name not in self._fns:
            raise KeyError(f"Compute engine not registered: {name}")
        return self._fns[name](inp)

def default_registry() -> ComputeRegistry:
    reg = ComputeRegistry()

    # ---- Stubs: replace with real engines ----
    def RiskScoring(inp: Dict[str, Any]) -> Dict[str, Any]:
        # TODO: connect to your real scoring model/service
        return {"score": 73, "band": "MEDIUM", "model_version": "risk-stub-0.1"}

    def RecoverySimulator(inp: Dict[str, Any]) -> Dict[str, Any]:
        # TODO: connect to your real simulator
        return {"expected": 54000, "p50": 64000, "p90": 12000, "eta_days": 110, "model_version": "recovery-stub-0.1"}

    reg.register("RiskScoring", RiskScoring)
    reg.register("RecoverySimulator", RecoverySimulator)
    return reg

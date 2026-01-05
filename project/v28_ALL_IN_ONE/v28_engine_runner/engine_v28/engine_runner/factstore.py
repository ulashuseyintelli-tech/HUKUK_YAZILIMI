from __future__ import annotations
from dataclasses import dataclass
from typing import Any, Dict, Optional, Protocol, Tuple

@dataclass
class Snapshot:
    facts: Dict[str, Any]
    flags: Dict[str, Any]

class FactStore(Protocol):
    def get_snapshot(self, case_id: str) -> Snapshot:
        ...

    def write(self, case_id: str, facts: Dict[str, Any], flags: Dict[str, Any], *, meta: Dict[str, Any]) -> None:
        ...

class InMemoryFactStore:
    """Dev/test only."""
    def __init__(self):
        self._facts: Dict[str, Dict[str, Any]] = {}
        self._flags: Dict[str, Dict[str, Any]] = {}
        self._audit: list[dict] = []

    def get_snapshot(self, case_id: str) -> Snapshot:
        return Snapshot(
            facts=dict(self._facts.get(case_id, {})),
            flags=dict(self._flags.get(case_id, {})),
        )

    def write(self, case_id: str, facts: Dict[str, Any], flags: Dict[str, Any], *, meta: Dict[str, Any]) -> None:
        self._facts.setdefault(case_id, {}).update(facts)
        self._flags.setdefault(case_id, {}).update(flags)
        self._audit.append({"case_id": case_id, "facts": facts, "flags": flags, "meta": meta})

    @property
    def audit(self):
        return self._audit

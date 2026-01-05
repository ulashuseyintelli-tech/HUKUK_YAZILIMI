from __future__ import annotations
import hashlib
import json
from dataclasses import dataclass
from typing import Any, Dict, List, Optional, Tuple

import yaml
from django.db.models import Max

from .models import RulePack, Rule, RuleRevision

@dataclass
class LoadedRule:
    rule_key: str
    pack_name: str
    revision_id: str
    version: int
    sha256: str
    rule_dict: Dict[str, Any]

class RuleLoader:
    """In-process cached loader."""
    def __init__(self):
        self._cache: Dict[str, Tuple[str, List[LoadedRule]]] = {}  # pack_name -> (pack_etag, rules)

    def invalidate(self, pack_name: str | None = None):
        if pack_name:
            self._cache.pop(pack_name, None)
        else:
            self._cache.clear()

    def _pack_etag(self, pack: RulePack) -> str:
        # changes when pack updated; also include enabled rules count as a cheap signal
        return f"{pack.updated_at.isoformat()}:{pack.is_active}"

    def load_active(self, pack_name: str) -> List[LoadedRule]:
        pack = RulePack.objects.get(name=pack_name, is_active=True)
        etag = self._pack_etag(pack)

        cached = self._cache.get(pack_name)
        if cached and cached[0] == etag:
            return cached[1]

        # Load enabled rules with their latest revision
        rules = []
        for r in Rule.objects.filter(pack=pack, is_enabled=True).all():
            latest_ver = r.revisions.aggregate(m=Max("version"))["m"]
            if latest_ver is None:
                continue
            rev = r.revisions.get(version=latest_ver)
            rule_dict = yaml.safe_load(rev.yaml_text)
            rules.append(LoadedRule(
                rule_key=r.key,
                pack_name=pack_name,
                revision_id=str(rev.rev_id),
                version=rev.version,
                sha256=rev.sha256,
                rule_dict=rule_dict,
            ))

        self._cache[pack_name] = (etag, rules)
        return rules

LOADER = RuleLoader()

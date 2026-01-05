"""Patch points for EngineRunner to stamp rule revision metadata.

Usage idea:
- Instead of reading YAML from disk, load via RuleLoader (DB).
- For each LoadedRule, pass rule_dict into EngineRunner, and include meta:
  revision_id, sha256, version.

This file provides a helper to attach that meta before running.

You can apply by editing your EngineRunner.run_for_event to accept an optional
`rule_meta` dict and write it to EngineRun fields (extend model if you want),
or include in EngineRun.error/compute_summary, and/or Timeline entries.
"""
from __future__ import annotations
from typing import Any, Dict
import hashlib, json

def rule_sha256(rule_dict: Dict[str, Any]) -> str:
    b = json.dumps(rule_dict, sort_keys=True, ensure_ascii=False).encode("utf-8")
    return "sha256:" + hashlib.sha256(b).hexdigest()

def attach_meta(rule_dict: Dict[str, Any], meta: Dict[str, Any]) -> Dict[str, Any]:
    # non-invasive: place under top-level _meta
    r = dict(rule_dict)
    r["_meta"] = dict(meta)
    if "sha256" not in r["_meta"]:
        r["_meta"]["sha256"] = rule_sha256(rule_dict)
    return r

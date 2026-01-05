"""Config for UYAP ingestion demo.

RULE_PATHS: list of YAML rule paths to load and run for each event.
You can point to your real rules directory.
"""
import os

BASE_DIR = os.path.dirname(__file__)

RULE_PATHS = [
    os.path.join(BASE_DIR, "rules", "example_v27_rule.yaml"),
]

import hashlib
from django.core.management.base import BaseCommand
from engine_v28.rules.models import RulePack, Rule, RuleRevision

EXAMPLE_YAML = """version: v27
rule_id: post_asset_discovery
when:
  all:
    - fact: "case.status"
      op: "=="
      value: "finalized"
    - fact: "assets.vehicle.found"
      op: "=="
      value: true

then:
  compute:
    - name: risk
      run: RiskScoring
      input:
        case_id: "{{fact.case.id}}"
        debtor_id: "{{fact.debtor.id}}"
  decisions:
    - if: "get('compute.risk.score') >= 80"
      then:
        - action: open_lock
          payload:
            key: "case:{{fact.case.id}}:manual_review"
            ttl_sec: 86400
"""

def sha256(text: str) -> str:
    return "sha256:" + hashlib.sha256(text.encode("utf-8")).hexdigest()

class Command(BaseCommand):
    help = "Seed an example rule pack + rule + revision (v28)."

    def add_arguments(self, parser):
        parser.add_argument("--pack", type=str, default="uyap_default")
        parser.add_argument("--rule-key", type=str, default="post_asset_discovery")

    def handle(self, *args, **opts):
        pack_name = opts["pack"]
        rule_key = opts["rule_key"]

        pack, _ = RulePack.objects.get_or_create(name=pack_name, defaults={"is_active": True})
        rule, _ = Rule.objects.get_or_create(pack=pack, key=rule_key, defaults={"is_enabled": True})

        latest = rule.revisions.order_by("-version").first()
        next_ver = 1 if not latest else latest.version + 1

        rev = RuleRevision.objects.create(
            rule=rule,
            version=next_ver,
            yaml_text=EXAMPLE_YAML,
            sha256=sha256(EXAMPLE_YAML),
            created_by="seed",
            note="example seed"
        )
        self.stdout.write(self.style.SUCCESS(f"Seeded {pack_name}:{rule_key} v{next_ver} ({rev.sha256})"))

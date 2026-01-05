from django.core.management.base import BaseCommand
from django.db.models import Max
from engine_v28.rules.models import RulePack, Rule

class Command(BaseCommand):
    help = "Rollback a rule to previous version by pinning (requires pinned_version field)."

    def add_arguments(self, parser):
        parser.add_argument("--pack", type=str, required=True)
        parser.add_argument("--rule-key", type=str, required=True)

    def handle(self, *args, **opts):
        pack = RulePack.objects.get(name=opts["pack"])
        rule = Rule.objects.get(pack=pack, key=opts["rule_key"])

        if not hasattr(rule, "pinned_version"):
            raise SystemExit("Rule.pinned_version missing; apply model patch and migrate")

        latest = rule.revisions.aggregate(m=Max("version"))["m"]
        if not latest or latest <= 1:
            raise SystemExit("No previous version available")

        rule.pinned_version = latest - 1
        rule.save(update_fields=["pinned_version"])
        self.stdout.write(self.style.SUCCESS(f"Pinned {pack.name}:{rule.key} to v{rule.pinned_version}"))

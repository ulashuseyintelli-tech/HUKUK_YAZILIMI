from django.core.management.base import BaseCommand
from engine_v28.policy.models import PolicyRule

class Command(BaseCommand):
    help = "Seed first 5 policy rules (KVKK, high risk, no-email, quiet hours, irreversible actions)."

    def handle(self, *args, **opts):
        rules = [
            dict(
                name="KVKK_HOLD denies send_email",
                priority=1000,
                action_type="send_email",
                expr="flags.get('KVKK_HOLD') == True",
                decision="DENY",
                note="KVKK hold active: do not send email automatically."
            ),
            dict(
                name="CLIENT_NO_EMAIL denies send_email",
                priority=950,
                action_type="send_email",
                expr="flags.get('CLIENT_NO_EMAIL') == True",
                decision="DENY",
                note="Client preference: no email."
            ),
            dict(
                name="HIGH_RISK manualizes impactful actions",
                priority=900,
                action_type=None,
                expr="get('compute.risk.score') is not None and get('compute.risk.score') >= 70 and action_type in ['send_email','enqueue']",
                decision="MANUAL",
                manual_action_type="enqueue",
                manual_payload={"queue": "manual_review", "reason": "High risk policy gate"},
                note="Risk>=70: require manual review for impactful actions."
            ),
            dict(
                name="Quiet hours manualize send_email",
                priority=850,
                action_type="send_email",
                expr="True",
                decision="MANUAL",
                manual_action_type="enqueue",
                manual_payload={"queue": "manual_review", "reason": "Quiet hours: review before sending"},
                note="Operational policy: do not auto-send email at night."
            ),
            dict(
                name="Irreversible queues denied unless allow flag",
                priority=800,
                action_type="enqueue",
                expr="payload.get('queue') in ['uyap_submit','haciz_submit','icra_mudurlugu_submit'] and flags.get('ALLOW_IRREVERSIBLE') != True",
                decision="DENY",
                note="Block irreversible submissions unless explicitly allowed."
            ),
        ]

        created = 0
        updated = 0
        for r in rules:
            obj, was_created = PolicyRule.objects.get_or_create(name=r['name'], defaults=r)
            if was_created:
                created += 1
            else:
                for k, v in r.items():
                    setattr(obj, k, v)
                obj.save()
                updated += 1

        self.stdout.write(self.style.SUCCESS(f"Policy rules seeded. created={created} updated={updated}"))

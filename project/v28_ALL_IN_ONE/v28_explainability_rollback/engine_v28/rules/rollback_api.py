from __future__ import annotations
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from engine_v28.rules.models import RulePack, Rule, RuleRevision
from engine_v28.rules.loader import LOADER

class DisableRevisionView(APIView):
    """POST /rules/disable_revision {"revision_id":"..."}"""
    def post(self, request):
        rev_id = (request.data or {}).get("revision_id")
        if not rev_id:
            return Response({"error":"revision_id required"}, status=400)
        rev = RuleRevision.objects.get(rev_id=rev_id)
        # If you added is_disabled:
        if hasattr(rev, "is_disabled"):
            rev.is_disabled = True
            rev.save(update_fields=["is_disabled"])
        else:
            # fallback: delete is too dangerous; so just disable whole rule
            rev.rule.is_enabled = False
            rev.rule.save(update_fields=["is_enabled"])

        LOADER.invalidate(pack_name=rev.rule.pack.name)
        return Response({"ok": True, "pack": rev.rule.pack.name, "rule_key": rev.rule.key, "revision_id": str(rev.rev_id)})

class DisableRuleView(APIView):
    """POST /rules/disable_rule {"pack":"uyap_default","rule_key":"..."}"""
    def post(self, request):
        pack = (request.data or {}).get("pack")
        rule_key = (request.data or {}).get("rule_key")
        if not (pack and rule_key):
            return Response({"error":"pack and rule_key required"}, status=400)
        rp = RulePack.objects.get(name=pack)
        rule = Rule.objects.get(pack=rp, key=rule_key)
        rule.is_enabled = False
        rule.save(update_fields=["is_enabled"])
        LOADER.invalidate(pack_name=pack)
        return Response({"ok": True, "pack": pack, "rule_key": rule_key, "disabled": True})

class PinVersionView(APIView):
    """POST /rules/pin_version {"pack":"uyap_default","rule_key":"...","version":3}"""
    def post(self, request):
        pack = (request.data or {}).get("pack")
        rule_key = (request.data or {}).get("rule_key")
        version = (request.data or {}).get("version")
        if not (pack and rule_key and version is not None):
            return Response({"error":"pack, rule_key, version required"}, status=400)
        rp = RulePack.objects.get(name=pack)
        rule = Rule.objects.get(pack=rp, key=rule_key)
        if not hasattr(rule, "pinned_version"):
            return Response({"error":"Rule.pinned_version not present; apply model patch and migrate"}, status=400)
        rule.pinned_version = int(version)
        rule.save(update_fields=["pinned_version"])
        LOADER.invalidate(pack_name=pack)
        return Response({"ok": True, "pack": pack, "rule_key": rule_key, "pinned_version": rule.pinned_version})

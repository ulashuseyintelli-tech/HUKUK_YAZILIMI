from __future__ import annotations
from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from .loader import LOADER

class ActiveRulesView(APIView):
    """GET /rules/active?pack=uyap_default"""
    def get(self, request):
        pack = request.query_params.get("pack", "uyap_default")
        loaded = LOADER.load_active(pack)
        items = [{
            "pack": r.pack_name,
            "rule_key": r.rule_key,
            "revision_id": r.revision_id,
            "version": r.version,
            "sha256": r.sha256,
        } for r in loaded]
        return Response({"pack": pack, "count": len(items), "items": items})

class ReloadRulesView(APIView):
    """POST /rules/reload {"pack":"uyap_default"}  -> invalidates in-process cache"""
    def post(self, request):
        pack = (request.data or {}).get("pack")
        LOADER.invalidate(pack_name=pack)
        return Response({"ok": True, "invalidated": pack or "ALL"})

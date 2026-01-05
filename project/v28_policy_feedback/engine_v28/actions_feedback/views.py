from __future__ import annotations
from typing import Any, Dict

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from engine_v28.services import add_timeline
from engine_v28.factstore_db.adapter import DBFactStore

class ActionCallbackView(APIView):
    """POST /actions/callback

    Body example:
    {
      "case_id": "C-2026-00091",
      "kind": "PAYMENT_RECEIVED",
      "data": {"amount": 12345, "currency": "TRY", "tx": "..." }
    }
    """
    def post(self, request):
        payload: Dict[str, Any] = request.data or {}
        case_id = payload.get("case_id")
        if not case_id:
            return Response({"error":"case_id required"}, status=400)

        kind = payload.get("kind","CALLBACK")
        data = payload.get("data", {})

        add_timeline(case_id, "OUTCOME", f"Callback: {kind}", severity="info", body=payload, run=None, source="system")

        fs = DBFactStore()
        # naive mapping: store callback under actions.callback.<kind>
        facts = {f"actions.callback.{kind}": data}
        fs.write(case_id, facts, flags={}, meta={"source":"callback", "kind": kind})
        return Response({"ok": True, "case_id": case_id})

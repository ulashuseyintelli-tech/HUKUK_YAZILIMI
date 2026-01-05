from __future__ import annotations
from typing import Any, Dict, List

from rest_framework.views import APIView
from rest_framework.response import Response
from rest_framework import status

from engine_v28.services import add_timeline
from engine_v28.engine_runner.runner import EngineRunner

from .factstore_adapter import FACTSTORE
from .normalizer import normalize_event
from .config import RULE_PATHS

class UyapEventIngestView(APIView):
    """POST /uyap/events
    Body: {
      "event_id": "...",
      "case_id": "C-2026-00091",
      "type": "ASSET_FOUND_VEHICLE",
      ...
    }
    """
    def post(self, request):
        event: Dict[str, Any] = request.data
        case_id = event.get("case_id")
        if not case_id:
            return Response({"error": "case_id is required"}, status=status.HTTP_400_BAD_REQUEST)

        # 1) Timeline: raw UYAP event
        add_timeline(
            case_id,
            "UYAP_EVENT",
            f"UYAP event: {event.get('type')}",
            severity="info",
            body=event,
            run=None,
            source="uyap",
        )

        # 2) Normalize -> facts/flags
        facts, flags = normalize_event(event)
        FACTSTORE.write(case_id, facts, flags, meta={"source": "uyap_ingest", "event_id": event.get("event_id")})

        add_timeline(
            case_id,
            "FACT_WRITE",
            "Facts normalized from UYAP event",
            severity="info",
            body={"facts": facts, "flags": flags},
            run=None,
            source="system",
        )

        # 3) Run engine rules
        runner = EngineRunner(FACTSTORE)
        rules = runner.load_rules(RULE_PATHS)

        results = []
        for rule in rules:
            res = runner.run_for_event(case_id, event, rule)
            if res.matched:
                results.append({"rule_id": rule.get("rule_id"), "run_id": res.run_id, "actions_created": res.actions_created})

        return Response({"case_id": case_id, "matched": results}, status=status.HTTP_200_OK)

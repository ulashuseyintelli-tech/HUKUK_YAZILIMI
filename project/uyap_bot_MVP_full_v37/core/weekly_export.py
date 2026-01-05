from __future__ import annotations
from typing import Dict
from django.utils import timezone
from core.models import Case

def build_weekly_summary() -> Dict:
    return {
        "generated_at": timezone.now().isoformat(),
        "summary": "Haftalık özet – bu sürümde stub",
        "next": ["PDF generation", "Mail dispatch"],
    }

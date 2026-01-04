from __future__ import annotations
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional
from django.utils import timezone
from core.models import SelectorHealthLog
from core.degraded_mode import set_degraded_mode, is_degraded_mode

@dataclass
class HealthStats:
    window_minutes: int
    total: int
    ok: int
    fail: int
    fail_rate: float

def compute_health(window_minutes: int = 60) -> HealthStats:
    since = timezone.now() - timedelta(minutes=window_minutes)
    qs = SelectorHealthLog.objects.filter(created_at__gte=since)
    total = qs.count()
    ok = qs.filter(ok=True).count()
    fail = total - ok
    fail_rate = (fail / total) if total > 0 else 0.0
    return HealthStats(window_minutes=window_minutes, total=total, ok=ok, fail=fail, fail_rate=fail_rate)

def auto_toggle_degraded_mode(threshold_fail_rate: float = 0.2, min_samples: int = 20, window_minutes: int = 60) -> HealthStats:
    stats = compute_health(window_minutes=window_minutes)
    if stats.total >= min_samples and stats.fail_rate >= threshold_fail_rate:
        if not is_degraded_mode():
            set_degraded_mode(True)
    elif stats.total >= min_samples and stats.fail_rate < (threshold_fail_rate/2):
        # recover
        if is_degraded_mode():
            set_degraded_mode(False)
    return stats

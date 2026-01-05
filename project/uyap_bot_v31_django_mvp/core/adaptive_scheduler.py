from __future__ import annotations
from dataclasses import dataclass
from datetime import timedelta
from typing import Optional
from django.utils import timezone
from core.models import JobRun, JobStatus

@dataclass
class RecipeStats:
    recipe_id: str
    total: int
    failed: int
    fail_rate: float

def compute_recipe_stats(recipe_id: str, window_hours: int = 6) -> RecipeStats:
    since = timezone.now() - timedelta(hours=window_hours)
    qs = JobRun.objects.filter(created_at__gte=since, recipe_id=recipe_id)
    total = qs.count()
    failed = qs.filter(status=JobStatus.FAILED).count()
    fail_rate = (failed/total) if total > 0 else 0.0
    return RecipeStats(recipe_id=recipe_id, total=total, failed=failed, fail_rate=fail_rate)

def adjust_interval(base_interval: int, stats: RecipeStats, soft: float, hard: float, min_samples: int) -> int:
    if stats.total < min_samples:
        return base_interval
    if stats.fail_rate >= hard:
        return int(base_interval * 2.0)
    if stats.fail_rate >= soft:
        return int(base_interval * 1.5)
    return base_interval

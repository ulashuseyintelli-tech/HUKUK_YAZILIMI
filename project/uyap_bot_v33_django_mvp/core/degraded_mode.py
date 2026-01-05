from django.utils import timezone
from core.models import SystemConfig

KEY = "degraded_mode"

def is_degraded_mode() -> bool:
    cfg = SystemConfig.objects.filter(key=KEY).first()
    if not cfg:
        return False
    return bool(cfg.value.get("enabled", False))

def set_degraded_mode(on: bool, reason: str|None = None) -> None:
    cfg, _ = SystemConfig.objects.get_or_create(key=KEY, defaults={"value": {"enabled": False}})
    cfg.value["enabled"] = bool(on)
    if reason:
        cfg.value["reason"] = reason
    cfg.value["updated_at"] = timezone.now().isoformat()
    cfg.save(update_fields=["value", "updated_at"])

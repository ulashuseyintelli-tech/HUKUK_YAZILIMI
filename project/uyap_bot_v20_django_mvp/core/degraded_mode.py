from django.utils import timezone
from core.models import RecipeBundle, UiMapBundle

# v19 MVP: global degraded mode flag stored as notes in active UiMapBundle (quick hack).
# Production: separate table / config.

def is_degraded_mode() -> bool:
    ub = UiMapBundle.objects.filter(status="active").order_by("-version").first()
    if not ub:
        return False
    return (ub.content or "").find("degraded_mode: true") >= 0

def set_degraded_mode(on: bool) -> None:
    ub = UiMapBundle.objects.filter(status="active").order_by("-version").first()
    if not ub:
        return
    marker_on = "degraded_mode: true"
    marker_off = "degraded_mode: false"
    txt = ub.content or ""
    if on and marker_on not in txt:
        txt += f"\n{marker_on}\n"
    if not on and marker_on in txt:
        txt = txt.replace(marker_on, marker_off)
    ub.content = txt
    ub.save(update_fields=["content"])

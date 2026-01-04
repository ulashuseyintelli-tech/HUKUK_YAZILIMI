from django.core.management.base import BaseCommand
from core.models import RecipeBundle, ParamBundle, UiMapBundle
from core.utils import parse_yaml_or_json

class Command(BaseCommand):
    help = "Validate YAML bundles for basic structure and cross-references (dry-run)."

    def add_arguments(self, parser):
        parser.add_argument("--active", action="store_true", help="Validate only ACTIVE bundles.")

    def handle(self, *args, **opts):
        qs = lambda M: M.objects.filter(status="active") if opts["active"] else M.objects.all()

        rb = qs(RecipeBundle).order_by("-updated_at")
        pb = qs(ParamBundle).order_by("-updated_at")
        ub = qs(UiMapBundle).order_by("-updated_at")

        errors = 0

        def _validate(name, obj):
            nonlocal errors
            try:
                d = parse_yaml_or_json(obj.content)
            except Exception as e:
                errors += 1
                self.stdout.write(self.style.ERROR(f"{name} id={obj.id} parse error: {e}"))
                return None
            return d

        for b in rb:
            data = _validate("RecipeBundle", b)
            if not data:
                continue
            # Basic keys
            if "recipes" not in data and "recipes:" not in b.content:
                # allow packs that wrap under top-level 'recipes'
                self.stdout.write(self.style.WARNING(f"RecipeBundle id={b.id} missing top-level 'recipes' key (may be ok if using custom format)."))

        for b in pb:
            _validate("ParamBundle", b)

        for b in ub:
            data = _validate("UiMapBundle", b)
            if not data:
                continue
            if "ui_map" not in data:
                self.stdout.write(self.style.WARNING(f"UiMapBundle id={b.id} missing 'ui_map' root."))

        # Cross-reference check (light): recipe ids referenced in active recipe packs are unique
        active_rb = RecipeBundle.objects.filter(status="active").order_by("-version").first()
        if active_rb:
            data = _validate("ACTIVE RecipeBundle", active_rb)
            if data and isinstance(data.get("recipes"), list):
                ids = [r.get("recipe_id") for r in data["recipes"] if isinstance(r, dict)]
                dup = {i for i in ids if i and ids.count(i) > 1}
                if dup:
                    errors += 1
                    self.stdout.write(self.style.ERROR(f"Duplicate recipe_id in ACTIVE pack: {sorted(list(dup))}"))

        if errors == 0:
            self.stdout.write(self.style.SUCCESS("Bundle validation OK"))
        else:
            self.stdout.write(self.style.ERROR(f"Bundle validation finished with {errors} error(s)"))

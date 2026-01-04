from django.core.management.base import BaseCommand, CommandError
from core.models import RecipeBundle, ParamBundle, UiMapBundle, BundleStatus
from core.utils import sha256_text
from pathlib import Path

class Command(BaseCommand):
    help = "Import a YAML/JSON bundle into DB (recipe/params/uimap)."

    def add_arguments(self, parser):
        parser.add_argument("kind", choices=["recipe", "params", "uimap"])
        parser.add_argument("name")
        parser.add_argument("filepath")
        parser.add_argument("--version", type=int, default=1)
        parser.add_argument("--status", choices=["draft","approved","active","archived"], default="draft")
        parser.add_argument("--notes", default="")

    def handle(self, *args, **opts):
        path = Path(opts["filepath"])
        if not path.exists():
            raise CommandError(f"File not found: {path}")
        content = path.read_text(encoding="utf-8")
        h = sha256_text(content)

        status = opts["status"]
        version = opts["version"]

        Model = {"recipe": RecipeBundle, "params": ParamBundle, "uimap": UiMapBundle}[opts["kind"]]
        obj, created = Model.objects.update_or_create(
            name=opts["name"],
            defaults=dict(version=version, status=status, content=content, content_hash=h, notes=opts.get("notes","") if hasattr(Model, "notes") else None)
        )
        self.stdout.write(self.style.SUCCESS(f"{opts['kind']} bundle saved: {obj.name} v{obj.version} ({obj.status}) hash={obj.content_hash[:12]}..."))

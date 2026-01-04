import json, os, zipfile, hashlib
from django.conf import settings
from django.utils import timezone
from core.models import Case, Snapshot, Fact, JobRun, EvidenceExport

def _sha256_bytes(b: bytes) -> str:
    return hashlib.sha256(b).hexdigest()

def export_case_audit(case: Case, requested_by: str="system") -> EvidenceExport:
    export = EvidenceExport.objects.create(case=case, requested_by=requested_by, status="running")

    base_dir = os.path.join(settings.BASE_DIR, "exports")
    os.makedirs(base_dir, exist_ok=True)

    ts = timezone.now().strftime("%Y%m%d_%H%M%S")
    zip_name = f"case_{case.id}_{ts}.zip"
    zip_path = os.path.join(base_dir, zip_name)

    snapshots = list(Snapshot.objects.filter(case=case).order_by("-created_at")[:200])
    facts = list(Fact.objects.filter(case=case).order_by("-created_at")[:500])
    jobs = list(JobRun.objects.filter(case=case).order_by("-created_at")[:200])

    package = {
        "case": {"id": case.id, "uyap_dosya_no": case.uyap_dosya_no, "stage": case.stage, "icra_type": case.icra_type},
        "generated_at": timezone.now().isoformat(),
        "snapshots": [ {"id": s.id, "source": s.source, "uyap_nav_path": s.uyap_nav_path, "snapshot_hash": s.snapshot_hash, "created_at": s.created_at.isoformat()} for s in snapshots ],
        "facts": [ {"id": f.id, "fact_type": f.fact_type, "key": f.key, "value": f.value, "created_at": f.created_at.isoformat()} for f in facts ],
        "jobs": [ {"id": j.id, "recipe_id": j.recipe_id, "status": j.status, "attempt": j.attempt, "created_at": j.created_at.isoformat()} for j in jobs ],
    }

    payload_bytes = json.dumps(package, ensure_ascii=False, indent=2).encode("utf-8")

    with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as z:
        z.writestr("audit.json", payload_bytes)

    h = _sha256_bytes(payload_bytes)
    export.export_path = zip_path
    export.export_hash = h
    export.status = "done"
    export.save(update_fields=["export_path","export_hash","status"])
    return export

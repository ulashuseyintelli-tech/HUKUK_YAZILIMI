from django.db.models import Count
from rest_framework import viewsets, status
from rest_framework.decorators import action
from rest_framework.response import Response

from core.models import JobRun, JobStatus, RecipePause
from core.queue_policy_loader import load_active_queue_policy

class OpsViewSet(viewsets.ViewSet):
    @action(detail=False, methods=["get"])
    def queue_dashboard(self, request):
        policy = load_active_queue_policy().get("policy", {})
        counts = JobRun.objects.values("status").annotate(c=Count("id"))
        by_risk = JobRun.objects.values("risk_level").annotate(c=Count("id"))
        top_recipes = JobRun.objects.values("recipe_id").annotate(c=Count("id")).order_by("-c")[:20]
        return Response({
            "policy": policy,
            "counts_by_status": list(counts),
            "counts_by_risk": list(by_risk),
            "top_recipes": list(top_recipes),
        })

    @action(detail=False, methods=["post"])
    def pause_recipe(self, request):
        recipe_id = request.data.get("recipe_id")
        reason = request.data.get("reason", "")
        if not recipe_id:
            return Response({"ok": False, "error": "recipe_id required"}, status=status.HTTP_400_BAD_REQUEST)
        obj, _ = RecipePause.objects.get_or_create(recipe_id=recipe_id)
        obj.is_paused = True
        obj.reason = reason
        obj.save(update_fields=["is_paused","reason","updated_at"])
        return Response({"ok": True, "recipe_id": recipe_id, "paused": True})

    @action(detail=False, methods=["post"])
    def unpause_recipe(self, request):
        recipe_id = request.data.get("recipe_id")
        if not recipe_id:
            return Response({"ok": False, "error": "recipe_id required"}, status=status.HTTP_400_BAD_REQUEST)
        obj, _ = RecipePause.objects.get_or_create(recipe_id=recipe_id)
        obj.is_paused = False
        obj.reason = ""
        obj.save(update_fields=["is_paused","reason","updated_at"])
        return Response({"ok": True, "recipe_id": recipe_id, "paused": False})

    @action(detail=False, methods=["post"])
    def cancel_job(self, request):
        job_id = request.data.get("job_id")
        if not job_id:
            return Response({"ok": False, "error": "job_id required"}, status=status.HTTP_400_BAD_REQUEST)
        try:
            job = JobRun.objects.get(id=job_id)
        except JobRun.DoesNotExist:
            return Response({"ok": False, "error": "job not found"}, status=status.HTTP_404_NOT_FOUND)
        if job.status in (JobStatus.DONE, JobStatus.FAILED):
            return Response({"ok": False, "error": "job already finished"}, status=status.HTTP_400_BAD_REQUEST)
        job.status = JobStatus.QUARANTINED
        job.last_error_code = "CANCELLED"
        job.last_error_message = "Cancelled by ops"
        job.save(update_fields=["status","last_error_code","last_error_message"])
        return Response({"ok": True, "job_id": job.id, "status": job.status})

# Pseudo-code (Django)
# with transaction.atomic():
#   job = JobRun.objects.select_for_update(skip_locked=True)#          .filter(status='queued')#          .filter(Q(leased_until__isnull=True) | Q(leased_until__lt=now))#          .order_by('priority','created_at').first()
#   if job:
#      job.leased_until = now + timedelta(seconds=60)
#      job.leased_by = worker_id
#      job.status = 'running'
#      job.save()

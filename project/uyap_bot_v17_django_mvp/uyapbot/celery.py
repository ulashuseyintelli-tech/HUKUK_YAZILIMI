import os
from celery import Celery

os.environ.setdefault('DJANGO_SETTINGS_MODULE', 'uyapbot.settings')

app = Celery('uyapbot')
app.config_from_object('django.conf:settings', namespace='CELERY')
app.autodiscover_tasks()

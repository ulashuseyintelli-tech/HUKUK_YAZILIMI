"""v38 Enterprise Django model add-on (stub)

Bu dosya doğrudan migrate edilmez; core/models.py içine adapte edeceksin.
Ama net alanları veriyoruz.
"""

from django.db import models
from django.utils import timezone
from django.contrib.auth import get_user_model

User = get_user_model()

class Plan(models.TextChoices):
    FREE = "FREE"
    PRO = "PRO"
    ENTERPRISE = "ENTERPRISE"

class Tenant(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    name = models.CharField(max_length=128)
    slug = models.SlugField(unique=True)
    plan = models.CharField(max_length=16, choices=Plan.choices, default=Plan.PRO)
    is_active = models.BooleanField(default=True)

class Role(models.TextChoices):
    ADMIN = "ADMIN"
    OPS = "OPS"
    LAWYER = "LAWYER"
    VIEWER = "VIEWER"

class Membership(models.Model):
    created_at = models.DateTimeField(default=timezone.now)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE)
    user = models.ForeignKey(User, on_delete=models.CASCADE)
    role = models.CharField(max_length=16, choices=Role.choices, default=Role.VIEWER)
    is_active = models.BooleanField(default=True)

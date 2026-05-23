import uuid
from django.db import models


class Session(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, blank=True)
    system_prompt = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['-created_at']


class Message(models.Model):
    ROLE_CHOICES = [('user', 'user'), ('assistant', 'assistant')]

    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='messages')
    role = models.CharField(max_length=16, choices=ROLE_CHOICES)
    content = models.TextField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class AgentStep(models.Model):
    TYPE_CHOICES = [
        ('tool_call', 'tool_call'),
        ('tool_result', 'tool_result'),
    ]

    message = models.ForeignKey(Message, on_delete=models.CASCADE, related_name='steps')
    step_type = models.CharField(max_length=16, choices=TYPE_CHOICES)
    data = models.JSONField()
    order = models.PositiveIntegerField()

    class Meta:
        ordering = ['order']


class Schedule(models.Model):
    INTERVAL_CHOICES = [
        (60, 'Every hour'),
        (360, 'Every 6 hours'),
        (1440, 'Every day'),
        (10080, 'Every week'),
    ]

    name = models.CharField(max_length=255)
    prompt = models.TextField()
    system_prompt = models.TextField(blank=True)
    interval_minutes = models.IntegerField(default=1440, choices=INTERVAL_CHOICES)
    enabled = models.BooleanField(default=True)
    last_run = models.DateTimeField(null=True, blank=True)
    next_run = models.DateTimeField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['next_run']


class Memory(models.Model):
    key = models.CharField(max_length=255, unique=True)
    value = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name_plural = 'memories'

    def __str__(self):
        return self.key

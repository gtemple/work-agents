import uuid
from django.db import models


class Session(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, blank=True)
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

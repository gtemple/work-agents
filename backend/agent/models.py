import uuid
from django.db import models


class Session(models.Model):
    TASK_TYPE_CHOICES = [
        ('feature', 'Feature'),
        ('bug_fix', 'Bug Fix'),
        ('test', 'Test'),
        ('refactor', 'Refactor'),
    ]
    ROLE_CHOICES = [
        ('standard', 'Standard'),
        ('orchestrator', 'Orchestrator'),
        ('task', 'Task'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255, blank=True)
    system_prompt = models.TextField(blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    input_tokens = models.IntegerField(default=0)
    output_tokens = models.IntegerField(default=0)
    # Linear work session fields
    is_work = models.BooleanField(default=False)
    linear_issue_id = models.CharField(max_length=255, blank=True, unique=True, null=True)
    linear_issue_key = models.CharField(max_length=32, blank=True)
    linear_issue_url = models.URLField(blank=True)
    linear_task_type = models.CharField(max_length=32, blank=True, choices=TASK_TYPE_CHOICES)
    # Pending plan from background agent — set when submit_plan is called, cleared after approval
    pending_plan = models.JSONField(null=True, blank=True)
    # Project membership
    session_role = models.CharField(max_length=16, choices=ROLE_CHOICES, default='standard')
    project = models.ForeignKey('Project', null=True, blank=True, on_delete=models.SET_NULL, related_name='tasks')

    class Meta:
        ordering = ['-created_at']


class Project(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    title = models.CharField(max_length=255)
    description = models.TextField(blank=True)
    orchestrator = models.OneToOneField('Session', on_delete=models.SET_NULL, null=True, blank=True, related_name='as_project')
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


class TokenUsage(models.Model):
    """One row per API call. session=None for system calls (e.g. suggestion generation)."""
    session = models.ForeignKey(Session, null=True, blank=True, on_delete=models.CASCADE, related_name='token_usage')
    source = models.CharField(max_length=32, default='agent')  # agent | suggestions | other
    input_tokens = models.IntegerField()
    output_tokens = models.IntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['created_at']


class GlobalEvent(models.Model):
    """Broadcast events from background agents — polled by the frontend for ActivityFeed."""
    session = models.ForeignKey(Session, on_delete=models.CASCADE, related_name='global_events')
    event_type = models.CharField(max_length=32)  # tool_call | plan_ready | done | error
    data = models.JSONField(default=dict)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['id']


class UserContext(models.Model):
    """Singleton — one row, ever. Persistent knowledge about the user built up over time."""
    content = models.TextField(blank=True)
    suggestions_generated_at = models.DateTimeField(null=True, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    @classmethod
    def get(cls):
        obj, _ = cls.objects.get_or_create(id=1)
        return obj


class ActionItem(models.Model):
    STATUS_CHOICES = [
        ('active', 'Active'),       # shown in the 8 slots
        ('queued', 'Queued'),       # waiting to fill a slot
        ('saved', 'Saved'),         # user saved for later
        ('dismissed', 'Dismissed'), # user said no
    ]
    TYPE_CHOICES = [('work', 'Work'), ('personal', 'Personal')]

    title = models.CharField(max_length=255)
    description = models.TextField()
    type = models.CharField(max_length=16, choices=TYPE_CHOICES)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='queued')
    category = models.CharField(max_length=64, blank=True)
    repo = models.CharField(max_length=255, blank=True)
    session = models.ForeignKey('Session', null=True, blank=True, on_delete=models.SET_NULL)
    confidence = models.FloatField(null=True, blank=True)
    queue_position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ['queue_position', '-created_at']


class RepoMemory(models.Model):
    """Persistent knowledge base for a repository, structured as markdown sections.
    Shared across all agents working on the same repo."""
    repo = models.CharField(max_length=255, unique=True)  # e.g. "purposely/purposely-web"
    content = models.TextField(blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self):
        return self.repo


class Memory(models.Model):
    key = models.CharField(max_length=255, unique=True)
    value = models.TextField()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-updated_at']
        verbose_name_plural = 'memories'

    def __str__(self):
        return self.key


class Process(models.Model):
    STATUS_CHOICES = [
        ('running', 'Running'),
        ('stopped', 'Stopped'),
        ('crashed', 'Crashed'),
    ]

    session = models.ForeignKey('Session', null=True, blank=True, on_delete=models.SET_NULL, related_name='processes')
    label = models.CharField(max_length=255)
    command = models.TextField()
    cwd = models.TextField(blank=True)
    port = models.IntegerField(null=True, blank=True)
    pid = models.IntegerField(null=True, blank=True)
    status = models.CharField(max_length=16, choices=STATUS_CHOICES, default='running')
    started_at = models.DateTimeField(auto_now_add=True)
    stopped_at = models.DateTimeField(null=True, blank=True)

    class Meta:
        ordering = ['-started_at']

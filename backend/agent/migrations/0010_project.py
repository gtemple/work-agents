import uuid
import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0009_usercontext_actionitem'),
    ]

    operations = [
        # Create Project without the orchestrator FK first (breaks the circular dependency)
        migrations.CreateModel(
            name='Project',
            fields=[
                ('id', models.UUIDField(default=uuid.uuid4, editable=False, primary_key=True, serialize=False)),
                ('title', models.CharField(max_length=255)),
                ('description', models.TextField(blank=True)),
                ('created_at', models.DateTimeField(auto_now_add=True)),
            ],
            options={'ordering': ['-created_at']},
        ),
        # Add project FK and session_role to Session (Project table now exists)
        migrations.AddField(
            model_name='session',
            name='session_role',
            field=models.CharField(
                choices=[('standard', 'Standard'), ('orchestrator', 'Orchestrator'), ('task', 'Task')],
                default='standard',
                max_length=16,
            ),
        ),
        migrations.AddField(
            model_name='session',
            name='project',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='tasks',
                to='agent.project',
            ),
        ),
        # Now add orchestrator FK to Project (Session table exists with project column)
        migrations.AddField(
            model_name='project',
            name='orchestrator',
            field=models.OneToOneField(
                blank=True, null=True,
                on_delete=django.db.models.deletion.SET_NULL,
                related_name='as_project',
                to='agent.session',
            ),
        ),
    ]

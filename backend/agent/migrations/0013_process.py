from django.db import migrations, models
import django.db.models.deletion


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0012_confidence_field'),
    ]

    operations = [
        migrations.CreateModel(
            name='Process',
            fields=[
                ('id', models.AutoField(auto_created=True, primary_key=True, serialize=False, verbose_name='ID')),
                ('label', models.CharField(max_length=255)),
                ('command', models.TextField()),
                ('port', models.IntegerField(blank=True, null=True)),
                ('pid', models.IntegerField(blank=True, null=True)),
                ('status', models.CharField(choices=[('running', 'Running'), ('stopped', 'Stopped'), ('crashed', 'Crashed')], default='running', max_length=16)),
                ('started_at', models.DateTimeField(auto_now_add=True)),
                ('stopped_at', models.DateTimeField(blank=True, null=True)),
                ('session', models.ForeignKey(blank=True, null=True, on_delete=django.db.models.deletion.SET_NULL, related_name='processes', to='agent.session')),
            ],
            options={
                'ordering': ['-started_at'],
            },
        ),
    ]

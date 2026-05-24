import django.db.models.deletion
from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0010_project'),
    ]

    operations = [
        migrations.AddField(
            model_name='tokenusage',
            name='source',
            field=models.CharField(default='agent', max_length=32),
        ),
        migrations.AlterField(
            model_name='tokenusage',
            name='session',
            field=models.ForeignKey(
                blank=True, null=True,
                on_delete=django.db.models.deletion.CASCADE,
                related_name='token_usage',
                to='agent.session',
            ),
        ),
    ]

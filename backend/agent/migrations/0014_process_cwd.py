from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0013_process'),
    ]

    operations = [
        migrations.AddField(
            model_name='process',
            name='cwd',
            field=models.TextField(blank=True, default=''),
            preserve_default=False,
        ),
    ]

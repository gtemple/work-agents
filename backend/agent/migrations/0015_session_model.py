from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0014_process_cwd'),
    ]

    operations = [
        migrations.AddField(
            model_name='session',
            name='model',
            field=models.CharField(default='gemini-2.5-flash', max_length=64),
        ),
    ]

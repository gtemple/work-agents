from django.db import migrations, models


class Migration(migrations.Migration):

    dependencies = [
        ('agent', '0015_session_model'),
    ]

    operations = [
        migrations.AddField(
            model_name='tokenusage',
            name='model',
            field=models.CharField(default='gemini-3.5-flash', max_length=64),
        ),
    ]

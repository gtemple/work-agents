from django.apps import AppConfig


class AgentConfig(AppConfig):
    default_auto_field = 'django.db.models.BigAutoField'
    name = 'agent'

    def ready(self):
        import os
        if os.environ.get('RUN_MAIN') != 'true':
            return
        from . import scheduler
        scheduler.start()

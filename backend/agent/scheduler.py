import threading
import time
import logging

logger = logging.getLogger(__name__)
_thread = None


def _loop():
    # Wait for Django to finish starting up
    time.sleep(5)
    while True:
        try:
            from django.utils import timezone
            from datetime import timedelta
            from .models import Schedule, Session
            from . import agent_loop

            now = timezone.now()
            for schedule in Schedule.objects.filter(enabled=True, next_run__lte=now):
                session = Session.objects.create(
                    title=f'[Scheduled] {schedule.name}',
                    system_prompt=schedule.system_prompt,
                )
                try:
                    for _ in agent_loop.run(session, schedule.prompt):
                        pass
                except Exception:
                    logger.exception('Scheduled agent failed: %s', schedule.name)

                schedule.last_run = now
                schedule.next_run = now + timedelta(minutes=schedule.interval_minutes)
                schedule.save(update_fields=['last_run', 'next_run'])
        except Exception:
            logger.exception('Scheduler loop error')

        time.sleep(60)


def start():
    global _thread
    if _thread and _thread.is_alive():
        return
    _thread = threading.Thread(target=_loop, daemon=True, name='agent-scheduler')
    _thread.start()

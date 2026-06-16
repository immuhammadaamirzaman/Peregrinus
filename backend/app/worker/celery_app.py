"""Celery application instance.

Run a worker (Windows needs the solo pool) from the ``backend`` directory:

    celery -A app.worker.celery_app worker --pool=solo --loglevel=info
"""

from __future__ import annotations

from celery import Celery

from app.config import settings

celery_app = Celery(
    "datamovers",
    broker=settings.celery_broker_url,
    backend=settings.celery_result_backend,
    include=["app.worker.tasks"],
)

celery_app.conf.update(
    task_acks_late=True,                 # ack only after completion (crash-safe)
    task_reject_on_worker_lost=True,     # requeue if the worker dies mid-task
    task_track_started=True,
    worker_prefetch_multiplier=1,        # one long migration per slot
    task_serializer="json",
    result_serializer="json",
    accept_content=["json"],
    result_expires=86_400,               # keep results 24h
    timezone="UTC",
    enable_utc=True,
)

"""
worker.py — Background Task Worker process entrypoint for Render worker deployment.
Consumes heavy pipeline execution jobs from Redis queue and handles graceful termination.
"""

from __future__ import annotations

import logging
import signal
import sys
import time

from app.logging_config import setup_logging
from app.services.queue import dequeue_task, update_task_status
from app.services.redis_client import get_redis_client

setup_logging()
logger = logging.getLogger("app.worker")

_running = True


def _signal_handler(signum: int, frame: Any) -> None:
    global _running
    logger.info("Received termination signal (%d). Shutting down worker gracefully...", signum)
    _running = False


def process_pipeline_task(task_data: dict) -> None:
    task_id = task_data.get("task_id")
    payload = task_data.get("payload", {})
    session_id = payload.get("session_id")

    if not session_id:
        logger.error("Task %s missing session_id", task_id)
        if task_id:
            update_task_status(task_id, "failed", error="Missing session_id in task payload")
        return

    logger.info("Worker processing task %s for session %s", task_id, session_id)
    if task_id:
        update_task_status(task_id, "processing")

    from app.api.pipeline import run_pipeline_bg
    try:
        run_pipeline_bg(session_id)
        logger.info("Worker completed task %s for session %s", task_id, session_id)
        if task_id:
            update_task_status(task_id, "completed")
    except Exception as e:
        logger.error("Worker failed task %s for session %s: %s", task_id, session_id, e, exc_info=True)
        if task_id:
            update_task_status(task_id, "failed", error=str(e))


def run_worker() -> None:
    signal.signal(signal.SIGINT, _signal_handler)
    signal.signal(signal.SIGTERM, _signal_handler)

    logger.info("Aegis Background Task Worker process started. Listening for pipeline tasks...")

    redis = get_redis_client()
    if not redis or not redis.is_available():
        logger.warning("Redis is currently unavailable. Worker will retry connection in loop...")

    while _running:
        try:
            task = dequeue_task("pipeline_execution", timeout_seconds=5)
            if task:
                process_pipeline_task(task)
            else:
                # Idle loop pause
                time.sleep(0.1)
        except Exception as e:
            logger.error("Worker loop exception: %s", e)
            time.sleep(2.0)

    logger.info("Worker shutdown complete.")


if __name__ == "__main__":
    run_worker()

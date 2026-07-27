"""
queue.py — Redis-backed asynchronous message queue for offloading heavy pipeline
execution tasks from API web workers to background worker processes.
"""

from __future__ import annotations

import json
import logging
import time
import uuid
from typing import Any, Dict, Optional

from app.services.redis_client import get_redis_client

logger = logging.getLogger(__name__)

QUEUE_PREFIX = "aegis:queue:"
TASK_STATUS_PREFIX = "aegis:task_status:"


def enqueue_task(task_type: str, payload: Dict[str, Any]) -> Optional[str]:
    """Enqueue a task to the specified queue_type. Returns task_id or None if Redis unavailable."""
    redis = get_redis_client()
    if not redis or not redis.is_available():
        return None

    task_id = str(uuid.uuid4())
    task_data = {
        "task_id": task_id,
        "type": task_type,
        "payload": payload,
        "created_at": time.time(),
        "status": "queued",
    }

    queue_key = f"{QUEUE_PREFIX}{task_type}"
    status_key = f"{TASK_STATUS_PREFIX}{task_id}"

    try:
        raw_json = json.dumps(task_data)
        # 1. Set task status metadata with 24h TTL
        redis.set(status_key, raw_json, ex=86400)
        # 2. Push task ID/payload to list queue
        if redis.client:
            redis.client.rpush(queue_key, raw_json)
        logger.info("Enqueued task %s to %s", task_id, queue_key)
        return task_id
    except Exception as e:
        logger.error("Failed to enqueue task to %s: %s", queue_key, e)
        return None


def dequeue_task(task_type: str, timeout_seconds: int = 5) -> Optional[Dict[str, Any]]:
    """Pop next task from queue using blocking pop. Returns task dict or None."""
    redis = get_redis_client()
    if not redis or not redis.is_available() or redis.client is None:
        return None

    queue_key = f"{QUEUE_PREFIX}{task_type}"
    try:
        res = redis.client.blpop(queue_key, timeout=timeout_seconds)
        if not res:
            return None
        _, raw_json = res
        return json.loads(raw_json)
    except Exception as e:
        logger.error("Error dequeuing task from %s: %s", queue_key, e)
        return None


def update_task_status(
    task_id: str,
    status: str,
    result: Optional[Dict[str, Any]] = None,
    error: Optional[str] = None,
) -> None:
    """Update task execution state in Redis."""
    redis = get_redis_client()
    if not redis or not redis.is_available():
        return

    status_key = f"{TASK_STATUS_PREFIX}{task_id}"
    try:
        raw = redis.get(status_key)
        task_data = json.loads(raw) if raw else {"task_id": task_id}
        task_data["status"] = status
        task_data["updated_at"] = time.time()
        if result is not None:
            task_data["result"] = result
        if error is not None:
            task_data["error"] = error

        redis.set(status_key, json.dumps(task_data), ex=86400)
    except Exception as e:
        logger.error("Failed to update status for task %s: %s", task_id, e)


def get_task_status(task_id: str) -> Optional[Dict[str, Any]]:
    """Retrieve task status metadata."""
    redis = get_redis_client()
    if not redis or not redis.is_available():
        return None

    status_key = f"{TASK_STATUS_PREFIX}{task_id}"
    try:
        raw = redis.get(status_key)
        return json.loads(raw) if raw else None
    except Exception as e:
        logger.error("Failed to fetch task status for %s: %s", task_id, e)
        return None

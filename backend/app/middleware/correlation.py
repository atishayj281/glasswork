from app import logging_config


class CorrelationIdMiddleware:
    """Pure ASGI middleware (not BaseHTTPMiddleware) — avoids the task-boundary
    contextvar propagation issue that BaseHTTPMiddleware has in Starlette.
    """
    def __init__(self, app):
        self.app = app

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return

        session_id = None
        path_params = scope.get("path_params") or {}
        session_id = path_params.get("session_id")

        if not session_id:
            path = scope.get("path", "")
            parts = path.strip("/").split("/")
            for i, part in enumerate(parts):
                if part in ("chat", "pipeline", "session") and i + 1 < len(parts):
                    potential_id = parts[i + 1]
                    if len(potential_id) >= 32:
                        session_id = potential_id
                        break

        token = logging_config.session_context.set(session_id) if session_id else None
        try:
            await self.app(scope, receive, send)
        finally:
            if token:
                logging_config.session_context.reset(token)
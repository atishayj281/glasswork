import os
import json
import logging
import contextvars
from logging.handlers import RotatingFileHandler

from app.config import LOG_DIR

PIPELINE_LOG_FILE = "pipeline_prompts.log"

# Global context for correlation/session ID
session_context = contextvars.ContextVar("session_id", default=None)


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        log_data = {
            "timestamp": self.formatTime(record, "%Y-%m-%dT%H:%M:%S%z"),
            "level": record.levelname,
            "logger": record.name,
            "message": record.getMessage(),
        }
        
        # Inject session correlation ID if present
        session_id = session_context.get()
        if session_id:
            log_data["session_id"] = session_id
            
        # Exception details
        if record.exc_info:
            log_data["exception"] = self.formatException(record.exc_info)
            
        return json.dumps(log_data)


def setup_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    is_dev = os.getenv("ENVIRONMENT", "production") == "development"
    if is_dev:
        formatter = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")
    else:
        formatter = JSONFormatter()

    root = logging.getLogger()
    
    # Remove existing handlers to avoid duplicates
    for handler in list(root.handlers):
        root.removeHandler(handler)
        
    console = logging.StreamHandler()
    console.setFormatter(formatter)
    root.addHandler(console)
    root.setLevel(logging.INFO)

    # Setup the agent file logger
    agent_logger = logging.getLogger("app.services.agent")
    for handler in list(agent_logger.handlers):
        agent_logger.removeHandler(handler)
        
    file_handler = RotatingFileHandler(
        LOG_DIR / PIPELINE_LOG_FILE,
        maxBytes=5_000_000,
        backupCount=5,
        encoding="utf-8",
    )
    file_handler.setFormatter(formatter)
    file_handler.setLevel(logging.INFO)
    agent_logger.addHandler(file_handler)

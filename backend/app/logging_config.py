import logging
from logging.handlers import RotatingFileHandler

from app.config import LOG_DIR

PIPELINE_LOG_FILE = "pipeline_prompts.log"


def setup_logging() -> None:
    LOG_DIR.mkdir(parents=True, exist_ok=True)

    formatter = logging.Formatter("%(asctime)s %(levelname)s [%(name)s] %(message)s")

    root = logging.getLogger()
    if not root.handlers:
        console = logging.StreamHandler()
        console.setFormatter(formatter)
        root.addHandler(console)
    root.setLevel(logging.INFO)

    agent_logger = logging.getLogger("app.services.agent")
    if not any(isinstance(h, RotatingFileHandler) for h in agent_logger.handlers):
        file_handler = RotatingFileHandler(
            LOG_DIR / PIPELINE_LOG_FILE,
            maxBytes=5_000_000,
            backupCount=5,
            encoding="utf-8",
        )
        file_handler.setFormatter(formatter)
        file_handler.setLevel(logging.INFO)
        agent_logger.addHandler(file_handler)

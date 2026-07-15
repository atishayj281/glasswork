import os
from pathlib import Path

from dotenv import load_dotenv

load_dotenv()

LITELLM_MODEL = os.getenv("LITELLM_MODEL", "gpt-4o")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "50"))
SESSION_TTL_HOURS = int(os.getenv("SESSION_TTL_HOURS", "24"))
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "http://localhost:5173")
DATA_DIR = Path(os.getenv("DATA_DIR", str(Path.home() / ".aegis" / "data")))
LOG_DIR = Path(os.getenv("LOG_DIR", str(DATA_DIR / "logs")))
MAX_ROWS = int(os.getenv("MAX_ROWS", "1000000"))

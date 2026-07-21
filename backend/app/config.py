import os
from pathlib import Path

from dotenv import load_dotenv

# Safe fallback: ensures env vars are loaded even when config is imported directly
# (e.g. in unit tests), without duplicating work when main.py already called load_dotenv().
load_dotenv()

LITELLM_MODEL = os.getenv("LITELLM_MODEL", "gpt-4o")
MAX_UPLOAD_MB = int(os.getenv("MAX_UPLOAD_MB", "20"))  # 20 MB — conservative for shared env
MAX_ROWS = int(os.getenv("MAX_ROWS", "100000"))  # 100 k rows per upload
SESSION_TTL_HOURS = int(os.getenv("SESSION_TTL_HOURS", "24"))
CORS_ORIGIN = os.getenv("CORS_ORIGIN", "http://localhost:5173")
DATA_DIR = Path(os.getenv("DATA_DIR", str(Path.home() / ".aegis" / "data")))
LOG_DIR = Path(os.getenv("LOG_DIR", str(DATA_DIR / "logs")))
MAX_ROWS = int(os.getenv("MAX_ROWS", "100000"))
FIREBASE_SERVICE_ACCOUNT_JSON = os.getenv("FIREBASE_SERVICE_ACCOUNT_JSON", "")
# --- Per-uid daily LLM budget (enforced via Redis) ---
BUDGET_MAX_CALLS_PER_DAY = int(os.getenv("BUDGET_MAX_CALLS_PER_DAY", "100"))
BUDGET_MAX_TOKENS_PER_DAY = int(os.getenv("BUDGET_MAX_TOKENS_PER_DAY", "200000"))
FIREBASE_STORAGE_BUCKET = os.getenv("FIREBASE_STORAGE_BUCKET", "")
SUPABASE_URL = os.getenv("SUPABASE_URL", "")
SUPABASE_KEY = os.getenv("SUPABASE_KEY", "")
SUPABASE_STORAGE_BUCKET = os.getenv("SUPABASE_STORAGE_BUCKET", "uploads")
# NVIDIA NIM — read here so litellm can find it via os.environ
NVIDIA_NIM_API_KEY = os.getenv("NVIDIA_NIM_API_KEY", "")
NVIDIA_API_KEY = os.getenv("NVIDIA_API_KEY", "")
if NVIDIA_NIM_API_KEY and not os.environ.get("NVIDIA_API_KEY"):
    os.environ["NVIDIA_API_KEY"] = NVIDIA_NIM_API_KEY
if NVIDIA_API_KEY and not os.environ.get("NVIDIA_NIM_API_KEY"):
    os.environ["NVIDIA_NIM_API_KEY"] = NVIDIA_API_KEY

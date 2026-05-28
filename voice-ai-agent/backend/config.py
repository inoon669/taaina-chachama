"""Central config — loads everything from .env once."""
import os
from dotenv import load_dotenv

# Load .env file from the backend directory
load_dotenv()

# ===== OpenAI =====
OPENAI_API_KEY: str = os.getenv("OPENAI_API_KEY", "").strip()
OPENAI_REALTIME_MODEL: str = os.getenv(
    "OPENAI_REALTIME_MODEL", "gpt-4o-realtime-preview-2024-12-17"
).strip()
OPENAI_VOICE: str = os.getenv("OPENAI_VOICE", "shimmer").strip()

# ===== Voice provider =====
VOICE_PROVIDER: str = os.getenv("VOICE_PROVIDER", "openai").strip().lower()

# ===== ElevenLabs (future) =====
ELEVENLABS_API_KEY: str = os.getenv("ELEVENLABS_API_KEY", "").strip()
ELEVENLABS_VOICE_ID: str = os.getenv("ELEVENLABS_VOICE_ID", "").strip()

# ===== Server =====
HOST: str = os.getenv("HOST", "0.0.0.0")
PORT: int = int(os.getenv("PORT", "8000"))
FRONTEND_ORIGIN: str = os.getenv("FRONTEND_ORIGIN", "http://localhost:8000").strip()

# Fail fast if critical config missing
if not OPENAI_API_KEY:
    raise RuntimeError(
        "OPENAI_API_KEY is missing. Copy .env.example to .env and fill it in."
    )

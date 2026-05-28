"""OpenAI Realtime API client.

Single responsibility: create an ephemeral session token that the browser uses
to connect via WebRTC. The full OpenAI API key NEVER leaves the server.

Docs: https://platform.openai.com/docs/guides/realtime
"""
import httpx
from typing import Any

from config import OPENAI_API_KEY, OPENAI_REALTIME_MODEL, OPENAI_VOICE
from prompts.system_prompt import SYSTEM_PROMPT

OPENAI_SESSIONS_URL = "https://api.openai.com/v1/realtime/sessions"


async def create_realtime_session(modalities: list[str]) -> dict[str, Any]:
    """Create an ephemeral Realtime session at OpenAI.

    Args:
        modalities: e.g. ['audio', 'text'] for full voice, or ['text'] for text-only.

    Returns:
        dict containing 'client_secret.value' — the ephemeral key the browser
        will use as the Bearer token when establishing the WebRTC connection.

    Raises:
        httpx.HTTPStatusError on API errors.
    """
    payload: dict[str, Any] = {
        "model": OPENAI_REALTIME_MODEL,
        "modalities": modalities,
        "voice": OPENAI_VOICE,
        "instructions": SYSTEM_PROMPT,
        # Whisper transcribes the user's speech so we can display it in the UI.
        "input_audio_transcription": {"model": "whisper-1"},
        # Server-side voice activity detection: OpenAI decides when the user
        # finished speaking. Lower silence_duration_ms = faster turn-taking.
        "turn_detection": {
            "type": "server_vad",
            "threshold": 0.5,
            "prefix_padding_ms": 300,
            "silence_duration_ms": 500,
        },
    }

    headers = {
        "Authorization": f"Bearer {OPENAI_API_KEY}",
        "Content-Type": "application/json",
    }

    async with httpx.AsyncClient(timeout=20.0) as client:
        response = await client.post(OPENAI_SESSIONS_URL, headers=headers, json=payload)
        response.raise_for_status()
        return response.json()

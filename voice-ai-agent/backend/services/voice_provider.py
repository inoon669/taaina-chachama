"""Voice provider abstraction.

Today: OpenAI Realtime API speaks the audio directly (lowest latency).
Tomorrow: swap to ElevenLabs by changing VOICE_PROVIDER=elevenlabs in .env.

When switching to ElevenLabs:
- modalities becomes ['text'] (OpenAI only emits text)
- frontend listens for text deltas, sends them to a /tts streaming endpoint
- /tts endpoint pipes text to ElevenLabs WebSocket and streams audio back
"""
from config import VOICE_PROVIDER


def get_session_modalities() -> list[str]:
    """Return modalities for the Realtime session based on the active voice provider."""
    if VOICE_PROVIDER == "elevenlabs":
        # OpenAI returns text only; ElevenLabs will do the speaking.
        return ["text"]
    # Default: OpenAI Realtime returns both spoken audio and matching text transcripts.
    return ["audio", "text"]


def is_openai_voice() -> bool:
    return VOICE_PROVIDER == "openai"


def is_elevenlabs_voice() -> bool:
    return VOICE_PROVIDER == "elevenlabs"


# ===== ElevenLabs streaming TTS (future) =====
# Implement when ready. Suggested approach:
#
#   import httpx
#   async def stream_elevenlabs_tts(text: str, voice_id: str):
#       url = f"https://api.elevenlabs.io/v1/text-to-speech/{voice_id}/stream"
#       headers = {"xi-api-key": ELEVENLABS_API_KEY, "Content-Type": "application/json"}
#       payload = {"text": text, "model_id": "eleven_turbo_v2_5"}
#       async with httpx.AsyncClient() as client:
#           async with client.stream("POST", url, headers=headers, json=payload) as r:
#               async for chunk in r.aiter_bytes():
#                   yield chunk

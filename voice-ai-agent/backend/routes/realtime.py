"""HTTP routes the browser hits."""
import httpx
from fastapi import APIRouter, HTTPException

from services.openai_client import create_realtime_session
from services.voice_provider import get_session_modalities
from config import OPENAI_REALTIME_MODEL, VOICE_PROVIDER

router = APIRouter(prefix="/api", tags=["realtime"])


@router.get("/session")
async def create_session():
    """Create a fresh ephemeral session for the browser.

    Returns the OpenAI session payload. The browser extracts
    `client_secret.value` and uses it as the Bearer token for the WebRTC
    connection to OpenAI.

    Frontend flow after this:
      1. Create RTCPeerConnection
      2. Attach mic audio track + create data channel 'oai-events'
      3. createOffer → setLocalDescription
      4. POST sdp to https://api.openai.com/v1/realtime?model=<model>
         with Authorization: Bearer <ephemeral_key>
      5. setRemoteDescription with answer SDP
    """
    try:
        modalities = get_session_modalities()
        session_data = await create_realtime_session(modalities=modalities)
        # Tell the frontend which voice provider is active so it can adapt.
        session_data["_meta"] = {
            "voice_provider": VOICE_PROVIDER,
            "model": OPENAI_REALTIME_MODEL,
        }
        return session_data
    except httpx.HTTPStatusError as e:
        # Forward OpenAI's error so the developer can see what went wrong.
        raise HTTPException(
            status_code=e.response.status_code,
            detail=f"OpenAI rejected the request: {e.response.text}",
        )
    except httpx.RequestError as e:
        raise HTTPException(status_code=502, detail=f"Network error: {e}")
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@router.get("/health")
async def health():
    return {
        "status": "ok",
        "model": OPENAI_REALTIME_MODEL,
        "voice_provider": VOICE_PROVIDER,
    }

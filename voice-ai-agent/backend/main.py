"""FastAPI app entry point.

Run with:    python main.py
Then open:   http://localhost:8000
"""
from pathlib import Path

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from fastapi.staticfiles import StaticFiles

from config import FRONTEND_ORIGIN, HOST, PORT
from routes.realtime import router as realtime_router

app = FastAPI(title="Voice AI Agent")

# --- CORS ---
# Allow the frontend (whether served by us or from a separate dev server).
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        FRONTEND_ORIGIN,
        "http://localhost:8000",
        "http://127.0.0.1:8000",
        "http://localhost:3000",
        "http://127.0.0.1:3000",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# --- API routes ---
app.include_router(realtime_router)

# --- Static frontend ---
# We serve frontend/index.html + frontend/app.js + frontend/styles.css directly
# so the entire app starts with a single `python main.py` command.
FRONTEND_DIR = Path(__file__).resolve().parent.parent / "frontend"

if FRONTEND_DIR.exists():

    @app.get("/")
    async def serve_index():
        return FileResponse(str(FRONTEND_DIR / "index.html"))

    @app.get("/app.js")
    async def serve_js():
        return FileResponse(str(FRONTEND_DIR / "app.js"), media_type="application/javascript")

    @app.get("/styles.css")
    async def serve_css():
        return FileResponse(str(FRONTEND_DIR / "styles.css"), media_type="text/css")

    # Generic static catch-all (favicons, etc.)
    app.mount("/static", StaticFiles(directory=str(FRONTEND_DIR)), name="static")


if __name__ == "__main__":
    print(f"\n  Voice AI Agent")
    print(f"  Server:  http://{HOST}:{PORT}")
    print(f"  Open:    http://localhost:{PORT}\n")
    uvicorn.run("main:app", host=HOST, port=PORT, reload=True)

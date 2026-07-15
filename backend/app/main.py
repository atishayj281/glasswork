import logging

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import chat, pipeline, upload
from app.config import CORS_ORIGIN
from app.logging_config import setup_logging

setup_logging()

app = FastAPI(title="Aegis Agentic Data Platform", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=[CORS_ORIGIN, "http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(upload.router, prefix="/api", tags=["upload"])
app.include_router(chat.router, prefix="/api", tags=["chat"])
app.include_router(pipeline.router, prefix="/api", tags=["pipeline"])


@app.get("/health")
async def health():
    return {"status": "ok"}

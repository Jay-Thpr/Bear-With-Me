from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.config import settings
from app.database import init_db
from app.routers import annotations, auth, characters, health, live, research, sessions, skills, users


@asynccontextmanager
async def lifespan(_app: FastAPI):
    init_db()
    yield


app = FastAPI(
    title="AI Skill Learner API",
    description="FastAPI backend for research, live coaching, and Workspace persistence.",
    version="0.1.0",
    lifespan=lifespan,
    # Avoid 307 /api/foo -> http://127.0.0.1:8000/api/foo/ which drops cookies set on localhost
    redirect_slashes=False,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origins_list,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(annotations.router)
app.include_router(characters.router)
app.include_router(health.router)
app.include_router(auth.router)
app.include_router(users.router)
app.include_router(skills.router)
app.include_router(sessions.router)
app.include_router(research.router)
app.include_router(live.router)

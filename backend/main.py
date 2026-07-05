"""FastAPI 主入口"""
import os
import sys
from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, BASE_DIR)
load_dotenv(os.path.join(BASE_DIR, ".env"))

from routes import resume, conversation, memory, report, onboarding, auth

app = FastAPI(title="生涯AI原型", version="0.1.0")


@app.on_event("startup")
def startup():
    from database import init_db
    init_db()

app.add_middleware(
    CORSMiddleware,
    allow_origins=os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(","),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(resume.router, prefix="/api/resume", tags=["简历"])
app.include_router(conversation.router, prefix="/api/conversation", tags=["对话"])
app.include_router(memory.router, prefix="/api/memory", tags=["记忆"])
app.include_router(report.router, prefix="/api/report", tags=["分析报告"])
app.include_router(onboarding.router, prefix="/api/onboarding", tags=["启程引导"])
app.include_router(auth.router, prefix="/api/auth", tags=["认证"])


@app.get("/api/health")
def health():
    return {"status": "ok"}

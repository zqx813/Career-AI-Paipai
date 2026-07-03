"""启程引导路由"""
import json
import os
from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from pydantic import BaseModel

router = APIRouter()


class OnboardingChatRequest(BaseModel):
    session_id: str
    message: str


@router.post("/chat")
def onboarding_chat(req: OnboardingChatRequest):
    """Onboarding 对话，流式返回"""
    from database import get_resume, get_conversation_history, save_message
    from llm_service import chat_stream

    resume = get_resume(req.session_id)
    history = get_conversation_history(req.session_id, "onboarding")

    # 保存用户消息
    save_message(req.session_id, "onboarding", "user", req.message)

    full_response = ""

    def generate():
        nonlocal full_response
        try:
            for chunk in chat_stream("onboarding", req.message, resume, history):
                full_response += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"

            save_message(req.session_id, "onboarding", "assistant", full_response)

            # AI 发出总结标记时，立刻提取 AI 记忆（供后续报告使用）
            if "[ONBOARDING_COMPLETE]" in full_response:
                try:
                    from database import get_all_messages, upsert_memories
                    from llm_service import extract_memories
                    all_msgs = get_all_messages(req.session_id)
                    extracted = extract_memories(all_msgs)
                    if extracted and any(v for v in extracted.values() if v):
                        upsert_memories(req.session_id, extracted)
                except Exception as e:
                    print(f"记忆提取失败: {e}")

            yield f"data: {json.dumps({'done': True,
                                        'onboarding_complete': '[ONBOARDING_COMPLETE]' in full_response})}\n\n"
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/start")
def start_onboarding(session_id: str):
    """Onboarding AI 主动发起第一条消息（幂等，已有消息则返回历史）"""
    from database import (get_resume as db_get_resume, get_conversation_history,
                           save_message, create_session, update_session_active)
    from llm_service import build_profile_context, ONBOARDING_PROMPT
    from llm_service import _get_llm

    create_session(session_id)
    update_session_active(session_id)

    # 幂等：如果已有 onboarding 消息，返回最早的 AI 消息
    existing = get_conversation_history(session_id, "onboarding")
    if existing:
        return {"ok": True, "data": {"content": existing[0]["content"]}}

    resume = db_get_resume(session_id)
    resume_text = build_profile_context(resume) if resume else "暂无简历"

    llm = _get_llm(temperature=0.8)
    prompt = f"""{ONBOARDING_PROMPT}

用户简历信息：
{resume_text}

请主动发起对话。简短打招呼（我是派派），结合简历问第一个开放问题。"""
    response = llm.invoke([{"role": "system", "content": prompt},
                           {"role": "user", "content": "开始吧"}]).content

    save_message(session_id, "onboarding", "assistant", response)
    return {"ok": True, "data": {"content": response}}


@router.post("/complete")
def complete_onboarding_route(session_id: str):
    """标记 onboarding 完成 + 提取首次 AI 记忆"""
    from database import complete_onboarding, get_all_messages, upsert_memories
    from llm_service import extract_memories

    complete_onboarding(session_id)

    # 从 onboarding 对话提取记忆
    all_msgs = get_all_messages(session_id)
    if all_msgs:
        extracted = extract_memories(all_msgs)
        if extracted and any(v for v in extracted.values() if v):
            upsert_memories(session_id, extracted)

    return {"ok": True}


@router.get("/status")
def onboarding_status(session_id: str):
    """检查 onboarding 状态：是否完成 + 当前步骤 + 各阶段标记"""
    from database import is_onboarding_complete, get_onboarding_step, has_onboarding_summary, has_any_report, is_invite_verified
    invite_verified = True if os.getenv("REQUIRE_INVITE", "true").lower() == "false" else is_invite_verified(session_id)
    return {"ok": True, "data": {
        "onboarding_complete": is_onboarding_complete(session_id),
        "onboarding_step": get_onboarding_step(session_id),
        "has_chat_summary": has_onboarding_summary(session_id),
        "has_report": has_any_report(session_id),
        "invite_verified": invite_verified,
    }}


@router.post("/set-step")
def set_onboarding_step(session_id: str, step: str):
    """更新 onboarding 步骤"""
    from database import update_onboarding_step
    update_onboarding_step(session_id, step)
    return {"ok": True}

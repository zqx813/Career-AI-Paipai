"""对话相关路由"""
import json
from fastapi import APIRouter, Depends
from fastapi.responses import StreamingResponse
from pydantic import BaseModel
from typing import Optional
from auth_deps import get_current_session_id

router = APIRouter()


class ChatRequest(BaseModel):
    scenario: str
    message: str
    thread_id: Optional[str] = None


@router.post("/send")
def send_message(req: ChatRequest, session_id: str = Depends(get_current_session_id)):
    """发送消息，流式返回 AI 回复"""
    from database import (get_resume, get_memories, get_conversation_history,
                           save_message, create_thread, get_thread_titles,
                           update_thread_title, get_threads)
    from llm_service import chat_stream, generate_thread_title

    resume = get_resume(session_id)
    memories = get_memories(session_id)
    history = get_conversation_history(session_id, req.scenario, req.thread_id or '')

    # 自动创建线程
    thread_id = req.thread_id
    if not thread_id:
        thread_id = create_thread(session_id, req.scenario)
    else:
        existing_threads = [t['thread_id'] for t in
                            get_threads(session_id, req.scenario)]
        if not existing_threads:
            thread_id = create_thread(session_id, req.scenario, thread_id=thread_id)

    # 保存用户消息
    save_message(session_id, req.scenario, "user", req.message, thread_id)

    # 流式回复（先收集完整回复再存储）
    full_response = ""

    def generate():
        nonlocal full_response
        try:
            for chunk in chat_stream(req.scenario, req.message, resume, history, memories):
                full_response += chunk
                yield f"data: {json.dumps({'chunk': chunk})}\n\n"

            # 先发 done，前端立即结束流式状态
            yield f"data: {json.dumps({'done': True, 'thread_id': thread_id})}\n\n"

            # 以下为后台操作，不阻塞用户界面
            save_message(session_id, req.scenario, "assistant", full_response, thread_id)

            from database import (should_extract_memories, get_messages_since,
                                       get_new_message_stats, get_memories,
                                       upsert_memories, get_thread_context)
            from llm_service import extract_memories
            if should_extract_memories(session_id):
                try:
                    _, since_id, max_id = get_new_message_stats(session_id)
                    new_msgs = get_messages_since(session_id, since_id)
                    ctx_msgs = get_thread_context(session_id, since_id, new_msgs)
                    existing = get_memories(session_id)
                    extracted = extract_memories(new_msgs, existing, ctx_msgs)
                    if extracted and any(v for v in extracted.values() if v):
                        upsert_memories(session_id, extracted, max_id)
                except Exception as e:
                    print(f"常规对话记忆提取失败: {e}")

            user_msgs = get_conversation_history(session_id, req.scenario, thread_id)
            if len([m for m in user_msgs if m['role'] == 'user']) == 1:
                existing = get_thread_titles(session_id, req.scenario)
                title = generate_thread_title(req.message, existing)
                update_thread_title(thread_id, title)
        except Exception as e:
            yield f"data: {json.dumps({'error': str(e)})}\n\n"

    return StreamingResponse(generate(), media_type="text/event-stream")


@router.get("/history")
def get_history(session_id: str = Depends(get_current_session_id), scenario: str = "", thread_id: str = ""):
    """获取对话历史"""
    from database import get_conversation_history
    return {"ok": True, "data": get_conversation_history(session_id, scenario, thread_id)}


@router.get("/threads")
def get_threads(session_id: str = Depends(get_current_session_id), scenario: str = ""):
    """获取对话线程列表"""
    from database import get_threads
    return {"ok": True, "data": get_threads(session_id, scenario)}


@router.delete("/thread")
def delete_thread(thread_id: str):
    """删除对话线程"""
    from database import delete_thread
    delete_thread(thread_id)
    return {"ok": True}

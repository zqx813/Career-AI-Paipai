"""AI记忆相关路由"""
from fastapi import APIRouter
from pydantic import BaseModel
from typing import Optional

router = APIRouter()


class MemoryModifyRequest(BaseModel):
    session_id: str
    instruction: str


@router.get("/get")
def get_memories(session_id: str):
    from database import get_memories as db_get
    try:
        data = db_get(session_id)
        return {"ok": True, "data": data}
    except Exception as e:
        print(f"获取记忆失败: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/modify")
def modify_memory(req: MemoryModifyRequest):
    """用户发送自然语言指令让 AI 修改记忆"""
    from database import get_memories as db_get, upsert_memories, save_undo_snapshot, MEMORY_FIELDS
    from llm_service import modify_memories as llm_modify

    try:
        save_undo_snapshot(req.session_id)  # 修改前备份

        current = db_get(req.session_id) or {}
        changes = llm_modify(req.instruction.strip(), current)
        if not changes or not any(v for v in changes.values() if v):
            return {"ok": False, "error": "未能识别需要修改的字段，请更具体地描述"}

        updated = {**current}
        for f in MEMORY_FIELDS:
            if changes.get(f):
                updated[f] = changes[f]

        changed_fields = [f for f in MEMORY_FIELDS if changes.get(f) and changes.get(f) != current.get(f, '')]
        upsert_memories(req.session_id, updated)
        return {"ok": True, "data": updated, "changed_fields": changed_fields}
    except Exception as e:
        print(f"修改记忆失败: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/undo")
def undo_memory(session_id: str):
    """撤销上次手动修改"""
    from database import undo_last_modify
    try:
        data = undo_last_modify(session_id)
        if data is None:
            return {"ok": False, "error": "没有可撤销的修改"}
        return {"ok": True, "data": data}
    except Exception as e:
        print(f"撤销记忆失败: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/re-extract")
def re_extract_memories(session_id: str):
    """从全部对话历史重新提取记忆"""
    from database import get_all_messages, upsert_memories
    from llm_service import extract_memories

    try:
        all_msgs = get_all_messages(session_id)
        if not all_msgs:
            return {"ok": False, "error": "暂无对话历史"}

        extracted = extract_memories(all_msgs)
        if not extracted or not any(v for v in extracted.values() if v):
            return {"ok": False, "error": "未能提取到有效信息"}

        upsert_memories(session_id, extracted)
        return {"ok": True, "data": extracted}
    except Exception as e:
        print(f"重新提取记忆失败: {e}")
        return {"ok": False, "error": str(e)}


@router.post("/clear")
def clear_memories(session_id: str):
    from database import clear_memories
    try:
        clear_memories(session_id)
        return {"ok": True}
    except Exception as e:
        print(f"清空记忆失败: {e}")
        return {"ok": False, "error": str(e)}

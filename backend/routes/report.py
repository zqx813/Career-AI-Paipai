"""分析报告相关路由"""
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from typing import List
from auth_deps import get_current_session_id

router = APIRouter()


class ReportRequest(BaseModel):
    target_position: str


class SyncRoadmapRequest(BaseModel):
    messages: List[dict]
    report_id: int | None = None  # 指定报告 ID，不传则更新最新


@router.post("/generate")
def generate_report(req: ReportRequest, session_id: str = Depends(get_current_session_id)):
    """生成分析报告"""
    from database import get_resume, get_memories, save_report
    from llm_service import generate_report as gen
    import json, os

    try:
        resume = get_resume(session_id)
        memories = get_memories(session_id)

        # 加载预置信息库
        info_base = {}
        info_path = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                 'data', 'info_base.json')
        if os.path.exists(info_path):
            with open(info_path, 'r', encoding='utf-8') as f:
                info_base = json.load(f)

        result = gen(resume, memories, req.target_position, info_base)
        if result:
            save_report(session_id, req.target_position,
                        result.get('match_score', 0),
                        result.get('skill_gaps', []),
                        result.get('recommended_directions', []),
                        result.get('roadmap', {}),
                        result.get('sources', []))
        return {"ok": True, "data": result}
    except Exception as e:
        print(f"生成报告失败: {e}")
        return {"ok": False, "error": str(e)}


@router.get("/list")
def list_reports(session_id: str = Depends(get_current_session_id)):
    """获取历史报告列表"""
    from database import get_reports
    try:
        return {"ok": True, "data": get_reports(session_id)}
    except Exception as e:
        print(f"获取报告列表失败: {e}")
        return {"ok": False, "error": str(e)}


@router.get("/latest")
def latest_report(session_id: str = Depends(get_current_session_id)):
    """获取最新报告"""
    from database import get_latest_report
    try:
        return {"ok": True, "data": get_latest_report(session_id)}
    except Exception as e:
        print(f"获取最新报告失败: {e}")
        return {"ok": False, "error": str(e)}


@router.get("/{report_id}")
def get_report(report_id: int, session_id: str = Depends(get_current_session_id)):
    """按 ID 获取单条报告"""
    from database import get_report_by_id
    try:
        report = get_report_by_id(session_id, report_id)
        return {"ok": True, "data": report} if report else {"ok": False, "error": "报告不存在"}
    except Exception as e:
        print(f"获取报告失败: {e}")
        return {"ok": False, "error": str(e)}


@router.put("/sync-roadmap")
def sync_roadmap(req: SyncRoadmapRequest, session_id: str = Depends(get_current_session_id)):
    """从路线图对话中提取修改后的 roadmap 并持久化"""
    from database import get_latest_report, get_report_by_id, update_report_roadmap
    from llm_service import _get_llm, _invoke_with_retry, _parse_json_response
    from langchain_core.messages import SystemMessage, HumanMessage
    import json

    if req.report_id:
        report = get_report_by_id(session_id, req.report_id)
    else:
        report = get_latest_report(session_id)
    if not report:
        return {"ok": False, "error": "没有找到报告"}

    current_roadmap = json.dumps(report.get('roadmap', {}), ensure_ascii=False)

    prompt = """从以下路线图修改对话中提取更新后的学习路径。

当前路线图：
{current}

对话记录：
{conversation}

请根据对话内容输出修改后的完整路线图 JSON，格式：
{{
    "title": "推荐学习路径",
    "steps": [
        {{"order": 1, "title": "...", "description": "...", "duration": "...", "resources": ["..."]}}
    ]
}}

只返回 JSON，不要有其他文字。"""

    conversation = "\n".join(
        f"{'用户' if m['role']=='user' else 'AI'}：{m['content']}" for m in req.messages)

    llm = _get_llm(temperature=0.3)
    try:
        response = _invoke_with_retry(llm, [
            SystemMessage(content=prompt.format(current=current_roadmap, conversation=conversation)),
        ]).content
        updated = _parse_json_response(response)
        update_report_roadmap(session_id, report['id'], updated)
        return {"ok": True, "data": updated}
    except Exception as e:
        print(f"路线图同步失败: {e}")
        return {"ok": False, "error": str(e)}

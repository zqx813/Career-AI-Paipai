"""邀请码验证路由"""
import os
from fastapi import APIRouter
from pydantic import BaseModel

router = APIRouter()


class InviteRequest(BaseModel):
    session_id: str
    code: str


def _require_invite() -> bool:
    return os.getenv("REQUIRE_INVITE", "true").lower() != "false"


@router.post("/verify-invite")
def verify_invite(req: InviteRequest):
    if not _require_invite():
        from database import is_invite_verified
        verified = is_invite_verified(req.session_id)
        return {"ok": True, "data": {"valid": True, "invite_verified": verified}}

    from database import verify_invite_code
    role = verify_invite_code(req.code.strip(), req.session_id)
    if role:
        return {"ok": True, "data": {"valid": True, "role": role}}
    return {"ok": False, "error": "邀请码无效或已被使用"}


@router.get("/invite-status")
def invite_status(session_id: str):
    if not _require_invite():
        return {"ok": True, "data": {"invite_verified": True}}

    from database import is_invite_verified
    return {"ok": True, "data": {"invite_verified": is_invite_verified(session_id)}}

"""认证路由 — 邀请码验证 / 注册 / 登录"""
import os
import bcrypt
from fastapi import APIRouter, Depends
from pydantic import BaseModel
from auth_deps import get_current_user

router = APIRouter()


class InviteRequest(BaseModel):
    session_id: str
    code: str


class RegisterRequest(BaseModel):
    username: str
    password: str
    invite_code: str


class LoginRequest(BaseModel):
    username: str
    password: str


def _require_invite() -> bool:
    return os.getenv("REQUIRE_INVITE", "true").lower() != "false"


# ══════════════════════════════════════════════
# 注册 / 登录
# ══════════════════════════════════════════════

@router.post("/register")
def register(req: RegisterRequest):
    """注册新用户，需提供有效邀请码"""
    from database import get_user_by_username, create_user, verify_invite_code, get_session_for_user
    from database import update_session_active
    from auth_deps import create_token

    username = req.username.strip()
    password = req.password.strip()
    invite_code = req.invite_code.strip()

    # 校验输入
    if len(username) < 3:
        return {"ok": False, "error": "用户名至少 3 个字符"}
    if len(password) < 6:
        return {"ok": False, "error": "密码至少 6 个字符"}

    # 检查用户名唯一
    if get_user_by_username(username):
        return {"ok": False, "error": "用户名已被注册"}

    # 创建用户（先创建用户以获取 session_id，再验证邀请码）
    password_hash = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")
    user_id = create_user(username, password_hash)
    session_id = get_session_for_user(user_id)
    update_session_active(session_id)

    # 验证并消费邀请码
    if _require_invite():
        role = verify_invite_code(invite_code, session_id)
        if not role:
            return {"ok": False, "error": "邀请码无效或已被使用"}

    token = create_token(user_id, username)
    return {"ok": True, "data": {"token": token, "session_id": session_id, "username": username}}


@router.post("/login")
def login(req: LoginRequest):
    """登录"""
    from database import get_user_by_username, get_session_for_user, update_session_active
    from auth_deps import create_token

    username = req.username.strip()
    password = req.password.strip()

    user = get_user_by_username(username)
    if not user:
        return {"ok": False, "error": "用户名或密码错误"}

    if not bcrypt.checkpw(password.encode("utf-8"), user["password_hash"].encode("utf-8")):
        return {"ok": False, "error": "用户名或密码错误"}

    session_id = get_session_for_user(user["id"])
    update_session_active(session_id)

    token = create_token(user["id"], username)
    return {"ok": True, "data": {"token": token, "session_id": session_id, "username": username}}


@router.get("/me")
def me(user: dict = Depends(get_current_user)):
    """验证 token 有效性，返回当前用户信息"""
    return {"ok": True, "data": {"user_id": user["user_id"], "username": user["username"]}}


# ══════════════════════════════════════════════
# 邀请码验证（保留兼容）
# ══════════════════════════════════════════════

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
    return {"ok": True, "data": {"invite_verified": is_invite_verified(session_id)})

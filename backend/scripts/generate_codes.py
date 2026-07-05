"""邀请码生成脚本

用法:
  python scripts/generate_codes.py 20                 # 生成 20 个随机码
  python scripts/generate_codes.py 20 --list           # 生成并打印
  python scripts/generate_codes.py --list              # 仅列出已有码
  python scripts/generate_codes.py --custom "DEV-ZQX"  # 生成一个自定义码
  python scripts/generate_codes.py --custom "DEV-ZQX" --role developer  # 自定义码 + 开发者角色
  python scripts/generate_codes.py 5 --export codes.txt  # 生成并导出到文件
  python scripts/generate_codes.py --revoke "c08e8df9"    # 删除码（不影响用户）
  python scripts/generate_codes.py --ban "2036804e"       # 删码并踢出用户
"""
import os
import sys
import secrets
import argparse

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from dotenv import load_dotenv
load_dotenv()

from database import get_connection


def generate_codes(count: int, export_path: str = None) -> list:
    conn = get_connection()
    existing = set(
        r[0] for r in conn.execute("SELECT code FROM invite_codes").fetchall()
    )
    new_codes = []
    attempts = 0
    while len(new_codes) < count and attempts < count * 10:
        code = secrets.token_hex(4)[:8]
        attempts += 1
        if code in existing:
            continue
        existing.add(code)
        new_codes.append(code)

    for code in new_codes:
        conn.execute("INSERT INTO invite_codes (code) VALUES (?)", (code,))
    conn.commit()
    conn.close()

    if export_path and new_codes:
        with open(export_path, "w", encoding="utf-8") as f:
            f.write("\n".join(new_codes))
        print(f"已导出到 {export_path}")

    return new_codes


def create_custom_code(code: str, role: str = "user"):
    conn = get_connection()
    existing = conn.execute(
        "SELECT code FROM invite_codes WHERE code=?", (code,)
    ).fetchone()
    if existing:
        conn.close()
        print(f"错误：邀请码 '{code}' 已存在")
        return False
    conn.execute(
        "INSERT INTO invite_codes (code, role) VALUES (?, ?)", (code, role))
    conn.commit()
    conn.close()
    print(f"已创建{role}邀请码: {code}")
    return True


def list_codes():
    conn = get_connection()
    rows = conn.execute("""
        SELECT ic.code, ic.role, ic.is_used, ic.used_by_session_id, ic.used_at, ic.created_at, u.username
        FROM invite_codes ic
        LEFT JOIN sessions s ON ic.used_by_session_id = s.session_id
        LEFT JOIN users u ON s.user_id = u.id
        ORDER BY ic.created_at DESC
        LIMIT 200
    """).fetchall()
    conn.close()
    if not rows:
        print("暂无邀请码")
        return
    print(f"{'邀请码':<14} {'角色':<12} {'状态':<10} {'绑定用户':<14} {'使用时间'}")
    print("-" * 80)
    for r in rows:
        status = "已使用" if r['is_used'] else "可用"
        user = r['username'][:12] if r['username'] else "-"
        used_at = r['used_at'] if r['used_at'] else "-"
        print(f"  {r['code']:<12} {r['role']:<12} {status:<10} {user:<14} {used_at}")


def revoke_code(code: str):
    """删除（废除）指定邀请码，不影响已绑定用户"""
    conn = get_connection()
    cur = conn.execute("DELETE FROM invite_codes WHERE code=?", (code,))
    conn.commit()
    deleted = cur.rowcount
    conn.close()
    if deleted:
        print(f"已删除邀请码: {code}")
    else:
        print(f"未找到邀请码: {code}")


def ban_code(code: str):
    """删除邀请码，同时踢掉已绑定用户（重置 invite_verified）"""
    conn = get_connection()
    row = conn.execute(
        "SELECT used_by_session_id FROM invite_codes WHERE code=?", (code,)
    ).fetchone()
    if not row:
        conn.close()
        print(f"未找到邀请码: {code}")
        return
    sid = row['used_by_session_id']
    conn.execute("DELETE FROM invite_codes WHERE code=?", (code,))
    if sid:
        conn.execute(
            "UPDATE sessions SET invite_verified=0 WHERE session_id=?", (sid,))
        conn.commit()
        conn.close()
        print(f"已删除邀请码 {code}，并踢出 session: {sid[:12]}...")
    else:
        conn.commit()
        conn.close()
        print(f"已删除邀请码: {code}（未被使用过，无需踢出）")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description="邀请码管理")
    parser.add_argument("count", nargs="?", type=int, default=0, help="生成数量")
    parser.add_argument("--list", action="store_true", help="列出/打印邀请码")
    parser.add_argument("--export", type=str, default=None, help="导出到文件")
    parser.add_argument("--custom", type=str, default=None, help="创建自定义邀请码")
    parser.add_argument("--revoke", type=str, default=None, help="删除邀请码，不影响已绑定用户")
    parser.add_argument("--ban", type=str, default=None, help="删除邀请码并踢出已绑定用户")
    parser.add_argument("--role", type=str, default="user", help="指定角色 (user/developer/admin)")
    args = parser.parse_args()

    if args.ban:
        ban_code(args.ban)
    elif args.revoke:
        revoke_code(args.revoke)
    elif args.custom:
        create_custom_code(args.custom, args.role)
    elif args.count > 0:
        codes = generate_codes(args.count, args.export)
        print(f"已生成 {len(codes)} 个邀请码")
        if args.list:
            print("\n".join(codes))
    elif args.list:
        list_codes()
    else:
        parser.print_help()

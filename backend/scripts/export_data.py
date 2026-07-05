"""导出用户数据 — 通过邀请码查找关联数据并打印

用法:
  python scripts/export_data.py DEV_ZQX
"""
import sys

if len(sys.argv) < 2:
    print("用法: python scripts/export_data.py <邀请码>")
    sys.exit(1)

code = sys.argv[1]

from database import get_connection
conn = get_connection()

row = conn.execute("SELECT used_by_session_id, used_at FROM invite_codes WHERE code=?", (code,)).fetchone()
if not row or not row['used_by_session_id']:
    print(f'邀请码 {code} 未被使用或不存在')
    conn.close()
    sys.exit(0)

sid = row['used_by_session_id']
print(f'Session ID: {sid}')
print(f'使用时间: {row["used_at"]}')
print()

r = conn.execute('SELECT name, education, major, skills_json, work_years, raw_text FROM resume_data WHERE session_id=?', (sid,)).fetchone()
if r:
    print('=== 简历 ===')
    print(f'姓名: {r["name"]}')
    print(f'学历: {r["education"]} / {r["major"]}')
    print(f'工作年限: {r["work_years"]}')
    print(f'技能: {r["skills_json"]}')
    raw = (r["raw_text"] or "")[:500]
    print(f'原文前500字: {raw}')
    print()

m = conn.execute('SELECT * FROM ai_memories WHERE session_id=?', (sid,)).fetchone()
if m:
    print('=== AI 记忆 ===')
    for k in ['career_interests','skills_self_assessment','values_field','current_stage','target_position','concerns','free_notes']:
        if m[k]:
            print(f'{k}: {m[k]}')
    print()

msgs = conn.execute('SELECT role, content, created_at FROM ai_conversations WHERE session_id=? ORDER BY id ASC', (sid,)).fetchall()
if msgs:
    print(f'=== 对话记录 ({len(msgs)} 条) ===')
    for msg in msgs:
        role = '用户' if msg['role']=='user' else '派派'
        c = msg['content'] or ''
        content = c[:300] + '...' if len(c) > 300 else c
        print(f'[{role}] {content}')
        print()

reps = conn.execute('SELECT target_position, match_score, skill_gaps_json, recommended_directions_json, created_at FROM analysis_reports WHERE session_id=? ORDER BY id ASC', (sid,)).fetchall()
if reps:
    print(f'=== 分析报告 ({len(reps)} 条) ===')
    for rep in reps:
        print(f'目标: {rep["target_position"]} | 匹配分: {rep["match_score"]}')
        print(f'时间: {rep["created_at"]}')
        print()

conn.close()

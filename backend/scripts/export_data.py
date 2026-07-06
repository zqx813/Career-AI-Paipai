"""导出用户数据 — 通过邀请码查找关联数据并打印

用法:
  python scripts/export_data.py DEV_ZQX
"""
import os
import sys
import json

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

if len(sys.argv) < 2:
    print("用法: python scripts/export_data.py <邀请码>")
    sys.exit(1)

code = sys.argv[1]

from database import get_connection, _exec as q, _all, _one
conn = get_connection()

row = _one(q(conn, "SELECT used_by_session_id, used_at FROM invite_codes WHERE code=?", (code,)))
if not row or not row['used_by_session_id']:
    print(f'邀请码 {code} 未被使用或不存在')
    conn.close()
    sys.exit(0)

sid = row['used_by_session_id']
print(f'Session ID: {sid}')
print(f'使用时间: {row["used_at"]}')
print()

r = _one(q(conn, 'SELECT name, education, major, education_background_json, skills_json, work_years, raw_text FROM resume_data WHERE session_id=?', (sid,)))
if r:
    print('=== 简历 ===')
    print(f'姓名: {r["name"]}')
    # 优先用 education/major 列，为空则从 education_background_json 解析
    edu = r["education"] or ''
    major = r["major"] or ''
    if not edu or not major:
        try:
            edu_list = json.loads(r['education_background_json'] or '[]')
            if edu_list:
                first = edu_list[0]
                edu = edu or first.get('school', '') or first.get('education', '')
                major = major or first.get('major', '') or first.get('degree', '')
        except (json.JSONDecodeError, IndexError):
            pass
    print(f'学历: {edu} / {major}')
    print(f'工作年限: {r["work_years"]}')
    try:
        skills = json.loads(r['skills_json'] or '[]')
        print(f'技能: {", ".join(skills) if isinstance(skills, list) else skills}')
    except (json.JSONDecodeError, TypeError):
        print(f'技能: {r["skills_json"]}')
    raw = (r["raw_text"] or "")[:500]
    print(f'原文前500字: {raw}')
    print()

m = _one(q(conn, 'SELECT * FROM ai_memories WHERE session_id=?', (sid,)))
if m:
    print('=== AI 记忆 ===')
    for k in ['career_interests','skills_self_assessment','values_field','current_stage','target_position','concerns','free_notes']:
        if m[k]:
            print(f'{k}: {m[k]}')
    print()

msgs = _all(q(conn, 'SELECT role, content, created_at FROM ai_conversations WHERE session_id=? ORDER BY id ASC', (sid,)))
if msgs:
    print(f'=== 对话记录 ({len(msgs)} 条) ===')
    for msg in msgs:
        role = '用户' if msg['role']=='user' else '派派'
        c = msg['content'] or ''
        content = c[:300] + '...' if len(c) > 300 else c
        print(f'[{role}] {content}')
        print()

reps = _all(q(conn, 'SELECT target_position, match_score, skill_gaps_json, recommended_directions_json, created_at FROM analysis_reports WHERE session_id=? ORDER BY id ASC', (sid,)))
if reps:
    print(f'=== 分析报告 ({len(reps)} 条) ===')
    for rep in reps:
        print(f'目标: {rep["target_position"]} | 匹配分: {rep["match_score"]}')
        print(f'时间: {rep["created_at"]}')
        print()

conn.close()

"""
数据库模块 — SQLite（本地）/ PostgreSQL（Railway）
通过 DATABASE_URL 环境变量自动切换：有则用 PG，无则用 SQLite
"""
import os
import json
import uuid
from datetime import datetime
from typing import Optional, Dict, List

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
DATA_DIR = os.path.join(BASE_DIR, 'data')
os.makedirs(DATA_DIR, exist_ok=True)

DB_TYPE = "postgresql" if os.getenv("DATABASE_URL") else "sqlite"
DB_PATH = os.getenv("DATABASE_PATH", os.path.join(DATA_DIR, 'career_agent.db'))


# ══════════════════════════════════════════════
# 连接与查询抽象
# ══════════════════════════════════════════════

def _get_conn():
    """返回数据库连接"""
    if DB_TYPE == "postgresql":
        import psycopg2
        return psycopg2.connect(os.getenv("DATABASE_URL"))
    else:
        import sqlite3
        conn = sqlite3.connect(DB_PATH)
        conn.row_factory = sqlite3.Row
        conn.execute("PRAGMA journal_mode=WAL")
        return conn


def _exec(conn, sql, params=()):
    """统一执行 SQL，自动处理 ? → %s 占位符转换"""
    if DB_TYPE == "postgresql":
        sql = sql.replace("?", "%s")
    cur = conn.cursor()
    cur.execute(sql, params)
    return cur


def _one(cur):
    """取一行，统一返回 dict-like 对象"""
    row = cur.fetchone()
    if row is None:
        return None
    if DB_TYPE == "postgresql":
        cols = [desc[0] for desc in cur.description]
        return dict(zip(cols, row))
    return row


def _all(cur):
    """取全部行，统一返回 list of dict"""
    if DB_TYPE == "postgresql":
        rows = cur.fetchall()
        cols = [desc[0] for desc in cur.description]
        return [dict(zip(cols, r)) for r in rows]
    return cur.fetchall()


def _fix_json_keys(d: dict) -> dict:
    return {int(k) if k.lstrip('-').isdigit() else k: v for k, v in d.items()}


# ══════════════════════════════════════════════
# 建表
# ══════════════════════════════════════════════

def init_db():
    conn = _get_conn()
    pk = "SERIAL PRIMARY KEY" if DB_TYPE == "postgresql" else "INTEGER PRIMARY KEY AUTOINCREMENT"

    _exec(conn, f"""
        CREATE TABLE IF NOT EXISTS sessions (
            session_id TEXT PRIMARY KEY,
            onboarding_complete INTEGER DEFAULT 0,
            onboarding_step TEXT DEFAULT 'welcome',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            last_active TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            invite_verified INTEGER DEFAULT 0
        )
    """)

    # 兼容旧表缺少的列
    for col, col_def in [
        ("onboarding_step", "TEXT DEFAULT 'welcome'"),
        ("invite_verified", "INTEGER DEFAULT 0"),
    ]:
        try:
            _exec(conn, f"ALTER TABLE sessions ADD COLUMN {col} {col_def}")
        except Exception:
            pass

    _exec(conn, f"""
        CREATE TABLE IF NOT EXISTS invite_codes (
            code TEXT PRIMARY KEY,
            is_used INTEGER DEFAULT 0,
            role TEXT DEFAULT 'user',
            used_by_session_id TEXT DEFAULT NULL,
            used_at TIMESTAMP DEFAULT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (used_by_session_id) REFERENCES sessions(session_id)
        )
    """)

    try:
        _exec(conn, "ALTER TABLE invite_codes ADD COLUMN role TEXT DEFAULT 'user'")
    except Exception:
        pass

    _exec(conn, f"""
        CREATE TABLE IF NOT EXISTS resume_data (
            id {pk},
            session_id TEXT NOT NULL,
            name TEXT DEFAULT '',
            education_background_json TEXT DEFAULT '[]',
            skills_json TEXT DEFAULT '[]',
            work_years INTEGER DEFAULT 0,
            education TEXT DEFAULT '',
            major TEXT DEFAULT '',
            certificates_json TEXT DEFAULT '[]',
            work_experience_json TEXT DEFAULT '[]',
            projects_json TEXT DEFAULT '[]',
            internships_json TEXT DEFAULT '[]',
            raw_text TEXT DEFAULT '',
            confirmed INTEGER DEFAULT 0,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
    """)

    for col, col_def in [("education_background_json", "TEXT DEFAULT '[]'")]:
        try:
            _exec(conn, f"ALTER TABLE resume_data ADD COLUMN {col} {col_def}")
        except Exception:
            pass

    _exec(conn, f"""
        CREATE TABLE IF NOT EXISTS conversation_threads (
            thread_id TEXT NOT NULL,
            session_id TEXT NOT NULL,
            scenario TEXT NOT NULL,
            title TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            PRIMARY KEY (thread_id),
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
    """)

    _exec(conn, f"""
        CREATE TABLE IF NOT EXISTS ai_conversations (
            id {pk},
            session_id TEXT NOT NULL,
            scenario TEXT NOT NULL,
            thread_id TEXT DEFAULT '',
            role TEXT NOT NULL,
            content TEXT DEFAULT '',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
    """)

    _exec(conn, f"""
        CREATE TABLE IF NOT EXISTS ai_memories (
            id {pk},
            session_id TEXT NOT NULL UNIQUE,
            career_interests TEXT DEFAULT '',
            skills_self_assessment TEXT DEFAULT '',
            values_field TEXT DEFAULT '',
            current_stage TEXT DEFAULT '',
            target_position TEXT DEFAULT '',
            concerns TEXT DEFAULT '',
            free_notes TEXT DEFAULT '',
            source TEXT DEFAULT 'auto',
            last_extracted_message_id INTEGER DEFAULT 0,
            undo_data_json TEXT DEFAULT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
    """)

    # 用 {{}} 转义 f-string 中的字面量花括号
    _exec(conn, f"""
        CREATE TABLE IF NOT EXISTS analysis_reports (
            id {pk},
            session_id TEXT NOT NULL,
            target_position TEXT DEFAULT '',
            match_score INTEGER DEFAULT 0,
            skill_gaps_json TEXT DEFAULT '[]',
            recommended_directions_json TEXT DEFAULT '[]',
            roadmap_json TEXT DEFAULT '{{}}',
            sources_json TEXT DEFAULT '[]',
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (session_id) REFERENCES sessions(session_id)
        )
    """)

    conn.commit()
    conn.close()


# ══════════════════════════════════════════════
# Session
# ══════════════════════════════════════════════

def create_session(session_id: str = None) -> str:
    if not session_id:
        session_id = str(uuid.uuid4())[:8]
    conn = _get_conn()
    _exec(conn,
        "INSERT INTO sessions (session_id, last_active) VALUES (?, ?) "
        "ON CONFLICT(session_id) DO UPDATE SET last_active = EXCLUDED.last_active",
        (session_id, datetime.now()))
    conn.commit()
    conn.close()
    return session_id


def update_session_active(session_id: str):
    conn = _get_conn()
    _exec(conn, "UPDATE sessions SET last_active=? WHERE session_id=?",
          (datetime.now(), session_id))
    conn.commit()
    conn.close()


def complete_onboarding(session_id: str):
    conn = _get_conn()
    _exec(conn, "UPDATE sessions SET onboarding_complete=1 WHERE session_id=?",
          (session_id,))
    conn.commit()
    conn.close()


def is_onboarding_complete(session_id: str) -> bool:
    conn = _get_conn()
    row = _one(_exec(conn, "SELECT onboarding_complete FROM sessions WHERE session_id=?",
                     (session_id,)))
    conn.close()
    return bool(row and row['onboarding_complete'])


def has_onboarding_summary(session_id: str) -> bool:
    conn = _get_conn()
    row = _one(_exec(conn, """
        SELECT content FROM ai_conversations
        WHERE session_id=? AND scenario='onboarding' AND role='assistant'
        ORDER BY id DESC LIMIT 1
    """, (session_id,)))
    conn.close()
    return bool(row and "[ONBOARDING_COMPLETE]" in (row['content'] or ''))


def has_any_report(session_id: str) -> bool:
    conn = _get_conn()
    row = _one(_exec(conn, "SELECT COUNT(*) as cnt FROM analysis_reports WHERE session_id=?",
                     (session_id,)))
    conn.close()
    return bool(row and row['cnt'] > 0)


def update_onboarding_step(session_id: str, step: str):
    conn = _get_conn()
    now = datetime.now()
    _exec(conn, """
        INSERT INTO sessions (session_id, onboarding_step, created_at, last_active)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(session_id) DO UPDATE SET onboarding_step=?, last_active=?
    """, (session_id, step, now, now, step, now))
    conn.commit()
    conn.close()


def get_onboarding_step(session_id: str) -> str:
    conn = _get_conn()
    row = _one(_exec(conn, "SELECT onboarding_step FROM sessions WHERE session_id=?",
                     (session_id,)))
    conn.close()
    return row['onboarding_step'] if row else 'welcome'


# ══════════════════════════════════════════════
# Invite
# ══════════════════════════════════════════════

def verify_invite_code(code: str, session_id: str) -> Optional[str]:
    conn = _get_conn()
    row = _one(_exec(conn,
        "SELECT is_used, role FROM invite_codes WHERE code=?", (code,)))
    if not row or row['is_used']:
        conn.close()
        return None
    role = row['role'] or 'user'
    now = datetime.now()
    _exec(conn,
        "UPDATE invite_codes SET is_used=1, used_by_session_id=?, used_at=? WHERE code=?",
        (session_id, now, code))
    _exec(conn,
        "UPDATE sessions SET invite_verified=1 WHERE session_id=?", (session_id,))
    _exec(conn,
        "INSERT INTO sessions (session_id, invite_verified) VALUES (?, 1) "
        "ON CONFLICT(session_id) DO NOTHING",
        (session_id,))
    conn.commit()
    conn.close()
    return role


def is_invite_verified(session_id: str) -> bool:
    conn = _get_conn()
    row = _one(_exec(conn,
        "SELECT invite_verified FROM sessions WHERE session_id=?", (session_id,)))
    conn.close()
    return bool(row and row['invite_verified'])


def get_invite_codes(limit: int = 50) -> list:
    conn = _get_conn()
    rows = _all(_exec(conn,
        "SELECT code, role, is_used, used_by_session_id, used_at, created_at "
        "FROM invite_codes ORDER BY created_at DESC LIMIT ?",
        (limit,)))
    conn.close()
    return [{
        'code': r['code'], 'role': r['role'] or 'user', 'is_used': bool(r['is_used']),
        'used_by_session_id': r['used_by_session_id'] or '',
        'used_at': r['used_at'] or '', 'created_at': r['created_at'],
    } for r in rows]


# ══════════════════════════════════════════════
# Resume
# ══════════════════════════════════════════════

def save_resume(session_id: str, data: dict):
    create_session(session_id)
    conn = _get_conn()
    cur = _exec(conn, "SELECT id FROM resume_data WHERE session_id=? ORDER BY id DESC LIMIT 1",
                (session_id,))
    existing = _one(cur)
    now = datetime.now()
    if existing:
        _exec(conn, """
            UPDATE resume_data SET name=?, education_background_json=?, skills_json=?,
            work_years=?, certificates_json=?, work_experience_json=?, projects_json=?,
            internships_json=?, confirmed=?, updated_at=? WHERE session_id=?
        """, (data.get('name', ''), json.dumps(data.get('education_background', [])),
              json.dumps(data.get('skills', [])),
              data.get('work_years', 0),
              json.dumps(data.get('certificates', [])),
              json.dumps(data.get('work_experience', [])),
              json.dumps(data.get('projects', [])),
              json.dumps(data.get('internships', [])),
              data.get('confirmed', 0), now, session_id))
    else:
        _exec(conn, """
            INSERT INTO resume_data (session_id, name, education_background_json, skills_json,
            work_years, certificates_json, work_experience_json, projects_json,
            internships_json, raw_text, confirmed, created_at, updated_at)
            VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)
        """, (session_id, data.get('name', ''),
              json.dumps(data.get('education_background', [])),
              json.dumps(data.get('skills', [])),
              data.get('work_years', 0),
              json.dumps(data.get('certificates', [])),
              json.dumps(data.get('work_experience', [])),
              json.dumps(data.get('projects', [])),
              json.dumps(data.get('internships', [])),
              data.get('raw_text', ''), data.get('confirmed', 0), now, now))
    conn.commit()
    conn.close()


def get_resume(session_id: str) -> Optional[dict]:
    conn = _get_conn()
    row = _one(_exec(conn, """
        SELECT * FROM resume_data WHERE session_id=? ORDER BY id DESC LIMIT 1
    """, (session_id,)))
    conn.close()
    if not row:
        return None
    return {
        'name': row['name'],
        'education_background': json.loads(row['education_background_json'] or '[]'),
        'skills': json.loads(row['skills_json'] or '[]'),
        'work_years': row['work_years'],
        'certificates': json.loads(row['certificates_json'] or '[]'),
        'work_experience': json.loads(row['work_experience_json'] or '[]'),
        'projects': json.loads(row['projects_json'] or '[]'),
        'internships': json.loads(row['internships_json'] or '[]'),
        'raw_text': row['raw_text'], 'confirmed': bool(row['confirmed']),
    }


# ══════════════════════════════════════════════
# Conversations
# ══════════════════════════════════════════════

def create_thread(session_id: str, scenario: str, title: str = "新对话",
                  thread_id: str = None) -> str:
    if not thread_id:
        thread_id = str(uuid.uuid4())[:8]
    conn = _get_conn()
    now = datetime.now()
    _exec(conn, """
        INSERT INTO conversation_threads (thread_id, session_id, scenario, title, created_at, updated_at)
        VALUES (?,?,?,?,?,?)
        ON CONFLICT(thread_id) DO UPDATE SET
            session_id = EXCLUDED.session_id, scenario = EXCLUDED.scenario,
            title = EXCLUDED.title, updated_at = EXCLUDED.updated_at
    """, (thread_id, session_id, scenario, title, now, now))
    conn.commit()
    conn.close()
    return thread_id


def update_thread_title(thread_id: str, title: str):
    conn = _get_conn()
    _exec(conn, "UPDATE conversation_threads SET title=?, updated_at=? WHERE thread_id=?",
          (title, datetime.now(), thread_id))
    conn.commit()
    conn.close()


def get_threads(session_id: str, scenario: str) -> list:
    conn = _get_conn()
    rows = _all(_exec(conn, """
        SELECT thread_id, title, created_at FROM conversation_threads
        WHERE session_id=? AND scenario=? ORDER BY updated_at DESC
    """, (session_id, scenario)))
    conn.close()
    return [{'thread_id': r['thread_id'], 'title': r['title'], 'created_at': r['created_at']}
            for r in rows]


def delete_thread(thread_id: str):
    conn = _get_conn()
    _exec(conn, "DELETE FROM conversation_threads WHERE thread_id=?", (thread_id,))
    _exec(conn, "DELETE FROM ai_conversations WHERE thread_id=?", (thread_id,))
    conn.commit()
    conn.close()


def get_thread_titles(session_id: str, scenario: str) -> list:
    conn = _get_conn()
    rows = _all(_exec(conn, """
        SELECT title FROM conversation_threads WHERE session_id=? AND scenario=? AND title!=''
    """, (session_id, scenario)))
    conn.close()
    return [r['title'] for r in rows]


def save_message(session_id: str, scenario: str, role: str, content: str,
                 thread_id: str = ''):
    conn = _get_conn()
    _exec(conn, """
        INSERT INTO ai_conversations (session_id, scenario, thread_id, role, content, created_at)
        VALUES (?,?,?,?,?,?)
    """, (session_id, scenario, thread_id, role, content, datetime.now()))
    conn.commit()
    conn.close()


def get_conversation_history(session_id: str, scenario: str, thread_id: str = '') -> list:
    conn = _get_conn()
    if thread_id:
        cur = _exec(conn, """
            SELECT role, content, created_at FROM ai_conversations
            WHERE session_id=? AND scenario=? AND thread_id=? ORDER BY id ASC
        """, (session_id, scenario, thread_id))
    else:
        cur = _exec(conn, """
            SELECT role, content, created_at FROM ai_conversations
            WHERE session_id=? AND scenario=? ORDER BY id ASC
        """, (session_id, scenario))
    rows = _all(cur)
    conn.close()
    return [{'role': r['role'], 'content': r['content'], 'created_at': r['created_at']}
            for r in rows]


def get_all_messages(session_id: str) -> list:
    conn = _get_conn()
    cur = _exec(conn, """
        SELECT role, content, scenario, thread_id, created_at FROM ai_conversations
        WHERE session_id=? ORDER BY id ASC
    """, (session_id,))
    rows = _all(cur)
    conn.close()
    return [{'role': r['role'], 'content': r['content'],
             'scenario': r['scenario'], 'thread_id': r['thread_id'],
             'created_at': r['created_at']} for r in rows]


# ══════════════════════════════════════════════
# Memory
# ══════════════════════════════════════════════

MEMORY_FIELDS = ['career_interests', 'skills_self_assessment', 'values_field',
                 'current_stage', 'target_position', 'concerns', 'free_notes']


def get_memories(session_id: str) -> Optional[dict]:
    conn = _get_conn()
    row = _one(_exec(conn, "SELECT * FROM ai_memories WHERE session_id=?", (session_id,)))
    conn.close()
    if not row:
        return None
    return {f: (row[f] or '') for f in MEMORY_FIELDS}


def upsert_memories(session_id: str, data: dict, message_id: int = 0):
    conn = _get_conn()
    now = datetime.now()
    _exec(conn, """
        INSERT INTO ai_memories (session_id, career_interests, skills_self_assessment,
        values_field, current_stage, target_position, concerns, free_notes,
        source, last_extracted_message_id, updated_at)
        VALUES (?,?,?,?,?,?,?,?,'auto',?,?)
        ON CONFLICT(session_id) DO UPDATE SET
            career_interests=EXCLUDED.career_interests,
            skills_self_assessment=EXCLUDED.skills_self_assessment,
            values_field=EXCLUDED.values_field,
            current_stage=EXCLUDED.current_stage,
            target_position=EXCLUDED.target_position,
            concerns=EXCLUDED.concerns,
            free_notes=EXCLUDED.free_notes,
            last_extracted_message_id=EXCLUDED.last_extracted_message_id,
            updated_at=EXCLUDED.updated_at
    """, (session_id, data.get('career_interests', ''), data.get('skills_self_assessment', ''),
          data.get('values_field', ''), data.get('current_stage', ''),
          data.get('target_position', ''), data.get('concerns', ''),
          data.get('free_notes', ''), message_id, now))
    conn.commit()
    conn.close()


def update_memory_field(session_id: str, field: str, value: str):
    if field not in MEMORY_FIELDS:
        return
    conn = _get_conn()
    _exec(conn, f"UPDATE ai_memories SET {field}=?, updated_at=? WHERE session_id=?",
          (value, datetime.now(), session_id))
    conn.commit()
    conn.close()


def save_undo_snapshot(session_id: str):
    conn = _get_conn()
    row = _one(_exec(conn, "SELECT * FROM ai_memories WHERE session_id=?", (session_id,)))
    if not row:
        conn.close()
        return
    snapshot = {f: (row[f] or '') for f in MEMORY_FIELDS}
    _exec(conn, "UPDATE ai_memories SET undo_data_json=? WHERE session_id=?",
          (json.dumps(snapshot), session_id))
    conn.commit()
    conn.close()


def undo_last_modify(session_id: str) -> Optional[dict]:
    conn = _get_conn()
    row = _one(_exec(conn, "SELECT undo_data_json FROM ai_memories WHERE session_id=?",
                     (session_id,)))
    if not row or not row['undo_data_json']:
        conn.close()
        return None
    snapshot = json.loads(row['undo_data_json'])
    now = datetime.now()
    _exec(conn, """
        UPDATE ai_memories SET career_interests=?, skills_self_assessment=?, values_field=?,
        current_stage=?, target_position=?, concerns=?, free_notes=?,
        undo_data_json=NULL, updated_at=? WHERE session_id=?
    """, (snapshot.get('career_interests', ''), snapshot.get('skills_self_assessment', ''),
          snapshot.get('values_field', ''), snapshot.get('current_stage', ''),
          snapshot.get('target_position', ''), snapshot.get('concerns', ''),
          snapshot.get('free_notes', ''), now, session_id))
    conn.commit()
    conn.close()
    return snapshot


def clear_memories(session_id: str):
    conn = _get_conn()
    _exec(conn, "DELETE FROM ai_memories WHERE session_id=?", (session_id,))
    conn.commit()
    conn.close()


# ══════════════════════════════════════════════
# Analysis Reports
# ══════════════════════════════════════════════

def save_report(session_id: str, target_position: str, match_score: int,
                skill_gaps: list, recommended_directions: list, roadmap: dict,
                sources: list):
    conn = _get_conn()
    _exec(conn, """
        INSERT INTO analysis_reports (session_id, target_position, match_score,
        skill_gaps_json, recommended_directions_json, roadmap_json, sources_json, created_at)
        VALUES (?,?,?,?,?,?,?,?)
    """, (session_id, target_position, match_score, json.dumps(skill_gaps),
          json.dumps(recommended_directions), json.dumps(roadmap), json.dumps(sources),
          datetime.now()))
    conn.commit()
    conn.close()


def get_reports(session_id: str) -> list:
    conn = _get_conn()
    rows = _all(_exec(conn, """
        SELECT * FROM analysis_reports WHERE session_id=? ORDER BY created_at DESC
    """, (session_id,)))
    conn.close()
    return [{
        'id': r['id'], 'target_position': r['target_position'],
        'match_score': r['match_score'],
        'skill_gaps': json.loads(r['skill_gaps_json'] or '[]'),
        'recommended_directions': json.loads(r['recommended_directions_json'] or '[]'),
        'roadmap': json.loads(r['roadmap_json'] or '{}'),
        'sources': json.loads(r['sources_json'] or '[]'),
        'created_at': r['created_at'],
    } for r in rows]


def get_latest_report(session_id: str) -> Optional[dict]:
    reports = get_reports(session_id)
    return reports[0] if reports else None


def update_report_roadmap(session_id: str, report_id: int, roadmap: dict):
    conn = _get_conn()
    _exec(conn, """
        UPDATE analysis_reports SET roadmap_json=? WHERE id=? AND session_id=?
    """, (json.dumps(roadmap), report_id, session_id))
    conn.commit()
    conn.close()


def get_report_by_id(session_id: str, report_id: int) -> Optional[dict]:
    conn = _get_conn()
    row = _one(_exec(conn, """
        SELECT * FROM analysis_reports WHERE id=? AND session_id=?
    """, (report_id, session_id)))
    conn.close()
    if not row:
        return None
    return {
        'id': row['id'], 'target_position': row['target_position'],
        'match_score': row['match_score'],
        'skill_gaps': json.loads(row['skill_gaps_json'] or '[]'),
        'recommended_directions': json.loads(row['recommended_directions_json'] or '[]'),
        'roadmap': json.loads(row['roadmap_json'] or '{}'),
        'sources': json.loads(row['sources_json'] or '[]'),
        'created_at': row['created_at'],
    }


# ══════════════════════════════════════════════
# 记忆持续更新
# ══════════════════════════════════════════════

def get_new_message_stats(session_id: str) -> tuple:
    conn = _get_conn()
    row = _one(_exec(conn,
        "SELECT last_extracted_message_id FROM ai_memories WHERE session_id=?",
        (session_id,)))
    last_extracted_id = row['last_extracted_message_id'] if row else 0

    row = _one(_exec(conn,
        "SELECT COALESCE(MAX(id), 0) as mx FROM ai_conversations "
        "WHERE session_id=? AND scenario!='onboarding'",
        (session_id,)))
    max_id = row['mx']

    row = _one(_exec(conn,
        "SELECT COUNT(*) as cnt FROM ai_conversations "
        "WHERE session_id=? AND id>? AND scenario!='onboarding'",
        (session_id, last_extracted_id)))
    new_count = row['cnt']
    conn.close()
    return (new_count, last_extracted_id, max_id)


def get_messages_since(session_id: str, since_id: int) -> list:
    conn = _get_conn()
    rows = _all(_exec(conn, """
        SELECT role, content, scenario, thread_id, created_at FROM ai_conversations
        WHERE session_id=? AND id>? AND scenario!='onboarding'
        ORDER BY id ASC
    """, (session_id, since_id)))
    conn.close()
    return [{'role': r['role'], 'content': r['content'],
             'scenario': r['scenario'], 'thread_id': r['thread_id'],
             'created_at': r['created_at']} for r in rows]


CONTEXT_WINDOW = 4


def get_thread_context(session_id: str, since_id: int, messages: list) -> list:
    thread_ids = list(set(m['thread_id'] for m in messages if m.get('thread_id')))
    if not thread_ids:
        return []

    conn = _get_conn()
    context_msgs = []
    for tid in thread_ids:
        rows = _all(_exec(conn, """
            SELECT role, content, scenario, thread_id, created_at FROM ai_conversations
            WHERE session_id=? AND thread_id=? AND id<=? AND scenario!='onboarding'
            ORDER BY id DESC LIMIT ?
        """, (session_id, tid, since_id, CONTEXT_WINDOW)))
        for r in reversed(rows):
            context_msgs.append({
                'role': r['role'], 'content': r['content'],
                'scenario': r['scenario'], 'thread_id': r['thread_id'],
                'created_at': r['created_at'], 'context': True,
            })
    conn.close()
    return context_msgs


EXTRACTION_THRESHOLD = 10


def should_extract_memories(session_id: str) -> bool:
    new_count, _, _ = get_new_message_stats(session_id)
    return new_count >= EXTRACTION_THRESHOLD


init_db()
